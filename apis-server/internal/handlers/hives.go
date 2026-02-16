// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// InspectionThresholdDays defines the number of days after which a hive
// is considered to need attention if not inspected. Per AC3, this is 14 days.
const InspectionThresholdDays = 14

// HiveLossSummary represents a brief summary of a hive loss.
type HiveLossSummary struct {
	Cause        string `json:"cause"`
	CauseDisplay string `json:"cause_display"`
	DiscoveredAt string `json:"discovered_at"`
}

// TaskSummaryResponse represents the task summary for a hive.
type TaskSummaryResponse struct {
	Open    int `json:"open"`
	Overdue int `json:"overdue"`
}

// HiveResponse represents a hive in API responses.
type HiveResponse struct {
	ID                   string                 `json:"id"`
	SiteID               string                 `json:"site_id"`
	Name                 string                 `json:"name"`
	QueenIntroducedAt    *string                `json:"queen_introduced_at,omitempty"`
	QueenSource          *string                `json:"queen_source,omitempty"`
	QueenAgeDisplay      *string                `json:"queen_age_display,omitempty"`
	BroodBoxes           int                    `json:"brood_boxes"`
	HoneySupers          int                    `json:"honey_supers"`
	Notes                *string                `json:"notes,omitempty"`
	QueenHistory         []QueenHistoryResponse `json:"queen_history,omitempty"`
	BoxChanges           []BoxChangeResponse    `json:"box_changes,omitempty"`
	LastInspectionAt     *string                `json:"last_inspection_at,omitempty"`
	LastInspectionIssues []string               `json:"last_inspection_issues,omitempty"`
	Status               string                 `json:"status"`      // "healthy", "needs_attention", "unknown", or "lost"
	HiveStatus           string                 `json:"hive_status"` // "active", "lost", "archived"
	LostAt               *string                `json:"lost_at,omitempty"`
	LossSummary          *HiveLossSummary       `json:"loss_summary,omitempty"`
	TaskSummary          *TaskSummaryResponse   `json:"task_summary,omitempty"`
	CreatedAt            time.Time              `json:"created_at"`
	UpdatedAt            time.Time              `json:"updated_at"`
}

// QueenHistoryResponse represents a queen history entry in API responses.
type QueenHistoryResponse struct {
	ID                string  `json:"id"`
	IntroducedAt      string  `json:"introduced_at"`
	Source            *string `json:"source,omitempty"`
	ReplacedAt        *string `json:"replaced_at,omitempty"`
	ReplacementReason *string `json:"replacement_reason,omitempty"`
}

// BoxChangeResponse represents a box change entry in API responses.
type BoxChangeResponse struct {
	ID         string  `json:"id"`
	ChangeType string  `json:"change_type"`
	BoxType    string  `json:"box_type"`
	ChangedAt  string  `json:"changed_at"`
	Notes      *string `json:"notes,omitempty"`
}

// HivesListResponse represents the list hives API response.
type HivesListResponse struct {
	Data []HiveResponse `json:"data"`
	Meta MetaResponse   `json:"meta"`
}

// HiveDataResponse represents a single hive API response.
type HiveDataResponse struct {
	Data HiveResponse `json:"data"`
}

// CreateHiveRequest represents the request body for creating a hive.
type CreateHiveRequest struct {
	Name              string  `json:"name"`
	QueenIntroducedAt *string `json:"queen_introduced_at,omitempty"`
	QueenSource       *string `json:"queen_source,omitempty"`
	BroodBoxes        *int    `json:"brood_boxes,omitempty"`
	HoneySupers       *int    `json:"honey_supers,omitempty"`
	Notes             *string `json:"notes,omitempty"`
}

// UpdateHiveRequest represents the request body for updating a hive.
type UpdateHiveRequest struct {
	Name              *string `json:"name,omitempty"`
	QueenIntroducedAt *string `json:"queen_introduced_at,omitempty"`
	QueenSource       *string `json:"queen_source,omitempty"`
	BroodBoxes        *int    `json:"brood_boxes,omitempty"`
	HoneySupers       *int    `json:"honey_supers,omitempty"`
	Notes             *string `json:"notes,omitempty"`
}

