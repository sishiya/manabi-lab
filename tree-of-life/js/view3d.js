// いのちの系統樹 — 3D の見え方（ぐるぐる回せる）
//   根もと（古い）を手前、枝分かれの先を奥に。2D の上下のならびを左右に広げて地面に寝かせる
//   奥行きは「枝分かれの段」（年代の目盛りではない）。名前はいつもこちらを向く札で、遠いほど小さくうすく
//   ガイド（奥行きの手がかり）は3種類から選ぶ: 方眼の地面・地層の帯・ゲート
'use strict';
const V3 = (() => {
  const DZ = 130;            // 1段の奥行き
  const PITCH_MAX = 1.56;   // 真上（2D とつながる）の少し手前
  const GROUND = -16;        // 地面の高さ（ふしより少し下）
  const cam = { tx: 0, ty: 0, tz: 400, yaw: -0.35, pitch: 0.42, dist: 900 };
  let on = false, guide = 'grid';
  let W = 0, H = 0, F = 600;
  let picks = [], shown = [];   // shown: 名前の札を出したふし（いきもの用）            // 押せるもの（名前の札・点）の画面の場所
  let C0 = null, R = null, U = null, Fw = null;   // カメラの位置と向き

  // ---------- 投影 ----------
  function setup() {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    C0 = [cam.tx - cam.dist * sy * cp, cam.ty + cam.dist * sp, cam.tz - cam.dist * cy * cp];
    Fw = norm([cam.tx - C0[0], cam.ty - C0[1], cam.tz - C0[2]]);
    R = norm([Fw[2], 0, -Fw[0]]);                       // 上(0,1,0) × 前
    U = [Fw[1] * R[2] - Fw[2] * R[1], Fw[2] * R[0] - Fw[0] * R[2], Fw[0] * R[1] - Fw[1] * R[0]];   // 前 × 右
    F = Math.max(W, H) * 0.85;
  }
  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  // 世界 (x 左右, y 上, z 奥) → 画面 [sx, sy, 大きさの倍率, 奥行き] か null（カメラのうしろ）
  function P(x, y, z) {
    const dx = x - C0[0], dy = y - C0[1], dz = z - C0[2];
    const zc = dx * Fw[0] + dy * Fw[1] + dz * Fw[2];
    if (!(zc >= 20)) return null;   // カメラのうしろ（NaN もここで落とす）
    const s = F / zc;
    return [W / 2 + (dx * R[0] + dy * R[1] + dz * R[2]) * s, H / 2 - (dx * U[0] + dy * U[1] + dz * U[2]) * s, s, zc];
  }
  // 左右の位置は「ルートからの差」: ルート（細胞をもつ生きもの）を方眼の原点に固定する。2D の行の位置は枝を開くたびに全体がずれるので、そのままだと方眼の上で木がすべって見えた
  // 奥行き: ふつうは段（lv）ごとに同じ間かく。真上から見るほど 2D の並び（名前の幅ぶん右へ）に近づける（2D とつながる）
  let B = 0;   // 0 = 3D の並び、1 = 2D の並び（カメラが真上に近いほど 1）
  const blendOf = pitch => { const u = Math.max(0, Math.min(1, (pitch - 1.1) / (PITCH_MAX - 1.1))); return u * u * (3 - 2 * u); };
  const X = n => n.ay - T.root.ay, Z = n => n.lv * DZ * (1 - B) + (n.ax - T.root.ax) * B;
  const XT = n => n.y - T.root.y;   // 決めた位置（アニメ前）での左右
  const ZT = n => n.lv * DZ * (1 - B) + (n.x - T.root.x) * B;
  // 遠いほどうすく（霧）。奥行きの手がかり
  const fog = zc => Math.max(0.12, Math.min(1, 1.25 - zc / (cam.dist * 2.6)));

  // ---------- ガイド ----------
  function extent() {
    let x0 = Infinity, x1 = -Infinity, z1 = 0;
    for (const n of V.vis) { if (n.ay === undefined) continue; x0 = Math.min(x0, X(n)); x1 = Math.max(x1, X(n)); z1 = Math.max(z1, n.lv); }
    if (!isFinite(x0)) { x0 = -200; x1 = 200; }
    // 方眼のはしは 240 ごとにそろえ（枝を開くたびに地面のはしが少しずつ動かないように）、ひとまわり余裕をもたせる
    //   左右は 2 マスぶん、奥行きはルートの手前に 3 段・いちばん奥の先に 5 段
    return { x0: Math.floor((Math.min(x0, 0) - 480) / 240) * 240, x1: Math.ceil((Math.max(x1, 0) + 480) / 240) * 240,
      z0: -3, n: Math.ceil((z1 + 5) / 5) * 5 };
  }
  function line3(g, a, b, steps = 1) {
    let prev = null;
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, p = P(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
      if (p && prev) g.lineTo(p[0], p[1]); else if (p) g.moveTo(p[0], p[1]);
      prev = p;
    }
    g.stroke();
  }
  function label3(g, text, x, y, z, size, color, align = 'center') {
    const p = P(x, y, z); if (!p) return;
    const px = Math.min(size * p[2], size * 1.2);
    if (px < 7) return;
    g.globalAlpha = fog(p[3]); g.fillStyle = color; g.textAlign = align;
    g.font = `${px.toFixed(1)}px 'Zen Old Mincho','Yu Mincho',serif`;
    g.fillText(text, p[0], p[1]);
    g.textAlign = 'left'; g.globalAlpha = 1;
  }
  function drawGuide(g) {
    const e = extent();
    g.lineCap = 'round';
    if (guide === 'grid') {
      // 方眼の地面: 段ごとの横の線（5段ごとに太く、数字）＋奥へのびる縦の線
      for (let k = e.z0; k <= e.n; k++) {
        const z = k * DZ, major = k % 5 === 0;
        const p = P((e.x0 + e.x1) / 2, GROUND, z); if (!p) continue;
        g.globalAlpha = fog(p[3]) * (major ? 0.55 : 0.28);
        g.strokeStyle = major ? '#8a7a55' : '#a99b78'; g.lineWidth = major ? 1.6 : 1;
        line3(g, [e.x0, GROUND, z], [e.x1, GROUND, z], 6);
        if (major && k > 0 && k <= e.n - 5) label3(g, `${k}段`, e.x0 - 20, GROUND, z, 15, '#7a6a45', 'right');
      }
      for (let x = Math.floor(e.x0 / 120) * 120; x <= e.x1; x += 120) {
        g.globalAlpha = 0.22; g.strokeStyle = '#a99b78'; g.lineWidth = 1;
        line3(g, [x, GROUND, e.z0 * DZ], [x, GROUND, e.n * DZ], 16);
      }
    } else if (guide === 'strata') {
      // 地層の帯: 5段ごとに色のちがう帯。奥へ行くほど「あとから分かれた」
      const cols = ['#e9dcc0', '#dfe6cf', '#e8d6c8', '#d8e2e6', '#ece2c6', '#e2d8e8'];
      // 1段ずつの板に分けて描く（手前の板がカメラのうしろにかかっても、見える板は出る）。色は5段ごと
      for (let k = e.z0; k <= e.n; k++) {
        const za = k * DZ, zb = (k + 1) * DZ, band = Math.floor(k / 5);
        const q = [[e.x0, za], [e.x1, za], [e.x1, zb], [e.x0, zb]].map(([x, z]) => P(x, GROUND, z));
        if (q.some(p => !p)) continue;
        g.globalAlpha = fog(Math.min(q[0][3], q[1][3])) * 0.85;
        g.fillStyle = cols[((band % cols.length) + cols.length) % cols.length];
        g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
        if (k % 5 === 0) {
          g.strokeStyle = '#b9a77e'; g.lineWidth = 1.2; g.globalAlpha *= 0.6;
          line3(g, [e.x0, GROUND, za], [e.x1, GROUND, za], 6);
          label3(g, (k + 1) + '〜' + (k + 5) + '段', e.x0 + 12, GROUND, za + DZ * 2.5, 14, '#7a6a45', 'left');
        }
      }
    } else if (guide === 'gates') {
      // ゲート: 5段ごとに門。くぐって奥へ進む感じ
      const top = 300;
      for (let k = 0; k <= e.n; k += 5) {
        const z = k * DZ;
        const p = P((e.x0 + e.x1) / 2, top, z); if (!p) continue;
        const a = fog(p[3]);
        g.strokeStyle = '#8c6d3a'; g.lineWidth = Math.max(1.2, 9 * p[2]); g.globalAlpha = a * 0.55;
        line3(g, [e.x0, GROUND, z], [e.x0, top, z]); line3(g, [e.x1, GROUND, z], [e.x1, top, z]);
        line3(g, [e.x0 - 30, top, z], [e.x1 + 30, top, z], 4);
        g.lineWidth = Math.max(1, 4 * p[2]); g.globalAlpha = a * 0.4;
        line3(g, [e.x0, top - 40, z], [e.x1, top - 40, z], 4);
        label3(g, k ? `${k}段` : '根もと', (e.x0 + e.x1) / 2, top + 18, z, 22, '#6e5528');
        // 地面に影の線
        g.strokeStyle = '#a99b78'; g.lineWidth = 1; g.globalAlpha = a * 0.35;
        line3(g, [e.x0, GROUND, z], [e.x1, GROUND, z], 6);
      }
    }
    g.globalAlpha = 1;
  }

  // ---------- 描く ----------
  function curve(g, a, b, w) {
    // 地面の上の、やわらかい曲線（奥へ）。いくつかの点に分けて投影
    const dz = b[2] - a[2];
    let first = true, pm = null;
    g.beginPath();
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, it = 1 - t;
      const x = it * it * it * a[0] + 3 * it * it * t * a[0] + 3 * it * t * t * b[0] + t * t * t * b[0];
      const z = it * it * it * a[2] + 3 * it * it * t * (a[2] + dz * 0.5) + 3 * it * t * t * (b[2] - dz * 0.5) + t * t * t * b[2];
      const p = P(x, 0, z);
      if (!p) { first = true; continue; }
      if (first) { g.moveTo(p[0], p[1]); first = false; } else g.lineTo(p[0], p[1]);
      pm = p;
    }
    if (!pm) return;
    g.lineWidth = Math.max(0.7, w * pm[2]); g.globalAlpha = fog(pm[3]) * 0.75;
    g.stroke();
  }
  function draw(g, w, h) {
    W = w; H = h;
    B = blendOf(cam.pitch);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 空と地平のグラデーション（奥行きの手がかり）
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#e9e1cd'); sky.addColorStop(0.45, '#f4efe3'); sky.addColorStop(1, '#f1ead9');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    setup();
    drawGuide(g);
    // 枝
    g.lineCap = 'round'; g.strokeStyle = 'rgb(68,82,60)';
    for (const n of V.vis) {
      const kids = V.kidsOf(n);
      if (!kids.length || n.ay === undefined) continue;
      for (const k of kids) if (k.ay !== undefined) curve(g, [X(n), 0, Z(n)], [X(k), 0, Z(k)], V.branchW(k.count));
    }
    // まだ先がある（閉じている）まとまりは、奥へうっすら線をのばす
    g.lineWidth = 1;
    for (const n of V.vis) {
      if (!n.name || n.more || n.ay === undefined || V.kidsOf(n).length || !T.expandable(n)) continue;
      const a = P(X(n), 0, Z(n)), b = P(X(n), 0, Z(n) + DZ * 0.8);
      if (!a || !b) continue;
      const gr = g.createLinearGradient(a[0], a[1], b[0], b[1]);
      gr.addColorStop(0, 'rgba(68,82,60,.28)'); gr.addColorStop(1, 'rgba(68,82,60,0)');
      g.globalAlpha = fog(a[3]); g.strokeStyle = gr; g.lineWidth = Math.max(0.8, 1.6 * a[2]);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    g.strokeStyle = 'rgb(68,82,60)';
    g.globalAlpha = 1;
    // ふし（点）と名前の札: 手前から順に場所を取り、重なる名前はかく（点は描く）
    const items = [];
    for (const n of V.vis) {
      if (!n.name || n.ay === undefined) continue;
      const p = P(X(n), 0, Z(n)); if (!p || p[0] < -200 || p[0] > W + 200 || p[1] < -100 || p[1] > H + 100) continue;
      items.push([p, n]);
    }
    items.sort((a, b) => a[0][3] - b[0][3]);   // 手前から
    const taken = [];
    picks = [];
    const sel = V.selected3, hov = V.hover3;
    const labels = [];
    for (const [p, n] of items) {
      const k = p[2];   // 字の大きさの倍率 = 遠近の倍率（真上から見たとき 2D の拡大と同じになる）
      const fs = Math.max(9, Math.min(22, 14 * k));   // 遠くても 9px より小さくしない（読めるように。重なるものは手前を優先して省く）
      const r = (2.6 + Math.log10(n.count + 1) * 0.7) * Math.max(0.5, k);
      const a = fog(p[3]);
      labels.push({ p, n, k: fs / 14, kr: k, fs, r, a, show: false });   // k: 名前の大きさの倍率、kr: 実際の遠さ
    }
    // 名前を出すか決める（えらんだもの・手前を優先。うんと遠いものは出さない）
    labels.sort((x, y) => (y.n === sel) - (x.n === sel) || x.p[3] - y.p[3]);
    for (const L of labels) {
      if (L.kr < 0.1 && L.n !== sel) continue;   // うんと遠いものは名前を出さない
      // 遠い（字が小さい）ものは名前（1段め）だけの小さな札にして、場所を取りすぎないように
      L.one = L.fs < 10.5 && L.n !== sel;
      const parts = V.labelParts(L.n);
      const w1 = (V.tw(parts.main, "14px 'Zen Old Mincho','Yu Mincho',serif") + (parts.tag ? 24 : 0)) * L.k + 8;
      const lw = L.one ? w1 : Math.max(w1, L.n.lw * L.k + 10);
      const m = 2;   // 少しの重なりは許す
      const free = rc => !taken.some(t => rc[0] + m < t[2] && t[0] + m < rc[2] && rc[1] + m < t[3] && t[1] + m < rc[3]);
      // 置き場所の候補: 点の右 → 少し上 → 少し下（ずらしたときは細い線で点とつなぐ）
      const hh = L.fs * (L.one ? 1.5 : 2.2);
      for (const dy of [0, -hh, hh, -2 * hh]) {
        const rect = [L.p[0] - L.r - 3, L.p[1] + dy - L.fs * (L.one ? 1.3 : 1.5), L.p[0] + L.r + 4 + lw, L.p[1] + dy + L.fs * (L.one ? 0.2 : 0.7)];
        if (free(rect)) { taken.push(rect); L.show = true; L.rect = rect; L.dy = dy; break; }
      }
    }
    // 遠いものから描く（手前が上に）
    labels.sort((x, y) => y.p[3] - x.p[3]);
    g.textBaseline = 'middle';
    for (const L of labels) {
      const { p, n, k, fs, r, a } = L;
      const col = GROUP_COLOR[RANK_GROUP(n.rank)];
      g.globalAlpha = (L.show ? Math.max(0.6, a) : a) * (n.alpha === undefined ? 1 : n.alpha);   // 名前を出すものは、遠くても うすくしすぎない
      // 地面への影（立っている感じ）
      const pg = P(X(n), GROUND, Z(n));
      if (pg) { g.fillStyle = 'rgba(90,80,50,.18)'; g.beginPath(); g.ellipse(pg[0], pg[1], r * 1.6, r * 0.5, 0, 0, 7); g.fill(); }
      // 前後: 名前の下じき → 点 → 名前（点が下じきに隠れないように）
      if (L.show && (n === sel || n === hov)) {
        g.fillStyle = n === sel ? '#ead9ad' : '#ebe3cf';
        const [x0, y0, x1, y1] = L.rect; roundRect(g, x0, y0, x1 - x0, y1 - y0, 8); g.fill();
      }
      g.fillStyle = col; g.strokeStyle = '#f6f1e6'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fill(); g.stroke();
      picks.push({ n, x: p[0], y: p[1], rect: L.show ? L.rect : [p[0] - r - 6, p[1] - r - 6, p[0] + r + 6, p[1] + r + 6] });
      if (!L.show) continue;
      const parts = V.labelParts(n);
      const ly = p[1] - fs * 0.75 + (L.dy || 0);
      if (L.dy) { g.strokeStyle = 'rgba(110,103,87,.45)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + r + 3, ly + fs * 0.35); g.stroke(); }
      let x = p[0] + r + 5;
      if (parts.tag) {
        const tf = `700 ${(10 * k).toFixed(1)}px 'Zen Kaku Gothic New','Yu Gothic',sans-serif`;
        g.font = tf; const w = g.measureText(parts.tag).width + 7 * k;
        g.fillStyle = col; roundRect(g, x, ly - 7.5 * k, w, 15 * k, 7.5 * k); g.fill();
        g.fillStyle = '#fbf8f1'; g.fillText(parts.tag, x + 3.5 * k, ly + 0.5);
        x += w + 4 * k;
      }
      g.fillStyle = '#2c2a24';
      g.font = parts.sciMain ? `italic ${fs.toFixed(1)}px 'EB Garamond',Georgia,serif` : `${n === sel ? 700 : 400} ${fs.toFixed(1)}px 'Zen Old Mincho','Yu Mincho',serif`;
      g.fillText(parts.main, x, ly);
      if (!L.one && (parts.sci || parts.cnt)) {
        g.fillStyle = '#7a7262';
        g.font = `italic ${(11.5 * k).toFixed(1)}px 'EB Garamond',Georgia,serif`;
        g.fillText(parts.sci + (parts.cnt ? '  ' + parts.cnt : ''), x, ly + 13 * k);
      }
    }
    g.globalAlpha = 1;
    shown = labels.filter(l => l.show).map(l => l.n);
    // いきもの（名前を出したものの右に）
    C.draw3d(g, n => { const L = labels.find(l => l.n === n && l.show); if (!L) return null; const x = L.rect[2] + 4, y = L.p[1] + (L.dy || 0) + 4 * L.k, rc = [x, y - 28 * L.k, x + 90 * L.k, y]; if (taken.some(t => t !== L.rect && rc[0] < t[2] && t[0] < rc[2] && rc[1] < t[3] && t[1] < rc[3])) return null; return { x, y, s: L.k }; /* ほかの名前にかぶるところには出さない */ });
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // 押した点 → ふし（手前のものから）
  function hit(px, py) {
    for (let i = picks.length - 1; i >= 0; i--) {
      const { n, rect } = picks[i];
      if (px >= rect[0] && px <= rect[2] && py >= rect[1] && py <= rect[3]) return n;
    }
    return null;
  }

  // ---------- カメラ ----------
  function orbit(dx, dy) { cam.yaw += dx * 0.006; cam.pitch = Math.max(0.05, Math.min(PITCH_MAX, cam.pitch + dy * 0.005)); }
  function pan(dx, dy) {
    // 画面の右・奥の向きに、地面にそって動かす。つかんだ地面が指（マウス）についてくるように:
    //   はじめの速さ（つかんだ所がそのまま）と、速くしすぎた版（大画面で最大 1.7 倍・たては 1/sin 倍）の、ちょうど間（ユーザー）
    const boost = 1 + (Math.max(1, Math.min(1.7, Math.sqrt(F / 520))) - 1) / 2;
    const s = cam.dist / F * boost, sv = s * (1 + (1 / Math.max(0.35, Math.sin(cam.pitch)) - 1) / 2);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);   // 右
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);    // 奥
    cam.tx -= rx * dx * s - fx * dy * sv; cam.tz -= rz * dx * s - fz * dy * sv;
  }
  function dolly(f) { cam.dist = Math.max(120, Math.min(12000, cam.dist * f)); }
  // あるふしを見る（なめらかに）
  function glideTo(n, ms = 600) {
    if (!n || n.lv === undefined) return;
    // 進みすぎない: 子の並ぶ少し手前を見る。開いたふし（親）が画面の下のはしに残るか、たしかめて少しずつもどす
    const kids = V.kidsOf(n).filter(k => k.y !== undefined);
    const kx = kids.length ? (XT(kids[0]) + XT(kids[kids.length - 1])) / 2 : XT(n);
    const save = { tx: cam.tx, tz: cam.tz };
    let to = null;
    for (const ahead of [0.85, 0.6, 0.35, 0.1, -0.2]) {
      const c = { tx: XT(n) + (kx - XT(n)) * 0.6, tz: ZT(n) + DZ * ahead };
      cam.tx = c.tx; cam.tz = c.tz; setup();
      const p = P(XT(n), 0, ZT(n));
      to = c;
      if (p && p[1] < H - 36 && p[1] > 40 && p[0] > 20 && p[0] < W - 70) break;
    }
    cam.tx = save.tx; cam.tz = save.tz;
    const from = { tx: cam.tx, tz: cam.tz }, s = performance.now();
    (function f(t) {
      const u = Math.min(1, (t - s) / ms), e = u * u * (3 - 2 * u);
      cam.tx = from.tx + (to.tx - from.tx) * e; cam.tz = from.tz + (to.tz - from.tz) * e;
      V.draw();
      if (u < 1) requestAnimationFrame(f);
    })(s);
    setTimeout(() => { cam.tx = to.tx; cam.tz = to.tz; V.draw(); }, ms + 60);
  }
  // あるふしと、その先の見えている枝がちょうど入るように（3D に入ったとき）
  function frame(n, ms = 700) {
    if (!n || n.lv === undefined) return;
    let x0 = XT(n), x1 = XT(n), z0 = ZT(n), z1 = ZT(n);
    for (const m of V.vis) {
      if (m.y === undefined) continue;
      let a = m; while (a && a !== n) a = a.parent;
      if (!a) continue;
      x0 = Math.min(x0, XT(m)); x1 = Math.max(x1, XT(m)); z1 = Math.max(z1, ZT(m));
    }
    const to = { tx: (x0 + x1) / 2, tz: (z0 + z1) / 2 + DZ * 0.5,
      dist: Math.max(500, Math.min(6000, Math.max((x1 - x0) * 1.15, (z1 - z0 + 2 * DZ) * 1.25))) };
    if (!(ms > 0)) { Object.assign(cam, to); V.draw(); return; }   // すぐに置く（0 で割らない）
    const from = { tx: cam.tx, tz: cam.tz, dist: cam.dist }, s = performance.now();
    (function f(t) {
      const u = Math.min(1, (t - s) / ms), e = u * u * (3 - 2 * u);
      for (const k in to) cam[k] = from[k] + (to[k] - from[k]) * e;
      V.draw();
      if (u < 1) requestAnimationFrame(f);
    })(s);
    setTimeout(() => { Object.assign(cam, to); V.draw(); }, ms + 60);
  }
  // ---------- 2D とつなぐ ----------
  //   2D の見え方 = 真上（pitch≒90°）から、奥行きを右・左右を下にして見たところ（yaw = -90°）
  const TOP = { yaw: -Math.PI / 2, pitch: PITCH_MAX };
  const near = (from, to) => from + ((((to - from) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);   // いちばん近い回り方
  // 見る点のいちばん近くのふし（並びが 2D⇔3D で変わっても、それが同じ所に写るよう見る点を合わせる）
  const ZB = (n, b) => n.lv * DZ * (1 - b) + (n.x - T.root.x) * b;
  function anchorNear() {
    let best = null, bd = Infinity; const b = blendOf(cam.pitch);
    for (const n of V.vis) { if (!n.name || n.y === undefined) continue; const d = Math.hypot(XT(n) - cam.tx, ZB(n, b) - cam.tz); if (d < bd) { bd = d; best = n; } }
    return best ? { n: best, off: cam.tz - ZB(best, b) } : null;
  }
  function tween(to, ms, done) {
    const from = { ...cam }, s = performance.now(), an = anchorNear();
    const follow = () => { if (an) cam.tz = ZB(an.n, blendOf(cam.pitch)) + an.off; };
    if (to.yaw !== undefined) to.yaw = near(from.yaw, to.yaw);
    let fin = false;
    const end = () => { if (fin) return; fin = true; Object.assign(cam, to); follow(); V.draw(); if (done) done(); };
    (function f(t) {
      if (fin) return;
      const u = Math.min(1, (t - s) / ms), e = u * u * (3 - 2 * u);
      for (const k in to) cam[k] = from[k] + (to[k] - from[k]) * e;
      follow();
      V.draw();
      if (u < 1) requestAnimationFrame(f); else end();
    })(s);
    setTimeout(end, ms + 80);   // コマ送りが止まっていても終わる
  }
  // 2D のカメラ（拡大 k と位置）→ 真上からの 3D のカメラ
  function fromTop2D(c2, w, h) {
    W = w || W; H = h || H;
    Object.assign(cam, TOP);
    B = 1; setup();
    const s = Math.sin(cam.pitch);
    cam.dist = F / c2.k / s;   // 地面までの高さで、2D と同じ大きさに
    cam.tz = (W / 2 - c2.x) / c2.k - T.root.ax;
    cam.tx = (H / 2 - c2.y) / c2.k - T.root.ay;
    // 少しななめ（真上の少し手前）なので、ルートの写る場所でずれを1回なおす
    // 画面の真ん中に近いふしを基準に合わせる（遠いルートで合わせると、少しななめな分のずれが真ん中で大きくなる）
    const a = centerNode((n) => [n.ax * c2.k + c2.x, n.ay * c2.k + c2.y]);
    if (!a) return;
    const want = [a.ax * c2.k + c2.x, a.ay * c2.k + c2.y];
    for (let i = 0; i < 3; i++) {
      setup();
      const p = P(X(a), 0, Z(a)); if (!p) break;
      cam.tz += (p[0] - want[0]) / c2.k; cam.tx += (p[1] - want[1]) / c2.k;
    }
  }
  // 真上からの 3D のカメラ → 2D のカメラ
  function toTop2D(c2) {
    B = 1; setup();
    const n = centerNode(m => { const p = P(X(m), 0, Z(m)); return p ? [p[0], p[1]] : [1e9, 1e9]; });
    if (!n) return;
    const a = P(X(n), 0, Z(n)), b = P(X(n), 0, Z(n) + 100);
    if (!a || !b) return;
    const k = (b[0] - a[0]) / 100;
    c2.k = k; c2.x = a[0] - n.ax * k; c2.y = a[1] - n.ay * k;
  }
  // 画面の真ん中にいちばん近いふし（screenOf: ふし → 画面の [x, y]）
  function centerNode(screenOf) {
    let best = null, bd = Infinity;
    for (const n of V.vis) { if (!n.name || n.ax === undefined) continue; const [x, y] = screenOf(n); const d = Math.hypot(x - W / 2, y - H / 2); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  function morphTo2D(done) { tween({ ...TOP }, 750, done); }
  function morphTo3D() { tween({ yaw: -0.35, pitch: 0.42 }, 900); }

  // 全体: 開いている枝がぜんぶ入るように
  function fit() {
    let x0 = Infinity, x1 = -Infinity, z1 = 0;
    for (const n of V.vis) { if (n.y === undefined) continue; x0 = Math.min(x0, XT(n)); x1 = Math.max(x1, XT(n)); z1 = Math.max(z1, n.lv); }
    if (!isFinite(x0)) return;
    cam.tx = (x0 + x1) / 2; cam.tz = z1 * DZ / 2;
    cam.dist = Math.max(400, Math.min(12000, Math.max(x1 - x0, z1 * DZ) * 1.1));
    V.draw();
  }

  return {
    cam, draw, hit, orbit, pan, dolly, glideTo, frame, fit, fromTop2D, toTop2D, morphTo2D, morphTo3D,
    project: n => { B = blendOf(cam.pitch); setup(); return P(X(n), 0, Z(n)); },   // デバッグ用: ふしの画面の場所
    get on() { return on; }, get shown() { return shown; },
    set on(v) { on = !!v; V.draw3d = on ? draw : null; V.draw(); },
    get guide() { return guide; }, set guide(v) { guide = v; V.draw(); },
  };
})();
