import { test, expect } from '@playwright/test';
import { createSiteData } from '../fixtures/data-factories';

/**
 * Tasks API Contract Tests (@P1)
 *
 * CRUD for tasks: create, list, update, complete, delete.
 * Tests priority validation, overdue filtering, and task stats.
 *
 * Routes tested:
 * - POST   /api/tasks
 * - GET    /api/tasks
 * - GET    /api/tasks/{id}
 * - PATCH  /api/tasks/{id}
 * - POST   /api/tasks/{id}/complete
 * - DELETE /api/tasks/{id}
 * - GET    /api/tasks/overdue
 * - GET    /api/tasks/stats
 * - GET    /api/hives/{id}/tasks
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

/** Creates a site + hive for task tests, returns { siteId, hiveId } */
async function setupSiteAndHive(request: any, csrfToken: string) {
  const siteResponse = await request.post('/api/sites', {
    data: createSiteData({ name: 'PW-Task-Test Site' }),
    headers: { 'X-CSRF-Token': csrfToken },
  });
  expect(siteResponse.status()).toBe(201);
  const siteId = (await siteResponse.json()).data.id;

  const hiveResponse = await request.post(`/api/sites/${siteId}/hives`, {
    data: { name: 'PW-Task-Test Hive' },
    headers: { 'X-CSRF-Token': csrfToken },
  });
  expect(hiveResponse.status()).toBe(201);
  const hiveId = (await hiveResponse.json()).data.id;

  return { siteId, hiveId };
}

async function cleanupSiteAndHive(request: any, siteId: string, hiveId: string, csrfToken: string) {
  await request.delete(`/api/hives/${hiveId}`, {
    headers: { 'X-CSRF-Token': csrfToken },
  });
  await request.delete(`/api/sites/${siteId}`, {
    headers: { 'X-CSRF-Token': csrfToken },
  });
}

