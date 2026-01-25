/**
 * Export Page
 *
 * Allows users to export hive data in various formats (summary, markdown, JSON).
 * Supports:
 * - Hive selection (specific hives or all)
 * - Field selection by category (basics, details, analysis, financial)
 * - Format selection (quick summary, detailed markdown, full JSON)
 * - Preview before export
 * - Copy to clipboard
 * - Download as file
 * - Save and load presets
 *
 * Part of Epic 9, Story 9.1 (Configurable Data Export)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Card,
  Select,
  Checkbox,
  Radio,
  Button,
  Space,
  Divider,
  Input,
  message,
  Spin,
  Alert,
  Row,
  Col,
  Modal,
  Tooltip,
} from 'antd';
import {
  ExportOutlined,
  CopyOutlined,
  DownloadOutlined,
  SaveOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FileMarkdownOutlined,
  CodeOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useExport, EXPORT_FIELD_OPTIONS, IncludeConfig, ExportPreset } from '../hooks/useExport';
import { apiClient } from '../providers/apiClient';
import { colors } from '../theme/apisTheme';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// Hive interface for select dropdown
interface Hive {
  id: string;
  name: string;
  site_id: string;
}

interface HivesResponse {
  data: Hive[];
}

type FormatType = 'summary' | 'markdown' | 'json';

/**
 * Export Page Component
 */
