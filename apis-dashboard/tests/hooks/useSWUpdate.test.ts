import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSWUpdate, __resetForTesting } from '../../src/hooks/useSWUpdate';

// Direct access to mock for triggering callbacks
import * as pwaMock from '../__mocks__/virtual-pwa-register';

describe('useSWUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset the mock and the hook's module state before each test
    pwaMock.__resetMock();
    __resetForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns initial state with needRefresh and offlineReady as false', () => {
    const { result } = renderHook(() => useSWUpdate());

    expect(result.current.needRefresh).toBe(false);
    expect(result.current.offlineReady).toBe(false);
    expect(typeof result.current.updateServiceWorker).toBe('function');
  });

  it('provides updateServiceWorker function', () => {
    const { result } = renderHook(() => useSWUpdate());

    // The updateServiceWorker should be a function
    expect(typeof result.current.updateServiceWorker).toBe('function');

    // Call updateServiceWorker - in tests this is a no-op but should not throw
    expect(() => {
      act(() => {
        result.current.updateServiceWorker();
      });
    }).not.toThrow();
  });

  it('updates needRefresh to true when onNeedRefresh is called', () => {
    const { result } = renderHook(() => useSWUpdate());

    // Initial state
    expect(result.current.needRefresh).toBe(false);

    // Trigger the needRefresh callback via the mock
    act(() => {
      pwaMock.__triggerNeedRefresh();
    });

    // Should update state
    expect(result.current.needRefresh).toBe(true);
    expect(result.current.offlineReady).toBe(false);
  });

  it('updates offlineReady to true when onOfflineReady is called', () => {
    const { result } = renderHook(() => useSWUpdate());

    // Initial state
    expect(result.current.offlineReady).toBe(false);

    // Trigger the offlineReady callback via the mock
    act(() => {
      pwaMock.__triggerOfflineReady();
    });

    // Should update state
    expect(result.current.offlineReady).toBe(true);
    expect(result.current.needRefresh).toBe(false);
  });

  it('resets to initial state on error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSWUpdate());

    // First trigger a needRefresh state
    act(() => {
      pwaMock.__triggerNeedRefresh();
    });

    expect(result.current.needRefresh).toBe(true);

    // Now trigger an error - this should reset state
    act(() => {
      pwaMock.__triggerRegisterError(new Error('Registration failed'));
    });

    expect(result.current.needRefresh).toBe(false);
    expect(result.current.offlineReady).toBe(false);

    consoleSpy.mockRestore();
  });

  it('shares state across multiple hook instances', () => {
    const { result: result1 } = renderHook(() => useSWUpdate());
    const { result: result2 } = renderHook(() => useSWUpdate());

    // Both should start with same initial state
    expect(result1.current.needRefresh).toBe(false);
    expect(result2.current.needRefresh).toBe(false);

    // Trigger needRefresh
    act(() => {
      pwaMock.__triggerNeedRefresh();
    });

    // Both should update to the new state
    expect(result1.current.needRefresh).toBe(true);
    expect(result2.current.needRefresh).toBe(true);
  });

  it('cleans up listener on unmount', () => {
    const { result, unmount } = renderHook(() => useSWUpdate());

    // Trigger state change while mounted
    act(() => {
      pwaMock.__triggerNeedRefresh();
    });

    expect(result.current.needRefresh).toBe(true);

    // Unmount the hook
    unmount();

    // After unmount, triggering changes should not cause errors
    expect(() => {
      act(() => {
        pwaMock.__triggerOfflineReady();
      });
    }).not.toThrow();
  });
});
