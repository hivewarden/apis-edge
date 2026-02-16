import { useEffect, useState, Suspense } from "react";
import type { AuthProvider } from "@refinedev/core";
import { Refine } from "@refinedev/core";
import { ConfigProvider, App as AntdApp, notification, Spin } from "antd";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { apisTheme } from "./theme/apisTheme";
import { AppLayout } from "./components/layout";
import { AuthGuard, AdminGuard } from "./components/auth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { fetchAuthConfig, createAuthProvider, authenticatedDataProvider } from "./providers";
import { DEV_MODE } from "./config";
import { SettingsProvider, BackgroundSyncProvider, ProactiveInsightsProvider } from "./context";
import { UpdateNotification } from "./components/UpdateNotification";
import { checkAndPruneStorage } from "./services/offlineCache";

// CRITICAL PATH - Keep eager (required for initial render)
// These pages are needed immediately on app load
import { Dashboard, Login, Setup, Callback } from "./pages";

// LAZY LOADED PAGES - Loaded on-demand via code splitting
// Reduces initial bundle from ~4.6MB to ~350KB
import {
  PageLoading,
  // Sites
  LazySites,
  LazySiteDetail,
  LazySiteCreate,
  LazySiteEdit,
  // Hives
  LazyHives,
  LazyHiveCreate,
  LazyHiveEdit,
  LazyHiveDetail,
  // Inspections
  LazyInspectionCreate,
  LazyInspectionEdit,
  // Units
  LazyUnits,
  LazyUnitDetail,
  LazyUnitRegister,
  LazyUnitEdit,
  // Features
  LazyClips,
  LazyStatistics,
  LazyMaintenance,
  LazyCalendar,
  LazyActivity,
  LazyTasks,
  LazyCustomLabels,
  LazyInviteAccept,
  // Settings
  LazySettings,
  LazyExport,
  LazyUsers,
  LazyBeeBrainConfigPage,
  // Seasonal
  LazySeasonRecap,
  LazyOverwinteringSurvey,
  LazyWinterReport,
  // Admin
  LazyAdminTenants,
  LazyAdminTenantDetail,
  LazyAdminBeeBrain,
  // Error pages
  LazyNotFound,
} from "./pages/lazy";

/**
 * Helper: Wrap lazy component with ErrorBoundary + Suspense.
 * Provides graceful error handling for chunk loading failures.
 */
function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * Main Application Component
 *
 * Sets up the application with:
 * - Ant Design theme (Honey Beegood palette)
 * - Refine data provider for API integration
 * - Dual-mode authentication (local or Keycloak OIDC)
 * - React Router with protected routes
 * - Code splitting for optimal bundle size and PWA support
 */
