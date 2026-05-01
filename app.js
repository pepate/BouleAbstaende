'use strict';

const STATE = {
  IDLE: 'IDLE',
  STEP_STICK: 'STEP_STICK',
  STEP_LENGTH: 'STEP_LENGTH',
  STEP_JACK: 'STEP_JACK',
  STEP_BOULES: 'STEP_BOULES',
  STEP_DONE: 'STEP_DONE',
};

const HIT_RADIUS = 40;
const SNAP_RADIUS = 80;
const TAP_THRESHOLD = 8;
const LONG_PRESS_MS = 350;
const STICK_LENGTH_KEY = 'bouli.stickLength';
const STICK_LENGTH_SEEN_KEY = 'bouli.stickLengthSeen';
const HISTORY_DB = 'bouli';
const HISTORY_STORE = 'history';
const HISTORY_LIMIT = 20;

class BouliApp {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvasWrap = document.getElementById('canvas-wrap');
    this.placeholder = document.getElementById('placeholder');
    this.stepBadge = document.getElementById('step-badge');
    this.calChip = document.getElementById('cal-chip');
    this.calChipValue = document.getElementById('cal-chip-value');
    this.toolbar = document.getElementById('toolbar');
    this.toolbarContent = document.getElementById('toolbar-content');
    this.resultsBar = document.getElementById('results-bar');
    this.fileInput = document.getElementById('file-input');
    this.toast = document.getElementById('toast');
    this.lengthModal = document.getElementById('length-modal');
    this.lengthInput = document.getElementById('length-input');
    this.historyModal = document.getElementById('history-modal');
    this.historyGrid = document.getElementById('history-grid');

    this.imageCanvas = document.createElement('canvas');
    this.imageCtx = this.imageCanvas.getContext('2d', { willReadFrequently: true });
    this.imageData = null;

    this.state = STATE.IDLE;
    this.image = null;
    this.imageDataUrl = null;
    this.imageScale = 1;

    const savedLength = parseFloat(localStorage.getItem(STICK_LENGTH_KEY));
    this.calibration = {
      p1: null, p2: null,
      lengthCm: isFinite(savedLength) && savedLength > 0 ? savedLength : 100,
      pxPerCm: 0,
    };
    this.lengthHasBeenSet = localStorage.getItem(STICK_LENGTH_SEEN_KEY) === '1';

    this.jack = null;
    this.boules = [];
    this.dragging = null;
    this.cameraStream = null;
    this.currentHistoryId = null;
    this.fineTune = null;
    this.longPressTimer = null;
    this.pendingTap = null;

    this.bindEvents();
    this.updateUI();

