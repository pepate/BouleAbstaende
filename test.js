// Playwright smoke test for BouleMesser
const { chromium } = require('C:/nvm4w/nodejs/node_modules/@playwright/test/node_modules/playwright');
const path = require('path');

const TEST_IMAGE = path.join(__dirname, 'unnamed (1).jpg');
const URL = 'http://localhost:8765/';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });

  await page.goto(URL);
  await page.waitForSelector('#btn-upload');

  // Upload test image
  await page.setInputFiles('#file-input', TEST_IMAGE);
  await page.waitForFunction(() => window.app && window.app.image !== null);
  await page.waitForTimeout(300);

  await page.screenshot({ path: 'test-screenshots/01-loaded.png' });

  // Get canvas position helpers
  const getCanvasInfo = () => page.evaluate(() => {
    const c = document.getElementById('canvas');
    const r = c.getBoundingClientRect();
    return {
      left: r.left, top: r.top, width: r.width, height: r.height,
      naturalW: c.width, naturalH: c.height,
      scale: r.width / c.width,
    };
  });

  // Click on canvas in image-natural coordinates
  async function clickAt(natX, natY) {
    const info = await getCanvasInfo();
    const x = info.left + natX * info.scale;
    const y = info.top + natY * info.scale;
    await page.mouse.click(x, y);
  }

  // Test image dimensions: 512x288 ish — let me verify
  const info = await getCanvasInfo();
  console.log('Canvas info:', info);

  // From the test image, approximate locations (in natural pixels):
  // Image is 512 wide.
  // Meter stick spans roughly from x=120 to x=420 at y=180
  // Left boule: ~70, 130
  // Right boule: ~440, 140
  // Jack (orange): ~250, 150
  // Stick (white) horizontal across middle

  // Step 1: Calibrate point 1 (left end of stick)
  await clickAt(125, 180);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-screenshots/02-cal-p1.png' });

  // Step 2: Calibrate point 2 (right end of stick)
  await clickAt(425, 175);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-screenshots/03-cal-p2.png' });

  // Step 3: Confirm length (default 100cm — the image shows a meter stick)
  // Check that input is visible and confirm
  await page.waitForSelector('#cal-length');
  await page.fill('#cal-length', '100');
  await page.click('#btn-cal-confirm');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-screenshots/04-cal-done.png' });

  // Step 4: Mark jack (orange ball)
  await clickAt(247, 150);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-screenshots/05-jack.png' });

  // Step 5: Mark boules
  await clickAt(75, 130);
  await page.waitForTimeout(100);
  await clickAt(440, 140);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-screenshots/06-boules.png' });

  // Finish
  await page.click('#btn-finish');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-screenshots/07-done.png', fullPage: true });

  // Read computed distances
  const result = await page.evaluate(() => {
    const a = window.app;
    return {
      pxPerCm: a.calibration.pxPerCm,
      jack: a.jack,
      boules: a.boules,
      distances: a.boules.map(b => {
        const dx = b.x - a.jack.x, dy = b.y - a.jack.y;
        return Math.sqrt(dx*dx+dy*dy) / a.calibration.pxPerCm;
      }),
    };
  });
  console.log('Result:', JSON.stringify(result, null, 2));

  await browser.close();
  console.log('✓ Test completed successfully');
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
