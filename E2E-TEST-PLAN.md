# APIS — Browser E2E Test Plan (Chrome MCP)

> **Purpose:** Validate all user-facing features per epic using Chrome browser automation.
> **Prerequisites:** Dashboard running at `http://localhost:5173`, Server at `http://localhost:3000`
> **Auth mode:** `local` (standalone) — uses email/password login

---

## Pre-Flight Checklist

Before running any epic tests:

1. **Start the stack:**
   ```bash
   docker compose --profile standalone up -d
   cd apis-dashboard && npm run dev
   ```
2. **Verify health:** `GET http://localhost:3000/api/health` returns `200`
3. **Seed data (if needed):** Setup wizard creates admin on first run

---

## Epic 0 — Infrastructure

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 0.1 | Health endpoint | Navigate to `localhost:3000/api/health` | JSON with `status: "ok"` |
| 0.2 | Dashboard loads | Navigate to `localhost:5173` | Redirects to `/login` or `/setup` |

---

## Epic 1 — Portal Foundation & Auth

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1.1 | Setup wizard (first run) | Navigate to `/setup` | Wizard form: admin email, password, deployment scenario |
| 1.2 | Create admin account | Fill setup form, submit | Redirected to dashboard `/` |
| 1.3 | Login page renders | Logout, navigate to `/login` | Email + password form visible |
| 1.4 | Login with credentials | Enter admin email/password, submit | Redirected to dashboard |
| 1.5 | Sidebar navigation | Click each nav item | Correct page loads for each |
| 1.6 | Theme applied | Inspect dashboard | Sea buckthorn orange accent, coconut cream backgrounds |
| 1.7 | Logout | Click user menu → Logout | Redirected to `/login` |
| 1.8 | Auth guard redirect | Navigate to `/hives` while logged out | Redirected to `/login` |

---

## Epic 2 — Site & Unit Management

### Sites

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 2.1 | Sites page loads | Navigate to `/sites` | Empty state or list of sites |
| 2.2 | Create site | Click "Create", fill name + GPS coords, submit | Site appears in list |
| 2.3 | Site detail | Click site from list | Detail page with map, name, coordinates |
| 2.4 | Edit site | Click edit on detail page, change name, save | Name updated in list |
| 2.5 | Delete site | Click delete, confirm | Site removed from list |

### Units

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 2.6 | Units page loads | Navigate to `/units` | Empty state or list of units |
| 2.7 | Register unit | Click "Register", fill name + select site, submit | Unit appears in list |
| 2.8 | Unit detail | Click unit from list | Detail page with status, config, API key section |
| 2.9 | Unit status card | View dashboard or units page | Status card shows online/offline indicator |
| 2.10 | Edit unit | Click edit, change name/site, save | Unit updated |

---

## Epic 3 — Hornet Detection Dashboard

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 3.1 | Dashboard loads | Navigate to `/` | Dashboard with cards: activity count, weather, charts |
| 3.2 | Today's activity card | View dashboard | Card shows today's detection count (0 if no data) |
| 3.3 | Weather card | View dashboard | Current weather data from Open-Meteo (or error state) |
| 3.4 | Time range selector | Click time range buttons | Options: Today, This Week, This Month, Custom |
| 3.5 | Change time range | Select "This Week" | Charts and data update to reflect selected range |
| 3.6 | Activity clock | View dashboard | 24-hour circular chart renders (may be empty) |
| 3.7 | Temperature correlation | View dashboard | Temperature + detection overlay chart renders |
| 3.8 | Trend chart | View dashboard | Daily/weekly trend line chart renders |
| 3.9 | Statistics page | Navigate to `/statistics` | Analytics page loads with charts |

---

