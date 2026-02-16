# Story 14.7: Mobile Refactor Hive Detail to Single Scroll Layout

Status: done

## Story

As a **beekeeper using mobile**,
I want **the hive detail page to be a single scrollable page with sections**,
so that **I can see all hive information without navigating between tabs**.

## Acceptance Criteria

### AC1: Mobile Single Scroll Layout (viewport < 768px)
- When viewport width is less than 768px, displays single scrollable page
- Page contains three distinct sections stacked vertically
- No tabs or horizontal navigation - pure vertical scroll
- Smooth, natural scrolling behavior

### AC2: Status Section (Top, Default View)
- Hive header with name, back button, settings
- Queen info: age, marking color
- Box configuration: brood boxes, supers
- Last inspection date
- Task summary: "Tasks: X open - Y overdue" (links to Tasks section via anchor scroll)
- Recent activity summary
- Inspection history accordion (collapsible)

### AC3: Tasks Section
- Section header: "TASKS (X)" with visual divider style
- Content placeholder for Story 14.9 implementation
- Anchored by `id="tasks-section"` for scroll targeting
- Full-width divider styling for clear visual separation

### AC4: Inspect Section
- Section header: "INSPECT" with visual divider style
- "Start New Inspection" button with 64px height (touch-friendly)
- Link to past inspections
- Anchored by `id="inspect-section"` for scroll targeting

### AC5: Section Headers
- Full-width divider style with clear visual separation
- Consistent styling across all three section headers
- Used as scroll targets for bottom navigation (Story 14.8)
- Format example: horizontal lines with centered text

### AC6: Desktop Layout Preservation (viewport >= 768px)
- When viewport width is 768px or greater, maintains existing tabbed/card layout
- No visual changes to desktop experience
- All existing functionality preserved

### AC7: Responsive Breakpoint
- Breakpoint at exactly 768px
- < 768px: Single scroll mobile layout (HiveDetailMobile)
- >= 768px: Desktop layout (HiveDetailDesktop) - existing behavior

## Tasks / Subtasks

- [x] **Task 1: Create SectionHeader component** (AC: 5)
  - [x] 1.1 Create `/apis-dashboard/src/components/SectionHeader.tsx`
  - [x] 1.2 Props: `title: string`, `count?: number`, `id?: string`
  - [x] 1.3 Render full-width divider with centered text
  - [x] 1.4 Style: horizontal lines on both sides of text, clear spacing
  - [x] 1.5 Support optional task count display in title (e.g., "TASKS (3)")
  - [x] 1.6 Apply `id` prop for scroll anchor targeting
  - [x] 1.7 Export from components/index.ts

- [x] **Task 2: Create HiveDetailMobile component** (AC: 1, 2, 3, 4)
  - [x] 2.1 Create `/apis-dashboard/src/components/HiveDetailMobile.tsx`
  - [x] 2.2 Props: `hive: Hive`, `siteHives: SiteHive[]`, and all state/handlers from HiveDetail
  - [x] 2.3 Render Status Section with all current hive info (queen, boxes, etc.)
  - [x] 2.4 Render Tasks Section with SectionHeader and placeholder content
  - [x] 2.5 Render Inspect Section with SectionHeader and action buttons
  - [x] 2.6 Apply section IDs for scroll targeting: `id="status-section"`, `id="tasks-section"`, `id="inspect-section"`
  - [x] 2.7 Ensure 64px height for "Start New Inspection" button
  - [x] 2.8 Make task summary clickable to scroll to tasks-section

- [x] **Task 3: Extract HiveDetailDesktop component** (AC: 6)
  - [x] 3.1 Create `/apis-dashboard/src/components/HiveDetailDesktop.tsx`
  - [x] 3.2 Move existing HiveDetail card/layout rendering to this component
  - [x] 3.3 Props mirror current HiveDetail internal state requirements
  - [x] 3.4 No visual changes to desktop layout
  - [x] 3.5 Preserve all existing functionality (modals, handlers, etc.)

