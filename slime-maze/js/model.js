// 粘菌のモデル: 伸びて探る（本物の速さ）＋ 管の網の太り・やせ（Physarum ソルバー）＋ エサから広がる物質
// 地図は点と線のグラフ（graph.js の Graph）。迷路のマス目は知らない（将来、道路の地図にもそのまま使える）。
//
// 時間はすべて「本物の時間（時間 h）」、長さは mm で進める。
//  伸びる: 縁は 1時間に約 0.9 cm（Tero ほか 2010 の図1で測った。Patino-Ramirez ほか 2019 も「1時間に数センチ」まで）。
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
  GROW_MM_H: 8.5,    // 先端の伸びる速さ（網の線にそって mm/時）。Tero ほか 2010 の図1（17 cm の寒天、東京から 5時間で半径 約4.3 cm・8時間で約7 cm・11時間で約9.5 cm＝縁は約 0.9 cm/時）に、同じ形の「関東」の地図で合わせた（5・8・11時間で 4.4・7.6・10.0 cm。三角の網はジグザグなので、線にそった速さは縁の速さより少し速い）
  GONE: 1e-2,        // これより細くなった管は消えて、その線から体が引きあげる（半径はもとの約3割。流れのない管は約4〜5時間でここまでやせる）
  DIFF_M2_S: 6.7e-10,  // ブドウ糖の水の中での拡散係数（m²/秒。教科書の値。寒天の中ではすこし遅い）
  DECAY_LEN_MM: 40,  // 物質は少しずつ分解・吸収されて減る（仮定）。広がりと減りがつりあう長さ（エサから 40 mm で約 1/e。迷路の中ならどこでも 1% はとどく。これがないと、長い時間で迷路じゅうが同じ濃さになって、向きが分からなくなる）
  DIFF_BOOST: 100,   // 見やすくするため、物質は本物の100倍の速さで広げる（演出。2026-11-22 ユーザー「伸びる様子を眺めるアプリの本質とは関係ないので、特別にもっと早くていい」）
  C_TH: 0.01,        // 粘菌が気づく濃さ（エサの所を 1 とした割合）。本当の値は分からないので仮定
  CHEM_UP: 1.5, CHEM_DOWN: 0.5,   // 気づいた所では、濃いほうへの線は 1.5 倍の速さで伸び、うすいほうへは 0.5 倍（仮定）
  TRAIL_SLOW: 0.2,   // 粘液の跡のある線へは、この倍率でしか伸びない（Reid ほか 2012: 一度探した所をさけるが、跡しかなければ探しまわれる。倍率は仮定）。跡は残りつづける
  SHARE_FULL: 0.2,   // 先端へ流れこむ量が、平均のこの割合より少ないとおそくなる（仮定）。それ以上なら同じ速さ（Tero 2010 の図1: 縁はほぼ円く、同じ速さで広がる）
  // エサが3つ以上のとき: Tero ほか (2010) Science 327 の決まり（PDF で確かめた）。毎回ランダムにエサを1つ入口・別の1つを出口にし、
  //  dD/dt = f(|Q|) − D、f(Q) = Q^γ/(1+Q^γ)。論文の「ふつうの結果」の値 I0 = 2、γ = 1.8
  MULTI_I0: 3, GAMMA: 1.8,   // γ は論文の値。I0 は論文では 2 だが、f(Q) の切りかわり（Q = 1）の意味が網の細かさで変わるので、関東の地図で実験の粘菌の網（長さ・近さ・切れにくさ）に合うように決めた（2: 1.35・0.91・0.72、3: 1.61・0.83・0.91、4: 2.00・0.78・0.97。実験 1.75・0.85・0.86。論文も I0 を大きくすると遠回りの道がふえるとしている）
  GONE_MULTI: 3e-3,  // エサが3つ以上で流れているとき、消える太さ（流れのある管のいちばん太い管に対する割合。半径で約2割）。山の中の町へ1本の管が、流れの来ないあいだに消えないよう GONE より小さく
  SOLVE_MIN: 1e-6,   // これより細い管は、流れの計算から外す（流れはほぼ 0。計算を速くするため）
  MULTI_SUB: 4,      // エサが3つ以上のとき、1回（DT = 3分）を何組に分けて流すか（1組あたり 45秒。本物の往復流は約2分ごと）
  MAX_FOODS: 50,
  // 光（山。地図に g.light があるときだけ）: Tero ほか 2010 は、高い所ほど強い光を当てて粘菌を低い所へ通した（粘菌は光をさける）。
  //  光の当たる線では、伸びる速さが (1 − LIGHT_SLOW·光) 倍になり、管がやせる速さが (1 + LIGHT_DECAY·光) 倍になる（どちらも仮定）
  LIGHT_SLOW: 0.8, LIGHT_DECAY: 2,
  SETTLE_H: 24,      // エサが3つ以上のとき、網の形がこの時間かわらなければ「落ち着いた」とする（表示だけ）
  NET_D: 0.02,       // エサが3つ以上のとき、管の長さに数える太さ（ならした太さ Dm で。これより細い管はやせて消えていくところ）
  DM_TAU: 2,         // エサが3つ以上のとき、太さを何時間でならすか（下の Dm）

  create(g, foods, seed) {
    const N = g.N, nE = g.nE;
    return {
      g, foods: foods.slice(), rng: makeRng(seed ^ 0x9e3779b9),
      D: new Float64Array(nE), Q: new Float64Array(nE), Qs: new Float64Array(nE), Qd: new Float64Array(nE), Dm: new Float64Array(nE),
      fa: new Float64Array(nE), fb: new Float64Array(nE), vk: new Float64Array(nE), // ea 側・eb 側から伸びた割合（0〜1）、速さのばらつき
      reached: new Uint8Array(N), arrive: new Float64Array(N),   // 粘菌がいる点、そこへ着いた時刻
      trailT: new Float64Array(nE),  // その線に最後に粘菌がいた時刻（粘液の跡）
      cs: foods.map(() => new Float64Array(N)),   // エサごとの、広がる物質の濃さ（エサの所 = 1）
      c: new Float64Array(N),        // 全部のエサの物質の和（絵のため）
      p: new Float64Array(N), pPrev: null,
      t: 0, tFlow: 0, blocked: false, maxRate: 0, swap: false, start: -1, growing: false, mode: 'front',
      share: new Float64Array(N).fill(1), src: -1,   // 先端の点に流れこむ量（平均を 1）、流れの入口
      lump: new Float64Array(N),   // 点ごとの体のかたまり（管にならずに集まっている体の量。エサの上にできることが多いが、エサを動かしても、かたまりはその場に残る）
    };
  },

  L(s, e) { return s.g.len[e] / s.g.unit; },             // 式の中の長さ（無次元）
  has(s, e) { return s.g.open[e] && s.D[e] > 0; },       // 管になった線（どんなに細くても）
  full(s, e) { return s.fa[e] + s.fb[e] >= 1; },
  trail(s, e) { return s.trailT[e] > -1e8; },          // 粘液の跡がある（一度粘菌がいた）線
  explored(s, e) { return s.trailT[e] > -1e8; },

  // start の点に1つのかけらを置いて、伸びはじめる（物質はエサを置いたときから広がりはじめる）
  startGrowth(s, start) {
    const g = s.g;
    s.D.fill(0); s.Dm.fill(0); s.Q.fill(0); s.Qs.fill(0); s.fa.fill(0); s.fb.fill(0); s.reached.fill(0); s.arrive.fill(0);
    s.trailT.fill(-1e9); s.c.fill(0); for (const f of s.cs) f.fill(0);
    s.pPrev = null; s.lenHist = []; s.Qd.fill(0); s.t = 0; s.tFlow = 0; s.blocked = false; s.maxRate = 0; s.lump.fill(0); s.mode = 'front';
    for (let e = 0; e < g.nE; e++) s.vk[e] = 0.75 + 0.5 * s.rng();
    s.start = start; s.src = start; s.reached[start] = 1; s.growing = true; s.share.fill(1);
    // かけらの体の量: 迷路の全部の通路を、ふつうの太さの管でうめられるくらい（体の量は、伸びても減っても全体で保つ）
    let M0 = 0; for (let e = 0; e < g.nE; e++) if (g.open[e]) M0 += Model.L(s, e) * Math.sqrt(0.75);
    s.lump[start] = M0; s.M0 = M0;
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
      if (Model.eating(s, food) && c[food] === 1) { for (let i = 0; i < g.N; i++) s.c[i] += c[i]; return; }   // 粘菌が着いたエサの物質は、もう粘菌を引きよせないので、計算を止めて（絵のために）そのまま残す。エサが多いときに軽くするため
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
  // エサの数を変えたとき（物質の濃さの表をエサと同じ数に）
  setFoods(s, foods) { s.foods = foods.slice(); s.cs = s.foods.map(() => new Float64Array(s.g.N)); s.lenHist = []; },
  addFood(s, c) { s.foods.push(c); s.cs.push(new Float64Array(s.g.N)); s.lenHist = []; },
  removeFood(s, i) { s.foods.splice(i, 1); s.cs.splice(i, 1); s.lenHist = []; },
  multi(s) { return s.foods.length >= 3; },
  // ランダムにエサを1つ選ぶ（but と同じものは除く）。s.fw（エサ→重み）があれば重みに比べて（論文のモデルは東京を7つのエサとして重くした）
  pickFood(s, R, but) {
    let tot = 0; for (const f of R) if (f !== but) tot += s.fw && s.fw.has(f) ? s.fw.get(f) : 1;
    let r = s.rng() * tot;
    for (const f of R) { if (f === but) continue; r -= s.fw && s.fw.has(f) ? s.fw.get(f) : 1; if (r <= 0) return f; }
    for (let i = R.length - 1; i >= 0; i--) if (R[i] !== but) return R[i];
    return R[0];
  },
  // 粘菌が「食べている」エサか: 着いていて、エサが3つ以上のときは、管の網（いちばん多くのエサがのっている、管でつながったかたまり）に入っていること。
  //  網から切れて取り残されたエサ（かたまりだけがのっている）は、また物質で引きよせ、網からつなぎ直しに伸びる（取り残された体も、本物なら探しに出て、いずれ合わさる）
  eating(s, f) { return s.reached[f] && (!s.fOn || s.fOn[f]); },
  // 管の網に入っているエサをしるす（s.fOn）。取り残されたエサの数 s.isoN
  linkFoods(s) {
    const g = s.g;
    if (!Model.multi(s)) { s.fOn = null; s.isoN = 0; return; }
    const comp = s._comp || (s._comp = new Int32Array(g.N)); comp.fill(-1);
    let best = -1, bestN = 0, id = 0;
    for (const f of s.foods) {
      if (!s.reached[f] || comp[f] >= 0) continue;
      const q = [f]; comp[f] = id;
      for (let i = 0; i < q.length; i++) for (const e of g.adj[q[i]]) { if (!Model.has(s, e)) continue; const o = Graph.other(g, e, q[i]); if (comp[o] < 0) { comp[o] = id; q.push(o); } }
      let n = 0; for (const h of s.foods) if (comp[h] === id) n++;
      if (n > bestN) { bestN = n; best = id; }
      id++;
    }
    const on = s.fOn || (s.fOn = new Uint8Array(g.N)); on.fill(0); s.isoN = 0;
    for (const f of s.foods) { if (s.reached[f] && comp[f] === best) on[f] = 1; else if (s.reached[f]) s.isoN++; }
  },

  // 粘菌のいる点 a から、線 e（向こうは b）へ伸びる速さの倍率。0 なら伸びない
  //  まだ伸びはじめていない線は、粘液の跡があればさける。ただし、まだ着いていないエサの物質に気づいていて、向こうのほうが濃ければ伸びる（寄っていく）
  //  2つのエサにつながって食べているあいだは、跡がうすれても前に探した線へはもう出ていかない（Patino-Ramirez ほか 2019: 栄養のある所では探しに出るのがおそい）
  pull(s, e, a, b, started) {
    let sense = false, up = false;
    s.foods.forEach((f, k) => {
      if (Model.eating(s, f)) return;                   // もう食べているエサには、引きよせられない（網から取り残されたエサには、また引きよせられる）
      const c = s.cs[k];
      if (c[a] >= Model.C_TH) { sense = true; if (c[b] > c[a] && !s.reached[b]) up = true; }
    });
    let k = sense ? (up ? Model.CHEM_UP : Model.CHEM_DOWN) : 1;
    if (!started && !(sense && up) && Model.trail(s, e)) {
      if (s.foods.some(f => s.reached[f]) && !s.blocked) return 0;   // エサの上にいて（食べていて）気配もなければ、跡のある所へ探しに出ない（Tero 2007: 体はエサの上に集まる）。
      //  ただし、いるエサどうしが管でつながっていない（blocked）ときは、つなぎ直すために、跡のある所へもゆっくり探しに出る
      k *= Model.TRAIL_SLOW;            // エサがなければ、跡のある所へも、ゆっくり探しに出る
    }
    return k;
  },

  // 伸びる（dh 時間ぶん）。両はしの割合の和が 1 になった線は管になる（はじめの太さは [0.5, 1.0] の一様乱数）
  // 伸びた管の体はエサの上のかたまりから出す（かたまりがあれば）
  grow(s, dh) {
    const g = s.g, vmm = Model.GROW_MM_H * dh;
    let any = false;
    const mass = Model.lumpTotal(s) > 1e-3 ? 1 : 0;   // 体（かたまり）が尽きたら伸びられない
    // 先端の速さ: 流れが来ている先端は、どれもほぼ同じ速さで進む（Tero ほか 2010 の図1: 縁はつながったまま、ほぼ円く、5〜11時間で一定の速さで広がる）。
    //  流れがほとんど来ない先端（入口から来る量が平均の SHARE_FULL 倍より少ない）は、それに比べておそくなり、来なければ止まる
    const sp = i => mass * Math.min(1, s.share[i] / Model.SHARE_FULL);
    for (let e = 0; e < g.nE; e++) {
      if (!g.open[e] || Model.full(s, e)) continue;
      const a = g.ea[e], b = g.eb[e], ra = s.reached[a], rb = s.reached[b];
      if (!ra && !rb) continue;
      const ka = ra ? Model.pull(s, e, a, b, s.fa[e] > 0) * sp(a) : 0, kb = rb ? Model.pull(s, e, b, a, s.fb[e] > 0) * sp(b) : 0;
      if (!(ka > 0) && !(kb > 0)) continue;
      any = true;
      const v = vmm / g.len[e] * (g.light ? 1 - Model.LIGHT_SLOW * g.light[e] : 1);   // 線ごとのばらつき（演出）をかける。物質へ寄る 1.5 倍とあわせても CHEM_UP 倍まで。光の当たる所はおそい
      s.fa[e] += v * Math.min(Model.CHEM_UP, ka * s.vk[e]);
      s.fb[e] += v * Math.min(Model.CHEM_UP, kb * s.vk[e]);
      if (s.fa[e] + s.fb[e] >= 1) {
        const k = s.fa[e] / (s.fa[e] + s.fb[e]); s.fa[e] = k; s.fb[e] = 1 - k;
        s.D[e] = 0.5 + 0.5 * s.rng(); s.Dm[e] = s.D[e];
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
    if (tot > 0) { for (let i = 0; i < s.g.N; i++) if (s.lump[i] > 0) s.lump[i] += v * s.lump[i] / tot; }
    else if (s.src >= 0) s.lump[s.src] += v;   // かたまりがなければ、流れの入口（体の中心）へ
  },
  // 伸びた管の体は、かたまりから出す（量に合わせて）
  takeBlob(s, v) {
    const tot = Model.lumpTotal(s); if (!(tot > 0)) return;
    const k = Math.max(0, 1 - v / tot);
    for (let i = 0; i < s.g.N; i++) s.lump[i] *= k;
  },
  // 管でエサとつながっているかたまりは、エサの上へ寄せる（体は1つにつながっている。つながっていないかたまりは、その場に残る）
  gather(s) {
    const g = s.g, ins = s.foods.filter(f => s.reached[f]); if (!ins.length) return;
    const seen = new Uint8Array(g.N), q = [];
    for (const f of ins) { seen[f] = 1; q.push(f); }
    for (let qi = 0; qi < q.length; qi++) for (const e of g.adj[q[qi]]) { if (!Model.has(s, e)) continue; const n = Graph.other(g, e, q[qi]); if (!seen[n]) { seen[n] = 1; q.push(n); } }
    let moved = 0;
    for (let i = 0; i < g.N; i++) if (seen[i] && s.lump[i] > 0 && !ins.includes(i)) { moved += s.lump[i]; s.lump[i] = 0; }
    if (moved) for (const f of ins) s.lump[f] += moved / ins.length;
  },
  lumpTotal(s) { let a = 0; for (let i = 0; i < s.g.N; i++) a += s.lump[i]; return a; },

  // とても細くなった管は消え、体はその線から引きあげる。管も伸びかけもなくなった点には、もう粘菌はいない（エサの上のかたまりは残る）
  retract(s) {
    const g = s.g; let gone = false;
    // エサが3つ以上: 毎回ランダムな1組だけに流すので、エサが多いと、町へ1本だけの管には流れがたまにしか来ず、太さが大きくゆれる。
    //  そのゆれは計算のしかた（往復流の代わりにランダムな組を使う）から来るので、消えるかどうかは、ならした太さ Dm で決める（Tero 2007「管は流れがないと数時間でこわれる」）
    //  エサが3つ以上のとき、消える太さは、いちばん太い管の GONE 倍（半径で約3割）。エサが多いと、どの組にも流れはたまにしか来ないので、
    //  どの管もエサ2つのときより細い（Tero 2010 のモデルには消える太さはない。消えるのは、このアプリの決まり）
    const multi = Model.multi(s), dv = multi ? s.Dm : s.D;
    //  いちばん太い管は、流れが来ている管（ならした流量 Qs がある管）の中で見る。つなぎ直しに伸びたばかりの管は、太く生まれるがまだ流れがないので入れない
    //  （入れると、くらべる太さが急に上がって、網の細い枝が消え、また取り残しが出る、をくり返した）
    let ref = 1; if (multi && s.mode === 'pair') { ref = 0; for (let e = 0; e < g.nE; e++) if (s.D[e] > 0 && s.Qs[e] > 1e-3 && dv[e] > ref) ref = dv[e]; ref = Math.min(1, ref) || 1; }
    const thr = multi && s.mode === 'pair' ? Model.GONE_MULTI * ref : Model.GONE;
    for (let e = 0; e < g.nE; e++) if (s.D[e] > 0 && dv[e] < thr) { s.D[e] = 0; s.Dm[e] = 0; s.fa[e] = 0; s.fb[e] = 0; gone = true; }
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

  // 入口 a から I0 を入れ、出口 sinks（1つ以上。どれも圧力 0）から出したときの圧力と流量を解く（前処理つき共役勾配法。論文は ICCG）
  // 出口がいくつもあるとき（伸びる先端）は、どの先端も圧力 0 にする: 太く短い管でつながった先端ほど多く流れこむ（先端どうしの取りあい）。
  //  Almeida (2021) は等しく分けたが、先端の膜は上流から押しこまれた流れでふくらむ（Le Verge-Serandour & Alim）ので、流れこむ量は管しだいとした
  solve(s, a, sinks, I0) {
    const g = s.g, N = g.N, C = e => s.D[e] / Model.L(s, e), use = e => Model.has(s, e) && s.D[e] > Model.SOLVE_MIN;   // ほとんど閉じた管（SOLVE_MIN 以下）は流れに入れない（解きにくくなるだけで、流れはほぼ 0）
    const idx = new Int32Array(N).fill(-1), list = [a]; idx[a] = 0;
    for (let qi = 0; qi < list.length; qi++) for (const e of g.adj[list[qi]]) {
      if (!use(e)) continue; const n = Graph.other(g, e, list[qi]); if (idx[n] < 0) { idx[n] = list.length; list.push(n); }
    }
    s.Q.fill(0); s.p.fill(0);
    s.comp = new Uint8Array(N); for (const c of list) s.comp[c] = 1;   // 入口とつながっている点
    const out = (Array.isArray(sinks) ? sinks : [sinks]).filter(c => c !== a && idx[c] >= 0);
    if (!out.length) return false;
    // 出口の圧力を 0 に固定し、残りの節で  Σ D/L (p_i − p_j) = 入る量  を解く
    const n = list.length, fixed = new Uint8Array(n), diag = new Float64Array(n), rhs = new Float64Array(n);
    for (const c of out) fixed[idx[c]] = 1;
    for (let i = 0; i < n; i++) for (const e of g.adj[list[i]]) if (use(e)) diag[i] += C(e);
    rhs[idx[a]] = I0;
    for (let i = 0; i < n; i++) if (fixed[i]) { diag[i] = 1; rhs[i] = 0; }
    // となりの表（行ごとに、となりの番号と D/L）を1回だけ作る。くり返しの中は配列を読むだけにする（速さのため）
    const rs = new Int32Array(n + 1), cj = [], cv = [];
    for (let i = 0; i < n; i++) {
      rs[i] = cj.length;
      if (!fixed[i]) { const c = list[i]; for (const e of g.adj[c]) { if (!use(e)) continue; const j = idx[Graph.other(g, e, c)]; if (!fixed[j]) { cj.push(j); cv.push(C(e)); } } }
    }
    rs[n] = cj.length;
    const CJ = Int32Array.from(cj), CV = Float64Array.from(cv);
    const mul = (x, y) => {
      for (let i = 0; i < n; i++) {
        if (fixed[i]) { y[i] = x[i]; continue; }
        let v = diag[i] * x[i];
        for (let k = rs[i], k1 = rs[i + 1]; k < k1; k++) v -= CV[k] * x[CJ[k]];
        y[i] = v;
      }
    };
    const x = new Float64Array(n), r = new Float64Array(n), z = new Float64Array(n), pv = new Float64Array(n), Ap = new Float64Array(n);
    if (s.pPrev) for (let i = 0; i < n; i++) if (!fixed[i]) x[i] = s.pPrev[list[i]]; // 前の答えから始めると速い
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
    for (let e = 0; e < g.nE; e++) if (use(e)) s.Q[e] = C(e) * (s.p[g.ea[e]] - s.p[g.eb[e]]);
    return true;
  },

  // 粘菌がいるエサが2つ以上のとき（エサとエサのあいだの流れ）
  flowing(s) { let n = 0; for (const f of s.foods) if (s.reached[f]) n++; return n >= 2; },

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
    Model.linkFoods(s);
    const foodsIn = s.foods.filter(f => s.reached[f]), foodsOn = s.fOn ? foodsIn.filter(f => s.fOn[f]) : foodsIn;
    const multi = Model.multi(s);
    // 管の太さを dtt 時間ぶん進める（dD/dt = f(|Q|) − D）
    let maxRate = 0, V0 = 0, did = false;
    const upd = dtt => {
      if (!did) { V0 = Model.volume(s); did = true; }
      const sig = multi && s.mode === 'pair';
      for (let e = 0; e < g.nE; e++) {
        if (!Model.has(s, e)) continue;
        const q = Math.abs(s.Q[e]), f = sig ? Math.pow(q, Model.GAMMA) / (1 + Math.pow(q, Model.GAMMA)) : q;   // エサ2つ: f(Q) = Q^μ, μ = 1（Tero 2007）。3つ以上: シグモイド（Tero 2010）
        const d0 = s.D[e], d1 = Math.max(Model.FLOOR, (d0 + dtt * f) / (1 + dtt * (g.light ? 1 + Model.LIGHT_DECAY * g.light[e] : 1)));   // 光の当たる管は早くやせる
        maxRate = Math.max(maxRate, Math.abs(d1 - d0) / dtt);
        s.D[e] = d1;
        s.Dm[e] += (d1 - s.Dm[e]) * dtt / Model.DM_TAU;   // ならした太さ（エサが3つ以上のときに使う）
        s.Qs[e] += (Math.abs(s.Q[e]) - s.Qs[e]) * 0.1 * dtt / dt;    // 粒の速さ用に、ならした流量（表示だけ）
        s.Qd[e] += (s.Q[e] - s.Qd[e]) * 0.1 * dtt / dt;              // 粒の向き用に、ならした向きつきの流量（表示だけ）
      }
    };
    if (Model.flowing(s)) {
      s.mode = 'pair';
      s.share.fill(1);   // エサとエサのあいだを流れているときも、まだ探していない通路へはふつうの速さで伸びる（跡のある所へは出ない）
      let ok;
      if (!multi) ok = Model.solve(s, s.foods[s.swap ? 1 : 0], [s.foods[s.swap ? 0 : 1]], Model.I0);
      else {
        // Tero 2010: 粘菌のいるエサから、ランダムに入口と出口を1つずつ。つながっていない組なら、別の組をためす。
        //  1回（DT）を MULTI_SUB に分けて、それぞれ別の組で流す（論文の「1回ごとに1組」の1回を短くしただけ。エサが多いと、町へ1本だけの管には
        //  何時間も流れが来ないことがあり、そのあいだに消えてしまっていた。1回を短くすると、組の選ばれ方のむらが小さくなる）
        const R = foodsOn.length >= 2 ? foodsOn : foodsIn.slice(), K = s.foods.every(f => s.reached[f]) ? Model.MULTI_SUB : 1; ok = false;   // 全部のエサに着くまで（広がっているあいだ）は管が多く計算が重いので1組
        for (let k = 0; k < K; k++) {
          let okk = false;
          for (let tries = 0; tries < 2 * R.length && !okk; tries++) {
            const a = Model.pickFood(s, R, -1), b = Model.pickFood(s, R, a);
            okk = Model.solve(s, a, [b], Model.MULTI_I0);
          }
          if (!okk) s.Q.fill(0);
          ok = ok || okk;
          upd(dt / K);
        }
      }
      s.blocked = !ok;
      if (!ok) { s.mode = 'none'; s.Q.fill(0); }   // つながっていなければ流れはない（管はやせていく）
    } else {
      s.blocked = false;
      const fr = Model.fronts(s);
      let src = foodsIn.length ? foodsIn[0] : s.start;   // 流れの入口: エサ。エサの上にいなければ、いちばん大きいかたまり
      if (!foodsIn.length) { let best = 0; for (let i = 0; i < g.N; i++) if (s.lump[i] > best) { best = s.lump[i]; src = i; } }
      s.src = src; s.share.fill(1);
      if (fr.length && Model.solve(s, src, fr, Model.I0)) {
        s.mode = 'front';
        // 先端の点に流れこむ量（先端の数で割った平均を 1 とする）。入口そのものが先端なら 1
        const fin = fr.filter(f => f !== src && s.comp[f]);
        for (const f of fin) {
          let q = 0; for (const e of g.adj[f]) if (Model.has(s, e)) q += g.eb[e] === f ? s.Q[e] : -s.Q[e];
          s.share[f] = Math.max(0, q) * fin.length / Model.I0;
        }
        if (s.swap) for (let e = 0; e < g.nE; e++) s.Q[e] = -s.Q[e];
      }
      else { s.mode = 'none'; s.Q.fill(0); }
    }
    if (!did) upd(dt);   // エサが3つ以上で流れているとき以外は、1回ぶんまとめて
    // やせた管の体はかたまりへ（太った分はかたまりから）。エサにもかたまりにも着く前は、先端へ行ったとして数えない
    if (foodsIn.length || Model.lumpTotal(s) > 0) {
      const dV = Model.volume(s) - V0;
      if (dV < 0) Model.toBlob(s, -dV); else Model.takeBlob(s, dV);
    }
    s.maxRate = maxRate;
    Model.gather(s);
    Model.retract(s);
    if (s.mode === 'pair') s.tFlow += dt;
    // 落ち着いたかを見るための管の長さの記録（1時間ごと）
    if (!s.lenHist) s.lenHist = [];
    //  エサが3つ以上のときの網の形（管の本数）を1時間ごとに残す
    if (Math.floor(s.t + 1e-9) !== Math.floor(s.t - dt + 1e-9)) { let n = 0; for (let e = 0; e < g.nE; e++) if (Model.has(s, e)) n++; s.lenHist.push(n); if (s.lenHist.length > Model.SETTLE_H) s.lenHist.shift(); }   // 管の本数（網の形）。長さは毎回の組で数%ゆれるので使わない
  },

  // 粘菌の管の長さ（mm）  Σ D·長さ / I0 。μ=1 で落ち着くと、最短の道の長さになる
  //  エサが3つ以上のときは、ある太さ（NET_D）より太い管の長さの和
  tubeLength(s) {
    let L = 0;
    if (Model.multi(s)) { for (let e = 0; e < s.g.nE; e++) if (Model.has(s, e) && s.Dm[e] >= Model.NET_D && s.Qs[e] > 1e-3) L += s.g.len[e]; return L; }   // 流れが来ている管だけ（つなぎ直しに伸びている管は、網ではなく探しているところ）
    for (let e = 0; e < s.g.nE; e++) if (Model.has(s, e)) L += s.D[e] * s.g.len[e]; return L / Model.I0;
  },

  // 比べる目安: エサ2つならいちばん短い道、3つ以上なら全部をいちばん短くつなぐ網（最小全域木。Tero 2010 も MST と比べた）
  shortest(s) { return s.foods.length === 2 ? Graph.shortest(s.g, s.foods[0], s.foods[1]) : s.foods.length >= 3 ? Graph.mst(s.g, s.foods) : null; },

  // 落ち着いたか（表示のためだけ。時間は止めない）
  settled(s) {
    if (!Model.multi(s)) return Model.flowing(s) && !s.growing && !s.blocked && s.tFlow > 1 && s.maxRate < 3e-3;
    // エサが3つ以上: 毎回入口と出口が変わるので、太さはいつもゆれる（1時間ならしても1〜2割）。
    //  そこで「網の形」で見る: 全部のエサに着いて、管の本数が SETTLE_H 時間かわらなければ
    const h = s.lenHist || [];
    if (!s.foods.every(f => s.reached[f]) || s.growing || s.blocked || h.length < Model.SETTLE_H) return false;
    return h[0] > 0 && h.every(v => v === h[0]);   // 管の本数が SETTLE_H 時間かわらない
  },   // 細かい網では、長さの近い道どうしの決着がとてもおそい（Tero 2007: μ=1 では道の選ばれ方がおそい）ので、少しゆるめに
};
window.Model = Model;
