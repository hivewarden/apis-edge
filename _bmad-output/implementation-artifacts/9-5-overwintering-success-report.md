# Story 9.5: Overwintering Success Report

Status: done

## Story

As a **beekeeper**,
I want to document which hives survived winter,
So that I can track survival rates and understand what works.

## Acceptance Criteria

1. **Spring prompt on app open** - When user opens app in spring (March for Northern Hemisphere, September for Southern), they are prompted: "Time for spring inspection! Did all your hives survive winter?"

2. **Mark each hive's winter outcome** - User can mark each hive as:
   - "Survived" (checkbox with checkmark)
   - "Lost" (checkbox with X) - triggers hive loss post-mortem wizard (Story 9.3)
   - "Weak" (survived but struggling)

3. **Notes for survived hives** - For surviving hives, user can add:
   - Colony strength: Weak / Medium / Strong
   - Stores remaining: None / Low / Adequate / Plenty
   - First inspection findings (free text)

4. **Winter report display** - After completing the survey, show:
   - Survival rate: "2 of 3 hives survived (67%)"
   - Lost hive causes (if post-mortem completed) with links to full post-mortem
   - Comparison to previous winters (if historical data exists)

5. **100% survival celebration** - If all hives survived, display celebratory message: "100% survival! Great winter preparation!"

6. **Historical data** - Enable survival rate trends across winters:
   - Display year-over-year survival rates
   - Show improvement/decline pattern
   - Allow viewing past winter reports

7. **Season detection** - Winter season stored as start year (e.g., "2025-2026" stored as "2025")
   - Northern Hemisphere: Winter = November - March, Spring prompt in March
   - Southern Hemisphere: Winter = May - September, Spring prompt in September

8. **No duplicate prompts** - Spring prompt only appears if no overwintering record exists for current season

## Tasks / Subtasks

### Backend Tasks

