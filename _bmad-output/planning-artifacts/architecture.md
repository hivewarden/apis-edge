---
stepsCompleted:
  - step-01-init
  - step-02-context
  - step-03-starter
  - step-04-decisions
  - step-05-patterns
  - step-06-structure
  - step-07-validation
  - step-08-complete
  - step-09-portal-expansion
  - step-10-saas-infrastructure
status: 'complete'
completedAt: '2026-01-22'
inputDocuments:
  - prd.md
  - ux-design-specification.md
  - architecture-codex-review-2026-01-22.md
workflowType: 'architecture'
project_name: 'APIS - Anti-Predator Interference System'
user_name: 'Jermoo'
date: '2026-01-22'
version: '3.1'
techStackPreferences:
  frontend: 'React + Refine + Ant Design + @ant-design/charts'
  backend: 'Go + Chi'
  database: 'YugabyteDB (PostgreSQL-compatible)'
  identity: 'Keycloak (OIDC/OAuth2)'
  edge: 'C / ESP-IDF (ESP32 + Pi) with HAL abstraction'
  container: 'Podman / Docker Compose'
  repository: 'GitHub (public)'
  license: 'MIT'
  pwa: 'Service Worker + Dexie.js (IndexedDB)'
  voice: 'Whisper (server-side) + Browser SpeechRecognition'
  metrics: 'VictoriaMetrics'
---

# Architecture Decision Document

**Project:** APIS — Anti-Predator Interference System
**Repository:** `github.com/jermoo/apis` (public)
**License:** MIT
**Version:** 3.1 (Keycloak Migration)

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
Three-tier system architecture supporting edge hardware and full beekeeping portal:

**Tier 1 - Edge Device (Core):**
- Detection pipeline, servo/laser control, local clip storage, physical controls

**Tier 2 - Companion Portal (Supporting):**
- Hornet Dashboard: Activity visualization, pattern insights, clip archive
- Hive Diary: Inspections, treatments, feedings, harvests, equipment
- BeeBrain AI: Rule-based insights (MVP), ML model (future)
- Mobile PWA: Glove-friendly, offline-first, voice input

**Non-Functional Requirements:**
- Performance: ≥5 FPS detection, <500ms motion response, 45ms servo response
- Reliability: 8+ hours continuous operation without failure
- Storage: ~50 MB/day clips, ~1.5 GB/month
- Temperature: 5-35°C operating range
- Cost: <€50 for production hardware

**Scale & Complexity:**
- Primary domain: IoT/Embedded + Full-Stack Web
- Complexity level: Medium
- Estimated architectural components: 6-8

### Technical Constraints

| Constraint | Impact |
|------------|--------|
| Standalone operation required | Edge device cannot depend on server |
| Multi-hardware support (Pi 5, ESP32-CAM, XIAO) | Hardware abstraction required |
| Open source distribution | Architecture must be self-documenting |
| 5mW Class 3R laser limit | Safety interlocks in software |
| **Design for ESP32 constraints** | Pi 5 is dev board only |

### Cross-Cutting Concerns

1. **Offline Resilience** — Edge device works with zero connectivity
2. **Safety Interlocks** — Laser activation requires multi-condition validation
3. **Event-Driven** — Detection triggers: log → clip → notify → deter
4. **Hardware Abstraction** — Algorithm runs on Pi (OpenCV) and ESP32 (custom)
5. **AI-Manageable** — CLI with structured JSON output
6. **SaaS-Ready** — Architecture supports future multi-tenant expansion

---

## Technology Stack

### Overview

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **APIS Server** | Go 1.22 + Chi | Idiomatic, best AI code quality, SaaS-ready |
| **APIS Dashboard** | React + Refine + Ant Design | CRUD-optimized, user experience |
| **Charts** | @ant-design/charts | Activity Clock, pattern visualizations |
| **APIS Edge** | C / ESP-IDF | Single codebase with HAL for Pi and ESP32 |
| **Database** | YugabyteDB | PostgreSQL-compatible, distributed, scales horizontally |
| **Identity Provider** | Keycloak | Multi-tenant auth, OIDC/JWT, user management |
| **Metrics** | VictoriaMetrics | Time-series metrics, Prometheus-compatible |
| **Container** | Podman / Docker Compose | Rootless, OCI-compatible |
| **CI/CD** | GitHub Actions | Free, integrated with GHCR |
| **PWA Offline** | Service Worker + Dexie.js | IndexedDB wrapper, offline-first |
| **Voice Input** | Whisper (server) + Web Speech API | Server transcription + browser fallback |
| **Weather** | Open-Meteo API | Free, no API key required |

### Infrastructure Modes

**Deployment modes determined by `AUTH_MODE` environment variable.**

| Mode | AUTH_MODE | Database | Identity | Use Case |
|------|-----------|----------|----------|----------|
| **Standalone** | `local` | PostgreSQL or YugabyteDB | Local bcrypt + JWT | Solo beekeeper, small club |
| **SaaS** | `keycloak` | YugabyteDB (cluster) | Keycloak OIDC | Multi-tenant, commercial |
| **Development** | `local` | PostgreSQL (Docker) | Local auth | Local development |

**Standalone Mode:**
- Single default tenant (auto-created with UUID `00000000-0000-0000-0000-000000000000`)
- Local user management (bcrypt passwords, JWT tokens)
- No external identity provider required
- Setup wizard creates first admin user

**SaaS Mode:**
- Multi-tenant via Keycloak Organizations (v25+)
- Tenant ID from Keycloak `org_id` custom claim
- Super-admin control panel for tenant management
- Per-tenant limits and BeeBrain access control

See `docs/PRD-ADDENDUM-DUAL-AUTH-MODE.md` for complete dual auth architecture.

### Repository Structure

```
apis/
├── apis-server/          # Go + Chi backend
│   ├── cmd/              # Entry points
│   ├── internal/         # Private packages
│   ├── api/              # OpenAPI spec
│   └── Containerfile     # Podman build
├── apis-dashboard/       # React + Refine (built into server)
├── apis-edge/            # Edge device firmware (C with HAL)
│   ├── src/              # Shared C source code
│   ├── hal/              # Hardware Abstraction Layer
│   │   ├── pi/           # Pi-specific HAL implementation
│   │   └── esp32/        # ESP32-specific HAL implementation
│   └── platforms/        # Platform-specific build configs
├── hardware/             # Wiring diagrams, STL files
├── docs/                 # Documentation
├── .github/              # Actions, issue templates
├── CONTRIBUTING.md
├── LICENSE               # MIT
└── README.md
```

---

## Core Architectural Decisions

### Data Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Database** | YugabyteDB | PostgreSQL-compatible, distributed, RLS support |
| **Multi-Tenant** | tenant_id on all tables + RLS | Data isolation enforced at database level |
| **Clip Storage** | File system + DB metadata | Clips organized by tenant/unit |
| **Photo Storage** | File system + DB metadata | Inspection photos with thumbnails |
| **Auto-Pruning** | Retention policy per type | Clips: 30 days, Photos: 90 days, Logs: 7 days |

### Data Model (Multi-Tenant)

**Terminology Note:** "Units" = APIS hardware devices, "Detections" = hornet detection events

**Multi-Tenancy:** All tables include `tenant_id` with Row-Level Security (RLS) enforced.

```sql
-- Tenants (synced from Keycloak Organizations)
CREATE TABLE tenants (
    id TEXT PRIMARY KEY,                    -- Keycloak org_id
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'free',               -- 'free', 'hobby', 'pro'
    settings JSONB DEFAULT '{}',            -- Per-tenant configuration
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (supports both local auth and Keycloak modes)
-- See docs/PRD-ADDENDUM-DUAL-AUTH-MODE.md for dual auth architecture
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT,                     -- Local mode only (bcrypt)
    external_user_id TEXT,                  -- SaaS mode only (Keycloak sub)
    role TEXT NOT NULL DEFAULT 'member',    -- 'admin' or 'member'
    is_active BOOLEAN DEFAULT true,
    must_change_password BOOLEAN DEFAULT false,
    invited_by TEXT REFERENCES users(id),
    invited_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- Tenant limits (SaaS mode - configurable per tenant)
CREATE TABLE tenant_limits (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
    max_hives INTEGER DEFAULT 100,
    max_storage_bytes BIGINT DEFAULT 5368709120,  -- 5 GB
    max_units INTEGER DEFAULT 10,
    max_users INTEGER DEFAULT 20,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log (tracks all data modifications)
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,                   -- 'create', 'update', 'delete'
    entity_type TEXT NOT NULL,              -- 'inspection', 'hive', etc.
    entity_id TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invite tokens (for user invitations)
CREATE TABLE invite_tokens (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    email TEXT,                             -- NULL for shareable links
    role TEXT DEFAULT 'member',
    token TEXT UNIQUE NOT NULL,
    created_by TEXT REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BeeBrain configuration (system-wide and per-tenant overrides)
CREATE TABLE beebrain_config (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT REFERENCES tenants(id),  -- NULL = system default
    backend TEXT NOT NULL,                  -- 'rules', 'local', 'external'
    provider TEXT,                          -- 'openai', 'anthropic', etc.
    endpoint TEXT,                          -- For local model
    api_key_encrypted TEXT,                 -- For external API (encrypted)
    is_tenant_override BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)
);

-- Impersonation log (super-admin support sessions)
CREATE TABLE impersonation_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    super_admin_id TEXT NOT NULL REFERENCES users(id),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    actions_taken INTEGER DEFAULT 0
);

-- Sites (apiaries / physical locations)
CREATE TABLE sites (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    gps_lat DECIMAL(10, 7),
    gps_lng DECIMAL(10, 7),
    timezone TEXT DEFAULT 'UTC',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Units (APIS hardware devices)
CREATE TABLE units (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    site_id TEXT REFERENCES sites(id),
    serial TEXT NOT NULL,
    name TEXT,
    api_key TEXT NOT NULL UNIQUE,           -- Per-unit API key
    firmware_version TEXT,                  -- For OTA tracking
    ip_address TEXT,
    last_seen TIMESTAMPTZ,
    last_time_sync TIMESTAMPTZ,             -- Time synchronization tracking
    status TEXT DEFAULT 'offline',          -- 'online', 'offline', 'error'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hives
CREATE TABLE hives (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    site_id TEXT NOT NULL REFERENCES sites(id),
    name TEXT NOT NULL,
    queen_introduced_at DATE,
    queen_source TEXT,
    brood_boxes INTEGER DEFAULT 1,
    honey_supers INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unit-Hive coverage (which units protect which hives)
CREATE TABLE unit_hives (
    unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
    hive_id TEXT REFERENCES hives(id) ON DELETE CASCADE,
    PRIMARY KEY (unit_id, hive_id)
);

-- Inspections
CREATE TABLE inspections (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT NOT NULL REFERENCES hives(id),
    date DATE NOT NULL,
    queen_seen BOOLEAN,
    eggs_seen BOOLEAN,
    queen_cells INTEGER DEFAULT 0,
    brood_frames INTEGER,
    brood_pattern TEXT,                     -- 'solid', 'spotty', 'none'
    honey_stores TEXT,                      -- 'low', 'medium', 'high'
    pollen_stores TEXT,
    space_assessment TEXT,                  -- 'cramped', 'adequate', 'spacious'
    needs_super BOOLEAN DEFAULT FALSE,
    varroa_estimate INTEGER,                -- Mites per 100 bees
    temperament TEXT,                       -- 'calm', 'nervous', 'aggressive'
    issues TEXT,
    actions TEXT,
    notes TEXT,
    version INTEGER DEFAULT 1,              -- Optimistic locking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inspection photos
CREATE TABLE inspection_photos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    thumbnail_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Frame tracking per inspection (per box)
CREATE TABLE inspection_frames (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    box_number INTEGER NOT NULL,
    box_type TEXT NOT NULL,                 -- 'brood', 'super'
    total_frames INTEGER,
    drawn_comb INTEGER,
    brood_frames INTEGER,
    honey_frames INTEGER,
    pollen_frames INTEGER
);

-- Treatments (varroa, etc.)
CREATE TABLE treatments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT NOT NULL REFERENCES hives(id),
    date DATE NOT NULL,
    type TEXT NOT NULL,
    method TEXT,
    dose TEXT,
    mite_count_before INTEGER,
    mite_count_after INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feedings
CREATE TABLE feedings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT NOT NULL REFERENCES hives(id),
    date DATE NOT NULL,
    type TEXT NOT NULL,
    amount DECIMAL(10, 2),
    concentration TEXT,                     -- e.g., '2:1', '1:1'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Harvests
CREATE TABLE harvests (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT NOT NULL REFERENCES hives(id),
    date DATE NOT NULL,
    frames_harvested INTEGER,
    amount_kg DECIMAL(10, 2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Equipment log (entrance reducers, queen excluders, etc.)
CREATE TABLE equipment_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT NOT NULL REFERENCES hives(id),
    equipment_type TEXT NOT NULL,
    installed_at DATE,
    removed_at DATE,
    notes TEXT
);

-- Custom labels (user-defined categories)
CREATE TABLE custom_labels (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    category TEXT NOT NULL,                 -- 'feed_type', 'treatment_type', 'equipment', 'issue'
    label TEXT NOT NULL,
    UNIQUE(tenant_id, category, label)
);

-- Detections (hornet detection events from units)
CREATE TABLE detections (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    unit_id TEXT NOT NULL REFERENCES units(id),
    timestamp TIMESTAMPTZ NOT NULL,
    clip_path TEXT,
    confidence DECIMAL(5, 4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily stats (aggregated per unit per day)
CREATE TABLE daily_stats (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    unit_id TEXT NOT NULL REFERENCES units(id),
    date DATE NOT NULL,
    detection_count INTEGER DEFAULT 0,
    weather_temp DECIMAL(5, 2),
    weather_desc TEXT,
    weather_conditions JSONB,
    UNIQUE(unit_id, date)
);

-- Future: Sensor readings
CREATE TABLE sensor_readings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    unit_id TEXT NOT NULL REFERENCES units(id),
    timestamp TIMESTAMPTZ NOT NULL,
    sensor_type TEXT NOT NULL,              -- 'temp_inside', 'temp_outside', 'humidity', 'weight'
    value DECIMAL(10, 4)
);

-- Indexes for performance
CREATE INDEX idx_sites_tenant ON sites(tenant_id);
CREATE INDEX idx_units_tenant ON units(tenant_id);
CREATE INDEX idx_units_api_key ON units(api_key);
CREATE INDEX idx_hives_tenant ON hives(tenant_id);
CREATE INDEX idx_hives_site ON hives(site_id);
CREATE INDEX idx_detections_unit_timestamp ON detections(unit_id, timestamp DESC);
CREATE INDEX idx_inspections_hive_date ON inspections(hive_id, date DESC);
```

