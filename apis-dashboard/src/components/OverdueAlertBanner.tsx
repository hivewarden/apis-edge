/**
 * OverdueAlertBanner Component
 *
 * Displays an alert banner when there are overdue tasks.
 * Shows on the Tasks page with a dismiss option (session-only).
 *
 * Part of Epic 14, Story 14.14
 */
import { useState } from 'react';
import { Alert, Button } from 'antd';
import { WarningOutlined } from '@ant-design/icons';

export interface OverdueAlertBannerProps {
  /** Number of overdue tasks */
  overdueCount: number;
  /** Callback when "View" link is clicked */
  onView?: () => void;
}

/**
 * OverdueAlertBanner
 *
 * Shows a warning banner when there are overdue tasks.
 * - Hidden when overdueCount is 0
 * - Hidden when dismissed (session-only, reappears on page reload)
 * - Shows "You have X overdue task(s)" message
 * - Includes View link to scroll to overdue section
 *
 * @example
 * <OverdueAlertBanner
 *   overdueCount={3}
 *   onView={() => scrollToOverdueSection()}
 * />
 */
export function OverdueAlertBanner({ overdueCount, onView }: OverdueAlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Don't render if no overdue tasks or dismissed
  if (overdueCount === 0 || dismissed) {
    return null;
  }

  return (
    <Alert
      data-testid="overdue-alert-banner"
      message={
        <span data-testid="overdue-alert-message">
          <WarningOutlined data-testid="overdue-alert-icon" style={{ marginRight: 8 }} />
          You have {overdueCount} overdue task{overdueCount > 1 ? 's' : ''}
          {onView && (
            <Button
              data-testid="overdue-alert-view-button"
              type="link"
              size="small"
              onClick={onView}
              style={{ marginLeft: 8, padding: '0 4px' }}
            >
              View
            </Button>
          )}
        </span>
      }
      type="warning"
      closable
      onClose={() => setDismissed(true)}
      style={{ marginBottom: 16 }}
      banner
    />
  );
}

export default OverdueAlertBanner;
