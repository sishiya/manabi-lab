// レールガンのしくみ — 操作・つぎへの案内・結果・さわったときの説明
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const S = SIM.S;

  // つぎへ（図の上の1つのボタンで順に）。cam: 'all' 砲ぜんたい / 'arm' 弾に寄る / 'micro' 電機子の中
  const TOUR = [
    { ja: 'レールガンは、2本の金属の<b>レール</b>と、その間にはさまった金属のかたまり（<b>電機子</b>）、それに大きな<b>コンデンサ</b>だけ。火薬は使わない。', cam: 'all', t: 0, inset: false },
    { ja: 'スイッチを入れると、コンデンサから大電流。<b style="color:#ffc95a">上のレール → 電機子 → 下のレール</b>と、ぐるっとひと回りする。', cam: 'arm', t: 0.4e-3, inset: false },
    { ja: '電流のまわりには<b style="color:#7fd4ff">磁場</b>ができる。2本のレールの間では、どちらの電流が作る磁場も同じ向き（⊗＝画面の奥へ）で、強めあう。右下は断面の計算。', cam: 'arm', t: 0.8e-3, inset: true },
    { ja: '磁場の中を流れる電流は、横に<b style="color:#ff7a6b">押される</b>（ローレンツ力）。電機子の電流は下向き、磁場は奥向き → 力は前向き。力は電流の2乗に比例: 電流が2倍なら力は4倍。', cam: 'arm', t: 1.2e-3, inset: false },
    { ja: '電機子の中をのぞくと、電子は<b>秒速 1 cm ほど</b>でゆっくり流れているだけ。その1個1個が磁場に前へ押され、金属ごと電機子を押し出す。', cam: 'micro', t: 1.2e-3, inset: false },
    { ja: '<b>発射</b>。コンデンサを弾の進みにあわせて順に放電し、電流をほぼ一定に保つ。約5ミリ秒で砲口へ（1000分の1の速さで再生）。', cam: 'all', t: 0, play: true, inset: false },
    { ja: '<b>エネルギーの行き先</b>（下の帯）。弾の運動になるのは一部だけ。残りは抵抗の熱と、レールの間の磁場。弾が抜けると、その磁場は砲口の火花になる。', cam: 'all', t: 'end', inset: false },
    { ja: 'レールどうしも、反対向きの電流で<b style="color:#ff7a6b">押し広げられる</b>（断面の赤い矢印）。電機子がこすれ、レールはすりへる。防衛装備庁の試作は「レール耐久 200 発以上」を達成。', cam: 'arm', t: 2e-3, inset: true },
    { ja: '火薬の砲は、ふくらむガスが弾を押す（戦車砲で 約1,750 m/s）。レールガンは電気で押すので、原理的にはもっと速くできる（防衛装備庁）。下の「自分で試す」で、電気の量・弾の重さ・放電のしかたを変えてみよう。', cam: 'all', t: 'end', inset: false },
  ];
  let step = -1;

  const TIPS = {
    rail: () => 'レール: 2本の金属の棒。上と下で電流が反対向きに流れ、電流どうしが反発して外へ押し広げられる（だから砲身はとても頑丈に作る）。',
    arm: () => '電機子: レールにはさまった金属のかたまり（ここではアルミの C の形。足がレールにさわる）。レールからレールへ電流を渡し、自分が磁場に押されて弾を押す。',
    proj: () => '弾: かたい芯（弾心）を装弾筒がつつむ。砲口を出ると装弾筒ははなれ、弾心だけが飛ぶ（防衛装備庁の資料の図から。形は目安）。',
    field: () => { const o = cur(); const B = PHYS.gauge(S.p, o.I).B; return `磁場: 電流のまわりにできる。2本のレールの間では同じ向き（⊗ 奥へ）で強めあう。いまの強さの目安 約 ${B.toFixed(1)} テスラ（病院の MRI は 1.5〜3 テスラ）。`; },
    force: () => `押す力 F = ½ L′ I²（L′ = ${(S.p.Lp * 1e6).toFixed(2)} µH/m）。電流が2倍なら力は4倍。いまの加速度 約 ${(cur().F * 0.9 / S.p.m / 9.8 / 1e4).toFixed(1)} 万G。`,
    rack: () => 'コンデンサ: 電気をためておく部品。ゆっくりためた電気を、数ミリ秒で一気に出す。弾が進むのにあわせて順にスイッチを入れ、電流をほぼ一定に保つ。緑はのこりの電気。',
    muzzle: () => `砲口の火花: 弾が抜けると電流の通り道が切れ、レールの間とコイルにたまっていた磁場のエネルギー（${(S.sum.left / 1e6).toFixed(2)} MJ）が火花（アーク）になる。この形は目安で、計算していない。`,
    micro: () => '電子は秒速 1 cm ほどでゆっくり流れているだけ。1個1個が磁場から横向きの力（ローレンツ力）を受け、その力が金属ごと電機子を押す。',
    inset: () => '断面の矢印は、レールを細い電線の束と見なして計算した磁場の向き。2本の間では同じ向きにそろって強く、外側では打ち消しあって弱い。赤い矢印はレールが押し広げられる向き。',
  };

  function cur() { return SIM.sample(S.t); }

  function setStep(k) {
    step = k;
    const s = TOUR[k];
    $('card').innerHTML = `<span class="n">${k + 1}/${TOUR.length}</span>${s.ja}`;
    $('next').textContent = k === TOUR.length - 1 ? 'はじめから ↺' : 'つぎへ ▶';
    if (s.cam) UI.onCam(s.cam);
    S.t = s.t === 'end' ? S.tEnd : s.t;
    S.playing = false;
    if (s.play) { S.t = 0; S.playing = true; }
    UI.inset = !!s.inset; $('bInset').classList.toggle('on', UI.inset);
    UI.refresh();
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
    for (const b of document.querySelectorAll('[data-seq]')) b.classList.toggle('on', (b.dataset.seq === '1') === c.seq);
  }

  function results() {
    const r = S.sum, B = SIM.base();
    const tiles = [
      ['初速', `${r.v.toFixed(0)} m/秒`, `音の約 ${(r.v / 340).toFixed(1)} 倍・時速 ${(r.v * 3.6).toLocaleString('ja-JP', { maximumFractionDigits: 0 })} km`],
      ['砲口まで', `${(r.t * 1e3).toFixed(2)} ミリ秒`, `レール ${(S.p.len - S.p.x0).toFixed(1)} m を走る`],
      ['いちばん大きい電流', `${(r.Imax / 1e6).toFixed(2)} MA`, r.Imax > B.limit * 1.02 ? (S.cfg.preset === 'atla' ? 'レールの限界の目安（2 MA）をこえる' : '論文でおさえた 4.5 MA をこえる') : '100万アンペア＝1 MA', r.Imax > B.limit * 1.02],
      ['平均の加速度', `${(r.accG / 1e4).toFixed(1)} 万G`, '重力の何倍か'],
      ['効率', `${(r.eff * 100).toFixed(0)}%`, `ためた ${fmtE(r.E0)} → 弾 ${fmtE(r.KE)}`],
    ];
    $('results').innerHTML = tiles.map(([k, v, s, w]) => `<div class="tile${w ? ' warn' : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
    const warn = [];
    if (!S.run.out) warn.push('弾が砲口までとどかない（電気が足りない）。');
    if (r.Imax > B.limit * 1.02) warn.push('電流の山が大きすぎる: 本物ならレールがこわれる・弾が強い衝撃を受ける。');
    $('warn').textContent = warn.join(' ');
  }

  function recompute() { SIM.compute(); results(); UI.refresh(); }

  function build() {
    $('next').addEventListener('click', () => setStep((step + 1) % TOUR.length));
    $('play').addEventListener('click', () => {
      if (S.playing) { S.playing = false; }
      else { if (S.t >= S.tEnd - 1e-9) S.t = 0; S.playing = true; }
      UI.refresh();
    });
    $('time').addEventListener('input', e => { S.playing = false; S.t = e.target.value / 1000 * S.tEnd; UI.refresh(); });
    $('preset').addEventListener('change', e => { SIM.setPreset(e.target.value); syncControls(); results(); UI.onCam(UI.camMode || 'all'); UI.refresh(); });
    $('E').addEventListener('input', e => { S.cfg.E = +e.target.value; $('Ev').textContent = fmtE(S.cfg.E); recompute(); });
    $('m').addEventListener('input', e => { S.cfg.m = +e.target.value; $('mv').textContent = fmtM(S.cfg.m); recompute(); });
    for (const b of document.querySelectorAll('[data-seq]')) b.addEventListener('click', () => { S.cfg.seq = b.dataset.seq === '1'; syncControls(); recompute(); });
    $('bInset').addEventListener('click', () => { UI.inset = !UI.inset; $('bInset').classList.toggle('on', UI.inset); });
    const gcv = $('graph');
    const seek = e => { const r = gcv.getBoundingClientRect(); S.playing = false; S.t = GRAPH.timeAt(e.clientX - r.left); UI.refresh(); };
    gcv.addEventListener('pointerdown', e => { seek(e); gcv.setPointerCapture(e.pointerId); });
    gcv.addEventListener('pointermove', e => { if (e.buttons) seek(e); });
    syncControls(); results();
    setStep(0);
  }

  // 時刻の表示（図の下）
  function refresh() {
    const o = cur();
    $('time').value = Math.round(S.t / S.tEnd * 1000);
    $('tlabel').textContent = `${(S.t * 1e3).toFixed(2)} ms`;
    $('play').textContent = S.playing ? '❚❚ とめる' : (S.t >= S.tEnd - 1e-9 ? '↺ もう一度' : (S.t > 0 ? '▶ つづき' : '▶ 発射'));
    const out = S.run.out && o.after >= 0;
    $('readout').innerHTML = [
      ['位置', out ? `砲口の先 ${(o.x - S.p.len).toFixed(2)} m` : `${(o.x - S.p.x0).toFixed(2)} m`],
      ['速さ', `${o.v.toFixed(0)} m/秒`],
      ['電流', out ? '—' : `${(o.I / 1e6).toFixed(2)} MA`],
      ['押す力', out ? '—' : DRAW.fmtF(o.F)],
    ].map(([k, v]) => `${k} <b>${v}</b>`).join('');
    GRAPH.energy($('energy'), o);
  }

  function tip(k) { return TIPS[k] ? TIPS[k]() : ''; }

  window.UI = { build, refresh, tip, setStep, TOUR, inset: false, camMode: 'all', onCam: () => {} };
})();
