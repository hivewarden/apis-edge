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
4. **Dual-mode deployment** — Supports both standalone (self-hosted) and SaaS (multi-tenant) deployments.

## Deployment Modes

> **AI/LLM Context**: APIS supports two deployment modes with different infrastructure requirements.
> When modifying configuration, secrets, or auth code, ensure changes work in BOTH modes.
> See `docs/DEPLOYMENT-MODES.md` for comprehensive documentation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Mode       │ Use Case               │ Auth      │ Secrets    │ Multi-tenant│
├─────────────────────────────────────────────────────────────────────────────┤
│ standalone │ Self-hosted, Pi, NAS   │ local     │ file/env   │ false       │
│ saas       │ Club hosting, SaaS     │ keycloak  │ openbao    │ true        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Starting Each Mode

```bash
# Standalone mode (minimal dependencies)
cp .env.standalone.example .env
docker compose --profile standalone up -d

# SaaS mode (full stack with Keycloak, OpenBao, BunkerWeb)
cp .env.saas.example .env
docker compose --profile saas up -d
```

### Key Environment Variables

| Variable | Standalone | SaaS |
|----------|------------|------|
| `DEPLOYMENT_MODE` | `standalone` | `saas` |
| `AUTH_MODE` | `local` | `keycloak` |
| `SECRETS_BACKEND` | `file` or `env` | `openbao` |
| `MULTI_TENANT` | `false` | `true` |

### Code Pattern for Mode-Aware Features

```go
// AI/LLM Context: Always check deployment mode before assuming infrastructure exists
if config.DeploymentMode() == "saas" {
    // Full security: OpenBao, audit logging, tenant isolation
    return doWithFullSecurity()
}
// Standalone: Simpler but still secure (file-based secrets, single tenant)
return doWithStandaloneSecurityModel()
```

## Technology Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Server | Go 1.22 + Chi | Idiomatic, no frameworks |
| Dashboard | React + Refine + Ant Design | Vite build |
| Database | YugabyteDB | PostgreSQL-compatible distributed DB |
| Edge (Pi + ESP32) | C / ESP-IDF | Single codebase with HAL abstraction |
| Container | Podman | Rootless, Alpine base |
| Secrets | OpenBao / file / env | Three backends, see Secrets Management |
| Auth | Local JWT / Keycloak OIDC | Depends on AUTH_MODE |
| Encryption | SOPS + age | Local dev secrets |

## Frontend Development

**IMPORTANT:** When working on frontend code in `apis-dashboard/`, always use the `/frontend-design` skill. This applies to:
- Epics 1-9 (all have React dashboard work)
- Any component, page, or hook in `apis-dashboard/src/`
- Styling, theming, and UI/UX improvements

Epics 10-12 are edge device firmware (C/ESP-IDF) and hardware documentation — no frontend skill needed.

### Layered Hooks Architecture

**CRITICAL:** All data fetching in the dashboard follows a strict layered architecture:

```
┌─────────────────────────────────────────────────────────┐
│ Pages (thin composition layer)                          │
│   - Use hooks for ALL data fetching                     │
│   - Pass data to components via props                   │
│   - Handle navigation and layout                        │
│   - POST/PUT for create/edit forms allowed inline       │
├─────────────────────────────────────────────────────────┤
│ Components (dumb, props-only)                           │
│   - Receive data via props                              │
│   - NO direct API calls for fetching                    │
│   - POST/DELETE mutations allowed for user actions      │
├─────────────────────────────────────────────────────────┤
│ Hooks (data fetching layer)                             │
│   - All GET requests go through hooks                   │
│   - Consistent pattern: loading, error, data, refetch   │
│   - Located in src/hooks/                               │
├─────────────────────────────────────────────────────────┤
│ API Client (transport layer)                            │
│   - Axios instance with interceptors                    │
│   - Located in src/providers/apiClient.ts               │
└─────────────────────────────────────────────────────────┘
```

