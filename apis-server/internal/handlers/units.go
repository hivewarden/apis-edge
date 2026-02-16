// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// UnitResponse represents a unit in API responses (without API key).
type UnitResponse struct {
	ID              string     `json:"id"`
	Serial          string     `json:"serial"`
	Name            *string    `json:"name,omitempty"`
	SiteID          *string    `json:"site_id,omitempty"`
	SiteName        *string    `json:"site_name,omitempty"`
	FirmwareVersion *string    `json:"firmware_version,omitempty"`
	Status          string     `json:"status"`
	LastSeen        *time.Time `json:"last_seen,omitempty"`
	// Telemetry fields (updated via heartbeat)
	UptimeSeconds *int64   `json:"uptime_seconds,omitempty"`
	CPUTemp       *float64 `json:"cpu_temp,omitempty"`
	FreeHeap      *int64   `json:"free_heap,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// UnitCreateResponse represents the response when creating a unit (includes raw API key).
type UnitCreateResponse struct {
	ID        string    `json:"id"`
	Serial    string    `json:"serial"`
	Name      *string   `json:"name,omitempty"`
	SiteID    *string   `json:"site_id,omitempty"`
	APIKey    string    `json:"api_key"` // Only included on create!
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// UnitsListResponse represents the list units API response.
type UnitsListResponse struct {
	Data []UnitResponse `json:"data"`
	Meta MetaResponse   `json:"meta"`
}

// UnitDataResponse represents a single unit API response.
type UnitDataResponse struct {
	Data UnitResponse `json:"data"`
}

// UnitCreateDataResponse represents the create unit API response.
type UnitCreateDataResponse struct {
	Data    UnitCreateResponse `json:"data"`
	Warning string             `json:"warning"`
}

// APIKeyResponse represents the regenerate key API response.
type APIKeyResponse struct {
	Data struct {
		APIKey string `json:"api_key"`
	} `json:"data"`
	Warning string `json:"warning"`
}

// CreateUnitRequest represents the request body for creating a unit.
type CreateUnitRequest struct {
	Serial string  `json:"serial"`
	Name   *string `json:"name,omitempty"`
	SiteID *string `json:"site_id,omitempty"`
}

// UpdateUnitRequest represents the request body for updating a unit.
type UpdateUnitRequest struct {
	Name   *string `json:"name,omitempty"`
	SiteID *string `json:"site_id,omitempty"`
}

// unitToResponse converts a storage.Unit to a UnitResponse.
func unitToResponse(unit *storage.Unit, siteName *string) UnitResponse {
	return UnitResponse{
		ID:              unit.ID,
		Serial:          unit.Serial,
		Name:            unit.Name,
		SiteID:          unit.SiteID,
		SiteName:        siteName,
		FirmwareVersion: unit.FirmwareVersion,
		Status:          unit.Status,
		LastSeen:        unit.LastSeen,
		UptimeSeconds:   unit.UptimeSeconds,
		CPUTemp:         unit.CPUTemp,
		FreeHeap:        unit.FreeHeap,
		CreatedAt:       unit.CreatedAt,
		UpdatedAt:       unit.UpdatedAt,
	}
}

// ListUnits handles GET /api/units - returns all units for the authenticated tenant.
// Uses a single JOIN query to include site names, avoiding N+1 query issues.
func ListUnits(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	// Use ListUnitsWithSiteNames to fetch units and site names in a single query
	units, err := storage.ListUnitsWithSiteNames(r.Context(), conn)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list units")
		respondError(w, "Failed to list units", http.StatusInternalServerError)
		return
	}

	// Build response from joined data
	unitResponses := make([]UnitResponse, 0, len(units))
	for _, unit := range units {
		unitResponses = append(unitResponses, unitToResponse(&unit.Unit, unit.SiteName))
	}

	respondJSON(w, UnitsListResponse{
		Data: unitResponses,
		Meta: MetaResponse{Total: len(unitResponses)},
	}, http.StatusOK)
}

// GetUnit handles GET /api/units/{id} - returns a specific unit.
func GetUnit(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	unitID := chi.URLParam(r, "id")

	if unitID == "" {
		respondError(w, "Unit ID is required", http.StatusBadRequest)
		return
	}

	unit, err := storage.GetUnitByID(r.Context(), conn, unitID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Unit not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("unit_id", unitID).Msg("handler: failed to get unit")
		respondError(w, "Failed to get unit", http.StatusInternalServerError)
		return
	}

	// Get site name if site is assigned
	var siteName *string
	if unit.SiteID != nil {
		site, err := storage.GetSiteByID(r.Context(), conn, *unit.SiteID)
		if err == nil {
			siteName = &site.Name
		}
	}

	respondJSON(w, UnitDataResponse{Data: unitToResponse(unit, siteName)}, http.StatusOK)
}

// CreateUnit handles POST /api/units - registers a new unit.
func CreateUnit(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req CreateUnitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Serial == "" {
		respondError(w, "Serial number is required", http.StatusBadRequest)
		return
	}

	// Validate serial number format: must be alphanumeric with optional hyphens, 3-50 chars
	// Expected format: "APIS-XXX" or similar patterns
	if !isValidSerialFormat(req.Serial) {
		respondError(w, "Serial number must be 3-50 alphanumeric characters (hyphens allowed)", http.StatusBadRequest)
		return
	}

	// Check unit limit before proceeding
	if err := storage.CheckUnitLimit(r.Context(), conn, tenantID); err != nil {
		if errors.Is(err, storage.ErrLimitExceeded) {
			respondError(w, "Unit limit reached. Contact your administrator to increase your quota.", http.StatusForbidden)
			return
		}
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to check unit limit")
		respondError(w, "Failed to create unit", http.StatusInternalServerError)
		return
	}

	// Validate site_id if provided
	if req.SiteID != nil && *req.SiteID != "" {
		_, err := storage.GetSiteByID(r.Context(), conn, *req.SiteID)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Site not found", http.StatusBadRequest)
			return
		}
		if err != nil {
			log.Error().Err(err).Str("site_id", *req.SiteID).Msg("handler: failed to validate site")
			respondError(w, "Failed to validate site", http.StatusInternalServerError)
			return
		}
	}

	input := &storage.CreateUnitInput{
		Serial: req.Serial,
		Name:   req.Name,
		SiteID: req.SiteID,
	}

	unit, rawKey, err := storage.CreateUnit(r.Context(), conn, tenantID, input)
	if errors.Is(err, storage.ErrDuplicateSerial) {
		respondError(w, "A unit with this serial number already exists", http.StatusConflict)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Str("serial", req.Serial).Msg("handler: failed to create unit")
		respondError(w, "Failed to create unit", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("unit_id", unit.ID).
		Str("tenant_id", tenantID).
		Str("serial", unit.Serial).
		Msg("Unit registered")

	// Audit log: record unit creation (API key is masked by audit service)
	AuditCreate(r.Context(), "units", unit.ID, unit)

	respondJSON(w, UnitCreateDataResponse{
		Data: UnitCreateResponse{
			ID:        unit.ID,
			Serial:    unit.Serial,
			Name:      unit.Name,
			SiteID:    unit.SiteID,
			APIKey:    rawKey,
			Status:    unit.Status,
			CreatedAt: unit.CreatedAt,
			UpdatedAt: unit.UpdatedAt,
		},
		Warning: "Save this API key securely - it cannot be retrieved again",
	}, http.StatusCreated)
}

// UpdateUnit handles PUT /api/units/{id} - updates an existing unit.
func UpdateUnit(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	unitID := chi.URLParam(r, "id")

	if unitID == "" {
		respondError(w, "Unit ID is required", http.StatusBadRequest)
		return
	}

	// Get old values for audit log before update
	oldUnit, err := storage.GetUnitByID(r.Context(), conn, unitID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Unit not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("unit_id", unitID).Msg("handler: failed to get unit for audit")
		respondError(w, "Failed to update unit", http.StatusInternalServerError)
		return
	}

	var req UpdateUnitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate site_id if provided
	if req.SiteID != nil && *req.SiteID != "" {
		_, err := storage.GetSiteByID(r.Context(), conn, *req.SiteID)
		if errors.Is(err, storage.ErrNotFound) {
			respondError(w, "Site not found", http.StatusBadRequest)
			return
		}
		if err != nil {
			log.Error().Err(err).Str("site_id", *req.SiteID).Msg("handler: failed to validate site")
			respondError(w, "Failed to validate site", http.StatusInternalServerError)
			return
		}
	}

	input := &storage.UpdateUnitInput{
		Name:   req.Name,
		SiteID: req.SiteID,
	}

	unit, err := storage.UpdateUnit(r.Context(), conn, unitID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Unit not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("unit_id", unitID).Msg("handler: failed to update unit")
		respondError(w, "Failed to update unit", http.StatusInternalServerError)
		return
	}

	// Get site name if site is assigned
	var siteName *string
	if unit.SiteID != nil {
		site, err := storage.GetSiteByID(r.Context(), conn, *unit.SiteID)
		if err == nil {
			siteName = &site.Name
		}
	}

	log.Info().
		Str("unit_id", unit.ID).
		Str("serial", unit.Serial).
		Msg("Unit updated")

	// Audit log: record unit update with old and new values
	AuditUpdate(r.Context(), "units", unit.ID, oldUnit, unit)

	respondJSON(w, UnitDataResponse{Data: unitToResponse(unit, siteName)}, http.StatusOK)
}

// RegenerateUnitKey handles POST /api/units/{id}/regenerate-key - generates new API key.
func RegenerateUnitKey(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	unitID := chi.URLParam(r, "id")

	if unitID == "" {
		respondError(w, "Unit ID is required", http.StatusBadRequest)
		return
	}

	rawKey, err := storage.RegenerateAPIKey(r.Context(), conn, unitID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Unit not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("unit_id", unitID).Msg("handler: failed to regenerate API key")
		respondError(w, "Failed to regenerate API key", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("unit_id", unitID).
		Msg("Unit API key regenerated")

	resp := APIKeyResponse{
		Warning: "Save this API key securely - it cannot be retrieved again. The old key is now invalid.",
	}
	resp.Data.APIKey = rawKey
	respondJSON(w, resp, http.StatusOK)
}

// DeleteUnit handles DELETE /api/units/{id} - deletes a unit.
func DeleteUnit(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	unitID := chi.URLParam(r, "id")

	if unitID == "" {
		respondError(w, "Unit ID is required", http.StatusBadRequest)
		return
	}

	// Get old values for audit log before delete
	oldUnit, err := storage.GetUnitByID(r.Context(), conn, unitID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Unit not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("unit_id", unitID).Msg("handler: failed to get unit for audit")
		respondError(w, "Failed to delete unit", http.StatusInternalServerError)
		return
	}

	err = storage.DeleteUnit(r.Context(), conn, unitID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Unit not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("unit_id", unitID).Msg("handler: failed to delete unit")
		respondError(w, "Failed to delete unit", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("unit_id", unitID).
		Msg("Unit deleted")

	// Audit log: record unit deletion with old values
	AuditDelete(r.Context(), "units", unitID, oldUnit)

	w.WriteHeader(http.StatusNoContent)
}

// HeartbeatRequest contains the optional fields sent by a unit during heartbeat.
type HeartbeatRequest struct {
	FirmwareVersion     *string  `json:"firmware_version,omitempty"`
	UptimeSeconds       *int64   `json:"uptime_seconds,omitempty"`
	DetectionCountSince *int     `json:"detection_count_since_last,omitempty"`
	CPUTemp             *float64 `json:"cpu_temp,omitempty"`
	FreeHeap            *int64   `json:"free_heap,omitempty"`
	LocalTime           *string  `json:"local_time,omitempty"`
}

// HeartbeatResponse is returned to the unit after a successful heartbeat.
type HeartbeatResponse struct {
	ServerTime  string `json:"server_time"`
	TimeDriftMs *int64 `json:"time_drift_ms,omitempty"`
}

// HeartbeatDataResponse wraps the heartbeat response in the standard data format.
type HeartbeatDataResponse struct {
	Data HeartbeatResponse `json:"data"`
}

// Heartbeat handles POST /api/units/heartbeat - receives heartbeat from a unit.
// The unit is authenticated via the UnitAuth middleware using X-API-Key header.
func Heartbeat(w http.ResponseWriter, r *http.Request) {
	// Get unit from UnitAuth middleware
	unit := middleware.GetUnit(r.Context())
	if unit == nil {
		// This should not happen if UnitAuth middleware is applied
		log.Error().Msg("handler: heartbeat called without unit in context")
		respondError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	conn := storage.GetConn(r.Context())
	if conn == nil {
		log.Error().Msg("handler: heartbeat called without database connection")
		respondError(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Parse optional request body
	var req HeartbeatRequest
	if r.Body != nil && r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			// Log but don't fail - body is optional
			log.Debug().Err(err).Msg("handler: failed to parse heartbeat body")
		}
	}

	// Extract client IP from request
	ip := extractClientIP(r)

	// Convert heartbeat request to storage input (all telemetry fields)
	heartbeatInput := &storage.HeartbeatInput{
		FirmwareVersion: req.FirmwareVersion,
		UptimeSeconds:   req.UptimeSeconds,
		CPUTemp:         req.CPUTemp,
		FreeHeap:        req.FreeHeap,
	}

	// Update unit heartbeat in database
	err := storage.UpdateUnitHeartbeat(r.Context(), conn, unit.ID, ip, heartbeatInput)
	if err != nil {
		log.Error().Err(err).Str("unit_id", unit.ID).Msg("handler: failed to update unit heartbeat")
		respondError(w, "Failed to process heartbeat", http.StatusInternalServerError)
		return
	}

	// Build response with server time
	serverTime := time.Now().UTC()
	resp := HeartbeatResponse{
		ServerTime: serverTime.Format(time.RFC3339),
	}

	// Calculate time drift if unit provided local_time
	if req.LocalTime != nil {
		localTime, err := time.Parse(time.RFC3339, *req.LocalTime)
		if err == nil {
			driftMs := serverTime.Sub(localTime).Milliseconds()
			resp.TimeDriftMs = &driftMs
		}
	}

	log.Debug().
		Str("unit_id", unit.ID).
		Str("serial", unit.Serial).
		Str("ip_address", ip).
		Msg("Unit heartbeat received")

	respondJSON(w, HeartbeatDataResponse{Data: resp}, http.StatusOK)
}

// TrustProxyHeaders controls whether X-Forwarded-For and X-Real-IP headers are trusted.
// This should only be true when the server is behind a trusted reverse proxy (e.g., BunkerWeb, nginx).
// When false, only RemoteAddr is used which cannot be spoofed.
// Default is false for security - must be explicitly enabled in production behind a proxy.
var TrustProxyHeaders = false

// extractClientIP extracts the client IP address from the request.
// When TrustProxyHeaders is true, it checks X-Forwarded-For and X-Real-IP headers
// (for requests through proxies) before falling back to RemoteAddr.
// When TrustProxyHeaders is false (default), only RemoteAddr is used for security.
//
// Security note: X-Forwarded-For and X-Real-IP headers can be spoofed by clients
// when not behind a trusted proxy. Only enable TrustProxyHeaders when the server
// is behind a reverse proxy that strips/overwrites these headers from client requests.
func extractClientIP(r *http.Request) string {
	if TrustProxyHeaders {
		// Check X-Forwarded-For first (behind proxy/load balancer)
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			// Take first IP (original client IP)
			if idx := strings.Index(xff, ","); idx > 0 {
				return strings.TrimSpace(xff[:idx])
			}
			return strings.TrimSpace(xff)
		}

		// Check X-Real-IP (nginx proxy)
		if xri := r.Header.Get("X-Real-IP"); xri != "" {
			return strings.TrimSpace(xri)
		}
	}

	// Fall back to RemoteAddr (may include port) - cannot be spoofed
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		// RemoteAddr doesn't have port, use as-is
		return r.RemoteAddr
	}
	return host
}

// isValidSerialFormat validates that a serial number follows acceptable format.
// Requirements:
// - Length: 3-50 characters
// - Characters: alphanumeric (A-Z, a-z, 0-9) and hyphens
// - No leading or trailing hyphens
// - No consecutive hyphens
// Expected patterns: "APIS-001", "APIS-HOME-01", "unit-123", etc.
func isValidSerialFormat(serial string) bool {
	if len(serial) < 3 || len(serial) > 50 {
		return false
	}

	// Check for leading/trailing hyphens
	if serial[0] == '-' || serial[len(serial)-1] == '-' {
		return false
	}

	prevHyphen := false
	for _, c := range serial {
		isAlphaNum := (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
		isHyphen := c == '-'

		if !isAlphaNum && !isHyphen {
			return false
		}

		// Check for consecutive hyphens
		if isHyphen && prevHyphen {
			return false
		}
		prevHyphen = isHyphen
	}

	return true
}
