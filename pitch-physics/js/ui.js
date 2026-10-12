// 変化球のしくみ — 操作（球種・つまみ・時間・案内・説明・数字）
'use strict';

const $ = id => document.getElementById(id);
const fmt = (x, n = 0) => Number(x).toFixed(n);
function clock(deg) {               // 角度°（12時から時計まわり）→「1時半」など
  let h = ((deg % 360) + 360) % 360 / 30, hh = Math.floor(h + 1e-6), half = h - hh >= 0.25 && h - hh < 0.75;
  if (h - hh >= 0.75) hh += 1;
  hh = hh % 12; if (hh === 0) hh = 12;
  return hh + '時' + (half ? '半' : '');
}

const CTRL = {};   // つまみ
function slider(parent, key, lab, min, max, step, get, set, show) {
  const row = document.createElement('label'); row.className = 'sl';
  row.innerHTML = `<span class="lab">${lab}</span><input type="range" min="${min}" max="${max}" step="${step}"><span class="val"></span>`;
  const inp = row.querySelector('input'), val = row.querySelector('.val');
  inp.addEventListener('input', () => { set(Number(inp.value)); onChange(); });
  parent.appendChild(row);
  CTRL[key] = { row, sync() { inp.value = get(); val.textContent = show(get()); } };
}
function check(parent, key, lab, get, set) {
  const row = document.createElement('label'); row.className = 'ck';
  row.innerHTML = `<input type="checkbox"><span>${lab}</span>`;
  const inp = row.querySelector('input');
  inp.addEventListener('change', () => { set(inp.checked); onChange(true); });
  parent.appendChild(row);
  CTRL[key] = { row, sync() { inp.checked = get(); } };
}

function buildControls() {
  const box = $('controls');
  const chips = document.createElement('div'); chips.className = 'chips';
  for (const p of PITCHES) {
    const b = document.createElement('button'); b.textContent = p.name; b.dataset.id = p.id; b.title = p.note;
    b.addEventListener('click', () => { setPitch(p.id); S.playing = false; syncAll(); });
    chips.appendChild(b);
  }
  box.appendChild(chips);
  const note = document.createElement('p'); note.id = 'pnote'; box.appendChild(note);

  const g1 = document.createElement('div'); g1.className = 'grp'; box.appendChild(g1);
  slider(g1, 'v0', '速さ', 60, 165, 1, () => S.P.v0, v => S.P.v0 = v, v => v + ' km/h（' + fmt(v / 3.6 / MPH, 0) + ' mph）');
  slider(g1, 'rpm', '回転数', 0, 3500, 10, () => S.P.rpm, v => S.P.rpm = v, v => v + ' 回/分');
  slider(g1, 'dir', '回転の向き', 0, 359, 1, () => S.P.dir, v => S.P.dir = v, v => '手前の面が ' + clock(v) + ' の向きへ動く（回転軸 ' + clock(v + 270) + '）');
  slider(g1, 'eff', '使える回転', 0, 100, 1, () => Math.round(S.P.eff * 100), v => S.P.eff = v / 100, v => v + '%（のこりはジャイロ回転）');
  slider(g1, 'seam0', '縫い目の向き', 0, 90, 1, () => S.P.seam0, v => S.P.seam0 = v, v => 'θ = ' + v + '°（放したとき）');
  slider(g1, 'axisDeg', '回転軸', 0, 179, 1, () => S.P.axisDeg, v => S.P.axisDeg = v, v => clock(v) + '（捕手から見て）');

  const g2 = document.createElement('div'); g2.className = 'grp'; box.appendChild(g2);
  slider(g2, 'vAng', '放す角度（上下）', -6, 4, 0.05, () => S.P.vAng, v => { S.P.vAng = v; S.autoAim = false; }, v => fmt(v, 2) + '°');
  slider(g2, 'hAng', '放す角度（左右）', -4, 6, 0.05, () => S.P.hAng, v => { S.P.hAng = v; S.autoAim = false; }, v => fmt(v, 2) + '°（＋は捕手から見て右へ）');
  check(g2, 'autoAim', 'いつもゾーンのまん中をねらう（放す角度を計算で合わせる）', () => S.autoAim, v => S.autoAim = v);
  const many = document.createElement('button'); many.id = 'many'; many.textContent = '少しずつちがう10球を投げる';
  many.addEventListener('click', () => { throwMany(); S.t = 0; S.playing = true; syncAll(); });
  g2.appendChild(many);

  const g3 = document.createElement('div'); g3.className = 'grp'; box.appendChild(g3);
  check(g3, 'noAir', '<i class="sw noair"></i>空気がないとき', () => S.show.noAir, v => S.show.noAir = v);
  check(g3, 'plain', '<i class="sw plain"></i>回転の力なし（重力と抵抗だけ）', () => S.show.plain, v => S.show.plain = v);
  check(g3, 'forces', '力の矢印', () => S.show.forces, v => S.show.forces = v);
}

