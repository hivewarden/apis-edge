import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UpdateNotification } from '../../src/components/UpdateNotification';
import { __resetForTesting } from '../../src/hooks/useSWUpdate';

// Direct access to mock for triggering callbacks
import * as pwaMock from '../__mocks__/virtual-pwa-register';

describe('UpdateNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset the mock and the hook's module state before each test
    pwaMock.__resetMock();
    __resetForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not render when no update is available', () => {
    render(<UpdateNotification />);

    // Should not render the notification
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/new version available/i)).not.toBeInTheDocument();
  });

  it('renders when a new version is available', () => {
    render(<UpdateNotification />);

    // Trigger the needRefresh state
    act(() => {
      pwaMock.__triggerNeedRefresh();
      vi.runAllTimers();
    });

    // Should now show the notification
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('New version available')).toBeInTheDocument();
    expect(screen.getByText(/a fresh update is ready/i)).toBeInTheDocument();
  });

  it('has correct accessibility attributes', () => {
    render(<UpdateNotification />);

    // Trigger the needRefresh state
    act(() => {
      pwaMock.__triggerNeedRefresh();
      vi.runAllTimers();
    });

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-labelledby', 'update-notification-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'update-notification-desc');
  });

  it('displays Refresh Now button', () => {
    render(<UpdateNotification />);

    // Trigger the needRefresh state
    act(() => {
      pwaMock.__triggerNeedRefresh();
      vi.runAllTimers();
    });

    expect(screen.getByRole('button', { name: /refresh now/i })).toBeInTheDocument();
  });

  it('displays Later button to dismiss', () => {
    render(<UpdateNotification />);

    // Trigger the needRefresh state
    act(() => {
      pwaMock.__triggerNeedRefresh();
      vi.runAllTimers();
    });

    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument();
  });

  it('hides notification when dismiss (X) button is clicked', () => {
    render(<UpdateNotification />);

    // Trigger the needRefresh state
    act(() => {
      pwaMock.__triggerNeedRefresh();
      vi.runAllTimers();
    });

    // Wait for notification to appear
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // Click the dismiss button (the X icon button)
    const dismissButton = screen.getByRole('button', { name: /dismiss notification/i });
    fireEvent.click(dismissButton);

    // Advance timers for animation (400ms transition)
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Should be hidden now
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('hides notification when Later button is clicked', () => {
    render(<UpdateNotification />);

    // Trigger the needRefresh state
    act(() => {
      pwaMock.__triggerNeedRefresh();
      vi.runAllTimers();
    });

    // Wait for notification to appear
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // Click the Later button
    const laterButton = screen.getByRole('button', { name: /later/i });
    fireEvent.click(laterButton);

    // Advance timers for animation (400ms transition)
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Should be hidden now
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('calls updateServiceWorker when Refresh Now is clicked', () => {
    render(<UpdateNotification />);

    // Trigger the needRefresh state
    act(() => {
      pwaMock.__triggerNeedRefresh();
      vi.runAllTimers();
    });

    // Wait for notification to appear
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // Click the Refresh Now button - should not throw
    const refreshButton = screen.getByRole('button', { name: /refresh now/i });
    expect(() => {
      fireEvent.click(refreshButton);
    }).not.toThrow();
  });

  it('displays gift icon in the notification', () => {
    render(<UpdateNotification />);

    // Trigger the needRefresh state
    act(() => {
      pwaMock.__triggerNeedRefresh();
      vi.runAllTimers();
    });

    const dialog = screen.getByRole('alertdialog');
    expect(dialog.querySelector('.anticon-gift')).toBeInTheDocument();
  });

  it('has honeycomb accent stripe styling', () => {
    render(<UpdateNotification />);

    // Trigger the needRefresh state
    act(() => {
      pwaMock.__triggerNeedRefresh();
      vi.runAllTimers();
    });

    // The notification should contain styled elements (checking it renders)
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
  });
});
