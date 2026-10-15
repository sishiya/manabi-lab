// 雑草がふえるまで — 竹（モウソウチク）の計算: 地下茎・タケノコ・稈（かん＝竹の幹）・ためた養分
// 簡単にしたところ: 地下茎は画面の左右の向きにだけのびる。つながった竹は、ためた養分を1つの池（B.R、kg）で分けあう。
// 稈の st: 4 地上に出る前（予定）/ 0 タケノコ（のびている）/ 1 竹 / 2 枯れた
'use strict';
const B = { rh: [], tips: [], culms: [], R: 0, nid: 1, barrier: [], tot: null, yr: null };
function bZeroTot() { return { shoots: 0, dug: 0, cut: 0, died: 0, aborted: 0, rhCut: 0, out: 0, planted: 0, stopped: 0 }; }
function bZeroYr() { return { shoots: 0, maxD: 0, planned: false, branched: false }; }
// タケノコの高さ（地上に出て a 日）: S字にのびる（推定。速いのは なかごろ）
function shootH(c, a) {
  const G = SP.growDays, k = G * 0.13, L0 = 1 / (1 + Math.exp(G * 0.5 / k));
  return c.Hf * Math.max(0, (1 / (1 + Math.exp(-(Math.min(a, G) - G * 0.5) / k)) - L0) / (1 - L0));
}
function hOfD(D) { const h = SP.hOfD; return Math.min(h[2], h[0] + h[1] * D); }
function culmMass(D) { return SP.culmMass * Math.pow(D / 0.1, 2.4); }
function crownW(D) { return 0.4 + 18 * D; }        // 枝葉の広がり m（推定）
function spacing(D) { return 0.25 + 4 * D; }       // となりの竹との間（推定。手入れした竹林は 2m 間かく: 長野県）
function rhNear(x, r) { let L = 0; for (const s of B.rh) { const a = Math.max(Math.min(s.x0, s.x1), x - r), b = Math.min(Math.max(s.x0, s.x1), x + r); if (b > a) L += b - a; } return L; }
function segById(id) { for (const s of B.rh) if (s.id === id) return s; return null; }
function rhDepthClamp(z) { return clamp(z, SP.rhDepth[0], SP.rhDepth[1]); }

function bambooReset(sc) {
  B.rh = []; B.tips = []; B.culms = []; B.R = 0; B.nid = 1; B.barrier = []; B.tot = bZeroTot(); B.yr = bZeroYr();
  if (!sc.grove) return;
  // 15年たった竹林（左の 4m）: いろいろな年の地下茎と、太さ 10〜14cm の竹
  for (let i = 0; i < 9; i++) {
    const x0 = rnd() * 3.2, L = 0.8 + rnd() * 1.6, age = 1 + Math.floor(rnd() * 8);
    B.rh.push({ id: B.nid++, x0, x1: Math.min(4, x0 + L), z: rhDepthClamp(0.08 + rnd() * 0.3), born: S.day - age * 365 - 100, len: 9 });
  }
  for (const z of [0.15, 0.3]) {   // 右へのびている先
    const s0 = { id: B.nid++, x0: 3.2, x1: 4, z, born: S.day - 200, len: 1 };
    B.rh.push(s0); B.tips.push({ seg: s0.id, dir: 1, alive: true });
  }
  for (let x = 0.3; x < 3.9; x += 0.65 + rnd() * 0.4) {
    const D = 0.10 + rnd() * 0.04, age = 1 + Math.floor(rnd() * 15);
    B.culms.push({ id: B.nid++, x, z0: 0.2, D, Hf: hOfD(D), H: hOfD(D), st: 1, em: S.day - age * 365 - 60, light: 1, lean: gauss() * 0.015 });
  }
  B.R = 40;
}

// ---------- 光: 0.5m ごとに枝葉の重なりを数える ----------
const BIN = 0.5;
function bLight() {
  const nb = Math.ceil(BED_W / BIN), cov = new Float32Array(nb);
  const live = B.culms.filter(c => c.st === 1 || (c.st === 0 && c.H > 3));
  for (const c of live) { const w = crownW(c.D) / 2; for (let i = Math.max(0, Math.floor((c.x - w) / BIN)); i <= Math.min(nb - 1, Math.floor((c.x + w) / BIN)); i++) cov[i] += c.H / 15; }
  for (const c of live) {
    const w = crownW(c.D) / 2; let L = 0, n = 0;
    for (let i = Math.max(0, Math.floor((c.x - w) / BIN)); i <= Math.min(nb - 1, Math.floor((c.x + w) / BIN)); i++) { L += Math.min(1, 1.3 * (c.H / 15) / Math.max(1e-6, cov[i])); n++; }
    c.light = n ? Math.min(1, L / n) : 1;
  }
  B.cov = cov;
}

