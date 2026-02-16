# Security Review: Stream 3A - Core Domain Handlers

**Date:** 2026-02-06
**Reviewer:** Claude Opus 4.6
**Scope:** Server-side HTTP handlers for core domain entities
**Status:** COMPLETE

---

## Summary

This review covers 19 handler files and 9 test files in the APIS Go server's core domain handler layer. The handlers manage sites, hives, units, inspections, detections, clips, streaming, health checks, feedings, harvests, treatments, hive losses, milestones, nest estimation, overwintering, export, transcription, BeeBrain insights, and a centralized error response framework.

**Overall assessment:** The codebase demonstrates a generally security-conscious approach with SSRF protection in the stream handler, defense-in-depth tenant ownership checks, content-type sniffing for uploads, CSV injection prevention, and a sophisticated error sanitization framework. However, several issues were identified including a critical bug in the Retry-After header encoding, internal file path disclosure in API responses, and various missing input validation limits.

**Risk summary:**

| Severity | Count |
|----------|-------|
| CRITICAL | 1     |
| HIGH     | 3     |
| MEDIUM   | 6     |
| LOW      | 7     |
| INFO     | 5     |

---

## Findings

### CRITICAL

#### C-1: Broken Retry-After Header in Account Lockout Response

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/errors.go`
**Line:** 194
**Code:**
```go
w.Header().Set("Retry-After", string(rune(retryAfterSeconds)))
```

**Description:** The `RespondAccountLockedError` function converts `retryAfterSeconds` (an integer, e.g., 900) to a Unicode rune and then to a string. `string(rune(900))` produces the Unicode character U+0384 (Greek Tonos), not the string `"900"`. This results in a malformed `Retry-After` HTTP header that no HTTP client can interpret correctly.

**Risk:** Clients cannot determine when to retry, leading to either immediate retry floods (potential DoS amplification against the login endpoint) or permanent lockout perception. The account lockout rate limiting mechanism is functionally broken from the client's perspective.

**Fix:**
```go
w.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds))
```

---

### HIGH

#### H-1: Internal File Path Disclosure in Milestone Photo API Responses

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/milestones.go`
**Lines:** 39, 43, 66-74
**Code:**
```go
type MilestonePhotoResponse struct {
    // ...
    FilePath      string  `json:"file_path"`
    ThumbnailPath *string `json:"thumbnail_path,omitempty"`
    // ...
}

func milestonePhotoToResponse(p *storage.MilestonePhoto) MilestonePhotoResponse {
    return MilestonePhotoResponse{
        // ...
        FilePath:      p.FilePath,
        ThumbnailPath: p.ThumbnailPath,
        // ...
    }
}
```

**Description:** The milestone photo API responses expose the internal file path (e.g., `/clips/tenant-id/milestones/photo-uuid.jpg`) directly to clients. This leaks internal storage structure, tenant IDs in paths, and the file naming scheme. By contrast, the clips handler correctly constructs API-relative URLs (`/api/clips/{id}/thumbnail`) and never exposes raw file paths.

**Risk:** Information disclosure that reveals internal filesystem layout, tenant identifiers, and UUID naming patterns. This information can be used to construct attacks against the file serving layer or to enumerate tenants.

**Fix:** Replace `FilePath` and `ThumbnailPath` in the response with constructed API URLs (e.g., `/api/milestones/photos/{id}/image`), similar to how the clips handler constructs thumbnail URLs. Serve the images through a dedicated endpoint that validates access.

---

#### H-2: Database Error Details Leaked in Health Check Response

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/health.go`
**Lines:** 144, 167, 177
**Code:**
```go
func (h *HealthHandler) checkDatabase(ctx context.Context) string {
    // ...
    if err := h.pool.Ping(ctx); err != nil {
        log.Warn().Err(err).Msg("health: database ping failed")
        return "error: " + err.Error()  // Line 144
    }
    // ...
}

