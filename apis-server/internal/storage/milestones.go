package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MilestonePhoto represents a photo associated with a milestone event.
type MilestonePhoto struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenant_id"`
	MilestoneType string    `json:"milestone_type"`
	ReferenceID   *string   `json:"reference_id,omitempty"`
	FilePath      string    `json:"file_path"`
	ThumbnailPath *string   `json:"thumbnail_path,omitempty"`
	Caption       *string   `json:"caption,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

// CreateMilestonePhotoInput contains the fields needed to create a milestone photo.
type CreateMilestonePhotoInput struct {
	MilestoneType string  `json:"milestone_type"`
	ReferenceID   *string `json:"reference_id,omitempty"`
	FilePath      string  `json:"file_path"`
	ThumbnailPath *string `json:"thumbnail_path,omitempty"`
	Caption       *string `json:"caption,omitempty"`
}

// MilestoneFlags represents the milestone flags for a tenant.
type MilestoneFlags struct {
	FirstHarvestSeen  bool     `json:"first_harvest_seen"`
	HiveFirstHarvests []string `json:"hive_first_harvests"`
}

// CreateMilestonePhoto creates a new milestone photo record.
func CreateMilestonePhoto(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateMilestonePhotoInput) (*MilestonePhoto, error) {
	var photo MilestonePhoto
	err := conn.QueryRow(ctx,
		`INSERT INTO milestone_photos (tenant_id, milestone_type, reference_id, file_path, thumbnail_path, caption)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, tenant_id, milestone_type, reference_id, file_path, thumbnail_path, caption, created_at`,
		tenantID, input.MilestoneType, input.ReferenceID, input.FilePath, input.ThumbnailPath, input.Caption,
	).Scan(&photo.ID, &photo.TenantID, &photo.MilestoneType, &photo.ReferenceID,
		&photo.FilePath, &photo.ThumbnailPath, &photo.Caption, &photo.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to create milestone photo: %w", err)
	}
	return &photo, nil
}

// ListMilestonePhotos returns all milestone photos for a tenant.
func ListMilestonePhotos(ctx context.Context, conn *pgxpool.Conn, tenantID string) ([]MilestonePhoto, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, tenant_id, milestone_type, reference_id, file_path, thumbnail_path, caption, created_at
		 FROM milestone_photos
		 WHERE tenant_id = $1
		 ORDER BY created_at DESC`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list milestone photos: %w", err)
	}
	defer rows.Close()

	var photos []MilestonePhoto
	for rows.Next() {
		var p MilestonePhoto
		err := rows.Scan(&p.ID, &p.TenantID, &p.MilestoneType, &p.ReferenceID,
			&p.FilePath, &p.ThumbnailPath, &p.Caption, &p.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan milestone photo: %w", err)
		}
		photos = append(photos, p)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating milestone photos: %w", err)
	}

	return photos, nil
}

// GetMilestonePhoto retrieves a milestone photo by ID.
func GetMilestonePhoto(ctx context.Context, conn *pgxpool.Conn, id string) (*MilestonePhoto, error) {
	var photo MilestonePhoto
	err := conn.QueryRow(ctx,
		`SELECT id, tenant_id, milestone_type, reference_id, file_path, thumbnail_path, caption, created_at
		 FROM milestone_photos
		 WHERE id = $1`,
		id,
	).Scan(&photo.ID, &photo.TenantID, &photo.MilestoneType, &photo.ReferenceID,
		&photo.FilePath, &photo.ThumbnailPath, &photo.Caption, &photo.CreatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get milestone photo: %w", err)
	}

	return &photo, nil
}

