/**
 * CreateTemplateModal Component
 *
 * Modal form for creating custom task templates.
 * Validates name (1-100 chars) and description (max 500 chars).
 *
 * Design reference: /docs/hardware/stitch_apis_v2/apis_custom_task_template/
 *
 * Part of Epic 14, Story 14.4 (Portal Tasks Screen)
 */
import { useEffect, useState, CSSProperties } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  message,
} from 'antd';
import { colors } from '../theme/apisTheme';
import { useCreateTaskTemplate } from '../hooks/useTaskTemplates';
import type { TaskTemplate, CreateTemplateInput } from '../hooks/useTaskTemplates';

/** Category icon options matching the mockup */
const CATEGORY_ICONS = [
  { key: 'hive', icon: 'hexagon', label: 'Hive' },
  { key: 'bee', icon: 'pest_control', label: 'Bee' },
  { key: 'forage', icon: 'local_florist', label: 'Forage' },
  { key: 'climate', icon: 'device_thermostat', label: 'Climate' },
  { key: 'maintenance', icon: 'handyman', label: 'Maint.' },
] as const;

export interface CreateTemplateModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when template is successfully created */
  onSuccess: (template: TaskTemplate) => void;
}

interface FormValues {
  name: string;
  description?: string;
  category?: string;
}

/**
 * CreateTemplateModal Component
 *
 * Displays a form for creating custom task templates with:
 * - Name input (required, 1-100 chars)
 * - Description textarea (optional, max 500 chars)
 */
export function CreateTemplateModal({
  open,
  onClose,
  onSuccess,
}: CreateTemplateModalProps) {
  const [form] = Form.useForm<FormValues>();
  const { createTemplate, creating } = useCreateTaskTemplate();
  const [selectedCategory, setSelectedCategory] = useState<string>('hive');

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      form.resetFields();
      setSelectedCategory('hive');
    }
  }, [open, form]);

  const handleSubmit = async (values: FormValues) => {
    try {
      const input: CreateTemplateInput = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
      };

      const template = await createTemplate(input);
      message.success(`Template "${template.name}" created successfully`);
      onSuccess(template);
      onClose();
    } catch (err) {
      // Show error to user - modal stays open so they can try again
      const errorMessage = err instanceof Error ? err.message : 'Failed to create template';
      message.error(errorMessage);
    }
  };

  // Styles per mockup design
  const inputStyle: CSSProperties = {
    height: 56,
    borderRadius: 12,
    backgroundColor: '#fcfaf8',
    border: '1px solid #eaddd5',
    fontSize: 17,
    fontWeight: 500,
    padding: '0 20px',
  };

  const labelStyle: CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: colors.brownBramble,
    opacity: 0.9,
  };

  return (
    <Modal
      title={null}
      open={open}
      onCancel={onClose}
      footer={null}
      width={580}
      destroyOnHidden
      closable={false}
      centered
      styles={{
        content: {
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 40px -4px rgba(102, 38, 4, 0.12), 0 8px 16px -4px rgba(102, 38, 4, 0.08)',
        },
        body: {
          padding: 0,
        },
      }}
      maskStyle={{
        backgroundColor: 'rgba(61, 38, 17, 0.2)',
        backdropFilter: 'blur(2px)',
      }}
    >
      {/* Header - centered text per mockup */}
      <div style={{ padding: '40px 40px 16px', textAlign: 'center' }}>
        <h2 style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 800,
          color: colors.brownBramble,
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
        }}>
          Create Custom Task
        </h2>
        <p style={{
          margin: '8px 0 0',
          fontSize: 15,
          color: 'rgba(102, 38, 4, 0.6)',
          fontWeight: 500,
        }}>
          Define a new standard procedure for your apiary
        </p>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
        style={{ padding: '24px 40px' }}
      >
        {/* Category Icon Selector */}
        <div style={{ marginBottom: 32 }}>
          <label style={labelStyle}>Category Icon</label>
          <div style={{
            display: 'flex',
            gap: 16,
            marginTop: 16,
            flexWrap: 'wrap',
          }}>
            {CATEGORY_ICONS.map((cat) => {
              const isSelected = selectedCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedCategory(cat.key)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: isSelected ? 1 : 0.7,
                    transition: 'opacity 0.2s',
                  }}
                >
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    backgroundColor: isSelected ? colors.seaBuckthorn : '#f4efe6',
                    color: isSelected ? '#ffffff' : colors.brownBramble,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isSelected ? '0 4px 12px rgba(247, 164, 45, 0.3)' : 'none',
                    ...(isSelected ? {
                      outline: `2px solid ${colors.seaBuckthorn}`,
                      outlineOffset: 2,
                    } : {}),
                    transition: 'all 0.2s',
                  }}>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 24 }}
                    >
                      {cat.icon}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? colors.seaBuckthorn : colors.brownBramble,
                  }}>
                    {cat.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Template Name */}
        <Form.Item
          name="name"
          label={<span style={labelStyle}>Template Name</span>}
          rules={[
            { required: true, message: 'Please enter a template name' },
            { min: 1, message: 'Name must be at least 1 character' },
            { max: 100, message: 'Name cannot exceed 100 characters' },
            { whitespace: true, message: 'Name cannot be empty' },
          ]}
          style={{ marginBottom: 32 }}
        >
          <Input
            placeholder="e.g., Winter Insulation"
            maxLength={100}
            style={inputStyle}
          />
        </Form.Item>

        {/* Description */}
        <Form.Item
          name="description"
          label={<span style={labelStyle}>Description</span>}
          rules={[
            { max: 500, message: 'Description cannot exceed 500 characters' },
          ]}
          style={{ marginBottom: 0 }}
        >
          <Input.TextArea
            rows={4}
            placeholder="Add detailed instructions for this task (e.g., Check ventilation, wrap hives with insulation material, ensure mouse guards are in place)..."
            maxLength={500}
            style={{
              borderRadius: 12,
              backgroundColor: '#fcfaf8',
              border: '1px solid #eaddd5',
              fontSize: 16,
              padding: 20,
              resize: 'none',
            }}
          />
        </Form.Item>
      </Form>

      {/* Footer Actions - stacked per mockup */}
      <div style={{ padding: '16px 40px 40px' }}>
        <Button
          type="primary"
          onClick={() => form.submit()}
          loading={creating}
          block
          style={{
            height: 56,
            borderRadius: 9999,
            fontWeight: 700,
            fontSize: 17,
            boxShadow: '0 8px 20px -4px rgba(247, 164, 45, 0.4)',
            marginBottom: 16,
          }}
        >
          Create Template
        </Button>
        <Button
          type="text"
          onClick={onClose}
          block
          style={{
            height: 40,
            color: colors.brownBramble,
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

export default CreateTemplateModal;