// ---------- 春: ためた養分で、今年のタケノコの数と太さを決める ----------
function planShoots(doy) {
  B.yr.planned = true;
  const live = B.culms.filter(c => c.st === 1);
  const maxD = live.reduce((m, c) => Math.max(m, c.D), 0) || 0.02;
  const odd = (yearOf(S.day) % 2) ? 1.25 : 0.75;   // たけのこの表年・裏年（おおむね1年おき: 林野庁。大きさは推定）
  let budget = B.R * SP.shootShare * odd;
  let D = Math.min(SP.dmax, maxD < 0.08 ? maxD * 1.35 + 0.006 : maxD * 1.1 + 0.004);   // 若い竹やぶは、年ごとに太い竹を出す（推定）
  while (D > 0.008 && culmMass(D) > budget) D *= 0.85;   // 養分が少ないと細い竹（切りつづけると竹は小さくなる: 長野県）
  if (culmMass(D) > budget) return;
  // 芽: 1年以上たった地下茎の節。3〜4年目がいちばん出しやすい（林野庁）
  const cand = [];
  for (const sg of B.rh) {
    // 年は「n年目」で数える（去年の秋にのびた地下茎は、この春は2年目）。出しやすさの大きさは推定
    const age = (S.day - sg.born) / 365, w = age < 0.4 ? 0 : age < 1.4 ? 0.4 : age < 2.4 ? 0.8 : age < 4.4 ? 1 : age < 5.4 ? 0.6 : 0.2;
    if (!w) continue;
    const a = Math.min(sg.x0, sg.x1), b = Math.max(sg.x0, sg.x1);
    for (let x = a + 0.1; x < b; x += 0.2) cand.push({ x: x + (rnd() - 0.5) * 0.1, z: sg.z, w: w * rnd() });
  }
  cand.sort((p, q) => q.w - p.w);
  const win = SP.shootWin;
  for (const p of cand) {
    if (p.x < 0.05 || p.x > BED_W - 0.05) continue;
    const Di = clamp(D * (0.8 + 0.3 * rnd()), 0.008, SP.dmax), cost = culmMass(Di);
    if (cost > budget) continue;
    if (B.culms.some(c => c.st !== 2 && Math.abs(c.x - p.x) < spacing(Math.max(Di, c.D)) * 0.7)) continue;
    budget -= cost; B.R -= cost;
    const em = S.day + rnd() * Math.max(1, (win[1] - doy) * 0.8);
    B.culms.push({ id: B.nid++, x: p.x, z0: p.z, D: Di, Hf: hOfD(Di), H: 0, st: 4, em, light: 1, lean: gauss() * 0.015,
      abortAt: rnd() < SP.abort ? SP.growDays * (0.15 + 0.4 * rnd()) : 0 });
  }
}

