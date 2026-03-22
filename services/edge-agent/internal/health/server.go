// Package health provides a lightweight HTTP server for health checks and
// agent status reporting.
package health

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"time"
)

// Status is the payload returned by GET /status.
type Status struct {
	AgentID       string    `json:"agentId"`
	AgentName     string    `json:"agentName"`
	Version       string    `json:"version"`
	Status        string    `json:"status"`
	CloudOnline   bool      `json:"cloudOnline"`
	CamerasActive int       `json:"camerasActive"`
	PendingEvents int       `json:"pendingEvents"`
	SyncedEvents  int       `json:"syncedEvents"`
	Uptime        string    `json:"uptime"`
	StartedAt     time.Time `json:"startedAt"`
}

// StatusFunc is called by the server to build a Status snapshot.
type StatusFunc func() Status

// Server is the HTTP health/status server.
type Server struct {
	port      string
	go2rtcURL string
	statusFn  StatusFunc
	startedAt time.Time
	srv       *http.Server
}

// NewServer creates a Server that calls statusFn to build the /status payload.
func NewServer(port string, go2rtcURL string, statusFn StatusFunc) *Server {
	return &Server{
		port:      port,
		go2rtcURL: go2rtcURL,
		statusFn:  statusFn,
		startedAt: time.Now(),
	}
}

// Start begins listening. Returns immediately; the server runs in a goroutine.
// The server shuts down when ctx is cancelled.
func (s *Server) Start(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/status", s.handleStatus)
	mux.HandleFunc("/streams/test", s.handleStreamTest)

	s.srv = &http.Server{
		Addr:    fmt.Sprintf(":%s", s.port),
		Handler: mux,
	}

	ln, err := net.Listen("tcp", s.srv.Addr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", s.srv.Addr, err)
	}

	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.srv.Shutdown(shutCtx) //nolint:errcheck
	}()

	go func() {
		if err := s.srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			slog.Error("health server error", "error", err)
		}
	}()

	slog.Info("health server started", "port", s.port)
	return nil
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"}) //nolint:errcheck
}

func (s *Server) handleStreamTest(w http.ResponseWriter, r *http.Request) {
	// Allow browser to call this endpoint directly from any origin
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		ConnectionURI string `json:"connectionUri"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ConnectionURI == "" {
		http.Error(w, `{"error":"connectionUri is required"}`, http.StatusBadRequest)
		return
	}

	go2rtcURL := s.go2rtcURL
	if go2rtcURL == "" {
		go2rtcURL = "http://localhost:1984"
	}

	streamName := fmt.Sprintf("__test_%d", time.Now().UnixNano())
	addURL := fmt.Sprintf("%s/api/streams?name=%s&src=%s", go2rtcURL,
		urlEncode(streamName), urlEncode(body.ConnectionURI))

	client := &http.Client{Timeout: 10 * time.Second}
	addReq, _ := http.NewRequestWithContext(r.Context(), "PUT", addURL, nil)
	addRes, err := client.Do(addReq)
	if err != nil || addRes.StatusCode >= 300 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{"error": "could not reach go2rtc"}) //nolint:errcheck
		return
	}
	addRes.Body.Close()

	// Wait for stream to connect (up to 5s)
	connected := false
	for i := 0; i < 10; i++ {
		time.Sleep(500 * time.Millisecond)
		statusRes, err := client.Get(fmt.Sprintf("%s/api/streams?src=%s", go2rtcURL, urlEncode(streamName)))
		if err == nil && statusRes.StatusCode == 200 {
			io.ReadAll(statusRes.Body) //nolint:errcheck
			statusRes.Body.Close()
			connected = true
			break
		}
	}

	// Cleanup test stream
	defer func() {
		delReq, _ := http.NewRequest("DELETE", fmt.Sprintf("%s/api/streams?src=%s", go2rtcURL, urlEncode(streamName)), nil)
		client.Do(delReq) //nolint:errcheck
	}()

	w.Header().Set("Content-Type", "application/json")
	if !connected {
		w.WriteHeader(http.StatusGatewayTimeout)
		json.NewEncoder(w).Encode(map[string]string{"error": "stream did not connect within 5 seconds"}) //nolint:errcheck
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "connected": true}) //nolint:errcheck
}

func urlEncode(s string) string {
	encoded := ""
	for _, c := range s {
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9',
			c == '-', c == '_', c == '.', c == '~':
			encoded += string(c)
		default:
			encoded += fmt.Sprintf("%%%02X", c)
		}
	}
	return encoded
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	st := s.statusFn()
	st.Uptime = time.Since(s.startedAt).Round(time.Second).String()
	st.StartedAt = s.startedAt

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(st) //nolint:errcheck
}
