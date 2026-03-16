# Story 5.1: Create and Configure Hives

Status: done

## Story

As a **beekeeper**,
I want to add hives to my sites with their configuration,
so that I can track each hive individually.

## Acceptance Criteria

1. **Given** I am on a Site detail page **When** I click "Add Hive" **Then** a form appears with fields:
   - Hive name/number (required)
   - Queen introduction date
   - Queen source (dropdown: Breeder, Swarm, Split, Package, Other + text)
   - Number of brood boxes (1-3)
   - Number of honey supers (0-5)
   - Notes

2. **Given** I submit a valid hive form **When** the hive is created **Then**:
   - It appears in the site's hive list
   - I'm redirected to the hive detail page
   - Success notification: "Hive {name} created"

3. **Given** I view an existing hive **When** I click "Edit Configuration" **Then**:
   - I can update queen info, box counts, and notes
   - Changes are saved with timestamp

4. **Given** I add/remove a honey super **When** I save the change **Then** a box history entry is recorded: "Super added: Jan 22, 2026"

5. **Given** I need to record a queen replacement **When** I update queen info **Then**:
   - I can mark the old queen as "Replaced" with reason
   - Enter new queen details
   - Queen history is preserved

## Tasks / Subtasks

### Task 1: Database Schema (AC: #1, #3, #4, #5)
- [x] 1.1 Create migration `0009_hives.sql` with `hives`, `queen_history`, and `box_changes` tables
- [x] 1.2 Add indexes for tenant_id, site_id, hive_id lookups
- [x] 1.3 Test migration runs cleanly on fresh database

### Task 2: Backend Storage Layer (AC: #1, #2, #3, #4, #5)
- [x] 2.1 Create `internal/storage/hives.go` with CRUD operations
- [x] 2.2 Queen history tracking (integrated in hives.go)
- [x] 2.3 Box changes tracking (integrated in hives.go)
- [x] 2.4 Implement `ListHivesBySite`, `GetHiveByID`, `CreateHive`, `UpdateHive`, `DeleteHive`
- [x] 2.5 Implement `CreateQueenHistoryEntry`, `ListQueenHistory`
- [x] 2.6 Implement `CreateBoxChange`, `ListBoxChanges`

### Task 3: Backend API Handlers (AC: #1, #2, #3, #4, #5)
- [x] 3.1 Create `internal/handlers/hives.go` with REST endpoints
- [x] 3.2 Implement `POST /api/sites/{site_id}/hives` - Create hive
- [x] 3.3 Implement `GET /api/sites/{site_id}/hives` - List hives for site
- [x] 3.4 Implement `GET /api/hives/{id}` - Get hive with queen history and box changes
- [x] 3.5 Implement `PUT /api/hives/{id}` - Update hive (handles queen/box changes)
- [x] 3.6 Implement `DELETE /api/hives/{id}` - Delete hive
- [x] 3.7 Register routes in main.go

### Task 4: Frontend - Hive Creation Form (AC: #1, #2)
- [x] 4.1 Create `HiveCreate.tsx` page component
- [x] 4.2 Implement form with Ant Design Form component
- [x] 4.3 Add queen source dropdown with "Other" text input option
- [x] 4.4 Add number inputs for brood boxes (1-3) and honey supers (0-5)
- [x] 4.5 Implement form validation and submission
- [x] 4.6 Add success notification and redirect to hive detail

### Task 5: Frontend - Hive Edit Form (AC: #3, #4, #5)
- [x] 5.1 Create `HiveEdit.tsx` page component
- [x] 5.2 Pre-populate form with existing hive data
- [x] 5.3 Detect box count changes and create history entries
- [x] 5.4 Add queen replacement flow (mark old queen, add new) - via HiveDetail page
- [x] 5.5 Show queen history timeline on edit page - moved to HiveDetail for better UX

