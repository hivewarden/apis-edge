/**
 * Settings Page
 *
 * Main settings page with tabs for different settings categories:
 * - Overview: Tenant info and resource usage
 * - Profile: User profile and password change
 * - Users: User management (local mode + admin only)
 * - BeeBrain: AI configuration
 * - Preferences: Inspection settings, voice input, treatment intervals, milestones, offline storage
 *
 * Part of Epic 13, Story 13.19: Tenant Settings UI
 */
import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  Switch,
  Space,
  Divider,
  Alert,
  Statistic,
  Row,
  Col,
  Button,
  notification,
  Radio,
  Select,
  Tag,
  Table,
  InputNumber,
  Tabs,
  Form,
  Spin,
  Input,
} from 'antd';
import {
  ExperimentOutlined,
  SettingOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  TrophyOutlined,
  AudioOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CalendarOutlined,
  UndoOutlined,
  SaveOutlined,
  MedicineBoxOutlined,
  TeamOutlined,
  CrownOutlined,
  RobotOutlined,
  HomeOutlined,
  UserOutlined,
  ControlOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useSettings } from '../context';
import type { VoiceInputMethod } from '../context';
import { colors } from '../theme/apisTheme';
import { SyncStatus } from '../components/SyncStatus';
import { MilestonesGallery } from '../components/MilestonesGallery';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useAuth } from '../hooks/useAuth';
import { getAuthConfigSync, fetchAuthConfig, DEV_MODE } from '../config';
import { apiClient } from '../providers/apiClient';
import type { AuthConfig, MeResponse } from '../types/auth';
import {
  getCacheStats,
  checkAndPruneStorage,
  clearAllCache,
} from '../services/offlineCache';
import {
  useTreatmentIntervals,
  DEFAULT_TREATMENT_INTERVALS,
  formatTreatmentType as formatTreatmentTypeCalendar,
} from '../hooks/useCalendar';

// Import tab components
import { Overview } from './settings/Overview';
import { Profile } from './settings/Profile';
// Note: Users and BeeBrainConfig are inline as tab content (simplified versions without own headers)

const { Title, Text, Paragraph } = Typography;

// Common language options for speech recognition
const LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'nl-NL', label: 'Dutch' },
  { value: 'pl-PL', label: 'Polish' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
];

// Treatment interval table row type
interface IntervalRow {
  key: string;
  treatmentType: string;
  displayName: string;
  intervalDays: number;
}

/**
 * Preferences Tab Component
 *
 * Contains all the existing preferences: inspection settings, voice input,
 * treatment intervals, milestones, offline storage.
 */
