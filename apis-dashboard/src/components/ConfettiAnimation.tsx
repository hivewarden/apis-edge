/**
 * ConfettiAnimation Component
 *
 * Celebratory falling confetti/honey drop animation using CSS keyframes.
 * Used in FirstHarvestModal to create an emotional celebration moment.
 *
 * Part of Epic 9, Story 9.2: First Harvest Celebration
 */
import { useEffect, useState } from 'react';
import { colors } from '../theme/apisTheme';

interface ConfettiPiece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  rotation: number;
  shape: 'circle' | 'drop' | 'hexagon';
}

interface ConfettiAnimationProps {
  /** Number of confetti pieces to generate */
  pieceCount?: number;
  /** Duration of the animation in seconds */
  duration?: number;
  /** Whether the animation is active */
  active?: boolean;
}

// Honey-themed color palette for confetti
const confettiColors = [
  colors.seaBuckthorn, // Golden honey
  colors.salomie,      // Light honey
  colors.brownBramble, // Deep brown
  '#ffeaa7',           // Light yellow
  '#f39c12',           // Bright amber
];

/**
 * CSS keyframes ID for confetti animation (prevents duplicate injection)
 */
const CONFETTI_STYLE_ID = 'confetti-animation-keyframes';

/**
 * Injects CSS keyframes into the document head (safe alternative to dangerouslySetInnerHTML)
 */
function injectKeyframes(): void {
  // Check if already injected
  if (document.getElementById(CONFETTI_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = CONFETTI_STYLE_ID;
  style.textContent = `
@keyframes confetti-fall {
  0% {
    transform: translateY(-20px) rotate(0deg) scale(1);
    opacity: 1;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 0.8;
  }
  100% {
    transform: translateY(400px) rotate(720deg) scale(0.5);
    opacity: 0;
  }
}

@keyframes confetti-sway {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-15px);
  }
  75% {
    transform: translateX(15px);
  }
}
`;
  document.head.appendChild(style);
}

/**
 * Generates random confetti pieces with varied properties
 */
function generateConfettiPieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    duration: 2 + Math.random() * 1.5,
    size: 8 + Math.random() * 8,
    color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
    rotation: Math.random() * 360,
    shape: (['circle', 'drop', 'hexagon'] as const)[Math.floor(Math.random() * 3)],
  }));
}

/**
 * Get clip-path for different confetti shapes
 */
function getShapeStyle(shape: 'circle' | 'drop' | 'hexagon'): React.CSSProperties {
  switch (shape) {
    case 'drop':
      // Honey drop shape
      return {
        borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
      };
    case 'hexagon':
      // Honeycomb hexagon
      return {
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
      };
    case 'circle':
    default:
      return {
        borderRadius: '50%',
      };
  }
}

/**
 * ConfettiAnimation Component
 *
 * Creates a celebratory confetti effect with honey-themed colors and shapes.
 * Animation lasts for the specified duration then settles.
 *
 * @example
 * <ConfettiAnimation active={showCelebration} pieceCount={25} duration={3} />
 */
export function ConfettiAnimation({
  pieceCount = 25,
  duration = 3,
  active = true,
}: ConfettiAnimationProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [visible, setVisible] = useState(active);

  // Inject keyframes CSS on mount (safe alternative to dangerouslySetInnerHTML)
  useEffect(() => {
    injectKeyframes();
  }, []);

  useEffect(() => {
    if (active) {
      setPieces(generateConfettiPieces(pieceCount));
      setVisible(true);

      // Hide after animation completes
      const timer = setTimeout(() => {
        setVisible(false);
      }, (duration + 2) * 1000);

      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [active, pieceCount, duration]);

  if (!visible || pieces.length === 0) {
    return null;
  }

  return (
    <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 10,
        }}
        aria-hidden="true"
      >
        {pieces.map((piece) => (
          <div
            key={piece.id}
            style={{
              position: 'absolute',
              width: piece.size,
              height: piece.size * (piece.shape === 'drop' ? 1.3 : 1),
              backgroundColor: piece.color,
              left: `${piece.left}%`,
              top: -20,
              animation: `confetti-fall ${piece.duration}s ease-out ${piece.delay}s forwards`,
              transform: `rotate(${piece.rotation}deg)`,
              opacity: 0,
              boxShadow: `0 2px 4px rgba(0,0,0,0.1)`,
              ...getShapeStyle(piece.shape),
            }}
          />
        ))}
    </div>
  );
}

export default ConfettiAnimation;
