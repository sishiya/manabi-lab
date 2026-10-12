// 変化球のしくみ — 段階Cの操作: 投手の例・球種を重ねる・空気と風
'use strict';

function buildPitcherBar(box) {
  const bar = document.createElement('label'); bar.className = 'sl';
  bar.innerHTML = '<span class="lab">' + L('投手', 'Pitcher') + '</span><select id="pitcherSel" class="sel"></select><span class="val" id="pnote2"></span>';
  box.appendChild(bar);
  const sel = bar.querySelector('#pitcherSel');
  for (const p of PITCHERS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name + (p.id === 'std' ? '' : L('（架空）', ' (fictional)')); sel.appendChild(o); }
  sel.addEventListener('change', () => { setPitcher(sel.value); if (S.cam === 'pitcher') setCam('pitcher'); S.playing = false; syncAll(); });
}
function buildArmRow(box) {
  const row = document.createElement('label'); row.className = 'sl';
  row.innerHTML = '<span class="lab">' + L('腕の角度', 'Arm angle') + '</span><input type="range" id="armSl" min="-40" max="85" step="1"><span class="val" id="armVal"></span>';
  box.appendChild(row);
  row.querySelector('#armSl').addEventListener('input', e => { setArm(Number(e.target.value)); if (S.cam === 'pitcher') setCam('pitcher'); syncAll(); });
}
function buildOverlayRow(box) {
  const row = document.createElement('div'); row.className = 'ovrow';
  row.innerHTML = '<label class="ck"><input type="checkbox" id="ovl"><span>' + L('その投手の球種を重ねて見る（球種ごとの色）', "Overlay this pitcher's pitches (one colour each)") + '</span></label>' +
    '<select id="ovlAim" class="sel" aria-label="' + L('重ねるときのねらい', 'Aim when overlaid') + '"><option value="center">' + L('それぞれ同じねらい方で放す', 'Each aims the same way') + '</option><option value="same">' + L('いまの球と同じ向きに放す', 'Same release direction as the current pitch') + '</option></select>';
  box.appendChild(row);
  row.querySelector('#ovl').addEventListener('change', e => { S.overlay = e.target.checked; recompute(); syncAll(); });
  row.querySelector('#ovlAim').addEventListener('change', e => { S.overlayAim = e.target.value; recompute(); syncAll(); });
}

function buildEnvGroup(box) {
  const g = box;
  const head = document.createElement('div'); head.className = 'envhead';
  for (const e of ENVS) {
    const b = document.createElement('button'); b.textContent = e.name; b.dataset.env = e.id;
    b.addEventListener('click', () => { setEnv(e.id); syncAll(); });
    head.appendChild(b);
  }
  g.appendChild(head);
  const envSet = (k, v) => { S.env[k] = v; S.envId = ''; applyEnv(); };
  slider(g, 'tC', L('気温', 'Temperature'), -5, 40, 1, () => S.env.tC, v => envSet('tC', v), v => v + L(' ℃', ' °C'));
  slider(g, 'elev', L('標高', 'Altitude'), 0, 2500, 10, () => S.env.elev, v => envSet('elev', v), v => v + ' m');
  slider(g, 'pr', L('気圧（海面）', 'Pressure (sea level)'), 960, 1040, 1, () => S.env.p, v => envSet('p', v), v => v + L(' hPa（天気予報の気圧）', ' hPa (weather-report pressure)'));
  slider(g, 'rh', L('湿度', 'Humidity'), 0, 100, 1, () => S.env.rh, v => envSet('rh', v), v => v + '%');
  slider(g, 'ws', L('風の強さ', 'Wind speed'), 0, 15, 0.5, () => S.env.ws, v => envSet('ws', v), v => v.toFixed(1) + ' m/s');
  slider(g, 'wd', L('風の向き', 'Wind direction'), 0, 359, 1, () => S.env.wd, v => envSet('wd', v), v => windName(Math.max(S.env.ws, 1), v).replace(/ [0-9.]+ m\/s$/, '') + L('（' + v + '°）', ' (' + v + '°)'));
  const out = document.createElement('p'); out.id = 'envOut'; out.className = 'help'; g.appendChild(out);
}

