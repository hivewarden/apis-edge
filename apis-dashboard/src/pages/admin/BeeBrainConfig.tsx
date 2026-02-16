/**
 * Admin BeeBrain Configuration Page
 *
 * Super-admin page for managing system-wide BeeBrain backend configuration
 * and per-tenant access control in SaaS mode.
 *
 * Part of Epic 13, Story 13-15 (Super-Admin BeeBrain Config)
 */
import { useState, useEffect, CSSProperties } from 'react';
import {
  Form,
  Select,
  Input,
  Button,
  Switch,
  Typography,
  Alert,
  Spin,
  Card,
  message,
} from 'antd';
import {
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import {
  useAdminBeeBrainConfig,
  useUpdateBeeBrainConfig,
  useSetTenantBeeBrainAccess,
  type BeeBrainBackend,
  type TenantBeeBrainAccess,
  type UpdateBeeBrainConfigInput,
} from '../../hooks/useAdminBeeBrain';
import { getAuthConfigSync } from '../../config';
import { colors, spacing } from '../../theme/apisTheme';

const { Title } = Typography;

// ============================================================================
// Styles
// ============================================================================

const pageStyles: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: colors.coconutCream,
  paddingBottom: 120, // Space for sticky footer
};

const headerStyles: CSSProperties = {
  backgroundColor: 'rgba(251, 249, 231, 0.95)',
  backdropFilter: 'blur(8px)',
  padding: `${spacing.xl}px ${spacing.xl}px`,
  position: 'sticky',
  top: 0,
  zIndex: 10,
};

const headerContentStyles: CSSProperties = {
  maxWidth: 1000,
  margin: '0 auto',
  width: '100%',
};

const contentStyles: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: `0 ${spacing.xl}px ${spacing.xxl}px`,
};

const innerContentStyles: CSSProperties = {
  maxWidth: 1000,
  margin: '0 auto',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 40,
};

const sectionHeaderStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 20,
};

const sectionTitleStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 18,
  fontWeight: 700,
  color: colors.brownBramble,
  margin: 0,
};

const cardGridStyles: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 24,
};

const backendCardStyles = (isSelected: boolean): CSSProperties => ({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 24,
  borderRadius: 16,
  backgroundColor: '#ffffff',
  boxShadow: '0 12px 32px -4px rgba(102, 38, 4, 0.08), 0 4px 12px -2px rgba(102, 38, 4, 0.04)',
  border: isSelected ? `2px solid ${colors.seaBuckthorn}` : '2px solid transparent',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
});

const backendIconContainerStyles = (isSelected: boolean): CSSProperties => ({
  padding: 12,
  borderRadius: 16,
  backgroundColor: isSelected ? 'rgba(252, 212, 131, 0.2)' : colors.coconutCream,
  color: isSelected ? colors.seaBuckthorn : 'rgba(102, 38, 4, 0.8)',
  width: 'fit-content',
});

const radioStyles = (isSelected: boolean): CSSProperties => ({
  width: 20,
  height: 20,
  borderRadius: '50%',
  border: isSelected ? `6px solid ${colors.seaBuckthorn}` : '1px solid rgba(102, 38, 4, 0.2)',
  backgroundColor: '#ffffff',
});

const activeBadgeStyles: CSSProperties = {
  position: 'absolute',
  top: -12,
  right: -12,
  backgroundColor: colors.seaBuckthorn,
  color: '#ffffff',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  padding: '6px 12px',
  borderRadius: 9999,
  boxShadow: '0 4px 12px rgba(247, 164, 45, 0.3)',
};

const configCardStyles: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 16,
  padding: 32,
  boxShadow: '0 12px 32px -4px rgba(102, 38, 4, 0.08), 0 4px 12px -2px rgba(102, 38, 4, 0.04)',
};

const configHeaderStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 32,
  paddingBottom: 16,
  borderBottom: `1px solid ${colors.coconutCream}`,
};

const formGridStyles: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: 32,
};

const tenantListCardStyles: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 16,
  boxShadow: '0 12px 32px -4px rgba(102, 38, 4, 0.08), 0 4px 12px -2px rgba(102, 38, 4, 0.04)',
  overflow: 'hidden',
};

const tenantRowStyles: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 24,
  borderBottom: `1px solid ${colors.coconutCream}`,
};

const footerStyles: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  backgroundColor: 'rgba(255, 255, 255, 0.8)',
  backdropFilter: 'blur(12px)',
  padding: 24,
  boxShadow: '0 -4px 20px -4px rgba(0, 0, 0, 0.05)',
  zIndex: 20,
};