- [x] **Task 4: Refactor HiveDetail page for responsive layout** (AC: 7)
  - [x] 4.1 Modify `/apis-dashboard/src/pages/HiveDetail.tsx`
  - [x] 4.2 Add `useMediaQuery` or `window.matchMedia` hook for breakpoint detection
  - [x] 4.3 Conditionally render HiveDetailMobile (< 768px) or HiveDetailDesktop (>= 768px)
  - [x] 4.4 All state and handlers remain in HiveDetail page (single source of truth)
  - [x] 4.5 Pass all necessary props to mobile and desktop components

- [x] **Task 5: Style mobile layout** (AC: 1, 2, 3, 4)
  - [x] 5.1 Apply proper spacing between sections
  - [x] 5.2 Ensure touch-friendly sizing (min 44px touch targets)
  - [x] 5.3 Style inspection history as collapsible accordion
  - [x] 5.4 Apply theme colors from apisTheme.ts
  - [x] 5.5 Ensure smooth scroll behavior via CSS `scroll-behavior: smooth`

- [x] **Task 6: Implement scroll to tasks functionality** (AC: 2)
  - [x] 6.1 Add click handler to HiveTaskSummary in mobile view
  - [x] 6.2 Use `document.getElementById('tasks-section').scrollIntoView({ behavior: 'smooth' })`
  - [x] 6.3 Alternatively, use React ref for scroll target

- [x] **Task 7: Write tests** (AC: 1-7)
  - [x] 7.1 Create `/apis-dashboard/tests/components/SectionHeader.test.tsx`
  - [x] 7.2 Test: Renders title correctly
  - [x] 7.3 Test: Renders count in title when provided
  - [x] 7.4 Test: Applies id prop for scroll targeting
  - [x] 7.5 Create `/apis-dashboard/tests/components/HiveDetailMobile.test.tsx`
  - [x] 7.6 Test: Renders all three sections
  - [x] 7.7 Test: Section anchors have correct IDs
  - [x] 7.8 Test: Task summary click scrolls to tasks section
  - [x] 7.9 Create `/apis-dashboard/tests/pages/HiveDetail.responsive.test.tsx`
  - [x] 7.10 Test: Mobile viewport renders HiveDetailMobile
  - [x] 7.11 Test: Desktop viewport renders HiveDetailDesktop

- [x] **Task 8: Export components** (AC: all)
  - [x] 8.1 Update `/apis-dashboard/src/components/index.ts` with new exports
  - [x] 8.2 Verify build compiles without errors

## Dev Notes

### IMPORTANT: Frontend Design Skill

This is a **FRONTEND story**. When implementing, invoke the `/frontend-design` skill for guidance on:
- Ant Design Collapse component for accordion (inspection history)
- Mobile-first responsive patterns
- CSS scroll-behavior property
- Touch target sizing per accessibility guidelines
- Theme colors from apisTheme.ts

### Architecture Compliance

**Frontend (React + Refine + Ant Design):**
- TypeScript interfaces for all component props
- Hooks for responsive breakpoint detection
- Preserve existing component composition patterns
- Colors and spacing from theme/apisTheme.ts

**Responsive Design Pattern:**
```tsx
// useMediaQuery hook pattern
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};
```

### Existing Patterns to Follow

**Current HiveDetail structure (lines 538-1110):**
- Multiple Card components with sections
- All state managed at page level
- Modal components rendered at bottom
- Navigation via react-router-dom useNavigate

**HiveTaskSummary integration (from Story 14.6):**
```tsx
<HiveTaskSummary
  open={hive.task_summary?.open || 0}
  overdue={hive.task_summary?.overdue || 0}
  hiveId={hive.id}
  onClick={() => navigate(`/tasks?hive_id=${hive.id}`)}
/>
```

For mobile, modify onClick to scroll to section instead:
```tsx
onClick={() => {
  document.getElementById('tasks-section')?.scrollIntoView({ behavior: 'smooth' });
}}
```

### SectionHeader Component Design

```tsx
interface SectionHeaderProps {
  title: string;
  count?: number;
  id?: string;
}

// Visual design:
// ──────────── TASKS (3) ────────────
//
// Using horizontal rules and centered text
```

**CSS for divider style:**
```css
.section-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 0 16px;
}

.section-header::before,
.section-header::after {
  content: '';
  flex: 1;
  height: 2px;
  background: linear-gradient(to right, transparent, var(--border-color), transparent);
}

.section-header-text {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-secondary);
}
```

