---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - prd.md
  - architecture.md
  - ux-design-specification.md
workflowType: epics-and-stories
project_name: APIS - Anti-Predator Interference System
user_name: Jermoo
date: 2026-01-22
validationResults:
  frCoverage: PASS (59/59)
  architectureCompliance: PASS
  storyQuality: EXCELLENT
  epicStructure: EXCELLENT
  dependencies: CLEAN
---

# APIS - Anti-Predator Interference System - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for APIS, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Edge Hardware — Detection Requirements:**
- FR1: System shall detect moving objects in camera field of view (F-DET-01)
- FR2: System shall estimate object size in pixels (F-DET-02)
- FR3: System shall distinguish large objects (>18px at VGA) from small objects (F-DET-03)
- FR4: System shall detect hovering behavior (object stationary for >1 second) (F-DET-04)
- FR5: System shall operate at minimum 5 FPS for motion detection (F-DET-05)
- FR6: Camera shall be positioned 1-1.5 meters from hive entrance (F-DET-06)

**Edge Hardware — Deterrent Requirements:**
- FR7: System shall aim laser at detected hornet position (F-DET-07)
- FR8: System shall sweep laser line across target zone (F-DET-08)
- FR9: System shall activate laser only when hornet detected (F-DET-09)
- FR10: System shall limit laser activation to 10 seconds continuous (F-DET-10)
- FR11: System shall log detection events with timestamp (F-DET-11)

**Edge Hardware — Safety Requirements:**
- FR12: Laser shall be Class 3R or below (≤5mW) (F-SAF-01)
- FR13: System shall include kill switch for laser (F-SAF-02)
- FR14: Laser shall not point upward (aircraft safety) (F-SAF-03)
- FR15: Documentation shall include laser safety warnings (F-SAF-04)

**Edge Hardware — Operational Requirements:**
- FR16: System shall operate during daylight hours (09:00-17:00) (F-OPS-01)
- FR17: System shall be powered via European mains (230V via USB adapter) (F-OPS-02)
- FR18: System shall survive outdoor temperatures (5-35°C) (F-OPS-03)
- FR19: System shall be mountable on pole or suspended from roof (F-OPS-04)

**Edge Hardware — Control & Connectivity Requirements:**
- FR20: System shall operate standalone without network connection (F-CTL-01)
- FR21: System shall include physical arm/disarm button (F-CTL-02)
- FR22: System shall provide WiFi arm/disarm via HTTP endpoint (F-CTL-03)
- FR23: System shall provide HTTP endpoint for status query (F-CTL-04)
- FR24: System shall provide MJPEG video stream endpoint (F-CTL-05)
- FR25: System shall save incident clips to local storage (F-CTL-06)
- FR26: System shall send heartbeat to configured webhook URL (F-CTL-07)
- FR27: System shall send failure alerts to configured webhook URL (F-CTL-08)
- FR28: System shall provide LED indicator for armed/disarmed state (F-CTL-09)

**Portal — Hornet Dashboard Requirements:**
- FR29: Dashboard shall display current weather (temperature, conditions) from site GPS
- FR30: Dashboard shall display today's detection count ("X hornets deterred today")
- FR31: Dashboard shall display device status (online/offline, armed/disarmed)
- FR32: Dashboard shall display Activity Clock (24-hour polar chart of hourly activity)
- FR33: Dashboard shall display temperature correlation chart
- FR34: Dashboard shall support time range selector (Day/Week/Month/Season/Year/All Time)
- FR35: Dashboard shall display recent clips with thumbnails and date filter
- FR36: Dashboard shall support Nest Radius Estimator (optional map feature)

**Portal — Hive Diary Requirements:**
- FR37: Portal shall support multiple Sites (apiaries) with GPS coordinates
- FR38: Portal shall support multiple Hives per site with configuration
- FR39: Portal shall support Inspection records with quick-entry form
- FR40: Portal shall track frame-level data per inspection (brood, honey, pollen)
- FR41: Portal shall support Treatment logs with type, method, dose, mite counts
- FR42: Portal shall support Feeding logs with type, amount, concentration
- FR43: Portal shall support Harvest tracking with frames, amount, notes
- FR44: Portal shall support Equipment log (installed/removed dates)
- FR45: Portal shall support custom labels for feeds, treatments, equipment, issues
- FR46: Portal shall display Treatment Calendar with reminders

**Portal — BeeBrain AI Requirements:**
- FR47: BeeBrain shall provide contextual analysis per section (dashboard, hive, financial, maintenance)
- FR48: BeeBrain shall show timestamp and refresh button for on-demand analysis
- FR49: BeeBrain shall surface proactive insights with dismiss/snooze/learn more options

**Portal — Mobile PWA Requirements:**
- FR50: PWA shall work offline with cached app shell and local data storage
- FR51: PWA shall sync automatically when connection returns
- FR52: PWA shall support voice input via browser SpeechRecognition or server Whisper
- FR53: PWA shall use 64px minimum tap targets for glove-friendly operation
- FR54: PWA shall support QR code navigation for large apiaries

**Portal — Data Export Requirements:**
- FR55: Export shall support configurable field selection
- FR56: Export shall support Quick Summary, Detailed Markdown, and Full JSON formats

**Portal — Emotional Moments Requirements:**
- FR57: Portal shall celebrate first harvest with special screen
- FR58: Portal shall provide post-mortem wizard for hive losses
- FR59: Portal shall provide season recap summary

### NonFunctional Requirements

**Performance:**
- NFR1: Detection pipeline shall achieve ≥5 FPS for motion detection
- NFR2: Motion response shall be <500ms from frame capture to detection
- NFR3: Servo response shall be ~45ms for tracking
- NFR4: Dashboard shall load status in <2 seconds

**Reliability:**
- NFR5: Edge device shall operate 8+ hours continuous without failure
- NFR6: Edge device shall continue operation with zero network connectivity
- NFR7: PWA shall never lose data during offline/online transitions

**Storage:**
- NFR8: Edge device shall handle ~50 MB/day clip storage
- NFR9: Edge device shall support ~1.5 GB/month local storage
- NFR10: Server shall auto-prune clips (30 days), photos (90 days), logs (7 days)

**Environmental:**
- NFR11: Edge device shall operate in 5-35°C temperature range
- NFR12: Edge device shall survive outdoor conditions (covered installation)

**Cost:**
- NFR13: Production hardware cost shall be <€50 (ESP32 path)

**Security:**
- NFR14: Dashboard shall use OIDC/JWT authentication via Zitadel
- NFR15: Device communication shall use per-unit API keys
- NFR16: All tenant data shall be isolated via Row-Level Security

**Accessibility:**
- NFR17: Brown Bramble text on Coconut Cream shall meet WCAG AAA (10.2:1 contrast)
- NFR18: Mobile body text shall be 18px minimum for outdoor visibility

**Usability:**
- NFR19: Field inspection shall be completable in <3 minutes with gloves
- NFR20: Voice transcription shall require minimal corrections

### Additional Requirements

**From Architecture — Infrastructure:**
- AR1: Use YugabyteDB (PostgreSQL-compatible) for multi-tenant data storage
- AR2: Use Zitadel for OIDC/OAuth2 identity management
- AR3: Use VictoriaMetrics for optional observability metrics
- AR4: Use Docker Compose for self-hosted deployment (apis-server + yugabyte + zitadel)
- AR5: All tables include tenant_id with Row-Level Security (RLS) enforced
- AR6: Support both self-hosted and future SaaS deployment modes

**From Architecture — Edge Device:**
- AR7: Primary target is ESP32 (C++); Pi 5 is development convenience only
- AR8: Use push model (device → server) for NAT compatibility
- AR9: Implement heartbeat protocol (60s interval) with time sync in response
- AR10: Implement OTA firmware updates via ESP-IDF with signed binaries
- AR11: Implement upload resilience with retry/backoff and local spool (50 clips max)
- AR12: Use WebSocket proxy through server for live video (WSS to avoid HTTPS mixed content)

**From Architecture — API & Communication:**
- AR13: Use per-unit API keys (not shared) for device authentication
- AR14: Device auth header: X-API-Key
- AR15: All JSON fields use snake_case naming
- AR16: API responses follow {data: ..., meta: ...} or {error: ..., code: ...} format
- AR17: Use zerolog for structured JSON logging

