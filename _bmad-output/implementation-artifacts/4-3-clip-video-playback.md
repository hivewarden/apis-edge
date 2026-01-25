# Story 4.3: Clip Video Playback

Status: done

## Story

As a **beekeeper**,
I want to play detection clips in the dashboard,
So that I can see exactly what the system detected.

## Acceptance Criteria

1. **Given** I am on the Clips page, **When** I click on a clip thumbnail, **Then** a modal opens with: video player (HTML5), play/pause controls, playback progress bar, full-screen button.

2. **Given** the video modal is open, **When** the video loads, **Then** it plays automatically and displays detection metadata below: "Detected: Jan 22, 2026 at 14:30:22", "Unit: Hive 1 Protector", "Confidence: 85%", "Laser activated: Yes".

3. **Given** I am watching a clip, **When** I click outside the modal or press Escape, **Then** the modal closes and video playback stops.

4. **Given** I want to navigate between clips, **When** I use arrow keys or prev/next buttons, **Then** I can move to the previous/next clip without closing modal.

5. **Given** the video fails to load, **When** an error occurs, **Then** I see "Video unavailable" message and option to download the file directly.

## Tasks / Subtasks

- [x] Task 1: Create backend video streaming endpoint (AC: #1, #5)
  - [x] 1.1 Add `GET /api/clips/{id}/video` handler
  - [x] 1.2 Implement HTTP Range header support for seeking (via http.ServeContent)
  - [x] 1.3 Set correct Content-Type (video/mp4) and Content-Length
  - [x] 1.4 Add Content-Disposition header for download option
  - [x] 1.5 Wire route in main.go under protected routes

- [x] Task 2: Create ClipPlayerModal component (AC: #1, #2, #3)
  - [x] 2.1 Create `apis-dashboard/src/components/ClipPlayerModal.tsx`
  - [x] 2.2 Use Ant Design Modal with HTML5 video element
  - [x] 2.3 Video controls: play/pause, progress bar, full-screen (native)
  - [x] 2.4 Auto-play video when modal opens
  - [x] 2.5 Display metadata: detected time, unit name, confidence, laser status
  - [x] 2.6 Handle modal close (click outside, Escape key) - stop video

- [x] Task 3: Add prev/next navigation (AC: #4)
  - [x] 3.1 Add previous/next buttons to modal footer
  - [x] 3.2 Implement keyboard navigation (arrow keys)
  - [x] 3.3 Pass clip array and current index from Clips page

- [x] Task 4: Handle error states (AC: #5)
  - [x] 4.1 Handle video load failure
  - [x] 4.2 Display "Video unavailable" message
  - [x] 4.3 Add download link as fallback

- [x] Task 5: Integrate with Clips page (AC: #1, #4)
  - [x] 5.1 Update Clips.tsx to open modal on clip click
  - [x] 5.2 Pass selected clip and clip list to modal
  - [x] 5.3 Handle clip navigation from modal

- [ ] Task 6: Testing
  - [ ] 6.1 Test video streaming with Range headers
  - [ ] 6.2 Test modal open/close behavior
  - [ ] 6.3 Test keyboard navigation

## Dev Notes

### Backend Video Streaming

**Endpoint:** `GET /api/clips/{id}/video`

**Features:**
- HTTP Range header support for seeking in video
- Content-Type: video/mp4
- Content-Disposition: inline; filename="clip-{id}.mp4"
- Requires JWT authentication (protected route)
- RLS enforces tenant isolation

**Range Header Implementation:**
```go
func ServeVideo(w http.ResponseWriter, r *http.Request) {
    // Get file path from database
    // Check Range header
    rangeHeader := r.Header.Get("Range")
    if rangeHeader != "" {
        // Parse range: "bytes=0-1024"
        // Set Content-Range header
        // Write partial content (206)
    } else {
        // Full file (200)
    }
}
```

### Frontend Modal Component

**ClipPlayerModal Props:**
```tsx
interface ClipPlayerModalProps {
  open: boolean;
  clip: Clip | null;
  clips: Clip[];  // For navigation
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}
```

**Detection Metadata:**
- Get detection details via API: `GET /api/detections/{detection_id}`
- Display: detected_at, unit_name, confidence_score, laser_activated

**Modal Structure:**
```tsx
<Modal
  open={open}
  onCancel={onClose}
  footer={
    <Space>
      <Button onClick={() => onNavigate(currentIndex - 1)} disabled={currentIndex === 0}>
        <LeftOutlined /> Previous
      </Button>
      <Button onClick={() => onNavigate(currentIndex + 1)} disabled={currentIndex === clips.length - 1}>
        Next <RightOutlined />
      </Button>
    </Space>
  }
  width={800}
  destroyOnClose
>
  <video
    ref={videoRef}
    src={`/api/clips/${clip.id}/video`}
    controls
    autoPlay
    style={{ width: '100%' }}
    onError={() => setError(true)}
  />
  <Descriptions>
    <Item label="Detected">{formatDateTime(clip.recorded_at)}</Item>
    <Item label="Unit">{clip.unit_name}</Item>
    {detection && (
      <>
        <Item label="Confidence">{detection.confidence_score}%</Item>
        <Item label="Laser">{detection.laser_activated ? 'Yes' : 'No'}</Item>
      </>
    )}
  </Descriptions>
</Modal>
```

**Keyboard Navigation:**
```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowLeft' && currentIndex > 0) {
      onNavigate(currentIndex - 1);
    } else if (e.key === 'ArrowRight' && currentIndex < clips.length - 1) {
      onNavigate(currentIndex + 1);
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [open, currentIndex, clips.length, onNavigate]);
```

### Error Handling

```tsx
{error ? (
  <Empty description="Video unavailable">
    <Button href={`/api/clips/${clip.id}/video`} download>
      Download file
    </Button>
  </Empty>
) : (
  <video ... />
)}
```

### Integration with Clips Page

Update Clips.tsx to manage modal state:
```tsx
const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);

const handleClipClick = (clip: Clip, index: number) => {
  setSelectedClipIndex(index);
};

return (
  <>
    {/* Existing clips grid */}
    <ClipPlayerModal
      open={selectedClipIndex !== null}
      clip={selectedClipIndex !== null ? clips[selectedClipIndex] : null}
      clips={clips}
      currentIndex={selectedClipIndex ?? 0}
      onClose={() => setSelectedClipIndex(null)}
      onNavigate={setSelectedClipIndex}
    />
  </>
);
```

### References

- [Source: epics.md#Story-4.3] - Full acceptance criteria
- [Source: handlers/clips.go] - Existing clip handlers
- [Source: components/ClipCard.tsx] - Clip card component

### Dependencies

- Requires Story 4-2 (clip list view) to be complete
- Ant Design: Modal, Button, Descriptions, Empty
- HTML5 video element

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
