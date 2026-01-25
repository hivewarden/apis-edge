/**
 * HarvestFormModal Component
 *
 * Modal form for logging honey harvests with per-hive breakdown.
 * Features split mode toggle for distributing total yield across hives.
 * Celebrates the culmination of the beekeeper's hard work with warm visuals.
 *
 * Part of Epic 6, Story 6.3 (Harvest Tracking)
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Form,
  DatePicker,
  Input,
  InputNumber,
  Space,
  Button,
  Checkbox,
  Typography,
  Divider,
  Radio,
  Card,
  Tooltip,
} from 'antd';
import {
  GiftOutlined,
  ScissorOutlined,
  CalculatorOutlined,
  EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import type { CreateHarvestInput, Harvest, HarvestHiveInput } from '../hooks/useHarvests';

const { Text, Title } = Typography;

interface Hive {
  id: string;
  name: string;
}

interface HarvestFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateHarvestInput) => Promise<Harvest>;
  onUpdate?: (id: string, input: UpdateHarvestInput) => Promise<void>;
  loading?: boolean;
  siteId: string;
  availableHives: Hive[];
  editHarvest?: Harvest | null;
}

interface UpdateHarvestInput {
  harvested_at?: string;
  total_kg?: number;
  notes?: string;
  hive_breakdown?: HarvestHiveInput[];
}

interface FormValues {
  harvested_at: dayjs.Dayjs;
  total_kg: number;
  notes?: string;
}

interface PerHiveData {
  frames?: number;
  amount_kg: number;
}

type SplitMode = 'even' | 'manual';

/**
 * Honey jar SVG icon for the harvest theme
 */
const HoneyJarIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    style={{ display: 'block' }}
  >
    <path
      d="M7 7V6C7 4.34315 8.34315 3 10 3H14C15.6569 3 17 4.34315 17 6V7"
      stroke={colors.seaBuckthorn}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M5 9C5 8.44772 5.44772 8 6 8H18C18.5523 8 19 8.44772 19 9V19C19 20.1046 18.1046 21 17 21H7C5.89543 21 5 20.1046 5 19V9Z"
      fill={colors.seaBuckthorn}
      fillOpacity="0.2"
      stroke={colors.seaBuckthorn}
      strokeWidth="2"
    />
    <path
      d="M8 13C8 13 9 15 12 15C15 15 16 13 16 13"
      stroke={colors.seaBuckthorn}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Harvest Form Modal
 *
 * A warm, celebratory form for logging the fruits of beekeeping labor.
 * Features intelligent split mode for distributing harvest across hives.
 */
