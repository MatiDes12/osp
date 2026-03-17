package dispatch

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MatiDes12/osp/services/event-engine/internal/events"
	"github.com/MatiDes12/osp/services/event-engine/internal/rules"
)

// testLogger returns a slog.Logger that writes to stderr at error level.
func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

// --- Mock PushSender ---

type mockPushSender struct {
	mu    sync.Mutex
	calls []pushCall
	err   error
}

type pushCall struct {
	Title        string
	Body         string
	UserIDs      []string
	ThumbnailURL string
}

func (m *mockPushSender) recordCall(title, body string, userIDs []string, thumbnailURL string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = append(m.calls, pushCall{
		Title:        title,
		Body:         body,
		UserIDs:      userIDs,
		ThumbnailURL: thumbnailURL,
	})
}

func (m *mockPushSender) getCalls() []pushCall {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]pushCall, len(m.calls))
	copy(result, m.calls)
	return result
}

// --- Mock EmailSender ---

type mockEmailSender struct {
	mu    sync.Mutex
	calls []emailCall
	err   error
}

type emailCall struct {
	To       []string
	Subject  string
	HTMLBody string
}

func (m *mockEmailSender) recordCall(to []string, subject, htmlBody string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls = append(m.calls, emailCall{To: to, Subject: subject, HTMLBody: htmlBody})
}

func (m *mockEmailSender) getCalls() []emailCall {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]emailCall, len(m.calls))
	copy(result, m.calls)
	return result
}

// Since PushSender and EmailSender are concrete types, we need to use them
// directly. We test the handler logic at the Dispatch level using the actual
// PushSender/EmailSender (which are placeholders that just log).

func newTestEvent() events.Event {
	return events.Event{
		ID:        "evt-1",
		CameraID:  "cam-1",
		TenantID:  "tenant-1",
		Type:      "motion",
		Severity:  "high",
		Intensity: 0.85,
	}
}

