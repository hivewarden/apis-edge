# Code Review: Story 2.1 Create and Manage Sites

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/2-1-create-and-manage-sites.md`

## Story Verdict

- **Score:** 7.0 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** Sites CRUD is implemented end-to-end (DB + API + pages), but the Site Detail “units assigned” requirement is only a placeholder (`apis-dashboard/src/pages/SiteDetail.tsx:399-405` `Card title="Units at this Site" ... "No units assigned..."`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Add Site form appears with required fields | Implemented | `apis-dashboard/src/pages/Sites.tsx:90-96` `<Button ...> Add Site` + `apis-dashboard/src/pages/SiteCreate.tsx:82-88` `label="Site Name"` + `apis-dashboard/src/pages/SiteCreate.tsx:105-129` `placeholder="Latitude..."` / `placeholder="Longitude..."` + `apis-dashboard/src/pages/SiteCreate.tsx:139-154` `label="Timezone"` | The UX uses navigation to `/sites/create` rather than an inline modal (`apis-dashboard/src/pages/Sites.tsx:74-76` `navigate('/sites/create')`). |
| AC2: Save creates site for tenant, shows in list, success notification | Implemented | `apis-server/internal/handlers/sites.go:125-126` `tenantID := middleware.GetTenantID` + `apis-server/internal/storage/sites.go:56-59` `INSERT INTO sites (tenant_id, name, gps_lat, gps_lng, timezone)` + `apis-dashboard/src/pages/SiteCreate.tsx:43-51` `apiClient.post('/sites'...)` + `message.success('Site created successfully')` | Tenant isolation is enforced by RLS policy (`apis-server/internal/storage/migrations/0004_sites.sql:22-24` `USING ... WITH CHECK ... app.tenant_id`). |
| AC3: Sites page shows list/grid with mini-map thumbnail | Implemented | `apis-dashboard/src/pages/Sites.tsx:109-125` `<Row ...> ... <SiteMapThumbnail ... />` + `apis-dashboard/src/components/SiteMapThumbnail.tsx:33-36` `https://staticmap.openstreetmap.de/staticmap.php?...` | Uses a static image service; availability/rate limits are an external dependency (`apis-dashboard/src/components/SiteMapThumbnail.tsx:35`). |
| AC4: Site detail shows map + units list + edit/delete | Partial | `apis-dashboard/src/pages/SiteDetail.tsx:268-303` `Card title="Site Information"` + `Card title="Location Map"` + `SiteMapView ...` + `apis-dashboard/src/pages/SiteDetail.tsx:254-265` `<Button ...> Edit` / `<Button danger ...> Delete` + `apis-dashboard/src/pages/SiteDetail.tsx:399-405` `"Units at this Site" ... "No units assigned..."` | Map + edit/delete exist; “units assigned to this site” is not implemented beyond an Empty placeholder (`apis-dashboard/src/pages/SiteDetail.tsx:399-405`). |
| AC5: Deleting site with assigned units is blocked with warning | Implemented | `apis-server/internal/storage/sites.go:188-197` `SELECT COUNT(*) FROM units WHERE site_id = $1` + `return ErrSiteHasUnits` + `apis-server/internal/handlers/sites.go:251-253` `http.StatusConflict` + `apis-dashboard/src/pages/SiteDetail.tsx:161-163` `error.response?.status === 409` | Backend blocks deletion via `ErrSiteHasUnits`; frontend surfaces the 409 error message (`apis-dashboard/src/pages/SiteDetail.tsx:161-163`). |

---

## Findings

**F1: Site detail does not list assigned units (AC4 only has a placeholder)**  
- Severity: High  
- Category: Correctness / UX  
- Evidence: `apis-dashboard/src/pages/SiteDetail.tsx:399-405` `Card title="Units at this Site"` ... `Empty description="No units assigned..."`  
- Why it matters: A core Site detail requirement is to see which devices are at a location; without it, Sites can’t be used to organize units effectively.  
- Recommended fix: Add a real “Units at this Site” list. Easiest path: support `GET /api/units?site_id=...` on the server (or fetch all units and filter client-side), then render a list here with links to Unit detail.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a site has units assigned, when I open the site detail page, then I see a list of those units (name/serial + status) with links to `/units/{id}`.
  - AC2: Given a site has no units assigned, when I open site detail, then I see an empty state message (current behavior is fine).
  - Tests/Verification: add/update `apis-dashboard/tests/pages/SiteDetail.test.tsx` to assert unit list rendering; run `npx vitest run tests/pages/SiteDetail.test.tsx`.  