### Mobile Layout Structure

```tsx
<div className="hive-detail-mobile">
  {/* Status Section - Default View */}
  <section id="status-section">
    <HiveHeader />
    <QueenInfo />
    <BoxConfiguration />
    <TaskSummary onClick={() => scrollToSection('tasks-section')} />
    <RecentActivity />
    <Collapse accordion>
      <Panel header="Inspection History">
        <InspectionHistory />
      </Panel>
    </Collapse>
  </section>

  {/* Tasks Section */}
  <SectionHeader title="TASKS" count={taskCount} id="tasks-section" />
  <section id="tasks-content">
    {/* Story 14.9 will implement content */}
    <Empty description="Tasks will appear here" />
  </section>

  {/* Inspect Section */}
  <SectionHeader title="INSPECT" id="inspect-section" />
  <section id="inspect-content">
    <Button
      type="primary"
      size="large"
      style={{ height: 64, width: '100%' }}
      onClick={() => navigate(`/hives/${id}/inspections/new`)}
    >
      Start New Inspection
    </Button>
    <Button
      type="link"
      onClick={() => /* scroll back to inspection history */}
    >
      View Past Inspections
    </Button>
  </section>
</div>
```

### Component Props Interface

**HiveDetailMobile Props (mirrors parent state):**
```typescript
interface HiveDetailMobileProps {
  hive: Hive;
  loading: boolean;

  // Navigation
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onNewInspection: () => void;

  // Queen management
  onReplaceQueen: () => void;

  // Task summary
  taskCount: number;
  overdueCount: number;

  // Modal triggers (passed down for action buttons)
  onLogTreatment: () => void;
  onLogFeeding: () => void;
  onLogHarvest: () => void;
  onLogEquipment: () => void;
  onMarkLost: () => void;
  onShowQR: () => void;

  // Data for display
  treatments: Treatment[];
  feedings: Feeding[];
  harvests: Harvest[];
  // ... additional data props
}
```

### Scroll Behavior

**CSS for smooth scrolling:**
```css
html {
  scroll-behavior: smooth;
}

/* Or scoped to mobile layout */
.hive-detail-mobile {
  scroll-behavior: smooth;
}
```

**JavaScript scroll with offset (for future bottom nav):**
```typescript
const scrollToSection = (sectionId: string) => {
  const element = document.getElementById(sectionId);
  if (element) {
    const offset = 64; // Account for bottom nav height (Story 14.8)
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  }
};
```

### Testing Strategy

**Viewport simulation for tests:**
```typescript
// Mock window.matchMedia for responsive tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: query.includes('max-width: 767px'),
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Or use resize-observer-polyfill for testing
```

### Project Structure Notes

**Files to Create:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/SectionHeader.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/HiveDetailMobile.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/HiveDetailDesktop.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/SectionHeader.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/HiveDetailMobile.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/pages/HiveDetail.responsive.test.tsx`

**Files to Modify:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/HiveDetail.tsx` (major refactor)
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/index.ts` (add exports)

### Dependencies (from previous stories)

**From Story 14.6 (DONE):**
- `HiveTaskSummary` component exists and is functional
- `task_summary` field available on Hive response
- Click handler navigates to /tasks (will be modified for mobile scroll)

**For Story 14.8 (NEXT):**
- Section IDs (`status-section`, `tasks-section`, `inspect-section`) will be used as scroll targets
- Bottom navigation will call `scrollToSection()` with these IDs

**For Story 14.9 (NEXT):**
- Tasks section placeholder will be replaced with actual task list
- `id="tasks-section"` anchor point is critical

### Ant Design Components Used

**Existing in HiveDetail:**
- Card, Descriptions, Space, Button, Tag, Timeline, Modal, Form, DatePicker, Select, Input
- Typography (Title, Text), Spin, Empty

**New for Mobile:**
- Collapse (for accordion inspection history)
- Divider (optional, for section separation)

**Collapse Pattern:**
```tsx
import { Collapse } from 'antd';

const { Panel } = Collapse;

