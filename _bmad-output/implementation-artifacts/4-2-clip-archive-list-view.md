# Story 4.2: Clip Archive List View

Status: done

## Story

As a **beekeeper**,
I want to browse my detection clips with thumbnails,
So that I can find and review specific incidents.

## Acceptance Criteria

1. **Given** I am on the Clips page, **When** the page loads, **Then** I see a grid of clip thumbnails (newest first) with each showing: preview image, date/time ("Jan 22, 14:30"), unit name, and duration ("0:04").

2. **Given** I have many clips, **When** I scroll down, **Then** more clips load automatically (infinite scroll) or pagination controls appear at the bottom.

3. **Given** I want to filter clips, **When** I use the filter controls, **Then** I can filter by: date range (date picker), unit (dropdown), and site (dropdown if multiple sites).

4. **Given** I apply filters, **When** the results update, **Then** only matching clips are shown, a "Clear filters" button appears, and result count is displayed: "Showing 12 clips".

5. **Given** there are no clips matching the filter, **When** I view the page, **Then** I see "No clips found for this period" and suggestions to adjust filters.

## Tasks / Subtasks

- [x] Task 1: Create backend API endpoint (AC: #1, #2, #3, #4)
  - [x] 1.1 Add `GET /api/clips` handler to list clips
  - [x] 1.2 Add query param parsing: site_id, from, to, unit_id, page, per_page
  - [x] 1.3 Return clip list with unit_name joined from units table
  - [x] 1.4 Add `GET /api/clips/{id}/thumbnail` to serve thumbnail images
  - [x] 1.5 Wire routes in main.go under protected routes

- [x] Task 2: Create ClipList React component (AC: #1)
  - [x] 2.1 Create `apis-dashboard/src/components/ClipCard.tsx`
  - [x] 2.2 Display thumbnail, date/time, unit name, duration
  - [x] 2.3 Use Ant Design Card + Image components
  - [x] 2.4 Format date as "Jan 22, 14:30"
  - [x] 2.5 Format duration as "0:04" (mm:ss)

- [x] Task 3: Create Clips page (AC: #1, #2, #3, #4, #5)
  - [x] 3.1 Update `apis-dashboard/src/pages/Clips.tsx` (already exists)
  - [x] 3.2 Implement responsive grid: 2 cols mobile, 6 cols desktop
  - [x] 3.3 Add pagination controls (Ant Design Pagination)
  - [x] 3.4 Add filter controls: DatePicker range, unit Select, site Select
  - [x] 3.5 Display "Showing X clips" count
  - [x] 3.6 Add "Clear filters" button when filters applied
  - [x] 3.7 Show empty state: "No clips found for this period"

- [x] Task 4: Add route and navigation (AC: #1)
  - [x] 4.1 /clips route already exists in App.tsx
  - [x] 4.2 "Clips" menu item already exists in sidebar

- [x] Task 5: Create useClips hook (AC: #1, #2, #3)
  - [x] 5.1 Create `apis-dashboard/src/hooks/useClips.ts`
  - [x] 5.2 Implement data fetching with apiClient
  - [x] 5.3 Handle pagination and filter state

- [ ] Task 6: Testing (All ACs)
  - [ ] 6.1 Unit test for ListClips handler
  - [ ] 6.2 Test filter parameter validation
  - [ ] 6.3 Test empty state display

## Dev Notes

### Backend API

**Endpoint:** `GET /api/clips`

**Query Parameters:**
- `site_id` (required): UUID of site
- `from` (optional): ISO 8601 date - start of range
- `to` (optional): ISO 8601 date - end of range
- `unit_id` (optional): UUID of unit to filter by
- `page` (optional, default: 1): Page number
- `per_page` (optional, default: 20): Items per page

**Response:**
```json
{
  "data": [
    {
      "id": "clip-uuid",
      "unit_id": "unit-uuid",
      "unit_name": "Hive 1 Protector",
      "site_id": "site-uuid",
      "detection_id": "det-uuid",
      "duration_seconds": 4.5,
      "file_size_bytes": 2456789,
      "recorded_at": "2026-01-22T14:30:22Z",
      "created_at": "2026-01-22T14:31:00Z",
      "thumbnail_url": "/api/clips/clip-uuid/thumbnail"
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "per_page": 20,
    "total_pages": 3
  }
}
```

### Thumbnail Serving

**Endpoint:** `GET /api/clips/{id}/thumbnail`
- Returns JPEG image
- Content-Type: image/jpeg
- Cache-Control: public, max-age=86400 (thumbnails don't change)

### Storage Layer

The `storage.ListClips` function already exists from Story 4-1. Need to add:
- Join with `units` table to get `unit_name`
- Add `thumbnail_url` field to response (constructed from clip ID)

### Frontend Components

**ClipCard.tsx:**
```tsx
interface ClipCardProps {
  clip: {
    id: string;
    unit_name: string;
    duration_seconds: number;
    recorded_at: string;
    thumbnail_url: string;
  };
  onClick: () => void;
}
```

**Clips page structure:**
```tsx
<Space direction="vertical" style={{ width: '100%' }}>
  <FilterControls />
  <ResultCount total={clips.length} />
  <Row gutter={[16, 16]}>
    {clips.map(clip => (
      <Col xs={12} sm={8} md={6} key={clip.id}>
        <ClipCard clip={clip} onClick={() => navigate(`/clips/${clip.id}`)} />
      </Col>
    ))}
  </Row>
  <Pagination />
</Space>
```

### Date/Time Formatting

Use `dayjs` (already included with Ant Design):
```tsx
import dayjs from 'dayjs';
// Format: "Jan 22, 14:30"
dayjs(clip.recorded_at).format('MMM D, HH:mm')
```

### Duration Formatting

```tsx
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

### References

- [Source: epics.md#Story-4.2] - Full acceptance criteria
- [Source: architecture.md#Frontend-Routes] - /clips route
- [Source: handlers/clips.go] - Storage layer from Story 4-1
- [Source: components/] - Existing component patterns

### Dependencies

- Requires Story 4-1 (clip storage) to be complete
- Ant Design: Card, Image, DatePicker, Select, Pagination, Row, Col
- dayjs for date formatting

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
