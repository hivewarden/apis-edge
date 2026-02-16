/**
 * Tests for HiveSeasonSummary component
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { HiveSeasonSummary } from '../../src/components/HiveSeasonSummary';
import { HiveSeasonStat } from '../../src/hooks/useSeasonRecap';

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

const mockStats: HiveSeasonStat[] = [
  {
    hive_id: 'hive-1',
    hive_name: 'Queen Bee Manor',
    harvest_kg: 25.5,
    status: 'healthy',
    status_detail: undefined,
    issues: [],
  },
  {
    hive_id: 'hive-2',
    hive_name: 'Honeycomb Haven',
    harvest_kg: 18.0,
    status: 'treated',
    status_detail: 'Treated for varroa mites',
    issues: ['High mite count in August'],
  },
  {
    hive_id: 'hive-3',
    hive_name: 'Buzz Palace',
    harvest_kg: 12.5,
    status: 'new_queen',
    status_detail: 'New queen installed September',
    issues: [],
  },
  {
    hive_id: 'hive-4',
    hive_name: 'Lost Colony',
    harvest_kg: 0,
    status: 'lost',
    status_detail: 'Colony absconded in October',
    issues: ['Colony collapse', 'No queen detected', 'Dwindling population'],
  },
];

describe('HiveSeasonSummary', () => {
  it('renders empty state when no stats provided', () => {
    render(<HiveSeasonSummary stats={[]} />);

    expect(screen.getByText('No hive data for this season')).toBeInTheDocument();
  });

  it('renders empty state with null stats', () => {
    render(<HiveSeasonSummary stats={null as unknown as HiveSeasonStat[]} />);

    expect(screen.getByText('No hive data for this season')).toBeInTheDocument();
  });

  it('renders hive names in the table', () => {
    render(<HiveSeasonSummary stats={mockStats} />);

    expect(screen.getByText('Queen Bee Manor')).toBeInTheDocument();
    expect(screen.getByText('Honeycomb Haven')).toBeInTheDocument();
    expect(screen.getByText('Buzz Palace')).toBeInTheDocument();
    expect(screen.getByText('Lost Colony')).toBeInTheDocument();
  });

  it('renders harvest amounts with kg suffix', () => {
    render(<HiveSeasonSummary stats={mockStats} />);

    expect(screen.getByText('25.5 kg')).toBeInTheDocument();
    expect(screen.getByText('18.0 kg')).toBeInTheDocument();
    expect(screen.getByText('12.5 kg')).toBeInTheDocument();
    expect(screen.getByText('0.0 kg')).toBeInTheDocument();
  });

  it('renders status tags with correct labels', () => {
    render(<HiveSeasonSummary stats={mockStats} />);

    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Treated')).toBeInTheDocument();
    expect(screen.getByText('New Queen')).toBeInTheDocument();
    expect(screen.getByText('Lost')).toBeInTheDocument();
  });

  it('renders status detail text when present', () => {
    render(<HiveSeasonSummary stats={mockStats} />);

    expect(screen.getByText('Treated for varroa mites')).toBeInTheDocument();
    expect(screen.getByText('New queen installed September')).toBeInTheDocument();
    expect(screen.getByText('Colony absconded in October')).toBeInTheDocument();
  });

  it('renders issues tags', () => {
    render(<HiveSeasonSummary stats={mockStats} />);

    expect(screen.getByText('High mite count in August')).toBeInTheDocument();
  });

  it('shows "+X more" when there are more than 2 issues', () => {
    render(<HiveSeasonSummary stats={mockStats} />);

    // Lost Colony has 3 issues, should show 2 and "+1 more"
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('displays summary counts in header', () => {
    render(<HiveSeasonSummary stats={mockStats} />);

    // Check for total hives and harvest
    expect(screen.getByText(/4 hives/)).toBeInTheDocument();
    expect(screen.getByText(/56.0 kg total/)).toBeInTheDocument();
  });

  it('displays status summary tags', () => {
    render(<HiveSeasonSummary stats={mockStats} />);

    expect(screen.getByText('1 healthy')).toBeInTheDocument();
    expect(screen.getByText('1 lost')).toBeInTheDocument();
    expect(screen.getByText('1 treated')).toBeInTheDocument();
    expect(screen.getByText('1 new queen')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<HiveSeasonSummary stats={mockStats} loading={true} />);

    // Ant Design Table shows loading spinner
    expect(document.querySelector('.ant-spin')).toBeInTheDocument();
  });

  it('renders table with correct columns', () => {
    render(<HiveSeasonSummary stats={mockStats} />);

    // Check column headers
    expect(screen.getByText('Hive')).toBeInTheDocument();
    expect(screen.getByText('Harvest')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Issues')).toBeInTheDocument();
  });

  it('shows "None" for hives without issues', () => {
    render(<HiveSeasonSummary stats={mockStats} />);

    // Should have "None" text for hives without issues
    const noneTexts = screen.getAllByText('None');
    expect(noneTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('handles single hive correctly', () => {
    const singleHive: HiveSeasonStat[] = [
      {
        hive_id: 'hive-1',
        hive_name: 'Solo Hive',
        harvest_kg: 10.0,
        status: 'healthy',
        issues: [],
      },
    ];

    render(<HiveSeasonSummary stats={singleHive} />);

    expect(screen.getByText('Solo Hive')).toBeInTheDocument();
    expect(screen.getByText('10.0 kg')).toBeInTheDocument();
    expect(screen.getByText(/1 hives/)).toBeInTheDocument();
  });

  it('renders card with title', () => {
    render(<HiveSeasonSummary stats={mockStats} />);

    expect(screen.getByText('Per-Hive Breakdown')).toBeInTheDocument();
  });
});
