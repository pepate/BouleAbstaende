# Live-AR Bouli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Komplette Neuschrift der Bouli-PWA als Live-Kamera-App mit AR-Overlay, das in Echtzeit Boule-Kugeln erkennt und nach Pixel-Abstand zum Bild-Center (Schweinchen) ordnet.

**Architecture:** Modulares Vanilla-JS: `camera` → `detector` (Hough Circle Transform) → `ranker` → `renderer`. Frame-Loop in `app.js`, Detection alle ~100ms, Render jeden Frame. Pure Functions wo möglich, browser-API-Module separat.

**Tech Stack:** Vanilla JS (ES modules), Canvas 2D, getUserMedia, DeviceOrientation, Service Worker. Keine Frameworks, keine Build-Tools.

**Spec:** [docs/superpowers/specs/2026-05-17-live-ar-bouli-design.md](../specs/2026-05-17-live-ar-bouli-design.md)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `index.html` | Rewrite | Layout: video, overlay-canvas, header, permission-screen, level-indicator |
| `styles.css` | Create | Alle Styles (vorher inline in index.html) |
| `app.js` | Rewrite | Bootstrap, Frame-Loop, Verkabelung der Module |
| `modules/camera.js` | Create | getUserMedia, Stream-Lifecycle, `grabFrame()` |
| `modules/detector.js` | Create | Bildverarbeitungs-Pipeline (Graustufen → Blur → Sobel → Hough → NMS) |
| `modules/ranker.js` | Create | Pure: Bälle nach Pixel-Abstand zum Center sortieren, Prozente berechnen |
| `modules/renderer.js` | Create | Canvas-Overlay zeichnen: Fadenkreuz, Linien, Marker, Labels |
| `modules/level.js` | Create | Wasserwaage via DeviceOrientation, iOS-Permission-Handling |
| `modules/pwa.js` | Create | Service-Worker-Registrierung, Install-Prompt |
| `sw.js` | Rewrite | Cache neue Asset-Pfade |
| `manifest.json` | Modify | Description an Live-AR anpassen |
| `tests/runner.html` | Create | Browser-Test-Runner-Seite |
| `tests/harness.js` | Create | Mini-Test-Framework (`test()`, `assertEqual()`, Reporter) |
| `tests/ranker.test.js` | Create | Unit-Tests für Ranker |
| `tests/detector.test.js` | Create | Unit-Tests für Detector-Helpers + Integration |
| `app.js` (alt) | Delete | Alter Foto-Workflow |
| `test.js` (alt) | Delete | Alter Test-Code |
| `generate_icons.py` | Delete | Nicht mehr nötig (Icons existieren) |

---

## Task 1: Cleanup & New Directory Structure

**Files:**
- Delete: `app.js`, `test.js`, `generate_icons.py`, `index.html` (vor Neuschrift)
- Create: `modules/`, `tests/`, `tests/fixtures/` (Verzeichnisse)

- [ ] **Step 1: Lösche alte Dateien**

```bash
rm app.js test.js generate_icons.py index.html
```

- [ ] **Step 2: Lege neue Verzeichnisse an**

```bash
mkdir -p modules tests/fixtures
```

- [ ] **Step 3: Verifiziere Struktur**

Run: `ls -la && ls modules tests`
Expected: `modules/` und `tests/` existieren, alte Top-Level-JS-Dateien sind weg. `icons/`, `manifest.json`, `sw.js`, `README.md` bleiben.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old photo-workflow files, prepare module structure"
```

---

## Task 2: Test Harness (Browser-Runner)

**Files:**
- Create: `tests/harness.js`
- Create: `tests/runner.html`

- [ ] **Step 1: Schreibe `tests/harness.js`**

```javascript
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ?? 'assertEqual'}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

export function assertClose(actual, expected, tolerance = 1, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg ?? 'assertClose'}\n  expected: ${expected} ±${tolerance}\n  actual:   ${actual}`);
  }
}

export async function run() {
  const out = document.getElementById('output') ?? document.body;
  let pass = 0, fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      const line = document.createElement('div');
      line.textContent = '✓ ' + name;
      line.style.color = '#22c55e';
      out.appendChild(line);
      pass++;
    } catch (err) {
      const line = document.createElement('pre');
      line.textContent = '✗ ' + name + '\n  ' + err.message;
      line.style.color = '#ef4444';
      out.appendChild(line);
      fail++;
    }
  }
  const summary = document.createElement('div');
  summary.textContent = `${pass} passed, ${fail} failed`;
  summary.style.cssText = 'font-weight:bold; margin-top:16px';
  summary.style.color = fail === 0 ? '#22c55e' : '#ef4444';
  out.appendChild(summary);
}

export function createTestImage(width, height, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  drawFn(ctx);
  return ctx.getImageData(0, 0, width, height);
}
```

