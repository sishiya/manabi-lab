// 部屋「明るさと線」: チェッカーシャドウ、ヘルマン格子・きらめき格子、カフェウォール
'use strict';

// ---------- チェッカーシャドウ ----------
// 盤は斜めから見た 5×5。マスの明るさは 明 205 / 暗 123。影の中心は ×0.6 なので、影の中の明マス B は 205×0.6 = 123 ＝ 影の外の暗マス A と同じ値。
const CK = {
  X0: 0.5, Y0: 0.2, AX: 0.088, AY: 0.055,
  LIGHT: 205, DARK: 123, SH: 0.6,
  P0: [3.5, 0.9], P1: [3.5, 3.6], CORE: 0.85, EDGE: 1.3,
  A: [0, 2], B: [3, 2],
  toS(u, v) { return [this.X0 + (u - v) * this.AX, this.Y0 + (u + v) * this.AY]; },
  toB(x, y) { const p = (x - this.X0) / this.AX, q = (y - this.Y0) / this.AY; return [(p + q) / 2, (q - p) / 2]; },
  shade(u, v) {
    const [ax, ay] = this.P0, by = this.P1[1];
    const vy = clamp(v, ay, by), d = Math.hypot(u - ax, v - vy);
    if (d <= this.CORE) return 1;
    if (d >= this.EDGE) return 0;
    const k = (d - this.CORE) / (this.EDGE - this.CORE);
    return 1 - k * k * (3 - 2 * k);
  },
  cache: null, key: '',
  board(W) {
    if (this.key === String(W)) return this.cache;
    const c = document.createElement('canvas'); c.width = c.height = W;
    const x = c.getContext('2d'), im = x.createImageData(W, W), d = im.data;
    for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
      const [u, v] = this.toB((px + 0.5) / W, (py + 0.5) / W);
      if (u < 0 || v < 0 || u >= 5 || v >= 5) continue;
      const light = (Math.floor(u) + Math.floor(v)) % 2 === 1;
      const f = 1 - (1 - this.SH) * this.shade(u, v);
      const val = Math.round((light ? this.LIGHT : this.DARK) * f);
      const o = (py * W + px) * 4; d[o] = d[o + 1] = d[o + 2] = val; d[o + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    this.cache = c; this.key = String(W); return c;
  },
  tilePath(g, S, i, j) {
    const pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([u, v]) => this.toS(u, v));
    g.moveTo(pts[0][0] * S, pts[0][1] * S); for (let k = 1; k < 4; k++) g.lineTo(pts[k][0] * S, pts[k][1] * S); g.closePath();
  },
};
defEx({
  id: 'checker', room: 'light',
  title: 'チェッカーシャドウ錯視', en: 'Checker shadow illusion',
  who: 'エドワード・H・エーデルソン', where: 'アメリカ', year: 1995,
  lead: 'A のマスと B のマスは、まったく同じ灰色です。',
  bg: '#c9ced2',
  steps: [
    'A のマス（影の外の濃いマス）と、B のマス（影の中の薄いマス）の明るさを比べてください。',
    'マスをタップすると、そこの本当の色の値が出ます。A と B をタップしてみましょう。',
    '「答え合わせ」の「帯でつなぐ」「まわりを隠す」で、同じ色だと目で確かめられます。',
  ],
  controls: [
    { type: 'choice', id: 'rv', label: '答え合わせ', opts: [['none', 'なし'], ['bars', '帯でつなぐ'], ['mask', 'まわりを隠す']], val: 'none' },
  ],
  init(st) {},
  draw(g, S, t, st) {
    fillBg(g, S, this.bg);
    const dpr = g.canvas.width / S || 1, W = Math.round(S * dpr);
    // 盤の厚み（手前の2辺）
    const th = S * 0.03, q = (u, v) => CK.toS(u, v).map(z => z * S);
    const [l, f, r] = [q(0, 5), q(5, 5), q(5, 0)];
    g.fillStyle = '#5b5f63'; g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(f[0], f[1]); g.lineTo(f[0], f[1] + th); g.lineTo(l[0], l[1] + th); g.fill();
    g.fillStyle = '#7a7e82'; g.beginPath(); g.moveTo(f[0], f[1]); g.lineTo(r[0], r[1]); g.lineTo(r[0], r[1] + th); g.lineTo(f[0], f[1] + th); g.fill();
    g.drawImage(CK.board(W), 0, 0, S, S);
    // 円柱（右奥の光が、手前左へ影を落とす）
    const [bx, byy] = q(CK.P0[0], CK.P0[1]), rx = S * 0.07, ry = S * 0.032, h = S * 0.26;
    const gr = g.createLinearGradient(bx - rx, 0, bx + rx, 0);
    gr.addColorStop(0, '#1f5e2e'); gr.addColorStop(0.55, '#3f9a52'); gr.addColorStop(0.8, '#6cc27a'); gr.addColorStop(1, '#3b8a4a');
    g.fillStyle = gr; g.beginPath();
    g.ellipse(bx, byy, rx, ry, 0, 0, Math.PI); g.lineTo(bx - rx, byy - h); g.ellipse(bx, byy - h, rx, ry, 0, Math.PI, TAU); g.closePath(); g.fill();
    g.fillStyle = '#8ad596'; g.beginPath(); g.ellipse(bx, byy - h, rx, ry, 0, 0, TAU); g.fill();
    // 文字
    for (const [nm, [i, j], c] of [['A', CK.A, '#f2f2f2'], ['B', CK.B, '#333']]) {
      const [x, y] = q(i + 0.5, j + 0.5);
      label(g, nm, x, y, S, { c, size: 0.045, w: 700 });
    }
    const gray = `rgb(${CK.DARK},${CK.DARK},${CK.DARK})`;
    if (st.rv === 'bars') {
      const [ax, ay] = q(CK.A[0] + 0.5, CK.A[1] + 0.5), [bx2, by2] = q(CK.B[0] + 0.5, CK.B[1] + 0.5);
      const w = S * 0.03, top = S * 0.07;
      g.fillStyle = gray;
      g.fillRect(ax - w / 2, top, w, ay - top - S * 0.03);
      g.fillRect(bx2 - w / 2, top, w, by2 - top - S * 0.03);
      g.fillRect(ax - w / 2, top, bx2 - ax + w, w);
    } else if (st.rv === 'mask') {
      g.fillStyle = '#9fa6ab'; g.beginPath(); g.rect(0, 0, S, S);
      CK.tilePath(g, S, CK.A[0], CK.A[1]); CK.tilePath(g, S, CK.B[0], CK.B[1]);
      g.fill('evenodd');
      for (const [nm, [i, j]] of [['A', CK.A], ['B', CK.B]]) {
        const [x, y] = q(i + 0.5, j - 0.4);
        label(g, nm, x, y, S, { c: '#222', size: 0.04 });
      }
    }
  },
  tap(x, y, st, ctx) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const d = ctx.getImageData(clamp(Math.floor(x * W), 0, W - 1), clamp(Math.floor(y * H), 0, H - 1), 1, 1).data;
    const [u, v] = CK.toB(x, y);
    let nm = '';
    if (u >= 0 && v >= 0 && u < 5 && v < 5) {
      const i = Math.floor(u), j = Math.floor(v);
      if (i === CK.A[0] && j === CK.A[1]) nm = 'A のマス: ';
      else if (i === CK.B[0] && j === CK.B[1]) nm = 'B のマス: ';
    }
    return `${nm}この点の色 RGB(${d[0]}, ${d[1]}, ${d[2]})`;
  },
  why: [
    ['sure', '画面の上では A も B も RGB(123, 123, 123) で、目に届く光の量は同じです。'],
    ['theory', '脳は「目に届いた光」ではなく「ものの表面の色」を知ろうとします。B は影の中にあるので「暗く照らされた明るいマス」、A は「明るく照らされた暗いマス」と推理し、照明の分を差し引いて見せている、という説明（明るさの恒常性）。'],
    ['sure', 'まわりのマスとの比べっこも効いています。B のまわりは濃いマス、A のまわりは薄いマスなので、B は明るく、A は暗く見えます。'],
  ],
  facts: [
    'この錯覚は「目がまちがえている」のではなく、影の中でも白い紙を白と分かるための、ふだんはとても役に立つしくみの表れです。',
    'MIT のエーデルソンが1995年に発表しました。この展示の絵は、同じ原理でこのアプリが描いたものです。',
  ],
});

