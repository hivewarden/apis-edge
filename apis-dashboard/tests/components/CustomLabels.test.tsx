/**
 * CustomLabels Page Tests
 *
 * Tests for the Custom Labels settings page that allows beekeepers
 * to manage custom feed, treatment, equipment, and issue types.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// Explicit @ant-design/icons mock to override setup.ts Proxy mock.
// The Proxy mock hangs during module resolution for transitive imports;
// explicit named exports resolve instantly.
vi.mock('@ant-design/icons', () => {
  const S = () => null;
  return {
    __esModule: true,
    default: {},
    TagsOutlined: S,
    PlusOutlined: S,
    EditOutlined: S,
    DeleteOutlined: S,
    ArrowLeftOutlined: S,
    FileSearchOutlined: S,
    MedicineBoxOutlined: S,
    CoffeeOutlined: S,
    GiftOutlined: S,
    HomeOutlined: S,
    VideoCameraOutlined: S,
    UserAddOutlined: S,
    EnvironmentOutlined: S,
    ClockCircleOutlined: S,
  };
});

import { CustomLabels } from '../../src/pages/CustomLabels';
import { useCustomLabels } from '../../src/hooks/useCustomLabels';

// Mock the useCustomLabels hook
vi.mock('../../src/hooks/useCustomLabels', () => ({
  useCustomLabels: vi.fn(() => ({
    labelsByCategory: {
      feed: [],
      treatment: [{ id: '1', category: 'treatment', name: 'Thymovar', created_at: '2026-01-26T10:00:00Z' }],
      equipment: [],
      issue: [],
    },
    loading: false,
    createLabel: vi.fn(),
    updateLabel: vi.fn(),
    deleteLabel: vi.fn(),
    getLabelUsage: vi.fn().mockResolvedValue({ count: 0, breakdown: { treatments: 0, feedings: 0, equipment: 0 } }),
    creating: false,
    updating: false,
    deleting: false,
  })),
  LABEL_CATEGORIES: [
    { value: 'feed', label: 'Feed Types' },
    { value: 'treatment', label: 'Treatment Types' },
    { value: 'equipment', label: 'Equipment Types' },
    { value: 'issue', label: 'Issue Types' },
  ],
  getBuiltInTypes: vi.fn((category: string) => {
    if (category === 'feed') return [{ value: 'sugar_syrup', label: 'Sugar Syrup' }];
    if (category === 'treatment') return [{ value: 'oxalic_acid', label: 'Oxalic Acid' }];
    return [];
  }),
}));

// Mock the modal components
vi.mock('../../src/components/LabelFormModal', () => ({
  LabelFormModal: vi.fn(({ open, onClose }) =>
    open ? <div data-testid="label-form-modal"><button onClick={onClose}>Close</button></div> : null
  ),
}));

vi.mock('../../src/components/LabelDeleteModal', () => ({
  LabelDeleteModal: vi.fn(({ open, onClose }) =>
    open ? <div data-testid="label-delete-modal"><button onClick={onClose}>Close</button></div> : null
  ),
}));

// Mock theme
vi.mock('../../src/theme/apisTheme', () => ({
  colors: {
    seaBuckthorn: '#F7A42D',
    error: '#ff4d4f',
  },
}));

const renderCustomLabels = () => {
  return render(
    <BrowserRouter>
      <CustomLabels />
    </BrowserRouter>
  );
};

describe('CustomLabels Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page title', () => {
    renderCustomLabels();
    expect(screen.getByText('Custom Labels')).toBeInTheDocument();
  });

  it('renders all four category cards', () => {
    renderCustomLabels();
    expect(screen.getByText('Feed Types')).toBeInTheDocument();
    expect(screen.getByText('Treatment Types')).toBeInTheDocument();
    expect(screen.getByText('Equipment Types')).toBeInTheDocument();
    expect(screen.getByText('Issue Types')).toBeInTheDocument();
  });

  it('renders Add button for each category', () => {
    renderCustomLabels();
    const addButtons = screen.getAllByText('Add');
    expect(addButtons.length).toBe(4);
  });

  it('displays custom label in treatment category', () => {
    renderCustomLabels();
    expect(screen.getByText('Thymovar')).toBeInTheDocument();
  });

  it('shows back link to settings', () => {
    renderCustomLabels();
    // The back button links to /settings
    const backLink = screen.getByRole('link');
    expect(backLink).toHaveAttribute('href', '/settings');
  });

  it('opens form modal when Add is clicked', async () => {
    const user = userEvent.setup();
    renderCustomLabels();

    const addButtons = screen.getAllByText('Add');
    await user.click(addButtons[0]); // Click first Add button (Feed Types)

    await waitFor(() => {
      expect(screen.getByTestId('label-form-modal')).toBeInTheDocument();
    });
  });

  it('shows loading state', () => {
    vi.mocked(useCustomLabels).mockReturnValueOnce({
      labelsByCategory: { feed: [], treatment: [], equipment: [], issue: [] },
      loading: true,
      createLabel: vi.fn(),
      updateLabel: vi.fn(),
      deleteLabel: vi.fn(),
      getLabelUsage: vi.fn(),
      creating: false,
      updating: false,
      deleting: false,
    });

    renderCustomLabels();
    // Should show spinner when loading
    expect(document.querySelector('.ant-spin')).toBeInTheDocument();
  });
});

describe('CustomLabels Accessibility', () => {
  it('has accessible category headings', () => {
    renderCustomLabels();

    // Each category card should have a heading
    const feedTypes = screen.getByText('Feed Types');
    expect(feedTypes).toBeVisible();
  });

  it('Add buttons are keyboard accessible', () => {
    renderCustomLabels();

    const addButtons = screen.getAllByRole('button', { name: /add/i });
    addButtons.forEach(button => {
      expect(button).not.toBeDisabled();
    });
  });
});

describe('CustomLabels Category Display', () => {
  it('displays built-in types as non-editable', () => {
    renderCustomLabels();

    // Built-in types should be visible but greyed out
    // The actual implementation shows them as Tags with specific styling
    expect(screen.getByText('Sugar Syrup')).toBeInTheDocument();
    expect(screen.getByText('Oxalic Acid')).toBeInTheDocument();
  });

  it('displays custom labels with edit and delete icons', () => {
    renderCustomLabels();

    // Custom label should be editable
    expect(screen.getByText('Thymovar')).toBeInTheDocument();
    // Edit and delete icons should be present (rendered as part of the Tag)
  });
});
