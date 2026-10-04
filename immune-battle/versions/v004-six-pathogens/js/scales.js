// scales.js — the larger zoom levels, drawn from the model state (no agents):
//   section (3 mm tall): the nasal mucosa / the skin around the cut, with the infected patch, mucus, glands, vessels
//   part (25 cm): a side cut of the head (nose → throat → swallowed to the stomach) / the forearm with the wound
//   body (2.1 m): the whole person (the figure from body.js)
// Units: height 100, x measured from the centre. Labels fade out when the level is magnified (MI.levelMag).
'use strict';

const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const frac6 = x => x <= 0 ? 0 : Math.min(1, Math.pow(x, 0.6));     // same "easier to see" curve as the tissue view

function lvLabel(g, s, x, y, opt) {
  opt = opt || {};
  g.font = `${opt.size || 2.3}px "Zen Kaku Gothic New", sans-serif`;
  g.fillStyle = opt.col || 'rgba(255,255,255,.7)'; g.textAlign = opt.align || 'left'; g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

// ---------- nasal mucosa, 3 mm ----------
function drawSectionFlu(g, half, t) {
  const y = SIM.y, o = SIM.o, infl = HILL(y.F, 0.3);
  const SURF = 31.2, EP = 1.0;
  g.fillStyle = '#0d151c'; g.fillRect(-half, 0, 2 * half, SURF);
  // lamina propria: glands, swollen venous spaces (a stuffy nose), immune cells
  let gr = g.createLinearGradient(0, SURF, 0, 86);
  gr.addColorStop(0, '#3a262c'); gr.addColorStop(1, '#2a1c21');
  g.fillStyle = gr; g.fillRect(-half, SURF, 2 * half, 86 - SURF);
  if (infl > 0.02) { g.fillStyle = `rgba(255,80,80,${0.12 * infl})`; g.fillRect(-half, SURF, 2 * half, 86 - SURF); }
  const i0 = Math.floor(-half / 16) - 1, i1 = Math.ceil(half / 16) + 1;
  for (let i = i0; i <= i1; i++) {
    const gx = i * 16 + hash(i) * 6, gy = 44 + hash(i + 7) * 14;
    g.strokeStyle = 'rgba(230,200,190,.25)'; g.lineWidth = 0.35;
    g.beginPath(); g.moveTo(gx, gy); g.quadraticCurveTo(gx + 2, (gy + SURF) / 2, gx + 1, SURF + EP); g.stroke();     // gland duct
    g.fillStyle = 'rgba(214,190,170,.35)';
    for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(gx + Math.cos(k) * 2.4, gy + Math.sin(k * 1.3) * 2.2, 1.2, 0.9, k, 0, 7); g.fill(); }
    const vx = i * 16 + 8 + hash(i + 3) * 4, vy = 64 + hash(i + 11) * 12, s = 1 + 0.7 * infl;   // venous sinus
    g.fillStyle = '#5a1c26'; g.beginPath(); g.ellipse(vx, vy, 3.5 * s, 2.2 * s, 0, 0, 7); g.fill();
  }
  // bone of the turbinate
  g.fillStyle = '#8f8a80'; g.fillRect(-half, 86, 2 * half, 14);
  g.fillStyle = 'rgba(60,55,50,.35)';
  for (let i = i0 * 3; i <= i1 * 3; i++) { g.beginPath(); g.arc(i * 5.3 + hash(i) * 3, 90 + hash(i + 2) * 8, 0.8 + hash(i + 4), 0, 7); g.fill(); }
  // immune cells gathering under the infected patch (blue dots)
  const R = 6 + 60 * (frac6(y.E + y.I) + frac6(y.D) * 0.6);
  const nImm = Math.round(10 + 50 * HILL(y.NK - SIM.P.inn + HILL(y.T, 1e6) * 6, 2));
  g.fillStyle = 'rgba(79,179,217,.8)';
  for (let k = 0; k < nImm; k++) { const x = (hash(k * 3.1) - 0.5) * 2 * Math.min(half, R * 1.6), yy = SURF + 3 + hash(k * 5.7) * 30; g.beginPath(); g.arc(x, yy, 0.45, 0, 7); g.fill(); }
  // epithelium, one segment per cell (≈10 µm). Infection spreads out from the centre in patches.
  const fD = frac6(y.D), fI = frac6(y.E + y.I), fR = frac6(y.R), span = 70;
  const segW = 1 / 3, s0 = Math.floor(-half / segW), s1 = Math.ceil(half / segW);
  for (let s = s0; s <= s1; s++) {
    const x = s * segW, d = Math.abs(x) + 10 * hash(s);
    let col = PAL.cell, h = EP;
    if (d < span * fD) { col = '#6f6468'; h = EP * 0.45; }
    else if (d < span * (fD + fI)) col = PAL.takenOver;
    else if (d < span * (fD + fI + fR)) col = '#9fd9ee';
    g.fillStyle = col; g.fillRect(x, SURF + EP - h, segW * 0.92, h);
  }
  // mucus (thicker with a runny nose) and virus in it
  const muc = 1.1 + 1.6 * HILL(o.cytokine || 0, 0.2);
  g.fillStyle = 'rgba(180,205,160,.28)'; g.fillRect(-half, SURF - muc, 2 * half, muc);
  const nV = vis(o.pathogen, 1e3, 14, 140);
  g.fillStyle = PAL.virus;
  for (let k = 0; k < nV; k++) {
    const x0 = (hash(k * 1.7) - 0.5) * 2 * Math.min(half, R * 1.4), x = ((x0 - t * 0.6 + 1e4 * half) % (2 * half)) - half;
    g.beginPath(); g.arc(x, SURF - muc * hash(k * 9.1), 0.18, 0, 7); g.fill();
  }
  const a = clamp(2.2 - MI.levelMag, 0, 1);
  if (a > 0) {
    g.globalAlpha = a;
    lvLabel(g, '← 粘液の流れ（のどへ。飲みこまれて胃酸で分解）', -half + 2, SURF - muc - 2.5, { col:'rgba(200,225,170,.8)' });
    lvLabel(g, '鼻の中の空気', -half + 2, 8);
    lvLabel(g, '粘膜（上皮）', -half + 2, SURF + 3);
    lvLabel(g, '腺（粘液を作る）', -half + 2, 48);
    lvLabel(g, infl > 0.4 ? '静脈がふくらみ、粘膜がはれる → 鼻づまり' : '静脈のすき間（ふくらむと鼻づまり）', -half + 2, 78);
    lvLabel(g, '骨（鼻甲介）', -half + 2, 93, { col:'rgba(30,25,20,.8)' });
    if (fI + fD > 0.01) lvLabel(g, '赤＝乗っ取られた細胞　灰色＝死んではがれた所　水色＝守りを固めた細胞', 2, 20, { align:'center', size:2.1 });
    g.globalAlpha = 1;
  }
}

