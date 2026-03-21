package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/MatiDes12/osp/services/edge-agent/internal/camera"
	"github.com/MatiDes12/osp/services/edge-agent/internal/config"
	"github.com/MatiDes12/osp/services/edge-agent/internal/health"
	osplog "github.com/MatiDes12/osp/services/edge-agent/internal/log"
	"github.com/MatiDes12/osp/services/edge-agent/internal/motion"
	"github.com/MatiDes12/osp/services/edge-agent/internal/storage"
	agentsync "github.com/MatiDes12/osp/services/edge-agent/internal/sync"
)

const version = "0.1.0"

func main() {
	bootStart := time.Now()
	cfg := config.Load()

	logger := osplog.Init("edge-agent")
	logger.Info("starting edge agent",
		"agent_id", cfg.AgentID,
		"agent_name", cfg.AgentName,
		"version", version,
	)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── Storage (BoltDB offline queue) ──────────────────────────────────────
	db, err := storage.Open(cfg.DataDir)
	if err != nil {
		slog.Error("failed to open storage", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	osplog.ConnectionOK("Storage (BoltDB)", cfg.DataDir)

	// ── Camera manager ───────────────────────────────────────────────────────
	camMgr := camera.NewManager(cfg.Go2RTCURL)
	if len(cfg.CameraIDs) > 0 {
		camMgr.SetStaticCameras(cfg.CameraIDs)
	} else {
		if err := camMgr.SyncFromGo2RTC(ctx); err != nil {
			slog.Warn("could not discover cameras from go2rtc", "error", err)
		}
	}

	// ── Cloud connectivity state ─────────────────────────────────────────────
	var cloudOnline bool
	onlineCallback := func(online bool) {
		cloudOnline = online
		if online {
			slog.Info("cloud connection established", "gateway", cfg.CloudGatewayURL)
		} else {
			slog.Warn("cloud connection lost — buffering events locally")
		}
	}

	// ── Cloud syncer ─────────────────────────────────────────────────────────
	syncer := agentsync.NewSyncer(
		db,
		cfg.CloudGatewayURL,
		cfg.CloudAPIToken,
		cfg.AgentID,
		cfg.TenantID,
		cfg.SyncIntervalSeconds,
		onlineCallback,
	)
	go syncer.Run(ctx)

	// ── Motion detection ─────────────────────────────────────────────────────
	motionSvc := motion.NewMotionService(cfg.Go2RTCURL, func(evt motion.EventData) {
		queuedEvt := storage.QueuedEvent{
			ID:         fmt.Sprintf("%s-%d", evt.CameraID, evt.DetectedAt.UnixNano()),
			CameraID:   evt.CameraID,
			Type:       "motion",
			Severity:   severity(evt.Intensity),
			DetectedAt: evt.DetectedAt,
			Metadata: map[string]interface{}{
				"intensity":    evt.Intensity,
				"source":       "edge-agent",
				"agentId":      cfg.AgentID,
				"autoDetected": true,
			},
		}
		if err := db.EnqueueEvent(queuedEvt); err != nil {
			slog.Error("failed to queue motion event", "error", err)
		} else {
			pending, _, _ := db.Stats()
			slog.Info("motion event queued",
				"camera_id", evt.CameraID,
				"intensity", evt.Intensity,
				"queue_depth", pending,
			)
		}
	})

	for _, cam := range camMgr.List() {
		motionSvc.RegisterCamera(cam.ID, motion.Config{
			Sensitivity:     cfg.MotionSensitivity,
			CooldownSeconds: cfg.MotionCooldownSecs,
		})
	}
	go motionSvc.StartPolling(ctx)

	// ── Health / status HTTP server ──────────────────────────────────────────
	healthSrv := health.NewServer(cfg.HTTPPort, func() health.Status {
		pending, synced, _ := db.Stats()
		st := "online"
		if !cloudOnline {
			st = "offline"
		}
		return health.Status{
			AgentID:       cfg.AgentID,
			AgentName:     cfg.AgentName,
			Version:       version,
			Status:        st,
			CloudOnline:   cloudOnline,
			CamerasActive: camMgr.Count(),
			PendingEvents: pending,
			SyncedEvents:  synced,
		}
	})
	if err := healthSrv.Start(ctx); err != nil {
		slog.Error("failed to start health server", "error", err)
		os.Exit(1)
	}

	osplog.StartupBanner("Edge Agent", cfg.HTTPPort,
		map[string]string{
			"agent_id":   cfg.AgentID,
			"agent_name": cfg.AgentName,
			"go2rtc":     cfg.Go2RTCURL,
			"cloud":      cfg.CloudGatewayURL,
			"cameras":    fmt.Sprintf("%d registered", camMgr.Count()),
		},
		time.Since(bootStart),
	)

	// ── Graceful shutdown ────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	osplog.ShutdownBanner("Edge Agent")
	cancel()
	motionSvc.Close()
	slog.Info("Edge Agent stopped")
}

func severity(intensity int) string {
	switch {
	case intensity >= 80:
		return "high"
	case intensity >= 50:
		return "medium"
	default:
		return "low"
	}
}
