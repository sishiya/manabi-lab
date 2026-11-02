// 画面と計算のつなぎ: 計算を Web Worker で回し（js/worker.js）、届いた数から「一滴の写し」を組み立てる。
// ?noworker のとき・Worker が使えないときは、今までどおり画面側で一滴を回す（確かめの道具は一滴を直接動かすのでこちら）
import { World, DT, setField } from './sim.js';
import { restore, snapshot } from './snap.js';
import { saveWorld, get } from './save.js';
import { analyze } from './body.js';
import { PRESETS } from './presets.js';

const OF = ['id', 'x', 'y', 'a', 'r', 'e', 'eS', 'colN', 'colR', 'inner', 'anch', 'colAnch', 'ax', 'ay', 'sym', 'mateT', 'mate', 'clade', 'hue', 'gen', 'ate', 'prey', 'kids', 'mixes', 'age', 'bId', 'xbId', 'gId', 'nLinks'];
const BOOL = new Set(['inner', 'anch', 'colAnch']);

// 一滴の写し（描く・札・グラフが読む分だけ）
class Mirror {
  constructor(m) {
    this.size = m.size; this.seed = m.seed; setField(m.size);
    this.grains = m.grains; this.sandGroups = m.sandGroups; this.sand = m.sand; this.sandVer = m.sandVer; this.tampered = m.tampered;
    this.foodRate = m.foodRate; this.light = m.light; this.flow = m.flow;
    this.t = 0; this.orgs = []; this.byId = new Map(); this.defs = new Map();
    this.fn = 0; this.fx = new Float32Array(0); this.fy = new Float32Array(0); this.fage = new Float32Array(0); this.fi = new Float32Array(0);
    this.pieces = []; this.poos = [];
    this.clades = new Map(); this.history = []; this.histEvery = 1; this.events = []; this.stats = {}; this.prof = null;
  }
  apply(d) {
    this.t = d.t; this.prof = d.prof;
    for (const [i, obj] of d.defs) this.defs.set(i, obj);
    const F = OF.length, O = d.O, L = d.L, N = O.length / F, seen = new Set(), list = [];
    for (let n = 0, li = 0; n < N; n++) {
      const id = O[n * F];
      let o = this.byId.get(id);
      if (!o) { o = { id, dead: false, links: [] }; this.byId.set(id, o); }
      for (let j = 1; j < F; j++) { const v = O[n * F + j]; o[OF[j]] = BOOL.has(OF[j]) ? v > 0 : v; }
      if (Number.isNaN(o.ax)) o.ax = undefined;
      o.b = this.defs.get(o.bId); o.g = this.defs.get(o.gId);
      const xb = this.defs.get(o.xbId);
      if (o.xb !== xb) { o.xb = xb; o.bp = analyze(xb); }
      o.linkIds = L.subarray(li, li + o.nLinks); li += o.nLinks;
      seen.add(id); list.push(o);
    }
    for (const [id, o] of this.byId) if (!seen.has(id)) { o.dead = true; this.byId.delete(id); }
    for (const o of list) {
      // つながりは毎こまほとんど変わらないので、番号が変わったときだけ作りなおす
      const ids = o.linkIds, old = o.links;
      let same = old.length === ids.length;
      for (let i = 0; same && i < ids.length; i++) same = old[i].id === ids[i] && !old[i].dead;
      if (!same) o.links = Array.from(ids, i => this.byId.get(i)).filter(Boolean);
      o.mate = o.mate ? this.byId.get(o.mate) || null : null;
      if (typeof o.mate === 'number') o.mate = null;
    }
    this.orgs = list;
    const A = d.A; this.fn = A.length / 3;
    if (this.fx.length < this.fn) { this.fx = new Float32Array(this.fn * 2); this.fy = new Float32Array(this.fn * 2); this.fage = new Float32Array(this.fn * 2); this.fi = new Float32Array(this.fn * 2); }
    for (let i = 0; i < this.fn; i++) { this.fx[i] = A[i * 3]; this.fy[i] = A[i * 3 + 1]; this.fi[i] = A[i * 3 + 2]; this.fage[i] = 0; }
    this.pieces = []; for (let i = 0; i < d.P.length; i += 4) this.pieces.push({ x: d.P[i], y: d.P[i + 1], a: d.P[i + 2], len: d.P[i + 3] });
    this.poos = []; for (let i = 0; i < d.Q.length; i += 5) this.poos.push({ x: d.Q[i], y: d.Q[i + 1], n: d.Q[i + 2], n0: d.Q[i + 3], s: d.Q[i + 4] });
    const m = d.meta;
    if (m) {
      this.histEvery = m.histEvery; this.stats = m.stats; this.tampered = m.tampered;
      if (m.history) this.history = m.history.full ? m.history.items : this.history.concat(m.history.items);
      for (const c of m.clades) this.clades.set(c.id, c);
      if (m.events) this.events.push(...m.events);
      if (this.events.length > 400) this.events.splice(0, 200);
    }
  }
  orgAt(x, y, pad = 6) {
    let best = null, bd = 1e9;
    for (const o of this.orgs) { const d = Math.hypot(o.x - x, o.y - y) - o.r; if (d < pad && d < bd) { bd = d; best = o; } }
    return best;
  }
  liveClades() { return [...this.clades.values()].filter(c => c.n > 0).sort((a, b) => b.n - a.n); }
}

