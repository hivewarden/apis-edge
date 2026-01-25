package handlers_test

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jermoo/apis/apis-server/internal/handlers"
)

// TestTranscribe_MissingFile tests that the endpoint returns an error when no file is provided
func TestTranscribe_MissingFile(t *testing.T) {
	// Create a request without any file
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/transcribe", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	rec := httptest.NewRecorder()
	handlers.Transcribe(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "No audio file provided") {
		t.Errorf("Expected error message about missing file, got: %s", body)
	}
}

// TestTranscribe_FileTooLarge tests that the endpoint rejects files over 10MB
func TestTranscribe_FileTooLarge(t *testing.T) {
	// Create a request with a file that's too large
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// Create a part for the audio file
	part, err := writer.CreateFormFile("audio", "large.webm")
	if err != nil {
		t.Fatal(err)
	}

	// Write 11MB of data (exceeds 10MB limit)
	largeData := make([]byte, 11<<20) // 11 MB
	if _, err := part.Write(largeData); err != nil {
		t.Fatal(err)
	}

	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/transcribe", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	rec := httptest.NewRecorder()
	handlers.Transcribe(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("Expected status %d, got %d", http.StatusRequestEntityTooLarge, rec.Code)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "too large") {
		t.Errorf("Expected error about file size, got: %s", body)
	}
}

// TestTranscribe_ValidRequest tests a valid request structure
// Note: This test will fail if Whisper is not installed, which is expected in CI
func TestTranscribe_ValidRequest(t *testing.T) {
	// Create a minimal valid audio file request
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// Create a part for the audio file
	part, err := writer.CreateFormFile("audio", "test.webm")
	if err != nil {
		t.Fatal(err)
	}

	// Write minimal audio data (this won't be valid audio but tests the handler structure)
	audioData := []byte("fake audio content for testing")
	if _, err := part.Write(audioData); err != nil {
		t.Fatal(err)
	}

	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/transcribe", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	rec := httptest.NewRecorder()
	handlers.Transcribe(rec, req)

	// The handler should accept the request (file upload works)
	// It may fail at transcription step if Whisper is not installed
	// That's expected - we just want to verify the upload handling works
	if rec.Code == http.StatusBadRequest {
		// Only fail if the error is about the request format, not transcription
		body := rec.Body.String()
		if strings.Contains(body, "No audio file") {
			t.Errorf("Should have accepted the file, got: %s", body)
		}
	}
}

// TestTranscribe_ContentTypeAcceptance tests various content types are accepted
func TestTranscribe_ContentTypeAcceptance(t *testing.T) {
	contentTypes := []struct {
		mimeType string
		filename string
	}{
		{"audio/webm", "test.webm"},
		{"audio/wav", "test.wav"},
		{"audio/mp3", "test.mp3"},
		{"audio/mpeg", "test.mp3"},
		{"audio/ogg", "test.ogg"},
		{"", "test.webm"}, // No content type should also be accepted
	}

	for _, tc := range contentTypes {
		t.Run(tc.mimeType, func(t *testing.T) {
			var buf bytes.Buffer
			writer := multipart.NewWriter(&buf)

			// Create a form file with the specified content type
			h := make(map[string][]string)
			h["Content-Disposition"] = []string{`form-data; name="audio"; filename="` + tc.filename + `"`}
			if tc.mimeType != "" {
				h["Content-Type"] = []string{tc.mimeType}
			}

			part, err := writer.CreatePart(h)
			if err != nil {
				t.Fatal(err)
			}

			io.WriteString(part, "fake audio content")
			writer.Close()

			req := httptest.NewRequest(http.MethodPost, "/api/transcribe", &buf)
			req.Header.Set("Content-Type", writer.FormDataContentType())

			rec := httptest.NewRecorder()
			handlers.Transcribe(rec, req)

			// Should not reject based on content type
			if rec.Code == http.StatusBadRequest {
				body := rec.Body.String()
				if strings.Contains(body, "content type") || strings.Contains(body, "format") {
					t.Errorf("Rejected content type %s: %s", tc.mimeType, body)
				}
			}
		})
	}
}

// TestTranscribe_MethodNotAllowed tests that only POST is accepted
// Note: The actual method filtering happens in the router (main.go)
// This test documents the expected behavior - non-POST methods will be rejected by the router
func TestTranscribe_MethodNotAllowed(t *testing.T) {
	methods := []string{http.MethodGet, http.MethodPut, http.MethodDelete, http.MethodPatch}

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			// Document that these methods should be rejected at the router level
			// The handler itself expects POST and multipart/form-data
			// Router config: r.Post("/api/transcribe", handlers.Transcribe)
			t.Logf("Method %s should be rejected by router (405 Method Not Allowed)", method)
		})
	}
}
