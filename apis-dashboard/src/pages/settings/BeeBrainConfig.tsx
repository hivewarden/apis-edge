/**
 * BeeBrain Configuration Settings Page
 *
 * Allows tenants to configure their BeeBrain AI settings:
 * - System default: Use the administrator-configured AI backend
 * - Custom: Bring Your Own Key (BYOK) - configure personal OpenAI/Anthropic/Ollama
 * - Rules only: No AI, just rule-based analysis
 *
 * Part of Epic 13, Story 13-18 (BeeBrain BYOK)
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Typography,
  Space,
  Button,
  Card,
  Spin,
  Result,
  Form,
  Radio,
  Select,
  Input,
  Alert,
  notification,
  Divider,
  Tag,
} from 'antd';
import {
  RobotOutlined,
  ArrowLeftOutlined,
  LockOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  SafetyOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { colors } from '../../theme/apisTheme';
import { DEV_MODE, API_URL } from '../../config';
import {
  useBeeBrainSettings,
  useUpdateBeeBrainSettings,
  getModeDisplayName,
  getModeDescription,
  getProviderDisplayName,
  getProviderDescription,
  getBYOKProviderOptions,
} from '../../hooks/useBeeBrainSettings';
import type {
  BeeBrainMode,
  BeeBrainProvider,
} from '../../hooks/useBeeBrainSettings';
import type { MeResponse } from '../../types/auth';

const { Title, Text, Paragraph } = Typography;

/**
 * BeeBrain configuration page.
 *
 * Access requirements:
 * - Must be an admin user to modify settings
 * - Any authenticated user can view current settings
 */
