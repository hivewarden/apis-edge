package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// CreateDetectionRequest represents the request body for creating a detection.
type CreateDetectionRequest struct {
	DetectedAt      time.Time `json:"detected_at"`
	Confidence      *float64  `json:"confidence,omitempty"`
	SizePixels      *int      `json:"size_pixels,omitempty"`
	HoverDurationMs *int      `json:"hover_duration_ms,omitempty"`
	LaserActivated  bool      `json:"laser_activated"`
	ClipFilename    *string   `json:"clip_filename,omitempty"`
}

// DetectionResponse represents a detection in API responses.
type DetectionResponse struct {
	ID              string     `json:"id"`
	UnitID          string     `json:"unit_id"`
	UnitName        *string    `json:"unit_name,omitempty"`
	SiteID          string     `json:"site_id"`
	DetectedAt      time.Time  `json:"detected_at"`
	Confidence      *float64   `json:"confidence,omitempty"`
	SizePixels      *int       `json:"size_pixels,omitempty"`
	HoverDurationMs *int       `json:"hover_duration_ms,omitempty"`
	LaserActivated  bool       `json:"laser_activated"`
	TemperatureC    *float64   `json:"temperature_c,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

// DetectionListResponse represents the list detections API response.
type DetectionListResponse struct {
	Data []DetectionResponse `json:"data"`
	Meta MetaResponse        `json:"meta"`
}

// DetectionStatsResponse represents the detection stats API response.
type DetectionStatsResponse struct {
	Data storage.DetectionStats `json:"data"`
}

// CreateDetectionResponse represents the create detection API response.
type CreateDetectionResponse struct {
	Data DetectionResponse `json:"data"`
}

// DetectionDataResponse wraps a single detection response.
type DetectionDataResponse struct {
	Data DetectionResponse `json:"data"`
}

// GetDetection handles GET /api/detections/{id} - returns a single detection.
// Authenticated via JWT (dashboard authentication).
func GetDetectionByID(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	// Get detection ID from URL path (Chi uses URLParam)
	detectionID := chi.URLParam(r, "id")
	if detectionID == "" {
		respondError(w, "Detection ID is required", http.StatusBadRequest)
		return
	}

	// Get detection from database (RLS ensures tenant isolation)
	detection, err := storage.GetDetection(r.Context(), conn, detectionID)
	if err != nil {
		log.Debug().Err(err).Str("detection_id", detectionID).Msg("handler: detection not found")
		respondError(w, "Detection not found", http.StatusNotFound)
		return
	}

	// Return response
	respondJSON(w, DetectionDataResponse{
		Data: detectionToResponse(detection),
	}, http.StatusOK)
}

// CreateDetection handles POST /api/units/detections - creates a new detection.
// Authenticated via X-API-Key header (unit authentication).
func CreateDetection(w http.ResponseWriter, r *http.Request) {
	// Get authenticated unit from context
	unit := middleware.RequireUnit(r.Context())
	conn := storage.RequireConn(r.Context())

	// Parse request body
	var req CreateDetectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Debug().Err(err).Msg("handler: invalid detection request body")
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required field
	if req.DetectedAt.IsZero() {
		respondError(w, "detected_at is required", http.StatusBadRequest)
		return
	}

	// Validate confidence range if provided
	if req.Confidence != nil && (*req.Confidence < 0 || *req.Confidence > 1) {
		respondError(w, "confidence must be between 0 and 1", http.StatusBadRequest)
		return
	}

	// Require unit to be assigned to a site
	if unit.SiteID == nil {
		log.Warn().Str("unit_id", unit.ID).Msg("handler: unit not assigned to site, cannot create detection")
		respondError(w, "Unit must be assigned to a site before reporting detections", http.StatusBadRequest)
		return
	}

	// Create detection input
	input := &storage.CreateDetectionInput{
		DetectedAt:      req.DetectedAt,
		Confidence:      req.Confidence,
		SizePixels:      req.SizePixels,
		HoverDurationMs: req.HoverDurationMs,
		LaserActivated:  req.LaserActivated,
		ClipFilename:    req.ClipFilename,
	}

	// TODO: Get current temperature from weather cache if available (Story 3.3)
	var temperatureC *float64 = nil

	// Create the detection
	detection, err := storage.CreateDetection(r.Context(), conn, unit.TenantID, unit.ID, *unit.SiteID, input, temperatureC)
	if err != nil {
		log.Error().Err(err).Str("unit_id", unit.ID).Msg("handler: failed to create detection")
		respondError(w, "Failed to create detection", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("detection_id", detection.ID).
		Str("unit_id", unit.ID).
		Str("site_id", *unit.SiteID).
		Bool("laser_activated", detection.LaserActivated).
		Msg("Detection recorded")

	// Respond with created detection
	respondJSON(w, CreateDetectionResponse{
		Data: detectionToResponse(detection),
	}, http.StatusCreated)
}

// ListDetections handles GET /api/detections - returns detections for a site.
// Authenticated via JWT (dashboard authentication).
func ListDetections(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	// Parse query parameters
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		respondError(w, "site_id is required", http.StatusBadRequest)
		return
	}

	// Validate site exists and belongs to tenant (RLS will enforce, but give better error)
	_, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if err != nil {
		if err == storage.ErrNotFound {
			respondError(w, "Site not found", http.StatusNotFound)
			return
		}
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get site")
		respondError(w, "Failed to validate site", http.StatusInternalServerError)
		return
	}

	// Parse date range
	from, to := parseDateRange(r)

	// Parse pagination
	page, perPage := parsePagination(r, 50, 100)

	// Parse optional unit filter
	var unitID *string
	if uid := r.URL.Query().Get("unit_id"); uid != "" {
		unitID = &uid
	}

	params := &storage.ListDetectionsParams{
		SiteID:  siteID,
		UnitID:  unitID,
		From:    from,
		To:      to,
		Page:    page,
		PerPage: perPage,
	}

	detections, total, err := storage.ListDetections(r.Context(), conn, params)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to list detections")
		respondError(w, "Failed to list detections", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responseData := make([]DetectionResponse, 0, len(detections))
	for _, d := range detections {
		responseData = append(responseData, detectionToResponse(&d))
	}

	respondJSON(w, DetectionListResponse{
		Data: responseData,
		Meta: MetaResponse{
			Total:   total,
			Page:    page,
			PerPage: perPage,
		},
	}, http.StatusOK)
}

// validRangeTypes defines the allowed range types for stats queries.
var validRangeTypes = map[string]bool{
	"day": true, "week": true, "month": true, "season": true, "year": true, "all": true,
}

// GetDetectionStats handles GET /api/detections/stats - returns aggregated statistics.
// Authenticated via JWT (dashboard authentication).
func GetDetectionStats(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	// Parse query parameters
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		respondError(w, "site_id is required", http.StatusBadRequest)
		return
	}

	// Get range type and validate
	rangeType := r.URL.Query().Get("range")
	if rangeType == "" {
		rangeType = "day"
	}
	if !validRangeTypes[rangeType] {
		respondError(w, "Invalid range type. Must be one of: day, week, month, season, year, all", http.StatusBadRequest)
		return
	}

	// Parse reference date
	referenceDate := time.Now()
	if dateStr := r.URL.Query().Get("date"); dateStr != "" {
		parsed, err := time.Parse("2006-01-02", dateStr)
		if err == nil {
			referenceDate = parsed
		}
	}

	// Calculate date range
	from, to := calculateDateRange(rangeType, referenceDate)

	// Get site timezone (default to UTC)
	timezone := "UTC"
	site, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if err == nil && site.Timezone != "" {
		timezone = site.Timezone
	}

	stats, err := storage.GetDetectionStats(r.Context(), conn, siteID, from, to, timezone)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get detection stats")
		respondError(w, "Failed to get detection stats", http.StatusInternalServerError)
		return
	}

	respondJSON(w, DetectionStatsResponse{
		Data: *stats,
	}, http.StatusOK)
}

// TemperatureCorrelationResponse represents the temperature correlation API response.
type TemperatureCorrelationResponse struct {
	Data []storage.TemperatureCorrelationPoint `json:"data"`
	Meta TemperatureCorrelationMeta            `json:"meta"`
}

// TemperatureCorrelationMeta contains metadata for temperature correlation response.
type TemperatureCorrelationMeta struct {
	Range       string  `json:"range"`
	Date        *string `json:"date,omitempty"`
	TotalPoints int     `json:"total_points"`
	IsHourly    bool    `json:"is_hourly"`
}

// GetTemperatureCorrelation handles GET /api/detections/temperature-correlation
// Returns temperature vs detection count correlation data.
// For range == "day": returns hourly data points
// For other ranges: returns daily data points
// Authenticated via JWT (dashboard authentication).
func GetTemperatureCorrelation(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	// Parse query parameters
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		respondError(w, "site_id is required", http.StatusBadRequest)
		return
	}

	// Get range type and validate
	rangeType := r.URL.Query().Get("range")
	if rangeType == "" {
		rangeType = "month" // Default to month for correlation view
	}
	if !validRangeTypes[rangeType] {
		respondError(w, "Invalid range type. Must be one of: day, week, month, season, year, all", http.StatusBadRequest)
		return
	}

	// Parse reference date
	referenceDate := time.Now()
	var dateStr *string
	if d := r.URL.Query().Get("date"); d != "" {
		parsed, err := time.Parse("2006-01-02", d)
		if err == nil {
			referenceDate = parsed
			dateStr = &d
		}
	}

	// Calculate date range
	from, to := calculateDateRange(rangeType, referenceDate)

	// Get site timezone (default to UTC)
	timezone := "UTC"
	site, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if err == nil && site.Timezone != "" {
		timezone = site.Timezone
	}

	// For "day" range, use hourly aggregation; otherwise use daily
	isHourly := rangeType == "day"

	correlation, err := storage.GetTemperatureCorrelation(r.Context(), conn, siteID, from, to, timezone, isHourly)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Str("range", rangeType).Msg("handler: failed to get temperature correlation")
		respondError(w, "Failed to get temperature correlation", http.StatusInternalServerError)
		return
	}

	respondJSON(w, TemperatureCorrelationResponse{
		Data: correlation.Points,
		Meta: TemperatureCorrelationMeta{
			Range:       rangeType,
			Date:        dateStr,
			TotalPoints: len(correlation.Points),
			IsHourly:    isHourly,
		},
	}, http.StatusOK)
}

// TrendDataResponse represents the trend data API response.
type TrendDataResponse struct {
	Data []storage.TrendDataPoint `json:"data"`
	Meta TrendDataMeta            `json:"meta"`
}

// TrendDataMeta contains metadata for trend data response.
type TrendDataMeta struct {
	Range           string `json:"range"`
	Aggregation     string `json:"aggregation"`
	TotalDetections int    `json:"total_detections"`
}

// GetTrendData handles GET /api/detections/trend
// Returns detection trend data for line/area charts.
// Aggregation level depends on time range:
// - day: hourly
// - week/month: daily
// - season/year/all: weekly
// Authenticated via JWT (dashboard authentication).
func GetTrendData(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	// Parse query parameters
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		respondError(w, "site_id is required", http.StatusBadRequest)
		return
	}

	// Get range type and validate
	rangeType := r.URL.Query().Get("range")
	if rangeType == "" {
		rangeType = "week" // Default to week for trend view
	}
	if !validRangeTypes[rangeType] {
		respondError(w, "Invalid range type. Must be one of: day, week, month, season, year, all", http.StatusBadRequest)
		return
	}

	// Parse reference date
	referenceDate := time.Now()
	if d := r.URL.Query().Get("date"); d != "" {
		parsed, err := time.Parse("2006-01-02", d)
		if err == nil {
			referenceDate = parsed
		}
	}

	// Calculate date range
	from, to := calculateDateRange(rangeType, referenceDate)

	// Get site timezone (default to UTC)
	timezone := "UTC"
	site, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if err == nil && site.Timezone != "" {
		timezone = site.Timezone
	}

	trendData, err := storage.GetTrendData(r.Context(), conn, siteID, from, to, timezone, rangeType)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Str("range", rangeType).Msg("handler: failed to get trend data")
		respondError(w, "Failed to get trend data", http.StatusInternalServerError)
		return
	}

	respondJSON(w, TrendDataResponse{
		Data: trendData.Points,
		Meta: TrendDataMeta{
			Range:           rangeType,
			Aggregation:     trendData.Aggregation,
			TotalDetections: trendData.TotalDetections,
		},
	}, http.StatusOK)
}

// detectionToResponse converts a storage.Detection to a DetectionResponse.
func detectionToResponse(d *storage.Detection) DetectionResponse {
	return DetectionResponse{
		ID:              d.ID,
		UnitID:          d.UnitID,
		UnitName:        d.UnitName,
		SiteID:          d.SiteID,
		DetectedAt:      d.DetectedAt,
		Confidence:      d.Confidence,
		SizePixels:      d.SizePixels,
		HoverDurationMs: d.HoverDurationMs,
		LaserActivated:  d.LaserActivated,
		TemperatureC:    d.TemperatureC,
		CreatedAt:       d.CreatedAt,
	}
}

// parseDateRange parses from/to date query parameters.
// Defaults to today if not specified.
func parseDateRange(r *http.Request) (from, to time.Time) {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	from = today
	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		if parsed, err := time.Parse("2006-01-02", fromStr); err == nil {
			from = parsed
		}
	}

	to = today.AddDate(0, 0, 1) // End of today
	if toStr := r.URL.Query().Get("to"); toStr != "" {
		if parsed, err := time.Parse("2006-01-02", toStr); err == nil {
			// Set to end of the specified day
			to = parsed.AddDate(0, 0, 1)
		}
	}

	return from, to
}

// parsePagination parses page and per_page query parameters.
func parsePagination(r *http.Request, defaultPerPage, maxPerPage int) (page, perPage int) {
	page = 1
	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		if p, err := parseInt(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	perPage = defaultPerPage
	if perPageStr := r.URL.Query().Get("per_page"); perPageStr != "" {
		if pp, err := parseInt(perPageStr); err == nil && pp > 0 {
			perPage = min(pp, maxPerPage)
		}
	}

	return page, perPage
}

// parseInt parses a string to int.
func parseInt(s string) (int, error) {
	return strconv.Atoi(s)
}

// calculateDateRange calculates the date range based on range type and reference date.
func calculateDateRange(rangeType string, referenceDate time.Time) (from, to time.Time) {
	loc := referenceDate.Location()

	switch rangeType {
	case "day":
		from = time.Date(referenceDate.Year(), referenceDate.Month(), referenceDate.Day(), 0, 0, 0, 0, loc)
		to = from.AddDate(0, 0, 1)
	case "week":
		// Start from Monday
		weekday := int(referenceDate.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		from = referenceDate.AddDate(0, 0, -(weekday - 1))
		from = time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, loc)
		to = from.AddDate(0, 0, 7)
	case "month":
		from = time.Date(referenceDate.Year(), referenceDate.Month(), 1, 0, 0, 0, 0, loc)
		to = from.AddDate(0, 1, 0)
	case "season":
		// Hornet season: Aug 1 - Nov 30
		year := referenceDate.Year()
		from = time.Date(year, 8, 1, 0, 0, 0, 0, loc)
		to = time.Date(year, 12, 1, 0, 0, 0, 0, loc)
	case "year":
		from = time.Date(referenceDate.Year(), 1, 1, 0, 0, 0, 0, loc)
		to = from.AddDate(1, 0, 0)
	default: // "all"
		from = time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
		to = time.Now().AddDate(1, 0, 0)
	}
	return from, to
}
