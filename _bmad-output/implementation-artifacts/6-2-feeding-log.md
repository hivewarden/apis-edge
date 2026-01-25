# Story 6.2: Feeding Log

Status: done

## Story

As a **beekeeper**,
I want to log when I feed my hives,
so that I can track feeding history and consumption.

## Acceptance Criteria

1. **Given** I am on a hive detail page **When** I click "Log Feeding" **Then** a form appears with fields:
   - Date (default: today)
   - Hive(s) - multi-select to apply to multiple hives
   - Feed type (Sugar syrup, Fondant, Pollen patty, Pollen substitute, Honey, Custom...)
   - Amount (number + unit: kg or liters)
   - Concentration (for syrup: 1:1, 2:1, custom ratio)
   - Notes

2. **Given** I log a syrup feeding **When** I select "Sugar syrup" **Then**:
   - The concentration field appears
   - I can select 1:1 (stimulative) or 2:1 (winter prep) or enter custom

3. **Given** I view feeding history **When** the list loads **Then**:
   - I see all feedings with date, type, amount
   - Totals per season: "Total fed this season: 12kg syrup, 2kg fondant"

4. **Given** I want to see feeding vs weight correlation **When** I view the hive's charts (if scale data available) **Then**:
   - Feeding events are marked on the weight chart
   - *(Note: Scale data is future scope - Epic 8+; this AC is deferred)*

## Tasks / Subtasks

### Task 1: Database Schema (AC: #1, #2, #3)
- [x] 1.1 Create migration `0012_feedings.sql` with `feedings` table
- [x] 1.2 Add indexes for tenant_id, hive_id, fed_at lookups
- [x] 1.3 Add RLS policy for tenant isolation
- [x] 1.4 Test migration runs cleanly

### Task 2: Backend Storage Layer (AC: #1, #2, #3)
- [x] 2.1 Create `internal/storage/feedings.go` with CRUD operations
- [x] 2.2 Implement `CreateFeeding`, `ListFeedingsByHive`, `GetFeedingByID`
- [x] 2.3 Implement `UpdateFeeding` for editing records
- [x] 2.4 Implement `DeleteFeeding`
- [x] 2.5 Implement `CreateFeedingsForMultipleHives` for batch creation
- [x] 2.6 Implement `GetFeedingSeasonTotals` for season aggregation

### Task 3: Backend API Handlers (AC: #1, #2, #3)
- [x] 3.1 Create `internal/handlers/feedings.go` with REST endpoints
- [x] 3.2 Implement `POST /api/feedings` - Create feeding(s) (supports multi-hive)
- [x] 3.3 Implement `GET /api/hives/{hive_id}/feedings` - List feedings for hive
- [x] 3.4 Implement `GET /api/hives/{hive_id}/feedings/season-totals` - Get season totals
- [x] 3.5 Implement `GET /api/feedings/{id}` - Get single feeding
- [x] 3.6 Implement `PUT /api/feedings/{id}` - Update feeding
- [x] 3.7 Implement `DELETE /api/feedings/{id}` - Delete feeding
- [x] 3.8 Register routes in main.go

### Task 4: Frontend - Feeding Form Modal (AC: #1, #2)
- [x] 4.1 Create `FeedingFormModal.tsx` component
- [x] 4.2 Implement multi-hive selection (same pattern as TreatmentFormModal)
- [x] 4.3 Add feed type dropdown with built-in options
- [x] 4.4 Add amount + unit inputs (number + dropdown: kg/liters)
- [x] 4.5 Add conditional concentration field (shows only for syrup types)
- [x] 4.6 Add notes field
- [x] 4.7 Form validation and submission

### Task 5: Frontend - Feeding History Card (AC: #3)
- [x] 5.1 Create `FeedingHistoryCard.tsx` component for hive detail page
- [x] 5.2 Display feedings in table/list format with date, type, amount
- [x] 5.3 Display season totals at bottom ("Total fed this season: X kg syrup...")
- [x] 5.4 Add "Log Feeding" button
- [x] 5.5 Add edit/delete actions per row

### Task 6: Frontend - HiveDetail Integration (AC: #1, #2, #3)
- [x] 6.1 Add FeedingHistoryCard to HiveDetail.tsx
- [x] 6.2 Wire up "Log Feeding" button to open modal
- [x] 6.3 Handle refetch after create/edit/delete

### Task 7: Routing and Hooks (AC: #1, #2, #3)
- [x] 7.1 Create `useFeedings.ts` hook for data fetching
- [x] 7.2 Add type definitions for Feeding, CreateFeedingInput, etc.
- [x] 7.3 Export from hooks/index.ts and components/index.ts

## Dev Notes

### Architecture Patterns (from CLAUDE.md and architecture.md)

