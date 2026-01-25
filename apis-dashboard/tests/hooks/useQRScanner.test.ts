/**
 * Tests for useQRScanner hook
 *
 * @module tests/hooks/useQRScanner.test
 *
 * Part of Epic 7, Story 7.6: QR Code Hive Navigation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQRScanner } from '../../src/hooks/useQRScanner';

describe('useQRScanner', () => {
  const originalNavigator = window.navigator;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(window, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe('browser support detection', () => {
    it('should detect when getUserMedia is available', () => {
      // Mock navigator with mediaDevices
      Object.defineProperty(window, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: vi.fn(),
          },
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useQRScanner());

      expect(result.current.isSupported).toBe(true);
    });

    it('should report unsupported when mediaDevices is not available', () => {
      // Mock navigator without mediaDevices
      Object.defineProperty(window, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useQRScanner());

      expect(result.current.isSupported).toBe(false);
    });

    it('should report unsupported when getUserMedia is not available', () => {
      // Mock navigator with mediaDevices but without getUserMedia
      Object.defineProperty(window, 'navigator', {
        value: {
          mediaDevices: {},
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useQRScanner());

      expect(result.current.isSupported).toBe(false);
    });
  });

  describe('open/close functionality', () => {
    beforeEach(() => {
      // Ensure camera is supported for these tests
      Object.defineProperty(window, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: vi.fn(),
          },
        },
        writable: true,
        configurable: true,
      });
    });

    it('should start with isOpen as false', () => {
      const { result } = renderHook(() => useQRScanner());

      expect(result.current.isOpen).toBe(false);
    });

    it('should set isOpen to true when openScanner is called', () => {
      const { result } = renderHook(() => useQRScanner());

      act(() => {
        result.current.openScanner();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('should set isOpen to false when closeScanner is called', () => {
      const { result } = renderHook(() => useQRScanner());

      act(() => {
        result.current.openScanner();
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.closeScanner();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('should clear error when closeScanner is called', () => {
      // First make camera unsupported to trigger error
      Object.defineProperty(window, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useQRScanner());

      act(() => {
        result.current.openScanner();
      });

      expect(result.current.error).toBe('Camera not supported on this device');

      act(() => {
        result.current.closeScanner();
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('error handling', () => {
    it('should set error when openScanner is called without camera support', () => {
      // Mock navigator without camera support
      Object.defineProperty(window, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useQRScanner());

      act(() => {
        result.current.openScanner();
      });

      expect(result.current.error).toBe('Camera not supported on this device');
      expect(result.current.isOpen).toBe(false);
    });

    it('should clear error when openScanner succeeds', () => {
      Object.defineProperty(window, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: vi.fn(),
          },
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useQRScanner());

      act(() => {
        result.current.openScanner();
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      Object.defineProperty(window, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: vi.fn(),
          },
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useQRScanner());

      expect(result.current.isOpen).toBe(false);
      expect(result.current.isScanning).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.lastResult).toBe(null);
      expect(result.current.isSupported).toBe(true);
      expect(typeof result.current.openScanner).toBe('function');
      expect(typeof result.current.closeScanner).toBe('function');
      expect(typeof result.current.setScanning).toBe('function');
      expect(typeof result.current.setLastResult).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('isScanning state', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: vi.fn(),
          },
        },
        writable: true,
        configurable: true,
      });
    });

    it('should start with isScanning as false', () => {
      const { result } = renderHook(() => useQRScanner());

      expect(result.current.isScanning).toBe(false);
    });

    it('should update isScanning when setScanning is called', () => {
      const { result } = renderHook(() => useQRScanner());

      act(() => {
        result.current.setScanning(true);
      });

      expect(result.current.isScanning).toBe(true);

      act(() => {
        result.current.setScanning(false);
      });

      expect(result.current.isScanning).toBe(false);
    });

    it('should reset isScanning when closeScanner is called', () => {
      const { result } = renderHook(() => useQRScanner());

      act(() => {
        result.current.openScanner();
        result.current.setScanning(true);
      });

      expect(result.current.isScanning).toBe(true);

      act(() => {
        result.current.closeScanner();
      });

      expect(result.current.isScanning).toBe(false);
    });
  });

  describe('lastResult state', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: vi.fn(),
          },
        },
        writable: true,
        configurable: true,
      });
    });

    it('should start with lastResult as null', () => {
      const { result } = renderHook(() => useQRScanner());

      expect(result.current.lastResult).toBe(null);
    });

    it('should update lastResult when setLastResult is called', () => {
      const { result } = renderHook(() => useQRScanner());

      act(() => {
        result.current.setLastResult('apis://hive/site-1/hive-1');
      });

      expect(result.current.lastResult).toBe('apis://hive/site-1/hive-1');
    });

    it('should allow clearing lastResult', () => {
      const { result } = renderHook(() => useQRScanner());

      act(() => {
        result.current.setLastResult('apis://hive/site-1/hive-1');
      });

      expect(result.current.lastResult).toBe('apis://hive/site-1/hive-1');

      act(() => {
        result.current.setLastResult(null);
      });

      expect(result.current.lastResult).toBe(null);
    });
  });

  describe('reset function', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: vi.fn(),
          },
        },
        writable: true,
        configurable: true,
      });
    });

    it('should reset all state to initial values', () => {
      const { result } = renderHook(() => useQRScanner());

      // Set up some state
      act(() => {
        result.current.openScanner();
        result.current.setScanning(true);
        result.current.setLastResult('apis://hive/site-1/hive-1');
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.isScanning).toBe(true);
      expect(result.current.lastResult).toBe('apis://hive/site-1/hive-1');

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.isScanning).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.lastResult).toBe(null);
    });
  });
});
