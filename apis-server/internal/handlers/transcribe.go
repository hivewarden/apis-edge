package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

// Maximum upload size for audio files (10 MB)
const maxTranscribeUploadSize = 10 << 20

// TranscribeResponse represents the JSON response from transcription
type TranscribeResponse struct {
	Text     string  `json:"text"`
	Language string  `json:"language,omitempty"`
	Duration float64 `json:"duration,omitempty"`
}

// Transcribe handles POST /api/transcribe
// Accepts audio file upload and returns transcribed text using Whisper
//
// Request:
//   - Method: POST
//   - Content-Type: multipart/form-data
//   - Body: audio file in 'audio' field
//   - Supported formats: WebM, WAV, MP3, OGG
//   - Max size: 10MB
//
// Response:
//
//	{
//	  "data": {
//	    "text": "transcribed text here",
//	    "language": "en",
//	    "duration": 5.2
//	  }
//	}
//
// Errors:
//   - 400: Invalid request (missing file, wrong format)
//   - 413: File too large
//   - 429: Rate limit exceeded (10 requests/minute)
//   - 500: Transcription failed
//   - 503: Whisper service unavailable
func Transcribe(w http.ResponseWriter, r *http.Request) {
	// Limit upload size
	r.Body = http.MaxBytesReader(w, r.Body, maxTranscribeUploadSize)

	// Parse multipart form
	if err := r.ParseMultipartForm(maxTranscribeUploadSize); err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			respondError(w, "File too large (max 10MB)", http.StatusRequestEntityTooLarge)
			return
		}
		log.Error().Err(err).Msg("Failed to parse multipart form")
		respondError(w, "Invalid request format", http.StatusBadRequest)
		return
	}

	// Get audio file from form
	file, header, err := r.FormFile("audio")
	if err != nil {
		log.Error().Err(err).Msg("No audio file in request")
		respondError(w, "No audio file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Validate content type (be permissive - browsers can be inconsistent)
	contentType := header.Header.Get("Content-Type")
	validTypes := map[string]bool{
		"audio/webm":       true,
		"audio/wav":        true,
		"audio/x-wav":      true,
		"audio/wave":       true,
		"audio/mp3":        true,
		"audio/mpeg":       true,
		"audio/ogg":        true,
		"audio/mp4":        true,
		"audio/x-m4a":      true,
		"application/ogg":  true,
		"":                 true, // Allow missing content-type (browsers sometimes omit it)
	}

	if !validTypes[contentType] {
		// Log but don't reject - try to process anyway
		log.Warn().
			Str("content_type", contentType).
			Str("filename", header.Filename).
			Msg("Unusual audio content type, attempting to process")
	}

	// Create temp file for audio
	// Use extension from original filename if available
	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".webm"
	}
	tempFile, err := os.CreateTemp("", "transcribe-*"+ext)
	if err != nil {
		log.Error().Err(err).Msg("Failed to create temp file for audio")
		respondError(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	tempPath := tempFile.Name()

	// cleanupTempFile is a helper to ensure temp file is removed on all paths
	cleanupTempFile := func() {
		os.Remove(tempPath)
	}
	defer cleanupTempFile()

	// Write uploaded file to temp location
	if _, err := io.Copy(tempFile, file); err != nil {
		tempFile.Close()
		log.Error().Err(err).Msg("Failed to save audio file")
		respondError(w, "Failed to process audio", http.StatusInternalServerError)
		return
	}
	if err := tempFile.Close(); err != nil {
		log.Error().Err(err).Msg("Failed to close temp file")
		respondError(w, "Failed to process audio", http.StatusInternalServerError)
		return
	}

	// Run Whisper transcription
	text, err := transcribeWithWhisper(tempPath)
	if err != nil {
		log.Error().Err(err).Str("audio_path", tempPath).Msg("Whisper transcription failed")

		// Check if Whisper is not available
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "executable") {
			respondError(w, "Transcription service unavailable", http.StatusServiceUnavailable)
			return
		}

		respondError(w, "Transcription failed", http.StatusInternalServerError)
		return
	}

	// Build response
	response := TranscribeResponse{
		Text: strings.TrimSpace(text),
	}

	// Log successful transcription
	log.Info().
		Int("text_length", len(response.Text)).
		Str("content_type", contentType).
		Msg("Audio transcription completed")

	// Send response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"data": response,
	})
}

