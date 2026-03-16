# Code Review: Story 1.3 Sidebar Layout & Navigation Shell

**Review Date:** 2026-01-26  
**Reviewer:** Codex (GPT-5.2)  
**Story File:** `_bmad-output/implementation-artifacts/1-3-sidebar-layout-navigation-shell.md`

## Story Verdict

- **Score:** 6.5 / 10
- **Verdict:** **CONCERNS**
- **Rationale:** The layout meets the core desktop/mobile shell behaviors, but active-state selection is likely broken for nested routes because it relies on exact pathname matching (`apis-dashboard/src/components/layout/AppLayout.tsx:92` `selectedKeys={[location.pathname]}`).

---

## Acceptance Criteria Verification

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: Sidebar structure | Implemented | `apis-dashboard/src/components/layout/AppLayout.tsx:194-206` `<Sider ...><Logo .../>{menuContent}` + `apis-dashboard/src/components/layout/navItems.tsx:20-29` `{ key: '/units' ... }` | Nav includes required sections; it also includes extra items (e.g., Calendar) as later-epic scope drift (`apis-dashboard/src/components/layout/navItems.tsx:25` `key: '/calendar'`). |
| AC2: Desktop sidebar behavior + persistence | Implemented | `apis-dashboard/src/components/layout/AppLayout.tsx:18-20` `COLLAPSE_KEY = 'apis-sidebar-collapsed'` + `apis-dashboard/src/components/layout/AppLayout.tsx:52-55` `localStorage.getItem` + `apis-dashboard/src/components/layout/AppLayout.tsx:59-61` `localStorage.setItem` | Collapse state is persisted; UX is solid. |
| AC3: Mobile hamburger + overlay drawer | Implemented | `apis-dashboard/src/components/layout/AppLayout.tsx:223-231` `icon={<MenuOutlined />}` + `apis-dashboard/src/components/layout/AppLayout.tsx:251-257` `<Drawer ... open={drawerOpen} ... />` | Drawer is hidden by default (`apis-dashboard/src/components/layout/AppLayout.tsx:56-57` `useState(false)`). |
| AC4: Navigation active state | Partial | `apis-dashboard/src/components/layout/AppLayout.tsx:75-79` `navigate(key)` + `apis-dashboard/src/components/layout/AppLayout.tsx:92` `selectedKeys={[location.pathname]}` | Works for top-level pages (`/units`), but not for nested routes like `/units/:id` where no Menu item key matches. |

---

## Findings

**F1: Active menu selection breaks on nested routes (no “best match” logic)**  
- Severity: Medium  
- Category: Correctness / UX  
- Evidence: `apis-dashboard/src/components/layout/AppLayout.tsx:92` `selectedKeys={[location.pathname]}` + `apis-dashboard/src/components/layout/navItems.tsx:23` `key: '/units'`  
- Why it matters: Users lose orientation on detail/edit/create pages (no nav highlight), which violates the “active state” expectation and makes the shell feel buggy.  
- Recommended fix: Derive `selectedKeys` as the longest matching prefix among nav item keys (e.g., `/units/123` → `/units`).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given I navigate to `/units/123`, when the page loads, then the “Units” nav item is highlighted.
  - AC2: Given I navigate to `/sites/create`, when the page loads, then the “Sites” nav item is highlighted.
  - Tests/Verification: update/add a test in `apis-dashboard/tests/layout.test.tsx` asserting selection for nested routes.  
- “Out of scope?”: no

**F2: Layout tests are out of sync with current navigation items (tests will fail or become noisy)**  
- Severity: Medium  
- Category: Testing / Maintainability  
- Evidence: `apis-dashboard/tests/layout.test.tsx:124-127` `expect(navItems?.length).toBe(8)` + `apis-dashboard/src/components/layout/navItems.tsx:25-29` includes `'/calendar'` plus other items  
- Why it matters: When foundational layout tests fail, they mask real regressions and reduce confidence in UI behavior.  
- Recommended fix: Update tests to reflect current nav structure (or assert a minimum required subset rather than an exact count).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given the current nav includes Calendar, when tests run, then nav item count/assertions match reality.
  - AC2: Given future additions, when a new item is added, then tests fail only if a required item is missing (not because of benign additions).
  - Tests/Verification: `npm test` (or `npx vitest run tests/layout.test.tsx`).  
- “Out of scope?”: no

**F3: Drawer-close effect suppresses exhaustive deps (risk of stale state behavior)**  
- Severity: Low  
- Category: Maintainability  
- Evidence: `apis-dashboard/src/components/layout/AppLayout.tsx:72` `// eslint-disable-line react-hooks/exhaustive-deps`  
- Why it matters: Suppressing deps often hides real bugs as code evolves (e.g., `isMobile` changes mid-session, state closes unexpectedly/never closes).  
- Recommended fix: Make the intent explicit in code by including the needed deps and guarding transitions (or move logic into the click handler and router navigation).  
- **Fix Acceptance Criteria (for a separate AI to implement):**
  - AC1: Given the viewport toggles between mobile and desktop, when routes change, then the drawer state is consistent and predictable.
  - Tests/Verification: add a unit test that simulates route change with drawer open and asserts it closes.  
- “Out of scope?”: yes (small internal refactor), but easy win

---

## Story Score Breakdown (0–2 each)

- **AC completeness:** 1.5 / 2 (AC4 is only partially met for nested routes; `apis-dashboard/src/components/layout/AppLayout.tsx:92` `selectedKeys=...`)  
- **Correctness / edge cases:** 1.5 / 2 (core behaviors work; active selection logic needs improvement)  
- **Security / privacy / secrets:** 1.5 / 2 (no obvious security issues in layout shell)  
- **Testing / verification:** 0.5 / 2 (layout tests are currently inconsistent with nav config; `apis-dashboard/tests/layout.test.tsx:124-127`)  
- **Maintainability / clarity / docs:** 1.5 / 2 (well-structured component; minor lint suppression)  

## What I Could Not Verify (story-specific)

- Real-device responsive behavior at the 768px breakpoint (logic is based on AntD breakpoints; needs browser runtime).  
- That all navigation items route correctly end-to-end with real pages (routes exist in `apis-dashboard/src/App.tsx:114-139`, but runtime navigation wasn’t executed here).  

