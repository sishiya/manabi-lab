// ① 運指: 隣りあう2音の指の組ごとの罰点（Parncutt ほか 1997 の右手の規則を簡略）を、動的計画法で最小に。
'use strict';
// 指の組 a<b の、下の指の音から上の指の音までの半音の数の目安:
// [できる最小, 楽な最小, ゆるんだ最小, ゆるんだ最大, 楽な最大, できる最大]（Parncutt ほか 1997 の表、右手）
const SPAN = {
  12: [-5, -3, 1, 5, 8, 10], 13: [-4, -2, 3, 7, 10, 12], 14: [-3, -1, 5, 9, 12, 14], 15: [-1, 1, 7, 10, 13, 15],
  23: [1, 1, 1, 2, 3, 5], 24: [1, 1, 3, 4, 5, 7], 25: [2, 2, 5, 6, 8, 10],
  34: [1, 1, 1, 2, 2, 4], 35: [1, 1, 3, 4, 5, 7], 45: [1, 1, 1, 2, 3, 5],
};
// 手の大きさに合わせる（v043〜）: 上の表は大人の手のもの。手の幅（親指〜小指をいっぱいに開いた幅）の比 k で、
// 「指1本に鍵1つずつ（5本指の位置、指の組 a・b で 2×(b−a) 半音）」より広い開きと、親指くぐりの届く範囲（負の値）だけを縮める。
// 5本指の位置は小さい手でも楽なので変えない（表ぜんぶに k をかけると、子どもの手でハ長調の音階まで 3-2-1 のくり返しになった）。
// 開きを実際の距離で考えるのは Jacobs 2001 の考え方（arXiv 2108.09058 の紹介による。原典は未確認）。この縮め方はこのアプリの目安。大人（大きめ）が k = 1 で表はもとのまま。setHandModel から呼ぶ
const SPAN0 = JSON.parse(JSON.stringify(SPAN));
let SPAN_K = 1;
function setSpanScale(k) {
  SPAN_K = k;
  for (const key in SPAN0) {
    const nat = 2 * (key % 10 - Math.floor(key / 10));
    SPAN[key] = SPAN0[key].map(v => v < 0 ? v * k : v > nat ? nat + (v - nat) * k : v);
  }
}

// 親指で黒鍵を押す罰点。Parncutt の 1 点では、黒鍵から始まる音階（E♭・A♭ など）を親指で始めてしまい、ハノン第39番の運指と合わなかった
let THUMB_BLACK = 6, WEAK = 0.5; // 教本（ハノン第1番・第39番など）との答え合わせで決めた値（Parncutt はどちらも 1）

// 親指の上を（下を）またぐ指ごとの罰点（この検証で決めた値。教本の運指とくらべて調整）
const CROSS = [0, 0, 9, 5, 8, 20];
// 黒鍵の指から白鍵の親指へまたぐ（親指くぐり・指またぎ）のは楽（黒鍵は高く奥にあり、親指が下をくぐりやすい）。
// 教本の「黒鍵のあとの白鍵に親指」に当たる。CROSS からこの分を引く（Parncutt の親指くぐりの規則でも、この向きは罰点なし）。
// 0 だと黒鍵から始まる音階で 4 の指を避けて白鍵どうしでまたぎ、教本と合わなかった（答え合わせ 499 → 551/569）
const PASS_FROM_BLACK = 6;

// 1つの音と指の罰点
function noteCost(m, f) {
  let c = 0;
  if (f === 4 || f === 5) c += WEAK;         // 弱い指
  if (isBlack(m) && f === 1) c += THUMB_BLACK;  // 親指で黒鍵（教本の音階との答え合わせで重くした）
  return c;
}

