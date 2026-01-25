# Story 4.4: Clip Management (Delete/Archive)

Status: done

## Story

As a **beekeeper**,
I want to delete clips I no longer need,
So that I can manage my storage space.

## Acceptance Criteria

1. **Given** I am viewing a clip in the modal, **When** I click "Delete", **Then** a confirmation dialog appears: "Delete this clip permanently?" and I can confirm or cancel.

2. **Given** I confirm deletion, **When** the clip is deleted, **Then** the database record is soft deleted (deleted_at timestamp), the modal closes, the clip disappears from grid, and success notification shows "Clip deleted".

3. **Given** there are clips older than 30 days, **When** the system runs cleanup (manual for MVP), **Then** only soft-deleted clips are permanently removed.

## Tasks / Subtasks

- [ ] Task 1: Add delete button to ClipPlayerModal (AC: #1)
  - [ ] 1.1 Add Delete button to modal footer
  - [ ] 1.2 Show confirmation Modal.confirm() dialog
  - [ ] 1.3 Call DELETE /api/clips/{id} on confirm

- [ ] Task 2: Create backend delete endpoint (AC: #2)
  - [ ] 2.1 Add `DELETE /api/clips/{id}` handler
  - [ ] 2.2 Perform soft delete (set deleted_at timestamp)
  - [ ] 2.3 Return 204 No Content on success
  - [ ] 2.4 Wire route in main.go

- [ ] Task 3: Update frontend after delete (AC: #2)
  - [ ] 3.1 Close modal after successful delete
  - [ ] 3.2 Trigger clips list refresh
  - [ ] 3.3 Show success notification

- [ ] Task 4: Testing
  - [ ] 4.1 Test delete confirmation flow
  - [ ] 4.2 Test soft delete in database
  - [ ] 4.3 Test clips list excludes soft-deleted

## Dev Notes

### Backend Delete Endpoint

**Endpoint:** `DELETE /api/clips/{id}`

**Response:**
- 204 No Content on success
- 404 Not Found if clip doesn't exist
- 403 Forbidden if clip belongs to different tenant

**Implementation:**
```go
func DeleteClip(w http.ResponseWriter, r *http.Request) {
    conn := storage.RequireConn(r.Context())
    clipID := chi.URLParam(r, "id")

    // Verify clip exists (RLS handles tenant check)
    clip, err := storage.GetClip(r.Context(), conn, clipID)
    if err != nil {
        respondError(w, "Clip not found", http.StatusNotFound)
        return
    }

    // Soft delete the clip
    if err := storage.SoftDeleteClip(r.Context(), conn, clipID); err != nil {
        respondError(w, "Failed to delete clip", http.StatusInternalServerError)
        return
    }

    log.Info().Str("clip_id", clipID).Msg("Clip soft deleted")
    w.WriteHeader(http.StatusNoContent)
}
```

### Frontend Delete Flow

**ClipPlayerModal updates:**
```tsx
const handleDelete = () => {
  Modal.confirm({
    title: 'Delete Clip',
    content: 'Delete this clip permanently? This action cannot be undone.',
    okText: 'Delete',
    okType: 'danger',
    cancelText: 'Cancel',
    onOk: async () => {
      await apiClient.delete(`/clips/${clip.id}`);
      message.success('Clip deleted');
      onClose();
      onDeleteSuccess?.(); // Callback to refresh list
    },
  });
};
```

### Storage Function

`storage.SoftDeleteClip` already exists from Story 4-1:
```go
func SoftDeleteClip(ctx context.Context, conn *pgxpool.Conn, clipID string) error {
    _, err := conn.Exec(ctx,
        `UPDATE clips SET deleted_at = NOW() WHERE id = $1`,
        clipID,
    )
    return err
}
```

### References

- [Source: epics.md#Story-4.4] - Full acceptance criteria
- [Source: storage/clips.go] - SoftDeleteClip function
- [Source: components/ClipPlayerModal.tsx] - Modal component

### Dependencies

- Requires Story 4-3 (video playback modal) to be complete
- Ant Design: Modal.confirm, message

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
