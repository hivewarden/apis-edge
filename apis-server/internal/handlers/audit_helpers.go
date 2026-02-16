// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"context"
	"sync/atomic"

	"github.com/jermoo/apis/apis-server/internal/services"
)

// SECURITY FIX (S3B-M4): Use atomic.Value for the global audit service
// to ensure proper happens-before visibility across goroutines per the
// Go memory model.
var auditSvcValue atomic.Value // stores *services.AuditService

// SetAuditService sets the global audit service instance.
// Called from main.go during server startup.
func SetAuditService(svc *services.AuditService) {
	auditSvcValue.Store(svc)
}

// getAuditSvc retrieves the audit service from the atomic store.
// Returns nil if not yet initialized.
func getAuditSvc() *services.AuditService {
	v, _ := auditSvcValue.Load().(*services.AuditService)
	return v
}

// AuditCreate logs a create operation to the audit log.
// Safe to call even if audit service is not initialized.
func AuditCreate(ctx context.Context, entityType, entityID string, newValues any) {
	if svc := getAuditSvc(); svc != nil {
		svc.LogCreate(ctx, entityType, entityID, newValues)
	}
}

// AuditUpdate logs an update operation to the audit log.
// Safe to call even if audit service is not initialized.
func AuditUpdate(ctx context.Context, entityType, entityID string, oldValues, newValues any) {
	if svc := getAuditSvc(); svc != nil {
		svc.LogUpdate(ctx, entityType, entityID, oldValues, newValues)
	}
}

// AuditDelete logs a delete operation to the audit log.
// Safe to call even if audit service is not initialized.
func AuditDelete(ctx context.Context, entityType, entityID string, oldValues any) {
	if svc := getAuditSvc(); svc != nil {
		svc.LogDelete(ctx, entityType, entityID, oldValues)
	}
}
