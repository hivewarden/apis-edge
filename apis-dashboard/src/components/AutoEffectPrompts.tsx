/**
 * AutoEffectPrompts Component
 *
 * Renders form inputs for auto-effect prompts based on their type.
 * Supports select, number, and text prompt types with mobile-optimized
 * touch targets (64px minimum).
 *
 * Part of Epic 14, Story 14.10: Mobile Task Completion Flow
 */
import { Space } from 'antd';
import { Prompt } from '../hooks/useTasks';
import { ColorSelectPrompt } from './ColorSelectPrompt';
import { NumberPrompt } from './NumberPrompt';
import { TextPrompt } from './TextPrompt';
import { SelectPrompt } from './SelectPrompt';

export interface AutoEffectPromptsProps {
  /** Array of prompts to render */
  prompts: Prompt[];
  /** Current values for each prompt (keyed by prompt.key) */
  values: Record<string, string | number | boolean>;
  /** Callback when a prompt value changes */
  onChange: (key: string, value: string | number | boolean) => void;
}

/**
 * Check if a prompt is for queen marking color.
 * Uses key pattern matching to detect color selection prompts.
 */
const isColorPrompt = (prompt: Prompt): boolean => {
  const colorKeywords = ['color', 'marking', 'queen_marking'];
  const keyLower = prompt.key.toLowerCase();
  return (
    prompt.type === 'select' &&
    colorKeywords.some((keyword) => keyLower.includes(keyword))
  );
};

/**
 * Renders form inputs for auto-effect prompts.
 *
 * Supported prompt types:
 * - **select**: Large touch-friendly buttons (ColorSelectPrompt for colors, SelectPrompt for generic)
 * - **number**: Increment/decrement buttons with value display (NumberPrompt)
 * - **text**: Large text input area (TextPrompt)
 *
 * All inputs follow the 64px minimum touch target requirement.
 *
 * @example
 * <AutoEffectPrompts
 *   prompts={task.auto_effects.prompts}
 *   values={completionData}
 *   onChange={(key, value) => setCompletionData(prev => ({ ...prev, [key]: value }))}
 * />
 */
export function AutoEffectPrompts({
  prompts,
  values,
  onChange,
}: AutoEffectPromptsProps) {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {prompts.map((prompt) => {
        const value = values[prompt.key];

        switch (prompt.type) {
          case 'select':
            // Use ColorSelectPrompt for color-related prompts
            if (isColorPrompt(prompt) && prompt.options) {
              return (
                <ColorSelectPrompt
                  key={prompt.key}
                  label={prompt.label}
                  options={prompt.options}
                  value={value as string | undefined}
                  onChange={(newValue) => onChange(prompt.key, newValue)}
                  required={prompt.required}
                />
              );
            }
            // Use generic SelectPrompt for other select types
            if (prompt.options) {
              return (
                <SelectPrompt
                  key={prompt.key}
                  label={prompt.label}
                  options={prompt.options}
                  value={value as string | undefined}
                  onChange={(newValue) => onChange(prompt.key, newValue)}
                  required={prompt.required}
                />
              );
            }
            return null;

          case 'number':
            return (
              <NumberPrompt
                key={prompt.key}
                label={prompt.label}
                value={(value as number) ?? 0}
                onChange={(newValue) => onChange(prompt.key, newValue)}
                required={prompt.required}
              />
            );

          case 'text':
            return (
              <TextPrompt
                key={prompt.key}
                label={prompt.label}
                value={(value as string) ?? ''}
                onChange={(newValue) => onChange(prompt.key, newValue)}
                placeholder={`Enter ${prompt.label.toLowerCase()}...`}
                required={prompt.required}
              />
            );

          default:
            return null;
        }
      })}
    </Space>
  );
}

export default AutoEffectPrompts;
