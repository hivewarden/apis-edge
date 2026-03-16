# Story 1.2: Ant Design Theme Configuration

Status: done

## Story

As a **user**,
I want the dashboard to have a warm, honey-themed appearance,
So that it feels friendly and connected to beekeeping rather than clinical.

## Acceptance Criteria

### AC1: Primary theme colors applied
**Given** the React dashboard is running
**When** I view any page
**Then** the primary color is Sea Buckthorn (`#f7a42d`)
**And** the background color is Coconut Cream (`#fbf9e7`)
**And** text color is Brown Bramble (`#662604`)
**And** card backgrounds use Salomie (`#fcd483`)

### AC2: ConfigProvider wraps app with theme tokens
**Given** the theme configuration
**Then** Ant Design ConfigProvider wraps the app with custom theme tokens:
```javascript
{
  colorPrimary: '#f7a42d',
  colorBgContainer: '#fbf9e7',
  colorText: '#662604',
  colorBgElevated: '#fcd483'
}
```

### AC3: Card component styled correctly
**Given** an Ant Design Card component
**When** it renders
**Then** it has 12px border radius and subtle shadow
**And** uses Salomie (`#fcd483`) background

## Tasks / Subtasks

- [x] **Task 1: Create theme configuration file** (AC: 1, 2)
  - [x] 1.1: Create `apis-dashboard/src/theme/apisTheme.ts` with complete theme tokens
  - [x] 1.2: Define color constants with semantic names
  - [x] 1.3: Configure component-specific overrides (Card, Button, Segmented)
  - [x] 1.4: Export theme object for ConfigProvider

- [x] **Task 2: Apply theme to application** (AC: 2)
  - [x] 2.1: Update `App.tsx` to import apisTheme
  - [x] 2.2: Pass theme to ConfigProvider's `theme` prop
  - [x] 2.3: Verify theme tokens cascade to all Ant Design components

- [x] **Task 3: Create styled Card wrapper** (AC: 3)
  - [x] 3.1: Create `apis-dashboard/src/components/ApiCard.tsx` with proper styling
  - [x] 3.2: Apply 12px border radius via theme componentTokens
  - [x] 3.3: Configure subtle box-shadow in theme or component

- [x] **Task 4: Verification** (AC: 1, 2, 3)
  - [x] 4.1: Visual verification that colors appear correctly
  - [x] 4.2: Test Card component renders with correct background and radius
  - [x] 4.3: Ensure buttons and interactive elements use primary color

## Dev Notes

### Honey Beegood Color Palette

| Token | Hex | Name | Usage |
|-------|-----|------|-------|
| `colorPrimary` | `#f7a42d` | Sea Buckthorn | Primary buttons, CTAs, active states |
| `colorBgContainer` | `#fbf9e7` | Coconut Cream | Page background, container background |
| `colorText` | `#662604` | Brown Bramble | Body text, headings |
| `colorBgElevated` | `#fcd483` | Salomie | Card backgrounds, secondary accent |

### Ant Design 5.x Theme API

Ant Design 5.x uses a token-based theming system via ConfigProvider. Key APIs:

```typescript
import { ConfigProvider, ThemeConfig } from 'antd';

const theme: ThemeConfig = {
  token: {
    // Seed tokens (core colors)
    colorPrimary: '#f7a42d',
    colorBgContainer: '#fbf9e7',
    colorText: '#662604',
    colorBgElevated: '#fcd483',

    // Border radius
    borderRadius: 8,
    borderRadiusLG: 12,

    // Typography (optional - system font is fine)
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  components: {
    // Component-specific overrides
    Card: {
      borderRadiusLG: 12,
      colorBgContainer: '#fcd483',
      boxShadowTertiary: '0 2px 8px rgba(102, 38, 4, 0.08)',
    },
    // Note: Button text color handled via colorTextLightSolid global token
  },
};
```

### Architecture Compliance