function PreferencesTab() {
  const { advancedMode, setAdvancedMode, voiceInputMethod, setVoiceInputMethod, voiceLanguage, setVoiceLanguage } = useSettings();
  const { isSupported: isSpeechSupported } = useSpeechRecognition();
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [voiceTestResult, setVoiceTestResult] = useState<'success' | 'error' | null>(null);

  // Treatment Intervals state
  const { intervals, loading: intervalsLoading, updateIntervals } = useTreatmentIntervals();
  const [editedIntervals, setEditedIntervals] = useState<Record<string, number>>({});
  const [isSavingIntervals, setIsSavingIntervals] = useState(false);
  const [intervalsModified, setIntervalsModified] = useState(false);

  // Sync edited intervals when loaded from server
  useEffect(() => {
    if (intervals && Object.keys(editedIntervals).length === 0) {
      setEditedIntervals(intervals);
    }
  }, [intervals, editedIntervals]);

  const [cacheStats, setCacheStats] = useState<{
    sites: number;
    hives: number;
    inspections: number;
    detections: number;
    units: number;
    totalRecords: number;
    storageMB: number;
    lastSync: Date | null;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Load cache stats on mount
  const loadCacheStats = useCallback(async () => {
    const stats = await getCacheStats();
    setCacheStats(stats);
  }, []);

  useEffect(() => {
    loadCacheStats();
  }, [loadCacheStats]);

  // Handle manual cache check/prune
  const handleCheckStorage = async () => {
    setIsSyncing(true);
    try {
      const { prunedCount } = await checkAndPruneStorage();
      await loadCacheStats();

      if (prunedCount > 0) {
        notification.info({
          message: 'Storage Optimized',
          description: `${prunedCount} old records were removed to free up space. Recent and frequently accessed data has been preserved.`,
          placement: 'bottomRight',
          duration: 5,
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle cache clear
  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      await clearAllCache();
      await loadCacheStats();
    } finally {
      setIsClearing(false);
    }
  };

  // Test voice input functionality
  const handleTestVoice = async () => {
    setIsTestingVoice(true);
    setVoiceTestResult(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setVoiceTestResult('success');
    } catch {
      setVoiceTestResult('error');
    } finally {
      setIsTestingVoice(false);
    }
  };

  // Treatment Intervals handlers
  const handleIntervalChange = (treatmentType: string, value: number | null) => {
    const newValue = value ?? DEFAULT_TREATMENT_INTERVALS[treatmentType] ?? 30;
    setEditedIntervals((prev) => ({
      ...prev,
      [treatmentType]: newValue,
    }));
    setIntervalsModified(true);
  };

  const handleSaveIntervals = async () => {
    setIsSavingIntervals(true);
    try {
      await updateIntervals(editedIntervals);
      setIntervalsModified(false);
      notification.success({
        message: 'Intervals Saved',
        description: 'Treatment intervals have been updated.',
        placement: 'bottomRight',
      });
    } catch {
      notification.error({
        message: 'Save Failed',
        description: 'Failed to save treatment intervals. Please try again.',
        placement: 'bottomRight',
      });
    } finally {
      setIsSavingIntervals(false);
    }
  };

  const handleResetIntervals = () => {
    setEditedIntervals({ ...DEFAULT_TREATMENT_INTERVALS });
    setIntervalsModified(true);
  };

  // Prepare interval table data
  const intervalTableData: IntervalRow[] = Object.entries(editedIntervals).map(
    ([treatmentType, intervalDays]) => ({
      key: treatmentType,
      treatmentType,
      displayName: formatTreatmentTypeCalendar(treatmentType),
      intervalDays,
    })
  );

  const intervalColumns = [
    {
      title: 'Treatment Type',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (text: string) => (
        <Space>
          <MedicineBoxOutlined style={{ color: colors.seaBuckthorn }} />
          {text}
        </Space>
      ),
    },
    {
      title: 'Interval (days)',
      dataIndex: 'intervalDays',
      key: 'intervalDays',
      width: 150,
      render: (_: number, record: IntervalRow) => (
        <InputNumber
          min={1}
          max={365}
          value={record.intervalDays}
          onChange={(value) => handleIntervalChange(record.treatmentType, value)}
          style={{ width: '100%' }}
        />
      ),
    },
  ];

  return (
    <div>
      <Card title="Inspection Preferences" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, marginRight: 16 }}>
            <Space style={{ marginBottom: 8 }}>
              <ExperimentOutlined style={{ color: colors.seaBuckthorn }} />
              <Text strong>Advanced Mode</Text>
            </Space>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Enable frame-level data tracking during inspections. Track drawn comb, brood, honey,
              and pollen frames for each box individually. Useful for detailed hive development analysis.
            </Paragraph>
          </div>
          <Switch
            checked={advancedMode}
            onChange={setAdvancedMode}
            checkedChildren="On"
            unCheckedChildren="Off"
          />
        </div>

        {advancedMode && (
          <Alert
            type="info"
            message="Advanced mode enabled"
            description="You'll see additional frame tracking options when creating or editing inspections."
            style={{ marginTop: 16 }}
            showIcon
          />
        )}
      </Card>

      <Card
        title={
          <Space>
            <AudioOutlined style={{ color: colors.seaBuckthorn }} />
            <span>Voice Input</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Browser Support</Text>
            {isSpeechSupported ? (
              <Tag icon={<CheckCircleOutlined />} color="success">
                Native speech recognition supported
              </Tag>
            ) : (
              <Tag icon={<CloseCircleOutlined />} color="warning">
                Native speech recognition not available - use Server mode
              </Tag>
            )}
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Transcription Method</Text>
            <Radio.Group
              value={voiceInputMethod}
              onChange={(e) => setVoiceInputMethod(e.target.value as VoiceInputMethod)}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio value="auto">
                  <Space direction="vertical" size={0}>
                    <Text strong>Auto</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Uses native browser speech recognition when available
                    </Text>
                  </Space>
                </Radio>
                <Radio value="native" disabled={!isSpeechSupported}>
                  <Space direction="vertical" size={0}>
                    <Text strong>Native (Browser)</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Uses iOS/Android dictation - lightweight, requires signal
                    </Text>
                  </Space>
                </Radio>
                <Radio value="whisper">
                  <Space direction="vertical" size={0}>
                    <Text strong>Server (Whisper)</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Best accuracy, records and sends to server for transcription
                    </Text>
                  </Space>
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Speech Recognition Language</Text>
            <Select
              value={voiceLanguage}
              onChange={setVoiceLanguage}
              style={{ width: '100%', maxWidth: 300 }}
              options={LANGUAGE_OPTIONS}
            />
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
              Select your preferred language for voice recognition.
            </Paragraph>
          </div>

          <div>
            <Button
              icon={<AudioOutlined />}
              onClick={handleTestVoice}
              loading={isTestingVoice}
            >
              Test Microphone Access
            </Button>
            {voiceTestResult === 'success' && (
              <Tag icon={<CheckCircleOutlined />} color="success" style={{ marginLeft: 12 }}>
                Microphone access granted
              </Tag>
            )}
            {voiceTestResult === 'error' && (
              <Tag icon={<CloseCircleOutlined />} color="error" style={{ marginLeft: 12 }}>
                Microphone access denied
              </Tag>
            )}
          </div>
        </Space>
      </Card>

      <Card
        title={
          <Space>
            <CalendarOutlined style={{ color: colors.seaBuckthorn }} />
            <span>Treatment Intervals</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Configure how many days after a treatment until the next application is due.
          These intervals are used to calculate due dates on the Treatment Calendar.
        </Paragraph>

        <Table
          columns={intervalColumns}
          dataSource={intervalTableData}
          pagination={false}
          size="small"
          loading={intervalsLoading}
          style={{ marginBottom: 16 }}
        />

        <Space>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveIntervals}
            loading={isSavingIntervals}
            disabled={!intervalsModified}
          >
            Save Intervals
          </Button>
          <Button
            icon={<UndoOutlined />}
            onClick={handleResetIntervals}
          >
            Reset to Defaults
          </Button>
        </Space>

        {intervalsModified && (
          <Alert
            type="warning"
            message="You have unsaved changes"
            style={{ marginTop: 12 }}
            showIcon
          />
        )}
      </Card>

      <Card
        title={
          <Space>
            <TrophyOutlined style={{ color: colors.seaBuckthorn }} />
            <span>Milestones</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Photos from your beekeeping milestones - first harvest, special moments, and achievements.
        </Paragraph>
        <MilestonesGallery />
      </Card>

      <Card title="Offline Storage" style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <SyncStatus
            lastSynced={cacheStats?.lastSync ?? null}
            storageUsedMB={cacheStats?.storageMB ?? 0}
            onSyncNow={handleCheckStorage}
            isSyncing={isSyncing}
            showAsCard={false}
          />

          {cacheStats && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <div>
                <Space style={{ marginBottom: 12 }}>
                  <DatabaseOutlined style={{ color: colors.seaBuckthorn }} />
                  <Text strong>Cached Data</Text>
                </Space>
                <Row gutter={[16, 16]}>
                  <Col xs={12} sm={8} md={4}>
                    <Statistic title="Sites" value={cacheStats.sites} />
                  </Col>
                  <Col xs={12} sm={8} md={4}>
                    <Statistic title="Hives" value={cacheStats.hives} />
                  </Col>
                  <Col xs={12} sm={8} md={4}>
                    <Statistic title="Inspections" value={cacheStats.inspections} />
                  </Col>
                  <Col xs={12} sm={8} md={4}>
                    <Statistic title="Detections" value={cacheStats.detections} />
                  </Col>
                  <Col xs={12} sm={8} md={4}>
                    <Statistic title="Units" value={cacheStats.units} />
                  </Col>
                  <Col xs={12} sm={8} md={4}>
                    <Statistic title="Total" value={cacheStats.totalRecords} />
                  </Col>
                </Row>
              </div>
            </>
          )}

          <div>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleClearCache}
              loading={isClearing}
              disabled={!cacheStats || cacheStats.totalRecords === 0}
            >
              Clear Offline Cache
            </Button>
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
              Removes all cached data. You'll need to reconnect to the internet to view data again.
            </Paragraph>
          </div>
        </Space>
      </Card>
    </div>
  );
}

/**
 * Users Tab Component (Simplified inline version for tab)
 * SECURITY (S5-H3): Uses dynamic import() instead of CommonJS require() for ESM/Vite compatibility.
 */
import {
  useUsers,
  useUpdateUser,
  useDeleteUser,
  useInviteUser,
  useResetPassword,
} from '../hooks/useUsers';
import { UserList } from '../components/users';

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const { users, loading: usersLoading, refresh: refreshUsers, error: usersError } = useUsers();
  const { updateUser, updating } = useUpdateUser();
  const { deleteUser, deleting } = useDeleteUser();
  const { inviteUser, inviting } = useInviteUser();
  const { resetPassword, resetting } = useResetPassword();

  useEffect(() => {
    if (usersError) {
      notification.error({
        message: 'Failed to Load Users',
        description: usersError.message,
      });
    }
  }, [usersError]);

  return (
    <Card>
      <UserList
        users={users}
        loading={usersLoading}
        currentUserId={currentUserId}
        onUpdateUser={updateUser}
        onDeleteUser={deleteUser}
        onInviteUser={inviteUser}
        onResetPassword={resetPassword}
        onRefresh={refreshUsers}
        updating={updating}
        deleting={deleting}
        inviting={inviting}
        resetting={resetting}
      />
    </Card>
  );
}

/**
 * BeeBrain Tab Component (Simplified inline version for tab)
 */
/**
 * SECURITY (S5-H3): Top-level ESM imports for BeeBrain hooks, replacing require().
 */
import {
  useBeeBrainSettings,
  useUpdateBeeBrainSettings,
  getModeDisplayName,
  getProviderDisplayName,
  getBYOKProviderOptions,
  type BeeBrainProvider,
  type BeeBrainMode,
  type UpdateBeeBrainSettingsInput,
} from '../hooks/useBeeBrainSettings';

function BeeBrainTab({ isAdmin }: { isAdmin: boolean }) {

  const [form] = Form.useForm();

  const { settings, loading: settingsLoading, error: settingsError, refresh } = useBeeBrainSettings();
  const { updateSettings, updating } = useUpdateBeeBrainSettings();

  const [selectedMode, setSelectedMode] = useState<'system' | 'custom' | 'rules_only'>('system');
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'anthropic' | 'ollama'>('openai');
  const [hasChanges, setHasChanges] = useState(false);

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

  useEffect(() => {
    if (settingsError) {
      notification.error({
        message: 'Failed to Load Settings',
        description: settingsError.message,
      });
    }
  }, [settingsError]);

  const handleModeChange = (mode: 'system' | 'custom' | 'rules_only') => {
    setSelectedMode(mode);
    setHasChanges(true);
    form.setFieldsValue({ mode });
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      const input: UpdateBeeBrainSettingsInput = {
        mode: values.mode as BeeBrainMode,
      };

      if (values.mode === 'custom') {
        input.provider = values.provider as BeeBrainProvider;
        input.model = (values.model as string) || undefined;

        if (values.provider === 'ollama') {
          input.endpoint = values.endpoint as string;
        } else if (values.api_key && String(values.api_key).trim() !== '') {
          input.api_key = values.api_key as string;
        }
      }

      await updateSettings(input);
      notification.success({
        message: 'Settings Updated',
        description: 'Your BeeBrain configuration has been saved.',
      });
      setHasChanges(false);
      refresh();
      form.setFieldsValue({ api_key: '' });
    } catch (err) {
      notification.error({
        message: 'Update Failed',
        description: err instanceof Error ? err.message : 'Failed to update settings.',
      });
    }
  };

  if (settingsLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
        <Text style={{ display: 'block', marginTop: 16 }} type="secondary">
          Loading BeeBrain settings...
        </Text>
      </div>
    );
  }

  const viewOnly = !isAdmin;

  return (
    <div>
      <Card style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>
            BeeBrain uses AI to analyze your hive data and provide insights and recommendations.
          </Text>
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
              </Space>
            </div>
          )}
          {viewOnly && (
            <Alert
              type="info"
              showIcon
              icon={<CheckCircleOutlined />}
              message="View Only"
              description="Administrator privileges are required to change BeeBrain settings."
              style={{ marginTop: 16 }}
            />
          )}
        </Space>
      </Card>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onValuesChange={() => setHasChanges(true)}
        disabled={viewOnly}
      >
        <Card title="Configuration Mode" style={{ marginBottom: 24 }}>
          <Form.Item name="mode" label="How would you like BeeBrain to work?">
            <Radio.Group
              onChange={(e) => handleModeChange(e.target.value)}
              value={selectedMode}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio value="system" disabled={!settings?.system_available}>
                  <Text strong>Use System Default</Text>
                </Radio>
                <Radio value="custom">
                  <Text strong>Bring Your Own Key (BYOK)</Text>
                </Radio>
                <Radio value="rules_only">
                  <Text strong>Rules Only (No AI)</Text>
                </Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
        </Card>

        {selectedMode === 'custom' && (
          <Card title="AI Provider Configuration" style={{ marginBottom: 24 }}>
            <Form.Item
              name="provider"
              label="AI Provider"
              rules={[{ required: true, message: 'Please select a provider' }]}
            >
              <Select
                options={getBYOKProviderOptions()}
                onChange={(value: BeeBrainProvider) => setSelectedProvider(value)}
                value={selectedProvider}
              />
            </Form.Item>

            {(selectedProvider === 'openai' || selectedProvider === 'anthropic') && (
              <Form.Item
                name="api_key"
                label="API Key"
                extra={
                  settings?.custom_config_status === 'configured'
                    ? 'Leave blank to keep the existing API key.'
                    : 'Your API key will be encrypted and stored securely.'
                }
              >
                <Input.Password
                  placeholder={settings?.custom_config_status === 'configured' ? '********' : 'Enter your API key'}
                />
              </Form.Item>
            )}

            {selectedProvider === 'ollama' && (
              <Form.Item
                name="endpoint"
                label="Ollama Endpoint URL"
                rules={[{ required: true, message: 'Endpoint URL is required for Ollama' }]}
              >
                <Input placeholder="http://localhost:11434" />
              </Form.Item>
            )}

            <Form.Item name="model" label="Model (Optional)">
              <Input placeholder="Leave blank for default" />
            </Form.Item>
          </Card>
        )}

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
    </div>
  );
}

