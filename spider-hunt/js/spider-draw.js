// クモがハエをつかまえるまで — クモと獲物の絵（横から。単位は mm、k は px/mm）
// 動きの出どころ: 振り向いてから忍び寄り、後半は台に体をふせ、跳ぶ前に命綱をつけ、前脚を斜め前へ広げて跳ぶ（Dill 1975）。
// 跳ぶ前に前脚を上げ、後ろの脚（第3・第4脚）で押す（Nabawy ほか 2018 の総説部分）。
// 脚の運び（左右交互の4本ずつ）と歩幅・体の高さ・ハエの毛づくろいは目安（見た目だけ）。
'use strict';
const SD = (() => {
const COL = { sp: '#ffc95a', spFill: 'rgba(255,201,90,.16)', spFar: 'rgba(255,201,90,.38)', fly: '#8fd3ff', flyFill: 'rgba(143,211,255,.14)', flyFar: 'rgba(143,211,255,.35)', eye: 'rgba(255,120,100,.35)', silk: 'rgba(240,248,255,.9)' };

// 2本の骨のIK（ひざは上へ）。返り値はひざの位置
function ik(hx, hy, fx, fy, a, b, up) {
  const dx = fx - hx, dy = fy - hy, d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, Math.hypot(dx, dy)));
  const ang = Math.atan2(dy, dx), c = Math.acos((a * a + d * d - b * b) / (2 * a * d));
  const s = (up ? 1 : -1) * (fx >= hx ? 1 : -1);   // 前へのびる脚も後ろへのびる脚も、ひざが上に来るように
  return [hx + a * Math.cos(ang + s * c), hy + a * Math.sin(ang + s * c)];
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 脚: [付け根x, 足の家x, 腿, すね（膝から先）, 群（0/0.5）]。x は頭胸部の前のはしを 0 とした mm。
// 脚は横へ広がるので、横から見た長さは短く見える（目安で 0.6 倍ほど）
const LEGS = [
  [-0.8, 3.2, 2.2, 3.0, 0],     // 第1脚（太い）
  [-1.7, 0.8, 1.9, 2.6, 0.5],
  [-2.6, -4.2, 2.0, 2.8, 0],
  [-3.4, -7.4, 2.3, 3.2, 0.5],
];

// クモの姿勢（状態から決まる。巻き戻しても同じ絵になる）
function spiderPose(s, P, t) {
  const sd = M.DATA.spider;
  const trav = (s.D0 - s.D), gaitP = trav / sd.stride;
  const low = P.crouch ? smooth(sd.crouchBelow, sd.crouchBelow - 6, s.D) : 0;
  let y0 = 1.7 - 0.9 * low;                         // 頭胸部の下の高さ
  if (s.sp === 'stalk') y0 += 0.07 * Math.sin(gaitP * Math.PI * 4);
  if (s.sp === 'prep') y0 = 0.55 + 0.5 * (1 - smooth(0, 0.6, s.spT / M.DATA.jump.prep)) * (1 - low);
  let pitch = 0;
  if (s.sp === 'flight' && s.jump) { const tau = s.t - s.jump.t0, vy = s.jump.vy - 9810 * tau; pitch = Math.atan2(vy, s.jump.vx) * 0.8; y0 = 1.0; }
  return { y0, gaitP, low, pitch, prepK: s.sp === 'prep' ? smooth(0, 1, s.spT / M.DATA.jump.prep) : s.sp === 'flight' || s.sp === 'contact' ? 1 : 0 };
}

function footFor(i, far, s, pose) {
  const [hx, home, , , grp] = LEGS[i], sd = M.DATA.spider;
  const g = (grp + (far ? 0.5 : 0)) % 1;
  let fx = home, fy = 0;
  if (s.sp === 'stalk' || s.sp === 'stop') {
    const p = pose.gaitP + g, f = p - Math.floor(p), beta = 0.62, S = sd.stride;
    if (s.sp === 'stalk' && f < beta) fx = home + S * beta * (0.5 - f / beta);
    else if (s.sp === 'stalk') { const u = (f - beta) / (1 - beta); fx = home + S * beta * (-0.5 + u); fy = 0.9 * Math.sin(Math.PI * u); }
  }
  if (s.sp === 'prep' || s.sp === 'flight' || s.sp === 'contact') {
    const k = pose.prepK;
    if (i === 0) { fx = home + (s.sp === 'prep' ? 0.6 * k : 2.6); fy = s.sp === 'prep' ? 2.4 * k : s.sp === 'contact' ? 0.4 : pose.y0 + 1.2; }   // 前脚を上げる → 斜め前へ広げる
    if (i === 1 && s.sp !== 'prep') { fx = home + 2.6; fy = s.sp === 'contact' ? 0.2 : pose.y0 + 0.4; }
    if (i >= 2 && s.sp === 'prep') { fx = home - 0.6 * k; }                                                            // 後ろの脚をためる
    if (i >= 2 && s.sp === 'flight') { const tau = s.t - s.jump.t0; fx = home - 2.2 - Math.min(1.5, tau * 120); fy = pose.y0 - 0.3; } // 押し切って後ろへのびる
  }
  if (s.sp === 'turn' && i === 0) { fy = 0.6 + 0.4 * Math.sin(s.spT * 30); } // 振り向きながら前脚を浮かせる（目安）
  return [fx, fy];
}

// クモを描く。x0 は頭胸部の前のはしの画面x、gy は台の画面y、k は px/mm
function drawSpider(g, x0, gy, k, s, P, opt = {}) {
  const pose = spiderPose(s, P), sx = Math.max(0.18, Math.cos((s.yaw || 0) * Math.PI / 2));
  const alpha = opt.ghost ? 0.22 : 1;
  g.save(); g.globalAlpha = alpha;
  g.translate(x0, gy - s.h * k); g.scale(k * sx, -k);  // y は上が正
  g.rotate(pose.pitch);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const y0 = pose.y0;
  const legs = far => {
    g.strokeStyle = far ? COL.spFar : COL.sp;
    for (let i = 0; i < 4; i++) {
      const [hx, , a, b] = LEGS[i], hy = y0 + 0.5;
      let [fx, fy] = footFor(i, far, s, pose); fx += far ? 0.35 : 0;
      const [kx, ky] = ik(hx, hy, fx, fy, a, b, true);
      g.lineWidth = (i === 0 ? 0.55 : 0.38) * (far ? 0.8 : 1);
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
      if (!opt.ghost && !far) { g.lineWidth = 0.12; for (let q = 0.3; q < 1; q += 0.25) { const px = kx + (fx - kx) * q, py = ky + (fy - ky) * q; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 0.25, py + 0.3); g.stroke(); } } // 毛（目安）
    }
  };
  legs(true);
  // 腹（後ろ）
  g.fillStyle = COL.spFill; g.strokeStyle = COL.sp; g.lineWidth = 0.22;
  g.beginPath(); g.ellipse(-6.7, y0 + 1.25, 2.7, 1.55, -0.05, 0, 7); g.fill(); g.stroke();
  if (!opt.ghost) { g.lineWidth = 0.14; g.beginPath(); g.moveTo(-8.6, y0 + 1.6); g.quadraticCurveTo(-6.8, y0 + 2.3, -4.6, y0 + 1.7); g.moveTo(-8.8, y0 + 0.9); g.quadraticCurveTo(-6.8, y0 + 1.6, -4.4, y0 + 1.0); g.stroke(); } // しま模様
  // 頭胸部（前が四角い）
  g.lineWidth = 0.24; g.beginPath();
  g.moveTo(0, y0 + 0.2); g.lineTo(0.05, y0 + 2.0); g.quadraticCurveTo(-0.1, y0 + 2.75, -0.9, y0 + 2.75);
  g.lineTo(-3.1, y0 + 2.6); g.quadraticCurveTo(-4.3, y0 + 2.2, -4.3, y0 + 1.1); g.quadraticCurveTo(-4.1, y0 + 0.2, -3.2, y0 + 0.1); g.closePath();
  g.fill(); g.stroke();
  // 目（前の大きな目・横の目）
  if (!opt.ghost) {
    g.fillStyle = 'rgba(14,22,32,.9)'; g.beginPath(); g.ellipse(-0.05, y0 + 1.45, 0.38, 0.62, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(0.02, y0 + 1.7, 0.12, 0, 7); g.fill();
    g.fillStyle = 'rgba(14,22,32,.9)'; for (const [ex, ey, r] of [[-0.8, y0 + 2.45, 0.22], [-2.6, y0 + 2.55, 0.2]]) { g.beginPath(); g.arc(ex, ey, r, 0, 7); g.fill(); g.stroke(); }
    // 触肢（ちょこちょこ動く。目安）
    const pw = s.sp === 'stalk' ? 0.25 * Math.sin(s.t * 18) : 0;
    g.lineWidth = 0.3; g.beginPath(); g.moveTo(0, y0 + 0.4); g.lineTo(0.6, y0 + 0.1 + pw); g.lineTo(0.9, y0 - 0.25 + pw); g.stroke();
  }
  legs(false);
  g.restore();
  // 振り向く前は顔がこちらを向く（大きな前の目が2つ見える）
  if ((s.yaw || 0) > 0.55 && !opt.ghost) {
    g.save(); g.translate(x0 - 1.8 * k * sx, gy - (pose.y0 + 1.5) * k);
    g.fillStyle = 'rgba(14,22,32,.95)'; g.strokeStyle = COL.sp; g.lineWidth = Math.max(1, 0.2 * k);
    for (const dx of [-0.55, 0.55]) { g.beginPath(); g.arc(dx * k, 0, 0.5 * k, 0, 7); g.fill(); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.75)'; for (const dx of [-0.45, 0.65]) { g.beginPath(); g.arc(dx * k, -0.18 * k, 0.13 * k, 0, 7); g.fill(); }
    g.restore();
  }
}
// 糸いぼの画面上の位置（命綱を描くため）
function spinneret(x0, gy, k, s, P) {
  const pose = spiderPose(s, P), sx = Math.max(0.18, Math.cos((s.yaw || 0) * Math.PI / 2));
  const lx = -9.3, ly = pose.y0 + 1.0, c = Math.cos(pose.pitch), sn = Math.sin(pose.pitch);
  return [x0 + (lx * c - ly * sn) * k * sx, gy - s.h * k - (lx * sn + ly * c) * k];
}

// ---- イエバエ（横から）。cx は体の中心、face: -1＝頭が左（クモの方）、1＝頭が右、0＝正面（頭がこちら）
function drawFly(g, cx, gy, k, face, s, opt = {}) {
  const pr = M.prey(P_ || {}), air = s.fl === 'air' ? s.t - s.ev.to : 0;
  // 飛び立った後の動き（見た目だけ。刺激と反対へ跳ぶ: Card & Dickinson 2008）
  const ox = air ? Math.min(30, air * 260) : 0, oy = air ? Math.min(25, air * 200 + air * air * 300) : 0;
  g.save(); g.globalAlpha = opt.ghost ? 0.22 : 1;
  g.translate(cx + ox * k, gy - oy * k); g.lineJoin = 'round'; g.lineCap = 'round';
  k *= pr.len / 7;   // 絵はイエバエ（7mm）の形。コバエは同じ形を小さく
  const y0 = 1.3 + (air ? 0.4 : 0);
  if (face === 0) { drawFlyFront(g, k, s, y0, air); g.restore(); return; }
  g.scale(k * face, -k);    // 頭は +x 側に描いて、向きで反転（face −1 で頭が左＝クモの方）
  const legs = far => {
    g.strokeStyle = far ? COL.flyFar : COL.fly; g.lineWidth = 0.2;
    const groom = s.fl === 'rest' && !air && Math.sin(s.t * 4) > 0.4; // ときどき前脚をこする（目安）
    for (const [hx, fx] of [[1.2, 2.6], [0.4, 0.4], [-0.4, -2.0]]) {
      let fX = fx + (far ? 0.3 : 0), fY = 0;
      if (air) { fX = hx - 0.3; fY = -0.6; }
      else if (groom && hx > 1) { fX = 2.3 + 0.25 * Math.sin(s.t * 40); fY = 1.2; }
      const [kx, ky] = ik(hx, y0, fX, fY, 1.4, 1.7, true);
      g.beginPath(); g.moveTo(hx, y0); g.lineTo(kx, ky); g.lineTo(fX, fY); g.stroke();
    }
  };
  legs(true);
  g.fillStyle = COL.flyFill; g.strokeStyle = COL.fly; g.lineWidth = 0.2;
  g.beginPath(); g.ellipse(-1.6, y0 + 0.9, 2.0, 1.15, 0.12, 0, 7); g.fill(); g.stroke();  // 腹
  g.beginPath(); g.ellipse(0.7, y0 + 1.3, 1.5, 1.35, 0, 0, 7); g.fill(); g.stroke();       // 胸
  g.beginPath(); g.ellipse(2.6, y0 + 1.25, 0.8, 1.1, 0, 0, 7); g.fill(); g.stroke();       // 頭
  g.fillStyle = COL.eye; g.beginPath(); g.ellipse(2.7, y0 + 1.45, 0.62, 0.85, 0, 0, 7); g.fill(); // 複眼
  if (!opt.ghost) { g.lineWidth = 0.08; for (let q = -0.5; q < 2; q += 0.45) { g.beginPath(); g.moveTo(q, y0 + 2.5); g.lineTo(q - 0.2, y0 + 3.0); g.stroke(); } } // 毛
  // 翅: 休み＝背中にたたむ／気づいた＝上げる／飛ぶ＝はばたき（ぶれ）
  g.strokeStyle = COL.fly; g.fillStyle = 'rgba(200,230,255,.18)'; g.lineWidth = 0.14;
  const wing = a => { g.save(); g.translate(0.4, y0 + 2.4); g.rotate(a); g.beginPath(); g.ellipse(-2.4, 0, 2.6, 0.75, 0, 0, 7); g.fill(); g.stroke(); g.restore(); };
  if (s.fl === 'rest') wing(0.08);
  else if (s.fl === 'wing') wing(-1.05);
  else { g.globalAlpha *= 0.5; for (const a of [-1.3, -0.5, 0.3]) wing(a); g.globalAlpha /= 0.5; }
  legs(false);
  g.restore();
}
function drawFlyFront(g, k, s, y0, air) {
  g.scale(k, -k); g.strokeStyle = COL.fly; g.fillStyle = COL.flyFill; g.lineWidth = 0.2;
  for (const sx of [-1, 1]) {                      // 脚
    for (const [hx, fx] of [[0.6, 2.4], [0.8, 3.0], [0.6, 2.6]]) { const [kx, ky] = ik(hx * sx, y0 + 0.6, (air ? 1.0 : fx) * sx, air ? -0.5 : 0, 1.4, 1.7, true); g.beginPath(); g.moveTo(hx * sx, y0 + 0.6); g.lineTo(kx, ky); g.lineTo((air ? 1.0 : fx) * sx, air ? -0.5 : 0); g.stroke(); }
  }
  // 翅の傾き（0＝まっすぐ上）: 休み＝背中にたたむ（正面からはほぼ見えない）／気づいた＝上げる／飛ぶ＝はばたき
  const wa = s.fl === 'rest' ? 1.35 : s.fl === 'wing' ? 0.35 : 0.5 + 0.9 * Math.abs(Math.sin(s.t * 600));
  for (const sx of [-1, 1]) { g.save(); g.translate(0.5 * sx, y0 + 2.0); g.rotate(-sx * wa); g.beginPath(); g.ellipse(0, s.fl === 'rest' ? 0.6 : 2.2, 0.45, s.fl === 'rest' ? 0.7 : 2.3, 0, 0, 7); g.fillStyle = 'rgba(200,230,255,.18)'; g.fill(); g.stroke(); g.restore(); }
  g.fillStyle = COL.flyFill; g.beginPath(); g.ellipse(0, y0 + 1.2, 1.5, 1.3, 0, 0, 7); g.fill(); g.stroke(); // 胸
  g.beginPath(); g.ellipse(0, y0 + 2.6, 1.4, 1.0, 0, 0, 7); g.fill(); g.stroke();                         // 頭
  g.fillStyle = COL.eye; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(0.75 * sx, y0 + 2.7, 0.62, 0.8, 0, 0, 7); g.fill(); }
}
// ---- 小さなゴキブリ（横から）。平たい体・前胸の盾・長い触角・お尻の尾角（風を感じる毛）。
// 気づくと体の向きを変え（wing）、走り出す（air）。走る速さは見た目だけ
function drawRoach(g, cx, gy, k, face, s, opt = {}) {
  const pr = M.prey(P_ || {}), run = s.fl === 'air' ? s.t - s.ev.to : 0, piv = s.fl !== 'rest';
  const ox = run ? Math.min(40, run * 300) : 0;
  g.save(); g.globalAlpha = opt.ghost ? 0.22 : 1; g.lineJoin = 'round'; g.lineCap = 'round';
  g.translate(cx + ox * k * (face === 1 ? -1 : 1), gy);
  if (face === 0) {   // 正面
    g.scale(k, -k); g.strokeStyle = COL.fly; g.fillStyle = COL.flyFill; g.lineWidth = 0.15;
    for (const sx of [-1, 1]) for (const [hx, fx] of [[0.6, 2.2], [0.9, 2.8], [0.7, 2.5]]) { const [kx, ky] = ik(hx * sx, 0.6, fx * sx, 0, 1.2, 1.5, true); g.beginPath(); g.moveTo(hx * sx, 0.6); g.lineTo(kx, ky); g.lineTo(fx * sx, 0); g.stroke(); }
    g.beginPath(); g.ellipse(0, 0.9, 1.5, 0.75, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(0, 0.7, 0.6, 0.45, 0, 0, 7); g.fill(); g.stroke();
    for (const sx of [-1, 1]) { const w = 0.3 * Math.sin(s.t * 3 + sx); g.beginPath(); g.moveTo(0.3 * sx, 0.9); g.quadraticCurveTo(1.5 * sx, 2.5 + w, 3.2 * sx, 1.8 + w); g.stroke(); }
    g.restore(); return;
  }
  g.scale(k * face, -k);  // 頭は +x 側に描く
  if (piv) g.rotate(-0.08);
  const L = pr.len, y0 = 0.55;
  const legs = far => {
    g.strokeStyle = far ? COL.flyFar : COL.fly; g.lineWidth = 0.14;
    for (const [i, hx, fx] of [[0, 1.0, 2.6], [1, 0.1, 0.6], [2, -0.8, -2.8]]) {
      let fX = fx + (far ? 0.3 : 0), fY = 0;
      if (run) { const ph = Math.sin(run * 120 + i * 2 + (far ? Math.PI : 0)); fX += 0.8 * ph; fY = Math.max(0, 0.5 * ph); }
      const [kx, ky] = ik(hx, y0 + 0.3, fX, fY, 1.3, 1.7, true);
      g.beginPath(); g.moveTo(hx, y0 + 0.3); g.lineTo(kx, ky); g.lineTo(fX, fY); g.stroke();
      if (!opt.ghost && !far) { g.lineWidth = 0.06; for (let q = 0.3; q < 1; q += 0.3) { const px = kx + (fX - kx) * q, py = ky + (fY - ky) * q; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 0.2, py + 0.25); g.stroke(); } g.lineWidth = 0.14; }
    }
  };
  legs(true);
  g.fillStyle = COL.flyFill; g.strokeStyle = COL.fly; g.lineWidth = 0.16;
  g.beginPath(); g.moveTo(-L / 2, y0 + 0.4); g.quadraticCurveTo(-L / 2 + 0.3, y0 + 1.4, 0, y0 + 1.25); g.quadraticCurveTo(L / 2 - 1.0, y0 + 1.2, L / 2 - 0.8, y0 + 0.5); g.lineTo(-L / 2, y0 + 0.2); g.closePath(); g.fill(); g.stroke(); // 胴（平たい）
  if (!opt.ghost) { g.lineWidth = 0.07; for (let q = -L / 2 + 0.8; q < L / 2 - 1.5; q += 0.6) { g.beginPath(); g.moveTo(q, y0 + 0.3); g.lineTo(q + 0.15, y0 + 1.25); g.stroke(); } }  // 体節
  g.lineWidth = 0.16; g.beginPath(); g.ellipse(L / 2 - 1.1, y0 + 0.95, 1.0, 0.45, -0.15, 0, 7); g.fill(); g.stroke();  // 前胸の盾
  g.beginPath(); g.ellipse(L / 2 - 0.45, y0 + 0.35, 0.45, 0.4, 0.3, 0, 7); g.fill(); g.stroke();                         // 頭（盾の下）
  // 触角（ゆれる）と尾角
  const w = 0.25 * Math.sin(s.t * 3), dir = piv ? 0.8 : 0;
  g.lineWidth = 0.1; g.beginPath(); g.moveTo(L / 2 - 0.2, y0 + 0.6); g.quadraticCurveTo(L / 2 + 1.8, y0 + 2.2 + w + dir, L / 2 + 4.0, y0 + 1.2 + w); g.stroke();
  g.strokeStyle = s.fl === 'rest' ? COL.fly : '#ff8a7a'; g.lineWidth = 0.16;
  g.beginPath(); g.moveTo(-L / 2 + 0.1, y0 + 0.5); g.lineTo(-L / 2 - 0.9, y0 + 0.75); g.stroke();   // 尾角（気づくと赤）
  legs(false);
  g.restore();
}
function drawPrey(g, cx, gy, k, face, s, opt) {
  const d = M.prey(P_ || {}).draw;
  return d === 'roach' ? drawRoach(g, cx, gy, k, face, s, opt) : drawFly(g, cx, gy, k, face, s, opt);
}
let P_ = null;  // 描くときの条件（獲物の種類を読むため）
function setP(P) { P_ = P; }

return { drawSpider, drawFly, drawPrey, spinneret, setP, COL, smooth };
})();