// 前の音 (m1,f1) → 次の音 (m2,f2) の罰点。gap は前の音を離してから次を押すまでの秒
function pairCost(m1, f1, m2, f2, gap) {
  let c = 0;
  if (f1 === f2) {
    c = m1 === m2 ? 0 : 30 + Math.abs(m2 - m1); // 同じ指で別の鍵は、音が切れて手ごと動かす（なめらかに弾けない）
    // ただし休符などで前の音を 0.1 秒以上前に離しているなら、つなげなくてよいので軽く（v043、この検証で足した規則。
    // エリーゼの「ラ（1）・休み・ド（1）」が 39 点になり、書かれていない音の指がおかしくなっていた）
    if (m1 !== m2 && gap > 0.1) c = 2 + 0.5 * Math.abs(m2 - m1);
  } else {
    let a = f1, b = f2, iv = m2 - m1;
    if (a > b) { [a, b] = [b, a]; iv = -iv; }
    const [mnP, mnC, mnR, mxR, mxC, mxP] = SPAN[a * 10 + b];
    const th = a === 1;
    const pass = (f1 !== 1 && f2 === 1 && m2 > m1) || (f1 === 1 && f2 !== 1 && m2 < m1);
    if (pass) {
      // 親指くぐり・指またぎ（この検証で変えた規則）: Parncutt の「狭すぎ」をそのまま当てると、2 でまたぐほうが 3・4 より
      // 安くなり、1-2-1-2 と細かくまたぐ運指になる（教本と合わない）。またぐ指ごとの罰点と、全音より遠い分の罰点にする
      c += CROSS[b] + 1.5 * Math.max(0, -iv - 2);
    } else {
      if (iv > mxC) c += 2 * (iv - mxC);                 // 開きすぎ（楽な範囲の外）
      if (iv < mnC) c += 2 * (mnC - iv);
      if (iv < mnR) c += (th ? 2 : 1) * (mnR - iv);       // 狭すぎ（親指の組は2倍）
      if (iv > mxR) c += (th ? 1 : 2) * (iv - mxR);       // 広すぎ（親指以外の組は2倍）
      if (iv > mxP || iv < mnP) c += 3 * Math.max(iv - mxP, mnP - iv); // できる範囲の外（この検証で足した規則）
    }
    if ((f1 === 3 && f2 === 4) || (f1 === 4 && f2 === 3)) c += 1; // 3と4の続き
    // 親指以外で指を飛ばして、となりの鍵（全音以内）へ行くと、飛ばした指がはさまれる（この検証で足した規則）
    if (!th && Math.abs(m2 - m1) <= 2 && b - a > 1) c += 3 * (b - a - 1);
    if (f1 === 3 && f2 === 4 && !isBlack(m1) && isBlack(m2)) c += 1;
    if (pass) {
      const thumbM = f2 === 1 ? m2 : m1, otherM = f2 === 1 ? m1 : m2;
      if (isBlack(thumbM) === isBlack(otherM)) c += 1;
      else if (!isBlack(thumbM) && isBlack(otherM)) c -= Math.min(PASS_FROM_BLACK, CROSS[f1 === 1 ? f2 : f1]);
      else if (isBlack(thumbM) && !isBlack(otherM) && thumbM > otherM) c += 3;
    }
    if (f2 === 1 && isBlack(m2) && !isBlack(m1)) c += 2; // 白鍵から親指で黒鍵へ
    if (f1 === 1 && isBlack(m1) && !isBlack(m2)) c += 2;
    if (f2 === 5 && isBlack(m2) && !isBlack(m1)) c += 2; // 白鍵から小指で黒鍵へ
  }
  if (gap > 0.35) c *= 0.3; // 休みがあれば手を置き直せる
  return c;
}

// 続く3音の罰点（手の位置が変わる回数と大きさ、3・4・5の続き）。Parncutt ほか 1997 の3音の規則
function tripleCost(m1, f1, m2, f2, m3, f3, gap) {
  let c = 0;
  if (f1 === f3) {
    if (m1 !== m3) c += 1 + Math.abs(m3 - m1); // 同じ指が別の鍵へ = 手の位置が変わった
  } else {
    let a = f1, b = f3, iv = m3 - m1;
    if (a > b) { [a, b] = [b, a]; iv = -iv; }
    const [mnP, mnC, , , mxC, mxP] = SPAN[a * 10 + b];
    if (iv < mnC || iv > mxC) {
      const full = f2 === 1 && (m2 - m1) * (m3 - m2) > 0 && (iv > mxP || iv < mnP);
      c += full ? 2 : 1;                       // 手の位置の変化（全部・半分）
      c += iv < mnC ? mnC - iv : iv - mxC;     // 変化の大きさ
    }
  }
  if (f1 !== f2 && f2 !== f3 && f1 !== f3 && [f1, f2, f3].every(f => f >= 3)) c += 1; // 3・4・5の続き
  // 親指をくぐらせて半音・全音上へ行き、すぐ同じ側へ戻る（親指が両どなりより高い。エリーゼのミ・レ♯・ミを 3-1-3）。
  // 黒鍵からの親指くぐりは PASS_FROM_BLACK で安いので、行って戻るのが 0 点になっていた（v043、この検証で足した規則）
  if (f2 === 1 && f1 !== 1 && f3 !== 1 && m2 > m1 && m2 > m3 && m2 - m1 <= 2 && m2 - m3 <= 2) c += 3;
  if (gap > 0.35) c *= 0.3;
  return c;
}

