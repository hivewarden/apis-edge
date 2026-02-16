# Security Review: Stream 3B - Extended Handlers & Services

**Review Date:** 2026-02-06
**Reviewer:** Claude Opus 4.6 (Automated Security Review)
**Scope:** Extended handler files, service files, and associated tests in `apis-server/`

---

## Metrics

| Category | Count |
|----------|-------|
| Handler files reviewed | 16 |
| Service files reviewed | 8 |
| Test files reviewed | 18 |
| **Total files reviewed** | **42** |

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 3 |
| MEDIUM | 6 |
| LOW | 5 |
| INFO | 5 |
| **Total findings** | **20** |

---

## CRITICAL Findings

### CRIT-01: Retry-After Header Corruption via Unicode Rune Conversion

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/errors.go:194`

**Description:**
The `RespondAccountLockedError` function incorrectly converts the `retryAfterSeconds` integer to a string by first casting it to a Go `rune` (Unicode code point), then to a `string`. For any value above 127, this produces a multi-byte UTF-8 character instead of the numeric string representation.

```go
func RespondAccountLockedError(w http.ResponseWriter, retryAfterSeconds int) {
    w.Header().Set("Retry-After", string(rune(retryAfterSeconds)))
    // ...
}
```

For example, if `retryAfterSeconds` is 300 (5 minutes), `string(rune(300))` produces the Unicode character U+012C (Latin capital letter I with breve: "I" with a curved accent), not the string `"300"`. For values 0-127, it produces ASCII control characters or printable characters (e.g., 60 seconds becomes `"<"`).

**Risk:** Clients relying on the `Retry-After` header to implement backoff will receive garbage values, leading to either immediate retry floods (if parsed as 0 or ignored) or indefinite lockout (if the header is treated as invalid and a default is used). This breaks the account lockout feedback loop, undermining brute-force protection.

**Fix:**
```go
import "strconv"

func RespondAccountLockedError(w http.ResponseWriter, retryAfterSeconds int) {
    w.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds))
    respondError(w, "Account temporarily locked due to too many failed attempts", http.StatusTooManyRequests)
}
```

---

## HIGH Findings

### HIGH-01: SSRF via Ollama Endpoint Validation Allows Internal Network Access

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/settings_beebrain.go:333-358`

**Description:**
The `isValidOllamaEndpoint` function validates URLs provided by tenant admins for BeeBrain's Ollama integration. It only checks for a valid HTTP/HTTPS scheme and a non-empty host, but does not block internal/private network addresses.

```go
func isValidOllamaEndpoint(endpoint string) bool {
    parsed, err := url.Parse(endpoint)
    if err != nil {
        return false
    }
    scheme := strings.ToLower(parsed.Scheme)
    if scheme != "http" && scheme != "https" {
        return false
    }
    if parsed.Host == "" {
        return false
    }
    if parsed.User != nil {
        return false
    }
    return true
}
```

A malicious tenant admin could set the Ollama endpoint to internal infrastructure addresses such as:
- `http://10.0.1.20:8200` (OpenBao secrets vault)
- `http://localhost:5433` (YugabyteDB)
- `http://169.254.169.254` (cloud metadata service)
- `http://[::1]:8200` (IPv6 loopback)

If the server later makes HTTP requests to this endpoint, internal services become accessible through the APIS server as a proxy.

**Risk:** Server-Side Request Forgery (SSRF). An attacker with tenant admin access could probe or interact with internal infrastructure (OpenBao, YugabyteDB, metadata endpoints) through the server's network position.

**Fix:** Add a blocklist for private/reserved IP ranges and resolve hostnames before validation:
```go
func isValidOllamaEndpoint(endpoint string) bool {
    parsed, err := url.Parse(endpoint)
    if err != nil { return false }
    // ... existing scheme/host checks ...

    host := parsed.Hostname()
    ips, err := net.LookupIP(host)
    if err != nil { return false }
    for _, ip := range ips {
        if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
           ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
            return false
        }
    }
    return true
}
```

---

