package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"

	_ "github.com/jackc/pgx/v5/stdlib"

	"time"

	"github.com/MatiDes12/osp/services/event-engine/internal/dispatch"
	"github.com/MatiDes12/osp/services/event-engine/internal/events"
	osplog "github.com/MatiDes12/osp/services/event-engine/internal/log"
	"github.com/MatiDes12/osp/services/event-engine/internal/rules"
)

func main() {
	bootStart := time.Now()
	logger := osplog.Init("event-engine")

	// --- Configuration from environment ---
	grpcPort := envOrDefault("EVENT_GRPC_PORT", "50053")
	redisAddr := envOrDefault("REDIS_URL", "localhost:6379")
	databaseURL := envOrDefault("DATABASE_URL", "")

	if databaseURL == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	// --- Database ---
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		osplog.ConnectionFail("PostgreSQL", fmt.Sprintf("ping: %v", err))
		os.Exit(1)
	}
	osplog.ConnectionOK("PostgreSQL", "connected")

	// --- Redis ---
	rdb := redis.NewClient(&redis.Options{
		Addr: redisAddr,
	})
	defer rdb.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		osplog.ConnectionFail("Redis", fmt.Sprintf("ping: %v", err))
		os.Exit(1)
	}
	osplog.ConnectionOK("Redis", redisAddr)

	// --- Services ---
	eventRepo := events.NewPostgresEventRepository(db)
	eventPublisher := events.NewEventPublisher(rdb, logger)
	eventSubscriber := events.NewEventSubscriber(rdb, logger)

	ruleEngine := rules.NewRuleEngine(db, rdb, logger)

	pushSender := dispatch.NewPushSender(logger)
	emailSender := dispatch.NewEmailSender(logger)
	dispatcher := dispatch.NewNotificationDispatcher(rdb, pushSender, emailSender, logger)

	// --- Event processing pipeline ---
	handler := func(ctx context.Context, event events.Event) {
		// Persist the event if it has no ID yet (came from external source).
		if event.ID == "" {
			id, err := eventRepo.CreateEvent(ctx, event)
			if err != nil {
				logger.ErrorContext(ctx, "failed to persist event",
					slog.String("error", err.Error()),
				)
				return
			}
			event.ID = id
			logger.InfoContext(ctx, "event persisted",
				slog.String("event_id", id),
				slog.String("type", event.Type),
			)
		}

		// Evaluate rules.
		matched, err := ruleEngine.EvaluateEvent(ctx, event)
		if err != nil {
			logger.ErrorContext(ctx, "rule evaluation failed",
				slog.String("event_id", event.ID),
				slog.String("error", err.Error()),
			)
			return
		}

		if len(matched) == 0 {
			logger.DebugContext(ctx, "no rules matched",
				slog.String("event_id", event.ID),
			)
			return
		}

		logger.InfoContext(ctx, "rules matched",
			slog.String("event_id", event.ID),
			slog.Int("matched_count", len(matched)),
		)

		// Dispatch actions for each matched rule.
		for _, m := range matched {
			if err := dispatcher.Dispatch(ctx, m, event); err != nil {
				logger.ErrorContext(ctx, "dispatch failed",
					slog.String("rule_id", m.Rule.ID),
					slog.String("event_id", event.ID),
					slog.String("error", err.Error()),
				)
			}
		}
	}

	// Start rule cache invalidation listener.
	go func() {
		if err := ruleEngine.StartCacheInvalidation(ctx); err != nil && ctx.Err() == nil {
			logger.Error("rule cache invalidation stopped", slog.String("error", err.Error()))
		}
	}()

	// Start event subscriber.
	go func() {
		if err := eventSubscriber.SubscribeAll(ctx, handler); err != nil && ctx.Err() == nil {
			logger.Error("event subscriber stopped", slog.String("error", err.Error()))
		}
	}()

	// --- gRPC server ---
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", grpcPort))
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	srv := grpc.NewServer()

	// TODO: Register EventEngineService gRPC handler once proto is compiled.

	go func() {
		osplog.StartupBanner("Event Engine Service", grpcPort,
			map[string]string{
				"database": "PostgreSQL",
				"redis":    redisAddr,
			}, time.Since(bootStart))
		if err := srv.Serve(lis); err != nil {
			slog.Error("gRPC serve failed", "error", err)
			os.Exit(1)
		}
	}()

	// --- Graceful shutdown ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	osplog.ShutdownBanner("Event Engine Service")
	cancel()
	srv.GracefulStop()

	// Suppress unused variable warnings for components used in pipeline closure.
	_ = eventPublisher
	_ = eventRepo

	slog.Info("Event Engine Service stopped")
}

func envOrDefault(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

