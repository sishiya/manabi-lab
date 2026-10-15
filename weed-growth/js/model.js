// 雑草がふえるまで — 計算（土の中のタネ・芽・株・光の取りあい・道具・記録）
// 1コマ = dt 日。タネはます目ごとの数、株は1本ずつ。乱数は R（巻きもどしで同じにもどせる）。
'use strict';
let SP = SPECIES.foxtail;

// ---------- 乱数 ----------
const R = { s: 12345 };
function rnd() {
  let t = (R.s = (R.s + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function gauss() { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); }
function poisson(l) {
  if (l <= 0) return 0;
  if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss()));
  const L = Math.exp(-l); let k = 0, p = 1;
  do { k++; p *= rnd(); } while (p > L);
  return k - 1;
}
function binom(n, p) {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n <= 25) { let c = 0; for (let i = 0; i < n; i++) if (rnd() < p) c++; return c; }
  const m = n * p;
  if (m < 12) return Math.min(n, poisson(m));
  if (n - m < 12) return n - Math.min(n, poisson(n - m));
  return Math.min(n, Math.max(0, Math.round(m + gauss() * Math.sqrt(m * (1 - p)))));
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------- 暦と気温 ----------
const MID = []; { let c = 0; for (const d of MONTH_DAYS) { MID.push(c + d / 2); c += d; } }
const TNOISE = (() => {   // 日ごとのゆらぎ（決まった乱数。道具を使っても天気は変わらない）
  let s = 777, a = new Float32Array(MAX_DAYS + 400), v = 0;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < a.length; i++) {
    const n = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    v = 0.7 * v + Math.sqrt(1 - 0.49) * n; a[i] = v * T_NOISE;
  }
  return a;
})();
function doyOf(day) { return (START_DOY + Math.floor(day)) % 365; }
function yearOf(day) { return Math.floor(day / 365) + 1; }   // n年目 = 3月1日から次の2月末まで
function normalT(doy) {
  let i = 0; while (i < 12 && MID[i] <= doy) i++;
  const a = (i + 11) % 12, b = i % 12;
  let da = MID[a], db = MID[b]; if (db <= da) db += 365;
  let x = doy; if (x < da) x += 365;
  return TOKYO_T[a] + (TOKYO_T[b] - TOKYO_T[a]) * (x - da) / (db - da);
}
function tempAt(day) { return normalT(doyOf(day)) + TNOISE[Math.min(TNOISE.length - 1, Math.floor(day))]; }
function dayLength(doy) {
  const dec = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy + 1) / 365);
  const c = -Math.tan(LAT * Math.PI / 180) * Math.tan(dec);
  return 2 * Math.acos(clamp(c, -1, 1)) * 180 / Math.PI / 15;
}
function dateOf(day) {
  let d = doyOf(day), m = 0;
  while (d >= MONTH_DAYS[m]) { d -= MONTH_DAYS[m]; m++; }
  return { y: yearOf(day), m: m + 1, d: d + 1 };
}

// ---------- 状態 ----------
const S = {
  day: 0, scen: 'garden', SD: new Int32Array(NX * NZ), SN: new Int32Array(NX * NZ),
  plants: [], nid: 1, sheet: new Uint8Array(NX),
  opts: { xray: true, noDorm: false, autoPull: false },
  tot: null, year: 1, yr: null, ev: [], acc: { d: 0, cold: 0, warm: 0 },
};
function zeroTot() { return { shed: 0, lost: 0, decayed: 0, eaten: 0, germ: 0, fatal: 0, emerged: 0, thinned: 0, frost: 0, pulled: 0, removedSeeds: 0, headed: 0 }; }
function zeroYear() { return { shed: 0, emerged: 0, firstEm: false, firstHead: false, firstShed: false, frost: false }; }
const H = { snaps: [], plants: new Float32Array(MAX_DAYS + 2).fill(NaN), heads: new Float32Array(MAX_DAYS + 2).fill(NaN), bank: new Float32Array(MAX_DAYS + 2).fill(NaN) };
const DF = new Float32Array(NZ);  // 深さごとの芽の出やすさ
let ZG = 0;                        // 芽を出せる段の数（DF > 0）
for (let z = 0; z < NZ; z++) {
  const top = z * DZC, c = (z + 0.5) * DZC;
  DF[z] = top < SP.depthBest[0] + 0.003 ? SP.surfaceFactor
    : c <= SP.depthBest[1] ? 1 : c >= SP.depthMax ? 0 : (SP.depthMax - c) / (SP.depthMax - SP.depthBest[1]);
  if (DF[z] > 0) ZG = z + 1;
}