// notes: [{m,t0,t1}] → 各音に f（1〜5）を入れ、合計の罰点を返す。
// side: 右手 1・左手 -1。左手は鍵盤をレ（D4=62）を中心に左右反転して右手の表で計算する（黒鍵の並びが保たれる）。
// 楽譜に運指が書いてある音（n.given）は、その指に固定する。
// 同時に押す音（30ms 以内に始まる音）は和音として1つの「イベント」にまとめる。和音がなければ、これまでのメロディの計算（planMelody）。
// 届かない和音は内側の音から外し、外した音に n.drop = true をつける（手で弾かない音になる）
function planFingering(notes, side) {
  const mir = notes.map(n => ({ m: side < 0 ? 124 - n.m : n.m, t0: n.t0, t1: n.t1, given: n.given, givenHold: n.givenHold, src: n }));
  mir.sort((a, b) => a.t0 - b.t0 || a.m - b.m);
  const ev = [];
  for (const n of mir) {
    const last = ev[ev.length - 1];
    if (last && n.t0 - last.t0 < 0.03) last.ns.push(n); else ev.push({ t0: n.t0, ns: [n] });
  }
  let cost;
  if (ev.every(e => e.ns.length === 1)) cost = planMelody(mir);
  else cost = planChords(ev);
  for (const n of mir) { n.src.f = n.f; n.src.fh = n.fh || 0; if (n.drop) n.src.drop = true; }
  return cost;
}

