/**
 * FeedingFormModal Component
 *
 * Modal form for logging hive feedings. Supports multi-hive selection
 * for applying the same feeding to multiple hives at once.
 * Shows concentration field only for syrup-type feeds.
 *
 * Part of Epic 6, Story 6.2 (Feeding Log)
 */
import { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  DatePicker,
  Select,
  Input,
  InputNumber,
  Space,
  Button,
  Checkbox,
  Typography,
  Divider,
  Alert,
} from 'antd';
import {
  CoffeeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import {
  FEED_UNITS,
  CONCENTRATION_OPTIONS,
  feedTypeHasConcentration,
  type CreateFeedingInput,
  type UpdateFeedingInput,
  type Feeding,
} from '../hooks/useFeedings';
import {
  useCustomLabels,
  BUILT_IN_FEED_TYPES,
  mergeTypesWithCustomLabels,
} from '../hooks/useCustomLabels';

const { Text } = Typography;

interface Hive {
  id: string;
  name: string;
}

interface FeedingFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateFeedingInput) => Promise<void>;
  /** Handler for updating an existing feeding (edit mode) */
  onUpdate?: (id: string, input: UpdateFeedingInput) => Promise<void>;
  loading?: boolean;
  /** Current hive ID - will be pre-selected */
  currentHiveId: string;
  /** Current hive name for display */
  currentHiveName: string;
  /** All hives available for multi-select */
  availableHives?: Hive[];
  /** Existing feeding to edit (if provided, modal is in edit mode) */
  editFeeding?: Feeding | null;
}

interface FormValues {
  fed_at: dayjs.Dayjs;
  feed_type: string;
  amount: number;
  unit: string;
  concentration?: string;
  custom_concentration?: string;
  notes?: string;
}

/**
 * Feeding Form Modal
 *
 * Displays a form for logging hive feedings with:
 * - Date picker (default: today)
 * - Multi-hive selection (optional)
 * - Feed type dropdown
 * - Amount + unit inputs
 * - Conditional concentration field (syrup only)
 * - Notes
 */
