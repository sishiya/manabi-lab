// 目のなかの光の道 — 描画（目の断面・光線・物・メガネ・拡大鏡・見え方）
'use strict';

const C = {
  bg: '#13202e', ink: '#e8f0f4', muted: '#8fa3b0', acc: '#7fd4ff',
  ray: '255,214,106', rayTop: '127,224,255',
  sclera: '#dfe6ea', cornea: 'rgba(160,220,255,0.28)', lens: 'rgba(200,235,255,0.30)',
  iris: '#7a5232', retina: '#d9606a', vitreous: 'rgba(120,160,190,0.07)', nerve: '#e8cf8a',
};
const LAY = {};

// 画面の配置。目の中は実寸の比、目の外の距離は対数で縮める
function layout(W, H) {
  const narrow = W < 720;
  const top = narrow ? 8 : 70, bottom = 16;
  const s = narrow ? Math.min((W * 0.5) / 27, (H - top - bottom) * 0.9 / 27) : Math.min(W * 0.33 / 27, (H - top - bottom) * 0.78 / 27);
  Object.assign(LAY, { W, H, narrow, s });
  LAY.ox = narrow ? W - 25.5 * s - 8 : W * 0.5;
  LAY.oy = narrow ? Math.max(top + 13 * s, H * 0.42) : top + (H - top - bottom) / 2;   // 狭い画面: 目盛りが下の拡大鏡にかからないよう少し上に
  LAY.trackR = LAY.ox + OPT.glassesZ * s - 18;
  LAY.trackL = 16;
  LAY.infX = LAY.trackL + 14;
}
const X = z => LAY.ox + z * LAY.s, Y = y => LAY.oy - y * LAY.s;
function dToX(d) {
  if (!isFinite(d)) return LAY.infX;
  const f = Math.log(d / D_MIN) / Math.log(D_MAX / D_MIN);
  return LAY.trackR - f * (LAY.trackR - LAY.infX - 34);
}
function xToD(x) {
  if (x < LAY.infX + 20) return Infinity;
  const f = (LAY.trackR - x) / (LAY.trackR - LAY.infX - 34);
  return Math.min(D_MAX, Math.max(D_MIN, D_MIN * Math.pow(D_MAX / D_MIN, f)));
}

function pathSurface(g, s, y0, y1, n = 40) {
  for (let i = 0; i <= n; i++) {
    const y = y0 + (y1 - y0) * i / n, z = s.z + sag(s, y);
    i ? g.lineTo(X(z), Y(y)) : g.moveTo(X(z), Y(y));
  }
}
function glow(g, on) { if (on) { g.shadowColor = C.acc; g.shadowBlur = 14 + 6 * Math.sin(S.t * 4); } else g.shadowBlur = 0; }