function logEvent(text, kind) {
  S.ev.push({ day: S.day, text, kind: kind || '' });
  if (S.ev.length > 300) S.ev.shift();
}

function restartSim(scen) {
  S.scen = scen || S.scen; R.s = 12345;
  S.day = 0; S.year = 1; S.SD.fill(0); S.SN.fill(0); S.plants = []; S.nid = 1; S.sheet.fill(0);
  S.tot = zeroTot(); S.yr = zeroYear(); S.ev = []; S.acc = { d: 0, cold: 0, warm: 0 };
  H.snaps = []; H.plants.fill(NaN); H.heads.fill(NaN); H.bank.fill(NaN);
  const sc = SCENARIOS[S.scen];
  if (sc.one) {
    S.SN[2 * NX + Math.floor(NX / 2)] = 1;   // 1cm の深さ（0.5cm のます目の3段目）
  } else {
    const n = Math.round(sc.perM2 * BED_W * BED_D), zmax = Math.round(sc.depth / DZC);
    for (let k = 0; k < n; k++) {
      const i = Math.floor(rnd() * zmax) * NX + Math.floor(rnd() * NX);
      if (S.opts.noDorm || rnd() < sc.awake) S.SN[i]++; else S.SD[i]++;
    }
  }
  logEvent(sc.name + 'から始める。' + sc.note, 'start');
  computeLight(); record(); takeSnap();
}

// ---------- 光の取りあい（5cm 四方 × 高さ10cm の段ごとの葉の広さ） ----------
const LAD = new Float32Array(LX * LY * HB), CUM = new Float32Array(LX * LY * HB);
const CELL_A = LC * (BED_D / LY);
function binOf(h) { let b = 0; while (b < HB - 1 && HEDGE[b + 1] <= h) b++; return b; }
function binFrac(H, b) { return H <= 0 ? 0 : Math.max(0, Math.min(H, HEDGE[b + 1]) - HEDGE[b]) / H; }   // 葉は根もとから高さ H まで同じように
function crownCells(p) {
  const r = 0.01 + 0.22 * Math.sqrt(p.W / SP.wmax), out = [];
  const ly = BED_D / LY;
  const x0 = Math.max(0, Math.floor((p.x - r) / LC)), x1 = Math.min(LX - 1, Math.floor((p.x + r) / LC));
  const y0 = Math.max(0, Math.floor((p.y - r) / ly)), y1 = Math.min(LY - 1, Math.floor((p.y + r) / ly));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const cx = (i + 0.5) * LC, cy = (j + 0.5) * ly;
    if ((cx - p.x) ** 2 + (cy - p.y) ** 2 <= r * r) out.push(j * LX + i);
  }
  if (!out.length) out.push(clamp(Math.floor(p.y / ly), 0, LY - 1) * LX + clamp(Math.floor(p.x / LC), 0, LX - 1));
  return out;
}
function computeLight() {
  LAD.fill(0);
  for (const p of S.plants) {
    if (p.st !== 1 && p.st !== 2) continue;
    const ck = Math.round(Math.sqrt(p.W / SP.wmax) * 60);   // 広がりが変わったときだけ数えなおす
    if (!p._cells || p._ck !== ck) { p._cells = crownCells(p); p._ck = ck; }
    const per = p.LA / (p._cells.length * CELL_A);
    p._per = per; p._hb = binOf(p.H);
    for (const c of p._cells) for (let b = 0; b <= p._hb; b++) LAD[c * HB + b] += per * binFrac(p.H, b);
  }
  for (let c = 0; c < LX * LY; c++) {
    let s = 0;
    for (let b = HB - 1; b >= 0; b--) { s += LAD[c * HB + b]; CUM[c * HB + b] = s; }
  }
  for (const p of S.plants) {
    if (p.st !== 1 && p.st !== 2) continue;
    const bh = binOf(0.6 * p.H);
    let own = 0; for (let b = bh; b <= p._hb; b++) own += p._per * binFrac(p.H, b);
    own /= p.n;   // まとめた芽は、自分1本ぶんの葉だけ除く（ほかの芽とは光を取りあう）
    let L = 0;
    for (const c of p._cells) L += Math.exp(-SP.kext * Math.max(0, CUM[c * HB + bh] - own));
    p.light = L / p._cells.length;
  }
}