**From Architecture Document (AR18-AR19):**
- AR18: Use React + Refine + Ant Design + @ant-design/charts
- AR19: Apply Honey Beegood theme (Sea Buckthorn #f7a42d, Coconut Cream #fbf9e7, Brown Bramble #662604, Salomie #fcd483)

**From UX Design Specification:**
- Warm, natural, soft corners, subtle shadows
- System UI font stack is acceptable
- Dashboard should feel "friendly, not clinical"

### File Structure Requirements

```
apis-dashboard/
├── src/
│   ├── theme/
│   │   └── apisTheme.ts      # NEW: Theme configuration
│   ├── components/
│   │   └── ApiCard.tsx       # NEW: Styled Card wrapper (optional)
│   ├── App.tsx               # MODIFY: Apply theme to ConfigProvider
│   └── ...
```

### Code Examples

**apis-dashboard/src/theme/apisTheme.ts:**
```typescript
import type { ThemeConfig } from 'antd';

// Honey Beegood Color Palette
export const colors = {
  seaBuckthorn: '#f7a42d',   // Primary accent, CTAs
  coconutCream: '#fbf9e7',   // Background
  brownBramble: '#662604',   // Text, dark sections
  salomie: '#fcd483',        // Secondary accent, cards
} as const;

export const apisTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.seaBuckthorn,
    colorBgContainer: colors.coconutCream,
    colorText: colors.brownBramble,
    colorBgElevated: colors.salomie,
    colorBgLayout: colors.coconutCream,

    // Border radius for soft, natural feel
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,

    // System font stack (per UX spec)
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  components: {
    Card: {
      borderRadiusLG: 12,
      colorBgContainer: colors.salomie,
      // Subtle shadow with brown tint
      boxShadowTertiary: '0 2px 8px rgba(102, 38, 4, 0.08)',
    },
    // Button text color handled by colorTextLightSolid global token
    Layout: {
      bodyBg: colors.coconutCream,
      headerBg: colors.brownBramble,
      siderBg: colors.brownBramble,
    },
  },
};

export default apisTheme;
```

**Updated apis-dashboard/src/App.tsx:**
```typescript
import { Refine } from "@refinedev/core";
import { ConfigProvider, App as AntdApp, Layout, Typography } from "antd";
import dataProvider from "@refinedev/simple-rest";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { apisTheme } from "./theme/apisTheme";

const { Content } = Layout;
const { Title } = Typography;

function App() {
  return (
    <BrowserRouter>
      <ConfigProvider theme={apisTheme}>
        <AntdApp>
          <Refine
            dataProvider={dataProvider("http://localhost:3000/api")}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
            }}
          >
            <Routes>
              <Route
                path="/"
                element={
                  <Layout style={{ minHeight: "100vh" }}>
                    <Content
                      style={{
                        padding: "50px",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Title>APIS Dashboard</Title>
                    </Content>
                  </Layout>
                }
              />
            </Routes>
          </Refine>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
```

### Project Structure Notes

- Theme file location follows standard React patterns (`src/theme/`)
- Ant Design 5.x ConfigProvider theming is the official approach
- Component overrides use Ant Design's `components` token system
- No CSS-in-JS library needed — Ant Design handles styling internally

### Testing Requirements

**Visual Verification:**
1. Run `npm run dev` in apis-dashboard
2. Open http://localhost:5173
3. Verify:
   - Background is cream-colored (`#fbf9e7`)
   - Title text is brown (`#662604`)
   - Any buttons use honey-gold primary color (`#f7a42d`)

**Card Verification (when cards are added):**
- Cards should have 12px rounded corners
- Card background should be Salomie (`#fcd483`)
- Subtle shadow should be visible

### Previous Story Intelligence

**From Story 1-1 Completion Notes:**
- App.tsx already imports ConfigProvider but passes no theme
- Ant Design CSS is loading correctly (L2 from review deferred to this story)
- File structure established at `apis-dashboard/src/`
- TypeScript strict mode enabled
- ESLint configured for React + TypeScript

**Files to modify:**
- `apis-dashboard/src/App.tsx` — Add theme prop to ConfigProvider

**Files to create:**
- `apis-dashboard/src/theme/apisTheme.ts` — New file

### Common Pitfalls to Avoid

1. **Don't use CSS overrides** — Use Ant Design's token system, not manual CSS
2. **Don't forget Layout colors** — Background might not apply without Layout tokens
3. **Don't hardcode colors in components** — Use theme tokens or `colors` export
4. **Don't use inline styles for theming** — Theme tokens cascade automatically
5. **Don't skip TypeScript types** — Use `ThemeConfig` from antd

### Security Considerations

- No security concerns for this story (purely visual theming)
- Theme file contains no secrets

### References

- [Source: epics.md - Story 1.2 acceptance criteria]
- [Source: architecture.md - AR18, AR19 Frontend requirements]
- [Source: ux-design-specification.md - Color palette section]
- [Source: ux-design-specification.md - Design principles]
- [Source: CLAUDE.md - TypeScript naming conventions]
- [Ant Design 5.x Theme Documentation](https://ant.design/docs/react/customize-theme)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- TypeScript compilation: `npx tsc --noEmit` - passed
- ESLint: `npx eslint .` - passed
- Build: `npm run build` - passed (chunk size warning deferred)
- Tests: `npm test` - 21 tests passed (after review fixes)

### Completion Notes List

1. Created `apis-dashboard/src/theme/apisTheme.ts` with complete Honey Beegood color palette
2. Configured Ant Design 5.x theme tokens: colorPrimary, colorBgContainer, colorText, colorBgElevated
3. Added component overrides for Card (12px radius, shadow), Button (white text), Layout (sidebar/header colors), Segmented
4. Updated `App.tsx` to import and apply `apisTheme` to ConfigProvider
5. Created `ApiCard.tsx` wrapper component that inherits theme styling
6. Added Vitest and created 14 unit tests verifying all theme tokens match acceptance criteria
7. Fixed ESLint script to work with flat config format

### File List

**New Files:**
- apis-dashboard/src/theme/apisTheme.ts
- apis-dashboard/src/theme/index.ts (barrel export)
- apis-dashboard/src/components/ApiCard.tsx
- apis-dashboard/src/components/index.ts (barrel export)
- apis-dashboard/tests/theme.test.ts
- apis-dashboard/tests/components.test.tsx (render tests)
- apis-dashboard/tests/setup.ts (test setup)
- apis-dashboard/vitest.config.ts

**Modified Files:**
- apis-dashboard/src/App.tsx (added theme import, ConfigProvider theme prop, env variable for API URL)
- apis-dashboard/package.json (added vitest, @testing-library/react, jsdom, test scripts)

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.5
**Date:** 2026-01-22
**Outcome:** ✅ APPROVED (after fixes)

### Issues Found

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| H1 | HIGH | Button `primaryColor` token not valid in Ant Design 5.x | Replaced with global `colorTextLightSolid: '#ffffff'` token |
| M1 | MEDIUM | Hardcoded API URL in App.tsx | Added environment variable `VITE_API_URL` with fallback |
| M2 | MEDIUM | ApiCard.tsx wrapper added no value | Made hoverable by default, added `noHover` prop |
| M3 | MEDIUM | No vitest.config.ts file | Created with jsdom environment and path aliases |
| M4 | MEDIUM | Tests only verify token values, not rendering | Added component render tests with @testing-library/react |
| L1 | LOW | Missing barrel exports (index.ts) | Added theme/index.ts and components/index.ts |
| L2 | LOW | ApiCard.tsx had no tests | Added 4 tests for ApiCard in components.test.tsx |

### Verification

- All 7 issues fixed
- Tests: 21 passing (was 14)
- ESLint: passing
- Build: passing
- All acceptance criteria implemented and verified

## Change Log

- 2026-01-22: Senior Developer Review - fixed 7 issues
  - Fixed Button token to use colorTextLightSolid instead of invalid primaryColor
  - Added VITE_API_URL environment variable for API URL configuration
  - Made ApiCard hoverable by default with noHover opt-out
  - Added vitest.config.ts with jsdom environment
  - Added component render tests with @testing-library/react
  - Added barrel exports for theme/ and components/
  - Total tests now 21 (added 7 new tests)

- 2026-01-22: Initial implementation of Ant Design theme configuration
  - Created apisTheme.ts with Honey Beegood color palette
  - Applied theme to ConfigProvider in App.tsx
  - Created ApiCard component wrapper
  - Added 14 unit tests for theme token verification
  - All acceptance criteria satisfied
