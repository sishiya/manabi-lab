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
  day: 0, scen: 'empty', SD: new Int32Array(NX * NZ), SN: new Int32Array(NX * NZ),
  plants: [], nid: 1, sheet: new Uint8Array(NX),
  opts: { xray: true, noDorm: false, autoPull: false },
  tot: null, year: 1, yr: null, ev: [], acc: { d: 0, cold: 0, warm: 0 },
};
function zeroTot() { return { dropped: 0, shed: 0, lost: 0, decayed: 0, eaten: 0, germ: 0, fatal: 0, emerged: 0, thinned: 0, frost: 0, pulled: 0, removedSeeds: 0, headed: 0 }; }
function zeroYear() { return { shed: 0, emerged: 0, firstEm: false, firstHead: false, firstShed: false, frost: false }; }
const H = { snaps: [], plants: new Float32Array(MAX_DAYS + 2).fill(NaN), heads: new Float32Array(MAX_DAYS + 2).fill(NaN), bank: new Float32Array(MAX_DAYS + 2).fill(NaN) };
const DF = new Float32Array(NZ);  // 深さごとの芽の出やすさ
let ZG = 0;                        // 芽を出せる段の数（DF > 0）
function computeDF() {             // 種ごとにちがう（種をかえたら数えなおす）
  ZG = 0;
  if (SP.kind !== 'seed') return;
  for (let z = 0; z < NZ; z++) {
    const top = z * DZC, c = (z + 0.5) * DZC;
    DF[z] = top < SP.depthBest[0] + 0.003 ? SP.surfaceFactor
      : c <= SP.depthBest[1] ? 1 : c >= SP.depthMax ? 0 : (SP.depthMax - c) / (SP.depthMax - SP.depthBest[1]);
    if (DF[z] > 0) ZG = z + 1;
  }
}
computeDF();

function logEvent(text, kind) {
  S.ev.push({ day: S.day, text, kind: kind || '' });
  if (S.ev.length > 300) S.ev.shift();
}

