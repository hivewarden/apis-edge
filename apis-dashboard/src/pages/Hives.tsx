import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  List,
  Space,
  Tag,
  Spin,
  Empty,
  Button,
  Select,
  Badge,
  Switch,
} from 'antd';
import { CrownOutlined, EnvironmentOutlined, ClockCircleOutlined, WarningOutlined, EyeInvisibleOutlined, QrcodeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { apiClient } from '../providers/apiClient';
import { colors, touchTargets } from '../theme/apisTheme';
import { LostHiveBadge, QRScannerModal } from '../components';
import { useQRScanner } from '../hooks';

const { Title, Text } = Typography;

interface Site {
  id: string;
  name: string;
}

interface LossSummary {
  cause: string;
  cause_display: string;
  discovered_at: string;
}

interface Hive {
  id: string;
  site_id: string;
  name: string;
  queen_introduced_at: string | null;
  queen_source: string | null;
  queen_age_display: string | null;
  brood_boxes: number;
  honey_supers: number;
  last_inspection_at: string | null;
  last_inspection_issues: string[] | null;
  status: 'healthy' | 'needs_attention' | 'unknown' | 'lost';
  hive_status: 'active' | 'lost' | 'archived';
  lost_at: string | null;
  loss_summary: LossSummary | null;
}

interface HivesResponse {
  data: Hive[];
  meta: { total: number };
}

interface SitesResponse {
  data: Site[];
  meta: { total: number };
}

/**
 * Hives List Page
 *
 * Displays all hives across all sites with filtering options.
 * Part of Epic 5, Story 5.1: Create and Configure Hives
 */
export function Hives() {
  const navigate = useNavigate();
  const [hives, setHives] = useState<Hive[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [showLostHives, setShowLostHives] = useState(false);

  // QR Scanner state - Epic 7, Story 7.6
  const { isSupported: qrSupported, isOpen: qrScannerOpen, openScanner, closeScanner } = useQRScanner();

  const fetchSites = useCallback(async () => {
    try {
      const response = await apiClient.get<SitesResponse>('/sites');
      setSites(response.data.data || []);
    } catch {
      setSites([]);
    }
  }, []);

  const fetchHives = useCallback(async () => {
    try {
      setLoading(true);
      let url = selectedSiteId ? `/hives?site_id=${selectedSiteId}` : '/hives';
      if (showLostHives) {
        url += url.includes('?') ? '&include_lost=true' : '?include_lost=true';
      }
      const response = await apiClient.get<HivesResponse>(url);
      setHives(response.data.data || []);
    } catch {
      setHives([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId, showLostHives]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  useEffect(() => {
    fetchHives();
  }, [fetchHives]);

  const getSiteName = (siteId: string): string => {
    const site = sites.find((s) => s.id === siteId);
    return site?.name || 'Unknown Site';
  };

  const getStatusBadge = (hive: Hive) => {
    // Check if hive is lost first
    if (hive.hive_status === 'lost' && hive.lost_at) {
      return <LostHiveBadge lostAt={hive.lost_at} />;
    }
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>All Hives</Title>
        <Space>
          {/* QR Scanner Button - Epic 7, Story 7.6 */}
          {qrSupported && (
            <Button
              icon={<QrcodeOutlined />}
              onClick={openScanner}
              style={{ minHeight: touchTargets.mobile }}
            >
              Scan QR
            </Button>
          )}
          <Space size={8}>
            <EyeInvisibleOutlined style={{ color: colors.textMuted }} />
            <Switch
              size="small"
              checked={showLostHives}
              onChange={setShowLostHives}
            />
            <span style={{ fontSize: 13, color: colors.textMuted }}>Show lost hives</span>
          </Space>
          <Select
            placeholder="Filter by site"
            allowClear
            style={{ width: 200 }}
            value={selectedSiteId}
            onChange={setSelectedSiteId}
            options={sites.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Space>
      </div>

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
          </div>
        ) : hives.length > 0 ? (
          <List
            dataSource={hives}
            renderItem={(hive) => {
              const isLost = hive.hive_status === 'lost';
              return (
              <List.Item
                style={{
                  cursor: 'pointer',
                  padding: 16,
                  borderRadius: 8,
                  transition: 'background 0.2s',
                  opacity: isLost ? 0.7 : 1,
                  background: isLost ? 'rgba(0, 0, 0, 0.02)' : 'transparent',
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
                      <Space size={4}>
                        <EnvironmentOutlined style={{ color: colors.textMuted }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {getSiteName(hive.site_id)}
                        </Text>
                      </Space>
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
            );
            }}
          />
        ) : (
          <Empty
            description={
              selectedSiteId
                ? 'No hives found at this site'
                : 'No hives found. Add hives from a site detail page.'
            }
          >
            {sites.length > 0 && (
              <Button
                type="primary"
                onClick={() => navigate(`/sites/${sites[0].id}`)}
              >
                Go to Sites
              </Button>
            )}
          </Empty>
        )}
      </Card>

      {/* QR Scanner Modal - Epic 7, Story 7.6 */}
      <QRScannerModal open={qrScannerOpen} onClose={closeScanner} />
    </div>
  );
}

export default Hives;
