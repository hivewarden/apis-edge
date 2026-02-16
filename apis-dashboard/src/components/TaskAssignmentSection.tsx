/**
 * TaskAssignmentSection Component
 *
 * Form section for assigning tasks to multiple hives.
 * Supports template selection, hive multi-select with site filtering,
 * priority, due date, and notes.
 *
 * Design reference: /docs/hardware/stitch_apis_v2/apis_task_assignment_form/
 *
 * Part of Epic 14, Story 14.4 (Portal Tasks Screen)
 */
import { useState, useMemo, useEffect, CSSProperties } from 'react';
import {
  Form,
  Select,
  DatePicker,
  Input,
  Button,
  Typography,
  message,
  Spin,
  Alert,
  Tag,
} from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import { useCreateTasks, PRIORITY_OPTIONS, useSites, useHivesList } from '../hooks';
import type { TaskTemplate } from '../hooks/useTaskTemplates';
import type { TaskPriority, CreateTaskInput } from '../hooks/useTasks';
import dayjs from 'dayjs';

const { Text } = Typography;

/** Maximum number of hives that can be selected for bulk assignment */
const MAX_HIVES = 500;

export interface TaskAssignmentSectionProps {
  /** List of available task templates */
  templates: TaskTemplate[];
  /** Optional pre-selected template ID (set when clicking a library card) */
  selectedTemplateId?: string;
  /** Called after tasks are successfully created */
  onTasksCreated?: () => void;
}

interface FormValues {
  template_id: string;
  priority: TaskPriority;
  due_date?: dayjs.Dayjs;
  notes?: string;
}

/**
 * TaskAssignmentSection Component
 *
 * Form for bulk task assignment with:
 * - Task type dropdown
 * - Hive multi-select with search
 * - "Select all in site" dropdown
 * - Counter showing selection count vs max
 * - Priority radio buttons
 * - Due date picker
 * - Notes textarea
 * - "Assign to X Hives" button
 */
