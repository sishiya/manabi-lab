// Small reactions when a tool is used, so you can see what happened (drawn for clarity: 演出).
// Positions in mm on the wall. Nothing here changes the world; the world changes in tools.js.
// Chlorine: mist, then the mould's colour fades away in place (bleaching) — it does not fly off.
// Scrubbing: foam, and a few dry spores lifted into the air (this does happen when you scrub mould).

const FX = { list: [] };
const FX_MAX = 700;

function fxAdd(o) { if (FX.list.length < FX_MAX) FX.list.push({ age: 0, ...o }); }
function fxRand(r) { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * r; return [Math.cos(a) * d, Math.sin(a) * d]; }

// called for each step of a stroke (x, y in mm, r = brush radius in mm)
function fxTool(id, x, y, r) {
  if (id === 'water') {
    for (let k = 0; k < 5; k++) { const a = Math.random() * 6.283, v = 4 + Math.random() * 8; fxAdd({ t: 'drop', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, life: 0.6 }); }
    fxAdd({ t: 'ring', x, y, r0: r * 0.3, r1: r * 1.1, col: '150,205,240', life: 0.6 });
  } else if (id === 'wipe') fxAdd({ t: 'smear', x, y, r, col: '250,250,245', life: 0.7 });
  else if (id === 'dry') { for (let k = 0; k < 2; k++) { const [dx] = fxRand(r); fxAdd({ t: 'heat', x: x + dx, y: y + r * 0.6, life: 1 }); } }
  else if (id === 'dirt') { for (let k = 0; k < 2; k++) { const [dx, dy] = fxRand(r * 0.8); fxAdd({ t: 'blob', x: x + dx, y: y + dy, s: 0.6 + Math.random() * 0.8, life: 1.1 }); } }
  else if (id === 'spore') { for (let k = 0; k < 6; k++) { const [dx, dy] = fxRand(r); fxAdd({ t: 'fall', x: x + dx, y: y + dy, life: 0.8, col: '58,66,52' }); } }
  else if (id === 'scrub') {
    for (let k = 0; k < 4; k++) { const [dx, dy] = fxRand(r); fxAdd({ t: 'bubble', x: x + dx, y: y + dy, s: 0.4 + Math.random() * 0.8, life: 1 + Math.random() * 0.5 }); }
    // dry spores lifted where there is mould with spores
    const c = cellOf(x, y);
    if (c >= 0 && W.S[c] > 0.15) for (let k = 0; k < 3; k++) { const [dx, dy] = fxRand(r * 0.7); fxAdd({ t: 'lift', x: x + dx, y: y + dy, life: 1.4, col: hexRgb(SPECIES[Math.max(0, W.sp[c])].col).join(',') }); }
  } else if (id === 'chlorine' || id === 'alcohol' || id === 'fungicide') {
    const col = id === 'chlorine' ? '150,210,255' : id === 'alcohol' ? '225,200,255' : '255,195,130';
    for (let k = 0; k < 7; k++) { const [dx, dy] = fxRand(r); fxAdd({ t: 'mist', x: x + dx, y: y + dy, col, life: 0.5 + Math.random() * 0.3 }); }
    if (id === 'alcohol') fxAdd({ t: 'ring', x, y, r0: r * 0.5, r1: r * 0.9, col: '235,220,255', life: 0.5 });
    if (id === 'fungicide') for (let k = 0; k < 3; k++) { const [dx, dy] = fxRand(r); fxAdd({ t: 'spark', x: x + dx, y: y + dy, life: 1.5 }); }
  }
}
// before chlorine changes the world: remember the mould's colours under the brush, then let them fade away in place
function fxBleach(x, y, r) {
  let n = 0;
  forCells(x, y, r, c => {
    if (n > 14) return;
    const v = W.S[c] * SPECIES[Math.max(0, W.sp[c])].pig + W.Dp[c];
    if (v > 0.12 && Math.random() < 0.6) {
      const col = W.S[c] > W.Dp[c] ? hexRgb(SPECIES[Math.max(0, W.sp[c])].col).join(',') : '64,66,60';
      fxAdd({ t: 'fade', x: (c % GW + Math.random()) * CELL, y: (Math.floor(c / GW) + Math.random()) * CELL, a: Math.min(0.9, v), col, life: 1.1 + Math.random() * 0.4 });
      n++;
    }
  });
}
// the smoke fills the bathroom, then silver settles on every surface
function fxSmoke() {
  for (let k = 0; k < 40; k++) fxAdd({ t: 'cloud', x: Math.random() * BOX_W, y: BOX_H + Math.random() * 10, s: 8 + Math.random() * 14, life: 3 + Math.random() * 1.5 });
  for (let k = 0; k < 120; k++) fxAdd({ t: 'settle', x: Math.random() * BOX_W, y: Math.random() * BOX_H, delay: 1.5 + Math.random() * 1.5, life: 4.5 });
}

