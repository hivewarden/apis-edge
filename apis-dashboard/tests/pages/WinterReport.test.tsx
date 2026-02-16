/**
 * WinterReport Page Tests
 *
 * Tests for the winter report page.
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report) - Task 14.2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { WinterReport } from '../../src/pages/WinterReport';

// Mock the hooks
vi.mock('../../src/hooks/useOverwintering', () => ({
  useWinterReport: vi.fn(),
  useSurvivalTrends: vi.fn(),
  useAvailableWinters: vi.fn(),
  getSeasonLabel: (season: number) => `${season}-${season + 1}`,
  getConditionDisplay: (condition: string) => condition.charAt(0).toUpperCase() + condition.slice(1),
  getStoresDisplay: (stores: string) => stores.charAt(0).toUpperCase() + stores.slice(1),
}));

import { useWinterReport, useSurvivalTrends, useAvailableWinters } from '../../src/hooks/useOverwintering';
const mockedUseWinterReport = vi.mocked(useWinterReport);
const mockedUseSurvivalTrends = vi.mocked(useSurvivalTrends);
const mockedUseAvailableWinters = vi.mocked(useAvailableWinters);

describe('WinterReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockedUseSurvivalTrends.mockReturnValue({
      trends: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    mockedUseAvailableWinters.mockReturnValue({
      seasons: [2025, 2024],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('shows loading state', () => {
    mockedUseWinterReport.mockReturnValue({
      report: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <WinterReport />
      </BrowserRouter>
    );

    expect(screen.getByText('Loading winter report...')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    mockedUseWinterReport.mockReturnValue({
      report: null,
      loading: false,
      error: new Error('Failed to load'),
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <WinterReport />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load winter report')).toBeInTheDocument();
    });
  });

  it('shows empty state when no data', async () => {
    mockedUseWinterReport.mockReturnValue({
      report: {
        winter_season: 2025,
        season_label: '2025-2026',
        total_hives: 0,
        survived_count: 0,
        lost_count: 0,
        weak_count: 0,
        survival_rate: 0,
        is_100_percent: false,
        lost_hives: [],
        survived_hives: [],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <WinterReport />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No overwintering data/)).toBeInTheDocument();
    });
  });

  it('displays survival rate', async () => {
    mockedUseWinterReport.mockReturnValue({
      report: {
        winter_season: 2025,
        season_label: '2025-2026',
        total_hives: 3,
        survived_count: 2,
        lost_count: 1,
        weak_count: 0,
        survival_rate: 66.67,
        is_100_percent: false,
        lost_hives: [
          { hive_id: 'hive-3', hive_name: 'Lost Hive', cause: 'starvation', cause_display: 'Starvation', has_post_mortem: true },
        ],
        survived_hives: [
          { hive_id: 'hive-1', hive_name: 'Hive 1', condition: 'strong', condition_display: 'Strong', stores_remaining: 'adequate', stores_display: 'Adequate' },
          { hive_id: 'hive-2', hive_name: 'Hive 2', condition: 'medium', condition_display: 'Medium', stores_remaining: 'low', stores_display: 'Low' },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <WinterReport />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Survival Rate')).toBeInTheDocument();
      expect(screen.getByText('67%')).toBeInTheDocument(); // Rounded
    });
  });

  it('shows 100% survival celebration when all hives survived', async () => {
    mockedUseWinterReport.mockReturnValue({
      report: {
        winter_season: 2025,
        season_label: '2025-2026',
        total_hives: 3,
        survived_count: 3,
        lost_count: 0,
        weak_count: 0,
        survival_rate: 100,
        is_100_percent: true,
        lost_hives: [],
        survived_hives: [
          { hive_id: 'hive-1', hive_name: 'Hive 1', condition: 'strong' },
          { hive_id: 'hive-2', hive_name: 'Hive 2', condition: 'strong' },
          { hive_id: 'hive-3', hive_name: 'Hive 3', condition: 'medium' },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <WinterReport />
      </BrowserRouter>
    );

    await waitFor(() => {
      // Multiple "100%" elements exist (celebration + progress circle) - just check celebration is shown
      expect(screen.getByText('Winter Survival!')).toBeInTheDocument();
      expect(screen.getByText('Great winter preparation!')).toBeInTheDocument();
    });
  });

  it('displays lost hives section', async () => {
    mockedUseWinterReport.mockReturnValue({
      report: {
        winter_season: 2025,
        season_label: '2025-2026',
        total_hives: 2,
        survived_count: 1,
        lost_count: 1,
        weak_count: 0,
        survival_rate: 50,
        is_100_percent: false,
        lost_hives: [
          { hive_id: 'hive-2', hive_name: 'Lost Hive', cause: 'starvation', cause_display: 'Starvation', has_post_mortem: true },
        ],
        survived_hives: [
          { hive_id: 'hive-1', hive_name: 'Hive 1', condition: 'strong' },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <WinterReport />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Lost Hives (1)')).toBeInTheDocument();
      expect(screen.getByText('Lost Hive')).toBeInTheDocument();
      expect(screen.getByText(/Starvation/)).toBeInTheDocument();
    });
  });

  it('displays survived hives section', async () => {
    mockedUseWinterReport.mockReturnValue({
      report: {
        winter_season: 2025,
        season_label: '2025-2026',
        total_hives: 1,
        survived_count: 1,
        lost_count: 0,
        weak_count: 0,
        survival_rate: 100,
        is_100_percent: true,
        lost_hives: [],
        survived_hives: [
          { hive_id: 'hive-1', hive_name: 'Healthy Hive', condition: 'strong', condition_display: 'Strong', stores_remaining: 'plenty', stores_display: 'Plenty' },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <WinterReport />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Survived Hives (1)')).toBeInTheDocument();
      expect(screen.getByText('Healthy Hive')).toBeInTheDocument();
    });
  });

  it('shows historical comparison when available', async () => {
    mockedUseWinterReport.mockReturnValue({
      report: {
        winter_season: 2025,
        season_label: '2025-2026',
        total_hives: 2,
        survived_count: 2,
        lost_count: 0,
        weak_count: 0,
        survival_rate: 100,
        is_100_percent: true,
        lost_hives: [],
        survived_hives: [],
        comparison: {
          previous_season: 2024,
          previous_season_label: '2024-2025',
          previous_survival_rate: 50,
          change_percent: 50,
          improved: true,
        },
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <WinterReport />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Compared to Last Winter')).toBeInTheDocument();
      expect(screen.getByText('2024-2025')).toBeInTheDocument();
      expect(screen.getByText(/Improvement/)).toBeInTheDocument();
    });
  });

  it('shows decline comparison when survival rate decreased', async () => {
    mockedUseWinterReport.mockReturnValue({
      report: {
        winter_season: 2025,
        season_label: '2025-2026',
        total_hives: 2,
        survived_count: 1,
        lost_count: 1,
        weak_count: 0,
        survival_rate: 50,
        is_100_percent: false,
        lost_hives: [],
        survived_hives: [],
        comparison: {
          previous_season: 2024,
          previous_season_label: '2024-2025',
          previous_survival_rate: 100,
          change_percent: -50,
          improved: false,
        },
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <WinterReport />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Decline/)).toBeInTheDocument();
    });
  });
});
