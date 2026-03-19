package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"net/http"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"camera-ingest/pkg/motion"
	"gocv.io/x/gocv"
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

	// Configuration from environment
	apiURL := getEnv("API_URL", "http://localhost:3000")
	apiToken := getEnv("API_TOKEN", "")
	snapshotDir := getEnv("SNAPSHOT_DIR", "./snapshots")
	go2rtcURL := getEnv("GO2RTC_API_URL", getEnv("GO2RTC_URL", "http://localhost:1984"))
	reconcileInterval := 30 * time.Second

	// Ensure snapshot directory exists
	if err := os.MkdirAll(snapshotDir, 0755); err != nil {
		log.Fatalf("[camera-ingest] Failed to create snapshot directory: %v", err)
	}

	// Initialize motion service
	motionService := motion.NewMotionService(apiURL, apiToken)
	defer motionService.Close()

	launched := newLaunchedCameras()
	reconcile := func() {
		cameras := fetchOnlineCameras(apiURL, apiToken)
		for _, cam := range cameras {
			if cam.ID == "" {
				continue
			}
			if launched.isRunning(cam.ID) {
				continue
			}

			config := motion.DefaultConfig()
			// The capture loop runs ~30fps; FrameSkip=30 approximates 1fps sampling.
			config.FrameSkip = 30
			config.CooldownSeconds = 10
			motionService.RegisterCamera(cam.ID, config, snapshotDir)

			// Prefer go2rtc stream id, but fallback to camera URI if go2rtc MP4 fails.
			streamCandidates := []string{
				buildGo2RTCStreamURL(go2rtcURL, cam.ID),
				cam.ConnectionURI,
			}
			launched.setRunning(cam.ID, true)
			go processStreamWithRetry(cam.ID, streamCandidates, motionService, launched)
		}
	}

	// Initial camera registration + periodic reconciliation
	reconcile()
	ticker := time.NewTicker(reconcileInterval)
	defer ticker.Stop()
	go func() {
		for range ticker.C {
			reconcile()
		}
	}()

	// Wait for interrupt
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Println("[camera-ingest] Shutting down...")
}

func processStreamWithRetry(
	cameraID string,
	streamCandidates []string,
	service *motion.MotionService,
	launched *launchedCameras,
) {
	log.Printf("[camera-ingest] Starting stream processing for camera %s", cameraID)
	defer launched.setRunning(cameraID, false)

	for {
		streamURL := firstAvailableStream(cameraID, streamCandidates)
		if streamURL == "" {
			time.Sleep(5 * time.Second)
			continue
		}

		video, err := gocv.OpenVideoCapture(streamURL)
		if err != nil {
			log.Printf("[camera-ingest] Failed to open stream %s: %v", cameraID, err)
			time.Sleep(5 * time.Second)
			continue
		}

		frame := gocv.NewMat()
		frameNum := 0
		for {
			if ok := video.Read(&frame); !ok {
				log.Printf("[camera-ingest] Stream ended for camera %s", cameraID)
				break
			}
			if frame.Empty() {
				continue
			}

			if err := service.ProcessFrame(cameraID, frame, frameNum); err != nil {
				log.Printf("[camera-ingest] Error processing frame: %v", err)
			}
			frameNum++
			time.Sleep(33 * time.Millisecond) // ~30 FPS
		}

		frame.Close()
		video.Close()
		time.Sleep(3 * time.Second)
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func fetchOnlineCameras(apiURL, apiToken string) []CameraRow {
	if apiToken == "" {
		log.Printf("[camera-ingest] API_TOKEN not set; no cameras will be registered")
		return []CameraRow{}
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest(
		http.MethodGet,
		apiURL+"/api/v1/cameras/internal/online",
		nil,
	)
	if err != nil {
		log.Printf("[camera-ingest] Failed to build cameras request: %v", err)
		return []CameraRow{}
	}
	req.Header.Set("X-Internal-Token", apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[camera-ingest] Failed to fetch cameras: %v", err)
		return []CameraRow{}
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("[camera-ingest] Cameras request returned %d", resp.StatusCode)
		return []CameraRow{}
	}

	var parsed SuccessResponse[[]CameraRow]
	if err := json.Unmarshal(body, &parsed); err != nil {
		log.Printf("[camera-ingest] Failed to parse cameras response: %v", err)
		return []CameraRow{}
	}
	if !parsed.Success {
		return []CameraRow{}
	}
	return parsed.Data
}

func buildGo2RTCStreamURL(go2rtcURL, cameraID string) string {
	return fmt.Sprintf(
		"%s/api/stream.mp4?src=%s",
		go2rtcURL,
		url.QueryEscape(cameraID),
	)
}

func firstAvailableStream(cameraID string, candidates []string) string {
	for _, streamURL := range candidates {
		if streamURL != "" {
			return streamURL
		}
	}
	log.Printf("[camera-ingest] no stream candidates for camera %s", cameraID)
	return ""
}

type launchedCameras struct {
	mu      sync.RWMutex
	running map[string]bool
}

func newLaunchedCameras() *launchedCameras {
	return &launchedCameras{
		running: make(map[string]bool),
	}
}

func (l *launchedCameras) isRunning(cameraID string) bool {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.running[cameraID]
}

func (l *launchedCameras) setRunning(cameraID string, running bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.running[cameraID] = running
}
