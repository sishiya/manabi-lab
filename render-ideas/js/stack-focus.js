// ④-B 積み重ね × ピント送り — 細胞を 28 枚の輪切りにして積み、ピントの合った1枚だけくっきり、ほかはぼかして薄くする
// 見え方は3つ: 「積んで見る」（ななめ・スタッキング）/「顕微鏡（ふつう）」＝真上から、ピントの外の層もぼやけて重なる（広視野の蛍光顕微鏡）
//   /「顕微鏡（共焦点）」＝ピントの層だけ（ピンホールでピントの外の光を切る。Pawley 2006）。
// 細胞の形は架空の模式。色は蛍光の染め分けでよくある組み合わせ（核＝青、ミトコンドリア＝赤、膜と小胞＝緑）。
// ぼけは「小さく縮めてから引きのばす」近似で、本物の点像の広がり（PSF）ではない。
'use strict';
(() => {
  const NZ = 28, SZ = 220, LV = 5;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  // だ円体 [cx, cy, cz, rx, ry, rz, 回転, 色, 形]
  const OBJ = [[0, 0, 0, 1, 0.85, 0.7, 0, 'g', 'ring'], [0.15, 0.05, 0.05, 0.38, 0.32, 0.3, 0.3, 'b', 'fill'], [0.22, 0.1, 0.12, 0.1, 0.1, 0.1, 0, 'B', 'fill']];
  for (let i = 0; i < 16; i++) {
    let x, y, z; do { x = (rnd() - 0.5) * 1.6; y = (rnd() - 0.5) * 1.3; z = (rnd() - 0.5) * 0.9; } while ((x / 0.85) ** 2 + (y / 0.7) ** 2 + (z / 0.55) ** 2 > 1 || ((x - 0.15) / 0.48) ** 2 + ((y - 0.05) / 0.42) ** 2 + ((z - 0.05) / 0.4) ** 2 < 1);
    OBJ.push([x, y, z, 0.11 + rnd() * 0.05, 0.04, 0.045, rnd() * Math.PI, 'r', 'fill']);
  }
  for (let i = 0; i < 7; i++) {
    let x, y, z; do { x = (rnd() - 0.5) * 1.5; y = (rnd() - 0.5) * 1.2; z = (rnd() - 0.5) * 0.8; } while ((x / 0.8) ** 2 + (y / 0.65) ** 2 + (z / 0.5) ** 2 > 1 || ((x - 0.15) / 0.5) ** 2 + ((y - 0.05) / 0.44) ** 2 <= 1);   // 核にかからない所へ
    const r = 0.05 + rnd() * 0.05; OBJ.push([x, y, z, r, r, r, 0, 'G', 'ring']);
  }
  const COL = { g: '90,230,120', G: '120,255,160', b: '70,120,255', B: '160,190,255', r: '255,80,70' };
  let slices = null, focus = 14, mode = 'stack', sweep = true, ft = 0;
  const v = Stack.view({ rot: 0.3, tilt: 0.45, auto: 0.1 });
  let fit = { s: 1, cx: 0, cy: 0 };

  function build() {
    slices = [];
    for (let k = 0; k < NZ; k++) {
      const z = -0.75 + 1.5 * k / (NZ - 1), c = document.createElement('canvas'); c.width = c.height = SZ;
      const g = c.getContext('2d'), sc = SZ / 2.3; g.translate(SZ / 2, SZ / 2); g.scale(sc, sc);
      for (const [cx, cy, cz, rx, ry, rz, a, col, kind] of OBJ) {
        const d = (z - cz) / rz; if (Math.abs(d) >= 1) continue;
        const f = Math.sqrt(1 - d * d); g.beginPath(); g.ellipse(cx, cy, rx * f, ry * f, a, 0, Math.PI * 2);
        if (kind === 'fill') { g.fillStyle = `rgba(${COL[col]},0.85)`; g.fill(); }
        else { g.strokeStyle = `rgba(${COL[col]},0.9)`; g.lineWidth = 0.035; g.stroke(); g.fillStyle = `rgba(${COL[col]},0.06)`; g.fill(); }
      }
      // ぼけの段階（縮めた絵を引きのばして描く）
      const lv = [c];
      for (let l = 1; l < LV; l++) { const s2 = Math.max(4, SZ >> (l + 1)), d = document.createElement('canvas'); d.width = d.height = s2; d.getContext('2d').drawImage(c, 0, 0, s2, s2); lv.push(d); }
      slices.push(lv);
    }
  }
  function resize(w, h) { const s = Math.min(w / 3.0, h / (mode === 'stack' ? 3.6 : 2.5)); fit = { s, cx: w / 2, cy: mode === 'stack' ? h * 0.6 : h / 2 }; }

  function step(dt) {
    if (sweep) { ft += dt * 0.35; focus = (NZ - 1) * (0.5 - 0.5 * Math.cos(ft)); syncSlider(); }
    if (mode === 'stack') Stack.spin(v, dt);
    return sweep || (mode === 'stack' && (v.auto > 0 || !!v.drag));
  }

  function draw(g, w, h) {
    if (!slices) build();
    resize(w, h);
    g.fillStyle = '#020407'; g.fillRect(0, 0, w, h);
    const f = Math.round(focus), H = 1.1;
    g.save(); g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true;
    for (let k = 0; k < NZ; k++) {
      const d = Math.abs(k - focus), lvl = Math.min(LV - 1, Math.round(d * 0.55)), img = slices[k][lvl];
      if (mode === 'confocal' && d > 0.75) continue;
      const al = mode === 'confocal' ? 1 : d < 0.5 ? 1 : Math.min(0.5, 0.7 * Math.exp(-d / 6)) * (mode === 'stack' ? 0.8 : 0.45);
      if (mode === 'stack') Stack.slice(g, v, img, (k / (NZ - 1)) * H, fit.s, fit.cx, fit.cy, 2.3, al);
      else { g.globalAlpha = al; g.drawImage(img, fit.cx - 1.15 * fit.s, fit.cy - 1.15 * fit.s, 2.3 * fit.s, 2.3 * fit.s); g.globalAlpha = 1; }
    }
    g.restore();
    if (mode === 'stack') {   // ピントの面（ガラスのふち）
      const z = (f / (NZ - 1)) * H, c = [[-1.15, -1.15], [1.15, -1.15], [1.15, 1.15], [-1.15, 1.15]].map(([x, y]) => Stack.at(v, x, y, z, fit.s, fit.cx, fit.cy));
      g.strokeStyle = 'rgba(255,201,90,0.7)'; g.lineWidth = 1.2; g.beginPath(); c.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.stroke();
    }
    RI.hud(`ピント: ${f + 1} / ${NZ} 枚目　${mode === 'stack' ? '（黄色い枠がピントの面）' : mode === 'wide' ? 'ふつうの顕微鏡: ピントの外の層もぼやけて重なる' : '共焦点: ピントの層だけ'}`);
  }

  let slider = null, modeBtns = [], sweepBtn = null;
  function syncSlider() { if (slider) slider.value = focus.toFixed(1); }
  function setMode(m) { mode = m; modeBtns.forEach(([b, k]) => b.setAttribute('aria-pressed', k === m)); }

  RI.add({
    id: 'stack-focus', group: 'stack-time', label: 'ピント送り（細胞）',
    lead: '細胞を <b>28 枚の輪切り</b>にして積み、<b>ピントの合った1枚だけ</b>くっきり描きます。顕微鏡の見え方にも切りかえられます。',
    how: `<p>ふつうのスタッキングは、どの輪切りも同じくっきりさで描きます。ここでは、顕微鏡でピントを上下に送るように、ピントの合った1枚だけをくっきり、ほかは離れているほどぼかして薄く描きます。</p>
      <p>「顕微鏡（ふつう）」は、真上から見たときの見え方です。ピントの外の層の光も、ぼやけて重なって見えます（広視野の蛍光顕微鏡）。「顕微鏡（共焦点）」は、小さな穴（ピンホール）でピントの外の光を切る顕微鏡で、ピントの層だけがくっきり見えます。共焦点の輪切りを積みなおすと立体がつくれます（Pawley 2006）。</p>
      <p>簡単にしているところ: 細胞の形は架空の模式で、色は蛍光の染め分けでよくある組み合わせ（核＝青、ミトコンドリア＝赤、膜＝緑）です。ぼけは本物の光の広がり方（PSF）ではなく、絵を縮めて引きのばす近似です。</p>`,
    resize, init() { build(); },
    controls(root) {
      const b = RI.buttons(root);
      modeBtns = [['stack', '積んで見る'], ['wide', '顕微鏡（ふつう）'], ['confocal', '顕微鏡（共焦点）']].map(([k, nm]) => [RI.toggle(b, nm, mode === k, () => setMode(k)), k]);
      const b2 = RI.buttons(root);
      sweepBtn = RI.toggle(b2, 'ピントを自動で送る', sweep, x => { sweep = x; });
      slider = RI.slider(root, { label: 'ピント', min: 0, max: NZ - 1, step: 0.1, value: focus, fmt: x => `${Math.round(x) + 1} 枚目`, oninput: x => { focus = x; sweep = false; sweepBtn.setAttribute('aria-pressed', false); } });
    },
    step, draw,
    pointer(type, x, y) { if (mode === 'stack') Stack.pointer(v, type, x, y); },
  });
})();
