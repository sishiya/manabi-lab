// ほこりが積もるまで — 部屋の絵（壁・床・窓・家具）。形は room.js の FURN（計算に使う箱）に合わせて、その中を描きこむ
'use strict';

const COL = { bg: '#0d1620', room: '#121e2b', line: 'rgba(190,215,235,.55)', dim: 'rgba(190,215,235,.25)', ink: '#e8f0f4', muted: '#a3b4bf', acc: '#e6c88a', out: '#0a1118',
  wall: '#1a2735', wallLine: 'rgba(190,215,235,.35)', wood: '#5b4635', woodLine: '#8a6b50', fab: '#3f5670', fabLine: 'rgba(200,220,240,.55)', metal: '#2a3644', panel: '#d9dde2' };
const FF = "'Zen Kaku Gothic New','Yu Gothic',sans-serif";
const furn = k => FURN.find(f => f.key === k);

// 角の丸い四角（m で）
function rrect(x0, y0, x1, y1, r) {
  const a = X(x0), b = Y(y1), w = (x1 - x0) * VIEW.s, h = (y1 - y0) * VIEW.s, rr = Math.min(r * VIEW.s, w / 2, h / 2);
  g.beginPath(); g.moveTo(a + rr, b); g.arcTo(a + w, b, a + w, b + h, rr); g.arcTo(a + w, b + h, a, b + h, rr); g.arcTo(a, b + h, a, b, rr); g.arcTo(a, b, a + w, b, rr); g.closePath();
}
function seg(x0, y0, x1, y1) { g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke(); }
function lw(m, min = 1) { return Math.max(min, m * VIEW.s); }
function fsz(m, min = 9, max = 15) { return Math.max(min, Math.min(max, m * VIEW.s)); }

// 外・壁・床・天井（部屋の中より先に描く）
function drawShellBack(st) {
  const s = VIEW.s;
  // 外の空（夜は暗く）
  const h = hourOf(st.t), day = h > 6 && h < 18;
  const sky = g.createLinearGradient(0, Y(ROOM_H + PAD_T), 0, Y(0));
  sky.addColorStop(0, day ? '#1d3550' : '#070c14'); sky.addColorStop(1, day ? '#2c4a62' : '#0d1622');
  g.fillStyle = sky; g.fillRect(X(WORLD.x0), Y(WORLD.y1), (OUT_L - 0.12) * s, (WORLD.y1 - WORLD.y0) * s);
  // 外の地面と植えこみ
  g.fillStyle = '#16211a'; g.fillRect(X(WORLD.x0), Y(0.05), (OUT_L - 0.12) * s, (0.05 - WORLD.y0) * s);
  g.fillStyle = '#21352a';
  for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(X(-0.36 + k * 0.07), Y(0.12 + (k % 2) * 0.04), 0.06 * s, 0.09 * s, 0, 0, 7); g.fill(); }
  // 壁の厚み（左 0.12m・右 0.12m）、天井・床のスラブ
  g.fillStyle = COL.wall;
  g.fillRect(X(-0.12), Y(WORLD.y1), 0.12 * s, (WORLD.y1 - WORLD.y0) * s);
  g.fillRect(X(ROOM_W), Y(WORLD.y1), (WORLD.x1 - ROOM_W) * s, (WORLD.y1 - WORLD.y0) * s);
  g.fillRect(X(0), Y(WORLD.y1), ROOM_W * s, PAD_T * s);
  g.fillRect(X(-0.12), Y(0), (ROOM_W + 0.24) * s, PAD_B * s);
  // 部屋の中
  g.fillStyle = COL.room; g.fillRect(X(0), Y(ROOM_H), ROOM_W * s, ROOM_H * s);
  // 窓の穴・給気口の穴は外が見える
  const wy0 = WINDOW.j0 * DX, wy1 = WINDOW.j1 * DX, vy0 = VENT.j0 * DX, vy1 = VENT.j1 * DX;
  g.fillStyle = sky; g.fillRect(X(-0.12), Y(wy1), 0.12 * s, (wy1 - wy0) * s);
  g.fillStyle = '#05080c'; g.fillRect(X(-0.12), Y(vy1), 0.12 * s, (vy1 - vy0) * s);
  // フローリング（床の板）
  g.fillStyle = '#3a2d23'; g.fillRect(X(0), Y(0), ROOM_W * s, 0.018 * s + 1);
  g.strokeStyle = 'rgba(140,110,80,.45)'; g.lineWidth = 1;
  for (let x = 0.3; x < ROOM_W; x += 0.6) seg(x, 0, x, -0.018);
}

