// ui.js — パネル（分布・グラフ・結果・見つけてみよう）
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = v => Math.round(v * 100) + '%';

function genTimeText(gen) {
  const m = (gen - 1) * 3;
  if (m === 0) return 'はじめ';
  const y = Math.floor(m / 12), mm = m % 12;
  return '約' + (y ? y + '年' : '') + (mm ? mm + 'か月' : '') + '後';
}

// 性質のまとめの言い方（量的なものは平均、1つの遺伝子のものは「持っている虫の割合」）
function carriers(bugs, id) { return bugs.length ? bugs.filter(b => b.p[id] > 0).length / bugs.length : 0; }
function traitSummary(bugs, id) {
  const t = TRAIT[id];
  if (t.kind === 'poly') { const s = popStats(bugs); return {v: s[id], txt: s[id].toFixed(2)}; }
  const c = carriers(bugs, id), both = bugs.length ? bugs.filter(b => b.p[id] === 2).length / bugs.length : 0;
  return {v: c, txt: pct(c), both};
}

// ---- 分布 ----
function buildHists() {
  $('hists').innerHTML = TRAITS.map(t => `
    <div class="hist" data-id="${t.id}">
      <div class="hh"><b style="color:${t.color}">${t.name}</b><span id="hv-${t.id}"></span></div>
      <canvas id="hc-${t.id}" width="300" height="${t.kind === 'poly' ? 70 : 56}"></canvas>
      <div class="hx"><span>${t.lo}</span><span>${t.hi}</span></div>
    </div>`).join('');
}

function drawHist(id, alive, killed, first) {
  const t = TRAIT[id], cv = $('hc-' + id), g = cv.getContext('2d'), Wc = cv.width, Hc = cv.height;
  const ha = histogram(alive, id), hk = histogram(killed, id), hf = histogram(first, id);
  const bins = ha.length, total = alive.length + killed.length || 1;
  const fTot = first.length || 1;
  const maxF = Math.max(...ha.map((v, i) => (v + hk[i]) / total), ...hf.map(v => v / fTot), 0.05);
  g.clearRect(0, 0, Wc, Hc);
  const bw = Wc / bins, top = 4, base = Hc - (t.kind === 'poly' ? 4 : 16);
  const sy = v => (base - top) * v / maxF;
  for (let i = 0; i < bins; i++) {
    const a = ha[i] / total, k = hk[i] / total, x = i * bw + bw * 0.12, w = bw * 0.76;
    g.fillStyle = t.color; g.fillRect(x, base - sy(a), w, sy(a));
    g.fillStyle = 'rgba(150,150,160,.55)'; g.fillRect(x, base - sy(a) - sy(k), w, sy(k));
  }
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([3, 3]); g.lineWidth = 1.2; g.beginPath();
  for (let i = 0; i < bins; i++) {
    const y = base - sy(hf[i] / fTot);
    if (i === 0) g.moveTo(i * bw, y); else g.lineTo(i * bw, y);
    g.lineTo((i + 1) * bw, y);
  }
  g.stroke(); g.setLineDash([]);
  g.strokeStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(0, base + .5); g.lineTo(Wc, base + .5); g.stroke();
  if (t.kind === 'single') {
    g.fillStyle = 'rgba(220,210,200,.7)'; g.font = '11px "Zen Kaku Gothic New",sans-serif'; g.textAlign = 'center';
    ['持っていない', '1本', '2本'].forEach((s, i) => g.fillText(s, (i + .5) * bw, Hc - 3));
  }
  const sm = traitSummary(alive, id);
  $('hv-' + id).textContent = t.kind === 'poly' ? `平均 ${sm.txt}` : `持っている虫 ${sm.txt}`;
}

function updateHists(w, first) {
  const alive = w.pop.filter(b => b.alive);
  for (const t of TRAITS) drawHist(t.id, alive, w.killed, first);
}