function onChange(viewOnly) {
  if (!viewOnly) { S.many = null; recompute(); }
  else if (CTRL.autoAim && S.autoAim) recompute();
  syncAll();
}

function syncAll() {
  for (const k in CTRL) CTRL[k].sync();
  const kn = !!S.P.knuckle;
  for (const k of ['dir', 'eff']) CTRL[k].row.hidden = kn;
  for (const k of ['seam0', 'axisDeg']) CTRL[k].row.hidden = !kn;
  $('many').hidden = !kn;
  CTRL.rpm.row.querySelector('input').max = kn ? 300 : 3500;
  CTRL.rpm.sync();
  document.querySelectorAll('.chips button').forEach(b => b.classList.toggle('on', b.dataset.id === S.pitch));
  const p = PITCHES.find(q => q.id === S.pitch); $('pnote').textContent = p ? p.note : '';
  const T = $('time'); T.max = S.res.tPlate; T.value = S.t;
  updateNums();
}

function updateNums() {
  const r = S.res, s = sampleAt(r, S.t), F = forces(r.st, s.t, s.v, r.opt), W = PHY.m * PHY.g;
  const Fn = k => V.len(F[k]);
  $('tlab').textContent = fmt(S.t, 3) + ' 秒 / ' + fmt(r.tPlate, 3);
  const mv = S.mv, up = mv.dz / 0.01, rt = mv.dx / 0.01;
  const rows = [
    ['ホームまで', fmt(r.tPlate, 3) + ' 秒'],
    ['速さ', fmt(V.len(r.st.vel) * 3.6, 0) + ' → ' + fmt(V.len(r.vPlate) * 3.6, 0) + ' km/h'],
    ['変化量', (up >= 0 ? '上へ ' : '下へ ') + fmt(Math.abs(up), 0) + ' cm・' + (rt >= 0 ? '右へ ' : '左へ ') + fmt(Math.abs(rt), 0) + ' cm', 'plain'],
    ['空気なしより', (r.pPlate[2] >= S.ghostNoAir.pPlate[2] ? '上に ' : '下に ') + fmt(Math.abs(r.pPlate[2] - S.ghostNoAir.pPlate[2]) / 0.01, 0) + ' cm', 'noAir'],
  ];
  const frows = [
    ['grav', '重力', Fn('grav')], ['drag', '空気の抵抗', Fn('drag')], ['magnus', 'マグヌス力', Fn('magnus')],
  ];
  if (r.st.knuckle) frows.push(['seam', '縫い目の力', Fn('seam')]);
  const wT = S.P.knuckle ? r.st.rpm : r.st.rpm * S.P.eff;
  let html = '<table>' + rows.map(x => `<tr${x[2] ? ` data-k="${x[2]}"` : ''}><th>${x[0]}</th><td>${x[1]}</td></tr>`).join('') + '</table>';
  html += '<div class="fh">いま働いている力（' + fmt(S.t, 3) + ' 秒）</div><table class="ft">' +
    frows.map(x => `<tr data-k="${x[0]}"><th><i class="sw ${x[0]}"></i>${x[1]}</th><td>${fmt(x[2], 2)} N</td><td class="w">重さの ${fmt(x[2] / W, 2)} 倍</td></tr>`).join('') + '</table>';
  html += '<div class="coef">S = rω⊥/v = ' + fmt(F.S, 3) + '　C<sub>D</sub> = ' + fmt(F.cd, 3) + '　C<sub>L</sub> = ' + fmt(F.cl, 3) +
    (r.st.knuckle ? '　θ = ' + fmt(((F.theta * 180 / Math.PI) % 360 + 360) % 360, 0) + '°' : '　曲げる回転 ' + fmt(wT, 0) + ' 回/分') + '</div>';
  if (S.many) {
    const xs = S.many.map(q => q.pPlate[0]), zs = S.many.map(q => q.pPlate[2]);
    html += '<div class="coef">10球のホームでの広がり: 左右 ' + fmt((Math.max(...xs) - Math.min(...xs)) / 0.01, 0) + ' cm・上下 ' + fmt((Math.max(...zs) - Math.min(...zs)) / 0.01, 0) + ' cm</div>';
  }
  $('nums').innerHTML = html;
}

