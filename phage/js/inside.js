// 細菌の中の場面: 大腸菌1つをまるごと（約2µm）。感染から破裂までを分きざみで早回し
// 座標は nm（細菌の中心が原点、Y 上）。時間 S.t は感染からの分
// 増えるしくみを目で追えるように: 細菌の DNA をこわした材料 → T4 の DNA（設計図）のコピー → 写し（mRNA）→ 細菌の工場（リボソーム）
// → 部品（頭の殻・しっぽ）が組み立ての場所へ流れる → 頭に DNA をつめる → しっぽが寄ってきて付く → 完成。点1つは、たくさんの分子の代わり（模式）
'use strict';

const Inside = (() => {
  const cv = document.getElementById('cvIn');
  const g = cv.getContext('2d');
  let Wpx = 1, Hpx = 1, s = 1, ox = 0, oy = 0;
  const CL = 2000, CR = 450;       // 細菌の長さと半径（nm。大腸菌 約2µm×1µm の模式）
  const INJ = { x: -380, y: CR };  // DNA が入った場所（上の膜）
  const HEADFUL = Math.round(T4.genomeBp * 1.03); // ヘッドフル（ゲノムより約3%長い。Miller ら 2003）
  const PER = { gp23: 960, gp18: 138 };           // 1つのファージあたりの数（Rao と Black 2010・Leiman ら 2010）
  const PC = { mat: '#6ea9ff', early: '#ffae5a', shell: '#5fe0c4', tail: '#c39bff', fiber: '#f2f7f9' }; // 流れる点の色
  const S = {};
  let ribo = [], nuc = [], nucOrder = [], t4loops = [];

  const rnd = (a, b) => a + Math.random() * (b - a);
  function inCell(x, y, m = 0) { const ax = Math.max(0, Math.abs(x) - (CL / 2 - CR)); return ax * ax + y * y < (CR - m) ** 2; }
  function randIn(m) { for (;;) { const x = rnd(-CL / 2, CL / 2), y = rnd(-CR, CR); if (inCell(x, y, m)) return { x, y }; } }

  function reset(opt = {}) {
    S.host = opt.host || S.host || 'k12';
    S.variant = opt.variant || S.variant || 'wt';
    S.t = 0; S.playing = true; S.speed = S.speed || 0.5;
    S.lysisT = rnd(TL.lysis[0], TL.lysis[1]);
    S.lin = false; S.failed = false; S.burst = 0; S.burstAt = null;
    S.heads = []; S.nextHead = 0; S.done = 0; S.firstDone = false;
    S.seconds = []; S.cutT = null; S.said = {};
    S.flies = []; S.hl = null; S.parts = []; S.spawn = {};
    ribo = []; for (let i = 0; i < 420; i++) ribo.push(randIn(30));
    // 細菌の DNA（まん中のかたまり）
    nuc = []; let x = 0, y = 0, a = 0;
    for (let i = 0; i < 1400; i++) { a += rnd(-1, 1); x += Math.cos(a) * 14; y += Math.sin(a) * 14; if ((x / 560) ** 2 + (y / 230) ** 2 > 1) { a += Math.PI; x *= 0.95; y *= 0.95; } nuc.push([x, y]); }
    nucOrder = nuc.map((_, i) => i).sort(() => Math.random() - 0.5);
    // T4 の DNA: 1本ぶんの輪。1つめは入った場所、コピーは細菌の DNA があったまん中に広がる（置き場所は模式）
    t4loops = [];
    for (let c = 0; c < 40; c++) {
      const cx = c === 0 ? INJ.x : rnd(-560, 560) * Math.min(1, 0.35 + c / 40), cy = c === 0 ? INJ.y - 70 : rnd(-230, 230) * Math.min(1, 0.35 + c / 40), pts = []; let px = cx, py = cy, aa = rnd(0, 6.28);
      for (let i = 0; i < 70; i++) { aa += rnd(-1.1, 1.1); px += Math.cos(aa) * 8; py += Math.sin(aa) * 8; if (!inCell(px, py, 60)) aa += Math.PI; pts.push([px, py]); }
      t4loops.push({ pts, cx, cy, born: null });
    }
    UI.clearLog('in');
    UI.log('in', `T4 の DNA が ${S.host === 'k12' ? '大腸菌 K-12' : '大腸菌 B'} の中に入った（感染 0分）。この1本が設計図になる。`, 'sure', 0);
    if (S.variant === 'gt') S.cutT = 0.4;
    UI.inStatus(S);
  }

  // 1分あたりに作りはじめる頭の数（模式。最初の完成が約12〜15分、破裂までに100〜150個になるように）
  function headRate(t) { if (t < TL.late) return 0; return t < 25 ? 12 : 12 * Math.exp(-(t - 25) / 20); }
  // T4 の DNA が何本ぶんあるか（目安。5分からコピー。頭につめる数に足りるように決めた模式）
  function genomes(t) { return t < TL.repl ? 1 : 1 + 14 * (t - TL.repl); }

  function step(dt) {
    if (!S.playing) return;
    if (S.burstAt != null) { stepBurst(dt); return; }
    const dm = dt * S.speed; S.t += dm; const t = S.t;
    const once = (key, cond, msg, kind) => { if (!S.said[key] && cond) { S.said[key] = 1; UI.log('in', msg, kind, t); } };
    if (S.failed) { S.t = Math.min(S.t, 3); return; }
    if (S.cutT != null && t >= S.cutT) {
      S.failed = true; S.playing = false;
      UI.log('in', 'DNA にブドウ糖の目印がないので、細菌の<b>制限酵素</b>に切られた。設計図がなくなったので T4 は増えられず、細菌は生き残る。', 'sure', t);
      UI.toast('in', '切られた！'); UI.inStatus(S); return;
    }
    once('stop', t >= TL.hostStop, '細菌自身のたんぱく質が作られなくなる。細菌の工場（リボソーム）は、T4 の設計図の写し（mRNA）のとおりに T4 のたんぱく質を作りはじめる。', 'sure');
    once('hdna', t >= TL.hostDnaFrom, 'T4 の酵素が細菌の DNA をこわしはじめる。かけらは T4 の DNA の<b>材料</b>になる（青い点の流れ）。', 'est');
    once('repl', t >= TL.repl, 'T4 の DNA（設計図）のコピーが始まる。1本が何十本にもなる。', 'sure');
    once('late', t >= TL.late, '後期の遺伝子: 工場から頭の殻（緑の点）・しっぽ（紫の点）の部品が大量に出てくる。', 'sure');
    // 頭を作りはじめる（しっぽは別の場所で作られ、頭に DNA がつまるころに寄ってくる）
    S.nextHead += headRate(t) * dm;
    while (S.nextHead >= 1 && S.heads.length < 600) {
      S.nextHead -= 1;
      const p = randIn(80), bp = Math.min(TL.packBpMax, Math.max(350, TL.packBp * (0.75 + 0.5 * Math.random())));
      const fs = t + 0.6, q = randIn(80);
      S.heads.push({ x: p.x, y: p.y, ang: rnd(0, 6.28), born: t, fs, fe: fs + HEADFUL / bp / 60, bp, tx0: q.x, ty0: q.y, tang: rnd(0, 6.28) });
    }
    let done = 0, packing = 0, building = 0, tails = 0, packed = 0;
    for (const h of S.heads) {
      if (t >= h.fe + 0.6) { done++; packed += 1; }
      else if (t >= h.fs) { packing++; tails++; packed += Math.min(1, (t - h.fs) / (h.fe - h.fs)); }
      else building++;
    }
    S.done = done; S.packing = packing; S.building = building; S.tails = tails;
    S.genomes = genomes(t); S.pool = Math.max(1, S.genomes - packed);
    S.gp23 = S.heads.filter(h => t >= h.born + 0.6).length * PER.gp23; S.gp18 = (tails + done) * PER.gp18;
    once('pack', packing > 0, `頭の殻ができると、モーターが T4 の DNA を1本ぶんずつ吸いこむ（毎秒約${TL.packBp}塩基対、1つ約${(HEADFUL / TL.packBp / 60).toFixed(0)}分。オレンジの線）。`, 'sure');
    once('tail', tails > 0, 'しっぽは頭とは別に組み立てられ、DNA のつまった頭に寄ってきて付く。', 'sure');
    if (!S.firstDone && done > 0) { S.firstDone = true; UI.log('in', '最初のファージが完成（頭＋しっぽ＋脚）。ここから次々に完成する。', 'sure', t); }
    once('holin', t >= 12, '内膜に穴あけのたんぱく（ホリン）がたまっていく（ピンクの点）。', 'sure');
    // T4 の DNA の輪（いまある本数ぶん。40本で頭打ちの絵）
    const want = Math.min(t4loops.length, Math.ceil(S.pool));
    for (let i = 0; i < t4loops.length; i++) { const L = t4loops[i]; if (i < want) { if (L.born == null) L.born = t; } else L.born = null; }
    stepParts(dt, t);
    if (t >= S.lysisT) startBurst();
    UI.inStatus(S);
  }

  // ---- 流れる点（材料・部品）。画面の時間で動く ----
  const pick1 = a => a[Math.floor(Math.random() * a.length)];
  function loopPt() { const L = pick1(t4loops.filter(l => l.born != null)) || t4loops[0]; const p = pick1(L.pts); return { x: p[0], y: p[1] }; }
  function headPortal(h) { return { x: h.x + 100.5 * Math.sin(h.ang), y: h.y + 100.5 * Math.cos(h.ang) }; }
  function headCenter(h) { return { x: h.x + 160 * Math.sin(h.ang), y: h.y + 160 * Math.cos(h.ang) }; }
  function tailPos(h, t) { const k = Math.max(0, Math.min(1, (t - h.fs) / (h.fe - h.fs))), e = k * k * (3 - 2 * k); return { x: h.tx0 + (h.x - h.tx0) * e, y: h.ty0 + (h.y - h.ty0) * e, ang: h.tang + (h.ang - h.tang) * e }; }
  function emit(key, rate, dt, mk) { S.spawn[key] = (S.spawn[key] || 0) + rate * dt; while (S.spawn[key] >= 1) { S.spawn[key] -= 1; const p = mk(); if (p && S.parts.length < 500) S.parts.push(p); } }
  function stepParts(dt, t) {
    const R = () => pick1(ribo), hl = S.hostLeft ?? 1;
    // 材料: こわした細菌の DNA のかけら → T4 の DNA
    if (t >= TL.hostDnaFrom && hl > 0.02) emit('mat', 30, dt, () => { const n = nuc[pick1(nucOrder)]; const q = loopPt(); return { x: n[0], y: n[1], tx: q.x, ty: q.y, c: PC.mat, k: 0, d: 1.1 }; });
    // 早い時期のたんぱく（DNA をこわす・コピーする酵素など）: 工場 → 細菌の DNA と T4 の DNA
    if (t >= 0.3 && t < TL.late) emit('early', 22, dt, () => { const r = R(); const q = Math.random() < 0.5 && hl > 0.1 ? (() => { const n = nuc[pick1(nucOrder)]; return { x: n[0], y: n[1] }; })() : loopPt(); return { x: r.x, y: r.y, tx: q.x, ty: q.y, c: PC.early, k: 0, d: 1.2 }; });
    // 頭の殻の部品: 工場 → 組み立て中の頭
    const bld = S.heads.filter(h => t >= h.born && t < h.fs);
    if (bld.length) emit('shell', 34, dt, () => { const r = R(), h = pick1(bld), c = headCenter(h); return { x: r.x, y: r.y, tx: c.x + rnd(-30, 30), ty: c.y + rnd(-40, 40), c: PC.shell, k: 0, d: 1.1 }; });
    // しっぽの部品: 工場 → 組み立て中のしっぽ
    const tl = S.heads.filter(h => t >= h.fs && t < h.fe);
    if (tl.length) emit('tail', 18, dt, () => { const r = R(), h = pick1(tl), p = tailPos(h, t); return { x: r.x, y: r.y, tx: p.x, ty: p.y, c: PC.tail, k: 0, d: 1.1 }; });
    // 長い脚: 工場 → 頭としっぽが合体したところ
    const fb = S.heads.filter(h => t >= h.fe && t < h.fe + 0.6);
    if (fb.length) emit('fiber', 10, dt, () => { const r = R(), h = pick1(fb); return { x: r.x, y: r.y, tx: h.x, ty: h.y, c: PC.fiber, k: 0, d: 1 }; });
    for (const p of S.parts) p.k += dt / p.d;
    S.parts = S.parts.filter(p => p.k < 1);
  }

  function startBurst() {
    S.burstAt = S.t; S.burst = 0;
    UI.log('in', `ホリンがいっせいに穴をあけ、溶菌酵素が細胞壁をとかす → <b>破裂</b>。出てきたファージ: <b>${S.done}個</b>。1本の設計図から、細菌の材料と工場を使って作られた。`, 'sure', S.t);
    UI.toast('in', `破裂！ ${S.done}個`);
    S.flies = S.heads.map(h => {
      const ok = S.t >= h.fe + 0.6, a = Math.atan2(h.y, h.x) + rnd(-0.6, 0.6), v = rnd(300, 900);
      return { x: h.x, y: h.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ang: h.ang, va: rnd(-2, 2), ok, f: ok ? 1 : Math.max(0, (S.t - h.fs) / (h.fe - h.fs)) };
    });
    S.parts = [];
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
      UI.log('in', '外にファージがまだいる合図で、<b>破裂がおくれる</b>（溶菌阻止）。そのあいだもファージは作られつづける。', 'sure', t);
      UI.toast('in', '破裂がおくれる');
    }
  }

  // ---- 描く ----
  function resize() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    Wpx = Math.max(1, r.width); Hpx = Math.max(1, r.height);
    cv.width = Math.round(Wpx * dpr); cv.height = Math.round(Hpx * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const side = Wpx < 520 ? 1.08 : 1.5; // 細菌のまわりに名前の札を置くすき間（スマホは少なめ）
    // 隠れているとき（大きさ0）でもマイナスにしない
    s = Math.max(0.01, Math.min(Wpx / (CL * side), (Hpx - 120) / (2 * CR * 1.15))); ox = Wpx / 2; oy = 66 + (Hpx - 66 - 44) / 2;
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
    cellPath(30); g.save(); g.clip();
    // リボソーム（工場）。乗っとられると T4 の色に
    const takeover = S.failed ? 0 : Math.min(1, t / TL.hostStop);
    g.fillStyle = `rgb(${Math.round(120 + 100 * takeover)},${Math.round(170 + 30 * takeover)},${Math.round(220 - 50 * takeover)})`; // 乗っとられると黄みの白（T4 の部品を作る工場）
    for (const p of ribo) g.fillRect(X(p.x) - 1.2, Y(p.y) - 1.2, 2.6, 2.6);
    // 細菌の DNA
    const hl = S.failed ? 1 : 1 - Math.max(0, Math.min(1, (t - TL.hostDnaFrom) / (TL.hostDnaTo - TL.hostDnaFrom)));
    S.hostLeft = hl;
    if (hl > 0) {
      const keep = Math.floor(nuc.length * hl), alive = new Uint8Array(nuc.length);
      for (let i = 0; i < keep; i++) alive[nucOrder[i]] = 1;
      g.strokeStyle = 'rgba(110,170,255,.7)'; g.lineWidth = Math.max(1, 3.2 * s);
      g.beginPath();
      for (let i = 1; i < nuc.length; i++) if (alive[i]) { g.moveTo(X(nuc[i - 1][0]), Y(nuc[i - 1][1])); g.lineTo(X(nuc[i][0]), Y(nuc[i][1])); }
      g.stroke();
    }
    // T4 の DNA（設計図）
    g.lineJoin = 'round';
    const loops = t4loops.filter(L => L.born != null);
    for (const L of loops) {
      if (S.failed) {
        g.strokeStyle = 'rgba(255,159,107,.7)'; g.lineWidth = Math.max(1.4, 4 * s);
        for (let i = 0; i < L.pts.length - 6; i += 9) { g.beginPath(); g.moveTo(X(L.pts[i][0]), Y(L.pts[i][1])); for (let j = 1; j < 5; j++) g.lineTo(X(L.pts[i + j][0]), Y(L.pts[i + j][1])); g.stroke(); }
        continue;
      }
      const k = Math.min(1, (t - L.born) / 0.8), n = Math.max(2, Math.floor(L.pts.length * k));
      g.strokeStyle = PCOL.dna; g.lineWidth = Math.max(1.4, 4 * s);
      g.beginPath(); g.moveTo(X(L.pts[0][0]), Y(L.pts[0][1])); for (let i = 1; i < n; i++) g.lineTo(X(L.pts[i][0]), Y(L.pts[i][1])); g.stroke();
    }
    // 設計図の写し（mRNA）: T4 の DNA から近くの工場へのびる細い線
    if (!S.failed && !br && t > 0.3) {
      const col = t < TL.repl ? 'rgba(255,174,90,.55)' : t < TL.late ? 'rgba(255,216,107,.55)' : 'rgba(255,122,176,.55)';
      g.strokeStyle = col; g.lineWidth = 1;
      const m = Math.min(60, 10 + loops.length * 3);
      for (let i = 0; i < m; i++) {
        const L = loops[i % loops.length], p = L.pts[(i * 13) % L.pts.length], r = ribo[(i * 37) % ribo.length];
        const mx = (p[0] + r.x) / 2 + Math.sin(i + t * 3) * 20, my = (p[1] + r.y) / 2 + Math.cos(i + t * 3) * 20;
        if (Math.hypot(p[0] - r.x, p[1] - r.y) > 360) continue;
        g.beginPath(); g.moveTo(X(p[0]), Y(p[1])); g.quadraticCurveTo(X(mx), Y(my), X(r.x), Y(r.y)); g.stroke();
      }
    }
    // 2つめのファージ（中に入れたもの）
    for (const q of S.seconds) if (q.inside) { g.strokeStyle = '#ffc06b'; g.lineWidth = Math.max(1.4, 4 * s); g.beginPath(); g.arc(X(q.x * 0.8), Y(q.y * 0.6), 40 * s, 0, 5); g.stroke(); }
    // 頭・しっぽ（作りかけ → 完成）と、つめこまれる DNA
    if (!br) {
      for (const h of S.heads) if (t >= h.fs && t < h.fe) { // 頭へ吸いこまれる DNA（オレンジの線）
        const P = headPortal(h), q = nearestLoop(P);
        g.strokeStyle = 'rgba(255,159,107,.85)'; g.lineWidth = Math.max(1, 2 * s);
        g.beginPath(); g.moveTo(X(q.x), Y(q.y)); g.quadraticCurveTo(X((q.x + P.x) / 2 + 30), Y((q.y + P.y) / 2 - 30), X(P.x), Y(P.y)); g.stroke();
      }
      for (const h of S.heads) drawHead(h, t);
    }
    // 流れる点
    const at = (p, k) => { const e = k * k * (3 - 2 * k); return [p.x + (p.tx - p.x) * e, p.y + (p.ty - p.y) * e + Math.sin(k * Math.PI) * 25]; };
    g.lineCap = 'round';
    for (const p of S.parts) { // 通った跡つきの点（どこからどこへ流れているかが見えるように）
      const [x, y] = at(p, p.k), [x0, y0] = at(p, Math.max(0, p.k - 0.18));
      g.strokeStyle = p.c; g.globalAlpha = 0.45; g.lineWidth = 2; g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x), Y(y)); g.stroke();
      g.globalAlpha = 1; g.fillStyle = p.c; g.beginPath(); g.arc(X(x), Y(y), 2.6, 0, Math.PI * 2); g.fill();
    }
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
    if (!br) drawTags(t, loops);
    // ルーペで見た場所
    if (S.hl && performance.now() - S.hl.at < 1800) { g.strokeStyle = '#ffe066'; g.lineWidth = 2; g.beginPath(); g.arc(X(S.hl.x), Y(S.hl.y), 26, 0, Math.PI * 2); g.stroke(); }
    drawScale();
  }
  function nearestLoop(P) {
    let best = null, bd = 1e9;
    for (const L of t4loops) if (L.born != null) { const d = (L.cx - P.x) ** 2 + (L.cy - P.y) ** 2; if (d < bd) { bd = d; best = L; } }
    const p = best ? best.pts[Math.floor(best.pts.length / 2)] : [INJ.x, INJ.y - 70]; return { x: p[0], y: p[1] };
  }

  // 名前の札（細菌の外に置き、線でつなぐ）
  function drawTags(t, loops) {
    if (S.failed) return;
    const sm = Wpx < 520, tags = [];
    const L0 = loops[0] || t4loops[0];
    tags.push({ text: `設計図: T4 の DNA（約${Math.round(S.genomes || 1)}本ぶん）`, c: PCOL.dna, ax: L0.pts[20][0], ay: L0.pts[20][1], slot: 'tl', pri: 1 });
    if (t > TL.hostStop) { const r = ribo[7]; tags.push({ text: '工場: 細菌のリボソーム（T4 の部品を作る）', c: '#dcc8aa', ax: r.x, ay: r.y, slot: 'tr', pri: 2 }); }
    if (t > TL.hostDnaFrom && (S.hostLeft ?? 1) > 0.05) tags.push({ text: '材料: 細菌の DNA をこわして使う', c: PC.mat, ax: 0, ay: -60, slot: 'bl', pri: 3 });
    const bld = S.heads.filter(h => t >= h.born && t < h.fs);
    if (bld.length) { const c = headCenter(bld[bld.length - 1]); tags.push({ text: '頭の殻を組み立て中（緑の点が部品）', c: PC.shell, ax: c.x, ay: c.y, slot: 'bl', pri: 4 }); }
    const tl = S.heads.filter(h => t >= h.fs && t < h.fe);
    if (tl.length) { const h = tl[0], p = tailPos(h, t); tags.push({ text: 'しっぽ（別に作って、頭に付く。紫の点が部品）', c: PC.tail, ax: p.x, ay: p.y, slot: 'br', pri: 5 }); const P = headPortal(h); tags.push({ text: '頭に DNA をつめている', c: PCOL.dna, ax: P.x, ay: P.y, slot: 'tr', pri: 6 }); }
    const dn = S.heads.find(h => t >= h.fe + 0.6);
    if (dn) tags.push({ text: `完成（${S.done}個）`, c: '#e8f0f4', ax: dn.x, ay: dn.y, slot: 'br', pri: 7 });
    // 同じ場所には新しいほうだけ。スマホは新しい2つだけ
    const bySlot = {}; for (const tg of tags) if (!bySlot[tg.slot] || bySlot[tg.slot].pri < tg.pri) bySlot[tg.slot] = tg;
    let list = Object.values(bySlot).sort((a, b) => b.pri - a.pri); if (sm) list = list.slice(0, 2);
    const fs = sm ? 11 : 12.5;
    g.font = `700 ${fs}px "Zen Kaku Gothic New", sans-serif`; g.textBaseline = 'middle';
    const cellL = X(-CL / 2), cellR = X(CL / 2), top = Y(CR), bot = Y(-CR);
    const pos = { tl: [Math.max(8, cellL - 10), top - 18, 'left'], tr: [Math.min(Wpx - 8, cellR + 10), top - 18, 'right'], bl: [Math.max(8, cellL - 10), bot + 20, 'left'], br: [Math.min(Wpx - 8, cellR + 10), bot + 20, 'right'] };
    for (const tg of list) {
      const [px, py, al] = pos[tg.slot], w = g.measureText(tg.text).width;
      const bx = al === 'left' ? px : px - w, ax = X(tg.ax), ay = Y(tg.ay);
      g.strokeStyle = 'rgba(232,240,244,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(al === 'left' ? bx + w / 2 : bx + w / 2, py); g.lineTo(ax, ay); g.stroke();
      g.fillStyle = 'rgba(10,22,27,.88)'; g.fillRect(bx - 6, py - fs * 0.8, w + 12, fs * 1.6);
      g.fillStyle = tg.c; g.textAlign = 'left'; g.fillText(tg.text, bx, py);
      g.beginPath(); g.arc(ax, ay, 3, 0, Math.PI * 2); g.fill();
    }
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
    // しっぽ（頭に DNA をつめているあいだ、別の場所から寄ってくる）
    if (t >= h.fs && t < h.fe) {
      const p = tailPos(h, t);
      g.save(); g.translate(X(p.x), Y(p.y)); g.rotate(p.ang); g.scale(s, s); drawPhageBody(g, { tailOnly: true, alpha: 0.9 }); g.restore();
    }
    g.save(); g.translate(X(h.x), Y(h.y)); g.rotate(h.ang); g.scale(s, s);
    if (t < h.fs) { g.globalAlpha = 0.25 + 0.6 * k; drawPhageBody(g, { fill: 0, headOnly: true }); }
    else if (t < h.fe) drawPhageBody(g, { fill: (t - h.fs) / (h.fe - h.fs), headOnly: true });
    else if (t < h.fe + 0.6) { const tk = (t - h.fe) / 0.6; drawPhageBody(g, { fill: 1, alpha: 0.6 + 0.4 * tk }); }
    else drawPhageSmall(g, { fill: 1 });
    g.restore();
  }
  function drawScale() {
    const x0 = 14, y0 = Hpx - 16, len = 500 * s;
    g.strokeStyle = '#e8f0f4'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + len, y0); g.moveTo(x0, y0 - 4); g.lineTo(x0, y0 + 4); g.moveTo(x0 + len, y0 - 4); g.lineTo(x0 + len, y0 + 4); g.stroke();
    g.fillStyle = '#e8f0f4'; g.font = '11px "IBM Plex Mono", monospace'; g.textBaseline = 'bottom'; g.textAlign = 'left'; g.fillText('500 nm', x0, y0 - 6);
  }

  // ---- ルーペ ----
  function pick(x, y) {
    const t = S.t;
    if (S.burstAt != null) return S.flies.some(f => f.ok && Math.hypot(f.x - x, f.y - y) < 120) ? 'phage' : null;
    for (const q of S.seconds) if (Math.hypot(q.x - x, q.y + Math.sign(q.y) * 120 - y) < 200) return 'second';
    if (Math.hypot(INJ.x - x, INJ.y + 160 - y) < 140) return 'ghost';
    for (const h of S.heads) {
      if (t < h.born) continue;
      if (t >= h.fs && t < h.fe) { const p = tailPos(h, t); if (Math.hypot(p.x - x, p.y - y) < 60) return 'tail'; }
      const dx = x - h.x, dy = -(y - h.y), c = Math.cos(-h.ang), sn = Math.sin(-h.ang), lx = dx * c - dy * sn, ly = dx * sn + dy * c;
      if (Math.abs(lx) < 60 && ly < 40 && ly > -240) return t >= h.fe + 0.6 ? 'phage' : 'head';
    }
    if (!inCell(x, y, -20)) return null;
    if (!inCell(x, y, 40)) return !S.failed && t > 12 ? 'holin' : 'envelope';
    if (S.failed) return 'cut';
    for (const L of t4loops) if (L.born != null && L.pts.some(([px, py]) => Math.abs(px - x) < 30 && Math.abs(py - y) < 30)) return 't4Dna';
    if (S.hostLeft > 0.05 && (x / 600) ** 2 + (y / 260) ** 2 < 1) return 'hostDna';
    if (t > 0.3 && t < TL.late && Math.random() < 0.5) return 'early';
    return 'ribo';
  }
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left - ox) / s, y = (oy - (e.clientY - r.top)) / s;
    const k = pick(x, y); if (!k) return;
    S.hl = { x, y, at: performance.now() };
    UI.loupe(k === 'ghost' ? { t: '最初のファージのぬけがら', k: 'sure', b: 'DNA を入れたあとの空っぽの頭としっぽ。外に残る（ゴースト）。' } : INFO[k]);
  });

  return { S, reset, step, draw, resize, superinfect, view: () => ({ Wpx, Hpx, s, ox, oy }), setSpeed(v) { S.speed = v; }, toggle() { if (S.failed || S.burst > 6) return; S.playing = !S.playing; UI.inStatus(S); } };
})();
