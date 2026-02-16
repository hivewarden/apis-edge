/**
 * ConflictResolutionModal Component
 *
 * Modal dialog for resolving sync conflicts between local and server data.
 * Shows a side-by-side diff of the differences and lets the user choose
 * which version to keep.
 *
 * Part of Epic 7, Story 7.4: Automatic Background Sync
 *
 * @module components/ConflictResolutionModal
 */
import React, { useMemo, useState } from 'react';
import { Modal, Button, Typography, Space, Divider, Row, Col, Tabs } from 'antd';
import {
  CloudOutlined,
  MobileOutlined,
  SwapOutlined,
  DiffOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors, touchTargets } from '../theme/apisTheme';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

export interface ConflictResolutionModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Local version of the data */
  localData: Record<string, unknown> | null;
  /** Server version of the data */
  serverData: Record<string, unknown> | null;
  /** Callback when user resolves the conflict */
  onResolve: (choice: 'local' | 'server') => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Whether resolution is in progress */
  isResolving?: boolean;
}

/**
 * Represents a difference between local and server data
 */
interface Difference {
  field: string;
  label: string;
  local: unknown;
  server: unknown;
}

// ============================================================================
// Field Labels
// TODO (S6-L4): FIELD_LABELS and COMPARE_FIELDS are hardcoded for inspections only.
// If task sync ever produces 409 conflicts, these should be made configurable
// via props or extended with task-specific field mappings (e.g., title, priority,
// due_date, assigned_hive, status).
// ============================================================================

const FIELD_LABELS: Record<string, string> = {
  date: 'Inspection Date',
  inspected_at: 'Inspection Date',
  queen_seen: 'Queen Seen',
  eggs_seen: 'Eggs Seen',
  queen_cells: 'Queen Cells',
  brood_frames: 'Brood Frames',
  brood_pattern: 'Brood Pattern',
  honey_stores: 'Honey Stores',
  honey_level: 'Honey Level',
  pollen_stores: 'Pollen Stores',
  pollen_level: 'Pollen Level',
  temperament: 'Temperament',
  issues: 'Issues',
  notes: 'Notes',
  updated_at: 'Last Updated',
  version: 'Version',
};

