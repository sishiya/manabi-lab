// 画面の操作: ボタン・さわり方（エサを動かす／道をふさぐ・ひらく）・いまの状態の表示
// main.js より先に読む（S・kick などは押されたときに使う）
'use strict';

const $ = id => document.getElementById(id);

const UI = {
  _last: '',
  // いまの段階と数字（場所は先にとってあるので、文が変わっても高さは変わらない）
  status() {
    const s = S.s; if (!s) return;
    let phase, nums = '', good = '';
    const spLen = S.ui.sp ? S.ui.sp.length : null;
    if (s.spread) phase = '① 粘菌が迷路いっぱいに広がっています';
    else if (s.blocked) phase = 'エサとエサのあいだに、通れる道がありません。壁をひらいてください';
    else if (S.done) phase = '③ 落ち着きました';
    else phase = S.run ? '② 流れの少ない管がやせていきます' : '一時停止中';
    if (!s.spread && !s.blocked) {
      const len = Model.tubeLength(s);
      nums = `管の長さ ${len.toFixed(1)} マス分 ／ いちばん短い道 ${spLen ?? '—'} マス`;
      if (S.done && spLen != null && Math.abs(len - spLen) < 0.5) good = 'いちばん短い道だけが残りました';
    } else if (s.spread) nums = 'まだ流れの計算は始まっていません';
    const key = phase + nums + good + S.run + S.speed + S.mode;
    if (key === UI._last) return; UI._last = key;
    $('phase').textContent = phase;
    $('nums').textContent = nums;
    $('good').textContent = good;
    $('good').classList.toggle('on', !!good);
    $('bRun').textContent = S.run ? '⏸ 止める' : '▶ 進める';
    $('bSpeed').textContent = `速さ ×${S.speed}`;
    $('bSpeed').setAttribute('aria-pressed', S.speed > 1);
    for (const [id, md] of [['mFood', 'food'], ['mWall', 'wall']]) { $(id).classList.toggle('on', S.mode === md); $(id).setAttribute('aria-pressed', S.mode === md); }
    $('hint').textContent = S.mode === 'food'
      ? 'エサをドラッグして動かす（エサを押してから、行き先のマスを押してもよい）'
      : 'マスとマスのさかいめを押すと、壁ができる・なくなる';
  },

  // 画面の点 → マス（迷路の外なら -1）と、マスの中の位置（0〜1）
  hit(x, y) {
    const L = S.L, m = S.s.m; if (!L) return null;
    const fx = (x - L.ox) / L.cs, fy = (y - L.oy) / L.cs;
    if (fx < 0 || fy < 0 || fx >= m.W || fy >= m.H) return null;
    return { c: Math.floor(fy) * m.W + Math.floor(fx), fx, fy };
  },
  // いちばん近いマスのさかいめ（内側の辺だけ）
  nearestEdge(h) {
    const m = S.s.m, cx = Math.floor(h.fx), cy = Math.floor(h.fy), u = h.fx - cx, v = h.fy - cy;
    const cand = [];
    if (cx > 0) cand.push([u, cy * (m.W - 1) + cx - 1]);
    if (cx < m.W - 1) cand.push([1 - u, cy * (m.W - 1) + cx]);
    if (cy > 0) cand.push([v, m.H * (m.W - 1) + (cy - 1) * m.W + cx]);
    if (cy < m.H - 1) cand.push([1 - v, m.H * (m.W - 1) + cy * m.W + cx]);
    cand.sort((a, b) => a[0] - b[0]);
    return cand.length ? cand[0][1] : -1;
  },

  toggleWall(e) {
    const s = S.s, m = s.m;
    if (e < 0) return;
    if (m.open[e]) { m.open[e] = 0; s.D[e] = 0; }
    else { m.open[e] = 1; s.D[e] = s.spread ? 0 : Model.FLOOR; } // 通路ができても、そこにはまだ管がない（式の下限の細さから始まる）
    changed();
  },
  moveFood(i, c) {
    const s = S.s; if (s.foods.includes(c)) return;
    s.foods[i] = c; changed();
  },

  init() {
    $('bRun').onclick = () => {
      if (S.run) S.run = false; else { S.run = true; S.done = false; }
      kick();
    };
    $('bSpeed').onclick = () => { S.speed = S.speed === 1 ? 4 : 1; UI.status(); };
    $('mFood').onclick = () => { S.mode = 'food'; S.ui.sel = -1; UI.status(); draw(); };
    $('mWall').onclick = () => { S.mode = 'wall'; S.ui.sel = -1; UI.status(); draw(); };
    $('bRestart').onclick = () => restart();
    $('bNew').onclick = () => newMaze(S.seed + 1000 + Math.floor(Math.random() * 100000));
    $('cShort').onchange = e => { S.ui.showShortest = e.target.checked; draw(); };

    const pos = ev => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    let down = null;
    cv.addEventListener('pointerdown', ev => {
      const h = UI.hit(...pos(ev)); if (!h) return;
      down = { h, moved: false };
      if (S.mode === 'food') {
        const i = S.s.foods.indexOf(h.c);
        if (i >= 0) { S.ui.drag = { i, c: h.c }; cv.setPointerCapture(ev.pointerId); kick(); }
      }
    });
    cv.addEventListener('pointermove', ev => {
      if (!S.ui.drag) return;
      const h = UI.hit(...pos(ev)); if (!h) return;
      if (h.c !== S.ui.drag.c) { S.ui.drag.c = h.c; down && (down.moved = true); draw(); }
    });
    cv.addEventListener('pointerup', ev => {
      const h = UI.hit(...pos(ev)), d = S.ui.drag;
      if (S.mode === 'food') {
        if (d) {
          S.ui.drag = null;
          if (d.c !== S.s.foods[d.i] && !S.s.foods.includes(d.c)) { S.ui.sel = -1; UI.moveFood(d.i, d.c); }
          else S.ui.sel = S.ui.sel === d.i ? -1 : d.i;   // 動かさずに離した → 選ぶ（もう一度で外す）
        } else if (h && S.ui.sel >= 0) { const i = S.ui.sel; S.ui.sel = -1; UI.moveFood(i, h.c); }
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
