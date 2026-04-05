package playback

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

// -----------------------------------------------------------------------
// Mock interfaces for testing PlaybackService without real DB or R2.
//
// The real Service depends on *db.Queries and *storage.R2Storage, which are
// concrete types. To test without those external dependencies, we define
// interfaces and a testable wrapper that uses them.
// -----------------------------------------------------------------------

// RecordingStore abstracts the database calls used by the playback service.
type RecordingStore interface {
	GetRecording(ctx context.Context, recordingID string) (mockRecording, error)
	GetRecordingsForDate(ctx context.Context, cameraID, tenantID string, date time.Time) ([]mockTimelineSegment, error)
}

// URLSigner abstracts pre-signed URL generation.
type URLSigner interface {
	GeneratePresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error)
}

// mockRecording mirrors db.Recording fields used by the playback service.
type mockRecording struct {
	ID          string
	TenantID    string
	Status      string
	StoragePath string
}

// mockTimelineSegment mirrors db.TimelineSegment.
type mockTimelineSegment struct {
	RecordingID string
	StartTime   time.Time
	EndTime     *time.Time
	Trigger     string
}

// testPlaybackService is a test-friendly version of the playback service.
type testPlaybackService struct {
	store  RecordingStore
	signer URLSigner
}

// GetPlaybackURL mirrors the real service logic.
func (s *testPlaybackService) GetPlaybackURL(ctx context.Context, recordingID, tenantID string) (string, error) {
	rec, err := s.store.GetRecording(ctx, recordingID)
	if err != nil {
		return "", fmt.Errorf("get recording: %w", err)
	}

	if rec.TenantID != tenantID {
		return "", fmt.Errorf("recording %s does not belong to tenant %s", recordingID, tenantID)
	}

	if rec.Status == "deleted" {
		return "", fmt.Errorf("recording %s has been deleted", recordingID)
	}

	playlistKey := rec.StoragePath + "/playlist.m3u8"
	expiry := 1 * time.Hour

	url, err := s.signer.GeneratePresignedURL(ctx, playlistKey, expiry)
	if err != nil {
		return "", fmt.Errorf("generate presigned URL: %w", err)
	}

	return url, nil
}

// GetTimeline mirrors the real service logic.
func (s *testPlaybackService) GetTimeline(ctx context.Context, cameraID, tenantID string, date time.Time) ([]TimelineSegment, error) {
	dbSegments, err := s.store.GetRecordingsForDate(ctx, cameraID, tenantID, date)
	if err != nil {
		return nil, fmt.Errorf("get timeline: %w", err)
	}

	segments := make([]TimelineSegment, 0, len(dbSegments))
	for _, seg := range dbSegments {
		segments = append(segments, TimelineSegment{
			RecordingID: seg.RecordingID,
			StartTime:   seg.StartTime,
			EndTime:     seg.EndTime,
			Trigger:     seg.Trigger,
		})
	}
	return segments, nil
}

// --- Mock implementations ---

type mockRecordingStore struct {
	recordings map[string]mockRecording
	timeline   map[string][]mockTimelineSegment // key: cameraID+tenantID+date
	getErr     error
	timeErr    error
}

func (m *mockRecordingStore) GetRecording(_ context.Context, recordingID string) (mockRecording, error) {
	if m.getErr != nil {
		return mockRecording{}, m.getErr
	}
	rec, ok := m.recordings[recordingID]
	if !ok {
		return mockRecording{}, fmt.Errorf("recording %s not found", recordingID)
	}
	return rec, nil
}

func (m *mockRecordingStore) GetRecordingsForDate(_ context.Context, cameraID, tenantID string, date time.Time) ([]mockTimelineSegment, error) {
	if m.timeErr != nil {
		return nil, m.timeErr
	}
	key := cameraID + ":" + tenantID + ":" + date.Format("2006-01-02")
	return m.timeline[key], nil
}

type mockURLSigner struct {
	urls map[string]string
	err  error
}

func (m *mockURLSigner) GeneratePresignedURL(_ context.Context, key string, _ time.Duration) (string, error) {
	if m.err != nil {
		return "", m.err
	}
	url, ok := m.urls[key]
	if !ok {
		return "https://r2.example.com/" + key + "?signed=1", nil
	}
	return url, nil
}

// --- Tests ---