### HIGH-02: Invite Tokens Exposed in ListInvites API Response

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/invite.go:640-673`

**Description:**
The `ListInvites` handler returns the full plaintext invite token in the response body for every invite record. Invite tokens are bearer credentials -- possessing one grants the ability to create an account on the tenant.

```go
type InviteTokenResponse struct {
    ID        string  `json:"id"`
    Token     string  `json:"token"`           // <-- Full token exposed
    Email     string  `json:"email,omitempty"`
    Role      string  `json:"role"`
    // ...
}
// ...
resp := InviteTokenResponse{
    // ...
    Token:     t.Token,    // Raw token value
    // ...
}
```

Any admin listing invites receives all active token values. If the admin's session is compromised (XSS, session hijack, shoulder surfing), all pending invite tokens are leaked.

**Risk:** Token leakage to any attacker who can read admin API responses. Combined with link invites having no use limit (see MED-02), a single leaked link token could be used to create unlimited accounts.

**Fix:** Return only a masked/truncated token (e.g., last 4 characters) in the list response. If the full token needs to be shown, provide it only at creation time (the `CreateInvite` handler already does this).
```go
Token: t.Token[:4] + "..." + t.Token[len(t.Token)-4:],
```

---

### HIGH-03: Audit Logging Uses context.Background() Losing Tenant Context

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/services/audit.go:136-145`

**Description:**
The `logEntry` method fires a goroutine that calls `insertAuditEntry` with `context.Background()` instead of a derived context from the request. While the tenant ID and user ID are explicitly extracted and passed in the `AuditEntry` struct, using `context.Background()` means:

1. Any middleware-injected context values (RLS session variables, trace IDs, correlation IDs) are lost.
2. If the database uses connection-level RLS (`SET app.tenant_id`), the background context will not carry the RLS configuration, and the audit entry may fail tenant isolation checks or be inserted without proper tenant scoping.
3. There is no cancellation propagation -- if the server is shutting down, in-flight audit goroutines continue until their context times out or the process is killed, potentially losing entries.

```go
go func() {
    if err := s.insertAuditEntry(context.Background(), entry); err != nil {
        log.Error().Err(err)...
    }
}()
```

**Risk:** Audit entries may silently fail to be recorded if the database connection requires RLS context. During shutdown, pending audit entries may be lost. This weakens the audit trail, which is critical for compliance and forensic analysis.

**Fix:** Use a detached context with timeout that preserves essential values, and implement graceful shutdown:
```go
// Create a detached context with audit-specific values
auditCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
// Copy tenant context values manually
auditCtx = context.WithValue(auditCtx, "tenant_id", tenantID)

go func() {
    defer cancel()
    if err := s.insertAuditEntry(auditCtx, entry); err != nil { ... }
}()
```
Additionally, consider using a buffered channel and a dedicated worker goroutine with graceful shutdown support.

---

## MEDIUM Findings

### MED-01: Invite URL Construction Trusts Origin Header

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/invite.go:368-376`

**Description:**
When creating link invites, the handler builds the invite URL using the `Origin` HTTP header from the request. The `Origin` header is client-controlled and not validated.

```go
baseURL := ""
if origin := r.Header.Get("Origin"); origin != "" {
    baseURL = origin
} else if r.TLS != nil {
    baseURL = "https://" + r.Host
} else {
    baseURL = "http://" + r.Host
}
inviteURL := baseURL + "/invite/" + token
```

An attacker who controls the `Origin` header (e.g., via a custom HTTP client, or if the CORS policy is misconfigured) could set it to a phishing domain. The generated invite URL would then point to `https://evil.com/invite/<token>`, and if the admin shares this URL (e.g., via email), the invitee would send their credentials to the attacker's site.

**Risk:** Phishing via attacker-controlled invite URLs. The invite token (a bearer credential) would be sent to the attacker's domain.

**Fix:** Use a server-configured base URL from an environment variable rather than trusting client-provided headers:
```go
baseURL := os.Getenv("DASHBOARD_URL") // e.g., "https://apis.honeybeegood.be"
if baseURL == "" {
    // Fallback to request host, but prefer config
    baseURL = "https://" + r.Host
}
```

---

