/**
 * SurvivalCelebration Component
 *
 * Celebratory card displayed when a beekeeper achieves 100% winter survival.
 * Creates an emotional, positive moment acknowledging their successful
 * winter preparation.
 *
 * Features:
 * - Large "100%" display with confetti animation
 * - Warm, congratulatory message
 * - Honey Beegood color palette
 *
 * Part of Epic 9, Story 9.5 (Overwintering Success Report) - AC#5
 */
import { Card, Typography } from 'antd';
import { TrophyOutlined } from '@ant-design/icons';
import { colors } from '../theme/apisTheme';
import { ConfettiAnimation } from './ConfettiAnimation';
import { ErrorBoundary } from './ErrorBoundary';
import { getSeasonLabel } from '../hooks/useOverwintering';

const { Title, Text, Paragraph } = Typography;

interface SurvivalCelebrationProps {
  /** Winter season year (e.g., 2025 for winter 2025-2026) */
  winterSeason: number;
  /** Number of hives that survived */
  survivedCount: number;
  /** Whether to show confetti animation */
  showConfetti?: boolean;
}

/**
 * SurvivalCelebration Component
 *
 * A warm, celebratory card that congratulates the beekeeper on achieving
 * 100% winter survival. This creates an emotional moment and validates
 * their hard work in preparing their hives for winter.
 *
 * @example
 * <SurvivalCelebration
 *   winterSeason={2025}
 *   survivedCount={5}
 *   showConfetti={true}
 * />
 */
export function SurvivalCelebration({
  winterSeason,
  survivedCount,
  showConfetti = true,
}: SurvivalCelebrationProps) {
  const seasonLabel = getSeasonLabel(winterSeason);

  return (
    <Card
      style={{
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${colors.salomie}40 0%, ${colors.coconutCream} 100%)`,
        border: `2px solid ${colors.seaBuckthorn}`,
        boxShadow: `0 8px 24px ${colors.seaBuckthorn}30`,
      }}
      styles={{
        body: {
          padding: '32px 24px',
          position: 'relative',
          minHeight: 280,
        },
      }}
    >
      {/* Confetti Animation - wrapped in error boundary for graceful degradation */}
      {showConfetti && (
        <ErrorBoundary fallback={null}>
          <ConfettiAnimation active={showConfetti} pieceCount={40} duration={4} />
        </ErrorBoundary>
      )}

      {/* Trophy Icon */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${colors.seaBuckthorn} 0%, ${colors.salomie} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          boxShadow: `0 8px 24px ${colors.seaBuckthorn}40`,
        }}
      >
        <TrophyOutlined style={{ fontSize: 40, color: 'white' }} />
      </div>

      {/* 100% Display */}
      <Title
        level={1}
        style={{
          fontSize: 64,
          fontWeight: 800,
          margin: 0,
          background: `linear-gradient(135deg, ${colors.seaBuckthorn} 0%, ${colors.brownBramble} 100%)`,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        100%
      </Title>

      {/* Survival Text */}
      <Text
        strong
        style={{
          fontSize: 20,
          display: 'block',
          color: colors.brownBramble,
          marginTop: 8,
        }}
      >
        Winter Survival!
      </Text>

      {/* Season Label */}
      <Text type="secondary" style={{ fontSize: 16, display: 'block', marginTop: 4 }}>
        {seasonLabel}
      </Text>

      {/* Congratulations Message */}
      <Paragraph
        style={{
          marginTop: 20,
          marginBottom: 0,
          fontSize: 16,
          color: colors.brownBramble,
        }}
      >
        All <strong>{survivedCount}</strong> hive{survivedCount !== 1 ? 's' : ''} made it through winter!
      </Paragraph>
      <Text
        style={{
          display: 'block',
          marginTop: 8,
          color: colors.seaBuckthorn,
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        Great winter preparation!
      </Text>
    </Card>
  );
}

export default SurvivalCelebration;
