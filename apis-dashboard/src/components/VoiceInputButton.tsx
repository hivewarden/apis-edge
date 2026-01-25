/**
 * Voice Input Button Component
 *
 * A mobile-first, glove-friendly voice input button for speech-to-text transcription.
 * Features 64px minimum touch targets and visual feedback during recording.
 *
 * @module components/VoiceInputButton
 *
 * Part of Epic 7, Story 7.5: Voice Input for Notes
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, Typography, Tooltip, Spin } from 'antd';
import {
  AudioOutlined,
  AudioMutedOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { colors, touchTargets } from '../theme/apisTheme';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSettings } from '../context/SettingsContext';
import * as whisperService from '../services/whisperTranscription';

const { Text } = Typography;

/**
 * Props for VoiceInputButton component
 */
export interface VoiceInputButtonProps {
  /** Callback when transcription is complete */
  onTranscript: (text: string) => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Placeholder text shown while listening */
  placeholder?: string;
  /** BCP 47 language code for speech recognition */
  language?: string;
  /** Whether to show the keyboard fallback button */
  showKeyboardButton?: boolean;
  /** Callback when keyboard button is clicked */
  onKeyboardClick?: () => void;
}

/**
 * Voice Input Button
 *
 * A large, touch-friendly button for voice dictation. Supports both
 * browser-native speech recognition and server-side Whisper transcription.
 *
 * Features:
 * - 64px minimum touch target for glove-friendly use
 * - Pulsing animation while listening
 * - Interim transcript preview
 * - Fallback messages for unsupported browsers or offline mode
 *
 * @example
 * ```tsx
 * <VoiceInputButton
 *   onTranscript={(text) => setNotes(notes + ' ' + text)}
 *   placeholder="Speak your observations..."
 *   showKeyboardButton
 *   onKeyboardClick={() => inputRef.current?.focus()}
 * />
 * ```
 */
