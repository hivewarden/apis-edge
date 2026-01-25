/**
 * QRGeneratorModal Component
 *
 * Modal for viewing, downloading, and printing QR codes for hives.
 * Wraps QRCodeGenerator with action buttons and print functionality.
 *
 * Part of Epic 7, Story 7.6: QR Code Hive Navigation
 */
import React, { useRef } from 'react';
import { Modal, Button, Space, message } from 'antd';
import { DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import { QRCodeGenerator } from './QRCodeGenerator';
import { touchTargets } from '../theme/apisTheme';
import '../styles/qr-print.css';

/**
 * Minimal hive interface for QR generation
 */
export interface QRHive {
  id: string;
  name: string;
}

/**
 * Props for QRGeneratorModal
 */
export interface QRGeneratorModalProps {
  /** Hive data for QR code generation */
  hive: QRHive;
  /** Site ID for the QR code URL */
  siteId: string;
  /** Site name for display below QR code */
  siteName: string;
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onClose: () => void;
}

/**
 * QRGeneratorModal - Modal for QR code viewing, download, and printing
 *
 * Features:
 * - Display QR code with hive and site names
 * - Download as PNG with sanitized filename
 * - Print with optimized stylesheet
 * - Glove-friendly 64px touch targets
 */
export function QRGeneratorModal({
  hive,
  siteId,
  siteName,
  open,
  onClose,
}: QRGeneratorModalProps): React.ReactElement {
  const printRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    const canvas = printRef.current?.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      // Sanitize filename: replace spaces and special chars with underscore
      const sanitizedName = hive.name.replace(/[^a-zA-Z0-9-]/g, '_');
      link.download = `${sanitizedName}_qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      message.success('QR code downloaded');
    } else {
      message.error('QR code not ready for download');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      title={`QR Code: ${hive.name}`}
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            style={{ minHeight: touchTargets.mobile }}
          >
            Download PNG
          </Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
            style={{ minHeight: touchTargets.mobile }}
          >
            Print
          </Button>
        </Space>
      }
      width={400}
      centered
    >
      <div ref={printRef} className="qr-print-area">
        <QRCodeGenerator
          siteId={siteId}
          hiveId={hive.id}
          hiveName={hive.name}
          siteName={siteName}
        />
        {/* Additional crop marks for print */}
        <div className="crop-mark-tr" />
        <div className="crop-mark-bl" />
      </div>
    </Modal>
  );
}

export default QRGeneratorModal;
