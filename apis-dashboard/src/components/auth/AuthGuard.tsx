/**
 * AuthGuard Component
 *
 * Protects routes by checking authentication status.
 * Redirects unauthenticated users to the login page.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Spin, Typography } from "antd";
import { userManager } from "../../providers/authProvider";

const { Paragraph } = Typography;

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Wraps protected content and ensures user is authenticated.
 *
 * Behavior:
 * - While checking auth status: Shows loading spinner
 * - If authenticated: Renders children
 * - If not authenticated: Triggers OIDC login with return URL in state
 *
 * @example
 * <AuthGuard>
 *   <Dashboard />
 * </AuthGuard>
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await userManager.getUser();
        if (user && !user.expired) {
          setIsAuthenticated(true);
        } else {
          // Redirect to login page with return URL stored for after login
          const returnTo = location.pathname + location.search;
          navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
        }
      } catch {
        // Auth check failed - redirect to login
        navigate("/login", { replace: true });
      }
    };

    checkAuth();
  }, [navigate, location]);

  // Show loading spinner while checking authentication
  if (isAuthenticated === null) {
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

  // Render protected content if authenticated
  return <>{children}</>;
}

export default AuthGuard;