**From Architecture — Frontend:**
- AR18: Use React + Refine + Ant Design + @ant-design/charts
- AR19: Apply Honey Beegood theme (Sea Buckthorn #f7a42d, Coconut Cream #fbf9e7, Brown Bramble #662604, Salomie #fcd483)
- AR20: Use ProLayout with sidebar navigation
- AR21: Use Dexie.js for IndexedDB offline storage
- AR22: Implement Service Worker for PWA caching
- AR23: Use polling (30s interval) for real-time updates

**From UX — Design System:**
- UX1: 64px minimum tap targets for mobile (glove-friendly)
- UX2: 16px minimum gap between interactive elements
- UX3: Swipe-based navigation for mobile inspection flow
- UX4: Bottom-anchored action buttons (64px height, full width)
- UX5: Voice input button prominent, keyboard secondary
- UX6: Sync status indicator ("⚡ Offline — X pending" or "✓ Synced")

**From UX — Visual Design:**
- UX7: Border radius: 8-12px for warm, non-clinical feel
- UX8: Typography: system-ui font stack
- UX9: H1: 32px/600, H2: 24px/600, Body: 16px/400, Mobile Body: 18px
- UX10: Spacing based on 8px unit (xs:4, sm:8, md:16, lg:24, xl:32, 2xl:48)

**From UX — Emotional Design:**
- UX11: Idle state should actively communicate "protection" not just "no data"
- UX12: Frame detections as learning ("Hornets prefer 20°C") not just logging
- UX13: Celebrate milestones (first harvest, overwintering success)
- UX14: Acknowledge losses with post-mortem workflow

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 10 | Detect moving objects in camera FOV |
| FR2 | Epic 10 | Estimate object size in pixels |
| FR3 | Epic 10 | Distinguish large objects (>18px) from small |
| FR4 | Epic 10 | Detect hovering behavior (>1 second) |
| FR5 | Epic 10 | Operate at minimum 5 FPS |
| FR6 | Epic 10 | Camera positioned 1-1.5m from hive |
| FR7 | Epic 12 | Aim laser at detected hornet position |
| FR8 | Epic 12 | Sweep laser line across target zone |
| FR9 | Epic 12 | Activate laser only when hornet detected |
| FR10 | Epic 12 | Limit laser to 10 seconds continuous |
| FR11 | Epic 10 | Log detection events with timestamp |
| FR12 | Epic 12 | Laser Class 3R or below (≤5mW) |
| FR13 | Epic 12 | Include kill switch for laser |
| FR14 | Epic 12 | Laser shall not point upward |
| FR15 | Epic 12 | Documentation includes laser safety warnings |
| FR16 | Epic 11 | Operate during daylight hours (09:00-17:00) |
| FR17 | Epic 11 | Powered via European mains (230V via USB) |
| FR18 | Epic 11 | Survive outdoor temperatures (5-35°C) |
| FR19 | Epic 11 | Mountable on pole or suspended from roof |
| FR20 | Epic 10 | Operate standalone without network |
| FR21 | Epic 12 | Physical arm/disarm button |
| FR22 | Epic 10 | WiFi arm/disarm via HTTP endpoint |
| FR23 | Epic 10 | HTTP endpoint for status query |
| FR24 | Epic 10 | MJPEG video stream endpoint |
| FR25 | Epic 10 | Save incident clips to local storage |
| FR26 | Epic 10 | Send heartbeat to webhook URL |
| FR27 | Epic 10 | Send failure alerts to webhook URL |
| FR28 | Epic 10 | LED indicator for armed/disarmed state |
| FR29 | Epic 3 | Display current weather from site GPS |
| FR30 | Epic 3 | Display today's detection count |
| FR31 | Epic 2 | Display device status (online/armed) |
| FR32 | Epic 3 | Display Activity Clock (24-hour polar) |
| FR33 | Epic 3 | Display temperature correlation chart |
| FR34 | Epic 3 | Support time range selector |
| FR35 | Epic 4 | Display recent clips with thumbnails |
| FR36 | Epic 4 | Support Nest Radius Estimator map |
| FR37 | Epic 2 | Support multiple Sites with GPS |
| FR38 | Epic 5 | Support multiple Hives per site |
| FR39 | Epic 5 | Support Inspection records with quick-entry |
| FR40 | Epic 5 | Track frame-level data per inspection |
| FR41 | Epic 6 | Support Treatment logs |
| FR42 | Epic 6 | Support Feeding logs |
| FR43 | Epic 6 | Support Harvest tracking |
| FR44 | Epic 6 | Support Equipment log |
| FR45 | Epic 6 | Support custom labels |
| FR46 | Epic 6 | Display Treatment Calendar with reminders |
| FR47 | Epic 8 | BeeBrain contextual analysis per section |
| FR48 | Epic 8 | Show timestamp and refresh button |
| FR49 | Epic 8 | Surface proactive insights |
| FR50 | Epic 7 | PWA works offline with cached shell |
| FR51 | Epic 7 | Sync automatically when online |
| FR52 | Epic 7 | Support voice input |
| FR53 | Epic 7 | Use 64px minimum tap targets |
| FR54 | Epic 7 | Support QR code navigation |
| FR55 | Epic 9 | Export with configurable field selection |
| FR56 | Epic 9 | Support multiple export formats |
| FR57 | Epic 9 | Celebrate first harvest |
| FR58 | Epic 9 | Provide post-mortem wizard |
| FR59 | Epic 9 | Provide season recap summary |

---

## Epic List

### Epic 1: Portal Foundation & Authentication
Users can access the APIS portal, authenticate via Zitadel OIDC, and see the dashboard layout with sidebar navigation. Establishes the technical foundation (YugabyteDB, Docker Compose, Ant Design theme) while delivering the first user touchpoint.

**FRs Covered:** Foundation for all portal FRs
**Additional Reqs:** AR1-AR6, AR14-AR23, UX7-UX10, NFR14-NFR16

---

### Epic 2: Site & Unit Management
Users can create sites (apiaries) with GPS coordinates, register APIS units with per-unit API keys, and monitor their online/offline/armed status on the dashboard.

**FRs Covered:** FR31, FR37
**Additional Reqs:** AR5, AR12-AR13, NFR7

---

### Epic 3: Hornet Detection Dashboard
Users can view today's detection count, current weather (from site GPS), the Activity Clock (24-hour polar chart), temperature correlation scatter plot, and daily/weekly trend lines. Time range selector (Day/Week/Month/Season/Year/All Time) updates all charts together.

**FRs Covered:** FR29, FR30, FR32, FR33, FR34
**Additional Reqs:** AR18-AR19, NFR4, UX11-UX12

---

### Epic 4: Clip Archive & Video Review
Users can browse detection clips with thumbnails, search/filter by date, and play video via WebSocket proxy (avoiding mixed content issues). Optional Nest Radius Estimator displays a map with estimated nest distance based on hornet timing patterns.

**FRs Covered:** FR35, FR36
**Additional Reqs:** AR12 (WebSocket proxy)

---

### Epic 5: Hive Management & Inspections
Users can manage hives with queen info and box configuration, record inspections using the swipe-based quick-entry form, and track frame-level data (brood, honey, pollen) with seasonal progression graphs.

**FRs Covered:** FR38, FR39, FR40
**Additional Reqs:** UX1-UX6 (glove-friendly inputs)

---

### Epic 6: Treatments, Feedings & Harvests
Users can log varroa treatments (with mite counts), feedings (with concentration), harvests (with frame details), and equipment (installed/removed dates). Custom labels system for personalized categories. Treatment calendar with reminders.

**FRs Covered:** FR41, FR42, FR43, FR44, FR45, FR46
**Additional Reqs:** NFR10 (auto-pruning)

---

### Epic 7: Mobile PWA & Field Mode
Users can use the app on mobile with gloves (64px tap targets, swipe navigation), work offline with automatic sync (IndexedDB + Service Worker), use voice input (browser SpeechRecognition or server Whisper), and scan QR codes for instant hive navigation.

**FRs Covered:** FR50, FR51, FR52, FR53, FR54
**Additional Reqs:** AR21-AR22, UX1-UX6, NFR7, NFR17-NFR20

---

### Epic 8: BeeBrain AI Insights
Users receive contextual AI analysis per section (dashboard, hive detail, financial, maintenance) with timestamp and refresh button. Proactive insights surface automatically with dismiss/snooze/learn-more options. MVP uses rule engine; Phase 2 adds mini ML model.

**FRs Covered:** FR47, FR48, FR49
**Additional Reqs:** UX11-UX14

---

### Epic 9: Data Export & Emotional Moments
Users can export hive data with configurable field selection in Quick Summary (forums), Detailed Markdown (AI), or Full JSON (nerds) formats. Celebrates first harvest with special screen. Provides post-mortem wizard for hive losses. Generates shareable season recap summaries.

**FRs Covered:** FR55, FR56, FR57, FR58, FR59
**Additional Reqs:** UX13-UX14

---

### Epic 10: Edge Detection Software
Complete detection software that captures video, runs motion detection pipeline, identifies hornets by size/hover behavior, records clips locally, and communicates with server (heartbeat, clip upload, status APIs). Runs on Pi 5 prototype with architecture documented for ESP32 port.

**FRs Covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR11, FR20, FR22, FR23, FR24, FR25, FR26, FR27, FR28
**Additional Reqs:** AR7-AR11, NFR1-NFR3, NFR5-NFR9, NFR11-NFR13

**Deliverable:** Working Python codebase (Pi 5)

---

### Epic 11: Hardware Assembly Documentation
Complete step-by-step assembly manuals for all three hardware paths, written as detailed "cookbook" documentation that the user (limited electronics experience) and a smaller AI can execute later during physical assembly.

**Paths Covered:**
- **Path A:** ESP32-CAM (~€15 BOM)
- **Path B:** XIAO ESP32S3 + OV5640 (~€25 BOM)
- **Path C:** Raspberry Pi 5 (~€90 BOM, development reference)

**Each Manual Includes:**
- Component list with exact part numbers and suppliers
- Step-by-step assembly (Step 1, Step 2... with what/why/how)
- Wiring diagrams (ASCII and/or described for diagram generation)
- GPIO pin assignments with rationale
- Power calculations explained step-by-step
- Verification checkpoints
- Troubleshooting guide
- Safety warnings (especially laser)
- Glossary of terms

**FRs Covered:** FR16, FR17, FR18, FR19 (operational requirements inform documentation)
**Additional Reqs:** Per CLAUDE.md hardware documentation philosophy

**Deliverable:** Detailed assembly manuals (documentation, not code)

---

### Epic 12: Edge Laser Deterrent Software
Complete deterrent control software that aims servos at detected hornet positions, sweeps laser across target zone, respects safety limits (5mW, 10s max, downward only), and responds to physical arm/disarm button with LED feedback.

**FRs Covered:** FR7, FR8, FR9, FR10, FR12, FR13, FR14, FR15, FR21
**Additional Reqs:** NFR5, NFR11-NFR12

**Deliverable:** Working Python/C++ code for servo/laser control

---

## Epic 1: Portal Foundation & Authentication

Users can access the APIS portal, authenticate via Zitadel OIDC, and see the dashboard layout with sidebar navigation. Establishes the technical foundation while delivering the first user touchpoint.

### Story 1.1: Project Scaffolding & Docker Compose

As a **developer**,
I want a working monorepo with Go server, React dashboard, and Docker Compose configuration,
So that I have the foundation to build all portal features.

**Acceptance Criteria:**

**Given** a fresh clone of the repository
**When** I run `docker compose up`
**Then** YugabyteDB starts and is accessible on port 5433
**And** Zitadel starts and is accessible on port 8080
**And** the Go server starts and listens on port 3000
**And** the React dashboard dev server starts on port 5173

**Given** the services are running
**When** I make a request to `http://localhost:3000/api/health`
**Then** I receive a 200 OK response with `{"status": "ok"}`

**Given** the repository structure
**Then** it follows the pattern defined in CLAUDE.md:
- `apis-server/` contains Go backend with `cmd/server/` and `internal/`
- `apis-dashboard/` contains React + Vite project
- `docker-compose.yml` at root orchestrates all services

**Technical Notes:**
- Go server uses Chi router
- React uses Vite with TypeScript
- YugabyteDB image: `yugabytedb/yugabyte:latest`
- Zitadel image: `ghcr.io/zitadel/zitadel:latest`

---

### Story 1.2: Ant Design Theme Configuration

As a **user**,
I want the dashboard to have a warm, honey-themed appearance,
So that it feels friendly and connected to beekeeping rather than clinical.

**Acceptance Criteria:**

**Given** the React dashboard is running
**When** I view any page
**Then** the primary color is Sea Buckthorn (`#f7a42d`)
**And** the background color is Coconut Cream (`#fbf9e7`)
**And** text color is Brown Bramble (`#662604`)
**And** card backgrounds use Salomie (`#fcd483`)

**Given** the theme configuration
**Then** Ant Design ConfigProvider wraps the app with custom theme tokens:
```javascript
{
  colorPrimary: '#f7a42d',
  colorBgContainer: '#fbf9e7',
  colorText: '#662604',
  borderRadius: 8,
  fontFamily: 'system-ui, -apple-system, sans-serif'
}
```

**Given** any Card component
**When** it renders
**Then** it has 12px border radius and subtle shadow
**And** uses Salomie (`#fcd483`) background

**Technical Notes:**
- Theme defined in `src/theme/apisTheme.ts`
- Applied via Ant Design 5.x ConfigProvider
- Component overrides for Card, Button, Segmented controls

---

### Story 1.3: Sidebar Layout & Navigation Shell

As a **user**,
I want a sidebar navigation that shows all main sections,
So that I can easily navigate between Dashboard, Units, Hives, Clips, and Settings.

**Acceptance Criteria:**

**Given** I am on any page of the dashboard
**When** I view the layout
**Then** I see a sidebar on the left with the APIS logo at top
**And** navigation items: Dashboard, Units, Hives, Clips, Statistics, Settings
**And** the main content area is on the right

**Given** I am on desktop (viewport > 768px)
**When** I view the sidebar
**Then** it shows icons with labels
**And** is collapsible to icon-only mode

**Given** I am on mobile (viewport ≤ 768px)
**When** I view the layout
**Then** the sidebar is hidden by default
**And** a hamburger menu icon appears in the header
**And** tapping it reveals the sidebar as an overlay

**Given** I click a navigation item
**When** the page loads
**Then** that navigation item is highlighted as active
**And** the URL updates to match the section

**Technical Notes:**
- Uses Ant Design ProLayout component
- Refine's `<Sider>` integration
- Routes: `/`, `/units`, `/hives`, `/clips`, `/statistics`, `/settings`

---

### Story 1.4: Zitadel OIDC Integration

As a **user**,
I want to log in securely using my account,
So that my data is protected and I can access my personal dashboard.

**Acceptance Criteria:**

**Given** I am not authenticated
**When** I navigate to any protected route
**Then** I am redirected to the Zitadel login page

**Given** I am on the Zitadel login page
**When** I enter valid credentials and submit
**Then** I am redirected back to the dashboard
**And** my user name appears in the sidebar footer
**And** I can access all protected routes

**Given** I am authenticated
**When** I click "Logout" in the sidebar
**Then** my session is terminated
**And** I am redirected to the login page
**And** I cannot access protected routes until I log in again

**Given** my JWT token expires
**When** I make an API request
**Then** the server returns 401 Unauthorized
**And** the dashboard redirects me to re-authenticate

**Given** the Go server receives an API request
**When** it validates the JWT
**Then** it verifies the signature against Zitadel's JWKS endpoint
**And** extracts the user_id and tenant_id from claims

**Technical Notes:**
- Uses OIDC Authorization Code flow with PKCE
- Zitadel configured with APIS as an application
- JWT claims include `sub` (user_id) and custom `tenant_id`
- Go middleware validates JWT on all `/api/*` routes except `/api/health`

---

### Story 1.5: Tenant Context & Database Setup

As a **system**,
I want all data isolated by tenant,
So that each user's data is private and secure.

**Acceptance Criteria:**

**Given** the database is initialized
**When** I inspect the schema
**Then** a `tenants` table exists with columns: `id`, `name`, `created_at`
**And** a `users` table exists with columns: `id`, `tenant_id`, `zitadel_user_id`, `email`, `name`, `created_at`

**Given** a user authenticates successfully
**When** they don't have a record in the `users` table
**Then** a new user record is created automatically
**And** a new tenant is created if this is their first login
**And** the tenant_id is stored in their user record

**Given** an authenticated API request
**When** the Go server processes it
**Then** it sets `app.tenant_id` in the database session
**And** all queries are automatically filtered by RLS policies

**Given** RLS is enabled on tenant-scoped tables
**When** a query runs without `app.tenant_id` set
**Then** the query returns no rows (fail-safe)

**Given** a malicious user tries to access another tenant's data
**When** they send a request with a different tenant_id in the body
**Then** the server ignores it and uses the tenant_id from their JWT
**And** RLS prevents any cross-tenant data access

**Technical Notes:**
- RLS policy: `tenant_id = current_setting('app.tenant_id')::uuid`
- Middleware sets tenant context before each request
- All future tables include `tenant_id` column with RLS

---

### Story 1.6: Health Endpoint & Deployment Verification

As a **operator**,
I want a health check endpoint that verifies all dependencies,
So that I can monitor the system and detect failures.

**Acceptance Criteria:**

**Given** all services are healthy
**When** I call `GET /api/health`
**Then** I receive HTTP 200 with:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "checks": {
    "database": "ok",
    "zitadel": "ok"
  }
}
```

**Given** the database is unreachable
**When** I call `GET /api/health`
**Then** I receive HTTP 503 with:
```json
{
  "status": "degraded",
  "checks": {
    "database": "error: connection refused",
    "zitadel": "ok"
  }
}
```

**Given** the application starts
**When** it initializes
**Then** it logs startup information using zerolog:
```json
{"level":"info","time":"...","message":"APIS server starting","version":"0.1.0","port":3000}
```

**Given** Docker Compose is configured
**When** I run `docker compose up --build`
**Then** all services start successfully
**And** the health endpoint returns 200 within 60 seconds

**Technical Notes:**
- Health endpoint is unauthenticated (for load balancer probes)
- Database check: simple `SELECT 1` query
- Zitadel check: fetch JWKS endpoint
- Version injected at build time via ldflags

---

## Epic 2: Site & Unit Management

Users can create sites (apiaries) with GPS coordinates, register APIS units with per-unit API keys, and monitor their online/offline/armed status on the dashboard.

### Story 2.1: Create and Manage Sites

As a **beekeeper**,
I want to create sites representing my apiaries with their locations,
So that I can organize my units and hives by physical location.

**Acceptance Criteria:**

**Given** I am authenticated and on the Sites page
**When** I click "Add Site"
**Then** a form appears with fields: Name, GPS Latitude, GPS Longitude, Timezone

**Given** I fill in the site form with valid data
**When** I click "Save"
**Then** the site is created in the database with my tenant_id
**And** I see the new site in my sites list
**And** a success notification appears

**Given** I have existing sites
**When** I view the Sites page
**Then** I see a list/grid of all my sites
**And** each site shows its name and location on a mini-map thumbnail

**Given** I click on a site
**When** the site detail page loads
**Then** I see the site name, GPS coordinates displayed on a map
**And** a list of units assigned to this site
**And** options to Edit or Delete the site

**Given** I try to delete a site with assigned units
**When** I click "Delete"
**Then** I see a warning that units must be reassigned first
**And** the deletion is blocked

**Technical Notes:**
- Table: `sites` (id, tenant_id, name, latitude, longitude, timezone, created_at, updated_at)
- RLS policy on sites table
- GPS stored as DECIMAL(10,7) for latitude/longitude
- Timezone as IANA string (e.g., "Europe/Brussels")

---

### Story 2.2: Register APIS Units

As a **beekeeper**,
I want to register my APIS hardware units and get API keys,
So that my units can securely communicate with the server.

**Acceptance Criteria:**

**Given** I am on the Units page
**When** I click "Register Unit"
**Then** a form appears with fields: Unit Name, Assigned Site (dropdown), Covered Hives (optional)

**Given** I submit the registration form
**When** the unit is created
**Then** a unique API key is generated and displayed ONCE
**And** I see a warning: "Save this key securely - it cannot be retrieved again"
**And** a "Copy to Clipboard" button is provided
**And** the unit appears in my units list

**Given** a unit exists
**When** I view the unit detail page
**Then** I see: Unit Name, Assigned Site, Registration Date, Last Seen timestamp, Armed Status
**And** I can regenerate the API key (which invalidates the old one)
**And** I can edit the unit name or assigned site

**Given** I regenerate an API key
**When** the new key is generated
**Then** the old key immediately stops working
**And** the new key is displayed once with copy button

**Given** an API request arrives with an invalid API key
**When** the server validates it
**Then** the request is rejected with 401 Unauthorized

**Technical Notes:**
- Table: `units` (id, tenant_id, site_id, name, api_key_hash, armed, last_seen_at, last_ip, firmware_version, created_at)
- API key format: `apis_` + 32 random hex characters
- Store bcrypt hash of API key, never the raw key
- Unit auth via `X-API-Key` header

---

### Story 2.3: Unit Heartbeat Reception

As an **APIS unit**,
I want to send heartbeats to the server,
So that the server knows I'm online and can sync my clock.

**Acceptance Criteria:**

**Given** a registered unit with valid API key
**When** it sends `POST /api/units/heartbeat` with header `X-API-Key: apis_xxx`
**Then** the server responds with HTTP 200 and:
```json
{
  "server_time": "2026-01-22T14:30:00Z",
  "config": {
    "armed": true,
    "detection_enabled": true
  }
}
```
**And** the unit's `last_seen_at` is updated in the database
**And** the unit's `last_ip` is recorded

**Given** the heartbeat payload includes unit status
**When** the server receives:
```json
{
  "armed": true,
  "firmware_version": "1.0.3",
  "uptime_seconds": 3600,
  "free_storage_mb": 450,
  "pending_clips": 2
}
```
**Then** the server updates the unit record with this information

**Given** a unit hasn't sent a heartbeat in 120 seconds
**When** the dashboard queries unit status
**Then** that unit is marked as "offline"

**Given** an invalid API key is used
**When** the heartbeat request arrives
**Then** the server responds with 401 Unauthorized
**And** no database update occurs

**Technical Notes:**
- Heartbeat interval: 60 seconds (configurable)
- Offline threshold: 120 seconds (2 missed heartbeats)
- Response includes server time for clock sync
- Log heartbeats for debugging but don't store permanently

---

### Story 2.4: Unit Status Dashboard Cards

As a **beekeeper**,
I want to see the status of all my units at a glance,
So that I know if any unit needs attention.

**Acceptance Criteria:**

**Given** I am on the Dashboard
**When** I view the Units section
**Then** I see a card for each unit showing:
- Unit name
- Assigned site name
- Status indicator (green=online+armed, yellow=online+disarmed, red=offline)
- Last seen timestamp ("2 minutes ago" or "Offline since 10:30")

**Given** a unit is online and armed
**When** I view its card
**Then** I see a green status dot with label "Armed"
**And** optionally a small live preview thumbnail (if video proxy is available)

**Given** a unit is online but disarmed
**When** I view its card
**Then** I see a yellow status dot with label "Disarmed"

**Given** a unit is offline (no heartbeat > 120s)
**When** I view its card
**Then** I see a red status dot with label "Offline"
**And** the last seen time shows when it went offline

**Given** I click on a unit card
**When** the click is processed
**Then** I navigate to the unit detail page

**Given** the dashboard is open
**When** a unit's status changes
**Then** the card updates within 30 seconds (polling interval)

**Technical Notes:**
- Use Ant Design Card components with Honey Beegood styling
- Status polling via `GET /api/units` every 30 seconds
- Relative time display using dayjs or similar
- Cards arranged in responsive grid (1 col mobile, 2-3 cols desktop)

---

### Story 2.5: Live Video WebSocket Proxy

As a **beekeeper**,
I want to view live video from my units in the dashboard,
So that I can see what's happening at my hives in real-time.

**Acceptance Criteria:**

**Given** I am on a unit detail page
**When** I click "View Live Feed"
**Then** a video player opens showing the live MJPEG stream
**And** the connection uses WSS (secure WebSocket) through the server

**Given** the unit is online and streaming
**When** the WebSocket connection is established
**Then** video frames appear with <500ms latency
**And** the stream continues until I close it or navigate away

**Given** the unit is offline
**When** I try to view live feed
**Then** I see a message "Unit is offline - live feed unavailable"
**And** no connection attempt is made

**Given** the WebSocket connection drops
**When** the dashboard detects disconnection
**Then** it shows "Connection lost - Reconnecting..."
**And** attempts to reconnect automatically (3 retries, exponential backoff)

**Given** I close the video player
**When** the UI closes
**Then** the WebSocket connection is terminated
**And** server resources are released

**Technical Notes:**
- Server proxies WSS to unit's local MJPEG endpoint
- Required to avoid HTTPS mixed content errors (dashboard is HTTPS, unit is HTTP)
- Endpoint: `WSS /api/units/{id}/stream`
- Server maintains connection map: dashboard_ws <-> unit_http
- Use gorilla/websocket on Go server side
- Max concurrent streams per unit: 2 (to limit unit bandwidth)

---

## Epic 3: Hornet Detection Dashboard

Users can view today's detection count, current weather, the Activity Clock (24-hour polar chart), temperature correlation scatter plot, and daily/weekly trend lines. Time range selector updates all charts together.

### Story 3.1: Detection Events Table & API

As a **system**,
I want to store and query detection events from units,
So that the dashboard can display detection statistics and patterns.

**Acceptance Criteria:**

**Given** a unit detects a hornet
**When** it sends `POST /api/units/detections` with:
```json
{
  "detected_at": "2026-01-22T14:30:00Z",
  "confidence": 0.85,
  "size_pixels": 24,
  "hover_duration_ms": 1200,
  "laser_activated": true,
  "clip_filename": "det_20260122_143000.mp4"
}
```
**Then** the server stores the detection in the database
**And** responds with HTTP 201 Created

**Given** I query `GET /api/detections?site_id=xxx&from=2026-01-22&to=2026-01-22`
**When** the server processes the request
**Then** I receive all detections for that site and date range
**And** results include unit_id, detected_at, confidence, laser_activated

**Given** I query `GET /api/detections/stats?site_id=xxx&range=day`
**When** the server processes the request
**Then** I receive aggregated statistics:
```json
{
  "total_detections": 12,
  "laser_activations": 10,
  "hourly_breakdown": [0,0,0,0,0,0,0,0,0,2,3,1,0,2,3,1,0,0,0,0,0,0,0,0],
  "avg_confidence": 0.82
}
```

**Technical Notes:**
- Table: `detections` (id, tenant_id, unit_id, site_id, detected_at, confidence, size_pixels, hover_duration_ms, laser_activated, clip_id, temperature_c, created_at)
- Index on (tenant_id, site_id, detected_at) for range queries
- Temperature captured from weather API at detection time (cached)
- RLS policy ensures tenant isolation

---

### Story 3.2: Today's Detection Count Card

As a **beekeeper**,
I want to see how many hornets were deterred today,
So that I feel confident my hives are being protected.

**Acceptance Criteria:**

**Given** I am on the Dashboard
**When** I view the "Today's Activity" card
**Then** I see a large number showing today's detection count
**And** friendly text: "5 hornets deterred today" (or "No hornets detected today — all quiet!")
**And** the card uses the Honey Beegood warm styling

**Given** there are zero detections today
**When** I view the card
**Then** I see "All quiet today ☀️" with reassuring green checkmark
**And** the card feels positive, not empty

**Given** there are detections today
**When** I view the card
**Then** I see the count prominently displayed
**And** subtext shows "Last detection: 2 hours ago"
**And** laser activation rate: "10 of 12 deterred with laser"

**Given** the selected site changes
**When** I pick a different site from the dropdown
**Then** the detection count updates to reflect that site's data

**Technical Notes:**
- Card component with large typography for count
- Uses `GET /api/detections/stats?site_id=xxx&range=day`
- Refreshes on 30-second polling interval
- Emotional design: "deterred" not "detected" — emphasizes protection

---

### Story 3.3: Weather Integration

As a **beekeeper**,
I want to see current weather conditions for my apiary,
So that I can correlate hornet activity with weather patterns.

**Acceptance Criteria:**

**Given** I am on the Dashboard with a site selected
**When** the page loads
**Then** I see a weather card showing:
- Current temperature (°C)
- Weather condition icon (sunny, cloudy, rain, etc.)
- "Feels like" temperature
- Humidity percentage

**Given** the site has GPS coordinates
**When** the server fetches weather
**Then** it uses a free weather API (Open-Meteo) with the site's lat/long
**And** caches the result for 30 minutes to reduce API calls

**Given** weather data is unavailable (API error)
**When** I view the dashboard
**Then** the weather card shows "Weather unavailable" with retry button
**And** cached data is shown if available (with "Last updated: X ago")

**Given** I'm viewing historical data (time range not "Day")
**When** the dashboard loads
**Then** the weather card shows "Current conditions" note
**And** historical weather is shown in the correlation chart instead

**Technical Notes:**
- API: Open-Meteo (free, no API key required)
- Endpoint: `GET /api/sites/{id}/weather`
- Server-side caching in Redis or in-memory (30 min TTL)
- Store weather snapshots with detections for historical correlation
- Table: `weather_snapshots` (id, site_id, temperature_c, humidity, condition, recorded_at)

---

### Story 3.4: Time Range Selector

As a **beekeeper**,
I want to switch between time ranges to see patterns,
So that I can understand hornet behavior over different periods.

**Acceptance Criteria:**

**Given** I am on the Dashboard
**When** I view the time range selector
**Then** I see a segmented control with options: Day, Week, Month, Season, Year, All Time

**Given** I select "Day"
**When** the charts update
**Then** all charts show today's data only
**And** a date picker appears to select a specific day

**Given** I select "Week"
**When** the charts update
**Then** all charts show the current week (Mon-Sun)
**And** charts aggregate data daily

**Given** I select "Season"
**When** the charts update
**Then** all charts show the hornet season (Aug 1 - Nov 30)
**And** charts aggregate data weekly

**Given** I change the time range
**When** the selection changes
**Then** ALL charts on the dashboard update simultaneously
**And** a loading state shows briefly while data loads
**And** the selected range persists in URL query params

**Technical Notes:**
- Uses Ant Design Segmented component
- Time range stored in React state/context (shared across charts)
- URL sync: `?range=week&date=2026-01-20`
- Season defined as Aug 1 - Nov 30 (configurable per hemisphere)

---

### Story 3.5: Activity Clock Visualization

As a **beekeeper**,
I want to see what time of day hornets are most active,
So that I can understand their daily patterns at my location.

**Acceptance Criteria:**

**Given** I am on the Dashboard
**When** I view the Activity Clock
**Then** I see a 24-hour polar/radar chart shaped like a clock
**And** each hour (0-23) is a spoke on the chart
**And** the radius at each hour represents detection count

**Given** hornets are most active at 14:00-16:00
**When** I view the chart
**Then** the 14, 15, 16 hour spokes bulge outward
**And** nighttime hours (20:00-06:00) show minimal radius

**Given** no detections in the selected time range
**When** I view the chart
**Then** a message shows "No activity recorded for this period"
**And** the chart displays with zero radius (flat)

**Given** I hover over an hour spoke
**When** the tooltip appears
**Then** I see: "14:00 - 15:00: 8 detections (23% of total)"

**Given** the time range is "Season" or longer
**When** the chart renders
**Then** it shows aggregated hourly patterns across all days
**And** title indicates "Average hourly activity"

**Technical Notes:**
- Uses @ant-design/charts Radar or Rose chart
- 24 data points (hours 0-23)
- Sea Buckthorn (#f7a42d) for data fill
- API: `GET /api/detections/hourly?site_id=xxx&range=week`
- Clock labels: 00, 06, 12, 18 at cardinal positions

---

### Story 3.6: Temperature Correlation Chart

As a **beekeeper**,
I want to see how hornet activity relates to temperature,
So that I can predict high-activity days.

**Acceptance Criteria:**

**Given** I am on the Dashboard
**When** I view the Temperature Correlation chart
**Then** I see a scatter plot with:
- X-axis: Temperature (°C)
- Y-axis: Detection count
- Each dot represents a day's data

**Given** there's a clear pattern (e.g., more activity at 18-22°C)
**When** I view the chart
**Then** I see dots clustered in that temperature range
**And** an optional trend line shows the correlation

**Given** I hover over a data point
**When** the tooltip appears
**Then** I see: "Oct 15: 22°C, 14 detections"

**Given** I click on a data point
**When** the click is processed
**Then** I can optionally drill down to that day's detailed view

**Given** the time range is "Day"
**When** the chart renders
**Then** it shows hourly temperature vs detections for that day

**Technical Notes:**
- Uses @ant-design/charts Scatter
- Data: daily aggregates (date, avg_temp, detection_count)
- API: `GET /api/detections/temperature-correlation?site_id=xxx&range=month`
- Optional: linear regression trend line
- Insight text below chart: "Hornets prefer 18-22°C at your location"

---

### Story 3.7: Daily/Weekly Trend Line Chart

As a **beekeeper**,
I want to see detection trends over time,
So that I can understand if hornet pressure is increasing or decreasing.

**Acceptance Criteria:**

**Given** I am on the Dashboard
**When** I view the Trend chart
**Then** I see a line/area chart with:
- X-axis: Time (days or weeks depending on range)
- Y-axis: Detection count
- Filled area under the line in Sea Buckthorn color

**Given** time range is "Week"
**When** the chart renders
**Then** X-axis shows Mon, Tue, Wed, Thu, Fri, Sat, Sun
**And** each point shows that day's total detections

**Given** time range is "Month"
**When** the chart renders
**Then** X-axis shows dates (1, 5, 10, 15, 20, 25, 30)
**And** line connects daily totals

**Given** time range is "Season" or "Year"
**When** the chart renders
**Then** data is aggregated weekly to avoid clutter
**And** X-axis shows week numbers or month names

**Given** I hover over a data point
**When** the tooltip appears
**Then** I see: "Oct 15: 14 detections"

**Given** the previous period's data exists
**When** I view the chart
**Then** a faded comparison line shows last week/month/season
**And** legend indicates "This week" vs "Last week"

**Technical Notes:**
- Uses @ant-design/charts Line or Area
- API: `GET /api/detections/trend?site_id=xxx&range=month`
- Comparison line is optional (togglable)
- Responsive: fewer data points on mobile

---

## Epic 4: Clip Archive & Video Review

Users can browse detection clips with thumbnails, search/filter by date, and play video via WebSocket proxy. Optional Nest Radius Estimator displays a map with estimated nest distance based on hornet timing patterns.

### Story 4.1: Clip Upload & Storage

As an **APIS unit**,
I want to upload detection clips to the server,
So that beekeepers can review what the system detected.

**Acceptance Criteria:**

**Given** a unit has recorded a detection clip
**When** it sends `POST /api/units/clips` with multipart form data:
- `file`: MP4 video file (max 10MB)
- `detection_id`: UUID of the associated detection
- `recorded_at`: ISO timestamp
**Then** the server stores the file in the clips directory
**And** generates a thumbnail from the first frame
**And** creates a `clips` database record
**And** responds with HTTP 201 and clip ID

**Given** the server receives a clip
**When** it processes the upload
**Then** it validates the file is valid MP4
**And** rejects files larger than 10MB with 413 Payload Too Large
**And** stores files organized by: `clips/{tenant_id}/{site_id}/{YYYY-MM}/{filename}`

**Given** thumbnail generation fails
**When** the upload completes
**Then** a placeholder thumbnail is used
**And** the clip is still saved successfully
**And** an error is logged for investigation

**Given** a unit is offline
**When** it comes back online
**Then** it uploads queued clips in order (oldest first)
**And** server accepts clips with `recorded_at` in the past

**Technical Notes:**
- Table: `clips` (id, tenant_id, unit_id, site_id, detection_id, file_path, thumbnail_path, duration_seconds, file_size_bytes, recorded_at, created_at)
- Thumbnail: JPEG, 320x240, extracted via ffmpeg
- Storage: local filesystem (mountable volume in Docker)
- Future: S3-compatible storage option

---

### Story 4.2: Clip Archive List View

As a **beekeeper**,
I want to browse my detection clips with thumbnails,
So that I can find and review specific incidents.

**Acceptance Criteria:**

**Given** I am on the Clips page
**When** the page loads
**Then** I see a grid of clip thumbnails (newest first)
**And** each thumbnail shows:
- Preview image
- Date/time: "Jan 22, 14:30"
- Unit name
- Duration: "0:04"

**Given** I have many clips
**When** I scroll down
**Then** more clips load automatically (infinite scroll)
**Or** pagination controls appear at the bottom

**Given** I want to filter clips
**When** I use the filter controls
**Then** I can filter by:
- Date range (date picker)
- Unit (dropdown)
- Site (dropdown if multiple sites)

**Given** I apply filters
**When** the results update
**Then** only matching clips are shown
**And** a "Clear filters" button appears
**And** result count is displayed: "Showing 12 clips"

**Given** there are no clips matching the filter
**When** I view the page
**Then** I see "No clips found for this period"
**And** suggestions to adjust filters

**Technical Notes:**
- API: `GET /api/clips?site_id=xxx&from=2026-01-01&to=2026-01-31&unit_id=xxx&page=1&per_page=20`
- Lazy load thumbnails for performance
- Grid: 2 columns mobile, 3-4 columns desktop
- Uses Ant Design Card with Image component

---

### Story 4.3: Clip Video Playback

As a **beekeeper**,
I want to play detection clips in the dashboard,
So that I can see exactly what the system detected.

**Acceptance Criteria:**

**Given** I am on the Clips page
**When** I click on a clip thumbnail
**Then** a modal opens with:
- Video player (HTML5)
- Play/pause controls
- Playback progress bar
- Full-screen button

**Given** the video modal is open
**When** the video loads
**Then** it plays automatically
**And** displays detection metadata below:
- "Detected: Jan 22, 2026 at 14:30:22"
- "Unit: Hive 1 Protector"
- "Confidence: 85%"
- "Laser activated: Yes"

**Given** I am watching a clip
**When** I click outside the modal or press Escape
**Then** the modal closes
**And** video playback stops

**Given** I want to navigate between clips
**When** I use arrow keys or prev/next buttons
**Then** I can move to the previous/next clip without closing modal

**Given** the video fails to load
**When** an error occurs
**Then** I see "Video unavailable" message
**And** option to download the file directly

**Technical Notes:**
- Video served via: `GET /api/clips/{id}/video`
- Streaming with Range header support for seeking
- Modal uses Ant Design Modal component
- HTML5 video with native controls

---

### Story 4.4: Clip Management (Delete/Archive)

As a **beekeeper**,
I want to delete clips I no longer need,
So that I can manage my storage space.

**Acceptance Criteria:**

**Given** I am viewing a clip in the modal
**When** I click "Delete"
**Then** a confirmation dialog appears: "Delete this clip permanently?"
**And** I can confirm or cancel

**Given** I confirm deletion
**When** the clip is deleted
**Then** the file is removed from storage
**And** the database record is marked as deleted (soft delete)
**And** the modal closes and clip disappears from grid
**And** success notification: "Clip deleted"

**Given** the system runs daily maintenance
**When** clips are older than 30 days
**Then** they are automatically deleted (soft delete)
**And** files are moved to a "trash" folder for 7 days before permanent deletion

**Given** I am an admin
**When** I view storage usage
**Then** I see total clips count and storage used
**And** option to run cleanup manually

**Given** a clip is associated with a starred/saved detection
**When** auto-prune runs
**Then** that clip is NOT deleted
**And** only unstarred clips older than 30 days are pruned

**Technical Notes:**
- Soft delete: `deleted_at` timestamp on clips table
- Cron job: daily at 03:00 for auto-prune
- Trash folder: permanent deletion after 7 days
- Storage stats: `GET /api/admin/storage`

---

### Story 4.5: Nest Radius Estimator Map

As a **beekeeper**,
I want to estimate where the hornet nest might be located,
So that I can report it for destruction.

**Acceptance Criteria:**

**Given** I have a site with GPS coordinates
**When** I navigate to the Nest Estimator page (or section)
**Then** I see a map centered on my site location
**And** my hive location is marked with a bee icon

**Given** I have sufficient detection data (>20 detections)
**When** the system calculates nest distance
**Then** it analyzes hornet arrival/departure timing patterns
**And** estimates flight distance based on ~22 km/h flight speed
**And** displays a radius circle on the map

**Given** the calculation completes
**When** I view the map
**Then** I see:
- Circle radius representing estimated nest distance (e.g., 350m)
- Text: "Nest likely within 350m based on 42 observations"
- Confidence indicator: Low/Medium/High

**Given** insufficient data
**When** I view the Nest Estimator
**Then** I see: "Need more observations to estimate nest location"
**And** progress indicator: "12 of 20 observations collected"

**Given** I want to report the nest
**When** I click "Report Nest Location"
**Then** I see instructions for contacting local authorities
**And** option to export the map/coordinates

**Technical Notes:**
- Map: Leaflet.js with OpenStreetMap tiles
- Calculation: average time between hornet visits suggests foraging distance
- Hornet flight speed: ~20-25 km/h (configurable)
- Radius = (avg_visit_interval_minutes × flight_speed) / 2
- Feature is optional, enabled in site settings
- API: `GET /api/sites/{id}/nest-estimate`

---

## Epic 5: Hive Management & Inspections

Users can manage hives with queen info and box configuration, record inspections using the swipe-based quick-entry form, and track frame-level data (brood, honey, pollen) with seasonal progression graphs.

### Story 5.1: Create and Configure Hives

As a **beekeeper**,
I want to add hives to my sites with their configuration,
So that I can track each hive individually.

**Acceptance Criteria:**

**Given** I am on a Site detail page
**When** I click "Add Hive"
**Then** a form appears with fields:
- Hive name/number (required)
- Queen introduction date
- Queen source (dropdown: Breeder, Swarm, Split, Package, Other + text)
- Number of brood boxes (1-3)
- Number of honey supers (0-5)
- Notes

**Given** I submit a valid hive form
**When** the hive is created
**Then** it appears in the site's hive list
**And** I'm redirected to the hive detail page
**And** success notification: "Hive 3 created"

**Given** I view an existing hive
**When** I click "Edit Configuration"
**Then** I can update queen info, box counts, and notes
**And** changes are saved with timestamp

**Given** I add/remove a honey super
**When** I save the change
**Then** a box history entry is recorded: "Super added: Jan 22, 2026"

**Given** I need to record a queen replacement
**When** I update queen info
**Then** I can mark the old queen as "Replaced" with reason
**And** enter new queen details
**And** queen history is preserved

**Technical Notes:**
- Table: `hives` (id, tenant_id, site_id, name, queen_introduced_at, queen_source, brood_boxes, honey_supers, notes, created_at, updated_at)
- Table: `queen_history` (id, hive_id, introduced_at, source, replaced_at, replacement_reason)
- Table: `box_changes` (id, hive_id, change_type, box_type, changed_at, notes)

---

### Story 5.2: Hive List & Detail View

As a **beekeeper**,
I want to see all my hives at a glance,
So that I can quickly check their status and select one for inspection.

**Acceptance Criteria:**

**Given** I am on a Site page
**When** I view the Hives section
**Then** I see a list/grid of hive cards showing:
- Hive name
- Queen age: "Queen: 2 years"
- Box config: "2 brood + 1 super"
- Last inspection: "5 days ago"
- Status indicator (healthy/needs attention/unknown)

**Given** I click on a hive card
**When** the detail page loads
**Then** I see:
- Hive configuration summary
- Queen info with age calculation
- Box visualization (stacked boxes diagram)
- Recent inspection summary
- Quick actions: "New Inspection", "Edit Config"

**Given** the hive hasn't been inspected in >14 days
**When** I view the hive list
**Then** that hive shows a yellow "Needs inspection" badge

**Given** the last inspection noted issues (DWV, Varroa high, etc.)
**When** I view the hive list
**Then** that hive shows an orange "Issues noted" badge

**Technical Notes:**
- Status derived from last inspection data
- Age calculated from queen_introduced_at
- Box visualization: simple stacked rectangles (CSS)
- API: `GET /api/sites/{id}/hives`

---

### Story 5.3: Quick-Entry Inspection Form

As a **beekeeper**,
I want to record inspections quickly in the field,
So that I can document observations without taking off my gloves.

**Acceptance Criteria:**

**Given** I am on a hive detail page (mobile)
**When** I tap "New Inspection"
**Then** a swipe-based card flow begins with large 64px touch targets

**Given** I am on the Queen card
**When** I view it
**Then** I see three large toggles:
- Queen seen? (Yes/No)
- Eggs seen? (Yes/No)
- Queen cells? (Yes/No)
**And** I swipe right to proceed to next card

**Given** I am on the Brood card
**When** I view it
**Then** I see:
- Brood frames stepper (0-10, large +/- buttons)
- Pattern quality (Good/Spotty/Poor - large buttons)

**Given** I am on the Stores card
**When** I view it
**Then** I see:
- Honey level (Low/Medium/High - large segment)
- Pollen level (Low/Medium/High - large segment)

**Given** I am on the Issues card
**When** I view it
**Then** I see large checkboxes for common issues:
- DWV (Deformed Wing Virus)
- Chalkbrood
- Wax moth
- Robbing
- Other (opens text input)

**Given** I am on the Notes card
**When** I view it
**Then** I see a large text area
**And** a prominent "🎤 SPEAK" button for voice input
**And** a smaller "Keyboard" button

**Given** I complete all cards
**When** I reach the Review card
**Then** I see a summary of all entered data
**And** a large "SAVE" button (64px, full width, bottom-anchored)

**Technical Notes:**
- Inspection saved to: `inspections` table
- Swipe navigation: touch gesture library or manual
- All inputs sized for glove use (64px min height)
- Can exit mid-flow (draft auto-saved locally)
- API: `POST /api/hives/{id}/inspections`

---

### Story 5.4: Inspection History View

As a **beekeeper**,
I want to review past inspections,
So that I can track hive progress and spot trends.

**Acceptance Criteria:**

**Given** I am on a hive detail page
**When** I view the Inspection History section
**Then** I see a chronological list of inspections (newest first)
**And** each entry shows:
- Date: "Jan 22, 2026"
- Key findings: "Queen ✓, 6 brood frames, stores medium"
- Any issues flagged

**Given** I click on an inspection entry
**When** the detail view opens
**Then** I see all recorded data from that inspection
**And** any attached photos
**And** option to edit (within 24 hours) or delete

**Given** I want to compare inspections
**When** I select two inspections
**Then** I see a side-by-side comparison:
- Changes highlighted (↑ brood frames: 4 → 6)
- Time between inspections
- Weather on each date (if available)

**Given** I'm on desktop
**When** I view inspection history
**Then** I see a table view with sortable columns
**And** export option (CSV)

**Technical Notes:**
- Table: `inspections` (id, tenant_id, hive_id, inspected_at, queen_seen, eggs_seen, queen_cells, brood_frames, brood_pattern, honey_level, pollen_level, temperament, varroa_level, issues, actions, notes, created_at)
- Edit window: 24 hours (configurable)
- Comparison: client-side diff calculation

---

### Story 5.5: Frame-Level Data Tracking

As a **beekeeper**,
I want to record frame counts per box,
So that I can track detailed hive development.

**Acceptance Criteria:**

**Given** I am recording an inspection
**When** I reach the Frames section (optional advanced card)
**Then** I see a per-box breakdown:
- For each box (Brood 1, Brood 2, Super 1, etc.)
- Total frames in box
- Drawn comb count
- Brood frames count
- Honey frames count
- Pollen frames count

**Given** I enter frame data for a box
**When** I enter "8 drawn, 6 brood, 2 honey, 1 pollen"
**Then** "Empty/foundation" is auto-calculated (10 - 8 = 2)
**And** validation warns if brood + honey > drawn (impossible)

**Given** frame tracking is complex
**When** the user is in "Simple mode"
**Then** only the basic brood/stores cards are shown
**And** frame-level tracking is hidden behind "Advanced" toggle

**Given** I view a hive's frame history
**When** I check past inspections
**Then** I can see frame-by-frame progression over time

**Technical Notes:**
- Table: `inspection_frames` (id, inspection_id, box_position, box_type, total_frames, drawn_frames, brood_frames, honey_frames, pollen_frames)
- Box position: 1 = bottom, increasing upward
- Default mode hides frame tracking for simplicity
- Advanced users enable in Settings

---

### Story 5.6: Frame Development Graphs

As a **beekeeper**,
I want to visualize frame data over the season,
So that I can see hive development patterns.

**Acceptance Criteria:**

**Given** I am on a hive detail page with frame history
**When** I view the Frame Development chart
**Then** I see a stacked area chart showing:
- X-axis: Time (inspection dates)
- Y-axis: Frame count
- Layers: Brood (brown), Honey (gold), Pollen (orange)

**Given** I hover over a point on the chart
**When** the tooltip appears
**Then** I see: "Jun 15: 6 brood, 4 honey, 2 pollen frames"

**Given** I select "Year over Year" view
**When** the chart renders
**Then** I see this year vs last year comparison
**And** key metrics: "Peak brood: 8 vs 6 (+33%)"

**Given** insufficient frame data (<3 inspections with frame data)
**When** I view the chart
**Then** I see "Record more inspections to see frame trends"
**And** a preview of what the chart will look like

**Technical Notes:**
- Uses @ant-design/charts Area (stacked)
- Brood color: #8B4513 (saddle brown)
- Honey color: #f7a42d (sea buckthorn)
- Pollen color: #FFA500 (orange)
- API: `GET /api/hives/{id}/frame-history`

---

## Epic 6: Treatments, Feedings & Harvests

Users can log varroa treatments (with mite counts), feedings (with concentration), harvests (with frame details), and equipment (installed/removed dates). Custom labels system for personalized categories. Treatment calendar with reminders.

### Story 6.1: Treatment Log

As a **beekeeper**,
I want to log varroa treatments with details,
So that I can track treatment history and efficacy.

**Acceptance Criteria:**

**Given** I am on a hive detail page
**When** I click "Log Treatment"
**Then** a form appears with fields:
- Date (default: today)
- Hive(s) - multi-select to apply to multiple hives
- Treatment type (dropdown: Oxalic acid, Formic acid, Apiguard, Apivar, MAQS, Api-Bioxal, Custom...)
- Method (Vaporization, Dribble, Strips, Spray, Other)
- Dose/Amount (text)
- Mite count before (optional number)
- Mite count after (optional number, enabled after treatment ends)
- Weather conditions (optional)
- Notes

**Given** I submit a treatment log
**When** it saves
**Then** the treatment appears in the hive's treatment history
**And** if multiple hives selected, a record is created for each
**And** the next recommended treatment date is calculated

**Given** I view a hive's treatment history
**When** the list loads
**Then** I see all treatments sorted by date (newest first)
**And** each entry shows: date, type, method, mite counts
**And** efficacy indicator if before/after counts exist (e.g., "87% reduction")

**Given** I need to log a follow-up count
**When** I click "Add follow-up" on an existing treatment
**Then** I can add the "mite count after" value
**And** efficacy is calculated automatically

**Technical Notes:**
- Table: `treatments` (id, tenant_id, hive_id, treated_at, treatment_type, method, dose, mite_count_before, mite_count_after, weather, notes, created_at)
- Built-in types are static; custom types via labels system
- Efficacy = ((before - after) / before) × 100

---

### Story 6.2: Feeding Log

As a **beekeeper**,
I want to log when I feed my hives,
So that I can track feeding history and consumption.

**Acceptance Criteria:**

**Given** I am on a hive detail page
**When** I click "Log Feeding"
**Then** a form appears with fields:
- Date (default: today)
- Hive(s) - multi-select
- Feed type (Sugar syrup, Fondant, Pollen patty, Pollen substitute, Honey, Custom...)
- Amount (number + unit: kg or liters)
- Concentration (for syrup: 1:1, 2:1, custom ratio)
- Notes

**Given** I log a syrup feeding
**When** I select "Sugar syrup"
**Then** the concentration field appears
**And** I can select 1:1 (stimulative) or 2:1 (winter prep) or enter custom

**Given** I view feeding history
**When** the list loads
**Then** I see all feedings with date, type, amount
**And** totals per season: "Total fed this season: 12kg syrup, 2kg fondant"

**Given** I want to see feeding vs weight correlation
**When** I view the hive's charts (if scale data available)
**Then** feeding events are marked on the weight chart

**Technical Notes:**
- Table: `feedings` (id, tenant_id, hive_id, fed_at, feed_type, amount, unit, concentration, notes, created_at)
- Concentration stored as string (e.g., "1:1", "2:1")
- Season totals calculated via SQL aggregation

---

### Story 6.3: Harvest Tracking

As a **beekeeper**,
I want to record my honey harvests,
So that I can track yields per hive and season.

**Acceptance Criteria:**

**Given** I want to log a harvest
**When** I click "Log Harvest" from hive or site page
**Then** a form appears with fields:
- Date
- Hive(s) - multi-select
- Frames harvested (number)
- Total amount (kg)
- Quality notes (color, taste, floral source)
- Photos (optional)

**Given** I log a harvest from multiple hives
**When** I enter 20kg total from 3 hives
**Then** I can either:
- Split evenly (6.67kg each)
- Enter per-hive amounts manually

**Given** I view harvest history
**When** the list loads
**Then** I see all harvests with date, amount, hives
**And** season totals: "2026 season: 45kg from 3 hives"
**And** per-hive breakdown: "Hive 1: 18kg, Hive 2: 15kg, Hive 3: 12kg"

**Given** I want to see harvest analytics
**When** I view the Harvest dashboard
**Then** I see:
- Yield per hive comparison bar chart
- Year-over-year comparison
- Best performing hive highlighted

**Given** this is my first harvest
**When** I save it
**Then** a celebration modal appears: "🎉 First harvest!"
**And** prompts to add a photo for the memory

**Technical Notes:**
- Table: `harvests` (id, tenant_id, site_id, harvested_at, total_kg, notes, created_at)
- Table: `harvest_hives` (id, harvest_id, hive_id, frames, amount_kg)
- Photos stored via existing photo attachment system
- First harvest detection: check if any previous harvests exist

---

### Story 6.4: Equipment Log

As a **beekeeper**,
I want to track equipment I add or remove from hives,
So that I know what's installed on each hive.

**Acceptance Criteria:**

**Given** I am on a hive detail page
**When** I click "Log Equipment"
**Then** a form appears with:
- Equipment type (Entrance reducer, Mouse guard, Queen excluder, Robbing screen, Feeder, Custom...)
- Action (Installed / Removed)
- Date
- Notes

**Given** I log equipment installation
**When** I save
**Then** the equipment appears in the hive's "Currently Installed" list

**Given** I remove equipment
**When** I log removal
**Then** it moves from "Currently Installed" to "Equipment History"
**And** shows duration: "Mouse guard: Nov 1 - Mar 15 (135 days)"

**Given** I view a hive's equipment status
**When** the page loads
**Then** I see two sections:
- Currently Installed (with remove buttons)
- Equipment History (with dates and durations)

**Given** I install seasonal equipment (e.g., mouse guard)
**When** the next season approaches
**Then** I can see equipment recommendations based on last year

**Technical Notes:**
- Table: `equipment_logs` (id, tenant_id, hive_id, equipment_type, action, logged_at, notes, created_at)
- Currently installed: most recent 'installed' without matching 'removed'
- Duration calculated from install to remove dates

---

### Story 6.5: Custom Labels System

As a **beekeeper**,
I want to create my own categories for feeds, treatments, and equipment,
So that I can track items specific to my beekeeping practice.

**Acceptance Criteria:**

**Given** I am in Settings → Custom Labels
**When** I view the page
**Then** I see categories: Feed Types, Treatment Types, Equipment Types, Issue Types
**And** each category shows built-in items (non-deletable) and custom items

**Given** I want to add a custom feed type
**When** I click "Add" in Feed Types
**Then** I enter a name (e.g., "Honey-B-Healthy syrup")
**And** it appears in all feed type dropdowns going forward

**Given** I want to edit a custom label
**When** I click Edit
**Then** I can rename it
**And** all historical records using that label are updated

**Given** I want to delete a custom label
**When** I click Delete
**Then** I see a warning if it's used in any records
**And** I can choose to: delete anyway (records keep old text) or cancel

**Given** I'm logging a treatment
**When** I view the treatment type dropdown
**Then** I see built-in types first, then my custom types below a divider

**Technical Notes:**
- Table: `custom_labels` (id, tenant_id, category, name, created_at, deleted_at)
- Categories: 'feed', 'treatment', 'equipment', 'issue'
- Built-in types are hardcoded in frontend, not in this table
- Soft delete to preserve historical references

---

### Story 6.6: Treatment Calendar & Reminders

As a **beekeeper**,
I want to see upcoming treatment schedules,
So that I don't miss important varroa treatments.

**Acceptance Criteria:**

**Given** I am on the Calendar page
**When** I view the treatment calendar
**Then** I see a monthly calendar view with:
- Past treatments shown as completed (checkmark)
- Upcoming due treatments highlighted
- Recommended treatment windows based on treatment intervals

**Given** a treatment is due soon
**When** I view the calendar
**Then** I see: "⏰ Hive 2: Oxalic acid due in 3 days"
**And** "Last treatment: 87 days ago"
**And** action buttons: "Mark Done", "Snooze 7 days", "Skip"

**Given** I click "Mark Done"
**When** the modal opens
**Then** I'm taken to the treatment log form
**And** the hive and treatment type are pre-filled

**Given** I enable notifications in settings
**When** a treatment is due within 7 days
**Then** I receive a push notification (if PWA installed)
**Or** email notification (if email enabled)

**Given** I want to set a custom reminder
**When** I create a treatment record
**Then** I can set "Remind me in X days for follow-up"
**And** that reminder appears on the calendar

**Technical Notes:**
- Treatment intervals: Oxalic (90 days), Formic (varies), etc. - configurable
- Reminders stored in: `reminders` table (id, tenant_id, hive_id, type, due_at, completed_at)
- Push notifications via Web Push API
- Email via SendGrid or similar (optional integration)

---

## Epic 7: Mobile PWA & Field Mode

Users can use the app on mobile with gloves (64px tap targets, swipe navigation), work offline with automatic sync (IndexedDB + Service Worker), use voice input (browser SpeechRecognition or server Whisper), and scan QR codes for instant hive navigation.

### Story 7.1: Service Worker & App Shell Caching

As a **beekeeper**,
I want the app to load even without internet,
So that I can use it in the field where signal is poor.

**Acceptance Criteria:**

**Given** I have visited the app before
**When** I open it without internet connection
**Then** the app shell loads from cache
**And** I see the navigation and UI layout
**And** a banner indicates "Offline mode"

**Given** I install the PWA
**When** I add it to my home screen
**Then** it appears as a standalone app
**And** opens in full-screen mode (no browser chrome)
**And** displays the APIS icon and splash screen

**Given** the app is online
**When** a new version is deployed
**Then** the service worker detects the update
**And** shows a "New version available" notification
**And** user can click to refresh and get updates

**Given** critical resources fail to cache
**When** the service worker registers
**Then** errors are logged
**And** the app falls back to online-only mode gracefully

**Technical Notes:**
- Service Worker using Workbox
- Precache: HTML, CSS, JS bundles, fonts, icons
- Runtime cache: API responses (stale-while-revalidate for read, network-first for write)
- manifest.json with app name, icons, theme color (#f7a42d)

---

### Story 7.2: IndexedDB Offline Storage

As a **beekeeper**,
I want my data stored locally,
So that I can view hives and past inspections without internet.

**Acceptance Criteria:**

**Given** I am online and viewing data
**When** the API returns results
**Then** the data is cached in IndexedDB
**And** available for offline viewing

**Given** I have previously synced data
**When** I go offline and view my hives
**Then** I see all cached hive data
**And** past inspections are available
**And** a "Last synced: 2 hours ago" indicator shows

**Given** I am offline
**When** I try to view data I haven't synced
**Then** I see "This data isn't available offline"
**And** a prompt to sync when back online

**Given** local storage is getting full
**When** the cache exceeds 50MB
**Then** oldest data is pruned automatically
**And** recent and frequently accessed data is preserved

**Technical Notes:**
- Dexie.js as IndexedDB wrapper
- Tables: sites, hives, inspections, detections (mirrors server schema)
- Each record has `synced_at` timestamp
- Sync priority: recent data > old data

---

### Story 7.3: Offline Inspection Creation

As a **beekeeper**,
I want to record inspections while offline,
So that I can work at my apiary without needing signal.

**Acceptance Criteria:**

**Given** I am offline
**When** I create a new inspection
**Then** it saves to IndexedDB with status "pending_sync"
**And** I see confirmation: "Saved locally - will sync when online"
**And** the inspection appears in the hive's history

**Given** I have offline inspections
**When** I view the sync status
**Then** I see: "⚡ Offline — 3 inspections pending"
**And** a list of pending items

**Given** I edit an offline inspection
**When** I make changes before it syncs
**Then** the local version is updated
**And** still marked for sync

**Given** I create multiple inspections offline
**When** I view them
**Then** they have temporary local IDs
**And** are clearly marked as "not yet synced"

**Technical Notes:**
- Local ID format: `local_${uuid}`
- Pending records in Dexie: `pending_sync` flag
- Queue table: `sync_queue` (id, table, action, payload, created_at)
- Photo attachments stored as blobs locally

---

### Story 7.4: Automatic Background Sync

As a **beekeeper**,
I want my offline changes to sync automatically,
So that I don't have to remember to sync manually.

**Acceptance Criteria:**

**Given** I have pending offline changes
**When** the device regains internet connection
**Then** sync begins automatically in the background
**And** "Syncing..." indicator appears

**Given** sync is in progress
**When** each record syncs successfully
**Then** the pending count decreases
**And** local records are updated with server IDs
**And** "pending_sync" flag is cleared

**Given** all records sync successfully
**When** sync completes
**Then** I see "✓ Synced" notification (auto-dismisses after 3s)
**And** all data now has server IDs

**Given** a sync fails (conflict, server error)
**When** the error occurs
**Then** that specific record is flagged as "sync_error"
**And** other records continue syncing
**And** I see "1 item failed to sync - tap to resolve"

**Given** there's a sync conflict (server has newer data)
**When** conflict is detected
**Then** I'm prompted to choose: "Keep mine", "Keep server", or "View diff"
**And** resolution is applied

**Technical Notes:**
- Background Sync API where supported
- Fallback: sync on app focus / page visibility change
- Retry with exponential backoff: 1s, 2s, 4s, 8s, max 60s
- Conflict detection via `updated_at` timestamps

---

### Story 7.5: Voice Input for Notes

As a **beekeeper**,
I want to dictate notes instead of typing,
So that I can record observations without removing my gloves.

**Acceptance Criteria:**

**Given** I am on the Notes field (inspection or any text input)
**When** I tap the "🎤 SPEAK" button
**Then** the microphone activates
**And** I see a visual indicator that it's listening
**And** I speak my notes

**Given** I am speaking
**When** I pause or tap "Done"
**Then** my speech is transcribed to text
**And** appears in the notes field
**And** I can edit the text if needed

**Given** browser SpeechRecognition is available
**When** I use voice input
**Then** it uses the native browser API (zero latency, requires online)

**Given** I want higher accuracy transcription
**When** I select "Server Whisper" in settings
**Then** audio is sent to the APIS server
**And** Whisper model transcribes it
**And** text is returned (higher accuracy, slight delay)

**Given** I am offline and native speech unavailable
**When** I tap voice button
**Then** I see "Voice input requires internet or Whisper model"
**And** keyboard input is offered as fallback

**Technical Notes:**
- Primary: Web Speech API (SpeechRecognition)
- Fallback: Server-side Whisper endpoint `POST /api/transcribe`
- Audio format: WebM/Opus for compression
- Max recording: 60 seconds
- Settings store preferred transcription method

---

### Story 7.6: QR Code Hive Navigation

As a **beekeeper**,
I want to scan a QR code on a hive to jump directly to it,
So that I can quickly access the right hive in a large apiary.

**Acceptance Criteria:**

**Given** I am in the app
**When** I tap the "Scan QR" button (in header or hive list)
**Then** the camera viewfinder opens
**And** I see "Point at hive QR code"

**Given** I point at a valid APIS QR code
**When** the code is recognized
**Then** I'm immediately navigated to that hive's detail page
**And** the camera closes

**Given** I scan an invalid or unknown QR code
**When** the scan completes
**Then** I see "Not recognized as an APIS hive code"
**And** option to "Try again" or "Cancel"

**Given** I want to generate QR codes
**When** I go to a hive's settings
**Then** I can click "Generate QR Code"
**And** see a printable QR code with hive name below
**And** option to print or save as image

**Given** I print QR codes
**When** I view the print preview
**Then** it shows multiple QR codes per page (4-up or 8-up)
**And** each has the hive name in human-readable text

**Technical Notes:**
- QR content: `apis://hive/{site_id}/{hive_id}`
- Scanner: html5-qrcode library or similar
- QR generation: qrcode.js library
- Print layout: CSS @media print
- Camera permission requested on first use

