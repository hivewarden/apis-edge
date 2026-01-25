/**
 * EquipmentFormModal Component
 *
 * Modal form for logging equipment installation or removal.
 * Supports both create and edit modes, including custom equipment types.
 *
 * Part of Epic 6, Story 6.4 (Equipment Log)
 */
import { useEffect, useState } from 'react';
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
  EQUIPMENT_TYPES,
  EQUIPMENT_ACTIONS,
  type CreateEquipmentLogInput,
  type UpdateEquipmentLogInput,
  type EquipmentLog,
} from '../hooks/useEquipment';

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
  custom_equipment_type?: string;
  action: 'installed' | 'removed';
  notes?: string;
}

// Check if a type is a predefined type (not custom)
const isPredefinedType = (type: string): boolean => {
  return EQUIPMENT_TYPES.some(t => t.value === type);
};

/**
 * Equipment Form Modal
 *
 * Displays a form for logging equipment with:
 * - Equipment type select (with Custom option)
 * - Custom type text input (when "custom" selected)
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
  const [showCustomInput, setShowCustomInput] = useState(false);
  const isEditMode = !!editEquipment;

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      if (editEquipment) {
        // Edit mode: populate form with existing data
        const isCustom = !isPredefinedType(editEquipment.equipment_type);
        setShowCustomInput(isCustom);
        form.setFieldsValue({
          logged_at: dayjs(editEquipment.logged_at),
          equipment_type: isCustom ? 'custom' : editEquipment.equipment_type,
          custom_equipment_type: isCustom ? editEquipment.equipment_type : undefined,
          action: editEquipment.action,
          notes: editEquipment.notes,
        });
      } else {
        // Create mode: reset with defaults
        form.resetFields();
        const isCustomPrefilled = prefilledType && !isPredefinedType(prefilledType);
        setShowCustomInput(isCustomPrefilled || false);
        form.setFieldsValue({
          logged_at: dayjs(),
          equipment_type: isCustomPrefilled ? 'custom' : prefilledType,
          custom_equipment_type: isCustomPrefilled ? prefilledType : undefined,
          action: prefilledAction || 'installed',
        });
      }
    }
  }, [open, form, editEquipment, prefilledType, prefilledAction]);

  const handleEquipmentTypeChange = (value: string) => {
    setShowCustomInput(value === 'custom');
    if (value !== 'custom') {
      form.setFieldValue('custom_equipment_type', undefined);
    }
  };

  const handleSubmit = async (values: FormValues) => {
    // Use custom type if "custom" was selected, otherwise use the dropdown value
    const equipmentType = values.equipment_type === 'custom'
      ? values.custom_equipment_type!
      : values.equipment_type;

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

  // Build options with "Custom..." at the end
  const equipmentOptions = [
    ...EQUIPMENT_TYPES.map(t => ({ value: t.value, label: t.label })),
    { value: 'custom', label: 'Custom...' },
  ];

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
        >
          <Select
            placeholder="Select equipment"
            options={equipmentOptions}
            suffixIcon={<ToolOutlined />}
            showSearch
            optionFilterProp="label"
            onChange={handleEquipmentTypeChange}
          />
        </Form.Item>

        {/* Custom Equipment Type Input (shown when "Custom..." is selected) */}
        {showCustomInput && (
          <Form.Item
            name="custom_equipment_type"
            label="Custom Equipment Name"
            rules={[
              { required: true, message: 'Please enter custom equipment name' },
              { min: 2, message: 'Equipment name must be at least 2 characters' },
              { max: 50, message: 'Equipment name must be at most 50 characters' },
            ]}
          >
            <Input
              placeholder="Enter custom equipment name"
              maxLength={50}
            />
          </Form.Item>
        )}

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
