// world.js — 台所の場面・虫の動き・道具（描画とは無関係。早送りでも同じ関数を使う）
'use strict';

const W = 960, H = 600;
const FLOOR = {x0: 26, y0: 98, x1: 934, y1: 556};
const NIGHT = 40;          // 1回の夜（= 1世代の退治をまとめたもの）の長さ（秒）

const HIDES = [
  {id:'fridge', name:'冷蔵庫の下',     x: 100, y: 100},
  {id:'sink',   name:'流しの下',       x: 410, y: 100},
  {id:'stove',  name:'コンロのすき間', x: 705, y: 100},
  {id:'shelf',  name:'食器棚のうら',   x: 760, y: 554},
];
const FOODS = [
  {id:'stove', name:'コンロの前のこぼれ', x: 690, y: 175},
  {id:'floor', name:'床の食べこぼし',     x: 445, y: 345},
  {id:'trash', name:'ゴミ箱のそば',       x: 128, y: 470},
];
const TRASH = {x: 62, y: 512, r: 30};

const TOOL = {
  strike: 0.34,      // スリッパの影が出てから床に当たるまで（秒）
  swatR: 24,         // 当たる半径
  swatCool: 0.42,
  sprayR: 52, sprayRate: 5, sprayBudget: 12,   // 1晩にスプレーできる秒数
  mistLife: 4.5,
  doseK: 1.5,
  baitMax: 3,
  poisonDelay: [5, 9],
};
const BUG = {walk: 58, run: 170, turn: 7, eatRate: 0.9, full: 3};

const CELL = 12, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);

function sense(b) {          // 察知: 気づける距離と、気づいてから動くまで
  const s = b.p.sense;
  return {dist: 45 + 175 * s, lat: 0.30 - 0.28 * s};
}

function newWorld(pop, baits = []) {
  const w = {
    t: 0, pop, baits: baits.map(b => ({x: b.x, y: b.y})),
    mist: new Float32Array(GW * GH), mist2: new Float32Array(GW * GH),
    swats: [], fx: [], spraying: null, sprayLeft: TOOL.sprayBudget, swatCool: 0,
    rec: {swat: 0, spray: 0, bait: 0, swings: 0, sprayUsed: 0, rejects: 0, dodges: 0},
    killed: [], auto: null, autoT: {swat: 0, spray: 0}, lastDisturb: -99,
  };
  for (const b of pop) {
    const h = HIDES[Math.floor(Math.random() * HIDES.length)];
    Object.assign(b, {state: 'hidden', hide: h, x: h.x, y: h.y, a: 0, v: 0,
      food: 0, eatT: 0, outT: 0, dose: 0, poison: -1, alarm: -1, threat: null,
      target: null, rejected: new Set(), emote: null, emoteT: 0, alive: true, cause: null,
      wait: Math.random() * 3, walkPh: Math.random() * 6});
  }
  return w;
}

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function nearestHide(x, y) {
  let best = HIDES[0], bd = 1e9;
  for (const h of HIDES) { const d = dist(x, y, h.x, h.y); if (d < bd) { bd = d; best = h; } }
  return best;
}
function mistAt(w, x, y) {
  const i = Math.min(GW - 1, Math.max(0, Math.floor(x / CELL))), j = Math.min(GH - 1, Math.max(0, Math.floor(y / CELL)));
  return w.mist[j * GW + i];
}

function kill(w, b, cause) {
  if (!b.alive) return;
  const wasHidden = b.state === 'hidden';
  b.alive = false; b.cause = cause; b.state = 'dead'; b.diedHidden = wasHidden;
  w.rec[cause]++;
  w.killed.push(b);
  if (!wasHidden) w.fx.push({k: 'poof', x: b.x, y: b.y, t: 0, cause});
}

function chooseTarget(w, b) {
  const opts = [];
  for (const f of FOODS) opts.push({x: f.x + (Math.random() - .5) * 26, y: f.y + (Math.random() - .5) * 18, wt: 1, food: f});
  w.baits.forEach((bt, i) => { if (!b.rejected.has(bt)) opts.push({x: bt.x, y: bt.y, wt: 1.7, bait: bt}); });
  let r = Math.random() * opts.reduce((s, o) => s + o.wt, 0);
  for (const o of opts) { r -= o.wt; if (r <= 0) return o; }
  return opts[0];
}

