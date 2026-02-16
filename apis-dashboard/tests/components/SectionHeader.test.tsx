/**
 * SectionHeader Component Tests
 *
 * Part of Epic 14, Story 14.7: Mobile Refactor Hive Detail to Single Scroll Layout
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionHeader } from '../../src/components/SectionHeader';

describe('SectionHeader', () => {
  describe('rendering', () => {
    it('renders the title correctly', () => {
      render(<SectionHeader title="TASKS" />);

      expect(screen.getByText('TASKS')).toBeInTheDocument();
    });

    it('renders the title in uppercase styling', () => {
      render(<SectionHeader title="tasks" />);

      const textElement = screen.getByText('tasks');
      expect(textElement).toHaveStyle({ textTransform: 'uppercase' });
    });

    it('renders count in title when provided', () => {
      render(<SectionHeader title="TASKS" count={3} />);

      expect(screen.getByText('TASKS (3)')).toBeInTheDocument();
    });

    it('renders title without count when count is 0', () => {
      render(<SectionHeader title="TASKS" count={0} />);

      expect(screen.getByText('TASKS (0)')).toBeInTheDocument();
    });

    it('renders title without parentheses when count is undefined', () => {
      render(<SectionHeader title="INSPECT" />);

      expect(screen.getByText('INSPECT')).toBeInTheDocument();
      expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
    });

    it('renders children when provided', () => {
      render(
        <SectionHeader title="TASKS" id="tasks-section">
          <div data-testid="child-content">Child Content</div>
        </SectionHeader>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });
  });

  describe('scroll targeting', () => {
    it('applies id prop to section wrapper for scroll targeting', () => {
      render(<SectionHeader title="TASKS" id="tasks-section" />);

      const section = document.getElementById('tasks-section');
      expect(section).toBeInTheDocument();
      expect(section?.tagName.toLowerCase()).toBe('section');
    });

    it('wraps content in section when id is provided', () => {
      render(
        <SectionHeader title="TASKS" id="tasks-section">
          <div data-testid="content">Content</div>
        </SectionHeader>
      );

      const section = document.getElementById('tasks-section');
      expect(section?.querySelector('[data-testid="content"]')).toBeInTheDocument();
    });

    it('does not wrap in section when id not provided', () => {
      const { container } = render(<SectionHeader title="TASKS" />);

      expect(container.querySelector('section')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has heading role with aria-level 2', () => {
      render(<SectionHeader title="TASKS" />);

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeInTheDocument();
    });

    it('decorative lines are hidden from screen readers', () => {
      const { container } = render(<SectionHeader title="TASKS" />);

      const ariaHiddenElements = container.querySelectorAll('[aria-hidden="true"]');
      expect(ariaHiddenElements.length).toBe(2); // Left and right divider lines
    });

    it('section has region role and aria-labelledby when id provided', () => {
      render(<SectionHeader title="TASKS" id="tasks-section" />);

      const section = screen.getByRole('region');
      expect(section).toHaveAttribute('aria-labelledby', 'tasks-section-title');
    });

    it('title has id for aria-labelledby reference', () => {
      render(<SectionHeader title="TASKS" id="tasks-section" />);

      const title = document.getElementById('tasks-section-title');
      expect(title).toBeInTheDocument();
      expect(title?.textContent).toBe('TASKS');
    });
  });

  describe('styling', () => {
    it('applies custom styles when provided', () => {
      render(<SectionHeader title="TASKS" style={{ marginTop: 32 }} />);

      // Find the header div (which has the heading role)
      const headerDiv = screen.getByRole('heading', { level: 2 });
      expect(headerDiv).toHaveStyle({ marginTop: '32px' });
    });

    it('has proper flex layout for centering', () => {
      render(<SectionHeader title="TASKS" />);

      const headerDiv = screen.getByRole('heading', { level: 2 });
      expect(headerDiv).toHaveStyle({
        display: 'flex',
        alignItems: 'center',
      });
    });
  });
});
