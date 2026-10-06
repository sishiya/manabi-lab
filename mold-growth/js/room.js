// View 1: the place (bathroom / window / north wall / closet). Visible mould, steam, condensation, floating spores.

function sceneRect(W, H, box) {
  const x = 14, y = box.top + (box.narrow ? 50 : 8), w = W - 28, h = H - box.bot - y - 6;
  return { x, y, w, h };
}

// mould spots spread over a region; living ones in the species colour, dead ones bleached (chlorine) or still dark
function moldSpots(g, R, t, n, place, seed, scale) {
  const covV = coverage(R.V[t]), covL = coverage(R.M[t]);
  if (covV <= 0 && !VIEW.hidden) return;
  const ks = killState(R, t), col = mouldColor(R, t), deadCol = ks && ks.k === 'chlorine' ? 'rgba(150,150,140,.55)' : col;
  const fV = Math.sqrt(covV), fL = Math.sqrt(covL);
  for (let i = 0; i < n; i++) {
    const o = hash(i, seed + 3);
    let c;
    if (o < fL) c = col; else if (o < fV) c = deadCol; else if (VIEW.hidden && R.M[t] > 0.3 && o < 0.6) c = 'hidden'; else continue;
    const [x, y] = place(i);
    const r = scale * (0.45 + hash(i, seed + 5)) * (0.8 + 2.2 * Math.sqrt(covV));
    if (c === 'hidden') {   // too small for the eye: faint ring
      g.strokeStyle = 'rgba(238,242,234,.35)'; g.lineWidth = 1; g.setLineDash([2, 2]);
      g.beginPath(); g.arc(x, y, Math.max(1.5, scale * 0.4 * Math.min(1, R.M[t] / 3)), 0, 7); g.stroke(); g.setLineDash([]);
      continue;
    }
    g.fillStyle = c;
    g.globalAlpha = 0.85;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    for (let j = 0; j < 3; j++) {   // satellite dots make it look like a cluster
      const a = hash(i, j + seed) * 6.28, d = r * (1 + hash(j, i + seed) * 1.2);
      g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.45, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
}

function droplets(g, x, y, w, h, n, seed, alpha) {
  for (let i = 0; i < n; i++) {
    const px = x + hash(i, seed) * w, py = y + Math.pow(hash(i, seed + 1), 0.6) * h, r = 1.2 + hash(i, seed + 2) * 2.6;
    g.fillStyle = `rgba(170,215,245,${0.35 * alpha})`; g.beginPath(); g.ellipse(px, py, r, r * 1.2, 0, 0, 7); g.fill();
    g.fillStyle = `rgba(255,255,255,${0.55 * alpha})`; g.beginPath(); g.arc(px - r * 0.3, py - r * 0.4, r * 0.3, 0, 7); g.fill();
  }
}

function airSpores(g, sc, R, t, clock) {
  const cin = R.Cin[t], n = Math.round(clamp(Math.sqrt(cin) * 1.6, 8, 170));
  const own = R.M[t] >= 3 ? mouldColor(R, t, true) : null, ownFrac = clamp(1 - 0.4 * SEASONS[R.cond.season].spores / cin, 0, 1);
  for (let i = 0; i < n; i++) {
    let x = (hash(i, 1) + clock * 0.006 * (hash(i, 2) - 0.5)) % 1; if (x < 0) x += 1;
    const y = (hash(i, 3) + clock * 0.003 * (0.3 + hash(i, 4))) % 1;
    g.fillStyle = own && hash(i, 7) < ownFrac ? rgba(own, 0.9) : 'rgba(230,236,220,.55)';
    g.beginPath(); g.arc(sc.x + x * sc.w, sc.y + y * sc.h, 1.1 + hash(i, 5) * 1.1, 0, 7); g.fill();
  }
  if (VIEW.labels) {
    const txt = sc.w < 520 ? `● 空気中の胞子 1m³ に約 ${fmtN(cin)} 個（強調して表示）` : `● 空気中の胞子 1m³ に約 ${fmtN(cin)} 個（本当は見えない。数も大きさも強調）`;
    g.font = '12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif';
    g.fillStyle = 'rgba(13,17,16,.75)'; rr(g, sc.x + 6, sc.y + 6, g.measureText(txt).width + 14, 20, 5); g.fill();
    note(g, txt, sc.x + 13, sc.y + 16, 'left', 'rgba(238,242,234,.9)');
  }
}

function drawRoom(g, W, H, box, R, t, clock) {
  const sc = sceneRect(W, H, box), c = R.cond;
  if (sc.h < 120) return;
  g.save();
  rr(g, sc.x, sc.y, sc.w, sc.h, 10); g.clip();
  ({ bath: roomBath, window: roomWindow, wall: roomWall, closet: roomCloset })[c.place](g, sc, R, t, clock);
  airSpores(g, sc, R, t, clock);
  g.restore();
  g.strokeStyle = 'rgba(200,230,200,.14)'; rr(g, sc.x, sc.y, sc.w, sc.h, 10); g.stroke();
  const cov = coverage(R.V[t]);
  const msg = R.V[t] >= 3 ? `目に見えるカビ: 表面の約 ${cov < 0.1 ? (cov * 100).toFixed(1) : (cov * 100).toFixed(0)}%` + (R.V[t] > R.M[t] + 0.3 ? (lastKill(R, t).k === 'chlorine' ? '（色が抜けきらない黒ずみ）' : '（死んでいるが色は残っている）') : '')
    : R.M[t] > 0.05 ? `目にはまだ見えない（顕微鏡なら菌糸がある。カビ指数 ${R.M[t].toFixed(1)}）` : 'カビは目に見えない（胞子は落ちている）';
  g.fillStyle = 'rgba(13,17,16,.8)'; g.font = '13px "Zen Kaku Gothic New", "Yu Gothic", sans-serif';
  const w = g.measureText(msg).width; rr(g, sc.x + 8, sc.y + sc.h - 30, w + 16, 22, 6); g.fill();
  note(g, msg, sc.x + 16, sc.y + sc.h - 19, 'left', R.V[t] >= 3 ? '#ffb08a' : COL.ink);
}

function roomBath(g, sc, R, t, clock) {
  const c = R.cond, hd = t % 24, since = (hd - BATH_HOUR + 24) % 24;
  const rimY = sc.y + sc.h * 0.68, tile = Math.max(26, Math.min(48, sc.w / 14));
  // wall tiles
  g.fillStyle = '#c9d2d4'; g.fillRect(sc.x, sc.y, sc.w, rimY - sc.y);
  g.strokeStyle = '#aab4b6'; g.lineWidth = 2;
  for (let x = sc.x; x < sc.x + sc.w; x += tile) { g.beginPath(); g.moveTo(x, sc.y); g.lineTo(x, rimY); g.stroke(); }
  for (let y = rimY; y > sc.y; y -= tile) { g.beginPath(); g.moveTo(sc.x, y); g.lineTo(sc.x + sc.w, y); g.stroke(); }
  // soap scum haze near the bottom (food)
  const N = R.N[t];
  const grd = g.createLinearGradient(0, rimY - tile * 2, 0, rimY);
  grd.addColorStop(0, 'rgba(235,228,200,0)'); grd.addColorStop(1, `rgba(235,228,200,${0.45 * N})`);
  g.fillStyle = grd; g.fillRect(sc.x, rimY - tile * 2, sc.w, tile * 2);
  // tub
  g.fillStyle = '#e9ecea'; g.fillRect(sc.x, rimY + 6, sc.w, sc.y + sc.h - rimY);
  g.fillStyle = '#f6f8f6'; g.fillRect(sc.x, rimY + 6, sc.w, 12);
  g.fillStyle = '#d5dad8'; g.fillRect(sc.x, rimY + 18, sc.w, 3);
  // silicone gasket
  g.fillStyle = '#f4f4ee'; g.fillRect(sc.x, rimY - 1, sc.w, 8);
  g.fillStyle = `rgba(214,200,150,${0.5 * N})`; g.fillRect(sc.x, rimY - 1, sc.w, 8);
  // mould: on the gasket, and on the lowest grout lines when it spreads
  moldSpots(g, R, t, 90, i => [sc.x + (i + hash(i, 9)) / 90 * sc.w, rimY + 3 + (hash(i, 11) - 0.5) * 5], 1, 3.2);
  if (R.V[t] > 4) moldSpots(g, R, t, 40, i => [sc.x + Math.floor(hash(i, 21) * sc.w / tile) * tile + (hash(i, 23) - 0.5) * 3, rimY - hash(i, 22) * tile * 1.6], 5, 2.2);
  // wet: droplets
  if (R.wet[t]) droplets(g, sc.x, rimY - tile * 3, sc.w, tile * 3 + 8, 70, 2, 1);
  // steam after the bath
  if (since < 4 && R.RH[t] > 85) {
    const a = (since < 1 ? 0.42 : 0.42 * Math.exp(-(since - 1) / (c.vent === 'none' ? 2.5 : 0.8)));
    g.fillStyle = `rgba(240,244,246,${a})`; g.fillRect(sc.x, sc.y, sc.w, sc.h);
  }
  // fan
  const on = c.vent === 'h24' || (c.vent === 'h2' && (hd >= 22 && hd < 24));
  const fx = sc.x + 70, fy = sc.y + 80, fr = 26;
  g.fillStyle = '#e8ecec'; g.strokeStyle = '#8b9698'; g.lineWidth = 2; rr(g, fx - fr - 6, fy - fr - 6, 2 * fr + 12, 2 * fr + 12, 6); g.fill(); g.stroke();
  g.save(); g.translate(fx, fy); g.rotate(on ? clock * 9 : 0.3);
  g.fillStyle = on ? '#6f7c80' : '#a7b0b2';
  for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.ellipse(fr * 0.45, 0, fr * 0.45, fr * 0.16, 0.4, 0, 7); g.fill(); }
  g.restore();
  label(g, on ? '換気扇（回っている）' : '換気扇（止まっている）', fx + fr + 6, fy, fx + fr + 40, fy + 30);
  label(g, 'ゴムパッキン（シリコン）', sc.x + sc.w * 0.3, rimY + 3, sc.x + sc.w * 0.36, rimY + 44);
  if (since < 2 && R.RH[t] > 85) label(g, '湯気', sc.x + sc.w * 0.5, sc.y + sc.h * 0.3, sc.x + sc.w * 0.56, sc.y + sc.h * 0.22);
  if (R.wet[t]) label(g, '水滴（ぬれている）', sc.x + sc.w * 0.62, rimY - tile * 0.8, sc.x + sc.w * 0.7, rimY - tile * 1.6);
}

function roomWindow(g, sc, R, t, clock) {
  const c = R.cond, hd = t % 24;
  g.fillStyle = '#d9d2c4'; g.fillRect(sc.x, sc.y, sc.w, sc.h);
  const fw = Math.min(sc.w * 0.78, 620), fh = Math.min(sc.h * 0.78, 420), fx = sc.x + (sc.w - fw) / 2, fy = sc.y + (sc.h - fh) / 2 + 8;
  const frameCol = c.glass === 'resin' ? '#f1f1ec' : '#a9aeb2';
  g.fillStyle = frameCol; g.fillRect(fx - 12, fy - 12, fw + 24, fh + 24);
  // sky by hour
  const day = hd >= 7 && hd < 17;
  const sky = g.createLinearGradient(0, fy, 0, fy + fh);
  sky.addColorStop(0, day ? '#9cc4e4' : '#14203a'); sky.addColorStop(1, day ? '#d8e6ee' : '#2b3550');
  g.fillStyle = sky; g.fillRect(fx, fy, fw, fh);
  const RHs = R.wet[t] ? 100 : R.RH[t];
  // condensation on the glass: fog + droplets in the lower part
  if (RHs >= 96) {
    const a = R.wet[t] ? 1 : (RHs - 96) / 4;
    g.fillStyle = `rgba(225,232,236,${0.32 * a})`; g.fillRect(fx, fy + fh * 0.25, fw, fh * 0.75);
    droplets(g, fx, fy + fh * 0.3, fw, fh * 0.68, 120, 4, a);
    // runs
    g.strokeStyle = `rgba(200,225,240,${0.35 * a})`; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const x = fx + hash(i, 31) * fw, y0 = fy + fh * (0.4 + hash(i, 32) * 0.3); g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (hash(i, 33) - 0.5) * 4, fy + fh); g.stroke(); }
  }
  // mullion (two sliding panes)
  g.fillStyle = frameCol; g.fillRect(fx + fw / 2 - 6, fy, 12, fh);
  // gaskets along the bottom of each pane
  const gy = fy + fh - 8;
  g.fillStyle = '#8f9496'; g.fillRect(fx, gy, fw, 8);
  if (R.wet[t]) { g.fillStyle = 'rgba(120,190,235,.55)'; g.fillRect(fx, gy - 2, fw, 4); }
  moldSpots(g, R, t, 80, i => [fx + (i + hash(i, 9)) / 80 * fw, gy + 4 + (hash(i, 11) - 0.5) * 5], 7, 3);
  if (R.V[t] > 4.2) moldSpots(g, R, t, 30, i => [fx + hash(i, 41) * fw, fy + fh * (0.9 + hash(i, 42) * 0.08)], 8, 2);
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.strokeRect(fx - 12, fy - 12, fw + 24, fh + 24);
  label(g, 'ゴムパッキン', fx + fw * 0.62, gy + 4, fx + fw * 0.7, fy + fh + 30);
  label(g, optOf('glass', c.glass).name, fx + fw * 0.75, fy + fh * 0.2, fx + fw * 0.88, fy - 24);
  if (RHs >= 99) label(g, '結露（ガラスが冷えて水滴に）', fx + fw * 0.3, fy + fh * 0.6, fx + fw * 0.42, fy + fh * 0.12);
}

