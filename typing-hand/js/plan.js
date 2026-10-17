// ②④ 打つ計画: 運指から手首の動きと指先の目標を決め、毎コマの姿勢（poseAt）を作る。
// 「ピアノを弾く手」（piano-hand、commit a25440d）の js/hand.js の後半を写したもの。キーボードに合わせて変えた所は「タイピング:」の印。
// 値の多くはピアノの研究や、ピアノを弾く手で決めた目安のまま（タイピングで測った値ではない）。
'use strict';
// 運指の選び方（v043〜、ユーザーの方針）: true = 一般的な運指（曲の refR・refL ＝教本や定番の版に書かれた指、または楽譜ファイルに書かれた指）で弾く。
// 書かれていない音はコンピュータが選ぶ。false = コンピュータの推定で弾き、一般的な運指はくらべる用（n.ref）
let FG_STD = true;
// 曲全体: 右手・左手の計画と、すべての音。
// 一般的な運指で弾いて、この手の大きさでは届かずに押せなかった音があれば、その音と前後2音の指だけコンピュータに選び直させる
// （n.alt。子どもの手などで運指が変わる所）。押せなかった音が減るときだけ採る（2回まで）
function buildPlan(song) {
  let plan = buildPlanWith(song, null);
  const nMiss = p => p.notes.filter(n => n.miss).length;
  for (let k = 0; FG_STD && k < 2; k++) {
    if (!plan.notes.some(n => n.miss && n.std)) break;
    const free = new Set(plan.free);
    for (const h of plan.hands) h.notes.forEach((n, i) => {
      if (n.miss && n.std) for (let j = Math.max(0, i - 2); j <= i + 2 && j < h.notes.length; j++) free.add(h.notes[j].key);
    });
    const p2 = buildPlanWith(song, free);
    if (nMiss(p2) < nMiss(plan)) plan = p2; else break;
  }
  for (const n of plan.notes) if (n.alt && sameFing(n)) { n.alt = false; n.std = true; } // 選び直しても同じ指になった音は「変えた」にしない
  return plan;
}
function buildPlanWith(song, free) {
  const notes = song.notes ? song.notes.map(n => Object.assign({}, n)) : parseSong(song);
  notes.sort((a, b) => a.t0 - b.t0 || a.m - b.m);
  for (const n of notes) n.t1n = n.t1; // 楽譜の上での音の終わり（指を早く離しても、音はここまで）
  const hands = [];
  for (const side of [1, -1]) {
    const hn = notes.filter(n => (n.hand || 'R') === (side > 0 ? 'R' : 'L'));
    // 一般的な運指（n.ref）: 曲の refR・refL を手ごとに音の順に（0 は書かれていない音）。楽譜ファイルに書かれた指（n.given）もそう
    const ref = parseRef(side > 0 ? song.refR : song.refL);
    hn.forEach((n, i) => {
      n.key = (side > 0 ? 'R' : 'L') + i;
      if (ref[i] && ref[i][0]) { n.ref = ref[i][0]; if (ref[i][1] !== ref[i][0]) n.refH = ref[i][1]; } // refH: 押さえたままかえた先の指
      const want = n.given || n.ref, wantH = n.given ? n.givenHold : n.refH;
      if (!FG_STD || !want) return;
      n.ref = want; n.refH = wantH || 0;
      if (free && free.has(n.key)) { n.given = 0; n.givenHold = 0; n.alt = true; } else { n.given = want; n.givenHold = wantH || 0; n.std = true; }
    });
    if (hn.length) hands.push(buildHandPlan(hn, side));
  }
  // ペダル（秒）: 曲の文字列の拍（parsePedal）か、楽譜ファイルから読んだ秒（song.pedalSec）。
  // 踏んでいる間に離した音は、ペダルを上げるまで鳴りつづける（n.ts = 音が止まる時刻）。同じ鍵をまた押したらそこで止まる
  const pedal = song.pedalSec || parsePedal(song);
  for (const n of notes) {
    let ts = Math.max(n.t1, n.t1n || n.t1);
    for (const [a, c] of pedal) if (a <= n.t1 + 1e-3 && c > n.t1) ts = Math.max(ts, c);
    const again = notes.find(o => o !== n && o.m === n.m && o.t0 > n.t0 + 1e-3);
    if (again) ts = Math.min(ts, Math.max(n.t1, again.t0));
    // つなげて弾く（次の音がすぐ続く）音は、次の音が鳴るまで音を切らない（指を上げ下げするすき間で音がとぎれないように）
    const nx = notes.find(o => o.hand === n.hand && o.t0 > n.t0 + 1e-3 && o.m !== n.m);
    if (nx && nx.t0 - (n.t1n || n.t1) < 0.08 && nx.t0 > ts) ts = Math.min(nx.t0 + 0.02, again ? again.t0 : Infinity);
    n.ts = ts;
  }
  // 弾き終えたあと: 手首を止める時刻（最後に離した時刻）
  for (const h of hands) h.tHold = h.end;
  // 届かずに押せなかった音: 鍵を押しこみおえる時刻に、指先（指の腹の中心）が押す場所から MISS_MM より離れていた音。
  // 届くように数値を合わせることはしない（骨の長さ・関節の範囲で届かなければ、押せなかったという結果にする）
  for (const h of hands) for (const n of h.notes) {
    const P = poseAt(h, Math.min(n.t1, n.t0 + TK));
    n.short = P.fingers[n.f].err; n.miss = n.short > MISS_MM;
  }
  const end = Math.max(0, ...notes.map(n => n.t1));
  // 再生の終わり（v045〜）: 光の粒ともや（離してから約 1.1 秒）・ペダルでのびた音の光（＋0.4 秒）が消えおえ、少し余韻をおくまで
  const tFin = Math.max(end, ...notes.map(n => Math.max((n.t1n || n.t1) + 1.2, (n.ts || n.t1) + 0.5))) + 0.6;
  return { song, notes, hands, end, tFin, pedal, free: free ? [...free] : [], cost: hands.reduce((s, h) => s + h.cost, 0) };
}