// ---------- 地下茎: 夏の終わりから秋にのびる ----------
function growRhizomes(dt) {
  if (!B.yr.branched) {   // 年に1回: 地下茎に使う養分を決め、1〜4年目の地下茎から枝分かれ
    B.yr.branched = true; B.yr.rhBudget = B.R * SP.rhShare;
    for (const sg of B.rh.slice()) {
      const age = (S.day - sg.born) / 365;
      if (age < 1 || age > 4 || rnd() > SP.branch || B.tips.filter(t => t.alive).length >= 10) continue;
      const mid = (sg.x0 + sg.x1) / 2;
      if (rhNear(mid, 1) > SP.rhDense) continue;   // まわりがもう地下茎だらけ
      const a = Math.min(sg.x0, sg.x1), b = Math.max(sg.x0, sg.x1), x = a + rnd() * (b - a);
      const ns = { id: B.nid++, x0: x, x1: x, z: rhDepthClamp(sg.z + gauss() * 0.06), born: S.day, len: 0.6 + 0.8 * rnd() };
      B.rh.push(ns); B.tips.push({ seg: ns.id, dir: rnd() < 0.5 ? -1 : 1, alive: true });
    }
  }
  for (const t of B.tips) {
    if (!t.alive) continue;
    const sg = segById(t.seg); if (!sg) { t.alive = false; continue; }
    const L = Math.min(SP.rhV * dt * (0.6 + 0.8 * rnd()), B.yr.rhBudget / SP.rhCost, B.R / SP.rhCost);
    if (L <= 0) continue;
    B.R -= L * SP.rhCost; B.yr.rhBudget -= L * SP.rhCost;
    let nx = sg.x1 + t.dir * L;
    for (const bx of B.barrier) if ((sg.x1 - bx) * (nx - bx) <= 0 && sg.z < SP.barrierDepth) {   // 根止めの板に当たった
      nx = bx - t.dir * 0.01; t.alive = false; B.tot.stopped++;
      logEvent('地下茎の先が根止めの板に当たって止まった', 'act');
    }
    if (nx < 0 || nx > BED_W) { nx = clamp(nx, 0, BED_W); t.alive = false; B.tot.out++; logEvent('地下茎が帯の外（となり）へ出ていった', 'shed'); }
    sg.x1 = nx;
    if (t.alive && Math.abs(sg.x1 - sg.x0) > (sg.len || 1)) {   // 1m ほどごとに、少し深さを変えて続く
      const ns = { id: B.nid++, x0: sg.x1, x1: sg.x1, z: rhDepthClamp(sg.z + gauss() * 0.05), born: S.day, len: 0.6 + 0.8 * rnd(), prev: sg.id };
      B.rh.push(ns); t.seg = ns.id;
    }
  }
}

// ---------- 1コマ ----------
function stepBamboo(T, dt) {
  const sp = SP, doy = doyOf(S.day), fT = clamp((T - 5) / 20, 0, 1);
  bLight();
  const leaf = (doy >= 120 && doy < 180) ? 0.7 : 1;   // 5〜6月は葉の入れかわり（長野県）。そのぶん少なく（推定）
  for (const c of B.culms) if (c.st === 1) B.R += sp.prod * (c.D / 0.1) ** 1.3 * fT * c.light * leaf * dt;
  if (!B.yr.planned && doy >= sp.shootWin[0] && doy < sp.shootWin[1]) planShoots(doy);
  const keep = [];
  for (const c of B.culms) {
    if (c.st === 4) {
      if (S.day >= c.em) {
        c.st = 0; B.yr.shoots++; B.tot.shoots++; B.yr.maxD = Math.max(B.yr.maxD, c.D);
        if (!B.yr.firstShoot) { B.yr.firstShoot = true; logEvent('タケノコが地上に出た（' + S.year + '年目）', 'em'); }
        if (S.opts.autoPull) { B.tot.dug++; continue; }   // 実験: 出たらすぐ掘る
      }
      keep.push(c); continue;
    }
    if (c.st === 0) {
      const a = S.day - c.em;
      c.H = shootH(c, a);
      if (c.abortAt && a >= c.abortAt) { c.st = 2; c.dd = 0; B.tot.aborted++; }
      else if (a >= sp.growDays) { c.st = 1; c.H = c.Hf; }
      keep.push(c); continue;
    }
    if (c.st === 1) {
      const age = (S.day - c.em) / 365, rate = age > 8 ? clamp((age - 8) / (sp.life - 8), 0, 1.5) * 0.35 : 0;   // 年をとると枯れやすい（推定）
      if (rate && rnd() < 1 - Math.exp(-rate * dt / 365)) { c.st = 2; c.dd = 0; B.tot.died++; }
      keep.push(c); continue;
    }
    c.dd += dt; if (c.dd < 300) keep.push(c);   // 枯れた竹は 300日ほどで倒れて消える（推定）
  }
  B.culms = keep;
  if (doy >= sp.rhWin[0] && doy < sp.rhWin[1]) growRhizomes(dt);
  B.R -= sp.keep * bCounts().rh * dt;   // 地下茎を生かしておく
  // 古い地下茎は枯れる（推定 10年）
  const old = S.day - sp.rhLife * 365;
  if (B.rh.some(s => s.born < old)) {
    B.rh = B.rh.filter(s => s.born >= old);
    for (const t of B.tips) if (t.alive && !segById(t.seg)) t.alive = false;
  }
  B.R = Math.max(0, B.R);
}
function bambooNewYear() { B.yr = bZeroYr(); }

