package rules

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/MatiDes12/osp/services/event-engine/internal/events"
)

// -----------------------------------------------------------------------
// Minimal in-memory SQL driver so that we can construct a *sql.DB for the
// RuleEngine without reaching out to a real database. The driver returns
// pre-configured rows for the alert_rules query.
// -----------------------------------------------------------------------

func init() {
	sql.Register("mock_engine", &mockDriver{})
}

// mockDriver implements database/sql/driver.Driver.
type mockDriver struct{}

func (d *mockDriver) Open(name string) (driver.Conn, error) {
	return &mockConn{}, nil
}

// mockConn implements driver.Conn.
type mockConn struct{}

func (c *mockConn) Prepare(query string) (driver.Stmt, error) {
	return &mockStmt{query: query}, nil
}

func (c *mockConn) Close() error { return nil }

func (c *mockConn) Begin() (driver.Tx, error) {
	return &mockTx{}, nil
}

// mockTx implements driver.Tx.
type mockTx struct{}

func (t *mockTx) Commit() error   { return nil }
func (t *mockTx) Rollback() error { return nil }

// Global state for controlling what the mock DB returns.
var (
	mockDBMu      sync.Mutex
	mockDBRules   []mockDBRow
	mockDBErr     error
	mockExecCalls int
)

type mockDBRow struct {
	ID             string
	TenantID       string
	Name           string
	Description    sql.NullString
	TriggerEvent   string
	ConditionsJSON []byte
	ActionsJSON    []byte
	Enabled        bool
	ScheduleJSON   []byte
	CameraIDsArr   []byte
	ZoneIDsArr     []byte
	CooldownSec    int
	Priority       int
	LastTriggered  sql.NullTime
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func setMockDBRules(rows []mockDBRow) {
	mockDBMu.Lock()
	defer mockDBMu.Unlock()
	mockDBRules = rows
	mockDBErr = nil
	mockExecCalls = 0
}

func setMockDBErr(err error) {
	mockDBMu.Lock()
	defer mockDBMu.Unlock()
	mockDBErr = err
}

func getMockExecCalls() int {
	mockDBMu.Lock()
	defer mockDBMu.Unlock()
	return mockExecCalls
}

// mockStmt implements driver.Stmt.
type mockStmt struct {
	query string
}

func (s *mockStmt) Close() error { return nil }

func (s *mockStmt) NumInput() int { return -1 } // variadic

func (s *mockStmt) Exec(args []driver.Value) (driver.Result, error) {
	mockDBMu.Lock()
	mockExecCalls++
	mockDBMu.Unlock()
	return driver.RowsAffected(1), nil
}

func (s *mockStmt) Query(args []driver.Value) (driver.Rows, error) {
	mockDBMu.Lock()
	defer mockDBMu.Unlock()

	if mockDBErr != nil {
		return nil, mockDBErr
	}

	rows := &mockRows{
		rows: mockDBRules,
		pos:  0,
	}
	return rows, nil
}

// mockRows implements driver.Rows.
type mockRows struct {
	rows []mockDBRow
	pos  int
}

func (r *mockRows) Columns() []string {
	return []string{
		"id", "tenant_id", "name", "description",
		"trigger_event", "conditions", "actions",
		"enabled", "schedule", "camera_ids", "zone_ids",
		"cooldown_sec", "priority",
		"last_triggered_at", "created_at", "updated_at",
	}
}

func (r *mockRows) Close() error { return nil }

func (r *mockRows) Next(dest []driver.Value) error {
	if r.pos >= len(r.rows) {
		return fmt.Errorf("EOF") // signals end of rows
	}
	row := r.rows[r.pos]
	r.pos++

	dest[0] = row.ID
	dest[1] = row.TenantID
	dest[2] = row.Name
	if row.Description.Valid {
		dest[3] = row.Description.String
	} else {
		dest[3] = ""
	}
	dest[4] = row.TriggerEvent
	dest[5] = row.ConditionsJSON
	dest[6] = row.ActionsJSON
	dest[7] = row.Enabled
	dest[8] = row.ScheduleJSON
	dest[9] = row.CameraIDsArr
	dest[10] = row.ZoneIDsArr
	dest[11] = int64(row.CooldownSec)
	dest[12] = int64(row.Priority)
	if row.LastTriggered.Valid {
		dest[13] = row.LastTriggered.Time
	} else {
		dest[13] = nil
	}
	dest[14] = row.CreatedAt
	dest[15] = row.UpdatedAt

	return nil
}

// -----------------------------------------------------------------------
// Minimal mock Redis client.
// The RuleEngine uses rdb.Exists() for cooldown and rdb.Set() for setting
// cooldowns. We provide a mock that satisfies the interface.
// -----------------------------------------------------------------------

// Since we cannot easily mock the redis.Client struct (it's a concrete type),
// we test the exported functions that don't require Redis, and test the
// higher-level behavior with the buildEventData and ruleMatchesEvent helpers
// that are testable without Redis.
// For the full EvaluateEvent flow, we test the subset of logic that can be
// unit-tested without external dependencies.
// -----------------------------------------------------------------------

func TestBuildEventData(t *testing.T) {
	event := events.Event{
		ID:        "evt-1",
		CameraID:  "cam-1",
		ZoneID:    "zone-front",
		TenantID:  "tenant-1",
		Type:      "motion",
		Severity:  "high",
		Intensity: 0.85,
		ClipPath:  "/clips/evt-1.mp4",
		Metadata: map[string]interface{}{
			"confidence": 0.95,
			"label":      "person",
		},
	}

	data := buildEventData(event)

	tests := []struct {
		key  string
		want interface{}
	}{
		{"type", "motion"},
		{"severity", "high"},
		{"intensity", 0.85},
		{"camera_id", "cam-1"},
		{"zone_id", "zone-front"},
		{"tenant_id", "tenant-1"},
		{"clip_path", "/clips/evt-1.mp4"},
		{"confidence", 0.95},
		{"label", "person"},
	}

	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			got, ok := data[tt.key]
			if !ok {
				t.Fatalf("key %q not found in data", tt.key)
			}
			if fmt.Sprintf("%v", got) != fmt.Sprintf("%v", tt.want) {
				t.Errorf("data[%q] = %v, want %v", tt.key, got, tt.want)
			}
		})
	}
}

