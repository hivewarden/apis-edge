/**
 * Tests for VoiceInputTextArea component
 *
 * @module tests/components/VoiceInputTextArea.test
 *
 * Part of Epic 7, Story 7.5: Voice Input for Notes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock VoiceInputButton - inline mock to avoid hoisting issues
vi.mock('../../src/components/VoiceInputButton', () => ({
  VoiceInputButton: function MockVoiceInputButton({
    onTranscript,
    onKeyboardClick,
    disabled,
  }: {
    onTranscript: (text: string) => void;
    onKeyboardClick?: () => void;
    disabled?: boolean;
  }) {
    return React.createElement(
      'div',
      { 'data-testid': 'voice-input-button' },
      React.createElement(
        'button',
        {
          'data-testid': 'speak-button',
          onClick: () => onTranscript('test transcript'),
          disabled: disabled,
        },
        'SPEAK'
      ),
      React.createElement(
        'button',
        {
          'data-testid': 'keyboard-button',
          onClick: onKeyboardClick,
        },
        'Keyboard'
      )
    );
  },
}));

// Mock dependencies that VoiceInputTextArea might use indirectly
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

// Import component after mocks
import { VoiceInputTextArea } from '../../src/components/VoiceInputTextArea';
import { SettingsProvider } from '../../src/context/SettingsContext';

const renderWithProviders = (component: React.ReactNode) => {
  return render(React.createElement(SettingsProvider, null, component));
};

describe('VoiceInputTextArea', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render textarea', async () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, { value: '', onChange: mockOnChange })
      );

      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });
    });

    it('should render with placeholder', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, {
          value: '',
          onChange: mockOnChange,
          placeholder: 'Enter notes...',
        })
      );

      expect(screen.getByPlaceholderText('Enter notes...')).toBeInTheDocument();
    });

    it('should render VoiceInputButton', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, { value: '', onChange: mockOnChange })
      );

      expect(screen.getByTestId('voice-input-button')).toBeInTheDocument();
    });
  });

  describe('controlled mode', () => {
    it('should display controlled value', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, {
          value: 'Initial text',
          onChange: mockOnChange,
        })
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue('Initial text');
    });

    it('should call onChange when text is typed', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, { value: '', onChange: mockOnChange })
      );

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'New text' } });

      expect(mockOnChange).toHaveBeenCalledWith('New text');
    });
  });

  describe('disabled state', () => {
    it('should disable textarea when disabled prop is true', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, {
          value: '',
          onChange: mockOnChange,
          disabled: true,
        })
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
    });

    it('should be enabled by default', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, { value: '', onChange: mockOnChange })
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).not.toBeDisabled();
    });
  });

  describe('voice transcript handling', () => {
    it('should append transcript when speak button is clicked', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, { value: '', onChange: mockOnChange })
      );

      // Click the speak button which triggers onTranscript('test transcript')
      fireEvent.click(screen.getByTestId('speak-button'));

      // Should call onChange with the transcript
      expect(mockOnChange).toHaveBeenCalledWith('test transcript');
    });

    it('should append transcript to existing value with space', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, { value: 'Existing text', onChange: mockOnChange })
      );

      // Click the speak button which triggers onTranscript('test transcript')
      fireEvent.click(screen.getByTestId('speak-button'));

      // Should call onChange with existing text + space + transcript
      expect(mockOnChange).toHaveBeenCalledWith('Existing text test transcript');
    });

    it('should not add space when existing value ends with space', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, { value: 'Existing text ', onChange: mockOnChange })
      );

      // Click the speak button which triggers onTranscript('test transcript')
      fireEvent.click(screen.getByTestId('speak-button'));

      // Should call onChange without adding extra space
      expect(mockOnChange).toHaveBeenCalledWith('Existing text test transcript');
    });
  });

  describe('maxLength prop', () => {
    it('should respect maxLength prop', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, {
          value: 'Test',
          onChange: mockOnChange,
          maxLength: 100,
        })
      );

      // Verify maxLength is set on the textarea
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('maxlength', '100');
    });
  });

  describe('rows prop', () => {
    it('should pass rows prop to textarea', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, {
          value: '',
          onChange: mockOnChange,
          rows: 6,
        })
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('rows', '6');
    });

    it('should default to 6 rows', () => {
      renderWithProviders(
        React.createElement(VoiceInputTextArea, { value: '', onChange: mockOnChange })
      );

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('rows', '6');
    });
  });
});