### MED-02: Link Invites Have No Use Count Limit

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/invite.go`

**Description:**
Link-type invites (method `"link"`) generate a shareable URL that can be used by anyone to create an account on the tenant. Unlike email invites (which are tied to a specific email address), link invites have no mechanism to limit reuse. The invite is only marked as "used" after the first acceptance, but there is no enforcement that prevents subsequent uses, or there is no `max_uses` column to enforce a limit.

Combined with HIGH-02 (token exposure in ListInvites), a leaked link invite token could be used by unlimited users to create accounts.

**Risk:** Unbounded account creation on a tenant if a link invite is shared beyond its intended audience. This could exhaust tenant user limits or allow unauthorized access.

**Fix:** Add a `max_uses` column to invite tokens (defaulting to 1 for email, configurable for link invites) and track usage count. Reject invite acceptance when the limit is reached.

---

### MED-03: No Date Range Validation on Calendar Endpoint

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/calendar.go:109-132`

**Description:**
The `GetCalendar` handler parses `start` and `end` query parameters as dates but performs no validation that:
1. `start` is before `end`
2. The range is bounded (e.g., max 1 year)
3. The dates are within reasonable bounds

```go
startDate, err := time.Parse("2006-01-02", startStr)
// ... no validation beyond format
endDate, err := time.Parse("2006-01-02", endStr)
// ... immediately proceeds to query
```

An attacker could request a 100-year range, causing the server to compute treatment due dates for every hive across that entire span, potentially consuming significant CPU and memory.

**Risk:** Denial of service through resource exhaustion. Large date ranges cause combinatorial expansion when computing treatment schedules across multiple hives and treatment types.

**Fix:** Validate that `start < end` and limit the range to a reasonable maximum (e.g., 366 days):
```go
if endDate.Before(startDate) {
    respondError(w, "end date must be after start date", http.StatusBadRequest)
    return
}
if endDate.Sub(startDate) > 366*24*time.Hour {
    respondError(w, "date range cannot exceed 366 days", http.StatusBadRequest)
    return
}
```

---

### MED-04: Global Mutable auditSvc Without Synchronization

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/audit_helpers.go:11-17`

**Description:**
The audit service instance is stored as a package-level mutable global variable with no synchronization:

```go
var auditSvc *services.AuditService

func SetAuditService(svc *services.AuditService) {
    auditSvc = svc
}
```

All audit helper functions (`AuditCreate`, `AuditUpdate`, `AuditDelete`) read `auditSvc` without synchronization. While `SetAuditService` is likely called once during startup before any requests are handled, the Go memory model does not guarantee visibility of this write to goroutines spawned later without a happens-before relationship (such as a mutex, channel, or `sync.Once`).

**Risk:** In theory, a handler goroutine could see `auditSvc` as `nil` even after it has been set, causing audit entries to be silently dropped. In practice, this is unlikely because Go's runtime scheduler usually establishes happens-before through other synchronization points, but it violates the Go memory model contract.

**Fix:** Use `sync.Once` or `atomic.Value`:
```go
var auditSvcValue atomic.Value // stores *services.AuditService

func SetAuditService(svc *services.AuditService) {
    auditSvcValue.Store(svc)
}

func getAuditSvc() *services.AuditService {
    v, _ := auditSvcValue.Load().(*services.AuditService)
    return v
}
```

---

### MED-05: X-Forwarded-For IP Spoofing in Audit Logging

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/services/audit.go:228-241`

**Description:**
The `ExtractIPAddress` function unconditionally trusts the `X-Forwarded-For` header, using the first IP from the comma-separated list:

```go
func ExtractIPAddress(xff string, remoteAddr string) string {
    if xff != "" {
        parts := strings.Split(xff, ",")
        return strings.TrimSpace(parts[0])
    }
    // Fall back to RemoteAddr
    host, _, err := net.SplitHostPort(remoteAddr)
    // ...
}
```

Any client can set `X-Forwarded-For` to an arbitrary value. In the audit log, this means attackers can forge their apparent IP address, making forensic analysis unreliable. If the server is behind a reverse proxy (BunkerWeb), the rightmost IP in XFF should be trusted (set by the proxy), not the leftmost (set by the client).

**Risk:** Audit log IP addresses are unreliable for forensic analysis. An attacker performing malicious actions while impersonating another IP address makes incident investigation inaccurate.

