import { test, expect } from '@playwright/test';

/**
 * Auth API Contract Tests (@P0)
 *
 * Validates authentication endpoints:
 * - GET /api/auth/config (public, returns auth mode)
 * - POST /api/auth/login (local mode, email+password)
 * - GET /api/me (protected, returns user info)
 * - GET /api/auth/me (protected, returns user info)
 * - POST /api/auth/logout (protected, clears session)
 */

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@apis.local';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';

test.describe('Auth API @P0', () => {
  test('GET /api/auth/config returns auth mode and structure', async ({ request }) => {
    const response = await request.get('/api/auth/config');

    expect(response.status()).toBe(200);
    const body = await response.json();

    // Must include mode field
    expect(body).toHaveProperty('mode');
    expect(['local', 'keycloak']).toContain(body.mode);

    if (body.mode === 'local') {
      // Local mode must have setup_required boolean
      expect(body).toHaveProperty('setup_required');
      expect(typeof body.setup_required).toBe('boolean');
    } else {
      // Keycloak mode must have authority and client_id
      expect(body).toHaveProperty('keycloak_authority');
      expect(body).toHaveProperty('client_id');
      expect(typeof body.keycloak_authority).toBe('string');
      expect(typeof body.client_id).toBe('string');
    }
  });

  test('POST /api/auth/login with valid credentials returns 200 + sets cookie', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    // Response wraps user in { user: {...} }
    expect(body).toHaveProperty('user');
    expect(body.user).toHaveProperty('id');
    expect(body.user).toHaveProperty('email');
    expect(body.user).toHaveProperty('name');
    expect(body.user).toHaveProperty('role');
    expect(body.user).toHaveProperty('tenant_id');
    expect(body.user.email).toBe(TEST_EMAIL);

    // Verify session cookie is set
    const setCookie = response.headers()['set-cookie'] || '';
    expect(setCookie).toContain('apis_session=');
    expect(setCookie).toContain('HttpOnly');
  });

  test('POST /api/auth/login with invalid password returns 401', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: TEST_EMAIL,
        password: 'wrong-password-definitely-invalid',
      },
    });

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('code', 401);
    expect(body.error).toBe('Invalid credentials');
  });

  test('POST /api/auth/login with missing email returns 400', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        password: 'somepassword',
      },
    });

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('code', 400);
  });

  test('POST /api/auth/login with missing password returns 400', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: TEST_EMAIL,
      },
    });

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('code', 400);
  });

  test('POST /api/auth/login with invalid email format returns 400', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: 'not-an-email',
        password: 'somepassword',
      },
    });

    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('code', 400);
  });

  test('GET /api/me without authentication returns 401', async ({ request }) => {
    // Create a clean context (no stored cookies from previous login)
    const response = await request.get('/api/me', {
      headers: {
        Cookie: '', // Explicitly clear cookies
      },
    });

    expect(response.status()).toBe(401);
  });

  test('GET /api/me with valid session returns user info', async ({ request }) => {
    // First login to get session cookie
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    expect(loginResponse.status()).toBe(200);

    // The request context automatically stores cookies from previous requests.
    // Now GET /api/me should succeed with the session cookie.
    const meResponse = await request.get('/api/me');
    expect(meResponse.status()).toBe(200);

    const body = await meResponse.json();
    // /api/me returns flat object (not wrapped in "user")
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('email');
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('tenant_id');
    expect(body).toHaveProperty('roles');
    expect(body.email).toBe(TEST_EMAIL);
  });

  test('GET /api/auth/me with valid session returns user info', async ({ request }) => {
    // Login first
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    expect(loginResponse.status()).toBe(200);

    // GET /api/auth/me returns { user: {...} }
    const meResponse = await request.get('/api/auth/me');
    expect(meResponse.status()).toBe(200);

    const body = await meResponse.json();
    expect(body).toHaveProperty('user');
    expect(body.user).toHaveProperty('id');
    expect(body.user).toHaveProperty('email', TEST_EMAIL);
    expect(body.user).toHaveProperty('role');
    expect(body.user).toHaveProperty('tenant_id');
  });

  test('POST /api/auth/logout clears session', async ({ request }) => {
    // Login first
    const loginResponse = await request.post('/api/auth/login', {
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    expect(loginResponse.status()).toBe(200);

    // Extract CSRF token from login response cookies
    const loginCookies = loginResponse.headers()['set-cookie'] || '';
    const csrfMatch = loginCookies.match(/apis_csrf_token=([^;]+)/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    // Logout
    const logoutResponse = await request.post('/api/auth/logout', {
      headers: {
        'X-CSRF-Token': csrfToken,
      },
    });
    expect(logoutResponse.status()).toBe(200);

    const body = await logoutResponse.json();
    expect(body).toHaveProperty('message', 'Logged out successfully');

    // Verify session cookie is cleared (MaxAge=-1)
    const setCookie = logoutResponse.headers()['set-cookie'] || '';
    expect(setCookie).toContain('apis_session=');
  });

  test('GET /api/health returns healthy status', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);
  });
});