### Row-Level Security (RLS)

All tables enforce tenant isolation at the database level:

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE hives ENABLE ROW LEVEL SECURITY;
-- (etc. for all tables)

-- Create isolation policy (applied to each table)
CREATE POLICY tenant_isolation ON sites
    USING (tenant_id = current_setting('app.tenant_id'));

-- Go code sets tenant context per request
-- conn.Exec(ctx, "SET app.tenant_id = $1", tenantID)
```

### Data Hierarchy

```
Keycloak Organization (= Tenant)
└── Tenant in APIS DB
    └── Sites (physical apiaries)
        └── Site "Home Apiary"
            ├── Units (APIS hardware)
            │   ├── Unit A → covers Hives 1, 2
            │   └── Unit B → covers Hives 3, 4
            └── Hives
                └── Hive 1
                    ├── Inspections (with photos, frame tracking)
                    ├── Treatments
                    ├── Feedings
                    ├── Harvests
                    └── Equipment log
```

### Authentication & Security

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Identity Provider** | Keycloak | Multi-tenant, OIDC/OAuth2, handles users |
| **Dashboard Auth** | OIDC + JWT | Keycloak issues tokens, server validates |
| **PWA Auth** | Long-lived device token | 30-day token stored in IndexedDB for offline |
| **Device Auth** | Per-unit API key | Unique key per unit, scoped to tenant |
| **Transport** | HTTPS required | Public internet, open source |
| **CSRF Protection** | SameSite=Strict + CSRF tokens | Required for cookie-based flows |
| **Rate Limiting** | Per-IP on auth/upload/transcribe | Prevents brute force |
| **Secrets** | Environment variables | Never hardcoded |

### Keycloak Integration

**Realm:** APIS uses the `honeybee` realm in the shared Keycloak instance (managed by Keycloak Operator in K3s). See `prd-addendum-keycloak-migration.md` for full detail.

**Authentication Flow:**
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  Keycloak   │────▶│ APIS Server │
│   (PWA)     │◀────│   (IdP)     │◀────│   (Go+Chi)  │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                    │
      │  1. Login redirect │                    │
      │───────────────────▶│  (Authorization    │
      │                    │   Code + PKCE)     │
      │  2. Auth + consent │                    │
      │◀───────────────────│                    │
      │                    │                    │
      │  3. Code exchange  │                    │
      │     → JWT tokens   │                    │
      │◀───────────────────│                    │
      │                    │                    │
      │  4. API call + JWT │                    │
      │────────────────────┼───────────────────▶│
      │                    │                    │
      │                    │  5. Validate JWT   │
      │                    │     (JWKS sig +    │
      │                    │      issuer +      │
      │                    │      claims)       │
      │                    │                    │
      │  6. Response       │                    │
      │◀───────────────────┼────────────────────│
```

**OIDC Discovery:**
```
https://keycloak.example.com/realms/honeybee/.well-known/openid-configuration
```
Note: Keycloak includes `/realms/{name}` in the issuer URL, unlike flat-path IdPs.

**JWT Claims Structure (from Keycloak):**
```json
{
  "iss": "https://keycloak.example.com/realms/honeybee",
  "sub": "user_abc123",
  "email": "jermoo@example.com",
  "name": "Jermoo",
  "preferred_username": "jermoo",
  "realm_access": {
    "roles": ["admin", "user"]
  },
  "org_id": "tenant_xyz789",
  "org_name": "Jermoo's Apiary",
  "exp": 1737590400
}
```