func (h *HealthHandler) checkZitadel(ctx context.Context) string {
    // ...
    return "error: " + err.Error()  // Lines 167, 177
}
```

**Description:** The health check endpoint includes raw error messages from database connections and Zitadel HTTP requests in its JSON response body. These error messages can contain connection strings, hostnames, port numbers, TLS handshake errors, authentication failure details, and other infrastructure information. The `checks` map is returned directly in the response at line 113.

**Risk:** Information disclosure of infrastructure details (database host/port, Zitadel configuration, network topology). The health endpoint is typically accessible without authentication. Error messages like `"error: dial tcp 10.0.1.30:5433: connection refused"` reveal internal IP addresses.

**Fix:** Return generic status strings (e.g., `"error"`, `"unavailable"`) in the response body. Log the full error details server-side. Consider adding authentication to the health endpoint or providing a separate detailed health endpoint for authenticated admin use only.

---

#### H-3: Fragile Path Reconstruction in Milestone Photo Deletion

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/milestones.go`
**Line:** 304
**Code:**
```go
filePath := strings.Replace(photo.FilePath, "/clips/", basePath+"/", 1)
```

**Description:** The `DeleteMilestonePhoto` handler reconstructs the absolute file path by doing a string replacement of `/clips/` with the base storage path. If a `FilePath` value in the database is manipulated (e.g., via SQL injection in another layer, or a database compromise), this replacement could produce a path that points outside the intended storage directory. For example, a `FilePath` like `/clips/../../../etc/important` would become `{basePath}/../../../etc/important`.

**Risk:** Potential path traversal leading to arbitrary file deletion. The risk is mitigated by the fact that `FilePath` values come from the database and are set by the application during upload (line 197), but a defense-in-depth approach should validate the resulting path.

**Fix:** After the string replacement, apply `filepath.Clean()` and verify the resulting path starts with `basePath` using `strings.HasPrefix()`, similar to the `ValidateFilePath` pattern used in the clips handler.

---

### MEDIUM

#### M-1: Double Memory Buffering in Clip Upload

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/clips.go`
**Line:** 177
**Code:**
```go
fileData, err := io.ReadAll(file)
```

**Description:** The clip upload handler first parses the multipart form (which buffers the file in memory up to `MaxClipSize`), then reads the entire file again with `io.ReadAll()`. This means a 10MB clip uses approximately 20MB of server memory. Under concurrent upload load, this doubles the memory pressure.

**Risk:** Denial of service through memory exhaustion. With `maxStreamsPerUnit = 2` and potentially many units uploading simultaneously, the memory overhead is significant. The 10MB `MaxClipSize` limit provides some protection, but the double buffering is unnecessary.

**Fix:** Read the file data once from the multipart form file handle, or use streaming validation that doesn't require buffering the entire file.

---

#### M-2: Unbounded Batch Array Size in Feedings and Treatments

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/feedings.go`
**Lines:** 53-54
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/treatments.go`
**Code:**
```go
type CreateFeedingRequest struct {
    HiveIDs       []string `json:"hive_ids"`
    // ...
}
```

**Description:** The `CreateFeeding` and `CreateTreatment` handlers accept a `hive_ids` array without any size limit. For each hive ID, the handler performs individual database operations (ownership verification, record creation). A request with thousands of hive IDs would trigger thousands of sequential database queries.

**Risk:** Denial of service through resource exhaustion. An attacker could send a single request with 10,000 hive IDs, tying up the database connection and handler goroutine for an extended period.

**Fix:** Add a maximum array size validation (e.g., `if len(req.HiveIDs) > 100 { return 400 }`). The same fix should be applied to the treatments handler.

---

#### M-3: Missing Frame Count Validation on Inspection Update

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/inspections.go`

**Description:** The `CreateInspection` handler validates that the number of frames does not exceed 50 (`len(req.Frames) > 50`), but the `UpdateInspection` handler does not perform this same validation when new frames are provided. An attacker could bypass the frame limit by creating an inspection with few frames, then updating it with an unlimited number.

