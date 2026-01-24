import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  message,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { apiClient } from '../providers/apiClient';
import { APIKeyModal } from '../components/APIKeyModal';

const { Title } = Typography;
const { Option } = Select;

interface Site {
  id: string;
  name: string;
}

interface SitesResponse {
  data: Site[];
}

interface RegisterUnitForm {
  serial: string;
  name?: string;
  site_id?: string;
}

interface UnitCreateResponse {
  data: {
    id: string;
    serial: string;
    name: string | null;
    site_id: string | null;
    api_key: string;
    status: string;
    created_at: string;
  };
  warning: string;
}

/**
 * Unit Register Page
 *
 * Form for registering a new APIS unit.
 * Displays the generated API key in a modal after successful registration.
 *
 * Part of Epic 2, Story 2.2: Register APIS Units
 */
export function UnitRegister() {
  const navigate = useNavigate();
  const [form] = Form.useForm<RegisterUnitForm>();
  const [submitting, setSubmitting] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);

  useEffect(() => {
    fetchSites();
  }, []);

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

  const handleSubmit = async (values: RegisterUnitForm) => {
    try {
      setSubmitting(true);
      const response = await apiClient.post<UnitCreateResponse>('/units', {
        serial: values.serial,
        name: values.name || null,
        site_id: values.site_id || null,
      });

      // Store the API key and show the modal
      setApiKey(response.data.data.api_key);
      setShowKeyModal(true);
      message.success('Unit registered successfully');
    } catch (error) {
      // Check for duplicate serial error
      if ((error as { response?: { status?: number } })?.response?.status === 409) {
        message.error('A unit with this serial number already exists');
      } else {
        message.error('Failed to register unit');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyModalClose = () => {
    setShowKeyModal(false);
    setApiKey(null);
    navigate('/units');
  };

  const handleBack = () => {
    navigate('/units');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            Back
          </Button>
          <Title level={2} style={{ margin: 0 }}>Register Unit</Title>
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
            name="serial"
            label="Serial Number"
            rules={[{ required: true, message: 'Please enter the unit serial number' }]}
            extra="The unique identifier printed on your APIS unit (e.g., APIS-001)"
          >
            <Input placeholder="e.g., APIS-001" />
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
            extra="Optional. You can assign to a site later."
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
                Register Unit
              </Button>
              <Button onClick={handleBack}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {apiKey && (
        <APIKeyModal
          visible={showKeyModal}
          apiKey={apiKey}
          onClose={handleKeyModalClose}
          isRegenerate={false}
        />
      )}
    </div>
  );
}

export default UnitRegister;