---

## Epic 8: BeeBrain AI Insights

Users receive contextual AI analysis per section (dashboard, hive detail, financial, maintenance) with timestamp and refresh button. Proactive insights surface automatically with dismiss/snooze/learn-more options. MVP uses rule engine; Phase 2 adds mini ML model.

### Story 8.1: BeeBrain Rule Engine (MVP)

As a **system**,
I want a rule-based analysis engine,
So that BeeBrain can generate insights without ML models.

**Acceptance Criteria:**

**Given** the BeeBrain engine runs
**When** it analyzes hive data
**Then** it applies predefined rules to detect patterns:
- Queen aging: queen_age > 2 years + productivity_drop > 20%
- Treatment due: days_since_treatment > 90
- Inspection overdue: days_since_inspection > 14
- Hornet correlation: high_detections + temperature_range(18-22)
- Weight anomaly: sudden_change > 2kg/day

**Given** a rule matches
**When** the analysis completes
**Then** it generates an insight with:
- Severity (info, warning, action-needed)
- Message (human-readable, beekeeper-friendly)
- Suggested action
- Data points that triggered the rule

**Given** no rules match for a hive
**When** analysis runs
**Then** it returns "All looks good with [Hive Name]"

**Given** I want to add new rules
**When** I modify the rule configuration
**Then** rules are defined in a JSON/YAML config file
**And** new rules take effect on next analysis run

