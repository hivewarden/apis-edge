/**
 * useCustomLabels Hook
 *
 * Fetches custom labels from the API with CRUD operations.
 * Custom labels allow beekeepers to define their own feed, treatment,
 * equipment, and issue types.
 *
 * Part of Epic 6, Story 6.5 (Custom Labels System)
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Custom label data returned by the API.
 */
export interface CustomLabel {
  id: string;
  category: LabelCategory;
  name: string;
  created_at: string;
}

/**
 * Valid label categories.
 */
export type LabelCategory = 'feed' | 'treatment' | 'equipment' | 'issue';

/**
 * Category metadata for display.
 */
export const LABEL_CATEGORIES = [
  { value: 'feed' as const, label: 'Feed Types' },
  { value: 'treatment' as const, label: 'Treatment Types' },
  { value: 'equipment' as const, label: 'Equipment Types' },
  { value: 'issue' as const, label: 'Issue Types' },
] as const;

/**
 * Usage count breakdown for a label.
 */
export interface LabelUsage {
  count: number;
  breakdown: {
    treatments: number;
    feedings: number;
    equipment: number;
  };
}

interface LabelsListResponse {
  data: Record<LabelCategory, CustomLabel[]>;
}

interface LabelsByCategoryResponse {
  data: CustomLabel[];
}

interface LabelResponse {
  data: CustomLabel;
}

interface LabelUsageResponse {
  data: LabelUsage;
}

/**
 * Input for creating a new custom label.
 */
export interface CreateLabelInput {
  category: LabelCategory;
  name: string;
}

/**
 * Input for updating a custom label.
 */
export interface UpdateLabelInput {
  name: string;
}

