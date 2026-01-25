# Story 7.5: Voice Input for Notes

Status: done

## Story

As a **beekeeper**,
I want to dictate notes instead of typing,
So that I can record observations without removing my gloves.

## Acceptance Criteria

1. **Given** I am on a notes field (inspection, hive notes, or any text input) **When** I tap the "SPEAK" button **Then**:
   - The microphone activates
   - I see a visual indicator that it's listening (pulsing animation)
   - The button shows "Listening..." state

2. **Given** I am speaking **When** I pause or tap "Done" **Then**:
   - My speech is transcribed to text
   - The text appears in the notes field (appending to existing text if any)
   - I can edit the transcribed text manually

3. **Given** browser SpeechRecognition is available **When** I use voice input **Then**:
   - It uses the native browser API (Web Speech API)
   - Works in real-time with interim results shown
   - Zero additional latency

4. **Given** I want higher accuracy transcription **When** I select "Server Whisper" in settings **Then**:
   - Audio is recorded and sent to `POST /api/transcribe`
   - Whisper model transcribes it server-side
   - Text is returned with higher accuracy (slight delay acceptable)

5. **Given** I am offline and native speech unavailable **When** I tap voice button **Then**:
   - I see "Voice input requires internet connection"
   - Keyboard input is offered as fallback
   - The button does not attempt to activate microphone

6. **Given** I am using the voice input component **When** I interact with it **Then**:
   - The SPEAK button is 64px minimum height for glove-friendly use
   - Visual feedback shows listening/processing states clearly
   - Multiple languages are supported if the browser supports them

## Tasks / Subtasks

### Task 1: Create VoiceInputButton Component (AC: #1, #2, #6)
- [x] 1.1 Create `apis-dashboard/src/components/VoiceInputButton.tsx`
- [x] 1.2 Implement props: `{ onTranscript, disabled, placeholder, language? }`
- [x] 1.3 Add "SPEAK" button with microphone icon, 64px minimum height
- [x] 1.4 Add "Keyboard" secondary button option (uses EditOutlined icon)
- [x] 1.5 Implement listening state with pulsing animation
- [x] 1.6 Implement "Done" button that appears during recording
- [x] 1.7 Show interim transcript preview during speech
- [x] 1.8 Style with APIS theme colors (seaBuckthorn for active state)

### Task 2: Create useSpeechRecognition Hook (AC: #3, #5)
- [x] 2.1 Create `apis-dashboard/src/hooks/useSpeechRecognition.ts`
- [x] 2.2 Check for browser support: `'SpeechRecognition' in window || 'webkitSpeechRecognition' in window`
- [x] 2.3 Create recognition instance with proper configuration
- [x] 2.4 Handle `onresult` event for interim and final transcripts
- [x] 2.5 Handle `onerror` event (no-speech, audio-capture, network, etc.)
- [x] 2.6 Handle `onend` event to clean up and report final result
- [x] 2.7 Support continuous mode for longer dictation
- [x] 2.8 Return `{ isSupported, isListening, transcript, interimTranscript, start, stop, error, reset }`
- [x] 2.9 Accept `language` prop (default: `navigator.language`)

### Task 3: Create WhisperTranscription Service (AC: #4)
- [x] 3.1 Create `apis-dashboard/src/services/whisperTranscription.ts`
- [x] 3.2 Implement audio recording using MediaRecorder API
- [x] 3.3 Record audio as WebM/Opus format (good compression)
- [x] 3.4 Limit recording to 60 seconds maximum
- [x] 3.5 Implement `transcribeAudio(blob: Blob): Promise<TranscriptionResult>`
- [x] 3.6 POST audio to `/api/transcribe` endpoint with auth token
- [x] 3.7 Handle errors (network, server, timeout, rate limit)
- [x] 3.8 Export `{ startRecording, stopRecording, transcribeAudio, isRecording, cancelRecording, isAudioRecordingSupported }`

