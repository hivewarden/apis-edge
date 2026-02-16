/**
 * useActiveSection Hook
 *
 * Tracks the currently visible section using Intersection Observer API
 * and provides smooth scroll navigation between sections.
 *
 * Features:
 * - Automatic section detection via Intersection Observer
 * - Smooth scroll navigation with bottom nav offset accounting
 * - Debounced updates to prevent scroll jitter (AC4 requirement)
 * - Cleanup on unmount
 *
 * Part of Epic 14, Story 14.8: Mobile Bottom Anchor Navigation Bar
 *
 * @example
 * const { activeSection, scrollToSection } = useActiveSection({
 *   sectionIds: ['status-section', 'tasks-section', 'inspect-section'],
 * });
 */
import { useState, useEffect, useCallback, useRef } from 'react';

/** Valid section IDs for bottom navigation */
export type SectionId = 'status-section' | 'tasks-section' | 'inspect-section';

/** Options for the useActiveSection hook */
export interface UseActiveSectionOptions {
  /** Array of section IDs to observe */
  sectionIds: SectionId[];
  /**
   * Root margin for Intersection Observer.
   * Default: '0px 0px -64px 0px' to account for 64px bottom nav
   */
  rootMargin?: string;
  /**
   * Visibility threshold to trigger intersection.
   * Default: 0.5 (50% visibility)
   */
  threshold?: number;
}

/** Return type for the useActiveSection hook */
export interface UseActiveSectionReturn {
  /** Currently active section ID */
  activeSection: SectionId;
  /** Scroll smoothly to a section by ID */
  scrollToSection: (sectionId: SectionId) => void;
}

/** Default bottom navigation height in pixels */
const BOTTOM_NAV_HEIGHT = 64;

/** Debounce delay in milliseconds to prevent jitter during scroll (AC4) */
const DEBOUNCE_DELAY = 100;

/** Top header offset for scroll calculations (accounts for AppBar if present) */
const TOP_HEADER_OFFSET = 16;

/**
 * Hook for tracking active section and providing scroll navigation.
 *
 * Uses Intersection Observer to detect which section is currently
 * in the viewport and updates the active section accordingly.
 * Updates are debounced to prevent jitter during rapid scrolling (AC4).
 *
 * @param options - Configuration options
 * @returns Object containing activeSection and scrollToSection function
 */
export function useActiveSection(options: UseActiveSectionOptions): UseActiveSectionReturn {
  const {
    sectionIds,
    rootMargin = `0px 0px -${BOTTOM_NAV_HEIGHT}px 0px`,
    threshold = 0.5,
  } = options;

  const [activeSection, setActiveSection] = useState<SectionId>('status-section');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Debounced state setter to prevent jitter during scroll (AC4)
    const setActiveSectionDebounced = (sectionId: SectionId) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        setActiveSection(sectionId);
      }, DEBOUNCE_DELAY);
    };

    // Create Intersection Observer to watch section visibility
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first intersecting entry
        const visibleEntry = entries.find((entry) => entry.isIntersecting);
        if (visibleEntry) {
          setActiveSectionDebounced(visibleEntry.target.id as SectionId);
        }
      },
      {
        rootMargin,
        threshold,
      }
    );

    // Observe all section elements
    sectionIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    // Cleanup observer and debounce timer on unmount
    return () => {
      observer.disconnect();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [sectionIds, rootMargin, threshold]);

  /**
   * Scroll smoothly to a section by ID.
   * For status-section, scrolls to top of page.
   * For other sections, calculates position accounting for both top header
   * and bottom nav offsets to ensure target is fully visible.
   */
  const scrollToSection = useCallback((sectionId: SectionId) => {
    const element = document.getElementById(sectionId);
    if (!element) return;

    // For status section, always scroll to top
    if (sectionId === 'status-section') {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
      return;
    }

    // For other sections, calculate offset position
    // Account for top header offset to ensure section header is visible
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - TOP_HEADER_OFFSET;

    window.scrollTo({
      top: Math.max(0, offsetPosition),
      behavior: 'smooth',
    });
  }, []);

  return { activeSection, scrollToSection };
}
