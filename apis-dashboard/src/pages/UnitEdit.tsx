import { useState, useEffect } from 'react';
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
import { apiClient } from '../providers/apiClient';
import { useUnitDetail, useSites } from '../hooks';

const { Title, Text } = Typography;
const { Option } = Select;

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
 * Refactored for Layered Hooks Architecture
 */
export function UnitEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm<EditUnitForm>();
  const [submitting, setSubmitting] = useState(false);

  // Use hooks for unit and sites
  const { unit, loading } = useUnitDetail(id || '');
  const { sites, loading: loadingSites } = useSites();

  // Set form values when unit loads
  useEffect(() => {
    if (unit) {
      form.setFieldsValue({
        name: unit.name || undefined,
        site_id: unit.site_id || undefined,
      });
    }
  }, [unit, form]);

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
          <Title level={2} style={{ margin: 0 }}>Edit Unit: {unit?.serial}</Title>
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
            <Text strong>{unit?.serial}</Text>
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
