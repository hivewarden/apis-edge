import { useState } from 'react';
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
import { apiClient } from '../providers/apiClient';
import { APIKeyModal } from '../components/APIKeyModal';
import { useSites } from '../hooks';
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
 * Refactored for Layered Hooks Architecture
 */
export function UnitRegister() {
  const navigate = useNavigate();
  const [form] = Form.useForm<RegisterUnitForm>();
  const [submitting, setSubmitting] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);

  // Use hook for sites
  const { sites, loading: loadingSites } = useSites();

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
        <Title level={2} style={{ margin: 0 }}>Register Unit</Title>
      </div>

      <Card style={cardStyle}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ maxWidth: 600 }}
        >
          <Form.Item
            name="serial"
            label={<span style={labelStyle}>Serial Number</span>}
            rules={[{ required: true, message: 'Please enter the unit serial number' }]}
            extra={<span style={{ color: colors.brownBramble, opacity: 0.6, fontSize: 12 }}>The unique identifier printed on your APIS unit (e.g., APIS-001)</span>}
            style={{ marginBottom: 24 }}
          >
            <Input
              placeholder="e.g., APIS-001"
              style={inputStyle}
              prefix={<span className="material-symbols-outlined" style={{ fontSize: 20, color: colors.brownBramble, opacity: 0.4 }}>memory</span>}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label={<span style={labelStyle}>Unit Name</span>}
            extra={<span style={{ color: colors.brownBramble, opacity: 0.6, fontSize: 12 }}>Optional friendly name to help identify this unit</span>}
            style={{ marginBottom: 24 }}
          >
            <Input
              placeholder="e.g., Garden Unit, Hive Protector 1"
              style={inputStyle}
              prefix={<span className="material-symbols-outlined" style={{ fontSize: 20, color: colors.brownBramble, opacity: 0.4 }}>router</span>}
            />
          </Form.Item>

          <Form.Item
            name="site_id"
            label={<span style={labelStyle}>Assigned Site</span>}
            extra={<span style={{ color: colors.brownBramble, opacity: 0.6, fontSize: 12 }}>Optional. You can assign to a site later.</span>}
            style={{ marginBottom: 24 }}
          >
            <Select
              placeholder="Select a site (optional)"
              allowClear
              loading={loadingSites}
              showSearch
              optionFilterProp="children"
              style={{ height: touchTargets.inputHeight }}
            >
              {sites.map((site) => (
                <Option key={site.id} value={site.id}>
                  {site.name}
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
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check</span>
                Register Unit
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
