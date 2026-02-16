import { useState, useMemo } from 'react';
import { Table, Button, Tag, Space, message, Tooltip, Typography, Collapse } from 'antd';
import { DownloadOutlined, EyeOutlined, CheckCircleOutlined, CloseCircleOutlined, QuestionCircleOutlined, AppstoreOutlined, HistoryOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { InspectionDetailModal } from './InspectionDetailModal';
import { OfflineInspectionBadge } from './OfflineInspectionBadge';
import { ActivityLogItem } from './ActivityLogItem';
import { colors } from '../theme/apisTheme';
import { db } from '../services/db';
import type { PendingInspection } from '../services/db';
import { useInspectionsList, useHiveActivity, type Inspection, type InspectionFrameData } from '../hooks';

const { Text } = Typography;

type FrameData = InspectionFrameData;

interface InspectionHistoryProps {
  hiveId: string;
  hiveName: string;
}

const formatBoolean = (value: boolean | null): React.ReactNode => {
  if (value === null) return <QuestionCircleOutlined style={{ color: '#999' }} />;
  return value ? (
    <CheckCircleOutlined style={{ color: '#52c41a' }} />
  ) : (
    <CloseCircleOutlined style={{ color: '#999' }} />
  );
};

/**
 * Format frame data as a compact summary: "6B/4H/2P" for brood/honey/pollen totals
 * Part of Story 5.5: Frame-Level Data Tracking - AC#4 frame progression visibility
 */
const formatFrameSummary = (frames: FrameData[] | undefined): React.ReactNode => {
  if (!frames || frames.length === 0) {
    return <QuestionCircleOutlined style={{ color: '#999' }} />;
  }

  // Sum up frame counts across all boxes
  const totals = frames.reduce(
    (acc, frame) => ({
      brood: acc.brood + frame.brood_frames,
      honey: acc.honey + frame.honey_frames,
      pollen: acc.pollen + frame.pollen_frames,
    }),
    { brood: 0, honey: 0, pollen: 0 }
  );

  return (
    <Tooltip title={`${frames.length} box${frames.length > 1 ? 'es' : ''}: ${totals.brood} brood, ${totals.honey} honey, ${totals.pollen} pollen`}>
      <Space size={4}>
        <AppstoreOutlined style={{ color: colors.brownBramble }} />
        <span style={{ fontSize: 12 }}>
          {totals.brood}B/{totals.honey}H/{totals.pollen}P
        </span>
      </Space>
    </Tooltip>
  );
};

/**
 * Convert a PendingInspection from IndexedDB to the Inspection interface
 */
function convertOfflineToInspection(pending: PendingInspection): Inspection {
  // Parse issues from JSON string if stored that way
  let issues: string[] = [];
  if (pending.issues) {
    try {
      issues = JSON.parse(pending.issues);
    } catch {
      issues = [pending.issues];
    }
  }

  return {
    id: pending.id,
    hive_id: pending.hive_id,
    inspected_at: pending.date,
    queen_seen: pending.queen_seen,
    eggs_seen: pending.eggs_seen,
    queen_cells: pending.queen_cells > 0,
    brood_frames: pending.brood_frames,
    brood_pattern: pending.brood_pattern,
    honey_level: pending.honey_stores,
    pollen_level: pending.pollen_stores,
    temperament: pending.temperament,
    issues,
    notes: pending.notes,
    created_at: pending.created_at,
    updated_at: pending.updated_at,
    pending_sync: true,
    local_id: pending.local_id,
    sync_error: pending.sync_error,
  };
}

/**
 * Inspection history table component with pagination, sorting, and export.
 *
 * Part of Epic 5, Story 5.4: Inspection History View
 * Enhanced in Story 7.3 to show offline inspections
 * Enhanced in Story 14.13 to show task completion activity
 * Refactored for Layered Hooks Architecture
 */
export function InspectionHistory({ hiveId, hiveName }: InspectionHistoryProps) {
  // Use hook for server inspections
  const {
    inspections: serverInspections,
    total,
    page,
    pageSize,
    sortOrder,
    loading,
    error,
    setPage,
    setPageSize,
    setSortOrder,
    exportInspections,
    exporting,
    refetch,
  } = useInspectionsList(hiveId);

  // Use hook for activity log entries (Story 14.13)
  const {
    data: activityEntries,
    loading: activityLoading,
    error: activityError,
  } = useHiveActivity(hiveId, { type: 'task_completion', pageSize: 50 });

  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Show error message if fetch fails
  if (error) {
    message.error('Failed to load inspections');
  }
  if (activityError) {
    // Log but don't block rendering - activity log is supplemental
    console.warn('Failed to load activity log:', activityError);
  }

  // Query offline inspections for this hive reactively
  const offlineInspections = useLiveQuery(
    () => db.inspections
      .filter(i => i.pending_sync === true && i.hive_id === hiveId)
      .toArray(),
    [hiveId]
  );

  // Merge server and offline inspections, sorted by date
  const inspections = useMemo(() => {
    // Filter for pending inspections (those with local_id set)
    const pendingOnly = (offlineInspections || []).filter(
      (i): i is PendingInspection => i.pending_sync === true && i.local_id !== null && i.local_id !== undefined
    );
    const offline = pendingOnly.map(convertOfflineToInspection);
    const merged = [...offline, ...serverInspections];

    // Sort by date
    merged.sort((a, b) => {
      const dateA = new Date(a.inspected_at).getTime();
      const dateB = new Date(b.inspected_at).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return merged;
  }, [serverInspections, offlineInspections, sortOrder]);

  // Calculate offline count for pagination total
  const offlineCount = useMemo(() => {
    return (offlineInspections || []).filter(
      i => i.pending_sync === true && i.local_id !== null && i.local_id !== undefined
    ).length;
  }, [offlineInspections]);

  // Combined total for pagination (server + offline)
  const combinedTotal = useMemo(() => total + offlineCount, [total, offlineCount]);

  const handleExport = async () => {
    try {
      await exportInspections(hiveName);
      message.success('Inspections exported successfully');
    } catch {
      message.error('Failed to export inspections');
    }
  };

  const handleViewDetails = (inspection: Inspection) => {
    setSelectedInspection(inspection);
    setDetailModalOpen(true);
  };

  const columns: ColumnsType<Inspection> = [
    {
      title: 'Date',
      dataIndex: 'inspected_at',
      key: 'inspected_at',
      sorter: true,
      sortOrder: sortOrder === 'desc' ? 'descend' : 'ascend',
      render: (date: string, record: Inspection) => (
        <Space>
          {dayjs(date).format('MMM D, YYYY')}
          {record.pending_sync && record.local_id && (
            <OfflineInspectionBadge
              localId={record.local_id}
              syncError={record.sync_error}
              compact
            />
          )}
        </Space>
      ),
    },
    {
      title: 'Queen',
      key: 'queen',
      width: 80,
      render: (_: unknown, record: Inspection) => (
        <Tooltip title={record.queen_seen === null ? 'Not recorded' : record.queen_seen ? 'Seen' : 'Not seen'}>
          {formatBoolean(record.queen_seen)}
        </Tooltip>
      ),
    },
    {
      title: 'Eggs',
      key: 'eggs',
      width: 80,
      render: (_: unknown, record: Inspection) => (
        <Tooltip title={record.eggs_seen === null ? 'Not recorded' : record.eggs_seen ? 'Seen' : 'Not seen'}>
          {formatBoolean(record.eggs_seen)}
        </Tooltip>
      ),
    },
    {
      title: 'Brood',
      key: 'brood',
      render: (_: unknown, record: Inspection) => {
        const parts = [];
        if (record.brood_frames != null) {
          parts.push(`${record.brood_frames} frames`);
        }
        if (record.brood_pattern) {
          parts.push(
            <Tag
              key="pattern"
              color={
                record.brood_pattern === 'good'
                  ? 'success'
                  : record.brood_pattern === 'spotty'
                  ? 'warning'
                  : 'error'
              }
            >
              {record.brood_pattern}
            </Tag>
          );
        }
        return parts.length > 0 ? <Space>{parts}</Space> : '-';
      },
    },
    {
      title: 'Stores',
      key: 'stores',
      render: (_: unknown, record: Inspection) => {
        const tags = [];
        if (record.honey_level) {
          tags.push(
            <Tag key="honey" color="gold">
              H: {record.honey_level}
            </Tag>
          );
        }
        if (record.pollen_level) {
          tags.push(
            <Tag key="pollen" color="orange">
              P: {record.pollen_level}
            </Tag>
          );
        }
        return tags.length > 0 ? <Space size={4}>{tags}</Space> : '-';
      },
    },
    {
      title: 'Frames',
      key: 'frames',
      width: 100,
      render: (_: unknown, record: Inspection) => formatFrameSummary(record.frames),
    },
    {
      title: 'Issues',
      key: 'issues',
      render: (_: unknown, record: Inspection) =>
        record.issues.length > 0 ? (
          <Tag color="warning">{record.issues.length}</Tag>
        ) : (
          <Tag color="success">None</Tag>
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 56,
      render: (_: unknown, record: Inspection) => (
        <Button
          type="default"
          shape="circle"
          icon={<EyeOutlined style={{ fontSize: 14 }} />}
          onClick={() => handleViewDetails(record)}
          style={{
            minWidth: 36,
            width: 36,
            height: 36,
            color: '#9d7a48',
            borderColor: 'rgba(157, 122, 72, 0.45)',
            backgroundColor: 'rgba(157, 122, 72, 0.1)',
          }}
        />
      ),
    },
  ];

  // Recent activity entries for display
  const recentActivity = useMemo(() => {
    if (!activityEntries || activityEntries.length === 0) return [];
    // Show most recent 10 activity entries
    return activityEntries.slice(0, 10);
  }, [activityEntries]);

  return (
    <div>
      {/* Activity Log Section - Story 14.13 */}
      {recentActivity.length > 0 && (
        <Collapse
          ghost
          defaultActiveKey={[]}
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'activity',
              label: (
                <Space>
                  <HistoryOutlined style={{ color: colors.brownBramble }} />
                  <Text strong style={{ color: colors.brownBramble }}>
                    Recent Task Completions ({recentActivity.length})
                  </Text>
                </Space>
              ),
              children: (
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {activityLoading ? (
                    <Text type="secondary">Loading activity...</Text>
                  ) : (
                    recentActivity.map((entry) => (
                      <ActivityLogItem key={entry.id} entry={entry} />
                    ))
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button
          icon={<DownloadOutlined />}
          onClick={handleExport}
          loading={exporting}
          disabled={combinedTotal === 0}
        >
          Export CSV
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={inspections}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total: combinedTotal,
          showSizeChanger: true,
          showTotal: (t) => `${t} inspection${t !== 1 ? 's' : ''}${offlineCount > 0 ? ` (${offlineCount} pending sync)` : ''}`,
          onChange: (newPage, newPageSize) => {
            if (newPageSize !== pageSize) {
              setPageSize(newPageSize);
            } else {
              setPage(newPage);
            }
          },
        }}
        onChange={(_pagination, _filters, sorter) => {
          // Handle server-side sorting
          if (!Array.isArray(sorter) && sorter.field === 'inspected_at') {
            const newOrder = sorter.order === 'ascend' ? 'asc' : 'desc';
            if (newOrder !== sortOrder) {
              setSortOrder(newOrder);
            }
          }
        }}
        size="middle"
        style={{ backgroundColor: colors.coconutCream }}
      />

      <InspectionDetailModal
        inspection={selectedInspection}
        open={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedInspection(null);
        }}
        onDeleted={refetch}
      />
    </div>
  );
}

export default InspectionHistory;
