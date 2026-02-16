/**
 * MobileAddTaskForm Component
 *
 * An inline expandable form for quickly adding tasks on mobile.
 * Shows a collapsed "Add Task" card that expands to reveal a form
 * with template selection, optional custom title input, priority selector, and submit button.
 *
 * Design reference: /docs/hardware/stitch_apis_v2/apis_mobile_inline_task_form/
 *
 * Key features:
 * - Inline expansion (not modal) with 300ms animation
 * - Template dropdown with system templates first, then custom, then "Custom task..."
 * - Priority level pills (Low/Med/High) with salomie highlight
 * - 64px touch targets per NFR-HT-04
 * - Outside click detection to collapse
 * - Loading and error states
 * - Offline support with IndexedDB caching (Story 14.16)
 *
 * Part of Epic 14, Stories 14.11 and 14.16
 */
import { useState, useCallback, useRef, useEffect, useMemo, CSSProperties } from 'react';
import { Button, Select, Input, message } from 'antd';
import { CloseOutlined, LoadingOutlined } from '@ant-design/icons';
import { colors, touchTargets } from '../theme/apisTheme';
import { apiClient } from '../providers/apiClient';
import { TaskTemplate } from '../hooks/useTaskTemplates';
import { Task, TaskPriority } from '../hooks/useTasks';
import { saveOfflineTask } from '../services/offlineTasks';

export interface MobileAddTaskFormProps {
  /** The ID of the hive to create tasks for */
  hiveId: string;
  /** Callback when a task is successfully created (receives the new task ID for animation) */
  onTaskAdded: (newTaskId?: string) => void;
  /** Available task templates */
  templates: TaskTemplate[];
  /** Whether templates are still loading */
  templatesLoading: boolean;
  /** Optional style overrides */
  style?: CSSProperties;
  /** Tenant ID for offline task creation (Story 14.16) */
  tenantId?: string;
}

interface CreateTaskResponse {
  data: Task;
}

/**
 * Special value used for the "Custom task..." option in the dropdown.
 */
const CUSTOM_OPTION_VALUE = '__custom__';

/**
 * Mobile-optimized inline form for adding tasks.
 * Expands from a collapsed card state to show template selection and submit.
 *
 * @example
 * <MobileAddTaskForm
 *   hiveId={hiveId}
 *   onTaskAdded={refetch}
 *   templates={templates}
 *   templatesLoading={loading}
 * />
 */
/** Priority options for the radio pills */
const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
];

