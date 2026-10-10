// さなぎの中での台本（metamorphosis.html・metamorphosis-guide.html）で共通の部分
// 時間はアプリの t（蛹になった日からの日数。羽化 = 18）。KEYS = [[動画の秒, t]] の間は、アプリの時間の帯（u）の上でなめらかに動かす
// 見かた MODES = [[動画の秒, 'in' | 'cut' | 'out']]
'use strict';
function mmSize(w, sz) {
  const css = Object.entries(sz).map(([sel, [cw, ch]]) => `${sel}{position:fixed!important;left:0!important;top:0!important;width:${cw}px!important;height:${ch}px!important;max-width:none!important}`).join('')
    + '#timebar{display:none!important}';
  const st = w.document.createElement('style'); st.textContent = css; w.document.head.append(st);
}
function mmTAt(w, KEYS, t) {
  let i = KEYS.findIndex(k => k[0] > t); if (i < 0) return KEYS[KEYS.length - 1][1]; if (i === 0) return KEYS[0][1];
  const [a, ta] = KEYS[i - 1], [b, tb] = KEYS[i], ua = w.tToU(ta), ub = w.tToU(tb);
  return w.uToT(lerp(ua, ub, clamp((t - a) / (b - a), 0, 1)));
}
function mmRender(w, KEYS, MODES, t) {
  let m = 'in'; for (const [a, k] of MODES) if (t >= a) m = k;
  w.__mm.VIEW.mode = m;
  w.__mm.UI.u = w.tToU(mmTAt(w, KEYS, t));
  w.render(t);   // 血球・心臓などの動きの時計も、動画の時刻にそろえる
}
// 見出し（いまの時期と時刻）
function mmStage(w) {
  const d = w.document, b = d.querySelector('#stageName b'), s = d.querySelector('#stageName span');
  return [(b ? b.textContent : '') + '　' + (d.getElementById('clock').textContent || ''), s ? s.textContent : ''];
}
// 色の意味（アプリの CATS と同じ色）
function mmLegend(g, w, x, y, f) {
  if (f <= 0) return;
  const C = w.eval('CATS'), keys = w.eval('CAT_ORDER');
  const h = 62 + keys.length * 44;
  g.shadowBlur = 0; g.globalAlpha = f;
  g.fillStyle = 'rgba(14,16,24,0.9)'; g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(x, y, 420, h, 16); g.fill(); g.stroke();
  g.textAlign = 'left'; g.textBaseline = 'middle';
  setFont(g, 26, true); g.fillStyle = '#b9bfcc'; g.fillText('色の意味（右のパネル）', x + 22, y + 30);
  keys.forEach((k, i) => {
    const cy = y + 82 + i * 44;
    g.fillStyle = C[k].col; g.beginPath(); g.arc(x + 36, cy, 11, 0, Math.PI * 2); g.fill();
    setFont(g, 30, true); g.fillStyle = '#fff'; g.fillText(C[k].name, x + 60, cy);
  });
  g.globalAlpha = 1;
}