// 片手の運指から、手を動かす計画を作る
function buildHandPlan(notes, side) {
  const cost = planFingering(notes, side);
  // 届かない和音から外した音は、手で弾かない音（hand 'X'）にする
  for (const n of notes) if (n.drop) n.hand = 'X';
  notes = notes.filter(n => !n.drop);
  // 指の構えは選んだもの1つ（v026〜）。曲に合わせて自動で切りかえる方式は試したが、重く（1曲 最大 21 秒）結果もまちまちだったので外した
  // （DEVNOTES「指の構え」。ユーザーの本当の気がかりは「押していない指先に力が入りすぎて見える」ことで、リラックスの要素を先に入れる）
  const k = Math.max(0, POSTURES.findIndex(q => q.id === POSTURE));
  for (const n of notes) n.post = k;
  return planWithPosture(notes, side, cost);
}
function planWithPosture(notes, side, cost) {
  // 同じ指・同じ鍵で続けて押すときは、前の音を早めに離す（指を上げる時間）
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    // のばしている音は押さえたままにするが、手が届かないほど遠く（1オクターブ＋全音より遠く）へ次の音が来たら離す
    for (let j = i + 1; j < notes.length; j++) {
      const o = notes[j];
      if (o.t0 >= n.t1) break;
      if (o.t0 > n.t0 + 0.03 && keyDist(o.m, n.m) > 190) { n.t1 = Math.min(n.t1, o.t0 - 0.02); break; } // タイピング: 半音の数の代わりにキーの距離（mm）
    }
    for (let j = i + 1; j < notes.length; j++) {
      const o = notes[j];
      if (o.f === (n.fh || n.f)) { n.t1 = Math.min(n.t1, o.t0 - 0.09); break; } // 押さえたまま指をかえた音は、かえた先の指
    }
    for (let j = i + 1; j < notes.length; j++) {
      if (notes[j].m === n.m) { n.t1 = Math.min(n.t1, notes[j].t0 - 0.06); break; }
    }
    n.t1 = Math.max(n.t1, n.t0 + 0.03);
    const pv = notes[i - 1], nx = notes[i + 1];
    n.deep = n.f === 1 && !isBlack(n.m) && ((pv && isBlack(pv.m)) || (nx && isBlack(nx.m)));
    n.P = pressPoint(n.m, n.f, n);
  }
  // 次の音で手が大きく動くときは、間に合うように早めに離す（本物の演奏でも、跳ぶ前の音は少し短くなる）。
  // 動く時間の目安 = 0.08 秒 + 手の位置の動き ÷ 600mm/秒（この検証で決めた値）
  const anchorX = n => n.P[0] - tipN(n.f, n.post)[0] * side;
  for (const n of notes) {
    const nxt = notes.filter(o => o.t0 > n.t0 + 0.03);
    if (!nxt.length) continue;
    const t2 = Math.min(...nxt.map(o => o.t0)), ev2 = nxt.filter(o => o.t0 - t2 < 0.03);
    if (n.t1 < t2 - 0.3) continue;
    const shift = Math.abs(ev2.reduce((s, o) => s + anchorX(o), 0) / ev2.length - anchorX(n));
    const need = 0.08 + shift / 600;
    // 指は早めに離しても、音は楽譜どおりつなげる（n.t1n と n.ts。早めに離した分で音を切ると、音階がぶつ切れに聞こえた）
    if (shift > KB.W * 1.5 && n.t1 > t2 - need) n.t1 = Math.max(n.t0 + Math.min(0.12, (t2 - n.t0) * 0.5), t2 - need);
  }
  // 打鍵のしかた（STROKE）: 'wrist' なら、片手で同時に押す音（和音・オクターブ）は手首から打つ。指の形を保ったまま手ごと上げ下げし、
  // 指自身の上げ下げは小さく（lift）。'finger' ならすべて指で打つ
  // 'arm'（v028〜、ユーザーの希望: 肘から腕ごと上げて弾く人もいる）: 和音に加えて、前の音を離してから ARM_GAP 秒以上あく音と、
  // 前の音の打鍵から ARM_SLOW 秒以上あくゆっくりの音も、腕ごと上げて重さを落とすように打つ
  for (const n of notes) {
    const chord = notes.some(o => o !== n && Math.abs(o.t0 - n.t0) < 0.03), prev = notes.filter(o => o.t0 < n.t0 - 0.03);
    const gap = n.t0 - Math.max(-Infinity, ...prev.map(o => o.t1)), ioi = n.t0 - Math.max(-Infinity, ...prev.map(o => o.t0));
    n.wrist = (STROKE === 'wrist' && chord) || (STROKE === 'arm' && (chord || gap >= ARM_GAP || ioi >= ARM_SLOW));
  }
  // 曲の速さ（この手の音の間隔）から、持ち上げの高さと始める時刻。いちばん高い所は約1音前（Dalla Bella & Palmer 2011: 音の間隔の 100〜123% 前）
  const onsets = [...new Set(notes.map(n => Math.round(n.t0 * 100) / 100))].sort((a, b) => a - b);
  for (const n of notes) {
    const k = onsets.findIndex(o => Math.abs(o - n.t0) < 0.015);
    const ioi = Math.min(2, Math.max(0.06, k > 0 ? n.t0 - onsets[k - 1] : k + 1 < onsets.length ? onsets[k + 1] - n.t0 : 0.5));
    const rate = 1 / ioi, v = n.vel || VEL_MF;
    const share = Math.min(1, Math.max(0, strikeShare(rate) + (v - VEL_MF) / 160));
    n.lift = n.wrist ? 2 : Math.max(REST_OFF, share * liftPeak(rate) * velLift(v) * HAND.s);
    n.antic = Math.min(0.4, Math.max(0.1, ioi * 1.1));
    // つなげる・切る: 楽譜の上の長さ（t1n）と、この手の次の音までの間隔から
    const nxt = k >= 0 && k + 1 < onsets.length ? onsets[k + 1] : null, len = (n.t1n || n.t1) - n.t0;
    n.art = nxt === null ? 'normal' : (n.t1n || n.t1) >= nxt - 0.03 ? 'legato' : len < 0.5 * (nxt - n.t0) && nxt - (n.t1n || n.t1) > 0.08 ? 'staccato' : 'normal';
    n.relH = n.art === 'staccato' && !n.wrist ? Math.max(REST_OFF, 0.5 * liftPeak(rate) * velLift(v) * HAND.s) : REST_OFF;
  }
  const byF = [null, [], [], [], [], []];
  for (const n of notes) byF[n.f].push(n);
  // 押さえたまま指をかえる（n.fh、v044〜）: 押して tsub 秒後に、かえる指が押さえている鍵に下りて、SUB_OV 秒重ねてから押した指が離れる。
  // かえる指の分は「鍵が底のまま始まる音」（ghost。音は鳴らさず、鍵も沈めなおさない）として、その指の並びと手首の計算に入れる。時間は目安
  const ghosts = [];
  for (const n of notes) {
    if (!n.fh || n.fh === n.f) continue;
    n.tsub = n.t0 + Math.min(0.3, Math.max(0.15, 0.35 * (n.t1 - n.t0)));
    if (n.t1 - n.tsub < 0.1) { n.fh = 0; continue; } // かえる時間がない
    n.tw1 = n.tsub + SUB_OV; // 手首の計算では、押した指はここまで
    const g = { m: n.m, t0: n.tsub, t1: n.t1, f: n.fh, ghost: true, src: n, post: n.post, deep: n.deep, art: n.art, relH: n.relH, vel: n.vel, lift: REST_OFF + 3, antic: 0.12 };
    g.P = pressPoint(n.m, n.fh, g);
    byF[n.fh].push(g); ghosts.push(g);
  }
  for (let f = 1; f <= 5; f++) byF[f].sort((a, b) => a.t0 - b.t0);
  const end = Math.max(0, ...notes.map(n => n.t1));
  const plan = { side, notes, byF, ghosts, cost, end };
  solveWrist(plan);
  wristStrokes(plan);
  keepAbove(plan);
  reachFix(plan);
  bakeAngles(plan);
  return plan;
}