export function HarvestFormModal({
  open,
  onClose,
  onSubmit,
  onUpdate,
  loading = false,
  siteId,
  availableHives,
  editHarvest,
}: HarvestFormModalProps) {
  const isEditMode = !!editHarvest;
  const [form] = Form.useForm<FormValues>();
  const [selectedHiveIds, setSelectedHiveIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>('even');
  const [perHiveData, setPerHiveData] = useState<Record<string, PerHiveData>>({});

  // Watch total_kg for auto-split calculation
  const totalKg = Form.useWatch('total_kg', form);

  // Calculate per-hive amount when splitting evenly
  const evenSplitAmount = useMemo(() => {
    if (!totalKg || selectedHiveIds.length === 0) return 0;
    return Math.round((totalKg / selectedHiveIds.length) * 100) / 100;
  }, [totalKg, selectedHiveIds.length]);

  // Calculate sum of manual entries for validation
  const manualSum = useMemo(() => {
    if (splitMode !== 'manual') return totalKg || 0;
    return Object.values(perHiveData).reduce((sum, data) => sum + (data.amount_kg || 0), 0);
  }, [perHiveData, splitMode, totalKg]);

  // Validation: check if manual sum matches total
  const sumMismatch = splitMode === 'manual' && !!totalKg && Math.abs(manualSum - totalKg) > 0.01;

  // Reset form when modal opens or populate for edit mode
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (editHarvest) {
        // Edit mode - populate form with existing data
        form.setFieldsValue({
          harvested_at: dayjs(editHarvest.harvested_at),
          total_kg: editHarvest.total_kg,
          notes: editHarvest.notes,
        });
        // Set selected hives from edit data
        const hiveIds = editHarvest.hives?.map((h) => h.hive_id) || [];
        setSelectedHiveIds(hiveIds);
        setSplitMode('manual'); // Always manual in edit mode

        // Populate per-hive data
        const hiveData: Record<string, PerHiveData> = {};
        editHarvest.hives?.forEach((h) => {
          hiveData[h.hive_id] = {
            frames: h.frames,
            amount_kg: h.amount_kg,
          };
        });
        setPerHiveData(hiveData);
      } else {
        // Create mode - reset to defaults
        form.setFieldsValue({
          harvested_at: dayjs(),
        });
        setSelectedHiveIds([]);
        setSplitMode('even');
        setPerHiveData({});
      }
    }
  }, [open, form, editHarvest]);

  // Initialize per-hive data when selection changes
  useEffect(() => {
    setPerHiveData((prev) => {
      const newData: Record<string, PerHiveData> = {};
      selectedHiveIds.forEach((id) => {
        newData[id] = prev[id] || { frames: undefined, amount_kg: 0 };
      });
      return newData;
    });
  }, [selectedHiveIds]);

  const handleHiveToggle = (hiveId: string, checked: boolean) => {
    if (checked) {
      setSelectedHiveIds((prev) => [...prev, hiveId]);
    } else {
      setSelectedHiveIds((prev) => prev.filter((id) => id !== hiveId));
    }
  };

  const handlePerHiveChange = (hiveId: string, field: keyof PerHiveData, value: number | undefined) => {
    setPerHiveData((prev) => ({
      ...prev,
      [hiveId]: {
        ...prev[hiveId],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (values: FormValues) => {
    // Build hive breakdown
    const hiveBreakdown: HarvestHiveInput[] = selectedHiveIds.map((hiveId) => {
      if (splitMode === 'even') {
        return {
          hive_id: hiveId,
          frames: perHiveData[hiveId]?.frames,
          amount_kg: evenSplitAmount,
        };
      }
      return {
        hive_id: hiveId,
        frames: perHiveData[hiveId]?.frames,
        amount_kg: perHiveData[hiveId]?.amount_kg || 0,
      };
    });

    if (isEditMode && editHarvest && onUpdate) {
      // Update existing harvest - always send total_kg with hive_breakdown
      // so backend validation can verify sum(breakdown) === total_kg
      await onUpdate(editHarvest.id, {
        harvested_at: values.harvested_at.format('YYYY-MM-DD'),
        total_kg: values.total_kg,
        notes: values.notes,
        hive_breakdown: hiveBreakdown,
      });
    } else {
      // Create new harvest
      const input: CreateHarvestInput = {
        site_id: siteId,
        harvested_at: values.harvested_at.format('YYYY-MM-DD'),
        total_kg: values.total_kg,
        notes: values.notes,
        hive_breakdown: hiveBreakdown,
      };
      await onSubmit(input);
    }
  };

  const getHiveName = (hiveId: string): string => {
    const hive = availableHives.find((h) => h.id === hiveId);
    return hive?.name || 'Unknown Hive';
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${colors.seaBuckthorn}22 0%, ${colors.salomie}44 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <HoneyJarIcon />
          </div>
          <div>
            <Title level={5} style={{ margin: 0, color: colors.brownBramble }}>
              {isEditMode ? 'Edit Harvest' : 'Log Harvest'}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {isEditMode ? 'Update harvest details' : 'Record your honey yield'}
            </Text>
          </div>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnClose
      styles={{
        header: {
          borderBottom: `1px solid ${colors.border}`,
          paddingBottom: 16,
        },
        body: {
          paddingTop: 20,
        },
      }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark="optional"
      >
        {/* Hive Selection */}
        <Form.Item
          label={
            <Space>
              <GiftOutlined style={{ color: colors.seaBuckthorn }} />
              <span>Select Hives</span>
            </Space>
          }
          required
          help={selectedHiveIds.length === 0 ? 'Select at least one hive' : undefined}
          validateStatus={selectedHiveIds.length === 0 ? 'error' : undefined}
        >
          <div
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: 12,
              maxHeight: 160,
              overflowY: 'auto',
              background: `linear-gradient(180deg, ${colors.coconutCream} 0%, white 100%)`,
            }}
          >
            {availableHives.length === 0 ? (
              <Text type="secondary">No hives available at this site</Text>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {availableHives.map((hive) => (
                  <Checkbox
                    key={hive.id}
                    checked={selectedHiveIds.includes(hive.id)}
                    onChange={(e) => handleHiveToggle(hive.id, e.target.checked)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      transition: 'background 0.2s',
                      background: selectedHiveIds.includes(hive.id)
                        ? `${colors.seaBuckthorn}15`
                        : 'transparent',
                    }}
                  >
                    {hive.name}
                  </Checkbox>
                ))}
              </div>
            )}
          </div>
        </Form.Item>

        {selectedHiveIds.length > 0 && (
          <>
            <Divider style={{ margin: '16px 0' }} />

            {/* Harvest Details */}
            <div style={{ display: 'flex', gap: 16 }}>
              {/* Date */}
              <Form.Item
                name="harvested_at"
                label="Harvest Date"
                rules={[{ required: true, message: 'Please select date' }]}
                style={{ flex: 1 }}
              >
                <DatePicker
                  style={{ width: '100%' }}
                  format="YYYY-MM-DD"
                  disabledDate={(current) => current && current > dayjs().endOf('day')}
                />
              </Form.Item>

              {/* Total Amount */}
              <Form.Item
                name="total_kg"
                label="Total Harvest"
                rules={[
                  { required: true, message: 'Required' },
                  { type: 'number', min: 0.01, message: 'Must be > 0' },
                ]}
                style={{ flex: 1 }}
              >
                <InputNumber
                  min={0.01}
                  max={9999}
                  step={0.5}
                  precision={2}
                  style={{ width: '100%' }}
                  placeholder="0.00"
                  suffix="kg"
                />
              </Form.Item>
            </div>

            {/* Split Mode Toggle */}
            {selectedHiveIds.length > 1 && totalKg && (
              <Form.Item
                label={
                  <Space>
                    <ScissorOutlined style={{ color: colors.seaBuckthorn }} />
                    <span>Distribution Method</span>
                  </Space>
                }
              >
                <Radio.Group
                  value={splitMode}
                  onChange={(e) => setSplitMode(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                  style={{ width: '100%' }}
                >
                  <Radio.Button value="even" style={{ width: '50%', textAlign: 'center' }}>
                    <Space>
                      <CalculatorOutlined />
                      Split Evenly
                    </Space>
                  </Radio.Button>
                  <Radio.Button value="manual" style={{ width: '50%', textAlign: 'center' }}>
                    <Space>
                      <EditOutlined />
                      Enter Per-Hive
                    </Space>
                  </Radio.Button>
                </Radio.Group>
              </Form.Item>
            )}

            {/* Per-Hive Breakdown */}
            <div style={{ marginBottom: 16 }}>
              <Text
                strong
                style={{
                  display: 'block',
                  marginBottom: 12,
                  color: colors.brownBramble,
                }}
              >
                Per-Hive Breakdown
                {splitMode === 'even' && selectedHiveIds.length > 1 && (
                  <Text
                    type="secondary"
                    style={{ fontWeight: 'normal', marginLeft: 8 }}
                  >
                    ({evenSplitAmount.toFixed(2)} kg each)
                  </Text>
                )}
              </Text>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedHiveIds.map((hiveId) => (
                  <Card
                    key={hiveId}
                    size="small"
                    style={{
                      background: `linear-gradient(90deg, ${colors.salomie}33 0%, ${colors.coconutCream} 100%)`,
                      border: `1px solid ${colors.border}`,
                    }}
                    styles={{
                      body: { padding: '10px 14px' },
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <Text strong style={{ minWidth: 80, color: colors.brownBramble }}>
                        {getHiveName(hiveId)}
                      </Text>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {/* Frames (optional) */}
                        <Tooltip title="Frames harvested (optional)">
                          <Space size={4}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Frames:
                            </Text>
                            <InputNumber
                              min={0}
                              max={99}
                              precision={0}
                              value={perHiveData[hiveId]?.frames}
                              onChange={(v) =>
                                handlePerHiveChange(hiveId, 'frames', v ?? undefined)
                              }
                              style={{ width: 60 }}
                              size="small"
                              placeholder="—"
                            />
                          </Space>
                        </Tooltip>

                        {/* Amount */}
                        <Space size={4}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            kg:
                          </Text>
                          {splitMode === 'even' ? (
                            <Text
                              strong
                              style={{
                                color: colors.seaBuckthorn,
                                minWidth: 60,
                                textAlign: 'right',
                              }}
                            >
                              {evenSplitAmount.toFixed(2)}
                            </Text>
                          ) : (
                            <InputNumber
                              min={0}
                              max={9999}
                              step={0.1}
                              precision={2}
                              value={perHiveData[hiveId]?.amount_kg}
                              onChange={(v) =>
                                handlePerHiveChange(hiveId, 'amount_kg', v ?? 0)
                              }
                              style={{ width: 80 }}
                              size="small"
                              status={sumMismatch ? 'warning' : undefined}
                            />
                          )}
                        </Space>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Sum validation message */}
              {sumMismatch && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    background: `${colors.warning}15`,
                    borderRadius: 6,
                    border: `1px solid ${colors.warning}33`,
                  }}
                >
                  <Text style={{ color: colors.warning, fontSize: 13 }}>
                    Per-hive amounts ({manualSum.toFixed(2)} kg) don't match total ({totalKg.toFixed(2)} kg)
                  </Text>
                </div>
              )}
            </div>

            <Divider style={{ margin: '16px 0' }} />

            {/* Quality Notes */}
            <Form.Item
              name="notes"
              label={
                <Space>
                  <span>Quality Notes</span>
                  <Text type="secondary" style={{ fontWeight: 'normal' }}>
                    (color, taste, floral source)
                  </Text>
                </Space>
              }
            >
              <Input.TextArea
                rows={3}
                placeholder="e.g., Light amber color, floral aroma, clover/wildflower source..."
                maxLength={500}
                showCount
                style={{
                  background: `linear-gradient(180deg, white 0%, ${colors.coconutCream} 100%)`,
                }}
              />
            </Form.Item>
          </>
        )}

        {/* Actions */}
        <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
            }}
          >
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              disabled={selectedHiveIds.length === 0 || sumMismatch}
              icon={<GiftOutlined />}
              style={{
                background: colors.seaBuckthorn,
                boxShadow: `0 2px 8px ${colors.seaBuckthorn}40`,
              }}
            >
              {isEditMode ? 'Update Harvest' : 'Log Harvest'}
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default HarvestFormModal;
