/**
 * FrameEntryCard Component Tests
 *
 * Tests for the frame-level data tracking component from Story 5.5.
 * Covers: rendering, validation, auto-calculation, and input handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { apisTheme } from '../../src/theme/apisTheme';
import { FrameEntryCard, type FrameData } from '../../src/components/FrameEntryCard';

// Helper to render with theme
const renderWithProviders = (component: React.ReactNode) => {
  return render(
    <ConfigProvider theme={apisTheme}>
      {component}
    </ConfigProvider>
  );
};

// Helper to create frame data
const createFrameData = (overrides: Partial<FrameData> = {}): FrameData => ({
  boxPosition: 1,
  boxType: 'brood',
  totalFrames: 10,
  drawnFrames: 0,
  broodFrames: 0,
  honeyFrames: 0,
  pollenFrames: 0,
  ...overrides,
});

describe('FrameEntryCard Component', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders empty state when no boxes configured', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={0}
          honeySupers={0}
          frames={[]}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('No boxes configured for this hive')).toBeInTheDocument();
    });

    it('renders collapsible card with Frame-Level Data label', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={1}
          honeySupers={0}
          frames={[createFrameData()]}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('Frame-Level Data')).toBeInTheDocument();
      expect(screen.getByText('(Advanced)')).toBeInTheDocument();
    });

    it('renders brood box section when broodBoxes > 0', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={2}
          honeySupers={0}
          frames={[
            createFrameData({ boxPosition: 1, boxType: 'brood' }),
            createFrameData({ boxPosition: 2, boxType: 'brood' }),
          ]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      expect(screen.getByText('Brood Boxes')).toBeInTheDocument();
      expect(screen.getByText('Brood Box 1')).toBeInTheDocument();
      expect(screen.getByText('Brood Box 2')).toBeInTheDocument();
    });

    it('renders honey super section when honeySupers > 0', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={1}
          honeySupers={2}
          frames={[
            createFrameData({ boxPosition: 1, boxType: 'brood' }),
            createFrameData({ boxPosition: 2, boxType: 'super' }),
            createFrameData({ boxPosition: 3, boxType: 'super' }),
          ]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      expect(screen.getByText('Honey Supers')).toBeInTheDocument();
      expect(screen.getByText('Honey Super 1')).toBeInTheDocument();
      expect(screen.getByText('Honey Super 2')).toBeInTheDocument();
    });

    it('renders frame input fields for each box', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={1}
          honeySupers={0}
          frames={[createFrameData()]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      // Check for input labels
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('Drawn')).toBeInTheDocument();
      expect(screen.getByText('Brood')).toBeInTheDocument();
      expect(screen.getByText('Honey')).toBeInTheDocument();
      expect(screen.getByText('Pollen')).toBeInTheDocument();
    });
  });

  describe('Auto-Calculation', () => {
    it('displays empty/foundation count when totalFrames > drawnFrames', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={1}
          honeySupers={0}
          frames={[createFrameData({ totalFrames: 10, drawnFrames: 7 })]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      expect(screen.getByText('3 empty/foundation')).toBeInTheDocument();
    });

    it('does not display empty tag when all frames are drawn', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={1}
          honeySupers={0}
          frames={[createFrameData({ totalFrames: 10, drawnFrames: 10 })]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      expect(screen.queryByText(/empty\/foundation/)).not.toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('shows error when drawnFrames > totalFrames', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={1}
          honeySupers={0}
          frames={[createFrameData({ totalFrames: 10, drawnFrames: 12 })]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      expect(screen.getByText('Drawn frames cannot exceed total frames')).toBeInTheDocument();
    });

    it('shows error when brood + honey + pollen > drawn', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={1}
          honeySupers={0}
          frames={[createFrameData({
            drawnFrames: 6,
            broodFrames: 4,
            honeyFrames: 2,
            pollenFrames: 1, // 4+2+1=7 > 6
          })]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      expect(screen.getByText('Brood + honey + pollen frames cannot exceed drawn frames')).toBeInTheDocument();
    });

    it('shows no error when brood + honey + pollen = drawn', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={1}
          honeySupers={0}
          frames={[createFrameData({
            drawnFrames: 8,
            broodFrames: 4,
            honeyFrames: 3,
            pollenFrames: 1, // 4+3+1=8 == 8
          })]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      expect(screen.queryByText(/cannot exceed/)).not.toBeInTheDocument();
    });
  });

  describe('Frame Initialization', () => {
    it('initializes frames when empty array is passed', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={2}
          honeySupers={1}
          frames={[]}
          onChange={mockOnChange}
        />
      );

      // Component should initialize frames internally
      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      expect(screen.getByText('Brood Box 1')).toBeInTheDocument();
      expect(screen.getByText('Brood Box 2')).toBeInTheDocument();
      expect(screen.getByText('Honey Super 1')).toBeInTheDocument();
    });

    it('reinitializes when box count changes', () => {
      const { rerender } = renderWithProviders(
        <FrameEntryCard
          broodBoxes={1}
          honeySupers={0}
          frames={[createFrameData()]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));
      expect(screen.getByText('Brood Box 1')).toBeInTheDocument();

      // Rerender with different box count
      rerender(
        <ConfigProvider theme={apisTheme}>
          <FrameEntryCard
            broodBoxes={2}
            honeySupers={0}
            frames={[createFrameData()]} // Wrong length should trigger reinitialization
            onChange={mockOnChange}
          />
        </ConfigProvider>
      );

      expect(screen.getByText('Brood Box 2')).toBeInTheDocument();
    });
  });

  describe('Box Type Tagging', () => {
    it('displays Brood tag for brood boxes', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={1}
          honeySupers={0}
          frames={[createFrameData({ boxType: 'brood' })]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      expect(screen.getByText('Brood')).toBeInTheDocument();
    });

    it('displays Super tag for honey supers', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={0}
          honeySupers={1}
          frames={[createFrameData({ boxPosition: 1, boxType: 'super' })]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      expect(screen.getByText('Super')).toBeInTheDocument();
    });
  });

  describe('Help Text', () => {
    it('displays help alert when expanded', () => {
      renderWithProviders(
        <FrameEntryCard
          broodBoxes={1}
          honeySupers={0}
          frames={[createFrameData()]}
          onChange={mockOnChange}
        />
      );

      // Expand the collapse
      fireEvent.click(screen.getByText('Frame-Level Data'));

      expect(screen.getByText('Track frame counts for each box')).toBeInTheDocument();
      expect(screen.getByText(/Record drawn comb, brood, honey, and pollen frames/)).toBeInTheDocument();
    });
  });
});
