import { chromium } from '@playwright/test';

const BASE_URL = 'https://el-ka5y.vercel.app';

async function runTests() {
  console.log(`\n🚀 Starting Playwright automated tests on ${BASE_URL}...\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', (msg) => {
    const text = `[Browser ${msg.type().toUpperCase()}] ${msg.text()}`;
    if (msg.type() === 'error' || msg.type() === 'warning') {
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
    // 1. Visit Login Page
    console.log('--- Step 1: Navigating to /login ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`Page title: ${await page.title()}`);

    // Check if error is visible on login page
    const alertBox = await page.$('.bg-red-50');
    if (alertBox) {
      const alertText = await alertBox.textContent();
      console.log(`⚠️ Alert already present on login page: ${alertText}`);
    }

    // 2. Perform Login
    console.log('--- Step 2: Submitting login credentials ---');
    const emailInput = await page.$('input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');

    if (!emailInput || !passwordInput) {
      throw new Error('Email or password input not found on /login');
    }

    await emailInput.fill('admin@clienthub.local');
    await passwordInput.fill('Password@123');

    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    // Wait 4 seconds for login response
    await page.waitForTimeout(4000);

    const cookies = await context.cookies();
    console.log('Cookies after login:', cookies.map(c => `${c.name}=${c.value.slice(0, 15)}...; path=${c.path}; secure=${c.secure}; httpOnly=${c.httpOnly}`));

    const currentUrlAfterLogin = page.url();
    console.log(`URL after login submit: ${currentUrlAfterLogin}`);

    const errorMsgElement = await page.$('.bg-red-50, [role="alert"], .text-error');
    if (errorMsgElement) {
      const errText = await errorMsgElement.textContent();
      console.log(`❌ Login Error on screen: ${errText?.trim()}`);
    }

    // 3. Test /clients page
    console.log('\n--- Step 3: Navigating to /clients ---');
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log(`Current URL: ${page.url()}`);
    console.log(`Page Title: ${await page.title()}`);

    // Check if clients are rendered
    const bodyText = await page.textContent('body');
    console.log(`Page contains "Clients": ${bodyText?.includes('Clients')}`);
    console.log(`Page contains "Bright Bakery": ${bodyText?.includes('Bright Bakery')}`);

    // Look for Add Client button
    const addClientBtn = await page.$('button:has-text("Add Client"), button:has-text("New Client")');
    console.log(`Add Client button found: ${Boolean(addClientBtn)}`);

    if (addClientBtn) {
      console.log('Clicking Add Client button...');
      await addClientBtn.click();
      await page.waitForTimeout(1000);

      // Check if modal popped up
      const modal = await page.$('div[role="dialog"], .fixed');
      console.log(`Modal displayed: ${Boolean(modal)}`);
    }

    // 4. Test other modules
    const modules = [
      '/dashboard',
      '/projects',
      '/employees',
      '/screenshot',
      '/time-sheet',
      '/calendar',
      '/mail',
      '/settings',
      '/office-timings'
    ];

    for (const mod of modules) {
      console.log(`\n--- Testing ${mod} ---`);
      await page.goto(`${BASE_URL}${mod}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);
      console.log(`URL: ${page.url()}`);
      const pageError = await page.$('.bg-red-50, [role="alert"]');
      if (pageError) {
        console.log(`⚠️ Alert on ${mod}: ${(await pageError.textContent())?.trim()}`);
      }
    }

  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    console.log('\n========================================');
    console.log('🏁 TEST SUMMARY');
    console.log('========================================');
    console.log(`Total Console Warnings/Errors: ${consoleLogs.length}`);
    console.log(`Total HTTP >= 400 Responses: ${networkErrors.length}`);
    networkErrors.forEach((e) => console.log(`  - ${e}`));
    console.log('========================================\n');
    await browser.close();
  }
}

runTests();

