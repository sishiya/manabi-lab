// ちいさな地球を歩く — 操作と文字（数字の書き方・つまみ・ボタン・星の数字）
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  const num = (x, d) => { const s = x.toPrecision(d); return s.includes('e') ? String(Number(s)) : String(parseFloat(s)); };
  const len = m => m < 0.01 ? num(m * 1000, 2) + ' mm' : m < 1 ? num(m * 100, 2) + ' cm' : m < 1000 ? num(m, 3) + ' m' : m < 1e7 ? num(m / 1000, 3) + ' km' : Math.round(m / 1000).toLocaleString() + ' km';
  const speed = v => v < 0.1 ? '秒速 ' + num(v * 100, 2) + ' cm' : v < 1000 ? '秒速 ' + num(v, 3) + ' m' : '秒速 ' + num(v / 1000, 3) + ' km';
  const dur = s => s < 60 ? num(s, 2) + ' 秒' : s < 3600 ? num(s / 60, 2) + ' 分' : s < 86400 ? num(s / 3600, 2) + ' 時間' : num(s / 86400, 2) + ' 日';
  const clock = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + '時間 ' : '') + (h || m ? m + '分 ' : '') + ss + '秒'; };
  const R_MIN = 100, R_MAX = PHYS.RE, V_MIN = 0.01, BALL_MAX = 40;
  const fromSlider = (t, lo, hi) => lo * Math.pow(hi / lo, t / 1000), toSlider = (v, lo, hi) => Math.round(1000 * Math.log(v / lo) / Math.log(hi / lo));
  let H = null, S = null;

  function init(state, handlers) {
    S = state; H = handlers;
    $('rSl').addEventListener('input', e => H.setR(fromSlider(+e.target.value, R_MIN, R_MAX)));
    for (const b of document.querySelectorAll('#rChips button')) b.addEventListener('click', () => H.setR(+b.dataset.r));
    $('vSl').addEventListener('input', e => H.setSpeed(fromSlider(+e.target.value, V_MIN, vMax())));
    $('aSl').addEventListener('input', e => H.setAngle(+e.target.value));
    for (const b of document.querySelectorAll('#toolSeg button')) b.addEventListener('click', () => H.setTool(b.dataset.tool));
    for (const b of document.querySelectorAll('#airSeg button')) b.addEventListener('click', () => H.setAir(b.dataset.air === '1'));
    $('go').addEventListener('click', () => H.launch());
    $('back').addEventListener('click', () => H.back());
    const hold = (el, on, off) => {
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('held'); on(); });
      for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(n, () => { el.classList.remove('held'); off(); });
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    hold($('walk'), () => H.walk(true), () => H.walk(false));
    hold($('turnL'), () => H.turn(-1), () => H.turn(0));
    hold($('turnR'), () => H.turn(1), () => H.turn(0));
    // 景色をドラッグで見まわす
    const cv = $('cv'); let drag = null;
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; H.look((e.clientX - drag.x) * 0.005, (e.clientY - drag.y) * 0.005); drag.x = e.clientX; drag.y = e.clientY; });
    for (const n of ['pointerup', 'pointercancel']) cv.addEventListener(n, () => { drag = null; });
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === 'a') H.turn(-1); else if (e.key === 'ArrowRight' || e.key === 'd') H.turn(1);
      else if (e.key === 'ArrowUp' || e.key === 'w') H.walk(true); else if (e.key === ' ') { e.preventDefault(); H.launch(); }
    });
    addEventListener('keyup', e => { if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) H.turn(0); if (e.key === 'ArrowUp' || e.key === 'w') H.walk(false); });
    addEventListener('blur', () => { H.turn(0); H.walk(false); });
  }
  const vMax = () => S.tool === 'hop' ? PHYS.at(S.R).jump : BALL_MAX;

  // つまみ・ボタン・星の数字を、いまの状態に合わせる
  function sync() {
    const P = PHYS.at(S.R), hop = S.tool === 'hop';
    $('rSl').value = toSlider(S.R, R_MIN, R_MAX); $('rVal').textContent = '半径 ' + len(S.R);
    for (const b of document.querySelectorAll('#rChips button')) b.classList.toggle('on', Math.abs(+b.dataset.r - S.R) < S.R * 0.01);
    for (const b of document.querySelectorAll('#toolSeg button')) b.classList.toggle('on', b.dataset.tool === S.tool);
    for (const b of document.querySelectorAll('#airSeg button')) b.classList.toggle('on', (b.dataset.air === '1') === S.air);
    $('vSl').value = toSlider(S.speed[S.tool], V_MIN, vMax()); $('vVal').textContent = speed(S.speed[S.tool]);
    $('aSl').value = S.ang[S.tool]; $('aVal').textContent = S.ang[S.tool] + '°' + (S.ang[S.tool] === 0 ? '（水平）' : S.ang[S.tool] === 90 ? '（真上）' : '');
    $('vLbl').textContent = hop ? '足でける強さ' : '投げる強さ';
    $('vMarks').textContent = 'この星では 一周 ' + speed(P.vOrb) + '・飛び出す ' + speed(P.vEsc) + (hop ? '。足で出せるのは ' + speed(P.jump) + ' まで（推定）' : '');
    $('go').textContent = hop ? '跳ねる' : '投げる';
    $('n-g').textContent = num(P.g, 3) + ' m/s²（地球の ' + (P.g / PHYS.GE >= 0.1 ? num(P.g / PHYS.GE, 2) + ' 倍' : '1/' + Math.round(PHYS.GE / P.g).toLocaleString()) + '）';
    const kg = 60 * P.g / PHYS.GE; $('n-w').textContent = kg >= 1 ? num(kg, 3) + ' kg' : num(kg * 1000, 2) + ' g';
    $('n-hz').textContent = len(P.horizon); $('n-ar').textContent = len(P.around);
    $('n-wk').textContent = speed(P.walk); $('n-or').textContent = speed(P.vOrb); $('n-es').textContent = speed(P.vEsc);
  }
  function pred(text) { $('pred').textContent = text; }
  function msg(text) { $('msg').textContent = text; }
  function hud(l, r) { $('hudL').textContent = l; $('hudR').textContent = r; }
  function flying(body, any) { $('go').disabled = body; $('walk').disabled = body; $('back').disabled = !any; }
  return { init, sync, pred, msg, hud, flying, len, speed, dur, clock, BALL_MAX, V_MIN };
})();