/**
 * Super Admin Tab Component (SaaS Mode Only)
 */
function SuperAdminTab() {
  return (
    <div>
      <Alert
        type="info"
        message="Super Admin Features"
        description="System-wide administration for the APIS SaaS platform. These features are only visible to super-administrators."
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Space direction="vertical" style={{ width: '100%' }}>
        <Link to="/admin/tenants">
          <Button
            type="default"
            icon={<TeamOutlined />}
            size="large"
            style={{ width: '100%', textAlign: 'left', height: 'auto', padding: '12px 16px' }}
          >
            <span style={{ marginLeft: 8 }}>
              <strong>Tenant Management</strong>
              <br />
              <span style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 12 }}>
                View and manage all tenants, plans, and usage
              </span>
            </span>
          </Button>
        </Link>
        <Link to="/admin/beebrain">
          <Button
            type="default"
            icon={<RobotOutlined />}
            size="large"
            style={{ width: '100%', textAlign: 'left', height: 'auto', padding: '12px 16px' }}
          >
            <span style={{ marginLeft: 8 }}>
              <strong>BeeBrain Configuration</strong>
              <br />
              <span style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 12 }}>
                Configure AI backend and per-tenant access
              </span>
            </span>
          </Button>
        </Link>
      </Space>
    </div>
  );
}

