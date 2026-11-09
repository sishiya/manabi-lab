// 雲ができるまで（3次元の試作）— 画面の組み立て。計算と描画は sky-sim.js・sky-render.js
import { SkySim, makeBase } from './sky-sim.js?v=3';
import { SkyRender } from './sky-render.js?v=3';

const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const YAW = 0.75;
const cam = (z, pitch, fov, yaw = YAW) => ({ pos: [0, 0, z], yaw, pitch, fov });
// 場面ごとの3次元の格子と視点。空の条件は本編の scenes.js をそのまま借りる
const SKIES = {
  cumulus: { label: '綿雲', nx: 256, dx: 25, nz: 160, Lz: 4000, spongeTop: 800, noise: [0.2, 700], zlo: 350, cams: { up: cam(1.7, 0.45, 62), far: cam(500, 0.2, 36), above: cam(3750, -0.3, 62) } },
  stratocumulus: { label: '層積雲', nx: 256, dx: 25, nz: 128, noise: [0.15, 800], zlo: 80, ground: [0.03, 0.07, 0.1], haze: 14000, cams: { up: cam(1.7, 0.62, 70), far: cam(1500, -0.06, 50), above: cam(2600, -0.55, 62) },
    more: ['雲の上面の混ざり方と雲の水の量は、格子の細かさで変わります（研究の計算は雲の上面で縦 5 m、ここは 10 m）。粗いと混ざりすぎて雲の水が少なく出ます（40分後の雲の水の量: 縦 10 m で 131 g/m²、20 m で 115 g/m²）。', '雲の上面の冷え方は本編と同じ簡単な式で、DYCOMS の研究の式そのものではありません（推定）。'],
    src: '<a href="https://doi.org/10.1175/MWR2930.1" target="_blank" rel="noopener">Stevens ほか 2005</a>（DYCOMS-II RF01。最初の空と、縦の細かさの影響）' },
  fog: { label: '霧', nx: 256, dx: 12.5, nz: 100, noise: [0.2, 300], zlo: 0, windTau: true, dawn: true, first: 'far', cams: { up: cam(1.7, 0.12, 70), far: cam(320, -0.08, 50), above: cam(900, -0.5, 62) },
    more: ['夜の6時間半は2次元の本編で計算し、高さごとの平均を3次元の最初の空にしています。3次元の計算は夜明け前からで、かき混ぜのきっかけに小さなゆらぎ（0.2 K）を足しています。', '霧の厚さは、地面の冷え方を与える層の厚さ（40 m の仮定）に左右されます。', '太陽の動きと地面の熱は同じ時刻に合わせていますが、式でつないではいません（どちらも決めて与えています）。'] },
  altocumulus: { label: 'ひつじ雲', nx: 256, dx: 30, nz: 128, noise: [0.1, 4400], zlo: 2500, haze: 14000, cams: { up: cam(1.7, 0.6, 70), far: cam(1500, 0.2, 40), above: cam(6000, -0.55, 62) },
    more: ['計算するのは高さ 2.5 km から上だけです。その下は仮の床で、地面の熱は入っていません。'] },
  kelvin: { label: '波の雲', nx: 256, dx: 37.5, nz: 128, noise: [0.01, 6000], zlo: 3000, sunRot: 47, haze: 16000,
    gen(base) {   // 本編と同じ波のたね＋湿った層を奥行きの帯にする（奥行きが一様だと端のないすじにしか見えない）
      const K = 2 * Math.PI * 4 / 9600, dx = 37.5, nx = this.nxNow, L = nx * dx, G = z => Math.exp(-Math.pow((z - 4750) / 260, 2));
      return (S, Q_, U, c) => { for (let k = 0; k < base.nz; k++) { const z = base.zc[k], e = Math.exp(-Math.pow((z - 4600) / 350, 2)), g = G(z), r0 = 0.45 + 0.555 * g; for (let j = 0; j < nx; j++) { const m = Math.exp(-Math.pow(((j + 0.5) * dx - L / 2) / (0.21 * L), 4)), f = (0.45 + 0.555 * g * m) / r0; for (let i = 0; i < nx; i++) { const x = c(i, j, k); S[x] += 0.15 * Math.sin(K * (i + 0.5) * dx) * e; Q_[x] *= f; } } } };
    },
    cams: { up: cam(1.7, 0.85, 60, 0.45), far: { pos: [0, -2500, 4700], yaw: 1.57, pitch: 0.1, fov: 24 }, above: cam(7000, -0.45, 62, 0.45) },
    more: ['計算するのは高さ 3 km から上だけです。その下は仮の床です。', '湿った層は、奥行き約 4 km の帯として決めて与えています（端が見えるように）。本編の断面にはない仮定です。', '−4℃くらいの雲も、氷にせず過冷却の水として計算しています。', '波が奥行きの方向にくずれていく様子は、最初の小さなゆらぎ（0.01 K）に左右されます。'] },
};
const SID = SKIES[Q.get('s')] ? Q.get('s') : 'cumulus', SKY = SKIES[SID], CAMS = SKY.cams;
const SCENE = globalThis.CS.SCENES.find(s => s.id === SID);
const HORIZON = SCENE.horizon;
// 太陽は視線の斜め前（正面からの光だと雲が平たく見える）
const SUNS = { morn: { az: -15, el: 13, ex: 0.5, wb: 0.85 }, noon: { az: -50, el: 58, ex: 0.34, wb: 0.5 }, eve: { az: 100, el: 2.2, ex: 0.85, wb: 0.12 }, dawn: { az: -15, el: -4, ex: 1.2, wb: 0.5 } };
const SUNRISE = 7 * 3600;   // 霧の場面で地面があたたまりはじめる時刻（scenes.js）
// 太陽の高さは1時間に 12 度のぼるとする（目安）
function dawnSun(t) { const el = Math.max(-4, (t - SUNRISE) / 3600 * 12), o = SUNS.dawn, a = Math.max(0, Math.min(1, (el + 4) / 24)); if (Math.abs(el - o.el) < 0.1) return false; o.el = el; o.ex = 1.3 + (0.42 - 1.3) * a; return true; }
const DT0 = Math.min(1, SCENE.dtMax);
const CAM0 = SKY.first || 'up';
const state = { running: true, cam: { ...CAMS[CAM0], pos: [...CAMS[CAM0].pos] }, sun: SKY.dawn ? 'dawn' : 'morn', steps: 2, dt: DT0, stat: null, dirty: true, volDirty: true, lastT: 0 };

