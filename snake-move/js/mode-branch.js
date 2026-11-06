// ヘビが進むしくみ — 枝をわたる（branch）。計算は js/branch.js（枝にそった動きは js/tree.js）。図もここで描く
// 横から見た枝（体・止まっている所）＋右上に、枝を正面（切り口）から見た窓（体の断面・重心・回す力と、おさえる力の上限）
'use strict';
window.MODES = window.MODES || {};
(function () {
  const $ = id => document.getElementById(id);
  const f1 = x => x.toFixed(1), f0 = x => x.toFixed(0);
  const C = { sky: '#14202c', bark: '#5c4734', barkD: '#241a12', line: 'rgba(20,12,6,.55)', body: '#3d6b4d', back: '#24392d', edge: '#a6e07a',
    stuck: '#a6e07a', move: '#7fd4ff', grav: '#ff8a7a', com: '#ffc95a', ink: '#e8f0f4', muted: '#a3b4bf' };
  const BP = { D: 0.03, side: 'both', loop: 0.04, pinch: true };
  // 見下ろす角度: 横から（35°。枝の上の左右のループも見える）／上から（90°。真上から、左右のループの形がそのまま）
  let EL = 35 * Math.PI / 180;
  // 枝のまわりの角度 a の所の、画面の上向きの高さ（枝の軸から）と、見えるか（こちらを向いているか）
  const upOf = (R, a) => R * (Math.cos(a) * Math.cos(EL) - Math.sin(a) * Math.sin(EL));
  const depOf = a => Math.sin(a + EL);
  const PHASE = ['', L('① 後ろでつかんで、まん中をのばす（頭が前へ）', '① Grip at the back, stretch the middle (head goes forward)'), L('② 前でつかむ', '② Grip at the front'), L('③ 後ろをゆるめる', '③ Loosen the back'), L('④ 前でつかんで、まん中をちぢめる（後ろが前へ）', '④ Grip at the front, pull the middle in (back comes forward)'), L('⑤ 後ろでつかむ', '⑤ Grip at the back'), L('⑥ 前をゆるめる', '⑥ Loosen the front')];

  const M = {
    id: 'branch', s: null, hist: [], speed: null,
    layers: { bstuck: true, btorque: true },
    intro: L('<b>つぎへ ▶</b> で順に見る。水平な枝の上のコーンスネーク。体を左右に曲げたループで枝の上をまたぎ、ときどき止まってつかむ（Astley & Jayne 2007）。', 'Press <b>Next ▶</b> to go step by step. A corn snake on a level branch. It straddles the branch with loops bent to the left and right, and now and then stops to grip (Astley & Jayne 2007).'),
    tour: [
      { say: L('右上の窓は、<b>枝を尾のほうから見た図</b>（切り口）。体を左右に垂らして、<b>重心（黄色の点）</b>が枝の真上からずれないようにしている。', 'The top-right window shows <b>the branch seen from the tail end</b> (its cut face). The body hangs down on both sides so the <b>center of mass (yellow dot)</b> stays right above the branch.'), ring: 'win', layers: { bstuck: false, btorque: false } },
      { say: L('進み方は木登りと同じアコーディオン。<b>緑の所が枝に止まっている</b>（足場）。ループで枝を<b>はさんで</b>つかむ。', 'It moves like an accordion, the same as tree climbing. <b>Green parts are still on the branch</b> (footholds). The loops <b>pinch</b> the branch to grip it.'), ring: 'stuck', layers: { bstuck: true, btorque: false } },
      { say: L('赤い矢印は、重さが体を<b>枝のまわりに回そうとする力</b>。止まっている所の摩擦（はさむ力で強くなる）が、これをおさえる。窓の下の棒が「上限の何%」。', 'The red arrow is the <b>turning force (twist)</b> from the weight, trying to roll the body around the branch. Friction at the still parts (stronger when pinching) holds it back. The bar under the window shows what % of the limit is used.'), ring: 'win', layers: { bstuck: true, btorque: true } },
      { say: L('<b>試してみよう</b>: 片がわだけに垂らすと…／はさまないと…（細い枝ほど、片よりが効く）', '<b>Try it</b>: hang the body on one side only... / do not pinch... (the thinner the branch, the more a lopsided body matters)'), act: [[L('片がわだけ', 'One side only'), () => UI.set('bside', 'one')], [L('はさまない', 'No pinching'), () => UI.set('bpinch', '0')], [L('もとにもどす', 'Put it back'), () => { UI.set('bside', 'both'); UI.set('bpinch', '1'); }]], layers: { bstuck: true, btorque: true } },
    ],
    make() { M.s = BRANCH.make(Object.assign({}, BP)); M.hist = []; M.speed = null; },
    reset() { M.make(); },
    baseScale: c => Math.min((c.w < 520 ? c.w : c.w - winBox(c).w - 20) * 0.9 / 1.0, c.h * 3),
    snap(c) { c.x = midX(); c.y = 0; c.pan = null; },
    follow(c, k) {
      const X = midX();
      if (!c.fix) { c.x += (X - c.x) * k; return; }
      const vw = c.w / c.s;
      if (!c.pan && Math.abs(X - c.x) > vw * 0.1) c.pan = [X + vw * 0.08, 0];
      if (c.pan) { c.x += (c.pan[0] - c.x) * k * 0.5; if (Math.abs(c.pan[0] - c.x) < vw * 0.005) c.pan = null; }
    },
    advance(dt, A) {
      const s = M.s;
      for (let left = dt; left > 1e-9; left -= 0.004) { BRANCH.step(s, Math.min(0.004, left)); M.hist.push([s.t.t, s.t.Z]); }
      while (M.hist.length && M.hist[0][0] < s.t.t - s.t.p.tau) M.hist.shift();
      if (M.hist.length > 10 && s.t.t > s.t.p.tau * 0.9) { const a = M.hist[0], b = M.hist[M.hist.length - 1]; M.speed = (b[1] - a[1]) / (b[0] - a[0]); }
      if (s.fell && s.fallT > 3) { M.reset(); A.snapCam(); A.note(L('もう一度、枝の上から', 'Again, from the top of the branch')); }
      if (s.t.Z > 4) { M.reset(); A.snapCam(); A.note(L('はじめの場所へもどした', 'Moved back to the start')); }
    },
    gy: c => c.w < 520 ? Math.max(c.h * 0.6, c.h - 78) : c.h * 0.55,
    // 広い画面では、右の窓のぶん図を左へずらす（せまい画面では窓は上、枝は下）
    sx: (c, x) => c.w / 2 + (c.w < 520 ? 0 : -(winBox(c).w + 10) / 2) + (x - c.x) * c.s,
    draw(g, c, A) {
      const s = M.s, t = s.t, p = s.p, N = BRANCH.N, R = s.R, gy = M.gy(c), k = c.s;
      g.fillStyle = C.sky; g.fillRect(0, 0, c.w, c.h);
      // 体の区切りの画面の位置: 枝にそった位置 x・見下ろした高さ（upOf）。枝の手前を向いている所（depOf > 0）は枝の前に描く
      const P = [], dep = [];
      for (let i = 0; i < N; i++) { const a = s.th[i] + s.phi; P.push([M.sx(c, t.z[i]), gy - upOf(R, a) * k]); dep.push(depOf(a)); }
      const rad = Math.max(2.5, t.p.d / 2 * k);
      body(g, P, dep, rad, false, s);
      // 枝（横から見た円柱）と木の皮のすじ（枝に止まっている目印）
      const top = gy - p.D / 2 * k, bot = gy + p.D / 2 * k;
      const gr = g.createLinearGradient(0, top, 0, bot);
      gr.addColorStop(0, '#6a543f'); gr.addColorStop(0.45, C.bark); gr.addColorStop(1, C.barkD);
      g.fillStyle = gr; g.fillRect(0, top, c.w, bot - top);
      g.strokeStyle = C.line; g.lineWidth = 1.2; g.beginPath();
      const x0 = c.x - c.w / 2 / k, x1 = c.x + c.w / 2 / k;
      for (let j = Math.floor(x0 / 0.02); j * 0.02 <= x1; j++) {
        for (let q = 0; q < 3; q++) {
          const h = DRAWG.hash(j, q, 120), th = -1.1 + 0.73 * q + 0.4 * (h - 0.5), y = gy - Math.sin(th) * p.D / 2 * k;
          const xa = M.sx(c, (j + h) * 0.02); g.moveTo(xa, y); g.lineTo(xa + (0.006 + 0.008 * h) * k, y);
        }
      }
      g.stroke();
      // 目もり（10 cm ごと。枝の下）
      g.strokeStyle = 'rgba(232,240,244,.4)'; g.fillStyle = C.muted; g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
      const lab = 0.1 * k >= 48 ? 10 : 0.2 * k >= 48 ? 20 : 50, ry = Math.min(c.h - 44, bot + 10);
      g.beginPath();
      for (let cm = Math.ceil(x0 * 100); cm <= x1 * 100; cm++) { const X = M.sx(c, cm / 100), big = cm % 10 === 0; g.moveTo(X, ry); g.lineTo(X, ry + (big ? 6 : 3)); }
      g.stroke();
      for (let cm = Math.ceil(x0 * 10) * 10; cm <= x1 * 100; cm += 10) if (cm % lab === 0) g.fillText(`${cm} cm`, M.sx(c, cm / 100), ry + 16);
      ghost(g, P, dep, rad);
      body(g, P, dep, rad, true, s);
      g.fillStyle = '#0b141c'; g.beginPath(); g.arc(P[N - 1][0] + rad * 0.4, P[N - 1][1] - rad * 0.2, Math.max(1.5, rad * 0.3), 0, 7); g.fill();
      // 止まっている所（体の上に緑の線）
      if (A.layers.bstuck) {
        g.strokeStyle = C.stuck; g.lineWidth = 3; g.beginPath();
        for (let i = 0; i < N - 1; i++) if (t.stuck[i] && t.stuck[i + 1]) { g.moveTo(P[i][0], P[i][1] - rad - 4); g.lineTo(P[i + 1][0], P[i + 1][1] - rad - 4); }
        g.stroke();
      }
      win(g, c, s, A);
      if (s.fell) {
        g.fillStyle = 'rgba(11,20,28,.85)'; g.font = '14px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
        const msg = L('枝のまわりに回って、横へ回り落ちた', 'It rolled around the branch and fell off the side'), tw = g.measureText(msg).width + 20;
        g.fillRect(c.w / 2 - tw / 2, 54, tw, 26); g.fillStyle = '#ff9a8b'; g.fillText(msg, c.w / 2, 72);
      }
      const rg = M.ring(A); if (rg) DRAWG.ring(g, rg, A.time);
    },
    ring(A) {
      const c = A.cam, s = M.s;
      if (A.ringKind === 'win') { const W = winBox(c); return { x: W.x + W.w / 2, y: W.y + W.h / 2, r: Math.max(W.w, W.h) / 2 + 6 }; }
      if (A.ringKind === 'stuck') {
        let a = -1, b = -1;
        for (let i = BRANCH.N - 1; i >= 0; i--) { if (s.t.stuck[i] && b < 0) b = i; if (b >= 0 && s.t.stuck[i]) a = i; if (b >= 0 && !s.t.stuck[i]) break; }
        if (b < 0) return null;
        return { x: M.sx(c, (s.t.z[a] + s.t.z[b]) / 2), y: M.gy(c), r: Math.max(24, (s.t.z[b] - s.t.z[a]) * c.s / 2 + 10) };
      }
      return null;
    },
    hit(px, py, A) {
      const s = M.s, c = A.cam, gy = M.gy(c);
      let best = -1, bd = 20 * 20;
      for (let i = 0; i < BRANCH.N; i++) { const a = s.th[i] + s.phi, X = M.sx(c, s.t.z[i]), Y = gy - upOf(s.R, a) * c.s, d = (X - px) ** 2 + (Y - py) ** 2; if (d < bd) { bd = d; best = i; } }
      return best;
    },
    tipPos: (i, A) => { const s = M.s; return [M.sx(A.cam, s.t.z[i]), M.gy(A.cam) - upOf(s.R, s.th[i] + s.phi) * A.cam.s]; },
    tip(i) {
      const s = M.s, t = s.t, z = t.zone[i], v = t.v[i], deg = (s.th[i] + s.phi) * 180 / Math.PI;
      const name = [L('尾', 'Tail'), L('後ろのつかみ', 'Back grip'), L('まん中（のび縮みする所）', 'Middle (stretches and shrinks)'), L('前のつかみ', 'Front grip'), L('頭', 'Head')][z];
      const st = t.stuck[i] ? L('<span style="color:var(--acc)">枝に止まっている</span>。ここの摩擦が、前へも・まわりの向きにも体を支える', '<span style="color:var(--acc)">Still on the branch</span>. Friction here holds the body both forward and against rolling') :
        Math.abs(v) < 0.001 ? L('ほとんど動いていない', 'Hardly moving') : L(`枝の上を${v > 0 ? '前' : '後ろ'}へすべっている（秒速 ${f1(Math.abs(v) * 100)} cm）`, `Sliding ${v > 0 ? 'forward' : 'backward'} on the branch (${f1(Math.abs(v) * 100)} cm/s)`);
      return L(`<b>${name}</b><br>${st}<br>枝の真上から ${Math.abs(deg) < 3 ? 'ほぼ真上' : `${deg > 0 ? '手前' : '奥'}へ ${f0(Math.abs(deg))}°`}（窓の図では${deg > 0 ? '右' : '左'}）`,
        `<b>${name}</b><br>${st}<br>From the top of the branch: ${Math.abs(deg) < 3 ? 'almost right on top' : `${f0(Math.abs(deg))}° toward the ${deg > 0 ? 'front' : 'back'}`} (${deg > 0 ? 'right' : 'left'} in the window)`);
    },
    legend: () => [[C.stuck, L('止まっている', 'Still')], [C.com, L('重心', 'Center of mass')], [C.grav, L('回そうとする力', 'Turning force')]],
    init() {
      const vb = $('bView');
      vb.onclick = () => { const top = EL < 1; EL = (top ? 90 : 35) * Math.PI / 180; vb.classList.toggle('on', top); vb.textContent = top ? L('横から', 'From the side') : L('上から', 'From above'); };
      UI.slider('bdia', v => v + ' cm', v => { BP.D = v / 100; M.make(); });
      UI.seg('bside', v => { BP.side = v; M.s.p.side = v; });
      UI.slider('bloop', v => v + ' cm', v => { BP.loop = v / 100; M.s.p.loop = v / 100; });
      UI.seg('bpinch', v => { BP.pinch = v === '1'; M.make(); });
    },
    refresh(A) {
      const r = $('ruler'), res = $('result'), s = M.s, t = s.t, p = s.p;
      const use = s.cap > 1e-12 ? Math.abs(s.tau) / s.cap : (Math.abs(s.tau) > 1e-9 ? 99 : 0);
      if (s.fell) r.innerHTML = L('<span class="bad">横へ回り落ちた！</span> 回す力が、止まっている所の摩擦をこえた', '<span class="bad">It rolled off the side!</span> The turning force beat the friction at the still parts');
      else r.innerHTML = L(`${M.speed == null ? '' : `前へ 秒速 <span class="big">${f1(M.speed * 100)}</span> cm・`}回す力 おさえる力の上限の <span class="big">${f0(Math.min(999, use * 100))}</span>%${s.rolling ? '・<span class="bad">回っている</span>' : ''}`,
        `${M.speed == null ? '' : `Forward <span class="big">${f1(M.speed * 100)}</span> cm/s · `}Turning force <span class="big">${f0(Math.min(999, use * 100))}</span>% of the holding limit${s.rolling ? ' · <span class="bad">rolling</span>' : ''}`);
      const above = s.yc > 0;
      let tx;
      if (!p.pinch) tx = L('はさまない: 体の重さで押しつける分の摩擦しかなく、止まっていられる所が少ない。体が枝の上をすべり、すべっている所はまわりの向きにもおさえが効かない。', 'No pinching: the only friction comes from the body\'s own weight pressing down, so few parts can stay still. The body slides on the branch, and sliding parts cannot hold against rolling either.');
      else if (p.side === 'one') tx = L(`片がわだけに垂らす: 重心が枝の真上から ${f1(Math.abs(s.xc) * 100)} cm ずれて、いつも同じ向きに回そうとする。おさえる摩擦の腕は枝の半径なので、細い枝ほどおさえきれない。`,
        `Hanging on one side only: the center of mass is ${f1(Math.abs(s.xc) * 100)} cm off the top of the branch, so it always tries to roll the same way. The friction holds with a lever as long as the branch radius, so thinner branches cannot hold it.`);
      else tx = L(`重心は枝の軸より ${f1(Math.abs(s.yc) * 100)} cm ${above ? '上（上にのっている＝少し回ると、回す力が増える）' : '下（ぶら下がっている＝回っても、もとにもどる）'}。左右に垂らすので、回す力はつかみなおす途中だけ出る。`,
        `The center of mass is ${f1(Math.abs(s.yc) * 100)} cm ${above ? 'above the branch axis (sitting on top, so a small roll makes the turning force grow)' : 'below the branch axis (hanging, so after a roll it swings back)'}. Because the body hangs on both sides, the turning force appears only while it changes grips.`);
      res.textContent = tx; res.classList.toggle('bad', s.fell || !p.pinch || p.side === 'one');
      $('readout').innerHTML = L(`<span>いま <b>${PHASE[t.phase || 1]}</b></span><span>回った角度 <b>${f0(s.phi * 180 / Math.PI)}°</b></span><span>止まっている所 <b>${f0(t.stuckFrac * 100)}%</b></span><span>枝のまわりの摩擦 <b>${BRANCH.MU_ROLL}</b></span>`,
        `<span>Now <b>${PHASE[t.phase || 1]}</b></span><span>Rolled angle <b>${f0(s.phi * 180 / Math.PI)}°</b></span><span>Still parts <b>${f0(t.stuckFrac * 100)}%</b></span><span>Friction around the branch <b>${BRANCH.MU_ROLL}</b></span>`);
      if (A.step.branch === 0 && !s.fell) $('say').innerHTML = `${M.intro}<br><span style="color:var(--acc)">${L('いま', 'Now')}: ${PHASE[t.phase || 1]}</span>`;
    },
  };
  const midX = () => (M.s.t.z[0] + M.s.t.z[BRANCH.N - 1]) / 2;

  function body(g, P, dep, rad, front, s) {
    const N = P.length;
    for (let pass = 0; pass < 3; pass++) {
      g.lineCap = 'round';
      for (let i = 0; i < N - 1; i++) {
        const d = 0.5 * (dep[i] + dep[i + 1]);
        if ((d >= 0) !== front) continue;
        const r = rad * (0.8 + 0.2 * Math.max(-1, Math.min(1, d)));
        if (pass === 0) { g.strokeStyle = front ? C.edge : '#4d7a5c'; g.lineWidth = 2 * r + 2.4; }
        else if (pass === 1) { g.strokeStyle = front ? C.body : C.back; g.lineWidth = 2 * r; }
        else { if (!front || i % 4) continue; g.strokeStyle = 'rgba(20,40,28,.6)'; g.lineWidth = 2 * r * 0.7; g.lineCap = 'butt'; }
        g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[i + 1][0], P[i + 1][1]); g.stroke();
      }
    }
  }
  // 枝のうしろを通る所を、枝の上にうすい点線で（木を登るのと同じ見せ方）
  function ghost(g, P, dep, rad) {
    g.save(); g.globalAlpha = 0.4; g.lineCap = 'round'; g.strokeStyle = C.edge; g.lineWidth = Math.max(1.5, rad * 1.4); g.setLineDash([Math.max(3, rad), Math.max(3, rad * 0.8)]);
    g.beginPath();
    for (let i = 0; i < P.length - 1; i++) { if (0.5 * (dep[i] + dep[i + 1]) >= 0) continue; g.moveTo(P[i][0], P[i][1]); g.lineTo(P[i + 1][0], P[i + 1][1]); }
    g.stroke(); g.restore();
  }

  // 枝を正面から見た窓
  function winBox(c) {
    const one = c.w < 520, w = Math.min(190, c.w * (one ? 0.42 : 0.3)), y = one ? 96 : 50;
    const h = one ? Math.max(90, Math.min(w + 30, M.gy(c) - 30 - y)) : Math.min(w + 30, c.h * 0.48);
    return { x: c.w - w - 10, y, w, h };
  }
  function win(g, c, s, A) {
    const W = winBox(c), t = s.t, p = s.p, N = BRANCH.N, R = s.R;
    const cx = W.x + W.w / 2, cy = W.y + 20 + (W.h - 52) / 2, k = Math.min(W.w, W.h - 52) * 0.42 / Math.max(R + t.p.d / 2, p.loop + t.p.d);
    g.save();
    g.fillStyle = 'rgba(11,20,28,.94)'; g.strokeStyle = C.muted; g.lineWidth = 1;
    g.fillRect(W.x, W.y, W.w, W.h); g.strokeRect(W.x + 0.5, W.y + 0.5, W.w - 1, W.h - 1);
    g.beginPath(); g.rect(W.x, W.y + 18, W.w, W.h - 18); g.clip();
    // 枝の切り口
    g.fillStyle = C.bark; g.strokeStyle = C.barkD; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, p.D / 2 * k, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(20,12,6,.5)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, p.D / 4 * k, 0, 7); g.stroke();
    // 体の断面（区切りごとの丸。止まっている所は緑、動く所は青）
    for (let i = 0; i < N; i += 2) {
      const a = s.th[i] + s.phi, X = cx + R * Math.sin(a) * k, Y = cy - R * Math.cos(a) * k;
      g.fillStyle = A.layers.bstuck && t.stuck[i] ? 'rgba(166,224,122,.55)' : 'rgba(127,212,255,.35)';
      g.beginPath(); g.arc(X, Y, Math.max(2, t.p.d / 2 * k), 0, 7); g.fill();
    }
    // 重心と、重さの矢印
    const gx = cx + s.xc * k, gyy = cy - s.yc * k;
    g.strokeStyle = 'rgba(255,201,90,.5)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(gx, gyy); g.stroke(); g.setLineDash([]);
    DRAWG.arrow(g, gx, gyy, gx, gyy + 26, C.grav, 2);
    g.fillStyle = C.com; g.beginPath(); g.arc(gx, gyy, 5, 0, 7); g.fill();
    // 回そうとする力（枝のまわりの矢印。長さ = 上限に対する割合）
    if (A.layers.btorque && Math.abs(s.tau) > 1e-9) {
      const use = s.cap > 1e-12 ? Math.min(1.5, Math.abs(s.tau) / s.cap) : 1.5, rr = p.D / 2 * k + t.p.d * k + 8, sg = Math.sign(s.tau);
      const a0 = -Math.PI / 2, a1 = a0 + sg * Math.max(0.15, use * 1.6);
      g.strokeStyle = C.grav; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, rr, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
      const ex = cx + rr * Math.cos(a1), ey = cy + rr * Math.sin(a1);
      DRAWG.arrow(g, ex - sg * Math.sin(a1) * -4, ey + sg * Math.cos(a1) * -4, ex + -Math.sin(a1) * sg * 6, ey + Math.cos(a1) * sg * 6, C.grav, 3);
    }
    g.restore();
    g.font = '12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left'; g.fillStyle = C.ink;
    g.fillText(L('枝を尾のほうから見る', 'View from the tail end'), W.x + 6, W.y + 14);
    // おさえる力の上限に対する、回す力の棒
    const use = s.cap > 1e-12 ? Math.abs(s.tau) / s.cap : (Math.abs(s.tau) > 1e-9 ? 9 : 0), bw = W.w - 12, by = W.y + W.h - 26;
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(W.x + 6, by, bw, 8);
    g.fillStyle = use > 1 ? C.grav : C.stuck; g.fillRect(W.x + 6, by, bw * Math.min(1, use), 8);
    g.fillStyle = use > 1 ? '#ff9a8b' : C.muted; g.font = '11px "Zen Kaku Gothic New", sans-serif';
    g.fillText(use > 1 ? L('回す力が上限をこえた', 'Twist over the limit') : L(`回す力 上限の ${f0(use * 100)}%`, `Twist ${f0(use * 100)}% of limit`), W.x + 6, by + 20);
  }

  MODES.branch = M;
})();