// ReplaceQueenRequest represents the request body for replacing a queen.
type ReplaceQueenRequest struct {
	ReplacementReason *string `json:"replacement_reason,omitempty"`
	NewIntroducedAt   string  `json:"new_introduced_at"`
	NewSource         *string `json:"new_source,omitempty"`
}

// validateQueenSource checks if a queen source value is valid.
// Valid values: breeder, swarm, split, package, other, or other:{custom description}
// Accepts both "other:" and "other: " (with space) for custom descriptions.
func validateQueenSource(source *string) bool {
	if source == nil || *source == "" {
		return true
	}
	validSources := []string{"breeder", "swarm", "split", "package", "other"}
	for _, s := range validSources {
		if *source == s {
			return true
		}
	}
	// Also allow "other:" or "other: " prefixed custom descriptions (max 200 chars for description)
	// Accept both formats: "other:{desc}" and "other: {desc}" (frontend sends with space)
	if len(*source) > 6 && (*source)[:6] == "other:" {
		return len(*source) <= 207 // "other: " (7 chars) + up to 200 chars
	}
	return false
}

// calculateQueenAgeDisplay returns a human-readable queen age string.
func calculateQueenAgeDisplay(introducedAt *time.Time) *string {
	if introducedAt == nil {
		return nil
	}
	days := int(time.Since(*introducedAt).Hours() / 24)
	if days < 0 {
		days = 0
	}

	var display string
	if days < 30 {
		display = fmt.Sprintf("%d days", days)
	} else if days < 365 {
		months := days / 30
		if months == 1 {
			display = "1 month"
		} else {
			display = fmt.Sprintf("%d months", months)
		}
	} else {
		years := days / 365
		remainingMonths := (days % 365) / 30
		if remainingMonths == 0 {
			if years == 1 {
				display = "1 year"
			} else {
				display = fmt.Sprintf("%d years", years)
			}
		} else {
			display = fmt.Sprintf("%dy %dm", years, remainingMonths)
		}
	}
	return &display
}

// hiveToResponse converts a storage.Hive to a HiveResponse.
func hiveToResponse(hive *storage.Hive) HiveResponse {
	resp := HiveResponse{
		ID:              hive.ID,
		SiteID:          hive.SiteID,
		Name:            hive.Name,
		QueenSource:     hive.QueenSource,
		QueenAgeDisplay: calculateQueenAgeDisplay(hive.QueenIntroducedAt),
		BroodBoxes:      hive.BroodBoxes,
		HoneySupers:     hive.HoneySupers,
		Notes:           hive.Notes,
		Status:          "unknown", // Default inspection status - will be updated when inspections exist
		HiveStatus:      hive.Status, // "active", "lost", or "archived"
		CreatedAt:       hive.CreatedAt,
		UpdatedAt:       hive.UpdatedAt,
	}
	if hive.QueenIntroducedAt != nil {
		dateStr := hive.QueenIntroducedAt.Format("2006-01-02")
		resp.QueenIntroducedAt = &dateStr
	}
	if hive.LostAt != nil {
		lostAtStr := hive.LostAt.Format("2006-01-02")
		resp.LostAt = &lostAtStr
	}
	// If hive is lost, set status to lost
	if hive.Status == "lost" {
		resp.Status = "lost"
	}
	return resp
}

// enrichHiveResponseWithLossSummary adds loss summary to a HiveResponse for lost hives.
func enrichHiveResponseWithLossSummary(ctx context.Context, conn *pgxpool.Conn, resp *HiveResponse) {
	loss, err := storage.GetHiveLossByHiveID(ctx, conn, resp.ID)
	if err != nil {
		// No loss record found - keep status as is
		return
	}

	resp.LossSummary = &HiveLossSummary{
		Cause:        loss.Cause,
		CauseDisplay: storage.CauseDisplayNames[loss.Cause],
		DiscoveredAt: loss.DiscoveredAt.Format("2006-01-02"),
	}
}

// enrichHiveResponseWithInspection adds inspection status to a HiveResponse.
func enrichHiveResponseWithInspection(ctx context.Context, conn *pgxpool.Conn, resp *HiveResponse) {
	// Try to get last inspection for this hive
	lastInspection, err := storage.GetLastInspectionForHive(ctx, conn, resp.ID)
	if err != nil {
		// No inspection found or error - keep default "unknown" status
		return
	}

	applyInspectionToResponse(resp, lastInspection)
}

