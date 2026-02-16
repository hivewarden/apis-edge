// TODO (S5-M3): This file is 756 lines and should be split. Extract domain-specific
// handlers into custom hooks (e.g., useHiveManagement) and break modal state
// management into smaller composable units.
import { useState, useCallback, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography,
  Button,
  Space,
  Spin,
  message,
  Modal,
  Empty,
  Form,
  DatePicker,
  Select,
  Input,
} from 'antd';
import {
  SwapOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import {
  TreatmentFormModal,
  TreatmentFollowupModal,
  FeedingFormModal,
  HarvestFormModal,
  FirstHarvestModal,
  EquipmentFormModal,
  showFirstHiveCelebration,
  HiveLossWizard,
  HiveDetailMobile,
  HiveDetailDesktop,
} from '../components';
import { LazyQRGeneratorModal } from '../components/lazy';
import type { CreateTreatmentInput, UpdateTreatmentInput, Treatment } from '../hooks/useTreatments';
import type { CreateFeedingInput, UpdateFeedingInput, Feeding } from '../hooks/useFeedings';
import type { CreateHarvestInput, UpdateHarvestInput, Harvest } from '../hooks/useHarvests';
import {
  useTreatments,
  useFeedings,
  useHarvestsByHive,
  useEquipment,
  useHarvestAnalytics,
  useMilestoneFlags,
  useHiveLoss,
  useHiveDetail,
} from '../hooks';
import type { CreateEquipmentLogInput, UpdateEquipmentLogInput, EquipmentLog } from '../hooks/useEquipment';
import { useSettings } from '../context';
import { formatQueenSource, calculateQueenAge } from '../utils';
import { useEffect } from 'react';

const { Text } = Typography;

/**
 * Custom hook for responsive breakpoint detection.
 * Returns true when viewport width is less than 768px (mobile).
 *
 * Part of Epic 14, Story 14.7: Mobile Refactor Hive Detail to Single Scroll Layout
 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}

interface ReplaceQueenForm {
  new_introduced_at: dayjs.Dayjs;
  new_source?: string;
  replacement_reason?: string;
}

const QUEEN_SOURCES = [
  { value: 'breeder', label: 'Breeder' },
  { value: 'swarm', label: 'Swarm' },
  { value: 'split', label: 'Split' },
  { value: 'package', label: 'Package' },
  { value: 'other', label: 'Other' },
];

/**
 * Hive Detail Page
 *
 * Displays detailed information about a hive including:
 * - Queen information with age calculation
 * - Box configuration with visual representation
 * - Queen history timeline
 * - Box change history
 *
 * Responsive layout:
 * - < 768px: HiveDetailMobile (single scroll layout)
 * - >= 768px: HiveDetailDesktop (card-based layout)
 *
 * Part of Epic 5, Story 5.1: Create and Configure Hives
 * Refactored in Epic 14, Story 14.7: Mobile Refactor Hive Detail to Single Scroll Layout
 * Refactored for Layered Hooks Architecture
 */
export function HiveDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { advancedMode } = useSettings();
  const isMobile = useIsMobile();

  // Use hook for hive data fetching
  const {
    hive,
    site,
    siteHives,
    loading,
    deleteHive,
    deleting,
    replaceQueen,
    replacingQueen,
    refetch: refetchHive,
  } = useHiveDetail(id);

  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [replaceForm] = Form.useForm<ReplaceQueenForm>();

  // Treatment state
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [followupModalOpen, setFollowupModalOpen] = useState(false);
  const [selectedTreatment, setSelectedTreatment] = useState<Treatment | null>(null);

  // Feeding state
  const [feedingModalOpen, setFeedingModalOpen] = useState(false);
  const [selectedFeeding, setSelectedFeeding] = useState<Feeding | null>(null);

  // Harvest state
  const [harvestModalOpen, setHarvestModalOpen] = useState(false);
  const [firstHarvestModalOpen, setFirstHarvestModalOpen] = useState(false);
  const [lastHarvestData, setLastHarvestData] = useState<{ amountKg: number; hiveCount: number; date: string; harvestId: string } | null>(null);
  const [selectedHarvest, setSelectedHarvest] = useState<Harvest | null>(null);

  // Milestone flags hook - for checking if first harvest celebration already seen
  const { flags: milestoneFlags, markMilestoneSeen } = useMilestoneFlags();

  // Equipment state
  const [equipmentModalOpen, setEquipmentModalOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentLog | null>(null);
  const [prefilledEquipmentType, setPrefilledEquipmentType] = useState<string | undefined>();
  const [prefilledEquipmentAction, setPrefilledEquipmentAction] = useState<'installed' | 'removed' | undefined>();

  // Hive loss state
  const [lossWizardOpen, setLossWizardOpen] = useState(false);

  // QR Code state - Epic 7, Story 7.6
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // Treatments hook
  const {
    treatments,
    loading: treatmentsLoading,
    error: treatmentsError,
    createTreatment,
    updateTreatment,
    deleteTreatment,
    creating: creatingTreatment,
    updating: updatingTreatment,
    deleting: deletingTreatment,
  } = useTreatments(id || null);

  // Feedings hook
  const {
    feedings,
    seasonTotals,
    loading: feedingsLoading,
    error: feedingsError,
    createFeeding,
    updateFeeding,
    deleteFeeding,
    creating: creatingFeeding,
    updating: updatingFeeding,
    deleting: deletingFeeding,
  } = useFeedings(id || null);

  // Harvests hook
  const {
    harvests,
    loading: harvestsLoading,
    error: harvestsError,
    createHarvest,
    updateHarvest,
    deleteHarvest: deleteHarvestMutation,
    creating: creatingHarvest,
    updating: updatingHarvest,
    deleting: deletingHarvest,
    seasonTotalKg,
    seasonHarvestCount,
  } = useHarvestsByHive(id || null);

  // Harvest analytics hook
  const {
    analytics: harvestAnalytics,
    loading: analyticsLoading,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useHarvestAnalytics();

  // Equipment hook
  const {
    equipmentLogs,
    currentlyInstalled,
    equipmentHistory,
    loading: equipmentLoading,
    error: equipmentError,
    createEquipmentLog,
    updateEquipmentLog,
    deleteEquipmentLog,
    creating: creatingEquipment,
    updating: updatingEquipment,
    deleting: deletingEquipment,
  } = useEquipment(id || null);

  // Hive loss hook
  const {
    hiveLoss,
    createHiveLoss,
    creating: creatingHiveLoss,
  } = useHiveLoss(id || null);

  // ============================================
  // Handlers - shared between mobile and desktop
  // ============================================

  const handleDelete = useCallback(() => {
    Modal.confirm({
      title: 'Delete Hive',
      content: `Are you sure you want to delete "${hive?.name}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteHive();
          message.success('Hive deleted successfully');
          navigate(hive?.site_id ? `/sites/${hive.site_id}` : '/hives');
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            message.error(error.response.data?.error || 'Cannot delete hive with inspections');
          } else {
            message.error('Failed to delete hive');
          }
        }
      },
    });
  }, [hive?.name, hive?.site_id, deleteHive, navigate]);

  const handleReplaceQueen = async (values: ReplaceQueenForm) => {
    try {
      await replaceQueen({
        new_introduced_at: values.new_introduced_at.format('YYYY-MM-DD'),
        new_source: values.new_source || null,
        replacement_reason: values.replacement_reason || null,
      });

      message.success('Queen replaced successfully');
      setReplaceModalOpen(false);
      replaceForm.resetFields();
    } catch {
      message.error('Failed to replace queen');
    }
  };

  const handleEdit = () => {
    navigate(`/hives/${id}/edit`);
  };

  const handleBack = () => {
    if (hive?.site_id) {
      navigate(`/sites/${hive.site_id}`);
    } else {
      navigate('/hives');
    }
  };

  const handleNewInspection = () => {
    navigate(`/hives/${id}/inspections/new`);
  };

  const handleTaskClick = () => {
    if (hive) {
      navigate(`/tasks?hive_id=${hive.id}`);
    }
  };

  // Treatment handlers
  const handleCreateTreatment = async (input: CreateTreatmentInput) => {
    await createTreatment(input);
    message.success('Treatment logged successfully');
    setTreatmentModalOpen(false);
  };

  const handleAddFollowup = (treatment: Treatment) => {
    setSelectedTreatment(treatment);
    setFollowupModalOpen(true);
  };

  const handleUpdateTreatment = async (treatmentId: string, input: UpdateTreatmentInput) => {
    await updateTreatment(treatmentId, input);
    message.success('Follow-up mite count saved');
    setFollowupModalOpen(false);
    setSelectedTreatment(null);
  };

  const handleDeleteTreatment = async (treatmentId: string) => {
    await deleteTreatment(treatmentId);
    message.success('Treatment deleted');
  };

  // Feeding handlers
  const handleCreateFeeding = async (input: CreateFeedingInput) => {
    await createFeeding(input);
    message.success('Feeding logged successfully');
    setFeedingModalOpen(false);
    setSelectedFeeding(null);
  };

  const handleEditFeeding = (feeding: Feeding) => {
    setSelectedFeeding(feeding);
    setFeedingModalOpen(true);
  };

  const handleUpdateFeeding = async (feedingId: string, input: UpdateFeedingInput) => {
    await updateFeeding(feedingId, input);
    message.success('Feeding updated successfully');
    setFeedingModalOpen(false);
    setSelectedFeeding(null);
  };

  const handleDeleteFeeding = async (feedingId: string) => {
    await deleteFeeding(feedingId);
    message.success('Feeding deleted');
  };

  const handleFeedingModalClose = () => {
    setFeedingModalOpen(false);
    setSelectedFeeding(null);
  };

  // Harvest handlers
  const handleCreateHarvest = async (input: CreateHarvestInput) => {
    const result = await createHarvest(input);
    message.success('Harvest logged successfully');
    setHarvestModalOpen(false);

    // Refetch analytics after creating harvest
    refetchAnalytics();

    // Handle first-hive celebrations (AC#4 - smaller toast notifications)
    if (result.first_hive_ids && result.first_hive_ids.length > 0) {
      result.first_hive_ids.forEach((hiveId) => {
        const foundHive = siteHives.find((h) => h.id === hiveId);
        if (foundHive) {
          showFirstHiveCelebration(foundHive.name);
        } else {
          // Hive not found in local list - show celebration with generic name
          // This can happen if siteHives hasn't refreshed yet
          console.warn(`First harvest hive ${hiveId} not found in local hive list`);
          showFirstHiveCelebration('your hive');
        }
      });
    }

    // Check if this was the first harvest (account-wide) and hasn't been seen
    if (result.is_first_harvest && !milestoneFlags?.first_harvest_seen) {
      setLastHarvestData({
        amountKg: result.total_kg,
        hiveCount: result.hives?.length || 1,
        date: result.harvested_at,
        harvestId: result.id,
      });
      setFirstHarvestModalOpen(true);
    }
    return result;
  };

  const handleDeleteHarvest = async (harvestId: string) => {
    await deleteHarvestMutation(harvestId);
    message.success('Harvest deleted');
  };

  const handleEditHarvest = (harvest: Harvest) => {
    setSelectedHarvest(harvest);
    setHarvestModalOpen(true);
  };

  const handleUpdateHarvest = async (harvestId: string, input: UpdateHarvestInput) => {
    await updateHarvest(harvestId, input);
    message.success('Harvest updated successfully');
    setHarvestModalOpen(false);
    setSelectedHarvest(null);
  };

  const handleHarvestModalClose = () => {
    setHarvestModalOpen(false);
    setSelectedHarvest(null);
  };

  // Equipment handlers
  const handleCreateEquipment = async (input: CreateEquipmentLogInput) => {
    await createEquipmentLog(input);
    message.success('Equipment logged successfully');
    setEquipmentModalOpen(false);
    setPrefilledEquipmentType(undefined);
    setPrefilledEquipmentAction(undefined);
    setSelectedEquipment(null);
  };

  const handleEditEquipment = (log: EquipmentLog) => {
    setSelectedEquipment(log);
    setPrefilledEquipmentType(undefined);
    setPrefilledEquipmentAction(undefined);
    setEquipmentModalOpen(true);
  };

  const handleUpdateEquipment = async (equipmentId: string, input: UpdateEquipmentLogInput) => {
    await updateEquipmentLog(equipmentId, input);
    message.success('Equipment log updated successfully');
    setEquipmentModalOpen(false);
    setSelectedEquipment(null);
  };

  const handleDeleteEquipment = async (equipmentId: string) => {
    await deleteEquipmentLog(equipmentId);
    message.success('Equipment log deleted');
  };

  const handleRemoveEquipment = (equipmentType: string) => {
    setSelectedEquipment(null);
    setPrefilledEquipmentType(equipmentType);
    setPrefilledEquipmentAction('removed');
    setEquipmentModalOpen(true);
  };

  const handleEquipmentModalClose = () => {
    setEquipmentModalOpen(false);
    setSelectedEquipment(null);
    setPrefilledEquipmentType(undefined);
    setPrefilledEquipmentAction(undefined);
  };

  const handleLogEquipment = () => {
    setSelectedEquipment(null);
    setPrefilledEquipmentType(undefined);
    setPrefilledEquipmentAction(undefined);
    setEquipmentModalOpen(true);
  };

  // Hive loss handler
  const handleHiveLossSubmit = async (input: Parameters<typeof createHiveLoss>[1]) => {
    if (!id) return;
    await createHiveLoss(id, input);
    message.success('Loss recorded');
    // Refetch the hive to update status
    refetchHive();
  };

  // ============================================
  // Loading and empty states
  // ============================================

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!hive) {
    return (
      <Empty description="Hive not found">
        <Button onClick={handleBack}>Back</Button>
      </Empty>
    );
  }

  // ============================================
  // Render mobile or desktop layout
  // ============================================

  return (
    <div>
      {isMobile ? (
        <HiveDetailMobile
          hive={hive}
          onBack={handleBack}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onNewInspection={handleNewInspection}
          onReplaceQueen={() => setReplaceModalOpen(true)}
          onMarkLost={() => setLossWizardOpen(true)}
          onShowQR={() => setQrModalOpen(true)}
        />
      ) : (
        <HiveDetailDesktop
          hive={hive}
          deleting={deleting}
          onBack={handleBack}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onNewInspection={handleNewInspection}
          onTaskClick={handleTaskClick}
          onReplaceQueen={() => setReplaceModalOpen(true)}
          onLogTreatment={() => setTreatmentModalOpen(true)}
          onLogFeeding={() => setFeedingModalOpen(true)}
          onLogHarvest={() => setHarvestModalOpen(true)}
          onLogEquipment={handleLogEquipment}
          onRemoveEquipment={handleRemoveEquipment}
          onMarkLost={() => setLossWizardOpen(true)}
          onShowQR={() => setQrModalOpen(true)}
          treatments={treatments}
          treatmentsLoading={treatmentsLoading}
          treatmentsError={!!treatmentsError}
          onAddFollowup={handleAddFollowup}
          onDeleteTreatment={handleDeleteTreatment}
          deletingTreatment={deletingTreatment}
          feedings={feedings}
          feedingsLoading={feedingsLoading}
          feedingsError={!!feedingsError}
          seasonTotals={seasonTotals}
          onEditFeeding={handleEditFeeding}
          onDeleteFeeding={handleDeleteFeeding}
          deletingFeeding={deletingFeeding}
          harvests={harvests}
          harvestsLoading={harvestsLoading}
          harvestsError={!!harvestsError}
          seasonTotalKg={seasonTotalKg}
          seasonHarvestCount={seasonHarvestCount}
          onEditHarvest={handleEditHarvest}
          onDeleteHarvest={handleDeleteHarvest}
          deletingHarvest={deletingHarvest}
          harvestAnalytics={harvestAnalytics}
          analyticsLoading={analyticsLoading}
          analyticsError={!!analyticsError}
          equipmentLogs={equipmentLogs}
          currentlyInstalled={currentlyInstalled}
          equipmentHistory={equipmentHistory}
          equipmentLoading={equipmentLoading}
          equipmentError={!!equipmentError}
          onEditEquipment={handleEditEquipment}
          onDeleteEquipment={handleDeleteEquipment}
          deletingEquipment={deletingEquipment}
          hiveLoss={hiveLoss}
          advancedMode={advancedMode}
        />
      )}

      {/* ============================================ */}
      {/* Modals - shared between mobile and desktop */}
      {/* ============================================ */}

      {/* Replace Queen Modal */}
      <Modal
        title={
          <Space>
            <SwapOutlined style={{ color: colors.seaBuckthorn }} />
            Replace Queen
          </Space>
        }
        open={replaceModalOpen}
        onCancel={() => {
          setReplaceModalOpen(false);
          replaceForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={replaceForm}
          layout="vertical"
          onFinish={handleReplaceQueen}
        >
          {hive.queen_introduced_at && (
            <div style={{
              padding: 12,
              backgroundColor: 'rgba(247, 164, 45, 0.1)',
              borderRadius: 8,
              marginBottom: 16,
            }}>
              <Text>
                Current queen: <strong>{formatQueenSource(hive.queen_source)}</strong>,{' '}
                introduced {dayjs(hive.queen_introduced_at).format('MMM D, YYYY')}{' '}
                ({calculateQueenAge(hive.queen_introduced_at)} old)
              </Text>
            </div>
          )}

          <Form.Item
            name="replacement_reason"
            label="Reason for Replacement"
          >
            <Input.TextArea
              rows={2}
              placeholder="e.g., Poor laying pattern, aggressive, died..."
              maxLength={200}
            />
          </Form.Item>

          <Form.Item
            name="new_introduced_at"
            label="New Queen Introduction Date"
            rules={[{ required: true, message: 'Please select date' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              format="YYYY-MM-DD"
              disabledDate={(current) => current && current > dayjs().endOf('day')}
            />
          </Form.Item>

          <Form.Item
            name="new_source"
            label="New Queen Source"
          >
            <Select
              placeholder="Select source"
              allowClear
              options={QUEEN_SOURCES}
            />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setReplaceModalOpen(false);
                replaceForm.resetFields();
              }}>
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={replacingQueen}
              >
                Replace Queen
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Treatment Form Modal - Epic 6 */}
      <TreatmentFormModal
        open={treatmentModalOpen}
        onClose={() => setTreatmentModalOpen(false)}
        onSubmit={handleCreateTreatment}
        loading={creatingTreatment}
        currentHiveId={id || ''}
        currentHiveName={hive.name}
        availableHives={siteHives}
      />

      {/* Treatment Follow-up Modal - Epic 6 */}
      <TreatmentFollowupModal
        open={followupModalOpen}
        onClose={() => {
          setFollowupModalOpen(false);
          setSelectedTreatment(null);
        }}
        onSubmit={handleUpdateTreatment}
        loading={updatingTreatment}
        treatment={selectedTreatment}
      />

      {/* Feeding Form Modal - Epic 6, Story 6.2 */}
      <FeedingFormModal
        open={feedingModalOpen}
        onClose={handleFeedingModalClose}
        onSubmit={handleCreateFeeding}
        onUpdate={handleUpdateFeeding}
        loading={creatingFeeding || updatingFeeding}
        currentHiveId={id || ''}
        currentHiveName={hive.name}
        availableHives={siteHives}
        editFeeding={selectedFeeding}
      />

      {/* Harvest Form Modal - Epic 6, Story 6.3 */}
      <HarvestFormModal
        open={harvestModalOpen}
        onClose={handleHarvestModalClose}
        onSubmit={handleCreateHarvest}
        onUpdate={handleUpdateHarvest}
        loading={creatingHarvest || updatingHarvest}
        siteId={hive.site_id}
        availableHives={siteHives}
        editHarvest={selectedHarvest}
      />

      {/* First Harvest Celebration Modal - Epic 6, Story 6.3 & Epic 9, Story 9.2 */}
      {lastHarvestData && (
        <FirstHarvestModal
          open={firstHarvestModalOpen}
          onClose={() => {
            // Mark milestone as seen so modal won't appear again (AC#3)
            markMilestoneSeen('first_harvest_seen');
            setFirstHarvestModalOpen(false);
            setLastHarvestData(null);
          }}
          amountKg={lastHarvestData.amountKg}
          hiveCount={lastHarvestData.hiveCount}
          harvestDate={lastHarvestData.date}
          harvestId={lastHarvestData.harvestId}
        />
      )}

      {/* Equipment Form Modal - Epic 6, Story 6.4 */}
      <EquipmentFormModal
        open={equipmentModalOpen}
        onClose={handleEquipmentModalClose}
        onSubmit={handleCreateEquipment}
        onUpdate={handleUpdateEquipment}
        loading={creatingEquipment || updatingEquipment}
        hiveName={hive.name}
        editEquipment={selectedEquipment}
        prefilledType={prefilledEquipmentType}
        prefilledAction={prefilledEquipmentAction}
      />

      {/* Hive Loss Wizard - Epic 9, Story 9.3 */}
      <HiveLossWizard
        open={lossWizardOpen}
        onClose={() => setLossWizardOpen(false)}
        onSubmit={handleHiveLossSubmit}
        loading={creatingHiveLoss}
        hiveName={hive.name}
      />

      {/* QR Generator Modal - Epic 7, Story 7.6 (lazy loaded) */}
      <Suspense fallback={null}>
        <LazyQRGeneratorModal
          hive={{ id: hive.id, name: hive.name }}
          siteId={hive.site_id}
          siteName={site?.name || ''}
          open={qrModalOpen}
          onClose={() => setQrModalOpen(false)}
        />
      </Suspense>
    </div>
  );
}

export default HiveDetail;
