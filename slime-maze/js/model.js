// 粘菌のモデル: 伸びて探る（本物の速さ）＋ 管の網の太り・やせ（Physarum ソルバー）＋ エサから広がる物質
// 地図は点と線のグラフ（graph.js の Graph）。迷路のマス目は知らない（将来、道路の地図にもそのまま使える）。
//
// 時間はすべて「本物の時間（時間 h）」、長さは mm で進める。
//  伸びる: 先端は 1時間に約 2 cm（Patino-Ramirez ほか 2019「1時間に数センチ」）。
//          開いた線を、粘菌がいる点から連続して伸びる（両はしから伸びた先端が出会えば1本の管になる）。
//          線ごとに速さを ±25% ばらつかせる（同じ速さで進む機械らしさを消すための演出）。
//          一度通った線には粘液が残り、しばらくさける（Reid ほか 2012）。エサからの物質に気づくと、濃いほうへ伸びる（Ueda ほか 1975 の走化性）。
//  管の太り・やせ: Tero, Kobayashi, Nakagaki (2007) J. Theor. Biol. 244 の式 (5)(6)（無次元）。入口と出口の決め方は step の s.mode
//     Q_ij = D_ij / L_ij · (p_i − p_j)（ハーゲン・ポアズイユ。L は線の長さ ÷ g.unit）、入口から I0 が入り出口から出る
//     dD/dt = |Q| − D（μ=1）、半陰的に D ← (D + δt|Q|)/(1+δt)、はじめの D は [0.5, 1.0] の一様乱数
//   モデルの時間 1 を 1時間とする（Tero 2007「管は数時間でこわれ、作り直される」からの仮定）。
//  物質: エサの所を 1 として、開いた線を通って拡散する（ブドウ糖の拡散係数）。
'use strict';

