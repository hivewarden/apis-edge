import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

// Explicit @ant-design/icons mock to override setup.ts Proxy mock.
// The Proxy mock hangs during module resolution for transitive imports;
// explicit named exports resolve instantly.
vi.mock('@ant-design/icons', () => {
  const S = () => null;
  return {
    __esModule: true,
    default: {},
    CloseOutlined: S,
    ReloadOutlined: S,
    DisconnectOutlined: S,
    WifiOutlined: S,
  };
});

import { LiveStream } from '../../src/components/LiveStream';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: Blob | string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0; // CONNECTING
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3; // CLOSED
  }

  // Helper to simulate connection open
  simulateOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) this.onopen();
  }

  // Helper to simulate message
  simulateMessage(data: Blob | string) {
    if (this.onmessage) this.onmessage({ data });
  }

  // Helper to simulate close
  simulateClose(code = 1006) {
    this.readyState = 3;
    if (this.onclose) this.onclose({ code });
  }

  // Helper to simulate error
  simulateError() {
    if (this.onerror) this.onerror();
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

// Mock URL.createObjectURL and revokeObjectURL
const mockObjectURLs: string[] = [];
let objectURLCounter = 0;

describe('LiveStream', () => {
  const mockOnClose = vi.fn();
  const defaultProps = {
    unitId: 'a1b2c3d4-e5f6-0000-0000-abcdef012345',
    unitStatus: 'online',
    onClose: mockOnClose,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.reset();
    mockOnClose.mockClear();
    objectURLCounter = 0;
    mockObjectURLs.length = 0;

    // Replace global WebSocket
    vi.stubGlobal('WebSocket', MockWebSocket);

    // Mock URL methods
    global.URL.createObjectURL = vi.fn(() => {
      const url = `blob:mock-url-${objectURLCounter++}`;
      mockObjectURLs.push(url);
      return url;
    });
    global.URL.revokeObjectURL = vi.fn((url: string) => {
      const idx = mockObjectURLs.indexOf(url);
      if (idx > -1) mockObjectURLs.splice(idx, 1);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows offline message when unit is offline', () => {
    render(
      <LiveStream
        unitId="a1b2c3d4-e5f6-0000-0000-abcdef012345"
        unitStatus="offline"
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Unit is offline - live feed unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('shows connecting state when online unit is opening connection', () => {
    render(<LiveStream {...defaultProps} />);

    // Advance timers to allow state updates
    act(() => {
      vi.runAllTimers();
    });

    // When connecting, a Spin component is rendered
    const spinner = document.querySelector('.ant-spin-spinning');
    expect(spinner).toBeInTheDocument();
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('displays video frame when receiving blob data', () => {
    render(<LiveStream {...defaultProps} />);

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    // Simulate receiving a JPEG frame
    const testBlob = new Blob(['test-image-data'], { type: 'image/jpeg' });
    act(() => {
      ws.simulateMessage(testBlob);
    });

    // Should have created an object URL
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(testBlob);

    // Image should be displayed
    const img = screen.getByAltText('Live stream from APIS unit');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'blob:mock-url-0');
  });

  it('revokes previous blob URL when receiving new frame', () => {
    render(<LiveStream {...defaultProps} />);

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    // First frame
    act(() => {
      ws.simulateMessage(new Blob(['frame1']));
    });

    // Second frame
    act(() => {
      ws.simulateMessage(new Blob(['frame2']));
    });

    // First URL should have been revoked
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url-0');
  });

  it('shows reconnecting state and retries with exponential backoff', () => {
    render(<LiveStream {...defaultProps} />);

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
      ws.simulateClose(1006); // Abnormal close
    });

    // Should show reconnecting message
    expect(screen.getByText(/connection lost.*reconnecting/i)).toBeInTheDocument();

    // First retry after 1s
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockWebSocket.instances.length).toBe(2);
  });

  it('shows error state after max retries exceeded', () => {
    render(<LiveStream {...defaultProps} />);

    // First connection fails before open
    let ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateClose(1006); // First failure
    });

    // Retry 1 after 1s delay
    act(() => {
      vi.advanceTimersByTime(INITIAL_RETRY_DELAY);
    });
    ws = MockWebSocket.instances[1];
    act(() => {
      ws.simulateClose(1006); // Second failure
    });

    // Retry 2 after 2s delay
    act(() => {
      vi.advanceTimersByTime(INITIAL_RETRY_DELAY * 2);
    });
    ws = MockWebSocket.instances[2];
    act(() => {
      ws.simulateClose(1006); // Third failure
    });

    // Retry 3 after 4s delay
    act(() => {
      vi.advanceTimersByTime(INITIAL_RETRY_DELAY * 4);
    });
    ws = MockWebSocket.instances[3];
    act(() => {
      ws.simulateClose(1006); // Fourth failure - should now show error
    });

    // After max retries, should show error state
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(
      <LiveStream
        unitId="a1b2c3d4-e5f6-0000-0000-abcdef012345"
        unitStatus="offline"
        onClose={mockOnClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('cleans up WebSocket on unmount', () => {
    const { unmount } = render(<LiveStream {...defaultProps} />);

    const ws = MockWebSocket.instances[0];
    const closeSpy = vi.spyOn(ws, 'close');

    act(() => {
      ws.simulateOpen();
    });

    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });

  it('does not retry on normal close (code 1000)', () => {
    render(<LiveStream {...defaultProps} />);

    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
      ws.simulateClose(1000); // Normal close
    });

    // Should not show reconnecting
    expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument();

    // Should not create new WebSocket
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('manual retry button resets retry count', () => {
    render(<LiveStream {...defaultProps} />);

    // Exhaust retries - each close triggers next retry after delay
    let ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateClose(1006);
    });

    act(() => {
      vi.advanceTimersByTime(INITIAL_RETRY_DELAY);
    });
    ws = MockWebSocket.instances[1];
    act(() => {
      ws.simulateClose(1006);
    });

    act(() => {
      vi.advanceTimersByTime(INITIAL_RETRY_DELAY * 2);
    });
    ws = MockWebSocket.instances[2];
    act(() => {
      ws.simulateClose(1006);
    });

    act(() => {
      vi.advanceTimersByTime(INITIAL_RETRY_DELAY * 4);
    });
    ws = MockWebSocket.instances[3];
    act(() => {
      ws.simulateClose(1006);
    });

    expect(screen.getByText('Connection failed')).toBeInTheDocument();

    const instanceCountBefore = MockWebSocket.instances.length;

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    // New WebSocket should be created
    expect(MockWebSocket.instances.length).toBe(instanceCountBefore + 1);
  });

  it('builds correct WebSocket URL based on protocol', () => {
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'https:',
        host: 'apis.example.com',
      },
      writable: true,
    });

    render(<LiveStream {...defaultProps} />);

    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('wss://apis.example.com/ws/stream/a1b2c3d4-e5f6-0000-0000-abcdef012345');
  });

  it('uses ws: protocol for http sites', () => {
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'http:',
        host: 'localhost:5173',
      },
      writable: true,
    });

    render(<LiveStream {...defaultProps} />);

    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('ws://localhost:5173/ws/stream/a1b2c3d4-e5f6-0000-0000-abcdef012345');
  });
});

// Constant for tests
const INITIAL_RETRY_DELAY = 1000;