export function Export() {
  // Hive selection
  const [hives, setHives] = useState<Hive[]>([]);
  const [hivesLoading, setHivesLoading] = useState(true);
  const [selectedHiveIds, setSelectedHiveIds] = useState<string[]>(['all']);

  // Field selection by category
  const [selectedBasics, setSelectedBasics] = useState<string[]>(['hive_name', 'queen_age', 'boxes']);
  const [selectedDetails, setSelectedDetails] = useState<string[]>(['inspection_log']);
  const [selectedAnalysis, setSelectedAnalysis] = useState<string[]>(['beebrain_insights']);
  const [selectedFinancial, setSelectedFinancial] = useState<string[]>([]);

  // Format selection
  const [format, setFormat] = useState<FormatType>('markdown');

  // Preview state
  const [preview, setPreview] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);

  // Preset modal
  const [presetModalVisible, setPresetModalVisible] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Export hook
  const {
    generateExport,
    exporting,
    presets,
    presetsLoading,
    savePreset,
    deletePreset,
    savingPreset,
    deletingPreset,
  } = useExport();

  // Fetch hives on mount
  useEffect(() => {
    const fetchHives = async () => {
      try {
        const response = await apiClient.get<HivesResponse>('/hives');
        setHives(response.data.data || []);
      } catch (error) {
        console.error('Failed to fetch hives:', error);
      } finally {
        setHivesLoading(false);
      }
    };
    fetchHives();
  }, []);

  // Build include config from selections
  const buildIncludeConfig = useCallback((): IncludeConfig => {
    const config: IncludeConfig = {};
    if (selectedBasics.length > 0) config.basics = selectedBasics;
    if (selectedDetails.length > 0) config.details = selectedDetails;
    if (selectedAnalysis.length > 0) config.analysis = selectedAnalysis;
    if (selectedFinancial.length > 0) config.financial = selectedFinancial;
    return config;
  }, [selectedBasics, selectedDetails, selectedAnalysis, selectedFinancial]);

  // Handle preview generation
  const handlePreview = async () => {
    try {
      const result = await generateExport({
        hive_ids: selectedHiveIds,
        include: buildIncludeConfig(),
        format,
      });
      setPreview(result.content);
      setShowPreview(true);
    } catch {
      // Error is displayed by apiClient interceptor
    }
  };

  // Handle copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      message.success('Copied to clipboard!');
    } catch {
      message.error('Failed to copy to clipboard');
    }
  };

  // Handle download
  const handleDownload = () => {
    const blob = new Blob([preview], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-${new Date().toISOString().split('T')[0]}.${format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('Downloaded!');
  };

  // Handle save preset
  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      message.error('Please enter a preset name');
      return;
    }

    try {
      await savePreset(presetName.trim(), buildIncludeConfig());
      message.success('Preset saved!');
      setPresetModalVisible(false);
      setPresetName('');
    } catch {
      // Error is displayed by apiClient interceptor
    }
  };

  // Handle load preset
  const handleLoadPreset = (preset: ExportPreset) => {
    setSelectedBasics(preset.config.basics || []);
    setSelectedDetails(preset.config.details || []);
    setSelectedAnalysis(preset.config.analysis || []);
    setSelectedFinancial(preset.config.financial || []);
    message.success(`Loaded preset: ${preset.name}`);
  };

  // Handle delete preset
  const handleDeletePreset = async (id: string) => {
    try {
      await deletePreset(id);
      message.success('Preset deleted');
    } catch {
      // Error is displayed by apiClient interceptor
    }
  };

  // Get format icon
  const getFormatIcon = (fmt: FormatType) => {
    switch (fmt) {
      case 'summary':
        return <FileTextOutlined />;
      case 'markdown':
        return <FileMarkdownOutlined />;
      case 'json':
        return <CodeOutlined />;
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <Space style={{ marginBottom: 24 }}>
        <ExportOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />
        <Title level={2} style={{ margin: 0 }}>Export Data</Title>
      </Space>

      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Export your hive data in various formats. Perfect for sharing on forums, pasting into AI assistants,
        or backing up your records.
      </Paragraph>

      <Row gutter={[24, 24]}>
        {/* Left column - Selection */}
        <Col xs={24} lg={14}>
          {/* Hive Selection */}
          <Card title="Select Hives" style={{ marginBottom: 16 }}>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder="Select hives to export"
              value={selectedHiveIds}
              onChange={setSelectedHiveIds}
              loading={hivesLoading}
              options={[
                { value: 'all', label: 'All Hives' },
                ...hives.map((h) => ({ value: h.id, label: h.name })),
              ]}
              maxTagCount={3}
              allowClear
            />
          </Card>

          {/* Field Selection */}
          <Card title="Select Fields" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {/* Basics */}
              <div>
                <Text strong style={{ color: colors.seaBuckthorn }}>BASICS</Text>
                <Checkbox.Group
                  style={{ display: 'flex', flexWrap: 'wrap', marginTop: 8 }}
                  options={EXPORT_FIELD_OPTIONS.basics}
                  value={selectedBasics}
                  onChange={(values) => setSelectedBasics(values as string[])}
                />
              </div>

              <Divider style={{ margin: '8px 0' }} />

              {/* Details */}
              <div>
                <Text strong style={{ color: colors.seaBuckthorn }}>DETAILS</Text>
                <Checkbox.Group
                  style={{ display: 'flex', flexWrap: 'wrap', marginTop: 8 }}
                  options={EXPORT_FIELD_OPTIONS.details}
                  value={selectedDetails}
                  onChange={(values) => setSelectedDetails(values as string[])}
                />
              </div>

              <Divider style={{ margin: '8px 0' }} />

              {/* Analysis */}
              <div>
                <Text strong style={{ color: colors.seaBuckthorn }}>ANALYSIS</Text>
                <Checkbox.Group
                  style={{ display: 'flex', flexWrap: 'wrap', marginTop: 8 }}
                  options={EXPORT_FIELD_OPTIONS.analysis}
                  value={selectedAnalysis}
                  onChange={(values) => setSelectedAnalysis(values as string[])}
                />
              </div>

              <Divider style={{ margin: '8px 0' }} />

              {/* Financial */}
              <div>
                <Text strong style={{ color: colors.seaBuckthorn }}>FINANCIAL</Text>
                <Checkbox.Group
                  style={{ display: 'flex', flexWrap: 'wrap', marginTop: 8 }}
                  options={EXPORT_FIELD_OPTIONS.financial}
                  value={selectedFinancial}
                  onChange={(values) => setSelectedFinancial(values as string[])}
                />
              </div>
            </Space>
          </Card>

          {/* Format Selection */}
          <Card title="Select Format" style={{ marginBottom: 16 }}>
            <Radio.Group
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              buttonStyle="solid"
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio.Button value="summary" style={{ width: '100%', height: 'auto', padding: '8px 16px' }}>
                  <Space>
                    <FileTextOutlined />
                    <span>
                      <strong>Quick Summary</strong>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>Short text suitable for forum posts</Text>
                    </span>
                  </Space>
                </Radio.Button>
                <Radio.Button value="markdown" style={{ width: '100%', height: 'auto', padding: '8px 16px' }}>
                  <Space>
                    <FileMarkdownOutlined />
                    <span>
                      <strong>Detailed Markdown</strong>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>Full context with structured data for AI assistants</Text>
                    </span>
                  </Space>
                </Radio.Button>
                <Radio.Button value="json" style={{ width: '100%', height: 'auto', padding: '8px 16px' }}>
                  <Space>
                    <CodeOutlined />
                    <span>
                      <strong>Full JSON</strong>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>Complete structured data for programmatic use</Text>
                    </span>
                  </Space>
                </Radio.Button>
              </Space>
            </Radio.Group>
          </Card>

          {/* Actions */}
          <Card>
            <Space wrap>
              <Button
                type="primary"
                icon={<EyeOutlined />}
                onClick={handlePreview}
                loading={exporting}
                disabled={selectedHiveIds.length === 0}
                size="large"
              >
                Preview Export
              </Button>
              <Button
                icon={<SaveOutlined />}
                onClick={() => setPresetModalVisible(true)}
                disabled={
                  selectedBasics.length === 0 &&
                  selectedDetails.length === 0 &&
                  selectedAnalysis.length === 0 &&
                  selectedFinancial.length === 0
                }
              >
                Save as Preset
              </Button>
            </Space>
          </Card>
        </Col>

        {/* Right column - Presets & Preview */}
        <Col xs={24} lg={10}>
          {/* Presets */}
          <Card title="Saved Presets" style={{ marginBottom: 16 }}>
            {presetsLoading ? (
              <Spin />
            ) : presets.length === 0 ? (
              <Text type="secondary">No saved presets yet. Configure your fields and save a preset for quick access.</Text>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: '#fafafa',
                      borderRadius: 4,
                    }}
                  >
                    <Text
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleLoadPreset(preset)}
                    >
                      {preset.name}
                    </Text>
                    <Tooltip title="Delete preset">
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        size="small"
                        onClick={() => handleDeletePreset(preset.id)}
                        loading={deletingPreset}
                      />
                    </Tooltip>
                  </div>
                ))}
              </Space>
            )}
          </Card>

          {/* Preview */}
          {showPreview && (
            <Card
              title={
                <Space>
                  {getFormatIcon(format)}
                  <span>Preview</span>
                </Space>
              }
              extra={
                <Space>
                  <Button
                    icon={<CopyOutlined />}
                    onClick={handleCopy}
                    disabled={!preview}
                  >
                    Copy
                  </Button>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={handleDownload}
                    disabled={!preview}
                  >
                    Download
                  </Button>
                </Space>
              }
            >
              {preview ? (
                <TextArea
                  value={preview}
                  readOnly
                  autoSize={{ minRows: 10, maxRows: 25 }}
                  style={{
                    fontFamily: format === 'json' ? 'monospace' : 'inherit',
                    fontSize: format === 'json' ? 12 : 14,
                  }}
                />
              ) : (
                <Alert
                  type="info"
                  message="Click 'Preview Export' to see your data"
                  showIcon
                />
              )}
            </Card>
          )}
        </Col>
      </Row>

      {/* Save Preset Modal */}
      <Modal
        title="Save Export Preset"
        open={presetModalVisible}
        onOk={handleSavePreset}
        onCancel={() => {
          setPresetModalVisible(false);
          setPresetName('');
        }}
        confirmLoading={savingPreset}
        okText="Save"
      >
        <Input
          placeholder="Enter preset name"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          onPressEnter={handleSavePreset}
          autoFocus
        />
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          Save your current field selection as a preset for quick access later.
        </Paragraph>
      </Modal>
    </div>
  );
}

export default Export;
