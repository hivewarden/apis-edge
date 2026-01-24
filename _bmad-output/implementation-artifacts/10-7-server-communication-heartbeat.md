# Story 10.7: Server Communication (Heartbeat)

Status: done

## Story

As an **APIS unit**,
I want to send heartbeats to the server,
So that the server knows I'm online and I can sync my clock.

## Acceptance Criteria

### AC1: Periodic Heartbeat
**Given** the unit has server configuration
**When** heartbeat interval elapses (60 seconds)
**Then** unit sends `POST /api/units/heartbeat` with:
- API key in `X-API-Key` header
- Current status in body (armed, uptime, storage, pending_clips)

### AC2: Successful Response
**Given** the server responds successfully
**When** the response is received
**Then** unit extracts server time and adjusts local clock if >5s drift
**And** updates local config if server sends changes

### AC3: Server Unreachable
**Given** the server is unreachable
**When** heartbeat fails
**Then** unit logs the failure
**And** continues operating offline
**And** sets LED to offline overlay
**And** retries on next interval

### AC4: Config Sync
**Given** the server returns new configuration
**When** the heartbeat response includes config changes
**Then** unit updates local settings (e.g., armed state changed remotely)

### AC5: Initial Boot
**Given** the unit boots with server configuration
**When** startup completes
**Then** unit sends initial heartbeat immediately
**And** retries 3 times with 5s delay if server unreachable

## Tasks / Subtasks

- [x] **Task 1: Server Communication Module** (AC: all)
  - [x] 1.1: Define server_comm.h interface (init, heartbeat, set_offline_callback)
  - [x] 1.2: Implement HTTP client using POSIX sockets
  - [x] 1.3: Parse server URL from config (host, port, path)
  - [x] 1.4: Handle HTTPS (placeholder for future TLS - uses HTTP for now)

- [x] **Task 2: Heartbeat Thread** (AC: 1, 3)
  - [x] 2.1: Implement background heartbeat thread
  - [x] 2.2: Send heartbeat every 60 seconds
  - [x] 2.3: Build request body (armed, uptime, storage, pending_clips)
  - [x] 2.4: Set X-API-Key header from config

- [x] **Task 3: Response Handling** (AC: 2, 4)
  - [x] 3.1: Parse JSON response
  - [x] 3.2: Extract server_time and compare to local clock
  - [x] 3.3: Log drift (actual clock adjustment needs root on Pi)
  - [x] 3.4: Update local config if changes present

- [x] **Task 4: Error Handling & Offline Mode** (AC: 3)
  - [x] 4.1: Detect network failures (timeout, connection refused)
  - [x] 4.2: Set LED offline overlay via led_controller
  - [x] 4.3: Log failures with details
  - [x] 4.4: Clear offline state when heartbeat succeeds

- [x] **Task 5: Boot Sequence** (AC: 5)
  - [x] 5.1: Send initial heartbeat on startup
  - [x] 5.2: Retry 3 times with 5s delay if failed
  - [x] 5.3: Continue to normal interval after boot

- [x] **Task 6: Testing** (AC: all)
  - [x] 6.1: Create test_server_comm.c
  - [x] 6.2: Test initialization and lifecycle
  - [x] 6.3: Test server unreachable
  - [x] 6.4: Test no server config
  - [x] 6.5: Update CMakeLists.txt with new sources

## Technical Notes

### Project Structure

```
apis-edge/
├── include/
│   └── server_comm.h      # Server communication interface
├── src/
│   └── server/
│       └── server_comm.c  # Implementation with HTTP client
└── tests/
    └── test_server_comm.c # Server comm tests with mock
```

### Server Communication Interface

```c
// include/server_comm.h
#ifndef APIS_SERVER_COMM_H
#define APIS_SERVER_COMM_H

#include <stdint.h>
#include <stdbool.h>

/**
 * Heartbeat request body.
 */
typedef struct {
    bool armed;
    uint32_t uptime_seconds;
    uint32_t free_storage_mb;
    uint32_t pending_clips;
    const char *firmware_version;
} heartbeat_request_t;

/**
 * Heartbeat response from server.
 */
typedef struct {
    char server_time[32];       // ISO 8601 format
    bool has_config;            // Whether config section present
    bool armed;                 // Config: armed state
    bool detection_enabled;     // Config: detection enabled
} heartbeat_response_t;

/**
 * Server communication status.
 */
typedef enum {
    SERVER_STATUS_UNKNOWN,
    SERVER_STATUS_ONLINE,
    SERVER_STATUS_OFFLINE,
    SERVER_STATUS_AUTH_FAILED,
} server_status_t;

/**
 * Initialize server communication.
 * Starts background heartbeat thread.
 * @return 0 on success, -1 on error
 */
int server_comm_init(void);

/**
 * Send immediate heartbeat (bypasses interval).
 * @return 0 on success, -1 on error
 */
int server_comm_send_heartbeat(void);

/**
 * Get current server status.
 * @return Current status
 */
server_status_t server_comm_get_status(void);

/**
 * Stop server communication.
 */
void server_comm_stop(void);

/**
 * Cleanup server communication.
 */
void server_comm_cleanup(void);

#endif // APIS_SERVER_COMM_H
```

