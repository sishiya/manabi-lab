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
  let cond = 'normal', segs = [], M = null, total = 1;

  function build(c) {
    cond = c || cond;
    const tEnd = cond === 'lin' ? TL.linLysis : cond === 'gt' ? 3 : 23.5;
    segs = [
      { id: 'approach', name: '近づく', dur: 7 },
      { id: 'bind', name: cond === 'norec' ? 'くっつけない' : 'くっつく', dur: cond === 'norec' ? 9 : 6 },
    ];
    if (cond !== 'norec') {
      segs.push({ id: 'pierce', name: '刺さる', dur: 9 }, { id: 'inject', name: 'DNA が入る', dur: 6 });
      segs.push({ id: 'inside', name: '細菌の中', dur: cond === 'lin' ? 110 : cond === 'gt' ? 10 : 55, tEnd });
      if (cond !== 'gt') segs.push({ id: 'burst', name: '破れて出る', dur: 7 });
    }
    total = segs.reduce((a, s) => a + s.dur, 0);
    let u = 0; for (const s of segs) { s.u0 = u / total; u += s.dur; s.u1 = u / total; }
    M = buildInside(tEnd);
    return segs;
  }

  // スライダーの位置 u（0〜1）→ 区間と、区間の中の進み p
  function at(u) {
    u = Math.max(0, Math.min(1, u));
    let s = segs[segs.length - 1];
    for (const q of segs) if (u <= q.u1) { s = q; break; }
    const p = (u - s.u0) / Math.max(1e-9, s.u1 - s.u0);
    const st = { seg: s, id: s.id, p, u, min: s.id === 'inside' ? p * s.tEnd : s.id === 'burst' ? M.tEnd : s.id === 'approach' || s.id === 'bind' || s.id === 'pierce' || s.id === 'inject' ? 0 : 0 };
    st.label = label(st);
    return st;
  }
  function label(st) {
    switch (st.id) {
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
    if (st.id === 'approach') {
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
        const fs = t + 0.6;
        M.heads.push({ x: p.x, y: p.y, ang: r() * 6.28, born: t, fs, fe: fs + HEADFUL / bp / 60, tx0: q.x, ty0: q.y, tang: r() * 6.28 });
      }
    }
    for (let i = 0; i < 160; i++) { const p = randIn(40); M.lyz.push(p); }
    return M;
  }
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
  function tailPos(h, m) { const k = ease((m - h.fs) / (h.fe - h.fs)); return { x: h.tx0 + (h.x - h.tx0) * k, y: h.ty0 + (h.y - h.ty0) * k, ang: h.tang + (h.ang - h.tang) * k }; }
  const headCenter = h => ({ x: h.x - 172 * Math.sin(h.ang), y: h.y + 172 * Math.cos(h.ang) });
  const headPortal = h => ({ x: h.x - 112 * Math.sin(h.ang), y: h.y + 112 * Math.cos(h.ang) });

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
          const cand = M.heads.filter(h => ch.id === 'shell' ? ts >= h.born && ts < h.fs : ch.id === 'tail' ? ts >= h.fs && ts < h.fe : ts >= h.fe && ts < h.fe + 0.6);
          if (!cand.length) continue;
          const h = cand[Math.floor(hash(key, 5) * cand.length)];
          dst = ch.id === 'shell' ? headCenter(h) : ch.id === 'tail' ? tailPos(h, m) : { x: h.x, y: h.y };
          dst = { x: dst.x + (hash(key, 6) - 0.5) * 50, y: dst.y + (hash(key, 9) - 0.5) * 50 };
        }
        out.push({ x0: src.x, y0: src.y, x1: dst.x, y1: dst.y, p: pr, col: ch.col, id: ch.id });
      }
    });
    return out;
  }

  // できごと（右の欄の説明と、見どころ）。cam: [x, y, 横はば nm]（関数ならその時の位置）
  function events() {
    const E = [];
    const add = (u, title, body, kind, cam) => E.push({ u, title, body, kind, cam });
    const h0 = () => M.heads[0], h3 = () => M.heads[3] || M.heads[0];
    add(0, '細菌に近づく', 'T4 ファージ（約0.2µm）は自分では泳げない。水の中をただよって、大腸菌（約2µm）にぶつかる。', 'sure', [0, 330, 2600]);
    add(u('approach', 0.6), '表面のすぐ上', '水の分子にぶつかられて、ふらふらゆれながら表面へ（ブラウン運動）。6本の長い脚が先に表面にふれる。', 'sure', [SITE.x, SITE.y + 160, 700]);
    if (cond === 'norec') {
      add(u('bind', 0.2), '脚がふれても、くっつかない', 'この細菌は OmpC がなく、LPS の糖の鎖も短い。T4 の脚がつかむ印（受け手）がないので、くっつけずに離れていく。こうした変異で T4 が効かなくなる。', 'sure', [SITE.x, SITE.y + 60, 360]);
      return E;
    }
    add(u('bind', 0.15), '脚が OmpC にくっつく', '長い脚の先（gp37）が、外膜の OmpC（3つ組の筒のたんぱく）をつかむ。はじめは、はなれることもある。', 'sure', [SITE.x, SITE.y + 60, 360]);
    add(u('bind', 0.8), '3本目 → 引き金', '6本のうち3本以上がくっつくと、基盤の形が変わりはじめる。ここから後戻りしない。', 'sure', [SITE.x, SITE.y + 60, 360]);
    add(u('pierce', 0), '基盤が星形に', '基盤が六角形（直径約52nm）から星形（約61nm）に広がり、平たくなる。', 'sure', [SITE.x, SITE.y + 50, 190]);
    add(u('pierce', 0.3), '短い脚がくいこむ', '基盤の下にたたまれていた短い脚 gp12 が約100°まわって下を向き、LPS の内側の糖にしっかりくっつく。', 'sure', [SITE.x, SITE.y + 30, 150]);
    add(u('pierce', 0.42), 'さやが縮む', 'しっぽのさや（6個×23段の gp18）が、基盤の側から1段ずつ縮む（92.5→42nm）。中の管が回りながら押し出される。', 'sure', [SITE.x, SITE.y + 60, 220]);
    add(u('pierce', 0.82), '針が破り、壁を切る', '管の先の針 gp5 が外膜を突きぬけ、外れた針のリゾチームが細胞壁（ペプチドグリカン）を切って道をあける。', 'sure', [SITE.x, SITE.y - 15, 90]);
    add(u('inject', 0), 'DNA が入る', 'DNA（168,903塩基対、のばすと約57µm）が管を通って細菌の中へ。Alt と内部たんぱく約1000個もいっしょに入る。頭は空のぬけがらになる。', 'sure', [SITE.x, SITE.y - 40, 520]);
    add(uMin(0), '細菌の中へ', 'この1本の DNA が設計図になる。ここから、細菌の材料と工場を使って増えていく。', 'sure', [0, 0, 2400]);
    add(uMin(TL.hostStop), '工場の乗っとり', '細菌のリボソーム（たんぱく質の工場、直径約20nm）が、T4 の設計図の写し（mRNA）を読んで T4 のたんぱく質を作りはじめる。細菌自身のたんぱく質はほとんど作られなくなる。', 'sure', () => { const r = M.ribo.find(q => Math.hypot(q.x - SITE.x, q.y - (SITE.y - 150)) < 200) || M.ribo[0]; return [r.x, r.y, 140]; });
    if (cond === 'gt') { add(uMin(0.4), '設計図が切られる', 'DNA にブドウ糖の目印がないので、細菌の制限酵素に切られる。設計図がなくなり、T4 は増えられない（細菌の勝ち）。', 'sure', [SITE.x, SITE.y - 90, 400]); return E; }
    const mc = TL.hostDnaFrom + 1;
    add(uMin(mc), '細菌の DNA をこわす', 'T4 の酵素（EndoII・EndoIV）が、シトシン（C）のある細菌の DNA を切る。T4 の DNA（hmC＋ブドウ糖）は切らない。かけらは T4 の DNA の材料になる。', 'sure', () => { const keep = Math.floor(M.nuc.length * hostLeft(mc)), n = M.nuc[M.nucOrder[keep + 2]]; return [n[0] + 3, n[1] + 3, 60]; });
    const mf = TL.repl + 0.5;
    add(uMin(mf), 'DNA のコピー', '分かれ目に、ほどく係（gp41）・ポリメラーゼ（gp43）・すべる輪（gp45）などが集まり、毎秒約400〜500塩基でコピーする。1本が何十本にもなる。', 'sure', () => { const p = M.loops[0].pts[forkIdx(0, mf)]; return [p[0], p[1], 70]; });
    add(uMin(TL.late), '部品づくり', '後期の遺伝子: 工場から頭の殻（gp23）・しっぽ（gp18・gp19）・脚の部品が大量に作られる。', 'sure', [0, 0, 2400]);
    add(uMin(h0().born + 0.3), '頭の殻ができる', '入口（gp20）のまわりに、足場（gp22）と殻のたんぱく（gp23 が約960個）が集まって頭の殻になる。', 'sure', () => { const c = headCenter(h0()); return [c.x, c.y, 260]; });
    add(uMin(h0().fs + 0.8), '頭に DNA をつめる', '入口に付いたモーター（gp17）が、長くつながった DNA を頭へ押しこむ（毎秒約700塩基対、約4〜5分）。いっぱい（ゲノムの1.02倍）で切る。', 'sure', () => { const p = headPortal(h0()); return [p.x, p.y, 220]; });
    add(uMin(h0().fs + (h0().fe - h0().fs) * 0.7), 'しっぽが付く', 'しっぽは頭とは別に組み立てられ（基盤 → 管 → さや → ふた）、DNA のつまった頭に付く。長い脚が最後に付く。', 'sure', () => { const p = tailPos(h0(), h0().fs + (h0().fe - h0().fs) * 0.7); return [p.x, p.y, 420]; });
    add(uMin(12), 'ホリンがたまる', '内膜に穴あけのたんぱく（ホリン）がたまっていく。リゾチームは中にたまるが、内膜を通れない。', 'sure', [0, CELL.R - 30, 260]);
    if (cond === 'lin') add(uMin(7), 'もう1つファージが来る', 'あとから来たファージの DNA は中に入れず、外膜と内膜のあいだに捨てられる（重感染排除）。外にファージがいる合図で、破裂がおくれる（溶菌阻止）。', 'sure', [SECOND.x, SECOND.y, 600]);
    add(uMin(M.tEnd * 0.85), 'たくさん完成', `細菌1つの中にファージがぎっしり。破れるまでに100〜150個（このもしもでは数百）。`, 'sure', [0, 0, 2400]);
    if (segs.find(q => q.id === 'burst')) add(u('burst', 0), '破れて出る', 'ホリンが決まった時刻にいっせいに穴をあけ、リゾチームが細胞壁を切る。細菌が破れて、ファージが外へ出る。', 'sure', [0, 0, 3600]);
    E.sort((a, b) => a.u - b.u);
    return E;
  }

  build('normal');
  return {
    CONDS, build, at, u, uMin, forkIdx, landing, pierce, counts, particles, tailPos, headCenter, headPortal, hostLeft, events,
    get cond() { return cond; }, get segs() { return segs; }, get M() { return M; }, get total() { return total; },
  };
})();
