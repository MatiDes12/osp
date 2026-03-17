package rules

import "time"

// AlertRule represents a tenant alert rule stored in the database.
type AlertRule struct {
	ID              string          `json:"id"`
	TenantID        string          `json:"tenant_id"`
	Name            string          `json:"name"`
	Description     string          `json:"description"`
	TriggerEvent    string          `json:"trigger_event"`
	Conditions      ConditionNode   `json:"conditions"`
	Actions         []Action        `json:"actions"`
	Enabled         bool            `json:"enabled"`
	Schedule        *Schedule       `json:"schedule,omitempty"`
	CameraIDs       []string        `json:"camera_ids,omitempty"`
	ZoneIDs         []string        `json:"zone_ids,omitempty"`
	CooldownSec     int             `json:"cooldown_sec"`
	Priority        int             `json:"priority"`
	LastTriggeredAt *time.Time      `json:"last_triggered_at,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// ConditionNode represents a node in the condition evaluation tree.
// A node is either a logical group (AND/OR with children) or a leaf
// comparison (field + operator + value).
type ConditionNode struct {
	Logic    string          `json:"logic,omitempty"`    // "and" or "or" for group nodes
	Children []ConditionNode `json:"children,omitempty"` // child nodes for group
	Field    string          `json:"field,omitempty"`    // data field path for leaf
	Operator string          `json:"operator,omitempty"` // eq, neq, gt, gte, lt, lte, contains, not_contains, in
	Value    interface{}     `json:"value,omitempty"`    // comparison value
}

// Action defines what happens when a rule matches.
type Action struct {
	Type   string                 `json:"type"`   // push_notification, email, webhook, start_recording
	Config map[string]interface{} `json:"config"` // action-specific configuration
}

// Schedule defines when a rule is active.
type Schedule struct {
	Timezone string           `json:"timezone"`
	Windows  []ScheduleWindow `json:"windows"`
}

// ScheduleWindow defines a time window for rule activation.
type ScheduleWindow struct {
	DaysOfWeek []int  `json:"days_of_week"` // 0=Sunday, 6=Saturday
	StartTime  string `json:"start_time"`   // "HH:MM" in 24h format
	EndTime    string `json:"end_time"`     // "HH:MM" in 24h format
}

// MatchedRule contains a rule that matched an event along with context.
type MatchedRule struct {
	Rule    AlertRule
	EventID string
}
