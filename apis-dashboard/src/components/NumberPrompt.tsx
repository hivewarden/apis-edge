/**
 * NumberPrompt Component
 *
 * A mobile-optimized number input with increment/decrement buttons.
 * Uses large touch-friendly buttons (64px height) for field use.
 *
 * Part of Epic 14, Story 14.10: Mobile Task Completion Flow
 */
import { Button, Typography } from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { colors, touchTargets } from '../theme/apisTheme';

const { Text } = Typography;

export interface NumberPromptProps {
  /** Label text to display above the input */
  label: string;
  /** Current numeric value */
  value: number;
  /** Callback when value changes */
  onChange: (value: number) => void;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Whether this field is required */
  required?: boolean;
}

/**
 * Mobile-optimized number input with increment/decrement buttons.
 *
 * Features:
 * - 64px touch-friendly buttons per NFR-HT-04
 * - Large visible value display
 * - Disabled states at min/max boundaries
 * - Required indicator (asterisk)
 *
 * @example
 * <NumberPrompt
 *   label="Number of supers"
 *   value={superCount}
 *   onChange={setSuperCount}
 *   min={0}
 *   max={10}
 * />
 */
export function NumberPrompt({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  required = false,
}: NumberPromptProps) {
  const handleDecrement = () => {
    if (value > min) {
      onChange(value - 1);
    }
  };

  const handleIncrement = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  const isAtMin = value <= min;
  const isAtMax = value >= max;

  return (
    <div data-testid="number-prompt">
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

      {/* Input row: minus button - value - plus button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
        data-testid="number-controls"
      >
        {/* Minus button */}
        <Button
          type="default"
          icon={<MinusOutlined />}
          onClick={handleDecrement}
          disabled={isAtMin}
          style={{
            width: touchTargets.mobile,
            height: touchTargets.mobile,
            fontSize: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          data-testid="decrement-button"
          aria-label="Decrease"
        />

        {/* Value display */}
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 24,
            fontWeight: 600,
            color: colors.brownBramble,
            backgroundColor: colors.salomie,
            borderRadius: 8,
            padding: '12px 16px',
            minWidth: 80,
          }}
          data-testid="number-value"
          role="status"
          aria-live="polite"
        >
          {value}
        </div>

        {/* Plus button */}
        <Button
          type="default"
          icon={<PlusOutlined />}
          onClick={handleIncrement}
          disabled={isAtMax}
          style={{
            width: touchTargets.mobile,
            height: touchTargets.mobile,
            fontSize: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          data-testid="increment-button"
          aria-label="Increase"
        />
      </div>
    </div>
  );
}

export default NumberPrompt;
