// 錯覚の美術館: 展示の登録と、描画の道具
// 展示は defEx({...}) で登録する。形は DEVNOTES の「展示の書き方」。
'use strict';

const ROOMS = [
  { id: 'size',   name: '長さと大きさ', en: 'LENGTH & SIZE', note: '同じ長さ・同じ大きさなのに、まわりのせいで違って見える。自分の目がどれだけだまされるか測れます。' },
  { id: 'vanish', name: '消える',       en: 'FADING',        note: '見えているはずのものが、見つめているうちに消える。' },
  { id: 'light',  name: '明るさと線',   en: 'LIGHTNESS & LINES', note: '同じ色が違う色に、まっすぐな線がかたむいて見える。' },
  { id: 'form',   name: 'ないものが見える・止まっているのに動く', en: 'PHANTOMS', note: '描いていない形や、動いていない動きを、脳がつくり出す。' },
  { id: 'sound',  name: '音',           en: 'SOUND',         note: 'ノイズの中のことば、上がり続ける音など。', soon: '段階Bで追加予定: ノイズの中のことば・無限に上がる音・ない音が聞こえる' },
];

const EX = [];
function defEx(o) { EX.push(o); }
const exById = id => EX.find(e => e.id === id);

// ---- 小さな道具 ----
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const FONT = '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif';
const MONO = '"IBM Plex Mono", Consolas, monospace';

function fillBg(g, S, c) { g.fillStyle = c; g.fillRect(0, 0, S, S); }
function seg(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
function disc(g, x, y, r, c) { g.beginPath(); g.arc(x, y, r, 0, TAU); if (c) g.fillStyle = c; g.fill(); }
// 見つめる点（十字）
function fixCross(g, x, y, r, c) { g.save(); g.strokeStyle = c || '#000'; g.lineWidth = Math.max(1.5, r * 0.28); seg(g, x - r, y, x + r, y); seg(g, x, y - r, x, y + r); g.restore(); }
// 答え合わせの補助線（赤い点線）
function guide(g, x1, y1, x2, y2, S) {
  g.save(); g.strokeStyle = '#e0303a'; g.lineWidth = Math.max(1.5, S * 0.004); g.setLineDash([S * 0.012, S * 0.01]);
  seg(g, x1, y1, x2, y2); g.restore();
}
function label(g, txt, x, y, S, o = {}) {
  g.save();
  g.font = `${o.w || 700} ${Math.round(S * (o.size || 0.032))}px ${o.mono ? MONO : FONT}`;
  g.fillStyle = o.c || '#e0303a'; g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle';
  g.fillText(txt, x, y); g.restore();
}
// ぼけた円（中心が c、外へ透明に）
function blob(g, x, y, r, rgb, a, soft) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  const st = clamp(1 - soft, 0, 0.98);
  gr.addColorStop(0, `rgba(${rgb},${a})`);
  gr.addColorStop(st, `rgba(${rgb},${a})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
const pct = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%';