func TestGetPlaybackURL_Success(t *testing.T) {
	store := &mockRecordingStore{
		recordings: map[string]mockRecording{
			"rec-1": {
				ID:          "rec-1",
				TenantID:    "tenant-1",
				Status:      "complete",
				StoragePath: "tenants/tenant-1/cameras/cam-1/2024/01/15/rec-1",
			},
		},
	}
	signer := &mockURLSigner{}
	svc := &testPlaybackService{store: store, signer: signer}

	url, err := svc.GetPlaybackURL(context.Background(), "rec-1", "tenant-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if url == "" {
		t.Fatal("expected non-empty URL")
	}
	if !strings.Contains(url, "playlist.m3u8") {
		t.Errorf("URL %q does not contain playlist.m3u8", url)
	}
	if !strings.Contains(url, "signed") {
		t.Errorf("URL %q does not look signed", url)
	}
}

func TestGetPlaybackURL_WrongTenant(t *testing.T) {
	store := &mockRecordingStore{
		recordings: map[string]mockRecording{
			"rec-1": {
				ID:          "rec-1",
				TenantID:    "tenant-1",
				Status:      "complete",
				StoragePath: "tenants/tenant-1/recordings/rec-1",
			},
		},
	}
	signer := &mockURLSigner{}
	svc := &testPlaybackService{store: store, signer: signer}

	_, err := svc.GetPlaybackURL(context.Background(), "rec-1", "tenant-2")
	if err == nil {
		t.Fatal("expected error for wrong tenant")
	}
	if !strings.Contains(err.Error(), "does not belong to tenant") {
		t.Errorf("error = %q, expected tenant mismatch", err.Error())
	}
}

func TestGetPlaybackURL_RecordingNotFound(t *testing.T) {
	store := &mockRecordingStore{
		recordings: map[string]mockRecording{},
	}
	signer := &mockURLSigner{}
	svc := &testPlaybackService{store: store, signer: signer}

	_, err := svc.GetPlaybackURL(context.Background(), "nonexistent", "tenant-1")
	if err == nil {
		t.Fatal("expected error for nonexistent recording")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("error = %q, expected 'not found'", err.Error())
	}
}

func TestGetPlaybackURL_DeletedRecording(t *testing.T) {
	store := &mockRecordingStore{
		recordings: map[string]mockRecording{
			"rec-deleted": {
				ID:          "rec-deleted",
				TenantID:    "tenant-1",
				Status:      "deleted",
				StoragePath: "tenants/tenant-1/recordings/rec-deleted",
			},
		},
	}
	signer := &mockURLSigner{}
	svc := &testPlaybackService{store: store, signer: signer}

	_, err := svc.GetPlaybackURL(context.Background(), "rec-deleted", "tenant-1")
	if err == nil {
		t.Fatal("expected error for deleted recording")
	}
	if !strings.Contains(err.Error(), "has been deleted") {
		t.Errorf("error = %q, expected 'has been deleted'", err.Error())
	}
}

func TestGetPlaybackURL_SignerError(t *testing.T) {
	store := &mockRecordingStore{
		recordings: map[string]mockRecording{
			"rec-1": {
				ID:          "rec-1",
				TenantID:    "tenant-1",
				Status:      "complete",
				StoragePath: "tenants/tenant-1/recordings/rec-1",
			},
		},
	}
	signer := &mockURLSigner{err: fmt.Errorf("R2 unavailable")}
	svc := &testPlaybackService{store: store, signer: signer}

	_, err := svc.GetPlaybackURL(context.Background(), "rec-1", "tenant-1")
	if err == nil {
		t.Fatal("expected error when signer fails")
	}
	if !strings.Contains(err.Error(), "presigned URL") {
		t.Errorf("error = %q, expected presigned URL error", err.Error())
	}
}

func TestGetPlaybackURL_DBError(t *testing.T) {
	store := &mockRecordingStore{
		getErr: fmt.Errorf("database connection lost"),
	}
	signer := &mockURLSigner{}
	svc := &testPlaybackService{store: store, signer: signer}

	_, err := svc.GetPlaybackURL(context.Background(), "rec-1", "tenant-1")
	if err == nil {
		t.Fatal("expected error when DB fails")
	}
	if !strings.Contains(err.Error(), "get recording") {
		t.Errorf("error = %q, expected get recording error", err.Error())
	}
}