// ---- 世代ごとのグラフ ----
function drawChart(hist) {
  const cv = $('chart'), g = cv.getContext('2d'), Wc = cv.width, Hc = cv.height;
  g.clearRect(0, 0, Wc, Hc);
  const L = 44, R = 12, T = 14, B = 30, pw = Wc - L - R, ph = Hc - T - B;
  const n = Math.max(hist.length, 10);
  const x = i => L + (n === 1 ? 0 : pw * i / (n - 1));
  const y = v => T + ph * (1 - v);
  g.font = '18px "IBM Plex Mono",monospace'; g.fillStyle = 'rgba(220,210,200,.6)'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of [0, 0.5, 1]) {
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(L, y(v)); g.lineTo(Wc - R, y(v)); g.stroke();
    g.fillText(v === 1 ? '100%' : v === 0.5 ? '50%' : '0', L - 6, y(v));
  }
  // 数（棒）
  const bw = Math.max(2, pw / n * 0.6);
  hist.forEach((h, i) => {
    g.fillStyle = 'rgba(200,180,150,.22)'; const hh = ph * h.n / GENE.K;
    g.fillRect(x(i) - bw / 2, T + ph - hh, bw, hh);
  });
  // 性質（線）
  for (const t of TRAITS) {
    g.strokeStyle = t.color; g.lineWidth = 3; g.beginPath();
    hist.forEach((h, i) => { const v = h[t.id]; if (i === 0) g.moveTo(x(i), y(v)); else g.lineTo(x(i), y(v)); });
    g.stroke();
    if (hist.length === 1) { g.fillStyle = t.color; g.beginPath(); g.arc(x(0), y(hist[0][t.id]), 4, 0, 7); g.fill(); }
  }
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = 'rgba(220,210,200,.6)';
  const step = n <= 12 ? 1 : n <= 30 ? 5 : 10;
  for (let i = 0; i < n; i += step) g.fillText(String(i + 1), x(i), Hc - 8);
}
function buildLegend() {
  $('chartLegend').innerHTML = TRAITS.map(t =>
    `<span><i style="background:${t.color}"></i>${t.name}${t.kind === 'poly' ? '（平均）' : '（持っている割合）'}</span>`).join('') +
    '<span><i class="bar"></i>虫の数（80匹で上まで）</span><span class="xl">横: 世代</span>';
}

// 量的な性質は 0〜1 の平均、1つの遺伝子のものは「持っている虫の割合」でグラフにする
function histRow(gen, bugs, rec) {
  const r = {gen, n: bugs.length, rec};
  for (const t of TRAITS) r[t.id] = traitSummary(bugs, t.id).v;
  return r;
}

// ---- いまの世代のカード ----
function updateGenCard(S) {
  const w = S.world, alive = w ? w.pop.filter(b => b.alive).length : S.pop.length;
  $('genNo').textContent = S.gen;
  $('popNo').textContent = alive;
  $('genTime').textContent = genTimeText(S.gen);
  const r = w ? w.rec : null;
  $('nightStats').innerHTML = r ? `
    <span>叩いて退治</span><b>${r.swat} 匹 <small>（${r.swings} 回ふった）</small></b>
    <span>にげられた</span><b>${r.dodges} 回</b>
    <span>スプレーで退治</span><b>${r.spray} 匹 <small>（${r.sprayUsed.toFixed(1)} 秒）</small></b>
    <span>毒エサで退治</span><b>${r.bait} 匹</b>
    <span>毒エサを避けた</span><b>${r.rejects} 回</b>` : '';
}

// ---- 夜の結果 ----
function showResult(S, info) {
  const {gen, before, survivors, kids, rec, note} = info;
  $('resTitle').textContent = kids.length ? `${gen}世代目の夜が終わりました` : '全滅させました！';
  const rows = TRAITS.map(t => {
    const a = traitSummary(before, t.id), b = traitSummary(kids, t.id);
    const d = b.v - a.v, arrow = Math.abs(d) < 0.01 ? '→' : d > 0 ? '↑' : '↓';
    const cls = Math.abs(d) < 0.01 ? '' : d > 0 ? 'up' : 'down';
    return `<tr><th style="color:${t.color}">${t.name}</th><td>${a.txt}</td><td class="${cls}">${arrow}</td><td class="${cls}"><b>${b.txt}</b></td></tr>`;
  }).join('');
  const killed = rec.swat + rec.spray + rec.bait;
  let msg;
  if (!kids.length) msg = `<p>${gen}世代目で、台所の虫がいなくなりました。進化が追いつく前に退治しきれたということです。本物の家では、となりの部屋や外から新しく入ってくることがよくあります。</p>`;
  else msg = `<p>この夜に <b>${killed} 匹</b>を退治して、<b>${survivors.length} 匹</b>が生き残りました。生き残った虫が子を残し、次の世代は <b>${kids.length} 匹</b>（${genTimeText(gen + 1)}）。</p>`;
  $('resBody').innerHTML = (note ? `<p class="note">${note}</p>` : '') + msg + (kids.length ? `
    <table class="restab"><thead><tr><th></th><th>この世代</th><th></th><th>子の世代</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="small">警戒心・察知は平均（0〜1）、殺虫剤・糖ぎらいは遺伝子を持っている虫の割合。${insight(before, survivors, rec)}</p>` : '');
  $('btnNext').textContent = kids.length ? '次の世代の夜へ' : 'はじめからやり直す';
  $('resultOv').hidden = false;
}