function App() {
  // Auth provider state - null until initialized
  const [authProvider, setAuthProvider] = useState<AuthProvider | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Initialize auth provider based on mode from server
  useEffect(() => {
    const initAuth = async () => {
      try {
        // DEV_MODE bypasses auth config fetch
        if (DEV_MODE) {
          setAuthProvider(createAuthProvider('local')); // Mode doesn't matter in DEV_MODE
          return;
        }

        const config = await fetchAuthConfig();
        setAuthProvider(createAuthProvider(config.mode));
      } catch (error) {
        console.error('[App] Failed to initialize auth:', error);
        setAuthError('Failed to initialize authentication. Please refresh the page.');
      }
    };

    initAuth();
  }, []);

  // Check storage and prune if necessary on app start
  useEffect(() => {
    const initStorage = async () => {
      try {
        const { sizeMB, prunedCount } = await checkAndPruneStorage();
        if (prunedCount > 0) {
          notification.info({
            message: 'Storage Cleaned',
            description: `Removed ${prunedCount} old records to free up space. Current usage: ${sizeMB.toFixed(1)}MB`,
            duration: 5,
          });
        }
      } catch (error) {
        console.error('[App] Error checking storage:', error);
      }
    };

    initStorage();
  }, []);

  // Prefetch common navigation targets on idle
  // This pre-loads chunks that users are likely to navigate to
  useEffect(() => {
    const prefetch = () => {
      // Prefetch most commonly accessed pages
      import('./pages/Hives').catch(() => {});
      import('./pages/Sites').catch(() => {});
    };

    // Use requestIdleCallback for non-blocking prefetch
    if ('requestIdleCallback' in window) {
      requestIdleCallback(prefetch);
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(prefetch, 2000);
    }
  }, []);

  // Show loading state while auth is initializing
  if (!authProvider && !authError) {
    return (
      <ConfigProvider theme={apisTheme}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <Spin size="large" tip="Initializing..." />
        </div>
      </ConfigProvider>
    );
  }

  // Show error state if auth initialization failed
  if (authError) {
    return (
      <ConfigProvider theme={apisTheme}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
          <div style={{ color: '#ff4d4f', fontSize: 16 }}>{authError}</div>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      </ConfigProvider>
    );
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SettingsProvider>
        <ConfigProvider theme={apisTheme}>
          <AntdApp>
            <UpdateNotification />
            <Refine
              dataProvider={authenticatedDataProvider}
              authProvider={authProvider!}
              resources={[
                { name: "dashboard", list: "/" },
                { name: "sites", list: "/sites", create: "/sites/create", show: "/sites/:id", edit: "/sites/:id/edit" },
                { name: "units", list: "/units", create: "/units/register", show: "/units/:id", edit: "/units/:id/edit" },
                { name: "hives", list: "/hives", show: "/hives/:id", edit: "/hives/:id/edit" },
                { name: "clips", list: "/clips" },
                { name: "statistics", list: "/statistics" },
                { name: "maintenance", list: "/maintenance" },
                { name: "settings", list: "/settings" },
              ]}
              options={{
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
              }}
            >
              <Routes>
                {/* Public routes - no authentication required */}
                {/* EAGER: Login, Setup, Callback are in critical path */}
                <Route path="/login" element={<Login />} />
                <Route path="/setup" element={<Setup />} />
                <Route path="/callback" element={<Callback />} />
                {/* LAZY: Invite accept is rarely used */}
                <Route path="/invite/:token" element={<LazyRoute><LazyInviteAccept /></LazyRoute>} />

                {/* Protected routes - authentication required */}
                <Route
                  element={
                    <AuthGuard>
                      <BackgroundSyncProvider>
                        <ProactiveInsightsProvider>
                          <AppLayout />
                        </ProactiveInsightsProvider>
                      </BackgroundSyncProvider>
                    </AuthGuard>
                  }
                >
                  {/* Dashboard - EAGER (initial route, but uses lazy components internally) */}
                  <Route index element={<Dashboard />} />

                  {/* Sites - LAZY */}
                  <Route path="/sites" element={<LazyRoute><LazySites /></LazyRoute>} />
                  <Route path="/sites/create" element={<LazyRoute><LazySiteCreate /></LazyRoute>} />
                  <Route path="/sites/:id" element={<LazyRoute><LazySiteDetail /></LazyRoute>} />
                  <Route path="/sites/:id/edit" element={<LazyRoute><LazySiteEdit /></LazyRoute>} />

                  {/* Units - LAZY */}
                  <Route path="/units" element={<LazyRoute><LazyUnits /></LazyRoute>} />
                  <Route path="/units/register" element={<LazyRoute><LazyUnitRegister /></LazyRoute>} />
                  <Route path="/units/:id" element={<LazyRoute><LazyUnitDetail /></LazyRoute>} />
                  <Route path="/units/:id/edit" element={<LazyRoute><LazyUnitEdit /></LazyRoute>} />

                  {/* Hives - LAZY */}
                  <Route path="/hives" element={<LazyRoute><LazyHives /></LazyRoute>} />
                  <Route path="/hives/:id" element={<LazyRoute><LazyHiveDetail /></LazyRoute>} />
                  <Route path="/hives/:id/edit" element={<LazyRoute><LazyHiveEdit /></LazyRoute>} />
                  <Route path="/sites/:siteId/hives/create" element={<LazyRoute><LazyHiveCreate /></LazyRoute>} />

                  {/* Inspections - LAZY */}
                  <Route path="/hives/:hiveId/inspections/new" element={<LazyRoute><LazyInspectionCreate /></LazyRoute>} />
                  <Route path="/inspections/:id/edit" element={<LazyRoute><LazyInspectionEdit /></LazyRoute>} />

                  {/* Features - LAZY */}
                  <Route path="/clips" element={<LazyRoute><LazyClips /></LazyRoute>} />
                  <Route path="/statistics" element={<LazyRoute><LazyStatistics /></LazyRoute>} />
                  <Route path="/calendar" element={<LazyRoute><LazyCalendar /></LazyRoute>} />
                  <Route path="/activity" element={<LazyRoute><LazyActivity /></LazyRoute>} />
                  <Route path="/maintenance" element={<LazyRoute><LazyMaintenance /></LazyRoute>} />
                  <Route path="/tasks" element={<LazyRoute><LazyTasks /></LazyRoute>} />

                  {/* Settings - LAZY */}
                  <Route path="/settings" element={<LazyRoute><LazySettings /></LazyRoute>} />
                  <Route path="/settings/export" element={<LazyRoute><LazyExport /></LazyRoute>} />
                  <Route path="/settings/labels" element={<LazyRoute><LazyCustomLabels /></LazyRoute>} />
                  <Route path="/settings/users" element={<LazyRoute><LazyUsers /></LazyRoute>} />
                  <Route path="/settings/beebrain" element={<LazyRoute><LazyBeeBrainConfigPage /></LazyRoute>} />

                  {/* Seasonal - LAZY */}
                  <Route path="/recap" element={<LazyRoute><LazySeasonRecap /></LazyRoute>} />
                  <Route path="/overwintering/survey" element={<LazyRoute><LazyOverwinteringSurvey /></LazyRoute>} />
                  <Route path="/overwintering/report" element={<LazyRoute><LazyWinterReport /></LazyRoute>} />

                  {/* Admin routes - LAZY (Super-admin only, SaaS mode only) */}
                  <Route path="/admin/tenants" element={<AdminGuard><LazyRoute><LazyAdminTenants /></LazyRoute></AdminGuard>} />
                  <Route path="/admin/tenants/:tenantId" element={<AdminGuard><LazyRoute><LazyAdminTenantDetail /></LazyRoute></AdminGuard>} />
                  <Route path="/admin/beebrain" element={<AdminGuard><LazyRoute><LazyAdminBeeBrain /></LazyRoute></AdminGuard>} />

                  {/* 404 catch-all */}
                  <Route path="*" element={<LazyRoute><LazyNotFound /></LazyRoute>} />
                </Route>
              </Routes>
            </Refine>
          </AntdApp>
        </ConfigProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}

export default App;