- [ ] **Step 2: Schreibe `tests/runner.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bouli Tests</title>
  <style>
    body { font-family: system-ui, monospace; padding: 16px; background: #111; color: #ddd; }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>Bouli Tests</h1>
  <div id="output"></div>
  <script type="module">
    import './ranker.test.js';
    import './detector.test.js';
    import { run } from './harness.js';
    run();
  </script>
</body>
</html>
```

- [ ] **Step 3: Verifiziere Syntax (Browser)**

Run: `python3 -m http.server 8765` und im Browser `http://localhost:8765/tests/runner.html`
Expected: Seite lädt, "0 passed, 0 failed" erscheint (Test-Dateien existieren noch nicht — Module-Import schlägt fehl). Das ist OK — wir füllen die Tests im nächsten Task. Vorerst kann der Import auskommentiert werden, falls die Browser-Fehlermeldung stört.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "chore: add minimal browser test harness"
```

---

## Task 3: Ranker-Modul (TDD)

**Files:**
- Create: `modules/ranker.js`
- Create: `tests/ranker.test.js`

- [ ] **Step 1: Schreibe failing tests**

`tests/ranker.test.js`:
```javascript
import { test, assertEqual } from './harness.js';
import { rank } from '../modules/ranker.js';

test('rank: empty input returns empty array', () => {
  assertEqual(rank([], 100, 100), []);
});

test('rank: single ball gets rank 1 and percent 100', () => {
  const r = rank([{ x: 50, y: 50, r: 10 }], 100, 100);
  assertEqual(r.length, 1);
  assertEqual(r[0].rank, 1);
  assertEqual(r[0].percent, 100);
});

test('rank: three balls sorted by distance ascending', () => {
  const balls = [
    { x: 200, y: 100, r: 10 },  // dist 100
    { x: 150, y: 100, r: 10 },  // dist 50
    { x: 300, y: 100, r: 10 },  // dist 200
  ];
  const r = rank(balls, 100, 100);
  assertEqual(r.map(b => b.rank), [1, 2, 3]);
  assertEqual(r.map(b => b.x), [150, 200, 300]);
});

test('rank: percent computed relative to nearest', () => {
  const balls = [
    { x: 200, y: 100, r: 10 },  // dist 100
    { x: 150, y: 100, r: 10 },  // dist 50
  ];
  const r = rank(balls, 100, 100);
  assertEqual(r[0].percent, 100);
  assertEqual(r[1].percent, 200);
});

test('rank: ball at exactly center does not divide by zero', () => {
  const r = rank([{ x: 100, y: 100, r: 10 }], 100, 100);
  assertEqual(r[0].percent, 100);
});

test('rank: preserves r property', () => {
  const r = rank([{ x: 50, y: 50, r: 17 }], 100, 100);
  assertEqual(r[0].r, 17);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Browser: `http://localhost:8765/tests/runner.html`
Expected: Alle 6 Tests rot — `rank is not a function` oder Modul-Fehler.

- [ ] **Step 3: Implementiere `modules/ranker.js`**

```javascript
export function rank(balls, cx, cy) {
  if (balls.length === 0) return [];

  const withDist = balls.map(b => ({
    x: b.x,
    y: b.y,
    r: b.r,
    distance: Math.hypot(b.x - cx, b.y - cy),
  }));

  withDist.sort((a, b) => a.distance - b.distance);

  const nearest = withDist[0].distance;
  return withDist.map((b, i) => ({
    x: b.x,
    y: b.y,
    r: b.r,
    rank: i + 1,
    percent: nearest > 0 ? Math.round((b.distance / nearest) * 100) : 100,
  }));
}
```

- [ ] **Step 4: Run tests, verify they pass**

Browser reload `runner.html`
Expected: 6 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add modules/ranker.js tests/ranker.test.js
git commit -m "feat: ranker module with full unit coverage"
```

---

## Task 4: Detector — Pixel-Helpers (TDD)

**Files:**
- Create: `modules/detector.js` (Helpers; top-level `detect` kommt in Task 6)
- Modify: `tests/detector.test.js`

- [ ] **Step 1: Schreibe failing tests für `toGrayscale`, `gaussianBlur`, `sobel`**

`tests/detector.test.js`:
```javascript
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
  // Inner pixel stays at 100
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
  // At x=2, y=2 (the boundary), there should be a strong edge
  if (out[2 * w + 2] < 100) {
    throw new Error('Expected strong edge at boundary, got ' + out[2 * w + 2]);
  }
});
```

- [ ] **Step 2: Run tests, verify they fail**

Browser reload. Expected: 6 new tests rot — `toGrayscale is not exported`.

- [ ] **Step 3: Implementiere die Helpers in `modules/detector.js`**

```javascript
export function toGrayscale(imageData) {
  const { data } = imageData;
  const gray = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return gray;
}

