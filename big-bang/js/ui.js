// ビッグバンから惑星まで — 文字（ひとこと・数え・案内「つぎへ」・いちばん大きい岩の表）
import { MEARTH, MSUN, AU, tempOfE, energy } from './physics.js';
import { WORK_SCALE, HEAT_SCALE, MASS_SCALE } from './gpu.js';

const ME = MEARTH / MSUN;
const $ = id => document.getElementById(id);
export const fmt = (x, d = 2) => x >= 100 ? Math.round(x).toLocaleString('ja-JP') : x > 0 && x < 0.01 ? x.toPrecision(2) : x.toFixed(d);
const yrs = t => t < 10 ? `${t.toFixed(1)} 年` : t < 1e4 ? `${Math.round(t).toLocaleString('ja-JP')} 年` : `${(t / 1e4).toFixed(1)} 万年`;

// 案内（1段に新しいもの1つ。図の下に1〜2行）
export const TOUR = [
  S => `太陽のまわりをまわる岩。点の1つ1つが岩です（はじめは直径 約${fmt(S.R0 * AU * 2 / 1000, 0)} km、円盤ぜんぶで ${S.n0.toLocaleString('ja-JP')} 個。※ 大きさは目印）。`,
  () => `太陽に近いほど速くまわります。「近くで」（いっしょに回るカメラ）で見ると、<b>内側の岩は右へ追いこし、外側の岩は左へ遅れて</b>いきます。`,
  () => `図を<b>指で押さえる</b>と、輪の中の岩が真ん中へ集まって<b class="g">くっつく</b>（緑の輪）。くっつくほど大きくなります。`,
  () => `指を<b>速く動かす</b>ほど強く寄せるので、はげしくぶつかって<b>砕ける</b>（オレンジの線）。分かれ目は 寄せる速さ 秒速 1.5 km くらい（指の横に出ます）。`,
  () => `ぶつかると<b>熱くなる</b>（赤 → オレンジ → 白）。とけた岩は表面から光を出して冷え、固まると中の熱はなかなか逃げません。`,
  S => `くっつくほど重くなり、まわりの岩を引きよせてまた育つ。いちばん大きいのは<b>地球の ${fmt(S.big / ME, 3)} 倍</b>（光る輪。見えないときは「全体」で）。`,
  S => `本物は、地球ほどになるまで<b>数千万〜1億年</b>。ここでは早く進むよう、ぶつかる大きさを <b>×${S.F}</b> にしています。`,
];

