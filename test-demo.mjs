import { chromium } from 'playwright';

const BASE = 'http://localhost:3004';
const EMAIL = 'mido@loomark.com';
const PASS = 'Mido010@';
const SS = 'd:/HelioMax/.claude';

async function ss(page, name) {
  await page.screenshot({ path: `${SS}/test-${name}.png`, fullPage: false });
  console.log(`  📸 ${name}`);
}

async function waitForApp(page) {
  // Wait for the loading screen text "HELIOMAX" to disappear, then sidebar to appear
  await page.waitForFunction(
    () => {
      const fixed = Array.from(document.querySelectorAll('.fixed.inset-0'));
      const hasOverlay = fixed.some(el => el.textContent?.includes('HELIOMAX') && el.closest('[class*="z-"]'));
      if (hasOverlay) return false;
      return !!document.querySelector('aside');
    },
    { timeout: 15000 }
  ).catch(() => {});
  await page.waitForTimeout(600);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // ── 1. Login page ──────────────────────────────────────────────────────────
  console.log('\n▶ 1. Login page — HelioAgent auto-open');
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await ss(page, '01-login');
  const agentOpen = await page.locator('text=هيليو').first().isVisible().catch(() => false);
  console.log(`  AI chat auto-opened: ${agentOpen}`);

  // ── 2. Standard login ─────────────────────────────────────────────────────
  console.log('\n▶ 2. Sign in');
  await page.fill('input[placeholder*="gchv"], input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  // Full-page reload to /dashboard after login
  await page.waitForURL('**/dashboard', { timeout: 12000 });
  await waitForApp(page);
  await ss(page, '02-dashboard');
  console.log(`  Dashboard loaded: ${page.url()}`);

  // ── 3. CRM — click sidebar link (client-side nav, no reload) ──────────────
  console.log('\n▶ 3. CRM');
  await page.click('a[href="/crm"], text=إدارة العملاء, text=CRM').catch(async () => {
    await page.goto(BASE + '/crm', { waitUntil: 'networkidle' });
  });
  await waitForApp(page);
  await ss(page, '03-crm');

  // ── 4. Tasks ───────────────────────────────────────────────────────────────
  console.log('\n▶ 4. Tasks');
  await page.click('a[href="/tasks"], text=المهام').catch(async () => {
    await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  });
  await waitForApp(page);
  await ss(page, '04-tasks');

  // ── 5. AI Assistant ────────────────────────────────────────────────────────
  console.log('\n▶ 5. AI Assistant');
  await page.click('a[href="/ai-assistant"], text=المساعد الذكي').catch(async () => {
    await page.goto(BASE + '/ai-assistant', { waitUntil: 'networkidle' });
  });
  await waitForApp(page);
  await ss(page, '05-ai-assistant');
  console.log(`  Stayed on /ai-assistant: ${page.url().includes('ai-assistant')}`);

  // Test sending a message
  const ta = page.locator('textarea').first();
  if (await ta.isVisible()) {
    await ta.fill('ما هو نظام VRF وكيف يعمل؟');
    await page.click('button:has-text("إرسال")');
    await page.waitForTimeout(4000);
    await ss(page, '05b-ai-reply');
  }

  // ── 6. BOQ ────────────────────────────────────────────────────────────────
  console.log('\n▶ 6. BOQ /new');
  await page.click('a[href*="/boq"], text=عروض الأسعار').catch(async () => {
    await page.goto(BASE + '/boq/new', { waitUntil: 'networkidle' });
  });
  await waitForApp(page);
  await page.waitForTimeout(1500);
  await ss(page, '06-boq');

  // ── 7. Dashboard ──────────────────────────────────────────────────────────
  console.log('\n▶ 7. Dashboard');
  await page.click('a[href="/dashboard"], text=لوحة التحكم').catch(async () => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  });
  await waitForApp(page);
  await ss(page, '07-dashboard');

  console.log('\n✅ Done. Screenshots in d:/HelioMax/.claude/');
  await browser.close();
})().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