## Epic 4 — Clip Archive & Video Review

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 4.1 | Clips page loads | Navigate to `/clips` | Clip archive with grid/list view (or empty state) |
| 4.2 | Clip card display | View clips page (with data) | Thumbnail, timestamp, site name, detection type |
| 4.3 | Play clip | Click a clip card | Modal opens with video player |
| 4.4 | Close player | Click X or outside modal | Modal closes |
| 4.5 | Delete clip | Click delete on clip, confirm | Clip removed from list |
| 4.6 | Nest estimator | View nest radius map (if available on clips page) | Interactive map with radius estimation |

---

## Epic 5 — Hive Management & Inspections

### Hives

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 5.1 | Hives page loads | Navigate to `/hives` | Hive list (grouped by site or flat) |
| 5.2 | Create hive | Navigate to site, click "Add Hive", fill form | Hive appears in list |
| 5.3 | Hive detail | Click hive from list | Detail page: config summary, queen info, inspection history |
| 5.4 | Edit hive | Click edit, change name/boxes, save | Hive updated |

### Inspections

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 5.5 | Create inspection | From hive detail, click "New Inspection" | Quick-entry form with queen status, brood, stores, temperament |
| 5.6 | Fill inspection form | Fill all fields, submit | Inspection saved, appears in history |
| 5.7 | Inspection history | View hive detail | Timeline of inspections with dates and summaries |
| 5.8 | Inspection detail modal | Click inspection in history | Modal with full inspection details |
| 5.9 | Edit inspection | Click edit on inspection | Edit form with pre-filled values |
| 5.10 | Frame-level entry | During inspection, toggle frame tracking | Frame grid appears for per-frame data entry |
| 5.11 | Frame development chart | View hive detail | Frame progression graph over time |

---

## Epic 6 — Treatments, Feedings & Harvests

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 6.1 | Add treatment | From hive detail, click "Treatment" | Modal: type, method, mite count fields |
| 6.2 | Submit treatment | Fill form, submit | Treatment appears in hive activity |
| 6.3 | Add feeding | From hive detail, click "Feeding" | Modal: type, amount, concentration |
| 6.4 | Submit feeding | Fill form, submit | Feeding appears in hive activity |
| 6.5 | Add harvest | From hive detail, click "Harvest" | Modal: frames, weight, moisture |
| 6.6 | Submit harvest | Fill form, submit | Harvest recorded |
| 6.7 | Add equipment change | From hive detail, click "Equipment" | Modal: box add/remove, frame changes |
| 6.8 | Custom labels page | Navigate to `/settings/labels` | Label management UI |
| 6.9 | Create label | Click "Create Label", enter name + color | Label appears in list |
| 6.10 | Calendar view | Navigate to `/calendar` | Calendar with treatment reminders, inspections |

---

## Epic 7 — Mobile PWA & Offline

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 7.1 | Offline banner | Emulate offline mode (Chrome DevTools) | "You are offline" banner appears |
| 7.2 | Cached pages load | While offline, navigate to previously visited pages | Pages render from cache |
| 7.3 | Offline inspection | While offline, create inspection | Form submits, shows "pending sync" indicator |
| 7.4 | Sync on reconnect | Go back online | Pending items sync, notification shown |
| 7.5 | Voice input button | On inspection form, look for mic button | Voice input button present |
| 7.6 | Sync notification | After reconnect sync | "X items synced" toast/banner |
| 7.7 | Conflict resolution | Create conflicting edits offline | Conflict resolution modal appears on sync |

---

## Epic 8 — BeeBrain AI Insights

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 8.1 | BeeBrain dashboard card | View dashboard | BeeBrain card with insight summary (info/warning/action) |
| 8.2 | Hive BeeBrain card | View hive detail | Hive-specific analysis and recommendations |
| 8.3 | Proactive insight banner | When insights exist | Banner/notification appears at top of page |
| 8.4 | Dismiss insight | Click dismiss on insight | Insight removed from view |
| 8.5 | Maintenance page | Navigate to `/maintenance` | Priority-sorted list of hives needing attention |
| 8.6 | Maintenance item card | View maintenance page | Cards with hive name, issue, priority level |
| 8.7 | BeeBrain settings | Navigate to `/settings/beebrain` | BeeBrain configuration options |