**Critical Keycloak Configuration:**
- Protocol mappers for `realm_access.roles` must be explicitly added to the `roles` client scope (roles are NOT included by default — #1 integration pitfall)
- Custom mappers for `org_id` and `org_name` (from Keycloak Organizations v25+)
- Direct Access Grants **disabled** on all clients (OAuth 2.1 compliance)
- PKCE `S256` enforced (not just supported)
- Full Scope Allowed **disabled** (least privilege)

**Go Middleware:**
```go
func AuthMiddleware(keycloakIssuer string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            token := extractBearerToken(r)
            claims, err := validateJWT(token, keycloakIssuer) // JWKS via go-jose/v4
            if err != nil {
                respondError(w, "Unauthorized", 401)
                return
            }

            // Set tenant context for RLS
            ctx := context.WithValue(r.Context(), "tenant_id", claims.OrgID)
            ctx = context.WithValue(ctx, "user_id", claims.Sub)
            ctx = context.WithValue(ctx, "roles", claims.RealmRoles)

            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

**Token Lifetime Configuration (realm-level):**

| Setting | Value | Keycloak Config Key |
|---------|-------|---------------------|
| Access token | 15 minutes | `accessTokenLifespan` |
| SSO session idle | 12 hours | `ssoSessionIdleTimeout` |
| SSO session max | 72 hours | `ssoSessionMaxLifespan` |
| Refresh token | 30 minutes (with rotation) | Client-level override |

**Dashboard OIDC:** `react-oidc-context` + `oidc-client-ts` (replaces `@zitadel/react`). Token storage in-memory (`InMemoryWebStorage`). Refresh via refresh tokens (not iframe-based silent refresh).

**Machine Users / Service Accounts:** Keycloak uses `client_credentials` grant with `client_id` + `client_secret` (replaces Zitadel's JWT profile auth with RSA key pairs).

**Roles (differ by deployment mode):**

*Standalone Mode (AUTH_MODE=local):*
| Role | Permissions |
|------|-------------|
| `admin` | Full access, can manage users, tenant settings |
| `member` | CRUD own data, view shared data |

*SaaS Mode (AUTH_MODE=keycloak):*
| Role | Permissions |
|------|-------------|
| `owner` | Full access, can manage users (from Keycloak) |
| `admin` | Full access to data, no user management |
| `member` | Create/edit own data |
| `readonly` | View only |

*Super-Admin (SaaS only):*
| Role | Permissions |
|------|-------------|
| `super_admin` | Manage all tenants, system BeeBrain config, impersonation |

Super-admin determined by `SUPER_ADMIN_EMAILS` environment variable.

### Per-Unit API Keys

Each unit has a unique API key generated during enrollment:

```go
// Enrollment generates unique key
func EnrollUnit(tenantID, serial string) (*Unit, error) {
    apiKey := generateSecureKey()  // 32-byte random, base64
    unit := &Unit{
        ID:        uuid.New().String(),
        TenantID:  tenantID,
        Serial:    serial,
        APIKey:    apiKey,
    }
    return storage.CreateUnit(unit)
}

// Validation checks key AND tenant
func ValidateUnitAPIKey(apiKey string) (*Unit, error) {
    unit := storage.GetUnitByAPIKey(apiKey)
    if unit == nil {
        return nil, errors.New("invalid API key")
    }
    return unit, nil
}
```

**Device requests include:**
```
POST /api/units/{id}/heartbeat
X-API-Key: unit_abc123_secretkey...
```

### Device Provisioning

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **WiFi AP Mode** | No | Complexity, not needed with USB |
| **Primary Config** | Serial CLI | Works on all hardware |
| **Secondary Config** | Config file | For pre-configured deployments |
| **Auto-Discovery** | mDNS (`apis-server.local`) | Zero-config LAN |

### Device Discovery (Tiered)

```
Boot Sequence:
1. Check saved config → Use if exists
2. Try mDNS: apis-server.local → Zero-config LAN
3. Try default: apis.honeybeegood.be → Future SaaS
4. No server → LED "needs setup", wait for serial config
```

**Reset:** Hold button 10 seconds → Wipe config, restart discovery

### Device Management Interface

| Feature | Included | Notes |
|---------|----------|-------|
| Serial CLI | Yes | Primary, `--json` for AI |
| HTTP `/status` | Yes | Lightweight |
| HTTP `/reboot` | Yes | Minimal |
| SSH | No | ESP32 can't do it |
| Full REST API | No | Too heavy |

### Communication Pattern

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Direction** | Device pushes to server | Works through NAT |
| **Heartbeat** | POST every 60s | Server knows device alive |
| **Clips** | Device POSTs to server | Server stores on disk |
| **Time Sync** | Server returns time in heartbeat | ESP32 clock drift correction |
| **Commands** | Minimal (reboot, update) | Keep ESP32 simple |

### Heartbeat Protocol

**Request (from Unit):**
```json
POST /api/units/{id}/heartbeat
X-API-Key: unit_abc123_secretkey...

{
  "firmware_version": "1.2.3",
  "uptime_seconds": 3600,
  "detection_count_since_last": 5,
  "cpu_temp": 42.5,
  "free_heap": 128000,
  "local_time": "2026-01-22T14:30:00Z"
}
```

**Response (from Server):**
```json
{
  "server_time": "2026-01-22T14:30:05Z",
  "time_drift_ms": 5000,
  "update_available": true,
  "update_url": "https://apis.example.com/firmware/1.2.4.bin"
}
```

**Unit Behavior:**
- If `time_drift_ms > 1000`: Adjust local clock
- If `update_available`: Queue OTA update (non-blocking)

### OTA Firmware Updates

ESP32 uses ESP-IDF native OTA with signed binaries:

```
┌─────────────┐                    ┌─────────────┐
│    Unit     │                    │ APIS Server │
│   (ESP32)   │                    │             │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  1. Heartbeat (version=1.2.3)   │
       │ ────────────────────────────────▶│
       │                                  │
       │  2. update_available=true        │
       │     update_url=.../1.2.4.bin     │
       │ ◀────────────────────────────────│
       │                                  │
       │  3. Download firmware (HTTPS)    │
       │ ────────────────────────────────▶│
       │                                  │
       │  4. Binary (signed)              │
       │ ◀────────────────────────────────│
       │                                  │
       │  5. Verify signature             │
       │  6. Write to OTA partition       │
       │  7. Reboot to new firmware       │
       │                                  │
       │  8. Heartbeat (version=1.2.4)   │
       │ ────────────────────────────────▶│
```

**Security:**
- Firmware binaries signed with project private key
- ESP32 verifies signature before applying
- Rollback protection: boot counter, mark valid after successful run

**Server-side:**
```go
// Firmware metadata
type Firmware struct {
    Version   string    `json:"version"`
    URL       string    `json:"url"`
    Checksum  string    `json:"checksum"`  // SHA256
    MinVersion string   `json:"min_version"`  // Rollback protection
    ReleasedAt time.Time `json:"released_at"`
}
```

### Upload Resilience

**Problem:** Network flakiness near hives can interrupt clip uploads.

**Solution:** Retry with exponential backoff + local spool.

**Unit Behavior:**
```
On Detection:
1. Save clip to local spool (max 50 clips, ~500MB)
2. Try upload immediately
3. If fail: retry with backoff (1s, 2s, 4s, 8s, max 60s)
4. If spool full: evict oldest clips
5. Continue detection during upload failures
```

**Server Response Codes:**
| Code | Meaning | Unit Action |
|------|---------|-------------|
| 200 | Success | Remove from spool |
| 429 | Rate limited | Back off, retry later |
| 503 | Server overloaded | Back off, retry later |
| 413 | Clip too large | Drop clip, log error |

---

## Frontend Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Data Provider** | Refine built-in REST provider | Works with any REST API |
| **Real-Time Updates** | Polling (30s interval) | Simple, adequate for status |
| **Live Video** | WebSocket proxy through server | Avoids HTTPS mixed-content blocking |
| **Charts** | @ant-design/charts | Activity Clock (polar), scatter, line charts |
| **Layout** | Ant Design ProLayout | Sidebar navigation with collapsible menu |
| **Theme** | Honey Beegood colors | Primary: #f7a42d, Background: #fbf9e7, Text: #662604 |

### Frontend Architecture Pattern (Layered Hooks Architecture)

**Pattern Name:** Layered Hooks Architecture — a React-specific adaptation of Clean Architecture principles.

**Core Principle:** Separation of concerns through explicit layers. Each layer has a single responsibility and communicates only with adjacent layers.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│   │   Services   │───▶│  Providers   │───▶│    Hooks     │───▶│   Pages  │  │
│   │  (services/) │    │ (providers/) │    │   (hooks/)   │    │ (pages/) │  │
│   └──────────────┘    └──────────────┘    └──────────────┘    └────┬─────┘  │
│         │                    │                   │                  │        │
│   IndexedDB, sync      API client,         Business logic,    Route entry,  │
│   queue, offline       auth tokens         state, derived     compose       │
│   storage              management          values, effects    components    │
│                                                                    │        │
│                                            ┌──────────────┐        │        │
│                                            │  Components  │◀───────┘        │
│                                            │(components/) │                 │
│                                            └──────────────┘                 │
│                                                   │                         │
│                                            UI rendering,                    │
│                                            event handlers,                  │
│                                            local UI state                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Layer Responsibilities:**

| Layer | Location | Responsibility | Can Import From |
|-------|----------|----------------|-----------------|
| **Services** | `services/` | Low-level data operations (IndexedDB, sync queue, offline cache) | External libs only |
| **Providers** | `providers/` | API communication, auth token management, Refine integration | Services |
| **Hooks** | `hooks/` | Business logic, server state, derived values, side effects | Providers, Services |
| **Components** | `components/` | UI rendering, local UI state, event handlers | Hooks (via props) |
| **Pages** | `pages/` | Route entry points, compose components, connect hooks to components | Hooks, Components |

**Rules (Enforced by Convention):**

1. **Components are dumb** — Components receive data via props and emit events. They don't call APIs directly.
2. **Hooks own business logic** — All data fetching, mutations, and derived state live in hooks.
3. **Services are pure** — Services have no React dependencies. They're plain TypeScript.
4. **Pages are thin** — Pages wire hooks to components. Minimal logic.
5. **No prop drilling** — Use hooks directly in components that need data, not prop chains.

**State Management Approach:**

| State Type | Location | Example |
|------------|----------|---------|
| Server state | Hooks via Refine `useList`, `useOne`, `useCreate` | Hives, inspections, clips |
| Local UI state | Component `useState` | Modal open/close, form input |
| Shared UI state | React Context | Time range selector, site filter |
| Offline state | Services + Hooks | IndexedDB via `useOfflineSync` |

**When to Create What:**

| Scenario | Create |
|----------|--------|
| Fetching/mutating server data | Hook (e.g., `useHives`, `useCreateInspection`) |
| Reusable UI element | Component (e.g., `HiveCard`, `TimeRangeSelector`) |
| Low-level data operation | Service (e.g., `offlineCache.ts`, `syncQueue.ts`) |
| Page-specific composition | Page (e.g., `HiveDetail.tsx`) |
| Shared app-wide state | Context + Hook (e.g., `TimeRangeContext` + `useTimeRange`) |

### Live Video Streaming (WebSocket Proxy)

**Problem:** Dashboard served over HTTPS, but direct MJPEG from device is HTTP. Browsers block mixed content.

**Solution:** Server proxies video stream over WebSocket (WSS).

```
┌─────────────┐       WSS        ┌─────────────┐       HTTP       ┌─────────────┐
│   Browser   │ ◀──────────────▶ │ APIS Server │ ◀──────────────▶ │    Unit     │
│   (React)   │  /ws/stream/{id} │   (Go+Chi)  │  :8080/stream    │   (ESP32)   │
└─────────────┘                  └─────────────┘                  └─────────────┘
```

**Server-side (Go):**
```go
func StreamHandler(w http.ResponseWriter, r *http.Request) {
    unitID := chi.URLParam(r, "id")
    unit := storage.GetUnit(unitID)

    // Upgrade to WebSocket
    conn, _ := upgrader.Upgrade(w, r, nil)
    defer conn.Close()

    // Connect to device MJPEG
    resp, _ := http.Get(fmt.Sprintf("http://%s:8080/stream", unit.IPAddress))
    defer resp.Body.Close()

    // Relay frames
    reader := bufio.NewReader(resp.Body)
    for {
        frame, _ := readMJPEGFrame(reader)
        conn.WriteMessage(websocket.BinaryMessage, frame)
    }
}
```

**Client-side (React):**
```typescript
function LiveStream({ unitId }: { unitId: string }) {
    const [imageSrc, setImageSrc] = useState<string>('');

    useEffect(() => {
        const ws = new WebSocket(`wss://${host}/ws/stream/${unitId}`);
        ws.onmessage = (event) => {
            const blob = new Blob([event.data], { type: 'image/jpeg' });
            setImageSrc(URL.createObjectURL(blob));
        };
        return () => ws.close();
    }, [unitId]);

    return <img src={imageSrc} alt="Live stream" />;
}
```

**Latency:** Adds ~50-100ms vs direct connection. Acceptable for monitoring.

### Dashboard Pages (Complete)

**Core Navigation (Sidebar):**
```
/                           # Dashboard home (Daily Glance, Activity Clock)
/units                      # Unit (device) list and management
/units/:id                  # Unit detail + live stream + detections
/clips                      # Clip archive with search/filter
/clips/:id                  # Clip detail + video player
/hives                      # Hive list (all sites or filtered)
/hives/:id                  # Hive detail + timeline
/hives/:id/inspect          # New inspection form
/diary                      # Diary module entry (inspection list)
/stats                      # Statistics and analytics
/settings                   # Server configuration
/settings/labels            # Custom label management
/settings/export            # Data export
/login                      # Authentication
```

**Hive Sub-Routes:**
```
/hives/:id/inspections      # Inspection history
/hives/:id/inspections/:id  # Inspection detail
/hives/:id/treatments       # Treatment history
/hives/:id/feedings         # Feeding history
/hives/:id/harvests         # Harvest history
/hives/:id/equipment        # Equipment log
/hives/:id/sensors          # Sensor data (future)
```

**Site Management:**
```
/sites                      # Site (apiary) list
/sites/:id                  # Site detail with hives and units
```

**Navigation Structure:**
```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────┐                                                     │
│ │ 🐝 APIS │                    Main Content Area                │
│ ├─────────┤                                                     │
│ │         │  ┌───────────────────────────────────────────────┐  │
│ │ □ Dash  │  │                                               │  │
│ │ □ Units │  │   [Site ▼] [Unit ▼] [Hive ▼]                 │  │
│ │ □ Hives │  │   [< Day >] [Week] [Month] [Season] [Year]   │  │
│ │ □ Diary │  │                                               │  │
│ │ □ Clips │  │   Content...                                  │  │
│ │ □ Stats │  │                                               │  │
│ │         │  └───────────────────────────────────────────────┘  │
│ ├─────────┤                                                     │
│ │ ⚙ Set.  │                                                     │
│ │ 👤 User │                                                     │
│ └─────────┘                                                     │
└─────────────────────────────────────────────────────────────────┘
```

### PWA Architecture (Offline-First)

```
┌─────────────────────────────────────────────┐
│              Browser (PWA)                   │
├─────────────────────────────────────────────┤
│  Service Worker                              │
│  ├── App shell caching (HTML, JS, CSS)       │
│  ├── API response caching                    │
│  └── Background sync queue                   │
│                                              │
│  IndexedDB (via Dexie.js)                    │
│  ├── inspections (offline drafts)            │
│  ├── photos (pending upload)                 │
│  ├── syncQueue (pending API calls)           │
│  └── cachedData (hives, units, etc.)         │
└─────────────────────────────────────────────┘
```

| Feature | Offline Behavior |
|---------|------------------|
| View dashboard | Cached data from last sync |
| Create inspection | Saved locally → synced when online |
| Add photo | Stored in IndexedDB → uploaded when online |
| Voice notes | Browser SpeechRecognition (native) |

**Sync Status Indicator:**
```
⚡ Offline — 3 inspections pending sync
✓ Synced
```

### Code Splitting (Bundle Optimization)

React lazy loading reduces initial bundle from ~4.6MB to ~350KB, enabling fast first paint and PWA compliance (Workbox requires chunks <2MB).

```
┌─────────────────────────────────────────────────────────────┐
│                    Code Splitting Strategy                   │
├─────────────────────────────────────────────────────────────┤
│  Critical Path (Eager - in main bundle)                      │
│  ├── Dashboard, Login, Setup, Callback                       │
│  └── ~350KB initial load                                     │
│                                                              │
│  Lazy Loaded (On-demand chunks)                              │
│  ├── pages/lazy.tsx    → All page components                 │
│  ├── components/lazy.tsx → Heavy components (charts, maps)   │
│  └── Loaded when route/component first accessed              │
│                                                              │
│  Chunk Groups (shared caching)                               │
│  ├── page-sites, page-hives, page-units (by domain)          │
│  ├── comp-charts (Ant Charts ~1.4MB)                         │
│  ├── comp-maps (Leaflet ~150KB)                              │
│  └── comp-qr (QR scanner/generator ~360KB)                   │
└─────────────────────────────────────────────────────────────┘
```

| Pattern | Location | Usage |
|---------|----------|-------|
| Page lazy exports | `pages/lazy.tsx` | All lazy page components with `Lazy*` prefix |
| Component lazy exports | `components/lazy.tsx` | Heavy visualization components |
| Route wrapper | `App.tsx` → `LazyRoute` | Wraps lazy pages in ErrorBoundary + Suspense |
| Chunk naming | `/* webpackChunkName: "x" */` | Groups related code for caching |

**Chunk Load Error Handling:**

When deployments change chunk hashes, users with cached HTML may fail to load new chunks. The `ErrorBoundary` component detects chunk errors (across Chrome, Safari, Firefox) and shows an "Update Available" prompt with reload button instead of crashing.

**Constraint:** All chunks must stay under 2MB for Workbox precaching. Heavy vendor chunks (antd ~1.3MB, charts ~1.4MB) are acceptable as they're loaded on-demand, not precached.

### Mobile Design (Glove-Friendly)

| Standard | APIS Mobile |
|----------|-------------|
| 44px tap targets | **64px minimum** |
| Small checkboxes | Large toggle switches |
| Keyboard input | Voice input primary |
| Precise gestures | Swipe navigation |
| 16px body text | 18px body text |

### Emotional Moments (Client-Side)

Milestone celebrations are handled entirely in the React frontend — no server endpoints needed:

| Moment | Detection Logic | UI Response |
|--------|-----------------|-------------|
| First harvest | `harvests.length === 1` | Celebration modal + photo prompt |
| Successful overwintering | Spring inspection after winter | Winter survival report |
| Swarm capture | User creates hive with source="swarm" | Quick-add flow |
| Losing a hive | User marks hive inactive | Post-mortem wizard |
| Season end | Date-based (Nov 1st) | Season recap with stats |

Implementation: React components detect conditions from data and render appropriate UI.

---

## Infrastructure & Deployment

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Container Strategy** | Docker Compose (multi-service) | Server + Keycloak + YugabyteDB |
| **Container Runtime** | Podman / Docker Compose | Rootless, OCI-compatible |
| **CI/CD** | GitHub Actions → GHCR | Free, integrated |
| **Logging** | Structured JSON (stdout) | Container-friendly, AI-parseable |
| **Metrics** | VictoriaMetrics | Prometheus-compatible, efficient |
| **Health Checks** | `/health` endpoint | Liveness + readiness probes |
| **Configuration** | Config file + env overrides | Flexible for users |

### Self-Hosted Deployment (Docker Compose)

```yaml
# docker-compose.yml
version: '3.8'

services:
  apis-server:
    image: ghcr.io/jermoo/apis-server:latest
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://yugabyte:yugabyte@yugabyte:5433/apis
      - KEYCLOAK_ISSUER=http://keycloak:8080/realms/honeybee
      - KEYCLOAK_CLIENT_ID=${KEYCLOAK_CLIENT_ID}
      - CLIPS_PATH=/data/clips
      - PHOTOS_PATH=/data/photos
    volumes:
      - ./data:/data
    depends_on:
      - yugabyte
      - keycloak
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  yugabyte:
    image: yugabytedb/yugabyte:2.20-latest
    command: bin/yugabyted start --daemon=false --tserver_flags="ysql_enable_auth=false"
    ports:
      - "5433:5433"   # YSQL (PostgreSQL)
      - "7000:7000"   # Admin UI
    volumes:
      - yugabyte-data:/home/yugabyte/yb_data
    healthcheck:
      test: ["CMD", "yugabyted", "status"]
      interval: 30s
      timeout: 10s
      retries: 5

  keycloak-db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=keycloak
      - POSTGRES_USER=keycloak
      - POSTGRES_PASSWORD=${KC_DB_PASSWORD:-keycloak}
    volumes:
      - keycloak-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 10s
      timeout: 5s
      retries: 5

  keycloak:
    image: quay.io/keycloak/keycloak:25-alpine
    command: start-dev --import-realm
    environment:
      - KC_DB=postgres
      - KC_DB_URL=jdbc:postgresql://keycloak-db:5432/keycloak
      - KC_DB_USERNAME=keycloak
      - KC_DB_PASSWORD=${KC_DB_PASSWORD:-keycloak}
      - KC_HOSTNAME=localhost
      - KC_HOSTNAME_PORT=8081
      - KC_HOSTNAME_STRICT=false
      - KC_PROXY_HEADERS=xforwarded
      - KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN:-admin}
      - KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-admin}
    ports:
      - "8081:8080"   # Keycloak Admin + OIDC
    volumes:
      - ./deploy/keycloak/realm-honeybee.json:/opt/keycloak/data/import/realm-honeybee.json:ro
    depends_on:
      keycloak-db:
        condition: service_healthy

  # Optional: Metrics
  victoriametrics:
    image: victoriametrics/victoria-metrics:latest
    ports:
      - "8428:8428"
    volumes:
      - vm-data:/victoria-metrics-data
    command:
      - "-storageDataPath=/victoria-metrics-data"
      - "-retentionPeriod=90d"
    profiles:
      - metrics  # Only starts with --profile metrics

