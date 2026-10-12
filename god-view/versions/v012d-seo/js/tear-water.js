// tear-water.js — 段階H2「海の水と湯気」。tear-worker.js の中で、岩の計算（tear-sim.js）の 1 歩ごとに動かす。
// 海は平均 3.7 km と、岩の粒（1 個 ≒ 400 km）よりずっと薄いので、岩とは別の軽い「水の粒」で表す（水の重さは岩に影響させない。海は地球の 0.02%）。
//   ・水の粒は岩の粒の表面に乗る（岩の球の中に入ったら外へ押し出す）。重力は岩と同じ。
//   ・地面の上を流れる速さは、深さ 3.7 km の水が流れる速さ √(g·h) ≈ 秒速 0.19 km までにする。崖から落ちるときは上限なし。
//   ・熱い岩（表に出た中身・割れた地表）に触れている水は沸騰して湯気になる。熱の伝わり方は、沸騰でいちばん熱が伝わるときの値（約 1 MW/m²）＝多めの見積もり。
//   ・湯気は地球の重力から逃げられない（逃げるには秒速 11 km が必要、湯気の分子は秒速 1 km ほど）。空に広がり、やがて冷えて雨になる。
//   ・ちぎったかけらの上の水は、宇宙（真空）で表面が沸きながら凍る。出た湯気はかけらの重力で落ちてきて霜になる。
'use strict';

