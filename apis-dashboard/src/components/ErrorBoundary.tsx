import { Component, ErrorInfo, ReactNode } from 'react';
import { Result, Button, Typography } from 'antd';
import { ReloadOutlined, CloudDownloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

/**
 * ErrorBoundary component that catches JavaScript errors in child components.
 * Displays a friendly error message with a retry option instead of crashing the entire page.
 *
 * Special handling for chunk loading errors:
 * - Detects when lazy-loaded chunks fail to load (common after deployments)
 * - Shows "Update Available" message with reload button
 * - Helps users recover from stale cache issues
 *
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 *
 * Or with custom fallback:
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <YourComponent />
 * </ErrorBoundary>
 *
 * Part of Story 2.2 remediation: Frontend error handling improvement.
 * Enhanced for code splitting support.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Detect chunk loading errors - these occur when:
    // 1. A deployment changes chunk hashes
    // 2. User has cached old HTML referencing old chunks
    // 3. Network issues prevent chunk download
    const isChunkError =
      error.message.includes('Loading chunk') ||
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Unable to preload CSS') ||
      error.message.includes('error loading dynamically imported module') ||
      error.message.includes('Load failed') ||  // Safari
      error.message.includes('Importing a module script failed') ||  // Firefox
      error.message.includes('NetworkError') ||
      (error.name === 'ChunkLoadError');

    return { hasError: true, error, isChunkError };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // In production, you might want to send this to an error tracking service
    // Example: errorTrackingService.logError(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, isChunkError: false });
  };

  handleReload = () => {
    // Force reload from server (bypass cache)
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Chunk loading error - show update available message
      if (this.state.isChunkError) {
        return (
          <Result
            icon={<CloudDownloadOutlined style={{ color: '#1890ff' }} />}
            title="Update Available"
            subTitle={
              <>
                <Text>A new version of Hive Warden is available.</Text>
                <br />
                <Text type="secondary">Please reload to get the latest version.</Text>
              </>
            }
            extra={[
              <Button
                key="reload"
                type="primary"
                icon={<ReloadOutlined />}
                onClick={this.handleReload}
              >
                Reload Page
              </Button>,
              <Button
                key="home"
                onClick={() => (window.location.href = '/')}
              >
                Go to Dashboard
              </Button>,
            ]}
          />
        );
      }

      // Default error UI for other errors
      return (
        <Result
          status="error"
          title="Something went wrong"
          subTitle="We encountered an unexpected error. Please try again."
          extra={[
            <Button
              key="retry"
              type="primary"
              icon={<ReloadOutlined />}
              onClick={this.handleRetry}
            >
              Try Again
            </Button>,
            <Button
              key="home"
              onClick={() => (window.location.href = '/')}
            >
              Go to Dashboard
            </Button>,
          ]}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
