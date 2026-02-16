// Package handlers provides HTTP request handlers for the APIS server.
package handlers

// MetaResponse contains pagination metadata for list API responses.
type MetaResponse struct {
	Total      int `json:"total"`
	Page       int `json:"page,omitempty"`
	PerPage    int `json:"per_page,omitempty"`
	TotalPages int `json:"total_pages,omitempty"`
}
