// ヘビが進むしくみ — 石のあいだ（stones）。計算は js/stones.js。図もここで描く（上から見る）
'use strict';
window.MODES = window.MODES || {};
(function () {
  const $ = id => document.getElementById(id);
  const f2 = x => x.toFixed(2), f1 = x => x.toFixed(1), f0 = x => x.toFixed(0);
  const C = { board: '#1b2530', dot: 'rgba(170,200,220,.10)', path: 'rgba(255,201,90,.28)', stone: '#7d8794', stoneOn: '#cfd8e0', body: '#3d6b4d', edge: '#a6e07a',
    push: '#a6e07a', drag: '#ff8a7a', slip: '#7fd4ff', ink: '#e8f0f4', muted: '#a3b4bf' };
  const PUSH = 0.25;      // 押す力の矢印: 体重と同じ力で 25 cm（目印）
  const SP = { surf: 'board', preset: 'every' };
  const W = (c, x, y) => DRAWG.toScreen(c, x, y);

  const M = {
    id: 'stones', s: null,
    layers: { spush: true, sdrag: true, path: true },
    intro: '<b>つぎへ ▶</b> で順に見る。なめらかな板に石（くい）を立てた所。地面をタップすると石を置く・石をタップすると取る。',
    tour: [
      { say: 'なめらかな板の上でも、<b>石があれば進める</b>。体は石のあいだの S 字の道（黄色の点線）をなぞる。', layers: { spush: false, sdrag: false, path: true } },
      { say: '緑の矢印は、<b>石が体を押す力</b>。体が曲がりの外がわで石を押し、押し返された力の前向きの分で進む。', ring: 'push', layers: { spush: true, sdrag: false, path: true } },
      { say: '赤い矢印は地面の摩擦（体にそって後ろ向き）。<b>石が押す力の合計が、この摩擦とつりあう</b>。回そうとする力もつりあう。', layers: { spush: true, sdrag: true, path: true } },
      { say: '<b>止まっているのは「形」</b>。S 字の形は地面に止まったままで、体がその中を列車のようにすべっていく。横へはすべらない。', layers: { spush: false, sdrag: false, path: true } },
      { say: '<b>試してみよう</b>: 石を減らすと…（押せる石が3つそろわないと、前へ押せない）', act: [['石を減らす', () => UI.set('preset', 'half')], ['もとにもどす', () => UI.set('preset', 'every')]], layers: { spush: true, sdrag: true, path: true } },
    ],
    make() { M.s = STONES.make({ surf: SP.surf, preset: SP.preset }); },
    reset() { M.make(); },
    baseScale: c => Math.min(c.w * 0.6, c.h * 1.6) / M.s.p.L,
    snap(c) { c.x = M.s.cx; c.y = 0; },
    follow(c, k) { c.x += (M.s.cx - c.x) * k; c.y += (0 - c.y) * k; },
    advance(dt, A) {
      const s = M.s;
      let left = dt;
      while (left > 1e-9) { const d = Math.min(0.01, left); STONES.step(s, d); left -= d; }
      if (s.cx > 6) { M.reset(); A.snapCam(); A.note('はじめの場所へもどした'); }
    },
    draw(g, c, A) {
      const s = M.s, N = STONES.N, p = s.p;
      g.fillStyle = C.board; g.fillRect(0, 0, c.w, c.h);
      const x0 = c.x - c.w / 2 / c.s, x1 = c.x + c.w / 2 / c.s, y0 = c.y - c.h / 2 / c.s, y1 = c.y + c.h / 2 / c.s;
      g.fillStyle = C.dot;
      for (let x = Math.floor(x0 / 0.02) * 0.02; x <= x1; x += 0.02) for (let y = Math.floor(y0 / 0.02) * 0.02; y <= y1; y += 0.02) { const q = W(c, x, y); g.fillRect(q[0] - 1, q[1] - 1, 2, 2); }
      // 道（体がなぞる S 字。目印）
      if (A.layers.path) {
        g.strokeStyle = C.path; g.lineWidth = 2; g.setLineDash([5, 6]); g.beginPath();
        let first = true;
        for (let x = x0 - 0.02; x <= x1 + 0.02; x += 0.002) { const q = W(c, x, p.A * Math.sin(2 * Math.PI * x / p.lam)); first ? g.moveTo(q[0], q[1]) : g.lineTo(q[0], q[1]); first = false; }
        g.stroke(); g.setLineDash([]);
      }
      // 石
      const on = new Set(s.contacts.filter(k => k.N > 0).map(k => k.st));
      const touch = new Set(s.contacts.map(k => k.st));
      for (const st of s.stones) {
        const q = W(c, st.x, st.y);
        if (q[0] < -30 || q[0] > c.w + 30) continue;  // 画面の外
        g.fillStyle = on.has(st) ? C.stoneOn : C.stone;
        g.beginPath(); g.arc(q[0], q[1], STONES.RS * c.s, 0, 7); g.fill();
        if (touch.has(st)) { g.strokeStyle = on.has(st) ? C.edge : C.muted; g.lineWidth = 2; g.stroke(); }
      }
      // 体
      const P = []; for (let i = 0; i < N; i++) P.push(W(c, s.x[i], s.y[i]));
      for (let pass = 0; pass < 2; pass++) {
        g.lineCap = 'round';
        for (let i = 0; i < N - 1; i++) {
          const r = DRAWG.radius(i, N, c);
          g.strokeStyle = pass ? C.body : C.edge; g.lineWidth = 2 * (pass ? r : r + 1.2);
          g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[i + 1][0], P[i + 1][1]); g.stroke();
        }
      }
      g.fillStyle = '#0b141c';
      const er = Math.max(1.5, DRAWG.radius(N - 1, N, c) * 0.35), tx = s.tx[N - 1], ty = -s.ty[N - 1];
      for (const sg of [-1, 1]) { g.beginPath(); g.arc(P[N - 1][0] - tx * er + sg * -ty * er * 1.4, P[N - 1][1] - ty * er + sg * tx * er * 1.4, er, 0, 7); g.fill(); }
      const w0 = p.mass * 9.81 / p.L, Wt = p.mass * 9.81;
      // 地面の摩擦（体にそって後ろ向き）
      if (A.layers.sdrag && s.U > 0) {
        const k = 0.12 * c.s / w0;
        for (let i = 3; i < N; i += 6) DRAWG.arrow(g, P[i][0], P[i][1], P[i][0] + s.fx[i] * k, P[i][1] - s.fy[i] * k, C.drag, 2);
      }
      // 石が体を押す力
      if (A.layers.spush) {
        const k = PUSH * c.s / Wt;
        for (const ct of s.contacts) {
          if (ct.N / Wt < 0.005) continue;
          const bx = s.x[ct.i] - ct.nx * STONES.RB, by = s.y[ct.i] - ct.ny * STONES.RB, q = W(c, bx, by);
          const L = Math.max(14, ct.N * k);
          DRAWG.arrow(g, q[0] - ct.nx * L, q[1] + ct.ny * L, q[0], q[1], C.push, 3);
          g.fillStyle = C.push; g.font = '12px "IBM Plex Mono", monospace'; g.textAlign = 'center';
          g.fillText(`${f2(ct.N / Wt)}`, q[0] - ct.nx * (L + 10), q[1] + ct.ny * (L + 10) + 4);
        }
      }
      if (!s.ok) {
        g.fillStyle = 'rgba(11,20,28,.85)'; g.font = '14px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
        const t = `止まった: ${s.why}。地面をタップして石を置いてみよう`, tw = g.measureText(t).width + 20;
        g.fillRect(c.w / 2 - tw / 2, c.h - 70, tw, 26); g.fillStyle = '#ff9a8b'; g.fillText(t, c.w / 2, c.h - 52);
      }
      const rg = M.ring(A); if (rg) DRAWG.ring(g, rg, A.time);
    },
    ring(A) {
      if (A.ringKind !== 'push') return null;
      const s = M.s; let b = null;
      for (const ct of s.contacts) if (!b || ct.N > b.N) b = ct;
      if (!b || b.N <= 0) return null;
      const q = W(A.cam, s.x[b.i], s.y[b.i]);
      return { x: q[0], y: q[1], r: 30 };
    },
    hit(px, py, A) {
      const c = A.cam, wx = c.x + (px - c.w / 2) / c.s, wy = c.y - (py - c.h / 2) / c.s, s = M.s;
      // 石の上 → 取る、体の上 → 説明、ほか → 石を置く
      for (const st of s.stones) if (Math.hypot(st.x - wx, st.y - wy) < STONES.RS + 6 / c.s) { STONES.toggleStone(s, wx, wy, 6 / c.s); A.note('石を取った'); return -1; }
      let bi = -1, bd = Math.max(6 / c.s, STONES.RB + 0.002);   // 体の上だけ（石の置き場をじゃましない）
      for (let i = 0; i < STONES.N; i++) { const d = Math.hypot(s.x[i] - wx, s.y[i] - wy); if (d < bd) { bd = d; bi = i; } }
      if (bi >= 0) return bi;
      STONES.toggleStone(s, wx, wy, 0); A.note('石を置いた');
      return -1;
    },
    tipPos: (i, A) => W(A.cam, M.s.x[i], M.s.y[i]),
    tip(i) {
      const s = M.s, W0 = s.p.mass * 9.81;
      const ct = s.contacts.find(k => Math.abs(k.i - i) <= 2);
      return `<b>${i < STONES.N * 0.15 ? '尾のあたり' : i > STONES.N * 0.85 ? '頭のあたり' : 'まん中のあたり'}</b><br>${s.U > 0 ? `道にそって前へすべっている（秒速 ${f1(s.U * 100)} cm、横すべりなし）` : '止まっている'}<br>${ct ? (ct.N > 0 ? `<span style="color:var(--push)">石に押されている</span>: 体重の ${f2(ct.N / W0)} 倍` : '石にふれているが、いまは押していない') : '地面の摩擦だけ（後ろ向き）'}`;
    },
    legend: () => [[C.push, '石が押す力（数字は体重の何倍）'], [C.drag, '地面の摩擦'], [C.path, '体がなぞる道']],
    init() {
      UI.seg('tsurf', v => { SP.surf = v; M.s.p.surf = v; });
      UI.seg('preset', v => { SP.preset = v; STONES.placePreset(M.s, v); });
    },
    refresh(A) {
      const r = $('ruler'), res = $('result'), s = M.s, Wt = s.p.mass * 9.81;
      const used = s.contacts.filter(k => k.N > 0).length;
      r.innerHTML = s.ok ? `進む速さ 秒速 <span class="big">${f1(s.U * 100)}</span> cm（横すべりなし）・石が押す力の合計 体重の <span class="big">${f2(s.Nsum / Wt)}</span> 倍（${used} つの石）` : `<span class="bad">止まっている</span>: ${s.why}`;
      const sf = GROUND.SURF[s.p.surf];
      res.textContent = s.ok ? `地面の摩擦（前へ ${sf.mf}）が体を後ろへ引く分を、石が押して取りもどす。${s.p.surf === 'same' ? 'ウロコの向きの差がなくても、石があれば進める。' : ''}地面が${s.p.surf === 'cloth' ? '布だと摩擦が小さく、押す力も小さくてすむ。' : 'すべりやすいほど、押す力は小さくてすむ。'}`
        : '押す力は「押す」だけで「引く」ことはできない。前へ・横へ・回る向きの3つをつりあわせるには、ふつう3つの石がいる（Gray 1946）。';
      res.classList.toggle('bad', !s.ok);
      $('readout').innerHTML = `<span>ふれている石 <b>${s.contacts.length}</b></span><span>押している石 <b>${used}</b></span><span>地面の摩擦の合計 体重の <b>${f2(s.drag / Wt)}</b> 倍</span><span>道 波長 <b>${s.p.lam * 100} cm</b>・ふれはば <b>${s.p.A * 100} cm</b></span>`;
    },
  };
  MODES.stones = M;
})();
