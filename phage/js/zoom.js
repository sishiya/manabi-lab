// ③ 寄って見る — 場面の土台。場面（chapter）は Zoom.add({...}) で足す
// 場面のもの: id, name, sub, box{x0,x1,y0,y1}（nm、Y 上）, bar（ものさし nm）, lead, init(Z), step(Z,dt), draw(Z), click(Z,x,y)
'use strict';

const Zoom = (() => {
  const cv = document.getElementById('cvZoom');
  const g = cv.getContext('2d');
  let Wpx = 1, Hpx = 1, s = 1, ox = 0, oy = 0;
  const chs = []; let cur = null;
  const $ = id => document.getElementById(id);
  const KIND = { sure: '研究の値', est: '目安', art: '模式' };
  const holding = {};
  let toastT = 0, pickHl = null;

  const Z = {
    g, holding,
    X: x => ox + x * s, Y: y => oy - y * s, L: nm => nm * s,
    get s() { return s; }, get W() { return Wpx; }, get H() { return Hpx; },
    // ---- 右の欄 ----
    btn(label, fn, o = {}) {
      const b = document.createElement('button'); b.innerHTML = label; b.className = o.cls || '';
      if (o.id) b.id = o.id;
      if (o.hold) {
        const on = e => { e.preventDefault(); holding[o.hold] = true; b.classList.add('down'); };
        const off = () => { holding[o.hold] = false; b.classList.remove('down'); };
        b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
      } else b.addEventListener('click', fn);
      (o.into ? $(o.into) : $('zCtrl')).appendChild(b);
      return b;
    },
    row(html) { const d = document.createElement('div'); d.className = 'zrow'; d.innerHTML = html || ''; $('zCtrl').appendChild(d); return d; },
    say(html, kind) { $('zSay').innerHTML = html + (kind ? ` <span class="kind ${kind}">${KIND[kind]}</span>` : ''); },
    steps(list) { Z._steps = list; Z._at = -1; renderSteps(); },
    at(i) { Z._at = i; renderSteps(); },
    pick(info) { if (!info) return; $('zPick').innerHTML = `<h3>${info.t} <span class="kind ${info.k}">${KIND[info.k]}</span></h3><p>${info.b}</p>`; UI.card('z', info); },
    toast(msg) { const el = $('zToast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1800); },
    // ---- 描く道具（座標は nm）----
    circle(x, y, r, fill, stroke, lw = 1) { g.beginPath(); g.arc(Z.X(x), Z.Y(y), Math.max(0.5, r * s), 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } },
    ell(x, y, rx, ry, rot, fill, stroke, lw = 1) { g.beginPath(); g.ellipse(Z.X(x), Z.Y(y), Math.max(0.5, rx * s), Math.max(0.5, ry * s), -(rot || 0), 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } },
    rect(x, y, w, h, fill, r = 0, stroke) { // 中心と幅・高さ
      w = Math.abs(w); h = Math.abs(h); if (w * s < 0.3 || h * s < 0.3) return;
      g.beginPath(); g.roundRect(Z.X(x - w / 2), Z.Y(y + h / 2), w * s, h * s, Math.min(r * s, w * s / 2, h * s / 2));
      if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
    },
    poly(pts, fill, stroke, lw = 1, close = true) {
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(Z.X(x), Z.Y(y)) : g.moveTo(Z.X(x), Z.Y(y))); if (close) g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
    },
    line(pts, color, lw = 2) { Z.poly(pts, null, color, lw, false); },
    hex(x, y, r, fill, stroke, rot = 0) { const p = []; for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; p.push([x + r * Math.cos(a), y + r * Math.sin(a)]); } Z.poly(p, fill, stroke); },
    text(str, x, y, o = {}) {
      g.font = `${o.bold ? '700 ' : ''}${o.size || 12}px ${o.mono ? '"IBM Plex Mono", monospace' : '"Zen Kaku Gothic New", sans-serif'}`;
      g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle';
      const px = Z.X(x) + (o.dx || 0), py = Z.Y(y) + (o.dy || 0);
      if (o.bg) { const w = g.measureText(str).width; g.fillStyle = o.bg; const al = g.textAlign; const lx = al === 'center' ? px - w / 2 : al === 'right' ? px - w : px; g.fillRect(lx - 4, py - (o.size || 12) * 0.7, w + 8, (o.size || 12) * 1.4); }
      g.fillStyle = o.color || '#e8f0f4'; g.fillText(str, px, py);
    },
    // 二本鎖の DNA（x0,y0 → x1,y1）。o.cut: 0..1 の位置の配列（切れ目）, o.open: ほどけた部分
    helix(x0, y0, x1, y1, o = {}) {
      const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len, nx = -uy, ny = ux;
      const amp = o.amp ?? 1, pitch = o.pitch ?? 3.4 * 2, c1 = o.c1 || ZC.dna, c2 = o.c2 || c1, ph = o.phase || 0;
      const cuts = o.cuts || [];
      const n = Math.max(2, Math.ceil(len / 0.8));
      const seg = (strand) => {
        g.beginPath(); let pen = false;
        for (let i = 0; i <= n; i++) {
          const t = i / n, d = t * len;
          if (cuts.some(c => Math.abs(c - t) * len < 1.2)) { pen = false; continue; }
          const off = amp * Math.sin((d / pitch) * Math.PI * 2 + ph + strand * Math.PI);
          const px = x0 + ux * d + nx * off, py = y0 + uy * d + ny * off;
          if (!pen) { g.moveTo(Z.X(px), Z.Y(py)); pen = true; } else g.lineTo(Z.X(px), Z.Y(py));
        }
        g.strokeStyle = strand ? c2 : c1; g.lineWidth = Math.max(1, (o.lw ?? 0.6) * s); g.stroke();
      };
      // はしごの段
      if (o.rungs !== false && s > 1.2) {
        g.strokeStyle = o.rc || 'rgba(255,255,255,.28)'; g.lineWidth = 1; g.beginPath();
        for (let d = 0; d < len; d += 0.68 * 2) {
          const t = d / len; if (cuts.some(c => Math.abs(c - t) * len < 1.2)) continue;
          const a = amp * Math.sin((d / pitch) * Math.PI * 2 + ph), b = -a;
          g.moveTo(Z.X(x0 + ux * d + nx * a), Z.Y(y0 + uy * d + ny * a)); g.lineTo(Z.X(x0 + ux * d + nx * b), Z.Y(y0 + uy * d + ny * b));
        }
        g.stroke();
      }
      seg(0); seg(1);
    },
    hl(x, y, r = 10) { pickHl = { x, y, r, at: performance.now() }; },
  };

  function renderSteps() {
    const ol = $('zSteps'); if (!Z._steps) { ol.innerHTML = ''; return; }
    ol.innerHTML = Z._steps.map((t, i) => `<li class="${i < Z._at ? 'done' : i === Z._at ? 'now' : ''}">${t}</li>`).join('');
  }

  function add(ch) { chs.push(ch); }
  function buildList() {
    const box = $('zList'); box.innerHTML = '';
    chs.forEach((c, i) => {
      const b = document.createElement('button'); b.dataset.id = c.id;
      b.innerHTML = `<b>${i + 1}. ${c.name}</b><small>${c.sub}</small>`;
      b.addEventListener('click', () => open(c.id));
      box.appendChild(b);
    });
  }
  function open(id) {
    cur = chs.find(c => c.id === id) || chs[0];
    $('zList').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === cur.id)));
    $('zTitle').textContent = cur.name; $('zLead').innerHTML = cur.lead || '';
    $('zCtrl').innerHTML = ''; $('zSay').innerHTML = ''; $('zPick').innerHTML = '<p class="hint2">図の中の部品をさわると、ここに説明が出る。</p>';
    Z._steps = null; renderSteps(); UI.next('z', null); document.getElementById('zCard').hidden = true; UI.goal('z', cur.goal || cur.name, null);
    for (const k in holding) holding[k] = false;
    fit();
    cur.init(Z);
  }
  function fit() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    Wpx = Math.max(1, r.width); Hpx = Math.max(1, r.height);
    cv.width = Math.round(Wpx * dpr); cv.height = Math.round(Hpx * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!cur) return;
    const b = cur.box, pad = 18;
    const top = 66, bot = 44; // 上は目的の札、下は案内とものさしのぶん空ける
    s = Math.max(0.01, Math.min((Wpx - 2 * pad) / (b.x1 - b.x0), (Hpx - top - bot) / (b.y1 - b.y0)));
    ox = Wpx / 2 - (b.x0 + b.x1) / 2 * s; oy = top + (Hpx - top - bot) / 2 + (b.y0 + b.y1) / 2 * s;
  }
  function step(dt) { if (cur && cur.step) cur.step(Z, dt); }
  function draw() {
    g.clearRect(0, 0, Wpx, Hpx);
    g.fillStyle = '#0b1a22'; g.fillRect(0, 0, Wpx, Hpx);
    if (!cur) return;
    g.save(); cur.draw(Z); g.restore();
    // まだ終わっていない場面では、何をすればよいかを図の下に書く（右の欄・スマホでは下の欄のボタン）
    const fin = cur.done && cur.done();
    if (!fin && cur.hint) {
      const side = window.innerWidth <= 860 ? '下' : '右';
      const msg = cur.hint.replace('〈欄〉', side + 'の欄');
      const fs = Wpx < 520 ? 12 : 14;
      g.font = `${fs}px "Zen Kaku Gothic New", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      // はみ出すなら2行に分ける（「（」の前か、まん中で）
      let lines = [msg];
      if (g.measureText(msg).width > Wpx - 40) { let cut = msg.indexOf('（'); if (cut < 4) cut = Math.ceil(msg.length / 2); lines = [msg.slice(0, cut), msg.slice(cut)]; }
      const w = Math.max(...lines.map(l => g.measureText(l).width)), lh = fs + 6, hh = lines.length * lh + 10, y = Hpx - 46 - hh / 2;
      g.fillStyle = 'rgba(11,26,34,.88)'; g.strokeStyle = 'rgba(127,224,196,.7)'; g.lineWidth = 1;
      g.beginPath(); g.roundRect(Wpx / 2 - w / 2 - 12, y - hh / 2, w + 24, hh, 14); g.fill(); g.stroke();
      g.fillStyle = '#e8f0f4'; lines.forEach((l, i) => g.fillText(l, Wpx / 2, y - (lines.length - 1) * lh / 2 + i * lh));
    }
    UI.goal('z', cur.goal || cur.name, fin ? [['できた！', 'done']] : null);
    if (fin) {
      const i = chs.indexOf(cur), nx = chs[i + 1];
      UI.next('z', nx ? [[`つぎの場面へ: ${i + 2}. ${nx.name} →`, () => open(nx.id), true]] : [['おわり！ ① 着陸させるにもどる', () => UI.setTab('land'), true]], cur.id);
    }
    if (pickHl && performance.now() - pickHl.at < 1500) { g.strokeStyle = '#ffe066'; g.lineWidth = 2; g.beginPath(); g.arc(Z.X(pickHl.x), Z.Y(pickHl.y), Math.max(10, pickHl.r * s), 0, Math.PI * 2); g.stroke(); }
    // ものさし
    const bar = cur.bar || 10, len = bar * s, x0 = Wpx - len - 14, y0 = Hpx - 14;
    g.strokeStyle = '#e8f0f4'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + len, y0); g.moveTo(x0, y0 - 4); g.lineTo(x0, y0 + 4); g.moveTo(x0 + len, y0 - 4); g.lineTo(x0 + len, y0 + 4); g.stroke();
    g.fillStyle = '#e8f0f4'; g.font = '11px "IBM Plex Mono", monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(`${bar} nm`, x0, y0 - 6);
    $('zHud').textContent = `横はば 約${Math.round(Wpx / s)}nm（髪の毛の太さの約${Math.round(80000 / (Wpx / s))}分の1）`;
  }
  cv.addEventListener('pointerdown', e => {
    if (!cur || !cur.click) return;
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left - ox) / s, y = (oy - (e.clientY - r.top)) / s;
    const k = cur.click(Z, x, y);
    if (k) { Z.pick(typeof k === 'string' ? ZINFO[k] : k); if (!pickHl || performance.now() - pickHl.at > 50) Z.hl(x, y, 6); }
  });

  return { Z, add, buildList, open, fit, step, draw, get cur() { return cur; }, get chapters() { return chs; } };
})();
