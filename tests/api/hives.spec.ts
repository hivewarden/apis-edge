import { test, expect } from '@playwright/test';
import { createSiteData, createHiveData } from '../fixtures/data-factories';

/**
 * Hives API Contract Tests (@P1)
 *
 * Full CRUD cycle for hives: create under site, list, read, update, delete.
 * Validates queen source, box count boundaries, and relationship to sites.
 *
 * Routes tested:
 * - POST   /api/sites/{site_id}/hives
 * - GET    /api/hives
 * - GET    /api/sites/{site_id}/hives
 * - GET    /api/hives/{id}
 * - PUT    /api/hives/{id}
 * - DELETE /api/hives/{id}
 */

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'admin@apis.local';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';

async function loginAndGetCsrf(request: any): Promise<string> {
  const loginResponse = await request.post('/api/auth/login', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(loginResponse.status()).toBe(200);
  const cookies = loginResponse.headers()['set-cookie'] || '';
  const csrfMatch = cookies.match(/apis_csrf_token=([^;]+)/);
  return csrfMatch ? csrfMatch[1] : '';
}

/** Helper: create a temporary site for hive tests, returns site id */
async function createTestSite(request: any, csrfToken: string): Promise<string> {
  const siteData = createSiteData({ name: 'PW-Hive-Test Site' });
  const response = await request.post('/api/sites', {
    data: siteData,
    headers: { 'X-CSRF-Token': csrfToken },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return body.data.id;
}

/** Helper: delete a site (cleanup) */
async function deleteTestSite(request: any, siteId: string, csrfToken: string) {
  await request.delete(`/api/sites/${siteId}`, {
    headers: { 'X-CSRF-Token': csrfToken },
  });
}

test.describe('Hives API @P1', () => {
  let csrfToken: string;
  let siteId: string;

  test.beforeEach(async ({ request }) => {
    csrfToken = await loginAndGetCsrf(request);
    siteId = await createTestSite(request, csrfToken);
  });

  test.afterEach(async ({ request }) => {
    // Clean up the site (cascades to hives if the DB supports it,
    // otherwise hives should have been deleted in tests)
    await deleteTestSite(request, siteId, csrfToken);
  });

  test('full CRUD cycle: create -> read -> list -> update -> delete', async ({ request }) => {
    const hiveData = createHiveData({
      site_id: siteId,
      name: 'PW-Test Hive Alpha',
      queen_source: 'breeder',
      brood_boxes: 2,
      honey_supers: 1,
    });

    // --- CREATE ---
    const createResponse = await request.post(`/api/sites/${siteId}/hives`, {
      data: hiveData,
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createResponse.status()).toBe(201);

    const created = await createResponse.json();
    expect(created).toHaveProperty('data');
    expect(created.data).toHaveProperty('id');
    expect(created.data.name).toBe('PW-Test Hive Alpha');
    expect(created.data.site_id).toBe(siteId);
    expect(created.data.brood_boxes).toBe(2);
    expect(created.data.honey_supers).toBe(1);
    expect(created.data.hive_status).toBe('active');

    const hiveId = created.data.id;

    try {
      // --- READ ---
      const getResponse = await request.get(`/api/hives/${hiveId}`);
      expect(getResponse.status()).toBe(200);

      const fetched = await getResponse.json();
      expect(fetched.data.id).toBe(hiveId);
      expect(fetched.data.name).toBe('PW-Test Hive Alpha');
      expect(fetched.data.queen_source).toBe('breeder');
      // Hive detail includes status and hive_status
      expect(fetched.data).toHaveProperty('status'); // inspection status (e.g. healthy/needs_attention)
      expect(fetched.data).toHaveProperty('hive_status'); // active/lost/archived

      // --- LIST (all hives) ---
      const listAllResponse = await request.get('/api/hives');
      expect(listAllResponse.status()).toBe(200);
      const listAll = await listAllResponse.json();
      expect(listAll).toHaveProperty('data');
      expect(listAll).toHaveProperty('meta');
      expect(Array.isArray(listAll.data)).toBe(true);

      // --- LIST (by site) ---
      const listBySiteResponse = await request.get(`/api/sites/${siteId}/hives`);
      expect(listBySiteResponse.status()).toBe(200);
      const listBySite = await listBySiteResponse.json();
      const found = listBySite.data.find((h: any) => h.id === hiveId);
      expect(found).toBeTruthy();

      // --- UPDATE ---
      const updateResponse = await request.put(`/api/hives/${hiveId}`, {
        data: {
          name: 'PW-Updated Hive Alpha',
          honey_supers: 3,
        },
        headers: { 'X-CSRF-Token': csrfToken },
      });
      expect(updateResponse.status()).toBe(200);
      const updated = await updateResponse.json();
      expect(updated.data.name).toBe('PW-Updated Hive Alpha');
      expect(updated.data.honey_supers).toBe(3);

    } finally {
      // --- DELETE (cleanup) ---
      const deleteResponse = await request.delete(`/api/hives/${hiveId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
      expect(deleteResponse.status()).toBe(204);

      // Verify deletion
      const getAfterDelete = await request.get(`/api/hives/${hiveId}`);
      expect(getAfterDelete.status()).toBe(404);
    }
  });

  test('POST hive without name returns 400', async ({ request }) => {
    const response = await request.post(`/api/sites/${siteId}/hives`, {
      data: {
        queen_source: 'breeder',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Name is required');
  });

  test('POST hive with invalid queen_source returns 400', async ({ request }) => {
    const response = await request.post(`/api/sites/${siteId}/hives`, {
      data: {
        name: 'Bad Queen Hive',
        queen_source: 'alien_abduction',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('queen source');
  });

  test('POST hive with valid queen_source variants succeeds', async ({ request }) => {
    const validSources = ['breeder', 'swarm', 'split', 'package', 'other'];
    const createdIds: string[] = [];

    for (const source of validSources) {
      const response = await request.post(`/api/sites/${siteId}/hives`, {
        data: {
          name: `PW-Queen-${source}`,
          queen_source: source,
        },
        headers: { 'X-CSRF-Token': csrfToken },
      });
      expect(response.status()).toBe(201);
      const body = await response.json();
      createdIds.push(body.data.id);
    }

    // Also test "other:custom description"
    const customResponse = await request.post(`/api/sites/${siteId}/hives`, {
      data: {
        name: 'PW-Queen-Custom',
        queen_source: 'other:captured from wild colony',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(customResponse.status()).toBe(201);
    const customBody = await customResponse.json();
    createdIds.push(customBody.data.id);

    // Cleanup
    for (const id of createdIds) {
      await request.delete(`/api/hives/${id}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('POST hive with brood_boxes out of range returns 400', async ({ request }) => {
    // brood_boxes must be 1-3
    const response = await request.post(`/api/sites/${siteId}/hives`, {
      data: {
        name: 'Too Many Brood',
        brood_boxes: 5,
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Brood boxes');
  });

  test('POST hive with honey_supers out of range returns 400', async ({ request }) => {
    // honey_supers must be 0-5
    const response = await request.post(`/api/sites/${siteId}/hives`, {
      data: {
        name: 'Too Many Supers',
        honey_supers: 10,
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Honey supers');
  });

  test('POST hive on non-existent site returns 404', async ({ request }) => {
    const response = await request.post('/api/sites/00000000-0000-0000-0000-000000000000/hives', {
      data: {
        name: 'Orphan Hive',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    expect(response.status()).toBe(404);
  });

  test('GET /api/hives/{id} with non-existent ID returns 404', async ({ request }) => {
    const response = await request.get('/api/hives/00000000-0000-0000-0000-000000000000');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Hive not found');
  });

  test('hive response includes task_summary', async ({ request }) => {
    // Create a hive
    const createResponse = await request.post(`/api/sites/${siteId}/hives`, {
      data: { name: 'PW-TaskSummary Hive' },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createResponse.status()).toBe(201);
    const hiveId = (await createResponse.json()).data.id;

    try {
      // Get hive detail - should have task_summary
      const getResponse = await request.get(`/api/hives/${hiveId}`);
      expect(getResponse.status()).toBe(200);
      const body = await getResponse.json();
      expect(body.data).toHaveProperty('task_summary');
      expect(body.data.task_summary).toHaveProperty('open');
      expect(body.data.task_summary).toHaveProperty('overdue');
    } finally {
      await request.delete(`/api/hives/${hiveId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });
});
