/**
 * Tests for QRScannerModal component
 *
 * @module tests/components/QRScannerModal.test
 *
 * Part of Epic 7, Story 7.6: QR Code Hive Navigation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

// Mock html5-qrcode
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
    getState: vi.fn().mockReturnValue(1), // 1 = NOT_STARTED
  })),
}));

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { QRScannerModal, parseQRCode } from '../../src/components/QRScannerModal';

const renderWithRouter = (component: React.ReactNode) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('QRScannerModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parseQRCode', () => {
    it('should parse valid APIS QR code format', () => {
      const result = parseQRCode('apis://hive/site-123/hive-456');

      expect(result).toEqual({
        siteId: 'site-123',
        hiveId: 'hive-456',
      });
    });

    it('should parse QR code with UUID-style IDs', () => {
      const result = parseQRCode('apis://hive/abc123-def456/xyz789-uvw321');

      expect(result).toEqual({
        siteId: 'abc123-def456',
        hiveId: 'xyz789-uvw321',
      });
    });

    it('should parse QR code with underscore in IDs', () => {
      const result = parseQRCode('apis://hive/my_site_1/my_hive_2');

      expect(result).toEqual({
        siteId: 'my_site_1',
        hiveId: 'my_hive_2',
      });
    });

    it('should return null for invalid format - missing prefix', () => {
      const result = parseQRCode('hive/site-123/hive-456');

      expect(result).toBeNull();
    });

    it('should return null for invalid format - wrong protocol', () => {
      const result = parseQRCode('http://hive/site-123/hive-456');

      expect(result).toBeNull();
    });

    it('should return null for invalid format - missing hive ID', () => {
      const result = parseQRCode('apis://hive/site-123');

      expect(result).toBeNull();
    });

    it('should return null for invalid format - extra path segments', () => {
      const result = parseQRCode('apis://hive/site-123/hive-456/extra');

      expect(result).toBeNull();
    });

    it('should return null for random URL', () => {
      const result = parseQRCode('https://google.com');

      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseQRCode('');

      expect(result).toBeNull();
    });
  });

  describe('rendering', () => {
    it('should render instruction text when open', () => {
      renderWithRouter(<QRScannerModal open={true} onClose={mockOnClose} />);

      expect(screen.getByText('Point at hive QR code')).toBeInTheDocument();
    });

    it('should render cancel button', () => {
      renderWithRouter(<QRScannerModal open={true} onClose={mockOnClose} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should render qr-reader container', () => {
      renderWithRouter(<QRScannerModal open={true} onClose={mockOnClose} />);

      expect(document.getElementById('qr-reader')).toBeInTheDocument();
    });

    it('should not render content when closed', () => {
      renderWithRouter(<QRScannerModal open={false} onClose={mockOnClose} />);

      expect(screen.queryByText('Point at hive QR code')).not.toBeInTheDocument();
    });
  });

  describe('cancel button', () => {
    it('should call onClose when cancel button is clicked', () => {
      renderWithRouter(<QRScannerModal open={true} onClose={mockOnClose} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('touch target sizing', () => {
    it('should have 64px minimum height for cancel button', () => {
      renderWithRouter(<QRScannerModal open={true} onClose={mockOnClose} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toHaveStyle({ minHeight: '64px' });
    });
  });
});