**Database Schema** (from architecture.md:292-302):
```sql
-- Feedings
CREATE TABLE feedings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
    fed_at DATE NOT NULL,
    feed_type TEXT NOT NULL,
    amount DECIMAL(10, 2),
    unit TEXT NOT NULL DEFAULT 'kg',         -- 'kg' or 'liters'
    concentration TEXT,                       -- e.g., '1:1', '2:1', null for non-syrup
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policy
ALTER TABLE feedings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON feedings
    USING (tenant_id = current_setting('app.tenant_id'));

CREATE INDEX idx_feedings_tenant ON feedings(tenant_id);
CREATE INDEX idx_feedings_hive ON feedings(hive_id);
CREATE INDEX idx_feedings_date ON feedings(hive_id, fed_at DESC);
```

**Handler Pattern** (follow `treatments.go` exactly):
```go
// Follow the exact pattern from treatments.go:
// - Use storage.RequireConn(r.Context()) for DB connection
// - Use middleware.GetTenantID(r.Context()) for multi-tenant
// - Use chi.URLParam(r, "id") for route params
// - Use respondJSON/respondError for responses
// - Use zerolog for structured logging
```

**API Response Format** (from architecture.md):
```json
// Success (single)
{"data": {...}}

// Success (list)
{"data": [...], "meta": {"total": N}}

// Error
{"error": "message", "code": 404}
```

**Frontend Patterns** (copy from TreatmentFormModal.tsx):
- Use Ant Design components (Form, Modal, Select, InputNumber, DatePicker)
- Follow modal pattern from TreatmentFormModal.tsx exactly
- Use the APIS theme colors from `theme/apisTheme.ts`
- Use custom hooks for data fetching (copy useTreatments.ts structure)

### Feed Types (Built-in)

```typescript
const FEED_TYPES = [
  { value: 'sugar_syrup', label: 'Sugar Syrup', hasConcentration: true },
  { value: 'fondant', label: 'Fondant', hasConcentration: false },
  { value: 'pollen_patty', label: 'Pollen Patty', hasConcentration: false },
  { value: 'pollen_substitute', label: 'Pollen Substitute', hasConcentration: false },
  { value: 'honey', label: 'Honey', hasConcentration: false },
  { value: 'other', label: 'Other', hasConcentration: false },
];
```

### Feed Units

```typescript
const FEED_UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'liters', label: 'liters' },
];
```

### Syrup Concentration Options

```typescript
const CONCENTRATION_OPTIONS = [
  { value: '1:1', label: '1:1 (Light/Stimulative)' },
  { value: '2:1', label: '2:1 (Heavy/Winter Prep)' },
  { value: 'custom', label: 'Custom...' },
];
```

### Multi-Hive Support

When creating a feeding with multiple hives (same pattern as treatments):
1. Frontend sends `hive_ids: string[]` array
2. Backend creates one feeding record per hive
3. Each record has same feeding details but different `hive_id`
4. Response returns array of created feedings

### Season Totals Calculation

Season is determined by beekeeping year (April 1 to March 31):
```go
// GetFeedingSeasonTotals returns totals grouped by feed_type for current season
func GetFeedingSeasonTotals(ctx context.Context, conn *pgxpool.Conn, hiveID string) (map[string]SeasonTotal, error) {
    // Season starts April 1, ends March 31 next year
    now := time.Now()
    var seasonStart time.Time
    if now.Month() >= time.April {
        seasonStart = time.Date(now.Year(), time.April, 1, 0, 0, 0, 0, time.UTC)
    } else {
        seasonStart = time.Date(now.Year()-1, time.April, 1, 0, 0, 0, 0, time.UTC)
    }

    // SQL: SELECT feed_type, unit, SUM(amount) as total FROM feedings
    //      WHERE hive_id = $1 AND fed_at >= $2 GROUP BY feed_type, unit
}

type SeasonTotal struct {
    FeedType string  `json:"feed_type"`
    Unit     string  `json:"unit"`
    Total    float64 `json:"total"`
}
```

### API Endpoints

```
POST   /api/feedings                         - Create feeding(s)
GET    /api/hives/{hive_id}/feedings        - List feedings for hive
GET    /api/hives/{hive_id}/feedings/season-totals - Season totals
GET    /api/feedings/{id}                   - Get single feeding
PUT    /api/feedings/{id}                   - Update feeding
DELETE /api/feedings/{id}                   - Delete feeding
```

### Create Request Body

```json
{
  "hive_ids": ["hive-1", "hive-2"],
  "fed_at": "2026-01-24",
  "feed_type": "sugar_syrup",
  "amount": 2.5,
  "unit": "liters",
  "concentration": "2:1",
  "notes": "Winter prep feeding"
}
```

### Season Totals Response

```json
{
  "data": [
    { "feed_type": "sugar_syrup", "unit": "liters", "total": 12.5 },
    { "feed_type": "fondant", "unit": "kg", "total": 2.0 }
  ]
}
```

### Project Structure Notes

**Backend files to create:**
- `apis-server/internal/storage/migrations/0012_feedings.sql`
- `apis-server/internal/storage/feedings.go`
- `apis-server/internal/handlers/feedings.go`

**Frontend files to create:**
- `apis-dashboard/src/components/FeedingFormModal.tsx`
- `apis-dashboard/src/components/FeedingHistoryCard.tsx`
- `apis-dashboard/src/hooks/useFeedings.ts`