// applyInspectionToResponse applies inspection data to a HiveResponse.
// Extracted for use by both single and batch enrichment.
func applyInspectionToResponse(resp *HiveResponse, inspection *storage.Inspection) {
	// Set last inspection date
	dateStr := inspection.InspectedAt.Format("2006-01-02")
	resp.LastInspectionAt = &dateStr

	// Set issues
	if len(inspection.Issues) > 0 {
		resp.LastInspectionIssues = inspection.Issues
	}

	// Calculate status based on inspection
	daysSinceInspection := int(time.Since(inspection.InspectedAt).Hours() / 24)
	if daysSinceInspection > InspectionThresholdDays || len(inspection.Issues) > 0 {
		resp.Status = "needs_attention"
	} else {
		resp.Status = "healthy"
	}
}

// enrichHiveResponseWithTaskSummary adds task summary to a HiveResponse.
func enrichHiveResponseWithTaskSummary(ctx context.Context, conn *pgxpool.Conn, tenantID string, resp *HiveResponse) {
	summary, err := storage.GetTaskCountByHive(ctx, conn, tenantID, resp.ID)
	if err != nil {
		// Non-fatal - just won't have task summary
		log.Warn().Err(err).Str("hive_id", resp.ID).Msg("handler: failed to get task summary for hive")
		return
	}
	resp.TaskSummary = &TaskSummaryResponse{
		Open:    summary.OpenCount,
		Overdue: summary.OverdueCount,
	}
}

// enrichHiveResponsesWithTaskSummaries batch-enriches multiple HiveResponses with task summaries.
// This is optimized to avoid N+1 queries by fetching all task counts in a single query.
func enrichHiveResponsesWithTaskSummaries(ctx context.Context, conn *pgxpool.Conn, tenantID string, responses []HiveResponse) {
	if len(responses) == 0 {
		return
	}

	// Collect hive IDs
	hiveIDs := make([]string, 0, len(responses))
	for i := range responses {
		hiveIDs = append(hiveIDs, responses[i].ID)
	}

	// Batch fetch all task counts in one query
	counts, err := storage.GetTaskCountsForHives(ctx, conn, tenantID, hiveIDs)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to batch fetch task counts for hives")
		return
	}

	// Apply counts to responses
	for i := range responses {
		if count, ok := counts[responses[i].ID]; ok {
			responses[i].TaskSummary = &TaskSummaryResponse{
				Open:    count.OpenCount,
				Overdue: count.OverdueCount,
			}
		} else {
			// No tasks for this hive - set to zeros
			responses[i].TaskSummary = &TaskSummaryResponse{
				Open:    0,
				Overdue: 0,
			}
		}
	}
}

// enrichHiveResponsesWithInspections batch-enriches multiple HiveResponses with inspection data.
// This is optimized to avoid N+1 queries by fetching all inspections in a single query.
func enrichHiveResponsesWithInspections(ctx context.Context, conn *pgxpool.Conn, responses []HiveResponse) {
	if len(responses) == 0 {
		return
	}

	// Collect hive IDs for active hives only
	hiveIDs := make([]string, 0, len(responses))
	for i := range responses {
		if responses[i].HiveStatus != "lost" {
			hiveIDs = append(hiveIDs, responses[i].ID)
		}
	}

	if len(hiveIDs) == 0 {
		return
	}

	// Batch fetch all inspections in one query
	inspections, err := storage.GetLastInspectionsForHives(ctx, conn, hiveIDs)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to batch fetch inspections for hives")
		return
	}

	// Apply inspections to responses
	for i := range responses {
		if inspection, ok := inspections[responses[i].ID]; ok {
			applyInspectionToResponse(&responses[i], inspection)
		}
	}
}

// queenHistoryToResponse converts a storage.QueenHistory to a QueenHistoryResponse.
func queenHistoryToResponse(qh *storage.QueenHistory) QueenHistoryResponse {
	resp := QueenHistoryResponse{
		ID:                qh.ID,
		IntroducedAt:      qh.IntroducedAt.Format("2006-01-02"),
		Source:            qh.Source,
		ReplacementReason: qh.ReplacementReason,
	}
	if qh.ReplacedAt != nil {
		dateStr := qh.ReplacedAt.Format("2006-01-02")
		resp.ReplacedAt = &dateStr
	}
	return resp
}

