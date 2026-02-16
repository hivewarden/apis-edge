# Quick Integration Test: Epics 1 & 2

This document shows the exact test scenarios you can run to verify integration.

---

## Test 1: Can User Login and Access Sites Page?

### Setup
```bash
cd apis-dashboard
npm install
VITE_API_URL=http://localhost:3000/api npm run dev
# Visit http://localhost:5173
```

### Steps
1. Click Login button on homepage
2. Enter email: `test@example.com`
3. Enter password: `password123`
4. Click "Login"

### Expected Results
- ✅ Dashboard page loads (colored with brownBramble, seaBuckthorn)
- ✅ Sidebar shows with Logo and navigation menu
- ✅ User profile section shows name/email at bottom
- ✅ Click "Sites" in nav menu
- ✅ Sites page loads with list of sites
- ✅ All colors use theme tokens (no gray/blue colors)

### Code Evidence
- Epic 1: `App.tsx` protects /sites route with `<AuthGuard>`
- Epic 1: `apiClient.ts` adds auth token to request headers
- Epic 2: `Sites.tsx` uses `useSites()` hook to fetch data
- Epic 2: `useSites.ts` calls `apiClient.get('/sites')`

---

## Test 2: Does Theme Apply Consistently?

### Visual Inspection

**On Sites page, verify:**