### Task 4: Create Server Transcription Endpoint (AC: #4)
- [x] 4.1 Create `apis-server/internal/handlers/transcribe.go`
- [x] 4.2 Handle `POST /api/transcribe` - accepts audio file upload
- [x] 4.3 Validate audio format (accept WebM, WAV, MP3, OGG)
- [x] 4.4 Limit upload size to 10MB
- [x] 4.5 Integrate with Whisper API (OpenAI Whisper or local whisper.cpp)
- [x] 4.6 Return `{ data: { text: string, language?: string, duration?: number } }`
- [x] 4.7 Add rate limiting (10 requests/minute per user)
- [x] 4.8 Register route in main.go router

### Task 5: Add Voice Settings to Settings Page (AC: #4, #5)
- [x] 5.1 Add "Voice Input" section to Settings page
- [x] 5.2 Add transcription method selector: "Auto", "Native (Browser)", "Server (Whisper)"
- [x] 5.3 Store preference in localStorage via SettingsContext
- [x] 5.4 Add language selector for speech recognition
- [x] 5.5 Show browser support status (check if SpeechRecognition available)
- [x] 5.6 Add "Test Microphone" button to verify setup

### Task 6: Integrate VoiceInputButton into InspectionCreate (AC: #1, #2, #6)
- [x] 6.1 Import VoiceInputButton into InspectionCreate.tsx
- [x] 6.2 Add voice button below notes TextArea on the "Notes" step
- [x] 6.3 Layout: TextArea above, VoiceInputButton below (SPEAK | Keyboard)
- [x] 6.4 Connect `onTranscript` to append text to inspection.notes
- [x] 6.5 Disable voice button when offline if using Whisper mode

### Task 7: Create VoiceInputTextArea Composite Component (AC: #1, #2, #6)
- [x] 7.1 Create `apis-dashboard/src/components/VoiceInputTextArea.tsx`
- [x] 7.2 Combine TextArea + VoiceInputButton in reusable pattern
- [x] 7.3 Props: `{ value, onChange, placeholder, rows, maxLength, showCount, disabled, language, voicePlaceholder }`
- [x] 7.4 Handle voice transcript appending with proper spacing
- [x] 7.5 Support controlled mode with value/onChange
- [x] 7.6 Match existing TextArea styling from InspectionCreate

### Task 8: Create Tests (AC: #1-6)
- [x] 8.1 Create `tests/hooks/useSpeechRecognition.test.ts` (19 tests)
- [x] 8.2 Create `tests/components/VoiceInputButton.test.tsx` (15 tests)
- [x] 8.3 Create `tests/components/VoiceInputTextArea.test.tsx` (13 tests)
- [x] 8.4 Create `tests/services/whisperTranscription.test.ts` (23 tests)
- [x] 8.5 Create `apis-server/tests/handlers/transcribe_test.go`
- [x] 8.6 Test browser support detection
- [x] 8.7 Test offline fallback behavior
- [x] 8.8 Test transcript appending logic
- [x] 8.9 All frontend tests pass with `npm test` (70 tests passing)

### Task 9: Documentation & Export Cleanup (AC: #1-6)
- [x] 9.1 Export VoiceInputButton from `components/index.ts`
- [x] 9.2 Export VoiceInputTextArea from `components/index.ts`
- [x] 9.3 Export useSpeechRecognition from `hooks/index.ts`
- [x] 9.4 Export whisperTranscription from `services/index.ts`
- [x] 9.5 Add JSDoc comments to all public APIs
- [x] 9.6 Update Settings context types with VoiceInputMethod type

## Dev Notes

### Architecture Patterns

**Voice Input Strategy (from UX Design Specification):**
```
Settings -> Voice Input
+------------------------------------------+
| Voice Transcription                      |
+------------------------------------------+
| o Native (iOS/Android dictation)         |
|   Lightweight, requires signal           |
|                                          |
| o Server (APIS Whisper)                  |
|   Best accuracy, requires server         |
+------------------------------------------+
```

**Voice UI Component Layout (from UX spec):**
```
+------------------------------------+
|  Notes                             |
|  +------------------------------+  |
|  | Queen seen on frame 4,       |  |
|  | good laying pattern...       |  |
|  +------------------------------+  |
|                                    |
|  +------------+  +--------------+  |
|  |  SPEAK     |  |   Keyboard   |  |  <- Voice button prominent
|  +------------+  +--------------+  |
+------------------------------------+
```