function goHome(b, run) {
  b.state = run ? 'flee' : 'home';
  b.hide = nearestHide(b.x, b.y);
  b.target = {x: b.hide.x, y: b.hide.y};
}

// 毒エサの前で: 糖ぎらいの遺伝子があると、ブドウ糖を苦く感じてやめる
function tasteBait(w, b, bt) {
  if (Math.random() < GENE.gavReject[b.p.gav]) {
    b.rejected.add(bt); w.rec.rejects++;
    b.emote = 'reject'; b.emoteT = 1.2;
    b.target = chooseTarget(w, b); b.state = 'out';
  } else {
    b.poison = TOOL.poisonDelay[0] + Math.random() * (TOOL.poisonDelay[1] - TOOL.poisonDelay[0]);
    b.state = 'eat'; b.eatT = 1.2; b.target = null; b.onBait = true;
  }
}

function steer(b, tx, ty, speed, dt) {
  const want = Math.atan2(ty - b.y, tx - b.x) + (b.state === 'out' ? Math.sin(b.walkPh * 1.7) * 0.35 : 0);
  let da = want - b.a;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const turn = BUG.turn * (b.state === 'flee' ? 4 : 1) * dt;      // 逃げるときはすばやく向きを変える
  b.a += Math.max(-turn, Math.min(turn, da));
  b.v = speed;
  b.x += Math.cos(b.a) * speed * dt; b.y += Math.sin(b.a) * speed * dt;
  b.x = Math.max(FLOOR.x0 - 4, Math.min(FLOOR.x1 + 4, b.x));
  b.y = Math.max(FLOOR.y0 - 4, Math.min(FLOOR.y1 + 4, b.y));
  const dt2 = dist(b.x, b.y, TRASH.x, TRASH.y);       // ゴミ箱をよける
  if (dt2 < TRASH.r + 6) { const k = (TRASH.r + 6) / dt2; b.x = TRASH.x + (b.x - TRASH.x) * k; b.y = TRASH.y + (b.y - TRASH.y) * k; }
  b.walkPh += dt * speed * 0.25;
}

function stepBug(w, b, dt) {
  if (!b.alive) return;
  if (b.emoteT > 0) b.emoteT -= dt;
  if (b.poison >= 0) {
    b.poison -= dt;
    if (b.poison <= 0) { b.poison = -1; kill(w, b, 'bait'); return; }
  }
  if (b.state === 'hidden') {
    if (b.wait > 0) { b.wait -= dt; return; }
    if (b.food >= BUG.full || b.poison >= 0) return;
    // 警戒心が強いほど出てこない。叩く音・スプレーのあと（数秒）は、用心深いものほどじっとしている
    const calm = w.t - w.lastDisturb > 6 ? 1 : 1 - 0.95 * Math.min(1, 1.7 * b.p.wary);
    const rate = 0.32 * (1 - 0.8 * b.p.wary) * calm;
    if (mistAt(w, b.hide.x, b.hide.y + 8) > 0.25 + 0.5 * (1 - b.p.sense)) return;  // 入口に霧
    if (Math.random() < rate * dt) {
      b.state = 'out'; b.outT = 0; b.x = b.hide.x + (Math.random() - .5) * 14;
      b.y = b.hide.y + (b.hide.y < 300 ? 6 : -6); b.a = b.hide.y < 300 ? Math.PI / 2 : -Math.PI / 2;
      b.target = chooseTarget(w, b);
    }
    return;
  }
  b.outT += dt;
  // 霧の中: 薬の量がたまる。察知が鋭いものは早めに逃げる
  const c = mistAt(w, b.x, b.y);
  if (c > 0.01) {
    b.dose += c * TOOL.doseK * dt;
    if (b.dose > GENE.kdrDose[b.p.kdr]) { kill(w, b, 'spray'); return; }
    if (b.state !== 'flee' && c > 0.12 + 0.55 * (1 - b.p.sense)) { goHome(b, true); b.threat = null; }
  } else b.dose = Math.max(0, b.dose - 0.05 * dt);
  // スリッパに気づいた → 少し遅れて逃げ出す
  if (b.alarm >= 0) {
    b.alarm -= dt;
    if (b.alarm < 0) { goHome(b, true); b.fleeT = 0.45; }
  }
  if (b.state === 'out' || b.state === 'eat') {
    // 用もないのにびくっとして帰る（察知が鋭いことの損）・出ていられる時間（警戒心）
    if (Math.random() < 0.05 * b.p.sense * dt || b.outT > 15 * (1 - 0.62 * b.p.wary)) { goHome(b, false); }
  }
  switch (b.state) {
    case 'out': {
      const t = b.target;
      steer(b, t.x, t.y, BUG.walk, dt);
      if (dist(b.x, b.y, t.x, t.y) < 9) {
        if (t.bait && w.baits.includes(t.bait)) tasteBait(w, b, t.bait);
        else if (t.bait) b.target = chooseTarget(w, b);
        else { b.state = 'eat'; b.eatT = 0; b.onBait = false; }
      }
      break;
    }
    case 'eat':
      b.v = 0;
      b.food += BUG.eatRate * dt;
      if (b.onBait) { b.eatT -= dt; if (b.eatT <= 0) goHome(b, false); }
      else if (b.food >= BUG.full) goHome(b, false);
      break;
    case 'home': case 'flee': {
      let tx = b.target.x, ty = b.target.y;
      if (b.state === 'flee' && b.threat && b.fleeT > 0) {      // まず脅威から離れる向きへ
        b.fleeT -= dt;
        const ax = b.x - b.threat.x, ay = b.y - b.threat.y, l = Math.hypot(ax, ay) || 1;
        tx = b.x + ax / l * 60 + (b.target.x - b.x) * 0.15; ty = b.y + ay / l * 60 + (b.target.y - b.y) * 0.15;
      }
      steer(b, tx, ty, b.state === 'flee' ? BUG.run : BUG.walk * 1.25, dt);
      if (dist(b.x, b.y, b.hide.x, b.hide.y) < 10) {
        b.state = 'hidden'; b.x = b.hide.x; b.y = b.hide.y; b.threat = null; b.alarm = -1;
        b.wait = 1 + Math.random() * 2;
      }
      break;
    }
  }
}

