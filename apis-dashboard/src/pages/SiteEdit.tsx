import { useState, useEffect, useCallback, Suspense } from 'react';
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
import { apiClient } from '../providers/apiClient';
import { TIMEZONES } from '../constants';
import { useSiteDetail } from '../hooks';
import { colors, touchTargets } from '../theme/apisTheme';
import { LazyLocationPickerMap, MapSkeleton } from '../components/lazy';

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
const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: colors.brownBramble,
};

interface EditSiteForm {
  name: string;
  latitude?: number;
  longitude?: number;
  timezone: string;
}

/**
 * Site Edit Page
 *
 * Form for editing an existing site with interactive map picker.
 *
 * Part of Epic 2, Story 2.1: Create and Manage Sites
 * Refactored for Layered Hooks Architecture + DESIGN-KEY styling
 */
export function SiteEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm<EditSiteForm>();
  const [submitting, setSubmitting] = useState(false);
  const [mapLat, setMapLat] = useState<number | null>(null);
  const [mapLng, setMapLng] = useState<number | null>(null);

  // Use hook for site detail
  const { site, loading } = useSiteDetail(id || '');


  // Set form values and map state when site loads
  useEffect(() => {
    if (site) {
      form.setFieldsValue({
        name: site.name,
        latitude: site.latitude ?? undefined,
        longitude: site.longitude ?? undefined,
        timezone: site.timezone,
      });
      setMapLat(site.latitude ?? null);
      setMapLng(site.longitude ?? null);
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

  // Map → form sync
  const handleMapChange = useCallback(
    (lat: number | null, lng: number | null) => {
      setMapLat(lat);
      setMapLng(lng);
      form.setFieldsValue({
        latitude: lat ?? undefined,
        longitude: lng ?? undefined,
      });
    },
    [form]
  );

  // Form → map sync
  const handleCoordChange = useCallback(() => {
    const lat = form.getFieldValue('latitude') as number | undefined;
    const lng = form.getFieldValue('longitude') as number | undefined;
    setMapLat(lat ?? null);
    setMapLng(lng ?? null);
  }, [form]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

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
            border: '1px solid #d6d3d1',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
          Back
        </Button>
        <Title level={2} style={{ margin: 0 }}>Edit: {site?.name}</Title>
      </div>

      <Card style={cardStyle}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
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
                  onChange={handleCoordChange}
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
                  onChange={handleCoordChange}
                />
              </Form.Item>
            </Space.Compact>
          </Form.Item>
          <Form.Item style={{ marginBottom: 16 }}>
            <span style={{ color: colors.brownBramble, opacity: 0.6, fontSize: 12 }}>
              Search an address or click the map to set location
            </span>
          </Form.Item>

          {/* Interactive map picker */}
          <Form.Item style={{ marginBottom: 24 }}>
            <Suspense fallback={<MapSkeleton />}>
              <LazyLocationPickerMap
                latitude={mapLat}
                longitude={mapLng}
                onChange={handleMapChange}
              />
            </Suspense>
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
                  border: '1px solid #d6d3d1',
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

export default SiteEdit;
