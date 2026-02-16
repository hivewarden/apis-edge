# Story 13.22: Dual-Mode CI Testing

Status: dev-complete

## Story

As a **developer**,
I want **CI to run tests in both auth modes**,
so that **changes work correctly in both standalone and SaaS deployments**.

## Acceptance Criteria

1. **AC1: CI workflow with matrix strategy**
   - GitHub Actions workflow uses matrix strategy: `auth_mode: [local, zitadel]`
   - Each mode runs in a separate job for parallel execution
   - Job names clearly indicate the auth mode being tested

2. **AC2: Server tests with AUTH_MODE env var**
   - Go tests receive `AUTH_MODE` environment variable from matrix
   - Tests can access mode via `config.AuthMode()` after initialization
   - Test coverage reported per mode (not merged)

3. **AC3: Dashboard tests with VITE_AUTH_MODE env var**
   - Vitest tests receive `VITE_AUTH_MODE` environment variable
   - Tests can mock `fetchAuthConfig()` to simulate mode
   - Test coverage reported per mode

4. **AC4: Mode-specific skip logic in Go tests**
   - Tests use `if config.AuthMode() != "local" { t.Skip("local mode only") }`
   - Skip messages clearly indicate why test was skipped
   - Both `t.Skip()` and build tags supported for filtering

5. **AC5: Test helper utilities**
   - Go: `SetupLocalMode(t)` - configures test for local auth
   - Go: `SetupZitadelMode(t)` - configures test for Zitadel auth (mocked)
   - Go: `CreateTestUser(t, opts)` - creates test user with mode-appropriate auth
   - TypeScript: Test utilities for mocking auth config

6. **AC6: Integration test matrix coverage**
   | Test | Local | Zitadel |
   |------|-------|---------|
   | Login flow | Run | Run (mocked OIDC) |
   | Setup wizard | Run | Skip |
   | User management | Run | Skip |
   | Super-admin | Skip | Run |
   | All CRUD operations | Run | Run |

7. **AC7: All tests pass before merge**
   - CI blocks PR merge if any test fails in either mode
   - Both modes must pass for green status
   - Failing tests clearly indicate which mode failed

## Tasks / Subtasks