**Files to modify:**
- `apis-server/cmd/server/main.go` (add feeding routes)
- `apis-dashboard/src/pages/HiveDetail.tsx` (integrate feeding components)
- `apis-dashboard/src/components/index.ts` (exports)
- `apis-dashboard/src/hooks/index.ts` (exports)

### Previous Story Intelligence (from 6.1 Treatment Log)

**Learnings to apply:**
1. Treatment form modal pattern works well - copy structure exactly
2. Multi-hive selection checkbox pattern is user-friendly
3. Season totals should show in the history card footer
4. Use same modal width (520px) and spacing patterns
5. TreatmentHistoryCard works well as a compact table - replicate for feedings

**Code review feedback to avoid:**
- Don't leave dead code (unused helper functions)
- Mark all task checkboxes when complete
- Verify multi-hive selection is properly wired (fetch site hives)

**Files created in 6.1 to reference:**
- `useTreatments.ts` - Copy hook structure exactly
- `TreatmentFormModal.tsx` - Copy form structure, swap fields
- `TreatmentHistoryCard.tsx` - Copy table structure
- `treatments.go` (storage) - Copy CRUD pattern exactly
- `treatments.go` (handlers) - Copy REST pattern exactly

### Key Differences from Treatments

| Aspect | Treatments | Feedings |
|--------|-----------|----------|
| Date field | `treated_at` | `fed_at` |
| Type field | `treatment_type` | `feed_type` |
| Unique fields | `method`, `dose`, `mite_count_*`, `weather` | `amount`, `unit`, `concentration` |
| Conditional UI | None | Concentration shows for syrup only |
| Aggregation | Efficacy calculation | Season totals |

### Conditional Concentration Logic (Frontend)

```typescript
// In FeedingFormModal.tsx
const [showConcentration, setShowConcentration] = useState(false);

const handleFeedTypeChange = (value: string) => {
  const feedType = FEED_TYPES.find(t => t.value === value);
  setShowConcentration(feedType?.hasConcentration ?? false);

  // Clear concentration if switching to non-syrup type
  if (!feedType?.hasConcentration) {
    form.setFieldsValue({ concentration: undefined });
  }
};
```

### References

- [Source: architecture.md#Data-Model] - Feedings table schema
- [Source: epics.md#Story-6.2] - Full acceptance criteria
- [Source: treatments.go] - Handler pattern reference (storage + handlers)
- [Source: useTreatments.ts] - Hook pattern reference
- [Source: TreatmentFormModal.tsx] - Modal pattern reference
- [Source: TreatmentHistoryCard.tsx] - Card pattern reference
- [Source: HiveDetail.tsx] - Frontend integration point

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - No debug issues encountered

### Completion Notes List

- All 7 tasks completed successfully
- Backend: Migration, storage layer with full CRUD + season totals, handlers with all REST endpoints
- Frontend: FeedingFormModal with conditional concentration field, FeedingHistoryCard with season totals display
- Integration: HiveDetail page now shows feeding history below treatment history
- Uses shopspring/decimal for precise amount handling
- Season calculation follows beekeeping year (Apr 1 - Mar 31)
- Multi-hive selection uses same pattern as TreatmentFormModal
- All existing tests pass (Go: 8 packages, Frontend: 67 tests)

### File List

**New files:**
- apis-server/internal/storage/migrations/0012_feedings.sql
- apis-server/internal/storage/feedings.go
- apis-server/internal/handlers/feedings.go
- apis-dashboard/src/components/FeedingFormModal.tsx
- apis-dashboard/src/components/FeedingHistoryCard.tsx
- apis-dashboard/src/hooks/useFeedings.ts

**Modified files:**
- apis-server/cmd/server/main.go (added feeding routes)
- apis-dashboard/src/pages/HiveDetail.tsx (integrated feeding components)
- apis-dashboard/src/components/index.ts (added exports)
- apis-dashboard/src/hooks/index.ts (added exports)

## Change Log

- 2026-01-24: Initial implementation of Story 6.2 - Feeding Log complete
- 2026-01-25: Code review fixes applied (6 issues):
  1. [HIGH] Multi-hive creation now uses database transaction for atomicity
  2. [LOW] Removed unused `_selectedFeeding` state variable
  3. [MEDIUM] Implemented edit feeding functionality (was stub)
  4. [MEDIUM] Server now clears concentration for non-syrup feed types
  5. [MEDIUM] Added amount > 0 validation in handler
  6. [LOW] Fixed inconsistent row expansion messaging in FeedingHistoryCard
- 2026-01-25: Remediation round 2 - Fixed 4 issues from bulk code review:
  1. [MEDIUM] UpdateFeeding handler now clears concentration for non-syrup types (mirrors CreateFeeding logic)
  2. [MEDIUM] UpdateFeeding handler now validates amount > 0
  3. [MEDIUM] Created unit tests: tests/handlers/feedings_test.go, tests/storage/feedings_test.go
  4. [LOW] Fixed redundant ternary in FeedingFormModal.tsx line 241
