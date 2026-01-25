# Story 6.4: Equipment Log

Status: done

## Story

As a **beekeeper**,
I want to track equipment I add or remove from hives,
so that I know what's installed on each hive.

## Acceptance Criteria

1. **Given** I am on a hive detail page **When** I click "Log Equipment" **Then** a form appears with:
   - Equipment type (Entrance reducer, Mouse guard, Queen excluder, Robbing screen, Feeder, Custom...)
   - Action (Installed / Removed)
   - Date
   - Notes

2. **Given** I log equipment installation **When** I save **Then** the equipment appears in the hive's "Currently Installed" list

3. **Given** I remove equipment **When** I log removal **Then**:
   - It moves from "Currently Installed" to "Equipment History"
   - Shows duration: "Mouse guard: Nov 1 - Mar 15 (135 days)"

4. **Given** I view a hive's equipment status **When** the page loads **Then** I see two sections:
   - Currently Installed (with remove buttons)
   - Equipment History (with dates and durations)

5. **Given** I install seasonal equipment (e.g., mouse guard) **When** the next season approaches **Then** I can see equipment recommendations based on last year (deferred to future story)

## Tasks / Subtasks

### Task 1: Database Migration (AC: #1, #2, #3, #4)
- [x] 1.1 Create migration `0014_equipment_logs.sql` with `equipment_logs` table
- [x] 1.2 Add indexes for tenant_id, hive_id, logged_at lookups
- [x] 1.3 Add composite index for currently-installed queries (hive_id, equipment_type, action)
- [x] 1.4 Test migration runs cleanly

### Task 2: Backend Storage Layer (AC: #1, #2, #3, #4)
- [x] 2.1 Create `internal/storage/equipment.go` with Equipment struct and CRUD operations
- [x] 2.2 Implement `CreateEquipmentLog` - insert new equipment log record
- [x] 2.3 Implement `ListEquipmentByHive` - return all logs for a hive (ordered by logged_at DESC)
- [x] 2.4 Implement `GetEquipmentByID` - return single log
- [x] 2.5 Implement `UpdateEquipmentLog` and `DeleteEquipmentLog`
- [x] 2.6 Implement `GetCurrentlyInstalledByHive` - return equipment with 'installed' action that has no matching 'removed' action
- [x] 2.7 Implement `GetEquipmentHistoryByHive` - return equipment that has both 'installed' and 'removed' actions with duration

### Task 3: Backend API Handlers (AC: #1, #2, #3, #4)
- [x] 3.1 Create `internal/handlers/equipment.go` with REST endpoints
- [x] 3.2 Implement `POST /api/hives/{hive_id}/equipment` - Create equipment log
- [x] 3.3 Implement `GET /api/hives/{hive_id}/equipment` - List all equipment logs for hive
- [x] 3.4 Implement `GET /api/hives/{hive_id}/equipment/current` - Get currently installed equipment
- [x] 3.5 Implement `GET /api/equipment/{id}` - Get single equipment log
- [x] 3.6 Implement `PUT /api/equipment/{id}` - Update equipment log
- [x] 3.7 Implement `DELETE /api/equipment/{id}` - Delete equipment log
- [x] 3.8 Register routes in main.go

### Task 4: Frontend - Equipment Form Modal (AC: #1)
- [x] 4.1 Create `EquipmentFormModal.tsx` component
- [x] 4.2 Add equipment type select with built-in options (Entrance reducer, Mouse guard, Queen excluder, Robbing screen, Feeder)
- [x] 4.3 Add action radio (Installed / Removed)
- [x] 4.4 Add date picker (default: today)
- [x] 4.5 Add notes textarea
- [x] 4.6 Implement submit handler with proper API call
- [x] 4.7 Support edit mode for updating existing logs

### Task 5: Frontend - Equipment Status Card (AC: #2, #3, #4)
- [x] 5.1 Create `EquipmentStatusCard.tsx` component
- [x] 5.2 Display "Currently Installed" section with equipment list
- [x] 5.3 Add "Remove" action button that opens modal with pre-filled equipment type
- [x] 5.4 Display "Equipment History" section with past equipment
- [x] 5.5 Calculate and display duration for historical items (e.g., "135 days")
- [x] 5.6 Add "Log Equipment" button to open form modal
- [x] 5.7 Add edit/delete actions for each log entry

