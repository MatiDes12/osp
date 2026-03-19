package dispatch

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

type PushSender struct {
	logger     *slog.Logger
	db         *sql.DB
	httpClient *http.Client
	expoSendURL string
}

func NewPushSender(logger *slog.Logger, db *sql.DB) *PushSender {
	return &PushSender{
		logger: logger,
		db:     db,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		expoSendURL: "https://exp.host/--/api/v2/push/send",
	}
}

func (s *PushSender) SendPush(
	ctx context.Context,
	title string,
	body string,
	userIDs []string,
	tenantID string,
	thumbnailURL string,
	data map[string]any,
) error {
	if s.db == nil {
		return fmt.Errorf("push sender misconfigured: db is nil")
	}

	// Best-effort: if no explicit recipients are provided, default to all users
	// in the tenant that have a push token.
	pushTokens, err := s.fetchPushTokens(ctx, tenantID, userIDs)
	if err != nil {
		return fmt.Errorf("fetch push tokens: %w", err)
	}

	if len(pushTokens) == 0 {
		s.logger.InfoContext(ctx, "push notification skipped: no push tokens",
			slog.String("tenant_id", tenantID),
			slog.String("title", title),
		)
		return nil
	}

	s.logger.InfoContext(ctx, "sending push notification",
		slog.String("tenant_id", tenantID),
		slog.Int("recipient_count", len(pushTokens)),
		slog.String("title", title),
	)

	// Send one request per device token (Expo supports batching, but this is
	// simpler and good enough for MVP).
	var lastErr error
	for _, t := range pushTokens {
		payload := map[string]any{
			"to":    t.token,
			"title": title,
			"body":  body,
			"data":  s.buildData(data, t.userID, thumbnailURL),
		}

		reqBody, err := json.Marshal(payload)
		if err != nil {
			lastErr = fmt.Errorf("marshal expo payload: %w", err)
			continue
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.expoSendURL, bytes.NewReader(reqBody))
		if err != nil {
			lastErr = fmt.Errorf("create expo request: %w", err)
			continue
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := s.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("expo push request: %w", err)
			continue
		}

		_ = resp.Body.Close()

		if resp.StatusCode >= 400 {
			lastErr = fmt.Errorf("expo push returned status %d", resp.StatusCode)
			continue
		}
	}

	if lastErr != nil {
		// Return error so the dispatcher can log, but we already do best-effort
		// delivery attempts above.
		return lastErr
	}

	return nil
}

type pushTokenRow struct {
	userID string
	token  string
}

func (s *PushSender) fetchPushTokens(ctx context.Context, tenantID string, userIDs []string) ([]pushTokenRow, error) {
	if len(userIDs) == 0 {
		rows, err := s.db.QueryContext(ctx, `
			SELECT id, push_token
			FROM users
			WHERE tenant_id = $1
				AND push_token IS NOT NULL
				AND push_token <> ''
		`, tenantID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		var out []pushTokenRow
		for rows.Next() {
			var r pushTokenRow
			if err := rows.Scan(&r.userID, &r.token); err != nil {
				return nil, err
			}
			out = append(out, r)
		}
		return out, rows.Err()
	}

	// Build an `IN ($2, $3, ...)` clause to avoid a pq dependency.
	placeholders := make([]string, 0, len(userIDs))
	args := make([]any, 0, len(userIDs)+1)
	args = append(args, tenantID)

	for i := range userIDs {
		placeholders = append(placeholders, fmt.Sprintf("$%d", i+2))
		args = append(args, userIDs[i])
	}

	query := fmt.Sprintf(`
		SELECT id, push_token
		FROM users
		WHERE tenant_id = $1
			AND push_token IS NOT NULL
			AND push_token <> ''
			AND id IN (%s)
	`, strings.Join(placeholders, ","))

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []pushTokenRow
	for rows.Next() {
		var r pushTokenRow
		if err := rows.Scan(&r.userID, &r.token); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *PushSender) buildData(base map[string]any, userID string, thumbnailURL string) map[string]any {
	out := map[string]any{}
	for k, v := range base {
		out[k] = v
	}

	// Include helpful routing data for client-side handling.
	out["userId"] = userID
	if thumbnailURL != "" {
		out["thumbnailUrl"] = thumbnailURL
	}

	return out
}
