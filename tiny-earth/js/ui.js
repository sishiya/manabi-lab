// ちいさな地球 — 操作・数字の欄（文は L(日本語, 英語)。I18N.md）
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  const RMIN = 100, RMAX = PHYS.RE, LSPAN = Math.log10(RMAX / RMIN);
  const toR = v => RMIN * Math.pow(10, v / 1000 * LSPAN);
  const toV = R => Math.round(Math.log10(R / RMIN) / LSPAN * 1000);
  const LOC = L('ja-JP', 'en-US');

  // 数の書き方
  function len(m) {
    if (!isFinite(m)) return '∞';
    const a = Math.abs(m);
    if (a >= 1000) return sig(m / 1000) + ' km';
    if (a >= 1) return sig(m) + ' m';
    if (a >= 0.01) return sig(m * 100) + ' cm';
    return sig(m * 1000) + ' mm';
  }
  function speed(v) { return v >= 1000 ? sig(v / 1000) + ' km/s' : v >= 1 ? sig(v) + ' m/s' : sig(v * 100) + ' cm/s'; }
  function dur(s) {
    if (s < 60) return sig(s) + L(' 秒', ' s');
    if (s < 3600) return sig(s / 60) + L(' 分', ' min');
    if (s < 86400 * 2) return sig(s / 3600) + L(' 時間', ' h');
    return sig(s / 86400) + L(' 日', ' days');
  }
  function sig(x) { const a = Math.abs(x); return a >= 100 ? Math.round(x).toLocaleString(LOC) : a >= 10 ? x.toFixed(1) : x.toFixed(2); }
  function ratio(x) { return x >= 1 ? sig(x) + L(' 倍', '×') : '1/' + sig(1 / x); }
  const num = n => Math.round(n).toLocaleString(LOC);

  function setSizeLabel(R) { $('sizeV').textContent = len(R); $('size').value = toV(R); $('hudR').textContent = L('半径 ', 'Radius ') + len(R); }

  function nums(O) {
    const P = O.P;
    const rows = [
      [L('重力', 'Gravity'), `${P.g < 0.01 ? P.g.toExponential(2) : sig(P.g)} m/s² <small>${L(`（地球の ${ratio(P.gRel)}）`, `(${ratio(P.gRel)} of Earth's)`)}</small>`],
      [L('脱出速度', 'Escape speed'), `${speed(P.vEsc)} <small>${L('（これより速く投げると戻ってこない）', '(throw faster than this and it never comes back)')}</small>`],
      [L('その場ジャンプ', 'Standing jump'), isFinite(P.jump) ? `${len(P.jump)} <small>${L('（地球で 50 cm の力で）', '(with the push of a 50 cm jump on Earth)')}</small>` : L(`宇宙へ飛んでいく <small>（とび出す速さ ${speed(P.v0)} ＞ 脱出速度）</small>`, `you fly off into space <small>(take-off ${speed(P.v0)} > escape speed)</small>`)],
      [L('地表すれすれを1周', 'One orbit skimming the ground'), `${dur(P.tOrbit)} <small>${L('（どの大きさでも同じ）', '(the same for every size)')}</small>`],
      [L('地平線まで', 'Distance to the horizon'), `${len(P.horizon)} <small>${L('（目の高さ 1.6 m）', '(eye height 1.6 m)')}</small>`],
      [L('いちばん高い山', 'Highest mountain'), `${len(P.mountain)} <small>${L('（エベレストを縮めると）', '(Everest, shrunk)')}</small>`],
      [L('海の平均の深さ', 'Mean sea depth'), len(P.H0)],
      [L('森の木', 'Forest trees'), `${PHYS.TREE_H} m <small>${L(`（山の ${ratio(PHYS.TREE_H / P.mountain)}。木は小さくならない）`, `(${ratio(PHYS.TREE_H / P.mountain)} the mountain; trees do not shrink)`)}</small>`],
      [L('木の数（目安）', 'Number of trees (rough)'), `${num(VIEW.st.treeReal)}${L(' 本', '')} <small>${VIEW.st.treeShown && VIEW.st.treeShown < VIEW.st.treeReal ? L(`（${num(VIEW.st.treeShown)} 本に間引いて描画）`, `(${num(VIEW.st.treeShown)} drawn)`) : VIEW.st.treeShown ? '' : L('（小さすぎて見えない）', '(too small to see)')}</small>`],
      [L('長い波（津波）の速さ', 'Speed of long waves (tsunami)'), `${speed(P.c0)} <small>${L('（√(重力×深さ)）', '(√(gravity × depth))')}</small>`],
      [L('波が星を半周する時間', 'Time for a wave to go halfway round'), `${dur(P.halfTrip)} <small>${L('（どの大きさでも同じ）', '(the same for every size)')}</small>`],
      [L('殻がないと', 'Without the shell'), L(`脱出速度は空気の分子の速さ（約 ${PHYS.V_AIR} m/s）の ${ratio(P.vEsc / PHYS.V_AIR)}`, `escape speed is ${ratio(P.vEsc / PHYS.V_AIR)} the speed of air molecules (about ${PHYS.V_AIR} m/s)`)],
    ];
    $('nums').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  }

  function live(O, TR) {
    const m = O.mesh, R2 = O.R * O.R;
    let hi = -Infinity, lo = Infinity, flood = 0, bare = 0;
    for (let i = 0; i < m.N; i++) {
      const wet = O.h[i] > O.hdry;
      if (TR.elev[i] < 0) {
        if (wet) { const e = O.z[i] + O.h[i]; if (e > hi) hi = e; if (e < lo) lo = e; } else bare += m.area[i];
      } else if (O.h[i] > 0.02 * O.P.H0) flood += m.area[i];   // 平均の深さの 2% より厚い水
    }
    const H0 = O.P.H0, area = a => { const s = a * R2; return s >= 1e6 ? sig(s / 1e6) + ' km²' : sig(s) + ' m²'; };
    const tot = 4 * Math.PI;
    $('live').innerHTML = [
      [L('星の時間', 'Planet time'), dur(O.t)],
      [L('いちばん高い海面', 'Highest sea level'), `+${len(Math.max(0, hi))} <small>${L(`（深さの ${sig(Math.max(0, hi) / H0)} 倍）`, `(${sig(Math.max(0, hi) / H0)}× the depth)`)}</small>`],
      [L('いちばん低い海面', 'Lowest sea level'), `${len(Math.min(0, lo))}`],
      [L('陸にあふれた水', 'Water spilled onto land'), `${area(flood)} <small>${L(`（星の ${sig(flood / tot * 100)}%。深さ ${len(0.02 * H0)} 以上）`, `(${sig(flood / tot * 100)}% of the planet; deeper than ${len(0.02 * H0)})`)}</small>`],
      [L('干上がった海の底', 'Dried-up sea floor'), `${area(bare)} <small>${L(`（星の ${sig(bare / tot * 100)}%）`, `(${sig(bare / tot * 100)}% of the planet)`)}</small>`],
    ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    if (!HUI.on) $('hudT').textContent = dur(O.t);   // 正直モードでは HUI が「殻を外してから」を出す
  }

  function facts(O, U) {
    const P = O.P, R = O.R, li = [];
    if (P.mountain < PHYS.TREE_H)
      li.push(L(`木（30 m）はいちばん高い山（${len(P.mountain)}）より高い。生きものは星と一緒に小さくならないので、この星でいちばん背が高いのは森。`,
        `Trees (30 m) are taller than the highest mountain (${len(P.mountain)}). Living things do not shrink with the planet, so the tallest things here are forests.`));
    else li.push(L(`この大きさなら、山（${len(P.mountain)}）は木（30 m）よりずっと高い。`, `At this size, mountains (${len(P.mountain)}) are much taller than trees (30 m).`));
    li.push(L('密度が同じなら、重力で決まる時間は大きさによらない: 地表すれすれの周回は約84分、海を波が渡るのにかかる時間も同じ。「星を押す」と、どの大きさでも同じ形で海がゆれる。',
      'With the same density, times set by gravity do not depend on size: an orbit skimming the ground takes about 84 minutes, and waves take the same time to cross the sea. A “shove” makes the sea slosh in the same way at every size.'));
    const s = PHYS.setup(R, Math.max(U, 5)) / Math.PI;   // 幅が半径くらいの海で
    li.push(L(`ちがうのは風: 風が海面を押す力は大きさで変わらないのに、水を引きもどす重力は弱く、海は浅い。風 ${Math.max(U, 5)} m/s が幅 ${len(R)} の海に吹きつづけると、風下に寄る高さは単純な見つもりで約 ${len(s)}（深さの ${sig(s / P.H0)} 倍）。小さい星ほど半径の2乗に反比例して大きくなる。実際はコリオリ力でまがり、陸にあふれるので、もっと低くなる。`,
      `What differs is wind: the wind pushes the sea just as hard, but the gravity pulling the water back is weak and the sea is shallow. If a ${Math.max(U, 5)} m/s wind keeps blowing across a sea ${len(R)} wide, a simple estimate says the water piles up about ${len(s)} downwind (${sig(s / P.H0)}× the depth). This grows as 1/radius² on smaller planets. In reality the Coriolis force turns the flow and water spills onto land, so it stays lower.`));
    if (!isFinite(P.jump)) li.push(L(`ジャンプすると宇宙へ飛んでいく（脱出速度 ${speed(P.vEsc)}）。歩くのも、そっと。`, `Jump and you fly off into space (escape speed ${speed(P.vEsc)}). Even walking must be gentle.`));
    $('facts').innerHTML = li.map(t => `<li>${t}</li>`).join('');
  }

  function init(h) {
    // 英語のとき: data-en のある部品（ボタン・選択肢）の文を入れかえる
    if (LANG === 'en') for (const el of document.querySelectorAll('[data-en]')) el.textContent = el.dataset.en;
    $('speed').setAttribute('aria-label', L('時間の速さ', 'Time speed'));
    $('closeSpeed').setAttribute('aria-label', L('そばで見るときの時間の速さ', 'Time speed when looking up close'));
    $('play').textContent = L('一時停止', 'Pause');
    $('size').addEventListener('input', () => h.setR(toR(+$('size').value), true));
    $('size').addEventListener('change', () => h.setR(toR(+$('size').value), false));
    $('presets').addEventListener('click', e => { const r = e.target.dataset && e.target.dataset.r; if (r) h.setR(+r, false); });
    $('play').addEventListener('click', () => { const p = h.togglePlay(); $('play').textContent = p ? L('一時停止', 'Pause') : L('再生', 'Play'); });
    $('speed').addEventListener('change', () => h.setSpeed(+$('speed').value));
    $('reset').addEventListener('click', () => h.resetOcean());
    $('wind').addEventListener('input', () => { $('windV').textContent = $('wind').value + ' m/s'; h.setWind(+$('wind').value); });
    $('windDir').addEventListener('click', () => h.windDir());
    $('shake').addEventListener('click', () => h.shake());
    $('dropC').addEventListener('click', () => h.dropCenter());
    // 高さの強調: スライダー 0〜300 → ×1〜×1000（対数）。ドラッグ中は1コマに1回だけ作りなおす
    let exPend = 0;
    $('ex').addEventListener('input', () => {
      const ex = Math.round(Math.pow(10, +$('ex').value / 100)); $('exV').textContent = '×' + ex;
      if (!exPend) exPend = requestAnimationFrame(() => { exPend = 0; h.setEx(Math.round(Math.pow(10, +$('ex').value / 100))); });
    });
    $('lightBtns').addEventListener('click', e => {
      const v = e.target.dataset && e.target.dataset.l; if (!v) return;
      for (const b of $('lightBtns').querySelectorAll('button')) b.classList.toggle('on', b === e.target);
      VIEW.st.light = v;
    });
  }
  // 生きものの欄。hon（正直モードの結果）があればそちらの数を出す
  function life(Lf, hon) {
    if (!Lf.counts) return;
    $('lifeNums').innerHTML = LIFE.SP.map((sp, s) => {
      const c = Lf.counts[s], alive = hon ? hon.sum[s].alive : c.alive, cause = hon ? hon.sum[s].cause : c.cause;
      const cs = Object.entries(cause).map(([k, v]) => `${k} ${v}`).join(L('・', ', '));
      const none = c.total === 0 ? `<small>${L('（この星には住める所がない）', '(nowhere to live on this planet)')}</small>` : '';
      return `<dt>${sp.name}</dt><dd>${alive} / ${c.total} ${none}${cs ? `<small>${L(`（${cs}）`, `(${cs})`)}</small>` : ''}</dd>`;
    }).join('');
    $('lifeLog').innerHTML = Lf.log.length ? Lf.log.map(([t, m]) => `<li>${dur(t)}: ${m}</li>`).join('') : `<li>${L('（まだない）', '(none yet)')}</li>`;
  }
  function lifePhys(Lf) {
    const P = Lf.O.P, deer = LIFE.SP[0], rab = LIFE.SP[1], li = [];
    const vw = LIFE.walkSpeed(Lf, deer);
    li.push(L(`シカの歩く速さ: ${speed(vw)}`, `A deer can walk at: ${speed(vw)}`) + (vw < deer.vE ? L(`（地球で ${deer.vE} m/s。これより速く歩こうとすると足が地面からはなれる。フルード数 0.5）`, ` (${deer.vE} m/s on Earth; walk faster and its feet leave the ground — Froude number 0.5)`) : ''));
    const pv = LIFE.preview(Lf, rab);
    li.push(L(`ウサギが地球と同じ速さ（${rab.jump} m/s）で跳ぶと: いちばん高くて ${len(pv.maxY)}${pv.shell ? '（殻にぶつかる）' : ''}、降りてくるまで ${dur(pv.time)}${pv.maxY > 5 ? '。空気の抵抗でふわふわ浮く' : ''}。空気がなければ ${isFinite(pv.noAir) ? len(pv.noAir) + ' まで上がる' : '脱出速度をこえて宇宙へ'}`,
      `If a rabbit hops as fast as on Earth (${rab.jump} m/s): it rises up to ${len(pv.maxY)}${pv.shell ? ' (hitting the shell)' : ''} and takes ${dur(pv.time)} to come down${pv.maxY > 5 ? ', floating on air drag' : ''}. Without air it would ${isFinite(pv.noAir) ? 'rise to ' + len(pv.noAir) : 'pass the escape speed and leave for space'}`));
    let a1 = 0, a2 = 0, ao = 0; const m = Lf.M;
    for (let i = 0; i < m.N; i++) if (Lf.TR.elev[i] < 0) { ao += m.area[i]; if (Lf.O.h[i] >= 0.1) a1 += m.area[i]; if (Lf.O.h[i] >= 1.0) a2 += m.area[i]; }
    li.push(L(`泳げる海: 小魚（深さ 10 cm 以上）${sig(a1 / ao * 100)}%、大きな魚（深さ 1 m 以上）${sig(a2 / ao * 100)}%（海の平均の深さ ${len(P.H0)}）`,
      `Sea deep enough to swim in: small fish (10 cm or more) ${sig(a1 / ao * 100)}%, large fish (1 m or more) ${sig(a2 / ao * 100)}% (mean sea depth ${len(P.H0)})`));
    $('lifePhys').innerHTML = li.map(t => `<li>${t}</li>`).join('');
  }
  // 森の欄
  function forest(O, U) {
    const f = FOREST.facts(O.P, U), H = FOREST.st.H, li = [];
    li.push(L(`幹の太さ 60 cm の木が自分の重さで曲がらない高さ: ${len(f.hb)}（地球では ${len(f.hbE)}。重力の 1/3 乗に反比例）${H > f.hb ? ` → いまの ${len(H)} はこえているので曲がる` : ''}`,
      `Height a tree with a 60 cm trunk can reach before bending under its own weight: ${len(f.hb)} (${len(f.hbE)} on Earth; it grows as gravity^(−1/3))${H > f.hb ? ` → the current ${len(H)} is taller, so the trees bend` : ''}`));
    li.push(L(`水を高い所へ持ち上げるのに重力のぶんで要る力: 1 m あたり ${f.pw < 1e-4 ? f.pw.toExponential(1) : f.pw.toPrecision(2)} MPa（地球 ${f.pwE.toFixed(4)} MPa）。地球の木の高さの限界 122〜130 m はこれと管の摩擦で決まる。重力のぶんはほとんどなくなるが、摩擦のぶんは残る（どこまで高くなれるかは測られていない）`,
      `Pressure needed to lift water against gravity: ${f.pw < 1e-4 ? f.pw.toExponential(1) : f.pw.toPrecision(2)} MPa per meter (${f.pwE.toFixed(4)} MPa on Earth). On Earth, the 122–130 m limit to tree height is set by this plus friction in the water pipes. The gravity part almost disappears, but friction remains (how tall trees could grow has not been measured)`));
    li.push(L(`葉が落ちる速さ: ${speed(f.v)}（地球 ${speed(f.vE)}）。高さ ${len(H)} から地面まで ${dur(f.tf)}${U > 0 ? `。そのあいだに風 ${U} m/s で ${len(f.drift)} 運ばれる${f.drift > Math.PI * O.R ? '（星を半周より遠く）' : ''}` : ''}`,
      `Falling speed of leaves: ${speed(f.v)} (${speed(f.vE)} on Earth). From ${len(H)} up it takes ${dur(f.tf)} to reach the ground${U > 0 ? `, and a ${U} m/s wind carries it ${len(f.drift)}${f.drift > Math.PI * O.R ? ' (farther than halfway round the planet)' : ''}` : ''}`));
    li.push(L('風で木がゆれる大きさ: 風の力も木の硬さも重力と関係ないので、地球とほとんど同じ', 'How much trees sway in the wind: wind force and wood stiffness do not depend on gravity, so almost as on Earth'));
    $('forestNums').innerHTML = li.map(t => `<li>${t}</li>`).join('');
  }
  function close(O) {
    const f = CLOSE.facts(), li = [], w = f.weight < 1000 ? sig(f.weight) + ' g' : sig(f.weight / 1000) + ' kg';
    li.push(L(`体重 70 kg の人が感じる重さ: ${w}（地球の ${ratio(O.P.gRel)}）`, `A 70 kg person feels as heavy as: ${w} (${ratio(O.P.gRel)} of Earth)`));
    li.push(L(`地平線まで ${len(f.horizon)}。歩ける速さは ${speed(f.walk)} まで（それより速いと足が地面からはなれる）`, `Horizon: ${len(f.horizon)} away. You can walk at up to ${speed(f.walk)} (faster and your feet leave the ground)`));
    li.push(L(`ジャンプ（地球で 50 cm の力）: ${len(f.jumpY)} まで上がり${f.jumpShell ? '（殻にぶつかる）' : ''}、降りてくるまで ${dur(f.jumpT)}。空気がなければ ${isFinite(f.jumpNoAir) ? len(f.jumpNoAir) + ' まで' : '宇宙へ飛んでいく'}`,
      `Jump (a 50 cm push on Earth): you rise to ${len(f.jumpY)}${f.jumpShell ? ' (hitting the shell)' : ''} and take ${dur(f.jumpT)} to come down. Without air you would ${isFinite(f.jumpNoAir) ? 'rise to ' + len(f.jumpNoAir) : 'fly off into space'}`));
    li.push(L(`しぶき（直径 3 mm）の落ちる速さ: ${speed(f.vDrop)}（地球 ${speed(f.vDropE)}）。霧のように漂う`, `Falling speed of a 3 mm splash drop: ${speed(f.vDrop)} (${speed(f.vDropE)} on Earth). It drifts like mist`));
    li.push(L(`雨つぶの大きさの上限: 直径 ${len(f.dRain)}（地球 6 mm）。落ちる速さ ${speed(f.vRain)}（地球の 6 mm のつぶ ${speed(f.vRainE)}）、${len(Math.min(0.24 * O.R, 240))} の高さから ${dur(f.fallT)}`,
      `Largest raindrop: ${len(f.dRain)} across (6 mm on Earth). It falls at ${speed(f.vRain)} (a 6 mm drop on Earth: ${speed(f.vRainE)}), taking ${dur(f.fallT)} from ${len(Math.min(0.24 * O.R, 240))} up`));
    $('closeNums').innerHTML = li.map(t => `<li>${t}</li>`).join('');
  }
  return { close, forest, life, lifePhys, init, nums, live, facts, setSizeLabel, len, speed, dur, sig, num, $ };
})();
