/**
 * OverwinteringPrompt Component
 *
 * Banner displayed on Dashboard in spring (March for Northern Hemisphere,
 * September for Southern) prompting the beekeeper to complete their
 * overwintering survey - documenting which hives survived winter.
 *
 * Includes:
 * - Dismissible banner with "Remind Me Later" and "Already Completed" options
 * - localStorage persistence for dismiss state (7-day reminder)
 * - Link to start the overwintering survey
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report) - AC#1, AC#8
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Space, Typography } from 'antd';
import { SunOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import { useSpringPrompt, getSeasonLabel } from '../hooks/useOverwintering';

const { Text } = Typography;

// LocalStorage key for dismiss state
const DISMISS_KEY = 'apis_overwintering_prompt_dismiss';

interface DismissState {
  winterSeason: number;
  dismissedAt: number;
  type: 'later' | 'completed';
}

interface OverwinteringPromptProps {
  /** Hemisphere for season detection - 'northern' or 'southern' */
  hemisphere?: 'northern' | 'southern';
}

/**
 * Check if the dismiss state is still valid (within 7 days for "later")
 */
function isDismissValid(state: DismissState | null, currentSeason: number): boolean {
  if (!state) return false;

  // Wrong season - show prompt
  if (state.winterSeason !== currentSeason) return false;

  // If completed, always hide
  if (state.type === 'completed') return true;

  // For "later", check if 7 days have passed
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return now - state.dismissedAt < sevenDaysMs;
}

/**
 * Get dismiss state from localStorage
 */
function getDismissState(): DismissState | null {
  try {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as DismissState;
  } catch {
    return null;
  }
}

/**
 * Save dismiss state to localStorage
 */
function saveDismissState(winterSeason: number, type: 'later' | 'completed'): void {
  const state: DismissState = {
    winterSeason,
    dismissedAt: Date.now(),
    type,
  };
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

/**
 * OverwinteringPrompt Component
 *
 * Displays a warm, inviting banner prompting the beekeeper to complete
 * their overwintering survey in spring. Handles dismiss states and
 * localStorage persistence.
 *
 * @example
 * <OverwinteringPrompt hemisphere="northern" />
 */
export function OverwinteringPrompt({ hemisphere = 'northern' }: OverwinteringPromptProps) {
  const { promptData, loading, error } = useSpringPrompt(hemisphere);
  const [dismissed, setDismissed] = useState(false);

  // Check localStorage dismiss state on mount
  useEffect(() => {
    if (promptData?.winter_season) {
      const dismissState = getDismissState();
      if (isDismissValid(dismissState, promptData.winter_season)) {
        setDismissed(true);
      }
    }
  }, [promptData?.winter_season]);

  // Don't show if loading, error, or shouldn't show
  if (loading || error || !promptData?.should_show || dismissed) {
    return null;
  }

  const seasonLabel = getSeasonLabel(promptData.winter_season);

  const handleRemindLater = () => {
    saveDismissState(promptData.winter_season, 'later');
    setDismissed(true);
  };

  const handleAlreadyCompleted = () => {
    saveDismissState(promptData.winter_season, 'completed');
    setDismissed(true);
  };

  return (
    <Alert
      type="warning"
      icon={<SunOutlined style={{ fontSize: 20 }} />}
      message={
        <span style={{ fontWeight: 600, color: colors.brownBramble }}>
          Time for Spring Inspection!
        </span>
      }
      description={
        <div>
          <Text style={{ display: 'block', marginBottom: 12 }}>
            Did all your hives survive the {seasonLabel} winter? Take a moment to document
            your overwintering results and track your success over time.
          </Text>
          <Space wrap>
            <Link to={`/overwintering/survey?season=${promptData.winter_season}`}>
              <Button
                type="primary"
                style={{
                  background: colors.seaBuckthorn,
                  borderColor: colors.seaBuckthorn,
                }}
              >
                Start Survey
              </Button>
            </Link>
            <Button
              icon={<ClockCircleOutlined />}
              onClick={handleRemindLater}
            >
              Remind Me Later
            </Button>
            <Button
              icon={<CheckCircleOutlined />}
              onClick={handleAlreadyCompleted}
              type="text"
            >
              Already Completed
            </Button>
          </Space>
        </div>
      }
      style={{
        marginBottom: 16,
        borderColor: colors.seaBuckthorn,
        backgroundColor: `${colors.salomie}40`,
      }}
      showIcon
    />
  );
}

export default OverwinteringPrompt;
