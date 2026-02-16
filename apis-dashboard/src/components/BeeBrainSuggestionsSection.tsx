/**
 * BeeBrainSuggestionsSection Component
 *
 * Displays BeeBrain task suggestions in a mobile-optimized layout.
 * Shows a distinct section with robot icon header and suggestion cards
 * that can be accepted (creating a task) or dismissed.
 *
 * Part of Epic 14, Story 14.15
 */
import { CSSProperties, useState, useCallback } from 'react';
import { Typography, Button, Space, Spin } from 'antd';
import { RobotOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { colors, touchTargets } from '../theme/apisTheme';
import type { TaskSuggestion, SuggestionPriority } from '../hooks/useTaskSuggestions';

const { Text } = Typography;

/**
 * Priority colors for visual indicators.
 */
const PRIORITY_COLORS: Record<SuggestionPriority, string> = {
  urgent: colors.error,
  high: colors.warning,
  medium: colors.success,
  low: colors.textMuted,
};

/**
 * Priority labels for accessibility.
 */
const PRIORITY_LABELS: Record<SuggestionPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export interface BeeBrainSuggestionsSectionProps {
  /** List of suggestions to display */
  suggestions: TaskSuggestion[];
  /** Callback when a suggestion is accepted */
  onAccept: (suggestion: TaskSuggestion) => void;
  /** Callback when a suggestion is dismissed */
  onDismiss: (suggestion: TaskSuggestion) => void;
  /** Whether a suggestion is currently being accepted */
  accepting: boolean;
  /** Whether a suggestion is currently being dismissed */
  dismissing: boolean;
  /** Optional style overrides */
  style?: CSSProperties;
}

/**
 * BeeBrain task suggestions section component.
 *
 * Features:
 * - Robot icon header with "Suggested by BeeBrain" text
 * - Suggestion cards with priority indicator, title, and expandable reason
 * - Accept button (creates task) and Dismiss link
 * - Fade-out animation when accepting/dismissing
 *
 * @example
 * <BeeBrainSuggestionsSection
 *   suggestions={suggestions}
 *   onAccept={handleAccept}
 *   onDismiss={handleDismiss}
 *   accepting={accepting}
 *   dismissing={dismissing}
 * />
 */
export function BeeBrainSuggestionsSection({
  suggestions,
  onAccept,
  onDismiss,
  accepting,
  dismissing,
  style,
}: BeeBrainSuggestionsSectionProps) {
  // Track which suggestion cards have expanded reasons
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Track which suggestion is being acted upon
  const [actioningId, setActioningId] = useState<string | null>(null);

  // Handle accept click
  const handleAccept = useCallback((suggestion: TaskSuggestion) => {
    setActioningId(suggestion.id);
    onAccept(suggestion);
  }, [onAccept]);

  // Handle dismiss click
  const handleDismiss = useCallback((suggestion: TaskSuggestion) => {
    setActioningId(suggestion.id);
    onDismiss(suggestion);
  }, [onDismiss]);

  // Toggle reason expansion
  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  // Don't render if no suggestions
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="beebrain-suggestions-section"
      style={{
        backgroundColor: 'rgba(124, 58, 237, 0.08)', // Purple tint to differentiate from regular tasks
        borderRadius: 8,
        padding: 12,
        ...style,
      }}
    >
      {/* Header with robot icon */}
      <Space
        align="center"
        style={{ marginBottom: 12 }}
        data-testid="suggestions-header"
      >
        <RobotOutlined
          style={{ color: '#7c3aed', fontSize: 18 }}
        />
        <Text
          strong
          style={{
            color: '#7c3aed',
            fontSize: 13,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Suggested by BeeBrain
        </Text>
      </Space>

      {/* Suggestion cards */}
      {suggestions.map((suggestion) => {
        const isActioning = actioningId === suggestion.id;
        const isExpanded = expandedId === suggestion.id;

        return (
          <div
            key={suggestion.id}
            data-testid="suggestion-card"
            style={{
              backgroundColor: colors.coconutCream,
              borderRadius: 8,
              padding: 12,
              marginBottom: 8,
              boxShadow: colors.shadowSm,
              opacity: isActioning ? 0.6 : 1,
              transition: 'opacity 300ms ease-out',
            }}
          >
            {/* Header row with robot icon, title, and priority */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                {/* Robot icon indicator */}
                <RobotOutlined
                  style={{ color: '#7c3aed', fontSize: 16 }}
                />

                {/* Suggestion title */}
                <Text
                  strong
                  style={{
                    color: colors.brownBramble,
                    fontSize: 14,
                    flex: 1,
                  }}
                  data-testid="suggestion-title"
                >
                  {suggestion.suggested_title}
                </Text>
              </div>

              {/* Priority badge */}
              <span
                style={{
                  backgroundColor: PRIORITY_COLORS[suggestion.priority],
                  color: '#ffffff',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  whiteSpace: 'nowrap',
                }}
                data-testid="priority-badge"
                aria-label={`Priority: ${PRIORITY_LABELS[suggestion.priority]}`}
              >
                {PRIORITY_LABELS[suggestion.priority]}
              </span>
            </div>

            {/* Expandable reason section */}
            <div style={{ marginTop: 8 }}>
              <Button
                type="text"
                size="small"
                onClick={() => toggleExpand(suggestion.id)}
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  padding: '0 4px',
                  height: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                data-testid="expand-reason-button"
              >
                Why?
                {isExpanded ? <UpOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
              </Button>

              {isExpanded && (
                <Text
                  style={{
                    display: 'block',
                    color: colors.brownBramble,
                    fontSize: 13,
                    marginTop: 8,
                    padding: 8,
                    backgroundColor: 'rgba(124, 58, 237, 0.05)',
                    borderRadius: 4,
                    lineHeight: 1.5,
                  }}
                  data-testid="suggestion-reason"
                >
                  {suggestion.reason}
                </Text>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Accept button - 64px touch target */}
              <Button
                type="primary"
                size="large"
                onClick={() => handleAccept(suggestion)}
                disabled={accepting || dismissing}
                style={{
                  height: touchTargets.mobile,
                  width: '100%',
                  fontSize: 16,
                }}
                data-testid="accept-button"
              >
                {isActioning && accepting ? (
                  <Spin size="small" />
                ) : (
                  'Accept'
                )}
              </Button>

              {/* Dismiss link - less prominent */}
              <Button
                type="text"
                onClick={() => handleDismiss(suggestion)}
                disabled={accepting || dismissing}
                style={{
                  color: colors.textMuted,
                  fontSize: 13,
                }}
                data-testid="dismiss-button"
              >
                {isActioning && dismissing ? (
                  <Spin size="small" />
                ) : (
                  'Dismiss'
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BeeBrainSuggestionsSection;
