/**
 * EditUserModal Component
 *
 * Modal for editing user details (name, role, active status).
 * Includes protections against self-demotion and last admin removal.
 *
 * Part of Epic 13, Story 13-11 (User Management UI)
 * Design reference: /docs/hardware/stitch_apis_v2/apis_form_components/
 */
import { useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Space,
  Typography,
  Alert,
  Button,
} from 'antd';
import { EditOutlined, WarningOutlined } from '@ant-design/icons';
import { colors } from '../../theme/apisTheme';
import type { User, UpdateUserInput } from '../../hooks/useUsers';

const { Text } = Typography;

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

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
  currentUserId: string;
  activeAdminCount: number;
  onUpdate: (userId: string, input: UpdateUserInput) => Promise<User>;
  loading: boolean;
  onSuccess: () => void;
}

interface EditFormValues {
  display_name: string;
  role: 'admin' | 'member';
  is_active: boolean;
}

/**
 * Modal for editing user details.
 */
export function EditUserModal({
  open,
  onClose,
  user,
  currentUserId,
  activeAdminCount,
  onUpdate,
  loading,
  onSuccess,
}: EditUserModalProps) {
  const [form] = Form.useForm<EditFormValues>();

  // Check if this is the current user
  const isSelf = user?.id === currentUserId;

  // Check if this is the last active admin
  const isLastAdmin = user?.role === 'admin' && user?.is_active && activeAdminCount <= 1;

  // Determine what's disabled
  const roleDisabled = isSelf || isLastAdmin;
  const statusDisabled = isSelf || isLastAdmin;

  // Reset form when user changes
  useEffect(() => {
    if (user && open) {
      form.setFieldsValue({
        display_name: user.display_name,
        role: user.role,
        is_active: user.is_active,
      });
    }
  }, [user, open, form]);

  // Handle form submission
  const handleSubmit = async () => {
    if (!user) return;

    try {
      const values = await form.validateFields();

      // Build update input with only changed values
      const input: UpdateUserInput = {};

      if (values.display_name.trim() !== user.display_name) {
        input.display_name = values.display_name.trim();
      }

      if (values.role !== user.role && !roleDisabled) {
        input.role = values.role;
      }

      if (values.is_active !== user.is_active && !statusDisabled) {
        input.is_active = values.is_active;
      }

      // Only submit if there are changes
      if (Object.keys(input).length === 0) {
        onClose();
        return;
      }

      await onUpdate(user.id, input);
      onSuccess();
      onClose();
    } catch {
      // Form validation errors are handled by Ant Design
      // API errors are handled by the hook
    }
  };

  // Get warning message based on constraints
  const getWarningMessage = (): string | null => {
    if (isSelf && isLastAdmin) {
      return 'You are the last admin. Role and status cannot be changed.';
    }
    if (isSelf) {
      return 'You cannot change your own role or status.';
    }
    if (isLastAdmin) {
      return 'This is the last admin. Role and status cannot be changed until another admin exists.';
    }
    return null;
  };

  const warningMessage = getWarningMessage();

  return (
    <Modal
      title={
        <Space>
          <EditOutlined style={{ color: colors.seaBuckthorn, fontSize: 20 }} />
          <span style={{ fontWeight: 700, fontSize: 18, color: colors.brownBramble }}>Edit User</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
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
          Save Changes
        </Button>,
      ]}
      width={480}
      destroyOnClose
      styles={{
        content: { borderRadius: 16 },
        header: { paddingBottom: 16 },
      }}
    >
      {user && (
        <Form form={form} layout="vertical">
          {/* User Email (read-only) */}
          <Form.Item label={<span style={formLabelStyle}>Email</span>}>
            <Input value={user.email} disabled style={{ ...formInputStyle, backgroundColor: '#f5f5f5' }} />
          </Form.Item>

          {/* Display Name */}
          <Form.Item
            name="display_name"
            label={<span style={formLabelStyle}>Display Name</span>}
            rules={[
              { required: true, message: 'Please enter a display name' },
              { min: 2, message: 'Name must be at least 2 characters' },
              { max: 100, message: 'Name must be 100 characters or less' },
            ]}
          >
            <Input placeholder="Enter display name" style={formInputStyle} />
          </Form.Item>

          {/* Role */}
          <Form.Item
            name="role"
            label={
              <Space>
                <span style={formLabelStyle}>Role</span>
                {roleDisabled && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    (cannot be changed)
                  </Text>
                )}
              </Space>
            }
            rules={[{ required: true, message: 'Please select a role' }]}
          >
            <Select disabled={roleDisabled} style={formInputStyle}>
              <Select.Option value="member">Member</Select.Option>
              <Select.Option value="admin">Admin</Select.Option>
            </Select>
          </Form.Item>

          {/* Active Status */}
          <Form.Item
            name="is_active"
            label={
              <Space>
                <span style={formLabelStyle}>Active</span>
                {statusDisabled && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    (cannot be changed)
                  </Text>
                )}
              </Space>
            }
            valuePropName="checked"
          >
            <Switch disabled={statusDisabled} />
          </Form.Item>

          {/* Warning for self or last admin */}
          {warningMessage && (
            <Alert
              type="warning"
              message={warningMessage}
              icon={<WarningOutlined />}
              showIcon
              style={{ marginBottom: 0, borderRadius: 12 }}
            />
          )}

          {/* Info about must_change_password */}
          {user.must_change_password && (
            <Alert
              type="info"
              message="This user must change their password at next login."
              showIcon
              style={{ marginTop: 16, marginBottom: 0, borderRadius: 12 }}
            />
          )}
        </Form>
      )}
    </Modal>
  );
}

export default EditUserModal;
