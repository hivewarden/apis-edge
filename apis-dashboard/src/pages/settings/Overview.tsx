/**
 * Settings Overview Tab
 *
 * Displays tenant information and resource usage statistics.
 * Shows progress bars for hives, units, users, and storage.
 *
 * Part of Epic 13, Story 13-19 (Tenant Settings UI)
 */
import { Card, Space, Typography, Tag, Alert, Skeleton, Descriptions, Button } from 'antd';
import {
  HomeOutlined,
  CalendarOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import { useTenantSettings } from '../../hooks/useTenantSettings';
import { UsageChart } from '../../components/settings/UsageChart';
import { colors } from '../../theme/apisTheme';

const { Title, Text } = Typography;

/**
 * Format date to user-friendly display.
 */
function formatCreatedDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get plan display name with proper casing.
 */
function getPlanDisplayName(plan: string): string {
  const planMap: Record<string, string> = {
    free: 'Free',
    starter: 'Starter',
    professional: 'Professional',
    enterprise: 'Enterprise',
  };
  return planMap[plan.toLowerCase()] || plan;
}

/**
 * Get plan tag color.
 */
function getPlanColor(plan: string): string {
  const colorMap: Record<string, string> = {
    free: 'default',
    starter: 'blue',
    professional: 'purple',
    enterprise: 'gold',
  };
  return colorMap[plan.toLowerCase()] || 'default';
}

/**
 * Overview tab component displaying tenant info and usage.
 */
export function Overview() {
  const { settings, loading, error, refresh } = useTenantSettings();

  // Loading state
  if (loading) {
    return (
      <div>
        <Card style={{ marginBottom: 24 }}>
          <Skeleton active paragraph={{ rows: 2 }} />
        </Card>
        <Card title="Resource Usage">
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert
        type="error"
        message="Failed to Load Settings"
        description={error.message}
        showIcon
        action={
          <Button type="link" onClick={() => refresh()}>Try Again</Button>
        }
      />
    );
  }

  // No data state
  if (!settings) {
    return (
      <Alert
        type="info"
        message="No Settings Available"
        description="Could not load tenant settings."
        showIcon
      />
    );
  }

  const { tenant, usage, limits, percentages } = settings;

  return (
    <div>
      {/* Tenant Info Card */}
      <Card
        title={
          <Space>
            <HomeOutlined style={{ color: colors.seaBuckthorn }} />
            <span>Tenant Information</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Tenant Name">
            <Text strong>{tenant.name}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Plan">
            <Tag color={getPlanColor(tenant.plan)} icon={<CrownOutlined />}>
              {getPlanDisplayName(tenant.plan)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Created">
            <Space>
              <CalendarOutlined />
              <Text>{formatCreatedDate(tenant.created_at)}</Text>
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Usage Card */}
      <Card
        title={
          <Space>
            <Title level={5} style={{ margin: 0 }}>Resource Usage</Title>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          Monitor your resource consumption and plan limits.
        </Text>

        <UsageChart
          usage={usage}
          limits={limits}
          percentages={percentages}
        />

        {/* Warning message if any resource is near limit */}
        {(percentages.hives_percent >= 80 ||
          percentages.units_percent >= 80 ||
          percentages.users_percent >= 80 ||
          percentages.storage_percent >= 80) && (
          <Alert
            type="warning"
            message="Approaching Limits"
            description="One or more resources are approaching their limits. Consider upgrading your plan if you need more capacity."
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Card>
    </div>
  );
}

export default Overview;
