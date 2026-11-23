const http = require('http');

async function apiRequest(path, options = {}) {
  const url = new URL(path, 'http://localhost:3000');
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
          raw: data,
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('========================================');
  console.log('🧪 STARTING COMPREHENSIVE E2E AUDIT TEST');
  console.log('========================================\n');

  const results = { passed: 0, failed: 0, issues: [] };

  function assert(condition, message, errorDetail = null) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      results.passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      if (errorDetail) console.error(`     Detail:`, errorDetail);
      results.failed++;
      results.issues.push({ message, errorDetail });
    }
  }

  // 1. AUTHENTICATION TESTS
  console.log('--- 1. Authentication Tests ---');
  
  // Admin Login
  const adminLogin = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@clienthub.local', password: 'Password@123' },
  });
  assert(adminLogin.status === 200 && adminLogin.data?.token, 'Admin login succeeds with token', adminLogin.data);
  const adminToken = adminLogin.data?.token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // Employee Login
  const empLogin = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: 'employee@clienthub.local', password: 'Password@123' },
  });
  assert(empLogin.status === 200 && empLogin.data?.token, 'Employee login succeeds with token', empLogin.data);
  const empToken = empLogin.data?.token;
  const empHeaders = { Authorization: `Bearer ${empToken}` };

  // Invalid Login
  const badLogin = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@clienthub.local', password: 'WrongPassword' },
  });
  assert(badLogin.status === 401, 'Invalid password returns 401 Unauthorized', badLogin.status);

  // 2. ADMIN FLOW TESTS
  console.log('\n--- 2. Admin Workflows ---');

  // Admin /api/auth/me
  const adminMe = await apiRequest('/api/auth/me', { headers: adminHeaders });
  assert(adminMe.status === 200 && adminMe.data?.user?.role === 'ADMIN', 'Admin /api/auth/me returns ADMIN role', adminMe.data);

  // Admin Clients
  const adminClients = await apiRequest('/api/clients', { headers: adminHeaders });
  assert(adminClients.status === 200 && Array.isArray(adminClients.data?.clients), 'Admin /api/clients returns clients list', adminClients.data);

  // Admin Projects
  const adminProjects = await apiRequest('/api/projects', { headers: adminHeaders });
  assert(adminProjects.status === 200 && Array.isArray(adminProjects.data?.projects), 'Admin /api/projects returns projects list', adminProjects.data);

  // Admin Proposals
  const adminProposals = await apiRequest('/api/proposals', { headers: adminHeaders });
  assert(adminProposals.status === 200 && Array.isArray(adminProposals.data?.proposals), 'Admin /api/proposals returns proposals list', adminProposals.data);

  // Admin Invoices
  const adminInvoices = await apiRequest('/api/invoices', { headers: adminHeaders });
  assert(adminInvoices.status === 200 && Array.isArray(adminInvoices.data?.invoices), 'Admin /api/invoices returns invoices list', adminInvoices.data);

  // Admin Settings
  const adminSettings = await apiRequest('/api/settings', { headers: adminHeaders });
  assert(adminSettings.status === 200 && adminSettings.data?.account, 'Admin /api/settings returns agency settings', adminSettings.data);

  // Admin Employees
  const adminEmployees = await apiRequest('/api/employees', { headers: adminHeaders });
  assert(adminEmployees.status === 200 && Array.isArray(adminEmployees.data?.employees), 'Admin /api/employees returns team list', adminEmployees.data);

  // Admin Office Timings
  const adminTimings = await apiRequest('/api/office-timings', { headers: adminHeaders });
  assert(adminTimings.status === 200 && adminTimings.data?.schedule, 'Admin /api/office-timings returns office timings', adminTimings.data);

  // Admin Screenshots Settings
  const adminScreenshotSettings = await apiRequest('/api/screenshots/settings', { headers: adminHeaders });
  assert(adminScreenshotSettings.status === 200, 'Admin /api/screenshots/settings returns screenshot config', adminScreenshotSettings.data);

  // Admin Time Entries
  const adminTime = await apiRequest('/api/time', { headers: adminHeaders });
  assert(adminTime.status === 200 && Array.isArray(adminTime.data?.entries), 'Admin /api/time returns time entries', adminTime.data);

  // 3. EMPLOYEE FLOW & PERMISSION TESTS
  console.log('\n--- 3. Employee Workflows & RBAC Guard Tests ---');

  // Employee /api/auth/me
  const empMe = await apiRequest('/api/auth/me', { headers: empHeaders });
  assert(empMe.status === 200 && empMe.data?.user?.role === 'EMPLOYEE', 'Employee /api/auth/me returns EMPLOYEE role', empMe.data);

  // Employee Clients (must only return accessible clients)
  const empClients = await apiRequest('/api/clients', { headers: empHeaders });
  assert(empClients.status === 200 && Array.isArray(empClients.data?.clients), 'Employee /api/clients succeeds', empClients.data);

  // Employee Projects (must only return accessible projects)
  const empProjects = await apiRequest('/api/projects', { headers: empHeaders });
  assert(empProjects.status === 200 && Array.isArray(empProjects.data?.projects), 'Employee /api/projects succeeds', empProjects.data);

  // Employee Access to Admin-Only APIs:
  // Proposals
  const empProposals = await apiRequest('/api/proposals', { headers: empHeaders });
  assert(empProposals.status === 403 || empProposals.status === 401, 'Employee accessing /api/proposals is blocked with 403 Forbidden', { status: empProposals.status, data: empProposals.data });

  // Invoices
  const empInvoices = await apiRequest('/api/invoices', { headers: empHeaders });
  assert(empInvoices.status === 403 || empInvoices.status === 401, 'Employee accessing /api/invoices is blocked with 403 Forbidden', { status: empInvoices.status, data: empInvoices.data });

  // Settings
  const empSettings = await apiRequest('/api/settings', { headers: empHeaders });
  assert(empSettings.status === 403 || empSettings.status === 401, 'Employee accessing /api/settings is blocked with 403 Forbidden', { status: empSettings.status, data: empSettings.data });

  // Modify Office Timings (PUT requires ADMIN)
  const empTimingsPut = await apiRequest('/api/office-timings', {
    method: 'PUT',
    headers: empHeaders,
    body: { autoCutoffEnabled: false },
  });
  assert(empTimingsPut.status === 403 || empTimingsPut.status === 401, 'Employee attempting to modify /api/office-timings is blocked with 403 Forbidden', { status: empTimingsPut.status, data: empTimingsPut.data });

  // Modify Screenshots Settings
  const empScreenshotPost = await apiRequest('/api/screenshots/settings', {
    method: 'PUT',
    headers: empHeaders,
    body: { enabled: false },
  });
  assert(empScreenshotPost.status === 403 || empScreenshotPost.status === 401, 'Employee attempting to modify /api/screenshots/settings is blocked with 403 Forbidden', { status: empScreenshotPost.status, data: empScreenshotPost.data });

  // Employee Time Sheet
  const empTime = await apiRequest('/api/time', { headers: empHeaders });
  assert(empTime.status === 200 && Array.isArray(empTime.data?.entries), 'Employee /api/time returns entries list', empTime.data);

  // 4. FUNCTIONAL CRUD & ASSIGNMENT INTEGRITY
  console.log('\n--- 4. Functional CRUD & Assignment Integrity Tests ---');

  // Admin Client Creation with Assigned Staff
  const newClientRes = await apiRequest('/api/clients', {
    method: 'POST',
    headers: adminHeaders,
    body: {
      name: 'Test Client Corp',
      company: 'Test Corp',
      email: 'testclient@example.com',
      phone: '+1-555-0100',
      notes: 'Automated test client',
      assignedUserIds: [empMe.data?.user?.id],
    },
  });
  assert(newClientRes.status === 201 || newClientRes.status === 200, 'Admin can create a new client with assigned staff', newClientRes.data);
  const createdClientId = newClientRes.data?.client?.id || newClientRes.data?.id;

  if (createdClientId) {
    // Check Employee can see this assigned client
    const empClientsAfter = await apiRequest('/api/clients', { headers: empHeaders });
    const canSeeAssigned = empClientsAfter.data?.clients?.some(c => c.id === createdClientId);
    assert(canSeeAssigned, 'Employee can immediately see the newly assigned client', createdClientId);

    // Clean up test client
    const deleteClientRes = await apiRequest(`/api/clients/${createdClientId}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    assert(deleteClientRes.status === 200, 'Admin can delete the test client', deleteClientRes.data);
  }

  // 5. STOPWATCH TIMER START & STOP CYCLE (Employee on Assigned Project)
  console.log('\n--- 5. Stopwatch Timer Cycle (Employee) ---');
  // Find project accessible to employee
  const accessibleProj = empProjects.data?.projects?.[0];
  if (accessibleProj) {
    // Check current active timer via GET /api/time
    const timeStatusBefore = await apiRequest('/api/time', { headers: empHeaders });
    assert(timeStatusBefore.status === 200, 'Employee /api/time returns status 200', timeStatusBefore.data);

    // If an active timer is already running for employee, stop it first
    if (timeStatusBefore.data?.activeTimer) {
      await apiRequest('/api/time', {
        method: 'POST',
        headers: empHeaders,
        body: { action: 'STOP' },
      });
    }

    // Start timer on accessible project
    const startTimerRes = await apiRequest('/api/time', {
      method: 'POST',
      headers: empHeaders,
      body: {
        action: 'START',
        projectId: accessibleProj.id,
        description: 'Working on deliverable sprint',
      },
    });
    assert(startTimerRes.status === 200 && (startTimerRes.data?.timer?.isRunning || startTimerRes.data?.entry?.isRunning), 'Employee can start a project timer', startTimerRes.data);

    // Verify active timer is running via GET /api/time
    const timeStatusRunning = await apiRequest('/api/time', { headers: empHeaders });
    assert(timeStatusRunning.data?.activeTimer?.projectId === accessibleProj.id, 'Active timer verified running for employee', timeStatusRunning.data?.activeTimer);

    // Stop timer
    const stopTimerRes = await apiRequest('/api/time', {
      method: 'POST',
      headers: empHeaders,
      body: {
        action: 'STOP',
        description: 'Completed deliverable sprint',
      },
    });
    assert(stopTimerRes.status === 200 && stopTimerRes.data?.entry?.isRunning === false, 'Employee can stop running timer cleanly', stopTimerRes.data);

    // Verify active timer is cleared
    const timeStatusAfter = await apiRequest('/api/time', { headers: empHeaders });
    assert(!timeStatusAfter.data?.activeTimer, 'Active timer is successfully stopped and cleared', timeStatusAfter.data);
  } else {
    console.log('  ⚠️ No accessible projects found for employee to test stopwatch');
  }

  // Security Test: Employee attempting to start timer on unassigned project
  const unassignedProj = adminProjects.data?.projects?.find(
    ap => !empProjects.data?.projects?.some(ep => ep.id === ap.id)
  );
  if (unassignedProj) {
    const unassignedTimerRes = await apiRequest('/api/time', {
      method: 'POST',
      headers: empHeaders,
      body: {
        action: 'START',
        projectId: unassignedProj.id,
      },
    });
    assert(unassignedTimerRes.status === 404, 'Employee starting timer on unassigned project is rejected with 404', unassignedTimerRes.status);
  }

  // 6. CHAT & REAL-TIME MESSAGING
  console.log('\n--- 6. Chat & Real-Time Messaging API ---');
  const adminChatConvs = await apiRequest('/api/chat/conversations', { headers: adminHeaders });
  assert(adminChatConvs.status === 200, 'Admin /api/chat/conversations returns 200', adminChatConvs.data);

  const empChatConvs = await apiRequest('/api/chat/conversations', { headers: empHeaders });
  assert(empChatConvs.status === 200, 'Employee /api/chat/conversations returns 200', empChatConvs.data);

  const adminUnread = await apiRequest('/api/chat/unread', { headers: adminHeaders });
  assert(adminUnread.status === 200, 'Admin /api/chat/unread returns unread counts', adminUnread.data);

  const empUnread = await apiRequest('/api/chat/unread', { headers: empHeaders });
  assert(empUnread.status === 200, 'Employee /api/chat/unread returns unread counts', empUnread.data);

  console.log('\n========================================');
  console.log(`📊 AUDIT SUMMARY: ${results.passed} Passed, ${results.failed} Failed`);
  console.log('========================================');

  if (results.failed > 0) {
    console.error('\n⚠️ ISSUES DETECTED:');
    results.issues.forEach((iss, idx) => {
      console.error(`${idx + 1}. ${iss.message}`);
      if (iss.errorDetail) console.error('   ', iss.errorDetail);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 ALL ADMIN & EMPLOYEE WORKFLOWS PASSED WITH 0 ERRORS!');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
