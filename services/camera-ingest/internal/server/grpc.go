// Package server implements the gRPC server for the CameraIngestService,
// delegating to the camera service, discovery, and PTZ controller.
package server

import (
	"context"
	"fmt"
	"time"

	"github.com/MatiDes12/osp/services/camera-ingest/internal/camera"
	"github.com/MatiDes12/osp/services/camera-ingest/internal/discovery"
	"github.com/MatiDes12/osp/services/camera-ingest/internal/health"
	"github.com/MatiDes12/osp/services/camera-ingest/internal/ptz"
	pb "github.com/MatiDes12/osp/services/camera-ingest/pkg/proto"
)

// GRPCServer implements the CameraIngestServiceServer gRPC interface.
type GRPCServer struct {
	pb.UnimplementedCameraIngestServiceServer

	cameraSvc *camera.Service
	ptzCtrl   *ptz.Controller
}

// NewGRPCServer creates a new gRPC server backed by the given camera service and PTZ controller.
func NewGRPCServer(cameraSvc *camera.Service, ptzCtrl *ptz.Controller) *GRPCServer {
	return &GRPCServer{
		cameraSvc: cameraSvc,
		ptzCtrl:   ptzCtrl,
	}
}

// AddCamera registers a new camera and starts stream ingestion and health monitoring.
func (s *GRPCServer) AddCamera(ctx context.Context, req *pb.AddCameraRequest) (*pb.AddCameraResponse, error) {
	if req.CameraId == "" {
		return &pb.AddCameraResponse{
			Success: false,
			Message: "camera_id is required",
		}, nil
	}
	if req.RtspUrl == "" {
		return &pb.AddCameraResponse{
			Success: false,
			Message: "rtsp_url is required",
		}, nil
	}

	status, err := s.cameraSvc.AddCamera(ctx, req.CameraId, req.Name, req.RtspUrl, req.OnvifUrl, req.Username, req.Password)
	if err != nil {
		return &pb.AddCameraResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &pb.AddCameraResponse{
		Success: true,
		Message: "camera added successfully",
		Status:  statusToProto(status),
	}, nil
}

// RemoveCamera unregisters a camera and stops its stream and monitoring.
func (s *GRPCServer) RemoveCamera(ctx context.Context, req *pb.RemoveCameraRequest) (*pb.RemoveCameraResponse, error) {
	if req.CameraId == "" {
		return &pb.RemoveCameraResponse{
			Success: false,
			Message: "camera_id is required",
		}, nil
	}

	if err := s.cameraSvc.RemoveCamera(ctx, req.CameraId); err != nil {
		return &pb.RemoveCameraResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &pb.RemoveCameraResponse{
		Success: true,
		Message: "camera removed successfully",
	}, nil
}

// GetCameraStatus returns the current status of a single camera.
func (s *GRPCServer) GetCameraStatus(ctx context.Context, req *pb.GetCameraStatusRequest) (*pb.CameraStatusResponse, error) {
	if req.CameraId == "" {
		return nil, fmt.Errorf("camera_id is required")
	}

	status, err := s.cameraSvc.GetStatus(req.CameraId)
	if err != nil {
		return nil, fmt.Errorf("get camera status: %w", err)
	}

	return &pb.CameraStatusResponse{
		Status: statusToProto(status),
	}, nil
}

// ListCameraStatuses returns the status of all registered cameras.
func (s *GRPCServer) ListCameraStatuses(_ context.Context, _ *pb.ListCameraStatusesRequest) (*pb.ListCameraStatusesResponse, error) {
	statuses := s.cameraSvc.ListStatuses()
	pbStatuses := make([]*pb.CameraStatus, 0, len(statuses))
	for _, st := range statuses {
		pbStatuses = append(pbStatuses, statusToProto(st))
	}
	return &pb.ListCameraStatusesResponse{
		Statuses: pbStatuses,
	}, nil
}

// DiscoverCameras performs ONVIF WS-Discovery on the local network.
func (s *GRPCServer) DiscoverCameras(ctx context.Context, req *pb.DiscoverCamerasRequest) (*pb.DiscoverCamerasResponse, error) {
	timeout := time.Duration(req.TimeoutSeconds) * time.Second
	devices, err := discovery.Discover(ctx, timeout)
	if err != nil {
		return nil, fmt.Errorf("discover cameras: %w", err)
	}

	cameras := make([]*pb.DiscoveredCamera, 0, len(devices))
	for _, d := range devices {
		cameras = append(cameras, &pb.DiscoveredCamera{
			Ip:           d.IP,
			Port:         int32(d.Port),
			Manufacturer: d.Manufacturer,
			Model:        d.Model,
			Xaddr:        d.XAddr,
		})
	}

	return &pb.DiscoverCamerasResponse{
		Cameras: cameras,
	}, nil
}

// PTZCommand executes a PTZ action on a camera.
func (s *GRPCServer) PTZCommand(ctx context.Context, req *pb.PTZCommandRequest) (*pb.PTZCommandResponse, error) {
	if req.CameraId == "" {
		return &pb.PTZCommandResponse{
			Success: false,
			Message: "camera_id is required",
		}, nil
	}

	cam, ok := s.cameraSvc.GetCamera(req.CameraId)
	if !ok {
		return &pb.PTZCommandResponse{
			Success: false,
			Message: fmt.Sprintf("camera %q not found", req.CameraId),
		}, nil
	}

	if cam.OnvifURL == "" {
		return &pb.PTZCommandResponse{
			Success: false,
			Message: fmt.Sprintf("camera %q has no ONVIF URL configured", req.CameraId),
		}, nil
	}

	var err error
	switch req.Action {
	case pb.PTZAction_PTZ_ACTION_MOVE:
		err = s.ptzCtrl.Move(ctx, cam.OnvifURL, req.Pan, req.Tilt, req.Zoom, req.Speed)
	case pb.PTZAction_PTZ_ACTION_STOP:
		err = s.ptzCtrl.Stop(ctx, cam.OnvifURL)
	case pb.PTZAction_PTZ_ACTION_GOTO_PRESET:
		if req.PresetId == "" {
			return &pb.PTZCommandResponse{
				Success: false,
				Message: "preset_id is required for GOTO_PRESET action",
			}, nil
		}
		err = s.ptzCtrl.GotoPreset(ctx, cam.OnvifURL, req.PresetId)
	default:
		return &pb.PTZCommandResponse{
			Success: false,
			Message: fmt.Sprintf("unknown PTZ action: %d", req.Action),
		}, nil
	}

	if err != nil {
		return &pb.PTZCommandResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &pb.PTZCommandResponse{
		Success: true,
		Message: "PTZ command executed successfully",
	}, nil
}

// ReconnectCamera forces a reconnection for the specified camera.
func (s *GRPCServer) ReconnectCamera(ctx context.Context, req *pb.ReconnectCameraRequest) (*pb.ReconnectCameraResponse, error) {
	if req.CameraId == "" {
		return &pb.ReconnectCameraResponse{
			Success: false,
			Message: "camera_id is required",
		}, nil
	}

	status, err := s.cameraSvc.ReconnectCamera(ctx, req.CameraId)
	if err != nil {
		return &pb.ReconnectCameraResponse{
			Success: false,
			Message: err.Error(),
		}, nil
	}

	return &pb.ReconnectCameraResponse{
		Success: true,
		Message: "camera reconnection initiated",
		Status:  statusToProto(status),
	}, nil
}

// statusToProto converts an internal camera.Status to a protobuf CameraStatus.
func statusToProto(st camera.Status) *pb.CameraStatus {
	var lastSeen string
	if !st.LastSeen.IsZero() {
		lastSeen = st.LastSeen.Format(time.RFC3339)
	}

	return &pb.CameraStatus{
		CameraId:            st.ID,
		Name:                st.Name,
		RtspUrl:             st.RtspURL,
		State:               healthStateToProto(st.State),
		LastSeen:            lastSeen,
		ConsecutiveFailures: int32(st.ConsecutiveFailures),
		ErrorMessage:        st.ErrorMessage,
	}
}

// healthStateToProto maps internal health.State to the protobuf CameraState enum.
func healthStateToProto(s health.State) pb.CameraState {
	switch s {
	case health.StateOnline:
		return pb.CameraState_CAMERA_STATE_ONLINE
	case health.StateOffline:
		return pb.CameraState_CAMERA_STATE_OFFLINE
	case health.StateConnecting:
		return pb.CameraState_CAMERA_STATE_CONNECTING
	case health.StateDegraded:
		return pb.CameraState_CAMERA_STATE_DEGRADED
	default:
		return pb.CameraState_CAMERA_STATE_UNSPECIFIED
	}
}