// ---------- ヘルマン格子・きらめき格子 ----------
defEx({
  id: 'grid', room: 'light',
  title: 'ヘルマン格子ときらめき格子', en: 'Hermann grid / Scintillating grid',
  who: 'ルーディマル・ヘルマン（1870）／エルケ・リンゲルバッハ（1994）', where: 'ドイツ', year: '1870／1994',
  lead: '白い線の交差点に、ないはずの灰色や黒い点がちらちら見えます。',
  bg: '#000000',
  steps: [
    '格子全体をながめてください。交差点に灰色（きらめき格子では黒）の点が見えます。',
    'ある交差点をじっと見ると、そこの点は消えます。点が見えるのは、見ていない交差点だけ。',
    '「線をゆがめる」を押すと、点が見えにくくなります（2008年の発見）。',
  ],
  controls: [
    { type: 'choice', id: 'kind', label: '種類', opts: [['herm', 'ヘルマン格子'], ['scint', 'きらめき格子']], val: 'scint' },
    { type: 'toggle', id: 'wavy', label: '線をゆがめる', val: false },
    { type: 'range', id: 'cell', label: 'マスの大きさ', min: 0.07, max: 0.16, step: 0.005, val: 0.105, fmt: v => Math.round(v * 1000) / 10 + '%' },
  ],
  init(st) {},
  draw(g, S, t, st) {
    fillBg(g, S, '#000');
    const cell = S * st.cell, lw = cell * 0.2, n = Math.ceil(S / cell) + 1;
    const x0 = (S - (n - 1) * cell) / 2;
    const amp = st.wavy ? cell * 0.14 : 0, steps = 24;
    g.strokeStyle = st.kind === 'herm' ? '#ffffff' : '#808080'; g.lineWidth = lw; g.lineCap = 'butt';
    for (let k = 0; k < n; k++) {
      const p = x0 + k * cell;
      g.beginPath();
      for (let s = 0; s <= (n - 1) * steps; s++) {
        const q = x0 + s / steps * cell, w = amp * Math.sin((q - x0) / cell * TAU);
        s ? g.lineTo(q, p + w) : g.moveTo(q, p + w);
      }
      g.stroke();
      g.beginPath();
      for (let s = 0; s <= (n - 1) * steps; s++) {
        const q = x0 + s / steps * cell, w = amp * Math.sin((q - x0) / cell * TAU);
        s ? g.lineTo(p + w, q) : g.moveTo(p + w, q);
      }
      g.stroke();
    }
    if (st.kind === 'scint') {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) disc(g, x0 + i * cell, x0 + j * cell, lw * 0.72, '#ffffff');
    }
  },
  why: [
    ['sure', '点は描いていません。見ている交差点では点が消え、まわりの視野にだけ現れます。'],
    ['theory', '昔からの説明（1960年）: 目の網膜で、となりあう細胞どうしがおさえあう「側抑制」。交差点は白に四方を囲まれるので、線の途中よりも強くおさえられて暗く見える、というもの。教科書によく載っています。'],
    ['open', 'ところが、線を少しゆがめるだけで点がほとんど消えることが2008年に示されました（側抑制の説明では、ゆがめても点は残るはず）。網膜よりも先の、まっすぐな線や形を処理するところが関わると考えられていますが、くわしいしくみはまだ分かっていません。'],
  ],
  facts: [
    'ヘルマンは、音についての本の中の図（黒い四角の並び）を見ていてこの点に気づいたといわれます。',
    'きらめき格子は、白い円を置くだけで、黒い点がちかちかと強く出る変わり種。1994年に見つかりました。',
  ],
});