// ---------- 1コマ ----------
function newPlant(xi, z) {
  const depth = (z + rnd()) * DZC;
  const p = { id: S.nid++, x: (xi + rnd()) * DXC, y: rnd() * BED_D, z0: depth, st: 0, cdU: 0,
    need: SP.emBase + SP.emPerCm * depth * 100, cd: 0, cdH: 0, W: SP.seedMass * 0.5, H: 0, LA: 0, til: 0,
    n: 1, light: 1, batches: [], ripe: 0, made: 0, shedN: 0, sAcc: 0, born: S.day, em: -1, dd: 0, capH: 9, rs: (rnd() * 1e9) | 0, lean: gauss() * 0.15 };
  S.plants.push(p); S.tot.germ++;
}

// タネ: 芽を出すのは毎コマ。死ぬ・目ざめる・眠る・うまるはゆっくりなので5日ぶんまとめて（slow = まとめた日数）
const SLOW_EVERY = 5;
function seedsStep(T, dt) {
  const sp = SP, nd = S.opts.noDorm, A = S.acc;
  A.d += dt; if (T < 10) A.cold += dt; if (T > 20) A.warm += dt;
  const slow = A.d >= SLOW_EVERY || nd;
  let pDec = 0, pPred = 0, pBur = 0, pRel = 0, pRe = 0;
  if (slow) {
    pDec = 1 - Math.exp(-sp.decay / 365 * A.d); pPred = 1 - Math.exp(-sp.predation * A.d);
    pBur = 1 - Math.exp(-sp.burial * A.d);
    pRel = nd ? 1 : 1 - Math.exp(-(sp.coldRelease * A.cold + sp.baseRelease * A.d));
    pRe = nd ? 0 : 1 - Math.exp(-sp.reDormant * A.warm);
    A.d = 0; A.cold = 0; A.warm = 0;
  }
  const g = T > sp.tb ? sp.germRate * Math.min(1, (T - sp.tb) / sp.germT) : 0;
  for (let z = slow ? NZ - 1 : ZG - 1; z >= 0; z--) {
    const pD = z === 0 ? 1 - (1 - pDec) * (1 - pPred) : pDec, pG = g * DF[z] > 0 ? 1 - Math.exp(-g * DF[z] * dt) : 0;
    if (!slow && !pG) continue;
    for (let x = 0; x < NX; x++) {
      const i = z * NX + x;
      let d = S.SD[i], a = S.SN[i];
      if (!slow) {
        if (a) { const gm = binom(a, pG); if (gm) { S.SN[i] = a - gm; for (let j = 0; j < gm; j++) newPlant(x, z); } }
        continue;
      }
      if (!d && !a) continue;
      if (d) {
        const k = binom(d, pD); d -= k; if (z === 0) S.tot.eaten += k; else S.tot.decayed += k;
        const r = binom(d, pRel); d -= r; a += r;
      }
      if (a) {
        const k = binom(a, pD); a -= k; if (z === 0) S.tot.eaten += k; else S.tot.decayed += k;
        if (pG) { const gm = binom(a, pG); a -= gm; for (let j = 0; j < gm; j++) newPlant(x, z); }
        if (pRe && z >= 4) { const r = binom(a, pRe); a -= r; d += r; }
      }
      if (z === 0) {
        const bd = binom(d, pBur), ba = binom(a, pBur);
        d -= bd; a -= ba; S.SD[NX + x] += bd; S.SN[NX + x] += ba;
      }
      S.SD[i] = d; S.SN[i] = a;
    }
  }
}

