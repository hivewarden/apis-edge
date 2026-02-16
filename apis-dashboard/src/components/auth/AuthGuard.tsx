/**
 * AuthGuard Component
 *
 * Protects routes by checking authentication status using Refine's auth system.
 * Redirects unauthenticated users to the login page.
 * Works with both local and Keycloak auth modes.
 *
 * DEV MODE: When VITE_DEV_MODE=true, authentication is bypassed.
 */
import { type ReactNode } from "react";
import { useIsAuthenticated } from "@refinedev/core";
import { Navigate, useLocation } from "react-router-dom";
import { Spin, Typography } from "antd";
import { DEV_MODE } from "../../config";

const { Paragraph } = Typography;

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Wraps protected content and ensures user is authenticated.
 *
 * Uses Refine's useIsAuthenticated hook which works with any auth provider,
 * making it compatible with both local and Keycloak authentication modes.
 *
 * Behavior:
 * - DEV MODE: Immediately renders children (no auth check)
 * - While checking auth status: Shows loading spinner
 * - If authenticated: Renders children
 * - If not authenticated: Redirects to login with return URL
 *
 * @example
 * <AuthGuard>
 *   <Dashboard />
 * </AuthGuard>
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const location = useLocation();
  const { data, isLoading } = useIsAuthenticated();

  // DEV MODE: Skip auth check entirely
  if (DEV_MODE) {
    return <>{children}</>;
  }

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          gap: 16,
        }}
      >
        <Spin size="large" />
        <Paragraph type="secondary">Checking authentication...</Paragraph>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!data?.authenticated) {
    const returnTo = location.pathname + location.search;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  // Render protected content if authenticated
  return <>{children}</>;
}

export default AuthGuard;
