/**
 * HiveLossWizard Component
 *
 * A multi-step wizard for recording hive loss post-mortem data.
 * Guides the beekeeper through documenting what happened when a hive is lost,
 * with warm, empathetic messaging throughout.
 *
 * Part of Epic 9, Story 9.3 (Hive Loss Post-Mortem)
 */
import { useState } from 'react';
import { Modal, Steps, DatePicker, Select, Checkbox, Input, Radio, Button, Typography, Space, message as antMessage } from 'antd';
import { HeartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import type { CreateHiveLossInput } from '../hooks/useHiveLoss';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

export interface HiveLossWizardProps {
  /** Name of the hive being marked as lost */
  hiveName: string;
  /** Whether the wizard modal is open */
  open: boolean;
  /** Called when the wizard should close (cancel or complete) */
  onClose: () => void;
  /** Called to submit the loss record */
  onSubmit: (input: CreateHiveLossInput) => Promise<void>;
  /** Whether the submission is in progress */
  loading?: boolean;
}

/** Input for creating a hive loss record - re-exported from hook */
export type HiveLossInput = CreateHiveLossInput;

// Cause options with display labels
const CAUSE_OPTIONS = [
  { value: 'starvation', label: 'Starvation' },
  { value: 'varroa', label: 'Varroa/Mites' },
  { value: 'queen_failure', label: 'Queen Failure' },
  { value: 'pesticide', label: 'Pesticide Exposure' },
  { value: 'swarming', label: 'Swarming (absconded)' },
  { value: 'robbing', label: 'Robbing' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'other', label: 'Other' },
];

// Symptom options grouped by category
const SYMPTOM_OPTIONS = [
  { value: 'no_bees', label: 'No bees remaining', category: 'Bees' },
  { value: 'dead_bees_entrance', label: 'Dead bees at entrance/inside', category: 'Bees' },
  { value: 'deformed_wings', label: 'Deformed wings visible', category: 'Disease' },
  { value: 'chalk_brood', label: 'Chalk brood visible', category: 'Disease' },
  { value: 'dead_brood', label: 'Dead brood pattern', category: 'Brood' },
  { value: 'robbing_evidence', label: 'Evidence of robbing (wax debris)', category: 'Environmental' },
  { value: 'moldy_frames', label: 'Moldy frames', category: 'Environmental' },
  { value: 'empty_stores', label: 'Empty honey stores', category: 'Stores' },
  { value: 'shb_evidence', label: 'Small hive beetle evidence', category: 'Pest' },
  { value: 'wax_moth', label: 'Wax moth damage', category: 'Pest' },
];

// Group symptoms by category for display
const SYMPTOM_GROUPS = SYMPTOM_OPTIONS.reduce((acc, symptom) => {
  if (!acc[symptom.category]) {
    acc[symptom.category] = [];
  }
  acc[symptom.category].push(symptom);
  return acc;
}, {} as Record<string, typeof SYMPTOM_OPTIONS>);

export function HiveLossWizard({
  hiveName,
  open,
  onClose,
  onSubmit,
  loading = false,
}: HiveLossWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [discoveredAt, setDiscoveredAt] = useState<dayjs.Dayjs | null>(dayjs());
  const [cause, setCause] = useState<string>('');
  const [causeOther, setCauseOther] = useState<string>('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [symptomsNotes, setSymptomsNotes] = useState<string>('');
  const [reflection, setReflection] = useState<string>('');
  const [dataChoice, setDataChoice] = useState<'archive' | 'delete'>('archive');
  const [showCompletion, setShowCompletion] = useState(false);

  const resetForm = () => {
    setCurrentStep(0);
    setDiscoveredAt(dayjs());
    setCause('');
    setCauseOther('');
    setSymptoms([]);
    setSymptomsNotes('');
    setReflection('');
    setDataChoice('archive');
    setShowCompletion(false);
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!discoveredAt || !cause) {
      antMessage.error('Please complete all required fields');
      return;
    }

    const input: CreateHiveLossInput = {
      discovered_at: discoveredAt.format('YYYY-MM-DD'),
      cause,
      cause_other: cause === 'other' ? causeOther : undefined,
      symptoms,
      symptoms_notes: symptomsNotes || undefined,
      reflection: reflection || undefined,
      data_choice: dataChoice,
    };

    try {
      await onSubmit(input);
      setShowCompletion(true);
    } catch (error) {
      antMessage.error('Failed to save loss record. Please try again.');
    }
  };

  const handleComplete = () => {
    resetForm();
    onClose();
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return discoveredAt !== null;
      case 1:
        return cause !== '' && (cause !== 'other' || causeOther.trim() !== '');
      case 2:
        return true; // Symptoms are optional
      case 3:
        return true; // Reflection is optional
      case 4:
        return true; // Data choice has default
      default:
        return false;
    }
  };

  const steps = [
    { title: 'When', description: 'Discovery date' },
    { title: 'What', description: 'Probable cause' },
    { title: 'Observations', description: 'What you saw' },
    { title: 'Reflection', description: 'Looking back' },
    { title: 'Data', description: 'Preserve records' },
  ];

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div style={{ padding: '24px 0' }}>
            <Text style={{ display: 'block', marginBottom: 16, color: colors.brownBramble }}>
              When did you discover the hive was lost?
            </Text>
            <DatePicker
              value={discoveredAt}
              onChange={(date) => setDiscoveredAt(date)}
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              disabledDate={(current) => current && current > dayjs().endOf('day')}
              size="large"
            />
          </div>
        );

      case 1:
        return (
          <div style={{ padding: '24px 0' }}>
            <Text style={{ display: 'block', marginBottom: 16, color: colors.brownBramble }}>
              What do you think happened?
            </Text>
            <Select
              value={cause || undefined}
              onChange={(value) => setCause(value)}
              placeholder="Select probable cause"
              style={{ width: '100%' }}
              size="large"
              options={CAUSE_OPTIONS}
            />
            {cause === 'other' && (
              <Input
                value={causeOther}
                onChange={(e) => setCauseOther(e.target.value)}
                placeholder="Please describe what happened"
                style={{ marginTop: 12 }}
                maxLength={200}
              />
            )}
          </div>
        );

      case 2:
        return (
          <div style={{ padding: '24px 0' }}>
            <Text style={{ display: 'block', marginBottom: 16, color: colors.brownBramble }}>
              What did you observe? (select all that apply)
            </Text>
            <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
              {Object.entries(SYMPTOM_GROUPS).map(([category, categorySymptoms]) => (
                <div key={category} style={{ marginBottom: 16 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                    {category}
                  </Text>
                  <Checkbox.Group
                    value={symptoms}
                    onChange={(values) => setSymptoms(values as string[])}
                    style={{ width: '100%' }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {categorySymptoms.map((symptom) => (
                        <Checkbox key={symptom.value} value={symptom.value}>
                          {symptom.label}
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                </div>
              ))}
            </div>
            <Text style={{ display: 'block', marginBottom: 8, color: colors.brownBramble, fontSize: 13 }}>
              Additional notes (optional)
            </Text>
            <TextArea
              value={symptomsNotes}
              onChange={(e) => setSymptomsNotes(e.target.value)}
              placeholder="Any other observations you'd like to note..."
              rows={3}
              maxLength={500}
            />
          </div>
        );

      case 3:
        return (
          <div style={{ padding: '24px 0' }}>
            <Text style={{ display: 'block', marginBottom: 8, color: colors.brownBramble }}>
              Is there anything you might do differently next time?
            </Text>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
              This is optional. Reflecting can help, but don't be too hard on yourself - beekeeping is full of surprises.
            </Text>
            <TextArea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="Your thoughts... (optional)"
              rows={4}
              maxLength={500}
            />
          </div>
        );

      case 4:
        return (
          <div style={{ padding: '24px 0' }}>
            <Text style={{ display: 'block', marginBottom: 16, color: colors.brownBramble }}>
              Would you like to keep this hive's data for reference?
            </Text>
            <Radio.Group
              value={dataChoice}
              onChange={(e) => setDataChoice(e.target.value)}
              style={{ width: '100%' }}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio value="archive">
                  <div>
                    <Text strong>Archive (recommended)</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Keep all inspection and treatment records for future reference
                    </Text>
                  </div>
                </Radio>
                <Radio value="delete">
                  <div>
                    <Text strong>Remove</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Hide this hive from your active list
                    </Text>
                  </div>
                </Radio>
              </Space>
            </Radio.Group>
          </div>
        );

      default:
        return null;
    }
  };

  if (showCompletion) {
    return (
      <Modal
        open={open}
        onCancel={handleComplete}
        footer={null}
        centered
        width={480}
        closable={false}
        styles={{
          body: {
            padding: '48px 32px',
            textAlign: 'center',
          },
          content: {
            background: colors.coconutCream,
          },
        }}
      >
        <HeartOutlined style={{ fontSize: 48, color: colors.seaBuckthorn, marginBottom: 24 }} />
        <Paragraph style={{ fontSize: 18, color: colors.brownBramble, marginBottom: 8 }}>
          Your records have been saved.
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 32 }}>
          This experience will help you care for future hives.
        </Paragraph>
        <Button
          type="primary"
          size="large"
          onClick={handleComplete}
          style={{
            background: colors.seaBuckthorn,
            borderColor: colors.seaBuckthorn,
            paddingInline: 32,
          }}
        >
          Close
        </Button>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      footer={null}
      centered
      width={560}
      title={null}
      styles={{
        body: {
          padding: '24px',
        },
        content: {
          background: colors.coconutCream,
        },
      }}
    >
      {/* Empathetic Header */}
      <div style={{ textAlign: 'center', marginBottom: 24, padding: '16px 0' }}>
        <HeartOutlined style={{ fontSize: 32, color: colors.seaBuckthorn, marginBottom: 12 }} />
        <Paragraph style={{ marginBottom: 4, fontSize: 18, color: colors.brownBramble }}>
          We're sorry about your loss.
        </Paragraph>
        <Text type="secondary">
          Recording what happened with {hiveName} can help in the future.
        </Text>
      </div>

      {/* Steps */}
      <Steps
        current={currentStep}
        items={steps}
        size="small"
        style={{ marginBottom: 24 }}
      />

      {/* Step Content */}
      <div style={{
        background: 'white',
        borderRadius: 8,
        padding: '0 16px',
        minHeight: 280,
      }}>
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 24,
        paddingTop: 16,
        borderTop: `1px solid ${colors.border}`,
      }}>
        <Button onClick={currentStep === 0 ? handleCancel : handlePrev}>
          {currentStep === 0 ? 'Cancel' : 'Back'}
        </Button>
        <Button
          type="primary"
          onClick={handleNext}
          disabled={!canProceed()}
          loading={loading}
          style={{
            background: colors.seaBuckthorn,
            borderColor: colors.seaBuckthorn,
          }}
        >
          {currentStep === 4 ? 'Save' : 'Next'}
        </Button>
      </div>
    </Modal>
  );
}

export default HiveLossWizard;
