package dispatch

import (
	"context"
	"log/slog"
)

// EmailSender sends email notifications. This is a placeholder implementation
// structured for future SendGrid integration.
type EmailSender struct {
	logger *slog.Logger
}

// NewEmailSender creates a new EmailSender.
func NewEmailSender(logger *slog.Logger) *EmailSender {
	return &EmailSender{logger: logger}
}

// SendEmail sends an email to the specified recipients.
// For MVP: logs the email details and returns nil.
func (s *EmailSender) SendEmail(
	ctx context.Context,
	to []string,
	subject string,
	htmlBody string,
) error {
	s.logger.InfoContext(ctx, "email notification (placeholder)",
		slog.Any("to", to),
		slog.String("subject", subject),
		slog.Int("body_length", len(htmlBody)),
	)

	// TODO: Integrate with SendGrid.
	// 1. Build SendGrid message with from/to/subject/body.
	// 2. Attach any relevant images (snapshots).
	// 3. Send via SendGrid API.
	// 4. Handle rate limiting and retry.

	return nil
}
