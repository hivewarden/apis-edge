/**
 * Users Settings Page
 *
 * Admin-only page for managing users in local authentication mode.
 * Hidden in SaaS (Keycloak) mode where users are managed externally.
 *
 * Part of Epic 13, Story 13-11 (User Management UI)
 * Design reference: /docs/hardware/stitch_apis_v2/DESIGN-KEY.md
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Typography,
  Space,
  Button,
  Card,
  Spin,
  Result,
  notification,
} from 'antd';
import {
  TeamOutlined,
  ArrowLeftOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { colors } from '../../theme/apisTheme';
import { getAuthConfigSync, fetchAuthConfig, DEV_MODE, API_URL } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import {
  useUsers,
  useUpdateUser,
  useDeleteUser,
  useInviteUser,
  useResetPassword,
} from '../../hooks/useUsers';
import { UserList } from '../../components/users';
import type { AuthConfig, MeResponse } from '../../types/auth';

const { Title, Text } = Typography;

// Card style per DESIGN-KEY: rounded-2xl, white bg, shadow-soft
const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: 'none',
  boxShadow: '0 4px 20px -2px rgba(102, 38, 4, 0.05)',
};

/**
 * Users management page.
 *
 * Access requirements:
 * - Must be in local auth mode (not Keycloak/SaaS)
 * - Must be an admin user
 */
export function Users() {
  const navigate = useNavigate();
  const { user: currentUser, isLoading: authLoading } = useAuth();

  // Auth config state
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(getAuthConfigSync());
  const [authConfigLoading, setAuthConfigLoading] = useState(!authConfig);

  // Current user's role (fetched from /api/auth/me)
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'member' | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  // User management hooks
  const { users, loading: usersLoading, refresh: refreshUsers, error: usersError } = useUsers();
  const { updateUser, updating } = useUpdateUser();
  const { deleteUser, deleting } = useDeleteUser();
  const { inviteUser, inviting } = useInviteUser();
  const { resetPassword, resetting } = useResetPassword();

  // Fetch current user's role from /api/auth/me
  const fetchCurrentUserRole = useCallback(async () => {
    if (DEV_MODE) {
      setCurrentUserRole('admin');
      setRoleLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data: MeResponse = await response.json();
        setCurrentUserRole(data.user.role);
      } else {
        setCurrentUserRole(null);
      }
    } catch (err) {
      console.error('Failed to fetch user role:', err);
      setCurrentUserRole(null);
    } finally {
      setRoleLoading(false);
    }
  }, []);

  // Fetch role on mount
  useEffect(() => {
    fetchCurrentUserRole();
  }, [fetchCurrentUserRole]);

  // Fetch auth config if not cached
  useEffect(() => {
    if (!authConfig && !DEV_MODE) {
      setAuthConfigLoading(true);
      fetchAuthConfig()
        .then(setAuthConfig)
        .catch((err) => {
          console.error('Failed to fetch auth config:', err);
        })
        .finally(() => setAuthConfigLoading(false));
    }
  }, [authConfig]);

  // Show error notification if users fail to load
  useEffect(() => {
    if (usersError) {
      notification.error({
        message: 'Failed to Load Users',
        description: usersError.message,
      });
    }
  }, [usersError]);

  // Loading state
  if (authLoading || authConfigLoading || roleLoading) {
    return (
      <div style={{ maxWidth: 1000, textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
        <Text style={{ display: 'block', marginTop: 16 }} type="secondary">
          Loading...
        </Text>
      </div>
    );
  }

  // Check if in local mode (or DEV_MODE)
  const isLocalMode = DEV_MODE || authConfig?.mode === 'local';

  // Check if user is admin (using the fetched role)
  const isAdmin = currentUserRole === 'admin';

  // Access denied - SaaS mode
  if (!isLocalMode) {
    return (
      <div style={{ maxWidth: 1000 }}>
        <Space style={{ marginBottom: 24 }}>
          <Link to="/settings">
            <Button type="text" icon={<ArrowLeftOutlined />} />
          </Link>
          <TeamOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />
          <Title level={2} style={{ margin: 0 }}>Users</Title>
        </Space>

        <Result
          status="info"
          icon={<LockOutlined style={{ color: colors.textMuted }} />}
          title="User Management Not Available"
          subTitle="User management is handled by your identity provider (Keycloak) in SaaS mode."
          extra={
            <Button type="primary" onClick={() => navigate('/settings')}>
              Back to Settings
            </Button>
          }
        />
      </div>
    );
  }

  // Access denied - not admin
  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 1000 }}>
        <Space style={{ marginBottom: 24 }}>
          <Link to="/settings">
            <Button type="text" icon={<ArrowLeftOutlined />} />
          </Link>
          <TeamOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />
          <Title level={2} style={{ margin: 0 }}>Users</Title>
        </Space>

        <Result
          status="403"
          title="Admin Access Required"
          subTitle="You need administrator privileges to manage users."
          extra={
            <Button type="primary" onClick={() => navigate('/settings')}>
              Back to Settings
            </Button>
          }
        />
      </div>
    );
  }

  // Main content - admin in local mode
  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <Link to="/settings">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            style={{ borderRadius: 9999 }}
          />
        </Link>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: `${colors.seaBuckthorn}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TeamOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />
        </div>
        <Title
          level={2}
          style={{
            margin: 0,
            color: colors.brownBramble,
            fontWeight: 900,
            letterSpacing: '-0.03em',
          }}
        >
          Users
        </Title>
      </div>

      {/* User List Card */}
      <Card style={cardStyle} styles={{ body: { padding: 24 } }}>
        <UserList
          users={users}
          loading={usersLoading}
          currentUserId={currentUser?.id || ''}
          onUpdateUser={updateUser}
          onDeleteUser={deleteUser}
          onInviteUser={inviteUser}
          onResetPassword={resetPassword}
          onRefresh={refreshUsers}
          updating={updating}
          deleting={deleting}
          inviting={inviting}
          resetting={resetting}
        />
      </Card>
    </div>
  );
}

export default Users;
