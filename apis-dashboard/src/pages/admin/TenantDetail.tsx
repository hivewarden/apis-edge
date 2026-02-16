/**
 * Admin Tenant Detail Page
 *
 * Super-admin page for viewing and managing a single tenant.
 * Shows consumption metrics, plan overrides, recent activity, and admin actions.
 *
 * Part of Epic 13, Story 13-12 (Super-Admin Tenant Detail View)
 */
import { useState, useEffect, CSSProperties } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Button,
  Form,
  Input,
  Table,
  Typography,
  message,
  Spin,
  Alert,
  Card,
  Popconfirm,
} from 'antd';
import {
  DeleteOutlined,
  StopOutlined,
  LoginOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAdminTenant, useUpdateTenant, useDeleteTenant } from '../../hooks/useAdminTenants';
import { getAuthConfigSync } from '../../config';
import apiClient from '../../providers/apiClient';
import { colors, spacing } from '../../theme/apisTheme';

const { Title } = Typography;

// ============================================================================
// Types
// ============================================================================

interface TenantActivity {
  id: string;
  action: string;
  user: string;
  date: string;
}

interface PlanOverrides {
  maxHives: number;
  maxStorageGb: number;
  maxUsers: number;
}

// ============================================================================
// Styles
// ============================================================================

const pageStyles: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: colors.coconutCream,
  paddingBottom: 100, // Space for sticky footer
};

