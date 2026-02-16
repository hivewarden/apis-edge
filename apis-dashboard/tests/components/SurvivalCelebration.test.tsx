/**
 * SurvivalCelebration Component Tests
 *
 * Tests for the 100% survival celebration component.
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report) - Task 14.4
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurvivalCelebration } from '../../src/components/SurvivalCelebration';

describe('SurvivalCelebration', () => {
  it('renders 100% survival message', () => {
    render(
      <SurvivalCelebration
        winterSeason={2025}
        survivedCount={5}
        showConfetti={false}
      />
    );

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('Winter Survival!')).toBeInTheDocument();
  });

  it('displays correct season label', () => {
    render(
      <SurvivalCelebration
        winterSeason={2025}
        survivedCount={3}
        showConfetti={false}
      />
    );

    expect(screen.getByText('2025-2026')).toBeInTheDocument();
  });

  it('shows correct hive count with singular form', () => {
    render(
      <SurvivalCelebration
        winterSeason={2025}
        survivedCount={1}
        showConfetti={false}
      />
    );

    // Check the full message containing the hive count
    expect(screen.getByText(/hive made it through winter/i)).toBeInTheDocument();
  });

  it('shows correct hive count with plural form', () => {
    render(
      <SurvivalCelebration
        winterSeason={2025}
        survivedCount={5}
        showConfetti={false}
      />
    );

    // Check the full message containing the hive count
    expect(screen.getByText(/hives made it through winter/i)).toBeInTheDocument();
  });

  it('displays congratulatory message', () => {
    render(
      <SurvivalCelebration
        winterSeason={2025}
        survivedCount={3}
        showConfetti={false}
      />
    );

    expect(screen.getByText('Great winter preparation!')).toBeInTheDocument();
  });

  it('handles different winter seasons', () => {
    const { rerender } = render(
      <SurvivalCelebration
        winterSeason={2024}
        survivedCount={2}
        showConfetti={false}
      />
    );

    expect(screen.getByText('2024-2025')).toBeInTheDocument();

    rerender(
      <SurvivalCelebration
        winterSeason={2023}
        survivedCount={4}
        showConfetti={false}
      />
    );

    expect(screen.getByText('2023-2024')).toBeInTheDocument();
  });
});