**Technical Notes:**
- Rules defined in: `internal/beebrain/rules.yaml`
- Rule format: condition (SQL-like), message template, severity
- Analysis runs: on-demand via API, or scheduled (hourly background job)
- Insights stored in: `insights` table (id, tenant_id, hive_id, rule_id, severity, message, data, created_at, dismissed_at)

---

### Story 8.2: Dashboard BeeBrain Card

As a **beekeeper**,
I want to see BeeBrain's daily summary on the dashboard,
So that I know if anything needs my attention today.

**Acceptance Criteria:**

**Given** I am on the Dashboard
**When** I view the BeeBrain card
**Then** I see:
- "🧠 BeeBrain Analysis"
- "Last updated: 2 hours ago [↻ Refresh]"
- Summary text of current status

**Given** everything is healthy
**When** BeeBrain has no warnings
**Then** I see: "All quiet at [Site Name]. Your 3 hives are doing well. No actions needed."

**Given** there are concerns
**When** BeeBrain has warnings
**Then** I see prioritized list:
- "⚠️ Hive 2: Varroa treatment due (92 days since last)"
- "ℹ️ Hive 3: Consider inspection (16 days)"
**And** each item links to the relevant hive/action

**Given** I click Refresh
**When** the analysis runs
**Then** I see a loading spinner
**And** the card updates with fresh analysis
**And** timestamp updates to "Just now"

