package handlers

import (
	"bufio"
	"bytes"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestStreamHandlerMissingUnitID tests that Stream handler returns 400 for missing unit ID
func TestStreamHandlerMissingUnitID(t *testing.T) {
	// The Stream handler expects chi.URLParam to provide the unit ID
	// When testing without the chi router, we test the validation logic
	req := httptest.NewRequest("GET", "/ws/stream/", nil)
	w := httptest.NewRecorder()

	// Note: This tests the early validation path.
	// Full WebSocket tests require integration testing with a real chi router.
	// The unitID will be empty without chi context, triggering the BadRequest response.
	Stream(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "Unit ID is required")
}

// TestActiveStreamCountTracking tests the stream count tracking functions
func TestActiveStreamCountTracking(t *testing.T) {
	testUnitID := "test-unit-123"

	// Initially should be 0
	assert.Equal(t, 0, GetActiveStreamCount(testUnitID))

	// Simulate adding a stream
	streamsMu.Lock()
	activeStreams[testUnitID]++
	streamsMu.Unlock()

	assert.Equal(t, 1, GetActiveStreamCount(testUnitID))

	// Add another
	streamsMu.Lock()
	activeStreams[testUnitID]++
	streamsMu.Unlock()

	assert.Equal(t, 2, GetActiveStreamCount(testUnitID))

	// Remove one
	streamsMu.Lock()
	activeStreams[testUnitID]--
	streamsMu.Unlock()

	assert.Equal(t, 1, GetActiveStreamCount(testUnitID))

	// Remove last and cleanup
	streamsMu.Lock()
	activeStreams[testUnitID]--
	if activeStreams[testUnitID] <= 0 {
		delete(activeStreams, testUnitID)
	}
	streamsMu.Unlock()

	assert.Equal(t, 0, GetActiveStreamCount(testUnitID))
}

// TestMaxStreamsPerUnitLimit tests that the constant is set correctly
func TestMaxStreamsPerUnitLimit(t *testing.T) {
	// Verify max streams per unit is set to 2 as per architecture
	assert.Equal(t, 2, maxStreamsPerUnit)
}

// TestUpgraderConfiguration tests WebSocket upgrader settings
func TestUpgraderConfiguration(t *testing.T) {
	// Verify buffer sizes are appropriate for video streaming
	assert.Equal(t, 1024, upgrader.ReadBufferSize)
	assert.Equal(t, 1024*64, upgrader.WriteBufferSize) // 64KB for video frames

	// Without CORS_ALLOWED_ORIGINS, only localhost dev origins are allowed
	t.Setenv("CORS_ALLOWED_ORIGINS", "")

	req := httptest.NewRequest("GET", "/ws/stream/123", nil)
	req.Header.Set("Origin", "https://example.com")
	assert.False(t, upgrader.CheckOrigin(req), "non-localhost origin should be rejected by default")

	req.Header.Set("Origin", "http://localhost:5173")
	assert.True(t, upgrader.CheckOrigin(req), "localhost:5173 should be allowed by default")

	// With CORS_ALLOWED_ORIGINS set, configured origins are allowed
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://example.com,https://app.test.com")
	req.Header.Set("Origin", "https://example.com")
	assert.True(t, upgrader.CheckOrigin(req), "configured origin should be allowed")
}

// TestReadMJPEGFrameStartMarker tests JPEG start marker detection
func TestReadMJPEGFrameStartMarker(t *testing.T) {
	// This tests the frame parsing logic with mock data
	// JPEG files start with 0xFF 0xD8 and end with 0xFF 0xD9

	// Create a minimal valid JPEG frame (just markers, not a real image)
	// In real MJPEG, there would be boundary headers before this
	testData := []byte{
		0x00, 0x00, // Some garbage before
		0xFF, 0xD8, // JPEG start marker
		0xFF, 0xE0, 0x00, 0x10, // APP0 marker (example)
		0x4A, 0x46, 0x49, 0x46, // "JFIF"
		0x00, 0x01, 0x01, 0x00,
		0x00, 0x01, 0x00, 0x01,
		0x00, 0x00,
		0xFF, 0xD9, // JPEG end marker
	}

	reader := bufio.NewReader(bytes.NewReader(testData))
	frame, err := readMJPEGFrame(reader)

	assert.NoError(t, err)
	assert.NotEmpty(t, frame)

	// Frame should start with JPEG start marker
	assert.Equal(t, byte(0xFF), frame[0])
	assert.Equal(t, byte(0xD8), frame[1])

	// Frame should end with JPEG end marker
	assert.Equal(t, byte(0xFF), frame[len(frame)-2])
	assert.Equal(t, byte(0xD9), frame[len(frame)-1])
}

// TestReadMJPEGFrameEOF tests EOF handling
func TestReadMJPEGFrameEOF(t *testing.T) {
	// Empty reader should return EOF
	testData := []byte{}
	reader := bufio.NewReader(bytes.NewReader(testData))
	_, err := readMJPEGFrame(reader)

	assert.Error(t, err)
}

// TestReadMJPEGFrameIncompleteFrame tests handling of incomplete JPEG data
func TestReadMJPEGFrameIncompleteFrame(t *testing.T) {
	// Start marker found but no end marker before EOF
	testData := []byte{
		0xFF, 0xD8, // JPEG start marker
		0xFF, 0xE0, // Some data
		// Missing end marker - EOF
	}
	reader := bufio.NewReader(bytes.NewReader(testData))
	_, err := readMJPEGFrame(reader)

	assert.Error(t, err) // Should return EOF error
}

// TestIsPrivateIP tests the SSRF protection IP validation
func TestIsPrivateIP(t *testing.T) {
	tests := []struct {
		name     string
		ip       string
		expected bool
	}{
		// Private ranges should be blocked
		{"loopback_v4", "127.0.0.1", true},
		{"loopback_v4_other", "127.255.255.255", true},
		{"private_10_0_0_1", "10.0.0.1", true},
		{"private_10_255", "10.255.255.255", true},
		{"private_172_16", "172.16.0.1", true},
		{"private_172_31", "172.31.255.255", true},
		{"private_192_168", "192.168.1.1", true},
		{"private_192_168_2", "192.168.255.255", true},
		{"link_local", "169.254.1.1", true},
		{"loopback_v6", "::1", true},
		{"unique_local_v6", "fc00::1", true},
		{"unique_local_v6_fd", "fd00::1", true},
		{"link_local_v6", "fe80::1", true},

		// Public IPs should be allowed
		{"public_google_dns", "8.8.8.8", false},
		{"public_cloudflare", "1.1.1.1", false},
		{"public_random", "203.0.113.50", false},
		{"public_v6", "2001:4860:4860::8888", false},

		// Edge cases for private range boundaries
		{"just_outside_172_16", "172.15.255.255", false},
		{"just_outside_172_32", "172.32.0.0", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ip := net.ParseIP(tt.ip)
			result := isPrivateIP(ip)
			assert.Equal(t, tt.expected, result, "IP %s should be private=%v", tt.ip, tt.expected)
		})
	}
}

