import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Typography, Row, Col, Empty, Spin, Button, message, Divider, Select, Alert } from 'antd';
import { PlusOutlined, ReloadOutlined, EnvironmentOutlined, TrophyOutlined } from '@ant-design/icons';
import { UnitStatusCard, Unit } from '../components/UnitStatusCard';
import { TodayActivityCard } from '../components/TodayActivityCard';
import { WeatherCard } from '../components/WeatherCard';
import { TimeRangeSelector } from '../components/TimeRangeSelector';
import { ActivityClockCard } from '../components/ActivityClockCard';
import { TemperatureCorrelationCard } from '../components/TemperatureCorrelationCard';
import { TrendChartCard } from '../components/TrendChartCard';
import { NestEstimatorCard } from '../components/NestEstimatorCard';
import { BeeBrainCard } from '../components/BeeBrainCard';
import { SyncStatus } from '../components/SyncStatus';
import { ProactiveInsightBanner } from '../components/ProactiveInsightBanner';
import { TimeRangeProvider } from '../context';
import { apiClient } from '../providers/apiClient';
import { colors } from '../theme/apisTheme';
import { getLastSyncTime, calculateStorageSize } from '../services/offlineCache';
import { useRecapTime } from '../hooks/useSeasonRecap';

const { Title, Paragraph } = Typography;

interface Site {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
}

interface SitesResponse {
  data: Site[];
  meta: {
    total: number;
  };
}

interface UnitsResponse {
  data: Unit[];
  meta: {
    total: number;
  };
}

const POLL_INTERVAL_MS = 30000; // 30 seconds

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
 */
function DashboardContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Site selection
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(
    searchParams.get('site_id')
  );
  const [sitesLoading, setSitesLoading] = useState(true);

  // Units
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Offline sync status (Epic 7, Story 7.2)
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [storageMB, setStorageMB] = useState(0);

  // Season recap prompt (Epic 9, Story 9.4)
  const { isRecapTime, currentSeason } = useRecapTime('northern');
  const [recapBannerDismissed, setRecapBannerDismissed] = useState(false);

  // Fetch sites for selector
  const fetchSites = useCallback(async () => {
    try {
      const response = await apiClient.get<SitesResponse>('/sites');
      const sitesData = response.data.data || [];
      setSites(sitesData);

      // If no site selected but sites exist, select the first one
      if (!selectedSiteId && sitesData.length > 0) {
        const firstSiteId = sitesData[0].id;
        setSelectedSiteId(firstSiteId);
        setSearchParams({ site_id: firstSiteId });
      }
    } catch {
      // Sites fetch error is non-critical
    } finally {
      setSitesLoading(false);
    }
  }, [selectedSiteId, setSearchParams]);

  // Fetch units
  const fetchUnits = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      }

      // If a site is selected, filter units by site
      const url = selectedSiteId
        ? `/units?site_id=${selectedSiteId}`
        : '/units';

      const response = await apiClient.get<UnitsResponse>(url);
      setUnits(response.data.data || []);
    } catch {
      // Only show error on manual refresh, not on polling
      if (isRefresh) {
        message.error('Failed to refresh units');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSiteId]);

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

  // Initial fetch
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  useEffect(() => {
    // Reset loading when site changes
    setLoading(true);
    fetchUnits();

    // Set up polling interval
    const interval = setInterval(() => {
      fetchUnits();
    }, POLL_INTERVAL_MS);

    // Cleanup on unmount
    return () => clearInterval(interval);
  }, [fetchUnits]);

  const handleSiteChange = (siteId: string | null) => {
    setSelectedSiteId(siteId);
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

  const handleManualRefresh = () => {
    fetchUnits(true);
  };

  const selectedSite = sites.find((s) => s.id === selectedSiteId);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Title level={2} style={{ margin: 0 }}>Dashboard</Title>
        <SyncStatus
          lastSynced={lastSynced}
          storageUsedMB={storageMB}
          compact
        />
      </div>
      <Paragraph>
        Welcome to APIS Dashboard. Your hornet detection and deterrent system overview.
      </Paragraph>

      {/* Site Selector */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <EnvironmentOutlined style={{ fontSize: 18, color: colors.seaBuckthorn }} />
          <Select
            placeholder="Select a site"
            loading={sitesLoading}
            value={selectedSiteId}
            onChange={handleSiteChange}
            style={{ width: 250 }}
            allowClear
            options={sites.map((site) => ({
              value: site.id,
              label: site.name,
            }))}
          />
          {selectedSite && (
            <Paragraph type="secondary" style={{ margin: 0 }}>
              {selectedSite.latitude && selectedSite.longitude
                ? `${selectedSite.latitude.toFixed(4)}, ${selectedSite.longitude.toFixed(4)}`
                : 'No GPS coordinates'}
            </Paragraph>
          )}
        </div>
      </div>

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

      <Divider />

      {/* Time Range Selector */}
      <div style={{ marginBottom: 16 }}>
        <TimeRangeSelector />
      </div>

      {/* Detection Activity Section */}
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
            <ActivityClockCard siteId={selectedSiteId} />
          </Col>
        </Row>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={12}>
            <TemperatureCorrelationCard siteId={selectedSiteId} />
          </Col>
          <Col xs={24} lg={12}>
            <TrendChartCard siteId={selectedSiteId} />
          </Col>
        </Row>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={12}>
            <BeeBrainCard siteId={selectedSiteId} />
          </Col>
          <Col xs={24} lg={12}>
            <NestEstimatorCard
              siteId={selectedSiteId}
              latitude={selectedSite?.latitude ?? null}
              longitude={selectedSite?.longitude ?? null}
            />
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

        {loading ? (
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
            {units.map((unit) => (
              <Col xs={24} sm={12} lg={8} xl={6} key={unit.id}>
                <UnitStatusCard unit={unit} onClick={handleUnitClick} />
              </Col>
            ))}
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
