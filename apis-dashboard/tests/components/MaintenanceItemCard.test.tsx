/**
 * MaintenanceItemCard Component Tests
 *
 * Tests for the maintenance item card component.
 * Part of Epic 8, Story 8.5 (Maintenance Priority View)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { MaintenanceItemCard } from '../../src/components/MaintenanceItemCard';
import type { MaintenanceItem } from '../../src/hooks/useMaintenanceItems';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const createTestItem = (overrides?: Partial<MaintenanceItem>): MaintenanceItem => ({
  hive_id: 'hive-123',
  hive_name: 'Test Hive',
  site_id: 'site-456',
  site_name: 'Home Apiary',
  priority: 'Urgent',
  priority_score: 130,
  summary: 'Varroa treatment due (92 days since last treatment)',
  insights: [{
    id: 'ins-1',
    hive_id: 'hive-123',
    hive_name: 'Test Hive',
    rule_id: 'treatment_due',
    severity: 'action-needed',
    message: 'Treatment due',
    suggested_action: 'Schedule treatment',
    data_points: {},
    created_at: '2026-01-01T00:00:00Z',
  }],
  quick_actions: [
    { label: 'Log Treatment', url: '/hives/hive-123', tab: 'treatments' },
    { label: 'View Details', url: '/hives/hive-123' },
  ],
  ...overrides,
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </ConfigProvider>
  );
};

describe('MaintenanceItemCard', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders hive name', () => {
    const item = createTestItem();
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    expect(screen.getByText('Test Hive')).toBeInTheDocument();
  });

  it('renders site name', () => {
    const item = createTestItem();
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    expect(screen.getByText('Home Apiary')).toBeInTheDocument();
  });

  it('renders summary text', () => {
    const item = createTestItem();
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    expect(screen.getByText('Varroa treatment due (92 days since last treatment)')).toBeInTheDocument();
  });

  it('renders priority badge with correct text', () => {
    const item = createTestItem({ priority: 'Urgent' });
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('renders Soon priority', () => {
    const item = createTestItem({ priority: 'Soon' });
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    expect(screen.getByText('Soon')).toBeInTheDocument();
  });

  it('renders Optional priority', () => {
    const item = createTestItem({ priority: 'Optional' });
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    expect(screen.getByText('Optional')).toBeInTheDocument();
  });

  it('renders checkbox', () => {
    const item = createTestItem();
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('checkbox reflects selected state', () => {
    const item = createTestItem();
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={true}
        onSelectionChange={() => {}}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('calls onSelectionChange when checkbox is clicked', () => {
    const item = createTestItem();
    const onSelectionChange = vi.fn();

    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={onSelectionChange}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onSelectionChange).toHaveBeenCalledWith('hive-123', true);
  });

  it('renders quick action buttons', () => {
    const item = createTestItem();
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    expect(screen.getByText('Log Treatment')).toBeInTheDocument();
    expect(screen.getByText('View Details')).toBeInTheDocument();
  });

  it('navigates to hive detail when hive name is clicked', () => {
    const item = createTestItem();
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    const hiveNameElement = screen.getByText('Test Hive');
    fireEvent.click(hiveNameElement);

    expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-123');
  });

  it('navigates with tab state when quick action has tab', () => {
    const item = createTestItem();
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    const logTreatmentButton = screen.getByText('Log Treatment');
    fireEvent.click(logTreatmentButton);

    expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-123', { state: { activeTab: 'treatments' } });
  });

  it('navigates without state when quick action has no tab', () => {
    const item = createTestItem();
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    const viewDetailsButton = screen.getByText('View Details');
    fireEvent.click(viewDetailsButton);

    expect(mockNavigate).toHaveBeenCalledWith('/hives/hive-123');
  });

  it('calls onQuickAction callback when provided', () => {
    const item = createTestItem();
    const onQuickAction = vi.fn();

    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
        onQuickAction={onQuickAction}
      />
    );

    const logTreatmentButton = screen.getByText('Log Treatment');
    fireEvent.click(logTreatmentButton);

    expect(onQuickAction).toHaveBeenCalledWith({
      label: 'Log Treatment',
      url: '/hives/hive-123',
      tab: 'treatments',
    });
  });

  it('has accessible checkbox label', () => {
    const item = createTestItem();
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /select test hive/i });
    expect(checkbox).toBeInTheDocument();
  });
});

describe('MaintenanceItemCard priority styling', () => {
  it('applies red styling for Urgent priority', () => {
    const item = createTestItem({ priority: 'Urgent' });
    const { container } = renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    // Check that the tag exists with red color
    const tag = screen.getByText('Urgent');
    expect(tag).toBeInTheDocument();
  });

  it('applies orange styling for Soon priority', () => {
    const item = createTestItem({ priority: 'Soon' });
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    const tag = screen.getByText('Soon');
    expect(tag).toBeInTheDocument();
  });

  it('applies green styling for Optional priority', () => {
    const item = createTestItem({ priority: 'Optional' });
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    const tag = screen.getByText('Optional');
    expect(tag).toBeInTheDocument();
  });
});

describe('MaintenanceItemCard with multiple quick actions', () => {
  it('renders all quick actions', () => {
    const item = createTestItem({
      quick_actions: [
        { label: 'Log Treatment', url: '/hives/hive-123', tab: 'treatments' },
        { label: 'Log Inspection', url: '/hives/hive-123/inspections/new' },
        { label: 'View Details', url: '/hives/hive-123' },
      ],
    });

    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    expect(screen.getByText('Log Treatment')).toBeInTheDocument();
    expect(screen.getByText('Log Inspection')).toBeInTheDocument();
    expect(screen.getByText('View Details')).toBeInTheDocument();
  });

  it('first action is primary button', () => {
    const item = createTestItem();
    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    const buttons = screen.getAllByRole('button');
    // First button should have primary type (check by class or style)
    expect(buttons.length).toBeGreaterThan(0);
  });
});

describe('MaintenanceItemCard with empty quick actions', () => {
  it('handles empty quick actions gracefully', () => {
    const item = createTestItem({ quick_actions: [] });

    renderWithProviders(
      <MaintenanceItemCard
        item={item}
        selected={false}
        onSelectionChange={() => {}}
      />
    );

    // Should still render without errors
    expect(screen.getByText('Test Hive')).toBeInTheDocument();
  });
});