volumes:
  yugabyte-data:
  keycloak-db-data:
  vm-data:
```

### Quick Start (Self-Hosted)

```bash
# 1. Clone repository
git clone https://github.com/jermoo/apis.git
cd apis

# 2. Configure environment
cp .env.saas.example .env
# Edit .env to set KEYCLOAK_ADMIN_PASSWORD, KC_DB_PASSWORD, etc.

# 3. Start services
docker-compose --profile saas up -d

# 4. Wait for initialization (~60s first time)
docker-compose logs -f keycloak  # Watch for "Listening on: http://0.0.0.0:8080"

# 5. Access
# - Dashboard: http://localhost:8080
# - Keycloak Admin: http://localhost:8081 (admin / admin)
# - YugabyteDB Admin: http://localhost:7000
```

### Environment Variables

**Required (Both Modes):**
```bash
AUTH_MODE=local|keycloak              # REQUIRED: Determines auth mode
DATABASE_URL=postgres://...          # Database connection string
JWT_SECRET=<random-32-chars>         # For JWT signing (both modes)
```

**Standalone Mode Only (AUTH_MODE=local):**
```bash
SESSION_DURATION=168h                # Login session duration (default 7 days)
PASSWORD_MIN_LENGTH=8                # Minimum password length
# Optional SMTP for email invites:
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=noreply@example.com
```

**SaaS Mode Only (AUTH_MODE=keycloak):**
```bash
KEYCLOAK_ISSUER=https://keycloak.example.com/realms/honeybee
KEYCLOAK_CLIENT_ID=...               # Public SPA client ID
KEYCLOAK_SERVICE_CLIENT_ID=...       # Service account client ID
KEYCLOAK_SERVICE_CLIENT_SECRET=...   # For backend operations (client_credentials)
SUPER_ADMIN_EMAILS=admin@example.com # Comma-separated super-admin emails
```

**Rate Limiting (Both Modes):**
```bash
RATE_LIMIT_LOGIN=5                   # Max login attempts per email per 15 min
RATE_LIMIT_IP=20                     # Max attempts per IP per 15 min
```

### Container Build

```dockerfile
# Containerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o apis-server ./cmd/server

