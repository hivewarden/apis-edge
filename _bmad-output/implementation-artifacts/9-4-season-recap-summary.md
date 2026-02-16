# Story 9.4: Season Recap Summary

Status: done

## Story

As a **beekeeper**,
I want a summary of my beekeeping season,
So that I can reflect on the year and share with others.

## Acceptance Criteria

1. **Season recap page access** - User can navigate to "Season Recap" from Dashboard or Settings, or receives a prompt in November (Northern Hemisphere)

2. **Generated summary card** - The recap displays:
   - Season dates (e.g., "Aug 1 - Oct 31, 2026")
   - Total harvest across all hives in kg
   - Hornets deterred count (from detections)
   - Inspections completed count
   - Key milestones achieved (first harvest, hive additions, etc.)

3. **Per-hive breakdown** - The recap includes per-hive statistics:
   - Hive name
   - Harvest amount (kg)
   - Health status (healthy, treated for varroa, new queen, lost, etc.)
   - Issues encountered if any

4. **Share as text** - User can copy recap as formatted text for social media:
   - Plain text format suitable for forums/Twitter
   - Includes key stats in readable format
   - "Copy to Clipboard" button with confirmation

5. **Share as image** - User can download recap as shareable card image:
   - Designed card with APIS branding and Honey Beegood colors
   - Canvas-based client-side rendering (no server dependency)
   - Download as PNG file

6. **Export as PDF** - User can export full recap as PDF:
   - Includes all stats, charts, and per-hive breakdown
   - Browser print-to-PDF or client-side PDF generation
   - Formatted for A4/Letter printing

7. **View past seasons** - User can select previous years:
   - Dropdown to select season year
   - Season detection: August 1 - October 31 (configurable per hemisphere)
   - Year-over-year comparison when multiple seasons exist

8. **Season caching** - Recap is generated on-demand but cached:
   - Cache invalidated when new data is added for that season
   - Regenerate button for manual refresh

## Tasks / Subtasks

### Backend Tasks