**Risk:** Database bloat and potential performance degradation. Each frame contains multiple fields, so an update with thousands of frames could cause significant database load.

**Fix:** Add the same frame count validation (`len(req.Frames) > 50`) to the `UpdateInspection` handler.

---

#### M-4: Storage Limit Check Bypasses Tenant Context

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/clips.go`
**Line:** 161
**Code:**
```go
if err := storage.CheckStorageLimit(r.Context(), storage.DB, unit.TenantID, header.Size); err != nil {
```

**Description:** The `UploadClip` handler uses `storage.DB` (the global database pool) instead of the connection acquired from the request context (`conn`). The context-based connection typically has the tenant ID set via `SET LOCAL app.tenant_id`, enabling Row-Level Security (RLS). Using the global pool directly may bypass RLS policies, potentially allowing the storage check to query data across tenants.

**Risk:** Potential tenant isolation bypass in the storage limit calculation. If `CheckStorageLimit` queries aggregated clip sizes, it might calculate based on all tenants' data rather than the specific tenant's data.

**Fix:** Use the request-context connection: `storage.CheckStorageLimit(r.Context(), conn, unit.TenantID, header.Size)`.

---

#### M-5: Unbounded Export Hive Selection

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/export.go`
**Lines:** 86-104
**Code:**
```go
if len(req.HiveIDs) == 1 && req.HiveIDs[0] == "all" {
    hives, err := storage.ListHives(r.Context(), conn)
    // ...
    for _, h := range hives {
        hiveIDs = append(hiveIDs, h.ID)
    }
}
```

**Description:** When the `"all"` keyword is used, the handler fetches all hives for the tenant and then performs individual ownership verification for each one (lines 107-123). For a tenant with a very large number of hives, this results in N+1 queries and significant processing time. Additionally, the `hiveIDs` array from the request body has no size limit.

**Risk:** Performance degradation and potential timeout-based denial of service for tenants with many hives.

**Fix:** Add a maximum limit on `hiveIDs` count (e.g., 200) and optimize the "all" path to skip the per-hive ownership verification since `ListHives` already runs under RLS.

---

#### M-6: Missing JSON Request Body Size Limits

**Files:** Multiple handlers across all files.

**Description:** Most JSON-parsing handlers use `json.NewDecoder(r.Body).Decode(&req)` without first wrapping `r.Body` with `http.MaxBytesReader()`. The `transcribe.go` handler correctly uses `MaxBytesReader`, but other handlers do not. Without a body size limit, an attacker can send a very large JSON payload that consumes memory during parsing.

**Risk:** Memory exhaustion via oversized JSON request bodies. While Go's JSON decoder is relatively efficient, a multi-GB request body would still cause significant memory consumption.

**Fix:** Add a global middleware that wraps `r.Body` with `http.MaxBytesReader(w, r.Body, maxBodySize)` for all non-upload endpoints, or add it to each JSON-parsing handler individually. A reasonable limit for JSON API requests would be 1MB.

---

### LOW

#### L-1: Inconsistent Error Comparison Style in Detections Handler

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/detections.go`
**Lines:** 193-194
**Code:**
```go
if err == storage.ErrNotFound {
```

**Description:** The detections handler uses direct error comparison (`err == storage.ErrNotFound`) instead of `errors.Is(err, storage.ErrNotFound)`. The rest of the codebase consistently uses `errors.Is()`. If `ErrNotFound` is ever wrapped by an intermediate layer, the direct comparison will fail to match, causing not-found errors to be reported as 500 Internal Server errors.

**Risk:** Incorrect error handling leading to misleading error responses if error wrapping is introduced in the storage layer.

**Fix:** Change to `errors.Is(err, storage.ErrNotFound)` to match the pattern used in all other handlers.

---

#### L-2: Multiple List Endpoints Without Pagination

**Files:**
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/sites.go` - `ListSites`
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/feedings.go` - `ListFeedingsByHive`
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/treatments.go` - `ListTreatmentsByHive`
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/harvests.go` - `ListHarvestsByHive`, `ListHarvestsBySite`
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/milestones.go` - `ListMilestonePhotos`
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/hive_losses.go` - `ListHiveLosses`

**Description:** Several list endpoints return all records without any pagination support. While RLS limits results to the tenant's data, a tenant with a large number of records could experience slow response times and excessive memory usage on both server and client.

**Risk:** Performance degradation for tenants with large datasets.

**Fix:** Add optional pagination parameters (`page`, `per_page`) with sensible defaults (e.g., page=1, per_page=100) and a maximum per_page limit (e.g., 1000).

---

#### L-3: Missing String Length Validation on Create Endpoints

**Files:**
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/sites.go` - `CreateSite` (site name)
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/hives.go` - `CreateHive` (hive name)
- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/overwintering.go` - `CreateOverwinteringSurvey` (FirstInspectionNotes)

**Description:** Several create/update endpoints do not validate maximum string lengths for text fields like names and notes. While the database likely has column length constraints, rejecting oversized inputs at the handler level provides a better user experience and reduces unnecessary database round trips.

**Risk:** Low risk since database constraints likely catch these, but results in database-level errors instead of clean 400 responses.

**Fix:** Add length validation: site/hive names (max 200), notes fields (max 5000), etc.

---

#### L-4: WebSocket CheckOrigin Test Assertion Incorrect

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/stream_test.go`
**Lines:** 76-88
**Code:**
```go
func TestUpgraderConfiguration(t *testing.T) {
    // ...
    req := httptest.NewRequest("GET", "/ws/stream/123", nil)
    req.Header.Set("Origin", "https://example.com")
    assert.True(t, upgrader.CheckOrigin(req))  // Line 84
```

**Description:** The test asserts that `CheckOrigin` returns `true` for origin `https://example.com`, but the actual `upgrader.CheckOrigin` function (in `stream.go` lines 33-50) only allows `http://localhost:5173` or `http://localhost:3000` by default when `CORS_ALLOWED_ORIGINS` is not set. This test either: (a) has `CORS_ALLOWED_ORIGINS` set in the test environment to allow all origins, or (b) is currently failing, or (c) reveals that the CheckOrigin implementation is more permissive than the code suggests.

**Risk:** If the test passes despite the restrictive code, it indicates the CORS_ALLOWED_ORIGINS env var is leaking into the test environment, potentially masking a real CORS misconfiguration. If the test fails, it is a dead/broken test.

**Fix:** Explicitly test both with and without `CORS_ALLOWED_ORIGINS` set. Use `t.Setenv("CORS_ALLOWED_ORIGINS", "")` to ensure a clean environment, and verify that non-localhost origins are rejected by default.

---

#### L-5: CSV Export Filename Length Not Limited

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/inspections.go`

**Description:** The CSV export endpoint uses `sanitizeFilename` on the hive name for the `Content-Disposition` header filename, but does not limit the resulting filename length. An extremely long hive name (if allowed by the database) could produce a very long filename in the HTTP header.

**Risk:** Potential HTTP header size issues with some web servers or proxies that limit header sizes.

**Fix:** Truncate the sanitized filename to a reasonable maximum (e.g., 100 characters) before using it in the Content-Disposition header.

---

#### L-6: Missing Caption Length Validation in Milestone Upload

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/milestones.go`
**Lines:** 153
**Code:**
```go
caption := r.FormValue("caption")
```

**Description:** The milestone photo upload handler accepts a `caption` form field without any length validation. A very long caption could consume excessive database storage.

**Risk:** Low risk since the database column likely has a length constraint.

**Fix:** Add maximum length validation for the caption field (e.g., 500 characters).

---

#### L-7: No Rate Limiting on Export Endpoint

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/export.go`

**Description:** The export endpoint generates potentially expensive reports (fetching data for all hives, aggregating inspections, weather correlations, etc.) without any handler-level rate limiting. While there may be middleware-level rate limiting, the export endpoint is particularly expensive and should have stricter limits.

**Risk:** Resource exhaustion through repeated export requests.

**Fix:** Add per-tenant rate limiting specifically for the export endpoint (e.g., 5 exports per minute per tenant).

---

### INFO

#### I-1: Robust SSRF Protection in Stream Handler

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/stream.go`
**Lines:** 57-132

The stream handler implements comprehensive SSRF protection:
- Private IP block detection covering all RFC 1918 ranges, loopback, link-local, and IPv6 equivalents
- DNS rebinding prevention by resolving hostnames and using the resolved IP for the actual connection
- 5MB frame size cap to prevent memory exhaustion from malicious streams
- Concurrent stream limit (2 per unit) to prevent resource exhaustion

This is a strong implementation pattern that should be referenced for any future handlers that make outbound HTTP requests.

---

#### I-2: Consistent Defense-in-Depth Tenant Checks

**Files:** `treatments.go`, `hive_losses.go`, `export.go`, `milestones.go`, `beebrain.go`

Multiple handlers implement explicit tenant ID comparison checks even when RLS is expected to enforce tenant isolation:
```go
if resource.TenantID != tenantID {
    respondError(w, "Resource not found", http.StatusNotFound)
    return
}
```

This defense-in-depth pattern correctly returns 404 (not 403) to prevent tenant enumeration. This is a good security practice.

---

#### I-3: CSV Injection Prevention in Inspection Export

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/inspections.go`

The CSV export function includes an `escapeCSV` helper that handles formula injection by detecting special characters. The test file confirms proper escaping of commas, newlines, and quotes. The handler also uses `sanitizeFilename` for the Content-Disposition header to prevent header injection.

---

#### I-4: Content-Type Sniffing for File Uploads

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/milestones.go`
**Lines:** 111-124

The milestone photo upload correctly uses `http.DetectContentType()` to sniff the actual file content rather than trusting the `Content-Type` header. This prevents attackers from uploading malicious files with spoofed MIME types.

---

#### I-5: Error Sanitization Framework

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/errors.go`

The codebase includes a sophisticated error sanitization framework that:
- Detects sensitive patterns in error messages (SQL errors, file paths, stack traces)
- Uses generic messages in production mode
- Provides typed error codes for consistent client handling
- Logs full error details server-side while returning safe messages to clients

Note: Not all handlers use the `RespondSanitizedError` function yet. Some still use the bare `respondError` with potentially detailed messages (e.g., `"Invalid MP4 file: " + err.Error()` in clips.go line 187).

---

## Test Coverage Assessment

### Strengths

1. **Stream handler tests** (`stream_test.go`): Good coverage of SSRF protection (`TestIsPrivateIP`, `TestValidateUnitIP`), MJPEG frame parsing, stream count tracking, and upgrader configuration.

2. **Clips handler tests** (`tests/handlers/clips_test.go`): Extensive validation testing for file sizes, MP4 format, timestamp parsing, multipart form handling, path traversal prevention, pagination, and Content-Disposition headers.

3. **Inspections handler tests** (`tests/handlers/inspections_test.go`): Good coverage of enum validation (brood pattern, levels, temperaments), frame range validation, notes length limits, 24-hour edit window logic, and CSV escaping.

4. **Integration tests** (`tests/integration/tenant_isolation_test.go`): End-to-end tenant isolation test with RLS verification.

### Gaps

1. **Many tests are "documentation tests"** that validate constants and struct shapes rather than exercising actual handler logic with real HTTP requests. For example, many tests in `clips_test.go` duplicate validation logic in the test rather than calling the handler.

2. **No handler-level integration tests** for feedings, treatments, harvests, hive_losses, milestones, overwintering, or beebrain endpoints.

3. **Missing negative security tests**: No tests for oversized JSON bodies, SQL injection attempts in query parameters, or cross-tenant access attempts via the handler layer.

4. **Export handler tests** only test request parsing validation, not the full export generation flow.

5. **Health handler** has no dedicated test file verifying error message content in the response.

---

## Files Reviewed

### Handler Files (19)
| File | Lines | Status |
|------|-------|--------|
| `apis-server/internal/handlers/sites.go` | ~310 | Reviewed |
| `apis-server/internal/handlers/hives.go` | ~964 | Reviewed |
| `apis-server/internal/handlers/units.go` | ~573 | Reviewed |
| `apis-server/internal/handlers/inspections.go` | ~935 | Reviewed |
| `apis-server/internal/handlers/detections.go` | ~575 | Reviewed |
| `apis-server/internal/handlers/clips.go` | ~663 | Reviewed |
| `apis-server/internal/handlers/stream.go` | ~341 | Reviewed |
| `apis-server/internal/handlers/health.go` | ~191 | Reviewed |
| `apis-server/internal/handlers/feedings.go` | ~490 | Reviewed |
| `apis-server/internal/handlers/harvests.go` | ~556 | Reviewed |
| `apis-server/internal/handlers/treatments.go` | ~471 | Reviewed |
| `apis-server/internal/handlers/hive_losses.go` | ~305 | Reviewed |
| `apis-server/internal/handlers/milestones.go` | ~390 | Reviewed |
| `apis-server/internal/handlers/nest_estimate.go` | ~133 | Reviewed |
| `apis-server/internal/handlers/overwintering.go` | ~392 | Reviewed |
| `apis-server/internal/handlers/export.go` | ~268 | Reviewed |
| `apis-server/internal/handlers/transcribe.go` | ~354 | Reviewed |
| `apis-server/internal/handlers/beebrain.go` | ~380 | Reviewed |
| `apis-server/internal/handlers/errors.go` | ~197 | Reviewed |

### Test Files (9)
| File | Lines | Status |
|------|-------|--------|
| `apis-server/internal/handlers/stream_test.go` | ~232 | Reviewed |
| `apis-server/internal/handlers/detections_test.go` | ~461 | Reviewed |
| `apis-server/tests/handlers/clips_test.go` | ~1227 | Reviewed |
| `apis-server/tests/handlers/hives_test.go` | ~434 | Reviewed |
| `apis-server/tests/handlers/inspections_test.go` | ~418 | Reviewed |
| `apis-server/tests/handlers/nest_estimate_test.go` | ~368 | Reviewed |
| `apis-server/tests/handlers/export_test.go` | ~561 | Reviewed |
| `apis-server/tests/handlers/detections_test.go` | ~850 | Reviewed |
| `apis-server/tests/integration/tenant_isolation_test.go` | ~151 | Reviewed |

### Supporting Files
| File | Purpose |
|------|---------|
| `apis-server/internal/handlers/auth.go` | `respondError`/`respondJSON` helpers |

---

## Metrics

| Metric | Value |
|--------|-------|
| Total findings | 22 |
| Critical | 1 |
| High | 3 |
| Medium | 6 |
| Low | 7 |
| Info | 5 |
| Handler files reviewed | 19 |
| Test files reviewed | 9 |
| Estimated handler LOC | ~7,100 |
| Estimated test LOC | ~4,700 |

---

## Remediation Priority

### Immediate (before next deployment)
1. **C-1**: Fix `Retry-After` header encoding in `errors.go` line 194
2. **H-2**: Sanitize health check error messages to prevent infrastructure disclosure

### Short-term (within 1 sprint)
3. **H-1**: Remove internal file paths from milestone photo API responses
4. **H-3**: Add path validation to milestone photo deletion
5. **M-4**: Fix storage limit check to use request-context connection
6. **M-6**: Add global JSON body size limit middleware

### Medium-term (within 2 sprints)
7. **M-1**: Optimize clip upload to avoid double memory buffering
8. **M-2**: Add array size limits to batch endpoints
9. **M-3**: Add frame count validation to inspection update
10. **M-5**: Add count limit to export hive selection
11. **L-1**: Fix inconsistent error comparison in detections handler
12. **L-2**: Add pagination to unpaginated list endpoints