**Fix:** Either trust only the rightmost `X-Forwarded-For` entry (set by the trusted proxy), or use a trusted proxy configuration:
```go
func ExtractIPAddress(xff string, remoteAddr string) string {
    if xff != "" {
        parts := strings.Split(xff, ",")
        // Trust the LAST entry (set by our reverse proxy)
        return strings.TrimSpace(parts[len(parts)-1])
    }
    // ...
}
```

---

### MED-06: Non-Atomic Task Creation from Suggestion Acceptance

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/task_suggestions.go:152-163`

**Description:**
The `AcceptSuggestion` handler creates a task and then updates the suggestion status as two separate database operations without a transaction:

```go
task, err := storage.CreateTask(r.Context(), conn, tenantID, userID, taskInput)
if err != nil {
    // ...
    return
}

// Mark suggestion as accepted
if err := storage.UpdateTaskSuggestionStatus(r.Context(), conn, suggestionID, "accepted"); err != nil {
    // Log but don't fail - task was created successfully
    log.Error().Err(err)...
}
```

If the task is created but the suggestion status update fails (network issue, DB timeout), the suggestion remains "pending" and could be accepted again, creating duplicate tasks. The comment acknowledges this is a non-critical failure, but it results in data inconsistency.

**Risk:** Duplicate task creation from the same suggestion. While not a security vulnerability per se, it violates data integrity expectations and could cause confusion in hive management workflows.

**Fix:** Wrap both operations in a database transaction:
```go
tx, err := conn.Begin(ctx)
if err != nil { ... }
defer tx.Rollback(ctx)

task, err := storage.CreateTaskTx(ctx, tx, tenantID, userID, taskInput)
if err != nil { ... }

if err := storage.UpdateTaskSuggestionStatusTx(ctx, tx, suggestionID, "accepted"); err != nil { ... }

if err := tx.Commit(ctx); err != nil { ... }
```

---

## LOW Findings

### LOW-01: Profile Name Update Lacks Maximum Length Validation

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/settings.go:222-227`

**Description:**
The `UpdateUserProfile` handler trims whitespace and checks for empty names, but does not enforce a maximum length:

```go
name := strings.TrimSpace(req.Name)
if name == "" {
    respondError(w, "Name is required", http.StatusBadRequest)
    return
}
```

An attacker could submit a name with millions of characters, causing memory allocation pressure and potential issues with database storage.

**Risk:** Low-severity DoS. Database VARCHAR limits likely prevent extremely long values from being stored, but the Go handler still allocates memory for the full value before the DB rejects it.

**Fix:** Add a maximum length check (e.g., 200 characters):
```go
if len(name) > 200 {
    respondError(w, "Name must not exceed 200 characters", http.StatusBadRequest)
    return
}
```

---

### LOW-02: Label Names Lack Content Sanitization

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/labels.go`

**Description:**
Label creation validates name length (2-50 characters) and color format, but does not sanitize name content. Labels containing HTML/JavaScript (`<script>alert(1)</script>`) or control characters could be stored and later rendered unsanitized in the dashboard.

**Risk:** Stored XSS if the dashboard renders label names without escaping. The React frontend should escape by default via JSX, but non-JSX rendering paths (e.g., `dangerouslySetInnerHTML`, tooltips, or third-party components) could be vulnerable.

**Fix:** Strip HTML tags and control characters from label names on the server side as defense-in-depth.

---

### LOW-03: Admin Limits MaxUnits Allows Zero (Inconsistent Validation)

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/admin_limits.go:159-162`

**Description:**
The validation for `MaxUnits` allows a value of 0 (`< 0` check), while all other limits require at least 1 (`< 1` checks):

```go
if req.MaxHives != nil && *req.MaxHives < 1 { ... }    // min 1
if req.MaxStorageGB != nil && *req.MaxStorageGB < 1 { ... } // min 1
if req.MaxUnits != nil && *req.MaxUnits < 0 { ... }    // min 0 (inconsistent!)
if req.MaxUsers != nil && *req.MaxUsers < 1 { ... }    // min 1
```

Setting `MaxUnits` to 0 may have been intentional (a tenant with no detection units), but the inconsistency with other fields suggests it may be a bug.

