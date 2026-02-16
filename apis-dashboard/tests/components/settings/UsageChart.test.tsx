/**
 * Tests for UsageChart component
 *
 * Part of Epic 13, Story 13-19 (Tenant Settings UI)
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageChart } from '../../../src/components/settings/UsageChart';
import type { UsageInfo, LimitsInfo, PercentagesInfo } from '../../../src/hooks/useTenantSettings';

const mockUsage: UsageInfo = {
  hive_count: 8,
  unit_count: 2,
  user_count: 3,
  storage_bytes: 512 * 1024 * 1024, // 512 MB
};

const mockLimits: LimitsInfo = {
  max_hives: 10,
  max_units: 5,
  max_users: 5,
  max_storage_bytes: 1024 * 1024 * 1024, // 1 GB
};

const mockPercentages: PercentagesInfo = {
  hives_percent: 80,
  units_percent: 40,
  users_percent: 60,
  storage_percent: 50,
};

describe('UsageChart', () => {
  it('renders all resource types', () => {
    render(
      <UsageChart
        usage={mockUsage}
        limits={mockLimits}
        percentages={mockPercentages}
      />
    );

    expect(screen.getByText('Hives')).toBeInTheDocument();
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
  });

  it('displays usage counts and percentages', () => {
    render(
      <UsageChart
        usage={mockUsage}
        limits={mockLimits}
        percentages={mockPercentages}
      />
    );

    // Check hives display: "8 / 10 (80%)"
    expect(screen.getByText(/8 \/ 10/)).toBeInTheDocument();
    expect(screen.getByText(/80%/)).toBeInTheDocument();

    // Check units display: "2 / 5 (40%)"
    expect(screen.getByText(/2 \/ 5/)).toBeInTheDocument();
    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });

  it('formats storage in human-readable format', () => {
    render(
      <UsageChart
        usage={mockUsage}
        limits={mockLimits}
        percentages={mockPercentages}
      />
    );

    // Storage should show "512 MB / 1.0 GB (50%)"
    expect(screen.getByText(/512 MB \/ 1\.0 GB/)).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it('renders with zero usage', () => {
    const zeroUsage: UsageInfo = {
      hive_count: 0,
      unit_count: 0,
      user_count: 0,
      storage_bytes: 0,
    };

    const zeroPercentages: PercentagesInfo = {
      hives_percent: 0,
      units_percent: 0,
      users_percent: 0,
      storage_percent: 0,
    };

    render(
      <UsageChart
        usage={zeroUsage}
        limits={mockLimits}
        percentages={zeroPercentages}
      />
    );

    // Check that zero hives are displayed
    expect(screen.getByText(/0 \/ 10/)).toBeInTheDocument();
    // Check that zero units/users are displayed (both have max 5, use getAllByText)
    expect(screen.getAllByText(/0 \/ 5/).length).toBe(2);
  });

  it('renders warning zone correctly (80-94%)', () => {
    const warningPercentages: PercentagesInfo = {
      hives_percent: 90,
      units_percent: 80,
      users_percent: 85,
      storage_percent: 92,
    };

    render(
      <UsageChart
        usage={mockUsage}
        limits={mockLimits}
        percentages={warningPercentages}
      />
    );

    // Progress bars should render - we can't easily test colors in JSDOM
    // but we verify the component renders without errors
    expect(screen.getByText('Hives')).toBeInTheDocument();
    expect(screen.getByText(/90%/)).toBeInTheDocument();
  });

  it('renders danger zone correctly (95%+)', () => {
    const dangerPercentages: PercentagesInfo = {
      hives_percent: 98,
      units_percent: 100,
      users_percent: 95,
      storage_percent: 99,
    };

    render(
      <UsageChart
        usage={mockUsage}
        limits={mockLimits}
        percentages={dangerPercentages}
      />
    );

    // Verify high percentages are shown
    expect(screen.getByText(/98%/)).toBeInTheDocument();
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });
});
