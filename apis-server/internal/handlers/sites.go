// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// SiteResponse represents a site in API responses.
type SiteResponse struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Latitude  *float64  `json:"latitude,omitempty"`
	Longitude *float64  `json:"longitude,omitempty"`
	Timezone  string    `json:"timezone"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// SitesListResponse represents the list sites API response.
type SitesListResponse struct {
	Data []SiteResponse `json:"data"`
	Meta MetaResponse   `json:"meta"`
}

// SiteDataResponse represents a single site API response.
type SiteDataResponse struct {
	Data SiteResponse `json:"data"`
}

// MetaResponse contains pagination metadata.
type MetaResponse struct {
	Total   int `json:"total"`
	Page    int `json:"page,omitempty"`
	PerPage int `json:"per_page,omitempty"`
}

// CreateSiteRequest represents the request body for creating a site.
type CreateSiteRequest struct {
	Name      string   `json:"name"`
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	Timezone  string   `json:"timezone"`
}

// UpdateSiteRequest represents the request body for updating a site.
type UpdateSiteRequest struct {
	Name      *string  `json:"name,omitempty"`
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	Timezone  *string  `json:"timezone,omitempty"`
}

// siteToResponse converts a storage.Site to a SiteResponse.
func siteToResponse(site *storage.Site) SiteResponse {
	return SiteResponse{
		ID:        site.ID,
		Name:      site.Name,
		Latitude:  site.Latitude,
		Longitude: site.Longitude,
		Timezone:  site.Timezone,
		CreatedAt: site.CreatedAt,
		UpdatedAt: site.UpdatedAt,
	}
}

// ListSites handles GET /api/sites - returns all sites for the authenticated tenant.
func ListSites(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	sites, err := storage.ListSites(r.Context(), conn)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list sites")
		respondError(w, "Failed to list sites", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	siteResponses := make([]SiteResponse, 0, len(sites))
	for _, site := range sites {
		siteResponses = append(siteResponses, siteToResponse(&site))
	}

	respondJSON(w, SitesListResponse{
		Data: siteResponses,
		Meta: MetaResponse{Total: len(siteResponses)},
	}, http.StatusOK)
}

// GetSite handles GET /api/sites/{id} - returns a specific site.
func GetSite(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	siteID := chi.URLParam(r, "id")

	if siteID == "" {
		respondError(w, "Site ID is required", http.StatusBadRequest)
		return
	}

	site, err := storage.GetSiteByID(r.Context(), conn, siteID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to get site")
		respondError(w, "Failed to get site", http.StatusInternalServerError)
		return
	}

	respondJSON(w, SiteDataResponse{Data: siteToResponse(site)}, http.StatusOK)
}

// CreateSite handles POST /api/sites - creates a new site.
func CreateSite(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	var req CreateSiteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if req.Name == "" {
		respondError(w, "Name is required", http.StatusBadRequest)
		return
	}

	// Validate GPS coordinates if provided
	if req.Latitude != nil && (*req.Latitude < -90 || *req.Latitude > 90) {
		respondError(w, "Latitude must be between -90 and 90", http.StatusBadRequest)
		return
	}
	if req.Longitude != nil && (*req.Longitude < -180 || *req.Longitude > 180) {
		respondError(w, "Longitude must be between -180 and 180", http.StatusBadRequest)
		return
	}

	// Validate timezone if provided
	if req.Timezone != "" && !isValidTimezone(req.Timezone) {
		respondError(w, "Invalid timezone", http.StatusBadRequest)
		return
	}

	input := &storage.CreateSiteInput{
		Name:      req.Name,
		Latitude:  req.Latitude,
		Longitude: req.Longitude,
		Timezone:  req.Timezone,
	}

	site, err := storage.CreateSite(r.Context(), conn, tenantID, input)
	if err != nil {
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to create site")
		respondError(w, "Failed to create site", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("site_id", site.ID).
		Str("tenant_id", tenantID).
		Str("name", site.Name).
		Msg("Site created")

	respondJSON(w, SiteDataResponse{Data: siteToResponse(site)}, http.StatusCreated)
}

// UpdateSite handles PUT /api/sites/{id} - updates an existing site.
func UpdateSite(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	siteID := chi.URLParam(r, "id")

	if siteID == "" {
		respondError(w, "Site ID is required", http.StatusBadRequest)
		return
	}

	var req UpdateSiteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate GPS coordinates if provided
	if req.Latitude != nil && (*req.Latitude < -90 || *req.Latitude > 90) {
		respondError(w, "Latitude must be between -90 and 90", http.StatusBadRequest)
		return
	}
	if req.Longitude != nil && (*req.Longitude < -180 || *req.Longitude > 180) {
		respondError(w, "Longitude must be between -180 and 180", http.StatusBadRequest)
		return
	}

	// Validate timezone if provided
	if req.Timezone != nil && *req.Timezone != "" && !isValidTimezone(*req.Timezone) {
		respondError(w, "Invalid timezone", http.StatusBadRequest)
		return
	}

	input := &storage.UpdateSiteInput{
		Name:      req.Name,
		Latitude:  req.Latitude,
		Longitude: req.Longitude,
		Timezone:  req.Timezone,
	}

	site, err := storage.UpdateSite(r.Context(), conn, siteID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to update site")
		respondError(w, "Failed to update site", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("site_id", site.ID).
		Str("name", site.Name).
		Msg("Site updated")

	respondJSON(w, SiteDataResponse{Data: siteToResponse(site)}, http.StatusOK)
}

// DeleteSite handles DELETE /api/sites/{id} - deletes a site.
func DeleteSite(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	siteID := chi.URLParam(r, "id")

	if siteID == "" {
		respondError(w, "Site ID is required", http.StatusBadRequest)
		return
	}

	err := storage.DeleteSite(r.Context(), conn, siteID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "Site not found", http.StatusNotFound)
		return
	}
	if errors.Is(err, storage.ErrSiteHasUnits) {
		respondError(w, "Cannot delete site with assigned units. Reassign or delete units first.", http.StatusConflict)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("site_id", siteID).Msg("handler: failed to delete site")
		respondError(w, "Failed to delete site", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("site_id", siteID).
		Msg("Site deleted")

	w.WriteHeader(http.StatusNoContent)
}

// isValidTimezone checks if the given timezone string is valid.
// Uses Go's time package to validate against the system's IANA timezone database.
func isValidTimezone(tz string) bool {
	if tz == "" {
		return false
	}
	_, err := time.LoadLocation(tz)
	return err == nil
}
