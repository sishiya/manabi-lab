// 熱帯雨林の音 — 第二弾: 森をブラウザの中で重ねて鳴らす（声ごとに ON／OFF できるように）
// 土台（audio/bed.m4a、3分）をくり返し、鳥の切り出し（audio/birds.m4a に並べてある）を data/forest.json の表どおりの時刻に鳴らす。
// 声ごとに  切り出し → 大きさを測る（光らせる用） → ON／OFF のつまみ → まとめ → 図・スピーカー
'use strict';
window.Forest = (() => {
  let ctx = null, out = null, data = null, bedBuf = null, birdBuf = null, raw = null;
  const ch = {};            // 声ごと: { gain, an, buf, on }
  let playing = false, t0 = 0, pausedAt = 0, timer = 0, srcs = [], nextIdx = 0, loopN = 0, bedSrc = null;
  const AHEAD = 0.6;        // 先にいくつ予約するか（秒）

  async function prefetch() {   // 押す前に読みこんでおく（デコードは音の道すじを作ってから）
    data = await (await fetch('data/forest.json')).json();
    raw = await Promise.all([data.bed.file, data.birds_file].map(u => fetch(u).then(r => r.arrayBuffer())));
    return data;
  }
  async function init(context, dest) {
    if (ctx) return;
    ctx = context; out = ctx.createGain(); out.connect(dest);
    [bedBuf, birdBuf] = await Promise.all(raw.map(b => ctx.decodeAudioData(b.slice(0))));
    for (const id of ['bed', ...data.species.map(s => s.code)]) {
      const an = ctx.createAnalyser(); an.fftSize = 512;
      const g = ctx.createGain(), b = ctx.createGain(); an.connect(g).connect(b).connect(out);
      ch[id] = { an, gain: g, boost: b, buf: new Float32Array(an.fftSize), on: pending[id] !== false };
      g.gain.value = ch[id].on ? 1 : 0;
    }
    boost(pendingBoost);
  }
  const pending = {};       // 音の道すじを作る前に押された ON／OFF
  const now = () => (ctx.currentTime - t0);               // 森の時計（くり返しをふくむ秒）
  function schedule() {
    if (!playing) return;
    const L = data.length_s, until = now() + AHEAD;
    for (;;) {
      const e = data.events[nextIdx], at = loopN * L + (e ? e[1] : L);
      if (!e) { nextIdx = 0; loopN++; continue; }
      if (at > until) break;
      if (at >= now() - 0.05) {
        const s = ctx.createBufferSource(); s.buffer = birdBuf; s.connect(ch[e[0]].an);
        s.start(t0 + at, e[2], e[3]); srcs.push(s); s.onended = () => { srcs = srcs.filter(x => x !== s); };
      }
      nextIdx++;
    }
  }
  function start() {
    if (playing) return;
    const L = data.length_s, off = pausedAt % L;
    t0 = ctx.currentTime - pausedAt; loopN = Math.floor(pausedAt / L);
    nextIdx = data.events.findIndex(e => e[1] >= off); if (nextIdx < 0) { nextIdx = 0; loopN++; }
    bedSrc = ctx.createBufferSource(); bedSrc.buffer = bedBuf; bedSrc.loop = true; bedSrc.connect(ch.bed.an);
    bedSrc.start(ctx.currentTime, off);
    playing = true; schedule(); timer = setInterval(schedule, 150);
  }
  function stop() {
    if (!playing) return;
    pausedAt = now(); playing = false; clearInterval(timer);
    try { bedSrc.stop(); } catch (e) { }
    for (const s of srcs) try { s.stop(); } catch (e) { }
    srcs = [];
  }
  function set(id, on) {
    pending[id] = on;
    const c = ch[id]; if (!c) return; c.on = on;
    c.gain.gain.setTargetAtTime(on ? 1 : 0, ctx ? ctx.currentTime : 0, 0.08);   // ぷつっと切れないように少しなめらかに
  }
  function level(id) {             // いまの大きさ（dBFS）。ON／OFF の前で測るので、消している声が鳴っていることも分かる
    const c = ch[id]; if (!c) return -120;
    c.an.getFloatTimeDomainData(c.buf); let p = 0; for (const v of c.buf) p += v * v;
    return 10 * Math.log10(p / c.buf.length + 1e-12);
  }
  const BOOST_DB = 20;      // 鳥の声をまとめて大きくする（土台を消して鳥だけ聞くとき。cards.js が決める）
  function boost(db) {
    pendingBoost = db; if (!ctx) return;
    const v = 10 ** (db / 20);
    for (const id in ch) if (id !== 'bed') ch[id].boost.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
  }
  let pendingBoost = 0;
  return {
    prefetch, init, start, stop, set, level, boost, BOOST_DB,
    get pendingBoost() { return pendingBoost; },
    get data() { return data; }, get playing() { return playing; }, get ready() { return !!bedBuf; },
    get time() { return ctx ? (playing ? now() : pausedAt) % data.length_s : 0; }, isOn: id => ch[id] ? ch[id].on : pending[id] !== false,
  };
})();