// 目の解剖（断面）
function drawEye(g, eye) {
  const s = LAY.s, R = OPT.retinaR, cz = eye.retinaC;
  const [c1, c2, l1, l2] = eye.surfs, limb = 5.8;
  // 強膜（白目）: 網膜の外側の円。前は角膜のふち（輪部）へなめらかにつなぐ
  const Rs = R + 0.55, zEdge = c1.z + sag(c1, limb);
  const a0 = Math.acos(Math.max(-1, Math.min(1, (zEdge + 1.2 - cz) / Rs)));   // 強膜の円が角膜のふちより 1.2 mm 奥になる角度
  const arc = (from, to, n = 80) => { const pts = []; for (let i = 0; i <= n; i++) { const a = from + (to - from) * i / n; pts.push([cz + Rs * Math.cos(a), Rs * Math.sin(a)]); } return pts; };
  const back = arc(a0, -a0), top0 = back[0], bot0 = back[back.length - 1];
  const scleraPath = () => {
    g.moveTo(X(zEdge), Y(limb));
    g.quadraticCurveTo(X(zEdge + 0.6), Y(limb + 0.4), X(top0[0]), Y(top0[1]));
    for (const p of back) g.lineTo(X(p[0]), Y(p[1]));
    g.quadraticCurveTo(X(zEdge + 0.6), Y(-limb - 0.4), X(zEdge), Y(-limb));
  };
  g.beginPath(); scleraPath(); pathSurface(g, c1, -limb, limb); g.closePath();
  g.fillStyle = C.vitreous; g.fill();
  glow(g, S.hl === 'sclera');
  g.lineWidth = Math.max(2, 0.45 * s); g.strokeStyle = C.sclera; g.globalAlpha = 0.85;
  g.beginPath(); scleraPath(); g.stroke(); g.globalAlpha = 1; glow(g, false);

  // 網膜: 水晶体のうしろから奥まで
  const zMin = l2.z + 1.5, aR = Math.acos(Math.max(-1, Math.min(1, (zMin - cz) / R)));
  glow(g, S.hl === 'retina');
  g.strokeStyle = C.retina; g.lineWidth = Math.max(2, 0.3 * s);
  g.beginPath();
  for (let i = 0; i <= 80; i++) { const a = -aR + 2 * aR * i / 80, z = cz + R * Math.cos(a), y = R * Math.sin(a), dip = Math.exp(-(y * y) / 0.25) * 0.18; const p = [X(z + dip), Y(y)]; i ? g.lineTo(...p) : g.moveTo(...p); }
  g.stroke(); glow(g, false);
  // 視神経（場所を示すための絵。実際は鼻の側）
  const na = -0.30, nw = 0.075;
  g.fillStyle = C.nerve; g.globalAlpha = S.hl === 'nerve' ? 0.9 : 0.55;
  g.beginPath();
  g.moveTo(X(cz + R * Math.cos(na - nw)), Y(R * Math.sin(na - nw)));
  g.lineTo(X(cz + (R + 4) * Math.cos(na - nw * 0.8)), Y((R + 4) * Math.sin(na - nw * 0.8)));
  g.lineTo(X(cz + (R + 4) * Math.cos(na + nw * 0.8)), Y((R + 4) * Math.sin(na + nw * 0.8)));
  g.lineTo(X(cz + R * Math.cos(na + nw)), Y(R * Math.sin(na + nw)));
  g.closePath(); g.fill(); g.globalAlpha = 1;
  LAY.nerve = { a: na, w: nw };

  // 角膜
  glow(g, S.hl === 'cornea');
  g.beginPath(); pathSurface(g, c1, -limb, limb); pathSurface(g, c2, limb, -limb); g.closePath();
  g.fillStyle = C.cornea; g.fill(); g.strokeStyle = 'rgba(190,235,255,0.8)'; g.lineWidth = 1.2; g.stroke(); glow(g, false);

  // 毛様体とチン小帯
  const zl = (l1.z + l2.z) / 2, ye = lensEdge(eye);
  g.fillStyle = '#9b5f58'; g.globalAlpha = S.hl === 'ciliary' ? 1 : 0.75;
  for (const sg of [1, -1]) {
    g.beginPath(); g.moveTo(X(eye.stopZ + 0.2), Y(sg * 6.1)); g.lineTo(X(zl + 2.6), Y(sg * 6.6)); g.lineTo(X(zl + 1.2), Y(sg * 5.75)); g.lineTo(X(eye.stopZ + 0.6), Y(sg * 5.6)); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(230,230,230,0.5)'; g.lineWidth = 0.8;
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(X(zl + k * 0.6), Y(sg * ye)); g.lineTo(X(zl + 0.6 + k * 0.5), Y(sg * 5.8)); g.stroke(); }
  }
  g.globalAlpha = 1;

  // 水晶体
  glow(g, S.hl === 'lens');
  g.beginPath(); pathSurface(g, l1, -ye, ye); pathSurface(g, l2, ye, -ye); g.closePath();
  g.fillStyle = C.lens; g.fill(); g.strokeStyle = 'rgba(210,240,255,0.85)'; g.lineWidth = 1.2; g.stroke(); glow(g, false);

  // 虹彩
  glow(g, S.hl === 'iris');
  g.fillStyle = C.iris; const it = 0.45;
  for (const sg of [1, -1]) { g.fillRect(X(eye.stopZ - it / 2), Math.min(Y(sg * eye.stopR), Y(sg * 6.0)), it * s, Math.abs(Y(sg * 6.0) - Y(sg * eye.stopR))); }
  glow(g, false);
}
// 水晶体のふち（前とうしろの面の、描くときの端）
function lensEdge(eye) { return 4.6; }

