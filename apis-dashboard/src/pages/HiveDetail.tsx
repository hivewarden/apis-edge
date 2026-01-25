import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Typography,
  Button,
  Card,
  Descriptions,
  Space,
  Spin,
  message,
  Modal,
  Empty,
  Timeline,
  Tag,
  Form,
  DatePicker,
  Select,
  Input,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  CrownOutlined,
  SwapOutlined,
  PlusOutlined,
  MinusOutlined,
  FileSearchOutlined,
  HeartOutlined,
  QrcodeOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { apiClient } from '../providers/apiClient';
import { colors } from '../theme/apisTheme';
import { InspectionHistory, TreatmentHistoryCard, TreatmentFormModal, TreatmentFollowupModal, FrameDevelopmentChart, FeedingHistoryCard, FeedingFormModal, HarvestHistoryCard, HarvestFormModal, FirstHarvestModal, EquipmentFormModal, EquipmentStatusCard, HarvestAnalyticsCard, HiveBeeBrainCard, showFirstHiveCelebration, HiveLossWizard, HiveLossSummary, LostHiveBadge, QRGeneratorModal } from '../components';
import type { CreateTreatmentInput, UpdateTreatmentInput, Treatment } from '../hooks/useTreatments';
import type { CreateFeedingInput, UpdateFeedingInput, Feeding } from '../hooks/useFeedings';
import type { CreateHarvestInput, UpdateHarvestInput, Harvest } from '../hooks/useHarvests';
import { useTreatments, useFeedings, useHarvestsByHive, useEquipment, useHarvestAnalytics, useMilestoneFlags, useHiveLoss } from '../hooks';
import type { CreateEquipmentLogInput, UpdateEquipmentLogInput, EquipmentLog } from '../hooks/useEquipment';
import { useSettings } from '../context';

const { Title, Text } = Typography;

interface QueenHistory {
  id: string;
  introduced_at: string;
  source: string | null;
  replaced_at: string | null;
  replacement_reason: string | null;
}

interface BoxChange {
  id: string;
  change_type: 'added' | 'removed';
  box_type: 'brood' | 'super';
  changed_at: string;
  notes: string | null;
}

