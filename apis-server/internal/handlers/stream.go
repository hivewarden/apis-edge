// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/jermoo/apis/apis-server/internal/storage"
	"github.com/rs/zerolog/log"
)

// Stream concurrency limits per unit
const maxStreamsPerUnit = 2

var (
	activeStreams = make(map[string]int)
	streamsMu     sync.Mutex
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024 * 64, // 64KB for video frames
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // Non-browser clients don't send Origin
		}
		// Validate against configured CORS origins
		allowedOrigins := os.Getenv("CORS_ALLOWED_ORIGINS")
		if allowedOrigins == "" {
			// Default dev origins
			return origin == "http://localhost:5173" || origin == "http://localhost:3000"
		}
		for _, allowed := range strings.Split(allowedOrigins, ",") {
			if strings.TrimSpace(allowed) == origin {
				return true
			}
		}
		return false
	},
}

// privateIPBlocks contains CIDR ranges for private/internal networks.
// These are blocked to prevent SSRF attacks to internal services.
var privateIPBlocks []*net.IPNet

func init() {
	// Initialize private IP blocks on package load
	privateRanges := []string{
		"127.0.0.0/8",    // IPv4 loopback
		"10.0.0.0/8",     // RFC 1918 Class A private
		"172.16.0.0/12",  // RFC 1918 Class B private
		"192.168.0.0/16", // RFC 1918 Class C private
		"169.254.0.0/16", // Link-local (APIPA)
		"::1/128",        // IPv6 loopback
		"fc00::/7",       // IPv6 unique local
		"fe80::/10",      // IPv6 link-local
	}

	for _, cidr := range privateRanges {
		_, block, err := net.ParseCIDR(cidr)
		if err == nil {
			privateIPBlocks = append(privateIPBlocks, block)
		}
	}
}

// isPrivateIP checks if an IP address belongs to a private/internal network.
// Returns true if the IP is private, loopback, link-local, or otherwise internal.
func isPrivateIP(ip net.IP) bool {
	if ip == nil {
		return true // Treat nil as private (fail-safe)
	}

	// Check loopback explicitly
	if ip.IsLoopback() {
		return true
	}

	// Check link-local
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}

	// Check against private CIDR blocks
	for _, block := range privateIPBlocks {
		if block.Contains(ip) {
			return true
		}
	}

	return false
}

// ValidateUnitIP validates that a unit's IP address is safe for HTTP requests.
// Returns the resolved IP string and an error if the IP is private, loopback, or otherwise internal.
// The returned IP should be used for the actual connection to prevent DNS rebinding attacks.
func ValidateUnitIP(ipStr string) (string, error) {
	// Parse the IP address (handles both IPv4 and IPv6)
	ip := net.ParseIP(ipStr)
	if ip == nil {
		// Could be a hostname - try to resolve it
		ips, err := net.LookupIP(ipStr)
		if err != nil || len(ips) == 0 {
			return "", fmt.Errorf("invalid IP address or hostname: %s", ipStr)
		}
		// Check all resolved IPs - if any is private, reject
		for _, resolvedIP := range ips {
			if isPrivateIP(resolvedIP) {
				return "", fmt.Errorf("unit IP resolves to private/internal network")
			}
		}
		// Return the first resolved IP to prevent DNS rebinding
		return ips[0].String(), nil
	}

	if isPrivateIP(ip) {
		return "", fmt.Errorf("unit IP is in a private/internal network range")
	}

	return ip.String(), nil
}

