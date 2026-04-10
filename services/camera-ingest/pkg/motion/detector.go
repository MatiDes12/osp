package motion

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

// Config holds motion detection configuration
type Config struct {
	Sensitivity     int     // 1-10, higher = more sensitive
	MinArea         float64 // Minimum contour area to trigger motion (unused — kept for API compat)
	FrameSkip       int     // Sample every Nth second (kept for API compat; actual rate is 1fps)
	CooldownSeconds int     // Seconds between motion events
}

// DefaultConfig returns sensible defaults
func DefaultConfig() Config {
	return Config{
		Sensitivity:     5,
		MinArea:         500.0,
		FrameSkip:       1,
		CooldownSeconds: 10,
	}
}

// rgbaPixels is a decoded frame stored as flat RGBA bytes.
type rgbaPixels struct {
	data   []uint8
	width  int
	height int
}

// Detector handles motion detection for a single camera using pure Go JPEG pixel diff.
type Detector struct {
	cameraID      string
	config        Config
	previous      *rgbaPixels
	mu            sync.Mutex
	lastMotionAt  time.Time
	snapshotDir   string
	eventCallback func(EventData)
}

// EventData contains motion event information
type EventData struct {
	CameraID      string    `json:"cameraId"`
	DetectedAt    time.Time `json:"detectedAt"`
	Intensity     int       `json:"intensity"`
	SnapshotURL   string    `json:"snapshotUrl"`
	SnapshotBytes []byte    `json:"-"` // raw JPEG — uploaded by MotionService, not serialised
	BoundingBox   *Rect     `json:"boundingBox,omitempty"`
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
		cameraID:      cameraID,
		config:        config,
		snapshotDir:   snapshotDir,
		eventCallback: callback,
	}
}

// ProcessJPEG analyzes a JPEG frame for motion.
func (d *Detector) ProcessJPEG(jpegData []byte) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	// Decode JPEG to RGBA
	img, err := jpeg.Decode(bytes.NewReader(jpegData))
	if err != nil {
		return fmt.Errorf("jpeg decode: %w", err)
	}

	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	frame := &rgbaPixels{
		data:   make([]uint8, w*h*4),
		width:  w,
		height: h,
	}
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			r, g, b, a := img.At(bounds.Min.X+x, bounds.Min.Y+y).RGBA()
			i := (y*w + x) * 4
			frame.data[i] = uint8(r >> 8)
			frame.data[i+1] = uint8(g >> 8)
			frame.data[i+2] = uint8(b >> 8)
			frame.data[i+3] = uint8(a >> 8)
		}
	}

	prev := d.previous
	d.previous = frame

	if prev == nil || prev.width != w || prev.height != h {
		return nil // first frame or resolution changed
	}

	// Respect cooldown
	if time.Since(d.lastMotionAt) < time.Duration(d.config.CooldownSeconds)*time.Second {
		return nil
	}

	diffRatio := computeDiffRatio(prev, frame)
	threshold := diffThreshold(d.config.Sensitivity)

	if diffRatio < threshold {
		return nil
	}

	d.lastMotionAt = time.Now()
	intensity := intensityFromRatio(diffRatio)

	// Save snapshot to disk. Store the local path on EventData so the event
	// handler can include it as snapshotUrl without round-tripping through the
	// gateway (which would produce a huge data: URI stored in every event row).
	var snapshotBytes []byte
	snapshotLocalPath := ""
	if d.snapshotDir != "" {
		fname := fmt.Sprintf("%s/%s_%d.jpg", d.snapshotDir, d.cameraID, time.Now().UnixMilli())
		if err := os.WriteFile(fname, jpegData, 0644); err == nil {
			snapshotBytes = jpegData
			snapshotLocalPath = fname
		} else {
			log.Printf("[motion] snapshot write error camera=%s: %v", d.cameraID, err)
		}
	}

	if d.eventCallback != nil {
		go d.eventCallback(EventData{
			CameraID:      d.cameraID,
			DetectedAt:    time.Now(),
			Intensity:     intensity,
			SnapshotURL:   snapshotLocalPath,
			SnapshotBytes: snapshotBytes,
		})
	}

	log.Printf("[motion] Motion detected camera=%s diffRatio=%.4f intensity=%d", d.cameraID, diffRatio, intensity)
	return nil
}

// Close releases resources (no-op — kept for API compat)
func (d *Detector) Close() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.previous = nil
}

// computeDiffRatio returns the fraction of pixels that changed by more than a fixed threshold.
func computeDiffRatio(a, b *rgbaPixels) float64 {
	if len(a.data) != len(b.data) {
		return 0
	}
	const pixelThreshold = 24
	changed := 0
	total := a.width * a.height
	for i := 0; i < len(a.data); i += 4 {
		dr := absDiff(a.data[i], b.data[i])
		dg := absDiff(a.data[i+1], b.data[i+1])
		db := absDiff(a.data[i+2], b.data[i+2])
		if int(dr)+int(dg)+int(db) > pixelThreshold*3 {
			changed++
		}
	}
	if total == 0 {
		return 0
	}
	return float64(changed) / float64(total)
}

