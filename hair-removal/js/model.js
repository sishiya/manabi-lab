// 脱毛のしくみ — 毛穴のモデル（周期・剃る・抜く）。描画には関わらない
'use strict';

// 毛穴ごとの乱数（同じ番号の毛穴は3列で同じ数が出る → 何もしなければ3列は同じ）
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 平均 m・ばらつき cv の対数正規分布
function lognorm(rng, m, cv) {
  const s = Math.sqrt(Math.log(1 + cv * cv)), mu = Math.log(m) - s * s / 2;
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.exp(mu + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
}

// 期: 'A' 成長期, 'C' 退行期, 'T' 休止期, 'R' 抜いたあと次の成長期を待つ, 'X' 毛を作れなくなった（段階B）
function phaseDur(f, site, ph) {
  if (ph === 'A') return lognorm(f.rng, site.A, SIM.cv);
  if (ph === 'C') return site.C;
  if (ph === 'T') return lognorm(f.rng, site.T, SIM.cv);
  if (ph === 'R') return lognorm(f.rng, SIM.pluckDelay, 0.5);
  return Infinity;
}

// 毛: L = 根もとから先までの長さ、tip の高さ = L − 根もとの深さ
function tipH(f, h) { return h.L - rootDepth(f, h); }
function rootDepth(f, h) {
  if (h.club) return h.clubRoot;
  return f.bulb;           // 成長中・退行中の毛は毛球とともに動く
}

function newFollicle(i, site, seed) {
  const rng = mulberry32(seed * 1000 + i * 7919 + 13);
  const f = { i, rng, v: site.v * (0.85 + 0.3 * rng()), ph: 'T', t: 0, dur: 0, bulb: GEO.clubDepth, hairs: [], shed: null, diam: 0.8 + 0.4 * rng() };
  // はじめは周期のどこかにいる（周期の長さに比べた割合で期を選ぶ）
  const tot = site.A + site.C + site.T, r = rng() * tot;
  if (r < site.A) { startAnagen(f, site); advance(f, site, r); }
  else if (r < site.A + site.C) { startAnagen(f, site); f.dur = site.A; advance(f, site, site.A + (r - site.A)); }
  else { f.ph = 'T'; f.dur = phaseDur(f, site, 'T'); f.t = 0; f.hairs.push({ L: site.v * site.A + GEO.clubDepth, club: true, clubRoot: GEO.clubDepth }); advance(f, site, r - site.A - site.C); }
  return f;
}
function advance(f, site, days) { for (let d = 0; d < days; d += SIM.dt) stepF(f, site, SIM.dt); }

function startAnagen(f, site) {
  if (f.doomed) { f.ph = 'X'; f.t = 0; f.dur = Infinity; f.bulb = GEO.clubDepth; return; }   // 幹細胞がいたんで、もう作れない
  f.ph = 'A'; f.t = 0; f.dur = phaseDur(f, site, 'A'); f.bulb = GEO.clubDepth;
  for (const h of f.hairs) if (h.club && h.shedAt == null) h.shedAt = SIM.shedMax * f.rng();   // 古い棍毛はそのうち落ちる
  f.hairs.push({ L: 0, club: false, thin: f.thin || 1 });
}

function stepF(f, site, dt) {
  f.t += dt;
  // 古い棍毛が落ちる
  for (const h of f.hairs) {
    if (h.shedAt != null) h.shedAt -= dt;
    if (h.push) h.clubRoot = Math.max(0.4, h.clubRoot - h.push * dt);   // いたんだ毛は押し出されていく
  }
  f.hairs = f.hairs.filter(h => !(h.shedAt != null && h.shedAt <= 0));
  const cur = f.hairs.find(h => !h.club);
  if (f.ph === 'A') {
    f.bulb = GEO.clubDepth + (GEO.bulbDeep - GEO.clubDepth) * Math.min(1, f.t / GEO.descend);
    if (cur) cur.L += f.v * dt;
    if (f.t >= f.dur) { f.ph = 'C'; f.t = 0; f.dur = phaseDur(f, site, 'C'); f.bulbStart = f.bulb; }
  } else if (f.ph === 'C') {
    f.bulb = f.bulbStart + (GEO.clubDepth - f.bulbStart) * Math.min(1, f.t / f.dur);
    if (f.t >= f.dur) {
      f.ph = 'T'; f.t = 0; f.dur = phaseDur(f, site, 'T');
      if (cur) { cur.club = true; cur.clubRoot = GEO.clubDepth; }
    }
  } else if (f.ph === 'T' || f.ph === 'R') {
    if (f.t >= f.dur) startAnagen(f, site);
  }
}

// --- 手入れ ---
function shave(f) {
  for (const h of f.hairs) { const th = tipH(f, h); if (th > 0) { h.L -= th; h.blunt = true; } }
}
function pluck(f, site) {
  let gotActive = false;
  f.hairs = f.hairs.filter(h => {
    if (tipH(f, h) >= SIM.grip) { if (!h.club || f.ph === 'T') gotActive = true; return false; }
    return true;
  });
  if (gotActive && f.ph !== 'X') {
    // 根もとごと取れた → 毛穴の下の部分が作りなおされるまで待ち、新しい成長期へ（遅れは推定）
    f.hairs = f.hairs.filter(h => h.club);   // 退行中の毛も一緒に取れる
    f.ph = 'R'; f.t = 0; f.dur = phaseDur(f, site, 'R'); f.bulb = GEO.clubDepth;
  }
}

// 0日目の毛穴（部位ごとに1回だけ作る）
const _start = {};
function startState(siteKey) {
  if (_start[siteKey]) return _start[siteKey];
  const site = SITES[siteKey], fs = [];
  for (let i = 0; i < SIM.N; i++) {
    const f = newFollicle(i, site, 20261012);
    advance(f, site, SIM.burnIn);
    fs.push(f);
  }
  // rng の状態ごと保存しておき、使うたびに複製する
  _start[siteKey] = fs.map(f => ({ f, seed: Math.floor(f.rng() * 4294967296) }));
  return _start[siteKey];
}

// 光で毛穴に起きること（Ω は Arrhenius の積分。いたむ確率 = 1 − e^−Ω）
function applyFlash(f, res, day) {
  const rng = f.rng;
  f.heat = { day, Tm: res.T.matrix, Tb: res.T.bulge };   // 図で熱を光らせる
  if ((f.ph === 'A' || f.ph === 'C') && rng() < 1 - Math.exp(-res.om.matrix)) {
    // 毛母がいたむ → 毛を作るのをやめ、いまの毛は 1〜3 週で押し出されて落ちる（推定）。毛穴は退行期へ
    const cur = f.hairs.find(h => !h.club);
    if (cur) { cur.club = true; cur.clubRoot = f.bulb; cur.shedAt = 7 + 14 * rng(); cur.burnt = true; cur.push = (f.bulb - 0.4) / cur.shedAt; }
    if (f.ph === 'A') { f.ph = 'C'; f.t = 0; f.dur = 14; f.bulbStart = f.bulb; }
    f.hitDay = day;
    // 毛乳頭もいたむと、次の毛は細くなる（推定 0.6 倍ずつ）。細くなりすぎたら作れなくなる
    if (rng() < 1 - Math.exp(-res.om.pap)) { f.thin = (f.thin || 1) * 0.6; if (f.thin < 0.3) f.doomed = true; }
  }
  if (rng() < 1 - Math.exp(-res.om.bulge)) { f.doomed = true; f.hitDay = day; }
}

// 1列ぶんの計算。決まったきざみ（SIM.dt）で進めるので、続きから進めても 0日目から計算しても同じになる
// events: [{t, type:'shave'|'pluck'|'light'}]（t の順）
function Runner(siteKey, events, hooks) {
  this.site = SITES[siteKey]; this.events = events; this.hooks = hooks || {};
  this.fs = startState(siteKey).map(({ f, seed }) => {
    const g = Object.assign({}, f, { hairs: f.hairs.map(h => Object.assign({}, h)) });
    g.rng = mulberry32(seed); return g;
  });
  this.k = 0; this.n = 0;            // n = 進んだきざみの数（t = t0 + n·dt）
  this.applyUpTo();
}
Runner.prototype.t = function () { return SIM.t0 + this.n * SIM.dt; };
Runner.prototype.applyUpTo = function () {
  const t = this.t(), site = this.site;
  while (this.k < this.events.length && this.events[this.k].t <= t + 1e-9) {
    const e = this.events[this.k++];
    for (const f of this.fs) {
      if (e.type === 'shave') shave(f);
      else if (e.type === 'pluck') pluck(f, site);
    }
    if (e.type === 'light' && this.hooks.light) this.hooks.light(this.fs, site, e, this);
  }
};
// tEnd 以下のいちばん近いきざみまで進める。rec(t, fs) は1日ごと
Runner.prototype.advanceTo = function (tEnd, rec) {
  const nEnd = Math.floor((tEnd - SIM.t0) / SIM.dt + 1e-9), perDay = Math.round(1 / SIM.dt);
  if (rec && this.n % perDay === 0) rec(this.t(), this.fs);
  while (this.n < nEnd) {
    for (const f of this.fs) stepF(f, this.site, SIM.dt);
    this.n++;
    this.applyUpTo();
    if (rec && this.n % perDay === 0) rec(this.t(), this.fs);
  }
  return this.fs;
};
function simulate(siteKey, events, tEnd, rec, hooks) { return new Runner(siteKey, events, hooks).advanceTo(tEnd, rec); }

// 毛穴1つの見え方のまとめ
function follicleInfo(f) {
  let top = -Infinity, blunt = false;
  for (const h of f.hairs) { const th = tipH(f, h); if (th > top) { top = th; blunt = !!h.blunt; } }
  return { top, blunt, visible: top > SIM.visible };
}
function countLane(fs) {
  const c = { vis: 0, A: 0, C: 0, T: 0, R: 0, X: 0, len: 0 };
  for (const f of fs) {
    const inf = follicleInfo(f);
    if (inf.visible) { c.vis++; c.len += inf.top; }
    c[f.ph]++;
  }
  c.len = c.vis ? c.len / c.vis : 0;
  return c;
}

// 予定の配列 → events
function makeEvents(laneId, days) {
  return days.map(t => ({ t, type: laneId })).sort((a, b) => a.t - b.t);
}
