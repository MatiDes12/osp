package playback

import (
	"context"
	"fmt"
	"time"

	"github.com/MatiDes12/osp/services/video-pipeline/internal/db"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/storage"
)

// Service provides playback URL generation and timeline queries.
type Service struct {
	db *db.Queries
	r2 *storage.R2Storage
}

// NewService creates a new playback Service.
func NewService(queries *db.Queries, r2 *storage.R2Storage) *Service {
	return &Service{
		db: queries,
		r2: r2,
	}
}

// GetPlaybackURL looks up a recording and generates a pre-signed URL for the HLS playlist.
func (s *Service) GetPlaybackURL(ctx context.Context, recordingID, tenantID string) (string, error) {
	rec, err := s.db.GetRecording(ctx, recordingID)
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

	url, err := s.r2.GeneratePresignedURL(ctx, playlistKey, expiry)
	if err != nil {
		return "", fmt.Errorf("generate presigned URL: %w", err)
	}

	return url, nil
}

// TimelineSegment represents a recording segment on the timeline.
type TimelineSegment struct {
	RecordingID string
	StartTime   time.Time
	EndTime     *time.Time
	Trigger     string
}

// GetTimeline returns all recording segments for a camera on a given date.
func (s *Service) GetTimeline(ctx context.Context, cameraID, tenantID string, date time.Time) ([]TimelineSegment, error) {
	dbSegments, err := s.db.GetRecordingsForDate(ctx, cameraID, tenantID, date)
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
