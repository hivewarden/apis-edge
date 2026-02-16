/**
 * EquipmentFormModal Component
 *
 * Modal form for logging equipment installation or removal.
 * Supports both create and edit modes, including custom equipment types.
 *
 * Part of Epic 6, Story 6.4 (Equipment Log)
 */
import { useEffect } from 'react';
import {
  Modal,
  Form,
  DatePicker,
  Select,
  Input,
  Space,
  Button,
  Radio,
} from 'antd';
import {
  ToolOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import {
  EQUIPMENT_ACTIONS,
  type CreateEquipmentLogInput,
  type UpdateEquipmentLogInput,
  type EquipmentLog,
} from '../hooks/useEquipment';
import {
  useCustomLabels,
  BUILT_IN_EQUIPMENT_TYPES,
  mergeTypesWithCustomLabels,
} from '../hooks/useCustomLabels';

interface EquipmentFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateEquipmentLogInput) => Promise<void>;
  onUpdate?: (id: string, input: UpdateEquipmentLogInput) => Promise<void>;
  loading?: boolean;
  /** Hive name for display */
  hiveName: string;
  /** Equipment log to edit (for edit mode) */
  editEquipment?: EquipmentLog | null;
  /** Pre-filled equipment type (for quick removal) */
  prefilledType?: string;
  /** Pre-filled action (for quick removal) */
  prefilledAction?: 'installed' | 'removed';
}

interface FormValues {
  logged_at: dayjs.Dayjs;
  equipment_type: string;
  action: 'installed' | 'removed';
  notes?: string;
}

/**
 * Equipment Form Modal
 *
 * Displays a form for logging equipment with:
 * - Equipment type select (built-in + custom labels from Settings)
 * - Action radio (Installed/Removed)
 * - Date picker (default: today)
 * - Notes textarea
 */
export function EquipmentFormModal({
  open,
  onClose,
  onSubmit,
  onUpdate,
  loading = false,
  hiveName,
  editEquipment = null,
  prefilledType,
  prefilledAction,
}: EquipmentFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const isEditMode = !!editEquipment;

  // Fetch custom equipment labels
  const { labels: customEquipmentLabels } = useCustomLabels('equipment');

  // Merge built-in types with custom labels
  // Note: To add new equipment types, use Settings > Custom Labels
  const equipmentOptions = mergeTypesWithCustomLabels(
    BUILT_IN_EQUIPMENT_TYPES,
    customEquipmentLabels
  );

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      if (editEquipment) {
        // Edit mode: populate form with existing data
        form.setFieldsValue({
          logged_at: dayjs(editEquipment.logged_at),
          equipment_type: editEquipment.equipment_type,
          action: editEquipment.action,
          notes: editEquipment.notes,
        });
      } else {
        // Create mode: reset with defaults
        form.resetFields();
        form.setFieldsValue({
          logged_at: dayjs(),
          equipment_type: prefilledType,
          action: prefilledAction || 'installed',
        });
      }
    }
  }, [open, form, editEquipment, prefilledType, prefilledAction]);

  const handleSubmit = async (values: FormValues) => {
    const equipmentType = values.equipment_type;

    if (isEditMode && editEquipment && onUpdate) {
      const input: UpdateEquipmentLogInput = {
        equipment_type: equipmentType,
        action: values.action,
        logged_at: values.logged_at.format('YYYY-MM-DD'),
        notes: values.notes,
      };
      await onUpdate(editEquipment.id, input);
    } else {
      const input: CreateEquipmentLogInput = {
        equipment_type: equipmentType,
        action: values.action,
        logged_at: values.logged_at.format('YYYY-MM-DD'),
        notes: values.notes,
      };
      await onSubmit(input);
    }
  };

  const modalTitle = isEditMode ? 'Edit Equipment Log' : (
    prefilledAction === 'removed' ? 'Remove Equipment' : 'Log Equipment'
  );

  const submitButtonText = isEditMode ? 'Update Equipment' : (
    prefilledAction === 'removed' ? 'Log Removal' : 'Log Equipment'
  );

  return (
    <Modal
      title={
        <Space>
          <ToolOutlined style={{ color: colors.seaBuckthorn, fontSize: 20 }} />
          <span>{modalTitle}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark="optional"
      >
        {/* Current Hive Info */}
        <div
          style={{
            padding: 12,
            backgroundColor: 'rgba(247, 164, 45, 0.1)',
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <span>
            {isEditMode ? 'Editing equipment log for: ' : 'Logging equipment for: '}
            <strong>{hiveName}</strong>
          </span>
        </div>

        {/* Equipment Type */}
        <Form.Item
          name="equipment_type"
          label="Equipment Type"
          rules={[{ required: true, message: 'Please select equipment type' }]}
          extra="Add custom types in Settings > Custom Labels"
        >
          <Select
            placeholder="Select equipment"
            options={equipmentOptions}
            suffixIcon={<ToolOutlined />}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        {/* Action (Installed/Removed) */}
        <Form.Item
          name="action"
          label="Action"
          rules={[{ required: true, message: 'Please select action' }]}
        >
          <Radio.Group>
            {EQUIPMENT_ACTIONS.map(a => (
              <Radio key={a.value} value={a.value}>
                {a.label}
              </Radio>
            ))}
          </Radio.Group>
        </Form.Item>

        {/* Date */}
        <Form.Item
          name="logged_at"
          label="Date"
          rules={[{ required: true, message: 'Please select date' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            format="YYYY-MM-DD"
            disabledDate={(current) => current && current > dayjs().endOf('day')}
          />
        </Form.Item>

        {/* Notes */}
        <Form.Item
          name="notes"
          label="Notes"
        >
          <Input.TextArea
            rows={3}
            placeholder="Any additional notes..."
            maxLength={500}
            showCount
          />
        </Form.Item>

        {/* Actions */}
        <Form.Item style={{ marginBottom: 0 }}>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<ToolOutlined />}
            >
              {submitButtonText}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default EquipmentFormModal;
