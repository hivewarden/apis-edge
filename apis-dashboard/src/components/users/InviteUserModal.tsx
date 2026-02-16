/**
 * InviteUserModal Component
 *
 * Modal for inviting users to the tenant. Supports three methods:
 * - temp_password: Create user immediately with a temporary password
 * - email: Send email invitation (token-based, single-use)
 * - link: Generate shareable invite link (reusable)
 *
 * Part of Epic 13, Story 13-11 (User Management UI)
 * Design reference: /docs/hardware/stitch_apis_v2/apis_form_components/
 */
import { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Radio,
  Space,
  Typography,
  Alert,
  Button,
  InputNumber,
  message,
} from 'antd';
import {
  UserAddOutlined,
  MailOutlined,
  LinkOutlined,
  CopyOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { colors } from '../../theme/apisTheme';
import type { InviteMethod, InviteUserInput, InviteResponse } from '../../hooks/useUsers';

const { Text, Paragraph } = Typography;

// Shared input style per DESIGN-KEY: rounded-xl (12px), h-14 (56px)
const formInputStyle: React.CSSProperties = {
  borderRadius: 12,
  height: 56,
  border: '1px solid #e9dece',
  backgroundColor: '#ffffff',
  fontSize: 16,
};

// Label style per mockup
const formLabelStyle: React.CSSProperties = {
  color: colors.brownBramble,
  fontWeight: 700,
  fontSize: 16,
};

interface InviteUserModalProps {
  open: boolean;
  onClose: () => void;
  onInvite: (input: InviteUserInput) => Promise<InviteResponse>;
  loading: boolean;
  onSuccess: () => void;
}

interface InviteFormValues {
  method: InviteMethod;
  email: string;
  display_name: string;
  password: string;
  confirm_password: string;
  role: 'admin' | 'member';
  expiry_days: number;
}

/**
 * Modal for inviting users to the tenant.
 */
export function InviteUserModal({
  open,
  onClose,
  onInvite,
  loading,
  onSuccess,
}: InviteUserModalProps) {
  const [form] = Form.useForm<InviteFormValues>();
  const [method, setMethod] = useState<InviteMethod>('temp_password');
  const [inviteResult, setInviteResult] = useState<InviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      form.resetFields();
      setMethod('temp_password');
      setInviteResult(null);
      setCopied(false);
    }
  }, [open, form]);

  // Handle method change
  const handleMethodChange = (newMethod: InviteMethod) => {
    setMethod(newMethod);
    setInviteResult(null);
    // Clear fields that don't apply to the new method
    if (newMethod === 'link') {
      form.setFieldsValue({ email: '', display_name: '', password: '', confirm_password: '' });
    } else if (newMethod === 'email') {
      form.setFieldsValue({ display_name: '', password: '', confirm_password: '' });
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const input: InviteUserInput = {
        method: values.method,
        role: values.role,
      };

      // Add method-specific fields
      if (values.method === 'temp_password') {
        input.email = values.email.trim().toLowerCase();
        input.display_name = values.display_name.trim();
        input.password = values.password;
      } else if (values.method === 'email') {
        input.email = values.email.trim().toLowerCase();
        input.expiry_days = values.expiry_days || 7;
      } else if (values.method === 'link') {
        input.expiry_days = values.expiry_days || 7;
      }

      const result = await onInvite(input);
      setInviteResult(result);

      // For temp_password, we're done - show success and close
      if (values.method === 'temp_password') {
        message.success(`User ${values.email} created successfully`);
        onSuccess();
        onClose();
      }
      // For email/link methods, show the result (token/URL)
    } catch (error) {
      // Form validation errors are handled by Ant Design
      // API errors are handled by the hook
    }
  };

  // Handle copy to clipboard
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      message.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('Failed to copy');
    }
  };

  // Handle close after showing invite result
  const handleDone = () => {
    onSuccess();
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          <UserAddOutlined style={{ color: colors.seaBuckthorn, fontSize: 20 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: colors.brownBramble }}>Invite User</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={
        inviteResult && (method === 'email' || method === 'link') ? (
          <Button
            type="primary"
            onClick={handleDone}
            style={{
              borderRadius: 9999,
              height: 48,
              paddingLeft: 32,
              paddingRight: 32,
              fontWeight: 700,
            }}
          >
            Done
          </Button>
        ) : (
          [
            <Button
              key="cancel"
              onClick={onClose}
              style={{
                borderRadius: 12,
                height: 48,
                paddingLeft: 24,
                paddingRight: 24,
              }}
            >
              Cancel
            </Button>,
            <Button
              key="submit"
              type="primary"
              loading={loading}
              onClick={handleSubmit}
              style={{
                borderRadius: 9999,
                height: 48,
                paddingLeft: 32,
                paddingRight: 32,
                fontWeight: 700,
              }}
            >
              {method === 'temp_password' ? 'Create User' : 'Generate Invite'}
            </Button>,
          ]
        )
      }
      width={520}
      destroyOnClose
      styles={{
        content: { borderRadius: 16 },
        header: { paddingBottom: 16 },
      }}
    >
      {/* Show invite result for email/link methods */}
      {inviteResult && (method === 'email' || method === 'link') ? (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            type="success"
            message={method === 'email' ? 'Email Invite Created' : 'Invite Link Generated'}
            description={
              method === 'email'
                ? 'Share this token or link with the user. The invite will expire after use.'
                : 'Share this link with anyone you want to invite. They can use it until it expires.'
            }
            showIcon
          />

          {inviteResult.invite_url && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                Invite URL
              </Text>
              <Input.Group compact>
                <Input
                  value={inviteResult.invite_url}
                  readOnly
                  style={{ width: 'calc(100% - 48px)' }}
                />
                <Button
                  icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                  onClick={() => handleCopy(inviteResult.invite_url!)}
                  type={copied ? 'primary' : 'default'}
                />
              </Input.Group>
            </div>
          )}

          {inviteResult.token && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                Token
              </Text>
              <Input.Group compact>
                <Input
                  value={inviteResult.token}
                  readOnly
                  style={{ width: 'calc(100% - 48px)', fontFamily: 'monospace' }}
                />
                <Button
                  icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                  onClick={() => handleCopy(inviteResult.token!)}
                  type={copied ? 'primary' : 'default'}
                />
              </Input.Group>
            </div>
          )}

          {inviteResult.expires_at && (
            <Text type="secondary">
              Expires: {new Date(inviteResult.expires_at).toLocaleString()}
            </Text>
          )}
        </Space>
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            method: 'temp_password',
            role: 'member',
            expiry_days: 7,
          }}
        >
          {/* Invitation Method */}
          <Form.Item
            name="method"
            label="Invitation Method"
            rules={[{ required: true }]}
          >
            <Radio.Group onChange={(e) => handleMethodChange(e.target.value)}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio value="temp_password">
                  <Space direction="vertical" size={0}>
                    <Text strong>Create with Password</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Create user now with a temporary password they must change at first login
                    </Text>
                  </Space>
                </Radio>
                <Radio value="email">
                  <Space direction="vertical" size={0}>
                    <Space>
                      <MailOutlined />
                      <Text strong>Email Invite</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Generate a single-use invite token for a specific email
                    </Text>
                  </Space>
                </Radio>
                <Radio value="link">
                  <Space direction="vertical" size={0}>
                    <Space>
                      <LinkOutlined />
                      <Text strong>Shareable Link</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Generate a reusable link anyone can use to join
                    </Text>
                  </Space>
                </Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          {/* Role */}
          <Form.Item
            name="role"
            label={<span style={formLabelStyle}>Role</span>}
            rules={[{ required: true, message: 'Please select a role' }]}
          >
            <Select style={formInputStyle}>
              <Select.Option value="member">Member</Select.Option>
              <Select.Option value="admin">Admin</Select.Option>
            </Select>
          </Form.Item>

          {/* Email - required for temp_password and email methods */}
          {(method === 'temp_password' || method === 'email') && (
            <Form.Item
              name="email"
              label={<span style={formLabelStyle}>Email Address</span>}
              rules={[
                { required: true, message: 'Please enter an email address' },
                { type: 'email', message: 'Please enter a valid email address' },
              ]}
            >
              <Input placeholder="user@example.com" style={formInputStyle} />
            </Form.Item>
          )}

          {/* Display Name - required for temp_password method */}
          {method === 'temp_password' && (
            <Form.Item
              name="display_name"
              label={<span style={formLabelStyle}>Display Name</span>}
              rules={[
                { required: true, message: 'Please enter a display name' },
                { min: 2, message: 'Name must be at least 2 characters' },
                { max: 100, message: 'Name must be 100 characters or less' },
              ]}
            >
              <Input placeholder="John Doe" style={formInputStyle} />
            </Form.Item>
          )}

          {/* Password - required for temp_password method */}
          {method === 'temp_password' && (
            <>
              <Form.Item
                name="password"
                label={<span style={formLabelStyle}>Temporary Password</span>}
                rules={[
                  { required: true, message: 'Please enter a password' },
                  { min: 8, message: 'Password must be at least 8 characters' },
                  { max: 72, message: 'Password must not exceed 72 characters' },
                ]}
              >
                <Input.Password placeholder="Minimum 8 characters" maxLength={72} style={formInputStyle} />
              </Form.Item>

              <Form.Item
                name="confirm_password"
                label={<span style={formLabelStyle}>Confirm Password</span>}
                dependencies={['password']}
                rules={[
                  { required: true, message: 'Please confirm the password' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('Passwords do not match'));
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="Confirm password" style={formInputStyle} />
              </Form.Item>

              <Alert
                type="info"
                message="The user will be required to change this password at their first login."
                style={{ marginBottom: 16, borderRadius: 12 }}
                showIcon
              />
            </>
          )}

          {/* Expiry Days - for email and link methods */}
          {(method === 'email' || method === 'link') && (
            <Form.Item
              name="expiry_days"
              label={<span style={formLabelStyle}>Invite Expires In</span>}
              rules={[{ required: true, message: 'Please select expiry' }]}
            >
              <InputNumber
                min={1}
                max={30}
                addonAfter="days"
                style={{ ...formInputStyle, width: '100%' }}
              />
            </Form.Item>
          )}

          {/* Note for email method */}
          {method === 'email' && (
            <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
              Note: Email sending is not implemented. You will need to manually share the
              invite link or token with the user.
            </Paragraph>
          )}
        </Form>
      )}
    </Modal>
  );
}

export default InviteUserModal;