**Risk:** Functional inconsistency. If 0 units is not a valid configuration, this allows an invalid limit to be set.

**Fix:** Align validation with other fields or document the intentional difference:
```go
if req.MaxUnits != nil && *req.MaxUnits < 1 {
    respondError(w, "Max units must be at least 1", http.StatusBadRequest)
    return
}
```

---

### LOW-04: Treatment Interval Keys Reflected in Error Messages

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/calendar.go:663-671`

**Description:**
When validating treatment intervals, the user-provided map key is included directly in the error message:

```go
for k, v := range intervals {
    if v <= 0 {
        respondError(w, "Interval for "+k+" must be positive", http.StatusBadRequest)
        return
    }
    if v > 365 {
        respondError(w, "Interval for "+k+" cannot exceed 365 days", http.StatusBadRequest)
        return
    }
}
```

The key `k` comes from user input (a JSON object key). While this is not exploitable for XSS (the response is JSON with `Content-Type: application/json`), it could leak information about server-side processing if the key contains unusual characters, and it violates the principle of not reflecting user input in error messages.

**Risk:** Minor information disclosure. User-controlled input is reflected in responses without sanitization.

**Fix:** Validate allowed key names against a whitelist before using them in error messages, or use a generic message.

---

### LOW-05: Duplicate Detection via Error String Matching

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/labels.go:339-347`

**Description:**
The `isDuplicateError` function detects PostgreSQL unique constraint violations by checking if the error string contains `"duplicate key"` or `"23505"`:

```go
func isDuplicateError(err error) bool {
    if err == nil {
        return false
    }
    errStr := err.Error()
    return strings.Contains(errStr, "duplicate key") || strings.Contains(errStr, "23505")
}
```

This is fragile because error message formatting may change between pgx/PostgreSQL versions, and other error messages could accidentally contain these substrings. The proper approach is to check the PostgreSQL error code via the `pgconn.PgError` type.

**Risk:** Incorrect error classification could cause the handler to return a 409 Conflict when it should return a 500, or vice versa.

**Fix:** Use pgx's typed error:
```go
import "github.com/jackc/pgx/v5/pgconn"

func isDuplicateError(err error) bool {
    var pgErr *pgconn.PgError
    if errors.As(err, &pgErr) {
        return pgErr.Code == "23505"
    }
    return false
}
```

---

## INFO Findings

### INFO-01: Ambiguous Request Body Parsing in Task Creation

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/tasks.go:224-251`

**Description:**
The `CreateTask` handler first decodes the request body as `json.RawMessage`, then attempts to unmarshal it as a `BulkCreateTasksRequest`. If neither `Tasks` nor `HiveIDs` arrays are populated, it falls back to interpreting the body as a single task. This means a request like `{"hive_id": "abc", "tasks": []}` would be treated as a single task creation (since `len(bulkReq.Tasks) == 0`), which may confuse clients.

**Risk:** No security impact, but API behavior may be surprising for clients sending a bulk request with an empty tasks array.

---

### INFO-02: Encryption Service Implementation Is Sound

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/services/encryption.go`

**Description:**
The AES-256-GCM encryption implementation follows best practices:
- Uses `crypto/rand` for nonce generation (line 87: `io.ReadFull(rand.Reader, nonce)`)
- Uses Go's standard `crypto/aes` and `crypto/cipher` packages
- Properly prepends nonce to ciphertext for storage
- Validates key length (minimum 32 bytes)
- Returns `nil, nil` when no key is configured (graceful degradation)
- Tests verify round-trip correctness and ciphertext uniqueness

No issues found.

---

### INFO-03: Weather Service Has No Security Concerns

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/services/weather.go`

**Description:**
The weather service calls the public Open-Meteo API using coordinates formatted with `%.4f` (which limits coordinate precision to ~11 meters, preventing excessive precision leakage). The cache is bounded at 1000 entries with LRU eviction. No user credentials or sensitive data are passed to the external API. The implementation is clean.

---

### INFO-04: Task Effects Allowlist Is Appropriately Restrictive

**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/services/task_effects.go:317-322`

**Description:**
The auto-effects system that updates hive fields on task completion uses a strict allowlist of only 4 fields:

