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
      follow(c, k) { c.x += (M.s.X - c.x) * k; c.y += (M.s.Y - c.y) * k; },
      advance(dt, A) {
        const s = M.s, h = s.p.tau / 200;
        let left = dt;
        while (left > 1e-9) {
          const d = Math.min(h, left);
          M.eng().step(s, d); left -= d;
          M.hist.push([s.t, s.X, s.Y]);
          if (opts.tracks) {
            // 地面にふれている所の跡（横ばいの平行な線。ふれた所に点を残す）
            M.stampT -= d;
            if (M.stampT <= 0) {
              M.stampT = s.p.tau / 40;
              for (let i = 0; i < GROUND.N; i += 2) if (s.nu[i] > 0.3 * s.p.mass * 9.81 / s.p.L) M.tracks.push([s.x[i], s.y[i]]);
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
        if (Math.hypot(s.X, s.Y) > 6) { M.reset(); A.snapCam(); A.note('はじめの場所へもどした'); }
      },
      draw(g, c, A) {
        DRAWG.scene(g, M.s, c, { layers: A.layers, trail: M.trail, tracks: opts.tracks ? M.tracks : null, wave: A.wave, ring: M.ring(A), time: A.time, scaleAt: A.scaleOn && id === 'ground' ? A.scaleAt : null });
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
        const where = i < GROUND.N * 0.15 ? '尾のあたり' : i > GROUND.N * 0.85 ? '頭のあたり' : 'まん中のあたり';
        if (id === 'side') {
          return `<b>${where}</b><br>${nu < 0.05 ? '持ち上げている（地面にふれていない）。体の中で動いている所' : `<span style="color:var(--acc)">地面にふれている</span>（押す重さ: ならしたときの ${f0(nu * 100)}%）`}<br>地面に対して 秒速 ${f1(sp * 100)} cm${nu >= 0.05 ? '（ほとんど止まっている）' : ''}${s.z ? '<br>地面からの高さ ' + f1(s.z[i] * 100) + ' cm' : ''}`;
        }
        const fwd = s.fx[i] * Math.cos(s.TH) + s.fy[i] * Math.sin(s.TH);
        return `<b>${where}</b><br>${nu < 0.3 ? '少し浮かせている' : '地面を押している'}（押す重さ: ならしたときの ${f0(nu * 100)}%）<br>地面に対して 秒速 ${f1(sp * 100)} cm、体の向きから ${f0(ang)}° の向きへすべる<br>地面からの力: ${fwd >= 0 ? '<span style="color:var(--push)">前へ押す</span>' : '<span style="color:var(--drag)">後ろへ引きずる</span>'}`;
      },
      legend(C) { return opts.legend(C); },
    };
    Object.assign(M, opts.extra || {});
    return M;
  }

  // ---------- 地面をうねる ----------
  const GP = { surf: 'cloth', lift: true, slope: 0, pick: 'cloth', dig: false };
  const ground = groundMode('ground', {
    params: () => ({ surf: GP.surf, lift: GP.lift, slope: GP.slope }),
    legend: C => [[C.press, '地面を押す'], [C.push, '前へ押す力'], [C.drag, '引きずる力'], [C.slip, 'すべる向き']],
  });
  Object.assign(ground, {
    layers: { press: true, force: true, slip: false, trail: true },
    intro: '<b>つぎへ ▶</b> で順に見る。体をタップすると、そこにはたらく力の説明。下の「試す」で地面や坂を変えられる。',
    tour: [
      { say: '<b>ヘビには足がない。</b>体の曲がりを波にして、頭から尾へ送っている。黄色の輪が波の山。', wave: true, layers: { press: false, force: false, slip: false, trail: false } },
      { say: '<b>おなかのウロコ</b>は、前へはすべりやすく、横へはすべりにくい（横は前の約1.7倍）。右下が拡大。', scale: true, layers: { press: false, force: false, slip: true, trail: false } },
      { say: '黄色い線が<b>地面を押している所</b>。強く曲がった所は少し浮かせ（明るい所・影）、まっすぐな所で押す。', ring: 'press', layers: { press: true, force: false, slip: false, trail: false } },
      { say: '矢印は<b>地面からの力（摩擦）</b>。体を横へ押すと地面が押し返す。その<b>前向きの分（緑）</b>で進む。赤は引きずる分。', ring: 'push', layers: { press: false, force: true, slip: false, trail: false } },
      { say: '青い矢印は<b>その点が地面の上をすべる向き</b>。ほとんど体にそって前へ。どの点も、頭が通った跡（点線）をなぞる。', layers: { press: false, force: false, slip: true, trail: true } },
      { say: '<b>試してみよう</b>: ウロコの向きの差をなくして、摩擦をどの向きも同じにすると…（全部べったりにすると、もっとはっきり）', act: [['どの向きも同じにする', () => UI.set('surf', 'same')], ['全部べったりも', () => { UI.set('surf', 'same'); UI.set('lift', '0'); }], ['もとにもどす', () => { UI.set('surf', 'cloth'); UI.set('lift', '1'); }]], layers: { press: true, force: true, slip: false, trail: true } },
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
      else if (U < -0.002) r.innerHTML = `<span class="bad">${p.slope > 0 ? '坂の下へすべっている' : '後ろへすべっている'}</span> 秒速 <span class="big">${f1(-U * 100)}</span> cm`;
      else r.innerHTML = `${p.slope > 0 ? '坂を上る' : p.slope < 0 ? '坂を下る' : '進む'}速さ 秒速 <span class="big">${f1(Math.abs(U) * 100)}</span> cm（1分で ${f1(Math.abs(U) * 60)} m）・1回うねるごとに体長の ${f0(Math.abs(per) * 100)}%`;
      const sf = p.surf;
      let t;
      if (sf === 'same') t = p.lift ? 'どの向きも同じ摩擦: 横へ押しても前向きの分が小さく、布のときの半分も進まない（浮かせ方のちがいで少しだけ進む）。「全部べったり」にすると、前へ進めず少し後ろへ下がる。' : 'どの向きも同じ摩擦・全部べったり: 前へ押す力より引きずる力が勝って、前へ進めず少し後ろへ下がる（波が流れる向きへ押される）。';
      else if (sf === 'board') t = 'なめらかな板: ウロコが引っかからず、前 0.14・横 0.16 とほとんど同じ。進みにくい。（石があると進める →「石のあいだ」）';
      else if (p.slope > 0) t = `坂 ${p.slope}°: 重さが後ろへ引く。${sf === 'grip' ? 'ウロコを立てて摩擦を上げている（布の約2.7倍）。' : '布の摩擦だけでは、すぐに後ろへすべる。'}`;
      else if (p.slope < 0) t = `下り坂 ${-p.slope}°: 重さが前へ引く。`;
      else if (!p.lift) t = '全部べったり: 曲がった所も地面を押すので、横へすべる摩擦が増え、少し遅くなる。';
      else t = '布（ざらざら）: 前 0.11・後ろ 0.14・横 0.19。横がいちばんすべりにくい。';
      res.textContent = t; res.classList.toggle('bad', sf === 'same' || (U != null && U < -0.002));
      $('readout').innerHTML = `<span>摩擦 前 <b>${GROUND.SURF[sf].mf}</b> 後ろ <b>${GROUND.SURF[sf].mb}</b> 横 <b>${GROUND.SURF[sf].mt}</b></span><span>体長 <b>${p.L * 100} cm</b>・重さ <b>${p.mass * 1000} g</b></span><span>1回のうねり <b>${p.tau} 秒</b></span>`;
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
    legend: C => [[C.press, 'ふれている（地面を押す）'], [C.slip, 'すべる向き'], ['#6a5638', '地面に残った跡']],
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
    g.fillText('横から見た高さ（高さは2倍）', x0 + 6, y0 + 13);
  }
  Object.assign(side, {
    layers: { press: true, force: false, slip: false, trail: false },
    intro: '<b>つぎへ ▶</b> で順に見る。砂の上のヨコバイガラガラヘビの進み方。体をタップすると、そこが地面にふれているか・動いているか。',
    tour: [
      { say: '横ばい: 体の向きに対して<b>ななめ横へ</b>進む。体は2つの波（左右と上下）を同時に送り、体の一部を<b>持ち上げて</b>いる。右上が横から見た形。', layers: { press: false, force: false, slip: false, trail: false } },
      { say: '黄色の所が<b>地面にふれている所</b>（いつも2〜3か所。まっすぐ地面に置く）。ほかは持ち上げて、アーチにして前へ運ぶ（影がずれている所）。', ring: 'press', layers: { press: true, force: false, slip: false, trail: false } },
      { say: 'ふれている所は、地面に対して<b>ほとんど止まっている</b>。動くのは持ち上げた所だけ。体の半分くらいがいつも止まっている。', ring: 'still', layers: { press: true, force: false, slip: true, trail: false } },
      { say: 'ふれた所が地面に<b>平行な線の跡</b>を残す。線の長さは体の長さくらい。本物の砂にも同じ跡が残る。', layers: { press: true, force: false, slip: false, trail: false } },
      { say: '<b>試してみよう</b>: 持ち上げを小さくすると…（アーチの所まで地面にこすれて、すべりだす）／「平面」の計算にすると…', act: [['持ち上げを小さく', () => { UI.set('sdim', '3d'); UI.setSlider('av', 0.1); }], ['平面の計算に', () => UI.set('sdim', '2d')], ['もとにもどす', () => { UI.set('sdim', '3d'); UI.setSlider('av', 1.0); }]], layers: { press: true, force: false, slip: true, trail: false } },
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
      r.innerHTML = U == null ? '' : `進む速さ 秒速 <span class="big">${f0(Math.abs(U) * 100)}</span> cm・ふれている所のすべり 体の速さの <span class="big">${f0(slipPct)}</span>%・止まっている所 体の ${f0(still / N * 100)}%`;
      let t, bad = false;
      if (SP.dim === '3d') {
        let zmax = 0; for (let i = 0; i < N; i++) zmax = Math.max(zmax, s.z[i]);
        if (SP.av < 0.35) { t = `持ち上げが小さい（いちばん高い所 ${f1(zmax * 100)} cm）: アーチの所まで地面にこすれて、ふれている所がすべる（本物の「持ち上げが足りないとすべる」）。`; bad = true; }
        else t = `立体の計算: ふれる所はまっすぐ地面に置き、持ち上げた所（いちばん高い所 ${f1(zmax * 100)} cm）をアーチにして前へ運ぶ。地面は${SP.ground3 === 'sand' ? '砂（ふれた所が約 1 cm めりこむ）' : 'かたい地面'}。`;
      } else {
        if (SP.delta < 45 || SP.delta > 135) { t = '平面の計算・2つの波のずれが小さい: 持ち上げる所と押す向きがかみあわず、ふれている所が地面の上を大きくすべる。'; bad = true; }
        else t = `平面の計算（前の版）: 体を平らな面の上の線として、持ち上げは「地面を押す重さの配り方」だけで入れている。立体の形がないので、ふれている所が1割ほどすべる（本物はほぼすべらない）。波のずれ ${SP.delta}°・ふれる長さ ${f0(SP.contact * 100)}%。`;
      }
      res.textContent = t; res.classList.toggle('bad', bad);
      $('readout').innerHTML = `<span>計算 <b>${SP.dim === '3d' ? '立体' : '平面'}</b></span><span>体長 <b>48 cm</b>・重さ <b>98 g</b></span><span>1回の波 <b>${p.tau} 秒</b>（推定）</span>`;
    },
  });

  MODES.ground = ground; MODES.side = side;
})();
