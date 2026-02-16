/**
 * Shared TypeScript type definitions
 */

// Auth types - Epic 13, Story 13.5
export type {
  AuthMode,
  AuthConfig,
  AuthConfigLocal,
  AuthConfigKeycloak,
  UserIdentity,
  LocalLoginParams,
  AuthUser,
  LoginResponse,
  MeResponse,
} from './auth';

// Hive types - Epic 5, Story 5.2
export type {
  HiveLossSummary,
  QueenHistory,
  BoxChange,
  HiveStatus,
  HiveLifecycleStatus,
  HiveListItem,
  HiveDetail,
  HiveRef,
} from './hive';
