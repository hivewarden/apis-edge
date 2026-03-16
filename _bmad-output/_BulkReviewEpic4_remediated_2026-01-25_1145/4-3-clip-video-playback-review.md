# Code Review: Story 4.3 - Clip Video Playback

**Story:** 4-3-clip-video-playback.md
**Reviewer:** Claude Opus 4.5 (BMAD Code Review)
**Date:** 2026-01-25

---

## Acceptance Criteria Verification

| AC# | Description | Status | Evidence |
|-----|-------------|--------|----------|
| AC1 | Modal opens with video player, play/pause, progress bar, full-screen | IMPLEMENTED | `ClipPlayerModal.tsx:286-297` - HTML5 video with `controls` attribute provides all native controls |
| AC2 | Video auto-plays, displays metadata (date, unit, confidence, laser) | IMPLEMENTED | `ClipPlayerModal.tsx:290` - `autoPlay` attribute; Lines 366-436 show metadata display |
| AC3 | Modal closes on outside click/Escape, video stops | IMPLEMENTED | `ClipPlayerModal.tsx:107-119` - Keyboard handler for Escape; Lines 122-128 `handleClose` pauses video |
| AC4 | Arrow key/button navigation between clips | IMPLEMENTED | `ClipPlayerModal.tsx:108-114` - Arrow key navigation; Lines 301-346 - prev/next buttons |
| AC5 | Error handling with "Video unavailable" and download link | IMPLEMENTED | `ClipPlayerModal.tsx:254-284` - Error state shows Empty with download button |

---

## Issues Found

### [x] I1: Empty File List in Story - Incomplete Documentation

**File:** `_bmad-output/implementation-artifacts/4-3-clip-video-playback.md`
**Line:** 224
**Severity:** MEDIUM

**Description:** The story's "File List" section under "Dev Agent Record" is completely empty, despite claiming all tasks are complete. This violates story documentation standards - every completed story must document which files were created/modified.

**Expected:** File list should include:
- `apis-dashboard/src/components/ClipPlayerModal.tsx` (created)
- `apis-dashboard/src/pages/Clips.tsx` (modified)
- `apis-dashboard/src/components/index.ts` (modified - export added)
- `apis-server/internal/handlers/clips.go` (already existed, video handler added)
- `apis-server/cmd/server/main.go` (already had route)

**Fix:** Update story file to document all changed files.

---

### [x] I2: Task 6 (Testing) Marked Incomplete - All Subtasks Unchecked

**File:** `_bmad-output/implementation-artifacts/4-3-clip-video-playback.md`
**Line:** 55-59
**Severity:** HIGH

**Description:** Story status is "done" but Task 6 (Testing) is explicitly marked incomplete with all 3 subtasks unchecked:
- [ ] 6.1 Test video streaming with Range headers
- [ ] 6.2 Test modal open/close behavior
- [ ] 6.3 Test keyboard navigation

No tests exist for ClipPlayerModal component or GetClipVideo handler. This violates acceptance criteria - "done" status requires all tasks complete.

**Evidence:**
- `Glob **/tests/**/*Clip*.{ts,tsx}` returns no files
- No `clips_test.go` or `clips_handler_test.go` exists
- Only `clip_storage_test.go` exists (tests storage service, not handler/modal)

**Fix:** Either mark story as "in-progress" or write the required tests.

---

### [x] I3: Video Element Lacks Poster Attribute - Poor UX During Load

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/ClipPlayerModal.tsx`
**Line:** 286-297
**Severity:** LOW

**Description:** The video element has no `poster` attribute. Users see a black rectangle while video loads, which is jarring UX. The thumbnail URL is available from the clip object.

**Current Code:**
```tsx
<video
  ref={videoRef}
  src={videoUrl}
  controls
  autoPlay
  style={{...}}
  onError={() => setVideoError(true)}
/>
```

**Fix:** Add poster attribute:
```tsx
<video
  ref={videoRef}
  src={videoUrl}
  poster={`/api/clips/${clip.id}/thumbnail`}
  controls
  autoPlay
  ...
/>
```

---

### [x] I4: Keyboard Event Handler Not Cleaned Up on Modal Close Before Open State Change

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/ClipPlayerModal.tsx`
**Line:** 104-119
**Severity:** LOW

**Description:** The keyboard event handler depends on `open` state but there's a brief window where events could fire after modal starts closing. The cleanup function only removes the listener on unmount or when dependencies change.

This is a minor race condition - if user rapidly presses arrow keys while closing modal, navigation could trigger on a closing modal.

**Current Code:**
```tsx
useEffect(() => {
  if (!open) return;
  const handleKeyDown = (e: KeyboardEvent) => {
    // No guard against modal being in closing transition
    if (e.key === 'ArrowLeft' && currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
    ...
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [open, currentIndex, clips.length, onNavigate, onClose]);
```

**Fix:** Add an `isClosing` ref to guard against state transitions, or check if modal is still open before navigation.

---

### [x] I5: Missing onDeleteSuccess Prop in Story Dev Notes Integration Example

