// Hormone chart: juvenile hormone and ecdysone (shape only), switch genes, stages. x follows the slider (tToU).

const CH = { left: 124, right: 14 };
const CH_COL = { jh: '#ffb347', ecd: '#7fd3ff', kr: '#ffb347', br: '#c9a2ff', e93: '#2fc495' };

function drawChart(cv, t) {
  const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const x0 = CH.left, x1 = W - CH.right;
  const X = tt => x0 + tToU(tt) * (x1 - x0);
  const narrow = W < 520;
  const yTop = 18, yBot = Math.max(60, H * 0.42);
  const rowH = 11, rows = [yBot + 10, yBot + 10 + rowH + 3, yBot + 10 + 2 * (rowH + 3)];
  const yStage = rows[2] + rowH + 6, hStage = 16;
  g.font = '11px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textBaseline = 'middle';

  // the stretched part of the axis (after eclosion)
  g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(X(T_ECL), yTop - 6, X(T_MAX) - X(T_ECL), yStage + hStage - yTop + 6);

  // curves
  g.fillStyle = '#738578'; g.textAlign = 'right';
  g.fillText(L('ホルモン', 'Hormones'), x0 - 8, yTop + 4);
  g.font = '10px "Zen Kaku Gothic New", sans-serif';
  g.fillText(L('（量の形の目安）', '(shape of levels)'), x0 - 8, yTop + 18);
  const curve = (f, col, fill) => {
    g.beginPath();
    for (let i = 0; i <= 400; i++) { const tt = uToT(i / 400); const x = X(tt), y = yBot - f(tt) * (yBot - yTop); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = col; g.lineWidth = 2; g.stroke();
    if (fill) { g.lineTo(x1, yBot); g.lineTo(x0, yBot); g.closePath(); g.fillStyle = fill; g.fill(); }
  };
  curve(hormoneEcd, CH_COL.ecd, 'rgba(127,211,255,.10)');
  curve(hormoneJH, CH_COL.jh, 'rgba(255,179,71,.10)');
  g.strokeStyle = 'rgba(190,230,200,.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, yBot + 0.5); g.lineTo(x1, yBot + 0.5); g.stroke();
  // legend in the plot
  g.textAlign = 'left'; g.font = '11px "Zen Kaku Gothic New", sans-serif';
  const l1 = narrow ? L('エクジソン', 'Ecdysone') : L('エクジソン（脱皮・変態の合図）', 'Ecdysone (signal to molt and transform)'), l2 = narrow ? L('幼若ホルモン', 'Juvenile hormone') : L('幼若ホルモン（幼虫のままでいる合図）', 'Juvenile hormone (signal to stay a larva)');
  g.fillStyle = CH_COL.ecd; g.fillText(l1, x0 + 4, yTop - 6 + 2);
  g.fillStyle = CH_COL.jh; g.fillText(l2, x0 + 4 + g.measureText(l1).width + 16, yTop - 6 + 2);

  // genes
  const genes = [['Kr-h1', L('幼虫のまま', 'stay larva'), geneKr, CH_COL.kr], ['broad', L('蛹へ', 'to pupa'), geneBr, CH_COL.br], ['E93', L('成虫へ', 'to adult'), geneE93, CH_COL.e93]];
  genes.forEach(([nm, sub, f, col], r) => {
    const y = rows[r];
    g.fillStyle = '#a9b8ad'; g.textAlign = 'right';
    g.font = 'italic 10.5px "IBM Plex Mono", monospace'; g.fillText(nm, x0 - 66, y + rowH / 2);
    g.font = '10.5px "Zen Kaku Gothic New", sans-serif'; g.fillText(sub, x0 - 6, y + rowH / 2);
    for (let i = 0; i < 200; i++) {
      const ta = uToT(i / 200), tb = uToT((i + 1) / 200), v = f((ta + tb) / 2);
      if (v < 0.03) continue;
      g.globalAlpha = 0.15 + 0.85 * v; g.fillStyle = col;
      g.fillRect(X(ta), y, X(tb) - X(ta) + 0.5, rowH);
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(190,230,200,.12)'; g.strokeRect(x0 + 0.5, y + 0.5, x1 - x0 - 1, rowH - 1);
  });
  g.textAlign = 'right'; g.fillStyle = '#738578'; g.font = '10px "Zen Kaku Gothic New", sans-serif';
  g.fillText(L('スイッチの遺伝子', 'Switch genes'), x0 - 6, rows[0] - 8);

  // stages
  const stCol = ['#4f7a3a', '#5f7f45', '#7a7a48', '#8a6f40', '#3f6a55', '#7a5a8a', '#4a5a7a'];
  STAGES.forEach((s, i) => {
    const a = X(Math.max(s.t0, T_MIN)), b = X(Math.min(s.t1, T_MAX));
    if (b <= a) return;
    g.fillStyle = stCol[i]; g.globalAlpha = 0.55; g.fillRect(a, yStage, b - a - 1, hStage); g.globalAlpha = 1;
    const label = s.name.replace(/（.*）/, '').replace(/ \(.*\)/, '');
    g.font = '10.5px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#eef3ee';
    if (g.measureText(label).width < b - a - 4) g.fillText(label, (a + b) / 2, yStage + hStage / 2 + 0.5);
  });
  g.textAlign = 'right'; g.fillStyle = '#738578'; g.fillText(L('時期', 'Stage'), x0 - 6, yStage + hStage / 2);

  // day ticks
  g.fillStyle = '#738578'; g.font = '10px "IBM Plex Mono", monospace'; g.textAlign = 'center';
  const ty = yStage + hStage + 10;
  if (ty < H - 2) {
    // tick labels, skipping any that would touch the previous one
    const ticks = [];
    for (let d = T_MIN; d <= T_ECL; d++) ticks.push([d, d === 0 ? 'P0' : d === T_ECL ? L('羽化', 'Emerge') : d === TL.wander ? 'W0' : String(d)]);
    ticks.push([T_ECL + 100 * MIN, L('+100分', '+100 min')], [T_ECL + 6 / 24, L('+6時間', '+6 h')], [T_MAX, L('+1.5日', '+1.5 d')]);
    let right = -1e9;
    ticks.forEach(([tt, lab]) => {
      const x = X(tt), w = g.measureText(lab).width;
      const cx = Math.min(x, W - w / 2 - 2);
      g.fillRect(x, yStage + hStage, 1, 3);
      if (cx - w / 2 < right + 6) return;
      g.fillText(lab, cx, ty);
      right = cx + w / 2;
    });
  }

  // now
  const nx = X(t);
  g.strokeStyle = '#eef3ee'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(nx, yTop - 8); g.lineTo(nx, yStage + hStage + 2); g.stroke();
  [[hormoneEcd, CH_COL.ecd], [hormoneJH, CH_COL.jh]].forEach(([f, col]) => {
    g.fillStyle = col; g.beginPath(); g.arc(nx, yBot - f(t) * (yBot - yTop), 3.5, 0, 6.283); g.fill();
  });
}

function chartXToT(cv, X) {
  const x0 = CH.left, x1 = cv.clientWidth - CH.right;
  return uToT((X - x0) / (x1 - x0));
}
