import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Space,
  Spin,
  message,
  Form,
  DatePicker,
  Radio,
  InputNumber,
  Checkbox,
  Input,
  Alert,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, CloudOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { apiClient } from '../providers/apiClient';
import { colors } from '../theme/apisTheme';
import { useOnlineStatus } from '../hooks';
import { db } from '../services/db';
import { updateOfflineInspection } from '../services/offlineInspection';
import type { PendingInspection } from '../services/db';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Inspection {
  id: string;
  hive_id: string;
  inspected_at: string;
  queen_seen: boolean | null;
  eggs_seen: boolean | null;
  queen_cells: boolean | null;
  brood_frames: number | null;
  brood_pattern: string | null;
  honey_level: string | null;
  pollen_level: string | null;
  temperament: string | null;
  issues: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface InspectionResponse {
  data: Inspection;
}

interface InspectionFormValues {
  inspected_at: dayjs.Dayjs;
  queen_seen: boolean | null;
  eggs_seen: boolean | null;
  queen_cells: boolean | null;
  brood_frames: number | null;
  brood_pattern: string | null;
  honey_level: string | null;
  pollen_level: string | null;
  temperament: string | null;
  issues: string[];
  other_issue: string;
  notes: string;
}

const ISSUE_OPTIONS = [
  { value: 'dwv', label: 'DWV (Deformed Wing Virus)' },
  { value: 'chalkbrood', label: 'Chalkbrood' },
  { value: 'wax_moth', label: 'Wax Moth' },
  { value: 'robbing', label: 'Robbing' },
];

/**
 * Inspection Edit Page
 *
 * Allows editing an inspection within the 24-hour edit window.
 * Also supports editing offline inspections (pending_sync=true).
 *
 * Part of Epic 5, Story 5.4: Inspection History View
 * Enhanced in Story 7.3 for offline inspection editing
 */
export function InspectionEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [isOfflineInspection, setIsOfflineInspection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<InspectionFormValues>();

  const fetchInspection = useCallback(async () => {
    try {
      setLoading(true);

      // Check if this is an offline inspection (local_id format)
      if (id?.startsWith('local_')) {
        // Fetch from IndexedDB
        const offlineInspection = await db.inspections
          .where('local_id')
          .equals(id)
          .first() as PendingInspection | undefined;

        if (!offlineInspection) {
          message.error('Offline inspection not found');
          navigate(-1);
          return;
        }

        setIsOfflineInspection(true);

        // Parse issues from JSON string if stored that way
        let issues: string[] = [];
        if (offlineInspection.issues) {
          try {
            issues = JSON.parse(offlineInspection.issues);
          } catch {
            issues = [offlineInspection.issues];
          }
        }

        // Convert to Inspection format
        const data: Inspection = {
          id: offlineInspection.id,
          hive_id: offlineInspection.hive_id,
          inspected_at: offlineInspection.date,
          queen_seen: offlineInspection.queen_seen,
          eggs_seen: offlineInspection.eggs_seen,
          queen_cells: offlineInspection.queen_cells > 0,
          brood_frames: offlineInspection.brood_frames,
          brood_pattern: offlineInspection.brood_pattern,
          honey_level: offlineInspection.honey_stores,
          pollen_level: offlineInspection.pollen_stores,
          temperament: offlineInspection.temperament,
          issues,
          notes: offlineInspection.notes,
          created_at: offlineInspection.created_at,
          updated_at: offlineInspection.updated_at,
        };

        setInspection(data);

        // Extract "other" issue if present
        const predefinedIssues = issues.filter((i) => !i.startsWith('other:'));
        const otherIssue = issues.find((i) => i.startsWith('other:'));

        // Populate form
        form.setFieldsValue({
          inspected_at: dayjs(data.inspected_at),
          queen_seen: data.queen_seen,
          eggs_seen: data.eggs_seen,
          queen_cells: data.queen_cells,
          brood_frames: data.brood_frames,
          brood_pattern: data.brood_pattern,
          honey_level: data.honey_level,
          pollen_level: data.pollen_level,
          temperament: data.temperament,
          issues: predefinedIssues,
          other_issue: otherIssue ? otherIssue.substring(6) : '',
          notes: data.notes || '',
        });
      } else {
        // Fetch from API
        const response = await apiClient.get<InspectionResponse>(`/inspections/${id}`);
        const data = response.data.data;
        setInspection(data);
        setIsOfflineInspection(false);

        // Extract "other" issue if present
        const predefinedIssues = data.issues.filter((i) => !i.startsWith('other:'));
        const otherIssue = data.issues.find((i) => i.startsWith('other:'));

        // Populate form
        form.setFieldsValue({
          inspected_at: dayjs(data.inspected_at),
          queen_seen: data.queen_seen,
          eggs_seen: data.eggs_seen,
          queen_cells: data.queen_cells,
          brood_frames: data.brood_frames,
          brood_pattern: data.brood_pattern,
          honey_level: data.honey_level,
          pollen_level: data.pollen_level,
          temperament: data.temperament,
          issues: predefinedIssues,
          other_issue: otherIssue ? otherIssue.substring(6) : '',
          notes: data.notes || '',
        });
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        message.error('Inspection not found');
      } else {
        message.error('Failed to load inspection');
      }
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [id, navigate, form]);

  useEffect(() => {
    if (id) {
      fetchInspection();
    }
  }, [id, fetchInspection]);

  const handleSubmit = async (values: InspectionFormValues) => {
    if (!inspection) return;

    try {
      setSaving(true);

      // Build issues array
      const issues = [...(values.issues || [])];
      if (values.other_issue?.trim()) {
        issues.push(`other:${values.other_issue.trim()}`);
      }

      const updateData = {
        inspected_at: values.inspected_at.format('YYYY-MM-DD'),
        queen_seen: values.queen_seen,
        eggs_seen: values.eggs_seen,
        queen_cells: values.queen_cells,
        brood_frames: values.brood_frames,
        brood_pattern: values.brood_pattern,
        honey_level: values.honey_level,
        pollen_level: values.pollen_level,
        temperament: values.temperament,
        issues,
        notes: values.notes || null,
      };

      if (isOfflineInspection && id) {
        // Update offline inspection in IndexedDB
        await updateOfflineInspection(id, updateData);
        message.success({
          content: (
            <span>
              <CloudOutlined style={{ marginRight: 8 }} />
              Inspection updated locally - will sync when online
            </span>
          ),
          duration: 4,
        });
      } else {
        // Update via API
        await apiClient.put(`/inspections/${id}`, updateData);
        message.success('Inspection updated successfully');
      }

      navigate(`/hives/${inspection.hive_id}`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        message.error('Edit window has expired (24 hours)');
      } else if (axios.isAxiosError(error) && error.response?.data?.error) {
        message.error(error.response.data.error);
      } else {
        message.error('Failed to update inspection');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!inspection) {
    return null;
  }

  // Check edit window
  // Use 23.5 hours as buffer to prevent edge case timing issues between client/server clocks
  const createdAt = dayjs(inspection.created_at);
  const hoursSinceCreation = dayjs().diff(createdAt, 'hour', true);
  const hoursRemaining = Math.max(0, Math.floor(24 - hoursSinceCreation));

  // Offline inspections are always editable
  // Server inspections are editable within ~24 hours (23.5h buffer) AND when online
  const isEditable = isOfflineInspection
    ? true
    : (hoursSinceCreation < 23.5 && isOnline);

  // Synced inspections cannot be edited while offline
  const isOfflineBlocked = !isOfflineInspection && !isOnline;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/hives/${inspection.hive_id}`)}
          style={{ marginBottom: 16 }}
        >
          Back to Hive
        </Button>
        <Title level={2} style={{ margin: 0 }}>Edit Inspection</Title>
        <Text type="secondary">
          {dayjs(inspection.inspected_at).format('MMMM D, YYYY')}
        </Text>
      </div>

      {isOfflineInspection && (
        <Alert
          type="info"
          message="Offline inspection"
          description="This inspection was created offline and hasn't synced yet. You can edit it freely until it syncs."
          style={{ marginBottom: 24 }}
          icon={<CloudOutlined />}
          showIcon
        />
      )}

      {isOfflineBlocked && (
        <Alert
          type="warning"
          message="Cannot edit while offline"
          description="This inspection has already synced to the server. Please reconnect to edit it."
          style={{ marginBottom: 24 }}
          showIcon
        />
      )}

      {!isEditable && !isOfflineInspection && !isOfflineBlocked && (
        <Alert
          type="warning"
          message="Edit window expired"
          description="This inspection was created more than 24 hours ago and can no longer be edited."
          style={{ marginBottom: 24 }}
          showIcon
        />
      )}

      {isEditable && !isOfflineInspection && hoursRemaining <= 6 && (
        <Alert
          type="info"
          message={`Edit window closing in ${hoursRemaining} hours`}
          style={{ marginBottom: 24 }}
          showIcon
        />
      )}

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          disabled={!isEditable}
        >
          <Form.Item
            name="inspected_at"
            label="Inspection Date"
            rules={[{ required: true, message: 'Please select a date' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              disabledDate={(current) => current && current > dayjs().endOf('day')}
            />
          </Form.Item>

          <Card size="small" title="Queen Observations" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Form.Item name="queen_seen" label="Queen Seen?" style={{ marginBottom: 8 }}>
                <Radio.Group>
                  <Radio value={true}>Yes</Radio>
                  <Radio value={false}>No</Radio>
                  <Radio value={null}>Not recorded</Radio>
                </Radio.Group>
              </Form.Item>
              <Form.Item name="eggs_seen" label="Eggs Seen?" style={{ marginBottom: 8 }}>
                <Radio.Group>
                  <Radio value={true}>Yes</Radio>
                  <Radio value={false}>No</Radio>
                  <Radio value={null}>Not recorded</Radio>
                </Radio.Group>
              </Form.Item>
              <Form.Item name="queen_cells" label="Queen Cells Present?" style={{ marginBottom: 0 }}>
                <Radio.Group>
                  <Radio value={true}>Yes</Radio>
                  <Radio value={false}>No</Radio>
                  <Radio value={null}>Not recorded</Radio>
                </Radio.Group>
              </Form.Item>
            </Space>
          </Card>

          <Card size="small" title="Brood Assessment" style={{ marginBottom: 16 }}>
            <Form.Item name="brood_frames" label="Brood Frames" style={{ marginBottom: 8 }}>
              <InputNumber min={0} max={20} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="brood_pattern" label="Brood Pattern" style={{ marginBottom: 8 }}>
              <Radio.Group>
                <Radio value="good">Good</Radio>
                <Radio value="spotty">Spotty</Radio>
                <Radio value="poor">Poor</Radio>
                <Radio value={null}>Not recorded</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="temperament" label="Temperament" style={{ marginBottom: 0 }}>
              <Radio.Group>
                <Radio value="calm">Calm</Radio>
                <Radio value="nervous">Nervous</Radio>
                <Radio value="aggressive">Aggressive</Radio>
                <Radio value={null}>Not recorded</Radio>
              </Radio.Group>
            </Form.Item>
          </Card>

          <Card size="small" title="Stores Assessment" style={{ marginBottom: 16 }}>
            <Form.Item name="honey_level" label="Honey Level" style={{ marginBottom: 8 }}>
              <Radio.Group>
                <Radio value="low">Low</Radio>
                <Radio value="medium">Medium</Radio>
                <Radio value="high">High</Radio>
                <Radio value={null}>Not recorded</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="pollen_level" label="Pollen Level" style={{ marginBottom: 0 }}>
              <Radio.Group>
                <Radio value="low">Low</Radio>
                <Radio value="medium">Medium</Radio>
                <Radio value="high">High</Radio>
                <Radio value={null}>Not recorded</Radio>
              </Radio.Group>
            </Form.Item>
          </Card>

          <Card size="small" title="Issues" style={{ marginBottom: 16 }}>
            <Form.Item name="issues" style={{ marginBottom: 8 }}>
              <Checkbox.Group options={ISSUE_OPTIONS} />
            </Form.Item>
            <Form.Item name="other_issue" label="Other Issue" style={{ marginBottom: 0 }}>
              <Input placeholder="Describe any other issues..." maxLength={200} />
            </Form.Item>
          </Card>

          <Form.Item name="notes" label="Notes">
            <TextArea rows={4} maxLength={2000} showCount />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button onClick={() => navigate(`/hives/${inspection.hive_id}`)}>
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
                disabled={!isEditable}
                icon={<SaveOutlined />}
                style={{
                  backgroundColor: colors.seaBuckthorn,
                  borderColor: colors.seaBuckthorn,
                }}
              >
                Save Changes
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default InspectionEdit;