export function MobileAddTaskForm({
  hiveId,
  onTaskAdded,
  templates,
  templatesLoading,
  style,
  tenantId,
}: MobileAddTaskFormProps) {
  // Form state
  const [expanded, setExpanded] = useState(false);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [creating, setCreating] = useState(false);

  // Track online/offline state (Story 14.16)
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Ref for outside click detection
  const formRef = useRef<HTMLDivElement>(null);

  // Determine if custom option is selected
  const isCustomSelected = selectedValue === CUSTOM_OPTION_VALUE;

  // Build dropdown options: system templates, divider, custom templates, then "Custom task..."
  const dropdownOptions = useMemo(() => {
    const systemTemplates = templates
      .filter((t) => t.is_system)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ value: t.id, label: t.name }));

    const customTemplates = templates
      .filter((t) => !t.is_system)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ value: t.id, label: t.name }));

    const options: Array<{ value: string; label: string } | { type: 'divider' }> = [
      ...systemTemplates,
    ];

    // Add divider before custom templates if there are any
    if (customTemplates.length > 0) {
      options.push({ type: 'divider' as const });
      options.push(...customTemplates);
    }

    // Always add "Custom task..." option at the bottom
    options.push({ type: 'divider' as const });
    options.push({ value: CUSTOM_OPTION_VALUE, label: 'Custom task...' });

    return options;
  }, [templates]);

  // Determine if the Add button should be enabled
  const isAddButtonEnabled = useMemo(() => {
    if (!selectedValue) return false;
    if (isCustomSelected) return customTitle.trim().length > 0;
    return true;
  }, [selectedValue, isCustomSelected, customTitle]);

  // Handle form expansion toggle
  const handleExpand = useCallback(() => {
    setExpanded(true);
  }, []);

  // Handle form collapse (resets state)
  const handleCollapse = useCallback(() => {
    setExpanded(false);
    setSelectedValue(null);
    setCustomTitle('');
    setPriority('medium');
  }, []);

  // Handle dropdown selection
  const handleSelectChange = useCallback((value: string) => {
    setSelectedValue(value);
    // Clear custom title when switching away from custom option
    if (value !== CUSTOM_OPTION_VALUE) {
      setCustomTitle('');
    }
  }, []);

  // Handle task creation
  const handleSubmit = useCallback(async () => {
    if (!isAddButtonEnabled || creating) return;

    setCreating(true);

    try {
      // Build request payload based on selection
      const payload: {
        hive_id: string;
        template_id?: string;
        custom_title?: string;
        priority: 'low' | 'medium' | 'high' | 'urgent';
        template_name?: string;
      } = {
        hive_id: hiveId,
        priority: priority,
      };

      if (isCustomSelected) {
        payload.custom_title = customTitle.trim();
      } else if (selectedValue) {
        payload.template_id = selectedValue;
        // Find template name for offline display
        const template = templates.find(t => t.id === selectedValue);
        if (template) {
          payload.template_name = template.name;
        }
      }

      let newTaskId: string | undefined;

      if (isOffline && tenantId) {
        // Offline path - save to IndexedDB (Story 14.16)
        const offlineTask = await saveOfflineTask(hiveId, tenantId, {
          template_id: payload.template_id,
          template_name: payload.template_name,
          custom_title: payload.custom_title,
          priority: priority,
        });
        newTaskId = offlineTask.id;
        message.success('Task added (will sync)');
      } else {
        // Online path - POST to API
        const response = await apiClient.post<CreateTaskResponse>('/tasks', payload);
        newTaskId = response.data.data?.id;
        message.success('Task added');
      }

      handleCollapse();
      onTaskAdded(newTaskId);
    } catch (err) {
      // Error - keep form open for retry
      message.error('Failed to add task');
    } finally {
      setCreating(false);
    }
  }, [isAddButtonEnabled, creating, hiveId, isCustomSelected, customTitle, selectedValue, handleCollapse, onTaskAdded, isOffline, tenantId, templates, priority]);

  // Outside click and scroll detection
  useEffect(() => {
    if (!expanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Check if click is inside the form
      if (formRef.current && formRef.current.contains(target)) {
        return;
      }

      // Check if click is inside an Ant Design dropdown (rendered in portal)
      const isDropdown = (target as Element).closest?.('.ant-select-dropdown');
      if (isDropdown) {
        return;
      }

      handleCollapse();
    };

    // Track scroll position to detect significant scroll (AC8)
    let lastScrollY = window.scrollY;
    const SCROLL_THRESHOLD = 100; // pixels of scroll to trigger collapse

    const handleScroll = () => {
      const scrollDelta = Math.abs(window.scrollY - lastScrollY);
      if (scrollDelta > SCROLL_THRESHOLD) {
        handleCollapse();
      }
    };

    // Add listeners with a small delay to prevent immediate collapse from the click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, { passive: true });
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [expanded, handleCollapse]);

  // Common input styles per mockup
  const inputStyle: CSSProperties = {
    height: 56,
    borderRadius: 12,
    backgroundColor: '#fcfaf8',
    border: 'none',
    fontSize: 16,
    fontWeight: 500,
  };

  return (
    <div
      ref={formRef}
      data-testid="mobile-add-task-form"
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 16,
        boxShadow: '0 4px 20px -2px rgba(28, 19, 13, 0.08)',
        overflow: 'hidden',
        transition: 'all 300ms ease-out',
        border: expanded ? `1px dashed ${colors.brownBramble}` : '1px solid transparent',
        ...style,
      }}
    >
      {/* Expanded state - inline form per mockup */}
      {expanded && (
        <div
          data-testid="add-task-expanded"
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Header with title and close */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}>
            <h2 style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              color: colors.seaBuckthorn,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                add_circle
              </span>
              New Task
            </h2>
            <button
              type="button"
              onClick={handleCollapse}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: '#8c7e72',
              }}
              aria-label="Close form"
            >
              <CloseOutlined style={{ fontSize: 20 }} />
            </button>
          </div>

          {/* Task name input - shown when custom OR for all tasks */}
          <Input
            placeholder="Task Name (e.g. Inspect Frame 3)"
            value={isCustomSelected ? customTitle : ''}
            onChange={(e) => {
              if (isCustomSelected) {
                setCustomTitle(e.target.value);
              }
            }}
            disabled={creating || (!isCustomSelected && selectedValue !== null)}
            style={inputStyle}
            data-testid="task-name-input"
          />

          {/* Task type dropdown */}
          <Select
            placeholder="Select Task Type"
            value={selectedValue}
            onChange={handleSelectChange}
            style={{ width: '100%', height: 56 }}
            size="large"
            loading={templatesLoading}
            disabled={creating}
            data-testid="task-type-select"
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { minWidth: 200 } } }}
            suffixIcon={
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#8c7e72' }}>
                expand_more
              </span>
            }
            options={dropdownOptions.map((opt) => {
              if ('type' in opt && opt.type === 'divider') {
                return { type: 'divider' as const };
              }
              return opt;
            })}
          />

          {/* Priority level pills per mockup */}
          <div>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 700,
              color: '#8c7e72',
              marginBottom: 8,
              marginLeft: 4,
            }}>
              Priority level
            </label>
            <div style={{
              display: 'flex',
              backgroundColor: '#fcfaf8',
              borderRadius: 9999,
              padding: 6,
            }}>
              {PRIORITY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={opt.value}
                    checked={priority === opt.value}
                    onChange={() => setPriority(opt.value)}
                    style={{ display: 'none' }}
                  />
                  <span style={{
                    display: 'block',
                    padding: '10px 8px',
                    borderRadius: 9999,
                    fontSize: 14,
                    fontWeight: 700,
                    color: priority === opt.value ? colors.brownBramble : '#8c7e72',
                    backgroundColor: priority === opt.value ? colors.salomie : 'transparent',
                    boxShadow: priority === opt.value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.2s',
                  }}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Add Task button - primary golden with icon */}
          <Button
            type="primary"
            size="large"
            onClick={handleSubmit}
            disabled={!isAddButtonEnabled || creating}
            data-testid="add-task-button"
            style={{
              height: touchTargets.mobile,
              width: '100%',
              fontSize: 18,
              fontWeight: 700,
              borderRadius: 9999,
              boxShadow: '0 8px 20px -4px rgba(247, 164, 45, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 8,
            }}
          >
            {creating ? (
              <LoadingOutlined spin />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                add_task
              </span>
            )}
            {creating ? 'Adding...' : 'Add Task'}
          </Button>
        </div>
      )}

      {/* Collapsed state - replaced by the expanded form when active */}
      {!expanded && (
        <div
          onClick={handleExpand}
          role="button"
          tabIndex={0}
          aria-label="Add task"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleExpand();
            }
          }}
          data-testid="add-task-collapsed"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            height: touchTargets.mobile,
            cursor: 'pointer',
            padding: '0 16px',
            backgroundColor: colors.salomie,
            borderRadius: 16,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 20,
              color: colors.brownBramble,
            }}
          >
            add_circle
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: colors.brownBramble,
            }}
          >
            Add Task
          </span>
        </div>
      )}
    </div>
  );
}

export default MobileAddTaskForm;