function syncC() {
  const sel = $('pitcherSel'); if (!sel) return;
  sel.value = S.pitcher;
  $('ovl').checked = S.overlay; $('ovlAim').value = S.overlayAim; $('ovlAim').hidden = !S.overlay;
  $('pnote2').textContent = pitcherOf(S.pitcher).note;
  $('armSl').value = S.arm;
  $('armVal').textContent = L(S.arm + '°・' + armName(S.arm) + '（放す高さ ' + S.P.z0.toFixed(2) + ' m）', S.arm + '° · ' + armName(S.arm) + ' (release height ' + S.P.z0.toFixed(2) + ' m)');
  document.querySelectorAll('.envhead button').forEach(b => b.classList.toggle('on', b.dataset.env === S.envId));
  const rho = PHY.env.rho;
  $('windBadge').textContent = isStdEnv() ? '' : L('空気 ', 'Air ') + rho.toFixed(3) + L(' kg/m³・', ' kg/m³ · ') + windName(S.env.ws, S.env.wd);
  $('envOut').innerHTML = L('空気の密度 <b>' + rho.toFixed(3) + ' kg/m³</b>（ふつうの ' + (rho / STD_ENV.rho * 100).toFixed(0) + '%）。' +
    '空気の抵抗・マグヌス力・縫い目の力は、どれも密度に比例します。湿った空気は、水蒸気が空気より軽いので少しだけうすくなります。',
    'Air density <b>' + rho.toFixed(3) + ' kg/m³</b> (' + (rho / STD_ENV.rho * 100).toFixed(0) + '% of standard). ' +
    'Drag, Magnus force and seam force are all proportional to density. Humid air is slightly thinner, because water vapour is lighter than air.');
  if (S.fine) {
    const f = S.fine, mm = v => v < 0.1 ? L('0.1 mm 未満', 'under 0.1 mm') : v.toFixed(1) + ' mm';
    $('fineOut').innerHTML = L('いまの球で、それぞれを入れる／外すと、ホームでの位置は 回転の減り ' + mm(f.decay) + '・浮力 ' + mm(f.buoy) + '・付加質量 ' + mm(f.added) + '・地球の自転 ' + mm(f.coriolis) + ' 変わります。' +
      'どれもボールの大きさ（7.4 cm）よりずっと小さい。いちばん大きく答えを変えるのは、係数の不確かさです: 揚力の係数の式をもう一方に変えると、<b>上下 ' + S.clAlt.dz.toFixed(1) + ' cm・左右 ' + S.clAlt.dx.toFixed(1) + ' cm</b> 変わります。',
      'For the current pitch, turning each one on or off moves the ball at the plate by: spin decay ' + mm(f.decay) + ', buoyancy ' + mm(f.buoy) + ', added mass ' + mm(f.added) + ', Earth\'s rotation ' + mm(f.coriolis) + '. ' +
      'All are far smaller than the ball (7.4 cm). What changes the answer most is the uncertainty of the coefficients: switching the lift formula to the other one moves it <b>' + S.clAlt.dz.toFixed(1) + ' cm up/down and ' + S.clAlt.dx.toFixed(1) + ' cm sideways</b>.');
  }
  if (S.multi) {
    const lg = $('legend'), want = S.pitch + '|' + S.multi.map(m => m.id).join();
    if (lg.dataset.multi !== want) {
      lg.dataset.multi = want;
      lg.querySelectorAll('.mx').forEach(e => e.remove());
      for (const m of [{ col: PCOL[S.pitch], name: arsenal(S.pitcher).find(q => q.id === S.pitch).name + L('（いまの球）', ' (current)') }].concat(S.multi)) { const sp = document.createElement('span'); sp.className = 'mx'; sp.innerHTML = '<i class="sw" style="background:' + m.col + '"></i>' + m.name; lg.appendChild(sp); }
    }
  } else if ($('legend').dataset.multi) { $('legend').dataset.multi = ''; $('legend').querySelectorAll('.mx').forEach(e => e.remove()); }
}
