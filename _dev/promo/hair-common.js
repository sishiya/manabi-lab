// 脱毛のしくみの台本（hair-removal.html・hair-removal-guide.html）で共通の部分
// アプリの描画ループは使わず、動画の時刻 t から アプリの日 S.t・手入れの記録 S.events・道具・マウスの位置を決めて __hare.draw() を呼ぶ
// 場面 SC = [{ a, b, day（a のときの日）, speed（1秒あたりの日）, site, pre: [手入れ {day, type, idx}], acts: [{ t（動画の秒）, type, idx }],
//   tool, ptr(t, w) → {x, y}（断面の点。0〜1 の割合）, razor: [a, b, x0, x1]（動画の秒と、刃をすべらせる横の割合）, view, set(w) }]
// 手入れは決まった日の格子にのせるので、とびとびの時刻でも、続けて描いても同じ絵になる
'use strict';
const hrScAt = (SC, t) => SC.find(s => t < s.b) || SC[SC.length - 1];
// 場面の鍵: reset（新しい肌）・jumps（とばした日）・razors（刃を何回も）・carry（hrRender の opt）
function hrSize(w, cw, ch) {
  const st = w.document.createElement('style');
  st.textContent = `#stage{position:fixed!important;left:0!important;top:0!important;width:${cw}px!important;height:${ch}px!important;z-index:5;background:#0f1a26}
    #tip,#toast{display:none!important}`;
  w.document.head.append(st);
}
// 断面の上の点（割合）→ canvas の点（css px）。毛穴 i の出口は hrHole
const hrG = w => w.eval('GEOM');
function hrHole(w, i, dy = 0) { const G = hrG(w); return { x: G.xs[i], y: G.y0 + dy * G.s }; }
// 全体表示（拡大なし）のときの毛穴の出口の x。刃の位置は全体表示で決める（拡大した場面から前の場面の手入れを数えても同じになる）
function hrFullXs(w) { const G = hrG(w), LY = w.eval('layout')(G.w, G.h, 10, null), gap = w.eval('SIM').gapMM; return Array.from({ length: 10 }, (_, i) => LY.ox + (0.8 + i * gap) * LY.s); }
// 日: a のときの日＋速さ×経った秒＋とばした日（jumps: [[経った秒, 足す日]]。+1か月 などのボタン）
const hrDay = (s, t) => { const lt = Math.max(0, t - s.a); return s.day + lt * (s.speed || 0) + (s.jumps || []).reduce((d, j) => d + (lt >= j[0] ? j[1] : 0), 0); };
const hrGrid = d => Math.floor(d / 0.25 + 1e-9) * 0.25;
const hrRazors = s => (s.razors || []).concat(s.razor ? [s.razor] : []);
// 場面 s の手入れのうち、動画の時刻 t までに行ったもの
function hrSceneEvents(w, s, t) {
  const ev = (s.pre || []).map(e => ({ t: hrGrid(e.day), type: e.type, idx: e.idx.slice().sort((a, b) => a - b) }));
  const G = hrG(w), xs = hrFullXs(w);
  for (const [ra, rb, x0, x1] of hrRazors(s)) {   // 刃が毛穴の出口を通った時刻に、その毛穴を剃る（アプリの razorPass と同じ）
    if (G.w) xs.forEach((x, i) => { const k = (x / G.w - x0) / (x1 - x0), tt = s.a + ra + k * (rb - ra); if (k >= 0 && k <= 1 && tt <= t) ev.push({ t: hrGrid(hrDay(s, tt)), type: 'shave', idx: [i], g: 1 }); });
  }
  for (const e of s.acts || []) if (e.t <= t) ev.push({ t: hrGrid(hrDay(s, e.t)), type: e.type, idx: (typeof e.idx === 'function' ? e.idx(w) : e.idx).slice().sort((a, b) => a - b) });
  return ev;
}
let hrKey = '', hrSite = '', hrPrevT = -1;
// opt.carry: 前の場面の手入れを引きつぐ（説明動画は1つの肌でずっと続ける）。reset: true の場面からは新しい肌
function hrRender(w, SC, t, opt = {}) {
  const H = w.__hare, S = H.S, s = hrScAt(SC, t), si = SC.indexOf(s);
  if (t < hrPrevT) S.ghostSeen.clear();   // とびとびに見るとき（確かめ用のコマ）は抜けていく毛の時計を戻す
  hrPrevT = t;
  w.__now = t * 1000;                     // アプリの performance.now（抜けていく毛の動き）を動画の時刻に
  let ev = [];
  if (opt.carry && !s.reset) { let k = si; while (k > 0 && !SC[k].reset) k--; for (let j = k; j < si; j++) ev = ev.concat(hrSceneEvents(w, SC[j], SC[j].b)); }
  ev = ev.concat(hrSceneEvents(w, s, t));
  const seen = new Set();
  ev = ev.filter(e => { const k = e.t + e.type + e.idx; if (seen.has(k)) return false; seen.add(k); return true; });
  ev.sort((a, b) => a.t - b.t);
  const site = s.site || 'shin', key = site + '|' + JSON.stringify(ev);
  if (key !== hrKey) {
    S.site = site; S.events = ev;
    w.eval('changed()');
    hrKey = key;
  }
  S.t = hrDay(s, t);
  S.playing = false;
  S.view = s.view ? (typeof s.view === 'function' ? s.view(t - s.a, w) : s.view) : null;
  S.tool = s.tool || 'look';
  S.hover = null; S.stroke = null; S.ptr = null;
  const G = hrG(w);
  if (s.ptr) { const p = s.ptr(t - s.a, w); if (p) S.ptr = p; }
  for (const [a, b, x0, x1] of G.w ? hrRazors(s) : []) {
    const lt = t - s.a;
    if (lt >= a - 0.4 && lt <= b + 0.4) {
      const k = clamp((lt - a) / (b - a), 0, 1), x = lerp(x0, x1, k) * G.w;
      S.ptr = { x, y: G.y0 - 2 };
      if (lt >= a && lt <= b) S.stroke = { a: x0 * G.w, b: x, done: new Set(), g: 1 };
    }
  }
  if (S.tool === 'pluck' && S.ptr) S.hover = w.eval('pickHair')(S.ptr.x, S.ptr.y);
  if (s.set) s.set(w, t - s.a);
  H.draw();
}
// アプリの「できごと」で、この日までのもの（新しい順）
function hrLog(w, n = 3) {
  const S = w.__hare.S;
  return S.full.log.filter(e => e.t <= S.t + 1e-9 && e.kind !== 'safe' && e.kind !== 'cut').slice(-n).reverse()
    .map(e => w.L(`${Math.floor(e.t)}日目${e.i == null ? '' : ' 毛穴' + (e.i + 1)}: ${e.text}`, ''));
}
const hrNow = w => ((w.document.getElementById('now') || {}).textContent || '').trim();
const hrCounts = w => ((w.document.getElementById('counts') || {}).textContent || '').trim();
const hrDayText = w => ((w.document.getElementById('day') || {}).textContent || '').trim();
// 光の結果（アプリの断面の右上の箱と同じ値）
function hrFlash(w) {
  const S = w.__hare.S, F = (S.run && (S.run.flashes || []).filter(x => x.t <= S.t + 1e-9).pop());
  return F || null;
}
// 部分の説明（しらべる の吹き出しと同じ文。タグを取る）
const hrPart = (w, k) => String(w.eval('PARTS')[k] || '').replace(/<[^>]+>/g, '');
// top: アプリに <head> がなく <header> があるので、差しかえを先頭に入れる（入れないと css が読めない。README の inject.top）
const HR_INJECT = { dpr: 4, raf: true, top: true, pre: 'window.__now = 0; performance.now = () => window.__now;' };
