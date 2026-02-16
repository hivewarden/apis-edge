# Story 6.6: Treatment Calendar & Reminders

Status: done

**Note:** AC #4 (Push Notifications) is intentionally deferred to a future story. Task 12 remains incomplete and will be addressed in a separate notification infrastructure epic.

## Story

As a **beekeeper**,
I want to see upcoming treatment schedules on a calendar,
So that I don't miss important varroa treatments.

## Acceptance Criteria

1. **Given** I am on the Calendar page **When** I view the treatment calendar **Then** I see a monthly calendar view with:
   - Past treatments shown as completed (checkmark icon)
   - Upcoming due treatments highlighted (based on treatment intervals)
   - Recommended treatment windows based on configurable intervals

2. **Given** a treatment is due soon **When** I view the calendar **Then** I see: "Hive 2: Oxalic acid due in 3 days" with "Last treatment: 87 days ago" **And** action buttons: "Mark Done", "Snooze 7 days", "Skip"

3. **Given** I click "Mark Done" **When** the modal opens **Then** I'm taken to the treatment log form with hive and treatment type pre-filled

4. **Given** I enable notifications in settings **When** a treatment is due within 7 days **Then** I receive a push notification (if PWA installed) or email notification (if email enabled)

5. **Given** I want to set a custom reminder **When** I create a treatment record **Then** I can set "Remind me in X days for follow-up" **And** that reminder appears on the calendar

## Tasks / Subtasks

### Task 1: Database Migration for Reminders (AC: #4, #5)
- [x] 1.1 Create migration `0022_reminders.sql` with `reminders` table
- [x] 1.2 Schema: `id, tenant_id, hive_id, reminder_type, title, due_at, completed_at, snoozed_until, created_at`
- [x] 1.3 Add indexes for tenant_id, due_at queries, hive_id
- [x] 1.4 Add RLS policy for tenant isolation
- [x] 1.5 Valid reminder_types: 'treatment_due', 'treatment_followup', 'custom'

### Task 2: Backend Reminder Storage Layer (AC: #4, #5)
- [x] 2.1 Create `internal/storage/reminders.go` with Reminder struct
- [x] 2.2 Implement `CreateReminder` - insert new reminder
- [x] 2.3 Implement `ListRemindersForDateRange` - return reminders between start/end dates
- [x] 2.4 Implement `ListPendingReminders` - reminders due and not completed
- [x] 2.5 Implement `GetReminderByID` - single reminder
- [x] 2.6 Implement `UpdateReminder` - mark done, snooze
- [x] 2.7 Implement `DeleteReminder` - hard delete

### Task 3: Treatment Interval Configuration (AC: #1)
- [x] 3.1 Add `treatment_intervals` to tenants.settings JSONB column
- [x] 3.2 Default intervals: oxalic_acid=90, formic_acid=60, apiguard=84, apivar=42, maqs=7, api_bioxal=90
- [x] 3.3 Storage function to get/set intervals per tenant
- [x] 3.4 API endpoint `GET /api/settings/treatment-intervals`
- [x] 3.5 API endpoint `PUT /api/settings/treatment-intervals`

### Task 4: Backend Calendar API Handlers (AC: #1, #2)
- [x] 4.1 Create `internal/handlers/calendar.go`
- [x] 4.2 Implement `GET /api/calendar?start={date}&end={date}` - returns calendar events
- [x] 4.3 Event types: 'treatment_past', 'treatment_due', 'reminder'
- [x] 4.4 Include computed due dates based on last treatment + interval
- [x] 4.5 Include all manual reminders in date range

### Task 5: Backend Reminder API Handlers (AC: #2, #3, #5)
- [x] 5.1 Add reminder handlers to `internal/handlers/calendar.go`
- [x] 5.2 Implement `POST /api/reminders` - create reminder
- [x] 5.3 Implement `GET /api/reminders` - list reminders (with filters)
- [x] 5.4 Implement `PUT /api/reminders/{id}` - update (snooze, complete)
- [x] 5.5 Implement `DELETE /api/reminders/{id}` - delete reminder
- [x] 5.6 Implement `POST /api/reminders/{id}/snooze` - convenience endpoint
- [x] 5.7 Implement `POST /api/reminders/{id}/complete` - mark done
- [x] 5.8 Register routes in main.go

