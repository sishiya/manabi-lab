// body.js — the small window: the whole person. Where the infection is (magnifier), fever, swollen lymph nodes,
// lungs (influenza) or redness / pus / blood (bacteria). Drawn on a 100 × 140 unit canvas.
'use strict';

const BW = { cv:null, ctx:null, sc:1, t:0 };

function initBody(cv) { BW.cv = cv; BW.ctx = cv.getContext('2d'); resizeBody(); }
function resizeBody() {
  const r = BW.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  BW.cv.width = Math.max(1, Math.round(r.width * dpr)); BW.cv.height = Math.max(1, Math.round(r.height * dpr));
  BW.sc = Math.min(BW.cv.width / 100, BW.cv.height / 140);
}

function drawBody(dt) {
  BW.t += dt;
  const g = BW.ctx;
  if (!SIM.o) return;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, BW.cv.width, BW.cv.height);
  g.setTransform(BW.sc, 0, 0, BW.sc, (BW.cv.width - 100 * BW.sc) / 2, 0);
  drawFigure(g, BW.t, true);
}
// the figure in its own 100 × 140 units (also used by the whole-body zoom level). small = the corner window
function drawFigure(g, t, small) {
  const o = SIM.o, pk = SIM.pk;
  const fever = clamp((o.temp - 37) / 2.3, 0, 1);
  // silhouette
  const skin = `rgb(${Math.round(70 + 60 * fever)},${Math.round(84 - 10 * fever)},${Math.round(96 - 20 * fever)})`;
  g.fillStyle = skin; g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 0.6;
  g.beginPath(); g.arc(50, 15, 10, 0, 7); g.fill(); g.stroke();                                   // head
  g.fillRect(46, 24, 8, 6);                                                                         // neck
  limb(g, 36, 33, 20, 74, 5.2); limb(g, 64, 33, 80, 74, 5.2);                                       // arms
  limb(g, 44, 82, 40, 135, 6.4); limb(g, 56, 82, 60, 135, 6.4);                                     // legs
  rr(g, 33, 29, 34, 56, 9); g.fill(); g.stroke();                                                  // torso
  // face
  g.fillStyle = '#0d1210';
  const sick = clamp(fever + (o.sym.length > 2 ? 0.3 : 0), 0, 1);
  for (const x of [46, 54]) { g.beginPath(); g.ellipse(x, 14, 1.1, 1.1 - 0.6 * sick, 0, 0, 7); g.fill(); }
  g.strokeStyle = '#0d1210'; g.lineWidth = 0.7;
  g.beginPath(); g.moveTo(46.5, 19.5); g.quadraticCurveTo(50, 19.5 + 2 * (0.5 - sick) * 2, 53.5, 19.5); g.stroke();
  if (fever > 0.15) {
    g.fillStyle = `rgba(255,90,90,${0.55 * fever})`;
    for (const x of [44, 56]) { g.beginPath(); g.ellipse(x, 17, 2, 1.1, 0, 0, 7); g.fill(); }
  }
  if (fever > 0.5) { g.fillStyle = 'rgba(140,200,255,.8)'; g.beginPath(); g.ellipse(60.5, 9 + (t * 3) % 4, 0.9, 1.3, 0, 0, 7); g.fill(); }

  let site;
  const bs = SIM.path.bodySite, v = clamp(Math.log10(Math.max(o.pathogen, 1)) / 10, 0, 1);
  if (bs === 'nose' || bs === 'lung') {
    // lungs (red where they are affected)
    const lungK = bs === 'lung' ? clamp(o.damage * 1.2, 0, 1) : o.lung;
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 0.5;
    g.fillStyle = `rgba(255,90,90,${0.75 * lungK})`;
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(50 + s * 7, 46, 5.2, 10, s * 0.12, 0, 7); g.fill(); g.stroke(); }
    g.beginPath(); g.moveTo(50, 27); g.lineTo(50, 37); g.stroke();                                // trachea
  }
  if (bs === 'nose') {
    // nose and throat: brighter with more virus
    g.fillStyle = `rgba(255,79,123,${0.15 + 0.8 * v})`;
    g.beginPath(); g.ellipse(50, 16.5, 2.2, 3, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(50, 24, 1.6, 3.6, 0, 0, 7); g.fill();
    site = { x:50, y:19 };
    lymph(g, [[44.5, 27.5], [55.5, 27.5]], o.lymph);
  } else if (bs === 'lung') {
    g.fillStyle = `rgba(255,154,46,${0.2 + 0.7 * v})`; g.beginPath(); g.ellipse(44, 52, 2.6, 3.4, 0, 0, 7); g.fill();   // the lower right lobe
    site = { x:44, y:52 };
    lymph(g, [[47, 38], [53, 38]], o.lymph);
  } else if (bs === 'gut') {
    // small intestine coiled in the belly
    g.strokeStyle = `rgba(255,79,123,${0.25 + 0.7 * clamp(o.damage * 3, 0, 1)})`; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(42, 64); for (let k = 0; k < 5; k++) g.quadraticCurveTo(k % 2 ? 40 : 60, 66 + k * 3, 50, 67.5 + k * 3); g.stroke();
    if (o.sym.some(s => /嘔吐/.test(s))) { g.fillStyle = 'rgba(200,220,120,.8)'; g.beginPath(); g.ellipse(50 - 8 - (t * 4) % 5, 21, 1.4, 0.9, 0, 0, 7); g.fill(); }
    site = { x:50, y:70 };
    lymph(g, [[47, 62], [54, 63]], o.lymph);
  } else if (bs === 'bladder') {
    const red = o.inflam || 0;
    g.fillStyle = `rgba(255,154,46,${0.2 + 0.6 * red})`; g.beginPath(); g.ellipse(50, 80, 4.2, 3.2, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(44, 56); g.lineTo(47, 78); g.moveTo(56, 56); g.lineTo(53, 78); g.stroke();   // ureters
    g.fillStyle = `rgba(255,90,90,${0.15 + 0.7 * (o.kidney || 0)})`;
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(50 + s * 7, 53, 2, 3, 0, 0, 7); g.fill(); }   // kidneys
    site = { x:50, y:80 };
    lymph(g, [[45, 74], [55, 74]], o.lymph);
  } else {
    // wound on the right forearm (viewer's left), redness, pus; armpit lymph node; bacteria in the blood
    const wx = 25, wy = 60;
    const red = o.inflam || 0;
    if (red > 0.02) {
      const gr = g.createRadialGradient(wx, wy, 0, wx, wy, 3 + 9 * red);
      gr.addColorStop(0, `rgba(255,70,70,${0.85 * red})`); gr.addColorStop(1, 'rgba(255,70,70,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(wx, wy, 3 + 9 * red, 0, 7); g.fill();
    }
    g.strokeStyle = '#ff6b6b'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(wx - 2.2, wy - 1.3); g.lineTo(wx + 2.2, wy + 1.3); g.stroke();
    if (o.pus > 0.1) { g.fillStyle = `rgba(240,225,140,${o.pus})`; g.beginPath(); g.arc(wx, wy, 0.8 + 1.8 * o.pus, 0, 7); g.fill(); }
    site = { x:wx, y:wy };
    lymph(g, [[35.5, 36]], o.lymph);
  }
  if (SIM.P.vaccine) {                                    // where the vaccine was injected (upper arm)
    const v = vacSignal(SIM.P, SIM.t) / SIM.P.vaccine.amp;
    g.fillStyle = `rgba(159,217,238,${0.5 + 0.5 * Math.min(1, v)})`; g.beginPath(); g.arc(33.5, 41, 1.4 + 1.2 * Math.min(1, v), 0, 7); g.fill();
    g.strokeStyle = 'rgba(159,217,238,.9)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(26, 37); g.lineTo(31.5, 40); g.stroke();
  }
  if (o.blood > 0.15) {                                   // bacteria travelling in the blood (bacteremia)
    g.strokeStyle = `rgba(255,154,46,${0.25 + 0.6 * o.blood})`; g.lineWidth = 0.8; g.setLineDash([1.5, 1.5]); g.lineDashOffset = -t * 6;
    g.beginPath(); g.moveTo(52, 44); g.lineTo(28, 40); g.lineTo(22, 70); g.moveTo(52, 44); g.lineTo(72, 40); g.lineTo(78, 70);
    g.moveTo(52, 44); g.lineTo(46, 80); g.lineTo(42, 130); g.moveTo(52, 44); g.lineTo(56, 80); g.lineTo(58, 130); g.moveTo(52, 44); g.lineTo(50, 12); g.stroke();
    g.setLineDash([]);
    g.fillStyle = `rgba(255,90,90,${0.5 + 0.4 * Math.sin(t * 7)})`; g.beginPath(); g.arc(53, 44, 2.2, 0, 7); g.fill();
  }
  // why fever: signal molecules (cytokines) travel in the blood to the brain's temperature centre
  if (o.rawTemp >= 37.4) {
    g.strokeStyle = 'rgba(255,210,90,.75)'; g.lineWidth = 0.6; g.setLineDash([1.2, 1.4]); g.lineDashOffset = -t * 5;
    g.beginPath(); g.moveTo(site.x, site.y); g.quadraticCurveTo((site.x + 50) / 2 + 8, (site.y + 9) / 2, 50, 9); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(255,210,90,.95)'; g.beginPath(); g.arc(50, 9, 1.4, 0, 7); g.fill();
    if (!small) { g.font = '3.6px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('合図の物質 → 脳の体温中枢', 62, 6); }
  }
  if (!small) return;
  // magnifier: "the big view is here"
  const pulse = 1 + 0.08 * Math.sin(t * 3);
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.7;
  g.beginPath(); g.arc(site.x, site.y, 4.2 * pulse, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(site.x + 3, site.y + 3); g.lineTo(site.x + 5.5, site.y + 5.5); g.stroke();
  // thermometer
  const tx = 88, top = 50, bot = 112, k = clamp((o.temp - 36) / 5, 0, 1);
  g.fillStyle = 'rgba(255,255,255,.12)'; rr(g, tx - 2, top, 4, bot - top, 2); g.fill();
  g.fillStyle = o.temp >= 38.5 ? '#ff5b5b' : o.temp >= 37.5 ? '#ff9a5b' : '#7fd3a0';
  rr(g, tx - 1.2, bot - (bot - top) * k, 2.4, (bot - top) * k, 1.2); g.fill();
  g.beginPath(); g.arc(tx, bot + 2.5, 3.2, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '4.2px "IBM Plex Mono", monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of [37, 38, 39, 40]) { const yy = bot - (bot - top) * (v - 36) / 5; g.fillRect(tx - 3.6, yy, 1.4, 0.3); g.fillText(v, tx - 4.4, yy); }
  g.textAlign = 'left';
}

function limb(g, x0, y0, x1, y1, w) {
  g.save(); g.lineCap = 'round'; g.lineWidth = w; g.strokeStyle = g.fillStyle;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore();
}
function rr(g, x, y, w, h, r) { rrect(g, x, y, w, h, r); }
function lymph(g, pts, k) {
  g.fillStyle = `rgba(79,179,217,${0.35 + 0.6 * k})`; g.strokeStyle = 'rgba(190,235,255,.7)'; g.lineWidth = 0.3;
  for (const [x, y] of pts) { g.beginPath(); g.ellipse(x, y, 1.2 + 1.6 * k, 0.9 + 1.2 * k, 0, 0, 7); g.fill(); g.stroke(); }
}
