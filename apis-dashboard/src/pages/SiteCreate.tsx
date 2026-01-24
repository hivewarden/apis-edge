import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  message,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { apiClient } from '../providers/apiClient';

const { Title } = Typography;
const { Option } = Select;

interface CreateSiteForm {
  name: string;
  latitude?: number;
  longitude?: number;
  timezone: string;
}

// Common IANA timezones for European and global users
const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Brussels', label: 'Europe/Brussels' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid' },
  { value: 'Europe/Rome', label: 'Europe/Rome' },
  { value: 'Europe/Vienna', label: 'Europe/Vienna' },
  { value: 'Europe/Zurich', label: 'Europe/Zurich' },
  { value: 'Europe/Warsaw', label: 'Europe/Warsaw' },
  { value: 'Europe/Prague', label: 'Europe/Prague' },
  { value: 'Europe/Stockholm', label: 'Europe/Stockholm' },
  { value: 'Europe/Oslo', label: 'Europe/Oslo' },
  { value: 'Europe/Helsinki', label: 'Europe/Helsinki' },
  { value: 'Europe/Athens', label: 'Europe/Athens' },
  { value: 'Europe/Lisbon', label: 'Europe/Lisbon' },
  { value: 'Europe/Dublin', label: 'Europe/Dublin' },
  { value: 'America/New_York', label: 'America/New York' },
  { value: 'America/Chicago', label: 'America/Chicago' },
  { value: 'America/Denver', label: 'America/Denver' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles' },
  { value: 'America/Toronto', label: 'America/Toronto' },
  { value: 'America/Vancouver', label: 'America/Vancouver' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland' },
];

/**
 * Site Create Page
 *
 * Form for creating a new site with name, GPS coordinates, and timezone.
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 */
export function SiteCreate() {
  const navigate = useNavigate();
  const [form] = Form.useForm<CreateSiteForm>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: CreateSiteForm) => {
    try {
      setSubmitting(true);
      await apiClient.post('/sites', {
        name: values.name,
        latitude: values.latitude || null,
        longitude: values.longitude || null,
        timezone: values.timezone || 'UTC',
      });

      message.success('Site created successfully');
      navigate('/sites');
    } catch {
      message.error('Failed to create site');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate('/sites');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            Back
          </Button>
          <Title level={2} style={{ margin: 0 }}>Add Site</Title>
        </Space>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ timezone: 'Europe/Brussels' }}
          style={{ maxWidth: 600 }}
        >
          <Form.Item
            name="name"
            label="Site Name"
            rules={[{ required: true, message: 'Please enter a site name' }]}
          >
            <Input placeholder="e.g., Home Apiary" />
          </Form.Item>

          <Form.Item label="GPS Coordinates" style={{ marginBottom: 8 }}>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item
                name="latitude"
                noStyle
                rules={[
                  {
                    type: 'number',
                    min: -90,
                    max: 90,
                    message: 'Latitude must be between -90 and 90',
                  },
                ]}
              >
                <InputNumber
                  placeholder="Latitude (e.g., 50.8503)"
                  style={{ width: '50%' }}
                  step={0.0001}
                  precision={7}
                />
              </Form.Item>
              <Form.Item
                name="longitude"
                noStyle
                rules={[
                  {
                    type: 'number',
                    min: -180,
                    max: 180,
                    message: 'Longitude must be between -180 and 180',
                  },
                ]}
              >
                <InputNumber
                  placeholder="Longitude (e.g., 4.3517)"
                  style={{ width: '50%' }}
                  step={0.0001}
                  precision={7}
                />
              </Form.Item>
            </Space.Compact>
          </Form.Item>
          <Form.Item style={{ marginBottom: 16 }}>
            <span style={{ color: '#666', fontSize: 12 }}>
              Optional. Used for weather data and location display.
            </span>
          </Form.Item>

          <Form.Item
            name="timezone"
            label="Timezone"
            rules={[{ required: true, message: 'Please select a timezone' }]}
          >
            <Select
              showSearch
              placeholder="Select timezone"
              optionFilterProp="children"
            >
              {TIMEZONES.map((tz) => (
                <Option key={tz.value} value={tz.value}>
                  {tz.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={submitting}
              >
                Save
              </Button>
              <Button onClick={handleBack}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default SiteCreate;
