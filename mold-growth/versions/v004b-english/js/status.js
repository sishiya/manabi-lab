// How things are going: compare now with 3 days ago (living mould, visible area), list what worries for the future,
// and show what the last tool did (right after, and since then).

const ACT = { last: null };   // { id, name, t, before, after }

function fmtPct(a, b) {
  if (b < 0.5 && a < 0.5) return '±0';
  if (b < 0.5) return L('新しく出てきた', 'newly appeared');
  const p = (a - b) / b * 100;
  return (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(0) + '%';
}
const mm2 = v => v < 1 ? (v < 0.05 ? '0' : v.toFixed(1)) : v.toFixed(0);

// worries for the future (and good signs)
function concerns(now) {
  const out = [];
  const day = W.hist.slice(-24);
  const wetH = day.reduce((a, m) => a + m.wet, 0) / Math.max(1, day.length) * 24;
  if (now.deep > 0.5) out.push(['bad', L(`ゴムや目地の奥に、生き残った菌糸がある（約${mm2(now.deep)}mm²）。湿ると同じ場所から出てくる`, `Hyphae survive deep in the rubber or grout (about ${mm2(now.deep)} mm²). When it gets damp, mold comes back in the same spot`)]);
  if (now.live > 0.5 && now.vis < 1) out.push(['bad', L('目にはまだ見えないが、菌糸は育っている', 'Not visible yet, but hyphae are growing')]);
  if (wetH >= 8) out.push(['bad', L(`目地とゴムパッキンが1日に約${wetH.toFixed(0)}時間ぬれている（乾く時間が足りない）`, `The grout and rubber seal are wet about ${wetH.toFixed(0)} hours a day (not enough time to dry)`)]);
  if (now.food > 0.25) out.push(['bad', L('汚れ（えさ）がたまっている', 'Grime (food) is building up')]);
  if (now.germ >= 5) out.push(['bad', L(`発芽しかけている胞子が${now.germ}個`, `${now.germ} spores are starting to sprout`)]);
  if (now.fung > 0.15) {
    const old = W.hist.length > 48 ? W.hist[W.hist.length - 49].fung : now.fung;
    const half = old > now.fung ? Math.log(2) / Math.log(old / now.fung) * 2 : null;
    const hl = half && half < 200;
    out.push(['good', L(`防カビ剤が効いている${hl ? `（約${half.toFixed(0)}日で半分に弱まる）` : ''}`, `The anti-mold agent is working${hl ? ` (it weakens by half in about ${half.toFixed(0)} days)` : ''}`)]);
  } else if (W.hist.some(m => m.fung > 0.15)) out.push(['bad', L('防カビ剤の効き目がほとんど切れた', 'The anti-mold agent has almost worn off')]);
  if (wetH < 4 && now.live > 0.5) out.push(['good', L('乾いている時間が長い（菌糸は休んでいる）', 'Dry for long periods (the hyphae are resting)')]);
  return out;
}

function status() {
  const h = W.hist;
  if (h.length < 2) return { level: 'none', title: L('まだ何も起きていない', 'Nothing has happened yet'), line: L('空気から胞子が落ちてくるのを待っている', 'Waiting for spores to fall from the air'), list: [] };
  const now = measure(), ref = h[Math.max(0, h.length - 73)];   // now (also right after a tool) vs ~3 days ago
  const list = concerns(now);
  const bad = list.filter(x => x[0] === 'bad').length;
  const dLive = now.live - ref.live, dVis = now.vis - ref.vis;
  let level, title;
  if (now.live < 0.3 && now.vis < 0.5) { level = bad ? 'warn' : 'good'; title = bad ? L('カビはほぼないが、心配がある', 'Almost no mold, but there are worries') : L('カビはほぼない', 'Almost no mold'); }
  else if (dLive > Math.max(0.3, ref.live * 0.08) || dVis > Math.max(0.5, ref.vis * 0.05)) { level = 'bad'; title = L('悪化している（カビが増えている）', 'Getting worse (mold is spreading)'); }
  else if (dLive < -Math.max(0.3, ref.live * 0.08) || dVis < -Math.max(0.5, ref.vis * 0.05)) { level = bad ? 'warn' : 'good'; title = bad ? L('よくなっているが、心配が残る', 'Getting better, but worries remain') : L('よくなっている', 'Getting better'); }
  else { level = bad ? 'warn' : 'good'; title = L('横ばい（ほとんど増えていない）', 'Holding steady (hardly growing)'); }
  const days = ((now.t - ref.t) / 24).toFixed(0);
  const line = L(`${days}日前とくらべて　生きているカビ ${fmtPct(now.live, ref.live)}　目に見えるカビ ${mm2(ref.vis)}→${mm2(now.vis)}mm²`,
    `vs. ${days} days ago: living mold ${fmtPct(now.live, ref.live)}, visible mold ${mm2(ref.vis)}→${mm2(now.vis)} mm²`);
  return { level, title, line, list };
}

// what the last tool did
function actionStart(id) {
  const tool = TOOLS.find(t => t.id === id), name = id === 'smoke' ? L('防カビくん煙剤', 'Anti-mold fogger') : tool && tool.name;
  if (!name || id === 'hand') return;
  if (ACT.last && ACT.last.id === id && W.t - ACT.last.t < 1) { ACT.last.after = null; return; }   // same tool in the same hour: keep the first "before"
  ACT.last = { id, name, t: W.t, before: measure(), after: null };
}
function actionEnd() { if (ACT.last && !ACT.last.after) ACT.last.after = measure(); }
function actionText() {
  const a = ACT.last;
  if (!a || !a.after || W.t - a.t > 14 * 24) return '';
  const b = a.before, f = a.after, now = W.hist.length ? W.hist[W.hist.length - 1] : f;
  const lines = [];
  if (b.live > 0.3 || b.vis > 0.5) lines.push(L(`使った直後: 生きているカビ ${fmtPct(f.live, b.live)}、目に見えるカビ ${mm2(b.vis)}→${mm2(f.vis)}mm²`, `Right after: living mold ${fmtPct(f.live, b.live)}, visible mold ${mm2(b.vis)}→${mm2(f.vis)} mm²`));
  if (f.deep > b.deep) lines.push(L(`奥に生き残った菌糸 約${mm2(f.deep)}mm²（表面からは見えない）`, `Hyphae surviving deep inside: about ${mm2(f.deep)} mm² (not visible from the surface)`));
  if (f.fung > b.fung + 0.01) lines.push(L('表面に防カビ成分が残った', 'Anti-mold agent remains on the surface'));
  if (f.food < b.food - 0.005) lines.push(L('汚れ（えさ）が減った', 'Less grime (food)'));
  if (W.t - a.t >= 24) lines.push(L(`それから${((W.t - a.t) / 24).toFixed(0)}日: 生きているカビ ${fmtPct(now.live, f.live)}（使った直後とくらべて）`, `${((W.t - a.t) / 24).toFixed(0)} days later: living mold ${fmtPct(now.live, f.live)} (vs. right after)`));
  if (!lines.length) lines.push(L('まだカビがほとんどいない所に使った', 'Used where there was hardly any mold yet'));
  return L(`<b>さっきの対策: ${a.name}</b>（${Math.floor(a.t / 24) + 1}日目）<br>`, `<b>Last action: ${a.name}</b> (day ${Math.floor(a.t / 24) + 1})<br>`) + lines.join('<br>');
}
