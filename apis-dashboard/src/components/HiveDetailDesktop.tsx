/**
 * HiveDetailDesktop Component
 *
 * Desktop layout for the hive detail page. Preserves the existing
 * card-based layout with all sections visible without collapsing.
 *
 * Used when viewport width is 768px or greater.
 *
 * Part of Epic 14, Story 14.7: Mobile Refactor Hive Detail to Single Scroll Layout
 */
import { CSSProperties } from 'react';
import {
  Typography,
  Button,
  Card,
  Descriptions,
  Space,
  Tag,
  Timeline,
  Empty,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  CrownOutlined,
  SwapOutlined,
  PlusOutlined,
  MinusOutlined,
  FileSearchOutlined,
  HeartOutlined,
  QrcodeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import { InspectionHistory } from './InspectionHistory';
import { HiveTaskSummary } from './HiveTaskSummary';
import { HiveDetailTasksSection } from './HiveDetailTasksSection';
import { HiveBeeBrainCard } from './HiveBeeBrainCard';
import { LostHiveBadge } from './LostHiveBadge';
import { ActivityFeedCard } from './ActivityFeedCard';
import { FrameDevelopmentChartLazy as FrameDevelopmentChart } from './lazy';
import { formatQueenSource, calculateQueenAge } from '../utils';

// Treatment components
import { TreatmentHistoryCard } from './TreatmentHistoryCard';
import { FeedingHistoryCard } from './FeedingHistoryCard';
import { HarvestHistoryCard } from './HarvestHistoryCard';
import { HarvestAnalyticsCard } from './HarvestAnalyticsCard';
import { EquipmentStatusCard } from './EquipmentStatusCard';
import { HiveLossSummary } from './HiveLossSummary';

import type { Treatment } from '../hooks/useTreatments';
import type { Feeding, SeasonTotal } from '../hooks/useFeedings';
import type { Harvest, HarvestAnalytics } from '../hooks/useHarvests';
import type { EquipmentLog, CurrentlyInstalledEquipment, EquipmentHistoryItem } from '../hooks/useEquipment';
import type { HiveLoss } from '../hooks/useHiveLoss';

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

interface TaskSummary {
  open: number;
  overdue: number;
}


export interface HiveDetailDesktopHive {
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
  task_summary?: TaskSummary;
  created_at: string;
  updated_at: string;
}

export interface HiveDetailDesktopProps {
  /** The hive data to display */
  hive: HiveDetailDesktopHive;

  // Loading states
  deleting: boolean;

  // Navigation handlers
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onNewInspection: () => void;
  onTaskClick: () => void;

  // Queen management
  onReplaceQueen: () => void;

  // Modal triggers
  onLogTreatment: () => void;
  onLogFeeding: () => void;
  onLogHarvest: () => void;
  onLogEquipment: () => void;
  onRemoveEquipment: (equipmentType: string) => void;
  onMarkLost: () => void;
  onShowQR: () => void;

  // Treatment data
  treatments: Treatment[];
  treatmentsLoading: boolean;
  treatmentsError: boolean;
  onAddFollowup: (treatment: Treatment) => void;
  onDeleteTreatment: (id: string) => Promise<void>;
  deletingTreatment: boolean;

  // Feeding data
  feedings: Feeding[];
  feedingsLoading: boolean;
  feedingsError: boolean;
  seasonTotals: SeasonTotal[];
  onEditFeeding: (feeding: Feeding) => void;
  onDeleteFeeding: (id: string) => Promise<void>;
  deletingFeeding: boolean;

  // Harvest data
  harvests: Harvest[];
  harvestsLoading: boolean;
  harvestsError: boolean;
  seasonTotalKg: number;
  seasonHarvestCount: number;
  onEditHarvest: (harvest: Harvest) => void;
  onDeleteHarvest: (id: string) => Promise<void>;
  deletingHarvest: boolean;

  // Harvest analytics
  harvestAnalytics: HarvestAnalytics | null;
  analyticsLoading: boolean;
  analyticsError: boolean;

  // Equipment data
  equipmentLogs: EquipmentLog[];
  currentlyInstalled: CurrentlyInstalledEquipment[];
  equipmentHistory: EquipmentHistoryItem[];
  equipmentLoading: boolean;
  equipmentError: boolean;
  onEditEquipment: (log: EquipmentLog) => void;
  onDeleteEquipment: (id: string) => Promise<void>;
  deletingEquipment: boolean;

  // Hive loss data
  hiveLoss: HiveLoss | null;

  /** Whether advanced mode is enabled */
  advancedMode?: boolean;

  /** Optional style overrides */
  style?: CSSProperties;
}


/**
 * Desktop layout for hive detail page - preserves existing card-based layout.
 */
export function HiveDetailDesktop({
  hive,
  deleting,
  onBack,
  onEdit,
  onDelete,
  onNewInspection,
  onTaskClick,
  onReplaceQueen,
  onLogTreatment,
  onLogFeeding,
  onLogHarvest,
  onLogEquipment,
  onRemoveEquipment,
  onMarkLost,
  onShowQR,
  treatments,
  treatmentsLoading,
  treatmentsError,
  onAddFollowup,
  onDeleteTreatment,
  deletingTreatment,
  feedings,
  feedingsLoading,
  feedingsError,
  seasonTotals,
  onEditFeeding,
  onDeleteFeeding,
  deletingFeeding,
  harvests,
  harvestsLoading,
  harvestsError,
  seasonTotalKg,
  seasonHarvestCount,
  onEditHarvest,
  onDeleteHarvest,
  deletingHarvest,
  harvestAnalytics,
  analyticsLoading,
  analyticsError,
  equipmentLogs,
  currentlyInstalled,
  equipmentHistory,
  equipmentLoading,
  equipmentError,
  onEditEquipment,
  onDeleteEquipment,
  deletingEquipment,
  hiveLoss,
  advancedMode = false,
  style,
}: HiveDetailDesktopProps) {
  return (
    <div style={style}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
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
                onClick={onNewInspection}
              >
                New Inspection
              </Button>
              <Button icon={<EditOutlined />} onClick={onEdit}>
                Edit Configuration
              </Button>
              <Button
                icon={<QrcodeOutlined />}
                onClick={onShowQR}
              >
                QR Code
              </Button>
              <Button
                icon={<HeartOutlined />}
                onClick={onMarkLost}
                style={{ borderColor: colors.textMuted, color: colors.textMuted }}
              >
                Mark as Lost
              </Button>
            </>
          )}
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={onDelete}
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
              <Descriptions.Item label="Tasks">
                <HiveTaskSummary
                  open={hive.task_summary?.open || 0}
                  overdue={hive.task_summary?.overdue || 0}
                  onClick={onTaskClick}
                />
              </Descriptions.Item>
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
            onClick={onReplaceQueen}
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
            <Button onClick={onReplaceQueen}>
              Add Queen Information
            </Button>
          </Empty>
        )}
      </Card>

      {/* Pending Tasks - inline task list */}
      <div style={{ marginTop: 16 }}>
        <HiveDetailTasksSection hiveId={hive.id} />
      </div>

      {/* BeeBrain Analysis - Epic 8, Story 8.3 */}
      <div style={{ marginTop: 16 }}>
        <HiveBeeBrainCard hiveId={hive.id} />
      </div>

      {/* Queen History */}
      {(hive.queen_history ?? []).length > 0 && (
        <Card title="Queen History" style={{ marginTop: 16 }}>
          <Timeline
            items={(hive.queen_history ?? []).map((qh) => ({
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
            onClick={onNewInspection}
          >
            New Inspection
          </Button>
        }
      >
        <InspectionHistory hiveId={hive.id} hiveName={hive.name} />
      </Card>

      {/* Frame Development Chart - Epic 5, Story 5.6 (Advanced Mode only) */}
      {advancedMode && (
        <div style={{ marginTop: 16 }}>
          <FrameDevelopmentChart hiveId={hive.id} />
        </div>
      )}

      {/* Treatment History Card - Epic 6 */}
      <div style={{ marginTop: 16 }}>
        <TreatmentHistoryCard
          treatments={treatments}
          loading={treatmentsLoading}
          error={treatmentsError}
          onLogTreatment={onLogTreatment}
          onAddFollowup={onAddFollowup}
          onDelete={onDeleteTreatment}
          deleting={deletingTreatment}
        />
      </div>

      {/* Feeding History Card - Epic 6, Story 6.2 */}
      <div style={{ marginTop: 16 }}>
        <FeedingHistoryCard
          feedings={feedings}
          seasonTotals={seasonTotals}
          loading={feedingsLoading}
          error={feedingsError}
          onLogFeeding={onLogFeeding}
          onEdit={onEditFeeding}
          onDelete={onDeleteFeeding}
          deleting={deletingFeeding}
        />
      </div>

      {/* Harvest History Card - Epic 6, Story 6.3 */}
      <div style={{ marginTop: 16 }}>
        <HarvestHistoryCard
          harvests={harvests}
          loading={harvestsLoading}
          error={harvestsError}
          onLogHarvest={onLogHarvest}
          onEdit={onEditHarvest}
          onDelete={onDeleteHarvest}
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
            error={analyticsError}
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
          error={equipmentError}
          onLogEquipment={onLogEquipment}
          onRemoveEquipment={onRemoveEquipment}
          onEdit={onEditEquipment}
          onDelete={onDeleteEquipment}
          deleting={deletingEquipment}
        />
      </div>

      {/* Hive Loss Summary - Epic 9, Story 9.3 */}
      {hiveLoss && (
        <div style={{ marginTop: 16 }}>
          <HiveLossSummary loss={hiveLoss} />
        </div>
      )}

      {/* Activity Feed - Epic 13, Story 13.17 */}
      <div style={{ marginTop: 16 }}>
        <ActivityFeedCard
          hiveId={hive.id}
          title="Recent Activity on this Hive"
          limit={5}
        />
      </div>

      {/* Box Change History */}
      {(hive.box_changes ?? []).length > 0 && (
        <Card title="Box Change History" style={{ marginTop: 16 }}>
          <Timeline
            items={(hive.box_changes ?? []).map((bc) => ({
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
    </div>
  );
}

export default HiveDetailDesktop;