// ---- 和音 ----
// 和音の中の指の並び（低い音ほど小さい番号）。開きが「できる最大」を1半音より超える組は除く
function chordAssigns(ms, given) {
  const k = ms.length, out = [];
  const rec = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let f = start; f <= 5 - (k - acc.length - 1); f++) { acc.push(f); rec(f + 1, acc); acc.pop(); }
  };
  rec(1, []);
  const fits = (m1, f1, m2, f2) => m2 - m1 <= SPAN[f1 * 10 + f2][5] + 1;
  return out.filter(fs => fs.every((f, i) => !given[i] || given[i] === f) &&
    fs.every((f, i) => i === 0 || fits(ms[i - 1], fs[i - 1], ms[i], f)) && (k < 2 || fits(ms[0], fs[0], ms[k - 1], fs[k - 1])));
}
// 和音そのものの罰点: 弱い指・黒鍵の親指など（noteCost）と、となりあう指の開き。
// 開きは「指1本に白鍵1つずつ置いた形」（指の番号の差 × 白鍵の幅）からのずれ（白鍵1つ分で2点）。親指をふくむ組はよく開くので半分。
// （メロディの表 SPAN をそのまま使うと C-E-G で 1-2-4 と 1-3-5 が同じ点になり、教本の 1-3-5 にならなかった。この検証で決めた規則）
function chordCost(ms, fs) {
  let c = 0;
  for (let i = 0; i < ms.length; i++) {
    c += noteCost(ms[i], fs[i]);
    if (!i) continue;
    const dx = Math.abs(keyX(ms[i]) - keyX(ms[i - 1])), nat = (fs[i] - fs[i - 1]) * KB.W;
    c += 2 * Math.abs(dx - nat) / KB.W * (fs[i - 1] === 1 ? 0.5 : 1);
  }
  return c;
}
// イベント A（指 fa）→ B（指 fb）の罰点。どちらも単音なら pairCost と同じ。
// 和音がからむときは「手の位置」（いちばん低い音の 鍵の位置 −（指の番号−1）× 白鍵の幅 = 親指のあたりの位置）の動き
// （白鍵1つで1点）と、同じ指が別の鍵へ動く回数（1回 0.2 点）。休みがあれば 0.3 倍（この検証で決めた規則）
function handPos(E, fs) { return keyX(E.ns[0].m) - (fs[0] - 1) * KB.W; } // いちばん低い音（右手なら親指の側）の指から決まる位置
function eventTrans(A, fa, B, fb) {
  const gap = B.t0 - Math.max(...A.ns.map(n => n.t1));
  if (A.ns.length === 1 && B.ns.length === 1) return pairCost(A.ns[0].m, fa[0], B.ns[0].m, fb[0], gap);
  let same = 0;
  for (let i = 0; i < A.ns.length; i++) for (let j = 0; j < B.ns.length; j++) if (fa[i] === fb[j] && A.ns[i].m !== B.ns[j].m) same++;
  const c = Math.abs(handPos(B, fb) - handPos(A, fa)) / KB.W + 0.2 * same; // 和音では同じ形のまま指が新しい鍵へ移るのはふつうなので軽く
  return c * (gap > 0.35 ? 0.3 : 1);
}
function planChords(ev) {
  // 指の並びの候補。届かない和音は内側の音から外す（2音でも届かなければ、メロディの側の1音だけ残す）
  for (const e of ev) {
    e.ns.sort((a, b) => a.m - b.m);
    while (e.ns.length > 5) { const d = e.ns.splice(Math.floor(e.ns.length / 2), 1)[0]; d.drop = true; }
    // 一般的な運指（n.std）の和音が、この手の大きさでは開ききれないとき: その和音の指はコンピュータが選び直す（n.alt。子どもの手など）
    if (e.ns.some(n => n.given) && !chordAssigns(e.ns.map(n => n.m), e.ns.map(n => n.given || 0)).length &&
        chordAssigns(e.ns.map(n => n.m), e.ns.map(n => n.src.std ? 0 : n.given || 0)).length)
      for (const n of e.ns) if (n.src.std) { n.given = 0; n.src.given = 0; n.src.std = false; n.src.alt = true; }
    for (;;) {
      e.A = chordAssigns(e.ns.map(n => n.m), e.ns.map(n => n.given || 0));
      if (e.A.length || e.ns.length === 1) break;
      const d = e.ns.length > 2 ? e.ns.splice(Math.floor(e.ns.length / 2), 1)[0] : e.ns.shift();
      d.drop = true;
    }
    if (!e.A.length) e.A = [1, 2, 3, 4, 5].map(f => [f]); // 楽譜の運指が届かないとき
    e.cc = e.A.map(fs => chordCost(e.ns.map(n => n.m), fs));
  }
  const E = ev.length;
  if (E === 1) { let b = 0; ev[0].cc.forEach((c, i) => { if (c < ev[0].cc[b]) b = i; }); ev[0].A[b].forEach((f, i) => { ev[0].ns[i].f = f; }); return ev[0].cc[b]; }
  // 状態 = (前のイベントの並び, いまのイベントの並び)。3つとも単音のときだけ 3音の規則
  const cost = [], from = [];
  const tr = [];
  for (let e = 1; e < E; e++) tr[e] = ev[e - 1].A.map(fa => ev[e].A.map(fb => eventTrans(ev[e - 1], fa, ev[e], fb)));
  cost[1] = ev[0].A.map((_, p) => ev[1].A.map((_, c) => ev[0].cc[p] + ev[1].cc[c] + tr[1][p][c]));
  for (let e = 2; e < E; e++) {
    const a = ev[e - 2], b = ev[e - 1], n = ev[e];
    const single3 = a.ns.length === 1 && b.ns.length === 1 && n.ns.length === 1;
    const gap3 = single3 ? Math.max(n.t0 - b.ns[0].t1, b.t0 - a.ns[0].t1) : 0;
    cost[e] = []; from[e] = [];
    for (let p = 0; p < b.A.length; p++) {
      cost[e][p] = []; from[e][p] = [];
      for (let c = 0; c < n.A.length; c++) {
        let best = Infinity, bo = 0;
        for (let o = 0; o < a.A.length; o++) {
          let v = cost[e - 1][o][p];
          if (v === Infinity) continue;
          if (single3) v += tripleCost(a.ns[0].m, a.A[o][0], b.ns[0].m, b.A[p][0], n.ns[0].m, n.A[c][0], gap3);
          if (v < best) { best = v; bo = o; }
        }
        cost[e][p][c] = best + n.cc[c] + tr[e][p][c];
        from[e][p][c] = bo;
      }
    }
  }
  let bp = 0, bc = 0;
  cost[E - 1].forEach((row, p) => row.forEach((v, c) => { if (v < cost[E - 1][bp][bc]) { bp = p; bc = c; } }));
  const total = cost[E - 1][bp][bc];
  for (let e = E - 1; e >= 1; e--) {
    ev[e].A[bc].forEach((f, i) => { ev[e].ns[i].f = f; });
    ev[e - 1].A[bp].forEach((f, i) => { ev[e - 1].ns[i].f = f; });
    if (e >= 2) { const o = from[e][bp][bc]; bc = bp; bp = o; }
  }
  return total;
}