### Task 6: Frontend Calendar Page (AC: #1, #2)
- [x] 6.1 Create `Calendar.tsx` page component at `/calendar`
- [x] 6.2 Use Ant Design Calendar component with custom date cell renderer
- [x] 6.3 Display past treatments as completed badges (green checkmark)
- [x] 6.4 Display upcoming due treatments as warning badges (orange/red)
- [x] 6.5 Display manual reminders as info badges (blue)
- [x] 6.6 Click on date opens day detail view
- [x] 6.7 Add navigation link from sidebar

### Task 7: Frontend Day Detail Panel (AC: #2, #3)
- [x] 7.1 Create `CalendarDayDetail.tsx` component (drawer or modal)
- [x] 7.2 List all events for selected day with cards
- [x] 7.3 Treatment due cards show: hive name, treatment type, days overdue/until, last treatment date
- [x] 7.4 Action buttons per card: "Mark Done", "Snooze 7 days", "Skip"
- [x] 7.5 "Mark Done" opens TreatmentFormModal with pre-filled values
- [x] 7.6 "Snooze" calls appropriate API endpoint

### Task 8: Frontend Reminder Form Modal (AC: #5)
- [x] 8.1 Create `ReminderFormModal.tsx` component
- [x] 8.2 Fields: hive_id (dropdown), title (text), due_at (date picker)
- [x] 8.3 Support create mode (edit mode omitted for MVP)
- [x] 8.4 Validation: title required, due_at required, hive optional

### Task 9: Treatment Form Enhancement (AC: #5)
- [x] 9.1 Add "Set follow-up reminder" toggle to TreatmentFormModal
- [x] 9.2 When enabled, creates reminder based on treatment interval
- [x] 9.3 On treatment save, also create reminder if toggle enabled
- [x] 9.4 Reminder title: "{treatment_type} follow-up treatment due"

### Task 10: Frontend useCalendar Hook (AC: all)
- [x] 10.1 Create `useCalendar.ts` hook
- [x] 10.2 Fetch calendar events for current month (start/end dates)
- [x] 10.3 Computed treatment dues returned from backend
- [x] 10.4 CRUD operations for reminders
- [x] 10.5 Snooze and complete actions

### Task 11: Treatment Interval Settings UI (AC: #1)
- [x] 11.1 Add "Treatment Intervals" section to Settings page
- [x] 11.2 Editable table/list of treatment types with interval days
- [x] 11.3 Save button to persist changes
- [x] 11.4 Reset to defaults button

### Task 12: Push Notifications (AC: #4) - Optional/Future
- [ ] 12.1 Add Web Push API registration in service worker
- [ ] 12.2 Backend endpoint to store push subscription
- [ ] 12.3 Backend cron job to check due reminders daily
- [ ] 12.4 Send push notification for reminders due within 7 days
- [ ] 12.5 Settings toggle to enable/disable push notifications

### Task 13: Types and Exports (AC: all)
- [x] 13.1 Add CalendarEvent, Reminder, TreatmentInterval interfaces to useCalendar.ts
- [x] 13.2 Add routes for Calendar page in App.tsx
- [x] 13.3 Export components from index files
- [x] 13.4 Export useCalendar hook

### Task 14: Tests (AC: all)
- [x] 14.1 Backend: `tests/storage/reminders_test.go`
- [x] 14.2 Backend: `tests/handlers/calendar_test.go`
- [x] 14.3 Frontend: `tests/hooks/useCalendar.test.ts`
- [x] 14.4 Frontend: `tests/components/Calendar.test.tsx` (combined with 14.5)
- [x] 14.5 Frontend: `tests/pages/Calendar.test.tsx`

