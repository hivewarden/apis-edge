/**
 * Admin Tenants Page
 *
 * Super-admin page for managing all tenants in SaaS mode.
 * Allows viewing, creating, editing, and soft-deleting tenants.
 *
 * Part of Epic 13, Story 13-12 (Super-Admin Tenant List & Management)
 *
 * TODO (S5-M8): This file is 997 lines. Extract CreateTenantModal, EditTenantModal,
 * TenantAvatar, PlanBadge, StatusIndicator, ActionButton into separate files.
 * Replace inline <style> tags with CSS modules for scoped styles.
 */
import React, { useState, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Typography,
  Tooltip,
  message,
  Popconfirm,
  Spin,
  Alert,
  Card,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  FilterOutlined,
  EyeOutlined,
  SwapOutlined,
  StopOutlined,
  DownOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import {
  useAdminTenants,
  useCreateTenant,
  useUpdateTenant,
  useDeleteTenant,
  type Tenant,
  type CreateTenantInput,
  type UpdateTenantInput,
} from '../../hooks/useAdminTenants';
import { getAuthConfigSync } from '../../config';
import apiClient from '../../providers/apiClient';
import { colors, spacing } from '../../theme/apisTheme';

const { Title, Text } = Typography;

// ============================================================================
// Styles
// ============================================================================

const pageStyles: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: colors.coconutCream,
};

const headerStyles: CSSProperties = {
  padding: `${spacing.xl}px ${spacing.xl}px ${spacing.lg}px`,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing.md,
};

const searchBarContainerStyles: CSSProperties = {
  padding: `0 ${spacing.xl}px ${spacing.lg}px`,
};

const searchBarStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: spacing.md,
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: '#ffffff',
  padding: spacing.sm + 4,
  borderRadius: 16,
  boxShadow: '0 4px 20px -2px rgba(102, 38, 4, 0.05)',
};

const searchInputWrapperStyles: CSSProperties = {
  position: 'relative',
  flex: 1,
  maxWidth: 400,
};

const searchIconStyles: CSSProperties = {
  position: 'absolute',
  left: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'rgba(102, 38, 4, 0.4)',
  fontSize: 18,
};

const searchInputStyles: CSSProperties = {
  width: '100%',
  paddingLeft: 40,
  paddingRight: 16,
  paddingTop: 10,
  paddingBottom: 10,
  backgroundColor: 'rgba(251, 249, 231, 0.5)',
  border: 'none',
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 500,
  color: colors.brownBramble,
  outline: 'none',
};

const tableContainerStyles: CSSProperties = {
  flex: 1,
  padding: `0 ${spacing.xl}px ${spacing.xl}px`,
};

const tableWrapperStyles: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 16,
  boxShadow: '0 4px 20px -2px rgba(102, 38, 4, 0.05)',
  overflow: 'hidden',
};

// ============================================================================
// Helper Components
// ============================================================================

/** Tenant initials avatar */
function TenantAvatar({ name, color }: { name: string; color: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const bgColors: Record<string, { bg: string; text: string }> = {
    indigo: { bg: '#eef2ff', text: '#4338ca' },
    emerald: { bg: '#ecfdf5', text: '#059669' },
    sky: { bg: '#f0f9ff', text: '#0284c7' },
    orange: { bg: '#fff7ed', text: '#c2410c' },
    teal: { bg: '#f0fdfa', text: '#0d9488' },
  };

  const colorSet = bgColors[color] || bgColors.indigo;

  return (
    <div
      style={{
        height: 40,
        width: 40,
        borderRadius: 12,
        backgroundColor: colorSet.bg,
        color: colorSet.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 12,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
      }}
    >
      {initials}
    </div>
  );
}

/** Plan badge component */
function PlanBadge({ plan }: { plan: string }) {
  const planConfig: Record<string, { bg: string; text: string; border: string; icon?: boolean }> = {
    pro: {
      bg: 'rgba(252, 212, 131, 0.2)',
      text: '#854d0e',
      border: '#fcd483',
      icon: true,
    },
    basic: {
      bg: '#f3f4f6',
      text: '#4b5563',
      border: '#e5e7eb',
    },
    free: {
      bg: '#f3f4f6',
      text: '#4b5563',
      border: '#e5e7eb',
    },
    hobby: {
      bg: '#f3f4f6',
      text: '#4b5563',
      border: '#e5e7eb',
    },
    enterprise: {
      bg: '#faf5ff',
      text: '#6b21a8',
      border: '#e9d5ff',
    },
  };

  const config = planConfig[plan.toLowerCase()] || planConfig.basic;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 700,
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
      }}
    >
      {config.icon && (
        <span style={{ fontSize: 12, color: '#b45309' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
          </svg>
        </span>
      )}
      {plan.charAt(0).toUpperCase() + plan.slice(1)}
    </span>
  );
}

