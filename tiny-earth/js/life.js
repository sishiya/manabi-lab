// ちいさな地球 — 生きもの（陸: シカ・ウサギ・小鳥／海: 小魚・大きな魚）
// 「地球と同じ動き方をするとしたら、この星の物理でどうなるか」を計算する。大きさ・重さは代表の値（推定）。
//   歩く: 歩きから走りに変わるのはフルード数 v²/(gL) ≈ 0.5（Kram ほか 1997）→ 歩く速さは √(0.5 g L) まで。
//   跳ぶ: 地球と同じ速さで跳ぶ → 重力（1/r²）＋空気の抵抗（抗力係数 1、推定）＋風＋コリオリ力 で飛ぶ。殻にぶつかれば止まる。
//   泳ぐ: 体の高さの2倍より浅い所には入れない（推定）。干上がって深い所へ逃げられなければ打ち上げられる。
//   生まれる・食べる・増えるは入れない。
'use strict';
const LIFE = (() => {
  const SP = [
    { id: 'deer', name: 'シカ', kind: 'land', n: 40, m: 60, len: 1.5, hgt: 1.0, leg: 0.8, A: 0.5, vE: 1.3, jump: 4.0, jumpRate: 1 / (8 * 3600), drown: 1.0, col: [0.62, 0.42, 0.24] },
    { id: 'rabbit', name: 'ウサギ', kind: 'land', n: 80, m: 2, len: 0.4, hgt: 0.25, leg: 0.15, A: 0.04, vE: 0.6, jump: 2.5, jumpRate: 1 / 1800, drown: 0.25, col: [0.86, 0.84, 0.80] },
    { id: 'bird', name: '小鳥', kind: 'bird', n: 40, m: 0.03, len: 0.15, hgt: 0.1, leg: 0.03, A: 0.004, vE: 0.2, fly: 10, flyRate: 1 / 900, drown: 0.1, col: [0.95, 0.72, 0.25] },
    { id: 'fish', name: '小魚', kind: 'sea', n: 240, len: 0.2, depth: 0.05, swim: 0.5, col: [0.75, 0.82, 0.9] },
    { id: 'bigfish', name: '大きな魚', kind: 'sea', n: 30, len: 2.0, depth: 0.5, swim: 1.0, col: [0.35, 0.45, 0.62] },
  ];
  const FR = 0.5, CD = 1.0, TURN_LAND = 60, TURN_SEA = 10;

  function create(M, TR, O) {
    // となりのマスの一覧（CSR）
    const nb = new Int32Array(M.vEdge.length);
    for (let i = 0; i < M.N; i++) for (let j = M.deg[i]; j < M.deg[i + 1]; j++) { const e = M.vEdge[j]; nb[j] = M.A[e] === i ? M.B[e] : M.A[e]; }
    return { M, TR, O, nb, agents: [], log: [], counts: null, on: true };
  }
  // 点 (x,y,z) に近いマスを、前のマスから坂をのぼるように探す
  function cellNear(L, c, x, y, z) {
    const M = L.M, p = M.pos;
    for (let it = 0; it < 200; it++) {
      let best = c, bs = p[c * 3] * x + p[c * 3 + 1] * y + p[c * 3 + 2] * z;
      for (let j = M.deg[c]; j < M.deg[c + 1]; j++) { const k = L.nb[j], s = p[k * 3] * x + p[k * 3 + 1] * y + p[k * 3 + 2] * z; if (s > bs) { bs = s; best = k; } }
      if (best === c) return c; c = best;
    }
    return c;
  }
  const water = (L, i) => L.O.h[i];
  // そのマスに、その生きものがいられるか
  function okCell(L, sp, i) {
    const land = L.TR.elev[i] >= 0;
    if (sp.kind === 'sea') return !land && water(L, i) >= 2 * sp.depth;
    return land;
  }
  function rnd() { return Math.random(); }
  function tangentDir(px, py, pz) {
    let hx = rnd() - 0.5, hy = rnd() - 0.5, hz = rnd() - 0.5;
    const d = hx * px + hy * py + hz * pz; hx -= d * px; hy -= d * py; hz -= d * pz;
    const l = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1; return [hx / l, hy / l, hz / l];
  }

  // 大きさが変わったら置きなおす
  function reset(L) {
    const M = L.M; L.agents = []; L.log = []; L.t = 0;
    L.counts = SP.map(() => ({ alive: 0, total: 0, cause: {} }));
    SP.forEach((sp, s) => {
      const cells = []; for (let i = 0; i < M.N; i++) if (okCell(L, sp, i) && (sp.kind !== 'bird' || L.TR.forest[i])) cells.push(i);
      L.counts[s].room = cells.length;
      if (!cells.length) return;
      for (let k = 0; k < sp.n; k++) {
        const i = cells[Math.floor(rnd() * cells.length)];
        const px = M.pos[i * 3], py = M.pos[i * 3 + 1], pz = M.pos[i * 3 + 2];
        L.agents.push({ s, sp, alive: true, cause: '', c: i, p: [px, py, pz], h: tangentDir(px, py, pz), air: false, X: null, V: null, y: 0, tt: rnd() * 60, maxY: 0, flyLeft: 0 });
        L.counts[s].alive++; L.counts[s].total++;
      }
    });
    L.P = PHYS.at(L.O.R);
  }
  function kill(L, a, cause) {
    if (!a.alive) return;
    a.alive = false; a.cause = cause; a.air = false;
    const c = L.counts[a.s]; c.alive--; c.cause[cause] = (c.cause[cause] || 0) + 1;
  }
  function note(L, s) { L.log.unshift([L.O.t, s]); if (L.log.length > 8) L.log.pop(); }

  // 歩く速さ（フルード数の上限）
  function walkSpeed(L, sp) { return Math.min(sp.vE, Math.sqrt(FR * L.P.g * sp.leg)); }

  // 球の上を角度 th だけ進む
  function move(a, th) {
    const [px, py, pz] = a.p, [hx, hy, hz] = a.h, c = Math.cos(th), s = Math.sin(th);
    a.p = [px * c + hx * s, py * c + hy * s, pz * c + hz * s];
    a.h = [hx * c - px * s, hy * c - py * s, hz * c - pz * s];
  }
  function turn(a, amt) {
    const [px, py, pz] = a.p, [hx, hy, hz] = a.h, bx = py * hz - pz * hy, by = pz * hx - px * hz, bz = px * hy - py * hx;
    const t = (rnd() - 0.5) * amt, c = Math.cos(t), s = Math.sin(t);
    a.h = [hx * c + bx * s, hy * c + by * s, hz * c + bz * s];
  }

  // 跳ぶ: 上向き 60°・地球と同じとび出す速さ
  function launch(L, a, v0) {
    const R = L.O.R, [px, py, pz] = a.p, [hx, hy, hz] = a.h, up = Math.sin(1.05), fw = Math.cos(1.05);
    const r = R + Math.max(0, L.O.z[a.c]);
    a.X = [px * r, py * r, pz * r]; a.V = [(px * up + hx * fw) * v0, (py * up + hy * fw) * v0, (pz * up + hz * fw) * v0];
    a.air = true; a.maxY = 0;
  }
  // 空中: 重力 GM/r²・空気の抵抗・風・コリオリ力と遠心力（星は y 軸のまわりに自転）。殻（1.25R）で止まる
  function fly(L, a, dt, shell) {
    const O = L.O, R = O.R, GM = O.P.g * R * R, W = PHYS.OMEGA, sp = a.sp, k = 0.5 * CD * sp.A / sp.m, lam = O.P.g * R / (287.05 * 288.15);
    let X = a.X, V = a.V, t = 0;
    while (t < dt) {
      const h = Math.min(0.25, dt - t);
      const r = Math.sqrt(X[0] * X[0] + X[1] * X[1] + X[2] * X[2]), ux = X[0] / r, uy = X[1] / r, uz = X[2] / r;
      // 風（軸 a のまわり）と空気の密度（殻の中の等温の大気。小さい星ではほぼ 1.2 のまま）
      const Wd = O.wind, wx = Wd.U * (Wd.ay * uz - Wd.az * uy), wy = Wd.U * (Wd.az * ux - Wd.ax * uz), wz = Wd.U * (Wd.ax * uy - Wd.ay * ux);
      const rho = shell ? PHYS.RHO_A * Math.exp(lam * (R / r - 1)) : 0;
      const rx = V[0] - wx, ry = V[1] - wy, rz = V[2] - wz, vr = Math.sqrt(rx * rx + ry * ry + rz * rz);
      const g = GM / (r * r);
      const ax = -g * ux - rho * k * vr * rx + 2 * W * V[2] + W * W * X[0];
      const ay = -g * uy - rho * k * vr * ry;
      const az = -g * uz - rho * k * vr * rz - 2 * W * V[0] + W * W * X[2];
      V = [V[0] + ax * h, V[1] + ay * h, V[2] + az * h];
      X = [X[0] + V[0] * h, X[1] + V[1] * h, X[2] + V[2] * h];
      t += h;
      const r2 = Math.sqrt(X[0] * X[0] + X[1] * X[1] + X[2] * X[2]);
      a.maxY = Math.max(a.maxY, r2 - R);
      if (shell && r2 > 1.25 * R) {   // 殻にぶつかる: 外向きの速さを消す
        const f = 1.25 * R / r2; X = [X[0] * f, X[1] * f, X[2] * f];
        const vu = (V[0] * X[0] + V[1] * X[1] + V[2] * X[2]) / (1.25 * R);
        if (vu > 0) V = [V[0] - vu * X[0] / (1.25 * R), V[1] - vu * X[1] / (1.25 * R), V[2] - vu * X[2] / (1.25 * R)];
        a.hitShell = true;
      }
      if (!shell && r2 > 50 * R) { a.X = X; a.V = V; return 'space'; }
      a.c = cellNear(L, a.c, X[0] / r2, X[1] / r2, X[2] / r2);
      const ground = R + Math.max(O.z[a.c], O.z[a.c] + O.h[a.c]);
      if (r2 <= ground && (V[0] * X[0] + V[1] * X[1] + V[2] * X[2]) < 0) { a.X = X; a.V = V; return 'land'; }
    }
    a.X = X; a.V = V; return 'air';
  }

  // ふだんの時間を進める（殻あり）
  function step(L, dt) {
    if (!L.on || !L.counts) return;
    const O = L.O, R = O.R, M = L.M; L.t = O.t;
    for (const a of L.agents) {
      if (!a.alive) continue;
      const sp = a.sp;
      if (a.air) {
        const res = fly(L, a, dt, true);
        if (res === 'land') {
          a.air = false; const r = Math.hypot(...a.X); a.p = [a.X[0] / r, a.X[1] / r, a.X[2] / r]; a.h = tangentDir(...a.p);
          if (a.flights === undefined) a.flights = 0;
          if (O.h[a.c] > sp.drown && O.z[a.c] < 0) { kill(L, a, '海に落ちた'); note(L, `${sp.name}が海に落ちた（最高 ${Math.round(a.maxY)} m まで浮いた）`); }
          else if (a.maxY > 3 * sp.hgt) note(L, `${sp.name}が降りてきた（最高 ${a.maxY < 10 ? a.maxY.toFixed(1) : Math.round(a.maxY)} m${a.hitShell ? '、殻にぶつかった' : ''}）`);
          a.hitShell = false;
        }
        continue;
      }
      if (sp.kind === 'sea') { swim(L, a, dt); continue; }
      // 陸: あふれた水でおぼれる（体の高さより深い。推定）
      // 小鳥は木の上にいるのでおぼれない
      if (sp.kind !== 'bird' && L.TR.elev[a.c] >= 0 && O.h[a.c] > sp.drown) { kill(L, a, 'あふれた水でおぼれた'); note(L, `${sp.name}があふれた水でおぼれた（深さ ${UI.len(O.h[a.c])}）`); continue; }
      // ときどき跳ぶ（ウサギはふだんの動き方、シカはおどろいたとき）
      if (sp.jump && rnd() < 1 - Math.exp(-dt * sp.jumpRate)) { launch(L, a, sp.jump); continue; }
      // 小鳥: ときどき飛ぶ（木から木へ）。飛ぶあいだは羽ばたきで高さを保つ（地上 20 m）
      if (sp.kind === 'bird') {
        if (a.flyLeft <= 0 && rnd() < 1 - Math.exp(-dt * sp.flyRate)) { a.flyLeft = 20 + rnd() * 40; a.h = tangentDir(...a.p); }
        if (a.flyLeft > 0) { const d = Math.min(dt, a.flyLeft); a.flyLeft -= d; move(a, sp.fly * d / R); a.c = cellNear(L, a.c, ...a.p); continue; }
      }
      walk(L, a, dt);
    }
  }
  function walk(L, a, dt) {
    const R = L.O.R, v = walkSpeed(L, a.sp);
    let left = dt;
    while (left > 0) {
      const d = Math.min(left, TURN_LAND); left -= d;
      turn(a, 1.5);
      const old = a.p.slice(), oc = a.c;
      move(a, v * d / R);
      a.c = cellNear(L, a.c, ...a.p);
      if (!okCell(L, a.sp, a.c) || (L.O.h[a.c] > 0.5 * a.sp.drown && L.TR.elev[a.c] >= 0)) { a.p = old; a.c = oc; a.h = a.h.map(x => -x); }
    }
  }
  function swim(L, a, dt) {
    const O = L.O, R = O.R, sp = a.sp, M = L.M;
    // 干上がりそう: となりのいちばん深いマスへ逃げる。どこも浅ければ打ち上げられる
    if (O.h[a.c] < 2 * sp.depth) {
      let best = -1, bh = 2 * sp.depth;
      for (let j = M.deg[a.c]; j < M.deg[a.c + 1]; j++) { const k = L.nb[j]; if (L.TR.elev[k] < 0 && O.h[k] >= bh) { bh = O.h[k]; best = k; } }
      if (best < 0) { kill(L, a, '干上がって打ち上げられた'); note(L, `${sp.name}が干上がって打ち上げられた`); return; }
      a.c = best; a.p = [M.pos[best * 3], M.pos[best * 3 + 1], M.pos[best * 3 + 2]]; a.h = tangentDir(...a.p);
      return;
    }
    let left = dt;
    while (left > 0) {
      const d = Math.min(left, TURN_SEA); left -= d;
      turn(a, 1.2);
      const old = a.p.slice(), oc = a.c;
      move(a, sp.swim * d / R);
      a.c = cellNear(L, a.c, ...a.p);
      if (!okCell(L, sp, a.c)) { a.p = old; a.c = oc; a.h = a.h.map(x => -x); }
    }
  }
  // おどろかす: 点 c から距離 dist（m）以内の陸の生きものが跳ぶ
  function startle(L, c, dist) {
    const M = L.M, R = L.O.R, p = M.pos;
    let n = 0;
    for (const a of L.agents) {
      if (!a.alive || a.air || a.sp.kind === 'sea' || !a.sp.jump) continue;
      const d = Math.acos(Math.max(-1, Math.min(1, a.p[0] * p[c * 3] + a.p[1] * p[c * 3 + 1] + a.p[2] * p[c * 3 + 2]))) * R;
      if (d < dist) { a.h = tangentDir(...a.p); launch(L, a, a.sp.jump); n++; }
    }
    if (n) note(L, `おどろいて ${n} ひきが跳んだ`);
  }

  // ---------- 正直モード（殻を外してから t 秒）: 生きもののその時の様子を返す（ふだんの状態は書きかえない） ----------
  // 返す: 1ぴきずつ { alive, cause, up（空へ離れた高さ m） }、まとめ
  function honest(L, Mo, t) {
    // 1ぴきずつ「死ぬ時刻とわけ」を、時刻の格子をさかのぼらずに前から調べて一度だけ出す（一度死んだら生き返らない）
    if (L.hc !== Mo) { L.hc = Mo; L.hd = fates(L, Mo); }
    const out = [], sum = SP.map(() => ({ alive: 0, cause: {} })), R = L.O.R;
    L.agents.forEach((a, k) => {
      const f = L.hd[k];
      let alive = a.alive, cause = a.cause, up = 0;
      if (alive && f.t != null && t >= f.t) { alive = false; cause = f.cause; if (f.up) up = Math.min(30 * R, f.up * (t - f.t)); }
      else if (alive && f.tUnc != null && t >= f.tUnc) cause = '意識を失った';
      out.push({ alive, cause, up });
      if (alive) sum[a.s].alive++; else sum[a.s].cause[cause] = (sum[a.s].cause[cause] || 0) + 1;
    });
    return { out, sum };
  }
  function fates(L, Mo) {
    const P = L.P, A = Mo.A;
    const pArm = HONEST.pLiq(310.15) / HONEST.P0;           // 体温 37℃ の水の蒸気圧（アームストロング限界 約 6.3 kPa）
    const tArm = firstT(Mo, A, x => HONEST.airAt(A, x).p < pArm);
    const tWind = A.u30t || null, uWind = A.u30 || 0;       // 空気が抜けるときの上向きの風（地上 30 m）
    const db = HONEST.PV15 / (1000 * P.g);                   // 底まで沸く深さ
    return L.agents.map(a => {
      if (!a.alive) return {};
      if (a.sp.kind === 'sea') {
        // 海の柱が底まで沸く浅い海では、沸いたときに死ぬ。深い海は、氷の下の水が体の高さの2倍より浅くなったら死ぬ
        const d = L.O.h[a.c];
        for (const t of Mo.tGrid) {
          const c = HONEST.colAt(Mo, d, t);
          if (c[2] && d <= db) return { t, cause: '海が沸いた' };
          if (c[0] < 2 * a.sp.depth && (c[1] > 0 || c[0] <= 0)) return { t, cause: '海が凍った・なくなった' };
        }
        return {};
      }
      // 浮いていた・飛んでいた: 抜ける空気の風が脱出速度より速ければ、いっしょに宇宙へ（離れる速さは見た目のため風の半分とする）
      if ((a.air || a.flyLeft > 0) && tWind && uWind > P.vEsc) return { t: tWind, cause: '空気といっしょに宇宙へ', up: uWind * 0.5 };
      if (tArm != null) return { t: tArm + 150, cause: '空気がなくなった', tUnc: tArm + 10 };
      return {};
    });
  }
  function firstT(Mo, A, f) { for (const t of Mo.tGrid) if (f(t)) return t; return null; }

  // 跳んだらどうなるか（数字の欄のため）: 風なしで1回跳ばせて、いちばん高い所と、降りるまでの時間を出す
  function preview(L, sp) {
    const O = L.O, R = O.R, i = L.agents.length ? L.agents[0].c : 0;
    const a = { sp, c: i, p: [L.M.pos[i * 3], L.M.pos[i * 3 + 1], L.M.pos[i * 3 + 2]], h: tangentDir(L.M.pos[i * 3], L.M.pos[i * 3 + 1], L.M.pos[i * 3 + 2]) };
    const U = O.wind.U; O.wind.U = 0;
    launch(L, a, sp.jump);
    let t = 0, res = 'air';
    while (res === 'air' && t < 30 * 86400) { const d = Math.min(600, Math.max(5, t * 0.1)); res = fly(L, a, d, true); t += d; }
    O.wind.U = U;
    const vEsc = O.P.vEsc, v = sp.jump;
    const noAir = v >= vEsc ? Infinity : v * v * R / (2 * O.P.g * R - v * v) * Math.sin(1.05) ** 2;   // 空気がなければ（上向きの分）
    return { maxY: a.maxY, time: t, shell: !!a.hitShell, noAir };
  }
  return { SP, create, reset, step, startle, honest, walkSpeed, cellNear, preview, fly, launch };
})();
