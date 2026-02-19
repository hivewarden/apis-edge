/**
 * Hooks Barrel Export
 */

// Generic async data hook - Dashboard Refactoring Pass 5
export { useAsyncData } from "./useAsyncData";
export type { UseAsyncDataResult } from "./useAsyncData";

export { useAuth } from "./useAuth";
export type { AuthState } from "./useAuth";
// Re-export UserIdentity from canonical location (types/auth)
export type { UserIdentity } from "../types/auth";
export { useClips } from "./useClips";
export type { Clip, ClipFilters } from "./useClips";
export { useTreatments, TREATMENT_TYPES, TREATMENT_METHODS, formatTreatmentType, formatTreatmentMethod, calculateEfficacy } from "./useTreatments";
export type { Treatment, CreateTreatmentInput, UpdateTreatmentInput } from "./useTreatments";
export { useFeedings, FEED_TYPES, FEED_UNITS, CONCENTRATION_OPTIONS, formatFeedType, formatAmount, feedTypeHasConcentration } from "./useFeedings";
export type { Feeding, SeasonTotal, CreateFeedingInput, UpdateFeedingInput } from "./useFeedings";
export { useFrameHistory } from "./useFrameHistory";
export type { ChartDataPoint } from "./useFrameHistory";
export { useHarvestsByHive, useHarvestsBySite, useHarvestAnalytics, formatHarvestDate, formatKg, getCurrentSeasonLabel } from "./useHarvests";
export type { Harvest, HarvestHive, CreateHarvestInput, UpdateHarvestInput, HarvestAnalytics, HarvestHiveInput, HiveHarvestStat, YearStat, BestHiveStat } from "./useHarvests";
export { useEquipment, EQUIPMENT_TYPES, EQUIPMENT_ACTIONS, formatEquipmentType, formatDuration } from "./useEquipment";
export type { EquipmentLog, CurrentlyInstalledEquipment, EquipmentHistoryItem, CreateEquipmentLogInput, UpdateEquipmentLogInput } from "./useEquipment";
// PWA hooks - Epic 7, Story 7.1
export { useOnlineStatus } from "./useOnlineStatus";
export { useSWUpdate } from "./useSWUpdate";

// Offline Data hook - Epic 7, Story 7.2
export { useOfflineData } from "./useOfflineData";
export type { UseOfflineDataOptions, UseOfflineDataResult } from "./useOfflineData";

// Pending Sync hook - Epic 7, Story 7.3
export { usePendingSync } from "./usePendingSync";
export type { PendingItemGroup, UsePendingSyncResult } from "./usePendingSync";

// Export hook - Epic 9, Story 9.1
export { useExport, EXPORT_FIELD_OPTIONS } from "./useExport";
export type { IncludeConfig, ExportOptions, ExportResult, ExportPreset } from "./useExport";

// BeeBrain hook - Epic 8, Story 8.2
export { useBeeBrain } from "./useBeeBrain";
export type { Insight, BeeBrainData, UseBeeBrainResult } from "./useBeeBrain";

// Background Sync hook - Epic 7, Story 7.4
export { useBackgroundSync } from "./useBackgroundSync";
export type { UseBackgroundSyncResult } from "./useBackgroundSync";

// Hive BeeBrain hook - Epic 8, Story 8.3
export { useHiveBeeBrain } from "./useHiveBeeBrain";
export type { HiveBeeBrainData, UseHiveBeeBrainResult, Insight as HiveInsight } from "./useHiveBeeBrain";

// Milestones hook - Epic 9, Story 9.2
export { useMilestonePhotos, useMilestoneFlags, getMilestoneTypeName } from "./useMilestones";
export type { MilestonePhoto, MilestoneFlags } from "./useMilestones";

// Proactive Insights hook - Epic 8, Story 8.4
export { useProactiveInsights } from "./useProactiveInsights";
export type { ProactiveInsight, UseProactiveInsightsResult } from "./useProactiveInsights";

// Speech Recognition hook - Epic 7, Story 7.5
export { useSpeechRecognition } from "./useSpeechRecognition";
export type { UseSpeechRecognitionResult, UseSpeechRecognitionOptions } from "./useSpeechRecognition";

// Hive Loss hook - Epic 9, Story 9.3
export { useHiveLoss, useHiveLosses, useHiveLossStats, CAUSE_OPTIONS, SYMPTOM_OPTIONS } from "./useHiveLoss";
export type { HiveLoss, HiveLossStats, CreateHiveLossInput } from "./useHiveLoss";

// Maintenance hook - Epic 8, Story 8.5
export { useMaintenanceItems } from "./useMaintenanceItems";
export type { MaintenanceItem, QuickAction, RecentlyCompletedItem, MaintenanceData, UseMaintenanceItemsResult } from "./useMaintenanceItems";

// QR Scanner hook - Epic 7, Story 7.6
export { useQRScanner } from "./useQRScanner";
export type { UseQRScannerResult } from "./useQRScanner";

