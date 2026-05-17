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