function roomWall(g, sc, R, t, clock) {
  const c = R.cond;
  const floorY = sc.y + sc.h * 0.8;
  const wg = g.createLinearGradient(sc.x, 0, sc.x + sc.w, 0);
  wg.addColorStop(0, '#e2dccf'); wg.addColorStop(1, '#d4cdbd');
  g.fillStyle = wg; g.fillRect(sc.x, sc.y, sc.w, floorY - sc.y);
  // wallpaper emboss
  g.fillStyle = 'rgba(0,0,0,.035)';
  for (let i = 0; i < 160; i++) g.fillRect(sc.x + hash(i, 51) * sc.w, sc.y + hash(i, 52) * (floorY - sc.y), 3, 3);
  g.fillStyle = '#8a6a4a'; g.fillRect(sc.x, floorY, sc.w, sc.y + sc.h - floorY);
  g.fillStyle = '#6b4f36'; g.fillRect(sc.x, floorY - 8, sc.w, 8);
  // where the mould grows: behind the furniture, or in the lower corner
  const fx = sc.x + sc.w * 0.42, fw = Math.min(sc.w * 0.34, 260), fy = sc.y + sc.h * 0.22;
  const zone = c.furn === 'none' ? { x: sc.x, y: sc.y + sc.h * 0.45, w: sc.w * 0.22, h: floorY - sc.y - sc.h * 0.45 } : { x: fx + 8, y: fy + 20, w: fw - 16, h: floorY - fy - 30 };
  moldSpots(g, R, t, 120, i => [zone.x + hash(i, 61) * zone.w, zone.y + Math.pow(hash(i, 62), 0.55) * zone.h], 11, 3.4);
  if (R.wet[t]) droplets(g, zone.x, zone.y, zone.w, zone.h, 50, 6, 0.9);
  if (c.furn !== 'none') {
    // furniture drawn see-through so the wall behind it shows
    g.fillStyle = 'rgba(120,86,56,.28)'; g.fillRect(fx, fy, fw, floorY - fy);
    g.setLineDash([6, 5]); g.strokeStyle = 'rgba(80,56,36,.9)'; g.lineWidth = 2; g.strokeRect(fx, fy, fw, floorY - fy); g.setLineDash([]);
    g.beginPath(); g.moveTo(fx + fw / 2, fy); g.lineTo(fx + fw / 2, floorY); g.stroke();
    label(g, c.furn === 'tight' ? 'たんす（透かして見ている）壁にぴったり' : 'たんす（透かして見ている）壁から 5cm', fx + fw * 0.5, fy + 10, fx + fw * 0.7, fy - 22);
  }
  // cold side
  g.fillStyle = 'rgba(120,170,230,.18)'; g.fillRect(sc.x, sc.y, 6, floorY - sc.y);
  label(g, `外に面した北の壁（${optOf('insul', c.insul).name === 'ふつう' ? '断熱ふつう' : '断熱' + optOf('insul', c.insul).name}）`, sc.x + sc.w * 0.16, sc.y + sc.h * 0.18, sc.x + sc.w * 0.04, sc.y + 40);
  if (R.wet[t]) label(g, '結露', zone.x + zone.w * 0.3, zone.y + zone.h * 0.4, zone.x - 20, zone.y + zone.h * 0.55);
}

