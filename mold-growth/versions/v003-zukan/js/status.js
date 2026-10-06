// How things are going: compare now with 3 days ago (living mould, visible area), list what worries for the future,
// and show what the last tool did (right after, and since then).

const ACT = { last: null };   // { id, name, t, before, after }

function fmtPct(a, b) {
  if (b < 0.5 && a < 0.5) return '±0';
  if (b < 0.5) return '新しく出てきた';
  const p = (a - b) / b * 100;
  return (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(0) + '%';
}
const mm2 = v => v < 1 ? (v < 0.05 ? '0' : v.toFixed(1)) : v.toFixed(0);

// worries for the future (and good signs)
function concerns(now) {
  const out = [];
  const day = W.hist.slice(-24);
  const wetH = day.reduce((a, m) => a + m.wet, 0) / Math.max(1, day.length) * 24;
  if (now.deep > 0.5) out.push(['bad', `ゴムや目地の奥に、生き残った菌糸がある（約${mm2(now.deep)}mm²）。湿ると同じ場所から出てくる`]);
  if (now.live > 0.5 && now.vis < 1) out.push(['bad', '目にはまだ見えないが、菌糸は育っている']);
  if (wetH >= 8) out.push(['bad', `目地とゴムパッキンが1日に約${wetH.toFixed(0)}時間ぬれている（乾く時間が足りない）`]);
  if (now.food > 0.25) out.push(['bad', '汚れ（えさ）がたまっている']);
  if (now.germ >= 5) out.push(['bad', `発芽しかけている胞子が${now.germ}個`]);
  if (now.fung > 0.15) {
    const old = W.hist.length > 48 ? W.hist[W.hist.length - 49].fung : now.fung;
    const half = old > now.fung ? Math.log(2) / Math.log(old / now.fung) * 2 : null;
    out.push(['good', `防カビ剤が効いている${half && half < 200 ? `（約${half.toFixed(0)}日で半分に弱まる）` : ''}`]);
  } else if (W.hist.some(m => m.fung > 0.15)) out.push(['bad', '防カビ剤の効き目がほとんど切れた']);
  if (wetH < 4 && now.live > 0.5) out.push(['good', '乾いている時間が長い（菌糸は休んでいる）']);
  return out;
}

function status() {
  const h = W.hist;
  if (h.length < 2) return { level: 'none', title: 'まだ何も起きていない', line: '空気から胞子が落ちてくるのを待っている', list: [] };
  const now = measure(), ref = h[Math.max(0, h.length - 73)];   // now (also right after a tool) vs ~3 days ago
  const list = concerns(now);
  const bad = list.filter(x => x[0] === 'bad').length;
  const dLive = now.live - ref.live, dVis = now.vis - ref.vis;
  let level, title;
  if (now.live < 0.3 && now.vis < 0.5) { level = bad ? 'warn' : 'good'; title = bad ? 'カビはほぼないが、心配がある' : 'カビはほぼない'; }
  else if (dLive > Math.max(0.3, ref.live * 0.08) || dVis > Math.max(0.5, ref.vis * 0.05)) { level = 'bad'; title = '悪化している（カビが増えている）'; }
  else if (dLive < -Math.max(0.3, ref.live * 0.08) || dVis < -Math.max(0.5, ref.vis * 0.05)) { level = bad ? 'warn' : 'good'; title = bad ? 'よくなっているが、心配が残る' : 'よくなっている'; }
  else { level = bad ? 'warn' : 'good'; title = '横ばい（ほとんど増えていない）'; }
  const days = ((now.t - ref.t) / 24).toFixed(0);
  const line = `${days}日前とくらべて　生きているカビ ${fmtPct(now.live, ref.live)}　目に見えるカビ ${mm2(ref.vis)}→${mm2(now.vis)}mm²`;
  return { level, title, line, list };
}

// what the last tool did
function actionStart(id) {
  const tool = TOOLS.find(t => t.id === id), name = id === 'smoke' ? '防カビくん煙剤' : tool && tool.name;
  if (!name || id === 'lens') return;
  if (ACT.last && ACT.last.id === id && W.t - ACT.last.t < 1) { ACT.last.after = null; return; }   // same tool in the same hour: keep the first "before"
  ACT.last = { id, name, t: W.t, before: measure(), after: null };
}
function actionEnd() { if (ACT.last && !ACT.last.after) ACT.last.after = measure(); }
function actionText() {
  const a = ACT.last;
  if (!a || !a.after || W.t - a.t > 14 * 24) return '';
  const b = a.before, f = a.after, now = W.hist.length ? W.hist[W.hist.length - 1] : f;
  const lines = [];
  if (b.live > 0.3 || b.vis > 0.5) lines.push(`使った直後: 生きているカビ ${fmtPct(f.live, b.live)}、目に見えるカビ ${mm2(b.vis)}→${mm2(f.vis)}mm²`);
  if (f.deep > b.deep) lines.push(`奥に生き残った菌糸 約${mm2(f.deep)}mm²（表面からは見えない）`);
  if (f.fung > b.fung + 0.01) lines.push('表面に防カビ成分が残った');
  if (f.food < b.food - 0.005) lines.push('汚れ（えさ）が減った');
  if (W.t - a.t >= 24) lines.push(`それから${((W.t - a.t) / 24).toFixed(0)}日: 生きているカビ ${fmtPct(now.live, f.live)}（使った直後とくらべて）`);
  if (!lines.length) lines.push('まだカビがほとんどいない所に使った');
  return `<b>さっきの対策: ${a.name}</b>（${Math.floor(a.t / 24) + 1}日目）<br>` + lines.join('<br>');
}
