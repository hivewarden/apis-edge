/**
 * BulkActionsBar Component
 *
 * A fixed action bar that appears when tasks are selected.
 * Provides bulk complete and delete operations.
 *
 * Part of Epic 14, Story 14.5 (Portal Active Tasks List)
 */
import { Space, Button, Typography, Popconfirm } from 'antd';
import {
  CheckOutlined,
  DeleteOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

export interface BulkActionsBarProps {
  /** Number of selected tasks */
  selectedCount: number;
  /** Callback when "Complete Selected" is clicked */
  onCompleteSelected: () => void;
  /** Callback when "Delete Selected" is confirmed */
  onDeleteSelected: () => void;
  /** Callback when selection is cleared */
  onClearSelection: () => void;
  /** Whether bulk complete operation is in progress */
  completing?: boolean;
  /** Whether bulk delete operation is in progress */
  deleting?: boolean;
}

/**
 * BulkActionsBar Component
 *
 * Displays a sticky action bar at the bottom of the task card when
 * one or more tasks are selected. Provides:
 * - Selection count display
 * - Complete Selected button
 * - Delete Selected button with confirmation
 * - Clear selection button
 */
export function BulkActionsBar({
  selectedCount,
  onCompleteSelected,
  onDeleteSelected,
  onClearSelection,
  completing = false,
  deleting = false,
}: BulkActionsBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        backgroundColor: colors.salomie,
        borderTop: `1px solid ${colors.border}`,
        borderRadius: '0 0 12px 12px',
        marginTop: 16,
      }}
    >
      {/* Left side: selection count and clear button */}
      <Space>
        <Text strong style={{ color: colors.brownBramble }}>
          {selectedCount} task{selectedCount !== 1 ? 's' : ''} selected
        </Text>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onClearSelection}
          style={{ color: colors.textMuted }}
        >
          Clear
        </Button>
      </Space>

      {/* Right side: action buttons */}
      <Space>
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={onCompleteSelected}
          loading={completing}
          disabled={deleting}
        >
          Complete Selected
        </Button>
        <Popconfirm
          title={`Delete ${selectedCount} task${selectedCount !== 1 ? 's' : ''}?`}
          description="This action cannot be undone."
          onConfirm={onDeleteSelected}
          okText="Delete"
          cancelText="Cancel"
          okButtonProps={{ danger: true, loading: deleting }}
        >
          <Button
            danger
            icon={<DeleteOutlined />}
            loading={deleting}
            disabled={completing}
          >
            Delete Selected
          </Button>
        </Popconfirm>
      </Space>
    </div>
  );
}

export default BulkActionsBar;
