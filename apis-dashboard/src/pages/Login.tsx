/**
 * Login Page
 *
 * The welcoming entrance to APIS - featuring warm honey aesthetics
 * and a friendly, trustworthy design that reflects the beekeeping theme.
 *
 * Supports dual authentication modes:
 * - Local mode: Email/password form (LoginForm component)
 * - Keycloak mode: SSO button (OIDCLoginButton component)
 *
 * DEV MODE: When VITE_DEV_MODE=true, automatically redirects to dashboard.
 *
 * Design reference: /docs/hardware/stitch_apis_v2/apis_local_login/
 *                   /docs/hardware/stitch_apis_v2/apis_sso_login/
 */
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Spin } from "antd";
import { colors } from "../theme/apisTheme";
import { DEV_MODE, fetchAuthConfig } from "../config";
import type { AuthConfig } from "../types/auth";
import { LoginForm, OIDCLoginButton } from "../components/auth";
import { getSafeRedirectUrl } from "../utils/urlValidation";

/**
 * Login page component.
 *
 * Creates an inviting, warm first impression with:
 * - Subtle honeycomb background pattern
 * - Friendly bee branding with golden glow
 * - Mode-aware authentication (local or Keycloak OIDC)
 * - Graceful error handling
 *
 * Supports returnTo query parameter for post-login redirect.
 */