    // Try auto-opening camera on first load (best effort)
    this.tryAutoOpenCamera();
  }

  bindEvents() {
    document.getElementById('btn-upload').addEventListener('click', () => this.fileInput.click());
    document.getElementById('btn-camera').addEventListener('click', () => this.openCamera());
    document.getElementById('btn-reset').addEventListener('click', () => this.reset());
    document.getElementById('btn-history').addEventListener('click', () => this.openHistory());
    this.fileInput.addEventListener('change', (e) => this.handleFile(e));

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.calChip.addEventListener('click', () => this.openLengthModal());

    document.getElementById('length-save').addEventListener('click', () => this.saveLengthModal());
    this.lengthInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.saveLengthModal();
      if (e.key === 'Escape') this.closeLengthModal();
    });
    this.lengthModal.addEventListener('click', (e) => {
      if (e.target.dataset.close === '1') this.closeLengthModal();
    });
    this.lengthModal.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = parseFloat(btn.dataset.cm);
        this.lengthInput.value = v;
        this.lengthModal.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    if (this.historyModal) {
      this.historyModal.addEventListener('click', (e) => {
        if (e.target.dataset.close === '1') this.closeHistory();
      });
    }

    document.getElementById('camera-cancel').addEventListener('click', () => this.closeCamera());
    document.getElementById('shutter').addEventListener('click', () => this.takePhoto());
    document.getElementById('camera-flip').addEventListener('click', () => this.flipCamera());

    window.addEventListener('resize', () => this.fitCanvas());
    window.addEventListener('orientationchange', () => setTimeout(() => this.fitCanvas(), 100));
  }

  async tryAutoOpenCamera() {
    if (this.image) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    // Tiny delay so initial UI paints first
    await new Promise(r => setTimeout(r, 200));
    if (this.image) return;
    try {
      await this.openCamera({ silent: true });
    } catch (_) {}
  }

  reset() {
    this.state = STATE.IDLE;
    this.image = null;
    this.imageData = null;
    this.imageDataUrl = null;
    this.calibration.p1 = null;
    this.calibration.p2 = null;
    this.calibration.pxPerCm = 0;
    this.jack = null;
    this.boules = [];
    this.dragging = null;
    this.currentHistoryId = null;
    this.fileInput.value = '';
    this.updateUI();
  }

  handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => this.loadImage(ev.target.result);
    reader.readAsDataURL(file);
  }

  loadImage(src, restore = null) {
    const img = new Image();
    img.onload = () => {
      this.image = img;
      this.imageDataUrl = src;
      this.canvas.width = img.naturalWidth;
      this.canvas.height = img.naturalHeight;
      this.imageCanvas.width = img.naturalWidth;
      this.imageCanvas.height = img.naturalHeight;
      this.imageCtx.drawImage(img, 0, 0);
      try {
        this.imageData = this.imageCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
      } catch (err) {
        this.imageData = null;
      }
      this.calibration.p1 = null;
      this.calibration.p2 = null;
      this.calibration.pxPerCm = 0;
      this.jack = null;
      this.boules = [];

      if (restore) {
        if (restore.calibration) Object.assign(this.calibration, restore.calibration);
        if (restore.jack) this.jack = { ...restore.jack };
        if (restore.boules) this.boules = restore.boules.map(b => ({ ...b }));
        this.recalcCalibration();
        this.state = STATE.STEP_DONE;
        this.currentHistoryId = restore.id || null;
      } else {
        const detected = this.autoDetect();
        this.state = STATE.STEP_STICK;
        if (detected.length) this.showToast(`Auto-erkannt: ${detected.join(', ')}`);
      }
      this.fitCanvas();
      this.updateUI();
    };
    img.src = src;
  }

  fitCanvas() {
    if (!this.image) return;
    const headerH = document.querySelector('header').offsetHeight;
    const toolbarH = this.toolbar.classList.contains('empty') ? 0 : this.toolbar.offsetHeight;
    const resultsH = this.resultsBar.classList.contains('hidden') ? 0 : this.resultsBar.offsetHeight;
    const maxW = window.innerWidth - 8;
    const maxH = window.innerHeight - headerH - toolbarH - resultsH - 8;
    const scale = Math.min(
      maxW / this.image.naturalWidth,
      maxH / this.image.naturalHeight,
      1
    );
    this.imageScale = scale;
    this.canvas.style.width = (this.image.naturalWidth * scale) + 'px';
    this.canvas.style.height = (this.image.naturalHeight * scale) + 'px';
    this.render();
  }

  showToast(msg, duration = 2400) {
    if (!this.toast) return;
    this.toast.textContent = msg;
    this.toast.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('visible'), duration);
  }

  // ---------- Pointer handling ----------

  getCanvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    return { x, y };
  }

  hitTest(point) {
    const r = HIT_RADIUS / this.imageScale;
    if (this.calibration.p1 && dist(point, this.calibration.p1) < r) return { type: 'cal', which: 'p1' };
    if (this.calibration.p2 && dist(point, this.calibration.p2) < r) return { type: 'cal', which: 'p2' };
    if (this.jack && dist(point, this.jack) < r) return { type: 'jack' };
    for (let i = 0; i < this.boules.length; i++) {
      if (dist(point, this.boules[i]) < r) return { type: 'boule', index: i };
    }
    if (this.calibration.p1 && this.calibration.p2) {
      const lineR = (HIT_RADIUS * 0.6) / this.imageScale;
      if (distToSegment(point, this.calibration.p1, this.calibration.p2) < lineR) {
        return { type: 'cal-line' };
      }
    }
    return null;
  }

  onPointerDown(e) {
    if (!this.image) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.getCanvasPoint(e);
    const hit = this.hitTest(p);

    if (hit) {
      if (hit.type === 'cal-line') {
        this.dragging = null;
        this.openLengthModal();
        return;
      }
      this.dragging = { ...hit, justClicked: true, downAt: p };
      return;
    }

    // No hit — could be a tap-to-place OR a long-press for fine-tune of last marker
    const lastMarker = this.getLastMarker();
    if (lastMarker && (this.state === STATE.STEP_JACK || this.state === STATE.STEP_BOULES || this.state === STATE.STEP_DONE)) {
      // Schedule potential long-press; if user holds, enter fine-tune mode
      this.pendingTap = {
        point: p,
        screen: { x: e.clientX, y: e.clientY },
        pointerId: e.pointerId,
        state: this.state,
      };
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        if (this.pendingTap && this.pendingTap.pointerId === e.pointerId) {
          this.startFineTune(this.pendingTap.point, this.pendingTap.screen, lastMarker);
          this.pendingTap = null;
        }
      }, LONG_PRESS_MS);
      return;
    }

    // No marker to fine-tune (or wrong state) — place immediately
    this.placeAt(p);
  }

  placeAt(p) {
    switch (this.state) {
      case STATE.STEP_STICK:
        if (!this.calibration.p1) {
          this.calibration.p1 = p;
        } else if (!this.calibration.p2) {
          this.calibration.p2 = p;
          this.recalcCalibration();
        }
        break;
      case STATE.STEP_JACK:
        this.jack = this.snapToCenter(p, 'jack');
        break;
      case STATE.STEP_BOULES:
      case STATE.STEP_DONE:
        this.boules.push(this.snapToCenter(p, 'boule'));
        break;
    }
    this.updateUI();
  }

  getLastMarker() {
    if (this.state === STATE.STEP_JACK) {
      return this.jack ? { type: 'jack' } : null;
    }
    if (this.boules.length > 0) return { type: 'boule', index: this.boules.length - 1 };
    if (this.jack) return { type: 'jack' };
    return null;
  }

  startFineTune(imgPoint, screenPoint, target) {
    const startMarker = target.type === 'jack' ? this.jack : this.boules[target.index];
    if (!startMarker) return;
    this.fineTune = {
      type: target.type,
      index: target.index,
      startMarker: { ...startMarker },
      startScreen: screenPoint,
      fingerImg: imgPoint,
    };
    if (navigator.vibrate) navigator.vibrate(15);
    this.showToast('Feinjustierung — bewegen, dann loslassen', 1600);
    this.render();
  }

  updateFineTune(clientX, clientY) {
    const ft = this.fineTune;
    if (!ft) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const dxImg = (clientX - ft.startScreen.x) * scaleX;
    const dyImg = (clientY - ft.startScreen.y) * scaleY;
    const newPos = { x: ft.startMarker.x + dxImg, y: ft.startMarker.y + dyImg };
    if (ft.type === 'jack') this.jack = newPos;
    else this.boules[ft.index] = newPos;
    ft.fingerImg = {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
    this.render();
    this.updateResults();
  }

  endFineTune() {
    this.fineTune = null;
    this.render();
    this.updateResults();
  }

  cancelPendingTap() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.pendingTap = null;
  }

  onPointerMove(e) {
    if (!this.image) return;

    // Cancel pending long-press if movement exceeds threshold
    if (this.longPressTimer && this.pendingTap) {
      const dx = e.clientX - this.pendingTap.screen.x;
      const dy = e.clientY - this.pendingTap.screen.y;
      if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
        this.cancelPendingTap();
      }
    }

    if (this.fineTune) {
      e.preventDefault();
      this.updateFineTune(e.clientX, e.clientY);
      return;
    }

    if (!this.dragging) return;
    e.preventDefault();
    const p = this.getCanvasPoint(e);
    if (this.dragging.justClicked) {
      const moved = dist(p, this.dragging.downAt);
      const threshold = TAP_THRESHOLD / this.imageScale;
      if (moved < threshold) return;
      this.dragging.justClicked = false;
    }
    if (this.dragging.type === 'cal') {
      this.calibration[this.dragging.which] = p;
      this.recalcCalibration();
    } else if (this.dragging.type === 'jack') {
      this.jack = p;
    } else if (this.dragging.type === 'boule') {
      this.boules[this.dragging.index] = p;
    }
    this.render();
    this.updateResults();
  }

  onPointerUp(e) {
    // Long-press tap that didn't trigger fine-tune → place at original point
    if (this.longPressTimer && this.pendingTap && this.pendingTap.pointerId === e.pointerId) {
      this.cancelPendingTap();
      const p = this.getCanvasPoint(e);
      this.placeAt(p);
      return;
    }
    this.pendingTap = null;

    if (this.fineTune) {
      this.endFineTune();
      return;
    }

    if (!this.dragging) return;
    const d = this.dragging;
    this.dragging = null;

    if (d.justClicked) {
      if (d.type === 'jack') {
        this.jack = null;
      } else if (d.type === 'boule') {
        this.boules.splice(d.index, 1);
      } else if (d.type === 'cal') {
        this.calibration[d.which] = null;
        if (this.calibration.p1 && this.calibration.p2) this.recalcCalibration();
        else this.calibration.pxPerCm = 0;
      }
      this.updateUI();
      return;
    }

    if (d.type === 'jack' && this.jack) {
      this.jack = this.snapToCenter(this.jack, 'jack');
    } else if (d.type === 'boule' && this.boules[d.index]) {
      this.boules[d.index] = this.snapToCenter(this.boules[d.index], 'boule');
    }
    this.render();
    this.updateResults();
  }

  // ---------- Snap to center ----------

  snapToCenter(p, type) {
    if (!this.imageData) return p;
    const { width: w, height: h, data } = this.imageData;
    const cx0 = Math.round(p.x);
    const cy0 = Math.round(p.y);

    let sumX = 0, sumY = 0, sumW = 0, count = 0;
    for (let dy = -SNAP_RADIUS; dy <= SNAP_RADIUS; dy++) {
      for (let dx = -SNAP_RADIUS; dx <= SNAP_RADIUS; dx++) {
        if (dx * dx + dy * dy > SNAP_RADIUS * SNAP_RADIUS) continue;
        const x = cx0 + dx, y = cy0 + dy;
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const i = (y * w + x) * 4;
        const wgt = type === 'jack' ? jackWeight(data[i], data[i+1], data[i+2]) : bouleWeight(data[i], data[i+1], data[i+2]);
        if (wgt > 0) {
          sumX += x * wgt;
          sumY += y * wgt;
          sumW += wgt;
          count++;
        }
      }
    }
    if (count < 30 || sumW < 200) return p;
    const cx = sumX / sumW, cy = sumY / sumW;
    if (dist({ x: cx, y: cy }, p) > SNAP_RADIUS) return p;
    return { x: cx, y: cy };
  }

  // ---------- Auto-detection ----------

  autoDetect() {
    if (!this.imageData) return [];
    const id = this.imageData;
    const total = id.width * id.height;
    const diag = Math.sqrt(id.width * id.width + id.height * id.height);
    const bg = estimateBackground(id);
    const detected = [];

    // ----- Jack: largest sufficiently orange blob -----
    const jackBlobs = findBlobs(id, jackPredicate, 80);
    const jacks = jackBlobs
      .filter(b => b.area >= 80 && b.area <= total * 0.02)
      .map(b => ({ ...b, shape: blobShape(b.points) }))
      .filter(b => b.shape.aspectRatio < 2.5)
      .sort((a, b) => b.area - a.area);
    if (jacks.length) {
      this.jack = { x: jacks[0].cx, y: jacks[0].cy };
      detected.push('🟠 Schweinchen');
    }

    // ----- Stick: try multiple thresholds, group collinear fragments -----
    const stickEnds = detectStick(id, diag);
    if (stickEnds) {
      this.calibration.p1 = stickEnds.p1;
      this.calibration.p2 = stickEnds.p2;
      this.recalcCalibration();
      detected.push('📏 Meterstab');
    }

    // ----- Boules: downsample + dilate the dark mask so metallic
    //               highlights inside the boule are filled in -----
    const factor = 4;
    const ds = downsample(id, factor);
    const dsW = ds.width, dsH = ds.height;
    const dsTotal = dsW * dsH;

    // Build raw dark-pixel mask
    const mask = new Uint8Array(dsTotal);
    for (let i = 0, p = 0; i < dsTotal; i++, p += 4) {
      if (boulePredicateBg(ds.data[p], ds.data[p+1], ds.data[p+2], bg)) mask[i] = 1;
    }
    // Dilate moderately to merge fragments of the same boule
    const dilated = dilate(mask, dsW, dsH, 2);

    const minAreaDs = Math.max(40, dsTotal * 0.001);
    const maxAreaDs = dsTotal * 0.05;
    const stickPoints = stickEnds ? [stickEnds.p1, stickEnds.p2] : null;
    const edgePad = Math.max(3, Math.min(dsW, dsH) * 0.03);
    const rawBlobs = findBlobsFromMask(dilated, dsW, dsH, minAreaDs);

    const boules = rawBlobs
      .filter(b => b.area >= minAreaDs && b.area <= maxAreaDs)
      .filter(b => b.minX > edgePad && b.maxX < dsW - edgePad && b.minY > edgePad && b.maxY < dsH - edgePad)
      .map(b => ({ ...b, shape: blobShape(b.points) }))
      .filter(b => b.shape.aspectRatio < 1.5)
      .filter(b => b.area / (b.bw * b.bh) > 0.55)
      .map(b => ({ ...b, fx: b.cx * factor + factor / 2, fy: b.cy * factor + factor / 2 }))
      .filter(b => !this.jack || dist({ x: b.fx, y: b.fy }, this.jack) > 30)
      .filter(b => !stickPoints || distToSegment({ x: b.fx, y: b.fy }, stickPoints[0], stickPoints[1]) > 30)
      .filter(b => hasLocalContrast(id, b.fx, b.fy, Math.max(b.bw, b.bh) * factor / 2))
      .sort((a, b) => b.area - a.area)
      .slice(0, 6);
    if (boules.length) {
      this.boules = boules.map(b => this.snapToCenter({ x: b.fx, y: b.fy }, 'boule'));
      detected.push(`${boules.length} Kugel${boules.length === 1 ? '' : 'n'}`);
    }

    return detected;
  }

  recalcCalibration() {
    if (this.calibration.p1 && this.calibration.p2 && this.calibration.lengthCm > 0) {
      const px = dist(this.calibration.p1, this.calibration.p2);
      this.calibration.pxPerCm = px / this.calibration.lengthCm;
    } else {
      this.calibration.pxPerCm = 0;
    }
  }

  setCalibrationLength(cm) {
    const v = parseFloat(cm);
    if (!isFinite(v) || v <= 0) return;
    this.calibration.lengthCm = v;
    this.recalcCalibration();
    localStorage.setItem(STICK_LENGTH_KEY, String(v));
    localStorage.setItem(STICK_LENGTH_SEEN_KEY, '1');
    this.lengthHasBeenSet = true;
    this.updateUI();
  }

  openLengthModal() {
    if (!this.image) return;
    const current = this.calibration.lengthCm;
    this.lengthInput.value = current;
    this.lengthModal.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('active', parseFloat(b.dataset.cm) === current);
    });
    this.lengthModal.classList.remove('hidden');
    setTimeout(() => { this.lengthInput.focus(); this.lengthInput.select(); }, 60);
  }

  closeLengthModal() {
    this.lengthModal.classList.add('hidden');
  }

  saveLengthModal() {
    const v = parseFloat(this.lengthInput.value);
    if (isFinite(v) && v > 0) this.setCalibrationLength(v);
    this.closeLengthModal();
  }

  // ---------- Step navigation ----------

  goToStep(step) {
    this.state = step;
    this.updateUI();
  }

  next() {
    switch (this.state) {
      case STATE.STEP_STICK:
        if (this.calibration.pxPerCm <= 0) {
          this.showToast('Beide Enden des Meterstabs setzen');
          return;
        }
        this.goToStep(this.lengthHasBeenSet ? STATE.STEP_JACK : STATE.STEP_LENGTH);
        break;
      case STATE.STEP_LENGTH:
        this.goToStep(STATE.STEP_JACK);
        break;
      case STATE.STEP_JACK:
        if (!this.jack) {
          this.showToast('Schweinchen markieren');
          return;
        }
        this.goToStep(STATE.STEP_BOULES);
        break;
      case STATE.STEP_BOULES:
        if (this.boules.length === 0) {
          this.showToast('Mindestens eine Kugel markieren');
          return;
        }
        this.goToStep(STATE.STEP_DONE);
        this.saveCurrentToHistory();
        break;
    }
  }

  back() {
    switch (this.state) {
      case STATE.STEP_LENGTH:
      case STATE.STEP_JACK:
        this.goToStep(STATE.STEP_STICK);
        break;
      case STATE.STEP_BOULES:
        this.goToStep(STATE.STEP_JACK);
        break;
      case STATE.STEP_DONE:
        this.goToStep(STATE.STEP_BOULES);
        break;
    }
  }

  // ---------- Rendering ----------

  render() {
    const ctx = this.ctx;
    if (!this.image) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.image, 0, 0);

    if (this.calibration.p1 && this.calibration.p2) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4 / this.imageScale;
      ctx.setLineDash([10 / this.imageScale, 6 / this.imageScale]);
      ctx.beginPath();
      ctx.moveTo(this.calibration.p1.x, this.calibration.p1.y);
      ctx.lineTo(this.calibration.p2.x, this.calibration.p2.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.calibration.p1) this.drawCalPoint(this.calibration.p1, '1');
    if (this.calibration.p2) this.drawCalPoint(this.calibration.p2, '2');

    if (this.jack && this.calibration.pxPerCm > 0) {
      this.boules.forEach((b) => {
        const cm = dist(b, this.jack) / this.calibration.pxPerCm;
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.95)';
        ctx.lineWidth = 4 / this.imageScale;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(this.jack.x, this.jack.y);
        ctx.stroke();
        const mid = midpoint(b, this.jack);
        this.drawLabel(`${cm.toFixed(1)} cm`, mid.x, mid.y, '#3b82f6');
      });
    }

    if (this.jack) this.drawJack(this.jack, this.fineTune && this.fineTune.type === 'jack');
    this.boules.forEach((b, i) => this.drawBoule(b, i + 1, this.fineTune && this.fineTune.type === 'boule' && this.fineTune.index === i));

    // Fine-tune overlay (finger position + connector)
    if (this.fineTune && this.fineTune.fingerImg) {
      this.drawFineTuneOverlay();
    }
  }

  drawFineTuneOverlay() {
    const ctx = this.ctx;
    const f = this.fineTune.fingerImg;
    const m = this.fineTune.type === 'jack' ? this.jack : this.boules[this.fineTune.index];
    if (!f || !m) return;

    // Dashed connector finger → marker
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3 / this.imageScale;
    ctx.setLineDash([8 / this.imageScale, 5 / this.imageScale]);
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Finger ring
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
    ctx.lineWidth = 4 / this.imageScale;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 28 / this.imageScale, 0, Math.PI * 2);
    ctx.stroke();
    // Inner dot
    ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 6 / this.imageScale, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCalPoint(p, label) {
    const ctx = this.ctx;
    const r = 16 / this.imageScale;
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3 / this.imageScale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.font = `bold ${15 / this.imageScale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, p.y);
  }

  drawJack(p, active = false) {
    const ctx = this.ctx;
    const r = 18 / this.imageScale;
    if (active) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
      ctx.lineWidth = 5 / this.imageScale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 8 / this.imageScale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#f97316';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3 / this.imageScale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2.5 / this.imageScale;
    ctx.beginPath();
    ctx.moveTo(p.x - r * 0.5, p.y); ctx.lineTo(p.x + r * 0.5, p.y);
    ctx.moveTo(p.x, p.y - r * 0.5); ctx.lineTo(p.x, p.y + r * 0.5);
    ctx.stroke();
  }

  drawBoule(p, idx, active = false) {
    const ctx = this.ctx;
    const r = 20 / this.imageScale;
    if (active) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
      ctx.lineWidth = 5 / this.imageScale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 8 / this.imageScale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#0ea5e9';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3 / this.imageScale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.font = `bold ${20 / this.imageScale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(idx), p.x, p.y);
  }

  drawLabel(text, x, y, color) {
    const ctx = this.ctx;
    const fontSize = 22 / this.imageScale;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const padding = 8 / this.imageScale;
    const m = ctx.measureText(text);
    const w = m.width + padding * 2;
    const h = fontSize + padding * 2;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / this.imageScale;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = 'white';
    ctx.fillText(text, x, y);
  }

  // ---------- UI ----------

  updateUI() {
    if (this.image) {
      this.placeholder.style.display = 'none';
      this.canvasWrap.style.display = 'flex';
    } else {
      this.placeholder.style.display = 'flex';
      this.canvasWrap.style.display = 'none';
      this.toolbar.classList.add('empty');
      this.stepBadge.classList.add('hidden');
      this.calChip.classList.add('hidden');
      this.resultsBar.classList.add('hidden');
      return;
    }

    const stepInfo = this.getStepInfo();
    if (stepInfo) {
      this.stepBadge.innerHTML = stepInfo;
      this.stepBadge.classList.remove('hidden');
    } else {
      this.stepBadge.classList.add('hidden');
    }

    if (this.calibration.pxPerCm > 0) {
      this.calChipValue.textContent = formatCm(this.calibration.lengthCm);
      this.calChip.classList.remove('hidden');
    } else {
      this.calChip.classList.add('hidden');
    }

    this.toolbarContent.innerHTML = this.getToolbarHtml();
    this.toolbar.classList.remove('empty');
    this.wireToolbarHandlers();

    this.updateResults();
    this.fitCanvas();
  }

  getStepInfo() {
    switch (this.state) {
      case STATE.STEP_STICK:
        if (!this.calibration.p1) return '<span class="step-num">1/3</span>Tippe auf einen <b>Endpunkt</b> des Meterstabs';
        if (!this.calibration.p2) return '<span class="step-num">1/3</span>Tippe auf den <b>anderen Endpunkt</b>';
        return '<span class="step-num">1/3</span>Stab passt? Endpunkte zum Anpassen ziehen';
      case STATE.STEP_LENGTH: return '<span class="step-num">1/3</span>Wie lang ist der Stab?';
      case STATE.STEP_JACK:
        return this.jack
          ? '<span class="step-num">2/3</span>Schweinchen passt? <i>Halten</i> zum Feinjustieren'
          : '<span class="step-num">2/3</span>Tippe auf das <b>Schweinchen</b> 🟠';
      case STATE.STEP_BOULES:
        return `<span class="step-num">3/3</span>Tippe Kugeln an${this.boules.length ? ` · ${this.boules.length} · <i>halten</i> zum Feinjustieren` : ''}`;
      case STATE.STEP_DONE: return null;
      default: return null;
    }
  }

  getToolbarHtml() {
    switch (this.state) {
      case STATE.STEP_STICK:
        return `
          <div class="row nav">
            <button id="btn-next" class="primary-cta" ${this.calibration.pxPerCm > 0 ? '' : 'disabled'}>
              Weiter — Schweinchen →
            </button>
          </div>`;
      case STATE.STEP_LENGTH:
        return `
          <div class="row">
            <div class="input-group">
              <label>Stablänge:</label>
              <input id="cal-length" type="number" inputmode="decimal" value="${this.calibration.lengthCm}" min="1" step="0.1">
              <span class="unit">cm</span>
            </div>
          </div>
          <div class="row nav">
            <button id="btn-back" class="secondary">← Stab</button>
            <button id="btn-save-length" class="primary-cta">Bestätigen</button>
          </div>`;
      case STATE.STEP_JACK:
        return `
          <div class="row nav">
            <button id="btn-back" class="secondary">← Stab</button>
            <button id="btn-next" class="primary-cta" ${this.jack ? '' : 'disabled'}>
              Weiter — Kugeln →
            </button>
          </div>`;
      case STATE.STEP_BOULES:
        return `
          <div class="row nav">
            <button id="btn-back" class="secondary">← Schwein.</button>
            <button id="btn-next" class="primary-cta" ${this.boules.length === 0 ? 'disabled' : ''}>
              ${this.boules.length === 0 ? 'Mind. 1 Kugel' : 'Fertig — Abstände'}
            </button>
          </div>`;
      case STATE.STEP_DONE:
        return `
          <div class="row aux">
            <button id="btn-step-stick" class="secondary">📏 Stab</button>
            <button id="btn-step-jack" class="secondary">🟠 Schwein.</button>
            <button id="btn-step-boules" class="secondary">+ Kugel</button>
          </div>`;
      default: return '';
    }
  }

  wireToolbarHandlers() {
    const next = document.getElementById('btn-next');
    if (next) next.addEventListener('click', () => this.next());
    const back = document.getElementById('btn-back');
    if (back) back.addEventListener('click', () => this.back());
    const saveLen = document.getElementById('btn-save-length');
    if (saveLen) {
      const lenInput = document.getElementById('cal-length');
      const apply = () => { this.setCalibrationLength(lenInput.value); this.next(); };
      saveLen.addEventListener('click', apply);
      lenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
      setTimeout(() => { lenInput.focus(); lenInput.select(); }, 50);
    }
    const stepStick = document.getElementById('btn-step-stick');
    if (stepStick) stepStick.addEventListener('click', () => this.goToStep(STATE.STEP_STICK));
    const stepJack = document.getElementById('btn-step-jack');
    if (stepJack) stepJack.addEventListener('click', () => this.goToStep(STATE.STEP_JACK));
    const stepBoules = document.getElementById('btn-step-boules');
    if (stepBoules) stepBoules.addEventListener('click', () => this.goToStep(STATE.STEP_BOULES));
  }

  updateResults() {
    if (this.state !== STATE.STEP_DONE || !this.jack || this.boules.length === 0 || this.calibration.pxPerCm <= 0) {
      this.resultsBar.classList.add('hidden');
      return;
    }
    this.resultsBar.classList.remove('hidden');
    const dists = this.boules.map((b, i) => ({ idx: i + 1, cm: dist(b, this.jack) / this.calibration.pxPerCm }));
    const minCm = Math.min(...dists.map(d => d.cm));
    const sorted = [...dists].sort((a, b) => a.cm - b.cm);
    let html = '<div class="results-row"><span class="label-prefix">🟠 Abstände</span>';
    sorted.forEach(d => {
      const isWinner = d.cm === minCm;
      html += `<span class="result-pill${isWinner ? ' winner' : ''}">
        ${isWinner ? '🏆 ' : ''}<span class="pname">Kugel ${d.idx}</span>
        <span class="pval">${d.cm.toFixed(1)} cm</span>
      </span>`;
    });
    html += '</div>';
    this.resultsBar.innerHTML = html;
  }

  // ---------- Camera ----------

  async openCamera({ silent = false } = {}) {
    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-video');
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      video.srcObject = this.cameraStream;
      modal.classList.add('active');
      this.startLevelDetection();
    } catch (err) {
      if (!silent) alert('Kamera nicht verfügbar: ' + err.message);
    }
  }

  closeCamera() {
    const modal = document.getElementById('camera-modal');
    modal.classList.remove('active');
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    this.stopLevelDetection();
  }

  async flipCamera() {
    if (!this.cameraStream) return;
    const currentFacing = this.cameraStream.getVideoTracks()[0].getSettings().facingMode || 'environment';
    const newFacing = currentFacing === 'user' ? 'environment' : 'user';
    this.cameraStream.getTracks().forEach(t => t.stop());
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: newFacing } }, audio: false });
      document.getElementById('camera-video').srcObject = this.cameraStream;
    } catch (err) {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      document.getElementById('camera-video').srcObject = this.cameraStream;
    }
  }

  takePhoto() {
    const video = document.getElementById('camera-video');
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = c.toDataURL('image/jpeg', 0.9);
    this.closeCamera();
    this.loadImage(dataUrl);
  }

  startLevelDetection() {
    this.levelHandler = (e) => {
      const beta = e.beta || 0;
      const gamma = e.gamma || 0;
      const indicator = document.getElementById('level-indicator');
      const bubble = document.getElementById('level-bubble');
      const text = document.getElementById('level-text');
      const shutter = document.getElementById('shutter');
      if (!indicator || !bubble) return;
      const maxOffset = 70;
      const offsetX = clamp(gamma * 4, -maxOffset, maxOffset);
      const offsetY = clamp(beta * 4, -maxOffset, maxOffset);
      bubble.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      const isLevel = Math.abs(beta) < 5 && Math.abs(gamma) < 5;
      indicator.classList.toggle('level', isLevel);
      text.textContent = isLevel ? '✓ Waagerecht' : 'Halte das Handy waagerecht';
      shutter.disabled = false;
    };
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(p => {
        if (p === 'granted') window.addEventListener('deviceorientation', this.levelHandler);
      }).catch(() => {});
    } else {
      window.addEventListener('deviceorientation', this.levelHandler);
    }
  }

  stopLevelDetection() {
    if (this.levelHandler) {
      window.removeEventListener('deviceorientation', this.levelHandler);
      this.levelHandler = null;
    }
  }

  // ---------- History (IndexedDB) ----------

  async getDb() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HISTORY_DB, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(req.result); };
      req.onerror = () => reject(req.error);
    });
  }

  async saveCurrentToHistory() {
    if (!this.image || !this.imageDataUrl || !this.jack || !this.boules.length) return;
    try {
      const db = await this.getDb();
      const id = this.currentHistoryId || Date.now();
      this.currentHistoryId = id;
      const thumb = makeThumbnail(this.image, 240);
      const record = {
        id,
        ts: Date.now(),
        image: this.imageDataUrl,
        thumbnail: thumb,
        calibration: { p1: this.calibration.p1, p2: this.calibration.p2, lengthCm: this.calibration.lengthCm, pxPerCm: this.calibration.pxPerCm },
        jack: this.jack,
        boules: this.boules,
      };
      await new Promise((res, rej) => {
        const tx = db.transaction(HISTORY_STORE, 'readwrite');
        tx.objectStore(HISTORY_STORE).put(record);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
      // Prune older entries
      const all = await this.listHistory();
      const toDelete = all.slice(HISTORY_LIMIT);
      for (const e of toDelete) await this.deleteHistory(e.id);
    } catch (err) {
      console.warn('history save failed', err);
    }
  }

  async listHistory() {
    try {
      const db = await this.getDb();
      return await new Promise((res, rej) => {
        const tx = db.transaction(HISTORY_STORE, 'readonly');
        const req = tx.objectStore(HISTORY_STORE).getAll();
        req.onsuccess = () => res((req.result || []).sort((a, b) => b.ts - a.ts));
        req.onerror = () => rej(req.error);
      });
    } catch (_) {
      return [];
    }
  }

  async deleteHistory(id) {
    try {
      const db = await this.getDb();
      await new Promise((res, rej) => {
        const tx = db.transaction(HISTORY_STORE, 'readwrite');
        tx.objectStore(HISTORY_STORE).delete(id);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch (_) {}
  }

  async openHistory() {
    if (!this.historyModal) return;
    const items = await this.listHistory();
    if (items.length === 0) {
      this.historyGrid.innerHTML = '<div class="history-empty">Noch keine gespeicherten Bilder</div>';
    } else {
      this.historyGrid.innerHTML = items.map(it => {
        const date = new Date(it.ts);
        const dateStr = date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `
          <div class="history-item" data-id="${it.id}">
            <img src="${it.thumbnail}" alt="">
            <div class="history-meta">
              <span class="history-date">${dateStr}</span>
              <span class="history-count">${it.boules.length}🎱</span>
            </div>
            <button class="history-del" data-del="${it.id}" title="Löschen">✕</button>
          </div>`;
      }).join('');
      this.historyGrid.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.dataset.del) return;
          const id = parseInt(el.dataset.id);
          const item = items.find(i => i.id === id);
          if (item) {
            this.closeHistory();
            this.loadImage(item.image, item);
          }
        });
      });
      this.historyGrid.querySelectorAll('.history-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = parseInt(btn.dataset.del);
          await this.deleteHistory(id);
          this.openHistory();
        });
      });
    }
    this.historyModal.classList.remove('hidden');
  }

  closeHistory() {
    if (this.historyModal) this.historyModal.classList.add('hidden');
  }
}