// ② 手首: 60Hz のコマごとに「押している指（と、もうすぐ押す指）が届く手首の位置」へ近づけつつ、
// 加速度を小さくする（重みつき最小二乗＋2階差分の罰。共役勾配法で解く）。
// 親指は横へ大きく動けるので重みを軽くする → 親指くぐりのあいだ、手は他の指の側に残る
const W_HZ = 60, W_TAU = 0.12, W_FINGER = [0, 0.3, 1, 1, 1, 1];
// 親指が鍵を押さえているあいだの重み（v050〜）。前は押す前と同じ 0.3 で、親指で押さえたまま手が次の音のほうへ動き、親指が手のひらの下へ
// 押しこまれて曲がり（エリーゼ 1.82〜2.22 秒で 18 → 70°）、離すとバネのように伸びた（ユーザー「びよんと急に伸びる」）。押さえているあいだは
// 1.5（押す前は親指が横へ大きく動けるので 0.3 のまま）。1・1.5・2・3 を試し、3 では練習曲で押せない音が 1 つ（左手のド♯3）、
// 2 ではショパン風の最初に、親指で押さえて引っぱられた手の薬指が押していない鍵へ 8.2mm もぐった（前 5.4）。1.5 でエリーゼの押さえ中のずれ
// 38 → 26mm、もぐり 5.5mm（押す前の重みを 0.6・1 にしても変わらなかった）
let W_THUMB_HOLD = 1.5;
// 解いたあと、押している指が届かないコマはその音の重みを増やして解き直す（W_ITER 回。反復重みづけ最小二乗）
const W_ITER = 5, W_MULMAX = 12, W_PRE = 0.5, W_LEAD = 0.25;
// 手首の回転: 位置を解いたあと、コマごとに「押している指がいちばん届く ψ」を探し（回さないほうへ少し罰）、
// なめらかにしてから位置を解き直す（交互に W_ITER 回）
const YAW_REG = 0.03, YAW_TAU = 0.1;
const HOME_PULL = 0.5; // タイピング: ホームポジションへ引く重み（目安）
// 手首の姿勢 W のとき、音 n を押し下げた指先がどれだけ届かないか（mm）
function reachErr(W, n) {
  const T = toLocal(W, [n.P[0], n.P[1] - KB.DEPTH, n.P[2]]);
  const F = FINGERS[n.f], ik = fingerIK(F, T), tip = fingerFK(F, ik.yaw, ik.a1, ik.a2)[3];
  reachErr.lim = ik.lim; // 関節の限界で止まったか
  return Math.hypot(tip[0] - T[0], tip[1] - T[1], tip[2] - T[2]);
}
// 向き ψ のとき、指 f が力を抜いた形のまま押す場所に届く手首の位置（x, z）
// 腕: 肘は体の横（肩幅の内側 ELBOW_OFF）にあり、手の位置について少し動く（ELBOW_K）。前腕（FOREARM）は手首から肘へ向く。
// 手は手首の曲がりの範囲で前腕の向きに ARM_FOLLOW の割合だけついていく（真ん中を弾く右手は指先が少し左を向く）。値は目安
const ELBOW_OFF = 110, ELBOW_K = 0.6, FOREARM = 250, ARM_FOLLOW = 0.4;
function armYaw(x, side) { const dx = side * ELBOW_OFF + ELBOW_K * x - x; return Math.asin(Math.max(-0.8, Math.min(0.8, dx / FOREARM))); }
const baseYaw = (x, side) => ARM_FOLLOW * armYaw(x, side);
function anchorAt(n, psi, side) { const q = toWorld([0, 0, 0, psi, side], tipN(n.f, n.post)); return [n.P[0] - q[0], n.P[2] - q[2]]; }
function solveWrist(plan) {
  const ns = plan.notes, sd = plan.side, [ymin, ymax] = yawRange(sd);
  const ta = (ns.length ? ns[0].t0 : 0) - 1, tb = plan.end + 1;
  const N = Math.max(4, Math.ceil((tb - ta) * W_HZ) + 1);
  const ent = [], near = [];
  for (let i = 0; i < N; i++) {
    const t = ta + i / W_HZ, list = [];
    let best = null, bd = Infinity;
    for (const n of plan.ghosts && plan.ghosts.length ? ns.concat(plan.ghosts) : ns) {
      // 押す W_LEAD 秒前から W_PRE まで、押したら強く、離すと軽くなる（押さえたまま指をかえた音は、押した指を tw1 まで・かえた指を ghost で）
      const k = (W_FINGER[n.f] * W_PRE * smooth((t - n.t0 + W_LEAD) / (W_LEAD - 0.02)) + (n.f === 1 ? W_THUMB_HOLD : W_FINGER[n.f]) * (1 - W_PRE) * smooth((t - n.t0) / 0.02)) * (1 - smooth((t - (n.tw1 || n.t1)) / 0.05));
      if (k > 0) list.push({ n, k, mul: 1 });
      const d = Math.abs(t - n.t0);
      if (d < bd) { bd = d; best = n; }
    }
    ent.push(list); near.push(best);
  }
  // 構え（コマごと）: 押している・もうすぐ押す音の構えの重みつき平均（なければ近い音）を、0.25 秒くらいでなめらかに
  { const pw = new Float64Array(N), pb = new Float64Array(N);
    for (let i = 0; i < N; i++) { let k = 0, v = 0; for (const e of ent[i]) { k += e.k; v += e.k * (e.n.post || 0); } if (k > 0) { pw[i] = 1; pb[i] = v / k; } else { pw[i] = 0.05; pb[i] = 0.05 * ((near[i] && near[i].post) || 0); } }
    plan.pp = cgSmooth(pw, pb, Math.pow(0.25 * W_HZ, 4)); for (let i = 0; i < N; i++) plan.pp[i] = Math.min(2, Math.max(0, plan.pp[i])); }
  const lam = Math.pow(W_TAU * W_HZ, 4); // なめらかさの罰（W_TAU 秒くらいより速い動きをおさえる）
  const lamY = Math.pow(YAW_TAU * W_HZ, 4);
  const w = new Float64Array(N), bx = new Float64Array(N), bz = new Float64Array(N);
  const yw = new Float64Array(N), yb = new Float64Array(N);
  plan.wt0 = ta; plan.wy = new Float64Array(N);
  // 腕の向きからくる手の向き（ψ の土台）。位置を解くたびに、その位置で決め直す
  const B = plan.wb = new Float64Array(N);
  for (let i = 0; i < N; i++) B[i] = baseYaw(anchorAt(near[i], 0, sd)[0], sd);
  const downAt = (e, t) => t >= e.n.t0 - 0.02 && t <= e.n.t1;
  for (let it = 0; it < W_ITER; it++) {
    // 位置（いまの向きでの目安へ）
    for (let i = 0; i < N; i++) {
      const psi = plan.wy[i] + B[i], k0 = 1e-3; // 何も押していないときは近い音の位置へゆるく
      const a0 = anchorAt(near[i], psi, sd);
      w[i] = k0; bx[i] = k0 * a0[0]; bz[i] = k0 * a0[1];
      // タイピング: 手はいつもホームポジションへゆるく引かれる（タッチタイピングでは、打ったらホームへ戻る）。重み HOME_PULL は目安で、
      // 押す指の重み（1）より小さいので、遠いキーへは手首が一部だけ動き、残りは指が伸びて届く
      const hp = homePoint(2), ha = anchorAt({ f: 2, P: [sd * hp[0], hp[1], hp[2]], post: 0 }, psi, sd); // 左手は F（J の鏡）
      w[i] += HOME_PULL; bx[i] += HOME_PULL * ha[0]; bz[i] += HOME_PULL * ha[1];
      for (const e of ent[i]) { const k = e.k * e.mul, a = anchorAt(e.n, psi, sd); w[i] += k; bx[i] += k * a[0]; bz[i] += k * a[1]; }
    }
    plan.wx = cgSmooth(w, bx, lam); plan.wz = cgSmooth(w, bz, lam);
    if (it === W_ITER - 1) break;
    for (let i = 0; i < N; i++) B[i] = baseYaw(plan.wx[i], sd);
    // 向き（粗く 5 度きざみ → まわりを 1 度きざみ）。向きを変えたら手首の位置もその向きの目安の平均へ動かして比べる
    // （手を回しながら横へずらす = 親指くぐりの姿勢）。もうすぐ押す指も重みのぶんだけ数える
    for (let i = 0; i < N; i++) {
      const t = ta + i / W_HZ, act = ent[i];
      if (!act.some(e => downAt(e, t))) { yw[i] = 0.05; yb[i] = 0; continue; }
      const poseFor = psi => {
        let sx = 0, sz = 0, sw = 0;
        for (const e of act) { const k = e.k * e.mul, a = anchorAt(e.n, psi + B[i], sd); sx += k * a[0]; sz += k * a[1]; sw += k; }
        return [sx / sw, wyOf(plan.pp[i]), sz / sw, psi + B[i], sd];
      };
      const cost = psi => {
        const W = psi === 0 && it === 0 ? [plan.wx[i], wyOf(plan.pp[i]), plan.wz[i], B[i], sd] : poseFor(psi);
        let c = YAW_REG * (psi / D2R) ** 2;
        for (const e of act) c += e.k * e.mul * reachErr(W, e.n) ** 2;
        return c;
      };
      if (act.every(e => reachErr([plan.wx[i], wyOf(plan.pp[i]), plan.wz[i], plan.wy[i] + B[i], sd], e.n) < 0.5)) { yw[i] = 0.3; yb[i] = 0.3 * plan.wy[i]; continue; }
      let best = 0, bc = cost(0);
      for (let d = -30; d <= 20; d += 5) { const c = cost(d * sd * D2R); if (c < bc) { bc = c; best = d * sd * D2R; } }
      const b0 = best;
      for (let d = -4; d <= 4; d++) { const p = b0 + d * D2R; if (p < ymin || p > ymax) continue; const c = cost(p); if (c < bc) { bc = c; best = p; } }
      yw[i] = 1; yb[i] = best;
    }
    const ys = cgSmooth(yw, yb, lamY);
    for (let i = 0; i < N; i++) plan.wy[i] = Math.min(ymax, Math.max(ymin, ys[i]));
    // 届かないコマと、押さえている指が関節の限界まで引っぱられたコマ（手首が次の位置へ動きだして、押さえたままの指がのびきる）は、
    // 重みを増やして計算し直す（本物の手は、押さえている指を限界まで引っぱらない）
    for (let i = 0; i < N; i++) {
      const t = ta + i / W_HZ, W = [plan.wx[i], wyOf(plan.pp[i]), plan.wz[i], plan.wy[i] + B[i], sd];
      for (const e of ent[i]) {
        if (!downAt(e, t)) continue;
        const err = reachErr(W, e.n) + (reachErr.lim ? 2 : 0);
        if (err > 0.5) e.mul = Math.min(W_MULMAX, e.mul * (1 + err / 2));
      }
    }
  }
  handLife(plan, ent, ta, N);
}

