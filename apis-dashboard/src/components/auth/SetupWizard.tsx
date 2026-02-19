/**
 * SetupWizard Component
 *
 * Multi-step wizard for initial APIS setup in local authentication mode.
 * Creates the first admin account and configures basic deployment settings.
 *
 * Steps:
 * 1. User Details - Display name, email, password
 * 2. Deployment Scenario - How the system will be accessed
 *
 * Features:
 * - Form validation with Ant Design Form
 * - Security warning for remote access
 * - Animated step transitions
 * - Error handling with retry capability
 */
import { useState } from "react";
import {
  Steps,
  Form,
  Input,
  Button,
  Select,
  Space,
  Alert,
  Typography,
} from "antd";
import {
  UserOutlined,
  MailOutlined,
  LockOutlined,
  GlobalOutlined,
  RocketOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import { colors } from "../../theme/apisTheme";
import { SecurityWarningModal } from "./SecurityWarningModal";
import { API_URL } from "../../config";
import { sanitizeString } from "../../utils/sanitizeError";

const { Title, Paragraph, Text } = Typography;

/** Deployment scenario options */
type DeploymentScenario = "dashboard_only" | "local_network" | "remote_access";

interface SetupFormValues {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  deploymentScenario: DeploymentScenario;
}

interface SetupWizardProps {
  /** Callback when setup completes successfully */
  onSuccess: () => void;
}

/** Deployment scenario descriptions */
const DEPLOYMENT_OPTIONS = [
  {
    value: "dashboard_only",
    label: "Dashboard Only",
    description: "View data from APIS units, no live video",
    icon: "dashboard",
  },
  {
    value: "local_network",
    label: "Local Network",
    description: "Access from devices on your home/office network",
    icon: "wifi",
  },
  {
    value: "remote_access",
    label: "Remote Access",
    description: "Access from anywhere over the internet",
    icon: "global",
  },
];

/**
 * Setup wizard component for first-time APIS configuration.
 *
 * @example
 * ```tsx
 * <SetupWizard onSuccess={() => navigate('/dashboard')} />
 * ```
 */
export function SetupWizard({ onSuccess }: SetupWizardProps) {
  const [form] = Form.useForm<SetupFormValues>();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecurityWarning, setShowSecurityWarning] = useState(false);
  const [securityAcknowledged, setSecurityAcknowledged] = useState(false);

  // Handle next step
  const handleNext = async () => {
    try {
      // Validate current step's fields
      if (currentStep === 0) {
        await form.validateFields([
          "displayName",
          "email",
          "password",
          "confirmPassword",
        ]);
      } else if (currentStep === 1) {
        await form.validateFields(["deploymentScenario"]);

        // Check if remote access selected and not acknowledged
        const scenario = form.getFieldValue("deploymentScenario");
        if (scenario === "remote_access" && !securityAcknowledged) {
          setShowSecurityWarning(true);
          return;
        }
      }

      if (currentStep < 1) {
        setCurrentStep(currentStep + 1);
        setError(null);
      } else {
        // Final step - submit
        handleSubmit();
      }
    } catch {
      // Validation failed - errors shown by form
    }
  };

  // Handle previous step
  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  // Handle security warning acknowledgment
  const handleSecurityAcknowledge = () => {
    setSecurityAcknowledged(true);
    setShowSecurityWarning(false);
    // Proceed to submit
    handleSubmit();
  };

  // Handle form submission
  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      const values = form.getFieldsValue(true);

      // SECURITY (S4-M2): Client-side validation before submission
      if (!values.email || !values.password || !values.displayName) {
        setError("Please fill in all required fields.");
        return;
      }

      // Submit to setup endpoint
      const response = await fetch(`${API_URL}/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          display_name: values.displayName,
          email: values.email,
          password: values.password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 404) {
          setError("Setup is no longer available. An admin account may already exist.");
        } else if (response.status === 403) {
          setError("Setup is only available in local authentication mode.");
        } else {
          // SECURITY (S4-M4): Sanitize server error messages before display
          const rawError = errorData.error || "Failed to create account. Please try again.";
          setError(sanitizeString(rawError));
        }
        return;
      }

      // Store deployment scenario in localStorage (informational only)
      localStorage.setItem("apis_deployment_scenario", values.deploymentScenario);

      // Success - call callback
      onSuccess();
    } catch (err) {
      setError("Unable to connect to server. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render step 1: User Details
  const renderUserDetailsStep = () => (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Title level={4} style={{ color: colors.brownBramble, marginBottom: 8 }}>
          Create Your Admin Account
        </Title>
        <Paragraph style={{ color: colors.textMuted, margin: 0 }}>
          This will be the first admin account for your Hive Warden deployment.
        </Paragraph>
      </div>

      <Form.Item
        name="displayName"
        rules={[
          { required: true, message: "Please enter your name" },
          { min: 2, message: "Name must be at least 2 characters" },
          { max: 100, message: "Name must be 100 characters or less" },
        ]}
      >
        <Input
          prefix={<UserOutlined style={{ color: colors.textMuted }} />}
          placeholder="Display Name"
          size="large"
          autoComplete="name"
          autoFocus
          maxLength={100}
          style={{ borderRadius: 8 }}
        />
      </Form.Item>

      <Form.Item
        name="email"
        rules={[
          { required: true, message: "Please enter your email" },
          { type: "email", message: "Please enter a valid email" },
        ]}
      >
        <Input
          prefix={<MailOutlined style={{ color: colors.textMuted }} />}
          placeholder="Email Address"
          size="large"
          autoComplete="email"
          style={{ borderRadius: 8 }}
        />
      </Form.Item>

      <Form.Item
        name="password"
        rules={[
          { required: true, message: "Please enter a password" },
          { min: 8, message: "Password must be at least 8 characters" },
          { max: 72, message: "Password must not exceed 72 characters" },
          {
            // SECURITY (S4-M2): Enforce password complexity for admin account
            validator: (_, value) => {
              if (!value) return Promise.resolve();
              if (!/[A-Z]/.test(value)) {
                return Promise.reject(new Error("Must contain an uppercase letter"));
              }
              if (!/[a-z]/.test(value)) {
                return Promise.reject(new Error("Must contain a lowercase letter"));
              }
              if (!/[0-9]/.test(value)) {
                return Promise.reject(new Error("Must contain a number"));
              }
              return Promise.resolve();
            },
          },
        ]}
        validateTrigger={["onChange", "onBlur"]}
      >
        <Input.Password
          prefix={<LockOutlined style={{ color: colors.textMuted }} />}
          placeholder="Password"
          size="large"
          autoComplete="new-password"
          maxLength={72}
          style={{ borderRadius: 8 }}
        />
      </Form.Item>

      <Form.Item
        name="confirmPassword"
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
          placeholder="Confirm Password"
          size="large"
          autoComplete="new-password"
          maxLength={72}
          style={{ borderRadius: 8 }}
        />
      </Form.Item>
    </Space>
  );

  // Render step 2: Deployment Scenario
  const renderDeploymentStep = () => (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Title level={4} style={{ color: colors.brownBramble, marginBottom: 8 }}>
          How will you access Hive Warden?
        </Title>
        <Paragraph style={{ color: colors.textMuted, margin: 0 }}>
          This helps us provide appropriate security guidance.
        </Paragraph>
      </div>

      <Form.Item
        name="deploymentScenario"
        rules={[{ required: true, message: "Please select a deployment scenario" }]}
      >
        <Select
          size="large"
          placeholder="Select deployment scenario"
          style={{ width: "100%" }}
          optionLabelProp="label"
          onChange={(value) => {
            // Reset acknowledgment if changing away from remote access
            if (value !== "remote_access") {
              setSecurityAcknowledged(false);
            }
          }}
        >
          {DEPLOYMENT_OPTIONS.map((option) => (
            <Select.Option
              key={option.value}
              value={option.value}
              label={option.label}
            >
              <Space>
                <GlobalOutlined
                  style={{
                    color:
                      option.value === "remote_access"
                        ? colors.warning
                        : colors.seaBuckthorn,
                  }}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>{option.label}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {option.description}
                  </Text>
                </div>
              </Space>
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      {form.getFieldValue("deploymentScenario") === "remote_access" &&
        securityAcknowledged && (
          <Alert
            type="success"
            showIcon
            icon={<CheckOutlined />}
            message="Security warning acknowledged"
            description="You've reviewed the security recommendations for remote access."
          />
        )}

      {form.getFieldValue("deploymentScenario") === "local_network" && (
        <Alert
          type="info"
          showIcon
          message="Local Network Access"
          description="Your Hive Warden dashboard will be accessible from devices on your local network. Make sure your network is secure."
        />
      )}
    </Space>
  );

  // Render step content based on current step
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderUserDetailsStep();
      case 1:
        return renderDeploymentStep();
      default:
        return null;
    }
  };

  return (
    <>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        style={{ width: "100%" }}
        initialValues={{
          deploymentScenario: "local_network",
        }}
      >
        {/* Steps indicator */}
        <Steps
          current={currentStep}
          size="small"
          style={{ marginBottom: 32 }}
          items={[
            {
              title: "Account",
              icon: <UserOutlined />,
            },
            {
              title: "Setup",
              icon: <RocketOutlined />,
            },
          ]}
        />

        {/* Error display */}
        {error && (
          <Alert
            type="error"
            message={error}
            showIcon
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 24, borderRadius: 8 }}
          />
        )}

        {/* Step content */}
        {renderStepContent()}

        {/* Navigation buttons */}
        <Space
          style={{
            width: "100%",
            justifyContent: "space-between",
            marginTop: 32,
          }}
        >
          <Button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            icon={<ArrowLeftOutlined />}
          >
            Back
          </Button>
          <Button
            type="primary"
            onClick={handleNext}
            loading={isSubmitting}
            icon={currentStep === 1 ? <CheckOutlined /> : <ArrowRightOutlined />}
            iconPosition="end"
            style={{
              background:
                currentStep === 1
                  ? `linear-gradient(135deg, ${colors.success} 0%, ${colors.success}dd 100%)`
                  : undefined,
              borderColor: currentStep === 1 ? colors.success : undefined,
            }}
          >
            {currentStep === 1 ? "Create Account" : "Next"}
          </Button>
        </Space>
      </Form>

      {/* Security Warning Modal */}
      <SecurityWarningModal
        open={showSecurityWarning}
        onAcknowledge={handleSecurityAcknowledge}
        onCancel={() => setShowSecurityWarning(false)}
      />
    </>
  );
}

export default SetupWizard;
