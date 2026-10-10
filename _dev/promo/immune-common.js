// 免疫のたたかいの台本（immune-battle.html・immune-battle-guide.html）で共通の部分
// 場面 SC = [{ a, b, ui: { pk, body, resist, dose… }, speed（0: 10分/秒、1: 1時間/秒、2: 6時間/秒）, pre（先に進める日数）, prep(w), level, ev: [{ t, run(w) }] }]
'use strict';
const IB_RATE = [10 / 1440, 1 / 24, 0.25];   // アプリの SPEEDS（1秒あたりの日数）
const ibScAt = (SC, t) => SC.find(s => t < s.b) || SC[SC.length - 1];
let ibCur = null, ibLast = -1;

// 図の大きさ（CSS の px。dpr 2 なので画素はこの2倍）
function ibSize(w, sz) {
  const css = Object.entries(sz).map(([sel, [cw, ch]]) => `${sel}{position:fixed!important;left:0!important;top:0!important;width:${cw}px!important;height:${ch}px!important;max-width:none!important}`).join('');
  const st = w.document.createElement('style'); st.textContent = css; w.document.head.append(st);
  w.resizeAll();
}
function ibStart(w, s) {
  const I = w.__ib, P = w.eval('PATHOGENS'), pk = (s.ui && s.ui.pk) || 'flu';
  I.set(Object.assign({ pk, body: 'adult', mem: 'none', resist: false, dose: P[pk].doseDefault, inn: 1, adp: 1, speed: s.speed ?? 1, playing: true }, s.ui || {}));
  if (s.prep) s.prep(w);
  if (s.pre) I.run(s.pre);
  Object.assign(I.UI, { playing: true, speed: s.speed ?? 1, autoStop: 999 });
  w.setLevel(s.level ?? 1);
}
function ibRender(w, SC, t) {
  const s = ibScAt(SC, t), lt = t - s.a, I = w.__ib, rate = IB_RATE[s.speed ?? 1];
  if (s !== ibCur || t < ibLast || t - ibLast > 0.5) {
    ibStart(w, s);
    // 途中の時刻（確かめ用のコマ）: できごとの時刻ごとに区切って、描かずに進める
    let u = 0;
    for (const e of (s.ev || []).filter(e => e.t <= lt).sort((p, q) => p.t - q.t)) { if (e.t > u) I.run((e.t - u) * rate); e.run(w); u = e.t; }
    if (lt - 0.3 > u) I.run((lt - 0.3 - u) * rate);
    I.frame(9);   // 粒の動きを少しなじませる（0.3秒ぶん）
    ibCur = s;
  } else { for (const e of s.ev || []) if (e.t > ibLast - s.a && e.t <= lt) e.run(w); I.frame(1); }
  ibLast = t;
}
// 「いまの状況」（画面の上）の文字
function ibStatus(w) {
  const d = w.document, tx = s => ((d.querySelector(s) || {}).textContent || '').trim();
  const lines = [...d.querySelectorAll('#status .st-line')].map(e => e.textContent.trim());
  return [tx('#status .st-v') + '　' + tx('#status .st-top span:nth-child(2)'), ...lines.slice(0, 1)];
}
function ibMedClick(w, k) { const b = w.document.querySelector(`#meds .med[data-k="${k}"] button`); if (b) b.click(); }
