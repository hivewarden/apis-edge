# Code Review: Story 2.4 Unit Status Dashboard Cards

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/2-4-unit-status-dashboard-cards.md`

## Story Verdict

- **Score:** 3.5 / 10
- **Verdict:** **FAIL**
- **Rationale:** The UI renders cards and polls, but two core ACs are missing: “online but disarmed” is not representable and “offline after 120s” is not implemented (`apis-dashboard/src/components/UnitStatusCard.tsx:39-61` `online → Armed` / `error → Disarmed` / default Offline` vs `apis-server/internal/storage/units.go:356` `status = 'online'` with no auto-offline path).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Dashboard shows a card per unit with name, site, status, last seen | Implemented | `apis-dashboard/src/pages/Dashboard.tsx:368-373` `<UnitStatusCard unit={unit} ... />` + `apis-dashboard/src/components/UnitStatusCard.tsx:101-129` `{unit.name || unit.serial}` + `{unit.site_name}` + `formatLastSeen(...)` | Card renders the required fields; correctness depends on backend status semantics (see F1/F2). |
| AC2: Online + armed → green “Armed” | Implemented | `apis-dashboard/src/components/UnitStatusCard.tsx:43-48` `case 'online' ... label: 'Armed'` | “Optional live preview thumbnail” is not implemented (optional AC wording). |
| AC3: Online + disarmed → yellow “Disarmed” | Missing | `apis-dashboard/src/components/UnitStatusCard.tsx:49-54` `case 'error' ... label: 'Disarmed'` + `apis-server/internal/storage/units.go:356` `status = 'online'` | No `armed` field exists in the unit schema/API, and nothing sets status to `error`, so “Disarmed” is effectively unreachable. |
| AC4: Offline after 120s → red “Offline” + “Offline since” | Missing | `apis-dashboard/src/components/UnitStatusCard.tsx:74-79` `if (status === 'offline') return \`Offline since...\`` + `apis-server/internal/storage/units.go:356` `status = 'online'` | There is no mechanism to mark a unit offline when heartbeats stop. |
| AC5: Clicking a unit card navigates to unit detail | Implemented | `apis-dashboard/src/components/UnitStatusCard.tsx:92-95` `onClick={() => onClick(unit.id)}` + `apis-dashboard/src/pages/Dashboard.tsx:202-205` `navigate(\`/units/${id}\`)` | Meets navigation requirement. |
| AC6: Card updates within 30 seconds via polling | Implemented | `apis-dashboard/src/pages/Dashboard.tsx:47` `POLL_INTERVAL_MS = 30000` + `apis-dashboard/src/pages/Dashboard.tsx:179-181` `setInterval(() => { fetchWithMountCheck(); }, POLL_INTERVAL_MS)` | Polling exists; endpoint filtering by `site_id` is attempted (see F3). |

---

## Findings

**F1: Units never transition to “offline” after missed heartbeats (AC4 missing)**  
- Severity: Critical  
- Category: Correctness / Reliability  
- Evidence: `apis-server/internal/storage/units.go:356` `UPDATE units SET last_seen = NOW(), ip_address = $2, status = 'online'` + `apis-dashboard/src/components/UnitStatusCard.tsx:74-79` `if (status === 'offline') return \`Offline since...\``  
- Why it matters: The dashboard can incorrectly show units as online indefinitely after a single heartbeat, defeating the “needs attention” purpose of the cards.  
- Recommended fix: Derive status from `last_seen` at read time (e.g., in `ListUnitsWithSiteNames` use `CASE WHEN last_seen < NOW() - INTERVAL '120 seconds' THEN 'offline' ...`) or add a background job to mark offline.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a unit last_seen is older than 120 seconds, when `GET /api/units` is called, then the unit is returned with `status: "offline"`.
  - AC2: Given a unit heartbeats successfully, when it heartbeats again, then status returns to `"online"` and last_seen updates.
  - Tests/Verification: add unit tests around status derivation (and/or DB integration tests); verify UI shows `Offline since` after threshold.  
- “Out of scope?”: no

**F2: “Disarmed” state is not representable with the current model (AC3 missing)**  
- Severity: High  
- Category: Correctness  
- Evidence: `apis-dashboard/src/components/UnitStatusCard.tsx:39-54` `online=Armed ... error=Disarmed` + `apis-server/internal/storage/migrations/0005_units.sql:5-18` `CREATE TABLE units (...) status TEXT DEFAULT 'offline'` (no `armed` column)  
- Why it matters: The UI claims to show armed/disarmed, but the backend doesn’t expose a source-of-truth `armed` flag and heartbeat doesn’t capture it, so the state is effectively fiction.  
- Recommended fix: Add `armed BOOLEAN NOT NULL DEFAULT true` (or default false) to `units`, include it in heartbeat payload and responses, and map UI state from `(online, armed)` rather than `status == 'error'`.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given a unit is online and `armed=true`, when shown on the dashboard, then it shows green “Armed”.
  - AC2: Given a unit is online and `armed=false`, when shown on the dashboard, then it shows yellow “Disarmed”.
  - Tests/Verification: DB migration + handler tests + UI test; run `npx vitest run tests/components/UnitStatusCard.test.tsx`.  
- “Out of scope?”: no

**F3: Dashboard attempts `site_id` filtering but the server ignores it**  
- Severity: Medium  
- Category: Correctness / Maintainability  
- Evidence: `apis-dashboard/src/pages/Dashboard.tsx:160-163` ``selectedSiteId ? `/units?site_id=${selectedSiteId}` : '/units'`` + `apis-server/internal/handlers/units.go:105-127` `ListUnits(...)` (no query param parsing)  
- Why it matters: Users can select a site, but the units list may still show units from all sites, causing confusion and undermining “organize by site”.  
- Recommended fix: Implement `site_id` filter in the backend (preferred), or remove the query param and filter client-side explicitly.  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given `GET /api/units?site_id=X`, when called, then only units with `site_id = X` are returned.
  - AC2: Given no `site_id` is provided, when called, then all tenant units are returned.
  - Tests/Verification: handler tests for query param; run `go test ./internal/handlers -run ListUnits`.  
- “Out of scope?”: no

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 0.0 / 2 (AC3 and AC4 are missing; `apis-dashboard/src/components/UnitStatusCard.tsx:49-54` `error=Disarmed` + no backend source)  
- **Correctness / edge cases:** 0.5 / 2 (offline/armed semantics not implemented; `apis-server/internal/storage/units.go:356` `status='online'`)  
- **Security / privacy / secrets:** 1.0 / 2 (no new secret handling; status inaccuracies can mislead operators; `apis-dashboard/src/components/UnitStatusCard.tsx:43-48` `online -> Armed`)  
- **Testing / verification:** 1.0 / 2 (component tests exist; `apis-dashboard/tests/components/UnitStatusCard.test.tsx:93-118` `shows ... online/offline`; but missing backend semantics tests)  
- **Maintainability / clarity / docs:** 1.0 / 2 (implementation is clean, but model mismatch creates drift; `apis-dashboard/src/components/UnitStatusCard.tsx:40-42` `MVP: online=armed ...`)  

## What I Could Not Verify (story-specific)

- A real end-to-end “offline after 120s” behavior because there is no code path implementing the threshold (`apis-server/internal/storage/units.go:356` `status = 'online'`).  
