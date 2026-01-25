/**
 * TreatmentFollowupModal Component
 *
 * Modal for adding a follow-up mite count to an existing treatment.
 * Automatically calculates and displays efficacy preview.
 *
 * Part of Epic 6, Story 6.1 (Treatment Log)
 */
import { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  InputNumber,
  Space,
  Button,
  Typography,
  Statistic,
  Progress,
} from 'antd';
import {
  CheckCircleOutlined,
  ExperimentOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import {
  type Treatment,
  type UpdateTreatmentInput,
  formatTreatmentType,
  formatTreatmentMethod,
} from '../hooks/useTreatments';

const { Text, Title } = Typography;

interface TreatmentFollowupModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (id: string, input: UpdateTreatmentInput) => Promise<void>;
  loading?: boolean;
  treatment: Treatment | null;
}

interface FormValues {
  mite_count_after: number;
}

/**
 * Treatment Follow-up Modal
 *
 * Allows adding "mite count after" to an existing treatment
 * to calculate and track treatment efficacy.
 */
export function TreatmentFollowupModal({
  open,
  onClose,
  onSubmit,
  loading = false,
  treatment,
}: TreatmentFollowupModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [previewEfficacy, setPreviewEfficacy] = useState<number | null>(null);

  // Reset form when modal opens or treatment changes
  useEffect(() => {
    if (open && treatment) {
      form.resetFields();
      if (treatment.mite_count_after !== undefined) {
        form.setFieldsValue({
          mite_count_after: treatment.mite_count_after,
        });
        // Calculate initial preview if already has value
        if (treatment.mite_count_before !== undefined) {
          const efficacy = Math.round(
            ((treatment.mite_count_before - treatment.mite_count_after) /
              treatment.mite_count_before) *
              100
          );
          setPreviewEfficacy(efficacy);
        }
      } else {
        setPreviewEfficacy(null);
      }
    }
  }, [open, treatment, form]);

  const handleValuesChange = (changedValues: Partial<FormValues>) => {
    if (changedValues.mite_count_after !== undefined && treatment?.mite_count_before) {
      const before = treatment.mite_count_before;
      const after = changedValues.mite_count_after;
      if (after !== undefined && before > 0) {
        const efficacy = Math.round(((before - after) / before) * 100);
        setPreviewEfficacy(efficacy);
      } else {
        setPreviewEfficacy(null);
      }
    }
  };

  const handleSubmit = async (values: FormValues) => {
    if (!treatment) return;

    const input: UpdateTreatmentInput = {
      mite_count_after: values.mite_count_after,
    };

    await onSubmit(treatment.id, input);
  };

  if (!treatment) return null;

  const hasBeforeCount = treatment.mite_count_before !== undefined;

  return (
    <Modal
      title={
        <Space>
          <ExperimentOutlined style={{ color: colors.seaBuckthorn, fontSize: 20 }} />
          <span>Add Follow-up Count</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={480}
      destroyOnClose
    >
      {/* Treatment Summary */}
      <div
        style={{
          padding: 16,
          backgroundColor: 'rgba(247, 164, 45, 0.08)',
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <Title level={5} style={{ margin: 0, marginBottom: 8 }}>
          {formatTreatmentType(treatment.treatment_type)}
        </Title>
        <Space direction="vertical" size={2}>
          <Text type="secondary">
            {dayjs(treatment.treated_at).format('MMMM D, YYYY')}
          </Text>
          {treatment.method && (
            <Text type="secondary">
              Method: {formatTreatmentMethod(treatment.method)}
            </Text>
          )}
          {treatment.dose && (
            <Text type="secondary">
              Dose: {treatment.dose}
            </Text>
          )}
        </Space>
      </div>

      {/* Before Count Display */}
      {hasBeforeCount ? (
        <div style={{ marginBottom: 20 }}>
          <Statistic
            title="Mite Count Before Treatment"
            value={treatment.mite_count_before}
            valueStyle={{ color: colors.warning }}
          />
        </div>
      ) : (
        <div
          style={{
            padding: 12,
            backgroundColor: 'rgba(247, 164, 45, 0.05)',
            borderRadius: 8,
            marginBottom: 20,
          }}
        >
          <Text type="secondary">
            No "before" mite count was recorded for this treatment.
            Efficacy calculation requires both before and after counts.
          </Text>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onValuesChange={handleValuesChange}
      >
        {/* Mite Count After */}
        <Form.Item
          name="mite_count_after"
          label="Mite Count After Treatment"
          rules={[{ required: true, message: 'Please enter mite count' }]}
        >
          <InputNumber
            min={0}
            max={9999}
            style={{ width: '100%' }}
            placeholder="e.g., 2"
            autoFocus
          />
        </Form.Item>

        {/* Efficacy Preview */}
        {hasBeforeCount && previewEfficacy !== null && (
          <div
            style={{
              padding: 16,
              backgroundColor:
                previewEfficacy >= 80
                  ? 'rgba(46, 125, 50, 0.1)'
                  : previewEfficacy >= 50
                  ? 'rgba(247, 164, 45, 0.1)'
                  : 'rgba(194, 54, 22, 0.1)',
              borderRadius: 8,
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              Estimated Efficacy
            </Text>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {previewEfficacy >= 0 ? (
                <ArrowDownOutlined style={{ color: colors.success, fontSize: 20 }} />
              ) : (
                <ArrowUpOutlined style={{ color: colors.error, fontSize: 20 }} />
              )}
              <Title
                level={2}
                style={{
                  margin: 0,
                  color:
                    previewEfficacy >= 80
                      ? colors.success
                      : previewEfficacy >= 50
                      ? colors.warning
                      : colors.error,
                }}
              >
                {Math.abs(previewEfficacy)}%
              </Title>
            </div>
            <Text
              style={{
                color:
                  previewEfficacy >= 80
                    ? colors.success
                    : previewEfficacy >= 50
                    ? colors.warning
                    : colors.error,
              }}
            >
              {previewEfficacy >= 0 ? 'reduction' : 'increase'}
            </Text>

            {/* Visual Progress */}
            <Progress
              percent={Math.min(Math.abs(previewEfficacy), 100)}
              showInfo={false}
              strokeColor={
                previewEfficacy >= 80
                  ? colors.success
                  : previewEfficacy >= 50
                  ? colors.warning
                  : colors.error
              }
              trailColor="rgba(0,0,0,0.06)"
              style={{ marginTop: 12 }}
            />

            {previewEfficacy >= 80 && (
              <div style={{ marginTop: 8 }}>
                <CheckCircleOutlined style={{ color: colors.success, marginRight: 4 }} />
                <Text type="secondary">Excellent treatment effectiveness!</Text>
              </div>
            )}
          </div>
        )}

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
              icon={<CheckCircleOutlined />}
            >
              Save Follow-up
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default TreatmentFollowupModal;
