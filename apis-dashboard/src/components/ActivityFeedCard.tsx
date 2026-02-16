/**
 * ActivityFeedCard Component
 *
 * Displays a compact activity feed for the Dashboard and detail pages.
 * Shows the 5 most recent activities with icons, messages, and relative time.
 * Includes a "View All" link to the full activity page.
 *
 * Part of Epic 13, Story 13.17 (Activity Feed)
 */
import { Card, List, Typography, Spin, Empty, Button, Space } from 'antd';
import { HistoryOutlined, RightOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useActivityFeed } from '../hooks/useActivityFeed';
import type { ActivityItem } from '../hooks/useActivityFeed';
import { getActivityIcon, getActivityColor, getActivityEntityLink } from '../utils/activityUtils';
import { ACTIVITY_CARD_DEFAULT_LIMIT } from '../constants';
import { colors } from '../theme/apisTheme';

const { Text, Paragraph } = Typography;

/**
 * Props for the ActivityFeedCard component.
 */
export interface ActivityFeedCardProps {
  /** Site ID to filter activity by site */
  siteId?: string | null;
  /** Hive ID to filter activity by hive */
  hiveId?: string | null;
  /** Title override for the card */
  title?: string;
  /** Number of items to show (default 5) */
  limit?: number;
  /** Whether to show the "View All" link */
  showViewAll?: boolean;
}

/**
 * ActivityFeedCard displays a compact list of recent activity.
 */
export function ActivityFeedCard({
  siteId,
  hiveId,
  title = 'Recent Activity',
  limit = ACTIVITY_CARD_DEFAULT_LIMIT,
  showViewAll = true,
}: ActivityFeedCardProps) {
  const navigate = useNavigate();

  const { activities, loading, error } = useActivityFeed({
    filters: {
      siteId: siteId || undefined,
      hiveId: hiveId || undefined,
    },
    limit,
  });

  // Build the "View All" link with filters
  const viewAllLink = (() => {
    const params = new URLSearchParams();
    if (siteId) params.append('site_id', siteId);
    if (hiveId) params.append('hive_id', hiveId);
    const query = params.toString();
    return query ? `/activity?${query}` : '/activity';
  })();

  const handleItemClick = (item: ActivityItem) => {
    const link = getActivityEntityLink(item);
    if (link) {
      navigate(link);
    }
  };

  return (
    <Card
      title={
        <Space>
          <HistoryOutlined style={{ color: colors.seaBuckthorn }} />
          {title}
        </Space>
      }
      extra={
        showViewAll && (
          <Link to={viewAllLink}>
            View All <RightOutlined />
          </Link>
        )
      }
      bodyStyle={{ padding: activities.length === 0 ? 24 : 0 }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : error ? (
        <Empty
          description="Failed to load activity"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : activities.length === 0 ? (
        <Empty
          description="No recent activity"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <List
          dataSource={activities}
          renderItem={(item) => {
            const link = getActivityEntityLink(item);
            const isClickable = link !== null;

            return (
              <List.Item
                style={{
                  padding: '12px 16px',
                  cursor: isClickable ? 'pointer' : 'default',
                  transition: 'background 0.2s',
                }}
                onClick={() => handleItemClick(item)}
                onMouseEnter={(e) => {
                  if (isClickable) {
                    e.currentTarget.style.background = 'rgba(247, 164, 45, 0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        backgroundColor: `${getActivityColor(item.activity_type)}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: getActivityColor(item.activity_type),
                        fontSize: 16,
                      }}
                    >
                      {getActivityIcon(item.icon)}
                    </div>
                  }
                  title={
                    <Paragraph
                      ellipsis={{ rows: 2 }}
                      style={{ marginBottom: 0, fontSize: 13 }}
                    >
                      {item.message}
                    </Paragraph>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.relative_time}
                    </Text>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}

      {/* View All button at bottom for mobile */}
      {showViewAll && activities.length > 0 && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0' }}>
          <Button type="link" block onClick={() => navigate(viewAllLink)}>
            View All Activity <RightOutlined />
          </Button>
        </div>
      )}
    </Card>
  );
}

export default ActivityFeedCard;
