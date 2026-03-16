# Story 1.4: Zitadel OIDC Integration

Status: complete

## Story

As a **user**,
I want to log in securely using my account,
So that my data is protected and I can access my personal dashboard.

## Acceptance Criteria

### AC1: Redirect to Zitadel login
**Given** I am not authenticated
**When** I navigate to any protected route
**Then** I am redirected to the Zitadel login page

### AC2: Successful login redirect
**Given** I am on the Zitadel login page
**When** I enter valid credentials and submit
**Then** I am redirected back to the dashboard
**And** my user name appears in the sidebar footer
**And** I can access all protected routes

### AC3: Logout functionality
**Given** I am authenticated
**When** I click "Logout" in the sidebar
**Then** my session is terminated
**And** I am redirected to the login page
**And** I cannot access protected routes until I log in again

### AC4: Token expiration handling
**Given** my JWT token expires
**When** I make an API request
**Then** the server returns 401 Unauthorized
**And** the dashboard redirects me to re-authenticate

### AC5: JWT validation in Go server
**Given** the Go server receives an API request
**When** it validates the JWT
**Then** it verifies the signature against Zitadel's JWKS endpoint
**And** extracts the user_id and tenant_id from claims

## Tasks / Subtasks

- [x] **Task 1: Install and configure @zitadel/react SDK** (AC: 1, 2, 3)
  - [x] 1.1: Install `@zitadel/react` package (`npm install @zitadel/react`)
  - [x] 1.2: Create `src/providers/authProvider.ts` - Zitadel OIDC configuration
  - [x] 1.3: Configure OIDC settings: authority, client_id, redirect_uri, scopes
  - [x] 1.4: Create `src/components/auth/AuthGuard.tsx` - Protected route wrapper
  - [x] 1.5: Create `src/hooks/useAuth.ts` - Custom hook for auth state

- [x] **Task 2: Configure Refine authProvider** (AC: 1, 2, 3, 4)
  - [x] 2.1: Create Refine-compatible authProvider that wraps Zitadel
  - [x] 2.2: Implement `login()` - redirect to Zitadel
  - [x] 2.3: Implement `logout()` - clear session and redirect
  - [x] 2.4: Implement `check()` - verify token validity
  - [x] 2.5: Implement `getIdentity()` - return user info from JWT
  - [x] 2.6: Implement `onError()` - handle 401 responses

- [x] **Task 3: Add Login page and callback route** (AC: 1, 2)
  - [x] 3.1: Create `src/pages/Login.tsx` - Login button that triggers OIDC flow
  - [x] 3.2: Create `src/pages/Callback.tsx` - Handle OIDC callback with code exchange
  - [x] 3.3: Add routes: `/login`, `/callback` to App.tsx
  - [x] 3.4: Configure redirect_uri to match `/callback` route

- [x] **Task 4: Update sidebar with user info and logout** (AC: 2, 3)
  - [x] 4.1: Update `AppLayout.tsx` - Add user section at sidebar bottom
  - [x] 4.2: Display user name/email from JWT claims
  - [x] 4.3: Add logout button that triggers authProvider.logout()
  - [x] 4.4: Style user section with brownBramble background, coconutCream text

- [x] **Task 5: Create Go JWT validation middleware** (AC: 4, 5)
  - [x] 5.1: Install go-jose library: `go get github.com/go-jose/go-jose/v4`
  - [x] 5.2: Create `internal/middleware/auth.go` - JWT validation middleware
  - [x] 5.3: Implement JWKS fetching with caching (refresh every 1 hour)
  - [x] 5.4: Validate JWT signature, expiration, issuer
  - [x] 5.5: Extract claims: sub (user_id), org_id (tenant_id), email, name, roles
  - [x] 5.6: Set claims in request context for handlers

- [x] **Task 6: Add auth config endpoint** (AC: 1)
  - [x] 6.1: Create `GET /api/auth/config` endpoint (unauthenticated)
  - [x] 6.2: Return Zitadel issuer URL and client_id from environment
  - [x] 6.3: Dashboard can fetch auth config from server (optional)

