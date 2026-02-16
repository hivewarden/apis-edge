/**
 * DeleteTaskConfirmation Component
 *
 * A confirmation modal for deleting tasks.
 * Shows task name and provides Delete/Cancel buttons with loading state.
 *
 * Part of Epic 14, Story 14.10: Mobile Task Completion Flow
 */
import { Modal, Button, Typography, Space } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

export interface DeleteTaskConfirmationProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Name of the task being deleted */
  taskName: string;
  /** Callback when delete is confirmed */
  onConfirm: () => void;
  /** Callback when delete is cancelled */
  onCancel: () => void;
  /** Whether delete is in progress */
  deleting: boolean;
}

/**
 * Confirmation modal for task deletion.
 *
 * Features:
 * - Warning icon and clear messaging
 * - Shows task name for confirmation
 * - Danger-styled delete button
 * - Loading state during deletion
 *
 * @example
 * <DeleteTaskConfirmation
 *   visible={showDeleteConfirm}
 *   taskName={deletingTask?.title}
 *   onConfirm={handleDeleteConfirm}
 *   onCancel={() => setShowDeleteConfirm(false)}
 *   deleting={isDeleting}
 * />
 */
export function DeleteTaskConfirmation({
  visible,
  taskName,
  onConfirm,
  onCancel,
  deleting,
}: DeleteTaskConfirmationProps) {
  return (
    <Modal
      open={visible}
      onCancel={onCancel}
      closable={!deleting}
      maskClosable={!deleting}
      keyboard={!deleting}
      footer={null}
      centered
      data-testid="delete-task-confirmation"
    >
      <Space direction="vertical" size={16} style={{ width: '100%', textAlign: 'center' }}>
        {/* Warning icon */}
        <ExclamationCircleOutlined
          style={{
            fontSize: 48,
            color: colors.error,
          }}
        />

        {/* Title */}
        <Text
          strong
          style={{
            fontSize: 18,
            color: colors.brownBramble,
            display: 'block',
          }}
          data-testid="delete-title"
        >
          Delete this task?
        </Text>

        {/* Task name */}
        <Text
          style={{
            fontSize: 14,
            color: colors.textMuted,
            display: 'block',
          }}
          data-testid="task-name"
        >
          {taskName}
        </Text>

        {/* Action buttons */}
        <Space size={12} style={{ marginTop: 8 }}>
          <Button
            onClick={onCancel}
            disabled={deleting}
            data-testid="cancel-button"
          >
            Cancel
          </Button>
          <Button
            type="primary"
            danger
            onClick={onConfirm}
            loading={deleting}
            data-testid="delete-button"
          >
            Delete
          </Button>
        </Space>
      </Space>
    </Modal>
  );
}

export default DeleteTaskConfirmation;
