package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/redis/go-redis/v9"
)

// EventHandler is invoked for each received event.
type EventHandler func(ctx context.Context, event Event)

// EventSubscriber listens for events on Redis pub/sub channels.
type EventSubscriber struct {
	rdb    *redis.Client
	logger *slog.Logger
}

// NewEventSubscriber creates a new EventSubscriber.
func NewEventSubscriber(rdb *redis.Client, logger *slog.Logger) *EventSubscriber {
	return &EventSubscriber{
		rdb:    rdb,
		logger: logger,
	}
}

// Subscribe listens on the "events:{tenantId}" channel and invokes handler
// for each received event. It blocks until the context is cancelled.
func (s *EventSubscriber) Subscribe(ctx context.Context, tenantID string, handler EventHandler) error {
	channel := fmt.Sprintf("events:%s", tenantID)
	sub := s.rdb.Subscribe(ctx, channel)
	defer sub.Close()

	s.logger.InfoContext(ctx, "subscribed to channel", slog.String("channel", channel))

	return s.listen(ctx, sub, handler)
}

// SubscribeAll listens on all tenant event channels using the pattern
// "events:*" and invokes handler for each received event. It blocks until
// the context is cancelled.
func (s *EventSubscriber) SubscribeAll(ctx context.Context, handler EventHandler) error {
	sub := s.rdb.PSubscribe(ctx, "events:*")
	defer sub.Close()

	s.logger.InfoContext(ctx, "subscribed to all event channels", slog.String("pattern", "events:*"))

	return s.listen(ctx, sub, handler)
}

// listen processes incoming messages from a Redis subscription until the
// context is cancelled.
func (s *EventSubscriber) listen(ctx context.Context, sub *redis.PubSub, handler EventHandler) error {
	ch := sub.Channel()

	for {
		select {
		case <-ctx.Done():
			s.logger.InfoContext(ctx, "subscription cancelled")
			return ctx.Err()
		case msg, ok := <-ch:
			if !ok {
				return nil
			}
			s.handleMessage(ctx, msg, handler)
		}
	}
}

func (s *EventSubscriber) handleMessage(ctx context.Context, msg *redis.Message, handler EventHandler) {
	var event Event
	if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
		s.logger.ErrorContext(ctx, "unmarshal event failed",
			slog.String("channel", msg.Channel),
			slog.String("error", err.Error()),
		)
		return
	}

	s.logger.DebugContext(ctx, "received event",
		slog.String("channel", msg.Channel),
		slog.String("event_id", event.ID),
		slog.String("type", event.Type),
	)

	handler(ctx, event)
}
