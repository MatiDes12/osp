// Package sync handles periodic synchronization of buffered events to the
// cloud OSP gateway. When the gateway is unreachable, events accumulate in
// the local BoltDB queue and are sent in batches once connectivity returns.
package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/MatiDes12/osp/services/edge-agent/internal/storage"
)

// Syncer manages cloud sync for a single edge agent.
type Syncer struct {
	db                    *storage.DB
	gatewayURL            string
	go2rtcURL             string
	go2rtcPublicURL       string
	cloudflaredMetricsURL string
	apiToken              string
	agentID               string
	tenantID              string
	syncInterval          time.Duration
	httpClient            *http.Client
	onlineCallback        func(bool)
	isOnline              bool
}

// NewSyncer creates a new Syncer.
// onlineCallback is called (synchronously) whenever cloud connectivity changes.
func NewSyncer(
	db *storage.DB,
	gatewayURL, go2rtcURL, go2rtcPublicURL, cloudflaredMetricsURL, apiToken, agentID, tenantID string,
	syncIntervalSecs int,
	onlineCallback func(bool),
) *Syncer {
	return &Syncer{
		db:                    db,
		gatewayURL:            gatewayURL,
		go2rtcURL:             go2rtcURL,
		go2rtcPublicURL:       go2rtcPublicURL,
		cloudflaredMetricsURL: cloudflaredMetricsURL,
		apiToken:              apiToken,
		agentID:               agentID,
		tenantID:              tenantID,
		syncInterval:          time.Duration(syncIntervalSecs) * time.Second,
		httpClient:            &http.Client{Timeout: 15 * time.Second},
		onlineCallback:        onlineCallback,
	}
}

// resolveGo2RTCPublicURL returns the best available public URL for go2rtc.
// Priority: explicit GO2RTC_PUBLIC_URL > auto-discovered from cloudflared API > empty.
func (s *Syncer) resolveGo2RTCPublicURL() string {
	if s.go2rtcPublicURL != "" {
		return s.go2rtcPublicURL
	}
	if s.cloudflaredMetricsURL == "" {
		return ""
	}
	// cloudflared exposes the quick tunnel hostname at /quicktunnel
	// Response: {"hostname":"xxx.trycloudflare.com"} or {"url":"https://..."}
	resp, err := s.httpClient.Get(s.cloudflaredMetricsURL + "/quicktunnel")
	if err != nil || resp.StatusCode != 200 {
		return ""
	}
	defer resp.Body.Close()
	var result struct {
		Hostname string `json:"hostname"`
		URL      string `json:"url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return ""
	}
	if result.URL != "" {
		return result.URL
	}
	if result.Hostname != "" {
		return "https://" + result.Hostname
	}
	return ""
}

// Run starts the sync loop. Blocks until ctx is cancelled.
func (s *Syncer) Run(ctx context.Context) {
	if s.gatewayURL == "" {
		slog.Warn("CLOUD_GATEWAY_URL not set — cloud sync disabled")
		return
	}

	// Register with the gateway on startup so the dashboard can detect us.
	s.registerAgent(ctx)

	// Attempt sync immediately on startup.
	s.syncOnce(ctx)

	ticker := time.NewTicker(s.syncInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.syncOnce(ctx)
		}
	}
}

// IsOnline returns the last known cloud connectivity state.
func (s *Syncer) IsOnline() bool {
	return s.isOnline
}

func (s *Syncer) syncOnce(ctx context.Context) {
	online := s.sendHeartbeat(ctx)
	if online != s.isOnline {
		s.isOnline = online
		if s.onlineCallback != nil {
			s.onlineCallback(online)
		}
	}
	if !online {
		return
	}

	// Sync cameras from gateway into local go2rtc
	s.syncCamerasToGo2RTC(ctx)

	// Report go2rtc stream statuses back to gateway so camera cards show online/offline.
	s.reportCameraStatuses(ctx)

	// Sync up to 50 pending events per cycle.
	events, err := s.db.GetPendingEvents(50)
	if err != nil {
		slog.Error("get pending events", "error", err)
		return
	}
	if len(events) == 0 {
		return
	}

	slog.Info("syncing events to cloud", "count", len(events))
	for _, evt := range events {
		if err := s.syncEvent(ctx, evt); err != nil {
			slog.Warn("sync event failed", "event_id", evt.ID, "error", err)
			_ = s.db.IncrementRetry(evt.ID)
		} else {
			_ = s.db.MarkEventSynced(evt.ID)
		}
	}

	// Prune synced events older than 24 h to keep the queue small.
	pruned, _ := s.db.PruneOldSynced(24 * time.Hour)
	if pruned > 0 {
		slog.Info("pruned synced events", "count", pruned)
	}
}

type cameraRow struct {
	ID            string `json:"id"`
	ConnectionURI string `json:"connection_uri"`
}

func (s *Syncer) syncCamerasToGo2RTC(ctx context.Context) {
	if s.go2rtcURL == "" {
		return
	}
	// Use the edge agent endpoint — authenticated with X-Tenant-Id
	url := fmt.Sprintf("%s/api/v1/edge/cameras", s.gatewayURL)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return
	}
	req.Header.Set("X-Tenant-Id", s.tenantID)
	resp, err := s.httpClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return
	}
	defer resp.Body.Close()

	var result struct {
		Data []cameraRow `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return
	}

	for _, cam := range result.Data {
		if cam.ID == "" || cam.ConnectionURI == "" {
			continue
		}
		addURL := fmt.Sprintf("%s/api/streams?name=%s&src=%s",
			s.go2rtcURL, urlEncode(cam.ID), urlEncode(cam.ConnectionURI))
		addReq, err := http.NewRequestWithContext(ctx, "PUT", addURL, nil)
		if err != nil {
			continue
		}
		addResp, err := s.httpClient.Do(addReq)
		if err != nil {
			slog.Warn("failed to register camera in go2rtc", "camera_id", cam.ID, "error", err)
			continue
		}
		addResp.Body.Close()
		slog.Info("camera registered in go2rtc", "camera_id", cam.ID)
	}
}

