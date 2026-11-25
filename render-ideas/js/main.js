// 見え方の発明室 — 共通の枠（タブ・描画ループ・指の入力・つまみの部品・デバッグ用の窓口）
// 実験は RI.add({ id, lead, how, init, controls, resize, step, draw, pointer }) で足す。
//   step(dt) が true を返すあいだだけ描き続ける（変化のない画面は描き直さない。RULES 9章）。止まったら RI.wake() で起こす。
'use strict';
window.__reidErr = [];
window.addEventListener('error', e => window.__reidErr.push(String(e.message)));

const RI = window.RI = (() => {
  const cv = document.getElementById('cv'), g = cv.getContext('2d');
  const stage = document.getElementById('stage');
  const modes = {}, order = [];
  let cur = null, running = false, last = 0, w = 1, h = 1;

  function add(m) { modes[m.id] = m; order.push(m.id); }

  function resize() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const id of order) modes[id].resize?.(w, h);
    wake();
  }

  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    let more = false;
    if (kick > 0) kick--;   // 起こした直後の数コマは必ず回す（最初のコマは dt が 0 で「変化なし」に見えるため）
    try { more = cur.step(dt) || kick > 0; cur.draw(g, w, h); } catch (e) { window.__reidErr.push(String(e && e.stack || e)); console.error(e); more = false; }
    if (more && !Power.away) requestAnimationFrame(frame); else running = false;
  }
  let kick = 0;
  function wake() { kick = 3; if (running || !cur || Power.away) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
  Power.on({ pause() {}, resume() { wake(); } });

  function select(id) {
    if (!modes[id]) id = order[0];
    if (cur) cur.leave?.();
    cur = modes[id];
    for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-selected', b.dataset.mode === id);
    document.getElementById('lead').innerHTML = cur.lead;
    document.getElementById('howBody').innerHTML = cur.how;
    const c = document.getElementById('controls'); c.innerHTML = '';
    cur.controls?.(c);
    document.getElementById('hud').textContent = '';
    if (!cur._inited) { cur.init?.(w, h); cur._inited = true; }
    cur.enter?.();
    if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);
    wake();
  }

  // 指・マウス（座標は CSS ピクセル）
  function pt(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  let down = false;
  stage.addEventListener('pointerdown', e => { down = true; stage.setPointerCapture(e.pointerId); const p = pt(e); cur.pointer?.('down', p.x, p.y, e); wake(); });
  stage.addEventListener('pointermove', e => { const p = pt(e); cur.pointer?.(down ? 'drag' : 'hover', p.x, p.y, e); wake(); });
  const up = e => { if (!down) return; down = false; const p = pt(e); cur.pointer?.('up', p.x, p.y, e); wake(); };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('pointerleave', e => { if (!down) { cur.pointer?.('leave', 0, 0, e); wake(); } });

  // つまみの部品
  function slider(root, o) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label><span>${o.label}</span><output></output></label><input type="range" min="${o.min}" max="${o.max}" step="${o.step}" value="${o.value}">`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    const show = () => { out.textContent = o.fmt ? o.fmt(+inp.value) : inp.value; };
    inp.addEventListener('input', () => { show(); o.oninput(+inp.value); wake(); });
    show(); root.appendChild(row); return inp;
  }
  function buttons(root) { const d = document.createElement('div'); d.className = 'btns'; root.appendChild(d); return d; }
  function toggle(box, label, on, f) {
    const b = document.createElement('button'); b.className = 'tg'; b.textContent = label; b.setAttribute('aria-pressed', !!on);
    b.addEventListener('click', () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', v); f(v); wake(); });
    box.appendChild(b); return b;
  }
  function action(box, label, f) {
    const b = document.createElement('button'); b.className = 'act'; b.textContent = label;
    b.addEventListener('click', () => { f(b); wake(); }); box.appendChild(b); return b;
  }
  function note(root, html = '') { const p = document.createElement('p'); p.className = 'note'; p.innerHTML = html; root.appendChild(p); return p; }
  function hud(s) { document.getElementById('hud').textContent = s; }

  function start() {
    for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => select(b.dataset.mode));
    window.addEventListener('resize', resize);
    window.addEventListener('hashchange', () => select(location.hash.slice(1)));
    resize();
    select(location.hash.slice(1));
  }

  return { add, start, select, wake, slider, buttons, toggle, action, note, hud, get cur() { return cur; }, get size() { return { w, h }; }, g, modes };
})();

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__reid = {
  RI,
  simRun(sec, dt = 1 / 60) { const m = RI.cur, { w, h } = RI.size; for (let t = 0; t < sec; t += dt) m.step(dt); m.draw(RI.g, w, h); },
};
