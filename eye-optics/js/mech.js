// 目のなかの光の道 — 残像のしくみの図（網膜の中を拡大）
// 残像の表を見ているとき、拡大鏡の代わりに描く: とどく光 → 錐体 → 神経節細胞（入ってくる信号 − 慣れ ＝ 脳へ）→ 見える色。
// 数は after.js と同じ（見つめる s、順応 α、はねかえり k）。1つの場所（図形）を選んで、その「色らしさ」の信号を符号つきの棒で描く
'use strict';

// 図形の場所（after.js の格子の割合）と、その色・反対の色の名前
const SPOTS = [
  { fx: 0.27, fy: 0.32, rgb: [220, 40, 40], name: L('赤い円', 'red circle'), col: L('赤', 'red'), opp: L('青緑', 'blue-green') },
  { fx: 0.66 + 21 / 192, fy: 0.14 + 21 / 126, rgb: [40, 170, 60], name: L('緑の四角', 'green square'), col: L('緑', 'green'), opp: L('赤紫', 'magenta') },
  { fx: 0.27, fy: 0.58 + 29 / 126, rgb: [40, 80, 220], name: L('青い三角', 'blue triangle'), col: L('青', 'blue'), opp: L('黄', 'yellow') },
  { fx: 0.74, fy: 0.72, rgb: [240, 210, 40], name: L('黄色の星', 'yellow star'), col: L('黄', 'yellow'), opp: L('青', 'blue') },
];
S.afterSpot = 0;

// その場所でいま見えている色（after.js と同じ計算）
function spotSeen(sp) {
  if (!AFTER.fig) afterBuild();
  const { W, H, fig } = AFTER, i = Math.round(sp.fy * (H - 1)) * W + Math.round(sp.fx * (W - 1));
  const stare = S.afterMode === 'stare', f = stare ? 1 - AFTER.k * S.afterA : -AFTER.k * S.afterA, base = stare ? AFTER.bg : AFTER.white;
  const rgb = mul(M_LMS2RGB, [0, 1, 2].map(j => base[j] * (1 + f * fig[i * 3 + j])));
  return { rgb: rgb.map(v => Math.round(toS(v))), c: [0, 1, 2].map(j => fig[i * 3 + j]) };
}
// 残像の表をさわったら、いちばん近い図形を選ぶ
function pickSpot(fx, fy) {
  let best = 0, bd = Infinity;
  SPOTS.forEach((sp, i) => { const d = Math.hypot((sp.fx - fx) * 1.5, sp.fy - fy); if (d < bd) { bd = d; best = i; } });
  S.afterSpot = best;
}

