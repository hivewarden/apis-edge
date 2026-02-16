// Package services provides business logic services for the APIS server.
package services

import (
	"context"
	"encoding/json"
	"net"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// AuditAction represents the type of audit action.
type AuditAction string

const (
	// AuditActionCreate represents a create operation.
	AuditActionCreate AuditAction = "create"
	// AuditActionUpdate represents an update operation.
	AuditActionUpdate AuditAction = "update"
	// AuditActionDelete represents a delete operation.
	AuditActionDelete AuditAction = "delete"
)

// sensitiveFields lists fields that should be masked or omitted from audit logs.
var sensitiveFields = map[string]bool{
	"password_hash":     true,
	"api_key":           true,
	"api_key_encrypted": true,
	"token":             true, // invite tokens, etc.
}

// ctxKey is a custom type for context keys.
type auditCtxKey string

// Context keys for audit logging.
const (
	// IPAddressKey is the context key for storing client IP address.
	IPAddressKey auditCtxKey = "audit_ip_address"
	// TenantIDKey is the context key for storing tenant ID for audit.
	TenantIDKey auditCtxKey = "audit_tenant_id"
	// UserIDKey is the context key for storing user ID for audit.
	UserIDKey auditCtxKey = "audit_user_id"
)

// AuditEntry represents a single audit log entry.
type AuditEntry struct {
	ID         string
	TenantID   string
	UserID     *string
	Action     string
	EntityType string
	EntityID   string
	OldValues  []byte // JSON
	NewValues  []byte // JSON
	IPAddress  string
}

// AuditService provides audit logging functionality.
type AuditService struct {
	pool *pgxpool.Pool
}

// NewAuditService creates a new audit service.
func NewAuditService(pool *pgxpool.Pool) *AuditService {
	return &AuditService{pool: pool}
}

// LogCreate logs a create operation to the audit log.
func (s *AuditService) LogCreate(ctx context.Context, entityType, entityID string, newValues interface{}) {
	s.logEntry(ctx, AuditActionCreate, entityType, entityID, nil, newValues)
}

// LogUpdate logs an update operation to the audit log.
func (s *AuditService) LogUpdate(ctx context.Context, entityType, entityID string, oldValues, newValues interface{}) {
	s.logEntry(ctx, AuditActionUpdate, entityType, entityID, oldValues, newValues)
}

// LogDelete logs a delete operation to the audit log.
func (s *AuditService) LogDelete(ctx context.Context, entityType, entityID string, oldValues interface{}) {
	s.logEntry(ctx, AuditActionDelete, entityType, entityID, oldValues, nil)
}

// logEntry creates an audit log entry.
func (s *AuditService) logEntry(ctx context.Context, action AuditAction, entityType, entityID string, oldValues, newValues interface{}) {
	// Extract context values
	tenantID := GetAuditTenantID(ctx)
	userID := GetAuditUserID(ctx)
	ipAddress := GetAuditIPAddress(ctx)

	if tenantID == "" {
		log.Warn().
			Str("entity_type", entityType).
			Str("entity_id", entityID).
			Msg("audit: cannot log - no tenant_id in context")
		return
	}

	// Convert values to masked JSON
	var oldJSON, newJSON []byte
	var err error

	if oldValues != nil {
		oldMap := structToMap(oldValues)
		maskedOld := maskSensitiveFields(oldMap)
		oldJSON, err = json.Marshal(maskedOld)
		if err != nil {
			log.Error().Err(err).Msg("audit: failed to marshal old values")
			oldJSON = nil
		}
	}

	if newValues != nil {
		newMap := structToMap(newValues)
		maskedNew := maskSensitiveFields(newMap)
		newJSON, err = json.Marshal(maskedNew)
		if err != nil {
			log.Error().Err(err).Msg("audit: failed to marshal new values")
			newJSON = nil
		}
	}

	// Create audit entry
	entry := &AuditEntry{
		TenantID:   tenantID,
		UserID:     &userID,
		Action:     string(action),
		EntityType: entityType,
		EntityID:   entityID,
		OldValues:  oldJSON,
		NewValues:  newJSON,
		IPAddress:  ipAddress,
	}

	// Insert asynchronously to not block the main operation.
	// SECURITY FIX (S3B-H3): Create a detached context that preserves audit
	// values (tenant_id, user_id, IP) but does NOT carry the original request's
	// cancellation signal. Using context.Background() alone would lose tenant
	// context needed for RLS-scoped audit inserts.
	detachedCtx := WithAuditContext(context.Background(), tenantID, userID, ipAddress)
	go func() {
		if err := s.insertAuditEntry(detachedCtx, entry); err != nil {
			log.Error().Err(err).
				Str("entity_type", entityType).
				Str("entity_id", entityID).
				Str("action", string(action)).
				Msg("audit: failed to insert audit entry")
		}
	}()
}

// insertAuditEntry inserts an audit entry into the database.
func (s *AuditService) insertAuditEntry(ctx context.Context, entry *AuditEntry) error {
	query := `
		INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet)
	`

	var ipAddr interface{}
	if entry.IPAddress != "" {
		ipAddr = entry.IPAddress
	}

	_, err := s.pool.Exec(ctx, query,
		entry.TenantID,
		entry.UserID,
		entry.Action,
		entry.EntityType,
		entry.EntityID,
		entry.OldValues,
		entry.NewValues,
		ipAddr,
	)
	return err
}

// maskSensitiveFields removes or masks sensitive fields from a map.
func maskSensitiveFields(data map[string]interface{}) map[string]interface{} {
	if data == nil {
		return nil
	}

	masked := make(map[string]interface{})
	for k, v := range data {
		if sensitiveFields[k] {
			if k == "password_hash" {
				// Omit password_hash entirely
				continue
			}
			// Mask other sensitive fields (API keys, tokens)
			if str, ok := v.(string); ok && len(str) > 4 {
				masked[k] = "****" + str[len(str)-4:]
			} else {
				masked[k] = "****"
			}
		} else {
			masked[k] = v
		}
	}
	return masked
}

// structToMap converts a struct to a map[string]interface{} using JSON marshaling.
func structToMap(v interface{}) map[string]interface{} {
	if v == nil {
		return nil
	}

	// If already a map, return as-is
	if m, ok := v.(map[string]interface{}); ok {
		return m
	}

	// Marshal to JSON and unmarshal to map
	data, err := json.Marshal(v)
	if err != nil {
		log.Error().Err(err).Msg("audit: failed to marshal struct to JSON")
		return nil
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		log.Error().Err(err).Msg("audit: failed to unmarshal JSON to map")
		return nil
	}

	return result
}

// ExtractIPAddress extracts the client IP address from RemoteAddr.
// RemoteAddr is expected to be normalized by middleware.RealIP in the main router.
func ExtractIPAddress(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		// RemoteAddr might not have a port
		return remoteAddr
	}
	return host
}

// WithAuditContext adds audit context values (tenant ID, user ID, IP address) to context.
func WithAuditContext(ctx context.Context, tenantID, userID, ipAddress string) context.Context {
	ctx = context.WithValue(ctx, TenantIDKey, tenantID)
	ctx = context.WithValue(ctx, UserIDKey, userID)
	ctx = context.WithValue(ctx, IPAddressKey, ipAddress)
	return ctx
}

// GetAuditTenantID retrieves tenant ID from context for audit logging.
func GetAuditTenantID(ctx context.Context) string {
	id, _ := ctx.Value(TenantIDKey).(string)
	return id
}

// GetAuditUserID retrieves user ID from context for audit logging.
func GetAuditUserID(ctx context.Context) string {
	id, _ := ctx.Value(UserIDKey).(string)
	return id
}

// GetAuditIPAddress retrieves IP address from context for audit logging.
func GetAuditIPAddress(ctx context.Context) string {
	ip, _ := ctx.Value(IPAddressKey).(string)
	return ip
}