// ---------- Color predicates ----------

function jackPredicate(r, g, b) {
  return r > 160 && g > 60 && g < 200 && b < 140 && (r - b) > 80 && (r - g) > 25;
}
function jackWeight(r, g, b) {
  return jackPredicate(r, g, b) ? (r - b) : 0;
}
function boulePredicate(r, g, b) {
  const avg = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return avg < 130 && sat < 40;
}
function boulePredicateBg(r, g, b, bg) {
  // Background-relative: a boule should be noticeably darker than ambient ground
  const avg = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return avg < bg * 0.82 && sat < 42 && avg < 165;
}
function bouleWeight(r, g, b) {
  if (!boulePredicate(r, g, b)) return 0;
  const avg = (r + g + b) / 3;
  return 135 - avg;
}

// ---------- Local contrast check (boule surroundings must be brighter) ----------

function hasLocalContrast(imageData, cx, cy, radius) {
  const { width: w, height: h, data } = imageData;
  const sampleR = radius * 1.7;
  // Outer ring brightness (sand around the boule should be brighter)
  let sumOuter = 0, countOuter = 0;
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(angle) * sampleR);
    const y = Math.round(cy + Math.sin(angle) * sampleR);
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const idx = (y * w + x) * 4;
    sumOuter += (data[idx] + data[idx+1] + data[idx+2]) / 3;
    countOuter++;
  }
  if (countOuter < 10) return false;
  const outerAvg = sumOuter / countOuter;
  // Inner ring brightness (boule interior — may be bright due to metallic highlight,
  // but at least one rim sample should be dark)
  let darkSamples = 0;
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(angle) * radius * 0.85);
    const y = Math.round(cy + Math.sin(angle) * radius * 0.85);
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const idx = (y * w + x) * 4;
    const v = (data[idx] + data[idx+1] + data[idx+2]) / 3;
    if (v < outerAvg * 0.85) darkSamples++;
  }
  // Outer must be reasonably bright AND we should see at least a few dark rim points
  return outerAvg > 125 && darkSamples >= 4;
}