export function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // Get returnTo from URL params
  // Validate that returnTo is a relative path to prevent open redirect attacks
  const returnTo = searchParams.get("returnTo");
  const decodedReturnTo = returnTo ? decodeURIComponent(returnTo) : undefined;
  const safeReturnTo = getSafeRedirectUrl(decodedReturnTo, undefined) || undefined;

  // DEV MODE: Auto-redirect to dashboard (skip login)
  useEffect(() => {
    if (DEV_MODE) {
      if (import.meta.env.DEV) {
        console.warn("DEV MODE: Skipping login, redirecting to dashboard");
      }
      navigate(safeReturnTo || "/", { replace: true });
    }
  }, [navigate, safeReturnTo]);

  // Fetch auth configuration on mount
  useEffect(() => {
    if (DEV_MODE) return;

    async function loadAuthConfig() {
      try {
        setIsLoadingConfig(true);
        setConfigError(null);
        const config = await fetchAuthConfig();
        setAuthConfig(config);

        // If setup is required, redirect to setup page
        if (config.mode === "local" && config.setup_required) {
          navigate("/setup", { replace: true });
          return;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load auth configuration";
        setConfigError(message);
      } finally {
        setIsLoadingConfig(false);
      }
    }

    loadAuthConfig();
  }, [navigate]);

  // Handle successful local login
  const handleLoginSuccess = () => {
    // Refine's useLogin handles the redirect via redirectTo in the auth provider
    // But we can also manually navigate if needed
    navigate(safeReturnTo || "/", { replace: true });
  };

  // Render loading state
  const renderLoading = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0", gap: 12 }}>
      <Spin size="large" />
      <span style={{ color: colors.brownBramble, opacity: 0.7, fontSize: 14 }}>
        Checking authentication...
      </span>
    </div>
  );

  // Render error state
  const renderError = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
      <span style={{ color: colors.error, textAlign: "center" }}>
        {configError}
      </span>
      <span
        style={{
          textAlign: "center",
          color: colors.brownBramble,
          opacity: 0.7,
          fontSize: 14,
        }}
      >
        Please check your connection and try again.
      </span>
    </div>
  );

  // Check if in SSO mode
  const isSsoMode = authConfig?.mode === "keycloak";

  // SSO Mode Layout - logo above card per mockup
  if (isSsoMode) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          background: colors.coconutCream,
          padding: 16,
          // Subtle pattern background per mockup
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
          {/* Logo and brand name above card */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 64,
                height: 64,
                background: colors.seaBuckthorn,
                borderRadius: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 8px 24px ${colors.seaBuckthorn}33`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: "white" }}>
                hive
              </span>
            </div>
            <span
              style={{
                color: colors.brownBramble,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Hive Warden
            </span>
          </div>

          {/* SSO Card */}
          <div
            style={{
              width: "100%",
              background: "#ffffff",
              borderRadius: 16,
              boxShadow: "0 20px 40px -10px rgba(28, 22, 13, 0.05)",
              padding: "32px 40px",
              position: "relative",
              overflow: "hidden",
              border: `1px solid ${colors.seaBuckthorn}1a`,
            }}
          >
            {/* Subtle gradient line at top */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 4,
                background: `linear-gradient(to right, transparent, ${colors.seaBuckthorn}, transparent)`,
                opacity: 0.5,
              }}
            />

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
              {/* Heading */}
              <div style={{ textAlign: "center" }}>
                <h1
                  style={{
                    color: "#1c160d",
                    margin: 0,
                    fontSize: 28,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Sign in to Hive Warden
                </h1>
                <p
                  style={{
                    color: "#5c4d3c",
                    fontSize: 14,
                    marginTop: 8,
                    marginBottom: 0,
                  }}
                >
                  Secure authentication via your identity provider.
                </p>
              </div>

              {/* Content */}
              <div style={{ width: "100%", paddingTop: 8 }}>
                {isLoadingConfig ? renderLoading() : configError ? renderError() : (
                  <>
                    <OIDCLoginButton returnTo={safeReturnTo} />
                    <p
                      style={{
                        textAlign: "center",
                        color: "#5c4d3c",
                        opacity: 0.7,
                        fontSize: 12,
                        marginTop: 16,
                        marginBottom: 0,
                        padding: "0 16px",
                      }}
                    >
                      You will be redirected to our identity provider to complete your login securely.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Footer links */}
          <footer style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
            <div style={{ display: "flex", gap: 24 }}>
              <a
                href="#"
                style={{ color: "#5c4d3c", fontSize: 14, textDecoration: "none" }}
                onMouseEnter={(e) => e.currentTarget.style.color = colors.seaBuckthorn}
                onMouseLeave={(e) => e.currentTarget.style.color = "#5c4d3c"}
              >
                Privacy Policy
              </a>
              <span style={{ color: "#5c4d3c", opacity: 0.3 }}>-</span>
              <a
                href="#"
                style={{ color: "#5c4d3c", fontSize: 14, textDecoration: "none" }}
                onMouseEnter={(e) => e.currentTarget.style.color = colors.seaBuckthorn}
                onMouseLeave={(e) => e.currentTarget.style.color = "#5c4d3c"}
              >
                Terms of Service
              </a>
            </div>
            <p style={{ color: "#5c4d3c", opacity: 0.5, fontSize: 12, margin: 0 }}>
              &copy; {new Date().getFullYear()} Hive Warden. All rights reserved.
            </p>
          </footer>
        </div>
      </div>
    );
  }

  // Local Mode Layout - logo inside card per mockup
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: colors.coconutCream,
        padding: 16,
      }}
    >
      {/* Login Card - per DESIGN-KEY: 16px border radius (rounded-2xl) */}
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          textAlign: "center",
          borderRadius: 16, // rounded-2xl per DESIGN-KEY
          border: "none",
          boxShadow: "0 25px 50px -12px rgba(102, 38, 4, 0.15)",
          background: "#ffffff",
          position: "relative",
          overflow: "hidden",
          padding: "32px 40px 40px",
        }}
      >
        {/* Gradient top border per mockup */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            background: `linear-gradient(to right, ${colors.seaBuckthorn}66, ${colors.seaBuckthorn})`,
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          {/* Logo and Branding - per mockup */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {/* Orange square icon with honeycomb pattern */}
            <div
              style={{
                width: 64,
                height: 64,
                background: colors.seaBuckthorn,
                borderRadius: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 1px 3px rgba(102, 38, 4, 0.1)",
              }}
            >
              {/* Honeycomb SVG icon per mockup */}
              <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
                <path d="M12 2L14.6 3.5V6.5L12 8L9.4 6.5V3.5L12 2Z" />
                <path d="M6.5 5.5L9.1 7V10L6.5 11.5L3.9 10V7L6.5 5.5Z" />
                <path d="M17.5 5.5L20.1 7V10L17.5 11.5L14.9 10V7L17.5 5.5Z" />
                <path d="M12 9L14.6 10.5V13.5L12 15L9.4 13.5V10.5L12 9Z" />
                <path d="M6.5 12.5L9.1 14V17L6.5 18.5L3.9 17V14L6.5 12.5Z" />
                <path d="M17.5 12.5L20.1 14V17L17.5 18.5L14.9 17V14L17.5 12.5Z" />
                <path d="M12 16L14.6 17.5V20.5L12 22L9.4 20.5V17.5L12 16Z" />
              </svg>
            </div>

            <span
              style={{
                color: colors.brownBramble,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              Hive Warden
            </span>
          </div>

          {/* Welcome heading */}
          <div style={{ marginTop: 8 }}>
            <h1
              style={{
                color: "#1c160d",
                margin: 0,
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              Welcome back
            </h1>
            <p
              style={{
                color: "#9d7a48",
                fontSize: 14,
                marginTop: 4,
                marginBottom: 0,
              }}
            >
              Log in to manage your apiary locally.
            </p>
          </div>

          {/* Auth Content */}
          <div style={{ marginTop: 8, width: "100%" }}>
            {isLoadingConfig ? renderLoading() : configError ? renderError() : (
              <LoginForm onSuccess={handleLoginSuccess} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
