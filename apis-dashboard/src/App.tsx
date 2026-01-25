import { useEffect } from "react";
import { Refine } from "@refinedev/core";
import { ConfigProvider, App as AntdApp, notification } from "antd";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { apisTheme } from "./theme/apisTheme";
import { AppLayout } from "./components/layout";
import { AuthGuard } from "./components/auth";
import { authProvider, authenticatedDataProvider } from "./providers";
import { SettingsProvider, BackgroundSyncProvider, ProactiveInsightsProvider } from "./context";
import { UpdateNotification } from "./components/UpdateNotification";
import { checkAndPruneStorage } from "./services/offlineCache";
import {
  Dashboard,
  Units,
  UnitDetail,
  UnitRegister,
  UnitEdit,
  Sites,
  SiteDetail,
  SiteCreate,
  SiteEdit,
  Hives,
  HiveCreate,
  HiveEdit,
  HiveDetail,
  InspectionCreate,
  InspectionEdit,
  Clips,
  Statistics,
  Settings,
  Export,
  Login,
  Callback,
  Maintenance,
  SeasonRecap,
} from "./pages";

/**
 * Main Application Component
 *
 * Sets up the application with:
 * - Ant Design theme (Honey Beegood palette)
 * - Refine data provider for API integration
 * - Zitadel OIDC authentication
 * - React Router with protected routes
 * - All navigation pages as nested routes
 */
function App() {
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

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SettingsProvider>
        <ConfigProvider theme={apisTheme}>
          <AntdApp>
            <UpdateNotification />
            <Refine
              dataProvider={authenticatedDataProvider}
              authProvider={authProvider}
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
                <Route path="/login" element={<Login />} />
                <Route path="/callback" element={<Callback />} />

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
                  <Route index element={<Dashboard />} />
                  <Route path="/sites" element={<Sites />} />
                  <Route path="/sites/create" element={<SiteCreate />} />
                  <Route path="/sites/:id" element={<SiteDetail />} />
                  <Route path="/sites/:id/edit" element={<SiteEdit />} />
                  <Route path="/units" element={<Units />} />
                  <Route path="/units/register" element={<UnitRegister />} />
                  <Route path="/units/:id" element={<UnitDetail />} />
                  <Route path="/units/:id/edit" element={<UnitEdit />} />
                  <Route path="/hives" element={<Hives />} />
                  <Route path="/hives/:id" element={<HiveDetail />} />
                  <Route path="/hives/:id/edit" element={<HiveEdit />} />
                  <Route path="/hives/:hiveId/inspections/new" element={<InspectionCreate />} />
                  <Route path="/inspections/:id/edit" element={<InspectionEdit />} />
                  <Route path="/sites/:siteId/hives/create" element={<HiveCreate />} />
                  <Route path="/clips" element={<Clips />} />
                  <Route path="/statistics" element={<Statistics />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/settings/export" element={<Export />} />
                  <Route path="/maintenance" element={<Maintenance />} />
                  <Route path="/recap" element={<SeasonRecap />} />
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
