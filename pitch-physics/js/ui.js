// 変化球のしくみ — 操作（球種・つまみ・時間・案内・説明・数字）
'use strict';

const $ = id => document.getElementById(id);
const fmt = (x, n = 0) => Number(x).toFixed(n);
function clock(deg) {               // 角度°（12時から時計まわり）→「1時半」など
  let h = ((deg % 360) + 360) % 360 / 30, hh = Math.floor(h + 1e-6), half = h - hh >= 0.25 && h - hh < 0.75;
  if (h - hh >= 0.75) hh += 1;
  hh = hh % 12; if (hh === 0) hh = 12;
  return LANG === 'en' ? hh + (half ? ':30' : " o'clock") : hh + '時' + (half ? '半' : '');
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
function selectCtl(parent, key, lab, opts, get, set) {
  const row = document.createElement('label'); row.className = 'sl';
  row.innerHTML = `<span class="lab">${lab}</span><select class="sel"></select><span class="val"></span>`;
  const sel = row.querySelector('select'), val = row.querySelector('.val');
  for (const o of opts) { const e = document.createElement('option'); e.value = o[0]; e.textContent = o[1]; sel.appendChild(e); }
  sel.addEventListener('change', () => { set(sel.value); onChange(); });
  parent.appendChild(row);
  CTRL[key] = { row, sync() { sel.value = get(); const o = opts.find(q => q[0] === get()); val.textContent = o && o[2] || ''; } };
}
function check(parent, key, lab, get, set) {
  const row = document.createElement('label'); row.className = 'ck';
  row.innerHTML = `<input type="checkbox"><span>${lab}</span>`;
  const inp = row.querySelector('input');
  inp.addEventListener('change', () => { set(inp.checked); onChange(true); });
  parent.appendChild(row);
  CTRL[key] = { row, sync() { inp.checked = get(); } };
}

// 設定は 7 つのまとまり（操作の流れの順: 誰が → どんな球を → どこへ → 誰に → 何と比べて → どんな空気で → くわしい設定）。
// よく使う ① ② だけ最初から開き、ほかはたたむ。たたんだ見出しには、いまの設定を短く出す（開かなくても分かるように）
function section(box, id, num, title, open) {
  const d = document.createElement('details'); d.className = 'sec'; d.id = 'sec-' + id; if (open) d.open = true;
  d.innerHTML = '<summary><span class="num">' + num + '</span><span class="t">' + title + '</span><span class="sum" id="sum-' + id + '"></span></summary><div class="secb"></div>';
  box.appendChild(d);
  return d.querySelector('.secb');
}
function buildControls() {
  const box = $('controls');
  // ① 投手と球種
  const s1 = section(box, 'pitch', '1', L('投手と球種', 'Pitcher and pitch'), true);
  buildPitcherBar(s1);
  const hand = document.createElement('div'); hand.className = 'hand';
  hand.innerHTML = '<span class="lab">' + L('投げる手', 'Throwing hand') + '</span><button data-h="R">' + L('右投げ', 'Right') + '</button><button data-h="L">' + L('左投げ', 'Left') + '</button>';
  hand.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { setHand(b.dataset.h); if (S.cam === 'pitcher') setCam('pitcher'); syncAll(); }));
  s1.appendChild(hand);
  buildArmRow(s1);
  const chips = document.createElement('div'); chips.className = 'chips'; chips.id = 'chips';
  s1.appendChild(chips); rebuildChips();
  const note = document.createElement('p'); note.id = 'pnote'; note.className = 'help'; s1.appendChild(note);

  // ② 球の速さと回転
  const s2 = section(box, 'spin', '2', L('球の速さと回転', 'Speed and spin'), true);
  slider(s2, 'v0', L('速さ', 'Speed'), 60, 170, 1, () => S.P.v0, v => S.P.v0 = v, v => v + L(' km/h（', ' km/h (') + fmt(v / 3.6 / MPH, 0) + L(' mph）', ' mph)'));
  // 速さの測り方（どこで測るかで数字が変わる）と、昔の記録を初速に直す計算
  const sp = document.createElement('div'); sp.className = 'speedbox'; sp.innerHTML =
    '<div class="sbh">' + L('速さの測り方（いまの球）', 'Where the speed is measured (current pitch)') + '</div><table id="spTable"></table>' +
    '<div class="sbh">' + L('測った記録を、放した瞬間の速さに直す', 'Convert a measured speed to release speed') + '</div>' +
    '<div class="conv"><input type="number" id="cvVal" value="100.8" step="0.1" min="40" max="200" aria-label="' + L('測った速さ', 'Measured speed') + '"><select id="cvUnit"><option value="mph">mph</option><option value="kmh">km/h</option></select>' +
    '<select id="cvWhere"><option value="y10">' + L('ホームの 10 ft 手前で', 'at 10 ft before the plate') + '</option><option value="plate">' + L('ホームで（終速）', 'at the plate (final speed)') + '</option><option value="y50">' + L('50 ft 地点で', 'at 50 ft') + '</option><option value="release">' + L('放した瞬間に', 'at release') + '</option></select>' +
    '<button id="cvGo" class="act">' + L('直す', 'Convert') + '</button></div><p class="help" id="cvOut">' + L('例: 1974 年の大リーグで、ホームの約 10 ft 手前で 100.8 mph と測られた記録（SABR）。いまの投げ方・空気で計算します。', 'Example: a 1974 MLB pitch measured at 100.8 mph about 10 ft before the plate (SABR). Computed with the current pitch and air.') + '</p>';
  s2.appendChild(sp);
  sp.querySelector('#cvGo').addEventListener('click', () => {
    const v = Number($('cvVal').value), unit = $('cvUnit').value, where = $('cvWhere').value;
    if (!(v > 0)) return;
    const ms = unit === 'mph' ? v * MPH : v / 3.6, P = Object.assign({}, S.P);
    const v0 = releaseFromMeasured(P, where, ms), r = simulate(Object.assign({}, P, { v0 }));
    const wn = (LANG === 'en' ? { y10: 'At 10 ft before the plate', plate: 'At the plate', y50: 'At 50 ft', release: 'At release' } : { y10: 'ホームの 10 ft 手前', plate: 'ホーム', y50: '50 ft 地点', release: '放した瞬間' })[where];
    $('cvOut').innerHTML = L(wn + 'で ' + v + ' ' + (unit === 'mph' ? 'mph' : 'km/h') + ' → 放した瞬間は <b>' + fmt(v0, 1) + ' km/h（' + fmt(v0 / 3.6 / MPH, 1) + ' mph）</b>。' +
      '（いまの投げ方: 回転数 ' + P.rpm + ' 回/分・空気 ' + fmt(PHY.env.rho, 3) + ' kg/m³ で計算。50 ft 地点なら ' + fmt(speedAt(r, 'y50') * 3.6, 1) + ' km/h、ホームで ' + fmt(speedAt(r, 'plate') * 3.6, 1) + ' km/h）',
      wn + ' ' + v + ' ' + (unit === 'mph' ? 'mph' : 'km/h') + ' → at release <b>' + fmt(v0, 1) + ' km/h (' + fmt(v0 / 3.6 / MPH, 1) + ' mph)</b>. ' +
      '(Current pitch: ' + P.rpm + ' rpm, air ' + fmt(PHY.env.rho, 3) + ' kg/m³. At 50 ft ' + fmt(speedAt(r, 'y50') * 3.6, 1) + ' km/h, at the plate ' + fmt(speedAt(r, 'plate') * 3.6, 1) + ' km/h)') +
      ' <button id="cvUse" class="act">' + L('この速さで投げる', 'Throw at this speed') + '</button>';
    $('cvUse').addEventListener('click', () => { S.P.v0 = Math.min(200, Math.round(v0)); onChange(); });
  });
  slider(s2, 'rpm', L('回転数', 'Spin rate'), 0, 3500, 10, () => S.P.rpm, v => S.P.rpm = v, v => v + L(' 回/分', ' rpm'));
  slider(s2, 'dir', L('回転の向き', 'Spin direction'), 0, 359, 1, () => S.P.dir, v => S.P.dir = v, v => L('手前の面が ' + clock(v) + ' の向きへ（軸 ' + clock(v + 270) + '）', 'front face toward ' + clock(v) + ' (axis ' + clock(v + 270) + ')'));
  slider(s2, 'eff', L('使える回転', 'Useful spin'), 0, 100, 1, () => Math.round(S.P.eff * 100), v => S.P.eff = v / 100, v => v + L('%（のこりはジャイロ回転）', '% (the rest is gyro spin)'));
  selectCtl(s2, 'grip', L('縫い目', 'Seam grip'), [
    ['4S', L('4つの縫い目（フォーシーム）', 'Four seams (four-seam)'), L('1回転で縫い目が4回、前を通る', 'Seams pass the front 4 times per turn')],
    ['2S', L('2つの縫い目（ツーシーム）', 'Two seams (two-seam)'), L('1回転で縫い目が2回、前を通る', 'Seams pass the front 2 times per turn')],
    ['none', L('縫い目の力を入れない', 'No seam force'), L('回転だけで計算する', 'Compute from spin only')],
  ], () => S.P.grip || 'none', v => S.P.grip = v === 'none' ? null : v);
  slider(s2, 'seam0', L('縫い目の角度', 'Seam angle'), 0, 90, 1, () => S.P.seam0, v => S.P.seam0 = v, v => 'θ = ' + v + L('°（放したとき）', '° (at release)'));
  slider(s2, 'axisDeg', L('回転軸', 'Spin axis'), 0, 179, 1, () => S.P.axisDeg, v => S.P.axisDeg = v, v => clock(v) + L('（捕手から見て）', " (catcher's view)"));
  const many = document.createElement('button'); many.id = 'many'; many.className = 'act'; many.textContent = L('少しずつちがう10球を投げる', 'Throw 10 slightly different pitches');
  many.addEventListener('click', () => { throwMany(); S.t = 0; S.playing = true; syncAll(); });
  s2.appendChild(many);

  // ③ ねらい
  const s3 = section(box, 'aim', '3', L('ねらい', 'Aim'), true);
  selectCtl(s3, 'aimMode', L('ねらい方', 'How to aim'), [
    ['plain', L('回転の力がなければまん中に届く向き', 'Would reach the middle without spin force'), L('まん中からのずれ ＝ 回転と縫い目による変化', 'Gap from the middle = break from spin and seams')],
    ['line', L('まん中へまっすぐ向ける', 'Point straight at the middle'), L('重力・抵抗・回転のぶん、まん中からずれる', 'Misses the middle by gravity, drag and spin')],
    ['fit', L('この球がまん中に届くよう合わせる', 'Fit so this pitch reaches the middle'), L('どの球もまん中に届く', 'Every pitch reaches the middle')],
    ['manual', L('角度を手で決める', 'Set the angles by hand'), ''],
  ], () => S.aimMode, v => S.aimMode = v);
  selectCtl(s3, 'guideRef', L('ガイドの基準', 'Guide reference'), [
    ['ff', L('フォーシーム（同じねらいで投げたまっすぐ）', 'Four-seam (a fastball with the same aim)'), L('白い輪 ＝ まっすぐならここ。ずれ ＝ まっすぐとの変化の差', 'White ring = where a fastball would cross. Gap = difference in break from the fastball')],
    ['plain', L('回転がなければ', 'No spin'), L('白い輪 ＝ 回転と縫い目の力がなければここ。ずれ ＝ 変化そのもの', 'White ring = where it would cross without spin and seam forces. Gap = the break itself')],
  ], () => S.guideRef, v => S.guideRef = v);
  slider(s3, 'vAng', L('放す角度（上下）', 'Release angle (up/down)'), -6, 6, 0.05, () => S.P.vAng, v => { S.P.vAng = v; S.aimMode = 'manual'; }, v => fmt(v, 2) + '°');
  slider(s3, 'hAng', L('放す角度（左右）', 'Release angle (left/right)'), -6, 6, 0.05, () => S.P.hAng, v => { S.P.hAng = v; S.aimMode = 'manual'; }, v => fmt(v, 2) + L('°（＋は捕手から見て右へ）', "° (+ = right, catcher's view)"));

  // ④ 打者
  const s4 = section(box, 'bat', '4', L('打者', 'Batter'), true);
  selectCtl(s4, 'batSide', L('打席', 'Batting side'), [['R', L('右打者（捕手から見て左）', "Right-handed (catcher's left)")], ['L', L('左打者（捕手から見て右）', "Left-handed (catcher's right)")]], () => S.batSide, v => S.batSide = v);
  slider(s4, 'batH', L('身長', 'Height'), 150, 205, 1, () => S.batH, v => { S.batH = v; setZoneFor(v); }, v => L(v + ' cm → ゾーン ' + Math.round(ZONE.zLo * 100) + '〜' + Math.round(ZONE.zHi * 100) + ' cm（目安）', v + ' cm → zone ' + Math.round(ZONE.zLo * 100) + '–' + Math.round(ZONE.zHi * 100) + ' cm (rough guide)'));
  slider(s4, 'swingMs', L('スイングの時間', 'Swing time'), 130, 280, 5, () => S.swingMs, v => S.swingMs = v, v => v + L(' ms（研究で 130〜280）', ' ms (studies: 130–280)'));
  slider(s4, 'delayMs', L('決めてから振るまで', 'Decide → start swing'), 150, 250, 5, () => S.delayMs, v => S.delayMs = v, v => v + L(' ms（研究で 150〜250）', ' ms (studies: 150–250)'));

  // ⑤ くらべる
  const s5 = section(box, 'cmp', '5', L('くらべる・重ねる', 'Compare and overlay'), true);
  buildOverlayRow(s5);
  check(s5, 'noAir', '<i class="sw noair"></i>' + L('空気がないとき', 'With no air'), () => S.show.noAir, v => S.show.noAir = v);
  check(s5, 'plain', '<i class="sw plain"></i>' + L('回転の力なし（重力と抵抗だけ）', 'No spin force (gravity and drag only)'), () => S.show.plain, v => S.show.plain = v);
  check(s5, 'std', '<i class="sw std"></i>' + L('ふつうの空気で放したとき', 'Same pitch in standard air'), () => S.show.std !== false, v => S.show.std = v);
  check(s5, 'forces', L('力の矢印', 'Force arrows'), () => S.show.forces, v => S.show.forces = v);

  // ⑥ 空気と風
  buildEnvGroup(section(box, 'env', '6', L('空気と風', 'Air and wind'), true));

  // ⑦ くわしい設定（本物に近づける小さな効果・係数の式）
  const s7 = section(box, 'fine', '7', L('くわしい設定（本物に近づける）', 'Details (getting closer to reality)'), true);
  check(s7, 'fxDecay', L('回転の減り', 'Spin decay'), () => PHY.fx.decay, v => PHY.fx.decay = v);
  check(s7, 'fxBuoy', L('空気の浮力', 'Buoyancy of air'), () => PHY.fx.buoy, v => PHY.fx.buoy = v);
  check(s7, 'fxAdded', L('付加質量（まわりの空気もいっしょに動く）', 'Added mass (the air around moves too)'), () => PHY.fx.added, v => PHY.fx.added = v);
  check(s7, 'fxCor', L('地球の自転（コリオリの力）', "Earth's rotation (Coriolis force)"), () => PHY.fx.coriolis, v => PHY.fx.coriolis = v);
  slider(s7, 'lat', L('緯度', 'Latitude'), -60, 60, 1, () => PHY.lat, v => PHY.lat = v, v => L((v >= 0 ? '北緯 ' : '南緯 ') + Math.abs(v) + '°', Math.abs(v) + '° ' + (v >= 0 ? 'N' : 'S')));
  selectCtl(s7, 'clModel', L('揚力の係数の式', 'Lift coefficient formula'), [['nathan', L('Nathan の軌道計算機', "Nathan's trajectory calculator"), ''], ['sawicki', L('Sawicki ほか 2003', 'Sawicki et al. 2003'), '']], () => PHY.clModel, v => PHY.clModel = v);
  const fo = document.createElement('p'); fo.id = 'fineOut'; fo.className = 'help'; s7.appendChild(fo);
}
// たたんだ見出しに出す、いまの設定の短い説明
function syncSummaries() {
  const set = (id, t) => { const e = $('sum-' + id); if (e) e.textContent = t; };
  const p = arsenal(S.pitcher).find(q => q.id === S.pitch);
  const D = L('・', ' · ');
  set('pitch', pitcherOf(S.pitcher).name + D + (S.hand === 'R' ? L('右投げ', 'right') : L('左投げ', 'left')) + D + (p ? p.name : ''));
  set('spin', S.P.v0 + ' km/h' + D + S.P.rpm + L(' 回/分', ' rpm'));
  set('aim', (LANG === 'en' ? { plain: 'on target without spin', line: 'pointed at target', fit: 'fitted to target', manual: 'by hand' } : { plain: '回転の力がなければねらいへ', line: 'まっすぐねらいへ', fit: 'ねらいに合わせる', manual: '手で決める' })[S.aimMode] + L('・基準 ', ' · ref. ') + (S.guideRef === 'ff' ? L('フォーシーム', 'four-seam') : L('回転なし', 'no spin')));
  set('bat', (S.batSide === 'R' ? L('右打者', 'right-handed') : L('左打者', 'left-handed')) + D + S.batH + ' cm');
  set('cmp', S.overlay ? L('球種を重ねている', 'overlaying pitches') : '');
  set('env', (ENVS.find(e => e.id === S.envId) || { name: S.env.tC + L(' ℃・', ' °C · ') + S.env.elev + ' m' }).name + D + windName(S.env.ws, S.env.wd));
}
// 球種のボタン（いまの投手の球種だけ）
let chipsFor = null;
function rebuildChips() {
  const box = $('chips'); if (!box || chipsFor === S.pitcher) return;
  chipsFor = S.pitcher; box.innerHTML = '';
  for (const p of arsenal(S.pitcher)) {
    const b = document.createElement('button'); b.dataset.id = p.id; b.title = p.note;
    b.innerHTML = '<i class="dot" style="background:' + PCOL[p.id] + '"></i>' + p.name;
    b.addEventListener('click', () => { setPitch(p.id); S.playing = false; syncAll(); });
    box.appendChild(b);
  }
}

