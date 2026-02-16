/**
 * Component exports - only eagerly loaded components.
 *
 * CRITICAL: Do NOT add lazy-loaded components here.
 * If a component is dynamically imported in lazy.tsx, do not re-export it here,
 * as that would defeat code splitting by including it in the main bundle.
 *
 * For lazy-loaded components (charts, maps, QR), import from './lazy' instead.
 */

export { ApiCard } from './ApiCard';
export type { ApiCardProps } from './ApiCard';

// Layout components
export { AppLayout, Logo, navItems } from './layout';

// Dashboard components - LIGHT (no heavy deps)
export { TodayActivityCard } from './TodayActivityCard';
export { WeatherCard } from './WeatherCard';
export { UnitStatusCard } from './UnitStatusCard';
export type { Unit, UnitStatusCardProps } from './UnitStatusCard';
export { TimeRangeSelector } from './TimeRangeSelector';
export { BeeBrainCard } from './BeeBrainCard';
export type { BeeBrainCardProps } from './BeeBrainCard';
export { HiveBeeBrainCard } from './HiveBeeBrainCard';
export type { HiveBeeBrainCardProps } from './HiveBeeBrainCard';

// LAZY: Chart components - import from './lazy' instead
// - ActivityClockCard
// - TemperatureCorrelationCard
// - TrendChartCard
// - FrameDevelopmentChart
// - SurvivalTrendChart
// - YearComparisonChart

// LAZY: Map components - import from './lazy' instead
// - NestEstimatorCard
// - SiteMapView
// - SiteMapThumbnail

// Clip components
export { ClipCard } from './ClipCard';
export type { ClipCardProps } from './ClipCard';
export { ClipPlayerModal } from './ClipPlayerModal';
export type { ClipPlayerModalProps } from './ClipPlayerModal';

// Inspection components
export { InspectionHistory } from './InspectionHistory';
export { InspectionDetailModal } from './InspectionDetailModal';
export { FrameEntryCard } from './FrameEntryCard';
export type { FrameData } from './FrameEntryCard';
// LAZY: FrameDevelopmentChart - import from './lazy' instead

// Treatment components - Epic 6
export { TreatmentFormModal } from './TreatmentFormModal';
export { TreatmentFollowupModal } from './TreatmentFollowupModal';
export { TreatmentHistoryCard } from './TreatmentHistoryCard';

// Feeding components - Epic 6
export { FeedingFormModal } from './FeedingFormModal';
export { FeedingHistoryCard } from './FeedingHistoryCard';

// Harvest components - Epic 6, Story 6.3
export { HarvestFormModal } from './HarvestFormModal';
export { HarvestHistoryCard } from './HarvestHistoryCard';
export { FirstHarvestModal } from './FirstHarvestModal';
export { HarvestAnalyticsCard } from './HarvestAnalyticsCard';

// Celebration components - Epic 9, Story 9.2
export { ConfettiAnimation } from './ConfettiAnimation';
export { FirstHiveCelebration, showFirstHiveCelebration } from './FirstHiveCelebration';
export { MilestonesGallery } from './MilestonesGallery';

// Equipment components - Epic 6, Story 6.4
export { EquipmentFormModal } from './EquipmentFormModal';
export { EquipmentStatusCard } from './EquipmentStatusCard';

// PWA components - Epic 7, Story 7.1
export { OfflineBanner } from './OfflineBanner';
export { UpdateNotification } from './UpdateNotification';

// Offline Storage components - Epic 7, Story 7.2
export { SyncStatus } from './SyncStatus';
export type { SyncStatusProps } from './SyncStatus';
export { DataUnavailableOffline, DataUnavailableOfflineCompact } from './DataUnavailableOffline';
export type { DataUnavailableOfflineProps } from './DataUnavailableOffline';

// Offline Inspection components - Epic 7, Story 7.3
export { OfflineInspectionBadge } from './OfflineInspectionBadge';
export type { OfflineInspectionBadgeProps } from './OfflineInspectionBadge';

// Background Sync components - Epic 7, Story 7.4
export { SyncNotification } from './SyncNotification';
export type { SyncNotificationProps } from './SyncNotification';
export { ConflictResolutionModal } from './ConflictResolutionModal';
export type { ConflictResolutionModalProps } from './ConflictResolutionModal';

