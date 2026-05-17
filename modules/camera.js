let stream = null;
let videoEl = null;
let detectionCanvas = null;
let detectionCtx = null;

export async function start(video, detectionMaxDim = 480) {
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
  if (video.readyState < 1) {
    await new Promise((resolve, reject) => {
      const onMeta = () => { video.removeEventListener('loadedmetadata', onMeta); resolve(); };
      const onErr = (e) => { video.removeEventListener('error', onErr); reject(e); };
      video.addEventListener('loadedmetadata', onMeta);
      video.addEventListener('error', onErr);
    });
  }
  await video.play();

  // Detection canvas matches video aspect ratio (avoids non-uniform stretching
  // that would turn circles into ellipses and break Hough detection).
  const vw = video.videoWidth || 1920;
  const vh = video.videoHeight || 1080;
  const longest = Math.max(vw, vh);
  const scale = detectionMaxDim / longest;
  detectionCanvas = document.createElement('canvas');
  detectionCanvas.width = Math.round(vw * scale);
  detectionCanvas.height = Math.round(vh * scale);
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
