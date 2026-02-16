/**
 * useUsers Hook
 *
 * CRUD operations for user management in local authentication mode.
 * Admin-only functionality for managing team members.
 *
 * Part of Epic 13, Story 13-11 (User Management UI)
 */
import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * User representation from the API.
 */
export interface User {
  id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'member';
  is_active: boolean;
  must_change_password: boolean;
  last_login_at?: string;
  created_at: string;
}

/**
 * Input for creating a user directly (temp_password method).
 */
export interface CreateUserInput {
  email: string;
  display_name: string;
  role: 'admin' | 'member';
  password: string;
}

/**
 * Input for updating a user.
 */
export interface UpdateUserInput {
  display_name?: string;
  role?: 'admin' | 'member';
  is_active?: boolean;
}

/**
 * Invitation method types.
 */
export type InviteMethod = 'temp_password' | 'email' | 'link';

/**
 * Input for creating an invitation.
 */
export interface InviteUserInput {
  method: InviteMethod;
  role: 'admin' | 'member';
  // For temp_password method
  email?: string;
  display_name?: string;
  password?: string;
  // For email method
  // email is reused
  // For link method
  expiry_days?: number;
}

/**
 * Response from invite creation.
 */
export interface InviteResponse {
  user?: User;
  token?: string;
  expires_at?: string;
  invite_url?: string;
}

/**
 * Hook for listing users.
 */
export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<{ data: User[] }>('/users');
      setUsers(response.data.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch users'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    loading,
    error,
    refresh: fetchUsers,
  };
}

/**
 * Hook for creating a user directly (admin creates with temp password).
 */
export function useCreateUser() {
  const [creating, setCreating] = useState(false);

  const createUser = useCallback(async (input: CreateUserInput): Promise<User> => {
    setCreating(true);
    try {
      const response = await apiClient.post<{ data: User }>('/users', input);
      return response.data.data;
    } finally {
      setCreating(false);
    }
  }, []);

  return { createUser, creating };
}

/**
 * Hook for updating a user.
 */
export function useUpdateUser() {
  const [updating, setUpdating] = useState(false);

  const updateUser = useCallback(async (userId: string, input: UpdateUserInput): Promise<User> => {
    setUpdating(true);
    try {
      const response = await apiClient.put<{ data: User }>(`/users/${userId}`, input);
      return response.data.data;
    } finally {
      setUpdating(false);
    }
  }, []);

  return { updateUser, updating };
}

/**
 * Hook for deleting (soft delete) a user.
 */
export function useDeleteUser() {
  const [deleting, setDeleting] = useState(false);

  const deleteUser = useCallback(async (userId: string): Promise<void> => {
    setDeleting(true);
    try {
      await apiClient.delete(`/users/${userId}`);
    } finally {
      setDeleting(false);
    }
  }, []);

  return { deleteUser, deleting };
}

/**
 * Hook for creating an invitation (supports all methods).
 */
export function useInviteUser() {
  const [inviting, setInviting] = useState(false);

  const inviteUser = useCallback(async (input: InviteUserInput): Promise<InviteResponse> => {
    setInviting(true);
    try {
      const response = await apiClient.post<{ data: InviteResponse }>('/users/invite', input);
      return response.data.data;
    } finally {
      setInviting(false);
    }
  }, []);

  return { inviteUser, inviting };
}

/**
 * Hook for resetting a user's password.
 */
export function useResetPassword() {
  const [resetting, setResetting] = useState(false);

  const resetPassword = useCallback(async (userId: string, password: string): Promise<void> => {
    setResetting(true);
    try {
      await apiClient.post(`/users/${userId}/reset-password`, { password });
    } finally {
      setResetting(false);
    }
  }, []);

  return { resetPassword, resetting };
}

/**
 * Hook to check if the current user can perform admin actions on another user.
 * Prevents self-demotion and last admin removal.
 */
export function useUserAdminChecks(currentUserId: string, users: User[]) {
  // Count active admins
  const activeAdminCount = users.filter(u => u.role === 'admin' && u.is_active).length;

  /**
   * Check if we can demote a user from admin to member.
   */
  const canDemoteUser = useCallback((userId: string, currentRole: string): boolean => {
    // Cannot demote self
    if (userId === currentUserId) return false;
    // Cannot demote if this is the last active admin
    if (currentRole === 'admin' && activeAdminCount <= 1) return false;
    return true;
  }, [currentUserId, activeAdminCount]);

  /**
   * Check if we can deactivate a user.
   */
  const canDeactivateUser = useCallback((userId: string, currentRole: string, isActive: boolean): boolean => {
    // Cannot deactivate self
    if (userId === currentUserId) return false;
    // Cannot deactivate if this is the last active admin
    if (currentRole === 'admin' && isActive && activeAdminCount <= 1) return false;
    return true;
  }, [currentUserId, activeAdminCount]);

  /**
   * Check if we can delete a user.
   */
  const canDeleteUser = useCallback((userId: string, currentRole: string, isActive: boolean): boolean => {
    // Cannot delete self
    if (userId === currentUserId) return false;
    // Cannot delete if this is the last active admin
    if (currentRole === 'admin' && isActive && activeAdminCount <= 1) return false;
    return true;
  }, [currentUserId, activeAdminCount]);

  /**
   * Get warning message for an action, or null if safe.
   */
  const getActionWarning = useCallback((
    action: 'demote' | 'deactivate' | 'delete',
    userId: string,
    currentRole: string,
    isActive: boolean
  ): string | null => {
    if (userId === currentUserId) {
      switch (action) {
        case 'demote': return 'You cannot demote yourself';
        case 'deactivate': return 'You cannot deactivate yourself';
        case 'delete': return 'You cannot delete yourself';
      }
    }

    if (currentRole === 'admin' && isActive && activeAdminCount <= 1) {
      return 'This is the last admin. At least one active admin is required.';
    }

    return null;
  }, [currentUserId, activeAdminCount]);

  return {
    activeAdminCount,
    canDemoteUser,
    canDeactivateUser,
    canDeleteUser,
    getActionWarning,
  };
}