func TestBuildEventData_EmptyMetadata(t *testing.T) {
	event := events.Event{
		Type:     "motion",
		Metadata: nil,
	}
	data := buildEventData(event)
	if data["type"] != "motion" {
		t.Error("expected type to be set")
	}
}

func TestRuleMatchesEvent(t *testing.T) {
	engine := &RuleEngine{
		logger: slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})),
	}

	tests := []struct {
		name  string
		rule  AlertRule
		event events.Event
		want  bool
	}{
		{
			name:  "matching trigger event",
			rule:  AlertRule{TriggerEvent: "motion"},
			event: events.Event{Type: "motion"},
			want:  true,
		},
		{
			name:  "non-matching trigger event",
			rule:  AlertRule{TriggerEvent: "motion"},
			event: events.Event{Type: "person"},
			want:  false,
		},
		{
			name:  "camera filter - match",
			rule:  AlertRule{TriggerEvent: "motion", CameraIDs: []string{"cam-1", "cam-2"}},
			event: events.Event{Type: "motion", CameraID: "cam-1"},
			want:  true,
		},
		{
			name:  "camera filter - no match",
			rule:  AlertRule{TriggerEvent: "motion", CameraIDs: []string{"cam-1", "cam-2"}},
			event: events.Event{Type: "motion", CameraID: "cam-3"},
			want:  false,
		},
		{
			name:  "zone filter - match",
			rule:  AlertRule{TriggerEvent: "motion", ZoneIDs: []string{"zone-front"}},
			event: events.Event{Type: "motion", ZoneID: "zone-front"},
			want:  true,
		},
		{
			name:  "zone filter - no match",
			rule:  AlertRule{TriggerEvent: "motion", ZoneIDs: []string{"zone-front"}},
			event: events.Event{Type: "motion", ZoneID: "zone-back"},
			want:  false,
		},
		{
			name:  "zone filter - empty event zone passes",
			rule:  AlertRule{TriggerEvent: "motion", ZoneIDs: []string{"zone-front"}},
			event: events.Event{Type: "motion", ZoneID: ""},
			want:  true,
		},
		{
			name:  "no camera or zone filter",
			rule:  AlertRule{TriggerEvent: "motion"},
			event: events.Event{Type: "motion", CameraID: "cam-99", ZoneID: "zone-99"},
			want:  true,
		},
		{
			name: "camera and zone filter - both match",
			rule: AlertRule{
				TriggerEvent: "motion",
				CameraIDs:    []string{"cam-1"},
				ZoneIDs:      []string{"zone-front"},
			},
			event: events.Event{Type: "motion", CameraID: "cam-1", ZoneID: "zone-front"},
			want:  true,
		},
		{
			name: "camera matches but zone doesn't",
			rule: AlertRule{
				TriggerEvent: "motion",
				CameraIDs:    []string{"cam-1"},
				ZoneIDs:      []string{"zone-front"},
			},
			event: events.Event{Type: "motion", CameraID: "cam-1", ZoneID: "zone-back"},
			want:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := engine.ruleMatchesEvent(tt.rule, tt.event)
			if got != tt.want {
				t.Errorf("ruleMatchesEvent() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsWithinSchedule_NoSchedule(t *testing.T) {
	engine := &RuleEngine{
		logger: slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})),
	}

	// No schedule means always active.
	if !engine.isWithinSchedule(nil) {
		t.Error("expected nil schedule to return true")
	}

	// Empty windows means always active.
	if !engine.isWithinSchedule(&Schedule{Timezone: "UTC", Windows: []ScheduleWindow{}}) {
		t.Error("expected empty windows to return true")
	}
}

