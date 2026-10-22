// クモがハエをつかまえるまで — メイン（時間・記録・操作・描画ループ、デバッグ用の窓口）
'use strict';
window.__sphuErr = [];
window.addEventListener('error', e => window.__sphuErr.push(String(e.message)));

const $ = id => document.getElementById(id);
const DT = 0.0005;                  // 計算の刻み（0.5ms）
const P = { speed: 'dill', model: 'size', crouch: true, dir: 0, fastV: 30, prey: 'housefly', lux: 300, look: 'simple' };
const S = { st: null, hist: [], view: 0, playing: true, rate: 'auto', camR: 95, rims: true, guide: true, paused: false, seed: 1 };
// 1回目は「つかまえた例」を見せる: 初期設定でつかまえる1回目の数の組（ばらつきの中の本物の1回）。2回目からは「もう1回」で別の組
SD.setP(P);

const snap = st => Object.assign({}, st, { ev: Object.assign({}, st.ev), jump: st.jump && Object.assign({}, st.jump) });
function reset() { S.st = M.newState(P, S.seed); S.hist = [snap(S.st)]; S.view = 0; S.playing = true; S.camR = 95; }
// とちゅうで条件を変えたら、いま見ている時刻から先を計算しなおす
function changed() {
  S.hist.length = S.view + 1; S.st = snap(S.hist[S.view]);
  S.playing = !M.done(S.st);
}

// 再生の速さ。自動: ふだんは 1 倍、跳びつき以降かハエが動いたあとは 1/50
function curRate(s) {
  if (S.rate !== 'auto') return +S.rate;
  return (s.ev.pounce != null || s.fl !== 'rest') ? 0.02 : 1;
}
function advance(real) {
  if (!S.playing) return;
  let simT = real * curRate(S.hist[S.view]);
  while (simT > 0) {
    if (S.view < S.hist.length - 1) S.view++;
    else if (!M.done(S.st)) { M.step(S.st, P, DT); S.hist.push(snap(S.st)); S.view++; }
    else { S.playing = false; break; }
    simT -= DT;
  }
}

// ---- 描画
const cvs = { scene: $('scene'), fly: $('vFly'), spider: $('vSpider'), graph: $('graph') };
const ctx = {}; for (const k in cvs) ctx[k] = cvs[k].getContext('2d');
function fit(c, g) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); return [Math.max(1, c.clientWidth), Math.max(1, c.clientHeight)];
}
function status(s) {
  const pr = M.prey(P), vd = M.verdict(s, P), nm = pr.short || pr.name, roach = pr.draw === 'roach';
  const go = roach ? '走り出した' : '飛び立った', ex = S.seed === 1 ? 'この1回（つかまえた例）' : 'この1回';
  const pct = vd && vd.p != null && vd.k !== 'early' ? `<small>　何百回くり返すと、つかまえるのは 約${Math.round(vd.p * 100)}%</small>` : '';
  if (vd && vd.k && M.done(s)) {
    if (vd.k === 'early') return `<b class="escaped">${nm}が先に気づいて逃げた</b><small>（クモが跳ぶ前。あと ${s.D.toFixed(1)}mm）</small>`;
    const m = vd.m != null ? Math.abs(vd.m * 1000).toFixed(0) : null;
    if (vd.k === 'escaped') return `${ex}: <b class="escaped">逃げた</b>（前脚がとどく ${m}ms 前に${go}）${pct}`;
    return `${ex}: <b class="caught">つかまえた</b>${m ? `（${nm}が${roach ? '走り出す' : '飛び立つ'} ${m}ms 前に前脚がとどいた）` : `（${nm}は間に合わなかった）`}${pct}`;
  }
  if (s.sp === 'turn') return `クモが${nm}を見つけた<small>（${nm}が 5.5° に見える距離 ${s.D.toFixed(0)}mm）</small>`;
  if (s.sp === 'stalk') return `${nm}は${s.fl === 'rest' ? 'まだ気づかない' : '気づいた'}<small>（クモ ${s.V.toFixed(1)}mm/s${s.outside ? '・測った範囲の外なので推定' : ''}）</small>`;
  if (s.sp === 'prep') return `踏み切り（脚で押して速める）${(s.spT * 1000).toFixed(0)} / ${(s.prm.tp * 1000).toFixed(0)}ms` + (s.fl !== 'rest' ? `・${nm}が気づいた` : `・${nm}はまだ`);
  if (s.sp === 'flight') return `跳んで ${((s.t - s.jump.t0) * 1000).toFixed(0)}ms` + (s.fl === 'air' ? `・${nm}は${go}` : s.fl === 'wing' ? `・${nm}が${roach ? '向きを変えた' : '翅を上げた'}` : `・${nm}はまだ`);
  if (s.sp === 'contact') return 'クモがとどいた' + (s.fl === 'air' ? `<small>（${nm}はもう${go}）</small>` : '');
  if (s.sp === 'stop') return `${nm}が${go}ので、クモは止まった`;
  return '';
}
function draw() {
  const s = S.hist[S.view];
  const want = Math.max(28, Math.min(95, s.D * 1.6 + 22));   // 近づくと寄って見る（再生中はなめらかに、止めているときはすぐ）
  S.camR = S.playing ? S.camR + (want - S.camR) * 0.08 : want;
  const r = curRate(s), slow = r < 1;
  let [w, h] = fit(cvs.scene, ctx.scene);
  SC.drawScene(ctx.scene, w, h, S.hist, S.view, P, S.camR, { slow, slowLabel: slow ? 'スロー 1/' + Math.round(1 / r) : '', guide: S.guide });
  [w, h] = fit(cvs.fly, ctx.fly); VW.fly(ctx.fly, w, h, s, P, { rims: S.rims, guide: S.guide });
  [w, h] = fit(cvs.spider, ctx.spider); VW.spider(ctx.spider, w, h, s, P, { guide: S.guide });
  if ($('graphBox').open) { [w, h] = fit(cvs.graph, ctx.graph); GR.draw(ctx.graph, w, h, S.hist, S.view, P); }
  $('status').innerHTML = status(s);
  const ph = $('pin').offsetHeight; if (ph !== S.pinH) { S.pinH = ph; document.documentElement.style.setProperty('--pinH', ph + 'px'); }
  $('tl').max = Math.max(1, S.hist.length - 1); $('tl').value = S.view;
  $('play').textContent = S.playing ? '❚❚' : '▶';
}

