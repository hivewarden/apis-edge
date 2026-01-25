/**
 * Voice Input TextArea Composite Component
 *
 * Combines a standard text area with voice input capability.
 * Provides an integrated experience for text entry via typing or speech.
 *
 * @module components/VoiceInputTextArea
 *
 * Part of Epic 7, Story 7.5: Voice Input for Notes
 */
import React, { useRef } from 'react';
import { Input, Space } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { VoiceInputButton } from './VoiceInputButton';

const { TextArea } = Input;

/**
 * Props for VoiceInputTextArea component
 */
export interface VoiceInputTextAreaProps {
  /** Current text value (controlled mode) */
  value?: string;
  /** Callback when text changes (controlled mode) */
  onChange?: (value: string) => void;
  /** Placeholder text for the textarea */
  placeholder?: string;
  /** Number of rows for the textarea */
  rows?: number;
  /** Maximum character length */
  maxLength?: number;
  /** Whether to show character count */
  showCount?: boolean;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** BCP 47 language code for speech recognition */
  language?: string;
  /** Placeholder text shown while listening */
  voicePlaceholder?: string;
}

/**
 * Voice Input TextArea
 *
 * A composite component that combines an Ant Design TextArea with
 * voice input buttons. Supports both typing and voice dictation.
 *
 * Features:
 * - Standard text area for keyboard input
 * - Voice input button that appends transcribed text
 * - Keyboard button to focus the text area
 * - Proper spacing when appending voice transcripts
 *
 * @example
 * ```tsx
 * const [notes, setNotes] = useState('');
 *
 * <VoiceInputTextArea
 *   value={notes}
 *   onChange={setNotes}
 *   placeholder="Enter your inspection notes..."
 *   rows={6}
 *   maxLength={2000}
 *   showCount
 * />
 * ```
 */
export function VoiceInputTextArea({
  value = '',
  onChange,
  placeholder = 'Enter your notes here...',
  rows = 6,
  maxLength = 2000,
  showCount = true,
  disabled = false,
  language,
  voicePlaceholder = 'Listening...',
}: VoiceInputTextAreaProps): React.ReactElement {
  const textAreaRef = useRef<TextAreaRef>(null);

  /**
   * Handle voice transcript by appending to existing text
   */
  const handleTranscript = (text: string) => {
    if (!text.trim()) return;

    // Append transcript to existing value with proper spacing
    let newValue: string;
    if (value) {
      // Add space if the current value doesn't end with whitespace
      const needsSpace = !value.endsWith(' ') && !value.endsWith('\n');
      newValue = value + (needsSpace ? ' ' : '') + text.trim();
    } else {
      newValue = text.trim();
    }

    // Respect maxLength if set
    if (maxLength && newValue.length > maxLength) {
      newValue = newValue.substring(0, maxLength);
    }

    onChange?.(newValue);
  };

  /**
   * Handle direct text input changes
   */
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e.target.value);
  };

  /**
   * Handle keyboard button click - focus the textarea
   */
  const handleKeyboardClick = () => {
    // Focus the textarea after a short delay to ensure it's visible
    setTimeout(() => {
      textAreaRef.current?.focus();
    }, 100);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <TextArea
        ref={textAreaRef}
        value={value}
        onChange={handleTextChange}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        showCount={showCount}
        disabled={disabled}
        style={{ fontSize: 16 }}
      />

      <VoiceInputButton
        onTranscript={handleTranscript}
        disabled={disabled}
        language={language}
        placeholder={voicePlaceholder}
        showKeyboardButton={true}
        onKeyboardClick={handleKeyboardClick}
      />
    </Space>
  );
}

export default VoiceInputTextArea;