(function () {
  const GV = self.GV, T = GV.TearSim;
  const OCEAN_V = 1.335e18;              // 海の水の量（m³）
  const OCEAN_DEPTH = 3700;              // 平均の深さ（m）
  const V_SHALLOW = Math.sqrt(9.8 * OCEAN_DEPTH);   // 浅い水の波・流れの速さ（m/s）
  const Q_BOIL = 1e6;                    // 沸騰で伝わる熱（W/m²、多めの見積もり）
  const L_VAP = 2.6e6;                   // 水を 15℃ から湯気にする熱（J/kg、温める分＋蒸発の熱）
  const STEAM_PUFF = 2e13;               // 湯気の目印 1 つが表す水の量（kg）
  const MAXP = 2500;                     // 湯気・水蒸気の目印の数の上限

  const W = { n: 0 };

  // dirs: 海の場所（単位ベクトル、地球の中心から）。地表の高さに置き、少しならして岩の上に落ち着かせる
  function init(S, dirs) {
    const n = dirs.length / 3;
    Object.assign(W, {
      n, x: new Float64Array(3 * n), v: new Float64Array(3 * n), ph: new Uint8Array(n), on: new Uint8Array(n), hot: new Uint8Array(n),
      vol: OCEAN_V / n, area: OCEAN_V / n / OCEAN_DEPTH, steamKg: 0, holeKg: 0,
      p: { x: new Float32Array(3 * MAXP), v: new Float32Array(3 * MAXP), age: new Float32Array(MAXP), life: new Float32Array(MAXP), kind: new Uint8Array(MAXP), body: new Uint8Array(MAXP), n: 0 },
      boilAcc: 0, pos0: null,
    });
    const R = S.rSurf || 6.3e6;
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) W.x[3 * i + k] = (S.com ? S.com[0][k] : 0) + dirs[3 * i + k] * (R + 3e5);
    for (let k = 0; k < 120; k++) settle(S, 30);
    W.v.fill(0);
    W.x0 = W.x.slice(); W.com0 = S.com[0].slice(0, 3);
  }
  function reset(S) {
    if (!W.n) return;
    W.x.set(W.x0); W.v.fill(0); W.ph.fill(0); W.on.fill(0); W.hot.fill(0);
    W.steamKg = 0; W.holeKg = 0; W.p.n = 0; W.boilAcc = 0; comNow = null;
    if (W.stick) W.stick.fill(-1);
  }
  // はじめに落ち着かせる（岩は止めたまま、水だけ重力で落として岩の上へ）
  function settle(S, dt) {
    move(S, dt, true);
  }

  const g3 = [0, 0, 0];
  // 岩の粒に当たる半径: 地表の粒は大きめに描いているので、その見た目に合わせる
  const rockRadius = (S, j) => S.rr[j];     // tear-worker.js の rockShape() が毎歩計算

  function move(S, dt, still) {
    const G = S.grid;
    if (!G) return;
    const n = W.n, x = W.x, v = W.v;
    for (let i = 0; i < n; i++) {
      if (W.ph[i] === 2) {                               // 凍って、かけらに張りついた水: かけらと一緒に動く（いちばん近い岩の粒に合わせる）
        const j = W.stick[i];
        if (j >= 0) for (let k = 0; k < 3; k++) { x[3 * i + k] = S.x[3 * j + k] + W.off[3 * i + k]; v[3 * i + k] = S.v[3 * j + k]; }
        continue;
      }
      // 重力: 近いかたまり。かけらを遠くへ運んだときは、近いほうだけ
      g3[0] = g3[1] = g3[2] = 0;
      const nearChunk = W.body ? W.body[i] : 0;
      if (!S.noCross || nearChunk === 0) T.gravityAt(S, x[3 * i], x[3 * i + 1], x[3 * i + 2], 0, g3);
      if (!S.noCross || nearChunk === 1) T.gravityAt(S, x[3 * i], x[3 * i + 1], x[3 * i + 2], 1, g3);
      if (!still) for (let k = 0; k < 3; k++) v[3 * i + k] += g3[k] * dt;
      else for (let k = 0; k < 3; k++) v[3 * i + k] = g3[k] * dt;
      for (let k = 0; k < 3; k++) x[3 * i + k] += v[3 * i + k] * dt;
      // 岩に当たる: 近い升目（2×2×2）の岩の粒の中にいたら外へ押し出し、めりこむ向きの速さを消す
      const fx = (x[3 * i] - G.x0) / G.cell, fy = (x[3 * i + 1] - G.y0) / G.cell, fz = (x[3 * i + 2] - G.z0) / G.cell;
      const ix = Math.floor(fx - 0.5), iy = Math.floor(fy - 0.5), iz = Math.floor(fz - 0.5);
      let touch = -1, hot = 0;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
        const X = ix + a, Y = iy + b, Z = iz + c;
        if (X < 0 || Y < 0 || Z < 0 || X >= G.nx || Y >= G.ny || Z >= G.nz) continue;
        const cc = (X * G.ny + Y) * G.nz + Z;
        for (let q = G.cellStart[cc], e = G.cellStart[cc + 1]; q < e; q++) {
          const j = G.order[q];
          const dx = x[3 * i] - S.x[3 * j], dy = x[3 * i + 1] - S.x[3 * j + 1], dz = x[3 * i + 2] - S.x[3 * j + 2];
          const d2 = dx * dx + dy * dy + dz * dz, a0 = rockRadius(S, j);
          if (d2 >= a0 * a0) continue;
          const d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d, nz = dz / d;
          x[3 * i] = S.x[3 * j] + nx * a0; x[3 * i + 1] = S.x[3 * j + 1] + ny * a0; x[3 * i + 2] = S.x[3 * j + 2] + nz * a0;
          const rvx = v[3 * i] - S.v[3 * j], rvy = v[3 * i + 1] - S.v[3 * j + 1], rvz = v[3 * i + 2] - S.v[3 * j + 2];
          const vn = rvx * nx + rvy * ny + rvz * nz;
          if (vn < 0) { v[3 * i] -= vn * nx; v[3 * i + 1] -= vn * ny; v[3 * i + 2] -= vn * nz; }
          touch = j;
          if (S.hotS[j]) hot = 1;                               // 表に出た中身・割れた地表は熱い（1000℃ 以上）
        }
      }
      W.on[i] = touch >= 0 ? 1 : 0; W.hot[i] = hot;
      if (touch >= 0) {
        // 地面の上を流れる速さの上限（岩に対して）
        const j = touch;
        const rvx = v[3 * i] - S.v[3 * j], rvy = v[3 * i + 1] - S.v[3 * j + 1], rvz = v[3 * i + 2] - S.v[3 * j + 2];
        // 地面との抵抗（浅い水が地面をこすって流れる）: 岩に対する速さを毎歩 2 割へらし、上限もつける
        const sp = Math.hypot(rvx, rvy, rvz);
        const f = still ? 0 : Math.min(0.8, V_SHALLOW / Math.max(sp, 1e-9));
        v[3 * i] = S.v[3 * j] + rvx * f; v[3 * i + 1] = S.v[3 * j + 1] + rvy * f; v[3 * i + 2] = S.v[3 * j + 2] + rvz * f;
      }
    }
  }

  // 湯気・水蒸気の目印を 1 つ出す
  function puff(px, py, pz, vx, vy, vz, kind, body, life) {
    const P = W.p;
    let k = P.n < MAXP ? P.n++ : -1;
    if (k < 0) { let old = 0; for (let q = 1; q < MAXP; q++) if (P.age[q] / P.life[q] > P.age[old] / P.life[old]) old = q; k = old; }
    P.x[3 * k] = px; P.x[3 * k + 1] = py; P.x[3 * k + 2] = pz; P.v[3 * k] = vx; P.v[3 * k + 1] = vy; P.v[3 * k + 2] = vz;
    P.age[k] = 0; P.life[k] = life; P.kind[k] = kind; P.body[k] = body;
  }
  let seed = 99;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // 1 歩。torn: ちぎれたか。chunkIds: かけらの粒（水がどちらのかたまりにいるかを決める）
  function step(S, dt, torn, grabInfo) {
    if (!W.n || !S.grid) return;
    if (!W.body) { W.body = new Uint8Array(W.n); W.stick = new Int32Array(W.n).fill(-1); W.off = new Float32Array(3 * W.n); }
    const com = S.com, n = W.n;
    comNow = com[0].slice(0, 3);
    // どちらのかたまりの近くにいるか
    for (let i = 0; i < n; i++) {
      if (!com[1] || com[1][3] <= 0) { W.body[i] = 0; continue; }
      const d0 = Math.hypot(W.x[3 * i] - com[0][0], W.x[3 * i + 1] - com[0][1], W.x[3 * i + 2] - com[0][2]);
      const d1 = Math.hypot(W.x[3 * i] - com[1][0], W.x[3 * i + 1] - com[1][1], W.x[3 * i + 2] - com[1][2]);
      W.body[i] = d1 < 0.5 * d0 && d1 < 2.5 * grabInfo.Rg ? 1 : 0;
    }
    move(S, dt, false);
    // 地球の上: 熱い岩に触れている水が沸騰して湯気に
    let boil = 0;
    for (let i = 0; i < n; i++) {
      if (W.ph[i] || !W.hot[i] || W.body[i]) continue;
      boil += Q_BOIL * W.area * dt / L_VAP;
      W.boilAcc += Q_BOIL * W.area * dt / L_VAP;
      while (W.boilAcc > STEAM_PUFF) {
        W.boilAcc -= STEAM_PUFF;
        const c = com[0], dx = W.x[3 * i] - c[0], dy = W.x[3 * i + 1] - c[1], dz = W.x[3 * i + 2] - c[2], r = Math.hypot(dx, dy, dz);
        // 湯気は熱い所から上へ（数百 m/s）、まわりへ広がる。高さは見やすく強調して描く（tear.js）
        const up = 150 + 250 * rnd(), side = 60 * (rnd() - 0.5);
        puff(W.x[3 * i], W.x[3 * i + 1], W.x[3 * i + 2], dx / r * up + side, dy / r * up + side, dz / r * up + side, 1, 0, 6 * 3600 * (0.6 + 0.8 * rnd()));
      }
    }
    W.steamKg += boil;
    // かけらの上: 宇宙で沸きながら凍る（ちぎれてから）。凍った水はいちばん近い岩の粒に張りつく
    if (torn) for (let i = 0; i < n; i++) {
      if (W.ph[i] || W.body[i] !== 1) continue;
      let best = -1, bd = Infinity;
      const ids = grabInfo.ids;
      for (let q = 0; q < ids.length; q++) {
        const j = ids[q], d = (W.x[3 * i] - S.x[3 * j]) ** 2 + (W.x[3 * i + 1] - S.x[3 * j + 1]) ** 2 + (W.x[3 * i + 2] - S.x[3 * j + 2]) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      if (best < 0 || bd > (1.2 * S.s) ** 2) continue;          // まだ落ちている途中
      W.ph[i] = 2; W.stick[i] = best;
      for (let k = 0; k < 3; k++) W.off[3 * i + k] = W.x[3 * i + k] - S.x[3 * best + k];
      // 表面が沸いて出た水蒸気（凍るまでに水の約 14% が蒸発する: 温度を下げる熱＋凍る熱 ÷ 蒸発の熱）。秒速 0.3〜0.7 km で飛び出す
      const c = com[1], dx = W.x[3 * i] - c[0], dy = W.x[3 * i + 1] - c[1], dz = W.x[3 * i + 2] - c[2], r = Math.hypot(dx, dy, dz) || 1;
      for (let m = 0; m < 2; m++) {
        const sp = 300 + 400 * rnd(), jx = (rnd() - 0.5) * 0.6, jy = (rnd() - 0.5) * 0.6, jz = (rnd() - 0.5) * 0.6;
        puff(W.x[3 * i], W.x[3 * i + 1], W.x[3 * i + 2], S.v[3 * best] + (dx / r + jx) * sp, S.v[3 * best + 1] + (dy / r + jy) * sp, S.v[3 * best + 2] + (dz / r + jz) * sp, 2, 1, 4 * 3600);
      }
    }
    // 湯気・水蒸気の目印を動かす
    const P = W.p;
    for (let k = 0; k < P.n; k++) {
      P.age[k] += dt;
      if (P.kind[k] === 1) {
        // 地球の湯気: 上へ広がりながら減速（まわりの空気とまざる）、横へも広がる。地球の中心からの距離で高さを持つ
        P.v[3 * k] *= 0.996; P.v[3 * k + 1] *= 0.996; P.v[3 * k + 2] *= 0.996;
        for (let d = 0; d < 3; d++) P.x[3 * k + d] += P.v[3 * k + d] * dt;
      } else {
        // かけらの水蒸気: かけらの重力だけで飛ぶ（運んだあとは地球の重力を切っているので）。かけらに落ちたら霜になって消える
        g3[0] = g3[1] = g3[2] = 0;
        T.gravityAt(S, P.x[3 * k], P.x[3 * k + 1], P.x[3 * k + 2], 1, g3);
        if (!S.noCross) T.gravityAt(S, P.x[3 * k], P.x[3 * k + 1], P.x[3 * k + 2], 0, g3);
        for (let d = 0; d < 3; d++) { P.v[3 * k + d] += g3[d] * dt; P.x[3 * k + d] += P.v[3 * k + d] * dt; }
        const c = com[1], r = Math.hypot(P.x[3 * k] - c[0], P.x[3 * k + 1] - c[1], P.x[3 * k + 2] - c[2]);
        if (P.age[k] > 60 && r < (grabInfo ? grabInfo.Rg * 0.9 : 1e6)) P.age[k] = P.life[k];
      }
    }
    // 寿命が来たものを消す（湯気は冷えて雲・雨に、水蒸気は霜に）
    let w = 0;
    for (let k = 0; k < P.n; k++) {
      if (P.age[k] >= P.life[k]) continue;
      if (w !== k) {
        for (let d = 0; d < 3; d++) { P.x[3 * w + d] = P.x[3 * k + d]; P.v[3 * w + d] = P.v[3 * k + d]; }
        P.age[w] = P.age[k]; P.life[w] = P.life[k]; P.kind[w] = P.kind[k]; P.body[w] = P.body[k];
      }
      w++;
    }
    P.n = w;
    // 穴に流れこんだ水: 穴のまわり（穴の半径の 1.5 倍の範囲）で、地表より 300 km 以上低い所にある水
    let hole = 0;
    const R = S.rSurf || 6.3e6;
    if (grabInfo) {
      const u = grabInfo.u, cosLim = Math.cos(Math.min(1.2, 1.5 * grabInfo.Rg / R));
      for (let i = 0; i < n; i++) {
        if (W.body[i]) continue;
        const dx = W.x[3 * i] - com[0][0], dy = W.x[3 * i + 1] - com[0][1], dz = W.x[3 * i + 2] - com[0][2], r = Math.hypot(dx, dy, dz);
        if (r < R - 3e5 && (dx * u[0] + dy * u[1] + dz * u[2]) / r > cosLim) hole++;
      }
    }
    W.holeKg = hole * W.vol * 1000;
  }

  // はじめの場所（地球の中心の動きを引いて）から 200 km 以上動いた水
  let comNow = null;
  function moved() {
    const out = new Uint8Array(W.n), c = comNow || W.com0;
    for (let i = 0; i < W.n; i++) {
      const dx = W.x[3 * i] - W.x0[3 * i] - (c[0] - W.com0[0]), dy = W.x[3 * i + 1] - W.x0[3 * i + 1] - (c[1] - W.com0[1]), dz = W.x[3 * i + 2] - W.x0[3 * i + 2] - (c[2] - W.com0[2]);
      out[i] = dx * dx + dy * dy + dz * dz > 4e10 ? 1 : 0;
    }
    return out;
  }
  function snapshot() {
    if (!W.n) return null;
    const P = W.p;
    return {
      x: Float32Array.from(W.x), ph: W.ph.slice(), hot: W.hot.slice(), body: W.body ? W.body.slice() : new Uint8Array(W.n), mv: moved(),
      px: P.x.slice(0, 3 * P.n), pk: P.kind.slice(0, P.n), pa: Float32Array.from(P.age.slice(0, P.n), (a, k) => a / P.life[k]),
      steamKg: W.steamKg, holeKg: W.holeKg, oceanKg: OCEAN_V * 1000,
    };
  }

  GV.TearWater = { init, reset, step, snapshot, get n() { return W.n; } };
})();
