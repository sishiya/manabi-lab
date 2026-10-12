// 目のなかの光の道 — 見え方（視力表・放射状の線の表）と、数字の表示
// ぼかしは縦と横で別の広さにできる（乱視のだ円のぼけ）。くっきりした表を1回描いておき、ガウスぼかし（箱ぼかし3回）をかける
'use strict';

// 視力表。視力 V の段のランドルト環は、すきま 1/V 分・外の直径 5/V 分（ISO 8596 の形）
const ROWS = [0.2, 0.4, 0.7, 1.0, 1.5];
const CHART_FOV = 100;   // 表示する高さ（分＝1/60度）
const VIEW = { mode: 'acuity', k: 0, w: 0, h: 0, dpr: 1, sharp: null, out: null, last: '' };
const PAPER = 244, INK = 22;   // 紙と字の明るさ（0〜255）

function drawChart() {
  const c = document.getElementById('chart'), lab = document.getElementById('chartLab'), box = c.parentElement;
  const Wp = box.clientWidth, Hp = box.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!Wp || !Hp) return;
  const w = Math.round(Wp * dpr), h = Math.round(Hp * dpr);
  for (const k of [c, lab]) { k.width = w; k.height = h; }
  Object.assign(VIEW, { w, h, dpr, last: '' });
  const off = document.createElement('canvas'); off.width = w; off.height = h;
  const g = off.getContext('2d'), gl = lab.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0); gl.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = `rgb(${PAPER},${PAPER},${PAPER})`; g.fillRect(0, 0, Wp, Hp);
  const k = Hp / CHART_FOV; VIEW.k = k;   // 1分あたりの px（CSS）
  g.fillStyle = `rgb(${INK},${INK},${INK})`;
  gl.font = '10px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-mono'); gl.fillStyle = '#5b6670'; gl.textAlign = 'left';
  if (VIEW.mode === 'acuity') {
    let y = 6 * k; const dirs = [0, 2, 1, 3, 0, 3, 2, 1, 1, 0, 2, 3, 1, 3, 0, 2, 3, 0, 1, 2];
    let di = 0;
    for (const v of ROWS) {
      const D = 5 / v * k, gap = D / 5, n = v < 0.3 ? 2 : v < 0.8 ? 3 : 4;
      const total = n * D + (n - 1) * D * 0.8, x0 = (Wp - total) / 2 + 12;
      for (let i = 0; i < n; i++) {
        const cx = x0 + i * D * 1.8 + D / 2, cy = y + D / 2, dir = dirs[di++ % dirs.length];
        g.save(); g.translate(cx, cy); g.rotate(dir * Math.PI / 2);
        g.beginPath(); g.arc(0, 0, D / 2, 0, Math.PI * 2); g.arc(0, 0, D / 2 - gap, 0, Math.PI * 2, true); g.fill('evenodd');
        g.fillStyle = `rgb(${PAPER},${PAPER},${PAPER})`; g.fillRect(0, -gap / 2, D / 2 + 1, gap); g.fillStyle = `rgb(${INK},${INK},${INK})`;
        g.restore();
      }
      gl.fillText(v.toFixed(1), 6, y + D / 2 + 3);
      y += D + Math.max(D * 0.55, 3.5 * k);
    }
  } else {
    // 放射状の線（乱視の表）: 30° ごとの線。線の太さは 1.5 分
    const cx = Wp / 2, cy = Hp / 2 + 4, R = Math.min(Hp * 0.44, Wp * 0.42), lw = 1.5 * k;
    g.lineWidth = lw; g.strokeStyle = `rgb(${INK},${INK},${INK})`; g.lineCap = 'butt';
    for (let a = 0; a < 180; a += 30) {
      const r = a * Math.PI / 180, dx = Math.cos(r) * R, dy = Math.sin(r) * R;
      for (const off2 of [-lw * 1.6, 0, lw * 1.6]) {   // 3本1組
        const ox = -Math.sin(r) * off2, oy = Math.cos(r) * off2;
        g.beginPath(); g.moveTo(cx - dx * 0.18 + ox, cy - dy * 0.18 + oy); g.lineTo(cx - dx + ox, cy - dy + oy);
        g.moveTo(cx + dx * 0.18 + ox, cy + dy * 0.18 + oy); g.lineTo(cx + dx + ox, cy + dy + oy); g.stroke();
      }
    }
    gl.textAlign = 'center';
    gl.fillText(L('縦', 'V'), cx, 10); gl.fillText(L('横', 'H'), Wp - 10, cy + 3);
  }
  const src = g.getImageData(0, 0, w, h).data, sharp = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) sharp[i] = src[i * 4];
  VIEW.sharp = sharp; VIEW.sharpCv = off; VIEW.out = c.getContext('2d').createImageData(w, h);
}

