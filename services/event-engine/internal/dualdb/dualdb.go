// Package dualdb provides helpers for mirroring write operations to a secondary
// (cloud) database in the background.  The primary write is blocking; the cloud
// write is fire-and-forget so it never blocks the hot path or returns an error
// to the caller.
package dualdb

import (
	"context"
	"database/sql"
	"log/slog"
)

// FireExec runs query+args against cloud in a background goroutine.
// Safe to call with a nil cloud (no-op).
func FireExec(cloud *sql.DB, query string, args ...any) {
	if cloud == nil {
		return
	}
	go func() {
		if _, err := cloud.ExecContext(context.Background(), query, args...); err != nil {
			slog.Warn("[dual-write] cloud exec failed",
				slog.String("error", err.Error()),
				slog.String("query_prefix", truncate(query, 80)),
			)
		}
	}()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
