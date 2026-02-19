import { useState } from 'react';
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
  message,
  Divider,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import { apiClient } from '../providers/apiClient';
import { colors } from '../theme/apisTheme';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface CreateHiveForm {
  name: string;
  queen_introduced_at?: dayjs.Dayjs;
  queen_source?: string;
  queen_source_other?: string;
  brood_boxes: number;
  honey_supers: number;
  notes?: string;
}

const QUEEN_SOURCES = [
  { value: 'breeder', label: 'Breeder', description: 'Purchased from a breeder' },
  { value: 'swarm', label: 'Swarm', description: 'Captured from a swarm' },
  { value: 'split', label: 'Split', description: 'Split from another hive' },
  { value: 'package', label: 'Package', description: 'Came with a package' },
  { value: 'other', label: 'Other', description: 'Other source' },
];

/**
 * Hive Create Page
 *
 * Form for creating a new hive within a site.
 * Captures queen information, box configuration, and notes.
 *
 * Part of Epic 5, Story 5.1: Create and Configure Hives
 */
export function HiveCreate() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm<CreateHiveForm>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: CreateHiveForm) => {
    try {
      setSubmitting(true);
      // If "other" is selected, use the custom text; otherwise use the dropdown value
      const queenSource = values.queen_source === 'other' && values.queen_source_other
        ? `other: ${values.queen_source_other}`
        : values.queen_source || null;

      const response = await apiClient.post(`/sites/${siteId}/hives`, {
        name: values.name,
        queen_introduced_at: values.queen_introduced_at?.format('YYYY-MM-DD') || null,
        queen_source: queenSource,
        brood_boxes: values.brood_boxes,
        honey_supers: values.honey_supers,
        notes: values.notes || null,
      });

      message.success(`Hive "${values.name}" created successfully`);
      navigate(`/hives/${response.data.data.id}`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        message.error(error.response.data.error);
      } else {
        message.error('Failed to create hive');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate(`/sites/${siteId}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            Back to Site
          </Button>
          <Title level={2} style={{ margin: 0 }}>Add Hive</Title>
        </Space>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ brood_boxes: 1, honey_supers: 0 }}
          style={{ maxWidth: 600 }}
        >
          {/* Basic Information */}
          <Form.Item
            name="name"
            label="Hive Name"
            rules={[{ required: true, message: 'Please enter a hive name or number' }]}
          >
            <Input placeholder="e.g., Hive 1, Queen Bee Palace, etc." />
          </Form.Item>

          <Divider orientation="left" style={{ color: colors.textMuted }}>
            <span style={{ fontSize: 14 }}>Queen Information</span>
          </Divider>

          <Form.Item
            name="queen_introduced_at"
            label="Queen Introduction Date"
            tooltip="When was the current queen introduced to this hive?"
          >
            <DatePicker
              style={{ width: '100%' }}
              placeholder="Select date"
              format="YYYY-MM-DD"
              disabledDate={(current) => current && current > dayjs().endOf('day')}
            />
          </Form.Item>

          <Form.Item
            name="queen_source"
            label="Queen Source"
            tooltip="Where did this queen come from?"
          >
            <Select
              placeholder="Select queen source"
              allowClear
              options={QUEEN_SOURCES.map((s) => ({
                value: s.value,
                label: s.label,
              }))}
              optionRender={(option) => {
                const source = QUEEN_SOURCES.find((s) => s.value === option.value);
                return (
                  <Space direction="vertical" size={0}>
                    <span>{option.label}</span>
                    {source && (
                      <Text type="secondary" style={{ fontSize: 12 }}>{source.description}</Text>
                    )}
                  </Space>
                );
              }}
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
              <InputNumber
                min={1}
                max={3}
                style={{ width: '100%' }}
                addonAfter={
                  <span style={{ color: colors.textMuted }}>
                    {form.getFieldValue('brood_boxes') === 1 ? 'box' : 'boxes'}
                  </span>
                }
              />
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
              <InputNumber
                min={0}
                max={5}
                style={{ width: '100%' }}
                addonAfter={
                  <span style={{ color: colors.textMuted }}>
                    {form.getFieldValue('honey_supers') === 1 ? 'super' : 'supers'}
                  </span>
                }
              />
            </Form.Item>
          </div>

          {/* Visual box preview
              NOTE: Uses flexDirection: 'column-reverse' so elements render bottom-up:
              - First in code = bottom of visual (brood boxes at foundation)
              - Last in code = top of visual (roof on top)
              This creates an intuitive hive stack: brood -> supers -> roof
          */}
          <Form.Item noStyle shouldUpdate={(prev, cur) =>
            prev.brood_boxes !== cur.brood_boxes || prev.honey_supers !== cur.honey_supers
          }>
            {({ getFieldValue }) => {
              const broodBoxes = getFieldValue('brood_boxes') || 1;
              const honeySupers = getFieldValue('honey_supers') || 0;
              return (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column-reverse', // Elements stack bottom-up: first=bottom, last=top
                  alignItems: 'center',
                  padding: 16,
                  backgroundColor: 'rgba(247, 164, 45, 0.08)',
                  borderRadius: 8,
                  marginBottom: 16,
                }}>
                  {/* Brood boxes - brown (rendered first = appears at bottom due to column-reverse) */}
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
                  {/* Honey supers - gold (rendered second = appears above brood) */}
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
                  {/* Roof (rendered last = appears at top due to column-reverse) */}
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
            <span style={{ fontSize: 14 }}>Additional Notes</span>
          </Divider>

          <Form.Item name="notes" label="Notes">
            <TextArea
              rows={3}
              placeholder="Any additional notes about this hive..."
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
                Create Hive
              </Button>
              <Button onClick={handleBack}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default HiveCreate;