const BLUR_KERNEL = [1, 2, 1, 2, 4, 2, 1, 2, 1];
const BLUR_SUM = 16;

export function gaussianBlur(gray, w, h) {
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0, k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          s += gray[(y + ky) * w + (x + kx)] * BLUR_KERNEL[k++];
        }
      }
      out[y * w + x] = (s / BLUR_SUM) | 0;
    }
  }
  return out;
}

export function sobel(gray, w, h) {
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
         gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
         gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      out[i] = Math.min(255, Math.hypot(gx, gy) | 0);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Expected: alle Tests grün (Ranker + Detector-Helpers).

- [ ] **Step 5: Commit**

```bash
git add modules/detector.js tests/detector.test.js
git commit -m "feat: detector helpers (grayscale, blur, sobel) with tests"
```

---

## Task 5: Detector — Hough Circles + NMS (TDD)

**Files:**
- Modify: `modules/detector.js` (Hough + NMS hinzufügen)
- Modify: `tests/detector.test.js` (Hough/NMS-Tests hinzufügen)

- [ ] **Step 1: Schreibe failing tests am Ende von `tests/detector.test.js`**

```javascript
import { houghCircles, nonMaxSuppression } from '../modules/detector.js';

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
  // Expect at least one candidate near (40, 40) with r ≈ 15
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
    { x: 52, y: 51, r: 10, score: 40 },  // near, higher
    { x: 100, y: 100, r: 10, score: 25 },
  ];
  const out = nonMaxSuppression(cands, 10);
  assertEqual(out.length, 2);
  assertEqual(out[0].score, 40);
});

test('nonMaxSuppression: empty input returns empty', () => {
  assertEqual(nonMaxSuppression([], 10), []);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Browser reload. Expected: 3 neue Tests rot.

- [ ] **Step 3: Implementiere `houghCircles` + `nonMaxSuppression` in `modules/detector.js`**

Anhängen an `modules/detector.js`:
```javascript
const N_ANGLES = 60;

export function houghCircles(edges, w, h, rMin, rMax, edgeThreshold = 80) {
  const candidates = [];

  for (let r = rMin; r <= rMax; r++) {
    const acc = new Uint16Array(w * h);

    const dxs = new Int16Array(N_ANGLES);
    const dys = new Int16Array(N_ANGLES);
    for (let i = 0; i < N_ANGLES; i++) {
      const theta = (2 * Math.PI * i) / N_ANGLES;
      dxs[i] = Math.round(r * Math.cos(theta));
      dys[i] = Math.round(r * Math.sin(theta));
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (edges[y * w + x] < edgeThreshold) continue;
        for (let i = 0; i < N_ANGLES; i++) {
          const cx = x - dxs[i];
          const cy = y - dys[i];
          if (cx >= 0 && cx < w && cy >= 0 && cy < h) {
            acc[cy * w + cx]++;
          }
        }
      }
    }

    const accThreshold = Math.max((N_ANGLES * 0.5) | 0, 15);
    for (let y = r; y < h - r; y++) {
      for (let x = r; x < w - r; x++) {
        const score = acc[y * w + x];
        if (score < accThreshold) continue;
        candidates.push({ x, y, r, score });
      }
    }
  }

  return candidates;
}

