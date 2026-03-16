# Story 2.5: Live Video WebSocket Proxy

Status: done

## Story

As a **beekeeper**,
I want to view live video from my units in the dashboard,
So that I can see what's happening at my hives in real-time.

## Acceptance Criteria

1. **Given** I am on a unit detail page
   **When** I click "View Live Feed"
   **Then** a video player opens showing the live MJPEG stream
   **And** the connection uses WSS (secure WebSocket) through the server

2. **Given** the unit is online and streaming
   **When** the WebSocket connection is established
   **Then** video frames appear with <500ms latency
   **And** the stream continues until I close it or navigate away

3. **Given** the unit is offline
   **When** I try to view live feed
   **Then** I see a message "Unit is offline - live feed unavailable"
   **And** no connection attempt is made

4. **Given** the WebSocket connection drops
   **When** the dashboard detects disconnection
   **Then** it shows "Connection lost - Reconnecting..."
   **And** attempts to reconnect automatically (3 retries, exponential backoff)

5. **Given** I close the video player
   **When** the UI closes
   **Then** the WebSocket connection is terminated
   **And** server resources are released

## Tasks / Subtasks

- [x] Task 1: Implement WebSocket Proxy Handler (AC: #1, #2, #5)
  - [x] 1.1: Add gorilla/websocket dependency to go.mod
  - [x] 1.2: Create `StreamHandler` in `internal/handlers/stream.go`
  - [x] 1.3: Implement WebSocket upgrade logic
  - [x] 1.4: Connect to unit's MJPEG endpoint via HTTP
  - [x] 1.5: Parse MJPEG frames and relay to WebSocket client
  - [x] 1.6: Handle connection cleanup on client disconnect

- [x] Task 2: Add Stream Route and Authentication (AC: #1)
  - [x] 2.1: Add `GET /ws/stream/{id}` route in main.go
  - [x] 2.2: Apply JWT authentication middleware to stream route
  - [x] 2.3: Validate unit belongs to authenticated tenant (RLS)
  - [x] 2.4: Check unit is online before allowing stream

- [x] Task 3: Create LiveStream React Component (AC: #1, #2, #3, #4, #5)
  - [x] 3.1: Create `LiveStream.tsx` component in `apis-dashboard/src/components/`
  - [x] 3.2: Implement WebSocket connection with proper cleanup on unmount
  - [x] 3.3: Convert binary frames to image blob URLs
  - [x] 3.4: Display video frames in img element
  - [x] 3.5: Show "Unit offline" message when unit status is offline

- [x] Task 4: Add Reconnection Logic (AC: #4)
  - [x] 4.1: Implement exponential backoff reconnection (3 retries, 1s/2s/4s)
  - [x] 4.2: Show "Connection lost - Reconnecting..." state
  - [x] 4.3: Show "Connection failed" after max retries
  - [x] 4.4: Allow manual retry after max retries exhausted

- [x] Task 5: Integrate Stream into Unit Detail Page (AC: #1, #3, #5)
  - [x] 5.1: Update `UnitDetail.tsx` to include "View Live Feed" button
  - [x] 5.2: Show/hide LiveStream component on button click
  - [x] 5.3: Disable button when unit is offline
  - [x] 5.4: Properly clean up WebSocket when navigating away

## Dev Notes

### Architecture Decision Note

**CLAUDE.md vs Architecture Conflict:**
- CLAUDE.md says "Don't proxy MJPEG through server (connect directly to device)"
- Architecture document overrides this: WSS proxy is REQUIRED

**Reason:** Dashboard is served over HTTPS. Direct connection to device (HTTP) triggers browser mixed content blocking. The WebSocket proxy solves this by tunneling the video stream through the HTTPS-served server.

This story should update CLAUDE.md to reflect this architectural decision.

### Project Structure Notes

**Backend changes:**
- New: `apis-server/internal/handlers/stream.go` (WebSocket proxy handler)
- Modified: `apis-server/cmd/server/main.go` (add stream route)
- Modified: `apis-server/go.mod` (add gorilla/websocket)

**Frontend changes:**
- New: `apis-dashboard/src/components/LiveStream.tsx` (video component)
- Modified: `apis-dashboard/src/pages/UnitDetail.tsx` (integrate stream)

### Backend Implementation Pattern

```go
// stream.go
package handlers

import (
    "bufio"
    "fmt"
    "net/http"

    "github.com/go-chi/chi/v5"
    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024 * 64, // 64KB for video frames
    CheckOrigin: func(r *http.Request) bool {
        return true // Allow all origins (auth handled by middleware)
    },
}

// Stream handles WebSocket video proxy from unit to dashboard
func Stream(w http.ResponseWriter, r *http.Request) {
    unitID := chi.URLParam(r, "id")
    conn := storage.RequireConn(r.Context())

    // Get unit and verify it's online
    unit, err := storage.GetUnitByID(r.Context(), conn, unitID)
    if err != nil {
        respondError(w, "Unit not found", http.StatusNotFound)
        return
    }

    if unit.Status != "online" || unit.IPAddress == nil {
        respondError(w, "Unit is offline", http.StatusServiceUnavailable)
        return
    }

    // Upgrade to WebSocket
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return // Upgrade handles error response
    }
    defer ws.Close()

    // Connect to unit's MJPEG endpoint
    resp, err := http.Get(fmt.Sprintf("http://%s:8080/stream", *unit.IPAddress))
    if err != nil {
        ws.WriteMessage(websocket.TextMessage, []byte("Connection to unit failed"))
        return
    }
    defer resp.Body.Close()

    // Relay MJPEG frames
    reader := bufio.NewReader(resp.Body)
    for {
        frame, err := readMJPEGFrame(reader)
        if err != nil {
            break
        }
        if err := ws.WriteMessage(websocket.BinaryMessage, frame); err != nil {
            break
        }
    }
}

// readMJPEGFrame reads a single JPEG frame from MJPEG stream
func readMJPEGFrame(reader *bufio.Reader) ([]byte, error) {
    // MJPEG format: boundary + headers + JPEG data
    // Look for JPEG start marker (0xFF 0xD8)
    // Read until JPEG end marker (0xFF 0xD9)
    // Implementation depends on unit's MJPEG format
    // ...
}
```

### Frontend Implementation Pattern

```typescript
// LiveStream.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Button, Spin } from 'antd';

interface LiveStreamProps {
  unitId: string;
  unitStatus: string;
  onClose: () => void;
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

export function LiveStream({ unitId, unitStatus, onClose }: LiveStreamProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'error'>('connecting');
  const [retryCount, setRetryCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (unitStatus !== 'online') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/stream/${unitId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      setRetryCount(0);
    };

    ws.onmessage = (event) => {
      const blob = new Blob([event.data], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      setImageSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    };

    ws.onclose = () => {
      if (retryCount < MAX_RETRIES) {
        setStatus('reconnecting');
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        setTimeout(() => {
          setRetryCount((c) => c + 1);
          connect();
        }, delay);
      } else {
        setStatus('error');
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [unitId, unitStatus, retryCount]);

  useEffect(() => {
    if (unitStatus === 'online') {
      connect();
    }
    return () => {
      wsRef.current?.close();
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [connect, unitStatus]);

  if (unitStatus !== 'online') {
    return (
      <Alert
        type="warning"
        message="Unit is offline - live feed unavailable"
        showIcon
      />
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {status === 'connecting' && <Spin tip="Connecting..." />}
      {status === 'reconnecting' && <Alert type="info" message="Connection lost - Reconnecting..." />}
      {status === 'error' && (
        <Alert
          type="error"
          message="Connection failed"
          action={<Button onClick={() => { setRetryCount(0); connect(); }}>Retry</Button>}
        />
      )}
      {imageSrc && <img src={imageSrc} alt="Live stream" style={{ maxWidth: '100%' }} />}
      <Button onClick={onClose} style={{ marginTop: 8 }}>Close</Button>
    </div>
  );
}
```

### MJPEG Frame Parsing

The unit streams MJPEG format. Each frame is:
```
--boundary\r\n
Content-Type: image/jpeg\r\n
Content-Length: XXXX\r\n
\r\n
[JPEG binary data]
```

The server needs to:
1. Skip the boundary and headers
2. Read the JPEG data
3. Send just the JPEG to the WebSocket client

### Connection Limits

Per the epics: "Max concurrent streams per unit: 2 (to limit unit bandwidth)"

Implementation: Track active connections per unit in a map. Reject new connections if limit reached.

```go
var activeStreams = make(map[string]int)
var streamsMu sync.Mutex

func Stream(w http.ResponseWriter, r *http.Request) {
    streamsMu.Lock()
    if activeStreams[unitID] >= 2 {
        streamsMu.Unlock()
        respondError(w, "Max streams reached", http.StatusTooManyRequests)
        return
    }
    activeStreams[unitID]++
    streamsMu.Unlock()

    defer func() {
        streamsMu.Lock()
        activeStreams[unitID]--
        streamsMu.Unlock()
    }()
    // ... rest of handler
}
```

### Security Considerations

1. **JWT Authentication** - Stream route requires valid JWT token
2. **Tenant Isolation** - Verify unit belongs to authenticated tenant (RLS handles this)
3. **Unit Validation** - Only stream from online units with known IP address
4. **Resource Limits** - Max 2 concurrent streams per unit

### Testing Strategy

**Backend Tests:**
- Test WebSocket upgrade
- Test connection to mock MJPEG source
- Test cleanup on disconnect
- Test concurrent stream limits

**Frontend Tests (optional):**
- Test offline unit shows message
- Test retry logic
- Test cleanup on unmount

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Live Video Streaming]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5]
- [gorilla/websocket documentation](https://pkg.go.dev/github.com/gorilla/websocket)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Go build: Successful compilation
- TypeScript build: Successful compilation
- Go tests: All passing

### Completion Notes List

1. **WebSocket Handler (handlers/stream.go)**: Created Stream handler with WebSocket upgrade, MJPEG frame parsing, connection limits (max 2 per unit), proper cleanup
2. **Route Configuration (main.go)**: Added `GET /ws/stream/{id}` route under JWT-authenticated routes
3. **LiveStream Component (components/LiveStream.tsx)**: Created React component with WebSocket connection, binary frame handling, blob URL management, offline handling
4. **Reconnection Logic**: Implemented exponential backoff (3 retries, 1s/2s/4s), connection states, manual retry
5. **Unit Detail Integration (pages/UnitDetail.tsx)**: Added "View Live Feed" button, toggle show/hide, disabled when offline

### File List

**New files:**
- apis-server/internal/handlers/stream.go
- apis-dashboard/src/components/LiveStream.tsx

**Modified files:**
- apis-server/cmd/server/main.go
- apis-server/go.mod (added gorilla/websocket)
- apis-dashboard/src/pages/UnitDetail.tsx

## Change Log

- 2026-01-24: Story 2.5 created from epics definition
- 2026-01-24: Implementation of Story 2.5 - Live video WebSocket proxy
- 2026-01-24: Code review - Fixed HTTP timeout issue (10s -> 0 for streaming)
- 2026-01-25: Remediation: Fixed 7 issues from code review (stale closure bug, memory leak, missing tests, exports, logging)
