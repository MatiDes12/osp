package motion

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"log"
	"net/http"
	"sync"
	"time"

	"gocv.io/x/gocv"
)

// Config holds motion detection configuration
type Config struct {
	Sensitivity     int     // 1-10, higher = more sensitive
	MinArea         float64 // Minimum contour area to trigger motion
	FrameSkip       int     // Process every Nth frame (for performance)
	CooldownSeconds int     // Seconds between motion events
}

// DefaultConfig returns sensible defaults
func DefaultConfig() Config {
	return Config{
		Sensitivity:     5,
		MinArea:         500.0,
		FrameSkip:       3,
		CooldownSeconds: 10,
	}
}

// Detector handles motion detection for a single camera
type Detector struct {
	cameraID        string
	config          Config
	previousFrame   gocv.Mat
	backgroundSub   gocv.BackgroundSubtractorMOG2
	mu              sync.Mutex
	lastMotionTime  time.Time
	snapshotDir     string
	eventCallback   func(EventData)
}

// EventData contains motion event information
type EventData struct {
	CameraID    string    `json:"cameraId"`
	DetectedAt  time.Time `json:"detectedAt"`
	Intensity   int       `json:"intensity"`
	SnapshotURL string    `json:"snapshotUrl"`
	BoundingBox *Rect     `json:"boundingBox,omitempty"`
}

// Rect represents a bounding box
type Rect struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

// NewDetector creates a new motion detector
func NewDetector(cameraID string, config Config, snapshotDir string, callback func(EventData)) *Detector {
	return &Detector{
		cameraID:       cameraID,
		config:         config,
		previousFrame:  gocv.NewMat(),
		backgroundSub:  gocv.NewBackgroundSubtractorMOG2(),
		snapshotDir:    snapshotDir,
		eventCallback:  callback,
	}
}

// ProcessFrame analyzes a frame for motion
func (d *Detector) ProcessFrame(frame gocv.Mat, frameNum int) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	// Skip frames for performance
	if frameNum%d.config.FrameSkip != 0 {
		return nil
	}

	// Check cooldown
	if time.Since(d.lastMotionTime) < time.Duration(d.config.CooldownSeconds)*time.Second {
		return nil
	}

	// Convert to grayscale
	gray := gocv.NewMat()
	defer gray.Close()
	gocv.CvtColor(frame, &gray, gocv.ColorBGRToGray)

	// Apply Gaussian blur to reduce noise
	blurred := gocv.NewMat()
	defer blurred.Close()
	gocv.GaussianBlur(gray, &blurred, image.Pt(21, 21), 0, 0, gocv.BorderDefault)

	// First frame initialization
	if d.previousFrame.Empty() {
		blurred.CopyTo(&d.previousFrame)
		return nil
	}

	// Compute absolute difference
	diff := gocv.NewMat()
	defer diff.Close()
	gocv.AbsDiff(blurred, d.previousFrame, &diff)

	// Update previous frame
	blurred.CopyTo(&d.previousFrame)

	// Threshold
	threshold := gocv.NewMat()
	defer threshold.Close()

	// Sensitivity mapping: 1-10 -> 25-5 (lower threshold = more sensitive)
	thresholdValue := 30 - (d.config.Sensitivity * 2.5)
	gocv.Threshold(diff, &threshold, thresholdValue, 255, gocv.ThresholdBinary)

	// Dilate to fill holes
	kernel := gocv.GetStructuringElement(gocv.MorphRect, image.Pt(5, 5))
	defer kernel.Close()
	dilated := gocv.NewMat()
	defer dilated.Close()
	gocv.Dilate(threshold, &dilated, kernel)

	// Find contours
	contours := gocv.FindContours(dilated, gocv.RetrievalExternal, gocv.ChainApproxSimple)
	defer contours.Close()

	// Check for significant motion
	var largestContour gocv.PointVector
	var largestArea float64
	var motionDetected bool

	for i := 0; i < contours.Size(); i++ {
		contour := contours.At(i)
		area := gocv.ContourArea(contour)

		if area > d.config.MinArea {
			motionDetected = true
			if area > largestArea {
				largestArea = area
				largestContour = contour
			}
		}
	}

	if !motionDetected {
		return nil
	}

	// Motion detected! Calculate intensity and bounding box
	intensity := d.calculateIntensity(largestArea)

	var boundingBox *Rect
	if !largestContour.IsNil() {
		rect := gocv.BoundingRect(largestContour)
		boundingBox = &Rect{
			X:      rect.Min.X,
			Y:      rect.Min.Y,
			Width:  rect.Dx(),
			Height: rect.Dy(),
		}
	}

	// Save snapshot
	snapshotPath, err := d.saveSnapshot(frame)
	if err != nil {
		log.Printf("[motion] Failed to save snapshot for camera %s: %v", d.cameraID, err)
	}

	// Update last motion time
	d.lastMotionTime = time.Now()

	// Trigger callback
	if d.eventCallback != nil {
		eventData := EventData{
			CameraID:    d.cameraID,
			DetectedAt:  time.Now(),
			Intensity:   intensity,
			SnapshotURL: snapshotPath,
			BoundingBox: boundingBox,
		}
		go d.eventCallback(eventData)
	}

	log.Printf("[motion] Motion detected on camera %s (intensity: %d, area: %.0f)",
		d.cameraID, intensity, largestArea)

	return nil
}

