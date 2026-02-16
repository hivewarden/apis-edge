import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  Row,
  Col,
  Space,
  Tag,
  Spin,
  Empty,
  Button,
  Select,
  Switch,
  message,
} from 'antd';
import { CrownOutlined, EnvironmentOutlined, ClockCircleOutlined, EyeInvisibleOutlined, QrcodeOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import { HiveStatusBadge, MiniHiveVisualization } from '../components';
import { LazyQRScannerModal } from '../components/lazy';
import { useQRScanner, useSites, useHivesList } from '../hooks';
import { getLastInspectionText } from '../utils';

const { Title, Text } = Typography;

/**
 * Hives List Page
 *
 * Displays all hives across all sites with filtering options.
 * Part of Epic 5, Story 5.1: Create and Configure Hives
 * Refactored for Layered Hooks Architecture
 */
export function Hives() {
  const navigate = useNavigate();
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [showLostHives, setShowLostHives] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Use hooks for sites
  const { sites, loading: sitesLoading } = useSites();

  // Use hook for hives with site filter
  const { hives, loading: hivesLoading, refetch } = useHivesList(
    selectedSiteId,
    { activeOnly: !showLostHives }
  );

  // Refetch hives when showLostHives changes
  useEffect(() => {
    refetch();
  }, [showLostHives, refetch]);

  // QR Scanner state - Epic 7, Story 7.6
  const { isSupported: qrSupported, isOpen: qrScannerOpen, openScanner, closeScanner } = useQRScanner();

  const getSiteName = useCallback((siteId: string): string => {
    const site = sites.find((s) => s.id === siteId);
    return site?.name || 'Unknown Site';
  }, [sites]);

  const loading = sitesLoading || hivesLoading;

  // Compute status counts from hive data
  const statusCounts = useMemo(() => {
    const counts = { healthy: 0, needs_attention: 0, needs_inspection: 0, critical: 0 };
    hives.forEach((hive) => {
      const s = hive.status as keyof typeof counts;
      if (s in counts) counts[s]++;
    });
    return counts;
  }, [hives]);

  // Filter hives by status
  const filteredHives = useMemo(() => {
    if (statusFilter === 'all') return hives;
    return hives.filter((hive) => hive.status === statusFilter);
  }, [hives, statusFilter]);

  // Get selected site name for header
  const selectedSiteName = selectedSiteId
    ? sites.find((s) => s.id === selectedSiteId)?.name
    : null;

  return (
    <div>
      {/* Header per mockup: breadcrumb + title + filter tabs + add button */}
      <header style={{ marginBottom: 24 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 12, color: '#8c7e72', marginBottom: 4 }}>
          <span>Apiaries</span>
          <span style={{ margin: '0 8px' }}>/</span>
          <span style={{ color: colors.seaBuckthorn }}>{selectedSiteName || 'All Sites'}</span>
        </div>

        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Title
            level={2}
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: '-0.03em',
              color: colors.brownBramble,
              flex: '1 1 auto',
              minWidth: 0,
            }}
          >
            Hives at {selectedSiteName || 'All Apiaries'}
          </Title>

          <Space size={12} style={{ flex: '0 0 auto' }}>
            {/* Site filter */}
            <Select
              placeholder="All Sites"
              allowClear
              style={{ minWidth: 150 }}
              value={selectedSiteId}
              onChange={setSelectedSiteId}
              loading={sitesLoading}
              bordered={false}
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
            />

            {/* Add Hive button per mockup */}
            <Button
              type="primary"
              onClick={() => {
                if (selectedSiteId) {
                  navigate(`/sites/${selectedSiteId}/hives/create`);
                } else if (sites.length === 1) {
                  navigate(`/sites/${sites[0].id}/hives/create`);
                } else {
                  message.info('Please select a site first');
                }
              }}
              style={{
                borderRadius: 9999,
                height: 40,
                paddingLeft: 20,
                paddingRight: 20,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Add Hive
            </Button>
          </Space>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: `All Hives (${hives.length})` },
            { key: 'healthy', label: `Healthy (${statusCounts.healthy})` },
            { key: 'needs_attention', label: `Needs Attention (${statusCounts.needs_attention})` },
            { key: 'needs_inspection', label: `Needs Inspection (${statusCounts.needs_inspection})` },
            { key: 'critical', label: `Critical (${statusCounts.critical})` },
          ].map((tab) => {
            const isActive = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 9999,
                  border: 'none',
                  background: isActive ? colors.salomie : 'transparent',
                  color: isActive ? colors.brownBramble : '#8c7e72',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Lost hives toggle and QR scanner */}
        <Space size={16}>
          {qrSupported && (
            <Button
              icon={<QrcodeOutlined />}
              onClick={openScanner}
              style={{ height: 40 }}
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
        </Space>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : filteredHives.length > 0 ? (
        <Row gutter={[16, 16]}>
          {filteredHives.map((hive) => {
            const isLost = hive.hive_status === 'lost';
            return (
              <Col xs={24} sm={12} lg={8} xl={6} key={hive.id}>
                <Card
                  onClick={() => navigate(`/hives/${hive.id}`)}
                  style={{
                    height: '100%',
                    opacity: isLost ? 0.7 : 1,
                    borderLeft: `4px solid ${colors.seaBuckthorn}`,
                    boxShadow: '0 1px 3px rgba(102, 38, 4, 0.08)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(247, 162, 43, 0.15)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(102, 38, 4, 0.08)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Space size={8}>
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          backgroundColor: 'rgba(247, 164, 45, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <MiniHiveVisualization
                            broodBoxes={hive.brood_boxes}
                            honeySupers={hive.honey_supers}
                            status={hive.status}
                          />
                        </div>
                        <div>
                          <Text strong style={{ fontSize: 16, color: colors.brownBramble }}>{hive.name}</Text>
                          <div>
                            <Tag style={{
                              margin: 0,
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#8c7e72',
                              backgroundColor: '#f8f7f5',
                              borderColor: 'transparent',
                              borderRadius: 9999,
                            }}>
                              {hive.brood_boxes}B / {hive.honey_supers}S
                            </Tag>
                          </div>
                        </div>
                      </Space>
                      <HiveStatusBadge hive={hive} />
                    </div>

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
                </Card>
              </Col>
            );
          })}
        </Row>
      ) : (
        <Empty
          description={
            statusFilter !== 'all'
              ? `No hives with "${statusFilter.replace('_', ' ')}" status`
              : selectedSiteId
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

      {/* QR Scanner Modal - Epic 7, Story 7.6 (lazy loaded) */}
      <Suspense fallback={null}>
        <LazyQRScannerModal open={qrScannerOpen} onClose={closeScanner} />
      </Suspense>
    </div>
  );
}

export default Hives;
