// ちいさな地球 — 正直モードの画面（殻を外す・時間のスライダー・いまの様子・出来事）
'use strict';
const HUI = (() => {
  const $ = id => document.getElementById(id);
  const H = { on: false, model: null, v: 0, t: 0, playing: true, h0: null, lastText: 0, busy: false };
  let ctx = null, vs = null;   // ctx: { mesh, ocean, terrain }、vs: VIEW.st.honest に渡す配列

  const tOf = v => v <= 0 ? 0 : Math.pow(10, -1 + v / 1000 * (Math.log10(H.model.tEnd) + 1));   // 0.1 秒〜終わり（対数）
  const vOf = t => t <= 0 ? 0 : Math.max(0, Math.min(1000, (Math.log10(t) + 1) / (Math.log10(H.model.tEnd) + 1) * 1000));
  function when(s) {
    if (s < 60) return (s < 10 ? s.toFixed(1) : Math.round(s)) + L(' 秒', ' s');
    if (s < 3600) return (s / 60).toFixed(s < 600 ? 1 : 0) + L(' 分', ' min');
    if (s < 86400 * 2) return (s / 3600).toFixed(1) + L(' 時間', ' h');
    if (s < 86400 * 365.25 * 2) return Math.round(s / 86400) + L(' 日', ' days');
    const y = s / (86400 * 365.25);
    return y < 1e4 ? Math.round(y).toLocaleString(L('ja-JP', 'en-US')) + L(' 年', ' years') : y < 1e8 ? L(Math.round(y / 1e4).toLocaleString('ja-JP') + ' 万年', Math.round(y / 1e4) * 10 + ' thousand years') : L('1億年より先', 'beyond 100 million years');
  }

  function init(c) {
    ctx = c;
    const N = c.mesh.N;
    vs = { liq: new Float32Array(N), ice: new Float32Array(N), boil: new Uint8Array(N), flux: new Float32Array(N), airM: 1, brown: 0, removed: false };
    $('shellBtn').addEventListener('click', () => (H.on ? off() : on()));
    off();   // ボタンと説明の最初の文
    $('ht').addEventListener('input', () => { H.v = +$('ht').value; apply(); });
    $('hPlay').addEventListener('click', () => {
      if (!H.playing && H.v >= 1000) H.v = 0;
      H.playing = !H.playing; $('hPlay').textContent = H.playing ? L('一時停止', 'Pause') : L('進める', 'Play');
    });
    $('hEv').addEventListener('click', e => { const li = e.target.closest('li'); if (li && li.dataset.t) { H.v = vOf(+li.dataset.t); apply(); } });
  }
  function on() {
    if (CLOSE.on) document.getElementById('closeBtn').click();   // そばで見るのをやめてから
    H.on = true; H.v = 0; H.playing = true;
    $('shellBtn').textContent = L('殻をもどす（ふだんの計算へ）', 'Put the shell back (normal calculation)');
    $('hPlay').textContent = L('一時停止', 'Pause');
    rebuild();
  }
  function off() {
    H.on = false; VIEW.st.honest = null; clearTimeout(H.timer); H.busy = false;
    $('thermo').hidden = true;
    $('hBox').hidden = true;
    $('shellBtn').textContent = L('殻を外す（正直モード）', 'Remove the shell (honest mode)');
    $('hNote').textContent = L('殻を外すと、空気・海・森がこの大きさの星で本当はどうなるかを、時間を追って見られます。', 'Remove the shell to watch, over time, what would really happen to the air, the sea and the forests on a planet this size.');
  }
  // 大きさが変わったとき・殻を外したとき: この星の時間の流れを計算しなおす
  function rebuild() {
    if (!H.on) return;
    H.busy = true; $('hNote').textContent = L('計算中…', 'Calculating…');
    clearTimeout(H.timer);   // 大きさをドラッグ中は、止まってからまとめて計算する
    H.timer = setTimeout(() => {
      const O = ctx.ocean;
      H.h0 = Float64Array.from(O.h);
      H.model = HONEST.build(O.R, O.P, O.P.H0);
      H.busy = false;
      VIEW.st.honest = vs;
      $('hBox').hidden = false; $('thermo').hidden = false;
      events(); explain(); apply();
    }, 120);
  }
  function explain() {
    const A = H.model.A, lam = A.lam;
    const yr = s => when(s);
    const lv = lam < 0.01 ? lam.toExponential(1) : lam.toFixed(lam < 10 ? 2 : 0);
    let t = L(`空気をつなぎとめる強さ λ（重力 ÷ 分子の熱の動き）= ${lv}。`, `How strongly gravity holds the air, λ (gravity ÷ the heat motion of molecules) = ${lv}.`);
    if (A.mode === 'blowoff') t += L(' 2 より小さいので、空気は重力ではつなぎとめられず、殻を外すとそのまま宇宙へ広がっていく（1次元の流体の計算）。', ' It is below 2, so gravity cannot hold the air: remove the shell and it spreads straight out into space (one-dimensional fluid calculation).');
    else if (A.mode === 'parker') t += L(` 空気は星にとどまるが、上空から少しずつ流れ出る（Parker の流れの見つもり。半分以下になる目安 ${yr(A.tauEsc * Math.LN2)}）。`, ` The air stays, but slowly flows away from high up (Parker-flow estimate; roughly halves in ${yr(A.tauEsc * Math.LN2)}).`);
    else t += A.tauEsc > 3e15 ? L(' 空気は重力でしっかりつなぎとめられ、殻がなくても残る（Jeans 逃散の見つもりでは、宇宙の年齢よりずっと長くもつ）。', ' Gravity holds the air firmly; it stays even without the shell (by the Jeans-escape estimate it lasts far longer than the age of the universe).') : L(` 空気は残り、分子がゆっくり逃げる（Jeans 逃散の見つもり。半分になる目安 ${yr(A.tauEsc * Math.LN2)}）。`, ` The air stays and molecules slowly escape (Jeans-escape estimate; halves in about ${yr(A.tauEsc * Math.LN2)}).`);
    $('hNote').textContent = t + L(' 時間のスライダーは対数（右へ行くほど速く進む）。右の端は、計算している出来事が出つくした時刻の3倍。その先は、空気も水もなく、この計算では変化がない。', ' The time slider is logarithmic (it runs faster toward the right). The right end is three times the last calculated event; after that there is no air or water and nothing more changes in this calculation.');
  }
  function events() {
    const ev = H.model.ev.slice();
    // 生きものの出来事（体温の水の蒸気圧 約 6.3 kPa を下回る時刻から）
    const pArm = HONEST.pLiq(310.15) / HONEST.P0;
    const tArm = H.model.tGrid.find(x => HONEST.airAt(H.model.A, x).p < pArm);
    if (tArm != null) {
      const kp = (HONEST.pLiq(310.15) / 1000).toFixed(1);
      ev.push([tArm, L(`気圧が体温の水の蒸気圧（${kp} kPa）を下回る: 生きものの体の水が沸きはじめる`, `Pressure falls below the vapor pressure of water at body temperature (${kp} kPa): water in animals' bodies starts to boil`)]);
      ev.push([tArm + 10, L('陸の生きものが意識を失う（犬の実験で 9〜12 秒）', 'Land animals lose consciousness (9–12 s in experiments with dogs)')]);
      ev.push([tArm + 150, L('陸の生きものが死ぬ（推定 約 2.5 分。犬は 2 分より短ければ生きのびた）', 'Land animals die (estimate: about 2.5 min; dogs exposed for under 2 min survived)')]);
    }
    const A = H.model.A;
    if (A.u30t && A.u30 > ctx.ocean.P.vEsc) ev.push([A.u30t, L(`空気が抜ける風（地上 30 m で 最大 ${Math.round(A.u30)} m/s）: 浮いていた・飛んでいた生きものは宇宙へ飛ばされる`, `Wind of the escaping air (up to ${Math.round(A.u30)} m/s at 30 m): animals that were floating or flying are blown into space`)]);
    $('hEv').innerHTML = ev.length ? ev.slice().sort((a, b) => a[0] - b[0]).map(([t, s]) => `<li data-t="${t}"><b>${when(t)}</b>${s}</li>`).join('')
      : `<li>${L('この大きさでは、殻を外しても大きな変化はない（空気がとどまるので、海も沸かない）。', 'At this size nothing big changes when the shell is removed (the air stays, so the sea does not boil).')}</li>`;
  }

  // 時刻 t の様子をつくる
  function apply() {
    if (!H.model) return;
    const t = H.t = tOf(H.v), m = ctx.mesh, Mo = H.model;
    $('ht').value = Math.round(H.v);
    $('htV').textContent = t <= 0 ? L('0 秒（まだ殻がある）', '0 s (the shell is still there)') : when(t);
    $('hudT').textContent = t <= 0 ? L('殻を外す前', 'Before removing the shell') : L('殻を外して ', 'Shell removed ') + when(t);
    const air = HONEST.airAt(Mo.A, t);
    vs.removed = t > 0; vs.airM = air.m; vs.airP = air.p;
    let wl = 0, wi = 0, w0 = 0, Tsum = 0, Tn = 0, Ssum = 0, Sn = 0, Fsum = 0, Bn = 0;
    for (let i = 0; i < m.N; i++) {
      const d = H.h0[i];
      if (d <= 0) { vs.liq[i] = 0; vs.ice[i] = 0; vs.boil[i] = 0; vs.flux[i] = 0; continue; }
      const c = HONEST.colAt(Mo, d, t);
      vs.liq[i] = c[0]; vs.ice[i] = c[1]; vs.boil[i] = c[2];
      const a = m.area[i]; w0 += d * a; wl += c[0] * a; wi += c[1] * a;
      if (c[1] > 0 && !c[2]) { Tsum += c[3] * a; Tn += a; }
      if (c[0] + c[1] > 0) {   // 水か氷が残っているマス: 表面の温度と蒸発の速さ
        const f = vs.flux[i] = HONEST.flux(c);
        Ssum += c[3] * a; Sn += a; Fsum += f * a; if (c[2]) Bn += a;
      } else vs.flux[i] = 0;
    }
    // 生きもの: 殻を外す前（ふだん）の様子から、この時刻にどうなっているか
    H.lifeHon = ctx.life && ctx.life.counts ? LIFE.honest(ctx.life, Mo, t) : null;
    // 森が枯れていく見た目: 気圧が水の蒸気圧を下回ってから、時刻が 100 倍になるまでに色を変える（速さは見た目だけ）
    const tb = (Mo.ev.find(e => e[2] === 'boil') || [])[0];
    vs.brown = tb && t > tb ? Math.min(1, Math.log10(t / tb) / 2) : 0;
    const now = performance.now();
    if (now - H.lastText > 200) {
      H.lastText = now;
      const pct = x => (x * 100 < 0.1 && x > 0 ? L('0.1 未満', 'under 0.1') : (x * 100).toFixed(x < 0.1 ? 1 : 0)) + '%';
      const pa = air.p * HONEST.P0;
      $('hNow').innerHTML = [
        [L('地面の気圧', 'Ground pressure'), `${pa >= 100 ? Math.round(pa).toLocaleString(L('ja-JP', 'en-US')) : pa >= 0.01 ? pa.toPrecision(2) : pa.toExponential(1)} Pa <small>${L(`（1気圧の ${pct(air.p)}）`, `(${pct(air.p)} of 1 atm)`)}</small>`],
        [L('星のまわりの空気', 'Air around the planet'), pct(Math.min(1, air.m))],
        [L('海の水（液体）', 'Sea water (liquid)'), pct(wl / w0)],
        [L('氷', 'Ice'), pct(wi / w0)],
        [L('蒸発・昇華した水', 'Water evaporated or sublimated'), `${pct(Math.max(0, 1 - (wl + wi) / w0))} <small>${H.model.A.lam < 2 ? L('（重力が弱く、宇宙へ逃げる）', '(gravity is weak, so it escapes to space)') : L('（宇宙へ逃げるか、星の冷たい所で凍りなおす。ここでは消えたとして計算）', '(it escapes to space or freezes again somewhere cold; here it is treated as gone)')}</small>`],
        [L('氷の表面の温度', 'Ice surface temperature'), Tn > 0 ? `${Math.round(Tsum / Tn - 273.15)} ℃ <small>${L('（一日・緯度でならした値）', '(averaged over day and latitude)')}</small>` : '—'],
        [L('森', 'Forest'), vs.brown <= 0 ? L('生きている', 'alive') : vs.brown < 1 ? L('葉の水が抜けて枯れていく', 'water leaves the leaves and the trees are dying') : L('枯れて、凍って乾いたまま立っている <small>（くさらせる微生物も酸素もないので、長く残ると考えられる。紫外線などで表面が削られるのは計算していない）</small>', 'dead, standing frozen and dried out <small>(with no microbes or oxygen to rot them, they would likely last a long time; wear from ultraviolet light etc. is not calculated)</small>')],
      ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
      for (const li of $('hEv').children) li.classList.toggle('past', !!li.dataset.t && +li.dataset.t <= t);
      thermo(t, air, Sn > 0 ? Ssum / Sn : null, Sn > 0 ? Fsum / Sn : 0, Sn > 0 ? Bn / Sn : 0, w0 > 0 ? (wl + wi) / w0 : 0);
    }
  }
  // 温度計（目盛り −120〜+30℃）・蒸発の速さ・いま起きていること
  function thermo(t, air, Tsea, F, fBoil, left) {
    const set = (id, T) => {
      const el = $(id), v = $(id + 'V');
      if (T == null) { el.style.height = '0'; v.textContent = '—'; return; }
      const c = T - 273.15;
      el.style.height = Math.max(0, Math.min(100, (c + 120) / 150 * 100)) + '%';
      el.classList.toggle('cold', c < 0);
      v.textContent = Math.round(c) + '℃';
    };
    const airThere = air.p > 1e-4;
    set('thSea', Tsea); set('thAir', airThere ? air.T : null);
    // 蒸発の速さ: 表面 1 m² から 1 日に何 mm の水が消えるか
    const mmDay = F / 1000 * 86400 * 1000;
    $('vapK').textContent = fBoil > 0.5 ? L('蒸発（沸騰）', 'Evaporation (boiling)') : F > 0 ? L('昇華（氷→水蒸気）', 'Sublimation (ice → vapor)') : L('蒸発', 'Evaporation');
    $('vapV').textContent = F <= 0 ? L('なし', 'none') : (mmDay >= 100 ? Math.round(mmDay / 10) / 100 + ' m' : mmDay >= 1 ? mmDay.toPrecision(2) + ' mm' : (mmDay * 1000).toPrecision(2) + ' μm') + L('/日', '/day');
    let msg;
    if (t <= 0) msg = L('殻の中: 1気圧・15℃。', 'Inside the shell: 1 atm, 15 °C.');
    else if (left <= 1e-3) msg = L('海はなくなった。空気も水もない星。枯れた木は立ったまま残る（くさらせる微生物も酸素もない）。', 'The sea is gone: a planet with no air and no water. The dead trees stay standing (no microbes or oxygen to rot them).');
    else if (fBoil > 0.5 && Tsea > 273.2) msg = L('海が沸騰。蒸発が熱をうばい、水が冷えていく。', 'The sea is boiling. Evaporation takes heat away and the water cools.');
    else if (fBoil > 0.5) msg = L('0℃ で沸きながら凍っていく。', 'Boiling and freezing at 0 °C.');
    else if (F > 0) msg = L('氷の表面から水蒸気が出ていく（昇華）。日光と、熱の放射・昇華がつりあう温度。', 'Vapor leaves the ice surface (sublimation). Its temperature balances sunlight against heat radiation and sublimation.');
    else if (airThere && air.p < 0.9) msg = L('空気が宇宙へ広がっていく。広がる空気は冷える（断熱膨張）。', 'The air spreads into space. Expanding air cools down (adiabatic expansion).');
    else msg = L('空気が残っている。海は沸かない。', 'The air remains. The sea does not boil.');
    $('thMsg').textContent = msg;
  }
  function step(realDt) {
    if (!H.on || !H.model || H.busy) return;
    if (H.playing) { H.v = Math.min(1000, H.v + realDt * 1000 / 45); if (H.v >= 1000) { H.playing = false; $('hPlay').textContent = L('進める', 'Play'); } }
    apply();
  }
  return { init, step, rebuild, H, get on() { return H.on; }, setT(t) { H.v = vOf(t); apply(); } };
})();