function onChange(viewOnly) {
  if (!viewOnly) S.many = null;
  recompute();
  syncAll();
}

function syncAll() {
  for (const k in CTRL) CTRL[k].sync();
  const kn = !!S.P.knuckle;
  for (const k of ['dir', 'eff']) CTRL[k].row.hidden = kn;
  for (const k of ['seam0', 'axisDeg']) CTRL[k].row.hidden = !kn;
  // 縫い目の向き: ナックルと、測定のある球種（まっすぐ・シンカー・チェンジアップ）だけ
  CTRL.grip.row.hidden = !(kn || ['ff', 'si', 'ch'].includes(S.pitch));
  $('many').hidden = !kn;
  CTRL.rpm.row.querySelector('input').max = kn ? 300 : 3500;
  CTRL.rpm.sync();
  document.querySelectorAll('.hand button').forEach(b => b.classList.toggle('on', b.dataset.h === S.hand));
  document.querySelectorAll('#vtabs button').forEach(b => b.classList.toggle('on', b.dataset.v === S.view));
  document.querySelectorAll('#cams button').forEach(b => b.classList.toggle('on', b.dataset.c === S.cam));
  $('views').classList.toggle('v3d', S.view === '3d');
  rebuildChips(); syncC(); syncSummaries();
  $('refToggle').textContent = L('白い輪: ' + (S.guideRef === 'ff' ? 'フォーシームならここ' : '回転がなければここ') + '（タップで切りかえ）', 'White ring: ' + (S.guideRef === 'ff' ? 'a four-seam would cross here' : 'here without spin') + ' (tap to switch)');
  document.querySelectorAll('.chips button').forEach(b => b.classList.toggle('on', b.dataset.id === S.pitch));
  const p = arsenal(S.pitcher).find(q => q.id === S.pitch); $('pnote').textContent = p ? p.note : '';
  const T = $('time'); T.max = tEnd(); T.value = S.t;
  $('play').textContent = S.playing ? '❚❚' : '▶';   // 球種を変えたときなども、再生の印をいまの状態に合わせる
  const tb = $('spTable');
  if (tb) {
    const row = (w, lab) => '<tr><th>' + lab + '</th><td>' + fmt(speedAt(S.res, w) * 3.6, 1) + ' km/h</td><td class="w">' + fmt(speedAt(S.res, w) / MPH, 1) + ' mph</td></tr>';
    tb.innerHTML = row('release', L('放した瞬間（初速。いまの MLB・NPB のトラックマンなど）', 'At release (MLB today, Japanese pro tracking systems, etc.)')) + row('y50', L('ホームから 50 ft（2008〜16 年の MLB）', '50 ft from the plate (MLB 2008–16)')) +
      row('y10', L('ホームから 10 ft（1974 年の大リーグの測定）', '10 ft from the plate (the 1974 MLB measurement)')) + row('plate', L('ホーム（終速。打者の近く）', 'At the plate (final speed, near the batter)'));
  }
  updateNums();
}

