// ちいさな地球 — 操作・数字の欄
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  const RMIN = 100, RMAX = PHYS.RE, LSPAN = Math.log10(RMAX / RMIN);
  const toR = v => RMIN * Math.pow(10, v / 1000 * LSPAN);
  const toV = R => Math.round(Math.log10(R / RMIN) / LSPAN * 1000);

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
    if (s < 60) return sig(s) + ' 秒';
    if (s < 3600) return sig(s / 60) + ' 分';
    if (s < 86400 * 2) return sig(s / 3600) + ' 時間';
    return sig(s / 86400) + ' 日';
  }
  function sig(x) { const a = Math.abs(x); return a >= 100 ? Math.round(x).toLocaleString('ja-JP') : a >= 10 ? x.toFixed(1) : x.toFixed(2); }
  function ratio(x) { return x >= 1 ? sig(x) + ' 倍' : '1/' + sig(1 / x); }

  function setSizeLabel(R) { $('sizeV').textContent = len(R); $('size').value = toV(R); $('hudR').textContent = '半径 ' + len(R); }

  function nums(O) {
    const P = O.P, R = O.R;
    const rows = [
      ['重力', `${P.g < 0.01 ? P.g.toExponential(2) : sig(P.g)} m/s² <small>（地球の ${ratio(P.gRel)}）</small>`],
      ['脱出速度', `${speed(P.vEsc)} <small>（これより速く投げると戻ってこない）</small>`],
      ['その場ジャンプ', isFinite(P.jump) ? `${len(P.jump)} <small>（地球で 50 cm の力で）</small>` : `宇宙へ飛んでいく <small>（とび出す速さ ${speed(P.v0)} ＞ 脱出速度）</small>`],
      ['地表すれすれを1周', `${dur(P.tOrbit)} <small>（どの大きさでも同じ）</small>`],
      ['地平線まで', `${len(P.horizon)} <small>（目の高さ 1.6 m）</small>`],
      ['いちばん高い山', `${len(P.mountain)} <small>（エベレストを縮めると）</small>`],
      ['海の平均の深さ', len(P.H0)],
      ['森の木', `${PHYS.TREE_H} m <small>（山の ${ratio(PHYS.TREE_H / P.mountain)}。木は小さくならない）</small>`],
      ['木の数（目安）', `${Math.round(VIEW.st.treeReal).toLocaleString('ja-JP')} 本 <small>${VIEW.st.treeShown && VIEW.st.treeShown < VIEW.st.treeReal ? `（${VIEW.st.treeShown.toLocaleString('ja-JP')} 本に間引いて描画）` : VIEW.st.treeShown ? '' : '（小さすぎて見えない）'}</small>`],
      ['長い波（津波）の速さ', `${speed(P.c0)} <small>（√(重力×深さ)）</small>`],
      ['波が星を半周する時間', `${dur(P.halfTrip)} <small>（どの大きさでも同じ）</small>`],
      ['殻がないと', `脱出速度は空気の分子の速さ（約 ${PHYS.V_AIR} m/s）の ${ratio(P.vEsc / PHYS.V_AIR)}`],
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
      ['星の時間', dur(O.t)],
      ['いちばん高い海面', `+${len(Math.max(0, hi))} <small>（深さの ${sig(Math.max(0, hi) / H0)} 倍）</small>`],
      ['いちばん低い海面', `${len(Math.min(0, lo))}`],
      ['陸にあふれた水', `${area(flood)} <small>（星の ${sig(flood / tot * 100)}%。深さ ${len(0.02 * H0)} 以上）</small>`],
      ['干上がった海の底', `${area(bare)} <small>（星の ${sig(bare / tot * 100)}%）</small>`],
    ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    if (!HUI.on) $('hudT').textContent = dur(O.t);   // 正直モードでは HUI が「殻を外してから」を出す
  }

  function facts(O, U) {
    const P = O.P, R = O.R, li = [];
    if (P.mountain < PHYS.TREE_H)
      li.push(`木（30 m）はいちばん高い山（${len(P.mountain)}）より高い。生きものは星と一緒に小さくならないので、この星でいちばん背が高いのは森。`);
    else li.push(`この大きさなら、山（${len(P.mountain)}）は木（30 m）よりずっと高い。`);
    li.push('密度が同じなら、重力で決まる時間は大きさによらない: 地表すれすれの周回は約84分、海を波が渡るのにかかる時間も同じ。「星を押す」と、どの大きさでも同じ形で海がゆれる。');
    const s = PHYS.setup(R, Math.max(U, 5)) / Math.PI;   // 幅が半径くらいの海で
    li.push(`ちがうのは風: 風が海面を押す力は大きさで変わらないのに、水を引きもどす重力は弱く、海は浅い。風 ${Math.max(U, 5)} m/s が幅 ${len(R)} の海に吹きつづけると、風下に寄る高さは単純な見つもりで約 ${len(s)}（深さの ${sig(s / P.H0)} 倍）。小さい星ほど半径の2乗に反比例して大きくなる。実際はコリオリ力でまがり、陸にあふれるので、もっと低くなる。`);
    if (!isFinite(P.jump)) li.push(`ジャンプすると宇宙へ飛んでいく（脱出速度 ${speed(P.vEsc)}）。歩くのも、そっと。`);
    $('facts').innerHTML = li.map(t => `<li>${t}</li>`).join('');
  }

  function init(h) {
    $('size').addEventListener('input', () => h.setR(toR(+$('size').value), true));
    $('size').addEventListener('change', () => h.setR(toR(+$('size').value), false));
    $('presets').addEventListener('click', e => { const r = e.target.dataset && e.target.dataset.r; if (r) h.setR(+r, false); });
    $('play').addEventListener('click', () => { const p = h.togglePlay(); $('play').textContent = p ? '一時停止' : '再生'; });
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
    $('styleBtns').addEventListener('click', e => {
      const v = e.target.dataset && e.target.dataset.s; if (!v) return;
      for (const b of $('styleBtns').children) b.classList.toggle('on', b === e.target);
      h.setStyle(v);
    });
    $('lightBtns').addEventListener('click', e => {
      const v = e.target.dataset && e.target.dataset.l; if (!v) return;
      for (const b of $('lightBtns').querySelectorAll('button')) b.classList.toggle('on', b === e.target);
      VIEW.st.light = v;
    });
  }
  // 生きものの欄。hon（正直モードの結果）があればそちらの数を出す
  function life(L, hon) {
    if (!L.counts) return;
    $('lifeNums').innerHTML = LIFE.SP.map((sp, s) => {
      const c = L.counts[s], alive = hon ? hon.sum[s].alive : c.alive, cause = hon ? hon.sum[s].cause : c.cause;
      const cs = Object.entries(cause).map(([k, v]) => `${k} ${v}`).join('・');
      const none = c.total === 0 ? '<small>（この星には住める所がない）</small>' : '';
      return `<dt>${sp.name}</dt><dd>${alive} / ${c.total} ${none}${cs ? `<small>（${cs}）</small>` : ''}</dd>`;
    }).join('');
    $('lifeLog').innerHTML = L.log.length ? L.log.map(([t, m]) => `<li>${dur(t)}: ${m}</li>`).join('') : '<li>（まだない）</li>';
  }
  function lifePhys(L) {
    const P = L.O.P, R = L.O.R, deer = LIFE.SP[0], rab = LIFE.SP[1], li = [];
    const vw = LIFE.walkSpeed(L, deer);
    li.push(`シカの歩く速さ: ${speed(vw)}${vw < deer.vE ? `（地球で ${deer.vE} m/s。これより速く歩こうとすると足が地面からはなれる。フルード数 0.5）` : ''}`);
    const pv = LIFE.preview(L, rab);
    li.push(`ウサギが地球と同じ速さ（${rab.jump} m/s）で跳ぶと: いちばん高くて ${len(pv.maxY)}${pv.shell ? '（殻にぶつかる）' : ''}、降りてくるまで ${dur(pv.time)}${pv.maxY > 5 ? '。空気の抵抗でふわふわ浮く' : ''}。空気がなければ ${isFinite(pv.noAir) ? len(pv.noAir) + ' まで上がる' : '脱出速度をこえて宇宙へ'}`);
    let a1 = 0, a2 = 0, ao = 0; const m = L.M;
    for (let i = 0; i < m.N; i++) if (L.TR.elev[i] < 0) { ao += m.area[i]; if (L.O.h[i] >= 0.1) a1 += m.area[i]; if (L.O.h[i] >= 1.0) a2 += m.area[i]; }
    li.push(`泳げる海: 小魚（深さ 10 cm 以上）${sig(a1 / ao * 100)}%、大きな魚（深さ 1 m 以上）${sig(a2 / ao * 100)}%（海の平均の深さ ${len(P.H0)}）`);
    $('lifePhys').innerHTML = li.map(t => `<li>${t}</li>`).join('');
  }
  // 森の欄
  function forest(O, U) {
    const f = FOREST.facts(O.P, U), H = FOREST.st.H, li = [];
    li.push(`幹の太さ 60 cm の木が自分の重さで曲がらない高さ: ${len(f.hb)}（地球では ${len(f.hbE)}。重力の 1/3 乗に反比例）${H > f.hb ? ` → いまの ${len(H)} はこえているので曲がる` : ''}`);
    li.push(`水を高い所へ持ち上げるのに重力のぶんで要る力: 1 m あたり ${f.pw < 1e-4 ? f.pw.toExponential(1) : f.pw.toPrecision(2)} MPa（地球 ${f.pwE.toFixed(4)} MPa）。地球の木の高さの限界 122〜130 m はこれと管の摩擦で決まる。重力のぶんはほとんどなくなるが、摩擦のぶんは残る（どこまで高くなれるかは測られていない）`);
    li.push(`葉が落ちる速さ: ${speed(f.v)}（地球 ${speed(f.vE)}）。高さ ${len(H)} から地面まで ${dur(f.tf)}${U > 0 ? `。そのあいだに風 ${U} m/s で ${len(f.drift)} 運ばれる${f.drift > Math.PI * O.R ? '（星を半周より遠く）' : ''}` : ''}`);
    li.push('風で木がゆれる大きさ: 風の力も木の硬さも重力と関係ないので、地球とほとんど同じ');
    $('forestNums').innerHTML = li.map(t => `<li>${t}</li>`).join('');
  }
  return { forest, life, lifePhys, init, nums, live, facts, setSizeLabel, len, speed, dur, sig, $ };
})();
