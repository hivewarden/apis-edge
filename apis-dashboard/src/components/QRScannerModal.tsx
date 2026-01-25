/**
 * QRScannerModal Component
 *
 * Modal with camera viewfinder for scanning QR codes on hives.
 * Uses html5-qrcode library for camera access and QR code detection.
 *
 * QR Code Format: apis://hive/{site_id}/{hive_id}
 *
 * Part of Epic 7, Story 7.6: QR Code Hive Navigation
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Modal, Button, Typography, Space, Alert, Result } from 'antd';
import { ReloadOutlined, CloseOutlined, CameraOutlined } from '@ant-design/icons';
import { Html5Qrcode } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { colors, touchTargets } from '../theme/apisTheme';

const { Text } = Typography;

/** Inner text component for modal */

/**
 * Props for QRScannerModal
 */
export interface QRScannerModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onClose: () => void;
}

/**
 * QR code format pattern
 * Format: apis://hive/{site_id}/{hive_id}
 */
const QR_PATTERN = /^apis:\/\/hive\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/;

/**
 * Parse a QR code string and extract site and hive IDs
 * @param qrContent - The decoded QR code content
 * @returns Object with siteId and hiveId, or null if invalid
 */
export function parseQRCode(qrContent: string): { siteId: string; hiveId: string } | null {
  const match = qrContent.match(QR_PATTERN);
  if (!match) {
    return null;
  }
  return {
    siteId: match[1],
    hiveId: match[2],
  };
}

/**
 * QRScannerModal - Camera-based QR code scanner for hive navigation
 *
 * Features:
 * - Camera viewfinder with target area
 * - Automatic navigation on valid scan
 * - Error handling for invalid codes
 * - Camera permission handling
 * - Glove-friendly 64px touch targets
 */
export function QRScannerModal({ open, onClose }: QRScannerModalProps): React.ReactElement {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  /**
   * Stops the QR scanner if it's running and cleans up resources.
   * Handles the scanner state check to avoid stopping an already stopped scanner.
   * Errors during cleanup are logged but not thrown to prevent UI disruption.
   */
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const scannerState = scannerRef.current.getState();
        // Only stop if scanner is actually running (state 2 = SCANNING)
        if (scannerState === 2) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        // Ignore errors during cleanup
        console.debug('Scanner cleanup:', e);
      }
      scannerRef.current = null;
    }
  }, []);

  /**
   * Handles successful QR code scan by parsing and navigating to the hive.
   * If the QR code is invalid (not APIS format), shows an error instead.
   * @param decodedText - The raw string content from the scanned QR code
   */
  const handleScanSuccess = useCallback(
    async (decodedText: string) => {
      const result = parseQRCode(decodedText);

      if (result) {
        // Stop scanner before navigation
        await stopScanner();
        onClose();
        // Navigate to hive detail page
        navigate(`/hives/${result.hiveId}`);
      } else {
        // Invalid QR code - stop scanner and show error
        await stopScanner();
        setError('Not recognized as an APIS hive code');
      }
    },
    [navigate, onClose, stopScanner]
  );

  /**
   * Initializes and starts the QR code scanner with camera access.
   * Uses the back camera on mobile devices (facingMode: 'environment').
   * Handles permission errors gracefully with user-friendly messages.
   */
  const startScanner = useCallback(async () => {
    try {
      setError(null);
      setPermissionDenied(false);

      // Create scanner instance
      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' }, // Use back camera on mobile
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        () => {
          // QR code not detected - ignore, keep scanning
        }
      );
    } catch (err) {
      console.error('Scanner error:', err);
      if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
        setPermissionDenied(true);
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else {
        setError('Failed to start camera. Please check your device has a camera.');
      }
    }
  }, [handleScanSuccess]);

  /**
   * Handles retry button click by clearing error state and restarting scanner.
   */
  const handleRetry = useCallback(() => {
    setError(null);
    startScanner();
  }, [startScanner]);

  /**
   * Handles modal close by stopping scanner, clearing state, and calling onClose callback.
   */
  const handleClose = useCallback(() => {
    stopScanner();
    setError(null);
    setPermissionDenied(false);
    onClose();
  }, [stopScanner, onClose]);

  useEffect(() => {
    if (open) {
      // Small delay to allow modal to render the container div
      const timer = setTimeout(() => startScanner(), 100);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    }
    // When modal closes, stop the scanner
    stopScanner();
    return undefined;
  }, [open, startScanner, stopScanner]);

  return (
    <Modal
      title={null}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={400}
      centered
      destroyOnHidden
      styles={{
        body: { padding: 24, textAlign: 'center' },
      }}
    >
      {permissionDenied ? (
        <Result
          icon={<CameraOutlined style={{ color: colors.seaBuckthorn }} />}
          title="Camera Access Required"
          subTitle="Please allow camera access in your browser settings to scan QR codes."
          extra={
            <Button
              type="primary"
              onClick={handleClose}
              style={{ minHeight: touchTargets.mobile }}
            >
              Close
            </Button>
          }
        />
      ) : error ? (
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <Alert type="warning" message={error} showIcon />
          <Space size={16}>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRetry}
              style={{ minHeight: touchTargets.mobile, minWidth: 120 }}
            >
              Try Again
            </Button>
            <Button
              icon={<CloseOutlined />}
              onClick={handleClose}
              style={{ minHeight: touchTargets.mobile, minWidth: 120 }}
            >
              Cancel
            </Button>
          </Space>
        </Space>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div
            id="qr-reader"
            style={{
              width: '100%',
              minHeight: 300,
              borderRadius: 8,
              overflow: 'hidden',
              backgroundColor: '#000',
            }}
          />
          <Text style={{ color: colors.brownBramble, fontSize: 16 }}>
            Point at hive QR code
          </Text>
          <Button
            icon={<CloseOutlined />}
            onClick={handleClose}
            style={{ minHeight: touchTargets.mobile }}
          >
            Cancel
          </Button>
        </Space>
      )}
    </Modal>
  );
}

export default QRScannerModal;
