/**
 * useTaskTemplates Hook Tests
 *
 * Tests for the task templates hooks.
 * Part of Epic 14, Story 14.4 (Portal Tasks Screen)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useTaskTemplates,
  useCreateTaskTemplate,
  useDeleteTaskTemplate,
} from '../../src/hooks/useTaskTemplates';
import { apiClient } from '../../src/providers/apiClient';

// Mock the apiClient
vi.mock('../../src/providers/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock template data
const mockSystemTemplate = {
  id: 'template-1',
  type: 'requeen',
  name: 'Requeen Colony',
  description: 'Replace the queen in this hive',
  is_system: true,
  created_at: '2024-01-01T00:00:00Z',
};

const mockCustomTemplate = {
  id: 'template-2',
  tenant_id: 'tenant-123',
  type: 'custom',
  name: 'Spring Deep Clean',
  description: 'Annual spring cleaning',
  is_system: false,
  created_at: '2024-06-15T10:00:00Z',
  created_by: 'user-123',
};

const mockTemplates = [mockSystemTemplate, mockCustomTemplate];

describe('useTaskTemplates hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('starts with loading=true and empty templates', () => {
      vi.mocked(apiClient.get).mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useTaskTemplates());

      expect(result.current.loading).toBe(true);
      expect(result.current.templates).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe('successful data fetch', () => {
    it('fetches task templates on mount', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockTemplates } });

      const { result } = renderHook(() => useTaskTemplates());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiClient.get).toHaveBeenCalledWith('/task-templates');
      expect(result.current.templates).toEqual(mockTemplates);
      expect(result.current.error).toBeNull();
    });

    it('handles empty templates array', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });

      const { result } = renderHook(() => useTaskTemplates());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.templates).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('handles null data gracefully', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: null } });

      const { result } = renderHook(() => useTaskTemplates());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.templates).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('sets error state on API failure', async () => {
      const mockError = new Error('Network error');
      vi.mocked(apiClient.get).mockRejectedValue(mockError);

      const { result } = renderHook(() => useTaskTemplates());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.templates).toEqual([]);
    });

    it('handles non-Error objects in catch', async () => {
      vi.mocked(apiClient.get).mockRejectedValue('String error');

      const { result } = renderHook(() => useTaskTemplates());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load templates');
    });
  });

  describe('refetch functionality', () => {
    it('provides a refetch function that reloads data', async () => {
      vi.mocked(apiClient.get)
        .mockResolvedValueOnce({ data: { data: [mockSystemTemplate] } })
        .mockResolvedValueOnce({ data: { data: mockTemplates } });

      const { result } = renderHook(() => useTaskTemplates());

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.templates).toHaveLength(1);

      // Trigger refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.templates).toHaveLength(2);
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });
});

describe('useCreateTaskTemplate hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('creates a template successfully', async () => {
    const newTemplate = {
      id: 'template-new',
      type: 'custom',
      name: 'New Template',
      description: 'A new custom template',
      is_system: false,
      created_at: '2024-06-20T10:00:00Z',
    };

    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: newTemplate } });

    const { result } = renderHook(() => useCreateTaskTemplate());

    expect(result.current.creating).toBe(false);

    let createdTemplate;
    await act(async () => {
      createdTemplate = await result.current.createTemplate({
        name: 'New Template',
        description: 'A new custom template',
      });
    });

    expect(apiClient.post).toHaveBeenCalledWith('/task-templates', {
      name: 'New Template',
      description: 'A new custom template',
    });
    expect(createdTemplate).toEqual(newTemplate);
  });

  it('sets creating=true during API call', async () => {
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(apiClient.post).mockReturnValue(promise as Promise<{ data: { data: unknown } }>);

    const { result } = renderHook(() => useCreateTaskTemplate());

    expect(result.current.creating).toBe(false);

    // Start creation without awaiting
    act(() => {
      result.current.createTemplate({ name: 'Test' });
    });

    // Check creating is true while in progress
    await waitFor(() => {
      expect(result.current.creating).toBe(true);
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!({ data: { data: { id: 'test', name: 'Test' } } });
    });

    await waitFor(() => {
      expect(result.current.creating).toBe(false);
    });
  });

  it('resets creating=false even on error', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('Create failed'));

    const { result } = renderHook(() => useCreateTaskTemplate());

    await act(async () => {
      try {
        await result.current.createTemplate({ name: 'Test' });
      } catch {
        // Expected error
      }
    });

    expect(result.current.creating).toBe(false);
  });
});

describe('useDeleteTaskTemplate hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('deletes a template successfully', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({});

    const { result } = renderHook(() => useDeleteTaskTemplate());

    expect(result.current.deleting).toBe(false);

    await act(async () => {
      await result.current.deleteTemplate('template-123');
    });

    expect(apiClient.delete).toHaveBeenCalledWith('/task-templates/template-123');
  });

  it('sets deleting=true during API call', async () => {
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(apiClient.delete).mockReturnValue(promise as Promise<unknown>);

    const { result } = renderHook(() => useDeleteTaskTemplate());

    expect(result.current.deleting).toBe(false);

    // Start deletion without awaiting
    act(() => {
      result.current.deleteTemplate('template-123');
    });

    // Check deleting is true while in progress
    await waitFor(() => {
      expect(result.current.deleting).toBe(true);
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!({});
    });

    await waitFor(() => {
      expect(result.current.deleting).toBe(false);
    });
  });

  it('resets deleting=false even on error', async () => {
    vi.mocked(apiClient.delete).mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(() => useDeleteTaskTemplate());

    await act(async () => {
      try {
        await result.current.deleteTemplate('template-123');
      } catch {
        // Expected error
      }
    });

    expect(result.current.deleting).toBe(false);
  });
});

describe('TaskTemplate interface', () => {
  it('has all required fields for system template', () => {
    const template = mockSystemTemplate;

    expect(template.id).toBe('template-1');
    expect(template.type).toBe('requeen');
    expect(template.name).toBe('Requeen Colony');
    expect(template.description).toBe('Replace the queen in this hive');
    expect(template.is_system).toBe(true);
    expect(template.created_at).toBeDefined();
  });

  it('has optional fields for custom template', () => {
    const template = mockCustomTemplate;

    expect(template.tenant_id).toBe('tenant-123');
    expect(template.created_by).toBe('user-123');
    expect(template.is_system).toBe(false);
  });

  it('is_system distinguishes system from custom templates', () => {
    expect(mockSystemTemplate.is_system).toBe(true);
    expect(mockCustomTemplate.is_system).toBe(false);
  });
});
