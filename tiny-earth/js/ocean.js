// ちいさな地球 — 海の計算（球の上の浅水方程式。Vallis 2017 の形）
//   ∂v/∂t = −f k×v − g∇η + τ_風/(ρh) − 底の摩擦
// 流れが勢いを運ぶ項（移流 v·∇v）は省く（この網ではうず度の項が数値的に不安定になったため。画面にも書く）。
//   ∂h/∂t = −∇·(h v)
// 格子: 水の深さ h は点（ます）、流れの速さ u は辺（点 a→b の向きの成分）。陸に上がる・引くも扱う。
'use strict';
const OCEAN = (() => {
  function create(mesh, elev) {
    const { N, E } = mesh;
    const O = {
      mesh, elev, R: 1, P: null,
      z: new Float64Array(N), h: new Float64Array(N), u: new Float64Array(E),
      vx: new Float64Array(N), vy: new Float64Array(N), vz: new Float64Array(N),
      F: new Float64Array(E), out: new Float64Array(N), sc: new Float64Array(N),
      wind: { U: 0, ax: 0, ay: 1, az: 0 }, t: 0, hdry: 0, lastDt: 0,
    };
    return O;
  }
  // 大きさを決めて、海を静かな状態にもどす
  function reset(O, R) {
    const m = O.mesh;
    O.R = R; O.P = PHYS.at(R);
    O.hdry = 1e-3 * O.P.H0;
    for (let i = 0; i < m.N; i++) { O.z[i] = O.elev[i] * R / PHYS.RE; O.h[i] = Math.max(0, -O.z[i]); }
    O.u.fill(0); O.t = 0;
    O.vol0 = volume(O);
  }
  function volume(O) { let s = 0; const a = O.mesh.area; for (let i = 0; i < O.mesh.N; i++) s += O.h[i] * a[i]; return s * O.R * O.R; }

  // いまの状態で安定に進める時間の幅（CFL）
  function maxDt(O) {
    let hm = 0, um = 0;
    for (let i = 0; i < O.mesh.N; i++) if (O.h[i] > hm) hm = O.h[i];
    for (let e = 0; e < O.mesh.E; e++) { const a = Math.abs(O.u[e]); if (a > um) um = a; }
    return 0.4 * O.mesh.Lmin * O.R / (Math.sqrt(O.P.g * hm) + um + 1e-12);
  }

  function step(O, dt) {
    const m = O.mesh, { N, E, A, B, L, W, tx, ty, tz, mx, my, mz, area } = m;
    const R = O.R, g = O.P.g, h = O.h, z = O.z, u = O.u, hdry = O.hdry;
    const { vx, vy, vz, F, out, sc } = O;
    // 1) ますの速さ（辺の成分から組み立てる: v_i = Σ (L·W/2) u t / 面積）
    vx.fill(0); vy.fill(0); vz.fill(0);
    for (let e = 0; e < E; e++) {
      const s = L[e] * W[e] / 2 * u[e], a = A[e], b = B[e], x = s * tx[e], y = s * ty[e], w = s * tz[e];
      vx[a] += x; vy[a] += y; vz[a] += w; vx[b] += x; vy[b] += y; vz[b] += w;
    }
    const p = m.pos;
    for (let i = 0; i < N; i++) {
      let x = vx[i] / area[i], y = vy[i] / area[i], w = vz[i] / area[i];
      const d = x * p[i * 3] + y * p[i * 3 + 1] + w * p[i * 3 + 2];
      x -= d * p[i * 3]; y -= d * p[i * 3 + 1]; w -= d * p[i * 3 + 2];
      vx[i] = x; vy[i] = y; vz[i] = w;
    }
    // 2) 辺の流れを進める
    const Wd = O.wind, ka = PHYS.RHO_A * PHYS.CD_AIR / PHYS.RHO_W, cf = PHYS.CF_BED, nu3 = 3 * PHYS.NU, f2 = 2 * PHYS.OMEGA;
    for (let e = 0; e < E; e++) {
      const a = A[e], b = B[e], ha = h[a], hb = h[b], wa = ha > hdry, wb = hb > hdry;
      const ea = z[a] + ha, eb = z[b] + hb;
      if ((!wa && !wb) || (!wa && eb <= z[a] + hdry) || (!wb && ea <= z[b] + hdry)) { u[e] = 0; continue; }
      let acc = -g * (eb - ea) / (L[e] * R);
      const ex = 0.5 * (vx[a] + vx[b]), ey = 0.5 * (vy[a] + vy[b]), ez = 0.5 * (vz[a] + vz[b]);
      if (wa && wb) {
        // コリオリ力 −f k×v（f = 2Ω sin 緯度。星の軸は y）
        const q = f2 * my[e];
        const cx = my[e] * ez - mz[e] * ey, cy = mz[e] * ex - mx[e] * ez, cz = mx[e] * ey - my[e] * ex;
        acc -= q * (cx * tx[e] + cy * ty[e] + cz * tz[e]);
      }
      const he = Math.max(0.5 * (ha + hb), hdry);
      if (Wd.U !== 0) {
        // 風: 軸 a のまわりをまわる向き U·(a×m)
        const wx = Wd.U * (Wd.ay * mz[e] - Wd.az * my[e]), wy = Wd.U * (Wd.az * mx[e] - Wd.ax * mz[e]), wz = Wd.U * (Wd.ax * my[e] - Wd.ay * mx[e]);
        const sp = Math.sqrt(wx * wx + wy * wy + wz * wz);
        acc += ka * sp * (wx * tx[e] + wy * ty[e] + wz * tz[e]) / he;
      }
      let un = u[e] + dt * acc;
      const sp = Math.max(Math.abs(un), Math.sqrt(ex * ex + ey * ey + ez * ez));
      un /= 1 + dt * (cf * sp / he + nu3 / (he * he));
      u[e] = un;
    }
    // 3) 水の行き来（風上の深さ。ますの水より多くは出さない）
    out.fill(0);
    for (let e = 0; e < E; e++) {
      const fl = u[e] * W[e] * R * (u[e] > 0 ? h[A[e]] : h[B[e]]) * dt;
      F[e] = fl;
      if (fl > 0) out[A[e]] += fl; else out[B[e]] -= fl;
    }
    for (let i = 0; i < N; i++) { const have = h[i] * area[i] * R * R; sc[i] = out[i] > have ? have / out[i] : 1; }
    for (let e = 0; e < E; e++) {
      const a = A[e], b = B[e];
      let fl = F[e];
      if (fl > 0) { if (sc[a] < 1) { fl *= sc[a]; u[e] *= sc[a]; } } else if (sc[b] < 1) { fl *= sc[b]; u[e] *= sc[b]; }
      h[a] -= fl / (area[a] * R * R); h[b] += fl / (area[b] * R * R);
    }
    for (let i = 0; i < N; i++) if (h[i] < 0) h[i] = 0;   // 丸めの誤差だけ
    O.t += dt; O.lastDt = dt;
  }

  // sec 秒（星の時間）だけ進める。1コマで進める回数に上限をつける（重くなりすぎないように）
  function advance(O, sec, maxSteps = 40) {
    let done = 0, n = 0;
    while (done < sec && n < maxSteps) {
      const dt = Math.min(maxDt(O), sec - done);
      step(O, dt); done += dt; n++;
    }
    return { done, n };
  }

  // 星を揺らす: 星が速さ dv（星の座標の向き）で急に動く → 水は取り残されて −dv の流れを持つ
  function shake(O, dx, dy, dz) {
    const m = O.mesh;
    for (let e = 0; e < m.E; e++) {
      if (O.h[m.A[e]] <= O.hdry && O.h[m.B[e]] <= O.hdry) continue;
      O.u[e] -= dx * m.tx[e] + dy * m.ty[e] + dz * m.tz[e];
    }
  }
  // 水のかたまりを落とす（点 c のまわりに高さ amp・幅 w のふくらみを足す。水は増える）
  function drop(O, c, amp, w) {
    const m = O.mesh, p = m.pos, cx = p[c * 3], cy = p[c * 3 + 1], cz = p[c * 3 + 2];
    let added = 0;
    for (let i = 0; i < m.N; i++) {
      const d = Math.acos(Math.max(-1, Math.min(1, cx * p[i * 3] + cy * p[i * 3 + 1] + cz * p[i * 3 + 2]))) * O.R;
      if (d > 3 * w) continue;
      const dh = amp * Math.exp(-((d / w) ** 2));
      O.h[i] += dh; added += dh * m.area[i] * O.R * O.R;
    }
    O.vol0 += added;
    return added;
  }
  return { create, reset, step, advance, maxDt, volume, shake, drop };
})();
