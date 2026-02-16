package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Clip represents a video clip from an APIS unit.
type Clip struct {
	ID              string     `json:"id"`
	TenantID        string     `json:"tenant_id,omitempty"`
	UnitID          string     `json:"unit_id"`
	UnitName        *string    `json:"unit_name,omitempty"` // Joined from units table
	SiteID          string     `json:"site_id"`
	DetectionID     *string    `json:"detection_id,omitempty"`
	FilePath        string     `json:"file_path"`
	ThumbnailPath   *string    `json:"thumbnail_path,omitempty"`
	DurationSeconds *float64   `json:"duration_seconds,omitempty"`
	FileSizeBytes   int64      `json:"file_size_bytes"`
	RecordedAt      time.Time  `json:"recorded_at"`
	CreatedAt       time.Time  `json:"created_at"`
	DeletedAt       *time.Time `json:"deleted_at,omitempty"`
}

// CreateClipInput contains the fields needed to create a new clip record.
type CreateClipInput struct {
	UnitID          string
	SiteID          string
	TenantID        string
	DetectionID     *string
	FilePath        string
	ThumbnailPath   *string
	DurationSeconds *float64
	FileSizeBytes   int64
	RecordedAt      time.Time
}

// CreateClip creates a new clip record in the database.
func CreateClip(ctx context.Context, conn *pgxpool.Conn, input *CreateClipInput) (*Clip, error) {
	var clip Clip
	err := conn.QueryRow(ctx,
		`INSERT INTO clips (tenant_id, unit_id, site_id, detection_id, file_path, thumbnail_path, duration_seconds, file_size_bytes, recorded_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, tenant_id, unit_id, site_id, detection_id, file_path, thumbnail_path, duration_seconds, file_size_bytes, recorded_at, created_at, deleted_at`,
		input.TenantID, input.UnitID, input.SiteID, input.DetectionID, input.FilePath, input.ThumbnailPath, input.DurationSeconds, input.FileSizeBytes, input.RecordedAt,
	).Scan(&clip.ID, &clip.TenantID, &clip.UnitID, &clip.SiteID, &clip.DetectionID, &clip.FilePath, &clip.ThumbnailPath, &clip.DurationSeconds, &clip.FileSizeBytes, &clip.RecordedAt, &clip.CreatedAt, &clip.DeletedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create clip: %w", err)
	}

	return &clip, nil
}

// GetClip retrieves a clip by ID.
func GetClip(ctx context.Context, conn *pgxpool.Conn, id string) (*Clip, error) {
	var clip Clip
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, unit_id, site_id, detection_id, file_path, thumbnail_path, duration_seconds, file_size_bytes, recorded_at, created_at, deleted_at
		 FROM clips
		 WHERE id = $1 AND deleted_at IS NULL`,
		id,
	).Scan(&clip.ID, &clip.TenantID, &clip.UnitID, &clip.SiteID, &clip.DetectionID, &clip.FilePath, &clip.ThumbnailPath, &clip.DurationSeconds, &clip.FileSizeBytes, &clip.RecordedAt, &clip.CreatedAt, &clip.DeletedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to get clip: %w", err)
	}

	return &clip, nil
}

// GetClipByDetectionID retrieves a clip by its associated detection ID.
func GetClipByDetectionID(ctx context.Context, conn *pgxpool.Conn, detectionID string) (*Clip, error) {
	var clip Clip
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, unit_id, site_id, detection_id, file_path, thumbnail_path, duration_seconds, file_size_bytes, recorded_at, created_at, deleted_at
		 FROM clips
		 WHERE detection_id = $1 AND deleted_at IS NULL`,
		detectionID,
	).Scan(&clip.ID, &clip.TenantID, &clip.UnitID, &clip.SiteID, &clip.DetectionID, &clip.FilePath, &clip.ThumbnailPath, &clip.DurationSeconds, &clip.FileSizeBytes, &clip.RecordedAt, &clip.CreatedAt, &clip.DeletedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to get clip by detection: %w", err)
	}

	return &clip, nil
}

