// メトロノームがそろうまで — メイン（描画ループ・つつく・デバッグ用の窓口）
'use strict';
window.__mesyErr = [];
window.addEventListener('error', e => window.__mesyErr.push(String(e.message)));

const cv = document.getElementById('cv'), g = cv.getContext('2d');
const gv = document.getElementById('gv'), gg = gv.getContext('2d');

function fit(c, ctx) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function resize() { fit(cv, g); fit(gv, gg); draw(); }
function draw() {
  const S = SIM.S;
  DRAW.scene(g, cv.clientWidth, cv.clientHeight, S.sys, { wet: S.opt.damp > 0, addMass: S.opt.addMass });
  GRAPH.draw(gg, gv.clientWidth, gv.clientHeight, S.hist, S.sys.n, S.speed);
}
// メトロノームをさわる: 棒の先を、さわった側と反対へつつく
function pos(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
cv.addEventListener('pointerdown', e => {
  const [x, y] = pos(e), i = DRAW.hit(x, y);
  if (i >= 0) SIM.poke(i, x > DRAW.itemX(i) ? -1 : 1);   // 右側をさわると左へ押す
});
cv.addEventListener('pointermove', e => { const [x, y] = pos(e); DRAW.setHover(DRAW.hit(x, y)); });
cv.addEventListener('pointerleave', () => DRAW.setHover(-1));

let last = performance.now();
function loop(now) {
  SIM.advance(Math.max(0, Math.min(0.05, (now - last) / 1000))); last = now;   // 最初のコマは now が last より前のことがある
  draw(); requestAnimationFrame(loop);
}
SIM.reset();
UI.build();
window.addEventListener('resize', resize);
resize(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__mesy = {
  SIM, PHYS, UI,
  simRun(sec) { const sp = SIM.S.speed; SIM.S.speed = 1; for (let t = 0; t < sec; t += 10) SIM.advance(Math.min(10, sec - t)); SIM.S.speed = sp; draw(); },
  draw,
};
