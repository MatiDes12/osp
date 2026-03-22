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
	db             *storage.DB
	gatewayURL     string
	apiToken       string
	agentID        string
	tenantID       string
	syncInterval   time.Duration
	httpClient     *http.Client
	onlineCallback func(bool)
	isOnline       bool
}

// NewSyncer creates a new Syncer.
// onlineCallback is called (synchronously) whenever cloud connectivity changes.
func NewSyncer(
	db *storage.DB,
	gatewayURL, apiToken, agentID, tenantID string,
	syncIntervalSecs int,
	onlineCallback func(bool),
) *Syncer {
	return &Syncer{
		db:             db,
		gatewayURL:     gatewayURL,
		apiToken:       apiToken,
		agentID:        agentID,
		tenantID:       tenantID,
		syncInterval:   time.Duration(syncIntervalSecs) * time.Second,
		httpClient:     &http.Client{Timeout: 15 * time.Second},
		onlineCallback: onlineCallback,
	}
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
		"status":        "online",
		"pendingEvents": pending,
		"syncedEvents":  synced,
		"timestamp":     time.Now().UTC(),
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