// UpdateClipThumbnail updates the thumbnail path for a clip.
func UpdateClipThumbnail(ctx context.Context, conn *pgxpool.Conn, clipID, thumbnailPath string) error {
	_, err := conn.Exec(ctx,
		`UPDATE clips SET thumbnail_path = $2 WHERE id = $1`,
		clipID, thumbnailPath,
	)
	if err != nil {
		return fmt.Errorf("storage: failed to update clip thumbnail: %w", err)
	}
	return nil
}

// UpdateDetectionClipID updates the clip_id field on a detection record.
func UpdateDetectionClipID(ctx context.Context, conn *pgxpool.Conn, detectionID, clipID string) error {
	_, err := conn.Exec(ctx,
		`UPDATE detections SET clip_id = $2 WHERE id = $1`,
		detectionID, clipID,
	)
	if err != nil {
		return fmt.Errorf("storage: failed to update detection clip_id: %w", err)
	}
	return nil
}

// ListClipsParams contains parameters for listing clips.
type ListClipsParams struct {
	TenantID string
	SiteID   *string
	UnitID   *string
	From     *time.Time
	To       *time.Time
	Page     int
	PerPage  int
}

// ListClips returns clips matching the given parameters.
func ListClips(ctx context.Context, conn *pgxpool.Conn, params *ListClipsParams) ([]Clip, int, error) {
	// Build WHERE clause dynamically
	whereClause := `WHERE tenant_id = $1 AND deleted_at IS NULL`
	args := []any{params.TenantID}
	argIdx := 2

	if params.SiteID != nil {
		whereClause += fmt.Sprintf(` AND site_id = $%d`, argIdx)
		args = append(args, *params.SiteID)
		argIdx++
	}

	if params.UnitID != nil {
		whereClause += fmt.Sprintf(` AND unit_id = $%d`, argIdx)
		args = append(args, *params.UnitID)
		argIdx++
	}

	if params.From != nil {
		whereClause += fmt.Sprintf(` AND recorded_at >= $%d`, argIdx)
		args = append(args, *params.From)
		argIdx++
	}

	if params.To != nil {
		whereClause += fmt.Sprintf(` AND recorded_at < $%d`, argIdx)
		args = append(args, *params.To)
		argIdx++
	}

	// Count total
	var total int
	countQuery := `SELECT COUNT(*) FROM clips ` + whereClause
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	err := conn.QueryRow(ctx, countQuery, countArgs...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: failed to count clips: %w", err)
	}

	// Fetch page
	offset := (params.Page - 1) * params.PerPage
	query := `SELECT id, tenant_id, unit_id, site_id, detection_id, file_path, thumbnail_path, duration_seconds, file_size_bytes, recorded_at, created_at, deleted_at
		 FROM clips
		 ` + whereClause + `
		 ORDER BY recorded_at DESC
		 LIMIT $` + fmt.Sprintf("%d", argIdx) + ` OFFSET $` + fmt.Sprintf("%d", argIdx+1)
	args = append(args, params.PerPage, offset)

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: failed to list clips: %w", err)
	}
	defer rows.Close()

	var clips []Clip
	for rows.Next() {
		var c Clip
		err := rows.Scan(&c.ID, &c.TenantID, &c.UnitID, &c.SiteID, &c.DetectionID, &c.FilePath, &c.ThumbnailPath, &c.DurationSeconds, &c.FileSizeBytes, &c.RecordedAt, &c.CreatedAt, &c.DeletedAt)
		if err != nil {
			return nil, 0, fmt.Errorf("storage: failed to scan clip: %w", err)
		}
		// Don't expose tenant_id in list response
		c.TenantID = ""
		clips = append(clips, c)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("storage: error iterating clips: %w", err)
	}

	return clips, total, nil
}

