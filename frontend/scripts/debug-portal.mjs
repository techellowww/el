import { chromium } from '@playwright/test';

async function debugPortal() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('response', async res => {
    if (res.status() >= 400) {
      console.log('PORTAL ERROR:', res.status(), res.url(), await res.text());
    }
  });
  page.on('console', msg => console.log('PORTAL CONSOLE:', msg.text()));
  await page.goto('https://el-ka5y.vercel.app/portal/ch_live_7c2976c3ba76603f0806ba08660c6784abc88eaed5ef395197b00b1adfb27192', { waitUntil: 'networkidle' });
  console.log('HTML CONTENT:', (await page.textContent('body')).slice(0, 500));
  await browser.close();
}

debugPortal();
