// ③ 影響の光 — 明るさを「光の量」ではなく「そこを弱めたら全体がどれだけ変わるか」で決める
// 外す前提: 明るさは、当たる光の量で決まる。
// かわりに: トラス橋の部材ごとの感度（コンプライアンスの割合 2U_e/C。truss.js）を光の強さにして、橋そのものを光源として描く。
//   光は川の水にも映り、まわりも照らす（演出）。部材を押すと本当に抜けて、光（力の通り道）が組みかわる。
'use strict';
(() => {
  const MAG = 80;                 // たわみの絵の倍率
  const WX0 = -4, WX1 = 28, WY0 = -7, WY1 = 8, WATER = -3.2;
  let truckX = 9, removed = new Set(), res = null, base = null, normal = false;
  let fit = { s: 1, ox: 0, oy: 0 }, noteEl = null, drag = null, downAt = null, sliderEl = null;

  function recompute() {
    res = Truss.solve(truckX, removed);
  }
  function resize(w, h) {
    const s = Math.min(w / (WX1 - WX0), (h - 10) / (WY1 - WY0));
    fit = { s, ox: (w - (WX1 - WX0) * s) / 2 - WX0 * s, oy: (h + (WY1 - WY0) * s) / 2 + WY0 * s };
  }
  const X = x => fit.ox + x * fit.s, Y = y => fit.oy - y * fit.s;
  function pos(i) {
    const [x, y] = Truss.nodes[i];
    if (!res || !res.ok) return [X(x), Y(y)];
    return [X(x + res.u[i * 2] * MAG), Y(y + res.u[i * 2 + 1] * MAG)];
  }
  function shares() {
    if (!res || !res.ok) return null;
    return res.U.map(U => 2 * U / res.C);
  }
  const ramp = b => { // 暗い青 → 琥珀 → 白
    const c0 = [58, 90, 120], c1 = [255, 170, 60], c2 = [255, 244, 220];
    const t = Math.min(1, b), mix = (a, c, k) => a.map((v, j) => Math.round(v + (c[j] - v) * k));
    return t < 0.6 ? mix(c0, c1, t / 0.6) : mix(c1, c2, (t - 0.6) / 0.4);
  };

  function draw(g, w, h) {
    g.clearRect(0, 0, w, h);
    const sh = shares(), mx = sh ? Math.max(...sh) : 1;
    const bri = e => sh ? Math.pow(sh[e] / mx, 0.6) : 0;
    // 背景: 岸・川・遠くの丘
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.fillStyle = '#101a24'; g.fillRect(X(WX0), Y(WATER), (WX1 - WX0) * fit.s, (WATER - WY0) * fit.s);
    g.strokeStyle = 'rgba(163,180,191,0.25)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(X(WX0), Y(5.5)); g.quadraticCurveTo(X(6), Y(7.6), X(13), Y(6)); g.quadraticCurveTo(X(20), Y(4.6), X(WX1), Y(6.6)); g.stroke();
    g.fillStyle = '#1e2d3b';
    g.beginPath(); g.moveTo(X(WX0), Y(0)); g.lineTo(X(0), Y(0)); g.lineTo(X(1.5), Y(WY0)); g.lineTo(X(WX0), Y(WY0)); g.fill();
    g.beginPath(); g.moveTo(X(WX1), Y(0)); g.lineTo(X(24), Y(0)); g.lineTo(X(22.5), Y(WY0)); g.lineTo(X(WX1), Y(WY0)); g.fill();
    g.strokeStyle = 'rgba(143,211,255,0.18)';
    for (let k = 0; k < 6; k++) { const yy = WATER - 0.5 - k * 0.6; g.beginPath(); g.moveTo(X(2 + k * 0.4), Y(yy)); g.lineTo(X(22 - k * 0.3), Y(yy)); g.stroke(); }

    const collapsed = res && !res.ok;
    // 光がまわりを照らす（演出）
    if (!normal && sh) {
      g.globalCompositeOperation = 'lighter';
      Truss.members.forEach((m, e) => {
        if (removed.has(e) || bri(e) < 0.08) return;
        const [x1, y1] = pos(m.a), [x2, y2] = pos(m.b), cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, R = 5 * fit.s;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R), [r, gg, b] = ramp(bri(e));
        gr.addColorStop(0, `rgba(${r},${gg},${b},${0.10 * bri(e)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(cx - R, cy - R, R * 2, R * 2);
      });
      g.globalCompositeOperation = 'source-over';
    }
    // 部材
    const drawMembers = (mirror, alphaK) => {
      Truss.members.forEach((m, e) => {
        let [x1, y1] = pos(m.a), [x2, y2] = pos(m.b);
        if (mirror) { const wy = Y(WATER); y1 = 2 * wy - y1; y2 = 2 * wy - y2; }
        if (removed.has(e)) {
          if (mirror) return;
          g.setLineDash([4, 6]); g.strokeStyle = 'rgba(163,180,191,0.35)'; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); return;
        }
        if (normal || collapsed) {
          g.strokeStyle = collapsed ? `rgba(240,120,110,${0.8 * alphaK})` : `rgba(232,240,244,${0.9 * alphaK})`; g.lineWidth = 3;
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); return;
        }
        const b = bri(e), [r, gg, bb] = ramp(b);
        g.globalCompositeOperation = 'lighter';
        for (const [wd, al] of [[26, 0.05], [14, 0.10], [6, 0.32]]) {
          g.strokeStyle = `rgba(${r},${gg},${bb},${al * b * alphaK})`; g.lineWidth = wd;
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        }
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = `rgba(${r},${gg},${bb},${(0.35 + 0.65 * b) * alphaK})`; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      });
    };
    // 水に映る光
    g.save(); g.beginPath(); g.rect(X(1.2), Y(WATER), (21.6) * fit.s, (WATER - WY0) * fit.s); g.clip();
    drawMembers(true, 0.3); g.restore();
    drawMembers(false, 1);
    // 支点
    g.fillStyle = 'rgba(232,240,244,0.7)';
    for (const i of [0, 6]) { const [x, y] = pos(i); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 8, y + 12); g.lineTo(x + 8, y + 12); g.fill(); }
    { const [x, y] = pos(6); g.fillStyle = '#14202c'; g.strokeStyle = 'rgba(232,240,244,0.7)'; g.lineWidth = 1.5;   // 右はしは ころ
      for (const dx of [-4, 4]) { g.beginPath(); g.arc(x + dx, y + 15, 3, 0, Math.PI * 2); g.fill(); g.stroke(); } }
    // トラック（床の上。たわみに合わせて下げる）
    const k = Math.min(5, Math.floor(truckX / 4)), t = truckX / 4 - k, [ax, ay] = pos(k), [bx, by] = pos(k + 1);
    const tx = ax + (bx - ax) * t, ty = ay + (by - ay) * t, tw = 6 * fit.s, th = 2.6 * fit.s;
    g.fillStyle = 'rgba(143,211,255,0.28)'; g.strokeStyle = 'rgba(143,211,255,0.9)'; g.lineWidth = 1.5;   // 半透明（うしろの光る部材を隠さない）
    g.beginPath(); g.rect(tx - tw / 2, ty - th - 0.5 * fit.s, tw * 0.72, th); g.rect(tx + tw * 0.25, ty - th * 0.75 - 0.5 * fit.s, tw * 0.25, th * 0.75); g.fill(); g.stroke();
    g.fillStyle = '#14202c';
    for (const wx of [-0.38, 0, 0.38]) { g.beginPath(); g.arc(tx + wx * tw, ty - 0.45 * fit.s, 0.45 * fit.s, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(232,240,244,0.8)'; g.font = "500 12px 'Zen Kaku Gothic New', sans-serif"; g.textAlign = 'center';
    g.fillText('20 t', tx - tw * 0.14, ty - th / 2 - 0.5 * fit.s + 4);

    if (collapsed) RI.hud('崩れます（部材が足りず、橋が動ける形になった）');
    else if (res) RI.hud(`トラックの下のたわみ ${(Truss.sag(res, truckX) * 1000).toFixed(1)} mm（絵では ${MAG} 倍）`);
  }

  function setNote(h) { if (noteEl) noteEl.innerHTML = h; }
  function toggleMember(e) {
    const before = res && res.ok ? res : null, sh = shares();
    if (removed.has(e)) { removed.delete(e); recompute(); setNote(`「${Truss.members[e].kind}」をもどしました。`); return; }
    removed.add(e); recompute();
    const name = Truss.members[e].kind;
    if (!res.ok) { setNote(`「${name}」を抜くと<b>崩れます</b>。もう一度押すともどります。`); return; }
    if (!before) { setNote(`「${name}」を抜きました。`); return; }
    const pred = sh[e] * 100, act = (res.C - before.C) / before.C * 100;
    setNote(`「${name}」を抜きました。全体のたわみやすさ　光の強さ <b>${pred.toFixed(0)}%</b> → 実際の増え方 <b>+${act.toFixed(0)}%</b>`
      + (act > pred * 2 ? '<br>光は「少し弱めたとき」の値なので、まるごと抜くとそれより大きく増えます。' : ''));
  }
  function brightest() {
    const sh = shares(); if (!sh) return;
    let best = -1; sh.forEach((v, e) => { if (!removed.has(e) && (best < 0 || v > sh[best])) best = e; });
    if (best >= 0) toggleMember(best);
  }

  function hitMember(x, y, tol) {
    let best = -1, bd = tol;
    Truss.members.forEach((m, e) => {
      const [x1, y1] = pos(m.a), [x2, y2] = pos(m.b), dx = x2 - x1, dy = y2 - y1;
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  }
  function pointer(type, x, y, e) {
    const wx = (x - fit.ox) / fit.s, wy = (fit.oy - y) / fit.s;
    if (type === 'down') {
      downAt = { x, y };
      drag = Math.abs(wx - truckX) < 3.5 && wy > -1 && wy < 3.5 ? 'truck' : null;
    }
    if (type === 'drag' && drag === 'truck') {
      truckX = Math.round(Math.max(0, Math.min(24, wx)) * 2) / 2; recompute();
      if (sliderEl) { sliderEl.value = truckX; sliderEl.dispatchEvent(new Event('input')); }
    }
    if (type === 'up') {
      if (!drag && downAt && Math.hypot(x - downAt.x, y - downAt.y) < 10) {
        const m = hitMember(x, y, e && e.pointerType === 'touch' ? 22 : 12);
        if (m >= 0) toggleMember(m);
      }
      drag = null; downAt = null;
    }
  }

  RI.add({
    id: 'influence', label: 'トラス橋',
    lead: '橋の部材の明るさは、<b>そこを弱めたら橋全体がどれだけたわみやすくなるか</b>です。トラックを動かし、部材を押して抜いてみてください。',
    how: `<p>ふつうの絵では、明るさは当たる光の量で決まります。ここでは、部材をほんの少し弱めたときに、橋全体のたわみやすさ（かかる重さ × その点のたわみ の合計＝コンプライアンス）がどれだけ増えるかの割合を、明るさにしています。この割合は、その部材にたまるひずみエネルギーに比例し、全部の部材で足すと 100% になります（Bendsøe &amp; Sigmund 2003）。</p>
      <p>明るさは「いまトラックがいる場所」での値です。部材を押すと本当に抜いて計算し直し、光（力の通り道）が別の部材へ移ります。光の強さからの予想は「少しだけ弱めたとき」の値なので、まるごと抜いたときの実際の増え方とはずれます。</p>
      <p>簡単にしているところ: 2次元・ピン接合・まっすぐな部材・小さなたわみ（線形）で計算しています。押される部材が曲がって折れる「座屈」は計算していません。鋼の値（E = 200 GPa、断面積 0.005〜0.010 m²）と床の重さ（節点ごとに 40 kN）は代表値です。たわみは絵では ${MAG} 倍にしています。水に映る光とまわりを照らす光は演出です。</p>`,
    init() { recompute(); },
    resize,
    controls(root) {
      const b = RI.buttons(root);
      RI.toggle(b, 'ふつうの描き方（くらべる）', normal, v => { normal = v; });
      const b2 = RI.buttons(root);
      RI.action(b2, 'いちばん明るい部材を抜く', brightest);
      RI.action(b2, '全部もどす', () => { removed.clear(); recompute(); setNote('全部もどしました。'); });
      sliderEl = RI.slider(root, { label: 'トラックの位置', min: 0, max: 24, step: 0.5, value: truckX, fmt: v => `${v} m`, oninput: v => { truckX = v; recompute(); } });
      noteEl = RI.note(root, '部材を押すと抜けます（もう一度押すともどります）。');
    },
    step() { return false; },
    draw, pointer,
  });
  window.__reidInfluence = { Truss, get res() { return res; }, removed, toggleMember, recompute };
})();
