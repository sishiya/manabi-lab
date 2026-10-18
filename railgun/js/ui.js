// レールガンのしくみ — 操作・つぎへの案内・結果・さわったときの説明
// 案内は「1段＝主役1つ」。図に出すもの（show）と光る枠（focus）を段ごとに決め、
// 数字は身近なものにたとえて図の下に1行（ruler）。くわしい数字・グラフは「くわしく見る」の中。
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
  const ALL = { cur: 1, field: 1, force: 1, racks: 1 };

  const R = {
    current: o => o.I > 1e3 ? `電流 <span class="big">約${man(o.I)}</span> アンペア ＝ 家のコンセント（15 A）の 約${man(o.I / OUTLET)}倍` : '',
    force: o => o.F > 0 ? `押す力 <span class="big">約${Math.round(tons(o.F))}トン</span>の重さぶん（電流が2倍なら、力は4倍）` : '',
    speed: o => {
      if (S.run.out && o.after >= 0) return `${(S.run.t * 1000).toFixed(1)}ミリ秒（1秒の${Math.round(1 / S.run.t)}分の1）で砲口へ。秒速 <span class="big">${(S.sum.v / 1000).toFixed(1)} km</span> ＝ 1秒でスカイツリー（634 m）約${(S.sum.v / SKYTREE).toFixed(1)}本ぶん`;
      return `速さ 秒速 <span class="big">${Math.round(o.v).toLocaleString('ja-JP')} m</span>（音の ${(o.v / SOUND).toFixed(1)}倍）`;
    },
    energy: () => {
      const r = S.sum, E0 = r.E0;
      return `弾の動き <span class="big">${Math.round(r.KE / E0 * 100)}%</span>・熱 ${Math.round((r.Q + r.Wf) / E0 * 100)}%・砲口の火花 ${Math.round(r.left / E0 * 100)}%`;
    },
  };

  const TOUR = [
    { say: 'レールガンは、2本の金属の<b>レール</b>と、その間にはさまった金属のかたまり（<b>電機子</b>）で弾を飛ばす。火薬は使わない。', cam: 'arm', t: 0, show: {}, focus: 'arm', ruler: () => '光っている所が電機子。その前が弾。' },
    { say: 'スイッチを入れると、電気が <b>上のレール → 電機子 → 下のレール</b> とひと回りする（黄色の点線）。', cam: 'arm', t: 0.6e-3, show: { cur: 1 }, focus: 'cur', ruler: R.current },
    { say: '電流のまわりには<b>磁場</b>（磁石の力）ができる。2本のレールの間では、向きがそろって強めあう（青い ⊗）。', cam: 'arm', t: 0.9e-3, show: { cur: 1, field: 1 }, focus: 'field', inset: true, ruler: () => '⊗ は「画面の奥へ向かう磁場」のしるし。右上は、筒の中を根元から見た断面。' },
    { say: '磁場の中を流れる電流は、横に<b>押される</b>。だから電機子が前へ押し出され、弾を押す。', cam: 'arm', t: 1.2e-3, show: { cur: 1, field: 1, force: 1 }, focus: 'force', ruler: R.force },
    { say: '<b>発射</b>。電気をためた箱（コンデンサ）から、弾が進むのにあわせて順に電気を送り、押しつづける。', cam: 'all', t: 0, play: true, show: ALL, focus: null, ruler: R.speed },
    { say: 'でも、弾の動きになるのは、ためた電気の<b>一部だけ</b>。残りは熱と、弾が抜けたときの砲口の火花になる。', cam: 'all', t: 'flash', show: ALL, focus: 'muzzle', ruler: R.energy },
    { say: 'レールどうしも押し広げられ、こすれてすりへる。本物の試作は「レールが200発以上もつ」ところまで来た（防衛装備庁）。', cam: 'arm', t: 2e-3, show: { cur: 1, field: 1, force: 1 }, focus: 'rail', inset: true, ruler: () => '赤い矢印 ＝ レールが外へ押される向き' },
    { say: 'おしまい。図はホイールやピンチで寄ったり引いたりできる（電機子の中の電子まで）。電気の量や弾の重さは、下の<b>「くわしく見る」</b>で変えられる。', cam: 'all', t: 'end', show: ALL, focus: null, ruler: R.speed },
  ];
  let step = -1;

  const TIPS = {
    rail: () => 'レール: 2本の金属の棒。上と下で電流が反対向きに流れ、電流どうしが反発して外へ押し広げられる（だから砲身はとても頑丈に作る）。',
    arm: () => '電機子: レールにはさまった金属のかたまり（ここではアルミ）。レールからレールへ電流を渡し、自分が磁場に押されて弾を押す。',
    proj: () => '弾: かたい芯を、外側の部品（装弾筒）がつつむ。砲口を出ると外側ははなれ、芯だけが飛ぶ（防衛装備庁の資料の図から。形は目安）。',
    field: () => { const B = PHYS.gauge(S.p, cur().I).B; return `磁場: 電流のまわりにできる。2本のレールの間では向きがそろって強めあう。いまの強さの目安 約 ${B.toFixed(1)} テスラ（病院の MRI は 1.5〜3 テスラ）。`; },
    force: () => `押す力は電流の2乗に比例する（F = ½ L′ I²）。いま 約${Math.round(tons(cur().F))}トンの重さぶん。`,
    rack: () => 'コンデンサ: 電気をためておく部品。ゆっくりためた電気を、0.005 秒ほどで一気に出す。緑はのこりの電気。',
    muzzle: () => '砲口の火花: 弾が抜けると電流の通り道が切れ、レールの間にたまっていた磁場のエネルギーが火花になる。この形は目安で、計算していない。',
    micro: () => '電子は秒速 1 cm ほどでゆっくり流れているだけ。1個1個が磁場から横向きの力を受け、その力が金属ごと電機子を押す。',
    inset: () => '断面の矢印は、レールを細い電線の束と見なして計算した磁場の向き。2本の間では同じ向きにそろって強く、外側では弱い。赤い矢印はレールが押し広げられる向き。',
  };

  function cur() { return SIM.sample(S.t); }

  function setStep(k) {
    step = k;
    const s = TOUR[k];
    UI.show = s.show; UI.focus = s.focus;
    $('next').textContent = k === TOUR.length - 1 ? 'はじめから ↺' : `つぎへ ▶ ${k + 2}/${TOUR.length}`;
    if (s.cam) UI.onCam(s.cam);
    S.t = s.t === 'end' ? S.tEnd : s.t === 'flash' ? S.run.t + 0.25e-3 : s.t;
    S.playing = false;
    if (s.play) { S.t = 0; S.playing = true; }
    UI.inset = !!s.inset; $('bInset').classList.toggle('on', UI.inset);
    $('say').innerHTML = s.say;
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
    const over = r.Imax > B.limit * 1.02;
    const tiles = [
      ['弾の速さ', `秒速 ${(r.v / 1000).toFixed(2)} km`, `音の約${(r.v / SOUND).toFixed(1)}倍・1秒でスカイツリー約${(r.v / SKYTREE).toFixed(1)}本ぶん`],
      ['砲口まで', `${(r.t * 1e3).toFixed(1)} ミリ秒`, `1秒の${Math.round(1 / r.t)}分の1`],
      ['いちばん大きい電流', `約${man(r.Imax)} A`, over ? (S.cfg.preset === 'atla' ? 'レールの限界の目安（200万 A）をこえる' : '論文でおさえた 450万 A をこえる') : `家のコンセントの約${man(r.Imax / OUTLET)}倍`, over],
      ['弾にかかる力', `重力の約${man(r.accG)}倍`, '平均（弾の重さが何倍にもなったのと同じ）'],
      ['電気 → 弾の動き', `${Math.round(r.eff * 100)}%`, `ためた ${fmtE(r.E0)} のうち ${fmtE(r.KE)}`],
    ];
    $('results').innerHTML = tiles.map(([k, v, s, w]) => `<div class="tile${w ? ' warn' : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
    const warn = [];
    if (!S.run.out) warn.push('弾が砲口までとどかない（電気が足りない）。');
    if (over) warn.push('電流の山が大きすぎる: 本物ならレールがこわれる・弾が強い衝撃を受ける。');
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

  // 時刻ごとの表示（図の下のたとえ・くわしく見るの中の数字）
  function refresh() {
    const o = cur();
    $('time').value = Math.round(S.t / S.tEnd * 1000);
    $('tlabel').textContent = `${(S.t * 1e3).toFixed(2)} ms`;
    $('play').textContent = S.playing ? '❚❚ とめる' : (S.t >= S.tEnd - 1e-9 ? '↺ もう一度' : (S.t > 0 ? '▶ つづき' : '▶ 発射'));
    const s = TOUR[step];
    $('ruler').innerHTML = s && s.ruler ? s.ruler(o) : '';
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

  // 図をさわったら、案内の出し入れはやめて全部見せる（自由に見る）
  function free() { if (UI.show !== ALL) { UI.show = ALL; UI.focus = null; } }

  window.UI = { build, refresh, tip, setStep, free, TOUR, inset: false, camMode: 'all', show: ALL, focus: null, onCam: () => {} };
})();