### Task 6: Frontend - HiveDetail Integration (AC: #1, #2, #3, #4)
- [x] 6.1 Import and add EquipmentStatusCard to HiveDetail.tsx
- [x] 6.2 Wire up state and handlers for equipment operations
- [x] 6.3 Handle equipment refresh after create/update/delete

### Task 7: Frontend - Hooks and Types (AC: #1, #2, #3, #4)
- [x] 7.1 Create `useEquipment.ts` hook for data fetching
- [x] 7.2 Add type definitions for EquipmentLog, CreateEquipmentInput, etc.
- [x] 7.3 Export from hooks/index.ts and components/index.ts

## Dev Notes

### Database Schema

**Table: `equipment_logs`** (from epics.md:1847-1850, adapted from architecture.md:316-325)

```sql
-- Equipment Log (tracks equipment installed/removed from hives)
CREATE TABLE equipment_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    equipment_type TEXT NOT NULL,           -- 'entrance_reducer', 'mouse_guard', 'queen_excluder', etc.
    action TEXT NOT NULL,                   -- 'installed' or 'removed'
    logged_at DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policy
ALTER TABLE equipment_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON equipment_logs
    USING (tenant_id = current_setting('app.tenant_id'));

-- Indexes
CREATE INDEX idx_equipment_logs_tenant ON equipment_logs(tenant_id);
CREATE INDEX idx_equipment_logs_hive ON equipment_logs(hive_id);
CREATE INDEX idx_equipment_logs_hive_date ON equipment_logs(hive_id, logged_at DESC);
CREATE INDEX idx_equipment_logs_currently_installed ON equipment_logs(hive_id, equipment_type, action);
```

**Key difference from architecture.md schema:** Using `equipment_logs` (action-based) instead of `equipment_log` (with installed_at/removed_at). This matches the epics.md requirement for logging install/remove as separate events.

### Built-in Equipment Types

```typescript
export const EQUIPMENT_TYPES = [
  { value: 'entrance_reducer', label: 'Entrance Reducer' },
  { value: 'mouse_guard', label: 'Mouse Guard' },
  { value: 'queen_excluder', label: 'Queen Excluder' },
  { value: 'robbing_screen', label: 'Robbing Screen' },
  { value: 'feeder', label: 'Feeder' },
  { value: 'top_feeder', label: 'Top Feeder' },
  { value: 'bottom_board', label: 'Bottom Board' },
  { value: 'slatted_rack', label: 'Slatted Rack' },
  { value: 'inner_cover', label: 'Inner Cover' },
  { value: 'outer_cover', label: 'Outer Cover' },
  { value: 'hive_beetle_trap', label: 'Hive Beetle Trap' },
] as const;

export const EQUIPMENT_ACTIONS = [
  { value: 'installed', label: 'Installed' },
  { value: 'removed', label: 'Removed' },
] as const;
```

### API Endpoints

```
POST   /api/hives/{hive_id}/equipment          - Create equipment log
GET    /api/hives/{hive_id}/equipment          - List all equipment logs
GET    /api/hives/{hive_id}/equipment/current  - Get currently installed
GET    /api/hives/{hive_id}/equipment/history  - Get equipment history (install/remove pairs)
GET    /api/equipment/{id}                     - Get single log
PUT    /api/equipment/{id}                     - Update log
DELETE /api/equipment/{id}                     - Delete log
```

### Request/Response Formats

**Create Equipment Log Request:**
```json
{
  "equipment_type": "mouse_guard",
  "action": "installed",
  "logged_at": "2026-11-01",
  "notes": "Overwintering preparation"
}
```

**Equipment Log Response:**
```json
{
  "data": {
    "id": "equip-123",
    "hive_id": "hive-456",
    "equipment_type": "mouse_guard",
    "action": "installed",
    "logged_at": "2026-11-01",
    "notes": "Overwintering preparation",
    "created_at": "2026-11-01T10:30:00Z"
  }
}
```

