// ビッグバンから惑星まで — WebGPU の準備と1コマの計算（重力 → ぶつかり → 熱 → 描画 → ときどき読み出し）
import { computeWGSL, renderWGSL } from './shaders.js';
import { DT, G, EPS2, cut2 } from './physics.js';

export const WORK_SCALE = 1e12, HEAT_SCALE = 1e13, MASS_SCALE = 1e15;

export async function getDevice() {
  if (!navigator.gpu) return { err: 'WebGPU がありません' };
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch (e) { /* 下で */ }
  if (!adapter) return { err: 'GPU を使えません' };
  const device = await adapter.requestDevice();
  return { device, adapter };
}

export class Sim {
  constructor(device, canvas, n) {
    this.dev = device; this.n = n;
    const d = device, U = GPUBufferUsage;
    this.bodies = d.createBuffer({ size: n * 64, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    this.partner = d.createBuffer({ size: n * 4, usage: U.STORAGE });
    this.count = d.createBuffer({ size: 64, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    this.free = d.createBuffer({ size: n * 4, usage: U.STORAGE });
    this.params = d.createBuffer({ size: 96, usage: U.UNIFORM | U.COPY_DST });
    this.view = d.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
    this.snap = d.createBuffer({ size: n * 64, usage: U.MAP_READ | U.COPY_DST });
    this.cntSnap = d.createBuffer({ size: 64, usage: U.MAP_READ | U.COPY_DST });
    const st = { type: 'storage' };
    const layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: st },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: st },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: st },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: st }] });
    const mod = d.createShaderModule({ code: computeWGSL });
    this.mod = mod;
    const pl = d.createPipelineLayout({ bindGroupLayouts: [layout] });
    const mk = name => d.createComputePipeline({ layout: pl, compute: { module: mod, entryPoint: name } });
    this.pipe = {}; for (const k of ['kick1', 'force', 'kick2', 'collide', 'heat', 'freeReset', 'freePush']) this.pipe[k] = mk(k);
    this.bg = d.createBindGroup({ layout, entries: [this.bodies, this.params, this.partner, this.count, this.free].map((b, i) => ({ binding: i, resource: { buffer: b } })) });
    this.wg = Math.ceil(n / 256); this.wgF = Math.ceil(n / 64);   // 重力だけ 64 個ずつ
    this.pv = new ArrayBuffer(96); this.pvU = new Uint32Array(this.pv); this.pvF = new Float32Array(this.pv);
    this.reading = false; this.F = 30; this.mMin = 0;
    if (canvas) this.initRender(canvas);
  }
  initRender(canvas) {
    const d = this.dev;
    this.ctx = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: d, format: this.format, alphaMode: 'opaque' });
    const mod = d.createShaderModule({ code: renderWGSL });
    const layout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }] });
    this.rpipe = d.createRenderPipeline({ layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: this.format, blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
      primitive: { topology: 'triangle-list' } });
    this.rbg = d.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: this.bodies } }, { binding: 1, resource: { buffer: this.view } }] });
  }
  // はじめの状態を入れて、最初の重力を計算しておく
  load(B, F, mMin) {
    this.F = F; this.mMin = mMin;
    this.dev.queue.writeBuffer(this.bodies, 0, B);
    this.dev.queue.writeBuffer(this.count, 0, new Int32Array(16));
    this.setParams({ dtFrame: 0, t: 0 });
    const enc = this.dev.createCommandEncoder(), p = enc.beginComputePass();
    p.setBindGroup(0, this.bg); p.setPipeline(this.pipe.force); p.dispatchWorkgroups(this.wgF); p.end();
    this.dev.queue.submit([enc.finish()]);
  }
  setParams({ dtFrame, t, fin }) {
    const u = this.pvU, f = this.pvF;
    u[0] = this.n; u[1] = this.wgF;
    f[4] = DT; f[5] = G; f[6] = EPS2; f[7] = this.F;
    f[8] = this.mMin; f[9] = WORK_SCALE; f[10] = HEAT_SCALE; f[11] = cut2(this.F);
    const F = fin || { on: false };
    f[12] = F.x || 0; f[13] = F.y || 0; f[14] = F.ux || 0; f[15] = F.uy || 0;
    f[16] = F.r || 0.1; f[17] = F.invTau || 0; f[18] = F.on ? 1 : 0;
    f[20] = dtFrame; f[21] = t;
    this.dev.queue.writeBuffer(this.params, 0, this.pv);
  }
  setView(v) { this.dev.queue.writeBuffer(this.view, 0, new Float32Array([v.sx, v.sy, v.cx, v.cy, v.pxx, v.pxy, v.base, v.R0, -1, 0, 0, 0])); }
  // 1コマ: sub 歩の計算と描画。read = true なら状態を読み出す（前の読み出しが終わっていれば）
  frame(sub, { t, fin, read, clear }) {
    const d = this.dev;
    this.setParams({ dtFrame: sub * DT, t, fin });
    const enc = d.createCommandEncoder();
    if (sub > 0) {
      const p = enc.beginComputePass(); p.setBindGroup(0, this.bg);
      p.setPipeline(this.pipe.freeReset); p.dispatchWorkgroups(1);
      p.setPipeline(this.pipe.freePush); p.dispatchWorkgroups(this.wg);
      for (let s = 0; s < sub; s++) {
        p.setPipeline(this.pipe.kick1); p.dispatchWorkgroups(this.wg);
        p.setPipeline(this.pipe.force); p.dispatchWorkgroups(this.wgF);
        p.setPipeline(this.pipe.kick2); p.dispatchWorkgroups(this.wg);
        p.setPipeline(this.pipe.collide); p.dispatchWorkgroups(this.wg);
      }
      p.setPipeline(this.pipe.heat); p.dispatchWorkgroups(this.wg);
      p.end();
    }
    if (this.ctx) {
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: clear || { r: 0.055, g: 0.086, b: 0.149, a: 1 } }] });
      rp.setPipeline(this.rpipe); rp.setBindGroup(0, this.rbg); rp.draw(6, this.n); rp.end();
    }
    let job = null;
    if (read && !this.reading) {
      enc.copyBufferToBuffer(this.bodies, 0, this.snap, 0, this.n * 64);
      enc.copyBufferToBuffer(this.count, 0, this.cntSnap, 0, 64);
      enc.clearBuffer(this.count, 0, 36);    // 0〜8 番の数え（9 空き・15 通し番号は残す）
      job = true;
    }
    d.queue.submit([enc.finish()]);
    if (job) {
      this.reading = true;
      return Promise.all([this.snap.mapAsync(GPUMapMode.READ), this.cntSnap.mapAsync(GPUMapMode.READ)]).then(() => {
        const B = new Float32Array(this.snap.getMappedRange().slice(0));
        const C = new Int32Array(this.cntSnap.getMappedRange().slice(0));
        this.snap.unmap(); this.cntSnap.unmap(); this.reading = false;
        return { B, C };
      });
    }
    return null;
  }
  // 速さをはかる: 重力だけを k 回（ms / 回）
  async bench(k = 12) {
    const d = this.dev; this.setParams({ dtFrame: 0, t: 0 });
    const run = () => { const enc = d.createCommandEncoder(), p = enc.beginComputePass(); p.setBindGroup(0, this.bg); p.setPipeline(this.pipe.force);
      for (let i = 0; i < k; i++) p.dispatchWorkgroups(this.wgF); p.end(); d.queue.submit([enc.finish()]); return d.queue.onSubmittedWorkDone(); };
    await run();
    const t0 = performance.now(); await run(); return (performance.now() - t0) / k;
  }
  destroy() { for (const b of [this.bodies, this.partner, this.count, this.free, this.params, this.view, this.snap, this.cntSnap]) b.destroy(); }
}
