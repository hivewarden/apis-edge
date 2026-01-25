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
| Database | YugabyteDB | PostgreSQL-compatible distributed DB |
| Edge (Pi + ESP32) | C / ESP-IDF | Single codebase with HAL abstraction |
| Container | Podman | Rootless, Alpine base |
| Secrets | OpenBao | Vault-compatible, swappable |
| Encryption | SOPS + age | Local dev secrets |

## Frontend Development

**IMPORTANT:** When working on frontend code in `apis-dashboard/`, always use the `/frontend-design` skill. This applies to:
- Epics 1-9 (all have React dashboard work)
- Any component, page, or hook in `apis-dashboard/src/`
- Styling, theming, and UI/UX improvements

Epics 10-12 are edge device firmware (C/ESP-IDF) and hardware documentation — no frontend skill needed.

## Secrets Management

**Architecture:** OpenBao (Vault-compatible) for secrets, SOPS for encrypted local files.

**Go Server reads secrets from OpenBao:**
```go
import "github.com/jermoo/apis/apis-server/internal/secrets"

client := secrets.NewClient()
dbConfig, _ := client.GetDatabaseConfig()
connStr := dbConfig.ConnectionString()
```

**To connect to external OpenBao (e.g., existing stack):**
```bash
# Just change these environment variables:
OPENBAO_ADDR=https://your-openbao.example.com:8200
OPENBAO_TOKEN=hvs.your-actual-token
OPENBAO_SECRET_PATH=secret/data/apis
```

**Local dev:** OpenBao runs in docker-compose with dev token. No setup needed.

**Secret paths in OpenBao:**
- `secret/data/apis/database` - DB credentials
- `secret/data/apis/zitadel` - Zitadel config
- `secret/data/apis/api` - API configuration

**Shared infrastructure:** APIS is designed to run alongside other apps on shared infrastructure (YugabyteDB, OpenBao, VyOS). See `docs/INFRASTRUCTURE-INTEGRATION.md` for details on connecting to an existing stack.

## Target Infrastructure

APIS deploys to a shared Hetzner infrastructure stack alongside RTP (RateThePlate). Reference architecture: `/Users/jermodelaruelle/Projects/RTP-SK/zzWegoVPS-v2/docs/architecture/SCALING-ARCHITECTURE.md`

### Infrastructure Summary

| Phase | Servers | APIS Location | OpenBao | YugabyteDB |
|-------|---------|---------------|---------|------------|
| 1-2 | 4-9 | `rtp-app-01` (10.0.1.10) | `rtp-sec-01` (10.0.1.20) | Shared on app-01 or data nodes |
| 3+ | 13+ | Dedicated `apis-app-01` or shared | `rtp-data-0X` (Raft HA) | Bare metal data tier |

### Key Infrastructure Details

```
SHARED STACK (Nuremberg DC)
├── VyOS Firewall (10.0.1.1/2) - VRRP HA, Suricata IDS
├── OpenBao (10.0.1.20 or data nodes) - Secrets at secret/data/apis/*
├── YugabyteDB (shared cluster) - APIS uses dedicated 'apis' database
├── Zitadel (shared) - APIS can use same instance, separate project
├── BunkerWeb (WAF) - Routes traffic to APIS
├── VictoriaMetrics - APIS exports /metrics for scraping
└── Wazuh - Security monitoring

APIS INTEGRATION POINTS
├── Secrets: OPENBAO_ADDR=http://10.0.1.20:8200, path=secret/data/apis/*
├── Database: postgres://apis:xxx@yugabytedb:5433/apis
├── Auth: Shared Zitadel or dedicated
└── Monitoring: Prometheus metrics at :3000/metrics
```

### Isolated vs Integrated Mode

```bash
# ISOLATED (default for local dev) - runs everything locally
docker compose up

# INTEGRATED (connects to shared stack) - set env vars first
OPENBAO_ADDR=http://10.0.1.20:8200 \
OPENBAO_TOKEN=hvs.xxx \
docker compose up apis-server apis-dashboard
```

## Repository Structure

```
apis/
├── apis-server/          # Go backend
│   ├── cmd/server/       # Entry point
│   └── internal/         # handlers/, models/, storage/, middleware/
├── apis-dashboard/       # React + Refine
│   └── src/              # components/, pages/, providers/, hooks/
├── apis-edge/            # Edge device firmware (C with HAL)
│   ├── src/              # Shared C source code
│   ├── hal/              # Hardware Abstraction Layer
│   │   ├── pi/           # Pi-specific HAL implementation
│   │   └── esp32/        # ESP32-specific HAL implementation
│   └── platforms/        # Platform-specific build configs
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
- **Secrets:** OpenBao for production, SOPS-encrypted files for dev, never hardcoded

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



---

## Epic Development Orchestration

**Story Loop:** create-story → dev-story → code-review → remediate → re-review (until pass)

**Epic Flow:** Stories sequential → Holistic epic review → Remediate integration issues → Mark epic done

### Agent Responsibilities

| Agent | Workflow | Responsibility |
|-------|----------|----------------|
| **Story Creator** | create-story | Generate detailed story file with tasks, acceptance criteria, technical context |
| **Developer** | dev-story | Implement code meeting all acceptance criteria |
| **Reviewer** | code-review | Adversarial review finding 3-10 issues minimum |
| **Remediator** | (manual) | Fix issues from review, can auto-fix with approval |
| **Epic Reviewer** | (manual) | Holistic integration review of complete epic |

### Review Quality Gates

**Story Review Must Check:**
- [ ] All acceptance criteria implemented
- [ ] Tests written and passing
- [ ] Code follows project patterns (CLAUDE.md)
- [ ] No security vulnerabilities
- [ ] Error handling complete
- [ ] Logging implemented per standards

**Epic Holistic Review Must Check:**
- [ ] All stories integrate correctly
- [ ] Cross-story data flows work
- [ ] Full test suite passes
- [ ] Docker Compose starts cleanly
- [ ] All FRs from epic satisfied
- [ ] Architecture decisions followed
- [ ] No regressions in earlier stories

### Escalation Rules

1. **Story review fails 3 times** → Escalate to human for decision
2. **Epic holistic review fails 2 times** → Escalate to human
3. **Circular dependency detected** → Stop and document for human
4. **Architecture deviation required** → Human approval before proceeding