// ---------- skin around the cut, 3 mm ----------
function drawSectionStaph(g, half, t) {
  const y = SIM.y, o = SIM.o, infl = o.inflam || 0, SURF = 30;
  g.fillStyle = '#0f141a'; g.fillRect(-half, 0, 2 * half, SURF);
  g.fillStyle = '#5a4038'; g.fillRect(-half, SURF + 3.3, 2 * half, 52);             // dermis
  let gr = g.createLinearGradient(0, SURF + 3.3, 0, 85);
  gr.addColorStop(0, '#4a3034'); gr.addColorStop(1, '#3a2629');
  g.fillStyle = gr; g.fillRect(-half, SURF + 3.3, 2 * half, 85 - SURF - 3.3);
  g.fillStyle = '#d8c39a'; g.fillRect(-half, 85, 2 * half, 15);                       // fat
  g.strokeStyle = 'rgba(160,130,90,.6)'; g.lineWidth = 0.25;
  for (let i = Math.floor(-half / 5) - 1; i < half / 5 + 1; i++) { g.beginPath(); g.ellipse(i * 5 + hash(i) * 2, 92, 2.6, 4, 0, 0, 7); g.stroke(); }
  g.fillStyle = '#c9a98f'; g.fillRect(-half, SURF, 2 * half, 3.3);                    // epidermis
  g.fillStyle = '#e0d2bd'; g.fillRect(-half, SURF, 2 * half, 0.6);
  // redness and swelling spreading in the dermis
  if (infl > 0.02) {
    const rr = 6 + 30 * infl;
    gr = g.createRadialGradient(0, SURF + 6, 0, 0, SURF + 6, rr);
    gr.addColorStop(0, `rgba(255,70,70,${0.45 * infl})`); gr.addColorStop(1, 'rgba(255,70,70,0)');
    g.fillStyle = gr; g.fillRect(-rr, SURF, 2 * rr, rr + 6);
  }
  // vessels (wider with inflammation)
  g.strokeStyle = 'rgba(140,50,62,.55)'; g.lineWidth = 0.3 + 0.5 * infl;
  for (let i = Math.floor(-half / 15) - 1; i < half / 15 + 1; i++) { const x = i * 15 + hash(i) * 5; g.beginPath(); g.moveTo(x, 80); g.bezierCurveTo(x + 2, 60, x - 2, 45, x + 1, SURF + 4); g.stroke(); }
  // the cut
  g.fillStyle = '#3e1d22'; g.beginPath(); g.moveTo(-0.9, SURF); g.lineTo(0.9, SURF); g.lineTo(0, SURF + 4.5); g.closePath(); g.fill();
  // neutrophils, pus (abscess), bacteria
  const nN = vis(y.N, 1e4, 12, 90), rN = 3 + 14 * HILL(y.N, 3e7);
  g.fillStyle = 'rgba(188,220,255,.8)';
  for (let k = 0; k < nN; k++) { const an = hash(k) * 6.28, r = rN * Math.sqrt(hash(k + 50)); g.beginPath(); g.arc(Math.cos(an) * r, SURF + 6 + Math.sin(an) * r * 0.7, 0.35, 0, 7); g.fill(); }
  if (o.pus > 0.05) {
    const pr = 1 + 9 * o.pus;
    g.fillStyle = 'rgba(207,199,154,.85)'; g.beginPath(); g.ellipse(0, SURF + 6, pr, pr * 0.7, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(235,215,160,.7)'; g.lineWidth = 0.5; g.stroke();
  }
  const B = o.pathogen, rb = clamp((Math.log10(Math.max(B, 1)) - 3) * 3, 0.5, 34), nB = vis(B, 30, 10, 110);
  g.fillStyle = PAL.bact;
  for (let k = 0; k < nB; k++) { const an = hash(k * 2.3) * 6.28, r = rb * Math.sqrt(hash(k * 4.1)); g.beginPath(); g.arc(Math.cos(an) * r, SURF + 5 + Math.sin(an) * r * 0.65, 0.22, 0, 7); g.fill(); }
  const a = clamp(2.2 - MI.levelMag, 0, 1);
  if (a > 0) {
    g.globalAlpha = a;
    lvLabel(g, '表皮', -half + 2, SURF + 1.7, { col:'rgba(40,30,20,.8)' });
    lvLabel(g, '真皮', -half + 2, 50);
    lvLabel(g, '皮下脂肪', -half + 2, 92, { col:'rgba(60,45,20,.85)' });
    lvLabel(g, '傷', 2, SURF - 2);
    if (infl > 0.2) lvLabel(g, '赤くはれた所（血管が広がり、水分がもれる）', 0, SURF + 6 + 6 + 30 * infl * 0.5, { align:'center', size:2.1 });
    if (o.pus > 0.2) lvLabel(g, 'うみのかたまり（膿瘍）', 12, SURF + 6, { size:2.1 });
    g.globalAlpha = 1;
  }
}

// ---------- side cut of the head, 25 cm ----------
function drawPartFlu(g, half, t) {
  const o = SIM.o, y = SIM.y, iv = clamp((Math.log10(Math.max(o.pathogen, 1)) - 3) / 7, 0, 1), infl = HILL(y.F, 0.3);
  g.fillStyle = '#0b0f13'; g.fillRect(-half, 0, 2 * half, 100);
  // head and neck outline
  g.fillStyle = '#4a3a3c'; g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 0.4;
  g.beginPath();
  g.moveTo(-12, 100); g.lineTo(-13, 80); g.quadraticCurveTo(-24, 79, -30, 74); g.quadraticCurveTo(-33, 68, -35, 64);
  g.lineTo(-34, 60); g.lineTo(-36, 57); g.lineTo(-36, 53); g.lineTo(-44, 48); g.lineTo(-37, 35); g.quadraticCurveTo(-35, 28, -33, 26);
  g.quadraticCurveTo(-30, 6, 4, 3); g.quadraticCurveTo(38, 4, 40, 34); g.quadraticCurveTo(41, 54, 30, 64); g.quadraticCurveTo(25, 75, 24, 100);
  g.closePath(); g.fill(); g.stroke();
  // brain and the temperature centre (hypothalamus)
  g.fillStyle = '#5a4c5e'; g.beginPath(); g.ellipse(6, 23, 29, 17, 0.05, 0, 7); g.fill();
  const fever = o.rawTemp >= 37.4;
  g.fillStyle = fever ? '#ffd25a' : '#8a7f6a'; g.beginPath(); g.arc(-3, 37, 1.3, 0, 7); g.fill();
  // airway: nasal cavity → nasopharynx → throat → larynx / trachea; esophagus behind
  g.fillStyle = '#16212a';
  g.beginPath();
  g.moveTo(-38, 50); g.lineTo(-35, 39); g.lineTo(-22, 37); g.lineTo(-6, 40); g.lineTo(4, 44); g.quadraticCurveTo(8, 50, 7, 60);
  g.lineTo(7, 76); g.lineTo(3, 78); g.lineTo(0, 76); g.lineTo(-2, 64); g.quadraticCurveTo(-4, 58, -9, 54); g.lineTo(-30, 53); g.closePath(); g.fill();
  g.fillStyle = '#16212a'; g.fillRect(-6, 76, 5, 24);                                             // trachea
  g.fillStyle = '#5d3a3e'; g.fillRect(2, 78, 4, 22);                                               // esophagus (closed)
  // tongue and palate
  g.fillStyle = '#7a4a50'; g.beginPath(); g.ellipse(-17, 60, 14, 4.5, 0.08, 0, 7); g.fill();
  g.fillStyle = '#6a5a58'; g.fillRect(-32, 53.2, 24, 1.4);
  // turbinates
  g.fillStyle = '#6a4a4e';
  for (const [x, yy, rx, ry] of [[-21, 41.3, 7, 1.4], [-19, 45.2, 9, 1.7], [-17, 49.6, 10, 1.6]]) { g.beginPath(); g.ellipse(x, yy, rx, ry, 0, 0, 7); g.fill(); }
  // mucosa lining: swollen and red where infected
  const mucCol = iv > 0.05 ? `rgba(255,${Math.round(150 - 90 * iv)},${Math.round(160 - 60 * iv)},${0.6 + 0.4 * iv})` : 'rgba(215,154,160,.7)';
  g.strokeStyle = mucCol; g.lineWidth = 0.7 + 1.2 * infl;
  g.beginPath(); g.moveTo(-36, 40); g.lineTo(-22, 37.5); g.lineTo(-6, 40.5); g.lineTo(4, 44.5); g.quadraticCurveTo(8, 50, 7.3, 60); g.lineTo(7.3, 76); g.stroke();
  if (iv > 0.05) {
    const gr = g.createRadialGradient(-14, 46, 0, -14, 46, 6 + 20 * iv);
    gr.addColorStop(0, `rgba(255,79,123,${0.45 * iv})`); gr.addColorStop(1, 'rgba(255,79,123,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(-14, 46, 6 + 20 * iv, 0, 7); g.fill();
  }
  // mucus flow: nose → throat → swallowed into the esophagus → stomach
  g.strokeStyle = 'rgba(200,225,170,.8)'; g.lineWidth = 0.55; g.setLineDash([1.2, 1.2]); g.lineDashOffset = -t * 3;
  g.beginPath(); g.moveTo(-30, 47); g.lineTo(-4, 47); g.quadraticCurveTo(5, 49, 5, 58); g.lineTo(5, 76); g.lineTo(4, 98); g.stroke(); g.setLineDash([]);
  // lymph nodes in the neck
  g.fillStyle = `rgba(79,179,217,${0.5 + 0.5 * o.lymph})`;
  for (const [x, yy] of [[15, 76], [19, 82], [13, 87]]) { g.beginPath(); g.arc(x, yy, 1 + 2.4 * o.lymph, 0, 7); g.fill(); }
  // fever: signal molecules reach the temperature centre
  if (fever) {
    g.strokeStyle = 'rgba(255,210,90,.85)'; g.lineWidth = 0.5; g.setLineDash([0.8, 1]); g.lineDashOffset = -t * 4;
    g.beginPath(); g.moveTo(-14, 44); g.quadraticCurveTo(-12, 38, -3, 37); g.stroke(); g.setLineDash([]);
  }
  if (o.lung > 0.2) {
    g.strokeStyle = `rgba(255,79,123,${0.5 + 0.5 * o.lung})`; g.lineWidth = 1; g.beginPath(); g.moveTo(-3.5, 80); g.lineTo(-3.5, 97); g.stroke();
    g.beginPath(); g.moveTo(-5.5, 94); g.lineTo(-3.5, 98); g.lineTo(-1.5, 94); g.stroke();
  }
  const a = clamp(2.2 - MI.levelMag, 0, 1);
  if (a > 0) {
    g.globalAlpha = a;
    lvLabel(g, '頭を横から見た断面（左が顔）', -half + 2, 4, { col:'rgba(255,255,255,.55)' });
    lvLabel(g, '鼻の中（鼻腔）', -30, 33);
    lvLabel(g, 'のど（咽頭）', 10, 58);
    lvLabel(g, '気管', -18, 92); lvLabel(g, '食道 → 胃', 8, 96, { col:'rgba(200,225,170,.9)' });
    lvLabel(g, '脳', 6, 18);
    lvLabel(g, '首のリンパ節', 20, 72, { col:'rgba(130,200,235,.9)' });
    const rx = Math.min(43, half - 42);                      // notes go to the right of the head
    lvLabel(g, '粘液はのどへ流れ、', rx, 64, { col:'rgba(200,225,170,.85)', size:2.1 });
    lvLabel(g, '飲みこまれて胃酸で分解される', rx, 67, { col:'rgba(200,225,170,.85)', size:2.1 });
    if (fever) {
      lvLabel(g, '体温の中枢（視床下部）:', rx, 34, { col:'rgba(255,210,90,.95)', size:2.1 });
      lvLabel(g, '合図の物質が届くと「目標の体温」が上がる', rx, 37, { col:'rgba(255,210,90,.95)', size:2.1 });
    }
    if (o.lung > 0.2) lvLabel(g, '気管支・肺へ広がるおそれ', 0, 99, { col:'#ff8fa3', size:2.1 });
    g.globalAlpha = 1;
  }
}

// ---------- forearm, 25 cm ----------
function drawPartStaph(g, half, t) {
  const o = SIM.o, B = o.pathogen, infl = o.inflam || 0, wx = -4, wy = 42;
  g.fillStyle = '#0b0f13'; g.fillRect(-half, 0, 2 * half, 100);
  g.fillStyle = '#5a4640'; g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 0.4;
  g.beginPath(); g.moveTo(-15, 0); g.quadraticCurveTo(-16, 40, -11, 78); g.lineTo(-13, 98); g.lineTo(12, 98); g.lineTo(11, 78);
  g.quadraticCurveTo(16, 40, 15, 0); g.closePath(); g.fill(); g.stroke();
  if (infl > 0.02) {
    const rr = 2 + 20 * infl, gr = g.createRadialGradient(wx, wy, 0, wx, wy, rr);
    gr.addColorStop(0, `rgba(255,70,70,${0.7 * infl})`); gr.addColorStop(1, 'rgba(255,70,70,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(wx, wy, rr, rr * 1.3, 0, 0, 7); g.fill();
  }
  g.strokeStyle = '#ff6b6b'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(wx - 1.6, wy - 0.6); g.lineTo(wx + 1.6, wy + 0.6); g.stroke();
  if (o.pus > 0.1) { g.fillStyle = `rgba(240,225,140,${o.pus})`; g.beginPath(); g.arc(wx, wy, 0.4 + 1.6 * o.pus, 0, 7); g.fill(); }
  const streak = infl > 0.5 && B > 1e8;                     // lymphangitis: a red line toward the armpit
  if (streak) { g.strokeStyle = 'rgba(255,90,90,.75)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(wx, wy - 2); g.bezierCurveTo(wx + 2, 30, wx - 1, 15, wx + 1, 0); g.stroke(); }
  if (o.blood > 0.15) { g.strokeStyle = 'rgba(255,154,46,.7)'; g.lineWidth = 0.6; g.setLineDash([1, 1]); g.lineDashOffset = -t * 4; g.beginPath(); g.moveTo(6, 98); g.quadraticCurveTo(9, 50, 6, 0); g.stroke(); g.setLineDash([]); }
  const a = clamp(2.2 - MI.levelMag, 0, 1);
  if (a > 0) {
    g.globalAlpha = a;
    lvLabel(g, 'ひじ ↑', 2, 3); lvLabel(g, '手', 0, 95, { align:'center' });
    lvLabel(g, '傷', wx + 3, wy);
    if (infl > 0.2) lvLabel(g, '赤くはれて熱をもつ', wx + 3, wy + 6, { size:2.1 });
    if (streak) lvLabel(g, '赤い筋（リンパ管の炎症）→ わきのリンパ節へ', wx + 3, 20, { col:'#ff9a9a', size:2.1 });
    if (o.blood > 0.15) lvLabel(g, '血液の中に菌（菌血症）', 8, 70, { col:'#ffb066', size:2.1 });
    g.globalAlpha = 1;
  }
}

// ---------- whole body, 2.1 m ----------
const FIG_K = 0.623, FIG_Y0 = 10.9;            // figure units (100 × 140) → level units
function drawBodyLevel(g, half, t) {
  g.fillStyle = '#0b0f13'; g.fillRect(-half, 0, 2 * half, 100);
  g.save(); g.translate(-50 * FIG_K, FIG_Y0); g.scale(FIG_K, FIG_K);
  drawFigure(g, t, false);
  g.restore();
  const a = clamp(2.2 - MI.levelMag, 0, 1);
  if (a > 0 && SIM.o) {
    g.globalAlpha = a;
    const o = SIM.o, lines = [`体温 ${o.temp.toFixed(1)}℃`].concat(o.sym.length ? o.sym : ['症状なし']);
    lines.forEach((s, i) => lvLabel(g, s, 18, 30 + i * 3.4, { size:2.4, col:i ? 'rgba(255,200,210,.9)' : '#ffd25a' }));
    g.globalAlpha = 1;
  }
}