/**
 * Main Settings Component with Tabs
 */
export function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Auth config state for conditional rendering
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(getAuthConfigSync());
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'member' | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Fetch auth config if not cached
  useEffect(() => {
    if (!authConfig && !DEV_MODE) {
      fetchAuthConfig()
        .then(setAuthConfig)
        .catch((err) => console.error('Failed to fetch auth config:', err));
    }
  }, [authConfig]);

  // Fetch current user's role and ID from /api/auth/me
  useEffect(() => {
    if (DEV_MODE) {
      setCurrentUserRole('admin');
      setCurrentUserId(user?.id || 'dev-user');
      return;
    }

    // SECURITY (S5-H4): Use apiClient instead of raw fetch() for auth interceptors
    const fetchRole = async () => {
      try {
        const response = await apiClient.get<MeResponse>('/auth/me');
        setCurrentUserRole(response.data.user.role);
        setCurrentUserId(response.data.user.id);
      } catch (err) {
        console.error('Failed to fetch user role:', err);
      }
    };

    fetchRole();
  }, [user]);

  // Determine mode and permissions
  const isLocalMode = DEV_MODE || authConfig?.mode === 'local';
  const isAdmin = currentUserRole === 'admin';
  const showUsersTab = isLocalMode && isAdmin;
  const isSaaSMode = authConfig?.mode === 'keycloak';
  const showSuperAdminTab = isSaaSMode && isAdmin;

  // Handle URL hash for tab navigation
  const getActiveKeyFromHash = (): string => {
    const hash = location.hash.replace('#', '');
    const validKeys = ['overview', 'profile', 'users', 'beebrain', 'preferences', 'admin'];
    if (validKeys.includes(hash)) {
      // Check if user has access to the requested tab
      if (hash === 'users' && !showUsersTab) return 'overview';
      if (hash === 'admin' && !showSuperAdminTab) return 'overview';
      return hash;
    }
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState(getActiveKeyFromHash());

  // Update active tab when hash changes
  useEffect(() => {
    setActiveTab(getActiveKeyFromHash());
  }, [location.hash, showUsersTab, showSuperAdminTab]);

  // Handle tab change
  const handleTabChange = (key: string) => {
    setActiveTab(key);
    navigate(`/settings#${key}`, { replace: true });
  };

  // Build tab items
  const items = [
    {
      key: 'overview',
      label: (
        <span>
          <HomeOutlined />
          Overview
        </span>
      ),
      children: <Overview />,
    },
    {
      key: 'profile',
      label: (
        <span>
          <UserOutlined />
          Profile
        </span>
      ),
      children: <Profile isLocalMode={isLocalMode} />,
    },
    // Users tab: Local mode + admin only
    ...(showUsersTab
      ? [
          {
            key: 'users',
            label: (
              <span>
                <TeamOutlined />
                Users
              </span>
            ),
            children: <UsersTab currentUserId={currentUserId || ''} />,
          },
        ]
      : []),
    {
      key: 'beebrain',
      label: (
        <span>
          <RobotOutlined />
          BeeBrain
        </span>
      ),
      children: <BeeBrainTab isAdmin={isAdmin} />,
    },
    {
      key: 'preferences',
      label: (
        <span>
          <ControlOutlined />
          Preferences
        </span>
      ),
      children: <PreferencesTab />,
    },
    // Super Admin tab: SaaS mode only
    ...(showSuperAdminTab
      ? [
          {
            key: 'admin',
            label: (
              <span>
                <CrownOutlined style={{ color: '#722ed1' }} />
                Super Admin
              </span>
            ),
            children: <SuperAdminTab />,
          },
        ]
      : []),
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <Space style={{ marginBottom: 24 }}>
        <SettingOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />
        <Title level={2} style={{ margin: 0 }}>Settings</Title>
      </Space>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={items}
        size="large"
        tabBarStyle={{ marginBottom: 24 }}
      />
    </div>
  );
}

export default Settings;