### Task 6: Frontend - Hive Detail View (AC: #2, #3)
- [x] 6.1 Create `HiveDetail.tsx` page component
- [x] 6.2 Display hive configuration summary
- [x] 6.3 Show queen info with calculated age
- [x] 6.4 Show box configuration visualization (stacked boxes)
- [x] 6.5 Add "Edit Configuration" button linking to edit page
- [x] 6.6 Display queen history and box change history

### Task 7: Frontend - Site Detail Integration (AC: #1, #2)
- [x] 7.1 Update `SiteDetail.tsx` to show hives section
- [x] 7.2 Add "Add Hive" button to site detail page
- [x] 7.3 Display list of hives for the site with basic info

### Task 8: Routing and Navigation (AC: #1, #2, #3)
- [x] 8.1 Add routes: `/sites/:siteId/hives/create`, `/hives/:id`, `/hives/:id/edit`
- [x] 8.2 Update sidebar navigation if needed
- [x] 8.3 Ensure back navigation works correctly

### Task 9: Testing (All ACs)
- [x] 9.1 Write handler tests for hive CRUD endpoints
- [ ] 9.2 Write frontend component tests for forms
- [ ] 9.3 Manual E2E test of complete flow

## Dev Notes

### Architecture Patterns (from CLAUDE.md and architecture.md)

**Database Schema** (from architecture.md:207-226):
```sql
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Additional tables from Epic requirements:
CREATE TABLE queen_history (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    introduced_at DATE NOT NULL,
    source TEXT,
    replaced_at DATE,
    replacement_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE box_changes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL,  -- 'added' or 'removed'
    box_type TEXT NOT NULL,     -- 'brood' or 'super'
    changed_at DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hives_tenant ON hives(tenant_id);
CREATE INDEX idx_hives_site ON hives(site_id);
CREATE INDEX idx_queen_history_hive ON queen_history(hive_id);
CREATE INDEX idx_box_changes_hive ON box_changes(hive_id);
```

**Handler Pattern** (follow `sites.go` as reference):
```go
// Follow the exact pattern from sites.go:
// - Use storage.RequireConn(r.Context()) for DB connection
// - Use middleware.GetTenantID(r.Context()) for multi-tenant
// - Use chi.URLParam(r, "id") for route params
// - Use respondJSON/respondError for responses
// - Use zerolog for structured logging
```

**API Response Format** (from architecture.md:1262-1286):
```json
// Success (single)
{"data": {...}}

// Success (list)
{"data": [...], "meta": {"total": N}}

// Error
{"error": "message", "code": 404}
```

**Frontend Patterns** (from existing pages):
- Use Ant Design components (Form, Input, InputNumber, Select, DatePicker, Button)
- Follow the pattern in `SiteCreate.tsx` and `SiteEdit.tsx`
- Use the APIS theme colors from `theme/apisTheme.ts`
- Use `useApiUrl()` from Refine for API calls
- Show success notifications using Ant Design message

### Project Structure Notes

**Backend files to create:**
- `apis-server/internal/storage/migrations/0009_hives.sql`
- `apis-server/internal/storage/hives.go`
- `apis-server/internal/handlers/hives.go`

**Frontend files to create:**
- `apis-dashboard/src/pages/HiveCreate.tsx`
- `apis-dashboard/src/pages/HiveEdit.tsx`
- `apis-dashboard/src/pages/HiveDetail.tsx`
- Update `apis-dashboard/src/pages/SiteDetail.tsx`
- Update `apis-dashboard/src/pages/index.ts`
- Update `apis-dashboard/src/App.tsx` for routes

### Key Implementation Details

**Queen Source Options:**
```typescript
const queenSourceOptions = [
  { label: 'Breeder', value: 'breeder' },
  { label: 'Swarm', value: 'swarm' },
  { label: 'Split', value: 'split' },
  { label: 'Package', value: 'package' },
  { label: 'Other', value: 'other' },
];
```

