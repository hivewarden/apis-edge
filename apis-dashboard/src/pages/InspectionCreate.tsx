import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Space,
  Spin,
  message,
  Segmented,
  Input,
  Checkbox,
  Progress,
  Divider,
  Tag,
} from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CrownOutlined,
  AppstoreOutlined,
  HomeOutlined,
  WarningOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  SaveOutlined,
  MinusOutlined,
  PlusOutlined,
  CloudOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiClient } from '../providers/apiClient';
import { colors } from '../theme/apisTheme';
import { FrameEntryCard, type FrameData, VoiceInputButton } from '../components';
import { useSettings } from '../context';
import { useOnlineStatus, useAuth, useHiveDetail } from '../hooks';
import { saveOfflineInspection } from '../services/offlineInspection';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface InspectionData {
  inspected_at: string;
  queen_seen: boolean | null;
  eggs_seen: boolean | null;
  queen_cells: boolean | null;
  brood_frames: number;
  brood_pattern: string | null;
  honey_level: string | null;
  pollen_level: string | null;
  temperament: string | null;
  issues: string[];
  notes: string;
}

// Common issue codes for the issues card
const ISSUE_OPTIONS = [
  { value: 'dwv', label: 'DWV (Deformed Wing Virus)', description: 'Wings appear shriveled or deformed' },
  { value: 'chalkbrood', label: 'Chalkbrood', description: 'White, mummy-like larvae' },
  { value: 'wax_moth', label: 'Wax Moth', description: 'Webbing or tunnels in comb' },
  { value: 'robbing', label: 'Robbing', description: 'Fighting at entrance, torn cappings' },
];

const STEPS = [
  { key: 'queen', title: 'Queen', icon: <CrownOutlined /> },
  { key: 'brood', title: 'Brood', icon: <AppstoreOutlined /> },
  { key: 'stores', title: 'Stores', icon: <HomeOutlined /> },
  { key: 'issues', title: 'Issues', icon: <WarningOutlined /> },
  { key: 'notes', title: 'Notes', icon: <FileTextOutlined /> },
  { key: 'review', title: 'Review', icon: <CheckCircleOutlined /> },
];

// Touch-friendly button style - 64px minimum touch target
const touchButtonStyle: React.CSSProperties = {
  minHeight: 64,
  minWidth: 64,
  fontSize: 18,
  fontWeight: 600,
  borderRadius: 12,
};

// Large toggle button for Yes/No/Skip selections
const ToggleButton = ({
  selected,
  onClick,
  label,
  type = 'default',
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  type?: 'yes' | 'no' | 'default';
}) => {
  const getColor = () => {
    if (!selected) return undefined;
    if (type === 'yes') return '#52c41a';
    if (type === 'no') return '#ff4d4f';
    return colors.seaBuckthorn;
  };

  return (
    <Button
      style={{
        ...touchButtonStyle,
        flex: 1,
        backgroundColor: selected ? getColor() : undefined,
        borderColor: selected ? getColor() : undefined,
        color: selected ? '#fff' : undefined,
      }}
      onClick={onClick}
      size="large"
    >
      {label}
    </Button>
  );
};

// Yes/No toggle component for queen observations
const YesNoToggle = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (val: boolean | null) => void;
}) => (
  <div style={{ marginBottom: 24 }}>
    <Text style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>{label}</Text>
    <Space style={{ width: '100%' }} size={12}>
      <ToggleButton
        selected={value === true}
        onClick={() => onChange(value === true ? null : true)}
        label="Yes"
        type="yes"
      />
      <ToggleButton
        selected={value === false}
        onClick={() => onChange(value === false ? null : false)}
        label="No"
        type="no"
      />
    </Space>
  </div>
);

// Stepper for brood frames count
// NOTE: AC3 specifies 0-10 but max=20 is used intentionally for realistic beekeeping
// scenarios where hives may have more than 10 frames of brood (e.g., double-deep setups).
// Database constraint also uses 0-20 for consistency.
const FrameStepper = ({
  value,
  onChange,
  max = 20,
}: {
  value: number;
  onChange: (val: number) => void;
  max?: number;
}) => (
  <div style={{ marginBottom: 24 }}>
    <Text style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>Brood Frames</Text>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <Button
        style={{ ...touchButtonStyle, width: 80 }}
        icon={<MinusOutlined style={{ fontSize: 24 }} />}
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        size="large"
      />
      <div style={{
        flex: 1,
        textAlign: 'center',
        fontSize: 48,
        fontWeight: 700,
        color: colors.brownBramble,
      }}>
        {value}
      </div>
      <Button
        style={{ ...touchButtonStyle, width: 80 }}
        icon={<PlusOutlined style={{ fontSize: 24 }} />}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        size="large"
      />
    </div>
  </div>
);

