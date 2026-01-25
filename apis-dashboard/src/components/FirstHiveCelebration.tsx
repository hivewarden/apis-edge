/**
 * FirstHiveCelebration Component
 *
 * Small celebratory toast notification shown when a specific hive
 * gets its first harvest. More subtle than the account-wide first
 * harvest celebration modal.
 *
 * Part of Epic 9, Story 9.2: First Harvest Celebration - AC#4
 */
import { notification } from 'antd';
import { colors } from '../theme/apisTheme';

/**
 * Shows a celebratory toast notification for a hive's first harvest.
 *
 * This is a smaller celebration compared to the account-wide first harvest modal.
 * It auto-dismisses after 5 seconds and uses honey-themed styling.
 *
 * @param hiveName - The name of the hive that just had its first harvest
 *
 * @example
 * // When a harvest is created and the API returns first_hive_ids
 * result.first_hive_ids?.forEach(hiveId => {
 *   const hive = hives.find(h => h.id === hiveId);
 *   if (hive) {
 *     showFirstHiveCelebration(hive.name);
 *   }
 * });
 */
export function showFirstHiveCelebration(hiveName: string): void {
  notification.success({
    message: `First harvest from ${hiveName}!`,
    description: 'Another milestone for your apiary. Keep up the great work!',
    placement: 'topRight',
    duration: 5,
    style: {
      background: `linear-gradient(135deg, ${colors.salomie} 0%, ${colors.coconutCream} 100%)`,
      border: `1px solid ${colors.seaBuckthorn}`,
      borderRadius: 8,
    },
    icon: (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: colors.seaBuckthorn,
          color: 'white',
          fontSize: 16,
        }}
      >
        {/* Honey drop emoji */}
        <span role="img" aria-label="honey">{'🍯'}</span>
      </span>
    ),
  });
}

/**
 * FirstHiveCelebration React component for displaying inline celebration.
 * Use showFirstHiveCelebration function for toast notifications instead.
 *
 * This component is primarily exported for testing purposes.
 */
interface FirstHiveCelebrationProps {
  hiveName: string;
  visible: boolean;
}

export function FirstHiveCelebration({ hiveName, visible }: FirstHiveCelebrationProps) {
  if (!visible) return null;

  return (
    <div
      style={{
        padding: '12px 16px',
        background: `linear-gradient(135deg, ${colors.salomie} 0%, ${colors.coconutCream} 100%)`,
        border: `1px solid ${colors.seaBuckthorn}`,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: colors.seaBuckthorn,
          color: 'white',
          fontSize: 16,
        }}
      >
        <span role="img" aria-label="honey">{'🍯'}</span>
      </span>
      <div>
        <div style={{ fontWeight: 600, color: colors.brownBramble }}>
          First harvest from {hiveName}!
        </div>
        <div style={{ fontSize: 12, color: colors.textMuted }}>
          Another milestone for your apiary.
        </div>
      </div>
    </div>
  );
}

export default showFirstHiveCelebration;
