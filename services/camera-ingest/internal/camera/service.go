// Package camera implements the core business logic for camera lifecycle management,
// coordinating stream registration in go2rtc and health monitoring.
package camera

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/MatiDes12/osp/services/camera-ingest/internal/health"
	"github.com/MatiDes12/osp/services/camera-ingest/internal/stream"
)

// Camera represents a registered camera with its configuration.
type Camera struct {
	ID       string
	Name     string
	RtspURL  string
	OnvifURL string
	Username string
	Password string
	AddedAt  time.Time
}

// Status represents the current state of a registered camera, combining
// the camera configuration with its health information.
type Status struct {
	Camera
	State               health.State
	LastSeen            time.Time
	ConsecutiveFailures int
	ErrorMessage        string
}

// Service manages camera lifecycle: registration, removal, and status queries.
type Service struct {
	streamMgr *stream.Manager
	monitor   *health.Monitor

	mu      sync.RWMutex
	cameras map[string]Camera
}

// NewService creates a camera service backed by the given stream manager and health monitor.
func NewService(streamMgr *stream.Manager, monitor *health.Monitor) *Service {
	return &Service{
		streamMgr: streamMgr,
		monitor:   monitor,
		cameras:   make(map[string]Camera),
	}
}

// AddCamera registers a camera by creating a go2rtc stream and starting health monitoring.
// It returns the initial status of the camera.
func (s *Service) AddCamera(ctx context.Context, id, name, rtspURL, onvifURL, username, password string) (Status, error) {
	if id == "" {
		return Status{}, fmt.Errorf("camera service: camera ID must not be empty")
	}
	if rtspURL == "" {
		return Status{}, fmt.Errorf("camera service: RTSP URL must not be empty")
	}

	s.mu.RLock()
	if _, exists := s.cameras[id]; exists {
		s.mu.RUnlock()
		return Status{}, fmt.Errorf("camera service: camera %q already exists", id)
	}
	s.mu.RUnlock()

	// Register the stream with go2rtc.
	if err := s.streamMgr.AddStream(ctx, id, rtspURL); err != nil {
		return Status{}, fmt.Errorf("camera service: add stream for %q: %w", id, err)
	}

	cam := Camera{
		ID:       id,
		Name:     name,
		RtspURL:  rtspURL,
		OnvifURL: onvifURL,
		Username: username,
		Password: password,
		AddedAt:  time.Now(),
	}

	s.mu.Lock()
	s.cameras[id] = cam
	s.mu.Unlock()

	// Start health monitoring.
	s.monitor.Register(id, name, rtspURL)

	return Status{
		Camera:   cam,
		State:    health.StateConnecting,
		LastSeen: time.Now(),
	}, nil
}

// RemoveCamera unregisters a camera, removing its go2rtc stream and stopping monitoring.
func (s *Service) RemoveCamera(ctx context.Context, id string) error {
	s.mu.Lock()
	_, exists := s.cameras[id]
	if !exists {
		s.mu.Unlock()
		return fmt.Errorf("camera service: camera %q not found", id)
	}
	delete(s.cameras, id)
	s.mu.Unlock()

	s.monitor.Unregister(id)

	if err := s.streamMgr.RemoveStream(ctx, id); err != nil {
		return fmt.Errorf("camera service: remove stream for %q: %w", id, err)
	}

	return nil
}

// GetStatus returns the current status of a single camera.
func (s *Service) GetStatus(id string) (Status, error) {
	s.mu.RLock()
	cam, exists := s.cameras[id]
	s.mu.RUnlock()

	if !exists {
		return Status{}, fmt.Errorf("camera service: camera %q not found", id)
	}

	h, ok := s.monitor.GetHealth(id)
	if !ok {
		return Status{
			Camera: cam,
			State:  health.StateUnknown,
		}, nil
	}

	return Status{
		Camera:              cam,
		State:               h.State,
		LastSeen:            h.LastSeen,
		ConsecutiveFailures: h.ConsecutiveFailures,
		ErrorMessage:        h.ErrorMessage,
	}, nil
}

// ListStatuses returns the current status of all registered cameras.
func (s *Service) ListStatuses() []Status {
	s.mu.RLock()
	defer s.mu.RUnlock()

	statuses := make([]Status, 0, len(s.cameras))
	for id, cam := range s.cameras {
		st := Status{Camera: cam}
		if h, ok := s.monitor.GetHealth(id); ok {
			st.State = h.State
			st.LastSeen = h.LastSeen
			st.ConsecutiveFailures = h.ConsecutiveFailures
			st.ErrorMessage = h.ErrorMessage
		}
		statuses = append(statuses, st)
	}
	return statuses
}

// ReconnectCamera removes and re-adds a camera to force a fresh connection.
func (s *Service) ReconnectCamera(ctx context.Context, id string) (Status, error) {
	s.mu.RLock()
	cam, exists := s.cameras[id]
	s.mu.RUnlock()

	if !exists {
		return Status{}, fmt.Errorf("camera service: camera %q not found", id)
	}

	// Remove existing stream and monitoring.
	s.monitor.Unregister(id)
	_ = s.streamMgr.RemoveStream(ctx, id)

	// Re-add the stream.
	if err := s.streamMgr.AddStream(ctx, id, cam.RtspURL); err != nil {
		return Status{}, fmt.Errorf("camera service: reconnect stream for %q: %w", id, err)
	}

	s.monitor.Register(id, cam.Name, cam.RtspURL)

	return Status{
		Camera:   cam,
		State:    health.StateConnecting,
		LastSeen: time.Now(),
	}, nil
}

// GetCamera returns the camera configuration for a given ID.
func (s *Service) GetCamera(id string) (Camera, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cam, ok := s.cameras[id]
	return cam, ok
}