// 手のひらの傾きと手首の高さ（人らしさ）: 押している指が小指の側なら小指の側へ、親指なら親指の側へ傾ける（最大 ROLL_MAX）。
// 黒鍵を押すときは手首を BLACK_UP だけ上げ、打鍵のたびに DIP だけ沈んで戻る（腕の重みをのせる）。値は目安
const ROLL_MAX = 5 * D2R, BLACK_UP = 5, DIP = 2, LIFE_TAU = 0.12;
function handLife(plan, ent, ta, N) {
  const rw = new Float64Array(N), rb = new Float64Array(N), hb = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let sx = 0, sw = 0, bl = 0;
    for (const e of ent[i]) { const k = e.k * (e.n.f === 1 ? 0.3 : 1); sx += k * (tipN(e.n.f, e.n.post)[0] + 4); sw += k; if (isBlack(e.n.m)) bl += k; } // 親指の音は傾きにあまり効かせない（親指くぐりで人さし指が下がってぶつかる）
    if (sw > 0) { rw[i] = 1; rb[i] = Math.max(-1, Math.min(1, sx / sw / 45)) * ROLL_MAX; hb[i] = BLACK_UP * bl / sw; }
    else { rw[i] = 0.05; }
  }
  const lam = Math.pow(LIFE_TAU * W_HZ, 4);
  plan.wr = cgSmooth(rw, rb, lam);
  plan.wh = cgSmooth(rw, hb, lam);
  for (const n of plan.notes) {
    const i0 = Math.round((n.t0 - ta) * W_HZ);
    for (let i = Math.max(0, i0 - 2); i < Math.min(N, i0 + 8); i++) plan.wh[i] -= DIP * Math.exp(-((((ta + i / W_HZ) - n.t0 - 0.03) / 0.05) ** 2));
  }
}
// 手首で打つ: 手首で打つ音の前に、手首を WRIST_LIFT まで上げ、打つ時刻に向かって下ろす（指の形はそのまま）。
// 前の音を離してから（最大 0.35 秒前から）の時間で上げ下げし、時間が短いほど小さく。値はこのアプリの目安
let STROKE = 'finger'; // タイピングは指だけで打つ（ピアノを弾く手の「腕ごと」「手首で」は使わない）
// 手首で打つときの上げる高さ（mm）と、上げはじめる早さの上限（秒）。'arm' は腕ごと大きく（肘から上げる）。どれも目安
const WRIST_LIFT = 12, ARM_LIFT = 30, ARM_GAP = 0.25, ARM_SLOW = 0.45, ARM_RATE = 50; // ARM_RATE: 腕ごとの持ち上げの高さ（mm）÷ 使える時間（秒）、目安
function wristStrokes(plan) {
  const N = plan.wh.length, ta = plan.wt0;
  plan.wk = new Float64Array(N);
  const evs = [...new Set(plan.notes.filter(n => n.wrist).map(n => Math.round(n.t0 * 1000)))].map(x => x / 1000).sort((a, b) => a - b);
  for (const t0 of evs) {
    let tp = -Infinity;
    for (const n of plan.notes) if (n.t0 < t0 - 0.03) tp = Math.max(tp, Math.min(n.t1, t0 - 0.04));
    const arm = STROKE === 'arm', start = Math.max(tp, t0 - (arm ? 0.5 : 0.35)), dur = t0 - start;
    if (dur < 0.04) continue;
    // 腕ごとの高さ（v038〜、ユーザーの指摘「押さえた形から急に跳ね上がる」）: 前は 100mm/秒×時間（0.22 秒で 25mm、上がる速さ 440mm/秒）で、
    // エリーゼの休符のあとの親指のたびに手全体が跳ね上がった。使える時間あたり ARM_RATE にし、打つ音の強さで変える（弱いほど小さく、velLift）
    const vel = Math.max(...plan.notes.filter(n => Math.abs(n.t0 - t0) < 0.03).map(n => n.vel || VEL_MF));
    const A = arm ? Math.min(ARM_LIFT, ARM_RATE * dur) * Math.min(1, velLift(vel)) : Math.min(WRIST_LIFT, 80 * dur);
    for (let i = Math.max(0, Math.floor((start - ta) * W_HZ)); i < N; i++) {
      const t = ta + i / W_HZ; if (t > t0) break;
      const s = (t - start) / dur; if (s < 0) continue;
      plan.wk[i] = Math.max(plan.wk[i], A * Math.sin(Math.PI * s) * ease5(Math.min(1, s * 2.5)));
    }
  }
  for (let i = 0; i < N; i++) plan.wh[i] += plan.wk[i];
}
function wkAt(plan, t) {
  if (!plan.wk) return 0;
  const u = Math.min(plan.wk.length - 1.001, Math.max(0, (t - plan.wt0) * W_HZ)), i = Math.floor(u), s = u - i;
  return plan.wk[i] + (plan.wk[i + 1] - plan.wk[i]) * s;
}
// 指を鍵にもぐらせない: 押していない指先が鍵の上面より下に入るコマを探し、その深さだけ手首をなめらかに上げる（本物の手は、
// 親指をくぐらせるときなどに手首を上げる）。上げたせいで届かなくなった音は、押せなかった音になる（数値は合わせない）
function keepAbove(plan) {
  const N = plan.wh.length, ta = plan.wt0, lam = Math.pow(0.08 * W_HZ, 4), one = new Float64Array(N).fill(1);
  for (let it = 0; it < 2; it++) {
    const need = new Float64Array(N); let mx = 0;
    for (let i = 0; i < N; i++) {
      const P = poseAt(plan, ta + i / W_HZ);
      for (let f = 1; f <= 5; f++) {
        const fp = P.fingers[f]; if (fp.press) continue;
        const tip = fp.pts[3]; if (tip[2] > KB.Z_FRONT || tip[2] < KB.Z_BACK) continue; // タイピング: キーボードの奥行き
        // 床は鍵の横の位置も見る（v034〜、surfaceFloor）。前は奥行きだけの床（黒鍵の手前の端より奥はどこも黒鍵の高さ）で、白鍵を奥で押す
        // 「中間」の構えだと、黒鍵のあいだの白鍵へ下ろす指が黒鍵にもぐると数えられ、手首を 16mm 上げて、押している指が鍵から離れた
        const sf = surfaceFloor(tip[0], tip[2]); if (!(sf > -1e9)) continue;
        const s = sf + PAD + 1 - tip[1];
        if (s > need[i]) need[i] = s;
      }
      if (need[i] > mx) mx = need[i];
    }
    if (mx < 0.5) break;
    const env = new Float64Array(N); // 前後 0.12 秒の最大（上げはじめを早めに）
    const K = Math.round(0.12 * W_HZ);
    for (let i = 0; i < N; i++) { let m = 0; for (let j = Math.max(0, i - K); j <= Math.min(N - 1, i + K); j++) m = Math.max(m, need[j]); env[i] = m; }
    const x = cgSmooth(one, env, lam);
    for (let i = 0; i < N; i++) plan.wh[i] += Math.max(0, x[i]) * 1.1;
  }
}