**Given** analysis takes too long (>10s)
**When** the timeout is reached
**Then** I see "Analysis is taking longer than expected. Check back soon."

**Technical Notes:**
- API: `GET /api/beebrain/dashboard?site_id=xxx`
- Cached analysis with 1-hour TTL
- Refresh triggers new analysis (debounced)
- Card uses Ant Design Card with custom BeeBrain styling

---

### Story 8.3: Hive Detail BeeBrain Analysis

As a **beekeeper**,
I want BeeBrain analysis specific to each hive,
So that I get tailored recommendations for that hive.

**Acceptance Criteria:**

**Given** I am on a hive detail page
**When** I view the BeeBrain section
**Then** I see analysis specific to that hive:
- Current health assessment
- Recommendations based on history
- Comparisons to other hives or past seasons

**Given** the hive has a pattern detected
**When** BeeBrain shows the insight
**Then** I see specific data: "Queen is entering her 3rd year and productivity dropped 23% vs last season. Consider requeening in spring."

**Given** I want more detail
**When** I click "Tell me more"
**Then** I see expanded explanation:
- What data triggered this insight
- Why this matters
- Suggested next steps with links to relevant actions

**Given** the insight is wrong or not applicable
**When** I click "Dismiss"
**Then** the insight is hidden for this hive
**And** doesn't appear again for 30 days (or until conditions change significantly)