- [x] **Task 1: Create overwintering_records table and migration** (AC: #1, #2, #3, #6, #7)
  - [x] 1.1 Create migration `apis-server/internal/storage/migrations/0020_overwintering_records.sql`:
    ```sql
    -- Migration: 0020_overwintering_records.sql
    -- Description: Creates overwintering_records table for tracking winter survival
    -- Epic: 9 - Data Export & Emotional Moments
    -- Story: 9.5 - Overwintering Success Report

    -- Overwintering records table
    CREATE TABLE IF NOT EXISTS overwintering_records (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        hive_id TEXT NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
        winter_season INT NOT NULL,          -- Year of winter start (e.g., 2025 for 2025-2026)
        survived BOOLEAN NOT NULL,           -- true = survived, false = lost
        condition TEXT,                      -- 'strong', 'medium', 'weak' (only if survived)
        stores_remaining TEXT,               -- 'none', 'low', 'adequate', 'plenty' (only if survived)
        first_inspection_notes TEXT,         -- Free text notes (only if survived)
        recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, hive_id, winter_season)  -- One record per hive per winter
    );

    -- Condition and stores constraints
    ALTER TABLE overwintering_records ADD CONSTRAINT overwintering_condition_check
        CHECK (condition IS NULL OR condition IN ('strong', 'medium', 'weak'));
    ALTER TABLE overwintering_records ADD CONSTRAINT overwintering_stores_check
        CHECK (stores_remaining IS NULL OR stores_remaining IN ('none', 'low', 'adequate', 'plenty'));

    -- Indexes for efficient lookups
    CREATE INDEX IF NOT EXISTS idx_overwintering_tenant ON overwintering_records(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_overwintering_season ON overwintering_records(tenant_id, winter_season DESC);
    CREATE INDEX IF NOT EXISTS idx_overwintering_hive ON overwintering_records(hive_id);

    -- Enable RLS
    ALTER TABLE overwintering_records ENABLE ROW LEVEL SECURITY;

    -- RLS policy for tenant isolation
    DROP POLICY IF EXISTS overwintering_records_tenant_isolation ON overwintering_records;
    CREATE POLICY overwintering_records_tenant_isolation ON overwintering_records
        USING (tenant_id = current_setting('app.tenant_id', true));
    ```

- [x] **Task 2: Create overwintering storage layer** (AC: #2, #3, #6, #7, #8)
  - [x] 2.1 Create `apis-server/internal/storage/overwintering.go`:
    - Define `OverwinteringRecord` struct with all fields
    - Define `CreateOverwinteringInput` struct
    - Define `WinterReport` struct for aggregated data
    - Define `WinterSurvivalTrend` struct for historical trends
  - [x] 2.2 Implement `CreateOverwinteringRecord(ctx, conn, tenantID, input) (*OverwinteringRecord, error)`
  - [x] 2.3 Implement `GetOverwinteringRecord(ctx, conn, hiveID, winterSeason) (*OverwinteringRecord, error)`
  - [x] 2.4 Implement `ListOverwinteringRecordsBySeason(ctx, conn, tenantID, winterSeason) ([]OverwinteringRecord, error)`
  - [x] 2.5 Implement `HasOverwinteringRecordForSeason(ctx, conn, tenantID, winterSeason) (bool, error)` - check if any record exists
  - [x] 2.6 Implement `GetWinterReport(ctx, conn, tenantID, winterSeason) (*WinterReport, error)` - aggregated stats
  - [x] 2.7 Implement `GetSurvivalTrends(ctx, conn, tenantID, years int) ([]WinterSurvivalTrend, error)` - historical data
  - [x] 2.8 Implement `GetAvailableWinterSeasons(ctx, conn, tenantID) ([]int, error)` - list years with data

- [x] **Task 3: Create overwintering service** (AC: #1, #4, #7)
  - [x] 3.1 Create `apis-server/internal/services/overwintering.go`:
    - Define `OverwinteringService` struct
    - Define season detection helpers:
      ```go
      // GetCurrentWinterSeason returns the winter season year based on current date
      // For NH: Nov-Mar belongs to winter starting previous November
      // For SH: May-Sep belongs to winter starting current May
      func GetCurrentWinterSeason(hemisphere string) int

      // IsSpringPromptTime checks if it's time to show the spring prompt
      // NH: March 1-31, SH: September 1-30
      func IsSpringPromptTime(hemisphere string) bool

      // GetWinterSeasonLabel returns display label like "2025-2026"
      func GetWinterSeasonLabel(winterSeason int) string
      ```
  - [x] 3.2 Implement `ShouldShowSpringPrompt(ctx, tenantID, hemisphere) (bool, int, error)`:
    - Check if it's spring prompt time
    - Check if user has already recorded for this winter season
    - Return (shouldShow, winterSeason, error)
  - [x] 3.3 Implement `GenerateWinterReport(ctx, tenantID, winterSeason) (*WinterReportData, error)`:
    - Calculate survival rate (survived count / total count)
    - Get lost hive causes from hive_losses table
    - Calculate comparison to previous winters
    - Check for 100% survival celebration trigger

- [x] **Task 4: Create overwintering handler** (AC: #1, #2, #3, #4, #5, #6, #8)
  - [x] 4.1 Create `apis-server/internal/handlers/overwintering.go`
  - [x] 4.2 Implement `GET /api/overwintering/prompt` - Check if spring prompt should show:
    - Query param: `?hemisphere=northern` (default)
    - Returns: `{should_show: true, winter_season: 2025, season_label: "2025-2026"}`
  - [x] 4.3 Implement `GET /api/overwintering/hives` - Get hives for overwintering entry:
    - Query param: `?winter_season=2025`
    - Returns list of hives with any existing overwintering records
  - [x] 4.4 Implement `POST /api/overwintering` - Submit overwintering record:
    - Body: `{hive_id, winter_season, survived, condition?, stores_remaining?, first_inspection_notes?}`
    - Validate condition/stores only allowed if survived=true
  - [x] 4.5 Implement `GET /api/overwintering/report` - Get winter report:
    - Query param: `?winter_season=2025`
    - Returns survival rate, lost causes, comparison data
  - [x] 4.6 Implement `GET /api/overwintering/trends` - Get survival trends:
    - Query param: `?years=5` (default 5)
    - Returns year-over-year survival rates
  - [x] 4.7 Implement `GET /api/overwintering/seasons` - List available winter seasons:
    - Returns years with overwintering data

- [x] **Task 5: Backend tests** (AC: all)
  - [x] 5.1 Create `apis-server/tests/storage/overwintering_test.go`
  - [x] 5.2 Create `apis-server/tests/services/overwintering_test.go`
  - [x] 5.3 Create `apis-server/tests/handlers/overwintering_test.go`
  - [x] 5.4 Test season detection for both hemispheres
  - [x] 5.5 Test spring prompt timing logic
  - [x] 5.6 Test survival rate calculations
  - [x] 5.7 Test unique constraint (one record per hive per winter)
  - [x] 5.8 Test 100% survival detection

### Frontend Tasks

- [x] **Task 6: Create OverwinteringPrompt component** (AC: #1, #8)
  - [x] 6.1 Create `apis-dashboard/src/components/OverwinteringPrompt.tsx`:
    - Modal or banner that appears on Dashboard in spring
    - Header: "Time for spring inspection! Did all your hives survive winter?"
    - "Start Survey" button to open OverwinteringSurvey page
    - "Remind Me Later" and "Already Completed" dismiss options
    - Store dismiss preference in localStorage (remind again in 7 days)
  - [x] 6.2 Use Ant Design Modal with warm Honey Beegood styling
  - [x] 6.3 Export from `components/index.ts`

- [x] **Task 7: Create OverwinteringSurvey page** (AC: #2, #3)
  - [x] 7.1 Create `apis-dashboard/src/pages/OverwinteringSurvey.tsx`:
    - Page header: "Winter 2025-2026 Overwintering Report"
    - List all active hives (from before winter)
    - For each hive, show:
      - Hive name
      - Radio buttons: Survived / Lost / Weak
      - If Survived/Weak: Expandable details section
    - "Mark all as Survived" quick action button
    - Submit button to save all records
  - [x] 7.2 Add route `/overwintering/survey` to App.tsx
  - [x] 7.3 Export from `pages/index.ts`

- [x] **Task 8: Create HiveWinterStatusCard component** (AC: #2, #3)
  - [x] 8.1 Create `apis-dashboard/src/components/HiveWinterStatusCard.tsx`:
    - Card for each hive in the survey
    - Hive name and icon
    - Status selector: Survived (green check), Lost (red X), Weak (yellow warning)
    - Conditional fields for survived/weak hives:
      - Colony strength: Weak / Medium / Strong (radio)
      - Stores remaining: None / Low / Adequate / Plenty (radio)
      - First inspection notes (textarea)
    - If "Lost" selected: Link to hive loss post-mortem wizard
  - [x] 8.2 Use Ant Design Card with status-based border colors
  - [x] 8.3 Export from `components/index.ts`

- [x] **Task 9: Create WinterReport page** (AC: #4, #5, #6)
  - [x] 9.1 Create `apis-dashboard/src/pages/WinterReport.tsx`:
    - Page header with winter season label
    - Survival rate card: "2 of 3 hives survived (67%)"
    - Progress bar visualization of survival rate
    - 100% survival celebration card (if applicable)
    - Lost hives section with causes and links to post-mortems
    - Survived hives section with condition summaries
    - Historical comparison card (if previous data exists)
    - Year selector dropdown to view past winters
  - [x] 9.2 Add route `/overwintering/report` to App.tsx
  - [x] 9.3 Export from `pages/index.ts`

- [x] **Task 10: Create SurvivalCelebration component** (AC: #5)
  - [x] 10.1 Create `apis-dashboard/src/components/SurvivalCelebration.tsx`:
    - Celebratory card for 100% survival
    - Large "100%" with confetti/celebration icon
    - Message: "Great winter preparation!"
    - Honey Beegood warm colors and positive messaging
    - Optional: Simple CSS confetti animation
  - [x] 10.2 Export from `components/index.ts`

- [x] **Task 11: Create SurvivalTrendChart component** (AC: #6)
  - [x] 11.1 Create `apis-dashboard/src/components/SurvivalTrendChart.tsx`:
    - Line chart showing survival rate % over winters
    - X-axis: Winter seasons (2022-2023, 2023-2024, etc.)
    - Y-axis: Survival rate (0-100%)
    - Use Ant Design Charts or Chart.js
    - Show improvement/decline trend indicator
  - [x] 11.2 Export from `components/index.ts`

- [x] **Task 12: Create useOverwintering hook** (AC: all)
  - [x] 12.1 Create `apis-dashboard/src/hooks/useOverwintering.ts`:
    ```typescript
    interface OverwinteringRecord {
      id: string;
      hive_id: string;
      hive_name: string;
      winter_season: number;
      survived: boolean;
      condition?: 'strong' | 'medium' | 'weak';
      stores_remaining?: 'none' | 'low' | 'adequate' | 'plenty';
      first_inspection_notes?: string;
      recorded_at: string;
    }

    interface WinterReport {
      winter_season: number;
      season_label: string;
      total_hives: number;
      survived_count: number;
      lost_count: number;
      weak_count: number;
      survival_rate: number;
      is_100_percent: boolean;
      lost_hives: LostHiveSummary[];
      survived_hives: SurvivedHiveSummary[];
      comparison?: WinterComparison;
    }

    interface SurvivalTrend {
      winter_season: number;
      season_label: string;
      survival_rate: number;
      total_hives: number;
      survived_count: number;
    }
    ```
  - [x] 12.2 Implement `useSpringPrompt(hemisphere?: string)` - Check if prompt should show
  - [x] 12.3 Implement `useOverwinteringHives(winterSeason: number)` - Get hives for survey
  - [x] 12.4 Implement `submitOverwinteringRecord(record: CreateOverwinteringInput)` - Submit single record
  - [x] 12.5 Implement `useWinterReport(winterSeason?: number)` - Get winter report
  - [x] 12.6 Implement `useSurvivalTrends(years?: number)` - Get historical trends
  - [x] 12.7 Implement `useAvailableWinters()` - List available winter seasons
  - [x] 12.8 Export from `hooks/index.ts`

- [x] **Task 13: Integrate spring prompt on Dashboard** (AC: #1)
  - [x] 13.1 Update `apis-dashboard/src/pages/Dashboard.tsx`:
    - Import and use OverwinteringPrompt component
    - Check `useSpringPrompt()` on mount
    - Show prompt if `should_show` is true and not dismissed
    - Store dismiss state in localStorage with expiry
  - [x] 13.2 Add navigation to overwintering survey from prompt

- [x] **Task 14: Frontend tests** (AC: all)
  - [x] 14.1 Create `apis-dashboard/tests/pages/OverwinteringSurvey.test.tsx`
  - [x] 14.2 Create `apis-dashboard/tests/pages/WinterReport.test.tsx`
  - [x] 14.3 Create `apis-dashboard/tests/components/HiveWinterStatusCard.test.tsx`
  - [x] 14.4 Create `apis-dashboard/tests/components/SurvivalCelebration.test.tsx`
  - [x] 14.5 Create `apis-dashboard/tests/hooks/useOverwintering.test.ts`
  - [x] 14.6 Test spring prompt display logic
  - [x] 14.7 Test survey submission flow
  - [x] 14.8 Test 100% survival celebration display
  - [x] 14.9 Test lost hive → post-mortem linking

## Dev Notes

### What Already Exists (Do NOT Recreate)

**Backend - REUSE these:**
- `storage/hives.go` - Hive data with status field (active/lost/archived)
  - `ListHives()`, `ListHivesWithStatus()` - Get all hives
  - `GetHiveByID()` - Get single hive
  - `Hive.Status` field already tracks "active", "lost", "archived"
- `storage/hive_losses.go` - Post-mortem records for lost hives
  - `GetHiveLossByHiveID()` - Get loss details for linking
  - `CauseDisplayNames` - Human-readable cause names
- `handlers/hive_losses.go` - Hive loss API endpoints
  - POST `/api/hives/{id}/loss` - Create post-mortem (link to this)
- `services/season_recap.go` - Season date calculation patterns
  - Reuse hemisphere-based date logic patterns
- `middleware/tenant.go` - Tenant context extraction
- `storage/postgres.go` - Database connection patterns

**Frontend - EXTEND these:**
- `pages/Dashboard.tsx` - Add spring prompt banner (follow 9.4 pattern)
- `hooks/useHarvests.ts` - API hook patterns to follow
- `components/FirstHarvestModal.tsx` - Celebration component patterns
- `theme/apisTheme.ts` - Honey Beegood colors (seaBuckthorn, coconutCream, brownBramble)
- `components/index.ts` - Export barrel file

### API Contract

**GET /api/overwintering/prompt**

Query params:
- `hemisphere` (optional): "northern" or "southern". Default: "northern"

Response (200):
```json
{
  "data": {
    "should_show": true,
    "winter_season": 2025,
    "season_label": "2025-2026",
    "message": "Time for spring inspection! Did all your hives survive winter?"
  }
}
```

**GET /api/overwintering/hives**

Query params:
- `winter_season` (required): Year (e.g., 2025)

Response (200):
```json
{
  "data": [
    {
      "hive_id": "uuid-1",
      "hive_name": "Hive 1",
      "existing_record": null
    },
    {
      "hive_id": "uuid-2",
      "hive_name": "Hive 2",
      "existing_record": {
        "survived": true,
        "condition": "strong",
        "stores_remaining": "adequate",
        "first_inspection_notes": "Looking good"
      }
    }
  ],
  "meta": {"total": 2}
}
```

**POST /api/overwintering**

Request:
```json
{
  "hive_id": "uuid",
  "winter_season": 2025,
  "survived": true,
  "condition": "strong",
  "stores_remaining": "adequate",
  "first_inspection_notes": "Colony looks healthy, good brood pattern"
}
```

Response (201):
```json
{
  "data": {
    "id": "uuid",
    "hive_id": "uuid",
    "winter_season": 2025,
    "survived": true,
    "condition": "strong",
    "stores_remaining": "adequate",
    "first_inspection_notes": "Colony looks healthy, good brood pattern",
    "recorded_at": "2026-03-15",
    "created_at": "2026-03-15T10:00:00Z"
  },
  "message": "Overwintering record saved"
}
```

For lost hives (triggers post-mortem redirect):
```json
{
  "hive_id": "uuid",
  "winter_season": 2025,
  "survived": false
}
```

Response (201):
```json
{
  "data": {
    "id": "uuid",
    "hive_id": "uuid",
    "winter_season": 2025,
    "survived": false,
    "recorded_at": "2026-03-15"
  },
  "message": "Record saved. Please complete the post-mortem for this hive.",
  "redirect": "/hives/uuid/loss"
}
```

**GET /api/overwintering/report**

Query params:
- `winter_season` (optional): Year. Default: current winter season

Response (200):
```json
{
  "data": {
    "winter_season": 2025,
    "season_label": "2025-2026",
    "total_hives": 3,
    "survived_count": 2,
    "lost_count": 1,
    "weak_count": 0,
    "survival_rate": 66.67,
    "is_100_percent": false,
    "lost_hives": [
      {
        "hive_id": "uuid",
        "hive_name": "Hive 3",
        "cause": "starvation",
        "cause_display": "Starvation",
        "has_post_mortem": true
      }
    ],
    "survived_hives": [
      {
        "hive_id": "uuid",
        "hive_name": "Hive 1",
        "condition": "strong",
        "condition_display": "Strong",
        "stores_remaining": "adequate",
        "stores_display": "Adequate",
        "first_inspection_notes": "Looking healthy"
      },
      {
        "hive_id": "uuid",
        "hive_name": "Hive 2",
        "condition": "medium",
        "condition_display": "Medium",
        "stores_remaining": "low",
        "stores_display": "Low",
        "first_inspection_notes": "Needs feeding"
      }
    ],
    "comparison": {
      "previous_season": 2024,
      "previous_season_label": "2024-2025",
      "previous_survival_rate": 50.0,
      "change_percent": 16.67,
      "improved": true
    }
  }
}
```

**GET /api/overwintering/trends**

Query params:
- `years` (optional): Number of years to include. Default: 5

Response (200):
```json
{
  "data": [
    {
      "winter_season": 2025,
      "season_label": "2025-2026",
      "survival_rate": 66.67,
      "total_hives": 3,
      "survived_count": 2
    },
    {
      "winter_season": 2024,
      "season_label": "2024-2025",
      "survival_rate": 50.0,
      "total_hives": 2,
      "survived_count": 1
    }
  ],
  "meta": {"total": 2}
}
```

**GET /api/overwintering/seasons**

Response (200):
```json
{
  "data": [2025, 2024, 2023],
  "meta": {"total": 3}
}
```

### Season Detection Logic

**Winter Season Definition:**
- Northern Hemisphere: November Year N to March Year N+1 = Winter Season "N"
- Southern Hemisphere: May Year N to September Year N = Winter Season "N"

**Spring Prompt Timing:**
- Northern Hemisphere: March 1-31
- Southern Hemisphere: September 1-30

```go
func GetCurrentWinterSeason(hemisphere string) int {
    now := time.Now()
    year := now.Year()
    month := now.Month()

    if hemisphere == "southern" {
        // SH: May-Sep is winter of current year
        // Oct-Apr: if Oct-Dec = current year, if Jan-Apr = previous year
        if month >= time.May && month <= time.September {
            return year
        }
        if month >= time.October {
            return year
        }
        return year - 1 // Jan-Apr belongs to previous year's winter
    }

    // NH: Nov-Mar is winter
    // Nov-Dec = current year, Jan-Mar = previous year
    if month >= time.November {
        return year
    }
    if month <= time.March {
        return year - 1
    }
    // Apr-Oct: return previous winter
    return year - 1
}

func IsSpringPromptTime(hemisphere string) bool {
    month := time.Now().Month()
    if hemisphere == "southern" {
        return month == time.September
    }
    return month == time.March
}

func GetWinterSeasonLabel(winterSeason int) string {
    return fmt.Sprintf("%d-%d", winterSeason, winterSeason+1)
}
```

### Weak vs Lost Hive Handling

- **Survived**: Hive made it through winter in good shape
- **Weak**: Hive survived but is struggling (needs extra care)
  - Still records survival data (condition, stores, notes)
  - Does NOT trigger post-mortem
  - May trigger BeeBrain insight: "Weak hive needs attention"
- **Lost**: Hive did not survive
  - Records `survived: false`
  - Triggers redirect to post-mortem wizard (Story 9.3)
  - Hive status updated to "lost" via post-mortem

### Post-Mortem Integration

When user marks hive as "Lost":
1. Create overwintering record with `survived: false`
2. Return redirect URL to post-mortem: `/hives/{id}/loss`
3. Frontend navigates to post-mortem wizard
4. Post-mortem updates hive status to "lost" and records cause

The overwintering report queries `hive_losses` table to get cause for lost hives.

### Database Changes Summary

1. **New table**: `overwintering_records` (id, tenant_id, hive_id, winter_season, survived, condition, stores_remaining, first_inspection_notes, recorded_at, created_at)
2. **Unique constraint**: One record per hive per winter season
3. **Indexes**: idx_overwintering_tenant, idx_overwintering_season, idx_overwintering_hive
4. **RLS policy**: overwintering_records_tenant_isolation

### Project Structure Notes

**Backend files to create:**
- `apis-server/internal/storage/migrations/0020_overwintering_records.sql`
- `apis-server/internal/storage/overwintering.go`
- `apis-server/internal/services/overwintering.go`
- `apis-server/internal/handlers/overwintering.go`
- `apis-server/tests/storage/overwintering_test.go`
- `apis-server/tests/services/overwintering_test.go`
- `apis-server/tests/handlers/overwintering_test.go`

**Backend files to modify:**
- `apis-server/cmd/server/main.go` - Add overwintering routes

**Frontend files to create:**
- `apis-dashboard/src/pages/OverwinteringSurvey.tsx`
- `apis-dashboard/src/pages/WinterReport.tsx`
- `apis-dashboard/src/components/OverwinteringPrompt.tsx`
- `apis-dashboard/src/components/HiveWinterStatusCard.tsx`
- `apis-dashboard/src/components/SurvivalCelebration.tsx`
- `apis-dashboard/src/components/SurvivalTrendChart.tsx`
- `apis-dashboard/src/hooks/useOverwintering.ts`
- `apis-dashboard/tests/pages/OverwinteringSurvey.test.tsx`
- `apis-dashboard/tests/pages/WinterReport.test.tsx`
- `apis-dashboard/tests/components/HiveWinterStatusCard.test.tsx`
- `apis-dashboard/tests/components/SurvivalCelebration.test.tsx`
- `apis-dashboard/tests/hooks/useOverwintering.test.ts`

**Frontend files to modify:**
- `apis-dashboard/src/App.tsx` - Add routes for /overwintering/*
- `apis-dashboard/src/pages/index.ts` - Export new pages
- `apis-dashboard/src/components/index.ts` - Export new components
- `apis-dashboard/src/hooks/index.ts` - Export useOverwintering
- `apis-dashboard/src/pages/Dashboard.tsx` - Add spring prompt

### Testing Standards

**Go Tests:**
- Use `testify` for assertions
- Use `httptest` for handler testing
- Test season detection for both hemispheres across all months
- Test spring prompt timing (should only show in March/September)
- Test unique constraint enforcement
- Test survival rate calculations with edge cases (0%, 100%, single hive)
- Test integration with hive_losses for lost hive causes

**React Tests:**
- Use Vitest with React Testing Library
- Mock API calls with MSW or manual mocks
- Test spring prompt display/dismiss logic
- Test survey form submission
- Test 100% survival celebration display
- Test navigation to post-mortem for lost hives
- Test localStorage dismiss persistence

### Security Considerations

- Validate `winter_season` is reasonable (e.g., 2000-2100)
- Validate `hemisphere` is "northern" or "southern"
- Validate `condition` is one of: strong, medium, weak
- Validate `stores_remaining` is one of: none, low, adequate, plenty
- Validate `condition` and `stores_remaining` only allowed when `survived=true`
- Tenant isolation via RLS on overwintering_records table
- Sanitize `first_inspection_notes` for XSS

### Emotional UX Guidelines (from UX Design Spec)

**Spring Prompt:**
- Warm, welcoming tone: "Time for spring inspection!"
- Acknowledge the anxiety of the moment
- Provide easy "Mark all survived" quick action for happy scenarios

**Lost Hive Handling:**
- Compassionate redirect: "Please complete the post-mortem..."
- Don't dwell - quickly move to constructive action
- Link to existing post-mortem wizard (Story 9.3)

**Celebration (100% Survival):**
- Prominent celebration: confetti icon, warm colors
- "Great winter preparation!" acknowledges user's effort
- Share-worthy moment

**Report Display:**
- Lead with positive: Show survived hives first
- Lost hives section: Factual but compassionate
- Historical comparison: Frame improvement positively, decline as learning opportunity

### References

- [Source: Epic 9 - Story 9.5 Acceptance Criteria in epics.md]
- [Source: Story 9.3 - Hive Loss Post-Mortem (post-mortem integration)]
- [Source: Story 9.4 - Season Recap Summary (season detection patterns)]
- [Source: storage/hives.go - Hive status field]
- [Source: storage/hive_losses.go - Post-mortem records]
- [Source: handlers/hive_losses.go - Post-mortem API]
- [Source: Architecture - API Endpoints, Data Model]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

1. **Backend Implementation Complete** (Tasks 1-5):
   - Created migration for `overwintering_records` table with RLS policies
   - Implemented storage layer with all CRUD operations and report generation
   - Created services layer with season detection for both hemispheres
   - Implemented all 6 API endpoints (prompt, hives, create, report, trends, seasons)
   - All backend tests pass (handlers, storage, services)

2. **Frontend Implementation Complete** (Tasks 6-14):
   - Created `useOverwintering` hook with all API integrations
   - Created `OverwinteringPrompt` component with localStorage dismiss persistence
   - Created `HiveWinterStatusCard` component for survey with conditional fields
   - Created `SurvivalCelebration` component with confetti for 100% survival
   - Created `SurvivalTrendChart` component with bar-based visualization
   - Created `OverwinteringSurvey` page with full form handling
   - Created `WinterReport` page with survival statistics and comparisons
   - Integrated spring prompt on Dashboard
   - Added routes to App.tsx
   - All 44 frontend tests pass

3. **Design Decisions**:
   - Used simple bar chart for trends instead of external library (project has no chart.js)
   - Spring prompt stored dismiss state in localStorage with 7-day reminder expiry
   - Lost hive handling routes to post-mortem wizard (Story 9.3) via redirect URL
   - "Weak" status treated as survived but with special handling for reporting

### File List

**Backend Created:**
- `apis-server/internal/storage/migrations/0020_overwintering_records.sql`
- `apis-server/internal/storage/overwintering.go`
- `apis-server/internal/services/overwintering.go`
- `apis-server/internal/handlers/overwintering.go`
- `apis-server/tests/storage/overwintering_test.go`
- `apis-server/tests/services/overwintering_test.go`
- `apis-server/tests/handlers/overwintering_test.go`

**Backend Modified:**
- `apis-server/cmd/server/main.go` (added routes)

**Frontend Created:**
- `apis-dashboard/src/hooks/useOverwintering.ts`
- `apis-dashboard/src/components/OverwinteringPrompt.tsx`
- `apis-dashboard/src/components/HiveWinterStatusCard.tsx`
- `apis-dashboard/src/components/SurvivalCelebration.tsx`
- `apis-dashboard/src/components/SurvivalTrendChart.tsx`
- `apis-dashboard/src/pages/OverwinteringSurvey.tsx`
- `apis-dashboard/src/pages/WinterReport.tsx`
- `apis-dashboard/tests/hooks/useOverwintering.test.ts`
- `apis-dashboard/tests/components/SurvivalCelebration.test.tsx`
- `apis-dashboard/tests/components/HiveWinterStatusCard.test.tsx`
- `apis-dashboard/tests/pages/OverwinteringSurvey.test.tsx`
- `apis-dashboard/tests/pages/WinterReport.test.tsx`

**Frontend Modified:**
- `apis-dashboard/src/hooks/index.ts` (added exports)
- `apis-dashboard/src/components/index.ts` (added exports)
- `apis-dashboard/src/pages/index.ts` (added exports)
- `apis-dashboard/src/App.tsx` (added routes and imports)
- `apis-dashboard/src/pages/Dashboard.tsx` (added OverwinteringPrompt)

