import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

async function runLocalRoleTests() {
  console.log('\n======================================================');
  console.log(`🚀 COMPREHENSIVE LOCAL UI TEST: ADMIN & EMPLOYEE PERSPECTIVE`);
  console.log(`Target: ${BASE_URL}`);
  console.log('======================================================\n');

  const browser = await chromium.launch({ headless: true });

  const summary = { passed: 0, failed: 0, errors: [] };

  function assert(condition, testName, extra = null) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      summary.passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      if (extra) console.error(`     Detail:`, extra);
      summary.failed++;
      summary.errors.push({ testName, extra });
    }
  }

  try {
    // ==========================================
    // PART 1: ADMIN ROLE TESTING
    // ==========================================
    console.log('--- 👤 PART 1: Testing Admin Perspective ---');
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    // 1. Admin Login
    await adminPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await adminPage.fill('#login-email', 'admin@clienthub.local');
    await adminPage.fill('#login-password', 'Password@123');
    await adminPage.click('#login-submit-btn');
    await adminPage.waitForURL('**/dashboard', { timeout: 15000 });
    assert(adminPage.url().includes('/dashboard'), 'Admin logged in and redirected to /dashboard');

    // 2. Admin Dashboard
    const adminWelcome = await adminPage.textContent('h1.page-heading');
    assert(adminWelcome && adminWelcome.includes('Welcome back'), 'Admin Dashboard displays Welcome header', adminWelcome);

    // Admin should see Admin sidebar items
    const proposalsNav = await adminPage.$('#nav-proposals');
    const invoicesNav = await adminPage.$('#nav-invoices');
    const settingsNav = await adminPage.$('#nav-settings');
    const employeesNav = await adminPage.$('#nav-employees');
    assert(Boolean(proposalsNav), 'Admin sidebar has Proposals link');
    assert(Boolean(invoicesNav), 'Admin sidebar has Invoices link');
    assert(Boolean(settingsNav), 'Admin sidebar has Settings link');
    assert(Boolean(employeesNav), 'Admin sidebar has Employees link');

    // 3. Admin Clients
    await adminPage.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle' });
    const newClientBtn = await adminPage.locator('button:has-text("New Client")').count();
    assert(newClientBtn > 0, 'Admin /clients has "New Client" creation button');
    const adminClientText = await adminPage.textContent('body');
    assert(adminClientText.includes('Bright Bakery'), 'Admin sees Client: Bright Bakery');

    // 4. Admin Projects
    await adminPage.goto(`${BASE_URL}/projects`, { waitUntil: 'networkidle' });
    const newProjectBtn = await adminPage.locator('button:has-text("New Project")').count();
    assert(newProjectBtn > 0, 'Admin /projects has "New Project" creation button');

    // 5. Admin Proposals
    await adminPage.goto(`${BASE_URL}/proposals`, { waitUntil: 'networkidle' });
    const newProposalBtn = await adminPage.locator('button:has-text("New AI Proposal")').count();
    assert(newProposalBtn > 0, 'Admin /proposals has "New AI Proposal" button');

    // 6. Admin Invoices
    await adminPage.goto(`${BASE_URL}/invoices`, { waitUntil: 'networkidle' });
    const newInvoiceBtn = await adminPage.locator('button:has-text("New Invoice")').count();
    assert(newInvoiceBtn > 0, 'Admin /invoices has "New Invoice" button');

    // 7. Admin Settings
    await adminPage.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    const saveSettingsBtn = await adminPage.locator('button:has-text("Save Agency Settings")').count();
    assert(saveSettingsBtn > 0, 'Admin /settings has "Save Agency Settings" button');

    // 8. Admin Employees
    await adminPage.goto(`${BASE_URL}/employees`, { waitUntil: 'networkidle' });
    const addTeamBtn = await adminPage.locator('button:has-text("Add Team Member")').count();
    assert(addTeamBtn > 0, 'Admin /employees has "Add Team Member" button');

    // 9. Admin Office Timings
    await adminPage.goto(`${BASE_URL}/office-timings`, { waitUntil: 'networkidle' });
    const saveOfficeBtn = await adminPage.locator('button:has-text("Save Timings")').count();
    assert(saveOfficeBtn > 0, 'Admin /office-timings has "Save Timings" button');

    await adminContext.close();

    // ==========================================
    // PART 2: EMPLOYEE ROLE TESTING
    // ==========================================
    console.log('\n--- 👥 PART 2: Testing Employee Perspective ---');
    const empContext = await browser.newContext();
    const empPage = await empContext.newPage();

    // 1. Employee Login
    await empPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await empPage.fill('#login-email', 'employee@clienthub.local');
    await empPage.fill('#login-password', 'Password@123');
    await empPage.click('#login-submit-btn');
    await empPage.waitForURL('**/dashboard', { timeout: 15000 });
    assert(empPage.url().includes('/dashboard'), 'Employee logged in and redirected to /dashboard');

    // 2. Employee Dashboard
    const empWelcome = await empPage.textContent('h1.page-heading');
    assert(empWelcome && empWelcome.includes('Welcome back'), 'Employee Dashboard displays Welcome header', empWelcome);

    // Employee sidebar MUST NOT have Admin-only items
    const empProposalsNav = await empPage.$('#nav-proposals');
    const empInvoicesNav = await empPage.$('#nav-invoices');
    const empSettingsNav = await empPage.$('#nav-settings');
    assert(!empProposalsNav, 'Employee sidebar DOES NOT have Proposals link');
    assert(!empInvoicesNav, 'Employee sidebar DOES NOT have Invoices link');
    assert(!empSettingsNav, 'Employee sidebar DOES NOT have Settings link');

    // 3. Employee Clients
    await empPage.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle' });
    const empNewClientBtn = await empPage.locator('button:has-text("New Client")').count();
    assert(empNewClientBtn === 0, 'Employee /clients DOES NOT have "New Client" button');
    const empClientText = await empPage.textContent('body');
    assert(empClientText.includes('Bright Bakery'), 'Employee sees assigned client: Bright Bakery');
    assert(!empClientText.includes('Apex Logistics'), 'Employee CANNOT see unassigned client: Apex Logistics');

    // 4. Employee Projects
    await empPage.goto(`${BASE_URL}/projects`, { waitUntil: 'networkidle' });
    const empNewProjectBtn = await empPage.locator('button:has-text("New Project")').count();
    assert(empNewProjectBtn === 0, 'Employee /projects DOES NOT have "New Project" button');

    // 5. Employee Employees directory (View-only)
    await empPage.goto(`${BASE_URL}/employees`, { waitUntil: 'networkidle' });
    const empAddTeamBtn = await empPage.locator('button:has-text("Add Team Member")').count();
    assert(empAddTeamBtn === 0, 'Employee /employees DOES NOT have "Add Team Member" button');
    const empEditBtn = await empPage.locator('button:has-text("Edit & Assign")').count();
    assert(empEditBtn === 0, 'Employee /employees DOES NOT have "Edit & Assign" buttons');

    // 6. Employee Office Timings (View-only)
    await empPage.goto(`${BASE_URL}/office-timings`, { waitUntil: 'networkidle' });
    const empSaveOfficeBtn = await empPage.locator('button:has-text("Save Timings")').count();
    assert(empSaveOfficeBtn === 0, 'Employee /office-timings DOES NOT have "Save Timings" button');

    // 7. Security Route Guard: Employee direct navigation to Admin URLs MUST bounce to /dashboard
    console.log('\n--- 🛡️ PART 3: Route Guard Redirection Tests ---');

    // Direct /proposals
    await empPage.goto(`${BASE_URL}/proposals`, { waitUntil: 'networkidle' });
    await empPage.waitForTimeout(1000);
    assert(empPage.url().endsWith('/dashboard'), 'Direct access to /proposals redirects Employee to /dashboard', empPage.url());

    // Direct /invoices
    await empPage.goto(`${BASE_URL}/invoices`, { waitUntil: 'networkidle' });
    await empPage.waitForTimeout(1000);
    assert(empPage.url().endsWith('/dashboard'), 'Direct access to /invoices redirects Employee to /dashboard', empPage.url());

    // Direct /settings
    await empPage.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    await empPage.waitForTimeout(1000);
    assert(empPage.url().endsWith('/dashboard'), 'Direct access to /settings redirects Employee to /dashboard', empPage.url());

    // Direct /mail
    await empPage.goto(`${BASE_URL}/mail`, { waitUntil: 'networkidle' });
    await empPage.waitForTimeout(1000);
    assert(empPage.url().endsWith('/dashboard'), 'Direct access to /mail redirects Employee to /dashboard', empPage.url());

    // Direct /screenshot
    await empPage.goto(`${BASE_URL}/screenshot`, { waitUntil: 'networkidle' });
    await empPage.waitForTimeout(1000);
    assert(empPage.url().endsWith('/dashboard'), 'Direct access to /screenshot redirects Employee to /dashboard', empPage.url());

    await empContext.close();

  } finally {
    await browser.close();
  }

  console.log('\n======================================================');
  console.log(`🏁 LOCAL UI TEST RESULT: ${summary.passed} Passed, ${summary.failed} Failed`);
  console.log('======================================================');

  if (summary.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runLocalRoleTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
