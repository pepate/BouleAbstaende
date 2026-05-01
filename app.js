'use strict';

const STATE = {
  IDLE: 'IDLE',
  CALIBRATE_P1: 'CALIBRATE_P1',
  CALIBRATE_P2: 'CALIBRATE_P2',
  CALIBRATE_LENGTH: 'CALIBRATE_LENGTH',
  MARK_JACK: 'MARK_JACK',
  MARK_BOULES: 'MARK_BOULES',
  DONE: 'DONE',
};

const HIT_RADIUS = 40;
const SNAP_RADIUS = 80;
const TAP_THRESHOLD = 8;
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

    this.imageCanvas = document.createElement('canvas');
    this.imageCtx = this.imageCanvas.getContext('2d', { willReadFrequently: true });
    this.imageData = null;

    this.state = STATE.IDLE;
    this.image = null;
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

    this.bindEvents();
    this.updateUI();
  }

  bindEvents() {
    document.getElementById('btn-upload').addEventListener('click', () => this.fileInput.click());
    document.getElementById('btn-camera').addEventListener('click', () => this.openCamera());
    document.getElementById('btn-reset').addEventListener('click', () => this.reset());
    this.fileInput.addEventListener('change', (e) => this.handleFile(e));

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.calChip.addEventListener('click', () => this.editStickLength());

    // Length modal
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

    document.getElementById('camera-cancel').addEventListener('click', () => this.closeCamera());
    document.getElementById('shutter').addEventListener('click', () => this.takePhoto());
    document.getElementById('camera-flip').addEventListener('click', () => this.flipCamera());

    window.addEventListener('resize', () => this.fitCanvas());
    window.addEventListener('orientationchange', () => setTimeout(() => this.fitCanvas(), 100));
  }

  reset() {
    this.state = STATE.IDLE;
    this.image = null;
    this.imageData = null;
    this.calibration.p1 = null;
    this.calibration.p2 = null;
    this.calibration.pxPerCm = 0;
    this.jack = null;
    this.boules = [];
    this.dragging = null;
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

  loadImage(src) {
    const img = new Image();
    img.onload = () => {
      this.image = img;
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

      const detected = this.autoDetect();
      this.refreshState();
      this.fitCanvas();
      this.updateUI();

      if (detected.length) {
        this.showToast(`Auto-erkannt: ${detected.join(', ')}`);
      }
    };
    img.src = src;
  }

  refreshState() {
    if (this.calibration.pxPerCm > 0 && this.jack && this.boules.length > 0) {
      this.state = STATE.DONE;
    } else if (this.calibration.pxPerCm > 0 && this.jack) {
      this.state = STATE.MARK_BOULES;
    } else if (this.calibration.pxPerCm > 0) {
      this.state = STATE.MARK_JACK;
    } else if (this.calibration.p1 && this.calibration.p2 && !this.lengthHasBeenSet) {
      this.state = STATE.CALIBRATE_LENGTH;
    } else {
      this.state = STATE.CALIBRATE_P1;
    }
  }

  fitCanvas() {
    if (!this.image) return;
    const headerH = document.querySelector('header').offsetHeight;
    const toolbarH = this.toolbar.classList.contains('empty') ? 0 : this.toolbar.offsetHeight;
    const maxW = window.innerWidth - 8;
    const maxH = window.innerHeight - headerH - toolbarH - 8;
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
    // Calibration line (lower priority — only if not on endpoints/markers)
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
      // Click on calibration line (between endpoints) opens length editor
      if (hit.type === 'cal-line') {
        this.dragging = null;
        this.editStickLength();
        return;
      }
      this.dragging = { ...hit, justClicked: true, downAt: p };
      return;
    }

    switch (this.state) {
      case STATE.CALIBRATE_P1:
        this.calibration.p1 = p;
        this.state = STATE.CALIBRATE_P2;
        break;
      case STATE.CALIBRATE_P2:
        this.calibration.p2 = p;
        this.recalcCalibration();
        this.state = this.lengthHasBeenSet ? STATE.MARK_JACK : STATE.CALIBRATE_LENGTH;
        break;
      case STATE.MARK_JACK:
        this.jack = this.snapToCenter(p, 'jack');
        this.state = STATE.MARK_BOULES;
        break;
      case STATE.MARK_BOULES:
      case STATE.DONE:
        this.boules.push(this.snapToCenter(p, 'boule'));
        break;
    }
    this.updateUI();
  }

  onPointerMove(e) {
    if (!this.dragging || !this.image) return;
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
    if (!this.dragging) return;
    const d = this.dragging;
    this.dragging = null;

    if (d.justClicked) {
      // Tap on existing marker — remove it
      if (d.type === 'jack') {
        this.jack = null;
        if (this.state === STATE.DONE) this.state = STATE.MARK_JACK;
        this.updateUI();
      } else if (d.type === 'boule') {
        this.boules.splice(d.index, 1);
        if (this.state === STATE.DONE && this.boules.length === 0) this.state = STATE.MARK_BOULES;
        this.updateUI();
      }
      // Cal endpoints ignore taps (drag-only)
      return;
    }

    // Was a drag — snap target to center
    if (d.type === 'jack' && this.jack) {
      this.jack = this.snapToCenter(this.jack, 'jack');
    } else if (d.type === 'boule' && this.boules[d.index]) {
      this.boules[d.index] = this.snapToCenter(this.boules[d.index], 'boule');
    }
    this.render();
    this.updateResults();
  }

  // ---------- Snap to center (after click/drag) ----------

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
    const detected = [];

    // 1. Detect orange jack
    const jackBlobs = findBlobs(id, jackPredicate, 50);
    const jack = jackBlobs
      .filter(b => b.area >= 50 && b.area <= total * 0.02)
      .sort((a, b) => b.area - a.area)[0];

    // 2. Detect grey boule blobs
    const bouleMinArea = Math.max(400, total * 0.0015);
    const bouleMaxArea = total * 0.04;
    const bouleBlobs = findBlobs(id, boulePredicate, bouleMinArea);
    const boules = bouleBlobs
      .filter(b => b.area >= bouleMinArea && b.area <= bouleMaxArea)
      .map(b => ({ ...b, shape: blobShape(b.points) }))
      .filter(b => b.shape.aspectRatio < 2.2)
      .filter(b => !jack || dist({ x: b.cx, y: b.cy }, { x: jack.cx, y: jack.cy }) > 25)
      .sort((a, b) => b.area - a.area)
      .slice(0, 8);

    // 3. Detect bright elongated stick
    const stickBlobs = findBlobs(id, stickPredicate, 500);
    const stickCandidates = stickBlobs
      .map(b => ({ ...b, shape: blobShape(b.points) }))
      .filter(b => b.shape.aspectRatio > 5)
      .sort((a, b) => b.shape.major - a.shape.major);
    const stick = stickCandidates[0];

    if (jack) {
      this.jack = { x: jack.cx, y: jack.cy };
      detected.push('🟠 Cochonnet');
    }
    if (boules.length) {
      this.boules = boules.map(b => ({ x: b.cx, y: b.cy }));
      detected.push(`${boules.length} Kugel${boules.length === 1 ? '' : 'n'}`);
    }
    if (stick) {
      const ends = pcaEndpoints(stick.points, stick.shape);
      this.calibration.p1 = ends.p1;
      this.calibration.p2 = ends.p2;
      this.recalcCalibration();
      detected.push('📏 Meterstab');
    }

    return detected;
  }

  recalcCalibration() {
    if (this.calibration.p1 && this.calibration.p2 && this.calibration.lengthCm > 0) {
      const px = dist(this.calibration.p1, this.calibration.p2);
      this.calibration.pxPerCm = px / this.calibration.lengthCm;
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
    if (this.state === STATE.CALIBRATE_LENGTH) {
      this.refreshState();
    }
    this.updateUI();
  }

  editStickLength() {
    this.openLengthModal();
  }

  openLengthModal() {
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
    if (isFinite(v) && v > 0) {
      this.setCalibrationLength(v);
    }
    this.closeLengthModal();
  }

  removeJack() {
    this.jack = null;
    this.state = STATE.MARK_JACK;
    this.updateUI();
  }

  redoCalibration() {
    this.calibration.p1 = null;
    this.calibration.p2 = null;
    this.calibration.pxPerCm = 0;
    this.state = STATE.CALIBRATE_P1;
    this.updateUI();
  }

  finish() {
    this.state = STATE.DONE;
    this.updateUI();
  }

  goToMarkBoules() {
    this.state = STATE.MARK_BOULES;
    this.updateUI();
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

    if (this.jack) this.drawJack(this.jack);
    this.boules.forEach((b, i) => this.drawBoule(b, i + 1));
  }

  drawCalPoint(p, label) {
    const ctx = this.ctx;
    const r = 14 / this.imageScale;
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

  drawJack(p) {
    const ctx = this.ctx;
    const r = 16 / this.imageScale;
    ctx.fillStyle = '#f97316';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3 / this.imageScale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2 / this.imageScale;
    ctx.beginPath();
    ctx.moveTo(p.x - r * 0.5, p.y); ctx.lineTo(p.x + r * 0.5, p.y);
    ctx.moveTo(p.x, p.y - r * 0.5); ctx.lineTo(p.x, p.y + r * 0.5);
    ctx.stroke();
  }

  drawBoule(p, idx) {
    const ctx = this.ctx;
    const r = 18 / this.imageScale;
    ctx.fillStyle = '#0ea5e9';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3 / this.imageScale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.font = `bold ${18 / this.imageScale}px sans-serif`;
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

    const toolbarHtml = this.getToolbarHtml();
    if (toolbarHtml) {
      this.toolbarContent.innerHTML = toolbarHtml;
      this.toolbar.classList.remove('empty');
      this.wireToolbarHandlers();
    } else {
      this.toolbar.classList.add('empty');
    }

    this.fitCanvas();
    this.updateResults();
  }

  getStepInfo() {
    switch (this.state) {
      case STATE.CALIBRATE_P1: return '<span class="step-num">1/3</span>Tippe auf <b>einen Endpunkt</b> des Meterstabs';
      case STATE.CALIBRATE_P2: return '<span class="step-num">1/3</span>Tippe auf den <b>anderen Endpunkt</b>';
      case STATE.CALIBRATE_LENGTH: return '<span class="step-num">1/3</span>Wie lang ist der Stab?';
      case STATE.MARK_JACK: return '<span class="step-num">2/3</span>Tippe auf das <b>Schweinchen</b> 🟠';
      case STATE.MARK_BOULES: return `<span class="step-num">3/3</span>Tippe jede <b>Kugel</b> an${this.boules.length ? ` (${this.boules.length} markiert)` : ''}`;
      case STATE.DONE: return null;
      default: return null;
    }
  }

  getToolbarHtml() {
    switch (this.state) {
      case STATE.CALIBRATE_P1:
      case STATE.CALIBRATE_P2:
        return null;
      case STATE.CALIBRATE_LENGTH:
        return `
          <div class="row">
            <div class="input-group">
              <label>Stablänge:</label>
              <input id="cal-length" type="number" inputmode="decimal" value="${this.calibration.lengthCm}" min="1" step="0.1">
              <span class="unit">cm</span>
            </div>
          </div>
          <div class="row primary"><button id="btn-cal-confirm" class="primary-cta">Bestätigen</button></div>`;
      case STATE.MARK_JACK:
        return `<div class="row aux"><button id="btn-cal-redo" class="secondary">↺ Stab neu</button></div>`;
      case STATE.MARK_BOULES:
        return `
          <div class="row primary">
            <button id="btn-finish" class="primary-cta" ${this.boules.length === 0 ? 'disabled' : ''}>
              ${this.boules.length === 0 ? 'Mind. 1 Kugel markieren' : 'Fertig — Abstände anzeigen'}
            </button>
          </div>
          <div class="row aux">
            <button id="btn-jack-redo" class="secondary">🟠 Schweinchen</button>
            ${this.boules.length > 0 ? '<button id="btn-undo-boule" class="secondary">↶ Letzte</button>' : ''}
          </div>`;
      case STATE.DONE:
        return `
          <div class="row aux">
            <button id="btn-add-more" class="secondary">+ Kugel</button>
            <button id="btn-jack-redo" class="secondary">🟠 Schweinchen</button>
            <button id="btn-cal-redo" class="secondary">📏 Stab</button>
          </div>`;
      default: return null;
    }
  }

  wireToolbarHandlers() {
    const calConfirm = document.getElementById('btn-cal-confirm');
    if (calConfirm) {
      const lenInput = document.getElementById('cal-length');
      const apply = () => this.setCalibrationLength(lenInput.value);
      calConfirm.addEventListener('click', apply);
      lenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
      setTimeout(() => { lenInput.focus(); lenInput.select(); }, 50);
    }
    const calRedo = document.getElementById('btn-cal-redo');
    if (calRedo) calRedo.addEventListener('click', () => this.redoCalibration());
    const jackRedo = document.getElementById('btn-jack-redo');
    if (jackRedo) jackRedo.addEventListener('click', () => this.removeJack());
    const finish = document.getElementById('btn-finish');
    if (finish) finish.addEventListener('click', () => this.finish());
    const addMore = document.getElementById('btn-add-more');
    if (addMore) addMore.addEventListener('click', () => this.goToMarkBoules());
    const undoBoule = document.getElementById('btn-undo-boule');
    if (undoBoule) undoBoule.addEventListener('click', () => { this.boules.pop(); this.updateUI(); });
  }

  updateResults() {
    if (this.state !== STATE.DONE || !this.jack || this.boules.length === 0 || this.calibration.pxPerCm <= 0) {
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

  async openCamera() {
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
      alert('Kamera nicht verfügbar: ' + err.message);
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
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
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
}

// ---------- Color predicates ----------

function jackPredicate(r, g, b) {
  return r > 140 && g > 50 && g < 200 && b < 140 && (r - b) > 60 && (r - g) > 15;
}
function jackWeight(r, g, b) {
  return jackPredicate(r, g, b) ? (r - b) : 0;
}
function boulePredicate(r, g, b) {
  const avg = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return avg < 125 && sat < 35;
}
function bouleWeight(r, g, b) {
  if (!boulePredicate(r, g, b)) return 0;
  const avg = (r + g + b) / 3;
  return 130 - avg;
}
function stickPredicate(r, g, b) {
  const avg = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return avg > 175 && sat < 35;
}

// ---------- Connected components / blob detection ----------

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
      // Flood fill
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
        points.push(cx, cy); // flat array for memory

        if (cx > 0)     stack.push(cur - 1);
        if (cx < w - 1) stack.push(cur + 1);
        if (cy > 0)     stack.push(cur - w);
        if (cy < h - 1) stack.push(cur + w);
      }

      if (area >= minArea) {
        blobs.push({
          cx: sumX / area,
          cy: sumY / area,
          area,
          minX, maxX, minY, maxY,
          bw: maxX - minX + 1,
          bh: maxY - minY + 1,
          points,
        });
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
  // Eigenvector for lambda1
  let vx, vy;
  if (Math.abs(sxy) > 1e-6) {
    vx = lambda1 - syy; vy = sxy;
  } else {
    if (sxx >= syy) { vx = 1; vy = 0; } else { vx = 0; vy = 1; }
  }
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

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function formatCm(v) { return v % 1 === 0 ? String(v) : v.toFixed(1); }

// Service worker registration (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

window.app = new BouliApp();
