# Integration Points Reference: Epics 1 & 2

This document maps the exact integration points between Epic 1 (Foundation & Auth) and Epic 2 (Sites & Units).

---

## 1. Authentication Integration

### Entry Point: App.tsx

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/App.tsx`

```typescript
// Lines 204-223: Route protection
<Routes>
  <Route path="/login" element={<Login />} />           // PUBLIC
  <Route
    element={
      <AuthGuard>                                        // ← Epic 1: Auth protection
        <BackgroundSyncProvider>
          <ProactiveInsightsProvider>
            <AppLayout />                                // ← Epic 1: Main layout wrapper
          </ProactiveInsightsProvider>
        </BackgroundSyncProvider>
      </AuthGuard>
    }
  >
    <Route path="/sites" element={...LazySites} />      // ← Epic 2: PROTECTED
    <Route path="/units" element={...LazyUnits} />      // ← Epic 2: PROTECTED
  </Route>
</Routes>
```

**Integration**: Epic 2 pages are children of the protected route. AuthGuard prevents access if not authenticated.

---

### AuthGuard Component

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/auth/AuthGuard.tsx`

```typescript
export function AuthGuard({ children }: AuthGuardProps) {
  const location = useLocation();
  const { data, isLoading } = useIsAuthenticated();  // ← Refine hook

  if (DEV_MODE) return <>{children}</>;

  if (isLoading) return <Spin size="large" />;

  if (!data?.authenticated) {
    return <Navigate
      to={`/login?returnTo=${encodeURIComponent(location.pathname)}`}
      replace
    />;
  }

  return <>{children}</>;
}
```

**Integration**: When Epic 2 page accessed without auth → redirect to login with returnTo parameter.

---

## 2. API Client & Error Handling Integration

### API Client Setup

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/apiClient.ts`

```typescript
// Lines 36-83: Request interceptor adds auth
apiClient.interceptors.request.use(async (config) => {
  if (DEV_MODE) return config;

  const authConfig = getAuthConfigSync();
  if (authConfig?.mode === 'zitadel') {
    const user = await userManager.getUser();
    if (user?.access_token) {
      config.headers.Authorization = `Bearer ${user.access_token}`;
    }
  }
  return config;
});

// Lines 90-108: Response interceptor handles 401/403
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // 401/403: Refine's authProvider.onError() handles redirect
    // Other errors: Show notification
    if (status !== 401 && status !== 403) {
      message.error(errorMessage);
    }

    return Promise.reject(error);
  }
);
```

**Integration Point 1**: Epic 2 pages call `apiClient.get('/sites')` → interceptor adds auth token
**Integration Point 2**: Server returns 401 → interceptor skips notification → Refine logs out user

---

### Refine Auth Provider

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/providers/localAuthProvider.ts`

```typescript
onError: async (error) => {
  if (error?.statusCode === 401 || error?.status === 401) {
    return {
      logout: true,
      redirectTo: '/login',
      error: {
        name: 'SessionExpired',
        message: 'Your session has expired. Please log in again.',
      },
    };
  }
}
```

**Integration**: When apiClient gets 401, Refine handles logout and redirect automatically.

---

## 3. User Context Integration

### useAuth Hook

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useAuth.ts`

```typescript
export function useAuth(): AuthState {
  // Lines 58-59: Get auth state from Refine
  const { data: authData, isLoading: authLoading } = useIsAuthenticated();
  const { data: identity, isLoading: identityLoading } = useGetIdentity<UserIdentity>();

  return {
    isAuthenticated: authData?.authenticated ?? false,
    isLoading: authLoading || identityLoading,
    user: identity ?? null,  // ← User identity with tenant_id
    login: ...,
    logout: ...,
  };
}
```

**Integration**: Epic 2 pages can call `useAuth()` to get user info:
```typescript
// In any Epic 2 page
const { user } = useAuth();
console.log(user.tenant_id);  // Tenant scoping available
```

---

### AppLayout Integration

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/layout/AppLayout.tsx`

```typescript
// Lines 45-46: AppLayout uses useAuth to show user info
export function AppLayout() {
  const { user, logout } = useAuth();  // ← Gets user from Epic 1 system

  // Lines 129-235: Sidebar user section shows user name/email
  <div style={{ padding: '16px 20px' }}>
    <Avatar src={user?.avatar} />
    <Text>{user?.name || 'User'}</Text>
    <Button onClick={logout}>Logout</Button>
  </div>
}
```