**Technical Stack (from Architecture):**
- Voice Input: Whisper (server-side) + Browser SpeechRecognition
- PWA: Service Worker + Dexie.js (IndexedDB) for offline
- Frontend: React + Refine + Ant Design

### useSpeechRecognition Hook Implementation Pattern

```typescript
// src/hooks/useSpeechRecognition.ts
import { useState, useCallback, useRef, useEffect } from 'react';

// TypeScript declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
  length: number;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

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

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

export interface UseSpeechRecognitionResult {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(
  language: string = navigator.language
): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const start = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition not supported');
      return;
    }

    setError(null);
    setInterimTranscript('');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript);
      }
      setInterimTranscript(interimText);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorMessages: Record<string, string> = {
        'no-speech': 'No speech detected. Please try again.',
        'audio-capture': 'No microphone found. Please check your settings.',
        'not-allowed': 'Microphone access denied. Please allow access.',
        'network': 'Network error. Please check your connection.',
        'aborted': 'Recording was stopped.',
      };
      setError(errorMessages[event.error] || `Error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, language]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

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
```

### VoiceInputButton Component Pattern

```typescript
// src/components/VoiceInputButton.tsx
import React, { useState, useEffect } from 'react';
import { Button, Space, Typography, Tooltip, Spin } from 'antd';
import { AudioOutlined, AudioMutedOutlined, KeyboardOutlined, CheckOutlined } from '@ant-design/icons';
import { colors, touchTargets } from '../theme/apisTheme';
import { useSpeechRecognition } from '../hooks';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useSettings } from '../context';

const { Text } = Typography;

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  language?: string;
  showKeyboardButton?: boolean;
  onKeyboardClick?: () => void;
}

export function VoiceInputButton({
  onTranscript,
  disabled = false,
  placeholder = 'Tap to speak...',
  language,
  showKeyboardButton = true,
  onKeyboardClick,
}: VoiceInputButtonProps): React.ReactElement {
  const isOnline = useOnlineStatus();
  const { voiceInputMethod } = useSettings();
  const [isRecordingWhisper, setIsRecordingWhisper] = useState(false);

  const {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  } = useSpeechRecognition(language);

  // When transcript changes and we're not listening, emit it
  useEffect(() => {
    if (transcript && !isListening) {
      onTranscript(transcript);
      reset();
    }
  }, [transcript, isListening, onTranscript, reset]);

  const handleVoiceClick = () => {
    if (disabled) return;

    // Check if native speech is available
    if (voiceInputMethod === 'native' || voiceInputMethod === 'auto') {
      if (!isSupported) {
        // Fallback message
        return;
      }

      if (isListening) {
        stop();
      } else {
        start();
      }
    } else if (voiceInputMethod === 'whisper') {
      // Whisper mode - will be implemented in Task 3
      if (!isOnline) {
        return;
      }
      // Toggle recording state
      setIsRecordingWhisper(!isRecordingWhisper);
    }
  };

  const isActive = isListening || isRecordingWhisper;
  const canUseVoice = isSupported || (voiceInputMethod === 'whisper' && isOnline);
  const showUnavailableMessage = !canUseVoice && !isOnline;

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

  // Pulsing animation for listening state
  const pulsingStyle: React.CSSProperties = isActive ? {
    animation: 'pulse 1.5s ease-in-out infinite',
  } : {};

  return (
    <div>
      {/* Interim transcript preview */}
      {(interimTranscript || isActive) && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            borderRadius: 8,
            backgroundColor: 'rgba(247, 164, 45, 0.1)',
            border: `1px solid ${colors.seaBuckthorn}`,
            minHeight: 48,
          }}
        >
          <Text style={{ color: colors.brownBramble }}>
            {interimTranscript || (isActive ? placeholder : '')}
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
      {showUnavailableMessage && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Voice input requires internet connection
        </Text>
      )}

      {/* Buttons */}
      <Space style={{ width: '100%' }} size={12}>
        <Tooltip title={!canUseVoice ? 'Voice input unavailable' : ''}>
          <Button
            style={{ ...buttonStyle, ...pulsingStyle, flex: 1 }}
            icon={isActive ? <AudioMutedOutlined /> : <AudioOutlined />}
            onClick={handleVoiceClick}
            disabled={disabled || !canUseVoice}
            size="large"
          >
            {isActive ? 'Done' : 'SPEAK'}
          </Button>
        </Tooltip>

        {showKeyboardButton && (
          <Button
            style={{ ...buttonStyle, flex: 1, backgroundColor: undefined, borderColor: undefined, color: undefined }}
            icon={<KeyboardOutlined />}
            onClick={onKeyboardClick}
            disabled={disabled}
            size="large"
          >
            Keyboard
          </Button>
        )}
      </Space>

      {/* Pulsing animation CSS */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(247, 164, 45, 0.4); }
          50% { transform: scale(1.02); box-shadow: 0 0 0 8px rgba(247, 164, 45, 0); }
        }
      `}</style>
    </div>
  );
}

export default VoiceInputButton;
```