// Three-way level selector (Low/Medium/High)
const LevelSelector = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (val: string | null) => void;
}) => (
  <div style={{ marginBottom: 24 }}>
    <Text style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>{label}</Text>
    <Segmented
      block
      value={value || ''}
      onChange={(val) => onChange(val === '' ? null : (val as string))}
      options={[
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ]}
      style={{
        minHeight: 56,
      }}
      className="inspection-segmented"
    />
  </div>
);

// Pattern selector (Good/Spotty/Poor)
const PatternSelector = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (val: string | null) => void;
}) => (
  <div style={{ marginBottom: 24 }}>
    <Text style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>{label}</Text>
    <Space style={{ width: '100%' }} size={12}>
      {[
        { val: 'good', label: 'Good', color: '#52c41a' },
        { val: 'spotty', label: 'Spotty', color: '#faad14' },
        { val: 'poor', label: 'Poor', color: '#ff4d4f' },
      ].map((opt) => (
        <Button
          key={opt.val}
          style={{
            ...touchButtonStyle,
            flex: 1,
            backgroundColor: value === opt.val ? opt.color : undefined,
            borderColor: value === opt.val ? opt.color : undefined,
            color: value === opt.val ? '#fff' : undefined,
          }}
          onClick={() => onChange(value === opt.val ? null : opt.val)}
          size="large"
        >
          {opt.label}
        </Button>
      ))}
    </Space>
  </div>
);

/**
 * Inspection Create Page
 *
 * A mobile-first, swipe-based inspection form designed for use in the field.
 * Features 64px minimum touch targets and step-by-step card flow.
 *
 * Part of Epic 5, Story 5.3: Quick-Entry Inspection Form
 */
