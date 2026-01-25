/**
 * Maintenance Page
 *
 * Displays all hives that need attention, ranked by priority.
 * Features:
 * - Priority-sorted list of hives needing maintenance
 * - Site filter dropdown
 * - Batch selection for bulk actions
 * - Empty state when all caught up
 * - Recently completed section
 *
 * Part of Epic 8, Story 8.5: Maintenance Priority View
 */
import { useState, useMemo, useEffect, Component, ReactNode } from 'react';
import {
  Typography,
  Select,
  Checkbox,
  Button,
  Space,
  Result,
  Skeleton,
  Collapse,
  Alert,
  Modal,
} from 'antd';
import {
  CheckCircleOutlined,
  FilterOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { colors } from '../theme/apisTheme';
import { MaintenanceItemCard } from '../components';
import { useMaintenanceItems } from '../hooks';
import { apiClient } from '../providers/apiClient';
import type { MaintenanceItem } from '../hooks/useMaintenanceItems';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Panel } = Collapse;

/**
 * Error Boundary for individual maintenance item cards.
 * Prevents one broken card from crashing the entire list.
 */
interface CardErrorBoundaryProps {
  children: ReactNode;
  itemName: string;
}

interface CardErrorBoundaryState {
  hasError: boolean;
}

class CardErrorBoundary extends Component<CardErrorBoundaryProps, CardErrorBoundaryState> {
  constructor(props: CardErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): CardErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[Maintenance] Card rendering error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Alert
          type="warning"
          message={`Failed to render: ${this.props.itemName}`}
          description="This maintenance item could not be displayed."
          style={{ marginBottom: 12 }}
          showIcon
        />
      );
    }
    return this.props.children;
  }
}

/**
 * Site interface for the filter dropdown.
 */
interface Site {
  id: string;
  name: string;
}

/**
 * Maintenance page component.
 *
 * Displays a prioritized list of hives that need attention,
 * with options for filtering by site and batch actions.
 */
