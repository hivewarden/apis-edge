# Story 4.1: Clip Upload & Storage

Status: ready-for-dev

## Story

As an **APIS unit**,
I want to upload detection clips to the server,
So that beekeepers can review what the system detected.

## Acceptance Criteria

1. **Given** a unit has recorded a detection clip, **When** it sends `POST /api/units/{id}/clips` with multipart form data (`file`: MP4 video ≤10MB, `detection_id`: UUID of detection, `recorded_at`: ISO timestamp), **Then** the server stores the file in the clips directory, generates a thumbnail from the first frame, creates a `clips` database record, and responds with HTTP 201 and clip ID.

2. **Given** the server receives a clip, **When** it processes the upload, **Then** it validates the file is valid MP4, rejects files larger than 10MB with 413 Payload Too Large, and stores files organized by: `clips/{tenant_id}/{site_id}/{YYYY-MM}/{filename}`.

3. **Given** thumbnail generation fails, **When** the upload completes, **Then** a placeholder thumbnail is used, the clip is still saved successfully, and an error is logged for investigation.

4. **Given** a unit is offline, **When** it comes back online, **Then** it uploads queued clips in order (oldest first), and server accepts clips with `recorded_at` in the past.

## Tasks / Subtasks

- [ ] Task 1: Create clips migration (AC: #1, #2)
  - [ ] 1.1 Create `0008_clips.sql` migration with clips table schema
  - [ ] 1.2 Add indexes for tenant_id, site_id, detection_id, created_at
  - [ ] 1.3 Add RLS policy for tenant isolation
  - [ ] 1.4 Add soft delete support (`deleted_at` column)

- [ ] Task 2: Create storage/clips.go (AC: #1)
  - [ ] 2.1 Define `Clip` struct matching DB schema
  - [ ] 2.2 Define `CreateClipInput` struct for insert
  - [ ] 2.3 Implement `CreateClip()` function
  - [ ] 2.4 Implement `GetClip()` function for single clip retrieval
  - [ ] 2.5 Implement `UpdateClipThumbnail()` for async thumbnail update

- [ ] Task 3: Create services/clip_storage.go (AC: #1, #2, #3)
  - [ ] 3.1 Implement `SaveClipFile()` - writes file to organized path
  - [ ] 3.2 Implement `ValidateMP4()` - checks file is valid MP4
  - [ ] 3.3 Implement `GenerateThumbnail()` - extracts first frame via ffmpeg
  - [ ] 3.4 Handle placeholder thumbnail on generation failure
  - [ ] 3.5 Implement path generation: `clips/{tenant_id}/{site_id}/{YYYY-MM}/{filename}`

- [ ] Task 4: Create handlers/clips.go (AC: #1, #2, #3, #4)
  - [ ] 4.1 Implement `UploadClip()` handler for `POST /api/units/{id}/clips`
  - [ ] 4.2 Parse multipart form (file, detection_id, recorded_at)
  - [ ] 4.3 Validate file size ≤10MB, return 413 if exceeded
  - [ ] 4.4 Validate detection_id exists and belongs to same unit
  - [ ] 4.5 Accept past `recorded_at` timestamps for queued uploads
  - [ ] 4.6 Wire handler to router in `main.go`

- [ ] Task 5: Update detections table (AC: #1)
  - [ ] 5.1 Update detection's `clip_id` after clip is created
  - [ ] 5.2 Ensure linking works for queued (past) clips

- [ ] Task 6: Testing (All ACs)
  - [ ] 6.1 Unit test for clip storage path generation
  - [ ] 6.2 Unit test for MP4 validation
  - [ ] 6.3 Integration test for clip upload endpoint
  - [ ] 6.4 Test 413 response for oversized files
  - [ ] 6.5 Test placeholder thumbnail on ffmpeg failure

## Dev Notes

### Database Schema

```sql
-- clips table
CREATE TABLE clips (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    detection_id TEXT REFERENCES detections(id) ON DELETE SET NULL,
    file_path TEXT NOT NULL,           -- e.g., clips/tenant123/site456/2026-01/clip_abc.mp4
    thumbnail_path TEXT,               -- e.g., clips/tenant123/site456/2026-01/thumb_abc.jpg
    duration_seconds DECIMAL(10, 2),   -- Video duration (optional, extracted from metadata)
    file_size_bytes BIGINT NOT NULL,   -- File size for storage tracking
    recorded_at TIMESTAMPTZ NOT NULL,  -- When the unit recorded it
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ             -- Soft delete for retention
);
```

### File Storage Pattern

Follow the existing pattern from architecture:
- Base path: `CLIPS_PATH` environment variable (default: `/data/clips`)
- Organization: `{tenant_id}/{site_id}/{YYYY-MM}/{filename}`
- Filename format: `{clip_id}.mp4` for video, `{clip_id}.jpg` for thumbnail

### Authentication

This endpoint uses **X-API-Key** authentication (unit API key), not JWT. Follow pattern from `handlers/units.go:Heartbeat()`:

```go
// Extract API key from header
apiKey := r.Header.Get("X-API-Key")
if apiKey == "" {
    respondError(w, "Missing API key", http.StatusUnauthorized)
    return
}

// Validate and get unit
unit, err := storage.GetUnitByAPIKey(ctx, conn, apiKey)
```

### Thumbnail Generation

Use ffmpeg to extract first frame:
```bash
ffmpeg -i input.mp4 -vframes 1 -vf "scale=320:240:force_original_aspect_ratio=decrease" output.jpg
```

**Fallback:** If ffmpeg fails or isn't available, use a static placeholder image at `/assets/clip-placeholder.jpg`.

### Error Handling Pattern

Follow existing pattern from `handlers/detections.go`:
```go
if err != nil {
    log.Error().Err(err).Str("unit_id", unitID).Msg("Failed to save clip")
    respondError(w, "Failed to save clip", http.StatusInternalServerError)
    return
}
```

### Logging Pattern

Follow zerolog structured logging:
```go
log.Info().
    Str("clip_id", clip.ID).
    Str("unit_id", unitID).
    Int64("file_size", fileSize).
    Str("event", "clip_uploaded").
    Msg("Clip uploaded successfully")
```

### Project Structure Notes

- **Storage layer:** `apis-server/internal/storage/clips.go`
- **Service layer:** `apis-server/internal/services/clip_storage.go`
- **Handler:** `apis-server/internal/handlers/clips.go`
- **Migration:** `apis-server/internal/storage/migrations/0008_clips.sql`
- **Router:** Wire in `apis-server/cmd/server/main.go`

### API Response Format

Follow existing pattern:
```json
// Success (201 Created)
{
  "data": {
    "id": "clip_abc123",
    "unit_id": "unit_xyz",
    "detection_id": "det_456",
    "file_path": "clips/tenant/site/2026-01/clip_abc123.mp4",
    "thumbnail_path": "clips/tenant/site/2026-01/clip_abc123.jpg",
    "file_size_bytes": 2456789,
    "recorded_at": "2026-01-24T14:30:00Z",
    "created_at": "2026-01-24T14:31:00Z"
  }
}

// Error (413 Payload Too Large)
{
  "error": "File too large. Maximum size is 10MB.",
  "code": 413
}
```

### References

- [Source: architecture.md#Data-Model] - clips table schema
- [Source: architecture.md#File-Storage] - CLIPS_PATH configuration
- [Source: architecture.md#API-Endpoints] - POST /api/units/{id}/clips
- [Source: epics.md#Story-4.1] - Full acceptance criteria
- [Source: handlers/units.go] - API key authentication pattern
- [Source: storage/detections.go] - Database query patterns

### Dependencies

- **ffmpeg**: Required for thumbnail generation (standard in Alpine/Debian images)
- **Existing code**: Uses existing `storage.GetUnitByAPIKey()`, `storage.GetDetection()`

### Edge Cases

1. **Detection not found:** If `detection_id` doesn't exist, return 404 but still save the clip (detection may have been pruned)
2. **Duplicate upload:** If same `detection_id` already has a clip, update the existing clip record
3. **Invalid MP4:** Return 400 Bad Request with descriptive error
4. **Disk full:** Return 507 Insufficient Storage
5. **Unit mismatch:** If detection belongs to different unit, return 403 Forbidden

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
