// ヘビが進むしくみ — 地面をうねる（ground）と横ばい（side）。計算は js/ground.js（横ばいの「立体」は js/side3d.js）、図は js/draw-ground.js
'use strict';
window.MODES = window.MODES || {};
(function () {
  const $ = id => document.getElementById(id);
  const f1 = x => x.toFixed(1), f0 = x => x.toFixed(0);

  // 地面の上の1匹（うねり・横ばいで共通の動かし方）
  function groundMode(id, opts) {
    const M = {
      id, s: null, trail: [], hist: [], speed: null, tracks: [], stampT: 0,
      eng: () => opts.engine ? opts.engine() : GROUND,
      make() { M.s = M.eng().make(opts.params()); M.trail = []; M.hist = []; M.speed = null; M.tracks = []; },
      reset() { M.make(); },
      baseScale: c => Math.min(c.w * 0.6, c.h * 0.95) / M.s.p.L,
      snap(c) { c.x = M.s.X; c.y = M.s.Y; },
      follow(c, k) {
        if (!c.fix) { c.x += (M.s.X - c.x) * k; c.y += (M.s.Y - c.y) * k; return; }
        // 地面に固定: ヘビが画面のはしへ近づいたら、進む向きの先へカメラを動かす（動かないあいだは地面が止まって見える）
        const vw = c.w / c.s, vh = c.h / c.s, th = M.dir != null ? M.dir : M.s.TH;
        if (!c.pan && (Math.abs(M.s.X - c.x) > vw * 0.2 || Math.abs(M.s.Y - c.y) > vh * 0.22))
          c.pan = [M.s.X + Math.cos(th) * vw * 0.16, M.s.Y + Math.sin(th) * vh * 0.16];
        if (c.pan) {
          c.x += (c.pan[0] - c.x) * k * 0.5; c.y += (c.pan[1] - c.y) * k * 0.5;
          if (Math.hypot(c.pan[0] - c.x, c.pan[1] - c.y) < vw * 0.01) c.pan = null;
        }
      },
      advance(dt, A) {
        const s = M.s, h = s.p.tau / 200;
        let left = dt;
        while (left > 1e-9) {
          const d = Math.min(h, left);
          M.eng().step(s, d); left -= d;
          M.hist.push([s.t, s.X, s.Y]);
          if (opts.tracks) {
            // 地面にふれている所の跡（横ばいは平行な線、うねりはこすれた帯。ふれた所に点を残す）
            M.stampT -= d;
            if (M.stampT <= 0) {
              M.stampT = s.p.tau / 40;
              for (let i = 0; i < GROUND.N; i += 2) if (s.nu[i] > (id === 'ground' ? 0.8 : 0.3) * s.p.mass * 9.81 / s.p.L) M.tracks.push([s.x[i], s.y[i]]);
              if (M.tracks.length > 6000) M.tracks.splice(0, M.tracks.length - 6000);
            }
          }
        }
        while (M.hist.length && M.hist[0][0] < s.t - s.p.tau) M.hist.shift();
        if (M.hist.length > 10 && s.t > s.p.tau) {
          const a = M.hist[0], b = M.hist[M.hist.length - 1], dx = b[1] - a[1], dy = b[2] - a[2];
          // 1周期で動いた距離（坂では +x = 上りへの速さ、− = 坂の下へすべる）
          M.speed = (s.p.slope ? dx : Math.hypot(dx, dy) * (opts.sideways ? 1 : Math.sign(dx * Math.cos(s.TH) + dy * Math.sin(s.TH)))) / (b[0] - a[0]);
          M.dir = Math.atan2(dy, dx);
        }
        const hx = s.x[GROUND.N - 1], hy = s.y[GROUND.N - 1], last = M.trail[M.trail.length - 1];
        if (!last || Math.hypot(hx - last[0], hy - last[1]) > 0.002) M.trail.push([hx, hy]);
        if (M.trail.length > 900) M.trail.shift();
        if (Math.hypot(s.X, s.Y) > 6) { M.reset(); A.snapCam(); A.note(L('はじめの場所へもどした', 'Moved back to the start')); }
      },
      draw(g, c, A) {
        DRAWG.scene(g, M.s, c, { look: opts.look ? opts.look(M.s) : 'sand', layers: A.layers, trail: M.trail, tracks: opts.tracks ? M.tracks : null, thinTracks: id === 'ground', ruler: true, wave: A.wave, ring: M.ring(A), time: A.time, scaleAt: A.scaleOn && id === 'ground' ? A.scaleAt : null });
        if (opts.after) opts.after(g, c, A);
      },
      ring(A) {
        const kind = A.ringKind;
        if (!kind) return null;
        const s = M.s, N = GROUND.N;
        let best = 0, bv = -1e9;
        for (let i = 4; i < N - 4; i++) {
          const v = kind === 'press' ? s.nu[i] : kind === 'still' ? -Math.hypot(s.vx[i], s.vy[i]) + (s.nu[i] > 0 ? 0 : -9) : kind === 'lift' ? -s.nu[i] - 0.001 * Math.abs(i - N / 2) : s.fx[i] * Math.cos(s.TH) + s.fy[i] * Math.sin(s.TH);
          if (v > bv) { bv = v; best = i; }
        }
        const q = DRAWG.toScreen(A.cam, s.x[best], s.y[best]);
        return { x: q[0], y: q[1], r: 26 };
      },
      hit(px, py, A) { const i = DRAWG.hitTest(M.s, A.cam, px, py); if (i >= 0 && id === 'ground') A.scaleAt = i; return i; },
      tipPos(i, A) { return DRAWG.toScreen(A.cam, M.s.x[i], M.s.y[i]); },
      tip(i) {
        const s = M.s, p = s.p, w0 = p.mass * 9.81 / p.L;
        const nu = s.nu[i] / w0, vx = s.vx[i], vy = s.vy[i], sp = Math.hypot(vx, vy);
        const ut = (vx * s.tx[i] + vy * s.ty[i]) / (sp || 1), ang = Math.acos(Math.max(-1, Math.min(1, ut))) * 180 / Math.PI;
        const where = i < GROUND.N * 0.15 ? L('尾のあたり', 'Near the tail') : i > GROUND.N * 0.85 ? L('頭のあたり', 'Near the head') : L('まん中のあたり', 'Middle of the body');
        if (id === 'side') {
          return L(`<b>${where}</b><br>${nu < 0.05 ? '持ち上げている（地面にふれていない）。体の中で動いている所' : `<span style="color:var(--acc)">地面にふれている</span>（押す重さ: ならしたときの ${f0(nu * 100)}%）`}<br>地面に対して 秒速 ${f1(sp * 100)} cm${nu >= 0.05 ? '（ほとんど止まっている）' : ''}${s.z ? '<br>地面からの高さ ' + f1(s.z[i] * 100) + ' cm' : ''}`,
          `<b>${where}</b><br>${nu < 0.05 ? 'Lifted (not touching the ground). This is the part that moves' : `<span style="color:var(--acc)">Touching the ground</span> (pressing weight: ${f0(nu * 100)}% of an even share)`}<br>Speed over the ground: ${f1(sp * 100)} cm/s${nu >= 0.05 ? ' (almost still)' : ''}${s.z ? '<br>Height above the ground: ' + f1(s.z[i] * 100) + ' cm' : ''}`);
        }
        const fwd = s.fx[i] * Math.cos(s.TH) + s.fy[i] * Math.sin(s.TH);
        return L(`<b>${where}</b><br>${nu < 0.3 ? '少し浮かせている' : '地面を押している'}（押す重さ: ならしたときの ${f0(nu * 100)}%）<br>地面に対して 秒速 ${f1(sp * 100)} cm、体の向きから ${f0(ang)}° の向きへすべる<br>地面からの力: ${fwd >= 0 ? '<span style="color:var(--push)">前へ押す</span>' : '<span style="color:var(--drag)">後ろへ引きずる</span>'}`,
          `<b>${where}</b><br>${nu < 0.3 ? 'Lifted a little' : 'Pressing on the ground'} (pressing weight: ${f0(nu * 100)}% of an even share)<br>Speed over the ground: ${f1(sp * 100)} cm/s, sliding ${f0(ang)}° off the body's direction<br>Force from the ground: ${fwd >= 0 ? '<span style="color:var(--push)">pushes forward</span>' : '<span style="color:var(--drag)">drags backward</span>'}`);
      },
      legend(C) { return opts.legend(C); },
    };
    Object.assign(M, opts.extra || {});
    return M;
  }

  // ---------- 地面をうねる ----------
  const GP = { surf: 'cloth', lift: true, slope: 0, pick: 'cloth', dig: false };
  const ground = groundMode('ground', {
    tracks: true,
    look: s => ({ cloth: 'cloth', grip: 'cloth', board: 'board', same: 'mat' })[s.p.surf] || 'sand',
    params: () => ({ surf: GP.surf, lift: GP.lift, slope: GP.slope }),
    legend: C => [[C.press, L('地面を押す', 'Presses ground')], [C.push, L('前へ押す力', 'Forward push')], [C.drag, L('引きずる力', 'Drag')], [C.slip, L('すべる向き', 'Slide direction')], ['#96784e', L('こすれた跡', 'Rub marks')]],
  });
  Object.assign(ground, {
    layers: { press: true, force: true, slip: false, trail: true },
    intro: L('<b>つぎへ ▶</b> で順に見る。体をタップすると、そこにはたらく力の説明。下の「試す」で地面や坂を変えられる。', 'Press <b>Next ▶</b> to go step by step. Tap the body to see the forces there. Use "Try it" below to change the ground or the slope.'),
    tour: [
      { say: L('<b>ヘビには足がない。</b>体の曲がりを波にして、頭から尾へ送っている。黄色の輪が波の山。', '<b>Snakes have no legs.</b> They make a wave of bends and send it from head to tail. The yellow rings mark the wave peaks.'), wave: true, layers: { press: false, force: false, slip: false, trail: false } },
      { say: L('<b>おなかのウロコ</b>は、前へはすべりやすく、横へはすべりにくい（横は前の約1.7倍）。右下が拡大。', 'The <b>belly scales</b> slide easily forward but not sideways (sideways friction is about 1.7 times forward). Close-up at bottom right.'), scale: true, layers: { press: false, force: false, slip: true, trail: false } },
      { say: L('黄色い線が<b>地面を押している所</b>。強く曲がった所は少し浮かせ（明るい所・影）、まっすぐな所で押す。', 'The yellow line shows <b>where the body presses on the ground</b>. Sharp bends are lifted a little (bright parts with a shadow); the straighter parts press down.'), ring: 'press', layers: { press: true, force: false, slip: false, trail: false } },
      { say: L('矢印は<b>地面からの力（摩擦）</b>。体を横へ押すと地面が押し返す。その<b>前向きの分（緑）</b>で進む。赤は引きずる分。', 'The arrows are <b>forces from the ground (friction)</b>. When the body pushes sideways, the ground pushes back. The <b>forward part (green)</b> moves the snake ahead. Red is the drag.'), ring: 'push', layers: { press: false, force: true, slip: false, trail: false } },
      { say: L('青い矢印は<b>その点が地面の上をすべる向き</b>。前だけでなく<b>横へもすべる</b>（茶色のこすれた跡）。平らな布の上では本物もこう: 波が送る分の約半分しか進まない（Hu 2009）。草や石があると、それを押して横すべりが止まり、体は頭の通った道をなぞる（Gray 1946・Jayne 2020）。', 'Blue arrows show <b>which way each point slides over the ground</b>. It slides not only forward but <b>also sideways</b> (brown rub marks). Real snakes on flat cloth do this too: they go only about half as far as the wave travels (Hu 2009). With grass or stones to push on, the sideways slide stops and the body follows the path of the head (Gray 1946, Jayne 2020).'), layers: { press: false, force: false, slip: true, trail: true } },
      { say: L('<b>試してみよう</b>: ウロコの向きの差をなくして、摩擦をどの向きも同じにすると…（全部べったりにすると、もっとはっきり）', '<b>Try it</b>: take away the difference the scales make, so friction is the same in every direction... (laying the whole body flat makes it even clearer)'), act: [[L('どの向きも同じにする', 'Same in every direction'), () => UI.set('surf', 'same')], [L('全部べったりも', 'Also lay it all flat'), () => { UI.set('surf', 'same'); UI.set('lift', '0'); }], [L('もとにもどす', 'Put it back'), () => { UI.set('surf', 'cloth'); UI.set('lift', '1'); }]], layers: { press: true, force: true, slip: false, trail: true } },
    ],
    init() {
      const apply = () => { GP.surf = GP.pick === 'cloth' && GP.dig ? 'grip' : GP.pick; ground.s.p.surf = GP.surf; };
      UI.seg('surf', v => { GP.pick = v; apply(); });
      UI.seg('lift', v => { GP.lift = v === '1'; ground.s.p.lift = GP.lift; });
      UI.seg('dig', v => { GP.dig = v === '1'; apply(); });
      UI.slider('slope', v => v + '°', v => { GP.slope = v; ground.s.p.slope = v; });
    },
    refresh(A) {
      const r = $('ruler'), res = $('result'), s = ground.s, p = s.p, U = ground.speed;
      const per = U * p.tau / p.L;
      if (U == null) r.textContent = '';
      else if (U < -0.002) r.innerHTML = L(`<span class="bad">${p.slope > 0 ? '坂の下へすべっている' : '後ろへすべっている'}</span> 秒速 <span class="big">${f1(-U * 100)}</span> cm`,
        `<span class="bad">${p.slope > 0 ? 'Sliding down the slope' : 'Sliding backward'}</span> <span class="big">${f1(-U * 100)}</span> cm/s`);
      else r.innerHTML = L(`${p.slope > 0 ? '坂を上る' : p.slope < 0 ? '坂を下る' : '進む'}速さ 秒速 <span class="big">${f1(Math.abs(U) * 100)}</span> cm（1分で ${f1(Math.abs(U) * 60)} m）・1回うねるごとに体長の ${f0(Math.abs(per) * 100)}%`,
        `${p.slope > 0 ? 'Climbing speed' : p.slope < 0 ? 'Downhill speed' : 'Speed'} <span class="big">${f1(Math.abs(U) * 100)}</span> cm/s (${f1(Math.abs(U) * 60)} m per minute) · ${f0(Math.abs(per) * 100)}% of body length per wave`);
      const sf = p.surf;
      let t;
      if (sf === 'same') t = p.lift ? L('どの向きも同じ摩擦: 横へ押しても前向きの分が小さく、布のときの半分も進まない（浮かせ方のちがいで少しだけ進む）。「全部べったり」にすると、前へ進めず少し後ろへ下がる。', 'Same friction in every direction: pushing sideways gives only a small forward part, so it goes less than half as far as on cloth (it moves a little only because some parts are lifted). Lay it all flat and it cannot go forward; it slips back a little.') : L('どの向きも同じ摩擦・全部べったり: 前へ押す力より引きずる力が勝って、前へ進めず少し後ろへ下がる（波が流れる向きへ押される）。', 'Same friction in every direction, all flat: the drag beats the forward push, so it cannot go forward and slips back a little (pushed the way the wave flows).');
      else if (sf === 'board') t = L('なめらかな板: ウロコが引っかからず、前 0.14・横 0.16 とほとんど同じ。進みにくい（本物のヘビも、なめらかな板ではうまく進めなかった）。石や草があれば、それを押して進める（Gray 1946）。', 'Smooth board: the scales cannot catch, so forward 0.14 and sideways 0.16 are almost the same. Hard to move (real snakes also did poorly on smooth boards). With stones or grass, it can push on them to move (Gray 1946).');
      else if (p.slope > 0) t = L(`坂 ${p.slope}°: 重さが後ろへ引く。${sf === 'grip' ? 'ウロコを立てて摩擦を上げている（布の約2.7倍）。' : '布の摩擦だけでは、すぐに後ろへすべる。'}`,
        `Slope ${p.slope}°: gravity pulls it back. ${sf === 'grip' ? 'The scales are raised to grip harder (about 2.7 times cloth).' : 'Cloth friction alone is not enough; it soon slides back.'}`);
      else if (p.slope < 0) t = L(`下り坂 ${-p.slope}°: 重さが前へ引く。`, `Downhill ${-p.slope}°: gravity pulls it forward.`);
      else if (!p.lift) t = L('全部べったり: 曲がった所も地面を押すので、横へすべる摩擦が増え、少し遅くなる。', 'All flat: the bends press on the ground too, so there is more sideways sliding friction and it is a little slower.');
      else t = L('布（ざらざら）: 前 0.11・後ろ 0.14・横 0.19。横がいちばんすべりにくい。', 'Cloth (rough): forward 0.11, backward 0.14, sideways 0.19. Sideways is the hardest to slide.');
      res.textContent = t; res.classList.toggle('bad', sf === 'same' || (U != null && U < -0.002));
      $('readout').innerHTML = L(`<span>摩擦 前 <b>${GROUND.SURF[sf].mf}</b> 後ろ <b>${GROUND.SURF[sf].mb}</b> 横 <b>${GROUND.SURF[sf].mt}</b></span><span>体長 <b>${p.L * 100} cm</b>・重さ <b>${p.mass * 1000} g</b></span><span>1回のうねり <b>${p.tau} 秒</b></span>`,
        `<span>Friction: forward <b>${GROUND.SURF[sf].mf}</b> backward <b>${GROUND.SURF[sf].mb}</b> sideways <b>${GROUND.SURF[sf].mt}</b></span><span>Length <b>${p.L * 100} cm</b> · weight <b>${p.mass * 1000} g</b></span><span>One wave <b>${p.tau} s</b></span>`);
    },
  });

  // ---------- 横ばい ----------
  // ヨコバイガラガラヘビ（Marvi ほか 2014: 48 cm・98 g、2つの波の位相のずれ 1.51 rad、跡と進む向きの角度 33 ± 8°。Astley ほか 2015: 止まっている所 44%）
  // 計算は2つから選べる: 立体（js/side3d.js。持ち上げた形・めりこみ・傾きまで）と、平面（js/ground.js。前の版。持ち上げは重さの配り方だけ）
  const SP = { dim: '3d', surf: 'same', delta: 87, contact: 0.3, c3: 0.4, av: 1.0, ground3: 'sand' };
  const side = groundMode('side', {
    engine: () => SP.dim === '3d' ? SIDE3D : GROUND,
    params: () => SP.dim === '3d'
      ? { contact: SP.c3, Av: SP.av, sink: SP.ground3 === 'sand' ? 0.004 : 0.001 }
      : { gait: 'side', L: 0.48, mass: 0.098, tau: 2, k: 4, alpha: 18, surf: SP.surf, delta: SP.delta * Math.PI / 180, contact: SP.contact, lift: true },
    tracks: true, sideways: true,
    look: () => SP.dim === '3d' ? (SP.ground3 === 'sand' ? 'sand' : 'hard') : (SP.surf === 'cloth' ? 'cloth' : 'sand'),   // 平面の版の「どの向きも同じ」は砂とみなした地面
    legend: C => [[C.press, L('ふれている（地面を押す）', 'Touching (presses ground)')], [C.slip, L('すべる向き', 'Slide direction')], ['#6a5638', L('地面に残った跡', 'Tracks left on ground')]],
    after: (g, c) => { if (SP.dim === '3d') elevation(g, c, side.s); },
  });
  // 横から見た体の高さ（右上の小窓）: 体の向き（平均）にそって並べ、高さは 2倍に
  function elevation(g, c, s) {
    const N = SIDE3D.N, w = Math.min(230, c.w * 0.5), h = 58, x0 = c.w - w - 10, y0 = 50;
    g.fillStyle = 'rgba(11,20,28,.86)'; g.fillRect(x0, y0, w, h);
    const ux = Math.cos(s.TH), uy = Math.sin(s.TH);
    const u = Array.from(s.x, (x, i) => (x - s.X) * ux + (s.y[i] - s.Y) * uy), lo = Math.min(...u), hi = Math.max(...u);
    const k = (w - 16) / Math.max(1e-6, hi - lo), gy = y0 + h - 12;
    g.strokeStyle = '#6a5638'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + 6, gy + 3); g.lineTo(x0 + w - 6, gy + 3); g.stroke();
    for (let i = 0; i < N - 1; i++) {
      g.strokeStyle = s.nu[i] > 0 ? '#ffc95a' : '#a6e07a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x0 + 8 + (u[i] - lo) * k, gy - s.z[i] * k * 2); g.lineTo(x0 + 8 + (u[i + 1] - lo) * k, gy - s.z[i + 1] * k * 2); g.stroke();
    }
    g.fillStyle = '#a3b4bf'; g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left';
    g.fillText(L('横から見た高さ（高さは2倍）', 'Side view (height x2)'), x0 + 6, y0 + 13);
  }
  Object.assign(side, {
    layers: { press: true, force: false, slip: false, trail: false },
    intro: L('<b>つぎへ ▶</b> で順に見る。砂の上のヨコバイガラガラヘビの進み方。体をタップすると、そこが地面にふれているか・動いているか。', 'Press <b>Next ▶</b> to go step by step. How a sidewinder rattlesnake moves on sand. Tap the body to see whether that part touches the ground or is moving.'),
    tour: [
      { say: L('横ばい: 体の向きに対して<b>ななめ横へ</b>進む。体は2つの波（左右と上下）を同時に送り、体の一部を<b>持ち上げて</b>いる。右上が横から見た形。', 'Sidewinding: the snake moves <b>sideways at a slant</b> to its body. The body sends two waves at once (side to side and up and down) and <b>lifts</b> parts of itself. Top right shows the side view.'), layers: { press: false, force: false, slip: false, trail: false } },
      { say: L('黄色の所が<b>地面にふれている所</b>（いつも2〜3か所。まっすぐ地面に置く）。ほかは持ち上げて、アーチにして前へ運ぶ（影がずれている所）。', 'Yellow parts are <b>touching the ground</b> (always 2 to 3 places, set straight down). The rest is lifted into arches and carried forward (where the shadow is shifted).'), ring: 'press', layers: { press: true, force: false, slip: false, trail: false } },
      { say: L('ふれている所は、地面に対して<b>ほとんど止まっている</b>。動くのは持ち上げた所だけ。体の半分くらいがいつも止まっている。', 'The touching parts are <b>almost still</b> on the ground. Only the lifted parts move. About half the body is always still.'), ring: 'still', layers: { press: true, force: false, slip: true, trail: false } },
      { say: L('ふれた所が地面に<b>平行な線の跡</b>を残す。線の長さは体の長さくらい。本物の砂にも同じ跡が残る。', 'The touching parts leave <b>parallel line tracks</b> on the ground. Each line is about as long as the body. Real sand shows the same tracks.'), layers: { press: true, force: false, slip: false, trail: false } },
      { say: L('<b>試してみよう</b>: 持ち上げを小さくすると…（アーチの所まで地面にこすれて、すべりだす）／「平面」の計算にすると…', '<b>Try it</b>: lift the body less... (even the arches rub the ground and it starts to slide) / or switch to the "flat" calculation...'), act: [[L('持ち上げを小さく', 'Lift less'), () => { UI.set('sdim', '3d'); UI.setSlider('av', 0.1); }], [L('平面の計算に', 'Flat calculation'), () => UI.set('sdim', '2d')], [L('もとにもどす', 'Put it back'), () => { UI.set('sdim', '3d'); UI.setSlider('av', 1.0); }]], layers: { press: true, force: false, slip: true, trail: false } },
    ],
    init() {
      UI.seg('sdim', v => {
        SP.dim = v; side.make();
        document.querySelectorAll('.d3').forEach(e => { e.hidden = v !== '3d'; });
        document.querySelectorAll('.d2').forEach(e => { e.hidden = v !== '2d'; });
      });
      UI.seg('ssurf', v => { SP.surf = v; if (SP.dim === '2d') side.s.p.surf = v; });
      UI.seg('sground', v => { SP.ground3 = v; if (SP.dim === '3d') side.s.p.sink = v === 'sand' ? 0.004 : 0.001; });
      UI.slider('delta', v => v + '°', v => { SP.delta = v; if (SP.dim === '2d') side.s.p.delta = v * Math.PI / 180; });
      UI.slider('contact', v => Math.round(v * 100) + '%', v => { SP.contact = v; if (SP.dim === '2d') side.s.p.contact = v; });
      UI.slider('c3', v => Math.round(v * 100) + '%', v => { SP.c3 = v; if (SP.dim === '3d') side.s.p.contact = v; });
      UI.slider('av', v => Math.round(v * 57.3) + '°', v => { SP.av = v; if (SP.dim === '3d') side.s.p.Av = v; });
    },
    refresh(A) {
      const r = $('ruler'), res = $('result'), s = side.s, p = s.p, U = side.speed, N = GROUND.N;
      // ふれている所のすべり（体の速さに対して）と、止まっている所の割合
      let sl = 0, sw = 0, still = 0;
      for (let i = 0; i < N; i++) { const v = Math.hypot(s.vx[i], s.vy[i]); if (s.nu[i] > 0) { sl += v * s.nu[i]; sw += s.nu[i]; } if (U && v < 0.1 * Math.abs(U)) still++; }
      const slipPct = U && sw ? (sl / sw) / Math.abs(U) * 100 : 0;
      r.innerHTML = U == null ? '' : L(`進む速さ 秒速 <span class="big">${f0(Math.abs(U) * 100)}</span> cm・ふれている所のすべり 体の速さの <span class="big">${f0(slipPct)}</span>%・止まっている所 体の ${f0(still / N * 100)}%`,
        `Speed <span class="big">${f0(Math.abs(U) * 100)}</span> cm/s · slip where touching: <span class="big">${f0(slipPct)}</span>% of body speed · still parts: ${f0(still / N * 100)}% of the body`);
      let t, bad = false;
      if (SP.dim === '3d') {
        let zmax = 0; for (let i = 0; i < N; i++) zmax = Math.max(zmax, s.z[i]);
        if (SP.av < 0.35) { t = L(`持ち上げが小さい（いちばん高い所 ${f1(zmax * 100)} cm）: アーチの所まで地面にこすれて、ふれている所がすべる（本物の「持ち上げが足りないとすべる」）。`,
          `Lifted too little (highest point ${f1(zmax * 100)} cm): even the arches rub the ground, so the touching parts slide (like real snakes: "not enough lift means slipping").`); bad = true; }
        else t = L(`立体の計算: ふれる所はまっすぐ地面に置き、持ち上げた所（いちばん高い所 ${f1(zmax * 100)} cm）をアーチにして前へ運ぶ。地面は${SP.ground3 === 'sand' ? '砂（ふれた所が約 1 cm めりこむ）' : 'かたい地面'}。`,
          `3D calculation: touching parts are set straight down; lifted parts (highest point ${f1(zmax * 100)} cm) are carried forward as arches. Ground: ${SP.ground3 === 'sand' ? 'sand (touching parts sink about 1 cm)' : 'hard ground'}.`);
      } else {
        if (SP.delta < 45 || SP.delta > 135) { t = L('平面の計算・2つの波のずれが小さい: 持ち上げる所と押す向きがかみあわず、ふれている所が地面の上を大きくすべる。', 'Flat calculation, small shift between the two waves: the lifted parts and the push direction do not fit together, so the touching parts slide a lot over the ground.'); bad = true; }
        else t = L(`平面の計算（前の版）: 体を平らな面の上の線として、持ち上げは「地面を押す重さの配り方」だけで入れている。立体の形がないので、ふれている所が1割ほどすべる（本物はほぼすべらない）。波のずれ ${SP.delta}°・ふれる長さ ${f0(SP.contact * 100)}%。`,
          `Flat calculation (older version): the body is a line on a flat surface, and lifting is shown only by how its weight is spread on the ground. With no 3D shape, the touching parts slide about 10% (real snakes hardly slide). Wave shift ${SP.delta}° · touching length ${f0(SP.contact * 100)}%.`);
      }
      res.textContent = t; res.classList.toggle('bad', bad);
      $('readout').innerHTML = L(`<span>計算 <b>${SP.dim === '3d' ? '立体' : '平面'}</b></span><span>体長 <b>48 cm</b>・重さ <b>98 g</b></span><span>1回の波 <b>${p.tau} 秒</b>（推定）</span>`,
        `<span>Calculation <b>${SP.dim === '3d' ? '3D' : 'flat'}</b></span><span>Length <b>48 cm</b> · weight <b>98 g</b></span><span>One wave <b>${p.tau} s</b> (estimate)</span>`);
    },
  });

  MODES.ground = ground; MODES.side = side;
})();
