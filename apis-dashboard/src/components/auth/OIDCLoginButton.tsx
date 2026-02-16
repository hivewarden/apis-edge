/**
 * OIDCLoginButton Component
 *
 * Single sign-on button for OIDC authentication.
 * Used in SaaS mode when auth mode is 'keycloak'.
 *
 * Design reference: /docs/hardware/stitch_apis_v2/apis_sso_login/
 * - Outline button (border primary, transparent bg)
 * - Pill shape (rounded-full)
 * - Shield icon + "Sign in with SSO" text
 */
import { useState } from "react";
import { Button, Alert } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { loginWithReturnTo } from "../../providers";
import { colors } from "../../theme/apisTheme";

interface OIDCLoginButtonProps {
  /** URL to redirect to after successful login (optional) */
  returnTo?: string;
}

/**
 * OIDC SSO login button component.
 *
 * Triggers the OIDC redirect flow for authentication.
 * Includes loading state and error handling with retry capability.
 *
 * @example
 * ```tsx
 * <OIDCLoginButton returnTo="/dashboard" />
 * ```
 */
export function OIDCLoginButton({ returnTo }: OIDCLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await loginWithReturnTo(returnTo);
      // Note: On success, loginWithReturnTo redirects away, so we don't reach here.
      // The finally block ensures loading is reset if redirect fails silently.
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to connect to authentication service";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Error Alert */}
      {error && (
        <Alert
          type="error"
          message="Connection Error"
          description={error}
          showIcon
          style={{ textAlign: "left", borderRadius: 12, marginBottom: 24 }}
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={handleLogin}>
              Retry
            </Button>
          }
        />
      )}

      {/* Login Button - Outline style per mockup */}
      <button
        onClick={handleLogin}
        disabled={isLoading}
        aria-label="Sign in with SSO"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          width: "100%",
          height: 56,
          fontSize: 16,
          fontWeight: 700,
          borderRadius: 9999, // rounded-full per mockup
          background: isHovered ? colors.seaBuckthorn : "transparent",
          border: `2px solid ${colors.seaBuckthorn}`,
          color: isHovered ? "#ffffff" : "#1c160d",
          cursor: isLoading ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          transition: "all 0.3s ease",
          letterSpacing: "0.02em",
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 24,
            color: isHovered ? "#ffffff" : colors.seaBuckthorn,
            transition: "color 0.3s ease",
          }}
        >
          shield_lock
        </span>
        <span>{isLoading ? "Connecting..." : "Sign in with SSO"}</span>
      </button>
    </>
  );
}

export default OIDCLoginButton;