// DeleteMilestonePhoto deletes a milestone photo by ID.
func DeleteMilestonePhoto(ctx context.Context, conn *pgxpool.Conn, id string) error {
	result, err := conn.Exec(ctx, `DELETE FROM milestone_photos WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("storage: failed to delete milestone photo: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

// GetMilestoneFlags retrieves the milestone flags for a tenant from their settings.
func GetMilestoneFlags(ctx context.Context, conn *pgxpool.Conn, tenantID string) (*MilestoneFlags, error) {
	var flags MilestoneFlags
	var firstHarvestSeen *bool
	var hiveFirstHarvests []string

	// FIX (DL-L02): Use COALESCE and CASE to handle NULL settings/milestones in SQL
	// instead of relying on fragile Go-side error string matching.
	err := conn.QueryRow(ctx,
		`SELECT
			COALESCE((settings->'milestones'->>'first_harvest_seen')::boolean, false),
			COALESCE(
				(SELECT array_agg(elem)
				 FROM jsonb_array_elements_text(
					 CASE WHEN settings->'milestones'->'hive_first_harvests' IS NOT NULL
					      AND jsonb_typeof(settings->'milestones'->'hive_first_harvests') = 'array'
					 THEN settings->'milestones'->'hive_first_harvests'
					 ELSE '[]'::jsonb
					 END
				 ) elem),
				ARRAY[]::text[]
			)
		 FROM tenants
		 WHERE id = $1`,
		tenantID,
	).Scan(&firstHarvestSeen, &hiveFirstHarvests)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get milestone flags: %w", err)
	}

	if firstHarvestSeen != nil {
		flags.FirstHarvestSeen = *firstHarvestSeen
	}
	if hiveFirstHarvests != nil {
		flags.HiveFirstHarvests = hiveFirstHarvests
	} else {
		flags.HiveFirstHarvests = []string{}
	}

	return &flags, nil
}

// SetMilestoneFlag sets a milestone flag for a tenant.
func SetMilestoneFlag(ctx context.Context, conn *pgxpool.Conn, tenantID string, flag string, value bool) error {
	// First ensure the milestones object exists in settings
	_, err := conn.Exec(ctx,
		`UPDATE tenants
		 SET settings = COALESCE(settings, '{}'::jsonb) ||
		     jsonb_build_object('milestones', COALESCE(settings->'milestones', '{}'::jsonb))
		 WHERE id = $1`,
		tenantID)
	if err != nil {
		return fmt.Errorf("storage: failed to initialize milestones settings: %w", err)
	}

	// Then set the specific flag
	_, err = conn.Exec(ctx,
		`UPDATE tenants
		 SET settings = jsonb_set(
			 settings,
			 ARRAY['milestones', $2],
			 $3::jsonb
		 )
		 WHERE id = $1`,
		tenantID, flag, value)
	if err != nil {
		return fmt.Errorf("storage: failed to set milestone flag %s: %w", flag, err)
	}

	return nil
}

// AddHiveFirstHarvest adds a hive ID to the list of hives that have had their first harvest.
func AddHiveFirstHarvest(ctx context.Context, conn *pgxpool.Conn, tenantID string, hiveID string) error {
	// First ensure the milestones object and hive_first_harvests array exist
	_, err := conn.Exec(ctx,
		`UPDATE tenants
		 SET settings = COALESCE(settings, '{}'::jsonb) ||
		     jsonb_build_object('milestones',
		         COALESCE(settings->'milestones', '{}'::jsonb) ||
		         jsonb_build_object('hive_first_harvests',
		             COALESCE(settings->'milestones'->'hive_first_harvests', '[]'::jsonb)
		         )
		     )
		 WHERE id = $1`,
		tenantID)
	if err != nil {
		return fmt.Errorf("storage: failed to initialize hive_first_harvests: %w", err)
	}

	// Then append the hive ID if not already present
	_, err = conn.Exec(ctx,
		`UPDATE tenants
		 SET settings = jsonb_set(
			 settings,
			 '{milestones,hive_first_harvests}',
			 (
				 SELECT CASE
					 WHEN NOT (COALESCE(settings->'milestones'->'hive_first_harvests', '[]'::jsonb) ? $2)
					 THEN COALESCE(settings->'milestones'->'hive_first_harvests', '[]'::jsonb) || to_jsonb($2::text)
					 ELSE COALESCE(settings->'milestones'->'hive_first_harvests', '[]'::jsonb)
				 END
				 FROM tenants WHERE id = $1
			 )
		 )
		 WHERE id = $1`,
		tenantID, hiveID)
	if err != nil {
		return fmt.Errorf("storage: failed to add hive first harvest: %w", err)
	}

	return nil
}

// IsFirstHiveHarvest checks if a specific hive has had any harvests.
func IsFirstHiveHarvest(ctx context.Context, conn *pgxpool.Conn, hiveID string) (bool, error) {
	var count int
	err := conn.QueryRow(ctx,
		`SELECT COUNT(*) FROM harvest_hives WHERE hive_id = $1`,
		hiveID,
	).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("storage: failed to check first hive harvest: %w", err)
	}
	return count == 0, nil
}
