/**
 * SecurityWarningModal Component
 *
 * Modal displayed when user selects "Remote access" deployment scenario
 * during the setup wizard. Warns about security considerations for
 * internet-exposed deployments.
 *
 * The user must acknowledge the warning before proceeding.
 */
import { Modal, Typography, Space, Alert, Button } from "antd";
import {
  WarningOutlined,
  LockOutlined,
  GlobalOutlined,
  SafetyOutlined,
} from "@ant-design/icons";
import { colors } from "../../theme/apisTheme";

const { Title, Paragraph, Text } = Typography;

interface SecurityWarningModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Callback when user acknowledges the warning */
  onAcknowledge: () => void;
  /** Callback when user cancels (goes back to change selection) */
  onCancel: () => void;
}

/**
 * Security warning modal for remote access deployment scenario.
 *
 * Displays important security considerations when deploying APIS
 * with remote/internet access. User must acknowledge to proceed.
 *
 * @example
 * ```tsx
 * <SecurityWarningModal
 *   open={showWarning}
 *   onAcknowledge={() => {
 *     setAcknowledged(true);
 *     setShowWarning(false);
 *   }}
 *   onCancel={() => setShowWarning(false)}
 * />
 * ```
 */
export function SecurityWarningModal({
  open,
  onAcknowledge,
  onCancel,
}: SecurityWarningModalProps) {
  return (
    <Modal
      open={open}
      title={
        <Space>
          <WarningOutlined style={{ color: colors.warning, fontSize: 20 }} />
          <span>Security Considerations</span>
        </Space>
      }
      onCancel={onCancel}
      footer={[
        <Button key="back" onClick={onCancel}>
          Go Back
        </Button>,
        <Button key="acknowledge" type="primary" onClick={onAcknowledge}>
          I Understand
        </Button>,
      ]}
      width={520}
      centered
    >
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Alert
          type="warning"
          showIcon
          icon={<GlobalOutlined />}
          message="Remote Access Enabled"
          description="You've selected to allow remote access to your Hive Warden deployment. This means your system will be accessible over the internet."
        />

        <div>
          <Title level={5} style={{ color: colors.brownBramble, marginBottom: 16 }}>
            Important Security Recommendations
          </Title>

          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <LockOutlined
                style={{ color: colors.seaBuckthorn, fontSize: 18, marginTop: 2 }}
              />
              <div>
                <Text strong>Use HTTPS</Text>
                <Paragraph
                  style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}
                >
                  Always use HTTPS with a valid SSL certificate. Let's Encrypt
                  provides free certificates that are easy to set up.
                </Paragraph>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <SafetyOutlined
                style={{ color: colors.seaBuckthorn, fontSize: 18, marginTop: 2 }}
              />
              <div>
                <Text strong>Strong Password</Text>
                <Paragraph
                  style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}
                >
                  Use a unique, strong password that you don't use elsewhere.
                  Consider using a password manager.
                </Paragraph>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <GlobalOutlined
                style={{ color: colors.seaBuckthorn, fontSize: 18, marginTop: 2 }}
              />
              <div>
                <Text strong>Firewall & VPN</Text>
                <Paragraph
                  style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}
                >
                  Consider using a VPN or restricting access to specific IP
                  addresses. Only expose ports that are necessary.
                </Paragraph>
              </div>
            </div>
          </Space>
        </div>

        <Paragraph
          style={{
            margin: 0,
            padding: 12,
            background: `${colors.salomie}40`,
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          By clicking "I Understand", you acknowledge that you are responsible
          for securing your deployment and have reviewed these recommendations.
        </Paragraph>
      </Space>
    </Modal>
  );
}

export default SecurityWarningModal;
