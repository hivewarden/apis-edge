# Story 13-10: Invite Flow

## Story
**As a** tenant admin,
**I want** to invite users via multiple methods,
**So that** I can onboard team members flexibly.

## Status
- [x] Story Created
- [x] Implementation Started
- [x] Tests Written
- [x] Tests Passing
- [ ] Code Review
- [ ] Done

## Acceptance Criteria

### POST /api/users/invite (Admin only)
- [x] AC1: Method 1 (temp_password) - creates user immediately with must_change_password=true
- [x] AC2: Method 2 (email) - creates token, sends email if SMTP configured (stub for now)
- [x] AC3: Method 3 (link) - creates shareable link token (reusable)
- [x] AC4: Only admins can create invites

### GET /api/invite/{token} (Public)
- [x] AC5: Validate token (not expired, not used for single-use)
- [x] AC6: Return role, tenant name (for accept page)
- [x] AC7: Return 404 for invalid/expired/used tokens

### POST /api/invite/{token}/accept (Public)
- [x] AC8: Accept with name, email, password
- [x] AC9: Create user account
- [x] AC10: Start session (set cookie)
- [x] AC11: Validate password meets requirements

### Invite Tokens
- [x] AC12: Cryptographically random (32 bytes hex)
- [x] AC13: Configurable expiry (default 7 days)
- [x] AC14: Single-use for email invites, reusable for link invites

## Technical Design

### Storage Layer (invite_tokens.go)

```go
type InviteToken struct {
    ID        string
    TenantID  string
    Token     string     // 32-byte random hex
    Email     string     // optional, for email invites
    Role      string     // role to assign
    Type      string     // "temp_password", "email", "link"
    UsedAt    *time.Time // nil if unused
    ExpiresAt time.Time
    CreatedBy string     // user ID who created
    CreatedAt time.Time
}

func GenerateInviteToken() string
func CreateInviteToken(ctx, conn, token *InviteToken) error
func GetInviteTokenByToken(ctx, conn, token string) (*InviteToken, error)
func MarkInviteTokenUsed(ctx, conn, tokenID string) error
func ListInviteTokensByTenant(ctx, conn) ([]*InviteToken, error)
func DeleteInviteToken(ctx, conn, tokenID string) error
```

### Handlers (invite.go)

```go
// POST /api/users/invite (Admin only)
type CreateInviteRequest struct {
    Method string `json:"method"` // "temp_password", "email", "link"
    Email  string `json:"email,omitempty"`
    Role   string `json:"role"` // "admin" or "member"
    // For temp_password method:
    Password    string `json:"password,omitempty"`
    DisplayName string `json:"display_name,omitempty"`
}
func CreateInvite(pool) http.HandlerFunc

// GET /api/invite/{token} (Public)
func GetInviteInfo(pool) http.HandlerFunc

// POST /api/invite/{token}/accept (Public)
type AcceptInviteRequest struct {
    Email       string `json:"email"`
    DisplayName string `json:"display_name"`
    Password    string `json:"password"`
}
func AcceptInvite(pool) http.HandlerFunc
```

### Routes (main.go)

```go
// Admin-only route
r.With(authMiddleware, tenantMiddleware, adminOnly).Post("/api/users/invite", handlers.CreateInvite(pool))

// Public routes for accepting invites
r.Get("/api/invite/{token}", handlers.GetInviteInfo(pool))
r.Post("/api/invite/{token}/accept", handlers.AcceptInvite(pool))
```

### Frontend (InviteAccept.tsx)

- Route: /invite/{token}
- Fetch invite info on load
- Show form: display name, email (pre-filled if from email invite), password
- On submit, call POST /api/invite/{token}/accept
- On success, redirect to dashboard

## Files to Create/Modify

### Create
- `apis-server/internal/storage/invite_tokens.go` - Token storage functions
- `apis-server/internal/handlers/invite.go` - Invite HTTP handlers
- `apis-server/tests/handlers/invite_test.go` - Handler tests
- `apis-dashboard/src/pages/InviteAccept.tsx` - Accept invite page

### Modify
- `apis-server/cmd/server/main.go` - Add routes
- `apis-dashboard/src/App.tsx` - Add InviteAccept route
- `apis-dashboard/src/pages/index.ts` - Export InviteAccept

## Dependencies
- Story 13-9 (User Management) - Must be complete for user creation patterns
- Migration 0025_invite_tokens.sql - Already exists

## Testing Strategy
- Unit tests for storage functions
- Handler tests for all three methods
- Handler tests for token validation (expired, used, not found)
- Integration test for full invite flow