/** Status indicator */
function StatusIndicator({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    active: { color: '#7c9082', label: 'Active' },
    suspended: { color: '#ef4444', label: 'Suspended' },
    pending: { color: '#eab308', label: 'Pending' },
    deleted: { color: '#9ca3af', label: 'Deleted' },
  };

  const config = statusConfig[status] || statusConfig.active;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          height: 10,
          width: 10,
          borderRadius: '50%',
          backgroundColor: config.color,
          boxShadow: `0 0 0 2px rgba(${
            config.color === '#7c9082'
              ? '124, 144, 130'
              : config.color === '#ef4444'
                ? '239, 68, 68'
                : config.color === '#eab308'
                  ? '234, 179, 8'
                  : '156, 163, 175'
          }, 0.2)`,
        }}
      />
      <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(102, 38, 4, 0.8)' }}>
        {config.label}
      </span>
    </div>
  );
}

/** Action button */
function ActionButton({
  icon,
  tooltip,
  onClick,
  color = 'rgba(102, 38, 4, 0.4)',
  hoverColor,
  hoverBg,
  disabled,
}: {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
  color?: string;
  hoverColor?: string;
  hoverBg?: string;
  disabled?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Tooltip title={tooltip}>
      <button
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          padding: 8,
          borderRadius: '50%',
          border: 'none',
          backgroundColor: isHovered ? (hoverBg || colors.coconutCream) : 'transparent',
          color: isHovered ? (hoverColor || colors.brownBramble) : color,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

// ============================================================================
// Modals
// ============================================================================

interface CreateTenantModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateTenantModal({ open, onClose, onSuccess }: CreateTenantModalProps) {
  const [form] = Form.useForm();
  const { createTenant, creating } = useCreateTenant();

  const handleSubmit = async (values: CreateTenantInput) => {
    try {
      await createTenant(values);
      message.success('Tenant created successfully');
      form.resetFields();
      onSuccess();
      onClose();
    } catch (error) {
      // Error already shown by apiClient interceptor
    }
  };

  return (
    <Modal
      title="Create Tenant"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      styles={{
        content: { borderRadius: 16 },
      }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ plan: 'free' }}
      >
        <Form.Item
          name="name"
          label="Tenant Name"
          rules={[
            { required: true, message: 'Please enter a tenant name' },
            { max: 100, message: 'Name must be 100 characters or less' },
          ]}
        >
          <Input placeholder="e.g., Acme Beekeeping" />
        </Form.Item>

        <Form.Item
          name="plan"
          label="Plan"
          rules={[{ required: true, message: 'Please select a plan' }]}
        >
          <Select>
            <Select.Option value="free">Free</Select.Option>
            <Select.Option value="hobby">Hobby</Select.Option>
            <Select.Option value="pro">Pro</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={creating}>
              Create Tenant
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

interface EditTenantModalProps {
  tenant: Tenant | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function EditTenantModal({ tenant, open, onClose, onSuccess }: EditTenantModalProps) {
  const [form] = Form.useForm();
  const { updateTenant, updating } = useUpdateTenant();

  React.useEffect(() => {
    if (tenant && open) {
      form.setFieldsValue({
        name: tenant.name,
        plan: tenant.plan,
        status: tenant.status,
      });
    }
  }, [tenant, open, form]);

  const handleSubmit = async (values: UpdateTenantInput) => {
    if (!tenant) return;

    try {
      await updateTenant(tenant.id, values);
      message.success('Tenant updated successfully');
      onSuccess();
      onClose();
    } catch (error) {
      // Error already shown by apiClient interceptor
    }
  };

  return (
    <Modal
      title="Edit Tenant"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      styles={{
        content: { borderRadius: 16 },
      }}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="name"
          label="Tenant Name"
          rules={[
            { required: true, message: 'Please enter a tenant name' },
            { max: 100, message: 'Name must be 100 characters or less' },
          ]}
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="plan"
          label="Plan"
          rules={[{ required: true, message: 'Please select a plan' }]}
        >
          <Select>
            <Select.Option value="free">Free</Select.Option>
            <Select.Option value="hobby">Hobby</Select.Option>
            <Select.Option value="pro">Pro</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="status"
          label="Status"
          rules={[{ required: true, message: 'Please select a status' }]}
        >
          <Select>
            <Select.Option value="active">Active</Select.Option>
            <Select.Option value="suspended">Suspended</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={updating}>
              Save Changes
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AdminTenantsPage() {
  const navigate = useNavigate();
  const { tenants, loading, error, refresh } = useAdminTenants();
  const { deleteTenant, deleting } = useDeleteTenant();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [planFilter, setPlanFilter] = useState<string | null>(null);

  // Check if in SaaS mode
  const authConfig = getAuthConfigSync();
  const isSaaSMode = authConfig?.mode === 'keycloak';

  const handleView = (tenant: Tenant) => {
    navigate(`/admin/tenants/${tenant.id}`);
  };

  const handleImpersonate = async (tenant: Tenant) => {
    try {
      await apiClient.post('/admin/impersonate', { tenant_id: tenant.id });

      message.success(`Now impersonating ${tenant.name}`);
      window.location.href = '/';
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to impersonate tenant');
    }
  };

  const handleSuspend = async (tenant: Tenant) => {
    try {
      await deleteTenant(tenant.id);
      message.success(`Tenant "${tenant.name}" has been suspended`);
      refresh();
    } catch (error) {
      // Error already shown by apiClient interceptor
    }
  };

  // Filter tenants
  const filteredTenants = tenants.filter((tenant) => {
    const matchesSearch =
      !searchText ||
      tenant.name.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = !statusFilter || tenant.status === statusFilter;
    const matchesPlan = !planFilter || tenant.plan === planFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  // Avatar colors by index
  const avatarColors = ['indigo', 'emerald', 'sky', 'orange', 'teal'];

  const columns: ColumnsType<Tenant> = [
    {
      title: (
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(102, 38, 4, 0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Tenant Name
        </span>
      ),
      dataIndex: 'name',
      key: 'name',
      width: '25%',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, _record, index) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TenantAvatar name={name} color={avatarColors[index % avatarColors.length]} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: colors.brownBramble, margin: 0 }}>
              {name}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(102, 38, 4, 0.5)', margin: 0, fontWeight: 400 }}>
              {name.toLowerCase().replace(/\s+/g, '-')}
            </p>
          </div>
        </div>
      ),
    },
    {
      title: (
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(102, 38, 4, 0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Plan
        </span>
      ),
      dataIndex: 'plan',
      key: 'plan',
      width: '12%',
      render: (plan: string) => <PlanBadge plan={plan} />,
    },
    {
      title: (
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(102, 38, 4, 0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Status
        </span>
      ),
      dataIndex: 'status',
      key: 'status',
      width: '12%',
      render: (status: string) => <StatusIndicator status={status} />,
    },
    {
      title: (
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(102, 38, 4, 0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', textAlign: 'right' }}>
          Hives
        </span>
      ),
      dataIndex: 'hive_count',
      key: 'hive_count',
      width: '10%',
      align: 'right',
      sorter: (a, b) => a.hive_count - b.hive_count,
      render: (count: number) => (
        <span style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'rgba(102, 38, 4, 0.8)' }}>
          {count.toLocaleString()}
        </span>
      ),
    },
    {
      title: (
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(102, 38, 4, 0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', textAlign: 'right' }}>
          Users
        </span>
      ),
      dataIndex: 'user_count',
      key: 'user_count',
      width: '10%',
      align: 'right',
      sorter: (a, b) => a.user_count - b.user_count,
      render: (count: number) => (
        <span style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'rgba(102, 38, 4, 0.8)' }}>
          {count}
        </span>
      ),
    },
    {
      title: (
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(102, 38, 4, 0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Created Date
        </span>
      ),
      dataIndex: 'created_at',
      key: 'created_at',
      width: '15%',
      render: (date: string) => (
        <span style={{ fontSize: 14, color: 'rgba(102, 38, 4, 0.6)' }}>
          {new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: (
        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(102, 38, 4, 0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', textAlign: 'right' }}>
          Actions
        </span>
      ),
      key: 'actions',
      width: '16%',
      align: 'right',
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
          <ActionButton
            icon={<EyeOutlined style={{ fontSize: 20 }} />}
            tooltip="View Details"
            onClick={() => handleView(record)}
          />
          <ActionButton
            icon={<SwapOutlined style={{ fontSize: 20 }} />}
            tooltip="Impersonate"
            onClick={() => handleImpersonate(record)}
            color={colors.seaBuckthorn}
            hoverColor={colors.brownBramble}
            hoverBg="rgba(247, 164, 45, 0.1)"
            disabled={record.status === 'deleted'}
          />
          <Popconfirm
            title="Suspend Tenant"
            description={
              <>
                Are you sure you want to suspend <strong>{record.name}</strong>?
                <br />
                <Text type="secondary">This will prevent users from accessing the platform.</Text>
              </>
            }
            onConfirm={() => handleSuspend(record)}
            okText="Suspend"
            okButtonProps={{ danger: true, loading: deleting }}
            cancelText="Cancel"
          >
            <ActionButton
              icon={<StopOutlined style={{ fontSize: 20 }} />}
              tooltip="Suspend"
              onClick={() => {}}
              color="#f87171"
              hoverColor="#dc2626"
              hoverBg="#fef2f2"
              disabled={record.status === 'deleted' || record.status === 'suspended'}
            />
          </Popconfirm>
        </div>
      ),
    },
  ];

  // Show warning if not in SaaS mode
  if (!isSaaSMode) {
    return (
      <div style={pageStyles}>
        <div style={{ padding: spacing.xl }}>
          <Card style={{ borderRadius: 16 }}>
            <Alert
              type="warning"
              message="Super-Admin Features Unavailable"
              description="Tenant management is only available in SaaS mode (AUTH_MODE=keycloak). In local mode, there is only one default tenant."
              showIcon
            />
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyles}>
        <div style={{ padding: spacing.xl }}>
          <Card style={{ borderRadius: 16 }}>
            <Alert
              type="error"
              message="Failed to Load Tenants"
              description={error.message}
              showIcon
              action={
                <Button onClick={refresh}>Retry</Button>
              }
            />
          </Card>
        </div>
      </div>
    );
  }

  const paginationConfig: TablePaginationConfig = {
    showSizeChanger: true,
    showTotal: (total, range) => (
      <span style={{ fontSize: 12, color: 'rgba(102, 38, 4, 0.6)', fontWeight: 500 }}>
        Showing {range[0]} to {range[1]} of {total} tenants
      </span>
    ),
    defaultPageSize: 5,
    pageSizeOptions: ['5', '10', '20', '50'],
    itemRender: (_current, type, originalElement) => {
      if (type === 'prev') {
        return (
          <button
            style={{
              height: 32,
              width: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: '1px solid #e5e7eb',
              backgroundColor: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 18 }}>&lt;</span>
          </button>
        );
      }
      if (type === 'next') {
        return (
          <button
            style={{
              height: 32,
              width: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: '1px solid #e5e7eb',
              backgroundColor: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 18 }}>&gt;</span>
          </button>
        );
      }
      return originalElement;
    },
  };

  return (
    <div style={pageStyles}>
      {/* Header */}
      <header style={headerStyles}>
        <div>
          <Title
            level={2}
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 700,
              color: colors.brownBramble,
              letterSpacing: '-0.02em',
            }}
          >
            Tenants
          </Title>
          <p style={{ color: 'rgba(102, 38, 4, 0.7)', fontSize: 14, marginTop: 4 }}>
            Manage and monitor all active hive organizations.
          </p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 48,
            paddingLeft: 24,
            paddingRight: 24,
            borderRadius: 9999,
            fontSize: 14,
            fontWeight: 700,
            boxShadow: '0 10px 25px -5px rgba(247, 164, 45, 0.2)',
          }}
        >
          Create Tenant
        </Button>
      </header>

      {/* Search and Filters */}
      <div style={searchBarContainerStyles}>
        <div style={searchBarStyles}>
          <div style={searchInputWrapperStyles}>
            <SearchOutlined style={searchIconStyles} />
            <input
              type="text"
              placeholder="Search by Tenant Name..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={searchInputStyles}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                height: 32,
                width: 1,
                backgroundColor: '#f0e6da',
                marginLeft: 4,
                marginRight: 4,
              }}
            />
            <Select
              placeholder="Status: All"
              allowClear
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              style={{ minWidth: 120 }}
              suffixIcon={<DownOutlined style={{ fontSize: 14 }} />}
              dropdownStyle={{ borderRadius: 12 }}
              bordered={false}
              className="filter-select"
            >
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="suspended">Suspended</Select.Option>
              <Select.Option value="pending">Pending</Select.Option>
            </Select>
            <Select
              placeholder="Plan: All"
              allowClear
              value={planFilter}
              onChange={(value) => setPlanFilter(value)}
              style={{ minWidth: 120 }}
              suffixIcon={<DownOutlined style={{ fontSize: 14 }} />}
              dropdownStyle={{ borderRadius: 12 }}
              bordered={false}
              className="filter-select"
            >
              <Select.Option value="free">Free</Select.Option>
              <Select.Option value="hobby">Hobby</Select.Option>
              <Select.Option value="pro">Pro</Select.Option>
              <Select.Option value="enterprise">Enterprise</Select.Option>
            </Select>
            <Tooltip title="More filters">
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 8,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'rgba(102, 38, 4, 0.4)',
                  cursor: 'pointer',
                }}
              >
                <FilterOutlined style={{ fontSize: 20 }} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={tableContainerStyles}>
        <div style={tableWrapperStyles}>
          <Spin spinning={loading}>
            <Table
              columns={columns}
              dataSource={filteredTenants}
              rowKey="id"
              pagination={paginationConfig}
              size="middle"
              rowClassName={() => 'tenant-row'}
              style={{
                borderRadius: 16,
              }}
            />
          </Spin>
        </div>
      </div>

      <CreateTenantModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={refresh}
      />

      <EditTenantModal
        tenant={selectedTenant}
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedTenant(null);
        }}
        onSuccess={refresh}
      />

      <style>{`
        .tenant-row:hover {
          background-color: rgba(251, 249, 231, 0.3) !important;
        }
        .ant-table-thead > tr > th {
          background-color: #ffffff !important;
          border-bottom: 1px solid #f0e6da !important;
          padding: 16px 24px !important;
        }
        .ant-table-tbody > tr > td {
          padding: 16px 24px !important;
          border-bottom: 1px solid #f0e6da !important;
        }
        .ant-pagination {
          padding: 16px 24px !important;
          margin: 0 !important;
          border-top: 1px solid #f0e6da !important;
          background-color: #ffffff !important;
        }
        .ant-pagination-item {
          border-radius: 50% !important;
          border-color: #e5e7eb !important;
          min-width: 32px !important;
          height: 32px !important;
          line-height: 30px !important;
        }
        .ant-pagination-item-active {
          background-color: ${colors.seaBuckthorn} !important;
          border-color: ${colors.seaBuckthorn} !important;
        }
        .ant-pagination-item-active a {
          color: #ffffff !important;
        }
        .filter-select .ant-select-selector {
          background-color: rgba(251, 249, 231, 0.5) !important;
          border-radius: 9999px !important;
          padding: 4px 16px !important;
          height: 36px !important;
        }
        .filter-select .ant-select-selection-placeholder,
        .filter-select .ant-select-selection-item {
          font-size: 14px !important;
          font-weight: 500 !important;
          color: ${colors.brownBramble} !important;
        }
      `}</style>
    </div>
  );
}

export default AdminTenantsPage;
