// ③-B 影響の光 × 食物網 — 生きものの丸の明るさ＝その種が少し減ったら、ほかの種の数がどれだけ変わるか
// 式: 一般化ロトカ・ヴォルテラ dxᵢ/dt = xᵢ (rᵢ + Σⱼ Aᵢⱼ xⱼ)。Aᵢᵢ < 0（自分で増えすぎをおさえる。植物も）、
//   食べる側 Aᵢⱼ = +0.5 a、食べられる側 Aⱼᵢ = −a。値は仮（この画面のために作った生態系）。
//   10種すべてが生きのこる平衡 x* = −A⁻¹ r で、少しずらしても元にもどる（安定）ことを確かめた（DEVNOTES）。
// 感度: 1匹あたりの死にやすさを少し（0.01）上げつづけたときの、平衡の変わり方 Δx* = −0.01 × (−A⁻¹) の列（Yodzis 1988 の「押しつづける」ずらし）。
//   明るさ＝ほかの種の数の変わり方（割合）の合計。選んだ種については、ほかの種が増えるか（青）減るか（赤）を出す。
// 抜く: その種を 0 にして、式をそのまま時間で進める。数が 0.005 を下回った種はいなくなる（連鎖して消える種が出る）。
'use strict';
(() => {
  const SP = [
    { name: '草', x: 300, y: 530, col: [110, 200, 120], r: 1.0 },
    { name: '木の実', x: 700, y: 530, col: [150, 200, 90], r: 0.8 },
    { name: 'バッタ', x: 160, y: 390, col: [220, 210, 90], r: -0.1 },
    { name: 'ウサギ', x: 420, y: 390, col: [230, 190, 120], r: -0.1 },
    { name: 'ネズミ', x: 700, y: 390, col: [200, 170, 130], r: -0.1 },
    { name: 'カエル', x: 130, y: 240, col: [120, 190, 160], r: -0.04 },
    { name: '小鳥', x: 520, y: 260, col: [140, 180, 230], r: -0.1 },
    { name: 'ヘビ', x: 300, y: 130, col: [200, 150, 90], r: -0.02 },
    { name: 'キツネ', x: 800, y: 230, col: [235, 140, 70], r: -0.05 },
    { name: 'タカ', x: 600, y: 90, col: [230, 110, 90], r: -0.03 },
  ];
  const D = [0.10, 0.10, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05];
  const EATS = [[2, 0, 0.06], [3, 0, 0.05], [4, 0, 0.03], [4, 1, 0.05], [5, 2, 0.08], [6, 2, 0.03], [6, 1, 0.04], [7, 5, 0.07], [7, 4, 0.05], [7, 6, 0.03], [8, 3, 0.05], [8, 4, 0.04], [9, 7, 0.04], [9, 6, 0.03], [9, 4, 0.03], [9, 3, 0.02]];
  const n = SP.length, EFF = 0.5, PRESS = 0.01, GONE = 0.005, W = 1000, H = 620;
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? -D[i] : 0));
  for (const [p, q, a] of EATS) { A[p][q] += EFF * a; A[q][p] -= a; }
  const R = SP.map(s => s.r);

  let x = [], alive = [], sel = -1, normal = false, eq = null, sens = null, simT = 0, settling = false, gone = [], noteEl = null;
  let fit = { s: 1, ox: 0, oy: 0 };

  function solve(M, b) {   // ガウスの消去法
    const m = b.length, a = M.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < m; c++) {
      let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      [a[c], a[p]] = [a[p], a[c]];
      for (let r = 0; r < m; r++) { if (r === c) continue; const f = a[r][c] / a[c][c]; for (let k = c; k <= m; k++) a[r][k] -= f * a[c][k]; }
    }
    return a.map((r, i) => r[m] / r[i]);
  }
  // いま生きている種だけで平衡と感度を計算
  function analyze() {
    const idx = alive.map((v, i) => v ? i : -1).filter(i => i >= 0), sub = idx.map(i => idx.map(j => A[i][j]));
    const xs = solve(sub, idx.map(i => -R[i]));
    eq = new Array(n).fill(0); idx.forEach((i, k) => eq[i] = xs[k]);
    if (xs.some(v => v <= 0)) { sens = null; return; }   // 平衡が成り立たない（いまは動いている途中）
    // 種 i の死にやすさを PRESS 上げる → Δx = sub⁻¹ · (PRESS eᵢ)
    sens = new Array(n).fill(null);
    idx.forEach((i, k) => {
      const e = idx.map((_, kk) => kk === k ? PRESS : 0), dx = solve(sub, e);
      const resp = new Array(n).fill(0); idx.forEach((j, kk) => resp[j] = dx[kk] / xs[kk]);
      let tot = 0; idx.forEach(j => { if (j !== i) tot += Math.abs(resp[j]); });
      sens[i] = { resp, tot };
    });
  }
  function reset() { alive = new Array(n).fill(true); gone = []; analyze(); x = eq.slice(); settling = false; sel = -1; }

  function step(dt) {
    if (!settling) return false;
    const h = 0.05, k = Math.round(Math.min(dt, 0.05) * 600 / h);   // 画面の1秒＝式の時間 600
    for (let s = 0; s < k; s++) {
      const dx = x.map((v, i) => alive[i] ? v * (R[i] + A[i].reduce((a, c, j) => a + c * x[j], 0)) : 0);
      x = x.map((v, i) => Math.max(0, v + h * dx[i])); simT += h;
      x.forEach((v, i) => { if (alive[i] && v < GONE) { alive[i] = false; x[i] = 0; gone.push(SP[i].name); } });
    }
    analyze();
    const still = sens && x.every((v, i) => !alive[i] || Math.abs(v - eq[i]) / eq[i] < 0.002);
    if (still || simT > 6000) { settling = false; analyze(); showNote(); }
    return settling;
  }

  function resize(w, h) { const s = Math.min(w / W, h / H); fit = { s, ox: (w - W * s) / 2, oy: (h - H * s) / 2 }; }
  const P = i => [fit.ox + SP[i].x * fit.s, fit.oy + SP[i].y * fit.s];
  const rad = i => (12 + 13 * Math.sqrt(Math.max(0, x[i]))) * Math.max(0.6, fit.s);

  function draw(g, w, h) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0c1712'); bg.addColorStop(1, '#13261c'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const mx = sens ? Math.max(...sens.filter(Boolean).map(s => s.tot)) : 1;
    // 食べる・食べられるの線（太さ＝流れの量）
    for (const [p, q, a] of EATS) {
      if (!alive[p] || !alive[q]) continue;
      const [x1, y1] = P(q), [x2, y2] = P(p), f = a * x[p] * x[q];
      g.strokeStyle = `rgba(200,220,200,${0.15 + Math.min(0.4, f * 0.6)})`; g.lineWidth = 1 + Math.min(6, f * 8);
      g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2 + (y2 - y1) * 0.08, (y1 + y2) / 2, x2, y2); g.stroke();
    }
    // 光（影響の大きさ）
    if (!normal && sens) {
      g.save(); g.globalCompositeOperation = 'lighter';
      SP.forEach((s, i) => {
        if (!alive[i] || !sens[i]) return;
        let b, c;
        if (sel >= 0 && sens[sel]) { if (i === sel) return; const v = sens[sel].resp[i]; b = Math.min(1, Math.abs(v) / 0.25); c = v > 0 ? [120, 190, 255] : [255, 110, 90]; }
        else { b = Math.pow(sens[i].tot / mx, 0.7); c = [255, 190, 90]; }
        const [cx, cy] = P(i), Rg = rad(i) * 3.2, gr = g.createRadialGradient(cx, cy, rad(i) * 0.6, cx, cy, Rg);
        gr.addColorStop(0, `rgba(${c},${0.55 * b})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, Rg, 0, Math.PI * 2); g.fill();
      });
      g.restore();
    }
    // 生きもの
    SP.forEach((s, i) => {
      const [cx, cy] = P(i), r = rad(i);
      if (!alive[i]) {
        g.setLineDash([4, 5]); g.strokeStyle = 'rgba(163,180,191,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 14 * Math.max(0.6, fit.s), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(163,180,191,0.6)';
      } else {
        g.fillStyle = `rgb(${s.col})`; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
        if (i === sel) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); }
        g.fillStyle = 'rgba(232,240,244,0.95)';
      }
      g.font = `700 ${Math.max(12, 15 * fit.s)}px 'Zen Kaku Gothic New', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(s.name, cx, cy + Math.max(r, 14) + 3);
      if (!normal && sel >= 0 && sens && sens[sel] && alive[i] && i !== sel) {
        const v = sens[sel].resp[i] * 100; g.font = `500 ${Math.max(11, 12 * fit.s)}px 'IBM Plex Mono', monospace`;
        g.fillStyle = v > 0 ? '#8fd3ff' : '#ff9a8a'; g.fillText(`${v > 0 ? '+' : ''}${v.toFixed(1)}%`, cx, cy + Math.max(r, 14) + 20);
      }
    });
    RI.hud(settling ? '数が落ちつくまで計算しています…' : sel >= 0 ? `「${SP[sel].name}」が少し減ると: 青＝増える種・赤＝減る種` : '明るい種ほど、少し減ったときにほかの種へ大きく響きます');
  }

  function showNote() {
    if (!noteEl) return;
    if (gone.length) { noteEl.innerHTML = `いなくなった種: <b>${gone.join('・')}</b>${gone.length > 1 ? '（はじめの1種のあと、連鎖して消えました）' : ''}`; return; }
    if (sel < 0) { noteEl.innerHTML = '生きものを押すと、その種が少し減ったときに、ほかの種がどう変わるかが出ます。'; return; }
    const r = sens && sens[sel] ? sens[sel].resp : null;
    const up = r ? SP.filter((s, j) => alive[j] && j !== sel && r[j] > 0.005).map(s => s.name) : [];
    noteEl.innerHTML = `「${SP[sel].name}」が少し減ると、増える種: <b>${up.length ? up.join('・') : 'なし'}</b>`;
  }
  function pointer(type, px, py) {
    if (type !== 'up' || settling) return;
    let best = -1, bd = 40; SP.forEach((s, i) => { const [cx, cy] = P(i), d = Math.hypot(px - cx, py - cy) - rad(i); if (d < bd) { bd = d; best = i; } });
    sel = best >= 0 && alive[best] ? best : -1; showNote();
  }

  RI.add({
    id: 'influence-foodweb', group: 'influence', label: '食物網',
    lead: '生きものの明るさは、<b>その種が少し減ったら、ほかの種がどれだけ変わるか</b>です。押して選び、「いなくする」で確かめられます。',
    how: `<p>草から始まる、食べる・食べられるのつながり（食物網）です。丸の大きさは数、線の太さは食べられる量です。それぞれの種の「死にやすさ」を少しだけ上げつづけたとき、ほかの種の数がどれだけ変わるかを計算し、その合計を明るさにしています。選んだ種については、ほかの種が増える（青）か減る（赤）かを出します。食べる側が減ると、食べられる側だけでなく、そのまた先の種まで増えたり減ったりします。</p>
      <p>「いなくする」を押すと、その種を 0 にして、数の変わり方を式どおりに時間で進めます。少ない種は連鎖していなくなることがあります。1つの種がいなくなると、全体が大きく変わる種を「要の種」と呼びます（Paine 1966）。たとえばタカをいなくすると、ヘビが増えて、食べられるカエルが消えます。</p>
      <p>簡単にしているところ: 10種と、その数・食べる量はこの画面のために作った仮の値です。式は一般化ロトカ・ヴォルテラの式で、季節や場所のちがい、病気などは入っていません。感度の考え方は Yodzis 1988 にならいました。</p>`,
    init() { reset(); }, resize,
    controls(root) {
      const b = RI.buttons(root);
      RI.toggle(b, 'ふつうの描き方（くらべる）', normal, v => { normal = v; });
      const b2 = RI.buttons(root);
      RI.action(b2, '選んだ種をいなくする', () => {
        if (sel < 0 || settling) { if (noteEl) noteEl.innerHTML = '先に<b>生きものを押して選んで</b>ください。'; return; }
        alive[sel] = false; x[sel] = 0; gone.push(SP[sel].name); sel = -1; settling = true; simT = 0; if (noteEl) noteEl.innerHTML = '計算しています…';
      });
      RI.action(b2, '全部もどす', () => { reset(); showNote(); });
      noteEl = RI.note(root, ''); noteEl.style.minHeight = '3.2em'; showNote();
    },
    step, draw, pointer,
  });
  window.__reidFoodweb = { get x() { return x; }, get sens() { return sens; }, get alive() { return alive; }, select(i) { sel = i; }, A, R };
})();
