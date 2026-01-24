import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Spin,
  message,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiClient } from '../providers/apiClient';

const { Title, Text } = Typography;
const { Option } = Select;

interface Unit {
  id: string;
  serial: string;
  name: string | null;
  site_id: string | null;
}

interface Site {
  id: string;
  name: string;
}

interface UnitResponse {
  data: Unit;
}

interface SitesResponse {
  data: Site[];
}

interface EditUnitForm {
  name?: string;
  site_id?: string;
}

/**
 * Unit Edit Page
 *
 * Form for editing an existing APIS unit.
 *
 * Part of Epic 2, Story 2.2: Register APIS Units
 */
export function UnitEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm<EditUnitForm>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [unitSerial, setUnitSerial] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);

  const fetchUnit = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<UnitResponse>(`/units/${id}`);
      const unitData = response.data.data;
      setUnitSerial(unitData.serial);
      form.setFieldsValue({
        name: unitData.name || undefined,
        site_id: unitData.site_id || undefined,
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        message.error('Unit not found');
      } else {
        message.error('Failed to load unit');
      }
      navigate('/units');
    } finally {
      setLoading(false);
    }
  }, [id, form, navigate]);

  const fetchSites = async () => {
    try {
      setLoadingSites(true);
      const response = await apiClient.get<SitesResponse>('/sites');
      setSites(response.data.data || []);
    } catch {
      message.warning('Failed to load sites');
    } finally {
      setLoadingSites(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchUnit();
      fetchSites();
    }
  }, [id, fetchUnit]);

  const handleSubmit = async (values: EditUnitForm) => {
    try {
      setSubmitting(true);
      await apiClient.put(`/units/${id}`, {
        name: values.name || null,
        site_id: values.site_id || null,
      });

      message.success('Unit updated successfully');
      navigate(`/units/${id}`);
    } catch {
      message.error('Failed to update unit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    navigate(`/units/${id}`);
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
          <Title level={2} style={{ margin: 0 }}>Edit Unit: {unitSerial}</Title>
        </Space>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ maxWidth: 600 }}
        >
          <Form.Item label="Serial Number">
            <Text strong>{unitSerial}</Text>
            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
              Serial number cannot be changed after registration.
            </Text>
          </Form.Item>

          <Form.Item
            name="name"
            label="Unit Name"
            extra="Optional friendly name to help identify this unit"
          >
            <Input placeholder="e.g., Garden Unit, Hive Protector 1" />
          </Form.Item>

          <Form.Item
            name="site_id"
            label="Assigned Site"
          >
            <Select
              placeholder="Select a site (optional)"
              allowClear
              loading={loadingSites}
              showSearch
              optionFilterProp="children"
            >
              {sites.map((site) => (
                <Option key={site.id} value={site.id}>
                  {site.name}
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

export default UnitEdit;
