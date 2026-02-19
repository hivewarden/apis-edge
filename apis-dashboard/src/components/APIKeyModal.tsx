import { Modal, Button, Alert, Input, Typography, Space, message } from 'antd';
import { CopyOutlined, CheckOutlined, DownloadOutlined } from '@ant-design/icons';
import { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import { colors } from '../theme/apisTheme';

const { Text } = Typography;

interface APIKeyModalProps {
  visible: boolean;
  apiKey: string;
  onClose: () => void;
  isRegenerate?: boolean;
  serverUrl?: string;
}

/**
 * API Key Modal Component
 *
 * Displays a newly generated API key with copy functionality.
 * Used when registering a unit or regenerating an API key.
 *
 * Part of Epic 2, Story 2.2: Register APIS Units
 */
export function APIKeyModal({ visible, apiKey, onClose, isRegenerate = false, serverUrl }: APIKeyModalProps) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !serverUrl || !apiKey) return;

    const payload = JSON.stringify({ s: serverUrl, k: apiKey });
    QRCode.toCanvas(canvasRef.current, payload, {
      width: 220,
      margin: 2,
      color: {
        dark: colors.brownBramble,
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    }).catch((err: unknown) => {
      console.error('QR generation error:', err);
    });
  }, [serverUrl, apiKey, visible]);

  const handleDownloadQR = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `hivewarden-setup-qr.png`;
    a.click();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      message.success('API key copied to clipboard');
      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('Failed to copy to clipboard');
    }
  };

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Modal
      title={isRegenerate ? 'New API Key Generated' : 'Unit Registered Successfully'}
      open={visible}
      onCancel={handleClose}
      footer={[
        <Button
          key="copy"
          type="primary"
          icon={copied ? <CheckOutlined /> : <CopyOutlined />}
          onClick={handleCopy}
        >
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </Button>,
        <Button key="close" onClick={handleClose}>
          I&apos;ve Saved It
        </Button>,
      ]}
      closable={false}
      maskClosable={false}
      width={520}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="Save this API key securely"
          description={
            isRegenerate
              ? 'This key will only be shown once. The old key has been invalidated and will no longer work.'
              : 'This key will only be shown once. If you lose it, you will need to regenerate a new one.'
          }
        />

        <div>
          <Text strong>API Key:</Text>
          <Input.TextArea
            value={apiKey}
            readOnly
            autoSize={{ minRows: 1, maxRows: 2 }}
            style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              marginTop: 8,
              backgroundColor: colors.coconutCream,
            }}
          />
        </div>

        <Text type="secondary" style={{ fontSize: 12 }}>
          Use this key in the <code>X-API-Key</code> header when your unit communicates with the server.
        </Text>

        {serverUrl && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 16,
            backgroundColor: '#fff',
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
          }}>
            <Text strong style={{ marginBottom: 12 }}>
              Scan this QR code on the device setup page
            </Text>
            <canvas
              ref={canvasRef}
              style={{
                border: `2px solid ${colors.seaBuckthorn}`,
                borderRadius: 8,
              }}
            />
            <Button
              icon={<DownloadOutlined />}
              onClick={handleDownloadQR}
              size="small"
              style={{ marginTop: 12 }}
            >
              Download QR
            </Button>
          </div>
        )}
      </Space>
    </Modal>
  );
}

export default APIKeyModal;
