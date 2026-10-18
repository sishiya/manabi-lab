// エジソンの蓄音機 — メイン（worklet からの様子を受けて描く・デバッグ用の窓口）
'use strict';
const S = { x: 0, om: 0, z: -0.4e-3, z0: -0.4e-3, q: [0, 0, 0, 0, 0], Fc: 0, contact: false, mode: 'up', atEnd: false, win: null, half: 400, pIn: 0, pOut: 0, clip: 0, seg: null };
const cv = document.getElementById('cv'), g = cv.getContext('2d'), hud = document.getElementById('hud');
let wavesDirty = false, foilDirty = true, clipT = 0;

Audio.onSnap = m => {
  if (m.t !== 'snap') return;
  for (const k of ['x', 'om', 'z', 'z0', 'q', 'Fc', 'contact', 'mode', 'atEnd', 'win', 'half', 'pIn', 'pOut']) S[k] = m[k];
  if (m.clip) clipT = performance.now();
  if (m.wIn) { Panels.setWaves(m.wIn, m.wOut); wavesDirty = true; }
  if (m.seg) { S.seg = m.seg; foilDirty = true; }
  foilDirty = foilDirty || S.om > 0;
};

function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0); wavesDirty = foilDirty = true;
}
const dBof = p => p > 0 ? (20 * Math.log10(p / 20e-6)).toFixed(0) : '—';
function hudText() {
  const P = PhonoPhys.P, circ = 2 * Math.PI * P.R, rpm = S.om * 60 / (2 * Math.PI);
  const md = S.mode === 'rec' ? '<span class="rec">● 録音</span>' : S.mode === 'play' ? '<span class="play">▶ 再生</span>' : '針は上';
  const lines = [md + (S.atEnd ? '　箔の終わり' : ''),
    '毎分 <b>' + rpm.toFixed(0) + '</b> 回転　' + (S.x / circ + 1).toFixed(1).padStart(4) + ' 周目',
    S.mode === 'up' ? '' : '針の深さ <b>' + (S.z * 1e3).toFixed(3) + '</b> mm' + (S.contact ? '' : '　<span class="rec">はねている</span>'),
    S.mode === 'rec' ? '入れた音 <b>' + dBof(S.pIn) + '</b> dB' : S.mode === 'play' ? '耳もと 30 cm <b>' + dBof(S.pOut) + '</b> dB' : ''];
  if (performance.now() - clipT < 800) lines.push('<span class="rec">スピーカーで割れています（音量を下げて）</span>');
  if (!Audio.ready) lines.push(Audio.err ? '<span class="rec">音が使えません: ' + Audio.err + '</span>' : '');
  hud.innerHTML = lines.filter(Boolean).join('\n');
}
let last = performance.now(), lastFoil = 0, loopT = 0;
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // 最初のコマは now が last より前のことがある
  if (typeof UI === 'undefined') { requestAnimationFrame(loop); return; }   // ui.js がまだ読まれていない（読みこみの合間にコマが来ることがある）
  const st = UI.st; st.Z = Math.exp(Math.log(st.Z) + (Math.log(st.Zt) - Math.log(st.Z)) * Math.min(1, dt * 5));
  const w = cv.clientWidth, h = cv.clientHeight;
  if (w > 0 && h > 0) Draw.frame(g, w, h, S, st.Z);
  hudText();
  if (UI.st.loopEnd && S.mode === 'play' && S.x > UI.st.loopEnd && now - loopT > 1000) { loopT = now; Audio.send({ t: 'rewind' }); }   // 案内のあいだだけ、録った所の終わりで、はじめにもどす
  if (wavesDirty) { Panels.waves(document.getElementById('wv'), Audio.ctx ? Audio.ctx.sampleRate : 48000); wavesDirty = false; }
  if (foilDirty && now - lastFoil > 150) { Panels.foil(document.getElementById('fv'), S); foilDirty = false; lastFoil = now; }
  requestAnimationFrame(loop);
}
window.addEventListener('resize', resize);
resize(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・音を出さずにページの中で計算する（ペインが隠れていても使える。RULES 5）
window.__ph = {
  S,
  draw() { Draw.frame(g, cv.clientWidth, cv.clientHeight, S, UI.st.Z); },
  // 計算で作った音を sec 秒録って、同じ速さで再生した結果（溝のふれと耳もとの dB）
  offline(kind = 'vowel', dB = 115, rpm = 60, sec = 2) {
    if (!window.PhonoSrc) return 'sources.js を読んでいません';
    const fs = 48000, ph = new PhonoPhys.Phono(fs), src = new PhonoSrc.Source(fs, kind), b = new Float32Array(128), o = new Float32Array(128), om = rpm * 2 * Math.PI / 60;
    ph.setCrank(true, om); for (let i = 0; i < fs * 0.3 / 128; i++) ph.process(null, o, 128);
    ph.rewind(); ph.setMode('rec'); for (let i = 0; i < fs * sec / 128; i++) { src.fill(b, 128, dB); ph.process(b, null, 128); }
    ph.setMode('up'); ph.rewind(); ph.setMode('play'); let ss = 0, n = 0;
    for (let i = 0; i < fs * sec / 128; i++) { ph.process(null, o, 128); if (i > fs * 0.3 / 128) { for (const v of o) ss += v * v; n += 128; } }
    Object.assign(S, { x: ph.x, z: ph.z0 + ph.wCenter(), z0: ph.z0, q: Array.from(ph.q), win: ph.window(400, new Float32Array(801)), mode: 'play', contact: ph.contact }); ph.updateSegs(); S.seg = ph.seg.slice(); foilDirty = true;
    return { dB: +dBof(Math.sqrt(ss / n)) };
  },
};
