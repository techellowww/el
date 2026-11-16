import { chromium } from '@playwright/test';

const BASE_URL = 'https://el-ka5y.vercel.app';

async function testClientLifecycle() {
  console.log(`\n🧪 Testing Client Lifecycle on ${BASE_URL}/clients with Playwright...\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
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
      const text = `[HTTP ${res.status()}] ${res.request().method()} ${res.url()} -> ${body.slice(0, 300)}`;
      networkErrors.push(text);
      console.error(text);
    }
  });

  try {
    // 1. Login
    console.log('1️⃣ Logging in as Admin...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="email"]', 'admin@clienthub.local');
    await page.fill('input[type="password"]', 'Password@123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // 2. Navigate to /clients
    console.log('2️⃣ Navigating to /clients...');
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 3. Open Add Client modal
    console.log('3️⃣ Opening "New Client" modal...');
    const addClientBtn = await page.waitForSelector('button:has-text("New Client"), button:has-text("Add Client")', { timeout: 10000 });
    await addClientBtn.click();
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

    // Submit form
    console.log('5️⃣ Submitting Create Client form...');
    await page.click('form button[type="submit"]');
    await page.waitForTimeout(3000);

    // Check if created result modal or success banner is shown
    const bodyContent = await page.textContent('body');
    const createdSuccess = bodyContent.includes('Client Created Successfully');
    console.log(`Client Creation Result: ${createdSuccess ? 'SUCCESS ✅' : 'FAILED ❌'}`);

    // If portal link banner is shown, grab the portal link
    let portalUrl = '';
    const codeTag = await page.$('code');
    if (codeTag) {
      portalUrl = (await codeTag.textContent())?.trim() || '';
      console.log(`Generated Client Portal Link: ${portalUrl}`);
    }

    // Close modal if "Done" button is visible
    const doneBtn = await page.$('button:has-text("Done")');
    if (doneBtn) {
      await doneBtn.click();
      await page.waitForTimeout(1500);
    }

    // 6. Verify client appears in the list
    console.log('6️⃣ Verifying client is present in client list...');
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const listContent = await page.textContent('body');
    const clientInList = listContent.includes(testClientName) && listContent.includes(testCompany);
    console.log(`Client found in list: ${clientInList ? 'YES ✅' : 'NO ❌'}`);

    // 7. Test Portal access if portalUrl was captured
    if (portalUrl && portalUrl.startsWith('http')) {
      console.log(`7️⃣ Testing Public Portal Access at ${portalUrl}...`);
      const portalContext = await browser.newContext(); // clean incognito session without cookies
      const portalPage = await portalContext.newPage();
      
      const portalErrors = [];
      portalPage.on('response', (res) => {
        if (res.status() >= 400) portalErrors.push(`[Portal HTTP ${res.status()}] ${res.url()}`);
      });

      await portalPage.goto(portalUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await portalPage.waitForTimeout(3000);

      const portalBody = await portalPage.textContent('body');
      const hasClientName = portalBody.includes(testClientName);
      const hasCompany = portalBody.includes(testCompany);
      const hasAgency = portalBody.includes('Acme Digital Agency');

      console.log(`Portal page title: ${await portalPage.title()}`);
      console.log(`Portal rendered Client Name: ${hasClientName ? 'YES ✅' : 'NO ❌'}`);
      console.log(`Portal rendered Company Name: ${hasCompany ? 'YES ✅' : 'NO ❌'}`);
      console.log(`Portal rendered Agency Branding: ${hasAgency ? 'YES ✅' : 'NO ❌'}`);
      console.log(`Portal network errors: ${portalErrors.length}`);
      await portalContext.close();
    }

    // 8. Test Editing the client
    console.log('8️⃣ Testing Client Edit functionality...');
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const clientCard = page.locator('div.rounded-card', { hasText: testClientName }).first();
    const editBtn = clientCard.locator('button[title="Edit Client"]');
    await editBtn.click();
    await page.waitForTimeout(1000);

    const updatedName = `${testClientName} (Updated)`;
    // Target the Edit Client modal specifically
    const editModal = page.locator('div.fixed', { hasText: 'Edit Client' });
    const nameInput = editModal.locator('input[type="text"]').first();
    await nameInput.fill(updatedName);
    
    // Save changes
    await editModal.locator('button:has-text("Save Changes")').click();
    await page.waitForTimeout(3000);

    const refreshedList = await page.textContent('body');
    const editSuccess = refreshedList.includes(updatedName);
    console.log(`Client edit applied successfully: ${editSuccess ? 'YES ✅' : 'NO ❌'}`);

    // 9. Test Delete Client Modal & Action
    console.log('9️⃣ Testing Client Delete functionality...');
    const updatedClientCard = page.locator('div.rounded-card', { hasText: updatedName }).first();
    const deleteBtn = updatedClientCard.locator('button[title="Delete Client"]');
    await deleteBtn.click();
    await page.waitForTimeout(1000);

    // Confirm deletion in modal specifically
    const deleteModal = page.locator('div.fixed', { hasText: 'Delete Client' });
    const confirmDeleteBtn = deleteModal.locator('button:has-text("Delete Client")');
    await confirmDeleteBtn.click();
    await page.waitForTimeout(3000);

    const postDeleteList = await page.textContent('body');
    const deletedCleanly = !postDeleteList.includes(updatedName);
    console.log(`Client deleted cleanly from UI: ${deletedCleanly ? 'YES ✅' : 'NO ❌'}`);

  } catch (err) {
    console.error('Test failed with error:', err);
  } finally {
    console.log('\n========================================');
    console.log('🏁 CLIENT LIFECYCLE TEST RESULTS');
    console.log('========================================');
    console.log(`Console Errors/Warnings: ${consoleLogs.length}`);
    console.log(`HTTP >= 400 Errors: ${networkErrors.length}`);
    networkErrors.forEach((e) => console.log(`  - ${e}`));
    console.log('========================================\n');
    await browser.close();
  }
}

testClientLifecycle();
