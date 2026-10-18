// ヘビが進むしくみ — 案内（つぎへ）と、ボタン・スライダーのしくみ（モードごとの中身は js/mode-*.js）
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const SEG = {};
  let A = null;   // main.js の APP

  function init(app) {
    A = app;
    $('next').onclick = () => setStep(A.step[A.mode] + 1);
    document.querySelectorAll('#modes button').forEach(b => b.onclick = () => A.setMode(b.dataset.mode));
    document.querySelectorAll('#layers input').forEach(c => c.onchange = () => { A.layers[c.dataset.l] = c.checked; });
    for (const id in MODES) if (MODES[id].init) MODES[id].init(A);
  }
  // ボタンの組（.seg）: 押すと on を移して fn(値)
  function seg(id, fn) {
    SEG[id] = fn;
    document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => set(id, b.dataset.v));
  }
  function set(id, v) {
    document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset.v === v));
    SEG[id](v);
    refresh();
  }
  // スライダー: 動かすと表示を書いて fn(値)
  function slider(id, fmt, fn) {
    const el = $(id);
    el.oninput = () => { $(id + 'V').textContent = fmt(+el.value); fn(+el.value); refresh(); };
  }
  function setSlider(id, v) { const el = $(id); el.value = v; el.oninput(); }

  // 案内の段（0 = はじめの説明、1〜）。1段 = 見るもの1つ（主役1つ・光る枠・図の下に1〜2行）
  function setStep(k) {
    const M = MODES[A.mode], T = M.tour;
    if (k > T.length) k = 0;
    A.step[A.mode] = k;
    $('next').textContent = k === 0 ? 'つぎへ ▶' : k === T.length ? 'おわり ▶' : `つぎへ ▶ ${k}/${T.length}`;
    const st = k ? T[k - 1] : null;
    Object.assign(A.layers, st && st.layers ? st.layers : M.layers);
    document.querySelectorAll('#layers input').forEach(c => c.checked = !!A.layers[c.dataset.l]);
    A.scaleOn = !!(st && st.scale) || (A.scaleOn && !st && A.mode === 'ground');
    $('bScale').classList.toggle('on', A.scaleOn);
    A.wave = !!(st && st.wave);
    A.ringKind = st && st.ring || null;
    const say = $('say');
    say.innerHTML = st ? `<span class="n">${k}/${T.length}</span>${st.say}` : M.intro;
    if (st && st.act) {
      say.appendChild(document.createElement('br'));
      for (const [label, fn] of st.act) { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; say.appendChild(b); }
    }
  }
  function refresh() { MODES[A.mode].refresh(A); }

  window.UI = { init, seg, set, slider, setSlider, setStep, refresh };
})();