export function BeeBrainConfig() {
  const [form] = Form.useForm();

  // Current user's role
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'member' | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  // BeeBrain settings hooks
  const { settings, loading: settingsLoading, error: settingsError, refresh } = useBeeBrainSettings();
  const { updateSettings, updating } = useUpdateBeeBrainSettings();

  // Form state
  const [selectedMode, setSelectedMode] = useState<BeeBrainMode>('system');
  const [selectedProvider, setSelectedProvider] = useState<BeeBrainProvider>('openai');
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current user's role from /api/auth/me
  const fetchCurrentUserRole = useCallback(async () => {
    if (DEV_MODE) {
      setCurrentUserRole('admin');
      setRoleLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data: MeResponse = await response.json();
        setCurrentUserRole(data.user.role);
      } else {
        setCurrentUserRole(null);
      }
    } catch (err) {
      console.error('Failed to fetch user role:', err);
      setCurrentUserRole(null);
    } finally {
      setRoleLoading(false);
    }
  }, []);

  // Fetch role on mount
  useEffect(() => {
    fetchCurrentUserRole();
  }, [fetchCurrentUserRole]);

  // Initialize form from settings
  useEffect(() => {
    if (settings) {
      setSelectedMode(settings.mode);
      if (settings.effective_provider) {
        setSelectedProvider(settings.effective_provider as BeeBrainProvider);
      }
      form.setFieldsValue({
        mode: settings.mode,
        provider: settings.effective_provider || 'openai',
        model: settings.effective_model || '',
      });
    }
  }, [settings, form]);

  // Show error notification if settings fail to load
  useEffect(() => {
    if (settingsError) {
      notification.error({
        message: 'Failed to Load Settings',
        description: settingsError.message,
      });
    }
  }, [settingsError]);

  // Check if user is admin
  const isAdmin = currentUserRole === 'admin';

  // Handle mode change
  const handleModeChange = (mode: BeeBrainMode) => {
    setSelectedMode(mode);
    setHasChanges(true);
    form.setFieldsValue({ mode });
  };

  // Handle form submission
  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const input: Record<string, unknown> = {
        mode: values.mode,
      };

      // Add provider-specific fields for custom mode
      if (values.mode === 'custom') {
        input.provider = values.provider;
        input.model = values.model || undefined;

        if (values.provider === 'ollama') {
          input.endpoint = values.endpoint;
        } else {
          // Only include API key if it was provided
          if (values.api_key && String(values.api_key).trim() !== '') {
            input.api_key = values.api_key;
          }
        }
      }

      await updateSettings(input as unknown as Parameters<typeof updateSettings>[0]);

      notification.success({
        message: 'Settings Updated',
        description: 'Your BeeBrain configuration has been saved.',
      });

      setHasChanges(false);
      refresh();

      // Clear the API key field after successful save
      form.setFieldsValue({ api_key: '' });
    } catch (err) {
      notification.error({
        message: 'Update Failed',
        description: err instanceof Error ? err.message : 'Failed to update settings.',
      });
    }
  };

  // Loading state
  if (roleLoading || settingsLoading) {
    return (
      <div style={{ maxWidth: 800, textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
        <Text style={{ display: 'block', marginTop: 16 }} type="secondary">
          Loading BeeBrain settings...
        </Text>
      </div>
    );
  }

  // Access denied - not admin (can view but not edit)
  const viewOnly = !isAdmin;

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Header */}
      <Space style={{ marginBottom: 24 }}>
        <Link to="/settings">
          <Button type="text" icon={<ArrowLeftOutlined />} />
        </Link>
        <RobotOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />
        <Title level={2} style={{ margin: 0 }}>BeeBrain Configuration</Title>
      </Space>

      {/* Info Card */}
      <Card style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>
            BeeBrain uses AI to analyze your hive data and provide insights and recommendations.
            You can choose to use the system default configuration or provide your own API key.
          </Text>

          {/* Current Status */}
          {settings && (
            <div style={{ marginTop: 16 }}>
              <Space wrap>
                <Text strong>Current Mode:</Text>
                <Tag color={settings.mode === 'custom' ? 'blue' : settings.mode === 'system' ? 'green' : 'default'}>
                  {getModeDisplayName(settings.mode)}
                </Tag>
                {settings.mode !== 'rules_only' && settings.effective_provider && (
                  <>
                    <Text strong>Provider:</Text>
                    <Tag>{getProviderDisplayName(settings.effective_provider as BeeBrainProvider)}</Tag>
                  </>
                )}
                {settings.effective_model && (
                  <>
                    <Text strong>Model:</Text>
                    <Tag>{settings.effective_model}</Tag>
                  </>
                )}
              </Space>
            </div>
          )}

          {viewOnly && (
            <Alert
              type="info"
              showIcon
              icon={<LockOutlined />}
              message="View Only"
              description="Administrator privileges are required to change BeeBrain settings."
              style={{ marginTop: 16 }}
            />
          )}
        </Space>
      </Card>

      {/* Configuration Form */}
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onValuesChange={() => setHasChanges(true)}
        disabled={viewOnly}
      >
        {/* Mode Selection */}
        <Card
          title={
            <Space>
              <SafetyOutlined />
              <span>Configuration Mode</span>
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Form.Item
            name="mode"
            label="How would you like BeeBrain to work?"
          >
            <Radio.Group
              onChange={(e) => handleModeChange(e.target.value)}
              value={selectedMode}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                {/* System Default */}
                <Radio
                  value="system"
                  disabled={!settings?.system_available}
                >
                  <Space direction="vertical" size={0}>
                    <Text strong>
                      Use System Default
                      {!settings?.system_available && (
                        <Tag color="warning" style={{ marginLeft: 8 }}>Not Available</Tag>
                      )}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {getModeDescription('system')}
                    </Text>
                  </Space>
                </Radio>

                {/* Custom BYOK */}
                <Radio value="custom">
                  <Space direction="vertical" size={0}>
                    <Text strong>Bring Your Own Key (BYOK)</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {getModeDescription('custom')}
                    </Text>
                  </Space>
                </Radio>

                {/* Rules Only */}
                <Radio value="rules_only">
                  <Space direction="vertical" size={0}>
                    <Text strong>Rules Only (No AI)</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {getModeDescription('rules_only')}
                    </Text>
                  </Space>
                </Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
        </Card>

        {/* Custom Provider Configuration */}
        {selectedMode === 'custom' && (
          <Card
            title={
              <Space>
                <InfoCircleOutlined />
                <span>AI Provider Configuration</span>
              </Space>
            }
            style={{ marginBottom: 24 }}
          >
            <Form.Item
              name="provider"
              label="AI Provider"
              rules={[{ required: true, message: 'Please select a provider' }]}
            >
              <Select
                options={getBYOKProviderOptions()}
                onChange={(value) => setSelectedProvider(value)}
                value={selectedProvider}
              />
            </Form.Item>

            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              {getProviderDescription(selectedProvider)}
            </Text>

            {/* API Key for OpenAI/Anthropic */}
            {(selectedProvider === 'openai' || selectedProvider === 'anthropic') && (
              <Form.Item
                name="api_key"
                label="API Key"
                extra={
                  settings?.custom_config_status === 'configured'
                    ? 'Leave blank to keep the existing API key.'
                    : 'Your API key will be encrypted and stored securely.'
                }
                rules={[
                  {
                    required: settings?.custom_config_status !== 'configured',
                    message: 'API key is required for this provider',
                  },
                ]}
              >
                <Input.Password
                  placeholder={settings?.custom_config_status === 'configured' ? '********' : 'Enter your API key'}
                />
              </Form.Item>
            )}

            {/* Endpoint for Ollama */}
            {selectedProvider === 'ollama' && (
              <Form.Item
                name="endpoint"
                label="Ollama Endpoint URL"
                rules={[{ required: true, message: 'Endpoint URL is required for Ollama' }]}
                extra="Example: http://localhost:11434 or http://your-ollama-server:11434"
              >
                <Input placeholder="http://localhost:11434" />
              </Form.Item>
            )}

            {/* Model Selection (Optional) */}
            <Form.Item
              name="model"
              label="Model (Optional)"
              extra={
                selectedProvider === 'openai'
                  ? 'Examples: gpt-4, gpt-4-turbo, gpt-3.5-turbo'
                  : selectedProvider === 'anthropic'
                    ? 'Examples: claude-3-opus-20240229, claude-3-sonnet-20240229'
                    : 'Examples: llama2, mistral, codellama'
              }
            >
              <Input placeholder="Leave blank for default" />
            </Form.Item>

            <Alert
              type="warning"
              showIcon
              message="API Costs"
              description="Using an external AI provider will incur costs based on usage. Make sure you understand your provider's pricing before enabling this feature."
              style={{ marginTop: 16 }}
            />
          </Card>
        )}

        {/* Rules Only Info */}
        {selectedMode === 'rules_only' && (
          <Card style={{ marginBottom: 24 }}>
            <Result
              icon={<CheckCircleOutlined style={{ color: colors.success }} />}
              title="Rule-Based Analysis"
              subTitle="BeeBrain will use rule-based analysis without AI. This includes detection of overdue inspections, treatment reminders, and pattern analysis based on your hive data."
            />
          </Card>
        )}

        {/* System Default Info */}
        {selectedMode === 'system' && settings?.system_available && (
          <Card style={{ marginBottom: 24 }}>
            <Result
              icon={<CheckCircleOutlined style={{ color: colors.success }} />}
              title="System Configuration"
              subTitle="BeeBrain will use the AI configuration provided by your system administrator. No additional setup required."
            />
          </Card>
        )}

        <Divider />

        {/* Submit Button */}
        {!viewOnly && (
          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={updating}
                disabled={!hasChanges}
                icon={<SaveOutlined />}
              >
                Save Configuration
              </Button>
              {hasChanges && (
                <Text type="warning">You have unsaved changes</Text>
              )}
            </Space>
          </Form.Item>
        )}
      </Form>

      {/* Footer Info */}
      <Paragraph type="secondary" style={{ marginTop: 24 }}>
        BeeBrain configuration changes take effect immediately for new analysis runs.
        Existing insights will not be affected.
      </Paragraph>
    </div>
  );
}

export default BeeBrainConfig;
