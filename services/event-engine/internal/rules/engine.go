package rules

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/MatiDes12/osp/services/event-engine/internal/dualdb"
	"github.com/MatiDes12/osp/services/event-engine/internal/events"
)

// RuleEngine loads, caches, and evaluates alert rules for tenants.
type RuleEngine struct {
	db      *sql.DB
	cloudDB *sql.DB // optional — writes are mirrored here in the background
	rdb     *redis.Client
	logger  *slog.Logger

	mu    sync.RWMutex
	cache map[string][]AlertRule // tenantID -> compiled rules
}

// NewRuleEngine creates a new RuleEngine.
// Pass a non-nil cloudDB to enable dual-write mirroring.
func NewRuleEngine(db *sql.DB, cloudDB *sql.DB, rdb *redis.Client, logger *slog.Logger) *RuleEngine {
	return &RuleEngine{
		db:      db,
		cloudDB: cloudDB,
		rdb:     rdb,
		logger:  logger,
		cache:   make(map[string][]AlertRule),
	}
}

// StartCacheInvalidation subscribes to rule update notifications on Redis
// and invalidates the local cache. It blocks until the context is cancelled.
func (e *RuleEngine) StartCacheInvalidation(ctx context.Context) error {
	sub := e.rdb.PSubscribe(ctx, "rules:*:updated")
	defer sub.Close()

	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-ch:
			if !ok {
				return nil
			}
			// Channel format: "rules:{tenantId}:updated"
			parts := strings.SplitN(msg.Channel, ":", 3)
			if len(parts) >= 2 {
				tenantID := parts[1]
				e.invalidateCache(tenantID)
				e.logger.InfoContext(ctx, "invalidated rule cache",
					slog.String("tenant_id", tenantID),
				)
			}
		}
	}
}

