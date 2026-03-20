package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc"

	"github.com/MatiDes12/osp/services/video-pipeline/internal/config"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/db"
	grpchandler "github.com/MatiDes12/osp/services/video-pipeline/internal/grpc"
	osplog "github.com/MatiDes12/osp/services/video-pipeline/internal/log"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/playback"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/recording"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/retention"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/snapshot"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/storage"
	pb "github.com/MatiDes12/osp/services/video-pipeline/pkg/proto"
)

func main() {
	bootStart := time.Now()
	cfg := config.Load()

	logger := osplog.Init("video-pipeline")
	logger.Info("initializing video pipeline service", "port", cfg.GRPCPort)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to primary PostgreSQL.
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		osplog.ConnectionFail("PostgreSQL", fmt.Sprintf("connect: %v", err))
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		osplog.ConnectionFail("PostgreSQL", fmt.Sprintf("ping: %v", err))
		os.Exit(1)
	}
	osplog.ConnectionOK("PostgreSQL", "connected")

	// Connect to cloud PostgreSQL (dual-write mirror, optional).
	var cloudPool *pgxpool.Pool
	if cloudURL := cfg.CloudDatabaseURL; cloudURL != "" && cloudURL != cfg.DatabaseURL {
		if cp, cpErr := pgxpool.New(ctx, cloudURL); cpErr != nil {
			logger.Warn("could not open cloud database for dual-write", slog.String("error", cpErr.Error()))
		} else if pingErr := cp.Ping(ctx); pingErr != nil {
			logger.Warn("cloud database ping failed — dual-write disabled", slog.String("error", pingErr.Error()))
			cp.Close()
		} else {
			cloudPool = cp
			defer cloudPool.Close()
			osplog.ConnectionOK("PostgreSQL (cloud mirror)", "dual-write enabled")
		}
	}

	queries := db.NewQueries(pool, cloudPool)

	// Initialize R2 storage.
	r2, err := storage.NewR2Storage(ctx, storage.R2Config{
		Endpoint:        cfg.R2Endpoint,
		AccessKeyID:     cfg.R2AccessKeyID,
		SecretAccessKey:  cfg.R2SecretAccessKey,
		BucketName:      cfg.R2BucketName,
	})
	if err != nil {
		osplog.ConnectionFail("Cloudflare R2", fmt.Sprintf("init: %v", err))
		os.Exit(1)
	}
	osplog.ConnectionOK("Cloudflare R2", cfg.R2BucketName)

	// Initialize spool manager.
	spool, err := storage.NewSpoolManager(cfg.SpoolDir, cfg.SpoolMaxBytes, r2)
	if err != nil {
		slog.Error("failed to initialize spool manager", "error", err)
		os.Exit(1)
	}
	slog.Info("spool manager initialized", "dir", cfg.SpoolDir)

	// Initialize services.
	recService := recording.NewRecordingService(cfg, queries, r2, spool)
	pbService := playback.NewService(queries, r2)
	snapExtractor := snapshot.NewExtractor(cfg.FFmpegPath)
	retentionCleaner := retention.NewCleaner(queries, r2)

	// Start background workers.
	go retentionCleaner.Run(ctx)
	go spool.Drain(ctx, 5*time.Minute)

	// Set up gRPC server.
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.GRPCPort))
	if err != nil {
		slog.Error("failed to listen", "port", cfg.GRPCPort, "error", err)
		os.Exit(1)
	}

	srv := grpc.NewServer()
	handler := grpchandler.NewHandler(cfg, recService, pbService, snapExtractor, r2, queries)
	pb.RegisterVideoPipelineServiceServer(srv, handler)

	go func() {
		osplog.StartupBanner("Video Pipeline Service", cfg.GRPCPort,
			map[string]string{
				"database": "PostgreSQL",
				"storage":  "Cloudflare R2 (" + cfg.R2BucketName + ")",
				"ffmpeg":   cfg.FFmpegPath,
			}, time.Since(bootStart))
		if err := srv.Serve(lis); err != nil {
			slog.Error("gRPC serve failed", "error", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	osplog.ShutdownBanner("Video Pipeline Service")
	cancel() // Stop background workers.
	srv.GracefulStop()
	slog.Info("Video Pipeline Service stopped")
}
