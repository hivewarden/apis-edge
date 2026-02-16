/**
 * HiveWinterStatusCard Component Tests
 *
 * Tests for the hive winter status card component used in the overwintering survey.
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report) - Task 14.3
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { HiveWinterStatusCard, type HiveWinterData } from '../../src/components/HiveWinterStatusCard';
import type { HiveWithRecord } from '../../src/hooks/useOverwintering';

const mockHive: HiveWithRecord = {
  hive_id: 'hive-1',
  hive_name: 'Test Hive 1',
};

const mockHiveWithRecord: HiveWithRecord = {
  hive_id: 'hive-2',
  hive_name: 'Test Hive 2',
  existing_record: {
    id: 'record-1',
    hive_id: 'hive-2',
    hive_name: 'Test Hive 2',
    winter_season: 2025,
    survived: true,
    condition: 'strong',
    stores_remaining: 'adequate',
    first_inspection_notes: 'Looking good',
    recorded_at: '2026-03-15',
    created_at: '2026-03-15T10:00:00Z',
  },
};

const defaultData: HiveWinterData = {
  hiveId: 'hive-1',
  hiveName: 'Test Hive 1',
  status: null,
};

const renderCard = (
  hive: HiveWithRecord,
  data: HiveWinterData,
  onChange = vi.fn()
) => {
  return render(
    <BrowserRouter>
      <HiveWinterStatusCard
        hive={hive}
        data={data}
        onChange={onChange}
        winterSeason={2025}
      />
    </BrowserRouter>
  );
};

describe('HiveWinterStatusCard', () => {
  it('renders hive name', () => {
    renderCard(mockHive, defaultData);
    expect(screen.getByText('Test Hive 1')).toBeInTheDocument();
  });

  it('renders status options', () => {
    renderCard(mockHive, defaultData);
    expect(screen.getByText('Survived')).toBeInTheDocument();
    expect(screen.getByText('Lost')).toBeInTheDocument();
    expect(screen.getByText('Weak')).toBeInTheDocument();
  });

  it('shows "Previously Recorded" tag for hives with existing records', () => {
    renderCard(mockHiveWithRecord, {
      hiveId: 'hive-2',
      hiveName: 'Test Hive 2',
      status: 'survived',
    });
    expect(screen.getByText('Previously Recorded')).toBeInTheDocument();
  });

  it('calls onChange when status is selected', () => {
    const onChange = vi.fn();
    renderCard(mockHive, defaultData, onChange);

    const survivedButton = screen.getByRole('radio', { name: /Survived/i });
    fireEvent.click(survivedButton);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'survived',
      })
    );
  });

  it('shows post-mortem link when status is lost', () => {
    renderCard(mockHive, {
      ...defaultData,
      status: 'lost',
    });

    expect(screen.getByText(/post-mortem wizard/i)).toBeInTheDocument();
  });

  it('shows details section when status is survived', () => {
    renderCard(mockHive, {
      ...defaultData,
      status: 'survived',
    });

    expect(screen.getByText('First Inspection Details')).toBeInTheDocument();
    expect(screen.getByText('Colony Strength')).toBeInTheDocument();
    expect(screen.getByText('Stores Remaining')).toBeInTheDocument();
  });

  it('shows details section when status is weak', () => {
    renderCard(mockHive, {
      ...defaultData,
      status: 'weak',
    });

    expect(screen.getByText('Colony Strength')).toBeInTheDocument();
  });

  it('does not show details section when status is null', () => {
    renderCard(mockHive, defaultData);
    expect(screen.queryByText('Colony Strength')).not.toBeInTheDocument();
  });

  it('calls onChange with condition when selected', () => {
    const onChange = vi.fn();
    renderCard(
      mockHive,
      {
        ...defaultData,
        status: 'survived',
      },
      onChange
    );

    const strongRadio = screen.getByRole('radio', { name: 'Strong' });
    fireEvent.click(strongRadio);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        condition: 'strong',
      })
    );
  });

  it('calls onChange with stores when selected', () => {
    const onChange = vi.fn();
    renderCard(
      mockHive,
      {
        ...defaultData,
        status: 'survived',
      },
      onChange
    );

    const adequateRadio = screen.getByRole('radio', { name: 'Adequate' });
    fireEvent.click(adequateRadio);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        storesRemaining: 'adequate',
      })
    );
  });

  it('disables inputs when disabled prop is true', () => {
    render(
      <BrowserRouter>
        <HiveWinterStatusCard
          hive={mockHive}
          data={defaultData}
          onChange={vi.fn()}
          winterSeason={2025}
          disabled={true}
        />
      </BrowserRouter>
    );

    const survivedButton = screen.getByRole('radio', { name: /Survived/i });
    expect(survivedButton).toBeDisabled();
  });
});