// 名前の小さい札
function drawLabels(g, eye) {
  if (LAY.s < 9) return;
  g.font = `12px ${getComputedStyle(document.documentElement).getPropertyValue('--f-body')}`;
  g.fillStyle = C.muted; g.textAlign = 'center';
  const R = OPT.retinaR, cz = eye.retinaC;
  const lab = [[L('角膜', 'cornea'), X(-1.6), Y(6.2)], [L('水晶体', 'lens'), X((eye.surfs[2].z + eye.surfs[3].z) / 2), Y(-5.6) + 34], [L('虹彩', 'iris'), X(eye.stopZ) + 4, Y(7.6) - 12],
    [L('網膜', 'retina'), X(cz + R * Math.cos(0.55)) + 16, Y(R * Math.sin(0.55)) - 10], [L('視神経', 'optic nerve'), X(cz + (R + 4) * Math.cos(-0.30)) + 6, Y((R + 4) * Math.sin(-0.30)) + 16]];
  for (const [t, x, y] of lab) g.fillText(t, x, y);
}

// 物（矢印）と距離の目盛り
function drawObject(g) {
  const y0 = LAY.oy, x = dToX(S.d);
  g.strokeStyle = 'rgba(232,240,244,0.18)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(LAY.trackL, y0); g.lineTo(X(OPT.L0 + 3), y0); g.stroke();
  g.font = `11px ${getComputedStyle(document.documentElement).getPropertyValue('--f-mono')}`; g.textAlign = 'center'; g.fillStyle = C.muted;
  for (const d of (LAY.narrow ? [250] : [100, 250, 500, 1000, 3000])) { const xx = dToX(d); g.fillRect(xx - 0.5, y0 + 4, 1, 6); g.fillText(fmtD(d), xx, y0 + 22); }
  g.fillText(L('遠く', 'far'), LAY.infX, y0 + 22);
  if (!LAY.narrow) g.fillText(L('（目の外の距離は縮めて描いています）', '(distances outside the eye are squeezed)'), (LAY.trackL + LAY.trackR) / 2, y0 + 40);
  // 矢印
  const hpx = 46; glow(g, S.hl === 'object');
  g.strokeStyle = `rgb(${C.ray})`; g.fillStyle = `rgb(${C.ray})`; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 - hpx); g.stroke();
  g.beginPath(); g.moveTo(x, y0 - hpx - 8); g.lineTo(x - 7, y0 - hpx + 4); g.lineTo(x + 7, y0 - hpx + 4); g.closePath();
  g.fillStyle = S.showTop ? `rgb(${C.rayTop})` : `rgb(${C.ray})`; g.fill();
  g.beginPath(); g.arc(x, y0, 6, 0, Math.PI * 2); g.fillStyle = `rgb(${C.ray})`; g.fill();
  glow(g, false);
  g.fillStyle = C.ink; g.font = `13px ${getComputedStyle(document.documentElement).getPropertyValue('--f-body')}`;
  g.fillText(fmtD(S.d), x, y0 - hpx - 16);
  LAY.objX = x; LAY.objTop = y0 - hpx;
}