function updateNums() {
  const r = S.res, s = sampleAt(r, S.t), F = forces(r.st, s.t, s.v, r.opt), W = PHY.m * PHY.g;
  const Fn = k => V.len(F[k]);
  $('tlab').textContent = fmt(S.t, 3) + L(' 秒 / ', ' s / ') + fmt(tEnd(), 3);
  const mv = S.mv, up = mv.dz / 0.01, rt = mv.dx / 0.01;
  const rows = [
    [L('ホームまで', 'To the plate'), fmt(r.tPlate, 3) + L(' 秒', ' s')],
    [L('速さ', 'Speed'), fmt(V.len(r.st.vel) * 3.6, 0) + ' → ' + fmt(V.len(r.vPlate) * 3.6, 0) + ' km/h'],
    [L('変化量（50 ft から）', 'Break (from 50 ft)'), mvText(S.mv50), 'mv50'],
    [L('変化量（放してから）', 'Break (from release)'), mvStr(up, rt), 'plain'],
    [L('ねらった点から', 'From the aim point'), missText(r), 'target'],
    [L('空気なしより', 'Compared with no air'), (r.pPlate[2] >= S.ghostNoAir.pPlate[2] ? L('上に ', 'higher by ') : L('下に ', 'lower by ')) + fmt(Math.abs(r.pPlate[2] - S.ghostNoAir.pPlate[2]) / 0.01, 0) + ' cm', 'noAir'],
    [L('空気', 'Air'), 'ρ = ' + fmt(r.st.rho, 3) + L(' kg/m³（ふつうの ', ' kg/m³ (') + fmt(r.st.rho / STD_ENV.rho * 100, 0) + L('%）・', '% of standard) · ') + windName(S.env.ws, S.env.wd), 'air'],
  ];
  if (S.ghostStd) {
    const dz = (r.pPlate[2] - S.ghostStd.pPlate[2]) / 0.01, dx = (r.pPlate[0] - S.ghostStd.pPlate[0]) / 0.01;
    rows.push([L('ふつうの空気より', 'Compared with standard air'), L((dz >= 0 ? '上に ' : '下に ') + fmt(Math.abs(dz), 0) + ' cm・' + (dx >= 0 ? '右に ' : '左に ') + fmt(Math.abs(dx), 0) + ' cm', (dz >= 0 ? 'up ' : 'down ') + fmt(Math.abs(dz), 0) + ' cm, ' + (dx >= 0 ? 'right ' : 'left ') + fmt(Math.abs(dx), 0) + ' cm'), 'std']);
  }
  const frows = [
    ['grav', L('重力', 'Gravity'), Fn('grav')], ['drag', L('空気の抵抗', 'Air resistance'), Fn('drag')], ['magnus', L('マグヌス力', 'Magnus force'), Fn('magnus')],
  ];
  if (r.st.knuckle || r.st.grip) frows.push(['seam', r.st.knuckle ? L('縫い目の力', 'Seam force') : L('縫い目の力（ずれた伴流）', 'Seam force (shifted wake)'), Fn('seam')]);
  const wT = S.P.knuckle ? r.st.rpm : r.st.rpm * S.P.eff;
  let html = '<table>' + rows.map(x => `<tr${x[2] ? ` data-k="${x[2]}"` : ''}><th>${x[0]}</th><td>${x[1]}</td></tr>`).join('') + '</table>';
  html += '<div class="fh">' + L('いま働いている力（' + fmt(S.t, 3) + ' 秒）', 'Forces right now (' + fmt(S.t, 3) + ' s)') + '</div><table class="ft">' +
    frows.map(x => `<tr data-k="${x[0]}"><th><i class="sw ${x[0]}"></i>${x[1]}</th><td>${fmt(x[2], 2)} N</td><td class="w">${L('重さの ' + fmt(x[2] / W, 2) + ' 倍', fmt(x[2] / W, 2) + '× weight')}</td></tr>`).join('') + '</table>';
  const SP = L('　', '\u2003');   // 数字の区切りの空き（英語では全角の空白を使わない）
  html += '<div class="coef">S = rω⊥/v = ' + fmt(F.S, 3) + SP + 'C<sub>D</sub> = ' + fmt(F.cd, 3) + SP + 'C<sub>L</sub> = ' + fmt(F.cl, 3) +
    (r.st.knuckle ? SP + 'θ = ' + fmt(((F.theta * 180 / Math.PI) % 360 + 360) % 360, 0) + '°' : L('　曲げる回転 ' + fmt(wT, 0) + ' 回/分', '\u2003breaking spin ' + fmt(wT, 0) + ' rpm')) + '</div>';
  if (S.many) {
    const xs = S.many.map(q => q.pPlate[0]), zs = S.many.map(q => q.pPlate[2]);
    html += '<div class="coef">' + L('10球のホームでの広がり: 左右 ' + fmt((Math.max(...xs) - Math.min(...xs)) / 0.01, 0) + ' cm・上下 ' + fmt((Math.max(...zs) - Math.min(...zs)) / 0.01, 0) + ' cm', 'Spread of the 10 pitches at the plate: ' + fmt((Math.max(...xs) - Math.min(...xs)) / 0.01, 0) + ' cm sideways, ' + fmt((Math.max(...zs) - Math.min(...zs)) / 0.01, 0) + ' cm up/down') + '</div>';
  }
  $('nums').innerHTML = html;
}

