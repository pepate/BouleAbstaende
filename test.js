// Smoke test: load image, verify auto-detection runs without errors
const { chromium } = require('C:/nvm4w/nodejs/node_modules/@playwright/test/node_modules/playwright');
const path = require('path');

const TEST_IMAGE = path.join(__dirname, 'unnamed (1).jpg');
const URL = 'http://localhost:8765/';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });

  await page.goto(URL);
  await page.waitForSelector('#btn-upload');

  // Cancel auto-camera modal if it pops up
  const cancelBtn = await page.$('#camera-cancel');
  if (cancelBtn) {
    try { await cancelBtn.click({ timeout: 1000 }); } catch {}
  }

  await page.setInputFiles('#file-input', TEST_IMAGE);
  await page.waitForFunction(() => window.app && window.app.image !== null);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-screenshots/auto-detect.png' });

  const result = await page.evaluate(() => {
    const a = window.app;
    // Debug: count dilated mask pixels around known boule positions
    const id = a.imageData;
    const knownBoules = [{ name: 'left', x: 195, y: 260 }, { name: 'right', x: 805, y: 290 }];
    const debugBoules = knownBoules.map(b => {
      const dx = Math.round(b.x / 4);
      const dy = Math.round(b.y / 4);
      // Sample 5x5 in ds coords
      let dark = 0, total = 0;
      const ds_w = Math.floor(id.width / 4);
      const ds_h = Math.floor(id.height / 4);
      // Estimate bg
      const bg_samples = [];
      for (let yy = 8; yy < id.height; yy += 8) for (let xx = 8; xx < id.width; xx += 8) {
        const ii = (yy * id.width + xx) * 4;
        bg_samples.push((id.data[ii] + id.data[ii+1] + id.data[ii+2]) / 3);
      }
      bg_samples.sort((p, q) => p - q);
      const bg = bg_samples[Math.floor(bg_samples.length * 0.6)];
      // Now check pixels in original image around (b.x, b.y), 30x30 area
      let countMatch = 0, countTotal = 0;
      for (let yy = b.y - 30; yy <= b.y + 30; yy++) {
        for (let xx = b.x - 30; xx <= b.x + 30; xx++) {
          if (xx < 0 || yy < 0 || xx >= id.width || yy >= id.height) continue;
          const ii = (yy * id.width + xx) * 4;
          const r = id.data[ii], g = id.data[ii+1], bl = id.data[ii+2];
          const avg = (r + g + bl) / 3;
          const sat = Math.max(r, g, bl) - Math.min(r, g, bl);
          if (avg < bg * 0.82 && sat < 42 && avg < 165) countMatch++;
          countTotal++;
        }
      }
      return { name: b.name, x: b.x, y: b.y, bg, matchPixels: countMatch, totalPixels: countTotal, ratio: (countMatch / countTotal).toFixed(2) };
    });
    let bg = -1;
    if (a.imageData) {
      const { width: w, height: h, data } = a.imageData;
      const samples = [];
      const step = Math.max(8, Math.floor(Math.min(w, h) / 80));
      for (let y = step; y < h; y += step) {
        for (let x = step; x < w; x += step) {
          const i = (y * w + x) * 4;
          samples.push((data[i] + data[i+1] + data[i+2]) / 3);
        }
      }
      samples.sort((x, y) => x - y);
      bg = samples[Math.floor(samples.length * 0.6)];
    }
    return {
      state: a.state,
      pxPerCm: a.calibration.pxPerCm,
      lengthCm: a.calibration.lengthCm,
      stickP1: a.calibration.p1,
      stickP2: a.calibration.p2,
      jack: a.jack,
      bouleCount: a.boules.length,
      boules: a.boules,
      bgEstimate: bg,
      debugBoules,
    };
  });
  console.log('Auto-detect result:', JSON.stringify(result, null, 2));

  await browser.close();
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