## Dev Notes

### Database Schema

**Table: `reminders`**
```sql
CREATE TABLE reminders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    hive_id TEXT REFERENCES hives(id) ON DELETE CASCADE,  -- NULL for tenant-wide reminders
    reminder_type TEXT NOT NULL,          -- 'treatment_due', 'treatment_followup', 'custom'
    title TEXT NOT NULL,                  -- "Oxalic acid treatment due", "Check mite count"
    due_at DATE NOT NULL,                 -- When the reminder is due
    completed_at TIMESTAMPTZ,             -- NULL unless marked done
    snoozed_until DATE,                   -- If snoozed, hidden until this date
    metadata JSONB DEFAULT '{}',          -- Additional data: {treatment_type: 'oxalic_acid', days_since: 92}
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policy
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reminders
    USING (tenant_id = current_setting('app.tenant_id'));

-- Indexes for calendar queries
CREATE INDEX idx_reminders_tenant ON reminders(tenant_id);
CREATE INDEX idx_reminders_due ON reminders(tenant_id, due_at) WHERE completed_at IS NULL;
CREATE INDEX idx_reminders_hive ON reminders(hive_id);
```

**Table: `tenant_settings` extension (or new table)**
```sql
-- Option A: Add column to existing tenant_settings if exists
-- Option B: Store in tenants.settings JSONB column
-- Option C: Create treatment_intervals table

-- Recommended: Use tenants.settings JSONB column
-- Treatment intervals stored as:
-- settings->>'treatment_intervals' = {"oxalic_acid": 90, "formic_acid": 60, ...}
```

### API Endpoints

```
Calendar:
GET    /api/calendar                    # Get calendar events for date range
       Query params: start={YYYY-MM-DD}, end={YYYY-MM-DD}

Reminders:
GET    /api/reminders                   # List reminders (filterable)
POST   /api/reminders                   # Create reminder
GET    /api/reminders/{id}              # Get single reminder
PUT    /api/reminders/{id}              # Update reminder
DELETE /api/reminders/{id}              # Delete reminder
POST   /api/reminders/{id}/snooze       # Snooze reminder (body: {days: 7})
POST   /api/reminders/{id}/complete     # Mark done

Treatment Intervals:
GET    /api/settings/treatment-intervals     # Get intervals
PUT    /api/settings/treatment-intervals     # Update intervals
```

### API Response Formats

**Calendar Events Response:**
```json
{
  "data": [
    {
      "id": "event-123",
      "date": "2026-02-15",
      "type": "treatment_past",
      "title": "Oxalic Acid - Hive Alpha",
      "hive_id": "hive-1",
      "hive_name": "Hive Alpha",
      "metadata": {"treatment_id": "treat-456"}
    },
    {
      "id": "computed-789",
      "date": "2026-02-20",
      "type": "treatment_due",
      "title": "Oxalic Acid due - Hive Alpha",
      "hive_id": "hive-1",
      "hive_name": "Hive Alpha",
      "metadata": {
        "treatment_type": "oxalic_acid",
        "days_since_last": 87,
        "last_treatment_date": "2025-11-25"
      }
    },
    {
      "id": "reminder-101",
      "date": "2026-02-18",
      "type": "reminder",
      "title": "Check mite count after treatment",
      "hive_id": "hive-1",
      "hive_name": "Hive Alpha",
      "reminder_id": "reminder-101"
    }
  ]
}
```

**Create Reminder Request:**
```json
{
  "hive_id": "hive-1",         // optional
  "title": "Inspect for swarm cells",
  "due_at": "2026-03-15",
  "reminder_type": "custom"
}
```

### Treatment Interval Defaults

```typescript
export const DEFAULT_TREATMENT_INTERVALS: Record<string, number> = {
  oxalic_acid: 90,      // 3 months
  formic_acid: 60,      // 2 months
  apiguard: 84,         // 12 weeks (2 applications)
  apivar: 42,           // 6 weeks (full strip treatment)
  maqs: 7,              // 1 week (re-apply check)
  api_bioxal: 90,       // 3 months
};
```