// boxChangeToResponse converts a storage.BoxChange to a BoxChangeResponse.
func boxChangeToResponse(bc *storage.BoxChange) BoxChangeResponse {
	return BoxChangeResponse{
		ID:         bc.ID,
		ChangeType: bc.ChangeType,
		BoxType:    bc.BoxType,
		ChangedAt:  bc.ChangedAt.Format("2006-01-02"),
		Notes:      bc.Notes,
	}
}

// ListHivesBySite handles GET /api/sites/{site_id}/hives - returns all hives for a site.
func ListHivesBySite(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	siteID := chi.URLParam(r, "site_id")

	if siteID == "" {
		respondError(w, "Site ID is required", http.StatusBadRequest)
		return
	}

	// Check for include_lost parameter
	includeLost := r.URL.Query().Get("include_lost") == "true"

	// Verify site exists
	_, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get site")
		respondError(w, "Failed to get site", http.StatusInternalServerError)
		return
	}

	hives, err := storage.ListHivesBySiteWithStatus(r.Context(), conn, siteID, includeLost)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to list hives")
		respondError(w, "Failed to list hives", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	hiveResponses := make([]HiveResponse, 0, len(hives))
	for _, hive := range hives {
		resp := hiveToResponse(&hive)
		hiveResponses = append(hiveResponses, resp)
	}

	// Batch enrich with inspection data (optimized to avoid N+1 queries)
	enrichHiveResponsesWithInspections(r.Context(), conn, hiveResponses)

	// Batch enrich with task summaries (optimized to avoid N+1 queries)
	enrichHiveResponsesWithTaskSummaries(r.Context(), conn, tenantID, hiveResponses)

	// Enrich lost hives with loss summary (still individual - usually fewer lost hives)
	for i := range hiveResponses {
		if hiveResponses[i].HiveStatus == "lost" {
			enrichHiveResponseWithLossSummary(r.Context(), conn, &hiveResponses[i])
		}
	}

	respondJSON(w, HivesListResponse{
		Data: hiveResponses,
		Meta: MetaResponse{Total: len(hiveResponses)},
	}, http.StatusOK)
}

// ListHives handles GET /api/hives - returns all hives for the tenant.
func ListHives(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	// Check if filtering by site
	siteID := r.URL.Query().Get("site_id")
	// Check for include_lost parameter
	includeLost := r.URL.Query().Get("include_lost") == "true"

	var hives []storage.Hive
	var err error

	if siteID != "" {
		hives, err = storage.ListHivesBySiteWithStatus(r.Context(), conn, siteID, includeLost)
	} else {
		hives, err = storage.ListHivesWithStatus(r.Context(), conn, includeLost)
	}

	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list hives")
		respondError(w, "Failed to list hives", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	hiveResponses := make([]HiveResponse, 0, len(hives))
	for _, hive := range hives {
		resp := hiveToResponse(&hive)
		hiveResponses = append(hiveResponses, resp)
	}

	// Batch enrich with inspection data (optimized to avoid N+1 queries)
	enrichHiveResponsesWithInspections(r.Context(), conn, hiveResponses)

	// Batch enrich with task summaries (optimized to avoid N+1 queries)
	enrichHiveResponsesWithTaskSummaries(r.Context(), conn, tenantID, hiveResponses)

	// Enrich lost hives with loss summary (still individual - usually fewer lost hives)
	for i := range hiveResponses {
		if hiveResponses[i].HiveStatus == "lost" {
			enrichHiveResponseWithLossSummary(r.Context(), conn, &hiveResponses[i])
		}
	}

	respondJSON(w, HivesListResponse{
		Data: hiveResponses,
		Meta: MetaResponse{Total: len(hiveResponses)},
	}, http.StatusOK)
}

// GetHive handles GET /api/hives/{id} - returns a specific hive with history.
func GetHive(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	hiveID := chi.URLParam(r, "id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	hive, err := storage.GetHiveByID(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive")
		respondError(w, "Failed to get hive", http.StatusInternalServerError)
		return
	}

	resp := hiveToResponse(hive)

	// Get queen history
	queenHistory, err := storage.ListQueenHistory(r.Context(), conn, hiveID)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get queen history")
		// Don't fail the request, just log the error
	} else {
		resp.QueenHistory = make([]QueenHistoryResponse, 0, len(queenHistory))
		for _, qh := range queenHistory {
			resp.QueenHistory = append(resp.QueenHistory, queenHistoryToResponse(&qh))
		}
	}

	// Get box changes
	boxChanges, err := storage.ListBoxChanges(r.Context(), conn, hiveID)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get box changes")
		// Don't fail the request, just log the error
	} else {
		resp.BoxChanges = make([]BoxChangeResponse, 0, len(boxChanges))
		for _, bc := range boxChanges {
			resp.BoxChanges = append(resp.BoxChanges, boxChangeToResponse(&bc))
		}
	}

	// Enrich with inspection data
	enrichHiveResponseWithInspection(r.Context(), conn, &resp)

	// Enrich with task summary
	enrichHiveResponseWithTaskSummary(r.Context(), conn, tenantID, &resp)

	respondJSON(w, HiveDataResponse{Data: resp}, http.StatusOK)
}

