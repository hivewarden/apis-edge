export {
  TimeRangeProvider,
  useTimeRange,
  DEFAULT_TIME_RANGE,
} from './TimeRangeContext';
export type { TimeRange, TimeRangeContextValue } from './TimeRangeContext';

export { SettingsProvider, useSettings } from './SettingsContext';
export type { VoiceInputMethod } from './SettingsContext';

// Background Sync - Epic 7, Story 7.4
export {
  BackgroundSyncProvider,
  useBackgroundSyncContext,
} from './BackgroundSyncContext';
export type { BackgroundSyncContextValue } from './BackgroundSyncContext';

// Proactive Insights - Epic 8, Story 8.4
export {
  ProactiveInsightsProvider,
  useProactiveInsightsContext,
} from './ProactiveInsightsContext';
export type { ProactiveInsightsContextValue, ProactiveInsight } from './ProactiveInsightsContext';
