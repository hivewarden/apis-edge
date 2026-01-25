/**
 * SyncStatus Component Tests
 *
 * Tests for the sync status display component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SyncStatus } from '../../src/components/SyncStatus';

describe('SyncStatus', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  describe('Full Display Mode', () => {
    it('renders online status when connected', () => {
      render(<SyncStatus lastSynced={new Date()} />);

      expect(screen.getByText('Online')).toBeInTheDocument();
    });

    it('renders offline status when disconnected', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      render(<SyncStatus lastSynced={null} />);

      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('displays "Never synced" when lastSynced is null', () => {
      render(<SyncStatus lastSynced={null} />);

      expect(screen.getByText('Never synced')).toBeInTheDocument();
    });

    it('displays relative time when lastSynced is provided', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      render(<SyncStatus lastSynced={twoHoursAgo} />);

      expect(screen.getByText(/Last synced 2 hours ago/i)).toBeInTheDocument();
    });

    it('displays storage progress bar', () => {
      render(<SyncStatus lastSynced={new Date()} storageUsedMB={25} maxStorageMB={50} />);

      // Check for storage text
      expect(screen.getByText('25.0MB / 50MB')).toBeInTheDocument();
    });

    it('shows warning when storage is high', () => {
      render(<SyncStatus lastSynced={new Date()} storageUsedMB={45} maxStorageMB={50} />);

      expect(screen.getByText(/Storage nearly full/i)).toBeInTheDocument();
    });

    it('does not show warning when storage is low', () => {
      render(<SyncStatus lastSynced={new Date()} storageUsedMB={10} maxStorageMB={50} />);

      expect(screen.queryByText(/Storage nearly full/i)).not.toBeInTheDocument();
    });
  });

  describe('Sync Button', () => {
    it('renders sync button when online and onSyncNow provided', () => {
      const onSyncNow = vi.fn();
      render(<SyncStatus lastSynced={new Date()} onSyncNow={onSyncNow} />);

      expect(screen.getByText('Sync now')).toBeInTheDocument();
    });

    it('calls onSyncNow when button clicked', () => {
      const onSyncNow = vi.fn();
      render(<SyncStatus lastSynced={new Date()} onSyncNow={onSyncNow} />);

      fireEvent.click(screen.getByText('Sync now'));

      expect(onSyncNow).toHaveBeenCalledTimes(1);
    });

    it('disables button when syncing', () => {
      const onSyncNow = vi.fn();
      render(<SyncStatus lastSynced={new Date()} onSyncNow={onSyncNow} isSyncing />);

      const button = screen.getByRole('button', { name: /syncing/i });
      expect(button).toBeDisabled();
    });

    it('shows "Syncing..." text when syncing', () => {
      render(<SyncStatus lastSynced={new Date()} onSyncNow={() => {}} isSyncing />);

      expect(screen.getByText('Syncing...')).toBeInTheDocument();
    });

    it('does not show sync button when offline', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      render(<SyncStatus lastSynced={new Date()} onSyncNow={() => {}} />);

      expect(screen.queryByText('Sync now')).not.toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('renders compact version', () => {
      render(<SyncStatus lastSynced={new Date()} compact />);

      expect(screen.getByText('Synced')).toBeInTheDocument();
    });

    it('shows "Offline" in compact mode when disconnected', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      render(<SyncStatus lastSynced={null} compact />);

      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('shows "Syncing..." in compact mode when syncing', () => {
      render(<SyncStatus lastSynced={new Date()} compact isSyncing />);

      expect(screen.getByText('Syncing...')).toBeInTheDocument();
    });

    it('does not show storage bar in compact mode', () => {
      render(<SyncStatus lastSynced={new Date()} storageUsedMB={25} compact />);

      expect(screen.queryByText(/25.0MB/)).not.toBeInTheDocument();
    });
  });

  describe('Card Wrapper', () => {
    it('renders as card by default (non-compact)', () => {
      render(<SyncStatus lastSynced={new Date()} />);

      // Should have card class
      const card = document.querySelector('.ant-card');
      expect(card).toBeInTheDocument();
    });

    it('does not render as card when showAsCard is false', () => {
      render(<SyncStatus lastSynced={new Date()} showAsCard={false} />);

      const card = document.querySelector('.ant-card');
      expect(card).not.toBeInTheDocument();
    });
  });
});