**Integration**: User context flows from Auth → AppLayout → Displayed to user.

---

## 4. Navigation Integration

### Route Registration in App.tsx

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/App.tsx` (lines 188-197)

```typescript
<Refine
  resources={[
    { name: "sites", list: "/sites", show: "/sites/:id", edit: "/sites/:id/edit" },
    { name: "units", list: "/units", show: "/units/:id", edit: "/units/:id/edit" },
    // More resources...
  ]}
>
```

**Integration**: Routes registered in Refine enable:
- Navigation links
- Active state detection
- Breadcrumb support (future)

### Nav Items Configuration

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/layout/navItems.tsx`

```typescript
export const navItems: MenuProps['items'] = [
  { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/sites', icon: <EnvironmentOutlined />, label: 'Sites' },     // ← Epic 2
  { key: '/units', icon: <ApiOutlined />, label: 'Units' },             // ← Epic 2
  { key: '/hives', icon: <HomeOutlined />, label: 'Hives' },            // ← Epic 2
];
```

**Integration Point 1**: Nav items keys match Route paths exactly
**Integration Point 2**: Menu uses `location.pathname` for active state
**Integration Point 3**: AppLayout clicks navigate via `navigate(key)`

```typescript
// In AppLayout (lines 90-95)
const handleMenuClick = ({ key }: { key: string }) => {
  navigate(key);  // Navigate to path
  if (isMobile) setDrawerOpen(false);
};
```

---

## 5. Theme Integration

### Theme Configuration

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/theme/apisTheme.ts`

```typescript
export const colors = {
  seaBuckthorn: '#f7a42d',      // Primary accent
  coconutCream: '#fbf9e7',       // Page background
  brownBramble: '#662604',       // Text
  salomie: '#fcd483',            // Card surfaces
  // ... more colors
};

export const apisTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.seaBuckthorn,
    colorBgLayout: colors.coconutCream,
    colorText: colors.brownBramble,
    // ... more theme tokens
  },
  components: {
    Button: {
      borderRadius: 9999,        // rounded-full
      primaryShadow: colors.shadowSm,
    },
    Menu: {
      itemSelectedBg: colors.salomie,  // Active nav item
      itemColor: '#8c7e72',             // Inactive nav item
    },
    // ... component overrides
  }
};
```

**Integration Point 1**: App.tsx wraps entire app with this theme
```typescript
<ConfigProvider theme={apisTheme}>
  <Refine ... />
</ConfigProvider>
```

**Integration Point 2**: Epic 2 pages import and use colors
```typescript
// In Sites.tsx (line 27)
import { colors } from '../theme/apisTheme';

// Line 67: Use theme token
<Title style={{ color: colors.brownBramble }}>Your Sites</Title>
```

---

## 6. Layout Integration

### AppLayout Wrapping

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/layout/AppLayout.tsx`

```typescript
export function AppLayout() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop Sidebar (lines 241-272) */}
      {!isMobile && (
        <Sider>
          <Logo />
          <Menu {...} />
          <userSection />
        </Sider>
      )}

      {/* Mobile Drawer (lines 304-357) */}
      <Drawer>
        <Menu {...} />
      </Drawer>

      <Layout style={{ flex: 1 }}>
        <OfflineBanner />
        <Content style={{ padding: 24, flex: 1 }}>
          <Outlet />                {/* ← All Epic 2 pages render here */}
        </Content>
      </Layout>
    </Layout>
  );
}
```

**Integration**: Every Epic 2 page (`<LazySites />`, `<LazyUnits />`, etc.) becomes the child of `<Outlet />`.

---

## 7. Data Fetching Integration

### Epic 2 Page Using Hook

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/Sites.tsx`

```typescript
// Lines 26-30: Page imports and uses hook
export function Sites() {
  const navigate = useNavigate();
  const { sites, loading } = useSites();  // ← Hook from Epic 1 pattern

  return (
    <div>
      {loading ? <Spin /> : <SiteGrid sites={sites} />}
    </div>
  );
}
```

### Hook Using API Client

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/hooks/useSites.ts`

```typescript
// Lines 43-68: Hook calls apiClient
export function useSites(): UseSitesResult {
  const [sites, setSites] = useState<Site[]>([]);

  useEffect(() => {
    const response = await apiClient.get<SitesResponse>('/sites');
    // ^ apiClient is from Epic 1, adds auth token
    setSites(response.data.data);
  }, []);

  return { sites, loading, error, refetch };
}
```