### Calendar Event Computation Logic

The calendar endpoint computes treatment due dates dynamically:

```go
func computeTreatmentDues(ctx context.Context, tenantID string, startDate, endDate time.Time) ([]CalendarEvent, error) {
    // 1. Get all hives for tenant
    hives := storage.ListHives(ctx, tenantID)

    // 2. Get treatment intervals for tenant
    intervals := storage.GetTreatmentIntervals(ctx, tenantID)

    // 3. For each hive, get last treatment per treatment type
    events := []CalendarEvent{}

    for _, hive := range hives {
        lastTreatments := storage.GetLastTreatmentsByType(ctx, hive.ID)

        for treatmentType, lastDate := range lastTreatments {
            interval := intervals[treatmentType]
            if interval == 0 {
                interval = DEFAULT_TREATMENT_INTERVALS[treatmentType]
            }

            dueDate := lastDate.AddDate(0, 0, interval)

            // Only include if due date is in range
            if dueDate.After(startDate) && dueDate.Before(endDate) {
                events = append(events, CalendarEvent{
                    Type: "treatment_due",
                    Date: dueDate,
                    Title: fmt.Sprintf("%s due - %s", treatmentType, hive.Name),
                    HiveID: hive.ID,
                    Metadata: map[string]any{
                        "treatment_type": treatmentType,
                        "days_since_last": daysSince(lastDate),
                        "last_treatment_date": lastDate.Format("2006-01-02"),
                    },
                })
            }
        }
    }

    return events, nil
}
```

### Frontend Calendar Component Pattern

Use Ant Design Calendar with custom cell renderer:

```tsx
import { Calendar, Badge, type BadgeProps } from 'antd';
import type { Dayjs } from 'dayjs';

function TreatmentCalendar() {
  const { events, loading } = useCalendar();
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const getListData = (date: Dayjs): CalendarEvent[] => {
    return events.filter(e => dayjs(e.date).isSame(date, 'day'));
  };

  const dateCellRender = (date: Dayjs) => {
    const dayEvents = getListData(date);
    return (
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {dayEvents.slice(0, 3).map(event => (
          <li key={event.id}>
            <Badge
              status={getBadgeStatus(event.type)}
              text={truncate(event.title, 15)}
            />
          </li>
        ))}
        {dayEvents.length > 3 && (
          <li><Badge status="default" text={`+${dayEvents.length - 3} more`} /></li>
        )}
      </ul>
    );
  };

  const getBadgeStatus = (type: string): BadgeProps['status'] => {
    switch (type) {
      case 'treatment_past': return 'success';     // Green
      case 'treatment_due': return 'warning';      // Orange
      case 'reminder': return 'processing';        // Blue
      default: return 'default';
    }
  };

  const onSelect = (date: Dayjs) => {
    setSelectedDate(date);
    setDrawerOpen(true);
  };

  return (
    <>
      <Calendar
        dateCellRender={dateCellRender}
        onSelect={onSelect}
      />
      <CalendarDayDetail
        open={drawerOpen}
        date={selectedDate}
        events={selectedDate ? getListData(selectedDate) : []}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
```

### Day Detail Drawer Pattern

