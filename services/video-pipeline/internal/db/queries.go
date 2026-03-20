package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/MatiDes12/osp/services/video-pipeline/internal/dualdb"
)

// Queries wraps a pgx pool and provides typed database operations.
type Queries struct {
	pool      *pgxpool.Pool
	cloudPool *pgxpool.Pool // optional — writes are mirrored here in the background
}

// NewQueries creates a Queries instance from a connection pool.
// Pass a non-nil cloudPool to enable dual-write mirroring.
func NewQueries(pool *pgxpool.Pool, cloudPool *pgxpool.Pool) *Queries {
	return &Queries{pool: pool, cloudPool: cloudPool}
}

// Recording represents a row from the recordings table.
type Recording struct {
	ID             string
	CameraID       string
	TenantID       string
	StartTime      time.Time
	EndTime        *time.Time
	DurationSec    *int32
	StoragePath    string
	SizeBytes      int64
	Format         string
	Trigger        string
	Status         string
	RetentionUntil time.Time
	CreatedAt      time.Time
}

// CreateRecordingParams holds parameters for creating a new recording row.
type CreateRecordingParams struct {
	CameraID       string
	TenantID       string
	Trigger        string
	Status         string
	RetentionUntil time.Time
}

// CreateRecording inserts a new recording row and returns it.
func (q *Queries) CreateRecording(ctx context.Context, params CreateRecordingParams) (Recording, error) {
	var rec Recording
	err := q.pool.QueryRow(ctx,
		`INSERT INTO recordings (camera_id, tenant_id, start_time, storage_path, trigger, status, retention_until)
		 VALUES ($1::uuid, $2::uuid, now(), '', $3::recording_trigger, $4::recording_status, $5)
		 RETURNING id, camera_id, tenant_id, start_time, storage_path, trigger, status, retention_until, created_at`,
		params.CameraID, params.TenantID, params.Trigger, params.Status, params.RetentionUntil,
	).Scan(
		&rec.ID, &rec.CameraID, &rec.TenantID, &rec.StartTime,
		&rec.StoragePath, &rec.Trigger, &rec.Status, &rec.RetentionUntil, &rec.CreatedAt,
	)
	if err != nil {
		return Recording{}, fmt.Errorf("insert recording: %w", err)
	}
	// Mirror to cloud using the already-known ID so both DBs share the same UUID.
	dualdb.FireExec(q.cloudPool,
		`INSERT INTO recordings (id, camera_id, tenant_id, start_time, storage_path, trigger, status, retention_until)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, '', $5::recording_trigger, $6::recording_status, $7) ON CONFLICT DO NOTHING`,
		rec.ID, rec.CameraID, rec.TenantID, rec.StartTime, rec.Trigger, rec.Status, rec.RetentionUntil,
	)
	return rec, nil
}

// UpdateRecordingStatus sets the status of a recording.
func (q *Queries) UpdateRecordingStatus(ctx context.Context, recordingID, status string) error {
	const sql = `UPDATE recordings SET status = $1::recording_status WHERE id = $2::uuid`
	_, err := q.pool.Exec(ctx, sql, status, recordingID)
	if err != nil {
		return fmt.Errorf("update recording status: %w", err)
	}
	dualdb.FireExec(q.cloudPool, sql, status, recordingID)
	return nil
}

// UpdateRecordingStoragePath sets the storage path for a recording.
func (q *Queries) UpdateRecordingStoragePath(ctx context.Context, recordingID, storagePath string) error {
	const sql = `UPDATE recordings SET storage_path = $1 WHERE id = $2::uuid`
	_, err := q.pool.Exec(ctx, sql, storagePath, recordingID)
	if err != nil {
		return fmt.Errorf("update storage path: %w", err)
	}
	dualdb.FireExec(q.cloudPool, sql, storagePath, recordingID)
	return nil
}

// FinalizeRecording marks a recording as complete with its duration and end time.
func (q *Queries) FinalizeRecording(ctx context.Context, recordingID string, durationSec int32) error {
	const sql = `UPDATE recordings
		 SET status = 'complete'::recording_status,
		     end_time = now(),
		     duration_sec = $1
		 WHERE id = $2::uuid`
	_, err := q.pool.Exec(ctx, sql, durationSec, recordingID)
	if err != nil {
		return fmt.Errorf("finalize recording: %w", err)
	}
	dualdb.FireExec(q.cloudPool, sql, durationSec, recordingID)
	return nil
}

// GetRecording retrieves a recording by ID.
func (q *Queries) GetRecording(ctx context.Context, recordingID string) (Recording, error) {
	var rec Recording
	err := q.pool.QueryRow(ctx,
		`SELECT id, camera_id, tenant_id, start_time, end_time, duration_sec,
		        storage_path, size_bytes, format, trigger, status, retention_until, created_at
		 FROM recordings WHERE id = $1::uuid`,
		recordingID,
	).Scan(
		&rec.ID, &rec.CameraID, &rec.TenantID, &rec.StartTime, &rec.EndTime,
		&rec.DurationSec, &rec.StoragePath, &rec.SizeBytes, &rec.Format,
		&rec.Trigger, &rec.Status, &rec.RetentionUntil, &rec.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return Recording{}, fmt.Errorf("recording %s not found", recordingID)
		}
		return Recording{}, fmt.Errorf("get recording: %w", err)
	}
	return rec, nil
}

