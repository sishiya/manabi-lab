// 変化球のしくみ — 段階Cの操作: 投手の例・球種を重ねる・空気と風
'use strict';

function buildPitcherBar(box) {
  const bar = document.createElement('div'); bar.className = 'pbar';
  bar.innerHTML = '<label>投手 <select id="pitcherSel"></select></label>' +
    '<label class="ck"><input type="checkbox" id="ovl"><span>球種を重ねて見る</span></label>' +
    '<select id="ovlAim" aria-label="重ねるときのねらい"><option value="center">それぞれゾーンのまん中をねらう</option><option value="same">いまの球と同じ向きに放す</option></select>' +
    '<span id="pnote2"></span>';
  box.appendChild(bar);
  const sel = bar.querySelector('#pitcherSel');
  for (const p of PITCHERS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name + (p.id === 'std' ? '' : '（架空）'); sel.appendChild(o); }
  sel.addEventListener('change', () => { setPitcher(sel.value); if (S.cam === 'pitcher') setCam('pitcher'); S.playing = false; syncAll(); });
  bar.querySelector('#ovl').addEventListener('change', e => { S.overlay = e.target.checked; recompute(); syncAll(); });
  bar.querySelector('#ovlAim').addEventListener('change', e => { S.overlayAim = e.target.value; recompute(); syncAll(); });
}

function buildEnvGroup(box) {
  const g = document.createElement('div'); g.className = 'grp env';
  const head = document.createElement('div'); head.className = 'envhead';
  head.innerHTML = '<b>空気と風</b> ';
  for (const e of ENVS) {
    const b = document.createElement('button'); b.textContent = e.name; b.dataset.env = e.id;
    b.addEventListener('click', () => { setEnv(e.id); syncAll(); });
    head.appendChild(b);
  }
  g.appendChild(head);
  const envSet = (k, v) => { S.env[k] = v; S.envId = ''; applyEnv(); };
  slider(g, 'tC', '気温', -5, 40, 1, () => S.env.tC, v => envSet('tC', v), v => v + ' ℃');
  slider(g, 'elev', '標高', 0, 2500, 10, () => S.env.elev, v => envSet('elev', v), v => v + ' m');
  slider(g, 'pr', '気圧（海面）', 960, 1040, 1, () => S.env.p, v => envSet('p', v), v => v + ' hPa（天気予報の気圧）');
  slider(g, 'rh', '湿度', 0, 100, 1, () => S.env.rh, v => envSet('rh', v), v => v + '%');
  slider(g, 'ws', '風の強さ', 0, 15, 0.5, () => S.env.ws, v => envSet('ws', v), v => v.toFixed(1) + ' m/s');
  slider(g, 'wd', '風の向き', 0, 359, 1, () => S.env.wd, v => envSet('wd', v), v => windName(Math.max(S.env.ws, 1), v).replace(/ [0-9.]+ m\/s$/, '') + '（' + v + '°）');
  const out = document.createElement('p'); out.id = 'envOut'; g.appendChild(out);
  box.appendChild(g);
}

function syncC() {
  const sel = $('pitcherSel'); if (!sel) return;
  sel.value = S.pitcher;
  $('ovl').checked = S.overlay; $('ovlAim').value = S.overlayAim; $('ovlAim').hidden = !S.overlay;
  $('pnote2').textContent = pitcherOf(S.pitcher).note;
  document.querySelectorAll('.envhead button').forEach(b => b.classList.toggle('on', b.dataset.env === S.envId));
  const rho = PHY.env.rho;
  $('windBadge').textContent = isStdEnv() ? '' : '空気 ' + rho.toFixed(3) + ' kg/m³・' + windName(S.env.ws, S.env.wd);
  $('envOut').innerHTML = '空気の密度 <b>' + rho.toFixed(3) + ' kg/m³</b>（ふつうの ' + (rho / STD_ENV.rho * 100).toFixed(0) + '%）。' +
    '空気の抵抗・マグヌス力・縫い目の力は、どれも密度に比例します。湿った空気は、水蒸気が空気より軽いので少しだけうすくなります。';
  if (S.multi) {
    const lg = $('legend'), want = S.multi.map(m => m.id).join();
    if (lg.dataset.multi !== want) {
      lg.dataset.multi = want;
      lg.querySelectorAll('.mx').forEach(e => e.remove());
      for (const m of S.multi) { const sp = document.createElement('span'); sp.className = 'mx'; sp.innerHTML = '<i class="sw" style="background:' + m.col + '"></i>' + m.name; lg.appendChild(sp); }
    }
  } else if ($('legend').dataset.multi) { $('legend').dataset.multi = ''; $('legend').querySelectorAll('.mx').forEach(e => e.remove()); }
}