function drawFx(g, dt) {
  const k = VIEW.box.k;
  FX.list = FX.list.filter(f => (f.age += dt) < f.life);
  for (const f of FX.list) {
    const u = f.age / f.life, X = mmX(f.x), Y = mmY(f.y);
    if (f.t === 'drop') {
      const x = mmX(f.x + f.vx * f.age), y = mmY(f.y + f.vy * f.age + 18 * f.age * f.age);
      g.fillStyle = `rgba(170,215,245,${0.9 * (1 - u)})`; g.beginPath(); g.arc(x, y, Math.max(1.2, 0.35 * k), 0, 7); g.fill();
    } else if (f.t === 'ring') {
      g.strokeStyle = `rgba(${f.col},${0.7 * (1 - u)})`; g.lineWidth = 1.5; g.beginPath(); g.arc(X, Y, (f.r0 + (f.r1 - f.r0) * u) * k, 0, 7); g.stroke();
    } else if (f.t === 'smear') {
      g.fillStyle = `rgba(${f.col},${0.35 * (1 - u)})`; g.beginPath(); g.arc(X, Y, f.r * k, 0, 7); g.fill();
    } else if (f.t === 'heat') {
      g.strokeStyle = `rgba(255,214,120,${0.6 * Math.sin(u * Math.PI)})`; g.lineWidth = 1.4; g.beginPath();
      for (let i = 0; i <= 12; i++) { const yy = Y - i * 0.9 * k - u * 6 * k, xx = X + Math.sin(i * 0.9 + f.age * 8) * 0.8 * k; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
      g.stroke();
    } else if (f.t === 'blob') {
      const s = f.s * k * Math.min(1, u * 4);
      g.fillStyle = `rgba(226,206,150,${0.8 * (1 - u * u)})`; g.beginPath(); g.ellipse(X, Y + u * 1.5 * k, s, s * 0.8, 0, 0, 7); g.fill();
    } else if (f.t === 'fall') {
      g.fillStyle = `rgba(${f.col},${0.9 * (1 - u)})`; g.beginPath(); g.arc(X, Y - (1 - u) * 8 * k, Math.max(1, 0.18 * k), 0, 7); g.fill();
    } else if (f.t === 'bubble') {
      const s = f.s * k * (0.5 + u);
      g.strokeStyle = `rgba(255,255,255,${0.85 * (1 - u)})`; g.lineWidth = 1; g.beginPath(); g.arc(X, Y, s, 0, 7); g.stroke();
      g.fillStyle = `rgba(255,255,255,${0.25 * (1 - u)})`; g.fill();
    } else if (f.t === 'lift') {
      g.fillStyle = `rgba(${f.col},${0.9 * (1 - u)})`; g.beginPath(); g.arc(X + Math.sin(f.age * 5) * 0.6 * k, Y - u * 7 * k, Math.max(1, 0.15 * k), 0, 7); g.fill();
    } else if (f.t === 'mist') {
      g.fillStyle = `rgba(${f.col},${0.55 * (1 - u)})`; g.beginPath(); g.arc(X - (1 - u) * 3 * k, Y - (1 - u) * 3 * k, Math.max(1.2, 0.3 * k) * (1 + u), 0, 7); g.fill();
    } else if (f.t === 'spark') {
      g.fillStyle = `rgba(255,240,220,${Math.sin(u * Math.PI)})`; g.fillRect(X - 1, Y - 1, 2, 2);
    } else if (f.t === 'fade') {   // colour dissolving where it is
      const s = Math.max(1, 0.45 * k) * (1 - 0.6 * u);
      g.fillStyle = `rgba(${f.col},${f.a * (1 - u)})`; g.beginPath(); g.arc(X, Y, s, 0, 7); g.fill();
    } else if (f.t === 'cloud') {
      const a = Math.sin(u * Math.PI) * 0.35, y = mmY(f.y - u * (BOX_H + 20));
      g.fillStyle = `rgba(225,230,232,${a})`; g.beginPath(); g.arc(X + Math.sin(f.age + f.s) * 2 * k, y, f.s * k, 0, 7); g.fill();
    } else if (f.t === 'settle') {
      const v = (f.age - f.delay) / (f.life - f.delay);
      if (v > 0) { g.fillStyle = `rgba(235,240,245,${Math.sin(Math.min(1, v) * Math.PI)})`; g.fillRect(X - 1, Y - 1, 2, 2); }
    }
  }
}