// 画面側で回す（今までどおり）
function localSim() {
  const s = { world: null, simRate: 0, stepMs: 0, usesWorker: false, onInit: null, pendingEaten: null };
  let speed = 4, playing = true, acc = 0;
  s.newWorld = opt => { s.world = new World(opt); acc = 0; s.onInit?.(); };
  s.restoreWorld = d => { s.world = restore(d); acc = 0; s.onInit?.(); };
  s.set = (k, v) => { s.world[k] = v; };
  s.run = (sp, pl) => { speed = sp; playing = pl; };
  // 1こまぶん回す（重いときは実の速さを落とす）。回した刻みの数と時間を返す
  s.tick = fdt => {
    if (!playing) return;
    acc += fdt * speed;
    const t0 = performance.now(); let n = 0;
    while (acc >= DT) {
      s.world.step(); acc -= DT; n++;
      if (performance.now() - t0 > (speed >= 256 ? 45 : 12)) { acc = 0; break; }
    }
    const ms = performance.now() - t0;
    if (n) s.stepMs = s.stepMs * 0.9 + ms / n * 0.1;
    s.simRate = s.simRate * 0.9 + (n * DT / Math.max(fdt, 1e-3)) * 0.1;
    s.lastMs = ms;
  };
  s.eatenBy = (o, cb) => cb(o.eatenBy ? s.world.orgs.find(x => x.id === o.eatenBy) : null);
  s.save = () => s.world ? saveWorld(snapshot(s.world)).catch(e => console.warn(e)) : null;
  s.addGrain = (x, y, r) => s.world.addGrain(x, y, r);
  s.spawn = (id, x, y, n) => { const p = PRESETS.find(p => p.id === id); if (p) s.world.spawn(p.g(), p.name, x, y, n); };
  s.load = async () => { const d = await get('last'); if (!d) return false; s.restoreWorld(d); return true; };
  return s;
}

// Web Worker で回す
function workerSim() {
  const wk = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const s = { world: null, simRate: 0, stepMs: 0, usesWorker: true, onInit: null, lastMs: 0 };
  let waiting = false, speed = 4, playing = true, eatenCb = null, loadCb = null, saveCbs = [];
  wk.onmessage = e => {
    const d = e.data;
    if (d.type === 'init') { s.world = new Mirror(d); waiting = false; s.onInit?.(); if (loadCb) { loadCb(true); loadCb = null; } }
    else if (d.type === 'loadFailed' && loadCb) { loadCb(false); loadCb = null; }
    else if (d.type === 'saved') { for (const cb of saveCbs.splice(0)) cb(d.meta); }
    else if (d.type === 'sand' && s.world) { s.world.grains = d.grains; s.world.sandGroups = d.sandGroups; s.world.sandVer = d.sandVer; }
    else if (d.type === 'frame') { waiting = false; if (s.world) { const t0 = performance.now(); s.world.apply(d); s.applyMs = (s.applyMs || 0) * 0.9 + (performance.now() - t0) * 0.1; s.simRate = d.simRate; s.stepMs = d.stepMs; } }
    else if (d.type === 'eatenBy' && eatenCb) { const cb = eatenCb; eatenCb = null; cb(d.by ? s.world.byId.get(d.by) || null : null); }
  };
  // 計算のコアが動かないとき（読みこめない・4 秒たっても一滴が届かない）は、画面側で回す形にもどる（main.js の onFail）
  const fail = why => { if (s.failed || s.world) return; s.failed = true; console.warn('worker', why); wk.terminate(); s.onFail?.(); };
  wk.onerror = e => fail(e.message || 'error');
  const watch = () => setTimeout(() => { if (!s.world) fail('timeout'); }, 4000);
  s.newWorld = opt => { s.last = ['newWorld', opt]; watch(); wk.postMessage({ type: 'new', opt }); };
  s.restoreWorld = data => { s.last = ['restoreWorld', data]; watch(); wk.postMessage({ type: 'restore', data }); };
  s.set = (k, v) => { if (s.world) s.world[k] = v; wk.postMessage({ type: 'set', key: k, value: v }); };
  s.run = (sp, pl) => { speed = sp; playing = pl; wk.postMessage({ type: 'run', speed: sp, playing: pl }); };
  // 前に頼んだ分が届いていれば、次のこまの分を頼む（画面は届いている最新の写しを描く）
  s.tick = () => { if (!waiting && s.world) { waiting = true; wk.postMessage({ type: 'frame' }); } s.lastMs = 0; };
  s.eatenBy = (o, cb) => { eatenCb = cb; wk.postMessage({ type: 'eatenBy', id: o.id }); };
  s.save = () => new Promise(ok => { saveCbs.push(ok); wk.postMessage({ type: 'save' }); });
  s.addGrain = (x, y, r) => wk.postMessage({ type: 'grain', x, y, r });
  s.spawn = (id, x, y, n) => wk.postMessage({ type: 'spawn', id, x, y, n });
  s.load = () => new Promise(ok => { loadCb = ok; wk.postMessage({ type: 'load' }); });
  return s;
}

export function makeSim(useWorker) {
  if (useWorker && typeof Worker !== 'undefined') { try { return workerSim(); } catch (e) { console.warn(e); } }
  return localSim();
}