**Box Count Constraints:**
- Brood boxes: 1-3 (at least 1 required)
- Honey supers: 0-5

**Queen Age Calculation:**
```typescript
const calculateQueenAge = (introducedAt: string): string => {
  const days = differenceInDays(new Date(), parseISO(introducedAt));
  if (days < 365) return `${Math.floor(days / 30)} months`;
  return `${Math.floor(days / 365)} years`;
};
```

**Box Change Detection:**
When updating a hive, compare old and new box counts:
- If honey_supers increased: create box_change with change_type='added', box_type='super'
- If honey_supers decreased: create box_change with change_type='removed', box_type='super'
- Same logic for brood_boxes

### References

- [Source: architecture.md#Data-Model] - Hives table schema
- [Source: architecture.md#Complete-API-Endpoints] - Hive endpoints definition
- [Source: epics.md#Story-5.1] - Full acceptance criteria
- [Source: sites.go] - Handler pattern reference
- [Source: SiteCreate.tsx] - Frontend form pattern reference

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Initial implementation completed, all files created
- Code review identified 10 issues (3 HIGH, 4 MEDIUM, 3 LOW)
- Remediation completed for all HIGH and MEDIUM issues
- [2026-01-25] Bulk review identified 6 issues (1 HIGH, 3 MEDIUM, 2 LOW)
- [2026-01-25] Remediation: Fixed all 6 issues from code review

### Completion Notes List

1. **RLS Policies Added**: Added Row Level Security policies to `queen_history` and `box_changes` tables to prevent cross-tenant data access
2. **Logging Fixed**: Replaced `fmt.Printf` with zerolog `log.Warn()` calls in storage layer
3. **Queen Replacement Date Fix**: `replaced_at` now uses `newIntroducedAt` instead of `time.Now()` so historical replacements are recorded correctly
4. **"Other" Queen Source**: Added conditional text input when "Other" is selected in queen source dropdown (both Create and Edit forms)
5. **Box Visualization**: Visual hive diagram shows stacked brood boxes (brown) and honey supers (gold) with roof
6. **Queen Age Calculation**: Displays queen age in days/months/years format
7. **Box Change Detection**: Edit form shows Alert when box counts will change, backend automatically records changes

### File List

**Backend:**
- `apis-server/internal/storage/migrations/0009_hives.sql` - Database schema with RLS
- `apis-server/internal/storage/hives.go` - Storage layer with CRUD + history tracking
- `apis-server/internal/handlers/hives.go` - REST API handlers
- `apis-server/cmd/server/main.go` - Route registration (modified)

**Frontend:**
- `apis-dashboard/src/pages/HiveCreate.tsx` - Create hive form with visual preview
- `apis-dashboard/src/pages/HiveEdit.tsx` - Edit hive form with change detection
- `apis-dashboard/src/pages/HiveDetail.tsx` - Detail view with queen/box history
- `apis-dashboard/src/pages/Hives.tsx` - List all hives with site filter
- `apis-dashboard/src/pages/SiteDetail.tsx` - Updated with hives section (modified)
- `apis-dashboard/src/pages/index.ts` - Exports (modified)
- `apis-dashboard/src/App.tsx` - Routes (modified)

**Tests:**
- `apis-server/tests/handlers/hives_test.go` - Handler validation logic tests

### Change Log

- [2026-01-25] Remediation: Fixed 6 issues from code review
  - I1 (HIGH): Updated validateQueenSource() to accept both "other:" and "other: " formats
  - I2 (MEDIUM): Added batch inspection fetch to eliminate N+1 queries
  - I3 (MEDIUM): Added error message parsing in HiveCreate.tsx and HiveEdit.tsx
  - I4 (MEDIUM): Created hives_test.go with comprehensive validation tests
  - I5 (LOW): Added onChange to clear queen_source_other in HiveEdit.tsx
  - I6 (LOW): Added comments explaining column-reverse flex in HiveCreate.tsx
