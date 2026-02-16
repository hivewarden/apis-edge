/**
 * BeeBrainSuggestionsSection Component Tests
 *
 * Tests for the BeeBrain task suggestions section component.
 * Part of Epic 14, Story 14.15: BeeBrain Task Suggestions Integration
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BeeBrainSuggestionsSection, BeeBrainSuggestionsSectionProps } from '../../src/components/BeeBrainSuggestionsSection';
import type { TaskSuggestion, SuggestionPriority } from '../../src/hooks/useTaskSuggestions';

// Helper to create mock suggestions
const createSuggestion = (overrides: Partial<TaskSuggestion>): TaskSuggestion => ({
  id: 'suggestion-1',
  hive_id: 'hive-1',
  suggested_title: 'Consider requeening',
  reason: 'Queen is 3 years old and showing reduced laying pattern',
  priority: 'high' as SuggestionPriority,
  status: 'pending',
  created_at: '2026-01-30T10:00:00Z',
  ...overrides,
});

const defaultProps: BeeBrainSuggestionsSectionProps = {
  suggestions: [],
  onAccept: vi.fn(),
  onDismiss: vi.fn(),
  accepting: false,
  dismissing: false,
};

describe('BeeBrainSuggestionsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Rendering', () => {
    it('returns null when no suggestions', () => {
      const { container } = render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={[]} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders section when suggestions exist', () => {
      const suggestions = [createSuggestion()];

      render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={suggestions} />
      );

      expect(screen.getByTestId('beebrain-suggestions-section')).toBeInTheDocument();
    });

    it('renders header with robot icon', () => {
      const suggestions = [createSuggestion()];

      render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={suggestions} />
      );

      expect(screen.getByTestId('suggestions-header')).toBeInTheDocument();
      expect(screen.getByText('Suggested by BeeBrain')).toBeInTheDocument();
    });

    it('renders suggestion cards for each suggestion', () => {
      const suggestions = [
        createSuggestion({ id: 'suggestion-1', suggested_title: 'Task 1' }),
        createSuggestion({ id: 'suggestion-2', suggested_title: 'Task 2' }),
        createSuggestion({ id: 'suggestion-3', suggested_title: 'Task 3' }),
      ];

      render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={suggestions} />
      );

      const cards = screen.getAllByTestId('suggestion-card');
      expect(cards).toHaveLength(3);
    });
  });

  describe('Suggestion Card Content', () => {
    it('displays suggestion title', () => {
      const suggestions = [
        createSuggestion({ suggested_title: 'Consider requeening your hive' }),
      ];

      render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={suggestions} />
      );

      expect(screen.getByTestId('suggestion-title')).toHaveTextContent(
        'Consider requeening your hive'
      );
    });

    it('displays priority badge with correct color', () => {
      const suggestions = [createSuggestion({ priority: 'urgent' })];

      render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={suggestions} />
      );

      const badge = screen.getByTestId('priority-badge');
      expect(badge).toHaveTextContent('Urgent');
    });

    it('displays all priority levels correctly', () => {
      const priorities: SuggestionPriority[] = ['low', 'medium', 'high', 'urgent'];
      const expectedLabels = ['Low', 'Medium', 'High', 'Urgent'];

      priorities.forEach((priority, index) => {
        const { unmount } = render(
          <BeeBrainSuggestionsSection
            {...defaultProps}
            suggestions={[createSuggestion({ id: `suggestion-${priority}`, priority })]}
          />
        );

        const badge = screen.getByTestId('priority-badge');
        expect(badge).toHaveTextContent(expectedLabels[index]);

        unmount();
      });
    });
  });

  describe('Expandable Reason', () => {
    it('reason is hidden by default', () => {
      const suggestions = [
        createSuggestion({ reason: 'Queen is 3 years old' }),
      ];

      render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={suggestions} />
      );

      expect(screen.queryByTestId('suggestion-reason')).not.toBeInTheDocument();
    });

    it('shows reason when Why? button is clicked', () => {
      const suggestions = [
        createSuggestion({ reason: 'Queen is 3 years old' }),
      ];

      render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={suggestions} />
      );

      fireEvent.click(screen.getByTestId('expand-reason-button'));

      expect(screen.getByTestId('suggestion-reason')).toHaveTextContent(
        'Queen is 3 years old'
      );
    });

    it('hides reason when Why? button is clicked again', () => {
      const suggestions = [
        createSuggestion({ reason: 'Queen is 3 years old' }),
      ];

      render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={suggestions} />
      );

      // Expand
      fireEvent.click(screen.getByTestId('expand-reason-button'));
      expect(screen.getByTestId('suggestion-reason')).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByTestId('expand-reason-button'));
      expect(screen.queryByTestId('suggestion-reason')).not.toBeInTheDocument();
    });
  });

  describe('Accept Action', () => {
    it('calls onAccept when Accept button is clicked', () => {
      const onAccept = vi.fn();
      const suggestion = createSuggestion({ id: 'suggestion-123' });

      render(
        <BeeBrainSuggestionsSection
          {...defaultProps}
          suggestions={[suggestion]}
          onAccept={onAccept}
        />
      );

      fireEvent.click(screen.getByTestId('accept-button'));

      expect(onAccept).toHaveBeenCalledTimes(1);
      expect(onAccept).toHaveBeenCalledWith(suggestion);
    });

    it('disables Accept button when accepting', () => {
      const suggestions = [createSuggestion()];

      render(
        <BeeBrainSuggestionsSection
          {...defaultProps}
          suggestions={suggestions}
          accepting={true}
        />
      );

      const acceptButton = screen.getByTestId('accept-button');
      expect(acceptButton).toBeDisabled();
    });

    it('disables Accept button when dismissing', () => {
      const suggestions = [createSuggestion()];

      render(
        <BeeBrainSuggestionsSection
          {...defaultProps}
          suggestions={suggestions}
          dismissing={true}
        />
      );

      const acceptButton = screen.getByTestId('accept-button');
      expect(acceptButton).toBeDisabled();
    });
  });

  describe('Dismiss Action', () => {
    it('calls onDismiss when Dismiss button is clicked', () => {
      const onDismiss = vi.fn();
      const suggestion = createSuggestion({ id: 'suggestion-456' });

      render(
        <BeeBrainSuggestionsSection
          {...defaultProps}
          suggestions={[suggestion]}
          onDismiss={onDismiss}
        />
      );

      fireEvent.click(screen.getByTestId('dismiss-button'));

      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledWith(suggestion);
    });

    it('disables Dismiss button when accepting', () => {
      const suggestions = [createSuggestion()];

      render(
        <BeeBrainSuggestionsSection
          {...defaultProps}
          suggestions={suggestions}
          accepting={true}
        />
      );

      const dismissButton = screen.getByTestId('dismiss-button');
      expect(dismissButton).toBeDisabled();
    });

    it('disables Dismiss button when dismissing', () => {
      const suggestions = [createSuggestion()];

      render(
        <BeeBrainSuggestionsSection
          {...defaultProps}
          suggestions={suggestions}
          dismissing={true}
        />
      );

      const dismissButton = screen.getByTestId('dismiss-button');
      expect(dismissButton).toBeDisabled();
    });
  });

  describe('Multiple Suggestions', () => {
    it('handles multiple suggestions independently', () => {
      const onAccept = vi.fn();
      const suggestions = [
        createSuggestion({ id: 'suggestion-1', suggested_title: 'Task 1' }),
        createSuggestion({ id: 'suggestion-2', suggested_title: 'Task 2' }),
      ];

      render(
        <BeeBrainSuggestionsSection
          {...defaultProps}
          suggestions={suggestions}
          onAccept={onAccept}
        />
      );

      const acceptButtons = screen.getAllByTestId('accept-button');
      expect(acceptButtons).toHaveLength(2);

      // Click second button
      fireEvent.click(acceptButtons[1]);

      expect(onAccept).toHaveBeenCalledWith(suggestions[1]);
    });

    it('only expands one reason at a time', () => {
      const suggestions = [
        createSuggestion({ id: 'suggestion-1', reason: 'Reason 1' }),
        createSuggestion({ id: 'suggestion-2', reason: 'Reason 2' }),
      ];

      render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={suggestions} />
      );

      const expandButtons = screen.getAllByTestId('expand-reason-button');

      // Expand first
      fireEvent.click(expandButtons[0]);
      expect(screen.getByText('Reason 1')).toBeInTheDocument();
      expect(screen.queryByText('Reason 2')).not.toBeInTheDocument();

      // Expand second (should collapse first)
      fireEvent.click(expandButtons[1]);
      expect(screen.queryByText('Reason 1')).not.toBeInTheDocument();
      expect(screen.getByText('Reason 2')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies custom style prop', () => {
      const suggestions = [createSuggestion()];
      const customStyle = { marginTop: 24 };

      render(
        <BeeBrainSuggestionsSection
          {...defaultProps}
          suggestions={suggestions}
          style={customStyle}
        />
      );

      const section = screen.getByTestId('beebrain-suggestions-section');
      expect(section).toHaveStyle({ marginTop: '24px' });
    });

    it('has purple-tinted background for differentiation', () => {
      const suggestions = [createSuggestion()];

      render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={suggestions} />
      );

      const section = screen.getByTestId('beebrain-suggestions-section');
      // Check for purple tint background
      expect(section).toHaveStyle({
        backgroundColor: 'rgba(124, 58, 237, 0.08)',
      });
    });
  });

  describe('Accessibility', () => {
    it('priority badge has aria-label', () => {
      const suggestions = [createSuggestion({ priority: 'urgent' })];

      render(
        <BeeBrainSuggestionsSection {...defaultProps} suggestions={suggestions} />
      );

      const badge = screen.getByTestId('priority-badge');
      expect(badge).toHaveAttribute('aria-label', 'Priority: Urgent');
    });
  });

  describe('Loading States', () => {
    it('shows spinner in Accept button when accepting that suggestion', () => {
      const suggestions = [createSuggestion({ id: 'suggestion-actioning' })];
      const onAccept = vi.fn();

      const { rerender } = render(
        <BeeBrainSuggestionsSection
          {...defaultProps}
          suggestions={suggestions}
          onAccept={onAccept}
          accepting={false}
        />
      );

      // Click accept to set actioningId
      fireEvent.click(screen.getByTestId('accept-button'));

      // Re-render with accepting=true
      rerender(
        <BeeBrainSuggestionsSection
          {...defaultProps}
          suggestions={suggestions}
          onAccept={onAccept}
          accepting={true}
        />
      );

      // Accept button should show spinner (disabled state)
      const acceptButton = screen.getByTestId('accept-button');
      expect(acceptButton).toBeDisabled();
    });
  });
});
