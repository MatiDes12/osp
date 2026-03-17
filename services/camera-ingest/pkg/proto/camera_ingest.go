// Package proto contains placeholder types for the camera-ingest gRPC service.
// These stubs will be replaced by protoc-generated code. Run:
//
//	protoc --go_out=. --go-grpc_out=. proto/camera_ingest.proto
package proto

import (
	"context"

	"google.golang.org/grpc"
)

// ---------- Enums ----------

// PTZAction represents the type of PTZ operation.
type PTZAction int32

const (
	PTZAction_PTZ_ACTION_UNSPECIFIED PTZAction = 0
	PTZAction_PTZ_ACTION_MOVE       PTZAction = 1
	PTZAction_PTZ_ACTION_STOP       PTZAction = 2
	PTZAction_PTZ_ACTION_GOTO_PRESET PTZAction = 3
)

// CameraState represents the connection state of a camera.
type CameraState int32

const (
	CameraState_CAMERA_STATE_UNSPECIFIED CameraState = 0
	CameraState_CAMERA_STATE_ONLINE      CameraState = 1
	CameraState_CAMERA_STATE_OFFLINE     CameraState = 2
	CameraState_CAMERA_STATE_CONNECTING  CameraState = 3
	CameraState_CAMERA_STATE_DEGRADED    CameraState = 4
)

// ---------- Messages ----------

