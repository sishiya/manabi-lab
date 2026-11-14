// 熱帯雨林の音 — 声の帯（3分を横に、声ごとに1行）と「いま鳴いている」の札
// 帯 = 鳴らす表（data/forest.json）から。明るさ・札 = いま実際に出ている音の大きさから（js/forest.js の level）。
// 押す: その時刻へ移動（近くにその行の声があれば、声の1秒前へ寄せる）。長押し: その行の声を選ぶ。
'use strict';
window.Lanes = (() => {
  const $ = id => document.getElementById(id);
  const COL = { sp: '#7fd49a', bird: '#ffd27a' };
  let cv, g, data, rows = [], W = 0, H = 0, rowH = 9, gut = 18, top = 2, axis = 14, base = null, raf = 0, live = {}, lastChips = '';
  let hooks = {};

  function setup(forest, order, h) {
    data = forest; rows = order; hooks = h;
    cv = $('lanes'); g = cv.getContext('2d');
    const byCode = {}; for (const e of data.events) (byCode[e[0]] = byCode[e[0]] || []).push(e);
    rows = rows.map(code => ({ code, ev: byCode[code] || [] }));
    resize(); bindPointer();
  }
  function resize() {
    if (!cv) return;
    const wide = innerWidth >= 600;
    rowH = wide ? 13 : 9; gut = wide ? 124 : 20;
    const r = cv.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    W = Math.max(200, Math.round(r.width)); H = top + rows.length * rowH + axis;
    cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    base = null; draw();
  }
  const X = t => gut + (W - gut - 4) * t / data.length_s;
  const T = x => Math.max(0, Math.min(data.length_s, (x - gut) / (W - gut - 4) * data.length_s));

  // 変わらない部分（帯・背景の波・目盛り・行の名前）は、状態が変わったときだけ描いて取っておく
  function drawBase() {
    const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
    const c = off.getContext('2d'), dpr = cv.width / W; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#081210'; c.fillRect(0, 0, W, H);
    // 土台（虫・カエルなど。ずっと鳴っている）の大きさの波を、帯の背景に薄く
    const env = data.bed.env_db, step = data.bed.env_step_s, lo = Math.min(...env), hi = Math.max(...env), bh = rows.length * rowH;
    c.fillStyle = List.isOn('bed') ? 'rgba(160,176,170,.16)' : 'rgba(160,176,170,.05)';
    c.beginPath(); c.moveTo(X(0), top + bh);
    env.forEach((d, i) => c.lineTo(X(i * step), top + bh - bh * (0.25 + 0.75 * (d - lo) / (hi - lo + 1e-9))));
    c.lineTo(X(data.length_s), top + bh); c.closePath(); c.fill();
    rows.forEach((r, i) => {
      const y = top + i * rowH, k = r.code === '????' ? 'bird' : 'sp', on = List.isOn(r.code), sel = List.sel === r.code;
      if (i % 2) { c.fillStyle = 'rgba(255,255,255,.025)'; c.fillRect(gut, y, W - gut, rowH); }
      for (const e of r.ev) {
        const x0 = X(e[1]), w = Math.max(2, X(e[1] + e[3]) - x0);
        if (on) { c.fillStyle = COL[k]; c.fillRect(x0, y + 1, w, rowH - 2); }
        else { c.strokeStyle = '#5d6d67'; c.lineWidth = 1; c.strokeRect(x0 + .5, y + 1.5, w - 1, rowH - 3); }
      }
      if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(gut - 2, y + .5, W - gut + 1, rowH - 1); }
      // 行の名前（広い画面）／番号（スマホ。下の一覧の番号と同じ）
      c.fillStyle = on ? (sel ? '#fff' : '#cfdbd6') : '#5d6d67'; c.font = `${Math.min(11, rowH - 1)}px "Zen Kaku Gothic New", sans-serif`; c.textBaseline = 'middle';
      c.fillText(gut > 40 ? List.short(r.code) : String(i + 1), 2, y + rowH / 2 + .5);
    });
    c.fillStyle = '#8fa39b'; c.font = '10px "IBM Plex Mono", monospace'; c.textBaseline = 'alphabetic';
    for (let m = 0; m <= 3; m++) { const x = X(m * 60); c.fillRect(x, top, 1, bh); c.fillText(`${m}:00`, Math.min(W - 26, x + 2), H - 3); }
    base = off;
  }
  function draw() {
    if (!data) return;
    if (!base) drawBase();
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(base, 0, 0); const dpr = cv.width / W; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = Forest.time;
    // いま実際に鳴っている行を明るく（ON は白く光らせ、OFF はうすく）
    rows.forEach((r, i) => {
      if (!live[r.code]) return;
      const y = top + i * rowH;
      g.fillStyle = List.isOn(r.code) ? 'rgba(255,255,230,.22)' : 'rgba(255,255,230,.07)'; g.fillRect(gut, y, W - gut, rowH);
    });
    const px = drag != null ? drag : X(t);
    g.fillStyle = drag != null ? '#ffd27a' : '#fff'; g.fillRect(px - 1, top, 2, rows.length * rowH);
  }
  // 再生中だけ描きつづける（止まっているときは状態が変わったときだけ）
  function frame() {
    raf = 0; if (!Forest.playing || Power.away) return;
    const lv = {};
    for (const r of [{ code: 'bed' }, ...rows]) lv[r.code] = Forest.level(r.code) > (r.code === 'bed' ? -70 : -100);
    live = lv; chips(); draw();
    raf = requestAnimationFrame(frame);
  }
  function chips() {
    const on = rows.filter(r => live[r.code]).map(r => `<span class="chip ${r.code === '????' ? 'k-bird' : 'k-sp'}${List.isOn(r.code) ? '' : ' off'}">${List.short(r.code)}</span>`);
    const html = on.length ? on.join('') : '<span class="chip-none">鳥の声はいま鳴っていません</span>';
    const s = `<span class="chip-lead">いま鳴いている:</span>${html}`;
    if (s !== lastChips) { $('nowChips').innerHTML = s; lastChips = s; }   // 変わったときだけ書く
  }
  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; live = {}; lastChips = ''; $('nowChips').innerHTML = '<span class="chip-none">▶ で鳴らすと、鳴いている声の名前が出ます</span>'; draw(); }
  function dirty() { base = null; draw(); }

  // ---- 押す・長押し・ドラッグ ----
  let drag = null, press = null;
  function bindPointer() {
    cv.addEventListener('pointerdown', e => {
      const p = pos(e); press = { x: p.x, y: p.y, moved: false, long: false, id: e.pointerId };
      press.timer = setTimeout(() => {   // 長押し: その行の声を選ぶ
        const r = rowAt(p.y); if (!r || press.moved) return;
        press.long = true; hooks.select(r.code); navigator.vibrate && navigator.vibrate(15);
      }, 550);
    });
    cv.addEventListener('pointermove', e => {
      if (!press) return; const p = pos(e);
      if (Math.abs(p.x - press.x) > 6) { press.moved = true; clearTimeout(press.timer); cv.setPointerCapture(press.id); }
      if (press.moved) { drag = Math.max(gut, p.x); hooks.preview(T(drag)); draw(); }
    });
    const end = e => {
      if (!press) return; clearTimeout(press.timer);
      const p = pos(e), was = press; press = null; drag = null;
      if (was.long || e.type === 'pointercancel') { draw(); return; }
      if (p.x < gut - 2) { draw(); return; }
      const r = rowAt(p.y); let t = T(p.x), snapped = null;
      // 鳥の声は帯の上で数 px しかなく指では当てにくいので、押した行（なければ選んだ声）の近くの声の頭へ寄せる
      const cand = (r || rows.find(x => x.code === List.sel) || { ev: [] }).ev;
      let best = null; for (const ev of cand) { const d = Math.abs(ev[1] - t); if (d < 3 && (!best || d < best.d)) best = { d, ev }; }
      if (best) { snapped = best.ev[0]; t = Math.max(0, best.ev[1] - 1); }
      hooks.seek(t, snapped); draw();
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }
  function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function rowAt(y) { const i = Math.floor((y - top) / rowH); return rows[i] || null; }

  return { setup, resize, draw, start, stop, dirty, get rows() { return rows; } };
})();
