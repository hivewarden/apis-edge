/**
 * Settings Profile Tab
 *
 * Displays user profile information with optional password change form.
 * Password change is only available in local authentication mode.
 *
 * Part of Epic 13, Story 13-19 (Tenant Settings UI)
 */
import { useState, useEffect } from 'react';
import {
  Card,
  Space,
  Typography,
  Form,
  Input,
  Button,
  Alert,
  notification,
  Descriptions,
  Spin,
} from 'antd';
import {
  UserOutlined,
  MailOutlined,
  LockOutlined,
  SaveOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';
import { useUpdateProfile } from '../../hooks/useTenantSettings';
import { apiClient } from '../../providers/apiClient';
import { colors } from '../../theme/apisTheme';

const { Text, Paragraph } = Typography;

interface ProfileTabProps {
  isLocalMode: boolean;
}

/**
 * Profile tab component with user info and password change.
 */
export function Profile({ isLocalMode }: ProfileTabProps) {
  const { user, isLoading: authLoading } = useAuth();
  const { updateProfile, updating } = useUpdateProfile();

  // Form instances
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  // State
  const [isEditingName, setIsEditingName] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        name: user.name,
      });
    }
  }, [user, profileForm]);

  // Handle profile update
  const handleProfileUpdate = async (values: { name: string }) => {
    try {
      await updateProfile({ name: values.name });
      notification.success({
        message: 'Profile Updated',
        description: 'Your display name has been updated.',
      });
      setIsEditingName(false);
    } catch (err) {
      notification.error({
        message: 'Update Failed',
        description: err instanceof Error ? err.message : 'Failed to update profile.',
      });
    }
  };

  // Handle password change
  const handlePasswordChange = async (values: {
    currentPassword: string;
    newPassword: string;
  }) => {
    setChangingPassword(true);
    try {
      await apiClient.put('/auth/change-password', {
        current_password: values.currentPassword,
        new_password: values.newPassword,
      });

      notification.success({
        message: 'Password Changed',
        description: 'Your password has been updated successfully.',
      });
      passwordForm.resetFields();
    } catch (err) {
      // apiClient interceptor handles error notification, but we need to handle specific message
      const errorMessage = err instanceof Error ? err.message : 'Failed to change password.';
      notification.error({
        message: 'Password Change Failed',
        description: errorMessage,
      });
    } finally {
      setChangingPassword(false);
    }
  };

  // Loading state
  if (authLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
        <Text style={{ display: 'block', marginTop: 16 }} type="secondary">
          Loading profile...
        </Text>
      </div>
    );
  }

  // No user state
  if (!user) {
    return (
      <Alert
        type="info"
        message="Not Signed In"
        description="Please sign in to view your profile."
        showIcon
      />
    );
  }

  return (
    <div>
      {/* Profile Info Card */}
      <Card
        title={
          <Space>
            <UserOutlined style={{ color: colors.seaBuckthorn }} />
            <span>Profile Information</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        {!isEditingName ? (
          <>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Display Name">
                <Space>
                  <Text strong>{user.name}</Text>
                  {isLocalMode && (
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      size="small"
                      onClick={() => setIsEditingName(true)}
                    >
                      Edit
                    </Button>
                  )}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                <Space>
                  <MailOutlined />
                  <Text>{user.email}</Text>
                </Space>
              </Descriptions.Item>
            </Descriptions>

            {!isLocalMode && (
              <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0, fontSize: 12 }}>
                Profile information is managed by your identity provider.
              </Paragraph>
            )}
          </>
        ) : (
          <Form
            form={profileForm}
            layout="vertical"
            onFinish={handleProfileUpdate}
          >
            <Form.Item
              name="name"
              label="Display Name"
              rules={[
                { required: true, message: 'Display name is required' },
                { min: 2, message: 'Name must be at least 2 characters' },
                { max: 100, message: 'Name must be less than 100 characters' },
              ]}
            >
              <Input placeholder="Enter your display name" />
            </Form.Item>

            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={updating}
                icon={<SaveOutlined />}
              >
                Save
              </Button>
              <Button onClick={() => setIsEditingName(false)}>
                Cancel
              </Button>
            </Space>
          </Form>
        )}
      </Card>

      {/* Password Change Card - Local Mode Only */}
      {isLocalMode && (
        <Card
          title={
            <Space>
              <LockOutlined style={{ color: colors.seaBuckthorn }} />
              <span>Change Password</span>
            </Space>
          }
        >
          <Paragraph type="secondary" style={{ marginBottom: 16 }}>
            Use a strong password with at least 8 characters, including uppercase,
            lowercase, numbers, and special characters.
          </Paragraph>

          <Form
            form={passwordForm}
            layout="vertical"
            onFinish={handlePasswordChange}
            style={{ maxWidth: 400 }}
          >
            <Form.Item
              name="currentPassword"
              label="Current Password"
              rules={[{ required: true, message: 'Current password is required' }]}
            >
              <Input.Password placeholder="Enter current password" />
            </Form.Item>

            <Form.Item
              name="newPassword"
              label="New Password"
              rules={[
                { required: true, message: 'New password is required' },
                { min: 8, message: 'Password must be at least 8 characters' },
                { max: 72, message: 'Password must not exceed 72 characters' },
              ]}
            >
              <Input.Password placeholder="Enter new password" maxLength={72} />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label="Confirm New Password"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: 'Please confirm your new password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Passwords do not match'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="Confirm new password" />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={changingPassword}
                icon={<LockOutlined />}
              >
                Change Password
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      {/* SaaS Mode Notice */}
      {!isLocalMode && (
        <Card>
          <Alert
            type="info"
            message="Password Management"
            description="Password changes and account security are managed by your identity provider. Please visit your identity provider's settings to change your password."
            showIcon
          />
        </Card>
      )}
    </div>
  );
}

export default Profile;
