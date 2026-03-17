package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/redis/go-redis/v9"
)

// EventPublisher publishes events to Redis pub/sub channels.
type EventPublisher struct {
	rdb    *redis.Client
	logger *slog.Logger
}

// NewEventPublisher creates a new EventPublisher.
func NewEventPublisher(rdb *redis.Client, logger *slog.Logger) *EventPublisher {
	return &EventPublisher{
		rdb:    rdb,
		logger: logger,
	}
}

// PublishEvent serializes the event as JSON and publishes it to the
// tenant-scoped Redis channel "events:{tenantId}".
func (p *EventPublisher) PublishEvent(ctx context.Context, tenantID string, event Event) error {
	channel := fmt.Sprintf("events:%s", tenantID)

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	if err := p.rdb.Publish(ctx, channel, data).Err(); err != nil {
		return fmt.Errorf("publish to %s: %w", channel, err)
	}

	p.logger.DebugContext(ctx, "published event",
		slog.String("channel", channel),
		slog.String("event_id", event.ID),
		slog.String("type", event.Type),
	)

	return nil
}