FROM alpine:latest
RUN apk add --no-cache ca-certificates curl
COPY --from=builder /app/apis-server /usr/local/bin/
COPY --from=builder /app/apis-dashboard/dist /var/www/dashboard
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1
CMD ["apis-server"]
```

### Health Endpoint

```go
// GET /health
func HealthHandler(db *sql.DB) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        health := map[string]any{
            "status":  "ok",
            "version": Version,
            "checks": map[string]string{},
        }

        // Check database
        if err := db.Ping(); err != nil {
            health["status"] = "degraded"
            health["checks"].(map[string]string)["database"] = "error"
        } else {
            health["checks"].(map[string]string)["database"] = "ok"
        }

        w.Header().Set("Content-Type", "application/json")
        if health["status"] == "ok" {
            w.WriteHeader(200)
        } else {
            w.WriteHeader(503)
        }
        json.NewEncoder(w).Encode(health)
    }
}
```

### SaaS Deployment (Kubernetes)

For production SaaS, deploy to Kubernetes with:

| Component | Configuration |
|-----------|---------------|
| APIS Server | Deployment (3+ replicas), HPA |
| YugabyteDB | YugabyteDB Operator (3-node cluster) |
| Keycloak | Keycloak Operator (K3s, managed via KeycloakRealmImport CRD) |
| VictoriaMetrics | VMCluster for HA |
| Ingress | NGINX Ingress + cert-manager |

*Kubernetes manifests provided in `/deploy/kubernetes/`*

---

## Implementation Patterns & Consistency Rules

### Naming Conventions

**Database (SQLite):**

| Element | Convention | Example |
|---------|------------|---------|
| Tables | snake_case, plural | `units`, `hives`, `detections`, `daily_stats` |
| Columns | snake_case | `unit_id`, `hive_id`, `created_at`, `clip_path` |
| Foreign keys | `{table}_id` | `unit_id`, `site_id`, `hive_id` |
| Indexes | `idx_{table}_{column}` | `idx_detections_timestamp` |

**API (Go + Chi):**

| Element | Convention | Example |
|---------|------------|---------|
| Endpoints | plural nouns | `/api/units`, `/api/hives` |
| Route params | `{id}` | `/api/units/{id}` |
| Query params | snake_case | `?unit_id=abc&start_date=2026-01-01` |
| Headers | `X-` prefix for custom | `X-API-Key` |

### Complete API Endpoints

**Authentication (Dual Mode — see docs/PRD-ADDENDUM-DUAL-AUTH-MODE.md):**

*Both Modes:*
```
GET    /api/auth/config             # Returns mode, setup_required, Keycloak config (if SaaS)
GET    /api/auth/me                 # Current user info (from JWT/session)
POST   /api/auth/device-token       # Exchange for long-lived device token (PWA)
DELETE /api/auth/device-token       # Revoke device token
```

*Standalone Mode Only (AUTH_MODE=local):*
```
POST   /api/auth/login              # Email + password → JWT
POST   /api/auth/logout             # Clear session
POST   /api/auth/change-password    # Change password (requires current password)
POST   /api/auth/setup              # First-run: create admin user (only when no users exist)
```

*SaaS Mode Only (AUTH_MODE=keycloak):*
```
Note: Login/logout handled by Keycloak OIDC redirect flow (Authorization Code + PKCE).
```

**User Management (Standalone Mode):**
```
GET    /api/users                   # List tenant users (admin only)
POST   /api/users                   # Create user (admin only)
GET    /api/users/{id}              # Get user details
PUT    /api/users/{id}              # Update user
DELETE /api/users/{id}              # Delete user (admin only)
POST   /api/users/invite            # Generate invite link/email
GET    /api/invite/{token}          # Validate invite token
POST   /api/invite/{token}/accept   # Accept invite, create account
```

**Super-Admin (SaaS Mode Only):**
```
GET    /api/admin/tenants           # List all tenants
POST   /api/admin/tenants           # Create tenant
GET    /api/admin/tenants/{id}      # Tenant details + usage stats
PUT    /api/admin/tenants/{id}      # Update tenant (limits, status)
DELETE /api/admin/tenants/{id}      # Delete tenant
POST   /api/admin/tenants/{id}/invite      # Invite tenant admin
POST   /api/admin/tenants/{id}/impersonate # Start support session
DELETE /api/admin/impersonate              # End support session
GET    /api/admin/beebrain          # System BeeBrain config
PUT    /api/admin/beebrain          # Update system BeeBrain config
PUT    /api/admin/tenants/{id}/beebrain    # Per-tenant BeeBrain access
```

**Audit & Activity:**
```
GET    /api/audit                   # Query audit log (admin only)
GET    /api/activity                # Activity feed for dashboard
```

**Sites (Apiaries):**
```
GET    /api/sites                   # List user's sites
POST   /api/sites                   # Create site
GET    /api/sites/{id}              # Get site details
PUT    /api/sites/{id}              # Update site
DELETE /api/sites/{id}              # Delete site
```

**Units (APIS Hardware Devices):**
```
GET    /api/units                   # List all units
POST   /api/units                   # Register new unit
GET    /api/units/{id}              # Get unit details
PUT    /api/units/{id}              # Update unit
DELETE /api/units/{id}              # Delete unit
POST   /api/units/{id}/heartbeat    # Device heartbeat (X-API-Key)
POST   /api/units/{id}/clips        # Upload clip (X-API-Key)
GET    /api/units/{id}/detections   # Get detections for unit
GET    /api/units/{id}/hives        # Get hives covered by this unit
PUT    /api/units/{id}/hives        # Update hive coverage (body: {hive_ids: [...]})
GET    /api/units/{id}/sensors      # Get sensor readings from unit (future)
```

**Hives:**
```
GET    /api/hives                   # List all hives (filterable by site)
POST   /api/hives                   # Create hive
GET    /api/hives/{id}              # Get hive details
PUT    /api/hives/{id}              # Update hive
DELETE /api/hives/{id}              # Delete hive
GET    /api/hives/{id}/timeline     # Unified hive timeline
GET    /api/hives/{id}/units        # Get units protecting this hive
GET    /api/hives/{id}/sensors      # Get sensor readings for hive (future)
```

**Inspections:**
```
GET    /api/hives/{id}/inspections  # List inspections for hive
POST   /api/hives/{id}/inspections  # Create inspection (frames embedded in body)
GET    /api/inspections/{id}        # Get inspection detail (includes frames)
PUT    /api/inspections/{id}        # Update inspection
DELETE /api/inspections/{id}        # Delete inspection
GET    /api/inspections/{id}/photos # List photos for inspection
POST   /api/inspections/{id}/photos # Upload photo
DELETE /api/inspections/{id}/photos/{photo_id}  # Delete photo
```

**Note:** Frame tracking is embedded in inspection payloads, not separate endpoints:
```json
{
  "queen_seen": true,
  "brood_frames": 5,
  "frames": [
    {"box_number": 1, "box_type": "brood", "total_frames": 10, "drawn_comb": 8, ...},
    {"box_number": 2, "box_type": "super", "total_frames": 10, "honey_frames": 6, ...}
  ]
}
```

**Treatments:**
```
GET    /api/hives/{id}/treatments   # List treatments for hive
POST   /api/hives/{id}/treatments   # Create treatment
PUT    /api/treatments/{id}         # Update treatment
DELETE /api/treatments/{id}         # Delete treatment
GET    /api/treatments/schedule     # Upcoming treatments (all hives)
```

**Feedings:**
```
GET    /api/hives/{id}/feedings     # List feedings for hive
POST   /api/hives/{id}/feedings     # Create feeding
PUT    /api/feedings/{id}           # Update feeding
DELETE /api/feedings/{id}           # Delete feeding
```

**Harvests:**
```
GET    /api/hives/{id}/harvests     # List harvests for hive
POST   /api/hives/{id}/harvests     # Create harvest
PUT    /api/harvests/{id}           # Update harvest
DELETE /api/harvests/{id}           # Delete harvest
GET    /api/harvests/analytics      # Harvest analytics (see below)
```

**Harvest Analytics Response:**
```json
{
  "total_kg": 45.2,
  "total_harvests": 12,
  "per_hive": [
    {"hive_id": "...", "hive_name": "Hive 1", "total_kg": 18.5, "harvests": 5}
  ],
  "year_over_year": [
    {"year": 2025, "total_kg": 38.0},
    {"year": 2026, "total_kg": 45.2}
  ],
  "best_performing_hive": {"hive_id": "...", "hive_name": "Hive 3", "kg_per_harvest": 4.2}
}
```

**Equipment:**
```
GET    /api/hives/{id}/equipment    # List equipment for hive
POST   /api/hives/{id}/equipment    # Add equipment
PUT    /api/equipment/{id}          # Update equipment
DELETE /api/equipment/{id}          # Delete equipment
```

**Custom Labels:**
```
GET    /api/labels                  # List all user's labels
POST   /api/labels                  # Create label
PUT    /api/labels/{id}             # Update label
DELETE /api/labels/{id}             # Delete label
```

**Clips & Detections:**
```
GET    /api/clips                   # List all clips (filterable)
GET    /api/clips/{id}              # Get clip detail + video URL
DELETE /api/clips/{id}              # Delete clip
GET    /api/detections              # List all detections
GET    /api/stats/daily             # Daily stats with weather
```

**BeeBrain AI:**
```
GET    /api/beebrain/dashboard      # Dashboard analysis
GET    /api/beebrain/hive/{id}      # Hive-specific analysis
GET    /api/beebrain/maintenance    # Maintenance priorities
POST   /api/beebrain/refresh        # Trigger re-analysis
```

**Voice Transcription:**
```
POST   /api/transcribe              # Whisper transcription
       Content-Type: audio/webm
       Returns: { "text": "transcribed text" }
```

**Data Export:**
```
POST   /api/export                  # Generate export
       Body: { hive_ids, include: [...], format: "summary|markdown|json" }
```

**Weather:**
```
GET    /api/weather/{site_id}       # Current weather for site
GET    /api/weather/{site_id}/history  # Historical weather data
```

**PWA Sync:**
```
POST   /api/sync                    # Bulk sync endpoint
       Body: { inspections: [...], photos: [...] }
GET    /api/sync/status             # What needs syncing
```

**Go Code:**

| Element | Convention | Example |
|---------|------------|---------|
| Packages | lowercase, short | `handlers`, `models`, `storage` |
| Files | snake_case | `units.go`, `hives.go`, `clip_storage.go` |
| Types/Structs | PascalCase | `Unit`, `Hive`, `Detection`, `Inspection` |
| Functions | PascalCase (exported) | `GetUnit()`, `SaveClip()`, `CreateInspection()` |
| Private funcs | camelCase | `parseConfig()`, `validateInput()` |
| Variables | camelCase | `unitID`, `hiveID`, `clipPath` |
| Constants | PascalCase or ALL_CAPS | `MaxClipSize`, `DEFAULT_PORT` |

**React/TypeScript:**

| Element | Convention | Example |
|---------|------------|---------|
| Components | PascalCase file + export | `UnitCard.tsx`, `HiveTimeline.tsx` |
| Hooks | camelCase with `use` | `useUnitStatus.ts`, `useOfflineSync.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Types | PascalCase | `Unit`, `Hive`, `Detection`, `Inspection` |

### API Response Formats

**Success Response:**
```json
{
  "data": { ... },
  "meta": { "total": 100, "page": 1 }
}
```

**Error Response:**
```json
{
  "error": "Unit not found",
  "code": 404
}
```

**List Response:**
```json
{
  "data": [ ... ],
  "meta": { "total": 50, "page": 1, "per_page": 20 }
}
```

**JSON Field Naming:** snake_case with struct tags
```go
type Unit struct {
    ID        string `json:"id"`
    SiteID    string `json:"site_id"`
    Serial    string `json:"serial"`
    Name      string `json:"name"`
    IPAddress string `json:"ip_address"`
    LastSeen  string `json:"last_seen"`
    Status    string `json:"status"`
}

type Hive struct {
    ID               string `json:"id"`
    SiteID           string `json:"site_id"`
    Name             string `json:"name"`
    QueenIntroduced  string `json:"queen_introduced_at"`
    QueenSource      string `json:"queen_source"`
    BroodBoxes       int    `json:"brood_boxes"`
    HoneySupers      int    `json:"honey_supers"`
}
```

**Dates:** ISO 8601 strings
```json
"created_at": "2026-01-21T14:30:00Z"
```

### Project Structure

