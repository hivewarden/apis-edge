/**
 * ProactiveInsightBanner Component
 *
 * Container component that displays proactive BeeBrain insights as a banner.
 * Shows top 3 insights by severity with "show more" functionality.
 *
 * Part of Epic 8, Story 8.4: Proactive Insight Notifications
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Skeleton, Typography, Button, Space, Row, Col } from 'antd';
import { BulbOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { useProactiveInsights } from '../hooks/useProactiveInsights';
import { ProactiveInsightNotification } from './ProactiveInsightNotification';
import { colors, spacing } from '../theme/apisTheme';

const { Text } = Typography;

/**
 * Props for ProactiveInsightBanner component.
 */
export interface ProactiveInsightBannerProps {
  /** The site ID to fetch insights for */
  siteId: string | null;
}

/**
 * ProactiveInsightBanner Component
 *
 * Displays BeeBrain proactive insights in a prominent banner at the top of the dashboard.
 * Features:
 * - Shows top 3 most important insights by severity
 * - "Show X more" link to expand all insights
 * - Smooth animations for dismiss/snooze actions
 * - Graceful degradation on error (banner hidden, no error message)
 * - Empty state: no banner shown when 0 insights
 */
export function ProactiveInsightBanner({ siteId }: ProactiveInsightBannerProps) {
  const {
    visibleInsights,
    hiddenCount,
    showAll,
    loading,
    error,
    dismissInsight,
    snoozeInsight,
    toggleShowAll,
  } = useProactiveInsights(siteId);

  // Track which insights are being removed (for animation)
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  // Refs for focus management after dismiss/snooze
  const bannerHeaderRef = useRef<HTMLDivElement>(null);
  const notificationRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Track previous insights count for focus management
  const prevInsightsCountRef = useRef(visibleInsights.length);

  // Focus management: when an insight is removed, focus next notification or header
  useEffect(() => {
    const currentCount = visibleInsights.length;
    const prevCount = prevInsightsCountRef.current;

    // Only manage focus if count decreased (insight was removed)
    if (currentCount < prevCount && currentCount > 0) {
      // Focus the first visible notification
      const firstInsightId = visibleInsights[0]?.id;
      if (firstInsightId) {
        const ref = notificationRefs.current.get(firstInsightId);
        ref?.focus();
      }
    } else if (currentCount < prevCount && currentCount === 0) {
      // All insights removed, no focus needed (banner will unmount)
    }

    prevInsightsCountRef.current = currentCount;
  }, [visibleInsights]);

  /**
   * Handle dismiss with animation delay.
   * Prevents duplicate clicks by checking if animation is already in progress.
   */
  const handleDismiss = useCallback(async (id: string) => {
    // Prevent duplicate clicks during animation
    if (removingIds.has(id)) {
      return;
    }

    // Start removal animation
    setRemovingIds(prev => new Set(prev).add(id));

    // Wait for animation to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // Actually dismiss
    await dismissInsight(id);

    // Clean up removing state
    setRemovingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [dismissInsight, removingIds]);

  /**
   * Handle snooze with animation delay.
   * Prevents duplicate clicks by checking if animation is already in progress.
   */
  const handleSnooze = useCallback(async (id: string, days: number) => {
    // Prevent duplicate clicks during animation
    if (removingIds.has(id)) {
      return;
    }

    // Start removal animation
    setRemovingIds(prev => new Set(prev).add(id));

    // Wait for animation to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // Actually snooze
    await snoozeInsight(id, days);

    // Clean up removing state
    setRemovingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [snoozeInsight, removingIds]);

  // No site selected - don't show banner
  if (!siteId) {
    return null;
  }

  // Loading state - show subtle skeleton
  if (loading) {
    return (
      <div style={bannerContainerStyle} aria-busy="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <BulbOutlined style={{ fontSize: 18, color: colors.brownBramble }} />
          <Text strong style={{ color: colors.brownBramble }}>
            BeeBrain Alerts
          </Text>
        </div>
        <Skeleton active paragraph={{ rows: 1 }} />
      </div>
    );
  }

  // Error state - graceful degradation (no banner, log error)
  if (error) {
    // Don't show error to user - just hide banner (per story spec)
    console.error('[ProactiveInsightBanner] Error loading insights:', error);
    return null;
  }

  // Empty state - no banner shown
  if (visibleInsights.length === 0) {
    return null;
  }

  return (
    <div
      style={bannerContainerStyle}
      role="region"
      aria-label="BeeBrain proactive insights"
      aria-live="polite"
    >
      {/* Banner header */}
      <div
        ref={bannerHeaderRef}
        tabIndex={-1}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.md,
        }}
      >
        <Space size={8}>
          <BulbOutlined style={{ fontSize: 20, color: colors.brownBramble }} />
          <Text strong style={{ color: colors.brownBramble, fontSize: 16 }}>
            BeeBrain Alerts
          </Text>
        </Space>
        {(visibleInsights.length + hiddenCount) > 0 && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {visibleInsights.length + hiddenCount} insight{(visibleInsights.length + hiddenCount) !== 1 ? 's' : ''} requiring attention
          </Text>
        )}
      </div>

      {/* Insight cards - responsive grid */}
      <Row gutter={[12, 12]} id="proactive-insights-list">
        {visibleInsights.map(insight => (
          <Col
            xs={24} sm={12} lg={8}
            key={insight.id}
            ref={(el) => {
              if (el) {
                notificationRefs.current.set(insight.id, el);
              } else {
                notificationRefs.current.delete(insight.id);
              }
            }}
            tabIndex={-1}
          >
            <ProactiveInsightNotification
              insight={insight}
              onDismiss={handleDismiss}
              onSnooze={handleSnooze}
              isRemoving={removingIds.has(insight.id)}
            />
          </Col>
        ))}
      </Row>

      {/* Show more/less toggle */}
      {(hiddenCount > 0 || showAll) && (
        <div style={{ textAlign: 'center', marginTop: spacing.md }}>
          <Button
            type="link"
            onClick={toggleShowAll}
            style={{ color: colors.seaBuckthorn }}
            aria-expanded={showAll}
            aria-controls="proactive-insights-list"
          >
            {showAll ? (
              <>
                <UpOutlined style={{ marginRight: 4 }} />
                Show less
              </>
            ) : (
              <>
                <DownOutlined style={{ marginRight: 4 }} />
                Show {hiddenCount} more insight{hiddenCount !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Banner container styling.
 */
const bannerContainerStyle: CSSProperties = {
  padding: spacing.md,
  marginBottom: spacing.lg,
  borderRadius: 12,
  background: '#ffffff',
  border: `1px solid #f3efe8`,
  boxShadow: '0 1px 3px rgba(102, 38, 4, 0.08)',
  maxWidth: '100%',
};

export default ProactiveInsightBanner;
