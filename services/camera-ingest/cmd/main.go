package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"camera-ingest/pkg/motion"
	"gocv.io/x/gocv"
)

func main() {
	log.Println("[camera-ingest] Starting motion detection service...")

	// Configuration from environment
	apiURL := getEnv("API_URL", "http://localhost:3000")
	apiToken := getEnv("API_TOKEN", "")
	snapshotDir := getEnv("SNAPSHOT_DIR", "./snapshots")
	go2rtcURL := getEnv("GO2RTC_URL", "http://localhost:1984")

	// Ensure snapshot directory exists
	if err := os.MkdirAll(snapshotDir, 0755); err != nil {
		log.Fatalf("[camera-ingest] Failed to create snapshot directory: %v", err)
	}

	// Initialize motion service
	motionService := motion.NewMotionService(apiURL, apiToken)
	defer motionService.Close()

	// Example: Register cameras for motion detection
	// In production, fetch camera list from API
	cameras := []struct {
		ID     string
		Stream string
	}{
		// These would come from API GET /api/v1/cameras?status=online
		// {ID: "camera-uuid-1", Stream: "rtsp://camera1/stream"},
	}

	// Register each camera
	for _, cam := range cameras {
		config := motion.DefaultConfig()
		config.Sensitivity = 7 // Higher sensitivity
		motionService.RegisterCamera(cam.ID, config, snapshotDir)

		// Start processing stream in background
		go processStream(cam.ID, cam.Stream, motionService)
	}

	// Wait for interrupt
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Println("[camera-ingest] Shutting down...")
}

// processStream reads frames from camera and processes for motion
func processStream(cameraID, streamURL string, service *motion.MotionService) {
	log.Printf("[camera-ingest] Starting stream processing for camera %s", cameraID)

	// Open video stream
	video, err := gocv.OpenVideoCapture(streamURL)
	if err != nil {
		log.Printf("[camera-ingest] Failed to open stream %s: %v", cameraID, err)
		return
	}
	defer video.Close()

	frame := gocv.NewMat()
	defer frame.Close()

	frameNum := 0

	for {
		if ok := video.Read(&frame); !ok {
			log.Printf("[camera-ingest] Stream ended for camera %s", cameraID)
			break
		}

		if frame.Empty() {
			continue
		}

		// Process frame for motion
		if err := service.ProcessFrame(cameraID, frame, frameNum); err != nil {
			log.Printf("[camera-ingest] Error processing frame: %v", err)
		}

		frameNum++

		// Small delay to prevent CPU overload
		time.Sleep(33 * time.Millisecond) // ~30 FPS
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
