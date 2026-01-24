// Package handlers provides HTTP request handlers for the APIS server.
package handlers

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
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
		// Allow all origins - auth is handled by JWT middleware
		return true
	},
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
	unitURL := fmt.Sprintf("http://%s:8080/stream", *unit.IPAddress)
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
		log.Error().Err(err).Str("unit_id", unitID).Str("url", unitURL).Msg("handler: failed to connect to unit stream")
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
	prevByte := byte(0)
	for {
		b, err := reader.ReadByte()
		if err != nil {
			return nil, err
		}
		frame.WriteByte(b)

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
