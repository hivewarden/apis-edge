# APIS — Anti-Predator Interference System

Hornet detection and laser deterrent system protecting beehives. Edge device detects Asian hornets, tracks with servo, deters with laser. Companion server provides dashboard and clip archive.

## Documentation Philosophy

**CRITICAL:** Hardware documentation must be extremely detailed with complete what/why/how explanations. The user will have limited tokens during implementation — all decisions, calculations, and reasoning must be captured upfront so implementation can proceed with minimal questions.

**USER CONTEXT:** The user has very little electronics experience. All hardware documentation must:
- Teach concepts, not just list steps
- Explain WHY each connection is made (not just what)
- Define terminology when first used (GPIO, PWM, pull-up resistor, etc.)
- Include "what could go wrong" sections with symptoms and fixes
- Use analogies to explain electrical concepts
- Never assume prior knowledge of voltages, currents, or pin functions
- Include photos/diagrams descriptions showing correct vs incorrect

For hardware stories, include:
- Complete pin mappings with rationale ("GPIO 18 because it supports PWM which means...")
- Power calculations explained step-by-step ("The servo draws 500mA, the laser 200mA, so total...")
- Wiring diagrams described in text (ASCII or detailed prose)
- Component specifications with exact part numbers and supplier links
- Step-by-step assembly sequences with verification checkpoints
- Safety considerations and warnings (especially laser safety)
- Troubleshooting guides: "If X doesn't work, check Y because..."
- Alternative components if primary unavailable
- Glossary of terms used

**Teaching approach:** Write as if explaining to a smart person who has never held a soldering iron. They can learn fast, but need concepts explained once clearly.

## Critical Design Principles

1. **Design for ESP32** — Pi 5 is dev board only. Never add features that won't work on ESP32.
2. **Offline-first** — Edge device works with zero connectivity. Server is optional.
3. **AI-manageable** — All CLI commands support `--json` flag for structured output.
4. **SaaS-ready** — Architecture supports future multi-tenant expansion.

## Technology Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Server | Go 1.22 + Chi | Idiomatic, no frameworks |
| Dashboard | React + Refine + Ant Design | Vite build |
| Database | SQLite (modernc.org/sqlite) | Pure Go, no CGO |
| Edge (Pi) | Python 3.11+ | OpenCV for detection |
| Edge (ESP32) | C++ / PlatformIO | Custom detection |
| Container | Podman | Rootless, Alpine base |

## Repository Structure

```
apis/
├── apis-server/          # Go backend
│   ├── cmd/server/       # Entry point
│   └── internal/         # handlers/, models/, storage/, middleware/
├── apis-dashboard/       # React + Refine
│   └── src/              # components/, pages/, providers/, hooks/
├── apis-edge/
│   ├── pi/               # Python
│   └── esp32/            # C++ / PlatformIO
├── hardware/             # Wiring diagrams, STL files
└── docs/
```

## Naming Conventions

**Database:** snake_case tables (plural), snake_case columns
```sql
CREATE TABLE incidents (id, device_id, detected_at, clip_path);
```

**Go:** PascalCase exports, camelCase private, snake_case files
```go
// device_handler.go
func GetDevice(w http.ResponseWriter, r *http.Request) { ... }
func parseConfig() { ... }  // private
```

**TypeScript:** PascalCase components, camelCase hooks/utils
```
DeviceCard.tsx, useDeviceStatus.ts, formatDate.ts
```

**API:** snake_case JSON fields, plural endpoints
```
GET /api/devices
POST /api/devices/{id}/clips
```

## API Response Format

```go
// Success
{"data": {...}, "meta": {"total": 100, "page": 1}}

// Error
{"error": "Device not found", "code": 404}

// List
{"data": [...], "meta": {"total": 50, "page": 1, "per_page": 20}}
```

## Go Patterns

**Error wrapping:**
```go
if err != nil {
    return fmt.Errorf("storage: failed to save clip %s: %w", id, err)
}
```

**Structured logging (zerolog):**
```go
log.Info().
    Str("device_id", deviceID).
    Str("event", "clip_received").
    Msg("Clip uploaded")
```

**Handler errors:**
```go
func respondError(w http.ResponseWriter, msg string, code int) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(code)
    json.NewEncoder(w).Encode(map[string]any{"error": msg, "code": code})
}
```

## Authentication

- **Dashboard:** Bcrypt password + secure sessions
- **Device → Server:** API key in `X-API-Key` header over HTTPS
- **Secrets:** Environment variables only, never hardcoded

## Device Communication

- Device pushes to server (works through NAT)
- Heartbeat: POST every 60s
- Clips: Device POSTs to server on detection
- Live stream: Dashboard connects directly to device MJPEG (no proxy)

## Device Discovery (Boot Sequence)

1. Check saved config → use if exists
2. Try mDNS: `apis-server.local`
3. Try default: `apis.honeybeegood.be`
4. No server → LED "needs setup", wait for serial config

## Testing

- Tests go in separate `tests/` directory (not co-located)
- Go: `go test`, testify for assertions
- Integration: httptest with temp SQLite
- Dashboard: Component tests in `tests/components/`

## What NOT to Do

- Don't add features that won't work on ESP32
- Don't proxy MJPEG through server (connect directly to device)
- Don't use CGO (breaks Alpine container)
- Don't hardcode secrets or API keys
- Don't use SSH for device management (ESP32 can't do it)
- Don't design pull-based communication (device pushes only)
