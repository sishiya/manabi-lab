// 世界を描く: 時刻（Story.at の st）と拡大率に合わせて、寄るほど細かく描く。マウスを乗せたときの解説の場所も登録する
'use strict';

const Scene = (() => {
  const V = View.V, g = V.g;
  const R = CELL.R, HL = CELL.L / 2 - CELL.R;   // 半径と、まっすぐな部分の半分
  const LX = {
    water: { t: '水', k: 'sure', b: 'ファージのまわりの水。水の分子が四方八方からぶつかるので、ファージはふらふらゆれる（ブラウン運動）。ファージは自分では泳げない。' },
    cyto: { t: '細菌の中（細胞質）', k: 'sure', b: '細菌の体の中。リボソーム（たんぱく質の工場）や細菌の DNA がある。寄ると、1つずつの分子が見える。' },
    lps: { t: 'LPS（外膜の表面の糖の鎖）', k: 'sure', b: '外膜の外側にびっしり並ぶ糖の鎖。短い脚 gp12 は、刺さるときに鎖の根もと側の糖にくいこむ。' },
    peri: { t: 'ペリプラズム（外膜と内膜のあいだ）', k: 'sure', b: '2枚の膜のあいだのすきま。細胞壁（ペプチドグリカン）がある。あとから来たファージの DNA は、ここに捨てられる。' },
    cell: { t: '大腸菌 K-12', k: 'sure', b: '長さ約2µm、太さ約1µm の棒の形の細菌。寄ると、外膜・細胞壁・内膜と、中の分子が見える。' },
  };
  const NO_OMPC = () => Story.cond === 'norec';
  // 奥行き: 細菌は立体なので、手前（約3割）はくっきり・説明あり、奥は薄い背景（説明なし）。数は減らさない
  const FRONT = 0.3, BACK_A = 0.22;
  let baseA = 1;

  // 細胞のふちから m nm 内側の形
  let swell = 0;   // 破れる前のふくらみ（0..1）。0 ならふつうの棒の形
  function cellPath(m) {
    if (swell <= 0) { const r = R - m; g.beginPath(); g.roundRect(V.X(-HL - r), V.Y(r), (2 * HL + 2 * r) * V.s, 2 * r * V.s, r * V.s); return; }
    g.beginPath(); for (let i = 0; i <= 160; i++) { const p = swollen(i / 160, m, swell); i ? g.lineTo(V.X(p.x), V.Y(p.y)) : g.moveTo(V.X(p.x), V.Y(p.y)); } g.closePath();
  }
  // 細胞壁が切られて棒の形を保てなくなったときの形（模式）: 横がふくらみ、両はしは少し縮む。でこぼこも出る
  function swollen(u, m, e) {
    const b = perim(u, 0), ax = Math.max(-HL, Math.min(HL, b.x)), nl = Math.hypot(b.x - ax, b.y) || 1, nx = (b.x - ax) / nl, ny = b.y / nl;
    const t = Math.abs(b.x) / (HL + R), off = e * (150 * (1 - t * t) - 70 + 14 * Math.sin(u * 37 + 1.3) + 9 * Math.sin(u * 83));
    const d = off - m;
    return { x: b.x + nx * d, y: b.y + ny * d, nx, ny };
  }
  function depth(x, y) { return R - Math.hypot(Math.max(0, Math.abs(x) - HL), y); }
  function perim(u, m) { const L = 2 * HL, r = R - m, P = 2 * L + 2 * Math.PI * r; let d = (((u % 1) + 1) % 1) * P;
    if (d < L) return { x: -HL + d, y: r }; d -= L;
    if (d < Math.PI * r) { const a = Math.PI / 2 - d / r; return { x: HL + Math.cos(a) * r, y: Math.sin(a) * r }; } d -= Math.PI * r;
    if (d < L) return { x: HL - d, y: -r }; d -= L;
    const a = -Math.PI / 2 - d / r; return { x: -HL + Math.cos(a) * r, y: Math.sin(a) * r }; }

  function draw(st) {
    View.begin();
    const M = Story.M, pre = ['zoomin', 'colony', 'approach', 'bind', 'pierce', 'inject'].includes(st.id), spread = st.id === 'spread';
    const m = spread ? M.tEnd : st.min, burst = st.id === 'burst' ? st.p : spread ? 1 : 0;
    const tau = st.u * Story.total, rm = spread ? st.min - M.tEnd : -1;
    const c = Story.counts(pre ? 0 : m);
    g.fillStyle = '#0b1a22'; g.fillRect(0, 0, V.W, V.H);
    // 水と細胞の外側の層（解説は深さで決める。いちばん下に登録して、ほかのものが上）
    V.hit({ test: () => true, infoAt: (x, y) => envInfo(x, y, m, pre) });
    Macro.draw();
    drawColony(tau, rm);
    if (st.id === 'zoomin' || st.id === 'colony' || st.id === 'approach') drawFreePhages(tau);
    // 破れて出る: 0〜0.22 で棒の形がくずれてふくらむ → 1か所が破れ、中身がいっせいに出る → 膜はちぎれたかけらに
    const TEAR = 0.22, torn = burst >= TEAR, kk = torn ? (burst - TEAR) / (1 - TEAR) : 0;
    swell = burst > 0 ? ease(Math.min(1, burst / TEAR)) : 0;
    drawAppendages(m, burst > 0 ? Math.max(0, 1 - kk * 1.5) : 1);
    if (!torn) {
      drawEnvelope(m, pre, burst);
      cellPath(35); g.save(); g.clip();
      drawInside(st, m, pre, c, burst);
      drawCytoLook(pre, m);
      g.restore();
      drawHolins(m, pre, burst);
    } else {
      // 中身: 破れたところから広がりながら薄れる
      const ca = Math.max(0, 1 - kk * 1.4);
      g.save(); g.globalAlpha = ca;
      const tp = swollen(TEAR_U, 0, 1); g.translate(V.X(tp.x), V.Y(tp.y)); g.scale(1 + kk * 0.9, 1 + kk * 0.9); g.translate(-V.X(tp.x), -V.Y(tp.y));
      if (ca > 0.02) drawInside(st, m, pre, c, burst);
      g.restore();
      drawDebris(kk);
    }
    swell = 0;
    if (Story.cond === 'lin' && !pre && m >= 7) drawSecond(m);
    drawLanding(st);
    if (burst > 0 && !spread) drawBurst(m, burst);
    if (spread) drawSpread(rm);
    if (st.id === 'colony' || (st.id === 'approach' && st.p < 0.3)) drawPick();
    if (V.s < 0.62 && !pre && burst === 0 && !View.real) drawTags(m, c);
    if (V.s < 0.62 && burst > 0 && burst < 0.5 && !spread && !View.real) drawBurstTag(burst, torn);
    drawScale();
  }

  function envInfo(x, y, m, pre) {
    if (!inCell(x, y, -1)) return LX.water;
    if (swell > 0 || Story.at(UI.state.u).id === 'spread') return DEBRIS;
    const d = depth(x, y);
    if (d < 1.5 && y > R - 10 && Math.abs(x) < HL) return LX.lps;
    if (d < 7) { const v = ((x - 6) % 32 + 32) % 32; return y > R - 10 && Math.abs(x) < HL && !NO_OMPC() && Math.min(v, 32 - v) < 6 ? ZINFO.ompc : ZINFO.om; }
    if (d < 10 || (d >= 16 && d < 28)) return LX.peri;
    if (d < 16) return ZINFO.pg;
    if (d < 35) return !pre && m > 12 ? ZINFO.holin : ZINFO.im;
    return V.s < 0.35 ? LX.cell : LX.cyto;
  }

  // ---- 細胞の外側の層 ----
  function drawEnvelope(m, pre, burst) {
    const layers = [[0, '#46617a'], [7, '#152427'], [10, '#5d6b3c'], [16, '#152427'], [28, '#46617a'], [35, pre || m < TL.hostStop ? '#1b2f33' : '#232a2a']];
    for (const [mm, col] of layers) { cellPath(mm); g.fillStyle = col; g.fill(); }
    if (V.s >= 1.2 && !burst) { // 細胞壁のあみ目・LPS・OmpC（上面の、見えているところだけ）
      const vb = V.viewBox(), x0 = Math.max(-HL, vb.x0 - 10), x1 = Math.min(HL, vb.x1 + 10);
      if (x1 > x0 && vb.y1 > R - 40 && vb.y0 < R + 10) {
        g.strokeStyle = 'rgba(220,240,160,.3)'; g.lineWidth = 1; g.beginPath();
        for (let x = Math.floor(x0 / 4) * 4; x < x1; x += 4) { g.moveTo(V.X(x), V.Y(R - 10)); g.lineTo(V.X(x + 3), V.Y(R - 16)); }
        g.stroke();
        const step = V.s > 3 ? 2.5 : 5;
        g.strokeStyle = 'rgba(190,220,240,.6)'; g.lineWidth = Math.max(0.7, 0.4 * V.s); g.beginPath();
        for (let x = Math.floor(x0 / step) * step; x < x1; x += step) { g.moveTo(V.X(x), V.Y(R)); g.lineTo(V.X(x + 0.3), V.Y(R + (NO_OMPC() ? 1.5 : 3))); }
        g.stroke();
        for (let x = Math.floor(x0 / 16) * 16; x < x1; x += 16) {
          const isC = ((Math.round(x / 16) % 2) + 2) % 2 === 0;
          if (isC && NO_OMPC()) continue;
          if (isC) for (const dx of [-2.2, 0, 2.2]) V.rect(x + 6 + dx, R - 3.5, 2, 8, '#ffe066', 0.8);
          else V.rect(x + 6, R - 3.5, 5, 8, '#7d93a6', 0.8);
        }
        if (V.s > 2.5 && !View.real) {
          const lab = (t, y) => V.text(t, Math.max(x0 + 2, vb.x0 + 4 / V.s), y, { size: 11, align: 'left', dx: 4, bg: 'rgba(11,26,34,.7)' });
          lab('外膜', R - 3.5); lab('細胞壁', R - 13); lab('内膜', R - 31.5);
        }
      }
    }
  }

  // ---- 細菌の中 ----
  function drawInside(st, m, pre, c, burst) {
    // 破れたあとに薄れていくとき、中で透明度を 1 にもどさないよう、はじめの濃さを基準にする
    baseA = g.globalAlpha;
    const M = Story.M, s = V.s, vb = V.viewBox(), inView = (x, y, r = 30) => x > vb.x0 - r && x < vb.x1 + r && y > vb.y0 - r && y < vb.y1 + r;
    const tk = pre ? 0 : Math.min(1, m / TL.hostStop), gt = Story.cond === 'gt' && m >= 0.4;
    const late = m >= TL.late, prodCol = m < TL.late ? '#ffae5a' : '#5fe0c4';
    // リボソーム（工場、直径約20nm）
    const rc = `rgb(${Math.round(120 + 100 * tk)},${Math.round(170 + 30 * tk)},${Math.round(220 - 50 * tk)})`;
    for (let ri = 0; ri < M.ribo.length; ri++) {
      const r = M.ribo[ri];
      if (!inView(r.x, r.y)) continue;
      // どの拡大率でも本当の大きさ（直径約20nm）で描く（小さな点から急に丸へ切りかえない）。小さすぎるときは同じ大きさの四角
      const rp = Math.max(1, 9.5 * s), dot = rp < 3;
      const disc = () => { if (dot) { g.fillStyle = rc; g.fillRect(V.X(r.x) - rp, V.Y(r.y) - rp, 2 * rp, 2 * rp); } else V.circle(r.x, r.y, 9.5, rc); };
      // 奥のもの（約7割）は薄い背景。説明は出さない
      if (hash(ri, 5) > FRONT) { g.globalAlpha = baseA * BACK_A; disc(); g.globalAlpha = baseA; continue; }
      disc();
      // 細かい部分（小さいほうの粒・読んでいる mRNA・作っている鎖）は、寄るにつれてだんだん濃く
      const da = Math.max(0, Math.min(1, (s - 0.9) / 0.7));
      if (da > 0) {
        g.globalAlpha = baseA * da;
        V.circle(r.x + 6 * Math.cos(r.a), r.y + 6 * Math.sin(r.a), 6, 'rgba(255,255,255,.35)');
        if (!pre && m > TL.hostStop && !gt && burst === 0) { // 読んでいる写し（mRNA）と、作られている鎖
          V.line([[r.x - 16 * Math.cos(r.a + 1.57), r.y - 16 * Math.sin(r.a + 1.57)], [r.x + 16 * Math.cos(r.a + 1.57), r.y + 16 * Math.sin(r.a + 1.57)]], 'rgba(255,122,176,.8)', Math.max(1, 0.6 * s));
          const pts = []; for (let i = 0; i < 10; i++) pts.push([r.x + Math.cos(r.a) * (9 + i * 1.6) + Math.sin(i * 1.9 + m * 9) * 1.4, r.y + Math.sin(r.a) * (9 + i * 1.6) + Math.cos(i * 1.7) * 1.4]);
          V.line(pts, prodCol, Math.max(1, 0.8 * s));
        }
        g.globalAlpha = baseA;
      }
      V.hit({ c: [r.x, r.y, 11], info: !pre && m > TL.hostStop ? RIBO_T4 : INFO.ribo });
    }
    // 細菌の DNA
    const hl = Story.hostLeft(pre ? 0 : m), keep = Math.floor(M.nuc.length * hl);
    const aliveSeg = i => M.nucRank[i] < keep && M.nucRank[i - 1] < keep;
    g.lineCap = 'round';
    if (keep > 0) {
      if (s < 1.5) {
        g.strokeStyle = 'rgba(110,170,255,.7)'; g.lineWidth = Math.max(1, (View.real ? 2 : 3) * s); g.beginPath();
        for (let i = 1; i < M.nuc.length; i++) if (aliveSeg(i)) { g.moveTo(V.X(M.nuc[i - 1][0]), V.Y(M.nuc[i - 1][1])); g.lineTo(V.X(M.nuc[i][0]), V.Y(M.nuc[i][1])); }
        g.stroke();
      } else for (let i = 1; i < M.nuc.length; i++) if (aliveSeg(i)) { const [a, b] = [M.nuc[i - 1], M.nuc[i]]; if (inView(a[0], a[1], 20)) V.helix(a[0], a[1], b[0], b[1], { c1: '#8fb8ff', c2: '#6ea9ff', phase: i }); }
      V.hit({ test: (x, y) => { for (let i = 1; i < M.nuc.length; i++) if (aliveSeg(i)) { const a = M.nuc[i]; if (Math.abs(a[0] - x) < 10 && Math.abs(a[1] - y) < 10) return true; } return false; }, info: INFO.hostDna });
    }
    // 細菌の DNA を切る酵素（切れたばかりのところ）
    if (!pre && m >= TL.hostDnaFrom && hl > 0.02 && s >= 1.5) {
      for (let k = keep; k < Math.min(M.nuc.length, keep + 40); k += 2) {
        const p = M.nuc[M.nucOrder[k]]; if (!inView(p[0], p[1])) continue;
        const two = k % 4 === 0; V.ell(p[0] + 3, p[1] + 3, 3.4, 2.6, 0.3, two ? '#ff8a8a' : '#ff6f9a', 'rgba(255,255,255,.5)');
        if (s > 6) V.text(two ? 'EndoII' : 'EndoIV', p[0] + 3, p[1] + 8, { size: 10, color: '#ffc0c0' });
        V.hit({ c: [p[0] + 3, p[1] + 3, 4], info: two ? ZINFO.endo2 : ZINFO.endo4 });
      }
    }
    // T4 の DNA（設計図）
    const nL = pre ? (st.id === 'inject' ? 1 : 0) : c.loops;
    for (let j = 0; j < nL; j++) {
      const L = M.loops[j]; let n = L.pts.length;
      if (st.id === 'inject') n = Math.max(2, Math.floor(n * Story.pierce(Story.landing(st).tA).dna));
      if (j > 0 && !pre) n = Math.max(2, Math.floor(n * Math.min(1, (c.pool - j) * 1.5)));
      if (gt) { for (let i = 0; i < n - 6; i += 9) V.line(L.pts.slice(i, i + 5), 'rgba(255,159,107,.7)', Math.max(1.4, 4 * s)); V.hit({ seg: L.pts, w: 10, info: ZINFO.cut || INFO.cut }); continue; }
      const back = j > 0 && j % 3 !== 0;
      if (back) { g.globalAlpha = baseA * BACK_A; V.line(L.pts.slice(0, n), '#ff9f6b', Math.max(1, (View.real ? 2 : 3) * s)); g.globalAlpha = baseA; continue; }
      if (s < 1.5 || View.real) V.line(L.pts.slice(0, n), '#ff9f6b', Math.max(1, (View.real ? 2 : 4) * s));
      else for (let i = 1; i < n; i++) { const a = L.pts[i - 1], b = L.pts[i]; if (!inView(a[0], a[1], 20)) continue; V.helix(a[0], a[1], b[0], b[1], { c1: '#ffb07a', c2: '#ff9f6b', phase: i * 2 }); if (s > 6 && i % 2 === 0) V.hex((a[0] + b[0]) / 2 + 1.6, (a[1] + b[1]) / 2 + 1.6, 0.7, '#bff5ef'); }
      V.hit({ seg: L.pts.slice(0, n), w: 6, info: INFO.t4Dna });
    }
    if (pre || gt || burst > 0) return;
    // 写し（mRNA）: T4 の DNA から近くの工場へ
    if (m > 0.3) {
      g.strokeStyle = m < TL.repl ? 'rgba(255,174,90,.5)' : m < TL.late ? 'rgba(255,216,107,.5)' : 'rgba(255,122,176,.5)'; g.lineWidth = Math.max(1, 0.5 * s);
      const cnt = Math.min(60, 10 + nL * 3);
      for (let i = 0; i < cnt; i++) {
        const L = M.loops[i % nL], p = L.pts[(i * 13) % L.pts.length], r = M.ribo[(i * 37) % M.ribo.length];
        if (Math.hypot(p[0] - r.x, p[1] - r.y) > 360) continue;
        const mx = (p[0] + r.x) / 2 + Math.sin(i + m * 5) * 20, my = (p[1] + r.y) / 2 + Math.cos(i + m * 5) * 20;
        g.beginPath(); g.moveTo(V.X(p[0]), V.Y(p[1])); g.quadraticCurveTo(V.X(mx), V.Y(my), V.X(r.x), V.Y(r.y)); g.stroke();
      }
    }
    // RNA ポリメラーゼ（DNA を読む機械、約15nm）と、付けかえるたんぱく
    for (let j = 0; j < nL; j++) for (let q = 0; q < 2; q++) {
      const L = M.loops[j], idx = Math.floor((((j * 0.53 + q * 0.5 + m * 0.07) % 1) + 1) % 1 * (L.pts.length - 1)), p = L.pts[idx];
      if (!inView(p[0], p[1])) continue;
      // 奥の DNA の輪に付いているものは、薄い点だけ（説明なし）
      if (j > 0 && j % 3 !== 0) { g.globalAlpha = baseA * BACK_A; g.fillStyle = '#9fb4c6'; g.fillRect(V.X(p[0]) - 1.5, V.Y(p[1]) - 1.5, 3, 3); g.globalAlpha = baseA; continue; }
      const per = m < 3.5 ? 'early' : m < TL.late ? 'middle' : 'late';
      // 引いて見るときも本当の大きさ（約15nm）で（寄ったときに急に大きくならない）
      if (s < 1.1) { const q = Math.max(1, 7 * s); g.fillStyle = '#9fb4c6'; g.fillRect(V.X(p[0]) - q, V.Y(p[1] + 4) - q * 0.8, 2 * q, 1.6 * q); }
      else {
        V.ell(p[0], p[1] + 4, 7.5, 6, 0, '#8aa4b8', 'rgba(255,255,255,.4)');
        if (per === 'late') { V.circle(p[0] - 5, p[1] + 7, 2.6, ZC.gp55); V.circle(p[0] + 5, p[1] + 8, 1.6, '#ffb3d6'); V.ell(p[0] - 9, p[1], 1.4, 3.4, 0, null, ZC.gp45, Math.max(1.5, 0.8 * s)); }
        else { V.ell(p[0] - 5, p[1] + 7, 3.2, 2.2, 0, ZC.sigma); V.circle(p[0] + 4, p[1] + 9, 1.3, ZC.alt); if (per === 'middle') { V.circle(p[0] - 8, p[1] + 9, 1.6, ZC.asia); V.ell(p[0] - 9, p[1] - 1, 2.2, 1.6, 0, ZC.mota); } }
        if (s > 5) V.text(per === 'late' ? 'RNAP＋gp55' : per === 'middle' ? 'RNAP＋AsiA・MotA' : 'RNAP（σ70・Alt）', p[0], p[1] + 15, { size: 10, color: '#cfe0ec' });
      }
      V.hit({ c: [p[0], p[1] + 4, 8], info: per === 'late' ? ZINFO.gp55 : per === 'middle' ? ZINFO.asia : ZINFO.rnap });
    }
    // DNA をコピーする機械（分かれ目）
    if (m >= TL.repl) for (let j = 0; j < nL; j++) {
      const L = M.loops[j], idx = Story.forkIdx(j, m), p = L.pts[idx];
      if (!inView(p[0], p[1])) continue;
      if (j > 0 && j % 3 !== 0) { g.globalAlpha = baseA * BACK_A; g.fillStyle = '#ffcf4a'; g.fillRect(V.X(p[0]) - 1.5, V.Y(p[1]) - 1.5, 3, 3); g.globalAlpha = baseA; continue; }
      if (s < 1.1) { V.circle(p[0], p[1], Math.max(8, 1.5 / s), '#ffcf4a'); }
      else {
        for (let k = 1; k <= 5; k++) { const q = L.pts[Math.min(L.pts.length - 1, idx + k)]; V.circle(q[0] + 2.5, q[1] + 2.5, 1.2, ZC.gp32); }
        V.ell(p[0], p[1], 3.2, 4.2, 0, null, ZC.gp41, Math.max(2, 1 * s));
        V.circle(p[0] - 6, p[1] + 4, 4.4, ZC.gp43, 'rgba(255,255,255,.4)'); V.circle(p[0] - 6, p[1] - 5, 4.4, ZC.gp43, 'rgba(255,255,255,.4)');
        V.ell(p[0] - 10.5, p[1] + 4, 1.2, 3, 0, null, ZC.gp45, Math.max(1.5, 0.8 * s));
        if (s > 5) { V.text('gp41', p[0] + 1, p[1] + 7.5, { size: 10, color: ZC.gp41 }); V.text('gp43', p[0] - 6, p[1] + 10.5, { size: 10, color: ZC.gp43 }); }
        V.hit({ c: [p[0], p[1], 4.5], info: ZINFO.gp41 }); V.hit({ c: [p[0] - 6, p[1] + 4, 4.5], info: ZINFO.gp43 }); V.hit({ c: [p[0] - 6, p[1] - 5, 4.5], info: ZINFO.gp43 }); V.hit({ c: [p[0] + 3, p[1] + 3, 2], info: ZINFO.gp32 });
      }
      V.hit({ c: [p[0], p[1], 8], info: ZINFO.gp43 });
    }
    // リゾチーム（中で待つ）
    if (m > 12) for (let i = 0; i < M.lyz.length * Math.min(1, (m - 12) / 8); i++) { const p = M.lyz[i]; if (!inView(p[0] ?? p.x, p.y)) continue; if (s < 1.1) { g.fillStyle = ZC.lyz; g.fillRect(V.X(p.x) - 1, V.Y(p.y) - 1, 2, 2); } else V.circle(p.x, p.y, 2, ZC.lyz); V.hit({ c: [p.x, p.y, 3], info: ZINFO.lyz }); }
    // 頭・しっぽ
    drawHeads(m, vb);
    // 流れる点（材料・部品）。点1つはたくさんの分子の代わり
    const PI = { mat: ZINFO.nuc, early: INFO.early, shell: ZINFO.gp23, tail: ZINFO.gp18, fiber: ZINFO.ltf };
    for (const q of Story.particles(m)) {
      // 部品は運ばれるのではなく、熱でふらふら動いて（ブラウン運動）、たまたま正しい所にぶつかるとくっつく。まっすぐには向かわない
      const d = Math.hypot(q.x1 - q.x0, q.y1 - q.y0), amp = 18 + d * 0.22, ph = q.key * 0.7;
      const at = k => { const j = Math.sqrt(Math.sin(Math.PI * k)); return [q.x0 + (q.x1 - q.x0) * k + j * amp * (Math.sin(k * 31 + ph) * 0.6 + Math.sin(k * 77 + ph * 2) * 0.4), q.y0 + (q.y1 - q.y0) * k + j * amp * (Math.cos(k * 27 + ph * 1.3) * 0.6 + Math.cos(k * 69 + ph) * 0.4)]; };
      const [x, y] = at(q.p);
      if (!inView(x, y)) continue;
      if (hash(q.key, 13) > 0.35) { g.globalAlpha = baseA * BACK_A; g.fillStyle = q.col; g.fillRect(V.X(x) - 1.5, V.Y(y) - 1.5, 3, 3); g.globalAlpha = baseA; continue; }
      if (s > 0.6) { const tr = []; for (let i = 6; i >= 0; i--) tr.push(at(Math.max(0, q.p - i * 0.02))); g.globalAlpha = 0.3; V.line(tr, q.col, 1); g.globalAlpha = baseA; }
      if (s < 2.5) { g.fillStyle = q.col; g.beginPath(); g.arc(V.X(x), V.Y(y), 2.6, 0, 7); g.fill(); }
      else V.circle(x, y, 2.6, q.col, 'rgba(255,255,255,.35)');
      V.hit({ c: [x, y, 4], info: PI[q.id] });
    }
  }
  const RIBO_T4 = { t: 'リボソーム（乗っとられた工場）', k: 'sure', b: '直径約20nm。細菌の工場はそのまま、T4 の設計図の写し（mRNA、ピンクの線）を読んで、T4 のたんぱく質（色のついた鎖）を作る。早い時期は DNA をこわす・コピーする酵素、9分ごろからは頭・しっぽ・脚の部品。' };

  // ---- 頭・しっぽ（拡大すると細かく）----
  // 頭としっぽの組み立て（部品が1つずつ付いていく。ふわっと浮かび上がらせない）
  //  born〜+0.35 内膜の上: 入口 gp20 → 足場の芯 → 殻のたんぱくが入口の側から付いていく
  //  〜fs 足場が切られて小さなかけらが出ていき、空の殻が内膜を離れる
  //  fs〜fe DNA をつめる（はじめに殻がふくらむ）。そのあいだに、しっぽは別の場所で 基盤 → 管 → さや（1段ずつ）→ ふた
  //  fe〜+JOIN 首ができて、しっぽが寄ってはまる。〜+0.6 長い脚が1本ずつ寄ってきて付く
  const PRO = 0.88;   // 殻がふくらむ前の大きさ（目安）
  function tailStage(Z, k) {
    const y0 = T4D.PLATE_TOP;
    const nW = Math.min(6, Math.floor(k / 0.15 * 7));
    if (k < 0.15) { // 基盤: 中心のまわりにくさびが1つずつ
      Z.rect(0, y0 - 11, 12, 22, ZC.hub, 2);
      for (let i = 0; i < nW; i++) { const x = [-19, 19, -13, 13, -7, 7][i]; Z.rect(x, y0 - 11, 6, 20, i % 2 ? '#b896f5' : ZC.wedge, 1); }
      return;
    }
    T4D.plate(Z, 0, y0); T4D.needle(Z, 0, y0 - 22); T4D.garland(Z, 0, y0 - 22, T4.plateW);
    const tl = Math.min(1, (k - 0.15) / 0.25) * (T4.sheathLen + 6);
    if (tl > 0) Z.rect(0, y0 + tl / 2, 9, tl, ZC.gp19, 1.5);
    const n = Math.max(0, Math.min(23, Math.floor((k - 0.4) / 0.45 * 23)));
    if (n > 0) T4D.sheath(Z, 0, y0, T4D.ringsExtended().slice(0, n));
    if (k >= 0.9) Z.rect(0, y0 + T4.sheathLen + 3, 22, 6, ZC.neck, 2);
  }
  function scaffold(Z, n, sc, frag) {
    for (let i = 0; i < n; i++) { const a = i * 2.39, rr = (i % 6) * 4.4 + 2; Z.circle(Math.cos(a) * rr * 0.9 * sc, Math.sin(a) * rr * 1.5 * sc - 6, 1.5, i % 8 === 0 ? ZC.gp21 : ZC.gp22); }
    // 切られた足場のかけら（殻のすきまから出ていく）
    if (frag > 0) for (let i = 0; i < 14; i++) { const a = i * 0.45 + 0.3, r = 30 + frag * 70 + (i % 3) * 6; Z.circle(Math.cos(a * 4.4) * r, Math.sin(a * 4.4) * r * 1.2, 0.9, ZC.gp22); }
  }
  function drawHeads(m, vb) {
    const M = Story.M, s = V.s;
    for (const h of M.heads) {
      if (m < h.born) break;
      const hp = Story.headAt(h, m);
      const back = h.z > FRONT, simple = s < 0.9 || back;
      g.globalAlpha = back ? baseA * BACK_A : baseA;
      const onMem = m < h.born + 0.35, maturing = !onMem && m < h.fs, packing = m >= h.fs && m < h.fe, joined = m >= h.fe + Story.JOIN, built = m >= h.fe;
      const near = V.visible(Math.min(h.x, hp.x) - 180, Math.min(h.y, hp.y) - 180, Math.max(h.x, hp.x) + 180, Math.max(h.y, hp.y) + 180);
      // しっぽ（DNA をつめているあいだに別の場所で組み立て → つめおわると寄ってはまる）
      if (m >= h.fs && !joined) {
        const tp = Story.tailPos(h, m), k = Math.min(1, (m - h.fs) / (h.fe - h.fs));
        if (V.visible(tp.x - 150, tp.y - 150, tp.x + 150, tp.y + 150)) {
          if (simple) {
            // 小さく描くとき: 基盤の側から伸びていく
            g.save(); g.translate(V.X(tp.x), V.Y(tp.y)); g.rotate(-tp.ang); g.scale(s, s);
            g.beginPath(); g.rect(-60, 40, 120, -40 - Math.max(8, k * 125)); g.clip(); drawPhageBody(g, { tailOnly: true }); g.restore();
          } else { const Z = V.local(tp.x, tp.y, tp.ang); tailStage(Z, k); g.restore(); }
          if (!back) V.hit({ c: [tp.x - 60 * Math.sin(tp.ang), tp.y + 60 * Math.cos(tp.ang), 60], info: SHEATH_ASM });
        }
      }
      // 頭へ吸いこまれる DNA
      if (packing && !back) {
        const P = Story.headPortal(h, m), L = nearestLoop(P);
        g.strokeStyle = 'rgba(255,159,107,.85)'; g.lineWidth = Math.max(1, 1.6 * s);
        g.beginPath(); g.moveTo(V.X(L[0]), V.Y(L[1])); g.quadraticCurveTo(V.X((L[0] + P.x) / 2 + 30), V.Y((L[1] + P.y) / 2 - 30), V.X(P.x), V.Y(P.y)); g.stroke();
      }
      if (!near) { g.globalAlpha = baseA; continue; }
      const a = Math.min(1, (m - h.born) / 0.35);                       // 殻が付いていく進み
      const fill = packing ? (m - h.fs) / (h.fe - h.fs) : built ? 1 : 0;
      const sc = m < h.fs ? PRO : packing ? PRO + (1 - PRO) * ease(fill / 0.08) : 1;  // ふくらむ
      if (simple) {
        if (joined) {
          g.save(); g.translate(V.X(h.x), V.Y(h.y)); g.rotate(-h.ang); g.scale(s, s);
          if (m < h.fe + 0.6) drawPhageBody(g, { fill: 1 }); else drawPhageSmall(g, { fill: 1 });
          g.restore();
        } else {
          // 頭だけ（頭の中心を原点にして描く）。内膜の上では入口の側から殻ができていく
          g.save(); g.translate(V.X(hp.x), V.Y(hp.y)); g.rotate(-hp.ang); g.scale(s * sc, s * sc); g.translate(0, T4.sheathLen + T4.neck + T4.headLen / 2);
          if (onMem) { g.beginPath(); g.rect(-70, -(T4.sheathLen + T4.neck) + 4, 140, -4 - a * (T4.headLen + 8)); g.clip(); }
          drawPhageBody(g, { fill, headOnly: true });
          g.restore();
        }
      } else if (!joined) {
        const Z = V.local(hp.x, hp.y, hp.ang), hh = T4.headLen / 2;
        if (onMem) {
          scaffold(Z, Math.floor(Math.min(1, a / 0.5) * 40), PRO * Math.min(1, 0.4 + a), 0);
          T4D.head(Z, 0, 0, { scale: PRO, grow: Math.max(0.02, (a - 0.1) / 0.9) });
        } else if (maturing) {
          const b = (m - h.born - 0.35) / (h.fs - h.born - 0.35);
          scaffold(Z, Math.floor(40 * (1 - Math.min(1, b * 1.6))), PRO, b);
          T4D.head(Z, 0, 0, { scale: PRO, cut: true, fill: 0, ip: false });
        } else {
          T4D.head(Z, 0, 0, { scale: sc, cut: packing, fill, ip: false, deco: built ? true : 0 });
          if (packing) for (let i = 0; i < 5; i++) { const an = m * 40 + i * 2 * Math.PI / 5; Z.circle(Math.cos(an) * 6, -hh * sc - 6 + Math.sin(an) * 2.4, 2.4, ZC.gp17); } // つめこみモーター gp17
          if (built) Z.rect(0, -hh - T4.neck / 2, 22, T4.neck, ZC.neck, 2); // 首 gp13・gp14
        }
        g.restore();
      } else {
        // しっぽが付いたあと: 長い脚が1本ずつ寄ってきて付く
        const Z = V.local(h.x, h.y, h.ang), hc = T4D.PLATE_TOP + T4.sheathLen + T4.neck + T4.headLen / 2;
        T4D.head(Z, 0, hc, { deco: true });
        T4D.plate(Z, 0, T4D.PLATE_TOP); T4D.needle(Z, 0, T4D.PLATE_TOP - 22); T4D.garland(Z, 0, T4D.PLATE_TOP - 22, T4.plateW);
        Z.rect(0, T4D.PLATE_TOP + T4.sheathLen / 2, 9, T4.sheathLen + 6, ZC.gp19, 1.5);
        T4D.sheath(Z, 0, T4D.PLATE_TOP, T4D.ringsExtended()); Z.rect(0, T4D.PLATE_TOP + T4.sheathLen + 4, 22, T4.neck, ZC.neck, 2);
        [0, 60, 120, 180, 240, 300].forEach((d, i) => {
          const t0 = h.fe + Story.JOIN + i * 0.05, e = ease((m - t0) / 0.05);
          if (m < t0 - 0.04) return;
          const p = T4D.ltfPose(0, T4D.PLATE_TOP, d * Math.PI / 180), sx = Math.cos(d * Math.PI / 180) >= 0 ? 1 : -1, off = (1 - e) * 90;
          // 熱でゆれながら寄ってきて、ぶつかったところで受け口 gp9 にはまる（ひげが助ける）
          const jx = (1 - e) * 18 * Math.sin(m * 700 + i * 2.1), jy = (1 - e) * 14 * Math.cos(m * 830 + i);
          const mv = q => [q[0] + sx * off + jx, q[1] - off * 0.4 + jy];
          T4D.ltf(Z, mv(p.hip), mv(p.knee), mv(p.tip), p.depth);
        });
        g.restore();
      }
      g.globalAlpha = baseA;
      if (back) continue;
      // 解説（手前のものだけ）
      const P = Story.headPortal(h, m), c = joined ? Story.headCenter(h) : hp;
      if (packing) V.hit({ c: [P.x, P.y, 12], info: ZINFO.gp17 });
      else if (!built) V.hit({ c: [P.x, P.y, 9], info: ZINFO.gp20 });
      V.hit({ c: [c.x, c.y, 60], info: joined ? (m >= h.fe + 0.6 ? INFO.phage : ZINFO.join) : built ? ZINFO.neck : packing ? ZINFO.dnaIn : maturing ? ZINFO.gp21 : (a < 0.5 ? ZINFO.gp22 : ZINFO.gp23) });
      if (joined) V.hit({ c: [h.x - 50 * Math.sin(h.ang), h.y + 50 * Math.cos(h.ang), 40], info: ZINFO.gp18 });
    }
  }
  const SHEATH_ASM = { t: 'しっぽ（頭とは別に組み立て中）', k: 'sure', b: '基盤（くさび6つ＋中心）→ 管 gp19 → さや gp18（6個×23段）→ ふた gp3・gp15 の順にできる。DNA のつまった頭に寄っていって付く（Leiman ら 2010）。' };
  function nearestLoop(P) { const M = Story.M, c = Story.counts(0); let best = M.loops[0], bd = 1e18; for (let j = 0; j < M.loops.length; j++) { const L = M.loops[j]; const d = (L.cx - P.x) ** 2 + (L.cy - P.y) ** 2; if (d < bd) { bd = d; best = L; } } return best.pts[35]; }

  // ---- ホリン（内膜）----
  function drawHolins(m, pre, burst) {
    if (pre || m <= 12 || Story.cond === 'gt') return;
    const n = Math.floor(Math.min(1, (m - 12) / Math.max(1, Story.M.tEnd - 12)) * 160);
    g.fillStyle = '#ff6fa8';
    for (let i = 0; i < n; i++) { const p = swell > 0 ? swollen((i * 0.618) % 1, 31.5, swell) : perim((i * 0.618) % 1, 31.5); if (V.s < 1) g.fillRect(V.X(p.x) - 2, V.Y(p.y) - 2, 4, 4); else V.rect(p.x, p.y, 2.2, 6, '#ff6fa8', 0.6); }
  }

  // ---- 破れて出る ----
  // 破れたところへ寄りながら、まわりへ広がる。k: 0..1（破れてから）
  function burstPos(h, k) {
    const tp = perim(TEAR_U, 0), hb = h.born * 1000 | 0, oa = Math.atan2(h.y, h.x), ta = Math.atan2(tp.y - h.y, tp.x - h.x), a = (hash(hb, 7) < 0.45 ? ta : oa) + (hash(hb, 3) - 0.5) * 1.2, v = 300 + hash(hb, 4) * 700;
    const kv = 1 - Math.pow(1 - k, 2.2);
    return { x: h.x + Math.cos(a) * v * kv * 1.8, y: h.y + Math.sin(a) * v * kv * 1.8, ang: h.ang + kv * 2, a, kv, hb };
  }
  // 小さなファージの形（寄って大きく見えるとき）か点（引いて見るとき）
  function phageMark(x, y, ang, alpha = 1) {
    if (V.s * 200 >= 7) { g.save(); g.globalAlpha = alpha; g.translate(V.X(x), V.Y(y)); g.rotate(-ang); g.scale(V.s, V.s); drawPhageSmall(g, { fill: 1 }); g.restore(); }
    else { const sz = Math.max(1.6, Math.min(5, 160 * V.s)); g.globalAlpha = alpha; g.fillStyle = '#ffe3a3'; g.fillRect(V.X(x) - sz / 2, V.Y(y) - sz / 2, sz, sz); g.globalAlpha = 1; }
  }
  function drawBurst(m, k0) {
    const M = Story.M, k = Math.max(0, (k0 - 0.22) / 0.78);
    // 破れる前（ふくらむあいだ、k=0）も、その場所にそのまま描く（消えないように）
    for (const h of M.heads) {
      const { x, y, ang, kv } = burstPos(h, k), ok = M.tEnd >= h.fe + 0.6;
      // 中で奥にあったものは薄いまま始まり、外へ出るにつれてくっきり（中の絵から急に変わらないように）
      g.save(); g.globalAlpha = h.z > FRONT ? BACK_A + (1 - BACK_A) * kv : 1; g.translate(V.X(x), V.Y(y)); g.rotate(-ang); g.scale(V.s, V.s);
      if (ok) drawPhageSmall(g, { fill: 1 }); else { g.globalAlpha = Math.max(0, 1 - k * 2); drawPhageBody(g, { fill: 0.5, alpha: 0.6 }); }
      g.restore();
      if (ok) V.hit({ c: [x - 160 * Math.sin(ang), y + 160 * Math.cos(ang), 70], info: INFO.phage });
    }
  }

  // ---- もしも: あとから来たファージ ----
  function drawSecond(m) {
    const Z = V.at(SECOND.x, SECOND.y);
    g.save(); g.translate(V.X(SECOND.x), V.Y(SECOND.y + 10)); g.scale(V.s, V.s); drawPhageSmall(g, { fill: 0, ghost: true, sheath: T4.sheathShort, sheathW: T4.sheathWShort, plateW: T4.plateWStar }); g.restore();
    const pts = []; for (let i = 0; i < 30; i++) pts.push([SECOND.x - 120 + i * 8, R - 20 + Math.sin(i * 1.3) * 4]);
    V.line(pts, '#ffc06b', Math.max(1.2, 3 * V.s)); V.hit({ seg: pts, w: 6, info: INFO.second }); V.hit({ c: [SECOND.x, SECOND.y + 160, 90], info: INFO.second });
  }

  // ---- 着陸するファージ（近づく〜DNA が入る。そのあとは空のぬけがら）----
  function drawLanding(st) {
    if (st.id === 'spread') return;
    const L = Story.landing(st), P = Story.pierce(L.tA);
    let Z, turned = false;
    if (st.id === 'burst') {
      const A = siteAnchor(st.p); Z = V.local(A.x, A.y, A.ang); turned = true;
      g.globalAlpha = 1 - 0.6 * (A.kk || 0);
    } else Z = V.at(SITE.x + L.dx, SITE.y);
    const Hb = L.tA >= 0 ? 70 - 36 * P.star : L.hb, h = 22 - 10 * P.star, w = T4.plateW + (T4.plateWStar - T4.plateW) * P.star;
    const rings = []; let tw = 0, Ls = 0;
    for (let i = 0; i < 23; i++) { const f = P.ring(i); rings.push({ h: T4.sheathLen / 23 + (T4.sheathShort / 23 - T4.sheathLen / 23) * f, r: 12 + 4.5 * f, tw }); tw += (17.2 + (31.47 - 17.2) * f) * Math.PI / 180; Ls += rings[i].h; }
    const pb = Hb - h, tubeEnd = Hb + Ls - (T4.sheathLen + 12);
    let needleTip = tubeEnd - 19; const nOff = needleTip < -15; if (nOff) needleTip = -15;
    // 穴（外膜・細胞壁）
    if (Ls < T4.sheathLen - 1) Z.rect(0, -3.5, 10, 7.4, '#152427');
    if (P.lyso > 0) Z.rect(0, -13, 14 * P.lyso + 2, 6.4, '#152427');
    // DNA が細菌の中へ（入るあいだ）
    if (P.dna > 0 && !L.after) {
      const pts = [[0, tubeEnd]]; let x = 0, y = tubeEnd, a = -Math.PI / 2;
      for (let i = 0; i < Math.floor(P.dna * 160); i++) { a += Math.sin(i * 1.7) * 0.9 + (-Math.PI / 2 - a) * 0.05; x += Math.cos(a) * 1.8; y += Math.sin(a) * 1.8; if (y > -37) { y = -37; a = -Math.abs(a); } if (Math.abs(x) > 60) a = Math.PI - a; pts.push([x, y]); }
      Z.line(pts, '#ff9f6b', Math.max(1.2, 0.8 * V.s));
      for (let i = 0; i < Math.floor(P.dna * 20); i++) Z.circle(Math.sin(i * 2.3) * 40, -45 - (i % 5) * 6, 1.4, i % 6 === 0 ? ZC.alt : ZC.ip);
    }
    // 脚（奥）
    const legs = [0, 60, 120, 180, 240, 300].map((d, i) => legPts(d * Math.PI / 180, L.bound[i], L.k[i], Hb, P.star, w, L.touch));
    for (const p of legs) if (p.depth < 0.5) T4D.ltf(Z, p.hip, p.knee, p.tip, p.depth);
    // 短い脚
    if (P.gp12 <= 0) T4D.garland(Z, 0, pb - 1, w);
    else for (const sx of [-1, -0.5, 0.5, 1]) { const x0 = sx * (w / 2 - 4), len = Math.max(6, pb - 3); Z.line([[x0, pb], [x0 + Math.cos(-Math.PI / 2 * P.gp12) * len * 0.35 * sx, pb + Math.sin(-Math.PI / 2 * P.gp12) * len]], ZC.gp12, Math.max(1.5, 1.4 * V.s)); }
    // 管と針
    Z.rect(0, (Hb + Ls + tubeEnd) / 2, 9, Hb + Ls - tubeEnd, ZC.gp19, 1.5);
    if (!nOff) T4D.needle(Z, 0, tubeEnd); else { Z.poly([[-2.4, needleTip + 11], [2.4, needleTip + 11], [0.6, needleTip], [-0.6, needleTip]], ZC.gp5); if (P.lyso < 1) Z.circle(6 + 4 * P.lyso, -13, 2.4, ZC.lyz); }
    // 頭（さやが縮むと下がる。DNA が出ると空）・基盤・さや・首
    T4D.head(Z, 0, Hb + Ls + T4.neck + T4.headLen / 2, { cut: true, fill: 1 - P.dna, ip: P.dna < 0.6 });
    T4D.plate(Z, 0, Hb, { star: P.star });
    T4D.sheath(Z, 0, Hb, rings);
    Z.rect(0, Hb + Ls + 4, 22, 8, ZC.neck, 2);
    for (const p of legs) if (p.depth >= 0.5) T4D.ltf(Z, p.hip, p.knee, p.tip, p.depth);
    // 解説
    for (const p of legs) Z.hit({ seg: [p.hip, p.knee, p.tip], w: 3, info: ZINFO.ltf });
    Z.hit({ c: [0, Hb + Ls + T4.neck + 60, 55], info: P.dna >= 1 ? GHOST : ZINFO.dnaIn });
    Z.hit({ box: [-14, Hb, 14, Hb + Ls], info: ZINFO.gp18 });
    Z.hit({ box: [-w / 2, pb, w / 2, Hb], info: ZINFO.plate });
    if (P.gp12 > 0) Z.hit({ box: [-w / 2, 2, w / 2, pb], info: ZINFO.gp12 });
    Z.hit({ box: [-5, Math.min(tubeEnd, needleTip), 5, Hb], info: nOff ? ZINFO.gp19 : ZINFO.gp5 });
    if (P.dna > 0 && !L.after) Z.hit({ box: [-60, -80, 60, -36], info: ZINFO.alt });
    if (turned) { g.restore(); g.globalAlpha = 1; }
  }
  const GHOST = { t: 'ぬけがら（ゴースト）', k: 'sure', b: 'DNA を入れおわった、空っぽの頭としっぽ。もう感染できない。細菌の表面にささったまま残り、細菌が破れると、ささっていた膜のかけらといっしょに流される（ごみとして残る）。' };
  function legPts(phi, bound, k, Hb, star, w, touch) {
    const c = Math.cos(phi), sn = Math.sin(phi), hip = { x: (w / 2) * c, y: Hb - 9 * (1 - star) - 3, z: (w / 2) * sn };
    const freeTip = { x: 110 * c, y: Hb - 49, z: 110 * sn }, gnd = { x: 110 * c, y: 3, z: 110 * sn };
    const kk = bound ? k : touch ? 1 : 0;
    const T = { x: freeTip.x + (gnd.x - freeTip.x) * kk, y: Math.max(3, freeTip.y + (gnd.y - freeTip.y) * kk), z: freeTip.z };
    const hint = { x: 88 * c, y: Hb + 40, z: 88 * sn }, L1 = 70, L2 = 75;
    let vx = T.x - hip.x, vy = T.y - hip.y, vz = T.z - hip.z, D = Math.hypot(vx, vy, vz);
    if (D > L1 + L2 - 1) { const q = (L1 + L2 - 1) / D; vx *= q; vy *= q; vz *= q; D = L1 + L2 - 1; }
    const ux = vx / D, uy = vy / D, uz = vz / D; let wx = hint.x - hip.x, wy = hint.y - hip.y, wz = hint.z - hip.z; const dp = wx * ux + wy * uy + wz * uz; wx -= dp * ux; wy -= dp * uy; wz -= dp * uz; const wl = Math.hypot(wx, wy, wz) || 1;
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    return { hip: [hip.x, hip.y], knee: [hip.x + ux * a + wx / wl * hh, hip.y + uy * a + wy / wl * hh], tip: [hip.x + vx, hip.y + vy], depth: 0.5 + 0.5 * sn };
  }

  // ---- 名前の札（細菌全体を見ているとき）----
  function drawTags(m, c) {
    const M = Story.M, sm = V.W < 520, tags = [];
    if (Story.cond === 'gt' && m >= 0.4) return;
    const L0 = M.loops[0];
    tags.push({ text: `設計図: T4 の DNA（約${Math.round(c.genomes)}本ぶん）`, c: '#ff9f6b', ax: L0.pts[20][0], ay: L0.pts[20][1], slot: 'tl', pri: 1 });
    if (m > TL.hostStop) { const r = M.ribo[7]; tags.push({ text: '工場: 細菌のリボソーム（T4 の部品を作る）', c: '#dcc8aa', ax: r.x, ay: r.y, slot: 'tr', pri: 2 }); }
    if (m > TL.hostDnaFrom && Story.hostLeft(m) > 0.05) tags.push({ text: '材料: 細菌の DNA をこわして使う', c: '#6ea9ff', ax: 0, ay: -60, slot: 'bl', pri: 3 });
    const bld = M.heads.filter(h => m >= h.born && m < h.fs);
    if (bld.length) { const q = Story.headCenter(bld[bld.length - 1], m); tags.push({ text: '頭の殻を組み立て中（緑の点が部品）', c: '#5fe0c4', ax: q.x, ay: q.y, slot: 'bl', pri: 4 }); }
    const tl = M.heads.filter(h => m >= h.fs && m < h.fe);
    if (tl.length) { const h = tl[0], p = Story.tailPos(h, m); tags.push({ text: 'しっぽ（別に作って、頭に付く。紫の点が部品）', c: '#c39bff', ax: p.x, ay: p.y, slot: 'br', pri: 5 }); const P = Story.headPortal(h); tags.push({ text: '頭に DNA をつめている', c: '#ff9f6b', ax: P.x, ay: P.y, slot: 'tr', pri: 6 }); }
    const dn = M.heads.find(h => m >= h.fe + 0.6);
    if (dn) tags.push({ text: `完成（${c.done}個）`, c: '#e8f0f4', ax: dn.x, ay: dn.y, slot: 'br', pri: 7 });
    const bySlot = {}; for (const t of tags) if (!bySlot[t.slot] || bySlot[t.slot].pri < t.pri) bySlot[t.slot] = t;
    let list = Object.values(bySlot).sort((a, b) => b.pri - a.pri); if (sm) list = list.slice(0, 2);
    const fs = sm ? 11 : 12.5; g.font = `700 ${fs}px "Zen Kaku Gothic New", sans-serif`; g.textBaseline = 'middle';
    const cl = V.X(-CELL.L / 2), cr = V.X(CELL.L / 2), top = V.Y(R), bot = V.Y(-R);
    const pos = { tl: [Math.max(8, cl - 10), top - 18, 'left'], tr: [Math.min(V.W - 8, cr + 10), top - 18, 'right'], bl: [Math.max(8, cl - 10), bot + 20, 'left'], br: [Math.min(V.W - 8, cr + 10), bot + 20, 'right'] };
    for (const t of list) {
      const [px, py, al] = pos[t.slot], w = g.measureText(t.text).width, bx = al === 'left' ? px : px - w, ax = V.X(t.ax), ay = V.Y(t.ay);
      g.strokeStyle = 'rgba(232,240,244,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(bx + w / 2, py); g.lineTo(ax, ay); g.stroke();
      g.fillStyle = 'rgba(10,22,27,.88)'; g.fillRect(bx - 6, py - fs * 0.8, w + 12, fs * 1.6);
      g.fillStyle = t.c; g.textAlign = 'left'; g.fillText(t.text, bx, py); g.beginPath(); g.arc(ax, ay, 3, 0, 7); g.fill();
    }
  }

  // ---- 破れたあとの膜のかけら（模式）。外膜・細胞壁・内膜の3本の線で描く ----
  const TEAR_U = (300 + HL) / (4 * HL + 2 * Math.PI * R);   // 破れる場所（上面の x=300。場所は模式）
  const CUTS = [0, 0.1, 0.24, 0.37, 0.5, 0.61, 0.76, 0.89];
  const DEBRIS = { t: 'ちぎれた膜のかけら', k: 'sure', b: '細胞壁（ペプチドグリカン）が切られると、細菌は棒の形を保てずにふくらみ、内膜・外膜も破れて中身がいっせいに出る。細菌は死に、膜はちぎれたかけらになる。形のくずれ方・かけらの数は模式。' };
  function frag(f, kk) {
    const gap = 0.006 + 0.03 * Math.min(1, kk * 2.5), ua = TEAR_U + CUTS[f] + gap, ub = TEAR_U + (CUTS[f + 1] ?? 1) - gap;
    const mid = swollen((ua + ub) / 2, 0, 1), dir = Math.atan2(mid.ny, mid.nx), push = 90 * kk * (0.7 + 0.6 * hash(f, 11)), rot = (hash(f, 12) - 0.5) * 0.9 * kk, curl = 1 - 0.3 * kk;
    const cx = mid.x, cy = mid.y, ox = Math.cos(dir) * push, oy = Math.sin(dir) * push, cr = Math.cos(rot), sr = Math.sin(rot);
    const tf = p => { const dx = (p.x - cx) * curl, dy = (p.y - cy) * curl; return [cx + ox + dx * cr - dy * sr, cy + oy + dx * sr + dy * cr]; };
    return { ua, ub, rot, tf };
  }
  // ファージがささった場所（ぬけがら）が、いまどこにあるか: ふくらむと外へ動き、破れたあとはそのかけらといっしょに流れる
  const SITE_U = (SITE.x + HL) / (4 * HL + 2 * Math.PI * R);
  function siteAnchor(burst) {
    const TEAR = 0.22;
    if (burst < TEAR) { const e = ease(burst / TEAR), p = swollen(SITE_U, 0, e); return { x: p.x, y: p.y, ang: Math.atan2(-p.nx, p.ny) }; }
    const kk = (burst - TEAR) / (1 - TEAR), rel = (((SITE_U - TEAR_U) % 1) + 1) % 1;
    let f = 0; while (f < CUTS.length - 1 && rel >= CUTS[f + 1]) f++;
    const F = frag(f, kk), p = swollen(SITE_U, 0, 1), q = F.tf(p);
    return { x: q[0] + Math.sin(SITE_U * 140 + f) * 10 * kk, y: q[1] + Math.cos(SITE_U * 120 + f) * 10 * kk, ang: Math.atan2(-p.nx, p.ny) + F.rot, kk };
  }
  function drawDebris(kk) {
    for (let f = 0; f < CUTS.length; f++) {
      const { ua, ub, tf } = frag(f, kk);
      if (ub <= ua) continue;
      g.globalAlpha = Math.max(0.5, 1 - kk * 0.4);
      for (const [mm, col, w] of [[31.5, '#6f8ea8', 7], [13, '#8a9a58', 6], [3.5, '#86a6c2', 7]]) {
        const pts = []; for (let i = 0; i <= 24; i++) { const u = ua + (ub - ua) * i / 24, p = swollen(u, mm, 1); const q = tf(p); q[0] += Math.sin(u * 140 + f) * 10 * kk; q[1] += Math.cos(u * 120 + f) * 10 * kk; pts.push(q); }
        V.line(pts, col, Math.max(2, w * V.s));
        if (mm === 3.5) V.hit({ seg: pts, w: 20, info: DEBRIS });
      }
      g.globalAlpha = 1;
    }
  }
  function drawBurstTag(k, torn) {
    const tp = perim(TEAR_U, 0), text = torn ? '1か所が破れて、中身がいっせいに出る' : '細胞壁が切られ、棒の形を保てずにふくらむ';
    V.text(text, tp.x, tp.y + 260, { size: 13, bold: true, color: '#ffd0e0', bg: 'rgba(10,22,27,.85)' });
  }

  // ---- 生き物らしい見た目: べん毛・線毛（外）、中のこみあい・立体感（中）----
  // 大腸菌 K-12 は体のあちこちからべん毛（太さ約20nm、長さ5〜10µm）が出る。線毛（太さ約7nm）は短い毛。本数・向きは模式
  const FLAG = [0.16, 0.29, 0.47, 0.6, 0.71, 0.86];
  const FLAG_INFO = { t: 'べん毛', k: 'sure', b: '細菌が泳ぐためのらせんの毛（太さ約20nm、長さ5〜10µm）。根もとのモーターで回る。T4 はべん毛ではなく、外膜の OmpC にくっつく。本数・形は模式。' };
  function drawAppendages(m, alpha) {
    if (alpha <= 0 || V.s > 6) return;
    // 寄って見ているときは薄く（太さは本当の約20nm。ファージのしっぽと同じくらい）
    g.save(); g.globalAlpha = alpha * (V.s > 0.6 ? 0.35 : 0.8);
    for (let i = 0; i < FLAG.length; i++) {
      const b = perim(FLAG[i], 0), ax = Math.max(-HL, Math.min(HL, b.x)), nl = Math.hypot(b.x - ax, b.y) || 1, nx = (b.x - ax) / nl, ny = b.y / nl;
      const tx = -ny, ty = nx, len = 5000 + 3000 * hash(i, 21), ph = i * 1.7 + m * 0.4, pts = [];
      for (let d = 0; d <= len; d += Math.max(40, 3 / V.s)) { const wv = Math.sin(d / 2300 * Math.PI * 2 + ph) * 230 * Math.min(1, d / 600); pts.push([b.x + nx * d + tx * wv, b.y + ny * d + ty * wv]); }
      g.strokeStyle = 'rgba(200,214,224,.55)'; g.lineWidth = Math.max(1, 20 * V.s); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); pts.forEach(([x, y], j) => j ? g.lineTo(V.X(x), V.Y(y)) : g.moveTo(V.X(x), V.Y(y))); g.stroke();
      V.hit({ seg: pts, w: 25, info: FLAG_INFO });
    }
    if (V.s > 0.25) {
      g.strokeStyle = V.s > 0.6 ? 'rgba(190,206,214,.13)' : 'rgba(190,206,214,.22)'; g.lineWidth = Math.max(0.6, 7 * V.s); g.beginPath();
      for (let i = 0; i < 70; i++) {
        const u = (i * 0.6180339 + 0.05) % 1, b = perim(u, 0);
        const ax = Math.max(-HL, Math.min(HL, b.x)), nl = Math.hypot(b.x - ax, b.y) || 1, nx = (b.x - ax) / nl, ny = b.y / nl, L = 300 + 700 * hash(i, 22), bend = (hash(i, 23) - 0.5) * 0.5;
        g.moveTo(V.X(b.x), V.Y(b.y)); g.lineTo(V.X(b.x + (nx - ny * bend) * L), V.Y(b.y + (ny + nx * bend) * L));
      }
      g.stroke();
    }
    g.restore();
  }
  // 中: たんぱく質などがぎっしり。小さな粒の模様と、円柱らしい陰（模式）
  const crowd = {};
  function crowdPattern(dense) {
    if (crowd[dense]) return crowd[dense];
    const c = document.createElement('canvas'); c.width = c.height = 256; const q = c.getContext('2d'), rr = rng(77);
    // 本物に近い見た目では3倍ぎっしり（細胞の中はたんぱく質などで混みあっている）
    for (let i = 0; i < (dense ? 4500 : 1500); i++) { const v = 150 + rr() * 80 | 0; q.fillStyle = `rgba(${v},${v + 20},${v + 10},${0.05 + rr() * 0.12})`; q.beginPath(); q.arc(rr() * 256, rr() * 256, 0.8 + rr() * 2.2, 0, 7); q.fill(); }
    crowd[dense] = g.createPattern(c, 'repeat'); return crowd[dense];
  }
  function drawCytoLook(pre, m) {
    // 粒の模様（1枚 = 200nm 四方。寄っても引いても世界に貼りつく）
    const pat = crowdPattern(View.real);
    const pa = Math.max(0, Math.min(1, (V.s - 0.4) / 0.3, (8 - V.s) / 3));
    if (pat && pat.setTransform && typeof DOMMatrix !== 'undefined' && pa > 0) {
      const k = 200 * V.s / 256; pat.setTransform(new DOMMatrix([k, 0, 0, k, V.X(0), V.Y(0)]));
      g.save(); g.globalAlpha *= pa; g.fillStyle = pat; g.fillRect(0, 0, V.W, V.H); g.restore();
    }
    // 円柱の陰（上下のふちが暗く、まん中が少し明るい）
    const gr = g.createLinearGradient(0, V.Y(R), 0, V.Y(-R));
    gr.addColorStop(0, 'rgba(0,0,0,.38)'); gr.addColorStop(0.22, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,.04)'); gr.addColorStop(0.78, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = gr; g.fillRect(0, 0, V.W, V.H);
  }

  // ---- まわりの細菌（たくさんの細菌・次々にうつる）----
  const OTHER = { t: '別の大腸菌', k: 'sure', b: '同じ水の中のなかま。T4 が近くで増えると、ここにもファージがとりつく。位置・動き方は模式。' };
  const OTHER_INF = { t: 'ファージにとりつかれた大腸菌', k: 'sure', b: '中で T4 が増えている（まん中の細菌と同じことが起きている）。約20〜25分で破れる。' };
  const CLOUD = { t: '広がるファージ', k: 'est', b: '破れた細菌から出たファージ（1つの細菌から100個以上）。水の中をただよって、近くの細菌にとりつく。点の数は実際より少なく、広がり方は模式。' };
  function drawColony(tau, rm) {
    const P = Story.P; if (!P) return;
    const vb = V.viewBox();
    for (let i = 0; i < P.cells.length; i++) {
      const c = P.cells[i], q = Story.cellPose(c, tau, rm);
      if (q.x + 2000 < vb.x0 || q.x - 2000 > vb.x1 || q.y + 2000 < vb.y0 || q.y - 2000 > vb.y1) continue;
      if (rm >= c.tBurst) { // 破れたあと: ちぎれた膜のかけら
        const k = Math.min(1, (rm - c.tBurst) / 3);
        g.globalAlpha = 0.85 - 0.45 * k;
        for (let f = 0; f < 6; f++) {
          const a0 = f / 6 * Math.PI * 2 + hash(i, f) * 0.5, a1 = a0 + 0.7, r = 520 + 300 * k, ox = Math.cos(a0 + 0.35) * 260 * k, oy = Math.sin(a0 + 0.35) * 260 * k, pts = [];
          for (let j = 0; j <= 8; j++) { const a = a0 + (a1 - a0) * j / 8; pts.push([q.x + ox + Math.cos(a) * r * (c.len / 2000), q.y + oy + Math.sin(a) * r * 0.75]); }
          V.line(pts, '#5a7a96', Math.max(1, 14 * V.s));
        }
        g.globalAlpha = 1;
        continue;
      }
      const Z = V.local(q.x, q.y, q.ang), inf = rm >= c.tInf, L = c.len;
      // べん毛（うつったあとは止まる）
      if (V.s < 0.6) {
        g.strokeStyle = 'rgba(200,214,224,.45)'; g.lineWidth = Math.max(1, 20 * V.s); g.beginPath();
        for (const sgn of [-1, 1]) { const ph = inf ? 0 : tau * 2.2 * c.sw; for (let d = 0; d <= 3000; d += 60) { const x = sgn * (L / 2 + d), y = Math.sin(d / 2300 * 6.28 + ph) * 230 * Math.min(1, d / 600); d ? g.lineTo(x * V.s, -y * V.s) : g.moveTo(x * V.s, -y * V.s); } }
        g.stroke();
      }
      Z.rect(0, 0, L, 900, '#46617a', 450);
      Z.rect(0, 0, L - 70, 830, inf ? '#2a2a2e' : '#1f3236', 415);
      Z.rect(0, -60, L * 0.55, 330, 'rgba(110,169,255,.10)', 160);   // 細菌の DNA のかたまり
      if (inf) { // 中で増えているファージ（点）
        const n = Math.floor(Math.max(0, Math.min(1, (rm - c.tInf - 9) / Math.max(1, c.tBurst - c.tInf - 9))) * 40);
        for (let j = 0; j < n; j++) Z.circle((hash(i * 97 + j, 1) - 0.5) * (L - 300), (hash(i * 97 + j, 2) - 0.5) * 600, 40, '#5fe0c4');
      }
      g.restore();
      V.hit({ c: [q.x, q.y, 600], info: inf ? OTHER_INF : OTHER });
    }
  }
  // 広がるファージ（破れた細菌ごとに点の雲）
  function drawSpread(rm) {
    const P = Story.P, M = Story.M, src = [];
    const vb = V.viewBox(), inV = (x, y) => x > vb.x0 - 300 && x < vb.x1 + 300 && y > vb.y0 - 300 && y < vb.y1 + 300;
    // 最初の細菌から出たファージ（破れる場面の最後の位置から続ける）
    {
      const R2 = Story.REACH * 1.15 * Math.sqrt(Math.min(1, rm / 3)) + 700 * Math.min(1, rm / 40), wob = Math.min(1, rm * 2);
      for (const h of M.heads) {
        if (M.tEnd < h.fe + 0.6) continue;
        const b = burstPos(h, 1), f = 0.25 + 0.75 * Math.sqrt(hash(b.hb, 6));
        const x = b.x + Math.cos(b.a) * R2 * f + wob * Math.sin(rm * 0.7 + b.hb) * 120, y = b.y + Math.sin(b.a) * R2 * f + wob * Math.cos(rm * 0.6 + b.hb * 1.3) * 120;
        if (inV(x, y)) phageMark(x, y, b.ang + rm * 0.3);
      }
      V.hit({ c: [0, 0, 1800 + R2 * 0.8], info: CLOUD });
    }
    for (let i = 0; i < P.cells.length; i++) { const c = P.cells[i]; if (rm >= c.tBurst) { const q = Story.cellPose(c, 0, c.tInf); src.push({ x: q.x, y: q.y, t: c.tBurst, i, r0: 300 }); } }
    for (const sc of src) {
      const dt = rm - sc.t, R = Story.REACH * 1.15 * Math.sqrt(Math.min(1, dt / 3)) + 700 * Math.min(1, dt / 40);
      for (let j = 0; j < 70; j++) {
        const a = hash(sc.i * 131 + j, 5) * 6.283, f = 0.25 + 0.75 * Math.sqrt(hash(sc.i * 131 + j, 6)), r = sc.r0 * f + R * f;
        const x = sc.x + Math.cos(a) * r + Math.sin(rm * 0.7 + j) * 120, y = sc.y + Math.sin(a) * r + Math.cos(rm * 0.6 + j * 1.3) * 120;
        if (inV(x, y)) phageMark(x, y, a + rm * 0.3);
      }
      V.hit({ c: [sc.x, sc.y, Math.max(600, sc.r0 + R * 0.8)], info: CLOUD });
    }
    // 数（目安）
    const cc = Story.colonyCounts(rm), fs = V.W < 520 ? 12 : 14;
    const text = `ファージ 約${cc.phage.toLocaleString()}個 ・ 破れた細菌 ${cc.burst} ／ ${cc.cells}（目安）`;
    g.font = `700 ${fs}px "Zen Kaku Gothic New", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(text).width; g.fillStyle = 'rgba(10,22,27,.88)'; g.fillRect(V.W / 2 - w / 2 - 8, 70, w + 16, fs * 1.8);
    g.fillStyle = '#ffe3a3'; g.fillText(text, V.W / 2, 70 + fs * 0.9);
  }
  // ほかのファージ（腸の中にはファージがたくさんいる。ここに描く数は実際よりずっと少ない）
  const FREE = { t: 'ほかのファージ', k: 'est', b: '腸の中には、ファージがたくさんいる（中身1gに約1億〜100億個のウイルスの多くがファージ）。いろいろな種類があり、それぞれ決まった細菌にしかとりつかない。ここに描いた数は実際よりずっと少ない。' };
  function drawFreePhages(tau) {
    const w = V.W / V.s; if (w > 400000 || w < 3000) return;
    g.fillStyle = 'rgba(255,227,163,.8)';
    const sz = Math.max(1.5, Math.min(4, 150 * V.s));
    for (let i = 0; i < 46; i++) {
      const x = (hash(i, 31) - 0.5) * 60000 + Math.sin(tau * 0.5 + i) * 900, y = (hash(i, 32) - 0.5) * 34000 + Math.cos(tau * 0.43 + i * 2) * 900;
      if (Math.abs(x) < 2600 && Math.abs(y) < 1800) continue;
      g.fillRect(V.X(x) - sz / 2, V.Y(y) - sz / 2, sz, sz);
      V.hit({ c: [x, y, 300], info: FREE });
    }
  }
  // はじめ: まん中の1つに印
  function drawPick() {
    if (V.s > 0.2 || V.W / V.s > 200000) return;
    const cx = V.X(0), cy = V.Y(0), rr = Math.max(26, 1250 * V.s);
    g.strokeStyle = '#ffe066'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.ellipse(cx, cy, rr, rr * 0.62, 0, 0, 7); g.stroke(); g.setLineDash([]);
    V.text('この1つに注目', 0, 0, { dy: -rr * 0.62 - 16, size: 13, bold: true, color: '#ffe066', bg: 'rgba(10,22,27,.85)' });
    const px = V.X(SITE.x), py = V.Y(SITE.y + 600);
    g.fillStyle = '#ffe3a3'; g.beginPath(); g.arc(px, py, 3, 0, 7); g.fill();
    V.text('T4 ファージ', SITE.x, SITE.y + 600, { dx: -10, align: 'right', size: 12, color: '#ffe3a3', bg: 'rgba(10,22,27,.8)' });
  }

  // ---- ものさし（いまの拡大率に合わせて、ちょうどよい長さ）----
  function drawScale() {
    const target = 110 / V.s, p10 = Math.pow(10, Math.floor(Math.log10(target))), nice = [1, 2, 5, 10].map(k => k * p10).reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a);
    const len = nice * V.s, x0 = V.W - len - 16, y0 = V.H - 16;
    const unit = nice >= 1e9 ? `${nice / 1e9} m` : nice >= 1e7 ? `${nice / 1e7} cm` : nice >= 1e6 ? `${nice / 1e6} mm` : nice >= 1000 ? `${nice / 1000} µm` : `${nice} nm`;
    g.strokeStyle = '#e8f0f4'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + len, y0); g.moveTo(x0, y0 - 4); g.lineTo(x0, y0 + 4); g.moveTo(x0 + len, y0 - 4); g.lineTo(x0 + len, y0 + 4); g.stroke();
    g.fillStyle = '#e8f0f4'; g.font = '11px "IBM Plex Mono", monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText(unit, x0, y0 - 6);
  }

  return { draw };
})();
