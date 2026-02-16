/**
 * Unit tests for useActiveSection hook
 *
 * Tests the Intersection Observer-based section tracking functionality
 * for mobile bottom navigation.
 *
 * Part of Epic 14, Story 14.8: Mobile Bottom Anchor Navigation Bar
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useActiveSection, SectionId } from '../../src/hooks/useActiveSection';

// Debounce delay matches the hook's DEBOUNCE_DELAY constant
const DEBOUNCE_DELAY = 100;

// Mock IntersectionObserver
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

let intersectionCallback: IntersectionObserverCallback | null = null;

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: readonly number[] = [];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  observe = mockObserve;
  unobserve = mockUnobserve;
  disconnect = mockDisconnect;
  takeRecords = vi.fn(() => []);
}

// Mock scrollTo
const mockScrollTo = vi.fn();

// Mock getElementById
const mockElements: Record<string, HTMLElement> = {};

describe('useActiveSection', () => {
  const sectionIds: SectionId[] = ['status-section', 'tasks-section', 'inspect-section'];

  beforeEach(() => {
    // Setup IntersectionObserver mock
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    // Setup window.scrollTo mock
    vi.stubGlobal('scrollTo', mockScrollTo);
    Object.defineProperty(window, 'scrollTo', { value: mockScrollTo, writable: true });

    // Setup mock elements
    sectionIds.forEach((id) => {
      const element = document.createElement('div');
      element.id = id;
      mockElements[id] = element;
      document.body.appendChild(element);
    });

    // Mock getBoundingClientRect
    Object.values(mockElements).forEach((el, index) => {
      el.getBoundingClientRect = vi.fn(() => ({
        top: index * 500,
        bottom: (index + 1) * 500,
        left: 0,
        right: 375,
        width: 375,
        height: 500,
        x: 0,
        y: index * 500,
        toJSON: () => ({}),
      }));
    });

    // Mock window.pageYOffset
    Object.defineProperty(window, 'pageYOffset', { value: 0, writable: true });
  });

  afterEach(() => {
    // Cleanup
    vi.clearAllMocks();
    intersectionCallback = null;
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) document.body.removeChild(el);
    });
    Object.keys(mockElements).forEach((key) => delete mockElements[key]);
    vi.unstubAllGlobals();
  });

  describe('initialization', () => {
    it('should default active section to status-section', () => {
      const { result } = renderHook(() =>
        useActiveSection({ sectionIds })
      );

      expect(result.current.activeSection).toBe('status-section');
    });

    it('should create IntersectionObserver with correct options', () => {
      renderHook(() => useActiveSection({ sectionIds }));

      // Verify observer was created and observing elements
      expect(mockObserve).toHaveBeenCalled();
    });

    it('should observe all section elements', () => {
      renderHook(() => useActiveSection({ sectionIds }));

      expect(mockObserve).toHaveBeenCalledTimes(3);
      sectionIds.forEach((id) => {
        const element = document.getElementById(id);
        expect(mockObserve).toHaveBeenCalledWith(element);
      });
    });
  });

  describe('active section updates', () => {
    it('should update active section when intersection entry fires (debounced)', async () => {
      vi.useFakeTimers();
      const { result } = renderHook(() =>
        useActiveSection({ sectionIds })
      );

      // Initial state
      expect(result.current.activeSection).toBe('status-section');

      // Simulate tasks-section becoming visible
      act(() => {
        if (intersectionCallback) {
          const entry: Partial<IntersectionObserverEntry> = {
            isIntersecting: true,
            target: mockElements['tasks-section'],
            intersectionRatio: 0.6,
          };
          intersectionCallback([entry as IntersectionObserverEntry], {} as IntersectionObserver);
        }
      });

      // Should not update immediately due to debounce
      expect(result.current.activeSection).toBe('status-section');

      // Advance timers past debounce delay
      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_DELAY + 10);
      });

      expect(result.current.activeSection).toBe('tasks-section');
      vi.useRealTimers();
    });

    it('should not update when entry is not intersecting', async () => {
      vi.useFakeTimers();
      const { result } = renderHook(() =>
        useActiveSection({ sectionIds })
      );

      act(() => {
        if (intersectionCallback) {
          const entry: Partial<IntersectionObserverEntry> = {
            isIntersecting: false,
            target: mockElements['tasks-section'],
            intersectionRatio: 0.1,
          };
          intersectionCallback([entry as IntersectionObserverEntry], {} as IntersectionObserver);
        }
      });

      // Advance timers
      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_DELAY + 10);
      });

      // Should remain at default
      expect(result.current.activeSection).toBe('status-section');
      vi.useRealTimers();
    });

    it('should handle multiple entries and pick the first intersecting one', async () => {
      vi.useFakeTimers();
      const { result } = renderHook(() =>
        useActiveSection({ sectionIds })
      );

      act(() => {
        if (intersectionCallback) {
          const entries: Partial<IntersectionObserverEntry>[] = [
            {
              isIntersecting: false,
              target: mockElements['status-section'],
              intersectionRatio: 0.2,
            },
            {
              isIntersecting: true,
              target: mockElements['inspect-section'],
              intersectionRatio: 0.7,
            },
          ];
          intersectionCallback(entries as IntersectionObserverEntry[], {} as IntersectionObserver);
        }
      });

      // Advance timers past debounce delay
      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_DELAY + 10);
      });

      expect(result.current.activeSection).toBe('inspect-section');
      vi.useRealTimers();
    });

    it('should debounce rapid updates to prevent jitter', async () => {
      vi.useFakeTimers();
      const { result } = renderHook(() =>
        useActiveSection({ sectionIds })
      );

      // Fire multiple rapid intersection events
      act(() => {
        if (intersectionCallback) {
          intersectionCallback([{
            isIntersecting: true,
            target: mockElements['tasks-section'],
            intersectionRatio: 0.6,
          } as IntersectionObserverEntry], {} as IntersectionObserver);
        }
      });

      // Fire another event before debounce completes
      act(() => {
        vi.advanceTimersByTime(50); // Half the debounce time
        if (intersectionCallback) {
          intersectionCallback([{
            isIntersecting: true,
            target: mockElements['inspect-section'],
            intersectionRatio: 0.7,
          } as IntersectionObserverEntry], {} as IntersectionObserver);
        }
      });

      // Should still be at initial state (debounce resets)
      expect(result.current.activeSection).toBe('status-section');

      // Advance past full debounce
      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_DELAY + 10);
      });

      // Should be the last fired event
      expect(result.current.activeSection).toBe('inspect-section');
      vi.useRealTimers();
    });
  });

  describe('scrollToSection', () => {
    it('should call window.scrollTo when scrollToSection is called', () => {
      const { result } = renderHook(() =>
        useActiveSection({ sectionIds })
      );

      act(() => {
        result.current.scrollToSection('tasks-section');
      });

      expect(mockScrollTo).toHaveBeenCalledWith(
        expect.objectContaining({
          behavior: 'smooth',
        })
      );
    });

    it('should scroll to top (0) when scrolling to status-section', () => {
      const { result } = renderHook(() =>
        useActiveSection({ sectionIds })
      );

      act(() => {
        result.current.scrollToSection('status-section');
      });

      expect(mockScrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: 'smooth',
      });
    });

    it('should calculate correct offset for non-status sections', () => {
      // Setup element position
      mockElements['tasks-section'].getBoundingClientRect = vi.fn(() => ({
        top: 500,
        bottom: 1000,
        left: 0,
        right: 375,
        width: 375,
        height: 500,
        x: 0,
        y: 500,
        toJSON: () => ({}),
      }));

      Object.defineProperty(window, 'pageYOffset', { value: 100, writable: true });

      const { result } = renderHook(() =>
        useActiveSection({ sectionIds })
      );

      act(() => {
        result.current.scrollToSection('tasks-section');
      });

      // Should calculate: elementPosition (500) + pageYOffset (100) - TOP_HEADER_OFFSET (16) = 584
      expect(mockScrollTo).toHaveBeenCalledWith({
        top: 584,
        behavior: 'smooth',
      });
    });

    it('should not throw when element does not exist', () => {
      const { result } = renderHook(() =>
        useActiveSection({ sectionIds })
      );

      // Remove element
      const element = document.getElementById('tasks-section');
      if (element) document.body.removeChild(element);

      // Should not throw
      expect(() => {
        act(() => {
          result.current.scrollToSection('tasks-section');
        });
      }).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should disconnect observer on unmount', () => {
      const { unmount } = renderHook(() =>
        useActiveSection({ sectionIds })
      );

      unmount();

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should clear debounce timer on unmount', async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const { unmount } = renderHook(() =>
        useActiveSection({ sectionIds })
      );

      // Trigger an intersection to start debounce timer
      act(() => {
        if (intersectionCallback) {
          intersectionCallback([{
            isIntersecting: true,
            target: mockElements['tasks-section'],
            intersectionRatio: 0.6,
          } as IntersectionObserverEntry], {} as IntersectionObserver);
        }
      });

      // Unmount before debounce completes
      unmount();

      // Verify clearTimeout was called during cleanup
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe('custom options', () => {
    it('should accept custom threshold', () => {
      const { result } = renderHook(() =>
        useActiveSection({ sectionIds, threshold: 0.3 })
      );

      // Hook should initialize and work with custom options
      expect(result.current.activeSection).toBe('status-section');
      expect(mockObserve).toHaveBeenCalled();
    });

    it('should accept custom rootMargin', () => {
      const { result } = renderHook(() =>
        useActiveSection({ sectionIds, rootMargin: '0px 0px -100px 0px' })
      );

      // Hook should initialize and work with custom options
      expect(result.current.activeSection).toBe('status-section');
      expect(mockObserve).toHaveBeenCalled();
    });
  });
});
