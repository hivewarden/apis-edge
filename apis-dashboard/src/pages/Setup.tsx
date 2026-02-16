/**
 * Setup Page
 *
 * First-time setup wizard page for APIS local authentication mode.
 * Creates the initial admin account and configures basic settings.
 *
 * This page is only accessible when:
 * - AUTH_MODE=local on the server
 * - No users exist in the system
 *
 * The page automatically redirects to login if setup is not required,
 * or to dashboard after successful setup.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Typography, Space, Spin, Alert } from "antd";
import { colors } from "../theme/apisTheme";
import { fetchAuthConfig, clearAuthConfigCache } from "../config";
import { SetupWizard } from "../components/auth/SetupWizard";
import type { AuthConfig } from "../types/auth";

const { Title, Text, Paragraph } = Typography;

/**
 * Setup page component for first-time APIS configuration.
 *
 * Flow:
 * 1. Check auth config to verify setup is required
 * 2. If not required, redirect to login
 * 3. Display setup wizard
 * 4. On success, redirect to dashboard
 */
export function Setup() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);

  // Check if setup is required
  useEffect(() => {
    async function checkSetupRequired() {
      try {
        setIsLoading(true);
        setError(null);

        // Clear cache to get fresh status
        clearAuthConfigCache();
        const config = await fetchAuthConfig();
        setAuthConfig(config);

        // If not in local mode or setup not required, redirect to login
        if (config.mode !== "local") {
          navigate("/login", { replace: true });
          return;
        }

        if (!config.setup_required) {
          navigate("/login", { replace: true });
          return;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to check setup status";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    checkSetupRequired();
  }, [navigate]);

  // Handle successful setup
  const handleSetupSuccess = () => {
    // Clear auth config cache so login page gets fresh status
    clearAuthConfigCache();
    // Navigate to dashboard
    navigate("/", { replace: true });
  };

  // Loading state
  if (isLoading) {
    return (
      <SetupContainer>
        <Space direction="vertical" align="center" style={{ padding: "24px 0" }}>
          <Spin size="large" />
          <Text style={{ color: colors.brownBramble, opacity: 0.7 }}>
            Checking setup status...
          </Text>
        </Space>
      </SetupContainer>
    );
  }

  // Error state
  if (error) {
    return (
      <SetupContainer>
        <Alert
          type="error"
          message="Connection Error"
          description={error}
          showIcon
          action={
            <a onClick={() => window.location.reload()}>Retry</a>
          }
        />
      </SetupContainer>
    );
  }

  // Setup not available (shouldn't reach here due to redirect)
  if (!authConfig || authConfig.mode !== "local" || !authConfig.setup_required) {
    return null;
  }

  // Render setup wizard
  return (
    <SetupContainer>
      <Space direction="vertical" size={24} style={{ width: "100%" }}>
        {/* Welcome message */}
        <div style={{ textAlign: "center" }}>
          <Title
            level={2}
            style={{
              color: colors.brownBramble,
              margin: 0,
              marginBottom: 8,
            }}
          >
            Welcome to Hive Warden
          </Title>
          <Paragraph
            style={{
              color: colors.textMuted,
              margin: 0,
              fontSize: 15,
            }}
          >
            Let's set up your beehive protection system
          </Paragraph>
        </div>

        {/* Setup wizard */}
        <SetupWizard onSuccess={handleSetupSuccess} />
      </Space>
    </SetupContainer>
  );
}

/**
 * Container component with consistent styling for the setup page.
 */
function SetupContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: `linear-gradient(135deg, ${colors.coconutCream} 0%, ${colors.salomie}40 50%, ${colors.coconutCream} 100%)`,
        position: "relative",
        overflow: "hidden",
        padding: 24,
      }}
    >
      {/* Decorative honeycomb pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='56' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='%23662604' stroke-width='1'/%3E%3Cpath d='M28 0L28 34L0 50L0 84L28 100L56 84L56 50L28 34' fill='none' stroke='%23662604' stroke-width='1'/%3E%3C/svg%3E")`,
          backgroundSize: "56px 100px",
          pointerEvents: "none",
        }}
      />

      {/* Decorative golden orb - top right */}
      <div
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.seaBuckthorn}30 0%, transparent 70%)`,
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      {/* Decorative golden orb - bottom left */}
      <div
        style={{
          position: "absolute",
          bottom: -80,
          left: -80,
          width: 250,
          height: 250,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.salomie}50 0%, transparent 70%)`,
          filter: "blur(50px)",
          pointerEvents: "none",
        }}
      />

      <Card
        style={{
          width: "100%",
          maxWidth: 480,
          borderRadius: 16, // rounded-2xl per DESIGN-KEY
          border: "1px solid #ece8d6", // orange-100 per DESIGN-KEY
          boxShadow: "0 4px 20px rgba(102, 38, 4, 0.05)", // shadow-soft per DESIGN-KEY
          background: "#ffffff", // white card background per DESIGN-KEY
          position: "relative",
          zIndex: 1,
        }}
        styles={{
          body: { padding: "32px 36px" },
        }}
      >
        {/* Bee icon */}
        <div
          style={{
            textAlign: "center",
            fontSize: 48,
            lineHeight: 1,
            marginBottom: 16,
            filter: `drop-shadow(0 0 20px ${colors.seaBuckthorn}60)`,
          }}
          role="img"
          aria-label="Bee"
        >
          {String.fromCodePoint(0x1F41D)}
        </div>

        {children}
      </Card>
    </div>
  );
}

export default Setup;
