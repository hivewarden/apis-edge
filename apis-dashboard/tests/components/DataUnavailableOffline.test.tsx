/**
 * DataUnavailableOffline Component Tests
 *
 * Tests for the offline data unavailable display component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataUnavailableOffline, DataUnavailableOfflineCompact } from '../../src/components/DataUnavailableOffline';

describe('DataUnavailableOffline', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  describe('Default Display', () => {
    it('renders with default message', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      render(<DataUnavailableOffline />);

      expect(screen.getByText("This data isn't available offline")).toBeInTheDocument();
    });

    it('renders with custom dataType', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      render(<DataUnavailableOffline dataType="hive data" />);

      expect(screen.getByText("This hive data isn't available offline")).toBeInTheDocument();
    });

    it('renders with custom title', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      render(<DataUnavailableOffline title="Custom Title" />);

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('renders with custom subtitle', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      render(<DataUnavailableOffline subtitle="Custom subtitle message" />);

      expect(screen.getByText('Custom subtitle message')).toBeInTheDocument();
    });
  });

  describe('Online State', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
        writable: true,
      });
    });

    it('shows sync button when online and onRetry provided', () => {
      render(<DataUnavailableOffline onRetry={() => {}} />);

      expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
    });

    it('calls onRetry when sync button clicked', () => {
      const onRetry = vi.fn();
      render(<DataUnavailableOffline onRetry={onRetry} />);

      fireEvent.click(screen.getByRole('button', { name: /sync now/i }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('shows loading state when syncing', () => {
      render(<DataUnavailableOffline onRetry={() => {}} isSyncing />);

      expect(screen.getByRole('button', { name: /syncing/i })).toBeInTheDocument();
    });

    it('displays correct subtitle when online', () => {
      render(<DataUnavailableOffline dataType="inspections" />);

      expect(screen.getByText(/download this inspections for offline use/i)).toBeInTheDocument();
    });
  });

  describe('Offline State', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });
    });

    it('shows waiting message when offline', () => {
      render(<DataUnavailableOffline />);

      expect(screen.getByText('Waiting for connection...')).toBeInTheDocument();
    });

    it('does not show sync button when offline', () => {
      render(<DataUnavailableOffline onRetry={() => {}} />);

      expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument();
    });

    it('displays correct subtitle when offline', () => {
      render(<DataUnavailableOffline dataType="hive data" />);

      expect(screen.getByText(/connect to the internet to sync this hive data/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has cloud download icon', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      render(<DataUnavailableOffline />);

      const icon = document.querySelector('.anticon-cloud-download');
      expect(icon).toBeInTheDocument();
    });

    it('has wifi icon in waiting state', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      render(<DataUnavailableOffline />);

      const icon = document.querySelector('.anticon-wifi');
      expect(icon).toBeInTheDocument();
    });
  });
});

describe('DataUnavailableOfflineCompact', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('renders compact message', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });

    render(<DataUnavailableOfflineCompact dataType="hive data" />);

    expect(screen.getByText('hive data not available offline')).toBeInTheDocument();
  });

  it('shows sync link when online', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });

    render(<DataUnavailableOfflineCompact onRetry={() => {}} />);

    expect(screen.getByText('Sync now')).toBeInTheDocument();
  });

  it('calls onRetry when sync link clicked', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });

    const onRetry = vi.fn();
    render(<DataUnavailableOfflineCompact onRetry={onRetry} />);

    fireEvent.click(screen.getByText('Sync now'));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows connect message when offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });

    render(<DataUnavailableOfflineCompact />);

    expect(screen.getByText('Connect to sync')).toBeInTheDocument();
  });
});