// ---------- Morphological dilation (square structuring element) ----------

function dilate(mask, w, h, radius) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let any = false;
      for (let dy = -radius; dy <= radius && !any; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -radius; dx <= radius && !any; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (mask[ny * w + nx]) any = true;
        }
      }
      out[y * w + x] = any ? 1 : 0;
    }
  }
  return out;
}

function findBlobsFromMask(mask, w, h, minArea) {
  const visited = new Uint8Array(w * h);
  const blobs = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx]) continue;
      if (!mask[idx]) { visited[idx] = 1; continue; }
      const stack = [idx];
      let area = 0, sumX = 0, sumY = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      const points = [];
      while (stack.length) {
        const cur = stack.pop();
        if (visited[cur]) continue;
        visited[cur] = 1;
        if (!mask[cur]) continue;
        const cx = cur % w;
        const cy = (cur - cx) / w;
        area++;
        sumX += cx; sumY += cy;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        points.push(cx, cy);
        if (cx > 0)     stack.push(cur - 1);
        if (cx < w - 1) stack.push(cur + 1);
        if (cy > 0)     stack.push(cur - w);
        if (cy < h - 1) stack.push(cur + w);
      }
      if (area >= minArea) {
        blobs.push({ cx: sumX / area, cy: sumY / area, area, minX, maxX, minY, maxY, bw: maxX - minX + 1, bh: maxY - minY + 1, points });
      }
    }
  }
  return blobs;
}