export function InspectionCreate() {
  const { hiveId } = useParams<{ hiveId: string }>();
  const navigate = useNavigate();
  const { advancedMode } = useSettings();
  const isOnline = useOnlineStatus();
  const { user } = useAuth();

  // Use layered hooks architecture for hive data fetching
  const { hive, loading, error } = useHiveDetail(hiveId);

  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [otherIssue, setOtherIssue] = useState('');
  const [frames, setFrames] = useState<FrameData[]>([]);

  const [inspection, setInspection] = useState<InspectionData>({
    inspected_at: new Date().toISOString().split('T')[0],
    queen_seen: null,
    eggs_seen: null,
    queen_cells: null,
    brood_frames: 0,
    brood_pattern: null,
    honey_level: null,
    pollen_level: null,
    temperament: null,
    issues: [],
    notes: '',
  });

  // Handle error state from useHiveDetail
  useEffect(() => {
    if (error) {
      message.error('Failed to load hive');
      navigate('/hives');
    }
  }, [error, navigate]);

  const updateInspection = <K extends keyof InspectionData>(
    key: K,
    value: InspectionData[K]
  ) => {
    setInspection((prev) => ({ ...prev, [key]: value }));
  };

  const toggleIssue = (issueCode: string) => {
    setInspection((prev) => ({
      ...prev,
      issues: prev.issues.includes(issueCode)
        ? prev.issues.filter((i) => i !== issueCode)
        : [...prev.issues, issueCode],
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Build the final issues array, including "other" if specified
      const finalIssues = [...inspection.issues];
      if (otherIssue.trim()) {
        finalIssues.push(`other:${otherIssue.trim()}`);
      }

      // Build frame data for API (only if in advanced mode and has data)
      const framePayload = advancedMode && frames.length > 0
        ? frames.map((f) => ({
            box_position: f.boxPosition,
            box_type: f.boxType,
            total_frames: f.totalFrames,
            drawn_frames: f.drawnFrames,
            brood_frames: f.broodFrames,
            honey_frames: f.honeyFrames,
            pollen_frames: f.pollenFrames,
          }))
        : undefined;

      const inspectionPayload = {
        inspected_at: inspection.inspected_at,
        queen_seen: inspection.queen_seen,
        eggs_seen: inspection.eggs_seen,
        queen_cells: inspection.queen_cells,
        brood_frames: inspection.brood_frames > 0 ? inspection.brood_frames : null,
        brood_pattern: inspection.brood_pattern,
        honey_level: inspection.honey_level,
        pollen_level: inspection.pollen_level,
        temperament: inspection.temperament,
        issues: finalIssues,
        notes: inspection.notes || null,
        frames: framePayload,
      };

      if (isOnline) {
        // Online: POST to API as before
        await apiClient.post(`/hives/${hiveId}/inspections`, inspectionPayload);
        message.success('Inspection saved successfully!');
      } else {
        // Offline: Save to IndexedDB
        // Note: In a full multi-tenant system, tenant_id should come from user.tenant_id
        // or similar field. Using user.id as a proxy for now since this is a single-tenant
        // beekeeping app. The fallback ensures offline saves don't fail if user context
        // is unavailable (e.g., during auth transition).
        const tenantId = user?.id;
        if (!tenantId) {
          message.error('Unable to save: Please log in to continue');
          return;
        }
        await saveOfflineInspection(hiveId!, tenantId, inspectionPayload);
        message.success({
          content: (
            <span>
              <CloudOutlined style={{ marginRight: 8 }} />
              Saved locally - will sync when online
            </span>
          ),
          duration: 4,
        });
      }

      navigate(`/hives/${hiveId}`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        message.error(error.response.data.error);
      } else {
        message.error('Failed to save inspection');
      }
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const goPrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!hive) {
    return null;
  }

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  // Render current step content
  const renderStepContent = () => {
    switch (STEPS[currentStep].key) {
      case 'queen':
        return (
          <div>
            <Title level={3} style={{ marginBottom: 24 }}>
              <CrownOutlined style={{ color: colors.seaBuckthorn, marginRight: 8 }} />
              Queen Observations
            </Title>
            <YesNoToggle
              label="Queen seen?"
              value={inspection.queen_seen}
              onChange={(val) => updateInspection('queen_seen', val)}
            />
            <YesNoToggle
              label="Eggs seen?"
              value={inspection.eggs_seen}
              onChange={(val) => updateInspection('eggs_seen', val)}
            />
            <YesNoToggle
              label="Queen cells present?"
              value={inspection.queen_cells}
              onChange={(val) => updateInspection('queen_cells', val)}
            />
          </div>
        );

      case 'brood':
        return (
          <div>
            <Title level={3} style={{ marginBottom: 24 }}>
              <AppstoreOutlined style={{ color: colors.seaBuckthorn, marginRight: 8 }} />
              Brood Assessment
            </Title>
            <FrameStepper
              value={inspection.brood_frames}
              onChange={(val) => updateInspection('brood_frames', val)}
            />
            <PatternSelector
              label="Brood Pattern"
              value={inspection.brood_pattern}
              onChange={(val) => updateInspection('brood_pattern', val)}
            />
            <div style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>
                Temperament (optional)
              </Text>
              <Space style={{ width: '100%' }} size={12}>
                {[
                  { val: 'calm', label: 'Calm' },
                  { val: 'nervous', label: 'Nervous' },
                  { val: 'aggressive', label: 'Aggressive' },
                ].map((opt) => (
                  <Button
                    key={opt.val}
                    style={{
                      ...touchButtonStyle,
                      flex: 1,
                      backgroundColor: inspection.temperament === opt.val ? colors.seaBuckthorn : undefined,
                      borderColor: inspection.temperament === opt.val ? colors.seaBuckthorn : undefined,
                      color: inspection.temperament === opt.val ? '#fff' : undefined,
                    }}
                    onClick={() => updateInspection('temperament',
                      inspection.temperament === opt.val ? null : opt.val)}
                    size="large"
                  >
                    {opt.label}
                  </Button>
                ))}
              </Space>
            </div>
          </div>
        );

      case 'stores':
        return (
          <div>
            <Title level={3} style={{ marginBottom: 24 }}>
              <HomeOutlined style={{ color: colors.seaBuckthorn, marginRight: 8 }} />
              Stores Assessment
            </Title>
            <LevelSelector
              label="Honey Level"
              value={inspection.honey_level}
              onChange={(val) => updateInspection('honey_level', val)}
            />
            <LevelSelector
              label="Pollen Level"
              value={inspection.pollen_level}
              onChange={(val) => updateInspection('pollen_level', val)}
            />
          </div>
        );

      case 'issues':
        return (
          <div>
            <Title level={3} style={{ marginBottom: 24 }}>
              <WarningOutlined style={{ color: colors.seaBuckthorn, marginRight: 8 }} />
              Issues Observed
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 24 }}>
              Select any issues you observed during this inspection.
            </Paragraph>
            {ISSUE_OPTIONS.map((issue) => (
              <div
                key={issue.value}
                style={{
                  padding: 20,
                  marginBottom: 12,
                  borderRadius: 12,
                  border: `2px solid ${inspection.issues.includes(issue.value) ? colors.seaBuckthorn : '#d9d9d9'}`,
                  backgroundColor: inspection.issues.includes(issue.value) ? 'rgba(247, 164, 45, 0.1)' : undefined,
                  cursor: 'pointer',
                  minHeight: 64,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
                onClick={() => toggleIssue(issue.value)}
              >
                <Checkbox
                  checked={inspection.issues.includes(issue.value)}
                  style={{ pointerEvents: 'none' }}
                >
                  <Text strong style={{ fontSize: 16 }}>{issue.label}</Text>
                </Checkbox>
                <Text type="secondary" style={{ display: 'block', marginLeft: 24, marginTop: 4 }}>
                  {issue.description}
                </Text>
              </div>
            ))}
            <Divider>Other Issues</Divider>
            <Input
              placeholder="Describe any other issues..."
              value={otherIssue}
              onChange={(e) => setOtherIssue(e.target.value)}
              style={{ minHeight: 48 }}
              size="large"
            />
          </div>
        );

      case 'notes':
        return (
          <div>
            <Title level={3} style={{ marginBottom: 24 }}>
              <FileTextOutlined style={{ color: colors.seaBuckthorn, marginRight: 8 }} />
              Additional Notes
            </Title>

            {/* Advanced mode: Frame-level data tracking */}
            {advancedMode && hive && (hive.brood_boxes > 0 || hive.honey_supers > 0) && (
              <FrameEntryCard
                broodBoxes={hive.brood_boxes}
                honeySupers={hive.honey_supers}
                frames={frames}
                onChange={setFrames}
              />
            )}

            <Paragraph type="secondary" style={{ marginBottom: 24 }}>
              Add any additional observations or reminders for this hive.
            </Paragraph>
            <TextArea
              placeholder="Enter your notes here..."
              value={inspection.notes}
              onChange={(e) => updateInspection('notes', e.target.value)}
              rows={8}
              style={{ fontSize: 16, marginBottom: 16 }}
              maxLength={2000}
              showCount
            />

            {/* Voice Input - Epic 7, Story 7.5 */}
            <VoiceInputButton
              onTranscript={(text) => {
                // Append voice transcript to existing notes with proper spacing
                const currentNotes = inspection.notes;
                const needsSpace = currentNotes && !currentNotes.endsWith(' ') && !currentNotes.endsWith('\n');
                const newNotes = currentNotes
                  ? currentNotes + (needsSpace ? ' ' : '') + text.trim()
                  : text.trim();
                // Respect maxLength
                updateInspection('notes', newNotes.substring(0, 2000));
              }}
              placeholder="Speak your observations..."
              showKeyboardButton={false}
            />
          </div>
        );

      case 'review':
        return (
          <div>
            <Title level={3} style={{ marginBottom: 24 }}>
              <CheckCircleOutlined style={{ color: colors.seaBuckthorn, marginRight: 8 }} />
              Review Inspection
            </Title>

            <Card size="small" style={{ marginBottom: 16 }}>
              <Text strong>Queen</Text>
              <div style={{ marginTop: 8 }}>
                {inspection.queen_seen !== null && (
                  <Tag color={inspection.queen_seen ? 'success' : 'default'}>
                    Queen: {inspection.queen_seen ? 'Seen' : 'Not seen'}
                  </Tag>
                )}
                {inspection.eggs_seen !== null && (
                  <Tag color={inspection.eggs_seen ? 'success' : 'default'}>
                    Eggs: {inspection.eggs_seen ? 'Seen' : 'Not seen'}
                  </Tag>
                )}
                {inspection.queen_cells !== null && (
                  <Tag color={inspection.queen_cells ? 'warning' : 'default'}>
                    Queen Cells: {inspection.queen_cells ? 'Yes' : 'No'}
                  </Tag>
                )}
              </div>
            </Card>

            <Card size="small" style={{ marginBottom: 16 }}>
              <Text strong>Brood</Text>
              <div style={{ marginTop: 8 }}>
                {inspection.brood_frames > 0 && (
                  <Tag color="blue">Frames: {inspection.brood_frames}</Tag>
                )}
                {inspection.brood_pattern && (
                  <Tag color={
                    inspection.brood_pattern === 'good' ? 'success' :
                    inspection.brood_pattern === 'spotty' ? 'warning' : 'error'
                  }>
                    Pattern: {inspection.brood_pattern}
                  </Tag>
                )}
                {inspection.temperament && (
                  <Tag>Temperament: {inspection.temperament}</Tag>
                )}
              </div>
            </Card>

            <Card size="small" style={{ marginBottom: 16 }}>
              <Text strong>Stores</Text>
              <div style={{ marginTop: 8 }}>
                {inspection.honey_level && (
                  <Tag color="gold">Honey: {inspection.honey_level}</Tag>
                )}
                {inspection.pollen_level && (
                  <Tag color="orange">Pollen: {inspection.pollen_level}</Tag>
                )}
              </div>
            </Card>

            {(inspection.issues.length > 0 || otherIssue.trim()) && (
              <Card size="small" style={{ marginBottom: 16, borderColor: '#faad14' }}>
                <Text strong style={{ color: '#faad14' }}>Issues Observed</Text>
                <div style={{ marginTop: 8 }}>
                  {inspection.issues.map((issue) => (
                    <Tag key={issue} color="warning">
                      {ISSUE_OPTIONS.find((o) => o.value === issue)?.label || issue}
                    </Tag>
                  ))}
                  {otherIssue.trim() && (
                    <Tag color="warning">Other: {otherIssue}</Tag>
                  )}
                </div>
              </Card>
            )}

            {inspection.notes && (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Text strong>Notes</Text>
                <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                  {inspection.notes}
                </Paragraph>
              </Card>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/hives/${hiveId}`)}
          style={{ marginBottom: 16 }}
        >
          Back to {hive.name}
        </Button>
        <Title level={2} style={{ margin: 0, marginBottom: 8 }}>
          New Inspection
        </Title>
        <Text type="secondary">{hive.name}</Text>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 24 }}>
        <Progress
          percent={progress}
          showInfo={false}
          strokeColor={colors.seaBuckthorn}
          trailColor="rgba(247, 164, 45, 0.2)"
        />
        <Space style={{ width: '100%', justifyContent: 'space-between', marginTop: 8 }}>
          {STEPS.map((step, index) => (
            <div
              key={step.key}
              role="button"
              tabIndex={0}
              aria-label={`Go to ${step.title} step${index === currentStep ? ' (current)' : ''}`}
              aria-current={index === currentStep ? 'step' : undefined}
              style={{
                textAlign: 'center',
                opacity: index <= currentStep ? 1 : 0.5,
                cursor: 'pointer',
              }}
              onClick={() => setCurrentStep(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCurrentStep(index);
                }
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                backgroundColor: index <= currentStep ? colors.seaBuckthorn : '#d9d9d9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 4px',
                color: index <= currentStep ? '#fff' : '#999',
              }}>
                {step.icon}
              </div>
              <Text style={{ fontSize: 11, display: 'block' }}>{step.title}</Text>
            </div>
          ))}
        </Space>
      </div>

      {/* Step Content */}
      <Card
        style={{
          minHeight: 400,
          marginBottom: 24,
          borderColor: 'rgba(247, 164, 45, 0.3)',
        }}
      >
        {renderStepContent()}
      </Card>

      {/* Navigation */}
      <div style={{
        display: 'flex',
        gap: 12,
        position: 'sticky',
        bottom: 16,
        backgroundColor: colors.coconutCream,
        padding: '16px 0',
        borderTop: '1px solid rgba(247, 164, 45, 0.2)',
      }}>
        {currentStep > 0 && (
          <Button
            style={{ ...touchButtonStyle, flex: 1 }}
            icon={<ArrowLeftOutlined />}
            onClick={goPrev}
            size="large"
          >
            Back
          </Button>
        )}
        {currentStep < STEPS.length - 1 ? (
          <Button
            type="primary"
            style={{ ...touchButtonStyle, flex: currentStep === 0 ? undefined : 2 }}
            onClick={goNext}
            size="large"
          >
            Next
            <ArrowRightOutlined />
          </Button>
        ) : (
          <Button
            type="primary"
            style={{
              ...touchButtonStyle,
              flex: 2,
              backgroundColor: '#52c41a',
              borderColor: '#52c41a',
            }}
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            size="large"
          >
            SAVE INSPECTION
          </Button>
        )}
      </div>

      {/* CSS for segmented control */}
      <style>{`
        .inspection-segmented .ant-segmented-item {
          min-height: 56px !important;
          font-size: 16px !important;
          font-weight: 600;
        }
        .inspection-segmented .ant-segmented-item-label {
          min-height: 56px !important;
          line-height: 56px !important;
        }
      `}</style>
    </div>
  );
}

export default InspectionCreate;