```tsx
function CalendarDayDetail({ open, date, events, onClose }: Props) {
  const { snoozeReminder, completeReminder } = useCalendar();
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [prefilledTreatment, setPrefilledTreatment] = useState<TreatmentPrefill | null>(null);

  const handleMarkDone = (event: CalendarEvent) => {
    if (event.type === 'treatment_due') {
      // Open treatment form with pre-filled values
      setPrefilledTreatment({
        hive_id: event.hive_id,
        treatment_type: event.metadata.treatment_type,
      });
      setTreatmentModalOpen(true);
    } else if (event.type === 'reminder' && event.reminder_id) {
      completeReminder(event.reminder_id);
    }
  };

  const handleSnooze = async (event: CalendarEvent, days: number = 7) => {
    if (event.reminder_id) {
      await snoozeReminder(event.reminder_id, days);
    }
    // For computed treatment_due, create a "snoozed" reminder
    // so it won't show until snoozed_until passes
  };

  return (
    <Drawer
      title={date?.format('MMMM D, YYYY')}
      open={open}
      onClose={onClose}
      width={400}
    >
      <List
        dataSource={events}
        renderItem={event => (
          <Card size="small" style={{ marginBottom: 8 }}>
            <Badge status={getBadgeStatus(event.type)} />
            <Text strong>{event.title}</Text>
            {event.type === 'treatment_due' && (
              <Text type="secondary" style={{ display: 'block' }}>
                Last treatment: {event.metadata.days_since_last} days ago
              </Text>
            )}
            <Space style={{ marginTop: 8 }}>
              <Button size="small" type="primary" onClick={() => handleMarkDone(event)}>
                Mark Done
              </Button>
              <Button size="small" onClick={() => handleSnooze(event, 7)}>
                Snooze 7 days
              </Button>
              {event.type === 'reminder' && (
                <Button size="small" danger onClick={() => deleteReminder(event.reminder_id)}>
                  Delete
                </Button>
              )}
            </Space>
          </Card>
        )}
      />

      <TreatmentFormModal
        open={treatmentModalOpen}
        onClose={() => setTreatmentModalOpen(false)}
        prefilled={prefilledTreatment}
      />
    </Drawer>
  );
}
```

### Integration with BeeBrain Insights

The existing BeeBrain insights engine already computes `treatment_due` insights via `evaluateTreatmentDue()`. The calendar should:

1. **Not duplicate logic** - use the same interval calculations
2. **Complement insights** - calendar provides visual planning, insights provide proactive alerts
3. **Share data** - both read from treatments table and use same intervals

Consider extracting interval calculation to a shared service:

```go
// internal/services/treatment_scheduler.go
func GetDueTreatments(ctx context.Context, tenantID string, startDate, endDate time.Time) ([]TreatmentDue, error)
```

### Project Structure Notes

**Backend files to create:**
- `apis-server/internal/storage/migrations/0022_reminders.sql`
- `apis-server/internal/storage/reminders.go`
- `apis-server/internal/handlers/calendar.go`

**Frontend files to create:**
- `apis-dashboard/src/pages/Calendar.tsx`
- `apis-dashboard/src/components/CalendarDayDetail.tsx`
- `apis-dashboard/src/components/ReminderFormModal.tsx`
- `apis-dashboard/src/hooks/useCalendar.ts`

**Files to modify:**
- `apis-server/cmd/server/main.go` (add calendar and reminder routes)
- `apis-server/internal/storage/tenants.go` (add treatment intervals to settings)
- `apis-dashboard/src/App.tsx` (add Calendar route)
- `apis-dashboard/src/pages/Settings.tsx` (add Treatment Intervals section)
- `apis-dashboard/src/pages/index.ts` (export Calendar)
- `apis-dashboard/src/components/TreatmentFormModal.tsx` (add follow-up reminder toggle)
- `apis-dashboard/src/components/layout/AppLayout.tsx` (add Calendar to sidebar)

### Previous Story Intelligence (from 6.5 Custom Labels)

**Patterns to follow:**
1. CRUD storage pattern with tenant isolation - copy from `labels.go`
2. Form modal pattern with Form.useForm() - copy from `LabelFormModal.tsx`
3. Hook pattern with optimistic updates - copy from `useCustomLabels.ts`
4. Settings page card layout - copy existing sections

**Code review feedback to apply from 6.5:**
- Always validate inputs server-side (reminder_type must be valid, title required)
- Wire up all functionality completely (no stubs)
- No emojis in user-facing text (per project standards)
- Add proper tenant isolation to all queries

