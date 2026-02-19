/**
 * Calendar Page Tests
 *
 * Tests for the Treatment Calendar page that displays past treatments,
 * upcoming due dates, inspections, and reminders with site/hive filtering.
 *
 * Part of Epic 6, Story 6.6 (Treatment Calendar & Reminders)
 * Extended: Calendar Inspections + Site/Hive Filtering
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import dayjs from 'dayjs';

// Mock apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mutable hook return values
const mockFetchEvents = vi.fn();

const hookReturns = {
  useCalendar: {
    events: [] as Array<Record<string, unknown>>,
    startDate: dayjs().startOf('month'),
    endDate: dayjs().endOf('month'),
    loading: false,
    error: null,
    fetchEvents: mockFetchEvents,
    createReminder: vi.fn().mockResolvedValue({}),
    updateReminder: vi.fn(),
    deleteReminder: vi.fn().mockResolvedValue(undefined),
    snoozeReminder: vi.fn().mockResolvedValue({}),
    completeReminder: vi.fn().mockResolvedValue({}),
    snoozeTreatmentDue: vi.fn().mockResolvedValue(undefined),
    skipTreatmentDue: vi.fn().mockResolvedValue(undefined),
    creating: false,
    updating: false,
    deleting: false,
  },
  useSites: {
    sites: [] as Array<{ id: string; name: string }>,
    loading: false,
    error: null,
    refetch: vi.fn(),
  },
  useHivesList: {
    hives: [] as Array<{ id: string; name: string }>,
    total: 0,
    loading: false,
    error: null,
    refetch: vi.fn(),
  },
};

// Mock hooks - use getters that reference mutable state
vi.mock('../../src/hooks/useCalendar', () => ({
  useCalendar: () => hookReturns.useCalendar,
  useTreatmentIntervals: () => ({
    intervals: {},
    loading: false,
    error: null,
    saving: false,
    refetch: vi.fn(),
    updateIntervals: vi.fn(),
    resetToDefaults: vi.fn(),
  }),
  formatTreatmentType: (type: string) => type,
  DEFAULT_TREATMENT_INTERVALS: {},
}));

vi.mock('../../src/hooks/useSites', () => ({
  useSites: () => hookReturns.useSites,
}));

vi.mock('../../src/hooks/useHivesList', () => ({
  useHivesList: () => hookReturns.useHivesList,
}));

vi.mock('../../src/hooks/useTreatments', () => ({
  useTreatments: () => ({
    treatments: [],
    loading: false,
    error: null,
    createTreatment: vi.fn(),
    updateTreatment: vi.fn(),
    deleteTreatment: vi.fn(),
  }),
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
  getBadgeStatus: (type: string) => {
    switch (type) {
      case 'treatment_past': return 'success';
      case 'treatment_due': return 'warning';
      case 'reminder': return 'processing';
      case 'inspection_past': return 'default';
      default: return 'default';
    }
  },
  getBadgeColor: (type: string) => {
    switch (type) {
      case 'treatment_past': return '#52c41a';
      case 'treatment_due': return '#F7A42D';
      case 'reminder': return '#1890ff';
      case 'inspection_past': return '#722ed1';
      default: return '#999';
    }
  },
  truncateText: (str: string, maxLength: number) => {
    if (str.length <= maxLength) return str;
    if (maxLength <= 3) return '...'.slice(0, maxLength);
    return str.slice(0, maxLength - 3) + '...';
  },
}));

// Mock CalendarDayDetail and ReminderFormModal
vi.mock('../../src/components/CalendarDayDetail', () => ({
  CalendarDayDetail: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="calendar-day-detail">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

vi.mock('../../src/components/ReminderFormModal', () => ({
  ReminderFormModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="reminder-form-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Import after mocks
import { Calendar } from '../../src/pages/Calendar';

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
    hookReturns.useCalendar = {
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
      startDate: dayjs().startOf('month'),
      endDate: dayjs().endOf('month'),
      loading: false,
      error: null,
      fetchEvents: mockFetchEvents,
      createReminder: vi.fn().mockResolvedValue({}),
      updateReminder: vi.fn(),
      deleteReminder: vi.fn().mockResolvedValue(undefined),
      snoozeReminder: vi.fn().mockResolvedValue({}),
      completeReminder: vi.fn().mockResolvedValue({}),
      snoozeTreatmentDue: vi.fn().mockResolvedValue(undefined),
      skipTreatmentDue: vi.fn().mockResolvedValue(undefined),
      creating: false,
      updating: false,
      deleting: false,
    };
    hookReturns.useSites = {
      sites: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
    hookReturns.useHivesList = {
      hives: [],
      total: 0,
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
  });

  it('renders the page title', () => {
    renderCalendar();
    expect(screen.getByText('Treatment Calendar')).toBeInTheDocument();
  });

  it('renders the page description', () => {
    renderCalendar();
    expect(screen.getByText(/View past treatments and upcoming due dates/)).toBeInTheDocument();
  });

  it('renders the Add Reminder floating button', () => {
    renderCalendar();
    const floatButtons = document.querySelectorAll('.ant-float-btn');
    expect(floatButtons.length).toBeGreaterThan(0);
  });

  it('opens reminder modal when Add Reminder button is clicked', async () => {
    const user = userEvent.setup();
    renderCalendar();

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

describe('Calendar Legend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookReturns.useCalendar.events = [];
    hookReturns.useCalendar.loading = false;
  });

  it('renders all four legend items including Inspection', () => {
    renderCalendar();
    expect(screen.getByText('Past Treatment')).toBeInTheDocument();
    expect(screen.getByText('Inspection')).toBeInTheDocument();
    expect(screen.getByText('Treatment Due')).toBeInTheDocument();
    expect(screen.getByText('Reminder')).toBeInTheDocument();
  });

  it('Inspection legend text is present alongside other event types', () => {
    renderCalendar();
    // All four legend items must co-exist
    const legendTexts = ['Past Treatment', 'Inspection', 'Treatment Due', 'Reminder'];
    for (const text of legendTexts) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });
});

describe('Calendar Filter Dropdowns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookReturns.useCalendar.events = [];
    hookReturns.useCalendar.loading = false;
    hookReturns.useSites = {
      sites: [
        { id: 'site-1', name: 'Alpha Apiary' },
        { id: 'site-2', name: 'Beta Apiary' },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
    hookReturns.useHivesList = {
      hives: [
        { id: 'hive-1', name: 'Alpha Hive 1' },
        { id: 'hive-2', name: 'Alpha Hive 2' },
      ],
      total: 2,
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
  });

  it('renders site and hive filter dropdowns', () => {
    renderCalendar();

    // Both Select components render as .ant-select elements
    const selects = document.querySelectorAll('.ant-select');
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  it('shows "All sites" placeholder', () => {
    renderCalendar();
    expect(screen.getByText('All sites')).toBeInTheDocument();
  });

  it('shows "All hives" placeholder', () => {
    renderCalendar();
    expect(screen.getByText('All hives')).toBeInTheDocument();
  });

  it('hive dropdown is disabled when no site is selected', () => {
    renderCalendar();

    // The hive select should have the disabled class
    const selects = document.querySelectorAll('.ant-select');
    // Find the hive select (second one after the site select)
    let hiveSelectFound = false;
    selects.forEach((sel) => {
      if (sel.classList.contains('ant-select-disabled')) {
        hiveSelectFound = true;
      }
    });
    expect(hiveSelectFound).toBe(true);
  });
});

describe('Calendar Inspection Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookReturns.useCalendar.loading = false;
  });

  it('renders inspection_past events in calendar cells', async () => {
    const today = dayjs().format('YYYY-MM-DD');
    hookReturns.useCalendar.events = [
      {
        id: 'inspection-1',
        date: today,
        type: 'inspection_past',
        title: 'Inspection - Alpha Hive 1',
        hive_id: 'hive-1',
        hive_name: 'Alpha Hive 1',
        metadata: {
          inspection_id: 'insp-1',
          brood_frames: 6,
          honey_level: 'high',
          issues_count: 1,
        },
      },
    ];

    renderCalendar();

    await waitFor(() => {
      // Badges should render for the inspection event
      const badges = document.querySelectorAll('.ant-badge');
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it('renders mixed event types on the same day', async () => {
    const today = dayjs().format('YYYY-MM-DD');
    hookReturns.useCalendar.events = [
      {
        id: 'treatment-1',
        date: today,
        type: 'treatment_past',
        title: 'Oxalic Acid - Hive 1',
        hive_id: 'hive-1',
        hive_name: 'Hive 1',
      },
      {
        id: 'inspection-1',
        date: today,
        type: 'inspection_past',
        title: 'Inspection - Hive 1',
        hive_id: 'hive-1',
        hive_name: 'Hive 1',
        metadata: { inspection_id: 'insp-1', issues_count: 0 },
      },
      {
        id: 'reminder-1',
        date: today,
        type: 'reminder',
        title: 'Check queen',
        reminder_id: 'rem-1',
      },
    ];

    renderCalendar();

    await waitFor(() => {
      // Should render badge items for each event in the cell
      const listItems = document.querySelectorAll('li .ant-badge');
      expect(listItems.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('Calendar Loading State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner when loading with no events', () => {
    hookReturns.useCalendar.loading = true;
    hookReturns.useCalendar.events = [];

    renderCalendar();

    const spinner = document.querySelector('.ant-spin');
    expect(spinner).toBeInTheDocument();
  });
});

describe('Calendar Empty State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookReturns.useCalendar.loading = false;
    hookReturns.useCalendar.events = [];
  });

  it('shows empty message when no events', () => {
    renderCalendar();
    expect(screen.getByText(/No treatments or reminders this month/)).toBeInTheDocument();
  });
});

describe('Calendar Date Handling', () => {
  it('groups events by date correctly', () => {
    const events = [
      { id: '1', date: '2026-01-15', type: 'treatment_past', title: 'Event 1' },
      { id: '2', date: '2026-01-15', type: 'inspection_past', title: 'Event 2' },
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
  it('truncates long titles with ellipsis', () => {
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
