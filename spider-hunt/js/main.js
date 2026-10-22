// クモがハエをつかまえるまで — メイン（時間・記録・操作・描画ループ、デバッグ用の窓口）
'use strict';
window.__sphuErr = [];
window.addEventListener('error', e => window.__sphuErr.push(String(e.message)));

const $ = id => document.getElementById(id);
const DT = 0.0005;                  // 計算の刻み（0.5ms）
const P = { speed: 'dill', model: 'size', crouch: false, dir: 90, fastV: 30 };
const S = { st: null, hist: [], view: 0, playing: true, rate: 'auto', camR: 85, tab: 'human', rims: true, paused: false };

const snap = st => Object.assign({}, st, { ev: Object.assign({}, st.ev), jump: st.jump && Object.assign({}, st.jump) });
function reset() { S.st = M.newState(P); S.hist = [snap(S.st)]; S.view = 0; S.playing = true; S.camR = 85; }
// とちゅうで条件を変えたら、いま見ている時刻から先を計算しなおす
function changed() {
  S.hist.length = S.view + 1; S.st = snap(S.hist[S.view]);
  if (M.done(S.st)) S.playing = false; else S.playing = true;
}

// 時間を進める（real は実時間の秒）
function curRate() {
  if (S.rate !== 'auto') return +S.rate;
  const s = S.hist[S.view]; return (s.ev.pounce != null || s.fl !== 'rest') ? 0.02 : 1; // 自動: 跳ぶところ・ハエが動いたあとは 1/50
}
function advance(real) {
  if (!S.playing) return;
  let simT = real * curRate();
  while (simT > 0) {
    if (S.view < S.hist.length - 1) { S.view++; }
    else if (!M.done(S.st)) { M.step(S.st, P, DT); S.hist.push(snap(S.st)); S.view++; }
    else { S.playing = false; break; }
    simT -= DT;
  }
}

// ---- 描画
const cvs = { scene: $('scene'), human: $('vHuman'), fly: $('vFly'), spider: $('vSpider'), graph: $('graph') };
const ctx = {}; for (const k in cvs) ctx[k] = cvs[k].getContext('2d');
function fit(c, g) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); return [c.clientWidth, c.clientHeight];
}
const fmtMs = s => (s * 1000).toFixed(0) + 'ms';
function status(s) {
  const vd = M.verdict(s), ev = s.ev;
  if (vd && M.done(s)) {
    if (vd.k === 'early') return `<b class="escaped">ハエが先に気づいて逃げた</b>（クモが ${s.D.toFixed(1)}mm のとき。跳ぶ前）`;
    const m = vd.m != null ? Math.abs(vd.m * 1000).toFixed(0) : '';
    if (vd.k === 'close') return `<b class="close">きわどい</b>: ハエが飛び立ってから ${m}ms でクモがとどく。差は飛び立つ時刻のばらつき（±11ms）より小さい`;
    if (vd.k === 'escaped') return `<b class="escaped">逃げた</b>: クモがとどく ${m}ms 前にハエが飛び立った`;
    return `<b class="caught">つかまった</b>${m ? `: ハエが飛び立つ ${m}ms 前にクモがとどいた` : ''}`;
  }
  if (s.sp === 'stalk') return `クモが忍び寄る: ${s.V.toFixed(1)}mm/s、あと ${s.D.toFixed(1)}mm。` + (s.fl === 'rest' ? 'ハエはまだ逃げない' : 'ハエが気づいた');
  if (s.sp === 'prep') return `クモが踏み切る（${fmtMs(s.spT)} / ${fmtMs(M.DATA.jump.prep)}）` + (s.fl !== 'rest' ? '・ハエが気づいた' : '');
  if (s.sp === 'flight') return `クモが跳んでいる: ${(s.V / 1000).toFixed(2)}m/s` + (s.fl === 'air' ? '・ハエは飛び立った' : s.fl === 'wing' ? '・ハエが翅を上げた' : '・ハエはまだ');
  if (s.sp === 'stop') return 'ハエが飛び立ったので、クモは止まった';
  if (s.sp === 'contact') return 'クモがハエの位置にとどいた' + (s.fl === 'air' ? '（ハエはもう飛び立っている）' : '');
  return '';
}
function draw() {
  const s = S.hist[S.view];
  const want = Math.max(25, Math.min(85, s.D * 1.5 + 16)); // 近づくと寄って見る（再生中はなめらかに、止めているときはすぐ）
  S.camR = S.playing ? S.camR + (want - S.camR) * 0.08 : want;
  let [w, h] = fit(cvs.scene, ctx.scene); SC.drawScene(ctx.scene, w, h, s, P, S.camR);
  for (const k of ['human', 'fly', 'spider']) {
    if (innerWidth <= 760 && S.tab !== k) continue;
    [w, h] = fit(cvs[k], ctx[k]); VW[k](ctx[k], w, h, s, P, { rims: S.rims });
  }
  [w, h] = fit(cvs.graph, ctx.graph); SC.drawGraph(ctx.graph, w, h, S.hist, S.view, P);
  $('status').innerHTML = status(s);
  $('tnow').textContent = s.t.toFixed(3) + ' s';
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
    const b = e.target.closest('button'); if (!b) return;
    box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset[attr]);
  });
}
seg('speed', 's', v => { P.speed = v; changed(); });
seg('dir', 'd', v => { P.dir = +v; changed(); });
seg('model', 'm', v => { P.model = v; changed(); });
seg('rate', 'r', v => { S.rate = v; });
$('crouch').addEventListener('change', e => { P.crouch = e.target.checked; changed(); });
$('rims').addEventListener('change', e => { S.rims = e.target.checked; });
$('play').addEventListener('click', () => { if (!S.playing && M.done(S.hist[S.view]) && S.view === S.hist.length - 1) reset(); else S.playing = !S.playing; });
$('restart').addEventListener('click', reset);
$('tl').addEventListener('input', e => { S.view = +e.target.value; S.playing = false; });
document.querySelectorAll('#viewTabs button').forEach(b => b.addEventListener('click', () => {
  S.tab = b.dataset.v;
  document.querySelectorAll('#viewTabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('#views figure').forEach(f => f.classList.toggle('on', f.dataset.v === S.tab));
}));

reset(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__sphu = {
  S, P,
  simRun(sec) { for (let t = 0; t < sec; t += 1 / 60) advance(1 / 60); draw(); },
  toEnd() { while (!M.done(S.st)) { M.step(S.st, P, DT); S.hist.push(snap(S.st)); } S.view = S.hist.length - 1; S.playing = false; draw(); },
  at(t) { S.view = Math.max(0, S.hist.findIndex(s => s.t >= t)); S.playing = false; draw(); },
  set(o) { Object.assign(P, o); changed(); draw(); },
};
