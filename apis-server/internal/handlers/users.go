// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/rs/zerolog/log"

	"github.com/jermoo/apis/apis-server/internal/auth"
	"github.com/jermoo/apis/apis-server/internal/middleware"
	"github.com/jermoo/apis/apis-server/internal/storage"
)

// UserResponse represents a user in API responses.
type UserResponse struct {
	ID                 string  `json:"id"`
	Email              string  `json:"email"`
	DisplayName        string  `json:"display_name"`
	Role               string  `json:"role"`
	IsActive           bool    `json:"is_active"`
	MustChangePassword bool    `json:"must_change_password"`
	LastLoginAt        *string `json:"last_login_at,omitempty"`
	CreatedAt          string  `json:"created_at"`
}

// UsersListResponse represents the list users API response.
type UsersListResponse struct {
	Data []UserResponse `json:"data"`
	Meta MetaResponse   `json:"meta"`
}

// UserDataResponse represents a single user API response.
type UserDataResponse struct {
	Data UserResponse `json:"data"`
}

// CreateUserRequest represents the request body for creating a user.
type CreateUserRequest struct {
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`     // "admin" or "member"
	Password    string `json:"password"` // temporary password
}

// UpdateUserRequest represents the request body for updating a user.
type UpdateUserRequest struct {
	DisplayName *string `json:"display_name,omitempty"`
	Role        *string `json:"role,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
}

// ResetPasswordRequest represents the request body for resetting a user's password.
type ResetPasswordRequest struct {
	Password string `json:"password"`
}

// userToResponse converts a storage.User to a UserResponse.
func userToResponse(user *storage.User) UserResponse {
	resp := UserResponse{
		ID:                 user.ID,
		Email:              user.Email,
		DisplayName:        user.Name,
		Role:               user.Role,
		IsActive:           user.IsActive,
		MustChangePassword: user.MustChangePassword,
		CreatedAt:          user.CreatedAt.Format(time.RFC3339),
	}
	if user.LastLoginAt != nil {
		s := user.LastLoginAt.Format(time.RFC3339)
		resp.LastLoginAt = &s
	}
	return resp
}

