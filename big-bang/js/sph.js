// ビッグバンから惑星まで — SPH（粒の流体）＋重力を WebGPU で。場面⑤（岩と鉄）・場面③（ガス）が使う
import { sphWGSL, sphRenderWGSL } from './sph-shaders.js';

export class SphSim {
  constructor(device, canvas, n) {
    const d = this.dev = device, U = GPUBufferUsage; this.n = n;
    this.X = d.createBuffer({ size: n * 64, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    this.aux = d.createBuffer({ size: n * 16, usage: U.STORAGE });
    this.claim = d.createBuffer({ size: n * 4, usage: U.STORAGE });
    this.dtm = d.createBuffer({ size: 4, usage: U.STORAGE | U.COPY_DST });
    this.ts = d.createBuffer({ size: 16, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });   // いまの dt・すぎた時間・dt の上限・クーラン数（GPU が毎歩決める）
    this.tsSnap = d.createBuffer({ size: 16, usage: U.MAP_READ | U.COPY_DST });
    this.params = d.createBuffer({ size: 176, usage: U.UNIFORM | U.COPY_DST });
    this.viewU = d.createBuffer({ size: 64, usage: U.UNIFORM | U.COPY_DST });
    this.snap = d.createBuffer({ size: n * 64, usage: U.MAP_READ | U.COPY_DST });
    const st = { type: 'storage' }, C = GPUShaderStage.COMPUTE;
    const layout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: C, buffer: st }, { binding: 1, visibility: C, buffer: { type: 'uniform' } }, { binding: 2, visibility: C, buffer: st }, { binding: 3, visibility: C, buffer: st }, { binding: 4, visibility: C, buffer: st }, { binding: 5, visibility: C, buffer: st }] });
    const mod = d.createShaderModule({ code: sphWGSL }), pl = d.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.pipe = {}; for (const k of ['density', 'force', 'kick1', 'kick2', 'claimK', 'eat', 'clock']) this.pipe[k] = d.createComputePipeline({ layout: pl, compute: { module: mod, entryPoint: k } });
    this.bg = d.createBindGroup({ layout, entries: [this.X, this.params, this.aux, this.claim, this.dtm, this.ts].map((b, i) => ({ binding: i, resource: { buffer: b } })) });
    this.wg = Math.ceil(n / 256); this.wgT = Math.ceil(n / 64);
    this.pv = new ArrayBuffer(176); this.pu = new Uint32Array(this.pv); this.pf = new Float32Array(this.pv);
    this.opt = { mode: 0, dt: 0.01, G: 1, damp: 1, hmax: 3, gas: [0, 1, 1.4, 1e30], racc: 0, mt: new Array(24).fill(0) };
    this.reading = false;
    if (canvas) this.initRender(canvas);
  }
  initRender(canvas) {
    const d = this.dev; this.ctx = canvas.getContext('webgpu'); this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: d, format: this.format, alphaMode: 'opaque' });
    const mod = d.createShaderModule({ code: sphRenderWGSL });
    const layout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }] });
    const bl = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' };
    this.rpipe = d.createRenderPipeline({ layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }), vertex: { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: this.format, blend: { color: bl, alpha: bl } }] }, primitive: { topology: 'triangle-list' } });
    this.rbg = d.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: this.X } }, { binding: 1, resource: { buffer: this.viewU } }] });
  }
  // はじめの状態。時間の刻みは GPU が毎歩決める（dtMax まで、クーラン数 courant）。t0 = はじめの時刻
  load(X, { dtMax = 0.05, courant = 0.25, t0 = 0 } = {}) {
    this.dev.queue.writeBuffer(this.X, 0, X); this.writeParams({});
    this.dev.queue.writeBuffer(this.ts, 0, new Float32Array([0, t0, dtMax, courant]));
    this.dev.queue.writeBuffer(this.dtm, 0, new Uint32Array([0x7f7fffff]));
  }
  setLimits(dtMax, courant) { this.dev.queue.writeBuffer(this.ts, 8, new Float32Array([dtMax, courant])); }
  set(o) { Object.assign(this.opt, o); }
  writeParams(fin) {
    const u = this.pu, f = this.pf, o = this.opt, F = fin || {};
    u[0] = this.n; u[1] = this.wgT; u[2] = o.mode;
    f[4] = o.dt; f[5] = o.G; f[6] = o.damp; f[7] = o.hmax;
    f[8] = o.gas[0]; f[9] = o.gas[1]; f[10] = o.gas[2]; f[11] = o.gas[3];
    f[12] = F.x || 0; f[13] = F.y || 0; f[14] = F.vx || 0; f[15] = F.vy || 0;
    f[16] = F.r || 0.1; f[17] = F.invTau || 0; f[18] = F.on ? 1 : 0; f[19] = o.racc;
    for (let k = 0; k < 24; k++) f[20 + k] = o.mt[k];
    this.dev.queue.writeBuffer(this.params, 0, this.pv);
  }
  setView(v) { this.dev.queue.writeBuffer(this.viewU, 0, new Float32Array(v)); }
  // sub 歩すすめて描く。read なら状態を読み出す
  frame(sub, { fin, read, clear } = {}) {
    const d = this.dev; this.writeParams(fin);
    const enc = d.createCommandEncoder();
    if (sub > 0) {
      const p = enc.beginComputePass(); p.setBindGroup(0, this.bg);
      for (let s = 0; s < sub; s++) {
        p.setPipeline(this.pipe.kick1); p.dispatchWorkgroups(this.wg);
        p.setPipeline(this.pipe.density); p.dispatchWorkgroups(this.wgT);
        p.setPipeline(this.pipe.force); p.dispatchWorkgroups(this.wgT);
        p.setPipeline(this.pipe.kick2); p.dispatchWorkgroups(this.wg);
        if (this.opt.mode === 1) { p.setPipeline(this.pipe.claimK); p.dispatchWorkgroups(this.wgT); p.setPipeline(this.pipe.eat); p.dispatchWorkgroups(this.wgT); }
        p.setPipeline(this.pipe.clock); p.dispatchWorkgroups(1);
      }
      p.end();
    }
    if (this.ctx) {
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: clear || { r: 0.055, g: 0.086, b: 0.149, a: 1 } }] });
      rp.setPipeline(this.rpipe); rp.setBindGroup(0, this.rbg); rp.draw(6, this.n); rp.end();
    }
    let job = false;
    if (read && !this.reading) { enc.copyBufferToBuffer(this.X, 0, this.snap, 0, this.n * 64); enc.copyBufferToBuffer(this.ts, 0, this.tsSnap, 0, 16); job = true; }
    d.queue.submit([enc.finish()]);
    if (!job) return null;
    this.reading = true;
    // 読み出した X に、そのときの dt・時刻を X.ts として付ける
    return Promise.all([this.snap.mapAsync(GPUMapMode.READ), this.tsSnap.mapAsync(GPUMapMode.READ)]).then(() => {
      const X = new Float32Array(this.snap.getMappedRange().slice(0)); X.ts = new Float32Array(this.tsSnap.getMappedRange().slice(0));
      this.snap.unmap(); this.tsSnap.unmap(); this.reading = false; return X; });
  }
  // はじめの密度と力（1歩目の前に）
  prime() {
    this.writeParams({});
    const enc = this.dev.createCommandEncoder(), p = enc.beginComputePass(); p.setBindGroup(0, this.bg);
    p.setPipeline(this.pipe.density); p.dispatchWorkgroups(this.wgT); p.setPipeline(this.pipe.force); p.dispatchWorkgroups(this.wgT);
    p.setPipeline(this.pipe.clock); p.dispatchWorkgroups(1); p.end();   // 最初の dt を決める（時刻は dt = 0 なので進まない）
    this.dev.queue.submit([enc.finish()]);
  }
  destroy() { for (const b of [this.X, this.aux, this.claim, this.dtm, this.ts, this.tsSnap, this.params, this.viewU, this.snap]) b.destroy(); }
}
