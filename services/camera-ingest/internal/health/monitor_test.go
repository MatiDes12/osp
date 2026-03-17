package health

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/MatiDes12/osp/services/camera-ingest/internal/stream"
)

// streamCheckBehavior controls what the mock go2rtc server returns.
type streamCheckBehavior struct {
	mu           sync.Mutex
	hasProducers bool
	shouldError  bool
}

func (b *streamCheckBehavior) setHasProducers(v bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.hasProducers = v
}

func (b *streamCheckBehavior) setError(v bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.shouldError = v
}

func (b *streamCheckBehavior) get() (bool, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.hasProducers, b.shouldError
}

// newTestMonitor creates a health Monitor backed by a mock go2rtc server.
// It returns the monitor, the behavior controller, and a cleanup function.
func newTestMonitor(t *testing.T, listener StatusListener) (*Monitor, *streamCheckBehavior) {
	t.Helper()
	behavior := &streamCheckBehavior{hasProducers: true}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hasProd, shouldErr := behavior.get()
		if shouldErr {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		// Parse the stream name from query.
		name := r.URL.Query().Get("name")
		if name == "" {
			// ListStreams call
			w.WriteHeader(200)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{})
			return
		}

		var producers []interface{}
		if hasProd {
			producers = []interface{}{"mock-producer"}
		}

		body := map[string]*stream.StreamInfo{
			name: {Name: name, Producers: producers},
		}
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(body)
	}))
	t.Cleanup(srv.Close)

	client := stream.NewGo2RTCClientWithURL(srv.URL)
	mgr := stream.NewManager(client)
	mon := NewMonitor(mgr, listener)
	// Use a very short interval for tests.
	mon.interval = 50 * time.Millisecond

	return mon, behavior
}

func TestRegister_InitialStateIsConnecting(t *testing.T) {
	mon, _ := newTestMonitor(t, nil)
	defer mon.StopAll()

	mon.Register("cam-1", "Front Door", "rtsp://10.0.0.1/stream")

	// Give the goroutine a moment to start, but check the state before first probe.
	// The initial state is set synchronously in Register.
	h, ok := mon.GetHealth("cam-1")
	if !ok {
		t.Fatal("expected camera to be registered")
	}
	// The state will either be Connecting (if probe hasn't run yet) or Online
	// (if the probe already completed). Both are acceptable.
	if h.State != StateConnecting && h.State != StateOnline {
		t.Errorf("expected Connecting or Online, got %s", h.State)
	}
}

func TestCameraComesOnline_AfterSuccessfulProbe(t *testing.T) {
	mon, behavior := newTestMonitor(t, nil)
	defer mon.StopAll()
	behavior.setHasProducers(true)

	mon.Register("cam-1", "Front Door", "rtsp://10.0.0.1/stream")

	// Wait for at least one probe cycle.
	time.Sleep(150 * time.Millisecond)

	h, ok := mon.GetHealth("cam-1")
	if !ok {
		t.Fatal("expected camera to be registered")
	}
	if h.State != StateOnline {
		t.Errorf("expected Online, got %s", h.State)
	}
	if h.ConsecutiveFailures != 0 {
		t.Errorf("expected 0 consecutive failures, got %d", h.ConsecutiveFailures)
	}
}

func TestCameraGoesOffline_After3ConsecutiveFailures(t *testing.T) {
	mon, behavior := newTestMonitor(t, nil)
	defer mon.StopAll()
	behavior.setError(true)

	mon.Register("cam-1", "Front Door", "rtsp://10.0.0.1/stream")

	// Wait for at least 4 probe cycles (initial + 3 ticks).
	time.Sleep(250 * time.Millisecond)

	h, ok := mon.GetHealth("cam-1")
	if !ok {
		t.Fatal("expected camera to be registered")
	}
	if h.State != StateOffline {
		t.Errorf("expected Offline after 3+ failures, got %s", h.State)
	}
	if h.ConsecutiveFailures < maxConsecutiveFailures {
		t.Errorf("expected at least %d consecutive failures, got %d", maxConsecutiveFailures, h.ConsecutiveFailures)
	}
}

func TestStatusChangeFiresListener(t *testing.T) {
	var mu sync.Mutex
	var events []StatusChangeEvent

	listener := func(event StatusChangeEvent) {
		mu.Lock()
		defer mu.Unlock()
		events = append(events, event)
	}

	mon, behavior := newTestMonitor(t, listener)
	defer mon.StopAll()
	behavior.setHasProducers(true)

	mon.Register("cam-1", "Front Door", "rtsp://10.0.0.1/stream")

	// Wait for probe to complete and transition from Connecting -> Online.
	time.Sleep(200 * time.Millisecond)

	mu.Lock()
	evtCount := len(events)
	mu.Unlock()

	if evtCount == 0 {
		t.Fatal("expected at least one status change event")
	}

	mu.Lock()
	firstEvent := events[0]
	mu.Unlock()

	if firstEvent.CameraID != "cam-1" {
		t.Errorf("expected camera ID cam-1, got %s", firstEvent.CameraID)
	}
	if firstEvent.OldState != StateConnecting {
		t.Errorf("expected old state Connecting, got %s", firstEvent.OldState)
	}
	if firstEvent.NewState != StateOnline {
		t.Errorf("expected new state Online, got %s", firstEvent.NewState)
	}
}

