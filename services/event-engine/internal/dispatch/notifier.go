package dispatch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/errgroup"

	"github.com/MatiDes12/osp/services/event-engine/internal/events"
	"github.com/MatiDes12/osp/services/event-engine/internal/rules"
)

// NotificationDispatcher handles executing rule actions when events match.
type NotificationDispatcher struct {
	rdb        *redis.Client
	httpClient *http.Client
	push       *PushSender
	email      *EmailSender
	logger     *slog.Logger
}

// NewNotificationDispatcher creates a new NotificationDispatcher.
func NewNotificationDispatcher(
	rdb *redis.Client,
	push *PushSender,
	email *EmailSender,
	logger *slog.Logger,
) *NotificationDispatcher {
	return &NotificationDispatcher{
		rdb: rdb,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		push:   push,
		email:  email,
		logger: logger,
	}
}

// Dispatch executes all actions defined in the matched rule concurrently.
func (d *NotificationDispatcher) Dispatch(ctx context.Context, matched rules.MatchedRule, event events.Event) error {
	g, gCtx := errgroup.WithContext(ctx)

	for _, action := range matched.Rule.Actions {
		action := action // capture loop variable
		g.Go(func() error {
			if err := d.executeAction(gCtx, action, matched, event); err != nil {
				d.logger.ErrorContext(gCtx, "action dispatch failed",
					slog.String("rule_id", matched.Rule.ID),
					slog.String("action_type", action.Type),
					slog.String("event_id", event.ID),
					slog.String("error", err.Error()),
				)
				return err
			}

			d.logger.InfoContext(gCtx, "action dispatched",
				slog.String("rule_id", matched.Rule.ID),
				slog.String("action_type", action.Type),
				slog.String("event_id", event.ID),
			)
			return nil
		})
	}

	return g.Wait()
}

func (d *NotificationDispatcher) executeAction(
	ctx context.Context,
	action rules.Action,
	matched rules.MatchedRule,
	event events.Event,
) error {
	switch action.Type {
	case "push_notification":
		return d.handlePushNotification(ctx, action, event)
	case "email":
		return d.handleEmail(ctx, action, event)
	case "webhook":
		return d.handleWebhook(ctx, action, event)
	case "start_recording":
		return d.handleStartRecording(ctx, action, event)
	default:
		return fmt.Errorf("unknown action type: %s", action.Type)
	}
}

func (d *NotificationDispatcher) handlePushNotification(
	ctx context.Context,
	action rules.Action,
	event events.Event,
) error {
	title, _ := action.Config["title"].(string)
	body, _ := action.Config["body"].(string)
	thumbnailURL, _ := action.Config["thumbnail_url"].(string)

	if title == "" {
		title = fmt.Sprintf("Alert: %s detected", event.Type)
	}
	if body == "" {
		body = fmt.Sprintf("Event detected on camera %s with severity %s", event.CameraID, event.Severity)
	}

	var userIDs []string
	if raw, ok := action.Config["user_ids"]; ok {
		if ids, ok := raw.([]interface{}); ok {
			for _, id := range ids {
				if s, ok := id.(string); ok {
					userIDs = append(userIDs, s)
				}
			}
		}
	}

	data := map[string]any{
		"eventId":    event.ID,
		"cameraId":   event.CameraID,
		"eventType":  event.Type,
		"severity":   event.Severity,
		"thumbnailUrl": thumbnailURL,
	}

	return d.push.SendPush(ctx, title, body, userIDs, event.TenantID, thumbnailURL, data)
}

func (d *NotificationDispatcher) handleEmail(
	ctx context.Context,
	action rules.Action,
	event events.Event,
) error {
	subject, _ := action.Config["subject"].(string)
	htmlBody, _ := action.Config["html_body"].(string)

	if subject == "" {
		subject = fmt.Sprintf("OSP Alert: %s event detected", event.Type)
	}
	if htmlBody == "" {
		htmlBody = fmt.Sprintf(
			"<p>A <strong>%s</strong> event was detected on camera %s.</p><p>Severity: %s</p>",
			event.Type, event.CameraID, event.Severity,
		)
	}

	var to []string
	if raw, ok := action.Config["to"]; ok {
		if emails, ok := raw.([]interface{}); ok {
			for _, e := range emails {
				if s, ok := e.(string); ok {
					to = append(to, s)
				}
			}
		}
	}

	return d.email.SendEmail(ctx, to, subject, htmlBody)
}

func (d *NotificationDispatcher) handleWebhook(
	ctx context.Context,
	action rules.Action,
	event events.Event,
) error {
	url, ok := action.Config["url"].(string)
	if !ok || url == "" {
		return fmt.Errorf("webhook action missing url")
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal webhook payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create webhook request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	// Add optional headers from config.
	if headers, ok := action.Config["headers"].(map[string]interface{}); ok {
		for k, v := range headers {
			if s, ok := v.(string); ok {
				req.Header.Set(k, s)
			}
		}
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("webhook request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}

func (d *NotificationDispatcher) handleStartRecording(
	ctx context.Context,
	action rules.Action,
	event events.Event,
) error {
	command := map[string]interface{}{
		"command":   "recording.start",
		"camera_id": event.CameraID,
		"tenant_id": event.TenantID,
		"event_id":  event.ID,
		"trigger":   "rule",
	}

	// Allow duration override from config.
	if duration, ok := action.Config["duration_sec"]; ok {
		command["duration_sec"] = duration
	}

	data, err := json.Marshal(command)
	if err != nil {
		return fmt.Errorf("marshal recording command: %w", err)
	}

	channel := fmt.Sprintf("commands:%s", event.CameraID)
	if err := d.rdb.Publish(ctx, channel, data).Err(); err != nil {
		return fmt.Errorf("publish recording command: %w", err)
	}

	d.logger.InfoContext(ctx, "published recording start command",
		slog.String("camera_id", event.CameraID),
		slog.String("event_id", event.ID),
	)

	return nil
}