// 届かない音の直し（v028〜）: 手首の計算は、親指を軽く数えるなどで、まわりの音との折りあいの位置になる。その結果、手首を自由に置けば
// 届く音が届かないことがあった（ショパン風の最初の音・練習曲のオクターブなど。どれも手首の置き方しだいで届く）。押す瞬間に届かない音があれば、
// そのとき押さえているすべての音が届く手首の位置・高さ・向きを近くで探し（ずらしは小さいほどよい）、その時刻のまわりだけなめらかにずらす。
// 手首の速さが人の範囲（検査の △ 900mm/秒）をこえるか、押せない音が増えるなら、そのずらしはやめる
function reachFix(plan) {
  const N = plan.wx.length, ta = plan.wt0, sd = plan.side;
  const missAt = n => poseAt(plan, Math.min(n.t1, n.t0 + TK)).fingers[n.f].err;
  const count = () => plan.notes.filter(n => missAt(n) > MISS_MM).length;
  const bad = plan.notes.filter(n => missAt(n) > MISS_MM * 0.6);
  for (const n of bad) {
    if (missAt(n) <= MISS_MM * 0.6) continue; // 前のずらしで直った
    const tc = Math.min(n.t1, n.t0 + TK), W0 = wristAt(plan, tc);
    const held = plan.notes.filter(o => o.t0 <= tc + 0.01 && o.t1 >= tc - 0.01);
    // 押していない指（力を抜いた形の指先）が鍵にもぐらないことも条件に（もぐる深さを罰に。あとで手首を上げると、また届かなくなるため）
    const free = [1, 2, 3, 4, 5].filter(f => !held.some(o => o.f === f)), pp = postAt(plan, tc);
    const cost = (dx, dy, dz, dyaw) => { const W = [W0[0] + dx, W0[1] + dy, W0[2] + dz, W0[3] + dyaw, sd, W0[5], W0[6]]; let c = 0, sk = 0;
      for (const o of held) c = Math.max(c, reachErr(W, o));
      for (const f of free) { // 押していない指は鍵の上まで持ち上げようとする（間の指を上げてオクターブを弾くように）。関節の範囲で上がりきらない分がもぐる
        const q = toWorld(W, tipN(f, pp)), top = Math.max(surfaceAt(q[0], q[2]), surfaceZ(q[2])) + PAD, T = [q[0], Math.max(q[1], top), q[2]];
        const ik = fingerIK(FINGERS[f], toLocal(W, T)), tip = toWorld(W, fingerFK(FINGERS[f], ik.yaw, ik.a1, ik.a2)[3]);
        sk = Math.max(sk, top - tip[1]); }
      return c + Math.max(0, sk) + 0.02 * Math.hypot(dx, dy, dz) + 0.05 * Math.abs(dyaw / D2R); };
    let b = [0, 0, 0, 0], bc = cost(0, 0, 0, 0);
    for (const step of [8, 3, 1]) { // 粗く → 細かく
      const c0 = b.slice();
      for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) for (const j of [-1, 0, 1]) for (const y of [-2, -1, 0, 1, 2]) {
        const c = [c0[0] + i * step, c0[1] + j * step, c0[2] + k * step, c0[3] + y * step * D2R], v = cost(...c);
        if (v < bc) { bc = v; b = c; }
      }
    }
    if (b.every(v => Math.abs(v) < 1e-9)) continue;
    // まわりの音までの時間でずらしの幅を決める（となりの打鍵をじゃましない）
    const near = plan.notes.filter(o => Math.abs(o.t0 - n.t0) > 0.03).map(o => Math.abs(o.t0 - n.t0));
    const sig = Math.min(0.2, Math.max(0.05, 0.5 * Math.min(0.4, ...near)));
    let v0 = 0; for (let i = 1; i < N; i++) v0 = Math.max(v0, Math.hypot(plan.wx[i] - plan.wx[i - 1], plan.wh[i] - plan.wh[i - 1], plan.wz[i] - plan.wz[i - 1]) * W_HZ); // ずらす前の手首のいちばん速い速さ
    const save = [plan.wx.slice(), plan.wh.slice(), plan.wz.slice(), plan.wy.slice()], before = count();
    const first = !plan.notes.some(o => o.t0 < n.t0 - 0.03); // この手のはじめの音なら、その前からずっとその位置で構えておく（一瞬で動かさない）
    for (let i = 0; i < N; i++) { const tt = ta + i / W_HZ, g = first && tt <= tc ? 1 : Math.exp(-(((tt - tc) / sig) ** 2)); if (g < 1e-3) continue; plan.wx[i] += b[0] * g; plan.wh[i] += b[1] * g; plan.wz[i] += b[2] * g; plan.wy[i] += b[3] * g; }
    const vmax = () => { let v = 0; for (let i = 1; i < N; i++) v = Math.max(v, Math.hypot(plan.wx[i] - plan.wx[i - 1], plan.wh[i] - plan.wh[i - 1], plan.wz[i] - plan.wz[i - 1]) * W_HZ); return v; };
    if (count() > before || vmax() > Math.max(900, v0)) [plan.wx, plan.wh, plan.wz, plan.wy] = save;
  }
}

// (diag(w) + lam·D2ᵀD2) x = b を解く
function cgSmooth(w, b, lam) {
  const N = w.length;
  const A = (x, out) => {
    for (let i = 0; i < N; i++) out[i] = w[i] * x[i];
    for (let i = 1; i < N - 1; i++) {
      const d = lam * (x[i - 1] - 2 * x[i] + x[i + 1]);
      out[i - 1] += d; out[i] -= 2 * d; out[i + 1] += d;
    }
  };
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = b[i] / w[i];
  const r = new Float64Array(N), p = new Float64Array(N), Ap = new Float64Array(N);
  A(x, Ap);
  for (let i = 0; i < N; i++) { r[i] = b[i] - Ap[i]; p[i] = r[i]; }
  let rr = r.reduce((s, v) => s + v * v, 0);
  for (let it = 0; it < 4 * N && rr > 1e-10; it++) {
    A(p, Ap);
    let pAp = 0; for (let i = 0; i < N; i++) pAp += p[i] * Ap[i];
    const a = rr / pAp;
    let rr2 = 0;
    for (let i = 0; i < N; i++) { x[i] += a * p[i]; r[i] -= a * Ap[i]; rr2 += r[i] * r[i]; }
    const be = rr2 / rr; rr = rr2;
    for (let i = 0; i < N; i++) p[i] = r[i] + be * p[i];
  }
  return x;
}
// 弾き終えたあと（v045〜）: 最後の音を離したら手首はその場に（なめらかさの計算の続きで横へ 30mm すべっていた。超絶技巧の練習曲の最後）。
// 演奏会の所作（余韻が消えるまで手を鍵盤から離さず、消えたら手をひざへ）にならって手をひざのほうへ戻す動きを試したが、
// 肘が曲がらない腕なので腕ごと後ろへ平行に動いて宙に浮き、機械のように見えたのでやめた（2026-10-11、ユーザーの了承）。
// 手は鍵の上で力を抜いた形のまま、音と光が消えおえるまで再生を続ける（tFin）。
// 止めるときは、離した瞬間の速さから END_TAU 秒くらいでなめらかに止まる（その場でぴたりと止めると、速い曲で 220mm/秒 から急に止まってかくついた）
const END_TAU = 0.08;
function wristAt(plan, t) {
  if (plan.tHold == null || t <= plan.tHold) return wristAt0(plan, t);
  const W = wristAt0(plan, plan.tHold), Wp = wristAt0(plan, plan.tHold - 1 / W_HZ);
  const k = END_TAU * (1 - Math.exp(-(t - plan.tHold) / END_TAU)) * W_HZ; // 速さ（1コマあたり）× 進む時間
  for (const i of [0, 1, 2, 3, 5, 6]) W[i] += (W[i] - Wp[i]) * k;
  return W;
}
function wristAt0(plan, t) {
  const u = Math.min(plan.wx.length - 1.001, Math.max(0, (t - plan.wt0) * W_HZ));
  const i = Math.floor(u), s = u - i;
  const at = a => a[i] + (a[i + 1] - a[i]) * s;
  const x = at(plan.wx);
  return [x, (plan.pp ? wyOf(at(plan.pp)) : WRIST_Y) + at(plan.wh), at(plan.wz), at(plan.wy) + at(plan.wb), plan.side, armYaw(x, plan.side), at(plan.wr)]; // W[5] は前腕の向き、W[6] は手のひらの傾き
}

