/**
 * SelectPrompt Component
 *
 * A mobile-optimized generic selection prompt with large touch-friendly buttons.
 * Used for non-color select prompts in auto-effects.
 *
 * Part of Epic 14, Story 14.10: Mobile Task Completion Flow
 */
import { Typography } from 'antd';
import { colors, touchTargets } from '../theme/apisTheme';

const { Text } = Typography;

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectPromptProps {
  /** Label text to display above the buttons */
  label: string;
  /** Available options */
  options: SelectOption[];
  /** Currently selected value */
  value: string | undefined;
  /** Callback when an option is selected */
  onChange: (value: string) => void;
  /** Whether this field is required */
  required?: boolean;
}

/**
 * Mobile-optimized generic selection prompt.
 *
 * Features:
 * - 64px touch-friendly buttons per NFR-HT-04
 * - Selected state with primary styling
 * - Vertical stacking for readability
 * - Required indicator (asterisk)
 *
 * @example
 * <SelectPrompt
 *   label="Treatment type"
 *   options={[
 *     { value: 'oxalic', label: 'Oxalic Acid' },
 *     { value: 'formic', label: 'Formic Acid' },
 *   ]}
 *   value={selectedType}
 *   onChange={setSelectedType}
 *   required
 * />
 */
export function SelectPrompt({
  label,
  options,
  value,
  onChange,
  required = false,
}: SelectPromptProps) {
  return (
    <div data-testid="select-prompt">
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

      {/* Option buttons - vertical stack */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
        data-testid="select-buttons"
      >
        {options.map((option) => {
          const isSelected = value === option.value;

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
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = `${colors.seaBuckthorn}30`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = colors.salomie;
                }
              }}
              style={{
                height: touchTargets.mobile,
                backgroundColor: isSelected ? colors.seaBuckthorn : colors.salomie,
                color: isSelected ? '#ffffff' : colors.brownBramble,
                border: isSelected
                  ? `2px solid ${colors.seaBuckthorn}`
                  : `1px solid ${colors.border}`,
                borderRadius: 8,
                fontSize: 14,
                fontWeight: isSelected ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                outline: 'none',
                width: '100%',
                textAlign: 'center',
              }}
              data-testid={`select-option-${option.value}`}
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

export default SelectPrompt;
