/**
 * ReminderFormModal Component
 *
 * Modal form for creating and editing reminders.
 * Supports hive selection, title, and due date.
 *
 * Part of Epic 6, Story 6.6 (Treatment Calendar & Reminders)
 */
import { useEffect, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  DatePicker,
  Select,
  Space,
  Button,
} from 'antd';
import { BellOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import { apiClient } from '../providers/apiClient';

interface Hive {
  id: string;
  name: string;
  site_id: string;
}

interface HivesResponse {
  data: Hive[];
}

interface ReminderFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    hive_id?: string;
    title: string;
    due_at: string;
  }) => Promise<void>;
  loading?: boolean;
  /** Initial values for editing */
  initialValues?: {
    hive_id?: string;
    title?: string;
    due_at?: string;
  };
}

interface FormValues {
  hive_id?: string;
  title: string;
  due_at: dayjs.Dayjs;
}

/**
 * ReminderFormModal Component
 */
export function ReminderFormModal({
  open,
  onClose,
  onSubmit,
  loading = false,
  initialValues,
}: ReminderFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [hives, setHives] = useState<Hive[]>([]);
  const [hivesLoading, setHivesLoading] = useState(false);
  const [hivesError, setHivesError] = useState(false);

  // Fetch hives for dropdown
  useEffect(() => {
    if (open) {
      setHivesLoading(true);
      setHivesError(false);
      apiClient
        .get<HivesResponse>('/hives')
        .then((res) => {
          setHives(res.data.data || []);
        })
        .catch(() => {
          // Show error state - hive selection is optional but user should know
          setHives([]);
          setHivesError(true);
        })
        .finally(() => {
          setHivesLoading(false);
        });
    }
  }, [open]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (initialValues) {
        form.setFieldsValue({
          hive_id: initialValues.hive_id,
          title: initialValues.title || '',
          due_at: initialValues.due_at ? dayjs(initialValues.due_at) : dayjs().add(7, 'day'),
        });
      } else {
        form.setFieldsValue({
          due_at: dayjs().add(7, 'day'),
        });
      }
    }
  }, [open, form, initialValues]);

  const handleSubmit = async (values: FormValues) => {
    await onSubmit({
      hive_id: values.hive_id,
      title: values.title,
      due_at: values.due_at.format('YYYY-MM-DD'),
    });
  };

  const hiveOptions = hives.map((hive) => ({
    value: hive.id,
    label: hive.name,
  }));

  return (
    <Modal
      title={
        <Space>
          <BellOutlined style={{ color: colors.seaBuckthorn, fontSize: 20 }} />
          <span>{initialValues ? 'Edit Reminder' : 'Add Reminder'}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={480}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark="optional"
      >
        {/* Hive Selection (optional) */}
        <Form.Item
          name="hive_id"
          label="Hive (Optional)"
          tooltip="Associate this reminder with a specific hive"
          help={hivesError ? 'Could not load hives. You can still create a reminder without a hive.' : undefined}
          validateStatus={hivesError ? 'warning' : undefined}
        >
          <Select
            placeholder={hivesError ? 'Could not load hives' : 'Select a hive (optional)'}
            allowClear
            loading={hivesLoading}
            options={hiveOptions}
            showSearch
            disabled={hivesError}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>

        {/* Title */}
        <Form.Item
          name="title"
          label="Reminder Title"
          rules={[{ required: true, message: 'Please enter a title' }]}
        >
          <Input
            placeholder="e.g., Check mite count, Inspect for swarm cells"
            maxLength={200}
          />
        </Form.Item>

        {/* Due Date */}
        <Form.Item
          name="due_at"
          label="Due Date"
          rules={[{ required: true, message: 'Please select a due date' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            format="YYYY-MM-DD"
            disabledDate={(current) =>
              current && current < dayjs().startOf('day')
            }
          />
        </Form.Item>

        {/* Actions */}
        <Form.Item style={{ marginBottom: 0 }}>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<BellOutlined />}
            >
              {initialValues ? 'Save' : 'Add Reminder'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default ReminderFormModal;
