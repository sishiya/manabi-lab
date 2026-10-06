// zoom.js — switch between a few fixed scales: inside a cell / tissue / mucosa or skin section / head or arm / whole body.
// There are no in-between scales (they cut text and pictures oddly): the wheel, a pinch or a button steps to the next
// scale with a short cross-fade. Each scale is drawn at its own size, so labels always fit.
'use strict';

const CAM = { i:1, prev:null, fade:1, cx:null, cy:null, ptrs:new Map(), drag:null, pinch:null, moved:0, acc:0, cool:0 };
const CELL_Z = 3.4;                                  // "inside a cell" = the tissue view magnified 3.4× (about 30 µm tall)
// larger scales by layout. mark = where the next closer view sits (x from the centre, y from the top, height 100)
const SECTIONS = {
  airway: { name:'粘膜', size:'約3mm', draw:(g, h, t) => drawSectionFlu(g, h, t), mark:{ x:0, y:31.8, w:3.3, label:'組織の画面はここ（0.1mm）' } },
  skin:   { name:'皮膚', size:'約3mm', draw:(g, h, t) => drawSectionStaph(g, h, t), mark:{ x:0, y:31.3, w:3.3, label:'組織の画面はここ（0.1mm）' } },
};
const PARTS = {
  airway: { name:'頭', size:'約25cm', draw:(g, h, t) => drawPartFlu(g, h, t), mark:{ x:-19, y:44.5, w:1.4, label:'粘膜の画面はこのあたり' } },
  skin:   { name:'腕', size:'約25cm', draw:(g, h, t) => drawPartStaph(g, h, t), mark:{ x:-4, y:42, w:1.4, label:'皮膚の画面はこのあたり' } },
};
function zoomStops() {
  const s = MI.scene, list = [{ key:'cell', name:'細胞の中', size:'約30µm' }, { key:'tissue', name:'組織', size:'約0.1mm' }];
  if (SECTIONS[s]) list.push({ key:'section', ...SECTIONS[s] });
  if (PARTS[s]) list.push({ key:'part', ...PARTS[s] });
  list.push({ key:'body', name:'全身', size:'約2m', draw:(g, h, t) => drawBodyLevel(g, h, t) });
  return list;
}

