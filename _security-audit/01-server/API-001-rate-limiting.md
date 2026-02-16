# API-001: Rate Limiting and API Security Vulnerabilities

**Severity:** MEDIUM to HIGH (varies by issue)
**OWASP Categories:** API4:2023 Unrestricted Resource Consumption, API7:2023 Server-Side Request Forgery, API8:2023 Security Misconfiguration
**Audit Date:** 2026-01-31
**Auditor:** Security Audit Agent

---

## Executive Summary

The APIS Go server has rate limiting implemented for authentication endpoints and select data export operations, but several API endpoints lack rate limiting protection. Additionally, there are information disclosure risks in error messages, missing security headers, and other API security concerns that could be exploited by attackers.

---

## Finding 1: Incomplete Rate Limiting Coverage

**Severity:** HIGH
**OWASP:** API4:2023 Unrestricted Resource Consumption

### Description

Rate limiting is only applied to a subset of endpoints. Critical data-modifying and resource-intensive endpoints lack rate limiting, enabling denial of service and resource exhaustion attacks.

### Affected Files and Lines

- `/Users/jermodelaruelle/Projects/apis/apis-server/cmd/server/main.go` (lines 163-171, 443-456)

### Rate-Limited Endpoints (Good)

```go
// Lines 163-171 - Auth endpoints are rate limited
loginRateLimiters := handlers.NewLoginRateLimiters()
setupRateLimiter := handlers.NewSetupRateLimiter()
inviteAcceptRateLimiter := handlers.NewInviteAcceptRateLimiter()
changePasswordRateLimiter := handlers.NewChangePasswordRateLimiter()

// Lines 443-456 - Export and transcribe are rate limited
r.Group(func(r chi.Router) {
    exportLimiter := authmw.NewRateLimiter(10, time.Minute)
    r.Use(authmw.RateLimitMiddleware(exportLimiter))
    r.Post("/api/export", handlers.GenerateExport)
})
```

### Unprotected Endpoints (Vulnerable)

The following resource-intensive endpoints have NO rate limiting:

1. **Clip Upload** - `POST /api/units/clips` (line 519)
2. **Detection Creation** - `POST /api/units/detections` (line 516)
3. **Hive/Inspection CRUD** - All hive, inspection, treatment, feeding endpoints
4. **BeeBrain Analysis** - `GET /api/beebrain/*` endpoints (lines 406-413)
5. **Season Recap** - `POST /api/recap/regenerate` (line 431)

### Attack Vector

An attacker can:
1. Flood the clip upload endpoint with large files, exhausting storage
2. Create millions of detection events to overload the database
3. Trigger expensive BeeBrain analysis computations repeatedly
4. Regenerate season recaps repeatedly causing CPU exhaustion

### Remediation

Add rate limiting to all resource-intensive endpoints:

```go
// Add rate limiters for resource-intensive endpoints
clipUploadLimiter := authmw.NewRateLimiter(30, time.Minute) // 30 clips/min
detectionLimiter := authmw.NewRateLimiter(100, time.Minute) // 100 detections/min
beeBrainLimiter := authmw.NewRateLimiter(10, time.Minute)   // 10 analyses/min

// Apply to unit routes
r.Group(func(r chi.Router) {
    r.Use(authmw.UnitAuth(storage.DB))
    r.Use(authmw.RateLimitMiddleware(clipUploadLimiter))
    r.Post("/api/units/clips", handlers.UploadClip)
})
```

### Acceptance Criteria

- [ ] All POST/PUT/DELETE endpoints have rate limiting
- [ ] Rate limits are configurable via environment variables
- [ ] Rate limit responses include Retry-After header (already implemented in existing code)
- [ ] Unit test verifies rate limiting behavior

---

## Finding 2: Health Endpoint Information Disclosure

**Severity:** MEDIUM
**OWASP:** API8:2023 Security Misconfiguration

### Description

The health endpoint exposes detailed error messages from database and Zitadel connectivity checks, potentially revealing internal infrastructure details to unauthenticated users.

### Affected Files and Lines

- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/health.go` (lines 144, 167, 176)

### Vulnerable Code

```go
// Line 144 - Database error exposed
if err := h.pool.Ping(ctx); err != nil {
    log.Warn().Err(err).Msg("health: database ping failed")
    return "error: " + err.Error()  // VULNERABILITY: Exposes raw error
}

// Line 167 - Zitadel connection error exposed
if err != nil {
    return "error: " + err.Error()  // VULNERABILITY: Exposes connection details
}

// Line 176 - Zitadel URL exposed in error
if err != nil {
    log.Warn().Err(err).Str("url", discoveryURL).Msg("health: zitadel check failed")
    return "error: " + err.Error()  // VULNERABILITY: Exposes URL
}
```

### Attack Vector

An attacker can:
1. Probe `/api/health` to discover database type, version, connection issues
2. Learn internal DNS names (e.g., `zitadel:8080` vs `localhost:8080`)
3. Identify infrastructure misconfigurations
4. Time connection errors to fingerprint network topology

### Remediation

Return generic error messages to clients while logging details internally:

```go
func (h *HealthHandler) checkDatabase(ctx context.Context) string {
    if h.pool == nil {
        return "unavailable"
    }
    ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
    defer cancel()

    if err := h.pool.Ping(ctx); err != nil {
        log.Warn().Err(err).Msg("health: database ping failed")
        return "unavailable"  // Generic message for clients
    }
    return "ok"
}

func (h *HealthHandler) checkZitadel(ctx context.Context) string {
    // ... similar pattern
    if err != nil {
        log.Warn().Err(err).Str("url", discoveryURL).Msg("health: zitadel check failed")
        return "unavailable"  // Don't expose internal details
    }
    return "ok"
}
```

### Acceptance Criteria

- [ ] Health endpoint returns only "ok" or "unavailable" status
- [ ] Detailed errors are logged server-side only
- [ ] No internal hostnames, ports, or error messages exposed

---

## Finding 3: Missing Content-Security-Policy Header

**Severity:** MEDIUM
**OWASP:** API8:2023 Security Misconfiguration

### Description

The security headers middleware does not set Content-Security-Policy (CSP) header. While the comment mentions CSP should be handled by reverse proxy, API-only responses should still include a restrictive CSP to prevent potential XSS in error messages rendered by browsers.

### Affected Files and Lines

- `/Users/jermodelaruelle/Projects/apis/apis-server/internal/middleware/security.go` (lines 14-18)

### Current Implementation

```go
// Lines 14-18 - Note says CSP not included
// Note: Content-Security-Policy and Strict-Transport-Security are not included here
// as they require application-specific configuration and are typically handled by
// a reverse proxy (e.g., BunkerWeb) in production deployments.
```

Only these headers are set (lines 24-43):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

### Attack Vector

Without CSP:
1. Reflected XSS in error messages could execute scripts
2. JSON responses opened in browser could be exploited
3. Data exfiltration via injected resources

### Remediation

Add a restrictive CSP header appropriate for an API:

```go
func SecurityHeaders(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("X-Frame-Options", "DENY")
        w.Header().Set("X-XSS-Protection", "1; mode=block")

        // Add CSP for API responses - very restrictive
        // Prevents any scripts, styles, or resources from loading
        w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")

        // Prevent caching of authenticated responses
        if r.Header.Get("Authorization") != "" || hasCookie(r, "apis_session") {
            w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
        }

        next.ServeHTTP(w, r)
    })
}
```

### Acceptance Criteria

- [ ] CSP header set on all responses: `default-src 'none'; frame-ancestors 'none'`
- [ ] Authenticated responses include `Cache-Control: no-store`
- [ ] Security headers verified in integration tests

---

## Finding 4: CORS Wildcard Risk in Configuration

**Severity:** MEDIUM
**OWASP:** API8:2023 Security Misconfiguration

### Description

CORS configuration allows arbitrary origins via environment variable without validation. If misconfigured with wildcards or overly broad origins, cross-origin attacks become possible.

### Affected Files and Lines

- `/Users/jermodelaruelle/Projects/apis/apis-server/cmd/server/main.go` (lines 143-160)

### Vulnerable Code

```go
// Lines 143-150
corsOrigins := []string{"http://localhost:5173", "http://localhost:3000"}
if envOrigins := os.Getenv("CORS_ALLOWED_ORIGINS"); envOrigins != "" {
    corsOrigins = strings.Split(envOrigins, ",")
    // Trim whitespace from each origin
    for i := range corsOrigins {
        corsOrigins[i] = strings.TrimSpace(corsOrigins[i])
    }
}

