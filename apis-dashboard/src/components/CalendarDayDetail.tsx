/**
 * CalendarDayDetail Component
 *
 * Drawer panel showing events for a selected calendar day.
 * Displays cards for each event with action buttons:
 * - Mark Done: Complete the reminder or log treatment
 * - Snooze: Delay the reminder/due date by 7 days
 * - Delete: Remove the reminder (only for manual reminders)
 *
 * Part of Epic 6, Story 6.6 (Treatment Calendar & Reminders)
 */
import { useState } from 'react';
import {
  Drawer,
  Card,
  Typography,
  Space,
  Button,
  Badge,
  Empty,
  List,
  Popconfirm,
} from 'antd';
import {
  CheckOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  MedicineBoxOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Dayjs } from 'dayjs';
import type { CalendarEvent } from '../hooks/useCalendar';
import { TreatmentFormModal } from './TreatmentFormModal';
import { useTreatments, type CreateTreatmentInput } from '../hooks/useTreatments';
import { getBadgeStatus, getBadgeColor } from '../utils';

const { Text } = Typography;

interface CalendarDayDetailProps {
  open: boolean;
  date: Dayjs | null;
  events: CalendarEvent[];
  onClose: () => void;
  onMarkDone: (event: CalendarEvent) => Promise<void>;
  onSnooze: (event: CalendarEvent, days?: number) => Promise<void>;
  onSkip?: (event: CalendarEvent) => Promise<void>;
  onDelete: (event: CalendarEvent) => Promise<void>;
}

/**
 * CalendarDayDetail Component
 */
export function CalendarDayDetail({
  open,
  date,
  events,
  onClose,
  onMarkDone,
  onSnooze,
  onSkip,
  onDelete,
}: CalendarDayDetailProps) {
  const navigate = useNavigate();
  const { createTreatment, loading: treatmentLoading } = useTreatments('');
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleMarkDone = async (event: CalendarEvent) => {
    if (event.type === 'treatment_due') {
      // Open treatment form with pre-filled values
      setSelectedEvent(event);
      setTreatmentModalOpen(true);
    } else {
      // Complete the reminder
      setActionLoading(event.id);
      try {
        await onMarkDone(event);
      } finally {
        setActionLoading(null);
      }
    }
  };

  const handleSnooze = async (event: CalendarEvent) => {
    setActionLoading(event.id);
    try {
      await onSnooze(event, 7);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (event: CalendarEvent) => {
    setActionLoading(event.id);
    try {
      await onDelete(event);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkip = async (event: CalendarEvent) => {
    if (!onSkip) return;
    setActionLoading(event.id);
    try {
      await onSkip(event);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTreatmentSubmit = async (input: CreateTreatmentInput) => {
    await createTreatment(input);
    setTreatmentModalOpen(false);
    setSelectedEvent(null);
    // Close the drawer after successful treatment log
    onClose();
  };

  const handleViewHive = (hiveId: string) => {
    navigate(`/hives/${hiveId}`);
  };

  // Render event card
  const renderEventCard = (event: CalendarEvent) => {
    const isLoading = actionLoading === event.id;
    const isPast = event.type === 'treatment_past';
    const isDue = event.type === 'treatment_due';
    const isReminder = event.type === 'reminder';

    return (
      <Card
        key={event.id}
        size="small"
        style={{
          borderLeft: `4px solid ${getBadgeColor(event.type)}`,
          marginBottom: 12,
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {/* Header with badge and title */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Badge status={getBadgeStatus(event.type)} />
            <div style={{ flex: 1 }}>
              <Text strong style={{ display: 'block' }}>
                {event.title}
              </Text>
              {event.hive_name && (
                <Text
                  type="secondary"
                  style={{ fontSize: 12, cursor: 'pointer' }}
                  onClick={() => event.hive_id && handleViewHive(event.hive_id)}
                >
                  {event.hive_name}
                </Text>
              )}
            </div>
          </div>

          {/* Metadata info for treatment due */}
          {isDue && event.metadata && event.metadata.days_since_last !== undefined && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Last treatment: {String(event.metadata.days_since_last)} days ago
              {event.metadata.last_treatment_date ? ` (${String(event.metadata.last_treatment_date)})` : ''}
            </Text>
          )}

          {/* Actions - only for non-past events */}
          {!isPast && (
            <Space wrap>
              <Button
                size="small"
                type="primary"
                icon={isDue ? <MedicineBoxOutlined /> : <CheckOutlined />}
                onClick={() => handleMarkDone(event)}
                loading={isLoading}
              >
                {isDue ? 'Log Treatment' : 'Mark Done'}
              </Button>
              <Button
                size="small"
                icon={<ClockCircleOutlined />}
                onClick={() => handleSnooze(event)}
                loading={isLoading}
              >
                Snooze 7 days
              </Button>
              {isDue && onSkip && (
                <Popconfirm
                  title="Skip this treatment due?"
                  description="It won't appear again until after your next treatment."
                  onConfirm={() => handleSkip(event)}
                  okText="Skip"
                  cancelText="Cancel"
                >
                  <Button
                    size="small"
                    icon={<StopOutlined />}
                    loading={isLoading}
                  >
                    Skip
                  </Button>
                </Popconfirm>
              )}
              {isReminder && (
                <Popconfirm
                  title="Delete this reminder?"
                  onConfirm={() => handleDelete(event)}
                  okText="Delete"
                  cancelText="Cancel"
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    loading={isLoading}
                  >
                    Delete
                  </Button>
                </Popconfirm>
              )}
            </Space>
          )}

          {/* Past treatment just shows as completed */}
          {isPast && (
            <Text type="success" style={{ fontSize: 12 }}>
              <CheckOutlined /> Completed
            </Text>
          )}
        </Space>
      </Card>
    );
  };

  return (
    <>
      <Drawer
        title={
          <Space>
            <span>{date?.format('MMMM D, YYYY')}</span>
          </Space>
        }
        placement="right"
        open={open}
        onClose={onClose}
        width={400}
      >
        {events.length === 0 ? (
          <Empty
            description="No events on this day"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <List
            dataSource={events}
            renderItem={renderEventCard}
            split={false}
          />
        )}
      </Drawer>

      {/* Treatment Form Modal */}
      {selectedEvent && selectedEvent.hive_id && (
        <TreatmentFormModal
          open={treatmentModalOpen}
          onClose={() => {
            setTreatmentModalOpen(false);
            setSelectedEvent(null);
          }}
          onSubmit={handleTreatmentSubmit}
          loading={treatmentLoading}
          currentHiveId={selectedEvent.hive_id}
          currentHiveName={selectedEvent.hive_name || 'Unknown Hive'}
          prefilledTreatmentType={selectedEvent.metadata?.treatment_type as string | undefined}
        />
      )}
    </>
  );
}

export default CalendarDayDetail;
