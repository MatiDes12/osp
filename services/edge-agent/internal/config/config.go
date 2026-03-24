package config

import (
	"os"
	"strconv"
	"strings"
)

// Config holds all environment-driven configuration for the edge agent.
type Config struct {
	HTTPPort             string
	AgentID              string
	AgentName            string
	CloudGatewayURL      string
	CloudAPIToken        string
	TenantID             string
	Go2RTCURL            string
	Go2RTCPublicURL  string // publicly reachable go2rtc URL (e.g. ngrok tunnel)
	NgrokAPIURL      string // ngrok local API for auto-discovering tunnel URL
	CloudflaredMetricsURL string // legacy: cloudflared metrics API (fallback)
	CameraIDs            []string
	SyncIntervalSeconds  int
	MotionSensitivity    int
	MotionCooldownSecs   int
	DataDir              string
	SnapshotDir          string
}

func Load() Config {
	return Config{
		HTTPPort:            envOrDefault("EDGE_HTTP_PORT", "8084"),
		AgentID:             envOrDefault("EDGE_AGENT_ID", "edge-01"),
		AgentName:           envOrDefault("EDGE_AGENT_NAME", "Edge Agent"),
		CloudGatewayURL:     envOrDefault("CLOUD_GATEWAY_URL", ""),
		CloudAPIToken:       envOrDefault("CLOUD_API_TOKEN", ""),
		TenantID:            envOrDefault("TENANT_ID", ""),
		Go2RTCURL:           envOrDefault("GO2RTC_URL", "http://localhost:1984"),
		Go2RTCPublicURL:       envOrDefault("GO2RTC_PUBLIC_URL", ""),
		NgrokAPIURL:           envOrDefault("NGROK_API_URL", ""),
		CloudflaredMetricsURL: envOrDefault("CLOUDFLARED_METRICS_URL", ""),
		CameraIDs:           parseCameraIDs(envOrDefault("CAMERA_IDS", "")),
		SyncIntervalSeconds: envOrDefaultInt("SYNC_INTERVAL_SECONDS", 30),
		MotionSensitivity:   envOrDefaultInt("MOTION_SENSITIVITY", 5),
		MotionCooldownSecs:  envOrDefaultInt("MOTION_COOLDOWN_SECONDS", 10),
		DataDir:             envOrDefault("DATA_DIR", "./data"),
		SnapshotDir:         envOrDefault("SNAPSHOT_DIR", "./data/snapshots"),
	}
}

func parseCameraIDs(s string) []string {
	if s == "" {
		return []string{}
	}
	parts := strings.Split(s, ",")
	ids := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			ids = append(ids, p)
		}
	}
	return ids
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
