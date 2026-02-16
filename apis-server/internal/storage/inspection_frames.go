package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// InspectionFrame represents frame-level data for a single box in an inspection.
type InspectionFrame struct {
	ID           string    `json:"id"`
	InspectionID string    `json:"inspection_id"`
	BoxPosition  int       `json:"box_position"`  // 1 = bottom, increasing upward
	BoxType      string    `json:"box_type"`      // "brood" or "super"
	TotalFrames  int       `json:"total_frames"`  // Total frame capacity (usually 10)
	DrawnFrames  int       `json:"drawn_frames"`  // Frames with drawn comb
	BroodFrames  int       `json:"brood_frames"`  // Frames with brood
	HoneyFrames  int       `json:"honey_frames"`  // Frames with honey
	PollenFrames int       `json:"pollen_frames"` // Frames with pollen
	CreatedAt    time.Time `json:"created_at"`
}

// CreateInspectionFrameInput contains fields needed to create frame data.
type CreateInspectionFrameInput struct {
	BoxPosition  int    `json:"box_position"`
	BoxType      string `json:"box_type"`
	TotalFrames  int    `json:"total_frames"`
	DrawnFrames  int    `json:"drawn_frames"`
	BroodFrames  int    `json:"brood_frames"`
	HoneyFrames  int    `json:"honey_frames"`
	PollenFrames int    `json:"pollen_frames"`
}

// ValidateFrameInput validates frame data input.
func ValidateFrameInput(input *CreateInspectionFrameInput) error {
	if input.BoxType != "brood" && input.BoxType != "super" {
		return fmt.Errorf("box_type must be 'brood' or 'super'")
	}
	if input.BoxPosition < 1 {
		return fmt.Errorf("box_position must be >= 1")
	}
	if input.TotalFrames < 1 || input.TotalFrames > 20 {
		return fmt.Errorf("total_frames must be between 1 and 20")
	}
	if input.DrawnFrames < 0 || input.DrawnFrames > input.TotalFrames {
		return fmt.Errorf("drawn_frames must be between 0 and total_frames")
	}
	if input.BroodFrames < 0 {
		return fmt.Errorf("brood_frames must be >= 0")
	}
	if input.HoneyFrames < 0 {
		return fmt.Errorf("honey_frames must be >= 0")
	}
	if input.PollenFrames < 0 {
		return fmt.Errorf("pollen_frames must be >= 0")
	}
	if input.BroodFrames+input.HoneyFrames+input.PollenFrames > input.DrawnFrames {
		return fmt.Errorf("brood_frames + honey_frames + pollen_frames cannot exceed drawn_frames")
	}
	return nil
}

// CreateInspectionFrames creates frame data for an inspection using a single
// pgx.Batch to reduce round-trips. Each insert uses ON CONFLICT ... DO UPDATE
// so CopyFrom is not suitable here.
func CreateInspectionFrames(ctx context.Context, conn *pgxpool.Conn, inspectionID string, frames []CreateInspectionFrameInput) ([]InspectionFrame, error) {
	if len(frames) == 0 {
		return []InspectionFrame{}, nil
	}

	// Validate all inputs before sending any queries.
	for i := range frames {
		if err := ValidateFrameInput(&frames[i]); err != nil {
			return nil, fmt.Errorf("storage: invalid frame input for position %d: %w", frames[i].BoxPosition, err)
		}
	}

	const upsertSQL = `INSERT INTO inspection_frames (inspection_id, box_position, box_type, total_frames, drawn_frames, brood_frames, honey_frames, pollen_frames)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (inspection_id, box_position) DO UPDATE SET
		     box_type = EXCLUDED.box_type,
		     total_frames = EXCLUDED.total_frames,
		     drawn_frames = EXCLUDED.drawn_frames,
		     brood_frames = EXCLUDED.brood_frames,
		     honey_frames = EXCLUDED.honey_frames,
		     pollen_frames = EXCLUDED.pollen_frames
		 RETURNING id, inspection_id, box_position, box_type, total_frames, drawn_frames, brood_frames, honey_frames, pollen_frames, created_at`

	batch := &pgx.Batch{}
	for _, input := range frames {
		batch.Queue(upsertSQL,
			inspectionID, input.BoxPosition, input.BoxType, input.TotalFrames,
			input.DrawnFrames, input.BroodFrames, input.HoneyFrames, input.PollenFrames,
		)
	}

	br := conn.SendBatch(ctx, batch)
	defer br.Close()

	results := make([]InspectionFrame, 0, len(frames))
	for range frames {
		var frame InspectionFrame
		err := br.QueryRow().Scan(
			&frame.ID, &frame.InspectionID, &frame.BoxPosition, &frame.BoxType,
			&frame.TotalFrames, &frame.DrawnFrames, &frame.BroodFrames,
			&frame.HoneyFrames, &frame.PollenFrames, &frame.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to create inspection frame: %w", err)
		}
		results = append(results, frame)
	}

	return results, nil
}