- [x] **Task 7: Protect API routes** (AC: 4, 5)
  - [x] 7.1: Apply auth middleware to all `/api/*` routes except `/api/health` and `/api/auth/config`
  - [x] 7.2: Return 401 with JSON error for invalid/missing tokens
  - [x] 7.3: Add CORS configuration for dashboard origins

- [x] **Task 8: Testing** (AC: 1, 2, 3, 4, 5)
  - [x] 8.1: Test Login page renders login button
  - [x] 8.2: Test AuthGuard redirects unauthenticated users
  - [x] 8.3: Test callback route processes authorization code
  - [x] 8.4: Test callback shows error on authentication failure
  - [x] 8.5: Test Go middleware rejects requests without valid JWT
  - [x] 8.6: Test Go middleware rejects invalid token formats
  - [x] 8.7: Test Go claims extraction and context helpers

## Dev Notes

### OIDC Flow Overview

This story implements the **Authorization Code Flow with PKCE** (Proof Key for Code Exchange), which is the recommended flow for SPAs:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Zitadel   │────▶│ APIS Server │
│   (React)   │◀────│   (IdP)     │◀────│   (Go+Chi)  │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                    │
      │  1. Login click    │                    │
      │───────────────────▶│                    │
      │  (with PKCE code   │                    │
      │   challenge)       │                    │
      │                    │                    │
      │  2. User auth      │                    │
      │◀───────────────────│                    │
      │                    │                    │
      │  3. Auth code      │                    │
      │◀───────────────────│                    │
      │                    │                    │
      │  4. Exchange code  │                    │
      │───────────────────▶│                    │
      │  (with code        │                    │
      │   verifier)        │                    │
      │                    │                    │
      │  5. JWT tokens     │                    │
      │◀───────────────────│                    │
      │                    │                    │
      │  6. API call + JWT │                    │
      │────────────────────┼───────────────────▶│
      │                    │                    │
      │                    │  7. Validate JWT   │
      │                    │     (JWKS)         │
      │                    │◀───────────────────│
      │                    │                    │
      │  8. Response       │                    │
      │◀───────────────────┼────────────────────│
```

### Zitadel React SDK Configuration

The @zitadel/react SDK wraps `oidc-client-ts` and provides React-specific hooks.

```typescript
// src/providers/authProvider.ts
import { createZitadelAuth, ZitadelConfig } from "@zitadel/react";

const config: ZitadelConfig = {
  authority: import.meta.env.VITE_ZITADEL_AUTHORITY || "http://localhost:8080",
  client_id: import.meta.env.VITE_ZITADEL_CLIENT_ID || "",
  redirect_uri: `${window.location.origin}/callback`,
  post_logout_redirect_uri: `${window.location.origin}/login`,
  scope: "openid profile email urn:zitadel:iam:org:id:{org_id}",
};

export const zitadelAuth = createZitadelAuth(config);
```

### Refine AuthProvider Interface

Refine requires an authProvider with specific methods:

```typescript
// src/providers/refineAuthProvider.ts
import type { AuthProvider } from "@refinedev/core";
import { zitadelAuth } from "./authProvider";

export const authProvider: AuthProvider = {
  login: async () => {
    // Trigger OIDC login flow
    await zitadelAuth.authorize();
    return { success: true };
  },

  logout: async () => {
    await zitadelAuth.signout();
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    const user = await zitadelAuth.userManager.getUser();
    if (user && !user.expired) {
      return { authenticated: true };
    }
    return { authenticated: false, redirectTo: "/login" };
  },

  getIdentity: async () => {
    const user = await zitadelAuth.userManager.getUser();
    if (user) {
      return {
        id: user.profile.sub,
        name: user.profile.name || user.profile.preferred_username,
        email: user.profile.email,
        avatar: user.profile.picture,
      };
    }
    return null;
  },

  onError: async (error) => {
    if (error.statusCode === 401) {
      return { logout: true, redirectTo: "/login" };
    }
    return {};
  },
};
```

### JWT Claims Structure (from Zitadel)

```json
{
  "sub": "user_abc123",
  "urn:zitadel:iam:org:id": "tenant_xyz789",
  "urn:zitadel:iam:org:name": "APIS",
  "urn:zitadel:iam:user:roles": ["owner"],
  "email": "admin@apis.local",
  "email_verified": true,
  "name": "Admin User",
  "preferred_username": "admin",
  "exp": 1737590400,
  "iat": 1737504000,
  "iss": "http://localhost:8080"
}
```

### Go JWT Validation Middleware

Use the `zitadel/oidc` library for JWT validation:

```go
// internal/middleware/auth.go
package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/zitadel/oidc/v3/pkg/client/rp"
	"github.com/zitadel/oidc/v3/pkg/oidc"
)