function fail(msg) { const e = $('err'); e.hidden = false; e.textContent = msg; state.running = false; }

// 雲の種類のボタンと説明（WebGPU が使えなくても出す）。切りかえは格子ごと変わるので読み直す
function setupScenes() {
  const root = $('scns');
  for (const [id, k] of Object.entries(SKIES)) {
    const b = document.createElement('button'); b.textContent = k.label; b.className = id === SID ? 'on' : ''; b.setAttribute('aria-pressed', id === SID);
    b.onclick = () => { if (id === SID) return; Q.set('s', id); location.search = Q.toString(); };
    root.appendChild(b);
  }
  $('aName').textContent = SCENE.name + '（' + SCENE.tag + '）';
  if (SKY.dawn) $('suns').parentElement.hidden = true;
  $('cams').querySelectorAll('button').forEach(b => { const on = b.dataset.v === CAM0; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $('aMore').innerHTML = (SKY.more || []).map(x => '<li>' + x + '</li>').join('');
  if (SKY.src) { const li = document.createElement('li'); li.innerHTML = SKY.src; $('aSrc').appendChild(li); }
  $('aWhy').textContent = SCENE.why; $('aCalc').textContent = SCENE.calc; $('aGiven').textContent = SCENE.given; $('aNote').textContent = SCENE.note || '';
}
setupScenes();

async function init() {
  if (!navigator.gpu) return fail('このブラウザでは WebGPU が使えないため、3次元の計算ができません。Chrome か Edge の新しい版でお試しください。');
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch (e) { /* 下で */ }
  if (!adapter) return fail('GPU を使えません。');
  const L = adapter.limits;
  const dev = await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: L.maxStorageBufferBindingSize, maxBufferSize: L.maxBufferSize, maxStorageBuffersPerShaderStage: Math.min(L.maxStorageBuffersPerShaderStage, 12), maxComputeInvocationsPerWorkgroup: L.maxComputeInvocationsPerWorkgroup } });
  dev.lost.then(i => { if (i.reason !== 'destroyed') fail('GPU との接続が切れました。ページを読み直してください。'); });
  dev.addEventListener('uncapturederror', e => { window.__skyErr = (window.__skyErr || []); window.__skyErr.push(e.error.message); console.error(e.error.message); });

  if (location.hash === '#verify') {
    const { runVerify } = await import('./sky-verify.js');
    const log = m => { $('status').textContent = m; (window.__skyLog = window.__skyLog || []).push(m); };
    window.__skyVerify = await runVerify(dev, log);
    log('確かめ 終わり');
    return;
  }

  const small = Math.min(innerWidth, innerHeight) < 500 || L.maxBufferSize < 4e8 || Q.has('coarse');
  // 小さな画面: 新しい場面は格子を変えずに範囲を半分に（細かさを変えると別の結果になる）。積雲だけは 50 m で確かめ済み
  const coarse = small && SID === 'cumulus', nx = small ? SKY.nx / 2 : SKY.nx, dx = coarse ? SKY.dx * 2 : SKY.dx, nz = +Q.get('nz') || (coarse ? SKY.nz / 2 : SKY.nz), F = SCENE.force;   // nz: 縦の細かさの影響を比べるとき
  const base = makeBase(SCENE, nz, SKY.Lz || SCENE.Lz);
  SKY.nxNow = nx;
  if (small) for (const c of Object.values(CAMS)) c.pos[1] /= 2;
  let gen = SKY.gen && SKY.gen(base), t0 = 0;
  if (SKY.dawn) {   // 夜のぶんは2次元の結果の平均から（tools/fog-night.js）
    const { FOG_START: st } = await import('./fog-start.js'); t0 = st.t;
    gen = (S, Q_, U, c) => { for (let k = 0; k < nz; k++) { const dS = st.s[k] - (base.h0[k] / globalThis.CT.cp - 300), dQ = st.qt[k] - base.qt0[k]; for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) { const x = c(i, j, k); S[x] += dS; Q_[x] = Math.max(0, Q_[x] + dQ); U[x] = st.u[k]; } } };
    dawnSun(t0);
  }
  $('aRange').textContent = `計算は ${(nx * dx / 1000).toFixed(1)} km 四方・高さ ${(base.Lz / 1000).toFixed(1)} km の範囲です（横の細かさ ${dx} m、縦 ${base.dz} m）。遠くの空は同じ範囲のくり返しです。`;
  dev.pushErrorScope('out-of-memory');
  const sim = new SkySim(dev, { nx, ny: nx, dx, dy: dx, base, wind: true, H: F.sfcH, E: F.sfcE, cd: F.cd, hs: F.hs, spongeTop: SKY.spongeTop ?? F.spongeTop, spongeTau: F.spongeTau || 120, het: true, hetAmp: F.het, lw: F.lw, wls: F.wls && (z => F.wls(0, z, 0)), noise: { amp: SKY.noise[0], zTop: SKY.noise[1] }, windTau: SKY.windTau ? F.windTau : 0, t0, gen });
  const oom = await dev.popErrorScope();
  if (oom) { if (small) return fail('GPU のメモリが足りません。'); Q.set('coarse', '1'); location.search = Q.toString(); return; }   // メモリが足りないときは粗い計算で開きなおす
  const cv = $('cv');
  const fit = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5), MP = small ? 0.55e6 : 1.1e6;
    let w = innerWidth * dpr, h = innerHeight * dpr; const s = Math.min(1, Math.sqrt(MP / (w * h)));
    cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s)); state.dirty = true;
  };
  fit(); addEventListener('resize', fit);
  const rd = new SkyRender(dev, cv, sim, { zlo: SKY.zlo, ground: SKY.ground, haze: SKY.haze });
  const applySun = () => { const s = SUNS[state.sun]; rd.setSun(s.az + (SKY.sunRot || 0), s.el, s.wb); state.volDirty = true; state.dirty = true; };
  applySun();
  window.__sky = { sim, rd, state, dev, CAMS, SUNS };

  // 計算のループ（GPU を待ってから次へ。つめこみすぎない）
  let frames = 0, lastSpeedT = performance.now(), lastSpeedSim = sim.t;
  (async function simLoop() {
    while (true) {
      if (!state.running || Power.away) { await new Promise(r => setTimeout(r, 120)); continue; }
      const t0 = performance.now();
      for (let i = 0; i < state.steps; i++) sim.step(state.dt);
      await dev.queue.onSubmittedWorkDone();
      const ms = performance.now() - t0;
      state.steps = ms > 40 ? Math.max(1, state.steps - 1) : ms < 22 ? Math.min(12, state.steps + 1) : state.steps;
      if (SKY.dawn && dawnSun(sim.t)) applySun();
      state.volDirty = true; state.dirty = true;
      if (++frames % 6 === 0) {
        const st = await sim.stats();
        if (st) {
          state.stat = st;
          if (st.bad > 0) return fail('計算が破綻しました（速さの値が大きくなりすぎました）。ページを読み直してください。');
          state.dt = Math.min(SCENE.dtMax, Math.max(0.25, 0.5 / (st.um / sim.dx + st.vm / sim.dy + st.wm / sim.dz + 1e-3)));
          showStat(st);
        }
      }
      if (sim.t >= HORIZON) { setRunning(false); $('status').textContent = '計算が終わりました'; }
    }
  })();

  // 描画（動いていないときは描き直さない）
  function frame() {
    requestAnimationFrame(frame);
    if (!state.dirty || Power.away) return;
    state.dirty = false;
    const enc = dev.createCommandEncoder();
    if (state.volDirty) { rd.updateVolume(enc); state.volDirty = false; }
    rd.draw(enc, state.cam, SUNS[state.sun].ex);
    dev.queue.submit([enc.finish()]);
    if (state.running) {
      const now = performance.now();
      if (now - lastSpeedT > 1000) { const sp = (sim.t - lastSpeedSim) / ((now - lastSpeedT) / 1000); lastSpeedT = now; lastSpeedSim = sim.t; $('status').textContent = `計算中…（${Math.round(sp)}倍の速さ）`; }
    }
    $('time').textContent = SKY.dawn ? (sim.t < SUNRISE ? '日の出まで' + fmtT(SUNRISE - sim.t) : '日の出から' + fmtT(sim.t - SUNRISE)) : fmtT(sim.t);
  }
  requestAnimationFrame(frame);

  function showStat(s) {
    $('rBase').textContent = s.base === null ? '—' : (s.base / 1000).toFixed(2) + ' km';
    $('rTop').textContent = s.top === null ? '—' : (s.top / 1000).toFixed(2) + ' km';
    $('rCov').textContent = Math.round(s.cover * 100) + '%';
    $('rW').textContent = s.wm.toFixed(1) + ' m/s';
  }
  const fmtT = t => { const m = Math.floor(t / 60); return m >= 60 ? `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, '0')}分` : `${m}分`; };
  function setRunning(v) { state.running = v; $('play').textContent = v ? '⏸' : '▶'; $('play').setAttribute('aria-pressed', v ? 'true' : 'false'); if (!v) $('status').textContent = '止めています'; }
  $('play').onclick = () => setRunning(!state.running);
  $('reset').onclick = () => { sim.reset(); state.volDirty = true; state.dirty = true; state.dt = DT0; state.stat = null; lastSpeedSim = sim.t; if (SKY.dawn) { SUNS.dawn.el = 99; dawnSun(sim.t); applySun(); } ['rBase', 'rTop'].forEach(k => $(k).textContent = '—'); $('rCov').textContent = '0%'; $('rW').textContent = '—'; setRunning(true); };
  const chips = (root, cb) => root.querySelectorAll('button').forEach(b => b.onclick = () => { root.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); cb(b.dataset.v); });
  chips($('cams'), v => { state.cam = { ...CAMS[v], pos: [...CAMS[v].pos] }; state.dirty = true; });
  chips($('suns'), v => { state.sun = v; applySun(); });

  // 見回す（指・マウスでなぞる）
  let drag = null;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: state.cam.yaw, pitch: state.cam.pitch }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const k = state.cam.fov / 60 * 0.0042;
    state.cam.yaw = drag.yaw + (e.clientX - drag.x) * k;
    state.cam.pitch = Math.max(-0.35, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * k));
    state.dirty = true;
  });
  const end = () => { drag = null; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  let was = true;
  Power.on({ pause() { was = state.running; }, resume() { if (was) state.dirty = true; } });
}
init().catch(e => { console.error(e); window.__skyErr = (window.__skyErr || []).concat(String(e)); fail('準備に失敗しました: ' + e.message); });
