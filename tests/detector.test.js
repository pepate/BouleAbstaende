import { test, assertEqual, assertClose, createTestImage } from './harness.js';
import { toGrayscale, gaussianBlur, sobel } from '../modules/detector.js';

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
