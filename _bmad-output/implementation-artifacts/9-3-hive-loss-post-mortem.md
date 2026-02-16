# Story 9.3: Hive Loss Post-Mortem

Status: done

## Story

As a **beekeeper**,
I want guidance when I lose a hive,
So that I can document what happened and learn for next time.

## Acceptance Criteria

1. **Post-mortem wizard initiation** - When I click "Mark as Lost" on a hive, a post-mortem wizard begins with empathetic tone:
   - Opening message: "We're sorry about your loss. Recording what happened can help in the future."
   - Warm, supportive tone throughout (not clinical)
   - Uses Honey Beegood color palette (seaBuckthorn, salomie, coconutCream)

2. **Wizard step progression** - The wizard guides through 5 steps:
   - Step 1: When was the loss discovered? (date picker, defaults to today)
   - Step 2: What do you think happened? (dropdown: Starvation, Varroa, Queen failure, Pesticide exposure, Swarming, Robbing, Unknown, Other)
   - Step 3: What did you observe? (symptoms checklist + optional notes textarea)
   - Step 4: Could anything have been done differently? (optional reflection textarea)
   - Step 5: Do you want to keep this hive's data for reference? (radio: Archive vs Delete, default Archive)

3. **Symptoms checklist options** - Step 3 provides common symptoms:
   - No bees remaining
   - Dead bees at entrance/inside
   - Deformed wings visible
   - Evidence of robbing (wax debris)
   - Moldy frames
   - Empty honey stores
   - Dead brood pattern
   - Chalk brood visible
   - Small hive beetle evidence
   - Wax moth damage
   - Custom note (textarea)

4. **Post-mortem record creation** - On wizard completion:
   - Hive status updated to "lost" with loss date
   - Post-mortem record created in `hive_losses` table
   - Data preserved (archived) by default
   - Success message: "Your records have been saved. This experience will help you care for future hives."

5. **Lost hives filter** - View archived/lost hives:
   - Hives page includes filter toggle: "Show lost hives"
   - Lost hives displayed with visual indicator (muted styling, "Lost" badge)
   - Click on lost hive shows post-mortem summary
   - Lost hives hidden from main hive list by default

6. **Loss pattern comparison** - When viewing lost hives:
   - Display post-mortem summary for each lost hive
   - Show cause, date, and key symptoms
   - Enable BeeBrain to analyze loss patterns (data structure ready)

## Tasks / Subtasks

### Backend Tasks