func TestGetTimeline_ReturnsSegments(t *testing.T) {
	now := time.Now()
	end := now.Add(30 * time.Minute)

	store := &mockRecordingStore{
		timeline: map[string][]mockTimelineSegment{
			"cam-1:tenant-1:2024-01-15": {
				{
					RecordingID: "rec-1",
					StartTime:   now,
					EndTime:     &end,
					Trigger:     "motion",
				},
				{
					RecordingID: "rec-2",
					StartTime:   now.Add(1 * time.Hour),
					EndTime:     nil,
					Trigger:     "continuous",
				},
			},
		},
	}
	signer := &mockURLSigner{}
	svc := &testPlaybackService{store: store, signer: signer}

	date := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	segments, err := svc.GetTimeline(context.Background(), "cam-1", "tenant-1", date)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(segments) != 2 {
		t.Fatalf("expected 2 segments, got %d", len(segments))
	}

	if segments[0].RecordingID != "rec-1" {
		t.Errorf("first segment ID = %q, want rec-1", segments[0].RecordingID)
	}
	if segments[0].Trigger != "motion" {
		t.Errorf("first segment trigger = %q, want motion", segments[0].Trigger)
	}
	if segments[0].EndTime == nil {
		t.Error("expected first segment to have an end time")
	}
	if segments[1].EndTime != nil {
		t.Error("expected second segment to have nil end time")
	}
}

func TestGetTimeline_EmptyForDateWithNoRecordings(t *testing.T) {
	store := &mockRecordingStore{
		timeline: map[string][]mockTimelineSegment{},
	}
	signer := &mockURLSigner{}
	svc := &testPlaybackService{store: store, signer: signer}

	date := time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC)
	segments, err := svc.GetTimeline(context.Background(), "cam-1", "tenant-1", date)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(segments) != 0 {
		t.Errorf("expected 0 segments for empty date, got %d", len(segments))
	}
}

func TestGetTimeline_DBError(t *testing.T) {
	store := &mockRecordingStore{
		timeErr: fmt.Errorf("query timeout"),
	}
	signer := &mockURLSigner{}
	svc := &testPlaybackService{store: store, signer: signer}

	date := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	_, err := svc.GetTimeline(context.Background(), "cam-1", "tenant-1", date)
	if err == nil {
		t.Fatal("expected error when DB fails")
	}
	if !strings.Contains(err.Error(), "get timeline") {
		t.Errorf("error = %q, expected get timeline error", err.Error())
	}
}

func TestGetTimeline_DifferentCameras(t *testing.T) {
	now := time.Now()

	store := &mockRecordingStore{
		timeline: map[string][]mockTimelineSegment{
			"cam-1:tenant-1:2024-01-15": {
				{RecordingID: "rec-1", StartTime: now, Trigger: "motion"},
			},
			"cam-2:tenant-1:2024-01-15": {
				{RecordingID: "rec-2", StartTime: now, Trigger: "continuous"},
				{RecordingID: "rec-3", StartTime: now.Add(time.Hour), Trigger: "motion"},
			},
		},
	}
	signer := &mockURLSigner{}
	svc := &testPlaybackService{store: store, signer: signer}

	date := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)

	seg1, err := svc.GetTimeline(context.Background(), "cam-1", "tenant-1", date)
	if err != nil {
		t.Fatalf("cam-1 error: %v", err)
	}
	if len(seg1) != 1 {
		t.Errorf("cam-1 expected 1 segment, got %d", len(seg1))
	}

	seg2, err := svc.GetTimeline(context.Background(), "cam-2", "tenant-1", date)
	if err != nil {
		t.Fatalf("cam-2 error: %v", err)
	}
	if len(seg2) != 2 {
		t.Errorf("cam-2 expected 2 segments, got %d", len(seg2))
	}
}

func TestGetPlaybackURL_CorrectPlaylistKey(t *testing.T) {
	var capturedKey string
	store := &mockRecordingStore{
		recordings: map[string]mockRecording{
			"rec-1": {
				ID:          "rec-1",
				TenantID:    "tenant-1",
				Status:      "complete",
				StoragePath: "tenants/tenant-1/cameras/cam-1/2024/01/15/rec-1",
			},
		},
	}
	// Override to capture the key.
	capturingSigner := &capturingURLSigner{captured: &capturedKey}
	svc := &testPlaybackService{store: store, signer: capturingSigner}

	_, err := svc.GetPlaybackURL(context.Background(), "rec-1", "tenant-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedKey := "tenants/tenant-1/cameras/cam-1/2024/01/15/rec-1/playlist.m3u8"
	if capturedKey != expectedKey {
		t.Errorf("playlist key = %q, want %q", capturedKey, expectedKey)
	}
}

type capturingURLSigner struct {
	captured *string
}

func (s *capturingURLSigner) GeneratePresignedURL(_ context.Context, key string, _ time.Duration) (string, error) {
	*s.captured = key
	return "https://r2.example.com/" + key + "?signed=1", nil
}
