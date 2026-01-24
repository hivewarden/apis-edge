/**
 * OIDC Callback Page
 *
 * Handles the redirect back from Zitadel after authentication.
 * Processes the authorization code and exchanges it for tokens.
 */
import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Spin, Alert, Typography } from "antd";
import { userManager } from "../providers";

const { Paragraph } = Typography;

/**
 * Callback page component.
 *
 * This page is the redirect_uri for OIDC.
 * It processes the authorization code from the URL and:
 * 1. Exchanges code for tokens (handled by oidc-client-ts)
 * 2. Stores tokens in session storage
 * 3. Redirects to the original destination or dashboard
 */
export function Callback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Process the OIDC callback - exchanges code for tokens
        // oidc-client-ts handles the code verifier (PKCE) automatically
        const user = await userManager.signinRedirectCallback();

        // Get the return URL from OIDC state (set during authorize)
        // Falls back to dashboard if no state was set
        const state = user?.state as { returnTo?: string } | undefined;
        const returnTo = state?.returnTo || "/";
        navigate(returnTo, { replace: true });
      } catch (err) {
        // Extract error message
        let errorMessage = "Authentication failed. Please try again.";
        if (err instanceof Error) {
          errorMessage = err.message;
        }

        // Check for specific OIDC errors in URL
        const urlError = searchParams.get("error");
        const urlErrorDesc = searchParams.get("error_description");
        if (urlError) {
          errorMessage = urlErrorDesc || urlError;
        }

        setError(errorMessage);

        // Redirect to login after showing error
        timeoutRef.current = setTimeout(() => {
          navigate("/login", { replace: true });
        }, 3000);
      }
    };

    handleCallback();

    // Cleanup timeout on unmount to prevent state updates on unmounted component
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [navigate, searchParams]);

  // Show error if callback processing failed
  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          backgroundColor: "#fbf9e7", // coconutCream
          padding: 24,
        }}
      >
        <Alert
          type="error"
          message="Authentication Failed"
          description={error}
          style={{ maxWidth: 400, marginBottom: 16 }}
        />
        <Paragraph type="secondary">
          Redirecting to login page...
        </Paragraph>
      </div>
    );
  }

  // Show loading while processing callback
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        backgroundColor: "#fbf9e7", // coconutCream
        gap: 16,
      }}
    >
      <Spin size="large" />
      <Paragraph type="secondary">Completing sign in...</Paragraph>
    </div>
  );
}

export default Callback;