### VoiceInputTextArea Composite Pattern

```typescript
// src/components/VoiceInputTextArea.tsx
import React, { useState, useRef } from 'react';
import { Input, Space } from 'antd';
import { VoiceInputButton } from './VoiceInputButton';

const { TextArea } = Input;

interface VoiceInputTextAreaProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  showCount?: boolean;
  disabled?: boolean;
  language?: string;
}

export function VoiceInputTextArea({
  value = '',
  onChange,
  placeholder = 'Enter your notes here...',
  rows = 6,
  maxLength = 2000,
  showCount = true,
  disabled = false,
  language,
}: VoiceInputTextAreaProps): React.ReactElement {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);

  const handleTranscript = (text: string) => {
    // Append transcript to existing value with proper spacing
    const newValue = value
      ? `${value}${value.endsWith(' ') ? '' : ' '}${text}`
      : text;
    onChange?.(newValue);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e.target.value);
  };

  const handleKeyboardClick = () => {
    setShowKeyboard(true);
    // Focus the textarea
    setTimeout(() => {
      textAreaRef.current?.focus();
    }, 100);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <TextArea
        ref={textAreaRef}
        value={value}
        onChange={handleTextChange}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        showCount={showCount}
        disabled={disabled}
        style={{ fontSize: 16 }}
      />

      <VoiceInputButton
        onTranscript={handleTranscript}
        disabled={disabled}
        language={language}
        showKeyboardButton={true}
        onKeyboardClick={handleKeyboardClick}
      />
    </Space>
  );
}

export default VoiceInputTextArea;
```

### Whisper Transcription Service Pattern

```typescript
// src/services/whisperTranscription.ts
import { apiClient } from '../providers/apiClient';

const MAX_RECORDING_SECONDS = 60;
const AUDIO_MIME_TYPE = 'audio/webm;codecs=opus';

interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let recordingTimeout: NodeJS.Timeout | null = null;

export async function startRecording(): Promise<void> {
  // Request microphone access
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  audioChunks = [];
  mediaRecorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)
      ? AUDIO_MIME_TYPE
      : 'audio/webm',
  });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };

  mediaRecorder.start(1000); // Collect data every second

  // Auto-stop after max duration
  recordingTimeout = setTimeout(() => {
    stopRecording();
  }, MAX_RECORDING_SECONDS * 1000);
}

export function stopRecording(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) {
      reject(new Error('No recording in progress'));
      return;
    }

    if (recordingTimeout) {
      clearTimeout(recordingTimeout);
      recordingTimeout = null;
    }

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: AUDIO_MIME_TYPE });

      // Stop all tracks to release microphone
      mediaRecorder?.stream.getTracks().forEach(track => track.stop());
      mediaRecorder = null;
      audioChunks = [];

      resolve(audioBlob);
    };

    mediaRecorder.stop();
  });
}

export async function transcribeAudio(
  audioBlob: Blob,
  authToken: string
): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Transcription failed' }));
    throw new Error(error.error || 'Transcription failed');
  }

  const result = await response.json();
  return {
    text: result.data.text,
    language: result.data.language,
    duration: result.data.duration,
  };
}

export function isRecording(): boolean {
  return mediaRecorder !== null && mediaRecorder.state === 'recording';
}

export function cancelRecording(): void {
  if (mediaRecorder) {
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    mediaRecorder = null;
    audioChunks = [];
  }
  if (recordingTimeout) {
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
  }
}
```

