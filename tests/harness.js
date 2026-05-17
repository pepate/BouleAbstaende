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