// ---------- Image downsampling (block-average) ----------

function downsample(imageData, factor) {
  const { width: w, height: h, data } = imageData;
  const dw = Math.floor(w / factor);
  const dh = Math.floor(h / factor);
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let by = 0; by < dh; by++) {
    for (let bx = 0; bx < dw; bx++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < factor; dy++) {
        const yIdx = (by * factor + dy) * w;
        for (let dx = 0; dx < factor; dx++) {
          const i = (yIdx + bx * factor + dx) * 4;
          r += data[i]; g += data[i+1]; b += data[i+2];
        }
      }
      const n = factor * factor;
      const oi = (by * dw + bx) * 4;
      out[oi] = r / n;
      out[oi+1] = g / n;
      out[oi+2] = b / n;
      out[oi+3] = 255;
    }
  }
  return { data: out, width: dw, height: dh };
}

// ---------- Background brightness estimate ----------

function estimateBackground(imageData) {
  const { width: w, height: h, data } = imageData;
  const samples = [];
  const step = Math.max(8, Math.floor(Math.min(w, h) / 80));
  for (let y = step; y < h; y += step) {
    for (let x = step; x < w; x += step) {
      const i = (y * w + x) * 4;
      samples.push((data[i] + data[i+1] + data[i+2]) / 3);
    }
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length * 0.6)] || 150; // upper-median
}