// Proactive Insight components - Epic 8, Story 8.4
export { ProactiveInsightNotification } from './ProactiveInsightNotification';
export type { ProactiveInsightNotificationProps } from './ProactiveInsightNotification';
export { ProactiveInsightBanner } from './ProactiveInsightBanner';
export type { ProactiveInsightBannerProps } from './ProactiveInsightBanner';

// Voice Input components - Epic 7, Story 7.5
export { VoiceInputButton } from './VoiceInputButton';
export type { VoiceInputButtonProps } from './VoiceInputButton';
export { VoiceInputTextArea } from './VoiceInputTextArea';
export type { VoiceInputTextAreaProps } from './VoiceInputTextArea';

// Hive Loss components - Epic 9, Story 9.3
export { HiveLossWizard } from './HiveLossWizard';
export type { HiveLossWizardProps } from './HiveLossWizard';
export { HiveLossSummary } from './HiveLossSummary';
export type { HiveLossSummaryProps } from './HiveLossSummary';
export { LostHiveBadge } from './LostHiveBadge';
export type { LostHiveBadgeProps } from './LostHiveBadge';

// Maintenance components - Epic 8, Story 8.5
export { MaintenanceItemCard } from './MaintenanceItemCard';
export type { MaintenanceItemCardProps } from './MaintenanceItemCard';

// QR Code components - LAZY: QRScannerModal, QRGeneratorModal - import from './lazy'
export { QRCodeGenerator, generateQRContent } from './QRCodeGenerator';
export type { QRCodeGeneratorProps } from './QRCodeGenerator';
// parseQRCode is exported from QRScannerModal but doesn't require html5-qrcode
// Keep the type export available
export type { QRScannerModalProps } from './QRScannerModal';
export type { QRGeneratorModalProps, QRHive } from './QRGeneratorModal';

// Season Recap components - Epic 9, Story 9.4
export { SeasonRecapCard } from './SeasonRecapCard';
export type { SeasonRecapCardProps } from './SeasonRecapCard';
export { HiveSeasonSummary } from './HiveSeasonSummary';
export type { HiveSeasonSummaryProps } from './HiveSeasonSummary';
export { RecapShareModal } from './RecapShareModal';
export type { RecapShareModalProps } from './RecapShareModal';
// LAZY: YearComparisonChart - import from './lazy' instead
export type { YearComparisonChartProps } from './YearComparisonChart';

// Overwintering components - Epic 9, Story 9.5
export { OverwinteringPrompt } from './OverwinteringPrompt';
export { HiveWinterStatusCard } from './HiveWinterStatusCard';
export type { HiveWinterData, WinterStatus, Condition, StoresRemaining } from './HiveWinterStatusCard';
export { SurvivalCelebration } from './SurvivalCelebration';
// LAZY: SurvivalTrendChart - import from './lazy' instead

// LAZY: Site Map components - import from './lazy' instead
// - SiteMapThumbnail
// - SiteMapView

// Live Stream components - Epic 2, Story 2.5
export { LiveStream } from './LiveStream';

// Error handling components - Story 2.2 remediation
export { ErrorBoundary } from './ErrorBoundary';

// Hive display components - Epic 5, Story 5.2 remediation
export { HiveStatusBadge } from './HiveStatusBadge';
export type { HiveStatusBadgeProps } from './HiveStatusBadge';
export { MiniHiveVisualization } from './MiniHiveVisualization';
export type { MiniHiveVisualizationProps } from './MiniHiveVisualization';

// Custom Labels components - Epic 6, Story 6.5
export { LabelFormModal } from './LabelFormModal';
export { LabelDeleteModal } from './LabelDeleteModal';

// Calendar components - Epic 6, Story 6.6
export { CalendarDayDetail } from './CalendarDayDetail';
export { ReminderFormModal } from './ReminderFormModal';

// Auth components - Epic 13, Stories 13.6, 13.7
export { AuthGuard, LoginForm, OIDCLoginButton, SetupWizard, SecurityWarningModal } from './auth';

// Admin components - Epic 13, Story 13.14
export { ImpersonationBanner } from './admin/ImpersonationBanner';
export type { ImpersonationBannerProps } from './admin/ImpersonationBanner';

// Activity Feed components - Epic 13, Story 13.17
export { ActivityFeedCard } from './ActivityFeedCard';
export type { ActivityFeedCardProps } from './ActivityFeedCard';