export function nonMaxSuppression(candidates, minDistance) {
  if (candidates.length === 0) return [];
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const result = [];
  for (const c of sorted) {
    let suppressed = false;
    for (const k of result) {
      if (Math.hypot(c.x - k.x, c.y - k.y) < minDistance) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) result.push(c);
  }
  return result;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Expected: alle Tests grün. Hough-Test kann auf langsamen Geräten 1-2 s dauern — das ist ok.

- [ ] **Step 5: Commit**

```bash
git add modules/detector.js tests/detector.test.js
git commit -m "feat: detector hough-circle transform and non-max suppression"
```

---

## Task 6: Detector — Top-Level `detect()` Integration

**Files:**
- Modify: `modules/detector.js` (top-level Funktion)
- Modify: `tests/detector.test.js` (Integration-Test)

- [ ] **Step 1: Schreibe failing integration test**

Am Ende von `tests/detector.test.js` anhängen:
```javascript
import { detect } from '../modules/detector.js';

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
```

- [ ] **Step 2: Run test, verify fail**

Expected: `detect is not exported`.

- [ ] **Step 3: Implementiere `detect` in `modules/detector.js`**

Anhängen:
```javascript
export function detect(imageData, options = {}) {
  const { width: w, height: h } = imageData;
  const rMin = options.rMin ?? 15;
  const rMax = options.rMax ?? 50;
  const edgeThreshold = options.edgeThreshold ?? 80;

  const gray = toGrayscale(imageData);
  const blurred = gaussianBlur(gray, w, h);
  const edges = sobel(blurred, w, h);
  const candidates = houghCircles(edges, w, h, rMin, rMax, edgeThreshold);
  const filtered = nonMaxSuppression(candidates, rMin);

  return filtered.map(c => ({ x: c.x, y: c.y, r: c.r }));
}
```

- [ ] **Step 4: Run test, verify pass**

Expected: alle Tests grün.

- [ ] **Step 5: Commit**

```bash
git add modules/detector.js tests/detector.test.js
git commit -m "feat: detector top-level pipeline integration"
```

---

## Task 7: Renderer-Modul

**Files:**
- Create: `modules/renderer.js`

Renderer-Code ist Canvas-Drawing — kein sinnvoller Unit-Test ohne komplexes Pixel-Probing. Smoke-Test via Console-Log, visuelle Validierung später beim Manual Test.

- [ ] **Step 1: Schreibe `modules/renderer.js`**

```javascript
const COLORS = {
  nearest: '#22c55e',
  other: '#e5e7eb',
  crosshair: 'rgba(255,255,255,0.95)',
  labelBg: 'rgba(0,0,0,0.65)',
};

export function render(ctx, rankedBalls, cx, cy) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);

  drawCrosshair(ctx, cx, cy);

  for (const ball of rankedBalls) {
    const isNearest = ball.rank === 1;
    const color = isNearest ? COLORS.nearest : COLORS.other;
    const lineWidth = isNearest ? 3 : 1.5;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ball.x, ball.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r + 2, 0, Math.PI * 2);
    ctx.stroke();

    const label = rankedBalls.length > 1
      ? `${ball.rank} · ${ball.percent}%`
      : `${ball.rank}`;
    drawLabel(ctx, label, ball.x + ball.r + 8, ball.y, color);
  }
}

function drawCrosshair(ctx, cx, cy) {
  const size = 18;
  ctx.save();
  ctx.strokeStyle = COLORS.crosshair;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(cx - size, cy);
  ctx.lineTo(cx + size, cy);
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx, cy + size);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLabel(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  const metrics = ctx.measureText(text);
  const pad = 5;
  const lineHeight = 20;

  ctx.fillStyle = COLORS.labelBg;
  ctx.fillRect(x, y - lineHeight / 2, metrics.width + 2 * pad, lineHeight);

  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + pad, y);
  ctx.restore();
}
```

- [ ] **Step 2: Smoke-Test im Browser-Runner**

Optional: füge in `tests/runner.html` eine Test-Section hinzu, die `render` mit Dummy-Daten aufruft und prüft, dass keine Exception fliegt. Oder Skip — Manual Test reicht.

Wir skippen den expliziten Test und verlassen uns auf Manual Test in Task 14.

- [ ] **Step 3: Commit**

```bash
git add modules/renderer.js
git commit -m "feat: renderer module for AR overlay"
```

---

## Task 8: Camera-Modul

**Files:**
- Create: `modules/camera.js`

- [ ] **Step 1: Schreibe `modules/camera.js`**

```javascript
let stream = null;
let videoEl = null;
let detectionCanvas = null;
let detectionCtx = null;

export async function start(video, detectionWidth = 480, detectionHeight = 640) {
  videoEl = video;
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = reject;
  });
  await video.play();

  detectionCanvas = document.createElement('canvas');
  detectionCanvas.width = detectionWidth;
  detectionCanvas.height = detectionHeight;
  detectionCtx = detectionCanvas.getContext('2d', { willReadFrequently: true });
}

export function stop() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  videoEl = null;
  detectionCanvas = null;
  detectionCtx = null;
}

export function grabFrame() {
  if (!videoEl || !detectionCanvas || videoEl.readyState < 2) return null;
  detectionCtx.drawImage(
    videoEl,
    0, 0, detectionCanvas.width, detectionCanvas.height
  );
  return detectionCtx.getImageData(0, 0, detectionCanvas.width, detectionCanvas.height);
}

export function getDetectionSize() {
  return detectionCanvas
    ? { width: detectionCanvas.width, height: detectionCanvas.height }
    : null;
}
```

- [ ] **Step 2: Commit**

Camera wird im Manual-Test (Task 14) verifiziert.

```bash
git add modules/camera.js
git commit -m "feat: camera module wrapping getUserMedia with detection-sized frame grab"
```

---

## Task 9: Wasserwaage / Level-Modul (TDD für pure part)

**Files:**
- Create: `modules/level.js`
- Modify: `tests/runner.html` und ggf. neuer Test-File

- [ ] **Step 1: Schreibe failing tests für `computeTilt`**

Neue Datei `tests/level.test.js`:
```javascript
import { test, assertClose } from './harness.js';
import { computeTilt } from '../modules/level.js';

test('computeTilt: flat (beta=0, gamma=0) gives tilt 0', () => {
  const t = computeTilt({ beta: 0, gamma: 0 });
  assertClose(t.tilt, 0, 0.001);
});

test('computeTilt: 10° forward tilt gives tilt 10', () => {
  const t = computeTilt({ beta: 10, gamma: 0 });
  assertClose(t.tilt, 10, 0.001);
});

test('computeTilt: combined beta and gamma uses hypot', () => {
  const t = computeTilt({ beta: 3, gamma: 4 });
  assertClose(t.tilt, 5, 0.001);
});

test('computeTilt: missing fields default to 0', () => {
  const t = computeTilt({});
  assertClose(t.tilt, 0, 0.001);
});
```

Füge `import './level.test.js';` in `tests/runner.html` ein.

- [ ] **Step 2: Run tests, verify they fail**

Browser reload. Expected: 4 neue Tests rot.

- [ ] **Step 3: Implementiere `modules/level.js`**

```javascript
let handler = null;

export function computeTilt(event) {
  const beta = event.beta ?? 0;
  const gamma = event.gamma ?? 0;
  const tilt = Math.hypot(beta, gamma);
  return { beta, gamma, tilt };
}

export async function start(onUpdate) {
  if (typeof DeviceOrientationEvent === 'undefined') {
    return false;
  }

  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') return false;
    } catch {
      return false;
    }
  }

  handler = (event) => onUpdate(computeTilt(event));
  window.addEventListener('deviceorientation', handler);
  return true;
}

export function stop() {
  if (handler) {
    window.removeEventListener('deviceorientation', handler);
    handler = null;
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Expected: alle grün.

- [ ] **Step 5: Commit**

```bash
git add modules/level.js tests/level.test.js tests/runner.html
git commit -m "feat: level module with computeTilt unit tested"
```

---

## Task 10: PWA-Modul

**Files:**
- Create: `modules/pwa.js`

- [ ] **Step 1: Schreibe `modules/pwa.js`**

```javascript
let deferredPrompt = null;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(err =>
    console.warn('SW registration failed', err)
  );
}

