/**
 * HiveLossSummary Component Tests
 *
 * Tests for the card component that displays hive loss post-mortem details.
 * Part of Epic 9, Story 9.3 (Hive Loss Post-Mortem)
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HiveLossSummary } from '../../src/components/HiveLossSummary';
import type { HiveLoss } from '../../src/hooks/useHiveLoss';

const createMockLoss = (overrides: Partial<HiveLoss> = {}): HiveLoss => ({
  id: 'loss-123',
  hive_id: 'hive-456',
  discovered_at: '2026-01-20',
  cause: 'varroa',
  cause_display: 'Varroa/Mites',
  cause_other: undefined,
  symptoms: ['deformed_wings', 'dead_brood'],
  symptoms_display: ['Deformed wings visible', 'Dead brood pattern'],
  symptoms_notes: 'Found many mites on inspection board',
  reflection: 'Should have treated earlier in the season',
  data_choice: 'archive',
  created_at: '2026-01-20T10:00:00Z',
  ...overrides,
});

describe('HiveLossSummary', () => {
  describe('Full Display Mode', () => {
    it('renders the loss record header', () => {
      render(<HiveLossSummary loss={createMockLoss()} />);

      expect(screen.getByText('Loss Record')).toBeInTheDocument();
    });

    it('displays the discovery date', () => {
      render(<HiveLossSummary loss={createMockLoss({ discovered_at: '2026-01-20' })} />);

      expect(screen.getByText(/Discovered January 20, 2026/)).toBeInTheDocument();
    });

    it('displays the cause with display name', () => {
      render(<HiveLossSummary loss={createMockLoss({
        cause: 'varroa',
        cause_display: 'Varroa/Mites',
      })} />);

      expect(screen.getByText(/Probable Cause: Varroa\/Mites/)).toBeInTheDocument();
    });

    it('shows cause_other when cause is "other"', () => {
      render(<HiveLossSummary loss={createMockLoss({
        cause: 'other',
        cause_display: 'Other',
        cause_other: 'Bear attack',
      })} />);

      expect(screen.getByText('Bear attack')).toBeInTheDocument();
    });

    it('displays symptoms with display names', () => {
      render(<HiveLossSummary loss={createMockLoss({
        symptoms_display: ['Deformed wings visible', 'Dead brood pattern'],
      })} />);

      expect(screen.getByText('Deformed wings visible')).toBeInTheDocument();
      expect(screen.getByText('Dead brood pattern')).toBeInTheDocument();
    });

    it('displays symptoms notes in italics', () => {
      render(<HiveLossSummary loss={createMockLoss({
        symptoms_notes: 'Found many mites on inspection board',
      })} />);

      expect(screen.getByText(/"Found many mites on inspection board"/)).toBeInTheDocument();
    });

    it('displays reflection section', () => {
      render(<HiveLossSummary loss={createMockLoss({
        reflection: 'Should have treated earlier',
      })} />);

      expect(screen.getByText('Reflection')).toBeInTheDocument();
      expect(screen.getByText(/"Should have treated earlier"/)).toBeInTheDocument();
    });

    it('shows archive message when data_choice is archive', () => {
      render(<HiveLossSummary loss={createMockLoss({ data_choice: 'archive' })} />);

      expect(screen.getByText('Historical data has been preserved for reference.')).toBeInTheDocument();
    });

    it('shows delete message when data_choice is delete', () => {
      render(<HiveLossSummary loss={createMockLoss({ data_choice: 'delete' })} />);

      expect(screen.getByText('This hive has been removed from your active list.')).toBeInTheDocument();
    });

    it('hides symptoms section when no symptoms', () => {
      render(<HiveLossSummary loss={createMockLoss({
        symptoms: [],
        symptoms_display: [],
      })} />);

      expect(screen.queryByText('Observed Symptoms')).not.toBeInTheDocument();
    });

    it('hides reflection section when not provided', () => {
      render(<HiveLossSummary loss={createMockLoss({
        reflection: null,
      })} />);

      expect(screen.queryByText('Reflection')).not.toBeInTheDocument();
    });
  });

  describe('Compact Display Mode', () => {
    it('shows cause and date in compact format', () => {
      render(<HiveLossSummary loss={createMockLoss({
        cause_display: 'Varroa/Mites',
        discovered_at: '2026-01-20',
      })} compact />);

      expect(screen.getByText(/Varroa\/Mites - January 20, 2026/)).toBeInTheDocument();
    });

    it('shows limited symptoms in compact mode', () => {
      render(<HiveLossSummary loss={createMockLoss({
        symptoms_display: ['Symptom 1', 'Symptom 2', 'Symptom 3', 'Symptom 4', 'Symptom 5'],
      })} compact />);

      // First 3 symptoms should be visible
      expect(screen.getByText('Symptom 1')).toBeInTheDocument();
      expect(screen.getByText('Symptom 2')).toBeInTheDocument();
      expect(screen.getByText('Symptom 3')).toBeInTheDocument();
      // Should show "+2 more"
      expect(screen.getByText('+2 more')).toBeInTheDocument();
    });

    it('does not show Loss Record header in compact mode', () => {
      render(<HiveLossSummary loss={createMockLoss()} compact />);

      expect(screen.queryByText('Loss Record')).not.toBeInTheDocument();
    });
  });
});