export function VoiceInputButton({
  onTranscript,
  disabled = false,
  placeholder = 'Listening...',
  language,
  showKeyboardButton = true,
  onKeyboardClick,
}: VoiceInputButtonProps): React.ReactElement {
  const isOnline = useOnlineStatus();
  const { voiceInputMethod, voiceLanguage } = useSettings();
  const [isRecordingWhisper, setIsRecordingWhisper] = useState(false);
  const [whisperError, setWhisperError] = useState<string | null>(null);
  const [isProcessingWhisper, setIsProcessingWhisper] = useState(false);

  // Use prop language if provided, otherwise fall back to voiceLanguage from settings
  const effectiveLanguage = language ?? voiceLanguage;

  const {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error: speechError,
    start,
    stop,
    reset,
  } = useSpeechRecognition({ language: effectiveLanguage });

  // Determine which mode to use
  const useWhisperMode = voiceInputMethod === 'whisper';
  const useNativeMode = voiceInputMethod === 'native' || (voiceInputMethod === 'auto' && isSupported);

  // Inject pulsing animation CSS once on mount
  useEffect(() => {
    const styleId = 'voice-button-pulse-style';
    if (document.getElementById(styleId)) {
      return; // Already injected
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes voicePulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 0 0 0 rgba(247, 164, 45, 0.4);
        }
        50% {
          transform: scale(1.02);
          box-shadow: 0 0 0 8px rgba(247, 164, 45, 0);
        }
      }
      .voice-button-pulse {
        animation: voicePulse 1.5s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
    // Note: We don't remove the style on unmount since other instances may use it
  }, []);

  // When native transcript is complete, emit it
  useEffect(() => {
    if (transcript && !isListening && useNativeMode) {
      onTranscript(transcript);
      reset();
    }
  }, [transcript, isListening, onTranscript, reset, useNativeMode]);

  /**
   * Handle voice button click for native mode
   */
  const handleNativeVoiceClick = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  /**
   * Handle voice button click for Whisper mode
   */
  const handleWhisperVoiceClick = useCallback(async () => {
    setWhisperError(null);

    if (isRecordingWhisper) {
      // Stop recording and transcribe
      setIsRecordingWhisper(false);
      setIsProcessingWhisper(true);

      try {
        const audioBlob = await whisperService.stopRecording();
        const result = await whisperService.transcribeAudio(audioBlob, effectiveLanguage);
        onTranscript(result.text);
      } catch (err) {
        setWhisperError(err instanceof Error ? err.message : 'Transcription failed');
      } finally {
        setIsProcessingWhisper(false);
      }
    } else {
      // Start recording
      try {
        await whisperService.startRecording();
        setIsRecordingWhisper(true);
      } catch (err) {
        setWhisperError(err instanceof Error ? err.message : 'Failed to start recording');
      }
    }
  }, [isRecordingWhisper, onTranscript]);

  /**
   * Main click handler that routes to the appropriate voice input mode.
   *
   * Routes to either native browser speech recognition or Whisper server
   * transcription based on user settings. Handles offline state by showing
   * an error when Whisper mode requires internet but none is available.
   */
  const handleVoiceClick = useCallback(() => {
    if (disabled) return;

    if (useWhisperMode) {
      if (!isOnline) {
        setWhisperError('Voice input requires internet connection');
        return;
      }
      handleWhisperVoiceClick();
    } else if (useNativeMode) {
      handleNativeVoiceClick();
    }
  }, [disabled, useWhisperMode, useNativeMode, isOnline, handleWhisperVoiceClick, handleNativeVoiceClick]);

  // Combined state
  const isActive = isListening || isRecordingWhisper || isProcessingWhisper;
  const canUseVoice = isSupported || (useWhisperMode && isOnline);
  const error = speechError || whisperError;
  const showUnavailableMessage = !canUseVoice;

  // Current preview text
  const previewText = isProcessingWhisper
    ? 'Processing...'
    : interimTranscript || (isActive ? placeholder : '');

  // Button styling based on state
  const buttonStyle: React.CSSProperties = {
    minHeight: touchTargets.mobile, // 64px
    minWidth: 120,
    fontSize: 18,
    fontWeight: 600,
    borderRadius: 12,
    backgroundColor: isActive ? colors.seaBuckthorn : undefined,
    borderColor: isActive ? colors.seaBuckthorn : undefined,
    color: isActive ? '#fff' : undefined,
    transition: 'all 0.3s ease',
  };

  // Pulsing animation style for listening state
  const pulsingClass = isActive && !isProcessingWhisper ? 'voice-button-pulse' : '';

  return (
    <div>
      {/* Interim transcript preview */}
      {(previewText || isActive) && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            borderRadius: 8,
            backgroundColor: 'rgba(247, 164, 45, 0.1)',
            border: `1px solid ${colors.seaBuckthorn}`,
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: colors.brownBramble, flex: 1 }}>
            {previewText}
          </Text>
          {isActive && <Spin size="small" style={{ marginLeft: 8 }} />}
        </div>
      )}

      {/* Error message */}
      {error && (
        <Text type="danger" style={{ display: 'block', marginBottom: 12 }}>
          {error}
        </Text>
      )}

      {/* Voice unavailable message */}
      {showUnavailableMessage && !error && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {!isOnline
            ? 'Voice input requires internet connection'
            : 'Voice input not supported in this browser'}
        </Text>
      )}

      {/* Buttons */}
      <Space style={{ width: '100%' }} size={12}>
        <Tooltip title={!canUseVoice ? 'Voice input unavailable' : ''}>
          <Button
            className={pulsingClass}
            style={{ ...buttonStyle, flex: 1 }}
            icon={isActive ? <AudioMutedOutlined /> : <AudioOutlined />}
            onClick={handleVoiceClick}
            disabled={disabled || !canUseVoice}
            loading={isProcessingWhisper}
            size="large"
          >
            {isProcessingWhisper ? 'Processing' : isActive ? 'Done' : 'SPEAK'}
          </Button>
        </Tooltip>

        {showKeyboardButton && (
          <Button
            style={{
              ...buttonStyle,
              flex: 1,
              backgroundColor: undefined,
              borderColor: undefined,
              color: undefined,
            }}
            icon={<EditOutlined />}
            onClick={onKeyboardClick}
            disabled={disabled}
            size="large"
          >
            Keyboard
          </Button>
        )}
      </Space>
    </div>
  );
}

export default VoiceInputButton;
