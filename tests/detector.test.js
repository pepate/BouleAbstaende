import { test, assertEqual, assertClose, createTestImage } from './harness.js';
import { toGrayscale, gaussianBlur, sobel, houghCircles, nonMaxSuppression, detect } from '../modules/detector.js';

test('toGrayscale: black pixels stay 0', () => {
  const img = createTestImage(2, 2, ctx => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 2, 2);
  });
  const g = toGrayscale(img);
  assertEqual(g.length, 4);
  assertEqual(Array.from(g), [0, 0, 0, 0]);
});

test('toGrayscale: white pixels become 255', () => {
  const img = createTestImage(2, 2, () => {});  // default fillStyle white
  const g = toGrayscale(img);
  assertEqual(Array.from(g), [255, 255, 255, 255]);
});

test('toGrayscale: red gets ~76 (0.299*255)', () => {
  const img = createTestImage(1, 1, ctx => {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 1, 1);
  });
  const g = toGrayscale(img);
  assertClose(g[0], 76, 2);
});

test('gaussianBlur: uniform input remains uniform in interior', () => {
  const w = 5, h = 5;
  const gray = new Uint8ClampedArray(w * h).fill(100);
  const out = gaussianBlur(gray, w, h);
  assertEqual(out[2 * w + 2], 100);
});

test('sobel: flat image has zero edges', () => {
  const w = 5, h = 5;
  const gray = new Uint8ClampedArray(w * h).fill(128);
  const out = sobel(gray, w, h);
  assertEqual(out[2 * w + 2], 0);
});

test('sobel: vertical edge is detected', () => {
  const w = 5, h = 5;
  const gray = new Uint8ClampedArray(w * h);
  // Left half black, right half white
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      gray[y * w + x] = x < 2 ? 0 : 255;
    }
  }
  const out = sobel(gray, w, h);
  if (out[2 * w + 2] < 100) {
    throw new Error('Expected strong edge at boundary, got ' + out[2 * w + 2]);
  }
});

test('houghCircles: detects single drawn circle', () => {
  const w = 80, h = 80;
  const img = createTestImage(w, h, ctx => {
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(40, 40, 15, 0, Math.PI * 2);
    ctx.fill();
  });
  const gray = toGrayscale(img);
  const edges = sobel(gray, w, h);
  const candidates = houghCircles(edges, w, h, 12, 18, 60);
  const hit = candidates.find(c =>
    Math.hypot(c.x - 40, c.y - 40) < 3 && Math.abs(c.r - 15) <= 2
  );
  if (!hit) {
    throw new Error('No circle detected at (40,40) r=15. Got ' + candidates.length + ' candidates.');
  }
});

test('nonMaxSuppression: keeps only highest-score in cluster', () => {
  const cands = [
    { x: 50, y: 50, r: 10, score: 30 },
    { x: 52, y: 51, r: 10, score: 40 },
    { x: 100, y: 100, r: 10, score: 25 },
  ];
  const out = nonMaxSuppression(cands, 10);
  assertEqual(out.length, 2);
  assertEqual(out[0].score, 40);
});

test('nonMaxSuppression: empty input returns empty', () => {
  assertEqual(nonMaxSuppression([], 10), []);
});

test('detect: finds three drawn circles in synthetic image', () => {
  const w = 200, h = 200;
  const positions = [
    { x: 50, y: 50, r: 18 },
    { x: 150, y: 80, r: 20 },
    { x: 100, y: 160, r: 22 },
  ];
  const img = createTestImage(w, h, ctx => {
    ctx.fillStyle = '#000000';
    for (const p of positions) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const found = detect(img, { rMin: 14, rMax: 26, edgeThreshold: 50 });

  if (found.length < 3) {
    throw new Error(`Expected ≥3 detections, got ${found.length}`);
  }
  for (const p of positions) {
    const hit = found.find(f =>
      Math.hypot(f.x - p.x, f.y - p.y) < 5 && Math.abs(f.r - p.r) <= 3
    );
    if (!hit) {
      throw new Error(`No detection near (${p.x},${p.y}) r=${p.r}. Got: ${JSON.stringify(found)}`);
    }
  }
});