function drawAfterMech(g, x0, y0, w, h, anchor) {
  if (w < 200 || h < 120) return;   // 小さすぎるときは描かない
  const sp = SPOTS[S.afterSpot], stare = S.afterMode === 'stare', s = stare ? 1 : 0, a = S.afterA, k = AFTER.k;
  const seen = spotSeen(sp), fb = getComputedStyle(document.documentElement).getPropertyValue('--f-body');
  const rgbS = v => `rgb(${v[0]},${v[1]},${v[2]})`, opp = sp.rgb.map(v => 255 - v);
  // 拡大している所（網膜）へ線
  if (anchor) {
    g.strokeStyle = 'rgba(232,240,244,0.3)'; g.lineWidth = 1; g.beginPath(); g.arc(anchor[0], anchor[1], 9, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(anchor[0], anchor[1] + 9); g.lineTo(x0 + w * 0.5, y0); g.stroke();
  }
  g.save();
  g.fillStyle = 'rgba(9,16,25,0.96)'; g.strokeStyle = 'rgba(232,240,244,0.35)'; g.lineWidth = 1;
  g.beginPath(); g.roundRect ? g.roundRect(x0, y0, w, h, 10) : g.rect(x0, y0, w, h); g.fill(); g.stroke();
  const fs = Math.max(10, Math.min(13, w / 30)), pad = 8;
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `700 ${fs}px ${fb}`; g.fillStyle = '#e8f0f4';
  g.fillText(L(`網膜の中を拡大: ${sp.name}の場所`, `Inside the retina: at the ${sp.name}`), x0 + pad, y0 + pad + fs);
  const top = y0 + pad + fs + 8, bot = y0 + h - pad - fs * 3.5, mid = (top + bot) / 2, ch = bot - top;
  const cx = [0.09, 0.27, 0.6, 0.91].map(f => x0 + w * f);
  g.font = `${fs - 1}px ${fb}`; g.textAlign = 'center'; g.fillStyle = '#a3b4bf';
  const lab = (t, x) => g.fillText(t, x, bot + fs + 2);
  // 1. とどく光
  const r1 = Math.max(3, Math.min(w * 0.06, ch * 0.22));
  g.fillStyle = stare ? rgbS(sp.rgb) : 'rgb(236,236,236)'; g.beginPath(); g.arc(cx[0], mid, r1, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#a3b4bf'; lab(L('とどく光', 'light in'), cx[0]);
  // 2. 錐体 L・M・S（明るさのちがいに合わせて中の色が上下する）
  const cw = Math.min(w * 0.04, 12), chh = ch * 0.8;
  ['#ff6a6a', '#6ad37a', '#6a8cff'].forEach((col, j) => {
    const x = cx[1] + (j - 1) * cw * 1.7, y = mid - chh / 2, lev = Math.max(0.05, Math.min(1, 0.5 + 0.5 * s * seen.c[j]));
    g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(x - cw / 2, y, cw, chh);
    g.fillStyle = col; g.globalAlpha = 0.85; g.fillRect(x - cw / 2, y + chh * (1 - lev), cw, chh * lev); g.globalAlpha = 1;
    g.fillStyle = '#a3b4bf'; g.font = `${fs - 2}px ${fb}`; g.fillText('LMS'[j], x, y - 3);
  });
  g.font = `${fs - 1}px ${fb}`; lab(L('錐体', 'cones'), cx[1]);
  // 3. 神経節細胞: 入ってくる − 慣れ ＝ 脳へ（「色らしさ」を符号つきの棒で。右がその色、左が反対の色）
  const bx = x0 + w * 0.42, bw = w * 0.36, zx = bx + bw * 0.42, unit = bw * 0.5;
  g.strokeStyle = 'rgba(255,214,106,0.6)'; g.lineWidth = 1.2; g.strokeRect(bx - 4, top, bw + 8, ch);
  g.fillStyle = '#ffd66a'; g.font = `700 ${fs - 1}px ${fb}`; g.textAlign = 'center';
  g.fillText(L('神経節細胞', 'ganglion cell'), bx + bw / 2, top + fs);
  const rows = [[L('入ってくる', 'incoming'), s], [L('− 慣れ', '− adapted'), -k * a], [L('＝ 脳へ', '= to brain'), s - k * a]];
  const rh = (ch - fs - 10) / 3;
  g.strokeStyle = 'rgba(232,240,244,0.35)'; g.beginPath(); g.moveTo(zx, top + fs + 4); g.lineTo(zx, top + ch - 3); g.stroke();
  rows.forEach(([t, v], i) => {
    const y = top + fs + 6 + i * rh, bh = Math.max(4, rh * 0.42);
    g.fillStyle = v >= 0 ? rgbS(sp.rgb) : rgbS(opp);
    const len = Math.max(-1, Math.min(1, v)) * unit;
    g.fillRect(Math.min(zx, zx + len), y + rh * 0.45, Math.abs(len), bh);
    g.fillStyle = i === 2 ? '#e8f0f4' : '#a3b4bf'; g.font = `${i === 2 ? '700 ' : ''}${fs - 2}px ${fb}`; g.textAlign = 'left';
    g.fillText(t, bx, y + rh * 0.38);
    g.textAlign = 'right'; g.fillText(`${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}`, bx + bw, y + rh * 0.38);
  });
  g.textAlign = 'center'; g.fillStyle = '#a3b4bf'; g.font = `${fs - 2}px ${fb}`;
  g.fillText(L(`← ${sp.opp}　${sp.col} →`, `← ${sp.opp}   ${sp.col} →`), zx, bot + fs + 2);
  // 4. 見える色
  const r4 = Math.max(3, Math.min(w * 0.06, ch * 0.24));
  g.fillStyle = rgbS(seen.rgb); g.beginPath(); g.arc(cx[3], mid, r4, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(232,240,244,0.5)'; g.stroke();
  g.font = `${fs - 1}px ${fb}`; g.fillStyle = '#a3b4bf'; lab(L('見える色', 'seen'), cx[3]);
  // 矢印
  g.strokeStyle = 'rgba(232,240,244,0.45)'; g.lineWidth = 1.2;
  for (const [xa, xb] of [[cx[0] + r1 + 3, cx[1] - cw * 2.6], [cx[1] + cw * 2.6, bx - 8], [bx + bw + 8, cx[3] - r4 - 3]]) {
    g.beginPath(); g.moveTo(xa, mid); g.lineTo(xb, mid); g.lineTo(xb - 5, mid - 4); g.moveTo(xb, mid); g.lineTo(xb - 5, mid + 4); g.stroke();
  }
  // 下の説明（いまの状態）
  g.textAlign = 'left'; g.fillStyle = '#e8f0f4'; g.font = `${fs - 1}px ${fb}`;
  const msg = stare
    ? L(`見つめているあいだ、細胞は「${sp.col}」に慣れて（慣れ ${Math.round(a * 100)}%）、そのぶんを引き算する。だから色がうすれる。`,
        `While you stare, the cell gets used to “${sp.col}” (adapted ${Math.round(a * 100)}%) and subtracts it, so the color fades.`)
    : a > 0.05 ? L(`光は白になったのに、慣れの引き算だけが残る → 反対の「${sp.opp}」が脳へ。慣れは 7 秒ほどで抜けていく。`,
        `The light is white now, but the subtraction is still there → the opposite, “${sp.opp}”, goes to the brain. It wears off in about 7 s.`)
      : L('慣れが抜けて、引き算がなくなった。残像は消えた。', 'The adaptation has worn off; nothing is subtracted. The afterimage is gone.');
  wrapText(g, msg, x0 + pad, bot + fs * 2.4, w - pad * 2, fs + 2);
  g.restore();
}
// 幅に合わせて折り返す（日本語は1字ずつ、英語は空白で）
function wrapText(g, text, x, y, maxW, lh) {
  const parts = LANG === 'en' ? text.split(/(?<= )/) : [...text];
  let line = '';
  for (const p of parts) {
    if (g.measureText(line + p).width > maxW && line) { g.fillText(line, x, y); y += lh; line = p.trimStart(); }
    else line += p;
  }
  if (line) g.fillText(line, x, y);
}
