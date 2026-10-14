// ほこりが積もるまで — 人（いつもの1日）・やってみること（掃除・窓・機械）・流れを動かすもの
'use strict';

const PS = { x: 1.7, state: 'walk', dir: 1, task: null, lastAct: null, turnT: 0 };
const TASKS = {
  vacuum: { label: '掃除機', dur: 180 },
  wipe:   { label: '床を拭く', dur: 180 },
  duster: { label: 'はたき', dur: 60 },
  bed:    { label: 'ふとんをはたく', dur: 60 },
  roam:   { label: '歩きまわる', dur: 300 },
};

function hourOf(t) { return (t / 3600) % 24; }
function routineAct(t) { const h = hourOf(t); for (const r of ROUTINE) if (h >= r.from && h < r.to) return r.act; return 'sit'; }

// 人のいまのようす（task があれば task が先）
function personState(st) {
  if (PS.task) return PS.task.type === 'roam' ? 'walk' : 'task';
  if (st.routine) {
    const a = routineAct(st.t);
    return a === 'makebed' ? 'task' : a === 'return' ? 'walk' : a;
  }
  return st.manual;
}

function startTask(type, st, quiet) {
  if (PS.state === 'out' && type !== 'roam') { /* 出かけていても、帰ってきてやったことにする */ }
  PS.task = { type, t: 0, dur: TASKS[type].dur, head: type === 'vacuum' || type === 'wipe' ? 0.03 : 0 };
  if (!quiet) logEvent(st, TASKS[type].label);
}
function logEvent(st, label) { st.events.push({ t: st.t, label }); if (st.events.length > 400) st.events.shift(); }

// ふとんにたまった分を少し空気へ（寝返り・はたく）
function releaseBed(frac, site, spreadBed = 0.35) {
  for (let s = 0; s < NS; s++) for (let b = 0; b < NB; b++) {
    const k = di(s, b), m = D.bed[k] * frac; if (m <= 0) continue;
    D.bed[k] -= m; addAir(site, 0.6, 0.62, s, b, m, spreadBed);
  }
}

// 1コマぶん（dt 秒）の人と掃除
function lifeStep(dt, st) {
  // いつもの1日の区切り
  if (st.routine) {
    const a = routineAct(st.t);
    if (a !== PS.lastAct) {
      if (a === 'makebed' && !PS.task) { startTask('bed', st, true); logEvent(st, '起きてふとんを整える'); }
      if (a === 'return') { homeReturn(st); }
      if (a === 'out') logEvent(st, '出かける');
      if (a === 'sleep' && PS.lastAct !== null && PS.lastAct !== 'sleep') logEvent(st, '寝る');
      PS.lastAct = a;
    }
  }
  const state = personState(st);
  PS.state = state;
  const home = state !== 'out';
  // 皮ふ・繊維
  if (home) {
    const shed = EMIT.skinShed * dt;
    const k = state === 'task' ? 'walk' : state;
    if (state === 'sleep') {
      for (let b = 0; b < NB; b++) D.bed[di(SI.skin, b)] += shed * EMIT.skinBed * SPLIT.skin[b];
      D.tot.emit[SI.skin] += shed * EMIT.skinBed;
      for (let b = 0; b < NB; b++) D.bed[di(SI.fiber, b)] += EMIT.bedFiberNight * dt * SPLIT.fiber[b];
      D.tot.emit[SI.fiber] += EMIT.bedFiberNight * dt;
      emit('sleeper', 0.6, 0.62, SI.skin, SPLIT.skin, shed * EMIT.skinAir.sleep, 0.35);
      emit('sleeper', 0.6, 0.62, SI.fiber, SPLIT.fiber, EMIT.fiber.sleep * dt, 0.35);
      // 寝返り（1.5時間に1回くらい）
      PS.turnT += dt;
      if (PS.turnT > 5400) { PS.turnT = 0; releaseBed(0.003, 'turn'); }
    } else {
      const bx = PS.x, by = state === 'sit' ? 0.8 : 1.0;
      emit('body', bx, by, SI.skin, SPLIT.skin, shed * EMIT.skinAir[k], 0.25);
      emit('body', bx, by, SI.fiber, SPLIT.fiber, EMIT.fiber[k] * dt, 0.25);
      emit('feet', bx, 0.04, SI.soil, SPLIT.soilFeet, EMIT.feetSoil * dt, 0.15);
    }
  }
  // 動き
  if (state === 'walk') {
    PS.x += PS.dir * 0.8 * dt;
    // 速いときは往復を何回もまたぐ
    const L = WALK_X[1] - WALK_X[0];
    let r = (PS.x - WALK_X[0]) / L;
    if (r > 1 || r < 0) {
      const per = r - 2 * Math.floor(r / 2);
      if (per > 1) { PS.x = WALK_X[0] + (2 - per) * L; PS.dir = -1; } else { PS.x = WALK_X[0] + per * L; PS.dir = 1; }
    }
    feetResuspend(dt, PS.x, 0.6);
  } else if (state === 'sit') PS.x = DESK_X;
  else if (state === 'sleep') PS.x = 0.6;
  // 掃除など
  if (PS.task) taskStep(dt, st);
}

