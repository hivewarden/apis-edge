/**
 * TaskFilters Component
 *
 * Filter controls for the Active Tasks list.
 * Includes site dropdown, priority dropdown, status dropdown, and search input.
 *
 * Part of Epic 14, Story 14.5 (Portal Active Tasks List)
 */
import { useMemo, useCallback, useRef, useEffect } from 'react';
import { Select, Input, Row, Col, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import debounce from 'lodash-es/debounce';
import { PRIORITY_OPTIONS } from '../hooks/useTasks';
import type { TaskPriority, TaskFiltersState } from '../hooks/useTasks';
import { colors } from '../theme/apisTheme';

/** Empty string sentinel for "All" options in Select components */
const ALL_VALUE = '' as const;

interface Site {
  id: string;
  name: string;
}

export interface TaskFiltersProps {
  /** Current filter values */
  filters: TaskFiltersState;
  /** Callback when filters change */
  onFilterChange: (filters: TaskFiltersState) => void;
  /** List of available sites */
  sites: Site[];
  /** Whether sites are still loading */
  sitesLoading?: boolean;
}

/** Status filter options */
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
] as const;

/**
 * TaskFilters Component
 *
 * Provides filter controls for filtering the task list by:
 * - Site (dropdown)
 * - Priority (dropdown with colored options)
 * - Status (Open/Completed/All)
 * - Search (debounced text input)
 */
export function TaskFilters({
  filters,
  onFilterChange,
  sites,
  sitesLoading = false,
}: TaskFiltersProps) {
  // Use refs to avoid stale closures in debounced function
  const filtersRef = useRef(filters);
  const onFilterChangeRef = useRef(onFilterChange);

  // Keep refs in sync
  useEffect(() => {
    filtersRef.current = filters;
    onFilterChangeRef.current = onFilterChange;
  }, [filters, onFilterChange]);

  // Stable debounced search handler - created once, reads from refs
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        onFilterChangeRef.current({
          ...filtersRef.current,
          search: value || undefined,
        });
      }, 300),
    [] // Empty deps - function is stable, reads current values from refs
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // Handle site filter change
  const handleSiteChange = useCallback(
    (value: string | undefined) => {
      // Convert empty string sentinel back to undefined
      const siteId = value === ALL_VALUE ? undefined : value;
      onFilterChange({ ...filters, site_id: siteId });
    },
    [filters, onFilterChange]
  );

  // Handle priority filter change
  const handlePriorityChange = useCallback(
    (value: string | undefined) => {
      // Convert empty string sentinel back to undefined
      const priority = value === ALL_VALUE ? undefined : (value as TaskPriority);
      onFilterChange({ ...filters, priority });
    },
    [filters, onFilterChange]
  );

  // Handle status filter change
  const handleStatusChange = useCallback(
    (value: 'pending' | 'completed' | 'all') => {
      onFilterChange({ ...filters, status: value });
    },
    [filters, onFilterChange]
  );

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSearch(e.target.value);
    },
    [debouncedSearch]
  );

  // Build site options with "All Sites" at top using empty string sentinel
  const siteOptions = useMemo(() => {
    return [
      { value: ALL_VALUE, label: 'All Sites' },
      ...sites.map((site) => ({ value: site.id, label: site.name })),
    ];
  }, [sites]);

  // Build priority options with "All" at top and colors
  const priorityOptions = useMemo(() => {
    return [
      { value: ALL_VALUE, label: 'All Priorities' },
      ...PRIORITY_OPTIONS.map((opt) => ({
        value: opt.value,
        label: (
          <Space>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: opt.color,
              }}
            />
            {opt.label}
          </Space>
        ),
      })),
    ];
  }, []);

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      {/* Site Filter */}
      <Col xs={24} sm={12} md={6}>
        <Select
          style={{ width: '100%' }}
          placeholder="All Sites"
          value={filters.site_id ?? ALL_VALUE}
          onChange={handleSiteChange}
          loading={sitesLoading}
          options={siteOptions}
        />
      </Col>

      {/* Priority Filter */}
      <Col xs={24} sm={12} md={6}>
        <Select
          style={{ width: '100%' }}
          placeholder="All Priorities"
          value={filters.priority ?? ALL_VALUE}
          onChange={handlePriorityChange}
          options={priorityOptions}
        />
      </Col>

      {/* Status Filter */}
      <Col xs={24} sm={12} md={6}>
        <Select
          style={{ width: '100%' }}
          value={filters.status || 'pending'}
          onChange={handleStatusChange}
          options={STATUS_OPTIONS.map((opt) => ({
            value: opt.value,
            label: opt.label,
          }))}
        />
      </Col>

      {/* Search Input */}
      <Col xs={24} sm={12} md={6}>
        <Input
          placeholder="Search hive or task name..."
          prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
          onChange={handleSearchChange}
          allowClear
          defaultValue={filters.search}
        />
      </Col>
    </Row>
  );
}

export default TaskFilters;
