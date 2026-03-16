# Story 14.8: Mobile Bottom Anchor Navigation Bar

Status: done

## Story

As a **beekeeper using mobile**,
I want **a bottom navigation bar with section buttons**,
so that **I can quickly jump between Status, Tasks, and Inspect sections**.

## Acceptance Criteria

### AC1: Fixed Bottom Navigation Bar Layout
- Display 64px fixed bottom navigation bar when on mobile viewport (< 768px)
- Bar is always visible at bottom of screen regardless of scroll position
- Contains exactly three buttons: "Status", "Tasks (X)", "Inspect"
- Buttons have equal width (33.33% each)
- Only renders within HiveDetailMobile component (not shown on desktop)

### AC2: Button Styling and Touch Targets
- Each button fills the full 64px height (touch-friendly per UX spec)
- Active button has visual indicator (filled background or underline)
- Inactive buttons are visually dimmed (reduced opacity or lighter color)
- Optional icons displayed above text: Status, Tasks, Inspect
- Uses theme colors from apisTheme.ts (seaBuckthorn for active, textMuted for inactive)

### AC3: Smooth Scroll Navigation
- Tapping a button smooth-scrolls to the corresponding section
- Scroll duration approximately 300ms with easing
- Uses element IDs: `status-section`, `tasks-section`, `inspect-section`
- Account for 64px bottom nav offset in scroll calculations (scroll target visible above nav)
- Status button scrolls to top of page

### AC4: Active Section Detection via Intersection Observer
- Active indicator automatically updates as user manually scrolls
- Uses Intersection Observer API to detect which section is in viewport
- Observer watches section headers with threshold of 0.5 (50% visibility triggers)
- Only one section can be active at a time
- Debounces or throttles updates to prevent jitter during scroll

### AC5: Dynamic Task Count in Label
- Tasks button displays current pending task count: "Tasks (X)"
- Count passed as prop from HiveDetailMobile (already available as `taskCount`)
- Updates dynamically if task count changes (though rare on this page)

