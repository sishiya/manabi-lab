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
    gl.fillText('縦', cx, 10); gl.fillText('横', Wp - 10, cy + 3);
  }
  const src = g.getImageData(0, 0, w, h).data, sharp = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) sharp[i] = src[i * 4];
  VIEW.sharp = sharp; VIEW.out = c.getContext('2d').createImageData(w, h);
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
// 横 sx・縦 sy（CSS の px）のぼかしで見え方を描く
function blurChart(sx, sy) {
  if (!VIEW.sharp) return;
  const key = sx.toFixed(2) + ',' + sy.toFixed(2);
  if (key === VIEW.last) return;
  VIEW.last = key;
  const { w, h, dpr } = VIEW;
  let a = new Float32Array(VIEW.sharp), b = new Float32Array(w * h);
  for (const [s, horiz] of [[sx * dpr, true], [sy * dpr, false]]) {
    if (s < 0.25) continue;
    for (const bw of boxSizes(s)) { boxPass(a, b, w, h, (bw - 1) / 2, horiz); [a, b] = [b, a]; }
  }
  const o = VIEW.out.data;
  for (let i = 0; i < w * h; i++) { const v = a[i]; o[i * 4] = v; o[i * 4 + 1] = v; o[i * 4 + 2] = v * 0.96; o[i * 4 + 3] = 255; }
  document.getElementById('chart').getContext('2d').putImageData(VIEW.out, 0, 0);
}

// ぼけの円の直径（ラジアン）から、表示のぼかし σ（CSS の px）へ: 円板を同じ広がりのぼかしで近似（σ ≈ 半径/2）
const blurSigma = diamRad => diamRad / 2 * 3437.75 / 2 * VIEW.k;

function updateView() {
  const r = S.res; if (!r) return;
  blurChart(blurSigma(r.diamH), blurSigma(r.diamV));
  const Amax = maxAccommodation(S.age);
  const err = S.err, errTxt = Math.abs(err) < 0.2 ? '正視' : (err < 0 ? '近視 ' : '遠視 ') + fmtDi(Math.round(err * 4) / 4);
  const pd = pupilShown(S.stopR);
  document.getElementById('info').innerHTML =
    `<div class="state ${r.state}">${r.stateText}</div>` +
    `<div><span>物までの距離</span><b>${fmtD(S.d)}</b></div>` +
    `<div><span>調節</span><b>${S.A.toFixed(1)} D</b><small>／最大 ${Amax.toFixed(1)}</small></div>` +
    `<div><span>ひとみ</span><b>${pd.toFixed(1)} mm</b></div>` +
    `<div><span>網膜のぼけ</span><b>${(r.main.blurD * 1000).toFixed(r.main.blurD < 0.01 ? 1 : 0)} µm</b><small>（${r.blurArcmin.toFixed(1)} 分）</small></div>` +
    `<div class="wide"><span>目の屈折</span><b>${errTxt}</b></div>`;
  const since = S.ev ? S.t - S.ev.t : Infinity;
  document.getElementById('viewHead').innerHTML = `見え方 <small>視力表を ${fmtD(S.d)} に置いたら</small>` +
    (S.replay ? ' <em>ふりかえり中</em>' : since < 40 ? ` <em>${S.ev.label} から ${since.toFixed(since < 10 ? 1 : 0)} 秒</em>` : '');
}

window.addEventListener('resize', () => { drawChart(); });