**Technical Notes:**
- API: `GET /api/beebrain/hive/{id}`
- Hive-specific rules + general rules applied
- Dismissals stored in insights table with dismissed_at
- "Tell me more" data stored in insight.data JSON

---

### Story 8.4: Proactive Insight Notifications

As a **beekeeper**,
I want important insights to appear proactively,
So that I don't miss critical information.

**Acceptance Criteria:**

**Given** BeeBrain detects an action-needed insight
**When** I next open the app
**Then** a notification card appears prominently:
- Insight message
- Buttons: [Dismiss] [Snooze] [Take Action]

**Given** I click "Snooze"
**When** the snooze is applied
**Then** I can choose: 1 day, 7 days, 30 days
**And** the insight won't appear again until snooze expires

**Given** I click "Take Action"
**When** the click is processed
**Then** I'm navigated to the relevant page/form
**And** context is pre-filled where possible

**Given** I click "Dismiss"
**When** the dismissal is processed
**Then** the insight is hidden permanently for current conditions
**And** won't reappear unless data changes significantly

**Given** multiple insights are pending
**When** I view notifications
**Then** they're prioritized by severity (action-needed > warning > info)
**And** only the top 3 most important show initially

**Technical Notes:**
- Notification component: persistent banner or toast
- Priority queue in frontend state
- API: `POST /api/beebrain/insights/{id}/dismiss`
- API: `POST /api/beebrain/insights/{id}/snooze?days=7`
- Snooze stored: snoozed_until timestamp

---

### Story 8.5: Maintenance Priority View

As a **beekeeper**,
I want to see all hives that need attention ranked by priority,
So that I can plan my apiary work efficiently.

**Acceptance Criteria:**

**Given** I navigate to the Maintenance page
**When** it loads
**Then** I see a list of all hives with pending actions
**And** sorted by priority (most urgent first)

**Given** a hive needs attention
**When** I view its entry
**Then** I see:
- Hive name and location
- Priority indicator (🔴 Urgent, 🟡 Soon, 🟢 Optional)
- Summary: "Treatment due, 92 days since last"
- Quick action buttons

**Given** no hives need attention
**When** I view the page
**Then** I see: "All caught up! No maintenance needed." with a green checkmark

**Given** I complete an action
**When** I return to the maintenance list
**Then** the completed item is removed or moved to "Recently completed"

**Given** I want to batch actions
**When** I select multiple hives
**Then** I can apply the same action (e.g., "Log treatment for selected")

**Technical Notes:**
- API: `GET /api/beebrain/maintenance?site_id=xxx`
- Returns aggregated insights grouped by hive
- Priority score calculated from severity + age of insight
- Quick actions: direct links to treatment/inspection/feeding forms

---

## Epic 9: Data Export & Emotional Moments

Users can export hive data with configurable field selection in Quick Summary, Detailed Markdown, or Full JSON formats. Celebrates first harvest with special screen. Provides post-mortem wizard for hive losses. Generates shareable season recap summaries.

### Story 9.1: Configurable Data Export

As a **beekeeper**,
I want to export my hive data in various formats,
So that I can share on forums, paste into AI assistants, or backup my records.

**Acceptance Criteria:**

**Given** I am on the Export page (or hive settings)
**When** I start an export
**Then** I see configuration options:
- Select hive(s): dropdown or "All hives"
- What to include (checkboxes grouped by category):
  - BASICS: Hive name, Queen age, Boxes, Current weight
  - DETAILS: Full inspection log, Hornet data, Weight history
  - ANALYSIS: BeeBrain insights, Health summary, Season comparison
  - FINANCIAL: Costs, Harvest revenue, ROI per hive

**Given** I select fields and click Preview
**When** the preview loads
**Then** I see a text preview of the export
**And** can copy to clipboard or adjust selections

**Given** I select "Quick Summary" format
**When** the export generates
**Then** I get a short text suitable for forum posts:
```
Hive 3 — Quick Summary
• Queen: 2 years old (local breeder)
• Setup: 2 brood boxes + 2 honey supers
• Weight: 28.1 kg
```

**Given** I select "Detailed Markdown" format
**When** the export generates
**Then** I get markdown with full context suitable for AI:
```markdown
## Hive 3 Details
- Queen age: 2 years
- Season 2026: 18kg harvested, 87 hornets deterred
- Recent inspections: [structured data]
```

**Given** I select "Full JSON" format
**When** the export generates
**Then** I get complete JSON structure with all selected data

**Given** I click "Copy to Clipboard"
**When** the copy succeeds
**Then** I see "Copied!" confirmation
**And** data is on my clipboard

**Technical Notes:**
- API: `POST /api/export` with field selection payload
- Returns generated text in requested format
- Export presets: save frequently used configurations
- Rate limit exports to prevent abuse

---

### Story 9.2: First Harvest Celebration

As a **beekeeper**,
I want my first harvest to feel special,
So that the app acknowledges this meaningful milestone.

**Acceptance Criteria:**

**Given** I log a harvest
**When** it's the first harvest ever recorded in my account
**Then** a celebration modal appears:
- 🎉 "Congratulations on your first harvest!"
- Animation (confetti or bee animation)
- Harvest details displayed prominently
- "Add a photo to remember this moment" prompt

**Given** I add a photo
**When** I attach it
**Then** it's marked as a "milestone photo"
**And** appears in a special "Milestones" gallery

**Given** I dismiss the celebration
**When** I click "Thanks!" or outside the modal
**Then** the modal closes
**And** won't appear again (one-time event)

**Given** it's the first harvest for a specific hive (not account)
**When** I log that harvest
**Then** a smaller celebration shows: "First harvest from Hive 3! 🐝"

**Technical Notes:**
- First harvest detection: check harvest count == 0 before insert
- Milestone flags stored in user preferences
- Animation: Lottie or CSS keyframes
- Photo tagged with `milestone: 'first_harvest'`

---

### Story 9.3: Hive Loss Post-Mortem

As a **beekeeper**,
I want guidance when I lose a hive,
So that I can document what happened and learn for next time.

**Acceptance Criteria:**

**Given** I need to record a hive loss
**When** I click "Mark as Lost" on a hive
**Then** a post-mortem wizard begins with empathetic tone:
- "We're sorry about your loss. Recording what happened can help in the future."

**Given** I am in the wizard
**When** I progress through steps
**Then** I'm asked:
1. When was the loss discovered? (date)
2. What do you think happened? (dropdown: Starvation, Varroa, Queen failure, Pesticide exposure, Unknown, Other)
3. What did you observe? (symptoms checklist + notes)
4. Could anything have been done differently? (optional reflection)
5. Do you want to keep this hive's data for reference? (archive vs delete)

**Given** I complete the wizard
**When** I submit
**Then** the hive is marked as "Lost" with date
**And** a post-mortem record is created
**And** data is preserved (archived) by default
**And** I see: "Your records have been saved. This experience will help you care for future hives."

**Given** I view archived hives
**When** I filter for "Lost hives"
**Then** I see all lost hives with their post-mortem summaries
**And** can compare patterns across losses

**Technical Notes:**
- Hive status: 'active', 'lost', 'archived'
- Table: `hive_losses` (id, hive_id, discovered_at, cause, symptoms, notes, reflection, created_at)
- Archived hives hidden from main views but accessible via filter
- BeeBrain can analyze loss patterns across user's history

---

### Story 9.4: Season Recap Summary

As a **beekeeper**,
I want a summary of my beekeeping season,
So that I can reflect on the year and share with others.

**Acceptance Criteria:**

**Given** the season is ending (November for Northern Hemisphere)
**When** I navigate to "Season Recap" or receive a prompt
**Then** I see a generated summary card:
- Season dates (Aug 1 - Oct 31, 2026)
- Total harvest: 45 kg across 3 hives
- Hornets deterred: 127
- Inspections completed: 24
- Key milestones achieved

**Given** the recap is generated
**When** I view it
**Then** I see per-hive breakdown:
- Hive 1: 18kg, healthy, 0 issues
- Hive 2: 15kg, treated for varroa
- Hive 3: 12kg, new queen installed

**Given** I want to share my recap
**When** I click "Share"
**Then** I can:
- Copy as text for social media
- Download as image (shareable card design)
- Export as PDF with charts

**Given** I view past seasons
**When** I select a previous year
**Then** I see that year's recap
**And** can compare year-over-year

**Technical Notes:**
- Season detection: August 1 - October 31 (configurable per hemisphere)
- Recap generated on-demand, cached
- Share image: server-side rendering or canvas-based
- API: `GET /api/recap?season=2026`

---

### Story 9.5: Overwintering Success Report

As a **beekeeper**,
I want to document which hives survived winter,
So that I can track survival rates and understand what works.

**Acceptance Criteria:**

**Given** spring arrives (March for Northern Hemisphere)
**When** I open the app
**Then** I'm prompted: "Time for spring inspection! Did all your hives survive winter?"

**Given** I enter overwintering results
**When** I mark each hive
**Then** I can select: "Survived ✓", "Lost ✗", "Weak (survived but struggling)"

**Given** I complete the survey
**When** I submit
**Then** I see a winter report:
- Survival rate: "2 of 3 hives survived (67%)"
- Lost hive causes (if post-mortem completed)
- Comparison to previous winters

**Given** a hive survived
**When** I mark it
**Then** I can add notes about condition:
- Colony strength (Weak/Medium/Strong)
- Stores remaining
- First inspection findings

