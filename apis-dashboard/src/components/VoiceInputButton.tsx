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
import { Button, Typography, Tooltip } from 'antd';
import {
  AudioOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { colors, touchTargets } from '../theme/apisTheme';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSettings } from '../context/SettingsContext';
import * as whisperService from '../services/whisperTranscription';
// Import CSS animations (moved from inline JS for security)
import '../styles/voice-input.css';

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

  // Note: CSS animations are now loaded via '../styles/voice-input.css' import
  // This avoids dynamic style injection which could be an XSS vector

  // When native transcript is complete, emit it (only if non-empty after trim)
  useEffect(() => {
    if (transcript && transcript.trim() && !isListening && useNativeMode) {
      onTranscript(transcript.trim());
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
   *
   * Note: The effectiveLanguage is captured at recording start time. If the user
   * changes language settings mid-recording, the transcription request will use
   * the language from when recording started. This is intentional behavior to
   * maintain consistency during a recording session.
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

  // Primary speak button styling per mockup - rounded-full, shadow-glow
  const speakButtonStyle: React.CSSProperties = {
    height: touchTargets.mobile, // 64px
    minWidth: 200,
    fontSize: 18,
    fontWeight: 700,
    borderRadius: 9999, // rounded-full
    backgroundColor: colors.seaBuckthorn,
    borderColor: colors.seaBuckthorn,
    color: '#fff',
    boxShadow: isActive ? '0 0 25px rgba(247, 164, 45, 0.4)' : undefined, // shadow-glow
    transition: 'all 0.3s ease',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
  };

  // Secondary keyboard button styling
  const keyboardButtonStyle: React.CSSProperties = {
    height: touchTargets.mobile, // 64px
    minWidth: 120,
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 12,
    transition: 'all 0.3s ease',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Error message */}
      {error && (
        <Text type="danger" style={{ display: 'block', marginBottom: 16, textAlign: 'center' }}>
          {error}
        </Text>
      )}

      {/* Voice unavailable message */}
      {showUnavailableMessage && !error && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 16, textAlign: 'center' }}>
          {!isOnline
            ? 'Voice input requires internet connection'
            : 'Voice input not supported in this browser'}
        </Text>
      )}

      {/* Voice button with pulsing rings - per mockup */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 160,
          width: '100%',
          marginBottom: 8,
        }}
      >
        {/* Pulsing background rings - only visible when active */}
        {isActive && !isProcessingWhisper && (
          <>
            <div
              className="voice-pulse-ring"
              style={{
                position: 'absolute',
                width: 260,
                height: 110,
                borderRadius: 9999,
                backgroundColor: 'rgba(247, 164, 45, 0.05)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                width: 220,
                height: 90,
                borderRadius: 9999,
                backgroundColor: 'rgba(247, 164, 45, 0.1)',
                transition: 'all 1s ease',
              }}
            />
            <div
              style={{
                position: 'absolute',
                width: 190,
                height: 75,
                borderRadius: 9999,
                backgroundColor: 'rgba(247, 164, 45, 0.2)',
              }}
            />
          </>
        )}

        {/* Main speak button */}
        <Tooltip title={!canUseVoice ? 'Voice input unavailable' : ''}>
          <Button
            style={speakButtonStyle}
            icon={<AudioOutlined style={{ fontSize: 28 }} />}
            onClick={handleVoiceClick}
            disabled={disabled || !canUseVoice}
            loading={isProcessingWhisper}
            size="large"
          >
            {isProcessingWhisper ? 'Processing' : isActive ? 'Stop' : 'Speak'}
          </Button>
        </Tooltip>
      </div>

      {/* Listening indicator and interim transcript - per mockup */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        {isActive && !isProcessingWhisper && (
          <p
            className="voice-listening-pulse"
            style={{
              color: colors.seaBuckthorn,
              fontWeight: 500,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <AudioOutlined style={{ fontSize: 18 }} />
            <span>Listening...</span>
          </p>
        )}
        {previewText && (
          <Text
            style={{
              color: colors.brownBramble,
              fontSize: 14,
              display: 'block',
            }}
          >
            {previewText}
          </Text>
        )}
        <Text
          type="secondary"
          style={{ fontSize: 12, opacity: 0.7, display: 'block', marginTop: 4 }}
        >
          {isActive ? 'Tap the button to stop recording.' : 'Tap the button to start recording.'}
        </Text>
      </div>

      {/* Keyboard fallback button */}
      {showKeyboardButton && (
        <Button
          style={keyboardButtonStyle}
          icon={<EditOutlined />}
          onClick={onKeyboardClick}
          disabled={disabled}
          size="large"
        >
          Type Instead
        </Button>
      )}
    </div>
  );
}

export default VoiceInputButton;
