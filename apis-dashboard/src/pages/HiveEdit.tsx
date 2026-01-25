import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Space,
  Spin,
  message,
  Divider,
  Alert,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import { apiClient } from '../providers/apiClient';
import { colors } from '../theme/apisTheme';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Hive {
  id: string;
  site_id: string;
  name: string;
  queen_introduced_at: string | null;
  queen_source: string | null;
  brood_boxes: number;
  honey_supers: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface HiveResponse {
  data: Hive;
}

interface EditHiveForm {
  name: string;
  queen_introduced_at?: dayjs.Dayjs;
  queen_source?: string;
  queen_source_other?: string;
  brood_boxes: number;
  honey_supers: number;
  notes?: string;
}

const QUEEN_SOURCES = [
  { value: 'breeder', label: 'Breeder' },
  { value: 'swarm', label: 'Swarm' },
  { value: 'split', label: 'Split' },
  { value: 'package', label: 'Package' },
  { value: 'other', label: 'Other' },
];

/**
 * Hive Edit Page
 *
 * Form for editing an existing hive's configuration.
 * Tracks box changes when brood boxes or honey supers are modified.
 *
 * Part of Epic 5, Story 5.1: Create and Configure Hives
 */
export function HiveEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm<EditHiveForm>();
  const [hive, setHive] = useState<Hive | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [boxChanges, setBoxChanges] = useState<{ type: 'brood' | 'super'; change: 'added' | 'removed'; count: number }[]>([]);

  const fetchHive = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<HiveResponse>(`/hives/${id}`);
      const hiveData = response.data.data;
      setHive(hiveData);

      // Parse queen source - if it starts with "other: ", split into dropdown + text
      let queenSource = hiveData.queen_source || undefined;
      let queenSourceOther = undefined;
      if (queenSource && queenSource.startsWith('other: ')) {
        queenSourceOther = queenSource.substring(7);
        queenSource = 'other';
      }

      form.setFieldsValue({
        name: hiveData.name,
        queen_introduced_at: hiveData.queen_introduced_at ? dayjs(hiveData.queen_introduced_at) : undefined,
        queen_source: queenSource,
        queen_source_other: queenSourceOther,
        brood_boxes: hiveData.brood_boxes,
        honey_supers: hiveData.honey_supers,
        notes: hiveData.notes || undefined,
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        message.error('Hive not found');
      } else {
        message.error('Failed to load hive');
      }
      navigate('/hives');
    } finally {
      setLoading(false);
    }
  }, [id, form, navigate]);

  useEffect(() => {
    if (id) {
      fetchHive();
    }
  }, [id, fetchHive]);

  // Track box changes when form values change
  const handleValuesChange = (changedValues: Partial<EditHiveForm>) => {
    if (!hive) return;

    const newChanges: typeof boxChanges = [];

    if ('brood_boxes' in changedValues && changedValues.brood_boxes !== undefined) {
      const diff = changedValues.brood_boxes - hive.brood_boxes;
      if (diff !== 0) {
        newChanges.push({
          type: 'brood',
          change: diff > 0 ? 'added' : 'removed',
          count: Math.abs(diff),
        });
      }
    }

    if ('honey_supers' in changedValues && changedValues.honey_supers !== undefined) {
      const diff = changedValues.honey_supers - hive.honey_supers;
      if (diff !== 0) {
        newChanges.push({
          type: 'super',
          change: diff > 0 ? 'added' : 'removed',
          count: Math.abs(diff),
        });
      }
    }

    // Preserve previous changes for other box type
    const preservedChanges = boxChanges.filter(
      (c) => !('brood_boxes' in changedValues && c.type === 'brood') &&
             !('honey_supers' in changedValues && c.type === 'super')
    );

    setBoxChanges([...preservedChanges, ...newChanges].filter((c) => c.count > 0));
  };

  const handleSubmit = async (values: EditHiveForm) => {
    try {
      setSubmitting(true);
      // If "other" is selected, use the custom text; otherwise use the dropdown value
      const queenSource = values.queen_source === 'other' && values.queen_source_other
        ? `other: ${values.queen_source_other}`
        : values.queen_source || null;

      await apiClient.put(`/hives/${id}`, {
        name: values.name,
        queen_introduced_at: values.queen_introduced_at?.format('YYYY-MM-DD') || null,
        queen_source: queenSource,
        brood_boxes: values.brood_boxes,
        honey_supers: values.honey_supers,
        notes: values.notes || null,
      });

      message.success('Hive updated successfully');
      navigate(`/hives/${id}`);
    } catch {
      message.error('Failed to update hive');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate(`/hives/${id}`);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!hive) {
    return null;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            Back
          </Button>
          <Title level={2} style={{ margin: 0 }}>Edit {hive.name}</Title>
        </Space>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={handleValuesChange}
          style={{ maxWidth: 600 }}
        >
          <Form.Item
            name="name"
            label="Hive Name"
            rules={[{ required: true, message: 'Please enter a hive name' }]}
          >
            <Input placeholder="e.g., Hive 1" />
          </Form.Item>

          <Divider orientation="left" style={{ color: colors.textMuted }}>
            <span style={{ fontSize: 14 }}>Queen Information</span>
          </Divider>

          <Form.Item
            name="queen_introduced_at"
            label="Queen Introduction Date"
          >
            <DatePicker
              style={{ width: '100%' }}
              placeholder="Select date"
              format="YYYY-MM-DD"
              disabledDate={(current) => current && current > dayjs().endOf('day')}
            />
          </Form.Item>

          <Form.Item name="queen_source" label="Queen Source">
            <Select
              placeholder="Select queen source"
              allowClear
              options={QUEEN_SOURCES}
            />
          </Form.Item>

          {/* Show text input when "Other" is selected */}
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.queen_source !== cur.queen_source}>
            {({ getFieldValue }) =>
              getFieldValue('queen_source') === 'other' ? (
                <Form.Item
                  name="queen_source_other"
                  label="Specify Other Source"
                  rules={[{ required: true, message: 'Please specify the queen source' }]}
                >
                  <Input placeholder="e.g., Local beekeeper, rescue, etc." maxLength={100} />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Divider orientation="left" style={{ color: colors.textMuted }}>
            <span style={{ fontSize: 14 }}>Box Configuration</span>
          </Divider>

          {/* Show alert if box counts will change */}
          {boxChanges.length > 0 && (
            <Alert
              message="Box Changes Will Be Recorded"
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {boxChanges.map((change, i) => (
                    <li key={i}>
                      {change.count} {change.type === 'brood' ? 'brood box' : 'honey super'}
                      {change.count > 1 ? (change.type === 'brood' ? 'es' : 's') : ''} will be {change.change}
                    </li>
                  ))}
                </ul>
              }
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="brood_boxes"
              label="Brood Boxes"
              rules={[
                { required: true, message: 'Required' },
                { type: 'number', min: 1, max: 3, message: 'Must be 1-3' },
              ]}
              style={{ flex: 1 }}
            >
              <InputNumber min={1} max={3} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="honey_supers"
              label="Honey Supers"
              rules={[
                { required: true, message: 'Required' },
                { type: 'number', min: 0, max: 5, message: 'Must be 0-5' },
              ]}
              style={{ flex: 1 }}
            >
              <InputNumber min={0} max={5} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          {/* Visual box preview */}
          <Form.Item noStyle shouldUpdate={(prev, cur) =>
            prev.brood_boxes !== cur.brood_boxes || prev.honey_supers !== cur.honey_supers
          }>
            {({ getFieldValue }) => {
              const broodBoxes = getFieldValue('brood_boxes') || 1;
              const honeySupers = getFieldValue('honey_supers') || 0;
              return (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  alignItems: 'center',
                  padding: 16,
                  backgroundColor: 'rgba(247, 164, 45, 0.08)',
                  borderRadius: 8,
                  marginBottom: 16,
                }}>
                  {Array.from({ length: broodBoxes }).map((_, i) => (
                    <div
                      key={`brood-${i}`}
                      style={{
                        width: 120,
                        height: 24,
                        backgroundColor: colors.brownBramble,
                        borderRadius: 4,
                        marginTop: i > 0 ? 2 : 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: colors.coconutCream, fontSize: 10 }}>
                        Brood {i + 1}
                      </Text>
                    </div>
                  ))}
                  {Array.from({ length: honeySupers }).map((_, i) => (
                    <div
                      key={`super-${i}`}
                      style={{
                        width: 120,
                        height: 20,
                        backgroundColor: colors.seaBuckthorn,
                        borderRadius: 4,
                        marginTop: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10 }}>
                        Super {i + 1}
                      </Text>
                    </div>
                  ))}
                  <div
                    style={{
                      width: 130,
                      height: 12,
                      backgroundColor: colors.brownBramble,
                      borderRadius: '4px 4px 0 0',
                      marginTop: 2,
                    }}
                  />
                </div>
              );
            }}
          </Form.Item>

          <Divider orientation="left" style={{ color: colors.textMuted }}>
            <span style={{ fontSize: 14 }}>Notes</span>
          </Divider>

          <Form.Item name="notes" label="Notes">
            <TextArea
              rows={3}
              placeholder="Any additional notes..."
              maxLength={1000}
              showCount
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={submitting}
              >
                Save Changes
              </Button>
              <Button onClick={handleBack}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default HiveEdit;
