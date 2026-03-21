// Package log provides structured logging helpers for OSP Go services.
// Uses log/slog with JSON output, startup banners, and connection checks.
package log

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"
)

// Init configures the default slog logger with JSON output and the level
// from the LOG_LEVEL environment variable (debug, info, warn, error).
func Init(service string) *slog.Logger {
	level := parseLevel(os.Getenv("LOG_LEVEL"))

	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: level,
	})

	logger := slog.New(handler).With("service", service)
	slog.SetDefault(logger)

	return logger
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// StartupBanner prints a boxed startup message to stdout and logs the event.
func StartupBanner(service string, port string, extras map[string]string, bootTime time.Duration) {
	lines := []string{
		fmt.Sprintf("%s started on port %s", service, port),
	}

	if extras != nil {
		for k, v := range extras {
			lines = append(lines, fmt.Sprintf("  %s: %s", k, v))
		}
	}

	lines = append(lines, fmt.Sprintf("  boot_time: %dms", bootTime.Milliseconds()))

	maxLen := 0
	for _, l := range lines {
		if len(l) > maxLen {
			maxLen = len(l)
		}
	}

	border := "+" + strings.Repeat("-", maxLen+4) + "+"
	fmt.Fprintln(os.Stdout)
	fmt.Fprintln(os.Stdout, border)
	for _, l := range lines {
		fmt.Fprintf(os.Stdout, "|  %-*s  |\n", maxLen, l)
	}
	fmt.Fprintln(os.Stdout, border)
	fmt.Fprintln(os.Stdout)

	slog.Info("service started",
		"port", port,
		"boot_time_ms", bootTime.Milliseconds(),
	)
}

// ShutdownBanner prints a boxed shutdown message.
func ShutdownBanner(service string) {
	msg := fmt.Sprintf("%s shutting down gracefully...", service)
	border := "+" + strings.Repeat("-", len(msg)+4) + "+"

	fmt.Fprintln(os.Stdout)
	fmt.Fprintln(os.Stdout, border)
	fmt.Fprintf(os.Stdout, "|  %s  |\n", msg)
	fmt.Fprintln(os.Stdout, border)
	fmt.Fprintln(os.Stdout)

	slog.Info("service shutdown initiated")
}

// ConnectionOK logs a successful dependency connection.
func ConnectionOK(name string, detail string) {
	slog.Info(fmt.Sprintf("[OK] %s: connected", name), "detail", detail)
}

// ConnectionFail logs a failed dependency connection.
func ConnectionFail(name string, detail string) {
	slog.Error(fmt.Sprintf("[FAIL] %s: connection failed", name), "detail", detail)
}
