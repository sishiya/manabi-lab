// レールガンのしくみ — 時間のグラフ（電流と速さ）と、エネルギーの行き先の帯
'use strict';
(function () {
  const C = () => DRAW.C;
  let geo = null;   // さわった位置から時刻へ

  function draw(cv, t) {
    const g = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = SIM.S, H = S.hist, B = SIM.base();
    g.fillStyle = '#101b25'; g.fillRect(0, 0, w, h);
    const PL = 46, PR = 50, PT = 26, PB = 26, gw = w - PL - PR, gh = h - PT - PB;
    const tMax = S.tEnd * 1e3;
    const Imax = Math.max(B.limit * 1.1, S.sum.Imax * 1.1) / 1e6;
    const vMax = Math.max(1, Math.ceil(S.sum.v / 1000 * 1.15 * 2) / 2);
    const X = tm => PL + tm / tMax * gw, YI = I => PT + gh - I / Imax * gh, YV = v => PT + gh - v / vMax * gh;
    geo = { PL, gw, tMax };
    g.strokeStyle = '#2a3e50'; g.lineWidth = 1; g.font = "11px 'IBM Plex Mono', monospace"; g.fillStyle = '#a3b4bf';
    g.textBaseline = 'middle';
    for (let k = 0; k <= 4; k++) {
      const y = PT + gh * k / 4; g.beginPath(); g.moveTo(PL, y); g.lineTo(PL + gw, y); g.stroke();
      g.textAlign = 'right'; g.fillStyle = C().cur; g.fillText((Imax * (1 - k / 4)).toFixed(1), PL - 6, y);
      g.textAlign = 'left'; g.fillStyle = C().field; g.fillText((vMax * (1 - k / 4)).toFixed(1), PL + gw + 6, y);
    }
    g.fillStyle = '#a3b4bf'; g.textAlign = 'center';
    const tStep = tMax > 6 ? 2 : 1;
    for (let tm = 0; tm <= tMax + 1e-9; tm += tStep) g.fillText(`${tm}`, X(tm), PT + gh + 12);
    g.textAlign = 'right'; g.fillText('ミリ秒', PL + gw, PT + gh + 12);
    g.textAlign = 'left'; g.fillStyle = C().cur; g.fillText('電流 MA', 4, 10);
    g.textAlign = 'right'; g.fillStyle = C().field; g.fillText('速さ km/秒', w - 4, 10);
    // レールが耐えられる電流の目安
    g.setLineDash([4, 4]); g.strokeStyle = '#ff7a6b88'; g.beginPath(); g.moveTo(PL, YI(B.limit / 1e6)); g.lineTo(PL + gw, YI(B.limit / 1e6)); g.stroke(); g.setLineDash([]);
    g.textAlign = 'left'; g.fillStyle = '#ff9a8b'; g.fillText(S.cfg.preset === 'atla' ? 'レールの限界の目安 2 MA' : '論文でおさえた電流 4.5 MA', PL + 4, YI(B.limit / 1e6) - 8);
    // 線
    g.lineWidth = 2;
    g.strokeStyle = C().cur; g.beginPath(); H.forEach((q, i) => { const x = X(q.t * 1e3), y = YI(q.I / 1e6); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.strokeStyle = C().field; g.beginPath(); H.forEach((q, i) => { const x = X(q.t * 1e3), y = YV(q.v / 1e3); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    if (S.run.out) g.lineTo(X(tMax), YV(S.sum.v / 1e3));
    g.stroke();
    // 砲口
    if (S.run.out) {
      const xo = X(S.run.t * 1e3);
      g.strokeStyle = '#a3b4bf66'; g.beginPath(); g.moveTo(xo, PT); g.lineTo(xo, PT + gh); g.stroke();
      g.fillStyle = '#a3b4bf'; g.textAlign = 'left'; g.fillText('砲口を出る', xo + 4, PT + 8);
    }
    // いまの時刻
    const xc = X(t * 1e3);
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xc, PT); g.lineTo(xc, PT + gh); g.stroke();
  }

  function timeAt(px) { if (!geo) return 0; return Math.max(0, Math.min(1, (px - geo.PL) / geo.gw)) * geo.tMax / 1e3; }

  // エネルギーの行き先（はじめにコンデンサにあった分を 100%）
  const PARTS = [
    { k: 'Ecap', col: '#9be38f', ja: 'コンデンサ' },
    { k: 'mag', col: '#7fd4ff', ja: '磁場（コイル・レール）' },
    { k: 'KE', col: '#ffc95a', ja: '弾の運動' },
    { k: 'Q', col: '#ff9f5a', ja: '抵抗の熱' },
    { k: 'Wf', col: '#c58bff', ja: '摩擦' },
  ];
  function energy(el, o) {
    const E0 = SIM.S.sum.E0, v = { Ecap: o.Ecap, mag: o.EL + o.Eg, KE: o.KE, Q: o.Q, Wf: o.Wf };
    const out = SIM.S.run.out && o.after >= 0;
    if (!el.firstChild) {
      el.innerHTML = '<div class="ebar"></div><div class="elegend"></div>';
      const bar = el.firstChild, lg = el.lastChild;
      for (const p of PARTS) {
        const s = document.createElement('span'); s.style.background = p.col; s.dataset.k = p.k; bar.appendChild(s);
        const l = document.createElement('span'); l.className = 'eitem'; l.dataset.k = p.k; lg.appendChild(l);
      }
    }
    const bar = el.firstChild, lg = el.lastChild;
    PARTS.forEach((p, i) => {
      const f = Math.max(0, v[p.k] / E0);
      bar.children[i].style.width = (f * 100).toFixed(2) + '%';
      const lab = out && p.k === 'mag' ? '砲口の火花と配線の熱（残った磁場）' : p.ja;
      lg.children[i].innerHTML = `<i style="background:${p.col}"></i>${lab} <b>${(f * 100).toFixed(0)}%</b>`;
    });
  }

  window.GRAPH = { draw, timeAt, energy, PARTS };
})();