// calculateIntensity maps contour area to 0-100 intensity
func (d *Detector) calculateIntensity(area float64) int {
	// Map area to intensity (0-100)
	// MinArea = 500 -> 20, 5000 -> 60, 20000+ -> 100
	intensity := int((area / 200.0))
	if intensity > 100 {
		intensity = 100
	}
	if intensity < 10 {
		intensity = 10
	}
	return intensity
}

// saveSnapshot saves the current frame as JPEG
func (d *Detector) saveSnapshot(frame gocv.Mat) (string, error) {
	timestamp := time.Now().Format("20060102_150405")
	filename := fmt.Sprintf("%s/%s_%s.jpg", d.snapshotDir, d.cameraID, timestamp)

	// Convert to image.Image
	img, err := frame.ToImage()
	if err != nil {
		return "", fmt.Errorf("failed to convert frame: %w", err)
	}

	// Save as JPEG
	buf := new(bytes.Buffer)
	if err := jpeg.Encode(buf, img, &jpeg.Options{Quality: 85}); err != nil {
		return "", fmt.Errorf("failed to encode JPEG: %w", err)
	}

	// In production, upload to R2/S3 here
	// For now, return local path
	return filename, nil
}

// Close releases resources
func (d *Detector) Close() {
	d.mu.Lock()
	defer d.mu.Unlock()

	if !d.previousFrame.Empty() {
		d.previousFrame.Close()
	}
	d.backgroundSub.Close()
}

// MotionService manages motion detection for all cameras
type MotionService struct {
	detectors map[string]*Detector
	mu        sync.RWMutex
	apiURL    string
	apiToken  string
}

// NewMotionService creates a new motion service
func NewMotionService(apiURL, apiToken string) *MotionService {
	return &MotionService{
		detectors: make(map[string]*Detector),
		apiURL:    apiURL,
		apiToken:  apiToken,
	}
}

// RegisterCamera adds a camera for motion detection
func (s *MotionService) RegisterCamera(cameraID string, config Config, snapshotDir string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.detectors[cameraID]; exists {
		return
	}

	detector := NewDetector(cameraID, config, snapshotDir, func(event EventData) {
		s.handleMotionEvent(event)
	})

	s.detectors[cameraID] = detector
	log.Printf("[motion-service] Registered camera %s for motion detection", cameraID)
}

// UnregisterCamera removes a camera
func (s *MotionService) UnregisterCamera(cameraID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if detector, exists := s.detectors[cameraID]; exists {
		detector.Close()
		delete(s.detectors, cameraID)
		log.Printf("[motion-service] Unregistered camera %s", cameraID)
	}
}

// ProcessFrame forwards a frame to the appropriate detector
func (s *MotionService) ProcessFrame(cameraID string, frame gocv.Mat, frameNum int) error {
	s.mu.RLock()
	detector, exists := s.detectors[cameraID]
	s.mu.RUnlock()

	if !exists {
		return fmt.Errorf("camera %s not registered", cameraID)
	}

	return detector.ProcessFrame(frame, frameNum)
}

// handleMotionEvent sends event to API gateway
func (s *MotionService) handleMotionEvent(event EventData) {
	// Create event payload
	payload := map[string]interface{}{
		"cameraId":   event.CameraID,
		"type":       "motion",
		"severity":   s.calculateSeverity(event.Intensity),
		"detectedAt": event.DetectedAt.Format(time.RFC3339),
		"intensity":  event.Intensity,
		"metadata": map[string]interface{}{
			"snapshotUrl":  event.SnapshotURL,
			"boundingBox":  event.BoundingBox,
			"autoDetected": true,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[motion-service] Failed to marshal event: %v", err)
		return
	}

	// Send to API
	req, err := http.NewRequest("POST", s.apiURL+"/api/v1/events", bytes.NewReader(body))
	if err != nil {
		log.Printf("[motion-service] Failed to create request: %v", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[motion-service] Failed to send event: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		log.Printf("[motion-service] API returned status %d for event", resp.StatusCode)
		return
	}

	log.Printf("[motion-service] Motion event created for camera %s", event.CameraID)
}

// calculateSeverity maps intensity to severity level
func (s *MotionService) calculateSeverity(intensity int) string {
	if intensity >= 80 {
		return "high"
	}
	if intensity >= 50 {
		return "medium"
	}
	return "low"
}

// Close stops all detectors
func (s *MotionService) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for id, detector := range s.detectors {
		detector.Close()
		delete(s.detectors, id)
	}
}
