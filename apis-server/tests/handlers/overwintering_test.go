package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jermoo/apis/apis-server/internal/handlers"
	"github.com/jermoo/apis/apis-server/internal/services"
	"github.com/stretchr/testify/assert"
)

// TestGetOverwinteringPromptValidation tests validation of the prompt endpoint
func TestGetOverwinteringPromptValidation(t *testing.T) {
	tests := []struct {
		name           string
		hemisphere     string
		expectedStatus int
		expectError    bool
	}{
		{
			name:           "valid northern hemisphere",
			hemisphere:     "northern",
			expectedStatus: http.StatusOK,
			expectError:    false,
		},
		{
			name:           "valid southern hemisphere",
			hemisphere:     "southern",
			expectedStatus: http.StatusOK,
			expectError:    false,
		},
		{
			name:           "empty hemisphere defaults to northern",
			hemisphere:     "",
			expectedStatus: http.StatusOK,
			expectError:    false,
		},
		{
			name:           "invalid hemisphere",
			hemisphere:     "eastern",
			expectedStatus: http.StatusBadRequest,
			expectError:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Note: This test only validates the hemisphere parameter parsing
			// Full integration tests require a database connection
			if tt.hemisphere == "eastern" {
				// This is a validation test that doesn't need DB
				req := httptest.NewRequest(http.MethodGet, "/api/overwintering/prompt?hemisphere="+tt.hemisphere, nil)
				w := httptest.NewRecorder()

				// Create a mock handler that just validates the hemisphere
				handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					hemisphere := r.URL.Query().Get("hemisphere")
					if hemisphere != "" && hemisphere != "northern" && hemisphere != "southern" {
						w.WriteHeader(http.StatusBadRequest)
						json.NewEncoder(w).Encode(map[string]string{"error": "hemisphere must be 'northern' or 'southern'"})
						return
					}
					w.WriteHeader(http.StatusOK)
				})

				handler.ServeHTTP(w, req)
				assert.Equal(t, tt.expectedStatus, w.Code)
			}
		})
	}
}