let last = performance.now();
function loop(now) {
  const real = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; /* 最初のコマは now が last より前のことがある */
  if (!S.paused) advance(real);
  draw(); requestAnimationFrame(loop);
}

// ---- 操作
function seg(id, attr, fn) {
  const box = $(id);
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset[attr]);
  });
}
seg('speed', 's', v => { P.speed = v; changed(); });
seg('model', 'm', v => { P.model = v; changed(); });
seg('dir', 'd', v => { P.dir = +v; changed(); });
seg('prey', 'p', v => { P.prey = v; $('modelRow').hidden = M.prey(P).escape.kind !== 'vision'; $('preyCap').textContent = M.prey(P).short || M.prey(P).name; reset(); });
seg('light', 'l', v => { P.lux = +v; });
seg('look', 'k', v => { P.look = v; });
seg('rate', 'r', v => { S.rate = v; });
$('crouch').addEventListener('change', e => { P.crouch = e.target.checked; changed(); });
$('rims').addEventListener('change', e => { S.rims = e.target.checked; });
$('guide').addEventListener('change', e => { S.guide = e.target.checked; });
$('play').addEventListener('click', () => { if (!S.playing && M.done(S.hist[S.view]) && S.view === S.hist.length - 1) reset(); else S.playing = !S.playing; });
$('restart').addEventListener('click', reset);
$('again').addEventListener('click', () => { S.seed = 1 + Math.floor(Math.random() * 1e6); reset(); });
$('tl').addEventListener('input', e => { S.view = +e.target.value; S.playing = false; });

reset(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__sphu = {
  S, P,
  simRun(sec) { for (let t = 0; t < sec; t += 1 / 60) advance(1 / 60); draw(); },
  toEnd() { while (!M.done(S.st)) { M.step(S.st, P, DT); S.hist.push(snap(S.st)); } S.view = S.hist.length - 1; S.playing = false; draw(); },
  at(t) { S.view = Math.max(0, S.hist.findIndex(s => s.t >= t)); if (S.view < 0) S.view = S.hist.length - 1; S.playing = false; draw(); },
  set(o) { Object.assign(P, o); changed(); draw(); },
};
