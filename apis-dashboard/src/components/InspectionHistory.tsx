import { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Tag, Space, message, Tooltip } from 'antd';
import { DownloadOutlined, EyeOutlined, CheckCircleOutlined, CloseCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { apiClient } from '../providers/apiClient';
import { InspectionDetailModal } from './InspectionDetailModal';
import { OfflineInspectionBadge } from './OfflineInspectionBadge';
import { colors } from '../theme/apisTheme';
import { db } from '../services/db';
import type { PendingInspection } from '../services/db';

interface Inspection {
  id: string;
  hive_id: string;
  inspected_at: string;
  queen_seen: boolean | null;
  eggs_seen: boolean | null;
  queen_cells: boolean | null;
  brood_frames: number | null;
  brood_pattern: string | null;
  honey_level: string | null;
  pollen_level: string | null;
  temperament: string | null;
  issues: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Offline inspection fields
  pending_sync?: boolean;
  local_id?: string | null;
  sync_error?: string | null;
}

interface InspectionsListResponse {
  data: Inspection[];
  meta: { total: number };
}

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
 */
export function InspectionHistory({ hiveId, hiveName }: InspectionHistoryProps) {
  const [serverInspections, setServerInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [exporting, setExporting] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

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

  const fetchInspections = useCallback(async () => {
    try {
      setLoading(true);
      const offset = (page - 1) * pageSize;
      const response = await apiClient.get<InspectionsListResponse>(
        `/hives/${hiveId}/inspections?limit=${pageSize}&offset=${offset}&sort=${sortOrder}`
      );
      setServerInspections(response.data.data);
      setTotal(response.data.meta.total);
    } catch {
      message.error('Failed to load inspections');
    } finally {
      setLoading(false);
    }
  }, [hiveId, page, pageSize, sortOrder]);

  useEffect(() => {
    fetchInspections();
  }, [fetchInspections]);

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await apiClient.get(`/hives/${hiveId}/inspections/export`, {
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${hiveName.replace(/\s+/g, '_')}-inspections.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      message.success('Inspections exported successfully');
    } catch {
      message.error('Failed to export inspections');
    } finally {
      setExporting(false);
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
        if (record.brood_frames !== null) {
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
      width: 80,
      render: (_: unknown, record: Inspection) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetails(record)}
        />
      ),
    },
  ];

  return (
    <div>
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
            setPage(newPage);
            if (newPageSize !== pageSize) {
              setPageSize(newPageSize);
              setPage(1);
            }
          },
        }}
        onChange={(_pagination, _filters, sorter) => {
          // Handle server-side sorting
          if (!Array.isArray(sorter) && sorter.field === 'inspected_at') {
            const newOrder = sorter.order === 'ascend' ? 'asc' : 'desc';
            if (newOrder !== sortOrder) {
              setSortOrder(newOrder);
              setPage(1); // Reset to first page on sort change
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
        onDeleted={fetchInspections}
      />
    </div>
  );
}

export default InspectionHistory;
