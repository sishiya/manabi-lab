// ①-C 見ていないところは言葉にもどる × 水槽 — ここでは言葉ではなく「色のかたまり」にほどける
// 注意を向けた魚だけ、形・ひれ・目・模様がまとまる。注意がはなれると、ぼやけた色のかたまりになる
// （Rensink 2000 の「原始物体」＝注意の外では、色や大きさのような簡単な特徴のかたまりだけ、にならった演出）。
// 魚は泳いでいるので、目をはなすと、同じ色のどの魚がどれだったか分からなくなる。動きは演出（決まった式のゆらぎ）。
'use strict';
(() => {
  const W = 1000, H = 600, HOLD = 4, RISE = 5, TAU_HELD = 6, TAU_OTHER = 1.4, R_EYE = 110;
  // 色は2匹ずつ同じ。ちがうのは模様だけ
  const KINDS = [
    { col: [235, 90, 70], pat: 'stripe' }, { col: [235, 90, 70], pat: 'dots' },
    { col: [70, 150, 235], pat: 'band' }, { col: [70, 150, 235], pat: 'plain' },
    { col: [245, 200, 60], pat: 'dots' }, { col: [245, 200, 60], pat: 'stripe' },
    { col: [150, 220, 120], pat: 'band' }, { col: [150, 220, 120], pat: 'plain' },
  ];
  const PATS = ['stripe', 'dots', 'band', 'plain'];
  let fish = [], bubbles = [], gaze = null, normal = false, t = 0, quiz = null, noteEl = null, downAt = null;
  let fit = { s: 1, ox: 0, oy: 0 };

  function init() {
    fish = KINDS.map((k, i) => ({ ...k, x: 120 + (i * 113) % 760, y: 120 + (i * 157) % 360, vx: 0, vy: 0, dir: i % 2 ? 1 : -1, size: 34 + (i % 3) * 8, ph: i * 1.7, m: 0, changed: null }));
    bubbles = Array.from({ length: 24 }, (_, i) => ({ x: 860 + (i % 3) * 12, y: Math.random() * H, r: 2 + Math.random() * 3, v: 30 + Math.random() * 30 }));
  }
  function resize(w, h) { const s = Math.min(w / W, h / H); fit = { s, ox: (w - W * s) / 2, oy: (h - H * s) / 2 }; }
  const toW = (x, y) => ({ x: (x - fit.ox) / fit.s, y: (y - fit.oy) / fit.s });

  function step(dt) {
    t += dt;
    for (const f of fish) {   // ゆっくりゆらぐ向きへ泳ぐ（かべの近くでは向きを変える）
      const ax = Math.sin(t * 0.31 + f.ph) * 18 + Math.sin(t * 0.13 + f.ph * 2) * 10, ay = Math.sin(t * 0.47 + f.ph * 1.3) * 12;
      f.vx += (ax + f.dir * 22 - f.vx) * dt * 0.8; f.vy += (ay - f.vy) * dt * 0.8;
      if (f.x < 90) f.dir = 1; if (f.x > W - 150) f.dir = -1;
      if (f.y < 80) f.vy += 30 * dt; if (f.y > H - 140) f.vy -= 30 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
    }
    for (const b of bubbles) { b.y -= b.v * dt; b.x += Math.sin(t * 3 + b.r) * 0.3; if (b.y < 10) b.y = H - 60; }
    if (!normal) {
      const rank = fish.map((_, i) => i).sort((a, b) => fish[b].m - fish[a].m), held = new Set(rank.slice(0, HOLD));
      fish.forEach((f, i) => {
        const a = gaze ? Math.exp(-(((f.x - gaze.x) ** 2 + (f.y - gaze.y) ** 2) / (R_EYE * R_EYE))) : 0;
        f.m = Math.min(1, Math.max(0, f.m + (RISE * a * (1 - f.m) - (1 - a) * f.m / (held.has(i) ? TAU_HELD : TAU_OTHER)) * dt));
      });
    }
    return true;
  }

  function drawFish(g, f, m) {
    const s = f.size, d = f.vx >= 0 ? 1 : -1, [r, gg, b] = f.col;
    const det = Math.min(1, Math.max(0, (m - 0.25) / 0.45)), blob = 1 - Math.min(1, Math.max(0, (m - 0.15) / 0.5));
    g.save(); g.translate(f.x, f.y);
    if (blob > 0) {   // 色のかたまり（ぼやけた丸）
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, s * 1.5);
      gr.addColorStop(0, `rgba(${r},${gg},${b},${0.75 * blob})`); gr.addColorStop(0.6, `rgba(${r},${gg},${b},${0.3 * blob})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, s * 1.5, s * 1.0, 0, 0, Math.PI * 2); g.fill();
    }
    if (det > 0) {
      g.scale(d, 1); g.globalAlpha = det;
      const wag = Math.sin(t * 6 + f.ph) * 0.18;
      // 尾びれ
      g.fillStyle = `rgb(${r * 0.8 | 0},${gg * 0.8 | 0},${b * 0.8 | 0})`;
      g.beginPath(); g.moveTo(-s * 0.85, 0); g.lineTo(-s * 1.45, -s * (0.5 + wag)); g.lineTo(-s * 1.3, 0); g.lineTo(-s * 1.45, s * (0.5 - wag)); g.closePath(); g.fill();
      // 背びれ
      g.beginPath(); g.moveTo(-s * 0.3, -s * 0.45); g.quadraticCurveTo(0, -s * 0.95, s * 0.3, -s * 0.48); g.fill();
      // からだ
      const body = g.createLinearGradient(0, -s * 0.55, 0, s * 0.55);
      body.addColorStop(0, `rgb(${r},${gg},${b})`); body.addColorStop(1, `rgb(${Math.min(255, r + 50)},${Math.min(255, gg + 50)},${Math.min(255, b + 50)})`);
      g.fillStyle = body; g.beginPath(); g.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); g.fill();
      // 模様（ここがちがいの手がかり）
      g.save(); g.beginPath(); g.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); g.clip();
      g.fillStyle = 'rgba(20,32,44,0.55)';
      if (f.pat === 'stripe') for (const x of [-0.45, -0.05, 0.35]) g.fillRect(x * s, -s, s * 0.14, s * 2);
      if (f.pat === 'dots') for (const [x, y] of [[-0.5, -0.15], [-0.2, 0.2], [0.05, -0.2], [0.3, 0.15], [-0.65, 0.2]]) { g.beginPath(); g.arc(x * s, y * s, s * 0.08, 0, Math.PI * 2); g.fill(); }
      if (f.pat === 'band') g.fillRect(-s, -s * 0.08, s * 2, s * 0.16);
      g.restore();
      // えら・目・胸びれ
      g.strokeStyle = 'rgba(20,32,44,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(s * 0.45, 0, s * 0.3, -0.9, 0.9); g.stroke();
      g.fillStyle = '#f4f8ff'; g.beginPath(); g.arc(s * 0.68, -s * 0.12, s * 0.11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#14202c'; g.beginPath(); g.arc(s * 0.7, -s * 0.12, s * 0.055, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(${r},${gg},${b},0.8)`; g.beginPath(); g.ellipse(s * 0.2, s * 0.25, s * 0.22, s * 0.09, 0.5 + wag, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    g.restore();
  }

  function draw(g, w, h) {
    g.fillStyle = '#081420'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(fit.ox, fit.oy); g.scale(fit.s, fit.s);
    const wat = g.createLinearGradient(0, 0, 0, H); wat.addColorStop(0, '#1b5a78'); wat.addColorStop(1, '#0b2a3c');
    g.fillStyle = wat; g.fillRect(0, 0, W, H);
    // 光の筋・砂・水草（いつも見えている「場面の配置」）
    g.fillStyle = 'rgba(200,240,255,0.05)';
    for (let i = 0; i < 5; i++) { const x = 120 + i * 190 + Math.sin(t * 0.3 + i) * 20; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 60, 0); g.lineTo(x - 40, H); g.lineTo(x - 90, H); g.fill(); }
    g.fillStyle = '#5a5040'; g.beginPath(); g.moveTo(0, H - 50); for (let x = 0; x <= W; x += 50) g.lineTo(x, H - 50 - Math.sin(x * 0.02) * 8); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.strokeStyle = 'rgba(90,170,110,0.7)'; g.lineWidth = 5; g.lineCap = 'round';
    for (const [x0, hh] of [[70, 260], [110, 200], [640, 230], [690, 300], [930, 220]]) {
      g.beginPath(); g.moveTo(x0, H - 48); for (let k = 1; k <= 10; k++) g.lineTo(x0 + Math.sin(t * 0.8 + k * 0.6 + x0) * k * 1.6, H - 48 - hh * k / 10); g.stroke();
    }
    g.fillStyle = 'rgba(220,245,255,0.5)'; for (const b of bubbles) { g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill(); }
    fish.forEach(f => drawFish(g, f, normal ? 1 : f.m));
    if (quiz && quiz.state !== 'ask') {
      const f = fish[quiz.idx]; g.setLineDash([6, 5]); g.strokeStyle = '#ffc95a'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(f.x, f.y, f.size * 1.6, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
    if (gaze && !normal) { g.setLineDash([5, 6]); g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.5; g.beginPath(); g.arc(gaze.x, gaze.y, R_EYE * 0.8, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    g.restore();
    RI.hud(`形が見えている魚 ${fish.filter(f => f.m > 0.4).length} / ${fish.length}　（※ 点線の円は目の位置の目印）`);
  }

  function setNote(s) { if (noteEl) noteEl.innerHTML = s; }
  function changeOne() {
    if (quiz && quiz.state === 'ask') return;
    const cand = fish.map((_, i) => i).filter(i => fish[i].m < 0.2);
    if (!cand.length) { setNote('いまは全部見えています。<b>少し目をはなして</b>から押してください。'); return; }
    const idx = cand[Math.floor(Math.random() * cand.length)], f = fish[idx], old = f.pat;
    f.pat = PATS[(PATS.indexOf(old) + 1 + Math.floor(Math.random() * 3)) % 4];
    quiz = { idx, state: 'ask' };
    setNote('<b>どれか1匹の模様を変えました。</b>色は同じです。変わったと思う魚を押してください。');
  }
  function guess(p) {
    let best = -1, bd = 1e9; fish.forEach((f, i) => { const d = Math.hypot(f.x - p.x, f.y - p.y); if (d < f.size * 1.6 && d < bd) { bd = d; best = i; } });
    if (best < 0) return;
    quiz.state = best === quiz.idx ? 'right' : 'wrong';
    setNote(quiz.state === 'right' ? '<b>正解。</b>黄色い点線の魚の模様が変わっていました。' : '<b>ちがいました。</b>変わったのは黄色い点線の魚です。色のかたまりのあいだは、模様のちがいが見えません。');
  }
  function pointer(type, x, y, e) {
    const lift = e && e.pointerType === 'touch' ? 56 : 0;
    if (type === 'leave') { if (e.pointerType !== 'touch') gaze = null; return; }
    if (type === 'down') downAt = { x, y };
    if (type === 'up') { if (quiz && quiz.state === 'ask' && downAt && Math.hypot(x - downAt.x, y - downAt.y) < 10) guess(toW(x, y - lift)); downAt = null; }
    gaze = toW(x, y - lift);
  }

  RI.add({
    id: 'memory-tank', group: 'memory', label: '水槽',
    lead: '目を向けた魚だけ形と模様が見え、はなすと<b>ぼやけた色のかたまり</b>にもどります。泳いでいるので、すぐ見失います。',
    how: `<p>ここでは、注意の外の物は言葉ではなく、色と大きさだけのかたまりになります。注意を向けていない物は、色のような簡単な特徴のかたまりとしてしか残らない、という考え（Rensink 2000 の「原始物体」）にならった演出です。</p>
      <p>同じ色の魚が2匹ずついて、ちがうのは模様だけです。目をはなしているあいだに泳いで入れかわると、どちらがどちらか分からなくなります。「見ていないあいだに模様を変える」で試せます（変化の見落とし、Simons &amp; Levin 1997）。</p>
      <p>簡単にしているところ: 魚の動きと、ほどける速さは演出です。同時に覚えていられるのは4匹までにしました（Luck &amp; Vogel 1997）。</p>`,
    init, resize,
    controls(root) {
      const b = RI.buttons(root);
      RI.toggle(b, 'ふつうの描き方（くらべる）', normal, v => { normal = v; });
      RI.action(b, '見ていないあいだに模様を変える', changeOne);
      noteEl = RI.note(root, '全体を見てから目をはなし、押してみてください。');
      noteEl.style.minHeight = '3.2em';
    },
    step, draw, pointer,
  });
  window.__reidTank = { get fish() { return fish; }, set gaze(v) { gaze = v; } };
})();
