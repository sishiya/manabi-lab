// 脱毛のしくみ — 毛穴のモデル（周期・剃る・抜く）。描画には関わらない
'use strict';

// 毛穴ごとの乱数（手入れの仕方を変えても、手入れしていない毛穴は同じ動きをする）
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
  // 白髪: 色の幹細胞が毛球へ届かなくなる年齢（別の乱数。ほかの動きは変えない）
  const g2 = mulberry32(seed * 7 + i * 104729 + 5), u = Math.max(1e-9, g2()), w = g2();
  f.gAge = AGING.mean + AGING.sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  f.age = AGING.age - SIM.burnIn / 365;                      // 0日目に AGING.age 歳になるよう、さかのぼった年齢から始める
  // はじめは周期のどこかにいる（周期の長さに比べた割合で期を選ぶ）
  const tot = site.A + site.C + site.T, r = rng() * tot;
  if (r < site.A) { startAnagen(f, site); advance(f, site, r); }
  else if (r < site.A + site.C) { startAnagen(f, site); f.dur = site.A; advance(f, site, site.A + (r - site.A)); }
  else { f.ph = 'T'; f.dur = phaseDur(f, site, 'T'); f.t = 0; f.pig = pigAt(f); f.hairs.push({ L: site.v * site.A + GEO.clubDepth, club: true, clubRoot: GEO.clubDepth, pig: f.pig }); advance(f, site, r - site.A - site.C); }
  return f;
}
function advance(f, site, days) { for (let d = 0; d < days; d += SIM.dt) stepF(f, site, SIM.dt); }

// 色の幹細胞が毛球へ届くか（1 = 色あり、0 = 白、そのあいだは灰色）
function pigAt(f) { return Math.max(0, Math.min(1, (f.gAge - f.age) / AGING.span)); }

function startAnagen(f, site) {
  if (f.doomed) { f.ph = 'X'; f.t = 0; f.dur = Infinity; f.bulb = GEO.clubDepth; return; }   // 幹細胞がいたんで、もう作れない
  f.ph = 'A'; f.t = 0; f.dur = phaseDur(f, site, 'A'); f.bulb = GEO.clubDepth;
  f.pigPrev = f.pig == null ? 1 : f.pig; f.pig = pigAt(f);
  for (const h of f.hairs) if (h.club && h.shedAt == null) h.shedAt = SIM.shedMax * f.rng();   // 古い棍毛はそのうち落ちる
  f.hairs.push({ L: 0, club: false, thin: f.thin || 1, fresh: true, pig: f.pig });
}

// ゆっくり始まりゆっくり止まる（のび方・縮み方の形。速さの細かい測定はない）
function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