// 鍵を押す指先の位置（世界の座標）
function pressPoint(m, f, n) { return [keyX(m), keyTop(m) + PAD, pressZ(m, f, n && n.deep, n ? n.post : 0)]; }

// 離したあと、指先が鍵の位置から力を抜いた形へ移りはじめるまで（秒）と、移る時間（指ごと）
// （v050 で親指を 0・0.07〜0.1 にする試し: 親指の曲げがかえって速くなった。手の動きに置いていかれるのが原因で、早く戻しても速くなるだけ）
let REL_DELAY = [0, 0.03, 0.03, 0.03, 0.03, 0.03], REL_BLEND = [0, 0.16, 0.16, 0.16, 0.16, 0.16];
// 先回りの向かう先を「押す時刻の手から見た鍵の位置」にするか（指ごと、v050〜）。部屋の中の鍵の位置へ向かうと、手がまだ着いていないとき
// 指だけが先へ飛び出し、手が追いつくと戻る（エリーゼ 2.23〜2.5 秒、親指が力を抜いた位置より 35mm 外へ出て戻った。ユーザー「バネみたいに
// びよんと急に伸びる」）。本物は押すときの指の形をとり、手がその指を鍵まで運ぶ。押す時刻には両方が同じ点になるので、つなぎ目は跳ばない。
// （離したあと指先を手について動かす試しは効かなかった: 原因は離したあとではなく、次の鍵への先回りだった）
let APPROACH_LOCAL = [false, true, false, false, false, false];
// ④ 指先の目標（世界の座標）。押す・離して浮かす・次の音へ先回り・力を抜いた形に戻る
function fingerTarget(plan, f, t, W) {
  const L = plan.byF[f];
  let i = -1;
  for (let k = 0; k < L.length; k++) { if (L[k].t0 <= t) i = k; else break; }
  const p = i >= 0 ? L[i] : null, n = L[i + 1] || null;
  // 力を抜いた形（手といっしょに動く）。下の鍵より少し浮かせる（高さは奥行きだけで決める。黒鍵の凸凹をなぞって上下しないように）
  const nt = toWorld(W, tipN(f, postAt(plan, t)));
  // 休むときは鍵の表面に軽く触れる（力を抜いた形の指先が鍵より REST_DROOP 以内の高さなら、重さで垂れて触れる。それより高ければ垂れきった所）
  const key = Math.max(surfaceZ(nt[2]), surfaceZ(nt[2] - 8)) + PAD + REST_OFF;
  // 腕ごと・手首で持ち上げているあいだは、鍵の上で休む指の床（鍵の面）も持ち上げた分だけ上げる（v038〜、ユーザーの指摘「腕は上がるのに指先が
  // 空中に残り、指がのびて見える」）。中間の構えでは手が低く、休む指は鍵に押されて曲がっていた（小指の第2関節 49°）。床が鍵のままだと、
  // 手が上がると指が力を抜いた形（28°）までのびながら指先が鍵の近くに残った。本物は腕を持ち上げると、指は鍵の上の形のまま手と一緒に上がる
  const wkr = wkAt(plan, t), rest = [nt[0], Math.max(key, Math.max(PAD + REST_OFF, nt[1] - wkr - REST_DROOP) + wkr), nt[2]]; // 持ち上げる前の高さ（白鍵の床）で形を決めて持ち上げた分を足す（指の形が保たれる）。黒鍵の床はそのまま

  const pEnd = p ? (p.fh && p.tw1 ? Math.min(p.t1, p.tw1) : p.t1) : 0; // 押さえたまま指をかえた音は、押した指が tw1 で離れる
  if (p && t <= pEnd) { // 押している
    const P = pressPoint(p.m, f, p);
    return { T: [P[0], P[1] - keyDrop(pressDepth(p, t), P[2]), P[2]], R: rest, press: p, down: true, mob: 0 };
  }
  let S = rest, sT = -Infinity, mob0 = 1, rel = null;
  if (p && pEnd < p.t1) { // 指をかえて離れた: 鍵は底のまま（かえた指が押さえている）、指だけ上がって力を抜いた形へ
    const P = pressPoint(p.m, f, p);
    S = lerp3([P[0], P[1] - keyDrop(KB.DEPTH, P[2]), P[2]], rest, ease5((t - pEnd) / 0.16));
    sT = pEnd;
    mob0 = ease5((t - sT - 0.02) / 0.12);
  } else if (p) { // 離したあと: 鍵といっしょに上がり、とちゅうから力を抜いた形へ（前の鍵の上に残ると、手が動いたときに置いていかれる）
    const P = pressPoint(p.m, f, p), y0 = releaseY(p, t), y = y0 >= 0 ? y0 : -keyDrop(-y0, P[2]); // 鍵を押しこんでいる間は、その場所の鍵の沈み
    S = lerp3([P[0], P[1] + y, P[2]], rest, ease5((t - p.t1 - REL_DELAY[f]) / REL_BLEND[f]));
    if (y0 < 0) rel = p; // まだ鍵を押しこんでいる
    sT = p.t1;
    mob0 = ease5((t - sT - 0.02) / 0.12); // 離したあとも、なめらかに動かせるようになる
  }
  if (n) {
    const ta = Math.max(sT, n.t0 - LOOK);
    if (t >= ta) { // ③ 先回り: 次に押す鍵の上へ。移動にはかならず時間をとる（次までが短くても一瞬で飛ばない）
      let P = pressPoint(n.m, f, n);
      if (n.ghost) P[1] -= keyDrop(KB.DEPTH, P[2]); // 押さえたままかえる指は、底にある鍵の上へ下りる
      if (APPROACH_LOCAL[f] && W) P = toWorld(W, toLocal(wristAt(plan, n.t0), P)); // 押す時刻の手から見た鍵の位置を、いまの手に置く
      const lift = n.lift || LIFT, span = Math.max(1e-3, n.t0 - ta), Td = Math.min(0.08, span * 0.4), tb = n.t0 - Td;
      // 鍵の上へは低く（触れる高さで）移り、持ち上げるのは約1音前から（n.antic）。ゆっくりの所は持ち上げがほぼ 0 で、触れたまま押す
      const tl = Math.max(ta, n.t0 - (n.antic || 0.3)), up = n.wrist ? 1 : ease5((t - tl) / Math.max(1e-3, tb - tl));
      const H = [P[0], P[1] + REST_OFF + (lift - REST_OFF) * up + (n.wrist ? wkAt(plan, t) : 0), P[2]];
      // 横の移動は、下ろしはじめてからも少し続く（動きを順番に1つずつ終わらせると機械のように見えた）
      const Q = lerp3(S, H, ease5((t - ta) / Math.max(1e-3, tb + 0.5 * Td - ta)));
      if (t > tb) { // 下ろす: 鍵に着く時刻 t0 に速さ VC で着き、そのまま押しこむ（keyDown）
        const s = (t - tb) / Td, w = Math.min(3.8, Math.max(0.3, VC * Td / lift));
        Q[1] -= lift * ((4 - w) * s * s * s + (w - 3) * s * s * s * s);
      }
      // よけにくさ（0 = 動かせない）。下ろしはじめる少し前から、なめらかに動かせなくなる
      return { T: Q, R: rest, next: n, press: rel, mob: Math.min(mob0, 1 - ease5((t - (tb - 0.12)) / 0.12)) };
    }
  }
  return { T: S, R: rest, press: rel, mob: mob0 };
}

