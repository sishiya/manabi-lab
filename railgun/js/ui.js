// レールガンのしくみ — 「やってみて」の案内・操作・結果・さわったときの説明
// 見る人が自分で箱をタップして電気を送る（計算はその場で進む）。案内は4段、図の上のつぎへ1つ。
// 数字は身近なたとえで図の下に1行（ruler）。くわしい数字・グラフは「くわしく見る」の中。
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const S = SIM.S;

  // たとえに使う身近な値（画面の出どころに書く）
  const OUTLET = 15;      // 家のコンセント 15 A（JIS C 8303 の定格）
  const SKYTREE = 634;    // 東京スカイツリーの高さ 634 m
  const SOUND = 340;      // 音の速さ 約340 m/s（15 ℃ の空気）

  const man = x => x >= 1e4 ? `${Math.round(x / 1e4).toLocaleString('ja-JP')}万` : `${Math.round(x).toLocaleString('ja-JP')}`;
  const tons = F => F / 9.80665 / 1000;
  const big = s => `<span class="big">${s}</span>`;

  let msg = '', msgUntil = 0;   // ひとことの知らせ（数秒で消える）
  function say(s, sec) { msg = s; msgUntil = performance.now() + (sec || 3) * 1000; }

  // 押す力を重りの数で（■ = 1トンの重さ）
  function weights(F) { const n = Math.round(tons(F)); return n < 1 ? '' : `<br><span class="wts">${'■'.repeat(Math.min(n, 60))}</span> <span class="muted">■ = 1トン</span>`; }

  // 撃っているあいだ・撃ったあとの1行
  function live(o) {
    if (S.phase === 'ready') return S.hold ? '止め板で押さえた。<b>箱を1つタップ</b>しよう。' : 'まず箱を<b>どれか1つ</b>タップ。';
    if (S.phase === 'live') {
      if (o.I > 2e3) return `電流 ${big('約' + man(o.I))} A（コンセントの約${man(o.I / OUTLET)}倍）→ 押す力 ${big('約' + Math.round(tons(o.F)) + 'トン')}` + (S.hold ? weights(o.F) : `・秒速 ${Math.round(o.v)} m`);
      if (SIM.fast()) return `電気が切れた。弾はそのまま進む（早送り）・秒速 ${Math.round(o.v)} m`;
      return '電流が止まった。次の箱をタップしよう。';
    }
    return result();
  }
  function result() {
    const r = S.sum;
    if (!S.run.out) return '弾は筒の中で止まった（電気が足りない）。「もう一回」でためなおせる。';
    const over = r.Imax > SIM.base().limit * 1.02;
    return `${(S.run.t * 1000).toFixed(1)}ミリ秒で、秒速 ${big((r.v / 1000).toFixed(1) + ' km')}（音の${(r.v / SOUND).toFixed(1)}倍・1秒でスカイツリー約${(r.v / SKYTREE).toFixed(1)}本ぶん）で飛び出した。` +
      (over ? `<br><span class="warn">電流が約${man(r.Imax)} A まで上がった。本物ならレールがこわれる（目安 ${man(SIM.base().limit)} A）。</span>` : '');
  }

  const TOUR = [
    { say: '<b>箱をタップ</b>してみよう。電気が レール → 電機子 → レール と流れ、<b>その同じ電流が磁場（青い ⊗）を作る</b>。うしろにたまった磁場が、電機子を前へ押す。',
      enter() { SIM.setPol(1); S.hold = false; SIM.reset(); }, ruler: live },
    { say: '<b>止め板</b>で押さえたまま、箱を1つ → 力が重り（■）の数になる。そこで<b>もう1つ</b>タップ。電流は何倍で、力は何倍？ 止め板をタップして外すと飛び出す。',
      enter() { SIM.setPol(1); S.hold = true; SIM.reset(); },
      ruler: o => {
        const c = S.cmp;
        if (c && c.done && S.phase === 'live') return `電流 ${big('×' + (c.I1 / c.I0).toFixed(2))} → 押す力 ${big('×' + (c.F1 / c.F0).toFixed(2))}（電流の2乗。${(c.I1 / c.I0).toFixed(2)}×${(c.I1 / c.I0).toFixed(2)}）` + (S.hold ? weights(o.F) + '<br>止め板をタップして外してみよう。' : '');
        return live(o);
      } },
    { say: '＋と−を入れかえると、電流も磁場も逆向きになる。では、弾は<b>どっちへ飛ぶ</b>？',
      enter() { S.hold = false; S.guess = null; SIM.setPol(1); SIM.reset(); },
      ruler: o => {
        if (!S.guess) return '<span class="guess"><button data-guess="f">前へ</button><button data-guess="b">うしろへ</button></span>　予想してから試そう';
        if (S.phase !== 'done' && S.phase !== 'after') return '入れかえた（箱が −）。' + live(o);
        return '前へ飛んだ。電流も磁場も逆なので、かけ算すると同じ前向き（力は電流の2乗）。<span class="muted">外に磁石を置いたレールなら、うしろへ動く。</span>';
      } },
    { say: 'あとは好きに撃ってみよう。<b>全部いっぺんに</b>タップすると？ 止め板で長く押さえると？ 焦げ跡はレールに重なって残る。',
      enter() { S.hold = false; SIM.reset(); }, ruler: live },
  ];
  let step = -1;

  const TIPS = {
    rail: () => 'レール: 2本の金属の棒。上と下で電流が反対向きに流れ、電流どうしが反発して外へ押し広げられる（だから砲身はとても頑丈に作る）。',
    arm: () => '電機子: レールにはさまった金属のかたまり（ここではアルミ）。レールからレールへ電流を渡し、自分が磁場に押されて弾を押す。',
    proj: () => '弾: かたい芯を、外側の部品（装弾筒）がつつむ。砲口を出ると外側ははなれ、芯だけが飛ぶ（防衛装備庁の資料の図から。形は目安）。',
    field: () => { const B = PHYS.gauge(S.p, SIM.current()).B; return `磁場: 電流のまわりにできる。2本のレールの間では向きがそろって強めあう。いまの強さの目安 約 ${B.toFixed(1)} テスラ（病院の MRI は 1.5〜3 テスラ）。`; },
    force: () => '押す力は電流の2乗に比例する（F = ½ L′ I²）。電流が2倍なら力は4倍。',
    muzzle: () => '砲口の火花: 弾が抜けると電流の通り道が切れ、レールの間にたまっていた磁場のエネルギーが火花になる。この形は目安で、計算していない。',
    micro: () => '電子は平均で秒速 1 cm ほどでゆっくり流れているだけ（本物は電機子のうしろのふちに電流が集まり、そこでは速い）。1個1個が磁場から横向きの力を受け、その力が金属ごと電機子を押す。',
    inset: () => '断面の矢印は、レールを細い電線の束と見なして計算した磁場の向き。2本の間では同じ向きにそろって強く、外側では弱い。赤い矢印はレールが押し広げられる向き。',
  };

  function setStep(k) {
    step = k;
    const s = TOUR[k];
    UI.show = ALL; UI.focus = null;
    $('next').textContent = k === TOUR.length - 1 ? 'はじめから ↺' : `つぎへ ▶ ${k + 2}/${TOUR.length}`;
    UI.onCam('arm');
    s.enter();
    UI.inset = false; $('bInset').classList.toggle('on', false);
    $('say').innerHTML = s.say;
    results(); UI.refresh();
  }

  function fmtE(E) { return `${(E / 1e6).toFixed(1)} MJ`; }
  function fmtM(m) { return m < 1 ? `${Math.round(m * 1000)} g` : `${m.toFixed(1)} kg`; }

  function syncControls() {
    const B = SIM.base(), c = S.cfg;
    const E = $('E'), m = $('m');
    E.min = B.Emin; E.max = B.Emax; E.step = (B.Emax - B.Emin) / 90; E.value = c.E;
    m.min = B.mMin; m.max = B.mMax; m.step = (B.mMax - B.mMin) / 95; m.value = c.m;
    $('Ev').textContent = fmtE(c.E); $('mv').textContent = fmtM(c.m);
    $('preset').value = c.preset;
  }

  // 「くわしく見る」の数字（いちばん新しい1発）
  function results() {
    const r = S.sum, B = SIM.base();
    if (S.phase === 'ready' || !r) { $('results').innerHTML = '<p class="muted">箱をタップして1発撃つと、ここに結果が出る。</p>'; $('warn').textContent = ''; return; }
    const over = r.Imax > B.limit * 1.02;
    const tiles = [
      ['弾の速さ', `秒速 ${(r.v / 1000).toFixed(2)} km`, `音の約${(r.v / SOUND).toFixed(1)}倍・1秒でスカイツリー約${(r.v / SKYTREE).toFixed(1)}本ぶん`],
      ['かかった時間', `${(r.t * 1e3).toFixed(1)} ミリ秒`, `1秒の${Math.round(1 / r.t)}分の1`],
      ['いちばん大きい電流', `約${man(r.Imax)} A`, over ? `レールの限界の目安（${man(B.limit)} A）をこえる` : `家のコンセントの約${man(r.Imax / OUTLET)}倍`, over],
      ['電気 → 弾の動き', `${Math.round(r.eff * 100)}%`, `ためた ${fmtE(r.E0)} のうち ${fmtE(r.KE)}`],
    ];
    $('results').innerHTML = tiles.map(([k, v, s, w]) => `<div class="tile${w ? ' warn' : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
    $('warn').textContent = over ? '電流の山が大きすぎる: 本物ならレールがこわれる・弾が強い衝撃を受ける。' : '';
  }

  function toggleHold() {
    if (S.hold) { SIM.setHold(false); say('止め板を外した。'); }
    else if (!SIM.setHold(true)) say('動いている弾は止められない。');
    else say('止め板を置いた。');
  }

  function build() {
    $('next').addEventListener('click', () => setStep((step + 1) % TOUR.length));
    $('play').addEventListener('click', () => {
      if (S.phase === 'ready') SIM.autoFire();
      else if (S.phase === 'live' || S.phase === 'after') S.paused = !S.paused;
      else { S.hold = false; SIM.reset(); results(); }
      UI.refresh();
    });
    $('bPol').addEventListener('click', () => {
      if (!SIM.setPol(-S.pol)) { say('撃っているあいだは入れかえられない。'); return; }
      if (S.phase === 'done') SIM.reset();
      say(S.pol > 0 ? '＋− をもとにもどした。' : '＋− を入れかえた（電流が逆向きに流れる）。');
    });
    $('bHold').addEventListener('click', toggleHold);
    $('time').addEventListener('input', e => { if (S.phase !== 'done') return; S.replay = false; S.t = e.target.value / 1000 * S.tEnd; });
    $('preset').addEventListener('change', e => { SIM.setPreset(e.target.value); syncControls(); results(); UI.onCam('arm'); });
    $('E').addEventListener('input', e => { S.cfg.E = +e.target.value; $('Ev').textContent = fmtE(S.cfg.E); if (S.phase === 'ready' || S.phase === 'done') SIM.reset(); });
    $('m').addEventListener('input', e => { S.cfg.m = +e.target.value; $('mv').textContent = fmtM(S.cfg.m); if (S.phase === 'ready' || S.phase === 'done') SIM.reset(); });
    $('bInset').addEventListener('click', () => { UI.inset = !UI.inset; $('bInset').classList.toggle('on', UI.inset); });
    $('ruler').addEventListener('click', e => {
      const b = e.target.closest('[data-guess]'); if (!b) return;
      S.guess = b.dataset.guess; SIM.setPol(-1); SIM.reset();
      say(S.guess === 'f' ? '「前へ」と予想。箱をタップして試そう。' : '「うしろへ」と予想。箱をタップして試そう。', 4);
    });
    const gcv = $('graph');
    const seek = e => { if (S.phase !== 'done') return; const r = gcv.getBoundingClientRect(); S.replay = false; S.t = GRAPH.timeAt(e.clientX - r.left); };
    gcv.addEventListener('pointerdown', e => { seek(e); gcv.setPointerCapture(e.pointerId); });
    gcv.addEventListener('pointermove', e => { if (e.buttons) seek(e); });
    syncControls();
    setStep(0);
  }

  // 毎コマ: 図の下の1行・ボタンの文字・スライダー
  let lastPhase = '';
  function refresh() {
    const o = SIM.sample(S.t), s = TOUR[step];
    const tEnd = S.phase === 'done' ? S.tEnd : Math.max(S.tEnd, S.t);
    $('time').value = Math.round(S.t / (tEnd || 1) * 1000);
    $('time').disabled = S.phase !== 'done';
    $('tlabel').textContent = `${(S.t * 1e3).toFixed(2)} ms`;
    $('play').textContent = S.phase === 'ready' ? '▶ おまかせで撃つ' : (S.phase === 'done' ? '↺ もう一回' : (S.paused ? '▶ つづき' : '❚❚ とめる'));
    $('bPol').textContent = S.pol > 0 ? '＋− 入れかえ' : '＋− もとにもどす';
    $('bPol').disabled = S.phase === 'live' || S.phase === 'after';
    $('bHold').textContent = S.hold ? '止め板を外す' : '止め板を置く';
    $('bHold').classList.toggle('on', S.hold);
    const note = performance.now() < msgUntil ? `<span class="note2">${msg}</span><br>` : '';
    const html = note + (s && s.ruler ? s.ruler(o) : '');
    if ($('ruler')._h !== html) { $('ruler').innerHTML = html; $('ruler')._h = html; }
    if (S.phase !== lastPhase) {
      lastPhase = S.phase;
      if (S.phase === 'done' || S.phase === 'after') results();
      if (S.phase === 'done') UI.onCam('all');   // 撃ちおわったら砲ぜんたい（焦げ跡が見える）
      if (S.phase === 'ready') UI.onCam('arm');
    }
    if (UI.moreOpen()) {
      const out = S.run.out && o.after >= 0;
      $('readout').innerHTML = [
        ['位置', out ? `砲口の先 ${(o.x - S.p.len).toFixed(2)} m` : `${(o.x - S.p.x0).toFixed(2)} m`],
        ['速さ', `${o.v.toFixed(0)} m/秒`],
        ['電流', out ? '—' : `${(o.I / 1e6).toFixed(2)} MA`],
        ['押す力', out ? '—' : DRAW.fmtF(o.F)],
      ].map(([k, v]) => `${k} <b>${v}</b>`).join('');
      GRAPH.energy($('energy'), o);
    }
  }

  function tip(k) { return TIPS[k] ? TIPS[k]() : ''; }
  const ALL = { cur: 1, field: 1, force: 1, racks: 1 };
  function free() {}
  function onTap() { if (S.cmp) say('2つ目！ 電流と力が何倍になるか見てみよう。', 2.5); }

  window.UI = { build, refresh, tip, setStep, free, onTap, toggleHold, TOUR, inset: false, camMode: 'arm', show: ALL, focus: null,
    moreOpen: () => $('more').open, onCam: () => {} };
})();
