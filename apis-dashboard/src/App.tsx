import { Refine } from "@refinedev/core";
import { ConfigProvider, App as AntdApp } from "antd";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { apisTheme } from "./theme/apisTheme";
import { AppLayout } from "./components/layout";
import { AuthGuard } from "./components/auth";
import { authProvider, authenticatedDataProvider } from "./providers";
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
  Clips,
  Statistics,
  Settings,
  Login,
  Callback,
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
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ConfigProvider theme={apisTheme}>
        <AntdApp>
          <Refine
            dataProvider={authenticatedDataProvider}
            authProvider={authProvider}
            resources={[
              { name: "dashboard", list: "/" },
              { name: "sites", list: "/sites", create: "/sites/create", show: "/sites/:id", edit: "/sites/:id/edit" },
              { name: "units", list: "/units", create: "/units/register", show: "/units/:id", edit: "/units/:id/edit" },
              { name: "hives", list: "/hives" },
              { name: "clips", list: "/clips" },
              { name: "statistics", list: "/statistics" },
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
                    <AppLayout />
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
                <Route path="/clips" element={<Clips />} />
                <Route path="/statistics" element={<Statistics />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Routes>
          </Refine>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
