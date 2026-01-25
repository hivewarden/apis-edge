import { useState } from 'react';
import { Card, Typography, Image } from 'antd';
import { PlayCircleOutlined, ClockCircleOutlined, AlertOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { colors } from '../theme/apisTheme';

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
 *
 * Part of Epic 4, Story 4.2 (Clip Archive List View)
 */
export function ClipCard({ clip, onClick }: ClipCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const formattedDate = dayjs(clip.recorded_at).format('MMM D');
  const formattedTime = dayjs(clip.recorded_at).format('HH:mm');
  const duration = formatDuration(clip.duration_seconds);

  const ariaLabel = clip.unit_name
    ? `Detection clip from ${formattedDate}, ${clip.unit_name}, duration ${duration}`
    : `Detection clip from ${formattedDate}, duration ${duration}`;

  const isActive = isHovered || isFocused;

  return (
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={{
        borderRadius: 16,
        border: `2px solid ${isActive ? colors.seaBuckthorn : colors.salomie}`,
        overflow: 'hidden',
        background: `linear-gradient(145deg, ${colors.salomie} 0%, ${colors.coconutCream} 100%)`,
        boxShadow: isActive
          ? `0 8px 32px rgba(247, 164, 45, 0.35), 0 0 0 3px ${colors.seaBuckthorn}60`
          : `0 2px 8px rgba(102, 38, 4, 0.08)`,
        transform: isActive ? 'translateY(-4px) scale(1.02)' : 'none',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        outline: isFocused ? `3px solid ${colors.seaBuckthorn}` : 'none',
        outlineOffset: 2,
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
          src={clip.thumbnail_url}
          alt={`Detection clip from ${formattedDate}`}
          preview={false}
          style={{
            width: '100%',
            height: 140,
            objectFit: 'cover',
            filter: isHovered ? 'brightness(1.05)' : 'none',
            transition: 'filter 0.3s ease',
          }}
          fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='240' fill='%23fcd483'%3E%3Crect width='320' height='240'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23662604' font-family='system-ui' font-size='14'%3ENo thumbnail%3C/text%3E%3C/svg%3E"
        />

        {/* Play icon overlay with pulse effect */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) scale(${isHovered ? 1.15 : 1})`,
            color: 'white',
            fontSize: 44,
            opacity: isHovered ? 1 : 0.85,
            textShadow: `0 2px 12px rgba(0,0,0,0.5), 0 0 40px ${colors.seaBuckthorn}80`,
            transition: 'all 0.3s ease',
            filter: 'drop-shadow(0 0 8px rgba(247, 164, 45, 0.6))',
          }}
        >
          <PlayCircleOutlined />
        </div>

        {/* Duration badge - amber glass effect */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            background: `linear-gradient(135deg, ${colors.brownBramble}e6 0%, ${colors.brownBramble}cc 100%)`,
            backdropFilter: 'blur(4px)',
            color: colors.salomie,
            padding: '3px 10px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <ClockCircleOutlined style={{ fontSize: 10 }} />
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
          background: `linear-gradient(180deg, ${colors.coconutCream} 0%, ${colors.salomie}40 100%)`,
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
  );
}

export default ClipCard;
