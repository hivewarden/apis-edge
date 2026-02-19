/**
 * Lazy-loaded component exports for heavy visualization components.
 *
 * These components import large dependencies (charts, maps, QR) that should
 * not be in the initial bundle. They are loaded on-demand when needed.
 *
 * Part of code splitting optimization.
 */
import { lazy, Suspense, ComponentType } from 'react';
import { Skeleton, Spin } from 'antd';

// ============================================================================
// SKELETON FALLBACKS
// ============================================================================

/**
 * Skeleton fallback for chart components.
 * Shows an animated skeleton while chart loads.
 */
export function ChartSkeleton() {
  return (
    <Skeleton.Node active style={{ width: '100%', height: 200 }}>
      <div style={{ width: '100%', height: 200 }} />
    </Skeleton.Node>
  );
}

/**
 * Skeleton fallback for map components.
 * Shows a gray background with spinner while map loads.
 */
export function MapSkeleton() {
  return (
    <div
      style={{
        width: '100%',
        height: 280,
        background: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
      }}
    >
      <Spin tip="Loading map..." />
    </div>
  );
}

/**
 * Skeleton fallback for modal components.
 * Shows centered spinner.
 */
export function ModalSkeleton() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <Spin size="large" />
    </div>
  );
}

// ============================================================================
// CHART COMPONENTS (import @ant-design/charts - ~150-200KB)
// ============================================================================

export const LazyActivityClockCard = lazy(
  () => import(/* webpackChunkName: "comp-charts" */ './ActivityClockCard')
);

export const LazyTemperatureCorrelationCard = lazy(
  () => import(/* webpackChunkName: "comp-charts" */ './TemperatureCorrelationCard')
);

export const LazyFrameDevelopmentChart = lazy(
  () => import(/* webpackChunkName: "comp-charts" */ './FrameDevelopmentChart')
);

export const LazyTrendChartCard = lazy(
  () => import(/* webpackChunkName: "comp-charts" */ './TrendChartCard')
);

export const LazySurvivalTrendChart = lazy(
  () => import(/* webpackChunkName: "comp-charts" */ './SurvivalTrendChart')
);

export const LazyYearComparisonChart = lazy(
  () => import(/* webpackChunkName: "comp-charts" */ './YearComparisonChart')
);

// ============================================================================
// MAP COMPONENTS (import leaflet - ~50KB)
// ============================================================================

export const LazyNestEstimatorCard = lazy(
  () => import(/* webpackChunkName: "comp-maps" */ './NestEstimatorCard')
);

export const LazySiteMapView = lazy(
  () => import(/* webpackChunkName: "comp-maps" */ './SiteMapView')
);

export const LazySiteMapThumbnail = lazy(
  () => import(/* webpackChunkName: "comp-maps" */ './SiteMapThumbnail')
);

export const LazyLocationPickerMap = lazy(
  () => import(/* webpackChunkName: "comp-maps" */ './LocationPickerMap')
);

// ============================================================================
// QR COMPONENTS (import html5-qrcode + qrcode - ~45KB)
// ============================================================================

export const LazyQRScannerModal = lazy(
  () => import(/* webpackChunkName: "comp-qr" */ './QRScannerModal')
);

export const LazyQRGeneratorModal = lazy(
  () => import(/* webpackChunkName: "comp-qr" */ './QRGeneratorModal')
);

// ============================================================================
// LAZY WRAPPER COMPONENTS WITH SUSPENSE
// These can be used as drop-in replacements with built-in loading states
// ============================================================================

/**
 * Helper to create a lazy wrapper component with Suspense.
 * Provides type safety by accepting the component's props.
 */
function createLazyWrapper<P extends object>(
  LazyComponent: ComponentType<P>,
  Fallback: ComponentType
) {
  return function LazyWrapper(props: P) {
    return (
      <Suspense fallback={<Fallback />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

// Chart component wrappers with Suspense
export const ActivityClockCardLazy = createLazyWrapper(
  LazyActivityClockCard as ComponentType<{ siteId: string | null }>,
  ChartSkeleton
);

export const TemperatureCorrelationCardLazy = createLazyWrapper(
  LazyTemperatureCorrelationCard as ComponentType<{ siteId: string | null }>,
  ChartSkeleton
);

export const TrendChartCardLazy = createLazyWrapper(
  LazyTrendChartCard as ComponentType<{ siteId: string | null }>,
  ChartSkeleton
);

export const FrameDevelopmentChartLazy = createLazyWrapper(
  LazyFrameDevelopmentChart as ComponentType<{ hiveId: string; height?: number }>,
  ChartSkeleton
);

// Map component wrappers with Suspense
export const NestEstimatorCardLazy = createLazyWrapper(
  LazyNestEstimatorCard as ComponentType<{
    siteId: string | null;
    latitude: number | null;
    longitude: number | null;
  }>,
  MapSkeleton
);

// SiteMapView wrapper - accepts full props
export const SiteMapViewLazy = createLazyWrapper(
  LazySiteMapView as ComponentType<{
    latitude: number;
    longitude: number;
    width?: number;
    height?: number;
    zoom?: number;
    showOpenInMaps?: boolean;
  }>,
  MapSkeleton
);

// SiteMapThumbnail wrapper - accepts nullable lat/lng
export const SiteMapThumbnailLazy = createLazyWrapper(
  LazySiteMapThumbnail as ComponentType<{
    latitude: number | null;
    longitude: number | null;
    width?: number;
    height?: number;
    zoom?: number;
  }>,
  MapSkeleton
);
