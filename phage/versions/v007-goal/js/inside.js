// 細菌の中の場面: 大腸菌1つをまるごと（約2µm）。感染から破裂までを分きざみで早回し
// 座標は nm（細菌の中心が原点、Y 上）。時間 S.t は感染からの分
'use strict';

const Inside = (() => {
  const cv = document.getElementById('cvIn');
  const g = cv.getContext('2d');
  let Wpx = 1, Hpx = 1, s = 1, ox = 0, oy = 0;
  const CL = 2000, CR = 450;       // 細菌の長さと半径（nm。大腸菌 約2µm×1µm の模式）
  const INJ = { x: -380, y: CR };  // DNA が入った場所（上の膜）
  const HEADFUL = Math.round(T4.genomeBp * 1.03); // ヘッドフル（ゲノムより約3%長い。Miller ら 2003）
  const S = {};
  let ribo = [], nuc = [], nucOrder = [], early = [], t4paths = [];

  const rnd = (a, b) => a + Math.random() * (b - a);
  function inCell(x, y, m = 0) { const ax = Math.max(0, Math.abs(x) - (CL / 2 - CR)); return ax * ax + y * y < (CR - m) ** 2; }
  function randIn(m) { for (;;) { const x = rnd(-CL / 2, CL / 2), y = rnd(-CR, CR); if (inCell(x, y, m)) return { x, y }; } }

  function reset(opt = {}) {
    S.host = opt.host || S.host || 'k12';
    S.variant = opt.variant || S.variant || 'wt';
    S.t = 0; S.playing = true; S.speed = S.speed || 1;
    S.lysisT = rnd(TL.lysis[0], TL.lysis[1]);
    S.lin = false; S.failed = false; S.burst = 0; S.burstAt = null;
    S.heads = []; S.nextHead = 0; S.done = 0; S.firstDone = false;
    S.seconds = []; S.cutT = null; S.said = {};
    S.flies = []; S.hl = null;
    ribo = []; for (let i = 0; i < 380; i++) ribo.push(randIn(30));
    early = []; for (let i = 0; i < 160; i++) { const p = randIn(40); early.push({ ...p, at: rnd(0.2, TL.repl) }); }
    // 細菌の DNA（まん中のかたまり）
    nuc = []; let x = 0, y = 0, a = 0;
    for (let i = 0; i < 1400; i++) { a += rnd(-1, 1); x += Math.cos(a) * 14; y += Math.sin(a) * 14; if ((x / 560) ** 2 + (y / 230) ** 2 > 1) { a += Math.PI; x *= 0.95; y *= 0.95; } nuc.push([x, y]); }
    nucOrder = nuc.map((_, i) => i).sort(() => Math.random() - 0.5);
    // T4 の DNA（入った場所から広がる）
    t4paths = [];
    for (let c = 0; c < 26; c++) {
      const cx = c === 0 ? INJ.x : rnd(-700, 700), cy = c === 0 ? INJ.y - 60 : rnd(-260, 260), pts = []; let px = cx, py = cy, aa = rnd(0, 6.28);
      for (let i = 0; i < 90; i++) { aa += rnd(-1.1, 1.1); px += Math.cos(aa) * 9; py += Math.sin(aa) * 9; if (!inCell(px, py, 60)) { aa += Math.PI; } pts.push([px, py]); }
      t4paths.push({ pts, at: c === 0 ? 0 : TL.repl + (c / 26) * 9 + rnd(-0.5, 0.5) });
    }
    UI.clearLog('in');
    UI.log('in', `T4 の DNA が ${S.host === 'k12' ? '大腸菌 K-12' : '大腸菌 B'} の中に入った（感染 0分）。`, 'sure', 0, 'attach');
    if (S.variant === 'gt') S.cutT = 0.4;
    UI.inStatus(S);
  }

  // 1分あたりに作りはじめる頭の数（模式。最初の完成が約12〜15分、破裂までに100〜150個になるように）
  function headRate(t) { if (t < TL.late) return 0; return t < 25 ? 12 : 12 * Math.exp(-(t - 25) / 20); }

  function step(dt) {
    if (!S.playing) return;
    if (S.burstAt != null) { stepBurst(dt); return; }
    const dm = dt * S.speed, t0 = S.t; S.t += dm; const t = S.t;
    const once = (key, cond, msg, kind, z) => { if (!S.said[key] && cond) { S.said[key] = 1; UI.log('in', msg, kind, t, z); } };
    if (S.failed) { S.t = Math.min(S.t, 3); return; }
    if (S.cutT != null && t >= S.cutT) {
      S.failed = true; S.playing = false;
      UI.log('in', 'DNA にブドウ糖の目印がないので、細菌の<b>制限酵素</b>に切られた。T4 は増えられず、細菌は生き残る。', 'sure', t, 'cut');
      UI.toast('in', '切られた！'); UI.inStatus(S); return;
    }
    once('stop', t >= TL.hostStop, '細菌自身のたんぱく質が作られなくなる。工場（リボソーム）は T4 の物を作りはじめる。', 'sure', 'read');
    once('hdna', t >= TL.hostDnaFrom, '細菌の DNA をこわしはじめる（T4 の DNA の材料になる）。', 'est', 'cut');
    once('repl', t >= TL.repl, 'T4 の DNA のコピーが始まる。', 'sure', 'copy');
    once('late', t >= TL.late, '後期の遺伝子: 頭の殻・しっぽ・脚の部品が作られはじめる。', 'sure', 'read');
    // 頭を作りはじめる
    S.nextHead += headRate(t) * dm;
    while (S.nextHead >= 1 && S.heads.length < 600) {
      S.nextHead -= 1;
      const p = randIn(70), bp = Math.min(TL.packBpMax, Math.max(350, TL.packBp * (0.75 + 0.5 * Math.random())));
      const fs = t + 0.6;
      S.heads.push({ x: p.x, y: p.y, ang: rnd(0, 6.28), born: t, fs, fe: fs + HEADFUL / bp / 60, bp });
    }
    let done = 0, packing = 0;
    for (const h of S.heads) { if (t >= h.fe + 0.6) done++; else if (t >= h.fs) packing++; }
    S.done = done; S.packing = packing;
    once('pack', packing > 0, `頭の殻に DNA をつめはじめる。モーターが毎秒約${TL.packBp}塩基対で押しこむ（1つ約${(HEADFUL / TL.packBp / 60).toFixed(0)}分）。`, 'sure', 'head');
    if (!S.firstDone && done > 0) { S.firstDone = true; UI.log('in', '最初のファージが完成（頭＋しっぽ＋脚）。', 'sure', t, 'tail'); }
    once('holin', t >= 12, '内膜に穴あけのたんぱく（ホリン）がたまっていく。', 'sure', 'lysis');
    if (t >= S.lysisT) startBurst();
    UI.inStatus(S);
  }

  function startBurst() {
    S.burstAt = S.t; S.burst = 0;
    UI.log('in', `ホリンがいっせいに穴をあけ、溶菌酵素が細胞壁をとかす → <b>破裂</b>。出てきたファージ: <b>${S.done}個</b>。`, 'sure', S.t, 'lysis');
    UI.toast('in', `破裂！ ${S.done}個`);
    S.flies = S.heads.map(h => {
      const ok = S.t >= h.fe + 0.6, a = Math.atan2(h.y, h.x) + rnd(-0.6, 0.6), v = rnd(300, 900);
      return { x: h.x, y: h.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ang: h.ang, va: rnd(-2, 2), ok, f: ok ? 1 : Math.max(0, (S.t - h.fs) / (h.fe - h.fs)) };
    });
    UI.inStatus(S);
  }
  function stepBurst(dt) {
    S.burst += dt;
    for (const f of S.flies) { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.985; f.vy *= 0.985; f.ang += f.va * dt; }
    if (S.burst > 6) S.playing = false;
    UI.inStatus(S);
  }

  // あとからもう1つファージが来る
  function superinfect() {
    if (S.burstAt != null || S.failed) return;
    const t = S.t, ang = rnd(0.3, 2.8), x = Math.cos(ang) * 700, y = (Math.random() < 0.5 ? 1 : -1) * CR;
    const sec = { x, y, t, inside: t < TL.exclusion };
    S.seconds.push(sec);
    if (t < TL.exclusion) UI.log('in', '2つめのファージの DNA も中に入った（いっしょに増える）。', 'sure', t);
    else UI.log('in', '2つめのファージは付いたが、DNA は中に入れず、<b>外膜と内膜のあいだに捨てられた</b>（重感染排除）。', 'sure', t);
    if (t >= TL.lin && !S.lin) {
      S.lin = true; S.lysisT = Math.max(S.lysisT, TL.linLysis);
      UI.log('in', '外にファージがまだいる合図で、<b>破裂がおくれる</b>（溶菌阻止）。そのあいだもファージは作られつづける。', 'sure', t, 'lysis');
      UI.toast('in', '破裂がおくれる');
    }
  }

  // ---- 描く ----
  function resize() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    Wpx = Math.max(1, r.width); Hpx = Math.max(1, r.height);
    cv.width = Math.round(Wpx * dpr); cv.height = Math.round(Hpx * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    s = Math.min(Wpx / 2450, Hpx / 1350); ox = Wpx / 2; oy = Hpx / 2 + 10;
  }
  const X = x => ox + x * s, Y = y => oy - y * s;
  function cellPath(m) { g.beginPath(); g.roundRect(X(-CL / 2 + m), Y(CR - m), (CL - 2 * m) * s, (2 * CR - 2 * m) * s, (CR - m) * s); }

  function draw() {
    g.clearRect(0, 0, Wpx, Hpx);
    g.fillStyle = '#0b1a22'; g.fillRect(0, 0, Wpx, Hpx);
    const t = S.t, br = S.burstAt != null, bk = br ? Math.min(1, S.burst / 1.2) : 0;
    // 細胞
    g.save(); g.globalAlpha = 1 - bk * 0.85;
    cellPath(0); g.fillStyle = S.failed || t < TL.hostStop ? '#1b2f33' : '#232a2a'; g.fill();
    g.lineWidth = Math.max(2, 7 * s); g.strokeStyle = '#46617a'; g.stroke();
    cellPath(28); g.lineWidth = Math.max(1.5, 5 * s); g.strokeStyle = '#3f5a6d'; g.stroke();
    // 中身（細胞の中だけ）
    cellPath(30); g.save(); g.clip();
    // リボソーム
    const takeover = S.failed ? 0 : Math.min(1, t / TL.hostStop);
    g.fillStyle = `rgb(${Math.round(120 + 110 * takeover)},${Math.round(170 - 20 * takeover)},${Math.round(220 - 120 * takeover)})`;
    for (const p of ribo) g.fillRect(X(p.x) - 1, Y(p.y) - 1, 2.2, 2.2);
    // 細菌の DNA
    const hl = S.failed ? 1 : 1 - Math.max(0, Math.min(1, (t - TL.hostDnaFrom) / (TL.hostDnaTo - TL.hostDnaFrom)));
    S.hostLeft = hl;
    if (hl > 0) {
      const keep = Math.floor(nuc.length * hl), alive = new Uint8Array(nuc.length);
      for (let i = 0; i < keep; i++) alive[nucOrder[i]] = 1;
      g.strokeStyle = 'rgba(110,170,255,.75)'; g.lineWidth = Math.max(1, 1.6 * s * 2);
      g.beginPath();
      for (let i = 1; i < nuc.length; i++) if (alive[i]) { g.moveTo(X(nuc[i - 1][0]), Y(nuc[i - 1][1])); g.lineTo(X(nuc[i][0]), Y(nuc[i][1])); }
      g.stroke();
      // こわれた切れはし（材料の粒）
      if (hl < 1) { g.fillStyle = 'rgba(110,170,255,.5)'; for (let i = keep; i < Math.min(nuc.length, keep + 260); i += 3) { const [x, y] = nuc[nucOrder[i]]; g.fillRect(X(x * 1.4), Y(y * 1.6), 1.6, 1.6); } }
    }
    // 早い時期の T4 のたんぱく質
    if (!S.failed) { g.fillStyle = 'rgba(255,170,90,.85)'; for (const p of early) if (t >= p.at) g.fillRect(X(p.x) - 1.3, Y(p.y) - 1.3, 2.6, 2.6); }
    // T4 の DNA
    g.lineJoin = 'round';
    for (const p of t4paths) {
      if (t < p.at) continue;
      if (S.failed) { // 切られた
        g.strokeStyle = 'rgba(255,159,107,.7)'; g.lineWidth = Math.max(1.4, 4 * s);
        for (let i = 0; i < p.pts.length - 6; i += 9) { g.beginPath(); g.moveTo(X(p.pts[i][0]), Y(p.pts[i][1])); for (let j = 1; j < 5; j++) g.lineTo(X(p.pts[i + j][0]), Y(p.pts[i + j][1])); g.stroke(); }
        continue;
      }
      const k = Math.min(1, (t - p.at) / 1.5), n = Math.max(2, Math.floor(p.pts.length * k));
      g.strokeStyle = PCOL.dna; g.lineWidth = Math.max(1.4, 4 * s);
      g.beginPath(); g.moveTo(X(p.pts[0][0]), Y(p.pts[0][1])); for (let i = 1; i < n; i++) g.lineTo(X(p.pts[i][0]), Y(p.pts[i][1])); g.stroke();
    }
    // 2つめのファージ（中に入れたもの）
    for (const q of S.seconds) if (q.inside) { g.strokeStyle = '#ffc06b'; g.lineWidth = Math.max(1.4, 4 * s); g.beginPath(); g.arc(X(q.x * 0.8), Y(q.y * 0.6), 40 * s, 0, 5); g.stroke(); }
    // 頭・しっぽ（作りかけ → 完成）
    if (!br) for (const h of S.heads) drawHead(h, t);
    g.restore(); // clip
    // ホリン（内膜の点）
    if (!S.failed && t > 12) {
      const nH = Math.floor(Math.min(1, (t - 12) / Math.max(1, S.lysisT - 12)) * 90);
      g.fillStyle = '#ff6fa8';
      for (let i = 0; i < nH; i++) { const u = (i * 0.618) % 1; const p = perim(u, 28); g.fillRect(X(p.x) - 2, Y(p.y) - 2, 4, 4); }
    }
    // 2つめのファージ（外）と、捨てられた DNA
    for (const q of S.seconds) {
      g.save(); g.translate(X(q.x), Y(q.y + Math.sign(q.y) * 10)); g.rotate(q.y > 0 ? 0 : Math.PI); g.scale(s, s);
      drawPhageSmall(g, { fill: 0, ghost: true, sheath: T4.sheathShort, sheathW: T4.sheathWShort, plateW: T4.plateWStar });
      g.restore();
      if (!q.inside) { g.strokeStyle = '#ffc06b'; g.lineWidth = Math.max(1.2, 3 * s); g.beginPath(); for (let i = 0; i < 30; i++) { const xx = q.x - 120 + i * 8, yy = Math.sign(q.y) * (CR - 16) + Math.sin(i * 1.3) * 5; i ? g.lineTo(X(xx), Y(yy)) : g.moveTo(X(xx), Y(yy)); } g.stroke(); }
    }
    // 入ってきた最初のファージのぬけがら
    g.save(); g.translate(X(INJ.x), Y(INJ.y + 10)); g.scale(s, s);
    drawPhageSmall(g, { fill: 0, ghost: true, sheath: T4.sheathShort, sheathW: T4.sheathWShort, plateW: T4.plateWStar });
    g.restore();
    g.restore(); // alpha
    // 破裂
    if (br) for (const f of S.flies) {
      g.save(); g.translate(X(f.x), Y(f.y)); g.rotate(f.ang); g.scale(s, s);
      if (f.ok) drawPhageSmall(g, { fill: 1 }); else { g.globalAlpha = Math.max(0, 1 - S.burst / 2); drawPhageBody(g, { fill: f.f, alpha: 0.6 }); }
      g.restore();
    }
    // ルーペで見た場所
    if (S.hl && performance.now() - S.hl.at < 1800) { g.strokeStyle = '#ffe066'; g.lineWidth = 2; g.beginPath(); g.arc(X(S.hl.x), Y(S.hl.y), 26, 0, Math.PI * 2); g.stroke(); }
    drawScale();
  }

  function perim(u, m) { // 細胞のふちの上の点（u は 0〜1）
    const L = CL - 2 * CR, r = CR - m, P = 2 * L + 2 * Math.PI * r; let d = u * P;
    if (d < L) return { x: -L / 2 + d, y: r }; d -= L;
    if (d < Math.PI * r) { const a = Math.PI / 2 - d / r; return { x: L / 2 + Math.cos(a) * r, y: Math.sin(a) * r }; } d -= Math.PI * r;
    if (d < L) return { x: L / 2 - d, y: -r }; d -= L;
    const a = -Math.PI / 2 - d / r; return { x: -L / 2 + Math.cos(a) * r, y: Math.sin(a) * r };
  }

  function drawHead(h, t) {
    const k = Math.min(1, (t - h.born) / 0.6);
    g.save(); g.translate(X(h.x), Y(h.y)); g.rotate(h.ang); g.scale(s, s);
    if (t < h.fs) { g.globalAlpha = k * 0.7; drawShell(0); }
    else if (t < h.fe) { drawShell((t - h.fs) / (h.fe - h.fs)); }
    else if (t < h.fe + 0.6) { const tk = (t - h.fe) / 0.6; drawPhageBody(g, { fill: 1, alpha: 0.5 + 0.5 * tk }); }
    else drawPhageSmall(g, { fill: 1 });
    g.restore();
  }
  function drawShell(fill) { // 頭だけ（しっぽはまだ）。基盤の位置を原点にしているので、頭の位置にずらす
    drawPhageBody(g, { fill, headOnly: true });
  }
  function drawScale() {
    const x0 = 14, y0 = Hpx - 16, len = 500 * s;
    g.strokeStyle = '#e8f0f4'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + len, y0); g.moveTo(x0, y0 - 4); g.lineTo(x0, y0 + 4); g.moveTo(x0 + len, y0 - 4); g.lineTo(x0 + len, y0 + 4); g.stroke();
    g.fillStyle = '#e8f0f4'; g.font = '11px "IBM Plex Mono", monospace'; g.textBaseline = 'bottom'; g.fillText('500 nm', x0, y0 - 6);
  }

  // ---- ルーペ ----
  function pick(x, y) {
    const t = S.t;
    if (S.burstAt != null) return S.flies.some(f => f.ok && Math.hypot(f.x - x, f.y - y) < 120) ? 'phage' : null;
    for (const q of S.seconds) if (Math.hypot(q.x - x, q.y + Math.sign(q.y) * 120 - y) < 200) return 'second';
    if (Math.hypot(INJ.x - x, INJ.y + 160 - y) < 140) return 'ghost';
    for (const h of S.heads) {
      if (t < h.born) continue;
      // 頭は原点（基盤）から -y 側に約170nm。回転を戻して調べる
      const dx = x - h.x, dy = -(y - h.y), c = Math.cos(-h.ang), sn = Math.sin(-h.ang), lx = dx * c - dy * sn, ly = dx * sn + dy * c;
      if (Math.abs(lx) < 60 && ly < 40 && ly > -240) return t >= h.fe + 0.6 ? 'phage' : t >= h.fe ? 'tail' : 'head';
    }
    if (!inCell(x, y, -20)) return null;
    if (!inCell(x, y, 40)) return !S.failed && t > 12 ? 'holin' : 'envelope';
    if (S.failed) return 'cut';
    for (const p of t4paths) if (t >= p.at && p.pts.some(([px, py]) => Math.abs(px - x) < 30 && Math.abs(py - y) < 30)) return 't4Dna';
    if (S.hostLeft > 0.05 && (x / 600) ** 2 + (y / 260) ** 2 < 1) return 'hostDna';
    if (t > 0.3 && t < TL.late && Math.random() < 0.5) return 'early';
    return 'ribo';
  }
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left - ox) / s, y = (oy - (e.clientY - r.top)) / s;
    const k = pick(x, y); if (!k) return;
    S.hl = { x, y, at: performance.now() };
    UI.loupe(k === 'ghost' ? { t: '最初のファージのぬけがら', k: 'sure', b: 'DNA を入れたあとの空っぽの頭としっぽ。外に残る（ゴースト）。', z: 'attach' } : INFO[k]);
  });

  return { S, reset, step, draw, resize, superinfect, setSpeed(v) { S.speed = v; }, toggle() { if (S.failed || S.burst > 6) return; S.playing = !S.playing; UI.inStatus(S); } };
})();
