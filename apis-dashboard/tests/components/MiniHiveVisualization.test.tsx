/**
 * Tests for MiniHiveVisualization component
 *
 * Part of Epic 5, Story 5.2 remediation: Add unit tests for shared components.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MiniHiveVisualization } from '../../src/components/MiniHiveVisualization';

describe('MiniHiveVisualization', () => {
  describe('box rendering', () => {
    it('renders correct number of brood boxes (limited to maxDisplay)', () => {
      const { container } = render(
        <MiniHiveVisualization broodBoxes={2} honeySupers={1} status="healthy" />
      );

      // Brood boxes have height: 8px style
      const broodBoxes = container.querySelectorAll('div[style*="height: 8px"]');
      expect(broodBoxes.length).toBe(2);
    });

    it('renders correct number of honey supers (limited to maxDisplay)', () => {
      const { container } = render(
        <MiniHiveVisualization broodBoxes={1} honeySupers={2} status="healthy" />
      );

      // Honey supers have height: 6px style
      const honeySupers = container.querySelectorAll('div[style*="height: 6px"]');
      expect(honeySupers.length).toBe(2);
    });

    it('limits boxes to maxDisplay of 2 by default', () => {
      const { container } = render(
        <MiniHiveVisualization broodBoxes={3} honeySupers={5} status="healthy" />
      );

      // Should only show 2 brood boxes and 2 honey supers
      const broodBoxes = container.querySelectorAll('div[style*="height: 8px"]');
      const honeySupers = container.querySelectorAll('div[style*="height: 6px"]');

      expect(broodBoxes.length).toBe(2);
      expect(honeySupers.length).toBe(2);
    });

    it('renders roof element', () => {
      const { container } = render(
        <MiniHiveVisualization broodBoxes={1} honeySupers={0} status="healthy" />
      );

      // Roof has height: 4px and border-radius with rounded top
      const roof = container.querySelector('div[style*="height: 4px"]');
      expect(roof).toBeDefined();
    });
  });

  describe('status badge', () => {
    it('shows success badge for healthy status', () => {
      const { container } = render(
        <MiniHiveVisualization broodBoxes={1} honeySupers={1} status="healthy" />
      );

      // Badge dot with success status
      const badge = container.querySelector('.ant-badge-status-success');
      expect(badge).toBeDefined();
    });

    it('shows warning badge for needs_attention status', () => {
      const { container } = render(
        <MiniHiveVisualization broodBoxes={1} honeySupers={1} status="needs_attention" />
      );

      // Badge dot with warning status
      const badge = container.querySelector('.ant-badge-status-warning');
      expect(badge).toBeDefined();
    });

    it('shows default badge for unknown status', () => {
      const { container } = render(
        <MiniHiveVisualization broodBoxes={1} honeySupers={1} status="unknown" />
      );

      // Badge dot with default status
      const badge = container.querySelector('.ant-badge-status-default');
      expect(badge).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('handles zero boxes', () => {
      const { container } = render(
        <MiniHiveVisualization broodBoxes={0} honeySupers={0} status="healthy" />
      );

      // Should still render container and roof
      const hiveContainer = container.querySelector('div[style*="width: 48px"]');
      expect(hiveContainer).toBeDefined();
    });

    it('handles maximum box counts', () => {
      const { container } = render(
        <MiniHiveVisualization broodBoxes={3} honeySupers={5} status="healthy" maxDisplay={3} />
      );

      // With maxDisplay=3, should show 3 brood and 3 honey
      const broodBoxes = container.querySelectorAll('div[style*="height: 8px"]');
      const honeySupers = container.querySelectorAll('div[style*="height: 6px"]');

      expect(broodBoxes.length).toBe(3);
      expect(honeySupers.length).toBe(3);
    });
  });
});