// ---------- 数える ----------
function bCounts() {
  let culms = 0, shoots = 0, dead = 0, maxD = 0, rh = 0, tips = 0;
  for (const c of B.culms) { if (c.st === 1) { culms++; maxD = Math.max(maxD, c.D); } else if (c.st === 0) shoots++; else if (c.st === 2) dead++; }
  for (const s of B.rh) rh += Math.abs(s.x1 - s.x0);
  for (const t of B.tips) if (t.alive) tips++;
  return { culms, shoots, dead, maxD, rh, tips, R: B.R };
}

// ---------- 道具（stroke k は model.js の newStroke） ----------
function bPlant(x, k) {
  if (x < 0.2 || x > BED_W - 0.2) return false;
  if (k.lastX != null && Math.abs(x - k.lastX) < 0.8) return false;
  k.lastX = x; k.n++; span(k, x, x);
  const z = 0.18, D = 0.03;   // 植える若い竹: 太さ 3cm・高さ 4.7m と、地下茎 50cm（推定）
  const a = { id: B.nid++, x0: x, x1: x + 0.25, z, born: S.day - 400, len: 1 }, b = { id: B.nid++, x0: x, x1: x - 0.25, z, born: S.day - 400, len: 1 };
  B.rh.push(a, b); B.tips.push({ seg: a.id, dir: 1, alive: true }, { seg: b.id, dir: -1, alive: true });
  B.culms.push({ id: B.nid++, x, z0: z, D, Hf: hOfD(D), H: hOfD(D), st: 1, em: S.day - 365, light: 1, lean: gauss() * 0.015 });
  B.R += 6; B.tot.planted++;
  if (typeof fxDrop === 'function') fxDrop(x, 0.3);
  return true;
}
function bDig(x, y, k) {   // タケノコを掘る（のびている途中のもの）
  let best = null, bd = 1e9;
  const tol = k.tol || 0.4;
  for (const c of B.culms) if (c.st === 0 && !k.ids.has(c.id)) { const d = Math.abs(c.x - x); if (d < tol && d < bd) { bd = d; best = c; } }
  if (!best) return null;
  k.ids.add(best.id); k.n++; span(k, best.x, best.x); B.tot.dug++;
  B.culms = B.culms.filter(c => c !== best);
  if (typeof fxPullBamboo === 'function') fxPullBamboo(best);
  return best;
}
function bCut(x0, x1, k) {
  let n = 0;
  B.culms = B.culms.filter(c => {
    if (c.st === 4 || c.x < x0 || c.x > x1) return true;
    if (c.st !== 2) n++;
    return false;
  });
  k.n += n; B.tot.cut += n; span(k, x0, x1);
}
function bTill(x0, x1, depth, k) {   // 浅い地下茎（depth より上）を切る。深いものは残る
  const out = [];
  for (const sg of B.rh) {
    const a = Math.min(sg.x0, sg.x1), b = Math.max(sg.x0, sg.x1);
    if (sg.z >= depth || b < x0 || a > x1) { out.push(sg); continue; }
    k.n += Math.round((Math.min(b, x1) - Math.max(a, x0)) * 100); B.tot.rhCut++;
    const tip = B.tips.find(t => t.alive && t.seg === sg.id), dir = sg.x1 >= sg.x0 ? 1 : -1;
    const left = a < x0 ? { x0: a, x1: x0 } : null, right = b > x1 ? { x0: x1, x1: b } : null;
    for (const part of [left, right]) {
      if (!part) continue;
      const growing = tip && part.x0 <= sg.x1 + 1e-9 && sg.x1 <= part.x1 + 1e-9;   // のびている先がこちらに残った
      const ns = { id: growing ? sg.id : B.nid++, x0: dir > 0 ? part.x0 : part.x1, x1: dir > 0 ? part.x1 : part.x0, z: sg.z, born: sg.born, len: sg.len };
      out.push(ns);
    }
    if (tip && sg.x1 >= x0 && sg.x1 <= x1) tip.alive = false;   // 先が切られた
  }
  B.rh = out;
  for (const t of B.tips) if (t.alive && !segById(t.seg)) t.alive = false;
  k.depth = depth; span(k, x0, x1);
}
function bBarrier(x, k) {
  const i = B.barrier.findIndex(b => Math.abs(b - x) < 0.15);
  if (i >= 0) { B.barrier.splice(i, 1); k.on = false; } else { B.barrier.push(clamp(x, 0.05, BED_W - 0.05)); k.on = true; }
  k.n++; span(k, x, x);
}