// メガネ
function drawGlasses(g) {
  if (S.P == null) return;
  const z = OPT.glassesZ, h = 7, w = 0.6 + Math.min(2.4, Math.abs(S.P) * 0.25);
  glow(g, S.hl === 'glasses');
  g.beginPath();
  if (S.P < 0) { g.moveTo(X(z - w), Y(h)); g.lineTo(X(z + w), Y(h)); g.quadraticCurveTo(X(z + 0.3), Y(0), X(z + w), Y(-h)); g.lineTo(X(z - w), Y(-h)); g.quadraticCurveTo(X(z - 0.3), Y(0), X(z - w), Y(h)); }
  else { g.moveTo(X(z), Y(h)); g.quadraticCurveTo(X(z + w * 2), Y(0), X(z), Y(-h)); g.quadraticCurveTo(X(z - w * 2), Y(0), X(z), Y(h)); }
  g.fillStyle = 'rgba(200,230,255,0.25)'; g.fill(); g.strokeStyle = 'rgba(220,240,255,0.9)'; g.lineWidth = 1.3; g.stroke(); glow(g, false);
  g.fillStyle = C.ink; g.textAlign = 'center'; g.font = `12px ${getComputedStyle(document.documentElement).getPropertyValue('--f-mono')}`;
  g.fillText(fmtDi(S.P) + (S.Ps !== S.Pw ? L(`（${S.sec === 'w' ? astigOf().weak : astigOf().strong}）`, ` (${S.sec === 'w' ? astigOf().weak : astigOf().strong})`) : ''), X(z), Y(-h) + 16);   // レンズの下（上は物の距離の文字と重なる）
}
// 乱視のとき: いま描いている断面の名前
function drawSection(g) {
  const a = astigOf(); if (!a.on) return;
  const strong = S.sec !== 'w', dir = strong ? a.strong : a.weak;
  g.fillStyle = strong ? '#ffb070' : '#9be59b';
  if (LAY.narrow) {   // 狭い画面: 短く、右上に
    g.font = `12px ${getComputedStyle(document.documentElement).getPropertyValue('--f-body')}`; g.textAlign = 'right';
    g.fillText(L(`${dir}の断面・${strong ? '強い向き' : 'ふつうの向き'}`, `${dir} slice · ${strong ? 'stronger' : 'normal'}`), LAY.W - 6, 13);
    return;
  }
  g.font = `13px ${getComputedStyle(document.documentElement).getPropertyValue('--f-body')}`; g.textAlign = 'center';
  g.fillText(L(`${dir}の向きに切った断面・角膜${strong ? `が ${a.P} D 強い向き` : 'はふつうの向き'}`, `Slice in the ${dir} direction · cornea ${strong ? `${a.P} D stronger here` : 'normal here'}`), X(OPT.L0 / 2), Y(OPT.retinaR + 1.6));
}

// 光線の束。目の外は物の印から引く（距離を縮めているので向きは絵）。目の中は計算どおり
function drawBundle(g, b, rgb, fromX, fromY, inf) {
  for (const tr of b.rays) {
    const p = tr.pts, blocked = !!tr.blocked;
    g.strokeStyle = `rgba(${rgb},${blocked ? 0.18 : 0.6})`; g.lineWidth = 1;
    g.beginPath();
    const q = p[1];   // メガネか角膜の点
    if (inf) {
      const sl = (p[1].y - p[0].y) / (p[1].z - p[0].z);
      g.moveTo(fromX, Y(q.y + sl * ((fromX - X(q.z)) / LAY.s)));
    } else g.moveTo(fromX, fromY);
    for (let i = 1; i < p.length; i++) g.lineTo(X(p[i].z), Y(p[i].y));
    g.stroke();
  }
}