export function setupInstallPrompt(button) {
  if (!button) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    button.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    button.hidden = true;
  });

  button.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    button.hidden = true;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/pwa.js
git commit -m "feat: pwa module for service worker registration and install prompt"
```

---

## Task 11: HTML-Skelett & CSS

**Files:**
- Create: `index.html`
- Create: `styles.css`

- [ ] **Step 1: Schreibe `index.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#0b0f14">
  <title>Bouli – Live AR</title>
  <link rel="manifest" href="manifest.json">
  <link rel="icon" href="icons/icon-192.png">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <header>
      <span class="logo">Bouli</span>
      <button id="install-btn" hidden>Installieren</button>
    </header>

    <div id="viewport">
      <video id="camera" playsinline muted autoplay></video>
      <canvas id="overlay"></canvas>

      <div id="level-indicator">
        <div id="level-bubble"></div>
      </div>

      <div id="level-warning" hidden>Halt waagerecht!</div>
    </div>

    <div id="permission-screen">
      <h1>Bouli</h1>
      <p>Live-AR-App für Boule-Abstände.<br>Halt das Smartphone waagerecht über das Schweinchen.</p>
      <button id="start-btn">Kamera starten</button>
      <p id="permission-error" hidden></p>
    </div>
  </div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Schreibe `styles.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: #0b0f14;
  color: #fff;
  font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
}

#app { position: relative; width: 100%; height: 100%; }

header {
  position: absolute;
  top: 0; left: 0; right: 0;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  background: linear-gradient(to bottom, rgba(0,0,0,0.5), transparent);
}

.logo { font-weight: 700; font-size: 18px; letter-spacing: 0.5px; }

button {
  background: #22c55e;
  border: none;
  color: #0b0f14;
  font-weight: 600;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 15px;
  cursor: pointer;
}

button:active { transform: scale(0.97); }

#viewport { position: absolute; inset: 0; overflow: hidden; }

#camera, #overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

#overlay { pointer-events: none; }

#level-indicator {
  position: absolute;
  bottom: max(30px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  width: 70px;
  height: 70px;
  border: 2px solid rgba(255,255,255,0.4);
  border-radius: 50%;
  z-index: 5;
  background: rgba(0,0,0,0.3);
}

#level-bubble {
  position: absolute;
  width: 22px;
  height: 22px;
  background: #22c55e;
  border-radius: 50%;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  transition: background 0.2s, transform 0.05s linear;
  box-shadow: 0 0 12px rgba(0,0,0,0.4);
}

#level-bubble.warn { background: #facc15; }
#level-bubble.error { background: #ef4444; }

#level-warning {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(239,68,68,0.92);
  padding: 14px 22px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 16px;
  z-index: 8;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}

#permission-screen {
  position: absolute;
  inset: 0;
  background: #0b0f14;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 20px;
  padding: 24px;
  z-index: 100;
  text-align: center;
}

#permission-screen.hidden { display: none; }
#permission-screen h1 { font-size: 40px; font-weight: 700; }
#permission-screen p { font-size: 16px; line-height: 1.5; opacity: 0.85; max-width: 320px; }
#permission-error { color: #fca5a5; font-size: 14px; }
```