---

## Epic 9 — Data Export & Emotional Moments

### Export

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 9.1 | Export page loads | Navigate to `/settings/export` | Export configuration UI |
| 9.2 | Select hives | Check hives to include | Hives selected with checkboxes |
| 9.3 | Select fields | Toggle field groups (Basic Info, Inspections, etc.) | Fields grouped by category |
| 9.4 | Choose format | Select Quick Summary / Detailed Markdown / Full JSON | Format picker visible |
| 9.5 | Preview export | Click "Preview" | Generated text preview shown |
| 9.6 | Copy to clipboard | Click "Copy" button | "Copied!" feedback shown |
| 9.7 | Save preset | Save current configuration as preset | Preset appears in saved list |

### Emotional Moments

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 9.8 | Season recap page | Navigate to `/recap` | Season summary with stats and highlights |
| 9.9 | Year comparison chart | View recap page | Year-over-year comparison graph |
| 9.10 | Recap share modal | Click "Share" on recap | Share modal with copy/download options |
| 9.11 | Overwintering survey | Navigate to `/overwintering/survey` | Survey form for post-winter hive status |
| 9.12 | Winter report | Navigate to `/overwintering/report` | Survival/loss report with celebrations |

---

## Epics 10-12 — Edge Firmware & Hardware (NOT browser-testable)

These epics cover C firmware and hardware assembly. **Skip for browser E2E testing.**

Indirect validation only:
- Unit heartbeats appear in unit status cards (Epic 2)
- Detection events populate dashboard charts (Epic 3)
- Clips appear in clip archive (Epic 4)

---

## Epic 13 — Dual Authentication Mode

### Local Auth (Standalone)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 13.1 | Auth config endpoint | Check `/api/auth/config` | Returns `auth_mode: "local"` |
| 13.2 | Setup wizard | First visit (no users) → `/setup` | Admin creation wizard |
| 13.3 | Security warning | Setup wizard shows remote access warning | Modal warning for non-localhost deployments |
| 13.4 | Local login | Email + password on `/login` | JWT token issued, redirected to dashboard |
| 13.5 | User management | Navigate to `/settings/users` | User list with create/edit/delete |
| 13.6 | Create user | Click "Create User", fill form | New user appears in list |
| 13.7 | Edit user | Click edit on user | Edit form with role selection |
| 13.8 | Reset password | Click "Reset Password" on user | Password reset flow |
| 13.9 | Delete user | Click delete, confirm | User removed |
| 13.10 | Invite flow | Click "Invite", choose method | Invite link/email generated |
| 13.11 | Rate limiting | Submit 6+ wrong passwords rapidly | "Too many attempts" error after 5 |

### Admin Features (SaaS mode)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 13.12 | Admin guard | Navigate to `/admin/tenants` as non-admin | Access denied or redirect |
| 13.13 | Tenant list | Navigate to `/admin/tenants` as super_admin | List of tenants with usage stats |
| 13.14 | Tenant detail | Click tenant | Detail page with limits, users, config |
| 13.15 | Tenant limits | Set max hives/sites/users | Limits saved and enforced |
| 13.16 | Impersonation | Click "Impersonate" on tenant | Visual banner, acting as tenant |
| 13.17 | End impersonation | Click "End Impersonation" | Back to admin view |
| 13.18 | Activity feed | Navigate to `/activity` | Recent activity log with timestamps |
| 13.19 | Audit log | Check audit entries | Create/update/delete operations logged |
| 13.20 | Tenant settings | Navigate to `/settings/tenant` | Tenant-level preferences |

---

## Epic 14 — Hive Task Management