interface Hive {
  id: string;
  site_id: string;
  name: string;
  queen_introduced_at: string | null;
  queen_source: string | null;
  brood_boxes: number;
  honey_supers: number;
  notes: string | null;
  queen_history: QueenHistory[];
  box_changes: BoxChange[];
  hive_status?: 'active' | 'lost' | 'archived';
  lost_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface HiveResponse {
  data: Hive;
}

interface SiteHive {
  id: string;
  name: string;
}

interface SiteHivesResponse {
  data: SiteHive[];
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

const formatQueenSource = (source: string | null): string => {
  if (!source) return 'Unknown';
  return source.charAt(0).toUpperCase() + source.slice(1);
};

const calculateQueenAge = (introducedAt: string): string => {
  const days = dayjs().diff(dayjs(introducedAt), 'day');
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.floor(days / 30)} months`;
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  if (remainingMonths === 0) return `${years} year${years > 1 ? 's' : ''}`;
  return `${years}y ${remainingMonths}m`;
};

/**
 * Hive Detail Page
 *
 * Displays detailed information about a hive including:
 * - Queen information with age calculation
 * - Box configuration with visual representation
 * - Queen history timeline
 * - Box change history
 *
 * Part of Epic 5, Story 5.1: Create and Configure Hives
 */
export function HiveDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { advancedMode } = useSettings();
  const [hive, setHive] = useState<Hive | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [replacingQueen, setReplacingQueen] = useState(false);
  const [replaceForm] = Form.useForm<ReplaceQueenForm>();

  // Treatment state
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [followupModalOpen, setFollowupModalOpen] = useState(false);
  const [selectedTreatment, setSelectedTreatment] = useState<Treatment | null>(null);
  const [siteHives, setSiteHives] = useState<SiteHive[]>([]);

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
  const [siteName, setSiteName] = useState<string>('');

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
    deleteHarvest,
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

  const fetchHive = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<HiveResponse>(`/hives/${id}`);
      setHive(response.data.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        message.error('Hive not found');
      } else {
        message.error('Failed to load hive');
      }
      navigate('/hives');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (id) {
      fetchHive();
    }
  }, [id, fetchHive]);

  // Fetch all hives for the site (for multi-hive treatment selection)
  useEffect(() => {
    if (hive?.site_id) {
      apiClient.get<SiteHivesResponse>(`/sites/${hive.site_id}/hives`)
        .then((response) => {
          setSiteHives(response.data.data || []);
        })
        .catch(() => {
          // Non-critical - multi-hive selection just won't be available
          setSiteHives([]);
        });

      // Fetch site name for QR code - Epic 7, Story 7.6
      apiClient.get<{ data: { name: string } }>(`/sites/${hive.site_id}`)
        .then((response) => {
          setSiteName(response.data.data?.name || '');
        })
        .catch(() => {
          setSiteName('');
        });
    }
  }, [hive?.site_id]);

  const handleDelete = () => {
    Modal.confirm({
      title: 'Delete Hive',
      content: `Are you sure you want to delete "${hive?.name}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setDeleting(true);
          await apiClient.delete(`/hives/${id}`);
          message.success('Hive deleted successfully');
          navigate(`/sites/${hive?.site_id}`);
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            message.error(error.response.data?.error || 'Cannot delete hive with inspections');
          } else {
            message.error('Failed to delete hive');
          }
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const handleReplaceQueen = async (values: ReplaceQueenForm) => {
    try {
      setReplacingQueen(true);
      await apiClient.post(`/hives/${id}/replace-queen`, {
        new_introduced_at: values.new_introduced_at.format('YYYY-MM-DD'),
        new_source: values.new_source || null,
        replacement_reason: values.replacement_reason || null,
      });

      message.success('Queen replaced successfully');
      setReplaceModalOpen(false);
      replaceForm.resetFields();
      fetchHive();
    } catch {
      message.error('Failed to replace queen');
    } finally {
      setReplacingQueen(false);
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
        const hive = siteHives.find((h) => h.id === hiveId);
        if (hive) {
          showFirstHiveCelebration(hive.name);
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
    await deleteHarvest(harvestId);
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

  // Hive loss handler
  const handleHiveLossSubmit = async (input: Parameters<typeof createHiveLoss>[1]) => {
    if (!id) return;
    await createHiveLoss(id, input);
    message.success('Loss recorded');
    // Refetch the hive to update status
    fetchHive();
  };

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
            Back to Site
          </Button>
          <Title level={2} style={{ margin: 0 }}>{hive.name}</Title>
          {hive.hive_status === 'lost' && hive.lost_at && (
            <LostHiveBadge lostAt={hive.lost_at} />
          )}
        </Space>
        <Space wrap>
          {/* Only show action buttons for active hives */}
          {hive.hive_status !== 'lost' && (
            <>
              <Button
                type="primary"
                icon={<FileSearchOutlined />}
                onClick={() => navigate(`/hives/${id}/inspections/new`)}
              >
                New Inspection
              </Button>
              <Button icon={<EditOutlined />} onClick={handleEdit}>
                Edit Configuration
              </Button>
              <Button
                icon={<QrcodeOutlined />}
                onClick={() => setQrModalOpen(true)}
                style={{ minHeight: 64 }}
              >
                QR Code
              </Button>
              <Button
                icon={<HeartOutlined />}
                onClick={() => setLossWizardOpen(true)}
                style={{ borderColor: colors.textMuted, color: colors.textMuted }}
              >
                Mark as Lost
              </Button>
            </>
          )}
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={handleDelete}
            loading={deleting}
          >
            Delete
          </Button>
        </Space>
      </div>

      {/* Hive Info Card */}
      <Card title="Hive Information">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* Info section */}
          <div style={{ flex: '1 1 400px' }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Name">{hive.name}</Descriptions.Item>
              <Descriptions.Item label="Created">
                {dayjs(hive.created_at).format('MMMM D, YYYY')}
              </Descriptions.Item>
              <Descriptions.Item label="Last Updated">
                {dayjs(hive.updated_at).format('MMMM D, YYYY [at] h:mm A')}
              </Descriptions.Item>
              {hive.notes && (
                <Descriptions.Item label="Notes">{hive.notes}</Descriptions.Item>
              )}
            </Descriptions>
          </div>

          {/* Visual hive diagram */}
          <div style={{
            flex: '0 0 200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 16,
            backgroundColor: 'rgba(247, 164, 45, 0.08)',
            borderRadius: 8,
          }}>
            <Text type="secondary" style={{ marginBottom: 12, fontSize: 12 }}>
              Box Configuration
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'center' }}>
              {/* Brood boxes */}
              {Array.from({ length: hive.brood_boxes }).map((_, i) => (
                <div
                  key={`brood-${i}`}
                  style={{
                    width: 120,
                    height: 28,
                    backgroundColor: colors.brownBramble,
                    borderRadius: 4,
                    marginTop: i > 0 ? 2 : 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: colors.coconutCream, fontSize: 11 }}>
                    Brood {i + 1}
                  </Text>
                </div>
              ))}
              {/* Honey supers */}
              {Array.from({ length: hive.honey_supers }).map((_, i) => (
                <div
                  key={`super-${i}`}
                  style={{
                    width: 120,
                    height: 22,
                    backgroundColor: colors.seaBuckthorn,
                    borderRadius: 4,
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 11 }}>
                    Super {i + 1}
                  </Text>
                </div>
              ))}
              {/* Roof */}
              <div
                style={{
                  width: 130,
                  height: 14,
                  backgroundColor: colors.brownBramble,
                  borderRadius: '4px 4px 0 0',
                  marginTop: 2,
                }}
              />
            </div>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <Text style={{ fontSize: 12 }}>
                {hive.brood_boxes} brood, {hive.honey_supers} super{hive.honey_supers !== 1 ? 's' : ''}
              </Text>
            </div>
          </div>
        </div>
      </Card>

      {/* Queen Information Card */}
      <Card
        title={
          <Space>
            <CrownOutlined style={{ color: colors.seaBuckthorn }} />
            Queen Information
          </Space>
        }
        style={{ marginTop: 16 }}
        extra={
          <Button
            icon={<SwapOutlined />}
            onClick={() => setReplaceModalOpen(true)}
          >
            Replace Queen
          </Button>
        }
      >
        {hive.queen_introduced_at ? (
          <Descriptions column={{ xs: 1, sm: 2 }} bordered>
            <Descriptions.Item label="Introduced">
              {dayjs(hive.queen_introduced_at).format('MMMM D, YYYY')}
            </Descriptions.Item>
            <Descriptions.Item label="Age">
              <Tag color="gold">{calculateQueenAge(hive.queen_introduced_at)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Source">
              {formatQueenSource(hive.queen_source)}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty description="No queen information recorded">
            <Button onClick={() => setReplaceModalOpen(true)}>
              Add Queen Information
            </Button>
          </Empty>
        )}
      </Card>

      {/* BeeBrain Analysis - Epic 8, Story 8.3 */}
      <div style={{ marginTop: 16 }}>
        <HiveBeeBrainCard hiveId={id || ''} />
      </div>

      {/* Queen History */}
      {hive.queen_history && hive.queen_history.length > 0 && (
        <Card title="Queen History" style={{ marginTop: 16 }}>
          <Timeline
            items={hive.queen_history.map((qh) => ({
              color: qh.replaced_at ? 'gray' : 'gold',
              dot: <CrownOutlined style={{ fontSize: 16 }} />,
              children: (
                <div>
                  <Text strong>
                    {formatQueenSource(qh.source)} Queen
                  </Text>
                  {!qh.replaced_at && (
                    <Tag color="success" style={{ marginLeft: 8 }}>Current</Tag>
                  )}
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Introduced: {dayjs(qh.introduced_at).format('MMM D, YYYY')}
                  </Text>
                  {qh.replaced_at && (
                    <>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Replaced: {dayjs(qh.replaced_at).format('MMM D, YYYY')}
                        {qh.replacement_reason && ` - ${qh.replacement_reason}`}
                      </Text>
                    </>
                  )}
                </div>
              ),
            }))}
          />
        </Card>
      )}

      {/* Inspection History Card */}
      <Card
        title={
          <Space>
            <FileSearchOutlined style={{ color: colors.seaBuckthorn }} />
            Inspection History
          </Space>
        }
        style={{ marginTop: 16 }}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate(`/hives/${id}/inspections/new`)}
          >
            New Inspection
          </Button>
        }
      >
        <InspectionHistory hiveId={id || ''} hiveName={hive.name} />
      </Card>

