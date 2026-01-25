/**
 * Whisper Transcription Service
 *
 * Client-side service for recording audio and sending it to the server
 * for transcription using Whisper AI.
 *
 * @module services/whisperTranscription
 *
 * Part of Epic 7, Story 7.5: Voice Input for Notes
 */

/** Maximum recording duration in seconds */
const MAX_RECORDING_SECONDS = 60;

/** Preferred audio MIME type (WebM with Opus codec for good compression) */
const PREFERRED_MIME_TYPE = 'audio/webm;codecs=opus';

/** Fallback MIME types to try if preferred is not supported */
const FALLBACK_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4'];

/**
 * Result from server transcription
 */
export interface TranscriptionResult {
  /** The transcribed text */
  text: string;
  /** Detected or specified language code */
  language?: string;
  /** Duration of audio in seconds */
  duration?: number;
}

// Module-level state for recording
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let recordingTimeout: ReturnType<typeof setTimeout> | null = null;
let currentMimeType: string = PREFERRED_MIME_TYPE;

/**
 * Get the best supported audio MIME type for recording
 */
function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return PREFERRED_MIME_TYPE; // Will fail later, but return something
  }

  if (MediaRecorder.isTypeSupported(PREFERRED_MIME_TYPE)) {
    return PREFERRED_MIME_TYPE;
  }

  for (const mimeType of FALLBACK_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  // Last resort - let the browser choose
  return '';
}

/**
 * Start recording audio from the microphone
 *
 * Requests microphone access and begins recording audio.
 * Recording will automatically stop after MAX_RECORDING_SECONDS.
 *
 * @throws {Error} If microphone access is denied or unavailable
 *
 * @example
 * ```typescript
 * try {
 *   await startRecording();
 *   // Recording started...
 * } catch (error) {
 *   console.error('Could not start recording:', error.message);
 * }
 * ```
 */
export async function startRecording(): Promise<void> {
  // Check for MediaRecorder support
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Audio recording is not supported in this browser');
  }

  // Request microphone access
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone access denied. Please allow access in your browser settings.');
      }
      if (err.name === 'NotFoundError') {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      }
    }
    throw new Error('Failed to access microphone');
  }

  // Reset state
  audioChunks = [];
  currentMimeType = getSupportedMimeType();

  // Create MediaRecorder with best available codec
  const options: MediaRecorderOptions = currentMimeType
    ? { mimeType: currentMimeType }
    : {};

  mediaRecorder = new MediaRecorder(stream, options);

  // Collect audio chunks as they become available
  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };

  // Start recording, collecting data every second
  mediaRecorder.start(1000);

  // Auto-stop after max duration to prevent excessive file sizes
  recordingTimeout = setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
    }
  }, MAX_RECORDING_SECONDS * 1000);
}

/**
 * Stop recording and return the audio blob
 *
 * Stops the current recording and returns the audio data as a Blob.
 * Also releases the microphone.
 *
 * @returns Promise resolving to the recorded audio blob
 * @throws {Error} If no recording is in progress
 *
 * @example
 * ```typescript
 * const audioBlob = await stopRecording();
 * const result = await transcribeAudio(audioBlob);
 * console.log('Transcription:', result.text);
 * ```
 */
export function stopRecording(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) {
      reject(new Error('No recording in progress'));
      return;
    }

    // Clear auto-stop timeout
    if (recordingTimeout) {
      clearTimeout(recordingTimeout);
      recordingTimeout = null;
    }

    // Handle recording stop
    mediaRecorder.onstop = () => {
      // Create audio blob from chunks
      const audioBlob = new Blob(audioChunks, { type: currentMimeType || 'audio/webm' });

      // Release microphone
      if (mediaRecorder) {
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      }

      // Clean up state
      mediaRecorder = null;
      audioChunks = [];

      resolve(audioBlob);
    };

    // Handle errors during stop
    mediaRecorder.onerror = () => {
      if (mediaRecorder) {
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      }
      mediaRecorder = null;
      audioChunks = [];
      reject(new Error('Recording error occurred'));
    };

    // Stop recording
    mediaRecorder.stop();
  });
}

/**
 * Send audio to server for Whisper transcription
 *
 * Uploads the audio blob to the server's transcription endpoint
 * and returns the transcribed text.
 *
 * @param audioBlob - The audio data to transcribe
 * @param language - Optional BCP 47 language code hint (e.g., 'en-US', 'fr-FR')
 * @returns Promise resolving to transcription result
 * @throws {Error} If transcription fails (network error, server error, etc.)
 *
 * @example
 * ```typescript
 * const audioBlob = await stopRecording();
 * try {
 *   const result = await transcribeAudio(audioBlob, 'en-US');
 *   console.log('Text:', result.text);
 *   console.log('Duration:', result.duration, 'seconds');
 * } catch (error) {
 *   console.error('Transcription failed:', error.message);
 * }
 * ```
 */
export async function transcribeAudio(audioBlob: Blob, language?: string): Promise<TranscriptionResult> {
  // Get auth token from localStorage (set by auth provider)
  const authToken = localStorage.getItem('apis_auth_token');

  // Create form data with audio file
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  // Include language hint if provided
  if (language) {
    formData.append('language', language);
  }

  // Send to server
  const response = await fetch('/api/transcribe', {
    method: 'POST',
    headers: authToken
      ? { Authorization: `Bearer ${authToken}` }
      : {},
    body: formData,
  });

  if (!response.ok) {
    // Try to get error message from response
    let errorMessage = 'Transcription failed';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      // Use default message
    }

    // Specific error messages for common status codes
    if (response.status === 413) {
      throw new Error('Audio file too large (max 10MB)');
    }
    if (response.status === 429) {
      throw new Error('Too many requests. Please wait a moment and try again.');
    }
    if (response.status === 401) {
      throw new Error('Authentication required');
    }
    if (response.status === 503) {
      throw new Error('Transcription service unavailable. Please try again later.');
    }

    throw new Error(errorMessage);
  }

  const result = await response.json();

  return {
    text: result.data?.text || result.text || '',
    language: result.data?.language || result.language,
    duration: result.data?.duration || result.duration,
  };
}

/**
 * Check if currently recording
 *
 * @returns true if recording is in progress
 */
export function isRecording(): boolean {
  return mediaRecorder !== null && mediaRecorder.state === 'recording';
}

/**
 * Cancel recording without getting the audio
 *
 * Stops recording and releases the microphone without
 * returning the audio data. Use this to abort a recording.
 */
export function cancelRecording(): void {
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }

  if (mediaRecorder) {
    // Release microphone
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    mediaRecorder = null;
  }

  audioChunks = [];
}

/**
 * Check if audio recording is supported in this browser
 *
 * @returns true if MediaRecorder API is available
 */
export function isAudioRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}
