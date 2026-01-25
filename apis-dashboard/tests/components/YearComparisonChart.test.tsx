/**
 * Tests for YearComparisonChart component
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { YearComparisonChart } from '../../src/components/YearComparisonChart';
import { YearComparison } from '../../src/hooks/useSeasonRecap';

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

const mockComparison: YearComparison = {
  previous_year: 2023,
  previous_harvest_kg: 100,
  previous_hornets: 280,
  harvest_change_percent: 25.5,
  hornets_change_percent: 22.1,
};

describe('YearComparisonChart', () => {
  it('renders the chart title', () => {
    render(
      <YearComparisonChart
        currentYear={2024}
        currentHarvestKg={125.5}
        currentHornets={342}
        comparison={mockComparison}
      />
    );

    expect(screen.getByText(/Year-over-Year Comparison/i)).toBeInTheDocument();
  });

  it('displays current year harvest', () => {
    render(
      <YearComparisonChart
        currentYear={2024}
        currentHarvestKg={125.5}
        currentHornets={342}
        comparison={mockComparison}
      />
    );

    expect(screen.getByText('125.5 kg')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('displays previous year harvest', () => {
    render(
      <YearComparisonChart
        currentYear={2024}
        currentHarvestKg={125.5}
        currentHornets={342}
        comparison={mockComparison}
      />
    );

    expect(screen.getByText('100.0 kg')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
  });

  it('displays current year hornets', () => {
    render(
      <YearComparisonChart
        currentYear={2024}
        currentHarvestKg={125.5}
        currentHornets={342}
        comparison={mockComparison}
      />
    );

    expect(screen.getByText('342')).toBeInTheDocument();
  });

  it('displays previous year hornets', () => {
    render(
      <YearComparisonChart
        currentYear={2024}
        currentHarvestKg={125.5}
        currentHornets={342}
        comparison={mockComparison}
      />
    );

    expect(screen.getByText('280')).toBeInTheDocument();
  });

  it('shows percentage change for harvest', () => {
    render(
      <YearComparisonChart
        currentYear={2024}
        currentHarvestKg={125.5}
        currentHornets={342}
        comparison={mockComparison}
      />
    );

    expect(screen.getByText(/\+25\.5%/)).toBeInTheDocument();
  });

  it('shows "less is better" hint for hornets', () => {
    render(
      <YearComparisonChart
        currentYear={2024}
        currentHarvestKg={125.5}
        currentHornets={342}
        comparison={mockComparison}
      />
    );

    expect(screen.getByText(/less is better/i)).toBeInTheDocument();
  });

  it('shows empty state when no comparison data', () => {
    render(
      <YearComparisonChart
        currentYear={2024}
        currentHarvestKg={125.5}
        currentHornets={342}
        comparison={null}
      />
    );

    expect(screen.getByText(/No previous year data available/i)).toBeInTheDocument();
  });

  it('handles negative change percentages', () => {
    const negativeComparison: YearComparison = {
      ...mockComparison,
      harvest_change_percent: -15.3,
    };

    render(
      <YearComparisonChart
        currentYear={2024}
        currentHarvestKg={84.7}
        currentHornets={342}
        comparison={negativeComparison}
      />
    );

    expect(screen.getByText(/-15\.3%/)).toBeInTheDocument();
  });

  it('handles zero values without division errors', () => {
    const zeroComparison: YearComparison = {
      previous_year: 2023,
      previous_harvest_kg: 0,
      previous_hornets: 0,
      harvest_change_percent: 0,
      hornets_change_percent: 0,
    };

    render(
      <YearComparisonChart
        currentYear={2024}
        currentHarvestKg={0}
        currentHornets={0}
        comparison={zeroComparison}
      />
    );

    // Should render without crashing
    expect(screen.getByText(/Year-over-Year Comparison/i)).toBeInTheDocument();
  });
});
