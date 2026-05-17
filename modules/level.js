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
