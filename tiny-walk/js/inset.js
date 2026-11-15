// ちいさな地球を歩く — 横から見た図（星に固定。星の円・自分・ボール・道すじ）
'use strict';
const INSET = (() => {
  let cv, g, size = 0;
  function init(canvas) { cv = canvas; g = cv.getContext('2d'); }
  function fit() {
    const w = cv.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w && (cv.width !== Math.round(w * dpr))) { cv.width = cv.height = Math.round(w * dpr); }
    size = w; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // d: { R, a（図の上向き）, b（図の右向き）, me:[x,y,z], pred, flown:{tr,t}|null, ball:[x,y,z]|null }
  function draw(d) {
    fit(); if (!size) return;
    const w = size, R = d.R, dot = (p, u) => p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
    let ext = R * 1.25;
    for (const tr of [d.pred, d.flown && d.flown.tr]) if (tr) ext = Math.max(ext, Math.min(tr.rMax, 8 * R) * 1.08);
    const k = (w / 2 - 4) / ext, X = p => w / 2 + dot(p, d.b) * k, Y = p => w / 2 - dot(p, d.a) * k;
    g.clearRect(0, 0, w, w);
    g.fillStyle = 'rgba(8,14,26,.82)'; g.fillRect(0, 0, w, w);
    g.beginPath(); g.arc(w / 2, w / 2, Math.max(1.5, R * k), 0, 7); g.fillStyle = '#1c3550'; g.fill(); g.strokeStyle = '#7fd0ff'; g.lineWidth = 1.2; g.stroke();
    const path = (tr, tEnd, dash, color) => {
      g.beginPath(); g.setLineDash(dash); let q = [0, 0, 0];
      for (let i = 0; i < tr.n && tr.t[i] <= tEnd; i++) { q[0] = tr.p[i * 3]; q[1] = tr.p[i * 3 + 1]; q[2] = tr.p[i * 3 + 2]; i ? g.lineTo(X(q), Y(q)) : g.moveTo(X(q), Y(q)); }
      g.strokeStyle = color; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
    };
    if (d.pred) path(d.pred, Infinity, [3, 3], 'rgba(255,201,90,.75)');
    if (d.flown) path(d.flown.tr, d.flown.t, [], '#ffe6a8');
    if (d.ball) { g.beginPath(); g.arc(X(d.ball), Y(d.ball), 2.6, 0, 7); g.fillStyle = '#ffc95a'; g.fill(); }
    g.beginPath(); g.arc(X(d.me), Y(d.me), 3.4, 0, 7); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#0a1222'; g.lineWidth = 1; g.stroke();
  }
  return { init, draw };
})();
