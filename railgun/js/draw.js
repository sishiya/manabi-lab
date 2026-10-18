// レールガンのしくみ — 横から見た図（意味のズーム: 砲ぜんたい → レールと弾 → 電機子の中）
// 座標: x は根元（breech）から砲口へ [m]、y は砲の軸から上へ [m]。cam = { x, y, s(px/m) }
'use strict';
(function () {
  const C = {
    bg: '#14202c', line: '#3a5266', ink: '#e8f0f4', muted: '#a3b4bf',
    rail: '#c9864f', railFill: '#3b2a20', cur: '#ffc95a', field: '#7fd4ff', force: '#ff7a6b',
    arm: '#c7d2da', core: '#8fa3b0', sabot: '#5d7385', cap: '#9be38f', heat: '#ff9f5a',
  };
  const N_AL = 18.1e28, QE = 1.602e-19;    // アルミの自由電子の数密度 [1/m³]（Ashcroft & Mermin 表1.1）
  const sm = (a, b, v) => { const u = Math.min(1, Math.max(0, (v - a) / (b - a))); return u * u * (3 - 2 * u); };
  const hits = [];   // さわったときの説明の場所 [{k, x0,y0,x1,y1}]

  // 寄りぐあいは「口径が何 px か」で決める（大きさのちがう砲でも同じ見え方に）
  function lv(pc) { return { l1: sm(10, 30, pc), l2: sm(150, 260, pc) }; }

  function arrow(g, x0, y0, x1, y1, col, wdt) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), hd = Math.min(12, L * 0.45);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = wdt || 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - Math.cos(a) * hd * 0.8, y1 - Math.sin(a) * hd * 0.8); g.stroke();
    g.beginPath(); g.moveTo(x1, y1);
    g.lineTo(x1 - hd * Math.cos(a - 0.45), y1 - hd * Math.sin(a - 0.45));
    g.lineTo(x1 - hd * Math.cos(a + 0.45), y1 - hd * Math.sin(a + 0.45)); g.closePath(); g.fill();
  }
  function text(g, s, x, y, col, size, align) {
    g.fillStyle = col || C.ink; g.font = `${size || 12}px 'Zen Kaku Gothic New', sans-serif`;
    g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(s, x, y);
  }
  function hit(k, x0, y0, x1, y1) { hits.push({ k, x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) }); }

  // 画面へ。たての太さは、引いたときは見やすく広げる（凡例に書く）
  function view(w, h, cam, p) {
    const sy = Math.max(cam.s, 16 / p.w);
    const yc = h * (cam.vy || 0.5);
    return { X: x => w / 2 + (x - cam.x) * cam.s, Y: y => yc - y * sy, s: cam.s, sy, w, h };
  }

  function scene(g, w, h, cam, o, st) {
    const S = SIM.S, p = S.p, B = SIM.base();
    hits.length = 0;
    g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
    const V = view(w, h, cam, p), { l1, l2 } = lv(cam.s * p.w);
    const Iref = B.limit, iu = Math.min(1.4, o.I / Iref);
    const wc = p.w, hr = 0.6 * wc, la = 2 * wc;   // 口径・レールの厚み（見やすさ）・電機子の長さ（ISL の 40 mm で 80 mm）
    const xa = Math.min(o.x, p.len + 10), out = o.after >= 0 && S.run.out;
    const yT0 = V.Y(wc / 2), yT1 = V.Y(wc / 2 + hr), yB0 = V.Y(-wc / 2), yB1 = V.Y(-wc / 2 - hr);
    const x0 = V.X(0), xL = V.X(p.len), xArm = V.X(xa), xArm0 = V.X(xa - la);

    const sh = st.show || { cur: 1, field: 1, force: 1, racks: 1 };   // 案内の段ごとに出すもの
    // コンデンサの台（引いたとき）
    const pol = SIM.S.pol;   // ＋−の向き（電流と磁場の向きだけ逆。力は同じ）

    // 磁場（弾のうしろ、レールの間）。引いたときは青いもや、寄ると ⊗ の並び
    const fx1 = out ? xL : xArm0;
    if (sh.field && iu > 0.002) {
      g.fillStyle = `rgba(127,212,255,${0.08 + 0.32 * Math.min(1, iu) * (1 - l1 * 0.6)})`;
      g.fillRect(x0, yT0, Math.max(0, fx1 - x0), yB0 - yT0);
      if (l1 > 0.05) {
        const step = 28, a = Math.min(1, iu) * l1;
        g.strokeStyle = `rgba(127,212,255,${0.25 + 0.75 * a})`; g.lineWidth = 1.4;
        const ys = []; for (let y = (yT0 + yB0) / 2 - Math.floor((yB0 - yT0 - 14) / 2 / step) * step; y < yB0 - 6; y += step) ys.push(y);
        const xs0 = Math.max(x0 + 12, -20), xs1 = Math.min(fx1 - 10, w + 20);
        for (let x = xs0 + ((x0 + 12 - xs0) % step + step) % step; x < xs1; x += step) for (const y of ys) {
          const r = 6; g.beginPath(); g.arc(x, y, r, 0, 7);
          if (pol > 0) { g.moveTo(x - r * 0.7, y - r * 0.7); g.lineTo(x + r * 0.7, y + r * 0.7); g.moveTo(x + r * 0.7, y - r * 0.7); g.lineTo(x - r * 0.7, y + r * 0.7); g.stroke(); }
          else { g.stroke(); g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
        }
      }
      hit('field', x0, yT0, fx1, yB0);
    }

    // レール
    g.fillStyle = C.railFill; g.strokeStyle = C.rail; g.lineWidth = 1.5;
    g.fillRect(x0, yT1, xL - x0, yT0 - yT1); g.strokeRect(x0, yT1, xL - x0, yT0 - yT1);
    g.fillRect(x0, yB0, xL - x0, yB1 - yB0); g.strokeRect(x0, yB0, xL - x0, yB1 - yB0);
    hit('rail', x0, yT1, xL, yT0); hit('rail', x0, yB0, xL, yB1);
    if (l1 < 0.6) { text(g, '砲口', xL + 6, (yT1 + yB1) / 2 - 14, C.muted, 11); text(g, '根元', x0 - 4, yB1 + 12, C.muted, 11, 'right'); }

    // 電流（上のレール → 電機子 → 下のレール）。点線の流れる速さは電流の大きさ
    if (sh.cur && iu > 0.002 && !out) {
      const ym1 = (yT0 + yT1) / 2, ym2 = (yB0 + yB1) / 2, xc = V.X(xa - 0.55 * la);
      g.save(); g.setLineDash([10, 9]); g.lineDashOffset = -st.phase * pol; g.lineCap = 'round';
      g.strokeStyle = C.cur; g.lineWidth = 1.5 + 3 * Math.min(1, iu); g.globalAlpha = (0.35 + 0.65 * Math.min(1, iu * 2)) * (1 - l2);
      g.beginPath(); g.moveTo(x0 - 30, ym1); g.lineTo(xc, ym1); g.lineTo(xc, ym2); g.lineTo(x0 - 30, ym2); g.stroke();
      g.restore();
      if (l1 > 0.3) {
        const xm = Math.max(x0 + 40, Math.min(xc - 60, w * 0.3));
        if (pol > 0) { arrow(g, xm - 22, ym1, xm + 22, ym1, C.cur, 2); arrow(g, xm + 22, ym2, xm - 22, ym2, C.cur, 2); }
        else { arrow(g, xm + 22, ym1, xm - 22, ym1, C.cur, 2); arrow(g, xm - 22, ym2, xm + 22, ym2, C.cur, 2); }
        text(g, '電流', xm - 22, yB1 + 14, C.cur, 13);
      }
      hit('cur', Math.max(x0 - 30, 0), yT1 - 4, xc + 6, yB1 + 4);
    }

    // 弾（電機子＋装弾筒＋弾心）。砲口を出たら装弾筒が少しずつはなれる（形は目安）
    pack(g, V, o, p, la, xa, out, l2);
    scorch(g, V, p, wc, hr);
    stopper(g, V, o, p, xa, out);

    // 力の矢印
    if (sh.force && o.F > 0 && !out) {
      const Lpx = 30 + 110 * Math.min(1, o.F / (0.5 * p.Lp * Iref * Iref));
      const yc = V.Y(0), xf = V.X(xa + SIM.base().projLen) + 8;
      arrow(g, xf, yc, xf + Lpx, yc, C.force, 4);
      text(g, '押す力', xf + 4, yc - 16, C.force, 13);
      hit('force', xf, yc - 22, xf + Lpx, yc + 10);
    }
    // レールが押し広げられる力（寄ったとき）
    if (st.inset && l1 > 0.4 && iu > 0.05 && !out) {
      g.globalAlpha = Math.min(1, iu) * (l1 - 0.4) / 0.6;
      for (let x = Math.max(x0 + 30, 40); x < Math.min(xArm0 - 30, w - 20); x += 150) {
        arrow(g, x, yT1 - 2, x, yT1 - 22, C.force, 2); arrow(g, x, yB1 + 2, x, yB1 + 22, C.force, 2);
      }
      g.globalAlpha = 1;
    }

    // 砲口の火花（出た直後、残った磁場のエネルギーが火花になる。形は目安）
    if (out && o.after < 1.2e-3) {
      const e = S.sum.left, u = 1 - o.after / 1.2e-3, r = (20 + 60 * Math.sqrt(e / (S.sum.E0 || 1)) * 2) * u * Math.min(3, Math.max(0.6, cam.s / 120));
      const gr = g.createRadialGradient(xL, V.Y(0), 0, xL, V.Y(0), r);
      gr.addColorStop(0, `rgba(255,240,200,${0.9 * u})`); gr.addColorStop(0.4, `rgba(255,170,90,${0.5 * u})`); gr.addColorStop(1, 'rgba(255,120,60,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(xL, V.Y(0), r, 0, 7); g.fill();
      hit('muzzle', xL - r, V.Y(0) - r, xL + r, V.Y(0) + r);
    }

    // 電機子の中（いちばん寄ったとき）
    if (l2 > 0.01) micro(g, V, o, p, la, xa, l2, st);

    boxes(g, w, h, o, p);
    if (st.focus) focusRing(g, st.focus);
    scaleBar(g, V, w, h);
    if (V.sy > V.s * 1.05) text(g, '※ たての太さは広げてある', w - 10, 62, C.muted, 11, 'right');
  }

  function fmtF(F) { return F >= 1e6 ? `${(F / 1e6).toFixed(2)} MN` : `${(F / 1e3).toFixed(0)} kN`; }

  function pack(g, V, o, p, la, xa, out, l2) {
    const wc = p.w, pl = SIM.base().projLen;
    const sep = out ? Math.min(1, o.after / 1.5e-3) : 0;      // 装弾筒のはなれぐあい
    const yT = V.Y(wc / 2), yB = V.Y(-wc / 2), yc = V.Y(0);
    const ax0 = V.X(xa - la), ax1 = V.X(xa), dy = sep * 18;
    // 電機子（C の形。うしろへ2本の足がレールにさわる）
    g.fillStyle = C.arm; g.strokeStyle = '#ffffff55'; g.lineWidth = 1;
    const leg = Math.max(2, (yB - yT) * 0.18), fr = ax0 + (ax1 - ax0) * 0.45;
    const off = sep * 40;
    g.globalAlpha = 1 - l2 * 0.75;
    g.beginPath();
    g.moveTo(ax0 - off, yT - dy); g.lineTo(ax1 - off, yT - dy); g.lineTo(ax1 - off, yB + dy); g.lineTo(ax0 - off, yB + dy);
    g.lineTo(ax0 - off, yB + dy - leg); g.lineTo(fr - off, yB + dy - leg * 1.6); g.lineTo(fr - off, yT - dy + leg * 1.6); g.lineTo(ax0 - off, yT - dy + leg);
    g.closePath(); g.fill(); g.stroke();
    g.globalAlpha = 1;
    hit('arm', ax0 - off, yT, ax1 - off, yB);
    // 装弾筒（上下2枚）と弾心
    const px0 = ax1, px1 = V.X(xa + pl), hh = (yB - yT);
    g.fillStyle = C.sabot;
    g.fillRect(px0, yT - dy * 2, px1 - px0, hh * 0.28); g.fillRect(px0, yB - hh * 0.28 + dy * 2, px1 - px0, hh * 0.28);
    g.fillStyle = C.core;
    g.beginPath(); g.moveTo(px0, yc - hh * 0.2); g.lineTo(px1 - (px1 - px0) * 0.25, yc - hh * 0.2); g.lineTo(px1 + 2, yc); g.lineTo(px1 - (px1 - px0) * 0.25, yc + hh * 0.2); g.lineTo(px0, yc + hh * 0.2); g.closePath(); g.fill();
    hit('proj', px0, yT, px1, yB);
  }

  // 電機子の中: 金属のイオン（＋）と自由電子（−）。電子は上へ流れ（電流は下向き）、磁場で前へ押される
  function micro(g, V, o, p, la, xa, l2, st) {
    const x0 = V.X(xa - la * 0.95), x1 = V.X(xa) - 4, y0 = V.Y(p.w / 2) + 4, y1 = V.Y(-p.w / 2) - 4;
    const cx0 = Math.max(x0, 0), cx1 = Math.min(x1, V.w), cy0 = Math.max(y0, 0), cy1 = Math.min(y1, V.h);
    if (cx1 <= cx0 || cy1 <= cy0) return;
    g.save(); g.globalAlpha = l2;
    g.beginPath(); g.rect(cx0, cy0, cx1 - cx0, cy1 - cy0); g.clip();
    g.fillStyle = '#1e2f3e'; g.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
    const sp = 34, I = o.I, iu = Math.min(1.3, I / SIM.base().limit);
    // イオン（ならんで動かない）
    g.strokeStyle = '#8fa3b0'; g.lineWidth = 1.2;
    const gx0 = x0 + ((cx0 - x0) - ((cx0 - x0) % sp)), gy0 = y0 + ((cy0 - y0) - ((cy0 - y0) % sp));
    for (let x = gx0 + sp / 2; x < cx1; x += sp) for (let y = gy0 + sp / 2; y < cy1; y += sp) {
      g.beginPath(); g.arc(x, y, 7, 0, 7); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke();
    }
    // 電子（流れる速さは何万倍にもして描く）
    const ph = st.phase * 0.6;
    for (let x = gx0; x < cx1; x += sp) for (let j = 0, y = gy0; y < cy1 + sp; y += sp, j++) {
      const yy = cy1 - ((cy1 - y + ph + ((x * 7) % sp)) % (cy1 - cy0 + sp)) ;
      if (yy < cy0 - 4 || yy > cy1 + 4) continue;
      g.fillStyle = C.field; g.beginPath(); g.arc(x, yy, 3.4, 0, 7); g.fill();
      if (iu > 0.02) arrow(g, x + 4, yy, x + 6 + 16 * Math.min(1, iu), yy, C.force, 1.6);
    }
    g.restore();
    g.globalAlpha = l2;
    const vd = I / (N_AL * QE * la * p.w);
    const bx = Math.max(10, cx0 + 8), by = V.w < 640 ? Math.max(cy0, 0) + 62 : Math.min(V.h - 110, cy1 - 52);
    g.fillStyle = 'rgba(20,32,44,0.82)'; g.fillRect(bx - 6, by - 12, 300, 62);
    text(g, '電機子（アルミ）の中: ＋ 金属のイオン　● 電子', bx, by, C.ink, 12);
    text(g, `電子の流れる速さ 約 ${(vd * 100).toFixed(1)} cm/秒（計算）`, bx, by + 18, C.field, 12);
    text(g, '※ 電子の動きは何万倍にもして描いている', bx, by + 36, C.muted, 11);
    g.globalAlpha = 1;
    hit('micro', cx0, cy0, cx1, cy1);
  }

  // 見てほしい所に、ゆっくり光る枠（1秒に1回より遅い。点滅の決まり RULES 9章）
  function focusRing(g, k) {
    const h = hits.find(q => q.k === k); if (!h) return;
    const a = 0.55 + 0.45 * Math.sin(performance.now() / 1000 * Math.PI * 1.2);
    g.save(); g.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * a})`; g.lineWidth = 2.5; g.setLineDash([]);
    const pad = 6; g.beginPath();
    if (g.roundRect) g.roundRect(h.x0 - pad, h.y0 - pad, h.x1 - h.x0 + 2 * pad, h.y1 - h.y0 + 2 * pad, 8); else g.rect(h.x0 - pad, h.y0 - pad, h.x1 - h.x0 + 2 * pad, h.y1 - h.y0 + 2 * pad);
    g.stroke(); g.restore();
  }

  // 焦げ跡: 位置ごとの ∫I²dt（推定の目安）。レールの内がわの面を黒く
  function scorch(g, V, p, wc, hr) {
    const A = SIM.S.scorch, nb = A.length, ref = Math.pow(SIM.base().limit, 2) * 5e-6;
    const railPx = V.Y(wc / 2) - V.Y(wc / 2 + hr), th = railPx < 20 ? railPx : railPx * 0.35;   // 引いた図ではレールの厚みぜんぶ
    const yT = V.Y(wc / 2), yB = V.Y(-wc / 2);
    let best = -1, bestA = 0;
    for (let b = 0; b < nb; b++) {
      if (A[b] <= 0) continue;
      const a = Math.min(0.92, Math.log10(1 + A[b] / ref) / 2.2);
      if (a < 0.02) continue;
      const x0 = V.X(b / nb * p.len), x1 = V.X((b + 1) / nb * p.len);
      if (x1 < 0 || x0 > V.w) continue;
      g.fillStyle = `rgba(12,6,2,${a})`;
      g.fillRect(x0, yT - th, Math.max(2, x1 - x0), th); g.fillRect(x0, yB, Math.max(2, x1 - x0), th);
      if (a > bestA) { bestA = a; best = (x0 + x1) / 2; }
    }
    if (best >= 0 && bestA > 0.25 && railPx < 20) text(g, '焦げ跡 ↓', best, yT - railPx - 10, '#c9a27f', 11, 'center');
  }

  // 止め板（電機子を動けなくする）。置く前は、置ける所を点線で
  function stopper(g, V, o, p, xa, out) {
    const S = SIM.S, pl = SIM.base().projLen, wc = p.w, hr = 0.6 * wc;
    if (out) return;
    const xs = V.X(xa + pl) + 4, wpx = Math.max(6, 0.012 * V.s), yT = V.Y(wc / 2 + hr) - 6, yB = V.Y(-wc / 2 - hr) + 6;
    if (S.hold) {
      g.fillStyle = '#6f7d88'; g.strokeStyle = '#c7d2da'; g.lineWidth = 1.5;
      g.fillRect(xs, yT, wpx, yB - yT); g.strokeRect(xs, yT, wpx, yB - yT);
      text(g, '止め板', xs + wpx + 4, yT + 8, C.ink, 12);
    } else if (S.phase === 'ready' && o.v < 1) {
      g.save(); g.setLineDash([5, 5]); g.strokeStyle = '#a3b4bf88'; g.lineWidth = 1.2;
      g.strokeRect(xs, yT, wpx, yB - yT); g.restore();
      text(g, '止め板', xs + wpx + 4, yT + 8, C.muted, 11);
    }
    hit('stop', xs - 10, yT, xs + Math.max(60, wpx + 50), yB);
  }

  // コンデンサの箱の帯（図の下にいつも。タップで放電）
  function boxes(g, w, h, o, p) {
    const n = p.racks.length, cols = 5, rows = Math.ceil(n / cols);
    const gap = 6, bs = Math.max(40, Math.min(54, (w - 20) / cols - gap)), bw = Math.min(bs * 1.5, (w - 20) / cols - gap), bh = Math.max(32, bs * 0.62);
    const totalW = cols * (bw + gap) - gap, x0 = Math.max(10, (w - totalW) / 2), y0 = h - rows * (bh + gap) - 8;
    const S = SIM.S, live = S.phase === 'ready' || S.phase === 'live';
    g.fillStyle = 'rgba(16,26,36,0.88)'; g.fillRect(0, y0 - 24, w, h - y0 + 24);
    text(g, live ? 'コンデンサの箱（タップで電気を送る）' : 'コンデンサの箱（「もう一回」でためなおす）', x0, y0 - 12, C.muted, 12);
    for (let k = 0; k < n; k++) {
      const c = k % cols, r = (k / cols) | 0, x = x0 + c * (bw + gap), y = y0 + r * (bh + gap);
      const fill = Math.max(0, o.vc[k] / p.racks[k].V0), on = o.i[k] / (SIM.base().limit / 6), fired = o.fired[k] > 0.5;
      g.fillStyle = '#1b2c3b'; g.fillRect(x, y, bw, bh);
      g.fillStyle = C.cap; g.globalAlpha = fired ? 0.55 : 1; g.fillRect(x + 4, y + 4 + (bh - 8) * (1 - fill), bw - 8, (bh - 8) * fill); g.globalAlpha = 1;
      g.strokeStyle = on > 0.03 ? C.cur : fired ? C.line : '#9be38f'; g.lineWidth = on > 0.03 ? 3 : 1.5; g.strokeRect(x, y, bw, bh);
      text(g, S.pol > 0 ? '＋' : '−', x + 5, y + 10, C.ink, 10);
      hit('box' + k, x, y, x + bw, y + bh);
    }
  }

  function scaleBar(g, V, w, h) {
    const want = 120 / V.s, e = Math.pow(10, Math.floor(Math.log10(want))), m = want / e;
    const len = (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e, px = len * V.s;
    const lab = len >= 1 ? `${len} m` : len >= 0.01 ? `${Math.round(len * 100)} cm` : `${Math.round(len * 1000)} mm`;
    g.strokeStyle = C.muted; g.lineWidth = 1.5;
    const yb = 72; g.beginPath(); g.moveTo(12, yb); g.lineTo(12 + px, yb); g.moveTo(12, yb - 5); g.lineTo(12, yb + 5); g.moveTo(12 + px, yb - 5); g.lineTo(12 + px, yb + 5); g.stroke();
    text(g, lab, 12 + px / 2, yb - 12, C.muted, 11, 'center');
  }

  // 断面（根元の側から砲口の方を見る）。レールを細い電線の束として、磁場をビオ・サバールで計算
  function inset(g, bx, by, size, o) {
    const p = SIM.S.p, wc = p.w, hr = 0.6 * wc, I = o.I;
    g.fillStyle = 'rgba(16,26,36,0.94)'; g.strokeStyle = C.line; g.lineWidth = 1;
    g.fillRect(bx, by, size, size); g.strokeRect(bx, by, size, size);
    const sc = size / (wc * 3.4), cx = bx + size / 2, cy = by + size / 2 + 6;
    const P = (z, y) => [cx + z * sc, cy - y * sc];
    const fil = [];
    const nz = 7, ny = 3;
    for (let a = 0; a < nz; a++) for (let b = 0; b < ny; b++) {
      const z = (-0.5 + (a + 0.5) / nz) * wc, yo = wc / 2 + (b + 0.5) / ny * hr;
      const pl = SIM.S.pol; fil.push([yo, z, pl]); fil.push([-yo, z, -pl]);   // 上: 奥へ（+x）、下: 手前へ（＋−を入れかえると逆）
    }
    const Bat = (y, z) => {
      let by_ = 0, bz = 0;
      for (const [y0, z0, sgn] of fil) { const dy = y - y0, dz = z - z0, r2 = dy * dy + dz * dz + 1e-8; by_ += -sgn * dz / r2; bz += sgn * dy / r2; }
      return [bz, by_];   // 画面の右（z）・上（y）
    };
    const iu = Math.min(1, I / SIM.base().limit);
    const ref = Math.hypot(...Bat(0, 0));
    g.save(); g.beginPath(); g.rect(bx, by, size, size); g.clip();
    const st = size / 11;
    for (let i = 0.5; i < 11; i++) for (let j = 0.5; j < 11; j++) {
      const sx = bx + i * st, sy2 = by + j * st, z = (sx - cx) / sc, y = (cy - sy2) / sc;
      if (Math.abs(z) < wc / 2 + 0.002 && Math.abs(y) > wc / 2 - 0.002 && Math.abs(y) < wc / 2 + hr + 0.002) continue;
      const [vz, vy] = Bat(y, z), m = Math.hypot(vz, vy), L = st * 0.42 * Math.min(1.3, Math.sqrt(m / ref));
      g.globalAlpha = (0.2 + 0.8 * iu) * Math.min(1, m / ref);
      arrow(g, sx - vz / m * L, sy2 + vy / m * L, sx + vz / m * L, sy2 - vy / m * L, C.field, 1.2);
    }
    g.globalAlpha = 1; g.restore();
    for (const s of [1, -1]) {
      const [x0, y0] = P(-wc / 2, s > 0 ? wc / 2 + hr : -wc / 2), [x1, y1] = P(wc / 2, s > 0 ? wc / 2 : -wc / 2 - hr);
      g.fillStyle = C.railFill; g.strokeStyle = C.rail; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, r = 7;
      g.strokeStyle = C.cur; g.lineWidth = 1.5; g.beginPath(); g.arc(mx, my, r, 0, 7); g.stroke();
      if (s * SIM.S.pol > 0) { g.beginPath(); g.moveTo(mx - 5, my - 5); g.lineTo(mx + 5, my + 5); g.moveTo(mx + 5, my - 5); g.lineTo(mx - 5, my + 5); g.stroke(); }
      else { g.fillStyle = C.cur; g.beginPath(); g.arc(mx, my, 2.5, 0, 7); g.fill(); }
      if (iu > 0.05) arrow(g, mx + 30, s > 0 ? y0 - 2 : y1 + 2, mx + 30, s > 0 ? y0 - 18 : y1 + 18, C.force, 2);
    }
    text(g, size < 190 ? '断面（根元から見る）' : '断面（根元から砲口の方を見る）', bx + 6, by + 12, C.ink, 11);
    text(g, size < 190 ? '⊗⊙ 電流　→ 磁場' : '⊗ 奥へ ⊙ 手前へ（電流）　→ 磁場', bx + 6, by + size - 10, C.muted, 10);
    hit('inset', bx, by, bx + size, by + size);
  }

  function hitTest(x, y) {
    for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h.k; }
    return null;
  }

  window.DRAW = { C, scene, inset, hitTest, lv, view, N_AL, QE, fmtF };
})();