### Server Transcription Handler Pattern (Go)

```go
// internal/handlers/transcribe.go
package handlers

import (
    "encoding/json"
    "io"
    "net/http"
    "os"
    "os/exec"
    "path/filepath"
    "time"

    "github.com/rs/zerolog/log"
)

const maxUploadSize = 10 << 20 // 10 MB

type TranscribeResponse struct {
    Text     string  `json:"text"`
    Language string  `json:"language,omitempty"`
    Duration float64 `json:"duration,omitempty"`
}

// Transcribe handles POST /api/transcribe
// Accepts audio file upload and returns transcribed text
func (h *Handler) Transcribe(w http.ResponseWriter, r *http.Request) {
    // Limit upload size
    r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

    if err := r.ParseMultipartForm(maxUploadSize); err != nil {
        respondError(w, "File too large (max 10MB)", http.StatusBadRequest)
        return
    }

    file, header, err := r.FormFile("audio")
    if err != nil {
        respondError(w, "No audio file provided", http.StatusBadRequest)
        return
    }
    defer file.Close()

    // Validate content type
    contentType := header.Header.Get("Content-Type")
    validTypes := []string{"audio/webm", "audio/wav", "audio/mp3", "audio/mpeg", "audio/ogg"}
    valid := false
    for _, t := range validTypes {
        if contentType == t {
            valid = true
            break
        }
    }
    if !valid && contentType != "" {
        // Accept if no content-type (browsers sometimes don't set it correctly)
        log.Warn().Str("content_type", contentType).Msg("Unusual audio content type, proceeding")
    }

    // Save to temp file
    tempFile, err := os.CreateTemp("", "transcribe-*.webm")
    if err != nil {
        log.Error().Err(err).Msg("Failed to create temp file")
        respondError(w, "Internal server error", http.StatusInternalServerError)
        return
    }
    defer os.Remove(tempFile.Name())
    defer tempFile.Close()

    if _, err := io.Copy(tempFile, file); err != nil {
        log.Error().Err(err).Msg("Failed to save audio file")
        respondError(w, "Failed to process audio", http.StatusInternalServerError)
        return
    }

    // Run Whisper transcription
    // This example uses whisper.cpp CLI - adjust for your setup
    text, err := transcribeWithWhisper(tempFile.Name())
    if err != nil {
        log.Error().Err(err).Msg("Whisper transcription failed")
        respondError(w, "Transcription failed", http.StatusInternalServerError)
        return
    }

    response := TranscribeResponse{
        Text: text,
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]any{
        "data": response,
    })
}

func transcribeWithWhisper(audioPath string) (string, error) {
    // Option 1: Use whisper.cpp CLI
    // cmd := exec.Command("whisper", "-m", "/path/to/model.bin", "-f", audioPath, "--output-txt")

    // Option 2: Use OpenAI Whisper API
    // This is a placeholder - implement based on your Whisper setup

    // For now, use whisper.cpp which should be installed on the server
    whisperPath := os.Getenv("WHISPER_PATH")
    if whisperPath == "" {
        whisperPath = "whisper" // Assume in PATH
    }

    modelPath := os.Getenv("WHISPER_MODEL")
    if modelPath == "" {
        modelPath = "/opt/whisper/models/ggml-base.en.bin"
    }

    // Convert to WAV if needed (whisper.cpp prefers WAV)
    wavPath := audioPath + ".wav"
    ffmpegCmd := exec.Command("ffmpeg", "-i", audioPath, "-ar", "16000", "-ac", "1", wavPath)
    if err := ffmpegCmd.Run(); err != nil {
        return "", err
    }
    defer os.Remove(wavPath)

    // Run whisper
    cmd := exec.Command(whisperPath, "-m", modelPath, "-f", wavPath, "-nt")
    cmd.Timeout = 30 * time.Second

    output, err := cmd.Output()
    if err != nil {
        return "", err
    }

    return string(output), nil
}
```

### Settings Context Update

Add to existing SettingsContext:

