package events

import "time"

// Event represents a detected event from a camera.
type Event struct {
	ID             string                 `json:"id"`
	CameraID       string                 `json:"camera_id"`
	ZoneID         string                 `json:"zone_id,omitempty"`
	TenantID       string                 `json:"tenant_id"`
	Type           string                 `json:"type"`
	Severity       string                 `json:"severity"`
	DetectedAt     time.Time              `json:"detected_at"`
	Metadata       map[string]interface{} `json:"metadata"`
	SnapshotID     string                 `json:"snapshot_id,omitempty"`
	ClipPath       string                 `json:"clip_path,omitempty"`
	Intensity      float64                `json:"intensity"`
	Acknowledged   bool                   `json:"acknowledged"`
	AcknowledgedBy string                 `json:"acknowledged_by,omitempty"`
	AcknowledgedAt *time.Time             `json:"acknowledged_at,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
}

// EventFilter specifies criteria for listing events.
type EventFilter struct {
	TenantID   string
	CameraID   string
	ZoneID     string
	Type       string
	Severity   string
	Since      *time.Time
	Until      *time.Time
	Unacked    bool
	Limit      int
	Offset     int
}
