package recording

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/MatiDes12/osp/services/video-pipeline/internal/config"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/db"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/storage"
)

// RecordingService manages the lifecycle of video recordings.
type RecordingService struct {
	cfg       config.Config
	db        *db.Queries
	r2        *storage.R2Storage
	spool     *storage.SpoolManager

	mu        sync.Mutex
	active    map[string]*activeRecording // recordingID -> active recording
}

type activeRecording struct {
	process    *FFmpegProcess
	recordingID string
	cameraID   string
	tenantID   string
	outputDir  string
	startedAt  time.Time
	cancel     context.CancelFunc
}

// NewRecordingService creates a new RecordingService.
func NewRecordingService(cfg config.Config, queries *db.Queries, r2 *storage.R2Storage, spool *storage.SpoolManager) *RecordingService {
	return &RecordingService{
		cfg:    cfg,
		db:     queries,
		r2:     r2,
		spool:  spool,
		active: make(map[string]*activeRecording),
	}
}

// StartRecording begins a new recording session for the given camera.
// It creates a DB row, spawns FFmpeg, and returns the recording ID immediately.
func (s *RecordingService) StartRecording(ctx context.Context, cameraID, tenantID, trigger string, durationSec int32) (string, error) {
	retentionUntil := time.Now().Add(time.Duration(s.cfg.DefaultRetentionDays) * 24 * time.Hour)

	rec, err := s.db.CreateRecording(ctx, db.CreateRecordingParams{
		CameraID:       cameraID,
		TenantID:       tenantID,
		Trigger:        trigger,
		Status:         "recording",
		RetentionUntil: retentionUntil,
	})
	if err != nil {
		return "", fmt.Errorf("create recording row: %w", err)
	}

	recordingID := rec.ID
	storagePath := fmt.Sprintf("tenants/%s/cameras/%s/recordings/%s", tenantID, cameraID, recordingID)
	outputDir := fmt.Sprintf("/tmp/osp-recordings/%s", recordingID)

	rtspURL := fmt.Sprintf("%s/%s", s.cfg.Go2RTCBaseURL, cameraID)

	ffmpegCfg := FFmpegConfig{
		FFmpegPath:      s.cfg.FFmpegPath,
		SegmentDuration: s.cfg.DefaultSegmentDuration,
		VideoCodec:      "copy",
		AudioCodec:      "aac",
	}

	procCtx, cancel := context.WithCancel(context.Background())

	proc, err := StartFFmpeg(procCtx, rtspURL, outputDir, ffmpegCfg)
	if err != nil {
		cancel()
		_ = s.db.UpdateRecordingStatus(ctx, recordingID, "failed")
		return "", fmt.Errorf("start ffmpeg: %w", err)
	}

	if err := s.db.UpdateRecordingStoragePath(ctx, recordingID, storagePath); err != nil {
		cancel()
		_ = proc.Stop()
		return "", fmt.Errorf("update storage path: %w", err)
	}

	ar := &activeRecording{
		process:     proc,
		recordingID: recordingID,
		cameraID:    cameraID,
		tenantID:    tenantID,
		outputDir:   outputDir,
		startedAt:   time.Now(),
		cancel:      cancel,
	}

	s.mu.Lock()
	s.active[recordingID] = ar
	s.mu.Unlock()

	// If a duration is specified, schedule automatic stop.
	if durationSec > 0 {
		go func() {
			timer := time.NewTimer(time.Duration(durationSec) * time.Second)
			defer timer.Stop()
			select {
			case <-timer.C:
				if _, err := s.StopRecording(context.Background(), recordingID); err != nil {
					log.Printf("auto-stop recording %s failed: %v", recordingID, err)
				}
			case <-proc.Done():
				// Process already exited.
			}
		}()
	}

	// Watch for unexpected FFmpeg exit.
	go s.watchProcess(ar)

	return recordingID, nil
}

// StopRecording gracefully stops a recording, finalizes it, and triggers upload.
func (s *RecordingService) StopRecording(ctx context.Context, recordingID string) (int32, error) {
	s.mu.Lock()
	ar, ok := s.active[recordingID]
	if !ok {
		s.mu.Unlock()
		return 0, fmt.Errorf("recording %s not found in active sessions", recordingID)
	}
	delete(s.active, recordingID)
	s.mu.Unlock()

	if err := ar.process.Stop(); err != nil {
		log.Printf("ffmpeg stop warning for %s: %v", recordingID, err)
	}
	ar.cancel()

	duration := int32(time.Since(ar.startedAt).Seconds())

	if err := s.db.FinalizeRecording(ctx, recordingID, duration); err != nil {
		log.Printf("finalize recording %s in DB failed: %v", recordingID, err)
		return duration, fmt.Errorf("finalize recording: %w", err)
	}

	// Trigger upload in the background.
	go s.uploadRecording(ar)

	return duration, nil
}

// GetStatus returns whether a recording is currently active.
func (s *RecordingService) GetStatus(recordingID string) (isActive bool, durationSec int32) {
	s.mu.Lock()
	ar, ok := s.active[recordingID]
	s.mu.Unlock()

	if !ok {
		return false, 0
	}
	return true, int32(time.Since(ar.startedAt).Seconds())
}

// watchProcess monitors an FFmpeg process for unexpected exit.
func (s *RecordingService) watchProcess(ar *activeRecording) {
	<-ar.process.Done()

	s.mu.Lock()
	_, stillActive := s.active[ar.recordingID]
	if stillActive {
		delete(s.active, ar.recordingID)
	}
	s.mu.Unlock()

	if !stillActive {
		return // Already stopped via StopRecording.
	}

	// Unexpected exit: mark as partial.
	duration := int32(time.Since(ar.startedAt).Seconds())
	log.Printf("recording %s: ffmpeg exited unexpectedly after %ds", ar.recordingID, duration)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := ar.process.ExitErr(); err != nil {
		_ = s.db.UpdateRecordingStatus(ctx, ar.recordingID, "partial")
	}
	_ = s.db.FinalizeRecording(ctx, ar.recordingID, duration)

	go s.uploadRecording(ar)
}

// uploadRecording uploads HLS segments from the local output dir to R2.
func (s *RecordingService) uploadRecording(ar *activeRecording) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	storagePath := fmt.Sprintf("tenants/%s/cameras/%s/recordings/%s", ar.tenantID, ar.cameraID, ar.recordingID)

	if err := s.r2.UploadDirectory(ctx, ar.outputDir, storagePath); err != nil {
		log.Printf("R2 upload failed for recording %s, spooling: %v", ar.recordingID, err)
		if spoolErr := s.spool.Spool(ar.outputDir, storagePath); spoolErr != nil {
			log.Printf("spool failed for recording %s: %v", ar.recordingID, spoolErr)
		}
		return
	}

	log.Printf("recording %s uploaded to R2 at %s", ar.recordingID, storagePath)
}
