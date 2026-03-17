package events

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// EventRepository defines the interface for event persistence.
type EventRepository interface {
	CreateEvent(ctx context.Context, event Event) (string, error)
	GetEvent(ctx context.Context, id string) (*Event, error)
	ListEvents(ctx context.Context, filter EventFilter) ([]Event, error)
	AcknowledgeEvent(ctx context.Context, id, userID string) error
}

// PostgresEventRepository implements EventRepository using PostgreSQL.
type PostgresEventRepository struct {
	db *sql.DB
}

// NewPostgresEventRepository creates a new PostgresEventRepository.
func NewPostgresEventRepository(db *sql.DB) *PostgresEventRepository {
	return &PostgresEventRepository{db: db}
}

// CreateEvent inserts a new event into the database and returns the generated ID.
func (r *PostgresEventRepository) CreateEvent(ctx context.Context, event Event) (string, error) {
	metadataJSON, err := json.Marshal(event.Metadata)
	if err != nil {
		return "", fmt.Errorf("marshal metadata: %w", err)
	}

	var id string
	err = r.db.QueryRowContext(ctx,
		`INSERT INTO events (camera_id, zone_id, tenant_id, type, severity, detected_at, metadata, snapshot_id, clip_path, intensity)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id`,
		event.CameraID,
		nullString(event.ZoneID),
		event.TenantID,
		event.Type,
		event.Severity,
		event.DetectedAt,
		metadataJSON,
		nullString(event.SnapshotID),
		nullString(event.ClipPath),
		event.Intensity,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert event: %w", err)
	}

	return id, nil
}

// GetEvent retrieves a single event by ID.
func (r *PostgresEventRepository) GetEvent(ctx context.Context, id string) (*Event, error) {
	var (
		event        Event
		metadataJSON []byte
		zoneID       sql.NullString
		snapshotID   sql.NullString
		clipPath     sql.NullString
		ackedBy      sql.NullString
		ackedAt      sql.NullTime
	)

	err := r.db.QueryRowContext(ctx,
		`SELECT id, camera_id, zone_id, tenant_id, type, severity, detected_at,
		        metadata, snapshot_id, clip_path, intensity, acknowledged,
		        acknowledged_by, acknowledged_at, created_at
		 FROM events WHERE id = $1`, id,
	).Scan(
		&event.ID, &event.CameraID, &zoneID, &event.TenantID,
		&event.Type, &event.Severity, &event.DetectedAt,
		&metadataJSON, &snapshotID, &clipPath, &event.Intensity,
		&event.Acknowledged, &ackedBy, &ackedAt, &event.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get event %s: %w", id, err)
	}

	event.ZoneID = zoneID.String
	event.SnapshotID = snapshotID.String
	event.ClipPath = clipPath.String
	event.AcknowledgedBy = ackedBy.String
	if ackedAt.Valid {
		event.AcknowledgedAt = &ackedAt.Time
	}

	if err := json.Unmarshal(metadataJSON, &event.Metadata); err != nil {
		return nil, fmt.Errorf("unmarshal metadata: %w", err)
	}

	return &event, nil
}

// ListEvents retrieves events matching the given filter.
func (r *PostgresEventRepository) ListEvents(ctx context.Context, filter EventFilter) ([]Event, error) {
	var (
		conditions []string
		args       []interface{}
		argIdx     int
	)

	addCondition := func(clause string, val interface{}) {
		argIdx++
		conditions = append(conditions, fmt.Sprintf(clause, argIdx))
		args = append(args, val)
	}

	if filter.TenantID != "" {
		addCondition("tenant_id = $%d", filter.TenantID)
	}
	if filter.CameraID != "" {
		addCondition("camera_id = $%d", filter.CameraID)
	}
	if filter.ZoneID != "" {
		addCondition("zone_id = $%d", filter.ZoneID)
	}
	if filter.Type != "" {
		addCondition("type = $%d", filter.Type)
	}
	if filter.Severity != "" {
		addCondition("severity = $%d", filter.Severity)
	}
	if filter.Since != nil {
		addCondition("detected_at >= $%d", *filter.Since)
	}
	if filter.Until != nil {
		addCondition("detected_at <= $%d", *filter.Until)
	}
	if filter.Unacked {
		conditions = append(conditions, "acknowledged = false")
	}

	query := "SELECT id, camera_id, zone_id, tenant_id, type, severity, detected_at, metadata, snapshot_id, clip_path, intensity, acknowledged, acknowledged_by, acknowledged_at, created_at FROM events"
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY detected_at DESC"

	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	}
	argIdx++
	query += fmt.Sprintf(" LIMIT $%d", argIdx)
	args = append(args, limit)

	if filter.Offset > 0 {
		argIdx++
		query += fmt.Sprintf(" OFFSET $%d", argIdx)
		args = append(args, filter.Offset)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}
	defer rows.Close()

	var results []Event
	for rows.Next() {
		var (
			event        Event
			metadataJSON []byte
			zoneID       sql.NullString
			snapshotID   sql.NullString
			clipPath     sql.NullString
			ackedBy      sql.NullString
			ackedAt      sql.NullTime
		)

		if err := rows.Scan(
			&event.ID, &event.CameraID, &zoneID, &event.TenantID,
			&event.Type, &event.Severity, &event.DetectedAt,
			&metadataJSON, &snapshotID, &clipPath, &event.Intensity,
			&event.Acknowledged, &ackedBy, &ackedAt, &event.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan event row: %w", err)
		}

		event.ZoneID = zoneID.String
		event.SnapshotID = snapshotID.String
		event.ClipPath = clipPath.String
		event.AcknowledgedBy = ackedBy.String
		if ackedAt.Valid {
			event.AcknowledgedAt = &ackedAt.Time
		}

		if err := json.Unmarshal(metadataJSON, &event.Metadata); err != nil {
			return nil, fmt.Errorf("unmarshal metadata: %w", err)
		}

		results = append(results, event)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate event rows: %w", err)
	}

	return results, nil
}

// AcknowledgeEvent marks an event as acknowledged by the given user.
func (r *PostgresEventRepository) AcknowledgeEvent(ctx context.Context, id, userID string) error {
	now := time.Now().UTC()
	result, err := r.db.ExecContext(ctx,
		`UPDATE events SET acknowledged = true, acknowledged_by = $1, acknowledged_at = $2
		 WHERE id = $3 AND acknowledged = false`,
		userID, now, id,
	)
	if err != nil {
		return fmt.Errorf("acknowledge event %s: %w", id, err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("event %s not found or already acknowledged", id)
	}

	return nil
}

// nullString returns a sql.NullString from a plain string.
func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}
