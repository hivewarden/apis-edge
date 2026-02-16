/**
 * HiveSeasonSummary Component
 *
 * Displays per-hive breakdown of season statistics.
 * Shows harvest amounts, status badges, and any issues encountered.
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import { Card, Table, Tag, Typography, List, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { colors } from '../theme/apisTheme';
import { HiveSeasonStat, formatHarvestKg, getStatusColor, getStatusLabel } from '../hooks/useSeasonRecap';

const { Text } = Typography;

export interface HiveSeasonSummaryProps {
  stats: HiveSeasonStat[];
  loading?: boolean;
}

/**
 * HiveSeasonSummary displays a table of per-hive statistics for the season.
 */
export function HiveSeasonSummary({ stats, loading = false }: HiveSeasonSummaryProps) {
  if (!stats || stats.length === 0) {
    return (
      <Card title="Per-Hive Breakdown" style={{ marginTop: 16 }}>
        <Empty description="No hive data for this season" />
      </Card>
    );
  }

  const columns: ColumnsType<HiveSeasonStat> = [
    {
      title: 'Hive',
      dataIndex: 'hive_name',
      key: 'hive_name',
      render: (name: string) => (
        <Text strong style={{ color: colors.brownBramble }}>
          {name}
        </Text>
      ),
    },
    {
      title: 'Harvest',
      dataIndex: 'harvest_kg',
      key: 'harvest_kg',
      render: (kg: number) => (
        <Text style={{ color: colors.seaBuckthorn, fontWeight: 600 }}>
          {formatHarvestKg(kg)}
        </Text>
      ),
      sorter: (a, b) => a.harvest_kg - b.harvest_kg,
      defaultSortOrder: 'descend',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: HiveSeasonStat) => (
        <div>
          <Tag color={getStatusColor(status)}>{getStatusLabel(status)}</Tag>
          {record.status_detail && (
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.status_detail}
              </Text>
            </div>
          )}
        </div>
      ),
      filters: [
        { text: 'Healthy', value: 'healthy' },
        { text: 'Treated', value: 'treated' },
        { text: 'New Queen', value: 'new_queen' },
        { text: 'Lost', value: 'lost' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Issues',
      dataIndex: 'issues',
      key: 'issues',
      render: (issues: string[] | undefined) =>
        issues && issues.length > 0 ? (
          <div>
            {issues.slice(0, 2).map((issue, idx) => (
              <Tag key={idx} style={{ marginBottom: 4 }}>
                {issue}
              </Tag>
            ))}
            {issues.length > 2 && (
              <Tag>+{issues.length - 2} more</Tag>
            )}
          </div>
        ) : (
          <Text type="secondary">None</Text>
        ),
    },
  ];

  // Calculate totals
  const totalHarvest = stats.reduce((sum, h) => sum + h.harvest_kg, 0);
  const healthyCount = stats.filter((h) => h.status === 'healthy').length;
  const lostCount = stats.filter((h) => h.status === 'lost').length;

  return (
    <Card
      title="Per-Hive Breakdown"
      style={{ marginTop: 16 }}
      extra={
        <div>
          <Text type="secondary">
            {stats.length} hives | {formatHarvestKg(totalHarvest)} total
          </Text>
        </div>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Tag color="green">{healthyCount} healthy</Tag>
        {lostCount > 0 && <Tag color="red">{lostCount} lost</Tag>}
        {stats.filter((h) => h.status === 'treated').length > 0 && (
          <Tag color="orange">
            {stats.filter((h) => h.status === 'treated').length} treated
          </Tag>
        )}
        {stats.filter((h) => h.status === 'new_queen').length > 0 && (
          <Tag color="blue">
            {stats.filter((h) => h.status === 'new_queen').length} new queen
          </Tag>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={stats}
        rowKey="hive_id"
        loading={loading}
        pagination={stats.length > 10 ? { pageSize: 10 } : false}
        size="small"
        expandable={{
          expandedRowRender: (record) =>
            record.issues && record.issues.length > 2 ? (
              <div style={{ padding: '8px 0' }}>
                <Text strong>All Issues:</Text>
                <List
                  size="small"
                  dataSource={record.issues}
                  renderItem={(issue) => <List.Item>{issue}</List.Item>}
                />
              </div>
            ) : null,
          rowExpandable: (record) =>
            record.issues !== undefined && record.issues.length > 2,
        }}
      />
    </Card>
  );
}

export default HiveSeasonSummary;