export class UI {
  constructor() { this.step = -1; this.W = 0; this.Q = 0; this.dust = 0; this.sun = 0; this.lost = 0; this.coll = 0; this.merge = 0; this.frag = 0; this.top = []; }
  reset() { this.W = 0; this.Q = 0; this.dust = 0; this.sun = 0; this.lost = 0; this.coll = 0; this.merge = 0; this.frag = 0; this.top = []; }
  next(S) { this.step = (this.step + 1) % TOUR.length; this.say(S); }
  yrs(t) { return yrs(t); }
  say(S) {
    if (S.mode === 'replay' && this.step < 0) {
      $('say').innerHTML = S.s >= 1 && this.end ? this.end
        : `このPCで前もって計算した <b>${yrs(S.rpEnd || 0)}</b> を再生しています。<b>時間のつまみ</b>で好きな時へ、<b>「結末へ」</b>で最後へ。図を<b>押さえると</b>、その時から<b>あなたの宇宙</b>に分かれて計算がはじまります。`;
      return;
    }
    if (this.step < 0) { $('say').innerHTML = '太陽ができたばかりのころ、地球のあたりの岩を近くで。図を<b>押さえる</b>と岩が集まって<b class="g">くっつき</b>、<b>速くかきまぜる</b>と<b>砕けます</b>。<b>「つぎへ」</b>で案内。'; return; }
    $('say').innerHTML = `<span class="n">${this.step + 1}/${TOUR.length}</span>` + TOUR[this.step](S);
  }
  // 記録の再生から数える（コマの表と、そのコマの岩）
  fromReplay(S, rp) {
    const f = rp.info(S.t), top = rp.top(S.t, 6), c = f.c || {}; S.rpEnd = rp.end;
    S.alive = f.n; S.big = top[0]?.m || 0; this.top = top;
    const nBig = top.filter(b => b.m / ME >= 0.05).length;
    this.end = `結末（${yrs(rp.end)}）: 岩 ${f.n.toLocaleString('ja-JP')} 個のうち、地球の 0.05 倍より大きい星が <b>${nBig} 個</b>（いちばん大きいのは地球の ${fmt(S.big / ME, 2)} 倍）。本物の研究では、約2億年で地球型の惑星が3〜4個（Chambers 2001）。ここは ぶつかる大きさ ×${rp.idx.F} で早めています。図を押さえると、ここから<b>あなたの宇宙</b>で続きを計算します。`;
    $('ruler').innerHTML = `<span class="big">${yrs(S.t)}</span>　岩 ${f.n.toLocaleString('ja-JP')} 個　いちばん大きい 地球の ${fmt(S.big / ME, 3)} 倍　ぶつかり ${(c.coll || 0).toLocaleString('ja-JP')} 回`;
    $('tlv').textContent = yrs(S.t);
    if (S.frame % 24 === 0) {
      const pct = x => (100 * x / S.mTot).toFixed(2) + '%';
      $('readout').innerHTML = [`<b>記録の再生</b>（このPCで ${(rp.idx.computeSec / 60).toFixed(0)} 分かけて計算。岩 ${rp.idx.n.toLocaleString('ja-JP')} 個・ぶつかる大きさ ×${rp.idx.F}・${rp.idx.made}）`,
        `ぶつかり <b>${(c.coll || 0).toLocaleString('ja-JP')}</b> 回（くっつく ${(c.merge || 0).toLocaleString('ja-JP')}・砕ける ${(c.frag || 0).toLocaleString('ja-JP')}）`,
        `重さの行き先: ちり ${pct(c.dust || 0)}・太陽へ ${pct(c.sun || 0)}・とび出し ${pct(c.lost || 0)}`].map(s => `<span>${s}</span>`).join('');
      $('topList').innerHTML = '<tr><th></th><th>重さ（地球＝1）</th><th>太陽からの距離</th><th>温度</th></tr>' +
        top.map((b, k) => `<tr><td>${k + 1}</td><td>${fmt(b.m / ME, 4)}</td><td>${b.r.toFixed(2)} AU</td><td>${Math.round(b.T).toLocaleString('ja-JP')} K</td></tr>`).join('');
    }
  }
  // 読み出した状態から数える
  absorb(S, B, C) {
    this.dust += C[0] / MASS_SCALE; this.sun += C[1] / MASS_SCALE; this.lost += C[2] / MASS_SCALE;
    this.coll += C[3]; this.merge += C[4]; this.frag += C[5];
    this.W += (C[6] - C[7]) / WORK_SCALE; this.Q += C[8] / HEAT_SCALE;
    const n = S.n; let alive = 0, mass = 0, hot = 0; const list = [];
    for (let i = 0; i < n; i++) { const o = i * 16, m = B[o + 3]; if (m <= 0) continue;
      alive++; mass += m; const T = tempOfE(B[o + 12]); if (T > 1200) hot++;
      list.push(i); }
    list.sort((a, b) => B[b * 16 + 3] - B[a * 16 + 3]);
    this.top = list.slice(0, 6).map(i => { const o = i * 16; return { i, m: B[o + 3], x: B[o], y: B[o + 1], r: Math.hypot(B[o], B[o + 1], B[o + 2]), T: tempOfE(B[o + 12]) }; });
    S.alive = alive; S.mass = mass; S.hot = hot; S.big = this.top[0]?.m || 0; S.E = energy(B, n);
    if (S.E0 === undefined) S.E0 = S.E;
  }
  ruler(S) {
    const w = S.E0 ? 100 * this.W / Math.abs(S.E0) : 0;
    $('ruler').innerHTML = `<span class="big">${yrs(S.t)}</span>　岩 ${S.alive.toLocaleString('ja-JP')} 個　いちばん大きい 地球の ${fmt(S.big / ME, 3)} 倍　` +
      `<span class="${Math.abs(w) > 5 ? 'bad' : ''}">指が足したエネルギー ${w >= 0 ? '+' : ''}${w.toFixed(1)}%</span>`;
  }
  readout(S) {
    const pct = x => (100 * x / S.mTot).toFixed(2) + '%';
    $('readout').innerHTML = [
      `ぶつかり <b>${this.coll.toLocaleString('ja-JP')}</b> 回（くっつく ${this.merge.toLocaleString('ja-JP')}・砕ける ${this.frag.toLocaleString('ja-JP')}）`,
      `熱い岩（1200 K より上） <b>${S.hot}</b> 個`,
      `重さの行き先: 岩 <b>${pct(S.mass)}</b>・ちり ${pct(this.dust)}・太陽へ ${pct(this.sun)}・とび出し ${pct(this.lost)}`,
      `ぶつかりで熱になったエネルギー <b>${S.E0 ? (100 * this.Q / Math.abs(S.E0)).toFixed(3) : 0}%</b>（公転のエネルギーにくらべて）`,
      `計算: 岩 ${S.n0.toLocaleString('ja-JP')} 個ぶんの席 × 1コマ ${S.sub} 歩（${fmt(S.yps, 1)} 年/秒）`,
    ].map(s => `<span>${s}</span>`).join('');
    $('topList').innerHTML = '<tr><th></th><th>重さ（地球＝1）</th><th>太陽からの距離</th><th>温度</th></tr>' +
      this.top.map((b, k) => `<tr><td>${k + 1}</td><td>${fmt(b.m / ME, 4)}</td><td>${b.r.toFixed(2)} AU</td><td>${Math.round(b.T).toLocaleString('ja-JP')} K</td></tr>`).join('');
  }
}