// ---- 押さえたまま指をかえる（指の置きかえ、v044〜）----
// 長くのばす音は、押した指（f）から別の指（g）へ、鍵を押さえたままかえられる。次の音へは g から数える。
// 教本の「4-5」（4 で押して 5 にかえる）。（2026-10-12 まで、きらきら星のソで使っていた。いまの収録曲にはないが、楽譜ファイルの運指で使える）。
// のばす長さ SUB_MIN 秒以上の単音だけ。罰点 SUB_COST はこの検証で決めた値（目安）
// SUB_COST: 2〜3 だと推定がかえ指を多用して教本と合わなくなった（歓喜の歌 30/30 → 22/30・答え合わせ 664 → 634）。4 以上で前と同じ 664/704。
// SUB_ADJ: となりの指どうしだけ（楽譜に書かれた置きかえはどの指でも）。2026-10-11 の答え合わせで決めた値
let SUB_MIN = 0.4, SUB_COST = 6, SUB_ADJ = true;
// 音ごとの指の選び方: [押す指, かえた先の指]（かえないなら同じ）。楽譜の運指（given・givenHold）があればそれだけ。
// given だけでかえる指が書かれていなければ、かえない
function fingerOpts(n) {
  const out = [];
  const long = n.t1 - n.t0 >= SUB_MIN;
  for (let f = 1; f <= 5; f++) {
    if (n.given && n.given !== f) continue;
    for (let g = 1; g <= 5; g++) {
      if (g !== f && (!long || (n.given && !n.givenHold) || (SUB_ADJ && Math.abs(g - f) !== 1 && n.givenHold !== g))) continue;
      if (n.givenHold && n.givenHold !== g) continue;
      out.push([f, g]);
    }
  }
  return out;
}

// ---- メロディ（単音だけ）: 3音の規則があるので、状態を「前の音の指・いまの音の指」の組にした動的計画法 ----
// 指は fingerOpts の [押す指, かえた先の指]。前の音からは、かえた先の指（g）で数える
function planMelody(notes) {
  const N = notes.length;
  if (!N) return 0;
  const O = notes.map(fingerOpts);
  const own = (i, o) => noteCost(notes[i].m, o[0]) + (o[0] !== o[1] ? SUB_COST : 0);
  if (N === 1) { const o = O[0].reduce((a, b) => own(0, b) < own(0, a) ? b : a); notes[0].f = o[0]; notes[0].fh = o[1] !== o[0] ? o[1] : 0; return own(0, o); }
  // cost[i][p][q]: 音 i-1 の選び方 p・音 i の選び方 q までの最小
  const cost = [], from = [];
  const g01 = notes[1].t0 - notes[0].t1;
  cost[1] = O[0].map(a => O[1].map(b => own(0, a) + own(1, b) + pairCost(notes[0].m, a[1], notes[1].m, b[0], g01)));
  for (let i = 2; i < N; i++) {
    const a = notes[i - 2], b = notes[i - 1], n = notes[i];
    const gap = n.t0 - b.t1, gap3 = Math.max(gap, b.t0 - a.t1);
    cost[i] = []; from[i] = [];
    for (let p = 0; p < O[i - 1].length; p++) {
      cost[i][p] = []; from[i][p] = [];
      const bo = O[i - 1][p];
      for (let q = 0; q < O[i].length; q++) {
        const no = O[i][q];
        const base = pairCost(b.m, bo[1], n.m, no[0], gap) + own(i, no);
        let best = Infinity, bi = 0;
        for (let o = 0; o < O[i - 2].length; o++) {
          const prev = cost[i - 1][o][p];
          if (prev === Infinity) continue;
          const c = prev + base + tripleCost(a.m, O[i - 2][o][1], b.m, bo[1], n.m, no[0], gap3);
          if (c < best) { best = c; bi = o; }
        }
        cost[i][p][q] = best; from[i][p][q] = bi;
      }
    }
  }
  let bp = 0, bq = 0;
  cost[N - 1].forEach((row, p) => row.forEach((v, q) => { if (v < cost[N - 1][bp][bq]) { bp = p; bq = q; } }));
  const total = cost[N - 1][bp][bq];
  const set = (i, o) => { notes[i].f = o[0]; notes[i].fh = o[1] !== o[0] ? o[1] : 0; };
  for (let i = N - 1; i >= 1; i--) {
    set(i, O[i][bq]); set(i - 1, O[i - 1][bp]);
    if (i >= 2) { const o = from[i][bp][bq]; bq = bp; bp = o; }
  }
  return total;
}