// ---------- Stick detection: multi-threshold + collinear merge ----------

function detectStick(imageData, diag) {
  const w = imageData.width, h = imageData.height;
  const total = w * h;
  // Higher threshold first — more reliable. Fall back to lower only if nothing good.
  const thresholds = [210, 195, 180, 165, 150];
  // Reject candidates whose endpoints are too close to image edges
  const edgePad = Math.min(w, h) * 0.04;

  function inImage(p) {
    return p.x >= edgePad && p.x <= w - edgePad && p.y >= edgePad && p.y <= h - edgePad;
  }

  let fallback = null;
  let fallbackLen = 0;

  for (const t of thresholds) {
    const blobs = findBlobs(imageData, (r, g, b) => {
      const avg = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      return avg > t && sat < 50;
    }, 150);
    if (!blobs.length) continue;

    const fragments = blobs
      .map(b => ({ ...b, shape: blobShape(b.points) }))
      .filter(f => f.shape.aspectRatio > 1.8 || f.area > total * 0.0015);
    if (!fragments.length) continue;

    const groups = groupCollinear(fragments, diag * 0.04);
    for (const g of groups) {
      const s = g.shape;
      if (s.major < diag * 0.3 || s.aspectRatio < 5) continue;
      const ends = pcaEndpoints(g.points, s);
      // Reject if endpoints touch image edges (likely a false positive on a bright band)
      if (!inImage(ends.p1) || !inImage(ends.p2)) continue;
      // First good match wins (we prefer higher thresholds)
      return ends;
    }
    // Track relaxed candidate as fallback
    for (const g of groups) {
      const s = g.shape;
      if (s.major > fallbackLen && s.aspectRatio > 4) {
        const ends = pcaEndpoints(g.points, s);
        if (inImage(ends.p1) && inImage(ends.p2)) {
          fallback = ends;
          fallbackLen = s.major;
        }
      }
    }
  }
  return fallback;
}