### Heartbeat Request Format

```json
{
  "armed": true,
  "firmware_version": "1.0.0",
  "uptime_seconds": 3600,
  "free_storage_mb": 450,
  "pending_clips": 2
}
```

### Heartbeat Response Format

```json
{
  "server_time": "2026-01-22T14:30:00Z",
  "config": {
    "armed": true,
    "detection_enabled": true
  }
}
```

### Configuration (from config_manager)

```json
{
  "server": {
    "url": "https://apis.honeybeegood.be",
    "api_key": "apis_abc123..."
  }
}
```

### Timing Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Heartbeat interval | 60 seconds | From epics.md |
| Connection timeout | 10 seconds | Per request |
| Boot retry count | 3 | Initial connection attempts |
| Boot retry delay | 5 seconds | Between boot retries |
| Clock drift threshold | 5 seconds | Before adjustment |
| Offline threshold | 120 seconds | Server-side (2 missed heartbeats) |

### HTTP Client Pattern

```c
// Minimal HTTP POST using POSIX sockets
static int http_post(const char *host, uint16_t port, const char *path,
                     const char *api_key, const char *body,
                     char *response, size_t response_size) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    // Set timeout
    struct timeval timeout = {.tv_sec = 10, .tv_usec = 0};
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

    // Connect
    struct sockaddr_in addr = {...};
    connect(sock, ...);

    // Build request
    snprintf(request, sizeof(request),
        "POST %s HTTP/1.1\r\n"
        "Host: %s\r\n"
        "X-API-Key: %s\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: %zu\r\n"
        "\r\n%s",
        path, host, api_key, strlen(body), body);

    send(sock, request, ...);
    recv(sock, response, ...);
    close(sock);
}
```

### Integration Points

| Component | Interface | Purpose |
|-----------|-----------|---------|
| config_manager | get server URL, API key | Request configuration |
| led_controller | set_state(LED_STATE_OFFLINE) | Offline indication |
| config_manager | update armed state | Config sync from server |
| storage_manager | get free space | Heartbeat payload |
| clip_uploader (10.8) | get pending clips count | Heartbeat payload |

### Platform Considerations

**Pi Platform:**
- Standard POSIX sockets
- pthread for background thread
- HTTPS via OpenSSL (future)

**ESP32 Platform:**
- ESP-IDF HTTP client component
- Task-based concurrency
- mbedTLS for HTTPS

**Test Platform:**
- Mock server on localhost
- Capture requests for verification

### Previous Story Learnings

- Platform macros: APIS_PLATFORM_PI, APIS_PLATFORM_ESP32, APIS_PLATFORM_TEST
- Thread-safe with mutex (LED_LOCK pattern from Story 10.9)
- Background thread pattern (from http_server and led_controller)
- Clean shutdown with pthread_join

### References

- [Source: epics.md#Story 10.7] - Acceptance criteria
- [Source: epics.md#Story 2.3] - Server-side heartbeat handling
- [Source: architecture.md] - Device communication patterns
- [Source: 10-6-http-control-api.md] - HTTP handling patterns
- [Source: 10-9-led-status-indicator.md] - LED offline state

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### File List

| File | Action | Description |
|------|--------|-------------|
| `include/server_comm.h` | Created | Server communication interface (115 lines) |
| `src/server/server_comm.c` | Created | Full implementation with HTTP client (430 lines) |
| `tests/test_server_comm.c` | Created | Comprehensive test suite (24 tests) |
| `src/config/config_manager.c` | Modified | Fixed NULL validation parameter handling |
| `CMakeLists.txt` | Modified | Added test_server_comm target |

### Test Results

```
=== Server Communication Tests ===
--- Test: Initialization --- (8 tests)
--- Test: Status Names --- (4 tests)
--- Test: Seconds Since Heartbeat --- (1 test)
--- Test: Start/Stop Lifecycle --- (3 tests)
--- Test: No Server Config --- (2 tests)
--- Test: Network Failure --- (3 tests)
--- Test: Cleanup --- (3 tests)

=== Results: 24 passed, 0 failed ===
```

### Completion Notes

1. **Server Communication Core**: Implemented complete heartbeat module with:
   - HTTP client using POSIX sockets
   - URL parsing (protocol, host, port, path)
   - Request/response JSON handling via cJSON
   - Background heartbeat thread (60 second interval)

2. **Response Handling**:
   - Server time extraction (logging only - actual clock sync needs root)
   - Config sync from server (armed state, detection_enabled)
   - LED state updates when config changes remotely

3. **Error Handling**:
   - Network failures detected and logged
   - LED offline state set via led_controller
   - Graceful handling of missing server config
   - Auth failure detection (401/403)

4. **Boot Sequence**:
   - Initial heartbeat sent immediately on start
   - 3 retries with 5s delay if server unreachable

5. **Bug Fix**: Fixed config_manager_update to handle NULL validation parameter

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-23 | Claude | Story created with comprehensive context |
| 2026-01-23 | Claude | Implementation complete, 24 tests passing |