export function Maintenance() {
  const navigate = useNavigate();

  // Site filter state
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  // Sites for filter dropdown
  const [sites, setSites] = useState<Site[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);

  // Batch selection state
  const [selectedHiveIds, setSelectedHiveIds] = useState<Set<string>>(new Set());

  // Batch treatment modal state
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);

  // Fetch maintenance items
  const { data, loading, error, refetch } = useMaintenanceItems(selectedSiteId);

  // Fetch sites for filter dropdown
  useEffect(() => {
    const fetchSites = async () => {
      try {
        const response = await apiClient.get<{ data: Site[] }>('/sites');
        setSites(response.data.data || []);
      } catch (err) {
        console.error('Failed to fetch sites:', err);
      } finally {
        setSitesLoading(false);
      }
    };
    fetchSites();
  }, []);

  // Derive select all state
  const allSelected = useMemo(() => {
    if (!data?.items.length) return false;
    return data.items.every((item) => selectedHiveIds.has(item.hive_id));
  }, [data?.items, selectedHiveIds]);

  const someSelected = useMemo(() => {
    if (!data?.items.length) return false;
    return data.items.some((item) => selectedHiveIds.has(item.hive_id));
  }, [data?.items, selectedHiveIds]);

  // Handle site filter change
  const handleSiteChange = (value: string | null) => {
    setSelectedSiteId(value || null);
    setSelectedHiveIds(new Set()); // Clear selection on filter change
  };

  // Handle individual item selection
  const handleSelectionChange = (hiveId: string, selected: boolean) => {
    setSelectedHiveIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(hiveId);
      } else {
        next.delete(hiveId);
      }
      return next;
    });
  };

  // Handle select all
  const handleSelectAll = (e: { target: { checked: boolean } }) => {
    if (!data?.items) return;

    if (e.target.checked) {
      setSelectedHiveIds(new Set(data.items.map((item) => item.hive_id)));
    } else {
      setSelectedHiveIds(new Set());
    }
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedHiveIds(new Set());
  };

  // Open batch treatment modal
  const handleBatchTreatment = () => {
    setTreatmentModalOpen(true);
  };

  // Handle batch treatment submit
  const handleTreatmentSubmit = async () => {
    // Navigate to first selected hive's treatment tab
    // In a real implementation, this could create treatments for all selected hives
    const firstHiveId = Array.from(selectedHiveIds)[0];
    if (firstHiveId) {
      navigate(`/hives/${firstHiveId}`, { state: { activeTab: 'treatments' } });
    }
    setTreatmentModalOpen(false);
    handleClearSelection();
  };

  // Format completion date
  const formatCompletedAt = (dateStr: string) => {
    const date = dayjs(dateStr);
    const now = dayjs();

    if (date.isSame(now, 'day')) {
      return 'Today';
    } else if (date.isSame(now.subtract(1, 'day'), 'day')) {
      return 'Yesterday';
    } else {
      return date.format('MMM D');
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Skeleton.Input active style={{ width: 150, height: 32 }} />
          <Skeleton.Input active style={{ width: 200, height: 32 }} />
        </div>
        <Skeleton active paragraph={{ rows: 4 }} />
        <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 16 }} />
        <Skeleton active paragraph={{ rows: 4 }} style={{ marginTop: 16 }} />
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <Result
        status="error"
        title="Failed to Load Maintenance Items"
        subTitle={error.message}
        extra={
          <Button type="primary" onClick={() => refetch()}>
            Try Again
          </Button>
        }
      />
    );
  }

  // Render empty state (all caught up)
  if (data?.all_caught_up) {
    return (
      <div>
        {/* Header with site filter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ margin: 0 }}>
            Maintenance
          </Title>
          <Select
            placeholder="Filter by site"
            allowClear
            style={{ width: 200 }}
            value={selectedSiteId}
            onChange={handleSiteChange}
            loading={sitesLoading}
            suffixIcon={<FilterOutlined />}
            options={sites.map((site) => ({
              value: site.id,
              label: site.name,
            }))}
          />
        </div>

        <Result
          icon={<CheckCircleOutlined style={{ color: colors.success }} />}
          title="All caught up!"
          subTitle="No maintenance needed. All your hives are in good shape."
          extra={
            <Button type="primary" onClick={() => navigate('/hives')}>
              View All Hives
            </Button>
          }
        />

        {/* Recently completed section */}
        {data.recently_completed.length > 0 && (
          <Collapse ghost style={{ marginTop: 24 }}>
            <Panel
              header={`Recently Completed (${data.recently_completed.length})`}
              key="recently-completed"
            >
              {data.recently_completed.map((item, index) => (
                <div
                  key={`${item.hive_id}-${index}`}
                  style={{
                    padding: '8px 0',
                    borderBottom: index < data.recently_completed.length - 1 ? `1px solid ${colors.border}` : 'none',
                  }}
                >
                  <Text style={{ textDecoration: 'line-through', color: colors.textMuted }}>
                    {item.hive_name}: {item.action}
                  </Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    ({formatCompletedAt(item.completed_at)})
                  </Text>
                </div>
              ))}
            </Panel>
          </Collapse>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header with title and site filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>
          Maintenance
        </Title>
        <Select
          placeholder="Filter by site"
          allowClear
          style={{ width: 200 }}
          value={selectedSiteId}
          onChange={handleSiteChange}
          loading={sitesLoading}
          suffixIcon={<FilterOutlined />}
          options={sites.map((site) => ({
            value: site.id,
            label: site.name,
          }))}
        />
      </div>

      {/* Batch selection toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: selectedHiveIds.size > 0 ? colors.hoverOverlay : 'transparent',
          borderRadius: 8,
          marginBottom: 16,
          transition: 'background-color 0.2s',
        }}
      >
        <Space>
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onChange={handleSelectAll}
          >
            Select All
          </Checkbox>
          {selectedHiveIds.size > 0 && (
            <Text strong>{selectedHiveIds.size} items selected</Text>
          )}
        </Space>

        {selectedHiveIds.size > 0 && (
          <Space>
            <Button
              type="primary"
              onClick={handleBatchTreatment}
            >
              Log Treatment for Selected
            </Button>
            <Button
              icon={<ClearOutlined />}
              onClick={handleClearSelection}
            >
              Clear Selection
            </Button>
          </Space>
        )}
      </div>

      {/* Info alert about total items */}
      <Alert
        type="info"
        showIcon
        message={`${data?.total_count || 0} hive${(data?.total_count || 0) !== 1 ? 's' : ''} need${(data?.total_count || 0) === 1 ? 's' : ''} attention`}
        style={{ marginBottom: 16 }}
      />

      {/* Maintenance items list */}
      <div>
        {data?.items.map((item: MaintenanceItem) => (
          <CardErrorBoundary key={item.hive_id} itemName={item.hive_name || item.hive_id}>
            <MaintenanceItemCard
              item={item}
              selected={selectedHiveIds.has(item.hive_id)}
              onSelectionChange={handleSelectionChange}
            />
          </CardErrorBoundary>
        ))}
      </div>

      {/* Recently completed section */}
      {data?.recently_completed && data.recently_completed.length > 0 && (
        <Collapse ghost style={{ marginTop: 24 }}>
          <Panel
            header={`Recently Completed (${data.recently_completed.length})`}
            key="recently-completed"
          >
            {data.recently_completed.map((item, index) => (
              <div
                key={`${item.hive_id}-${index}`}
                style={{
                  padding: '8px 0',
                  borderBottom: index < data.recently_completed.length - 1 ? `1px solid ${colors.border}` : 'none',
                }}
              >
                <Text style={{ textDecoration: 'line-through', color: colors.textMuted }}>
                  {item.hive_name}: {item.action}
                </Text>
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  ({formatCompletedAt(item.completed_at)})
                </Text>
              </div>
            ))}
          </Panel>
        </Collapse>
      )}

      {/* Batch treatment modal */}
      <Modal
        title={`Log Treatment for ${selectedHiveIds.size} Hive${selectedHiveIds.size !== 1 ? 's' : ''}`}
        open={treatmentModalOpen}
        onOk={handleTreatmentSubmit}
        onCancel={() => setTreatmentModalOpen(false)}
        okText="Go to First Hive"
      >
        <Text>
          You have selected {selectedHiveIds.size} hive{selectedHiveIds.size !== 1 ? 's' : ''} for treatment.
          Click "Go to First Hive" to navigate to the treatment form for the first selected hive.
        </Text>
        <br /><br />
        <Text type="secondary">
          Tip: After logging the treatment, use the browser back button to return and select the next hive.
        </Text>
      </Modal>
    </div>
  );
}

export default Maintenance;
