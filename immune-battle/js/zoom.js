// zoom.js — one seamless camera from inside a cell to the whole body.
// CAM.L = log10(height of the view in µm). The tissue view is 100 µm tall (L = 2); zooming in magnifies it.
// Zooming out, each larger "level" (mucosa / skin section → head / arm → whole body) is drawn magnified around the
// spot where the smaller one sits, and the smaller one is drawn inside it as an inset, so the change is continuous.
'use strict';

const CAM = { L:2, target:null, cx:null, cy:null, ptrs:new Map(), drag:null, pinch:null, moved:0 };
const LMIN = 1.1, LMAX = 6.32;
// Each level: fov = view height in µm; anchor = where the smaller level's centre sits in this level's units
// (x from the centre, y from the top, height 100). draw(g, halfW, t) draws the level in those units.
const LEVELS = {
  flu: [
    { key:'tissue', name:'組織', fov:100 },
    { key:'section', name:'粘膜', fov:3000, anchor:{ x:0, y:31.8 }, draw:(g, h, t) => drawSectionFlu(g, h, t) },
    { key:'part', name:'頭', fov:2.5e5, anchor:{ x:-19, y:44.5 }, draw:(g, h, t) => drawPartFlu(g, h, t) },
    { key:'body', name:'全身', fov:2.1e6, anchor:{ x:0, y:20.2 }, draw:(g, h, t) => drawBodyLevel(g, h, t) },
  ],
  staph: [
    { key:'tissue', name:'組織', fov:100 },
    { key:'section', name:'皮膚', fov:3000, anchor:{ x:0, y:31.3 }, draw:(g, h, t) => drawSectionStaph(g, h, t) },
    { key:'part', name:'腕', fov:2.5e5, anchor:{ x:-4, y:42 }, draw:(g, h, t) => drawPartStaph(g, h, t) },
    { key:'body', name:'全身', fov:2.1e6, anchor:{ x:-15.6, y:48 }, draw:(g, h, t) => drawBodyLevel(g, h, t) },
  ],
};
// quick jumps (shown as buttons)
const ZOOM_STOPS = [['細胞の中', 1.3], ['組織', 2], ['粘膜', 3.476], ['頭', 5.397], ['全身', 6.32]];
const stopName = (i) => MI.scene === 'staph' ? ['細胞の中', '組織', '皮膚', '腕', '全身'][i] : ZOOM_STOPS[i][0];

