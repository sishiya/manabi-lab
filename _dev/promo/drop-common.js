// ひとしずくの進化の台本（drop-evolution.html・drop-evolution-guide.html）で共通の部分
// アプリは裏で ?noworker&nogate（画面側で計算）にして開き、一滴の時計をこちらで進める（乱数は一滴のシードで決まるので、何度録っても同じ）。
// はじめの一滴は out/drop/ に保存したもの（祖先から回した節目の一滴は、アプリの data/ にあるもの）を、アプリの「途中からのぞく」で読む。
// 場面 SC = [{ a, b, from（一滴の名前）, simT(lt)（場面の頭から何秒すすめるか。省くと lt*rate）, rate, cam(lt, world, D) → { x, y, z }, pick(world) → 追う1匹, ev: [{ t, run(w) }] }]
'use strict';
const DP_SEED = 23;
// 録画用のはじめの一滴（_dev/promo/out/drop/。Git に入れない）。アプリの turns.json に足して、「途中からのぞく」の選びに出す
const DP_EXTRA = [{ id: 'promo-anc', title: 'はじまりの2本毛', sub: '録画用', hours: -1, gen: 0 }, { id: 'promo-anc-10m', title: 'はじまりから10分', sub: '録画用', hours: -1, gen: 1 }];
const DP_INJECT = {
  dpr: 2, raf: true,
  // srcdoc では ?noworker などが読めないので、URL の引数をこちらで見せる。録画用の一滴はこのフォルダの out/drop/ から読む
  pre: `{ const U = URLSearchParams; window.URLSearchParams = class extends U { constructor(s) { super(s === '' || s === location.search ? '?noworker&nogate&lang=ja&seed=${DP_SEED}' : s); } }; }`
    + `{ const f0 = window.fetch.bind(window), EX = ${JSON.stringify(DP_EXTRA)};`
    + ` window.fetch = (u, o) => { const s = String(u), m = s.match(/data\\/(promo-[\\w-]+)\\.json$/);`
    + `  if (/data\\/turns\\.json$/.test(s)) return f0(u, o).then(r => r.json()).then(t => new Response(JSON.stringify(t.concat(EX))));`
    + `  return m ? f0('../_dev/promo/out/drop/' + m[1] + '.json', o) : f0(u, o); }; }`,
};
const dpScAt = (SC, t) => SC.find(s => t < s.b) || SC[SC.length - 1];
let dpCur = null, dpLast = -1, dpT0 = 0, dpPick = null;
const dpReady = w => !!(w.__drop && w.__drop.world && !w.document.getElementById('mPeek').hidden);
const dpWait = (w, f) => new Promise(ok => { const k = () => f() ? ok() : w.setTimeout(k, 20); k(); });
// 一滴を読む（アプリの メニュー → 途中からのぞく → 選ぶ → のぞく と同じ道）
async function dpLoad(w, id) {
  const D = w.__drop, old = D.world, $ = s => w.document.querySelector(s);
  $('#menuBtn').click(); $('#mPeek').click();
  $(`[data-turn="${id}"]`).click(); $('#mNewYes').click();
  await dpWait(w, () => D.world !== old);
  if ($('#menu').open) $('#menu').close();
  D.setPlaying(false); D.select(null);
  w.document.getElementById('toast').hidden = true;
}
// カメラ: 一滴の外（2000×1400 µm の外）が映らないように寄せる
function dpCam(w, c) {
  const R = w.__drop.ren, cam = R.cam;
  if (c.z != null) cam.z = c.z;
  if (c.x != null) cam.x = c.x; if (c.y != null) cam.y = c.y;
  const hw = R.w / 2 / cam.z, hh = R.h / 2 / cam.z;
  cam.x = hw * 2 >= 2000 ? 1000 : Math.min(Math.max(cam.x, hw), 2000 - hw);
  cam.y = hh * 2 >= 1400 ? 700 : Math.min(Math.max(cam.y, hh), 1400 - hh);
}
const dpFit = w => w.__drop.ren.fitZoom();
// 一滴の時計を、場面の頭から lt 秒の所まで進める
function dpStepTo(w, s, lt) {
  const W = w.__drop.world, T = dpT0 + (s.simT ? s.simT(lt) : lt * (s.rate || 1));
  while (W.t < T - 1e-6) W.step();
}
async function dpRender(w, SC, t) {
  const s = dpScAt(SC, t), lt = t - s.a, D = w.__drop;
  if (s !== dpCur || t < dpLast || t - dpLast > 0.5) {
    if (s.from) { await dpLoad(w, s.from); dpT0 = D.world.t; }
    dpPick = s.pick ? s.pick(D.world) : null;
    for (const e of s.ev || []) if (e.t <= lt) e.run(w);
    appStep(w, 9);   // 数コマ描いて、グラフ・図鑑・上の数をアプリに書かせる（一滴は止めてある）
    dpCur = s;
  } else for (const e of s.ev || []) if (e.t > dpLast - s.a && e.t <= lt) e.run(w);
  dpStepTo(w, s, lt);
  if (s.cam) dpCam(w, s.cam(lt, D.world, D, dpPick));
  appStep(w, 1);
  dpLast = t;
}
// 追う1匹: まん中に近い・節の多い・狩る者 など
const dpNear = (W, x, y, f = () => true) => W.orgs.filter(f).reduce((a, o) => !a || (o.x - x) ** 2 + (o.y - y) ** 2 < (a.x - x) ** 2 + (a.y - y) ** 2 ? o : a, null);
const dpAt = (o, z) => o && !o.dead ? { x: o.x, y: o.y, z } : { z };
const dpText = (w, sel) => ((w.document.querySelector(sel) || {}).textContent || '').trim();
// 上の数（時間・平均の代・生き物・狩る者）。アプリの上の数は数コマに1回しか書きかえないので、一滴から数える
function dpTime(t) { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60); return h ? `${h}時間${m}分` : m ? `${m}分${s}秒` : `${s}秒`; }
function dpStats(w) {
  const W = w.__drop.world, os = W.orgs, n = os.length;
  return `${dpTime(W.t)}　平均 ${n ? Math.round(os.reduce((a, o) => a + o.gen, 0) / n) + 1 : '–'} 代　生き物 ${n}　狩る者 ${os.filter(o => o.prey > 0).length}`;
}
