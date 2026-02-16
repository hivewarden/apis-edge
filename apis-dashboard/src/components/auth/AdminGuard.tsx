/**
 * AdminGuard Component
 *
 * Protects admin routes by checking the user's role/permissions.
 * Redirects non-admin users to the dashboard.
 * Works with both local and Keycloak auth modes.
 *
 * Local mode: getPermissions returns ['admin'] or ['member']
 * Keycloak mode: getPermissions returns role strings from OIDC claims
 *
 * SECURITY (S4-C1): Client-side role guard for admin routes.
 * Note: This is a defense-in-depth measure. Server-side authorization
 * must also enforce admin-only access on API endpoints.
 */
import { type ReactNode } from "react";
import { usePermissions } from "@refinedev/core";
import { Navigate } from "react-router-dom";
import { Spin, Typography } from "antd";
import { DEV_MODE } from "../../config";

const { Paragraph } = Typography;

/** Roles that grant admin access */
const ADMIN_ROLES = ["admin", "super_admin"];

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * Check if the user's permissions include an admin role.
 *
 * @param permissions - Permissions array from getPermissions (string[] or unknown)
 * @returns True if the user has admin or super_admin role
 */
function hasAdminRole(permissions: unknown): boolean {
  if (!Array.isArray(permissions)) {
    return false;
  }

  return permissions.some(
    (perm) => typeof perm === "string" && ADMIN_ROLES.includes(perm)
  );
}

/**
 * Wraps admin content and ensures the user has admin permissions.
 *
 * Uses Refine's usePermissions hook which delegates to the auth provider's
 * getPermissions method, making it compatible with both local and Keycloak modes.
 *
 * Behavior:
 * - DEV MODE: Immediately renders children (no role check)
 * - While checking permissions: Shows loading spinner
 * - If admin role: Renders children
 * - If not admin: Redirects to dashboard (/)
 *
 * @example
 * <AuthGuard>
 *   <AdminGuard>
 *     <AdminTenants />
 *   </AdminGuard>
 * </AuthGuard>
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { data: permissions, isLoading } = usePermissions();

  // DEV MODE: Skip role check entirely
  if (DEV_MODE) {
    return <>{children}</>;
  }

  // Show loading spinner while checking permissions
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
        <Paragraph type="secondary">Checking permissions...</Paragraph>
      </div>
    );
  }

  // Redirect to dashboard if user lacks admin role
  if (!hasAdminRole(permissions)) {
    return <Navigate to="/" replace />;
  }

  // Render admin content
  return <>{children}</>;
}

export default AdminGuard;
