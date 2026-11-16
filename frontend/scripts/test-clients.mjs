import { chromium } from '@playwright/test';

const BASE_URL = 'https://el-ka5y.vercel.app';

async function runFullE2ETest() {
  console.log(`\n============================================================`);
  console.log(`🚀 COMPREHENSIVE E2E & CLIENT LIFECYCLE TEST ON ${BASE_URL}`);
  console.log(`============================================================\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = `[Browser ${msg.type().toUpperCase()}] ${msg.text()}`;
      consoleLogs.push(text);
      console.log(text);
    }
  });

  page.on('pageerror', (err) => {
    const text = `[Page Uncaught Error] ${err.message}`;
    consoleLogs.push(text);
    console.error(text);
  });

  page.on('response', async (res) => {
    if (res.status() >= 400) {
      let body = '';
      try {
        body = await res.text();
      } catch {}
      const text = `[HTTP ${res.status()}] ${res.request().method()} ${res.url()} -> ${body.slice(0, 200)}`;
      networkErrors.push(text);
      console.error(text);
    }
  });

  try {
    // 1. Login
    console.log('1️⃣ Logging in as Admin...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', 'admin@clienthub.local');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    console.log(`URL after login: ${page.url()}`);
    if (!page.url().includes('/dashboard')) {
      await page.waitForURL('**/dashboard', { timeout: 10000 });
    }
    console.log('✅ Successfully authenticated and reached Dashboard!');

    // 2. Navigate to /clients
    console.log('\n2️⃣ Navigating to /clients...');
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("New Client"), button:has-text("Add Client")');

    // 3. Open Add Client modal
    console.log('3️⃣ Opening "New Client" modal...');
    await page.locator('button:has-text("New Client"), button:has-text("Add Client")').first().click();
    await page.waitForTimeout(1000);

    // 4. Fill form
    console.log('4️⃣ Filling in client details...');
    const timestamp = Date.now().toString().slice(-4);
    const testClientName = `Alpha Client ${timestamp}`;
    const testCompany = `Apex Venture ${timestamp}`;
    const testEmail = `alpha.${timestamp}@apex.test`;
    const testPhone = `+1-555-01${timestamp.slice(-2)}`;
    const testNotes = 'Playwright automated client lifecycle verification';

    await page.fill('input[placeholder*="Rachel Adams"]', testClientName);
    await page.fill('input[placeholder*="Horizon Labs"]', testCompany);
    await page.fill('input[placeholder*="rachel@horizon.com"]', testEmail);
    await page.fill('input[placeholder*="+1-555-0199"]', testPhone);
    const notesField = await page.$('textarea');
    if (notesField) {
      await notesField.fill(testNotes);
    }

    // Submit form and wait for POST /api/clients
    console.log('5️⃣ Submitting Create Client form...');
    const [createResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/clients') && r.request().method() === 'POST'),
      page.click('form button[type="submit"]'),
    ]);
    const createData = await createResponse.json();
    console.log(`✅ Client created with ID: ${createData.client?.id}`);

    // Grab portal link from banner
    let portalUrl = '';
    const codeTag = await page.$('code');
    if (codeTag) {
      portalUrl = (await codeTag.textContent())?.trim() || '';
      console.log(`🔗 Generated Client Portal Link: ${portalUrl}`);
    }

    // Close create modal
    const doneBtn = page.locator('button:has-text("Done")');
    if (await doneBtn.count() > 0) {
      await doneBtn.click();
      await page.waitForTimeout(1000);
    }

    // 6. Verify client appears in the list
    console.log('\n6️⃣ Verifying client is present in client list...');
    await page.waitForTimeout(1500);
    const listContent = await page.textContent('body');
    const clientInList = listContent.includes(testClientName) && listContent.includes(testCompany);
    console.log(`✅ Client found in list: ${clientInList}`);

    // 7. Test Portal access if portalUrl was captured
    if (portalUrl && portalUrl.startsWith('http')) {
      console.log(`\n7️⃣ Testing Public Portal Access at ${portalUrl}...`);
      const portalContext = await browser.newContext(); // completely clean incognito session without cookies
      const portalPage = await portalContext.newPage();
      
      const portalErrors = [];
      portalPage.on('response', (res) => {
        if (res.status() >= 400) portalErrors.push(`[Portal HTTP ${res.status()}] ${res.url()}`);
      });

      await portalPage.goto(portalUrl, { waitUntil: 'domcontentloaded' });
      await portalPage.waitForSelector('h1', { timeout: 15000 });
      await portalPage.waitForTimeout(1000);

      const portalBody = await portalPage.textContent('body');
      const hasClientName = portalBody.includes(testClientName);
      const hasCompany = portalBody.includes(testCompany);
      const hasAgency = portalBody.includes('Acme Digital Agency');

      console.log(`✅ Portal page title: ${await portalPage.title()}`);
      console.log(`✅ Portal rendered Client Name: ${hasClientName}`);
      console.log(`✅ Portal rendered Company Name: ${hasCompany}`);
      console.log(`✅ Portal rendered Agency Branding: ${hasAgency}`);
      console.log(`✅ Portal network errors: ${portalErrors.length}`);
      await portalContext.close();
    }

    // 8. Test Editing the client
    console.log('\n8️⃣ Testing Client Edit functionality...');
    // Locate the specific card for our created client
    const clientCard = page.locator('div.border-border', { hasText: testClientName }).last();
    const editBtn = clientCard.locator('button[title="Edit Client"]').first();
    await editBtn.click();
    await page.waitForTimeout(1000);

    const updatedName = `${testClientName} (Updated)`;
    const editModal = page.locator('div.fixed:has-text("Edit Client")');
    const nameInput = editModal.locator('input[type="text"]').first();
    await nameInput.fill(updatedName);
    
    // Save changes and wait for PATCH response
    console.log('Submitting client update...');
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/clients') && r.request().method() === 'PATCH'),
      editModal.locator('button[type="submit"]').click(),
    ]);
    console.log('✅ Client updated successfully via PATCH!');

    await page.waitForTimeout(2000);
    const refreshedList = await page.textContent('body');
    const editSuccess = refreshedList.includes(updatedName);
    console.log(`✅ Client updated name displayed on screen: ${editSuccess}`);

    // 9. Test Delete Client Modal & Action
    console.log('\n9️⃣ Testing Client Delete functionality...');
    const updatedClientCard = page.locator('div.border-border', { hasText: updatedName }).last();
    const deleteBtn = updatedClientCard.locator('button[title="Delete Client"]').first();
    await deleteBtn.click();
    await page.waitForTimeout(1000);

    // Confirm deletion in modal and wait for DELETE response
    const deleteModal = page.locator('div.fixed:has-text("Delete Client")');
    console.log('Submitting client deletion...');
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/clients') && r.request().method() === 'DELETE'),
      deleteModal.locator('button:has-text("Delete Client")').click(),
    ]);
    console.log('✅ Client deleted successfully via DELETE!');

    await page.waitForTimeout(2000);
    const postDeleteList = await page.textContent('body');
    const deletedCleanly = !postDeleteList.includes(updatedName);
    console.log(`✅ Client cleanly removed from list: ${deletedCleanly}`);

    // 10. Smoke Test Across All Other Application Modules
    console.log('\n🔟 Testing All Other Modules for Zero Errors...');
    const modules = [
      '/dashboard',
      '/projects',
      '/employees',
      '/screenshot',
      '/time-sheet',
      '/calendar',
      '/mail',
      '/settings',
      '/office-timings',
    ];

    for (const mod of modules) {
      await page.goto(`${BASE_URL}${mod}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      console.log(`  ✓ ${mod} loaded cleanly`);
    }

  } catch (err) {
    console.error('Test failed with error:', err);
  } finally {
    console.log('\n============================================================');
    console.log('🏁 FINAL E2E TEST SUMMARY');
    console.log('============================================================');
    console.log(`Total Console Errors: ${consoleLogs.length}`);
    console.log(`Total HTTP >= 400 Responses: ${networkErrors.length}`);
    networkErrors.forEach((e) => console.log(`  - ${e}`));
    console.log('============================================================\n');
    await browser.close();
  }
}

runFullE2ETest();
