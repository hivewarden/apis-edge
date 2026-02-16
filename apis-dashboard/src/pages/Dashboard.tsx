import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Typography, Row, Col, Empty, Spin, Button, message, Divider, Select, Alert, Card, Badge, Space } from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  TrophyOutlined,
  ApiOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { TodayActivityCard } from '../components/TodayActivityCard';
import { WeatherCard } from '../components/WeatherCard';
import { TimeRangeSelector } from '../components/TimeRangeSelector';
import { BeeBrainCard } from '../components/BeeBrainCard';
import { SyncStatus } from '../components/SyncStatus';
import { ProactiveInsightBanner } from '../components/ProactiveInsightBanner';
import { OverwinteringPrompt } from '../components/OverwinteringPrompt';
import { ActivityFeedCard } from '../components/ActivityFeedCard';
import { TimeRangeProvider } from '../context';
import { colors } from '../theme/apisTheme';
import { getLastSyncTime, calculateStorageSize } from '../services/offlineCache';
import { useRecapTime, useSites, useUnits, useAuth } from '../hooks';
import { POLL_INTERVAL_MS } from '../constants';

// LAZY LOADED CHART AND MAP COMPONENTS
// These import heavy dependencies (@ant-design/charts ~150KB, leaflet ~50KB)
// Using lazy wrappers keeps them out of the initial bundle
import {
  ActivityClockCardLazy as ActivityClockCard,
  TemperatureCorrelationCardLazy as TemperatureCorrelationCard,
  TrendChartCardLazy as TrendChartCard,
  NestEstimatorCardLazy as NestEstimatorCard,
} from '../components/lazy';

const { Title, Text, Paragraph } = Typography;

/**
 * Dashboard Page
 *
 * Main landing page showing overview of APIS system status.
 * Displays:
 * - Site selector for filtering data
 * - Time range selector for filtering detection data (Epic 3, Story 3.4)
 * - Today's activity card with detection stats (Epic 3, Story 3.2)
 * - Weather card showing current conditions (Epic 3, Story 3.3)
 * - Activity clock showing hourly patterns (Epic 3, Story 3.5)
 * - Temperature correlation scatter plot (Epic 3, Story 3.6)
 * - Trend chart showing detection trends over time (Epic 3, Story 3.7)
 * - Unit status cards with auto-refresh every 30 seconds
 *
 * Part of Epic 2, Story 2.4 (base), Epic 3, Stories 3.1-3.7
 * Refactored for Layered Hooks Architecture
 */
function DashboardContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Site selection state
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(
    searchParams.get('site_id')
  );

  // SECURITY (S5-L1): Get user name from auth context instead of hardcoded value
  const { user } = useAuth();

  // Use hooks for data fetching
  const { sites, loading: sitesLoading } = useSites();
  const { units, loading: unitsLoading, refetch: refetchUnits } = useUnits(selectedSiteId);

  // Manual refresh state
  const [refreshing, setRefreshing] = useState(false);

  // Offline sync status (Epic 7, Story 7.2)
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [storageMB, setStorageMB] = useState(0);

  // Season recap prompt (Epic 9, Story 9.4)
  const { isRecapTime, currentSeason } = useRecapTime('northern');
  const [recapBannerDismissed, setRecapBannerDismissed] = useState(false);

  // Auto-select first site on initial load only (when no URL param exists)
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!hasInitialized.current && !selectedSiteId && sites.length > 0 && !sitesLoading) {
      hasInitialized.current = true;
      const firstSiteId = sites[0].id;
      setSelectedSiteId(firstSiteId);
      setSearchParams({ site_id: firstSiteId });
    }
  }, [sites, selectedSiteId, sitesLoading, setSearchParams]);

  // Load offline sync status
  useEffect(() => {
    const loadSyncStatus = async () => {
      const [syncTime, storage] = await Promise.all([
        getLastSyncTime(),
        calculateStorageSize(),
      ]);
      setLastSynced(syncTime);
      setStorageMB(storage);
    };
    loadSyncStatus();
  }, []);

  // Polling for units - set up interval for auto-refresh
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    // Set up polling interval
    pollIntervalRef.current = setInterval(() => {
      refetchUnits();
    }, POLL_INTERVAL_MS);

    // Cleanup on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [refetchUnits]);

  const handleSiteChange = (siteId: string | undefined) => {
    setSelectedSiteId(siteId ?? null);
    // Preserve existing params (range, date) when changing site
    const newParams = new URLSearchParams(searchParams);
    if (siteId) {
      newParams.set('site_id', siteId);
    } else {
      newParams.delete('site_id');
    }
    setSearchParams(newParams, { replace: true });
  };

  const handleUnitClick = (id: string) => {
    navigate(`/units/${id}`);
  };

  const handleRegisterUnit = () => {
    navigate('/units/register');
  };

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchUnits();
    } catch {
      message.error('Failed to refresh units');
    } finally {
      setRefreshing(false);
    }
  }, [refetchUnits]);

  const selectedSite = sites.find((s) => s.id === selectedSiteId);

  // Get user name from auth context (S5-L1: replaced hardcoded 'Sam')
  const userName = user?.name || 'Beekeeper';

  return (
    <div>
      {/* Header per mockup: Welcome greeting + site/time selectors */}
      <header style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        marginBottom: 24,
      }}>
        <div>
          <Title
            level={2}
            style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: '-0.03em',
              color: colors.brownBramble,
            }}
          >
            Welcome back, {userName}
          </Title>
          <Paragraph style={{ margin: 0, marginTop: 4, color: '#8a5025', fontSize: 14 }}>
            Here is your apiary overview for today.
          </Paragraph>
        </div>

        {/* Site + Time range selector row per mockup */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#ffffff',
          padding: '6px 16px',
          borderRadius: 9999,
          boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
          border: '1px solid #ece8d6',
          flexShrink: 0,
        }}>
          {/* Site selector */}
          <Select
            placeholder="All Sites"
            loading={sitesLoading}
            value={selectedSiteId}
            onChange={handleSiteChange}
            allowClear
            style={{ minWidth: 180 }}
            bordered={false}
            options={sites.map((site) => ({
              value: site.id,
              label: site.name,
            }))}
          />

          {/* Divider */}
          <div style={{ height: 24, width: 1, background: '#ece8d6' }} />

          {/* Time range selector */}
          <TimeRangeSelector />
        </div>

        <SyncStatus
          lastSynced={lastSynced}
          storageUsedMB={storageMB}
          compact
        />
      </header>

      {/* Overwintering Prompt - Story 9.5 - Shows in March (Northern) */}
      <OverwinteringPrompt hemisphere="northern" />

      {/* Season Recap Prompt Banner - Story 9.4 - Shows in November (Northern) */}
      {isRecapTime && !recapBannerDismissed && (
        <Alert
          type="info"
          icon={<TrophyOutlined />}
          message={`Your ${currentSeason} beekeeping season has ended!`}
          description={
            <span>
              Take a moment to review your achievements and create a season recap to share with fellow beekeepers.{' '}
              <Link to="/recap" style={{ fontWeight: 600, color: colors.seaBuckthorn }}>
                View Season Recap
              </Link>
            </span>
          }
          closable
          onClose={() => setRecapBannerDismissed(true)}
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {/* Proactive Insights Banner - Story 8.4 - Positioned at top for visibility */}
      <ProactiveInsightBanner siteId={selectedSiteId} />

      <Divider style={{ margin: '16px 0' }} />

      {/* Detection Activity Section - per mockup: 4-column grid of cards */}
      <div style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <TodayActivityCard siteId={selectedSiteId} />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <WeatherCard
              siteId={selectedSiteId}
              hasGPS={!!(selectedSite?.latitude && selectedSite?.longitude)}
            />
          </Col>
          <Col xs={24} lg={8}>
            {/* Lazy loaded - shows skeleton while chart library loads */}
            <ActivityClockCard siteId={selectedSiteId} />
          </Col>
        </Row>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={12}>
            {/* Lazy loaded - shows skeleton while chart library loads */}
            <TemperatureCorrelationCard siteId={selectedSiteId} />
          </Col>
          <Col xs={24} lg={12}>
            {/* Lazy loaded - shows skeleton while chart library loads */}
            <TrendChartCard siteId={selectedSiteId} />
          </Col>
        </Row>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={12}>
            <BeeBrainCard siteId={selectedSiteId} />
          </Col>
          <Col xs={24} lg={12}>
            {/* Lazy loaded - shows skeleton while leaflet loads */}
            <NestEstimatorCard
              siteId={selectedSiteId}
              latitude={selectedSite?.latitude ?? null}
              longitude={selectedSite?.longitude ?? null}
            />
          </Col>
        </Row>
        {/* Activity Feed Card - Epic 13, Story 13.17 */}
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={12}>
            <ActivityFeedCard siteId={selectedSiteId} limit={5} />
          </Col>
        </Row>
      </div>

      <Divider />

      {/* Units Section */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>Units</Title>
          <div>
            <Button
              icon={<ReloadOutlined spin={refreshing} />}
              onClick={handleManualRefresh}
              disabled={refreshing}
              style={{ marginRight: 8 }}
            >
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleRegisterUnit}
            >
              Register Unit
            </Button>
          </div>
        </div>

        {unitsLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Spin size="large" />
          </div>
        ) : units.length === 0 ? (
          <Empty
            description={selectedSiteId ? "No units at this site" : "No units registered yet"}
            style={{ padding: '48px 0' }}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleRegisterUnit}>
              Register a unit
            </Button>
          </Empty>
        ) : (
          <Row gutter={[16, 16]}>
            {units.map((unit) => {
              const statusBadge = unit.status === 'online'
                ? <Badge status="success" text="Online" />
                : unit.status === 'error'
                  ? <Badge status="error" text="Error" />
                  : <Badge status="default" text="Offline" />;

              const formatLastSeen = (lastSeen: string | null) => {
                if (!lastSeen) return 'Never';
                const date = new Date(lastSeen);
                const now = new Date();
                const diff = now.getTime() - date.getTime();
                const minutes = Math.floor(diff / 60000);
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);
                if (minutes < 1) return 'Just now';
                if (minutes < 60) return `${minutes}m ago`;
                if (hours < 24) return `${hours}h ago`;
                if (days < 7) return `${days}d ago`;
                return date.toLocaleDateString();
              };

              return (
                <Col xs={24} sm={12} lg={8} xl={6} key={unit.id}>
                  <Card
                    onClick={() => handleUnitClick(unit.id)}
                    style={{
                      height: '100%',
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
                            color: colors.seaBuckthorn,
                            fontSize: 20,
                          }}>
                            <ApiOutlined />
                          </div>
                          <Title level={4} style={{ margin: 0 }}>
                            {unit.name || unit.serial}
                          </Title>
                        </Space>
                        {statusBadge}
                      </div>

                      {unit.site_name && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          <EnvironmentOutlined style={{ marginRight: 4 }} />
                          {unit.site_name}
                        </Text>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          <ClockCircleOutlined style={{ marginRight: 4 }} />
                          {formatLastSeen(unit.last_seen)}
                        </Text>
                      </div>
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </div>
    </div>
  );
}

/**
 * Dashboard with TimeRangeProvider wrapper.
 *
 * Wraps the dashboard content in TimeRangeProvider to enable
 * time range selection across all dashboard components.
 */
export function Dashboard() {
  return (
    <TimeRangeProvider>
      <DashboardContent />
    </TimeRangeProvider>
  );
}

export default Dashboard;
