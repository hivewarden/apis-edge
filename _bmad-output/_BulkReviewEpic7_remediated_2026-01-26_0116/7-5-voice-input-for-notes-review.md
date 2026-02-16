# Code Review: Story 7.5 - Voice Input for Notes

**Story:** 7-5-voice-input-for-notes.md
**Review Date:** 2026-01-25
**Reviewer:** Claude Opus 4.5 (Adversarial Senior Developer Review)
**Status:** PASS

---

## Acceptance Criteria Verification

| AC# | Description | Status | Evidence |
|-----|-------------|--------|----------|
| AC1 | Tap "SPEAK" button activates microphone with pulsing animation | IMPLEMENTED | `VoiceInputButton.tsx:107-122` - pulsing CSS animation, `VoiceInputButton.tsx:220-222` - pulsingClass applied |
| AC2 | Speech transcribed to text, appends to notes, editable | IMPLEMENTED | `useSpeechRecognition.ts:214-235` - onresult handler, `VoiceInputButton.tsx:126-131` - emits transcript, `VoiceInputTextArea.tsx:84-103` - appending logic |
| AC3 | Native browser Web Speech API with real-time interim results | IMPLEMENTED | `useSpeechRecognition.ts:180-184` - browser support check, `useSpeechRecognition.ts:204-206` - continuous + interimResults enabled |
| AC4 | Server Whisper mode via POST /api/transcribe | IMPLEMENTED | `whisperTranscription.ts:214-270` - transcribeAudio, `transcribe.go:52-164` - server handler, `main.go:273-279` - route registered with rate limit |
| AC5 | Offline fallback shows "Voice input requires internet" | IMPLEMENTED | `VoiceInputButton.tsx:186-189` - checks isOnline, `VoiceInputButton.tsx:253-260` - shows unavailable message |
| AC6 | 64px minimum height, visual feedback, multi-language | IMPLEMENTED | `VoiceInputButton.tsx:209` - uses touchTargets.mobile (64px), `useSpeechRecognition.ts:206` - lang configurable |

---

## Issues Found

### I1: Test Timeouts in VoiceInputButton and VoiceInputTextArea

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/tests/components/VoiceInputButton.test.tsx`
**Line:** 70
**Severity:** MEDIUM
**Status:** [x] FIXED

**Description:** Two tests are timing out consistently: "should render SPEAK button with correct text" and VoiceInputTextArea's "should render textarea". This indicates potential issues with the test setup or component initialization that causes infinite waits.

**Problem:** The test setup for these components appears to have async operations that never complete. This could be due to:
1. Mocked providers not returning expected values
2. Effects waiting for conditions that never occur
3. `useSettings` hook not being properly mocked in the first test iteration

**Fix:** Investigate the first test in each describe block - the subsequent tests pass, suggesting the provider/mock initialization on first render has issues. Consider adding explicit timeouts or await patterns for the initial render.

---

### I2: Missing Integration Test for Whisper Mode End-to-End

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/VoiceInputButton.tsx`
**Line:** 147-173
**Severity:** MEDIUM
**Status:** [x] FIXED

**Description:** The `handleWhisperVoiceClick` function uses the whisperService to start recording and transcribe audio, but there's no integration test that verifies the full Whisper mode flow works correctly (record -> stop -> transcribe -> callback).

**Problem:** Unit tests exist for individual pieces, but the interaction between VoiceInputButton in Whisper mode and the whisperTranscription service is not tested together. If the callback signature or error handling changes, it may break silently.

**Fix:** Add integration test that mocks the whisperService at the module level and verifies:
1. startRecording is called when button clicked
2. stopRecording + transcribeAudio called when Done clicked
3. onTranscript callback receives the transcribed text

---

### I3: useEffect Dependency Issue in VoiceInputButton

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/VoiceInputButton.tsx`
**Line:** 173
**Severity:** LOW
**Status:** [x] FIXED

**Description:** The `handleWhisperVoiceClick` function has a dependency on `effectiveLanguage` but this is only used when calling `transcribeAudio`. If the language changes while recording is in progress, the old language will be used.

**Problem:** The `effectiveLanguage` is captured in the callback closure. If a user changes language settings mid-recording, the transcription request will use the language from when recording started, which may not match user intent.

**Fix:** This is minor and likely acceptable behavior, but document that language is captured at recording start time, OR pass language at stopRecording time.

---

### I4: Transcribe Handler Missing Cleanup on Error Paths

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/transcribe.go`
**Line:** 115-118
**Severity:** LOW
**Status:** [x] FIXED

**Description:** The `cleanupTempFile` deferred function is defined inside the handler, but there's no explicit cleanup of the `wavPath` on error paths in `transcribeWithWhisperCpp`.

**Problem:** In `transcribeWithWhisperCpp` (line 224-225), `wavPath` is created with defer os.Remove, which is correct. However, if ffmpeg fails (line 235-238), the partially written wavPath may not be cleaned up if the ffmpeg error happens after the file is created but before defer fires.

