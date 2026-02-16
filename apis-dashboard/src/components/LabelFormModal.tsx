/**
 * LabelFormModal Component
 *
 * Modal form for creating and editing custom labels.
 * Supports both create mode (category pre-selected) and edit mode (pre-fill existing name).
 *
 * Part of Epic 6, Story 6.5 (Custom Labels System)
 */
import { useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Space,
  Button,
} from 'antd';
import { TagsOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import { LABEL_CATEGORIES, type LabelCategory, type CustomLabel } from '../hooks/useCustomLabels';

interface LabelFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  loading?: boolean;
  /** Category for new labels (create mode) */
  category?: LabelCategory;
  /** Existing label for editing (edit mode) */
  editingLabel?: CustomLabel | null;
}

interface FormValues {
  name: string;
}

/**
 * Label Form Modal
 *
 * Displays a form for creating or editing custom labels with:
 * - Name input with validation (required, 2-50 chars)
 * - Category display (read-only, determined by context)
 * - Submit and Cancel buttons
 */
export function LabelFormModal({
  open,
  onClose,
  onSubmit,
  loading = false,
  category,
  editingLabel,
}: LabelFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const isEditMode = !!editingLabel;

  // Get category label for display
  const categoryLabel = LABEL_CATEGORIES.find(
    c => c.value === (editingLabel?.category || category)
  )?.label || 'Label';

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (editingLabel) {
        form.setFieldsValue({ name: editingLabel.name });
      }
    }
  }, [open, form, editingLabel]);

  const handleSubmit = async (values: FormValues) => {
    await onSubmit(values.name.trim());
  };

  return (
    <Modal
      title={
        <Space>
          <TagsOutlined style={{ color: colors.seaBuckthorn, fontSize: 20 }} />
          <span>{isEditMode ? 'Edit Label' : `Add ${categoryLabel.replace(' Types', '')}`}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark="optional"
      >
        <Form.Item
          name="name"
          label="Label Name"
          rules={[
            { required: true, message: 'Please enter a name' },
            { min: 2, message: 'Name must be at least 2 characters' },
            { max: 50, message: 'Name must be 50 characters or less' },
          ]}
        >
          <Input
            placeholder={`e.g., ${category === 'feed' ? 'Honey-B-Healthy syrup' : category === 'treatment' ? 'Thymovar' : category === 'equipment' ? 'Solar wax melter' : 'Chalk brood'}`}
            maxLength={50}
            autoFocus
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<TagsOutlined />}
            >
              {isEditMode ? 'Update Label' : 'Add Label'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default LabelFormModal;
