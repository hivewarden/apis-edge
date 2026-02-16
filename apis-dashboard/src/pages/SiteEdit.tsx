import { useState, useEffect } from 'react';
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
import { apiClient } from '../providers/apiClient';
import { TIMEZONES } from '../constants';
import { useSiteDetail } from '../hooks';

const { Title } = Typography;
const { Option } = Select;

interface EditSiteForm {
  name: string;
  latitude?: number;
  longitude?: number;
  timezone: string;
}

/**
 * Site Edit Page
 *
 * Form for editing an existing site.
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 * Refactored for Layered Hooks Architecture
 */
export function SiteEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm<EditSiteForm>();
  const [submitting, setSubmitting] = useState(false);

  // Use hook for site detail
  const { site, loading } = useSiteDetail(id || '');

  // Set form values when site loads
  useEffect(() => {
    if (site) {
      form.setFieldsValue({
        name: site.name,
        latitude: site.latitude ?? undefined,
        longitude: site.longitude ?? undefined,
        timezone: site.timezone,
      });
    }
  }, [site, form]);

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
          <Title level={2} style={{ margin: 0 }}>Edit: {site?.name}</Title>
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
