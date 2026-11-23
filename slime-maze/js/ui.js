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
    else if (flowing) phase = settled ? '⑤ 落ち着きました（流れはつづきます）' : Model.multi(s) && !s.foods.every(f => s.reached[f]) ? '④ エサからエサへ流れながら、残りのエサを探しています' : '④ エサからエサへ流れ、遠回りの管がやせていきます';
    else if (sense) phase = '③ エサの気配に気づき、そちらへ伸びています';
    else if (s.growing) phase = onFood ? '① 伸びながら、使わない枝はやせていきます' : '① 伸びて、まわりを探っています';
    else if (Model.volume(s) > 0.5) phase = '② 伸びる先がなくなり、体が集まっていきます';
    else phase = onFood ? '② エサの上で、かたまりになっています' : '② かたまりになって、とどまっています';
    let nums = '', good = '';
    // 長さの表し方: 迷路は寒天の上の cm、日本の道路は地図の km
    const ln = v => s.g.kmPerMM ? `${Math.round(v * s.g.kmPerMM).toLocaleString()} km` : `${(v / 10).toFixed(1)} cm`;
    if (flowing && !s.blocked) {
      const len = Model.tubeLength(s), spLen = S.ui.sp ? S.ui.sp.len : null, multi = Model.multi(s);
      nums = multi ? `管の網 ${ln(len)} ／ いちばん短くつなぐ網 ${spLen != null ? ln(spLen) : '—'}`
                   : `管の長さ ${ln(len)} ／ いちばん短い道 ${spLen != null ? ln(spLen) : '—'}`;
      // 日本の陸: Tero ほか 2010 と同じ物差し（長さ・近さ・切れにくさ）で、実験の粘菌とくらべる（かっこの中が実験。全部のエサに着いてから、1時間ごとに測る）
      if ((S.mapKind === 'land' || S.mapKind === 'kanto') && multi && spLen != null && s.foods.every(f => s.reached[f]) && Metrics.netLen(s) < 3 * spLen) {   // 全部の町に着いて、膜がやせて網になったら（長さがいちばん短くつなぐ網の3倍より短く。広がっている膜は網ではなく、測るのも重い）
        if (!s._met || Math.floor(s._met.t) !== Math.floor(s.t)) s._met = { t: s.t, v: Metrics.compare(s, S.ui.sp) };
        const v = s._met.v, P = Metrics.PAPER;
        if (v.ok) good = `実験とくらべる: 長さ ${v.tl.toFixed(2)}倍（${P.tl}）・近さ ${v.md.toFixed(2)}（${P.md}）・切れにくさ ${v.ft.toFixed(2)}（${P.ft}）`;
      }
      else if (settled && spLen != null) good = multi ? `網の形が落ち着きました（いちばん短くつなぐ網の ${(len / spLen).toFixed(2)} 倍）`
        : Math.abs(len - spLen) < 0.03 * spLen ? 'いちばん短い道だけが残りました' : `いちばん短い道より ${Math.round(100 * (len / spLen - 1))}% 長い道も残っています`;
    } else if (one && (s.reached[s.foods[0]] || Model.lumpTotal(s) > 0)) {
      const V = Model.volume(s), b = Model.lumpTotal(s);
      nums = `体のうち、かたまりになっている分 ${Math.round(100 * b / Math.max(1e-9, V + b))}%`;
    }
    const clock = `経過 ${UI.clock(s.t)}` + (S.run ? '' : '（止めています）');
    const key = phase + nums + good + clock + S.run + S.speedI + S.mode + S.ui.sel + s.foods.length;
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
    const nF = s.foods.length, full = nF >= Model.MAX_FOODS;
    $('hint').textContent = S.mode === 'food'
      ? (S.ui.sel >= 0 ? '選んだエサ → 行き先を押すと動く／「エサをとる」で取る'
        : (full ? `エサは${Model.MAX_FOODS}こまで。` : 'あいた所を押す → エサを足す。') + 'エサはドラッグで動かす' + (S.mapKind !== 'maze' ? '。地図は2本指・ホイール・ドラッグで動かす' : ''))
      : 'マスのさかいめを押す → 壁ができる・消える';
    $('bDel').disabled = !(S.mode === 'food' && S.ui.sel >= 0 && nF > 1);
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
    for (const [id, k] of [['mapMaze', 'maze'], ['mapJapan', 'japan'], ['mapLand', 'land'], ['mapKanto', 'kanto']]) { $(id).classList.toggle('on', kind === k); $(id).setAttribute('aria-pressed', kind === k); }
    $('mWall').hidden = kind !== 'maze'; $('bNew').hidden = kind !== 'maze'; $('zoom').hidden = kind === 'maze'; $('lRoads').hidden = kind !== 'land' && kind !== 'kanto';
    if (kind !== 'maze') S.mode = 'food';
    const b = S.world.g.bounds;
    $('view').style.aspectRatio = `${(b.x1 - b.x0).toFixed(1)} / ${(b.y1 - b.y0).toFixed(1)}`;
    UI._last = '';
  },
  loading(on, msg) { $('phase').textContent = on ? (msg || '地図を読みこんでいます…') : ''; },

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
  addFood(c) { const s = S.s; if (s.foods.length >= Model.MAX_FOODS || s.foods.includes(c)) return false; Model.addFood(s, c); changed(); return true; },
  removeFood(i) { const s = S.s; if (s.foods.length <= 1 || i < 0) return; Model.removeFood(s, i); S.ui.sel = -1; changed(); draw(); },

  // 日本の道路の拡大・移動
  viewAll(gr) { const b = gr.bounds; return { z: 1, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 }; },
  // 画面の点 (px, py) を動かさずに、倍率を k 倍にする
  zoomAt(px, py, k) {
    const v = S.view, L = S.L; if (!v || !L) return;
    const [mx, my] = Draw.toMM(L, px, py), z = Math.max(1, Math.min(12, v.z * k)), sc = L.sc0 * z;
    v.z = z; v.cx = mx - (px - L.w / 2) / sc; v.cy = my - (py - L.h / 2) / sc;
    UI.clampView(); draw();
  },
  pan(dx, dy) { const v = S.view, L = S.L; if (!v || !L) return; v.cx -= dx / L.sc; v.cy -= dy / L.sc; UI.clampView(); draw(); },
  clampView() { const v = S.view, b = S.s.g.bounds; v.cx = Math.max(b.x0, Math.min(b.x1, v.cx)); v.cy = Math.max(b.y0, Math.min(b.y1, v.cy)); if (v.z <= 1.0001) Object.assign(v, UI.viewAll(S.s.g)); },

  init() {
    $('bRun').onclick = () => { S.run = !S.run; kick(); };
    $('bSpeed').onclick = () => { S.speedI = (S.speedI + 1) % SPEEDS.length; UI.status(); };
    $('mFood').onclick = () => { S.mode = 'food'; S.ui.sel = -1; UI.status(); draw(); };
    $('mWall').onclick = () => { S.mode = 'wall'; S.ui.sel = -1; UI.status(); draw(); };
    $('bRestart').onclick = () => restart();
    $('bNew').onclick = () => newMaze(S.seed + 1000 + Math.floor(Math.random() * 100000));
    $('mapMaze').onclick = () => { if (S.mapKind !== 'maze') newMaze(S.seed); };
    $('mapJapan').onclick = () => { if (S.mapKind !== 'japan') newJapan('japan'); };
    $('mapLand').onclick = () => { if (S.mapKind !== 'land') newJapan('land'); };
    $('mapKanto').onclick = () => { if (S.mapKind !== 'kanto') newJapan('kanto'); };
    $('cRoads').onchange = e => { S.ui.showRoads = e.target.checked; draw(); };
    $('cShort').onchange = e => { S.ui.showShortest = e.target.checked; draw(); };
    $('cChem').onchange = e => { S.ui.showChem = e.target.checked; draw(); };

    $('bDel').onclick = () => UI.removeFood(S.ui.sel);
    $('zIn').onclick = () => UI.zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1.6);
    $('zOut').onclick = () => UI.zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, 1 / 1.6);
    $('zAll').onclick = () => { S.view = UI.viewAll(S.s.g); draw(); };

    const pos = ev => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    // 指（ポインタ）ごとの位置。2本なら拡大・縮小と移動、1本でエサ以外から動かしたら移動（日本の道路のとき）
    const pts = new Map(); let down = null, pinch = null;
    const pinchState = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 }; };
    cv.addEventListener('pointerdown', ev => {
      const p = pos(ev); pts.set(ev.pointerId, p);
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 合成のイベントでは捕まえられない */ }
      if (pts.size === 2 && S.view) { pinch = pinchState(); S.ui.drag = null; down = null; return; }
      if (pts.size > 1) return;
      const h = UI.hit(...p);
      down = { h, p, moved: false };
      if (S.mode === 'food' && h) {
        const i = S.s.foods.indexOf(h.c);
        if (i >= 0) { S.ui.drag = { i, c: h.c }; kick(); }
      }
    });
    cv.addEventListener('pointermove', ev => {
      if (!pts.has(ev.pointerId)) return;
      const p = pos(ev), prev = pts.get(ev.pointerId); pts.set(ev.pointerId, p);
      if (pinch && pts.size === 2) {
        const q = pinchState();
        UI.pan(q.x - pinch.x, q.y - pinch.y); UI.zoomAt(q.x, q.y, q.d / pinch.d); pinch = q; return;
      }
      if (!down) return;
      if (Math.hypot(p[0] - down.p[0], p[1] - down.p[1]) > 6) down.moved = true;
      if (S.ui.drag) {
        const h = UI.hit(...p); if (!h) return;
        if (h.c !== S.ui.drag.c) { S.ui.drag.c = h.c; draw(); }
      } else if (S.view && down.moved) UI.pan(p[0] - prev[0], p[1] - prev[1]);   // エサ以外をドラッグ → 地図を動かす
    });
    cv.addEventListener('pointerup', ev => {
      pts.delete(ev.pointerId);
      if (pinch) { if (pts.size < 2) pinch = null; down = null; return; }
      if (!down) return;
      const h = UI.hit(...pos(ev)), d = S.ui.drag, moved = down.moved;
      if (S.mode === 'food') {
        if (d) {
          S.ui.drag = null;
          if (d.c !== S.s.foods[d.i] && !S.s.foods.includes(d.c)) { S.ui.sel = -1; UI.moveFood(d.i, d.c); }
          else S.ui.sel = S.ui.sel === d.i ? -1 : d.i;   // 動かさずに離した → 選ぶ（もう一度で外す）
        } else if (!moved && h && S.ui.sel >= 0) { const i = S.ui.sel; S.ui.sel = -1; UI.moveFood(i, h.c); }
        else if (!moved && h) UI.addFood(h.c);           // 空いた所 → エサを置く（MAX_FOODS こまで）
        draw();
      } else if (S.mode === 'wall' && h && !moved) {
        UI.toggleWall(UI.nearestEdge(h));
      }
      down = null; UI.status();
    });
    cv.addEventListener('pointercancel', ev => { pts.delete(ev.pointerId); pinch = null; S.ui.drag = null; down = null; draw(); });
    cv.addEventListener('wheel', ev => {
      if (!S.view) return;
      ev.preventDefault(); const [x, y] = pos(ev); UI.zoomAt(x, y, Math.exp(-ev.deltaY * 0.0015));
    }, { passive: false });
  },
};
window.UI = UI;
