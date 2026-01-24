# Story 1.3: Sidebar Layout & Navigation Shell

Status: done

## Story

As a **user**,
I want a sidebar navigation that shows all main sections,
So that I can easily navigate between Dashboard, Units, Hives, Clips, and Settings.

## Acceptance Criteria

### AC1: Sidebar structure
**Given** I am on any page of the dashboard
**When** I view the layout
**Then** I see a sidebar on the left with the APIS logo at top
**And** navigation items: Dashboard, Units, Hives, Clips, Statistics, Settings
**And** the main content area is on the right

### AC2: Desktop sidebar behavior
**Given** I am on desktop (viewport > 768px)
**When** I view the sidebar
**Then** it shows icons with labels
**And** is collapsible to icon-only mode
**And** collapse state persists in localStorage

### AC3: Mobile hamburger menu
**Given** I am on mobile (viewport ≤ 768px)
**When** I view the layout
**Then** the sidebar is hidden by default
**And** a hamburger menu icon appears in the header
**And** tapping it reveals the sidebar as an overlay

### AC4: Navigation active state
**Given** I click a navigation item
**When** the page loads
**Then** that navigation item is highlighted as active
**And** the URL updates to match the section

## Tasks / Subtasks

- [x] **Task 1: Create AppLayout component** (AC: 1, 2)
  - [x] 1.1: Create `apis-dashboard/src/components/layout/AppLayout.tsx`
  - [x] 1.2: Use Ant Design Layout with Sider + Content structure
  - [x] 1.3: Configure sidebar width (expanded: 200px, collapsed: 80px)
  - [x] 1.4: Apply theme colors from apisTheme (sider uses brownBramble)
  - [x] 1.5: Add collapse button integrated into sidebar
  - [x] 1.6: Persist collapse state to localStorage

- [x] **Task 2: Create Logo component** (AC: 1)
  - [x] 2.1: Create `apis-dashboard/src/components/layout/Logo.tsx`
  - [x] 2.2: Display "🐝 APIS" text (or icon) when expanded
  - [x] 2.3: Display "🐝" only when collapsed
  - [x] 2.4: Use coconutCream text color on brownBramble background

- [x] **Task 3: Create navigation menu** (AC: 1, 4)
  - [x] 3.1: Define navigation items array with routes, icons, labels
  - [x] 3.2: Use Ant Design Menu component with theme="dark" style
  - [x] 3.3: Map items: Dashboard (/), Units (/units), Hives (/hives), Clips (/clips), Statistics (/statistics), Settings (/settings)
  - [x] 3.4: Use appropriate Ant Design icons for each item
  - [x] 3.5: Highlight active item based on current route (useLocation)

- [x] **Task 4: Implement mobile responsiveness** (AC: 3)
  - [x] 4.1: Use Ant Design's responsive Sider breakpoint (breakpoint="md")
  - [x] 4.2: Configure collapsedWidth={0} on mobile to fully hide sidebar
  - [x] 4.3: Add hamburger button in header area visible only on mobile
  - [x] 4.4: Sidebar overlays content as Drawer on mobile
  - [x] 4.5: Clicking menu item on mobile closes sidebar overlay

- [x] **Task 5: Integrate layout with routing** (AC: 4)
  - [x] 5.1: Update App.tsx to use AppLayout as wrapper for all routes
  - [x] 5.2: Create placeholder page components for each route
  - [x] 5.3: Configure React Router routes for all navigation items
  - [x] 5.4: Ensure Refine resources match navigation structure

- [x] **Task 6: Testing** (AC: 1, 2, 3, 4)
  - [x] 6.1: Test AppLayout renders with sidebar and content area
  - [x] 6.2: Test navigation items are present and clickable
  - [x] 6.3: Test active state matches current route
  - [x] 6.4: Test collapse button toggles sidebar width
  - [x] 6.5: Test localStorage persistence of collapse state

## Dev Notes

### Ant Design Layout API

Ant Design provides a Layout component with Sider for sidebar navigation. Key props:

```typescript
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';

const { Sider, Content } = Layout;

// Sider with collapse support
<Sider
  collapsible
  collapsed={collapsed}
  onCollapse={setCollapsed}
  breakpoint="md"           // Collapse automatically at 768px
  collapsedWidth={0}        // Fully hide on mobile (when triggered)
  width={200}               // Expanded width
  theme="dark"              // Dark theme for brown background
  trigger={null}            // Custom trigger button
/>
```

### Navigation Items Structure