function restartSim(scen) {
  S.scen = scen || S.scen; R.s = 12345; computeDF();
  const sc = SCENARIOS[S.scen];
  S.day = sc.startDay || 0; S.year = yearOf(S.day); S.SD.fill(0); S.SN.fill(0); S.plants = []; S.nid = 1; S.sheet.fill(0);
  S.tot = zeroTot(); S.yr = zeroYear(); S.ev = []; S.acc = { d: 0, cold: 0, warm: 0 };
  H.snaps = []; H.plants.fill(NaN); H.heads.fill(NaN); H.bank.fill(NaN);
  if (SP.kind === 'clone') bambooReset(sc);
  else if (!sc.empty) {
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

// タネの落ち方（種ごと）: drop 株のまわりにこぼれる / wind 綿毛で風に乗る / ballistic 実がはじけてとぶ
function dispersePoint(p, px) {
  const d = SP.disp || { type: 'drop' };
  if (d.type === 'wind' || d.type === 'ballistic') {
    const r = d.type === 'wind' ? -d.mean * Math.log(1 - rnd())   // 風: 平均 d.mean の指数分布（まれに遠く）
      : rnd() < d.near ? Math.abs(gauss()) * 0.15 : rnd() * d.max;  // はじける: ほとんど株のすぐ近く、ときどき遠くまで
    const a = rnd() * 2 * Math.PI;
    return [px + r * Math.cos(a), p.y + r * Math.sin(a)];
  }
  const sig = (d.sigma != null ? d.sigma : SP.disperse) + 0.25 * p.H;
  return [px + gauss() * sig, p.y + gauss() * sig];
}
function disperse(p, k) {
  const nd = S.opts.noDorm;
  const px = p.x + (p.lean || 0) * p.H;
  for (let j = 0; j < k; j++) {
    const [x, y] = dispersePoint(p, px);
    S.tot.shed++;
    // 計算するのは幅 30cm の花だんの半分（y = 0 が通路の縁、BED_D が花だんのまん中）。
    // 残りの半分は鏡うつしで同じようすとし、まん中をこえて落ちた分は、向こう半分から来る分と入れかわる
    if (x < 0 || x >= BED_W || y < 0 || y >= 2 * BED_D) { S.tot.lost++; continue; }   // 花だんの外（通路）
    S.yr.shed++;
    const i = Math.floor(x / DXC);
    if (nd) S.SN[i]++; else S.SD[i]++;
  }
  if (k > 0 && typeof fxShed === 'function') fxShed(p, k);   // 見た目だけ（穂から落ちるところ）
  if (k > 0 && p.st !== 3 && !S.yr.firstShed) { S.yr.firstShed = true; logEvent((SP.disp && SP.disp.type === 'wind' ? '綿毛が飛びはじめた' : '熟したタネが落ちはじめた') + '（' + S.year + '年目）', 'shed'); }
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
  const fT = clamp((T - sp.gb) / (sp.topt - sp.gb), 0, 1), per = sp.life === 'perennial', hcd = per ? 0 : headCdNow(doy);
  const inWin = per && T >= sp.flowerT && sp.flowerWin.some(w => doy >= w[0] && doy < w[1]);
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
      const Pg = sp.rgr * fT * light * p.W * dt, dW = Pg * Math.max(0, 1 - p.W / sp.wmax);   // Pg: 葉で作った分。大きくなりきった株は重さがふえない
      p.W += dW;
      if (p.capH < 9) p.capH += 0.01 * fT * dt;     // 刈ったあと、のびなおす（推定 1cm/日）
      p.H = Math.min(p.capH, Math.max(0.008, sp.hmax * Math.pow(p.W / sp.wmax, 0.4)));
      p.LA = sp.lar * p.W * p.n; p.til = Math.min(14, Math.floor(Math.log2(1 + p.W / 0.12)));
      p.cd += tt;
      // 花（穂）: 一年草は芽が出てからの積算温度で1回。何年も生きる草は、花の季節に株が育っていれば咲く
      const flower = per ? inWin && p.W > sp.wFlower : (p.st === 2 || (p.cd >= hcd && p.W > 0.004));
      if (p.st === 1 && flower) {
        p.st = 2; S.tot.headed += p.n;
        if (!S.yr.firstHead) { S.yr.firstHead = true; logEvent(sp.words.headed + '（' + S.year + '年目）', 'head'); }
      } else if (per && p.st === 2 && !flower) p.st = 1;   // 花の季節がおわった（実はそのまま熟す）
      if (p.st === 2 && S.opts.autoPull) { if (pullOne(p, null, true)) continue; keep.push(p); continue; }
      if (p.st === 2) {
        p.sAcc += (sp.reproFrac * (per ? Pg : dW) / sp.seedMass + (p.made === 0 ? 3 : 0)) * p.n;   // 一年草はふえた重さから、何年も生きる草は葉で作った分から。まとめた株は n 本ぶん。小さい株でも数粒はつく（推定）
        const n = Math.floor(p.sAcc);
        if (n > 0) {
          p.sAcc -= n; p.made += n;
          const b = p.batches[p.batches.length - 1];
          if (b && p.cdH - b.cd < 20) b.n += n; else p.batches.push({ n, cd: p.cdH });
        }
      }
      if (p.st === 2 || p.batches.length || p.ripe) {   // 実が熟して落ちる
        p.cdH += tt;
        while (p.batches.length && p.cdH - p.batches[0].cd >= sp.matureCd) p.ripe += p.batches.shift().n;
        const k = binom(p.ripe, 1 - Math.exp(-sp.shed * dt)); p.ripe -= k; p.shedN += k; disperse(p, k);
      }
      if (!per && p.st === 2 && p.cdH > sp.senesceCd) killPlant(p, 'old');
      if (!per && p.st !== 3 && T < sp.frostT) {
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
    // 抜いて置いてある株（スベリヒユ）: 地面の上でも実が熟して落ちる。根づくものもある
    if (p.uproot) {
      p.dd += dt; p.cdH += tt;
      while (p.batches.length && p.cdH - p.batches[0].cd >= sp.matureCd) p.ripe += p.batches.shift().n;
      const k = binom(p.ripe, 1 - Math.exp(-sp.shed * dt)); p.ripe -= k; p.shedN += k; disperse(p, k);
      if (p.reroot && p.dd >= 5) { p.st = 1; p.uproot = false; p.reroot = false; p.W *= 0.5; logEvent('抜いて置いておいた株が、また根づいた', 'shed'); }
      else if (p.dd > 30) { disperse(p, p.ripe); p.ripe = 0; continue; }
      keep.push(p); continue;
    }
    // 枯れた株: 残った熟したタネを落としながら倒れていく
    p.dd += dt;
    const k = binom(p.ripe, 1 - Math.exp(-0.12 * dt)); p.ripe -= k; p.shedN += k; disperse(p, k);
    if (p.dd > (p.W < 0.3 ? 12 : 50)) { disperse(p, p.ripe); p.ripe = 0; continue; }   // 小さい株は早く倒れて見えなくなる
    keep.push(p);
  }
  S.plants = keep;
  if (S.plants.length > GROUP_AT) groupSeedlings();
}

// 数が多いときの間引き（計算と描くのを軽くし、図を見やすく）: 同じ 2cm の列・同じころの小さな株を1つのまとまりに（本数 n は数えたまま）。
// まとめた株は同じ重さ・同じ育ち方として計算し、絵は代表の1本だけ描く。大きな株（0.2g より重い）と穂の出た株はまとめない
const GROUP_AT = 250;
function groupSeedlings() {
  const map = new Map(), keep = [];
  for (const p of S.plants) {
    let key = null;
    if (p.st === 0) key = '0|' + Math.floor(p.x / 0.02) + '|' + Math.floor(p.z0 / 0.005) + '|' + Math.floor(p.cdU / 15);
    else if (p.st === 1 && p.W < 0.2) key = '1|' + Math.floor(p.x / 0.02) + '|' + Math.round(Math.log2(p.W) * 2) + '|' + Math.floor(p.cd / 25) + '|' + (p.capH < 9 ? 1 : 0);
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
  if (SP.kind === 'clone') stepBamboo(T, dt);
  else { computeLight(); seedsStep(T, dt); plantsStep(T, dt); }
  const before = Math.floor(S.day);
  S.day += dt;
  const y = yearOf(S.day);
  if (y !== S.year) { S.year = y; S.yr = zeroYear(); if (SP.kind === 'clone') bambooNewYear(); }
  for (let d = before + 1; d <= Math.floor(S.day); d++) {
    record(d);
    if (d % SNAP_EVERY === 0) takeSnap();
  }
}

// ---------- 数える ----------
function bankTotal() { let a = 0, d = 0; for (let i = 0; i < NX * NZ; i++) { a += S.SN[i]; d += S.SD[i]; } return { a, d, n: a + d }; }
function counts() {
  if (SP.kind === 'clone') {   // 竹: 地上の竹・タケノコ・地下茎の長さ（グラフは cm）
    const b = bCounts();
    return Object.assign(b, { up: b.culms, heads: b.shoots, under: 0, onPlant: 0, bank: b.rh, awake: 0, dorm: 0, perM2: b.rh * 100 });
  }
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
    tot: Object.assign({}, S.tot), yr: Object.assign({}, S.yr), acc: Object.assign({}, S.acc), year: S.year, ev: S.ev.length, rs: R.s, nid: S.nid,
    b: SP.kind === 'clone' ? JSON.stringify({ rh: B.rh, tips: B.tips, culms: B.culms, R: B.R, nid: B.nid, barrier: B.barrier, tot: B.tot, yr: B.yr }) : null });
}
function restoreSnap(i) {
  const s = H.snaps[i]; if (!s) return;
  S.day = s.day; S.SD.set(s.SD); S.SN.set(s.SN); S.plants = s.plants.map(clonePlant); S.sheet.set(s.sheet);
  S.tot = Object.assign({}, s.tot); S.yr = Object.assign({}, s.yr); S.acc = Object.assign({}, s.acc); S.year = s.year; S.ev.length = Math.min(S.ev.length, s.ev);
  R.s = s.rs; S.nid = s.nid;
  if (s.b) Object.assign(B, JSON.parse(s.b));
  H.snaps.length = i + 1;
  for (let d = Math.floor(s.day) + 1; d < H.plants.length; d++) { H.plants[d] = NaN; H.heads[d] = NaN; H.bank[d] = NaN; }
  computeLight();
}
function snapIndexAt(day) { let k = 0; for (let i = 0; i < H.snaps.length; i++) if (H.snaps[i].day <= day + 1e-6) k = i; return k; }

// ---------- 道具（いつでも、好きな場所で） ----------
// ---------- 道具（いつでも、好きな場所で。ドラッグ中は1つの「ひと塗り」stroke にまとめて、終わりに1行だけ記録） ----------
function newStroke(tool) { return { tool, n: 0, seeds: 0, drop: 0, x0: 1e9, x1: -1e9, cols: new Set(), ids: new Set(), on: null, h: 0.05, depth: 0.15 }; }
function endStroke(k) {
  if (!k) return;
  const fd = dateOf(S.day), d = `${fd.m}月${fd.d}日 `, len = Math.max(1, Math.round((k.x1 - k.x0) * 100));
  const sd = k.left ? (k.drop ? `（ゆれて ${k.drop} 粒が落ちた）` : '') : k.seeds + k.drop ? `（${SP.words.head}のタネ ${k.seeds} 粒を持ち出し、${k.drop} 粒が落ちた）` : '';
  if (SP.kind === 'clone') {   // 竹
    if (k.tool === 'seed' && k.n) logEvent(d + `地下茎のついた若い竹を ${k.n} 本植えた`, 'act');
    if (k.tool === 'pull' && k.n) logEvent(d + `タケノコを ${k.n} 本掘った`, 'act');
    if (k.tool === 'mow' && k.n) logEvent(d + `竹を ${k.n} 本切った（地下茎は生きている）`, 'act');
    if (k.tool === 'till' && k.x1 > k.x0) logEvent(d + `${len}cm を深さ ${Math.round(k.depth * 100)}cm まで耕した` + (k.n ? `（浅い地下茎 ${k.n}cm を切った）` : '（浅い地下茎はなかった）'), 'act');
    if (k.tool === 'cover' && k.n) logEvent(d + (k.on ? '根止めの板（深さ 50cm）を立てた' : '根止めの板を外した'), 'act');
    return;
  }
  if (k.tool === 'seed' && k.n) logEvent(d + `タネを ${k.n} 粒落とした（冬をこした、目ざめたタネ）`, 'act');
  if (k.tool === 'pull' && k.n) logEvent(d + `${k.n}本抜いた` + sd + (k.regrow ? `。${k.regrow}本は根が残った（また芽を出す）` : '') + (k.left ? '。抜いた株はその場に置いた（実は地面の上でも熟す）' : ''), 'act');
  if (k.tool === 'mow' && k.n) logEvent(d + `${k.n}本を高さ ${Math.round(k.h * 100)}cm で刈った` + sd, 'act');
  if (k.tool === 'till' && k.cols.size) logEvent(d + `${k.cols.size}cm を深さ ${Math.round(k.depth * 100)}cm まで耕した` + (k.n ? `（株 ${k.n} 本をすきこんだ）` : ''), 'act');
  if (k.tool === 'cover' && k.cols.size) logEvent(d + `${k.cols.size}cm を` + (k.on ? '光を通さないシートでおおった' : 'シートを外した'), 'act');
}
function span(k, x0, x1) { if (k) { k.x0 = Math.min(k.x0, x0); k.x1 = Math.max(k.x1, x1); } }
// 1つのストロークで1回だけ使うための仮の stroke（タップや窓口から呼んだとき）
function once(tool, fn) { const k = newStroke(tool); const r = fn(k); endStroke(k); return r; }

// タネを落とす（ユーザーが手で）: 表面（0〜5mm）に目ざめたタネを1粒。なぞると 2cm ごとに1粒
function dropSeed(x, k) {
  if (!k) return once('seed', k2 => dropSeed(x, k2));
  if (x < 0 || x >= BED_W) return false;
  if (k.lastX != null && Math.abs(x - k.lastX) < 0.02) return false;
  k.lastX = x; k.n++; span(k, x, x);
  S.SN[clamp(Math.floor(x / DXC), 0, NX - 1)]++; S.tot.dropped++;
  return true;
}
function pullAt(x, y, k) {   // y は地上の高さ（画面でさわった所）。いちばん近い株
  if (!k) return once('pull', k2 => pullAt(x, y, k2));
  let best = null, bd = 1e9;
  for (const p of S.plants) {
    if (p.st === 0 || k.ids.has(p.id)) continue;
    // タップは葉の広がりのどこでも。なぞっている間（k.tol）は根もとの近くだけ（通った所の株だけを抜く）
    const top = Math.max(p.H, 0.01), w = k.tol || 0.02 + 0.25 * Math.sqrt(p.W / SP.wmax);
    const dx = Math.abs(p.x - x) / w, dy = y > top ? (y - top) / 0.03 : 0;
    const d = dx + dy;
    if (d < bd && dx < (k.tol ? 1 : 1.6) && dy < 1.5) { bd = d; best = p; }
  }
  if (!best) return null;
  k.ids.add(best.id);
  if (typeof fxPull === 'function') fxPull(best);   // 見た目だけ（すぽん）
  pullOne(best, k, false);
  return best;
}
// 1本抜く（道具でも、実験「すぐ抜く」でも）。計算から消えたら true。根が残る種・置いておく種もある
function pullOne(best, k, auto) {
  const f = 1 / best.n;                          // まとめた株からは1本ぶん
  const mine = Math.round(best.ripe * f), drop = auto ? 0 : binom(mine, 0.2);   // 抜くときにゆれて落ちる（推定 2割）
  disperse(best, drop);
  let onP = mine - drop;
  const regrow = !!SP.pullRegrow && rnd() < SP.pullRegrow, left = SP.pullLeft != null && !auto;
  if (left) {   // スベリヒユ: 抜いた株はその場に置いておく（持ち出さない）。実は地面の上で熟す
    const q = clonePlant(best); q.id = S.nid++; q.n = 1; q.st = 3; q.uproot = true; q.dd = 0; q.reroot = rnd() < SP.pullLeft;
    q.ripe = mine - drop; q.batches = best.batches.map(b => ({ n: Math.round(b.n * f), cd: b.cd }));
    S.plants.push(q); onP = 0;
  }
  for (const b of best.batches) { const c = Math.round(b.n * f); if (!left) onP += c; b.n -= c; }
  best.ripe -= mine; S.tot.pulled++; S.tot.removedSeeds += onP;
  let gone = false;
  if (regrow) {   // 根の切れはしが残って、また芽を出す（タンポポ・カタバミ）
    let q = best;
    if (best.n > 1) { best.n--; best.LA = SP.lar * best.W * best.n; q = Object.assign(clonePlant(best), { id: S.nid++, n: 1 }); S.plants.push(q); }
    q.W = Math.max(SP.seedMass * 2, q.W * 0.05); q.H = 0.008; q.st = 1; q.batches = []; q.ripe = 0; q.sAcc = 0; q._gk = null; q.regrown = (q.regrown || 0) + 1;
    if (k) k.regrow = (k.regrow || 0) + 1; else S.tot.regrowAuto = (S.tot.regrowAuto || 0) + 1;
  } else if (best.n > 1) { best.n--; best.LA = SP.lar * best.W * best.n; }
  else { gone = true; if (!auto) S.plants = S.plants.filter(p => p !== best); }
  if (k) { k.n++; k.seeds += onP; k.drop += drop; span(k, best.x, best.x); if (left) k.left = (k.left || 0) + 1; }
  return gone;
}
function mow(x0, x1, h, k) {
  if (!k) return once('mow', k2 => mow(x0, x1, h, k2));
  h = h || 0.05; k.h = h; let n = 0;
  for (const p of S.plants) {
    if (p.st === 0 || p.x < x0 || p.x > x1 || p.H <= h) continue;
    const m = 1 - h / p.H;                         // 刈りとった高さの割合
    if (p.st === 2 || p.st === 3) {                // 穂はてっぺん → 刈ると穂ごと持ち去る（熟したタネの3割は落ちる。推定）
      const c = binom(p.ripe, 0.3); disperse(p, c); k.drop += c;
      k.seeds += p.ripe - c; S.tot.removedSeeds += p.ripe - c;
      for (const b of p.batches) { k.seeds += b.n; S.tot.removedSeeds += b.n; }
      p.ripe = 0; p.batches = [];
    }
    if (p.st === 3) { p.dd = 99; }
    p.W *= 1 - 0.8 * m; p.LA = SP.lar * p.W * p.n; p.capH = h; p.H = h; n += p.n;
  }
  k.n += n; span(k, x0, x1);
  return n;
}
function till(x0, x1, depth, k) {
  if (!k) return once('till', k2 => till(x0, x1, depth, k2));
  depth = depth || 0.15; k.depth = depth; const zm = Math.round(depth / DZC);
  for (const p of S.plants) if (p.x >= x0 && p.x <= x1) {  // 株は土にすきこむ。熟したタネは土の中へ
    k.n += p.n; const xi = clamp(Math.floor(p.x / DXC), 0, NX - 1);
    const c = p.ripe; for (let j = 0; j < c; j++) S.SD[Math.floor(rnd() * zm) * NX + xi]++;
    p._gone = true;
  }
  S.plants = S.plants.filter(p => !p._gone);
  const a0 = clamp(Math.floor(x0 / DXC), 0, NX - 1), a1 = clamp(Math.floor(x1 / DXC), 0, NX - 1);
  for (let x = a0; x <= a1; x++) {                 // 0〜15cm をよくまぜる（1回のドラッグで同じ列は1回だけ）
    if (k.cols.has(x)) continue; k.cols.add(x);
    for (const A of [S.SD, S.SN]) {
      let tot = 0; for (let z = 0; z < zm; z++) { tot += A[z * NX + x]; A[z * NX + x] = 0; }
      for (let j = 0; j < tot; j++) A[Math.floor(rnd() * zm) * NX + x]++;
    }
  }
  span(k, x0, x1);
}
function cover(x0, x1, on, k) {
  if (!k) return once('cover', k2 => cover(x0, x1, on, k2));
  if (k.on === null) k.on = on;                    // 1回のドラッグの中は、はじめに決めた向き（おおう／外す）のまま
  const a0 = clamp(Math.floor(x0 / DXC), 0, NX - 1), a1 = clamp(Math.floor(x1 / DXC), 0, NX - 1);
  for (let x = a0; x <= a1; x++) { if (S.sheet[x] !== (k.on ? 1 : 0)) k.cols.add(x); S.sheet[x] = k.on ? 1 : 0; }
  span(k, x0, x1);
}
