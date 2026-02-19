/**
 * Tests for RecapShareModal component
 *
 * Part of Epic 9, Story 9.4: Season Recap Summary
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecapShareModal } from '../../src/components/RecapShareModal';
import { SeasonRecap } from '../../src/hooks/useSeasonRecap';

// Mock html2canvas
vi.mock('html2canvas', () => ({
  default: vi.fn(() =>
    Promise.resolve({
      toBlob: (callback: (blob: Blob | null) => void) => {
        callback(new Blob(['test'], { type: 'image/png' }));
      },
    })
  ),
}));

// Mock theme
vi.mock('../../src/theme/apisTheme', () => ({
  colors: {
    coconutCream: '#fefbe8',
    seaBuckthorn: '#f5a524',
    salomie: '#fedc8c',
    brownBramble: '#5c3c10',
    goldTips: '#d4a012',
    goldenGrass: '#daa520',
  },
}));

// Mock getRecapText
vi.mock('../../src/hooks/useSeasonRecap', async () => {
  const actual = await vi.importActual('../../src/hooks/useSeasonRecap');
  return {
    ...actual,
    getRecapText: vi.fn(() =>
      Promise.resolve(
        '🐝 APIS Season Recap 2024\n\n📊 Key Stats:\n• Total Harvest: 125.5 kg\n• Hornets Deterred: 342'
      )
    ),
  };
});

// Mock navigator.clipboard
const mockClipboard = {
  writeText: vi.fn(() => Promise.resolve()),
};
Object.assign(navigator, { clipboard: mockClipboard });

// Mock window.print
const mockPrint = vi.fn();
window.print = mockPrint;

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:test-url');
global.URL.revokeObjectURL = vi.fn();

// Mock document.createElement for download link
const mockClick = vi.fn();
const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
  const element = originalCreateElement(tagName);
  if (tagName === 'a') {
    element.click = mockClick;
  }
  return element;
});

const mockRecap: SeasonRecap = {
  id: 'recap-1',
  season_year: 2024,
  hemisphere: 'northern',
  season_dates: {
    start: '2024-08-01',
    end: '2024-10-31',
    display_text: 'Aug 1 - Oct 31, 2024',
  },
  total_harvest_kg: 125.5,
  hornets_deterred: 342,
  inspections_count: 24,
  treatments_count: 3,
  feedings_count: 8,
  per_hive_stats: [],
  milestones: [
    {
      type: 'first_harvest',
      date: '2024-08-15',
      description: 'First honey harvest of the season',
    },
  ],
  generated_at: '2024-11-01T10:00:00Z',
};

describe('RecapShareModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal when open', () => {
    render(<RecapShareModal open={true} onClose={() => {}} recap={mockRecap} />);

    expect(screen.getByText('Share Season Recap')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<RecapShareModal open={false} onClose={() => {}} recap={mockRecap} />);

    expect(screen.queryByText('Share Season Recap')).not.toBeInTheDocument();
  });

  it('has three tabs: Copy Text, Download Image, Print / PDF', () => {
    render(<RecapShareModal open={true} onClose={() => {}} recap={mockRecap} />);

    expect(screen.getByText('Copy Text')).toBeInTheDocument();
    expect(screen.getByText('Download Image')).toBeInTheDocument();
    expect(screen.getByText('Print / PDF')).toBeInTheDocument();
  });

  it('loads and displays recap text in text tab', async () => {
    render(<RecapShareModal open={true} onClose={() => {}} recap={mockRecap} />);

    // Text tab is active by default but handleTabChange is only called on change.
    // Switch to another tab first, then back to text to trigger text loading.
    fireEvent.click(screen.getByText('Download Image'));
    fireEvent.click(screen.getByText('Copy Text'));

    await waitFor(() => {
      expect(screen.getByText(/APIS Season Recap 2024/)).toBeInTheDocument();
    });
  });

  it('copies text to clipboard when copy button is clicked', async () => {
    render(<RecapShareModal open={true} onClose={() => {}} recap={mockRecap} />);

    // Switch tabs to trigger text loading
    fireEvent.click(screen.getByText('Download Image'));
    fireEvent.click(screen.getByText('Copy Text'));

    // Wait for text to load
    await waitFor(() => {
      expect(screen.getByText(/APIS Season Recap 2024/)).toBeInTheDocument();
    });

    // Click copy button
    const copyButton = screen.getByRole('button', { name: /Copy to Clipboard/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalled();
    });
  });

  it('switches to image tab and shows download button', async () => {
    render(<RecapShareModal open={true} onClose={() => {}} recap={mockRecap} />);

    // Click on image tab
    const imageTab = screen.getByText('Download Image');
    fireEvent.click(imageTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download as PNG/i })).toBeInTheDocument();
    });
  });

  it('switches to PDF tab and shows print button', async () => {
    render(<RecapShareModal open={true} onClose={() => {}} recap={mockRecap} />);

    // Click on PDF tab
    const pdfTab = screen.getByText('Print / PDF');
    fireEvent.click(pdfTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Open Print Dialog/i })).toBeInTheDocument();
    });
  });

  it('triggers print dialog when print button is clicked', async () => {
    render(<RecapShareModal open={true} onClose={() => {}} recap={mockRecap} />);

    // Click on PDF tab
    const pdfTab = screen.getByText('Print / PDF');
    fireEvent.click(pdfTab);

    await waitFor(() => {
      const printButton = screen.getByRole('button', { name: /Open Print Dialog/i });
      fireEvent.click(printButton);
    });

    expect(mockPrint).toHaveBeenCalled();
  });

  it('calls onClose when modal is cancelled', () => {
    const onClose = vi.fn();
    render(<RecapShareModal open={true} onClose={onClose} recap={mockRecap} />);

    // Find and click the close button (X)
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('shows tip about saving as PDF in print tab', async () => {
    render(<RecapShareModal open={true} onClose={() => {}} recap={mockRecap} />);

    // Click on PDF tab
    const pdfTab = screen.getByText('Print / PDF');
    fireEvent.click(pdfTab);

    await waitFor(() => {
      expect(screen.getByText(/Save as PDF/)).toBeInTheDocument();
    });
  });
});
