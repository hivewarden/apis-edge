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
import { SettingsProvider } from '../../src/context/SettingsContext';
import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';
import { useOnlineStatus } from '../../src/hooks/useOnlineStatus';

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
    it('should render SPEAK button with correct text', () => {
      renderWithProviders(<VoiceInputButton onTranscript={mockOnTranscript} />);

      expect(screen.getByRole('button', { name: /speak/i })).toBeInTheDocument();
    });

    it('should render with 64px minimum height for touch target', () => {
      renderWithProviders(<VoiceInputButton onTranscript={mockOnTranscript} />);

      const button = screen.getByRole('button', { name: /speak/i });
      expect(button).toHaveStyle({ minHeight: '64px' });
    });

    it('should render keyboard button when showKeyboardButton is true', () => {
      renderWithProviders(
        <VoiceInputButton
          onTranscript={mockOnTranscript}
          showKeyboardButton={true}
        />
      );

      expect(screen.getByRole('button', { name: /keyboard/i })).toBeInTheDocument();
    });

    it('should not render keyboard button when showKeyboardButton is false', () => {
      renderWithProviders(
        <VoiceInputButton
          onTranscript={mockOnTranscript}
          showKeyboardButton={false}
        />
      );

      expect(screen.queryByRole('button', { name: /keyboard/i })).not.toBeInTheDocument();
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
    it('should show "Done" when listening', () => {
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

      expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
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

      fireEvent.click(screen.getByRole('button', { name: /done/i }));

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

      fireEvent.click(screen.getByRole('button', { name: /keyboard/i }));

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
});