// 窓わく・巾木・給気口・ラベル（家具や粒より手前）
function drawShellFront(st) {
  const s = VIEW.s, wy0 = WINDOW.j0 * DX, wy1 = WINDOW.j1 * DX, vy0 = VENT.j0 * DX, vy1 = VENT.j1 * DX;
  g.strokeStyle = COL.wallLine; g.lineWidth = lw(0.006, 1.5);
  g.beginPath();
  g.moveTo(X(0), Y(0)); g.lineTo(X(0), Y(wy0)); g.moveTo(X(0), Y(wy1)); g.lineTo(X(0), Y(vy0)); g.moveTo(X(0), Y(vy1)); g.lineTo(X(0), Y(ROOM_H));
  g.lineTo(X(ROOM_W), Y(ROOM_H)); g.lineTo(X(ROOM_W), Y(DOOR.j1 * DX));
  g.moveTo(X(0), Y(0)); g.lineTo(X(ROOM_W), Y(0));
  g.stroke();
  // 巾木（壁の下の板）
  g.fillStyle = '#d4d9de'; g.globalAlpha = 0.5;
  g.fillRect(X(0), Y(0.06), 0.012 * s, 0.06 * s);
  g.globalAlpha = 1;
  // 窓: わく・窓台・ガラス2枚（引き違い。開けると片方が重なって半分が空く）
  g.fillStyle = '#c8cdd2'; g.strokeStyle = 'rgba(230,236,242,.8)'; g.lineWidth = 1;
  g.fillRect(X(-0.12), Y(wy0), 0.14 * s, 0.025 * s);   // 窓台
  g.fillRect(X(-0.12), Y(wy1 + 0.02), 0.12 * s, 0.02 * s);
  const glass = (x, y0, y1) => { g.fillStyle = 'rgba(150,200,235,.18)'; g.fillRect(X(x - 0.012), Y(y1), 0.024 * s, (y1 - y0) * s); g.strokeStyle = 'rgba(190,225,250,.75)'; g.lineWidth = lw(0.004, 1); g.strokeRect(X(x - 0.012), Y(y1), 0.024 * s, (y1 - y0) * s); };
  if (st.window) { glass(-0.085, wy0, wy1); glass(-0.045, wy0, wy1); }   // 2枚が重なって、奥行きの半分が開く
  else { glass(-0.085, wy0, wy1); glass(-0.04, wy0, wy1); }
  // カーテンレールとたばねたカーテン
  g.strokeStyle = COL.dim; g.lineWidth = lw(0.008, 1.5); seg(0, wy1 + 0.1, 0.12, wy1 + 0.1);
  // 給気口のフード
  g.fillStyle = st.vent ? '#d8c08e' : '#7b8590'; g.fillRect(X(0), Y(vy1 + 0.015), 0.035 * s, (vy1 - vy0 + 0.03) * s);
  g.strokeStyle = '#1b2430'; g.lineWidth = 1;
  for (let k = 1; k < 4; k++) seg(0.005, vy0 - 0.015 + k * (vy1 - vy0 + 0.03) / 4, 0.03, vy0 - 0.015 + k * (vy1 - vy0 + 0.03) / 4);
  // ラベル
  const fs = fsz(0.055);
  g.font = `${fs}px ${FF}`; g.fillStyle = COL.muted; g.textAlign = 'left';
  g.fillText(st.vent ? '給気口' : '給気口（閉）', X(0.05), Y(vy0 - 0.02) + fs);
  g.textAlign = 'center'; g.fillStyle = 'rgba(200,215,230,.6)';
  g.fillText('そと', X(-0.27), Y(ROOM_H - 0.12));
  g.fillText(st.window ? '窓（開）' : '窓', X(-0.27), Y((wy0 + wy1) / 2));
  g.textAlign = 'right'; g.fillStyle = COL.dim;
  g.fillText('ドアの下のすき間 →', X(ROOM_W - 0.02), Y(0.045));
}

