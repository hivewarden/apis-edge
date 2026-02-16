// Package storage_test contains unit tests for the APIS server storage layer.
package storage_test

import (
	"testing"
	"time"

	"github.com/jermoo/apis/apis-server/internal/storage"
)

// TestCreateInspectionFrameInput tests the frame input struct behavior.
func TestCreateInspectionFrameInput(t *testing.T) {
	input := &storage.CreateInspectionFrameInput{
		BoxPosition:  1,
		BoxType:      "brood",
		TotalFrames:  10,
		DrawnFrames:  8,
		BroodFrames:  6,
		HoneyFrames:  2,
		PollenFrames: 1,
	}

	// Verify fields
	if input.BoxPosition != 1 {
		t.Errorf("expected BoxPosition 1, got %d", input.BoxPosition)
	}
	if input.BoxType != "brood" {
		t.Errorf("expected BoxType 'brood', got %q", input.BoxType)
	}
	if input.TotalFrames != 10 {
		t.Errorf("expected TotalFrames 10, got %d", input.TotalFrames)
	}
	if input.DrawnFrames != 8 {
		t.Errorf("expected DrawnFrames 8, got %d", input.DrawnFrames)
	}
	if input.BroodFrames != 6 {
		t.Errorf("expected BroodFrames 6, got %d", input.BroodFrames)
	}
	if input.HoneyFrames != 2 {
		t.Errorf("expected HoneyFrames 2, got %d", input.HoneyFrames)
	}
	if input.PollenFrames != 1 {
		t.Errorf("expected PollenFrames 1, got %d", input.PollenFrames)
	}
}

// TestValidateFrameInput_ValidBroodBox tests validation with valid brood box data.
func TestValidateFrameInput_ValidBroodBox(t *testing.T) {
	input := &storage.CreateInspectionFrameInput{
		BoxPosition:  1,
		BoxType:      "brood",
		TotalFrames:  10,
		DrawnFrames:  8,
		BroodFrames:  5,
		HoneyFrames:  2,
		PollenFrames: 1,
	}

	err := storage.ValidateFrameInput(input)
	if err != nil {
		t.Errorf("expected no error for valid brood box, got %v", err)
	}
}

// TestValidateFrameInput_ValidSuperBox tests validation with valid super box data.
func TestValidateFrameInput_ValidSuperBox(t *testing.T) {
	input := &storage.CreateInspectionFrameInput{
		BoxPosition:  2,
		BoxType:      "super",
		TotalFrames:  10,
		DrawnFrames:  6,
		BroodFrames:  0,
		HoneyFrames:  5,
		PollenFrames: 1,
	}

	err := storage.ValidateFrameInput(input)
	if err != nil {
		t.Errorf("expected no error for valid super box, got %v", err)
	}
}

// TestValidateFrameInput_InvalidBoxType tests validation rejects invalid box types.
func TestValidateFrameInput_InvalidBoxType(t *testing.T) {
	input := &storage.CreateInspectionFrameInput{
		BoxPosition:  1,
		BoxType:      "invalid",
		TotalFrames:  10,
		DrawnFrames:  5,
		BroodFrames:  3,
		HoneyFrames:  1,
		PollenFrames: 0,
	}

	err := storage.ValidateFrameInput(input)
	if err == nil {
		t.Error("expected error for invalid box type")
	}
}

// TestValidateFrameInput_InvalidBoxPosition tests validation rejects position < 1.
func TestValidateFrameInput_InvalidBoxPosition(t *testing.T) {
	input := &storage.CreateInspectionFrameInput{
		BoxPosition:  0,
		BoxType:      "brood",
		TotalFrames:  10,
		DrawnFrames:  5,
		BroodFrames:  3,
		HoneyFrames:  1,
		PollenFrames: 0,
	}

	err := storage.ValidateFrameInput(input)
	if err == nil {
		t.Error("expected error for box position < 1")
	}
}

// TestValidateFrameInput_TotalFramesOutOfRange tests validation for total_frames range.
func TestValidateFrameInput_TotalFramesOutOfRange(t *testing.T) {
	tests := []struct {
		name        string
		totalFrames int
		expectError bool
	}{
		{"zero", 0, true},
		{"one", 1, false},
		{"ten", 10, false},
		{"twenty", 20, false},
		{"twenty-one", 21, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := &storage.CreateInspectionFrameInput{
				BoxPosition:  1,
				BoxType:      "brood",
				TotalFrames:  tt.totalFrames,
				DrawnFrames:  0,
				BroodFrames:  0,
				HoneyFrames:  0,
				PollenFrames: 0,
			}

			err := storage.ValidateFrameInput(input)
			if tt.expectError && err == nil {
				t.Errorf("expected error for total_frames=%d", tt.totalFrames)
			}
			if !tt.expectError && err != nil {
				t.Errorf("expected no error for total_frames=%d, got %v", tt.totalFrames, err)
			}
		})
	}
}

// TestValidateFrameInput_DrawnExceedsTotal tests drawn_frames cannot exceed total_frames.
func TestValidateFrameInput_DrawnExceedsTotal(t *testing.T) {
	input := &storage.CreateInspectionFrameInput{
		BoxPosition:  1,
		BoxType:      "brood",
		TotalFrames:  10,
		DrawnFrames:  11,
		BroodFrames:  0,
		HoneyFrames:  0,
		PollenFrames: 0,
	}

	err := storage.ValidateFrameInput(input)
	if err == nil {
		t.Error("expected error when drawn_frames > total_frames")
	}
}