function disperse(p, k) {
  const sig = SP.disperse + 0.25 * p.H, nd = S.opts.noDorm;
  const px = p.x + p.lean * p.H;
  for (let j = 0; j < k; j++) {
    const x = px + gauss() * sig, y = p.y + gauss() * sig;
    S.tot.shed++;
    // 計算するのは幅 30cm の花だんの半分（y = 0 が通路の縁、BED_D が花だんのまん中）。
    // 残りの半分は鏡うつしで同じようすとし、まん中をこえて落ちた分は、向こう半分から来る分と入れかわる
    if (x < 0 || x >= BED_W || y < 0 || y >= 2 * BED_D) { S.tot.lost++; continue; }   // 花だんの外（通路）
    S.yr.shed++;
    const i = Math.floor(x / DXC);
    if (nd) S.SN[i]++; else S.SD[i]++;
  }
  if (k > 0 && typeof fxShed === 'function') fxShed(px, Math.max(0.01, p.H), k);   // 見た目だけ
  if (k > 0 && p.st !== 3 && !S.yr.firstShed) { S.yr.firstShed = true; logEvent('熟したタネが落ちはじめた（' + S.year + '年目）', 'shed'); }
}

function headCdNow(doy) {
  const L = dayLength(doy);
  return L >= SP.dayLong ? SP.headLong : L <= SP.dayShort ? SP.headShort
    : SP.headShort + (SP.headLong - SP.headShort) * (L - SP.dayShort) / (SP.dayLong - SP.dayShort);
}
function sheetAt(x) { return S.sheet[clamp(Math.floor(x / DXC), 0, NX - 1)]; }
function killPlant(p, why) {
  p.st = 3; p.dd = 0; p.batches = []; // 熟していないタネはここで終わり
  if (why === 'frost') S.tot.frost++;
}