// 歩いて床から舞い上がる。spread の範囲の床の面に、1秒あたり「2歩 × 足の長さ/範囲」の割合で
function feetResuspend(dt, x, spread) {
  const steps = 2 * dt * (0.25 / spread);
  const frac = RESUSP_STEP.map(r => 1 - Math.pow(1 - r, steps));
  for (let f = 0; f < FACES.length; f++) {
    const F = FACES[f]; if (F.o !== 'up' || F.j !== 0) continue;
    if (Math.abs(F.x - x) < spread / 2) disturb(f, frac, 'step');
  }
}

function homeReturn(st) {
  logEvent(st, '帰ってくる');
  if (st.spring) emit('door', 3.3, 1.0, SI.pollen, SPLIT.pollen, EMIT.returnPollen, 0.3);
  emit('door', 3.3, 0.9, SI.soil, SPLIT.soilFeet, EMIT.returnSoil, 0.3);
  if (st.shoes) emit('shoes', 2.6, 0.03, SI.soil, SPLIT.soilFeet, EMIT.shoesSoil, 0.9);
}

function taskStep(dt, st) {
  const T = PS.task;
  const used = Math.min(dt, T.dur - T.t);
  T.t += dt;
  if (T.type === 'vacuum' || T.type === 'wipe') {
    const C = T.type === 'vacuum' ? VACUUM : WIPE;
    const v2 = (ROOM_W - 0.06) / T.dur;              // 断面の上を進む速さ（部屋全体を1回かける時間で）
    T.head = Math.min(ROOM_W - 0.03, 0.03 + v2 * T.t);
    PS.x = Math.max(WALK_X[0] - 0.05, Math.min(3.3, T.head + 0.7));
    const tPass = 0.3 / v2;
    for (let f = 0; f < FACES.length; f++) {
      const F = FACES[f]; if (F.o !== 'up' || F.j !== 0 || Math.abs(F.x - T.head) > 0.15) continue;
      const mult = (F.underBed ? C.pickUnderBed : 1) * (F.corner ? C.pickCorner : 1);
      const fr = C.pick.map(p => 1 - Math.pow(1 - p * mult, used / tPass));
      const got = removeFrom(f, fr, T.type === 'vacuum' ? 'vac' : 'wipe');
      if (T.type === 'vacuum') {   // 排気から細かい粒がもれる
        const leak = st.hepa ? VACUUM.leakHepa : VACUUM.leak;
        for (const [s, b, m] of got) if (leak[b] > 0) { D.tot.vac[s] -= m * leak[b]; addAir('vacExh', T.head + 0.45, 0.25, s, b, m * leak[b], 0.1); }
      }
      // ブラシ・モップでかきまぜて少し舞う（推定）
      disturb(f, (T.type === 'vacuum' ? 0.02 : 0.002) * used / tPass, 'brush');
    }
  } else if (T.type === 'duster') {
    PS.x = 2.3;
    const fr = 1 - Math.pow(1 - DUSTER_FRAC, used / T.dur);
    for (let f = 0; f < FACES.length; f++) { const pl = FACES[f].place; if (pl === '棚の上' || pl === '机の上' || pl === 'エアコンの上' || pl === '空気清浄機の上' || pl === '家具の上') disturb(f, fr, 'duster'); }
  } else if (T.type === 'bed') {
    PS.x = 1.3;
    const fr = used / T.dur;
    releaseBed(1 - Math.pow(1 - EMIT.bedShake, fr), 'shake', 0.7);   // はたくとベッドの外まで飛ぶ
    emit('shake', 0.6, 0.8, SI.fiber, SPLIT.fiber, EMIT.bedShakeFiber * fr, 0.7);
    for (let f = 0; f < FACES.length; f++) if (FACES[f].place === 'ベッドの上') disturb(f, 1 - Math.pow(0.5, fr), 'shakeTop');
  } else if (T.type === 'roam') {
    // 歩くのは lifeStep で
  }
  if (T.t >= T.dur) PS.task = null;
}

