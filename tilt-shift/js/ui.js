// ジオラマに見えるわけ — 場面のボタン・つまみ・ためしてみる・結果の文・目印の線
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  const PRESETS = [
    ['ぼけなし', { mode: 0, sat: 1.15, fps: 60, spd: 1 }],
    // ぼけ 2 %・帯 10 %・帯は少し下・色 ×1.6: 6 つの場面で撮りくらべ、批判役がいちばん模型に見えると選んだ値（DEVNOTES）
    ['上と下をぼかす', { mode: 1, R: 2, pos: 0.45, w: 0.1, ang: 0, sat: 1.6, fps: 60, spd: 1 }],
    ['＋色を濃く＋コマ落とし', { mode: 1, R: 2, pos: 0.45, w: 0.1, ang: 0, sat: 1.9, fps: 6, spd: 4 }],
    ['帯をたてに', { mode: 1, R: 2, pos: 0.5, w: 0.1, ang: 90, sat: 1.6, fps: 60, spd: 1 }],
    ['真横に近く', { mode: 1, R: 2, pos: 0.5, w: 0.1, ang: 0, sat: 1.6, pitch: 6 }],
    ['レンズどおりのぼけ', { mode: 2, R: 2, pos: 0.45, sat: 1.6, fps: 60, spd: 1 }],
  ];
  let S, onChange, activePreset = 1;

  const fmt = {
    R: v => v.toFixed(2).replace(/0$/, '') + ' %', pos: v => (v < 0.45 ? '下より ' : v > 0.55 ? '上より ' : 'まん中 ') + Math.round(v * 100),
    w: v => Math.round(v * 100) + ' %', ang: v => v + '°', pitch: v => Math.round(v) + '°', sat: v => '×' + v.toFixed(2),
    yaw: v => Math.round(v) + '°', dist: v => v >= 1000 ? (v / 1000).toFixed(2) + ' km' : Math.round(v) + ' m',
  };
  const sliders = { R: 'sR', pos: 'sPos', w: 'sW', ang: 'sAng', pitch: 'sPitch', yaw: 'sYaw', dist: 'sDist', sat: 'sSat' };

  function syncControls() {
    const def = STAGES.find(x => x.id === S.stage) || STAGES[0];
    $('sDist').min = def.view.min; $('sDist').max = def.view.max;
    for (const k in sliders) { $(sliders[k]).value = S[k]; $('o' + sliders[k].slice(1)).textContent = fmt[k](S[k]); }
    for (const [id, key] of [['mode', 'mode'], ['fps', 'fps'], ['spd', 'spd'], ['viewDeg', 'view']])
      for (const b of $(id).querySelectorAll('button')) { const on = +b.dataset.v === S[key]; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }
    for (const b of $('scene').children) { const on = b.dataset.v === S.stage; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }
    $('sceneNote').textContent = def.note;
    $('credit').hidden = !def.credit; $('credit').textContent = def.credit ? '出典: ' + def.credit : '';
    document.body.classList.toggle('m-depth', S.mode === 2);
    document.body.classList.toggle('m-none', S.mode === 0);
    $('lPos').textContent = S.mode === 2 ? 'ピントの位置' : '帯の位置';
    $('cGuide').checked = S.guide;
    $('pause').textContent = S.paused ? '動かす' : '止める'; $('pause').setAttribute('aria-pressed', S.paused);
    [...$('presets').children].forEach((b, i) => b.classList.toggle('on', i === activePreset));
  }
  function set(patch, fromPreset = -1) { Object.assign(S, patch); activePreset = fromPreset; syncControls(); onChange(); }

  function init(state, cb) {
    S = state; onChange = cb;
    for (const k in sliders) $(sliders[k]).addEventListener('input', e => set({ [k]: +e.target.value }, ['pitch', 'yaw', 'dist'].includes(k) ? activePreset : -1));
    for (const [id, key] of [['mode', 'mode'], ['fps', 'fps'], ['spd', 'spd'], ['viewDeg', 'view']])
      $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) set({ [key]: +b.dataset.v }); });
    $('cGuide').addEventListener('change', e => set({ guide: e.target.checked }, activePreset));
    $('pause').addEventListener('click', () => set({ paused: !S.paused }, activePreset));
    $('home').addEventListener('click', () => { const v = (STAGES.find(x => x.id === S.stage) || STAGES[0]).view; set({ pitch: v.pitch, yaw: v.yaw, dist: v.dist, tx: v.x, tz: v.z }, activePreset); });
    PRESETS.forEach(([name, p], i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = name;
      b.addEventListener('click', () => set(Object.assign({}, p), i)); $('presets').appendChild(b);
    });
    STAGES.forEach(sc => {   // 場面のボタン（見本の絵つき）
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = sc.id; b.setAttribute('role', 'radio');
      b.style.backgroundImage = `url(assets/thumb/${sc.id}.jpg)`;
      b.innerHTML = `<span>${sc.short}</span>`; b.title = sc.name;
      b.addEventListener('click', () => { if (S.stage !== sc.id) set({ stage: sc.id }, activePreset); }); $('scene').appendChild(b);
    });
    syncControls();
  }

  // 結果の文（しきい値はここだけ。s ≥ 0.1 はほぼ実物、合い方 < 0.5 は合わない。どちらもこのアプリの目安）
  function scaleText(f) {
    if (!f || !f.ok) return f && f.why === 'sky' ? '空ばかりで、距離の手がかりがありません' : 'この向きでは大きさを出せません';
    const far = f.Z0 >= 1000 ? (f.Z0 / 1000).toFixed(1) + ' km' : Math.round(f.Z0) + ' m';
    if (!f.blur) return `ぼけなし。ピントの所まで約 ${far}（本物の大きさ）`;
    if (f.s >= 0.1) return `ぼけが小さく、ほぼ本物の大きさ（約 ${far} 先）`;
    const e = f.eye, eye = e < 1 ? Math.round(e * 100) + ' cm' : e.toFixed(1) + ' m';
    const inv = 1 / f.s, d = Math.pow(10, Math.max(0, Math.floor(Math.log10(inv)) - 1)), den = (Math.round(inv / d) * d).toLocaleString('ja-JP');
    if (f.corr < 0.5) return `ぼけが奥行きと合わない → 模型の手がかりになりにくい`;
    return `ぼけから逆算すると、目から ${eye} の <b>1/${den} の模型</b>`;
  }
  function showResult(f) {
    $('rScale').innerHTML = scaleText(f);
    const c = f && f.ok && f.blur ? Math.max(0, f.corr) : null;
    $('rFit').textContent = c == null ? '—' : Math.floor(c * 100) + ' %';
    $('rFitBar').style.width = (c == null ? 0 : c * 100) + '%';
  }

  // ピントの所の目印（※ 目印。本物の写真には無い線）
  function drawGuide(P) {
    const g = $('guide');
    if (!S.guide || S.mode === 0) { g.innerHTML = ''; return; }
    const X = u => (u * 100).toFixed(2), Y = v => ((1 - v) * 100).toFixed(2);
    if (S.mode === 2) {
      g.innerHTML = `<line x1="44" x2="56" y1="${Y(P.pos)}" y2="${Y(P.pos)}"/><line x1="50" x2="50" y1="${Y(P.pos) - 6}" y2="${+Y(P.pos) + 6}"/>`;
      return;
    }
    const nx = -Math.sin(P.ang), ny = Math.cos(P.ang), dx = Math.cos(P.ang), dy = Math.sin(P.ang);
    let s = '';
    for (const off of [-P.halfW, P.halfW]) {
      const c = P.pos - 0.5 + off, p = t => [(nx * c + dx * t) / P.aspect + 0.5, ny * c + dy * t + 0.5];
      const [u1, v1] = p(-3), [u2, v2] = p(3);
      s += `<line x1="${X(u1)}" y1="${Y(v1)}" x2="${X(u2)}" y2="${Y(v2)}"/>`;
    }
    g.innerHTML = s;
  }
  function showLoading(def) { $('rScale').textContent = `「${def.name}」を作っています…`; $('frame').classList.add('loading'); }
  function showError() { $('rScale').textContent = '作れませんでした。もう一度、場面を選んでください。'; $('frame').classList.remove('loading'); }
  function loaded() { $('frame').classList.remove('loading'); }
  return { init, showResult, drawGuide, syncControls, showLoading, showError, loaded };
})();
