/**
 * Activity Page
 *
 * Displays a full paginated activity feed with filtering options.
 * Supports filtering by activity type and hive.
 * Uses cursor-based pagination with "Load More" button.
 *
 * Part of Epic 13, Story 13.17 (Activity Feed)
 */
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  List,
  Space,
  Select,
  Empty,
  Spin,
  Button,
  Alert,
} from 'antd';
import {
  HistoryOutlined,
  FilterOutlined,
  FileSearchOutlined,
  MedicineBoxOutlined,
  CoffeeOutlined,
  GiftOutlined,
  HomeOutlined,
  VideoCameraOutlined,
  UserAddOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useActivityFeed, useHivesList } from '../hooks';
import type { ActivityItem, ActivityFilters } from '../hooks/useActivityFeed';
import { getActivityIcon, getActivityColor, getActivityEntityLink } from '../utils/activityUtils';
import { ACTIVITY_FEED_DEFAULT_LIMIT } from '../constants';
import { colors } from '../theme/apisTheme';

const { Title, Text, Paragraph } = Typography;

/**
 * Activity type filter options.
 */
const ACTIVITY_TYPE_OPTIONS = [
  { value: 'inspections', label: 'Inspections', icon: <FileSearchOutlined /> },
  { value: 'treatments', label: 'Treatments', icon: <MedicineBoxOutlined /> },
  { value: 'feedings', label: 'Feedings', icon: <CoffeeOutlined /> },
  { value: 'harvests', label: 'Harvests', icon: <GiftOutlined /> },
  { value: 'hives', label: 'Hives', icon: <HomeOutlined /> },
  { value: 'clips', label: 'Clips', icon: <VideoCameraOutlined /> },
  { value: 'users', label: 'Users', icon: <UserAddOutlined /> },
];

/**
 * Activity page component.
 */
export function Activity() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse filters from URL
  const [selectedTypes, setSelectedTypes] = useState<string[]>(() => {
    const types = searchParams.get('entity_type');
    return types ? types.split(',') : [];
  });

  const [selectedHiveId, setSelectedHiveId] = useState<string | undefined>(() =>
    searchParams.get('hive_id') || undefined
  );

  const [selectedSiteId] = useState<string | undefined>(() =>
    searchParams.get('site_id') || undefined
  );

  // Use hook for hives dropdown
  const { hives, loading: hivesLoading } = useHivesList();

  // Build filters object
  const filters: ActivityFilters = {
    entityTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
    hiveId: selectedHiveId,
    siteId: selectedSiteId,
  };

  const {
    activities,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refetch,
  } = useActivityFeed({
    filters,
    limit: ACTIVITY_FEED_DEFAULT_LIMIT,
  });

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedTypes.length > 0) {
      params.set('entity_type', selectedTypes.join(','));
    }
    if (selectedHiveId) {
      params.set('hive_id', selectedHiveId);
    }
    if (selectedSiteId) {
      params.set('site_id', selectedSiteId);
    }
    setSearchParams(params, { replace: true });
  }, [selectedTypes, selectedHiveId, selectedSiteId, setSearchParams]);

  const handleItemClick = (item: ActivityItem) => {
    const link = getActivityEntityLink(item);
    if (link) {
      navigate(link);
    }
  };

  const handleTypeChange = (values: string[]) => {
    setSelectedTypes(values);
  };

  const handleHiveChange = (value: string | undefined) => {
    setSelectedHiveId(value || undefined);
  };

  const handleClearFilters = () => {
    setSelectedTypes([]);
    setSelectedHiveId(undefined);
  };

  const hasFilters = selectedTypes.length > 0 || selectedHiveId;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          <HistoryOutlined style={{ marginRight: 12, color: colors.seaBuckthorn }} />
          Activity
        </Title>
        <Paragraph type="secondary">
          See what's been happening in your apiary
        </Paragraph>
      </div>

      {/* Filters */}
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Space wrap size="middle">
          <Space>
            <FilterOutlined />
            <Text strong>Filters:</Text>
          </Space>

          <Select
            mode="multiple"
            placeholder="Activity Type"
            value={selectedTypes}
            onChange={handleTypeChange}
            style={{ minWidth: 200 }}
            allowClear
            maxTagCount={2}
            options={ACTIVITY_TYPE_OPTIONS.map(opt => ({
              value: opt.value,
              label: (
                <Space>
                  {opt.icon}
                  {opt.label}
                </Space>
              ),
            }))}
          />

          <Select
            placeholder="Filter by Hive"
            value={selectedHiveId}
            onChange={handleHiveChange}
            style={{ minWidth: 180 }}
            allowClear
            loading={hivesLoading}
            showSearch
            optionFilterProp="label"
            options={hives.map(h => ({
              value: h.id,
              label: h.name,
            }))}
          />

          {hasFilters && (
            <Button type="link" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          )}
        </Space>
      </Card>

      {/* Activity List */}
      <Card bodyStyle={{ padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
          </div>
        ) : error ? (
          <div style={{ padding: 24 }}>
            <Alert
              type="error"
              message="Failed to load activity"
              description="There was an error loading the activity feed. Please try again."
              action={
                <Button type="primary" onClick={refetch}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : activities.length === 0 ? (
          <Empty
            description={
              hasFilters
                ? 'No activity matches your filters'
                : 'No activity yet'
            }
            style={{ padding: 60 }}
          >
            {hasFilters && (
              <Button onClick={handleClearFilters}>Clear Filters</Button>
            )}
          </Empty>
        ) : (
          <>
            <List
              dataSource={activities}
              renderItem={(item) => {
                const link = getActivityEntityLink(item);
                const isClickable = link !== null;

                return (
                  <List.Item
                    style={{
                      padding: '16px 24px',
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
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            backgroundColor: `${getActivityColor(item.activity_type)}15`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: getActivityColor(item.activity_type),
                            fontSize: 18,
                          }}
                        >
                          {getActivityIcon(item.icon)}
                        </div>
                      }
                      title={
                        <Space direction="vertical" size={0}>
                          <Text style={{ fontSize: 14 }}>{item.message}</Text>
                          {item.hive_name && item.entity_type !== 'hives' && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              <HomeOutlined style={{ marginRight: 4 }} />
                              {item.hive_name}
                            </Text>
                          )}
                        </Space>
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

            {/* Load More */}
            {hasMore && (
              <div style={{ padding: 16, textAlign: 'center' }}>
                <Button
                  onClick={loadMore}
                  loading={loadingMore}
                  icon={loadingMore ? <LoadingOutlined /> : undefined}
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export default Activity;
