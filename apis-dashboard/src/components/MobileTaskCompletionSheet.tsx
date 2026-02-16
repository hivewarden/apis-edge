/**
 * MobileTaskCompletionSheet Component
 *
 * A bottom sheet modal for completing tasks with auto-effects prompts.
 * Slides up from the bottom of the screen, displays prompts for user input,
 * shows a preview of changes, and handles task completion.
 *
 * Design reference: /docs/hardware/stitch_apis_v2/apis_mobile_completion_sheet/
 *
 * Part of Epic 14, Story 14.10: Mobile Task Completion Flow
 */
import { useState, useCallback, useMemo, useEffect, CSSProperties } from 'react';
import { Drawer, Button } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { colors, touchTargets } from '../theme/apisTheme';
import { Task, TaskCompletionData } from '../hooks/useTasks';
import { AutoEffectPrompts } from './AutoEffectPrompts';

export interface MobileTaskCompletionSheetProps {
  /** The task being completed (null to hide the sheet) */
  task: Task | null;
  /** Whether the sheet is visible */
  visible: boolean;
  /** Callback when the sheet is closed */
  onClose: () => void;
  /** Callback when task completion is submitted */
  onComplete: (completionData: TaskCompletionData) => Promise<void>;
  /** Whether completion is in progress */
  completing: boolean;
}


/**
 * Bottom sheet modal for completing tasks with auto-effects prompts.
 *
 * Features:
 * - Slides up from the bottom of the screen
 * - Displays prompts from task's auto_effects
 * - Shows preview of changes that will be made
 * - Validates required prompts before submission
 * - Handles loading and disabled states
 *
 * @example
 * <MobileTaskCompletionSheet
 *   task={completingTask}
 *   visible={showCompletionSheet}
 *   onClose={() => setShowCompletionSheet(false)}
 *   onComplete={handleCompleteWithData}
 *   completing={isCompleting}
 * />
 */
export function MobileTaskCompletionSheet({
  task,
  visible,
  onClose,
  onComplete,
  completing,
}: MobileTaskCompletionSheetProps) {
  // Track completion data for filled prompts
  const [completionData, setCompletionData] = useState<Record<string, string | number | boolean>>(
    {}
  );

  // Reset completion data when task changes
  useEffect(() => {
    if (task) {
      setCompletionData({});
    }
  }, [task?.id]);

  // Handle prompt value changes
  const handlePromptChange = useCallback((key: string, value: string | number | boolean) => {
    setCompletionData((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  // Get prompts from task's auto_effects
  const prompts = task?.auto_effects?.prompts || [];
  const updates = task?.auto_effects?.updates || [];

  // Validate that all required prompts are filled
  const isValid = useMemo(() => {
    return prompts.every((prompt) => {
      if (!prompt.required) return true;
      const value = completionData[prompt.key];
      return value !== undefined && value !== '' && value !== null;
    });
  }, [prompts, completionData]);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!isValid || !task) return;
    await onComplete(completionData);
  }, [isValid, task, completionData, onComplete]);

  // Display name for the task
  const displayName = task?.custom_title || task?.title || '';

  // Hive info from task (if available)
  const hiveInfo = task?.hive_name || `Hive #${task?.hive_id?.slice(-4) || ''}`;
  // Site name may not exist on all task types, so cast safely
  const siteInfo = (task as { site_name?: string })?.site_name || '';

  // Container styles per mockup
  const containerStyle: CSSProperties = {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: '0 -10px 40px -10px rgba(102, 38, 4, 0.1)',
  };

  return (
    <Drawer
      placement="bottom"
      open={visible}
      onClose={onClose}
      height="auto"
      closable={false}
      title={null}
      styles={{
        content: containerStyle,
        body: {
          padding: 0,
          maxHeight: '75vh',
          overflowY: 'auto',
        },
        wrapper: {
          maxHeight: '80vh',
        },
      }}
      data-testid="mobile-task-completion-sheet"
    >
      {task && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Drag handle indicator */}
          <div style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 16,
            paddingBottom: 8,
          }}>
            <div style={{
              width: 48,
              height: 4,
              backgroundColor: '#e0e0e0',
              borderRadius: 2,
            }} />
          </div>

          {/* Header with title and close */}
          <div style={{
            padding: '8px 24px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}>
            <div style={{ flex: 1, paddingRight: 16 }}>
              <h2 style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 600,
                color: colors.brownBramble,
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
              }}>
                {displayName}
              </h2>
              <p style={{
                margin: '4px 0 0',
                fontSize: 14,
                fontWeight: 500,
                color: 'rgba(102, 38, 4, 0.7)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  hive
                </span>
                {hiveInfo}{siteInfo && ` • ${siteInfo}`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#b0b0b0',
                marginRight: -8,
              }}
              aria-label="Close"
            >
              <CloseOutlined style={{ fontSize: 24 }} />
            </button>
          </div>

          {/* Content area with scroll */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 32,
            paddingBottom: 16,
          }}>
            {/* Prompts section */}
            {prompts.length > 0 && (
              <div data-testid="prompts-section">
                <AutoEffectPrompts
                  prompts={prompts}
                  values={completionData}
                  onChange={handlePromptChange}
                />
              </div>
            )}

            {/* Quantity stepper example - for tasks that need it (mockup shows this) */}
            {/* This could be rendered by AutoEffectPrompts for number types */}

            {/* Preview section per mockup design */}
            {updates.length > 0 && (
              <div
                data-testid="preview-section"
                style={{
                  backgroundColor: 'rgba(247, 164, 45, 0.1)',
                  borderRadius: 16,
                  border: '1px solid rgba(247, 164, 45, 0.2)',
                  padding: 16,
                  display: 'flex',
                  gap: 16,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                }}>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 20, color: colors.seaBuckthorn }}
                  >
                    info
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{
                    margin: 0,
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: colors.seaBuckthorn,
                    marginBottom: 2,
                  }}>
                    System Update
                  </p>
                  <p style={{
                    margin: 0,
                    fontSize: 14,
                    color: colors.brownBramble,
                    fontWeight: 500,
                    lineHeight: 1.5,
                  }}>
                    This will update: <strong>Hive Configuration</strong>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer with Complete button - gradient fade per mockup */}
          <div style={{
            padding: '16px 24px 32px',
            background: 'linear-gradient(to top, #ffffff, #ffffff 80%, transparent)',
          }}>
            <Button
              type="primary"
              size="large"
              block
              onClick={handleSubmit}
              disabled={!isValid || completing}
              loading={completing}
              icon={!completing && <CheckOutlined style={{ fontSize: 18 }} />}
              style={{
                height: touchTargets.mobile,
                fontSize: 18,
                fontWeight: 700,
                borderRadius: 9999,
                boxShadow: '0 8px 20px -4px rgba(247, 164, 45, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
              }}
              data-testid="complete-task-button"
            >
              Complete Task
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export default MobileTaskCompletionSheet;
