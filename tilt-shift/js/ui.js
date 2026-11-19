// ジオラマに見えるわけ — つまみ・ためしてみる・結果の表示・見える／見えないの記録・目印の線
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  const MODE = ['なし', '帯', '奥行き'];  // 記録の短い名前
  const PRESETS = [
    ['ふつうの写真', { mode: 0, sat: 1, fps: 60, spd: 1, pitch: 35 }],
    ['ぼけだけ', { mode: 1, R: 1, pos: 0.5, w: 0.16, ang: 0, sat: 1, fps: 60, spd: 1, pitch: 35 }],
    ['ぼけ＋色＋コマ落とし', { mode: 1, R: 1, pos: 0.5, w: 0.16, ang: 0, sat: 1.5, fps: 6, spd: 4, pitch: 35 }],
    ['帯をたてに', { mode: 1, R: 1, pos: 0.5, w: 0.16, ang: 90, sat: 1, fps: 60, spd: 1, pitch: 35 }],
    ['横から見る', { mode: 1, R: 1, pos: 0.5, w: 0.16, ang: 0, sat: 1, fps: 60, spd: 1, pitch: 5 }],
    ['奥行きどおりのぼけ', { mode: 2, R: 1, pos: 0.5, sat: 1, fps: 60, spd: 1, pitch: 35 }],
  ];
  let S, onChange, lastFit = null, activePreset = 1;
  const log = [];

  const fmt = {
    R: v => v.toFixed(2).replace(/0$/, '') + ' %', pos: v => (v < 0.45 ? '下より ' : v > 0.55 ? '上より ' : 'まん中 ') + Math.round(v * 100),
    w: v => Math.round(v * 100) + ' %', ang: v => v + '°', pitch: v => v + '°', sat: v => '×' + v.toFixed(2),
    el: v => v + '°', yaw: v => (v > 0 ? '右へ ' : v < 0 ? '左へ ' : '') + Math.abs(v) + '°', fov: v => v + '°',
  };
  const sliders = { R: 'sR', pos: 'sPos', w: 'sW', ang: 'sAng', pitch: 'sPitch', sat: 'sSat', el: 'sEl', yaw: 'sYaw', fov: 'sFov' };
  const outs = { R: 'oR', pos: 'oPos', w: 'oW', ang: 'oAng', pitch: 'oPitch', sat: 'oSat', el: 'oEl', yaw: 'oYaw', fov: 'oFov' };

  function syncControls() {
    for (const k in sliders) { $(sliders[k]).value = S[k]; $(outs[k]).textContent = fmt[k](S[k]); }
    for (const [id, key] of [['mode', 'mode'], ['fps', 'fps'], ['spd', 'spd'], ['view', 'view']])
      for (const b of $(id).querySelectorAll('button')) { const on = +b.dataset.v === S[key]; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }
    const sc = SCENES.find(x => x.id === S.scene) || SCENES[0];
    for (const b of $('scene').children) { const on = b.dataset.v === S.scene; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }
    $('sceneNote').textContent = sc.name + '。' + sc.note;
    document.body.classList.toggle('m-photo', sc.kind !== '3d');   // 写真と動画の 3D は動かない
    document.body.classList.toggle('m-splat', sc.kind === 'splat');
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
    for (const k in sliders) $(sliders[k]).addEventListener('input', e => set({ [k]: +e.target.value }));
    for (const [id, key] of [['mode', 'mode'], ['fps', 'fps'], ['spd', 'spd'], ['view', 'view']])
      $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) set({ [key]: +b.dataset.v }); });
    $('cGuide').addEventListener('change', e => set({ guide: e.target.checked }, activePreset));
    $('pause').addEventListener('click', () => set({ paused: !S.paused }, activePreset));
    PRESETS.forEach(([name, p], i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = name;
      b.addEventListener('click', () => set(Object.assign({}, p), i)); $('presets').appendChild(b);
    });
    SCENES.forEach(sc => {   // 場面のボタン（写真は小さな見本つき）
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = sc.id; b.setAttribute('role', 'radio');
      b.style.backgroundImage = `url(${sc.thumb || sc.img})`;
      b.innerHTML = `<span>${sc.short}</span>`; b.title = sc.name;
      b.addEventListener('click', () => set({ scene: sc.id }, activePreset)); $('scene').appendChild(b);
    });
    $('photoCredits').innerHTML = SCENES.filter(s => s.credit).map(s =>   // 写真・動画の出どころ（このアプリについて）
      `<li>${s.name}（${s.note.split(/[（。]/)[0]}）: ${s.kind === 'splat' ? '動画 ' : ''}${s.credit.who}「${s.credit.title}」${s.credit.lic} <a href="${s.credit.url}" target="_blank" rel="noopener">Wikimedia Commons</a></li>`).join('');
    $('jYes').addEventListener('click', () => judge(true));
    $('jNo').addEventListener('click', () => judge(false));
    syncControls();
  }

  // 結果の文（しきい値はここだけ。s ≥ 0.1 はほぼ実物、合い方 < 0.5 は合わない。どちらもこのアプリの目安）
  function scaleText(f) {
    if (!f || !f.ok) return { main: f && f.why === 'sky' ? '空ばかりで、距離の手がかりがありません' : 'この設定では大きさを出せません' };
    const far = f.Z0 >= 1000 ? (f.Z0 / 1000).toFixed(1) + ' km' : Math.round(f.Z0) + ' m';
    if (!f.blur) return { main: `ぼけなし → 大きさの手がかりはぼけからは出ない（町まで約 ${far}）` };
    if (f.s >= 0.1) return { main: `ぼけが小さく、ほぼ実物の大きさにあたる（約 ${far} 先）`, short: '実物大' };
    const e = f.eye, eye = e < 1 ? Math.round(e * 100) + ' cm' : e.toFixed(1) + ' m';
    const inv = 1 / f.s, d = Math.pow(10, Math.max(0, Math.floor(Math.log10(inv)) - 1)), den = (Math.round(inv / d) * d).toLocaleString('ja-JP');
    if (f.corr < 0.5) return { main: `ぼけが奥行きと合わない → 大きさの手がかりになりにくい`, short: `1/${den}（合わない）` };
    return { main: `ぼけから逆算すると、目から ${eye} の<b>1/${den} の模型</b>にあたる`, short: `1/${den}` };
  }
  function showResult(f) {
    lastFit = f;
    $('rScale').innerHTML = scaleText(f).main;
    const c = f && f.ok && f.blur ? Math.max(0, f.corr) : null;
    $('rFit').textContent = c == null ? '—' : Math.floor(c * 100) + ' %';
    $('rFitBar').style.width = (c == null ? 0 : c * 100) + '%';
  }

  function summary(st) {
    const m = st.mode === 0 ? 'ぼけなし' : `${MODE[st.mode]} ${fmt.R(st.R)}` + (st.mode === 1 ? `・向き ${st.ang}°` : '');
    const sc = SCENES.find(x => x.id === st.scene) || SCENES[0];
    if (sc.kind === 'photo') return `${sc.short}（写真）・${m}・色 ${fmt.sat(st.sat)}・見る ${st.view}°`;
    if (sc.kind === 'splat') return `${sc.short}・${m}・見下ろし ${st.el}°・横 ${st.yaw}°・画角 ${st.fov}°・見る ${st.view}°・色 ${fmt.sat(st.sat)}`;
    return `${sc.short}・${m}・見下ろし ${st.pitch}°・見る ${st.view}°・色 ${fmt.sat(st.sat)}・${st.fps >= 60 ? 'なめらか' : 'コマ' + st.fps}・${st.spd === 1 ? '等速' : '×' + st.spd}`;
  }
  function judge(yes) {
    const st = Object.assign({}, S); delete st.paused; delete st.guide;
    const t = scaleText(lastFit), c = lastFit && lastFit.ok && lastFit.blur ? Math.floor(Math.max(0, lastFit.corr) * 100) + '%' : '—';
    log.unshift({ yes, st, calc: `計算 ${t.short || '—'}・合い方 ${c}` });
    if (log.length > 20) log.pop();
    renderLog(true);
  }
  function renderLog(flash) {
    const ol = $('log'); ol.innerHTML = '';
    $('logCount').textContent = log.length ? `（${log.length}）` : '';
    if (!log.length) { ol.innerHTML = '<li class="empty">まだありません。上の「ジオラマに見える／見えない」を押してください。</li>'; return; }
    log.forEach((e, i) => {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      b.innerHTML = `<span class="tag ${e.yes ? 'yes' : 'no'}">${e.yes ? '見える' : '見えない'}</span><span class="s">${summary(e.st)}</span><span class="c">${e.calc}</span>`;
      b.addEventListener('click', () => set(Object.assign({}, e.st), -1));
      if (flash && i === 0) li.className = 'new';
      li.appendChild(b); ol.appendChild(li);
    });
    const y = log.filter(e => e.yes).length;
    $('jStat').innerHTML = `記録 ${log.length} 件（見える ${y}・見えない ${log.length - y}）　いま足した: <b class="${log[0].yes ? 'yes' : 'no'}">${log[0].yes ? '見える' : '見えない'}</b>　↓ 下の記録で見くらべ`;
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
  function showLoading(sc) { $('rScale').textContent = `「${sc.name}」を読んでいます…`; }
  function showError(e) { $('rScale').textContent = '読めませんでした。通信を確かめて、もう一度場面を選んでください。'; }
  function showCredit(sc) {
    const c = $('credit');
    if (sc.kind === 'photo') c.innerHTML = `写真: ${sc.credit.who}（${sc.credit.lic}）<a href="${sc.credit.url}" target="_blank" rel="noopener">Wikimedia Commons</a>。3:2 に切り取り、ぼけと色はこのアプリで加工。奥行きは推定`;
    else if (sc.kind === 'splat') c.innerHTML = `動画: ${sc.credit.who}（${sc.credit.lic}）<a href="${sc.credit.url}" target="_blank" rel="noopener">Wikimedia Commons</a>。動画のコマから 3D を作り、ぼけと色はこのアプリで加工。大きさは推定`;
    else c.textContent = 'つくった 3D の町（外壁・道: ambientCG、空: Poly Haven。どちらも CC0）';
  }
  return { init, showResult, drawGuide, syncControls, showLoading, showError, showCredit };
})();
