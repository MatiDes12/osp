package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/MatiDes12/osp/services/camera-ingest/internal/camera"
	"github.com/MatiDes12/osp/services/camera-ingest/internal/health"
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
	cfg := loadConfig()

	log.Printf("Starting Camera Ingest Service (port=%s, go2rtc=%s)", cfg.GRPCPort, cfg.Go2RTCUrl)

	// --- Redis client for publishing status events ---
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Printf("WARNING: invalid REDIS_URL %q, status events will not be published: %v", cfg.RedisURL, err)
		redisOpts = &redis.Options{Addr: "localhost:6379"}
	}
	rdb := redis.NewClient(redisOpts)

	// Verify Redis connectivity (non-fatal).
	if pingErr := rdb.Ping(context.Background()).Err(); pingErr != nil {
		log.Printf("WARNING: Redis not reachable: %v (status events will fail until Redis is available)", pingErr)
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

	// --- gRPC server ---
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.GRPCPort))
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", cfg.GRPCPort, err)
	}

	grpcServer := grpc.NewServer()
	ingestServer := server.NewGRPCServer(cameraSvc, ptzCtrl)
	pb.RegisterCameraIngestServiceServer(grpcServer, ingestServer)
	reflection.Register(grpcServer)

	go func() {
		log.Printf("Camera Ingest Service listening on :%s", cfg.GRPCPort)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC server failed: %v", err)
		}
	}()

	// --- Graceful shutdown ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Camera Ingest Service...")

	// Stop health monitors first (they depend on stream manager).
	monitor.StopAll()

	// Drain gRPC connections.
	grpcServer.GracefulStop()

	// Close Redis.
	if err := rdb.Close(); err != nil {
		log.Printf("Error closing Redis: %v", err)
	}

	log.Println("Camera Ingest Service stopped.")
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
			log.Printf("Failed to marshal status event for camera %s: %v", event.CameraID, err)
			return
		}

		ctx := context.Background()
		if pubErr := rdb.Publish(ctx, "camera:status", payload).Err(); pubErr != nil {
			log.Printf("Failed to publish status event for camera %s: %v", event.CameraID, pubErr)
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
