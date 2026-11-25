// ① 記憶 — 見ていないところは言葉にもどる
// 外す前提: 画面は、見ていてもいなくても同じように描く。
// かわりに: 注意（指・マウスの位置＝目）を向けた物だけ線がまとまり、注意がはなれると細かい線からほどけ、最後は名前だけが残る。
//   考え方は Rensink 2000（注意が離れるとまとまりはほどけ、場面の要旨と配置は残る）にならった演出。秒数は見えるように遅くした推定。
//   覚えていられる物は数個まで（Luck & Vogel 1997 の視覚の作業記憶 約4個）→ 上位4つはゆっくり、ほかは速くほどける。
'use strict';
(() => {
  const W = 1000, H = 620;
  const HOLD = 4;            // 覚えていられる数（Luck & Vogel 1997）
  const RISE = 5;            // 見ているあいだにまとまる速さ（1/秒）
  const TAU_HELD = 7, TAU_OTHER = 1.6;   // ほどける時定数（秒。推定・見えるように遅くした）
  const R_EYE = 95;          // 注意の届く半径（世界の単位）
  const objs = MEMORY_SCENE.map(o => ({ ...o, m: 0, hidden: -1 }));
  let gaze = null;           // 目の位置（世界の座標）。null＝画面を見ていない
  let normal = false;        // ふつうの描き方
  let quiz = null;           // 変化の見落としの答え合わせ { idx, state }
  let fit = { s: 1, ox: 0, oy: 0 };
  let noteEl = null, downAt = null;
  const ink = (a) => `rgba(232,240,244,${a})`;

  function resize(w, h) {
    const s = Math.min(w / W, h / H);
    fit = { s, ox: (w - W * s) / 2, oy: (h - H * s) / 2 };
  }
  const toWorld = (x, y) => ({ x: (x - fit.ox) / fit.s, y: (y - fit.oy) / fit.s });

  function attention(o) {
    if (!gaze) return 0;
    const dx = Math.max(o.x - gaze.x, 0, gaze.x - (o.x + o.w));
    const dy = Math.max(o.y - gaze.y, 0, gaze.y - (o.y + o.h));
    return Math.exp(-((dx * dx + dy * dy) / (R_EYE * R_EYE)));
  }

  function step(dt) {
    if (normal) return false;
    // 手前の物の箱の中を見ているとき、奥の物には注意がほとんど行かない
    let front = -1;
    if (gaze) for (let i = objs.length - 1; i >= 0; i--) { const o = objs[i]; if (gaze.x >= o.x && gaze.x <= o.x + o.w && gaze.y >= o.y && gaze.y <= o.y + o.h) { front = i; break; } }
    const rank = objs.map((o, i) => i).sort((a, b) => objs[b].m - objs[a].m);
    const held = new Set(rank.slice(0, HOLD));
    let moving = false;
    objs.forEach((o, i) => {
      let a = attention(o);
      if (front >= 0 && i < front) a *= 0.06;
      const tau = held.has(i) ? TAU_HELD : TAU_OTHER;
      const dm = RISE * a * (1 - o.m) - (1 - a) * o.m / tau;
      const m2 = Math.min(1, Math.max(0, o.m + dm * dt));
      if (Math.abs(m2 - o.m) > 1e-4) moving = true;
      o.m = m2;
    });
    const n = objs.filter(o => o.m > 0.3).length;
    RI.hud(`絵のまま ${n} / ${objs.length}　（※ 点線の円は目の位置の目印）`);
    return moving;   // 変わらなくなったら描き直しを止める（指が動けば RI が起こす）
  }

  // 線の部品を描く（座標は箱の中の 0〜100）
  function prim(g, o, p) {
    const sx = o.w / 100, sy = o.h / 100, sr = Math.min(sx, sy);
    const X = v => o.x + v * sx, Y = v => o.y + v * sy;
    g.beginPath();
    switch (p[0]) {
      case 'p': case 'P':
        g.moveTo(X(p[1]), Y(p[2]));
        for (let k = 3; k < p.length; k += 2) g.lineTo(X(p[k]), Y(p[k + 1]));
        if (p[0] === 'P') g.closePath();
        break;
      case 'c': g.arc(X(p[1]), Y(p[2]), p[3] * sr, 0, Math.PI * 2); break;
      case 'e': g.ellipse(X(p[1]), Y(p[2]), p[3] * sx, p[4] * sy, 0, 0, Math.PI * 2); break;
      case 'a': g.arc(X(p[1]), Y(p[2]), p[3] * sr, p[4] * Math.PI / 180, p[5] * Math.PI / 180); break;
      case 'b': {
        const [, cx, cy, rx, ry, n, amp] = p;
        for (let k = 0; k <= 96; k++) {
          const t = k / 96 * Math.PI * 2, r = 1 - amp + amp * Math.abs(Math.sin(t * n / 2));
          const x = X(cx + Math.cos(t) * rx * r), y = Y(cy + Math.sin(t) * ry * r);
          k ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath(); break;
      }
    }
  }

  function drawObj(g, o, m, i) {
    const N = o.strokes.length;
    const shown = m * N;                       // 何本目の束まで描くか（小数ぶんは薄く）
    // 奥の物を隠す（形が見えている分だけ、輪郭の中を背景の色でぬる）
    const occ = Math.min(1, shown);
    if (occ > 0) {
      g.globalAlpha = occ; g.fillStyle = '#14202c';
      for (const p of o.strokes[0]) if (p[0] !== 'p' && p[0] !== 'a') { prim(g, o, p); g.fill(); }
      g.globalAlpha = 1;
    }
    // 色: よく見ているときだけ
    if (m > 0.8 && o.fill) {
      g.globalAlpha = (m - 0.8) / 0.2 * 0.35; g.fillStyle = o.fill;
      for (const p of o.strokes[0]) if (p[0] !== 'p' && p[0] !== 'a') { prim(g, o, p); g.fill(); }
      g.globalAlpha = 1;
    }
    for (let k = 0; k < N; k++) {
      const a = Math.min(1, Math.max(0, shown - k));
      if (a <= 0) break;
      if (k === o.hidden) continue;           // 見ていないあいだに消した線
      g.strokeStyle = ink(0.92 * a);
      for (const p of o.strokes[k]) { prim(g, o, p); g.stroke(); }
    }
    // 言葉（名前）
    const wa = Math.min(1, Math.max(0, (0.38 - m) / 0.2));
    if (wa > 0) {
      const fs = Math.max(18, 12 / fit.s, Math.min(40, Math.min(o.w, o.h) * 0.42));   // 画面で 12px より小さくしない
      g.font = `500 ${fs}px 'Zen Kaku Gothic New', sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = `rgba(163,180,191,${0.95 * wa})`;
      g.fillText(o.name, o.x + o.w / 2, o.y + o.h / 2);
    }
    // 答え合わせ
    if (quiz && quiz.state !== 'ask' && i === quiz.idx) {
      g.save(); g.setLineDash([6, 5]); g.strokeStyle = '#ffc95a'; g.lineWidth = 2.5;
      g.strokeRect(o.x - 6, o.y - 6, o.w + 12, o.h + 12);
      g.setLineDash([]); g.strokeStyle = 'rgba(255,201,90,0.9)';
      for (const p of o.strokes[o.hidden]) { prim(g, o, p); g.stroke(); }
      g.restore();
    }
  }

  function draw(g, w, h) {
    g.clearRect(0, 0, w, h);
    g.save(); g.translate(fit.ox, fit.oy); g.scale(fit.s, fit.s);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 2 / Math.max(0.6, fit.s);
    // 場面の配置（地面と道のふち）は注意がなくても残る（Rensink 2000 の「要旨と配置」）
    g.strokeStyle = ink(0.22);
    g.beginPath(); g.moveTo(0, 430); g.lineTo(W, 430); g.moveTo(0, 590); g.lineTo(W, 590); g.stroke();
    objs.forEach((o, i) => drawObj(g, o, normal ? 1 : o.m, i));
    if (gaze && !normal) {
      g.setLineDash([5, 6]); g.strokeStyle = 'rgba(143,211,255,0.55)'; g.lineWidth = 1.5 / fit.s;
      g.beginPath(); g.arc(gaze.x, gaze.y, R_EYE * 0.8, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
    g.restore();
  }

  function setNote(html) { if (noteEl) noteEl.innerHTML = html; }

  function changeOne() {
    // 言葉になっている物から1つ選び、細かい線を1本消す（言葉は変わらない）
    if (quiz && quiz.state === 'ask') return;
    objs.forEach(o => o.hidden = -1);
    const cand = objs.map((o, i) => i).filter(i => objs[i].m < 0.25 && objs[i].strokes.length >= 3);
    if (!cand.length) { setNote('いまは全部見えています。<b>少し目をはなして</b>から押してください。'); return; }
    const idx = cand[Math.floor(Math.random() * cand.length)], o = objs[idx];
    o.hidden = 1 + Math.floor(Math.random() * (o.strokes.length - 1));
    quiz = { idx, state: 'ask' };
    setNote('<b>どれか1つの絵を変えました。</b>言葉は同じままです。見て回って、変わったと思う物を押してください。');
  }

  function guess(wp) {
    let hit = -1;
    for (let i = objs.length - 1; i >= 0; i--) { const o = objs[i]; if (wp.x >= o.x - 8 && wp.x <= o.x + o.w + 8 && wp.y >= o.y - 8 && wp.y <= o.y + o.h + 8) { hit = i; break; } }
    if (hit < 0) return;
    const o = objs[quiz.idx];
    quiz.state = hit === quiz.idx ? 'right' : 'wrong';
    o.m = Math.max(o.m, 1);
    setNote(quiz.state === 'right'
      ? `<b>正解。</b>「${o.name}」の線が1本消えていました（黄色い点線）。`
      : `<b>ちがいました。</b>変わったのは「${o.name}」です（黄色い点線の線が消えていました）。言葉のままだった間は、変化が見えません。`);
  }

  function pointer(type, x, y, e) {
    // スマホでは指が見たい所をかくすので、目は指より少し上に置く
    const lift = e && e.pointerType === 'touch' ? 56 : 0;
    if (type === 'leave') { if (e.pointerType !== 'touch') gaze = null; return; }
    if (type === 'down') downAt = { x, y };
    if (type === 'up') {
      if (quiz && quiz.state === 'ask' && downAt && Math.hypot(x - downAt.x, y - downAt.y) < 10) guess(toWorld(x, y - lift));
      downAt = null;
    }
    gaze = toWorld(x, y - lift);
  }

  RI.add({
    id: 'memory',
    lead: '指（マウス）が<b>目</b>です。見たところだけ絵になり、目をはなすと<b>言葉にもどります</b>。',
    how: `<p>ふつうの絵は、どこを見ていても同じに描かれます。ここでは、注意を向けた物だけ線がまとまり、注意がはなれると細かい線からほどけて、最後は名前だけが残ります。</p>
      <p>人の目でも、注意を向けていない物のこまかい形はほとんど覚えていない、という研究があります（Rensink 2000、変化の見落とし Simons &amp; Levin 1997）。地面と道のふちは、見ていなくても残る「場面の配置」として、いつもうすく描いています。</p>
      <p>同時に覚えていられるのは4つくらいまでにしました（Luck &amp; Vogel 1997）。4つより多くの物は速くほどけます。</p>
      <p>簡単にしているところ: ほどけていく速さと順番は、研究の考え方にならった演出です。秒数は、見えるように遅くした推定です。Rensink の説ではほどけるのはすぐで、見た物の記憶は長く残るという反対の結果もあります（Hollingworth &amp; Henderson 2002）。</p>`,
    init() {},
    resize,
    controls(root) {
      const b = RI.buttons(root);
      RI.toggle(b, 'ふつうの描き方（くらべる）', normal, v => { normal = v; });
      RI.action(b, '見ていないあいだに1つ変える', changeOne);
      noteEl = RI.note(root, quiz ? '' : '変化の見落としを試せます。全体を見てから、目をはなして押してください。');
    },
    step, draw, pointer,
  });
  window.__reidMemory = { objs, get gaze() { return gaze; }, set gaze(v) { gaze = v; } };
})();
