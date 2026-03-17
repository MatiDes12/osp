// Package health provides camera health monitoring by periodically probing
// stream status through go2rtc.
package health

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/MatiDes12/osp/services/camera-ingest/internal/stream"
)

const (
	defaultPingInterval     = 30 * time.Second
	maxConsecutiveFailures  = 3
)

// State represents the health state of a camera.
type State int

const (
	StateUnknown    State = iota
	StateOnline
	StateOffline
	StateConnecting
	StateDegraded
)

// String returns a human-readable name for the state.
func (s State) String() string {
	switch s {
	case StateOnline:
		return "online"
	case StateOffline:
		return "offline"
	case StateConnecting:
		return "connecting"
	case StateDegraded:
		return "degraded"
	default:
		return "unknown"
	}
}

// CameraHealth holds the health state for a single camera.
type CameraHealth struct {
	CameraID            string
	Name                string
	RtspURL             string
	State               State
	LastSeen            time.Time
	ConsecutiveFailures int
	ErrorMessage        string
}

// StatusChangeEvent is emitted whenever a camera transitions between states.
type StatusChangeEvent struct {
	CameraID  string
	Name      string
	OldState  State
	NewState  State
	Timestamp time.Time
	Error     string
}

// StatusListener receives status change events.
type StatusListener func(event StatusChangeEvent)

// Monitor tracks the health of registered cameras by periodically probing go2rtc.
type Monitor struct {
	streamMgr *stream.Manager
	listener  StatusListener
	interval  time.Duration

	mu       sync.RWMutex
	cameras  map[string]*CameraHealth
	cancels  map[string]context.CancelFunc
}

// NewMonitor creates a health monitor backed by the given stream manager.
// The optional listener is called on every state transition.
func NewMonitor(streamMgr *stream.Manager, listener StatusListener) *Monitor {
	return &Monitor{
		streamMgr: streamMgr,
		listener:  listener,
		interval:  defaultPingInterval,
		cameras:   make(map[string]*CameraHealth),
		cancels:   make(map[string]context.CancelFunc),
	}
}

// Register starts health monitoring for a camera. If the camera is already
// registered, it is re-registered with the new parameters.
func (m *Monitor) Register(cameraID, name, rtspURL string) {
	m.Unregister(cameraID)

	ctx, cancel := context.WithCancel(context.Background())

	health := &CameraHealth{
		CameraID: cameraID,
		Name:     name,
		RtspURL:  rtspURL,
		State:    StateConnecting,
		LastSeen: time.Now(),
	}

	m.mu.Lock()
	m.cameras[cameraID] = health
	m.cancels[cameraID] = cancel
	m.mu.Unlock()

	go m.runLoop(ctx, cameraID)
}

// Unregister stops health monitoring for a camera and removes its state.
func (m *Monitor) Unregister(cameraID string) {
	m.mu.Lock()
	if cancel, ok := m.cancels[cameraID]; ok {
		cancel()
		delete(m.cancels, cameraID)
	}
	delete(m.cameras, cameraID)
	m.mu.Unlock()
}

// GetHealth returns a copy of the current health state for a camera.
func (m *Monitor) GetHealth(cameraID string) (CameraHealth, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	h, ok := m.cameras[cameraID]
	if !ok {
		return CameraHealth{}, false
	}
	return *h, true
}

// AllHealths returns a copy of all camera health states.
func (m *Monitor) AllHealths() []CameraHealth {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]CameraHealth, 0, len(m.cameras))
	for _, h := range m.cameras {
		result = append(result, *h)
	}
	return result
}

// StopAll cancels all monitoring goroutines.
func (m *Monitor) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, cancel := range m.cancels {
		cancel()
		delete(m.cancels, id)
	}
}

// runLoop is the per-camera monitoring goroutine.
func (m *Monitor) runLoop(ctx context.Context, cameraID string) {
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()

	// Perform an initial check immediately.
	m.probe(ctx, cameraID)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.probe(ctx, cameraID)
		}
	}
}

// probe checks a single camera's stream health and updates state accordingly.
func (m *Monitor) probe(ctx context.Context, cameraID string) {
	m.mu.RLock()
	h, ok := m.cameras[cameraID]
	if !ok {
		m.mu.RUnlock()
		return
	}
	oldState := h.State
	m.mu.RUnlock()

	hasProducers, err := m.streamMgr.HasProducers(ctx, cameraID)

	m.mu.Lock()
	defer m.mu.Unlock()

	h, ok = m.cameras[cameraID]
	if !ok {
		return
	}

	var newState State

	switch {
	case err != nil:
		h.ConsecutiveFailures++
		h.ErrorMessage = fmt.Sprintf("probe failed: %v", err)
		if h.ConsecutiveFailures >= maxConsecutiveFailures {
			newState = StateOffline
		} else {
			newState = StateDegraded
		}
	case !hasProducers:
		// Stream exists but no active producers — degraded.
		h.ConsecutiveFailures = 0
		h.ErrorMessage = "no active producers"
		newState = StateDegraded
		h.LastSeen = time.Now()
	default:
		h.ConsecutiveFailures = 0
		h.ErrorMessage = ""
		h.LastSeen = time.Now()
		newState = StateOnline
	}

	h.State = newState

	if oldState != newState && m.listener != nil {
		event := StatusChangeEvent{
			CameraID:  cameraID,
			Name:      h.Name,
			OldState:  oldState,
			NewState:  newState,
			Timestamp: time.Now(),
			Error:     h.ErrorMessage,
		}
		// Call listener outside the lock to avoid deadlocks.
		// We make a copy of the event so the unlock is safe.
		go func() {
			log.Printf("camera %s: %s -> %s", cameraID, oldState, newState)
			m.listener(event)
		}()
	}
}
