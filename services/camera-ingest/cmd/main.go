package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/MatiDes12/osp/services/camera-ingest/pkg/motion"
)

type CameraRow struct {
	ID            string `json:"id"`
	ConnectionURI string `json:"connection_uri"`
	Protocol      string `json:"protocol"`
	Status        string `json:"status"`
	Config        any    `json:"config"`
}

type SuccessResponse[T any] struct {
	Success bool `json:"success"`
	Data    T    `json:"data"`
	Error   any  `json:"error"`
	Meta    any  `json:"meta"`
}

func main() {
	log.Println("[camera-ingest] Starting motion detection service...")

	apiURL := getEnv("GATEWAY_URL", getEnv("API_URL", "http://localhost:3000"))
	apiToken := getEnv("API_TOKEN", "")
	tenantID := getEnv("TENANT_ID", "")
	snapshotDir := getEnv("SNAPSHOT_DIR", "./snapshots")
	go2rtcURL := getEnv("GO2RTC_API_URL", getEnv("GO2RTC_URL", "http://localhost:1984"))
	reconcileInterval := 30 * time.Second

	if err := os.MkdirAll(snapshotDir, 0755); err != nil {
		log.Fatalf("[camera-ingest] Failed to create snapshot directory: %v", err)
	}

	motionService := motion.NewMotionService(apiURL, apiToken, go2rtcURL)
	defer motionService.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Register this agent with the gateway and start heartbeat loop
	agentID := getEnv("AGENT_ID", getHostname())
	if tenantID != "" {
		registerAgent(apiURL, apiToken, tenantID, agentID)
		go heartbeatLoop(ctx, apiURL, apiToken, tenantID, agentID)
	} else {
		log.Println("[camera-ingest] TENANT_ID not set; skipping agent registration")
	}

	// Start the polling loop in the background
	go motionService.StartPolling(ctx)

	registered := make(map[string]bool)
	reconcile := func() {
		cameras := fetchCameras(apiURL, apiToken, tenantID)
		for _, cam := range cameras {
			if cam.ID == "" {
				continue
			}
			// Push stream to go2rtc so it can be viewed/recorded
			if cam.ConnectionURI != "" {
				if err := registerGo2rtcStream(go2rtcURL, cam.ID, cam.ConnectionURI); err != nil {
					log.Printf("[camera-ingest] go2rtc register error camera=%s: %v", cam.ID, err)
				}
			}
			// Register for motion detection (only once per camera)
			if !registered[cam.ID] {
				config := motion.DefaultConfig()
				config.CooldownSeconds = 10
				motionService.RegisterCamera(cam.ID, config, snapshotDir)
				registered[cam.ID] = true
			}
		}
	}

	reconcile()
	ticker := time.NewTicker(reconcileInterval)
	defer ticker.Stop()
	go func() {
		for range ticker.C {
			reconcile()
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Println("[camera-ingest] Shutting down...")
}

func getHostname() string {
	h, err := os.Hostname()
	if err != nil {
		return "osp-agent"
	}
	return h
}

func registerAgent(apiURL, apiToken, tenantID, agentID string) {
	body, _ := json.Marshal(map[string]string{
		"agentId": agentID,
		"name":    "OSP Agent (" + agentID + ")",
		"version": "1.0.0",
	})
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest(http.MethodPost, apiURL+"/api/v1/edge/agents/register", bytes.NewReader(body))
	if err != nil {
		log.Printf("[camera-ingest] register build error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-Id", tenantID)
	if apiToken != "" {
		req.Header.Set("Authorization", "Bearer "+apiToken)
	}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[camera-ingest] register error: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode == 200 || resp.StatusCode == 201 {
		log.Printf("[camera-ingest] agent registered (id=%s)", agentID)
	} else {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("[camera-ingest] register returned %d: %s", resp.StatusCode, string(b))
	}
}

func heartbeatLoop(ctx context.Context, apiURL, apiToken, tenantID, agentID string) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sendHeartbeat(apiURL, apiToken, tenantID, agentID)
		}
	}
}

func sendHeartbeat(apiURL, apiToken, tenantID, agentID string) {
	body, _ := json.Marshal(map[string]interface{}{
		"status":        "online",
		"pendingEvents": 0,
		"syncedEvents":  0,
		"camerasActive": 0,
	})
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodPost, apiURL+"/api/v1/edge/agents/"+agentID+"/heartbeat", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-Id", tenantID)
	if apiToken != "" {
		req.Header.Set("Authorization", "Bearer "+apiToken)
	}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[camera-ingest] heartbeat error: %v", err)
		return
	}
	resp.Body.Close()
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// fetchCameras fetches all cameras for the tenant using the user JWT.
func fetchCameras(apiURL, apiToken, tenantID string) []CameraRow {
	if apiToken == "" {
		log.Printf("[camera-ingest] API_TOKEN not set; skipping camera fetch")
		return nil
	}
	log.Printf("[camera-ingest] fetching cameras from %s (tenant=%s)", apiURL, tenantID)

	client := &http.Client{Timeout: 15 * time.Second}
	// Request up to 100 cameras regardless of status so that cameras in
	// "error" state still get registered in go2rtc (which may clear the error).
	endpoint := apiURL + "/api/v1/cameras?limit=100"
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		log.Printf("[camera-ingest] request build error: %v", err)
		return nil
	}
	req.Header.Set("Authorization", "Bearer "+apiToken)
	if tenantID != "" {
		req.Header.Set("X-Tenant-Id", tenantID)
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[camera-ingest] fetch cameras error: %v", err)
		return nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("[camera-ingest] cameras endpoint returned %d: %s", resp.StatusCode, string(body))
		return nil
	}

	var parsed SuccessResponse[[]CameraRow]
	if err := json.Unmarshal(body, &parsed); err != nil {
		log.Printf("[camera-ingest] parse cameras error: %v", err)
		return nil
	}
	if !parsed.Success {
		return nil
	}
	log.Printf("[camera-ingest] fetched %d cameras", len(parsed.Data))
	return parsed.Data
}

// registerGo2rtcStream adds or updates a stream in the local go2rtc instance.
// go2rtc API: PUT /api/streams?name=<id>&src=<uri>
func registerGo2rtcStream(go2rtcURL, cameraID, connectionURI string) error {
	params := url.Values{}
	params.Set("name", cameraID)
	params.Set("src", connectionURI)
	endpoint := fmt.Sprintf("%s/api/streams?%s", go2rtcURL, params.Encode())

	req, err := http.NewRequest(http.MethodPut, endpoint, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("PUT /api/streams: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("go2rtc returned %d: %s", resp.StatusCode, string(b))
	}

	log.Printf("[camera-ingest] registered stream in go2rtc: camera=%s", cameraID)
	return nil
}