// Season Recap hook - Epic 9, Story 9.4
export { useSeasonRecap, useAvailableSeasons, useRecapTime, getRecapText, formatHarvestKg, getStatusColor, getStatusLabel, getMilestoneIcon } from "./useSeasonRecap";
export type { SeasonRecap, YearComparison, HiveSeasonStat, Milestone, SeasonDates, UseSeasonRecapResult, UseAvailableSeasonsResult, UseRecapTimeResult } from "./useSeasonRecap";

// Overwintering hook - Epic 9, Story 9.5
export { useSpringPrompt, useOverwinteringHives, submitOverwinteringRecord, useWinterReport, useSurvivalTrends, useAvailableWinters, getSeasonLabel, getConditionDisplay, getStoresDisplay } from "./useOverwintering";
export type { OverwinteringRecord, SpringPromptData, HiveWithRecord, WinterReport, SurvivalTrend, CreateOverwinteringInput, LostHiveSummary, SurvivedHiveSummary, WinterComparison } from "./useOverwintering";

// Detection Stats hook - Epic 3, Story 3.2
export { useDetectionStats } from "./useDetectionStats";
export type { DetectionStats } from "./useDetectionStats";

// Weather hook - Epic 3, Story 3.3
export { useWeather } from "./useWeather";
export type { WeatherData } from "./useWeather";

// Temperature Correlation hook - Epic 3, Story 3.6
export { useTemperatureCorrelation } from "./useTemperatureCorrelation";
export type { CorrelationPoint } from "./useTemperatureCorrelation";

// Trend Data hook - Epic 3, Story 3.7
export { useTrendData } from "./useTrendData";
export type { TrendPoint } from "./useTrendData";

// Custom Labels hook - Epic 6, Story 6.5
export {
  useCustomLabels,
  LABEL_CATEGORIES,
  BUILT_IN_TREATMENT_TYPES,
  BUILT_IN_FEED_TYPES,
  BUILT_IN_EQUIPMENT_TYPES,
  BUILT_IN_ISSUE_TYPES,
  getBuiltInTypes,
  mergeTypesWithCustomLabels,
} from "./useCustomLabels";
export type { CustomLabel, LabelCategory, LabelUsage, CreateLabelInput, UpdateLabelInput } from "./useCustomLabels";

// Calendar hook - Epic 6, Story 6.6
export {
  useCalendar,
  useTreatmentIntervals,
  DEFAULT_TREATMENT_INTERVALS,
  formatTreatmentType as formatTreatmentTypeCalendar,
} from "./useCalendar";
export type {
  CalendarEvent,
  CalendarFilters,
  Reminder,
  ReminderType,
  CreateReminderInput,
  UpdateReminderInput,
  TreatmentIntervals,
} from "./useCalendar";

// User Management hooks - Epic 13, Story 13.11
export {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useInviteUser,
  useResetPassword,
  useUserAdminChecks,
} from "./useUsers";
export type {
  User,
  CreateUserInput,
  UpdateUserInput,
  InviteMethod,
  InviteUserInput,
  InviteResponse,
} from "./useUsers";

// Admin Tenant Management hooks - Epic 13, Story 13.12
export {
  useAdminTenants,
  useAdminTenant,
  useCreateTenant,
  useUpdateTenant,
  useDeleteTenant,
  formatStorageSize as formatAdminStorageSize,
  getStatusColor as getTenantStatusColor,
  getPlanColor,
} from "./useAdminTenants";
export type {
  Tenant,
  CreateTenantInput,
  UpdateTenantInput,
} from "./useAdminTenants";

// Impersonation hook - Epic 13, Story 13.14
export { useImpersonation } from "./useImpersonation";
export type { ImpersonationState } from "./useImpersonation";

// Admin BeeBrain Config hooks - Epic 13, Story 13.15
export {
  useAdminBeeBrainConfig,
  useUpdateBeeBrainConfig,
  useSetTenantBeeBrainAccess,
  getBackendDisplayName,
  getBackendDescription,
  getProviderOptions,
} from "./useAdminBeeBrain";
export type {
  BeeBrainBackend,
  BeeBrainSystemConfig,
  TenantBeeBrainAccess,
  BeeBrainConfigResponse,
  UpdateBeeBrainConfigInput,
} from "./useAdminBeeBrain";

// Activity Feed hook - Epic 13, Story 13.17
export { useActivityFeed } from "./useActivityFeed";
export type {
  ActivityItem,
  ActivityFilters,
  UseActivityFeedOptions,
  UseActivityFeedResult,
} from "./useActivityFeed";

// BeeBrain Settings hook - Epic 13, Story 13.18 (BYOK)
export {
  useBeeBrainSettings,
  useUpdateBeeBrainSettings,
  getModeDisplayName,
  getModeDescription,
  getProviderDisplayName,
  getProviderDescription,
  getBYOKProviderOptions,
  getModeOptions,
} from "./useBeeBrainSettings";
export type {
  BeeBrainMode,
  BeeBrainProvider,
  BeeBrainSettings,
  UpdateBeeBrainSettingsInput,
  UseBeeBrainSettingsResult,
  UseUpdateBeeBrainSettingsResult,
} from "./useBeeBrainSettings";

