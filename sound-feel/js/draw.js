// 心地よい音・いやな音 — 描画（快さ×興奮の地図・スペクトル・音程と粗さの曲線）
'use strict';
const Draw = (() => {
  // 色の決まり: 青緑 acc＝さわれるもの（画面の外のつまみ・ボタン）、白・青＝計算の結果（見るだけ）、金 me＝じぶんが置いたもの、赤＝いやな側
  const C = { bg: '#14202c', panel: '#18232f', line: '#2c3b4a', ink: '#e8f0f4', muted: '#a3b4bf', acc: '#7fd3c8', bad: '#ff7a6b', me: '#ffc95a', data: '#8fb8ff', curve: '#c9d6de' };
  const MONO = "500 11px 'IBM Plex Mono',Consolas,monospace";
  const font = (px, w = 500) => `${w} ${px}px 'Zen Kaku Gothic New','Yu Gothic',sans-serif`;

  function frame(g, x, y, w, h, title, hl) {   // hl: 'look'＝いまの見どころ（白）、'me'＝タップできる（金）
    g.fillStyle = C.panel; g.strokeStyle = hl === 'me' ? C.me : hl ? 'rgba(232,240,244,.7)' : C.line; g.lineWidth = hl ? 2 : 1;
    g.beginPath(); g.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 8); g.fill(); g.stroke();
    g.fillStyle = C.ink; g.font = font(12, 700); g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(title, x + 8, y + 6);
  }

  // 地図: 横＝快さ（左 不快・右 快）、縦＝興奮（上 興奮・下 落ち着き）。Russell 1980 の円環モデルの2つの軸
  function map(g, x, y, w, h, st, hl) {
    frame(g, x, y, w, h, '快さ × 興奮の地図（推定）', st.placing ? 'me' : hl && 'look');
    const pad = 22, top = 24, cx = x + w / 2, cy = y + top + (h - top) / 2;
    const rx = (w - pad * 2) / 2, ry = (h - top - pad * 1.4) / 2;
    st.layout = { map: { cx, cy, rx, ry } };
    g.strokeStyle = C.line; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - rx, cy); g.lineTo(cx + rx, cy); g.moveTo(cx, cy - ry); g.lineTo(cx, cy + ry); g.stroke();
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = C.muted; g.font = font(11);
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('不快', x + 4, cy - 8);
    g.textAlign = 'right'; g.fillText('快', x + w - 5, cy - 8);
    g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('興奮', cx, cy - ry - 1);
    g.textBaseline = 'top'; g.fillText('落ち着き', cx, cy + ry + 2);
    // 4つの目印の言葉
    g.font = font(11); g.fillStyle = 'rgba(163,180,191,.75)'; g.textBaseline = 'middle';
    const q = (tx, ty, s, al) => { g.textAlign = al; g.fillText(s, tx, ty); };
    q(cx + rx * 0.45, cy - ry * 0.62, 'わくわく', 'center'); q(cx - rx * 0.45, cy - ry * 0.62, rx < 130 ? 'こわい' : 'いらいら・こわい', 'center');
    q(cx - rx * 0.45, cy + ry * 0.62, 'どんより', 'center'); q(cx + rx * 0.45, cy + ry * 0.62, 'ゆったり', 'center');
    // 通ってきた跡と、いまの点
    const P = (v, a) => [cx + v * rx * 0.92, cy - a * ry * 0.92];
    const tr = st.trail;
    for (let i = 1; i < tr.length; i++) {
      const [x0, y0] = P(tr[i - 1][0], tr[i - 1][1]), [x1, y1] = P(tr[i][0], tr[i][1]);
      g.strokeStyle = `rgba(232,240,244,${0.04 + 0.3 * i / tr.length})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    // じぶんの感じ方（金）と、そのときの推定（白い輪）を点線でむすぶ
    g.font = MONO; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const m of st.mine) {
      const [ex, ey] = P(m.est[0], m.est[1]), [mx, my] = P(m.me[0], m.me[1]);
      g.strokeStyle = 'rgba(255,201,90,.6)'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(mx, my); g.stroke(); g.setLineDash([]);
      g.strokeStyle = 'rgba(232,240,244,.7)'; g.beginPath(); g.arc(ex, ey, 4, 0, Math.PI * 2); g.stroke();
      g.fillStyle = C.me; g.beginPath(); g.arc(mx, my, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = C.bg; g.fillText(String(m.n), mx, my + 0.5);
    }
    if (st.placing) {
      g.fillStyle = C.me; g.font = font(12, 700); g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText('ここをタップ', cx, y + h - 6);
    }
    const [px, py] = P(st.dv, st.da);
    g.fillStyle = C.ink; g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.bg; g.lineWidth = 2; g.stroke();
    g.fillStyle = C.ink; g.font = font(11, 700); g.textAlign = 'left'; g.textBaseline = 'middle';
    const right = px + 64 < x + w;   // 右はしでは点の左に書く
    g.textAlign = right ? 'left' : 'right'; g.fillText('いまの音', right ? px + 10 : px - 10, py);
  }

  // スペクトル: 横＝周波数（対数）、縦＝成分ごとの音圧レベル（想定の dB）。点線は聞こえる下限（ISO 226）
  function spec(g, x, y, w, h, res, hl) {
    frame(g, x, y, w, h, '音の成分（スペクトル）', hl && 'look');
    const l = x + 30, r = x + w - 8, t = y + 24, b = y + h - 18;
    const fx = (f) => l + (Math.log(f / 50) / Math.log(12000 / 50)) * (r - l);
    const dy = (d) => b - (Math.max(-10, Math.min(85, d)) + 10) / 95 * (b - t);
    // いやに感じやすい帯（Kumar ほか 2008）※目印
    g.fillStyle = 'rgba(255,122,107,.12)'; g.fillRect(fx(2500), t, fx(5500) - fx(2500), b - t);
    g.fillStyle = C.bad; g.font = font(10); g.textAlign = 'center'; g.textBaseline = 'top';
    g.textAlign = 'right'; g.fillText(w < 260 ? 'いやな帯' : 'いやに感じやすい帯', Math.min(r, fx(5500) + 40), t + 1);
    // 目盛
    g.strokeStyle = C.line; g.lineWidth = 1; g.fillStyle = C.muted; g.font = MONO; g.textBaseline = 'top';
    for (const f of [100, 300, 1000, 3000, 10000]) {
      g.beginPath(); g.moveTo(fx(f), t); g.lineTo(fx(f), b); g.stroke();
      g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), fx(f), b + 3);
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const d of [0, 40, 80]) { g.fillText(String(d), l - 4, dy(d)); g.beginPath(); g.moveTo(l, dy(d)); g.lineTo(r, dy(d)); g.stroke(); }
    // 聞こえる下限の曲線
    g.strokeStyle = 'rgba(232,240,244,.45)'; g.setLineDash([3, 3]); g.beginPath();
    Psycho.ISO_F.forEach((f, i) => { if (f < 50) return; const px = fx(f), py = dy(Psycho.ISO_TF[i]); i && f > 50 ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.stroke(); g.setLineDash([]);
    // ノイズ（自然の音）: 1/3 オクターブの帯ごとの大きさを面で
    const nz = res.comps.filter(c => c.g === 2);
    if (nz.length) {
      g.fillStyle = 'rgba(143,184,255,.25)'; g.strokeStyle = 'rgba(143,184,255,.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(fx(nz[0].f), b);
      for (const c of nz) g.lineTo(fx(Math.min(12000, c.f)), dy(c.lp));
      g.lineTo(fx(Math.min(12000, nz[nz.length - 1].f)), b); g.closePath(); g.fill(); g.stroke();
    }
    // 成分
    g.lineWidth = 2;
    for (const c of res.comps) {
      if (c.g === 2 || c.f < 50 || c.f > 12000) continue;
      g.strokeStyle = c.g === 1 ? C.bad : C.data;
      g.beginPath(); g.moveTo(fx(c.f), b); g.lineTo(fx(c.f), dy(c.lp)); g.stroke();
    }
    g.fillStyle = C.muted; g.font = font(10); g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText('Hz', r - 14, b - 1);
  }

  // 音程と粗さ: いまの音色の2つの音を、0〜1200 セントずらしたときの粗さ（谷＝協和）
  function curve(g, x, y, w, h, cv, P, hl) {
    frame(g, x, y, w, h, '2つの音の音程と粗さ', hl && 'look');
    const l = x + 30, r = x + w - 8, t = y + 26, b = y + h - 18;
    if (!cv || !cv.length) return;
    let mx = 0.5; for (const v of cv) mx = Math.max(mx, v);
    const cx = (c) => l + c / 1200 * (r - l), cy = (v) => b - v / mx * (b - t);
    g.strokeStyle = C.line; g.lineWidth = 1; g.fillStyle = C.muted; g.font = MONO; g.textAlign = 'center'; g.textBaseline = 'top';
    for (const [c, s] of [[0, w < 260 ? '' : '0'], [100, '半音'], [400, '3度'], [700, '5度'], [1200, '8度']]) {
      g.beginPath(); g.moveTo(cx(c), t); g.lineTo(cx(c), b); g.stroke();
      g.font = c ? font(10) : MONO; g.fillText(s, Math.min(cx(c), r - 10), b + 3);
    }
    g.textAlign = 'right'; g.textBaseline = 'middle'; g.font = MONO; g.fillText('粗', l - 4, t + 4);
    g.strokeStyle = C.curve; g.lineWidth = 2; g.beginPath();
    cv.forEach((v, i) => { const px = cx(i * 1200 / (cv.length - 1)), py = cy(v); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.stroke();
    if (P.two) {
      const i = Math.round(P.cents / 1200 * (cv.length - 1)), px = cx(P.cents), py = cy(cv[i]);
      g.fillStyle = C.data; g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = C.muted; g.font = font(10); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('（2つ目の音がオフ）', (l + r) / 2, t + 8);
    }
  }

  function all(g, w, h, st) {
    if (w < 120 || h < 120) return;   // 隠れたタブ・大きさ 0 のとき（RULES 6）
    g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
    const gap = 8, m = 8;
    const mw = Math.min(h - m * 2, (w - m * 2 - gap) * 0.52);
    map(g, m, m, mw, h - m * 2, st, st.hl === 'map');
    const rx = m + mw + gap, rw = w - rx - m, ih = h - m * 2;
    const sh = Math.round(ih * 0.54);
    spec(g, rx, m, rw, sh - gap / 2, st.res, st.hl === 'spec');
    curve(g, rx, m + sh + gap / 2, rw, ih - sh - gap / 2, st.curve, st.P, st.hl === 'curve');
  }
  return { all, C };
})();
window.Draw = Draw;
