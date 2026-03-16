# Autonomous Frontend Stories Execution Plan

## Objective
Execute all 13 frontend stories from Epics 1, 2, 3 with proper verification:
- Apply `/frontend-design` skill to each component
- Verify against acceptance criteria
- Run code-review workflow
- Ensure all tests pass

## Pre-Flight Checks
```bash
cd /Users/jermodelaruelle/Projects/apis/apis-dashboard
npm run build  # Must pass
npm test       # Must pass (67 tests)
```

---

## Stories Execution Queue

### BATCH 1: Epic 1 - Portal Foundation (Already Enhanced)
These were enhanced in previous session. Quick verification only.

#### Story 1-2: Ant Design Theme ✅ DONE
- **File**: `src/theme/apisTheme.ts`
- **Status**: Enhanced with extended colors, touch targets, spacing
- **Action**: Verify only - run tests

#### Story 1-3: Sidebar Layout ✅ DONE
- **Files**: `src/components/layout/AppLayout.tsx`, `Logo.tsx`, `navItems.tsx`
- **Status**: Logo enhanced with glow effect
- **Action**: Verify only - run tests

#### Story 1-4: Login Page ✅ DONE
- **File**: `src/pages/Login.tsx`
- **Status**: Full redesign with honeycomb pattern
- **Action**: Verify only - run tests

---

### BATCH 2: Epic 2 - Site & Unit Management (Needs Review)

#### Story 2-1: Sites CRUD
- **Story File**: `_bmad-output/implementation-artifacts/2-1-create-and-manage-sites.md`
- **Component Files**:
  - `src/pages/Sites.tsx`
  - `src/pages/SiteCreate.tsx`
  - `src/pages/SiteDetail.tsx`
  - `src/pages/SiteEdit.tsx`
- **Acceptance Criteria to Verify**:
  - [ ] Site list displays with Honey Beegood theme
  - [ ] Create form has proper validation states
  - [ ] Edit form pre-populates correctly
  - [ ] Delete confirmation modal styled
  - [ ] Loading/error states handled
  - [ ] 64px touch targets on buttons
- **Actions**:
  1. Read story file for full AC
  2. Read each component file
  3. Apply /frontend-design enhancements if needed
  4. Verify build passes

#### Story 2-2: Units CRUD
- **Story File**: `_bmad-output/implementation-artifacts/2-2-register-apis-units.md`
- **Component Files**:
  - `src/pages/Units.tsx`
  - `src/pages/UnitRegister.tsx`
  - `src/pages/UnitDetail.tsx`
  - `src/pages/UnitEdit.tsx`
- **Acceptance Criteria to Verify**:
  - [ ] Unit list with status indicators
  - [ ] Registration form with API key display
  - [ ] Unit detail shows all metadata
  - [ ] Proper theme colors applied
  - [ ] Touch-friendly controls
- **Actions**:
  1. Read story file for full AC
  2. Read each component file
  3. Apply /frontend-design enhancements if needed
  4. Verify build passes

#### Story 2-4: Unit Status Cards
- **Story File**: `_bmad-output/implementation-artifacts/2-4-unit-status-dashboard-cards.md`
- **Component File**: `src/components/UnitStatusCard.tsx`
- **Acceptance Criteria to Verify**:
  - [ ] Card shows online/offline status with color coding
  - [ ] Last heartbeat time displayed
  - [ ] Detection count visible
  - [ ] Hover effect with warm shadow
  - [ ] Clickable with proper focus states
- **Actions**:
  1. Read story file for full AC
  2. Read component file
  3. Apply /frontend-design enhancements if needed
  4. Verify build passes

#### Story 2-5: Live Video Stream
- **Story File**: `_bmad-output/implementation-artifacts/2-5-live-video-websocket-proxy.md`
- **Component File**: `src/components/LiveStream.tsx` (or similar)
- **Acceptance Criteria to Verify**:
  - [ ] Video player styled with theme
  - [ ] Loading state while connecting
  - [ ] Error state if stream unavailable
  - [ ] Fullscreen toggle available
- **Actions**:
  1. Read story file for full AC
  2. Read component file
  3. Apply /frontend-design enhancements if needed
  4. Verify build passes

---

### BATCH 3: Epic 3 - Detection Dashboard (Needs Review)

#### Story 3-2: Today's Activity Card
- **Story File**: `_bmad-output/implementation-artifacts/3-2-todays-detection-count-card.md`
- **Component Files**:
  - `src/components/TodayActivityCard.tsx`
  - `src/hooks/useDetectionStats.ts`
- **Acceptance Criteria to Verify**:
  - [ ] Large detection count prominently displayed
  - [ ] "All quiet" state when zero detections (green)
  - [ ] Last detection time shown
  - [ ] Laser activation stats displayed
  - [ ] Proper gradient backgrounds
  - [ ] Loading skeleton styled
- **Actions**:
  1. Read story file for full AC
  2. Read component and hook files
  3. Apply /frontend-design enhancements if needed
  4. Verify build passes

#### Story 3-3: Weather Card
- **Story File**: `_bmad-output/implementation-artifacts/3-3-weather-integration.md`
- **Component Files**:
  - `src/components/WeatherCard.tsx`
  - `src/hooks/useWeather.ts`