### Key Implementation Notes

1. **Calendar events are computed, not stored** - Treatment due dates are calculated on-the-fly from treatments table + intervals. Only manual reminders are stored in reminders table.

2. **Snoozing computed events** - When user snoozes a computed "treatment_due" event, create a reminder with snoozed_until set. The calendar query should check for snoozed reminders and hide the computed event if snoozed.

3. **Interval configuration** - Store in tenants.settings JSONB to avoid new table. Default intervals defined in code, overridden by per-tenant settings.

4. **Push notifications are optional** - Tasks 12.x are marked as future/optional. Implement basic calendar and reminders first.

5. **Mobile-friendly** - Calendar should be usable on mobile. Consider month view default, tap to expand day detail in drawer.

### IMPORTANT: Frontend Skill Usage

**This story has significant frontend components.** When implementing Tasks 6-11 and 13, use the `/frontend-design` skill for:
- Calendar.tsx page
- CalendarDayDetail.tsx component
- ReminderFormModal.tsx component
- Settings page Treatment Intervals section

This ensures high-quality, distinctive UI matching the APIS design system.

### References

- [Source: epics.md#Story-6.6] - Full acceptance criteria
- [Source: architecture.md#API-Endpoints] - REST API patterns (lines 1140-1240)
- [Source: architecture.md#treatments-table] - Treatments schema (lines 277-289)
- [Source: 6-5-custom-labels-system.md] - Previous story patterns and learnings
- [Source: TreatmentFormModal.tsx] - Existing treatment form pattern
- [Source: TreatmentHistoryCard.tsx] - Treatment display patterns
- [Source: useTreatments.ts] - Hook pattern reference
- [Source: beebrain.go] - Existing treatment_due insight computation
- [Source: rules.yaml] - BeeBrain treatment_due rule configuration

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None - clean implementation.

### Completion Notes List

- Tasks 1-11 and 13 completed successfully
- Task 12 (Push Notifications) intentionally skipped - marked as Optional/Future in story
- Task 14 (Tests) pending - will require additional implementation
- Backend compiles successfully
- Frontend files compile successfully (Story 6.6 specific files have no TypeScript errors)
- Note: Some pre-existing TypeScript errors exist in other files from previous epics

### File List

**Created:**
- apis-server/internal/storage/migrations/0022_reminders.sql
- apis-server/internal/storage/reminders.go
- apis-server/internal/handlers/calendar.go
- apis-server/tests/storage/reminders_test.go
- apis-server/tests/handlers/calendar_test.go
- apis-dashboard/src/pages/Calendar.tsx
- apis-dashboard/src/components/CalendarDayDetail.tsx
- apis-dashboard/src/components/ReminderFormModal.tsx
- apis-dashboard/src/hooks/useCalendar.ts
- apis-dashboard/src/utils/calendarUtils.ts
- apis-dashboard/tests/hooks/useCalendar.test.ts
- apis-dashboard/tests/pages/Calendar.test.tsx

**Modified:**
- apis-server/cmd/server/main.go (added calendar and reminder routes)
- apis-server/internal/storage/tenants.go (added treatment interval functions)
- apis-server/internal/storage/treatments.go (added GetLastTreatmentsByTypeForHive, ListTreatmentsForDateRange)
- apis-dashboard/src/App.tsx (added Calendar route and import)
- apis-dashboard/src/pages/index.ts (exported Calendar)
- apis-dashboard/src/hooks/index.ts (exported useCalendar and related types)
- apis-dashboard/src/components/index.ts (exported CalendarDayDetail, ReminderFormModal)
- apis-dashboard/src/components/layout/navItems.tsx (added Calendar to navigation)
- apis-dashboard/src/pages/Settings.tsx (added Treatment Intervals section)
- apis-dashboard/src/components/TreatmentFormModal.tsx (added follow-up reminder toggle, prefilledTreatmentType prop)
- apis-dashboard/src/utils/index.ts (exported calendar utilities)