- “Out of scope?”: no

**F2: “Storage/handler unit tests” are mostly structural and don’t verify DB behavior**  
- Severity: Medium  
- Category: Testing / Reliability  
- Evidence: `apis-server/internal/storage/sites_test.go:9-11` `Full integration tests require database connection. These unit tests verify struct and error definitions.`  
- Why it matters: Most failure modes here are DB/RLS/SQL related (tenant scoping, delete blocking). Structural tests won’t catch regressions in queries or migrations.  
- Recommended fix: Add integration tests against a real Postgres-compatible DB (ideally the compose Yugabyte service) that exercise create/list/get/update/delete with tenant context (`SET LOCAL app.tenant_id`).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a test database, when tests run, then `CreateSite/ListSites/GetSiteByID/UpdateSite/DeleteSite` are exercised end-to-end and pass.
  - AC2: Given a site with units assigned, when `DeleteSite` is called, then it returns `ErrSiteHasUnits`.
  - Tests/Verification: add `go test ./...` for the new integration tests; document env requirements if DB is needed.  
- “Out of scope?”: no (but may require test DB harness)

**F3: Map components use `innerHTML` fallbacks (bypasses React rendering)**  
- Severity: Low  
- Category: Security / Maintainability  
- Evidence: `apis-dashboard/src/components/SiteMapThumbnail.tsx:92-97` `target.parentElement.innerHTML = \` ... \`` + `apis-dashboard/src/components/SiteMapView.tsx:83-89` `target.parentElement.innerHTML = \` ... \``  
- Why it matters: Direct DOM mutation makes behavior harder to test and reason about; if any interpolated values ever become attacker-controlled, it can become an XSS vector.  
- Recommended fix: Replace `innerHTML` with a React-state-driven fallback (e.g., `useState(hasError)` and conditionally render a safe placeholder).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given the map image fails to load, when `onError` fires, then a React-rendered fallback placeholder is shown (no `innerHTML` usage).
  - AC2: Given a successful load, when the image loads, then the static map image is displayed as before.
  - Tests/Verification: add component tests for error fallback; run `npx vitest run tests/pages/Sites.test.tsx`.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.5 / 2 (AC4 is only partially met: units list is a placeholder; `apis-dashboard/src/pages/SiteDetail.tsx:399-405` `No units assigned...`)
- **Correctness / edge cases:** 1.5 / 2 (validation + RLS policy present; `apis-server/internal/handlers/sites.go:139-146` `Latitude must be...`)
- **Security / privacy / secrets:** 1.5 / 2 (RLS has USING + WITH CHECK; `apis-server/internal/storage/migrations/0004_sites.sql:22-24` `WITH CHECK ... app.tenant_id`; minor DOM `innerHTML` concerns)
- **Testing / verification:** 1.0 / 2 (backend tests are not DB-validating; `apis-server/internal/storage/sites_test.go:9-11` `Full integration tests require...`)
- **Maintainability / clarity / docs:** 1.5 / 2 (clear separation of storage/handlers/pages; site units display still pending; `apis-dashboard/src/pages/SiteDetail.tsx:399` `placeholder`)

## What I Could Not Verify (story-specific)

- RLS isolation at runtime (requires running DB + setting `app.tenant_id`; policy exists in migration but behavior needs runtime proof: `apis-server/internal/storage/migrations/0004_sites.sql:22-24` `current_setting('app.tenant_id'...)`).  
- Static map rendering behavior in real browsers and availability of the external static map service (`apis-dashboard/src/components/SiteMapThumbnail.tsx:35` `staticmap.openstreetmap.de`).  
