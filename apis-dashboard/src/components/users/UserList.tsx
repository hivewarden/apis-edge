/**
 * UserList Component
 *
 * Table displaying all users in the tenant with actions for edit,
 * reset password, and delete. Includes the Invite User button.
 *
 * Part of Epic 13, Story 13-11 (User Management UI)
 * Design reference: /docs/hardware/stitch_apis_v2/DESIGN-KEY.md
 */
import { useState } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Dropdown,
  Modal,
  Form,
  Input,
  notification,
  Tooltip,
  Empty,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  UserAddOutlined,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CrownOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { colors } from '../../theme/apisTheme';
import type { User, UpdateUserInput, InviteUserInput, InviteResponse } from '../../hooks/useUsers';
import { useUserAdminChecks } from '../../hooks/useUsers';
import { InviteUserModal } from './InviteUserModal';
import { EditUserModal } from './EditUserModal';

const { Text } = Typography;

// Form input style per DESIGN-KEY
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

interface UserListProps {
  users: User[];
  loading: boolean;
  currentUserId: string;
  onUpdateUser: (userId: string, input: UpdateUserInput) => Promise<User>;
  onDeleteUser: (userId: string) => Promise<void>;
  onInviteUser: (input: InviteUserInput) => Promise<InviteResponse>;
  onResetPassword: (userId: string, password: string) => Promise<void>;
  onRefresh: () => void;
  updating: boolean;
  deleting: boolean;
  inviting: boolean;
  resetting: boolean;
}

/**
 * User list table with CRUD actions.
 */