// スリッパ: 影が落ち始めたとき、気づける距離にいる虫は、反応の速さに応じて逃げ出す
function swat(w, x, y) {
  if (w.swatCool > 0) return false;
  w.swatCool = TOOL.swatCool; w.rec.swings++; w.lastDisturb = w.t;
  const s = {x, y, t: 0};
  w.swats.push(s);
  for (const b of w.pop) {
    if (!b.alive || b.state === 'hidden') continue;
    const d = dist(b.x, b.y, x, y), se = sense(b);
    if (d < se.dist && b.alarm < 0 && b.state !== 'flee') { b.alarm = se.lat + Math.random() * 0.05; b.threat = {x, y}; }
    else if (b.state === 'flee') b.threat = {x, y};
  }
  return true;
}

function sprayAt(w, x, y, dt) {
  if (w.sprayLeft <= 0) { w.spraying = null; return; }
  w.sprayLeft -= dt; w.rec.sprayUsed += dt; w.lastDisturb = w.t;
  const R = TOOL.sprayR, ci = Math.floor(x / CELL), cj = Math.floor(y / CELL), n = Math.ceil(R / CELL);
  for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
    if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
    const d = dist((i + .5) * CELL, (j + .5) * CELL, x, y);
    if (d < R) w.mist[j * GW + i] += TOOL.sprayRate * dt * (1 - d / R);
  }
  // 霧が来るのを感じて逃げる（察知）
  for (const b of w.pop) {
    if (!b.alive || b.state === 'hidden' || b.state === 'flee') continue;
    if (dist(b.x, b.y, x, y) < R + 30 + 90 * b.p.sense && Math.random() < b.p.sense * 2.5 * dt) { goHome(b, true); b.threat = {x, y}; b.fleeT = 0.3; }
  }
}

function stepMist(w, dt) {
  const m = w.mist, m2 = w.mist2, k = Math.min(0.24, 1.6 * dt), dec = Math.exp(-dt / TOOL.mistLife);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const id = j * GW + i, c = m[id];
    const l = i > 0 ? m[id - 1] : c, r = i < GW - 1 ? m[id + 1] : c, u = j > 0 ? m[id - GW] : c, d = j < GH - 1 ? m[id + GW] : c;
    m2[id] = Math.min(3, (c + k * (l + r + u + d - 4 * c)) * dec);
  }
  w.mist = m2; w.mist2 = m;
}

