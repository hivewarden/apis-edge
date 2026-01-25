/**
 * Login Page
 *
 * The welcoming entrance to APIS - featuring warm honey aesthetics
 * and a friendly, trustworthy design that reflects the beekeeping theme.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Card, Typography, Space, Alert } from "antd";
import { LoginOutlined, ReloadOutlined } from "@ant-design/icons";
import { loginWithReturnTo } from "../providers";
import { colors } from "../theme/apisTheme";

const { Title, Text, Paragraph } = Typography;

/**
 * Login page component.
 *
 * Creates an inviting, warm first impression with:
 * - Subtle honeycomb background pattern
 * - Friendly bee branding with golden glow
 * - Clear call-to-action
 * - Graceful error handling
 *
 * Supports returnTo query parameter for post-login redirect.
 */
export function Login() {
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const returnTo = searchParams.get("returnTo");
      await loginWithReturnTo(returnTo ? decodeURIComponent(returnTo) : undefined);
    } catch (err) {
      setIsLoading(false);
      const message = err instanceof Error ? err.message : "Failed to connect to authentication service";
      setError(message);
    }
  };

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
          width: 420,
          textAlign: "center",
          borderRadius: 20,
          border: `1px solid ${colors.seaBuckthorn}30`,
          boxShadow: `0 8px 40px ${colors.brownBramble}15, 0 0 0 1px ${colors.salomie}`,
          background: `linear-gradient(180deg, ${colors.coconutCream} 0%, ${colors.salomie}20 100%)`,
          backdropFilter: "blur(10px)",
          position: "relative",
          zIndex: 1,
        }}
        styles={{
          body: { padding: "40px 36px" },
        }}
      >
        <Space direction="vertical" size={24} style={{ width: "100%" }}>
          {/* Error Alert */}
          {error && (
            <Alert
              type="error"
              message="Connection Error"
              description={error}
              showIcon
              style={{ textAlign: "left", borderRadius: 12 }}
              action={
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={handleLogin}
                >
                  Retry
                </Button>
              }
            />
          )}

          {/* Logo and Branding */}
          <div>
            {/* Bee icon with glow */}
            <div
              style={{
                fontSize: 56,
                lineHeight: 1,
                marginBottom: 8,
                filter: `drop-shadow(0 0 20px ${colors.seaBuckthorn}60)`,
              }}
              role="img"
              aria-label="Bee"
            >
              🐝
            </div>

            <Title
              level={1}
              style={{
                color: colors.brownBramble,
                margin: 0,
                marginBottom: 4,
                fontSize: 42,
                fontWeight: 700,
                letterSpacing: "-1px",
              }}
            >
              APIS
            </Title>

            <Text
              style={{
                color: colors.brownBramble,
                opacity: 0.7,
                fontSize: 14,
                letterSpacing: "0.5px",
              }}
            >
              Anti-Predator Interference System
            </Text>
          </div>

          {/* Description */}
          <Paragraph
            style={{
              color: colors.brownBramble,
              margin: 0,
              fontSize: 15,
              lineHeight: 1.6,
            }}
          >
            Sign in to monitor your hives and manage your hornet defense units.
          </Paragraph>

          {/* Login Button */}
          <Button
            type="primary"
            size="large"
            icon={<LoginOutlined />}
            onClick={handleLogin}
            loading={isLoading}
            style={{
              width: "100%",
              height: 56,
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${colors.brownBramble} 0%, ${colors.brownBramble}dd 100%)`,
              borderColor: colors.brownBramble,
              boxShadow: `0 4px 16px ${colors.brownBramble}30`,
              transition: "all 0.25s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = `0 6px 20px ${colors.brownBramble}40`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = `0 4px 16px ${colors.brownBramble}30`;
            }}
          >
            Sign in with Zitadel
          </Button>

          {/* Footer */}
          <div
            style={{
              paddingTop: 16,
              borderTop: `1px solid ${colors.seaBuckthorn}20`,
            }}
          >
            <Text
              style={{
                color: colors.brownBramble,
                opacity: 0.5,
                fontSize: 12,
              }}
            >
              Secure authentication powered by Zitadel
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
}

export default Login;