type Claims struct {
	UserID   string   `json:"sub"`
	OrgID    string   `json:"urn:zitadel:iam:org:id"`
	Email    string   `json:"email"`
	Roles    []string `json:"urn:zitadel:iam:user:roles"`
}

type ctxKey string
const ClaimsKey ctxKey = "claims"

func AuthMiddleware(issuer string) func(http.Handler) http.Handler {
	// Initialize OIDC resource provider
	provider, err := rp.NewRelyingPartyOIDC(
		context.Background(),
		issuer,
		"", // no client_id needed for validation
		"", // no client_secret needed for validation
		"", // no redirect_uri needed for validation
	)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create OIDC provider")
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract Bearer token
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				respondUnauthorized(w, "missing authorization header")
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || parts[0] != "Bearer" {
				respondUnauthorized(w, "invalid authorization header format")
				return
			}
			token := parts[1]

			// Validate token using JWKS
			claims, err := rp.VerifyAccessToken[*oidc.AccessTokenClaims](
				r.Context(),
				token,
				provider,
			)
			if err != nil {
				log.Warn().Err(err).Msg("JWT validation failed")
				respondUnauthorized(w, "invalid token")
				return
			}

			// Check expiration
			if time.Now().After(claims.GetExpiration()) {
				respondUnauthorized(w, "token expired")
				return
			}

			// Extract custom claims
			userClaims := &Claims{
				UserID: claims.Subject,
				OrgID:  claims.Claims["urn:zitadel:iam:org:id"].(string),
				Email:  claims.Claims["email"].(string),
			}

			// Add claims to context
			ctx := context.WithValue(r.Context(), ClaimsKey, userClaims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func respondUnauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	w.Write([]byte(`{"error":"` + msg + `","code":401}`))
}

// Helper to get claims from context
func GetClaims(ctx context.Context) *Claims {
	claims, _ := ctx.Value(ClaimsKey).(*Claims)
	return claims
}
```

### Applying Middleware to Routes

```go
// cmd/server/main.go
func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Unauthenticated routes
	r.Get("/api/health", handlers.GetHealth)
	r.Get("/api/auth/config", handlers.GetAuthConfig)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(authmw.AuthMiddleware(os.Getenv("ZITADEL_ISSUER")))

		// All other API routes go here
		r.Get("/api/units", handlers.ListUnits)
		// ... etc
	})
}
```

### Auth Config Endpoint

```go
// internal/handlers/auth.go
package handlers

import (
	"encoding/json"
	"net/http"
	"os"
)

type AuthConfig struct {
	Issuer   string `json:"issuer"`
	ClientID string `json:"client_id"`
}