// TestValidateUnitIP tests the unit IP validation function
func TestValidateUnitIP(t *testing.T) {
	tests := []struct {
		name        string
		ip          string
		shouldError bool
	}{
		// Private/internal IPs should be rejected
		{"loopback", "127.0.0.1", true},
		{"private_10", "10.0.0.1", true},
		{"private_172", "172.16.0.1", true},
		{"private_192", "192.168.1.1", true},
		{"link_local", "169.254.1.1", true},
		{"localhost", "localhost", true}, // Resolves to 127.0.0.1

		// Public IPs should be allowed
		{"public_1", "8.8.8.8", false},
		{"public_2", "1.1.1.1", false},

		// Invalid IPs should error
		{"invalid_format", "not.an.ip", true},
		{"empty", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resolvedIP, err := ValidateUnitIP(tt.ip)
			if tt.shouldError {
				assert.Error(t, err, "IP %s should be rejected", tt.ip)
				assert.Empty(t, resolvedIP)
			} else {
				assert.NoError(t, err, "IP %s should be allowed", tt.ip)
				assert.NotEmpty(t, resolvedIP)
			}
		})
	}
}

// TestPrivateIPBlocksInitialized verifies the init() function ran correctly
func TestPrivateIPBlocksInitialized(t *testing.T) {
	// Should have at least 8 private IP blocks defined
	assert.GreaterOrEqual(t, len(privateIPBlocks), 8, "Should have at least 8 private IP blocks")
}
