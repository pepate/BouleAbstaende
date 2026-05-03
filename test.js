// Smoke test for simplified 2-step flow
const { chromium } = require('C:/nvm4w/nodejs/node_modules/@playwright/test/node_modules/playwright');
const path = require('path');

const TEST_IMAGE = path.join(__dirname, 'unnamed (1).jpg');
const URL = 'http://localhost:8765/';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 } });
  const page = await ctx.newPage();

  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });

  await page.goto(URL);
  await page.waitForSelector('#btn-upload');
  // Cancel auto-camera
  const cancel = await page.$('#camera-cancel');
  if (cancel) { try { await cancel.click({ timeout: 800 }); } catch {} }

  await page.setInputFiles('#file-input', TEST_IMAGE);
  await page.waitForFunction(() => window.app && window.app.image !== null);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-screenshots/01-loaded-jack-detected.png' });

  // Click coords helper
  const click = async (natX, natY) => {
    const info = await page.evaluate(() => {
      const c = document.getElementById('canvas');
      const r = c.getBoundingClientRect();
      return { left: r.left, top: r.top, sw: r.width / c.width, sh: r.height / c.height };
    });
    await page.mouse.click(info.left + natX * info.sw, info.top + natY * info.sh);
    await page.waitForTimeout(100);
  };

  // Click Weiter (jack auto-detected, just confirm)
  await page.click('#btn-next');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-screenshots/02-step-boules.png' });

  // Click on each boule manually
  await click(195, 260);  // left boule
  await click(805, 290);  // right boule
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-screenshots/03-boules-marked.png' });

  // Finish
  await page.click('#btn-next');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-screenshots/04-done.png' });

  const result = await page.evaluate(() => {
    const a = window.app;
    if (!a.jack || !a.boules.length) return { state: a.state };
    const dists = a.boules.map((b, i) => {
      const dx = b.x - a.jack.x, dy = b.y - a.jack.y;
      return { idx: i + 1, d: Math.sqrt(dx*dx+dy*dy) };
    });
    const minD = Math.min(...dists.map(x => x.d));
    return {
      state: a.state,
      jack: a.jack,
      boules: a.boules,
      distances: dists.map(d => ({ ...d, pctLonger: ((d.d / minD - 1) * 100).toFixed(1) + '%' })),
    };
  });
  console.log('Result:', JSON.stringify(result, null, 2));

  await browser.close();
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