const contentStyles: CSSProperties = {
  maxWidth: 1024,
  margin: '0 auto',
  padding: `${spacing.xl}px ${spacing.lg}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xl,
};

const breadcrumbStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
};

const headerStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
};

const titleRowStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 16,
};

const cardStyles: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 16,
  padding: 24,
  boxShadow: '0 4px 20px -2px rgba(102, 38, 4, 0.06)',
  border: '1px solid rgba(0, 0, 0, 0.05)',
};

const cardLargeStyles: CSSProperties = {
  ...cardStyles,
  padding: 32,
};

const sectionHeaderStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 24,
};

const iconCircleStyles: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  backgroundColor: colors.coconutCream,
  color: colors.seaBuckthorn,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const progressBarTrackStyles: CSSProperties = {
  height: 12,
  width: '100%',
  backgroundColor: '#f4eee7',
  borderRadius: 9999,
  overflow: 'hidden',
};

const progressBarFillStyles = (percentage: number): CSSProperties => ({
  height: '100%',
  width: `${percentage}%`,
  backgroundColor: colors.seaBuckthorn,
  borderRadius: 9999,
  boxShadow: '0 0 10px rgba(247, 164, 45, 0.4)',
});

const inputWithSuffixStyles: CSSProperties = {
  position: 'relative',
};

const inputSuffixStyles: CSSProperties = {
  position: 'absolute',
  right: 16,
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'rgba(102, 38, 4, 0.5)',
  pointerEvents: 'none',
};

const footerStyles: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  backdropFilter: 'blur(8px)',
  padding: 16,
  boxShadow: '0 -4px 20px -4px rgba(0, 0, 0, 0.05)',
  zIndex: 100,
};

const footerContentStyles: CSSProperties = {
  maxWidth: 1024,
  margin: '0 auto',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  paddingLeft: 8,
  paddingRight: 8,
};

// ============================================================================
// Components
// ============================================================================

/** Progress bar with label */
function ProgressMetric({
  label,
  current,
  max,
  unit,
}: {
  label: string;
  current: number;
  max: number;
  unit?: string;
}) {
  const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const displayCurrent = unit === 'GB' ? `${current}GB` : current.toString();
  const displayMax = unit === 'GB' ? `${max}GB` : max.toString();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 500 }}>
        <span>{label}</span>
        <span style={{ color: 'rgba(102, 38, 4, 0.5)' }}>
          {displayCurrent} / {displayMax}
        </span>
      </div>
      <div style={progressBarTrackStyles}>
        <div style={progressBarFillStyles(percentage)} />
      </div>
      <p style={{ fontSize: 12, color: 'rgba(102, 38, 4, 0.5)', margin: 0 }}>
        {Math.round(percentage)}% of plan limit
      </p>
    </div>
  );
}

/** Plan badge */
function PlanBadge({ plan }: { plan: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '6px 16px',
        borderRadius: 9999,
        fontSize: 14,
        fontWeight: 700,
        backgroundColor: 'rgba(124, 144, 130, 0.1)',
        color: '#7c9082',
        border: '1px solid rgba(124, 144, 130, 0.2)',
      }}
    >
      {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan Badge
    </span>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AdminTenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenant, loading, error, refresh } = useAdminTenant(tenantId);
  const { updateTenant, updating } = useUpdateTenant();
  const { deleteTenant, deleting } = useDeleteTenant();
  const [form] = Form.useForm();

  // Mock data for consumption and activity (would come from API in real implementation)
  const [consumption] = useState({
    hivesManaged: { current: 5, max: 10 },
    dataStorage: { current: 2.4, max: 5 },
    teamUnits: { current: 2, max: 5 },
  });

  const [overrides, setOverrides] = useState<PlanOverrides>({
    maxHives: 10,
    maxStorageGb: 5,
    maxUsers: 5,
  });

  const [activities] = useState<TenantActivity[]>([
    { id: '1', action: 'Hive #44 Inspection Logged', user: 'Sarah J.', date: 'Oct 24, 2023' },
    { id: '2', action: 'Storage Limit Alert', user: 'System', date: 'Oct 22, 2023' },
  ]);

  // Check if in SaaS mode
  const authConfig = getAuthConfigSync();
  const isSaaSMode = authConfig?.mode === 'keycloak';

  // Update form when tenant data loads
  useEffect(() => {
    if (tenant) {
      // In real implementation, would fetch overrides from tenant data
      form.setFieldsValue(overrides);
    }
  }, [tenant, form]);

  const handleSaveOverrides = async (values: PlanOverrides) => {
    if (!tenant) return;

    try {
      // In real implementation, would update via API
      setOverrides(values);
      message.success('Plan overrides saved successfully');
    } catch (error) {
      message.error('Failed to save overrides');
    }
  };

  const handleResetDefaults = () => {
    const defaults = { maxHives: 10, maxStorageGb: 5, maxUsers: 5 };
    form.setFieldsValue(defaults);
    setOverrides(defaults);
    message.info('Reset to default values');
  };

  const handleImpersonate = async () => {
    if (!tenant) return;

    try {
      await apiClient.post('/admin/impersonate', { tenant_id: tenant.id });

      message.success(`Now impersonating ${tenant.name}`);
      window.location.href = '/';
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to impersonate tenant');
    }
  };

  const handleSuspend = async () => {
    if (!tenant) return;

    try {
      await updateTenant(tenant.id, { status: 'suspended' });
      message.success(`${tenant.name} has been suspended`);
      refresh();
    } catch (error) {
      // Error shown by interceptor
    }
  };

  const handleDelete = async () => {
    if (!tenant) return;

    try {
      await deleteTenant(tenant.id);
      message.success(`${tenant.name} has been deleted`);
      navigate('/admin/tenants');
    } catch (error) {
      // Error shown by interceptor
    }
  };

  const activityColumns: ColumnsType<TenantActivity> = [
    {
      title: (
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.brownBramble, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Action
        </span>
      ),
      dataIndex: 'action',
      key: 'action',
      render: (text: string) => (
        <span style={{ fontSize: 14, fontWeight: 500, color: colors.brownBramble }}>{text}</span>
      ),
    },
    {
      title: (
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.brownBramble, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          User
        </span>
      ),
      dataIndex: 'user',
      key: 'user',
      render: (text: string) => (
        <span style={{ fontSize: 14, color: 'rgba(102, 38, 4, 0.5)' }}>{text}</span>
      ),
    },
    {
      title: (
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.brownBramble, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Date
        </span>
      ),
      dataIndex: 'date',
      key: 'date',
      render: (text: string) => (
        <span style={{ fontSize: 14, color: 'rgba(102, 38, 4, 0.5)' }}>{text}</span>
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
              description="Tenant management is only available in SaaS mode (AUTH_MODE=keycloak)."
              showIcon
            />
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ ...pageStyles, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div style={pageStyles}>
        <div style={{ padding: spacing.xl }}>
          <Card style={{ borderRadius: 16 }}>
            <Alert
              type="error"
              message="Failed to Load Tenant"
              description={error?.message || 'Tenant not found'}
              showIcon
              action={
                <Button onClick={() => navigate('/admin/tenants')}>Back to Tenants</Button>
              }
            />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyles}>
      <div style={contentStyles}>
        {/* Breadcrumb */}
        <div style={breadcrumbStyles}>
          <Link
            to="/admin/tenants"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'rgba(102, 38, 4, 0.5)',
              textDecoration: 'none',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>group</span>
            <span style={{ fontWeight: 500 }}>Tenants</span>
          </Link>
          <span style={{ color: 'rgba(102, 38, 4, 0.3)' }}>&gt;</span>
          <span style={{ fontWeight: 700, color: colors.brownBramble }}>{tenant.name}</span>
        </div>

        {/* Header */}
        <header style={headerStyles}>
          <div style={titleRowStyles}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Title
                level={1}
                style={{
                  margin: 0,
                  fontSize: 40,
                  fontWeight: 900,
                  color: colors.brownBramble,
                  letterSpacing: '-0.02em',
                }}
              >
                {tenant.name}
              </Title>
              <p style={{ fontFamily: 'monospace', fontSize: 14, color: 'rgba(102, 38, 4, 0.5)', margin: 0 }}>
                Tenant ID: {tenant.id.slice(0, 7)}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <PlanBadge plan={tenant.plan} />
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: '#f4eee7',
                  border: '2px solid #ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              />
            </div>
          </div>
        </header>

        {/* Grid of cards */}
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
          {/* Current Consumption Card */}
          <div style={cardLargeStyles}>
            <div style={sectionHeaderStyles}>
              <div style={iconCircleStyles}>
                <span className="material-symbols-outlined">equalizer</span>
              </div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: colors.brownBramble }}>
                Current Consumption
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <ProgressMetric
                label="Hives Managed"
                current={consumption.hivesManaged.current}
                max={consumption.hivesManaged.max}
              />
              <ProgressMetric
                label="Data Storage"
                current={consumption.dataStorage.current}
                max={consumption.dataStorage.max}
                unit="GB"
              />
              <ProgressMetric
                label="Team Units"
                current={consumption.teamUnits.current}
                max={consumption.teamUnits.max}
              />
            </div>
          </div>

          {/* Plan Overrides Card */}
          <div style={cardLargeStyles}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={iconCircleStyles}>
                  <span className="material-symbols-outlined">tune</span>
                </div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: colors.brownBramble }}>
                  Plan Overrides
                </h2>
              </div>
              <button
                onClick={handleResetDefaults}
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.seaBuckthorn,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Reset to Default
              </button>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSaveOverrides}
              initialValues={overrides}
            >
              <Form.Item
                name="maxHives"
                label={<span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(102, 38, 4, 0.5)' }}>Max Hives</span>}
              >
                <div style={inputWithSuffixStyles}>
                  <Input
                    type="number"
                    style={{
                      height: 48,
                      borderRadius: 9999,
                      backgroundColor: colors.coconutCream,
                      border: 'none',
                      paddingRight: 60,
                    }}
                  />
                  <span style={inputSuffixStyles}>units</span>
                </div>
              </Form.Item>

              <Form.Item
                name="maxStorageGb"
                label={<span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(102, 38, 4, 0.5)' }}>Max Storage (GB)</span>}
              >
                <div style={inputWithSuffixStyles}>
                  <Input
                    type="number"
                    style={{
                      height: 48,
                      borderRadius: 9999,
                      backgroundColor: colors.coconutCream,
                      border: 'none',
                      paddingRight: 60,
                    }}
                  />
                  <span style={inputSuffixStyles}>GB</span>
                </div>
              </Form.Item>

              <Form.Item
                name="maxUsers"
                label={<span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(102, 38, 4, 0.5)' }}>Max Users</span>}
              >
                <div style={inputWithSuffixStyles}>
                  <Input
                    type="number"
                    style={{
                      height: 48,
                      borderRadius: 9999,
                      backgroundColor: colors.coconutCream,
                      border: 'none',
                      paddingRight: 60,
                    }}
                  />
                  <span style={inputSuffixStyles}>users</span>
                </div>
              </Form.Item>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={updating}
                  style={{
                    height: 40,
                    paddingLeft: 24,
                    paddingRight: 24,
                    borderRadius: 9999,
                    fontWeight: 700,
                  }}
                >
                  Save Changes
                </Button>
              </div>
            </Form>
          </div>
        </div>

        {/* Recent Activity Card */}
        <div style={cardLargeStyles}>
          <div style={sectionHeaderStyles}>
            <div style={iconCircleStyles}>
              <span className="material-symbols-outlined">history</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: colors.brownBramble }}>
              Recent Activity
            </h2>
          </div>

          <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${colors.coconutCream}` }}>
            <Table
              columns={activityColumns}
              dataSource={activities}
              rowKey="id"
              pagination={false}
              size="middle"
            />
          </div>
        </div>
      </div>

      {/* Sticky Admin Actions Footer */}
      <div style={footerStyles}>
        <div style={footerContentStyles}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px' }}>
            <span className="material-symbols-outlined" style={{ color: 'rgba(102, 38, 4, 0.5)' }}>
              admin_panel_settings
            </span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(102, 38, 4, 0.5)' }}>
              Admin Actions
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Popconfirm
              title="Delete Tenant"
              description={`Are you sure you want to delete ${tenant.name}? This cannot be undone.`}
              onConfirm={handleDelete}
              okText="Delete"
              okButtonProps={{ danger: true, loading: deleting }}
              cancelText="Cancel"
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                style={{ fontWeight: 700 }}
              >
                Delete
              </Button>
            </Popconfirm>

            <Popconfirm
              title="Suspend Tenant"
              description={`Are you sure you want to suspend ${tenant.name}?`}
              onConfirm={handleSuspend}
              okText="Suspend"
              okButtonProps={{ loading: updating }}
              cancelText="Cancel"
            >
              <Button
                type="text"
                icon={<StopOutlined />}
                style={{ color: '#ea580c', fontWeight: 700 }}
                disabled={tenant.status === 'suspended'}
              >
                Suspend
              </Button>
            </Popconfirm>

            <div style={{ height: 24, width: 1, backgroundColor: '#e6dbce' }} />

            <Button
              type="primary"
              icon={<LoginOutlined />}
              onClick={handleImpersonate}
              style={{
                height: 40,
                paddingLeft: 24,
                paddingRight: 24,
                borderRadius: 9999,
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(247, 164, 45, 0.2)',
              }}
            >
              Impersonate User
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        .ant-table-thead > tr > th {
          background-color: ${colors.coconutCream} !important;
          padding: 12px 24px !important;
        }
        .ant-table-tbody > tr > td {
          padding: 16px 24px !important;
          border-bottom: 1px solid #f4eee7 !important;
        }
        .ant-table-tbody > tr:last-child > td {
          border-bottom: none !important;
        }
        .ant-form-item {
          margin-bottom: 20px;
        }
        .ant-input:focus,
        .ant-input:hover {
          border-color: ${colors.seaBuckthorn} !important;
          box-shadow: 0 0 0 2px rgba(247, 164, 45, 0.1) !important;
        }
      `}</style>
    </div>
  );
}

export default AdminTenantDetailPage;
