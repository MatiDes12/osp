// Package camera manages the set of cameras the edge agent monitors.
// Cameras can be configured statically via CAMERA_IDS or discovered
// automatically from the local go2rtc instance.
package camera

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// Info describes a camera known to the edge agent.
type Info struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Manager holds the set of cameras this agent monitors.
type Manager struct {
	mu         sync.RWMutex
	cameras    map[string]Info
	go2rtcURL  string
	httpClient *http.Client
}

// NewManager creates a Manager targeting the given go2rtc URL.
func NewManager(go2rtcURL string) *Manager {
	return &Manager{
		cameras:    make(map[string]Info),
		go2rtcURL:  go2rtcURL,
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

// SetStaticCameras registers cameras from a static ID list.
func (m *Manager) SetStaticCameras(ids []string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, id := range ids {
		m.cameras[id] = Info{ID: id, Name: id}
	}
	slog.Info("static cameras configured", "count", len(ids))
}

// SyncFromGo2RTC discovers streams from the local go2rtc instance and adds
// any that are not already registered.
func (m *Manager) SyncFromGo2RTC(ctx context.Context) error {
	url := fmt.Sprintf("%s/api/streams", m.go2rtcURL)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}
	resp, err := m.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("go2rtc unreachable: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var streams map[string]interface{}
	if err := json.Unmarshal(body, &streams); err != nil {
		return fmt.Errorf("parse streams: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	for name := range streams {
		if _, exists := m.cameras[name]; !exists {
			m.cameras[name] = Info{ID: name, Name: name}
		}
	}
	slog.Info("synced cameras from go2rtc", "count", len(m.cameras))
	return nil
}

// List returns a snapshot of all registered cameras.
func (m *Manager) List() []Info {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Info, 0, len(m.cameras))
	for _, c := range m.cameras {
		out = append(out, c)
	}
	return out
}

// Count returns the number of registered cameras.
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.cameras)
}
