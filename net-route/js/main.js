// インターネットの経路 — メイン（描画ループと、デバッグ用の窓口）
'use strict';
window.__neroErr = [];
window.addEventListener('error', e => window.__neroErr.push(String(e.message)));

const cv = document.getElementById('cv');
const g = cv.getContext('2d');

function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout(Math.max(1, r.width), Math.max(1, r.height));
  document.getElementById('stage').classList.toggle('port', VIEW.portrait);
}
function step(dt) { stepSim(dt); stepGlobe(dt); updateUI(dt); }
function draw() { VIEW.mode === 'globe' ? drawGlobe(g) : drawScene(g); drawPage(); }
let last = performance.now();
function loop(now) { step(Math.max(0, Math.min(0.05, (now - last) / 1000))); last = now; /* 最初のコマは now が last より前のことがある */ draw(); requestAnimationFrame(loop); }
window.addEventListener('resize', resize);
resize(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
// runPage(): 1回ページを開いて、そろうまで一気に計算する（ミリ秒を返す）
window.__nero = {
  SIM, NET, LINKS, NODE, GLOBE,
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) step(dt); draw(); },
  runPage(server = SIM.server, limit = 20000) {
    SIM.server = server; openPage();
    while (SIM.phase !== 'done' && SIM.T < limit) advance(SIM.T + 1);
    updateUI(1); draw();
    return { total: SIM.marks.done - SIM.marks.dns, srtt: SIM.srtt, parts: breakdown(), lost: SIM.lost, resent: SIM.resent };
  },
};