// diffThreshold maps sensitivity 1-10 to a pixel-diff ratio threshold (higher sensitivity = lower threshold).
func diffThreshold(sensitivity int) float64 {
	// sensitivity 1 -> 0.05, sensitivity 10 -> 0.005
	if sensitivity < 1 {
		sensitivity = 1
	}
	if sensitivity > 10 {
		sensitivity = 10
	}
	return 0.055 - float64(sensitivity)*0.005
}

func intensityFromRatio(ratio float64) int {
	v := int(ratio * 1000)
	if v > 100 {
		v = 100
	}
	if v < 10 {
		v = 10
	}
	return v
}

func absDiff(a, b uint8) uint8 {
	if a > b {
		return a - b
	}
	return b - a
}

// ─── MotionService ────────────────────────────────────────────────────────────

// pendingEvent is an event payload that failed to POST and is queued for retry.
type pendingEvent struct {
	Payload  map[string]interface{} `json:"payload"`
	QueuedAt time.Time              `json:"queuedAt"`
}

// MotionService manages motion detection for all cameras by polling go2rtc frame API.
type MotionService struct {
	detectors map[string]*Detector
	mu        sync.RWMutex
	apiURL    string
	apiToken  string
	tenantID  string
	go2rtcURL string
	cancel    context.CancelFunc

	// Offline retry queue — events that failed to POST are written here.
	queueFile string
	queueMu   sync.Mutex
}

// NewMotionService creates a new motion service
func NewMotionService(apiURL, apiToken, tenantID, go2rtcURL string) *MotionService {
	return &MotionService{
		detectors: make(map[string]*Detector),
		apiURL:    apiURL,
		apiToken:  apiToken,
		tenantID:  tenantID,
		go2rtcURL: go2rtcURL,
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
	log.Printf("[motion-service] Registered camera %s", cameraID)
}

// UnregisterCamera removes a camera
func (s *MotionService) UnregisterCamera(cameraID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if d, exists := s.detectors[cameraID]; exists {
		d.Close()
		delete(s.detectors, cameraID)
	}
}

// StartPolling begins the 1fps frame sampling loop for all registered cameras.
func (s *MotionService) StartPolling(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	client := &http.Client{Timeout: 8 * time.Second}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.mu.RLock()
			ids := make([]string, 0, len(s.detectors))
			for id := range s.detectors {
				ids = append(ids, id)
			}
			detectors := make(map[string]*Detector, len(s.detectors))
			for id, d := range s.detectors {
				detectors[id] = d
			}
			s.mu.RUnlock()

			for _, cameraID := range ids {
				d := detectors[cameraID]
				go s.sampleCamera(client, cameraID, d)
			}
		}
	}
}

func (s *MotionService) sampleCamera(client *http.Client, cameraID string, d *Detector) {
	url := fmt.Sprintf("%s/api/frame.jpeg?src=%s", s.go2rtcURL, cameraID)
	resp, err := client.Get(url)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil || len(data) == 0 {
		return
	}
	if err := d.ProcessJPEG(data); err != nil {
		log.Printf("[motion-service] frame error camera=%s: %v", cameraID, err)
	}
}

// handleMotionEvent uploads snapshot to update camera's last_snapshot_url,
// then posts the motion event to the API gateway.
// The snapshotUrl stored in the event uses the local:// scheme so the Tauri
// desktop client can render it without a large data: URI in the DB.
func (s *MotionService) handleMotionEvent(event EventData) {
	client := &http.Client{Timeout: 10 * time.Second}

	// Use the local file path as the snapshot URL (prefixed with "local://")
	// so the frontend can load it via the Tauri asset protocol.
	snapshotURL := ""
	if event.SnapshotURL != "" {
		snapshotURL = "local://" + event.SnapshotURL
	}

	// Upload raw JPEG bytes to the gateway so it can update camera.last_snapshot_url.
	// We ignore the returned URL — we already have the local path above.
	if len(event.SnapshotBytes) > 0 {
		snapURL := fmt.Sprintf("%s/api/v1/cameras/%s/snapshot", s.apiURL, event.CameraID)
		snapReq, err := http.NewRequest("POST", snapURL, bytes.NewReader(event.SnapshotBytes))
		if err == nil {
			snapReq.Header.Set("Content-Type", "image/jpeg")
			snapReq.Header.Set("Authorization", "Bearer "+s.apiToken)
			if s.tenantID != "" {
				snapReq.Header.Set("X-Tenant-Id", s.tenantID)
			}
			snapResp, err := client.Do(snapReq)
			if err == nil {
				snapResp.Body.Close()
				if snapResp.StatusCode != http.StatusOK && snapResp.StatusCode != http.StatusCreated {
					log.Printf("[motion-service] snapshot upload returned %d", snapResp.StatusCode)
				}
			}
		}
	}

	payload := map[string]interface{}{
		"cameraId": event.CameraID,
		"type":     "motion",
		"severity": calculateSeverity(event.Intensity),
		"intensity": event.Intensity,
		"metadata": map[string]interface{}{
			"autoDetected": true,
			"source":       "camera-ingest-motion-worker",
		},
	}
	// Only include snapshotUrl when we actually have one — an empty string
	// would fail the gateway's Zod validation.
	if snapshotURL != "" {
		payload["snapshotUrl"] = snapshotURL
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[motion-service] marshal error: %v", err)
		return
	}

	req, err := http.NewRequest("POST", s.apiURL+"/api/v1/events", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiToken)
	if s.tenantID != "" {
		req.Header.Set("X-Tenant-Id", s.tenantID)
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[motion-service] event post error (queuing for retry): %v", err)
		s.queueEvent(payload)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("[motion-service] API returned %d for motion event: %s", resp.StatusCode, string(b))
		// Queue for retry only on server errors (5xx), not client errors (4xx)
		if resp.StatusCode >= 500 {
			s.queueEvent(payload)
		}
	}
}

