// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/rs/zerolog/log"
)

// ErrorCode represents a standardized error code for client responses.
type ErrorCode string

const (
	// ErrCodeValidation indicates a validation error in request data.
	ErrCodeValidation ErrorCode = "validation_error"

	// ErrCodeNotFound indicates the requested resource was not found.
	ErrCodeNotFound ErrorCode = "not_found"

	// ErrCodeUnauthorized indicates authentication is required.
	ErrCodeUnauthorized ErrorCode = "unauthorized"

	// ErrCodeForbidden indicates the user lacks permission for the action.
	ErrCodeForbidden ErrorCode = "forbidden"

	// ErrCodeConflict indicates the request conflicts with current state.
	ErrCodeConflict ErrorCode = "conflict"

	// ErrCodeRateLimit indicates too many requests.
	ErrCodeRateLimit ErrorCode = "rate_limit_exceeded"

	// ErrCodeAccountLocked indicates the account is temporarily locked.
	ErrCodeAccountLocked ErrorCode = "account_locked"

	// ErrCodeInternal indicates an internal server error.
	ErrCodeInternal ErrorCode = "internal_error"
)

// GenericErrorMessages maps error codes to safe, generic messages.
// These messages are safe to return to clients without leaking implementation details.
var GenericErrorMessages = map[ErrorCode]string{
	ErrCodeValidation:   "Invalid request data",
	ErrCodeNotFound:     "Resource not found",
	ErrCodeUnauthorized: "Authentication required",
	ErrCodeForbidden:    "Access denied",
	ErrCodeConflict:     "Request conflicts with current state",
	ErrCodeRateLimit:    "Too many requests",
	ErrCodeAccountLocked: "Account temporarily locked",
	ErrCodeInternal:     "An error occurred processing your request",
}

// sensitivePatterns contains strings that should not appear in error messages.
// These patterns help identify errors that may leak implementation details.
var sensitivePatterns = []string{
	"sql:",
	"pq:",
	"pgx:",
	"postgres",
	"connection refused",
	"no rows",
	"duplicate key",
	"violates unique constraint",
	"violates foreign key",
	"violates check constraint",
	"nil pointer",
	"runtime error",
	"panic",
	"stack trace",
	"goroutine",
	"internal error",
	"unexpected",
	"/home/",
	"/Users/",
	"/var/",
	".go:",
	"line ",
	"column ",
	"at character",
}

// isProduction returns true if the server is running in production mode.
// In production, error messages are sanitized; in development, they may include more details.
func isProduction() bool {
	env := os.Getenv("APIS_ENV")
	return env == "production" || env == "prod"
}

// SanitizeError transforms an error into a safe message suitable for client responses.
// It logs the original error for debugging while returning a generic message to clients.
//
// Parameters:
//   - err: The original error (logged but not exposed to clients)
//   - msg: The client-facing error message (used if it passes sanitization)
//   - code: The error code category
//
// Returns a sanitized error message that is safe to return to clients.
func SanitizeError(err error, msg string, code ErrorCode) string {
	// In production, always use generic messages
	if isProduction() {
		return GenericErrorMessages[code]
	}

	// In development, check if the message contains sensitive patterns
	msgLower := strings.ToLower(msg)
	for _, pattern := range sensitivePatterns {
		if strings.Contains(msgLower, strings.ToLower(pattern)) {
			// Log the sensitive message but return generic
			log.Debug().
				Str("original_message", msg).
				Str("matched_pattern", pattern).
				Msg("Error message contained sensitive pattern, using generic message")
			return GenericErrorMessages[code]
		}
	}

	// Also check the error itself if provided
	if err != nil {
		errLower := strings.ToLower(err.Error())
		for _, pattern := range sensitivePatterns {
			if strings.Contains(errLower, strings.ToLower(pattern)) {
				log.Debug().
					Err(err).
					Str("matched_pattern", pattern).
					Msg("Error contained sensitive pattern, using generic message")
				return GenericErrorMessages[code]
			}
		}
	}

	// Message appears safe to return
	return msg
}

// RespondSanitizedError sends a JSON error response with a sanitized message.
// It logs the internal error details while returning only safe information to clients.
//
// This should be used instead of respondError when handling errors that may
// contain sensitive implementation details.
func RespondSanitizedError(w http.ResponseWriter, err error, msg string, code ErrorCode, httpStatus int) {
	// Log the full error details for debugging
	if err != nil {
		log.Error().
			Err(err).
			Str("client_message", msg).
			Str("error_code", string(code)).
			Int("http_status", httpStatus).
			Msg("handler error")
	}

	// Return sanitized message to client
	safeMsg := SanitizeError(err, msg, code)
	respondError(w, safeMsg, httpStatus)
}

// RespondValidationError sends a 400 Bad Request with a sanitized validation error.
func RespondValidationError(w http.ResponseWriter, msg string) {
	respondError(w, SanitizeError(nil, msg, ErrCodeValidation), http.StatusBadRequest)
}

// RespondNotFoundError sends a 404 Not Found with a safe message.
func RespondNotFoundError(w http.ResponseWriter, resource string) {
	// Construct a safe "not found" message
	msg := resource + " not found"
	respondError(w, SanitizeError(nil, msg, ErrCodeNotFound), http.StatusNotFound)
}

// RespondInternalError sends a 500 Internal Server Error with a sanitized message.
// The actual error is logged but not exposed to clients.
func RespondInternalError(w http.ResponseWriter, err error, context string) {
	// Always log the full error
	log.Error().Err(err).Str("context", context).Msg("internal server error")

	// Always return generic message for internal errors
	respondError(w, GenericErrorMessages[ErrCodeInternal], http.StatusInternalServerError)
}

// RespondUnauthorizedError sends a 401 Unauthorized with a safe message.
func RespondUnauthorizedError(w http.ResponseWriter) {
	respondError(w, GenericErrorMessages[ErrCodeUnauthorized], http.StatusUnauthorized)
}

// RespondForbiddenError sends a 403 Forbidden with a safe message.
// This uses a generic "Access denied" to prevent information leakage about
// why access was denied (e.g., role enumeration).
func RespondForbiddenError(w http.ResponseWriter) {
	respondError(w, GenericErrorMessages[ErrCodeForbidden], http.StatusForbidden)
}

// RespondAccountLockedError sends a 429 Too Many Requests with lockout info.
// The lockout duration is included to inform the user when they can retry.
func RespondAccountLockedError(w http.ResponseWriter, retryAfterSeconds int) {
	w.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds))
	respondError(w, "Account temporarily locked due to too many failed attempts", http.StatusTooManyRequests)
}
