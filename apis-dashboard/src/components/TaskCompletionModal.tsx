/**
 * TaskCompletionModal Component
 *
 * Modal dialog for completing tasks that have auto_effects prompts.
 * Renders dynamic form fields based on the prompts schema and shows
 * a preview of what will be updated.
 *
 * Design reference: /docs/hardware/stitch_apis_v2/apis_task_completion_modal/
 *
 * Part of Epic 14, Story 14.5 (Portal Active Tasks List)
 */
import { useState, useEffect, useMemo, CSSProperties } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Radio,
  Typography,
  Button,
} from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { Task, Prompt, TaskCompletionData, AutoEffectUpdate } from '../hooks/useTasks';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

export interface TaskCompletionModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** The task being completed (null when closed) */
  task: Task | null;
  /** Callback when task completion is confirmed with data */
  onComplete: (completionData: TaskCompletionData) => void;
  /** Callback when modal is cancelled */
  onCancel: () => void;
  /** Whether completion is in progress */
  completing?: boolean;
}

/**
 * Get a human-readable description of an update action
 */
function getUpdateDescription(update: AutoEffectUpdate, completionData: TaskCompletionData): string {
  const targetParts = update.target.split('.');
  const targetName = targetParts[targetParts.length - 1]
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  let value: string | number = update.value ?? '';
  if (update.value_from && update.value_from.startsWith('completion_data.')) {
    const key = update.value_from.replace('completion_data.', '');
    const rawValue = completionData[key];
    value = typeof rawValue === 'boolean' ? String(rawValue) : (rawValue ?? '[user input]');
  }
  if (value === '{{current_year}}') {
    value = new Date().getFullYear();
  }

  switch (update.action) {
    case 'set':
      return `Set ${targetName} to "${value}"`;
    case 'increment':
      return `Increase ${targetName} by ${value ?? 1}`;
    case 'decrement':
      return `Decrease ${targetName} by ${value ?? 1}`;
    default:
      return `Update ${targetName}`;
  }
}

/**
 * TaskCompletionModal Component
 *
 * Displays a modal with:
 * - Task name in the title
 * - Dynamic form fields based on auto_effects.prompts
 * - Preview section showing what will be updated
 * - Complete and Cancel buttons
 */
