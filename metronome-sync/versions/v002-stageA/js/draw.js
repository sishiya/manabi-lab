// メトロノームがそろうまで — 図（横から見た板・缶・メトロノーム、位相の円）
'use strict';
const DRAW = (() => {
  const C = { bg: '#16202c', line: '#6f8796', ink: '#e8f0f4', muted: '#a3b4bf', acc: '#ffc95a', board: '#c9a36b', can: '#8fa6b4', pin: '#ff7a6b' };
  // 台ごとの色（位相の円・グラフと同じ）
  const COLS = ['#ffc95a', '#7fd4ff', '#ff8fa3', '#9be37f', '#c9a2ff', '#ffb26b', '#6be3d0', '#f2e66b', '#a8b8ff', '#ff9be0'];
  const XMAG = 10;              // 板の動きは 10 倍にして描く（本物は 1 mm ほど）
  let geo = null;               // 当たり判定用（メトロノームの位置）
  let hover = -1;

  function scene(g, w, h, sys, ui) {
    g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
    const n = sys.n;
    // 大きさ: メトロノーム1台の幅 b（本物は約 5 cm として描く）
    const narrow = w < 560;
    const circR = narrow ? Math.min(46, h * 0.16) : Math.min(80, h * 0.22);
    const areaW = narrow ? w : w - circR * 2 - 60;
    const b = Math.min(areaW * 0.86 / (n * 1.9 + 0.4), h * 0.26, 90);
    const pxPerM = b / 0.05;
    const floorY = h * (narrow ? 0.9 : 0.86);
    const canR = b * 0.32;
    const boardH = b * 0.12;
    const boardY = floorY - canR * 2 - boardH;
    const cx0 = areaW / 2;
    const bx = sys.y[0] * pxPerM * XMAG;           // 板のずれ（10倍）
    const boardW = b * (n * 1.9 + 0.4);
    // 床
    g.strokeStyle = C.line; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(8, floorY); g.lineTo(areaW - 8, floorY); g.stroke();
    if (ui.wet) {   // ぬれた床
      g.fillStyle = 'rgba(127,212,255,0.18)'; g.fillRect(cx0 - boardW * 0.6, floorY, boardW * 1.2, 5);
    }
    // 缶（板の半分だけ進み、転がる）
    for (const side of [-1, 1]) {
      const ccx = cx0 + side * boardW * 0.32 + bx / 2, ccy = floorY - canR;
      const rot = (sys.y[0] * XMAG * pxPerM / 2) / canR;
      g.strokeStyle = C.can; g.lineWidth = 2;
      g.beginPath(); g.arc(ccx, ccy, canR, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(ccx, ccy); g.lineTo(ccx + canR * Math.sin(rot), ccy - canR * Math.cos(rot)); g.stroke();
    }
    // 板
    g.fillStyle = C.board; g.fillRect(cx0 - boardW / 2 + bx, boardY, boardW, boardH);
    if (ui.addMass > 0) {   // 板に足したおもり
      g.fillStyle = '#8a95a0'; g.fillRect(cx0 - b * 0.5 + bx, boardY + boardH, b, canR * 0.7);
      g.fillStyle = C.ink; g.font = `${Math.max(10, b * 0.17)}px 'IBM Plex Mono',monospace`; g.textAlign = 'center';
      g.fillText(`+${ui.addMass}kg`, cx0 + bx, boardY + boardH + canR * 0.55);
    }
    if (sys.pinned) {   // おさえている手（模式）
      g.strokeStyle = C.pin; g.lineWidth = 3;
      for (const side of [-1, 1]) {
        const px = cx0 + side * (boardW / 2 + 6) + bx;
        g.beginPath(); g.moveTo(px, boardY - b * 0.5); g.lineTo(px, boardY + boardH * 0.5); g.lineTo(px - side * 10, boardY + boardH * 0.5); g.stroke();
      }
    }
    // メトロノーム
    geo = { items: [], b };
    const bodyH = b * 1.15, rodL = b * 1.25;
    for (let i = 0; i < n; i++) {
      const mx = cx0 - boardW / 2 + bx + b * (0.2 + 0.95 + i * 1.9);
      const baseY = boardY;
      const th = sys.y[2 + 2 * i];
      const col = COLS[i % COLS.length];
      // 本体（台形）
      g.fillStyle = '#22303e'; g.strokeStyle = i === hover ? C.ink : C.line; g.lineWidth = i === hover ? 2 : 1.5;
      g.beginPath();
      g.moveTo(mx - b * 0.5, baseY); g.lineTo(mx + b * 0.5, baseY);
      g.lineTo(mx + b * 0.2, baseY - bodyH); g.lineTo(mx - b * 0.2, baseY - bodyH); g.closePath();
      g.fill(); g.stroke();
      // 支点（本体の下のほう）。重心は支点より下（本体の中のおもり）、棒は上にのびる
      const pvx = mx, pvy = baseY - b * 0.32;
      const lowL = b * 0.22;
      g.strokeStyle = 'rgba(163,180,191,0.5)'; g.setLineDash([3, 3]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(pvx, pvy); g.lineTo(pvx + lowL * Math.sin(th), pvy + lowL * Math.cos(th)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(163,180,191,0.6)';
      g.beginPath(); g.arc(pvx + lowL * Math.sin(th), pvy + lowL * Math.cos(th), b * 0.07, 0, Math.PI * 2); g.fill();
      // 棒とおもり
      const tx = pvx - rodL * Math.sin(th), ty = pvy - rodL * Math.cos(th);
      g.strokeStyle = C.ink; g.lineWidth = Math.max(1.5, b * 0.035);
      g.beginPath(); g.moveTo(pvx, pvy); g.lineTo(tx, ty); g.stroke();
      const wx = pvx - rodL * 0.62 * Math.sin(th), wy = pvy - rodL * 0.62 * Math.cos(th);
      g.save(); g.translate(wx, wy); g.rotate(-th);
      g.fillStyle = col; g.fillRect(-b * 0.11, -b * 0.08, b * 0.22, b * 0.16); g.restore();
      g.fillStyle = C.ink; g.beginPath(); g.arc(pvx, pvy, Math.max(2, b * 0.035), 0, Math.PI * 2); g.fill();
      geo.items.push({ x: mx, y: baseY - bodyH / 2, top: pvy - rodL, bottom: baseY });
    }
    // 説明の小さな文字
    g.fillStyle = C.muted; g.textAlign = 'left'; g.font = `${narrow ? 10 : 12}px 'Zen Kaku Gothic New',sans-serif`;
    g.fillText(`時間 ${fmtT(sys.t)}　板の動きは ${XMAG} 倍で描いています`, 10, narrow ? 14 : 18);
    // 位相の円
    const ccx = narrow ? w - circR - 12 : w - circR - 30, ccy = narrow ? circR + 26 : h * 0.4;
    phaseCircle(g, ccx, ccy, circR, sys, narrow);
  }
  function fmtT(t) { const m = Math.floor(t / 60), s = t - m * 60; return m ? `${m}分${s.toFixed(0).padStart(2, '0')}秒` : `${s.toFixed(1)}秒`; }

  // 位相の円: 各メトロノームが円の上の点。そろうと1か所に集まる。まん中の矢印の長さ＝そろい具合 r
  function phaseCircle(g, cx, cy, R, sys, narrow) {
    g.strokeStyle = C.line; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    let sx = 0, sy = 0;
    for (let i = 0; i < sys.n; i++) {
      const p = PHYS.phase(sys, i);
      const x = cx + R * Math.cos(-p - Math.PI / 2), y = cy + R * Math.sin(-p - Math.PI / 2);
      sx += Math.cos(p); sy += Math.sin(p);
      g.fillStyle = COLS[i % COLS.length]; g.beginPath(); g.arc(x, y, Math.max(4, R * 0.09), 0, Math.PI * 2); g.fill();
    }
    sx /= sys.n; sy /= sys.n;
    const r = Math.hypot(sx, sy), a = Math.atan2(sy, sx);
    g.strokeStyle = C.acc; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * r * Math.cos(-a - Math.PI / 2), cy + R * r * Math.sin(-a - Math.PI / 2)); g.stroke();
    g.fillStyle = C.muted; g.textAlign = 'center'; g.font = `${narrow ? 10 : 12}px 'Zen Kaku Gothic New',sans-serif`;
    g.fillText(`そろい具合 ${r.toFixed(2)}`, cx, cy + R + (narrow ? 14 : 20));
    if (!narrow) g.fillText('振り子のリズムの位置（位相）', cx, cy - R - 12);
  }
  function hit(x, y) {
    if (!geo) return -1;
    for (let i = 0; i < geo.items.length; i++) {
      const it = geo.items[i];
      if (Math.abs(x - it.x) < geo.b * 0.65 && y > it.top - 10 && y < it.bottom + 4) return i;
    }
    return -1;
  }
  function setHover(i) { hover = i; }
  function itemX(i) { return geo && geo.items[i] ? geo.items[i].x : 0; }
  return { C, COLS, XMAG, scene, hit, setHover, itemX, fmtT };
})();
