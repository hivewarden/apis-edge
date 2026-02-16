/**
 * useDetection Hook
 *
 * Fetches detection details by ID.
 * Extracted from ClipPlayerModal component.
 *
 * Part of Layered Hooks Architecture refactor.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../providers/apiClient';

/**
 * Detection data returned by the API.
 */
export interface Detection {
  id: string;
  confidence?: number; // 0-1 scale (null if not available)
  laser_activated: boolean;
  detected_at: string;
}

interface DetectionResponse {
  data: Detection;
}

export interface UseDetectionResult {
  detection: Detection | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch detection details by ID.
 *
 * @param detectionId - The detection ID to fetch
 *
 * @example
 * function DetectionInfo({ detectionId }) {
 *   const { detection, loading } = useDetection(detectionId);
 *
 *   if (loading) return <Spin />;
 *   if (!detection) return null;
 *
 *   return (
 *     <div>
 *       <span>Confidence: {detection.confidence}</span>
 *       <span>Laser: {detection.laser_activated ? 'Yes' : 'No'}</span>
 *     </div>
 *   );
 * }
 */
export function useDetection(detectionId: string | null | undefined): UseDetectionResult {
  const [detection, setDetection] = useState<Detection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const fetchDetection = useCallback(async () => {
    if (!detectionId) {
      setDetection(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<DetectionResponse>(
        `/detections/${detectionId}`
      );
      if (isMountedRef.current) {
        setDetection(response.data.data);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err as Error);
        setDetection(null);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [detectionId]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchDetection();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchDetection]);

  return {
    detection,
    loading,
    error,
    refetch: fetchDetection,
  };
}

export default useDetection;