// その夜の「選ばれ方」をひとことで
function insight(before, survivors, rec) {
  const tips = [];
  const killedBy = rec.swat >= rec.spray && rec.swat >= rec.bait ? 'swat' : rec.spray >= rec.bait ? 'spray' : 'bait';
  if (rec.swat + rec.spray + rec.bait === 0) return '何もしなかったので、代わりの損がある性質は少し減りやすくなります。';
  if (killedBy === 'swat') tips.push('叩かれたのは、外に長くいた・気づくのが遅かった虫。生き残りには、警戒心・察知の強いものが多く残りました。');
  if (killedBy === 'spray') tips.push('スプレーで死んだのは、殺虫剤に弱い虫。霧の中で生き残ったのは、効きにくい遺伝子を持つ虫です。');
  if (killedBy === 'bait') tips.push('毒エサを食べたのは、ブドウ糖を甘いと感じる虫。「にがい！」と避けた虫が生き残りました。');
  return tips.join('');
}

// ---- 見つけてみよう ----
const QUESTS = [
  {id:'swat10', t:'1回の夜に<b>10匹</b>を叩いて退治する', s:'1世代目なら、虫はのんびりしています'},
  {id:'dodge', t:'スリッパに<b>気づいて逃げる</b>虫を5回見る', s:'察知の鋭い虫は、影が落ちる前に走り出す'},
  {id:'reject', t:'毒エサを<b>「にがい！」</b>と避ける虫を見る', s:'糖ぎらいの遺伝子を持つ虫'},
  {id:'mist', t:'スプレーの霧の中で<b>生き残る</b>虫を見る', s:'色分けを「殺虫剤」にすると見つけやすい'},
  {id:'kdrHalf', t:'殺虫剤に強い遺伝子を持つ虫を、<b>半分より多く</b>する', s:'スプレーを何世代も続けると…（早送りも使える）'},
  {id:'sense15', t:'察知の平均を、1世代目の<b>1.5倍</b>にする', s:'叩くだけを続けると…'},
  {id:'decline', t:'道具をやめて、強い性質が<b>減っていく</b>のを見る', s:'「なにもしない」を何世代か続ける。代わりの損があるから'},
  {id:'extinct', t:'<b>全滅</b>させる', s:'進化が追いつく前に。できるかな'},
];
function buildQuests() {
  $('quests').innerHTML = QUESTS.map(q => `<li data-id="${q.id}"><span class="mk"></span><span>${q.t}<small>${q.s}</small></span></li>`).join('');
}
function syncQuests(done) {
  for (const li of $('quests').children) li.classList.toggle('done', done.has(li.dataset.id));
}

let toastTimer = 0;
function toast(html, ms = 3600) {
  const el = $('toast'); el.innerHTML = html; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function buildPolicies(S) {
  $('policies').innerHTML = Object.entries(POLICIES).map(([k, p]) =>
    `<button class="preset" data-v="${k}" aria-pressed="${k === S.policy}">${p.name}<small>${policyDesc(k, S)}</small></button>`).join('');
}
function policyDesc(k, S) {
  if (k === 'mine') {
    const m = S.lastManual;
    if (!m) return 'まだ自分で退治していない';
    const parts = [];
    if (m.swatRate > 0.05) parts.push(`叩く ${Math.round(m.swatRate * NIGHT)}回`);
    if (m.sprayFrac > 0.005) parts.push(`スプレー ${(m.sprayFrac * NIGHT).toFixed(0)}秒`);
    parts.push(`毒エサ ${S.world ? S.world.baits.length : 0}個`);
    return '前の夜と同じ: ' + parts.join('・');
  }
  return {swat:'1晩に約60回', spray:'1晩に10秒', bait:'毒エサを3つ置く', mix:'叩く・スプレー・毒エサ', none:'毒エサも片づける'}[k];
}