function initZoom() {
  const cv = MI.cv;
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (performance.now() < CAM.cool) return;
    CAM.acc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    if (Math.abs(CAM.acc) >= 90) { stepLevel(CAM.acc > 0 ? 1 : -1, e); CAM.acc = 0; CAM.cool = performance.now() + 380; }
  }, { passive:false });
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    CAM.ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY });
    CAM.moved = 0;
    if (CAM.ptrs.size === 2) { const [a, b] = [...CAM.ptrs.values()]; CAM.pinch = { d:Math.hypot(a.x - b.x, a.y - b.y) }; CAM.drag = null; }
    else CAM.drag = { x:e.clientX, y:e.clientY };
  });
  cv.addEventListener('pointermove', e => {
    if (!CAM.ptrs.has(e.pointerId)) return;
    CAM.ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (CAM.pinch && CAM.ptrs.size === 2) {
      const [a, b] = [...CAM.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      CAM.moved = 99;
      if (d / CAM.pinch.d > 1.45) { stepLevel(-1, { clientX:(a.x + b.x) / 2, clientY:(a.y + b.y) / 2 }); CAM.pinch.d = d; }
      else if (CAM.pinch.d / d > 1.45) { stepLevel(1); CAM.pinch.d = d; }
    } else if (CAM.drag) {
      const dx = e.clientX - CAM.drag.x, dy = e.clientY - CAM.drag.y;
      CAM.moved += Math.abs(dx) + Math.abs(dy);
      CAM.drag = { x:e.clientX, y:e.clientY };
      if (CAM.i === 0 && CAM.moved > 4) {                    // look around while inside a cell
        const k = MI.view.k / MI.dpr;
        CAM.cx -= dx / k; CAM.cy -= dy / k; clampCam();
      }
    }
  });
  const up = e => { CAM.ptrs.delete(e.pointerId); if (CAM.ptrs.size < 2) CAM.pinch = null; if (!CAM.ptrs.size) CAM.drag = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
}

// go to scale i (0 = inside a cell). Going inside a cell centres on the point under the cursor, or on something
// interesting (an infected cell / bacteria) when there is no cursor.
function setLevel(i, e) {
  const n = zoomStops().length;
  i = clamp(i, 0, n - 1);
  if (i === CAM.i) return;
  if (i === 0) {
    let p = null;
    if (e && e.clientX != null && CAM.i === 1 && MI.view) {
      const r = MI.cv.getBoundingClientRect();
      p = { x:((e.clientX - r.left) * MI.dpr - MI.view.ox) / MI.view.k, y:((e.clientY - r.top) * MI.dpr - MI.view.oy) / MI.view.k };
    } else p = interestingPoint();
    CAM.cx = p.x; CAM.cy = p.y; clampCam();
  }
  // keep a picture of the current view and fade it out over the new one
  if (!CAM.snap) CAM.snap = document.createElement('canvas');
  CAM.snap.width = MI.cv.width; CAM.snap.height = MI.cv.height; CAM.snap.getContext('2d').drawImage(MI.cv, 0, 0);
  CAM.prev = CAM.i; CAM.i = i; CAM.fade = 0;
  MI.callouts = [];
  syncZoomUI();
}
const stepLevel = (d, e) => setLevel(CAM.i + d, e);
function interestingPoint() {
  if (MI.cells.length) {
    const z = MI.cells.find(c => c.st === 'I' || c.st === 'doom') || MI.cells.find(c => c.st === 'E') || MI.cells[Math.floor(MI.cells.length / 2)];
    return { x:z.x + z.w / 2, y:(LF.TOP + LF.BOT) / 2 - 6 };
  }
  const b = MI.agents.find(a => a.type === 'bac' && a.st === 'free');
  return b ? { x:b.x, y:b.y } : { x:MI.W / 2, y:50 };
}
function clampCam() {
  const hw = MI.W / 2 / CELL_Z, hh = 50 / CELL_Z;
  CAM.cx = clamp(CAM.cx ?? MI.W / 2, hw, MI.W - hw); CAM.cy = clamp(CAM.cy ?? 50, hh, 100 - hh);
}
function stepZoom(dt) { if (CAM.fade < 1) CAM.fade = Math.min(1, CAM.fade + dt / 0.28); }

// ---------- drawing ----------
function renderAll() {
  const g = MI.ctx, t = MI.now;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  g.fillStyle = '#0b0f13'; g.fillRect(0, 0, MI.cv.width, MI.cv.height);
  MI.tissueMain = CAM.i <= 1;
  drawStop(g, CAM.i, t, true);
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (CAM.fade < 1 && CAM.snap) { g.globalAlpha = 1 - CAM.fade; g.drawImage(CAM.snap, 0, 0); }
  g.globalAlpha = 1;
  drawScaleBar(g);
}
function drawStop(g, i, t, main) {
  const s = zoomStops()[i], Wp = MI.cv.width, Hp = MI.cv.height;
  if (!s) return;
  if (s.key === 'cell') { drawTissue(g, { x:0, y:0, w:Wp, h:Hp }, CELL_Z, CAM.cx, CAM.cy, main); return; }
  if (s.key === 'tissue') { drawTissue(g, { x:0, y:0, w:Wp, h:Hp }, 1, null, null, main); return; }
  // a little smaller than the view, so nothing hides under the status box at the top or the time bar at the bottom
  const u = Hp / 116, a = g.globalAlpha;
  g.setTransform(u, 0, 0, u, Wp / 2, Hp * 0.04);
  MI.levelMag = 1;
  s.draw(g, Wp / 2 / u, t);
  g.globalAlpha = a;
  if (s.mark) {                                         // where the next closer view is
    const m = s.mark, w = Math.max(m.w, 1.2);
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 0.35; g.strokeRect(m.x - w / 2, m.y - w / 2, w, w);
    g.font = '2.2px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = 'rgba(255,255,255,.9)'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(m.label, m.x + w / 2 + 1.2, m.y - 2.2);
  }
}

function drawScaleBar(g) {
  const s = zoomStops()[CAM.i], Hp = MI.cv.height, d = MI.dpr;
  if (!document.getElementById('bodyWin').classList.contains('away') && !document.getElementById('bodyWin').classList.contains('min')) return;   // the body window covers this corner
  const F = s.key === 'cell' ? 100 / CELL_Z : s.key === 'tissue' ? 100 : s.key === 'section' ? 3000 : s.key === 'part' ? 2.5e5 : 2.1e6;
  const umPerPx = F / Hp, nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6];
  let len = nice[0]; for (const n of nice) if (n / umPerPx < 110 * d) len = n;
  const px = len / umPerPx, x = MI.cv.width - px - 14 * d, y = 14 * d;
  g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(x, y, px, 2 * d);
  g.font = `${10.5 * d}px "IBM Plex Mono", monospace`; g.textAlign = 'right'; g.textBaseline = 'top';
  const lab = len >= 1e6 ? len / 1e6 + ' m' : len >= 1e4 ? len / 1e4 + ' cm' : len >= 1e3 ? len / 1e3 + ' mm' : len + ' µm';
  g.fillText(lab, x + px, y + 5 * d);
}

// ---------- buttons ----------
function buildZoomUI() {
  const box = document.getElementById('zoomStops'); box.innerHTML = '';
  if (CAM.i >= zoomStops().length) CAM.i = 1;
  CAM.fade = 1;
  zoomStops().forEach((s, i) => {
    const b = document.createElement('button'); b.dataset.i = i; b.textContent = s.name; b.title = '高さ' + s.size;
    b.onclick = () => setLevel(i);
    box.appendChild(b);
  });
  document.getElementById('zoomIn').onclick = () => stepLevel(-1);
  document.getElementById('zoomOut').onclick = () => stepLevel(1);
  syncZoomUI();
}
function syncZoomUI() {
  document.querySelectorAll('#zoomStops button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === CAM.i));
  const s = zoomStops()[CAM.i];
  document.getElementById('bodyWin').classList.toggle('away', s.key === 'part' || s.key === 'body');
}