- [x] **Task 1: Create hive_losses table and migration** (AC: #4, #6)
  - [x] 1.1 Create migration `0018_hive_losses.sql`:
    ```sql
    -- Hive losses table for post-mortem records
    CREATE TABLE IF NOT EXISTS hive_losses (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
        discovered_at DATE NOT NULL,
        cause TEXT NOT NULL,  -- 'starvation', 'varroa', 'queen_failure', 'pesticide', 'swarming', 'robbing', 'unknown', 'other'
        cause_other TEXT,     -- If cause is 'other', user can specify
        symptoms TEXT[],      -- Array of symptom codes
        symptoms_notes TEXT,  -- Free text notes about observations
        reflection TEXT,      -- Optional: what could have been done differently
        data_choice TEXT NOT NULL DEFAULT 'archive',  -- 'archive' or 'delete'
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_hive_losses_tenant ON hive_losses(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_hive_losses_hive ON hive_losses(hive_id);
    CREATE INDEX IF NOT EXISTS idx_hive_losses_cause ON hive_losses(tenant_id, cause);
    CREATE INDEX IF NOT EXISTS idx_hive_losses_date ON hive_losses(tenant_id, discovered_at DESC);

    -- Enable RLS
    ALTER TABLE hive_losses ENABLE ROW LEVEL SECURITY;

    -- RLS policy
    DROP POLICY IF EXISTS hive_losses_tenant_isolation ON hive_losses;
    CREATE POLICY hive_losses_tenant_isolation ON hive_losses
        USING (tenant_id = current_setting('app.tenant_id', true));
    ```
  - [x] 1.2 Add `status` column to hives table if not exists:
    ```sql
    -- Add status column to hives table
    ALTER TABLE hives ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'lost', 'archived'));
    ALTER TABLE hives ADD COLUMN IF NOT EXISTS lost_at DATE;

    -- Index for filtering by status
    CREATE INDEX IF NOT EXISTS idx_hives_status ON hives(tenant_id, status);
    ```

- [x] **Task 2: Create hive_losses storage layer** (AC: #4, #6)
  - [x] 2.1 Create `apis-server/internal/storage/hive_losses.go`:
    - Define `HiveLoss` struct with all fields
    - Define `CreateHiveLossInput` struct
    - Define valid cause constants: `CauseStarvation`, `CauseVarroa`, etc.
    - Define valid symptom constants
  - [x] 2.2 Implement `CreateHiveLoss(ctx, conn, tenantID, input) (*HiveLoss, error)`
  - [x] 2.3 Implement `GetHiveLossByHiveID(ctx, conn, hiveID) (*HiveLoss, error)`
  - [x] 2.4 Implement `ListHiveLosses(ctx, conn) ([]HiveLoss, error)`
  - [x] 2.5 Implement `GetHiveLossStats(ctx, conn) (*HiveLossStats, error)` - for BeeBrain analysis

- [x] **Task 3: Update hives storage for status** (AC: #4, #5)
  - [x] 3.1 Update `Hive` struct in `storage/hives.go` to include `Status` and `LostAt` fields
  - [x] 3.2 Add `MarkHiveAsLost(ctx, conn, hiveID, lostAt time.Time) error`
  - [x] 3.3 Add `ListHivesByStatus(ctx, conn, statuses []string) ([]Hive, error)`
  - [x] 3.4 Update existing `ListHives` and `ListHivesBySite` to filter out 'lost' by default
  - [x] 3.5 Add parameter to include lost hives: `ListHivesWithStatus(ctx, conn, includeLost bool) ([]Hive, error)`

- [x] **Task 4: Create hive_losses handler** (AC: #1, #2, #3, #4, #5, #6)
  - [x] 4.1 Create `apis-server/internal/handlers/hive_losses.go`
  - [x] 4.2 Implement `POST /api/hives/{id}/loss` - Create post-mortem record:
    - Accept: `discovered_at`, `cause`, `cause_other`, `symptoms[]`, `symptoms_notes`, `reflection`, `data_choice`
    - Validate cause is valid enum
    - Validate symptoms are valid codes
    - Create hive_losses record
    - Update hive status to 'lost' and set lost_at
    - If data_choice is 'delete', soft-delete related data (set archived flag)
    - Return created HiveLoss with success message
  - [x] 4.3 Implement `GET /api/hives/{id}/loss` - Get post-mortem for a hive
  - [x] 4.4 Implement `GET /api/hive-losses` - List all losses for tenant
  - [x] 4.5 Implement `GET /api/hive-losses/stats` - Get loss statistics for BeeBrain

- [x] **Task 5: Update hives handler for status filtering** (AC: #5)
  - [x] 5.1 Update `ListHives` and `ListHivesBySite` to accept `?include_lost=true` query param
  - [x] 5.2 Update `HiveResponse` to include `status` and `lost_at` fields
  - [x] 5.3 Add `loss_summary` to HiveResponse when status is 'lost' (cause, date)

- [x] **Task 6: Backend tests** (AC: all)
  - [x] 6.1 Create `apis-server/tests/storage/hive_losses_test.go`
  - [x] 6.2 Create `apis-server/tests/handlers/hive_losses_test.go`
  - [x] 6.3 Test hive status transitions
  - [x] 6.4 Test lost hive filtering
  - [x] 6.5 Test post-mortem creation with all fields
  - [x] 6.6 Test loss stats aggregation

### Frontend Tasks

- [x] **Task 7: Create HiveLossWizard component** (AC: #1, #2, #3, #4)
  - [x] 7.1 Create `apis-dashboard/src/components/HiveLossWizard.tsx`:
    - Multi-step wizard using Ant Design `Steps` component
    - Props: `hiveId: string`, `hiveName: string`, `onComplete: () => void`, `onCancel: () => void`
    - Warm, empathetic messaging throughout
    - Honey Beegood styling (coconutCream background, brownBramble text, seaBuckthorn accents)
  - [x] 7.2 Step 1 - Discovery Date:
    - Ant Design `DatePicker` defaulting to today
    - Helper text: "When did you discover the hive was lost?"
  - [x] 7.3 Step 2 - Probable Cause:
    - Ant Design `Select` with predefined options
    - Options: Starvation, Varroa/Mites, Queen Failure, Pesticide Exposure, Swarming, Robbing, Unknown, Other
    - If "Other" selected, show text input for custom cause
  - [x] 7.4 Step 3 - Observed Symptoms:
    - Ant Design `Checkbox.Group` with symptom options
    - Ant Design `TextArea` for additional notes
    - Symptoms grouped logically (bee-related, disease, environmental)
  - [x] 7.5 Step 4 - Reflection:
    - Optional Ant Design `TextArea`
    - Gentle prompt: "Is there anything you might do differently next time? (optional)"
  - [x] 7.6 Step 5 - Data Preservation:
    - Ant Design `Radio.Group`: Archive (recommended) vs Delete
    - Explanation text for each option
    - Archive: "Keep all inspection and treatment records for future reference"
    - Delete: "Remove this hive and its records from your account"
  - [x] 7.7 Completion message:
    - Display warm closing message
    - "Your records have been saved. This experience will help you care for future hives."
    - Close button

- [x] **Task 8: Create useHiveLoss hook** (AC: #4, #5, #6)
  - [x] 8.1 Create `apis-dashboard/src/hooks/useHiveLoss.ts`:
    - `createHiveLoss(hiveId, input)` - Submit post-mortem
    - `getHiveLoss(hiveId)` - Get post-mortem for a hive
    - `useHiveLosses()` - List all losses
    - `useHiveLossStats()` - Get stats for BeeBrain
  - [x] 8.2 Define TypeScript interfaces:
    ```typescript
    interface HiveLoss {
      id: string;
      hive_id: string;
      discovered_at: string;
      cause: string;
      cause_other?: string;
      symptoms: string[];
      symptoms_notes?: string;
      reflection?: string;
      data_choice: 'archive' | 'delete';
      created_at: string;
    }

    interface CreateHiveLossInput {
      discovered_at: string;
      cause: string;
      cause_other?: string;
      symptoms: string[];
      symptoms_notes?: string;
      reflection?: string;
      data_choice: 'archive' | 'delete';
    }
    ```
  - [x] 8.3 Export from `hooks/index.ts`

- [x] **Task 9: Create LostHiveBadge component** (AC: #5)
  - [x] 9.1 Create `apis-dashboard/src/components/LostHiveBadge.tsx`:
    - Small badge component showing "Lost" status
    - Muted styling (gray background, italicized text)
    - Shows loss date on hover
  - [x] 9.2 Export from `components/index.ts`

- [x] **Task 10: Create HiveLossSummary component** (AC: #5, #6)
  - [x] 10.1 Create `apis-dashboard/src/components/HiveLossSummary.tsx`:
    - Card component showing post-mortem summary
    - Displays: cause, date, symptoms, reflection (if provided)
    - Warm, respectful styling (not clinical)
  - [x] 10.2 Export from `components/index.ts`

- [x] **Task 11: Update Hives page for lost hive filtering** (AC: #5)
  - [x] 11.1 Add "Show lost hives" toggle switch to Hives page header
  - [x] 11.2 Update useHives hook to support `includeLost` parameter
  - [x] 11.3 Display lost hives with muted styling when toggle is on
  - [x] 11.4 Show LostHiveBadge on lost hive cards

- [x] **Task 12: Update HiveDetail page for loss flow** (AC: #1, #5)
  - [x] 12.1 Add "Mark as Lost" button to hive actions (only for active hives)
  - [x] 12.2 Button click opens HiveLossWizard modal
  - [x] 12.3 On wizard complete, update UI to show lost status
  - [x] 12.4 If hive is already lost, show HiveLossSummary instead of wizard button

- [x] **Task 13: Frontend tests** (AC: all)
  - [x] 13.1 Create `apis-dashboard/tests/components/HiveLossWizard.test.tsx`
  - [x] 13.2 Create `apis-dashboard/tests/components/HiveLossSummary.test.tsx`
  - [x] 13.3 Create `apis-dashboard/tests/hooks/useHiveLoss.test.ts`
  - [x] 13.4 Test wizard step navigation
  - [x] 13.5 Test form validation (required fields)
  - [x] 13.6 Test completion flow
  - [x] 13.7 Test lost hive filtering on Hives page

## Dev Notes

### What Already Exists (Do NOT Recreate)

**Backend - REUSE these:**
- `storage/hives.go` - Hive CRUD operations, extend with status field
- `handlers/hives.go` - Hive endpoints, extend with status filtering
- `storage/migrations/0009_hives.sql` - Existing hives table structure
- `middleware/tenant.go` - Tenant context extraction
- Standard API response patterns in handlers

**Frontend - EXTEND these:**
- `pages/Hives.tsx` - Hives list page, add filter toggle
- `pages/HiveDetail.tsx` - Hive detail page, add "Mark as Lost" button
- `hooks/useHives.ts` - Existing hive hook, extend with status support
- `theme/apisTheme.ts` - Honey Beegood colors already defined
- `components/index.ts` - Export barrel file

### API Contract

**POST /api/hives/{id}/loss**
```json
Request:
{
  "discovered_at": "2026-01-20",
  "cause": "varroa",
  "cause_other": null,
  "symptoms": ["dead_bees_entrance", "deformed_wings", "empty_stores"],
  "symptoms_notes": "Found cluster of dead bees with clear DWV symptoms",
  "reflection": "Should have treated earlier in August",
  "data_choice": "archive"
}

Response (201):
{
  "data": {
    "id": "uuid",
    "hive_id": "uuid",
    "discovered_at": "2026-01-20",
    "cause": "varroa",
    "symptoms": ["dead_bees_entrance", "deformed_wings", "empty_stores"],
    "symptoms_notes": "Found cluster of dead bees...",
    "reflection": "Should have treated earlier...",
    "data_choice": "archive",
    "created_at": "2026-01-25T10:00:00Z"
  },
  "message": "Your records have been saved. This experience will help you care for future hives."
}
```

**GET /api/hives/{id}/loss**
```json
Response (200):
{
  "data": {
    "id": "uuid",
    "hive_id": "uuid",
    "discovered_at": "2026-01-20",
    "cause": "varroa",
    "cause_display": "Varroa/Mites",
    "symptoms": ["dead_bees_entrance", "deformed_wings", "empty_stores"],
    "symptoms_display": ["Dead bees at entrance", "Deformed wings visible", "Empty honey stores"],
    "symptoms_notes": "...",
    "reflection": "...",
    "data_choice": "archive",
    "created_at": "2026-01-25T10:00:00Z"
  }
}
```

**GET /api/hives?include_lost=true**
```json
Response (200):
{
  "data": [
    {
      "id": "uuid",
      "name": "Hive 1",
      "status": "active",
      ...
    },
    {
      "id": "uuid",
      "name": "Hive 2",
      "status": "lost",
      "lost_at": "2026-01-20",
      "loss_summary": {
        "cause": "varroa",
        "cause_display": "Varroa/Mites",
        "discovered_at": "2026-01-20"
      },
      ...
    }
  ],
  "meta": {"total": 2}
}
```

**GET /api/hive-losses**
```json
Response (200):
{
  "data": [
    {
      "id": "uuid",
      "hive_id": "uuid",
      "hive_name": "Hive 2",
      "discovered_at": "2026-01-20",
      "cause": "varroa",
      "cause_display": "Varroa/Mites",
      "symptoms": ["dead_bees_entrance", "deformed_wings"],
      "created_at": "2026-01-25T10:00:00Z"
    }
  ],
  "meta": {"total": 1}
}
```

**GET /api/hive-losses/stats**
```json
Response (200):
{
  "data": {
    "total_losses": 3,
    "losses_by_cause": {
      "varroa": 2,
      "starvation": 1
    },
    "losses_by_year": {
      "2025": 1,
      "2026": 2
    },
    "common_symptoms": [
      {"symptom": "dead_bees_entrance", "count": 3},
      {"symptom": "empty_stores", "count": 2}
    ]
  }
}
```

### Valid Cause Values

| Value | Display Text |
|-------|--------------|
| `starvation` | Starvation |
| `varroa` | Varroa/Mites |
| `queen_failure` | Queen Failure |
| `pesticide` | Pesticide Exposure |
| `swarming` | Swarming (absconded) |
| `robbing` | Robbing |
| `unknown` | Unknown |
| `other` | Other (specify) |

### Valid Symptom Codes

| Code | Display Text | Category |
|------|--------------|----------|
| `no_bees` | No bees remaining | Bees |
| `dead_bees_entrance` | Dead bees at entrance/inside | Bees |
| `deformed_wings` | Deformed wings visible | Disease |
| `robbing_evidence` | Evidence of robbing (wax debris) | Environmental |
| `moldy_frames` | Moldy frames | Environmental |
| `empty_stores` | Empty honey stores | Stores |
| `dead_brood` | Dead brood pattern | Brood |
| `chalk_brood` | Chalk brood visible | Disease |
| `shb_evidence` | Small hive beetle evidence | Pest |
| `wax_moth` | Wax moth damage | Pest |

### Emotional UX Guidelines (from UX Design Spec)

**Language Tone:**
- Use "loss" not "death" or "failure"
- "We're sorry" not "Error: hive marked as lost"
- "This experience will help" not "Data recorded"
- Gentle prompts, never demanding

**Visual Tone:**
- Muted colors for lost hive displays (gray overlays)
- Warm background colors during wizard (coconutCream)
- No harsh red colors - use muted tones
- Soft shadows, rounded corners

**Flow Design:**
- Never rush the user through the wizard
- Allow skipping optional fields without guilt
- Default to preserving data (archive)
- End on a hopeful note

### Database Changes Summary

1. **New table**: `hive_losses` (id, tenant_id, hive_id, discovered_at, cause, cause_other, symptoms[], symptoms_notes, reflection, data_choice, created_at)
2. **Alter hives table**: Add `status TEXT DEFAULT 'active'`, `lost_at DATE`
3. **New indexes**: idx_hive_losses_tenant, idx_hive_losses_hive, idx_hive_losses_cause, idx_hive_losses_date, idx_hives_status
4. **RLS policy**: hive_losses_tenant_isolation

### Project Structure Notes

**Backend files to create:**
- `apis-server/internal/storage/migrations/0018_hive_losses.sql`
- `apis-server/internal/storage/hive_losses.go`
- `apis-server/internal/handlers/hive_losses.go`
- `apis-server/tests/storage/hive_losses_test.go`
- `apis-server/tests/handlers/hive_losses_test.go`

**Backend files to modify:**
- `apis-server/internal/storage/hives.go` - Add Status, LostAt fields and status methods
- `apis-server/internal/handlers/hives.go` - Add status filtering, loss_summary
- `apis-server/cmd/server/main.go` - Add hive loss routes

**Frontend files to create:**
- `apis-dashboard/src/components/HiveLossWizard.tsx`
- `apis-dashboard/src/components/LostHiveBadge.tsx`
- `apis-dashboard/src/components/HiveLossSummary.tsx`
- `apis-dashboard/src/hooks/useHiveLoss.ts`
- `apis-dashboard/tests/components/HiveLossWizard.test.tsx`
- `apis-dashboard/tests/components/HiveLossSummary.test.tsx`
- `apis-dashboard/tests/hooks/useHiveLoss.test.ts`

**Frontend files to modify:**
- `apis-dashboard/src/components/index.ts` - Export new components
- `apis-dashboard/src/hooks/index.ts` - Export useHiveLoss
- `apis-dashboard/src/hooks/useHives.ts` - Add includeLost parameter
- `apis-dashboard/src/pages/Hives.tsx` - Add filter toggle, lost hive display
- `apis-dashboard/src/pages/HiveDetail.tsx` - Add "Mark as Lost" button, wizard integration

### Testing Standards

**Go Tests:**
- Use `testify` for assertions
- Use `httptest` for handler testing
- Test all cause values validation
- Test symptom array storage/retrieval
- Test status transitions (active -> lost)
- Test filtering with include_lost parameter

**React Tests:**
- Use Vitest with React Testing Library
- Mock API calls with MSW or manual mocks
- Test wizard step navigation (next/back)
- Test form validation (required fields)
- Test completion callback
- Test lost hive filtering toggle

### Security Considerations

- Validate cause is from allowed enum
- Validate symptoms are from allowed codes
- Sanitize text inputs (symptoms_notes, reflection, cause_other)
- Ensure tenant isolation via RLS
- Prevent marking already-lost hive as lost again

### BeeBrain Integration Notes

The `hive_losses` table is structured to support future BeeBrain analysis:
- `cause` field enables loss pattern detection by cause type
- `symptoms` array enables symptom correlation analysis
- `discovered_at` enables seasonal loss pattern detection
- Stats endpoint provides pre-aggregated data for BeeBrain insights

Example BeeBrain insight: "You've lost 2 hives to varroa in fall months. Consider treating earlier in August."

### References

- [Source: Epic 9 - Story 9.3 Acceptance Criteria in epics.md]
- [Source: UX Design Spec - Emotional Design Principles, Acknowledging Losses section]
- [Source: Architecture - Data Model, hives table structure]
- [Source: Story 9.2 - First Harvest Celebration (emotional moment pattern)]
- [Source: Story 5.1 - Create and Configure Hives (hive status model)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

- [2026-01-25] All backend and frontend tasks implemented
- [2026-01-25] Remediation: Fixed 9 code review issues (null checks, type safety, validation, JSDoc, documentation)
- [2026-01-26] Remediation: Fixed 7 code review issues from bulk review:
  - I3 (HIGH): Used CreateHiveLossWithTransaction for atomic DB operations
  - I2 (MEDIUM): Enhanced error handling in HiveLossWizard to show API error messages
  - I1 (MEDIUM): Enhanced LostHiveBadge tests with date formatting
  - I5 (MEDIUM): Already fixed - tenant_id filtering present
  - I4 (LOW): Added getSymptomDisplay fallback in HiveLossSummary
  - I6 (LOW): Added tests for hiveLoss state update after create
  - I7 (LOW): Added server-side text field length validation

### File List

**Backend - Created:**
- `apis-server/internal/storage/migrations/0018_hive_losses.sql`
- `apis-server/internal/storage/hive_losses.go`
- `apis-server/internal/handlers/hive_losses.go`
- `apis-server/tests/storage/hive_losses_test.go`
- `apis-server/tests/handlers/hive_losses_test.go`

**Backend - Modified:**
- `apis-server/internal/storage/hives.go` - Added Status, LostAt fields and MarkHiveAsLost
- `apis-server/internal/handlers/hives.go` - Added status filtering, loss_summary
- `apis-server/cmd/server/main.go` - Added hive loss routes

**Frontend - Created:**
- `apis-dashboard/src/components/HiveLossWizard.tsx`
- `apis-dashboard/src/components/HiveLossSummary.tsx`
- `apis-dashboard/src/components/LostHiveBadge.tsx`
- `apis-dashboard/src/hooks/useHiveLoss.ts`
- `apis-dashboard/tests/components/HiveLossWizard.test.tsx`
- `apis-dashboard/tests/components/HiveLossSummary.test.tsx`
- `apis-dashboard/tests/hooks/useHiveLoss.test.ts`

**Frontend - Modified:**
- `apis-dashboard/src/components/index.ts` - Export new components
- `apis-dashboard/src/hooks/index.ts` - Export useHiveLoss
- `apis-dashboard/src/pages/Hives.tsx` - Added filter toggle, lost hive display
- `apis-dashboard/src/pages/HiveDetail.tsx` - Added "Mark as Lost" button, wizard integration