// TimelineSegment represents a contiguous recording segment for timeline display.
type TimelineSegment struct {
	RecordingID string
	StartTime   time.Time
	EndTime     *time.Time
	Trigger     string
}

// GetRecordingsForDate retrieves all recordings for a camera on a specific date.
func (q *Queries) GetRecordingsForDate(ctx context.Context, cameraID, tenantID string, date time.Time) ([]TimelineSegment, error) {
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endOfDay := startOfDay.Add(24 * time.Hour)

	rows, err := q.pool.Query(ctx,
		`SELECT id, start_time, end_time, trigger
		 FROM recordings
		 WHERE camera_id = $1::uuid
		   AND tenant_id = $2::uuid
		   AND start_time >= $3
		   AND start_time < $4
		   AND status != 'deleted'
		 ORDER BY start_time ASC`,
		cameraID, tenantID, startOfDay, endOfDay,
	)
	if err != nil {
		return nil, fmt.Errorf("query recordings for date: %w", err)
	}
	defer rows.Close()

	var segments []TimelineSegment
	for rows.Next() {
		var seg TimelineSegment
		if err := rows.Scan(&seg.RecordingID, &seg.StartTime, &seg.EndTime, &seg.Trigger); err != nil {
			return nil, fmt.Errorf("scan timeline segment: %w", err)
		}
		segments = append(segments, seg)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate timeline rows: %w", err)
	}
	return segments, nil
}

// ExpiredRecording holds minimal info needed for retention cleanup.
type ExpiredRecording struct {
	ID          string
	TenantID    string
	CameraID    string
	StoragePath string
}

// FindExpiredRecordings returns recordings past their retention date.
func (q *Queries) FindExpiredRecordings(ctx context.Context, batchSize int) ([]ExpiredRecording, error) {
	rows, err := q.pool.Query(ctx,
		`SELECT id, tenant_id, camera_id, storage_path
		 FROM recordings
		 WHERE retention_until < now()
		   AND status != 'deleted'
		 ORDER BY retention_until ASC
		 LIMIT $1`,
		batchSize,
	)
	if err != nil {
		return nil, fmt.Errorf("query expired recordings: %w", err)
	}
	defer rows.Close()

	var expired []ExpiredRecording
	for rows.Next() {
		var r ExpiredRecording
		if err := rows.Scan(&r.ID, &r.TenantID, &r.CameraID, &r.StoragePath); err != nil {
			return nil, fmt.Errorf("scan expired recording: %w", err)
		}
		expired = append(expired, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate expired rows: %w", err)
	}
	return expired, nil
}

// Snapshot represents a row from the snapshots table.
type Snapshot struct {
	ID          string
	CameraID    string
	RecordingID *string
	TenantID    string
	CapturedAt  time.Time
	StoragePath string
	SizeBytes   int
	CreatedAt   time.Time
}

// CreateSnapshotParams holds parameters for creating a snapshot row.
type CreateSnapshotParams struct {
	CameraID    string
	RecordingID *string
	TenantID    string
	StoragePath string
	SizeBytes   int
}

// CreateSnapshot inserts a new snapshot row and returns it.
func (q *Queries) CreateSnapshot(ctx context.Context, params CreateSnapshotParams) (Snapshot, error) {
	var snap Snapshot
	err := q.pool.QueryRow(ctx,
		`INSERT INTO snapshots (camera_id, recording_id, tenant_id, storage_path, size_bytes)
		 VALUES ($1::uuid, $2, $3::uuid, $4, $5)
		 RETURNING id, camera_id, recording_id, tenant_id, captured_at, storage_path, size_bytes, created_at`,
		params.CameraID, params.RecordingID, params.TenantID, params.StoragePath, params.SizeBytes,
	).Scan(
		&snap.ID, &snap.CameraID, &snap.RecordingID, &snap.TenantID,
		&snap.CapturedAt, &snap.StoragePath, &snap.SizeBytes, &snap.CreatedAt,
	)
	if err != nil {
		return Snapshot{}, fmt.Errorf("insert snapshot: %w", err)
	}
	// Mirror to cloud using the already-known ID.
	dualdb.FireExec(q.cloudPool,
		`INSERT INTO snapshots (id, camera_id, recording_id, tenant_id, storage_path, size_bytes)
		 VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6) ON CONFLICT DO NOTHING`,
		snap.ID, snap.CameraID, snap.RecordingID, snap.TenantID, snap.StoragePath, snap.SizeBytes,
	)
	return snap, nil
}
