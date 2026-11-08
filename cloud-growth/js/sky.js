// 雲ができるまで（3次元の試作）— 画面の組み立て。計算と描画は sky-sim.js・sky-render.js
import { SkySim, makeBase } from './sky-sim.js';
import { SkyRender } from './sky-render.js';

const $ = id => document.getElementById(id);
const SCENE = globalThis.CS.SCENES.find(s => s.id === 'cumulus');
const HORIZON = 3 * 3600;
const CAMS = {
  up:   { pos: [0, 0, 1.7],     yaw: 0.75,  pitch: 0.55, fov: 78 },
  far:  { pos: [0, 0, 500],     yaw: 0.75,  pitch: 0.16, fov: 50 },
  above: { pos: [0, 0, 3750],   yaw: 0.75,  pitch: -0.3, fov: 62 },
};
const SUNS = { morn: { az: -150, el: 11, ex: 0.55, wb: 0.7 }, noon: { az: -130, el: 55, ex: 0.34, wb: 0.3 }, eve: { az: -125, el: 3.5, ex: 0.75, wb: 0.28 } };
const state = { running: true, cam: { ...CAMS.up, pos: [...CAMS.up.pos] }, sun: 'morn', steps: 2, dt: 1, stat: null, dirty: true, volDirty: true, lastT: 0 };

function fail(msg) { const e = $('err'); e.hidden = false; e.textContent = msg; state.running = false; }

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

  const small = Math.min(innerWidth, innerHeight) < 500 || L.maxBufferSize < 4e8 || location.search.includes('coarse');
  const nx = small ? 128 : 256, dx = small ? 50 : 25, F = SCENE.force;
  const base = makeBase(SCENE, small ? 80 : 160, 4000);
  dev.pushErrorScope('out-of-memory');
  const sim = new SkySim(dev, { nx, ny: nx, dx, dy: dx, base, wind: true, H: F.sfcH, E: F.sfcE, cd: F.cd, hs: F.hs, spongeTop: 800, spongeTau: 120, het: true, noise: { amp: 0.2, zTop: 700 } });
  const oom = await dev.popErrorScope();
  if (oom) { if (small) return fail('GPU のメモリが足りません。'); location.replace('sky.html?coarse'); return; }   // メモリが足りないときは粗い計算で開きなおす
  const cv = $('cv');
  const fit = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5), MP = small ? 0.55e6 : 1.1e6;
    let w = innerWidth * dpr, h = innerHeight * dpr; const s = Math.min(1, Math.sqrt(MP / (w * h)));
    cv.width = Math.round(w * s); cv.height = Math.round(h * s); state.dirty = true;
  };
  fit(); addEventListener('resize', fit);
  const rd = new SkyRender(dev, cv, sim);
  const applySun = () => { const s = SUNS[state.sun]; rd.setSun(s.az, s.el, s.wb); state.volDirty = true; state.dirty = true; };
  applySun();
  window.__sky = { sim, rd, state, dev, CAMS, SUNS };

  // 計算のループ（GPU を待ってから次へ。つめこみすぎない）
  let frames = 0, lastSpeedT = performance.now(), lastSpeedSim = 0;
  (async function simLoop() {
    while (true) {
      if (!state.running || Power.away) { await new Promise(r => setTimeout(r, 120)); continue; }
      const t0 = performance.now();
      for (let i = 0; i < state.steps; i++) sim.step(state.dt);
      await dev.queue.onSubmittedWorkDone();
      const ms = performance.now() - t0;
      state.steps = ms > 40 ? Math.max(1, state.steps - 1) : ms < 22 ? Math.min(12, state.steps + 1) : state.steps;
      state.volDirty = true; state.dirty = true;
      if (++frames % 6 === 0) {
        const st = await sim.stats();
        if (st) {
          state.stat = st;
          if (st.bad > 0) return fail('計算が破綻しました（速さの値が大きくなりすぎました）。ページを読み直してください。');
          state.dt = Math.min(2.5, Math.max(0.25, 0.5 / (st.um / sim.dx + st.vm / sim.dy + st.wm / sim.dz + 1e-3)));
          showStat(st);
        }
      }
      if (sim.t >= HORIZON) { setRunning(false); $('status').textContent = '3時間ぶんの計算が終わりました'; }
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
    $('time').textContent = fmtT(sim.t);
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
  $('reset').onclick = () => { sim.reset(); state.volDirty = true; state.dirty = true; state.dt = 1; state.stat = null; lastSpeedSim = 0; ['rBase', 'rTop'].forEach(k => $(k).textContent = '—'); $('rCov').textContent = '0%'; $('rW').textContent = '—'; setRunning(true); };
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
