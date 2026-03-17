package grpc

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"time"

	"github.com/MatiDes12/osp/services/video-pipeline/internal/config"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/db"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/playback"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/recording"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/snapshot"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/storage"
	pb "github.com/MatiDes12/osp/services/video-pipeline/pkg/proto"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Handler implements the VideoPipelineService gRPC server.
type Handler struct {
	pb.UnimplementedVideoPipelineServiceServer

	cfg       config.Config
	recording *recording.RecordingService
	playback  *playback.Service
	snapshot  *snapshot.Extractor
	r2        *storage.R2Storage
	db        *db.Queries
}

// NewHandler creates a new gRPC Handler with all dependencies.
func NewHandler(
	cfg config.Config,
	recService *recording.RecordingService,
	pbService *playback.Service,
	snapExtractor *snapshot.Extractor,
	r2 *storage.R2Storage,
	queries *db.Queries,
) *Handler {
	return &Handler{
		cfg:       cfg,
		recording: recService,
		playback:  pbService,
		snapshot:  snapExtractor,
		r2:        r2,
		db:        queries,
	}
}

func (h *Handler) StartRecording(ctx context.Context, req *pb.StartRecordingRequest) (*pb.StartRecordingResponse, error) {
	if req.CameraId == "" {
		return nil, status.Error(codes.InvalidArgument, "camera_id is required")
	}
	if req.TenantId == "" {
		return nil, status.Error(codes.InvalidArgument, "tenant_id is required")
	}

	trigger := req.Trigger
	if trigger == "" {
		trigger = "manual"
	}

	recordingID, err := h.recording.StartRecording(ctx, req.CameraId, req.TenantId, trigger, req.DurationSec)
	if err != nil {
		log.Printf("StartRecording error: %v", err)
		return nil, status.Errorf(codes.Internal, "failed to start recording: %v", err)
	}

	return &pb.StartRecordingResponse{
		Success:     true,
		RecordingId: recordingID,
		Message:     "recording started",
	}, nil
}

func (h *Handler) StopRecording(ctx context.Context, req *pb.StopRecordingRequest) (*pb.StopRecordingResponse, error) {
	if req.RecordingId == "" {
		return nil, status.Error(codes.InvalidArgument, "recording_id is required")
	}

	duration, err := h.recording.StopRecording(ctx, req.RecordingId)
	if err != nil {
		log.Printf("StopRecording error: %v", err)
		return nil, status.Errorf(codes.Internal, "failed to stop recording: %v", err)
	}

	return &pb.StopRecordingResponse{
		Success:     true,
		DurationSec: duration,
		Message:     "recording stopped",
	}, nil
}

func (h *Handler) GetRecordingStatus(ctx context.Context, req *pb.GetRecordingStatusRequest) (*pb.RecordingStatusResponse, error) {
	if req.RecordingId == "" {
		return nil, status.Error(codes.InvalidArgument, "recording_id is required")
	}

	// Check if it is an active recording first.
	isActive, liveDuration := h.recording.GetStatus(req.RecordingId)
	if isActive {
		return &pb.RecordingStatusResponse{
			RecordingId: req.RecordingId,
			Status:      "recording",
			DurationSec: liveDuration,
		}, nil
	}

	// Fall back to DB lookup.
	rec, err := h.db.GetRecording(ctx, req.RecordingId)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "recording not found: %v", err)
	}

	resp := &pb.RecordingStatusResponse{
		RecordingId: rec.ID,
		Status:      rec.Status,
		SizeBytes:   rec.SizeBytes,
		StartTime:   rec.StartTime.Format(time.RFC3339),
	}
	if rec.DurationSec != nil {
		resp.DurationSec = *rec.DurationSec
	}
	if rec.EndTime != nil {
		resp.EndTime = rec.EndTime.Format(time.RFC3339)
	}
	return resp, nil
}

func (h *Handler) GenerateSnapshot(ctx context.Context, req *pb.GenerateSnapshotRequest) (*pb.GenerateSnapshotResponse, error) {
	if req.CameraId == "" {
		return nil, status.Error(codes.InvalidArgument, "camera_id is required")
	}
	if req.TenantId == "" {
		return nil, status.Error(codes.InvalidArgument, "tenant_id is required")
	}

	var jpegData []byte
	var err error

	if req.RecordingId != "" {
		// Extract from an existing recording.
		rec, recErr := h.db.GetRecording(ctx, req.RecordingId)
		if recErr != nil {
			return nil, status.Errorf(codes.NotFound, "recording not found: %v", recErr)
		}
		recordingPath := fmt.Sprintf("/tmp/osp-recordings/%s/playlist.m3u8", rec.ID)
		jpegData, err = h.snapshot.ExtractFromRecording(ctx, recordingPath, float64(req.TimestampSec))
	} else {
		// Extract from live RTSP stream.
		rtspURL := fmt.Sprintf("%s/%s", h.cfg.Go2RTCBaseURL, req.CameraId)
		jpegData, err = h.snapshot.ExtractFrame(ctx, rtspURL)
	}

	if err != nil {
		log.Printf("GenerateSnapshot error: %v", err)
		return nil, status.Errorf(codes.Internal, "snapshot extraction failed: %v", err)
	}

	// Upload to R2.
	snapshotKey := fmt.Sprintf("tenants/%s/cameras/%s/snapshots/%d.jpg",
		req.TenantId, req.CameraId, time.Now().UnixMilli())

	if err := h.r2.Upload(ctx, snapshotKey, bytes.NewReader(jpegData), "image/jpeg"); err != nil {
		log.Printf("snapshot upload error: %v", err)
		return nil, status.Errorf(codes.Internal, "failed to upload snapshot: %v", err)
	}

	// Create DB record.
	var recID *string
	if req.RecordingId != "" {
		recID = &req.RecordingId
	}

	snap, err := h.db.CreateSnapshot(ctx, db.CreateSnapshotParams{
		CameraID:    req.CameraId,
		RecordingID: recID,
		TenantID:    req.TenantId,
		StoragePath: snapshotKey,
		SizeBytes:   len(jpegData),
	})
	if err != nil {
		log.Printf("snapshot DB insert error: %v", err)
		return nil, status.Errorf(codes.Internal, "failed to save snapshot record: %v", err)
	}

	return &pb.GenerateSnapshotResponse{
		Success:     true,
		SnapshotId:  snap.ID,
		StoragePath: snapshotKey,
		Message:     "snapshot generated",
	}, nil
}

func (h *Handler) GetPlaybackURL(ctx context.Context, req *pb.GetPlaybackURLRequest) (*pb.PlaybackURLResponse, error) {
	if req.RecordingId == "" {
		return nil, status.Error(codes.InvalidArgument, "recording_id is required")
	}
	if req.TenantId == "" {
		return nil, status.Error(codes.InvalidArgument, "tenant_id is required")
	}

	url, err := h.playback.GetPlaybackURL(ctx, req.RecordingId, req.TenantId)
	if err != nil {
		log.Printf("GetPlaybackURL error: %v", err)
		return nil, status.Errorf(codes.Internal, "failed to get playback URL: %v", err)
	}

	return &pb.PlaybackURLResponse{
		Success:      true,
		PlaybackUrl:  url,
		ExpiresInSec: 3600,
		Message:      "playback URL generated",
	}, nil
}
