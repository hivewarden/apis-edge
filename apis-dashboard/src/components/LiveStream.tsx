import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Button, Spin, Space, Card } from 'antd';
import {
  CloseOutlined,
  ReloadOutlined,
  DisconnectOutlined,
  WifiOutlined,
} from '@ant-design/icons';

interface LiveStreamProps {
  unitId: string;
  unitStatus: string;
  onClose: () => void;
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'error' | 'offline';

/**
 * LiveStream Component
 *
 * Displays live video stream from an APIS unit via WebSocket proxy.
 * Handles connection states, automatic reconnection, and proper cleanup.
 *
 * Part of Epic 2, Story 2.5: Live Video WebSocket Proxy
 */
export function LiveStream({ unitId, unitStatus, onClose }: LiveStreamProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(
    unitStatus !== 'online' ? 'offline' : 'connecting'
  );
  const wsRef = useRef<WebSocket | null>(null);
  // Use ref for retry count to avoid stale closure issues in WebSocket callbacks
  const retryCountRef = useRef(0);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (unitStatus !== 'online') {
      setStatus('offline');
      return;
    }

    // Validate unitId format to prevent WebSocket URL injection
    if (!/^[a-f0-9-]+$/i.test(unitId)) {
      setStatus('error');
      return;
    }

    // Clean up any existing connection
    cleanup();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream/${unitId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      setStatus('connected');
      retryCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      // Handle binary JPEG frame
      if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        // Use functional update to properly revoke previous URL
        setImageSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } else if (typeof event.data === 'string') {
        // Text message indicates an error from server
        console.error('Stream error:', event.data);
      }
    };

    ws.onclose = (event) => {
      // Don't retry if closed normally (code 1000) or component unmounting
      if (event.code === 1000) {
        return;
      }

      // Use ref to get current retry count (avoids stale closure)
      const currentRetryCount = retryCountRef.current;
      if (currentRetryCount < MAX_RETRIES) {
        setStatus('reconnecting');
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, currentRetryCount);
        retryCountRef.current = currentRetryCount + 1;
        setTimeout(() => {
          connect();
        }, delay);
      } else {
        setStatus('error');
      }
    };

    ws.onerror = () => {
      // onclose will be called after onerror
    };
  }, [unitId, unitStatus, cleanup]);

  useEffect(() => {
    if (unitStatus === 'online') {
      connect();
    } else {
      setStatus('offline');
    }

    return () => {
      cleanup();
      // Revoke any remaining blob URL on unmount
      setImageSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [connect, unitStatus, cleanup]);

  const handleRetry = () => {
    retryCountRef.current = 0;
    connect();
  };

  // Derive display retry count from ref for UI display
  const displayRetryCount = retryCountRef.current;

  if (status === 'offline') {
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="warning"
            message="Unit is offline - live feed unavailable"
            icon={<DisconnectOutlined />}
            showIcon
          />
          <Button icon={<CloseOutlined />} onClick={onClose}>
            Close
          </Button>
        </Space>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <WifiOutlined style={{ color: status === 'connected' ? '#52c41a' : undefined }} />
          Live Feed
        </Space>
      }
      extra={
        <Button
          type="default"
          shape="circle"
          icon={<CloseOutlined style={{ fontSize: 14 }} />}
          onClick={onClose}
          aria-label="Close live feed"
          style={{
            minWidth: 36,
            width: 36,
            height: 36,
            color: '#9d7a48',
            borderColor: 'rgba(157, 122, 72, 0.45)',
            backgroundColor: 'rgba(157, 122, 72, 0.1)',
          }}
        />
      }
    >
      <div style={{ position: 'relative', minHeight: 200 }}>
        {status === 'connecting' && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin tip="Connecting to stream..." />
          </div>
        )}

        {status === 'reconnecting' && (
          <Alert
            type="info"
            message={`Connection lost - Reconnecting... (attempt ${displayRetryCount}/${MAX_RETRIES})`}
            icon={<ReloadOutlined spin />}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {status === 'error' && (
          <Alert
            type="error"
            message="Connection failed"
            description="Unable to connect to the unit's video stream after multiple attempts."
            action={
              <Button size="small" onClick={handleRetry}>
                Retry
              </Button>
            }
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {imageSrc && (
          <img
            src={imageSrc}
            alt="Live stream from APIS unit"
            style={{
              maxWidth: '100%',
              display: 'block',
              borderRadius: 4,
            }}
          />
        )}
      </div>
    </Card>
  );
}

export default LiveStream;