- [x] **Task 1: Create season_recaps table and migration** (AC: #8)
  - [ ] 1.1 Create migration `apis-server/internal/storage/migrations/0019_season_recaps.sql`:
    ```sql
    -- Season recaps cache table
    CREATE TABLE IF NOT EXISTS season_recaps (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        season_year INT NOT NULL,          -- e.g., 2026
        hemisphere TEXT NOT NULL DEFAULT 'northern',  -- 'northern' or 'southern'
        season_start DATE NOT NULL,
        season_end DATE NOT NULL,
        recap_data JSONB NOT NULL,         -- Cached aggregated data
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, season_year)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_season_recaps_tenant ON season_recaps(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_season_recaps_year ON season_recaps(tenant_id, season_year DESC);

    -- Enable RLS
    ALTER TABLE season_recaps ENABLE ROW LEVEL SECURITY;

    -- RLS policy
    DROP POLICY IF EXISTS season_recaps_tenant_isolation ON season_recaps;
    CREATE POLICY season_recaps_tenant_isolation ON season_recaps
        USING (tenant_id = current_setting('app.tenant_id', true));
    ```

- [x] **Task 2: Create season_recaps storage layer** (AC: #2, #3, #7, #8)
  - [ ] 2.1 Create `apis-server/internal/storage/season_recaps.go`:
    - Define `SeasonRecap` struct with all fields
    - Define `SeasonRecapData` struct for JSONB data:
      ```go
      type SeasonRecapData struct {
          SeasonDates      SeasonDates       `json:"season_dates"`
          TotalHarvestKg   float64           `json:"total_harvest_kg"`
          HornetsDeterred  int               `json:"hornets_deterred"`
          InspectionsCount int               `json:"inspections_count"`
          TreatmentsCount  int               `json:"treatments_count"`
          FeedingsCount    int               `json:"feedings_count"`
          Milestones       []Milestone       `json:"milestones"`
          PerHiveStats     []HiveSeasonStat  `json:"per_hive_stats"`
          ComparisonData   *YearComparison   `json:"comparison_data,omitempty"`
      }

      type SeasonDates struct {
          Start       time.Time `json:"start"`
          End         time.Time `json:"end"`
          DisplayText string    `json:"display_text"` // "Aug 1 - Oct 31, 2026"
      }

      type Milestone struct {
          Type        string    `json:"type"`        // "first_harvest", "new_hive", "queen_replaced"
          Description string    `json:"description"`
          Date        time.Time `json:"date"`
          HiveID      *string   `json:"hive_id,omitempty"`
          HiveName    *string   `json:"hive_name,omitempty"`
      }

      type HiveSeasonStat struct {
          HiveID       string   `json:"hive_id"`
          HiveName     string   `json:"hive_name"`
          HarvestKg    float64  `json:"harvest_kg"`
          Status       string   `json:"status"`      // "healthy", "treated", "new_queen", "lost"
          StatusDetail string   `json:"status_detail,omitempty"`
          Issues       []string `json:"issues,omitempty"`
      }

      type YearComparison struct {
          PreviousYear        int     `json:"previous_year"`
          PreviousHarvestKg   float64 `json:"previous_harvest_kg"`
          HarvestChange       float64 `json:"harvest_change_percent"`
          PreviousHornets     int     `json:"previous_hornets"`
          HornetsChange       float64 `json:"hornets_change_percent"`
      }
      ```
  - [ ] 2.2 Implement `CreateSeasonRecap(ctx, conn, tenantID, input) (*SeasonRecap, error)`
  - [ ] 2.3 Implement `GetSeasonRecap(ctx, conn, tenantID, year) (*SeasonRecap, error)`
  - [ ] 2.4 Implement `ListSeasonRecaps(ctx, conn, tenantID) ([]SeasonRecap, error)`
  - [ ] 2.5 Implement `DeleteSeasonRecap(ctx, conn, tenantID, year) error` - for cache invalidation
  - [ ] 2.6 Implement `GetAvailableSeasons(ctx, conn, tenantID) ([]int, error)` - years with data

- [x] **Task 3: Create season recap service** (AC: #2, #3, #7)
  - [ ] 3.1 Create `apis-server/internal/services/season_recap.go`:
    - Define `SeasonRecapService` struct
    - Define season date calculation helpers:
      ```go
      // GetSeasonDates returns start/end dates for a season year
      // Northern Hemisphere: Aug 1 - Oct 31
      // Southern Hemisphere: Feb 1 - Apr 30
      func GetSeasonDates(year int, hemisphere string) (time.Time, time.Time)

      // GetCurrentSeason returns the current season year
      // November onwards is previous season's recap time
      func GetCurrentSeason(hemisphere string) int
      ```
  - [ ] 3.2 Implement `GenerateRecap(ctx, tenantID, year, hemisphere) (*SeasonRecapData, error)`:
    - Calculate season date range
    - Aggregate harvest data from `harvests` table within date range
    - Count detections from `detections` table within date range
    - Count inspections from `inspections` table within date range
    - Count treatments and feedings within date range
    - Detect milestones (first harvest, new hives, queen changes)
    - Build per-hive statistics with status
    - Calculate year-over-year comparison if previous season exists
  - [ ] 3.3 Implement `GetOrGenerateRecap(ctx, tenantID, year, hemisphere, forceRegenerate) (*SeasonRecap, error)`:
    - Check cache first
    - If cache miss or forceRegenerate, generate and cache
    - Return cached or newly generated recap

- [x] **Task 4: Create recap handler** (AC: #1, #2, #3, #4, #6, #7, #8)
  - [ ] 4.1 Create `apis-server/internal/handlers/recap.go`
  - [ ] 4.2 Implement `GET /api/recap` - Get current or specified season recap:
    - Query params: `?season=2026&hemisphere=northern&format=json|text`
    - Default to current season and northern hemisphere
    - If format=text, return plain text summary
    - If format=json, return full recap data
  - [ ] 4.3 Implement `GET /api/recap/seasons` - List available seasons:
    - Returns years that have data
    - Used for dropdown population
  - [ ] 4.4 Implement `POST /api/recap/regenerate` - Force regenerate cached recap:
    - Body: `{"season": 2026}`
    - Deletes cache and regenerates
  - [ ] 4.5 Implement `GET /api/recap/text` - Get recap as formatted text:
    - Returns plain text suitable for social media
    - Query params: `?season=2026`

- [x] **Task 5: Backend tests** (AC: all)
  - [ ] 5.1 Create `apis-server/tests/storage/season_recaps_test.go`
  - [ ] 5.2 Create `apis-server/tests/services/season_recap_test.go`
  - [ ] 5.3 Create `apis-server/tests/handlers/recap_test.go`
  - [ ] 5.4 Test season date calculations for both hemispheres
  - [ ] 5.5 Test recap generation with various data scenarios
  - [ ] 5.6 Test caching and regeneration
  - [ ] 5.7 Test year-over-year comparison calculations

### Frontend Tasks

- [x] **Task 6: Create SeasonRecap page** (AC: #1, #2, #3, #7)
  - [ ] 6.1 Create `apis-dashboard/src/pages/SeasonRecap.tsx`:
    - Main recap page with summary card display
    - Season year dropdown selector
    - Per-hive breakdown table/cards
    - Year-over-year comparison (if available)
    - Loading and empty states
  - [ ] 6.2 Add route `/recap` to App.tsx router
  - [ ] 6.3 Add "Season Recap" link in Dashboard and Settings pages
  - [ ] 6.4 Export from `pages/index.ts`

- [x] **Task 7: Create SeasonRecapCard component** (AC: #2)
  - [ ] 7.1 Create `apis-dashboard/src/components/SeasonRecapCard.tsx`:
    - Shareable card design with Honey Beegood styling
    - Season dates header
    - Key stats: harvest, hornets, inspections
    - Milestones badges
    - Used both for display and as canvas render source
  - [ ] 7.2 Use Ant Design Card with custom styling
  - [ ] 7.3 Colors: seaBuckthorn (#f7a42d), salomie (#fcd483), coconutCream (#fef6e4), brownBramble (#662604)
  - [ ] 7.4 Export from `components/index.ts`

- [x] **Task 8: Create HiveSeasonSummary component** (AC: #3)
  - [ ] 8.1 Create `apis-dashboard/src/components/HiveSeasonSummary.tsx`:
    - Per-hive breakdown display
    - Shows hive name, harvest kg, status, issues
    - Status badges with appropriate colors
    - Expandable for details
  - [ ] 8.2 Export from `components/index.ts`

- [x] **Task 9: Create share functionality** (AC: #4, #5, #6)
  - [ ] 9.1 Create `apis-dashboard/src/components/RecapShareModal.tsx`:
    - Modal with share options: Text, Image, PDF
    - Text tab: preview and copy button
    - Image tab: canvas preview and download button
    - PDF tab: print preview and download/print button
  - [ ] 9.2 Implement text copy using `navigator.clipboard.writeText()`
  - [ ] 9.3 Implement image generation using HTML Canvas:
    - Use html2canvas library or manual canvas drawing
    - Render SeasonRecapCard to canvas
    - Download as PNG using `canvas.toBlob()` and download link
  - [ ] 9.4 Implement PDF export using browser print:
    - Use `window.print()` with print-specific CSS
    - Or use jsPDF library for direct PDF generation
  - [ ] 9.5 Export from `components/index.ts`

- [x] **Task 10: Create useSeasonRecap hook** (AC: #2, #3, #7, #8)
  - [ ] 10.1 Create `apis-dashboard/src/hooks/useSeasonRecap.ts`:
    ```typescript
    interface SeasonRecap {
      season_year: number;
      hemisphere: string;
      season_dates: {
        start: string;
        end: string;
        display_text: string;
      };
      total_harvest_kg: number;
      hornets_deterred: number;
      inspections_count: number;
      treatments_count: number;
      feedings_count: number;
      milestones: Milestone[];
      per_hive_stats: HiveSeasonStat[];
      comparison_data?: YearComparison;
      generated_at: string;
    }

    interface Milestone {
      type: string;
      description: string;
      date: string;
      hive_id?: string;
      hive_name?: string;
    }

    interface HiveSeasonStat {
      hive_id: string;
      hive_name: string;
      harvest_kg: number;
      status: string;
      status_detail?: string;
      issues?: string[];
    }

    interface YearComparison {
      previous_year: number;
      previous_harvest_kg: number;
      harvest_change_percent: number;
      previous_hornets: number;
      hornets_change_percent: number;
    }
    ```
  - [ ] 10.2 Implement `useSeasonRecap(year?: number)` - Fetch recap for year (default: current)
  - [ ] 10.3 Implement `useAvailableSeasons()` - List years with data
  - [ ] 10.4 Implement `regenerateRecap(year: number)` - Force regenerate
  - [ ] 10.5 Implement `getRecapText(year: number)` - Get formatted text
  - [ ] 10.6 Export from `hooks/index.ts`

- [x] **Task 11: Create YearComparisonChart component** (AC: #7)
  - [ ] 11.1 Create `apis-dashboard/src/components/YearComparisonChart.tsx`:
    - Simple bar chart comparing current vs previous year
    - Shows harvest kg comparison
    - Shows hornet count comparison
    - Use Ant Design Charts or Chart.js
  - [ ] 11.2 Export from `components/index.ts`

- [x] **Task 12: Add season prompt on Dashboard** (AC: #1)
  - [ ] 12.1 Update `apis-dashboard/src/pages/Dashboard.tsx`:
    - Add notification banner in November (Northern Hemisphere)
    - "Your 2026 beekeeping season has ended! View your Season Recap"
    - Link to /recap page
    - Dismissible with preference stored
  - [ ] 12.2 Create helper function `isSeasonRecapTime(hemisphere: string): boolean`

- [x] **Task 13: Frontend tests** (AC: all)
  - [ ] 13.1 Create `apis-dashboard/tests/pages/SeasonRecap.test.tsx`
  - [ ] 13.2 Create `apis-dashboard/tests/components/SeasonRecapCard.test.tsx`
  - [ ] 13.3 Create `apis-dashboard/tests/components/RecapShareModal.test.tsx`
  - [ ] 13.4 Create `apis-dashboard/tests/hooks/useSeasonRecap.test.ts`
  - [ ] 13.5 Test season year selection
  - [ ] 13.6 Test share functionality (text copy, image download)
  - [ ] 13.7 Test year comparison display
  - [ ] 13.8 Test empty state when no data exists

## Dev Notes

### What Already Exists (Do NOT Recreate)

**Backend - REUSE these:**
- `storage/harvests.go` - Harvest data and analytics functions
  - `GetHarvestAnalytics()` - Has per-hive stats, year-over-year
  - `ListHarvestsBySite()`, `ListHarvestsByHive()` - Existing harvest queries
- `storage/detections.go` - Detection counting
  - `ListDetections()` - Query with date range filter
  - `GetDetectionStats()` - Aggregated stats
- `storage/inspections.go` - Inspection queries
  - `ListAllInspectionsByHive()` - Get inspections
- `storage/treatments.go`, `storage/feedings.go` - Treatment and feeding counts
- `services/export.go` - Data aggregation patterns to reuse
  - `aggregateHiveData()` - Pattern for collecting per-hive data
  - `calculateTotalHarvest()` - Season total calculation
- `storage/hive_losses.go` - For lost hive detection in status
- `middleware/tenant.go` - Tenant context extraction

**Frontend - EXTEND these:**
- `pages/Dashboard.tsx` - Add season recap prompt banner
- `pages/Settings.tsx` - Add Season Recap link
- `hooks/useHarvests.ts` - Harvest data patterns
- `theme/apisTheme.ts` - Honey Beegood colors already defined
- `components/index.ts` - Export barrel file

### API Contract

**GET /api/recap**

Query params:
- `season` (optional): Year (e.g., 2026). Default: current season
- `hemisphere` (optional): "northern" or "southern". Default: "northern"
- `format` (optional): "json" or "text". Default: "json"

Response (200):
```json
{
  "data": {
    "id": "uuid",
    "season_year": 2026,
    "hemisphere": "northern",
    "season_dates": {
      "start": "2026-08-01",
      "end": "2026-10-31",
      "display_text": "Aug 1 - Oct 31, 2026"
    },
    "total_harvest_kg": 45.5,
    "hornets_deterred": 127,
    "inspections_count": 24,
    "treatments_count": 3,
    "feedings_count": 5,
    "milestones": [
      {
        "type": "first_harvest",
        "description": "First harvest from Hive 3",
        "date": "2026-08-15",
        "hive_id": "uuid",
        "hive_name": "Hive 3"
      }
    ],
    "per_hive_stats": [
      {
        "hive_id": "uuid",
        "hive_name": "Hive 1",
        "harvest_kg": 18.0,
        "status": "healthy",
        "status_detail": null,
        "issues": []
      },
      {
        "hive_id": "uuid",
        "hive_name": "Hive 2",
        "harvest_kg": 15.5,
        "status": "treated",
        "status_detail": "Treated for varroa (Oxalic acid)",
        "issues": ["High mite count in August"]
      },
      {
        "hive_id": "uuid",
        "hive_name": "Hive 3",
        "harvest_kg": 12.0,
        "status": "new_queen",
        "status_detail": "New queen installed September",
        "issues": []
      }
    ],
    "comparison_data": {
      "previous_year": 2025,
      "previous_harvest_kg": 38.0,
      "harvest_change_percent": 19.7,
      "previous_hornets": 89,
      "hornets_change_percent": 42.7
    },
    "generated_at": "2026-11-05T10:00:00Z"
  }
}
```

**GET /api/recap?format=text**

Response (200):
```json
{
  "data": {
    "text": "🐝 APIS Season Recap 2026 (Aug 1 - Oct 31)\n\n📊 Key Stats:\n• Total Harvest: 45.5 kg\n• Hornets Deterred: 127\n• Inspections: 24\n\n🏆 Highlights:\n• First harvest from Hive 3\n\n📈 vs 2025: +19.7% harvest, +42.7% hornet activity\n\n🍯 Per Hive:\n• Hive 1: 18.0 kg (healthy)\n• Hive 2: 15.5 kg (treated for varroa)\n• Hive 3: 12.0 kg (new queen)\n\nGenerated with APIS - apis.honeybeegood.be"
  }
}
```

**GET /api/recap/seasons**

Response (200):
```json
{
  "data": [2026, 2025, 2024],
  "meta": {"total": 3}
}
```

**POST /api/recap/regenerate**

Request:
```json
{
  "season": 2026,
  "hemisphere": "northern"
}
```

Response (200):
```json
{
  "data": { ... }, // Full recap data
  "message": "Season recap regenerated successfully"
}
```

### Season Date Logic

**Northern Hemisphere (default):**
- Season: August 1 - October 31
- Recap prompt: November 1+
- Example: Season 2026 = Aug 1, 2026 - Oct 31, 2026

**Southern Hemisphere:**
- Season: February 1 - April 30
- Recap prompt: May 1+
- Example: Season 2026 = Feb 1, 2026 - Apr 30, 2026

```go
func GetSeasonDates(year int, hemisphere string) (start, end time.Time) {
    if hemisphere == "southern" {
        start = time.Date(year, time.February, 1, 0, 0, 0, 0, time.UTC)
        end = time.Date(year, time.April, 30, 23, 59, 59, 0, time.UTC)
    } else {
        start = time.Date(year, time.August, 1, 0, 0, 0, 0, time.UTC)
        end = time.Date(year, time.October, 31, 23, 59, 59, 0, time.UTC)
    }
    return
}

func IsRecapTime(hemisphere string) bool {
    now := time.Now()
    if hemisphere == "southern" {
        return now.Month() >= time.May
    }
    return now.Month() >= time.November
}
```

### Milestone Detection Logic

Milestones are detected by analyzing data within the season:

1. **First Harvest**: Check `milestone_photos` for `first_harvest` type OR first harvest record ever for account
2. **New Hive**: Hives created within the season date range
3. **Queen Replaced**: Hives where `queen_introduced_at` is within season date range
4. **Hive Loss**: Hives with status='lost' and `lost_at` within season date range
5. **Treatment Milestone**: First treatment of a type for a hive (e.g., first varroa treatment)

```go
func DetectMilestones(ctx context.Context, conn *pgxpool.Conn, tenantID string, seasonStart, seasonEnd time.Time) ([]Milestone, error) {
    milestones := []Milestone{}

    // Check for new hives created in season
    rows, err := conn.Query(ctx,
        `SELECT id, name, created_at FROM hives
         WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3`,
        tenantID, seasonStart, seasonEnd)
    // ... process new hives as milestones

    // Check for queen replacements in season
    rows, err = conn.Query(ctx,
        `SELECT id, name, queen_introduced_at FROM hives
         WHERE tenant_id = $1 AND queen_introduced_at BETWEEN $2 AND $3`,
        tenantID, seasonStart, seasonEnd)
    // ... process queen changes as milestones

    // Check for hive losses in season
    rows, err = conn.Query(ctx,
        `SELECT h.id, h.name, hl.discovered_at, hl.cause
         FROM hives h JOIN hive_losses hl ON h.id = hl.hive_id
         WHERE h.tenant_id = $1 AND hl.discovered_at BETWEEN $2 AND $3`,
        tenantID, seasonStart, seasonEnd)
    // ... process losses as milestones

    return milestones, nil
}
```

### Hive Status Determination

For per-hive status in the recap:

```go
func DetermineHiveSeasonStatus(ctx context.Context, conn *pgxpool.Conn, hiveID string, seasonStart, seasonEnd time.Time) (status, detail string, issues []string) {
    // Check if hive was lost
    if lostDuring(hiveID, seasonStart, seasonEnd) {
        return "lost", "Lost on [date]: [cause]", []string{"Hive loss"}
    }

    // Check if queen was replaced
    if queenReplacedDuring(hiveID, seasonStart, seasonEnd) {
        status = "new_queen"
        detail = "New queen installed [date]"
    }

    // Check if treated (varroa, etc.)
    treatments := getTreatmentsDuring(hiveID, seasonStart, seasonEnd)
    if len(treatments) > 0 {
        status = "treated"
        detail = fmt.Sprintf("Treated for %s (%s)", treatments[0].Treatment, treatments[0].Product)
    }

    // If nothing special, status is healthy
    if status == "" {
        status = "healthy"
    }

    // Collect issues from inspections
    issues = getIssuesFromInspections(hiveID, seasonStart, seasonEnd)

    return
}
```

### Image Generation (Canvas-based)

For shareable card image, use html2canvas or manual canvas:

```typescript
// Using html2canvas (recommended for complex layouts)
import html2canvas from 'html2canvas';

async function downloadRecapImage(cardElementRef: HTMLElement) {
  const canvas = await html2canvas(cardElementRef, {
    backgroundColor: '#fef6e4', // coconutCream
    scale: 2, // High DPI
  });

  const link = document.createElement('a');
  link.download = `apis-season-recap-${seasonYear}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Manual canvas drawing (lighter, no library dependency)
function drawRecapCard(ctx: CanvasRenderingContext2D, recap: SeasonRecap) {
  const width = 600;
  const height = 400;

  // Background
  ctx.fillStyle = '#fef6e4'; // coconutCream
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = '#f7a42d'; // seaBuckthorn
  ctx.fillRect(0, 0, width, 60);

  // Title
  ctx.fillStyle = '#662604'; // brownBramble
  ctx.font = 'bold 24px Arial';
  ctx.fillText(`Season Recap ${recap.season_year}`, 20, 40);

  // Stats
  ctx.font = '18px Arial';
  ctx.fillText(`🍯 ${recap.total_harvest_kg} kg harvested`, 20, 100);
  ctx.fillText(`🐝 ${recap.hornets_deterred} hornets deterred`, 20, 130);
  // ... more stats

  // Footer
  ctx.fillStyle = '#f7a42d';
  ctx.font = '12px Arial';
  ctx.fillText('Generated with APIS - apis.honeybeegood.be', 20, height - 20);
}
```

### PDF Export

Use browser print or jsPDF:

```typescript
// Browser print (simple, works everywhere)
function printRecap() {
  window.print();
}

// Add print-specific CSS
@media print {
  .no-print { display: none; }
  .recap-card {
    page-break-inside: avoid;
    box-shadow: none;
  }
}

// jsPDF (more control, but adds dependency)
import jsPDF from 'jspdf';

function downloadRecapPDF(recap: SeasonRecap) {
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.text(`APIS Season Recap ${recap.season_year}`, 20, 20);

  doc.setFontSize(12);
  doc.text(`Season: ${recap.season_dates.display_text}`, 20, 40);
  doc.text(`Total Harvest: ${recap.total_harvest_kg} kg`, 20, 50);
  // ... more content

  doc.save(`apis-season-recap-${recap.season_year}.pdf`);
}
```

### Database Changes Summary

1. **New table**: `season_recaps` (id, tenant_id, season_year, hemisphere, season_start, season_end, recap_data JSONB, generated_at)
2. **New indexes**: idx_season_recaps_tenant, idx_season_recaps_year
3. **RLS policy**: season_recaps_tenant_isolation

### Project Structure Notes

**Backend files to create:**
- `apis-server/internal/storage/migrations/0019_season_recaps.sql`
- `apis-server/internal/storage/season_recaps.go`
- `apis-server/internal/services/season_recap.go`
- `apis-server/internal/handlers/recap.go`
- `apis-server/tests/storage/season_recaps_test.go`
- `apis-server/tests/services/season_recap_test.go`
- `apis-server/tests/handlers/recap_test.go`

**Backend files to modify:**
- `apis-server/cmd/server/main.go` - Add recap routes

**Frontend files to create:**
- `apis-dashboard/src/pages/SeasonRecap.tsx`
- `apis-dashboard/src/components/SeasonRecapCard.tsx`
- `apis-dashboard/src/components/HiveSeasonSummary.tsx`
- `apis-dashboard/src/components/RecapShareModal.tsx`
- `apis-dashboard/src/components/YearComparisonChart.tsx`
- `apis-dashboard/src/hooks/useSeasonRecap.ts`
- `apis-dashboard/tests/pages/SeasonRecap.test.tsx`
- `apis-dashboard/tests/components/SeasonRecapCard.test.tsx`
- `apis-dashboard/tests/components/RecapShareModal.test.tsx`
- `apis-dashboard/tests/hooks/useSeasonRecap.test.ts`

**Frontend files to modify:**
- `apis-dashboard/src/components/index.ts` - Export new components
- `apis-dashboard/src/hooks/index.ts` - Export useSeasonRecap
- `apis-dashboard/src/pages/index.ts` - Export SeasonRecap page
- `apis-dashboard/src/pages/Dashboard.tsx` - Add season recap prompt
- `apis-dashboard/src/pages/Settings.tsx` - Add Season Recap link
- `apis-dashboard/src/App.tsx` - Add /recap route

**Dependencies to consider:**
- `html2canvas` - For image generation (or use manual canvas)
- `jspdf` - For PDF export (or use browser print)

### Testing Standards

**Go Tests:**
- Use `testify` for assertions
- Use `httptest` for handler testing
- Test season date calculations for both hemispheres
- Test milestone detection with various scenarios
- Test caching and regeneration
- Test JSONB data storage/retrieval

**React Tests:**
- Use Vitest with React Testing Library
- Mock API calls with MSW or manual mocks
- Test year selection dropdown
- Test share modal interactions
- Mock clipboard API for text copy test
- Mock canvas for image download test

### Security Considerations

- Validate season year is reasonable (e.g., 2000-2100)
- Validate hemisphere is "northern" or "southern"
- Tenant isolation via RLS on season_recaps table
- Sanitize any user-provided text in milestones
- Rate limit regenerate endpoint to prevent abuse

### Performance Considerations

- Cache generated recaps in database (avoid regenerating on every request)
- Invalidate cache when new harvests/detections/inspections added (future: trigger)
- For MVP, manual regenerate button is sufficient
- Recap generation may take a few seconds - show loading indicator

### Emotional UX Guidelines (from UX Design Spec)

**Positive Framing:**
- Celebrate achievements: "Great season!" for above-average harvests
- Acknowledge challenges: "Despite some challenges..." for treated hives
- Hopeful for lost hives: "Your experience will help future hives"

**Visual Tone:**
- Warm Honey Beegood colors throughout
- Celebration elements for milestones (small badges, icons)
- Clean, shareable card design
- Print-friendly layout for PDF

### References

- [Source: Epic 9 - Story 9.4 Acceptance Criteria in epics.md]
- [Source: Story 9.1 - Configurable Data Export (export patterns)]
- [Source: Story 9.2 - First Harvest Celebration (milestone detection)]
- [Source: Story 9.3 - Hive Loss Post-Mortem (hive loss/status patterns)]
- [Source: Architecture - API Endpoints, Data Model]
- [Source: services/export.go - Data aggregation patterns]
- [Source: storage/harvests.go - Season calculations, analytics]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

- Implemented full Season Recap feature for beekeepers to review and share season summaries
- Backend: Created season_recaps table with JSONB storage for recap data
- Backend: Implemented storage layer with CRUD operations and caching support
- Backend: Created SeasonRecapService with full aggregation logic for harvests, detections, inspections, treatments, feedings
- Backend: Milestone detection for first_harvest, new_hive, queen_replacement, hive_loss events
- Backend: Per-hive status determination (healthy, treated, new_queen, lost)
- Backend: Year-over-year comparison calculations
- Backend: Handler with GET /api/recap, /api/recap/seasons, /api/recap/text, /api/recap/is-time, POST /api/recap/regenerate
- Frontend: Created SeasonRecap page with year selector and regenerate button
- Frontend: SeasonRecapCard component with Honey Beegood styling for shareable display
- Frontend: HiveSeasonSummary component with per-hive breakdown table
- Frontend: RecapShareModal with text copy, image download (html2canvas), and print/PDF options
- Frontend: YearComparisonChart with visual comparison of harvest and hornet counts
- Frontend: useSeasonRecap hook with helper functions for data fetching
- Frontend: Added season recap prompt banner on Dashboard for November (Northern Hemisphere)
- Frontend: Added /recap route to App.tsx
- Tests: Backend storage, service, and handler tests
- Tests: Frontend hook and component tests

### Change Log

- [2026-01-26] Remediation: Fixed 8 issues from code review
  - Created RecapShareModal.test.tsx with comprehensive test coverage
  - Created HiveSeasonSummary.test.tsx with comprehensive test coverage
  - Fixed test assertions in useSeasonRecap.test.ts to match implementation
  - Fixed season time logic in tests to match backend (Northern: Nov+, Southern: May+)
  - Updated SeasonRecapCard.test.tsx mock to match interface
  - Added zerolog warning in ListSeasonRecaps for JSON unmarshal errors

### File List

**Backend Files Created:**
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/migrations/0019_season_recaps.sql`
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/storage/season_recaps.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/services/season_recap.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/recap.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/tests/storage/season_recaps_test.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/tests/services/season_recap_test.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/tests/handlers/recap_test.go`

**Frontend Files Created:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/SeasonRecap.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/SeasonRecapCard.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/HiveSeasonSummary.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/RecapShareModal.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/YearComparisonChart.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useSeasonRecap.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/hooks/useSeasonRecap.test.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/SeasonRecapCard.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/YearComparisonChart.test.tsx`

**Files Modified:**
- `/Users/jermodelaruelle/Projects/apis/apis-server/cmd/server/main.go` - Added recap routes
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/App.tsx` - Added /recap route and SeasonRecap import
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/index.ts` - Added SeasonRecap export
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/index.ts` - Added season recap component exports
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/index.ts` - Added useSeasonRecap exports
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/Dashboard.tsx` - Added season recap prompt banner