function plantsStep(T, dt) {
  const sp = SP, tt = Math.max(0, T - sp.gb) * dt, doy = doyOf(S.day);
  const fT = clamp((T - sp.gb) / (sp.topt - sp.gb), 0, 1), hcd = headCdNow(doy);
  const keep = [];
  for (const p of S.plants) {
    if (p.st === 0) {                       // 土の中で芽をのばす
      p.cdU += Math.max(0, T - sp.tb) * dt;
      if (T < sp.frostT) { S.tot.fatal += p.n; continue; }
      const lim = sp.emBase + sp.emPerCm * sp.depthMax * 100;
      if (p.cdU >= p.need && p.z0 <= sp.depthMax) {
        p.st = 1; p.em = S.day; p.H = 0.008; S.tot.emerged += p.n; S.yr.emerged += p.n;
        if (!S.yr.firstEm) { S.yr.firstEm = true; logEvent('今年はじめての芽が地上に出た（' + S.year + '年目）', 'em'); }
      } else if (p.cdU >= lim) { S.tot.fatal += p.n; continue; }   // 深すぎて地上に届かなかった
      keep.push(p); continue;
    }
    if (p.st === 1 || p.st === 2) {
      const sh = sheetAt(p.x), light = sh ? 0 : p.light;
      const dW = sp.rgr * fT * light * p.W * Math.max(0, 1 - p.W / sp.wmax) * dt;
      p.W += dW;
      if (p.capH < 9) p.capH += 0.01 * fT * dt;     // 刈ったあと、のびなおす（推定 1cm/日）
      p.H = Math.min(p.capH, Math.max(0.008, sp.hmax * Math.pow(p.W / sp.wmax, 0.4)));
      p.LA = sp.lar * p.W * p.n; p.til = Math.min(14, Math.floor(Math.log2(1 + p.W / 0.12)));
      p.cd += tt;
      if (p.st === 1 && p.cd >= hcd && p.W > 0.004) {
        p.st = 2; S.tot.headed += p.n;
        if (!S.yr.firstHead) { S.yr.firstHead = true; logEvent('穂が出た（花が咲く）（' + S.year + '年目）', 'head'); }
      }
      if (p.st === 2) {
        if (S.opts.autoPull) { S.tot.pulled += p.n; S.tot.removedSeeds += p.ripe; continue; }
        p.cdH += tt;
        p.sAcc += (sp.reproFrac * dW / sp.seedMass + (p.made === 0 ? 3 : 0)) * p.n;   // まとめた株は n 本ぶん   // 小さい株でも穂に数粒はつく（推定）
        const n = Math.floor(p.sAcc);
        if (n > 0) {
          p.sAcc -= n; p.made += n;
          const b = p.batches[p.batches.length - 1];
          if (b && p.cdH - b.cd < 20) b.n += n; else p.batches.push({ n, cd: p.cdH });
        }
        while (p.batches.length && p.cdH - p.batches[0].cd >= sp.matureCd) p.ripe += p.batches.shift().n;
        const k = binom(p.ripe, 1 - Math.exp(-sp.shed * dt)); p.ripe -= k; p.shedN += k; disperse(p, k);
        if (p.cdH > sp.senesceCd) killPlant(p, 'old');
      }
      if (p.st !== 3 && T < sp.frostT) {
        killPlant(p, 'frost');
        if (!S.yr.frost) { S.yr.frost = true; logEvent('霜で地上の株が枯れた（' + S.year + '年目）', 'frost'); }
      }
      if (p.st !== 3) {
        const thin = light < 0.15 ? sp.thin * (1 - light / 0.15) * (p.W < 0.5 ? 1 : 0.3) + (sh ? 0.3 : 0) : 0;
        if (thin) {
          const k = p.n > 1 ? binom(p.n, 1 - Math.exp(-thin * dt)) : (rnd() < 1 - Math.exp(-thin * dt) ? 1 : 0);
          if (k) {
            S.tot.thinned += k;
            if (k < p.n) { p.n -= k; p.LA = sp.lar * p.W * p.n; }   // まとめた芽の一部が枯れる
            else if (p.W < 0.02) continue; else killPlant(p, 'thin');
          }
        }
      }
      keep.push(p); continue;
    }
    // 枯れた株: 残った熟したタネを落としながら倒れていく
    p.dd += dt;
    const k = binom(p.ripe, 1 - Math.exp(-0.12 * dt)); p.ripe -= k; p.shedN += k; disperse(p, k);
    if (p.dd > 50) { disperse(p, p.ripe); p.ripe = 0; continue; }
    keep.push(p);
  }
  S.plants = keep;
  if (S.plants.length > GROUP_AT) groupSeedlings();
}

// 数が多いときの間引き（計算と描くのを軽くする）: 同じ 1cm の列・同じころの小さな芽を1つのまとまりに（本数 n は数えたまま）。
// まとめた芽は同じ重さ・同じ育ち方として計算し、絵は代表の1本だけ描く。大きな株（0.05g より重い）はまとめない
const GROUP_AT = 900;
function groupSeedlings() {
  const map = new Map(), keep = [];
  for (const p of S.plants) {
    let key = null;
    if (p.st === 0) key = '0|' + Math.floor(p.x / DXC) + '|' + Math.floor(p.z0 / 0.005) + '|' + Math.floor(p.cdU / 15);
    else if (p.st === 1 && p.W < 0.05) key = '1|' + Math.floor(p.x / DXC) + '|' + Math.round(Math.log2(p.W) * 2) + '|' + Math.floor(p.cd / 25) + '|' + (p.capH < 9 ? 1 : 0);
    const q = key && map.get(key);
    if (!q) { if (key) map.set(key, p); keep.push(p); continue; }
    const n = q.n + p.n;
    q.W = (q.W * q.n + p.W * p.n) / n; q.cd = (q.cd * q.n + p.cd * p.n) / n; q.cdU = (q.cdU * q.n + p.cdU * p.n) / n;
    q.n = n; q.LA = SP.lar * q.W * n;
  }
  S.plants = keep;
}