// 網膜のあたりの拡大鏡
function drawLoupe(g, eye, bundles) {
  const r = LAY.narrow ? 44 : 74;
  const cx = LAY.narrow ? r + 10 : LAY.W - r - 20, cy = LAY.narrow ? LAY.H - r - 20 : Math.min(LAY.H - r - 26, LAY.oy + 4 * LAY.s + r);
  if (cy - r < 0) return;
  const zc = eye.L - 0.25, span = 0.9, k = r / span;   // 中心から span mm がふちに来る
  const LX = z => cx + (z - zc) * k, LY = y => cy - y * k;
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = '#0c151f'; g.fill(); g.clip();
  // 網膜
  const R = OPT.retinaR;
  g.strokeStyle = C.retina; g.lineWidth = 3; g.beginPath();
  for (let i = 0; i <= 40; i++) { const a = -0.1 + 0.2 * i / 40, z = eye.retinaC + R * Math.cos(a), y = R * Math.sin(a), dip = Math.exp(-(y * y) / 0.25) * 0.18; const p = [LX(z + dip), LY(y)]; i ? g.lineTo(...p) : g.moveTo(...p); }
  g.stroke();
  for (const [b, rgb] of bundles) {
    for (const tr of b.rays) {
      if (tr.blocked) continue;
      const p = tr.pts, a = p[p.length - 2], e = p[p.length - 1];
      // 網膜より奥へのばした線（うしろで集まるようすが見えるように、点線）
      const t = 1.0 / Math.max(1e-6, e.z - a.z);
      g.strokeStyle = `rgba(${rgb},0.75)`; g.lineWidth = 1.2; g.setLineDash([]);
      g.beginPath(); g.moveTo(LX(a.z), LY(a.y)); g.lineTo(LX(e.z), LY(e.y)); g.stroke();
      g.strokeStyle = `rgba(${rgb},0.3)`; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(LX(e.z), LY(e.y)); g.lineTo(LX(e.z + (e.z - a.z) * t), LY(e.y + (e.y - a.y) * t)); g.stroke();
      g.setLineDash([]);
    }
  }
  g.restore();
  g.strokeStyle = 'rgba(232,240,244,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  // 拡大している場所の印
  g.strokeStyle = 'rgba(232,240,244,0.25)'; g.beginPath(); g.arc(X(zc), Y(0), span * LAY.s, 0, Math.PI * 2); g.stroke();
  const ang = Math.atan2(cy - Y(0), cx - X(zc));
  g.beginPath(); g.moveTo(X(zc) + Math.cos(ang) * span * LAY.s, Y(0) + Math.sin(ang) * span * LAY.s); g.lineTo(cx - Math.cos(ang) * r, cy - Math.sin(ang) * r); g.stroke();
  g.fillStyle = C.muted; g.textAlign = 'center'; g.font = `11px ${getComputedStyle(document.documentElement).getPropertyValue('--f-body')}`;
  g.fillText(L(`網膜のあたりを ${Math.round(k / LAY.s)} 倍に`, `retina area ×${Math.round(k / LAY.s)}`), cx, cy + r + 14);
}

// 網膜にうつった像（さかさまの矢印）
function drawRetinalImage(g, main, top) {
  if (!S.showTop || !main.chief.retina || !top.chief.retina) return;
  const a = main.chief.retina, b = top.chief.retina;
  g.strokeStyle = `rgb(${C.rayTop})`; g.lineWidth = 3;
  g.beginPath(); g.moveTo(X(a.z) + 6, Y(a.y)); g.lineTo(X(b.z) + 6, Y(b.y)); g.stroke();
  g.fillStyle = `rgb(${C.rayTop})`; g.beginPath(); g.moveTo(X(b.z) + 6, Y(b.y) + 6); g.lineTo(X(b.z) + 1, Y(b.y) - 3); g.lineTo(X(b.z) + 11, Y(b.y) - 3); g.closePath(); g.fill();
  g.fillStyle = C.ink; g.textAlign = 'left'; g.font = `12px ${getComputedStyle(document.documentElement).getPropertyValue('--f-body')}`;
  if (!LAY.narrow) g.fillText(L('像はさかさま', 'image is upside down'), X(b.z) + 16, Y(b.y) + 4);
}

function drawAll(g, W, H) {
  layout(W, H);
  g.clearRect(0, 0, W, H);
  const r = S.res; if (!r) return;
  drawObject(g);
  drawEye(g, r.eye);
  drawGlasses(g);
  const inf = !isFinite(S.d);
  if (S.showTop) drawBundle(g, r.top, C.rayTop, inf ? LAY.trackL : LAY.objX, LAY.objTop, inf);
  drawBundle(g, r.main, C.ray, inf ? LAY.trackL : LAY.objX, LAY.oy, inf);
  drawRetinalImage(g, r.main, r.top);
  drawLabels(g, r.eye);
  drawSection(g);
  drawLoupe(g, r.eye, S.showTop ? [[r.main, C.ray], [r.top, C.rayTop]] : [[r.main, C.ray]]);
}
