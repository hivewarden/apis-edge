/**
 * Tests for SeasonRecapCard component
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeasonRecapCard } from '../../src/components/SeasonRecapCard';
import { SeasonRecap } from '../../src/hooks/useSeasonRecap';

// Mock theme
vi.mock('../../src/theme/apisTheme', () => ({
  colors: {
    coconutCream: '#fefbe8',
    seaBuckthorn: '#f5a524',
    salomie: '#fedc8c',
    brownBramble: '#5c3c10',
    goldTips: '#d4a012',
    goldenGrass: '#daa520',
  },
}));

const mockRecap: SeasonRecap = {
  id: 'recap-1',
  tenant_id: 'tenant-1',
  season_year: 2024,
  hemisphere: 'northern',
  season_dates: {
    start: '2024-03-01',
    end: '2024-09-30',
    display_text: 'March 1 - September 30, 2024',
  },
  total_harvest_kg: 125.5,
  hornets_deterred: 342,
  inspections_count: 24,
  treatments_count: 3,
  feedings_count: 8,
  hives_active: 5,
  per_hive_stats: [],
  milestones: [
    {
      type: 'first_harvest',
      date: '2024-05-15',
      description: 'First honey harvest of the season',
    },
  ],
  comparison_data: null,
  generated_at: '2024-11-01T10:00:00Z',
};

describe('SeasonRecapCard', () => {
  it('renders the season year', () => {
    render(<SeasonRecapCard recap={mockRecap} />);

    expect(screen.getByText(/Season Recap 2024/i)).toBeInTheDocument();
  });

  it('displays total harvest stat', () => {
    render(<SeasonRecapCard recap={mockRecap} />);

    // Uses Ant Design Statistic - value and suffix are separate
    expect(screen.getByText('125.5')).toBeInTheDocument();
    expect(screen.getByText('kg')).toBeInTheDocument();
    expect(screen.getByText('Harvest')).toBeInTheDocument();
  });

  it('displays hornets deterred count', () => {
    render(<SeasonRecapCard recap={mockRecap} />);

    expect(screen.getByText('342')).toBeInTheDocument();
    expect(screen.getByText('Hornets Deterred')).toBeInTheDocument();
  });

  it('displays inspection count', () => {
    render(<SeasonRecapCard recap={mockRecap} />);

    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('Inspections')).toBeInTheDocument();
  });

  it('displays milestones when present', () => {
    render(<SeasonRecapCard recap={mockRecap} />);

    expect(screen.getByText('First honey harvest of the season')).toBeInTheDocument();
  });

  it('renders in compact mode without milestones details', () => {
    render(<SeasonRecapCard recap={mockRecap} compact />);

    // Stats should still be visible
    expect(screen.getByText('125.5')).toBeInTheDocument();
    expect(screen.getByText('342')).toBeInTheDocument();
    // Milestones should NOT be shown in compact mode
    expect(screen.queryByText('First honey harvest of the season')).not.toBeInTheDocument();
  });

  it('handles zero values gracefully', () => {
    const emptyRecap: SeasonRecap = {
      ...mockRecap,
      total_harvest_kg: 0,
      hornets_deterred: 0,
      inspections_count: 0,
    };

    render(<SeasonRecapCard recap={emptyRecap} />);

    // Should show zeros without crashing
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it('displays season date text', () => {
    render(<SeasonRecapCard recap={mockRecap} />);

    expect(screen.getByText('March 1 - September 30, 2024')).toBeInTheDocument();
  });

  it('shows footer with APIS branding', () => {
    render(<SeasonRecapCard recap={mockRecap} />);

    expect(screen.getByText(/Generated with APIS/i)).toBeInTheDocument();
  });
});