      {/* Frame Development Chart - Epic 5, Story 5.6 (Advanced Mode only) */}
      {advancedMode && (
        <div style={{ marginTop: 16 }}>
          <FrameDevelopmentChart hiveId={id || ''} />
        </div>
      )}

      {/* Treatment History Card - Epic 6 */}
      <div style={{ marginTop: 16 }}>
        <TreatmentHistoryCard
          treatments={treatments}
          loading={treatmentsLoading}
          error={!!treatmentsError}
          onLogTreatment={() => setTreatmentModalOpen(true)}
          onAddFollowup={handleAddFollowup}
          onDelete={handleDeleteTreatment}
          deleting={deletingTreatment}
        />
      </div>

      {/* Feeding History Card - Epic 6, Story 6.2 */}
      <div style={{ marginTop: 16 }}>
        <FeedingHistoryCard
          feedings={feedings}
          seasonTotals={seasonTotals}
          loading={feedingsLoading}
          error={!!feedingsError}
          onLogFeeding={() => setFeedingModalOpen(true)}
          onEdit={handleEditFeeding}
          onDelete={handleDeleteFeeding}
          deleting={deletingFeeding}
        />
      </div>

      {/* Harvest History Card - Epic 6, Story 6.3 */}
      <div style={{ marginTop: 16 }}>
        <HarvestHistoryCard
          harvests={harvests}
          loading={harvestsLoading}
          error={!!harvestsError}
          onLogHarvest={() => setHarvestModalOpen(true)}
          onEdit={handleEditHarvest}
          onDelete={handleDeleteHarvest}
          deleting={deletingHarvest}
          seasonTotalKg={seasonTotalKg}
          seasonHarvestCount={seasonHarvestCount}
        />
      </div>

