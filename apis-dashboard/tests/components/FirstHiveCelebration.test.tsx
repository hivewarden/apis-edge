/**
 * FirstHiveCelebration Component Tests
 *
 * Tests for the first hive harvest celebration toast notification.
 *
 * Part of Epic 9, Story 9.2: First Harvest Celebration - AC#4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ConfigProvider, notification } from 'antd';
import { FirstHiveCelebration, showFirstHiveCelebration } from '../../src/components/FirstHiveCelebration';
import { apisTheme } from '../../src/theme/apisTheme';

// Mock notification
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    notification: {
      success: vi.fn(),
      destroy: vi.fn(),
    },
  };
});

// Wrapper component with providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={apisTheme}>{children}</ConfigProvider>;
}

describe('FirstHiveCelebration Component', () => {
  describe('Inline Component Rendering', () => {
    it('should render when visible is true', () => {
      render(
        <TestWrapper>
          <FirstHiveCelebration hiveName="Queen Bee" visible={true} />
        </TestWrapper>
      );

      expect(screen.getByText('First harvest from Queen Bee!')).toBeInTheDocument();
    });

    it('should not render when visible is false', () => {
      render(
        <TestWrapper>
          <FirstHiveCelebration hiveName="Queen Bee" visible={false} />
        </TestWrapper>
      );

      expect(screen.queryByText('First harvest from Queen Bee!')).not.toBeInTheDocument();
    });

    it('should display milestone message', () => {
      render(
        <TestWrapper>
          <FirstHiveCelebration hiveName="Hive Alpha" visible={true} />
        </TestWrapper>
      );

      expect(screen.getByText('Another milestone for your apiary.')).toBeInTheDocument();
    });

    it('should include honey emoji', () => {
      render(
        <TestWrapper>
          <FirstHiveCelebration hiveName="Test Hive" visible={true} />
        </TestWrapper>
      );

      // Check for the honey emoji container
      const emojiElement = screen.getByRole('img', { name: 'honey' });
      expect(emojiElement).toBeInTheDocument();
    });

    it('should display different hive names correctly', () => {
      const { rerender } = render(
        <TestWrapper>
          <FirstHiveCelebration hiveName="Hive 1" visible={true} />
        </TestWrapper>
      );

      expect(screen.getByText('First harvest from Hive 1!')).toBeInTheDocument();

      rerender(
        <TestWrapper>
          <FirstHiveCelebration hiveName="The Golden Hive" visible={true} />
        </TestWrapper>
      );

      expect(screen.getByText('First harvest from The Golden Hive!')).toBeInTheDocument();
    });
  });
});

describe('showFirstHiveCelebration Function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    notification.destroy();
  });

  it('should call notification.success with correct message', () => {
    act(() => {
      showFirstHiveCelebration('My Hive');
    });

    expect(notification.success).toHaveBeenCalledTimes(1);
    expect(notification.success).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'First harvest from My Hive!',
        description: 'Another milestone for your apiary. Keep up the great work!',
      })
    );
  });

  it('should configure notification placement as topRight', () => {
    act(() => {
      showFirstHiveCelebration('Test Hive');
    });

    expect(notification.success).toHaveBeenCalledWith(
      expect.objectContaining({
        placement: 'topRight',
      })
    );
  });

  it('should set duration to 5 seconds', () => {
    act(() => {
      showFirstHiveCelebration('Test Hive');
    });

    expect(notification.success).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 5,
      })
    );
  });

  it('should include custom styling', () => {
    act(() => {
      showFirstHiveCelebration('Styled Hive');
    });

    expect(notification.success).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({
          borderRadius: 8,
        }),
      })
    );
  });

  it('should handle special characters in hive name', () => {
    act(() => {
      showFirstHiveCelebration("Mary's Special & Golden Hive");
    });

    expect(notification.success).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "First harvest from Mary's Special & Golden Hive!",
      })
    );
  });

  it('should handle long hive names', () => {
    const longName = 'This Is A Very Long Hive Name That Might Overflow';
    act(() => {
      showFirstHiveCelebration(longName);
    });

    expect(notification.success).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `First harvest from ${longName}!`,
      })
    );
  });

  it('should include icon element', () => {
    act(() => {
      showFirstHiveCelebration('Icon Hive');
    });

    expect(notification.success).toHaveBeenCalledWith(
      expect.objectContaining({
        icon: expect.anything(),
      })
    );
  });
});

describe('Integration with Multiple Calls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle multiple celebrations in sequence', () => {
    act(() => {
      showFirstHiveCelebration('Hive 1');
      showFirstHiveCelebration('Hive 2');
      showFirstHiveCelebration('Hive 3');
    });

    expect(notification.success).toHaveBeenCalledTimes(3);
  });

  it('should create unique notifications for each hive', () => {
    act(() => {
      showFirstHiveCelebration('Alpha');
      showFirstHiveCelebration('Beta');
    });

    expect(notification.success).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'First harvest from Alpha!',
      })
    );
    expect(notification.success).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: 'First harvest from Beta!',
      })
    );
  });
});