```go
var allowedHiveFields = map[string]bool{
    "queen_introduced_at": true,
    "queen_source":        true,
    "brood_boxes":         true,
    "honey_supers":        true,
}
```

This prevents template-defined effects from modifying arbitrary hive columns (e.g., `tenant_id`, `deleted_at`). The implementation is correctly restrictive.

---

### INFO-05: Significant Test Quality Gap -- Multiple "Documentation Tests" Do Not Test Handler Behavior

**Files:**
- `/Users/jermodelaruelle/Projects/apis/apis-server/tests/handlers/invite_test.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/tests/handlers/labels_test.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/tests/handlers/tasks_test.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/tests/handlers/task_templates_test.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/tests/handlers/task_suggestions_test.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/tests/services/activity_test.go`
- `/Users/jermodelaruelle/Projects/apis/apis-server/tests/services/weather_test.go`

**Description:**
Seven of the eighteen test files contain tests that validate the test's own expectations rather than exercising actual handler or service code. These tests use patterns like:

```go
// From invite_test.go - validates test struct, not handler behavior
func TestCreateInviteRequestValidation(t *testing.T) {
    tests := []struct{ ... }{
        {name: "missing email", email: "", expectedError: "email is required"},
    }
    for _, tt := range tests {
        if tt.email == "" && tt.expectedError == "" {
            t.Error("expected an error message") // Tests the test case, not the handler
        }
    }
}
```

These tests re-implement validation logic in the test itself rather than calling the actual HTTP handler via `httptest.NewRequest` and checking the response. They provide a false sense of coverage -- the tests pass even if the handler's validation is completely broken.

**Contrast with well-written tests in the same codebase:**
- `auth_local_test.go` -- calls actual handlers with `httptest`, checks response codes and bodies
- `audit_test.go` (handlers) -- invokes `handlers.ListAuditLog(nil)` with proper context
- `calendar_test.go` -- uses `storage.SetupTestDB(t)` for full integration testing
- `users_test.go` -- comprehensive CRUD testing with real middleware
- `encryption_test.go` -- round-trip correctness, uniqueness, error case testing

**Risk:** Security-relevant validation logic (invite token handling, task creation limits, label injection) is effectively untested at the handler level. Bugs in these handlers (including the security findings in this review) would not be caught by the existing test suite.

**Recommendation:** Rewrite the documentation-style tests to use `httptest.NewRequest`, invoke the actual handler functions, and assert on HTTP response codes and bodies. Prioritize `invite_test.go` and `tasks_test.go` given the security findings in those handlers.

---

## Summary of Findings by File

| File | Findings |
|------|----------|
| `errors.go` | CRIT-01 |
| `settings_beebrain.go` | HIGH-01 |
| `invite.go` | HIGH-02, MED-01, MED-02 |
| `audit.go` (service) | HIGH-03, MED-05 |
| `calendar.go` | MED-03, LOW-04 |
| `audit_helpers.go` | MED-04 |
| `task_suggestions.go` | MED-06 |
| `settings.go` | LOW-01 |
| `labels.go` | LOW-02, LOW-05 |
| `admin_limits.go` | LOW-03 |
| `tasks.go` | INFO-01 |
| `encryption.go` | INFO-02 |
| `weather.go` | INFO-03 |
| `task_effects.go` | INFO-04 |
| Multiple test files | INFO-05 |

---

## Remediation Priority

**Immediate (before next deploy):**
1. CRIT-01: Fix `RespondAccountLockedError` -- one-line change, high impact
2. HIGH-02: Stop exposing tokens in `ListInvites` response

**Short-term (within current sprint):**
3. HIGH-01: Add SSRF protection to Ollama endpoint validation
4. HIGH-03: Fix audit logging context handling
5. MED-01: Use server-configured base URL for invite links
6. MED-03: Add calendar date range validation

**Medium-term (next sprint):**
7. MED-02: Add use count limits to link invites
8. MED-04: Use atomic operations for global auditSvc
9. MED-05: Fix X-Forwarded-For trust model
10. MED-06: Wrap suggestion acceptance in transaction
11. INFO-05: Rewrite documentation-style tests as actual handler tests

**Low priority (backlog):**
12. LOW-01 through LOW-05: Input validation improvements
