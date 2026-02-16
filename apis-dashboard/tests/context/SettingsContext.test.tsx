/**
 * SettingsContext Tests
 *
 * Tests for the settings context provider from Story 5.5.
 * Covers: localStorage persistence, advancedMode state, voice settings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SettingsProvider, useSettings, type VoiceInputMethod } from '../../src/context/SettingsContext';

// Component that uses the settings context for testing
function TestConsumer() {
  const {
    advancedMode,
    setAdvancedMode,
    voiceInputMethod,
    setVoiceInputMethod,
    voiceLanguage,
    setVoiceLanguage,
  } = useSettings();

  return (
    <div>
      <span data-testid="advancedMode">{advancedMode ? 'true' : 'false'}</span>
      <span data-testid="voiceInputMethod">{voiceInputMethod}</span>
      <span data-testid="voiceLanguage">{voiceLanguage}</span>
      <button onClick={() => setAdvancedMode(!advancedMode)}>Toggle Advanced</button>
      <button onClick={() => setVoiceInputMethod('whisper')}>Set Whisper</button>
      <button onClick={() => setVoiceLanguage('fr-FR')}>Set French</button>
    </div>
  );
}

describe('SettingsContext', () => {
  // Mock localStorage
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => mockStorage[key] || null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      mockStorage[key] = value;
    });

    // Mock navigator.language
    Object.defineProperty(navigator, 'language', {
      value: 'en-US',
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Default Values', () => {
    it('defaults advancedMode to false', () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId('advancedMode')).toHaveTextContent('false');
    });

    it('defaults voiceInputMethod to auto', () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId('voiceInputMethod')).toHaveTextContent('auto');
    });

    it('defaults voiceLanguage to browser language', () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId('voiceLanguage')).toHaveTextContent('en-US');
    });
  });

  describe('localStorage Persistence', () => {
    it('loads advancedMode from localStorage on mount', () => {
      mockStorage['apis_settings'] = JSON.stringify({ advancedMode: true });

      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId('advancedMode')).toHaveTextContent('true');
    });

    it('loads voiceInputMethod from localStorage on mount', () => {
      mockStorage['apis_settings'] = JSON.stringify({
        advancedMode: false,
        voiceInputMethod: 'whisper',
      });

      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId('voiceInputMethod')).toHaveTextContent('whisper');
    });

    it('loads voiceLanguage from localStorage on mount', () => {
      mockStorage['apis_settings'] = JSON.stringify({
        advancedMode: false,
        voiceLanguage: 'de-DE',
      });

      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId('voiceLanguage')).toHaveTextContent('de-DE');
    });

    it('saves settings to localStorage when advancedMode changes', async () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Toggle Advanced'));
      });

      await waitFor(() => {
        const stored = JSON.parse(mockStorage['apis_settings']);
        expect(stored.advancedMode).toBe(true);
      });
    });

    it('saves settings to localStorage when voiceInputMethod changes', async () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Set Whisper'));
      });

      await waitFor(() => {
        const stored = JSON.parse(mockStorage['apis_settings']);
        expect(stored.voiceInputMethod).toBe('whisper');
      });
    });

    it('saves settings to localStorage when voiceLanguage changes', async () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Set French'));
      });

      await waitFor(() => {
        const stored = JSON.parse(mockStorage['apis_settings']);
        expect(stored.voiceLanguage).toBe('fr-FR');
      });
    });

    it('handles corrupted localStorage gracefully', () => {
      mockStorage['apis_settings'] = 'invalid json';

      // Should not throw
      expect(() => {
        render(
          <SettingsProvider>
            <TestConsumer />
          </SettingsProvider>
        );
      }).not.toThrow();

      // Should use defaults
      expect(screen.getByTestId('advancedMode')).toHaveTextContent('false');
    });

    it('handles missing localStorage keys gracefully', () => {
      mockStorage['apis_settings'] = JSON.stringify({});

      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      // Should use defaults for missing keys
      expect(screen.getByTestId('advancedMode')).toHaveTextContent('false');
      expect(screen.getByTestId('voiceInputMethod')).toHaveTextContent('auto');
    });
  });

  describe('State Updates', () => {
    it('toggles advancedMode state', async () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId('advancedMode')).toHaveTextContent('false');

      await act(async () => {
        fireEvent.click(screen.getByText('Toggle Advanced'));
      });

      expect(screen.getByTestId('advancedMode')).toHaveTextContent('true');

      await act(async () => {
        fireEvent.click(screen.getByText('Toggle Advanced'));
      });

      expect(screen.getByTestId('advancedMode')).toHaveTextContent('false');
    });

    it('updates voiceInputMethod state', async () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId('voiceInputMethod')).toHaveTextContent('auto');

      await act(async () => {
        fireEvent.click(screen.getByText('Set Whisper'));
      });

      expect(screen.getByTestId('voiceInputMethod')).toHaveTextContent('whisper');
    });

    it('updates voiceLanguage state', async () => {
      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId('voiceLanguage')).toHaveTextContent('en-US');

      await act(async () => {
        fireEvent.click(screen.getByText('Set French'));
      });

      expect(screen.getByTestId('voiceLanguage')).toHaveTextContent('fr-FR');
    });
  });

  describe('useSettings Hook', () => {
    it('throws error when used outside of SettingsProvider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = vi.fn();

      expect(() => {
        render(<TestConsumer />);
      }).toThrow('useSettings must be used within a SettingsProvider');

      console.error = originalError;
    });
  });

  describe('Browser Language Fallback', () => {
    it('uses en-US when navigator.language is undefined', () => {
      Object.defineProperty(navigator, 'language', {
        value: undefined,
        configurable: true,
      });

      render(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      );

      expect(screen.getByTestId('voiceLanguage')).toHaveTextContent('en-US');
    });
  });
});
