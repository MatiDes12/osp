package main

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
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

	apiURL := getEnv("API_URL", "http://localhost:3000")
	apiToken := getEnv("API_TOKEN", "")
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

	// Start the polling loop in the background
	go motionService.StartPolling(ctx)

	registered := make(map[string]bool)
	reconcile := func() {
		cameras := fetchOnlineCameras(apiURL, apiToken)
		for _, cam := range cameras {
			if cam.ID == "" || registered[cam.ID] {
				continue
			}
			config := motion.DefaultConfig()
			config.CooldownSeconds = 10
			motionService.RegisterCamera(cam.ID, config, snapshotDir)
			registered[cam.ID] = true
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

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func fetchOnlineCameras(apiURL, apiToken string) []CameraRow {
	if apiToken == "" {
		log.Printf("[camera-ingest] API_TOKEN not set; skipping camera fetch")
		return nil
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest(http.MethodGet, apiURL+"/api/v1/cameras/internal/online", nil)
	if err != nil {
		log.Printf("[camera-ingest] request build error: %v", err)
		return nil
	}
	req.Header.Set("X-Internal-Token", apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[camera-ingest] fetch cameras error: %v", err)
		return nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("[camera-ingest] cameras endpoint returned %d", resp.StatusCode)
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
	return parsed.Data
}
