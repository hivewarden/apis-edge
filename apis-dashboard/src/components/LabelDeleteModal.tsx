/**
 * LabelDeleteModal Component
 *
 * Confirmation modal for deleting custom labels.
 * Fetches and displays usage count to warn users if the label is in use.
 *
 * Part of Epic 6, Story 6.5 (Custom Labels System)
 */
import { useState, useEffect } from 'react';
import {
  Modal,
  Space,
  Typography,
  Alert,
  Spin,
} from 'antd';
import { DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import type { CustomLabel, LabelUsage } from '../hooks/useCustomLabels';

const { Text } = Typography;

interface LabelDeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  label: CustomLabel | null;
  getLabelUsage: (id: string) => Promise<LabelUsage>;
  loading?: boolean;
}

/**
 * Label Delete Modal
 *
 * Displays a confirmation dialog for deleting a custom label with:
 * - Label name being deleted
 * - Usage count (if any records use this label)
 * - Warning message about what happens to existing records
 * - Cancel and Delete buttons
 */
export function LabelDeleteModal({
  open,
  onClose,
  onConfirm,
  label,
  getLabelUsage,
  loading = false,
}: LabelDeleteModalProps) {
  const [usage, setUsage] = useState<LabelUsage | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  // Fetch usage when modal opens
  useEffect(() => {
    if (open && label) {
      setLoadingUsage(true);
      getLabelUsage(label.id)
        .then(setUsage)
        .catch(() => setUsage(null))
        .finally(() => setLoadingUsage(false));
    } else {
      setUsage(null);
    }
  }, [open, label, getLabelUsage]);

  if (!label) return null;

  const hasUsage = usage && usage.count > 0;

  return (
    <Modal
      title={
        <Space>
          <DeleteOutlined style={{ color: colors.error, fontSize: 20 }} />
          <span>Delete Label</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      onOk={onConfirm}
      okText="Delete"
      okButtonProps={{
        danger: true,
        loading,
        icon: <DeleteOutlined />,
      }}
      cancelText="Cancel"
      width={450}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Text>
          Are you sure you want to delete the label <strong>{label.name}</strong>?
        </Text>

        {loadingUsage ? (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Spin size="small" />
            <Text type="secondary" style={{ marginLeft: 8 }}>Checking usage...</Text>
          </div>
        ) : hasUsage ? (
          <Alert
            type="warning"
            showIcon
            icon={<ExclamationCircleOutlined />}
            message={`This label is used in ${usage.count} record${usage.count === 1 ? '' : 's'}`}
            description={
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">
                  {usage.breakdown.treatments > 0 && `${usage.breakdown.treatments} treatment${usage.breakdown.treatments === 1 ? '' : 's'}`}
                  {usage.breakdown.treatments > 0 && (usage.breakdown.feedings > 0 || usage.breakdown.equipment > 0) && ', '}
                  {usage.breakdown.feedings > 0 && `${usage.breakdown.feedings} feeding${usage.breakdown.feedings === 1 ? '' : 's'}`}
                  {usage.breakdown.feedings > 0 && usage.breakdown.equipment > 0 && ', '}
                  {usage.breakdown.equipment > 0 && `${usage.breakdown.equipment} equipment log${usage.breakdown.equipment === 1 ? '' : 's'}`}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  These records will keep the text value but the label will no longer appear in dropdowns.
                </Text>
              </div>
            }
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="This label is not used in any records"
            description="It can be safely deleted."
          />
        )}
      </Space>
    </Modal>
  );
}

export default LabelDeleteModal;