function stepF(f, site, dt) {
  f.t += dt; f.age += dt / 365;
  // 古い棍毛が落ちる
  for (const h of f.hairs) {
    if (h.shedAt != null) h.shedAt -= dt;
    if (h.push) h.clubRoot = Math.max(0.4, h.clubRoot - h.push * dt);   // いたんだ毛は押し出されていく
    else if (h.club && h.shedAt != null && h.shedAt < SIM.loosen) h.clubRoot = Math.max(0.2, h.clubRoot - (h.clubRoot - 0.2) / Math.max(dt, h.shedAt) * dt);   // 抜ける前に根もとがゆるみ、表面へ寄っていく（推定）
  }
  const gone = f.hairs.filter(h => h.shedAt != null && h.shedAt <= 0);
  if (gone.length) { f.justShed = gone.some(h => h.burnt) ? 'burnt' : 'club'; f.goneHairs = gone.map(h => hairShape(f, h)); f.hairs = f.hairs.filter(h => !gone.includes(h)); }
  const cur = f.hairs.find(h => !h.club);
  if (f.ph === 'A') {
    f.bulb = GEO.clubDepth + (GEO.bulbDeep - GEO.clubDepth) * smooth(f.t / GEO.descend);
    if (cur && f.t >= GEO.descend) cur.L += f.v * dt;      // 毛球ができあがってから毛を作り、下から押し上げる
    if (f.t >= f.dur) { f.ph = 'C'; f.t = 0; f.dur = phaseDur(f, site, 'C'); f.bulbStart = f.bulb; }
  } else if (f.ph === 'C') {
    f.bulb = f.bulbStart + (GEO.clubDepth - f.bulbStart) * smooth(f.t / f.dur);
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
// 抜けた毛の形（図で、抜けていく動きを描くため）
function hairShape(f, h) { return { root: rootDepth(f, h), L: h.L, pig: h.pig == null ? 1 : h.pig, burnt: !!h.burnt, blunt: !!h.blunt, thin: h.thin || 1, club: !!h.club, diam: f.diam }; }
// 返す: 'none'（つまめる毛がない）、'short'（毛はあるが短くてつまめない）、'club'（古い毛だけ抜けた）、'root'（根もとごと抜けた）
function pluck(f, site) {
  let gotActive = false, got = false;
  const hasHair = f.hairs.some(h => tipH(f, h) > 0);
  f.hairs = f.hairs.filter(h => {
    if (tipH(f, h) >= SIM.grip) { got = true; if (!h.club || f.ph === 'T') gotActive = true; (f.goneHairs || (f.goneHairs = [])).push(hairShape(f, h)); return false; }
    return true;
  });
  if (!got) return hasHair ? 'short' : 'none';
  if (gotActive && f.ph !== 'X') {
    // 根もとごと取れた → 毛穴の下の部分が作りなおされるまで待ち、新しい成長期へ（遅れは推定）
    f.hairs = f.hairs.filter(h => h.club);   // 退行中の毛も一緒に取れる
    for (const g of f.goneHairs || []) if (!g.club) g.sheath = true;   // 成長期の毛は根もとに白いさや（毛根鞘）がついてくる
    f.ph = 'R'; f.t = 0; f.dur = phaseDur(f, site, 'R'); f.bulb = GEO.clubDepth;
    return 'root';
  }
  return 'club';
}

// 0日目の毛穴（部位ごとに1回だけ作る）
const _start = {};
function startState(siteKey) {
  const key = siteKey + '|' + AGING.age + '|' + AGING.mean;
  if (_start[key]) return _start[key];
  const site = SITES[siteKey], fs = [];
  for (let i = 0; i < SIM.N; i++) {
    const f = newFollicle(i, site, 20261012);
    advance(f, site, SIM.burnIn);
    fs.push(f);
  }
  // rng の状態ごと保存しておき、使うたびに複製する
  _start[key] = fs.map(f => ({ f, seed: Math.floor(f.rng() * 4294967296) }));
  return _start[key];
}

// 光で毛穴に起きること（Ω は Arrhenius の積分。いたむ確率 = 1 − e^−Ω）
function applyFlash(f, res, day) {
  const rng = f.rng;
  let matrixHit = false;
  f.heat = { day, Tm: res.T.matrix, Tb: res.T.bulge };   // 図で熱を光らせる
  if ((f.ph === 'A' || f.ph === 'C') && rng() < 1 - Math.exp(-res.om.matrix)) {
    // 毛母がいたむ → 毛を作るのをやめ、いまの毛は 1〜3 週で押し出されて落ちる（推定）。毛穴は退行期へ
    const cur = f.hairs.find(h => !h.club);
    matrixHit = true;
    if (cur) { cur.fresh = false; cur.club = true; cur.clubRoot = f.bulb; cur.shedAt = 7 + 14 * rng(); cur.burnt = true; cur.push = (f.bulb - 0.4) / cur.shedAt; }
    if (f.ph === 'A') { f.ph = 'C'; f.t = 0; f.dur = 14; f.bulbStart = f.bulb; }
    f.hitDay = day;
    // 毛乳頭もいたむと、次の毛は細くなる（推定 0.6 倍ずつ）。細くなりすぎたら作れなくなる
    if (rng() < 1 - Math.exp(-res.om.pap)) { f.thin = (f.thin || 1) * 0.6; if (f.thin < 0.3) f.doomed = true; }
  }
  if (rng() < 1 - Math.exp(-res.om.bulge)) { f.doomed = true; f.hitDay = day; }
  return matrixHit;
}

// 一列ぶんの計算。決まったきざみ（SIM.dt）で進めるので、続きから進めても 0日目から計算しても同じになる
// events: [{t, type:'shave'|'pluck'|'light', idx:[毛穴の番号]}]（t の順）
// できごと（毛穴の中で起きたこと）は this.log に {t, i, text, kind} で残す
function Runner(siteKey, events, hooks) {
  this.site = SITES[siteKey]; this.events = events; this.hooks = hooks || {};
  this.fs = startState(siteKey).map(({ f, seed }) => {
    const g = Object.assign({}, f, { hairs: f.hairs.map(h => Object.assign({}, h)) });
    g.rng = mulberry32(seed); g.justShed = null; g.goneHairs = null;
    for (const h of g.hairs) if (h.fresh && tipH(g, h) > SIM.visible) h.fresh = false;   // もう出ている毛は「新しく出た」に数えない
    return g;
  });
  this.k = 0; this.n = 0;            // n = 進んだきざみの数（t = t0 + n·dt）
  this.log = []; this.prev = this.fs.map(snap);
  this.applyUpTo();
}
Runner.prototype.t = function () { return SIM.t0 + this.n * SIM.dt; };
Runner.prototype.applyUpTo = function () {
  const t = this.t(), site = this.site;
  while (this.k < this.events.length && this.events[this.k].t <= t + 1e-9) {
    const e = this.events[this.k++], idx = e.idx || this.fs.map((_, i) => i);
    if (e.type === 'shave') {
      let n = 0;
      for (const i of idx) { const f = this.fs[i]; if (f.hairs.some(h => tipH(f, h) > 0)) n++; shave(f); }
      this.note(t, null, `カミソリで剃った（${idx.length} 個の毛穴の上。表面から出ていた毛 ${n} 本を切った）`, 'shave');
    } else if (e.type === 'pluck') {
      for (const i of idx) {
        this.fs[i].goneHairs = [];
        const r = pluck(this.fs[i], site);
        this.note(t, i, { root: '毛抜きで根もとごと抜いた（毛穴は残る）', club: '休んでいた古い毛が抜けた', short: '短くてつまめなかった', none: '抜く毛がなかった' }[r], 'pluck', { root: '抜いた', club: '古い毛が抜けた', short: 'つまめない', none: '毛がない' }[r], this.fs[i].goneHairs);
        this.fs[i].goneHairs = null;
      }
    } else if (e.type === 'light' && this.hooks.light) this.hooks.light(this.fs, site, e, this, idx);
    this.prev = this.fs.map(snap);
  }
};
Runner.prototype.note = function (t, i, text, kind, short, hairs) { this.log.push({ t, i, text, kind, short: short || text, hairs: hairs && hairs.length ? hairs : undefined }); };
// 1きざみごとに、毛穴の中の変化をできごとにする
// 成長期が始まったときの色のできごと
function pigNote(f) {
  if (f.ph !== 'A' || f.t > SIM.dt * 1.01) return null;
  if (f.pig <= 0 && f.pigPrev > 0) return ['色の幹細胞が毛球へ届かず（バルジに取り残され）、白い毛を作りはじめた', '白い毛に'];
  if (f.pig > 0 && f.pig < 1 && f.pigPrev >= 1) return ['毛球に届く色の細胞が減り、色のうすい毛を作りはじめた', '色がうすく'];
  return null;
}
const PH_SHORT = { A: '下へのびる', C: 'ちぢみはじめ', T: '休みへ', X: '止まった' };
const PH_TEXT = { A: '毛穴の下の部分が、また下へのびはじめた（成長期のはじめ。毛はまだない）', C: '毛を作るのをやめ、毛穴の下がちぢみはじめた（退行期）', T: '休みに入った（休止期）', X: 'もう毛を作れなくなった' };
function snap(f) { return { ph: f.ph }; }
Runner.prototype.watch = function () {
  const t = this.t();
  this.fs.forEach((f, i) => {
    const p = this.prev[i], q = snap(f);
    if (q.ph !== p.ph && PH_TEXT[q.ph] && !(q.ph === 'C' && f.hitDay != null && t - f.hitDay < 0.3)) this.note(t, i, PH_TEXT[q.ph], 'phase', PH_SHORT[q.ph]);
    if (f.ph === 'A' && f.t >= GEO.descend && f.t - SIM.dt < GEO.descend) this.note(t, i, '毛球ができあがり、新しい毛を作って下から押し上げはじめた', 'phase', '毛を作る');
    if (q.ph !== p.ph && q.ph === 'A') { const pn = pigNote(f); if (pn) this.note(t, i, pn[0], 'gray', pn[1]); }
    for (const h of f.hairs) if (h.fresh && tipH(f, h) > SIM.visible) { h.fresh = false; this.note(t, i, '新しい毛の先が表面に出た', 'emerge', '表面に出た'); }
    if (f.justShed) { this.note(t, i, f.justShed === 'burnt' ? '光でいたんだ毛が抜け落ちた' : '古い毛（棍毛）が抜け落ちた', 'shed', '抜け落ちた', f.goneHairs); f.justShed = null; f.goneHairs = null; }
    this.prev[i] = q;
  });
};
// tEnd 以下のいちばん近いきざみまで進める。rec(t, fs) は1日ごと
Runner.prototype.advanceTo = function (tEnd, rec) {
  const nEnd = Math.floor((tEnd - SIM.t0) / SIM.dt + 1e-9), perDay = Math.round(1 / SIM.dt);
  if (rec && this.n % perDay === 0) rec(this.t(), this.fs);
  while (this.n < nEnd) {
    for (const f of this.fs) stepF(f, this.site, SIM.dt);
    this.n++;
    this.watch();
    this.applyUpTo();
    if (rec && this.n % perDay === 0) rec(this.t(), this.fs);
  }
  return this.fs;
};
function simulate(siteKey, events, tEnd, rec, hooks) { return new Runner(siteKey, events, hooks).advanceTo(tEnd, rec); }

// 毛穴1つの見え方のまとめ
function follicleInfo(f) {
  let top = -Infinity, blunt = false, pig = 1;
  for (const h of f.hairs) { const th = tipH(f, h); if (th > top) { top = th; blunt = !!h.blunt; pig = h.pig == null ? 1 : h.pig; } }
  return { top, blunt, pig, visible: top > SIM.visible };
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
