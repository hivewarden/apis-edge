import { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Switch, Space, Divider, Alert, Statistic, Row, Col, Button, notification, Radio, Select, Tag } from 'antd';
import { ExperimentOutlined, SettingOutlined, DatabaseOutlined, DeleteOutlined, ExportOutlined, TrophyOutlined, AudioOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useSettings } from '../context';
import type { VoiceInputMethod } from '../context';
import { colors } from '../theme/apisTheme';
import { SyncStatus } from '../components/SyncStatus';
import { MilestonesGallery } from '../components/MilestonesGallery';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import {
  getCacheStats,
  checkAndPruneStorage,
  clearAllCache,
} from '../services/offlineCache';

const { Title, Text, Paragraph } = Typography;

/**
 * Settings Page
 *
 * Application and user settings including:
 * - Advanced mode toggle for frame-level data tracking
 *
 * Part of Epic 5, Story 5.5: Frame-Level Data Tracking
 */
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

export function Settings() {
  const { advancedMode, setAdvancedMode, voiceInputMethod, setVoiceInputMethod, voiceLanguage, setVoiceLanguage } = useSettings();
  const { isSupported: isSpeechSupported } = useSpeechRecognition();
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [voiceTestResult, setVoiceTestResult] = useState<'success' | 'error' | null>(null);
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

      // Show notification if significant data was pruned (Task 8.5)
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
      // Test microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release the stream immediately
      stream.getTracks().forEach((track) => track.stop());
      setVoiceTestResult('success');
    } catch {
      setVoiceTestResult('error');
    } finally {
      setIsTestingVoice(false);
    }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <Space style={{ marginBottom: 24 }}>
        <SettingOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />
        <Title level={2} style={{ margin: 0 }}>Settings</Title>
      </Space>

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
          {/* Browser Support Status */}
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

          {/* Transcription Method */}
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

          {/* Language Selection */}
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

          {/* Test Voice Input */}
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

      <Card title="Data Management" style={{ marginBottom: 24 }}>
        <Link to="/settings/export">
          <Button
            type="default"
            icon={<ExportOutlined />}
            size="large"
            style={{ width: '100%', textAlign: 'left', height: 'auto', padding: '12px 16px' }}
          >
            <span style={{ marginLeft: 8 }}>
              <strong>Export Data</strong>
              <br />
              <span style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 12 }}>
                Export hive data in various formats for sharing or backup
              </span>
            </span>
          </Button>
        </Link>
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
          {/* Sync Status */}
          <SyncStatus
            lastSynced={cacheStats?.lastSync ?? null}
            storageUsedMB={cacheStats?.storageMB ?? 0}
            onSyncNow={handleCheckStorage}
            isSyncing={isSyncing}
            showAsCard={false}
          />

          {/* Cache Statistics */}
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

          {/* Clear Cache Button */}
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

      <Divider />

      <Paragraph type="secondary">
        More settings will be added as features are developed. Preferences are stored locally
        in your browser.
      </Paragraph>
    </div>
  );
}

export default Settings;