// ④ となりの指へのつられ（腱と筋肉を共有しているので、1本だけ動かしてもほかの指が少しついてくる）と、空中のゆらぎ。
// COUPLE[f][g]: 指 f が上下した量の何倍だけ、指 g が同じ向きに動くか。Häger-Ross & Schieber (2000) の「1本だけ動かしたときの、
// ほかの指の動きの割合」（つられにくさ: 親指 0.98・人さし指 0.98・中指 0.94・薬指 0.91・小指 0.94）から、となりの指ほど
// 大きくなるように割りふった目安（論文は指ごとの組の値を出していない）。親指はほとんどつられない
const COUPLE = { 2: { 3: 0.07 }, 3: { 2: 0.10, 4: 0.12 }, 4: { 3: 0.15, 5: 0.17 }, 5: { 4: 0.18, 3: 0.04 } };
// 空中のゆらぎ（mm、このアプリの目安）: 指を浮かせて止めておくときの、ゆっくりした小さなゆれ。8〜12Hz の生理的振戦は
// 小さすぎて見えないので入れない。時刻から決まるので、巻きもどしても同じ動き
const SWAY = 0.5;
function coupleAndSway(tg, W, t) {
  const loc = [null], dy = [0];
  for (let f = 1; f <= 5; f++) { loc.push(toLocal(W, tg[f].T)); dy.push(loc[f][1] - toLocal(W, tg[f].R)[1]); }
  const tau = 2 * Math.PI * t;
  for (let g = 1; g <= 5; g++) {
    const m = tg[g].mob;
    if (m <= 0) continue;
    let c = 0;
    for (let f = 2; f <= 5; f++) c += ((COUPLE[f] && COUPLE[f][g]) || 0) * dy[f];
    const sw = SWAY * (0.6 * Math.sin(tau * (0.31 + 0.07 * g) + 1.7 * g) + 0.4 * Math.sin(tau * (0.83 + 0.05 * g) + 4.1 * g));
    loc[g][1] += (c + sw) * m;
    loc[g][0] += SWAY * 0.6 * Math.sin(tau * (0.27 + 0.06 * g) + 2.3 * g) * m;
    tg[g].T = toWorld(W, loc[g]);
  }
}

// ④ 人さし指〜小指は横の並びを入れかえられない。動かしやすい指（mob が大きい）ほど多くよけて、指先どうしを FGAP 以上はなす。
// どの規則も、しきい値で急に切りかわらないように連続にしている（切りかわると指が一瞬で飛んで、手がぶるぶるして見えた）
const FGAP = 18;
function keepOrder(tg, W) {
  const gap0 = FGAP * HAND.s;
  // 横の並びは手の座標で見る（手が回っていても）
  for (let f = 1; f <= 5; f++) tg[f].T = toLocal(W, tg[f].T);
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let f = 2; f <= 4; f++) {
      const A = tg[f], B = tg[f + 1], need = gap0 - (B.T[0] - A.T[0]), m = A.mob + B.mob;
      if (need <= 0.01 || m < 1e-3) continue;
      const k = 1 / Math.max(1, m); // 動かせる度合いが小さいときは少ししかよけない（全部を押しつけると、度合いが 0 になる瞬間に飛ぶ）
      A.T[0] -= need * A.mob * k; B.T[0] += need * B.mob * k;
      moved = true;
    }
    if (!moved) break;
  }
  // 両どなりにはさまれた指は、はさまれた分だけ上へ逃がし、まん中へ寄せる
  for (let f = 3; f <= 4; f++) {
    const A = tg[f - 1], B = tg[f], C = tg[f + 1];
    const sq = Math.max(0, gap0 - Math.min(B.T[0] - A.T[0], C.T[0] - B.T[0])) * B.mob;
    if (sq <= 0) continue;
    B.T[0] += ((A.T[0] + C.T[0]) / 2 - B.T[0]) * smooth(sq / 6);
    B.T[1] += sq * 1.5;
  }
  // 親指が手のひらの下へくぐるときは、上の指（人さし指・中指）を少し持ち上げてアーチにする
  const th = tg[1].T;
  for (let f = 2; f <= 3; f++) {
    const B = tg[f], under = th[0] - (B.T[0] - 22 * HAND.s);
    if (under > 0) B.T[1] += Math.min(14, under * 0.6) * (f === 2 ? 1 : 0.6) * B.mob;
  }
  for (let f = 1; f <= 5; f++) tg[f].T = toWorld(W, tg[f].T);
  // 指先の球が鍵にめりこまないように、鍵のなめらかな面より上へ（動かせる指だけ、動かせる分だけ）
  for (let f = 1; f <= 5; f++) {
    const T = tg[f].T, floor = surfaceZ(T[2]) + PAD + 1;
    if (T[1] < floor) T[1] += (floor - T[1]) * tg[f].mob;
  }
}

function poseAt(plan, t) {
  const W = wristAt(plan, t);
  const fingers = [null];
  const tgs = [null];
  for (let f = 1; f <= 5; f++) tgs.push(fingerTarget(plan, f, t, W));
  coupleAndSway(tgs, W, t);
  keepOrder(tgs, W);
  // 鍵が指を支える（v027〜）: 押していない指の目標は、鍵の上面（左右 3mm の鍵も見る。黒鍵のふちをこすらないように）より下に入れない。
  // 休んでいる指を鍵の表面に触れさせたので、となりの指へのつられやゆらぎ、低く横へ移る道すじで、鍵にもぐるようになったため
  for (let f = 1; f <= 5; f++) {
    const tg = tgs[f]; if (tg.down || tg.press) continue;
    const T = tg.T, sf = Math.max(surfaceAt(T[0], T[2]), surfaceAt(T[0] - 3, T[2]), surfaceAt(T[0] + 3, T[2]));
    if (sf > -1e9) T[1] = Math.max(T[1], sf + PAD);
  }
  for (let f = 1; f <= 5; f++) {
    const F = FINGERS[f];
    const tg = tgs[f];
    // 押していない親指は、第1関節・付け根の関節を THUMB_REST_A2 より伸ばさない（v049〜）。ただし親指が手のひらの下にあるとき（親指くぐり）は
    // 入れない（練習曲の親指くぐりで、持ち上げた親指が曲がったまま手のひらの下を通り、よける動きで薬指が押していない鍵へ 8.7mm もぐった）
    // 離すとき（鍵がまだ戻りきらない tg.press）も入れる（離した瞬間に親指がまっすぐに伸びていた。和音の曲で押していない時間の 2 割）
    // v050〜: 時間でなめらかに入れる（thumbRestK。離した瞬間に入れると、曲げが 1 コマで 0 → 18° と跳ねた）
    const minA2 = f === 1 && !tg.down ? thumbRestMin(toLocal(W, tg.T)) * thumbRestK(plan, t) : 0;
    tg.minA2 = minA2;
    let ik = fingerIK(F, toLocal(W, tg.T), minA2);
    let pts = fingerFK(F, ik.yaw, ik.a1, ik.a2).map(p => toWorld(W, p));
    // 押していない指が目標に届かず（関節の限界など）、ずれた先で鍵の中に入ったら、その場所の鍵の上面に乗せて解き直す（鍵が指を支える）
    if (!tg.down && !tg.press) for (let it = 0; it < 2; it++) {
      const q = pts[3], sf = surfaceAt(q[0], q[2]), sink = sf + PAD - q[1];
      if (!(sink > 0.2)) break;
      tg.T = [tg.T[0], tg.T[1] + sink, tg.T[2]];
      ik = fingerIK(F, toLocal(W, tg.T), minA2); pts = fingerFK(F, ik.yaw, ik.a1, ik.a2).map(p => toWorld(W, p));
    }
    const tip = pts[3];
    const err = Math.hypot(tip[0] - tg.T[0], tip[1] - tg.T[1], tip[2] - tg.T[2]);
    fingers.push({ pts, target: tg.T, press: tg.press || null, down: !!tg.down, err, lim: ik.lim, ang: ik });
  }
  avoidBones(fingers, tgs, W);
  // 関節の速さの上限をかけた角度（bakeAngles）があれば、その角度で指を置く。目標に届かなければ err に出る（間に合わない＝押せない）
  if (plan.ac && t >= plan.ac.t0) { // 表より後は、表の最後の角度のまま（手首も止まっている）
    const u = Math.min(t - plan.ac.t0, plan.ac.t1 - plan.ac.t0) * ANG_HZ, i = Math.min(plan.ac.n - 2, Math.floor(u)), s = u - i;
    for (let f = 1; f <= 5; f++) {
      const A = plan.ac[f], at = a => a[i] + (a[i + 1] - a[i]) * s, F = FINGERS[f], fp = fingers[f];
      const ang = { yaw: at(A.yaw), a1: at(A.a1), a2: at(A.a2) };
      ang.lim = fp.ang.lim;
      fp.pts = fingerFK(F, ang.yaw, ang.a1, ang.a2).map(p => toWorld(W, p));
      fp.ang = ang;
      fp.err = Math.hypot(fp.pts[3][0] - fp.target[0], fp.pts[3][1] - fp.target[1], fp.pts[3][2] - fp.target[2]);
    }
  }
  return { t, W, fingers };
}