```typescript
// In src/context/SettingsContext.tsx - add to existing interface
interface Settings {
  // ... existing settings
  voiceInputMethod: 'auto' | 'native' | 'whisper';
  voiceLanguage: string;
}

// Add defaults
const defaultSettings: Settings = {
  // ... existing defaults
  voiceInputMethod: 'auto',
  voiceLanguage: navigator.language || 'en-US',
};
```

### Existing Code to Reuse

**DO NOT RECREATE - Import these from previous stories:**

| Module | Import From | Purpose |
|--------|-------------|---------|
| `useOnlineStatus` | `src/hooks/useOnlineStatus.ts` | Detect online/offline status |
| `useSettings` | `src/context/SettingsContext.tsx` | Get/set voice preferences |
| `colors` | `src/theme/apisTheme.ts` | Theme colors |
| `touchTargets` | `src/theme/apisTheme.ts` | 64px touch target constants |
| `apiClient` | `src/providers/apiClient.ts` | API calls with auth |
| `useAuth` | `src/hooks/useAuth.ts` | Get auth token for Whisper API |

### File Structure

**Files to create:**
- `apis-dashboard/src/hooks/useSpeechRecognition.ts` - Web Speech API hook
- `apis-dashboard/src/components/VoiceInputButton.tsx` - Main voice button
- `apis-dashboard/src/components/VoiceInputTextArea.tsx` - Composite component
- `apis-dashboard/src/services/whisperTranscription.ts` - Whisper API service
- `apis-server/internal/handlers/transcribe.go` - Server transcription endpoint
- `apis-dashboard/tests/hooks/useSpeechRecognition.test.ts`
- `apis-dashboard/tests/components/VoiceInputButton.test.tsx`
- `apis-dashboard/tests/components/VoiceInputTextArea.test.tsx`
- `apis-dashboard/tests/services/whisperTranscription.test.ts`
- `apis-server/tests/handlers/transcribe_test.go`

**Files to modify:**
- `apis-dashboard/src/pages/InspectionCreate.tsx` - Add voice input to notes
- `apis-dashboard/src/pages/Settings.tsx` - Add voice settings section
- `apis-dashboard/src/context/SettingsContext.tsx` - Add voice settings
- `apis-dashboard/src/components/index.ts` - Export new components
- `apis-dashboard/src/hooks/index.ts` - Export new hook
- `apis-dashboard/src/services/index.ts` - Export new service
- `apis-server/cmd/server/main.go` - Register transcribe route

### Theme Colors Reference

```typescript
// From src/theme/apisTheme.ts
seaBuckthorn: '#f7a42d'  // Primary gold - active/recording state
coconutCream: '#fbf9e7'  // Background
brownBramble: '#662604'  // Text
salomie: '#fcd483'       // Cards/surfaces
```

### Touch Target Reference

```typescript
// From src/theme/apisTheme.ts
touchTargets = {
  standard: 48,   // Standard touch target
  mobile: 64,     // Glove-friendly (required for this story)
  gap: 16,        // Minimum gap between targets
}
```

### API Endpoint Requirements

**POST `/api/transcribe`** - Server-side Whisper transcription
- Request: `multipart/form-data` with `audio` file
- Response: `{ data: { text: string, language?: string, duration?: number } }`
- Auth: Bearer token required
- Limits: 10MB max file size, 60s max audio
- Rate limit: 10 requests/minute per user
- Supported formats: WebM, WAV, MP3, OGG

### Testing Strategy

**Unit Tests:**
1. `useSpeechRecognition.test.ts`:
   - Test browser support detection
   - Test start/stop functionality (mock SpeechRecognition)
   - Test error handling for various error types
   - Test transcript accumulation

2. `VoiceInputButton.test.tsx`:
   - Test button renders with correct text
   - Test disabled state
   - Test listening state visual feedback
   - Test offline fallback message

3. `VoiceInputTextArea.test.tsx`:
   - Test transcript appending with spacing
   - Test keyboard button focus behavior
   - Test controlled/uncontrolled modes

4. `whisperTranscription.test.ts`:
   - Test recording start/stop
   - Test audio blob creation
   - Test API call with auth token

5. `transcribe_test.go`:
   - Test file size limits
   - Test invalid content types
   - Test successful transcription