function groupCollinear(fragments, perpTolerance) {
  // Sort by area descending — biggest fragment is the "anchor"
  const sorted = [...fragments].sort((a, b) => b.area - a.area);
  const used = new Array(sorted.length).fill(false);
  const groups = [];

  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const anchor = sorted[i];
    const group = [anchor];
    for (let j = i + 1; j < sorted.length; j++) {
      if (used[j]) continue;
      const f = sorted[j];
      // Same direction (cosine similarity >= 0.9 → ~25°)
      const dot = Math.abs(anchor.shape.vx * f.shape.vx + anchor.shape.vy * f.shape.vy);
      if (dot < 0.9) continue;
      // Perpendicular distance from f.center to anchor's axis line
      const dx = f.cx - anchor.cx;
      const dy = f.cy - anchor.cy;
      const perp = Math.abs(dx * (-anchor.shape.vy) + dy * anchor.shape.vx);
      if (perp > perpTolerance) continue;
      used[j] = true;
      group.push(f);
    }
    // Combine group points
    const combined = [];
    for (const f of group) {
      for (let k = 0; k < f.points.length; k++) combined.push(f.points[k]);
    }
    if (combined.length > 200) {
      groups.push({ points: combined, shape: blobShape(combined) });
    }
  }
  return groups;
}