**Go Server (`apis-server/`):**
```
├── cmd/server/main.go       # Entry point
├── internal/
│   ├── config/
│   │   └── config.go        # Configuration loading
│   ├── handlers/
│   │   ├── auth.go          # Login/logout
│   │   ├── sites.go         # Site CRUD
│   │   ├── units.go         # Unit CRUD + heartbeat
│   │   ├── hives.go         # Hive CRUD + timeline
│   │   ├── inspections.go   # Inspection CRUD + photos
│   │   ├── treatments.go    # Treatment CRUD + schedule
│   │   ├── feedings.go      # Feeding CRUD
│   │   ├── harvests.go      # Harvest CRUD + analytics
│   │   ├── equipment.go     # Equipment CRUD
│   │   ├── labels.go        # Custom label CRUD
│   │   ├── detections.go    # Detection/clip handlers
│   │   ├── clips.go         # Clip upload/download
│   │   ├── stats.go         # Analytics handlers
│   │   ├── beebrain.go      # BeeBrain analysis
│   │   ├── transcribe.go    # Whisper transcription
│   │   ├── export.go        # Data export
│   │   ├── weather.go       # Weather API proxy
│   │   ├── sync.go          # PWA sync endpoint
│   │   └── settings.go      # Server settings
│   ├── middleware/
│   │   ├── auth.go          # Session authentication
│   │   ├── apikey.go        # X-API-Key validation
│   │   └── logging.go       # Request logging
│   ├── models/
│   │   ├── user.go          # User struct
│   │   ├── site.go          # Site struct
│   │   ├── unit.go          # Unit struct
│   │   ├── hive.go          # Hive struct
│   │   ├── inspection.go    # Inspection + frames
│   │   ├── treatment.go     # Treatment struct
│   │   ├── feeding.go       # Feeding struct
│   │   ├── harvest.go       # Harvest struct
│   │   ├── equipment.go     # Equipment struct
│   │   ├── label.go         # Custom label struct
│   │   ├── detection.go     # Detection struct
│   │   ├── clip.go          # Clip metadata
│   │   └── daily_stats.go   # Daily statistics
│   ├── storage/
│   │   ├── sqlite.go        # SQLite connection
│   │   ├── migrations.go    # Schema migrations
│   │   ├── users.go         # User queries
│   │   ├── sites.go         # Site queries
│   │   ├── units.go         # Unit queries
│   │   ├── hives.go         # Hive queries
│   │   ├── inspections.go   # Inspection queries
│   │   ├── treatments.go    # Treatment queries
│   │   ├── feedings.go      # Feeding queries
│   │   ├── harvests.go      # Harvest queries
│   │   ├── equipment.go     # Equipment queries
│   │   ├── labels.go        # Label queries
│   │   ├── detections.go    # Detection queries
│   │   ├── clips.go         # Clip metadata queries
│   │   ├── weather.go       # Weather cache
│   │   └── pruning.go       # Auto-pruning logic
│   └── services/
│       ├── clip_storage.go  # File system clip management
│       ├── photo_storage.go # Photo upload + thumbnails
│       ├── weather.go       # Open-Meteo API client
│       ├── beebrain.go      # BeeBrain rule engine
│       ├── whisper.go       # Whisper transcription
│       ├── export.go        # Export generator
│       ├── qrcode.go        # QR code generator
│       └── notifications.go # Push notifications
├── api/
│   └── openapi.yaml         # OpenAPI 3.0 spec
└── tests/                   # Integration tests
```

**React Dashboard (`apis-dashboard/`):**
```
├── public/
│   ├── sw.js                # Service Worker
│   └── manifest.json        # PWA manifest
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   └── SidebarLayout.tsx    # ProLayout wrapper
│   │   ├── dashboard/
│   │   │   ├── DailyGlance.tsx      # Weather, count, status cards
│   │   │   ├── ActivityClock.tsx    # 24-hour polar chart
│   │   │   ├── PatternCharts.tsx    # Temp correlation, trends
│   │   │   └── BeeBrainCard.tsx     # AI analysis card
│   │   ├── units/
│   │   │   ├── UnitCard.tsx         # Unit status card
│   │   │   └── LiveStream.tsx       # MJPEG stream viewer
│   │   ├── hives/
│   │   │   ├── HiveCard.tsx         # Hive summary card
│   │   │   ├── HiveTimeline.tsx     # Unified timeline
│   │   │   └── FrameTracker.tsx     # Frame inventory UI
│   │   ├── diary/
│   │   │   ├── InspectionForm.tsx   # Glove-friendly form
│   │   │   ├── TreatmentForm.tsx    # Treatment entry
│   │   │   ├── FeedingForm.tsx      # Feeding entry
│   │   │   └── HarvestForm.tsx      # Harvest entry
│   │   ├── clips/
│   │   │   ├── ClipList.tsx         # Clip grid/list
│   │   │   └── ClipPlayer.tsx       # Video playback
│   │   ├── common/
│   │   │   ├── TimeRangeSelector.tsx  # Day/Week/Month nav
│   │   │   ├── VoiceInput.tsx       # Voice transcription
│   │   │   ├── PhotoUpload.tsx      # Camera/library picker
│   │   │   └── SyncStatus.tsx       # Offline indicator
│   │   └── charts/
│   │       └── StatsChart.tsx       # Reusable chart wrapper
│   ├── pages/
│   │   ├── dashboard/index.tsx      # Home dashboard
│   │   ├── sites/
│   │   │   ├── list.tsx             # Site list
│   │   │   └── show.tsx             # Site detail
│   │   ├── units/
│   │   │   ├── list.tsx             # Unit list
│   │   │   └── show.tsx             # Unit detail + stream
│   │   ├── hives/
│   │   │   ├── list.tsx             # Hive list
│   │   │   ├── show.tsx             # Hive detail + timeline
│   │   │   └── inspect.tsx          # New inspection
│   │   ├── diary/
│   │   │   └── index.tsx            # Diary entry point
│   │   ├── clips/
│   │   │   ├── list.tsx             # Clip archive
│   │   │   └── show.tsx             # Clip detail
│   │   ├── stats/
│   │   │   └── index.tsx            # Analytics
│   │   ├── settings/
│   │   │   ├── index.tsx            # Main settings
│   │   │   ├── labels.tsx           # Custom labels
│   │   │   └── export.tsx           # Data export
│   │   └── login/index.tsx          # Authentication
│   ├── providers/
│   │   ├── dataProvider.ts          # Refine REST provider
│   │   └── authProvider.ts          # Refine auth provider
│   ├── hooks/
│   │   ├── useDeviceStatus.ts       # Unit polling hook
│   │   ├── useLiveStream.ts         # MJPEG stream hook
│   │   ├── useOfflineSync.ts        # IndexedDB sync hook
│   │   └── useVoiceInput.ts         # Speech recognition hook
│   ├── services/
│   │   ├── db.ts                    # Dexie.js IndexedDB setup
│   │   └── sync.ts                  # Sync queue manager
│   ├── types/index.ts               # TypeScript interfaces
│   ├── utils/formatDate.ts          # Date formatting
│   ├── theme/antd.ts                # Honey Beegood theme
│   ├── App.tsx                      # Root component
│   └── index.tsx                    # Entry point
└── tests/                           # Test files
```

**Tests:** Separate `tests/` directory (not co-located)

### Backend Services Architecture

**Weather Service (`services/weather.go`):**
```go
// Fetches from Open-Meteo API (free, no key)
// Caches in weather table (1 hour TTL)
// Returns current + historical for site GPS coordinates
```

**BeeBrain Service (`services/beebrain.go`):**
```go
// MVP: Rule engine with hardcoded patterns
// Examples:
// - "Queen is 3+ years AND productivity dropped 20% → recommend requeening"
// - "Hornets peak at 14:00-16:00 based on your data"
// - "Last treatment was 45 days ago → schedule next"
// Future: Mini ML model (~300-500MB, beekeeping fine-tuned)
```

**Whisper Service (`services/whisper.go`):**
```go
// Server-side transcription using OpenAI Whisper
// Accepts audio/webm from browser MediaRecorder
// Returns transcribed text for inspection notes
// Fallback: Browser native SpeechRecognition (handled client-side)
```

**Photo Storage Service (`services/photo_storage.go`):**
```go
// Handles inspection photo uploads
// Generates thumbnails (300px)
// Stores in /photos/{inspection_id}/{uuid}.jpg
// Returns file_path and thumbnail_path
```

**Export Service (`services/export.go`):**
```go
// Generates exports in 3 formats:
// - "summary": Quick human-readable for forums
// - "markdown": Detailed for pasting into ChatGPT/Claude
// - "json": Full structured data for programmatic use
// User selects what to include via checkboxes
```

**QR Code Service (`services/qrcode.go`):**
```go
// Generates printable QR codes for hive navigation (large apiaries)
// Format: apis://hive/{site_id}/{hive_id}
// Output: PNG image suitable for printing/laminating
// Usage: Scan QR at hive → opens hive detail page in PWA
```

**Notifications Service (`services/notifications.go`):**
```go
// Webhook-based notifications to external services
// Notification types:
// - detection: Hornet detected at {unit}
// - offline: Unit {unit} went offline
// - storage_warning: Storage >90% full
// - treatment_due: Treatment reminder for {hive}
// Delivery: HTTP POST to configured webhook URL
// Future: Push notifications via Web Push API
```

**PWA Sync Protocol:**
```go
// POST /api/sync handles offline data synchronization
// Request body:
{
  "client_timestamp": "2026-01-22T10:00:00Z",
  "inspections": [
    {"local_id": "temp-1", "hive_id": "...", "date": "...", ...}
  ],
  "photos": [
    {"local_id": "temp-2", "inspection_local_id": "temp-1", "data": "base64..."}
  ]
}
// Response:
{
  "synced": {
    "inspections": [{"local_id": "temp-1", "server_id": "insp-123"}],
    "photos": [{"local_id": "temp-2", "server_id": "photo-456", "url": "..."}]
  },
  "conflicts": [],  // If any server-side changes conflict
  "server_timestamp": "2026-01-22T10:00:05Z"
}
// Conflict resolution: Last-write-wins with user notification
```

### Implementation Phases

| Phase | Priority | Components | Description |
|-------|----------|------------|-------------|
| **P1** | Core | Edge Hardware | Detection + deterrent device (Pi 5 prototype) |
| **P1** | Core | Hornet Dashboard | Daily Glance, Activity Clock, clips |
| **P1** | Core | Units API | Device registration, heartbeat, clips |
| **P2** | Supporting | Hive Diary | Inspections, treatments, feedings, harvests |
| **P2** | Supporting | Sites & Hives | Multi-site, multi-hive data model |
| **P2** | Supporting | Mobile PWA | Offline-first, glove-friendly |
| **P3** | Enhancement | BeeBrain AI | Rule engine first, ML later |
| **P3** | Enhancement | Voice Input | Server Whisper + browser fallback |
| **P4** | Future | Sensors | Temperature, humidity, weight, sound |

**Development Order (AI-Optimized):**
1. **Server & Dashboard first** — Pure software, no hardware needed
2. **Core Detection Software** — Algorithm, can test with simulated inputs
3. **Hardware Integration last** — Requires physical assembly, calibration