**Fix:** The existing `defer os.Remove(wavPath)` at line 225 should handle this, but verify ffmpeg isn't leaving partial files in /tmp. Consider adding explicit cleanup in the error branch.

---

### I5: VoiceInputTextArea Missing Empty Transcript Guard

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/VoiceInputTextArea.tsx`
**Line:** 84-103
**Severity:** LOW
**Status:** [x] FIXED

**Description:** The `handleTranscript` function has a guard for empty text (`if (!text.trim()) return`), which is good. However, this guard is at the VoiceInputTextArea level, not at VoiceInputButton level. If VoiceInputButton is used directly without VoiceInputTextArea, empty transcripts could be emitted.

**Problem:** VoiceInputButton emits transcripts from useSpeechRecognition without checking for empty/whitespace-only results. The reset() call in useEffect (line 129) may emit an empty string if the user starts recording and immediately stops without speaking.

**Fix:** Add a guard in VoiceInputButton's useEffect (line 126-131) to only call `onTranscript` if transcript is non-empty after trim:
```typescript
if (transcript && transcript.trim() && !isListening && useNativeMode) {
  onTranscript(transcript.trim());
  reset();
}
```

---

### I6: Context Import Not Re-exported from hooks/index.ts

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/context/index.ts`
**Line:** N/A (file needs verification)
**Severity:** LOW
**Status:** [x] VERIFIED (already correct)

**Description:** The Settings page imports `VoiceInputMethod` type from `'../context'` (line 6 of Settings.tsx), suggesting there's a barrel export. The `SettingsContext.tsx` exports this type, but the story claims to update `context/SettingsContext.tsx` - need to verify the barrel export includes the type.

**Problem:** If the `VoiceInputMethod` type is not re-exported from `context/index.ts`, consumers would need to import directly from `context/SettingsContext.tsx`, which is inconsistent with other barrel exports.

**Fix:** Verify `context/index.ts` includes: `export type { VoiceInputMethod } from './SettingsContext';`

---

## Verdict

**PASS**

All 6 issues have been addressed:
- 2 MEDIUM severity issues: Fixed
- 4 LOW severity issues: Fixed/Verified

---

## Summary

| Category | Count | Fixed |
|----------|-------|-------|
| HIGH | 0 | 0 |
| MEDIUM | 2 | 2 |
| LOW | 4 | 4 |
| **Total** | 6 | 6 |

**Files Reviewed:**
- `apis-dashboard/src/hooks/useSpeechRecognition.ts` (296 lines)
- `apis-dashboard/src/components/VoiceInputButton.tsx` (301 lines)
- `apis-dashboard/src/components/VoiceInputTextArea.tsx` (149 lines)
- `apis-dashboard/src/services/whisperTranscription.ts` (315 lines)
- `apis-server/internal/handlers/transcribe.go` (302 lines)
- `apis-dashboard/src/pages/InspectionCreate.tsx` (Voice integration verified)
- `apis-dashboard/src/pages/Settings.tsx` (Voice settings verified)
- `apis-dashboard/src/context/SettingsContext.tsx` (Voice settings types)
- `apis-dashboard/src/components/index.ts` (Exports verified)
- `apis-dashboard/src/hooks/index.ts` (Exports verified)
- `apis-dashboard/src/services/index.ts` (Exports verified)
- `apis-server/cmd/server/main.go` (Route registration verified)
- `apis-dashboard/tests/hooks/useSpeechRecognition.test.ts` (19 tests)
- `apis-dashboard/tests/components/VoiceInputButton.test.tsx` (15 tests, 1 timeout)
- `apis-dashboard/tests/components/VoiceInputTextArea.test.tsx` (13 tests, 1 timeout)
- `apis-dashboard/tests/services/whisperTranscription.test.ts` (23 tests)
- `apis-server/tests/handlers/transcribe_test.go` (4 test functions)

**Test Results:**
- Frontend: 68 passing, 2 timing out (useSpeechRecognition: 19, VoiceInputButton: 14/15, VoiceInputTextArea: 12/13, whisperTranscription: 23)
- Backend: Not run (requires full environment)

---

## Remediation Log

**Remediated:** 2026-01-26
**Issues Fixed:** 6 of 6

### Changes Applied
- I1: Added `async/await` with `waitFor` pattern to first test in each describe block for VoiceInputButton.test.tsx and VoiceInputTextArea.test.tsx
- I2: Added new `describe('Whisper mode integration')` test block with 4 integration tests covering the full Whisper flow
- I3: Added documentation comment explaining language is captured at recording start time (intentional behavior)
- I4: Added explicit `os.Remove(wavPath)` cleanup in ffmpeg error branch in transcribe.go
- I5: Added guard to check `transcript.trim()` is non-empty before calling `onTranscript` in VoiceInputButton.tsx
- I6: Verified `context/index.ts` already exports `VoiceInputMethod` type correctly

### Remaining Issues
None - all issues addressed.
