// 着陸の場面: 横から見た細菌の表面。光ピンセットでファージを運び、長い脚が受け手にくっつくと、基盤 → さや → 管 → DNA の順に動く
// 座標は nm（X 右、Y 上、Z 手前。細菌の表面が Y=0）。画面へは screen = (ox + X*s, oy - Y*s)
'use strict';

const Land = (() => {
  const cv = document.getElementById('cvLand');
  const g = cv.getContext('2d');
  let Wpx = 1, Hpx = 1, s = 1, ox = 0, oy = 0, viewW = 1000, viewTop = 600, viewBot = -120;
  const CONTACT = 3;          // 脚の先がふれる高さ（外膜の外側の糖の鎖の先。nm）
  const TILT = 0.78;           // かたむきの上限（rad、約45°）。ひっくり返らないようにする
  const KON = 2.5, KOFF = 0.7; // 1秒あたりにくっつく・はなれる見こみ（演出。画面の時間）
  const S = {};
  let dnaPath = [];

  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  function reset(hostId) {
    S.hostId = hostId || S.hostId || 'k12';
    S.host = HOSTS[S.hostId];
    S.A = { x: -1300, y: 650 };                   // 細菌全体の大きさで運ぶときの位置（基盤。細菌の上面が y=0、中心が x=0）
    S.B = { x: 0, y: 200 };
    S.th = (Math.random() - 0.5) * 0.7;
    S.landX = 0; S.zk = 0;
    S.fib = [];
    for (let k = 0; k < 6; k++) {
      const phi = (k * 60 + 30) * Math.PI / 180;
      S.fib.push({ c: Math.cos(phi), sn: Math.sin(phi), wob: (Math.random() - 0.5) * 0.4, bound: false, pin: null, touching: false, H: null, K: null, T: null });
    }
    S.phase = 'approach'; S.pt = 0; S.simMs = 0;
    S.grab = false; S.ptr = { x: 0, y: 0 };
    S.sheath = T4.sheathLen; S.sheathW = T4.sheathW; S.plateW = T4.plateW; S.tubeOut = 0;
    S.fill = 1; S.holeR = 0; S.dnaF = 0; S.shortF = 0; S.imBulge = 0;
    S.noRecT = 0; S.saidNoRec = false; S.firstBind = false; S.maxBound = 0; S.th0 = 0; S.y0 = 0;
    S.done = false; S.touched = false;
    UI.next('land', null); document.getElementById('landCard').hidden = true; S.hl = null; document.getElementById('landHint').classList.remove('off');
    makeDnaPath();
    UI.clearLog('land');
    UI.log('land', `${S.host.name}（細菌）1つ。画面をおさえると、光ピンセットがファージを引きよせる。まず細菌の表面まで運ぼう。`);
    UI.landStatus(S);
  }

  function makeDnaPath() {
    // 管の先から細菌の奥へ。くねくねしながら下へ進み、画面の外まで続く（本当は全部で約57µm あり、この画面には入りきらない）
    dnaPath = [[0, -12]]; let x = 0, y = -12, a = -Math.PI / 2;
    for (let i = 0; i < 1100; i++) {
      a += (Math.random() - 0.5) * 1.5 + (-Math.PI / 2 - a) * 0.06;
      x += Math.cos(a) * 3; y += Math.sin(a) * 3;
      if (Math.abs(x) > 90) { x = Math.sign(x) * 90; a = Math.PI - a; }
      if (y > -12) { y = -12; a = -Math.abs(a); }
      dnaPath.push([x, y]);
    }
  }

  // ---- 形の計算 ----
  const ex = () => Math.cos(S.th), ey = () => Math.sin(S.th);
  function L2W(lx, la) { const c = Math.cos(S.th), sn = Math.sin(S.th); return { x: S.B.x + lx * c + la * sn, y: S.B.y + lx * sn - la * c }; }
  // 基盤からの (半径方向 r, 軸 a) と方位 → 3D
  function R3(f, r, a) { const p = L2W(r * f.c, a); return { x: p.x, y: p.y, z: r * f.sn }; }
  function rot(r, a, w) { const c = Math.cos(w), sn = Math.sin(w); return [r * c - a * sn, r * sn + a * c]; }
  function ik(H, T, hint) {
    const L1 = T4.fib1, L2 = T4.fib2;
    let vx = T.x - H.x, vy = T.y - H.y, vz = T.z - H.z, D = Math.hypot(vx, vy, vz);
    const Dmax = L1 + L2 - 0.5;
    if (D > Dmax) { const k = Dmax / D; vx *= k; vy *= k; vz *= k; D = Dmax; }
    if (D < 1e-6) D = 1e-6;
    const ux = vx / D, uy = vy / D, uz = vz / D;
    let wx = hint.x - H.x, wy = hint.y - H.y, wz = hint.z - H.z;
    const dp = wx * ux + wy * uy + wz * uz; wx -= dp * ux; wy -= dp * uy; wz -= dp * uz;
    let wl = Math.hypot(wx, wy, wz); if (wl < 1e-6) { wx = 0; wy = 1; wz = 0; wl = 1; }
    wx /= wl; wy /= wl; wz /= wl;
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    return { K: { x: H.x + ux * a + wx * h, y: H.y + uy * a + wy * h, z: H.z + uz * a + wz * h }, T: { x: H.x + vx, y: H.y + vy, z: H.z + vz } };
  }
  function hipR() { return S.plateW / 2; }
  function computeFibers() {
    for (const f of S.fib) {
      const hr = hipR();
      f.H = R3(f, hr, -2);
      const [kr, ka] = rot(60, -36, f.wob), [tr, ta] = rot(90, 32, f.wob);
      const hint = R3(f, hr + kr, -2 + ka);
      let T = f.bound ? f.pin : R3(f, hr + tr, -2 + ta);
      f.touching = false;
      if (!f.bound && T.y < CONTACT) { T = { x: T.x, y: CONTACT, z: T.z }; f.touching = true; }
      const r = ik(f.H, T, hint); f.K = r.K; f.T = r.T;
      f.reach = Math.hypot(T.x - f.H.x, T.y - f.H.y, T.z - f.H.z);
    }
  }
  function nBound() { return S.fib.reduce((n, f) => n + (f.bound ? 1 : 0), 0); }
  function headCenter() { return L2W(0, -(S.sheath + T4.neck + T4.headLen / 2)); }
  function bodyMinY() {
    const pw = S.plateW / 2, hc = -(S.sheath + T4.neck + T4.headLen / 2);
    const pts = [[-pw, 9], [pw, 9], [-T4.headW / 2, hc + 34], [T4.headW / 2, hc + 34], [0, hc + 60], [0, hc - 60], [-T4.headW / 2, hc - 34], [T4.headW / 2, hc - 34]];
    let m = 1e9; for (const [a, b] of pts) m = Math.min(m, L2W(a, b).y); return m;
  }
  function snapPin(x) {
    if (S.host.receptor === 'ompc') return Math.round((x - 8) / 32) * 32 + 8;
    return Math.round(x / 4) * 4;
  }

  // ---- 進める（dt は画面の秒） ----
  function step(dt) {
    if (!(dt > 0)) return;
    if (S.phase === 'approach') { stepApproach(dt); UI.landStatus(S); return; }
    if (S.phase === 'zoomin') { S.zk = Math.min(1, S.zk + dt / 1.6); if (S.zk >= 1) { S.phase = 'free'; UI.log('land', `${S.host.name}の表面に近づいた（拡大）。脚の先が表面にふれるまで、もう少し近づけよう。`); } UI.landStatus(S); return; }
    if (S.phase === 'free') stepFree(dt); else stepAnim(dt);
    if (S.phase === 'free' || S.phase === 'settle') S.simMs += dt * BROWN.slow * 1000;
    computeFibers();
    UI.landStatus(S);
  }

  function stepFree(dt) {
    const st = Math.sqrt(2 * BROWN.D * BROWN.slow * dt), sr = Math.sqrt(2 * BROWN.Dr * BROWN.slow * dt);
    let dx = st * gauss(), dy = st * gauss(), dth = sr * gauss();
    if (S.grab) {
      // 光ピンセット: 頭をつまんで引きよせる。細長いものは光の向き（縦）にそろう
      const hc = headCenter();
      let vx = (S.ptr.x - hc.x) * 3, vy = (S.ptr.y - hc.y) * 3; const v = Math.hypot(vx, vy), vmax = 320;
      if (v > vmax) { vx *= vmax / v; vy *= vmax / v; }
      dx += vx * dt; dy += vy * dt;
      dth += (0 - S.th) * 1.6 * dt;
      // つながった脚より強く引くと、脚がはなれる
      if (Math.hypot(S.ptr.x - hc.x, S.ptr.y - hc.y) > 140) for (const f of S.fib) if (f.bound && Math.random() < 2.5 * dt) { f.bound = false; UI.log('land', '強く引いたので、脚が1本はなれた。'); }
    }
    const old = { x: S.B.x, y: S.B.y, th: S.th };
    S.B.x += dx; S.B.y += dy; S.th += dth;
    S.th = Math.max(-TILT, Math.min(TILT, S.th)); // ひっくり返らない（かたむきは ±約45° まで）
    for (const f of S.fib) f.wob = Math.max(-0.5, Math.min(0.5, f.wob + 0.35 * Math.sqrt(dt) * gauss() - f.wob * 0.6 * dt));
    // くっついた脚より遠くへは行けない（脚の長さで引きもどす）
    for (let it = 0; it < 6; it++) {
      let ok = true;
      for (const f of S.fib) if (f.bound) {
        const H = R3(f, hipR(), -2), d = Math.hypot(f.pin.x - H.x, f.pin.y - H.y, f.pin.z - H.z), Lm = T4.fib1 + T4.fib2 - 1;
        if (d > Lm) { ok = false; const k = (d - Lm) / d; S.B.x += (f.pin.x - H.x) * k; S.B.y += (f.pin.y - H.y) * k; }
      }
      if (ok) break;
      if (it === 4) S.th = old.th;
    }
    if (!Number.isFinite(S.B.x + S.B.y + S.th)) { S.B.x = old.x; S.B.y = old.y; S.th = old.th; } // 念のため（数でない値になったら1歩もどす）
    // 体は表面にめりこまない・画面の外へ出ない
    const m = bodyMinY(); if (m < CONTACT + 0.5) S.B.y += CONTACT + 0.5 - m;
    const lim = viewW / 2 - 90;
    if (S.B.x < -lim) S.B.x = -lim; if (S.B.x > lim) S.B.x = lim;
    const top = L2W(0, -(S.sheath + T4.neck + T4.headLen)).y; if (top > viewTop - 10) S.B.y -= top - (viewTop - 10);
    computeFibers();
    // 脚の先がふれたら、受け手があればくっつく（はなれることもある）
    let anyTouch = false;
    for (const f of S.fib) {
      if (f.bound) { if (Math.random() < KOFF * dt) { f.bound = false; UI.log('land', '脚が1本はなれた（くっつくのは、はじめはやり直しがきく）。'); } continue; }
      if (!f.touching) continue;
      anyTouch = true;
      if (S.host.receptor && Math.random() < KON * dt) {
        f.bound = true; f.pin = { x: snapPin(f.T.x), y: CONTACT, z: f.T.z };
        if (!S.firstBind) { S.firstBind = true; UI.log('land', `脚の先が <b>${S.host.recName}</b> にくっついた。`, 'sure'); }
      }
    }
    if (anyTouch) S.touched = true;
    if (anyTouch && !S.host.receptor) {
      S.noRecT += dt;
      if (S.noRecT > 1.5 && !S.saidNoRec) { S.saidNoRec = true; UI.log('land', '脚の先がふれても、くっつく印（受け手）がない。T4 はこの細菌に付けない。', 'sure'); UI.toast('land', 'くっつく印がない'); }
    }
    const n = nBound(); S.maxBound = Math.max(S.maxBound, n);
    if (n >= 3) trigger();
  }

  function trigger() {
    S.phase = 'settle'; S.pt = 0; S.grab = false; UI.hideHint('land'); S.th0 = S.th; S.y0 = S.B.y;
    UI.log('land', '3本の脚が同時にくっついた → <b>基盤が六角形から星形へ</b>。ここから後戻りしない。', 'sure');
    UI.toast('land', '3本そろった！');
  }

  const PH = { settle: 1.8, short: 0.9, contract: 0.8, lyso: 0.9, dna: 7 };
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  function stepAnim(dt) {
    S.pt += dt; const k = S.pt / (PH[S.phase] || 1), e = ease(k);
    if (S.phase === 'settle') {
      S.th = S.th0 * (1 - e); S.B.y = S.y0 + (CONTACT + 10 - S.y0) * e;
      S.plateW = T4.plateW + (T4.plateWStar - T4.plateW) * e;
      // 体が下がるあいだ、くっついた脚は先がそのまま
      if (k >= 1) {
        computeFibers();
        for (const f of S.fib) if (!f.bound) { f.bound = true; f.pin = { x: snapPin(f.T.x), y: CONTACT, z: f.T.z }; }
        next('short', '短い脚（6本）が基盤の下から出て、外膜の糖の鎖にしっかりくっつく。', 'sure');
      }
    } else if (S.phase === 'short') {
      S.shortF = e; if (k >= 1) next('contract', `しっぽのさやが縮む: <b>${T4.sheathLen}nm → ${T4.sheathShort}nm</b>。中の管が外膜を突きぬける。`, 'sure');
    } else if (S.phase === 'contract') {
      S.sheath = T4.sheathLen + (T4.sheathShort - T4.sheathLen) * e;
      S.sheathW = T4.sheathW + (T4.sheathWShort - T4.sheathW) * e;
      S.tubeOut = (S.B.y - 6 - (S.host.gram === '-' ? -24 : -34)) * e;
      if (k >= 1) next('lyso', '管の先の酵素（リゾチーム）が、細胞壁（ペプチドグリカン）に穴をあける。', 'sure');
    } else if (S.phase === 'lyso') {
      S.holeR = 7 * e; S.imBulge = e;
      if (k >= 1) next('dna', 'DNA が管を通って細菌の中へ流れこむ。', 'sure');
    } else if (S.phase === 'dna') {
      S.dnaF = e; S.fill = 1 - e;
      if (k >= 1) {
        S.phase = 'done'; S.done = true;
        UI.log('land', `注入おわり: <b>${T4.genomeBp.toLocaleString()} 塩基対</b>（のばすと約 ${Math.round(T4.genomeBp * T4.bpNm / 1000)}µm、ファージの約300倍の長さ）。頭は空っぽの「ぬけがら」に。`, 'sure');
        UI.landDone(S.hostId);
      }
    }
  }
  function next(ph, msg, kind) { S.phase = ph; S.pt = 0; UI.log('land', msg, kind); }

  // ---- 描く ----
  function resize() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    Wpx = Math.max(1, r.width); Hpx = Math.max(1, r.height);
    cv.width = Math.round(Wpx * dpr); cv.height = Math.round(Hpx * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    viewW = Math.max(520, Math.min(1100, Wpx));
    s = Wpx / viewW; ox = Wpx / 2; oy = Hpx * (Wpx < 520 ? 0.6 : 0.74); // スマホは細菌の側を広く
    viewTop = oy / s; viewBot = -(Hpx - oy) / s;
  }
  const X = x => ox + x * s, Y = y => oy - y * s;

  function drawEnvelope() {
    const h = S.host, L = -viewW / 2 - 20, R = viewW / 2 + 20;
    const band = (y0, y1, col) => { g.fillStyle = col; g.fillRect(X(L), Y(y0), (R - L) * s, (y0 - y1) * s); };
    const env = h.gram === '-' ? ENV_NEG : ENV_POS;
    band(env.im[1], viewBot - 5, '#1d2b2a');                 // 細胞の中
    if (h.gram === '-') {
      band(env.om[1], env.im[0], '#152427');                 // すきま（ペリプラズム）
      band(env.pg[0], env.pg[1], '#5d6b3c');                 // 細胞壁
      band(env.om[0], env.om[1], '#46617a');                 // 外膜
    } else {
      band(env.pg[0], env.pg[1], '#5d6b3c');
      band(env.pg[1], env.im[0], '#152427');
    }
    // 細胞壁のあみ目
    g.strokeStyle = 'rgba(210,230,150,.35)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = Math.floor(L / 9) * 9; x < R; x += 9) { g.moveTo(X(x), Y(env.pg[0])); g.lineTo(X(x + 6), Y(env.pg[1])); }
    for (let y = env.pg[0] - 3; y > env.pg[1]; y -= 6) { g.moveTo(X(L), Y(y)); g.lineTo(X(R), Y(y)); }
    g.stroke();
    // 内膜（管が来ると引きよせられてふくらむ）
    g.fillStyle = '#46617a';
    g.beginPath();
    const bx = S.B.x, bh = S.imBulge * 8;
    for (let x = L; x <= R; x += 4) { const yb = env.im[0] + bh * Math.exp(-((x - bx) ** 2) / 300); g.lineTo(X(x), Y(yb)); }
    for (let x = R; x >= L; x -= 4) { const yb = env.im[1] + bh * Math.exp(-((x - bx) ** 2) / 300); g.lineTo(X(x), Y(yb)); }
    g.closePath(); g.fill();
    // 細胞壁の穴（酵素）
    if (S.holeR > 0) { g.fillStyle = '#152427'; g.fillRect(X(bx - S.holeR), Y(env.pg[0] + 0.5), 2 * S.holeR * s, (env.pg[0] - env.pg[1] + 1) * s); }
    // 外膜の筒（OmpC＝受け手／OmpF）
    if (h.gram === '-') {
      for (let x = Math.floor(L / 16) * 16; x < R; x += 16) {
        const isC = (((x / 16) % 2) + 2) % 2 === 0;
        if (isC && !h.ompc) continue; if (!isC && !h.ompf) continue;
        g.fillStyle = isC ? '#ffe066' : '#7d93a6';
        g.fillRect(X(x + 2), Y(1.5), 8 * s, 10 * s);
      }
      // LPS の糖の鎖
      if (h.lps) {
        const hgt = h.lps === 'cut' ? 1.6 : 3.2;
        g.strokeStyle = 'rgba(190,220,240,.55)'; g.lineWidth = Math.max(0.8, s * 0.9);
        const stepX = s * 4 > 2.2 ? 4 : 8;
        g.beginPath(); for (let x = Math.floor(L / stepX) * stepX; x < R; x += stepX) { g.moveTo(X(x), Y(0)); g.lineTo(X(x + 0.6), Y(hgt)); } g.stroke();
        if (h.lps === 'glc') { g.fillStyle = '#ffe066'; for (let x = Math.floor(L / stepX) * stepX; x < R; x += stepX) g.fillRect(X(x) - 1, Y(hgt) - 1, 2.2, 2.2); }
      }
    } else {
      g.strokeStyle = 'rgba(200,210,150,.5)'; g.lineWidth = 1;
      g.beginPath(); for (let x = Math.floor(L / 7) * 7; x < R; x += 7) { g.moveTo(X(x), Y(0)); g.lineTo(X(x + 1), Y(4)); } g.stroke();
    }
    // 外膜が管で破れる
    if (S.tubeOut > 4 && h.gram === '-') { g.fillStyle = '#152427'; g.fillRect(X(bx - 6), Y(env.om[0] + 0.3), 12 * s, (env.om[0] - env.om[1] + 0.6) * s); }
    // 層の名前
    g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = 'rgba(232,240,244,.8)'; g.textBaseline = 'middle';
    // 層がうすいので、名前は少し離して引き出し線でつなぐ
    const lx = X(-viewW / 2) + 10, ax = lx + 64;
    const tag = (txt, yLayer, yText) => {
      g.strokeStyle = 'rgba(232,240,244,.45)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(lx + g.measureText(txt).width + 3, yText); g.lineTo(ax, yText); g.lineTo(ax + 12, Y(yLayer)); g.stroke();
      g.fillText(txt, lx, yText);
    };
    if (h.gram === '-') {
      tag('外膜', -3.5, Y(0) - 16); tag('細胞壁', -13, Y(-40) + 4); tag('内膜', -31.5, Y(-40) + 20);
    } else { tag('厚い細胞壁', -17, Y(0) - 16); tag('膜', -41.5, Y(-45) + 14); }
    if (Wpx >= 520) { g.fillStyle = 'rgba(232,240,244,.55)'; g.fillText('細菌の中', lx, Y(-40) + 40); }
    // 大きな名前（ここから下が細菌、上は水）
    g.textAlign = 'center';
    g.font = `700 ${Wpx < 520 ? 12 : 16}px "Zen Kaku Gothic New", sans-serif`; g.fillStyle = 'rgba(232,240,244,.75)';
    const cyY = Math.min(Hpx - 70, (Y(env.im[1]) + Hpx) / 2 - 10);
    g.fillText(Wpx < 520 ? '▼ ここから下は細菌の体の中' : `▼ ここから下は ${h.name}（細菌）の体の中`, Wpx / 2, cyY);
    g.font = `${Wpx < 520 ? 11 : 14}px "Zen Kaku Gothic New", sans-serif`; g.fillStyle = 'rgba(170,210,235,.6)';
    if (Wpx >= 520) { g.fillText('水の中', Wpx * 0.22, Y(0) - 26); g.fillText(`▼ ${h.name}の表面`, Wpx * 0.75, Y(0) - 26); }
    g.textAlign = 'left';
  }

  function drawFiber(f, front) {
    if ((f.sn >= 0) !== front) return;
    const depth = 0.55 + 0.45 * (f.sn * 0.5 + 0.5);
    g.strokeStyle = `rgba(233,243,246,${(0.35 + 0.6 * depth).toFixed(2)})`;
    g.lineWidth = Math.max(1.2, 3.2 * s * (0.7 + 0.3 * depth)); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(X(f.H.x), Y(f.H.y)); g.lineTo(X(f.K.x), Y(f.K.y)); g.lineTo(X(f.T.x), Y(f.T.y)); g.stroke();
    g.fillStyle = f.bound ? '#ffe066' : f.touching ? '#ffffff' : 'rgba(233,243,246,.8)';
    g.beginPath(); g.arc(X(f.T.x), Y(f.T.y), Math.max(2.2, 3.4 * s), 0, Math.PI * 2); g.fill();
    if (f.bound) { g.strokeStyle = 'rgba(255,224,102,.5)'; g.lineWidth = 2; g.beginPath(); g.arc(X(f.T.x), Y(f.T.y), Math.max(5, 7 * s), 0, Math.PI * 2); g.stroke(); }
  }

  // ---- はじめ: 細菌1つ全体（約2µm）の大きさで、ファージを表面まで運ぶ ----
  function cellView() { const sc = Math.min(Wpx / 3000, (Hpx - 110) / 1800); return { sc, fx: Wpx / 2, fy: 70 + 820 * sc }; }
  function cellR() { return S.host.gram === '-' ? 450 : 400; }
  function stepApproach(dt) {
    if (S.grab) {
      // 頭（基盤から約170nm 上）を指の点へ引きよせる。細菌全体の大きさでは速めに動かす
      const hx = S.A.x - Math.sin(S.th) * 170, hy = S.A.y + Math.cos(S.th) * 170;
      let vx = (S.ptr.x - hx) * 3, vy = (S.ptr.y - hy) * 3; const v = Math.hypot(vx, vy), vmax = 900;
      if (v > vmax) { vx *= vmax / v; vy *= vmax / v; }
      S.A.x += vx * dt; S.A.y += vy * dt;
      S.th += (0 - S.th) * 1.6 * dt;
    }
    // 細菌の体には入れない（上面より上にとどめる。横からは押し出す）
    const R = cellR();
    if (Math.abs(S.A.x) < 1000 && S.A.y < 40 && S.A.y > -2 * R - 40) { if (S.A.y > -R) S.A.y = 40; else S.A.y = -2 * R - 40; }
    S.A.x = Math.max(-1500, Math.min(1500, S.A.x)); S.A.y = Math.max(-2 * R - 200, Math.min(820, S.A.y));
    // 上面の近くまで来たら、表面へ寄る
    if (S.A.y < 230 && S.A.y >= 40 && Math.abs(S.A.x) < 1000 - R * 0.4) {
      S.phase = 'zoomin'; S.zk = 0; S.landX = S.A.x; S.B.x = 0; S.B.y = Math.max(140, S.A.y + 60);
      S.ptr = { x: S.ptr.x - S.landX, y: S.ptr.y }; // 指はそのまま。座標だけ表面の画面のものに直す（おさえたままなら寄ったあとも引きよせ続ける）
      UI.toast('land', '表面へ寄る');
    }
  }
  function drawCell() {
    const V = cellView(), R = cellR(), gram = S.host.gram === '-';
    const zoom = S.phase === 'zoomin', k = zoom ? ease(S.zk) : 0;
    const sd = V.sc * Math.pow(s / V.sc, k);
    const fx0 = V.fx + S.landX * V.sc, fx = fx0 + (ox - fx0) * k, fy = V.fy + (oy - V.fy) * k;
    const cx = zoom ? S.landX : 0, XX = x => (zoom ? fx : V.fx) + (x - cx) * sd, YY = y => fy - y * sd;
    g.fillStyle = '#0b1a22'; g.fillRect(0, 0, Wpx, Hpx);
    // 細菌
    g.fillStyle = '#1d2b2a'; g.strokeStyle = gram ? '#46617a' : '#6b7a44'; g.lineWidth = Math.max(3, 7 * sd);
    g.beginPath(); g.roundRect(XX(-1000), YY(0), 2000 * sd, 2 * R * sd, R * sd); g.fill(); g.stroke();
    if (!zoom) { // 上面の「降りるところ」
      g.strokeStyle = 'rgba(255,224,102,.55)'; g.setLineDash([6, 6]); g.lineWidth = 2;
      g.beginPath(); g.moveTo(XX(-1000 + R * 0.4), YY(0) - 10); g.lineTo(XX(1000 - R * 0.4), YY(0) - 10); g.stroke(); g.setLineDash([]);
    }
    // ファージ
    const px = zoom ? S.landX + S.B.x : S.A.x, py = zoom ? S.A.y + (S.B.y - S.A.y) * k : S.A.y;
    g.save(); g.translate(XX(px), YY(py)); g.rotate(-S.th); g.scale(sd, sd); drawPhageSmall(g, { fill: 1 }); g.restore();
    // 光ピンセット
    if (S.grab && !zoom) {
      const hx = S.A.x - Math.sin(S.th) * 170, hy = S.A.y + Math.cos(S.th) * 170;
      g.strokeStyle = 'rgba(255,120,120,.85)'; g.lineWidth = 1.5; g.beginPath(); g.arc(XX(hx), YY(hy), Math.max(10, 60 * sd), 0, Math.PI * 2); g.stroke();
      g.setLineDash([3, 4]); g.beginPath(); g.moveTo(XX(hx), YY(hy)); g.lineTo(XX(S.ptr.x), YY(S.ptr.y)); g.stroke(); g.setLineDash([]);
    }
    // 名前
    const sm = Wpx < 520;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const a = zoom ? Math.max(0, 1 - k * 2.5) : 1;
    if (a > 0) {
      g.globalAlpha = a;
      g.font = `700 ${sm ? 15 : 20}px "Zen Kaku Gothic New", sans-serif`; g.fillStyle = '#e8f0f4';
      g.fillText(`${S.host.name}（細菌）1つ`, XX(0), YY(-R) - 12);
      g.font = `${sm ? 11 : 14}px "Zen Kaku Gothic New", sans-serif`; g.fillStyle = '#a9bcc4';
      g.fillText('長さ 約2µm（髪の毛の太さの約40分の1）', XX(0), YY(-R) + 14);
      g.fillStyle = 'rgba(255,224,102,.8)'; g.fillText('▼ ここ（細菌の表面）まで運ぼう', XX(0), YY(0) - 26);
      g.fillStyle = '#7fe0c4'; g.textAlign = 'left'; g.fillText('← T4 ファージ（約0.2µm）', XX(px) + 30, YY(py + 90));
      g.globalAlpha = 1;
    }
    if (zoom) { g.textAlign = 'center'; g.font = '700 16px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = 'rgba(232,240,244,.9)'; g.fillText('細菌の表面へ寄っていく…', Wpx / 2, Hpx - 60); }
    g.textAlign = 'left';
  }

  function draw() {
    if (S.phase === 'approach' || S.phase === 'zoomin') { drawCell(); return; }
    g.clearRect(0, 0, Wpx, Hpx);
    const bg = g.createLinearGradient(0, 0, 0, Hpx); bg.addColorStop(0, '#0b1a22'); bg.addColorStop(1, '#10262c');
    g.fillStyle = bg; g.fillRect(0, 0, Wpx, Hpx);
    // 水の中の小さな粒（ゆっくり）
    drawEnvelope();
    // DNA（細菌の中へ）
    const tipY = S.B.y - 6 - S.tubeOut;
    if (S.dnaF > 0) {
      const n = Math.floor(dnaPath.length * S.dnaF);
      g.strokeStyle = PCOL.dna; g.lineWidth = Math.max(1.2, 1.6 * s); g.lineJoin = 'round';
      g.beginPath(); g.moveTo(X(S.B.x), Y(tipY));
      for (let i = 0; i < n; i++) { const [px, py] = dnaPath[i]; g.lineTo(X(S.B.x + px), Y(tipY + py)); }
      g.stroke();
      // 画面の外へ続くことを書く
      if (S.dnaF > 0.12) {
        const ratio = Math.round(T4.genomeBp * T4.bpNm / viewW);
        g.font = '13px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
        const msg = Wpx < 520 ? `↓ 画面の外まで続く（全部で約57µm＝画面の約${ratio}倍）` : `↓ 細菌の奥へ、画面の外まで続く（DNA は全部のばすと約57µm＝この画面の横はばの約${ratio}倍）`;
        const tx = Wpx < 520 ? Wpx / 2 : Math.min(Wpx - 180, Math.max(180, X(S.B.x))), ty = Wpx < 520 ? Math.min(Hpx - 40, Y(-35) + 70) : Hpx - 40, w = g.measureText(msg).width;
        g.fillStyle = 'rgba(11,26,34,.8)'; g.fillRect(tx - w / 2 - 6, ty - 18, w + 12, 22);
        g.fillStyle = '#ffc29a'; g.fillText(msg, tx, ty); g.textAlign = 'left';
      }
    }
    if (S.fib[0].H == null) computeFibers();
    for (const f of S.fib) drawFiber(f, false);
    // 体
    g.save(); g.translate(X(S.B.x), Y(S.B.y)); g.rotate(-S.th); g.scale(s, s);
    drawPhageBody(g, { sheath: S.sheath, sheathW: S.sheathW, plateW: S.plateW, tubeOut: S.tubeOut, fill: S.fill, ghost: S.fill < 0.3 });
    // DNA が管を通っている
    if (S.dnaF > 0 && S.dnaF < 1) { g.strokeStyle = PCOL.dna; g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, -(S.sheath + T4.neck + 40)); g.lineTo(0, 6 + S.tubeOut); g.stroke(); }
    // 短い脚
    if (S.shortF > 0) {
      g.strokeStyle = PCOL.plate; g.lineWidth = 3;
      for (const sx of [-1, -0.45, 0.45, 1]) { g.beginPath(); g.moveTo(sx * (S.plateW / 2 - 6), 8); g.lineTo(sx * (S.plateW / 2 - 6 + 8 * S.shortF), 8 + (S.B.y - CONTACT - 8) * S.shortF); g.stroke(); }
    }
    g.restore();
    for (const f of S.fib) drawFiber(f, true);
    // 光ピンセット
    if (S.grab) {
      const hc = headCenter();
      const grd = g.createLinearGradient(X(hc.x), 0, X(hc.x), Y(hc.y));
      grd.addColorStop(0, 'rgba(255,90,90,0)'); grd.addColorStop(1, 'rgba(255,90,90,.28)');
      g.fillStyle = grd; g.beginPath(); g.moveTo(X(hc.x) - 40, 0); g.lineTo(X(hc.x) + 40, 0); g.lineTo(X(hc.x) + 6, Y(hc.y)); g.lineTo(X(hc.x) - 6, Y(hc.y)); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,120,120,.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(X(hc.x), Y(hc.y), 50 * s, 0, Math.PI * 2); g.stroke();
      g.setLineDash([3, 4]); g.beginPath(); g.moveTo(X(hc.x), Y(hc.y)); g.lineTo(X(S.ptr.x), Y(S.ptr.y)); g.stroke(); g.setLineDash([]);
    }
    drawScale(); drawInset();
    if (S.hl && S.hl.ph !== 'approach' && performance.now() - S.hl.at < 1500) { g.strokeStyle = '#ffe066'; g.lineWidth = 2; g.beginPath(); g.arc(X(S.hl.x), Y(S.hl.y), 16, 0, Math.PI * 2); g.stroke(); }
  }

  // ルーペ: さわった場所にあるもの
  const LINFO = {
    water: { t: '水', k: 'sure', b: 'ファージのまわりの水。水の分子が四方八方からぶつかるので、ファージはふらふらゆれる（ブラウン運動）。ファージは自分では泳げない。' },
    cyto: { t: '細菌の中（細胞質）', k: 'sure', b: '細菌の体の中。リボソーム（たんぱく質の工場）や細菌の DNA がある。T4 の DNA はここへ入り、工場を乗っとる（② で見られる）。' },
    lps: { t: 'LPS（外膜の表面の糖の鎖）', k: 'sure', b: '外膜の外側にびっしり並ぶ糖の鎖。大腸菌 B では、T4 の長い脚がこの鎖のブドウ糖を目印にする。短い脚は、刺さるときに鎖の根もと側の糖にくいこむ。' },
    gpos: { t: '枯草菌の厚い細胞壁', k: 'sure', b: '枯草菌（グラム陽性）には外膜がなく、ペプチドグリカンの厚い壁（20〜80nm）がむき出し。T4 がくっつく印はない。' },
    cell: { t: '細菌1つの全体', k: 'sure', b: '大腸菌は長さ約2µm、太さ約1µm の棒の形。T4 ファージ（約0.2µm）はその10分の1くらい。上面まで運ぶと、表面へ寄って見られる。' },
  };
  function pick(w, ph) {
    if (ph === 'approach') {
      const R = cellR();
      if (Math.hypot(w.x - S.A.x, w.y - (S.A.y + 120)) < 220) return INFO.phage;
      if (Math.abs(w.x) < 1000 && w.y < 0 && w.y > -2 * R) return LINFO.cell;
      return LINFO.water;
    }
    if (ph === 'zoomin') return null;
    const env = S.host.gram === '-' ? ENV_NEG : ENV_POS, x = w.x, y = w.y;
    // ファージの体（基盤からの横 lx・軸 la に直して調べる）
    const c = Math.cos(S.th), sn = Math.sin(S.th), dx = x - S.B.x, dy = y - S.B.y;
    const lx = dx * c + dy * sn, la = dx * sn - dy * c;
    const hc = -(S.sheath + T4.neck + T4.headLen / 2);
    if (Math.abs(lx) < T4.headW / 2 + 4 && Math.abs(la - hc) < T4.headLen / 2 + 4) return S.fill > 0.3 ? ZINFO.dnaIn : { t: '頭のぬけがら', k: 'sure', b: 'DNA を入れおわった頭は空っぽ。頭としっぽは細菌の外に残る（ゴースト）。' };
    if (Math.abs(lx) < S.sheathW / 2 + 4 && la > -S.sheath - T4.neck && la < -2) return ZINFO.gp18;
    if (Math.abs(lx) < S.plateW / 2 + 4 && la >= -4 && la < 12) return ZINFO.plate;
    if (S.tubeOut > 0 && Math.abs(lx) < 8 && la >= 0 && la < 8 + S.tubeOut) return ZINFO.gp19;
    if (S.shortF > 0 && Math.abs(lx) < S.plateW / 2 + 10 && la > 6 && y > CONTACT - 2) return ZINFO.gp12;
    // 脚
    for (const f of S.fib) if (f.H && f.K && f.T) {
      const d = (a, b) => { const vx = b.x - a.x, vy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1))); return Math.hypot(x - a.x - vx * t, y - a.y - vy * t); };
      if (Math.min(d(f.H, f.K), d(f.K, f.T)) < 8 / s) return ZINFO.ltf;
    }
    // DNA
    if (S.dnaF > 0 && y < -30) { const tipY = S.B.y - 6 - S.tubeOut, n = Math.floor(dnaPath.length * S.dnaF); for (let i = 0; i < n; i += 3) { const [px, py] = dnaPath[i]; if (Math.hypot(x - (S.B.x + px), y - (tipY + py)) < 8 / s) return INFO.t4Dna; } }
    // 細菌の外側の層
    if (S.host.gram === '-') {
      const v = ((x - 6) % 32 + 32) % 32, nearC = S.host.ompc && Math.min(v, 32 - v) < 7; // OmpC の筒は 32nm ごと（絵と同じ）
      if (y > env.om[0] && y < env.om[0] + 6) return nearC ? ZINFO.ompc : LINFO.lps;
      if (y <= env.om[0] && y > env.om[1]) return nearC ? ZINFO.ompc : ZINFO.om;
      if (y <= env.om[1] && y > env.im[0]) return ZINFO.pg;
      if (y <= env.im[0] && y > env.im[1] - 1) return ZINFO.im;
    } else {
      if (y > -1 && y < 5) return LINFO.gpos;
      if (y <= 0 && y > env.pg[1]) return LINFO.gpos;
      if (y <= env.pg[1] && y > env.im[1] - 1) return ZINFO.im;
    }
    if (y < env.im[1]) return LINFO.cyto;
    return LINFO.water;
  }

  function drawScale() {
    const len = 100 * s, x0 = Wpx - len - 14, y0 = Hpx - 16;
    g.strokeStyle = '#e8f0f4'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + len, y0); g.moveTo(x0, y0 - 4); g.lineTo(x0, y0 + 4); g.moveTo(x0 + len, y0 - 4); g.lineTo(x0 + len, y0 + 4); g.stroke();
    g.fillStyle = '#e8f0f4'; g.font = '11px "IBM Plex Mono", monospace'; g.textBaseline = 'bottom'; g.fillText('100 nm', x0, y0 - 6);
  }
  function drawInset() {
    if (Wpx < 520) return;
    // 細菌の全体（約2µm×1µm）といまの場所
    const w = Wpx < 500 ? 104 : 132, h = Wpx < 500 ? 60 : 72, x0 = Wpx - w - 10, y0 = Wpx < 760 ? Hpx - h - 50 : 10; // 狭い画面では目的の札と重ならないよう右下へ
    g.fillStyle = 'rgba(10,20,26,.82)'; g.strokeStyle = 'rgba(170,210,235,.25)'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(x0, y0, w, h, 6); g.fill(); g.stroke();
    const k = (w - 30) / 2000, cx = x0 + w / 2, cy = y0 + h / 2 + 6;
    g.fillStyle = S.host.gram === '-' ? '#2c4a4a' : '#4b5634'; g.strokeStyle = '#7fa3a8';
    g.beginPath(); g.roundRect(cx - 1000 * k, cy - (S.host.gram === '-' ? 450 : 400) * k, 2000 * k, (S.host.gram === '-' ? 900 : 800) * k, 450 * k); g.fill(); g.stroke();
    const vx = cx + S.landX * k, vy = cy - 450 * k;
    g.strokeStyle = '#ff8a8a'; g.strokeRect(vx - viewW / 2 * k, vy - 4, viewW * k, 6);
    g.fillStyle = '#ffe9e9'; g.font = '10px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'top';
    g.fillText(`${S.host.short}（約2µm）の全体`, x0 + 6, y0 + 4);
    g.fillStyle = '#ff9a9a'; g.textBaseline = 'bottom'; g.fillText('▲ いま見ている所', x0 + 6, y0 + h - 3);
  }

  // ---- 指 ----
  function toWorld(e) {
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (S.phase === 'approach') { const V = cellView(); return { x: (px - V.fx) / V.sc, y: (V.fy - py) / V.sc }; }
    return { x: (px - ox) / s, y: (oy - py) / s };
  }
  let down = null;
  cv.addEventListener('pointerdown', e => { down = { t: performance.now(), x: e.clientX, y: e.clientY, w: toWorld(e), ph: S.phase }; if (S.phase !== 'free' && S.phase !== 'approach') return; cv.setPointerCapture(e.pointerId); S.grab = true; S.ptr = toWorld(e); UI.hideHint('land'); });
  cv.addEventListener('pointermove', e => { if (S.grab) S.ptr = toWorld(e); });
  const up = e => {
    S.grab = false;
    // 軽くタップ（短くて、ほとんど動かさない）ならルーペ
    if (down && e && e.type === 'pointerup' && performance.now() - down.t < 320 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) {
      const info = pick(down.w, down.ph);
      if (info) { UI.landLoupe(info); S.hl = { x: down.w.x, y: down.w.y, ph: down.ph, at: performance.now() }; }
    }
    down = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  return { S, reset, step, draw, resize, nBound, pick, view: () => ({ Wpx, Hpx, s, ox, oy, cell: cellView() }), trigger: () => trigger(), get viewW() { return viewW; } };
})();
