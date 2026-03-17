package stream

import (
	"context"
	"fmt"
	"net/url"
)

// Manager wraps the go2rtc HTTP API with high-level stream management operations.
type Manager struct {
	client *Go2RTCClient
}

// NewManager creates a new stream manager backed by the given go2rtc client.
func NewManager(client *Go2RTCClient) *Manager {
	return &Manager{client: client}
}

// addStreamRequest is the JSON body for adding a stream to go2rtc.
type addStreamRequest struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// AddStream registers a new RTSP stream with go2rtc under the given name.
func (m *Manager) AddStream(ctx context.Context, name, rtspURL string) error {
	if name == "" {
		return fmt.Errorf("stream manager: name must not be empty")
	}
	if rtspURL == "" {
		return fmt.Errorf("stream manager: RTSP URL must not be empty")
	}

	// go2rtc accepts PUT /api/streams?src=<url>&name=<name> for adding streams.
	path := fmt.Sprintf("/api/streams?src=%s&name=%s",
		url.QueryEscape(rtspURL),
		url.QueryEscape(name),
	)
	return m.client.Put(ctx, path, nil)
}

// RemoveStream removes a stream from go2rtc by name.
func (m *Manager) RemoveStream(ctx context.Context, name string) error {
	if name == "" {
		return fmt.Errorf("stream manager: name must not be empty")
	}

	path := fmt.Sprintf("/api/streams?name=%s", url.QueryEscape(name))
	return m.client.Delete(ctx, path)
}

// GetStream retrieves information about a single stream by name.
func (m *Manager) GetStream(ctx context.Context, name string) (*StreamInfo, error) {
	if name == "" {
		return nil, fmt.Errorf("stream manager: name must not be empty")
	}

	// go2rtc returns a map of stream name -> info.
	var result map[string]*StreamInfo
	path := fmt.Sprintf("/api/streams?name=%s", url.QueryEscape(name))
	if err := m.client.Get(ctx, path, &result); err != nil {
		return nil, fmt.Errorf("stream manager: get stream %q: %w", name, err)
	}

	info, ok := result[name]
	if !ok {
		return nil, fmt.Errorf("stream manager: stream %q not found", name)
	}
	return info, nil
}

// ListStreams retrieves all configured streams from go2rtc.
func (m *Manager) ListStreams(ctx context.Context) (map[string]*StreamInfo, error) {
	var result map[string]*StreamInfo
	if err := m.client.Get(ctx, "/api/streams", &result); err != nil {
		return nil, fmt.Errorf("stream manager: list streams: %w", err)
	}
	return result, nil
}

// HasProducers returns true if the stream has at least one active producer (source).
func (m *Manager) HasProducers(ctx context.Context, name string) (bool, error) {
	info, err := m.GetStream(ctx, name)
	if err != nil {
		return false, err
	}
	return len(info.Producers) > 0, nil
}
