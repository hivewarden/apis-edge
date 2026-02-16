/**
 * HiveDetailMobile Component
 *
 * Mobile-optimized single scroll layout for the hive detail page.
 * Displays all hive information in a vertical scrollable format with
 * three distinct sections: Status, Tasks, and Inspect.
 *
 * Used when viewport width is less than 768px.
 *
 * Part of Epic 14, Story 14.7: Mobile Refactor Hive Detail to Single Scroll Layout
 * Updated in Story 14.8: Added bottom anchor navigation bar
 */
import { CSSProperties } from 'react';
import {
  Typography,
  Button,
  Card,
  Space,
  Tag,
  Collapse,
  Empty,
  Timeline,
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
import { SectionHeader } from './SectionHeader';
import { InspectionHistory } from './InspectionHistory';
import { HiveBeeBrainCard } from './HiveBeeBrainCard';
import { LostHiveBadge } from './LostHiveBadge';
import { ActivityFeedCard } from './ActivityFeedCard';
import { BottomAnchorNav } from './BottomAnchorNav';
import { MobileTasksSection } from './MobileTasksSection';
import { useActiveSection, SectionId } from '../hooks/useActiveSection';
import { formatQueenSource, calculateQueenAge, getLastInspectionText } from '../utils';

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

export interface HiveDetailMobileHive {
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
  last_inspection_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HiveDetailMobileProps {
  /** The hive data to display */
  hive: HiveDetailMobileHive;

  // Navigation handlers
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onNewInspection: () => void;

  // Queen management
  onReplaceQueen: () => void;

  // Modal triggers
  onMarkLost: () => void;
  onShowQR: () => void;

  /** Optional style overrides */
  style?: CSSProperties;
}

/** Minimum touch target size per accessibility guidelines (44px) */
const TOUCH_TARGET_MIN = 44;

/** Section IDs for bottom navigation */
const SECTION_IDS: SectionId[] = ['status-section', 'tasks-section', 'inspect-section'];

/**
 * Mobile-optimized hive detail layout with single scroll and three sections.
 *
 * @example
 * <HiveDetailMobile
 *   hive={hiveData}
 *   onBack={() => navigate('/sites/' + hive.site_id)}
 *   onEdit={() => navigate('/hives/' + hive.id + '/edit')}
 *   // ... other handlers
 * />
 */
export function HiveDetailMobile({
  hive,
  onBack,
  onEdit,
  onDelete,
  onNewInspection,
  onReplaceQueen,
  onMarkLost,
  onShowQR,
  style,
}: HiveDetailMobileProps) {
  const taskCount = hive.task_summary?.open || 0;
  const overdueCount = hive.task_summary?.overdue || 0;

  // Use the active section hook for bottom navigation
  const { activeSection, scrollToSection } = useActiveSection({
    sectionIds: SECTION_IDS,
  });

  return (
    <div
      className="hive-detail-mobile"
      style={{
        scrollBehavior: 'smooth',
        paddingBottom: 80, // Space for 64px bottom navigation bar (Story 14.8)
        ...style,
      }}
    >
      {/* ============================================ */}
      {/* STATUS SECTION - Top, Default View */}
      {/* ============================================ */}
      <section id="status-section" role="region" aria-labelledby="status-section-title">
        {/* Header with back button and hive name */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8,
        }}>
          <Space wrap>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              style={{ minHeight: TOUCH_TARGET_MIN }}
            >
              Back
            </Button>
            <Title level={3} style={{ margin: 0 }} id="status-section-title">{hive.name}</Title>
            {hive.hive_status === 'lost' && hive.lost_at && (
              <LostHiveBadge lostAt={hive.lost_at} />
            )}
          </Space>
        </div>

        {/* Quick action buttons */}
        {hive.hive_status !== 'lost' && (
          <Space wrap style={{ marginBottom: 16 }}>
            <Button
              icon={<EditOutlined />}
              onClick={onEdit}
              style={{ minHeight: TOUCH_TARGET_MIN }}
            >
              Edit
            </Button>
            <Button
              icon={<QrcodeOutlined />}
              onClick={onShowQR}
              style={{ minHeight: TOUCH_TARGET_MIN }}
            >
              QR
            </Button>
            <Button
              icon={<HeartOutlined />}
              onClick={onMarkLost}
              style={{ borderColor: colors.textMuted, color: colors.textMuted, minHeight: TOUCH_TARGET_MIN }}
            >
              Lost
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={onDelete}
              style={{ minHeight: TOUCH_TARGET_MIN }}
            >
              Delete
            </Button>
          </Space>
        )}

        {/* Queen Information */}
        <Card
          size="small"
          title={
            <Space>
              <CrownOutlined style={{ color: colors.seaBuckthorn }} />
              Queen
            </Space>
          }
          extra={
            <Button
              size="small"
              icon={<SwapOutlined />}
              onClick={onReplaceQueen}
            >
              Replace
            </Button>
          }
          style={{ marginBottom: 16 }}
        >
          {hive.queen_introduced_at ? (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div>
                <Text type="secondary">Age: </Text>
                <Tag color="gold">{calculateQueenAge(hive.queen_introduced_at)}</Tag>
              </div>
              <div>
                <Text type="secondary">Source: </Text>
                <Text>{formatQueenSource(hive.queen_source)}</Text>
              </div>
              <div>
                <Text type="secondary">Introduced: </Text>
                <Text>{dayjs(hive.queen_introduced_at).format('MMM D, YYYY')}</Text>
              </div>
            </Space>
          ) : (
            <Empty
              description="No queen info"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Card>

        {/* Box Configuration */}
        <Card size="small" title="Box Configuration" style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column-reverse',
            alignItems: 'center',
            padding: 8,
          }}>
            {/* Brood boxes */}
            {Array.from({ length: hive.brood_boxes }).map((_, i) => (
              <div
                key={`brood-${i}`}
                style={{
                  width: '80%',
                  maxWidth: 200,
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
                  width: '80%',
                  maxWidth: 200,
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
                width: '85%',
                maxWidth: 210,
                height: 14,
                backgroundColor: colors.brownBramble,
                borderRadius: '4px 4px 0 0',
                marginTop: 2,
              }}
            />
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Text style={{ fontSize: 12 }}>
              {hive.brood_boxes} brood, {hive.honey_supers} super{hive.honey_supers !== 1 ? 's' : ''}
            </Text>
          </div>
        </Card>

        {/* Last Inspection Date */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text type="secondary">Last Inspection:</Text>
            <Text>{getLastInspectionText({ last_inspection_at: hive.last_inspection_at ?? null })}</Text>
          </div>
        </Card>

        {/* Task Summary - Clickable to scroll to Tasks section */}
        <Card
          size="small"
          style={{ marginBottom: 16, cursor: 'pointer' }}
          onClick={() => scrollToSection('tasks-section')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text>Tasks:</Text>
            <Text strong>{taskCount}</Text>
            <Text>open</Text>
            <Text type="secondary">-</Text>
            <Text strong style={overdueCount > 0 ? { color: colors.error } : undefined}>{overdueCount}</Text>
            <Text style={overdueCount > 0 ? { color: colors.error } : undefined}> overdue</Text>
          </div>
        </Card>

        {/* BeeBrain Analysis */}
        <div style={{ marginBottom: 16 }}>
          <HiveBeeBrainCard hiveId={hive.id} />
        </div>

        {/* Recent Activity */}
        <div style={{ marginBottom: 16 }}>
          <ActivityFeedCard
            hiveId={hive.id}
            title="Recent Activity"
            limit={3}
          />
        </div>

        {/* Inspection History - Collapsible Accordion */}
        <Collapse
          accordion
          defaultActiveKey={[]}
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'inspections',
              label: (
                <Space>
                  <FileSearchOutlined style={{ color: colors.seaBuckthorn }} />
                  Inspection History
                </Space>
              ),
              children: <InspectionHistory hiveId={hive.id} hiveName={hive.name} />,
            },
          ]}
        />

        {/* Queen History - Collapsible */}
        {hive.queen_history && hive.queen_history.length > 0 && (
          <Collapse
            accordion
            defaultActiveKey={[]}
            style={{ marginBottom: 16 }}
            items={[
              {
                key: 'queen-history',
                label: (
                  <Space>
                    <CrownOutlined style={{ color: colors.seaBuckthorn }} />
                    Queen History ({hive.queen_history.length})
                  </Space>
                ),
                children: (
                  <Timeline
                    items={hive.queen_history.map((qh) => ({
                      color: qh.replaced_at ? 'gray' : 'gold',
                      dot: <CrownOutlined style={{ fontSize: 14 }} />,
                      children: (
                        <div>
                          <Text strong style={{ fontSize: 13 }}>
                            {formatQueenSource(qh.source)} Queen
                          </Text>
                          {!qh.replaced_at && (
                            <Tag color="success" style={{ marginLeft: 8 }}>Current</Tag>
                          )}
                          <br />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Introduced: {dayjs(qh.introduced_at).format('MMM D, YYYY')}
                          </Text>
                          {qh.replaced_at && (
                            <>
                              <br />
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                Replaced: {dayjs(qh.replaced_at).format('MMM D, YYYY')}
                                {qh.replacement_reason && ` - ${qh.replacement_reason}`}
                              </Text>
                            </>
                          )}
                        </div>
                      ),
                    }))}
                  />
                ),
              },
            ]}
          />
        )}

        {/* Box Change History - Collapsible */}
        {hive.box_changes && hive.box_changes.length > 0 && (
          <Collapse
            accordion
            defaultActiveKey={[]}
            style={{ marginBottom: 16 }}
            items={[
              {
                key: 'box-history',
                label: `Box Changes (${hive.box_changes.length})`,
                children: (
                  <Timeline
                    items={hive.box_changes.map((bc) => ({
                      color: bc.change_type === 'added' ? 'green' : 'red',
                      dot: bc.change_type === 'added' ? <PlusOutlined /> : <MinusOutlined />,
                      children: (
                        <div>
                          <Text style={{ fontSize: 13 }}>
                            {bc.box_type === 'brood' ? 'Brood box' : 'Honey super'}{' '}
                            <Tag
                              color={bc.change_type === 'added' ? 'success' : 'error'}
                              style={{ fontSize: 11 }}
                            >
                              {bc.change_type}
                            </Tag>
                          </Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {dayjs(bc.changed_at).format('MMM D, YYYY')}
                          </Text>
                          {bc.notes && (
                            <>
                              <br />
                              <Text type="secondary" style={{ fontSize: 11 }}>{bc.notes}</Text>
                            </>
                          )}
                        </div>
                      ),
                    }))}
                  />
                ),
              },
            ]}
          />
        )}
      </section>

      {/* ============================================ */}
      {/* TASKS SECTION */}
      {/* ============================================ */}
      <SectionHeader title="TASKS" count={taskCount} id="tasks-section">
        <MobileTasksSection hiveId={hive.id} />
      </SectionHeader>

      {/* ============================================ */}
      {/* INSPECT SECTION */}
      {/* ============================================ */}
      <SectionHeader title="INSPECT" id="inspect-section">
        <div style={{ padding: '0 0 24px' }}>
          {hive.hive_status !== 'lost' && (
            <Button
              type="primary"
              size="large"
              icon={<FileSearchOutlined />}
              onClick={onNewInspection}
              style={{
                height: 64,
                width: '100%',
                fontSize: 16,
                marginBottom: 16,
              }}
            >
              Start New Inspection
            </Button>
          )}
          <Button
            type="link"
            block
            onClick={() => scrollToSection('status-section')}
            style={{ color: colors.textMuted, minHeight: TOUCH_TARGET_MIN }}
          >
            ↑ Scroll to Inspection History
          </Button>
        </div>
      </SectionHeader>

      {/* ============================================ */}
      {/* BOTTOM ANCHOR NAVIGATION - Story 14.8 */}
      {/* ============================================ */}
      <BottomAnchorNav
        activeSection={activeSection}
        onNavigate={scrollToSection}
        taskCount={taskCount}
        hasOverdue={overdueCount > 0}
      />
    </div>
  );
}

export default HiveDetailMobile;
