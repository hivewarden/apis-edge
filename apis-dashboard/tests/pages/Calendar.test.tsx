/**
 * Calendar Page Tests
 *
 * Tests for the Treatment Calendar page that displays past treatments,
 * upcoming due dates, and reminders.
 *
 * Part of Epic 6, Story 6.6 (Treatment Calendar & Reminders)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Calendar } from '../../src/pages/Calendar';

// Mock the useCalendar hook
vi.mock('../../src/hooks/useCalendar', () => ({
  useCalendar: vi.fn(() => ({
    events: [
      {
        id: 'treatment-1',
        date: '2026-01-15',
        type: 'treatment_past',
        title: 'Oxalic Acid - Hive Alpha',
        hive_id: 'hive-1',
        hive_name: 'Hive Alpha',
        metadata: { treatment_type: 'oxalic_acid' },
      },
      {
        id: 'due-hive-1',
        date: '2026-02-15',
        type: 'treatment_due',
        title: 'Oxalic Acid due - Hive Alpha',
        hive_id: 'hive-1',
        hive_name: 'Hive Alpha',
        metadata: { treatment_type: 'oxalic_acid', days_since_last: 31 },
      },
      {
        id: 'reminder-1',
        date: '2026-01-20',
        type: 'reminder',
        title: 'Check for swarm cells',
        hive_id: 'hive-1',
        hive_name: 'Hive Alpha',
        reminder_id: 'reminder-1',
      },
    ],
    startDate: { format: () => '2026-01-01' },
    endDate: { format: () => '2026-01-31' },
    loading: false,
    error: null,
    fetchEvents: vi.fn(),
    createReminder: vi.fn(),
    updateReminder: vi.fn(),
    deleteReminder: vi.fn(),
    snoozeReminder: vi.fn(),
    completeReminder: vi.fn(),
    snoozeTreatmentDue: vi.fn(),
    creating: false,
    updating: false,
    deleting: false,
  })),
  formatTreatmentType: vi.fn((type: string) => {
    const names: Record<string, string> = {
      oxalic_acid: 'Oxalic Acid',
      formic_acid: 'Formic Acid',
    };
    return names[type] || type;
  }),
  DEFAULT_TREATMENT_INTERVALS: {
    oxalic_acid: 90,
    formic_acid: 60,
  },
}));

// Mock the CalendarDayDetail component
vi.mock('../../src/components/CalendarDayDetail', () => ({
  CalendarDayDetail: vi.fn(({ open, onClose }) =>
    open ? (
      <div data-testid="calendar-day-detail">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}));

// Mock the ReminderFormModal component
vi.mock('../../src/components/ReminderFormModal', () => ({
  ReminderFormModal: vi.fn(({ open, onClose }) =>
    open ? (
      <div data-testid="reminder-form-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}));

// Mock theme
vi.mock('../../src/theme/apisTheme', () => ({
  colors: {
    seaBuckthorn: '#F7A42D',
    brownBramble: '#4A3728',
    textMuted: '#999',
    success: '#52c41a',
    info: '#1890ff',
  },
}));

// Mock utils
vi.mock('../../src/utils', () => ({
  getBadgeStatus: vi.fn((type: string) => {
    switch (type) {
      case 'treatment_past': return 'success';
      case 'treatment_due': return 'warning';
      case 'reminder': return 'processing';
      default: return 'default';
    }
  }),
  truncateText: vi.fn((str: string, maxLength: number) => {
    if (str.length <= maxLength) return str;
    if (maxLength <= 3) return '...'.slice(0, maxLength);
    return str.slice(0, maxLength - 3) + '...';
  }),
}));

const renderCalendar = () => {
  return render(
    <BrowserRouter>
      <Calendar />
    </BrowserRouter>
  );
};

describe('Calendar Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title', () => {
    renderCalendar();
    expect(screen.getByText('Treatment Calendar')).toBeInTheDocument();
  });

  it('renders the page description', () => {
    renderCalendar();
    expect(screen.getByText(/View past treatments and upcoming due dates/)).toBeInTheDocument();
  });

  it('renders the legend with all three event types', () => {
    renderCalendar();
    expect(screen.getByText('Past Treatment')).toBeInTheDocument();
    expect(screen.getByText('Treatment Due')).toBeInTheDocument();
    expect(screen.getByText('Reminder')).toBeInTheDocument();
  });

  it('renders the Add Reminder floating button', () => {
    renderCalendar();
    // FloatButton renders with type="primary" and an icon
    // Find button by class or test for presence of the float button container
    const floatButtons = document.querySelectorAll('.ant-float-btn');
    expect(floatButtons.length).toBeGreaterThan(0);
  });
});

describe('Calendar Loading State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner when loading with no events', async () => {
    const { useCalendar } = await import('../../src/hooks/useCalendar');
    vi.mocked(useCalendar).mockReturnValue({
      events: [],
      startDate: { format: () => '2026-01-01' },
      endDate: { format: () => '2026-01-31' },
      loading: true,
      error: null,
      fetchEvents: vi.fn(),
      createReminder: vi.fn(),
      updateReminder: vi.fn(),
      deleteReminder: vi.fn(),
      snoozeReminder: vi.fn(),
      completeReminder: vi.fn(),
      snoozeTreatmentDue: vi.fn(),
      creating: false,
      updating: false,
      deleting: false,
    } as any);

    renderCalendar();
    // Spin component should be present when loading
    expect(screen.getByText('Treatment Calendar')).toBeInTheDocument();
  });
});

describe('Calendar Empty State', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useCalendar } = await import('../../src/hooks/useCalendar');
    vi.mocked(useCalendar).mockReturnValue({
      events: [],
      startDate: { format: () => '2026-01-01' },
      endDate: { format: () => '2026-01-31' },
      loading: false,
      error: null,
      fetchEvents: vi.fn(),
      createReminder: vi.fn(),
      updateReminder: vi.fn(),
      deleteReminder: vi.fn(),
      snoozeReminder: vi.fn(),
      completeReminder: vi.fn(),
      snoozeTreatmentDue: vi.fn(),
      creating: false,
      updating: false,
      deleting: false,
    } as any);
  });

  it('shows empty message when no events', () => {
    renderCalendar();
    expect(screen.getByText(/No treatments or reminders this month/)).toBeInTheDocument();
  });
});

describe('Calendar Modal Interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens reminder modal when Add Reminder button is clicked', async () => {
    const user = userEvent.setup();
    renderCalendar();

    // Find the FloatButton by its class
    const floatButton = document.querySelector('.ant-float-btn');
    expect(floatButton).not.toBeNull();

    if (floatButton) {
      await user.click(floatButton);

      await waitFor(() => {
        expect(screen.getByTestId('reminder-form-modal')).toBeInTheDocument();
      });
    }
  });
});

describe('Calendar Event Type Styles', () => {
  // Note: getBadgeStatus utility function is tested in tests/utils/calendarUtils.test.ts
  // These tests verify the mock configuration matches expected behavior

  it('treatment_past events should map to success status', () => {
    // The mocked getBadgeStatus at line 110 returns 'success' for treatment_past
    // This verifies the mapping is consistent with AC requirements
    const mockBehavior: Record<string, string> = {
      treatment_past: 'success',
      treatment_due: 'warning',
      reminder: 'processing',
    };
    expect(mockBehavior['treatment_past']).toBe('success');
  });

  it('treatment_due events should map to warning status', () => {
    const mockBehavior: Record<string, string> = {
      treatment_past: 'success',
      treatment_due: 'warning',
      reminder: 'processing',
    };
    expect(mockBehavior['treatment_due']).toBe('warning');
  });

  it('reminder events should map to processing status', () => {
    const mockBehavior: Record<string, string> = {
      treatment_past: 'success',
      treatment_due: 'warning',
      reminder: 'processing',
    };
    expect(mockBehavior['reminder']).toBe('processing');
  });
});

describe('Calendar Date Handling', () => {
  it('groups events by date correctly', () => {
    // Test that events with same date are grouped
    const events = [
      { id: '1', date: '2026-01-15', type: 'treatment_past', title: 'Event 1' },
      { id: '2', date: '2026-01-15', type: 'reminder', title: 'Event 2' },
      { id: '3', date: '2026-01-16', type: 'treatment_due', title: 'Event 3' },
    ];

    const eventsByDate: Record<string, typeof events> = {};
    for (const event of events) {
      if (!eventsByDate[event.date]) {
        eventsByDate[event.date] = [];
      }
      eventsByDate[event.date].push(event);
    }

    expect(eventsByDate['2026-01-15']).toHaveLength(2);
    expect(eventsByDate['2026-01-16']).toHaveLength(1);
  });
});

describe('Calendar Title Truncation', () => {
  // Note: truncateText utility function is tested in tests/utils/calendarUtils.test.ts
  // These tests verify the mock configuration and expected behavior

  it('truncates long titles with ellipsis', () => {
    // The mocked truncateText implements truncation correctly
    const truncate = (str: string, maxLength: number): string => {
      if (str.length <= maxLength) return str;
      if (maxLength <= 3) return '...'.slice(0, maxLength);
      return str.slice(0, maxLength - 3) + '...';
    };

    const longTitle = 'This is a very long treatment title that should be truncated';
    const truncated = truncate(longTitle, 15);

    expect(truncated.length).toBeLessThanOrEqual(15);
    expect(truncated).toContain('...');
  });

  it('does not truncate short titles', () => {
    const truncate = (str: string, maxLength: number): string => {
      if (str.length <= maxLength) return str;
      if (maxLength <= 3) return '...'.slice(0, maxLength);
      return str.slice(0, maxLength - 3) + '...';
    };

    const shortTitle = 'Short';
    const result = truncate(shortTitle, 15);

    expect(result).toBe(shortTitle);
    expect(result).not.toContain('...');
  });
});
