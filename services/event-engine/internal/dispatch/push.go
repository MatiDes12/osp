package dispatch

import (
	"context"
	"log/slog"
)

// PushSender sends push notifications. This is a placeholder implementation
// structured for future APNs/FCM integration.
type PushSender struct {
	logger *slog.Logger
}

// NewPushSender creates a new PushSender.
func NewPushSender(logger *slog.Logger) *PushSender {
	return &PushSender{logger: logger}
}

// SendPush sends a push notification to the specified users.
// For MVP: logs the notification and returns nil.
func (s *PushSender) SendPush(
	ctx context.Context,
	title string,
	body string,
	userIDs []string,
	thumbnailURL string,
) error {
	s.logger.InfoContext(ctx, "push notification (placeholder)",
		slog.String("title", title),
		slog.String("body", body),
		slog.Int("recipient_count", len(userIDs)),
		slog.String("thumbnail_url", thumbnailURL),
	)

	// TODO: Integrate with APNs/FCM.
	// 1. Look up device tokens for userIDs.
	// 2. Build platform-specific payloads.
	// 3. Send via APNs for iOS and FCM for Android.
	// 4. Handle token invalidation and retry.

	return nil
}
