/**
 * Tests for useSpeechRecognition hook
 *
 * @module tests/hooks/useSpeechRecognition.test
 *
 * Part of Epic 7, Story 7.5: Voice Input for Notes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';

// Mock SpeechRecognition API
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;

  start() {
    if (this.onstart) {
      this.onstart();
    }
  }

  stop() {
    if (this.onend) {
      this.onend();
    }
  }

  abort() {
    if (this.onend) {
      this.onend();
    }
  }

  // Test helpers to simulate events
  simulateResult(transcript: string, isFinal: boolean) {
    if (this.onresult) {
      this.onresult({
        resultIndex: 0,
        results: {
          0: {
            isFinal,
            0: { transcript, confidence: 0.95 },
            length: 1,
          },
          length: 1,
        },
      });
    }
  }

  simulateError(error: string) {
    if (this.onerror) {
      this.onerror({ error });
    }
  }
}

describe('useSpeechRecognition', () => {
  let mockRecognitionInstance: MockSpeechRecognition;
  let MockSpeechRecognitionClass: new () => MockSpeechRecognition;

  beforeEach(() => {
    mockRecognitionInstance = new MockSpeechRecognition();

    // Create a proper constructor function that returns our mock instance
    MockSpeechRecognitionClass = class {
      continuous = mockRecognitionInstance.continuous;
      interimResults = mockRecognitionInstance.interimResults;
      lang = mockRecognitionInstance.lang;
      maxAlternatives = mockRecognitionInstance.maxAlternatives;

      get onstart() { return mockRecognitionInstance.onstart; }
      set onstart(fn) { mockRecognitionInstance.onstart = fn; }
      get onresult() { return mockRecognitionInstance.onresult; }
      set onresult(fn) { mockRecognitionInstance.onresult = fn; }
      get onerror() { return mockRecognitionInstance.onerror; }
      set onerror(fn) { mockRecognitionInstance.onerror = fn; }
      get onend() { return mockRecognitionInstance.onend; }
      set onend(fn) { mockRecognitionInstance.onend = fn; }

      start() {
        mockRecognitionInstance.continuous = this.continuous;
        mockRecognitionInstance.interimResults = this.interimResults;
        mockRecognitionInstance.lang = this.lang;
        mockRecognitionInstance.maxAlternatives = this.maxAlternatives;
        mockRecognitionInstance.start();
      }
      stop() { mockRecognitionInstance.stop(); }
      abort() { mockRecognitionInstance.abort(); }
    } as unknown as new () => MockSpeechRecognition;

    // Mock the global SpeechRecognition constructor
    vi.stubGlobal('SpeechRecognition', MockSpeechRecognitionClass);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('browser support detection', () => {
    it('should detect when SpeechRecognition is available', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      expect(result.current.isSupported).toBe(true);
    });

    it('should detect webkit prefixed SpeechRecognition', () => {
      vi.stubGlobal('SpeechRecognition', undefined);
      vi.stubGlobal('webkitSpeechRecognition', vi.fn(() => mockRecognitionInstance));

      const { result } = renderHook(() => useSpeechRecognition());

      expect(result.current.isSupported).toBe(true);
    });

    it('should report unsupported when no SpeechRecognition API exists', () => {
      // Delete the properties entirely rather than setting to undefined
      delete (window as Record<string, unknown>).SpeechRecognition;
      delete (window as Record<string, unknown>).webkitSpeechRecognition;

      const { result } = renderHook(() => useSpeechRecognition());

      expect(result.current.isSupported).toBe(false);
    });
  });

  describe('start/stop functionality', () => {
    it('should start listening when start is called', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      expect(result.current.isListening).toBe(false);

      act(() => {
        result.current.start();
      });

      expect(result.current.isListening).toBe(true);
    });

    it('should stop listening when stop is called', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      expect(result.current.isListening).toBe(true);

      act(() => {
        result.current.stop();
      });

      expect(result.current.isListening).toBe(false);
    });

    it('should set error when starting without support', () => {
      // Delete the properties entirely rather than setting to undefined
      delete (window as Record<string, unknown>).SpeechRecognition;
      delete (window as Record<string, unknown>).webkitSpeechRecognition;

      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      expect(result.current.error).toBe('Speech recognition not supported in this browser');
    });
  });

  describe('transcript handling', () => {
    it('should accumulate final transcripts', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      act(() => {
        mockRecognitionInstance.simulateResult('Hello ', true);
      });

      expect(result.current.transcript).toBe('Hello ');

      act(() => {
        mockRecognitionInstance.simulateResult('world!', true);
      });

      expect(result.current.transcript).toBe('Hello world!');
    });

    it('should update interim transcript for non-final results', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      act(() => {
        mockRecognitionInstance.simulateResult('Hel', false);
      });

      expect(result.current.interimTranscript).toBe('Hel');
      expect(result.current.transcript).toBe('');
    });

    it('should clear interim transcript on final result', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      act(() => {
        mockRecognitionInstance.simulateResult('Hello', false);
      });

      expect(result.current.interimTranscript).toBe('Hello');

      act(() => {
        mockRecognitionInstance.simulateResult('Hello world', true);
      });

      expect(result.current.transcript).toBe('Hello world');
      expect(result.current.interimTranscript).toBe('');
    });
  });

  describe('error handling', () => {
    it('should handle no-speech error', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      act(() => {
        mockRecognitionInstance.simulateError('no-speech');
      });

      expect(result.current.error).toBe('No speech detected. Please try again.');
      expect(result.current.isListening).toBe(false);
    });

    it('should handle audio-capture error', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      act(() => {
        mockRecognitionInstance.simulateError('audio-capture');
      });

      expect(result.current.error).toBe('No microphone found. Please check your settings.');
    });

    it('should handle not-allowed error', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      act(() => {
        mockRecognitionInstance.simulateError('not-allowed');
      });

      expect(result.current.error).toBe('Microphone access denied. Please allow access in your browser settings.');
    });

    it('should handle network error', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      act(() => {
        mockRecognitionInstance.simulateError('network');
      });

      expect(result.current.error).toBe('Network error. Please check your connection.');
    });

    it('should handle unknown errors', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      act(() => {
        mockRecognitionInstance.simulateError('unknown-error');
      });

      expect(result.current.error).toBe('Error: unknown-error');
    });
  });

  describe('reset functionality', () => {
    it('should reset all state when reset is called', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      act(() => {
        mockRecognitionInstance.simulateResult('Hello world', true);
      });

      act(() => {
        result.current.stop();
      });

      expect(result.current.transcript).toBe('Hello world');

      act(() => {
        result.current.reset();
      });

      expect(result.current.transcript).toBe('');
      expect(result.current.interimTranscript).toBe('');
      expect(result.current.error).toBe(null);
    });
  });

  describe('language configuration', () => {
    it('should use provided language', () => {
      const { result } = renderHook(() =>
        useSpeechRecognition({ language: 'fr-FR' })
      );

      act(() => {
        result.current.start();
      });

      expect(mockRecognitionInstance.lang).toBe('fr-FR');
    });

    it('should use default language from navigator', () => {
      vi.stubGlobal('navigator', { language: 'en-US' });

      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      expect(mockRecognitionInstance.lang).toBe('en-US');
    });
  });

  describe('continuous mode', () => {
    it('should enable continuous mode by default', () => {
      const { result } = renderHook(() => useSpeechRecognition());

      act(() => {
        result.current.start();
      });

      expect(mockRecognitionInstance.continuous).toBe(true);
    });

    it('should allow disabling continuous mode', () => {
      const { result } = renderHook(() =>
        useSpeechRecognition({ continuous: false })
      );

      act(() => {
        result.current.start();
      });

      expect(mockRecognitionInstance.continuous).toBe(false);
    });
  });
});
