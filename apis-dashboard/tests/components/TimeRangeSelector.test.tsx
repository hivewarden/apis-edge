import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';
import { TimeRangeSelector } from '../../src/components/TimeRangeSelector';
import { TimeRangeProvider } from '../../src/context/TimeRangeContext';

// Helper to render with required providers
function renderWithProviders(
  ui: ReactNode,
  { initialEntries = ['/'] }: { initialEntries?: string[] } = {}
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TimeRangeProvider>{ui}</TimeRangeProvider>
    </MemoryRouter>
  );
}

describe('TimeRangeSelector', () => {
  describe('rendering', () => {
    it('renders all time range options', () => {
      renderWithProviders(<TimeRangeSelector />);

      expect(screen.getByText('Day')).toBeInTheDocument();
      expect(screen.getByText('Week')).toBeInTheDocument();
      expect(screen.getByText('Month')).toBeInTheDocument();
      expect(screen.getByText('Season')).toBeInTheDocument();
      expect(screen.getByText('Year')).toBeInTheDocument();
      expect(screen.getByText('All Time')).toBeInTheDocument();
    });

    it('renders Segmented control', () => {
      renderWithProviders(<TimeRangeSelector />);

      // Ant Design Segmented component
      const segmented = document.querySelector('.ant-segmented');
      expect(segmented).toBeInTheDocument();
    });

    it('renders navigation arrows', () => {
      renderWithProviders(<TimeRangeSelector />);

      expect(screen.getByLabelText('Previous period')).toBeInTheDocument();
      expect(screen.getByLabelText('Next period')).toBeInTheDocument();
    });
  });

  describe('DatePicker visibility', () => {
    it('shows DatePicker when Day is selected', () => {
      renderWithProviders(<TimeRangeSelector />, {
        initialEntries: ['/?range=day'],
      });

      // DatePicker is always in the DOM; when Day is selected it has opacity 1 and width 160
      const datePicker = document.querySelector('.ant-picker');
      expect(datePicker).toBeInTheDocument();
      expect(datePicker).toHaveStyle({ opacity: '1' });
    });

    it('hides DatePicker when Week is selected', () => {
      renderWithProviders(<TimeRangeSelector />, {
        initialEntries: ['/?range=week'],
      });

      // DatePicker is still in the DOM but with opacity 0 and width 0
      const datePicker = document.querySelector('.ant-picker');
      expect(datePicker).toBeInTheDocument();
      expect(datePicker).toHaveStyle({ opacity: '0', width: '0' });
    });

    it('hides DatePicker when Month is selected', () => {
      renderWithProviders(<TimeRangeSelector />, {
        initialEntries: ['/?range=month'],
      });

      const datePicker = document.querySelector('.ant-picker');
      expect(datePicker).toBeInTheDocument();
      expect(datePicker).toHaveStyle({ opacity: '0', width: '0' });
    });

    it('hides DatePicker when Season is selected', () => {
      renderWithProviders(<TimeRangeSelector />, {
        initialEntries: ['/?range=season'],
      });

      const datePicker = document.querySelector('.ant-picker');
      expect(datePicker).toBeInTheDocument();
      expect(datePicker).toHaveStyle({ opacity: '0', width: '0' });
    });

    it('hides DatePicker when Year is selected', () => {
      renderWithProviders(<TimeRangeSelector />, {
        initialEntries: ['/?range=year'],
      });

      const datePicker = document.querySelector('.ant-picker');
      expect(datePicker).toBeInTheDocument();
      expect(datePicker).toHaveStyle({ opacity: '0', width: '0' });
    });

    it('hides DatePicker when All Time is selected', () => {
      renderWithProviders(<TimeRangeSelector />, {
        initialEntries: ['/?range=all'],
      });

      const datePicker = document.querySelector('.ant-picker');
      expect(datePicker).toBeInTheDocument();
      expect(datePicker).toHaveStyle({ opacity: '0', width: '0' });
    });
  });

  describe('range selection', () => {
    it('selects Day range by default', () => {
      renderWithProviders(<TimeRangeSelector />);

      // Default should be 'day' per DEFAULT_TIME_RANGE
      const segmented = document.querySelector('.ant-segmented');
      const selectedItem = segmented?.querySelector('.ant-segmented-item-selected');
      expect(selectedItem?.textContent).toBe('Day');
    });

    it('shows correct selection from URL params', () => {
      renderWithProviders(<TimeRangeSelector />, {
        initialEntries: ['/?range=month'],
      });

      const segmented = document.querySelector('.ant-segmented');
      const selectedItem = segmented?.querySelector('.ant-segmented-item-selected');
      expect(selectedItem?.textContent).toBe('Month');
    });
  });

  describe('DatePicker accessibility', () => {
    it('has aria-label on DatePicker', () => {
      renderWithProviders(<TimeRangeSelector />, {
        initialEntries: ['/?range=day'],
      });

      const datePicker = document.querySelector('.ant-picker input');
      expect(datePicker).toHaveAttribute('aria-label', 'Select date');
    });
  });

  describe('styling', () => {
    it('uses middle size for Segmented', () => {
      renderWithProviders(<TimeRangeSelector />);

      // Source uses size="middle" so it should have ant-segmented-middle class (or no lg class)
      const segmented = document.querySelector('.ant-segmented');
      expect(segmented).toBeInTheDocument();
      expect(segmented).not.toHaveClass('ant-segmented-lg');
    });

    it('uses middle size for DatePicker', () => {
      renderWithProviders(<TimeRangeSelector />, {
        initialEntries: ['/?range=day'],
      });

      // Source uses size="middle" so it should not have the large class
      const datePicker = document.querySelector('.ant-picker');
      expect(datePicker).toBeInTheDocument();
      expect(datePicker).not.toHaveClass('ant-picker-large');
    });
  });
});