const footerContentStyles: CSSProperties = {
  maxWidth: 1000,
  margin: '0 auto',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

// ============================================================================
// Components
// ============================================================================

interface BackendCardProps {
  type: BeeBrainBackend;
  title: string;
  description: string;
  icon: string;
  isSelected: boolean;
  onClick: () => void;
}

function BackendCard({ title, description, icon, isSelected, onClick }: BackendCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...backendCardStyles(isSelected),
        transform: isHovered && !isSelected ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: isHovered && !isSelected
          ? '0 20px 40px -4px rgba(102, 38, 4, 0.12), 0 8px 16px -4px rgba(102, 38, 4, 0.06)'
          : backendCardStyles(isSelected).boxShadow,
        borderColor: isHovered && !isSelected ? 'rgba(252, 212, 131, 0.5)' : (isSelected ? colors.seaBuckthorn : 'transparent'),
      }}
    >
      {isSelected && <div style={activeBadgeStyles}>Active</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={backendIconContainerStyles(isSelected)}>
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 28,
              fontVariationSettings: isSelected ? "'FILL' 1" : "'FILL' 0",
            }}
          >
            {icon}
          </span>
        </div>
        <div style={radioStyles(isSelected)} />
      </div>

      <div>
        <h4 style={{ fontSize: 18, fontWeight: 700, color: colors.brownBramble, margin: '0 0 8px 0' }}>
          {title}
        </h4>
        <p style={{
          fontSize: 14,
          color: isSelected ? 'rgba(102, 38, 4, 0.8)' : 'rgba(102, 38, 4, 0.7)',
          lineHeight: 1.6,
          margin: 0,
        }}>
          {description}
        </p>
      </div>
    </div>
  );
}

interface TenantAccessRowProps {
  tenant: TenantBeeBrainAccess;
  onToggle: (tenantId: string, enabled: boolean) => void;
  isToggling: boolean;
}

