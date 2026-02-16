/**
 * LoginForm Component
 *
 * Email/password login form for local authentication mode.
 * Design reference: /docs/hardware/stitch_apis_v2/apis_local_login/
 *
 * Features:
 * - Email validation (required, format)
 * - Password validation (required)
 * - "Remember me" checkbox
 * - Loading state during submission
 * - Comprehensive error handling (401, 429, network errors)
 *
 * DESIGN-KEY styling:
 * - Inputs: 52px height, 12px border radius (rounded-xl), border #e9dece, bg #fcfaf8
 * - Input focus: ring-2 ring-primary/20, border-primary (#f7a42d)
 * - Labels: text-sm font-medium text-[#1c160d]
 * - Button: rounded-full, bg-primary (#f7a42d), font-bold, 52px height
 */
import { useState } from "react";
import { Form, Input, Button, Checkbox, Alert } from "antd";
import { useLogin } from "@refinedev/core";
import type { LocalLoginParams } from "../../types/auth";
import { colors } from "../../theme/apisTheme";

/**
 * Rate limit retry suggestion message.
 * Note: Actual rate limit window is server-configured.
 */
const RATE_LIMIT_RETRY_MESSAGE = "Too many attempts. Please wait and try again later.";

interface LoginFormProps {
  /** Callback fired on successful login */
  onSuccess?: () => void;
}

interface LoginFormValues {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Email/password login form component.
 *
 * Handles form validation, submission, and error display.
 * Uses Refine's useLogin hook for authentication.
 *
 * @example
 * ```tsx
 * <LoginForm onSuccess={() => navigate('/dashboard')} />
 * ```
 */
export function LoginForm({ onSuccess }: LoginFormProps) {
  const [form] = Form.useForm<LoginFormValues>();
  const [error, setError] = useState<string | null>(null);
  const { mutate: login, isLoading } = useLogin<LocalLoginParams>();

  const handleSubmit = (values: LoginFormValues) => {
    setError(null);

    login(
      {
        email: values.email,
        password: values.password,
        rememberMe: values.rememberMe,
      },
      {
        onSuccess: (data) => {
          if (data.success) {
            onSuccess?.();
          } else if (data.error) {
            // Handle specific error types from localAuthProvider
            const errorName = data.error.name;
            if (errorName === "InvalidCredentials") {
              setError("Invalid email or password");
            } else if (errorName === "RateLimited") {
              setError(RATE_LIMIT_RETRY_MESSAGE);
            } else if (errorName === "NetworkError") {
              setError("Unable to connect to server");
            } else {
              setError(data.error.message || "Login failed. Please try again.");
            }
          }
        },
        onError: () => {
          setError("Unable to connect to server");
        },
      }
    );
  };

  // Shared input style per DESIGN-KEY: 52px height, 12px border radius
  const inputStyle: React.CSSProperties = {
    borderRadius: 12, // rounded-xl per DESIGN-KEY
    height: 52, // 52px per DESIGN-KEY
    paddingLeft: 20,
    paddingRight: 20,
    border: "1px solid #e9dece",
    backgroundColor: "#fcfaf8",
    fontSize: 16,
    boxShadow: "0 1px 2px rgba(102, 38, 4, 0.04)",
    transition: "all 0.2s ease",
  };

  // Focus style for inputs per DESIGN-KEY: ring-2 ring-primary/20, border-primary
  const inputFocusStyle = `
    .apis-login-input:focus,
    .apis-login-input:focus-within,
    .apis-login-input .ant-input:focus,
    .apis-login-input .ant-input-password:focus-within {
      border-color: #f7a42d !important;
      box-shadow: 0 0 0 3px rgba(247, 164, 45, 0.2) !important;
      outline: none !important;
    }
    .apis-login-input .ant-input-affix-wrapper:focus,
    .apis-login-input .ant-input-affix-wrapper-focused {
      border-color: #f7a42d !important;
      box-shadow: 0 0 0 3px rgba(247, 164, 45, 0.2) !important;
    }
  `;

  // Label style per mockup
  const labelStyle: React.CSSProperties = {
    color: "#1c160d",
    fontWeight: 500,
    fontSize: 14,
    marginLeft: 4,
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      onValuesChange={() => error && setError(null)}
      autoComplete="on"
      requiredMark={false}
      style={{ width: "100%", marginTop: 8 }}
    >
      {/* Inject focus styles */}
      <style>{inputFocusStyle}</style>
      {/* Error Alert */}
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      {/* Email Field - per mockup styling */}
      <Form.Item
        name="email"
        label={<span style={labelStyle}>Email Address</span>}
        rules={[
          { required: true, message: "Please enter your email" },
          { type: "email", message: "Please enter a valid email" },
        ]}
        style={{ marginBottom: 20 }}
      >
        <Input
          placeholder="beekeeper@apis.com"
          size="large"
          autoComplete="email"
          autoFocus
          aria-label="Email address"
          className="apis-login-input"
          style={inputStyle}
        />
      </Form.Item>

      {/* Password Field - per mockup styling with visibility toggle */}
      <Form.Item
        name="password"
        label={<span style={labelStyle}>Password</span>}
        rules={[{ required: true, message: "Please enter your password" }]}
        style={{ marginBottom: 16 }}
      >
        <Input.Password
          placeholder="••••••••"
          size="large"
          autoComplete="current-password"
          aria-label="Password"
          className="apis-login-input"
          style={{
            ...inputStyle,
            paddingRight: 48, // room for visibility toggle
          }}
        />
      </Form.Item>

      {/* Remember Me + Forgot Password row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          paddingLeft: 4,
          paddingRight: 4,
        }}
      >
        <Form.Item name="rememberMe" valuePropName="checked" noStyle>
          <Checkbox style={{ color: "#1c160d", fontSize: 14 }}>
            Remember me
          </Checkbox>
        </Form.Item>
        <a
          href="#"
          style={{
            color: colors.seaBuckthorn,
            fontSize: 14,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Forgot password?
        </a>
      </div>

      {/* Submit Button - orange primary per mockup */}
      <Form.Item style={{ marginBottom: 16, marginTop: 8 }}>
        <Button
          type="primary"
          htmlType="submit"
          size="large"
          loading={isLoading}
          style={{
            width: "100%",
            height: 52, // 52px per DESIGN-KEY
            fontSize: 16,
            fontWeight: 700,
            borderRadius: 9999, // rounded-full per DESIGN-KEY for primary button
            background: "#f7a42d", // bg-primary per DESIGN-KEY
            borderColor: "#f7a42d",
            boxShadow: "0 4px 14px rgba(247, 164, 45, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#d98a1e";
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(247, 164, 45, 0.45)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = colors.seaBuckthorn;
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 14px rgba(247, 164, 45, 0.35)";
          }}
        >
          <span>Sign In</span>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20 }}
          >
            login
          </span>
        </Button>
      </Form.Item>

    </Form>
  );
}

export default LoginForm;
