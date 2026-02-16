/**
 * Invite Accept Page
 *
 * Page for accepting an invitation to join APIS.
 * Users arrive here via an invite link and create their account.
 *
 * Flow:
 * 1. Extract token from URL parameter
 * 2. Fetch invite info (validates token, gets role and tenant name)
 * 3. Display form to enter name, email (pre-filled for email invites), password
 * 4. On submit, create account and start session
 * 5. Redirect to dashboard
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Card,
  Typography,
  Space,
  Spin,
  Alert,
  Form,
  Input,
  Button,
  message,
} from "antd";
import {
  UserOutlined,
  MailOutlined,
  LockOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { colors } from "../theme/apisTheme";
import { API_URL, clearAuthConfigCache } from "../config";
import { sanitizeString } from "../utils/sanitizeError";

const { Title, Text, Paragraph } = Typography;

interface InviteInfo {
  role: string;
  tenant_name: string;
  email?: string;
  expires_at: string;
}

interface AcceptInviteForm {
  display_name: string;
  email: string;
  password: string;
  confirm_password: string;
}

/**
 * Invite Accept page component.
 *
 * Displays an invitation acceptance form with:
 * - Organization/tenant name
 * - Role being assigned
 * - Form for name, email, and password
 */
export function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm<AcceptInviteForm>();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);

  // Fetch invite info on mount
  useEffect(() => {
    if (!token) {
      setError("Invalid invite link - no token provided");
      setIsLoading(false);
      return;
    }

    async function fetchInviteInfo() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`${API_URL}/invite/${token}`);

        if (response.status === 404) {
          setError("This invite link is invalid or does not exist");
          return;
        }

        if (response.status === 410) {
          // Gone - expired or already used
          const data = await response.json();
          // SECURITY (S4-M4): Sanitize server error messages before display
          setError(sanitizeString(data.error || "This invite has expired or already been used"));
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to load invite: ${response.statusText}`);
        }

        const data = await response.json();
        setInviteInfo(data.data);

        // Pre-fill email if provided in invite
        if (data.data.email) {
          form.setFieldsValue({ email: data.data.email });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load invite";
        // SECURITY (S4-M4): Sanitize error messages before display
        setError(sanitizeString(msg));
      } finally {
        setIsLoading(false);
      }
    }

    fetchInviteInfo();
  }, [token, form]);

  // Handle form submission
  const handleSubmit = async (values: AcceptInviteForm) => {
    if (!token) return;

    try {
      setIsSubmitting(true);

      // SECURITY (S4-M3): This endpoint uses raw fetch() instead of apiClient because
      // the user is not yet authenticated (no session cookie/token exists).
      // CSRF protection is intentionally omitted because:
      // 1. No CSRF cookie exists before authentication
      // 2. The invite token itself acts as a CSRF-like proof of intent
      // 3. The server validates the invite token and origin
      const response = await fetch(`${API_URL}/invite/${token}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for session
        body: JSON.stringify({
          email: values.email.trim().toLowerCase(),
          display_name: values.display_name.trim(),
          password: values.password,
        }),
      });

      if (response.status === 404) {
        setError("This invite link is invalid or does not exist");
        return;
      }

      if (response.status === 410) {
        const data = await response.json();
        // SECURITY (S4-M4): Sanitize server error messages before display
        setError(sanitizeString(data.error || "This invite has expired or already been used"));
        return;
      }

      if (response.status === 409) {
        setError("A user with this email already exists. Please login instead.");
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        // SECURITY (S4-M4): Sanitize server error messages before display
        throw new Error(sanitizeString(data.error || "Failed to create account"));
      }

      // Success!
      message.success("Account created successfully!");

      // Clear auth config cache to ensure fresh state
      clearAuthConfigCache();

      // Navigate to dashboard (session cookie was set by the API)
      navigate("/", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create account";
      // SECURITY (S4-M4): Error is already sanitized if it came from our throw above
      message.error(sanitizeString(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <InviteContainer>
        <Space direction="vertical" align="center" style={{ padding: "24px 0" }}>
          <Spin size="large" />
          <Text style={{ color: colors.brownBramble, opacity: 0.7 }}>
            Loading invite...
          </Text>
        </Space>
      </InviteContainer>
    );
  }

  // Error state
  if (error) {
    return (
      <InviteContainer>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="error"
            message="Invite Error"
            description={error}
            showIcon
          />
          <Button type="primary" block onClick={() => navigate("/login")}>
            Go to Login
          </Button>
        </Space>
      </InviteContainer>
    );
  }

  // No invite info (shouldn't happen)
  if (!inviteInfo) {
    return null;
  }

  // Render invite acceptance form
  return (
    <InviteContainer>
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
            Join {inviteInfo.tenant_name}
          </Title>
          <Paragraph
            style={{
              color: colors.textMuted,
              margin: 0,
              fontSize: 15,
            }}
          >
            You've been invited to join as{" "}
            <Text strong style={{ color: colors.seaBuckthorn }}>
              {inviteInfo.role === "admin" ? "an Administrator" : "a Member"}
            </Text>
          </Paragraph>
        </div>

        {/* Role badge */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            background: `${colors.seaBuckthorn}10`,
            borderRadius: 12,
            border: `1px solid ${colors.seaBuckthorn}30`,
          }}
        >
          <TeamOutlined style={{ color: colors.seaBuckthorn, fontSize: 20 }} />
          <Text style={{ color: colors.brownBramble }}>
            {inviteInfo.tenant_name}
          </Text>
        </div>

        {/* Sign up form */}
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          size="large"
        >
          <Form.Item
            name="display_name"
            label="Your Name"
            rules={[
              { required: true, message: "Please enter your name" },
              { min: 2, message: "Name must be at least 2 characters" },
              { max: 100, message: "Name must be 100 characters or less" },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: colors.textMuted }} />}
              placeholder="Enter your full name"
            />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email Address"
            rules={[
              { required: true, message: "Please enter your email" },
              { type: "email", message: "Please enter a valid email" },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: colors.textMuted }} />}
              placeholder="Enter your email"
              disabled={!!inviteInfo.email} // Disable if pre-filled from invite
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: "Please enter a password" },
              { min: 8, message: "Password must be at least 8 characters" },
              { max: 72, message: "Password must not exceed 72 characters" },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: colors.textMuted }} />}
              placeholder="Create a password (min 8 characters)"
              maxLength={72}
            />
          </Form.Item>

          <Form.Item
            name="confirm_password"
            label="Confirm Password"
            dependencies={["password"]}
            rules={[
              { required: true, message: "Please confirm your password" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("Passwords do not match"));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: colors.textMuted }} />}
              placeholder="Confirm your password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={isSubmitting}
              style={{
                height: 48,
                fontWeight: 600,
                background: colors.seaBuckthorn,
                borderColor: colors.seaBuckthorn,
              }}
            >
              {isSubmitting ? "Creating Account..." : "Create Account & Join"}
            </Button>
          </Form.Item>
        </Form>

        {/* Already have account link */}
        <div style={{ textAlign: "center" }}>
          <Text style={{ color: colors.textMuted }}>
            Already have an account?{" "}
            <a
              onClick={() => navigate("/login")}
              style={{ color: colors.seaBuckthorn, cursor: "pointer" }}
            >
              Sign in
            </a>
          </Text>
        </div>
      </Space>
    </InviteContainer>
  );
}

/**
 * Container component with consistent styling for the invite page.
 */
function InviteContainer({ children }: { children: React.ReactNode }) {
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
          borderRadius: 20,
          border: `1px solid ${colors.seaBuckthorn}30`,
          boxShadow: `0 8px 40px ${colors.brownBramble}15, 0 0 0 1px ${colors.salomie}`,
          background: `linear-gradient(180deg, ${colors.coconutCream} 0%, ${colors.salomie}20 100%)`,
          backdropFilter: "blur(10px)",
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

export default InviteAccept;
