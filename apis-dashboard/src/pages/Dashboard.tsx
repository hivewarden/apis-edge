import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Typography, Row, Col, Empty, Spin, Button, message, Divider, Select } from 'antd';
import { PlusOutlined, ReloadOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { UnitStatusCard, Unit } from '../components/UnitStatusCard';
import { apiClient } from '../providers/apiClient';

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
 * - Unit status cards with auto-refresh every 30 seconds
 *
 * Part of Epic 2, Story 2.4
 */
export function Dashboard() {
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
    if (siteId) {
      setSearchParams({ site_id: siteId });
    } else {
      setSearchParams({});
    }
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
      <Title level={2}>Dashboard</Title>
      <Paragraph>
        Welcome to APIS Dashboard. Your hornet detection and deterrent system overview.
      </Paragraph>

      {/* Site Selector */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <EnvironmentOutlined style={{ fontSize: 18, color: '#f7a42d' }} />
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

export default Dashboard;