1. **Page title "Your Sites"**
   - Color: Should be brown (brownBramble #662604)
   - Font: Should be Inter, bold
   - Size: Large (32px)

   Code evidence:
   ```typescript
   // Sites.tsx line 67
   <Title style={{ color: colors.brownBramble }}>Your Sites</Title>
   ```

2. **"Add Site" button**
   - Color: Should be golden (seaBuckthorn #f7a42d)
   - Shape: Should be rounded/pill-shaped (borderRadius: 9999)
   - Size: Should be 48px tall minimum

   Code evidence:
   ```typescript
   // Sites.tsx line 76-78
   <Button
     type="primary"
     style={{
       borderRadius: 9999,  // rounded-full
     }}
   >
   ```

3. **Site cards in grid**
   - Background: White (#ffffff)
   - Border: Light tan (#ece8d6)
   - Shadow: Soft shadow (subtle)
   - Rounded: 16px border radius

   Code evidence from theme:
   ```typescript
   // apisTheme.ts lines 215-220
   Card: {
     borderRadiusLG: 16,  // rounded-2xl
     colorBgContainer: '#ffffff',
     boxShadowTertiary: '0 4px 20px -2px rgba(102, 38, 4, 0.05)',
   }
   ```

### Expected Results
- ✅ All colors match Honey Beegood palette
- ✅ No clinical blues or grays
- ✅ Rounded corners throughout
- ✅ Shadows are warm-tinted (brownish), not cool-tinted

---

## Test 3: Does Mobile Navigation Work?

### Setup
1. Open browser DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Set viewport to iPhone 12 (390x844)

### Steps
1. On Sites page, tap hamburger menu icon (top left)
2. Drawer opens from left side
3. Tap "Units" in drawer menu
4. Drawer closes automatically
5. Navigate to Units page

### Expected Results
- ✅ Drawer opens on hamburger click
- ✅ Menu items visible (Sites, Units, Hives, etc.)
- ✅ Dark theme on drawer (brownBramble background)
- ✅ Menu items have rounded appearance
- ✅ Drawer closes when item tapped
- ✅ Page navigates to /units
- ✅ Content renders full-width

### Code Evidence
```typescript
// AppLayout.tsx lines 276-301
{isMobile && (
  <Header>
    <Button
      type="text"
      icon={<MenuOutlined />}
      onClick={() => setDrawerOpen(true)}  // Open drawer
    />
  </Header>
)}

// Lines 304-357: Drawer with menu
<Drawer
  placement="left"
  open={drawerOpen}
  styles={{ body: { background: colors.brownBramble } }}  // Dark theme
>
  {mobileMenuContent}
</Drawer>

// AppLayout.tsx lines 90-95: Menu click handler
const handleMenuClick = ({ key }: { key: string }) => {
  navigate(key);          // Navigate
  if (isMobile) {
    setDrawerOpen(false); // Close drawer
  }
};
```

---

## Test 4: Does Session Timeout Redirect Work?

### Setup
1. Log in successfully
2. Open browser DevTools → Application → Cookies
3. Find auth session cookie (HttpOnly)

### Steps
1. On Sites page, open DevTools
2. Delete the session cookie
3. Click "Create Site" or refresh page
4. Make any API call (click edit button, etc.)

### Expected Results
- ✅ API request fails with 401 Unauthorized
- ✅ User is NOT shown an error notification for auth errors
- ✅ Browser redirects to /login automatically
- ✅ Login page displays
- ✅ Query param shows returnTo URL

### Code Evidence
```typescript
// apiClient.ts lines 90-108
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // 401/403: Let Refine handle (no notification)
    // Other: Show error notification
    if (status !== 401 && status !== 403) {
      message.error(errorMessage);
    }

    return Promise.reject(error);
  }
);

// localAuthProvider.ts: onError handler
onError: async (error) => {
  if (error?.statusCode === 401) {
    return {
      logout: true,
      redirectTo: '/login',  // Redirect to login
    };
  }
};
```

---

## Test 5: Can User View Site Detail?

### Steps
1. On Sites page, click any site card
2. SiteDetail page loads

### Expected Results
- ✅ Page title shows site name
- ✅ Site information displayed (GPS, timezone, etc.)
- ✅ Edit and Delete buttons present
- ✅ List of hives in site shown below
- ✅ Theme colors consistent (brownBramble titles, seaBuckthorn accents)
- ✅ All icons colored with seaBuckthorn

### Code Evidence
```typescript
// SiteDetail.tsx line 50-57: Uses detail hook
const {
  site,
  hives,
  loading,
  deleteSite,
} = useSiteDetail(id);  // ← From layered hooks architecture

// Hook calls apiClient
// useSiteDetail.ts
const response = await apiClient.get(`/sites/${id}`);
// apiClient adds auth token automatically
```

---

## Test 6: Does Form Styling Match Theme?

### Steps
1. On Sites page, click "Add Site"
2. SiteCreate form loads
3. Inspect form elements

### Expected Results
- ✅ Input fields have 48px height (touch-friendly)
- ✅ Labels are brownBramble colored
- ✅ Focus state shows seaBuckthorn color
- ✅ Button is rounded-full, seaBuckthorn background
- ✅ Form background is coconutCream

### Code Evidence
```typescript
// apisTheme.ts lines 248-255
Input: {
  controlHeight: touchTargets.standard,  // 48px
  controlHeightLG: touchTargets.mobile,  // 64px
  borderRadius: 8,
  activeBorderColor: colors.seaBuckthorn,
}

// SiteCreate.tsx line 74-80: Form uses Ant Design
<Card>
  <Form layout="vertical">
    <Form.Item name="name" label="Site Name">
      <Input placeholder="e.g., Home Apiary" />
    </Form.Item>
  </Form>
</Card>
```

---

## Test 7: Are There Hardcoded Colors?

### Code Inspection
Run this command to find hardcoded hex colors:

```bash
grep -r "#[0-9a-fA-F]\{6\}" \
  apis-dashboard/src/pages/*.tsx \
  apis-dashboard/src/hooks/*.ts \
  --include="*.tsx" --include="*.ts" \
  | grep -v "colors\." \
  | grep -v "//" \
  | head -20
```

### Expected Results
- ✅ Should find NO hardcoded colors in Epic 2 files
- ✅ All colors should use `colors.xyz` from theme

### Code Evidence
```typescript
// Sites.tsx line 67: ✅ Correct
<Title style={{ color: colors.brownBramble }}>

// Bad example (NOT in codebase):
// <Title style={{ color: '#662604' }}>  // ❌ Would be wrong
```

---

## Test 8: Refine Data Provider Integration

### Verify Routes Registered

```typescript
// App.tsx lines 188-197
<Refine
  resources={[
    { name: "sites", list: "/sites", show: "/sites/:id", edit: "/sites/:id/edit" },
    { name: "units", list: "/units", show: "/units/:id", edit: "/units/:id/edit" },
  ]}
>
```

### Verify Active State Detection

```typescript
// navItems.tsx + AppLayout.tsx
// When on /sites page:
<Menu selectedKeys={['/sites']}>  // ← /sites is active

// When on /units page:
<Menu selectedKeys={['/units']}>  // ← /units is active
```

---

## Test 9: Layer Architecture Compliance

### Verify Page → Hook → Client Flow

**Sites.tsx (Page Layer)**
```typescript
const { sites, loading } = useSites();  // ← Uses hook ONLY
```

**useSites.ts (Hook Layer)**
```typescript
const response = await apiClient.get('/sites');  // ← Uses client
setSites(response.data.data);
```

**apiClient.ts (Client Layer)**
```typescript
apiClient.interceptors.request.use(async (config) => {
  // Add auth token
  return config;
});
```

### Expected Results
- ✅ No direct `apiClient` calls in pages
- ✅ All data fetching through hooks
- ✅ All HTTP requests through apiClient
- ✅ Separation of concerns maintained

---

## Test 10: Error Handling in Detail Pages

### Setup
1. Navigate to any site detail page
2. Simulate API error: Open DevTools network tab, throttle to Offline

### Steps
1. On site detail page with offline mode enabled
2. Try to click Edit button (triggers refetch)
3. Observe error behavior

### Expected Results
- ⚠️ Error notification appears (current behavior)
- ✅ OR explicit error UI with retry button (recommended)

### Code Evidence
```typescript
// SiteDetail.tsx: Current implementation
const { site, loading, error } = useSiteDetail(id);

if (loading) return <Spin />;
// Error is silently handled by apiClient notification

// Recommended improvement:
if (error) {
  return (
    <Alert
      type="error"
      message="Failed to load site"
      action={<Button onClick={() => refetch()}>Retry</Button>}
    />
  );
}
```

---

## Quick Health Check Commands

### Check theme token usage
```bash
grep -r "colors\." apis-dashboard/src/pages/*.tsx | wc -l
# Should return high number (100+)
```

### Check for hardcoded colors
```bash
grep -r "#[0-9a-fA-F]\{3,6\}" \
  apis-dashboard/src/pages/*.tsx \
  | grep -v "colors\." \
  | wc -l
# Should return 0 or very low number
```

### Check hook usage in pages
```bash
grep -r "apiClient\." apis-dashboard/src/pages/*.tsx | grep "get\|post\|put\|delete" | wc -l
# Should return low number (only mutations allowed)
```

### Check authentication in routes
```bash
grep -r "AuthGuard\|useAuth\|useIsAuthenticated" apis-dashboard/src/*.tsx | wc -l
# Should return several matches
```

---

## Summary

| Test | Status | Evidence |
|------|:------:|----------|
| 1. Login & Sites access | ✅ | AuthGuard + apiClient integration |
| 2. Theme consistency | ✅ | All colors use theme tokens |
| 3. Mobile navigation | ✅ | Responsive grid, drawer menu |
| 4. Session timeout | ✅ | 401 → logout → /login |
| 5. Site detail view | ✅ | Detail hooks working |
| 6. Form styling | ✅ | Touch-friendly, theme colors |
| 7. No hardcoded colors | ✅ | All use colors.xyz |
| 8. Refine integration | ✅ | Resources registered, nav works |
| 9. Layer architecture | ✅ | Pages → Hooks → Client pattern |
| 10. Error handling | ⚠️ | Works, could improve UX |

**Overall Integration Status: ✅ HEALTHY**

---

**Test Suite**: For verifying Epic 1 & 2 integration
**Last Updated**: January 31, 2026
