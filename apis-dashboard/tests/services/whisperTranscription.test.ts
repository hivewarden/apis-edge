/**
 * Tests for whisperTranscription service
 *
 * @module tests/services/whisperTranscription.test
 *
 * Part of Epic 7, Story 7.5: Voice Input for Notes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startRecording,
  stopRecording,
  transcribeAudio,
  isRecording,
  cancelRecording,
  isAudioRecordingSupported,
} from '../../src/services/whisperTranscription';

// Mock MediaRecorder
class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  stream: MediaStream;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  start(timeslice?: number) {
    this.state = 'recording';
    // Simulate data available after a short delay
    if (this.ondataavailable) {
      setTimeout(() => {
        this.ondataavailable?.({ data: new Blob(['audio data'], { type: 'audio/webm' }) });
      }, 100);
    }
  }

  stop() {
    this.state = 'inactive';
    setTimeout(() => {
      this.onstop?.();
    }, 0);
  }

  static isTypeSupported(type: string): boolean {
    return type.includes('audio/webm') || type.includes('audio/ogg');
  }
}

// Mock MediaStream
class MockMediaStream {
  private tracks: MediaStreamTrack[] = [];

  constructor() {
    this.tracks = [{ stop: vi.fn(), kind: 'audio' } as unknown as MediaStreamTrack];
  }

  getTracks() {
    return this.tracks;
  }
}

describe('whisperTranscription service', () => {
  let mockStream: MockMediaStream;
  let originalMediaRecorder: typeof MediaRecorder;
  let originalNavigator: Navigator;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    // Store originals
    originalMediaRecorder = global.MediaRecorder;
    originalNavigator = global.navigator;
    originalFetch = global.fetch;

    // Create mock stream
    mockStream = new MockMediaStream();

    // Mock MediaRecorder
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);

    // Mock navigator.mediaDevices
    const mockMediaDevices = {
      getUserMedia: vi.fn(() => Promise.resolve(mockStream as unknown as MediaStream)),
    };

    vi.stubGlobal('navigator', {
      mediaDevices: mockMediaDevices,
      language: 'en-US',
    });

    // Mock fetch for transcribeAudio
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { text: 'transcribed text' } }),
      } as Response)
    ));

    // Mock localStorage
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'mock-auth-token'),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cancelRecording(); // Clean up any active recording
  });

  describe('isAudioRecordingSupported', () => {
    it('should return true when MediaRecorder and getUserMedia are available', () => {
      expect(isAudioRecordingSupported()).toBe(true);
    });

    it('should return false when MediaRecorder is not available', () => {
      vi.stubGlobal('MediaRecorder', undefined);

      expect(isAudioRecordingSupported()).toBe(false);
    });

    it('should return false when getUserMedia is not available', () => {
      vi.stubGlobal('navigator', { mediaDevices: {} });

      expect(isAudioRecordingSupported()).toBe(false);
    });
  });

  describe('startRecording', () => {
    it('should request microphone access', async () => {
      await startRecording();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('should throw error when microphone access is denied', async () => {
      // Create a proper DOMException mock for NotAllowedError
      const domException = new DOMException('Permission denied', 'NotAllowedError');
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(domException);

      await expect(startRecording()).rejects.toThrow(
        'Microphone access denied. Please allow access in your browser settings.'
      );
    });

    it('should throw error when no microphone is found', async () => {
      // Create a proper DOMException mock for NotFoundError
      const domException = new DOMException('No device', 'NotFoundError');
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(domException);

      await expect(startRecording()).rejects.toThrow(
        'No microphone found. Please connect a microphone and try again.'
      );
    });

    it('should set isRecording to true after starting', async () => {
      await startRecording();

      expect(isRecording()).toBe(true);
    });
  });

  describe('stopRecording', () => {
    it('should return audio blob when stopped', async () => {
      await startRecording();
      const blob = await stopRecording();

      expect(blob).toBeInstanceOf(Blob);
    });

    it('should throw error if no recording is in progress', async () => {
      await expect(stopRecording()).rejects.toThrow('No recording in progress');
    });

    it('should set isRecording to false after stopping', async () => {
      await startRecording();
      expect(isRecording()).toBe(true);

      await stopRecording();
      expect(isRecording()).toBe(false);
    });

    it('should release microphone tracks after stopping', async () => {
      await startRecording();
      await stopRecording();

      const tracks = mockStream.getTracks();
      tracks.forEach((track) => {
        expect(track.stop).toHaveBeenCalled();
      });
    });
  });

  describe('transcribeAudio', () => {
    it('should send audio to transcription endpoint', async () => {
      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

      await transcribeAudio(audioBlob);

      expect(fetch).toHaveBeenCalledWith(
        '/api/transcribe',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        })
      );
    });

    it('should include auth token in headers', async () => {
      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

      await transcribeAudio(audioBlob);

      expect(fetch).toHaveBeenCalledWith(
        '/api/transcribe',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-auth-token',
          }),
        })
      );
    });

    it('should return transcription result', async () => {
      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

      const result = await transcribeAudio(audioBlob);

      expect(result).toEqual({
        text: 'transcribed text',
        language: undefined,
        duration: undefined,
      });
    });

    it('should throw error on 413 (file too large)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 413,
        json: () => Promise.resolve({ error: 'File too large' }),
      } as Response);

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

      await expect(transcribeAudio(audioBlob)).rejects.toThrow(
        'Audio file too large (max 10MB)'
      );
    });

    it('should throw error on 429 (rate limit)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'Rate limit exceeded' }),
      } as Response);

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

      await expect(transcribeAudio(audioBlob)).rejects.toThrow(
        'Too many requests. Please wait a moment and try again.'
      );
    });

    it('should throw error on 401 (unauthorized)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      } as Response);

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

      await expect(transcribeAudio(audioBlob)).rejects.toThrow(
        'Authentication required'
      );
    });

    it('should throw error on 503 (service unavailable)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Service unavailable' }),
      } as Response);

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });

      await expect(transcribeAudio(audioBlob)).rejects.toThrow(
        'Transcription service unavailable. Please try again later.'
      );
    });

    it('should handle response with alternative JSON structure', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            text: 'direct text',
            language: 'en',
            duration: 5.2,
          }),
      } as Response);

      const audioBlob = new Blob(['audio data'], { type: 'audio/webm' });
      const result = await transcribeAudio(audioBlob);

      expect(result).toEqual({
        text: 'direct text',
        language: 'en',
        duration: 5.2,
      });
    });
  });

  describe('cancelRecording', () => {
    it('should stop recording and release microphone', async () => {
      await startRecording();
      expect(isRecording()).toBe(true);

      cancelRecording();

      // After cancel, isRecording should be false
      expect(isRecording()).toBe(false);
    });

    it('should do nothing if no recording is active', () => {
      expect(() => cancelRecording()).not.toThrow();
    });
  });

  describe('isRecording', () => {
    it('should return false when not recording', () => {
      expect(isRecording()).toBe(false);
    });

    it('should return true when recording', async () => {
      await startRecording();

      expect(isRecording()).toBe(true);
    });
  });
});