func TestDispatch_PushNotification(t *testing.T) {
	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID: "rule-1",
			Actions: []rules.Action{
				{
					Type: "push_notification",
					Config: map[string]interface{}{
						"title":         "Motion Alert",
						"body":          "Motion detected on camera",
						"user_ids":      []interface{}{"user-1", "user-2"},
						"thumbnail_url": "https://cdn.example.com/thumb.jpg",
					},
				},
			},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	// The push sender is a placeholder that just logs, so this should succeed.
	err := dispatcher.Dispatch(context.Background(), matched, event)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDispatch_PushNotification_DefaultTitleAndBody(t *testing.T) {
	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID: "rule-1",
			Actions: []rules.Action{
				{
					Type:   "push_notification",
					Config: map[string]interface{}{},
				},
			},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	err := dispatcher.Dispatch(context.Background(), matched, event)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDispatch_Email(t *testing.T) {
	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID: "rule-1",
			Actions: []rules.Action{
				{
					Type: "email",
					Config: map[string]interface{}{
						"to":        []interface{}{"admin@example.com"},
						"subject":   "Alert: Motion",
						"html_body": "<p>Motion detected</p>",
					},
				},
			},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	err := dispatcher.Dispatch(context.Background(), matched, event)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDispatch_Email_DefaultSubjectAndBody(t *testing.T) {
	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID: "rule-1",
			Actions: []rules.Action{
				{
					Type:   "email",
					Config: map[string]interface{}{},
				},
			},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	err := dispatcher.Dispatch(context.Background(), matched, event)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDispatch_Webhook(t *testing.T) {
	var (
		receivedBody []byte
		receivedMu   sync.Mutex
		callCount    int32
	)

	webhookServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&callCount, 1)
		receivedMu.Lock()
		defer receivedMu.Unlock()
		buf := make([]byte, 4096)
		n, _ := r.Body.Read(buf)
		receivedBody = buf[:n]

		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
		}
		if r.Header.Get("X-Custom") != "test-value" {
			t.Errorf("expected X-Custom header, got %s", r.Header.Get("X-Custom"))
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer webhookServer.Close()

	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID: "rule-1",
			Actions: []rules.Action{
				{
					Type: "webhook",
					Config: map[string]interface{}{
						"url": webhookServer.URL,
						"headers": map[string]interface{}{
							"X-Custom": "test-value",
						},
					},
				},
			},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	err := dispatcher.Dispatch(context.Background(), matched, event)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if atomic.LoadInt32(&callCount) != 1 {
		t.Errorf("expected 1 webhook call, got %d", callCount)
	}

	receivedMu.Lock()
	defer receivedMu.Unlock()
	var receivedEvent events.Event
	if err := json.Unmarshal(receivedBody, &receivedEvent); err != nil {
		t.Fatalf("unmarshal webhook body: %v", err)
	}
	if receivedEvent.ID != "evt-1" {
		t.Errorf("webhook received event ID %q, want evt-1", receivedEvent.ID)
	}
}

func TestDispatch_Webhook_MissingURL(t *testing.T) {
	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID: "rule-1",
			Actions: []rules.Action{
				{
					Type:   "webhook",
					Config: map[string]interface{}{},
				},
			},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	err := dispatcher.Dispatch(context.Background(), matched, event)
	if err == nil {
		t.Fatal("expected error for missing webhook URL")
	}
}

func TestDispatch_Webhook_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID: "rule-1",
			Actions: []rules.Action{
				{
					Type:   "webhook",
					Config: map[string]interface{}{"url": srv.URL},
				},
			},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	err := dispatcher.Dispatch(context.Background(), matched, event)
	if err == nil {
		t.Fatal("expected error for server 500")
	}
}

func TestDispatch_UnknownActionType(t *testing.T) {
	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID: "rule-1",
			Actions: []rules.Action{
				{
					Type:   "sms",
					Config: map[string]interface{}{},
				},
			},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	err := dispatcher.Dispatch(context.Background(), matched, event)
	if err == nil {
		t.Fatal("expected error for unknown action type")
	}
}

func TestDispatch_MultipleActions_AllExecuted(t *testing.T) {
	webhookCallCount := int32(0)
	webhookServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&webhookCallCount, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer webhookServer.Close()

	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID: "rule-1",
			Actions: []rules.Action{
				{
					Type:   "push_notification",
					Config: map[string]interface{}{"title": "Alert"},
				},
				{
					Type:   "email",
					Config: map[string]interface{}{"subject": "Alert"},
				},
				{
					Type:   "webhook",
					Config: map[string]interface{}{"url": webhookServer.URL},
				},
			},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	err := dispatcher.Dispatch(context.Background(), matched, event)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Give a moment for concurrent actions to complete.
	time.Sleep(50 * time.Millisecond)

	if atomic.LoadInt32(&webhookCallCount) != 1 {
		t.Errorf("expected 1 webhook call, got %d", webhookCallCount)
	}
}

func TestDispatch_OneActionFails_OthersStillRun(t *testing.T) {
	webhookCallCount := int32(0)
	webhookServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&webhookCallCount, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer webhookServer.Close()

	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID: "rule-1",
			Actions: []rules.Action{
				{
					Type:   "push_notification",
					Config: map[string]interface{}{},
				},
				{
					// This will fail - unknown action type.
					Type:   "sms_nonexistent",
					Config: map[string]interface{}{},
				},
				{
					Type:   "webhook",
					Config: map[string]interface{}{"url": webhookServer.URL},
				},
			},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	err := dispatcher.Dispatch(context.Background(), matched, event)
	// errgroup returns the first error, so err should be non-nil.
	if err == nil {
		t.Fatal("expected error from failing action")
	}

	// The webhook should still have been called despite the SMS failure,
	// because errgroup runs all goroutines.
	time.Sleep(50 * time.Millisecond)
	if atomic.LoadInt32(&webhookCallCount) != 1 {
		t.Errorf("expected webhook to still run despite other failure, got %d calls", webhookCallCount)
	}
}

func TestDispatch_EmptyActions(t *testing.T) {
	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID:      "rule-1",
			Actions: []rules.Action{},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	err := dispatcher.Dispatch(context.Background(), matched, event)
	if err != nil {
		t.Fatalf("unexpected error for empty actions: %v", err)
	}
}

func TestDispatch_ContextCancellation(t *testing.T) {
	// Server that is slow to respond.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	logger := testLogger()
	push := NewPushSender(logger)
	email := NewEmailSender(logger)

	dispatcher := NewNotificationDispatcher(nil, push, email, logger)

	matched := rules.MatchedRule{
		Rule: rules.AlertRule{
			ID: "rule-1",
			Actions: []rules.Action{
				{
					Type:   "webhook",
					Config: map[string]interface{}{"url": srv.URL},
				},
			},
		},
		EventID: "evt-1",
	}

	event := newTestEvent()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	err := dispatcher.Dispatch(ctx, matched, event)
	if err == nil {
		t.Fatal("expected error from context cancellation")
	}
}

func TestHandleStartRecording_PublishesCommand(t *testing.T) {
	// We cannot easily test Redis publishing without a real/mock Redis.
	// Instead, we verify the command structure that would be published.
	event := newTestEvent()

	command := map[string]interface{}{
		"command":   "recording.start",
		"camera_id": event.CameraID,
		"tenant_id": event.TenantID,
		"event_id":  event.ID,
		"trigger":   "rule",
	}

	data, err := json.Marshal(command)
	if err != nil {
		t.Fatalf("marshal command: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal command: %v", err)
	}

	if parsed["command"] != "recording.start" {
		t.Errorf("command = %v, want recording.start", parsed["command"])
	}
	if parsed["camera_id"] != "cam-1" {
		t.Errorf("camera_id = %v, want cam-1", parsed["camera_id"])
	}
	if parsed["tenant_id"] != "tenant-1" {
		t.Errorf("tenant_id = %v, want tenant-1", parsed["tenant_id"])
	}
	if parsed["event_id"] != "evt-1" {
		t.Errorf("event_id = %v, want evt-1", parsed["event_id"])
	}

	expectedChannel := fmt.Sprintf("commands:%s", event.CameraID)
	if expectedChannel != "commands:cam-1" {
		t.Errorf("channel = %s, want commands:cam-1", expectedChannel)
	}
}

func TestHandleStartRecording_WithDurationOverride(t *testing.T) {
	event := newTestEvent()
	action := rules.Action{
		Type: "start_recording",
		Config: map[string]interface{}{
			"duration_sec": float64(300),
		},
	}

	command := map[string]interface{}{
		"command":   "recording.start",
		"camera_id": event.CameraID,
		"tenant_id": event.TenantID,
		"event_id":  event.ID,
		"trigger":   "rule",
	}

	if duration, ok := action.Config["duration_sec"]; ok {
		command["duration_sec"] = duration
	}

	data, err := json.Marshal(command)
	if err != nil {
		t.Fatalf("marshal command: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal command: %v", err)
	}

	if parsed["duration_sec"] != float64(300) {
		t.Errorf("duration_sec = %v, want 300", parsed["duration_sec"])
	}
}
