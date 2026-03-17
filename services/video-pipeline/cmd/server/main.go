package main

import (
	"context"
	"fmt"
	"log"
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
	"github.com/MatiDes12/osp/services/video-pipeline/internal/playback"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/recording"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/retention"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/snapshot"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/storage"
	pb "github.com/MatiDes12/osp/services/video-pipeline/pkg/proto"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to PostgreSQL.
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping database: %v", err)
	}
	log.Println("connected to database")

	queries := db.NewQueries(pool)

	// Initialize R2 storage.
	r2, err := storage.NewR2Storage(ctx, storage.R2Config{
		Endpoint:       cfg.R2Endpoint,
		AccessKeyID:    cfg.R2AccessKeyID,
		SecretAccessKey: cfg.R2SecretAccessKey,
		BucketName:     cfg.R2BucketName,
	})
	if err != nil {
		log.Fatalf("initialize R2 storage: %v", err)
	}
	log.Println("R2 storage initialized")

	// Initialize spool manager.
	spool, err := storage.NewSpoolManager(cfg.SpoolDir, cfg.SpoolMaxBytes, r2)
	if err != nil {
		log.Fatalf("initialize spool manager: %v", err)
	}

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
		log.Fatalf("listen on :%s: %v", cfg.GRPCPort, err)
	}

	srv := grpc.NewServer()
	handler := grpchandler.NewHandler(cfg, recService, pbService, snapExtractor, r2, queries)
	pb.RegisterVideoPipelineServiceServer(srv, handler)

	go func() {
		log.Printf("Video Pipeline Service listening on :%s", cfg.GRPCPort)
		if err := srv.Serve(lis); err != nil {
			log.Fatalf("serve gRPC: %v", err)
		}
	}()

	// Graceful shutdown.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down Video Pipeline Service...")
	cancel() // Stop background workers.
	srv.GracefulStop()
	log.Println("Video Pipeline Service stopped")
}