// ---------- Connected components / blobs ----------

function findBlobs(imageData, predicate, minArea) {
  const { width: w, height: h, data } = imageData;
  const visited = new Uint8Array(w * h);
  const blobs = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx]) continue;
      const i = idx * 4;
      if (!predicate(data[i], data[i+1], data[i+2])) {
        visited[idx] = 1;
        continue;
      }
      const stack = [idx];
      let area = 0, sumX = 0, sumY = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      const points = [];
      while (stack.length) {
        const cur = stack.pop();
        if (visited[cur]) continue;
        visited[cur] = 1;
        const cx = cur % w;
        const cy = (cur - cx) / w;
        const ci = cur * 4;
        if (!predicate(data[ci], data[ci+1], data[ci+2])) continue;
        area++;
        sumX += cx; sumY += cy;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        points.push(cx, cy);
        if (cx > 0)     stack.push(cur - 1);
        if (cx < w - 1) stack.push(cur + 1);
        if (cy > 0)     stack.push(cur - w);
        if (cy < h - 1) stack.push(cur + w);
      }
      if (area >= minArea) {
        blobs.push({ cx: sumX / area, cy: sumY / area, area, minX, maxX, minY, maxY, bw: maxX - minX + 1, bh: maxY - minY + 1, points });
      }
    }
  }
  return blobs;
}

function blobShape(pointsFlat) {
  const n = pointsFlat.length / 2;
  let cx = 0, cy = 0;
  for (let k = 0; k < pointsFlat.length; k += 2) { cx += pointsFlat[k]; cy += pointsFlat[k+1]; }
  cx /= n; cy /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let k = 0; k < pointsFlat.length; k += 2) {
    const dx = pointsFlat[k] - cx, dy = pointsFlat[k+1] - cy;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  sxx /= n; syy /= n; sxy /= n;
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
  const lambda1 = trace / 2 + disc;
  const lambda2 = trace / 2 - disc;
  const major = Math.sqrt(Math.max(0, lambda1)) * 2;
  const minor = Math.sqrt(Math.max(0, lambda2)) * 2;
  let vx, vy;
  if (Math.abs(sxy) > 1e-6) { vx = lambda1 - syy; vy = sxy; }
  else { if (sxx >= syy) { vx = 1; vy = 0; } else { vx = 0; vy = 1; } }
  const len = Math.sqrt(vx*vx + vy*vy) || 1;
  return { cx, cy, major, minor, aspectRatio: minor > 0 ? major / minor : Infinity, vx: vx / len, vy: vy / len };
}

function pcaEndpoints(pointsFlat, shape) {
  const s = shape || blobShape(pointsFlat);
  let minProj = Infinity, maxProj = -Infinity;
  let minPx = 0, minPy = 0, maxPx = 0, maxPy = 0;
  for (let k = 0; k < pointsFlat.length; k += 2) {
    const x = pointsFlat[k], y = pointsFlat[k+1];
    const proj = (x - s.cx) * s.vx + (y - s.cy) * s.vy;
    if (proj < minProj) { minProj = proj; minPx = x; minPy = y; }
    if (proj > maxProj) { maxProj = proj; maxPx = x; maxPy = y; }
  }
  return { p1: { x: minPx, y: minPy }, p2: { x: maxPx, y: maxPy } };
}

// ---------- Helpers ----------

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function formatCm(v) { return v % 1 === 0 ? String(v) : v.toFixed(1); }

function distToSegment(p, a, b) {
  const ax = b.x - a.x, ay = b.y - a.y;
  const len2 = ax * ax + ay * ay;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * ax + (p.y - a.y) * ay) / len2;
  t = clamp(t, 0, 1);
  const px = a.x + t * ax, py = a.y + t * ay;
  return Math.sqrt((p.x - px) ** 2 + (p.y - py) ** 2);
}

function makeThumbnail(image, maxSize = 240) {
  const c = document.createElement('canvas');
  const ratio = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight, 1);
  c.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  c.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

window.app = new BouliApp();