// Stream handles WebSocket video proxy from unit to dashboard.
// Route: GET /ws/stream/{id}
//
// The handler:
// 1. Validates the unit exists and is online
// 2. Upgrades the HTTP connection to WebSocket
// 3. Connects to the unit's MJPEG stream
// 4. Relays JPEG frames to the WebSocket client
//
// Part of Epic 2, Story 2.5: Live Video WebSocket Proxy
func Stream(w http.ResponseWriter, r *http.Request) {
	unitID := chi.URLParam(r, "id")
	if unitID == "" {
		http.Error(w, "Unit ID is required", http.StatusBadRequest)
		return
	}

	conn := storage.RequireConn(r.Context())

	// Get unit and verify it's online
	unit, err := storage.GetUnitByID(r.Context(), conn, unitID)
	if errors.Is(err, storage.ErrNotFound) {
		http.Error(w, "Unit not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Error().Err(err).Str("unit_id", unitID).Msg("handler: failed to get unit for stream")
		http.Error(w, "Failed to get unit", http.StatusInternalServerError)
		return
	}

	if unit.Status != "online" {
		http.Error(w, "Unit is offline", http.StatusServiceUnavailable)
		return
	}

	if unit.IPAddress == nil || *unit.IPAddress == "" {
		http.Error(w, "Unit IP address unknown", http.StatusServiceUnavailable)
		return
	}

	// Security: Validate unit IP is not a private/internal address (SSRF protection)
	// Use the resolved IP for the actual connection to prevent DNS rebinding
	resolvedIP, err := ValidateUnitIP(*unit.IPAddress)
	if err != nil {
		log.Warn().
			Str("unit_id", unitID).
			Str("ip_address", *unit.IPAddress).
			Err(err).
			Msg("handler: unit IP validation failed - possible SSRF attempt")
		http.Error(w, "Unit IP address is not valid for streaming", http.StatusBadRequest)
		return
	}

	// Check concurrent stream limit
	streamsMu.Lock()
	if activeStreams[unitID] >= maxStreamsPerUnit {
		streamsMu.Unlock()
		http.Error(w, "Max streams reached for this unit", http.StatusTooManyRequests)
		return
	}
	activeStreams[unitID]++
	streamsMu.Unlock()

	defer func() {
		streamsMu.Lock()
		activeStreams[unitID]--
		if activeStreams[unitID] <= 0 {
			delete(activeStreams, unitID)
		}
		streamsMu.Unlock()
	}()

	// Upgrade to WebSocket
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Str("unit_id", unitID).Msg("handler: failed to upgrade to websocket")
		return // Upgrade handles error response
	}
	defer ws.Close()

	log.Debug().
		Str("unit_id", unitID).
		Str("serial", unit.Serial).
		Str("ip_address", *unit.IPAddress).
		Msg("WebSocket stream started")

	// Connect to unit's MJPEG endpoint
	// No timeout for MJPEG streaming - it's a continuous stream
	unitURL := fmt.Sprintf("http://%s:8080/stream", resolvedIP)
	client := &http.Client{
		Timeout: 0, // No timeout for streaming
	}

	req, err := http.NewRequestWithContext(r.Context(), "GET", unitURL, nil)
	if err != nil {
		log.Error().Err(err).Str("unit_id", unitID).Msg("handler: failed to create request to unit")
		ws.WriteMessage(websocket.TextMessage, []byte("Failed to connect to unit"))
		return
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Error().Err(err).Str("event", "stream_connection_failed").Str("unit_id", unitID).Str("url", unitURL).Msg("handler: failed to connect to unit stream")
		ws.WriteMessage(websocket.TextMessage, []byte("Connection to unit failed"))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Error().Int("status", resp.StatusCode).Str("unit_id", unitID).Msg("handler: unit stream returned error")
		ws.WriteMessage(websocket.TextMessage, []byte("Unit stream unavailable"))
		return
	}

	log.Debug().
		Str("unit_id", unitID).
		Str("content_type", resp.Header.Get("Content-Type")).
		Msg("Connected to unit MJPEG stream")

	// Relay MJPEG frames to WebSocket
	reader := bufio.NewReader(resp.Body)
	for {
		frame, err := readMJPEGFrame(reader)
		if err != nil {
			if err == io.EOF {
				log.Debug().Str("unit_id", unitID).Msg("Unit stream ended")
			} else {
				log.Debug().Err(err).Str("unit_id", unitID).Msg("Error reading MJPEG frame")
			}
			break
		}

		if err := ws.WriteMessage(websocket.BinaryMessage, frame); err != nil {
			log.Debug().Err(err).Str("unit_id", unitID).Msg("Error writing to websocket")
			break
		}
	}

	log.Debug().Str("unit_id", unitID).Msg("WebSocket stream ended")
}

// readMJPEGFrame reads a single JPEG frame from an MJPEG stream.
// MJPEG format:
//
//	--boundary\r\n
//	Content-Type: image/jpeg\r\n
//	Content-Length: XXXX\r\n
//	\r\n
//	[JPEG binary data]
//
// This function looks for JPEG markers (FFD8 start, FFD9 end) to extract frames.
func readMJPEGFrame(reader *bufio.Reader) ([]byte, error) {
	// Find JPEG start marker (0xFF 0xD8)
	for {
		b, err := reader.ReadByte()
		if err != nil {
			return nil, err
		}
		if b == 0xFF {
			next, err := reader.ReadByte()
			if err != nil {
				return nil, err
			}
			if next == 0xD8 {
				// Found JPEG start
				break
			}
		}
	}

	// Start building frame with JPEG marker
	var frame bytes.Buffer
	frame.WriteByte(0xFF)
	frame.WriteByte(0xD8)

	// Read until JPEG end marker (0xFF 0xD9)
	// Cap frame size at 5MB to prevent memory exhaustion from malicious streams
	const maxFrameSize = 5 * 1024 * 1024
	prevByte := byte(0)
	for {
		b, err := reader.ReadByte()
		if err != nil {
			return nil, err
		}
		frame.WriteByte(b)
		if frame.Len() > maxFrameSize {
			return nil, errors.New("MJPEG frame too large")
		}

		// Check for end marker
		if prevByte == 0xFF && b == 0xD9 {
			break
		}
		prevByte = b
	}

	return frame.Bytes(), nil
}

// GetActiveStreamCount returns the number of active streams for a unit.
// Useful for testing and monitoring.
func GetActiveStreamCount(unitID string) int {
	streamsMu.Lock()
	defer streamsMu.Unlock()
	return activeStreams[unitID]
}
