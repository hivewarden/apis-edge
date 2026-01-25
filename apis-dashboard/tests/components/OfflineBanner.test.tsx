import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineBanner } from '../../src/components/OfflineBanner';

describe('OfflineBanner', () => {
  // Store original navigator.onLine value
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
    // Use fake timers for controlling animations
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Restore original value
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not render when online', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });

    render(<OfflineBanner />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/offline mode/i)).not.toBeInTheDocument();
  });

  it('renders when offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });

    render(<OfflineBanner />);

    // Advance timers to allow requestAnimationFrame to fire
    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Offline mode')).toBeInTheDocument();
    expect(screen.getByText(/some features unavailable/i)).toBeInTheDocument();
  });

  it('has correct aria attributes for accessibility', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });

    render(<OfflineBanner />);

    // Advance timers to allow rendering
    act(() => {
      vi.runAllTimers();
    });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('aria-live', 'polite');
  });

  it('appears when going offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });

    render(<OfflineBanner />);

    // Should not be visible when online
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Simulate going offline
    act(() => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });
      window.dispatchEvent(new Event('offline'));
      vi.runAllTimers();
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('disappears when coming back online', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });

    render(<OfflineBanner />);

    // Advance timers to show banner
    act(() => {
      vi.runAllTimers();
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Simulate coming online
    act(() => {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
        writable: true,
      });
      window.dispatchEvent(new Event('online'));
    });

    // Advance timers for animation (300ms transition + buffer)
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('displays the wifi icon', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });

    render(<OfflineBanner />);

    // Advance timers
    act(() => {
      vi.runAllTimers();
    });

    // The WifiOutlined icon should be present
    const alert = screen.getByRole('alert');
    expect(alert.querySelector('.anticon-wifi')).toBeInTheDocument();
  });
});