### Error Handling

**Go Pattern:**
```go
// Always wrap errors with context
if err != nil {
    return fmt.Errorf("storage: failed to save clip %s: %w", id, err)
}

// Handler error helper
func respondError(w http.ResponseWriter, msg string, code int) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(code)
    json.NewEncoder(w).Encode(map[string]any{"error": msg, "code": code})
}
```

### Logging

**Pattern:** Structured JSON via zerolog
```go
log.Info().
    Str("device_id", deviceID).
    Str("event", "clip_received").
    Int("size_bytes", len(data)).
    Msg("Clip uploaded")
```

**Output:**
```json
{"level":"info","device_id":"abc123","event":"clip_received","size_bytes":245000,"msg":"Clip uploaded"}
```

### Testing Strategy

| Type | Scope | Tools |
|------|-------|-------|
| **Unit Tests** | Functions, handlers | Go testing, testify |
| **Integration Tests** | API + real SQLite | httptest, temp DB |
| **E2E Tests** | Full flow (future) | Playwright |

### API Documentation

- OpenAPI 3.0 spec in `api/openapi.yaml`
- Auto-generated from Go comments
- Swagger UI at `/api/docs`

### Enforcement

**All AI Agents MUST:**
- Follow naming conventions exactly as specified
- Use the defined response formats
- Place files in correct directories
- Wrap errors with context
- Use structured logging

---

## Open Source Setup

### License

MIT — Maximum adoption, no friction.

### Repository Files

```
├── LICENSE                    # MIT license text
├── README.md                  # Project overview, quick start
├── CONTRIBUTING.md            # How to contribute
├── CODE_OF_CONDUCT.md         # Community standards
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── hardware_question.md
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── build.yaml         # Build + test
│       ├── release.yaml       # Tag → GHCR
│       └── docs.yaml          # Deploy docs
```

---

## Key Design Principles

1. **Design for ESP32** — Pi 5 is just a dev board
2. **Offline-first** — Edge device never depends on server
3. **Open source ready** — No hardcoded secrets, MIT license
4. **AI-manageable** — Structured output, predictable commands
5. **SaaS-ready** — Architecture supports multi-tenant
6. **Simple beats clever** — Boring technology, proven patterns

---

## Project Structure & Boundaries

### Directory Structure Reference

**Note:** The complete v2.0 project directory structure is defined in the "Project Structure" section under "Implementation Patterns & Consistency Rules". That is the authoritative structure with all portal components.

**Quick Reference — Key Directories:**
```
apis/
├── apis-server/internal/
│   ├── handlers/     # 20 handler files (auth, sites, units, hives, etc.)
│   ├── models/       # 13 model files
│   ├── storage/      # 15 storage files
│   └── services/     # 8 service files (beebrain, weather, whisper, etc.)
├── apis-dashboard/src/
│   ├── components/   # layout/, dashboard/, units/, hives/, diary/, clips/, common/, charts/
│   ├── pages/        # dashboard/, sites/, units/, hives/, diary/, clips/, stats/, settings/
│   ├── hooks/        # useUnitStatus, useOfflineSync, useVoiceInput, etc.
│   └── services/     # db.ts (Dexie), sync.ts
├── apis-edge/
│   ├── pi/           # Python implementation
│   └── esp32/        # C++ implementation
├── hardware/         # Wiring diagrams, STL files, BOM
└── docs/             # User documentation
```

### Architectural Boundaries

**API Boundaries:**

| Boundary | Endpoint Pattern | Auth Method | Description |
|----------|------------------|-------------|-------------|
| Dashboard Auth | `POST /api/auth/*` | Session cookie | User login/logout |
| Dashboard API | `GET/POST /api/*` | Session cookie | All dashboard operations |
| Unit Ingest | `POST /api/units/{id}/heartbeat` | X-API-Key | Unit status updates |
| Unit Ingest | `POST /api/units/{id}/clips` | X-API-Key | Clip uploads |
| PWA Sync | `POST /api/sync` | Session cookie | Offline sync queue |
| Static Assets | `/*` (non-api) | None | Dashboard SPA/PWA files |

**Component Boundaries:**

| From | To | Communication | Notes |
|------|----|--------------:|-------|
| Dashboard | Server | REST API | Polling every 30s |
| Dashboard | Unit | Direct MJPEG | `http://{unit_ip}:8080/stream` |
| Unit | Server | HTTPS POST | Heartbeat + clips |
| Unit | Serial | CLI | Configuration + diagnostics |
| PWA (offline) | IndexedDB | Dexie.js | Local draft storage |
| PWA (online) | Server | POST /api/sync | Bulk sync on reconnect |

**Data Boundaries:**

| Data Type | Storage | Access Pattern |
|-----------|---------|----------------|
| Unit state | SQLite | Read/write via storage layer |
| Hives & Diary | SQLite | CRUD, user-driven |
| Detections | SQLite | Append-mostly, time-indexed |
| Clips | File system | Write once, read many, auto-prune |
| Photos | File system | Write once, read many, thumbnails |
| User sessions | In-memory | Server restart clears |
| Offline drafts | IndexedDB | PWA local storage |

### Requirements to Structure Mapping

