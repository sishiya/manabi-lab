// 大きなスケール: 人のからだ → おなか（大腸）→ 大腸のかべ → 粘液と大腸菌たち。物語の細菌（原点）がその中のどこにいるか
// 単位は nm（1cm = 1e7）。大腸のかべの内側（粘液の外側の層）に原点がくるように置く。形・位置は模式、大きさは目安
'use strict';

const Macro = (() => {
  const V = View.V, g = V.g;
  const CM = 1e7, MM = 1e6, UM = 1e3, M1 = 1e9;
  const SURF = -170 * UM;        // 大腸の内側の表面（上皮）の高さ。原点はその上の粘液の外側の層
  const INNER = -50 * UM;        // 粘液の内側の層の上のはし（ここから下は細菌がほとんど入れない）
  const LR = 2.2 * CM, WT = 2.3 * MM;   // 大腸の中の半径（太さ約4.4cm）と、かべの厚さ
  const YC = SURF + LR;          // 横行結腸のまん中の高さ（下のかべの内側の表面が、かべの断面の SURF とそろう）
  const INFO_M = {
    body: { t: '人のからだ（身長 約1.7m）', k: 'est', b: 'おなかの中の大腸に、とても多くの細菌がすんでいる。人の体の細菌は全部で約40兆個で、ほとんどが大腸にいる（Sender ら 2016）。' },
    colon: { t: '大腸', k: 'est', b: '長さ約1.5m の太い腸。食べ物の残りから水を吸う。中には細菌がぎっしり（中身1gに約1000億個）。大腸菌はそのうちの1%より少ない。' },
    small: { t: '小腸', k: 'sure', b: '長さ約6m の細い腸。栄養を吸う。細菌は大腸よりずっと少ない。' },
    wall: { t: '大腸のかべ', k: 'sure', b: '内側から、粘膜（上皮と陰窩）・粘膜下層・筋肉の層。筋肉が中身を少しずつ送る。' },
    crypt: { t: '陰窩（いんか）', k: 'sure', b: '粘膜の小さなくぼみ（深さ約0.4mm）。底で新しい上皮の細胞が生まれ、粘液を出す細胞も多い。' },
    epi: { t: '上皮の細胞', k: 'sure', b: '大腸の内側をおおう1層の細胞（幅 数µm）。ところどころの杯細胞（さかずき細胞）が粘液を出す。' },
    inner: { t: '粘液の内側の層', k: 'sure', b: 'ぎっしりした粘液の層。細菌はほとんど入れず、上皮を守っている（Johansson ら 2008）。厚さは目安。' },
    outer: { t: '粘液の外側の層', k: 'sure', b: 'ゆるい粘液の層。大腸菌など多くの細菌がすんでいて、ファージもたくさんいる。物語の細菌はここにいる。' },
    lumen: { t: '大腸の中（中身）', k: 'est', b: '食べ物の残りと水、たくさんの細菌とウイルス。ウイルスは中身1gに約1億〜100億個で、ほとんどがファージ（Shkoporov と Hill 2019）。' },
    bact: { t: '腸の細菌たち', k: 'est', b: 'いろいろな種類の細菌（ここでは形だけの模式）。大腸菌はその一部。' },
  };
  // 見えている横はば w（nm）に合わせて、その段の濃さ（対数で前後をなめらかに）
  const lg = Math.log10;
  function band(w, lo, hi, soft = 0.35) {
    const x = lg(w); return Math.max(0, Math.min(1, (x - lg(lo)) / soft + 1, (lg(hi) - x) / soft + 1));
  }

  // ---- 大腸と小腸の通り道（世界の座標）----
  const colonPath = (() => {
    const P = [], add = (x, y) => P.push([x * CM, y * CM]);
    add(-9, -17); add(-10, -12); add(-10.5, -4); add(-10, 0.5); add(-8, YC / CM); add(8, YC / CM); add(10, 0.5); add(10.5, -5); add(10, -13);
    add(8, -17.5); add(4, -18.5); add(1, -20); add(0, -23);
    return P;
  })();
  const smallPath = (() => {
    // おなかの中で折れ曲がる細い腸（決まった種の乱数で、でたらめな曲がり方。模式）
    const P = [], r = rng(606); let x = -5, y = -4, a = 0;
    for (let i = 0; i < 420; i++) {
      a += (r() - 0.5) * 1.1;
      const nx = x + Math.cos(a) * 0.45, ny = y + Math.sin(a) * 0.45;
      if (nx < -7 || nx > 7 || ny > -1.8 || ny < -16) { a += Math.PI * (0.6 + r() * 0.5); continue; }
      x = nx; y = ny; P.push([x * CM, y * CM]);
    }
    return P;
  })();
  function strokePath(P, color, wNm, minPx = 1) {
    g.strokeStyle = color; g.lineWidth = Math.max(minPx, wNm * V.s); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(V.X(x), V.Y(y)) : g.moveTo(V.X(x), V.Y(y))); g.stroke();
  }

  // ---- 人のからだ（輪郭）----
  function drawBody(a) {
    if (a <= 0) return;
    const F = -1.07 * M1; // 床
    g.save(); g.globalAlpha = a;
    const fill = '#3a4c55', edge = '#8fa6b2';
    const part = (fn) => { g.beginPath(); fn(); g.fillStyle = fill; g.fill(); g.strokeStyle = edge; g.lineWidth = 1.5; g.stroke(); };
    const smooth = pts => { for (let k = 0; k < 2; k++) { const o = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } pts = o; } return pts; };
    const shape = (pts, sx = 1) => part(() => { smooth(pts).forEach(([x, y], i) => { const q = P(sx * x, y); i ? g.lineTo(...q) : g.moveTo(...q); }); g.closePath(); });
    const P = (x, y) => [V.X(x * M1), V.Y(y * M1)];
    // 頭・首・胴・腕・脚
    part(() => { const [x, y] = P(0, 0.5); g.ellipse(x, y, 0.095 * M1 * V.s, 0.12 * M1 * V.s, 0, 0, 7); });
    shape([[-0.05, 0.4], [0.05, 0.4], [0.06, 0.35], [0.19, 0.32], [0.215, 0.2], [0.17, 0.0], [0.19, -0.12], [0.12, -0.16], [-0.12, -0.16], [-0.19, -0.12], [-0.17, 0.0], [-0.215, 0.2], [-0.19, 0.32], [-0.06, 0.35]]);
    for (const sx of [-1, 1]) {
      shape([[0.19, 0.32], [0.24, 0.27], [0.27, 0.05], [0.3, -0.22], [0.29, -0.3], [0.26, -0.3], [0.25, -0.2], [0.235, 0.02], [0.21, 0.15]], sx);
      shape([[0.01, -0.15], [0.18, -0.12], [0.15, -0.6], [0.12, F / M1 + 0.04], [0.18, F / M1 + 0.005], [0.17, F / M1], [0.07, F / M1], [0.065, -0.6], [0.02, -0.3]], sx);
    }
    g.restore();
    V.hit({ box: [-0.32 * M1, F, 0.32 * M1, 0.63 * M1], info: INFO_M.body });
  }

  // ---- おなか: 大腸（でこぼこの袋 = 膨起）と小腸 ----
  function drawGut(a, w) {
    if (a <= 0) return;
    g.save(); g.globalAlpha = a;
    // 小腸: 少しずつ重ねて描き、重なった輪の縁が見えるように
    for (let i = 0; i < smallPath.length - 1; i += 14) { const seg = smallPath.slice(i, i + 15); strokePath(seg, '#5e3f48', 2.4 * CM, 1.5); strokePath(seg, '#a0707c', 1.8 * CM, 1); }
    // 大腸: かべ（ピンク）と中（暗い）。寄ったときの「かべの断面」と同じ位置・色合い
    strokePath(colonPath, '#9a6874', 2 * (LR + WT), 2.5);
    strokePath(colonPath, '#2e2228', 2 * LR, 1.5);
    // 膨起（ふくらみの区切り）
    if (V.s * CM > 1.5) {
      g.strokeStyle = 'rgba(154,104,116,.55)'; g.lineWidth = Math.max(1, 0.25 * CM * V.s); g.beginPath();
      for (let i = 1; i < colonPath.length; i++) {
        const [x0, y0] = colonPath[i - 1], [x1, y1] = colonPath[i], L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
        for (let d = 2 * CM; d < L; d += 4 * CM) { const x = x0 + (x1 - x0) * d / L, y = y0 + (y1 - y0) * d / L; g.moveTo(V.X(x + nx * 2.2 * CM), V.Y(y + ny * 2.2 * CM)); g.lineTo(V.X(x - nx * 2.2 * CM), V.Y(y - ny * 2.2 * CM)); }
      }
      g.stroke();
    }
    g.restore();
    V.hit({ seg: smallPath, w: 1.3 * CM, info: INFO_M.small });
    V.hit({ seg: colonPath, w: 2.8 * CM, info: INFO_M.colon });
    // ここ（物語の細菌のいる場所）の印
    if (w > 6 * CM && w < 1.5 * M1) {
      const x = V.X(0), y = V.Y(0), r = 14;
      g.save(); g.globalAlpha = a; g.strokeStyle = '#ffe066'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
      g.fillStyle = '#ffe066'; g.font = '700 13px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(w > 60 * CM ? 'おなかの中の大腸へ' : '大腸の内側のかべへ', x + r + 6, y - r - 4); g.restore();
    }
  }

  // ---- 大腸のかべ（断面）: 粘膜（陰窩）・粘膜下層・筋肉 ----
  function drawWall(a) {
    if (a <= 0) return;
    const vb = V.viewBox(); if (vb.y0 > SURF + 3 * MM && vb.y1 < SURF - 3 * MM) return;
    g.save(); g.globalAlpha = a;
    const x0 = V.X(vb.x0) - 2, x1 = V.X(vb.x1) + 2, Y = y => V.Y(y);
    const layer = (ya, yb, col) => { g.fillStyle = col; g.fillRect(x0, Y(ya), x1 - x0, Y(yb) - Y(ya)); };
    layer(SURF, SURF - 0.5 * MM, '#6a4550');            // 粘膜
    layer(SURF - 0.5 * MM, SURF - 0.55 * MM, '#8a5a66'); // 粘膜筋板
    layer(SURF - 0.55 * MM, SURF - 1.1 * MM, '#4f3a40'); // 粘膜下層
    layer(SURF - 1.1 * MM, SURF - 1.7 * MM, '#7a4a52');  // 輪走筋
    layer(SURF - 1.7 * MM, SURF - 2.1 * MM, '#6a3e46');  // 縦走筋
    // 陰窩（約0.1mm おき、深さ約0.4mm）
    const step = 100 * UM, cw = 55 * UM;
    if (step * V.s > 3) {
      g.fillStyle = '#2e1f25';
      for (let x = Math.floor(vb.x0 / step) * step; x < vb.x1 + step; x += step) { const xx = x + step / 2; g.fillRect(V.X(xx - cw / 2), Y(SURF), cw * V.s, 0.4 * MM * V.s); }
    }
    // 粘液（内側の層）
    layer(INNER, SURF, 'rgba(150,175,190,.22)');
    // 層の名前（左はし）
    if (!View.real && a > 0.6) {
      const lab = (t, y) => { if (Y(y) > 20 && Y(y) < V.H - 20) V.text(t, vb.x0, y, { dx: 10, align: 'left', size: 12, bold: true, color: '#f0dde2', bg: 'rgba(10,22,27,.7)' }); };
      lab('粘液', (INNER + SURF) / 2 + 60 * UM); lab('粘膜（陰窩が並ぶ）', SURF - 0.25 * MM); lab('粘膜下層', SURF - 0.82 * MM); lab('筋肉の層', SURF - 1.6 * MM);
    }
    g.restore();
    V.hit({ test: (x, y) => y < SURF && y > SURF - 2.1 * MM, infoAt: (x, y) => { const xx = ((x % step) + step) % step; return y > SURF - 0.4 * MM && Math.abs(xx - step / 2) < cw / 2 ? INFO_M.crypt : INFO_M.wall; } });
  }

  // ---- 上皮と粘液、まわりの腸の細菌 ----
  function drawMucosa(a) {
    if (a <= 0) return;
    const vb = V.viewBox(); if (vb.y0 > INNER + 300 * UM) return;
    g.save(); g.globalAlpha = a;
    const cellW = 6 * UM, cellH = 28 * UM;
    if (cellW * V.s > 2) {
      for (let x = Math.floor(vb.x0 / cellW) * cellW; x < vb.x1 + cellW; x += cellW) {
        const k = Math.round(x / cellW), gob = ((k % 5) + 5) % 5 === 2;
        V.rect(x + cellW / 2, SURF - cellH / 2, cellW * 0.94, cellH, gob ? '#8a7480' : '#7a4f5a', cellW * 0.2);
        if (gob) V.ell(x + cellW / 2, SURF - cellH * 0.3, cellW * 0.38, cellH * 0.3, 0, 'rgba(210,225,235,.55)');
        V.ell(x + cellW / 2, SURF - cellH * 0.72, cellW * 0.28, cellW * 0.45, 0, '#4a2f3a');
      }
    }
    // 粘液の糸（内側はこまかく、外側はゆるく）
    if (V.s * UM > 0.05) {
      g.strokeStyle = 'rgba(170,195,210,.18)'; g.lineWidth = 1; g.beginPath();
      const st = 9 * UM;
      for (let x = Math.floor(vb.x0 / st) * st; x < vb.x1; x += st) for (let y = Math.max(SURF, Math.floor(vb.y0 / st) * st); y < Math.min(90 * UM, vb.y1); y += st) {
        const h = hash(Math.round(x / st), Math.round(y / st)), loose = y > INNER;
        if (loose && h > 0.45) continue;
        g.moveTo(V.X(x), V.Y(y)); g.lineTo(V.X(x + st * (0.5 + h)), V.Y(y + st * (h - 0.5)));
      }
      g.stroke();
    }
    // 粘液の内側の層（帯）
    g.fillStyle = 'rgba(150,175,190,.16)'; g.fillRect(V.X(vb.x0) - 2, V.Y(INNER), (vb.x1 - vb.x0) * V.s + 4, (INNER - SURF) * V.s);
    // まわりの腸の細菌（物語のまわりの細菌より外。外側の層に。いろいろな形の模式）
    if (V.s * UM > 0.04) {
      const t = 14 * UM;
      for (let i = Math.floor(vb.x0 / t); i <= Math.ceil(vb.x1 / t); i++) for (let j = Math.floor(Math.max(INNER, vb.y0) / t); j <= Math.ceil(Math.min(140 * UM, vb.y1) / t); j++) {
        for (let n = 0; n < 4; n++) {
          const x = (i + hash(i * 7 + n, j)) * t, y = (j + hash(i, j * 7 + n)) * t;
          if (y < INNER + 3 * UM || (Math.abs(x) < 19 * UM && Math.abs(y) < 13 * UM)) continue;
          const ang = hash(i + n, j + 3) * 6.28, L = (1.2 + 1.8 * hash(i + 9, j + n)) * UM, kind = hash(i * 3 + n, j * 5);
          // 小さく見えるときは線1本で（重くしない）
          if (L * V.s < 5) { g.strokeStyle = kind < 0.4 ? '#46617a' : '#4d5d66'; g.lineWidth = Math.max(1, 0.8 * UM * V.s); g.beginPath(); g.moveTo(V.X(x - Math.cos(ang) * L / 2), V.Y(y - Math.sin(ang) * L / 2)); g.lineTo(V.X(x + Math.cos(ang) * L / 2), V.Y(y + Math.sin(ang) * L / 2)); g.stroke(); continue; }
          const Z = V.local(x, y, ang);
          if (kind < 0.25) Z.circle(0, 0, 0.5 * UM, '#566a72'); else Z.rect(0, 0, L, 0.8 * UM, kind < 0.4 ? '#46617a' : '#4d5d66', 0.4 * UM);
          g.restore();
        }
      }
    }
    g.restore();
    V.hit({ test: (x, y) => y < SURF && y > SURF - 28 * UM, info: INFO_M.epi });
    V.hit({ test: (x, y) => y >= SURF && y < INNER, info: INFO_M.inner });
    V.hit({ test: (x, y) => y >= INNER && y < 150 * UM && (Math.abs(x) > 19 * UM || Math.abs(y) > 13 * UM), info: INFO_M.outer });
  }

  // 背景（いちばん下）: 大きく引くほど、からだの外（暗い）。寄ると大腸の中
  function draw() {
    const w = V.W / V.s;
    if (w < 25 * UM) return;
    drawBody(band(w, 50 * CM, 1e12, 0.3));
    drawGut(band(w, 3 * CM, 1e12, 0.3) * (w > 60 * CM ? 0.85 : 1), w);
    drawWall(band(w, 300 * UM, 7 * CM, 0.3));
    drawMucosa(band(w, 30 * UM, 2.5 * MM, 0.3));
  }
  // 解説（からだより外は「水」ではなく、その段の場所）
  function lumenInfo() { const w = V.W / V.s; return w > 60 * CM ? null : INFO_M.lumen; }
  return { draw, lumenInfo, INFO_M, SURF, INNER };
})();
