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
