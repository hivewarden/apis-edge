/**
 * OverwinteringSurvey Page Tests
 *
 * Tests for the overwintering survey page.
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report) - Task 14.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { OverwinteringSurvey } from '../../src/pages/OverwinteringSurvey';

// Mock the hooks
vi.mock('../../src/hooks/useOverwintering', () => ({
  useOverwinteringHives: vi.fn(),
  submitOverwinteringRecord: vi.fn(),
  getSeasonLabel: (season: number) => `${season}-${season + 1}`,
}));

// Get the mocked hook
import { useOverwinteringHives, submitOverwinteringRecord } from '../../src/hooks/useOverwintering';
const mockedUseOverwinteringHives = vi.mocked(useOverwinteringHives);
const mockedSubmitOverwinteringRecord = vi.mocked(submitOverwinteringRecord);

describe('OverwinteringSurvey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    mockedUseOverwinteringHives.mockReturnValue({
      hives: [],
      total: 0,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <OverwinteringSurvey />
      </BrowserRouter>
    );

    expect(screen.getByText('Loading hives...')).toBeInTheDocument();
  });

  it('shows empty state when no hives', async () => {
    mockedUseOverwinteringHives.mockReturnValue({
      hives: [],
      total: 0,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <OverwinteringSurvey />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No hives found for this winter season')).toBeInTheDocument();
    });
  });

  it('shows error state on error', () => {
    mockedUseOverwinteringHives.mockReturnValue({
      hives: [],
      total: 0,
      loading: false,
      error: new Error('Failed to load'),
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <OverwinteringSurvey />
      </BrowserRouter>
    );

    expect(screen.getByText('Failed to load hives')).toBeInTheDocument();
  });

  it('renders hive cards when hives are loaded', async () => {
    mockedUseOverwinteringHives.mockReturnValue({
      hives: [
        { hive_id: 'hive-1', hive_name: 'Test Hive 1' },
        { hive_id: 'hive-2', hive_name: 'Test Hive 2' },
      ],
      total: 2,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <OverwinteringSurvey />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Hive 1')).toBeInTheDocument();
      expect(screen.getByText('Test Hive 2')).toBeInTheDocument();
    });
  });

  it('shows "Mark All as Survived" button', async () => {
    mockedUseOverwinteringHives.mockReturnValue({
      hives: [
        { hive_id: 'hive-1', hive_name: 'Test Hive 1' },
      ],
      total: 1,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <OverwinteringSurvey />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Mark All as Survived')).toBeInTheDocument();
    });
  });

  it('shows progress counter', async () => {
    mockedUseOverwinteringHives.mockReturnValue({
      hives: [
        { hive_id: 'hive-1', hive_name: 'Test Hive 1' },
        { hive_id: 'hive-2', hive_name: 'Test Hive 2' },
      ],
      total: 2,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <OverwinteringSurvey />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('0 of 2 hives recorded')).toBeInTheDocument();
    });
  });

  it('disables submit button when not all hives have status', async () => {
    mockedUseOverwinteringHives.mockReturnValue({
      hives: [
        { hive_id: 'hive-1', hive_name: 'Test Hive 1' },
      ],
      total: 1,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <BrowserRouter>
        <OverwinteringSurvey />
      </BrowserRouter>
    );

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /hives remaining/i });
      expect(submitButton).toBeDisabled();
    });
  });

  it('displays season label in title', async () => {
    mockedUseOverwinteringHives.mockReturnValue({
      hives: [],
      total: 0,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    // Use a URL with season param
    window.history.pushState({}, '', '?season=2025');

    render(
      <BrowserRouter>
        <OverwinteringSurvey />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Winter 2025-2026/)).toBeInTheDocument();
    });
  });
});