func GetAuthConfig(w http.ResponseWriter, r *http.Request) {
	config := AuthConfig{
		Issuer:   os.Getenv("ZITADEL_ISSUER"),
		ClientID: os.Getenv("ZITADEL_CLIENT_ID"),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}
```

### File Structure

```
apis-dashboard/
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── AuthGuard.tsx      # NEW: Protected route wrapper
│   │   │   └── index.ts
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx      # MODIFY: Add user section
│   │   │   └── ...
│   ├── pages/
│   │   ├── Login.tsx              # NEW: Login page
│   │   ├── Callback.tsx           # NEW: OIDC callback handler
│   │   └── ...
│   ├── providers/
│   │   ├── authProvider.ts        # NEW: Zitadel configuration
│   │   └── refineAuthProvider.ts  # NEW: Refine auth integration
│   ├── hooks/
│   │   └── useAuth.ts             # NEW: Auth hook
│   ├── App.tsx                    # MODIFY: Add authProvider, routes
│   └── ...

apis-server/
├── internal/
│   ├── middleware/
│   │   └── auth.go                # NEW: JWT validation middleware
│   ├── handlers/
│   │   ├── auth.go                # NEW: Auth config endpoint
│   │   ├── health.go              # EXISTS
│   │   └── ...
├── cmd/server/
│   └── main.go                    # MODIFY: Add auth middleware
```

### Architecture Compliance

**From Architecture Document:**
- AR2: Use Zitadel for OIDC/OAuth2 identity management
- AR14: Dashboard uses OIDC + JWT (Zitadel issues tokens, server validates)
- AR23: Go middleware validates JWT on all `/api/*` routes except `/api/health`

**JWT Claims Mapping:**
- `sub` → user_id
- `urn:zitadel:iam:org:id` → tenant_id (for RLS in Story 1.5)
- `urn:zitadel:iam:user:roles` → roles array

**From UX Design Specification:**
- User profile area in sidebar footer shows avatar, name, logout option
- Login page should be clean, simple with single "Login with Zitadel" button

### Previous Story Intelligence

**From Story 1-3:**
- AppLayout already exists with sidebar structure
- Sidebar has brownBramble background (#662604), coconutCream text (#fbf9e7)
- Use Grid.useBreakpoint() for responsive detection
- Persist preferences to localStorage
- Tests use @testing-library/react with ConfigProvider wrapper

**Patterns to follow:**
- Create barrel exports (index.ts) for new directories
- Use TypeScript with strict types
- React Router v7 future flags already configured
- Ant Design theme tokens from apisTheme

**From Story 1-1:**
- Docker Compose already has Zitadel configured on port 8080
- Environment variables: ZITADEL_MASTERKEY, ZITADEL_ADMIN_PASSWORD
- Zitadel first org: "APIS" with admin user

### Environment Variables

**Dashboard (.env):**
```env
VITE_API_URL=http://localhost:3000
VITE_ZITADEL_AUTHORITY=http://localhost:8080
VITE_ZITADEL_CLIENT_ID=<from Zitadel console after app creation>
```

**Server (.env):**
```env
ZITADEL_ISSUER=http://localhost:8080
ZITADEL_CLIENT_ID=<from Zitadel console after app creation>
```

### Zitadel Application Setup (Manual Step)

After docker-compose is running, manually create an application in Zitadel:

1. Go to http://localhost:8080
2. Login as admin (password from ZITADEL_ADMIN_PASSWORD)
3. Create new Project "APIS Dashboard"
4. Create new Application:
   - Type: User Agent (SPA)
   - Auth Method: PKCE
   - Redirect URIs: `http://localhost:5173/callback`
   - Post Logout URIs: `http://localhost:5173/login`
5. Copy Client ID to environment variables

### Testing Strategy

**Dashboard Tests:**
```typescript
// tests/auth/AuthGuard.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthGuard } from '../src/components/auth/AuthGuard';

// Mock the auth provider
vi.mock('../src/providers/authProvider', () => ({
  zitadelAuth: {
    userManager: {
      getUser: vi.fn(),
    },
  },
}));

describe('AuthGuard', () => {
  it('redirects to login when not authenticated', async () => {
    // ... test implementation
  });

  it('renders children when authenticated', async () => {
    // ... test implementation
  });
});
```

**Server Tests:**
```go
// internal/middleware/auth_test.go
func TestAuthMiddleware_ValidToken(t *testing.T) {
	// Test with valid JWT
}

func TestAuthMiddleware_MissingToken(t *testing.T) {
	// Test returns 401 when no token
}

func TestAuthMiddleware_ExpiredToken(t *testing.T) {
	// Test returns 401 when token expired
}
```

### Common Pitfalls to Avoid

1. **Don't hardcode Zitadel URLs** - Use environment variables
2. **Don't skip PKCE** - Required for SPA security
3. **Don't store tokens in localStorage** - Use sessionStorage or memory (handled by oidc-client-ts)
4. **Don't call JWKS endpoint on every request** - Cache with 1-hour TTL
5. **Don't forget to handle token refresh** - oidc-client-ts handles this automatically
6. **Don't assume org_id claim exists** - Validate claim presence before use

### Security Considerations

- Use HTTPS in production (TLS termination at load balancer)
- Validate issuer matches expected Zitadel instance
- Validate audience includes the client_id
- Set appropriate CORS headers on server
- Never log JWT tokens (log user_id only)
- Use SameSite=Strict cookies where applicable

### References

- [Source: epics.md - Story 1.4 acceptance criteria]
- [Source: architecture.md - Zitadel Integration section]
- [Source: architecture.md - JWT Claims Structure]
- [Source: architecture.md - Go Middleware pattern]
- [Source: Story 1-3 - AppLayout sidebar patterns]
- [Source: docker-compose.yml - Zitadel service configuration]
- [Zitadel React SDK](https://github.com/zitadel/zitadel-react)
- [Zitadel OIDC Go Library](https://github.com/zitadel/oidc)
- [Refine AuthProvider](https://refine.dev/docs/authentication/auth-provider/)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Fixed Ant Design Spin `tip` prop not rendering by using separate Paragraph element
- Used go-jose/go-jose/v4 library instead of zitadel/oidc for JWT validation (simpler API)
- Added matchMedia and ResizeObserver mocks to test setup for Ant Design components

### Completion Notes List

1. **OIDC Configuration**: Uses @zitadel/react SDK which wraps oidc-client-ts for PKCE-based auth flow
2. **JWT Validation**: Go middleware uses go-jose library for JWKS fetching and JWT parsing
3. **JWKS Caching**: 1-hour cache TTL with automatic refresh on expiry
4. **Claims Extraction**: Middleware extracts sub, org_id, email, name, roles from JWT
5. **CORS Configuration**: Server configured to accept requests from localhost:5173 (dev dashboard)
6. **Route Protection**: Public routes (/api/health, /api/auth/config), all others require valid JWT
7. **User Profile**: Sidebar displays user name/email with logout button, adapts to collapsed state
8. **Test Coverage**: 52 dashboard tests passing, Go handler and middleware tests passing

### File List

**New Files:**
- `apis-dashboard/src/providers/authProvider.ts` - Zitadel OIDC configuration
- `apis-dashboard/src/providers/refineAuthProvider.ts` - Refine-compatible auth provider
- `apis-dashboard/src/providers/index.ts` - Barrel export for providers
- `apis-dashboard/src/components/auth/AuthGuard.tsx` - Protected route wrapper
- `apis-dashboard/src/components/auth/index.ts` - Barrel export for auth components
- `apis-dashboard/src/hooks/useAuth.ts` - Custom auth state hook
- `apis-dashboard/src/pages/Login.tsx` - Login page with Zitadel button
- `apis-dashboard/src/pages/Callback.tsx` - OIDC callback handler
- `apis-dashboard/tests/auth/Login.test.tsx` - Login page tests
- `apis-dashboard/tests/auth/AuthGuard.test.tsx` - AuthGuard tests
- `apis-dashboard/tests/auth/Callback.test.tsx` - Callback page tests
- `apis-server/internal/middleware/auth.go` - JWT validation middleware
- `apis-server/internal/middleware/auth_test.go` - Middleware tests
- `apis-server/internal/handlers/auth.go` - Auth config endpoint
- `apis-server/internal/handlers/auth_test.go` - Handler tests
- `apis-server/internal/handlers/me.go` - Current user endpoint (added in review)
- `apis-server/internal/handlers/me_test.go` - Me endpoint tests (added in review)

**Modified Files:**
- `apis-dashboard/src/App.tsx` - Added authProvider, routes for /login, /callback
- `apis-dashboard/src/components/layout/AppLayout.tsx` - Added user profile section
- `apis-dashboard/tests/setup.ts` - Added matchMedia and ResizeObserver mocks
- `apis-server/cmd/server/main.go` - Added CORS, auth middleware, route groups, /api/me endpoint
- `apis-server/go.mod` - Added go-jose dependency
- `apis-server/go.sum` - Updated with new dependencies

---

## Code Review Record

### Review Date
2026-01-22

### Reviewer
Claude Opus 4.5 (Adversarial Code Review Agent)

### Issues Found: 8 (2 High, 4 Medium, 2 Low)

### Issues Fixed

**HIGH SEVERITY (2):**
1. ✅ **H1: Missing org_id validation in Go middleware** - Added validation to reject tokens without organization claim (multi-tenant security)
2. ✅ **H2: Protected route group was empty** - Added `/api/me` endpoint that returns authenticated user info, demonstrating middleware works

**MEDIUM SEVERITY (4):**
1. ⚠️ **M1: AuthGuard bypasses authProvider.check()** - Noted but not changed; AuthGuard wraps Refine app so direct userManager access is appropriate
2. ✅ **M2: Unused import in AuthGuard.tsx** - Removed `loginWithReturnTo` import
3. ⚠️ **M3: Tests mock OIDC entirely** - Acknowledged limitation; integration tests require running Zitadel
4. ✅ **M4: Missing error handling in Login.tsx** - Added error state with Alert and retry button

**LOW SEVERITY (2):**
1. ✅ **L1: Test wrappers missing React Router v7 flags** - Added `future` prop to all MemoryRouter instances
2. ⚠️ **L2: Type assertion for OIDC state** - Minor; not changed as it's a common pattern

### Test Results After Fixes
- Dashboard: 53 tests passing (no React Router warnings)
- Go Server: All tests passing (handlers + middleware)

### Files Changed During Review
- `apis-server/internal/middleware/auth.go` - Added org_id validation, changed interface{} to any
- `apis-server/internal/handlers/me.go` - NEW: /api/me endpoint
- `apis-server/internal/handlers/me_test.go` - NEW: Me endpoint tests
- `apis-server/cmd/server/main.go` - Added /api/me route to protected group
- `apis-dashboard/src/components/auth/AuthGuard.tsx` - Removed unused import
- `apis-dashboard/src/pages/Login.tsx` - Added error state and retry functionality
- `apis-dashboard/tests/auth/Login.test.tsx` - Added v7 future flags
- `apis-dashboard/tests/auth/AuthGuard.test.tsx` - Added v7 future flags
- `apis-dashboard/tests/auth/Callback.test.tsx` - Added v7 future flags

---

## Code Review Record (Second Review)

### Review Date
2026-01-22

### Reviewer
Claude Opus 4.5 (Adversarial Code Review Agent)

### Issues Found: 4 (1 Medium, 3 Low)

### Issues Fixed

**MEDIUM SEVERITY (1):**
1. ✅ **M5: Missing test for org_id validation** - Refactored validation into testable `ValidateRequiredClaims` function with comprehensive tests

**LOW SEVERITY (3):**
1. ✅ **L3: No test for Login error state** - Added 2 tests: error alert display and generic error message handling
2. ✅ **L4: Duplicate API_URL definition** - Created `src/config.ts` as single source of truth for all config values
3. ✅ **L5: setTimeout cleanup in Callback.tsx** - Added useRef to track timeout and proper cleanup in useEffect return

### Test Results After Fixes
- Dashboard: 55 tests passing (up from 53)
- Go Server: All tests passing (handlers + middleware including new validation tests)

### Files Changed During Second Review
- `apis-server/internal/middleware/auth.go` - Extracted ValidateRequiredClaims function for testability
- `apis-server/internal/middleware/auth_test.go` - Added TestValidateRequiredClaims with 3 test cases
- `apis-dashboard/src/config.ts` - NEW: Centralized configuration (API_URL, ZITADEL_AUTHORITY, ZITADEL_CLIENT_ID)
- `apis-dashboard/src/providers/apiClient.ts` - Updated to import from config.ts
- `apis-dashboard/src/providers/dataProvider.ts` - Updated to import from config.ts
- `apis-dashboard/src/providers/authProvider.ts` - Updated to import from config.ts
- `apis-dashboard/src/pages/Callback.tsx` - Added useRef for setTimeout cleanup
- `apis-dashboard/tests/auth/Login.test.tsx` - Added error state tests

### Review Outcome
**PASSED** - All issues from both reviews have been addressed. Story is ready for epic completion.
