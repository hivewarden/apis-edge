import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Row,
  Col,
  Empty,
  Spin,
  Space,
  Select,
  DatePicker,
  Button,
  Pagination,
  message,
  Segmented,
} from 'antd';
import {
  FilterOutlined,
  ClearOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { ClipCard, ClipPlayerModal } from '../components';
import { useClips } from '../hooks/useClips';
import { apiClient } from '../providers/apiClient';
import { colors } from '../theme/apisTheme';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface Site {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  name: string;
  site_id: string;
}

interface SitesResponse {
  data: Site[];
}

interface UnitsResponse {
  data: Unit[];
}

/**
 * Clips Page
 *
 * Browse and filter detection video clips from APIS units.
 * Features a honeycomb-inspired grid with warm amber aesthetics.
 *
 * Part of Epic 4, Stories 4.2 & 4.3
 */
export function Clips() {
  const navigate = useNavigate();

  // Sites and units for filter dropdowns
  const [sites, setSites] = useState<Site[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);

  // Filter state
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');

  // Video player modal state
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);

  // Fetch clips using hook
  const {
    clips,
    total,
    page,
    perPage,
    loading,
    error,
    setPage,
    refetch,
  } = useClips({
    siteId: selectedSite,
    unitId: selectedUnit,
    from: dateRange?.[0]?.toDate() || null,
    to: dateRange?.[1]?.toDate() || null,
  });

  // Load sites on mount
  useEffect(() => {
    fetchSites();
  }, []);

  // Load units when site changes
  useEffect(() => {
    if (selectedSite) {
      fetchUnits(selectedSite);
    } else {
      setUnits([]);
      setSelectedUnit(null);
    }
  }, [selectedSite]);

  const fetchSites = async () => {
    try {
      setLoadingSites(true);
      const response = await apiClient.get<SitesResponse>('/sites');
      const siteList = response.data.data || [];
      setSites(siteList);
      // Auto-select first site if available
      if (siteList.length > 0) {
        setSelectedSite(siteList[0].id);
      }
    } catch {
      message.error('Failed to load sites');
    } finally {
      setLoadingSites(false);
    }
  };

  const fetchUnits = async (siteId: string) => {
    try {
      const response = await apiClient.get<UnitsResponse>(`/units?site_id=${siteId}`);
      setUnits(response.data.data || []);
    } catch {
      setUnits([]);
    }
  };

  const handleClipClick = (index: number) => {
    setSelectedClipIndex(index);
  };

  const handleCloseModal = () => {
    setSelectedClipIndex(null);
  };

  const handleNavigateClip = (index: number) => {
    if (index >= 0 && index < clips.length) {
      setSelectedClipIndex(index);
    }
  };

  const handleClearFilters = () => {
    setSelectedUnit(null);
    setDateRange(null);
  };

  const hasActiveFilters = selectedUnit !== null || dateRange !== null;

  // Determine grid columns based on view mode
  const gridCols = useMemo(() => {
    if (viewMode === 'compact') {
      return { xs: 8, sm: 6, md: 4, lg: 3, xl: 2 };
    }
    return { xs: 12, sm: 8, md: 6, lg: 4, xl: 4 };
  }, [viewMode]);

  // Show loading spinner while fetching sites
  if (loadingSites) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 16,
        }}
      >
        <Spin size="large" />
        <Text type="secondary">Loading sites...</Text>
      </div>
    );
  }

  // Show message if no sites exist
  if (sites.length === 0) {
    return (
      <div>
        <PageHeader />
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space direction="vertical" size={4}>
              <Text strong style={{ color: colors.brownBramble }}>No sites configured</Text>
              <Text type="secondary">Create a site first to start recording clips</Text>
            </Space>
          }
          style={{
            marginTop: 80,
            padding: 40,
            background: `linear-gradient(145deg, ${colors.salomie}40 0%, ${colors.coconutCream} 100%)`,
            borderRadius: 16,
            border: `1px dashed ${colors.seaBuckthorn}60`,
          }}
        >
          <Button
            type="primary"
            size="large"
            onClick={() => navigate('/sites/create')}
            style={{
              marginTop: 16,
              background: colors.seaBuckthorn,
              borderColor: colors.seaBuckthorn,
            }}
          >
            Create Site
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div>
      <PageHeader />

      {/* Filter Bar */}
      <div
        style={{
          padding: '16px 20px',
          marginBottom: 24,
          background: `linear-gradient(135deg, ${colors.salomie}60 0%, ${colors.coconutCream} 100%)`,
          borderRadius: 12,
          border: `1px solid ${colors.seaBuckthorn}30`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <FilterOutlined style={{ color: colors.brownBramble, opacity: 0.6 }} />

          {/* Site selector (only show if multiple sites) */}
          {sites.length > 1 && (
            <Select
              placeholder="Select site"
              value={selectedSite}
              onChange={setSelectedSite}
              style={{ width: 180 }}
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
            />
          )}

          {/* Unit selector */}
          <Select
            placeholder="All units"
            value={selectedUnit}
            onChange={setSelectedUnit}
            allowClear
            style={{ width: 160 }}
            options={units.map((u) => ({ value: u.id, label: u.name }))}
            disabled={!selectedSite}
          />

          {/* Date range picker */}
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null] | null)}
            format="YYYY-MM-DD"
            allowClear
            style={{ borderColor: colors.seaBuckthorn + '40' }}
            presets={[
              { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
              { label: 'Last 7 days', value: [dayjs().subtract(7, 'day'), dayjs()] },
              { label: 'Last 30 days', value: [dayjs().subtract(30, 'day'), dayjs()] },
              { label: 'This month', value: [dayjs().startOf('month'), dayjs()] },
            ]}
          />

          {/* Clear filters button */}
          {hasActiveFilters && (
            <Button
              icon={<ClearOutlined />}
              onClick={handleClearFilters}
              style={{ color: colors.brownBramble }}
            >
              Clear
            </Button>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* View mode toggle */}
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as 'grid' | 'compact')}
            options={[
              { value: 'grid', icon: <AppstoreOutlined /> },
              { value: 'compact', icon: <UnorderedListOutlined /> },
            ]}
            style={{
              background: colors.coconutCream,
            }}
          />
        </div>
      </div>

      {/* Results summary */}
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            color: colors.brownBramble,
            opacity: 0.7,
            fontSize: 14,
          }}
        >
          {loading ? (
            'Loading clips...'
          ) : (
            <>
              Showing <strong>{clips.length}</strong> of <strong>{total}</strong> clips
            </>
          )}
        </Text>
      </div>

      {/* Error state */}
      {error && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Failed to load clips. Please try again."
          style={{
            marginTop: 48,
            padding: 40,
            background: `${colors.salomie}30`,
            borderRadius: 12,
          }}
        >
          <Button onClick={refetch}>Retry</Button>
        </Empty>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 0',
            gap: 16,
          }}
        >
          <Spin size="large" />
          <Text type="secondary">Loading clips...</Text>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && clips.length === 0 && (
        <Empty
          image={
            <VideoCameraOutlined
              style={{
                fontSize: 64,
                color: colors.seaBuckthorn,
                opacity: 0.5,
              }}
            />
          }
          description={
            <Space direction="vertical" size={4}>
              <Text strong style={{ color: colors.brownBramble }}>No clips found</Text>
              <Text type="secondary">
                {hasActiveFilters
                  ? 'Try adjusting your filters'
                  : 'Clips will appear here when detections are recorded'}
              </Text>
            </Space>
          }
          style={{
            marginTop: 48,
            padding: 60,
            background: `linear-gradient(145deg, ${colors.salomie}30 0%, ${colors.coconutCream} 100%)`,
            borderRadius: 16,
            border: `1px dashed ${colors.seaBuckthorn}40`,
          }}
        >
          {hasActiveFilters && (
            <Button
              onClick={handleClearFilters}
              style={{ marginTop: 16, color: colors.brownBramble }}
            >
              Clear filters
            </Button>
          )}
        </Empty>
      )}

      {/* Clips grid */}
      {!loading && !error && clips.length > 0 && (
        <>
          <Row gutter={[16, 16]}>
            {clips.map((clip, index) => (
              <Col {...gridCols} key={clip.id}>
                <ClipCard clip={clip} onClick={() => handleClipClick(index)} />
              </Col>
            ))}
          </Row>

          {/* Pagination */}
          {total > perPage && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginTop: 32,
                paddingTop: 24,
                borderTop: `1px solid ${colors.seaBuckthorn}20`,
              }}
            >
              <Pagination
                current={page}
                total={total}
                pageSize={perPage}
                onChange={setPage}
                showSizeChanger={false}
                showTotal={(t, range) => (
                  <Text style={{ color: colors.brownBramble, opacity: 0.7 }}>
                    {range[0]}-{range[1]} of {t} clips
                  </Text>
                )}
              />
            </div>
          )}
        </>
      )}

      {/* Video Player Modal */}
      <ClipPlayerModal
        open={selectedClipIndex !== null}
        clip={selectedClipIndex !== null ? clips[selectedClipIndex] : null}
        clips={clips}
        currentIndex={selectedClipIndex ?? 0}
        onClose={handleCloseModal}
        onNavigate={handleNavigateClip}
        onDeleteSuccess={refetch}
      />
    </div>
  );
}

/**
 * Page Header Component
 */
function PageHeader() {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${colors.seaBuckthorn} 0%, ${colors.salomie} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 4px 12px ${colors.seaBuckthorn}40`,
          }}
        >
          <VideoCameraOutlined style={{ fontSize: 20, color: 'white' }} />
        </div>
        <Title
          level={2}
          style={{
            margin: 0,
            color: colors.brownBramble,
            fontWeight: 700,
          }}
        >
          Detection Clips
        </Title>
      </div>
      <Text
        style={{
          color: colors.brownBramble,
          opacity: 0.7,
          fontSize: 15,
        }}
      >
        Browse and review video recordings from hornet detection events
      </Text>
    </div>
  );
}

export default Clips;
