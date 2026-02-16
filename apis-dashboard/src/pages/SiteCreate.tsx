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
import { apiClient } from '../providers/apiClient';
import { TIMEZONES } from '../constants';
import { colors, touchTargets } from '../theme/apisTheme';

const { Title } = Typography;
const { Option } = Select;

// Consistent input styling per DESIGN-KEY
const inputStyle = {
  height: touchTargets.inputHeight, // 52px
  borderRadius: 12,
};

// Card styling per DESIGN-KEY
const cardStyle = {
  borderRadius: 16, // rounded-2xl
  boxShadow: '0 4px 20px -2px rgba(102, 38, 4, 0.05)', // shadow-soft
};

// Label styling per DESIGN-KEY
const labelStyle = {
  fontSize: 14,
  fontWeight: 500,
  color: colors.brownBramble,
};

interface CreateSiteForm {
  name: string;
  latitude?: number;
  longitude?: number;
  timezone: string;
}

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
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 16 }}>
        <Button
          onClick={handleBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 9999,
            border: '1px solid #d6d3d1', // border-stone-300
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
          Back
        </Button>
        <Title level={2} style={{ margin: 0 }}>Add Site</Title>
      </div>

      <Card style={cardStyle}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ timezone: 'Europe/Brussels' }}
          style={{ maxWidth: 600 }}
        >
          <Form.Item
            name="name"
            label={<span style={labelStyle}>Site Name</span>}
            rules={[{ required: true, message: 'Please enter a site name' }]}
            style={{ marginBottom: 24 }}
          >
            <Input
              placeholder="e.g., Home Apiary"
              style={inputStyle}
              prefix={<span className="material-symbols-outlined" style={{ fontSize: 20, color: colors.brownBramble, opacity: 0.4 }}>location_on</span>}
            />
          </Form.Item>

          <Form.Item
            label={<span style={labelStyle}>GPS Coordinates</span>}
            style={{ marginBottom: 8 }}
          >
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
                  style={{ width: '50%', height: touchTargets.inputHeight, borderRadius: '12px 0 0 12px' }}
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
                  style={{ width: '50%', height: touchTargets.inputHeight, borderRadius: '0 12px 12px 0' }}
                  step={0.0001}
                  precision={7}
                />
              </Form.Item>
            </Space.Compact>
          </Form.Item>
          <Form.Item style={{ marginBottom: 24 }}>
            <span style={{ color: colors.brownBramble, opacity: 0.6, fontSize: 12 }}>
              Optional. Used for weather data and location display.
            </span>
          </Form.Item>

          <Form.Item
            name="timezone"
            label={<span style={labelStyle}>Timezone</span>}
            rules={[{ required: true, message: 'Please select a timezone' }]}
            style={{ marginBottom: 24 }}
          >
            <Select
              showSearch
              placeholder="Select timezone"
              optionFilterProp="children"
              style={{ height: touchTargets.inputHeight }}
            >
              {TIMEZONES.map((tz) => (
                <Option key={tz.value} value={tz.value}>
                  {tz.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space size={16}>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 48,
                  borderRadius: 9999,
                  paddingLeft: 24,
                  paddingRight: 24,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>save</span>
                Save
              </Button>
              <Button
                onClick={handleBack}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 48,
                  borderRadius: 9999,
                  border: '1px solid #d6d3d1', // border-stone-300
                  paddingLeft: 24,
                  paddingRight: 24,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default SiteCreate;