const Model = {
  FLOOR: 1e-9,       // 行列が解けなくなるのを防ぐための下限
  DT: 0.05,          // 1回の時間（時間 h）
  I0: 1,
  GROW_MM_H: 20,     // 先端の伸びる速さ（mm/時）。Patino-Ramirez ほか 2019「1時間に数センチ」から 2 cm/時
  GONE: 1e-2,        // これより細くなった管は消えて、その線から体が引きあげる（半径はもとの約3割。流れのない管は約4〜5時間でここまでやせる）
  DIFF_M2_S: 6.7e-10,  // ブドウ糖の水の中での拡散係数（m²/秒。教科書の値。寒天の中ではすこし遅い）
  DECAY_LEN_MM: 30,  // 物質は少しずつ分解・吸収されて減る（仮定）。広がりと減りがつりあう長さ（エサから 30 mm で約 1/e。これがないと、長い時間で迷路じゅうが同じ濃さになって、向きが分からなくなる）
  DIFF_BOOST: 100,   // 見やすくするため、物質は本物の100倍の速さで広げる（演出。2026-11-22 ユーザー「伸びる様子を眺めるアプリの本質とは関係ないので、特別にもっと早くていい」）
  C_TH: 0.01,        // 粘菌が気づく濃さ（エサの所を 1 とした割合）。本当の値は分からないので仮定
  CHEM_UP: 1.5, CHEM_DOWN: 0.5,   // 気づいた所では、濃いほうへの線は 1.5 倍の速さで伸び、うすいほうへは 0.5 倍（仮定）
  TRAIL_H: 24,       // 粘液の跡が残る時間（Reid ほか 2012: 一度探した所をさける）。どのくらい残るかは分からないので 1日と仮定

  create(g, foods, seed) {
    const N = g.N, nE = g.nE;
    return {
      g, foods: foods.slice(), rng: makeRng(seed ^ 0x9e3779b9),
      D: new Float64Array(nE), Q: new Float64Array(nE), Qs: new Float64Array(nE),
      fa: new Float64Array(nE), fb: new Float64Array(nE), vk: new Float64Array(nE), // ea 側・eb 側から伸びた割合（0〜1）、速さのばらつき
      reached: new Uint8Array(N), arrive: new Float64Array(N),   // 粘菌がいる点、そこへ着いた時刻
      trailT: new Float64Array(nE),  // その線に最後に粘菌がいた時刻（粘液の跡）
      cs: [new Float64Array(N), new Float64Array(N)],   // エサごとの、広がる物質の濃さ（エサの所 = 1）
      c: new Float64Array(N),        // 全部のエサの物質の和（絵のため）
      p: new Float64Array(N), pPrev: null,
      t: 0, tFlow: 0, blocked: false, maxRate: 0, swap: false, start: -1, growing: false, mode: 'front',
      lump: new Float64Array(N),   // 点ごとの体のかたまり（管にならずに集まっている体の量。エサの上にできることが多いが、エサを動かしても、かたまりはその場に残る）
    };
  },

  L(s, e) { return s.g.len[e] / s.g.unit; },             // 式の中の長さ（無次元）
  has(s, e) { return s.g.open[e] && s.D[e] > 0; },       // 管になった線（どんなに細くても）
  full(s, e) { return s.fa[e] + s.fb[e] >= 1; },
  trail(s, e) { return s.t - s.trailT[e] < Model.TRAIL_H; },
  explored(s, e) { return s.trailT[e] > -1e8; },

  // start の点に1つのかけらを置いて、伸びはじめる（物質はエサを置いたときから広がりはじめる）
  startGrowth(s, start) {
    const g = s.g;
    s.D.fill(0); s.Q.fill(0); s.Qs.fill(0); s.fa.fill(0); s.fb.fill(0); s.reached.fill(0); s.arrive.fill(0);
    s.trailT.fill(-1e9); s.c.fill(0); for (const f of s.cs) f.fill(0);
    s.pPrev = null; s.t = 0; s.tFlow = 0; s.blocked = false; s.maxRate = 0; s.lump.fill(0); s.mode = 'front';
    for (let e = 0; e < g.nE; e++) s.vk[e] = 0.75 + 0.5 * s.rng();
    s.start = start; s.reached[start] = 1; s.growing = true;
  },

  // 物質の拡散（開いた線だけを通る。迷路の壁は通さない）。エサの所はいつも 1
  //   線（通路）の網の上の有限体積の形: 点 i の体積 V_i = Σ 線の長さ/2（断面は共通なので省く）、線の流束 = Dc (c_b − c_a) / 長さ
  //   → 線の長さがそろっていない地図（道路）でも物質の量が保たれる。安定のため、必要なら1回を細かく分けて進める
  diffuse(s, dh) {
    const g = s.g, Dc = Model.DIFF_M2_S * 3600 * 1e6 * Model.DIFF_BOOST;   // mm²/時（演出で速くしている）
    if (!s.dvol || s.dvolOpen !== Model.openSig(g)) {
      s.dvol = new Float64Array(g.N); let kmax = 0;
      const ksum = new Float64Array(g.N);
      for (let e = 0; e < g.nE; e++) { if (!g.open[e]) continue; const h = g.len[e] / 2; s.dvol[g.ea[e]] += h; s.dvol[g.eb[e]] += h; ksum[g.ea[e]] += Dc / g.len[e]; ksum[g.eb[e]] += Dc / g.len[e]; }
      for (let i = 0; i < g.N; i++) if (s.dvol[i] > 0) kmax = Math.max(kmax, ksum[i] / s.dvol[i]);
      s.dkmax = kmax; s.dvolOpen = Model.openSig(g);
    }
    const sub = Math.max(1, Math.ceil(dh * s.dkmax / 0.4)), dt = dh / sub;
    s.c.fill(0);
    s.foods.forEach((food, k) => {
      const c = s.cs[k], d = new Float64Array(g.N);
      for (let it = 0; it < sub; it++) {
        d.fill(0);
        for (let e = 0; e < g.nE; e++) {
          if (!g.open[e]) continue;
          const a = g.ea[e], b = g.eb[e], f = Dc * (c[b] - c[a]) / g.len[e] * dt;
          d[a] += f; d[b] -= f;
        }
        const decay = Math.exp(-Dc / (Model.DECAY_LEN_MM * Model.DECAY_LEN_MM) * dt);   // 減る速さ λ = Dc / 長さ²
        for (let i = 0; i < g.N; i++) if (s.dvol[i] > 0) c[i] = (c[i] + d[i] / s.dvol[i]) * decay;
        c[food] = 1;
      }
      for (let i = 0; i < g.N; i++) s.c[i] += c[i];
    });
  },
  openSig(g) { let h = 0; for (let e = 0; e < g.nE; e++) if (g.open[e]) h = (h * 31 + e) | 0; return h; },
  // エサを置いた・動かしたとき: そのエサの物質は、そこから新しく広がりはじめる
  resetField(s, k) { s.cs[k].fill(0); },

  // 粘菌のいる点 a から、線 e（向こうは b）へ伸びる速さの倍率。0 なら伸びない
  //  まだ伸びはじめていない線は、粘液の跡があればさける。ただし、まだ着いていないエサの物質に気づいていて、向こうのほうが濃ければ伸びる（寄っていく）
  //  2つのエサにつながって食べているあいだは、跡がうすれても前に探した線へはもう出ていかない（Patino-Ramirez ほか 2019: 栄養のある所では探しに出るのがおそい）
  pull(s, e, a, b, started) {
    let sense = false, up = false;
    s.foods.forEach((f, k) => {
      if (s.reached[f]) return;                         // もう着いたエサには、引きよせられない
      const c = s.cs[k];
      if (c[a] >= Model.C_TH) { sense = true; if (c[b] > c[a] && !s.reached[b]) up = true; }
    });
    if (!started && !(sense && up)) {
      if (Model.trail(s, e)) return 0;
      if (Model.explored(s, e) && Model.flowing(s)) return 0;
    }
    return sense ? (up ? Model.CHEM_UP : Model.CHEM_DOWN) : 1;
  },

  // 伸びる（dh 時間ぶん）。両はしの割合の和が 1 になった線は管になる（はじめの太さは [0.5, 1.0] の一様乱数）
  // 伸びた管の体はエサの上のかたまりから出す（かたまりがあれば）
  grow(s, dh) {
    const g = s.g, vmm = Model.GROW_MM_H * dh;
    let any = false;
    for (let e = 0; e < g.nE; e++) {
      if (!g.open[e] || Model.full(s, e)) continue;
      const a = g.ea[e], b = g.eb[e], ra = s.reached[a], rb = s.reached[b];
      if (!ra && !rb) continue;
      const ka = ra ? Model.pull(s, e, a, b, s.fa[e] > 0) : 0, kb = rb ? Model.pull(s, e, b, a, s.fb[e] > 0) : 0;
      if (!ka && !kb) continue;
      any = true;
      const v = vmm / g.len[e] * s.vk[e];
      s.fa[e] += v * ka;
      s.fb[e] += v * kb;
      if (s.fa[e] + s.fb[e] >= 1) {
        const k = s.fa[e] / (s.fa[e] + s.fb[e]); s.fa[e] = k; s.fb[e] = 1 - k;
        s.D[e] = 0.5 + 0.5 * s.rng();
        Model.takeBlob(s, Model.L(s, e) * Math.sqrt(s.D[e]));
        for (const c of [a, b]) if (!s.reached[c]) { s.reached[c] = 1; s.arrive[c] = s.t; }
      }
    }
    for (let e = 0; e < g.nE; e++) if (s.D[e] > 0 || s.fa[e] > 0 || s.fb[e] > 0) s.trailT[e] = s.t;   // いまいる線に粘液が残る
    s.growing = any;
  },
  // 体をかたまりへもどす: 粘菌がいるエサの上（2つなら半分ずつ）。エサの上にいなければ、いまあるかたまりへ（量に合わせて）
  toBlob(s, v) {
    const ins = s.foods.filter(f => s.reached[f]);
    if (ins.length) { for (const f of ins) s.lump[f] += v / ins.length; return; }
    const tot = Model.lumpTotal(s);
    if (tot > 0) for (let i = 0; i < s.g.N; i++) if (s.lump[i] > 0) s.lump[i] += v * s.lump[i] / tot;
  },
  // 伸びた管の体は、かたまりから出す（量に合わせて）
  takeBlob(s, v) {
    const tot = Model.lumpTotal(s); if (!(tot > 0)) return;
    const k = Math.max(0, 1 - v / tot);
    for (let i = 0; i < s.g.N; i++) s.lump[i] *= k;
  },
  lumpTotal(s) { let a = 0; for (let i = 0; i < s.g.N; i++) a += s.lump[i]; return a; },

  // とても細くなった管は消え、体はその線から引きあげる。管も伸びかけもなくなった点には、もう粘菌はいない（エサの上のかたまりは残る）
  retract(s) {
    const g = s.g; let gone = false;
    for (let e = 0; e < g.nE; e++) if (s.D[e] > 0 && s.D[e] < Model.GONE) { s.D[e] = 0; s.fa[e] = 0; s.fb[e] = 0; gone = true; }
    if (!gone) return;
    for (let c = 0; c < g.N; c++) {
      if (!s.reached[c]) continue;
      let keep = s.lump[c] > 0.05;   // かたまりがある点には、粘菌がいる
      for (const e of g.adj[c]) {
        if (keep) break;
        if (s.D[e] > 0 || (g.ea[e] === c && s.fa[e] > 0) || (g.eb[e] === c && s.fb[e] > 0)) keep = true;
      }
      if (!keep) s.reached[c] = 0;
    }
  },

  // 入口 a から I0 を入れ、出口 sinks（1つ以上）から等しく I0/n ずつ出したときの圧力と流量を解く（前処理つき共役勾配法。論文は ICCG）
  // 出口がいくつもあるとき（伸びる先端）は、Almeida (2021) の「入口の流れを、ふちの節（出口）に等しく分ける」と同じ
  solve(s, a, sinks, I0) {
    const g = s.g, N = g.N, C = e => s.D[e] / Model.L(s, e);
    const idx = new Int32Array(N).fill(-1), list = [a]; idx[a] = 0;
    for (let qi = 0; qi < list.length; qi++) for (const e of g.adj[list[qi]]) {
      if (!Model.has(s, e)) continue; const n = Graph.other(g, e, list[qi]); if (idx[n] < 0) { idx[n] = list.length; list.push(n); }
    }
    s.Q.fill(0); s.p.fill(0);
    const out = (Array.isArray(sinks) ? sinks : [sinks]).filter(c => c !== a && idx[c] >= 0);
    if (!out.length) return false;
    const b = out[0];
    // 出口の1つ b の圧力を 0 に固定し（b からは残りが出る）、残りの節で  Σ D/L (p_i − p_j) = 入る量  を解く
    const n = list.length, ib = idx[b], diag = new Float64Array(n), rhs = new Float64Array(n);
    for (let i = 0; i < n; i++) for (const e of g.adj[list[i]]) if (Model.has(s, e)) diag[i] += C(e);
    rhs[idx[a]] = I0; for (let k = 1; k < out.length; k++) rhs[idx[out[k]]] -= I0 / out.length;
    diag[ib] = 1; rhs[ib] = 0;
    const mul = (x, y) => {
      for (let i = 0; i < n; i++) {
        if (i === ib) { y[i] = x[i]; continue; }
        const c = list[i]; let v = diag[i] * x[i];
        for (const e of g.adj[c]) { if (!Model.has(s, e)) continue; const j = idx[Graph.other(g, e, c)]; if (j !== ib) v -= C(e) * x[j]; }
        y[i] = v;
      }
    };
    const x = new Float64Array(n), r = new Float64Array(n), z = new Float64Array(n), pv = new Float64Array(n), Ap = new Float64Array(n);
    if (s.pPrev) for (let i = 0; i < n; i++) if (i !== ib) x[i] = s.pPrev[list[i]]; // 前の答えから始めると速い
    mul(x, Ap); for (let i = 0; i < n; i++) r[i] = rhs[i] - Ap[i];
    for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; pv[i] = z[i]; }
    let rz = 0; for (let i = 0; i < n; i++) rz += r[i] * z[i];
    let r0 = 0; for (let i = 0; i < n; i++) r0 += rhs[i] * rhs[i] / diag[i];
    for (let it = 0; it < 20 * n + 50 && rz > 1e-24 * r0; it++) {
      mul(pv, Ap); let pAp = 0; for (let i = 0; i < n; i++) pAp += pv[i] * Ap[i];
      if (!(pAp > 0)) break;
      const al = rz / pAp;
      for (let i = 0; i < n; i++) { x[i] += al * pv[i]; r[i] -= al * Ap[i]; }
      let rz2 = 0; for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; rz2 += r[i] * z[i]; }
      const be = rz2 / rz; rz = rz2;
      for (let i = 0; i < n; i++) pv[i] = z[i] + be * pv[i];
    }
    for (let i = 0; i < n; i++) s.p[list[i]] = x[i];
    s.pPrev = s.p.slice();
    for (let e = 0; e < g.nE; e++) if (Model.has(s, e)) s.Q[e] = C(e) * (s.p[g.ea[e]] - s.p[g.eb[e]]);
    return true;
  },

  // エサが2つあって、どちらにも粘菌がいるとき（2つのエサのあいだの流れ）
  flowing(s) { return s.foods.length === 2 && s.foods.every(f => s.reached[f]); },

  // 伸びている先端の点（まだ管になっていない線の、粘菌がいる側のはしで、伸びてよいもの）
  fronts(s) {
    const g = s.g, set = new Set();
    for (let e = 0; e < g.nE; e++) {
      if (!g.open[e] || Model.full(s, e)) continue;
      const a = g.ea[e], b = g.eb[e];
      if (s.reached[a] && Model.pull(s, e, a, b, s.fa[e] > 0)) set.add(a);
      if (s.reached[b] && Model.pull(s, e, b, a, s.fb[e] > 0)) set.add(b);
    }
    return [...set];
  },

  // 体の量（管の体積）  Σ L·√D 。断面は半径の2乗 ∝ √D（Almeida 2021 の式 3.41 と同じ形。係数は省く。L は g.unit で割った長さ）
  volume(s) { let V = 0; for (let e = 0; e < s.g.nE; e++) if (Model.has(s, e)) V += Model.L(s, e) * Math.sqrt(s.D[e]); return V; },

  // DT（時間）ぶん進める。流れ方は3とおり（s.mode）
  //  'pair'  … エサが2つ: 一方のエサが入口・もう一方が出口（Tero 2007）。swap で入れかえる（|Q| は同じ）
  //  'front' … エサが1つ以下で、まだ伸びている先端がある: 入口（エサ。着く前はもとのかけら）から、先端へ等しく分かれて流れる
  //            （先端の膜は上流から流れを押しこまれてふくらむ: Le Verge-Serandour & Alim。先端を出口にする: Almeida 2021）。行き止まりで止まった枝は流れがなくなり、やせる
  //  'none'  … 伸びる先がなく、エサも1つ: 流れがなく、管はすべてやせ、やせた分の体はエサの上に集まる（Tero 2007「体のほとんどがエサの上に集まる」）
  step(s) {
    const dt = Model.DT, g = s.g;
    Model.diffuse(s, dt);
    Model.grow(s, dt);
    s.t += dt;
    s.maxRate = 0;
    const foodsIn = s.foods.filter(f => s.reached[f]);
    if (Model.flowing(s)) {
      s.mode = 'pair';
      const ok = Model.solve(s, s.foods[s.swap ? 1 : 0], [s.foods[s.swap ? 0 : 1]], Model.I0);
      s.blocked = !ok;
      if (!ok) { s.mode = 'none'; s.Q.fill(0); }   // つながっていなければ流れはない（管はやせていく）
    } else {
      s.blocked = false;
      const fr = Model.fronts(s);
      let src = foodsIn.length ? foodsIn[0] : s.start;   // 流れの入口: エサ。エサの上にいなければ、いちばん大きいかたまり
      if (!foodsIn.length) { let best = 0; for (let i = 0; i < g.N; i++) if (s.lump[i] > best) { best = s.lump[i]; src = i; } }
      if (fr.length && Model.solve(s, src, fr, Model.I0)) { s.mode = 'front'; if (s.swap) for (let e = 0; e < g.nE; e++) s.Q[e] = -s.Q[e]; }
      else { s.mode = 'none'; s.Q.fill(0); }
    }
    const V0 = Model.volume(s);
    let maxRate = 0;
    for (let e = 0; e < g.nE; e++) {
      if (!Model.has(s, e)) continue;
      const f = Math.abs(s.Q[e]);                       // f(Q) = Q^μ, μ = 1
      const d0 = s.D[e], d1 = Math.max(Model.FLOOR, (d0 + dt * f) / (1 + dt));
      maxRate = Math.max(maxRate, Math.abs(d1 - d0) / dt);
      s.D[e] = d1;
      s.Qs[e] += (Math.abs(s.Q[e]) - s.Qs[e]) * 0.1;    // 粒の速さ用に、ならした流量（表示だけ）
    }
    // やせた管の体はかたまりへ（太った分はかたまりから）。エサにもかたまりにも着く前は、先端へ行ったとして数えない
    if (foodsIn.length || Model.lumpTotal(s) > 0) {
      const dV = Model.volume(s) - V0;
      if (dV < 0) Model.toBlob(s, -dV); else Model.takeBlob(s, dV);
    }
    s.maxRate = maxRate;
    Model.retract(s);
    if (s.mode === 'pair') s.tFlow += dt;
  },

  // 粘菌の管の長さ（mm）  Σ D·長さ / I0 。μ=1 で落ち着くと、最短の道の長さになる
  tubeLength(s) { let L = 0; for (let e = 0; e < s.g.nE; e++) if (Model.has(s, e)) L += s.D[e] * s.g.len[e]; return L / Model.I0; },

  shortest(s) { return s.foods.length === 2 ? Graph.shortest(s.g, s.foods[0], s.foods[1]) : null; },

  // 落ち着いたか（表示のためだけ。時間は止めない）
  settled(s) { return Model.flowing(s) && !s.growing && !s.blocked && s.tFlow > 1 && s.maxRate < 1e-3; },
};
window.Model = Model;
