/**
 * Hooks Barrel Export
 */
export { useAuth } from "./useAuth";
export type { AuthState, UserIdentity } from "./useAuth";
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
export type { HiveBeeBrainData, UseHiveBeeBrainResult } from "./useHiveBeeBrain";
// Re-export Insight from useHiveBeeBrain (compatible with useBeeBrain's Insight)
export type { Insight as HiveInsight } from "./useHiveBeeBrain";

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