**Currently Installed Response:**
```json
{
  "data": [
    {
      "id": "equip-123",
      "equipment_type": "mouse_guard",
      "equipment_label": "Mouse Guard",
      "installed_at": "2026-11-01",
      "days_installed": 45
    },
    {
      "id": "equip-124",
      "equipment_type": "entrance_reducer",
      "equipment_label": "Entrance Reducer",
      "installed_at": "2026-10-15",
      "days_installed": 62
    }
  ]
}
```

**Equipment History Response:**
```json
{
  "data": [
    {
      "equipment_type": "queen_excluder",
      "equipment_label": "Queen Excluder",
      "installed_at": "2026-05-10",
      "removed_at": "2026-09-20",
      "duration_days": 133,
      "notes": "Season use"
    }
  ]
}
```

### Currently Installed Logic

**Important:** "Currently installed" means equipment with an 'installed' action that has no subsequent 'removed' action for the same equipment_type on the same hive.

```sql
-- Get currently installed equipment for a hive
WITH latest_actions AS (
    SELECT DISTINCT ON (equipment_type)
        id, hive_id, equipment_type, action, logged_at, notes, created_at
    FROM equipment_logs
    WHERE hive_id = $1
    ORDER BY equipment_type, logged_at DESC, created_at DESC
)
SELECT * FROM latest_actions WHERE action = 'installed';
```

### Duration Calculation

```go
// Calculate duration between install and removal
func calculateDuration(installedAt, removedAt time.Time) int {
    return int(removedAt.Sub(installedAt).Hours() / 24)
}

// Format duration for display
// "Mouse guard: Nov 1 - Mar 15 (135 days)"
```