// 箱ぼかし3回でガウスぼかし（σ）に近づける幅（Kovesi 2010 の求め方）
function boxSizes(sigma, n = 3) {
  const wIdeal = Math.sqrt(12 * sigma * sigma / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const wu = wl + 2, m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const out = []; for (let i = 0; i < n; i++) out.push(i < m ? wl : wu);
  return out;
}
// 1方向の箱ぼかし（端は端の値をのばす）。horiz: 横向き
function boxPass(src, dst, w, h, r, horiz) {
  if (r < 1) { dst.set(src); return; }
  const len = horiz ? w : h, lines = horiz ? h : w, inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const at = i => horiz ? l * w + i : i * w + l;
    const first = src[at(0)];
    let acc = first * (r + 1);
    for (let i = 0; i < r; i++) acc += src[at(Math.min(i, len - 1))];
    for (let i = 0; i < len; i++) {
      acc += src[at(Math.min(i + r, len - 1))] - (i - r - 1 >= 0 ? src[at(i - r - 1)] : first);
      dst[at(i)] = acc * inv;
    }
  }
}
// 横と縦で別のぼかし（σ は デバイスの px）
function blurXY(src, w, h, sx, sy) {
  let a = new Float32Array(src), b = new Float32Array(w * h);
  for (const [s, horiz] of [[sx, true], [sy, false]]) {
    if (s < 0.25) continue;
    for (const bw of boxSizes(s)) { boxPass(a, b, w, h, (bw - 1) / 2, horiz); [a, b] = [b, a]; }
  }
  return a;
}
// だ円のぼけで見え方を描く。sL: 長い向き（ang、横から反時計回りの角度）の σ、sS: それと直角の σ（CSS の px）。
// vis: 明るさ（0＝見えない〜1）、hole: まん中が見えない（桿体だけ）
function blurChart(sL, sS, ang = 90, vis = 1, hole = false) {
  if (!VIEW.sharp) return;
  const key = [sL.toFixed(2), sS.toFixed(2), ang, vis.toFixed(2), hole].join(',');
  if (key === VIEW.last) return;
  VIEW.last = key;
  const { w, h, dpr } = VIEW, a90 = ((ang % 180) + 180) % 180;
  let a;
  if (a90 === 90) a = blurXY(VIEW.sharp, w, h, sS * dpr, sL * dpr);
  else if (a90 === 0) a = blurXY(VIEW.sharp, w, h, sL * dpr, sS * dpr);
  else {
    // 斜め: 表を回して、長い向きを縦にそろえてからぼかし、回しもどす
    const D = Math.ceil(Math.hypot(w, h)), th = (90 + a90) * Math.PI / 180;
    const rc = document.createElement('canvas'); rc.width = rc.height = D;
    const rg = rc.getContext('2d'); rg.fillStyle = `rgb(${PAPER},${PAPER},${PAPER})`; rg.fillRect(0, 0, D, D);
    rg.translate(D / 2, D / 2); rg.rotate(th); rg.drawImage(VIEW.sharpCv, -w / 2, -h / 2);
    const src = rg.getImageData(0, 0, D, D).data, f = new Float32Array(D * D);
    for (let i = 0; i < D * D; i++) f[i] = src[i * 4];
    const bl = blurXY(f, D, D, sS * dpr, sL * dpr), img = rg.createImageData(D, D);
    for (let i = 0; i < D * D; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = bl[i]; img.data[i * 4 + 3] = 255; }
    rg.setTransform(1, 0, 0, 1, 0, 0); rg.putImageData(img, 0, 0);
    const bc = document.createElement('canvas'); bc.width = w; bc.height = h;
    const bg = bc.getContext('2d'); bg.translate(w / 2, h / 2); bg.rotate(-th); bg.drawImage(rc, -D / 2, -D / 2);
    const d2 = bg.getImageData(0, 0, w, h).data; a = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d2[i * 4];
  }
  const o = VIEW.out.data;
  // 中心窩の桿体のない所（直径 1.25°＝75 分。Curcio ほか 1990）: 桿体だけのときは形が分からない（ならした明るさ）
  const cx = w / 2, cy = h / 2, R = 37.5 * VIEW.k * dpr, edge = 6 * VIEW.k * dpr;
  let mean = 0; if (hole) { for (let i = 0; i < w * h; i++) mean += a[i]; mean /= w * h; }
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    let v = a[i];
    if (hole) { const r = Math.hypot(x - cx, y - cy), f = Math.max(0, Math.min(1, (R + edge - r) / (2 * edge))); v = v * (1 - f) + mean * f; }
    const n = (v - INK) / (PAPER - INK);   // 0＝字、1＝紙
    v = 10 + n * (PAPER - 10) * vis + (1 - vis) * 4;
    o[i * 4] = v; o[i * 4 + 1] = v; o[i * 4 + 2] = vis < 1 ? v * 1.02 : v * 0.96; o[i * 4 + 3] = 255;
  }
  document.getElementById('chart').getContext('2d').putImageData(VIEW.out, 0, 0);
}

// ぼけの円の直径（ラジアン）から、表示のぼかし σ（CSS の px）へ: 円板を同じ広がりのぼかしで近似（σ ≈ 半径/2）
const blurSigma = diamRad => diamRad / 2 * 3437.75 / 2 * VIEW.k;