// Fields to compare (in display order)
const COMPARE_FIELDS = [
  'date',
  'inspected_at',
  'queen_seen',
  'eggs_seen',
  'queen_cells',
  'brood_frames',
  'brood_pattern',
  'honey_stores',
  'honey_level',
  'pollen_stores',
  'pollen_level',
  'temperament',
  'issues',
  'notes',
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a value for display
 */
function formatValue(val: unknown): string {
  if (val === null || val === undefined) {
    return '-';
  }

  if (typeof val === 'boolean') {
    return val ? 'Yes' : 'No';
  }

  if (typeof val === 'string') {
    // Check if it's a date string
    if (val.match(/^\d{4}-\d{2}-\d{2}/)) {
      return dayjs(val).format('MMM D, YYYY');
    }
    // Truncate long strings
    if (val.length > 100) {
      return val.substring(0, 100) + '...';
    }
    return val;
  }

  if (typeof val === 'number') {
    return String(val);
  }

  if (Array.isArray(val)) {
    return val.join(', ') || '-';
  }

  return String(val);
}

/**
 * Find differences between local and server data
 */
function findDifferences(
  local: Record<string, unknown> | null,
  server: Record<string, unknown> | null
): Difference[] {
  if (!local && !server) {
    return [];
  }

  const differences: Difference[] = [];

  for (const field of COMPARE_FIELDS) {
    const localVal = local?.[field];
    const serverVal = server?.[field];

    // Compare stringified versions to handle arrays and objects
    if (JSON.stringify(localVal) !== JSON.stringify(serverVal)) {
      differences.push({
        field,
        label: FIELD_LABELS[field] || field,
        local: localVal,
        server: serverVal,
      });
    }
  }

  return differences;
}

// ============================================================================
// Component
// ============================================================================

/**
 * ConflictResolutionModal - Choose between local and server versions
 *
 * Displays when a sync conflict is detected (HTTP 409). Shows the
 * differences between local and server data side-by-side, allowing
 * the user to choose which version to keep.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { conflicts, resolveConflict } = useBackgroundSync();
 *   const [currentConflict, setCurrentConflict] = useState(conflicts[0]);
 *
 *   return (
 *     <ConflictResolutionModal
 *       visible={!!currentConflict}
 *       localData={currentConflict?.localData}
 *       serverData={currentConflict?.serverData}
 *       onResolve={(choice) => {
 *         resolveConflict(currentConflict.localId, choice);
 *         setCurrentConflict(null);
 *       }}
 *       onCancel={() => setCurrentConflict(null)}
 *     />
 *   );
 * }
 * ```
 */
export function ConflictResolutionModal({
  visible,
  localData,
  serverData,
  onResolve,
  onCancel,
  isResolving = false,
}: ConflictResolutionModalProps): React.ReactElement {
  // Track view mode: 'compare' (side-by-side) or 'diff' (unified diff view)
  const [viewMode, setViewMode] = useState<'compare' | 'diff'>('compare');

  // Calculate differences
  const differences = useMemo(
    () => findDifferences(localData, serverData),
    [localData, serverData]
  );

  return (
    <Modal
      open={visible}
      title={
        <Space>
          <SwapOutlined style={{ color: colors.warning }} />
          <span>Sync Conflict</span>
        </Space>
      }
      onCancel={onCancel}
      footer={null}
      width={640}
      centered
      maskClosable={!isResolving}
      closable={!isResolving}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        This inspection was modified on the server while you were offline.
        Choose which version to keep:
      </Text>

      {differences.length === 0 ? (
        <Text type="secondary" style={{ fontStyle: 'italic' }}>
          No significant differences found. The records appear to be identical.
        </Text>
      ) : (
        <>
          {/* View mode toggle */}
          <div style={{ marginBottom: 16 }}>
            <Tabs
              activeKey={viewMode}
              onChange={(key) => setViewMode(key as 'compare' | 'diff')}
              items={[
                {
                  key: 'compare',
                  label: (
                    <Space>
                      <SwapOutlined />
                      <span>Side by Side</span>
                    </Space>
                  ),
                },
                {
                  key: 'diff',
                  label: (
                    <Space>
                      <DiffOutlined />
                      <span>View Diff</span>
                    </Space>
                  ),
                },
              ]}
              size="small"
            />
          </div>

          {viewMode === 'compare' ? (
            <Row gutter={16}>
              {/* Local version */}
              <Col span={12}>
                <div
                  style={{
                    padding: 16,
                    background: `rgba(247, 164, 45, 0.08)`,
                    borderRadius: 8,
                    border: `2px solid ${colors.seaBuckthorn}`,
                    minHeight: 200,
                  }}
                >
                  <Space style={{ marginBottom: 12 }}>
                    <MobileOutlined style={{ color: colors.seaBuckthorn, fontSize: 18 }} />
                    <Text strong style={{ color: colors.brownBramble }}>
                      Your Version
                    </Text>
                  </Space>
                  <div>
                    {differences.map(diff => (
                      <div key={diff.field} style={{ marginBottom: 12 }}>
                        <Text
                          type="secondary"
                          style={{ fontSize: 11, display: 'block', marginBottom: 2 }}
                        >
                          {diff.label}
                        </Text>
                        <Text style={{ fontSize: 14 }}>
                          {formatValue(diff.local)}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              </Col>

              {/* Server version */}
              <Col span={12}>
                <div
                  style={{
                    padding: 16,
                    background: `rgba(46, 125, 50, 0.08)`,
                    borderRadius: 8,
                    border: `2px solid ${colors.success}`,
                    minHeight: 200,
                  }}
                >
                  <Space style={{ marginBottom: 12 }}>
                    <CloudOutlined style={{ color: colors.success, fontSize: 18 }} />
                    <Text strong style={{ color: colors.brownBramble }}>
                      Server Version
                    </Text>
                  </Space>
                  <div>
                    {differences.map(diff => (
                      <div key={diff.field} style={{ marginBottom: 12 }}>
                        <Text
                          type="secondary"
                          style={{ fontSize: 11, display: 'block', marginBottom: 2 }}
                        >
                          {diff.label}
                        </Text>
                        <Text style={{ fontSize: 14 }}>
                          {formatValue(diff.server)}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              </Col>
            </Row>
          ) : (
            /* Unified diff view */
            <div
              style={{
                padding: 16,
                background: 'rgba(102, 38, 4, 0.04)',
                borderRadius: 8,
                border: `1px solid ${colors.border}`,
                fontFamily: 'monospace',
                fontSize: 13,
                maxHeight: 300,
                overflowY: 'auto',
              }}
            >
              {differences.map(diff => (
                <div key={diff.field} style={{ marginBottom: 16 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    {diff.label}:
                  </Text>
                  <div
                    style={{
                      background: `rgba(247, 164, 45, 0.12)`,
                      padding: '4px 8px',
                      borderRadius: 4,
                      marginBottom: 4,
                      borderLeft: `3px solid ${colors.seaBuckthorn}`,
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      <MobileOutlined style={{ marginRight: 4 }} />
                      Your version:
                    </Text>{' '}
                    <Text delete={diff.local !== diff.server}>
                      {formatValue(diff.local)}
                    </Text>
                  </div>
                  <div
                    style={{
                      background: `rgba(46, 125, 50, 0.12)`,
                      padding: '4px 8px',
                      borderRadius: 4,
                      borderLeft: `3px solid ${colors.success}`,
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      <CloudOutlined style={{ marginRight: 4 }} />
                      Server version:
                    </Text>{' '}
                    <Text strong>{formatValue(diff.server)}</Text>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Divider style={{ margin: '20px 0 16px' }} />
        </>
      )}

      {/* Action buttons - 64px tap targets per UX spec */}
      <Space
        style={{ width: '100%', justifyContent: 'flex-end' }}
        size="middle"
      >
        <Button
          onClick={onCancel}
          disabled={isResolving}
          style={{ minHeight: touchTargets.standard }}
        >
          Cancel
        </Button>
        <Button
          type="primary"
          icon={<MobileOutlined />}
          onClick={() => onResolve('local')}
          loading={isResolving}
          style={{
            background: colors.seaBuckthorn,
            borderColor: colors.seaBuckthorn,
            minHeight: touchTargets.standard,
            minWidth: 120,
          }}
        >
          Keep Mine
        </Button>
        <Button
          type="primary"
          icon={<CloudOutlined />}
          onClick={() => onResolve('server')}
          loading={isResolving}
          style={{
            background: colors.success,
            borderColor: colors.success,
            minHeight: touchTargets.standard,
            minWidth: 120,
          }}
        >
          Keep Server
        </Button>
      </Space>
    </Modal>
  );
}

export default ConflictResolutionModal;
