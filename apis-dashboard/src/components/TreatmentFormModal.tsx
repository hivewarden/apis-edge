/**
 * TreatmentFormModal Component
 *
 * Modal form for logging varroa treatments. Supports multi-hive selection
 * for applying the same treatment to multiple hives at once.
 *
 * Part of Epic 6, Story 6.1 (Treatment Log)
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
  MedicineBoxOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import {
  TREATMENT_TYPES,
  TREATMENT_METHODS,
  type CreateTreatmentInput,
} from '../hooks/useTreatments';

const { Text } = Typography;

interface Hive {
  id: string;
  name: string;
}

interface TreatmentFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTreatmentInput) => Promise<void>;
  loading?: boolean;
  /** Current hive ID - will be pre-selected */
  currentHiveId: string;
  /** Current hive name for display */
  currentHiveName: string;
  /** All hives available for multi-select */
  availableHives?: Hive[];
}

interface FormValues {
  treated_at: dayjs.Dayjs;
  treatment_type: string;
  method?: string;
  dose?: string;
  mite_count_before?: number;
  weather?: string;
  notes?: string;
}

/**
 * Treatment Form Modal
 *
 * Displays a form for logging varroa treatments with:
 * - Date picker (default: today)
 * - Multi-hive selection (optional)
 * - Treatment type dropdown
 * - Method dropdown
 * - Dose input
 * - Mite count before (optional)
 * - Weather and notes
 */
export function TreatmentFormModal({
  open,
  onClose,
  onSubmit,
  loading = false,
  currentHiveId,
  currentHiveName,
  availableHives = [],
}: TreatmentFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [selectedHiveIds, setSelectedHiveIds] = useState<string[]>([currentHiveId]);
  const [showMultiHive, setShowMultiHive] = useState(false);

  // Reset form and selection when modal opens
  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        treated_at: dayjs(),
      });
      setSelectedHiveIds([currentHiveId]);
      setShowMultiHive(false);
    }
  }, [open, form, currentHiveId]);

  const handleSubmit = async (values: FormValues) => {
    const input: CreateTreatmentInput = {
      hive_ids: selectedHiveIds,
      treated_at: values.treated_at.format('YYYY-MM-DD'),
      treatment_type: values.treatment_type,
      method: values.method,
      dose: values.dose,
      mite_count_before: values.mite_count_before,
      weather: values.weather,
      notes: values.notes,
    };

    await onSubmit(input);
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
          <MedicineBoxOutlined style={{ color: colors.seaBuckthorn, fontSize: 20 }} />
          <span>Log Treatment</span>
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
            Logging treatment for: <strong>{currentHiveName}</strong>
          </Text>
        </div>

        {/* Multi-Hive Selection (expandable) */}
        {otherHives.length > 0 && (
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
                message={`Treatment will be logged for ${selectedHiveIds.length} hives`}
                style={{ marginTop: 8 }}
              />
            )}
          </div>
        )}

        <Divider style={{ margin: '12px 0' }} />

        {/* Date */}
        <Form.Item
          name="treated_at"
          label="Treatment Date"
          rules={[{ required: true, message: 'Please select date' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            format="YYYY-MM-DD"
            disabledDate={(current) => current && current > dayjs().endOf('day')}
          />
        </Form.Item>

        {/* Treatment Type & Method (side by side on larger screens) */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Form.Item
            name="treatment_type"
            label="Treatment Type"
            rules={[{ required: true, message: 'Please select treatment type' }]}
            style={{ flex: '1 1 200px', minWidth: 200 }}
          >
            <Select
              placeholder="Select type"
              options={TREATMENT_TYPES}
              suffixIcon={<MedicineBoxOutlined />}
            />
          </Form.Item>

          <Form.Item
            name="method"
            label="Application Method"
            style={{ flex: '1 1 200px', minWidth: 200 }}
          >
            <Select
              placeholder="Select method"
              options={TREATMENT_METHODS}
              allowClear
              suffixIcon={<ExperimentOutlined />}
            />
          </Form.Item>
        </div>

        {/* Dose */}
        <Form.Item
          name="dose"
          label="Dose / Amount"
        >
          <Input
            placeholder="e.g., 2g, 50ml, 1 strip per frame"
            maxLength={100}
          />
        </Form.Item>

        {/* Mite Count Before */}
        <Form.Item
          name="mite_count_before"
          label="Mite Count Before (optional)"
          tooltip="Number of mites observed before treatment. Use for efficacy tracking."
        >
          <InputNumber
            min={0}
            max={9999}
            style={{ width: '100%' }}
            placeholder="e.g., 12"
          />
        </Form.Item>

        {/* Weather */}
        <Form.Item
          name="weather"
          label="Weather Conditions (optional)"
        >
          <Input
            placeholder="e.g., Sunny, 15°C"
            maxLength={100}
          />
        </Form.Item>

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
              icon={<MedicineBoxOutlined />}
            >
              Log Treatment
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default TreatmentFormModal;