**Manual Testing Checklist:**
1. Open InspectionCreate page, navigate to Notes step
2. Tap "SPEAK" button - verify microphone permission prompt
3. Speak some text - verify interim transcript shows
4. Tap "Done" - verify text appends to textarea
5. Test with gloves (or simulate by using only palm touches)
6. Toggle offline in DevTools - verify "requires internet" message
7. Test Whisper mode in settings - verify server upload works
8. Test on mobile device (iOS Safari, Android Chrome)

### Previous Story Intelligence

**From Story 7-4 (Automatic Background Sync):**
- `useOnlineStatus` hook detects online/offline transitions
- `BackgroundSyncContext` for global sync state
- Existing toast notification patterns via Ant Design
- 64px touch targets used consistently

**Key Learnings from Epic 7:**
- IndexedDB via Dexie.js for offline storage
- Service Worker caching for app shell
- SyncStatus component pattern for status indicators
- OfflineBanner component for offline messaging

### Project Structure Notes

- All hooks in `apis-dashboard/src/hooks/`
- All components in `apis-dashboard/src/components/`
- All services in `apis-dashboard/src/services/`
- All tests in `apis-dashboard/tests/` (not co-located)
- Server handlers in `apis-server/internal/handlers/`
- Export new modules from barrel files (`index.ts`)

### References

- [Source: ux-design-specification.md#Voice-Input-Strategy] - Voice UI design
- [Source: ux-design-specification.md#Design-Constraints] - 64px touch targets
- [Source: architecture.md#Technology-Stack] - Voice: Whisper + Web Speech API
- [Source: epics.md#Story-7.5] - Full acceptance criteria with BDD scenarios
- [Source: apisTheme.ts] - touchTargets constants
- [Source: InspectionCreate.tsx] - Notes field integration point

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Fixed KeyboardOutlined icon not existing in @ant-design/icons - replaced with EditOutlined
- Fixed useSpeechRecognition tests failing due to vi.stubGlobal(undefined) - used delete window property instead
- Fixed VoiceInputButton tests failing due to import hoisting - moved vi.mock() before imports
- Fixed VoiceInputTextArea tests - inlined mock factory to avoid hoisting issues
- Fixed whisperTranscription tests - used DOMException constructor for proper error type matching

### Completion Notes List

- All 9 tasks completed
- 70 frontend tests passing (useSpeechRecognition: 19, VoiceInputButton: 15, VoiceInputTextArea: 13, whisperTranscription: 23)
- Server transcription handler created with rate limiting
- VoiceInputButton integrated into InspectionCreate notes step
- Settings page updated with Voice Input section

### Change Log

- [2026-01-25] Implementation: Completed all tasks for Story 7-5 Voice Input for Notes
- [2026-01-25] All frontend tests passing (70 tests)
- [2026-01-25] Remediation: Fixed 6 code review issues (H2, H3, M1, L1, L2, L3)

### File List

**Created:**
- `apis-dashboard/src/hooks/useSpeechRecognition.ts`
- `apis-dashboard/src/components/VoiceInputButton.tsx`
- `apis-dashboard/src/components/VoiceInputTextArea.tsx`
- `apis-dashboard/src/services/whisperTranscription.ts`
- `apis-server/internal/handlers/transcribe.go`
- `apis-dashboard/tests/hooks/useSpeechRecognition.test.ts`
- `apis-dashboard/tests/components/VoiceInputButton.test.tsx`
- `apis-dashboard/tests/components/VoiceInputTextArea.test.tsx`
- `apis-dashboard/tests/services/whisperTranscription.test.ts`
- `apis-server/tests/handlers/transcribe_test.go`

**Modified:**
- `apis-dashboard/src/pages/InspectionCreate.tsx` - Added VoiceInputButton to notes step
- `apis-dashboard/src/pages/Settings.tsx` - Added Voice Input settings section
- `apis-dashboard/src/context/SettingsContext.tsx` - Added voice settings (voiceInputMethod, voiceLanguage)
- `apis-dashboard/src/components/index.ts` - Exported new components
- `apis-dashboard/src/hooks/index.ts` - Exported useSpeechRecognition
- `apis-dashboard/src/services/index.ts` - Exported whisperTranscription functions
- `apis-server/cmd/server/main.go` - Registered /api/transcribe route with rate limiting

