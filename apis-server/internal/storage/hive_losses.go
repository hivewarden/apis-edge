package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Valid cause values for hive losses
const (
	CauseStarvation    = "starvation"
	CauseVarroa        = "varroa"
	CauseQueenFailure  = "queen_failure"
	CausePesticide     = "pesticide"
	CauseSwarming      = "swarming"
	CauseRobbing       = "robbing"
	CauseUnknown       = "unknown"
	CauseOther         = "other"
)

// ValidCauses is a slice of all valid cause values
var ValidCauses = []string{
	CauseStarvation,
	CauseVarroa,
	CauseQueenFailure,
	CausePesticide,
	CauseSwarming,
	CauseRobbing,
	CauseUnknown,
	CauseOther,
}

// Valid symptom codes
const (
	SymptomNoBees           = "no_bees"
	SymptomDeadBeesEntrance = "dead_bees_entrance"
	SymptomDeformedWings    = "deformed_wings"
	SymptomRobbingEvidence  = "robbing_evidence"
	SymptomMoldyFrames      = "moldy_frames"
	SymptomEmptyStores      = "empty_stores"
	SymptomDeadBrood        = "dead_brood"
	SymptomChalkBrood       = "chalk_brood"
	SymptomSHBEvidence      = "shb_evidence"
	SymptomWaxMoth          = "wax_moth"
)

// ValidSymptoms is a slice of all valid symptom codes
var ValidSymptoms = []string{
	SymptomNoBees,
	SymptomDeadBeesEntrance,
	SymptomDeformedWings,
	SymptomRobbingEvidence,
	SymptomMoldyFrames,
	SymptomEmptyStores,
	SymptomDeadBrood,
	SymptomChalkBrood,
	SymptomSHBEvidence,
	SymptomWaxMoth,
}

// CauseDisplayNames maps cause codes to display names
var CauseDisplayNames = map[string]string{
	CauseStarvation:   "Starvation",
	CauseVarroa:       "Varroa/Mites",
	CauseQueenFailure: "Queen Failure",
	CausePesticide:    "Pesticide Exposure",
	CauseSwarming:     "Swarming (absconded)",
	CauseRobbing:      "Robbing",
	CauseUnknown:      "Unknown",
	CauseOther:        "Other (specify)",
}

// SymptomDisplayNames maps symptom codes to display names
var SymptomDisplayNames = map[string]string{
	SymptomNoBees:           "No bees remaining",
	SymptomDeadBeesEntrance: "Dead bees at entrance/inside",
	SymptomDeformedWings:    "Deformed wings visible",
	SymptomRobbingEvidence:  "Evidence of robbing (wax debris)",
	SymptomMoldyFrames:      "Moldy frames",
	SymptomEmptyStores:      "Empty honey stores",
	SymptomDeadBrood:        "Dead brood pattern",
	SymptomChalkBrood:       "Chalk brood visible",
	SymptomSHBEvidence:      "Small hive beetle evidence",
	SymptomWaxMoth:          "Wax moth damage",
}

// HiveLoss represents a hive loss post-mortem record in the database.
type HiveLoss struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenant_id"`
	HiveID        string    `json:"hive_id"`
	HiveName      string    `json:"hive_name,omitempty"` // Joined from hives table
	DiscoveredAt  time.Time `json:"discovered_at"`
	Cause         string    `json:"cause"`
	CauseOther    *string   `json:"cause_other,omitempty"`
	Symptoms      []string  `json:"symptoms"`
	SymptomsNotes *string   `json:"symptoms_notes,omitempty"`
	Reflection    *string   `json:"reflection,omitempty"`
	DataChoice    string    `json:"data_choice"`
	CreatedAt     time.Time `json:"created_at"`
}

// CreateHiveLossInput contains the fields needed to create a new hive loss record.
type CreateHiveLossInput struct {
	HiveID        string   `json:"hive_id"`
	DiscoveredAt  string   `json:"discovered_at"` // YYYY-MM-DD format
	Cause         string   `json:"cause"`
	CauseOther    *string  `json:"cause_other,omitempty"`
	Symptoms      []string `json:"symptoms"`
	SymptomsNotes *string  `json:"symptoms_notes,omitempty"`
	Reflection    *string  `json:"reflection,omitempty"`
	DataChoice    string   `json:"data_choice"`
}

// HiveLossStats contains aggregated loss statistics for BeeBrain analysis.
type HiveLossStats struct {
	TotalLosses    int                    `json:"total_losses"`
	LossesByCause  map[string]int         `json:"losses_by_cause"`
	LossesByYear   map[int]int            `json:"losses_by_year"`
	CommonSymptoms []SymptomCount         `json:"common_symptoms"`
}

// SymptomCount represents a symptom and its occurrence count.
type SymptomCount struct {
	Symptom string `json:"symptom"`
	Count   int    `json:"count"`
}

// Note: ErrHiveAlreadyLost is defined in hives.go

// IsValidCause checks if the given cause is valid.
func IsValidCause(cause string) bool {
	for _, c := range ValidCauses {
		if c == cause {
			return true
		}
	}
	return false
}

// IsValidSymptom checks if the given symptom is valid.
func IsValidSymptom(symptom string) bool {
	for _, s := range ValidSymptoms {
		if s == symptom {
			return true
		}
	}
	return false
}

// AreValidSymptoms checks if all symptoms in the slice are valid.
func AreValidSymptoms(symptoms []string) bool {
	for _, s := range symptoms {
		if !IsValidSymptom(s) {
			return false
		}
	}
	return true
}

