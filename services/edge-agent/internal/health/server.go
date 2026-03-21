// Package health provides a lightweight HTTP server for health checks and
// agent status reporting.
package health

import (
	"context"
	"encoding/json"
	"fmt"
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
	statusFn  StatusFunc
	startedAt time.Time
	srv       *http.Server
}

// NewServer creates a Server that calls statusFn to build the /status payload.
func NewServer(port string, statusFn StatusFunc) *Server {
	return &Server{
		port:      port,
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

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	st := s.statusFn()
	st.Uptime = time.Since(s.startedAt).Round(time.Second).String()
	st.StartedAt = s.startedAt

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(st) //nolint:errcheck
}
