// 物語の時間表と、時間だけから決まる細菌の中の様子（スライダーをどこへ動かしても同じ絵になるように、乱数は種を決める）
// 区間: 近づく → くっつく → 刺さる → DNA が入る → 細菌の中（分）→ 破れて出る
'use strict';

const CELL = { L: 2000, R: 450 };                 // 細菌の長さと半径（nm）
const SITE = { x: -380, y: CELL.R };              // ファージが降りる場所（上面）
const SECOND = { x: 420, y: CELL.R };             // あとから来るファージの場所（もしも）

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
function inCell(x, y, m = 0) { const ax = Math.max(0, Math.abs(x) - (CELL.L / 2 - CELL.R)); return ax * ax + y * y < (CELL.R - m) ** 2; }

const Story = (() => {
  const CONDS = {
    normal: '通常（大腸菌 K-12）',
    norec: 'もしも: 受け手のない細菌',
    gt: 'もしも: DNA に糖のない T4',
    lin: 'もしも: あとからもう1つ来る',
  };
  let cond = 'normal', segs = [], M = null, P = null, total = 1;
  const SPREAD_MIN = 80;
  const END_P = 0.9;       // 次々にうつる区間のここから、締めのまとめを出す   // 次々にうつる区間の長さ（最初の細菌が破れてからの分）

  function build(c) {
    cond = c || cond;
    const tEnd = cond === 'lin' ? TL.linLysis : cond === 'gt' ? 3 : 23.5;
    segs = [
      { id: 'zoomin', name: '人のからだから', dur: 6 },
      { id: 'colony', name: 'たくさんの細菌', dur: 8 },
      { id: 'approach', name: '近づく', dur: 7 },
      { id: 'bind', name: cond === 'norec' ? 'くっつけない' : 'くっつく', dur: cond === 'norec' ? 9 : 6 },
    ];
    if (cond !== 'norec') {
      segs.push({ id: 'pierce', name: '刺さる', dur: 9 }, { id: 'inject', name: 'DNA が入る', dur: 6 });
      segs.push({ id: 'inside', name: '細菌の中', dur: cond === 'lin' ? 140 : cond === 'gt' ? 10 : 75, tEnd });
      if (cond !== 'gt') segs.push({ id: 'burst', name: '破れて出る', dur: 7 }, { id: 'spread', name: '次々にうつる', dur: 20, tEnd: SPREAD_MIN });
    }
    total = segs.reduce((a, s) => a + s.dur, 0);
    let u = 0; for (const s of segs) { s.u0 = u / total; u += s.dur; s.u1 = u / total; }
    M = buildInside(tEnd);
    P = buildColony(tEnd);
    return segs;
  }

  // スライダーの位置 u（0〜1）→ 区間と、区間の中の進み p
  function at(u) {
    u = Math.max(0, Math.min(1, u));
    let s = segs[segs.length - 1];
    for (const q of segs) if (u <= q.u1) { s = q; break; }
    const p = (u - s.u0) / Math.max(1e-9, s.u1 - s.u0);
    const st = { seg: s, id: s.id, p, u, min: s.id === 'inside' ? p * s.tEnd : s.id === 'burst' ? M.tEnd : s.id === 'spread' ? M.tEnd + p * s.tEnd : s.id === 'approach' || s.id === 'bind' || s.id === 'pierce' || s.id === 'inject' ? 0 : 0 };
    st.label = label(st);
    return st;
  }
  function label(st) {
    switch (st.id) {
      case 'zoomin': return '人のからだから、大腸の中へ寄っていく';
      case 'colony': return 'たくさんの大腸菌 ・ 泳いだり、ゆれたり';
      case 'spread': return `次々にうつる ・ 最初の感染から ${st.min.toFixed(0)} 分`;
      case 'approach': return `近づく ・ ${(0.6 * st.p).toFixed(2)} ミリ秒`;
      case 'bind': return `${st.seg.name} ・ ${(0.6 + 0.6 * st.p).toFixed(2)} ミリ秒`;
      case 'pierce': return '刺さる ・ ミリ秒ほど（はっきり測られていない）';
      case 'inject': return 'DNA が入る ・ 数秒〜（T4 では測られていない）';
      case 'inside': return `細菌の中 ・ 感染から ${st.min.toFixed(1)} 分`;
      case 'burst': return `破れて出る ・ 感染から 約${M.tEnd.toFixed(0)} 分`;
    }
    return '';
  }
  // 区間 id と p → u
  function u(id, p = 0) { const s = segs.find(q => q.id === id); if (!s) return 0; return s.u0 + (s.u1 - s.u0) * p; }
  function uMin(m) { const s = segs.find(q => q.id === 'inside'); if (!s) return 0; return s.u0 + (s.u1 - s.u0) * Math.min(1, m / s.tEnd); }

  // ---- 着陸（近づく〜DNA が入る）: 基盤の位置と脚、刺さる様子の時刻（③の「刺さる」と同じ時刻表 0〜18）----
  const LEG_ORDER = [1, 4, 0];          // くっつく脚の順番
  const BIND_P = [0.15, 0.45, 0.8];     // くっつく時刻（区間の中）
  function landing(st) {
    const L = { dx: 0, hb: 70, bound: [false, false, false, false, false, false], k: [0, 0, 0, 0, 0, 0], tA: -1, after: false };
    if (st.id === 'colony' || st.id === 'zoomin') { L.hb = 560; L.dx = 0; }
    else if (st.id === 'approach') {
      const p = st.p;
      L.hb = 560 + (78 - 560) * ease(p);
      L.dx = 26 * Math.sin(p * 7.3) + 11 * Math.sin(p * 19.1 + 1); // ブラウン運動のゆれ（模式）
    } else if (st.id === 'bind') {
      const p = st.p;
      if (cond === 'norec') { L.hb = 78 - 8 * ease(p / 0.4) + 260 * ease((p - 0.55) / 0.45); L.dx = 8 * Math.sin(p * 11); L.touch = p > 0.15 && p < 0.6; }
      else {
        L.hb = 78 - 8 * ease(p / 0.3);
        LEG_ORDER.forEach((i, j) => { if (p >= BIND_P[j]) { L.bound[i] = true; L.k[i] = Math.min(1, (p - BIND_P[j]) / 0.08); } });
      }
    } else {
      LEG_ORDER.forEach(i => { L.bound[i] = true; L.k[i] = 1; });
      if (st.id === 'pierce') L.tA = 11.5 * st.p;
      else if (st.id === 'inject') L.tA = 11.6 + 6.4 * st.p;
      else { L.tA = 18; L.after = true; }
    }
    return L;
  }
  // 刺さる様子（時刻 tA 秒。③の刺さると同じ）
  function pierce(tA) {
    const cl = (a, b) => Math.max(0, Math.min(1, (tA - a) / (b - a)));
    return {
      star: tA < 0 ? 0 : ease(cl(0, 2.5)), gp12: ease(cl(2.5, 4.5)),
      ring: i => tA < 0 ? 0 : ease(cl(4.5 + i * 0.17, 4.5 + i * 0.17 + 0.45)),
      lyso: ease(cl(9.6, 11.4)), dna: cl(11.6, 18),
    };
  }

  // ---- 細菌の中（時間 m 分だけから決まる）----
  function buildInside(tEnd) {
    const r = rng(20261011);
    const randIn = m => { for (;;) { const x = (r() - 0.5) * CELL.L, y = (r() - 0.5) * 2 * CELL.R; if (inCell(x, y, m)) return { x, y }; } };
    const M = { tEnd, ribo: [], nuc: [], loops: [], heads: [], lyz: [] };
    for (let i = 0; i < 420; i++) M.ribo.push({ ...randIn(45), a: r() * 6.28 });
    // 細菌の DNA（まん中のかたまり）
    let x = 0, y = 0, a = 0;
    for (let i = 0; i < 1400; i++) { a += (r() - 0.5) * 2; x += Math.cos(a) * 14; y += Math.sin(a) * 14; if ((x / 560) ** 2 + (y / 230) ** 2 > 1) { a += Math.PI; x *= 0.95; y *= 0.95; } M.nuc.push([x, y]); }
    M.nucOrder = M.nuc.map((_, i) => i).sort(() => r() - 0.5);
    M.nucRank = new Int32Array(M.nuc.length); M.nucOrder.forEach((idx, k) => { M.nucRank[idx] = k; });
    // T4 の DNA: 1本ぶんの輪（1つめは入った場所）
    for (let c = 0; c < 40; c++) {
      const cx = c === 0 ? SITE.x : (r() - 0.5) * 1120 * Math.min(1, 0.35 + c / 40), cy = c === 0 ? SITE.y - 90 : (r() - 0.5) * 460 * Math.min(1, 0.35 + c / 40);
      const pts = []; let px = cx, py = cy, aa = r() * 6.28;
      for (let i = 0; i < 70; i++) { aa += (r() - 0.5) * 2.2; px += Math.cos(aa) * 8; py += Math.sin(aa) * 8; if (!inCell(px, py, 60)) aa += Math.PI; pts.push([px, py]); }
      M.loops.push({ pts, cx, cy });
    }
    // 頭（とあとで付くしっぽ）: 9分から毎分12個のペースで作りはじめる（模式。最初の完成が約12〜15分、24分までに100〜150個）
    const HEADFUL = Math.round(T4.genomeBp * 1.03);
    let acc = 0;
    for (let t = TL.late; t < tEnd; t += 0.01) {
      acc += (t < 25 ? 12 : 12 * Math.exp(-(t - 25) / 20)) * 0.01;
      while (acc >= 1 && M.heads.length < 600) {
        acc -= 1;
        const p = randIn(90), q = randIn(90), bp = Math.min(TL.packBpMax, Math.max(350, TL.packBp * (0.75 + 0.5 * r())));
        const fs = t + 0.6, ang = r() * 6.28, c = { x: p.x - 172 * Math.sin(ang), y: p.y + 172 * Math.cos(ang) };
        // 殻ができる内膜の場所（できあがりの頭にいちばん近いふち）
        const ax = Math.max(-(CELL.L / 2 - CELL.R), Math.min(CELL.L / 2 - CELL.R, c.x)), nl = Math.hypot(c.x - ax, c.y) || 1, nx = (c.x - ax) / nl, ny = c.y / nl;
        const mr = CELL.R - 36 - 52;
        M.heads.push({ x: p.x, y: p.y, ang, born: t, fs, fe: fs + HEADFUL / bp / 60, tx0: q.x, ty0: q.y, tang: r() * 6.28, mx: ax + nx * mr, my: ny * mr, mang: Math.atan2(nx, -ny) });
      }
    }
    for (let i = 0; i < 160; i++) { const p = randIn(40); M.lyz.push(p); }
    // 奥行き（細菌は厚さ約0.9µm の立体。平面に重ねて描くので、手前の約3割だけくっきり・説明あり、奥は薄い背景）
    M.heads.forEach((h, i) => { h.z = hash(i, 77); });
    const fh = M.heads.find(h => h.born >= TL.late + 0.8); if (fh) fh.z = 0;
    return M;
  }
  // ---- まわりの細菌（はじめと、おわりの次々にうつる区間）----
  // 位置・泳ぎ方は模式。うつる範囲（REACH）と時間も模式（本当は菌の数・水の流れで大きく変わる）。潜伏期は物語の細菌と同じ
  const REACH = 5200, LAT = () => M.tEnd;
  function buildColony(tEnd) {
    const r = rng(4242), cells = [];
    for (let i = 0; i < 400 && cells.length < 64; i++) {
      const x = (r() - 0.5) * 34000, y = (r() - 0.5) * 22000;
      if (Math.abs(x) < 2600 && Math.abs(y) < 1900) continue;
      if (cells.some(c => Math.hypot(c.x - x, c.y - y) < 2900)) continue;
      cells.push({ x, y, ang: r() * 6.28, len: 1700 + r() * 900, ph: r() * 6.28, sw: 0.4 + r() * 0.6, dir: r() < 0.5 ? -1 : 1, tInf: Infinity, tBurst: Infinity });
    }
    // うつる時刻: 破れた細菌から REACH 以内の細菌に、距離に応じて少しおくれてうつる（いちばん早いもの）
    const src = [{ x: 0, y: 0, t: 0 }];
    for (let it = 0; it < cells.length; it++) {
      let best = null, bt = Infinity;
      for (const c of cells) {
        if (c.tInf < Infinity) continue;
        for (const s0 of src) { const d = Math.hypot(c.x - s0.x, c.y - s0.y); if (d > REACH) continue; const t = s0.t + 0.5 + 2.5 * (d / REACH) ** 2; if (t < bt) { bt = t; best = c; } }
      }
      if (!best) break;
      best.tInf = bt; best.tBurst = bt + tEnd; src.push({ x: best.x, y: best.y, t: best.tBurst });
    }
    return { cells };
  }
  // 細菌の位置（tau: 物語の秒。泳ぐ・ゆれるは模式）。うつったあとはあまり動かない
  function cellPose(c, tau, rm) {
    const k = rm >= c.tInf ? 0.25 : 1, a = c.ang + 0.25 * Math.sin(tau * 0.3 * c.sw + c.ph) * k;
    const d = 380 * Math.sin(tau * 0.21 * c.sw + c.ph) * k * c.dir;
    return { x: c.x + Math.cos(c.ang) * d, y: c.y + Math.sin(c.ang) * d, ang: a };
  }
  // rm: 最初の細菌が破れてからの分。広がっているファージの数（目安）と、破れた細菌の数
  function colonyCounts(rm) {
    let burst = 1, inf = 0;
    for (const c of P.cells) { if (rm >= c.tBurst) burst++; else if (rm >= c.tInf) inf++; }
    const per = Math.max(80, countsAtEnd());
    return { burst, inf, phage: burst * per, cells: P.cells.length + 1, per };
  }
  function countsAtEnd() { let d = 0; for (const h of M.heads) if (M.tEnd >= h.fe + 0.6) d++; return d; }

  // コピーの分かれ目の位置（輪 j の上を時間とともに進む）
  function forkIdx(j, m) { const L = M.loops[j]; return 2 + Math.floor((((m * 0.9 + j * 0.37) % 1) + 1) % 1 * (L.pts.length - 4)); }
  const genomes = m => m < TL.repl ? 1 : 1 + 14 * (m - TL.repl);
  const hostLeft = m => cond === 'gt' ? 1 : 1 - Math.max(0, Math.min(1, (m - TL.hostDnaFrom) / (TL.hostDnaTo - TL.hostDnaFrom)));
  function counts(m) {
    let done = 0, packing = 0, building = 0, packed = 0, started = 0;
    for (const h of M.heads) {
      if (m < h.born) break;
      if (m >= h.born + 0.6) started++;
      if (m >= h.fe + 0.6) { done++; packed++; } else if (m >= h.fs) { packing++; packed += Math.min(1, (m - h.fs) / (h.fe - h.fs)); } else building++;
    }
    const gen = genomes(m), pool = Math.max(1, gen - packed);
    return { done, packing, building, genomes: gen, pool, loops: Math.min(M.loops.length, Math.ceil(pool)), gp23: started * 960, gp18: (packing + done) * 138 };
  }
  // 組み立ての時刻（分）。born〜+0.35 内膜の上で殻、〜fs 足場が切られて離れる、fs〜fe DNA をつめる（その間にしっぽは別の場所で組み立て）、
  // fe〜+0.25 首ができてしっぽが付く、〜+0.6 長い脚が付く（時間の割りふりは目安）
  const JOIN = 0.25;
  function tailPos(h, m) {
    const k = ease((m - h.fe) / JOIN), j = Math.sin(Math.PI * Math.min(1, Math.max(0, k))) ** 0.6, q = (m - h.fe) * 60;
    return { x: h.tx0 + (h.x - h.tx0) * k + j * (40 * Math.sin(q * 9.1 + h.born) + 22 * Math.sin(q * 23.7)), y: h.ty0 + (h.y - h.ty0) * k + j * (40 * Math.cos(q * 7.3 + h.born) + 22 * Math.cos(q * 19.3)), ang: h.tang + (h.ang - h.tang) * k + j * 0.5 * Math.sin(q * 5.9) };
  }
  // 頭の中心と向き（その時刻）。内膜の上 → できあがりの場所へ
  function headAt(h, m) {
    const fx = h.x - 172 * Math.sin(h.ang), fy = h.y + 172 * Math.cos(h.ang);
    const k = ease((m - h.born - 0.35) / (h.fs - h.born - 0.35));
    let da = h.ang - h.mang; da = Math.atan2(Math.sin(da), Math.cos(da));
    return { x: h.mx + (fx - h.mx) * k, y: h.my + (fy - h.my) * k, ang: h.mang + da * k };
  }
  const headCenter = (h, m = Infinity) => headAt(h, m);
  const headPortal = (h, m = Infinity) => { const c = headAt(h, m); return { x: c.x + 60 * Math.sin(c.ang), y: c.y - 60 * Math.cos(c.ang) }; };

  // 流れる点（材料・部品）: 種類ごとに決まった間かくで生まれ、決まった時間で行き先へ。時刻だけで位置が決まる
  const CH = [
    { id: 'mat', col: '#6ea9ff', every: 1 / 60, life: 0.6, on: m => m >= TL.hostDnaFrom && hostLeft(m) > 0.02 },
    { id: 'early', col: '#ffae5a', every: 1 / 45, life: 0.6, on: m => m >= 0.3 && m < TL.late },
    { id: 'shell', col: '#5fe0c4', every: 1 / 80, life: 0.55, on: m => m >= TL.late },
    { id: 'tail', col: '#c39bff', every: 1 / 40, life: 0.55, on: m => m >= TL.late + 0.6 },
    { id: 'fiber', col: '#f2f7f9', every: 1 / 20, life: 0.5, on: m => m >= 12 },
  ];
  function particles(m) {
    const out = [], c = counts(m), live = M.loops.slice(0, c.loops);
    const loopPt = k => { const L = live[Math.floor(hash(k, 7) * live.length)] || M.loops[0]; const p = L.pts[Math.floor(hash(k, 8) * L.pts.length)]; return { x: p[0], y: p[1] }; };
    CH.forEach((ch, ci) => {
      const k0 = Math.ceil((m - ch.life) / ch.every), k1 = Math.floor(m / ch.every);
      for (let k = k0; k <= k1; k++) {
        const ts = k * ch.every; if (!ch.on(ts) || ts > M.tEnd) continue;
        const pr = (m - ts) / ch.life, key = k * 7 + ci;
        const rib = M.ribo[Math.floor(hash(key, 1) * M.ribo.length)];
        let src = rib, dst = null;
        if (ch.id === 'mat') { const n = M.nuc[M.nucOrder[Math.floor(hash(key, 2) * M.nuc.length)]]; src = { x: n[0], y: n[1] }; dst = loopPt(key); }
        else if (ch.id === 'early') { if (hash(key, 3) < 0.5 && hostLeft(ts) > 0.1) { const n = M.nuc[Math.floor(hash(key, 4) * M.nuc.length)]; dst = { x: n[0], y: n[1] }; } else dst = loopPt(key); }
        else {
          const cand = M.heads.filter(h => ch.id === 'shell' ? ts >= h.born && ts < h.born + 0.35 : ch.id === 'tail' ? ts >= h.fs && ts < h.fe : ts >= h.fe + JOIN && ts < h.fe + 0.6);
          if (!cand.length) continue;
          const h = cand[Math.floor(hash(key, 5) * cand.length)];
          dst = ch.id === 'shell' ? headCenter(h, m) : ch.id === 'tail' ? tailPos(h, m) : { x: h.x, y: h.y };
          dst = { x: dst.x + (hash(key, 6) - 0.5) * 50, y: dst.y + (hash(key, 9) - 0.5) * 50 };
        }
        out.push({ x0: src.x, y0: src.y, x1: dst.x, y1: dst.y, p: pr, col: ch.col, id: ch.id, key });
      }
    });
    return out;
  }

  // できごと（右の欄の説明と、見どころ）
  // cam: [x, y, 横はば nm]（関数ならその時の位置。数だけなら zoom と同じ中心でその横はば）
  // zoom: ルーペで寄る場所 [x, y, 横はば nm]。おまかせカメラは引いたまま、細かいところは左上のルーペで見せる
  function events() {
    const E = [];
    const add = (u, title, body, kind, cam, zoom) => E.push({ u, title, body, kind, cam, zoom });
    // 組み立てを見せる頭（少しあとに生まれるものにして、見どころの間をあける）
    const h0 = () => M.heads.find(h => h.born >= TL.late + 0.8) || M.heads[0];   // buildInside で手前（z=0）にしてある
    const SW = [SITE.x, SITE.y + 110, 650], IN = 800;
    add(0, '人のからだ', '大腸菌は、人や動物の大腸にすんでいる細菌。ここから、おなかの中へ寄っていく（身長 約1.7m → 細菌 約2µm。100万分の1の大きさ）。', 'sure', [0, -2.2e8, 3.6e9]);
    add(u('zoomin', 0.22), 'おなかの中の大腸', '大腸（長さ約1.5m）には細菌がぎっしり。人の体の細菌は全部で約40兆個で、ほとんどがここにいる。', 'est', [0, -6e7, 3.6e8]);
    add(u('zoomin', 0.47), '大腸のかべ', 'かべを切って横から見る。内側は粘膜（小さなくぼみ＝陰窩が並ぶ）、その外に筋肉の層。', 'sure', [0, -0.9e6, 5e6]);
    add(u('zoomin', 0.72), '粘液の層', '上皮の細胞が粘液を出している。内側のかたい層には細菌がほとんど入れず、外側のゆるい層に細菌がすんでいる。', 'sure', [0, -6e4, 3.4e5]);
    add(u('colony', 0), 'たくさんの大腸菌', '粘液の外側の層。大腸菌がべん毛を回して泳いだり、ゆれたりしている（ここでは大腸菌だけ描いている）。黄色い点はファージ。ファージもたくさんいる。', 'sure', [0, 0, 40000]);
    add(u('colony', 0.5), 'この1つに注目', 'まん中の大腸菌（長さ約2µm）と、近くをただよう T4 ファージ1つを追いかける。T4 は自分では泳げず、水の中をただよってぶつかる。', 'sure', [0, 200, 9000]);
    add(u('approach', 0), '細菌に近づく', 'T4 ファージ（約0.2µm）は自分では泳げない。水の中をただよって、大腸菌（約2µm）にぶつかる。', 'sure', [0, 330, 2600]);
    add(u('approach', 0.6), '表面のすぐ上', '水の分子にぶつかられて、ふらふらゆれながら表面へ（ブラウン運動）。6本の長い脚が先に表面にふれる。', 'sure', [SITE.x, SITE.y + 160, 900]);
    if (cond === 'norec') {
      add(u('bind', 0.2), '脚がふれても、くっつかない', 'この細菌は OmpC がなく、LPS の糖の鎖も短い。T4 の脚がつかむ印（受け手）がないので、くっつけずに離れていく。こうした変異で T4 が効かなくなる。', 'sure', SW);
      return E;
    }
    add(u('bind', 0.15), '脚が OmpC にくっつく', '長い脚の先（gp37）が、外膜の OmpC（3つ組の筒のたんぱく）をつかむ。はじめは、はなれることもある。', 'sure', SW);
    add(u('bind', 0.8), '3本目 → 引き金', '6本のうち3本以上がくっつくと、基盤の形が変わりはじめる。ここから後戻りしない。', 'sure', SW);
    add(u('pierce', 0), '基盤が星形に', '基盤が六角形（直径約52nm）から星形（約61nm）に広がり、平たくなる。左上のルーペで基盤を大きく見せる。', 'sure', SW, [SITE.x, SITE.y + 45, 170]);
    add(u('pierce', 0.3), '短い脚がくいこむ', '基盤の下にたたまれていた短い脚 gp12 が約100°まわって下を向き、LPS の内側の糖にしっかりくっつく。', 'sure', SW, [SITE.x, SITE.y + 20, 130]);
    add(u('pierce', 0.42), 'さやが縮む', 'しっぽのさや（6個×23段の gp18）が、基盤の側から1段ずつ縮む（92.5→42nm）。中の管が回りながら押し出される。', 'sure', SW, [SITE.x, SITE.y + 80, 240]);
    add(u('pierce', 0.82), '針が破り、壁を切る', '管の先の針 gp5 が外膜を突きぬけ、外れた針のリゾチームが細胞壁（ペプチドグリカン）を切って道をあける。', 'sure', SW, [SITE.x, SITE.y - 15, 100]);
    add(u('inject', 0), 'DNA が入る', 'DNA（168,903塩基対、のばすと約57µm）が管を通って細菌の中へ。Alt と内部たんぱく約1000個もいっしょに入る。頭は空のぬけがらになる。', 'sure', [SITE.x, SITE.y + 40, 900]);
    add(uMin(0), '細菌の中へ', 'この1本の DNA が設計図になる。ここから、細菌の材料と工場を使って増えていく。オレンジの線が T4 の DNA。', 'sure', [0, 0, 2400]);
    add(uMin(TL.hostStop), '工場の乗っとり', '細菌のリボソーム（たんぱく質の工場、直径約20nm）が、T4 の設計図の写し（mRNA）を読んで T4 のたんぱく質を作りはじめる。細菌自身のたんぱく質はほとんど作られなくなる。', 'sure', IN, () => { const r = M.ribo.find(q => Math.hypot(q.x - SITE.x, q.y - (SITE.y - 150)) < 200) || M.ribo[0]; return [r.x, r.y, 160]; });
    if (cond === 'gt') { add(uMin(0.4), '設計図が切られる', 'DNA にブドウ糖の目印がないので、細菌の制限酵素に切られる。設計図がなくなり、T4 は増えられない（細菌の勝ち）。', 'sure', [SITE.x, SITE.y - 90, IN]); return E; }
    const mc = TL.hostDnaFrom + 1;
    add(uMin(mc), '細菌の DNA をこわす', 'T4 の酵素（EndoII・EndoIV）が、シトシン（C）のある細菌の DNA を切る。T4 の DNA（hmC＋ブドウ糖）は切らない。かけらは T4 の DNA の材料になる。', 'sure', IN, () => { const keep = Math.floor(M.nuc.length * hostLeft(mc)), n = M.nuc[M.nucOrder[keep + 2]]; return [n[0] + 3, n[1] + 3, 80]; });
    const mf = TL.repl + 0.5;
    add(uMin(mf), 'DNA のコピー', '分かれ目に、ほどく係（gp41）・ポリメラーゼ（gp43）・すべる輪（gp45）などが集まり、毎秒約400〜500塩基でコピーする。1本が何十本にもなる。', 'sure', IN, () => { const p = M.loops[0].pts[forkIdx(0, mf)]; return [p[0], p[1], 90]; });
    add(uMin(TL.late), '部品づくり', '後期の遺伝子: 工場から頭の殻（gp23）・しっぽ（gp18・gp19）・脚の部品が大量に作られる。緑の点が頭の部品、紫の点がしっぽの部品。', 'sure', [0, 0, 2400]);
    add(uMin(h0().born + 0.15), '内膜の上で頭の殻ができる', '内膜にささった入口（gp20）を土台に、足場（gp22・はさみ gp21）の芯ができ、そのまわりに殻のたんぱく gp23（約960個）が並ぶ。gp23 は細菌の GroEL と T4 の gp31 の助けで折りたたまれる。', 'sure', IN, () => { const c = headCenter(h0(), h0().born + 0.2); return [c.x, c.y, 200]; });
    add(uMin(h0().born + 0.42), '足場が切られて、殻が離れる', 'はさみ gp21 が足場をばらばらに切り、殻のたんぱくの端も切る。中が空になった殻は内膜から離れる。', 'sure', IN, () => { const c = headCenter(h0(), h0().born + 0.42); return [c.x, c.y, 220]; });
    add(uMin(h0().fs + 0.8), '頭に DNA をつめる', '入口に付いたモーター（gp17）が、長くつながった DNA を頭へ押しこむ（毎秒約700塩基対、約4〜5分）。つめはじめると殻がふくらんで大きく・じょうぶになり、外に飾りの Hoc・Soc が付く。いっぱい（ゲノムの1.02倍）で切る。', 'sure', IN, () => { const p = headPortal(h0()); return [p.x, p.y, 220]; });
    add(uMin(h0().fs + (h0().fe - h0().fs) * 0.5), 'しっぽは別に組み立てる', 'しっぽは頭とは別の場所で、基盤（くさび6つ＋中心）→ 管 gp19 → さや gp18（23段）→ ふた gp3・gp15 の順にできる。', 'sure', IN, () => { const p = tailPos(h0(), 0); return [p.x, p.y + 60, 260]; });
    add(uMin(h0().fe + 0.05), '首ができて、しっぽが付く', 'DNA がつまった頭に首（gp13・gp14）が付くと、できあがったしっぽがひとりでにはまる。', 'sure', IN, () => [h0().x, h0().y + 100, 320]);
    add(uMin(h0().fe + JOIN + 0.15), '長い脚が付く', '長い脚（gp34〜37）も別に組み立てられ、いちばん最後に基盤に付く。首のひげ（フィブリチン）が付けるのを助ける。', 'sure', IN, () => [h0().x, h0().y + 60, 320]);
    add(uMin(17), 'ホリンがたまる', '内膜に穴あけのたんぱく（ホリン）がたまっていく。リゾチームは中にたまるが、内膜を通れない。破れる時刻はホリンが決める。', 'sure', [0, CELL.R - 60, 1000], [0, CELL.R - 30, 220]);
    if (cond === 'lin') add(uMin(7), 'もう1つファージが来る', 'あとから来たファージの DNA は中に入れず、外膜と内膜のあいだに捨てられる（重感染排除）。外にファージがいる合図で、破裂がおくれる（溶菌阻止）。', 'sure', [SECOND.x, SECOND.y, 900]);
    add(uMin(M.tEnd * 0.85), 'たくさん完成', `細菌1つの中にファージがぎっしり。破れるまでに100〜150個（このもしもでは数百）。`, 'sure', [0, 0, 2400]);
    if (segs.find(q => q.id === 'burst')) {
      add(u('burst', 0), '細胞壁が切られる', 'ホリンが決まった時刻にいっせいに内膜に穴をあけ、リゾチームが細胞壁（ペプチドグリカン）を切る。細菌は棒の形を保てなくなってふくらむ。', 'sure', [0, 0, 3600]);
      add(u('burst', 0.22), '破れて中身が出る', '外膜も破れ（スパニンというたんぱくが外膜をこわす）、ファージと細菌の中身がいっせいに外へ。細菌は死に、膜はちぎれたかけらになる。', 'sure', [0, 0, 4200]);
      const c1 = P.cells.filter(c => c.tBurst < Infinity).sort((a, b) => a.tBurst - b.tBurst)[0];
      add(u('spread', 0), 'となりの細菌へ', `出てきたファージ（約${Math.max(80, countsAtEnd())}個）が水の中に広がり、近くの細菌にとりつく。とりつかれた細菌の中でも、同じことがくり返される。`, 'sure', [0, 0, 22000]);
      add(u('spread', END_P), 'こうして増えていく', '1つのファージが、細菌から細菌へうつるたびに何十〜百倍に。締めのまとめを図の上に出す。', 'est', [0, 0, 42000]);
      if (c1) add(u('spread', Math.min(0.85, c1.tBurst / SPREAD_MIN)), 'また破れて、もっと増える', '1つの細菌から100個以上。1回ごとに何十〜百倍になるので、ファージは「ねずみ算」で増え、細菌はへっていく。広がり方は模式。', 'est', [0, 0, 34000]);
    }
    E.sort((a, b) => a.u - b.u);
    return E;
  }

  build('normal');
  return {
    CONDS, build, at, u, uMin, forkIdx, landing, pierce, counts, particles, tailPos, headAt, headCenter, headPortal, hostLeft, events,
    cellPose, colonyCounts, REACH, JOIN, END_P,
    get cond() { return cond; }, get segs() { return segs; }, get M() { return M; }, get P() { return P; }, get total() { return total; },
  };
})();