// Tenant Settings hooks - Epic 13, Story 13.19
export {
  useTenantSettings,
  useUpdateProfile,
  formatStorageSize,
  getUsageStatus,
  getProgressStatus,
  isWarningZone,
} from "./useTenantSettings";
export type {
  TenantInfo,
  UsageInfo,
  LimitsInfo,
  PercentagesInfo,
  TenantSettings,
  UseTenantSettingsResult,
  UpdateProfileInput,
  ProfileInfo,
  UseUpdateProfileResult,
} from "./useTenantSettings";

// Task Templates hook - Epic 14, Story 14.4
export {
  useTaskTemplates,
  useCreateTaskTemplate,
  useDeleteTaskTemplate,
} from "./useTaskTemplates";
export type {
  TaskTemplate,
  CreateTemplateInput,
} from "./useTaskTemplates";

// Tasks hook - Epic 14, Stories 14.4 and 14.5
export {
  useCreateTasks,
  useFetchTasks,
  useCompleteTask,
  useDeleteTask,
  useBulkDeleteTasks,
  useBulkCompleteTasks,
  PRIORITY_OPTIONS,
  getPriorityColor,
  getPriorityLabel,
} from "./useTasks";
export type {
  Task,
  TaskPriority,
  TaskStatus,
  CreateTaskInput,
  BulkCreateResponse,
  TaskFiltersState,
  TaskCompletionData,
  Prompt,
  AutoEffects,
  AutoEffectUpdate,
} from "./useTasks";

// Active Section hook - Epic 14, Story 14.8
export { useActiveSection } from "./useActiveSection";
export type {
  SectionId,
  UseActiveSectionOptions,
  UseActiveSectionReturn,
} from "./useActiveSection";

// Hive Tasks hook - Epic 14, Story 14.9
export { useHiveTasks } from "./useHiveTasks";
export type {
  TaskStatusFilter,
  UseHiveTasksResult,
} from "./useHiveTasks";

// ============================================
// Layered Hooks Architecture - Core Entity Hooks
// ============================================

// Sites hook - fetches all sites for tenant
export { useSites } from "./useSites";
export type { Site, UseSitesResult } from "./useSites";

// Units hook - fetches units with optional site filter
export { useUnits } from "./useUnits";
export type { Unit, UseUnitsResult } from "./useUnits";

// Hives List hook - fetches hives with optional site filter
export { useHivesList } from "./useHivesList";
export type {
  HiveListItem,
  UseHivesListResult,
  UseHivesListOptions,
} from "./useHivesList";

// ============================================
// Layered Hooks Architecture - Detail Hooks
// ============================================

// Site Detail hook - single site with hives and mutations
export { useSiteDetail } from "./useSiteDetail";
export type {
  SiteDetail,
  SiteHive,
  UseSiteDetailResult,
} from "./useSiteDetail";

// Hive Detail hook - single hive with site info and mutations
export { useHiveDetail } from "./useHiveDetail";
export type {
  HiveDetail,
  QueenHistory,
  BoxChange,
  TaskSummary,
  HiveSiteInfo,
  SiteHive as HiveSiteHive,
  ReplaceQueenInput,
  UseHiveDetailResult,
} from "./useHiveDetail";

// Unit Detail hook - single unit with mutations
export { useUnitDetail } from "./useUnitDetail";
export type {
  UnitDetail,
  UseUnitDetailResult,
} from "./useUnitDetail";

// ============================================
// Layered Hooks Architecture - Specialized Hooks
// ============================================

// Nest Estimate hook - fetches nest radius estimate for site
export { useNestEstimate } from "./useNestEstimate";
export type {
  NestEstimateData,
  UseNestEstimateResult,
} from "./useNestEstimate";

// Detection hook - fetches detection details by ID
export { useDetection } from "./useDetection";
export type {
  Detection,
  UseDetectionResult,
} from "./useDetection";

// Inspections List hook - paginated inspections for hive
export { useInspectionsList } from "./useInspectionsList";
export type {
  Inspection,
  InspectionFrameData,
  UseInspectionsListOptions,
  UseInspectionsListResult,
} from "./useInspectionsList";

// Hive Activity hook - Epic 14, Story 14.13
export { useHiveActivity } from "./useHiveActivity";
export type {
  ActivityLogEntry,
  ActivityLogMetadata,
  UseHiveActivityOptions,
  UseHiveActivityResult,
} from "./useHiveActivity";

// Task Stats hook - Epic 14, Story 14.14
export { useTaskStats } from "./useTaskStats";
export type { TaskStats, UseTaskStatsResult } from "./useTaskStats";

// Task Suggestions hook - Epic 14, Story 14.15
export { useTaskSuggestions } from "./useTaskSuggestions";
export type {
  TaskSuggestion,
  SuggestionPriority,
  SuggestionStatus,
  UseTaskSuggestionsResult,
} from "./useTaskSuggestions";

// Offline Tasks hook - Epic 14, Story 14.16
export { useOfflineTasks } from "./useOfflineTasks";
export type { UseOfflineTasksResult } from "./useOfflineTasks";