function stepModel(dt) {
  if (S.day >= MAX_DAYS) return;
  const T = tempAt(S.day);
  computeLight();
  seedsStep(T, dt);
  plantsStep(T, dt);
  const before = Math.floor(S.day);
  S.day += dt;
  const y = yearOf(S.day);
  if (y !== S.year) { S.year = y; S.yr = zeroYear(); }
  for (let d = before + 1; d <= Math.floor(S.day); d++) {
    record(d);
    if (d % SNAP_EVERY === 0) takeSnap();
  }
}

// ---------- 数える ----------
function bankTotal() { let a = 0, d = 0; for (let i = 0; i < NX * NZ; i++) { a += S.SN[i]; d += S.SD[i]; } return { a, d, n: a + d }; }
function counts() {
  let up = 0, heads = 0, under = 0, dead = 0, onPlant = 0;
  for (const p of S.plants) {
    if (p.st === 0) under += p.n; else if (p.st === 3) dead += p.n; else { up += p.n; if (p.st === 2) heads += p.n; }
    onPlant += p.ripe; for (const b of p.batches) onPlant += b.n;
  }
  const b = bankTotal();
  return { up, heads, under, dead, onPlant, bank: b.n, awake: b.a, dorm: b.d, perM2: b.n / (BED_W * BED_D) };
}
function record(d) {
  d = d == null ? Math.floor(S.day) : d;
  const c = counts();
  H.plants[d] = c.up; H.heads[d] = c.heads; H.bank[d] = c.perM2;
}

// ---------- 巻きもどし ----------
function clonePlant(p) { const q = Object.assign({}, p); q.batches = p.batches.map(b => ({ n: b.n, cd: b.cd })); delete q._cells; delete q._ck; delete q._g; delete q._gk; return q; }
function takeSnap() {
  H.snaps.push({ day: S.day, SD: S.SD.slice(), SN: S.SN.slice(), plants: S.plants.map(clonePlant), sheet: S.sheet.slice(),
    tot: Object.assign({}, S.tot), yr: Object.assign({}, S.yr), acc: Object.assign({}, S.acc), year: S.year, ev: S.ev.length, rs: R.s, nid: S.nid });
}
function restoreSnap(i) {
  const s = H.snaps[i]; if (!s) return;
  S.day = s.day; S.SD.set(s.SD); S.SN.set(s.SN); S.plants = s.plants.map(clonePlant); S.sheet.set(s.sheet);
  S.tot = Object.assign({}, s.tot); S.yr = Object.assign({}, s.yr); S.acc = Object.assign({}, s.acc); S.year = s.year; S.ev.length = Math.min(S.ev.length, s.ev);
  R.s = s.rs; S.nid = s.nid;
  H.snaps.length = i + 1;
  for (let d = Math.floor(s.day) + 1; d < H.plants.length; d++) { H.plants[d] = NaN; H.heads[d] = NaN; H.bank[d] = NaN; }
  computeLight();
}
function snapIndexAt(day) { let k = 0; for (let i = 0; i < H.snaps.length; i++) if (H.snaps[i].day <= day + 1e-6) k = i; return k; }