// GetFramesByInspectionID returns all frame data for an inspection.
func GetFramesByInspectionID(ctx context.Context, conn *pgxpool.Conn, inspectionID string) ([]InspectionFrame, error) {
	rows, err := conn.Query(ctx,
		`SELECT id, inspection_id, box_position, box_type, total_frames, drawn_frames, brood_frames, honey_frames, pollen_frames, created_at
		 FROM inspection_frames
		 WHERE inspection_id = $1
		 ORDER BY box_position ASC`,
		inspectionID)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get inspection frames: %w", err)
	}
	defer rows.Close()

	var frames []InspectionFrame
	for rows.Next() {
		var frame InspectionFrame
		err := rows.Scan(&frame.ID, &frame.InspectionID, &frame.BoxPosition, &frame.BoxType, &frame.TotalFrames,
			&frame.DrawnFrames, &frame.BroodFrames, &frame.HoneyFrames, &frame.PollenFrames, &frame.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan inspection frame: %w", err)
		}
		frames = append(frames, frame)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating inspection frames: %w", err)
	}

	return frames, nil
}

// DeleteFramesByInspectionID deletes all frame data for an inspection.
func DeleteFramesByInspectionID(ctx context.Context, conn *pgxpool.Conn, inspectionID string) error {
	_, err := conn.Exec(ctx, `DELETE FROM inspection_frames WHERE inspection_id = $1`, inspectionID)
	if err != nil {
		return fmt.Errorf("storage: failed to delete inspection frames: %w", err)
	}
	return nil
}

// GetFrameHistoryByHive returns frame data aggregated by inspection for a hive.
// This is used for frame development graphs.
func GetFrameHistoryByHive(ctx context.Context, conn *pgxpool.Conn, hiveID string, limit int) ([]FrameHistoryEntry, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := conn.Query(ctx,
		`SELECT
			i.id as inspection_id,
			i.inspected_at,
			COALESCE(SUM(f.brood_frames), 0) as total_brood,
			COALESCE(SUM(f.honey_frames), 0) as total_honey,
			COALESCE(SUM(f.pollen_frames), 0) as total_pollen,
			COALESCE(SUM(f.drawn_frames), 0) as total_drawn
		 FROM inspections i
		 LEFT JOIN inspection_frames f ON i.id = f.inspection_id
		 WHERE i.hive_id = $1
		 GROUP BY i.id, i.inspected_at
		 HAVING COUNT(f.id) > 0
		 ORDER BY i.inspected_at DESC
		 LIMIT $2`,
		hiveID, limit)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get frame history: %w", err)
	}
	defer rows.Close()

	var history []FrameHistoryEntry
	for rows.Next() {
		var entry FrameHistoryEntry
		err := rows.Scan(&entry.InspectionID, &entry.InspectedAt, &entry.TotalBrood, &entry.TotalHoney, &entry.TotalPollen, &entry.TotalDrawn)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan frame history: %w", err)
		}
		history = append(history, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating frame history: %w", err)
	}

	return history, nil
}

// FrameHistoryEntry represents aggregated frame data for a single inspection.
type FrameHistoryEntry struct {
	InspectionID string    `json:"inspection_id"`
	InspectedAt  time.Time `json:"inspected_at"`
	TotalBrood   int       `json:"total_brood"`
	TotalHoney   int       `json:"total_honey"`
	TotalPollen  int       `json:"total_pollen"`
	TotalDrawn   int       `json:"total_drawn"`
}