func TestIsWithinSchedule_InvalidTimezone(t *testing.T) {
	engine := &RuleEngine{
		logger: slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})),
	}

	// Invalid timezone should return true (fail-open).
	sched := &Schedule{
		Timezone: "Invalid/Timezone",
		Windows: []ScheduleWindow{
			{DaysOfWeek: []int{0, 1, 2, 3, 4, 5, 6}, StartTime: "00:00", EndTime: "23:59"},
		},
	}
	if !engine.isWithinSchedule(sched) {
		t.Error("expected invalid timezone to return true (fail-open)")
	}
}

func TestIsWithinSchedule_CurrentTimeInWindow(t *testing.T) {
	engine := &RuleEngine{
		logger: slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})),
	}

	// Build a schedule that covers all days 00:00-23:59 in UTC.
	sched := &Schedule{
		Timezone: "UTC",
		Windows: []ScheduleWindow{
			{DaysOfWeek: []int{0, 1, 2, 3, 4, 5, 6}, StartTime: "00:00", EndTime: "23:59"},
		},
	}
	if !engine.isWithinSchedule(sched) {
		t.Error("expected schedule covering all times to return true")
	}
}

func TestParsePostgresArray(t *testing.T) {
	tests := []struct {
		input string
		want  []string
	}{
		{"{a,b,c}", []string{"a", "b", "c"}},
		{"{}", nil},
		{"{single}", []string{"single"}},
		{"{cam-1,cam-2}", []string{"cam-1", "cam-2"}},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := parsePostgresArray(tt.input)
			if tt.want == nil && got != nil {
				t.Errorf("parsePostgresArray(%q) = %v, want nil", tt.input, got)
				return
			}
			if len(got) != len(tt.want) {
				t.Errorf("parsePostgresArray(%q) length = %d, want %d", tt.input, len(got), len(tt.want))
				return
			}
			for i, v := range got {
				if v != tt.want[i] {
					t.Errorf("parsePostgresArray(%q)[%d] = %q, want %q", tt.input, i, v, tt.want[i])
				}
			}
		})
	}
}

