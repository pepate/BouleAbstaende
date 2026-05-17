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