- [ ] **Step 3: Commit**

```bash
git add index.html styles.css
git commit -m "feat: html skeleton and styles for live-ar UI"
```

---

## Task 12: App.js Orchestration

**Files:**
- Create: `app.js`

- [ ] **Step 1: Schreibe `app.js`**

```javascript
import * as Camera from './modules/camera.js';
import * as Detector from './modules/detector.js';
import * as Ranker from './modules/ranker.js';
import * as Renderer from './modules/renderer.js';
import * as Level from './modules/level.js';
import * as PWA from './modules/pwa.js';

const DETECTION_W = 480;
const DETECTION_H = 640;
const DETECTION_INTERVAL_MS = 120;
const TILT_WARN_DEG = 5;
const TILT_ERROR_DEG = 10;
const DETECT_OPTIONS = { rMin: 18, rMax: 55, edgeThreshold: 70 };

let lastBalls = [];
let lastDetectAt = 0;
let overlayEl = null;
let overlayCtx = null;
let running = false;

function resizeOverlay() {
  if (!overlayEl) return;
  overlayEl.width = overlayEl.clientWidth;
  overlayEl.height = overlayEl.clientHeight;
  overlayCtx = overlayEl.getContext('2d');
}

function loop(timestamp) {
  if (!running) return;

  if (timestamp - lastDetectAt > DETECTION_INTERVAL_MS) {
    lastDetectAt = timestamp;
    const frame = Camera.grabFrame();
    if (frame) {
      const balls = Detector.detect(frame, DETECT_OPTIONS);
      const sx = overlayEl.width / frame.width;
      const sy = overlayEl.height / frame.height;
      const s = Math.min(sx, sy);
      const scaled = balls.map(b => ({
        x: b.x * sx,
        y: b.y * sy,
        r: b.r * s,
      }));
      const cx = overlayEl.width / 2;
      const cy = overlayEl.height / 2;
      lastBalls = Ranker.rank(scaled, cx, cy);
    }
  }

  if (overlayCtx) {
    Renderer.render(overlayCtx, lastBalls, overlayEl.width / 2, overlayEl.height / 2);
  }

  requestAnimationFrame(loop);
}

function updateLevel({ tilt }) {
  const bubble = document.getElementById('level-bubble');
  const warning = document.getElementById('level-warning');
  if (!bubble) return;

  const maxOffset = 24;
  const offsetMagnitude = Math.min(tilt / TILT_ERROR_DEG, 1) * maxOffset;
  bubble.style.transform = `translate(calc(-50% + ${offsetMagnitude}px), -50%)`;

  if (tilt > TILT_ERROR_DEG) {
    bubble.className = 'error';
    warning.hidden = false;
  } else if (tilt > TILT_WARN_DEG) {
    bubble.className = 'warn';
    warning.hidden = true;
  } else {
    bubble.className = '';
    warning.hidden = true;
  }
}

async function start() {
  const video = document.getElementById('camera');
  overlayEl = document.getElementById('overlay');
  const permScreen = document.getElementById('permission-screen');
  const errEl = document.getElementById('permission-error');

  try {
    await Camera.start(video, DETECTION_W, DETECTION_H);
  } catch (err) {
    errEl.textContent = 'Kamera-Zugriff verweigert: ' + (err.message ?? err);
    errEl.hidden = false;
    return;
  }

  permScreen.classList.add('hidden');
  resizeOverlay();
  window.addEventListener('resize', resizeOverlay);

  await Level.start(updateLevel);

  running = true;
  requestAnimationFrame(loop);
}

PWA.registerServiceWorker();
PWA.setupInstallPrompt(document.getElementById('install-btn'));
document.getElementById('start-btn').addEventListener('click', start);
```

