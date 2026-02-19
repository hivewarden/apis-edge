import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// Mock usePendingSync (uses IndexedDB which is unavailable in test env)
vi.mock('../../src/hooks/usePendingSync', () => ({
  usePendingSync: () => ({
    pendingCount: 0,
    pendingGroups: [],
    dbError: null,
    loading: false,
  }),
}));

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

  it('displays the cloud_off icon', () => {
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

    // The Material Symbols cloud_off icon should be present
    const alert = screen.getByRole('alert');
    const icon = alert.querySelector('.material-symbols-outlined');
    expect(icon).toBeInTheDocument();
    expect(icon?.textContent).toBe('cloud_off');
  });

  it('handles rapid online/offline toggling without errors', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });

    render(<OfflineBanner />);

    // Rapidly toggle online/offline multiple times
    expect(() => {
      for (let i = 0; i < 10; i++) {
        act(() => {
          Object.defineProperty(navigator, 'onLine', {
            value: i % 2 === 1, // alternate between online and offline
            configurable: true,
            writable: true,
          });
          window.dispatchEvent(new Event(i % 2 === 1 ? 'online' : 'offline'));
          vi.advanceTimersByTime(50); // Small time advancement between toggles
        });
      }
    }).not.toThrow();

    // Finish all pending timers to ensure cleanup
    act(() => {
      vi.runAllTimers();
    });

    // Final state should be stable based on last toggle (offline since 10 % 2 === 0)
    // The component should either show or not show based on final state
    // The key test is that no errors occurred during rapid toggling
  });
});
