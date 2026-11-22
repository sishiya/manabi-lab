// 画面の操作: ボタン・さわり方（エサを置く・動かす／道をふさぐ・ひらく）・いまの状態の表示
// main.js より先に読む（S・kick などは押されたときに使う）
'use strict';

const $ = id => document.getElementById(id);

const UI = {
  _last: '',
  clock(h) { const m = Math.floor(h * 60 + 1e-6); return m < 60 ? `${m}分` : `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, '0')}分`; },

  // いまの段階と数字（場所は先にとってあるので、文が変わっても高さは変わらない）
  status() {
    const s = S.s; if (!s) return;
    const one = s.foods.length < 2, flowing = Model.flowing(s), settled = Model.settled(s);
    let phase;
    if (s.blocked) phase = 'エサとエサのあいだに通れる道がありません。壁をひらいてください';
    else if (one && s.growing) phase = s.reached[s.foods[0]] ? '① エサにたどりつきました。伸びる先へ流れ、止まった枝はやせていきます' : '① かけらが伸びて迷路を探り、行き止まりの枝はやせていきます';
    else if (one) phase = Model.volume(s) > 0.5 ? '② 伸びる先がなくなり、体がエサの上に集まっていきます' : '② 体がエサの上に集まりました。粘液の跡がうすれると（1日と仮定）また探しに出ます';
    else if (!flowing) {
      const k = s.foods.findIndex(f => !s.reached[f]);
      let sense = false; for (let i = 0; k >= 0 && i < s.g.N; i++) if (s.reached[i] && s.cs[k][i] >= Model.C_TH) { sense = true; break; }
      phase = sense ? '③ 新しいエサの物質に気づいて、そちらへ伸びています'
        : s.growing ? '③ まわりへ伸びて探しています。新しいエサのことは、まだ知りません'
        : '③ 新しいエサの物質はまだとどいていません。粘液の跡がうすれると探しに出ます';
    }
    else if (settled) phase = '⑤ 落ち着いています（流れはつづいています）';
    else phase = '④ エサからエサへ流れ、流れの少ない管がやせていきます';
    if (!S.run) phase = '一時停止中 — ' + phase;
    let nums = '', good = '';
    if (flowing && !s.blocked) {
      const len = Model.tubeLength(s), spLen = S.ui.sp ? S.ui.sp.len : null, cm = v => (v / 10).toFixed(1);
      nums = `管の長さ ${cm(len)} cm ／ いちばん短い道 ${spLen != null ? cm(spLen) : '—'} cm`;
      if (settled && spLen != null && Math.abs(len - spLen) < 0.02 * spLen) good = 'いちばん短い道だけが残りました';
    } else if (one && s.reached[s.foods[0]]) {
      const V = Model.volume(s), b = s.blob[0] || 0;
      nums = `管に残っている体 ${Math.round(100 * V / Math.max(1e-9, V + b))}% ／ エサの上に集まった体 ${Math.round(100 * b / Math.max(1e-9, V + b))}%`;
    }
    const clock = `経過 ${UI.clock(s.t)}`;
    const key = phase + nums + good + clock + S.run + S.speedI + S.mode;
    if (key === UI._last) return; UI._last = key;
    $('phase').textContent = phase;
    $('clock').textContent = clock;
    $('nums').textContent = nums;
    $('good').textContent = good;
    $('good').classList.toggle('on', !!good);
    $('bRun').textContent = S.run ? '⏸ 止める' : '▶ 進める';
    $('bSpeed').textContent = `速さ ${SPEEDS[S.speedI].label}`;
    $('bSpeed').setAttribute('aria-pressed', S.speedI > 0);
    for (const [id, md] of [['mFood', 'food'], ['mWall', 'wall']]) { $(id).classList.toggle('on', S.mode === md); $(id).setAttribute('aria-pressed', S.mode === md); }
    $('hint').textContent = S.mode === 'food'
      ? '空いたマスを押すとエサを置く（2つまで）。エサはドラッグで動かす'
      : 'マスとマスのさかいめを押すと、壁ができる・なくなる';
  },

  // 画面の点 → いちばん近い点（地図の外・遠すぎるなら null）と、mm の位置
  hit(x, y) {
    const L = S.L, gr = S.s.g; if (!L) return null;
    const [mx, my] = Draw.toMM(L, x, y), b = gr.bounds;
    if (mx < b.x0 || my < b.y0 || mx > b.x1 || my > b.y1) return null;
    const c = Graph.nearest(gr, mx, my, gr.unit * 0.8);
    return c < 0 ? null : { c, mx, my };
  },
  // いちばん近いマスのさかいめ（迷路のときだけ。内側の辺だけ）
  nearestEdge(h) {
    const gr = S.s.g, m = gr.maze; if (!m) return -1;
    const fx = h.mx / gr.cellMM, fy = h.my / gr.cellMM, cx = Math.floor(fx), cy = Math.floor(fy), u = fx - cx, v = fy - cy;
    const cand = [];
    if (cx > 0) cand.push([u, cy * (m.W - 1) + cx - 1]);
    if (cx < m.W - 1) cand.push([1 - u, cy * (m.W - 1) + cx]);
    if (cy > 0) cand.push([v, m.H * (m.W - 1) + (cy - 1) * m.W + cx]);
    if (cy < m.H - 1) cand.push([1 - v, m.H * (m.W - 1) + cy * m.W + cx]);
    cand.sort((a, b) => a[0] - b[0]);
    return cand.length ? cand[0][1] : -1;
  },

  toggleWall(e) {
    const s = S.s, gr = s.g;
    if (e < 0) return;
    // ふさぐ: その通路の管はなくなる。ひらく: 新しい通路（粘液の跡なし）。粘菌がとなりにいれば、伸びて入っていける
    if (gr.open[e]) { if (s.D[e] > 0) Model.toBlob(s, Model.L(s, e) * Math.sqrt(s.D[e])); gr.open[e] = 0; s.D[e] = 0; s.fa[e] = 0; s.fb[e] = 0; }   // ふさいだ所の体はエサの上へ
    else { gr.open[e] = 1; s.D[e] = 0; s.fa[e] = 0; s.fb[e] = 0; s.trailT[e] = -1e9; }
    Draw._paths = null;
    changed();
  },
  moveFood(i, c) { const s = S.s; if (s.foods.includes(c)) return; s.foods[i] = c; Model.resetField(s, i); changed(); },
  addFood(c) { const s = S.s; if (s.foods.length >= 2 || s.foods.includes(c)) return false; s.foods.push(c); Model.resetField(s, s.foods.length - 1); changed(); return true; },

  init() {
    $('bRun').onclick = () => { S.run = !S.run; kick(); };
    $('bSpeed').onclick = () => { S.speedI = (S.speedI + 1) % SPEEDS.length; UI.status(); };
    $('mFood').onclick = () => { S.mode = 'food'; S.ui.sel = -1; UI.status(); draw(); };
    $('mWall').onclick = () => { S.mode = 'wall'; S.ui.sel = -1; UI.status(); draw(); };
    $('bRestart').onclick = () => restart();
    $('bNew').onclick = () => newMaze(S.seed + 1000 + Math.floor(Math.random() * 100000));
    $('cShort').onchange = e => { S.ui.showShortest = e.target.checked; draw(); };
    $('cChem').onchange = e => { S.ui.showChem = e.target.checked; draw(); };

    const pos = ev => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    let down = null;
    cv.addEventListener('pointerdown', ev => {
      const h = UI.hit(...pos(ev)); if (!h) return;
      down = { h };
      if (S.mode === 'food') {
        const i = S.s.foods.indexOf(h.c);
        if (i >= 0) { S.ui.drag = { i, c: h.c }; cv.setPointerCapture(ev.pointerId); kick(); }
      }
    });
    cv.addEventListener('pointermove', ev => {
      if (!S.ui.drag) return;
      const h = UI.hit(...pos(ev)); if (!h) return;
      if (h.c !== S.ui.drag.c) { S.ui.drag.c = h.c; draw(); }
    });
    cv.addEventListener('pointerup', ev => {
      const h = UI.hit(...pos(ev)), d = S.ui.drag;
      if (S.mode === 'food') {
        if (d) {
          S.ui.drag = null;
          if (d.c !== S.s.foods[d.i] && !S.s.foods.includes(d.c)) { S.ui.sel = -1; UI.moveFood(d.i, d.c); }
          else S.ui.sel = S.ui.sel === d.i ? -1 : d.i;   // 動かさずに離した → 選ぶ（もう一度で外す）
        } else if (h && S.ui.sel >= 0) { const i = S.ui.sel; S.ui.sel = -1; UI.moveFood(i, h.c); }
        else if (h) UI.addFood(h.c);                     // 空いたマス → エサを置く（2つまで）
        draw();
      } else if (S.mode === 'wall' && h && down) {
        UI.toggleWall(UI.nearestEdge(h));
      }
      down = null; UI.status();
    });
    cv.addEventListener('pointercancel', () => { S.ui.drag = null; down = null; draw(); });
  },
};
window.UI = UI;