func TestContainsString(t *testing.T) {
	tests := []struct {
		slice []string
		val   string
		want  bool
	}{
		{[]string{"a", "b", "c"}, "b", true},
		{[]string{"a", "b", "c"}, "d", false},
		{[]string{}, "a", false},
		{nil, "a", false},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%v/%s", tt.slice, tt.val), func(t *testing.T) {
			if got := containsString(tt.slice, tt.val); got != tt.want {
				t.Errorf("containsString(%v, %q) = %v, want %v", tt.slice, tt.val, got, tt.want)
			}
		})
	}
}

func TestContainsInt(t *testing.T) {
	tests := []struct {
		slice []int
		val   int
		want  bool
	}{
		{[]int{0, 1, 2, 3}, 2, true},
		{[]int{0, 1, 2, 3}, 5, false},
		{[]int{}, 0, false},
		{nil, 0, false},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%v/%d", tt.slice, tt.val), func(t *testing.T) {
			if got := containsInt(tt.slice, tt.val); got != tt.want {
				t.Errorf("containsInt(%v, %d) = %v, want %v", tt.slice, tt.val, got, tt.want)
			}
		})
	}
}

func TestCacheInvalidation(t *testing.T) {
	engine := &RuleEngine{
		logger: slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})),
		cache:  make(map[string][]AlertRule),
	}

	// Pre-populate cache.
	engine.cache["tenant-1"] = []AlertRule{{ID: "rule-1"}}
	engine.cache["tenant-2"] = []AlertRule{{ID: "rule-2"}}

	// Invalidate one tenant.
	engine.invalidateCache("tenant-1")

	if _, ok := engine.cache["tenant-1"]; ok {
		t.Error("expected tenant-1 cache to be invalidated")
	}
	if _, ok := engine.cache["tenant-2"]; !ok {
		t.Error("expected tenant-2 cache to remain")
	}

	// Invalidate nonexistent tenant should not panic.
	engine.invalidateCache("tenant-nonexistent")
}

func TestConditionsActionsJSON(t *testing.T) {
	// Test that our condition and action models serialize/deserialize correctly.
	condition := ConditionNode{
		Logic: "and",
		Children: []ConditionNode{
			{Field: "type", Operator: "eq", Value: "motion"},
			{Field: "intensity", Operator: "gt", Value: 0.5},
		},
	}

	data, err := json.Marshal(condition)
	if err != nil {
		t.Fatalf("marshal condition: %v", err)
	}

	var parsed ConditionNode
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal condition: %v", err)
	}

	if parsed.Logic != "and" {
		t.Errorf("Logic = %q, want and", parsed.Logic)
	}
	if len(parsed.Children) != 2 {
		t.Fatalf("expected 2 children, got %d", len(parsed.Children))
	}
	if parsed.Children[0].Field != "type" {
		t.Errorf("first child field = %q, want type", parsed.Children[0].Field)
	}

	// Test actions round-trip.
	actions := []Action{
		{Type: "push_notification", Config: map[string]interface{}{"title": "Alert"}},
		{Type: "webhook", Config: map[string]interface{}{"url": "https://example.com/hook"}},
	}

	actData, err := json.Marshal(actions)
	if err != nil {
		t.Fatalf("marshal actions: %v", err)
	}

	var parsedActions []Action
	if err := json.Unmarshal(actData, &parsedActions); err != nil {
		t.Fatalf("unmarshal actions: %v", err)
	}

	if len(parsedActions) != 2 {
		t.Fatalf("expected 2 actions, got %d", len(parsedActions))
	}
	if parsedActions[0].Type != "push_notification" {
		t.Errorf("first action type = %q, want push_notification", parsedActions[0].Type)
	}
}

func TestMatchedRule_Structure(t *testing.T) {
	rule := AlertRule{
		ID:           "rule-1",
		TenantID:     "tenant-1",
		Name:         "Motion Alert",
		TriggerEvent: "motion",
		Enabled:      true,
		Priority:     1,
	}

	matched := MatchedRule{
		Rule:    rule,
		EventID: "evt-123",
	}

	if matched.Rule.ID != "rule-1" {
		t.Errorf("expected rule ID rule-1, got %s", matched.Rule.ID)
	}
	if matched.EventID != "evt-123" {
		t.Errorf("expected event ID evt-123, got %s", matched.EventID)
	}
}