```typescript
import {
  DashboardOutlined,
  ApiOutlined,
  HomeOutlined,
  VideoCameraOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';

const navItems: MenuProps['items'] = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/units', icon: <ApiOutlined />, label: 'Units' },
  { key: '/hives', icon: <HomeOutlined />, label: 'Hives' },
  { key: '/clips', icon: <VideoCameraOutlined />, label: 'Clips' },
  { key: '/statistics', icon: <BarChartOutlined />, label: 'Statistics' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];
```

### Theme Integration

The theme from Story 1.2 includes Layout-specific tokens:

```typescript
// From apisTheme.ts
components: {
  Layout: {
    bodyBg: colors.coconutCream,       // #fbf9e7
    headerBg: colors.brownBramble,     // #662604
    siderBg: colors.brownBramble,      // #662604
  },
}
```

The sidebar should use `theme="dark"` on Menu to get light text on dark background. Ant Design will use the siderBg color automatically.

### Mobile Drawer Pattern

For mobile, instead of collapsing in-place, use a Drawer overlay:

```typescript
import { Drawer, Button } from 'antd';
import { MenuOutlined } from '@ant-design/icons';

// Mobile header with hamburger
<Header style={{ display: isMobile ? 'flex' : 'none' }}>
  <Button icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
</Header>

// Drawer for mobile navigation
<Drawer
  placement="left"
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  width={200}
>
  {/* Same Menu component as sidebar */}
</Drawer>
```

### Responsive Detection

Use Ant Design's Grid breakpoints or a custom hook:

```typescript
import { Grid } from 'antd';

const { useBreakpoint } = Grid;

function AppLayout() {
  const screens = useBreakpoint();
  const isMobile = !screens.md; // True when viewport < 768px
  // ...
}
```

### File Structure

```
apis-dashboard/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx    # NEW: Main layout wrapper
│   │   │   ├── Logo.tsx         # NEW: Logo component
│   │   │   ├── Sidebar.tsx      # NEW: Sidebar navigation (optional split)
│   │   │   └── index.ts         # Barrel export
│   │   ├── ApiCard.tsx          # From Story 1.2
│   │   └── index.ts
│   ├── pages/
│   │   ├── Dashboard.tsx        # NEW: Placeholder
│   │   ├── Units.tsx            # NEW: Placeholder
│   │   ├── Hives.tsx            # NEW: Placeholder
│   │   ├── Clips.tsx            # NEW: Placeholder
│   │   ├── Statistics.tsx       # NEW: Placeholder
│   │   ├── Settings.tsx         # NEW: Placeholder
│   │   └── index.ts             # Barrel export
│   ├── App.tsx                  # MODIFY: Use AppLayout
│   └── ...
```

### Architecture Compliance

**From Architecture Document:**
- AR18: Use React + Refine + Ant Design
- Layout pattern: Sidebar navigation with collapsible desktop, hamburger mobile

**From UX Design Specification:**
- Desktop: Sidebar shows icons with labels, collapsible to icon-only
- Mobile: Hamburger menu in header, sidebar overlays as drawer
- Sidebar contents: Logo + App name (top), Main navigation, Settings (bottom), User profile (future)

### Previous Story Intelligence

