/**
 * useExport Hook
 *
 * Provides export functionality for hive data in multiple formats.
 * Manages export presets and handles API communication.
 *
 * Part of Epic 9, Story 9.1 (Configurable Data Export)
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Categories of fields that can be included in an export.
 */
export interface IncludeConfig {
  basics?: string[];    // hive_name, queen_age, boxes, current_weight, location
  details?: string[];   // inspection_log, hornet_data, weight_history, weather_correlations
  analysis?: string[];  // beebrain_insights, health_summary, season_comparison
  financial?: string[]; // costs, harvest_revenue, roi_per_hive
}

/**
 * Options for generating an export.
 */
export interface ExportOptions {
  hive_ids: string[];
  include: IncludeConfig;
  format: 'summary' | 'markdown' | 'json';
}

/**
 * Export generation result.
 */
export interface ExportResult {
  content: string;
  format: string;
  hive_count: number;
  generated_at: string;
}

/**
 * Export preset configuration.
 */
export interface ExportPreset {
  id: string;
  name: string;
  config: IncludeConfig;
  created_at: string;
}

interface ExportResponse {
  data: ExportResult;
}

interface PresetsResponse {
  data: ExportPreset[];
  meta: {
    total: number;
  };
}

interface PresetResponse {
  data: ExportPreset;
}

interface UseExportResult {
  // Export generation
  generateExport: (options: ExportOptions) => Promise<ExportResult>;
  exporting: boolean;
  exportError: Error | null;

  // Presets
  presets: ExportPreset[];
  presetsLoading: boolean;
  presetsError: Error | null;
  refetchPresets: () => Promise<void>;
  savePreset: (name: string, config: IncludeConfig) => Promise<ExportPreset>;
  deletePreset: (id: string) => Promise<void>;
  savingPreset: boolean;
  deletingPreset: boolean;
}

/**
 * Available export field options organized by category.
 */
export const EXPORT_FIELD_OPTIONS = {
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
} as const;

/**
 * Hook to manage data export functionality.
 *
 * @example
 * function ExportPage() {
 *   const { generateExport, exporting, presets, savePreset } = useExport();
 *
 *   const handleExport = async () => {
 *     const result = await generateExport({
 *       hive_ids: ['all'],
 *       include: { basics: ['hive_name', 'queen_age'] },
 *       format: 'markdown',
 *     });
 *     console.log(result.content);
 *   };
 *
 *   return <Button onClick={handleExport} loading={exporting}>Export</Button>;
 * }
 */
export function useExport(): UseExportResult {
  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<Error | null>(null);

  // Presets state
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetsError, setPresetsError] = useState<Error | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const [deletingPreset, setDeletingPreset] = useState(false);

  // Fetch presets on mount
  const fetchPresets = useCallback(async () => {
    setPresetsLoading(true);
    try {
      const response = await apiClient.get<PresetsResponse>('/export/presets');
      setPresets(response.data.data || []);
      setPresetsError(null);
    } catch (err) {
      setPresetsError(err as Error);
    } finally {
      setPresetsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // Generate export
  const generateExport = useCallback(async (options: ExportOptions): Promise<ExportResult> => {
    setExporting(true);
    setExportError(null);
    try {
      const response = await apiClient.post<ExportResponse>('/export', options);
      return response.data.data;
    } catch (err) {
      setExportError(err as Error);
      throw err;
    } finally {
      setExporting(false);
    }
  }, []);

  // Save preset
  const savePreset = useCallback(async (name: string, config: IncludeConfig): Promise<ExportPreset> => {
    setSavingPreset(true);
    try {
      const response = await apiClient.post<PresetResponse>('/export/presets', {
        name,
        config,
      });
      // Refresh presets list
      await fetchPresets();
      return response.data.data;
    } finally {
      setSavingPreset(false);
    }
  }, [fetchPresets]);

  // Delete preset
  const deletePreset = useCallback(async (id: string): Promise<void> => {
    setDeletingPreset(true);
    try {
      await apiClient.delete(`/export/presets/${id}`);
      // Refresh presets list
      await fetchPresets();
    } finally {
      setDeletingPreset(false);
    }
  }, [fetchPresets]);

  return {
    generateExport,
    exporting,
    exportError,
    presets,
    presetsLoading,
    presetsError,
    refetchPresets: fetchPresets,
    savePreset,
    deletePreset,
    savingPreset,
    deletingPreset,
  };
}

export default useExport;