      {/* Harvest Analytics - Epic 6, Story 6.3, AC #4 */}
      {harvests.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <HarvestAnalyticsCard
            analytics={harvestAnalytics}
            loading={analyticsLoading}
            error={!!analyticsError}
          />
        </div>
      )}

      {/* Equipment Status Card - Epic 6, Story 6.4 */}
      <div style={{ marginTop: 16 }}>
        <EquipmentStatusCard
          currentlyInstalled={currentlyInstalled}
          equipmentHistory={equipmentHistory}
          equipmentLogs={equipmentLogs}
          loading={equipmentLoading}
          error={!!equipmentError}
          onLogEquipment={() => {
            setSelectedEquipment(null);
            setPrefilledEquipmentType(undefined);
            setPrefilledEquipmentAction(undefined);
            setEquipmentModalOpen(true);
          }}
          onRemoveEquipment={handleRemoveEquipment}
          onEdit={handleEditEquipment}
          onDelete={handleDeleteEquipment}
          deleting={deletingEquipment}
        />
      </div>

      {/* Hive Loss Summary - Epic 9, Story 9.3 */}
      {hiveLoss && (
        <div style={{ marginTop: 16 }}>
          <HiveLossSummary loss={hiveLoss} />
        </div>
      )}

      {/* Box Change History */}
      {hive.box_changes && hive.box_changes.length > 0 && (
        <Card title="Box Change History" style={{ marginTop: 16 }}>
          <Timeline
            items={hive.box_changes.map((bc) => ({
              color: bc.change_type === 'added' ? 'green' : 'red',
              dot: bc.change_type === 'added' ? <PlusOutlined /> : <MinusOutlined />,
              children: (
                <div>
                  <Text>
                    {bc.box_type === 'brood' ? 'Brood box' : 'Honey super'}{' '}
                    <Tag color={bc.change_type === 'added' ? 'success' : 'error'}>
                      {bc.change_type}
                    </Tag>
                  </Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(bc.changed_at).format('MMM D, YYYY')}
                  </Text>
                  {bc.notes && (
                    <>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>{bc.notes}</Text>
                    </>
                  )}
                </div>
              ),
            }))}
          />
        </Card>
      )}

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

      {/* QR Generator Modal - Epic 7, Story 7.6 */}
      <QRGeneratorModal
        hive={{ id: hive.id, name: hive.name }}
        siteId={hive.site_id}
        siteName={siteName}
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
      />
    </div>
  );
}

export default HiveDetail;
