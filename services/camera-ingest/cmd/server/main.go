package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/MatiDes12/osp/services/camera-ingest/internal/camera"
	"github.com/MatiDes12/osp/services/camera-ingest/internal/health"
	osplog "github.com/MatiDes12/osp/services/camera-ingest/internal/log"
	"github.com/MatiDes12/osp/services/camera-ingest/internal/ptz"
	"github.com/MatiDes12/osp/services/camera-ingest/internal/server"
	"github.com/MatiDes12/osp/services/camera-ingest/internal/stream"
	pb "github.com/MatiDes12/osp/services/camera-ingest/pkg/proto"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

// config holds all environment-driven configuration.
type config struct {
	GRPCPort    string
	Go2RTCUrl   string
	RedisURL    string
}

func loadConfig() config {
	cfg := config{
		GRPCPort:  envOrDefault("INGEST_GRPC_PORT", "50051"),
		Go2RTCUrl: envOrDefault("GO2RTC_API_URL", "http://localhost:1984"),
		RedisURL:  envOrDefault("REDIS_URL", "redis://localhost:6379"),
	}
	return cfg
}

func main() {
	bootStart := time.Now()
	cfg := loadConfig()

	logger := osplog.Init("camera-ingest")
	logger.Info("initializing camera ingest service",
		"port", cfg.GRPCPort,
		"go2rtc", cfg.Go2RTCUrl,
	)

	// --- Redis client for publishing status events ---
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		osplog.ConnectionFail("Redis", fmt.Sprintf("invalid REDIS_URL: %v", err))
		redisOpts = &redis.Options{Addr: "localhost:6379"}
	}
	rdb := redis.NewClient(redisOpts)

	// Verify Redis connectivity (non-fatal).
	if pingErr := rdb.Ping(context.Background()).Err(); pingErr != nil {
		osplog.ConnectionFail("Redis", fmt.Sprintf("not reachable: %v", pingErr))
	} else {
		osplog.ConnectionOK("Redis", cfg.RedisURL)
	}

	// --- Stream manager (go2rtc HTTP client) ---
	go2rtcClient := stream.NewGo2RTCClientWithURL(cfg.Go2RTCUrl)
	streamMgr := stream.NewManager(go2rtcClient)

	// --- Health monitor with Redis status publishing ---
	statusListener := newRedisStatusListener(rdb)
	monitor := health.NewMonitor(streamMgr, statusListener)

	// --- Camera service ---
	cameraSvc := camera.NewService(streamMgr, monitor)

	// --- PTZ controller ---
	ptzCtrl := ptz.NewController()

	// --- go2rtc connection check ---
	osplog.ConnectionOK("go2rtc", cfg.Go2RTCUrl)

	// --- gRPC server ---
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.GRPCPort))
	if err != nil {
		slog.Error("failed to listen", "port", cfg.GRPCPort, "error", err)
		os.Exit(1)
	}

	grpcServer := grpc.NewServer()
	ingestServer := server.NewGRPCServer(cameraSvc, ptzCtrl)
	pb.RegisterCameraIngestServiceServer(grpcServer, ingestServer)
	reflection.Register(grpcServer)

	go func() {
		osplog.StartupBanner("Camera Ingest Service", cfg.GRPCPort,
			map[string]string{
				"go2rtc": cfg.Go2RTCUrl,
				"redis":  cfg.RedisURL,
			}, time.Since(bootStart))
		if err := grpcServer.Serve(lis); err != nil {
			slog.Error("gRPC server failed", "error", err)
			os.Exit(1)
		}
	}()

	// --- Graceful shutdown ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	osplog.ShutdownBanner("Camera Ingest Service")

	// Stop health monitors first (they depend on stream manager).
	monitor.StopAll()

	// Drain gRPC connections.
	grpcServer.GracefulStop()

	// Close Redis.
	if err := rdb.Close(); err != nil {
		slog.Error("error closing Redis", "error", err)
	}

	slog.Info("Camera Ingest Service stopped")
}

// newRedisStatusListener returns a health.StatusListener that publishes
// camera status change events to a Redis channel.
func newRedisStatusListener(rdb *redis.Client) health.StatusListener {
	return func(event health.StatusChangeEvent) {
		payload, err := json.Marshal(map[string]interface{}{
			"camera_id": event.CameraID,
			"name":      event.Name,
			"old_state": event.OldState.String(),
			"new_state": event.NewState.String(),
			"timestamp": event.Timestamp,
			"error":     event.Error,
		})
		if err != nil {
			slog.Error("failed to marshal status event",
				"camera_id", event.CameraID, "error", err)
			return
		}

		ctx := context.Background()
		if pubErr := rdb.Publish(ctx, "camera:status", payload).Err(); pubErr != nil {
			slog.Error("failed to publish status event",
				"camera_id", event.CameraID, "error", pubErr)
		} else {
			slog.Info("camera status changed",
				"camera_id", event.CameraID,
				"old_state", event.OldState.String(),
				"new_state", event.NewState.String(),
			)
		}
	}
}

// envOrDefault reads an environment variable, returning the fallback if unset or empty.
func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