// LoadRules fetches all enabled rules for a tenant from the database and
// caches them. Returns the loaded rules.
func (e *RuleEngine) LoadRules(ctx context.Context, tenantID string) ([]AlertRule, error) {
	e.mu.RLock()
	cached, ok := e.cache[tenantID]
	e.mu.RUnlock()
	if ok {
		return cached, nil
	}

	rules, err := e.fetchRulesFromDB(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	e.mu.Lock()
	e.cache[tenantID] = rules
	e.mu.Unlock()

	e.logger.InfoContext(ctx, "loaded rules",
		slog.String("tenant_id", tenantID),
		slog.Int("count", len(rules)),
	)

	return rules, nil
}

// EvaluateEvent checks an event against all tenant rules and returns the
// list of matched rules. For each match it verifies the schedule and cooldown.
func (e *RuleEngine) EvaluateEvent(ctx context.Context, event events.Event) ([]MatchedRule, error) {
	rules, err := e.LoadRules(ctx, event.TenantID)
	if err != nil {
		return nil, fmt.Errorf("load rules for tenant %s: %w", event.TenantID, err)
	}

	// Build data map from event for condition evaluation.
	data := buildEventData(event)
	var matched []MatchedRule

	for _, rule := range rules {
		if !e.ruleMatchesEvent(rule, event) {
			continue
		}

		if !EvaluateCondition(rule.Conditions, data) {
			continue
		}

		if !e.isWithinSchedule(rule.Schedule) {
			continue
		}

		inCooldown, err := e.isInCooldown(ctx, rule)
		if err != nil {
			e.logger.WarnContext(ctx, "cooldown check failed",
				slog.String("rule_id", rule.ID),
				slog.String("error", err.Error()),
			)
			continue
		}
		if inCooldown {
			e.logger.DebugContext(ctx, "rule in cooldown",
				slog.String("rule_id", rule.ID),
			)
			continue
		}

		matched = append(matched, MatchedRule{
			Rule:    rule,
			EventID: event.ID,
		})

		// Set cooldown in Redis.
		if err := e.setCooldown(ctx, rule); err != nil {
			e.logger.WarnContext(ctx, "set cooldown failed",
				slog.String("rule_id", rule.ID),
				slog.String("error", err.Error()),
			)
		}

		// Update last_triggered_at in database.
		if err := e.updateLastTriggered(ctx, rule.ID); err != nil {
			e.logger.WarnContext(ctx, "update last_triggered_at failed",
				slog.String("rule_id", rule.ID),
				slog.String("error", err.Error()),
			)
		}
	}

	return matched, nil
}

// IsInCooldown checks whether a rule is currently in its cooldown period.
func (e *RuleEngine) IsInCooldown(ctx context.Context, rule AlertRule) (bool, error) {
	return e.isInCooldown(ctx, rule)
}

func (e *RuleEngine) invalidateCache(tenantID string) {
	e.mu.Lock()
	delete(e.cache, tenantID)
	e.mu.Unlock()
}

func (e *RuleEngine) fetchRulesFromDB(ctx context.Context, tenantID string) ([]AlertRule, error) {
	rows, err := e.db.QueryContext(ctx,
		`SELECT id, tenant_id, name, description, trigger_event, conditions, actions,
		        enabled, schedule, camera_ids, zone_ids, cooldown_sec, priority,
		        last_triggered_at, created_at, updated_at
		 FROM alert_rules
		 WHERE tenant_id = $1 AND enabled = true
		 ORDER BY priority ASC`,
		tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("query rules: %w", err)
	}
	defer rows.Close()

	var rules []AlertRule
	for rows.Next() {
		var (
			rule            AlertRule
			description     sql.NullString
			conditionsJSON  []byte
			actionsJSON     []byte
			scheduleJSON    []byte
			cameraIDsArr    []byte
			zoneIDsArr      []byte
			lastTriggeredAt sql.NullTime
		)

		if err := rows.Scan(
			&rule.ID, &rule.TenantID, &rule.Name, &description,
			&rule.TriggerEvent, &conditionsJSON, &actionsJSON,
			&rule.Enabled, &scheduleJSON, &cameraIDsArr, &zoneIDsArr,
			&rule.CooldownSec, &rule.Priority,
			&lastTriggeredAt, &rule.CreatedAt, &rule.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan rule: %w", err)
		}

		rule.Description = description.String
		if lastTriggeredAt.Valid {
			rule.LastTriggeredAt = &lastTriggeredAt.Time
		}

		if err := json.Unmarshal(conditionsJSON, &rule.Conditions); err != nil {
			return nil, fmt.Errorf("unmarshal conditions for rule %s: %w", rule.ID, err)
		}
		if err := json.Unmarshal(actionsJSON, &rule.Actions); err != nil {
			return nil, fmt.Errorf("unmarshal actions for rule %s: %w", rule.ID, err)
		}
		if len(scheduleJSON) > 0 && string(scheduleJSON) != "null" {
			var sched Schedule
			if err := json.Unmarshal(scheduleJSON, &sched); err != nil {
				return nil, fmt.Errorf("unmarshal schedule for rule %s: %w", rule.ID, err)
			}
			rule.Schedule = &sched
		}
		if len(cameraIDsArr) > 0 {
			rule.CameraIDs = parsePostgresArray(string(cameraIDsArr))
		}
		if len(zoneIDsArr) > 0 {
			rule.ZoneIDs = parsePostgresArray(string(zoneIDsArr))
		}

		rules = append(rules, rule)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rules: %w", err)
	}

	return rules, nil
}

// ruleMatchesEvent checks whether the rule's trigger event and optional
// camera/zone filters match the event.
func (e *RuleEngine) ruleMatchesEvent(rule AlertRule, event events.Event) bool {
	if rule.TriggerEvent != event.Type {
		return false
	}

	if len(rule.CameraIDs) > 0 && !containsString(rule.CameraIDs, event.CameraID) {
		return false
	}

	if len(rule.ZoneIDs) > 0 && event.ZoneID != "" && !containsString(rule.ZoneIDs, event.ZoneID) {
		return false
	}

	return true
}

// isWithinSchedule checks whether the current time is within the rule's
// schedule windows. Returns true if no schedule is configured.
func (e *RuleEngine) isWithinSchedule(schedule *Schedule) bool {
	if schedule == nil || len(schedule.Windows) == 0 {
		return true
	}

	loc, err := time.LoadLocation(schedule.Timezone)
	if err != nil {
		e.logger.Warn("invalid timezone in schedule", slog.String("timezone", schedule.Timezone))
		return true
	}

	now := time.Now().In(loc)
	weekday := int(now.Weekday())
	currentTime := now.Format("15:04")

	for _, window := range schedule.Windows {
		if !containsInt(window.DaysOfWeek, weekday) {
			continue
		}
		if currentTime >= window.StartTime && currentTime <= window.EndTime {
			return true
		}
	}

	return false
}

func (e *RuleEngine) isInCooldown(ctx context.Context, rule AlertRule) (bool, error) {
	key := fmt.Sprintf("rule_cooldown:%s", rule.ID)
	exists, err := e.rdb.Exists(ctx, key).Result()
	if err != nil {
		return false, fmt.Errorf("check cooldown: %w", err)
	}
	return exists > 0, nil
}

func (e *RuleEngine) setCooldown(ctx context.Context, rule AlertRule) error {
	if rule.CooldownSec <= 0 {
		return nil
	}

	key := fmt.Sprintf("rule_cooldown:%s", rule.ID)
	return e.rdb.Set(ctx, key, "1", time.Duration(rule.CooldownSec)*time.Second).Err()
}

func (e *RuleEngine) updateLastTriggered(ctx context.Context, ruleID string) error {
	const q = `UPDATE alert_rules SET last_triggered_at = now() WHERE id = $1`
	_, err := e.db.ExecContext(ctx, q, ruleID)
	if err == nil {
		dualdb.FireExec(e.cloudDB, q, ruleID)
	}
	return err
}

// buildEventData converts an event into a flat data map for condition evaluation.
func buildEventData(event events.Event) map[string]interface{} {
	data := map[string]interface{}{
		"type":       event.Type,
		"severity":   event.Severity,
		"intensity":  event.Intensity,
		"camera_id":  event.CameraID,
		"zone_id":    event.ZoneID,
		"tenant_id":  event.TenantID,
		"clip_path":  event.ClipPath,
	}

	// Merge metadata into data for condition evaluation.
	for k, v := range event.Metadata {
		data[k] = v
	}

	return data
}

// parsePostgresArray parses a PostgreSQL array literal like {a,b,c} into
// a string slice.
func parsePostgresArray(s string) []string {
	s = strings.TrimPrefix(s, "{")
	s = strings.TrimSuffix(s, "}")
	if s == "" {
		return nil
	}
	return strings.Split(s, ",")
}

func containsString(slice []string, val string) bool {
	for _, s := range slice {
		if s == val {
			return true
		}
	}
	return false
}

func containsInt(slice []int, val int) bool {
	for _, i := range slice {
		if i == val {
			return true
		}
	}
	return false
}
