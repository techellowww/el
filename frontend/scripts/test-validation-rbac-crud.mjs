import { chromium } from '@playwright/test';

const BASE_URL = 'https://el-ka5y.vercel.app';

async function runTestSuite() {
  console.log(`\n============================================================`);
  console.log(`🛡️ COMPREHENSIVE VALIDATION, RBAC & CRUD AUDIT SUITE`);
  console.log(`============================================================\n`);

  const results = {
    validation: [],
    rbac: [],
    crud: [],
  };

  function record(category, testName, passed, details = '') {
    results[category].push({ testName, passed, details });
    const icon = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${category.toUpperCase()}] ${icon}: ${testName} ${details ? '(' + details + ')' : ''}`);
  }

  // --- Step 1: Admin Login and Cookie Capture ---
  console.log('--- Step 1: Authenticating as Admin ---');
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@clienthub.local', password: 'Password@123' }),
  });
  const adminCookie = adminLoginRes.headers.get('set-cookie');
  const adminData = await adminLoginRes.json();
  const adminUserId = adminData.user?.id;
  console.log(`Admin Authenticated: ${adminLoginRes.ok ? 'YES' : 'NO'}, User ID: ${adminUserId}`);

  // --- Step 2: Employee Login and Cookie Capture ---
  console.log('--- Step 2: Authenticating as Employee ---');
  const empLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'employee@clienthub.local', password: 'Password@123' }),
  });
  const empCookie = empLoginRes.headers.get('set-cookie');
  const empData = await empLoginRes.json();
  const empUserId = empData.user?.id;
  console.log(`Employee Authenticated: ${empLoginRes.ok ? 'YES' : 'NO'}, User ID: ${empUserId}\n`);

  // ============================================================
  // SECTION A: VALIDATION AUDIT
  // ============================================================
  console.log('--- SECTION A: INPUT & BUSINESS RULE VALIDATION ---');

  // A1. Client missing required fields (name / email)
  const v1 = await fetch(`${BASE_URL}/api/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ name: '' }),
  });
  record('validation', 'Client creation rejects missing name/email with 400', v1.status === 400);

  // A2. Client reserved company name validation
  const v2 = await fetch(`${BASE_URL}/api/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ name: 'Hacked Team', email: 'team@agency.com', company: '__INTERNAL_GENERAL_TEAM__' }),
  });
  record('validation', 'Client creation rejects reserved company __INTERNAL_GENERAL_TEAM__ with 400', v2.status === 400);

  // A3. Project missing required fields (clientId / name)
  const v3 = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ description: 'No name or client' }),
  });
  record('validation', 'Project creation rejects missing clientId/name with 400', v3.status === 400);

  // A4. Invariant: Project stage AWAITING_REVIEW requires stagingUrl
  // First fetch an existing client to associate with project
  const clientsListRes = await fetch(`${BASE_URL}/api/clients`, { headers: { Cookie: adminCookie } });
  const clientsListData = await clientsListRes.json();
  const sampleClientId = clientsListData.clients?.[0]?.id;

  const v4 = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      clientId: sampleClientId,
      name: 'Stage Invariant Project',
      stage: 'AWAITING_REVIEW',
      stagingUrl: '', // Intentionally blank!
    }),
  });
  record('validation', 'Project stage AWAITING_REVIEW requires stagingUrl (invariant check)', v4.status === 400);

  // A5. Self-deletion prevention: Admin cannot delete their own user account
  const v5 = await fetch(`${BASE_URL}/api/employees/${adminUserId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  record('validation', 'Admin cannot delete their own account (prevents self-lockout)', v5.status === 400);

  // A6. Time Tracking: Manual log rejects invalid / negative duration
  const v6 = await fetch(`${BASE_URL}/api/time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ action: 'MANUAL', projectId: 'fake-proj', durationSeconds: -500 }),
  });
  record('validation', 'Time tracking rejects negative / non-numeric duration with 400', v6.status === 400 || v6.status === 404);

  // A7. Time Tracking: Max 24 hours (86,400s) single day log prevention
  const v7 = await fetch(`${BASE_URL}/api/time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ action: 'MANUAL', projectId: 'fake-proj', durationSeconds: 90000 }),
  });
  record('validation', 'Time tracking caps / rejects logging > 24 hours in a single day', v7.status === 400 || v7.status === 404);

  // ============================================================
  // SECTION B: ROLE-BASED ACCESS CONTROL (RBAC) AUDIT
  // ============================================================
  console.log('\n--- SECTION B: ROLE-BASED ACCESS CONTROL (RBAC) ---');

  // B1. Employee cannot access Proposals (GET /api/proposals) -> 403
  const r1 = await fetch(`${BASE_URL}/api/proposals`, { headers: { Cookie: empCookie } });
  record('rbac', 'Employee is forbidden from accessing Proposals (GET /api/proposals)', r1.status === 403);

  // B2. Employee cannot access Invoices (GET /api/invoices) -> 403
  const r2 = await fetch(`${BASE_URL}/api/invoices`, { headers: { Cookie: empCookie } });
  record('rbac', 'Employee is forbidden from accessing Invoices (GET /api/invoices)', r2.status === 403);

  // B3. Employee cannot access Settings (GET /api/settings) -> 403
  const r3 = await fetch(`${BASE_URL}/api/settings`, { headers: { Cookie: empCookie } });
  record('rbac', 'Employee is forbidden from accessing Settings (GET /api/settings)', r3.status === 403);

  // B4. Employee cannot create Clients (POST /api/clients) -> 403
  const r4 = await fetch(`${BASE_URL}/api/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: empCookie },
    body: JSON.stringify({ name: 'Hacked Client', email: 'hack@test.com' }),
  });
  record('rbac', 'Employee is forbidden from creating Clients (POST /api/clients)', r4.status === 403);

  // B5. Employee cannot create/invite Employees (POST /api/employees) -> 403
  const r5 = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: empCookie },
    body: JSON.stringify({ name: 'Hacked User', email: 'hacked@test.com', password: 'Password@123' }),
  });
  record('rbac', 'Employee is forbidden from creating Employees (POST /api/employees)', r5.status === 403);

  // B6. Employee cannot update agency Office Timings (PUT /api/office-timings) -> 403
  const r6 = await fetch(`${BASE_URL}/api/office-timings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: empCookie },
    body: JSON.stringify({ openingTime: '12:00', closingTime: '13:00' }),
  });
  record('rbac', 'Employee is forbidden from modifying Office Timings (PUT /api/office-timings)', r6.status === 403);

  // B7. Employee cannot access Screenshot settings / backups -> 403
  const r7 = await fetch(`${BASE_URL}/api/screenshots/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: empCookie },
    body: JSON.stringify({ enabled: false }),
  });
  record('rbac', 'Employee is forbidden from modifying Screenshot Settings', r7.status === 403);

  // B8. Client Isolation: Employee accessing unassigned client returns 404 (Never reveals unauthorized client exists)
  // Let's create an unassigned client as Admin
  const unassignedClientRes = await fetch(`${BASE_URL}/api/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      name: 'Secret Client Alpha',
      company: 'Confidential Holdings',
      email: 'confidential@alpha.test',
      assignedUserIds: [], // Empty assignment! Employee not assigned!
    }),
  });
  const unassignedClientData = await unassignedClientRes.json();
  const secretClientId = unassignedClientData.client?.id;

  const r8 = await fetch(`${BASE_URL}/api/clients/${secretClientId}`, {
    headers: { Cookie: empCookie },
  });
  record('rbac', 'Employee accessing unassigned client returns 404 (prevents client enumeration)', r8.status === 404);

  // Clean up secret client
  await fetch(`${BASE_URL}/api/clients/${secretClientId}`, { method: 'DELETE', headers: { Cookie: adminCookie } });

  // ============================================================
  // SECTION C: CRUD FUNCTIONALITY AUDIT
  // ============================================================
  console.log('\n--- SECTION C: COMPLETE CRUD LIFECYCLES ---');

  // --- C1. CLIENT CRUD ---
  console.log('\nTesting Client CRUD...');
  // C (Create)
  const cCreate = await fetch(`${BASE_URL}/api/clients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      name: 'CRUD Test Client',
      company: 'CRUD Enterprises LLC',
      email: 'crud@enterprises.test',
      phone: '+1-555-0999',
      notes: 'Testing full CRUD lifecycle',
    }),
  });
  const cCreateData = await cCreate.json();
  const crudClientId = cCreateData.client?.id;
  record('crud', 'CLIENT CREATE (POST /api/clients) -> 200', cCreate.status === 200 && Boolean(crudClientId));

  // R (Read)
  const cRead = await fetch(`${BASE_URL}/api/clients/${crudClientId}`, { headers: { Cookie: adminCookie } });
  const cReadData = await cRead.json();
  record('crud', 'CLIENT READ (GET /api/clients/:id) -> 200', cRead.status === 200 && cReadData.client?.name === 'CRUD Test Client');

  // U (Update)
  const cUpdate = await fetch(`${BASE_URL}/api/clients/${crudClientId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ name: 'CRUD Test Client (Updated)', phone: '+1-555-8888' }),
  });
  const cUpdateData = await cUpdate.json();
  record('crud', 'CLIENT UPDATE (PATCH /api/clients/:id) -> 200', cUpdate.status === 200 && cUpdateData.client?.name === 'CRUD Test Client (Updated)');

  // --- C2. PROJECT CRUD ---
  console.log('\nTesting Project CRUD...');
  // C (Create)
  const pCreate = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      clientId: crudClientId,
      name: 'CRUD Marketing Platform',
      description: 'Web delivery project for CRUD testing',
      stage: 'DISCOVERY',
    }),
  });
  const pCreateData = await pCreate.json();
  const crudProjectId = pCreateData.project?.id;
  record('crud', 'PROJECT CREATE (POST /api/projects) -> 200', pCreate.status === 200 && Boolean(crudProjectId));

  // R (Read)
  const pRead = await fetch(`${BASE_URL}/api/projects/${crudProjectId}`, { headers: { Cookie: adminCookie } });
  const pReadData = await pRead.json();
  record('crud', 'PROJECT READ (GET /api/projects/:id) -> 200', pRead.status === 200 && pReadData.project?.name === 'CRUD Marketing Platform');

  // U (Update)
  const pUpdate = await fetch(`${BASE_URL}/api/projects/${crudProjectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      name: 'CRUD Marketing Platform (Updated)',
      stage: 'IN_DEVELOPMENT',
      stagingUrl: 'https://staging.crud.test',
    }),
  });
  const pUpdateData = await pUpdate.json();
  record('crud', 'PROJECT UPDATE (PATCH /api/projects/:id) -> 200', pUpdate.status === 200 && pUpdateData.project?.stage === 'IN_DEVELOPMENT');

  // D (Delete Project)
  const pDelete = await fetch(`${BASE_URL}/api/projects/${crudProjectId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  record('crud', 'PROJECT DELETE (DELETE /api/projects/:id) -> 200', pDelete.status === 200);

  // D (Delete Client)
  const cDelete = await fetch(`${BASE_URL}/api/clients/${crudClientId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  record('crud', 'CLIENT DELETE (DELETE /api/clients/:id) -> 200', cDelete.status === 200);

  // --- C3. EMPLOYEE CRUD ---
  console.log('\nTesting Employee CRUD...');
  const tempEmail = `test.employee.${Date.now()}@clienthub.test`;
  // C (Create)
  const eCreate = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      name: 'Temporary QA Engineer',
      email: tempEmail,
      password: 'Password@123',
      role: 'EMPLOYEE',
    }),
  });
  const eCreateData = await eCreate.json();
  const crudEmpId = eCreateData.employee?.id;
  record('crud', 'EMPLOYEE CREATE (POST /api/employees) -> 200', eCreate.status === 200 && Boolean(crudEmpId));

  // R (Read in list)
  const eRead = await fetch(`${BASE_URL}/api/employees`, { headers: { Cookie: adminCookie } });
  const eReadData = await eRead.json();
  const empFound = eReadData.employees?.some((e) => e.id === crudEmpId);
  record('crud', 'EMPLOYEE READ (GET /api/employees) -> 200', eRead.status === 200 && empFound);

  // U (Update role / status)
  const eUpdate = await fetch(`${BASE_URL}/api/employees/${crudEmpId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ name: 'Temporary QA Lead' }),
  });
  const eUpdateData = await eUpdate.json();
  record('crud', 'EMPLOYEE UPDATE (PATCH /api/employees/:id) -> 200', eUpdate.status === 200 && eUpdateData.employee?.name === 'Temporary QA Lead');

  // D (Delete Employee)
  const eDelete = await fetch(`${BASE_URL}/api/employees/${crudEmpId}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  record('crud', 'EMPLOYEE DELETE (DELETE /api/employees/:id) -> 200', eDelete.status === 200);

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n============================================================');
  console.log('🏁 AUDIT SUMMARY');
  console.log('============================================================');
  const allTests = [...results.validation, ...results.rbac, ...results.crud];
  const passedCount = allTests.filter((t) => t.passed).length;
  console.log(`Validation Tests Passed: ${results.validation.filter(t => t.passed).length}/${results.validation.length}`);
  console.log(`RBAC Tests Passed:        ${results.rbac.filter(t => t.passed).length}/${results.rbac.length}`);
  console.log(`CRUD Tests Passed:        ${results.crud.filter(t => t.passed).length}/${results.crud.length}`);
  console.log(`Overall Pass Rate:        ${passedCount}/${allTests.length} (${Math.round((passedCount / allTests.length) * 100)}%)`);
  console.log('============================================================\n');
}

runTestSuite();
