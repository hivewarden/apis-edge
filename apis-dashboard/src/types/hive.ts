/**
 * Shared Hive type definitions
 *
 * Provides canonical interfaces for hive data used across the dashboard.
 * Part of Epic 5, Story 5.2 remediation: Extract shared types.
 */

/**
 * Loss summary for a hive that has been marked as lost
 */
export interface HiveLossSummary {
  cause: string;
  cause_display: string;
  discovered_at: string;
}

/**
 * Queen history entry for tracking queen replacements
 */
export interface QueenHistory {
  id: string;
  introduced_at: string;
  source: string | null;
  replaced_at: string | null;
  replacement_reason: string | null;
}

/**
 * Box change entry for tracking hive configuration changes
 */
export interface BoxChange {
  id: string;
  change_type: 'added' | 'removed';
  box_type: 'brood' | 'super';
  changed_at: string;
  notes: string | null;
}

/**
 * Hive status for inspection-based status
 * - 'healthy': Inspected within 14 days, no issues
 * - 'needs_attention': >14 days since inspection or has issues
 * - 'unknown': Never inspected
 * - 'lost': Hive marked as lost
 */
export type HiveStatus = 'healthy' | 'needs_attention' | 'unknown' | 'lost';

/**
 * Hive lifecycle status
 * - 'active': Normal operating hive
 * - 'lost': Hive has been marked as lost
 * - 'archived': Hive is no longer tracked
 */
export type HiveLifecycleStatus = 'active' | 'lost' | 'archived';

/**
 * Base hive data returned from list endpoints
 * Used by Hives.tsx and SiteDetail.tsx
 */
export interface HiveListItem {
  id: string;
  site_id: string;
  name: string;
  queen_introduced_at: string | null;
  queen_source: string | null;
  queen_age_display: string | null;
  brood_boxes: number;
  honey_supers: number;
  last_inspection_at: string | null;
  last_inspection_issues: string[] | null;
  status: HiveStatus;
  hive_status: HiveLifecycleStatus;
  lost_at: string | null;
  loss_summary: HiveLossSummary | null;
}

/**
 * Full hive data returned from detail endpoint
 * Extends HiveListItem with history arrays
 * Used by HiveDetail.tsx
 */
export interface HiveDetail extends HiveListItem {
  notes: string | null;
  queen_history: QueenHistory[];
  box_changes: BoxChange[];
  created_at: string;
  updated_at: string;
}

/**
 * Simplified hive reference used for selections (e.g., treatment forms)
 */
export interface HiveRef {
  id: string;
  name: string;
}