function TenantAccessRow({ tenant, onToggle, isToggling }: TenantAccessRowProps) {
  return (
    <div style={tenantRowStyles}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            backgroundColor: colors.coconutCream,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(102, 38, 4, 0.8)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>agriculture</span>
        </div>
        <div>
          <h5 style={{ fontSize: 16, fontWeight: 700, color: colors.brownBramble, margin: 0 }}>
            {tenant.tenant_name}
          </h5>
          <p style={{ fontSize: 14, color: 'rgba(102, 38, 4, 0.6)', margin: 0 }}>
            {tenant.has_byok ? 'BYOK' : 'Standard'} Plan
            {tenant.enabled && ' - Active'}
          </p>
        </div>
      </div>

      <Switch
        checked={tenant.enabled}
        onChange={(checked) => onToggle(tenant.tenant_id, checked)}
        loading={isToggling}
        style={{
          backgroundColor: tenant.enabled ? colors.seaBuckthorn : '#d1d5db',
        }}
      />
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AdminBeeBrainConfigPage() {
  const { systemConfig, tenantAccess, loading, error, refresh } = useAdminBeeBrainConfig();
  const { updateConfig, updating } = useUpdateBeeBrainConfig();
  const { setAccess } = useSetTenantBeeBrainAccess();
  const [form] = Form.useForm();

  const [selectedBackend, setSelectedBackend] = useState<BeeBrainBackend>('rules');
  const [showApiKey, setShowApiKey] = useState(false);
  const [togglingTenantId, setTogglingTenantId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Check if in SaaS mode
  const authConfig = getAuthConfigSync();
  const isSaaSMode = authConfig?.mode === 'keycloak';

  // Sync form with loaded config
  useEffect(() => {
    if (systemConfig) {
      setSelectedBackend(systemConfig.backend);
      form.setFieldsValue({
        provider: systemConfig.provider,
        endpoint: systemConfig.endpoint,
        model: systemConfig.model,
      });
    }
  }, [systemConfig, form]);

  const handleBackendChange = (backend: BeeBrainBackend) => {
    setSelectedBackend(backend);
    setHasChanges(true);
    // Clear related fields
    if (backend === 'rules') {
      form.setFieldsValue({ provider: undefined, endpoint: undefined, model: undefined, api_key: undefined });
    } else if (backend === 'local') {
      form.setFieldsValue({ api_key: undefined });
    }
  };

  const handleSave = async () => {
    const values = form.getFieldsValue();
    const input: UpdateBeeBrainConfigInput = {
      backend: selectedBackend,
      ...values,
    };

    try {
      await updateConfig(input);
      message.success('BeeBrain configuration saved successfully');
      setHasChanges(false);
      refresh();
    } catch (error) {
      // Error shown by interceptor
    }
  };

  const handleDiscard = () => {
    if (systemConfig) {
      setSelectedBackend(systemConfig.backend);
      form.setFieldsValue({
        provider: systemConfig.provider,
        endpoint: systemConfig.endpoint,
        model: systemConfig.model,
      });
    }
    setHasChanges(false);
  };

  const handleToggleTenantAccess = async (tenantId: string, enabled: boolean) => {
    setTogglingTenantId(tenantId);
    try {
      await setAccess(tenantId, enabled);
      message.success(`BeeBrain access ${enabled ? 'enabled' : 'disabled'}`);
      refresh();
    } catch (error) {
      // Error shown by interceptor
    } finally {
      setTogglingTenantId(null);
    }
  };

  const activeCount = tenantAccess.filter((t) => t.enabled).length;

  // Show warning if not in SaaS mode
  if (!isSaaSMode) {
    return (
      <div style={pageStyles}>
        <div style={{ padding: spacing.xl }}>
          <Card style={{ borderRadius: 16 }}>
            <Alert
              type="warning"
              message="Super-Admin Features Unavailable"
              description="BeeBrain configuration management is only available in SaaS mode (AUTH_MODE=keycloak)."
              showIcon
            />
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ ...pageStyles, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyles}>
        <div style={{ padding: spacing.xl }}>
          <Card style={{ borderRadius: 16 }}>
            <Alert
              type="error"
              message="Failed to Load BeeBrain Configuration"
              description={error.message}
              showIcon
              action={<Button onClick={refresh}>Retry</Button>}
            />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyles}>
      {/* Header */}
      <header style={headerStyles}>
        <div style={headerContentStyles}>
          <Title
            level={2}
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 700,
              color: colors.brownBramble,
              letterSpacing: '-0.02em',
            }}
          >
            BeeBrain Configuration
          </Title>
          <p style={{ color: 'rgba(102, 38, 4, 0.7)', fontSize: 16, marginTop: 8, maxWidth: 700, lineHeight: 1.6 }}>
            Configure global AI settings, inference backends, and tenant access rules for the hive mind.
          </p>
        </div>
      </header>

      {/* Content */}
      <div style={contentStyles}>
        <div style={innerContentStyles}>
          {/* Backend Strategy Section */}
          <section>
            <div style={sectionHeaderStyles}>
              <h3 style={sectionTitleStyles}>
                <span className="material-symbols-outlined" style={{ color: colors.seaBuckthorn }}>psychology</span>
                Backend Strategy
              </h3>
            </div>

            <div style={cardGridStyles}>
              <BackendCard
                type="rules"
                title="Rules Only"
                description="Deterministic logic engines. No probabilistic inference. 100% predictable results."
                icon="account_tree"
                isSelected={selectedBackend === 'rules'}
                onClick={() => handleBackendChange('rules')}
              />
              <BackendCard
                type="local"
                title="Local Model"
                description="Self-hosted LLM running on-premise. Maximum privacy for sensitive apiary data."
                icon="hard_drive"
                isSelected={selectedBackend === 'local'}
                onClick={() => handleBackendChange('local')}
              />
              <BackendCard
                type="external"
                title="External API"
                description="Cloud provider integration. Maximum reasoning performance and scalability."
                icon="cloud_sync"
                isSelected={selectedBackend === 'external'}
                onClick={() => handleBackendChange('external')}
              />
            </div>
          </section>

          {/* API Configuration Section - Show only for local/external */}
          {selectedBackend !== 'rules' && (
            <section style={configCardStyles}>
              <div style={configHeaderStyles}>
                <span className="material-symbols-outlined" style={{ color: colors.seaBuckthorn }}>tune</span>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: colors.brownBramble, margin: 0 }}>
                  API Configuration
                </h3>
              </div>

              <Form
                form={form}
                layout="vertical"
                onValuesChange={() => setHasChanges(true)}
              >
                <div style={formGridStyles}>
                  <Form.Item
                    name="provider"
                    label={<span style={{ fontSize: 14, fontWeight: 600, color: colors.brownBramble }}>AI Provider</span>}
                  >
                    <Select
                      placeholder="Select provider"
                      style={{ height: 48 }}
                      dropdownStyle={{ borderRadius: 12 }}
                    >
                      {selectedBackend === 'local' ? (
                        <>
                          <Select.Option value="ollama">Ollama</Select.Option>
                          <Select.Option value="localai">LocalAI</Select.Option>
                          <Select.Option value="lmstudio">LM Studio</Select.Option>
                        </>
                      ) : (
                        <>
                          <Select.Option value="openai">OpenAI (GPT-4)</Select.Option>
                          <Select.Option value="anthropic">Anthropic (Claude 3)</Select.Option>
                          <Select.Option value="azure">Azure OpenAI</Select.Option>
                        </>
                      )}
                    </Select>
                    <p style={{ fontSize: 12, color: 'rgba(102, 38, 4, 0.6)', marginTop: 8 }}>
                      Select the upstream inference provider.
                    </p>
                  </Form.Item>

                  {selectedBackend === 'external' && (
                    <Form.Item
                      name="api_key"
                      label={<span style={{ fontSize: 14, fontWeight: 600, color: colors.brownBramble }}>API Key</span>}
                    >
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <Input
                            type={showApiKey ? 'text' : 'password'}
                            placeholder={systemConfig?.api_key_status === 'configured' ? '••••••••••••••••••••' : 'Enter API key'}
                            style={{
                              height: 48,
                              borderRadius: 12,
                              backgroundColor: colors.coconutCream,
                              border: 'none',
                              paddingLeft: 40,
                            }}
                          />
                          <span
                            className="material-symbols-outlined"
                            style={{
                              position: 'absolute',
                              left: 12,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              color: 'rgba(102, 38, 4, 0.5)',
                              fontSize: 20,
                            }}
                          >
                            key
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            style={{
                              position: 'absolute',
                              right: 12,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              color: 'rgba(102, 38, 4, 0.5)',
                              cursor: 'pointer',
                              padding: 0,
                              display: 'flex',
                            }}
                          >
                            {showApiKey ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                          </button>
                        </div>
                        <Button
                          style={{
                            height: 48,
                            paddingLeft: 24,
                            paddingRight: 24,
                            borderRadius: 12,
                            backgroundColor: colors.coconutCream,
                            border: 'none',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: colors.seaBuckthorn }}>bolt</span>
                          Test Connection
                        </Button>
                      </div>
                      <p style={{ fontSize: 12, color: 'rgba(102, 38, 4, 0.6)', marginTop: 8 }}>
                        Keys are encrypted at rest using AES-256.
                      </p>
                    </Form.Item>
                  )}

                  {selectedBackend === 'local' && (
                    <Form.Item
                      name="endpoint"
                      label={<span style={{ fontSize: 14, fontWeight: 600, color: colors.brownBramble }}>Endpoint URL</span>}
                    >
                      <Input
                        placeholder="http://localhost:11434"
                        style={{
                          height: 48,
                          borderRadius: 12,
                          backgroundColor: colors.coconutCream,
                          border: 'none',
                        }}
                      />
                    </Form.Item>
                  )}
                </div>
              </Form>
            </section>
          )}

          {/* Tenant AI Access Section */}
          <section>
            <div style={sectionHeaderStyles}>
              <h3 style={sectionTitleStyles}>
                <span className="material-symbols-outlined" style={{ color: colors.seaBuckthorn }}>hive</span>
                Tenant AI Access
              </h3>
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: 9999,
                  backgroundColor: 'rgba(252, 212, 131, 0.2)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: colors.brownBramble,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {activeCount} Active
              </span>
            </div>

            <div style={tenantListCardStyles}>
              {tenantAccess.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: 'rgba(102, 38, 4, 0.5)' }}>
                  No tenants found
                </div>
              ) : (
                tenantAccess.map((tenant) => (
                  <TenantAccessRow
                    key={tenant.tenant_id}
                    tenant={tenant}
                    onToggle={handleToggleTenantAccess}
                    isToggling={togglingTenantId === tenant.tenant_id}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Sticky Footer */}
      <div style={footerStyles}>
        <div style={footerContentStyles}>
          <p style={{ fontSize: 14, color: 'rgba(102, 38, 4, 0.7)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>info</span>
            Changes will propagate to tenants immediately.
          </p>

          <div style={{ display: 'flex', gap: 16 }}>
            <Button
              onClick={handleDiscard}
              disabled={!hasChanges}
              style={{
                height: 48,
                paddingLeft: 24,
                paddingRight: 24,
                borderRadius: 9999,
                fontWeight: 700,
                color: 'rgba(102, 38, 4, 0.7)',
                border: 'none',
              }}
            >
              Discard
            </Button>
            <Button
              type="primary"
              onClick={handleSave}
              loading={updating}
              style={{
                height: 48,
                paddingLeft: 32,
                paddingRight: 32,
                borderRadius: 9999,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 0 15px rgba(247, 164, 45, 0.3)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>save</span>
              Save Configuration
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        .ant-select-selector {
          border-radius: 12px !important;
          background-color: ${colors.coconutCream} !important;
          border: none !important;
          height: 48px !important;
          padding: 8px 16px !important;
        }
        .ant-select-selection-item {
          line-height: 32px !important;
          font-weight: 500 !important;
        }
        .ant-form-item-label > label {
          height: auto !important;
        }
        .ant-form-item {
          margin-bottom: 0 !important;
        }
        .ant-switch-checked {
          background-color: ${colors.seaBuckthorn} !important;
        }
      `}</style>
    </div>
  );
}

export default AdminBeeBrainConfigPage;
