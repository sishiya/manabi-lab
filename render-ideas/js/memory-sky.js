// ①-B 見ていないところは言葉にもどる × 冬の星空
// 星（点）はいつも見えている。注意を向けた所だけ、星が線でまとまって形（星座）になり、星の名前が出る。
// 注意がはなれると線がほどけ、「オリオン座」のような言葉だけが残る。星座はもともと、人が頭の中で星をまとめた形。
// 同じ星を「西洋の星座」と「日本の呼び名」の2通りにまとめられる（どちらも人の見立て）。
// 星の位置: 星表の値（J2000 の赤経・赤緯）を 0.1° ほどに丸めたもの。等級も丸めた値。
'use strict';
(() => {
  // [和名, 赤経(時), 赤緯(度), 等級, 色]
  const S = {
    bet: ['ベテルギウス', 5.920, 7.41, 0.5, '#ffb070'], rig: ['リゲル', 5.242, -8.20, 0.1, '#bcd4ff'], bel: ['ベラトリックス', 5.419, 6.35, 1.6],
    sai: ['サイフ', 5.796, -9.67, 2.1], aln: ['アルニタク', 5.679, -1.94, 1.8], alm: ['アルニラム', 5.603, -1.20, 1.7], min: ['ミンタカ', 5.533, -0.30, 2.2],
    mei: ['メイサ', 5.585, 9.93, 3.4],
    ald: ['アルデバラン', 4.599, 16.51, 0.9, '#ffb878'], eln: ['エルナト', 5.438, 28.61, 1.7], zta: ['', 5.627, 21.14, 3.0],
    gta: ['', 4.330, 15.63, 3.7], dta: ['', 4.382, 17.54, 3.8], eta: ['', 4.477, 19.18, 3.5], tta: ['', 4.478, 15.87, 3.4],
    alc: ['アルキオネ', 3.791, 24.11, 2.9], atl: ['', 3.820, 24.05, 3.6], ele: ['', 3.748, 24.11, 3.7], mai: ['', 3.763, 24.37, 3.9], mer: ['', 3.772, 23.95, 4.1], tay: ['', 3.753, 24.47, 4.3],
    cap: ['カペラ', 5.278, 46.00, 0.1, '#fff0c0'], mnk: ['メンカリナン', 5.992, 44.95, 1.9], tau: ['', 5.995, 37.21, 2.6], iau: ['', 4.950, 33.17, 2.7], eau: ['', 5.033, 43.82, 3.0],
    cas: ['カストル', 7.577, 31.89, 1.6], pol: ['ポルックス', 7.755, 28.03, 1.1, '#ffd9a0'], alh: ['アルヘナ', 6.629, 16.40, 1.9], meb: ['', 6.732, 25.13, 3.0], tej: ['', 6.383, 22.51, 2.9], was: ['', 7.335, 21.98, 3.5],
    pro: ['プロキオン', 7.655, 5.22, 0.4, '#fff8e0'], gom: ['ゴメイサ', 7.453, 8.29, 2.9],
    sir: ['シリウス', 6.752, -16.72, -1.5, '#dfeaff'], mir: ['ミルザム', 6.378, -17.96, 2.0], wez: ['ウェズン', 7.140, -26.39, 1.8], adh: ['アダーラ', 6.977, -28.97, 1.5], alu: ['アルドラ', 7.402, -29.30, 2.4],
  };
  // まとまり: 名前・線の束（おおまか → こまかい）。線は [星, 星, …] の折れ線
  const WEST = [
    { name: 'オリオン座', strokes: [[['aln', 'alm', 'min']], [['bet', 'aln', 'sai'], ['bel', 'min', 'rig']], [['bet', 'bel']], [['bet', 'mei', 'bel']]] },
    { name: 'おうし座', strokes: [[['ald', 'tta', 'gta', 'dta', 'eta']], [['eta', 'eln'], ['ald', 'zta']]], cluster: ['alc', 'atl', 'ele', 'mai', 'mer', 'tay'] },
    { name: 'ぎょしゃ座', strokes: [[['cap', 'mnk', 'tau']], [['tau', 'eln', 'iau', 'cap']], [['cap', 'eau']]] },
    { name: 'ふたご座', strokes: [[['cas', 'pol']], [['cas', 'meb', 'tej'], ['pol', 'was', 'alh']]] },
    { name: 'こいぬ座', strokes: [[['pro', 'gom']]] },
    { name: 'おおいぬ座', strokes: [[['mir', 'sir', 'wez', 'adh']], [['wez', 'alu']]] },
  ];
  const JAPAN = [
    { name: '鼓星', strokes: [[['bet', 'aln', 'sai', 'rig', 'min', 'bel', 'bet']]], note: 'オリオン座を雅楽の鼓に見立てた呼び名' },
    { name: '三つ星', strokes: [[['aln', 'alm', 'min']]] },
    { name: '昴', strokes: [], cluster: ['alc', 'atl', 'ele', 'mai', 'mer', 'tay'] },
    { name: '冬の大三角', strokes: [[['bet', 'sir', 'pro', 'bet']]] },
  ];
  const JNAMES = { bet: '平家星', rig: '源氏星' };   // 赤いベテルギウスと青白いリゲルを、平家と源氏の旗の色に

  const RA0 = 5.85, DEC0 = 9;
  let set = 'west', groups = [], gaze = null, normal = false, fit = { s: 1, cx: 0, cy: 0 };
  const HOLD = 4, RISE = 5, TAU_HELD = 7, TAU_OTHER = 1.6;

  const sky = k => { const [, ra, de] = S[k]; return [-(ra - RA0) * 15 * Math.cos(de * Math.PI / 180), de - DEC0]; };
  function build() {
    groups = (set === 'west' ? WEST : JAPAN).map(gr => {
      const keys = new Set(gr.strokes.flat(2).concat(gr.cluster || []));
      const pts = [...keys].map(sky), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      return { ...gr, keys: [...keys], c: [cx, cy], r: Math.max(4, ...pts.map(p => Math.hypot(p[0] - cx, p[1] - cy))), m: 0 };
    });
  }
  function resize(w, h) { const s = Math.min(w / 70, h / 82); fit = { s, cx: w / 2, cy: h / 2 }; }
  const P = ([x, y]) => [fit.cx + x * fit.s, fit.cy - y * fit.s];
  const toSky = (x, y) => [(x - fit.cx) / fit.s, -(y - fit.cy) / fit.s];

  function step(dt) {
    if (normal) return false;
    const rank = groups.map((_, i) => i).sort((a, b) => groups[b].m - groups[a].m), held = new Set(rank.slice(0, HOLD));
    let moving = false;
    groups.forEach((gr, i) => {
      let a = 0;
      if (gaze) { const d = Math.max(0, Math.hypot(gaze[0] - gr.c[0], gaze[1] - gr.c[1]) - gr.r * 0.6); a = Math.exp(-(d * d) / 36); }
      const dm = RISE * a * (1 - gr.m) - (1 - a) * gr.m / (held.has(i) ? TAU_HELD : TAU_OTHER);
      const m2 = Math.min(1, Math.max(0, gr.m + dm * dt)); if (Math.abs(m2 - gr.m) > 1e-4) moving = true; gr.m = m2;
    });
    return moving;
  }

  function draw(g, w, h) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#04070d'); bg.addColorStop(1, '#0b1626');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // 星（いつも見えている）
    for (const k in S) {
      const [, , , mag, col] = S[k], [x, y] = P(sky(k)), r = Math.max(0.8, 3.6 - mag * 0.75) * Math.min(1.4, fit.s / 5 + 0.5);
      const gl = g.createRadialGradient(x, y, 0, x, y, r * 3.2); gl.addColorStop(0, col || '#f4f8ff'); gl.addColorStop(0.3, (col || '#f4f8ff') + '66'); gl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 3.2, 0, Math.PI * 2); g.fill();
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const gr of groups) {
      const m = normal ? 1 : gr.m, N = Math.max(1, gr.strokes.length), shown = m * (N + 1);
      // 線（おおまか → こまかい）
      gr.strokes.forEach((st, k) => {
        const a = Math.min(1, Math.max(0, shown - k)); if (a <= 0) return;
        g.strokeStyle = `rgba(143,211,255,${0.75 * a})`; g.lineWidth = 1.6;
        for (const line of st) { g.beginPath(); line.forEach((key, i) => { const [x, y] = P(sky(key)); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
      });
      if (gr.cluster && m > 0.3) {   // 星団は丸でかこむ
        const pts = gr.cluster.map(k => P(sky(k))), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        g.strokeStyle = `rgba(143,211,255,${0.6 * Math.min(1, (m - 0.3) * 3)})`; g.setLineDash([3, 4]); g.beginPath(); g.arc(cx, cy, 2.2 * fit.s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
      // 星の名前（よく見ているときだけ）
      if (m > 0.7) {
        g.font = "500 11px 'Zen Kaku Gothic New', sans-serif"; g.textAlign = 'left'; g.textBaseline = 'middle';
        for (const k of gr.keys) {
          const nm = set === 'japan' && JNAMES[k] ? JNAMES[k] : S[k][0]; if (!nm) continue;
          const [x, y] = P(sky(k)); g.fillStyle = `rgba(232,240,244,${Math.min(1, (m - 0.7) / 0.2) * 0.85})`; g.fillText(nm, x + 7, y - 7);
        }
      }
      // まとまりの名前（言葉）: 注意がはなれると残る
      const wa = Math.min(1, Math.max(0, (0.38 - m) / 0.2)), la = normal ? 0.9 : Math.max(wa, m > 0.6 ? 0.5 : 0);
      if (la > 0) {
        const [x, y] = P(gr.c); g.font = `700 ${Math.max(14, Math.min(22, fit.s * 3))}px 'Zen Kaku Gothic New', sans-serif`;
        g.textAlign = 'center'; g.fillStyle = `rgba(255,201,90,${0.9 * la})`; g.fillText(gr.name, x, y + (m > 0.6 ? gr.r * fit.s * 0.9 + 14 : 0));
      }
    }
    if (gaze && !normal) { const [x, y] = P(gaze); g.setLineDash([5, 6]); g.strokeStyle = 'rgba(143,211,255,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 7 * fit.s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    RI.hud(`形 ${groups.filter(x => x.m > 0.3).length} / ${groups.length}（※ 点線の円＝目の位置）`);
  }

  function pointer(type, x, y, e) {
    if (type === 'leave') { if (e.pointerType !== 'touch') gaze = null; return; }
    gaze = toSky(x, y - (e && e.pointerType === 'touch' ? 56 : 0));
  }

  RI.add({
    id: 'memory-sky', group: 'memory', label: '冬の星空',
    lead: '星はいつも見えています。目を向けた所だけ星が<b>線でまとまって形</b>になり、はなすと<b>「オリオン座」という言葉</b>にもどります。',
    how: `<p>星座は、空にある形ではなく、人が星をまとめて見た形です。ここでは、注意を向けた所の星だけが線でまとまり、星の名前も出ます。注意がはなれると、線から先にほどけて、まとまりの名前だけが残ります（Rensink 2000 の考えにならった演出）。</p>
      <p>「日本の呼び名」にすると、同じ星が別の形にまとまります。オリオン座は、雅楽の鼓に見立てて「鼓星」とも呼ばれました。赤いベテルギウスと青白いリゲルは、平家と源氏の旗の色から「平家星」「源氏星」とも呼ばれます。</p>
      <p>簡単にしているところ: 星の位置は星表の値を丸めたもので、星の見かけの大きさは明るさの目印です。秒数は見えるように遅くした推定です。</p>`,
    init() { build(); }, resize,
    controls(root) {
      const b = RI.buttons(root);
      const t1 = RI.toggle(b, '西洋の星座', set === 'west', () => { set = 'west'; build(); t1.setAttribute('aria-pressed', true); t2.setAttribute('aria-pressed', false); });
      const t2 = RI.toggle(b, '日本の呼び名', set === 'japan', () => { set = 'japan'; build(); t2.setAttribute('aria-pressed', true); t1.setAttribute('aria-pressed', false); });
      const b2 = RI.buttons(root);
      RI.toggle(b2, 'ふつうの描き方（星図）', normal, v => { normal = v; });
    },
    step, draw, pointer,
  });
  window.__reidSky = { get groups() { return groups; }, set gaze(v) { gaze = v; } };
})();
