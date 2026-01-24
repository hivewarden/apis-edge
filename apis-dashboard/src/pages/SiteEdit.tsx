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
  Space,
  Spin,
  message,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiClient } from '../providers/apiClient';

const { Title } = Typography;
const { Option } = Select;

interface Site {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
}

interface SiteResponse {
  data: Site;
}

interface EditSiteForm {
  name: string;
  latitude?: number;
  longitude?: number;
  timezone: string;
}

// Common IANA timezones - same list as SiteCreate
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
 * Site Edit Page
 *
 * Form for editing an existing site.
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 */
export function SiteEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm<EditSiteForm>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [siteName, setSiteName] = useState('');

  const fetchSite = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<SiteResponse>(`/sites/${id}`);
      const siteData = response.data.data;
      setSiteName(siteData.name);
      form.setFieldsValue({
        name: siteData.name,
        latitude: siteData.latitude ?? undefined,
        longitude: siteData.longitude ?? undefined,
        timezone: siteData.timezone,
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        message.error('Site not found');
      } else {
        message.error('Failed to load site');
      }
      navigate('/sites');
    } finally {
      setLoading(false);
    }
  }, [id, form, navigate]);

  useEffect(() => {
    if (id) {
      fetchSite();
    }
  }, [id, fetchSite]);

  const handleSubmit = async (values: EditSiteForm) => {
    try {
      setSubmitting(true);
      await apiClient.put(`/sites/${id}`, {
        name: values.name,
        latitude: values.latitude ?? null,
        longitude: values.longitude ?? null,
        timezone: values.timezone,
      });

      message.success('Site updated successfully');
      navigate(`/sites/${id}`);
    } catch {
      message.error('Failed to update site');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate(`/sites/${id}`);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            Back
          </Button>
          <Title level={2} style={{ margin: 0 }}>Edit: {siteName}</Title>
        </Space>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
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

export default SiteEdit;
