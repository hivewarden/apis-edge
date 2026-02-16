# PRD Addendum: Dual Authentication Mode

**Document Type:** Product Requirements Addendum
**Parent PRD:** `_bmad-output/planning-artifacts/prd.md`
**Technical Spec:** `docs/FR-DUAL-AUTH-MODE.md`
**Version:** 1.0
**Date:** 2026-01-27
**Status:** Ready for Epic Creation

---

## 1. Executive Summary

APIS supports two deployment modes from a single codebase:

| Mode | Use Case | Identity Provider | Target User |
|------|----------|-------------------|-------------|
| **Standalone** | Self-hosted, single tenant | Local bcrypt auth | Solo beekeeper, small club |
| **SaaS** | Multi-tenant hosted service | Zitadel OIDC | Club members, commercial users |

**Key Principle:** Both modes share identical features. The only difference is authentication mechanism and tenant management.

---

## 2. User Personas

### 2.1 Standalone Mode Users

| Persona | Description | Needs |
|---------|-------------|-------|
| **Solo Beekeeper** | Runs APIS on home server/NAS | Simple setup, no internet dependency |
| **Small Club Admin** | Hosts for 5-10 beekeepers sharing data | Multi-user, audit trail |
| **Club Member** | Uses club's hosted instance | Access to shared apiary data |

### 2.2 SaaS Mode Users

| Persona | Description | Needs |
|---------|-------------|-------|
| **SaaS Operator** | Runs hosted APIS service | Tenant management, billing controls |
| **Club Admin (SaaS)** | Manages club's isolated tenant | User management within tenant |
| **Individual Subscriber** | Pays for hosted service | Isolated data, BeeBrain access |

---

## 3. Deployment Scenarios

### 3.1 Standalone Deployment Scenarios

| Scenario | Server Location | Hardware Units | Internet Required |
|----------|-----------------|----------------|-------------------|
| **A. Dashboard Only** | Local PC/NAS | None (hive diary only) | No |
| **B. Local Network** | Home server | Units on same LAN | No (mDNS works) |
| **C. Remote Access** | Cloud/VPS or exposed server | Units at remote apiary | Yes — security critical |

### 3.2 Mode Selection

- Mode is determined at **deployment time** via `AUTH_MODE` environment variable
- Cannot be switched at runtime
- Migration between modes requires data export/import

---

## 4. Setup & Onboarding

### 4.1 Standalone First-Run Setup

**Setup Wizard Flow:**

```
Step 1: Create Admin Account
        ├── Display name (required)
        ├── Password (required, min 8 chars)
        └── Email (optional, for password recovery)

Step 2: How will you use APIS?
        ○ Dashboard only (hive diary, no hardware)
        ○ Hardware on same network (local apiary)
        ○ Hardware connecting over internet (remote apiary)

        IF "remote" selected:
        ┌─────────────────────────────────────────────────┐
        │ ⚠️ Security Notice                              │
        │                                                 │
        │ Your server will be accessible from the        │
        │ internet. Before connecting hardware:          │
        │                                                 │
        │ • Enable HTTPS (Let's Encrypt recommended)     │
        │ • Use a strong admin password                  │
        │ • Configure firewall rules                     │
        │ • Keep software updated                        │
        │                                                 │
        │ [I understand the risks] [Learn more]          │
        └─────────────────────────────────────────────────┘

Step 3: Setup Complete
        → Redirect to dashboard
```

### 4.2 SaaS Tenant Creation

**Invite-Only Flow (V1):**

1. Super-admin creates tenant in control panel
2. Super-admin sends invite to tenant admin
3. Tenant admin clicks invite link
4. Tenant admin creates account via Zitadel
5. Tenant is associated with Zitadel org

**Self-service sign-up:** Out of scope for V1

---

## 5. Multi-User & Roles

### 5.1 Users Per Tenant

Both modes support **multiple users per tenant**.

**Example:**
```
Tenant: "Valley Apiary Club"
├── Admin: Jean (full access)
├── Admin: Marie (full access)
├── Member: Pierre (CRUD own, view shared)
├── Member: Sophie (CRUD own, view shared)
└── Member: Cousin Louis (occasional helper)
```

### 5.2 Role Model

| Role | Permissions |
|------|-------------|
| **Full Admin** | All CRUD operations, user management, tenant settings, BeeBrain config |
| **Member** | CRUD on own data, view all shared data, no user management |

- Multiple admins allowed per tenant
- Role assigned at user creation/invitation

### 5.3 User Invitation Methods

Standalone mode supports three invitation methods:

| Method | Flow | Internet Required |
|--------|------|-------------------|
| **Temp Password** | Admin creates user with temp password, user changes on first login | No |
| **Email Invite** | Admin enters email, system sends invite link | Yes (SMTP config) |
| **Shareable Link** | Admin generates invite link, shares via any channel | No (for generation) |

SaaS mode uses Zitadel's invitation flow.

---

## 6. Audit & Activity Tracking

### 6.1 Audit Trail (Full History)

All data modifications are logged:

```sql
audit_log (
  id, tenant_id, user_id,
  action,           -- 'create', 'update', 'delete'
  entity_type,      -- 'inspection', 'hive', 'treatment', etc.
  entity_id,
  old_values,       -- JSONB
  new_values,       -- JSONB
  created_at
)
```

**Retention:** Configurable, default 1 year

### 6.2 Activity Feed (Operational)

User-facing activity stream showing relevant events:

```
┌─────────────────────────────────────────────────────────┐
│ Recent Activity                                         │
├─────────────────────────────────────────────────────────┤
│ 🐝 Jean added inspection on Hive 3          2 hours ago │
│ 💊 Marie recorded treatment on Hive 1       Yesterday   │
│ 📷 Pierre uploaded 3 photos                 Yesterday   │
│ 🍯 Jean recorded harvest: 4.2 kg            3 days ago  │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Super-Admin Control Panel (SaaS Mode)

### 7.1 V1 Features

| Feature | Description |
|---------|-------------|
| **List Tenants** | View all tenants with status, usage summary |
| **Create Tenant** | Create tenant + send admin invite |
| **View Usage** | Hives, units, storage, users per tenant |
| **Tenant Limits** | Set max hives, storage, units, users per tenant |
| **Disable Tenant** | Suspend access (data retained) |
| **Delete Tenant** | Permanent removal with confirmation |
| **BeeBrain Config** | Configure AI backend, per-tenant access |
| **Impersonate** | View tenant's dashboard for support |

### 7.2 Tenant Limits

```
Default Limits:
├── Max Hives: 100
├── Max Storage: 5 GB
├── Max Units: 10
└── Max Users: 20

Super-admin can override per tenant.
```

**Tenant Settings View:**
```
┌─────────────────────────────────────────┐
│ Your Plan Limits                        │
├─────────────────────────────────────────┤
│ Hives:      12 / 100                    │
│ Storage:    1.2 GB / 5 GB               │
│ Units:      3 / 10                      │
│ Users:      4 / 20                      │
└─────────────────────────────────────────┘
```

### 7.3 Impersonation (Support Mode)

**V1 Scope:**

| Feature | V1 |
|---------|-----|
| Impersonate button on tenant list | ✅ |
| Visual banner while impersonating | ✅ |
| Exit button to return to admin | ✅ |
| Audit log entry | ✅ |
| Read-only mode | Later |
| Time limit auto-expire | Later |
| Notify tenant | Later |

**Banner UI:**
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ SUPPORT MODE: Viewing as "Jermoo's Apiary"    [Exit]     │
└─────────────────────────────────────────────────────────────┘
```

**Audit Entry:**
```json
{
  "event": "impersonation_start",
  "super_admin_id": "admin_123",
  "tenant_id": "tenant_xyz",
  "started_at": "2026-01-27T14:30:00Z",
  "ended_at": "2026-01-27T14:45:00Z"
}
```

---

## 8. BeeBrain AI Configuration