// CreateHiveLoss creates a new hive loss record in the database.
func CreateHiveLoss(ctx context.Context, conn *pgxpool.Conn, tenantID string, input *CreateHiveLossInput) (*HiveLoss, error) {
	// Parse discovered_at date
	discoveredAt, err := time.Parse("2006-01-02", input.DiscoveredAt)
	if err != nil {
		return nil, fmt.Errorf("storage: invalid discovered_at date format: %w", err)
	}

	var loss HiveLoss
	err = conn.QueryRow(ctx,
		`INSERT INTO hive_losses (tenant_id, hive_id, discovered_at, cause, cause_other, symptoms, symptoms_notes, reflection, data_choice)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, tenant_id, hive_id, discovered_at, cause, cause_other, symptoms, symptoms_notes, reflection, data_choice, created_at`,
		tenantID, input.HiveID, discoveredAt, input.Cause, input.CauseOther, input.Symptoms, input.SymptomsNotes, input.Reflection, input.DataChoice,
	).Scan(&loss.ID, &loss.TenantID, &loss.HiveID, &loss.DiscoveredAt, &loss.Cause, &loss.CauseOther, &loss.Symptoms, &loss.SymptomsNotes, &loss.Reflection, &loss.DataChoice, &loss.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("storage: failed to create hive loss record: %w", err)
	}

	return &loss, nil
}

// GetHiveLossByHiveID retrieves the hive loss record for a specific hive.
func GetHiveLossByHiveID(ctx context.Context, conn *pgxpool.Conn, hiveID string) (*HiveLoss, error) {
	var loss HiveLoss
	err := conn.QueryRow(ctx,
		`SELECT hl.id, hl.tenant_id, hl.hive_id, hl.discovered_at, hl.cause, hl.cause_other, hl.symptoms, hl.symptoms_notes, hl.reflection, hl.data_choice, hl.created_at, h.name
		 FROM hive_losses hl
		 JOIN hives h ON h.id = hl.hive_id
		 WHERE hl.hive_id = $1`,
		hiveID,
	).Scan(&loss.ID, &loss.TenantID, &loss.HiveID, &loss.DiscoveredAt, &loss.Cause, &loss.CauseOther, &loss.Symptoms, &loss.SymptomsNotes, &loss.Reflection, &loss.DataChoice, &loss.CreatedAt, &loss.HiveName)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get hive loss: %w", err)
	}

	return &loss, nil
}

// ListHiveLosses returns all hive loss records for the current tenant.
func ListHiveLosses(ctx context.Context, conn *pgxpool.Conn) ([]HiveLoss, error) {
	rows, err := conn.Query(ctx,
		`SELECT hl.id, hl.tenant_id, hl.hive_id, hl.discovered_at, hl.cause, hl.cause_other, hl.symptoms, hl.symptoms_notes, hl.reflection, hl.data_choice, hl.created_at, h.name
		 FROM hive_losses hl
		 JOIN hives h ON h.id = hl.hive_id
		 ORDER BY hl.discovered_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to list hive losses: %w", err)
	}
	defer rows.Close()

	var losses []HiveLoss
	for rows.Next() {
		var loss HiveLoss
		err := rows.Scan(&loss.ID, &loss.TenantID, &loss.HiveID, &loss.DiscoveredAt, &loss.Cause, &loss.CauseOther, &loss.Symptoms, &loss.SymptomsNotes, &loss.Reflection, &loss.DataChoice, &loss.CreatedAt, &loss.HiveName)
		if err != nil {
			return nil, fmt.Errorf("storage: failed to scan hive loss: %w", err)
		}
		losses = append(losses, loss)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating hive losses: %w", err)
	}

	return losses, nil
}

// GetHiveLossStats returns aggregated loss statistics for BeeBrain analysis.
func GetHiveLossStats(ctx context.Context, conn *pgxpool.Conn) (*HiveLossStats, error) {
	stats := &HiveLossStats{
		LossesByCause:  make(map[string]int),
		LossesByYear:   make(map[int]int),
		CommonSymptoms: []SymptomCount{},
	}

	// Get total and losses by cause
	rows, err := conn.Query(ctx,
		`SELECT cause, COUNT(*) as count
		 FROM hive_losses
		 GROUP BY cause`)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get losses by cause: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cause string
		var count int
		if err := rows.Scan(&cause, &count); err != nil {
			return nil, fmt.Errorf("storage: failed to scan losses by cause: %w", err)
		}
		stats.LossesByCause[cause] = count
		stats.TotalLosses += count
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating losses by cause: %w", err)
	}

	// Get losses by year
	rows, err = conn.Query(ctx,
		`SELECT EXTRACT(YEAR FROM discovered_at)::int as year, COUNT(*) as count
		 FROM hive_losses
		 GROUP BY year
		 ORDER BY year DESC`)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get losses by year: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var year int
		var count int
		if err := rows.Scan(&year, &count); err != nil {
			return nil, fmt.Errorf("storage: failed to scan losses by year: %w", err)
		}
		stats.LossesByYear[year] = count
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating losses by year: %w", err)
	}

	// Get common symptoms (unnest array and count)
	rows, err = conn.Query(ctx,
		`SELECT symptom, COUNT(*) as count
		 FROM hive_losses, unnest(symptoms) as symptom
		 GROUP BY symptom
		 ORDER BY count DESC
		 LIMIT 10`)
	if err != nil {
		return nil, fmt.Errorf("storage: failed to get common symptoms: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var sc SymptomCount
		if err := rows.Scan(&sc.Symptom, &sc.Count); err != nil {
			return nil, fmt.Errorf("storage: failed to scan common symptom: %w", err)
		}
		stats.CommonSymptoms = append(stats.CommonSymptoms, sc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("storage: error iterating common symptoms: %w", err)
	}

	return stats, nil
}