// 関節の速さの上限: 筋肉で出せる速さには限りがある。プロのピアニストの速い音階で、指の付け根の関節の最大はおよそ 1160 度/秒
// （Frontiers in Neurorobotics 2026）。少し余裕を見て JOINT_VMAX = 1500 度/秒（目安）。曲全体の指の角度を 1/240 秒ごとに
// 先に計算し（IK・よける動きまで）、ごく短い（4ms ほど）なめらかさをかけてから、前から・後ろからの両方で速さを上限までにおさえて平均する
// （前からだけだと遅れ、後ろからだけだと先走る。両方の平均は、先を見こして動きはじめる人の動きに近い）
const ANG_HZ = 240, JOINT_VMAX = 1500 * D2R;
function bakeAngles(plan) {
  plan.ac = null;
  // 表は弾き終えたあとの余韻（光ともやが消えおえるまで）までとる。前は最後の音 ＋0.5 秒までで、そこで表のない角度に切りかわって
  // 指が 3〜4mm 跳んでいた（v045 で余韻をのばしたら見えるようになった、ユーザーの指摘）。ペダルでのびた分も入るよう ＋4 秒
  const t0 = plan.wt0, t1 = plan.end + 4, n = Math.max(2, Math.ceil((t1 - t0) * ANG_HZ) + 1);
  const ac = { t0, t1: t0 + (n - 1) / ANG_HZ, n };
  for (let f = 1; f <= 5; f++) ac[f] = { yaw: new Float32Array(n), a1: new Float32Array(n), a2: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const P = poseAt(plan, t0 + i / ANG_HZ);
    for (let f = 1; f <= 5; f++) { const a = P.fingers[f].ang; ac[f].yaw[i] = a.yaw; ac[f].a1[i] = a.a1; ac[f].a2[i] = a.a2; }
  }
  const dv = JOINT_VMAX / ANG_HZ, g = [0.12, 0.23, 0.30, 0.23, 0.12]; // σ ≈ 1 コマ（4ms）のガウス
  for (let f = 1; f <= 5; f++) for (const k of ['yaw', 'a1', 'a2']) {
    const x = ac[f][k], sm = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, w = 0; for (let j = -2; j <= 2; j++) { const q = i + j; if (q < 0 || q >= n) continue; s += g[j + 2] * x[q]; w += g[j + 2]; } sm[i] = s / w; }
    const fw = Float32Array.from(sm), bw = Float32Array.from(sm);
    for (let i = 1; i < n; i++) fw[i] = Math.min(fw[i - 1] + dv, Math.max(fw[i - 1] - dv, fw[i]));
    for (let i = n - 2; i >= 0; i--) bw[i] = Math.min(bw[i + 1] + dv, Math.max(bw[i + 1] - dv, bw[i]));
    for (let i = 0; i < n; i++) x[i] = (fw[i] + bw[i]) / 2;
  }
  plan.ac = ac;
}

// 指どうしの骨が近づきすぎたら（骨＋押しつぶしきった肉より近い。皮ふと肉が押し合うのはかまわない）、動かせる指（mob が大きい方）を
// ぶつかる所から離れる横向きによける。本物の指も押し合うと横へ逃げる。よけるのは付け根の関節の横の動き（FINGERS の yaw の範囲＝人の範囲）。
// どちらも押していて動かせなければ、そのまま（検査の「指どうしのめりこみ」に出る）
function avoidBones(fingers, tgs, W) {
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (let f = 1; f <= 5; f++) for (let g = f + 1; g <= 5; g++) {
      const A = fingers[f], B = fingers[g];
      let worst = 0, cA = null, cB = null, segA = 0, segB = 0;
      for (let i = f === 1 ? 1 : 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const d = segDist(A.pts[i], A.pts[i + 1], B.pts[j], B.pts[j + 1]), pen = boneR(f, i) + boneR(g, j) - d;
        if (pen > worst) { worst = pen; cA = segDist.c1; cB = segDist.c2; segA = i; segB = j; }
      }
      if (worst < 0.2) continue;
      const k = tgs[f].mob >= tgs[g].mob ? f : g;
      if (tgs[k].mob < 0.05) continue;
      const me = k === f ? cA : cB, other = k === f ? cB : cA, fp = fingers[k];
      let dx = me[0] - other[0], dz = me[2] - other[2]; const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
      // 付け根から当たった所までと、付け根から指先までの長さの比で、指先を動かす量を決める（てこ）
      const lever = Math.max(8, Math.hypot(me[0] - fp.pts[0][0], me[2] - fp.pts[0][2])), arm = Math.hypot(fp.pts[3][0] - fp.pts[0][0], fp.pts[3][2] - fp.pts[0][2]);
      const push = Math.min(15, worst * 1.15 * arm / lever) * tgs[k].mob;
      const T = tgs[k].T = [tgs[k].T[0] + dx * push, tgs[k].T[1], tgs[k].T[2] + dz * push];
      const F = FINGERS[k], ik = fingerIK(F, toLocal(W, T), k === 1 && !fingers[k].down ? tgs[k].minA2 || 0 : 0), pts = fingerFK(F, ik.yaw, ik.a1, ik.a2).map(p => toWorld(W, p));
      Object.assign(fingers[k], { pts, target: T, err: fingers[k].press ? Math.hypot(pts[3][0] - T[0], pts[3][1] - T[1], pts[3][2] - T[2]) : 0, lim: ik.lim, ang: ik });
      moved = true;
    }
    if (!moved) break;
  }
}

// 鍵ごとの押しこみ（描画と検査で使う）
function depressAt(plan, t) {
  const d = {};
  for (const n of plan.notes) {
    if (n.hand === 'X' || n.miss) continue; // 手で弾かない音（和音をへらした分）と、届かずに押せなかった音は鍵を沈めない
    const v = pressDepth(n, t);
    if (v > 0) d[n.m] = Math.max(d[n.m] || 0, v);
  }
  return d;
}