// Task Management components - Epic 14, Story 14.4
export { TaskLibrarySection } from './TaskLibrarySection';
export type { TaskLibrarySectionProps } from './TaskLibrarySection';
export { CreateTemplateModal } from './CreateTemplateModal';
export type { CreateTemplateModalProps } from './CreateTemplateModal';
export { TaskAssignmentSection } from './TaskAssignmentSection';
export type { TaskAssignmentSectionProps } from './TaskAssignmentSection';

// Task Management components - Epic 14, Story 14.5
export { TaskFilters } from './TaskFilters';
export type { TaskFiltersProps } from './TaskFilters';
export { BulkActionsBar } from './BulkActionsBar';
export type { BulkActionsBarProps } from './BulkActionsBar';
export { TaskCompletionModal } from './TaskCompletionModal';
export type { TaskCompletionModalProps } from './TaskCompletionModal';
export { ActiveTasksList } from './ActiveTasksList';

// Task Summary components - Epic 14, Story 14.6
export { HiveTaskSummary } from './HiveTaskSummary';
export type { HiveTaskSummaryProps } from './HiveTaskSummary';
export { OverdueBadge } from './OverdueBadge';
export type { OverdueBadgeProps } from './OverdueBadge';

// Mobile Hive Detail components - Epic 14, Story 14.7
export { SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';
export { HiveDetailMobile } from './HiveDetailMobile';
export type { HiveDetailMobileProps, HiveDetailMobileHive } from './HiveDetailMobile';
export { HiveDetailDesktop } from './HiveDetailDesktop';
export type { HiveDetailDesktopProps, HiveDetailDesktopHive } from './HiveDetailDesktop';
export { HiveDetailTasksSection } from './HiveDetailTasksSection';
export type { HiveDetailTasksSectionProps } from './HiveDetailTasksSection';

// Bottom Navigation component - Epic 14, Story 14.8
export { BottomAnchorNav } from './BottomAnchorNav';
export type { BottomAnchorNavProps } from './BottomAnchorNav';

// Mobile Tasks components - Epic 14, Story 14.9
export { MobileTaskCard } from './MobileTaskCard';
export type { MobileTaskCardProps } from './MobileTaskCard';
export { TaskEmptyState } from './TaskEmptyState';
export type { TaskEmptyStateProps } from './TaskEmptyState';
export { MobileTasksSection } from './MobileTasksSection';
export type { MobileTasksSectionProps } from './MobileTasksSection';

// Mobile Task Completion components - Epic 14, Story 14.10
export { MobileTaskCompletionSheet } from './MobileTaskCompletionSheet';
export type { MobileTaskCompletionSheetProps } from './MobileTaskCompletionSheet';
export { AutoEffectPrompts } from './AutoEffectPrompts';
export type { AutoEffectPromptsProps } from './AutoEffectPrompts';
export { ColorSelectPrompt } from './ColorSelectPrompt';
export type { ColorSelectPromptProps, ColorOption } from './ColorSelectPrompt';
export { NumberPrompt } from './NumberPrompt';
export type { NumberPromptProps } from './NumberPrompt';
export { TextPrompt } from './TextPrompt';
export type { TextPromptProps } from './TextPrompt';
export { SelectPrompt } from './SelectPrompt';
export type { SelectPromptProps, SelectOption } from './SelectPrompt';
export { DeleteTaskConfirmation } from './DeleteTaskConfirmation';
export type { DeleteTaskConfirmationProps } from './DeleteTaskConfirmation';

// Mobile Inline Task Creation components - Epic 14, Story 14.11
export { MobileAddTaskForm } from './MobileAddTaskForm';
export type { MobileAddTaskFormProps } from './MobileAddTaskForm';

// Activity Log components - Epic 14, Story 14.13
export { ActivityLogItem } from './ActivityLogItem';
export type { default as ActivityLogItemProps } from './ActivityLogItem';

// Overdue Alert components - Epic 14, Story 14.14
export { OverdueAlertBanner } from './OverdueAlertBanner';
export type { OverdueAlertBannerProps } from './OverdueAlertBanner';

// BeeBrain Suggestions components - Epic 14, Story 14.15
export { BeeBrainSuggestionsSection } from './BeeBrainSuggestionsSection';
export type { BeeBrainSuggestionsSectionProps } from './BeeBrainSuggestionsSection';
