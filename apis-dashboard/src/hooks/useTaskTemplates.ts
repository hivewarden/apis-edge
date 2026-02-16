/**
 * useTaskTemplates Hook
 *
 * Fetches and manages task templates from the API.
 * Supports listing system and custom templates, creating new custom templates,
 * and deleting custom templates.
 *
 * Part of Epic 14, Story 14.4 (Portal Tasks Screen)
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Task template data returned by the API.
 */
export interface TaskTemplate {
  id: string;
  tenant_id?: string;
  type: string;
  name: string;
  description?: string;
  auto_effects?: Record<string, unknown>;
  is_system: boolean;
  created_at: string;
  created_by?: string;
}

/**
 * Input for creating a new custom template.
 */
export interface CreateTemplateInput {
  name: string;
  description?: string;
}

interface TemplatesListResponse {
  data: TaskTemplate[];
}

interface TemplateResponse {
  data: TaskTemplate;
}

interface UseTaskTemplatesResult {
  templates: TaskTemplate[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseCreateTaskTemplateResult {
  createTemplate: (input: CreateTemplateInput) => Promise<TaskTemplate>;
  creating: boolean;
}

interface UseDeleteTaskTemplateResult {
  deleteTemplate: (id: string) => Promise<void>;
  deleting: boolean;
}

/**
 * Hook to fetch task templates (system + custom).
 *
 * @example
 * function TaskLibrary() {
 *   const { templates, loading, error, refetch } = useTaskTemplates();
 *
 *   if (loading) return <Spin />;
 *   if (error) return <Alert message={error} type="error" />;
 *
 *   return <TemplateGrid templates={templates} />;
 * }
 */
export function useTaskTemplates(): UseTaskTemplatesResult {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<TemplatesListResponse>('/task-templates');
      setTemplates(response.data.data || []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load templates';
      setError(message);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    error,
    refetch: fetchTemplates,
  };
}

/**
 * Hook for creating custom task templates.
 *
 * @example
 * function CreateTemplateForm() {
 *   const { createTemplate, creating } = useCreateTaskTemplate();
 *
 *   const handleSubmit = async (values) => {
 *     const newTemplate = await createTemplate(values);
 *     message.success('Template created!');
 *   };
 * }
 */
export function useCreateTaskTemplate(): UseCreateTaskTemplateResult {
  const [creating, setCreating] = useState(false);

  const createTemplate = useCallback(async (input: CreateTemplateInput): Promise<TaskTemplate> => {
    setCreating(true);
    try {
      const response = await apiClient.post<TemplateResponse>('/task-templates', input);
      return response.data.data;
    } finally {
      setCreating(false);
    }
  }, []);

  return {
    createTemplate,
    creating,
  };
}

/**
 * Hook for deleting custom task templates.
 *
 * @example
 * function TemplateCard({ template }) {
 *   const { deleteTemplate, deleting } = useDeleteTaskTemplate();
 *
 *   const handleDelete = async () => {
 *     await deleteTemplate(template.id);
 *     message.success('Template deleted!');
 *   };
 * }
 */
export function useDeleteTaskTemplate(): UseDeleteTaskTemplateResult {
  const [deleting, setDeleting] = useState(false);

  const deleteTemplate = useCallback(async (id: string): Promise<void> => {
    setDeleting(true);
    try {
      await apiClient.delete(`/task-templates/${id}`);
    } finally {
      setDeleting(false);
    }
  }, []);

  return {
    deleteTemplate,
    deleting,
  };
}

export default useTaskTemplates;
