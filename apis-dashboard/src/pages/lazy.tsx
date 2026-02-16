/**
 * Lazy-loaded page exports for code splitting.
 *
 * This file centralizes all lazy-loaded page imports to:
 * 1. Reduce initial bundle size from ~4.6MB to ~350KB
 * 2. Enable PWA compatibility (chunks under 2MB for Workbox)
 * 3. Group related pages into shared chunks for efficient caching
 *
 * Part of code splitting optimization.
 */
import { lazy } from 'react';
import { Spin } from 'antd';

/**
 * Loading fallback shown while page chunks are loading.
 * Centered spinner with "Loading..." text.
 */
export function PageLoading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
      <Spin size="large" tip="Loading..." />
    </div>
  );
}


// ============================================================================
// SITES - Grouped into single chunk
// ============================================================================
export const LazySites = lazy(() => import(/* webpackChunkName: "page-sites" */ './Sites'));
export const LazySiteDetail = lazy(() => import(/* webpackChunkName: "page-sites" */ './SiteDetail'));
export const LazySiteCreate = lazy(() => import(/* webpackChunkName: "page-sites" */ './SiteCreate'));
export const LazySiteEdit = lazy(() => import(/* webpackChunkName: "page-sites" */ './SiteEdit'));

// ============================================================================
// HIVES - Grouped into single chunk (HiveDetail separate - larger)
// ============================================================================
export const LazyHives = lazy(() => import(/* webpackChunkName: "page-hives" */ './Hives'));
export const LazyHiveCreate = lazy(() => import(/* webpackChunkName: "page-hives" */ './HiveCreate'));
export const LazyHiveEdit = lazy(() => import(/* webpackChunkName: "page-hives" */ './HiveEdit'));
export const LazyHiveDetail = lazy(() => import(/* webpackChunkName: "page-hive-detail" */ './HiveDetail'));

// ============================================================================
// INSPECTIONS - Grouped into single chunk
// ============================================================================
export const LazyInspectionCreate = lazy(() => import(/* webpackChunkName: "page-inspection" */ './InspectionCreate'));
export const LazyInspectionEdit = lazy(() => import(/* webpackChunkName: "page-inspection" */ './InspectionEdit'));

// ============================================================================
// UNITS - Grouped into single chunk
// ============================================================================
export const LazyUnits = lazy(() => import(/* webpackChunkName: "page-units" */ './Units'));
export const LazyUnitDetail = lazy(() => import(/* webpackChunkName: "page-units" */ './UnitDetail'));
export const LazyUnitRegister = lazy(() => import(/* webpackChunkName: "page-units" */ './UnitRegister'));
export const LazyUnitEdit = lazy(() => import(/* webpackChunkName: "page-units" */ './UnitEdit'));

// ============================================================================
// FEATURES - Individual chunks (accessed independently)
// ============================================================================
export const LazyClips = lazy(() => import(/* webpackChunkName: "page-clips" */ './Clips'));
export const LazyStatistics = lazy(() => import(/* webpackChunkName: "page-statistics" */ './Statistics'));
export const LazyMaintenance = lazy(() => import(/* webpackChunkName: "page-maintenance" */ './Maintenance'));
export const LazyCalendar = lazy(() => import(/* webpackChunkName: "page-calendar" */ './Calendar'));
export const LazyActivity = lazy(() => import(/* webpackChunkName: "page-activity" */ './Activity'));
export const LazyTasks = lazy(() => import(/* webpackChunkName: "page-tasks" */ './Tasks'));
export const LazyCustomLabels = lazy(() => import(/* webpackChunkName: "page-labels" */ './CustomLabels'));
export const LazyInviteAccept = lazy(() => import(/* webpackChunkName: "page-invite" */ './InviteAccept'));

// ============================================================================
// SETTINGS - Grouped into single chunk
// ============================================================================
export const LazySettings = lazy(() => import(/* webpackChunkName: "page-settings" */ './Settings'));
export const LazyExport = lazy(() => import(/* webpackChunkName: "page-settings" */ './Export'));
export const LazyUsers = lazy(() => import(/* webpackChunkName: "page-settings" */ './settings/Users'));
export const LazyBeeBrainConfigPage = lazy(() => import(/* webpackChunkName: "page-settings" */ './settings/BeeBrainConfig'));

// ============================================================================
// SEASONAL - Grouped into single chunk
// ============================================================================
export const LazySeasonRecap = lazy(() => import(/* webpackChunkName: "page-seasonal" */ './SeasonRecap'));
export const LazyOverwinteringSurvey = lazy(() => import(/* webpackChunkName: "page-seasonal" */ './OverwinteringSurvey'));
export const LazyWinterReport = lazy(() => import(/* webpackChunkName: "page-seasonal" */ './WinterReport'));

// ============================================================================
// ADMIN - Grouped into single chunk (super-admin only)
// ============================================================================
export const LazyAdminTenants = lazy(() => import(/* webpackChunkName: "page-admin" */ './admin/Tenants'));
export const LazyAdminTenantDetail = lazy(() => import(/* webpackChunkName: "page-admin" */ './admin/TenantDetail'));
export const LazyAdminBeeBrain = lazy(() => import(/* webpackChunkName: "page-admin" */ './admin/BeeBrainConfig'));

// ============================================================================
// ERROR PAGES
// ============================================================================
export const LazyNotFound = lazy(() => import(/* webpackChunkName: "page-error" */ './NotFound'));