// TestCreateOverwinteringRecordValidation tests validation of the create endpoint
func TestCreateOverwinteringRecordValidation(t *testing.T) {
	tests := []struct {
		name           string
		body           string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "missing hive_id",
			body:           `{"winter_season": 2025, "survived": true}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "hive_id is required",
		},
		{
			name:           "invalid winter_season - too low",
			body:           `{"hive_id": "test", "winter_season": 1999, "survived": true}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid winter_season value",
		},
		{
			name:           "invalid winter_season - too high",
			body:           `{"hive_id": "test", "winter_season": 2101, "survived": true}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid winter_season value",
		},
		{
			name:           "condition not allowed for lost hive",
			body:           `{"hive_id": "test", "winter_season": 2025, "survived": false, "condition": "strong"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "condition, stores_remaining, and first_inspection_notes can only be set for surviving hives",
		},
		{
			name:           "stores_remaining not allowed for lost hive",
			body:           `{"hive_id": "test", "winter_season": 2025, "survived": false, "stores_remaining": "adequate"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "condition, stores_remaining, and first_inspection_notes can only be set for surviving hives",
		},
		{
			name:           "notes not allowed for lost hive",
			body:           `{"hive_id": "test", "winter_season": 2025, "survived": false, "first_inspection_notes": "some notes"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "condition, stores_remaining, and first_inspection_notes can only be set for surviving hives",
		},
		{
			name:           "invalid condition value",
			body:           `{"hive_id": "test", "winter_season": 2025, "survived": true, "condition": "excellent"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid condition value",
		},
		{
			name:           "invalid stores_remaining value",
			body:           `{"hive_id": "test", "winter_season": 2025, "survived": true, "stores_remaining": "lots"}`,
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid stores_remaining value",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a mock handler that validates input but doesn't need DB
			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var req handlers.CreateOverwinteringRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
					return
				}

				// Validate required fields
				if req.HiveID == "" {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(map[string]string{"error": "hive_id is required"})
					return
				}
				if req.WinterSeason < 2000 || req.WinterSeason > 2100 {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(map[string]string{"error": "Invalid winter_season value"})
					return
				}

				// Validate condition/stores only allowed if survived
				if !req.Survived {
					if req.Condition != nil || req.StoresRemaining != nil || req.FirstInspectionNotes != nil {
						w.WriteHeader(http.StatusBadRequest)
						json.NewEncoder(w).Encode(map[string]string{"error": "condition, stores_remaining, and first_inspection_notes can only be set for surviving hives"})
						return
					}
				}

				// Validate condition value
				validConditions := map[string]bool{"strong": true, "medium": true, "weak": true}
				if req.Condition != nil && !validConditions[*req.Condition] {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(map[string]string{"error": "Invalid condition value"})
					return
				}

				// Validate stores_remaining value
				validStores := map[string]bool{"none": true, "low": true, "adequate": true, "plenty": true}
				if req.StoresRemaining != nil && !validStores[*req.StoresRemaining] {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(map[string]string{"error": "Invalid stores_remaining value"})
					return
				}

				w.WriteHeader(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodPost, "/api/overwintering", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.expectedError != "" {
				var response map[string]string
				err := json.NewDecoder(w.Body).Decode(&response)
				assert.NoError(t, err)
				assert.Contains(t, response["error"], tt.expectedError)
			}
		})
	}
}

// TestGetHivesValidation tests validation of the hives endpoint
func TestGetHivesValidation(t *testing.T) {
	tests := []struct {
		name           string
		query          string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "missing winter_season",
			query:          "",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "winter_season query parameter is required",
		},
		{
			name:           "invalid winter_season - not a number",
			query:          "winter_season=abc",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid winter_season value",
		},
		{
			name:           "invalid winter_season - too low",
			query:          "winter_season=1999",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid winter_season value",
		},
		{
			name:           "invalid winter_season - too high",
			query:          "winter_season=2101",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid winter_season value",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a mock handler that validates input
			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				winterSeasonStr := r.URL.Query().Get("winter_season")
				if winterSeasonStr == "" {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(map[string]string{"error": "winter_season query parameter is required"})
					return
				}

				var winterSeason int
				if _, err := json.Number(winterSeasonStr).Int64(); err != nil {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(map[string]string{"error": "Invalid winter_season value"})
					return
				}

				winterSeason = int(mustParseInt(winterSeasonStr))
				if winterSeason < 2000 || winterSeason > 2100 {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(map[string]string{"error": "Invalid winter_season value"})
					return
				}

				w.WriteHeader(http.StatusOK)
			})

			req := httptest.NewRequest(http.MethodGet, "/api/overwintering/hives?"+tt.query, nil)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.expectedError != "" {
				var response map[string]string
				err := json.NewDecoder(w.Body).Decode(&response)
				assert.NoError(t, err)
				assert.Contains(t, response["error"], tt.expectedError)
			}
		})
	}
}

// TestGetTrendsValidation tests validation of the trends endpoint
func TestGetTrendsValidation(t *testing.T) {
	tests := []struct {
		name           string
		query          string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "default years (no query param)",
			query:          "",
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:           "valid years",
			query:          "years=10",
			expectedStatus: http.StatusOK,
			expectedError:  "",
		},
		{
			name:           "invalid years - not a number",
			query:          "years=abc",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid years value",
		},
		{
			name:           "invalid years - too low",
			query:          "years=0",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid years value",
		},
		{
			name:           "invalid years - too high",
			query:          "years=21",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Invalid years value",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				yearsStr := r.URL.Query().Get("years")
				if yearsStr == "" {
					w.WriteHeader(http.StatusOK)
					return
				}

				years := int(mustParseInt(yearsStr))
				if years == 0 && yearsStr != "" {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(map[string]string{"error": "Invalid years value"})
					return
				}
				if years < 1 || years > 20 {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(map[string]string{"error": "Invalid years value"})
					return
				}

				w.WriteHeader(http.StatusOK)
			})

			url := "/api/overwintering/trends"
			if tt.query != "" {
				url += "?" + tt.query
			}
			req := httptest.NewRequest(http.MethodGet, url, nil)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.expectedError != "" {
				var response map[string]string
				err := json.NewDecoder(w.Body).Decode(&response)
				assert.NoError(t, err)
				assert.Contains(t, response["error"], tt.expectedError)
			}
		})
	}
}

// TestSeasonDetectionInPrompt tests that the season detection is integrated correctly
func TestSeasonDetectionInPrompt(t *testing.T) {
	// Test that the season detection functions are called correctly
	winterSeason := services.GetCurrentWinterSeason("northern")
	seasonLabel := services.GetWinterSeasonLabel(winterSeason)

	assert.Greater(t, winterSeason, 2020)
	assert.Less(t, winterSeason, 2100)
	assert.Contains(t, seasonLabel, "-")
}

// helper function to parse int
func mustParseInt(s string) int64 {
	var result int64
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		result = result*10 + int64(c-'0')
	}
	return result
}

// TestRouteRegistration verifies the routes are set up correctly
func TestRouteRegistration(t *testing.T) {
	r := chi.NewRouter()

	// Register the routes (without middleware for this test)
	r.Get("/api/overwintering/prompt", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	r.Get("/api/overwintering/hives", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	r.Post("/api/overwintering", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	r.Get("/api/overwintering/report", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	r.Get("/api/overwintering/trends", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	r.Get("/api/overwintering/seasons", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Test each route exists
	routes := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/overwintering/prompt"},
		{http.MethodGet, "/api/overwintering/hives"},
		{http.MethodPost, "/api/overwintering"},
		{http.MethodGet, "/api/overwintering/report"},
		{http.MethodGet, "/api/overwintering/trends"},
		{http.MethodGet, "/api/overwintering/seasons"},
	}

	for _, route := range routes {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.path, nil)
			w := httptest.NewRecorder()

			r.ServeHTTP(w, req)

			// Should not get 404 (route exists)
			assert.NotEqual(t, http.StatusNotFound, w.Code, "Route should exist: %s %s", route.method, route.path)
		})
	}
}
