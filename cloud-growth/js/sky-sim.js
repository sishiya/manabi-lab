// 雲ができるまで（3次元の試作）— WebGPU の計算。式は solver.js を3次元にしたもの
import { sweepWGSL, cellsWGSL, fftWGSL, tridiagWGSL, statsWGSL } from './sky-wgsl.js';

const S0 = 300, PROF_F = 13;
const { g, cp, Lv } = globalThis.CT;

// 基本の空: solver.js の静水圧の積み上げをそのまま使う（横は使わないので 4 列）
export function makeBase(sc, nz, Lz) {
  const s = globalThis.makeSim({ ...sc, nx: 4, Lx: 400, nz, Lz, seed: false, micro: false });
  return { nz, Lz, z0: sc.z0 || 0, dz: Lz / nz, zc: s.zc, rhoc: s.rhoc, rhof: s.rhof, T0: s.T0, qv0: s.qv0, qn0: s.qn0, pc: s.pc, h0: s.h0, qt0: s.qt0, ub: s.ub };
}

export class SkySim {
  // o: { nx, ny, dx, dy, base, H(数か時刻の関数), E, cd, hs, spongeTop, spongeTau, het, hetAmp, noise, wind(真なら基本の風), lw:{F0,kappa}, wls(z), gen(最初の空を足す) }
  constructor(dev, o) {
    this.dev = dev; this.o = o;
    const { nx, ny, base } = o, nz = base.nz;
    this.nx = nx; this.ny = ny; this.nz = nz; this.dx = o.dx; this.dy = o.dy; this.dz = base.dz;
    this.Lx = nx * o.dx; this.Ly = ny * o.dy; this.Lz = base.Lz;
    this.t = 0; this.flip = false; this.n = nx * ny * (nz + 1);
    const U = GPUBufferUsage, field = () => dev.createBuffer({ size: this.n * 4, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    this.f = {}; for (const k of ['U', 'V', 'W', 'S', 'Q', 'U0', 'V0', 'W0', 'T1', 'T2', 'Qn', 'B']) this.f[k] = field();
    this.C = dev.createBuffer({ size: nx * ny * nz * 8, usage: U.STORAGE | U.COPY_SRC });
    this.Het = dev.createBuffer({ size: nx * ny * 4, usage: U.STORAGE | U.COPY_DST });
    this.Um = dev.createBuffer({ size: nz * 4, usage: U.STORAGE });
    this.P = dev.createBuffer({ size: 64, usage: U.UNIFORM | U.COPY_DST });
    this.A = dev.createBuffer({ size: 256 * 6, usage: U.UNIFORM | U.COPY_DST });
    this.prof = dev.createBuffer({ size: (nz + 1) * PROF_F * 4, usage: U.STORAGE | U.COPY_DST });
    this.tw = dev.createBuffer({ size: Math.max(nx, ny) * 8, usage: U.STORAGE | U.COPY_DST });
    this.stat = dev.createBuffer({ size: 32 + nz * 4, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
    this.statR = dev.createBuffer({ size: 32 + nz * 4, usage: U.MAP_READ | U.COPY_DST });
    this.statBusy = false;
    this._fillStatic();
    this._pipelines();
    this.reset();
  }
  _fillStatic() {
    const { dev, o, nx, ny, nz } = this, b = o.base, M = Math.max(nx, ny);
    const pr = new Float32Array((nz + 1) * PROF_F);
    let fsum = 0; const hs = Math.max(2 * this.dz, o.hs || 100), fk = new Float64Array(nz);
    for (let k = 0; k < nz; k++) { const f = Math.exp(-(k + 0.5) * this.dz / hs); if (f < 0.02) break; fk[k] = f; fsum += f * this.dz; }
    const top = o.spongeTop || 0, zb = b.z0 + this.Lz - top;
    for (let k = 0; k <= nz; k++) {
      const c = Math.min(k, nz - 1), a = k * PROF_F;
      pr[a] = b.rhoc[c]; pr[a + 1] = b.rhof[k]; pr[a + 2] = b.T0[c]; pr[a + 3] = b.qv0[c]; pr[a + 4] = b.qn0[c]; pr[a + 5] = b.pc[c]; pr[a + 6] = b.zc[c];
      pr[a + 7] = b.h0[c] / cp - S0; pr[a + 8] = b.qt0[c]; pr[a + 9] = o.wind ? b.ub[c] : 0;
      pr[a + 10] = fsum > 0 && k < nz ? fk[k] / (b.rhoc[k] * fsum) : 0;
      pr[a + 11] = top > 0 && b.zc[c] > zb ? 0.5 * (1 - Math.cos(Math.PI * (b.zc[c] - zb) / top)) / (o.spongeTau || 120) : 0;
      pr[a + 12] = o.wls ? o.wls(b.zc[c]) : 0;
    }
    dev.queue.writeBuffer(this.prof, 0, pr);
    this.pr = pr;
    const tw = new Float32Array(M * 2);
    for (let i = 0; i < M; i++) { tw[2 * i] = Math.cos(2 * Math.PI * i / M); tw[2 * i + 1] = Math.sin(2 * Math.PI * i / M); }
    dev.queue.writeBuffer(this.tw, 0, tw);
    // 方向の切りかえの順番（order 0: x→y→z、1: z→y→x）
    const A = new Int32Array(64 * 6);
    [[0, 0], [1, 1], [2, 3], [2, 0], [1, 4], [0, 6]].forEach(([ax, dn], s) => { A[s * 64] = ax; A[s * 64 + 1] = dn; });
    dev.queue.writeBuffer(this.A, 0, A);
  }
  _pipelines() {
    const { dev, f, P, A, prof, tw, C, Het, stat, nx, ny, nz } = this, M = Math.max(nx, ny);
    const sweepLay = dev.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
      ...[2, 3, 4, 5, 6].map(b => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } })),
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ] });
    const layout = dev.createPipelineLayout({ bindGroupLayouts: [sweepLay] });
    const mod = (code, label) => dev.createShaderModule({ code, label });
    const mkSweep = st => dev.createComputePipeline({ layout, compute: { module: mod(sweepWGSL(st), 'sweep' + st), entryPoint: 'main' } });
    this.pSweep = [0, 1, 2, 3].map(mkSweep);
    const sbg = (from, to) => dev.createBindGroup({ layout: sweepLay, entries: [
      { binding: 0, resource: { buffer: P } }, { binding: 1, resource: { buffer: A, size: 16 } }, { binding: 2, resource: { buffer: prof } },
      { binding: 3, resource: { buffer: f.U0 } }, { binding: 4, resource: { buffer: f.V0 } }, { binding: 5, resource: { buffer: f.W0 } },
      { binding: 6, resource: { buffer: from } }, { binding: 7, resource: { buffer: to } },
    ] });
    this.adv = [['S', 0], ['Q', 0], ['U', 1], ['V', 2], ['W', 3]].map(([k, st]) => ({ st, bg: [sbg(f[k], f.T1), sbg(f.T1, f.T2), sbg(f.T2, f[k])] }));

    const cells = mod(cellsWGSL, 'cells');
    const buf = (binding, buffer) => ({ binding, resource: { buffer } });
    const mk = (m, ep, constants) => dev.createComputePipeline({ layout: 'auto', compute: { module: m, entryPoint: ep, constants } });
    const bind = (p, list) => dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: list.map(([b, x]) => buf(b, x)) });
    const pair = (ep, list) => { const p = mk(cells, ep); return { p, bg: bind(p, list) }; };
    this.force = pair('force', [[0, P], [1, prof], [2, f.U], [3, f.V], [4, f.W], [5, f.S], [6, f.Q], [7, Het], [11, this.Um]]);
    this.umean = pair('umean', [[0, P], [2, f.U], [11, this.Um]]);
    this.column = pair('column', [[0, P], [1, prof], [5, f.S], [6, f.Q], [8, f.Qn]]);
    this.diag = pair('diag', [[0, P], [1, prof], [5, f.S], [6, f.Q], [8, f.Qn], [9, f.B]]);
    this.buoy = pair('buoy', [[0, P], [4, f.W], [9, f.B]]);
    this.rhs = pair('rhs', [[0, P], [1, prof], [2, f.U], [3, f.V], [4, f.W], [10, C]]);
    this.correct = pair('correct', [[0, P], [2, f.U], [3, f.V], [4, f.W], [10, C]]);
    const fm = mod(fftWGSL(M), 'fft');
    const fft = (AX, SG) => { const p = mk(fm, 'main', { AX, SG }); return { p, bg: bind(p, [[0, P], [1, tw], [2, C]]), n: Math.ceil((AX === 0 ? ny : nx) * nz / 16) }; };
    this.fx = fft(0, -1); this.fy = fft(1, -1); this.ify = fft(1, 1); this.ifx = fft(0, 1);
    const tp = mk(mod(tridiagWGSL(M, nz), 'tri'), 'main');
    this.tri = { p: tp, bg: bind(tp, [[0, P], [1, prof], [2, tw], [3, C]]) };
    const sp = mk(mod(statsWGSL, 'stats'), 'main');
    this.statP = { p: sp, bg: bind(sp, [[0, P], [1, f.U], [2, f.V], [3, f.W], [4, f.Qn], [5, stat]]) };
  }
  // はじめの空。gen(i,j,k,fields) で上書きできる（確かめ用）
  reset(gen) {
    const { dev, f, nx, ny, nz, n, o, pr } = this;
    const s = new Float32Array(n), q = new Float32Array(n), u = new Float32Array(n);
    let sd = o.seed || 7; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const c = (i, j, k) => i + nx * (j + ny * k);
    for (let k = 0; k <= nz; k++) {
      const a = Math.min(k, nz - 1) * PROF_F, s0 = pr[a + 7], q0 = pr[a + 8], ub = pr[a + 9], z = pr[a + 6], nz1 = o.noise && z < o.noise.zTop;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = c(i, j, k); s[x] = s0 + (nz1 ? o.noise.amp * (R() * 2 - 1) : 0); q[x] = q0; u[x] = ub; }
    }
    if (o.gen) o.gen(s, q, u, c);
    if (gen) gen(s, q, u, c);
    const het = new Float32Array(nx * ny);
    if (o.het) {
      let mx = 0;
      for (let m = 0; m < 48; m++) {
        const kx = Math.floor(R() * 17) - 8, ky = Math.floor(R() * 17) - 8, ph = R() * 2 * Math.PI, kk = Math.hypot(kx, ky) || 1, A = (R() * 2 - 1) / kk;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) het[i + nx * j] += A * Math.cos(2 * Math.PI * (kx * i / nx + ky * j / ny) + ph);
      }
      for (const v of het) mx = Math.max(mx, Math.abs(v));
      for (let i = 0; i < het.length; i++) het[i] /= mx || 1;
    }
    dev.queue.writeBuffer(f.S, 0, s); dev.queue.writeBuffer(f.Q, 0, q); dev.queue.writeBuffer(f.U, 0, u);
    const zero = new Float32Array(n);
    dev.queue.writeBuffer(f.V, 0, zero); dev.queue.writeBuffer(f.W, 0, zero); dev.queue.writeBuffer(f.Qn, 0, zero);
    dev.queue.writeBuffer(this.Het, 0, het);
    this.t = o.t0 || 0; this.flip = false;
  }
  _setP(dt) {
    const o = this.o, h = new ArrayBuffer(64), iv = new Int32Array(h, 0, 4), fv = new Float32Array(h, 16, 12), H = typeof o.H === 'function' ? o.H(this.t) : (o.H || 0);
    iv.set([this.nx, this.ny, this.nz, 0]);
    fv.set([this.dx, this.dy, this.dz, dt, H / cp, (o.E || 0) / Lv, o.cd || 0, S0, o.hetAmp ?? 0.3, o.lw ? o.lw.F0 : 0, o.lw ? o.lw.kappa : 0, o.windTau || 0]);
    this.dev.queue.writeBuffer(this.P, 0, h);
  }
  // diag だけ（確かめと最初の雲に）
  diagOnly(enc) {
    const p = enc.beginComputePass(); this._cell(p, this.diag); p.end();
  }
  _cell(pass, x) {
    pass.setPipeline(x.p); pass.setBindGroup(0, x.bg);
    pass.dispatchWorkgroups(Math.ceil(this.nx / 8), Math.ceil(this.ny / 8), Math.ceil(this.nz / 4));
  }
  step(dt) {
    const { dev, f, nx, ny, nz, o } = this;
    this._setP(dt);
    const enc = dev.createCommandEncoder();
    let p = enc.beginComputePass();
    if (o.windTau) { p.setPipeline(this.umean.p); p.setBindGroup(0, this.umean.bg); p.dispatchWorkgroups(nz); }
    this._cell(p, this.force);
    if (o.lw || o.wls) { p.setPipeline(this.column.p); p.setBindGroup(0, this.column.bg); p.dispatchWorkgroups(Math.ceil(nx * ny / 32)); }
    p.end();
    enc.copyBufferToBuffer(f.U, 0, f.U0, 0, this.n * 4); enc.copyBufferToBuffer(f.V, 0, f.V0, 0, this.n * 4); enc.copyBufferToBuffer(f.W, 0, f.W0, 0, this.n * 4);
    p = enc.beginComputePass();
    const base = this.flip ? 3 : 0;
    const X = Math.ceil(nx / 8), Y = Math.ceil(ny / 8);
    for (const a of this.adv) {
      p.setPipeline(this.pSweep[a.st]);
      const Z = Math.ceil((a.st === 3 ? nz + 1 : nz) / 4);
      for (let s = 0; s < 3; s++) { p.setBindGroup(0, a.bg[s], [(base + s) * 256]); p.dispatchWorkgroups(X, Y, Z); }
    }
    this._cell(p, this.diag);
    this._cell(p, this.buoy);
    this._cell(p, this.rhs);
    for (const x of [this.fx, this.fy]) { p.setPipeline(x.p); p.setBindGroup(0, x.bg); p.dispatchWorkgroups(x.n); }
    p.setPipeline(this.tri.p); p.setBindGroup(0, this.tri.bg); p.dispatchWorkgroups(Math.ceil(nx * ny / 32));
    for (const x of [this.ify, this.ifx]) { p.setPipeline(x.p); p.setBindGroup(0, x.bg); p.dispatchWorkgroups(x.n); }
    this._cell(p, this.correct);
    p.end();
    dev.queue.submit([enc.finish()]);
    this.flip = !this.flip; this.t += dt;
  }
  async stats() {
    if (this.statBusy) return null;
    this.statBusy = true;
    const { dev, nx, ny, nz } = this, enc = dev.createCommandEncoder();
    enc.clearBuffer(this.stat);
    const p = enc.beginComputePass();
    p.setPipeline(this.statP.p); p.setBindGroup(0, this.statP.bg); p.dispatchWorkgroups(Math.ceil(nx * ny / 32)); p.end();
    enc.copyBufferToBuffer(this.stat, 0, this.statR, 0, 32 + nz * 4);
    dev.queue.submit([enc.finish()]);
    await this.statR.mapAsync(GPUMapMode.READ);
    const v = new Uint32Array(this.statR.getMappedRange().slice(0));
    this.statR.unmap(); this.statBusy = false;
    const area = nx * ny; let base = -1, top = -1, mid = 0;
    for (let k = 0; k < nz; k++) mid = Math.max(mid, v[8 + k] / area);
    for (let k = 0; k < nz; k++) { const a = v[8 + k] / area; if (a > 0.0005) top = k; if (a > 0.1 * mid && a > 0.0005 && base < 0) base = k; }   // 底は雲が一番広い高さの1割をこえる高さ（ちぎれ雲に引きずられない）
    return { cover: v[0] / area, um: v[1] / 1000, vm: v[2] / 1000, wm: v[3] / 1000, bad: v[4], base: base < 0 ? null : this.o.base.z0 + base * this.dz, top: top < 0 ? null : this.o.base.z0 + (top + 1) * this.dz, mid };
  }
  // 確かめ用: バッファを読み出す
  async read(buffer, size) {
    const r = this.dev.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = this.dev.createCommandEncoder(); enc.copyBufferToBuffer(buffer, 0, r, 0, size); this.dev.queue.submit([enc.finish()]);
    await r.mapAsync(GPUMapMode.READ);
    const a = new Float32Array(r.getMappedRange().slice(0)); r.unmap(); r.destroy();
    return a;
  }
}
export { S0, g };
