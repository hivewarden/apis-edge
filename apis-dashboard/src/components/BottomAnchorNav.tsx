/**
 * BottomAnchorNav Component
 *
 * Fixed bottom navigation bar for mobile hive detail view.
 * Displays three section buttons: Status, Tasks, and Inspect.
 *
 * Features:
 * - 64px touch-friendly height (per NFR-HT-04)
 * - Active section highlighting
 * - Dynamic task count display
 * - Overdue indicator (red dot)
 * - Smooth scroll navigation
 *
 * Part of Epic 14, Story 14.8: Mobile Bottom Anchor Navigation Bar
 *
 * @example
 * <BottomAnchorNav
 *   activeSection={activeSection}
 *   onNavigate={scrollToSection}
 *   taskCount={5}
 *   hasOverdue={true}
 * />
 */
import { CSSProperties } from 'react';
import {
  DashboardOutlined,
  CheckSquareOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import type { SectionId } from '../hooks/useActiveSection';

/** Props for the BottomAnchorNav component */
export interface BottomAnchorNavProps {
  /** Currently active section ID */
  activeSection: SectionId;
  /** Callback when a section button is clicked */
  onNavigate: (sectionId: SectionId) => void;
  /** Number of open tasks to display in Tasks button */
  taskCount: number;
  /** Whether there are overdue tasks (shows red dot) */
  hasOverdue: boolean;
  /** Optional style overrides */
  style?: CSSProperties;
}

/** Bottom nav height in pixels (64px per UX spec for glove-friendly touch) */
const NAV_HEIGHT = 64;

/** Right offset for overdue dot positioning (percentage from right edge) */
const OVERDUE_DOT_RIGHT_OFFSET = '30%';

/** Section configuration for rendering buttons */
const sections = [
  { id: 'status-section' as SectionId, label: 'Status', icon: DashboardOutlined },
  { id: 'tasks-section' as SectionId, label: 'Tasks', icon: CheckSquareOutlined },
  { id: 'inspect-section' as SectionId, label: 'Inspect', icon: SearchOutlined },
];

/**
 * Fixed bottom navigation bar for mobile hive detail.
 *
 * Renders three equal-width buttons for navigating between
 * Status, Tasks, and Inspect sections. Highlights the currently
 * active section and shows task count with overdue indicator.
 */
export function BottomAnchorNav({
  activeSection,
  onNavigate,
  taskCount,
  hasOverdue,
  style,
}: BottomAnchorNavProps) {
  return (
    <nav
      role="navigation"
      aria-label="Section navigation"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: NAV_HEIGHT,
        display: 'flex',
        backgroundColor: colors.salomie,
        boxShadow: '0 -2px 8px rgba(102, 38, 4, 0.10)',
        zIndex: 1000,
        ...style,
      }}
    >
      {sections.map(({ id, label, icon: Icon }) => {
        const isActive = activeSection === id;
        const displayLabel = id === 'tasks-section' ? `Tasks (${taskCount})` : label;
        const showOverdueDot = id === 'tasks-section' && hasOverdue;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={isActive ? 'true' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              backgroundColor: isActive ? colors.seaBuckthorn : 'transparent',
              color: isActive ? '#ffffff' : colors.textMuted,
              transition: 'all 0.2s ease',
              // Use transparent outline + box-shadow for visible focus ring
              // This provides better keyboard navigation visibility (WCAG 2.4.7)
              outline: '2px solid transparent',
              outlineOffset: '-2px',
            }}
            onKeyDown={(e) => {
              // Show focus ring only for keyboard navigation
              if (e.key === 'Tab') {
                e.currentTarget.style.outline = `2px solid ${colors.brownBramble}`;
              }
            }}
            onFocus={(e) => {
              // Use box-shadow for focus indicator (works alongside outline)
              e.currentTarget.style.boxShadow = `inset 0 0 0 2px ${colors.focusRing}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.outline = '2px solid transparent';
            }}
          >
            <Icon style={{ fontSize: 20 }} />
            <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 400 }}>
              {displayLabel}
            </span>
            {showOverdueDot && (
              <span
                aria-label="Has overdue tasks"
                style={{
                  position: 'absolute',
                  top: 8,
                  right: OVERDUE_DOT_RIGHT_OFFSET,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: colors.error,
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