export function UserList({
  users,
  loading,
  currentUserId,
  onUpdateUser,
  onDeleteUser,
  onInviteUser,
  onResetPassword,
  onRefresh,
  updating,
  deleting,
  inviting,
  resetting,
}: UserListProps) {
  // Modal states
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [resetForm] = Form.useForm();

  // Admin action checks
  const { activeAdminCount, canDeleteUser, getActionWarning } = useUserAdminChecks(
    currentUserId,
    users
  );

  // Handle edit click
  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setEditModalOpen(true);
  };

  // Handle reset password click
  const handleResetClick = (user: User) => {
    setSelectedUser(user);
    resetForm.resetFields();
    setResetModalOpen(true);
  };

  // Handle delete click
  const handleDeleteClick = (user: User) => {
    const warning = getActionWarning('delete', user.id, user.role, user.is_active);
    if (warning) {
      notification.warning({
        message: 'Cannot Delete User',
        description: warning,
      });
      return;
    }
    setSelectedUser(user);
    setDeleteModalOpen(true);
  };

  // Handle reset password submit
  const handleResetSubmit = async () => {
    if (!selectedUser) return;

    try {
      const values = await resetForm.validateFields();
      await onResetPassword(selectedUser.id, values.password);
      notification.success({
        message: 'Password Reset',
        description: `Password for ${selectedUser.email} has been reset.`,
      });
      setResetModalOpen(false);
      setSelectedUser(null);
      onRefresh();
    } catch (err) {
      // Form validation or API errors
      const error = err as Error & { response?: { data?: { error?: string } } };
      const message = error.response?.data?.error || error.message;
      if (message) {
        notification.error({
          message: 'Reset Failed',
          description: message,
        });
      }
    }
  };

  // Handle delete confirm
  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;

    try {
      await onDeleteUser(selectedUser.id);
      notification.success({
        message: 'User Deleted',
        description: `${selectedUser.email} has been deactivated.`,
      });
      setDeleteModalOpen(false);
      setSelectedUser(null);
      onRefresh();
    } catch (err) {
      const error = err as Error & { response?: { data?: { error?: string } } };
      const message = error.response?.data?.error || error.message;
      notification.error({
        message: 'Delete Failed',
        description: message || 'An error occurred',
      });
    }
  };

  // Format date for display
  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get action menu items for a user
  const getActionMenuItems = (user: User): MenuProps['items'] => {
    const canDelete = canDeleteUser(user.id, user.role, user.is_active);

    return [
      {
        key: 'edit',
        icon: <EditOutlined />,
        label: 'Edit',
        onClick: () => handleEditClick(user),
      },
      {
        key: 'reset',
        icon: <KeyOutlined />,
        label: 'Reset Password',
        onClick: () => handleResetClick(user),
      },
      {
        type: 'divider',
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: 'Delete',
        danger: true,
        disabled: !canDelete,
        onClick: () => handleDeleteClick(user),
      },
    ];
  };

  // Table columns
  const columns: ColumnsType<User> = [
    {
      title: 'Name',
      dataIndex: 'display_name',
      key: 'display_name',
      render: (name: string, record: User) => (
        <Space>
          <Text strong>{name}</Text>
          {record.id === currentUserId && (
            <Tag color="blue" style={{ fontSize: 10 }}>You</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => <Text copyable={{ text: email }}>{email}</Text>,
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 120,
      render: (role: string) => (
        <Tag
          icon={role === 'admin' ? <CrownOutlined /> : undefined}
          color={role === 'admin' ? 'gold' : 'default'}
        >
          {role === 'admin' ? 'Admin' : 'Member'}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean, record: User) => (
        <Space direction="vertical" size={0}>
          <Tag
            icon={isActive ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            color={isActive ? 'success' : 'error'}
          >
            {isActive ? 'Active' : 'Inactive'}
          </Tag>
          {record.must_change_password && (
            <Tooltip title="Must change password at next login">
              <Tag color="warning" style={{ fontSize: 10, marginTop: 4 }}>
                Password Reset Required
              </Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Last Login',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      width: 180,
      render: (lastLogin: string | undefined) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {formatDate(lastLogin)}
        </Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      align: 'center',
      render: (_, record: User) => (
        <Dropdown
          menu={{ items: getActionMenuItems(record) }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <>
      {/* Header with Invite button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Space>
          <Text strong style={{ fontSize: 18, color: colors.brownBramble }}>
            {users.length} {users.length === 1 ? 'User' : 'Users'}
          </Text>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            loading={loading}
            size="small"
          />
        </Space>
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          onClick={() => setInviteModalOpen(true)}
          style={{
            borderRadius: 9999,
            height: 48,
            paddingLeft: 24,
            paddingRight: 24,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          Invite User
        </Button>
      </div>

      {/* Users Table */}
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `${total} users`,
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No users found"
            >
              <Button
                type="primary"
                icon={<UserAddOutlined />}
                onClick={() => setInviteModalOpen(true)}
              >
                Invite First User
              </Button>
            </Empty>
          ),
        }}
      />

      {/* Invite User Modal */}
      <InviteUserModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onInvite={onInviteUser}
        loading={inviting}
        onSuccess={onRefresh}
      />

      {/* Edit User Modal */}
      <EditUserModal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        currentUserId={currentUserId}
        activeAdminCount={activeAdminCount}
        onUpdate={onUpdateUser}
        loading={updating}
        onSuccess={onRefresh}
      />

      {/* Reset Password Modal */}
      <Modal
        title={
          <Space>
            <KeyOutlined style={{ color: colors.seaBuckthorn, fontSize: 20 }} />
            <span style={{ fontWeight: 700, fontSize: 18, color: colors.brownBramble }}>Reset Password</span>
          </Space>
        }
        open={resetModalOpen}
        onCancel={() => {
          setResetModalOpen(false);
          setSelectedUser(null);
        }}
        onOk={handleResetSubmit}
        confirmLoading={resetting}
        okText="Reset Password"
        okButtonProps={{
          style: {
            borderRadius: 9999,
            height: 48,
            paddingLeft: 32,
            paddingRight: 32,
            fontWeight: 700,
          },
        }}
        cancelButtonProps={{
          style: {
            borderRadius: 12,
            height: 48,
            paddingLeft: 24,
            paddingRight: 24,
          },
        }}
        destroyOnClose
        styles={{
          content: { borderRadius: 16 },
          header: { paddingBottom: 16 },
        }}
      >
        {selectedUser && (
          <Form form={resetForm} layout="vertical">
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Set a new temporary password for <strong>{selectedUser.email}</strong>.
              They will be required to change it at their next login.
            </Text>

            <Form.Item
              name="password"
              label={<span style={formLabelStyle}>New Password</span>}
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
          </Form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: colors.error, fontSize: 20 }} />
            <span style={{ fontWeight: 700, fontSize: 18, color: colors.brownBramble }}>Delete User</span>
          </Space>
        }
        open={deleteModalOpen}
        onCancel={() => {
          setDeleteModalOpen(false);
          setSelectedUser(null);
        }}
        onOk={handleDeleteConfirm}
        confirmLoading={deleting}
        okText="Delete"
        okButtonProps={{
          danger: true,
          style: {
            borderRadius: 9999,
            height: 48,
            paddingLeft: 32,
            paddingRight: 32,
            fontWeight: 700,
          },
        }}
        cancelButtonProps={{
          style: {
            borderRadius: 12,
            height: 48,
            paddingLeft: 24,
            paddingRight: 24,
          },
        }}
        destroyOnClose
        styles={{
          content: { borderRadius: 16 },
          header: { paddingBottom: 16 },
        }}
      >
        {selectedUser && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>
              Are you sure you want to delete <strong>{selectedUser.display_name}</strong> (
              {selectedUser.email})?
            </Text>
            <Text type="secondary">
              This will deactivate their account. They will no longer be able to log in.
            </Text>
          </Space>
        )}
      </Modal>
    </>
  );
}

export default UserList;
