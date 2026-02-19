/**
 * Mock for html5-qrcode
 * Requires camera/video APIs not available in jsdom.
 */
import { vi } from 'vitest';

export class Html5Qrcode {
  start = vi.fn();
  stop = vi.fn().mockResolvedValue(undefined);
  clear = vi.fn();
  static getCameras = vi.fn().mockResolvedValue([]);
}

export class Html5QrcodeScanner {
  render = vi.fn();
  clear = vi.fn();
}