// SetQueueFile sets the path of the JSONL file used to persist failed events
// across restarts. Must be called before StartRetryQueue.
func (s *MotionService) SetQueueFile(path string) {
	s.queueMu.Lock()
	defer s.queueMu.Unlock()
	s.queueFile = path
}

// queueEvent appends a failed event payload to the retry queue file.
func (s *MotionService) queueEvent(payload map[string]interface{}) {
	s.queueMu.Lock()
	defer s.queueMu.Unlock()
	if s.queueFile == "" {
		return
	}
	entry := pendingEvent{Payload: payload, QueuedAt: time.Now()}
	line, err := json.Marshal(entry)
	if err != nil {
		return
	}
	f, err := os.OpenFile(s.queueFile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(line, '\n'))
}

// drainQueue reads the queue file, attempts to POST each event, and rewrites
// the file with only the events that still failed.
func (s *MotionService) drainQueue() {
	s.queueMu.Lock()
	defer s.queueMu.Unlock()

	if s.queueFile == "" {
		return
	}

	f, err := os.Open(s.queueFile)
	if err != nil {
		return // file doesn't exist yet — nothing to drain
	}

	var pending []pendingEvent
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var entry pendingEvent
		if json.Unmarshal(line, &entry) == nil {
			pending = append(pending, entry)
		}
	}
	f.Close()

	if len(pending) == 0 {
		_ = os.Remove(s.queueFile)
		return
	}

	client := &http.Client{Timeout: 10 * time.Second}
	var stillFailed []pendingEvent

	for _, entry := range pending {
		body, err := json.Marshal(entry.Payload)
		if err != nil {
			continue // malformed — drop it
		}
		req, err := http.NewRequest("POST", s.apiURL+"/api/v1/events", bytes.NewReader(body))
		if err != nil {
			stillFailed = append(stillFailed, entry)
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+s.apiToken)
		if s.tenantID != "" {
			req.Header.Set("X-Tenant-Id", s.tenantID)
		}
		resp, err := client.Do(req)
		if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
			if resp != nil {
				resp.Body.Close()
			}
			stillFailed = append(stillFailed, entry)
			continue
		}
		resp.Body.Close()
		log.Printf("[motion-service] queued event replayed successfully (queued at %s)", entry.QueuedAt.Format(time.RFC3339))
	}

	if len(stillFailed) == 0 {
		_ = os.Remove(s.queueFile)
		return
	}

	// Rewrite queue with only the events that still failed
	tmp := s.queueFile + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return
	}
	for _, entry := range stillFailed {
		line, err := json.Marshal(entry)
		if err == nil {
			_, _ = out.Write(append(line, '\n'))
		}
	}
	out.Close()
	_ = os.Rename(tmp, s.queueFile)
}

// StartRetryQueue runs a background loop that drains the event retry queue
// every 60 seconds. Call in a goroutine: go service.StartRetryQueue(ctx).
func (s *MotionService) StartRetryQueue(ctx context.Context) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.drainQueue()
		}
	}
}

// Close stops all detectors
func (s *MotionService) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, d := range s.detectors {
		d.Close()
	}
	s.detectors = make(map[string]*Detector)
}

func calculateSeverity(intensity int) string {
	if intensity >= 80 {
		return "high"
	}
	if intensity >= 50 {
		return "medium"
	}
	return "low"
}

// decodeImage is kept for compatibility but unused directly.
func decodeImage(data []byte) (image.Image, error) {
	return jpeg.Decode(bytes.NewReader(data))
}