// Line 153-160 - No validation of origins
corsHandler := cors.New(cors.Options{
    AllowedOrigins:   corsOrigins,  // Could contain "*" or malicious origins
    AllowCredentials: true,         // DANGER: Credentials + wildcard = vulnerability
    // ...
})
```

### Attack Vector

If `CORS_ALLOWED_ORIGINS=*` is set (common mistake):
1. Any website can make authenticated requests
2. Session cookies (`apis_session`) are sent cross-origin
3. Complete account takeover via CSRF-like attacks

### Remediation

Add origin validation and prevent dangerous configurations:

```go
func validateCORSOrigins(origins []string) ([]string, error) {
    validated := make([]string, 0, len(origins))
    for _, origin := range origins {
        origin = strings.TrimSpace(origin)
        if origin == "" {
            continue
        }
        // Reject wildcards when credentials are allowed
        if origin == "*" {
            return nil, fmt.Errorf("wildcard CORS origin not allowed with credentials")
        }
        // Validate URL format
        u, err := url.Parse(origin)
        if err != nil || u.Scheme == "" || u.Host == "" {
            return nil, fmt.Errorf("invalid CORS origin: %s", origin)
        }
        // Only allow HTTPS in production
        if os.Getenv("ENV") == "production" && u.Scheme != "https" {
            return nil, fmt.Errorf("HTTPS required for CORS origins in production: %s", origin)
        }
        validated = append(validated, origin)
    }
    return validated, nil
}
```

### Acceptance Criteria

- [ ] Wildcard origin rejected when credentials are enabled
- [ ] Origins validated as proper URLs
- [ ] Production requires HTTPS origins
- [ ] Invalid CORS configuration fails fast at startup

---

## Finding 5: Error Message Information Leakage

**Severity:** LOW
**OWASP:** API3:2023 Broken Object Property Level Authorization

### Description

Several error messages reveal information about system state that could aid attackers in reconnaissance.

### Affected Files and Lines

Multiple handler files contain revealing error messages:

1. `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/sites.go` (line 282):
```go
respondError(w, "Cannot delete site with assigned units. Reassign or delete units first.", http.StatusConflict)
// Reveals: Site-unit relationship exists, deletion constraint
```

2. `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/users.go` (lines 255, 333, 337, 358):
```go
respondError(w, "Email already exists", http.StatusConflict)           // User enumeration
respondError(w, "Cannot demote yourself", http.StatusBadRequest)        // Reveals current role
respondError(w, "Cannot deactivate yourself", http.StatusBadRequest)    // Reveals active status
respondError(w, "Cannot remove the last admin", http.StatusBadRequest)  // Reveals admin count
```

3. `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/units.go` (line 221):
```go
respondError(w, "A unit with this serial number already exists", http.StatusConflict)
// Allows serial number enumeration
```

### Attack Vector

1. **User Enumeration**: "Email already exists" confirms valid email addresses
2. **Role Discovery**: Error messages reveal user roles and admin count
3. **Resource Enumeration**: Conflict errors confirm resource existence

### Remediation

Use generic error messages for security-sensitive operations:

```go
// User creation - prevent enumeration
if errors.As(err, &pgErr) && pgErr.Code == "23505" {
    // Log the actual error for debugging
    log.Debug().Str("email", req.Email).Msg("handler: duplicate email attempted")
    // Return generic message
    respondError(w, "Unable to create user", http.StatusBadRequest)
    return
}