type go2rtcStream struct {
	Producers []interface{} `json:"producers"`
}

// reportCameraStatuses queries local go2rtc for all stream statuses and
// reports them to the gateway so camera cards show the correct online/offline state.
func (s *Syncer) reportCameraStatuses(ctx context.Context) {
	if s.go2rtcURL == "" {
		return
	}

	// Fetch all streams from go2rtc.
	streamsURL := fmt.Sprintf("%s/api/streams", s.go2rtcURL)
	req, err := http.NewRequestWithContext(ctx, "GET", streamsURL, nil)
	if err != nil {
		return
	}
	resp, err := s.httpClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return
	}
	defer resp.Body.Close()

	var streams map[string]go2rtcStream
	if err := json.NewDecoder(resp.Body).Decode(&streams); err != nil {
		return
	}

	type statusEntry struct {
		CameraID string `json:"cameraId"`
		Status   string `json:"status"`
	}

	statuses := make([]statusEntry, 0, len(streams))
	for id, stream := range streams {
		st := "connecting"
		if len(stream.Producers) > 0 {
			st = "online"
		}
		statuses = append(statuses, statusEntry{CameraID: id, Status: st})
	}

	if len(statuses) == 0 {
		return
	}

	payload, err := json.Marshal(map[string]interface{}{"statuses": statuses})
	if err != nil {
		return
	}

	reportURL := fmt.Sprintf("%s/api/v1/edge/cameras/status", s.gatewayURL)
	reportReq, err := http.NewRequestWithContext(ctx, "POST", reportURL, bytes.NewReader(payload))
	if err != nil {
		return
	}
	reportReq.Header.Set("Content-Type", "application/json")
	reportReq.Header.Set("X-Tenant-Id", s.tenantID)

	reportResp, err := s.httpClient.Do(reportReq)
	if err != nil {
		slog.Warn("failed to report camera statuses to gateway", "error", err)
		return
	}
	defer reportResp.Body.Close()
	io.ReadAll(reportResp.Body) //nolint:errcheck

	slog.Info("camera statuses reported to gateway", "count", len(statuses))
}

func urlEncode(s string) string {
	encoded := ""
	for _, c := range []byte(s) {
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '.' || c == '~' {
			encoded += string(c)
		} else {
			encoded += fmt.Sprintf("%%%02X", c)
		}
	}
	return encoded
}

func (s *Syncer) registerAgent(ctx context.Context) {
	url := fmt.Sprintf("%s/api/v1/edge/agents/register", s.gatewayURL)
	payload := map[string]interface{}{
		"agentId": s.agentID,
		"name":    "OSP Edge Agent (" + s.agentID + ")",
		"version": "0.1.0",
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		slog.Warn("register: build request failed", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiToken)
	if s.tenantID != "" {
		req.Header.Set("X-Tenant-Id", s.tenantID)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		slog.Warn("register: request failed", "error", err)
		return
	}
	defer resp.Body.Close()
	io.ReadAll(resp.Body) //nolint:errcheck

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		slog.Info("agent registered with gateway", "agent_id", s.agentID)
	} else {
		slog.Warn("register: unexpected status", "status", resp.StatusCode)
	}
}

func (s *Syncer) sendHeartbeat(ctx context.Context) bool {
	pending, synced, _ := s.db.Stats()
	url := fmt.Sprintf("%s/api/v1/edge/agents/%s/heartbeat", s.gatewayURL, s.agentID)

	payload := map[string]interface{}{
		"status":          "online",
		"pendingEvents":   pending,
		"syncedEvents":    synced,
		"timestamp":       time.Now().UTC(),
		"go2rtcPublicUrl": s.resolveGo2RTCPublicURL(),
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiToken)
	if s.tenantID != "" {
		req.Header.Set("X-Tenant-Id", s.tenantID)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		slog.Debug("heartbeat failed", "error", err)
		return false
	}
	defer resp.Body.Close()
	io.ReadAll(resp.Body) //nolint:errcheck

	return resp.StatusCode == http.StatusOK
}

func (s *Syncer) syncEvent(ctx context.Context, evt storage.QueuedEvent) error {
	url := fmt.Sprintf("%s/api/v1/events", s.gatewayURL)

	payload := map[string]interface{}{
		"cameraId":   evt.CameraID,
		"type":       evt.Type,
		"severity":   evt.Severity,
		"metadata":   evt.Metadata,
		"occurredAt": evt.DetectedAt,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiToken)
	if s.tenantID != "" {
		req.Header.Set("X-Tenant-Id", s.tenantID)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()
	io.ReadAll(resp.Body) //nolint:errcheck

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("gateway returned %d", resp.StatusCode)
	}
	return nil
}