```typescript
// Frontend duration formatting
const formatDuration = (days: number): string => {
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.floor(days / 30)} months`;
  return `${Math.floor(days / 365)} years, ${Math.floor((days % 365) / 30)} months`;
};
```

### Handler Pattern (follow treatments.go exactly)

```go
// Follow the exact pattern from treatments.go:
// - Use storage.RequireConn(r.Context()) for DB connection
// - Use middleware.GetTenantID(r.Context()) for multi-tenant
// - Use chi.URLParam(r, "hive_id") for route params
// - Use respondJSON/respondError for responses
// - Use zerolog for structured logging
```

### Frontend Component Pattern

**Follow TreatmentFormModal.tsx structure:**
- Modal with 520px width
- Form.Item with proper validation
- Select for equipment type
- Radio.Group for action (Installed/Removed)
- DatePicker with today default
- Input.TextArea for notes
- Cancel/Submit buttons

**Follow TreatmentHistoryCard.tsx structure for EquipmentStatusCard:**
- Card with title and action button
- Two sections: Currently Installed, Equipment History
- Table with columns: Equipment, Date, Duration, Notes, Actions
- Edit/Delete action buttons per row

### Project Structure Notes

**Backend files to create:**
- `apis-server/internal/storage/migrations/0014_equipment_logs.sql`
- `apis-server/internal/storage/equipment.go`
- `apis-server/internal/handlers/equipment.go`

**Frontend files to create:**
- `apis-dashboard/src/components/EquipmentFormModal.tsx`
- `apis-dashboard/src/components/EquipmentStatusCard.tsx`
- `apis-dashboard/src/hooks/useEquipment.ts`

**Files to modify:**
- `apis-server/cmd/server/main.go` (add equipment routes)
- `apis-dashboard/src/pages/HiveDetail.tsx` (integrate equipment components)
- `apis-dashboard/src/components/index.ts` (exports)
- `apis-dashboard/src/hooks/index.ts` (exports)

### Previous Story Intelligence (from 6.1, 6.2, 6.3)

**Patterns to follow:**
1. Multi-step CRUD pattern works well - use exact same structure
2. Form modal width: 520px, with Form.useForm hook
3. Use dayjs for all date handling (not toLocaleDateString)
4. Transaction not needed for single-table inserts (unlike harvests which has junction table)
5. History cards should show season totals where applicable
6. Edit mode button text should change ("Log Equipment" → "Update Equipment")

**Code review feedback to apply:**
- Don't leave dead code or unused helper functions
- Always validate inputs server-side
- Wire up edit functionality completely (not just stub)
- No emojis in user-facing text (per project standards)

**Files to reference for patterns:**
- `useTreatments.ts` - Copy hook structure exactly
- `TreatmentFormModal.tsx` - Copy form structure, adapt fields
- `TreatmentHistoryCard.tsx` - Copy card structure, adapt for dual-section display
- `treatments.go` (storage) - Copy CRUD pattern
- `treatments.go` (handlers) - Copy REST pattern

### Key Differences from Treatments

| Aspect | Treatments | Equipment |
|--------|------------|-----------|
| Date field | `treated_at` | `logged_at` |
| Main table | `treatments` | `equipment_logs` |
| Key field | `treatment_type` | `equipment_type` + `action` |
| Display | Simple list | Dual-section (Current + History) |
| Duration | N/A | Calculate from install to remove |
| Multi-hive | Yes | No (equipment is hive-specific) |

### IMPORTANT: Frontend Skill Usage

**This story has frontend components.** When implementing Tasks 4-7, use the `/frontend-design` skill for:
- EquipmentFormModal.tsx
- EquipmentStatusCard.tsx

This ensures high-quality, distinctive UI matching the APIS design system.

### References

- [Source: epics.md#Story-6.4] - Full acceptance criteria and technical notes
- [Source: architecture.md#equipment_log] - Original schema (modified for action-based tracking)
- [Source: architecture.md#API-Endpoints] - Equipment REST API specification
- [Source: ux-design-specification.md#Equipment-Log] - Equipment tracking table design
- [Source: treatments.go] - Handler and storage pattern reference
- [Source: TreatmentFormModal.tsx] - Modal pattern reference
- [Source: HiveDetail.tsx] - Frontend integration point

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - implementation proceeded without issues.

### Completion Notes List

- Created database migration with equipment_logs table, RLS policies, and indexes
- Implemented storage layer with EquipmentLog struct and CRUD operations plus currently-installed and history queries
- Created REST API handlers with proper validation for equipment types and actions
- Built EquipmentFormModal component with support for create, edit, and quick-remove modes
- Built EquipmentStatusCard component with Currently Installed and Equipment History sections
- Created useEquipment hook for state management with parallel API fetches
- Integrated into HiveDetail page with all CRUD operations wired up
- All tests pass (67 frontend, Go backend tests)

**Code Review Fixes (2026-01-25):**
- [HIGH] Added "Custom..." option to equipment type dropdown per AC#1 requirement
- [MEDIUM] Added duplicate installation prevention (cannot install same equipment twice without removal)
- [MEDIUM] Added removal validation (cannot remove equipment that isn't installed)
- [MEDIUM] Fixed equipment history sort order (now sorted by removal date descending)

### File List

**New files:**
- apis-server/internal/storage/migrations/0014_equipment_logs.sql
- apis-server/internal/storage/equipment.go
- apis-server/internal/handlers/equipment.go
- apis-dashboard/src/hooks/useEquipment.ts
- apis-dashboard/src/components/EquipmentFormModal.tsx
- apis-dashboard/src/components/EquipmentStatusCard.tsx

**Modified files:**
- apis-server/cmd/server/main.go (added equipment routes)
- apis-dashboard/src/pages/HiveDetail.tsx (integrated equipment components)
- apis-dashboard/src/hooks/index.ts (added useEquipment export)
- apis-dashboard/src/components/index.ts (added equipment component exports)

## Change Log

- 2026-01-25: Implemented Story 6.4 Equipment Log - full CRUD for equipment tracking with dual-view UI (Currently Installed + Equipment History)
- 2026-01-25: Remediation: Fixed 7 issues from code review (tests, consistency validation, notes validation, rowKey, docs, formatDuration, notes tooltip)

