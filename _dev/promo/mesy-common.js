// メトロノームがそろうまでの台本（metronome-sync.html・metronome-sync-guide.html）で共通の部分
// アプリの描画ループは止めて（inject.raf）、動画の時刻 t から計算の時刻を決めて SIM.advance・__mesy.draw をこちらで呼ぶ（う2 の台本と同じやり方）
// 場面 SEG = [{ a, b（動画の秒）, rate（1秒あたり計算の何秒）, opt（SIM.reset に渡す設定）, pin（板をおさえる）,
//   reset: true（新しく始める。ないときは前の場面の続き）, live: {…}（続きのまま SIM.setLive）, pokes: [{ t（動画の秒）, i, dir }] }]
'use strict';
const MS_INJECT = { raf: true, dpr: 2, top: true };   // top: <head> のないページなので、差しかえを先頭に入れる
const msSeg = (SEG, t) => SEG.find(s => t < s.b) || SEG[SEG.length - 1];
// 場面 s の動画の時刻 t のときの、計算の時刻（場面のつながりのはじめからの秒）
function msSimT(SEG, t) {
  const s = msSeg(SEG, t); let k = SEG.indexOf(s), sum = (Math.max(s.a, Math.min(t, s.b)) - s.a) * s.rate;
  while (!SEG[k].reset) { k--; sum += (SEG[k].b - SEG[k].a) * SEG[k].rate; }
  return sum;
}
// 計算の時刻 → 動画の時刻（カチの音の時刻に）
function msVidT(SEG, k0, simT) {
  let acc = 0;
  for (let k = k0; k < SEG.length && (k === k0 || !SEG[k].reset); k++) {
    const s = SEG[k], len = (s.b - s.a) * s.rate;
    if (simT <= acc + len + 1e-9) return { t: s.a + (simT - acc) / s.rate, s };
    acc += len;
  }
  return null;
}
// 計算の時刻に置きなおした、つつく・途中で変えることの表
function msEvents(SEG, k0) {
  const ev = []; let acc = 0;
  for (let k = k0; k < SEG.length && (k === k0 || !SEG[k].reset); k++) {
    const s = SEG[k];
    if (k !== k0 && (s.live || s.pin !== undefined)) ev.push({ at: acc, live: s.live, pin: s.pin });
    for (const p of s.pokes || []) ev.push({ at: acc + (p.t - s.a) * s.rate, poke: p });
    acc += (s.b - s.a) * s.rate;
  }
  return ev.sort((x, y) => x.at - y.at);
}
let msCur = null, msK0 = -1, msEv = [];
function msStart(w, SEG, k) {
  const SIM = w.__mesy.SIM, s = SEG[k];
  SIM.reset(s.opt); SIM.S.sys.pinned = !!s.pin; SIM.S.speed = 1; SIM.S.playing = true;
  msCur = 0; msK0 = k; msEv = msEvents(SEG, k);
}
// 計算を simT まで進める（つつく・設定を変えるのは、その時刻でとめて行う）
function msAdvance(w, simT) {
  const SIM = w.__mesy.SIM;
  SIM.S.speed = 1;
  while (msCur < simT - 1e-9) {
    const e = msEv.find(e => e.at > msCur + 1e-9 && e.at <= simT + 1e-9);
    const stop = e ? e.at : simT;
    while (msCur < stop - 1e-9) {
      const d = Math.min(5, stop - msCur), steps = Math.round(d / SIM.DT);
      SIM.advance(steps * SIM.DT); msCur += steps * SIM.DT;
      if (steps === 0) break;
    }
    if (e) {
      if (e.live) SIM.setLive(e.live);
      if (e.pin !== undefined) SIM.S.sys.pinned = e.pin;
      if (e.poke) SIM.poke(e.poke.i, e.poke.dir);
      msCur = Math.max(msCur, e.at);
    }
    if (!e) break;
  }
}
// アプリの計算を動画の時刻 t の状態にして描く（戻るときは つながりのはじめからやり直す）
function msRender(w, SEG, t) {
  const s = msSeg(SEG, t); let k = SEG.indexOf(s); while (!SEG[k].reset) k--;
  const want = msSimT(SEG, t);
  if (k !== msK0 || msCur === null || want < msCur - 1e-6) msStart(w, SEG, k);
  msAdvance(w, want);
  w.__mesy.SIM.S.speed = s.rate;   // グラフの見える幅（アプリでは速さ×30 秒）
  w.__mesy.draw();
}
// カチの音の時刻（等倍の場面だけ）。計算をはじめから流して集める
function msTicks(w, SEG, end) {
  const SIM = w.__mesy.SIM, out = [];
  for (let k = 0; k < SEG.length; k++) {
    if (!SEG[k].reset || SEG[k].a >= end) continue;
    msStart(w, SEG, k);
    SIM.S.onTick = i => { const v = msVidT(SEG, k, SIM.S.sys.t); if (v && v.s.rate === 1 && v.t < end) out.push([v.t, i]); };   // sys.t は始めてからの計算の秒
    let last = SEG[k].b; for (let j = k + 1; j < SEG.length && !SEG[j].reset; j++) last = SEG[j].b;
    msAdvance(w, msSimT(SEG, Math.min(last, end) - 1e-6));
  }
  SIM.S.onTick = null; msCur = null; msK0 = -1;
  return out;
}
// カチの音（アプリの音と同じく短い四角い波。BGM とは別の音量）
function msTickAudio(ticks, n0 = 2) {
  return async (ctx, out) => {
    const bus = ctx.createGain(); bus.gain.value = 0.2; bus.connect(out);
    for (const [t, i] of ticks) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1800 + 140 * (i % 10);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.001); g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      const p = ctx.createStereoPanner(); p.pan.value = clamp((i - (n0 - 1) / 2) * 0.3, -0.8, 0.8);
      o.connect(g); g.connect(p); p.connect(bus); o.start(t); o.stop(t + 0.05);
    }
  };
}
// 測る: 条件 opt で始めて、そろい具合 r が thr をこえる時刻（秒、max まで）。おさえる pin
function msSyncTime(w, opt, pin, thr = 0.98, max = 300) {
  const SIM = w.__mesy.SIM;
  SIM.reset(opt); SIM.S.sys.pinned = !!pin; SIM.S.speed = 1; SIM.S.playing = true; SIM.S.onTick = null;
  for (let t = 0; t < max; t += 0.5) { SIM.advance(0.5); if (SIM.order() > thr) return t + 0.5; }
  return null;
}
// 測る: そろい具合 r が thr より下になった最後の時刻（T 秒まで）＝ 行ったり来たりがおさまって、そろったままになる時刻
// （はじめて thr をこえる時刻は、行きすぎてまたずれることがあるので使わない）
function msSettle(w, opt, thr = 0.95, T = 300) {
  const SIM = w.__mesy.SIM;
  SIM.reset(opt); SIM.S.sys.pinned = false; SIM.S.speed = 1; SIM.S.playing = true; SIM.S.onTick = null;
  let last = 0; for (let t = 0; t < T; t += 0.5) { SIM.advance(0.5); if (SIM.order() < thr) last = t + 0.5; }
  return last;
}
// 1台目と2台目のずれ（度、0〜180）。いまの状態
const msDiffDeg = w => { const h = w.__mesy.SIM.S.hist.at(-1); return h && h.d.length ? Math.abs(h.d[0]) * 180 / Math.PI : 0; };
// 板のゆれの振れはば（mm）: いまから 2 秒の最大と最小の半分
function msSway(w) {
  const SIM = w.__mesy.SIM; let lo = 1, hi = -1;
  for (let i = 0; i < 400; i++) { SIM.advance(0.005); const x = SIM.S.sys.y[0]; lo = Math.min(lo, x); hi = Math.max(hi, x); }
  return (hi - lo) / 2 * 1000;
}
// アプリの図の大きさを決める（css px）。グラフの canvas も
function msSize(w, cw, ch, gw, gh) {
  const st = w.document.createElement('style');
  st.textContent = `#app{max-width:none!important;margin:0!important}
    #cvwrap{position:fixed!important;left:0;top:0;width:${cw}px!important;height:${ch}px!important;min-height:0!important}
    #gv{position:fixed!important;left:0;top:${ch + 10}px;width:${gw}px!important;height:${gh}px!important}
    #hold{display:none!important}`;
  w.document.head.append(st);
  w.eval('resize()');
}
