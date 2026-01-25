/**
 * Speech Recognition Hook
 *
 * React hook for browser-based speech recognition using the Web Speech API.
 * Provides real-time speech-to-text transcription with interim results.
 *
 * @module hooks/useSpeechRecognition
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
 *
 * Part of Epic 7, Story 7.5: Voice Input for Notes
 */
import { useState, useCallback, useRef, useEffect } from 'react';

// TypeScript declarations for Web Speech API
// These interfaces are not included in standard TypeScript libs

/**
 * Speech recognition result event containing transcriptions
 */
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

/**
 * Speech recognition error event with error type
 */
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

/**
 * Individual speech recognition result (final or interim)
 */
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
  length: number;
}

/**
 * Single alternative transcription with confidence score
 */
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

/**
 * Collection of speech recognition results
 */
interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

/**
 * Browser SpeechRecognition instance interface
 */
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

// Extend window interface for browser compatibility
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

/**
 * Return type for useSpeechRecognition hook
 */
export interface UseSpeechRecognitionResult {
  /** Whether the Web Speech API is supported in this browser */
  isSupported: boolean;
  /** Whether the microphone is actively listening */
  isListening: boolean;
  /** Final transcribed text (accumulated from all speech) */
  transcript: string;
  /** Interim (in-progress) transcription, updates in real-time */
  interimTranscript: string;
  /** Error message if recognition failed, null otherwise */
  error: string | null;
  /** Start speech recognition */
  start: () => void;
  /** Stop speech recognition and finalize transcript */
  stop: () => void;
  /** Reset all state (transcript, interim, error) */
  reset: () => void;
}

/**
 * Options for speech recognition configuration
 */
export interface UseSpeechRecognitionOptions {
  /** BCP 47 language tag (e.g., 'en-US', 'fr-FR'). Defaults to navigator.language */
  language?: string;
  /** Whether to enable continuous recognition mode. Defaults to true */
  continuous?: boolean;
}

/**
 * User-friendly error messages mapped from Web Speech API error codes
 */
const ERROR_MESSAGES: Record<string, string> = {
  'no-speech': 'No speech detected. Please try again.',
  'audio-capture': 'No microphone found. Please check your settings.',
  'not-allowed': 'Microphone access denied. Please allow access in your browser settings.',
  'network': 'Network error. Please check your connection.',
  'aborted': 'Recording was stopped.',
  'service-not-allowed': 'Speech recognition service not available.',
  'bad-grammar': 'Speech grammar error.',
  'language-not-supported': 'Language not supported.',
};

/**
 * Hook for browser-based speech recognition
 *
 * Uses the Web Speech API to provide real-time speech-to-text transcription.
 * Supports continuous dictation with interim results for immediate feedback.
 *
 * @param options - Configuration options for speech recognition
 * @returns Object containing recognition state and control functions
 *
 * @example
 * ```tsx
 * function VoiceInput() {
 *   const {
 *     isSupported,
 *     isListening,
 *     transcript,
 *     interimTranscript,
 *     error,
 *     start,
 *     stop,
 *     reset,
 *   } = useSpeechRecognition({ language: 'en-US' });
 *
 *   if (!isSupported) {
 *     return <div>Speech recognition not supported</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <p>{transcript}{interimTranscript}</p>
 *       <button onClick={isListening ? stop : start}>
 *         {isListening ? 'Stop' : 'Start'}
 *       </button>
 *       {error && <p style={{ color: 'red' }}>{error}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionResult {
  const { language = navigator.language, continuous = true } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Check for browser support
  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  /**
   * Start speech recognition
   */
  const start = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    // Clear previous error
    setError(null);
    setInterimTranscript('');

    // Get the appropriate constructor (standard or webkit-prefixed)
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    // Configure recognition
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    // Handle start event
    recognition.onstart = () => {
      setIsListening(true);
    };

    // Handle results (both interim and final)
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimText = '';

      // Process all results from the current result index
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      // Append final transcript to accumulated transcript
      if (finalTranscript) {
        setTranscript((prev) => prev + finalTranscript);
      }
      // Update interim transcript (replaces previous interim)
      setInterimTranscript(interimText);
    };

    // Handle errors
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorMessage =
        ERROR_MESSAGES[event.error] || `Error: ${event.error}`;
      setError(errorMessage);
      setIsListening(false);
    };

    // Handle end (natural or requested)
    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    // Store reference and start
    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, language, continuous]);

  /**
   * Stop speech recognition
   */
  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  /**
   * Reset all recognition state
   */
  const reset = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  };
}

export default useSpeechRecognition;