function washSheets(st) {
  for (let s = 0; s < NS; s++) for (let b = 0; b < NB; b++) { D.tot.wash[s] += D.bed[di(s, b)]; D.bed[di(s, b)] = 0; }
  // シーツの上に積もった分もいっしょに
  for (const F of FACES) if (F.place === 'ベッドの上') for (let s = 0; s < NS; s++) for (let b = 0; b < NB; b++) { const k = di(s, b); D.tot.wash[s] += F.dep[k]; F.dep[k] = 0; }
  logEvent(st, 'シーツを洗う');
}

// 流れを動かすもの（毎コマ作りなおす）
function buildJets(st) {
  const J = [];
  const c = x => Math.floor(x / DX);
  const state = PS.state;
  if (state !== 'out') {
    if (state === 'sleep') J.push({ i0: c(0.4), i1: c(0.9), j0: c(0.55), j1: c(1.4), v: 0.06, rate: 0.5 });   // 体温の上昇流（推定）
    else {
      const top = state === 'sit' ? 1.3 : 1.7;
      J.push({ i0: c(PS.x - 0.12), i1: c(PS.x + 0.12) + 1, j0: c(top), j1: c(top + 0.6), v: 0.12, rate: 0.5 });
    }
    if (state === 'walk') J.push({ i0: c(PS.x - 0.12), i1: c(PS.x + 0.12) + 1, j0: 0, j1: c(1.6), u: PS.dir * 0.8, rate: 2 });
  }
  if (st.window) {   // 窓: 下から外の空気が入り、上から出る（冬の温度差・弱い風。推定 0.3m/s）
    const mid = (WINDOW.j0 + WINDOW.j1) >> 1;
    J.push({ i0: 0, i1: 2, j0: WINDOW.j0, j1: mid, u: 0.3, rate: 1 });
    J.push({ i0: 0, i1: 2, j0: mid, j1: WINDOW.j1, u: -0.3, rate: 1 });
  }
  if (st.ac) { const f = FURN.find(f => f.key === 'ac'); J.push({ i0: c(f.x0) - 6, i1: c(f.x1), j0: c(f.y0) - 4, j1: c(f.y0), u: -0.9, v: -0.5, rate: 2 }); }
  if (st.purifier) { const f = FURN.find(f => f.key === 'pur'); J.push({ i0: c(f.x0), i1: c(f.x1), j0: c(f.y1), j1: c(f.y1) + 8, v: 0.5, rate: 1 }); }
  if (PS.task && PS.task.type === 'vacuum') { const hx = PS.task.head + 0.45; J.push({ i0: c(hx), i1: c(hx) + 3, j0: 1, j1: 5, u: VACUUM.exhaustSpeed, v: 0.2, rate: 3 }); }
  return J;
}
