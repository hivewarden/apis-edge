import { Modal, Button, Alert, Input, Typography, Space, message } from 'antd';
import { CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { useState } from 'react';

const { Text } = Typography;

interface APIKeyModalProps {
  visible: boolean;
  apiKey: string;
  onClose: () => void;
  isRegenerate?: boolean;
}

/**
 * API Key Modal Component
 *
 * Displays a newly generated API key with copy functionality.
 * Used when registering a unit or regenerating an API key.
 *
 * Part of Epic 2, Story 2.2: Register APIS Units
 */
export function APIKeyModal({ visible, apiKey, onClose, isRegenerate = false }: APIKeyModalProps) {
  const [copied, setCopied] = useState(false);

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
              backgroundColor: '#f5f5f5',
            }}
          />
        </div>

        <Text type="secondary" style={{ fontSize: 12 }}>
          Use this key in the <code>X-API-Key</code> header when your unit communicates with the server.
        </Text>
      </Space>
    </Modal>
  );
}

export default APIKeyModal;