**Part A: Edge Hardware → apis-edge/**
- Detection pipeline → `detection/`, `capture/`
- Servo/Laser control → `control/servo.py`, `control/laser.py`
- Safety interlocks → `control/safety.py` / `laser_control.cpp`
- Physical controls → `cli/`, GPIO LED status
- Network → `network/uploader.py`, `network/mjpeg.py`

**Part B: Companion Portal → apis-server/ + apis-dashboard/**

| Module | Server | Dashboard |
|--------|--------|-----------|
| Hornet Dashboard | `handlers/stats.go`, `handlers/detections.go` | `pages/dashboard/`, `components/dashboard/` |
| Hive Diary | `handlers/hives.go`, `handlers/inspections.go`, etc. | `pages/hives/`, `components/diary/` |
| BeeBrain AI | `services/beebrain.go`, `handlers/beebrain.go` | `components/dashboard/BeeBrainCard.tsx` |
| Mobile PWA | `handlers/sync.go` | `services/db.ts`, `sw.js` |
| Voice Input | `services/whisper.go`, `handlers/transcribe.go` | `components/common/VoiceInput.tsx` |

**Cross-Cutting Concerns:**
- Auto-pruning → `apis-server/internal/storage/pruning.go`
- Configuration → `config/` in both server and edge
- Logging → `middleware/logging.go` (server), stdout JSON (edge)
- Offline sync → `apis-dashboard/src/services/sync.ts`
- Weather caching → `apis-server/internal/services/weather.go`

### Integration Points

**Unit → Server Communication:**
```
Unit Boot:
1. Load saved config OR run tiered discovery
2. Start heartbeat loop (60s interval)
3. On detection: record clip → POST to server
4. Server responds with 200 OK (no commands)
```

**Dashboard → Server Communication:**
```
Dashboard Load:
1. Auth check via /api/auth/me
2. Fetch units, hives, recent data
3. Start polling loop (30s)
4. User actions → REST calls
```

**Dashboard → Unit (Direct):**
```
Live View:
1. Get unit IP from server
2. Connect directly to unit MJPEG
3. No server proxy (reduces latency)
```

**PWA Offline Sync:**
```
Going Offline:
1. Service Worker caches app shell
2. IndexedDB stores recent data
3. User creates inspection → saved to IndexedDB

Coming Online:
1. Sync queue processes pending items
2. POST /api/sync with batched data
3. Server responds with any conflicts
4. UI shows "Synced" indicator
```

**Voice Input Flow:**
```
User Records Note:
1. Browser MediaRecorder captures audio
2. Option A: POST audio to /api/transcribe (server Whisper)
3. Option B: Use browser SpeechRecognition API (native)
4. Text inserted into notes field
```

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

| Decision A | Decision B | Status |
|------------|------------|--------|
| Go + Chi | SQLite pure Go (modernc.org) | ✅ No CGO required |
| Go + Chi | Podman | ✅ Alpine container works |
| React + Refine | Go REST API | ✅ Standard REST data provider |
| @ant-design/charts | Ant Design | ✅ Same design system |
| Dexie.js | IndexedDB | ✅ Standard PWA pattern |
| Unit push model | NAT/firewall | ✅ Outbound-only works through NAT |
| mDNS discovery | ESP32 | ✅ ESP32 supports mDNS client |
| Serial CLI | All 3 hardware targets | ✅ Universal serial support |
| Open-Meteo | No API key | ✅ Free tier sufficient |

**Pattern Consistency:**
- Database: snake_case → API JSON: snake_case → ✅ Aligned
- Go: PascalCase exports → TypeScript: PascalCase types → ✅ Aligned
- Error wrapping → JSON error responses → Structured logging → ✅ Aligned
- Tests in separate `tests/` dir across all components → ✅ Consistent
- Terminology: units, hives, detections → ✅ Consistent throughout

**Structure Alignment:**
- `internal/` package prevents import leakage → ✅
- Handlers/storage/middleware/services separation → ✅ Clean architecture
- Edge device mirrors server patterns (detection/, control/, network/) → ✅
- PWA follows standard Service Worker + IndexedDB pattern → ✅

### Requirements Coverage ✅

**Part A: Edge Hardware:**

| Category | Coverage | Architecture Location |
|----------|----------|----------------------|
| Detection Pipeline | ✅ 100% | `apis-edge/*/detection/`, `capture/` |
| Safety Interlocks | ✅ 100% | `apis-edge/*/control/safety.*` |
| Physical Controls | ✅ 100% | `cli/`, GPIO, `hardware/enclosure/` |
| Network Comms | ✅ 100% | `network/`, `apis-server/handlers/units.go` |

**Part B: Companion Portal:**

| Module | Coverage | Architecture Location |
|--------|----------|----------------------|
| Hornet Dashboard | ✅ 100% | `handlers/stats.go`, `pages/dashboard/` |
| Hive Diary | ✅ 100% | `handlers/hives.go`, `pages/hives/` |
| BeeBrain AI | ✅ 100% | `services/beebrain.go`, `BeeBrainCard.tsx` |
| Mobile PWA | ✅ 100% | `handlers/sync.go`, `services/db.ts` |
| Voice Input | ✅ 100% | `services/whisper.go`, `VoiceInput.tsx` |

**NFR Coverage:**

| Requirement | Architecture Support |
|-------------|---------------------|
| ≥5 FPS detection | ESP32-appropriate algorithm, no server dependency |
| <500ms motion response | Local processing, no network round-trip |
| 45ms servo response | Direct GPIO control, minimal software overhead |
| 8+ hours operation | Standalone design, graceful network loss |
| ~50MB/day storage | Auto-pruning in `storage/pruning.go` |
| <€50 hardware | ESP32 target design, Pi 5 is dev only |
| Offline-first | Service Worker + IndexedDB + sync queue |
| Glove-friendly | 64px tap targets, voice input, swipe nav |

### Implementation Readiness ✅

**Decision Completeness:**
- ✅ All critical technologies specified with versions
- ✅ Patterns have examples (error wrapping, logging, API responses)
- ✅ Consistency rules are explicit and enforceable
- ✅ Complete API endpoint list with all CRUD operations
- ✅ PWA architecture with offline sync flow

**Structure Completeness:**
- ✅ All files and directories defined to leaf level
- ✅ Clear separation: server / dashboard / edge / hardware / docs
- ✅ Integration points mapped with sequence diagrams
- ✅ Services layer for business logic (BeeBrain, Weather, Whisper)

### Resolved Gaps

| Previous Gap | Resolution |
|--------------|------------|
| Terminology mismatch | Standardized: units, hives, detections |
| Missing data model | Complete 15-table schema added |
| Missing API endpoints | 50+ endpoints documented |
| Missing PWA architecture | Service Worker + Dexie.js defined |
| Missing services | BeeBrain, Weather, Whisper, Export documented |

### Remaining Considerations (Non-Blocking)

| Item | Recommendation | Priority |
|------|----------------|----------|
| API versioning | Consider `/api/v1/` prefix | Low |
| Database migrations | Use `NNNN_description.sql` naming | Medium |
| Clip format | H.264 baseline, MP4 container | Medium |
| BeeBrain rules | Document specific rule examples in stories | Medium |

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Medium)
- [x] Technical constraints identified (ESP32 target)
- [x] Cross-cutting concerns mapped (6 concerns)

**✅ Architectural Decisions**
- [x] Critical decisions documented (12 decision tables)
- [x] Technology stack fully specified
- [x] Integration patterns defined (push model, heartbeat, clips)
- [x] Performance considerations addressed (local processing)

**✅ Implementation Patterns**
- [x] Naming conventions established (4 areas)
- [x] Structure patterns defined (Go, React, Edge)
- [x] Communication patterns specified (REST, MJPEG, Serial)
- [x] Process patterns documented (errors, logging, testing)

**✅ Project Structure**
- [x] Complete directory structure (100+ files defined)
- [x] Component boundaries established (5 boundaries)
- [x] Integration points mapped (3 communication paths)
- [x] Requirements to structure mapping complete

### Readiness Assessment

**Overall Status:** ✅ READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**
1. Clear ESP32-first design prevents over-engineering
2. Offline-first architecture ensures reliability
3. Comprehensive file structure eliminates ambiguity
4. Consistent patterns across all components
5. SaaS migration path preserved without complexity

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Design for ESP32 first, Pi 5 is development convenience only

---

## Codex Review Remediations (v3.0)

This section documents the architectural decisions made in response to the GPT-5.1 Codex review (`architecture-codex-review-2026-01-22.md`).

### Issues Addressed

| # | Issue | Severity | Resolution |
|---|-------|----------|------------|
| 1 | Live video blocked (HTTPS mixed content) | Critical | WebSocket proxy through server (WSS) |
| 2 | Device identity underspecified | High | Per-unit API keys, tenant-scoped |
| 3 | No OTA/firmware updates | High | ESP-IDF OTA, version in heartbeat |
| 4 | ESP32 performance unproven | High | ESP32 is target; adapt during dev if needed |
| 5 | Session auth vs offline PWA | Medium | Long-lived device tokens (30 days) |
| 6 | Upload resilience | Medium | Retry with backoff + local spool (50 clips) |
| 7 | SaaS-readiness overstated | Medium | Added tenant_id schema + Keycloak OIDC |
| 8 | CSRF/rate limiting missing | Medium | SameSite=Strict + CSRF tokens + rate limits |
| 9 | Observability limited | Medium | /health endpoint + VictoriaMetrics (optional) |
| 10 | Conflict resolution | Medium | Last-write-wins (documented behavior) |
| 11 | Time synchronization | Medium | Server time in heartbeat + SNTP on device |
| 12 | Retention/quotas incomplete | Low | Documented policy: clips 30d, photos 90d, logs 7d |

### Key Architectural Changes (v2.0 → v3.0)

| Component | v2.0 | v3.0 |
|-----------|------|------|
| **Database** | SQLite (pure Go) | YugabyteDB (PostgreSQL-compatible) |
| **Identity** | Bcrypt + sessions | Keycloak (OIDC/JWT) |
| **Multi-Tenant** | user_id scoping | tenant_id + RLS |
| **Live Video** | Direct MJPEG (HTTP) | WebSocket proxy (WSS) |
| **Device Auth** | Shared API key | Per-unit API keys |
| **Metrics** | Logs only | /health + VictoriaMetrics |
| **OTA Updates** | Not defined | ESP-IDF OTA with signed binaries |
| **Time Sync** | Not defined | Heartbeat response + SNTP |

### Design Decisions Rationale

**ESP32 as Primary Target:**
The PRD specifies ESP32 as the target platform. Pi 5 is used for development only (too expensive for production). If ESP32 cannot achieve 5 FPS detection during development, alternative boards will be evaluated. This is an accepted risk.

**Last-Write-Wins for Conflicts:**
For a single-user self-hosted deployment, concurrent offline edits to the same record are rare. Last-write-wins is documented and accepted. CRDTs or optimistic locking can be added if users report issues.

**Keycloak as Identity Provider (ADR — Decision Reversal):**
The original architecture (v2.0→v3.0) selected Zitadel for its Go-native implementation and lighter resource footprint. The shared infrastructure was rebuilt on SSIK (Sovereign Secure Infrastructure Kit) running K3s, which standardizes on Keycloak across all hosted applications. Running a separate IdP creates unnecessary operational overhead. Infrastructure consistency outweighs the original stack-alignment rationale. Full ADR in `prd-addendum-keycloak-migration.md` §8.

---

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED ✅
**Version:** 3.1 (Keycloak Migration)
**Total Steps Completed:** 10
**Date Completed:** 2026-01-22
**Document Location:** `_bmad-output/planning-artifacts/architecture.md`
**Review Input:** `_bmad-output/planning-artifacts/architecture-codex-review-2026-01-22.md`

### What Changed in v3.0

| Area | v2.0 | v3.0 |
|------|------|------|
| **Database** | SQLite (pure Go) | YugabyteDB (PostgreSQL-compatible) |
| **Identity** | Bcrypt + sessions | Keycloak (OIDC/JWT) |
| **Multi-Tenant** | user_id only | tenant_id + RLS on all tables |
| **Live Video** | Direct MJPEG (HTTP) | WebSocket proxy (WSS) |
| **Device Auth** | Shared API key | Per-unit API keys |
| **Metrics** | Logs only | /health + VictoriaMetrics |
| **OTA Updates** | Not defined | ESP-IDF OTA with signed binaries |
| **Deployment** | Single container | Docker Compose (multi-service) |

### Final Architecture Deliverables

**Complete Architecture Document**
- All architectural decisions documented with specific versions
- Multi-tenant data model with Row-Level Security
- Keycloak OIDC integration for authentication
- Docker Compose for self-hosted deployment
- Codex review remediations fully addressed

**SaaS-Ready Foundation**
- YugabyteDB for horizontal scaling
- Tenant isolation at database level (RLS)
- Per-unit API keys with tenant scoping
- VictoriaMetrics for observability
- Health endpoints for orchestration

**AI Agent Implementation Guide**
- Technology stack with verified versions
- Consistency rules that prevent implementation conflicts
- Project structure with clear boundaries
- Integration patterns and communication standards
- Service layer patterns (BeeBrain, Weather, Whisper)

### Implementation Handoff

**For AI Agents:**
This architecture document is your complete guide for implementing APIS. Follow all decisions, patterns, and structures exactly as documented.

**Terminology is Critical:**
- Use "units" not "devices" for APIS hardware
- Use "detections" not "incidents" for hornet events
- Use "sites" for apiaries, "hives" for individual beehives

**First Implementation Priority:**
```bash
# 1. Create monorepo
mkdir apis && cd apis
git init

# 2. Initialize Go server
mkdir -p apis-server/cmd/server
cd apis-server && go mod init github.com/jermoo/apis/apis-server

# 3. Initialize Refine dashboard
npm create refine-app@latest apis-dashboard

# 4. Create edge structure
mkdir -p apis-edge/{pi,esp32/src}

# 5. Add GitHub workflows
mkdir -p .github/workflows
```

**Development Sequence (AI-Optimized):**
1. **P1 Server + Dashboard first** — Pure software, immediate AI value
2. **P1 Hornet Dashboard** — Core monitoring functionality
3. **P2 Hive Diary** — Inspection, treatment, feeding, harvest CRUD
4. **P2 Mobile PWA** — Offline sync, voice input
5. **P3 BeeBrain** — Rule engine insights
6. **Hardware Integration last** — Requires physical assembly

### Quality Assurance Checklist

**✅ Architecture Coherence**
- [x] All decisions work together without conflicts
- [x] Technology choices are compatible
- [x] Patterns support the architectural decisions
- [x] Structure aligns with all choices

**✅ Requirements Coverage**
- [x] All functional requirements are supported
- [x] All non-functional requirements are addressed
- [x] Cross-cutting concerns are handled
- [x] Integration points are defined

**✅ Implementation Readiness**
- [x] Decisions are specific and actionable
- [x] Patterns prevent agent conflicts
- [x] Structure is complete and unambiguous
- [x] Examples are provided for clarity

---

**Architecture Status:** READY FOR IMPLEMENTATION ✅
**Version:** 3.1 (Keycloak Migration)
**Last Updated:** 2026-02-08

**Alignment:**
- ✅ Aligned with PRD v2.0
- ✅ Aligned with UX Design Specification
- ✅ Terminology standardized (units, hives, detections)
- ✅ Codex review issues addressed (12/12)

**Infrastructure:**
- ✅ YugabyteDB (PostgreSQL-compatible, distributed)
- ✅ Keycloak (multi-tenant identity, managed by Keycloak Operator in K3s)
- ✅ VictoriaMetrics (observability)
- ✅ Docker Compose (self-hosted deployment)

**Next Phase:** Create Epics & Stories using the architectural decisions and patterns documented herein.

**Document Maintenance:** Update this architecture when major technical decisions are made during implementation.

### Changelog

| Version | Date | Change |
|---------|------|--------|
| 3.1 | 2026-02-08 | **Keycloak Migration** — Replaced all Zitadel references with Keycloak equivalents per ADR in `prd-addendum-keycloak-migration.md` §8. Auth sections updated: JWT claims (`realm_access.roles`, `org_id`), OIDC discovery URL (includes `/realms/{name}`), Docker Compose (Keycloak + dedicated PostgreSQL via CloudNativePG pattern), env vars (`KEYCLOAK_*`), SaaS mode (`AUTH_MODE=keycloak`), service accounts (`client_credentials` grant), dashboard OIDC library (`react-oidc-context`). Column `zitadel_user_id` renamed to `external_user_id`. Non-auth sections unchanged. |
| 3.0 | 2026-01-22 | SaaS-Ready Infrastructure — YugabyteDB, Zitadel OIDC, multi-tenant RLS, Codex review remediations |
| 2.0 | 2026-01-21 | Initial architecture with SQLite, session auth |