// 変化量の文（cm とインチ、腕の側／グラブの側）
function mvText(m) {
  const up = m.dz / 0.01, rt = m.dx / 0.01;
  return mvStr(up, rt) + L('　', '\u2003') + fmt(Math.abs(m.dz) / 0.0254, 1) + L('・', ' / ') + fmt(Math.abs(m.dx) / 0.0254, 1) + ' in';
}
// 変化の向きと大きさの文（上下 cm・左右 cm・腕の側／グラブの側）
function mvStr(up, rt) {
  const side = Math.abs(rt) >= 1 ? (Math.sign(rt) === armSign() ? L('腕の側', 'arm side') : L('グラブの側', 'glove side')) : '';
  return LANG === 'en' ? (up >= 0 ? 'up ' : 'down ') + fmt(Math.abs(up), 0) + ' cm, ' + (rt >= 0 ? 'right ' : 'left ') + fmt(Math.abs(rt), 0) + ' cm' + (side ? ' (' + side + ')' : '')
    : (up >= 0 ? '上へ ' : '下へ ') + fmt(Math.abs(up), 0) + ' cm・' + (rt >= 0 ? '右へ ' : '左へ ') + fmt(Math.abs(rt), 0) + ' cm' + (side ? '（' + side + '）' : '');
}
// ねらった点（初めはゾーンのまん中）からのずれ（ホームの前の端で）
function missText(r) {
  const dz = (r.pPlate[2] - TARGET.z) / 0.01, dx = (r.pPlate[0] - TARGET.x) / 0.01;
  const inZone = Math.abs(r.pPlate[0]) <= ZONE.x + PHY.r && r.pPlate[2] >= ZONE.zLo - PHY.r && r.pPlate[2] <= ZONE.zHi + PHY.r;
  if (r.ground) return L('地面に落ちた', 'hit the ground');
  if (Math.hypot(dz, dx) < 1) return L('ほぼまん中', 'almost dead centre');
  return L((dz >= 0 ? '上へ ' : '下へ ') + fmt(Math.abs(dz), 0) + ' cm・' + (dx >= 0 ? '右へ ' : '左へ ') + fmt(Math.abs(dx), 0) + ' cm（' + (inZone ? 'ゾーンの中' : 'ゾーンの外') + '）',
    (dz >= 0 ? 'up ' : 'down ') + fmt(Math.abs(dz), 0) + ' cm, ' + (dx >= 0 ? 'right ' : 'left ') + fmt(Math.abs(dx), 0) + ' cm (' + (inZone ? 'in the zone' : 'outside the zone') + ')');
}

