package camera

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MatiDes12/osp/services/camera-ingest/internal/health"
	"github.com/MatiDes12/osp/services/camera-ingest/internal/stream"
)

// mockServerBehavior controls the test HTTP server responses.
type mockServerBehavior struct {
	mu              sync.Mutex
	addStreamErr    bool
	removeStreamErr bool
	hasProducers    bool
}

func (b *mockServerBehavior) setAddStreamErr(v bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.addStreamErr = v
}

func (b *mockServerBehavior) setRemoveStreamErr(v bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.removeStreamErr = v
}

func (b *mockServerBehavior) get() (addErr, removeErr, hasProd bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.addStreamErr, b.removeStreamErr, b.hasProducers
}

func newTestService(t *testing.T) (*Service, *mockServerBehavior) {
	t.Helper()
	behavior := &mockServerBehavior{hasProducers: true}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		addErr, removeErr, hasProd := behavior.get()

		switch r.Method {
		case http.MethodPut:
			if addErr {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
		case http.MethodDelete:
			if removeErr {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			name := r.URL.Query().Get("name")
			var producers []interface{}
			if hasProd {
				producers = []interface{}{"mock"}
			}
			if name != "" {
				body := map[string]*stream.StreamInfo{
					name: {Name: name, Producers: producers},
				}
				_ = json.NewEncoder(w).Encode(body)
			} else {
				_ = json.NewEncoder(w).Encode(map[string]*stream.StreamInfo{})
			}
		}
	}))
	t.Cleanup(srv.Close)

	client := stream.NewGo2RTCClientWithURL(srv.URL)
	mgr := stream.NewManager(client)
	mon := health.NewMonitor(mgr, nil)
	svc := NewService(mgr, mon)

	return svc, behavior
}