// AdminOnly is middleware that checks if the authenticated user has the admin role.
// Returns 403 Forbidden if the user is not an admin.
func AdminOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := middleware.GetClaims(r.Context())
		if claims == nil {
			respondError(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		if claims.Role != "admin" {
			log.Debug().
				Str("user_id", claims.UserID).
				Str("role", claims.Role).
				Str("path", r.URL.Path).
				Msg("Admin access denied")
			respondError(w, "Admin access required", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// ListUsers handles GET /api/users - returns all users in the tenant.
// Admin only.
func ListUsers(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())

	users, err := storage.ListUsersByTenantFull(r.Context(), conn)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to list users")
		respondError(w, "Failed to list users", http.StatusInternalServerError)
		return
	}

	// Convert to response format
	userResponses := make([]UserResponse, 0, len(users))
	for _, user := range users {
		userResponses = append(userResponses, userToResponse(user))
	}

	respondJSON(w, UsersListResponse{
		Data: userResponses,
		Meta: MetaResponse{Total: len(userResponses)},
	}, http.StatusOK)
}

// GetUser handles GET /api/users/{id} - returns a specific user.
// Admin only.
//
// Note: This endpoint returns users regardless of is_active status, allowing
// admins to view details of soft-deleted (deactivated) users. This is by design
// to support admin workflows such as viewing user history and potentially
// reactivating users.
func GetUser(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	userID := chi.URLParam(r, "id")

	if userID == "" {
		respondError(w, "User ID is required", http.StatusBadRequest)
		return
	}

	user, err := storage.GetUserByIDFull(r.Context(), conn, userID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("handler: failed to get user")
		respondError(w, "Failed to get user", http.StatusInternalServerError)
		return
	}

	respondJSON(w, UserDataResponse{Data: userToResponse(user)}, http.StatusOK)
}

// CreateUser handles POST /api/users - creates a new user.
// Admin only. Sets must_change_password=true for the new user.
func CreateUser(w http.ResponseWriter, r *http.Request) {
	// Parse and validate request BEFORE accessing database
	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if strings.TrimSpace(req.Email) == "" {
		respondError(w, "Email is required", http.StatusBadRequest)
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	// Validate email format
	if _, err := mail.ParseAddress(req.Email); err != nil {
		respondError(w, "Invalid email format", http.StatusBadRequest)
		return
	}

	// Validate email max length (RFC 5321 specifies max 254 characters)
	if len(req.Email) > 254 {
		respondError(w, "Email must be 254 characters or less", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.DisplayName) == "" {
		respondError(w, "Display name is required", http.StatusBadRequest)
		return
	}
	req.DisplayName = strings.TrimSpace(req.DisplayName)

	// Validate display name max length (consistent with setup wizard)
	if len(req.DisplayName) > 100 {
		respondError(w, "Display name must be 100 characters or less", http.StatusBadRequest)
		return
	}

	// Validate role
	if req.Role == "" {
		req.Role = "member" // default
	}
	if req.Role != "admin" && req.Role != "member" {
		respondError(w, "Role must be 'admin' or 'member'", http.StatusBadRequest)
		return
	}

	// Validate password strength (length + common password check)
	if err := auth.ValidatePasswordStrength(req.Password); err != nil {
		// User-friendly error message (strip "auth: " prefix)
		respondError(w, strings.TrimPrefix(err.Error(), "auth: "), http.StatusBadRequest)
		return
	}

	// Now get database connection and other context
	conn := storage.RequireConn(r.Context())
	claims := middleware.GetClaims(r.Context())
	tenantID := middleware.GetTenantID(r.Context())

	// Check user limit before proceeding
	if err := storage.CheckUserLimit(r.Context(), conn, tenantID); err != nil {
		if errors.Is(err, storage.ErrLimitExceeded) {
			respondError(w, "User limit reached. Contact your administrator to increase your quota.", http.StatusForbidden)
			return
		}
		log.Error().Err(err).Str("tenant_id", tenantID).Msg("handler: failed to check user limit")
		respondError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	// Hash the password
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to hash password")
		respondError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	// Create the user
	input := &storage.CreateLocalUserInput{
		TenantID:     tenantID,
		Email:        req.Email,
		DisplayName:  req.DisplayName,
		PasswordHash: passwordHash,
		Role:         req.Role,
	}

	user, err := storage.CreateLocalUserWithMustChange(r.Context(), conn, input, claims.UserID)
	if err != nil {
		// Check for unique constraint violation (email already exists)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			respondError(w, "Email already exists", http.StatusConflict)
			return
		}
		log.Error().Err(err).Str("email", req.Email).Msg("handler: failed to create user")
		respondError(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("user_id", user.ID).
		Str("email", user.Email).
		Str("role", user.Role).
		Str("created_by", claims.UserID).
		Msg("User created by admin")

	// Audit log: record user creation (password_hash is automatically masked by audit service)
	AuditCreate(r.Context(), "users", user.ID, user)

	respondJSON(w, UserDataResponse{Data: userToResponse(user)}, http.StatusCreated)
}

// UpdateUser handles PUT /api/users/{id} - updates a user.
// Admin only. Cannot demote self or deactivate last admin.
func UpdateUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")

	if userID == "" {
		respondError(w, "User ID is required", http.StatusBadRequest)
		return
	}

	// Parse and validate request BEFORE accessing database
	var req UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate role if provided
	if req.Role != nil && *req.Role != "admin" && *req.Role != "member" {
		respondError(w, "Role must be 'admin' or 'member'", http.StatusBadRequest)
		return
	}

	// Validate display name if provided (must validate BEFORE database access)
	if req.DisplayName != nil {
		trimmed := strings.TrimSpace(*req.DisplayName)
		if trimmed == "" {
			respondError(w, "Display name cannot be empty", http.StatusBadRequest)
			return
		}
		if len(trimmed) > 100 {
			respondError(w, "Display name must be 100 characters or less", http.StatusBadRequest)
			return
		}
		// Store trimmed value back for later use
		req.DisplayName = &trimmed
	}

	// Now get database connection and other context
	conn := storage.RequireConn(r.Context())
	claims := middleware.GetClaims(r.Context())

	// Get current user to check constraints
	currentUser, err := storage.GetUserByIDFull(r.Context(), conn, userID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("handler: failed to get user for update")
		respondError(w, "Failed to update user", http.StatusInternalServerError)
		return
	}

	// Check self-demotion: cannot change own role from admin to member
	if claims.UserID == userID && req.Role != nil && *req.Role != "admin" && currentUser.Role == "admin" {
		respondError(w, "Cannot demote yourself", http.StatusBadRequest)
		return
	}

	// Check self-deactivation: cannot deactivate yourself
	if claims.UserID == userID && req.IsActive != nil && !*req.IsActive {
		respondError(w, "Cannot deactivate yourself", http.StatusBadRequest)
		return
	}

	// Check last admin constraint: cannot demote or deactivate the last admin
	if currentUser.Role == "admin" && currentUser.IsActive {
		// If trying to demote from admin or deactivate
		willDemote := req.Role != nil && *req.Role != "admin"
		willDeactivate := req.IsActive != nil && !*req.IsActive

		if willDemote || willDeactivate {
			// Count active admins
			adminCount, err := storage.CountAdminUsers(r.Context(), conn)
			if err != nil {
				log.Error().Err(err).Msg("handler: failed to count admin users")
				respondError(w, "Failed to update user", http.StatusInternalServerError)
				return
			}

			if adminCount <= 1 {
				respondError(w, "Cannot remove the last admin", http.StatusBadRequest)
				return
			}
		}
	}

	// Build update input (display name already validated and trimmed above)
	input := &storage.UpdateUserInput{}
	if req.DisplayName != nil {
		input.DisplayName = req.DisplayName
	}
	if req.Role != nil {
		input.Role = req.Role
	}
	if req.IsActive != nil {
		input.IsActive = req.IsActive
	}

	user, err := storage.UpdateUser(r.Context(), conn, userID, input)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("handler: failed to update user")
		respondError(w, "Failed to update user", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("user_id", user.ID).
		Str("email", user.Email).
		Str("updated_by", claims.UserID).
		Msg("User updated by admin")

	// Audit log: record user update (password_hash is automatically masked by audit service)
	AuditUpdate(r.Context(), "users", user.ID, currentUser, user)

	respondJSON(w, UserDataResponse{Data: userToResponse(user)}, http.StatusOK)
}

// DeleteUser handles DELETE /api/users/{id} - soft deletes a user.
// Admin only. Cannot delete self or last admin.
func DeleteUser(w http.ResponseWriter, r *http.Request) {
	conn := storage.RequireConn(r.Context())
	claims := middleware.GetClaims(r.Context())
	userID := chi.URLParam(r, "id")

	if userID == "" {
		respondError(w, "User ID is required", http.StatusBadRequest)
		return
	}

	// Cannot delete self
	if claims.UserID == userID {
		respondError(w, "Cannot delete yourself", http.StatusBadRequest)
		return
	}

	// Get user to check constraints
	user, err := storage.GetUserByIDFull(r.Context(), conn, userID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("handler: failed to get user for delete")
		respondError(w, "Failed to delete user", http.StatusInternalServerError)
		return
	}

	// Check last admin constraint
	if user.Role == "admin" && user.IsActive {
		adminCount, err := storage.CountAdminUsers(r.Context(), conn)
		if err != nil {
			log.Error().Err(err).Msg("handler: failed to count admin users")
			respondError(w, "Failed to delete user", http.StatusInternalServerError)
			return
		}

		if adminCount <= 1 {
			respondError(w, "Cannot delete the last admin", http.StatusBadRequest)
			return
		}
	}

	// Soft delete (set is_active=false)
	err = storage.SoftDeleteUser(r.Context(), conn, userID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("handler: failed to delete user")
		respondError(w, "Failed to delete user", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("user_id", userID).
		Str("email", user.Email).
		Str("deleted_by", claims.UserID).
		Msg("User soft deleted by admin")

	// Audit log: record user deletion (password_hash is automatically masked by audit service)
	AuditDelete(r.Context(), "users", userID, user)

	w.WriteHeader(http.StatusNoContent)
}

// ResetPassword handles POST /api/users/{id}/reset-password - resets a user's password.
// Admin only. Sets must_change_password=true.
func ResetPassword(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")

	if userID == "" {
		respondError(w, "User ID is required", http.StatusBadRequest)
		return
	}

	// Parse and validate request BEFORE accessing database
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate password strength (length + common password check)
	if err := auth.ValidatePasswordStrength(req.Password); err != nil {
		// User-friendly error message (strip "auth: " prefix)
		respondError(w, strings.TrimPrefix(err.Error(), "auth: "), http.StatusBadRequest)
		return
	}

	// Now get database connection and other context
	conn := storage.RequireConn(r.Context())
	claims := middleware.GetClaims(r.Context())

	// Verify user exists
	user, err := storage.GetUserByIDFull(r.Context(), conn, userID)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("handler: failed to get user for password reset")
		respondError(w, "Failed to reset password", http.StatusInternalServerError)
		return
	}

	// Hash the new password
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		log.Error().Err(err).Msg("handler: failed to hash password for reset")
		respondError(w, "Failed to reset password", http.StatusInternalServerError)
		return
	}

	// Update the password with must_change_password=true
	err = storage.SetUserPassword(r.Context(), conn, userID, passwordHash, true)
	if errors.Is(err, storage.ErrNotFound) {
		respondError(w, "User not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("handler: failed to set user password")
		respondError(w, "Failed to reset password", http.StatusInternalServerError)
		return
	}

	log.Info().
		Str("user_id", userID).
		Str("email", user.Email).
		Str("reset_by", claims.UserID).
		Msg("User password reset by admin")

	respondJSON(w, map[string]string{
		"message": "Password reset successfully. User must change password at next login.",
	}, http.StatusOK)
}