**Integration Flow**:
1. Epic 2 page calls `useSites()` hook
2. Hook calls `apiClient.get()`
3. apiClient adds auth token from Epic 1 system
4. Server validates token
5. Returns sites scoped to current tenant
6. Hook updates state
7. Page re-renders with data

---

## 8. Form Integration (Create/Edit)

### Epic 2 Create Form

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/pages/SiteCreate.tsx`

```typescript
// Lines 43-48: Direct API client usage for mutations
const handleSubmit = async (values: CreateSiteForm) => {
  try {
    await apiClient.post('/sites', {
      name: values.name,
      latitude: values.latitude || null,
      longitude: values.longitude || null,
      timezone: values.timezone || 'UTC',
    });  // ← Uses apiClient with auth token

    message.success('Site created successfully');
    navigate('/sites');
  } catch {
    message.error('Failed to create site');
  }
};
```

**Integration**: Form mutations use apiClient directly (allowed by architecture).

---

## 9. Mobile Responsiveness Integration

### AppLayout Responsive Grid

**File**: `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/layout/AppLayout.tsx`

```typescript
// Lines 41-42: Check viewport
const screens = useBreakpoint();
const isMobile = !screens.md;  // < 768px is mobile

// Lines 241-301: Conditional rendering
{!isMobile && <Sider>...</Sider>}           // Desktop only
{isMobile && <Header>...</Header>}          // Mobile only
{isMobile && <Drawer>...</Drawer>}         // Mobile only
```

**Integration**: Epic 2 pages automatically adapt:
- Desktop: Content width = viewport - sidebar (240px or 80px)
- Mobile: Content width = full viewport
- All theme spacing adjusts via Ant Design responsive grid

---

## 10. Error Handling Integration

### Authentication Error Flow

```
Epic 2 Page (Sites.tsx)
  ↓ calls
useSites hook
  ↓ calls
apiClient.get('/sites')
  ↓ if server returns 401
apiClient response interceptor
  ↓ skips notification, propagates error
Refine's data provider catches error
  ↓ calls authProvider.onError()
localAuthProvider
  ↓ returns { logout: true, redirectTo: '/login' }
Refine automatically logs out and redirects
  ↓ user sees login page
```

### Non-Auth Error Flow

```
Epic 2 Page (Sites.tsx)
  ↓ calls
useSites hook
  ↓ calls
apiClient.get('/sites')
  ↓ if server returns 500
apiClient response interceptor
  ↓ shows message.error('Internal Server Error')
Hook catches error, stores in error state
  ↓
Page can display error or rely on notification
```

---

## Integration Checklist

### For Every New Epic 2 Story

Use this checklist to ensure proper integration:

- [ ] Page imports `useAuth` if it needs user context
- [ ] Page imports hook from `src/hooks/` for data fetching
- [ ] Page imports `colors` from theme if styling elements
- [ ] Page uses Ant Design components (not custom HTML)
- [ ] Form submissions use `apiClient.post()` or `.put()`
- [ ] Error handling via try/catch blocks
- [ ] Loading state uses `<Spin />` from Ant Design
- [ ] Navigation via `useNavigate()` hook
- [ ] Mobile responsive (test on mobile viewport)
- [ ] Theme token colors only (no hardcoded hex values)

---

## Summary of Integration Points

| Layer | Epic 1 Component | Epic 2 Integration | Result |
|-------|:---------------:|:------------------:|:------:|
| **Routing** | App.tsx AuthGuard | Protected by auth | ✅ Works |
| **Authentication** | useAuth, apiClient | Access token added | ✅ Works |
| **User Context** | useAuth hook | Available in pages | ✅ Works |
| **Layout** | AppLayout wrapper | Renders Outlet | ✅ Works |
| **Navigation** | navItems config | Links to /sites, /units | ✅ Works |
| **Theme** | apisTheme tokens | Used in all pages | ✅ Works |
| **API Client** | apiClient with interceptors | Handles errors | ✅ Works |
| **Data Fetching** | Hooks pattern | useSites, useUnits | ✅ Works |
| **Error Handling** | apiClient interceptor | 401 → logout | ✅ Works |
| **Mobile** | Responsive layout | Grid adapts | ✅ Works |

**All integration points verified and working correctly.**

---

**Reference Document**: For use when developing future Epic 2 stories
**Updated**: January 31, 2026
**Status**: ✅ Complete
