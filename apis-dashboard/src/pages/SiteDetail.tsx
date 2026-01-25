import { useState, useEffect, useCallback } from 'react';
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
  Badge,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  EnvironmentOutlined,
  PlusOutlined,
  CrownOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { apiClient } from '../providers/apiClient';
import { colors } from '../theme/apisTheme';
import { HarvestFormModal, FirstHarvestModal, HarvestAnalyticsCard, showFirstHiveCelebration } from '../components';
import { useHarvestsBySite, useHarvestAnalytics, useMilestoneFlags } from '../hooks';
import type { CreateHarvestInput } from '../hooks/useHarvests';
import { GiftOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface Site {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

interface SiteResponse {
  data: Site;
}

interface Hive {
  id: string;
  name: string;
  queen_introduced_at: string | null;
  queen_source: string | null;
  queen_age_display: string | null;
  brood_boxes: number;
  honey_supers: number;
  last_inspection_at: string | null;
  last_inspection_issues: string[] | null;
  status: 'healthy' | 'needs_attention' | 'unknown';
}

interface HivesResponse {
  data: Hive[];
  meta: { total: number };
}

/**
 * Site Detail Page
 *
 * Displays detailed information about a single site.
 * Allows editing and deletion of the site.
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 */
export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [hives, setHives] = useState<Hive[]>([]);
  const [loading, setLoading] = useState(true);
  const [hivesLoading, setHivesLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
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

  const fetchSite = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<SiteResponse>(`/sites/${id}`);
      setSite(response.data.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        message.error('Site not found');
      } else {
        message.error('Failed to load site');
      }
      navigate('/sites');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchHives = useCallback(async () => {
    try {
      setHivesLoading(true);
      const response = await apiClient.get<HivesResponse>(`/sites/${id}/hives`);
      setHives(response.data.data || []);
    } catch {
      // Silently fail - hives table might not exist yet
      setHives([]);
    } finally {
      setHivesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchSite();
      fetchHives();
    }
  }, [id, fetchSite, fetchHives]);

  const handleDelete = () => {
    Modal.confirm({
      title: 'Delete Site',
      content: `Are you sure you want to delete "${site?.name}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setDeleting(true);
          await apiClient.delete(`/sites/${id}`);
          message.success('Site deleted successfully');
          navigate('/sites');
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            message.error(error.response.data?.error || 'Cannot delete site with assigned units');
          } else {
            message.error('Failed to delete site');
          }
        } finally {
          setDeleting(false);
        }
      },
    });
  };

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
        const hive = hives.find((h) => h.id === hiveId);
        if (hive) {
          showFirstHiveCelebration(hive.name);
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

  const getStatusBadge = (hive: Hive) => {
    if (hive.status === 'needs_attention') {
      return (
        <Tag color="warning" icon={<WarningOutlined />}>
          Needs attention
        </Tag>
      );
    }
    if (hive.status === 'healthy') {
      return <Tag color="success">Healthy</Tag>;
    }
    return <Tag color="default">Unknown</Tag>;
  };

  const getLastInspectionText = (hive: Hive): string => {
    if (!hive.last_inspection_at) {
      return 'No inspections yet';
    }
    const days = dayjs().diff(dayjs(hive.last_inspection_at), 'day');
    if (days === 0) return 'Inspected today';
    if (days === 1) return 'Inspected yesterday';
    return `Inspected ${days} days ago`;
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

      {/* Map placeholder - will show location if coordinates are set */}
      {site.latitude !== null && site.longitude !== null && (
        <Card title="Location Map" style={{ marginTop: 16 }}>
          <div
            style={{
              height: 300,
              backgroundColor: '#f0f0f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
            }}
          >
            <Text type="secondary">
              <EnvironmentOutlined style={{ fontSize: 24, marginRight: 8 }} />
              Map will be displayed here ({site.latitude.toFixed(4)}, {site.longitude.toFixed(4)})
            </Text>
          </div>
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
                    <Badge
                      dot
                      status={hive.status === 'healthy' ? 'success' : hive.status === 'needs_attention' ? 'warning' : 'default'}
                      offset={[-4, 4]}
                    >
                      <div style={{
                        width: 48,
                        height: 48,
                        display: 'flex',
                        flexDirection: 'column-reverse',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        padding: 4,
                        backgroundColor: 'rgba(247, 164, 45, 0.1)',
                        borderRadius: 6,
                      }}>
                        {/* Mini hive visualization */}
                        {Array.from({ length: Math.min(hive.brood_boxes, 2) }).map((_, i) => (
                          <div
                            key={`b-${i}`}
                            style={{
                              width: 28,
                              height: 8,
                              backgroundColor: colors.brownBramble,
                              borderRadius: 2,
                              marginTop: i > 0 ? 1 : 0,
                            }}
                          />
                        ))}
                        {Array.from({ length: Math.min(hive.honey_supers, 2) }).map((_, i) => (
                          <div
                            key={`s-${i}`}
                            style={{
                              width: 28,
                              height: 6,
                              backgroundColor: colors.seaBuckthorn,
                              borderRadius: 2,
                              marginTop: 1,
                            }}
                          />
                        ))}
                        <div
                          style={{
                            width: 32,
                            height: 4,
                            backgroundColor: colors.brownBramble,
                            borderRadius: '2px 2px 0 0',
                            marginTop: 1,
                          }}
                        />
                      </div>
                    </Badge>
                  }
                  title={
                    <Space wrap>
                      {hive.name}
                      <Tag>
                        {hive.brood_boxes}B / {hive.honey_supers}S
                      </Tag>
                      {getStatusBadge(hive)}
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
