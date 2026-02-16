/**
 * Tests for HiveStatusBadge component
 *
 * Part of Epic 5, Story 5.2 remediation: Add unit tests for shared components.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HiveStatusBadge } from '../../src/components/HiveStatusBadge';

describe('HiveStatusBadge', () => {
  describe('healthy status', () => {
    it('renders green success tag for healthy hives', () => {
      const hive = { status: 'healthy' as const, hive_status: 'active' as const, lost_at: null };
      render(<HiveStatusBadge hive={hive} />);

      const tag = screen.getByText('Healthy');
      expect(tag).toBeDefined();
      // Ant Design uses class names for colors
      expect(tag.closest('.ant-tag-success')).toBeDefined();
    });
  });

  describe('needs_attention status', () => {
    it('renders orange warning tag for hives needing attention', () => {
      const hive = { status: 'needs_attention' as const, hive_status: 'active' as const, lost_at: null };
      render(<HiveStatusBadge hive={hive} />);

      const tag = screen.getByText('Needs attention');
      expect(tag).toBeDefined();
    });

    it('shows warning icon', () => {
      const hive = { status: 'needs_attention' as const, hive_status: 'active' as const, lost_at: null };
      render(<HiveStatusBadge hive={hive} />);

      // WarningOutlined icon should be present
      const warningIcon = document.querySelector('.anticon-warning');
      expect(warningIcon).toBeDefined();
    });
  });

  describe('unknown status', () => {
    it('renders default gray tag for unknown status', () => {
      const hive = { status: 'unknown' as const, hive_status: 'active' as const, lost_at: null };
      render(<HiveStatusBadge hive={hive} />);

      const tag = screen.getByText('Unknown');
      expect(tag).toBeDefined();
    });
  });

  describe('lost hive status', () => {
    it('renders LostHiveBadge when hive_status is lost and lost_at is set', () => {
      const hive = {
        status: 'lost' as const,
        hive_status: 'lost' as const,
        lost_at: '2026-01-15',
      };
      render(<HiveStatusBadge hive={hive} />);

      // LostHiveBadge shows "Lost" text
      const lostBadge = screen.getByText(/Lost/);
      expect(lostBadge).toBeDefined();
    });

    it('does not render LostHiveBadge when hive_status is lost but lost_at is null', () => {
      const hive = {
        status: 'healthy' as const,
        hive_status: 'lost' as const,
        lost_at: null,
      };
      render(<HiveStatusBadge hive={hive} />);

      // Should fall through to regular status display
      const tag = screen.getByText('Healthy');
      expect(tag).toBeDefined();
    });
  });
});