**Given** all hives survived
**When** I view the report
**Then** I see a celebration: "100% survival! Great winter preparation! 🎉"

**Technical Notes:**
- Table: `overwintering_records` (id, tenant_id, hive_id, winter_season, survived, condition, notes, created_at)
- Winter season: year of start (e.g., "2025-2026" stored as "2025")
- Spring prompt: triggered by date + no overwintering record for current season
- Historical data enables survival rate trends

---

## Epic 10: Edge Detection Software

Complete detection software that captures video, runs motion detection pipeline, identifies hornets by size/hover behavior, records clips locally, and communicates with server (heartbeat, clip upload, status APIs). Runs on Pi 5 prototype with architecture documented for ESP32 port.

### Story 10.1: Camera Capture Module

As an **APIS unit**,
I want to capture video frames from the camera,
So that I can analyze them for hornet detection.

**Acceptance Criteria:**

**Given** the unit starts up
**When** the camera module initializes
**Then** it opens the camera device (USB webcam or Pi Camera)
**And** configures resolution to 640x480 (VGA)
**And** sets frame rate to 10 FPS minimum

**Given** the camera is initialized
**When** the capture loop runs
**Then** frames are captured at ≥5 FPS consistently
**And** each frame is timestamped
**And** frames are passed to the detection pipeline

**Given** the camera fails to initialize
**When** startup occurs
**Then** the error is logged with specific message
**And** LED indicates error state (red blink)
**And** retry attempts occur every 30 seconds

**Given** the camera disconnects mid-operation
**When** the capture fails
**Then** the system attempts reconnection
**And** logs the disconnection event
**And** alerts are queued for server notification

**Technical Notes:**
- Python: OpenCV `cv2.VideoCapture()`
- Resolution: 640x480 for balance of detail vs performance
- Frame buffer: 2-3 frames to prevent blocking
- Camera position: 1-1.5m from hive entrance (per FR6)

---

### Story 10.2: Motion Detection Pipeline

As an **APIS unit**,
I want to detect moving objects in the camera view,
So that I can identify potential hornets.

**Acceptance Criteria:**

**Given** frames are being captured
**When** the motion detection runs
**Then** it compares each frame to a background model
**And** identifies regions with significant change
**And** outputs a list of motion regions (bounding boxes)

**Given** a hornet flies through the frame
**When** motion is detected
**Then** a bounding box is drawn around the moving object
**And** the centroid (x, y) is calculated
**And** the pixel size (width × height) is measured

**Given** environmental motion (leaves, shadows)
**When** motion is detected
**Then** small/low-contrast changes are filtered out
**And** only significant motion triggers further analysis

**Given** the scene changes (lighting shift)
**When** background adaptation runs
**Then** the background model updates gradually
**And** false positives from lighting changes are minimized

**Technical Notes:**
- Algorithm: Background subtraction (MOG2 or similar)
- Minimum motion area: 100 pixels (tunable)
- Background learning rate: 0.001 (slow adaptation)
- Output: list of (x, y, w, h, area) per frame

---

### Story 10.3: Size Filtering & Hover Detection

As an **APIS unit**,
I want to identify hornets by size and hovering behavior,
So that I can distinguish them from bees and other insects.

**Acceptance Criteria:**

**Given** motion regions are detected
**When** size filtering runs
**Then** objects smaller than 18px (at VGA) are ignored
**And** objects matching hornet size (18-50px typical) are flagged
**And** very large objects (>100px, likely not insects) are ignored

**Given** a hornet-sized object is detected
**When** hover detection runs
**Then** the system tracks the object across frames
**And** if the object remains in a ~50px radius for >1 second
**Then** it's classified as "hovering" (high confidence hornet)

**Given** an object moves quickly through frame
**When** analysis runs
**Then** it's logged as "transient" (lower confidence)
**And** still triggers alert but not full laser activation

**Given** size calibration is needed
**When** setup mode is active
**Then** user can place a reference object
**And** system calculates pixels-per-cm for the current distance

**Technical Notes:**
- Hornet body: ~25-35mm, appears 18-50px at 1-1.5m distance
- Hover threshold: centroid movement <50px over 30 frames (1 sec at 30fps, or 6 frames at 5fps)
- Tracking: simple centroid tracking (no complex object tracking needed)
- Confidence levels: hovering=high, large_transient=medium, small_transient=low

---

### Story 10.4: Detection Event Logging

As an **APIS unit**,
I want to log all detection events locally,
So that data is preserved even without network connectivity.

**Acceptance Criteria:**

**Given** a hornet is detected
**When** the detection is confirmed
**Then** an event record is created with:
- Timestamp (ISO 8601)
- Confidence level
- Bounding box coordinates
- Size in pixels
- Hover duration (if applicable)
- Laser activated (yes/no)

**Given** events are logged
**When** I query the local database
**Then** events are stored in SQLite
**And** can be queried by date range
**And** include auto-incrementing IDs

**Given** storage is running low (<100MB free)
**When** new events are logged
**Then** oldest events (>30 days) are auto-pruned
**And** a warning is logged

**Given** the unit restarts
**When** it comes back online
**Then** all previous events are still accessible
**And** logging continues with new IDs

**Technical Notes:**
- SQLite database: `/data/apis/detections.db`
- Table: `events` (id, timestamp, confidence, x, y, w, h, hover_ms, laser_fired, clip_file, synced)
- `synced` flag: false until uploaded to server
- Pruning: cron job or on-startup cleanup

---

### Story 10.5: Clip Recording & Storage

As an **APIS unit**,
I want to record short video clips of detections,
So that beekeepers can review what was detected.

**Acceptance Criteria:**

**Given** a detection event occurs
**When** recording is triggered
**Then** a 5-second clip is saved (2s before, 3s after detection)
**And** the clip is encoded as H.264 MP4
**And** resolution matches camera (640x480)

**Given** a clip is recorded
**When** it's saved to storage
**Then** filename format is: `det_YYYYMMDD_HHMMSS.mp4`
**And** file size is typically 500KB-2MB
**And** clip is linked to the detection event record

**Given** multiple detections happen rapidly
**When** clips would overlap
**Then** they're merged into a single longer clip
**And** all detection events reference the same clip file

**Given** storage reaches threshold (1GB used)
**When** new clips are recorded
**Then** oldest clips are deleted (FIFO)
**And** detection records retain metadata but mark clip as "pruned"

**Technical Notes:**
- Rolling buffer: keep last 5 seconds in memory (circular buffer)
- Encoding: OpenCV VideoWriter with H.264 codec
- Storage path: `/data/apis/clips/`
- Max clips retained: ~50 (configurable via local spool limit)

---

### Story 10.6: HTTP Control API

As a **beekeeper** or **dashboard**,
I want HTTP endpoints to control and monitor the unit,
So that I can arm/disarm and check status remotely.

**Acceptance Criteria:**

**Given** the unit is running
**When** I call `GET /status`
**Then** I receive:
```json
{
  "armed": true,
  "detection_enabled": true,
  "uptime_seconds": 3600,
  "detections_today": 5,
  "storage_free_mb": 450,
  "firmware_version": "1.0.0"
}
```

**Given** I want to arm the unit
**When** I call `POST /arm`
**Then** the unit enters armed state
**And** detection and laser are enabled
**And** LED shows armed indicator (solid green)

**Given** I want to disarm the unit
**When** I call `POST /disarm`
**Then** the unit enters disarmed state
**And** detection continues but laser is disabled
**And** LED shows disarmed indicator (solid yellow)

**Given** I want to view live video
**When** I call `GET /stream`
**Then** I receive an MJPEG stream
**And** can view it in a browser or video player
**And** stream includes current detection overlays (optional)

**Given** an invalid request is made
**When** the endpoint is called
**Then** appropriate HTTP error codes are returned (400, 404, 500)

**Technical Notes:**
- Web framework: Flask (Python) or lightweight HTTP server
- MJPEG: multipart/x-mixed-replace stream
- Bind to: 0.0.0.0:8080 (configurable)
- No authentication for local network (security via network segmentation)

---

### Story 10.7: Server Communication (Heartbeat)

As an **APIS unit**,
I want to send heartbeats to the server,
So that the server knows I'm online and I can sync my clock.

**Acceptance Criteria:**

**Given** the unit has server configuration
**When** heartbeat interval elapses (60 seconds)
**Then** unit sends `POST /api/units/heartbeat` with:
- API key in header
- Current status in body (armed, uptime, storage, pending_clips)

**Given** the server responds successfully
**When** the response is received
**Then** unit extracts server time and adjusts local clock if >5s drift
**And** updates local config if server sends changes

**Given** the server is unreachable
**When** heartbeat fails
**Then** unit logs the failure
**And** continues operating offline
**And** retries on next interval

**Given** the server returns new configuration
**When** the heartbeat response includes config changes
**Then** unit updates local settings (e.g., armed state changed remotely)

**Technical Notes:**
- Heartbeat endpoint: configured in `/data/apis/config.json`
- Timeout: 10 seconds
- Retry: 3 attempts with 5s delay on initial boot
- Time sync: NTP-like drift correction from server response

---

### Story 10.8: Clip Upload with Retry

As an **APIS unit**,
I want to upload clips to the server reliably,
So that beekeepers can review detections even after network issues.

**Acceptance Criteria:**

**Given** a clip is recorded and network is available
**When** upload is triggered
**Then** unit sends `POST /api/units/clips` with multipart form data
**And** includes detection_id and metadata

**Given** upload succeeds
**When** server returns 201
**Then** local clip is marked as uploaded
**And** can be pruned according to retention policy

**Given** upload fails (network error, server error)
**When** the failure occurs
**Then** clip is queued for retry
**And** retry uses exponential backoff: 1min, 2min, 4min, 8min, max 1hr

**Given** multiple clips are queued
**When** network becomes available
**Then** clips upload in order (oldest first)
**And** upload rate is limited to prevent bandwidth saturation

**Given** the queue exceeds 50 clips
**When** new clips are recorded
**Then** oldest unuploaded clips are dropped
**And** dropped clips are logged locally

**Technical Notes:**
- Upload queue: SQLite table or file-based queue
- Max queue: 50 clips (~100MB worst case)
- Bandwidth limit: 1 upload at a time, 30s minimum between uploads
- Background thread for upload processing

---

### Story 10.9: LED Status Indicator

As a **beekeeper**,
I want visual feedback from the unit,
So that I can see its status without checking the app.

**Acceptance Criteria:**

**Given** the unit is armed and operating normally
**When** I look at the LED
**Then** it shows solid green

**Given** the unit is disarmed
**When** I look at the LED
**Then** it shows solid yellow/amber

**Given** the unit has an error (camera fail, storage full)
**When** I look at the LED
**Then** it shows blinking red (1Hz blink)

**Given** a detection is occurring
**When** the laser activates
**Then** LED briefly flashes white/blue to indicate activation

**Given** the unit is booting
**When** startup is in progress
**Then** LED shows slow pulse (breathing effect) in blue

**Given** the unit is offline (no server connection)
**When** I look at the LED
**Then** normal status shows but with occasional orange blink overlay

**Technical Notes:**
- LED: WS2812B RGB LED or simple GPIO LEDs (R/G/B)
- GPIO pins: defined in config, varies by hardware path
- Blink patterns: software PWM or timer-based
- Priority: error > detection > armed/disarmed > boot

---

### Story 10.10: Configuration & Persistence

As an **APIS unit**,
I want persistent configuration,
So that settings survive reboots and can be updated remotely.

**Acceptance Criteria:**

**Given** the unit boots
**When** configuration loads
**Then** it reads from `/data/apis/config.json`
**And** applies settings: server_url, api_key, armed_default, detection_params

**Given** no config file exists (first boot)
**When** the unit starts
**Then** default configuration is created
**And** unit enters "needs setup" mode
**And** LED indicates setup needed (blue pulse)

**Given** configuration is changed via API
**When** `POST /config` is called with new values
**Then** settings are validated
**And** saved to config file
**And** applied immediately (where possible)

**Given** the server sends config updates
**When** heartbeat response includes config
**Then** local config is updated
**And** changes persist across reboots

**Given** invalid configuration is provided
**When** validation fails
**Then** error is returned
**And** previous valid config is retained

**Technical Notes:**
- Config format: JSON
- Config path: `/data/apis/config.json`
- Default values: hardcoded fallbacks
- Validation: schema check before applying
- Sensitive data (API key): stored but not exposed via status endpoint

---

## Epic 11: Hardware Assembly Documentation

Complete step-by-step assembly manuals for all three hardware paths, written as detailed "cookbook" documentation that the user (limited electronics experience) and a smaller AI can execute later during physical assembly.

**Documentation Philosophy (per CLAUDE.md):** Teach concepts, explain WHY each connection is made, define terminology, include what-could-go-wrong sections, use analogies, never assume prior knowledge.

### Story 11.1: Hardware Overview & Concepts Guide

As a **beekeeper with no electronics experience**,
I want an educational introduction to hardware concepts,
So that I can understand what I'm building and why.

**Acceptance Criteria:**

**Given** I open the Hardware Guide
**When** I read the overview
**Then** I learn:
- What GPIO means (General Purpose Input/Output) and why it matters
- What PWM is (Pulse Width Modulation) and how it controls servos
- What voltage and current are (water pipe analogy)
- What a pull-up/pull-down resistor does
- Why we use 3.3V vs 5V and what happens if you get it wrong

**Given** I read about power
**When** the power section explains calculations
**Then** I see step-by-step math:
- "The servo draws 500mA, the laser 200mA, the microcontroller 300mA"
- "Total: 1000mA = 1A"
- "A 2A USB adapter provides enough headroom"

**Given** I read about safety
**When** laser safety is explained
**Then** I understand:
- What Class 3R means in plain language
- Why never point at eyes (permanent damage)
- Why never point upward (aircraft safety)
- How the software limits protect against accidents

**Given** I need to understand pin functions
**When** I read the GPIO section
**Then** I see a diagram showing:
- Which pins can do what (some are special purpose)
- Why GPIO 18 was chosen (supports PWM)
- What happens if you connect to the wrong pin

**Technical Notes:**
- Document location: `docs/hardware/01-concepts.md`
- Include diagrams (described for later generation or ASCII)
- Glossary at end with all technical terms
- Target reading level: intelligent non-technical adult

---

### Story 11.2: Pi 5 Assembly Manual

As a **beekeeper building a development unit**,
I want detailed Pi 5 assembly instructions,
So that I can build a working prototype for testing.

**Acceptance Criteria:**