func TestAddCamera_Success(t *testing.T) {
	svc, _ := newTestService(t)

	status, err := svc.AddCamera(context.Background(), "cam-1", "Front Door", "rtsp://10.0.0.1/stream", "", "", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if status.ID != "cam-1" {
		t.Errorf("expected ID cam-1, got %s", status.ID)
	}
	if status.Name != "Front Door" {
		t.Errorf("expected name Front Door, got %s", status.Name)
	}
	if status.State != health.StateConnecting {
		t.Errorf("expected state Connecting, got %s", status.State)
	}
	if status.RtspURL != "rtsp://10.0.0.1/stream" {
		t.Errorf("expected RTSP URL, got %s", status.RtspURL)
	}

	// Verify camera was stored.
	cam, ok := svc.GetCamera("cam-1")
	if !ok {
		t.Fatal("expected camera to be stored")
	}
	if cam.Name != "Front Door" {
		t.Errorf("stored camera name = %q, want Front Door", cam.Name)
	}
}

func TestAddCamera_EmptyID_ReturnsError(t *testing.T) {
	svc, _ := newTestService(t)

	_, err := svc.AddCamera(context.Background(), "", "Test", "rtsp://10.0.0.1/stream", "", "", "")
	if err == nil {
		t.Fatal("expected error for empty ID")
	}
	if !strings.Contains(err.Error(), "camera ID must not be empty") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestAddCamera_EmptyURL_ReturnsError(t *testing.T) {
	svc, _ := newTestService(t)

	_, err := svc.AddCamera(context.Background(), "cam-1", "Test", "", "", "", "")
	if err == nil {
		t.Fatal("expected error for empty URL")
	}
	if !strings.Contains(err.Error(), "RTSP URL must not be empty") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestAddCamera_DuplicateID_ReturnsError(t *testing.T) {
	svc, _ := newTestService(t)

	_, err := svc.AddCamera(context.Background(), "cam-1", "First", "rtsp://10.0.0.1/stream", "", "", "")
	if err != nil {
		t.Fatalf("unexpected error on first add: %v", err)
	}

	_, err = svc.AddCamera(context.Background(), "cam-1", "Second", "rtsp://10.0.0.2/stream", "", "", "")
	if err == nil {
		t.Fatal("expected error for duplicate camera ID")
	}
	if !strings.Contains(err.Error(), "already exists") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestAddCamera_StreamManagerError_Propagated(t *testing.T) {
	svc, behavior := newTestService(t)
	behavior.setAddStreamErr(true)

	_, err := svc.AddCamera(context.Background(), "cam-1", "Test", "rtsp://10.0.0.1/stream", "", "", "")
	if err == nil {
		t.Fatal("expected error when stream manager fails")
	}
	if !strings.Contains(err.Error(), "add stream") {
		t.Errorf("unexpected error: %v", err)
	}

	// Camera should not be stored if stream registration failed.
	_, ok := svc.GetCamera("cam-1")
	if ok {
		t.Error("camera should not be stored after stream manager error")
	}
}

func TestRemoveCamera_Success(t *testing.T) {
	svc, _ := newTestService(t)

	_, err := svc.AddCamera(context.Background(), "cam-1", "Front Door", "rtsp://10.0.0.1/stream", "", "", "")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	err = svc.RemoveCamera(context.Background(), "cam-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	_, ok := svc.GetCamera("cam-1")
	if ok {
		t.Error("expected camera to be removed")
	}
}

func TestRemoveCamera_NotFound_ReturnsError(t *testing.T) {
	svc, _ := newTestService(t)

	err := svc.RemoveCamera(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent camera")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestGetStatus_ReturnsCorrectStatus(t *testing.T) {
	svc, _ := newTestService(t)

	_, err := svc.AddCamera(context.Background(), "cam-1", "Front Door", "rtsp://10.0.0.1/stream", "", "", "")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	// Give health monitor time to probe.
	time.Sleep(100 * time.Millisecond)

	status, err := svc.GetStatus("cam-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status.ID != "cam-1" {
		t.Errorf("expected ID cam-1, got %s", status.ID)
	}
	if status.Name != "Front Door" {
		t.Errorf("expected name Front Door, got %s", status.Name)
	}
}

func TestGetStatus_NotFound_ReturnsError(t *testing.T) {
	svc, _ := newTestService(t)

	_, err := svc.GetStatus("nonexistent")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestListStatuses_ReturnsAllCameras(t *testing.T) {
	svc, _ := newTestService(t)

	cameras := []struct {
		id   string
		name string
		url  string
	}{
		{"cam-1", "Front Door", "rtsp://10.0.0.1/stream"},
		{"cam-2", "Back Yard", "rtsp://10.0.0.2/stream"},
		{"cam-3", "Garage", "rtsp://10.0.0.3/stream"},
	}

	for _, c := range cameras {
		_, err := svc.AddCamera(context.Background(), c.id, c.name, c.url, "", "", "")
		if err != nil {
			t.Fatalf("setup: %v", err)
		}
	}

	statuses := svc.ListStatuses()
	if len(statuses) != 3 {
		t.Fatalf("expected 3 statuses, got %d", len(statuses))
	}

	ids := make(map[string]bool)
	for _, s := range statuses {
		ids[s.ID] = true
	}
	for _, c := range cameras {
		if !ids[c.id] {
			t.Errorf("expected camera %s in statuses", c.id)
		}
	}
}

func TestListStatuses_Empty(t *testing.T) {
	svc, _ := newTestService(t)
	statuses := svc.ListStatuses()
	if len(statuses) != 0 {
		t.Errorf("expected 0 statuses, got %d", len(statuses))
	}
}

func TestReconnectCamera_Success(t *testing.T) {
	svc, _ := newTestService(t)

	_, err := svc.AddCamera(context.Background(), "cam-1", "Front Door", "rtsp://10.0.0.1/stream", "http://10.0.0.1/onvif", "admin", "pass")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	status, err := svc.ReconnectCamera(context.Background(), "cam-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if status.State != health.StateConnecting {
		t.Errorf("expected Connecting after reconnect, got %s", status.State)
	}
	if status.ID != "cam-1" {
		t.Errorf("expected ID cam-1, got %s", status.ID)
	}
	if status.Name != "Front Door" {
		t.Errorf("expected name preserved, got %s", status.Name)
	}
}

func TestReconnectCamera_NotFound_ReturnsError(t *testing.T) {
	svc, _ := newTestService(t)

	_, err := svc.ReconnectCamera(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestReconnectCamera_StreamManagerError_Propagated(t *testing.T) {
	svc, behavior := newTestService(t)

	// First add succeeds.
	_, err := svc.AddCamera(context.Background(), "cam-1", "Test", "rtsp://10.0.0.1/stream", "", "", "")
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	// Make the re-add fail.
	behavior.setAddStreamErr(true)

	_, err = svc.ReconnectCamera(context.Background(), "cam-1")
	if err == nil {
		t.Fatal("expected error when stream re-add fails")
	}
	if !strings.Contains(err.Error(), "reconnect stream") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestAddCamera_StoresAllFields(t *testing.T) {
	svc, _ := newTestService(t)

	_, err := svc.AddCamera(context.Background(),
		"cam-1", "Front Door", "rtsp://10.0.0.1/stream",
		"http://10.0.0.1/onvif", "admin", "secret123")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	cam, ok := svc.GetCamera("cam-1")
	if !ok {
		t.Fatal("expected camera to exist")
	}
	if cam.OnvifURL != "http://10.0.0.1/onvif" {
		t.Errorf("OnvifURL = %q, want http://10.0.0.1/onvif", cam.OnvifURL)
	}
	if cam.Username != "admin" {
		t.Errorf("Username = %q, want admin", cam.Username)
	}
	if cam.Password != "secret123" {
		t.Errorf("Password = %q, want secret123", cam.Password)
	}
	if cam.AddedAt.IsZero() {
		t.Error("expected AddedAt to be set")
	}
}