**From Story 1-2:**
- Theme is configured in `src/theme/apisTheme.ts` with Layout component tokens
- Layout.siderBg and Layout.headerBg set to brownBramble (#662604)
- ConfigProvider already wraps app with theme
- Vitest configured for unit testing
- @testing-library/react available for component tests

**Patterns to follow:**
- Create barrel exports (index.ts) for new directories
- Use TypeScript with strict types
- Keep components focused (single responsibility)
- Test render and basic behavior

### Code Examples

**apis-dashboard/src/components/layout/AppLayout.tsx:**
```typescript
import { useState, useEffect } from 'react';
import { Layout, Menu, Button, Drawer, Grid } from 'antd';
import { MenuOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Logo } from './Logo';
import { navItems } from './navItems';

const { Sider, Content, Header } = Layout;
const { useBreakpoint } = Grid;

const COLLAPSE_KEY = 'apis-sidebar-collapsed';

export function AppLayout() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    return stored === 'true';
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed));
  }, [collapsed]);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    if (isMobile) {
      setDrawerOpen(false);
    }
  };

  const menuContent = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[location.pathname]}
      items={navItems}
      onClick={handleMenuClick}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={200}
          theme="dark"
          trigger={null}
        >
          <Logo collapsed={collapsed} />
          {menuContent}
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              position: 'absolute',
              bottom: 16,
              left: collapsed ? 24 : 80,
              color: '#fbf9e7',
            }}
          />
        </Sider>
      )}

      {/* Mobile Header with Hamburger */}
      {isMobile && (
        <Header style={{ padding: '0 16px', display: 'flex', alignItems: 'center' }}>
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setDrawerOpen(true)}
            style={{ color: '#fbf9e7' }}
          />
          <Logo collapsed={false} style={{ marginLeft: 16 }} />
        </Header>
      )}

      {/* Mobile Drawer */}
      <Drawer
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={200}
        styles={{ body: { padding: 0, background: '#662604' } }}
      >
        <Logo collapsed={false} />
        {menuContent}
      </Drawer>

      <Content style={{ padding: 24 }}>
        <Outlet />
      </Content>
    </Layout>
  );
}

export default AppLayout;
```

**apis-dashboard/src/components/layout/navItems.tsx:**
```typescript
import {
  DashboardOutlined,
  ApiOutlined,
  HomeOutlined,
  VideoCameraOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

export const navItems: MenuProps['items'] = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/units', icon: <ApiOutlined />, label: 'Units' },
  { key: '/hives', icon: <HomeOutlined />, label: 'Hives' },
  { key: '/clips', icon: <VideoCameraOutlined />, label: 'Clips' },
  { key: '/statistics', icon: <BarChartOutlined />, label: 'Statistics' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
];
```

**apis-dashboard/src/components/layout/Logo.tsx:**
```typescript
import { Typography } from 'antd';
import type { CSSProperties } from 'react';

const { Title } = Typography;

interface LogoProps {
  collapsed: boolean;
  style?: CSSProperties;
}

export function Logo({ collapsed, style }: LogoProps) {
  return (
    <div
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? 0 : '0 16px',
        ...style,
      }}
    >
      <Title
        level={4}
        style={{
          color: '#fbf9e7',
          margin: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {collapsed ? '🐝' : '🐝 APIS'}
      </Title>
    </div>
  );
}

export default Logo;
```

### Placeholder Pages

Each page should be a minimal placeholder that will be expanded in later stories:

```typescript
// apis-dashboard/src/pages/Dashboard.tsx
import { Typography } from 'antd';

export function Dashboard() {
  return (
    <div>
      <Typography.Title level={2}>Dashboard</Typography.Title>
      <Typography.Paragraph>
        Welcome to APIS Dashboard. Content coming soon.
      </Typography.Paragraph>
    </div>
  );
}

export default Dashboard;
```

### Testing Requirements

**Component Tests:**
```typescript
// tests/layout.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../src/theme/apisTheme';
import { AppLayout } from '../src/components/layout/AppLayout';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <ConfigProvider theme={apisTheme}>
        {ui}
      </ConfigProvider>
    </BrowserRouter>
  );
};

describe('AppLayout', () => {
  it('renders sidebar with navigation items', () => {
    renderWithProviders(<AppLayout />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(screen.getByText('Hives')).toBeInTheDocument();
    expect(screen.getByText('Clips')).toBeInTheDocument();
    expect(screen.getByText('Statistics')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders APIS logo', () => {
    renderWithProviders(<AppLayout />);
    expect(screen.getByText('🐝 APIS')).toBeInTheDocument();
  });
});
```

### Common Pitfalls to Avoid

1. **Don't use CSS media queries directly** — Use Ant Design's Grid.useBreakpoint() hook for consistency
2. **Don't forget localStorage persistence** — Collapse state should survive page refresh
3. **Don't use inline theme colors** — Import colors from theme file
4. **Don't nest Routes inside Layout** — Use Outlet from react-router-dom
5. **Don't forget to close drawer on navigation** — Mobile UX requires closing overlay after selection

### Security Considerations

- No security concerns for this story (purely UI layout)
- localStorage usage is for UI preference only, no sensitive data

### References

- [Source: epics.md - Story 1.3 acceptance criteria]
- [Source: architecture.md - AR18 Frontend stack]
- [Source: ux-design-specification.md - Desktop Layout section]
- [Source: ux-design-specification.md - Visual Design Foundation]
- [Source: Story 1-2 completion notes - Theme patterns]
- [Ant Design Layout](https://ant.design/components/layout)
- [Ant Design Menu](https://ant.design/components/menu)
- [React Router Outlet](https://reactrouter.com/en/main/components/outlet)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- TypeScript compilation: `npx tsc --noEmit` via build - passed
- ESLint: `npm run lint` - passed
- Build: `npm run build` - passed (chunk size warning deferred)
- Tests: `npm test` - 36 tests passed (15 layout tests + 21 existing)

### Completion Notes List

1. Created `apis-dashboard/src/components/layout/AppLayout.tsx` with full Ant Design Layout structure
2. Created `apis-dashboard/src/components/layout/Logo.tsx` that adapts to collapsed state
3. Created `apis-dashboard/src/components/layout/navItems.tsx` with all 6 navigation items
4. Created `apis-dashboard/src/components/layout/index.ts` barrel export
5. Created 6 placeholder page components (Dashboard, Units, Hives, Clips, Statistics, Settings)
6. Created `apis-dashboard/src/pages/index.ts` barrel export
7. Updated `apis-dashboard/src/App.tsx` to use AppLayout with nested routes via Outlet
8. Added Refine resources configuration for all navigation items
9. Updated `apis-dashboard/src/components/index.ts` to export layout components
10. Created comprehensive test suite with 15 new tests covering:
    - Logo component expand/collapse behavior
    - Navigation items configuration
    - Desktop sidebar with collapse functionality
    - Mobile hamburger menu with drawer
    - Active state highlighting based on route
    - localStorage persistence of collapse state

### File List

**New Files:**
- apis-dashboard/src/components/layout/AppLayout.tsx
- apis-dashboard/src/components/layout/Logo.tsx
- apis-dashboard/src/components/layout/navItems.tsx
- apis-dashboard/src/components/layout/index.ts
- apis-dashboard/src/pages/Dashboard.tsx
- apis-dashboard/src/pages/Units.tsx
- apis-dashboard/src/pages/Hives.tsx
- apis-dashboard/src/pages/Clips.tsx
- apis-dashboard/src/pages/Statistics.tsx
- apis-dashboard/src/pages/Settings.tsx
- apis-dashboard/src/pages/index.ts
- apis-dashboard/tests/layout.test.tsx

**Modified Files:**
- apis-dashboard/src/App.tsx
- apis-dashboard/src/components/index.ts

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.5
**Date:** 2026-01-22
**Outcome:** ✅ APPROVED (after fixes)

### Issues Found & Fixed

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | HIGH | Test React act() warnings polluting CI logs | Wrapped async renders with `act()`, added proper async handling |
| 2 | MEDIUM | Drawer doesn't close on route change (browser back) | Added `useEffect` to sync drawer state with `location.pathname` |
| 3 | MEDIUM | React Router v7 future flag warnings | Added `future` prop to `BrowserRouter` with `v7_startTransition` and `v7_relativeSplatPath` |
| 4 | MEDIUM | Collapse button uses magic numbers | Extracted constants: `SIDEBAR_WIDTH_*`, `COLLAPSE_BUTTON_*` |
| 5 | MEDIUM | Missing test for drawer closing on menu click | Added test "closes drawer when a menu item is clicked" |
| 6 | MEDIUM | Missing localStorage edge case test | Added test "handles invalid localStorage value gracefully" |
| 7 | LOW | Chunk size warning (927KB) | Deferred - noted for future code-splitting |
| 8 | LOW | navItems.tsx file extension | Minor style issue, not fixed |

### Files Modified During Review

- `apis-dashboard/src/components/layout/AppLayout.tsx` - Added drawer sync, extracted constants
- `apis-dashboard/src/App.tsx` - Added React Router future flags
- `apis-dashboard/tests/layout.test.tsx` - Fixed async handling, added 2 new tests

### Test Results After Fix

- **Total Tests:** 38 (2 new)
- **Passing:** 38
- **act() Warnings:** 0
- **React Router Warnings:** 0

### Verification

- [x] All acceptance criteria implemented
- [x] Tests written and passing (38 tests)
- [x] Code follows project patterns (CLAUDE.md)
- [x] No security vulnerabilities
- [x] Error handling complete
- [x] Logging not applicable (UI-only story)

## Change Log

- 2026-01-22: Initial implementation of sidebar layout and navigation shell
  - Created AppLayout with collapsible desktop sidebar and mobile drawer
  - Created Logo component with expand/collapse adaptation
  - Defined navigation items with Ant Design icons
  - Created 6 placeholder page components for each route
  - Updated App.tsx with React Router nested routes via Outlet
  - Added Refine resources for navigation structure
  - Created 15 layout tests covering all acceptance criteria
  - All 36 tests passing, ESLint clean, build successful

- 2026-01-22: Code Review Fixes (Claude Opus 4.5)
  - Fixed test act() warnings with proper async handling
  - Added drawer sync on route change (useEffect on location.pathname)
  - Added React Router v7 future flags to prevent migration warnings
  - Extracted magic numbers into named constants
  - Added 2 new tests: drawer close on menu click, invalid localStorage handling
  - All 38 tests passing, ESLint clean, build successful