// transcribeWithWhisper runs Whisper transcription on an audio file
//
// Supports two modes:
// 1. Local whisper.cpp CLI (default) - requires whisper binary and model
// 2. OpenAI Whisper API - requires OPENAI_API_KEY env var
//
// Environment variables:
//   - WHISPER_PATH: Path to whisper CLI binary (default: "whisper" in PATH)
//   - WHISPER_MODEL: Path to model file (default: /opt/whisper/models/ggml-base.en.bin)
//   - OPENAI_API_KEY: If set, uses OpenAI Whisper API instead of local
func transcribeWithWhisper(audioPath string) (string, error) {
	// Check for OpenAI API mode
	if apiKey := os.Getenv("OPENAI_API_KEY"); apiKey != "" {
		return transcribeWithOpenAI(audioPath, apiKey)
	}

	// Local whisper.cpp mode
	return transcribeWithWhisperCpp(audioPath)
}

// transcribeWithWhisperCpp uses the local whisper.cpp CLI
func transcribeWithWhisperCpp(audioPath string) (string, error) {
	// Get whisper binary path
	whisperPath := os.Getenv("WHISPER_PATH")
	if whisperPath == "" {
		whisperPath = "whisper" // Assume in PATH
	}

	// Get model path
	modelPath := os.Getenv("WHISPER_MODEL")
	if modelPath == "" {
		modelPath = "/opt/whisper/models/ggml-base.en.bin"
	}

	// Check if model exists
	if _, err := os.Stat(modelPath); os.IsNotExist(err) {
		// Try alternative common locations
		alternativePaths := []string{
			"/usr/local/share/whisper/models/ggml-base.en.bin",
			"/usr/share/whisper/models/ggml-base.en.bin",
			filepath.Join(os.Getenv("HOME"), ".whisper", "models", "ggml-base.en.bin"),
		}
		found := false
		for _, p := range alternativePaths {
			if _, err := os.Stat(p); err == nil {
				modelPath = p
				found = true
				break
			}
		}
		if !found {
			log.Warn().Str("model_path", modelPath).Msg("Whisper model not found")
			return "", exec.ErrNotFound
		}
	}

	// Convert audio to WAV format (whisper.cpp works best with WAV)
	// whisper.cpp requires 16kHz mono WAV
	wavPath := audioPath + ".wav"
	defer os.Remove(wavPath)

	// Use ffmpeg for conversion
	ffmpegCmd := exec.Command("ffmpeg",
		"-i", audioPath,
		"-ar", "16000", // 16kHz sample rate
		"-ac", "1", // Mono
		"-y", // Overwrite
		wavPath,
	)
	if output, err := ffmpegCmd.CombinedOutput(); err != nil {
		log.Error().Err(err).Str("output", string(output)).Msg("ffmpeg conversion failed")
		return "", err
	}

	// Run whisper.cpp
	// -nt flag: no timestamps in output
	// -np flag: no progress output
	cmd := exec.Command(whisperPath, "-m", modelPath, "-f", wavPath, "-nt", "-np")

	// Set timeout (30 seconds should be plenty for up to 60s audio)
	type result struct {
		output []byte
		err    error
	}
	done := make(chan result, 1)
	go func() {
		output, err := cmd.Output()
		done <- result{output: output, err: err}
	}()

	select {
	case res := <-done:
		if res.err != nil {
			return "", res.err
		}
		// Output contains the transcription
		log.Debug().Str("output", string(res.output)).Msg("Whisper raw output")
		return string(res.output), nil
	case <-time.After(30 * time.Second):
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		return "", os.ErrDeadlineExceeded
	}
}

// transcribeWithOpenAI uses the OpenAI Whisper API
func transcribeWithOpenAI(audioPath string, apiKey string) (string, error) {
	// Open audio file
	file, err := os.Open(audioPath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	// Create multipart request
	// This is a simplified version - in production you'd use a proper HTTP client
	// For now, we'll use curl as it handles multipart properly

	cmd := exec.Command("curl",
		"-s", // Silent
		"https://api.openai.com/v1/audio/transcriptions",
		"-H", "Authorization: Bearer "+apiKey,
		"-F", "file=@"+audioPath,
		"-F", "model=whisper-1",
		"-F", "response_format=text",
	)

	output, err := cmd.Output()
	if err != nil {
		log.Error().Err(err).Msg("OpenAI Whisper API call failed")
		return "", err
	}

	return string(output), nil
}