### 8.1 Configuration Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│ SUPER-ADMIN LEVEL (System-wide)                         │
├─────────────────────────────────────────────────────────┤
│ BeeBrain Backend:                                       │
│   ○ Rule Engine Only (default, no AI model)             │
│   ○ Local Model (Ollama/LLM endpoint)                   │
│   ○ External API (operator's API key)                   │
│     └── Provider: OpenAI / Anthropic / Other            │
│                                                         │
│ Per-Tenant Access:                                      │
│   [✓] Tenant A — uses system config                     │
│   [ ] Tenant B — disabled                               │
│   [✓] Tenant C — uses system config                     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ TENANT ADMIN LEVEL (Override)                           │
├─────────────────────────────────────────────────────────┤
│ BeeBrain Settings:                                      │
│   ○ Use system configuration (default)                  │
│   ○ Use my own API key:                                 │
│     Provider: [OpenAI ▼]                                │
│     API Key:  [••••••••••••••••]                        │
└─────────────────────────────────────────────────────────┘
```

### 8.2 BYOK (Bring Your Own Key)

Tenant admins can override system BeeBrain config with their own API key:

| Scenario | Who Pays for AI |
|----------|-----------------|
| System config (operator key) | Operator |
| Tenant override (own key) | Tenant |
| BeeBrain disabled | N/A (rule engine only) |

### 8.3 Standalone Mode

Simpler — local admin configures BeeBrain directly in Settings:

```
BeeBrain Settings:
├── Backend: [Rule Engine ▼] / [Local Model] / [External API]
├── Model Endpoint: _________________ (if local)
├── API Provider: [OpenAI ▼] (if external)
└── API Key: _________________ (if external)
```

---

## 9. Feature Parity

**Both modes have identical features:**

| Feature | Standalone | SaaS |
|---------|------------|------|
| Hive diary (inspections, treatments, etc.) | ✅ | ✅ |
| Unit management | ✅ | ✅ |
| Clip storage & playback | ✅ | ✅ |
| BeeBrain AI insights | ✅ | ✅ |
| Weather integration | ✅ | ✅ |
| Voice transcription | ✅ | ✅ |
| Data export | ✅ | ✅ |
| Multi-user per tenant | ✅ | ✅ |
| Audit trail & activity feed | ✅ | ✅ |
| **Super-admin control panel** | ❌ | ✅ |
| **Tenant limits** | ❌ (unlimited) | ✅ |
| **Impersonation** | ❌ | ✅ |

---

## 10. Data Migration

### 10.1 Export Format

All modes support comprehensive data export:

```
Export Options:
├── Format: JSON / CSV / Markdown
├── Include:
│   ├── [✓] Hives
│   ├── [✓] Inspections
│   ├── [✓] Treatments
│   ├── [✓] Feedings
│   ├── [✓] Harvests
│   ├── [✓] Detection events
│   └── [ ] Clips (large, optional)
└── Date Range: [All time ▼]
```

### 10.2 Migration Scenarios

| From | To | Path |
|------|-----|------|
| Standalone → SaaS | Export from standalone, import to new SaaS tenant | V2 |
| SaaS → Standalone | Export from tenant, import to fresh standalone | V2 |
| Shared club → Isolated tenants | Export, filter by user, import to separate tenants | V2 (with filtering) |

**V1 Scope:** Export only. Import and migration tooling is V2.

---

## 11. Database Schema Additions

### 11.1 Users Table (Modified)

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'member';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by TEXT REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
```

### 11.2 Tenant Limits Table

```sql
CREATE TABLE tenant_limits (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
    max_hives INTEGER DEFAULT 100,
    max_storage_bytes BIGINT DEFAULT 5368709120,  -- 5 GB
    max_units INTEGER DEFAULT 10,
    max_users INTEGER DEFAULT 20,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 11.3 Audit Log Table

```sql
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    user_id TEXT REFERENCES users(id),
    action VARCHAR(50) NOT NULL,  -- 'create', 'update', 'delete'
    entity_type VARCHAR(100) NOT NULL,
    entity_id TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_time ON audit_log(tenant_id, created_at DESC);
```

### 11.4 Invite Tokens Table

```sql
CREATE TABLE invite_tokens (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    email TEXT,  -- NULL for shareable links
    role VARCHAR(50) DEFAULT 'member',
    token TEXT UNIQUE NOT NULL,
    created_by TEXT REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 11.5 BeeBrain Config Table

```sql
CREATE TABLE beebrain_config (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT REFERENCES tenants(id),  -- NULL = system default
    backend VARCHAR(50) NOT NULL,  -- 'rules', 'local', 'external'
    provider VARCHAR(50),  -- 'openai', 'anthropic', etc.
    endpoint TEXT,  -- For local model
    api_key_encrypted TEXT,  -- For external API
    is_tenant_override BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)  -- One config per tenant (or one system default)
);
```

### 11.6 Impersonation Log Table

```sql
CREATE TABLE impersonation_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    super_admin_id TEXT NOT NULL REFERENCES users(id),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    actions_taken INTEGER DEFAULT 0
);
```

---

## 12. API Endpoints (New/Modified)

### 12.1 Authentication

```
POST   /api/auth/login              # Local mode only
POST   /api/auth/logout             # Both modes
GET    /api/auth/config             # Returns mode + setup_required
POST   /api/auth/change-password    # Local mode
POST   /api/auth/setup              # First-run setup (local)
```

### 12.2 User Management

```
GET    /api/users                   # List tenant users
POST   /api/users                   # Create user (admin only)
GET    /api/users/{id}              # Get user
PUT    /api/users/{id}              # Update user
DELETE /api/users/{id}              # Delete user
POST   /api/users/invite            # Generate invite
GET    /api/invite/{token}          # Validate invite token
POST   /api/invite/{token}/accept   # Accept invite
```

### 12.3 Super-Admin (SaaS Only)

```
GET    /api/admin/tenants           # List all tenants
POST   /api/admin/tenants           # Create tenant
GET    /api/admin/tenants/{id}      # Get tenant details + usage
PUT    /api/admin/tenants/{id}      # Update tenant (limits, status)
DELETE /api/admin/tenants/{id}      # Delete tenant
POST   /api/admin/tenants/{id}/invite      # Invite tenant admin
POST   /api/admin/tenants/{id}/impersonate # Start impersonation
DELETE /api/admin/impersonate       # End impersonation
```

### 12.4 BeeBrain Config

```
GET    /api/settings/beebrain       # Get BeeBrain config (tenant-level)
PUT    /api/settings/beebrain       # Update BeeBrain config
GET    /api/admin/beebrain          # Get system BeeBrain config (super-admin)
PUT    /api/admin/beebrain          # Update system config
PUT    /api/admin/tenants/{id}/beebrain  # Set tenant BeeBrain access
```

### 12.5 Audit & Activity

```
GET    /api/audit                   # Query audit log (admin only)
GET    /api/activity                # Get activity feed
```

---

## 13. Environment Variables

### 13.1 Required (Both Modes)

```bash
AUTH_MODE=local|zitadel              # REQUIRED: Determines auth mode
DATABASE_URL=postgres://...          # Database connection
JWT_SECRET=<random-32-chars>         # For local JWT signing (local mode)
```

### 13.2 Local Mode Only

```bash
SESSION_DURATION=168h                # Login session duration (default 7 days)
PASSWORD_MIN_LENGTH=8                # Minimum password length
SMTP_HOST=smtp.example.com           # For email invites (optional)
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=noreply@example.com
```

### 13.3 SaaS Mode Only

```bash
ZITADEL_ISSUER=https://zitadel.example.com
ZITADEL_CLIENT_ID=...
ZITADEL_CLIENT_SECRET=...            # For backend operations
SUPER_ADMIN_EMAILS=admin@example.com # Comma-separated super-admin emails
```

---

## 14. Functional Requirements Summary

### FR-AUTH: Core Authentication

| ID | Requirement |
|----|-------------|
| FR-AUTH-01 | System SHALL support two deployment modes via AUTH_MODE env var |
| FR-AUTH-02 | Mode SHALL be determined at startup and cannot change at runtime |
| FR-AUTH-03 | All features except super-admin SHALL be available in both modes |

### FR-LOCAL: Standalone Mode

| ID | Requirement |
|----|-------------|
| FR-LOCAL-01 | First access with no users SHALL redirect to /setup |
| FR-LOCAL-02 | Setup wizard SHALL create admin account with name and password |
| FR-LOCAL-03 | Setup wizard SHALL ask deployment scenario and show security warning for remote access |
| FR-LOCAL-04 | Setup page SHALL never appear after first user exists |
| FR-LOCAL-05 | System SHALL use bcrypt for password hashing (cost factor 12) |
| FR-LOCAL-06 | System SHALL issue local JWT tokens signed with JWT_SECRET |
| FR-LOCAL-07 | Default tenant SHALL be auto-created on first boot with fixed UUID |

### FR-SAAS: SaaS Mode

| ID | Requirement |
|----|-------------|
| FR-SAAS-01 | System SHALL authenticate via Zitadel OIDC |
| FR-SAAS-02 | Tenant SHALL be determined from Zitadel org_id claim |
| FR-SAAS-03 | New tenant SHALL be auto-provisioned on first login |
| FR-SAAS-04 | Super-admin role SHALL be determined by SUPER_ADMIN_EMAILS |

### FR-USER: User Management

| ID | Requirement |
|----|-------------|
| FR-USER-01 | Each tenant SHALL support multiple users |
| FR-USER-02 | Roles SHALL be: Full Admin, Member |
| FR-USER-03 | Multiple admins SHALL be allowed per tenant |
| FR-USER-04 | Standalone SHALL support 3 invite methods: temp password, email, shareable link |
| FR-USER-05 | Invite links SHALL expire after configurable duration (default 7 days) |
| FR-USER-06 | User activity SHALL be tracked via created_by/updated_by fields |

### FR-AUDIT: Audit & Activity

| ID | Requirement |
|----|-------------|
| FR-AUDIT-01 | All create/update/delete operations SHALL be logged to audit_log |
| FR-AUDIT-02 | Audit log SHALL include old and new values |
| FR-AUDIT-03 | Activity feed SHALL show human-readable recent activity |
| FR-AUDIT-04 | Admins SHALL be able to query audit log |

### FR-ADMIN: Super-Admin (SaaS)

| ID | Requirement |
|----|-------------|
| FR-ADMIN-01 | Super-admin SHALL see list of all tenants with usage |
| FR-ADMIN-02 | Super-admin SHALL create tenants and send invites |
| FR-ADMIN-03 | Super-admin SHALL configure tenant limits |
| FR-ADMIN-04 | Super-admin SHALL disable/delete tenants |
| FR-ADMIN-05 | Super-admin SHALL impersonate tenants with visual indicator |
| FR-ADMIN-06 | All impersonation sessions SHALL be logged |

### FR-LIMITS: Tenant Limits

| ID | Requirement |
|----|-------------|
| FR-LIMITS-01 | Default limits SHALL be: 100 hives, 5GB storage, 10 units, 20 users |
| FR-LIMITS-02 | Super-admin SHALL override limits per tenant |
| FR-LIMITS-03 | Tenant admins SHALL see current usage vs limits in settings |
| FR-LIMITS-04 | System SHALL enforce limits and show clear error when exceeded |

### FR-BRAIN: BeeBrain Configuration

| ID | Requirement |
|----|-------------|
| FR-BRAIN-01 | BeeBrain SHALL support 3 backends: rules-only, local model, external API |
| FR-BRAIN-02 | Super-admin SHALL configure system-wide BeeBrain backend |
| FR-BRAIN-03 | Super-admin SHALL enable/disable BeeBrain per tenant |
| FR-BRAIN-04 | Tenant admin SHALL optionally override with own API key (BYOK) |
| FR-BRAIN-05 | API keys SHALL be stored encrypted |

---

## 15. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-SEC-01 | Passwords SHALL be hashed with bcrypt cost factor >= 12 |
| NFR-SEC-02 | JWT tokens SHALL expire after configurable duration |
| NFR-SEC-03 | API keys SHALL be stored encrypted at rest |
| NFR-SEC-04 | Rate limiting SHALL apply to login endpoint (5 attempts/minute) |
| NFR-PERF-01 | Auth endpoints SHALL respond in < 200ms p95 |
| NFR-COMPAT-01 | Both modes SHALL use identical API response formats |

---

## 16. Out of Scope (V1)

| Feature | Reason |
|---------|--------|
| Self-service sign-up | Manual onboarding for V1 |
| Data import | Export only for V1 |
| Migration tooling | V2 feature |
| Read-only impersonation | Nice to have |
| Impersonation time limits | Nice to have |
| Tenant notifications | Privacy consideration |
| BYOAI (bring your own assistant) | Complexity, BYOK sufficient |
| Password reset via email | Requires SMTP, nice to have |

---

## 17. Epic Structure (Proposed)

```
Epic 13: Dual Authentication Mode
├── 13.1  AUTH_MODE infrastructure & env var handling
├── 13.2  Database migrations (users, audit, limits, etc.)
├── 13.3  Local JWT signing & validation middleware
├── 13.4  Setup wizard (first-run flow)
├── 13.5  Login/logout endpoints (local mode)
├── 13.6  User management endpoints (CRUD + invite)
├── 13.7  Invite flow (3 methods)
├── 13.8  Audit log infrastructure
├── 13.9  Activity feed
├── 13.10 Dashboard auth provider abstraction
├── 13.11 Login page conditional rendering
├── 13.12 Setup page UI
├── 13.13 User management UI (tenant admin)
├── 13.14 Super-admin: Tenant list & management
├── 13.15 Super-admin: Tenant limits
├── 13.16 Super-admin: Impersonation
├── 13.17 Super-admin: BeeBrain config
├── 13.18 Tenant settings: Limits display
├── 13.19 Tenant settings: BeeBrain BYOK
├── 13.20 Security hardening (rate limiting, etc.)
└── 13.21 Dual-mode CI testing
```

---

## 18. References

- **Technical Spec:** `docs/FR-DUAL-AUTH-MODE.md` (original technical requirements)
- **Main PRD:** `_bmad-output/planning-artifacts/prd.md`
- **Architecture:** `_bmad-output/planning-artifacts/architecture.md`
- **Existing Auth Code:** `apis-server/internal/middleware/auth.go`

---

**Document Status:** Ready for Epic Creation

**Next Step:** Create Epic 13 stories from this requirements document