// ---------- 道具（いつでも、好きな場所で） ----------
function pullAt(x, y) {   // y は地上の高さ（画面でさわった所）。いちばん近い株
  let best = null, bd = 1e9;
  for (const p of S.plants) {
    if (p.st === 0) continue;
    const top = Math.max(p.H, 0.01), w = 0.02 + 0.25 * Math.sqrt(p.W / SP.wmax);
    const dx = Math.abs(p.x - x) / w, dy = y > top ? (y - top) / 0.03 : 0;
    const d = dx + dy;
    if (d < bd && dx < 1.6 && dy < 1.5) { bd = d; best = p; }
  }
  if (!best) return null;
  const f = 1 / best.n;                          // まとめた株からは1本ぶん
  const mine = Math.round(best.ripe * f), drop = binom(mine, 0.2);   // 抜くときにゆれて落ちる（推定 2割）
  disperse(best, drop);
  let onP = mine - drop;
  for (const b of best.batches) { const k = Math.round(b.n * f); onP += k; b.n -= k; }
  best.ripe -= mine; S.tot.pulled++; S.tot.removedSeeds += onP;
  if (best.n > 1) { best.n--; best.LA = SP.lar * best.W * best.n; } else S.plants = S.plants.filter(p => p !== best);
  const fd = dateOf(S.day);
  logEvent(`${fd.m}月${fd.d}日 1本抜いた` + (best.st === 2 ? `（穂のタネ ${onP} 粒を持ち出し、${drop} 粒が落ちた）` : best.st === 3 ? '（枯れた株）' : ''), 'act');
  return best;
}
function mow(x0, x1, h) {
  h = h || 0.05; let n = 0, seeds = 0, drop = 0;
  for (const p of S.plants) {
    if (p.st === 0 || p.x < x0 || p.x > x1 || p.H <= h) continue;
    const m = 1 - h / p.H;                         // 刈りとった高さの割合
    if (p.st === 2 || p.st === 3) {                // 穂はてっぺん → 刈ると穂ごと持ち去る（熟したタネの3割は落ちる。推定）
      const k = binom(p.ripe, 0.3); disperse(p, k); drop += k;
      seeds += p.ripe - k; for (const b of p.batches) seeds += b.n;
      p.ripe = 0; p.batches = [];
    }
    if (p.st === 3) { p.dd = 99; }
    p.W *= 1 - 0.8 * m; p.LA = SP.lar * p.W * p.n; p.capH = h; p.H = h; n += p.n;
  }
  S.tot.removedSeeds += seeds;
  const fd = dateOf(S.day);
  if (n) logEvent(`${fd.m}月${fd.d}日 ${n}本を高さ ${Math.round(h * 100)}cm で刈った` + (seeds + drop ? `（穂のタネ ${seeds} 粒を持ち出し、${drop} 粒が落ちた）` : ''), 'act');
  return n;
}
function till(x0, x1, depth) {
  depth = depth || 0.15; const zm = Math.round(depth / DZC); let n = 0;
  for (const p of S.plants) if (p.x >= x0 && p.x <= x1) {  // 株は土にすきこむ。熟したタネは土の中へ
    n += p.n; const xi = clamp(Math.floor(p.x / DXC), 0, NX - 1);
    const k = p.ripe; for (let j = 0; j < k; j++) S.SD[Math.floor(rnd() * zm) * NX + xi]++;
    p._gone = true;
  }
  S.plants = S.plants.filter(p => !p._gone);
  const a0 = clamp(Math.floor(x0 / DXC), 0, NX - 1), a1 = clamp(Math.floor(x1 / DXC), 0, NX - 1);
  for (let x = a0; x <= a1; x++) for (const A of [S.SD, S.SN]) {   // 0〜15cm をよくまぜる
    let tot = 0; for (let z = 0; z < zm; z++) { tot += A[z * NX + x]; A[z * NX + x] = 0; }
    for (let j = 0; j < tot; j++) A[Math.floor(rnd() * zm) * NX + x]++;
  }
  const fd = dateOf(S.day);
  logEvent(`${fd.m}月${fd.d}日 ${Math.round((x1 - x0) * 100)}cm を深さ ${Math.round(depth * 100)}cm まで耕した` + (n ? `（株 ${n} 本をすきこんだ）` : ''), 'act');
}
function cover(x0, x1, on) {
  const a0 = clamp(Math.floor(x0 / DXC), 0, NX - 1), a1 = clamp(Math.floor(x1 / DXC), 0, NX - 1);
  for (let x = a0; x <= a1; x++) S.sheet[x] = on ? 1 : 0;
  const fd = dateOf(S.day);
  logEvent(`${fd.m}月${fd.d}日 ${Math.round((x1 - x0) * 100)}cm を` + (on ? '光を通さないシートでおおった' : 'シートを外した'), 'act');
}