function drawFurniture(st) {
  const s = VIEW.s;
  // ---- ベッド（足もとから見た断面: 木のわく・マットレス・まくら・かけぶとん）
  const bed = furn('bed');
  g.fillStyle = COL.wood; g.strokeStyle = COL.woodLine; g.lineWidth = lw(0.004, 1);
  rrect(bed.x0, bed.y0, bed.x1, bed.y0 + 0.1, 0.01); g.fill(); g.stroke();
  for (const k of ['legL', 'legR']) { const f = furn(k); rrect(f.x0, f.y0, f.x1, f.y1 + 0.01, 0.005); g.fill(); g.stroke(); }
  // まくら（奥）
  g.fillStyle = '#4b5d72'; rrect(0.18, 0.47, 0.62, 0.62, 0.06); g.fill();
  // マットレス
  g.fillStyle = '#c9ced6'; g.strokeStyle = 'rgba(240,245,250,.7)';
  rrect(bed.x0 + 0.01, bed.y0 + 0.1, bed.x1 - 0.01, bed.y1, 0.04); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(120,130,145,.5)'; seg(bed.x0 + 0.03, bed.y0 + 0.2, bed.x1 - 0.03, bed.y0 + 0.2);
  // かけぶとん（ふちが垂れる）。寝ているときは人の絵の方でふくらませる
  if (PS.state !== 'sleep') drawDuvet(0.5);
  // ---- 空気清浄機（横に吸いこみのスリット、上に吹き出し口）
  const pur = furn('pur');
  g.fillStyle = '#c4cad1'; g.strokeStyle = st.purifier ? COL.acc : 'rgba(240,245,250,.7)'; g.lineWidth = lw(0.004, 1);
  rrect(pur.x0, pur.y0 + 0.01, pur.x1, pur.y1, 0.03); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(60,70,82,.6)'; g.lineWidth = 1;
  for (let y = 0.07; y < 0.38; y += 0.03) { seg(pur.x0 + 0.015, y, pur.x0 + 0.045, y); seg(pur.x1 - 0.045, y, pur.x1 - 0.015, y); }
  g.fillStyle = '#56606c'; g.fillRect(X(pur.x0 + 0.03), Y(pur.y1), (pur.x1 - pur.x0 - 0.06) * s, 0.012 * s + 1);
  g.fillStyle = st.purifier ? '#7fdc8a' : '#56606c'; g.beginPath(); g.arc(X((pur.x0 + pur.x1) / 2), Y(pur.y1 - 0.06), lw(0.008, 1.5), 0, 7); g.fill();
  // ---- 机（天板・脚・スタンド・本）
  const desk = furn('desk');
  g.fillStyle = COL.wood; g.strokeStyle = COL.woodLine; g.lineWidth = lw(0.004, 1);
  rrect(desk.x0 - 0.01, desk.y0, desk.x1, desk.y1, 0.008); g.fill(); g.stroke();
  for (const k of ['dlegL', 'dlegR']) { const f = furn(k); g.fillStyle = COL.metal; g.fillRect(X(f.x0), Y(f.y1), (f.x1 - f.x0) * s, f.y1 * s); }
  // スタンド（奥。細いので空気は通る）
  g.strokeStyle = 'rgba(200,210,220,.6)'; g.lineWidth = lw(0.012, 1.5); g.lineCap = 'round';
  seg(3.38, 0.75, 3.38, 1.12); seg(3.38, 1.12, 3.2, 1.2);
  g.fillStyle = st.t % 86400 > 18 * 3600 && PS.state === 'sit' ? 'rgba(255,224,150,.9)' : 'rgba(170,180,190,.7)';
  g.beginPath(); g.moveTo(X(3.12), Y(1.17)); g.lineTo(X(3.26), Y(1.24)); g.lineTo(X(3.22), Y(1.13)); g.closePath(); g.fill();
  // ---- いす（背もたれは左。人は机のほうを向く）
  g.strokeStyle = 'rgba(190,205,220,.75)'; g.lineWidth = lw(0.018, 1.5);
  seg(2.24, 0.45, 2.62, 0.45); seg(2.27, 0.45, 2.27, 0.02); seg(2.59, 0.45, 2.59, 0.02); seg(2.25, 0.45, 2.21, 0.98);
  g.lineWidth = lw(0.03, 2); seg(2.215, 0.7, 2.205, 0.95);
  // ---- 棚と本（奥に立てた本）
  const sh = furn('shelf');
  g.fillStyle = COL.wood; g.strokeStyle = COL.woodLine; g.lineWidth = lw(0.004, 1);
  rrect(sh.x0, sh.y0, sh.x1, sh.y1, 0.006); g.fill(); g.stroke();
  g.strokeStyle = COL.metal; g.lineWidth = lw(0.01, 1); seg(sh.x1 - 0.01, sh.y0, sh.x1 - 0.12, sh.y0 - 0.12);
  const books = [[2.95, 0.2, '#4b6787'], [2.99, 0.24, '#7a5a4a'], [3.035, 0.21, '#5c7a5c'], [3.07, 0.18, '#8c7a52']];
  for (const [x, h, c] of books) { g.fillStyle = c; g.globalAlpha = 0.55; g.fillRect(X(x), Y(sh.y1 + h), 0.032 * s, h * s); }
  g.globalAlpha = 0.55; g.fillStyle = '#6b7f90'; g.save(); g.translate(X(3.12), Y(sh.y1)); g.rotate(-0.35); g.fillRect(0, -0.2 * s, 0.03 * s, 0.2 * s); g.restore();
  g.globalAlpha = 1;
  // ---- エアコン（前のパネル・吹き出し口のルーバー）
  const ac = furn('ac');
  g.fillStyle = COL.panel; g.strokeStyle = st.ac ? COL.acc : 'rgba(250,250,250,.8)'; g.lineWidth = lw(0.004, 1);
  rrect(ac.x0, ac.y0, ac.x1, ac.y1, 0.05); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(120,130,140,.6)'; g.lineWidth = 1; seg(ac.x0 + 0.03, ac.y1 - 0.06, ac.x1 - 0.01, ac.y1 - 0.06);
  g.strokeStyle = '#5f6b78'; g.lineWidth = lw(0.012, 1.5);
  if (st.ac) seg(ac.x0 + 0.03, ac.y0 + 0.005, ac.x0 - 0.06, ac.y0 - 0.06); else seg(ac.x0 + 0.03, ac.y0 + 0.01, ac.x1 - 0.05, ac.y0 + 0.01);
  g.fillStyle = st.ac ? '#7fdc8a' : '#9aa4ae'; g.beginPath(); g.arc(X(ac.x1 - 0.06), Y(ac.y0 + 0.05), lw(0.006, 1.2), 0, 7); g.fill();
  g.lineCap = 'butt';
}

