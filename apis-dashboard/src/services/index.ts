/**
 * Services Barrel Export
 *
 * Central export point for all service modules.
 * @module services
 */

// IndexedDB Database
export { db, getTable, getSyncQueue } from './db';
export type {
  CachedSite,
  CachedHive,
  CachedInspection,
  CachedDetection,
  CachedUnit,
  CacheMetadata,
  CacheableTable,
  PendingInspection,
  SyncQueueItem,
} from './db';

// Offline Cache Management
export {
  cacheApiResponse,
  getCachedData,
  getCachedById,
  getLastSyncTime,
  updateAccessTime,
  calculateStorageSize,
  pruneOldData,
  checkAndPruneStorage,
  clearAllCache,
  clearTableCache,
  getCacheStats,
  MAX_STORAGE_MB,
  TARGET_STORAGE_MB,
  MIN_INSPECTION_DAYS,
} from './offlineCache';

// Offline Inspection Service - Epic 7, Story 7.3
export {
  saveOfflineInspection,
  updateOfflineInspection,
  getOfflineInspections,
  getPendingCount,
  markAsSynced,
  markSyncError,
  getPendingSyncItems,
  deleteOfflineInspection,
  generateLocalId,
} from './offlineInspection';
export type { OfflineInspectionInput, CachedInspectionFrame } from './offlineInspection';

// Background Sync Service - Epic 7, Story 7.4
export {
  startBackgroundSync,
  resolveConflict,
  getPendingSyncCount,
  retrySyncItem,
  retryAllFailedItems,
} from './backgroundSync';
export type { SyncProgress, SyncResult, ConflictItem } from './backgroundSync';

// Whisper Transcription Service - Epic 7, Story 7.5
export {
  startRecording,
  stopRecording,
  transcribeAudio,
  isRecording,
  cancelRecording,
  isAudioRecordingSupported,
} from './whisperTranscription';
export type { TranscriptionResult } from './whisperTranscription';