// CreateHive handles POST /api/sites/{site_id}/hives - creates a new hive.
func CreateHive(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())
	siteID := chi.URLParam(r, "site_id")

	if siteID == "" {
		respondError(w, "Site ID is required", http.StatusBadRequest)
		return
	}

	// Check hive limit before proceeding
	if err := storage.CheckHiveLimit(r.Context(), conn, tenantID); err != nil {
		if errors.Is(err, storage.ErrLimitExceeded) {
			respondError(w, "Hive limit reached. Contact your administrator to increase your quota.", http.StatusForbidden)
			return
		}
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to check hive limit")
		respondError(w, "Failed to create hive", http.StatusInternalServerError)
		return
	}

	// Verify site exists
	_, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get site")
		respondError(w, "Failed to get site", http.StatusInternalServerError)
		return
	}

	var req CreateHiveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Name == "" {
		respondError(w, "Name is required", http.StatusBadRequest)
		return
	}

	// FIX (S3A-L3): Validate string length for hive name.
	if len(req.Name) > 200 {
		respondError(w, "Name must not exceed 200 characters", http.StatusBadRequest)
		return
	}

	// Validate brood boxes (1-3)
	broodBoxes := 1
	if req.BroodBoxes != nil {
		broodBoxes = *req.BroodBoxes
		if broodBoxes < 1 || broodBoxes > 3 {
			respondError(w, "Brood boxes must be between 1 and 3", http.StatusBadRequest)
			return
		}
	}

	// Validate honey supers (0-5)
	honeySupers := 0
	if req.HoneySupers != nil {
		honeySupers = *req.HoneySupers
		if honeySupers < 0 || honeySupers > 5 {
			respondError(w, "Honey supers must be between 0 and 5", http.StatusBadRequest)
			return
		}
	}

	// Validate queen source if provided
	if !validateQueenSource(req.QueenSource) {
		respondError(w, "Invalid queen source. Must be one of: breeder, swarm, split, package, other, or other:{description}", http.StatusBadRequest)
		return
	}

	// Parse queen introduced date if provided
	var queenIntroducedAt *time.Time
	if req.QueenIntroducedAt != nil && *req.QueenIntroducedAt != "" {
		t, err := time.Parse("2006-01-02", *req.QueenIntroducedAt)
		if err != nil {
			respondError(w, "Invalid queen_introduced_at format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		queenIntroducedAt = &t
	}

	input := &storage.CreateHiveInput{
		SiteID:            siteID,
		Name:              req.Name,
		QueenIntroducedAt: queenIntroducedAt,
		QueenSource:       req.QueenSource,
		BroodBoxes:        broodBoxes,
		HoneySupers:       honeySupers,
		Notes:             req.Notes,
	}

	hive, err := storage.CreateHive(r.Context(), conn, tenantID, input)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Str("site_id", siteID).Msg("handler: failed to create hive")
		respondError(w, "Failed to create hive", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("hive_id", hive.ID).
		Str("tenant_id", tenantID).
		Str("site_id", siteID).
		Str("name", hive.Name).
		Msg("Hive created")

	// Audit log: record hive creation
	AuditCreate(r.Context(), "hives", hive.ID, hive)

	respondJSON(w, HiveDataResponse{Data: hiveToResponse(hive)}, http.StatusCreated)
}

// UpdateHive handles PUT /api/hives/{id} - updates an existing hive.
func UpdateHive(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	// Get old values for audit log before update
	oldHive, err := storage.GetHiveByID(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive for audit")
		respondError(w, "Failed to update hive", http.StatusInternalServerError)
		return
	}

	var req UpdateHiveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate brood boxes if provided
	if req.BroodBoxes != nil && (*req.BroodBoxes < 1 || *req.BroodBoxes > 3) {
		respondError(w, "Brood boxes must be between 1 and 3", http.StatusBadRequest)
		return
	}

	// Validate honey supers if provided
	if req.HoneySupers != nil && (*req.HoneySupers < 0 || *req.HoneySupers > 5) {
		respondError(w, "Honey supers must be between 0 and 5", http.StatusBadRequest)
		return
	}

	// Validate queen source if provided
	if !validateQueenSource(req.QueenSource) {
		respondError(w, "Invalid queen source. Must be one of: breeder, swarm, split, package, other, or other:{description}", http.StatusBadRequest)
		return
	}

	// Parse queen introduced date if provided
	var queenIntroducedAt *time.Time
	if req.QueenIntroducedAt != nil && *req.QueenIntroducedAt != "" {
		t, err := time.Parse("2006-01-02", *req.QueenIntroducedAt)
		if err != nil {
			respondError(w, "Invalid queen_introduced_at format. Use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		queenIntroducedAt = &t
	}

	input := &storage.UpdateHiveInput{
		Name:              req.Name,
		QueenIntroducedAt: queenIntroducedAt,
		QueenSource:       req.QueenSource,
		BroodBoxes:        req.BroodBoxes,
		HoneySupers:       req.HoneySupers,
		Notes:             req.Notes,
	}

	hive, err := storage.UpdateHive(r.Context(), conn, hiveID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to update hive")
		respondError(w, "Failed to update hive", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("hive_id", hive.ID).
		Str("name", hive.Name).
		Msg("Hive updated")

	// Audit log: record hive update with old and new values
	AuditUpdate(r.Context(), "hives", hive.ID, oldHive, hive)

	respondJSON(w, HiveDataResponse{Data: hiveToResponse(hive)}, http.StatusOK)
}

// DeleteHive handles DELETE /api/hives/{id} - deletes a hive.
func DeleteHive(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	// Get old values for audit log before delete
	oldHive, err := storage.GetHiveByID(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive for audit")
		respondError(w, "Failed to delete hive", http.StatusInternalServerError)
		return
	}

	err = storage.DeleteHive(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if errors.Is(err, storage.ErrHiveHasInspections) {
		respondError(w, "Cannot delete hive with inspections. Delete inspections first.", http.StatusConflict)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to delete hive")
		respondError(w, "Failed to delete hive", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("hive_id", hiveID).
		Msg("Hive deleted")

	// Audit log: record hive deletion with old values
	AuditDelete(r.Context(), "hives", hiveID, oldHive)

	w.WriteHeader(http.StatusNoContent)
}

// ReplaceQueen handles POST /api/hives/{id}/replace-queen - records a queen replacement.
func ReplaceQueen(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	var req ReplaceQueenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate new introduced date
	if req.NewIntroducedAt == "" {
		respondError(w, "New queen introduction date is required", http.StatusBadRequest)
		return
	}

	newIntroducedAt, err := time.Parse("2006-01-02", req.NewIntroducedAt)
	if err != nil {
		respondError(w, "Invalid new_introduced_at format. Use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	// Get the hive to verify it exists
	hive, err := storage.GetHiveByID(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get hive")
		respondError(w, "Failed to get hive", http.StatusInternalServerError)
		return
	}

	// Get current queen history to mark as replaced
	queenHistory, err := storage.ListQueenHistory(r.Context(), conn, hiveID)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to get queen history")
		respondError(w, "Failed to get queen history", http.StatusInternalServerError)
		return
	}

	// Mark the most recent queen as replaced on the date the new queen was introduced
	if len(queenHistory) > 0 {
		err = storage.UpdateQueenHistoryReplacement(r.Context(), conn, queenHistory[0].ID, newIntroducedAt, req.ReplacementReason)
		if err != nil {
			log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to update queen history")
			respondError(w, "Failed to update queen history", http.StatusInternalServerError)
			return
		}
	}

	// Create new queen history entry
	_, err = storage.CreateQueenHistory(r.Context(), conn, &storage.CreateQueenHistoryInput{
		HiveID:       hiveID,
		IntroducedAt: newIntroducedAt,
		Source:       req.NewSource,
	})
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to create queen history")
		respondError(w, "Failed to create queen history", http.StatusInternalServerError)
		return
	}

	// Update hive with new queen info
	_, err = storage.UpdateHive(r.Context(), conn, hiveID, &storage.UpdateHiveInput{
		QueenIntroducedAt: &newIntroducedAt,
		QueenSource:       req.NewSource,
	})
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to update hive queen info")
		// Don't fail the request - queen history was updated successfully
	}

	log.Info().
		Str("hive_id", hiveID).
		Str("hive_name", hive.Name).
		Time("new_queen_introduced", newIntroducedAt).
		Msg("Queen replaced")

	// Return updated hive
	updatedHive, _ := storage.GetHiveByID(r.Context(), conn, hiveID)
	if updatedHive != nil {
		respondJSON(w, HiveDataResponse{Data: hiveToResponse(updatedHive)}, http.StatusOK)
	} else {
		respondJSON(w, map[string]string{"message": "Queen replaced successfully"}, http.StatusOK)
	}
}

// ActivityLogResponse represents an activity log entry in API responses.
type ActivityLogResponse struct {
	ID        string          `json:"id"`
	HiveID    string          `json:"hive_id"`
	Type      string          `json:"type"`
	Content   string          `json:"content"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
	CreatedBy string          `json:"created_by"`
	CreatedAt time.Time       `json:"created_at"`
}

// ActivityLogListResponse represents the list activity API response.
type ActivityLogListResponse struct {
	Data []ActivityLogResponse `json:"data"`
	Meta MetaResponse          `json:"meta"`
}

// ListHiveActivity handles GET /api/hives/{id}/activity - returns activity log entries for a hive.
// Story 14.13: Task Completion Inspection Note Logging
// Supports pagination via page and per_page query params.
// Supports filtering by type via type query param.
func ListHiveActivity(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	hiveID := chi.URLParam(r, "id")

	if hiveID == "" {
		respondError(w, "Hive ID is required", http.StatusBadRequest)
		return
	}

	// Verify hive exists
	_, err := storage.GetHiveByID(r.Context(), conn, hiveID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Hive not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to verify hive")
		respondError(w, "Failed to verify hive", http.StatusInternalServerError)
		return
	}

	// Parse pagination
	page := 1
	perPage := 20
	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}
	if perPageStr := r.URL.Query().Get("per_page"); perPageStr != "" {
		if pp, err := strconv.Atoi(perPageStr); err == nil && pp > 0 && pp <= 100 {
			perPage = pp
		}
	}

	// Parse type filter
	typeFilter := r.URL.Query().Get("type")

	// List activity entries
	result, err := storage.ListActivityByHive(r.Context(), conn, hiveID, typeFilter, page, perPage)
	if err != nil {
		log.Error().Err(err).Str("hive_id", hiveID).Msg("handler: failed to list activity")
		respondError(w, "Failed to list activity", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	entries := make([]ActivityLogResponse, len(result.Entries))
	for i, entry := range result.Entries {
		entries[i] = ActivityLogResponse{
			ID:        entry.ID,
			HiveID:    entry.HiveID,
			Type:      entry.Type,
			Content:   entry.Content,
			Metadata:  entry.Metadata,
			CreatedBy: entry.CreatedBy,
			CreatedAt: entry.CreatedAt,
		}
	}

	respondJSON(w, ActivityLogListResponse{
		Data: entries,
		Meta: MetaResponse{
			Total:   result.Total,
			Page:    result.Page,
			PerPage: result.PerPage,
		},
	}, http.StatusOK)
}
