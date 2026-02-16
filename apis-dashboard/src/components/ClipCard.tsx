import { Card, Typography, Image } from 'antd';
import { AlertOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';
import { getSafeImageUrl } from '../utils';

// CSS for hover/focus states - avoids re-renders on hover
const clipCardStyles = `
.clip-card:hover,
.clip-card:focus-visible {
  border-color: ${colors.seaBuckthorn} !important;
  box-shadow: 0 8px 32px rgba(247, 164, 45, 0.35), 0 0 0 3px ${colors.seaBuckthorn}60 !important;
  transform: translateY(-4px) scale(1.02);
}
.clip-card:focus-visible {
  outline: 3px solid ${colors.seaBuckthorn};
  outline-offset: 2px;
}
.clip-card:hover .clip-card-thumbnail,
.clip-card:focus-visible .clip-card-thumbnail {
  filter: brightness(1.05);
}
.clip-card:hover .clip-card-play-icon,
.clip-card:focus-visible .clip-card-play-icon {
  transform: translate(-50%, -50%) scale(1.15);
  opacity: 1;
}
`;

const { Text } = Typography;

export interface ClipCardProps {
  clip: {
    id: string;
    unit_name?: string;
    duration_seconds?: number;
    recorded_at: string;
    thumbnail_url: string;
  };
  onClick: () => void;
}

/**
 * Format duration as mm:ss
 */
function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * ClipCard Component
 *
 * Displays a single clip thumbnail with metadata in a honey-themed card.
 * Features honeycomb-inspired design with warm amber glow effects.
 * Uses CSS-only hover/focus states for better performance with large clip lists.
 *
 * Part of Epic 4, Story 4.2 (Clip Archive List View)
 */
export function ClipCard({ clip, onClick }: ClipCardProps) {
  const formattedDate = dayjs(clip.recorded_at).format('MMM D');
  const formattedTime = dayjs(clip.recorded_at).format('HH:mm');
  const duration = formatDuration(clip.duration_seconds);

  const ariaLabel = clip.unit_name
    ? `Detection clip from ${formattedDate}, ${clip.unit_name}, duration ${duration}`
    : `Detection clip from ${formattedDate}, duration ${duration}`;

  return (
    <>
      <style>{clipCardStyles}</style>
      <Card
        hoverable
        onClick={onClick}
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className="clip-card"
        style={{
          borderRadius: 16,
          border: '1px solid rgba(102, 38, 4, 0.05)',
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 4px 20px rgba(102, 38, 4, 0.05)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        styles={{
          body: { padding: 0 },
        }}
      >
      {/* Thumbnail Container */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Honeycomb pattern overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.03,
            pointerEvents: 'none',
            zIndex: 1,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='56' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100' fill='none' stroke='%23662604' stroke-width='1'/%3E%3Cpath d='M28 0L28 34L0 50L0 84L28 100L56 84L56 50L28 34' fill='none' stroke='%23662604' stroke-width='1'/%3E%3C/svg%3E")`,
            backgroundSize: '28px 50px',
          }}
        />

        <Image
          src={getSafeImageUrl(clip.thumbnail_url)}
          alt={`Detection clip from ${formattedDate}`}
          preview={false}
          className="clip-card-thumbnail"
          style={{
            width: '100%',
            aspectRatio: '16/9',
            objectFit: 'cover',
            transition: 'filter 0.3s ease',
          }}
          fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='240' fill='%23fcd483'%3E%3Crect width='320' height='240'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23662604' font-family='system-ui' font-size='14'%3ENo thumbnail%3C/text%3E%3C/svg%3E"
        />

        {/* Play button overlay - solid amber circle */}
        <div
          className="clip-card-play-icon"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 48,
            height: 48,
            borderRadius: '50%',
            backgroundColor: '#f7a42d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(247, 164, 45, 0.4)',
            opacity: 0.9,
            transition: 'all 0.3s ease',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ color: 'white', fontSize: 24 }}
          >
            play_arrow
          </span>
        </div>

        {/* Duration badge - simple rounded-md background */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            background: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            padding: '3px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.5px',
          }}
        >
          {duration}
        </div>

        {/* Detection indicator - top left */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: `${colors.seaBuckthorn}e6`,
            color: 'white',
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            boxShadow: '0 2px 8px rgba(247, 164, 45, 0.4)',
          }}
        >
          <AlertOutlined style={{ fontSize: 10 }} />
          Detection
        </div>

        {/* Gradient overlay at bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 40,
            background: `linear-gradient(to top, ${colors.brownBramble}40 0%, transparent 100%)`,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Card body */}
      <div
        style={{
          padding: '12px 14px',
          background: '#ffffff',
        }}
      >
        {/* Date and time row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text
            strong
            style={{
              color: colors.brownBramble,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {formattedDate}
          </Text>
          <Text
            style={{
              color: colors.brownBramble,
              opacity: 0.7,
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            }}
          >
            {formattedTime}
          </Text>
        </div>

        {/* Unit name */}
        {clip.unit_name && (
          <div
            style={{
              marginTop: 4,
              paddingTop: 6,
              borderTop: `1px solid ${colors.seaBuckthorn}20`,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: colors.brownBramble,
                opacity: 0.6,
              }}
            >
              {clip.unit_name}
            </Text>
          </div>
        )}
      </div>
    </Card>
    </>
  );
}

export default ClipCard;
