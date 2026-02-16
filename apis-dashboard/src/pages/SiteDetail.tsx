import { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Descriptions,
  Space,
  Spin,
  message,
  Modal,
  Empty,
  List,
  Tag,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  CrownOutlined,
  ClockCircleOutlined,
  GiftOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { colors } from '../theme/apisTheme';
import { HarvestFormModal, FirstHarvestModal, HarvestAnalyticsCard, showFirstHiveCelebration, HiveStatusBadge, MiniHiveVisualization, ActivityFeedCard, OverdueBadge } from '../components';
import { SiteMapViewLazy as SiteMapView } from '../components/lazy';
import { useHarvestsBySite, useHarvestAnalytics, useMilestoneFlags, useSiteDetail } from '../hooks';
import type { CreateHarvestInput } from '../hooks/useHarvests';
import { getLastInspectionText } from '../utils';

const { Title, Text } = Typography;

/**
 * Site Detail Page
 *
 * Displays detailed information about a single site.
 * Allows editing and deletion of the site.
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 * Refactored for Layered Hooks Architecture
 */
export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Use hooks for data fetching
  const {
    site,
    hives,
    loading,
    hivesLoading,
    deleteSite,
    deleting,
  } = useSiteDetail(id);

  const [harvestModalOpen, setHarvestModalOpen] = useState(false);
  const [firstHarvestModalOpen, setFirstHarvestModalOpen] = useState(false);
  const [lastHarvestData, setLastHarvestData] = useState<{ amountKg: number; hiveCount: number; date: string; harvestId: string } | null>(null);

  // Milestone flags hook - for checking if first harvest celebration already seen
  const { flags: milestoneFlags, markMilestoneSeen } = useMilestoneFlags();

  // Harvests hook - only using createHarvest since SiteDetail shows analytics,
  // not the full harvest list. Analytics are refetched after creation.
  const {
    createHarvest,
    creating: creatingHarvest,
  } = useHarvestsBySite(id || null);

  // Harvest analytics hook
  const {
    analytics: harvestAnalytics,
    loading: analyticsLoading,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useHarvestAnalytics();

  const handleDelete = useCallback(() => {
    Modal.confirm({
      title: 'Delete Site',
      content: `Are you sure you want to delete "${site?.name}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteSite();
          message.success('Site deleted successfully');
          navigate('/sites');
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            message.error(error.response.data?.error || 'Cannot delete site with assigned units');
          } else {
            message.error('Failed to delete site');
          }
        }
      },
    });
  }, [site?.name, deleteSite, navigate]);

  const handleEdit = () => {
    navigate(`/sites/${id}/edit`);
  };

  const handleBack = () => {
    navigate('/sites');
  };

  // Harvest handlers
  const handleCreateHarvest = async (input: CreateHarvestInput) => {
    const result = await createHarvest(input);
    message.success('Harvest logged successfully');
    setHarvestModalOpen(false);

    // Refetch analytics after creating harvest
    refetchAnalytics();

    // Handle first-hive celebrations (AC#4 - smaller toast notifications)
    if (result.first_hive_ids && result.first_hive_ids.length > 0) {
      result.first_hive_ids.forEach((hiveId) => {
        const foundHive = hives.find((h) => h.id === hiveId);
        if (foundHive) {
          showFirstHiveCelebration(foundHive.name);
        } else {
          // Hive not found in local list - show celebration with generic name
          // This can happen if hives list hasn't refreshed yet
          console.warn(`First harvest hive ${hiveId} not found in local hive list`);
          showFirstHiveCelebration('your hive');
        }
      });
    }

    // Check if this was the first harvest (account-wide) and hasn't been seen
    if (result.is_first_harvest && !milestoneFlags?.first_harvest_seen) {
      setLastHarvestData({
        amountKg: result.total_kg,
        hiveCount: result.hives?.length || 1,
        date: result.harvested_at,
        harvestId: result.id,
      });
      setFirstHarvestModalOpen(true);
    }
    return result;
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!site) {
    return (
      <Empty description="Site not found">
        <Button onClick={handleBack}>Back to Sites</Button>
      </Empty>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            Back
          </Button>
          <Title level={2} style={{ margin: 0 }}>{site.name}</Title>
        </Space>
        <Space wrap>
          {hives.length > 0 && (
            <Button
              type="primary"
              icon={<GiftOutlined />}
              onClick={() => setHarvestModalOpen(true)}
              style={{ background: colors.seaBuckthorn }}
            >
              Log Harvest
            </Button>
          )}
          <Button icon={<EditOutlined />} onClick={handleEdit}>
            Edit
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            loading={deleting}
          >
            Delete
          </Button>
        </Space>
      </div>

      <Card title="Site Information">
        <Descriptions column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label="Name">{site.name}</Descriptions.Item>
          <Descriptions.Item label="Timezone">{site.timezone}</Descriptions.Item>
          <Descriptions.Item label="Location" span={2}>
            {site.latitude !== null && site.longitude !== null ? (
              <Space>
                <EnvironmentOutlined />
                <Text>{site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}</Text>
              </Space>
            ) : (
              <Text type="secondary">No location set</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Created">
            {new Date(site.created_at).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Last Updated">
            {new Date(site.updated_at).toLocaleString()}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Map view - shows location if coordinates are set */}
      {site.latitude !== null && site.longitude !== null && (
        <Card title="Location Map" style={{ marginTop: 16 }}>
          <SiteMapView
            latitude={site.latitude}
            longitude={site.longitude}
            width={600}
            height={300}
            zoom={14}
            showOpenInMaps
          />
        </Card>
      )}

      {/* Hives Section - Epic 5, Story 5.1 */}
      <Card
        title="Hives at this Site"
        style={{ marginTop: 16 }}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate(`/sites/${id}/hives/create`)}
          >
            Add Hive
          </Button>
        }
      >
        {hivesLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : hives.length > 0 ? (
          <List
            dataSource={hives}
            renderItem={(hive) => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  padding: 16,
                  borderRadius: 8,
                  transition: 'background 0.2s',
                }}
                onClick={() => navigate(`/hives/${hive.id}`)}
                actions={[
                  <Button
                    type="link"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/hives/${hive.id}/edit`);
                    }}
                  >
                    Edit
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <OverdueBadge count={hive.task_summary?.overdue || 0}>
                      <MiniHiveVisualization
                        broodBoxes={hive.brood_boxes}
                        honeySupers={hive.honey_supers}
                        status={hive.status}
                      />
                    </OverdueBadge>
                  }
                  title={
                    <Space wrap>
                      {hive.name}
                      <Tag>
                        {hive.brood_boxes}B / {hive.honey_supers}S
                      </Tag>
                      <HiveStatusBadge hive={hive} />
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={2}>
                      {hive.queen_age_display && (
                        <Space size={4}>
                          <CrownOutlined style={{ color: colors.seaBuckthorn }} />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Queen: {hive.queen_age_display}
                          </Text>
                        </Space>
                      )}
                      <Space size={4}>
                        <ClockCircleOutlined style={{ color: colors.textMuted }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {getLastInspectionText(hive)}
                        </Text>
                      </Space>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="No hives at this site yet">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(`/sites/${id}/hives/create`)}
            >
              Add Your First Hive
            </Button>
          </Empty>
        )}
      </Card>

      {/* Units section - placeholder for Story 2.2 */}
      <Card title="Units at this Site" style={{ marginTop: 16 }}>
        <Empty description="No units assigned to this site yet">
          <Text type="secondary">
            Units can be assigned when you register them.
          </Text>
        </Empty>
      </Card>

      {/* Activity Feed - Epic 13, Story 13.17 */}
      <div style={{ marginTop: 16 }}>
        <ActivityFeedCard
          siteId={id}
          title="Recent Activity at this Site"
          limit={5}
        />
      </div>

      {/* Harvest Analytics - Epic 6, Story 6.3, AC #4 */}
      {hives.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <HarvestAnalyticsCard
            analytics={harvestAnalytics}
            loading={analyticsLoading}
            error={!!analyticsError}
          />
        </div>
      )}

      {/* Harvest Form Modal - Epic 6, Story 6.3 */}
      <HarvestFormModal
        open={harvestModalOpen}
        onClose={() => setHarvestModalOpen(false)}
        onSubmit={handleCreateHarvest}
        loading={creatingHarvest}
        siteId={id || ''}
        availableHives={hives.map(h => ({ id: h.id, name: h.name }))}
      />

      {/* First Harvest Celebration Modal - Epic 6, Story 6.3 & Epic 9, Story 9.2 */}
      {lastHarvestData && (
        <FirstHarvestModal
          open={firstHarvestModalOpen}
          onClose={() => {
            // Mark milestone as seen so modal won't appear again (AC#3)
            markMilestoneSeen('first_harvest_seen');
            setFirstHarvestModalOpen(false);
            setLastHarvestData(null);
          }}
          amountKg={lastHarvestData.amountKg}
          hiveCount={lastHarvestData.hiveCount}
          harvestDate={lastHarvestData.date}
          harvestId={lastHarvestData.harvestId}
        />
      )}
    </div>
  );
}

export default SiteDetail;