interface UseCustomLabelsResult {
  /** Labels grouped by category (when no category filter is applied) */
  labelsByCategory: Record<LabelCategory, CustomLabel[]>;
  /** Labels for the specified category (when category filter is applied) */
  labels: CustomLabel[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createLabel: (input: CreateLabelInput) => Promise<CustomLabel>;
  updateLabel: (id: string, input: UpdateLabelInput) => Promise<CustomLabel>;
  deleteLabel: (id: string) => Promise<void>;
  getLabelUsage: (id: string) => Promise<LabelUsage>;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
}

/**
 * Hook to fetch and manage custom labels.
 *
 * @param category - Optional category filter. If provided, returns only labels for that category.
 *
 * @example
 * // Fetch all labels (grouped by category)
 * function CustomLabelsPage() {
 *   const { labelsByCategory, loading } = useCustomLabels();
 *   // labelsByCategory.feed, labelsByCategory.treatment, etc.
 * }
 *
 * @example
 * // Fetch labels for a specific category (for dropdown)
 * function TreatmentForm() {
 *   const { labels: customTreatments } = useCustomLabels('treatment');
 *   // Combine with built-in TREATMENT_TYPES
 * }
 */
export function useCustomLabels(category?: LabelCategory): UseCustomLabelsResult {
  const [labelsByCategory, setLabelsByCategory] = useState<Record<LabelCategory, CustomLabel[]>>({
    feed: [],
    treatment: [],
    equipment: [],
    issue: [],
  });
  const [labels, setLabels] = useState<CustomLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchLabels = useCallback(async () => {
    setLoading(true);
    try {
      if (category) {
        // Fetch labels for specific category
        const response = await apiClient.get<LabelsByCategoryResponse>(`/labels?category=${category}`);
        setLabels(response.data.data || []);
        // Also update the category in labelsByCategory
        setLabelsByCategory(prev => ({
          ...prev,
          [category]: response.data.data || [],
        }));
      } else {
        // Fetch all labels grouped by category
        const response = await apiClient.get<LabelsListResponse>('/labels');
        const data = response.data.data || { feed: [], treatment: [], equipment: [], issue: [] };
        setLabelsByCategory(data);
        // Flatten for labels array
        setLabels([
          ...(data.feed || []),
          ...(data.treatment || []),
          ...(data.equipment || []),
          ...(data.issue || []),
        ]);
      }
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  const createLabel = useCallback(async (input: CreateLabelInput): Promise<CustomLabel> => {
    setCreating(true);
    try {
      const response = await apiClient.post<LabelResponse>('/labels', input);
      await fetchLabels();
      return response.data.data;
    } finally {
      setCreating(false);
    }
  }, [fetchLabels]);

  const updateLabel = useCallback(async (id: string, input: UpdateLabelInput): Promise<CustomLabel> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<LabelResponse>(`/labels/${id}`, input);
      await fetchLabels();
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, [fetchLabels]);

  const deleteLabel = useCallback(async (id: string): Promise<void> => {
    setDeleting(true);
    try {
      await apiClient.delete(`/labels/${id}`);
      await fetchLabels();
    } finally {
      setDeleting(false);
    }
  }, [fetchLabels]);

  const getLabelUsage = useCallback(async (id: string): Promise<LabelUsage> => {
    const response = await apiClient.get<LabelUsageResponse>(`/labels/${id}/usage`);
    return response.data.data;
  }, []);

  return {
    labelsByCategory,
    labels,
    loading,
    error,
    refetch: fetchLabels,
    createLabel,
    updateLabel,
    deleteLabel,
    getLabelUsage,
    creating,
    updating,
    deleting,
  };
}

// Built-in types that are NOT stored in the database
// These appear first in dropdowns, greyed out in Custom Labels settings

/**
 * Built-in treatment types.
 */
export const BUILT_IN_TREATMENT_TYPES = [
  { value: 'oxalic_acid', label: 'Oxalic Acid' },
  { value: 'formic_acid', label: 'Formic Acid' },
  { value: 'apiguard', label: 'Apiguard' },
  { value: 'apivar', label: 'Apivar' },
  { value: 'maqs', label: 'MAQS' },
  { value: 'api_bioxal', label: 'Api-Bioxal' },
] as const;

/**
 * Built-in feed types.
 */
export const BUILT_IN_FEED_TYPES = [
  { value: 'sugar_syrup', label: 'Sugar Syrup' },
  { value: 'fondant', label: 'Fondant' },
  { value: 'pollen_patty', label: 'Pollen Patty' },
  { value: 'pollen_substitute', label: 'Pollen Substitute' },
  { value: 'honey', label: 'Honey' },
] as const;

/**
 * Built-in equipment types.
 */
export const BUILT_IN_EQUIPMENT_TYPES = [
  { value: 'entrance_reducer', label: 'Entrance Reducer' },
  { value: 'mouse_guard', label: 'Mouse Guard' },
  { value: 'queen_excluder', label: 'Queen Excluder' },
  { value: 'robbing_screen', label: 'Robbing Screen' },
  { value: 'feeder', label: 'Feeder' },
  { value: 'top_feeder', label: 'Top Feeder' },
  { value: 'bottom_board', label: 'Bottom Board' },
  { value: 'slatted_rack', label: 'Slatted Rack' },
  { value: 'inner_cover', label: 'Inner Cover' },
  { value: 'outer_cover', label: 'Outer Cover' },
  { value: 'hive_beetle_trap', label: 'Hive Beetle Trap' },
] as const;

/**
 * Built-in issue types.
 */
export const BUILT_IN_ISSUE_TYPES = [
  { value: 'queenless', label: 'Queenless' },
  { value: 'weak_colony', label: 'Weak Colony' },
  { value: 'pest_infestation', label: 'Pest Infestation' },
  { value: 'disease', label: 'Disease' },
  { value: 'robbing', label: 'Robbing' },
  { value: 'swarming', label: 'Swarming' },
] as const;

/**
 * Get built-in types for a category.
 */
export function getBuiltInTypes(category: LabelCategory): readonly { value: string; label: string }[] {
  switch (category) {
    case 'feed':
      return BUILT_IN_FEED_TYPES;
    case 'treatment':
      return BUILT_IN_TREATMENT_TYPES;
    case 'equipment':
      return BUILT_IN_EQUIPMENT_TYPES;
    case 'issue':
      return BUILT_IN_ISSUE_TYPES;
    default:
      return [];
  }
}

/**
 * Merge built-in types with custom labels for dropdown use.
 * Custom labels are shown after a divider.
 *
 * @param builtInTypes - The built-in types for this category
 * @param customLabels - Custom labels from the API
 * @returns Options array suitable for Ant Design Select
 */
export function mergeTypesWithCustomLabels(
  builtInTypes: readonly { value: string; label: string }[],
  customLabels: CustomLabel[]
): { value: string; label: string; disabled?: boolean }[] {
  const options: { value: string; label: string; disabled?: boolean }[] = [
    ...builtInTypes.map(t => ({ value: t.value, label: t.label })),
  ];

  if (customLabels.length > 0) {
    options.push({ value: 'divider', label: '── Custom ──', disabled: true });
    options.push(...customLabels.map(l => ({ value: l.name, label: l.name })));
  }

  return options;
}

export default useCustomLabels;