- [x] Task 1: Create GitHub Actions workflow for dual-mode testing (AC: #1, #2, #3, #7)
  - [x] 1.1 Create `.github/workflows/test.yml` with matrix strategy
  - [x] 1.2 Configure matrix: `auth_mode: [local, zitadel]`
  - [x] 1.3 Add Go test job with `AUTH_MODE` env var and JWT_SECRET
  - [x] 1.4 Add Zitadel mode env vars (ZITADEL_ISSUER, ZITADEL_CLIENT_ID) for zitadel matrix value
  - [x] 1.5 Add Dashboard test job with `VITE_AUTH_MODE` env var
  - [x] 1.6 Configure coverage upload per mode (separate codecov flags)
  - [x] 1.7 Add status check requirements for both modes

- [x] Task 2: Create Go test helper utilities (AC: #5)
  - [x] 2.1 Create `apis-server/tests/testutil/auth.go` with shared test utilities
  - [x] 2.2 Implement `SetupLocalMode(t *testing.T) func()` - sets env vars, initializes config, returns cleanup
  - [x] 2.3 Implement `SetupZitadelMode(t *testing.T) func()` - sets Zitadel env vars with mock values
  - [x] 2.4 Implement `DefaultTestUser()` - creates test user claims
  - [x] 2.5 Implement `GenerateTestJWT(t, claims) string` - creates test JWT for local mode
  - [x] 2.6 Implement `SkipIfNotLocalMode(t)` and `SkipIfNotZitadelMode(t)` helpers
  - [x] 2.7 Add documentation comments explaining each helper's purpose

- [x] Task 3: Create mode-specific Go auth tests (AC: #4, #6)
  - [x] 3.1 Create `apis-server/tests/auth_local_test.go` for local-only tests
  - [x] 3.2 Add tests: login flow, password change, setup wizard, user management CRUD
  - [x] 3.3 Use `SkipIfNotLocalMode(t)` at start of each test
  - [x] 3.4 Create `apis-server/tests/auth_zitadel_test.go` for zitadel-only tests
  - [x] 3.5 Add tests: super-admin access, tenant provisioning, OIDC token validation
  - [x] 3.6 Use `SkipIfNotZitadelMode(t)` at start of each test
  - [x] 3.7 Ensure existing shared tests (CRUD operations) run in both modes

- [x] Task 4: Create Dashboard test utilities for auth mode (AC: #3, #5)
  - [x] 4.1 Create `apis-dashboard/tests/utils/authTestUtils.ts` with mode helpers
  - [x] 4.2 Implement `mockLocalAuthConfig()` - returns local mode config
  - [x] 4.3 Implement `mockZitadelAuthConfig()` - returns Zitadel mode config
  - [x] 4.4 Implement `createMockUser(opts)` - creates mock user for tests
  - [x] 4.5 Add mode detection from `VITE_AUTH_MODE` env var

- [x] Task 5: Create mode-specific Dashboard login tests (AC: #6)
  - [x] 5.1 Create `apis-dashboard/tests/auth/DualModeAuth.test.tsx` with mode-specific test suites
  - [x] 5.2 Add `describe.skipIf` for local-only scenarios
  - [x] 5.3 Add `describe.skipIf` for zitadel-only scenarios
  - [x] 5.4 Add tests: Login form rendering (local), Zitadel button rendering (zitadel)
  - [x] 5.5 Add tests: Setup wizard redirect (local only)

- [x] Task 6: Add testutil tests (AC: #5)
  - [x] 6.1 Create `apis-server/tests/testutil/auth_test.go` with tests for utilities
  - [x] 6.2 Test SetupLocalMode and SetupZitadelMode functions
  - [x] 6.3 Test JWT generation functions
  - [x] 6.4 Test mode detection functions

## Dev Notes

### Existing Test Infrastructure Analysis

**Go Test Setup (from auth_test.go):**
```go
// Existing pattern in apis-server/tests/middleware/auth_test.go
func setupAuthConfig(t *testing.T, mode string, disableAuth bool) func() {
    t.Helper()
    config.ResetAuthConfig()
    os.Setenv("AUTH_MODE", mode)
    os.Setenv("JWT_SECRET", testSecret)
    // ... mode-specific vars
    err := config.InitAuthConfig()
    require.NoError(t, err)
    return func() {
        os.Unsetenv("AUTH_MODE")
        // ... cleanup
        config.ResetAuthConfig()
    }
}
```

This pattern should be extracted to `testutil/auth.go` and used consistently.

**Dashboard Test Setup (from Login.test.tsx):**
```typescript
// Existing pattern - mock fetchAuthConfig
const mockFetchAuthConfig = vi.fn();
vi.mock('../../src/config', () => ({
  DEV_MODE: false,
  fetchAuthConfig: () => mockFetchAuthConfig(),
  API_URL: 'http://localhost:3000/api',
}));

// Then in beforeEach:
mockFetchAuthConfig.mockResolvedValue({
  mode: 'local',
  setup_required: false,
});
```

### GitHub Actions Workflow Structure

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  server-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        auth_mode: [local, zitadel]

    env:
      AUTH_MODE: ${{ matrix.auth_mode }}
      JWT_SECRET: test-secret-at-least-32-characters-long
      # Zitadel vars only used when auth_mode=zitadel
      ZITADEL_ISSUER: ${{ matrix.auth_mode == 'zitadel' && 'http://localhost:8080' || '' }}
      ZITADEL_CLIENT_ID: ${{ matrix.auth_mode == 'zitadel' && 'test-client-id' || '' }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      - name: Run tests (${{ matrix.auth_mode }} mode)
        run: go test ./... -v -coverprofile=coverage-${{ matrix.auth_mode }}.out
        working-directory: apis-server
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: apis-server/coverage-${{ matrix.auth_mode }}.out
          flags: server-${{ matrix.auth_mode }}

  dashboard-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        auth_mode: [local, zitadel]

    env:
      VITE_AUTH_MODE: ${{ matrix.auth_mode }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
        working-directory: apis-dashboard
      - name: Run tests (${{ matrix.auth_mode }} mode)
        run: npm test -- --coverage
        working-directory: apis-dashboard
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: apis-dashboard/coverage/coverage-final.json
          flags: dashboard-${{ matrix.auth_mode }}
```

### Test Skip Patterns

**Go Pattern:**
```go
func TestSetupWizard(t *testing.T) {
    testutil.SkipIfNotLocalMode(t) // Skips with message "requires local auth mode"
    cleanup := testutil.SetupLocalMode(t)
    defer cleanup()
    // ... test code
}

func TestSuperAdminAccess(t *testing.T) {
    testutil.SkipIfNotZitadelMode(t) // Skips with message "requires zitadel auth mode"
    cleanup := testutil.SetupZitadelMode(t)
    defer cleanup()
    // ... test code
}
```

**TypeScript Pattern (Vitest):**
```typescript
describe('Local Mode Features', () => {
  const isLocalMode = process.env.VITE_AUTH_MODE === 'local';

  describe.skipIf(!isLocalMode)('Setup Wizard', () => {
    it('redirects when no users exist', async () => {
      // ...
    });
  });
});

describe('Zitadel Mode Features', () => {
  const isZitadelMode = process.env.VITE_AUTH_MODE === 'zitadel';

  describe.skipIf(!isZitadelMode)('Super Admin', () => {
    it('shows admin panel for super admins', async () => {
      // ...
    });
  });
});
```

### Test Coverage Matrix

| Component | Test | Local | Zitadel | Notes |
|-----------|------|-------|---------|-------|
| Server | Login endpoint | Run | Skip | Local uses POST /api/auth/login |
| Server | OIDC callback | Skip | Run | Zitadel handles OIDC flow |
| Server | Setup wizard | Run | Skip | Local-only feature |
| Server | User CRUD | Run | Skip | Local manages users internally |
| Server | Super-admin middleware | Skip | Run | SUPER_ADMIN_EMAILS only in Zitadel |
| Server | Tenant provisioning | Skip | Run | Auto-provision from org_id |
| Server | Sites CRUD | Run | Run | Same behavior both modes |
| Server | Hives CRUD | Run | Run | Same behavior both modes |
| Server | Inspections CRUD | Run | Run | Same behavior both modes |
| Dashboard | Login form | Run | Skip | Shows email/password form |
| Dashboard | Zitadel button | Skip | Run | Shows SSO button |
| Dashboard | User management page | Run | Skip | Hidden in Zitadel mode |
| Dashboard | Super-admin panel | Skip | Run | Only visible to super-admins |

### Project Structure Notes

**Files to create:**
- `.github/workflows/test.yml` - Main CI workflow
- `apis-server/tests/testutil/auth.go` - Go test utilities
- `apis-server/tests/auth_local_test.go` - Local-only tests (may already exist, extend)
- `apis-server/tests/auth_zitadel_test.go` - Zitadel-only tests
- `apis-dashboard/tests/utils/authTestUtils.ts` - TypeScript test utilities

**Files to modify:**
- Existing test files to use new `testutil` helpers
- `apis-dashboard/tests/auth/login.test.tsx` - Add mode-specific test suites (already has some, enhance)

### Existing Test Files to Integrate

The following existing test files should work in both modes without changes:
- `apis-server/tests/handlers/*_test.go` (CRUD handlers)
- `apis-server/tests/storage/*_test.go` (storage layer)

The following may need mode-specific handling:
- `apis-server/tests/middleware/auth_test.go` - Already has `setupAuthConfig()` helper
- `apis-server/tests/handlers/setup_test.go` - Local mode only
- `apis-server/tests/handlers/users_test.go` - Local mode only
- `apis-server/tests/handlers/invite_test.go` - Local mode only

### References

- [Source: CLAUDE.md#Testing] - Tests in separate `tests/` directory, testify for assertions
- [Source: config/auth.go] - AuthMode(), IsLocalAuth(), IsSaaSMode(), ResetAuthConfig() functions
- [Source: tests/middleware/auth_test.go] - Existing setupAuthConfig() pattern
- [Source: apis-dashboard/vitest.config.ts] - Vitest configuration with jsdom
- [Source: tests/auth/Login.test.tsx] - Existing mock pattern for fetchAuthConfig
- [Source: epic-13-dual-auth-mode.md#Story-13.22] - NFR-TEST-01, NFR-TEST-02 requirements

### Security Considerations

1. **Test Secrets:** Use dummy secrets in CI (test-secret-at-least-32-characters-long), never real credentials
2. **Mock OIDC:** Never actually call Zitadel in tests - mock the JWKS validation
3. **Isolated Tests:** Each test should reset auth config to avoid cross-test contamination

### Edge Cases to Test

1. **Config not initialized:** Tests should fail clearly if config.InitAuthConfig() not called
2. **Mode mismatch:** Tests with wrong mode should skip, not fail
3. **Parallel tests:** Auth config is global singleton - tests may need t.Parallel() disabled for auth tests

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

### Completion Notes List

### Change Log

- [2026-01-28] Remediation: Fixed 5 issues from code review
  - Added CreateTestUser(t, opts) function to Go testutil (AC5)
  - Replaced unusable describeLocalModeOnly/describeZitadelModeOnly with skipIfNotLocalMode/skipIfNotZitadelMode constants
  - Updated vitest.config.ts with coverage configuration
  - Changed GitHub Actions fail_ci_if_error from false to true
  - Fixed dashboard coverage file path to use lcov.info
  - Populated File List section with all created/modified files

### File List

**Created Files:**
- `.github/workflows/test.yml` - GitHub Actions CI workflow with matrix strategy for dual auth modes
- `apis-server/tests/testutil/auth.go` - Go test utilities (SetupLocalMode, SetupZitadelMode, CreateTestUser, GenerateTestJWT, etc.)
- `apis-server/tests/testutil/auth_test.go` - Tests for the testutil package
- `apis-server/tests/auth_local_test.go` - Local-mode-only tests (login flow, setup wizard, user management, etc.)
- `apis-server/tests/auth_zitadel_test.go` - Zitadel-mode-only tests (super admin, tenant provisioning, OIDC validation concepts)
- `apis-dashboard/tests/utils/authTestUtils.ts` - TypeScript test utilities (mockLocalAuthConfig, mockZitadelAuthConfig, createMockUser, mode detection)
- `apis-dashboard/tests/auth/DualModeAuth.test.tsx` - Dual-mode auth tests for Login component with mode-specific skipping

**Modified Files:**
- `apis-dashboard/vitest.config.ts` - Added coverage configuration for CI