function roomCloset(g, sc, R, t, clock) {
  const c = R.cond;
  g.fillStyle = '#2a211a'; g.fillRect(sc.x, sc.y, sc.w, sc.h);
  const ox = sc.x + sc.w * 0.12, ow = sc.w * 0.76, oy = sc.y + 16, oh = sc.h - 30;
  g.fillStyle = '#c7a77a'; g.fillRect(ox, oy, ow, oh);           // plywood back wall
  g.strokeStyle = 'rgba(120,86,50,.25)'; g.lineWidth = 1;
  for (let i = 0; i < 26; i++) { const y = oy + hash(i, 71) * oh; g.beginPath(); g.moveTo(ox, y); g.bezierCurveTo(ox + ow * 0.3, y + 6, ox + ow * 0.6, y - 6, ox + ow, y + 3); g.stroke(); }
  const shelfY = oy + oh * 0.52;
  // mould on the back wall around and behind the futon
  const zone = { x: ox + 10, y: oy + 10, w: ow - 20, h: shelfY - oy - 20 };
  moldSpots(g, R, t, 130, i => [zone.x + hash(i, 81) * zone.w, zone.y + Math.pow(hash(i, 82), 0.7) * zone.h], 13, 3.4);
  if (R.V[t] > 4) moldSpots(g, R, t, 50, i => [ox + 10 + hash(i, 83) * (ow - 20), shelfY + 16 + hash(i, 84) * (oy + oh - shelfY - 30)], 14, 2.6);
  // shelf
  g.fillStyle = '#9c7a4f'; g.fillRect(ox, shelfY, ow, 14);
  // sunoko
  const gap = c.cAir === 'closed' ? 0 : 14;
  if (gap) { g.fillStyle = '#d9c29a'; for (let i = 0; i < 7; i++) g.fillRect(ox + 20 + i * (ow - 40) / 6.6, shelfY - gap, (ow - 40) / 10, gap); }
  // futon stack (drawn see-through so the wall behind shows)
  const fcol = ['#d2dbe8', '#e6c6c9', '#cfe0cf'];
  for (let k = 0; k < 3; k++) {
    const h = (shelfY - gap - oy) * 0.2, y = shelfY - gap - (k + 1) * h - 2;
    g.fillStyle = rgba(fcol[k] === '#d2dbe8' ? '#d2dbe8' : fcol[k], 0.55); rr(g, ox + 24 + gap, y, ow - 60 - gap, h, h * 0.45); g.fill();
    g.strokeStyle = 'rgba(80,70,70,.5)'; g.stroke();
  }
  if (R.wet[t]) droplets(g, zone.x, zone.y, zone.w, zone.h, 40, 8, 0.8);
  // fusuma (sliding doors) at both sides
  const open = c.cAir === 'open';
  g.fillStyle = '#efe6d2'; g.fillRect(sc.x, sc.y, ox - sc.x - (open ? 30 : 0), sc.h); g.fillRect(ox + ow + (open ? 30 : 0), sc.y, sc.x + sc.w - ox - ow, sc.h);
  label(g, '合板の壁（奥は北の外壁）', ox + ow * 0.8, oy + 24, ox + ow * 0.8, oy + oh * 0.75);
  label(g, c.futon === 'soon' ? 'ふとん（起きてすぐしまった）' : 'ふとん（湿気をとばした）', ox + ow * 0.5, shelfY - gap - 20, ox + ow * 0.42, oy + oh * 0.68);
  if (gap) label(g, 'すのこ', ox + 30, shelfY - gap / 2, ox + 30, shelfY + 46);
}
