package config

import (
	"os"
	"strconv"
)

// Config holds all service configuration loaded from environment variables.
type Config struct {
	GRPCPort string

	// Database
	DatabaseURL      string
	CloudDatabaseURL string // optional — when set and different from DatabaseURL, writes are mirrored here

	// R2 / S3
	R2Endpoint        string
	R2AccessKeyID     string
	R2SecretAccessKey  string
	R2BucketName      string

	// go2rtc base URL for RTSP re-stream
	Go2RTCBaseURL string

	// Local spool
	SpoolDir      string
	SpoolMaxBytes int64

	// Recording defaults
	DefaultSegmentDuration int
	DefaultRetentionDays   int

	// FFmpeg binary path
	FFmpegPath string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() Config {
	return Config{
		GRPCPort:         envOrDefault("VIDEO_GRPC_PORT", "50052"),
		DatabaseURL:      envOrDefault("DATABASE_URL", "postgres://localhost:5432/osp?sslmode=disable"),
		CloudDatabaseURL: envOrDefault("DATABASE_CLOUD_URL", ""),

		R2Endpoint:        envOrDefault("R2_ENDPOINT", ""),
		R2AccessKeyID:     envOrDefault("R2_ACCESS_KEY_ID", ""),
		R2SecretAccessKey:  envOrDefault("R2_SECRET_ACCESS_KEY", ""),
		R2BucketName:      envOrDefault("R2_BUCKET_NAME", "osp-recordings"),

		Go2RTCBaseURL: envOrDefault("GO2RTC_BASE_URL", "rtsp://localhost:8554"),

		SpoolDir:      envOrDefault("VIDEO_SPOOL_DIR", "/tmp/osp-spool"),
		SpoolMaxBytes: envOrDefaultInt64("VIDEO_SPOOL_MAX_BYTES", 10*1024*1024*1024), // 10GB

		DefaultSegmentDuration: envOrDefaultInt("VIDEO_SEGMENT_DURATION", 2),
		DefaultRetentionDays:   envOrDefaultInt("VIDEO_RETENTION_DAYS", 30),

		FFmpegPath: envOrDefault("FFMPEG_PATH", "ffmpeg"),
	}
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envOrDefaultInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envOrDefaultInt64(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return fallback
}
