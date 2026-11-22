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
    const k2 = s.foods.findIndex(f => !s.reached[f]);
    let sense = false; for (let i = 0; k2 >= 0 && i < s.g.N; i++) if (s.reached[i] && s.cs[k2][i] >= Model.C_TH) { sense = true; break; }
    const onFood = s.foods.some(f => s.reached[f]);
    if (s.blocked) phase = 'エサへの道が壁でふさがっています';
    else if (flowing) phase = settled ? '⑤ 落ち着きました（流れはつづきます）' : '④ エサからエサへ流れ、遠回りの管がやせていきます';
    else if (sense) phase = '③ エサの気配に気づき、そちらへ伸びています';
    else if (s.growing) phase = onFood ? '① 伸びながら、使わない枝はやせていきます' : '① 伸びて、まわりを探っています';
    else if (Model.volume(s) > 0.5) phase = '② 伸びる先がなくなり、体が集まっていきます';
    else phase = onFood ? '② エサの上で、かたまりになっています' : '② かたまりになって、とどまっています';
    let nums = '', good = '';
    if (flowing && !s.blocked) {
      const len = Model.tubeLength(s), spLen = S.ui.sp ? S.ui.sp.len : null, cm = v => (v / 10).toFixed(1);
      nums = `管の長さ ${cm(len)} cm ／ いちばん短い道 ${spLen != null ? cm(spLen) : '—'} cm`;
      if (settled && spLen != null) good = Math.abs(len - spLen) < 0.03 * spLen ? 'いちばん短い道だけが残りました' : `いちばん短い道より ${Math.round(100 * (len / spLen - 1))}% 長い道も残っています`;
    } else if (one && (s.reached[s.foods[0]] || Model.lumpTotal(s) > 0)) {
      const V = Model.volume(s), b = Model.lumpTotal(s);
      nums = `体のうち、かたまりになっている分 ${Math.round(100 * b / Math.max(1e-9, V + b))}%`;
    }
    const clock = `経過 ${UI.clock(s.t)}` + (S.run ? '' : '（止めています）');
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
      ? (S.mapKind === 'japan' ? 'エサ（赤）をドラッグ → 別の町へ動かす' : 'エサをドラッグ → 動かす（エサを押してから、行き先を押してもよい）')
      : 'マスのさかいめを押す → 壁ができる・消える';
  },

  // 画面の点 → いちばん近い点（地図の外・遠すぎるなら null）と、mm の位置
  hit(x, y) {
    const L = S.L, gr = S.s.g; if (!L) return null;
    const [mx, my] = Draw.toMM(L, x, y), b = gr.bounds;
    if (mx < b.x0 || my < b.y0 || mx > b.x1 || my > b.y1) return null;
    const c = Graph.nearest(gr, mx, my, Math.max(gr.unit * 0.8, 22 / L.sc));   // 指でも押せるように、画面で 22px 以内
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

  // 地図を切りかえたとき: 迷路だけの操作（壁・新しい迷路）は日本の道路ではかくす。絵の縦横の比を地図に合わせる
  setMap(kind) {
    S.mapKind = kind;
    for (const [id, k] of [['mapMaze', 'maze'], ['mapJapan', 'japan']]) { $(id).classList.toggle('on', kind === k); $(id).setAttribute('aria-pressed', kind === k); }
    $('mWall').hidden = kind !== 'maze'; $('bNew').hidden = kind !== 'maze';
    if (kind !== 'maze') S.mode = 'food';
    const b = S.s ? S.world.g.bounds : S.world.g.bounds;
    $('view').style.aspectRatio = `${(b.x1 - b.x0).toFixed(1)} / ${(b.y1 - b.y0).toFixed(1)}`;
    UI._last = '';
  },
  loading(on) { $('phase').textContent = on ? '地図を読みこんでいます…' : ''; },

  toggleWall(me) {
    const s = S.s, gr = s.g, m = gr.maze;
    if (me < 0 || !m) return;
    // 迷路の通路（マスのさかいめ）を開け閉めし、細かい網の線をそれに合わせる。ふさいだ所の管の体はかたまりへ。新しく通れる線は跡なし
    const was = Uint8Array.from(gr.open);
    m.open[me] = m.open[me] ? 0 : 1;
    if (gr.cross) Graph.syncMaze(gr);
    for (let e = 0; e < gr.nE; e++) {
      if (was[e] && !gr.open[e]) { if (s.D[e] > 0) Model.toBlob(s, Model.L(s, e) * Math.sqrt(s.D[e])); s.D[e] = 0; s.fa[e] = 0; s.fb[e] = 0; }
      else if (!was[e] && gr.open[e]) { s.D[e] = 0; s.fa[e] = 0; s.fb[e] = 0; s.trailT[e] = -1e9; }
    }
    Draw._paths = null; s.dvol = null;
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
    $('mapMaze').onclick = () => { if (S.mapKind !== 'maze') newMaze(S.seed); };
    $('mapJapan').onclick = () => { if (S.mapKind !== 'japan') newJapan(); };
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