- [ ] **Step 2: Commit**

```bash
git add app.js
git commit -m "feat: app.js orchestrates camera, detector, ranker, renderer in frame loop"
```

---

## Task 13: Service Worker & Manifest Update

**Files:**
- Modify: `sw.js`
- Modify: `manifest.json`

- [ ] **Step 1: Schreibe `sw.js`**

Ersetze den gesamten Inhalt:
```javascript
const CACHE = 'bouli-live-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './modules/camera.js',
  './modules/detector.js',
  './modules/ranker.js',
  './modules/renderer.js',
  './modules/level.js',
  './modules/pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
```

- [ ] **Step 2: Aktualisiere `manifest.json`**

```json
{
  "name": "Bouli – Live AR",
  "short_name": "Bouli",
  "description": "Live-AR-App zur Boule-Abstandsmessung – richte die Kamera über das Schweinchen und sieh sofort, welche Kugel am nächsten ist.",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b0f14",
  "theme_color": "#0b0f14",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 3: Verifiziere Icon-Pfade**

Run: `ls icons/`
Expected: mindestens `icon-192.png` und `icon-512.png` sind vorhanden.

- [ ] **Step 4: Commit**

```bash
git add sw.js manifest.json
git commit -m "feat: update service worker cache list and manifest for live-ar"
```

---

## Task 14: Manual Browser Test

**Files:** keine; nur manuelle Verifikation.

- [ ] **Step 1: Starte den lokalen Server**

```bash
python3 -m http.server 8765
```

- [ ] **Step 2: Browser-Tests öffnen und alle Unit-Tests grün prüfen**

Öffne `http://localhost:8765/tests/runner.html`
Expected: Alle Tests grün — Ranker (6), Detector-Helpers (6), Detector-Hough/NMS (3), Detector-Integration (1), Level (4) = **20 Tests pass**.

- [ ] **Step 3: App auf dem Desktop öffnen (Smoke Test)**

Öffne `http://localhost:8765/index.html` im Chrome Desktop.
- Permission-Screen erscheint.
- Klick "Kamera starten" → Browser fragt Permission.
- Permission erteilt → Live-Stream der Webcam wird sichtbar.
- Fadenkreuz im Center sichtbar.
- Bei sichtbarem dunklen runden Objekt vor der Kamera (z.B. dunkler Kreis auf Bildschirm), erscheint mindestens manchmal ein Marker.

Expected: kein JS-Error in der Browser-Konsole. UI vollständig sichtbar.

- [ ] **Step 4: App auf Smartphone testen (Real-World Test)**

Auf dem Smartphone öffnen (gleiches lokales Netzwerk, IP statt localhost — oder via HTTPS-Tunnel z.B. `ngrok`).
- Permission-Flow funktioniert.
- Rückkamera startet.
- Bei Boule-Kugeln auf Boden vor der Kamera: Marker erscheinen, Ranking ist plausibel, nächste Kugel ist grün hervorgehoben.
- Wasserwaage-Bubble bewegt sich beim Neigen, wird rot bei deutlicher Schräglage.
- Service Worker registriert (DevTools Application Tab).
- PWA-Install-Button erscheint (auf Chrome Mobile).