function initZoom() {
  const cv = MI.cv;
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    zoomBy(d * 0.0016, e);
  }, { passive:false });
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    CAM.ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY });
    CAM.moved = 0;
    if (CAM.ptrs.size === 2) { const [a, b] = [...CAM.ptrs.values()]; CAM.pinch = { d:Math.hypot(a.x - b.x, a.y - b.y), L:CAM.L }; CAM.drag = null; }
    else CAM.drag = { x:e.clientX, y:e.clientY };
  });
  cv.addEventListener('pointermove', e => {
    if (!CAM.ptrs.has(e.pointerId)) return;
    CAM.ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if (CAM.pinch && CAM.ptrs.size === 2) {
      const [a, b] = [...CAM.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { clientX:(a.x + b.x) / 2, clientY:(a.y + b.y) / 2 };
      zoomBy(CAM.pinch.L - Math.log10(d / CAM.pinch.d) - CAM.L, mid);
      CAM.moved = 99;
    } else if (CAM.drag) {
      const dx = e.clientX - CAM.drag.x, dy = e.clientY - CAM.drag.y;
      CAM.moved += Math.abs(dx) + Math.abs(dy);
      CAM.drag = { x:e.clientX, y:e.clientY };
      if (CAM.L < 2 && CAM.moved > 4) {                      // pan while zoomed in
        const k = MI.view.k / MI.dpr;
        CAM.cx -= dx / k; CAM.cy -= dy / k; clampCam(); CAM.target = null;
      }
    }
  });
  const up = e => { CAM.ptrs.delete(e.pointerId); if (CAM.ptrs.size < 2) CAM.pinch = null; if (!CAM.ptrs.size) CAM.drag = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
}

// zoom by dL (positive = out), keeping the point under the cursor fixed while inside the tissue
function zoomBy(dL, e) {
  CAM.target = null;
  const L0 = CAM.L, L1 = clamp(L0 + dL, LMIN, LMAX);
  if (L1 < 2 || L0 < 2) {
    const r = MI.cv.getBoundingClientRect();
    const px = (e.clientX - r.left) * MI.dpr, py = (e.clientY - r.top) * MI.dpr;
    if (CAM.cx == null) { CAM.cx = MI.W / 2; CAM.cy = 50; }
    const z0 = 10 ** (2 - Math.min(L0, 2)), z1 = 10 ** (2 - Math.min(L1, 2)), k0 = MI.cv.height / 100 * z0, k1 = MI.cv.height / 100 * z1;
    const wx = CAM.cx + (px - MI.cv.width / 2) / k0, wy = CAM.cy + (py - MI.cv.height / 2) / k0;
    CAM.cx = wx - (px - MI.cv.width / 2) / k1; CAM.cy = wy - (py - MI.cv.height / 2) / k1;
  }
  CAM.L = L1; clampCam(); syncZoomUI();
}
function clampCam() {
  if (CAM.cx == null) { CAM.cx = MI.W / 2; CAM.cy = 50; }
  const z = 10 ** (2 - Math.min(CAM.L, 2)), hw = MI.W / 2 / z, hh = 50 / z;
  CAM.cx = clamp(CAM.cx, hw, MI.W - hw); CAM.cy = clamp(CAM.cy, hh, 100 - hh);
}
// animated jump; going inside a cell centres on something interesting
function zoomTo(L) {
  CAM.target = L;
  if (L < 2) {
    let p = null;
    if (MI.scene === 'flu') { const z = MI.cells.find(c => c.st === 'I' || c.st === 'doom') || MI.cells.find(c => c.st === 'E') || MI.cells[Math.floor(MI.cells.length / 2)]; p = { x:z.x + z.w / 2, y:LF.TOP + 4 }; }
    else { const b = MI.agents.find(a => a.type === 'bac' && a.st === 'free'); p = b ? { x:b.x, y:b.y } : SITE(); }
    CAM.focus = p;
  } else CAM.focus = null;
}
function stepZoom(dt) {
  syncZoomUI();
  if (CAM.target != null) {
    const k = Math.min(1, dt * 3.2);
    CAM.L += (CAM.target - CAM.L) * k;
    if (CAM.focus) { CAM.cx += (CAM.focus.x - CAM.cx) * k; CAM.cy += (CAM.focus.y - CAM.cy) * k; }
    if (Math.abs(CAM.target - CAM.L) < 0.003) { CAM.L = CAM.target; CAM.target = null; }
    clampCam(); syncZoomUI();
  }
  if (CAM.L >= 2 && CAM.cx != null) { CAM.cx += (MI.W / 2 - CAM.cx) * Math.min(1, dt * 6); CAM.cy += (50 - CAM.cy) * Math.min(1, dt * 6); }
}

// ---------- drawing all levels ----------
function renderAll() {
  const g = MI.ctx, Wp = MI.cv.width, Hp = MI.cv.height, t = MI.now, F = 10 ** CAM.L, lv = LEVELS[MI.scene];
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#0b0f13'; g.fillRect(0, 0, Wp, Hp);
  MI.tissueMain = F <= lv[0].fov * 1.0001;
  if (MI.tissueMain) {
    if (CAM.cx == null) { CAM.cx = MI.W / 2; CAM.cy = 50; }
    drawTissue(g, { x:0, y:0, w:Wp, h:Hp }, lv[0].fov / F, CAM.cx, CAM.cy, true);
  } else {
    let i = 0; while (i < lv.length - 1 && F > lv[i + 1].fov) i++;
    if (i === lv.length - 1) drawLevelAt(g, lv[i], Hp / 100, Wp / 2, 0, t);
    else {
      const child = lv[i], par = lv[i + 1], m = par.fov / F;
      const k = Math.log(m) / Math.log(par.fov / child.fov), anc = par.anchor;
      const cxu = anc.x * k, cyu = 50 + (anc.y - 50) * k, u = Hp / 100 * m;
      drawLevelAt(g, par, u, Wp / 2 - cxu * u, Hp / 2 - cyu * u, t);
      // the smaller level, inset where it belongs
      const ih = Hp * child.fov / F, iw = ih * Wp / Hp;
      const ax = (anc.x - cxu) * u + Wp / 2, ay = (anc.y - cyu) * u + Hp / 2;
      const rect = { x:ax - iw / 2, y:ay - ih / 2, w:iw, h:ih };
      const a = clamp((ih / Hp - 0.03) / 0.17, 0, 1);
      if (a > 0) {
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.beginPath(); g.rect(rect.x, rect.y, rect.w, rect.h); g.clip(); g.globalAlpha = a;
        if (i === 0) drawTissue(g, rect, 1, null, null, false);
        else drawLevelAt(g, child, ih / 100, rect.x + iw / 2, rect.y, t);
        g.restore(); g.globalAlpha = 1;
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.strokeStyle = `rgba(255,255,255,${0.9 - 0.6 * a})`; g.lineWidth = 1.5 * MI.dpr;
      const mw = Math.max(rect.w, 10 * MI.dpr), mh = Math.max(rect.h, 10 * MI.dpr);
      g.strokeRect(ax - mw / 2, ay - mh / 2, mw, mh);
      if (a < 0.5) {
        g.font = `${11 * MI.dpr}px "Zen Kaku Gothic New", sans-serif`; g.fillStyle = 'rgba(255,255,255,.85)'; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(i === 0 ? 'ここが「組織」の画面' : `ここを拡大すると「${stopName(i + 1)}」`, ax + mw / 2 + 6 * MI.dpr, ay);
      }
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  drawScaleBar(g, F);
}
// draw a level with `u` device px per unit, its x = 0 at screen x0 and y = 0 at screen y0
function drawLevelAt(g, lvl, u, x0, y0, t) {
  g.setTransform(u, 0, 0, u, x0, y0);
  MI.levelMag = u / (MI.cv.height / 100);
  const half = Math.max(x0, MI.cv.width - x0) / u;
  lvl.draw(g, half, t);
}

function drawScaleBar(g, F) {
  const Hp = MI.cv.height, d = MI.dpr, umPerPx = F / Hp;
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6];
  let len = nice[0]; for (const n of nice) if (n / umPerPx < 110 * d) len = n;
  const px = len / umPerPx, x = MI.cv.width - px - 14 * d, y = 14 * d;
  g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(x, y, px, 2 * d);
  g.font = `${10.5 * d}px "IBM Plex Mono", monospace`; g.textAlign = 'right'; g.textBaseline = 'top';
  const lab = len >= 1e6 ? len / 1e6 + ' m' : len >= 1e4 ? len / 1e4 + ' cm' : len >= 1e3 ? len / 1e3 + ' mm' : len + ' µm';
  g.fillText(lab, x + px, y + 5 * d);
}

// ---------- zoom buttons ----------
function buildZoomUI() {
  const box = document.getElementById('zoomStops'); box.innerHTML = ''; CAM.ui = null;
  ZOOM_STOPS.forEach(([, L], i) => {
    const b = document.createElement('button'); b.dataset.i = i; b.textContent = stopName(i);
    b.onclick = () => zoomTo(L);
    box.appendChild(b);
  });
  document.getElementById('zoomIn').onclick = () => { CAM.target = Math.max(LMIN, (CAM.target ?? CAM.L) - 0.5); };
  document.getElementById('zoomOut').onclick = () => { CAM.target = Math.min(LMAX, (CAM.target ?? CAM.L) + 0.5); CAM.focus = null; };
  syncZoomUI();
}
function syncZoomUI() {
  let best = 0, bd = 9;
  ZOOM_STOPS.forEach(([, L], i) => { const d = Math.abs(L - CAM.L); if (d < bd) { bd = d; best = i; } });
  const key = best + ':' + (CAM.L > 4.6);
  if (key === CAM.ui) return; CAM.ui = key;
  document.querySelectorAll('#zoomStops button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === best));
  const bw = document.getElementById('bodyWin');
  if (bw) bw.classList.toggle('away', CAM.L > 4.6);           // the body itself is on screen: hide the small window
}
