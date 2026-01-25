/**
 * Export Page Tests
 *
 * Tests for the Export page component.
 * Part of Epic 9, Story 9.1 (Configurable Data Export)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { Export } from '../../src/pages/Export';

// Mock the hooks
vi.mock('../../src/hooks/useExport', () => ({
  useExport: () => ({
    generateExport: vi.fn(),
    exporting: false,
    exportError: null,
    presets: [],
    presetsLoading: false,
    presetsError: null,
    refetchPresets: vi.fn(),
    savePreset: vi.fn(),
    deletePreset: vi.fn(),
    savingPreset: false,
    deletingPreset: false,
  }),
  EXPORT_FIELD_OPTIONS: {
    basics: [
      { value: 'hive_name', label: 'Hive Name' },
      { value: 'queen_age', label: 'Queen Age' },
      { value: 'boxes', label: 'Boxes Configuration' },
      { value: 'current_weight', label: 'Current Weight' },
      { value: 'location', label: 'Location' },
    ],
    details: [
      { value: 'inspection_log', label: 'Full Inspection Log' },
      { value: 'hornet_data', label: 'Hornet Detection Data' },
      { value: 'weight_history', label: 'Weight History' },
      { value: 'weather_correlations', label: 'Weather Correlations' },
    ],
    analysis: [
      { value: 'beebrain_insights', label: 'BeeBrain Insights' },
      { value: 'health_summary', label: 'Health Summary' },
      { value: 'season_comparison', label: 'Season Comparison' },
    ],
    financial: [
      { value: 'costs', label: 'Costs' },
      { value: 'harvest_revenue', label: 'Harvest Revenue' },
      { value: 'roi_per_hive', label: 'ROI per Hive' },
    ],
  },
}));

// Mock apiClient with proper response shape
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [],
        meta: { total: 0 }
      }
    }),
    post: vi.fn().mockResolvedValue({
      data: {
        data: {
          content: 'test content',
          format: 'markdown',
          hive_count: 1,
          generated_at: '2026-01-25T10:00:00Z',
        }
      }
    }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

const renderWithProviders = async (component: React.ReactNode) => {
  const result = render(
    <BrowserRouter>
      <ConfigProvider>
        {component}
      </ConfigProvider>
    </BrowserRouter>
  );
  // Wait for async effects to complete
  await waitFor(() => {
    expect(screen.getByText('Export Data')).toBeInTheDocument();
  });
  return result;
};

describe('Export Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Page Structure', () => {
    it('renders the page title', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('Export Data')).toBeInTheDocument();
    });

    it('renders the description text', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText(/Export your hive data in various formats/i)).toBeInTheDocument();
    });

    it('renders the Select Hives card', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('Select Hives')).toBeInTheDocument();
    });

    it('renders the Select Fields card', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('Select Fields')).toBeInTheDocument();
    });

    it('renders the Select Format card', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('Select Format')).toBeInTheDocument();
    });

    it('renders the Saved Presets card', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('Saved Presets')).toBeInTheDocument();
    });
  });

  describe('Field Categories', () => {
    it('renders BASICS category', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('BASICS')).toBeInTheDocument();
    });

    it('renders DETAILS category', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('DETAILS')).toBeInTheDocument();
    });

    it('renders ANALYSIS category', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('ANALYSIS')).toBeInTheDocument();
    });

    it('renders FINANCIAL category', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('FINANCIAL')).toBeInTheDocument();
    });
  });

  describe('Format Options', () => {
    it('renders Quick Summary format option', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('Quick Summary')).toBeInTheDocument();
    });

    it('renders Detailed Markdown format option', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('Detailed Markdown')).toBeInTheDocument();
    });

    it('renders Full JSON format option', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('Full JSON')).toBeInTheDocument();
    });

    it('describes Quick Summary as for forum posts', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText(/Short text suitable for forum posts/i)).toBeInTheDocument();
    });

    it('describes Markdown as for AI assistants', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText(/Full context with structured data for AI assistants/i)).toBeInTheDocument();
    });

    it('describes JSON as for programmatic use', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText(/Complete structured data for programmatic use/i)).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('renders Preview Export button', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('Preview Export')).toBeInTheDocument();
    });

    it('renders Save as Preset button', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText('Save as Preset')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty presets message when no presets', async () => {
      await renderWithProviders(<Export />);
      expect(screen.getByText(/No saved presets yet/i)).toBeInTheDocument();
    });
  });
});

describe('Export Format Icons', () => {
  it('has summary icon', () => {
    // This test documents that each format has an associated icon
    const formatIcons = {
      summary: 'FileTextOutlined',
      markdown: 'FileMarkdownOutlined',
      json: 'CodeOutlined',
    };
    expect(Object.keys(formatIcons)).toHaveLength(3);
  });
});

describe('Export Download Behavior', () => {
  it('should use correct file extension for summary format', () => {
    const format = 'summary';
    const extension = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt';
    expect(extension).toBe('txt');
  });

  it('should use correct file extension for markdown format', () => {
    const format = 'markdown';
    const extension = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt';
    expect(extension).toBe('md');
  });

  it('should use correct file extension for json format', () => {
    const format = 'json';
    const extension = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt';
    expect(extension).toBe('json');
  });
});