// Unit serial - prevent enumeration
if errors.Is(err, storage.ErrDuplicateSerial) {
    respondError(w, "Unable to register unit", http.StatusBadRequest)
    return
}
```

### Acceptance Criteria

- [ ] Duplicate email/serial returns generic error
- [ ] Admin count not revealed in error messages
- [ ] Role-related errors use generic messages
- [ ] All enumeration-enabling errors reviewed and fixed

---

## Finding 6: Missing Request Size Limits on Most Endpoints

**Severity:** MEDIUM
**OWASP:** API4:2023 Unrestricted Resource Consumption

### Description

While the clip upload endpoint has a 10MB limit, most other endpoints that accept JSON bodies have no explicit size limits, allowing attackers to send extremely large payloads.

### Affected Files and Lines

- `/Users/jermodelaruelle/Projects/apis/apis-server/cmd/server/main.go` - No global body size limit
- All handler files using `json.NewDecoder(r.Body).Decode()` without limits

### Example Vulnerable Code

```go
// handlers/sites.go line 128
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
    respondError(w, "Invalid request body", http.StatusBadRequest)
    return
}
// No limit on request body size
```

### Attack Vector

An attacker can:
1. Send multi-gigabyte JSON bodies to exhaust server memory
2. Cause OOM conditions leading to service crash
3. Trigger garbage collection storms affecting performance

### Remediation

Add a middleware to limit request body sizes:

```go
// middleware/bodylimit.go
func BodyLimitMiddleware(maxSize int64) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            if r.ContentLength > maxSize {
                respondError(w, "Request body too large", http.StatusRequestEntityTooLarge)
                return
            }
            r.Body = http.MaxBytesReader(w, r.Body, maxSize)
            next.ServeHTTP(w, r)
        })
    }
}

// main.go - Apply globally
r.Use(BodyLimitMiddleware(1 << 20)) // 1MB default limit for JSON
```

### Acceptance Criteria

- [ ] Global body size limit applied (1MB for JSON endpoints)
- [ ] Clip upload endpoint exempt (keeps 10MB limit)
- [ ] 413 response returned for oversized requests
- [ ] Middleware tested with large payloads

---

## Finding 7: HTTP Method Not Explicitly Restricted

**Severity:** LOW
**OWASP:** API8:2023 Security Misconfiguration

### Description

Chi router allows any HTTP method by default. While specific routes define methods, unexpected methods might be processed or return confusing errors.

### Affected Files and Lines

- `/Users/jermodelaruelle/Projects/apis/apis-server/cmd/server/main.go` - All route definitions

### Current Behavior

Accessing `OPTIONS /api/sites` returns different behavior than `PUT /api/sites` (which should be method not allowed).

### Remediation

This is mitigated by Chi's routing (wrong method returns 405), but consider adding explicit OPTIONS handling for security scanners:

```go
// Add explicit 405 handler for unsupported methods
r.MethodNotAllowed(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusMethodNotAllowed)
    json.NewEncoder(w).Encode(map[string]any{
        "error": "Method not allowed",
        "code":  405,
    })
}))
```

### Acceptance Criteria

- [ ] 405 responses are JSON formatted
- [ ] Allow header is set with permitted methods
- [ ] Security scanners don't flag method confusion

---

## Summary Table

| Finding | Severity | OWASP | Remediation Effort |
|---------|----------|-------|-------------------|
| 1. Incomplete Rate Limiting | HIGH | API4:2023 | Medium |
| 2. Health Info Disclosure | MEDIUM | API8:2023 | Low |
| 3. Missing CSP Header | MEDIUM | API8:2023 | Low |
| 4. CORS Wildcard Risk | MEDIUM | API8:2023 | Low |
| 5. Error Info Leakage | LOW | API3:2023 | Medium |
| 6. Missing Body Size Limits | MEDIUM | API4:2023 | Low |
| 7. HTTP Method Handling | LOW | API8:2023 | Low |

---

## Recommended Priority

1. **Immediate (Week 1)**: Finding 1 (Rate Limiting) - Highest risk of DoS
2. **High Priority (Week 2)**: Findings 2, 4, 6 - Info disclosure and resource exhaustion
3. **Medium Priority (Week 3)**: Findings 3, 5 - Defense in depth improvements
4. **Low Priority (Week 4)**: Finding 7 - Polish and compliance

---

## References

- OWASP API Security Top 10 2023: https://owasp.org/API-Security/
- OWASP Rate Limiting: https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html
- RFC 6585 - 429 Too Many Requests: https://tools.ietf.org/html/rfc6585
