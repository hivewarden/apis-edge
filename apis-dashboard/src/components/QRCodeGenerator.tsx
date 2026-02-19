/**
 * QRCodeGenerator Component
 *
 * Generates QR codes for hives using the APIS URL scheme.
 * QR codes can be printed and attached to physical hives
 * for quick identification via scanning.
 *
 * QR Code Format: apis://hive/{site_id}/{hive_id}
 *
 * Part of Epic 7, Story 7.6: QR Code Hive Navigation
 */
import React, { useEffect, useRef, useState } from 'react';
import { Typography, Space, Spin } from 'antd';
import QRCode from 'qrcode';
import { colors } from '../theme/apisTheme';

const { Text, Title } = Typography;

/**
 * Props for QRCodeGenerator
 */
export interface QRCodeGeneratorProps {
  /** Site ID for the QR code URL */
  siteId: string;
  /** Hive ID for the QR code URL */
  hiveId: string;
  /** Display name of the hive (shown below QR code) */
  hiveName: string;
  /** Optional display name of the site (shown as secondary text) */
  siteName?: string;
}

/**
 * Generate the QR code content URL
 * @param siteId - Site identifier
 * @param hiveId - Hive identifier
 * @returns The APIS URL scheme string
 */
export function generateQRContent(siteId: string, hiveId: string): string {
  return `apis://hive/${siteId}/${hiveId}`;
}

/**
 * QRCodeGenerator - Generates printable QR codes for hives
 *
 * Features:
 * - Generates QR code with high error correction (for outdoor durability)
 * - Displays hive name below QR for human readability
 * - Uses APIS theme colors
 * - Sized appropriately for printing (minimum 2.5cm x 2.5cm)
 */
export function QRCodeGenerator({
  siteId,
  hiveId,
  hiveName,
  siteName,
}: QRCodeGeneratorProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const qrContent = generateQRContent(siteId, hiveId);

  useEffect(() => {
    const generateQR = async () => {
      if (!canvasRef.current) return;

      try {
        setLoading(true);
        setError(null);

        await QRCode.toCanvas(canvasRef.current, qrContent, {
          width: 200,
          margin: 2,
          color: {
            dark: colors.brownBramble,
            light: '#ffffff',
          },
          errorCorrectionLevel: 'H', // High error correction for outdoor durability
        });

        setLoading(false);
      } catch (err) {
        console.error('QR generation error:', err);
        setError('Failed to generate QR code');
        setLoading(false);
      }
    };

    generateQR();
  }, [qrContent]);

  if (error) {
    return (
      <div
        className="qr-code-container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 24,
          backgroundColor: '#fff',
        }}
      >
        <Text type="danger">{error}</Text>
      </div>
    );
  }

  return (
    <div
      className="qr-code-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#fff',
      }}
    >
      {loading && <Spin size="large" />}
      <canvas
        ref={canvasRef}
        data-testid="qr-canvas"
        style={{
          display: loading ? 'none' : 'block',
          border: `2px solid ${colors.seaBuckthorn}`,
          borderRadius: 8,
        }}
      />
      {!loading && (
        <Space direction="vertical" align="center" style={{ marginTop: 16 }}>
          <Title level={4} style={{ margin: 0, color: colors.brownBramble }}>
            {hiveName}
          </Title>
          {siteName && (
            <Text type="secondary" style={{ fontSize: 14 }}>
              {siteName}
            </Text>
          )}
        </Space>
      )}
    </div>
  );
}

export default QRCodeGenerator;
