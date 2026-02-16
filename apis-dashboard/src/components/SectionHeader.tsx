/**
 * SectionHeader Component
 *
 * A full-width divider with centered text used as section separators
 * in the mobile hive detail layout. Provides clear visual separation
 * between Status, Tasks, and Inspect sections.
 *
 * The divider lines use a gradient fade effect for a polished look.
 *
 * Note: The id is placed on the header element itself. The parent component
 * should wrap this header and its content section in a container with the id
 * for proper scroll targeting (so the whole section is visible after scroll).
 *
 * Part of Epic 14, Story 14.7: Mobile Refactor Hive Detail to Single Scroll Layout
 */
import { CSSProperties, ReactNode } from 'react';
import { Typography } from 'antd';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

export interface SectionHeaderProps {
  /** The section title text (displayed in uppercase) */
  title: string;
  /** Optional count to display in parentheses, e.g., "TASKS (3)" */
  count?: number;
  /** Optional ID for scroll anchor targeting - applied to wrapper section */
  id?: string;
  /** Optional additional styles */
  style?: CSSProperties;
  /** Optional children - content to render after the header within the same section wrapper */
  children?: ReactNode;
}

/**
 * Renders a full-width section header with centered text and
 * decorative horizontal lines on both sides. When an id is provided,
 * wraps header and children in a section element with that id.
 *
 * Visual design:
 * ──────────── TASKS (3) ────────────
 *
 * @example
 * <SectionHeader title="TASKS" count={3} id="tasks-section">
 *   <TaskList />
 * </SectionHeader>
 */
export function SectionHeader({ title, count, id, style, children }: SectionHeaderProps) {
  const displayText = count !== undefined ? `${title} (${count})` : title;
  const headerId = id ? `${id}-header` : undefined;

  const headerElement = (
    <div
      id={headerId}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '24px 0 16px',
        ...style,
      }}
      role="heading"
      aria-level={2}
    >
      {/* Left divider line */}
      <div
        style={{
          flex: 1,
          height: 2,
          background: `linear-gradient(to right, transparent, ${colors.border}, ${colors.border})`,
        }}
        aria-hidden="true"
      />

      {/* Section title text */}
      <Text
        id={id ? `${id}-title` : undefined}
        style={{
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: colors.textMuted,
          whiteSpace: 'nowrap',
        }}
      >
        {displayText}
      </Text>

      {/* Right divider line */}
      <div
        style={{
          flex: 1,
          height: 2,
          background: `linear-gradient(to left, transparent, ${colors.border}, ${colors.border})`,
        }}
        aria-hidden="true"
      />
    </div>
  );

  // If id is provided, wrap in section with proper accessibility
  if (id) {
    return (
      <section
        id={id}
        role="region"
        aria-labelledby={`${id}-title`}
      >
        {headerElement}
        {children}
      </section>
    );
  }

  // If no id, just return the header (legacy usage)
  return (
    <>
      {headerElement}
      {children}
    </>
  );
}

export default SectionHeader;
