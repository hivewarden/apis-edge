/**
 * useQRScanner Hook
 *
 * Manages QR scanner state for the QRScannerModal component.
 * Provides functions to open/close the scanner and tracks
 * browser support for camera access.
 *
 * Navigation Performance Note:
 * The AC#2 500ms navigation timing target is a best-effort UX goal.
 * Actual performance depends on device capabilities, camera startup time,
 * and QR code detection speed. The implementation prioritizes reliability
 * over strict timing guarantees.
 *
 * Part of Epic 7, Story 7.6: QR Code Hive Navigation
 */
import { useState, useCallback } from 'react';

/**
 * QR Scanner state and controls
 */
export interface UseQRScannerResult {
  /** Whether the browser supports camera access via getUserMedia */
  isSupported: boolean;
  /** Whether the scanner modal is currently open */
  isOpen: boolean;
  /** Whether the scanner is actively scanning (camera running) */
  isScanning: boolean;
  /** Error message if scanner cannot be opened */
  error: string | null;
  /** Last successfully scanned QR code result */
  lastResult: string | null;
  /** Opens the QR scanner modal */
  openScanner: () => void;
  /** Closes the QR scanner modal */
  closeScanner: () => void;
  /** Sets the scanning state (used by QRScannerModal) */
  setScanning: (scanning: boolean) => void;
  /** Sets the last scanned result (used by QRScannerModal) */
  setLastResult: (result: string | null) => void;
  /** Resets scanner state (clears error, lastResult, and closes modal) */
  reset: () => void;
}

/**
 * Hook for managing QR scanner state
 *
 * @returns Scanner state and control functions
 *
 * @example
 * ```tsx
 * const { isSupported, isOpen, isScanning, lastResult, openScanner, closeScanner, reset } = useQRScanner();
 *
 * return (
 *   <>
 *     <Button onClick={openScanner} disabled={!isSupported}>
 *       Scan QR
 *     </Button>
 *     <QRScannerModal open={isOpen} onClose={closeScanner} />
 *   </>
 * );
 * ```
 */
export function useQRScanner(): UseQRScannerResult {
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // Check if browser supports getUserMedia (required for camera access)
  const isSupported =
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    'getUserMedia' in navigator.mediaDevices;

  const openScanner = useCallback(() => {
    if (!isSupported) {
      setError('Camera not supported on this device');
      return;
    }
    setError(null);
    setIsOpen(true);
  }, [isSupported]);

  const closeScanner = useCallback(() => {
    setIsOpen(false);
    setIsScanning(false);
    setError(null);
  }, []);

  const setScanning = useCallback((scanning: boolean) => {
    setIsScanning(scanning);
  }, []);

  const setLastResultCallback = useCallback((result: string | null) => {
    setLastResult(result);
  }, []);

  /**
   * Resets all scanner state to initial values.
   * Useful when navigating away or starting a fresh scan session.
   */
  const reset = useCallback(() => {
    setIsOpen(false);
    setIsScanning(false);
    setError(null);
    setLastResult(null);
  }, []);

  return {
    isSupported,
    isOpen,
    isScanning,
    error,
    lastResult,
    openScanner,
    closeScanner,
    setScanning,
    setLastResult: setLastResultCallback,
    reset,
  };
}

export default useQRScanner;