test.describe('Tasks API @P1', () => {
  let csrfToken: string;
  let siteId: string;
  let hiveId: string;

  test.beforeEach(async ({ request }) => {
    csrfToken = await loginAndGetCsrf(request);
    const ids = await setupSiteAndHive(request, csrfToken);
    siteId = ids.siteId;
    hiveId = ids.hiveId;
  });

  test.afterEach(async ({ request }) => {
    await cleanupSiteAndHive(request, siteId, hiveId, csrfToken);
  });

  test('full CRUD cycle: create -> read -> list -> update -> complete -> delete', async ({ request }) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueDateStr = tomorrow.toISOString().split('T')[0];

    // --- CREATE ---
    const createResponse = await request.post('/api/tasks', {
      data: {
        hive_id: hiveId,
        custom_title: 'PW-Test Task: Check queen',
        priority: 'high',
        due_date: dueDateStr,
        description: 'Verify queen is present and laying',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createResponse.status()).toBe(201);

    const created = await createResponse.json();
    expect(created).toHaveProperty('data');
    // Could be single task or bulk response
    const task = Array.isArray(created.data?.tasks)
      ? created.data.tasks[0]
      : created.data;
    expect(task).toHaveProperty('id');
    expect(task.hive_id).toBe(hiveId);
    expect(task.priority).toBe('high');
    expect(task.status).toBe('pending');

    const taskId = task.id;

    try {
      // --- READ ---
      const getResponse = await request.get(`/api/tasks/${taskId}`);
      expect(getResponse.status()).toBe(200);
      const fetched = await getResponse.json();
      expect(fetched.data.id).toBe(taskId);
      expect(fetched.data.status).toBe('pending');

      // --- LIST (all tasks) ---
      const listResponse = await request.get('/api/tasks');
      expect(listResponse.status()).toBe(200);
      const listed = await listResponse.json();
      expect(listed).toHaveProperty('data');
      expect(listed).toHaveProperty('meta');
      expect(Array.isArray(listed.data)).toBe(true);

      // --- LIST (by hive) ---
      const hiveTasksResponse = await request.get(`/api/hives/${hiveId}/tasks`);
      expect(hiveTasksResponse.status()).toBe(200);
      const hiveTasks = await hiveTasksResponse.json();
      const found = hiveTasks.data.find((t: any) => t.id === taskId);
      expect(found).toBeTruthy();

      // --- UPDATE (PATCH) ---
      const updateResponse = await request.patch(`/api/tasks/${taskId}`, {
        data: {
          priority: 'urgent',
          description: 'Updated: check queen urgently',
        },
        headers: { 'X-CSRF-Token': csrfToken },
      });
      expect(updateResponse.status()).toBe(200);
      const updated = await updateResponse.json();
      expect(updated.data.priority).toBe('urgent');

      // --- COMPLETE ---
      const completeResponse = await request.post(`/api/tasks/${taskId}/complete`, {
        data: {},
        headers: { 'X-CSRF-Token': csrfToken },
      });
      expect(completeResponse.status()).toBe(200);
      const completed = await completeResponse.json();
      expect(completed.data.status).toBe('completed');
      expect(completed.data).toHaveProperty('completed_at');

    } finally {
      // --- DELETE ---
      const deleteResponse = await request.delete(`/api/tasks/${taskId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
      expect(deleteResponse.status()).toBe(204);
    }
  });

  test('GET /api/tasks/stats returns task statistics', async ({ request }) => {
    const response = await request.get('/api/tasks/stats');
    expect(response.status()).toBe(200);

    const body = await response.json();
    // Stats endpoint should return some form of statistics data
    expect(body).toHaveProperty('data');
  });

  test('GET /api/tasks/overdue returns overdue tasks', async ({ request }) => {
    // Create a task with past due date
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const pastDateStr = pastDate.toISOString().split('T')[0];

    const createResponse = await request.post('/api/tasks', {
      data: {
        hive_id: hiveId,
        custom_title: 'PW-Overdue Task',
        priority: 'medium',
        due_date: pastDateStr,
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const task = Array.isArray(created.data?.tasks) ? created.data.tasks[0] : created.data;
    const taskId = task.id;

    try {
      const overdueResponse = await request.get('/api/tasks/overdue');
      expect(overdueResponse.status()).toBe(200);
      const overdue = await overdueResponse.json();
      expect(overdue).toHaveProperty('data');
      expect(Array.isArray(overdue.data)).toBe(true);

      // Our overdue task should be in the list
      const found = overdue.data.find((t: any) => t.id === taskId);
      expect(found).toBeTruthy();
    } finally {
      await request.delete(`/api/tasks/${taskId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });

  test('create task without hive_id returns 400', async ({ request }) => {
    const response = await request.post('/api/tasks', {
      data: {
        custom_title: 'No Hive Task',
        priority: 'low',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });

    // Should fail because hive_id is required
    expect(response.status()).toBe(400);
  });

  test('GET /api/tasks/{id} with non-existent ID returns 404', async ({ request }) => {
    const response = await request.get('/api/tasks/00000000-0000-0000-0000-000000000000');
    expect(response.status()).toBe(404);
  });

  test('list tasks supports filtering by status', async ({ request }) => {
    // Create and complete a task
    const createResponse = await request.post('/api/tasks', {
      data: {
        hive_id: hiveId,
        custom_title: 'PW-Filter Test Task',
        priority: 'low',
      },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const task = Array.isArray(created.data?.tasks) ? created.data.tasks[0] : created.data;
    const taskId = task.id;

    try {
      // Complete the task
      await request.post(`/api/tasks/${taskId}/complete`, {
        data: {},
        headers: { 'X-CSRF-Token': csrfToken },
      });

      // List only pending tasks
      const pendingResponse = await request.get('/api/tasks?status=pending');
      expect(pendingResponse.status()).toBe(200);
      const pending = await pendingResponse.json();
      // Our completed task should not be in pending list
      const foundInPending = pending.data.find((t: any) => t.id === taskId);
      expect(foundInPending).toBeFalsy();

      // List completed tasks
      const completedResponse = await request.get('/api/tasks?status=completed');
      expect(completedResponse.status()).toBe(200);
      const completed = await completedResponse.json();
      const foundInCompleted = completed.data.find((t: any) => t.id === taskId);
      expect(foundInCompleted).toBeTruthy();
    } finally {
      await request.delete(`/api/tasks/${taskId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      });
    }
  });
});