// TestValidateFrameInput_NegativeValues tests negative frame counts are rejected.
func TestValidateFrameInput_NegativeValues(t *testing.T) {
	tests := []struct {
		name         string
		drawnFrames  int
		broodFrames  int
		honeyFrames  int
		pollenFrames int
	}{
		{"negative drawn", -1, 0, 0, 0},
		{"negative brood", 5, -1, 0, 0},
		{"negative honey", 5, 0, -1, 0},
		{"negative pollen", 5, 0, 0, -1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := &storage.CreateInspectionFrameInput{
				BoxPosition:  1,
				BoxType:      "brood",
				TotalFrames:  10,
				DrawnFrames:  tt.drawnFrames,
				BroodFrames:  tt.broodFrames,
				HoneyFrames:  tt.honeyFrames,
				PollenFrames: tt.pollenFrames,
			}

			err := storage.ValidateFrameInput(input)
			if err == nil {
				t.Errorf("expected error for %s", tt.name)
			}
		})
	}
}

// TestValidateFrameInput_FrameSumExceedsDrawn tests brood+honey+pollen cannot exceed drawn.
func TestValidateFrameInput_FrameSumExceedsDrawn(t *testing.T) {
	input := &storage.CreateInspectionFrameInput{
		BoxPosition:  1,
		BoxType:      "brood",
		TotalFrames:  10,
		DrawnFrames:  6,
		BroodFrames:  4,
		HoneyFrames:  2,
		PollenFrames: 1, // 4+2+1=7 > 6
	}

	err := storage.ValidateFrameInput(input)
	if err == nil {
		t.Error("expected error when brood+honey+pollen > drawn")
	}
}

// TestValidateFrameInput_FrameSumEqualsDrawn tests exact equality is allowed.
func TestValidateFrameInput_FrameSumEqualsDrawn(t *testing.T) {
	input := &storage.CreateInspectionFrameInput{
		BoxPosition:  1,
		BoxType:      "brood",
		TotalFrames:  10,
		DrawnFrames:  8,
		BroodFrames:  4,
		HoneyFrames:  3,
		PollenFrames: 1, // 4+3+1=8 == 8
	}

	err := storage.ValidateFrameInput(input)
	if err != nil {
		t.Errorf("expected no error when brood+honey+pollen == drawn, got %v", err)
	}
}

// TestInspectionFrameStructFields tests the InspectionFrame struct fields.
func TestInspectionFrameStructFields(t *testing.T) {
	now := time.Now()

	frame := storage.InspectionFrame{
		ID:           "frame-123",
		InspectionID: "insp-456",
		BoxPosition:  1,
		BoxType:      "brood",
		TotalFrames:  10,
		DrawnFrames:  8,
		BroodFrames:  6,
		HoneyFrames:  2,
		PollenFrames: 1,
		CreatedAt:    now,
	}

	if frame.ID != "frame-123" {
		t.Errorf("expected ID 'frame-123', got %q", frame.ID)
	}
	if frame.InspectionID != "insp-456" {
		t.Errorf("expected InspectionID 'insp-456', got %q", frame.InspectionID)
	}
	if frame.BoxPosition != 1 {
		t.Errorf("expected BoxPosition 1, got %d", frame.BoxPosition)
	}
	if frame.BoxType != "brood" {
		t.Errorf("expected BoxType 'brood', got %q", frame.BoxType)
	}
	if frame.TotalFrames != 10 {
		t.Errorf("expected TotalFrames 10, got %d", frame.TotalFrames)
	}
	if frame.DrawnFrames != 8 {
		t.Errorf("expected DrawnFrames 8, got %d", frame.DrawnFrames)
	}
	if frame.BroodFrames != 6 {
		t.Errorf("expected BroodFrames 6, got %d", frame.BroodFrames)
	}
	if frame.HoneyFrames != 2 {
		t.Errorf("expected HoneyFrames 2, got %d", frame.HoneyFrames)
	}
	if frame.PollenFrames != 1 {
		t.Errorf("expected PollenFrames 1, got %d", frame.PollenFrames)
	}
}

// TestFrameHistoryEntryStructFields tests the FrameHistoryEntry struct fields.
func TestFrameHistoryEntryStructFields(t *testing.T) {
	now := time.Now()

	entry := storage.FrameHistoryEntry{
		InspectionID: "insp-789",
		InspectedAt:  now,
		TotalBrood:   12,
		TotalHoney:   8,
		TotalPollen:  4,
		TotalDrawn:   24,
	}

	if entry.InspectionID != "insp-789" {
		t.Errorf("expected InspectionID 'insp-789', got %q", entry.InspectionID)
	}
	if entry.TotalBrood != 12 {
		t.Errorf("expected TotalBrood 12, got %d", entry.TotalBrood)
	}
	if entry.TotalHoney != 8 {
		t.Errorf("expected TotalHoney 8, got %d", entry.TotalHoney)
	}
	if entry.TotalPollen != 4 {
		t.Errorf("expected TotalPollen 4, got %d", entry.TotalPollen)
	}
	if entry.TotalDrawn != 24 {
		t.Errorf("expected TotalDrawn 24, got %d", entry.TotalDrawn)
	}
}

// TestBoxTypeValues documents expected box type values.
func TestBoxTypeValues(t *testing.T) {
	expectedTypes := map[string]bool{
		"brood": true,
		"super": true,
	}

	for boxType := range expectedTypes {
		if !expectedTypes[boxType] {
			t.Errorf("box type %q should be valid", boxType)
		}
	}

	if len(expectedTypes) != 2 {
		t.Errorf("expected 2 box types, got %d", len(expectedTypes))
	}
}
