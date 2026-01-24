/**
 * Login Page
 *
 * Simple login page with a button to trigger OIDC authentication.
 * Uses the APIS theme colors for consistent branding.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Card, Typography, Space, Alert } from "antd";
import { LoginOutlined, ReloadOutlined } from "@ant-design/icons";
import { loginWithReturnTo } from "../providers";

const { Title, Paragraph } = Typography;

/**
 * Login page component.
 *
 * Displays:
 * - APIS branding
 * - Login with Zitadel button
 * - Brief description
 * - Error message with retry option if login fails
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
      // Get returnTo from query params (set by AuthGuard)
      const returnTo = searchParams.get("returnTo");
      await loginWithReturnTo(returnTo ? decodeURIComponent(returnTo) : undefined);
    } catch (err) {
      setIsLoading(false);
      // Login redirect failed - show error with retry option
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
        backgroundColor: "#fbf9e7", // coconutCream
      }}
    >
      <Card
        style={{
          width: 400,
          textAlign: "center",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
        }}
      >
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {/* Error Alert */}
          {error && (
            <Alert
              type="error"
              message="Connection Error"
              description={error}
              showIcon
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

          {/* Logo and Title */}
          <div>
            <Title
              level={1}
              style={{
                color: "#662604", // brownBramble
                marginBottom: 8,
              }}
            >
              APIS
            </Title>
            <Paragraph type="secondary">
              Anti-Predator Interference System
            </Paragraph>
          </div>

          {/* Description */}
          <Paragraph>
            Sign in to access your hive monitoring dashboard and manage your
            hornet defense units.
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
              height: 48,
              backgroundColor: "#662604", // brownBramble
              borderColor: "#662604",
            }}
          >
            Sign in with Zitadel
          </Button>

          {/* Footer */}
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 16 }}>
            Secure authentication powered by Zitadel
          </Paragraph>
        </Space>
      </Card>
    </div>
  );
}

export default Login;
