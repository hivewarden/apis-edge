// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// DetectionResponse represents a detection in API responses.
type DetectionResponse struct {
	ID              string    `json:"id"`
	UnitID          string    `json:"unit_id"`
	SiteID          string    `json:"site_id"`
	DetectedAt      time.Time `json:"detected_at"`
	Confidence      *float64  `json:"confidence,omitempty"`
	SizePixels      *int      `json:"size_pixels,omitempty"`
	HoverDurationMs *int      `json:"hover_duration_ms,omitempty"`
	LaserActivated  bool      `json:"laser_activated"`
	ClipID          *string   `json:"clip_id,omitempty"`
	TemperatureC    *float64  `json:"temperature_c,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// DetectionsListResponse represents the list detections API response.
type DetectionsListResponse struct {
	Data []DetectionResponse `json:"data"`
	Meta PaginationMeta      `json:"meta"`
}

// DetectionDataResponse represents a single detection API response.
type DetectionDataResponse struct {
	Data DetectionResponse `json:"data"`
}

// PaginationMeta contains pagination metadata.
type PaginationMeta struct {
	Total   int `json:"total"`
	Page    int `json:"page"`
	PerPage int `json:"per_page"`
}

// DetectionStatsResponse represents aggregated detection statistics.
type DetectionStatsResponse struct {
	TotalDetections  int       `json:"total_detections"`
	LaserActivations int       `json:"laser_activations"`
	HourlyBreakdown  [24]int   `json:"hourly_breakdown"`
	AvgConfidence    *float64  `json:"avg_confidence,omitempty"`
	FirstDetection   *string   `json:"first_detection,omitempty"`
	LastDetection    *string   `json:"last_detection,omitempty"`
}

// HourlyResponse represents hourly detection data for the Activity Clock.
type HourlyResponse struct {
	Data []HourlyCountResponse `json:"data"`
}

// HourlyCountResponse represents detection count for a single hour.
type HourlyCountResponse struct {
	Hour  int `json:"hour"`
	Count int `json:"count"`
}

// TrendResponse represents daily detection trend data.
type TrendResponse struct {
	Data []DailyTrendResponse `json:"data"`
}

// DailyTrendResponse represents detection count for a single day.
type DailyTrendResponse struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// TemperatureCorrelationResponse represents temperature correlation data.
type TemperatureCorrelationResponse struct {
	Data []CorrelationPointResponse `json:"data"`
}

// CorrelationPointResponse represents a single data point for temp vs detections.
type CorrelationPointResponse struct {
	Date         string  `json:"date"`
	TemperatureC float64 `json:"temperature_c"`
	Count        int     `json:"count"`
}

// CreateDetectionRequest represents the request body for creating a detection.
type CreateDetectionRequest struct {
	DetectedAt      string   `json:"detected_at"`
	Confidence      *float64 `json:"confidence,omitempty"`
	SizePixels      *int     `json:"size_pixels,omitempty"`
	HoverDurationMs *int     `json:"hover_duration_ms,omitempty"`
	LaserActivated  bool     `json:"laser_activated"`
	ClipFilename    *string  `json:"clip_filename,omitempty"`
}

// detectionToResponse converts a storage.Detection to a DetectionResponse.
func detectionToResponse(d *storage.Detection) DetectionResponse {
	return DetectionResponse{
		ID:              d.ID,
		UnitID:          d.UnitID,
		SiteID:          d.SiteID,
		DetectedAt:      d.DetectedAt,
		Confidence:      d.Confidence,
		SizePixels:      d.SizePixels,
		HoverDurationMs: d.HoverDurationMs,
		LaserActivated:  d.LaserActivated,
		ClipID:          d.ClipID,
		TemperatureC:    d.TemperatureC,
		CreatedAt:       d.CreatedAt,
	}
}

// CreateDetection handles POST /api/units/detections - creates a new detection from a unit.
// This endpoint is called by APIS units when they detect a hornet.
func CreateDetection(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	// Get unit info from context (set by UnitAuth middleware)
	unit := middleware.GetUnit(r.Context())
	if unit == nil {
		respondError(w, "Unauthorized: missing unit authentication", http.StatusUnauthorized)
		return
	}

	if unit.SiteID == nil || *unit.SiteID == "" {
		respondError(w, "Unit is not assigned to a site", http.StatusBadRequest)
		return
	}

	unitID := unit.ID
	siteID := *unit.SiteID
	tenantID := unit.TenantID

	var req CreateDetectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.DetectedAt == "" {
		respondError(w, "detected_at is required", http.StatusBadRequest)
		return
	}

	// Validate timestamp format
	if _, err := time.Parse(time.RFC3339, req.DetectedAt); err != nil {
		respondError(w, "Invalid detected_at format (expected RFC3339)", http.StatusBadRequest)
		return
	}

	// Validate confidence if provided
	if req.Confidence != nil && (*req.Confidence < 0 || *req.Confidence > 1) {
		respondError(w, "Confidence must be between 0 and 1", http.StatusBadRequest)
		return
	}

	input := &storage.CreateDetectionInput{
		UnitID:          unitID,
		SiteID:          siteID,
		DetectedAt:      req.DetectedAt,
		Confidence:      req.Confidence,
		SizePixels:      req.SizePixels,
		HoverDurationMs: req.HoverDurationMs,
		LaserActivated:  req.LaserActivated,
		ClipFilename:    req.ClipFilename,
	}

	detection, err := storage.CreateDetection(r.Context(), conn, tenantID, input)
	if err != nil {
		log.Error().Err(err).Str("unit_id", unitID).Msg("handler: failed to create detection")
		respondError(w, "Failed to create detection", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("detection_id", detection.ID).
		Str("unit_id", unitID).
		Str("site_id", siteID).
		Bool("laser_activated", detection.LaserActivated).
		Msg("Detection recorded")

	respondJSON(w, DetectionDataResponse{Data: detectionToResponse(detection)}, http.StatusCreated)
}

// ListDetections handles GET /api/detections - returns detections with filtering.
func ListDetections(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	// Parse query parameters
	params := &storage.DetectionListParams{
		Limit:  20, // Default limit
		Offset: 0,
	}

	// Site filter
	if siteID := r.URL.Query().Get("site_id"); siteID != "" {
		params.SiteID = &siteID
	}

	// Unit filter
	if unitID := r.URL.Query().Get("unit_id"); unitID != "" {
		params.UnitID = &unitID
	}

	// Date range filters
	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		from, err := time.Parse("2006-01-02", fromStr)
		if err != nil {
			respondError(w, "Invalid 'from' date format (expected YYYY-MM-DD)", http.StatusBadRequest)
			return
		}
		params.From = &from
	}

	if toStr := r.URL.Query().Get("to"); toStr != "" {
		to, err := time.Parse("2006-01-02", toStr)
		if err != nil {
			respondError(w, "Invalid 'to' date format (expected YYYY-MM-DD)", http.StatusBadRequest)
			return
		}
		// Set to end of day
		endOfDay := to.Add(24*time.Hour - time.Second)
		params.To = &endOfDay
	}

	// Pagination
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		limit, err := strconv.Atoi(limitStr)
		if err != nil || limit < 1 || limit > 100 {
			respondError(w, "Invalid limit (must be 1-100)", http.StatusBadRequest)
			return
		}
		params.Limit = limit
	}

	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		page, err := strconv.Atoi(pageStr)
		if err != nil || page < 1 {
			respondError(w, "Invalid page number", http.StatusBadRequest)
			return
		}
		params.Offset = (page - 1) * params.Limit
	}

	detections, total, err := storage.ListDetections(r.Context(), conn, params)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list detections")
		respondError(w, "Failed to list detections", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	detectionResponses := make([]DetectionResponse, 0, len(detections))
	for _, d := range detections {
		detectionResponses = append(detectionResponses, detectionToResponse(&d))
	}

	page := 1
	if params.Offset > 0 {
		page = (params.Offset / params.Limit) + 1
	}

	respondJSON(w, DetectionsListResponse{
		Data: detectionResponses,
		Meta: PaginationMeta{
			Total:   total,
			Page:    page,
			PerPage: params.Limit,
		},
	}, http.StatusOK)
}

// GetDetection handles GET /api/detections/{id} - returns a specific detection.
func GetDetection(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	detectionID := chi.URLParam(r, "id")

	if detectionID == "" {
		respondError(w, "Detection ID is required", http.StatusBadRequest)
		return
	}

	detection, err := storage.GetDetectionByID(r.Context(), conn, detectionID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Detection not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("detection_id", detectionID).Msg("handler: failed to get detection")
		respondError(w, "Failed to get detection", http.StatusInternalServerError)
		return
	}

	respondJSON(w, DetectionDataResponse{Data: detectionToResponse(detection)}, http.StatusOK)
}

// GetDetectionStats handles GET /api/detections/stats - returns aggregated statistics.
func GetDetectionStats(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		respondError(w, "site_id is required", http.StatusBadRequest)
		return
	}

	// Parse range parameter (day, week, month, season, year, all)
	rangeParam := r.URL.Query().Get("range")
	if rangeParam == "" {
		rangeParam = "day"
	}

	from, to := calculateTimeRange(rangeParam, r.URL.Query().Get("date"))

	stats, err := storage.GetDetectionStats(r.Context(), conn, siteID, from, to)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get detection stats")
		respondError(w, "Failed to get detection stats", http.StatusInternalServerError)
		return
	}

	response := DetectionStatsResponse{
		TotalDetections:  stats.TotalDetections,
		LaserActivations: stats.LaserActivations,
		HourlyBreakdown:  stats.HourlyBreakdown,
		AvgConfidence:    stats.AvgConfidence,
	}

	if stats.FirstDetection != nil {
		firstStr := stats.FirstDetection.Format(time.RFC3339)
		response.FirstDetection = &firstStr
	}
	if stats.LastDetection != nil {
		lastStr := stats.LastDetection.Format(time.RFC3339)
		response.LastDetection = &lastStr
	}

	respondJSON(w, map[string]interface{}{"data": response}, http.StatusOK)
}

// GetHourlyDetections handles GET /api/detections/hourly - returns hourly breakdown.
func GetHourlyDetections(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		respondError(w, "site_id is required", http.StatusBadRequest)
		return
	}

	rangeParam := r.URL.Query().Get("range")
	if rangeParam == "" {
		rangeParam = "week"
	}

	from, to := calculateTimeRange(rangeParam, r.URL.Query().Get("date"))

	hourly, err := storage.GetHourlyDetections(r.Context(), conn, siteID, from, to)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get hourly detections")
		respondError(w, "Failed to get hourly detections", http.StatusInternalServerError)
		return
	}

	response := make([]HourlyCountResponse, len(hourly))
	for i, h := range hourly {
		response[i] = HourlyCountResponse{Hour: h.Hour, Count: h.Count}
	}

	respondJSON(w, HourlyResponse{Data: response}, http.StatusOK)
}

// GetDetectionTrend handles GET /api/detections/trend - returns daily trend data.
func GetDetectionTrend(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		respondError(w, "site_id is required", http.StatusBadRequest)
		return
	}

	rangeParam := r.URL.Query().Get("range")
	if rangeParam == "" {
		rangeParam = "month"
	}

	from, to := calculateTimeRange(rangeParam, r.URL.Query().Get("date"))

	trends, err := storage.GetDetectionTrend(r.Context(), conn, siteID, from, to)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get detection trend")
		respondError(w, "Failed to get detection trend", http.StatusInternalServerError)
		return
	}

	response := make([]DailyTrendResponse, len(trends))
	for i, t := range trends {
		response[i] = DailyTrendResponse{Date: t.Date, Count: t.Count}
	}

	respondJSON(w, TrendResponse{Data: response}, http.StatusOK)
}

// GetTemperatureCorrelation handles GET /api/detections/temperature-correlation.
func GetTemperatureCorrelation(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		respondError(w, "site_id is required", http.StatusBadRequest)
		return
	}

	rangeParam := r.URL.Query().Get("range")
	if rangeParam == "" {
		rangeParam = "month"
	}

	from, to := calculateTimeRange(rangeParam, r.URL.Query().Get("date"))

	correlations, err := storage.GetTemperatureCorrelation(r.Context(), conn, siteID, from, to)
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get temperature correlation")
		respondError(w, "Failed to get temperature correlation", http.StatusInternalServerError)
		return
	}

	response := make([]CorrelationPointResponse, len(correlations))
	for i, c := range correlations {
		response[i] = CorrelationPointResponse{
			Date:         c.Date,
			TemperatureC: c.TemperatureC,
			Count:        c.Count,
		}
	}

	respondJSON(w, TemperatureCorrelationResponse{Data: response}, http.StatusOK)
}

// calculateTimeRange returns the from/to times based on range parameter.
func calculateTimeRange(rangeParam, dateStr string) (time.Time, time.Time) {
	now := time.Now()
	var from, to time.Time

	// If specific date provided, use it as reference
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			now = parsed
		}
	}

	switch rangeParam {
	case "day":
		// Today (or specified date)
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		to = from.Add(24*time.Hour - time.Second)

	case "week":
		// Current week (Monday to Sunday)
		weekday := int(now.Weekday())
		if weekday == 0 {
			weekday = 7 // Sunday is 7, not 0
		}
		monday := now.AddDate(0, 0, -(weekday - 1))
		from = time.Date(monday.Year(), monday.Month(), monday.Day(), 0, 0, 0, 0, now.Location())
		to = from.AddDate(0, 0, 7).Add(-time.Second)

	case "month":
		// Current month
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		to = from.AddDate(0, 1, 0).Add(-time.Second)

	case "season":
		// Hornet season: Aug 1 - Nov 30
		year := now.Year()
		// If we're before August, use previous year's season
		if now.Month() < 8 {
			year--
		}
		from = time.Date(year, 8, 1, 0, 0, 0, 0, now.Location())
		to = time.Date(year, 12, 1, 0, 0, 0, 0, now.Location()).Add(-time.Second)

	case "year":
		// Current year
		from = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
		to = time.Date(now.Year()+1, 1, 1, 0, 0, 0, 0, now.Location()).Add(-time.Second)

	case "all":
		// All time (last 10 years as practical limit)
		from = time.Date(now.Year()-10, 1, 1, 0, 0, 0, 0, now.Location())
		to = time.Date(now.Year()+1, 1, 1, 0, 0, 0, 0, now.Location()).Add(-time.Second)

	default:
		// Default to today
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		to = from.Add(24*time.Hour - time.Second)
	}

	return from, to
}