// ---- 図の切りかえ・カメラ ----
function setView(v) { S.view = v === '3d' && V3.ok ? '3d' : '2d'; syncAll(); resize(); }
function buildViewTabs() {
  document.querySelectorAll('#vtabs button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v)));
  const box = $('cams');
  for (const id in CAMS) {
    const b = document.createElement('button'); b.textContent = CAMS[id].name; b.dataset.c = id;
    b.addEventListener('click', () => { setCam(id); syncAll(); });
    box.appendChild(b);
  }
}

// ---- 時間 ----
function buildTime() {
  const T = $('time');
  T.step = 0.001;
  T.addEventListener('input', () => { S.t = Number(T.value); S.playing = false; $('play').textContent = '▶'; updateNums(); });
  $('play').addEventListener('click', () => {
    if (!S.playing && S.t >= tEnd() - 1e-6) S.t = 0;
    S.playing = !S.playing; $('play').textContent = S.playing ? '❚❚' : '▶';
  });
  $('speed').addEventListener('change', e => { S.speed = Number(e.target.value); });
}

// ---- 案内 ----
function setTour(i) {
  S.tour = Math.max(0, Math.min(TOUR.length - 1, i));
  S.playing = false; $('play').textContent = '▶';
  // 案内の段は、平均的な右投げの投手・ふつうの空気・重ねないところから始める
  S.pitcher = 'std'; S.hand = 'R'; S.arm = 45; S.aimMode = 'plain'; S.overlay = false; S.batH = 185; setZoneFor(185); TARGET.x = 0; S.guideRef = 'ff'; $('tour').classList.remove('full'); S.env = { tC: 20, elev: 0, p: 1013, rh: 50, ws: 0, wd: 0 }; S.envId = 'std'; applyEnv();
  TOUR[S.tour].go();
  S.t = 0; S.playing = true; $('play').textContent = '❚❚';   // 案内の段は 0.0 秒から再生する
  $('tourNum').textContent = (S.tour + 1) + ' / ' + TOUR.length;
  $('tourText').innerHTML = TOUR[S.tour].text;
  $('next').textContent = S.tour === TOUR.length - 1 ? L('はじめから', 'Start over') : L('つぎへ', 'Next');
  syncAll();
}

// スマホでは球種のボタンを画面の下（時間のつまみの上）へ移す。広い画面では ① 投手と球種 の中へ戻す
function placeChips() {
  const chips = $('chips'), small = window.matchMedia('(max-width:640px)').matches;
  const home = $('pnote');
  if (small && chips.parentNode !== $('dockChips')) $('dockChips').appendChild(chips);
  if (!small && chips.parentNode === $('dockChips')) home.parentNode.insertBefore(chips, home);
}

// 言語（I18N.md）: 題名・属性の文・再生の速さ・JP／EN のボタン
function initLang() {
  document.title = L('変化球のしくみ', 'How Pitches Break');
  const at = (id, a, t) => { const e = $(id); if (e) e.setAttribute(a, t); };
  at('badge', 'title', L('計算と見せ方を試すための技術検証です。選手の指導や評価には使えません', 'A tech demo to test the calculation and the visuals. Not for coaching or evaluating players'));
  at('tourText', 'title', L('タップで全文', 'Tap for the full text'));
  at('tourClose', 'aria-label', L('案内をしまう', 'Hide the guide'));
  at('refToggle', 'title', L('ホームの面の白い輪の基準を切りかえる', 'Switch what the white ring on the plate shows'));
  at('play', 'aria-label', L('再生', 'Play'));
  at('time', 'aria-label', L('時刻', 'Time'));
  at('speed', 'aria-label', L('再生の速さ', 'Playback speed'));
  const sp = $('speed').options; sp[0].textContent = L('1/20 の速さ', '1/20 speed'); sp[1].textContent = L('1/5 の速さ', '1/5 speed'); sp[2].textContent = L('本当の速さ', 'Real speed');
  $('langsw').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.l === LANG)); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
}