export function TaskCompletionModal({
  open,
  task,
  onComplete,
  onCancel,
  completing = false,
}: TaskCompletionModalProps) {
  const [form] = Form.useForm();
  const [formValues, setFormValues] = useState<TaskCompletionData>({});

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      form.resetFields();
      setFormValues({});
    }
  }, [task, form]);

  // Get prompts from task
  const prompts = useMemo(() => {
    return task?.auto_effects?.prompts ?? [];
  }, [task]);

  // Get updates from task
  const updates = useMemo(() => {
    return task?.auto_effects?.updates ?? [];
  }, [task]);

  // Check if all required prompts are filled
  const allRequiredFilled = useMemo(() => {
    return prompts
      .filter(p => p.required)
      .every(p => formValues[p.key] !== undefined && formValues[p.key] !== '');
  }, [prompts, formValues]);

  // Handle form value changes
  const handleValuesChange = (_: unknown, allValues: TaskCompletionData) => {
    setFormValues(allValues);
  };

  // Handle form submission
  const handleSubmit = () => {
    form
      .validateFields()
      .then(values => {
        onComplete(values);
      })
      .catch(() => {
        // Validation failed - errors will be shown on form
      });
  };

  // Label style per mockup
  const labelStyle: CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: colors.brownBramble,
    marginBottom: 8,
  };

  // Render a prompt field based on its type
  const renderPromptField = (prompt: Prompt, inputStyle: CSSProperties) => {
    const rules = prompt.required
      ? [{ required: true, message: `${prompt.label} is required` }]
      : [];

    switch (prompt.type) {
      case 'select':
        // Use Radio.Group for <= 4 options, Select for more
        if (prompt.options && prompt.options.length <= 4) {
          return (
            <Form.Item
              key={prompt.key}
              name={prompt.key}
              label={<span style={labelStyle}>{prompt.label}</span>}
              rules={rules}
              style={{ marginBottom: 0 }}
            >
              <Radio.Group>
                {prompt.options.map(opt => (
                  <Radio.Button key={opt.value} value={opt.value}>
                    {opt.label}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>
          );
        }
        return (
          <Form.Item
            key={prompt.key}
            name={prompt.key}
            label={<span style={labelStyle}>{prompt.label}</span>}
            rules={rules}
            style={{ marginBottom: 0 }}
          >
            <Select
              placeholder="Select Type"
              options={prompt.options?.map(opt => ({
                value: opt.value,
                label: opt.label,
              }))}
              style={{
                ...inputStyle,
                width: '100%',
              }}
              suffixIcon={
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#8c7e72' }}>
                  expand_more
                </span>
              }
            />
          </Form.Item>
        );

      case 'number':
        return (
          <Form.Item
            key={prompt.key}
            name={prompt.key}
            label={<span style={labelStyle}>{prompt.label}</span>}
            rules={rules}
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              style={{ ...inputStyle, width: '100%' }}
              placeholder={`Enter ${prompt.label.toLowerCase()}`}
            />
          </Form.Item>
        );

      case 'text':
      default:
        return (
          <Form.Item
            key={prompt.key}
            name={prompt.key}
            label={<span style={labelStyle}>{prompt.label}</span>}
            rules={rules}
            style={{ marginBottom: 0 }}
          >
            <Input
              placeholder={`Enter ${prompt.label.toLowerCase()}`}
              style={inputStyle}
            />
          </Form.Item>
        );
    }
  };

  // Only show modal when both open AND task are present
  const isVisible = open && task !== null;

  // Styles per mockup design
  const modalStyles: { body: CSSProperties; header: CSSProperties; footer: CSSProperties } = {
    body: {
      padding: 24,
    },
    header: {
      padding: '24px 24px 8px',
      borderBottom: 'none',
    },
    footer: {
      padding: '16px 24px',
      borderTop: `1px solid ${colors.border}`,
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 12,
    },
  };

  // Input styles per mockup - 56px height, rounded-xl
  const inputStyle: CSSProperties = {
    height: 56,
    borderRadius: 12,
    backgroundColor: '#fcfaf8',
    border: `1px solid ${colors.border}`,
    fontSize: 14,
    fontWeight: 500,
  };

  return (
    <Modal
      title={null}
      open={isVisible}
      onCancel={onCancel}
      footer={null}
      width={540}
      destroyOnHidden
      closeIcon={
        <CloseOutlined style={{ fontSize: 20, color: '#8c7e72' }} />
      }
      styles={{
        body: modalStyles.body,
        header: modalStyles.header,
      }}
      style={{ borderRadius: 16 }}
    >
      {task && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: colors.brownBramble,
              letterSpacing: '-0.01em',
            }}>
              Complete Task: {task.title}
            </h3>
          </div>

          {/* Task description if present */}
          {task.description && (
            <Text style={{ color: '#8c7e72', fontSize: 14 }}>
              {task.description}
            </Text>
          )}

          {/* Prompts Form */}
          {prompts.length > 0 && (
            <Form
              form={form}
              layout="vertical"
              onValuesChange={handleValuesChange}
              preserve={false}
            >
              <div style={{
                display: 'grid',
                gridTemplateColumns: prompts.length >= 2 ? '1fr 1fr' : '1fr',
                gap: 20,
              }}>
                {prompts.map((prompt) => renderPromptField(prompt, inputStyle))}
              </div>
            </Form>
          )}

          {/* Preview Section - styled per mockup */}
          {updates.length > 0 && (
            <div
              style={{
                backgroundColor: 'rgba(252, 212, 131, 0.2)',
                border: '1px solid rgba(252, 212, 131, 0.3)',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255,255,255,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18, color: colors.brownBramble }}
                >
                  info
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 700,
                  color: colors.brownBramble,
                  marginBottom: 4,
                }}>
                  Preview Update
                </p>
                <p style={{
                  margin: 0,
                  fontSize: 14,
                  color: 'rgba(102, 38, 4, 0.8)',
                  lineHeight: 1.5,
                }}>
                  {updates.map((update, idx) => (
                    <span key={idx}>
                      {getUpdateDescription(update, formValues)}
                      {idx < updates.length - 1 && '. '}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          )}

          {/* No prompts message */}
          {prompts.length === 0 && updates.length === 0 && (
            <Text style={{ color: '#8c7e72' }}>
              Click "Complete Task" to mark this task as done.
            </Text>
          )}

          {/* Footer Actions - per mockup styling */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 12,
              paddingTop: 16,
              borderTop: `1px solid ${colors.border}`,
              marginTop: 8,
            }}
          >
            <Button
              type="text"
              onClick={onCancel}
              style={{
                color: colors.brownBramble,
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              onClick={handleSubmit}
              disabled={!allRequiredFilled}
              loading={completing}
              icon={<CheckOutlined style={{ fontSize: 18 }} />}
              style={{
                height: 48,
                paddingLeft: 32,
                paddingRight: 32,
                borderRadius: 9999,
                fontWeight: 700,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 2px 8px rgba(247, 164, 45, 0.3)',
              }}
            >
              Complete Task
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default TaskCompletionModal;