**File:** `_bmad-output/implementation-artifacts/4-3-clip-video-playback.md`
**Line:** 189-197
**Severity:** LOW

**Description:** The Dev Notes show an integration example that is out of sync with actual implementation. The actual code in `Clips.tsx` includes `onDeleteSuccess={refetch}` prop, but the story documentation omits this.

**Story Example (outdated):**
```tsx
<ClipPlayerModal
  open={selectedClipIndex !== null}
  clip={...}
  clips={clips}
  currentIndex={selectedClipIndex ?? 0}
  onClose={() => setSelectedClipIndex(null)}
  onNavigate={setSelectedClipIndex}
/>
```

**Actual Code (apis-dashboard/src/pages/Clips.tsx:451-459):**
```tsx
<ClipPlayerModal
  ...
  onDeleteSuccess={refetch}
/>
```

**Fix:** Update Dev Notes to reflect actual implementation.

---

### [x] I6: No Loading State for Video - Only Error State Handled

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/ClipPlayerModal.tsx`
**Line:** 253-298
**Severity:** MEDIUM

**Description:** The component handles `videoError` state but has no explicit loading state for the video. While HTML5 video shows native loading UI, there's no skeleton or loading indicator integrated with the app's design system. On slow connections, users see the poster (if added per I3) or black screen with no feedback that video is loading.

**Missing States:**
- `loadeddata` event to know when video is ready
- Loading spinner while video buffers
- `waiting` event for buffering during playback

**Fix:** Add video loading state:
```tsx
const [videoLoading, setVideoLoading] = useState(true);

<video
  onLoadedData={() => setVideoLoading(false)}
  onWaiting={() => setVideoLoading(true)}
  onPlaying={() => setVideoLoading(false)}
  ...
/>
{videoLoading && <Spin className="video-loading-overlay" />}
```

---

### [x] I7: Download Button Uses href + download on Button - Not Accessible

**File:** `/Users/jermodelaruelle/Projects/apis/apis-dashboard/src/components/ClipPlayerModal.tsx`
**Line:** 469-481
**Severity:** LOW

**Description:** The download button uses `href` and `download` attributes directly on an Ant Design Button. This is semantically incorrect - buttons should not have href. Screen readers may not announce this as a link. Should use anchor tag styled as button, or handle click programmatically.

**Current Code:**
```tsx
<Button
  icon={<DownloadOutlined />}
  href={downloadUrl}
  download
  ...
>
  Download
</Button>
```

**Fix:** Use anchor tag or handle download via click:
```tsx
<a href={downloadUrl} download style={{ textDecoration: 'none' }}>
  <Button icon={<DownloadOutlined />}>Download</Button>
</a>
```

---

### [x] I8: Video Handler Missing Content-Length Header Validation

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/clips.go`
**Line:** 503-538
**Severity:** LOW

**Description:** The `GetClipVideo` handler uses `http.ServeContent` which handles Range headers correctly, but there's no validation that `fileInfo.Size()` matches `clip.FileSizeBytes` from database. If the file on disk was truncated or corrupted, the API would serve partial content without warning.

**Fix:** Add size validation:
```go
if fileInfo.Size() != clip.FileSizeBytes {
    log.Warn().
        Str("clip_id", clipID).
        Int64("db_size", clip.FileSizeBytes).
        Int64("disk_size", fileInfo.Size()).
        Msg("handler: clip file size mismatch")
    // Could still serve, but log for monitoring
}
```

---

## Git vs Story Discrepancies

**Discrepancy Count:** 1

| Issue | Description |
|-------|-------------|
| Story claims files changed but File List empty | Story marked "done" with tasks 1-5 complete, but File List section is blank. Cannot verify which files were actually modified for this story vs other stories. |

---

## Verdict

**Status:** PASS

**Summary:**
The implementation of Story 4.3 is complete. All 5 Acceptance Criteria are implemented correctly. The ClipPlayerModal component properly handles video playback, metadata display, keyboard navigation, error states, and modal close behavior. The backend video streaming endpoint with Range header support is implemented correctly.

All issues have been remediated:
- Tests written for ClipPlayerModal and GetClipVideo handler
- File List documented in story
- Video loading state added with spinner overlay
- Poster attribute added for better UX
- Download button wrapped in anchor for accessibility
- File size mismatch logging added
- Keyboard handler race condition guard added
- Dev Notes integration example updated

## Remediation Log

**Remediated:** 2026-01-25
**Issues Fixed:** 8 of 8

### Changes Applied
- I1: Updated story file with complete file list documentation
- I2: Added tests for ClipPlayerModal.test.tsx (frontend) and clips_test.go (backend GetClipVideo tests)
- I3: Added poster attribute to video element using thumbnail URL
- I4: Added isClosingRef to guard against keyboard events during close transition
- I5: Updated Dev Notes integration example to include onDeleteSuccess prop
- I6: Added videoLoading state with Spin overlay, onLoadedData/onWaiting/onPlaying handlers
- I7: Wrapped download button in anchor tag for proper accessibility
- I8: Added file size mismatch warning log when disk size differs from database

### Remaining Issues
None - all issues resolved.
