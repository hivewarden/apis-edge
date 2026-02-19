/**
 * Tests for VoiceInputButton component
 *
 * @module tests/components/VoiceInputButton.test
 *
 * Part of Epic 7, Story 7.5: Voice Input for Notes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock CSS import
vi.mock('../../src/styles/voice-input.css', () => ({}));

// Mock the hooks and services BEFORE importing the component
vi.mock('../../src/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: vi.fn(() => ({
    isSupported: true,
    isListening: false,
    transcript: '',
    interimTranscript: '',
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
  })),
}));

vi.mock('../../src/hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => true),
}));

vi.mock('../../src/services/whisperTranscription', () => ({
  startRecording: vi.fn(),
  stopRecording: vi.fn(() => Promise.resolve(new Blob())),
  transcribeAudio: vi.fn(() => Promise.resolve({ text: 'test transcription' })),
}));

// Now import the component and mocked modules
import { VoiceInputButton } from '../../src/components/VoiceInputButton';
import { SettingsProvider, useSettings } from '../../src/context/SettingsContext';
import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';
import { useOnlineStatus } from '../../src/hooks/useOnlineStatus';
import * as whisperService from '../../src/services/whisperTranscription';

const renderWithProviders = (component: React.ReactNode) => {
  return render(<SettingsProvider>{component}</SettingsProvider>);
};

describe('VoiceInputButton', () => {
  const mockOnTranscript = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default mock implementation
    vi.mocked(useSpeechRecognition).mockReturnValue({
      isSupported: true,
      isListening: false,
      transcript: '',
      interimTranscript: '',
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
      reset: vi.fn(),
    });
    vi.mocked(useOnlineStatus).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render SPEAK button with correct text', async () => {
      renderWithProviders(<VoiceInputButton onTranscript={mockOnTranscript} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /speak/i })).toBeInTheDocument();
      });
    });

    it('should render with 64px height for touch target', () => {
      renderWithProviders(<VoiceInputButton onTranscript={mockOnTranscript} />);

      const button = screen.getByRole('button', { name: /speak/i });
      expect(button).toHaveStyle({ height: '64px' });
    });

    it('should render keyboard button when showKeyboardButton is true', () => {
      renderWithProviders(
        <VoiceInputButton
          onTranscript={mockOnTranscript}
          showKeyboardButton={true}
        />
      );

      // Button text is "Type Instead"
      expect(screen.getByRole('button', { name: /type instead/i })).toBeInTheDocument();
    });

    it('should not render keyboard button when showKeyboardButton is false', () => {
      renderWithProviders(
        <VoiceInputButton
          onTranscript={mockOnTranscript}
          showKeyboardButton={false}
        />
      );

      expect(screen.queryByRole('button', { name: /type instead/i })).not.toBeInTheDocument();
    });
  });

  describe('disabled state', () => {
    it('should be disabled when disabled prop is true', () => {
      renderWithProviders(
        <VoiceInputButton onTranscript={mockOnTranscript} disabled={true} />
      );

      const button = screen.getByRole('button', { name: /speak/i });
      expect(button).toBeDisabled();
    });

    it('should be enabled when disabled prop is false', () => {
      renderWithProviders(
        <VoiceInputButton onTranscript={mockOnTranscript} disabled={false} />
      );

      const button = screen.getByRole('button', { name: /speak/i });
      expect(button).not.toBeDisabled();
    });
  });

  describe('listening state', () => {
    it('should show "Stop" when listening', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        isSupported: true,
        isListening: true,
        transcript: '',
        interimTranscript: '',
        error: null,
        start: vi.fn(),
        stop: vi.fn(),
        reset: vi.fn(),
      });

      renderWithProviders(<VoiceInputButton onTranscript={mockOnTranscript} />);

      expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
    });

    it('should show interim transcript when available', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        isSupported: true,
        isListening: true,
        transcript: '',
        interimTranscript: 'Hello wor',
        error: null,
        start: vi.fn(),
        stop: vi.fn(),
        reset: vi.fn(),
      });

      renderWithProviders(<VoiceInputButton onTranscript={mockOnTranscript} />);

      expect(screen.getByText('Hello wor')).toBeInTheDocument();
    });
  });

  describe('click handling', () => {
    it('should call start when clicked while not listening', () => {
      const mockStart = vi.fn();
      vi.mocked(useSpeechRecognition).mockReturnValue({
        isSupported: true,
        isListening: false,
        transcript: '',
        interimTranscript: '',
        error: null,
        start: mockStart,
        stop: vi.fn(),
        reset: vi.fn(),
      });

      renderWithProviders(<VoiceInputButton onTranscript={mockOnTranscript} />);

      fireEvent.click(screen.getByRole('button', { name: /speak/i }));

      expect(mockStart).toHaveBeenCalled();
    });

    it('should call stop when clicked while listening', () => {
      const mockStop = vi.fn();
      vi.mocked(useSpeechRecognition).mockReturnValue({
        isSupported: true,
        isListening: true,
        transcript: '',
        interimTranscript: '',
        error: null,
        start: vi.fn(),
        stop: mockStop,
        reset: vi.fn(),
      });

      renderWithProviders(<VoiceInputButton onTranscript={mockOnTranscript} />);

      fireEvent.click(screen.getByRole('button', { name: /stop/i }));

      expect(mockStop).toHaveBeenCalled();
    });

    it('should call onKeyboardClick when keyboard button is clicked', () => {
      const mockKeyboardClick = vi.fn();

      renderWithProviders(
        <VoiceInputButton
          onTranscript={mockOnTranscript}
          showKeyboardButton={true}
          onKeyboardClick={mockKeyboardClick}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /type instead/i }));

      expect(mockKeyboardClick).toHaveBeenCalled();
    });
  });

  describe('offline fallback', () => {
    it('should show unavailable message when offline and using Whisper', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        isSupported: false,
        isListening: false,
        transcript: '',
        interimTranscript: '',
        error: null,
        start: vi.fn(),
        stop: vi.fn(),
        reset: vi.fn(),
      });
      vi.mocked(useOnlineStatus).mockReturnValue(false);

      renderWithProviders(<VoiceInputButton onTranscript={mockOnTranscript} />);

      expect(screen.getByText(/voice input requires internet connection/i)).toBeInTheDocument();
    });

    it('should disable button when offline and no native support', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        isSupported: false,
        isListening: false,
        transcript: '',
        interimTranscript: '',
        error: null,
        start: vi.fn(),
        stop: vi.fn(),
        reset: vi.fn(),
      });
      vi.mocked(useOnlineStatus).mockReturnValue(false);

      renderWithProviders(<VoiceInputButton onTranscript={mockOnTranscript} />);

      const button = screen.getByRole('button', { name: /speak/i });
      expect(button).toBeDisabled();
    });
  });

  describe('error display', () => {
    it('should display error message when error occurs', () => {
      vi.mocked(useSpeechRecognition).mockReturnValue({
        isSupported: true,
        isListening: false,
        transcript: '',
        interimTranscript: '',
        error: 'Microphone access denied',
        start: vi.fn(),
        stop: vi.fn(),
        reset: vi.fn(),
      });

      renderWithProviders(<VoiceInputButton onTranscript={mockOnTranscript} />);

      expect(screen.getByText('Microphone access denied')).toBeInTheDocument();
    });
  });

  describe('transcript callback', () => {
    it('should call onTranscript when transcript is complete', async () => {
      const mockReset = vi.fn();
      vi.mocked(useSpeechRecognition)
        .mockReturnValueOnce({
          isSupported: true,
          isListening: true,
          transcript: '',
          interimTranscript: 'Hello',
          error: null,
          start: vi.fn(),
          stop: vi.fn(),
          reset: mockReset,
        })
        .mockReturnValue({
          isSupported: true,
          isListening: false,
          transcript: 'Hello world',
          interimTranscript: '',
          error: null,
          start: vi.fn(),
          stop: vi.fn(),
          reset: mockReset,
        });

      const { rerender } = renderWithProviders(
        <VoiceInputButton onTranscript={mockOnTranscript} />
      );

      // Trigger re-render with updated transcript
      rerender(
        <SettingsProvider>
          <VoiceInputButton onTranscript={mockOnTranscript} />
        </SettingsProvider>
      );

      await waitFor(() => {
        expect(mockOnTranscript).toHaveBeenCalledWith('Hello world');
      });
    });
  });

  describe('Whisper mode integration', () => {
    /**
     * A test wrapper that sets voiceInputMethod to 'whisper'
     */
    const WhisperModeWrapper = ({ children }: { children: React.ReactNode }) => {
      const { setVoiceInputMethod } = useSettings();
      React.useEffect(() => {
        setVoiceInputMethod('whisper');
      }, [setVoiceInputMethod]);
      return <>{children}</>;
    };

    const renderWithWhisperMode = (component: React.ReactNode) => {
      return render(
        <SettingsProvider>
          <WhisperModeWrapper>{component}</WhisperModeWrapper>
        </SettingsProvider>
      );
    };

    beforeEach(() => {
      // Set native speech recognition as not supported to force Whisper mode
      vi.mocked(useSpeechRecognition).mockReturnValue({
        isSupported: false,
        isListening: false,
        transcript: '',
        interimTranscript: '',
        error: null,
        start: vi.fn(),
        stop: vi.fn(),
        reset: vi.fn(),
      });
      vi.mocked(useOnlineStatus).mockReturnValue(true);
    });

    it('should call startRecording when SPEAK is clicked in Whisper mode', async () => {
      renderWithWhisperMode(<VoiceInputButton onTranscript={mockOnTranscript} />);

      // Wait for the component to render and settings to apply
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /speak/i })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole('button', { name: /speak/i }));

      await waitFor(() => {
        expect(whisperService.startRecording).toHaveBeenCalled();
      });
    });

    it('should call stopRecording and transcribeAudio when Stop is clicked in Whisper mode', async () => {
      const mockAudioBlob = new Blob(['test'], { type: 'audio/webm' });
      vi.mocked(whisperService.stopRecording).mockResolvedValue(mockAudioBlob);
      vi.mocked(whisperService.transcribeAudio).mockResolvedValue({ text: 'whisper test result' });

      renderWithWhisperMode(<VoiceInputButton onTranscript={mockOnTranscript} />);

      // Wait for component to render
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /speak/i })).not.toBeDisabled();
      });

      // Start recording
      fireEvent.click(screen.getByRole('button', { name: /speak/i }));

      await waitFor(() => {
        expect(whisperService.startRecording).toHaveBeenCalled();
      });

      // Wait for Stop button to appear
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
      });

      // Stop recording (click Stop)
      fireEvent.click(screen.getByRole('button', { name: /stop/i }));

      await waitFor(() => {
        expect(whisperService.stopRecording).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(whisperService.transcribeAudio).toHaveBeenCalledWith(mockAudioBlob, expect.any(String));
      });
    });

    it('should call onTranscript with transcribed text in Whisper mode', async () => {
      const mockAudioBlob = new Blob(['test'], { type: 'audio/webm' });
      vi.mocked(whisperService.stopRecording).mockResolvedValue(mockAudioBlob);
      vi.mocked(whisperService.transcribeAudio).mockResolvedValue({ text: 'Hello from Whisper' });

      renderWithWhisperMode(<VoiceInputButton onTranscript={mockOnTranscript} />);

      // Wait for component to render
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /speak/i })).not.toBeDisabled();
      });

      // Start recording
      fireEvent.click(screen.getByRole('button', { name: /speak/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
      });

      // Stop recording (click Stop)
      fireEvent.click(screen.getByRole('button', { name: /stop/i }));

      // Verify callback receives the transcribed text
      await waitFor(() => {
        expect(mockOnTranscript).toHaveBeenCalledWith('Hello from Whisper');
      });
    });

    it('should display error when Whisper transcription fails', async () => {
      vi.mocked(whisperService.stopRecording).mockResolvedValue(new Blob());
      vi.mocked(whisperService.transcribeAudio).mockRejectedValue(new Error('Transcription service unavailable'));

      renderWithWhisperMode(<VoiceInputButton onTranscript={mockOnTranscript} />);

      // Wait for component to render
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /speak/i })).not.toBeDisabled();
      });

      // Start recording
      fireEvent.click(screen.getByRole('button', { name: /speak/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
      });

      // Stop recording
      fireEvent.click(screen.getByRole('button', { name: /stop/i }));

      // Verify error is displayed
      await waitFor(() => {
        expect(screen.getByText('Transcription service unavailable')).toBeInTheDocument();
      });
    });
  });
});