// AddCameraRequest is the request for AddCamera.
type AddCameraRequest struct {
	CameraId string `json:"camera_id"`
	RtspUrl  string `json:"rtsp_url"`
	Name     string `json:"name"`
	OnvifUrl string `json:"onvif_url"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// AddCameraResponse is the response for AddCamera.
type AddCameraResponse struct {
	Success bool          `json:"success"`
	Message string        `json:"message"`
	Status  *CameraStatus `json:"status"`
}

// RemoveCameraRequest is the request for RemoveCamera.
type RemoveCameraRequest struct {
	CameraId string `json:"camera_id"`
}

// RemoveCameraResponse is the response for RemoveCamera.
type RemoveCameraResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// GetCameraStatusRequest is the request for GetCameraStatus.
type GetCameraStatusRequest struct {
	CameraId string `json:"camera_id"`
}

// CameraStatusResponse is the response for GetCameraStatus.
type CameraStatusResponse struct {
	Status *CameraStatus `json:"status"`
}

// ListCameraStatusesRequest is the request for ListCameraStatuses.
type ListCameraStatusesRequest struct{}

// ListCameraStatusesResponse is the response for ListCameraStatuses.
type ListCameraStatusesResponse struct {
	Statuses []*CameraStatus `json:"statuses"`
}

// DiscoverCamerasRequest is the request for DiscoverCameras.
type DiscoverCamerasRequest struct {
	TimeoutSeconds int32 `json:"timeout_seconds"`
}

// DiscoverCamerasResponse is the response for DiscoverCameras.
type DiscoverCamerasResponse struct {
	Cameras []*DiscoveredCamera `json:"cameras"`
}

// DiscoveredCamera represents a camera found via ONVIF discovery.
type DiscoveredCamera struct {
	Ip           string `json:"ip"`
	Port         int32  `json:"port"`
	Manufacturer string `json:"manufacturer"`
	Model        string `json:"model"`
	Xaddr        string `json:"xaddr"`
}

// PTZCommandRequest is the request for PTZCommand.
type PTZCommandRequest struct {
	CameraId string    `json:"camera_id"`
	Action   PTZAction `json:"action"`
	Pan      float32   `json:"pan"`
	Tilt     float32   `json:"tilt"`
	Zoom     float32   `json:"zoom"`
	Speed    float32   `json:"speed"`
	PresetId string    `json:"preset_id"`
}

// PTZCommandResponse is the response for PTZCommand.
type PTZCommandResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// ReconnectCameraRequest is the request for ReconnectCamera.
type ReconnectCameraRequest struct {
	CameraId string `json:"camera_id"`
}

// ReconnectCameraResponse is the response for ReconnectCamera.
type ReconnectCameraResponse struct {
	Success bool          `json:"success"`
	Message string        `json:"message"`
	Status  *CameraStatus `json:"status"`
}

// CameraStatus represents the current status of a camera.
type CameraStatus struct {
	CameraId            string      `json:"camera_id"`
	Name                string      `json:"name"`
	RtspUrl             string      `json:"rtsp_url"`
	State               CameraState `json:"state"`
	LastSeen            string      `json:"last_seen"`
	ConsecutiveFailures int32       `json:"consecutive_failures"`
	ErrorMessage        string      `json:"error_message"`
}

// ---------- gRPC service interface ----------

// CameraIngestServiceServer is the server API for CameraIngestService.
type CameraIngestServiceServer interface {
	AddCamera(context.Context, *AddCameraRequest) (*AddCameraResponse, error)
	RemoveCamera(context.Context, *RemoveCameraRequest) (*RemoveCameraResponse, error)
	GetCameraStatus(context.Context, *GetCameraStatusRequest) (*CameraStatusResponse, error)
	ListCameraStatuses(context.Context, *ListCameraStatusesRequest) (*ListCameraStatusesResponse, error)
	DiscoverCameras(context.Context, *DiscoverCamerasRequest) (*DiscoverCamerasResponse, error)
	PTZCommand(context.Context, *PTZCommandRequest) (*PTZCommandResponse, error)
	ReconnectCamera(context.Context, *ReconnectCameraRequest) (*ReconnectCameraResponse, error)
}

// UnimplementedCameraIngestServiceServer provides forward-compatible stub implementations.
type UnimplementedCameraIngestServiceServer struct{}

func (UnimplementedCameraIngestServiceServer) AddCamera(context.Context, *AddCameraRequest) (*AddCameraResponse, error) {
	return nil, grpc.Errorf(12, "method AddCamera not implemented") //nolint:staticcheck
}
func (UnimplementedCameraIngestServiceServer) RemoveCamera(context.Context, *RemoveCameraRequest) (*RemoveCameraResponse, error) {
	return nil, grpc.Errorf(12, "method RemoveCamera not implemented") //nolint:staticcheck
}
func (UnimplementedCameraIngestServiceServer) GetCameraStatus(context.Context, *GetCameraStatusRequest) (*CameraStatusResponse, error) {
	return nil, grpc.Errorf(12, "method GetCameraStatus not implemented") //nolint:staticcheck
}
func (UnimplementedCameraIngestServiceServer) ListCameraStatuses(context.Context, *ListCameraStatusesRequest) (*ListCameraStatusesResponse, error) {
	return nil, grpc.Errorf(12, "method ListCameraStatuses not implemented") //nolint:staticcheck
}
func (UnimplementedCameraIngestServiceServer) DiscoverCameras(context.Context, *DiscoverCamerasRequest) (*DiscoverCamerasResponse, error) {
	return nil, grpc.Errorf(12, "method DiscoverCameras not implemented") //nolint:staticcheck
}
func (UnimplementedCameraIngestServiceServer) PTZCommand(context.Context, *PTZCommandRequest) (*PTZCommandResponse, error) {
	return nil, grpc.Errorf(12, "method PTZCommand not implemented") //nolint:staticcheck
}
func (UnimplementedCameraIngestServiceServer) ReconnectCamera(context.Context, *ReconnectCameraRequest) (*ReconnectCameraResponse, error) {
	return nil, grpc.Errorf(12, "method ReconnectCamera not implemented") //nolint:staticcheck
}

// RegisterCameraIngestServiceServer registers the service with the gRPC server.
func RegisterCameraIngestServiceServer(s *grpc.Server, srv CameraIngestServiceServer) {
	sd := &grpc.ServiceDesc{
		ServiceName: "osp.cameraingest.v1.CameraIngestService",
		HandlerType: (*CameraIngestServiceServer)(nil),
		Methods: []grpc.MethodDesc{
			{MethodName: "AddCamera", Handler: _CameraIngestService_AddCamera_Handler},
			{MethodName: "RemoveCamera", Handler: _CameraIngestService_RemoveCamera_Handler},
			{MethodName: "GetCameraStatus", Handler: _CameraIngestService_GetCameraStatus_Handler},
			{MethodName: "ListCameraStatuses", Handler: _CameraIngestService_ListCameraStatuses_Handler},
			{MethodName: "DiscoverCameras", Handler: _CameraIngestService_DiscoverCameras_Handler},
			{MethodName: "PTZCommand", Handler: _CameraIngestService_PTZCommand_Handler},
			{MethodName: "ReconnectCamera", Handler: _CameraIngestService_ReconnectCamera_Handler},
		},
		Streams:  []grpc.StreamDesc{},
		Metadata: "proto/camera_ingest.proto",
	}
	s.RegisterService(sd, srv)
}

func _CameraIngestService_AddCamera_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req := new(AddCameraRequest)
	if err := dec(req); err != nil {
		return nil, err
	}
	return srv.(CameraIngestServiceServer).AddCamera(ctx, req)
}

func _CameraIngestService_RemoveCamera_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req := new(RemoveCameraRequest)
	if err := dec(req); err != nil {
		return nil, err
	}
	return srv.(CameraIngestServiceServer).RemoveCamera(ctx, req)
}

func _CameraIngestService_GetCameraStatus_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req := new(GetCameraStatusRequest)
	if err := dec(req); err != nil {
		return nil, err
	}
	return srv.(CameraIngestServiceServer).GetCameraStatus(ctx, req)
}

func _CameraIngestService_ListCameraStatuses_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req := new(ListCameraStatusesRequest)
	if err := dec(req); err != nil {
		return nil, err
	}
	return srv.(CameraIngestServiceServer).ListCameraStatuses(ctx, req)
}

func _CameraIngestService_DiscoverCameras_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req := new(DiscoverCamerasRequest)
	if err := dec(req); err != nil {
		return nil, err
	}
	return srv.(CameraIngestServiceServer).DiscoverCameras(ctx, req)
}

func _CameraIngestService_PTZCommand_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req := new(PTZCommandRequest)
	if err := dec(req); err != nil {
		return nil, err
	}
	return srv.(CameraIngestServiceServer).PTZCommand(ctx, req)
}

func _CameraIngestService_ReconnectCamera_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req := new(ReconnectCameraRequest)
	if err := dec(req); err != nil {
		return nil, err
	}
	return srv.(CameraIngestServiceServer).ReconnectCamera(ctx, req)
}