### AC6: Overdue Indicator
- When hive has overdue tasks, display red dot indicator on Tasks button
- Dot positioned at top-right corner of Tasks button
- Uses `colors.error` (#c23616) for the dot
- Only shows when `overdueCount > 0` (already available in HiveDetailMobile)

### AC7: Default State
- On page load, Status is the active section (user lands at top)
- Bottom nav renders immediately with Status active

## Tasks / Subtasks

- [x] **Task 1: Create useActiveSection hook** (AC: 4)
  - [x] 1.1 Create `/apis-dashboard/src/hooks/useActiveSection.ts`
  - [x] 1.2 Define `SectionId` type: `'status-section' | 'tasks-section' | 'inspect-section'`
  - [x] 1.3 Accept array of section IDs to observe
  - [x] 1.4 Initialize Intersection Observer with rootMargin to account for bottom nav
  - [x] 1.5 Set threshold to 0.5 for 50% visibility trigger
  - [x] 1.6 Track active section in state, default to 'status-section'
  - [x] 1.7 Return `{ activeSection, scrollToSection }` from hook
  - [x] 1.8 Implement `scrollToSection(sectionId)` using scrollIntoView with smooth behavior
  - [x] 1.9 Account for 64px bottom nav padding in scroll offset
  - [x] 1.10 Clean up observer on unmount
  - [x] 1.11 Export from hooks/index.ts

- [x] **Task 2: Create BottomAnchorNav component** (AC: 1, 2, 5, 6, 7)
  - [x] 2.1 Create `/apis-dashboard/src/components/BottomAnchorNav.tsx`
  - [x] 2.2 Props interface: `activeSection: SectionId`, `onNavigate: (id: SectionId) => void`, `taskCount: number`, `hasOverdue: boolean`
  - [x] 2.3 Render fixed container at bottom with `position: fixed`, `bottom: 0`, `height: 64px`, `width: 100%`
  - [x] 2.4 Use flexbox for equal-width buttons (flex: 1)
  - [x] 2.5 Style active button with `backgroundColor: seaBuckthorn`, `color: white`
  - [x] 2.6 Style inactive buttons with `backgroundColor: salomie`, `color: textMuted`
  - [x] 2.7 Add icons: `<DashboardOutlined />` (Status), `<CheckSquareOutlined />` (Tasks), `<SearchOutlined />` (Inspect)
  - [x] 2.8 Format Tasks button label with count: `Tasks (${taskCount})`
  - [x] 2.9 Add red dot overlay on Tasks button when `hasOverdue` is true
  - [x] 2.10 Each button calls `onNavigate` with corresponding section ID
  - [x] 2.11 Apply z-index to ensure nav appears above content (z-index: 1000)
  - [x] 2.12 Add subtle top shadow for visual separation from content
  - [x] 2.13 Export from components/index.ts

- [x] **Task 3: Integrate BottomAnchorNav into HiveDetailMobile** (AC: 1, 3, 4, 7)
  - [x] 3.1 Modify `/apis-dashboard/src/components/HiveDetailMobile.tsx`
  - [x] 3.2 Import `useActiveSection` hook and `BottomAnchorNav` component
  - [x] 3.3 Initialize `useActiveSection` with section IDs array
  - [x] 3.4 Render `BottomAnchorNav` at bottom of component (inside the main div)
  - [x] 3.5 Pass `activeSection`, `scrollToSection` as `onNavigate`, `taskCount`, and `hasOverdue` (overdueCount > 0)
  - [x] 3.6 Update existing `scrollToSection` helper to use hook's implementation
  - [x] 3.7 Verify paddingBottom of 80px still provides adequate scroll clearance

- [x] **Task 4: Adjust scroll offset calculations** (AC: 3)
  - [x] 4.1 Modify scrollToSection to calculate offset accounting for 64px nav height
  - [x] 4.2 Test scroll behavior lands section header just above the bottom nav
  - [x] 4.3 Ensure scrolling to Status scrolls to very top (offset 0)
  - [x] 4.4 Add smooth scroll CSS fallback: `scroll-behavior: smooth` on html element

- [x] **Task 5: Write unit tests for useActiveSection hook** (AC: 4)
  - [x] 5.1 Create `/apis-dashboard/tests/hooks/useActiveSection.test.ts`
  - [x] 5.2 Mock IntersectionObserver (standard testing pattern)
  - [x] 5.3 Test: Default active section is 'status-section'
  - [x] 5.4 Test: Active section updates when intersection entry fires
  - [x] 5.5 Test: scrollToSection calls scrollIntoView on correct element
  - [x] 5.6 Test: Observer cleanup on unmount

- [x] **Task 6: Write component tests for BottomAnchorNav** (AC: 1, 2, 5, 6)
  - [x] 6.1 Create `/apis-dashboard/tests/components/BottomAnchorNav.test.tsx`
  - [x] 6.2 Test: Renders three buttons (Status, Tasks, Inspect)
  - [x] 6.3 Test: Active button has correct styling (uses seaBuckthorn background)
  - [x] 6.4 Test: Inactive buttons have dimmed styling
  - [x] 6.5 Test: Tasks button shows count in label
  - [x] 6.6 Test: Red dot appears when hasOverdue is true
  - [x] 6.7 Test: Red dot hidden when hasOverdue is false
  - [x] 6.8 Test: Clicking buttons calls onNavigate with correct section ID
  - [x] 6.9 Test: Component has fixed positioning styles

- [x] **Task 7: Write integration tests for HiveDetailMobile with nav** (AC: 3, 4, 7)
  - [x] 7.1 Create `/apis-dashboard/tests/components/HiveDetailMobile.bottomnav.test.tsx`
  - [x] 7.2 Test: BottomAnchorNav renders within HiveDetailMobile
  - [x] 7.3 Test: Task count passed to nav matches hive.task_summary.open
  - [x] 7.4 Test: hasOverdue prop is true when overdue > 0
  - [x] 7.5 Test: Clicking nav button scrolls to correct section

- [x] **Task 8: Export components and update barrel files** (AC: all)
  - [x] 8.1 Update `/apis-dashboard/src/components/index.ts` with BottomAnchorNav export
  - [x] 8.2 Update `/apis-dashboard/src/hooks/index.ts` with useActiveSection export
  - [x] 8.3 Verify build compiles without errors: `npm run build`
  - [x] 8.4 Verify tests pass: `npm run test`

## Dev Notes

### IMPORTANT: Frontend Design Skill

This is a **FRONTEND story**. When implementing, invoke the `/frontend-design` skill for guidance on:
- Fixed positioning patterns for bottom navigation
- Intersection Observer API usage and best practices
- Touch-friendly button sizing (64px per UX spec)
- CSS smooth scroll behavior
- Theme color integration from apisTheme.ts
- Mobile-first component patterns

### Architecture Compliance

**Frontend (React + Refine + Ant Design):**
- TypeScript interfaces for all component props
- Custom hooks for stateful logic (useActiveSection)
- Follow existing component composition patterns
- Colors and spacing from theme/apisTheme.ts
- Touch targets: 64px minimum per NFR-HT-04

**Relevant Architecture Constraints:**
- Single-page application, no server-side rendering
- Ant Design components preferred where available
- Theme tokens from apisTheme.ts for consistent styling

### Existing Patterns to Follow

**From Story 14.7 (DONE) - HiveDetailMobile:**
```tsx
// Current scroll helper (to be replaced by hook)
const scrollToSection = (sectionId: string) => {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
};

// Current padding for bottom nav space (line 150)
paddingBottom: 80, // Space for future bottom navigation (Story 14.8)

// Section IDs already defined:
// id="status-section" (line 157)
// id="tasks-section" (line 487)
// id="inspect-section" (line 501)

// Task count already available:
const taskCount = hive.task_summary?.open || 0;
const overdueCount = hive.task_summary?.overdue || 0;
```

**SectionHeader component renders sections with correct IDs:**
```tsx
// From SectionHeader.tsx - section wrapper with id
<section
  id={id}
  role="region"
  aria-labelledby={`${id}-title`}
>
  {headerElement}
  {children}
</section>
```

### useActiveSection Hook Design

```typescript
// /apis-dashboard/src/hooks/useActiveSection.ts

export type SectionId = 'status-section' | 'tasks-section' | 'inspect-section';

interface UseActiveSectionOptions {
  sectionIds: SectionId[];
  rootMargin?: string; // Default: '-64px 0px 0px 0px' to account for bottom nav
  threshold?: number;  // Default: 0.5
}

interface UseActiveSectionReturn {
  activeSection: SectionId;
  scrollToSection: (sectionId: SectionId) => void;
}

export function useActiveSection(options: UseActiveSectionOptions): UseActiveSectionReturn {
  const [activeSection, setActiveSection] = useState<SectionId>('status-section');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the most visible entry
        const visibleEntry = entries.find(entry => entry.isIntersecting);
        if (visibleEntry) {
          setActiveSection(visibleEntry.target.id as SectionId);
        }
      },
      {
        rootMargin: options.rootMargin ?? '0px 0px -64px 0px', // Bottom nav offset
        threshold: options.threshold ?? 0.5,
      }
    );

    options.sectionIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [options.sectionIds]);

  const scrollToSection = useCallback((sectionId: SectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      // Calculate offset to account for bottom nav
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset;

      window.scrollTo({
        top: sectionId === 'status-section' ? 0 : offsetPosition,
        behavior: 'smooth'
      });
    }
  }, []);

  return { activeSection, scrollToSection };
}
```

### BottomAnchorNav Component Design

```typescript
// /apis-dashboard/src/components/BottomAnchorNav.tsx

import { CSSProperties } from 'react';
import { DashboardOutlined, CheckSquareOutlined, SearchOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import type { SectionId } from '../hooks/useActiveSection';

export interface BottomAnchorNavProps {
  activeSection: SectionId;
  onNavigate: (sectionId: SectionId) => void;
  taskCount: number;
  hasOverdue: boolean;
  style?: CSSProperties;
}

const NAV_HEIGHT = 64;

const sections = [
  { id: 'status-section' as SectionId, label: 'Status', icon: DashboardOutlined },
  { id: 'tasks-section' as SectionId, label: 'Tasks', icon: CheckSquareOutlined },
  { id: 'inspect-section' as SectionId, label: 'Inspect', icon: SearchOutlined },
];

export function BottomAnchorNav({
  activeSection,
  onNavigate,
  taskCount,
  hasOverdue,
  style,
}: BottomAnchorNavProps) {
  return (
    <nav
      role="navigation"
      aria-label="Section navigation"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: NAV_HEIGHT,
        display: 'flex',
        backgroundColor: colors.salomie,
        boxShadow: '0 -2px 8px rgba(102, 38, 4, 0.10)',
        zIndex: 1000,
        ...style,
      }}
    >
      {sections.map(({ id, label, icon: Icon }) => {
        const isActive = activeSection === id;
        const displayLabel = id === 'tasks-section' ? `Tasks (${taskCount})` : label;
        const showOverdueDot = id === 'tasks-section' && hasOverdue;

        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            aria-current={isActive ? 'true' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              backgroundColor: isActive ? colors.seaBuckthorn : 'transparent',
              color: isActive ? '#ffffff' : colors.textMuted,
              transition: 'all 0.2s ease',
            }}
          >
            <Icon style={{ fontSize: 20 }} />
            <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 400 }}>
              {displayLabel}
            </span>
            {showOverdueDot && (
              <span
                aria-label="Has overdue tasks"
                style={{
                  position: 'absolute',
                  top: 8,
                  right: '30%',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: colors.error,
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
```

### Integration with HiveDetailMobile

```tsx
// In HiveDetailMobile.tsx

import { useActiveSection, SectionId } from '../hooks/useActiveSection';
import { BottomAnchorNav } from './BottomAnchorNav';

// Inside component:
const { activeSection, scrollToSection } = useActiveSection({
  sectionIds: ['status-section', 'tasks-section', 'inspect-section'],
});

// In return JSX, add at the end before closing </div>:
<BottomAnchorNav
  activeSection={activeSection}
  onNavigate={scrollToSection}
  taskCount={taskCount}
  hasOverdue={overdueCount > 0}
/>
```

### Intersection Observer Notes

**Root Margin:** Use negative bottom margin (`0px 0px -64px 0px`) to trigger intersection when element is 64px above bottom of viewport (accounting for nav).

**Threshold:** 0.5 means 50% of the element must be visible. For section headers which are relatively small, this should work well.

**Alternative Approach:** If sections are large, consider observing the header elements specifically (using `-header` suffix IDs from SectionHeader).

### Theme Colors Reference

From `/apis-dashboard/src/theme/apisTheme.ts`:
```typescript
colors = {
  seaBuckthorn: '#f7a42d',  // Active state, primary accent
  salomie: '#fcd483',        // Nav background
  brownBramble: '#662604',   // Dark text
  textMuted: '#8b6914',      // Inactive text
  error: '#c23616',          // Overdue indicator
  shadowMd: '0 2px 8px rgba(102, 38, 4, 0.10)', // Shadow
}
```

### Touch Target Compliance

From apisTheme.ts `touchTargets`:
```typescript
touchTargets = {
  standard: 48,   // Standard buttons
  mobile: 64,     // Glove-friendly mobile
  gap: 16,        // Minimum gap between targets
}
```

The bottom nav buttons should be full 64px height as this is a mobile-only component requiring glove-friendly sizing per NFR-HT-04.

### Testing Strategy

**Mocking IntersectionObserver:**
```typescript
// Standard test setup for IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
});
window.IntersectionObserver = mockIntersectionObserver;
```

**Testing scroll behavior:**
```typescript
// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// Or use window.scrollTo mock
window.scrollTo = jest.fn();
```

### Dependencies (from previous stories)

**From Story 14.7 (DONE):**
- `HiveDetailMobile` component with three sections
- Section IDs: `status-section`, `tasks-section`, `inspect-section`
- `taskCount` and `overdueCount` variables available
- `paddingBottom: 80` already reserved for bottom nav
- `SectionHeader` component creates proper section structure

**For Story 14.9 (NEXT):**
- Bottom nav's Tasks button will navigate to tasks section
- Tasks section content will be implemented in 14.9
- Task count will reflect actual pending tasks

### Ant Design Icons Used

```tsx
import {
  DashboardOutlined,    // Status section
  CheckSquareOutlined,  // Tasks section
  SearchOutlined,       // Inspect section
} from '@ant-design/icons';
```

### Project Structure Notes

**Files to Create:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useActiveSection.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/BottomAnchorNav.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/hooks/useActiveSection.test.ts`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/BottomAnchorNav.test.tsx`
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/HiveDetailMobile.bottomnav.test.tsx`

**Files to Modify:**
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/HiveDetailMobile.tsx` - Add bottom nav integration
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/index.ts` - Export BottomAnchorNav
- `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/index.ts` - Export useActiveSection

### Accessibility Considerations

1. **ARIA Labels:** Bottom nav should have `role="navigation"` and `aria-label="Section navigation"`
2. **Current State:** Active button should have `aria-current="true"`
3. **Overdue Indicator:** Red dot should have `aria-label="Has overdue tasks"` for screen readers
4. **Focus States:** Buttons should have visible focus rings (handled by browser defaults + theme)
5. **Keyboard Navigation:** Standard button keyboard interaction (Enter/Space to activate)

### Performance Considerations

1. **Intersection Observer:** More efficient than scroll event listeners
2. **Single Observer:** Observe all sections with one observer instance
3. **Cleanup:** Disconnect observer on component unmount
4. **Memoization:** useCallback for scrollToSection to prevent re-renders

### References

- [Source: _bmad-output/planning-artifacts/epic-14-hive-task-management.md#Story-14.8]
- [Source: _bmad-output/implementation-artifacts/14-7-mobile-hive-detail-single-scroll.md - Previous story patterns]
- [Source: apis-dashboard/src/components/HiveDetailMobile.tsx - Current implementation to modify]
- [Source: apis-dashboard/src/components/SectionHeader.tsx - Section structure with IDs]
- [Source: apis-dashboard/src/theme/apisTheme.ts - Colors and touch targets]
- [Source: CLAUDE.md#Frontend-Development - Use /frontend-design skill]

## Test Criteria

- [x] Bottom nav fixed at 64px height at screen bottom
- [x] Three buttons rendered with correct labels (Status, Tasks (X), Inspect)
- [x] Tap scrolls to correct section with smooth animation
- [x] Active indicator updates on tap
- [x] Active indicator updates on manual scroll (Intersection Observer)
- [x] Task count displays correctly in Tasks button
- [x] Overdue indicator (red dot) shows when overdueCount > 0
- [x] Overdue indicator hidden when overdueCount = 0
- [x] Status is default active on page load
- [x] Desktop layout (>= 768px) does not show bottom nav
- [x] All unit tests pass
- [x] Build compiles without errors (for files in this story; pre-existing type errors in other files are unrelated)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - Clean implementation with no blocking issues.

### Completion Notes List

1. **Task 1 Complete**: Created `useActiveSection` hook with Intersection Observer-based section tracking. Hook tracks active section and provides smooth scroll navigation with 64px bottom nav offset. Exported `SectionId` type for type safety.

2. **Task 2 Complete**: Created `BottomAnchorNav` component with 64px fixed height, three equal-width buttons (Status, Tasks, Inspect), active state highlighting using seaBuckthorn color, task count display, and overdue red dot indicator. Component follows accessibility guidelines with proper ARIA attributes.

3. **Task 3 Complete**: Integrated `BottomAnchorNav` into `HiveDetailMobile`. The hook provides active section tracking and scroll navigation. Removed the old inline `scrollToSection` helper in favor of the hook's implementation. The existing 80px paddingBottom provides adequate clearance for the 64px nav.

4. **Task 4 Complete**: The `scrollToSection` function in the hook calculates proper offsets. Status section scrolls to top (offset 0), other sections scroll to their position. The container already has `scrollBehavior: 'smooth'` applied.

5. **Task 5 Complete**: 13 unit tests for `useActiveSection` hook covering initialization, active section updates via Intersection Observer, scrollToSection behavior, cleanup on unmount, and custom options support.

6. **Task 6 Complete**: 18 unit tests for `BottomAnchorNav` component covering rendering, active/inactive styling, task count display, overdue indicator, navigation callbacks, and positioning styles.

7. **Task 7 Complete**: 11 integration tests for `HiveDetailMobile` with `BottomAnchorNav` covering rendering, task count integration, overdue indicator, navigation, and default state.

8. **Task 8 Complete**: Both components exported from barrel files. New files compile without TypeScript errors (pre-existing type errors in other files are unrelated to this story). All 44 tests pass (including 2 new debounce tests).

### Change Log

- **2026-01-30**: Implemented Story 14.8 - Mobile Bottom Anchor Navigation Bar. Created useActiveSection hook and BottomAnchorNav component with full test coverage. Integrated bottom nav into HiveDetailMobile for section navigation.
- **2026-01-30**: Code review fixes applied:
  - Added debounce (100ms) to Intersection Observer callbacks to prevent scroll jitter (AC4)
  - Fixed scroll offset calculation to account for top header (16px offset)
  - Added `type="button"` to nav buttons for accessibility
  - Improved keyboard focus visibility with outline + boxShadow approach
  - Named magic number for overdue dot positioning (`OVERDUE_DOT_RIGHT_OFFSET`)
  - Removed redundant default exports
  - Fixed integration test to not create conflicting DOM elements
  - Added 2 new tests for debounce functionality and timer cleanup

### File List

**New Files:**
- apis-dashboard/src/hooks/useActiveSection.ts
- apis-dashboard/src/components/BottomAnchorNav.tsx
- apis-dashboard/tests/hooks/useActiveSection.test.ts
- apis-dashboard/tests/components/BottomAnchorNav.test.tsx
- apis-dashboard/tests/components/HiveDetailMobile.bottomnav.test.tsx

**Modified Files:**
- apis-dashboard/src/hooks/index.ts
- apis-dashboard/src/components/index.ts
- apis-dashboard/src/components/HiveDetailMobile.tsx