func TestUnregister_RemovesCameraAndStopsGoroutine(t *testing.T) {
	mon, _ := newTestMonitor(t, nil)
	defer mon.StopAll()

	mon.Register("cam-1", "Front Door", "rtsp://10.0.0.1/stream")
	time.Sleep(100 * time.Millisecond)

	mon.Unregister("cam-1")

	_, ok := mon.GetHealth("cam-1")
	if ok {
		t.Error("expected camera to be unregistered")
	}
}

func TestUnregister_NonExistentCamera_NoError(t *testing.T) {
	mon, _ := newTestMonitor(t, nil)
	defer mon.StopAll()

	// Should not panic.
	mon.Unregister("nonexistent")
}

func TestStopAll_CleansUpEverything(t *testing.T) {
	mon, _ := newTestMonitor(t, nil)

	mon.Register("cam-1", "Camera 1", "rtsp://10.0.0.1/stream")
	mon.Register("cam-2", "Camera 2", "rtsp://10.0.0.2/stream")
	time.Sleep(100 * time.Millisecond)

	mon.StopAll()

	// Cameras should still exist in the map (StopAll only cancels goroutines,
	// doesn't remove from map), but the cancels map should be empty.
	mon.mu.RLock()
	cancelCount := len(mon.cancels)
	mon.mu.RUnlock()

	if cancelCount != 0 {
		t.Errorf("expected 0 active cancels after StopAll, got %d", cancelCount)
	}
}

func TestAllHealths_ReturnsAllCameras(t *testing.T) {
	mon, _ := newTestMonitor(t, nil)
	defer mon.StopAll()

	mon.Register("cam-1", "Camera 1", "rtsp://10.0.0.1/stream")
	mon.Register("cam-2", "Camera 2", "rtsp://10.0.0.2/stream")
	mon.Register("cam-3", "Camera 3", "rtsp://10.0.0.3/stream")

	healths := mon.AllHealths()
	if len(healths) != 3 {
		t.Errorf("expected 3 healths, got %d", len(healths))
	}
}

func TestGetHealth_UnknownCamera_ReturnsFalse(t *testing.T) {
	mon, _ := newTestMonitor(t, nil)
	defer mon.StopAll()

	_, ok := mon.GetHealth("nonexistent")
	if ok {
		t.Error("expected ok=false for unknown camera")
	}
}

func TestDegradedState_NoProducers(t *testing.T) {
	mon, behavior := newTestMonitor(t, nil)
	defer mon.StopAll()
	behavior.setHasProducers(false)

	mon.Register("cam-1", "Front Door", "rtsp://10.0.0.1/stream")

	// Wait for probe.
	time.Sleep(150 * time.Millisecond)

	h, ok := mon.GetHealth("cam-1")
	if !ok {
		t.Fatal("expected camera to be registered")
	}
	if h.State != StateDegraded {
		t.Errorf("expected Degraded when no producers, got %s", h.State)
	}
}

func TestReRegister_ResetsState(t *testing.T) {
	mon, behavior := newTestMonitor(t, nil)
	defer mon.StopAll()
	behavior.setError(true)

	mon.Register("cam-1", "Front Door", "rtsp://10.0.0.1/stream")
	time.Sleep(250 * time.Millisecond)

	// Camera should be offline now. Re-register with a healthy server.
	behavior.setError(false)
	behavior.setHasProducers(true)

	mon.Register("cam-1", "Front Door Updated", "rtsp://10.0.0.1/stream2")
	time.Sleep(150 * time.Millisecond)

	h, ok := mon.GetHealth("cam-1")
	if !ok {
		t.Fatal("expected camera to be registered")
	}
	if h.State != StateOnline {
		t.Errorf("expected Online after re-register, got %s", h.State)
	}
	if h.Name != "Front Door Updated" {
		t.Errorf("expected updated name, got %s", h.Name)
	}
}

func TestStateString(t *testing.T) {
	tests := []struct {
		state State
		want  string
	}{
		{StateUnknown, "unknown"},
		{StateOnline, "online"},
		{StateOffline, "offline"},
		{StateConnecting, "connecting"},
		{StateDegraded, "degraded"},
		{State(99), "unknown"},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("State(%d)", tt.state), func(t *testing.T) {
			if got := tt.state.String(); got != tt.want {
				t.Errorf("State.String() = %q, want %q", got, tt.want)
			}
		})
	}
}
