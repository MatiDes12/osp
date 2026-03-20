package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/MatiDes12/osp/services/event-engine/internal/dualdb"
)

// AuditEntry represents a single audit log record.
type AuditEntry struct {
	TenantID     string                 `json:"tenant_id"`
	ActorID      string                 `json:"actor_id"`
	ActorEmail   string                 `json:"actor_email"`
	Action       string                 `json:"action"`
	ResourceType string                 `json:"resource_type"`
	ResourceID   string                 `json:"resource_id,omitempty"`
	Details      map[string]interface{} `json:"details,omitempty"`
	IPAddress    string                 `json:"ip_address,omitempty"`
	UserAgent    string                 `json:"user_agent,omitempty"`
}

// Logger writes audit entries to the audit_logs table.
type Logger struct {
	db      *sql.DB
	cloudDB *sql.DB // optional — entries are mirrored here in the background
	logger  *slog.Logger
}

// NewLogger creates a new audit Logger.
// Pass a non-nil cloudDB to enable dual-write mirroring.
func NewLogger(db *sql.DB, cloudDB *sql.DB, logger *slog.Logger) *Logger {
	return &Logger{
		db:      db,
		cloudDB: cloudDB,
		logger:  logger,
	}
}

// LogAction inserts an audit entry into the audit_logs table.
func (l *Logger) LogAction(ctx context.Context, entry AuditEntry) error {
	var detailsJSON []byte
	if entry.Details != nil {
		var err error
		detailsJSON, err = json.Marshal(entry.Details)
		if err != nil {
			return fmt.Errorf("marshal audit details: %w", err)
		}
	}

	var resourceID interface{}
	if entry.ResourceID != "" {
		resourceID = entry.ResourceID
	}

	var ipAddr interface{}
	if entry.IPAddress != "" {
		ipAddr = entry.IPAddress
	}

	var userAgent interface{}
	if entry.UserAgent != "" {
		userAgent = entry.UserAgent
	}

	const auditSQL = `INSERT INTO audit_logs (tenant_id, actor_id, actor_email, action, resource_type, resource_id, details, ip_address, user_agent)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	auditArgs := []any{entry.TenantID, entry.ActorID, entry.ActorEmail, entry.Action, entry.ResourceType, resourceID, detailsJSON, ipAddr, userAgent}

	_, err := l.db.ExecContext(ctx, auditSQL, auditArgs...)
	if err != nil {
		return fmt.Errorf("insert audit log: %w", err)
	}
	dualdb.FireExec(l.cloudDB, auditSQL, auditArgs...)

	l.logger.DebugContext(ctx, "audit log recorded",
		slog.String("tenant_id", entry.TenantID),
		slog.String("action", entry.Action),
		slog.String("resource_type", entry.ResourceType),
	)

	return nil
}