// かけぶとん: 上の高さ top（寝ているときは人のぶん盛り上がる）。ベッドの横にふちが垂れる
function drawDuvet(top, bump = 0) {
  const bed = furn('bed'), a = bed.x0 - 0.015, b = bed.x1 + 0.015;
  g.fillStyle = COL.fab; g.strokeStyle = COL.fabLine; g.lineWidth = lw(0.004, 1);
  g.beginPath(); g.moveTo(X(a), Y(0.34));
  g.lineTo(X(a), Y(top - 0.03)); g.quadraticCurveTo(X(a), Y(top), X(a + 0.06), Y(top));
  if (bump) g.bezierCurveTo(X(0.35), Y(top + bump), X(0.85), Y(top + bump * 0.8), X(b - 0.06), Y(top));
  else g.lineTo(X(b - 0.06), Y(top));
  g.quadraticCurveTo(X(b), Y(top), X(b), Y(top - 0.03)); g.lineTo(X(b), Y(0.32));
  g.quadraticCurveTo(X(b - 0.04), Y(0.335), X(b - 0.08), Y(0.33)); g.lineTo(X(a + 0.06), Y(0.345)); g.closePath();
  g.fill(); g.stroke();
  g.strokeStyle = 'rgba(200,220,240,.25)';   // しわ
  seg(a + 0.02, 0.42, a + 0.04, 0.36); seg(b - 0.02, 0.43, b - 0.05, 0.35); seg(0.45, top - 0.01 + bump * 0.5, 0.52, top - 0.05 + bump * 0.4);
}

function drawFurnitureLabels(st) {
  const fs = fsz(0.05);
  g.font = `${fs}px ${FF}`; g.textAlign = 'center'; g.fillStyle = 'rgba(30,40,52,.85)';
  g.fillText('ベッド', X(0.6), Y(0.36) + fs * 0.35);
  g.fillStyle = COL.muted;
  g.fillText('机', X(3.15), Y(0.62));
  g.fillText('棚', X(3.45), Y(1.68));
  g.fillStyle = 'rgba(40,50,60,.9)'; g.fillText(st.ac ? 'エアコン（入）' : 'エアコン', X(3.42), Y(2.2) + fs * 0.35);
  g.save(); g.translate(X(2.05), Y(0.26)); g.rotate(-Math.PI / 2); g.fillStyle = 'rgba(40,50,60,.9)'; g.fillText(st.purifier ? '空気清浄機（入）' : '空気清浄機', 0, fs * 0.35); g.restore();
}
