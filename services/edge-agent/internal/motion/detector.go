// Package motion provides local motion detection via JPEG pixel-diff analysis.
// Frames are sampled at 1 fps from a go2rtc instance; detected events are
// delivered via a callback so the caller decides where to store/route them.
package motion

import (
	"bytes"
	"context"
	"fmt"
	"image/jpeg"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// Config holds motion detection tuning parameters.
type Config struct {
	Sensitivity    int // 1-10, higher = more sensitive
	CooldownSeconds int
}

// DefaultConfig returns sensible defaults.
func DefaultConfig() Config {
	return Config{Sensitivity: 5, CooldownSeconds: 10}
}

// EventData is passed to the callback when motion is detected.
type EventData struct {
	CameraID   string
	DetectedAt time.Time
	Intensity  int // 0-100
}

// rgbaPixels is a decoded frame stored as flat RGBA bytes.
type rgbaPixels struct {
	data   []uint8
	width  int
	height int
}

// detector handles motion for a single camera using pure-Go JPEG pixel diff.
type detector struct {
	cameraID     string
	cfg          Config
	previous     *rgbaPixels
	mu           sync.Mutex
	lastMotionAt time.Time
	callback     func(EventData)
}

func newDetector(cameraID string, cfg Config, cb func(EventData)) *detector {
	return &detector{cameraID: cameraID, cfg: cfg, callback: cb}
}

func (d *detector) processJPEG(data []byte) {
	d.mu.Lock()
	defer d.mu.Unlock()

	img, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		return
	}
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	frame := &rgbaPixels{data: make([]uint8, w*h*4), width: w, height: h}
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
		return // first frame or resolution changed
	}
	if time.Since(d.lastMotionAt) < time.Duration(d.cfg.CooldownSeconds)*time.Second {
		return
	}

	ratio := diffRatio(prev, frame)
	if ratio < threshold(d.cfg.Sensitivity) {
		return
	}

	d.lastMotionAt = time.Now()
	intensity := int(ratio * 1000)
	if intensity > 100 {
		intensity = 100
	}
	if intensity < 10 {
		intensity = 10
	}

	if d.callback != nil {
		go d.callback(EventData{
			CameraID:   d.cameraID,
			DetectedAt: time.Now(),
			Intensity:  intensity,
		})
	}
}

func diffRatio(a, b *rgbaPixels) float64 {
	if len(a.data) != len(b.data) {
		return 0
	}
	const px = 24
	changed := 0
	for i := 0; i < len(a.data); i += 4 {
		dr := absDiff(a.data[i], b.data[i])
		dg := absDiff(a.data[i+1], b.data[i+1])
		db := absDiff(a.data[i+2], b.data[i+2])
		if int(dr)+int(dg)+int(db) > px*3 {
			changed++
		}
	}
	total := a.width * a.height
	if total == 0 {
		return 0
	}
	return float64(changed) / float64(total)
}

func threshold(sensitivity int) float64 {
	if sensitivity < 1 {
		sensitivity = 1
	}
	if sensitivity > 10 {
		sensitivity = 10
	}
	return 0.055 - float64(sensitivity)*0.005
}

func absDiff(a, b uint8) uint8 {
	if a > b {
		return a - b
	}
	return b - a
}

// ─── Service ─────────────────────────────────────────────────────────────────

// Service manages motion detection across multiple cameras.
type Service struct {
	detectors map[string]*detector
	mu        sync.RWMutex
	go2rtcURL string
	callback  func(EventData)
}

// NewMotionService creates a motion service.
// callback is called (in a goroutine) whenever motion is detected.
func NewMotionService(go2rtcURL string, callback func(EventData)) *Service {
	return &Service{
		detectors: make(map[string]*detector),
		go2rtcURL: go2rtcURL,
		callback:  callback,
	}
}

// RegisterCamera adds a camera for motion detection.
func (s *Service) RegisterCamera(id string, cfg Config) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.detectors[id]; ok {
		return
	}
	s.detectors[id] = newDetector(id, cfg, s.callback)
	slog.Info("camera registered for motion detection", "camera_id", id)
}

// UnregisterCamera removes a camera.
func (s *Service) UnregisterCamera(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.detectors, id)
}

// StartPolling begins a 1-fps frame sampling loop for all registered cameras.
// Blocks until ctx is cancelled.
func (s *Service) StartPolling(ctx context.Context) {
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
			dets := make(map[string]*detector, len(s.detectors))
			for id, d := range s.detectors {
				ids = append(ids, id)
				dets[id] = d
			}
			s.mu.RUnlock()

			for _, id := range ids {
				go s.sampleCamera(client, id, dets[id])
			}
		}
	}
}

func (s *Service) sampleCamera(client *http.Client, id string, d *detector) {
	url := fmt.Sprintf("%s/api/frame.jpeg?src=%s", s.go2rtcURL, id)
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
	d.processJPEG(data)
}

// Close releases all detector resources.
func (s *Service) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.detectors = make(map[string]*detector)
}