<Collapse accordion defaultActiveKey={[]}>
  <Panel header="Inspection History" key="inspections">
    <InspectionHistory hiveId={id} hiveName={hive.name} />
  </Panel>
</Collapse>
```

### Styling Guidelines

**Theme colors (from apisTheme.ts):**
```typescript
import { colors } from '../theme/apisTheme';

// Section header text
const sectionHeaderStyle = {
  color: colors.textMuted,  // #95979c
  letterSpacing: '0.1em',
};

// Section divider lines
const dividerStyle = {
  borderColor: colors.borderLight || '#e8e8e8',
};

// Touch-friendly button
const touchButtonStyle = {
  height: 64,
  minHeight: 64,
  fontSize: 16,
};
```

### Performance Considerations

1. **Minimize re-renders**: HiveDetail page manages all state, passes only needed props
2. **Lazy evaluation**: Desktop component not mounted on mobile and vice versa
3. **Scroll performance**: Use CSS `scroll-behavior` over JS animation where possible
4. **Accordion optimization**: Only render inspection history content when expanded

### References

- [Source: _bmad-output/planning-artifacts/epic-14-hive-task-management.md#Story-14.7]
- [Source: CLAUDE.md#Frontend-Development]
- [Source: apis-dashboard/src/pages/HiveDetail.tsx - Current implementation]
- [Source: apis-dashboard/src/components/HiveTaskSummary.tsx - Task summary component]
- [Source: _bmad-output/implementation-artifacts/14-6-portal-hive-detail-task-integration.md - Previous story patterns]

## Test Criteria

- [x] Mobile viewport (< 768px) shows single scroll layout
- [x] Desktop viewport (>= 768px) shows existing tabbed layout
- [x] All three sections (Status, Tasks, Inspect) present on mobile
- [x] Section headers have correct visual styling (divider lines, centered text)
- [x] Section anchors have correct IDs for scroll targeting
- [x] Status section shows at top on page load
- [x] Task summary click scrolls to tasks section smoothly
- [x] "Start New Inspection" button is 64px height
- [x] Inspection history renders in collapsible accordion
- [x] No regression in desktop functionality
- [x] All component tests pass

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

No significant debug issues encountered during implementation.

### Completion Notes List

- Created SectionHeader component with full-width divider styling, optional count display, and id prop for scroll targeting
- Created HiveDetailMobile component with three distinct sections (Status, Tasks, Inspect) stacked vertically
- Created HiveDetailDesktop component extracting existing card-based layout from HiveDetail page
- Refactored HiveDetail page to use useIsMobile hook for responsive breakpoint detection at 768px
- Mobile layout includes collapsible accordion for inspection history using Ant Design Collapse
- Implemented smooth scroll to tasks section when clicking HiveTaskSummary in mobile view
- Start New Inspection button styled at 64px height for touch-friendly sizing
- All modals remain at page level and are shared between mobile and desktop layouts
- Component tests verify section rendering, anchor IDs, scroll behavior, and button handlers
- Responsive tests verify correct component is rendered at various viewport widths
- 49 total tests pass (15 SectionHeader, 24 HiveDetailMobile, 10 HiveDetail.responsive)

### File List

**New Files Created:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/SectionHeader.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/HiveDetailMobile.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/HiveDetailDesktop.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/SectionHeader.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/HiveDetailMobile.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/pages/HiveDetail.responsive.test.tsx`

**Modified Files:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/HiveDetail.tsx` - Major refactor to use responsive layout
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/index.ts` - Added exports for new components
- `/Users/jermodelaruelle/Projects/apis/_bmad-output/implementation-artifacts/sprint-status.yaml` - Updated story status

### Change Log

- 2026-01-30: Code Review Remediation - Fixed 6 issues
  - M1: Corrected test count in Completion Notes (42 → 47 tests)
  - M2: Removed unused mock handlers (onLogTreatment, onLogFeeding, onLogHarvest, onLogEquipment) from HiveDetailMobile tests
  - M3: Added 2 live viewport resize tests to verify dynamic layout switching
  - L1: Removed inconsistent minHeight: 64 from desktop QR button
  - L2: Changed confusing "View Past Inspections" link to "↑ Scroll to Inspection History"
  - L3: Simplified nested Text components in task summary overdue styling