### Portal (Desktop)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 14.1 | Tasks page loads | Navigate to `/tasks` | Task library + active tasks sections |
| 14.2 | Task library | View task templates grid | System + custom templates shown |
| 14.3 | Create custom template | Click "Create Template", fill form, save | Template appears in library |
| 14.4 | Assign task to hive | Select template, pick hive, set priority/due date | Task created and assigned |
| 14.5 | Bulk assignment | Select "All hives in site", assign template | Tasks created for all hives |
| 14.6 | Active tasks list | View active tasks section | Filterable list with site/priority/status |
| 14.7 | Task filters | Filter by site, priority, overdue | List updates to match filters |
| 14.8 | Complete task | Click "Complete" on task | Task marked done, inspection note created |
| 14.9 | Delete task | Click delete, confirm | Task removed |
| 14.10 | Overdue badge | Create task with past due date | Red badge on "Tasks" nav item |
| 14.11 | Overdue alert banner | View tasks page with overdue items | Alert banner at top of page |

### Hive Detail Integration

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 14.12 | Task summary card | View hive detail | Task count summary card with pending/overdue |
| 14.13 | Click task summary | Click task count card | Scrolls to tasks section |
| 14.14 | Tasks section | View hive detail tasks section | Pending tasks sorted by priority |
| 14.15 | Inline task creation | Click "Add Task" from hive detail | Quick-add form appears |
| 14.16 | BeeBrain suggestions | View hive tasks section | AI-suggested tasks shown (if applicable) |

### Mobile Layout (emulate mobile viewport)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 14.17 | Mobile hive detail | Emulate 375px width, view hive detail | Single-scroll layout: Status → Tasks → History |
| 14.18 | Bottom anchor nav | View mobile hive detail | 64px fixed bottom bar with section buttons |
| 14.19 | Section navigation | Tap section buttons in bottom nav | Scrolls to correct section |
| 14.20 | Section highlighting | Scroll through sections | Bottom nav highlights current section |
| 14.21 | Mobile task card | View mobile tasks section | Expandable task cards with priority indicators |
| 14.22 | Mobile task completion | Tap "Complete" (64px touch target) | Completion sheet slides up |
| 14.23 | Auto-effect prompts | Complete "Add super" task | Prompts for super count before completion |
| 14.24 | Mobile add task | Tap "Add Task" in mobile view | Inline creation form |

### Offline Tasks

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 14.25 | Create task offline | Emulate offline, create task | Task saved locally, "pending sync" shown |
| 14.26 | Complete task offline | Emulate offline, complete task | Completion saved locally |
| 14.27 | Sync tasks | Go back online | Tasks sync to server |

---

## Cross-Epic Smoke Test (Happy Path)

A single end-to-end flow that touches multiple epics:

| Step | Action | Epic |
|------|--------|------|
| 1 | Login with admin credentials | 1, 13 |
| 2 | Create a site "Test Apiary" with GPS | 2 |
| 3 | Register a unit and assign to site | 2 |
| 4 | Create a hive "Hive Alpha" at the site | 5 |
| 5 | Add an inspection to the hive | 5 |
| 6 | Record a feeding | 6 |
| 7 | Record a treatment | 6 |
| 8 | Create a task "Inspect Queen" and assign to hive | 14 |
| 9 | Complete the task | 14 |
| 10 | Check BeeBrain card for insights | 8 |
| 11 | Check maintenance page | 8 |
| 12 | View dashboard charts | 3 |
| 13 | Visit clips page | 4 |
| 14 | Export hive data | 9 |
| 15 | View season recap | 9 |
| 16 | Create another user | 13 |
| 17 | Logout | 1 |

---

## Execution Notes

- **Chrome MCP tools:** Use `take_snapshot` for element discovery, `click`/`fill` for interactions, `take_screenshot` for evidence
- **Mobile tests:** Use `emulate` with viewport `{width: 375, height: 812, isMobile: true, hasTouch: true}` for mobile layout tests
- **Offline tests:** Use `emulate` with `networkConditions: "Offline"` then back to `"No emulation"`
- **Evidence:** Take screenshots at each major validation point for test report
- **Data dependency:** Epics 3-9 need seeded data (sites, hives, units) — run Epic 2 tests first