**Given** I have the Pi 5 parts list
**When** I review it
**Then** I see:
- Exact part numbers with supplier links (Pimoroni, Adafruit, Amazon)
- Alternative parts if primary unavailable
- Total BOM cost (~€90)
- Tools required (screwdriver, wire strippers, soldering iron optional)

**Given** I follow the assembly steps
**When** I work through each step
**Then** each step includes:
- Step number and title
- What we're doing
- Why we're doing it
- How to do it (detailed sub-steps)
- Verification checkpoint ("LED should light up")
- What could go wrong and how to fix it

**Given** I wire the servo
**When** I follow the servo section
**Then** I see:
- Exact GPIO pin numbers with rationale
- Wire color guide (red=power, black=ground, yellow=signal)
- Diagram showing connection (ASCII or description)
- Test procedure to verify servo moves

**Given** I wire the laser
**When** I follow the laser section
**Then** I see safety warnings prominently
**And** clear instructions for the MOSFET driver circuit
**And** why we use a transistor (GPIO can't handle laser current)
**And** test procedure with safety precautions

**Given** I complete assembly
**When** I run the verification checklist
**Then** each component is tested individually
**And** the full system test confirms everything works together

**Technical Notes:**
- Document location: `docs/hardware/02-pi5-assembly.md`
- GPIO assignments: documented with rationale
- Pi 5 camera: use libcamera-based capture
- Include photos placeholders (described for later capture)

---

### Story 11.3: ESP32-CAM Assembly Manual

As a **beekeeper building the budget production unit**,
I want detailed ESP32-CAM assembly instructions,
So that I can build a low-cost unit for permanent deployment.

**Acceptance Criteria:**

**Given** I have the ESP32-CAM parts list
**When** I review it
**Then** I see:
- ESP32-CAM module (~€8)
- USB-to-Serial programmer (~€3)
- Servo (SG90 or MG90S, ~€3)
- Laser module (~€2)
- Power supply and misc (~€5)
- Total BOM: ~€15-20

**Given** I need to flash firmware
**When** I follow the flashing guide
**Then** I see:
- How to connect the programmer
- Which button to press during flash (GPIO0 to GND)
- Step-by-step PlatformIO instructions
- Verification that flash succeeded

**Given** I wire the components
**When** I follow each step
**Then** pin assignments are explained with constraints:
- "GPIO 12 is used because it's available after camera initialization"
- "GPIO 4 has the built-in LED, we'll use it for status"
- What pins to AVOID (camera uses these)

**Given** ESP32-CAM has limited GPIO
**When** the assembly addresses this
**Then** creative solutions are explained:
- Using the built-in LED for status
- Sharing pins where safe
- Alternative pin configurations if needed

**Given** I complete assembly
**When** I test the unit
**Then** I can access the web interface
**And** see the camera stream
**And** trigger servo movement
**And** verify laser activation (with safety)

**Technical Notes:**
- Document location: `docs/hardware/03-esp32cam-assembly.md`
- ESP32-CAM GPIO constraints documented
- Camera resolution: QVGA for processing headroom
- PlatformIO project structure referenced

---

### Story 11.4: XIAO ESP32S3 Assembly Manual

As a **beekeeper building the balanced production unit**,
I want detailed XIAO ESP32S3 assembly instructions,
So that I can build a unit with better camera quality.

**Acceptance Criteria:**

**Given** I have the XIAO ESP32S3 parts list
**When** I review it
**Then** I see:
- XIAO ESP32S3 Sense with camera (~€15)
- Or XIAO ESP32S3 + OV5640 module (~€18)
- Servo, laser, power (~€7)
- Total BOM: ~€22-25

**Given** I assemble the camera
**When** the instructions explain the connection
**Then** I understand:
- How the ribbon cable connects
- Which way is "up"
- What the lens focus adjustment does
- How to verify camera is recognized

**Given** the XIAO has more GPIO
**When** I wire components
**Then** I have flexibility:
- Dedicated PWM pin for servo
- Separate pin for LED status
- Optional button input for local arm/disarm

**Given** I flash firmware
**When** I follow the guide
**Then** XIAO's native USB is used (no external programmer)
**And** the process is simpler than ESP32-CAM

**Technical Notes:**
- Document location: `docs/hardware/04-xiao-assembly.md`
- XIAO Sense has built-in OV2640
- Alternative: XIAO + external OV5640 for higher resolution
- Native USB bootloader simplifies flashing

---

### Story 11.5: Enclosure & Mounting Guide

As a **beekeeper deploying the unit outdoors**,
I want weatherproofing and mounting guidance,
So that my unit survives outdoor conditions.

**Acceptance Criteria:**

**Given** I need to protect the electronics
**When** I read the enclosure guide
**Then** I learn:
- IP rating basics (what IPX4 means)
- Options: commercial enclosure, 3D printed, repurposed container
- Where to source weatherproof enclosures
- How to seal cable entry points

**Given** I need to mount the unit
**When** I read the mounting guide
**Then** I learn:
- Optimal distance from hive (1-1.5m)
- Angle considerations (slightly downward, not upward)
- Pole mount vs suspended mount options
- Sun/shade considerations for camera and electronics

**Given** I need to position the camera
**When** I follow the camera setup guide
**Then** I learn:
- Field of view requirements
- How to aim at the hive entrance approach path
- Focus adjustment procedure
- What a "good" camera view looks like

**Given** I need cable management
**When** I read the cabling section
**Then** I learn:
- Weather-resistant connectors
- Strain relief importance
- Cable routing best practices
- How to bring power outdoors safely

**Technical Notes:**
- Document location: `docs/hardware/05-enclosure-mounting.md`
- STL files for 3D printed parts (referenced, separate files)
- Commercial enclosure recommendations with links
- Illustrations of mounting positions

---

### Story 11.6: Troubleshooting & Safety Guide

As a **beekeeper who encounters problems**,
I want troubleshooting guidance,
So that I can diagnose and fix issues myself.

**Acceptance Criteria:**

**Given** my unit doesn't turn on
**When** I check the troubleshooting guide
**Then** I find:
- Symptom-based troubleshooting tree
- "Check power supply voltage with multimeter"
- "Verify USB cable is data-capable, not charge-only"
- Common causes with solutions

**Given** the camera doesn't work
**When** I check camera troubleshooting
**Then** I find:
- Ribbon cable connection verification
- Camera initialization errors and meanings
- Focus adjustment for blurry images
- Replacement procedures

**Given** the servo doesn't move
**When** I check servo troubleshooting
**Then** I find:
- Power supply insufficiency symptoms
- PWM signal verification
- Servo wiring check procedure
- When to replace the servo

**Given** I need laser safety information
**When** I read the safety section
**Then** I see prominent warnings:
- ⚠️ Never look directly into laser
- ⚠️ Never point at eyes (humans or animals)
- ⚠️ Never aim upward (aircraft safety violation)
- What to do if accidentally exposed
- How to safely test the laser

**Given** the unit behaves unexpectedly
**When** I check the "unexpected behavior" section
**Then** I find:
- How to read log files
- How to factory reset
- How to capture debug information
- How to report issues

**Technical Notes:**
- Document location: `docs/hardware/06-troubleshooting.md`
- Decision trees for common issues
- Safety warnings use consistent formatting (⚠️)
- Log file locations and interpretation guide

---

## Epic 12: Edge Laser Deterrent Software

Complete deterrent control software that aims servos at detected hornet positions, sweeps laser across target zone, respects safety limits (5mW, 10s max, downward only), and responds to physical arm/disarm button with LED feedback.

### Story 12.1: Servo Control Module

As an **APIS unit**,
I want to control pan/tilt servos,
So that I can aim the laser at detected targets.

**Acceptance Criteria:**

**Given** the unit starts up
**When** servo initialization runs
**Then** both pan and tilt servos are initialized
**And** moved to center/home position
**And** movement range is tested within safe limits

**Given** a target position is requested
**When** the servo command is sent
**Then** servos move smoothly to the target angle
**And** movement completes within ~45ms
**And** position is verified (no overshooting)

**Given** an angle outside safe range is requested
**When** the command is processed
**Then** the angle is clamped to safe limits
**And** a warning is logged
**And** servo moves to nearest safe position

**Given** a servo fails or disconnects
**When** the failure is detected
**Then** laser is immediately disabled
**And** error state is set
**And** LED indicates fault

**Technical Notes:**
- PWM control: 50Hz frequency, 1ms-2ms pulse width
- Pan range: -45° to +45° (adjustable per installation)
- Tilt range: 0° to -30° (never upward!)
- Libraries: RPi.GPIO (Pi) or ledc (ESP32)
- Smooth movement: interpolate between positions

---

### Story 12.2: Coordinate Mapping (Pixel to Servo)

As an **APIS unit**,
I want to convert camera coordinates to servo angles,
So that the laser points where the camera sees the hornet.

**Acceptance Criteria:**

**Given** a detection at pixel (x, y)
**When** coordinate mapping runs
**Then** the pixel position is converted to servo angles (pan, tilt)
**And** the conversion accounts for camera field of view
**And** the laser points at the same physical location the camera sees

**Given** the camera and laser have different positions
**When** calibration is performed
**Then** offset correction is applied
**And** parallax error is minimized for the typical target distance

**Given** I need to calibrate the system
**When** calibration mode is activated
**Then** I can:
- Point laser at a marker
- Click marker position in camera view
- System calculates offset
- Calibration is saved

**Given** calibration data exists
**When** the unit boots
**Then** calibration is loaded automatically
**And** applied to all coordinate transformations

**Technical Notes:**
- Field of view: ~60° horizontal for typical webcam
- Mapping: linear interpolation (pixel_x → angle_pan)
- Calibration stored in: `/data/apis/calibration.json`
- Includes offset_pan, offset_tilt, scale factors

---

### Story 12.3: Laser Activation Control

As an **APIS unit**,
I want to control laser activation safely,
So that the laser only fires when appropriate.

**Acceptance Criteria:**

**Given** a hornet is detected and unit is armed
**When** laser activation is requested
**Then** laser turns on via MOSFET/transistor control
**And** GPIO pin goes HIGH to enable laser module

**Given** the laser is active
**When** 10 seconds continuous on-time is reached
**Then** laser is automatically turned OFF
**And** cooldown period begins (5 seconds minimum)
**And** event is logged as "safety timeout"

**Given** detection ends (hornet leaves frame)
**When** laser was active
**Then** laser turns OFF immediately
**And** system returns to monitoring state

**Given** the unit is disarmed
**When** a detection occurs
**Then** laser remains OFF regardless of detection
**And** detection is still logged for statistics

**Given** a kill switch signal is received
**When** the emergency stop activates
**Then** laser is immediately disabled
**And** cannot be re-enabled until kill switch is reset

**Technical Notes:**
- Laser control: single GPIO pin through MOSFET driver
- Max continuous: 10 seconds (configurable, safety limit)
- Cooldown: 5 seconds between activations
- Kill switch: physical hardware interrupt

---

### Story 12.4: Targeting & Sweep Pattern

As an **APIS unit**,
I want to sweep the laser across the target zone,
So that the deterrent effect is maximized.

**Acceptance Criteria:**

**Given** a hornet is detected
**When** targeting begins
**Then** servos aim at the detection centroid
**And** laser activates after aim is confirmed
**And** sweep pattern begins

**Given** the laser is aimed at target
**When** sweep mode is active
**Then** laser sweeps in a pattern around the target:
- Horizontal sweep: ±10° around centroid
- Sweep speed: ~2 sweeps per second
- Pattern continues while detection persists

**Given** the hornet moves
**When** new coordinates are received
**Then** sweep pattern recenters on new position
**And** transition is smooth (no jerky movement)

**Given** multiple hornets are detected
**When** targeting runs
**Then** the largest/closest is prioritized
**And** system tracks one target at a time
**And** logs multiple detections for statistics

**Given** the target leaves frame
**When** tracking is lost
**Then** laser deactivates
**And** servos return to ready position
**And** system resumes monitoring

**Technical Notes:**
- Sweep amplitude: ±10° (configurable)
- Sweep frequency: 2 Hz
- Tracking update rate: match detection FPS (5-10 Hz)
- Priority: largest bounding box if multiple detections

---

### Story 12.5: Physical Arm/Disarm Button

As a **beekeeper**,
I want a physical button to arm/disarm the unit,
So that I can control it without needing my phone.

**Acceptance Criteria:**

**Given** the unit has a physical button wired
**When** I press the button briefly (<1 second)
**Then** the armed state toggles
**And** LED changes to reflect new state
**And** audio feedback (beep) confirms change

**Given** I press and hold the button (>3 seconds)
**When** the hold is detected
**Then** the unit enters emergency stop mode
**And** laser is disabled until reset
**And** LED shows error state (red rapid blink)

**Given** the unit is in emergency stop
**When** I press the button
**Then** emergency stop is cleared
**And** unit returns to disarmed state
**And** must be explicitly re-armed

**Given** the button is accidentally pressed
**When** I press again within 2 seconds
**Then** the second press undoes the first
**And** debounce logic prevents rapid toggling

**Technical Notes:**
- Button: normally open, connected to GPIO with pull-up
- Debounce: 50ms minimum
- Long press: 3 seconds for emergency stop
- Audio feedback: optional buzzer on separate GPIO

---

### Story 12.6: Safety Enforcement Layer

As an **APIS unit**,
I want multiple safety layers,
So that the laser cannot operate unsafely even with software bugs.

**Acceptance Criteria:**

**Given** the safety layer is active
**When** any laser command is issued
**Then** it passes through safety checks:
1. Unit must be armed
2. Detection must be active
3. Tilt angle must be downward (never up)
4. Continuous time must be <10 seconds
5. Kill switch must not be engaged

**Given** any safety check fails
**When** laser activation is attempted
**Then** laser remains OFF
**And** failure reason is logged
**And** no error is shown to user (silent enforcement)

**Given** the tilt servo is commanded upward
**When** the command is processed
**Then** it is rejected with logged warning
**And** laser cannot fire at upward angles
**And** maximum tilt is limited to horizontal (0°) or below

**Given** software enters unexpected state
**When** watchdog timer expires (no heartbeat in 30s)
**Then** laser is forced OFF
**And** system enters safe mode
**And** requires manual reset

**Given** power fluctuates or browns out
**When** voltage drops below threshold
**Then** laser is immediately disabled
**And** system enters low-power safe mode

**Technical Notes:**
- Safety checks: function that wraps ALL laser commands
- Watchdog: software timer, resets every processing loop
- Upward limit: tilt >= 0° is rejected
- Brownout: ADC monitors input voltage (if available)
- Principle: laser is OFF by default, must be actively enabled
