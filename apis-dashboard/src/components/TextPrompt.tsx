/**
 * TextPrompt Component
 *
 * A mobile-optimized text input area with large touch targets.
 * Uses 64px minimum height for easy field use.
 *
 * Part of Epic 14, Story 14.10: Mobile Task Completion Flow
 */
import { Input, Typography } from 'antd';
import { colors, touchTargets } from '../theme/apisTheme';

const { Text } = Typography;
const { TextArea } = Input;

export interface TextPromptProps {
  /** Label text to display above the input */
  label: string;
  /** Current text value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether this field is required */
  required?: boolean;
}

/**
 * Mobile-optimized text input area.
 *
 * Features:
 * - 64px minimum height per NFR-HT-04
 * - Auto-resize for longer content
 * - Theme-consistent styling
 * - Required indicator (asterisk)
 *
 * @example
 * <TextPrompt
 *   label="Notes"
 *   value={notes}
 *   onChange={setNotes}
 *   placeholder="Add any notes..."
 * />
 */
export function TextPrompt({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: TextPromptProps) {
  return (
    <div data-testid="text-prompt">
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

      {/* Text area input */}
      <TextArea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoSize={{ minRows: 2, maxRows: 6 }}
        style={{
          minHeight: touchTargets.mobile,
          fontSize: 14,
          borderRadius: 8,
        }}
        data-testid="text-input"
      />
    </div>
  );
}

export default TextPrompt;