export function TaskAssignmentSection({
  templates,
  selectedTemplateId: externalTemplateId,
  onTasksCreated,
}: TaskAssignmentSectionProps) {
  const [form] = Form.useForm<FormValues>();
  const { createTasks, creating } = useCreateTasks();

  // Use hooks for sites and hives
  const { sites, loading: sitesLoading } = useSites();
  const { hives, loading: hivesLoading } = useHivesList();

  // Selection state (controlled outside form for the "Select all in site" feature)
  const [selectedHiveIds, setSelectedHiveIds] = useState<string[]>([]);

  // Build hive options for the multi-select
  const hiveOptions = useMemo(() => {
    return hives.map(hive => {
      const site = sites.find(s => s.id === hive.site_id);
      return {
        value: hive.id,
        label: site ? `${hive.name} (${site.name})` : hive.name,
        hive,
      };
    });
  }, [hives, sites]);

  // Build template options for task type dropdown
  const templateOptions = useMemo(() => {
    return templates.map(t => ({
      value: t.id,
      label: t.name,
    }));
  }, [templates]);

  // Sync external template selection into form
  useEffect(() => {
    if (externalTemplateId) {
      form.setFieldsValue({ template_id: externalTemplateId });
    }
  }, [externalTemplateId, form]);

  // Validation check for exceeding max
  const exceedsMax = selectedHiveIds.length > MAX_HIVES;

  // Get selected template and priority from form (reactive)
  const selectedTemplateId = Form.useWatch('template_id', form);
  const selectedPriority = Form.useWatch('priority', form);

  // Button disabled state
  const isButtonDisabled = !selectedTemplateId || selectedHiveIds.length === 0 || exceedsMax || creating;

  // Handle form submission
  const handleSubmit = async (values: FormValues) => {
    if (exceedsMax) {
      message.error(`Cannot assign to more than ${MAX_HIVES} hives at once`);
      return;
    }

    if (selectedHiveIds.length === 0) {
      message.error('Please select at least one hive');
      return;
    }

    // Build task payloads
    const tasks: CreateTaskInput[] = selectedHiveIds.map(hiveId => ({
      hive_id: hiveId,
      template_id: values.template_id,
      priority: values.priority,
      due_date: values.due_date?.format('YYYY-MM-DD'),
      description: values.notes?.trim() || undefined,
    }));

    try {
      const result = await createTasks(tasks);
      message.success(`Created ${result.created} tasks successfully`);
      onTasksCreated?.();

      // Clear hive selection and form fields (except template)
      setSelectedHiveIds([]);
      form.setFieldsValue({
        priority: 'medium',
        due_date: undefined,
        notes: undefined,
      });
    } catch (err) {
      // Show error to user
      const errorMessage = err instanceof Error ? err.message : 'Failed to create tasks';
      message.error(errorMessage);
    }
  };

  // Counter color based on selection count
  const getCounterColor = () => {
    if (exceedsMax) return colors.error;
    if (selectedHiveIds.length > MAX_HIVES * 0.9) return colors.warning;
    return colors.textMuted;
  };

  if (sitesLoading || hivesLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large">
          <div style={{ marginTop: 48, color: colors.textMuted }}>Loading hives...</div>
        </Spin>
      </div>
    );
  }

  if (hives.length === 0) {
    return (
      <Alert
        message="No Hives Available"
        description="Create some hives first before assigning tasks."
        type="info"
        showIcon
      />
    );
  }

  // Styles per mockup design
  const labelStyle: CSSProperties = {
    fontSize: 14,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: colors.brownBramble,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const inputContainerStyle: CSSProperties = {
    minHeight: 64,
    borderRadius: 16,
    border: '1px solid #e9dece',
    backgroundColor: '#fdfcf9',
    padding: '12px 16px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  };

  const priorityCardStyle = (isSelected: boolean): CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '10px 4px',
    borderRadius: 12,
    border: `1px solid ${isSelected ? colors.seaBuckthorn : '#e9dece'}`,
    backgroundColor: isSelected ? '#fff5d6' : '#fdfcf9',
    cursor: 'pointer',
    transition: 'all 0.2s',
    flex: 1,
    minWidth: 0,
    position: 'relative',
  });

  // Priority icons mapping
  const priorityIcons: Record<string, { icon: string; bgColor: string; iconColor: string }> = {
    low: { icon: 'low_priority', bgColor: '#f3f4f6', iconColor: '#6b7280' },
    medium: { icon: 'speed', bgColor: '#dcfce7', iconColor: '#16a34a' },
    high: { icon: 'priority_high', bgColor: '#ffedd5', iconColor: '#ea580c' },
    urgent: { icon: 'warning', bgColor: '#fee2e2', iconColor: '#dc2626' },
  };

  // Handle removing a hive from selection
  const handleRemoveHive = (hiveId: string) => {
    setSelectedHiveIds(prev => prev.filter(id => id !== hiveId));
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        priority: 'high',
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 40,
      }}
    >
      {/* Task Type dropdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={labelStyle}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: colors.seaBuckthorn }}>
            task_alt
          </span>
          Task Type
        </label>
        <Form.Item
          name="template_id"
          noStyle
          rules={[{ required: true, message: 'Please select a task type' }]}
        >
          <Select
            placeholder="Select a task template..."
            options={templateOptions}
            style={{
              width: '100%',
              height: 56,
            }}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
      </div>

      {/* Select Hives - per mockup with chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={labelStyle}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: colors.seaBuckthorn }}>
            hive
          </span>
          Select Hives
        </label>
        <div style={inputContainerStyle}>
          {/* Selected hive chips */}
          {selectedHiveIds.map(hiveId => {
            const hive = hives.find(h => h.id === hiveId);
            if (!hive) return null;
            return (
              <Tag
                key={hiveId}
                closable
                onClose={() => handleRemoveHive(hiveId)}
                closeIcon={
                  <span style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: '#f3f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 8,
                  }}>
                    <CloseOutlined style={{ fontSize: 10, color: '#6b7280' }} />
                  </span>
                }
                style={{
                  backgroundColor: '#fff5d6',
                  border: `1px solid ${colors.seaBuckthorn}`,
                  borderRadius: 9999,
                  padding: '6px 8px 6px 12px',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 14,
                  fontWeight: 600,
                  color: colors.brownBramble,
                  boxShadow: '0 1px 2px rgba(247, 164, 45, 0.15)',
                }}
              >
                {hive.name}
              </Tag>
            );
          })}
          {/* Search input embedded in the container */}
          <Select
            mode="multiple"
            placeholder="Search other hives..."
            value={[]}
            onChange={(newValues) => {
              setSelectedHiveIds(prev => {
                const newSet = new Set([...prev, ...newValues]);
                return Array.from(newSet);
              });
            }}
            showSearch
            optionFilterProp="label"
            bordered={false}
            style={{ flex: 1, minWidth: 150 }}
            dropdownStyle={{ minWidth: 250 }}
            options={hiveOptions.filter(opt => !selectedHiveIds.includes(opt.value))}
            filterOption={(input, option) =>
              (option?.label?.toString().toLowerCase() || '').includes(input.toLowerCase())
            }
            suffixIcon={
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#9d7a48' }}>
                expand_more
              </span>
            }
          />
        </div>
        <p style={{
          margin: 0,
          fontSize: 14,
          color: getCounterColor(),
          paddingLeft: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: colors.seaBuckthorn,
          }} />
          {selectedHiveIds.length} of {MAX_HIVES} max selected
        </p>
      </div>

      {/* Priority Level and Due Date - stacked vertically in narrow Quick Assign column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        {/* Priority Level */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={labelStyle}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: colors.seaBuckthorn }}>
              flag
            </span>
            Priority Level
          </label>
          <Form.Item
            name="priority"
            noStyle
            rules={[{ required: true, message: 'Please select priority' }]}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {PRIORITY_OPTIONS.map(opt => {
                const iconConfig = priorityIcons[opt.value] || priorityIcons.medium;
                const isSelected = selectedPriority === opt.value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => form.setFieldsValue({ priority: opt.value })}
                    style={priorityCardStyle(isSelected)}
                  >
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      backgroundColor: iconConfig.bgColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 20, color: iconConfig.iconColor }}
                      >
                        {iconConfig.icon}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: colors.brownBramble,
                    }}>
                      {opt.label}
                    </span>
                    {isSelected && (
                      <span
                        className="material-symbols-outlined"
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          fontSize: 14,
                          color: colors.seaBuckthorn,
                        }}
                      >
                        check
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Form.Item>
        </div>

        {/* Due Date */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={labelStyle}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: colors.seaBuckthorn }}>
              event
            </span>
            Due Date
          </label>
          <Form.Item name="due_date" noStyle>
            <DatePicker
              style={{
                width: '100%',
                height: 56,
                borderRadius: 16,
                border: '1px solid #e9dece',
                backgroundColor: '#fdfcf9',
                fontSize: 16,
              }}
              format="YYYY-MM-DD"
              placeholder="mm/dd/yyyy"
              suffixIcon={
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#9d7a48' }}>
                  calendar_today
                </span>
              }
            />
          </Form.Item>
        </div>
      </div>

      {/* Notes / Instructions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={labelStyle}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: colors.seaBuckthorn }}>
            description
          </span>
          Notes / Instructions
        </label>
        <Form.Item
          name="notes"
          noStyle
          rules={[{ max: 500, message: 'Notes cannot exceed 500 characters' }]}
        >
          <Input.TextArea
            rows={4}
            placeholder="e.g., Check for queen cells and assess honey stores..."
            maxLength={500}
            style={{
              borderRadius: 16,
              border: '1px solid #e9dece',
              backgroundColor: '#fdfcf9',
              fontSize: 16,
              padding: 20,
              resize: 'none',
            }}
          />
        </Form.Item>
      </div>

      {/* Footer with info text and buttons */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        paddingTop: 24,
        borderTop: '1px solid #e9dece',
      }}>
        <Text style={{
          color: '#9d7a48',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            info
          </span>
          Task will be visible to all assigned beekeepers.
        </Text>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button
            type="text"
            onClick={() => {
              form.resetFields();
              setSelectedHiveIds([]);
            }}
            style={{
              color: '#9d7a48',
              fontWeight: 700,
              fontSize: 13,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '8px 12px',
            }}
          >
            Cancel
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            disabled={isButtonDisabled}
            loading={creating}
            style={{
              height: 48,
              paddingLeft: 20,
              paddingRight: 20,
              borderRadius: 9999,
              fontWeight: 700,
              fontSize: 13,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              boxShadow: '0 8px 20px -4px rgba(247, 164, 45, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              send
            </span>
            Assign to {selectedHiveIds.length} Hive{selectedHiveIds.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </Form>
  );
}

export default TaskAssignmentSection;
