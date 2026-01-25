/**
 * useMilestones Hook
 *
 * Manages milestone photos and flags for the current tenant.
 * Provides CRUD operations for milestone photos and milestone flag management.
 *
 * Part of Epic 9, Story 9.2: First Harvest Celebration - AC#2, AC#3, AC#5
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Milestone photo data returned by the API.
 */
export interface MilestonePhoto {
  id: string;
  milestone_type: 'first_harvest' | 'first_hive_harvest';
  reference_id?: string;
  file_path: string;
  thumbnail_path?: string;
  caption?: string;
  created_at: string;
}

/**
 * Milestone flags for a tenant.
 */
export interface MilestoneFlags {
  first_harvest_seen: boolean;
  hive_first_harvests: string[];
}

interface MilestonePhotosResponse {
  data: MilestonePhoto[];
  meta: {
    total: number;
  };
}

interface MilestonePhotoResponse {
  data: MilestonePhoto;
}

interface MilestoneFlagsResponse {
  data: MilestoneFlags;
}

interface UseMilestonePhotosResult {
  photos: MilestonePhoto[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  uploadPhoto: (
    file: File,
    milestoneType: 'first_harvest' | 'first_hive_harvest',
    referenceId?: string,
    caption?: string
  ) => Promise<MilestonePhoto>;
  deletePhoto: (id: string) => Promise<void>;
  uploading: boolean;
  deleting: boolean;
}

interface UseMilestoneFlagsResult {
  flags: MilestoneFlags | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  markMilestoneSeen: (flag: string) => Promise<void>;
  marking: boolean;
}

/**
 * Hook to fetch and manage milestone photos.
 *
 * @example
 * function MilestonesGallery() {
 *   const { photos, loading, uploadPhoto, deletePhoto } = useMilestonePhotos();
 *
 *   if (loading) return <Spin />;
 *
 *   return (
 *     <div>
 *       {photos.map(photo => (
 *         <Image key={photo.id} src={photo.file_path} />
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useMilestonePhotos(): UseMilestonePhotosResult {
  const [photos, setPhotos] = useState<MilestonePhoto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<MilestonePhotosResponse>('/milestones/photos');
      setPhotos(response.data.data || []);
      setTotal(response.data.meta.total);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const uploadPhoto = useCallback(
    async (
      file: File,
      milestoneType: 'first_harvest' | 'first_hive_harvest',
      referenceId?: string,
      caption?: string
    ): Promise<MilestonePhoto> => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('milestone_type', milestoneType);
        if (referenceId) {
          formData.append('reference_id', referenceId);
        }
        if (caption) {
          formData.append('caption', caption);
        }

        const response = await apiClient.post<MilestonePhotoResponse>(
          '/milestones/photos',
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        );

        // Refetch to update the list
        await fetchPhotos();
        return response.data.data;
      } finally {
        setUploading(false);
      }
    },
    [fetchPhotos]
  );

  const deletePhoto = useCallback(
    async (id: string): Promise<void> => {
      setDeleting(true);
      try {
        await apiClient.delete(`/milestones/photos/${id}`);
        // Refetch to update the list
        await fetchPhotos();
      } finally {
        setDeleting(false);
      }
    },
    [fetchPhotos]
  );

  return {
    photos,
    total,
    loading,
    error,
    refetch: fetchPhotos,
    uploadPhoto,
    deletePhoto,
    uploading,
    deleting,
  };
}

/**
 * Hook to fetch and manage milestone flags.
 *
 * @example
 * function SomeComponent() {
 *   const { flags, markMilestoneSeen } = useMilestoneFlags();
 *
 *   const handleClose = () => {
 *     markMilestoneSeen('first_harvest_seen');
 *   };
 *
 *   if (flags?.first_harvest_seen) {
 *     return null; // Don't show celebration if already seen
 *   }
 *
 *   return <CelebrationModal onClose={handleClose} />;
 * }
 */
export function useMilestoneFlags(): UseMilestoneFlagsResult {
  const [flags, setFlags] = useState<MilestoneFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [marking, setMarking] = useState(false);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<MilestoneFlagsResponse>('/milestones/flags');
      setFlags(response.data.data);
      setError(null);
    } catch (err) {
      // If flags don't exist yet, use defaults
      setFlags({
        first_harvest_seen: false,
        hive_first_harvests: [],
      });
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const markMilestoneSeen = useCallback(
    async (flag: string): Promise<void> => {
      setMarking(true);
      // Store previous state for rollback on failure
      const previousFlags = flags;

      // Optimistic update for responsive UI
      if (flags) {
        setFlags({
          ...flags,
          [flag]: true,
        });
      }

      try {
        await apiClient.post(`/milestones/flags/${flag}`, { value: true });
      } catch (error) {
        // Revert optimistic update on failure
        if (previousFlags) {
          setFlags(previousFlags);
        }
        throw error;
      } finally {
        setMarking(false);
      }
    },
    [flags]
  );

  return {
    flags,
    loading,
    error,
    refetch: fetchFlags,
    markMilestoneSeen,
    marking,
  };
}

/**
 * Get milestone type display name.
 */
export function getMilestoneTypeName(type: string): string {
  switch (type) {
    case 'first_harvest':
      return 'First Harvest';
    case 'first_hive_harvest':
      return 'First Hive Harvest';
    default:
      return type;
  }
}