Expected: kein Crash, App reagiert flüssig (>15 fps). Falls Detection zu langsam: `DETECTION_INTERVAL_MS` in `app.js` erhöhen oder `DETECTION_W/H` reduzieren.

- [ ] **Step 5: Falls Performance schlecht: Tuning-Iterationen**

Mögliche Stellschrauben (nicht jetzt umsetzen, nur notieren):
- `DETECTION_INTERVAL_MS` → höher = langsamere Updates, weniger CPU.
- `DETECTION_W/H` → kleiner = weniger Pixel zu verarbeiten.
- `N_ANGLES` in `detector.js` → weniger Samples = schneller, aber ungenauer.
- `DETECT_OPTIONS.rMin/rMax` → engerer Bereich = schneller.
- Web Worker für Detection (siehe Spec, "Phase 2").

Dokumentiere im Commit-Body, falls Werte angepasst wurden.

- [ ] **Step 6: Update README**

`README.md` an neue App anpassen — alten Foto-Workflow streichen, Live-AR-Workflow beschreiben.

```markdown
# Bouli — Live-AR Boule-Abstandsmessung

PWA, die per Live-Kamera Boule-Kugeln erkennt und in Echtzeit nach Abstand zum Schweinchen sortiert.

## Bedienung

1. App öffnen, Kamera erlauben.
2. Smartphone waagerecht über das Schweinchen halten — Bubble-Wasserwaage zeigt, wie gerade.
3. Center der Kamera = Schweinchen-Position. Markierte Kugeln werden nach Pixel-Abstand sortiert. Grün = am nächsten.

## Architektur

- `app.js` — Frame-Loop und Verkabelung.
- `modules/camera.js` — Kamera-Stream.
- `modules/detector.js` — Hough Circle Transform.
- `modules/ranker.js` — Sortierung + Prozente.
- `modules/renderer.js` — AR-Overlay-Zeichnung.
- `modules/level.js` — Wasserwaage.
- `modules/pwa.js` — Service Worker + Install.

## Lokal entwickeln

```bash
python3 -m http.server 8765
# App: http://localhost:8765
# Tests: http://localhost:8765/tests/runner.html
```

Smartphone-Test braucht HTTPS — z.B. `ngrok http 8765` oder ein Self-Signed-Cert.
```

- [ ] **Step 7: Final Commit**

```bash
git add README.md
git commit -m "docs: update README for live-ar workflow"
```

---

## Self-Review Checkliste

(Vom Plan-Autor durchlaufen — Inline-Fixes statt Re-Review.)

- [x] **Spec Coverage:**
  - Live-Kamera → Task 8 (camera.js), Task 11 (HTML video element)
  - AR-Overlay → Task 7 (renderer), Task 11 (overlay canvas)
  - Center = Schweinchen → Renderer zeichnet Fadenkreuz; app.js übergibt `overlay.width/2`
  - Vollautomatische Kugel-Erkennung → Task 4-6 (detector pipeline)
  - Linien + Ranking + Prozent + Hervorhebung → Renderer (Task 7)
  - Wasserwaage → Task 9 (level.js)
  - PWA bleibt → Task 10 (pwa.js), Task 13 (sw.js, manifest)
  - Offline-Cache → sw.js cached alle Assets
  - Top-Down-Annahme → Wasserwaage + Spec dokumentieren
  - Pure-Function-Module → Ranker und Detector-Helpers sind pure und TDD-getestet

- [x] **Placeholder Scan:** Keine TBD/TODO/"implement appropriately"-Phrasen. Alle Code-Blöcke vollständig.

- [x] **Type Consistency:**
  - `Ball`-Shape: `{ x, y, r }` aus Detector; Ranker fügt `rank, percent, distance` hinzu. Konsistent.
  - `detect(imageData, options)` mit Optionen `{ rMin, rMax, edgeThreshold }` — überall gleich.
  - `Level.start(callback)` vs `Level.computeTilt(event)` — Callback-Argument ist `{ beta, gamma, tilt }`, in `updateLevel` korrekt destructured.
  - Render-API: `render(ctx, balls, cx, cy)` — in app.js so aufgerufen.

- [x] **Scope Check:** Single PWA-Neuschrift, ein zusammenhängender Implementation-Plan. Keine unabhängigen Subsysteme.