// 凡例はボタンで開け閉め。操作のヒントは 6 秒か、最初にさわったら消す
function bindLegend() {
  $('legendBtn').addEventListener('click', () => { const l = $('legend'); l.hidden = !l.hidden; $('legendBtn').setAttribute('aria-expanded', String(!l.hidden)); $('legendBtn').textContent = l.hidden ? L('凡例', 'Legend') : L('凡例を閉じる', 'Close legend'); });
  $('legendBtn').textContent = L('凡例', 'Legend');
  const gone = () => $('hint3d').classList.add('gone');
  setTimeout(gone, 6000); $('gl').addEventListener('pointerdown', gone, { once: true });
}

// 3D の右上の「白い輪の基準」の切りかえ（③ねらい の「ガイドの基準」と同じ）
function bindRefToggle() {
  $('refToggle').addEventListener('click', () => { S.guideRef = S.guideRef === 'ff' ? 'plain' : 'ff'; recompute(); syncAll(); });
}

// 案内の帯: 文をタップで全文／2行、× でしまう
function bindTourBar() {
  $('tourText').addEventListener('click', () => $('tour').classList.toggle('full'));
  $('tourClose').addEventListener('click', () => { $('tour').hidden = true; $('tourOpen').hidden = false; resize(); });
  $('tourOpen').addEventListener('click', () => { $('tour').hidden = false; $('tourOpen').hidden = true; resize(); });
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
  cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); const h = findHit(HITS, e.clientX - r.left, e.clientY - r.top); showTip(h && h.key, e); cv.style.cursor = h && h.key === 'plainMark' ? 'move' : ''; });
  // 2D の「捕手の目線」で、回転がなければ通る点をドラッグ（ホームの面へ逆に写す）
  let tdrag = false, raf = 0, pend = null;
  const toPlate = e => { const r = cv.getBoundingClientRect(), ct = LAY.catcher, x = e.clientX - r.left, y = e.clientY - r.top, d = PHY.plateY - ct.eye[1];
    return [ct.eye[0] + (x - ct.cx) * d / ct.f, ct.eye[2] - (y - ct.cy) * d / ct.f]; };
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), m = LAY.catcher.plainMark; if (!m) return;
    if (Math.hypot(e.clientX - r.left - m[0], e.clientY - r.top - m[1]) < m[2]) { tdrag = true; S.playing = false; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener('pointermove', e => { if (!tdrag) return; pend = toPlate(e); if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (pend) { setRef(pend[0], pend[1]); syncAll(); } }); });
  cv.addEventListener('pointerup', () => { tdrag = false; });
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
if (LANG !== 'en') PARTS.ballDrag = '捕手から見たボール。<b>ドラッグ</b>すると、こすった向きに手前の面が動くように回転の向きが変わります（ナックルは回転軸の向き）。';