// ---------- カフェウォール ----------
defEx({
  id: 'cafewall', room: 'light',
  title: 'カフェウォール錯視', en: 'Café wall illusion',
  who: 'リチャード・グレゴリー、プリシラ・ハード', where: 'イギリス', year: 1979,
  lead: '横の線はすべて平行でまっすぐ。でも、くさびのようにかたむいて見えます。',
  bg: '#808080',
  steps: [
    '黒と白のタイルの間の横線が、かたむいて見えるか見てください。',
    '「定規を当てる」で、線がまっすぐなことを確かめます。',
    'すき間の明るさを真っ黒や真っ白にすると、かたむきが消えます。いちばん強いのは中間の灰色のとき。',
  ],
  controls: [
    { type: 'range', id: 'sh', label: '段のずらし', min: 0, max: 1, step: 0.02, val: 0.5, fmt: v => Math.round(v * 50) + '%' },
    { type: 'range', id: 'mg', label: 'すき間の明るさ', min: 0, max: 255, step: 1, val: 128, fmt: v => v },
    { type: 'range', id: 'mw', label: 'すき間の太さ', min: 0, max: 0.02, step: 0.001, val: 0.006, fmt: v => (v * 100).toFixed(1) + '%' },
    { type: 'toggle', id: 'ruler', label: '定規を当てる', val: false },
  ],
  init(st) {},
  draw(g, S, t, st) {
    const rows = 9, h = S / rows, w = h * 1.55, mw = S * st.mw;
    fillBg(g, S, `rgb(${st.mg},${st.mg},${st.mg})`);
    const pat = [0, 0.5, 1, 0.5];
    for (let r = 0; r < rows; r++) {
      const off = st.sh * w * pat[r % 4] - w * 2;
      for (let k = 0; off + k * w < S; k++) {
        g.fillStyle = k % 2 ? '#ffffff' : '#000000';
        g.fillRect(off + k * w, r * h + mw / 2, w, h - mw);
      }
    }
    if (st.ruler) {
      g.save(); g.strokeStyle = '#e0303a'; g.lineWidth = Math.max(1, S * 0.003);
      for (let r = 1; r < rows; r++) seg(g, 0, r * h, S, r * h);
      g.restore();
    }
  },
  why: [
    ['sure', '横線はすべてまっすぐで平行です。すき間（モルタル）の明るさが黒と白の間のときだけ強く起き、真っ黒・真っ白、太すぎるすき間では消えます。'],
    ['theory', '線の上下で「黒いタイルに接する所は暗く、白いタイルに接する所は明るく」見え、細い線の明るさの並びが、斜めの小さな模様として脳に拾われるという説明（目の初期の、向きを感じる細胞のモデルで再現できる）。'],
  ],
  facts: [
    'イギリスのブリストルにある喫茶店の壁のタイルで見つかったので、この名前があります。似た図は1897年にミュンスターベルクも報告していました。',
  ],
});