function placeBait(w, x, y) {
  const near = w.baits.findIndex(b => dist(b.x, b.y, x, y) < 22);
  if (near >= 0) { w.baits.splice(near, 1); return 'removed'; }
  if (w.baits.length >= TOOL.baitMax) return 'full';
  if (x < FLOOR.x0 || x > FLOOR.x1 || y < FLOOR.y0 || y > FLOOR.y1) return 'out';
  w.baits.push({x, y});
  return 'placed';
}

// まかせる: 決まったやり方で道具を使う
const POLICIES = {
  mine:  {name:'いまのやり方'},
  swat:  {name:'叩くだけ',     swatRate: 1.3, sprayFrac: 0,    baits: 'none'},
  spray: {name:'スプレーだけ', swatRate: 0,   sprayFrac: 0.3,  baits: 'none'},
  bait:  {name:'毒エサだけ',   swatRate: 0,   sprayFrac: 0,    baits: 'three'},
  mix:   {name:'ぜんぶ使う',   swatRate: 0.7, sprayFrac: 0.15, baits: 'three'},
  none:  {name:'なにもしない', swatRate: 0,   sprayFrac: 0,    baits: 'none'},
};
const DEFAULT_BAITS = [{x: 655, y: 205}, {x: 470, y: 300}, {x: 160, y: 430}];

function stepAuto(w, dt) {
  const P = w.auto;
  if (!P) return;
  const visible = w.pop.filter(b => b.alive && b.state !== 'hidden' && b.state !== 'flee');
  if (P.swatRate > 0) {
    w.autoT.swat -= dt;
    if (w.autoT.swat <= 0 && visible.length) {
      const b = visible[Math.floor(Math.random() * visible.length)];
      if (swat(w, b.x + (Math.random() - .5) * 30, b.y + (Math.random() - .5) * 30)) w.autoT.swat = 1 / P.swatRate;
    }
  }
  if (P.sprayFrac > 0) {
    w.autoT.spray -= dt;
    if (w.spraying) { w.spraying.t -= dt; sprayAt(w, w.spraying.x, w.spraying.y, dt); if (w.spraying && w.spraying.t <= 0) w.spraying = null; }
    else if (w.autoT.spray <= 0 && visible.length && w.sprayLeft > 0) {
      const b = visible[Math.floor(Math.random() * visible.length)];
      w.spraying = {x: b.x, y: b.y, t: 0.6, auto: true};
      w.autoT.spray = 0.6 / P.sprayFrac;
    }
  }
}

function stepWorld(w, dt) {
  w.t += dt;
  if (w.swatCool > 0) w.swatCool -= dt;
  stepAuto(w, dt);
  if (w.spraying && !w.spraying.auto) sprayAt(w, w.spraying.x, w.spraying.y, dt);
  stepMist(w, dt);
  for (const s of w.swats) {
    const before = s.t;
    s.t += dt;
    if (before < TOOL.strike && s.t >= TOOL.strike) {
      let hit = 0;
      for (const b of w.pop) {
        if (!b.alive || b.state === 'hidden') continue;
        if (dist(b.x, b.y, s.x, s.y) < TOOL.swatR) { kill(w, b, 'swat'); hit++; }
        else if (b.threat && b.threat.x === s.x && b.threat.y === s.y && dist(b.x, b.y, s.x, s.y) < TOOL.swatR + 40) w.rec.dodges++;
      }
      s.hit = hit;
    }
  }
  w.swats = w.swats.filter(s => s.t < 0.9);
  for (const b of w.pop) stepBug(w, b, dt);
  for (const f of w.fx) f.t += dt;
  w.fx = w.fx.filter(f => f.t < 1.2);
}

// 夜の終わり: 毒エサを食べたものは、朝までに死ぬ
function endNight(w) {
  for (const b of w.pop) if (b.alive && b.poison >= 0) kill(w, b, 'bait');
  return w.pop.filter(b => b.alive);
}

// 画面に出さずに1晩をまるごと計算する（早送り）
function runNightHeadless(w, dt = 1 / 30) {
  while (w.t < NIGHT) stepWorld(w, dt);
  return endNight(w);
}
