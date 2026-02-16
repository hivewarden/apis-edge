/**
 * ColorSelectPrompt Component
 *
 * A mobile-optimized color selection prompt for queen marking colors.
 * Displays large touch-friendly buttons (64px height) for each color option.
 *
 * Part of Epic 14, Story 14.10: Mobile Task Completion Flow
 */
import { Typography } from 'antd';
import { colors, touchTargets } from '../theme/apisTheme';

const { Text } = Typography;

export interface ColorOption {
  value: string;
  label: string;
}

export interface ColorSelectPromptProps {
  /** Label text to display above the buttons */
  label: string;
  /** Available color options */
  options: ColorOption[];
  /** Currently selected value */
  value: string | undefined;
  /** Callback when a color is selected */
  onChange: (value: string) => void;
  /** Whether this field is required */
  required?: boolean;
}

/**
 * Queen marking color values mapped to display colors.
 * Standard international queen marking colors (5-year cycle).
 */
const QUEEN_MARKING_COLORS: Record<string, string> = {
  white: '#f5f5f5',
  yellow: '#fcd34d',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  unmarked: '#9ca3af',
};

/**
 * Get the background color for a color option.
 * Falls back to theme primary color if not a known color.
 */
const getColorBackground = (colorValue: string): string => {
  return QUEEN_MARKING_COLORS[colorValue.toLowerCase()] || colors.salomie;
};

/**
 * Get appropriate text color for a given background.
 * Uses dark text for light backgrounds, light text for dark backgrounds.
 */
const getTextColor = (colorValue: string): string => {
  const lightColors = ['white', 'yellow', 'unmarked'];
  return lightColors.includes(colorValue.toLowerCase())
    ? colors.brownBramble
    : '#ffffff';
};

/**
 * Mobile-optimized color selection prompt.
 *
 * Features:
 * - 64px touch-friendly buttons per NFR-HT-04
 * - Color-coded backgrounds for queen marking colors
 * - Selected state with primary border
 * - Required indicator (asterisk)
 *
 * @example
 * <ColorSelectPrompt
 *   label="Queen marking color"
 *   options={[
 *     { value: 'white', label: 'White' },
 *     { value: 'yellow', label: 'Yellow' },
 *   ]}
 *   value={selectedColor}
 *   onChange={setSelectedColor}
 *   required
 * />
 */
export function ColorSelectPrompt({
  label,
  options,
  value,
  onChange,
  required = false,
}: ColorSelectPromptProps) {
  return (
    <div data-testid="color-select-prompt">
      {/* Label with optional asterisk */}
      <Text
        strong
        style={{
          display: 'block',
          color: colors.brownBramble,
          fontSize: 14,
          marginBottom: 8,
        }}
      >
        {label}
        {required && (
          <span style={{ color: colors.error, marginLeft: 4 }}>*</span>
        )}
      </Text>

      {/* Color buttons grid - 2-3 columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
        }}
        data-testid="color-buttons-grid"
      >
        {options.map((option) => {
          const isSelected = value === option.value;
          const bgColor = getColorBackground(option.value);
          const textColor = getTextColor(option.value);

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              onFocus={(e) => {
                // Add focus-visible styling for keyboard navigation
                e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.seaBuckthorn}80`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
              style={{
                height: touchTargets.mobile,
                backgroundColor: bgColor,
                color: textColor,
                border: isSelected
                  ? `3px solid ${colors.seaBuckthorn}`
                  : `1px solid ${colors.border}`,
                borderRadius: 8,
                fontSize: 14,
                fontWeight: isSelected ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                outline: 'none',
              }}
              data-testid={`color-option-${option.value}`}
              aria-pressed={isSelected}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ColorSelectPrompt;