export function FeedingFormModal({
  open,
  onClose,
  onSubmit,
  onUpdate,
  loading = false,
  currentHiveId,
  currentHiveName,
  availableHives = [],
  editFeeding = null,
}: FeedingFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [selectedHiveIds, setSelectedHiveIds] = useState<string[]>([currentHiveId]);
  const [showMultiHive, setShowMultiHive] = useState(false);
  const [showConcentration, setShowConcentration] = useState(false);
  const [showCustomConcentration, setShowCustomConcentration] = useState(false);

  const isEditMode = !!editFeeding;

  // Fetch custom feed labels
  const { labels: customFeedLabels } = useCustomLabels('feed');

  // Merge built-in types with custom labels
  const feedTypeOptions = mergeTypesWithCustomLabels(
    BUILT_IN_FEED_TYPES,
    customFeedLabels
  );

  // Reset form and selection when modal opens
  useEffect(() => {
    if (open) {
      form.resetFields();

      if (editFeeding) {
        // Edit mode - pre-fill with existing data
        const hasConc = feedTypeHasConcentration(editFeeding.feed_type);
        const isCustomConc = !!(hasConc && editFeeding.concentration &&
          !['1:1', '2:1'].includes(editFeeding.concentration));

        setShowConcentration(hasConc);
        setShowCustomConcentration(isCustomConc);

        form.setFieldsValue({
          fed_at: dayjs(editFeeding.fed_at),
          feed_type: editFeeding.feed_type,
          amount: editFeeding.amount,
          unit: editFeeding.unit,
          concentration: isCustomConc ? 'custom' : editFeeding.concentration,
          custom_concentration: isCustomConc ? editFeeding.concentration : undefined,
          notes: editFeeding.notes,
        });
        setSelectedHiveIds([editFeeding.hive_id]);
        setShowMultiHive(false);
      } else {
        // Create mode - defaults
        form.setFieldsValue({
          fed_at: dayjs(),
          unit: 'kg',
        });
        setSelectedHiveIds([currentHiveId]);
        setShowMultiHive(false);
        setShowConcentration(false);
        setShowCustomConcentration(false);
      }
    }
  }, [open, form, currentHiveId, editFeeding]);

  const handleFeedTypeChange = (value: string) => {
    const hasConc = feedTypeHasConcentration(value);
    setShowConcentration(hasConc);

    // Clear concentration if switching to non-syrup type
    if (!hasConc) {
      form.setFieldsValue({ concentration: undefined, custom_concentration: undefined });
      setShowCustomConcentration(false);
    }
  };

  const handleConcentrationChange = (value: string) => {
    setShowCustomConcentration(value === 'custom');
    if (value !== 'custom') {
      form.setFieldsValue({ custom_concentration: undefined });
    }
  };

  const handleSubmit = async (values: FormValues) => {
    // Determine concentration value
    let concentration: string | undefined;
    if (showConcentration) {
      if (values.concentration === 'custom' && values.custom_concentration) {
        concentration = values.custom_concentration;
      } else if (values.concentration && values.concentration !== 'custom') {
        concentration = values.concentration;
      }
    }

    if (isEditMode && editFeeding && onUpdate) {
      // Edit mode - update existing feeding
      const updateInput: UpdateFeedingInput = {
        fed_at: values.fed_at.format('YYYY-MM-DD'),
        feed_type: values.feed_type,
        amount: values.amount,
        unit: values.unit,
        concentration,
        notes: values.notes,
      };
      await onUpdate(editFeeding.id, updateInput);
    } else {
      // Create mode - create new feeding(s)
      const input: CreateFeedingInput = {
        hive_ids: selectedHiveIds,
        fed_at: values.fed_at.format('YYYY-MM-DD'),
        feed_type: values.feed_type,
        amount: values.amount,
        unit: values.unit,
        concentration,
        notes: values.notes,
      };
      await onSubmit(input);
    }
  };

  const handleHiveToggle = (hiveId: string, checked: boolean) => {
    if (checked) {
      setSelectedHiveIds(prev => [...prev, hiveId]);
    } else {
      // Don't allow unchecking the current hive
      if (hiveId !== currentHiveId) {
        setSelectedHiveIds(prev => prev.filter(id => id !== hiveId));
      }
    }
  };

  const otherHives = availableHives.filter(h => h.id !== currentHiveId);

  return (
    <Modal
      title={
        <Space>
          <CoffeeOutlined style={{ color: colors.seaBuckthorn, fontSize: 20 }} />
          <span>{isEditMode ? 'Edit Feeding' : 'Log Feeding'}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark="optional"
      >
        {/* Current Hive Info */}
        <div
          style={{
            padding: 12,
            backgroundColor: 'rgba(247, 164, 45, 0.1)',
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <Text>
            {isEditMode ? 'Editing' : 'Logging'} feeding for: <strong>{currentHiveName}</strong>
          </Text>
        </div>

        {/* Multi-Hive Selection (expandable) - only in create mode */}
        {!isEditMode && otherHives.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Checkbox
              checked={showMultiHive}
              onChange={(e) => setShowMultiHive(e.target.checked)}
            >
              Apply to multiple hives
            </Checkbox>

            {showMultiHive && (
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  maxHeight: 150,
                  overflowY: 'auto',
                }}
              >
                {otherHives.map((hive) => (
                  <Checkbox
                    key={hive.id}
                    checked={selectedHiveIds.includes(hive.id)}
                    onChange={(e) => handleHiveToggle(hive.id, e.target.checked)}
                    style={{ display: 'block', marginBottom: 4 }}
                  >
                    {hive.name}
                  </Checkbox>
                ))}
              </div>
            )}

            {selectedHiveIds.length > 1 && (
              <Alert
                type="info"
                showIcon
                message={`Feeding will be logged for ${selectedHiveIds.length} hives`}
                style={{ marginTop: 8 }}
              />
            )}
          </div>
        )}

        <Divider style={{ margin: '12px 0' }} />

        {/* Date */}
        <Form.Item
          name="fed_at"
          label="Feeding Date"
          rules={[{ required: true, message: 'Please select date' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            format="YYYY-MM-DD"
            disabledDate={(current) => current && current > dayjs().endOf('day')}
          />
        </Form.Item>

        {/* Feed Type */}
        <Form.Item
          name="feed_type"
          label="Feed Type"
          rules={[{ required: true, message: 'Please select feed type' }]}
        >
          <Select
            placeholder="Select type"
            options={feedTypeOptions}
            onChange={handleFeedTypeChange}
            suffixIcon={<CoffeeOutlined />}
          />
        </Form.Item>

        {/* Amount & Unit (side by side) */}
        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item
            name="amount"
            label="Amount"
            rules={[{ required: true, message: 'Please enter amount' }]}
            style={{ flex: 2 }}
          >
            <InputNumber
              min={0.01}
              max={9999}
              step={0.5}
              precision={2}
              style={{ width: '100%' }}
              placeholder="e.g., 2.5"
            />
          </Form.Item>

          <Form.Item
            name="unit"
            label="Unit"
            rules={[{ required: true, message: 'Required' }]}
            style={{ flex: 1, minWidth: 100 }}
          >
            <Select options={FEED_UNITS} />
          </Form.Item>
        </div>

        {/* Concentration (conditional - only for syrup) */}
        {showConcentration && (
          <>
            <Form.Item
              name="concentration"
              label="Concentration"
              tooltip="Syrup concentration ratio (sugar:water by weight)"
            >
              <Select
                placeholder="Select concentration"
                allowClear
                options={[
                  ...CONCENTRATION_OPTIONS,
                  { value: 'custom', label: 'Custom...' },
                ]}
                onChange={handleConcentrationChange}
              />
            </Form.Item>

            {showCustomConcentration && (
              <Form.Item
                name="custom_concentration"
                label="Custom Concentration"
                rules={[{ required: true, message: 'Please enter custom concentration' }]}
              >
                <Input
                  placeholder="e.g., 1.5:1"
                  maxLength={20}
                />
              </Form.Item>
            )}
          </>
        )}

        {/* Notes */}
        <Form.Item
          name="notes"
          label="Notes"
        >
          <Input.TextArea
            rows={3}
            placeholder="Any additional observations..."
            maxLength={500}
            showCount
          />
        </Form.Item>

        {/* Actions */}
        <Form.Item style={{ marginBottom: 0 }}>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<CoffeeOutlined />}
            >
              {isEditMode ? 'Save Changes' : 'Log Feeding'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default FeedingFormModal;
