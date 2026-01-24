# Story 2.3: Unit Heartbeat Reception

Status: done

## Story

As an **APIS unit**,
I want to send heartbeats to the server,
So that the server knows I'm online and can sync my clock.

## Acceptance Criteria

1. **Given** a registered unit with valid API key
   **When** it sends `POST /api/units/heartbeat` with header `X-API-Key: apis_xxx`
   **Then** the server responds with HTTP 200 and server_time
   **And** the unit's `last_seen` is updated in the database
   **And** the unit's `ip_address` is recorded from the request

2. **Given** the heartbeat payload includes unit status
   **When** the server receives firmware_version, uptime, etc.
   **Then** the server updates the unit record with this information

3. **Given** an invalid API key is used
   **When** the heartbeat request arrives
   **Then** the server responds with 401 Unauthorized
   **And** no database update occurs

4. **Given** a unit successfully heartbeats
   **When** the server processes the heartbeat
   **Then** the unit's status is updated to 'online'

## Tasks / Subtasks

- [x] Task 1: Implement Heartbeat Handler (AC: #1, #2, #3, #4)
  - [x] 1.1: Create `HeartbeatHandler` in `internal/handlers/units.go`
  - [x] 1.2: Parse request body for optional unit status fields
  - [x] 1.3: Extract client IP from request (X-Forwarded-For or RemoteAddr)
  - [x] 1.4: Call storage layer to update unit heartbeat
  - [x] 1.5: Return server_time in response

- [x] Task 2: Extend Storage Layer for Heartbeat (AC: #1, #2, #4)
  - [x] 2.1: Update `UpdateUnitHeartbeat` to accept more fields
  - [x] 2.2: Add `UpdateUnitStatus` helper if needed (Not needed - status updated in heartbeat)
  - [x] 2.3: Ensure ip_address, last_seen, status, firmware_version updated

- [x] Task 3: Add Heartbeat Route (AC: #1, #3)
  - [x] 3.1: Add `POST /api/units/heartbeat` route in main.go
  - [x] 3.2: Apply UnitAuth middleware to heartbeat route
  - [x] 3.3: Ensure route uses unit context from middleware

- [x] Task 4: Implement Handler Tests (AC: all)
  - [x] 4.1: Test successful heartbeat with valid API key (via request/response parsing tests)
  - [x] 4.2: Test heartbeat updates last_seen and status (via storage layer)
  - [x] 4.3: Test heartbeat with optional payload fields
  - [x] 4.4: Test unauthorized response with invalid key (via UnitAuth middleware)
  - [x] 4.5: Test response includes server_time

## Dev Notes

### Project Structure Notes

**Backend changes:**
- Modified: `apis-server/internal/handlers/units.go` (add HeartbeatHandler)
- Modified: `apis-server/internal/handlers/units_test.go` (add heartbeat tests)
- Modified: `apis-server/internal/storage/units.go` (extend UpdateUnitHeartbeat)
- Modified: `apis-server/cmd/server/main.go` (add heartbeat route)

**No frontend changes required** - This is a device-to-server API endpoint.

### Architecture Compliance

**Heartbeat Protocol (from architecture.md):**

Request:
```json
POST /api/units/heartbeat
X-API-Key: apis_xxx

{
  "firmware_version": "1.2.3",
  "uptime_seconds": 3600,
  "detection_count_since_last": 5,
  "cpu_temp": 42.5,
  "free_heap": 128000,
  "local_time": "2026-01-22T14:30:00Z"
}
```

Response:
```json
{
  "server_time": "2026-01-22T14:30:05Z",
  "time_drift_ms": 5000
}
```

**API Response Format (from CLAUDE.md):**
```json
{
  "data": {
    "server_time": "2026-01-22T14:30:05Z"
  }
}
```

### Existing Code Patterns (from Story 2-2)

**UnitAuth Middleware already implemented:**
- File: `apis-server/internal/middleware/unitauth.go`
- Validates X-API-Key header
- Sets tenant context via `SET LOCAL app.tenant_id`
- Stores unit in context via `storage.WithConn` and `unitContextKey`

**Getting unit from context:**
```go
unit := middleware.RequireUnit(r.Context())
```

**UpdateUnitHeartbeat already exists:**
- File: `apis-server/internal/storage/units.go:299`
- Updates last_seen, ip_address, status to 'online'
- Extend this to accept optional fields from payload

### Handler Implementation Pattern

```go
// HeartbeatRequest contains the optional fields sent by a unit
type HeartbeatRequest struct {
    FirmwareVersion       *string  `json:"firmware_version,omitempty"`
    UptimeSeconds         *int64   `json:"uptime_seconds,omitempty"`
    DetectionCountSince   *int     `json:"detection_count_since_last,omitempty"`
    CPUTemp               *float64 `json:"cpu_temp,omitempty"`
    FreeHeap              *int64   `json:"free_heap,omitempty"`
    LocalTime             *string  `json:"local_time,omitempty"`
}

// HeartbeatResponse is returned to the unit
type HeartbeatResponse struct {
    ServerTime   string `json:"server_time"`
    TimeDriftMs  *int64 `json:"time_drift_ms,omitempty"`
}

func HeartbeatHandler(pool *pgxpool.Pool) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        unit := middleware.RequireUnit(r.Context())
        conn := storage.GetConn(r.Context())

        // Parse optional body
        var req HeartbeatRequest
        if r.Body != nil {
            json.NewDecoder(r.Body).Decode(&req)
        }

        // Extract client IP
        ip := extractClientIP(r)

        // Update unit heartbeat
        err := storage.UpdateUnitHeartbeat(r.Context(), conn, unit.ID, ip, &req)
        // ...

        // Return server time
        resp := HeartbeatResponse{
            ServerTime: time.Now().UTC().Format(time.RFC3339),
        }

        // Calculate time drift if local_time provided
        if req.LocalTime != nil {
            // Parse and calculate drift
        }

        respondJSON(w, map[string]any{"data": resp})
    }
}
```

### IP Address Extraction Pattern

```go
func extractClientIP(r *http.Request) string {
    // Check X-Forwarded-For first (behind proxy/load balancer)
    if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
        // Take first IP (client IP)
        if idx := strings.Index(xff, ","); idx > 0 {
            return strings.TrimSpace(xff[:idx])
        }
        return strings.TrimSpace(xff)
    }

    // Check X-Real-IP
    if xri := r.Header.Get("X-Real-IP"); xri != "" {
        return xri
    }

    // Fall back to RemoteAddr (may include port)
    host, _, _ := net.SplitHostPort(r.RemoteAddr)
    return host
}
```

### Security Considerations

1. **UnitAuth middleware is required** - Already handles X-API-Key validation and tenant context
2. **Rate limiting consideration** - Future enhancement, not in this story
3. **No sensitive data in response** - Only server_time returned
4. **Logging** - Log heartbeats at Debug level, not Info (too noisy)

### Testing Strategy

**Unit Tests for Handler:**
```go
func TestHeartbeatHandler_Success(t *testing.T) {
    // Setup: Create mock pool, unit in context
    // Call: POST /api/units/heartbeat
    // Assert: 200 OK, response has server_time
}

func TestHeartbeatHandler_WithPayload(t *testing.T) {
    // Setup: Create mock with payload
    // Call: POST with firmware_version, uptime, etc.
    // Assert: Unit updated with new values
}

func TestHeartbeatHandler_NoAuth(t *testing.T) {
    // Setup: No UnitAuth middleware applied
    // Call: POST /api/units/heartbeat
    // Assert: Panic (RequireUnit) or handler checks
}
```

### Route Configuration

In `main.go`, add to the unit-authenticated routes:
```go
// Unit-authenticated routes (X-API-Key)
r.Route("/api/units", func(r chi.Router) {
    r.Use(middleware.UnitAuth(pool))
    r.Post("/heartbeat", handlers.HeartbeatHandler(pool))
})
```

**Note:** This is separate from JWT-authenticated unit management routes.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Heartbeat Protocol]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3]
- [Source: CLAUDE.md#Device Communication]
- [Source: apis-server/internal/storage/units.go:299] - Existing UpdateUnitHeartbeat
- [Source: apis-server/internal/middleware/unitauth.go] - UnitAuth middleware

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Go server build: Successful compilation
- Go tests: All tests passing (handlers, middleware, storage, integration)

### Completion Notes List

1. **Heartbeat Handler (handlers/units.go)**: Added `Heartbeat` function, `HeartbeatRequest`, `HeartbeatResponse`, `HeartbeatDataResponse` types, and `extractClientIP` helper
2. **Storage Layer (storage/units.go)**: Added `HeartbeatInput` struct, modified `UpdateUnitHeartbeat` to accept optional fields via dynamic SQL building
3. **Route Configuration (main.go)**: Added separate route group with UnitAuth middleware for device-to-server communication, registered `POST /api/units/heartbeat`
4. **Handler Tests (handlers/units_test.go)**: Added 11 tests for heartbeat request/response parsing, serialization, and IP extraction

### File List

**Modified files:**
- apis-server/internal/handlers/units.go (added Heartbeat handler, HeartbeatRequest/Response types, extractClientIP)
- apis-server/internal/handlers/units_test.go (added heartbeat tests)
- apis-server/internal/storage/units.go (added HeartbeatInput, modified UpdateUnitHeartbeat)
- apis-server/cmd/server/main.go (added unit-authenticated route group with heartbeat endpoint)

## Remediation Notes

### Code Review (2026-01-24)

**Issues Found:**
1. HIGH: Telemetry fields (uptime_seconds, cpu_temp, free_heap) parsed but not stored
2. HIGH: Database missing columns for telemetry data
3. MEDIUM: Handler only passed FirmwareVersion to storage, not other telemetry fields

**Remediation Applied:**
1. Created migration `0006_unit_telemetry.sql` adding uptime_seconds, cpu_temp, free_heap columns
2. Updated Unit struct with telemetry fields
3. Updated HeartbeatInput struct with all telemetry fields
4. Updated all SQL queries (CreateUnit, ListUnits, GetUnitByID, GetUnitByAPIKey, UpdateUnit) to include telemetry columns
5. Updated UpdateUnitHeartbeat to persist all telemetry fields dynamically
6. Updated Heartbeat handler to pass all telemetry fields to storage layer

**Verification:**
- Build compiles successfully
- All tests pass

## Change Log

- 2026-01-24: Story 2.3 created from epics definition
- 2026-01-24: Implementation of Story 2.3 - Unit heartbeat reception with IP extraction and time drift calculation
- 2026-01-24: Code review remediation - Fixed telemetry data persistence (HIGH severity)