- **Acceptance Criteria to Verify**:
  - [ ] Temperature displayed prominently
  - [ ] Weather emoji/icon shown
  - [ ] Feels like and humidity displayed
  - [ ] "No GPS" state handled
  - [ ] Stale data indicator with refresh
  - [ ] Proper theme gradient
- **Actions**:
  1. Read story file for full AC
  2. Read component and hook files
  3. Apply /frontend-design enhancements if needed
  4. Verify build passes

#### Story 3-4: Time Range Selector
- **Story File**: `_bmad-output/implementation-artifacts/3-4-time-range-selector.md`
- **Component Files**:
  - `src/components/TimeRangeSelector.tsx`
  - `src/context/TimeRangeContext.tsx`
- **Acceptance Criteria to Verify**:
  - [ ] Segmented control with all options (Day/Week/Month/Season/Year/All)
  - [ ] DatePicker appears for Day selection
  - [ ] Selected state uses seaBuckthorn color
  - [ ] URL sync working
  - [ ] 64px touch targets
- **Actions**:
  1. Read story file for full AC
  2. Read component and context files
  3. Apply /frontend-design enhancements if needed
  4. Verify build passes

#### Story 3-5: Activity Clock
- **Story File**: `_bmad-output/implementation-artifacts/3-5-activity-clock-visualization.md`
- **Component File**: `src/components/ActivityClockCard.tsx`
- **Acceptance Criteria to Verify**:
  - [ ] Radar/polar chart renders correctly
  - [ ] 24-hour labels at cardinal positions
  - [ ] Tooltip shows hour range and count
  - [ ] Empty state when no data
  - [ ] Loading state with spinning icon
  - [ ] seaBuckthorn color for data
- **Actions**:
  1. Read story file for full AC
  2. Read component file
  3. Apply /frontend-design enhancements if needed
  4. Verify build passes

#### Story 3-6: Temperature Correlation
- **Story File**: `_bmad-output/implementation-artifacts/3-6-temperature-correlation-chart.md`
- **Component Files**:
  - `src/components/TemperatureCorrelationCard.tsx`
  - `src/hooks/useTemperatureCorrelation.ts`
- **Acceptance Criteria to Verify**:
  - [ ] Scatter plot renders correctly
  - [ ] X-axis: Temperature, Y-axis: Detections
  - [ ] Regression line when 3+ points
  - [ ] Tooltip shows date/hour and values
  - [ ] Empty state handled
  - [ ] Theme colors applied
- **Actions**:
  1. Read story file for full AC
  2. Read component and hook files
  3. Apply /frontend-design enhancements if needed
  4. Verify build passes

#### Story 3-7: Trend Chart
- **Story File**: `_bmad-output/implementation-artifacts/3-7-daily-weekly-trend-line-chart.md`
- **Component Files**:
  - `src/components/TrendChartCard.tsx`
  - `src/hooks/useTrendData.ts`
- **Acceptance Criteria to Verify**:
  - [ ] Area chart with gradient fill
  - [ ] Smooth line connecting points
  - [ ] X-axis labels auto-hide when crowded
  - [ ] Tooltip shows period and count
  - [ ] Empty state when no detections
  - [ ] Loading state handled
- **Actions**:
  1. Read story file for full AC
  2. Read component and hook files
  3. Apply /frontend-design enhancements if needed
  4. Verify build passes

---

## Execution Workflow

For each story in BATCH 2 and BATCH 3:

```
STEP 1: Read story file
  → Extract acceptance criteria
  → Note specific requirements

STEP 2: Read component files
  → Check current implementation
  → Identify gaps vs acceptance criteria

STEP 3: Apply /frontend-design skill
  → Invoke skill with component context
  → Focus on: colors, touch targets, states, accessibility

STEP 4: Make enhancements
  → Edit files to meet all AC
  → Ensure Honey Beegood theme applied
  → Add loading/error/empty states if missing

STEP 5: Verify
  → npm run build (must pass)
  → npm test (must pass)

STEP 6: Mark complete, proceed to next
```

---

## Code Review (End of All Stories)

After all stories complete, run one comprehensive code review:

```
Invoke: bmad:bmm:workflows:code-review

Review scope:
- All Epic 1, 2, 3 frontend components
- Theme consistency
- Accessibility compliance
- Test coverage
```

If review finds issues:
1. Fix issues
2. Re-run build + tests
3. Re-run review (max 3 cycles)

---

## Final Verification Checklist

```bash
# 1. Build passes
cd /Users/jermodelaruelle/Projects/apis/apis-dashboard
npm run build

# 2. All tests pass
npm test

# 3. TypeScript strict mode
npx tsc --noEmit

# 4. Dev server runs
npm run dev &

# 5. Manual spot check (optional)
# - Open http://localhost:5174
# - Navigate to each section
# - Verify theme applied
# - Test on mobile viewport
```

---

## Success Criteria

- [ ] All 13 stories verified against acceptance criteria
- [ ] `/frontend-design` skill applied where enhancements needed
- [ ] Build passes with no errors
- [ ] All tests pass (67+ tests)
- [ ] Code review passes (or issues remediated)
- [ ] Honey Beegood theme consistent across all components

---

## Escalation

- If a component requires architectural changes → Stop and ask user
- If tests fail after 3 fix attempts → Stop and ask user
- If code review fails 3 times → Stop and ask user