function updateView() {
  const r = S.res; if (!r) return;
  if (VIEW.mode !== S.chart) {
    VIEW.mode = S.chart; drawChart();
  }
  // 暗さ: 明るさがしきい値をどれだけ上回るかで見え方の明るさを決める（1.5 log 上回れば ふつう。このアプリの目安）。
  // 桿体だけのとき: まん中がぬけ、視力は 0.16 まで（Shlaer 1937）→ すきま 6 分がやっと分かるぼかし（σ 3 分。推定）を足す
  const see = r.see, vis = see.who === 'none' ? 0 : Math.max(0.12, Math.min(1, see.margin / 1.5)), rod = see.who === 'rod';
  const nS = rod ? 3 * VIEW.k : 0, add = s => Math.sqrt(s * s + nS * nS);
  blurChart(add(blurSigma(r.diamS)), add(blurSigma(r.diamW)), r.ang, vis, rod);
  const note = document.getElementById('vnote');
  note.textContent = see.who === 'none' ? L('暗くて見えない（目がまだ暗さに慣れていない）', 'Too dark to see (the eye is not used to the dark yet)') :
    rod ? L('桿体だけ: まん中（中心窩）には桿体がないので見えない。視力も 0.16 まで', 'Rods only: the middle (fovea) has no rods, so it is not seen. Acuity is at most 0.16') :
    S.chart === 'fan' ? L('30° ごとの線（太さ 1.5 分）。乱視だと、ある向きの線だけぼやける', 'Lines every 30° (1.5 arcmin thick). With astigmatism, only lines in some directions blur') :
    L('数字は視力の段（目安）。大きさはそろえて表示', 'Numbers are acuity rows (decimal, rough guide). Shown at matching size');
  const Amax = maxAccommodation(S.age);
  const q = e => fmtDi(Math.round(e * 4) / 4), err = S.err;
  const ao = astigOf();
  const errTxt = r.astig ? `${ao.strong} ${q(S.err)}${L('・', ', ')}${ao.weak} ${q(S.errW)}` : Math.abs(err) < 0.2 ? L('正視', 'Normal') : (err < 0 ? L('近視 ', 'Nearsighted ') : L('遠視 ', 'Farsighted ')) + q(err);
  const am = v => (v * 3437.75).toFixed(1);
  const pd = pupilShown(S.stopR);
  document.getElementById('info').innerHTML =
    `<div class="state ${r.state}">${r.stateText}</div>` +
    `<div><span>${L('物までの距離', 'Distance')}</span><b>${fmtD(S.d)}</b></div>` +
    `<div><span>${L('調節', 'Focusing')}</span><b>${S.A.toFixed(1)} D</b><small>${L('／最大 ', ' / max ')}${Amax.toFixed(1)}</small></div>` +
    `<div><span>${L('ひとみ', 'Pupil')}</span><b>${pd.toFixed(1)} mm</b></div>` +
    `<div><span>${L('暗さ慣れ', 'Dark')}</span><b>${r.see.who === 'cone' ? L('錐体', 'Cones') : r.see.who === 'rod' ? L('桿体だけ', 'Rods only') : L('見えない', 'Can’t see')}</b><small>${L('（', ' (')}${Math.min(S.cone, S.rod).toFixed(1)}${L('）', ')')}</small></div>` +
    (r.astig ? `<div><span>${L(`ぼけ ${ao.strong}・${ao.weak}`, 'Blur (strong / weak)')}</span><b>${am(r.diamS)}${L('・', ' / ')}${am(r.diamW)} ${L('分', '′')}</b></div>`
      : `<div><span>${L('網膜のぼけ', 'Blur on retina')}</span><b>${(r.main.blurD * 1000).toFixed(r.main.blurD < 0.01 ? 1 : 0)} µm</b><small>${L(`（${r.blurArcmin.toFixed(1)} 分）`, ` (${r.blurArcmin.toFixed(1)}′)`)}</small></div>`) +
    `<div class="wide"><span>${L('目の屈折', 'Eye’s focus error')}</span><b>${errTxt}</b></div>`;
  const vs = document.getElementById('vstate'); vs.textContent = r.stateText; vs.className = r.state;   // スマホ: 固定部分にも状態の1行
  const since = S.ev ? S.t - S.ev.t : Infinity;
  const fs = t => t < 10 ? t.toFixed(1) + L(' 秒', ' s') : t < 60 ? Math.round(t) + L(' 秒', ' s') : Math.floor(t / 60) + L(' 分 ', ' min ') + Math.round(t % 60) + L(' 秒', ' s');
  const chartName = S.chart === 'fan' ? L('線の表', 'line chart') : L('視力表', 'eye chart');
  document.getElementById('viewHead').innerHTML = L('見え方', 'What you see') + ` <small>${L(`${chartName}を ${fmtD(S.d)} に置いたら`, `${chartName} at ${fmtD(S.d)}`)}</small>` +
    (S.replay ? ` <em>${L('ふりかえり中', 'Replaying')}</em>` : since < 3000 ? ` <em>${L(`${S.ev.label} から ${fs(since)}`, `${fs(since)} after “${S.ev.label}”`)}</em>` : '');
}

window.addEventListener('resize', () => { drawChart(); });