**Hook Pattern (required for all new hooks):**
```typescript
export function useXxx(id: string): UseXxxResult {
  const [data, setData] = useState<Xxx | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/xxx/${id}`);
      if (isMountedRef.current) setData(response.data.data);
    } catch (err) {
      if (isMountedRef.current) setError(err as Error);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    isMountedRef.current = true;
    fetch();
    return () => { isMountedRef.current = false; };
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
```

**Rules:**
- ❌ NO `apiClient.get()` in pages (except inline POST/PUT for forms)
- ❌ NO `apiClient.get()` in components
- ✅ All data fetching through hooks in `src/hooks/`
- ✅ Components receive data via props
- ✅ Mutations (POST/DELETE) allowed inline for user-triggered actions

## Secrets Management

> **AI/LLM Context**: The secrets package supports THREE backends to accommodate different deployment modes.
> Code reading secrets MUST handle all backends gracefully. Never assume OpenBao is available.

### Three Secrets Backends

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Backend  │ Use Case              │ Security     │ Configuration             │
├─────────────────────────────────────────────────────────────────────────────┤
│ env      │ Standalone (simplest) │ Basic        │ SECRETS_BACKEND=env       │
│ file     │ Standalone (better)   │ Better       │ SECRETS_BACKEND=file      │
│ openbao  │ SaaS (production)     │ Best         │ SECRETS_BACKEND=openbao   │
└─────────────────────────────────────────────────────────────────────────────┘

Fallback chain: openbao → file → env (ensures app starts even if preferred backend unavailable)
```

### Reading Secrets in Go

```go
import "github.com/jermoo/apis/apis-server/internal/secrets"

client := secrets.NewClient()  // Auto-configures from SECRETS_BACKEND env var
dbConfig, _ := client.GetDatabaseConfig()
connStr := dbConfig.ConnectionString()

// Available methods:
// - GetDatabaseConfig() - DB host, port, user, password
// - GetJWTConfig() - JWT secret for local auth mode
// - GetKeycloakConfig() - Keycloak settings for SaaS mode
```

### Standalone Mode (file/env backends)

```bash
# Option A: Environment variables (simplest)
SECRETS_BACKEND=env
JWT_SECRET=<your-64-char-secret>
YSQL_PASSWORD=<your-db-password>

# Option B: File-based secrets (more secure)
SECRETS_BACKEND=file
SECRETS_DIR=./secrets
# Create files: ./secrets/jwt_secret, ./secrets/db_password (chmod 600)
```

### SaaS Mode (OpenBao backend)

```bash
SECRETS_BACKEND=openbao
OPENBAO_ADDR=https://your-openbao.example.com:8200
OPENBAO_TOKEN=hvs.your-actual-token
OPENBAO_SECRET_PATH=secret/data/apis
```

**Secret paths in OpenBao:**
- `secret/data/apis/database` - DB credentials
- `secret/data/apis/jwt` - JWT signing keys
- `secret/data/apis/keycloak` - Keycloak config

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
├── Keycloak (shared) - APIS can use same instance, separate realm
├── BunkerWeb (WAF) - Routes traffic to APIS
├── VictoriaMetrics - APIS exports /metrics for scraping
└── Wazuh - Security monitoring

APIS INTEGRATION POINTS
├── Secrets: OPENBAO_ADDR=http://10.0.1.20:8200, path=secret/data/apis/*
├── Database: postgres://apis:xxx@yugabytedb:5433/apis
├── Auth: Shared Keycloak or dedicated
└── Monitoring: Prometheus metrics at :3000/metrics
```

### Local vs Shared Infrastructure

> **AI/LLM Context**: This is about WHERE services run, not deployment mode.
> Both standalone and SaaS modes can run locally or connect to shared infrastructure.

```bash
# LOCAL (default for development) - runs all services in docker-compose
docker compose --profile standalone up -d   # or --profile saas

# SHARED INFRASTRUCTURE - connects to existing OpenBao/YugabyteDB
OPENBAO_ADDR=http://10.0.1.20:8200 \
OPENBAO_TOKEN=hvs.xxx \
YSQL_HOST=10.0.1.30 \
docker compose --profile saas up apis-server apis-dashboard
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

> **AI/LLM Context**: Auth behavior depends on `AUTH_MODE` environment variable.
> Always check auth mode before assuming Keycloak/OIDC is available.

### Auth Modes

| Mode | `AUTH_MODE` | Dashboard Auth | Token Storage |
|------|-------------|----------------|---------------|
| Standalone | `local` | Bcrypt passwords + JWT | In-memory (no localStorage) |
| SaaS | `keycloak` | Keycloak OIDC | Keycloak handles sessions |

- **Device → Server:** API key in `X-API-Key` header over HTTPS (both modes)
- **Secrets:** See Secrets Management section above

### Token Storage

- **Local mode:** JWTs stored in `apis_session` HttpOnly cookie only — never in `localStorage`. On page refresh the cookie is sent automatically; on cookie expiry the user must re-login.
- **SaaS mode:** Keycloak manages sessions. SSO session max lifespan is 72 hours (`ssoSessionMaxLifespan: 259200` in realm config). Token refresh is handled by the OIDC library.

### Role Selection

Keycloak tokens may contain multiple roles in `realm_access.roles`. The server uses **deterministic priority selection** (`admin > user > viewer`) to set `Claims.Role`. This is **not cosmetic** — `Claims.Role` is used for authorization checks in handlers (e.g., `settings_beebrain.go`, `users.go`).

### Auth Config Cache

The auth config endpoint (`/api/auth/config`) uses a non-cryptographic hash for ETag caching. This is an accepted risk — the endpoint only returns public configuration (auth mode, issuer URL, client ID) with no sensitive data.

## Device Communication

- Device pushes to server (works through NAT)
- Heartbeat: POST every 60s
- Clips: Device POSTs to server on detection
- Live stream: Dashboard connects directly to device MJPEG (no proxy)

## Device Onboarding

### Setup Flow (Captive Portal)

On first boot (no WiFi credentials saved), the device enters AP mode:
1. Device broadcasts `HiveWarden-XXXX` WiFi (WPA2, password on serial/label)
2. Phone connects → captive portal auto-pops the setup page (port 80)
3. User enters: WiFi SSID + password + API key (from dashboard)
4. Server URL is **not needed** — baked into firmware via `onboarding_defaults.h`
5. Device reboots, connects to WiFi, talks to server

A DNS server on UDP port 53 intercepts all DNS queries to trigger the captive
portal popup on iOS, Android, Windows, and macOS.

### Server Discovery Chain (after WiFi connected)

```
1. Saved config     → User typed a URL or QR scanned one during setup
2. mDNS discovery   → Query _hivewarden._tcp on local network (standalone)
3. Default URL      → ONBOARDING_DEFAULT_URL ("https://hivewarden.eu")
4. Fallback URL     → ONBOARDING_FALLBACK_URL (optional, for self-hosters)
5. No server        → Runs detection locally, no uploads
```

### Self-Hosters

Edit `apis-edge/include/onboarding_defaults.h` before building:
```c
#define ONBOARDING_DEFAULT_URL   "https://bees.myclub.be"
#define ONBOARDING_FALLBACK_URL  "https://hivewarden.eu"  // optional backup
```

### mDNS

- Go server (standalone mode): advertises `_hivewarden._tcp` via mDNS
- ESP32: queries `_hivewarden._tcp` and advertises itself as an edge device
- Service type: `_hivewarden._tcp`, TXT records: version, mode, path, auth

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