// SoftDeleteClip marks a clip as deleted without removing from database.
// SECURITY FIX (DL-M08): Check RowsAffected to return ErrNotFound when
// the clip ID does not exist or is already soft-deleted.
func SoftDeleteClip(ctx context.Context, conn *pgxpool.Conn, clipID string) error {
	result, err := conn.Exec(ctx,
		`UPDATE clips SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
		clipID,
	)
	if err != nil {
		return fmt.Errorf("storage: failed to soft delete clip: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// PurgeOldSoftDeletedClips permanently removes soft-deleted clips older than the specified duration.
// This is used for system cleanup per AC3 - only soft-deleted clips are permanently removed.
func PurgeOldSoftDeletedClips(ctx context.Context, conn *pgxpool.Conn, olderThan time.Duration) (int64, error) {
	cutoff := time.Now().Add(-olderThan)
	result, err := conn.Exec(ctx,
		`DELETE FROM clips WHERE deleted_at IS NOT NULL AND deleted_at < $1`,
		cutoff,
	)
	if err != nil {
		return 0, fmt.Errorf("storage: failed to purge old clips: %w", err)
	}
	return result.RowsAffected(), nil
}

// ListClipsWithUnitName returns clips matching the given parameters with unit names.
// TODO (DL-M09): This function and ListClips have nearly identical WHERE clause
// construction logic. Extract shared filter-building into a helper to keep in sync.
func ListClipsWithUnitName(ctx context.Context, conn *pgxpool.Conn, params *ListClipsParams) ([]Clip, int, error) {
	// Build WHERE clause dynamically
	whereClause := `WHERE c.tenant_id = $1 AND c.deleted_at IS NULL`
	args := []any{params.TenantID}
	argIdx := 2

	if params.SiteID != nil {
		whereClause += fmt.Sprintf(` AND c.site_id = $%d`, argIdx)
		args = append(args, *params.SiteID)
		argIdx++
	}

	if params.UnitID != nil {
		whereClause += fmt.Sprintf(` AND c.unit_id = $%d`, argIdx)
		args = append(args, *params.UnitID)
		argIdx++
	}

	if params.From != nil {
		whereClause += fmt.Sprintf(` AND c.recorded_at >= $%d`, argIdx)
		args = append(args, *params.From)
		argIdx++
	}

	if params.To != nil {
		whereClause += fmt.Sprintf(` AND c.recorded_at < $%d`, argIdx)
		args = append(args, *params.To)
		argIdx++
	}

	// Count total
	var total int
	countQuery := `SELECT COUNT(*) FROM clips c ` + whereClause
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	err := conn.QueryRow(ctx, countQuery, countArgs...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: failed to count clips: %w", err)
	}

	// Fetch page with unit name join
	offset := (params.Page - 1) * params.PerPage
	query := `SELECT c.id, c.tenant_id, c.unit_id, u.name, c.site_id, c.detection_id, c.file_path, c.thumbnail_path, c.duration_seconds, c.file_size_bytes, c.recorded_at, c.created_at, c.deleted_at
		 FROM clips c
		 LEFT JOIN units u ON u.id = c.unit_id
		 ` + whereClause + `
		 ORDER BY c.recorded_at DESC
		 LIMIT $` + fmt.Sprintf("%d", argIdx) + ` OFFSET $` + fmt.Sprintf("%d", argIdx+1)
	args = append(args, params.PerPage, offset)

	rows, err := conn.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("storage: failed to list clips: %w", err)
	}
	defer rows.Close()

	var clips []Clip
	for rows.Next() {
		var c Clip
		err := rows.Scan(&c.ID, &c.TenantID, &c.UnitID, &c.UnitName, &c.SiteID, &c.DetectionID, &c.FilePath, &c.ThumbnailPath, &c.DurationSeconds, &c.FileSizeBytes, &c.RecordedAt, &c.CreatedAt, &c.DeletedAt)
		if err != nil {
			return nil, 0, fmt.Errorf("storage: failed to scan clip: %w", err)
		}
		// Don't expose tenant_id in list response
		c.TenantID = ""
		clips = append(clips, c)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("storage: error iterating clips: %w", err)
	}

	return clips, total, nil
}