// ---- 時間 ----
function buildTime() {
  const T = $('time');
  T.step = 0.001;
  T.addEventListener('input', () => { S.t = Number(T.value); S.playing = false; $('play').textContent = '▶'; updateNums(); });
  $('play').addEventListener('click', () => {
    if (!S.playing && S.t >= S.res.tPlate - 1e-6) S.t = 0;
    S.playing = !S.playing; $('play').textContent = S.playing ? '❚❚' : '▶';
  });
  $('speed').addEventListener('change', e => { S.speed = Number(e.target.value); });
}

// ---- 案内 ----
function setTour(i) {
  S.tour = Math.max(0, Math.min(TOUR.length - 1, i));
  S.playing = false; $('play').textContent = '▶';
  TOUR[S.tour].go();
  $('tourNum').textContent = (S.tour + 1) + ' / ' + TOUR.length;
  $('tourText').innerHTML = TOUR[S.tour].text;
  $('next').textContent = S.tour === TOUR.length - 1 ? 'はじめから' : 'つぎへ';
  syncAll();
}

// ---- 説明の吹き出し・ボールのドラッグ ----
function findHit(list, x, y) {
  let best = null, bd = 1e9;
  for (const h of list) {
    if (h.kind === 'rect') { if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h && !best) best = h; continue; }
    const d = Math.hypot(x - h.x, y - h.y); if (d <= h.r && d < bd) { bd = d; best = h; }
  }
  // 点（矢印・線）を四角（ゾーン）より優先
  return best;
}
function showTip(key, ev) {
  const tip = $('tip');
  if (!key || !PARTS[key]) { tip.hidden = true; return; }
  tip.innerHTML = PARTS[key]; tip.hidden = false;
  const W = window.innerWidth, tw = Math.min(300, W - 24);
  tip.style.maxWidth = tw + 'px';
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + tw > W - 8) x = Math.max(8, ev.clientX - tw - 14);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function bindPointer() {
  const cv = $('cv'), bc = $('ball');
  cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); const h = findHit(HITS, e.clientX - r.left, e.clientY - r.top); showTip(h && h.key, e); });
  cv.addEventListener('mouseleave', () => showTip(null));
  // ボール: ドラッグで回転の向きを決める（手前の面をこすった向きに回る）
  let drag = false;
  const setDir = e => {
    const r = bc.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
    if (Math.hypot(dx, dy) < 6) return;
    const deg = Math.round((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360);
    if (S.P.knuckle) S.P.axisDeg = (deg + 270) % 180; else S.P.dir = deg;
    onChange();
  };
  bc.addEventListener('pointerdown', e => { drag = true; bc.setPointerCapture(e.pointerId); setDir(e); });
  bc.addEventListener('pointermove', e => {
    if (drag) { setDir(e); return; }
    const r = bc.getBoundingClientRect(); const h = findHit(HITS2, e.clientX - r.left, e.clientY - r.top);
    showTip(h && (h.key === 'ball' ? 'ballDrag' : h.key), e);
  });
  bc.addEventListener('pointerup', () => { drag = false; });
  bc.addEventListener('mouseleave', () => showTip(null));
  $('nums').addEventListener('mousemove', e => { const tr = e.target.closest('tr[data-k]'); showTip(tr && tr.dataset.k, e); });
  $('nums').addEventListener('mouseleave', () => showTip(null));
}
PARTS.ballDrag = '捕手から見たボール。<b>ドラッグ</b>すると、こすった向きに手前の面が動くように回転の向きが変わります（ナックルは回転軸の向き）。';
