/**
 * Calendar Page
 *
 * Monthly calendar view showing:
 * - Past treatments (completed, green checkmark)
 * - Upcoming due treatments (warning, orange)
 * - Manual reminders (blue)
 *
 * Click on a day to open day detail panel with actions.
 *
 * Part of Epic 6, Story 6.6 (Treatment Calendar & Reminders)
 */
import { useState, useMemo, useCallback } from 'react';
import {
  Calendar as AntCalendar,
  Badge,
  Card,
  Typography,
  Space,
  Spin,
  Empty,
  FloatButton,
  Select,
} from 'antd';
import type { CalendarProps } from 'antd';
import { PlusOutlined, CalendarOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import { colors } from '../theme/apisTheme';
import { useCalendar, type CalendarEvent, type CalendarFilters } from '../hooks/useCalendar';
import { useSites } from '../hooks/useSites';
import { useHivesList } from '../hooks/useHivesList';
import { CalendarDayDetail } from '../components/CalendarDayDetail';
import { ReminderFormModal } from '../components/ReminderFormModal';
import { getBadgeStatus, getBadgeColor, truncateText } from '../utils';

const { Title, Text } = Typography;

/**
 * Calendar Page Component
 */
export function Calendar() {
  const {
    events,
    startDate,
    endDate,
    loading,
    fetchEvents,
    createReminder,
    snoozeReminder,
    completeReminder,
    snoozeTreatmentDue,
    skipTreatmentDue,
    deleteReminder,
    creating,
  } = useCalendar();

  // Site/hive filter state (persisted in URL params)
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(
    searchParams.get('site_id')
  );
  const [selectedHiveId, setSelectedHiveId] = useState<string | null>(
    searchParams.get('hive_id')
  );

  const { sites, loading: sitesLoading } = useSites();
  const { hives: filteredHives, loading: hivesLoading } = useHivesList(
    selectedSiteId,
    { activeOnly: true }
  );

  // Build current filters object
  const currentFilters: CalendarFilters = useMemo(() => {
    const f: CalendarFilters = {};
    if (selectedHiveId) f.hiveId = selectedHiveId;
    else if (selectedSiteId) f.siteId = selectedSiteId;
    return f;
  }, [selectedSiteId, selectedHiveId]);

  const handleSiteChange = useCallback(
    (value: string | undefined) => {
      const siteId = value || null;
      setSelectedSiteId(siteId);
      setSelectedHiveId(null);
      // Update URL params
      const next = new URLSearchParams(searchParams);
      if (siteId) {
        next.set('site_id', siteId);
      } else {
        next.delete('site_id');
      }
      next.delete('hive_id');
      setSearchParams(next, { replace: true });
      // Refetch with new filters
      const filters: CalendarFilters = siteId ? { siteId } : {};
      fetchEvents(startDate, endDate, filters);
    },
    [searchParams, setSearchParams, fetchEvents, startDate, endDate]
  );

  const handleHiveChange = useCallback(
    (value: string | undefined) => {
      const hiveId = value || null;
      setSelectedHiveId(hiveId);
      // Update URL params
      const next = new URLSearchParams(searchParams);
      if (hiveId) {
        next.set('hive_id', hiveId);
      } else {
        next.delete('hive_id');
      }
      setSearchParams(next, { replace: true });
      // Refetch with new filters
      const filters: CalendarFilters = {};
      if (hiveId) {
        filters.hiveId = hiveId;
      } else if (selectedSiteId) {
        filters.siteId = selectedSiteId;
      }
      fetchEvents(startDate, endDate, filters);
    },
    [searchParams, setSearchParams, fetchEvents, startDate, endDate, selectedSiteId]
  );

  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);

  // Group events by date for efficient lookup
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      if (!map[event.date]) {
        map[event.date] = [];
      }
      map[event.date].push(event);
    }
    return map;
  }, [events]);

  // Get events for a specific date
  const getEventsForDate = (date: Dayjs): CalendarEvent[] => {
    const dateStr = date.format('YYYY-MM-DD');
    return eventsByDate[dateStr] || [];
  };

  // Handle month/year panel change - pass current filters
  const handlePanelChange: CalendarProps<Dayjs>['onPanelChange'] = (date) => {
    const start = date.startOf('month');
    const end = date.endOf('month');
    fetchEvents(start, end, currentFilters);
  };

  // Handle date cell click - only open drawer if there are events
  const handleSelect = (date: Dayjs) => {
    setSelectedDate(date);
    const dayEvents = getEventsForDate(date);
    if (dayEvents.length > 0) {
      setDrawerOpen(true);
    }
  };

  // Render date cell content
  const dateCellRender = (date: Dayjs) => {
    const dayEvents = getEventsForDate(date);

    if (dayEvents.length === 0) {
      return null;
    }

    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {dayEvents.slice(0, 3).map((event) => (
          <li key={event.id} style={{ marginBottom: 2 }}>
            <Badge
              {...(event.type === 'inspection_past'
                ? { color: getBadgeColor(event.type) }
                : { status: getBadgeStatus(event.type) })}
              text={
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.brownBramble,
                  }}
                  ellipsis
                >
                  {truncateText(event.title, 15)}
                </Text>
              }
            />
          </li>
        ))}
        {dayEvents.length > 3 && (
          <li>
            <Badge
              status="default"
              text={
                <Text style={{ fontSize: 11, color: colors.textMuted }}>
                  +{dayEvents.length - 3} more
                </Text>
              }
            />
          </li>
        )}
      </ul>
    );
  };

  // Handle actions from day detail panel
  const handleMarkDone = async (event: CalendarEvent) => {
    if (event.reminder_id) {
      await completeReminder(event.reminder_id);
    }
    // For treatment_due events, we redirect to treatment form (handled in CalendarDayDetail)
  };

  const handleSnooze = async (event: CalendarEvent, days: number = 7) => {
    if (event.reminder_id) {
      await snoozeReminder(event.reminder_id, days);
    } else if (event.type === 'treatment_due' && event.hive_id && event.metadata?.treatment_type) {
      await snoozeTreatmentDue(
        event.hive_id,
        event.metadata.treatment_type as string,
        days
      );
    }
  };

  const handleDelete = async (event: CalendarEvent) => {
    if (event.reminder_id) {
      await deleteReminder(event.reminder_id);
    }
  };

  const handleSkip = async (event: CalendarEvent) => {
    if (event.type === 'treatment_due' && event.hive_id && event.metadata?.treatment_type) {
      await skipTreatmentDue(
        event.hive_id,
        event.metadata.treatment_type as string
      );
    }
  };

  // Handle new reminder creation
  const handleCreateReminder = async (input: {
    hive_id?: string;
    title: string;
    due_at: string;
  }) => {
    await createReminder({
      ...input,
      reminder_type: 'custom',
    });
    setReminderModalOpen(false);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <CalendarOutlined style={{ fontSize: 24, color: colors.seaBuckthorn }} />
          <Title level={2} style={{ margin: 0 }}>
            Treatment Calendar
          </Title>
        </Space>
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          View past treatments and upcoming due dates. Click on a day to see details or take action.
        </Text>
      </div>

      {/* Legend */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <Space>
            <Badge status="success" />
            <Text>Past Treatment</Text>
          </Space>
          <Space>
            <Badge color="#722ed1" />
            <Text>Inspection</Text>
          </Space>
          <Space>
            <Badge status="warning" />
            <Text>Treatment Due</Text>
          </Space>
          <Space>
            <Badge status="processing" />
            <Text>Reminder</Text>
          </Space>
        </Space>
      </Card>

      {/* Site / Hive Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="All sites"
            allowClear
            options={sites.map((s) => ({ value: s.id, label: s.name }))}
            value={selectedSiteId ?? undefined}
            onChange={handleSiteChange}
            style={{ minWidth: 180 }}
            loading={sitesLoading}
          />
          <Select
            placeholder="All hives"
            allowClear
            disabled={!selectedSiteId}
            options={filteredHives.map((h) => ({ value: h.id, label: h.name }))}
            value={selectedHiveId ?? undefined}
            onChange={handleHiveChange}
            style={{ minWidth: 180 }}
            loading={hivesLoading}
          />
        </Space>
      </Card>

      {/* Calendar */}
      <Card>
        {loading && events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : (
          <AntCalendar
            cellRender={(date, info) => {
              if (info.type === 'date') {
                return dateCellRender(date);
              }
              return null;
            }}
            onPanelChange={handlePanelChange}
            onSelect={handleSelect}
          />
        )}

        {!loading && events.length === 0 && (
          <Empty
            description="No treatments or reminders this month"
            style={{ padding: 24 }}
          />
        )}
      </Card>

      {/* Day Detail Drawer */}
      <CalendarDayDetail
        open={drawerOpen}
        date={selectedDate}
        events={selectedDate ? getEventsForDate(selectedDate) : []}
        onClose={() => setDrawerOpen(false)}
        onMarkDone={handleMarkDone}
        onSnooze={handleSnooze}
        onSkip={handleSkip}
        onDelete={handleDelete}
      />

      {/* Add Reminder Modal */}
      <ReminderFormModal
        open={reminderModalOpen}
        onClose={() => setReminderModalOpen(false)}
        onSubmit={handleCreateReminder}
        loading={creating}
      />

      {/* Floating Add Button */}
      <FloatButton
        icon={<PlusOutlined />}
        type="primary"
        tooltip="Add Reminder"
        onClick={() => setReminderModalOpen(true)}
        style={{ bottom: 24, right: 24 }}
      />
    </div>
  );
}

export default Calendar;
