// 電波の見える部屋の台本（wifi-wave.html・wifi-wave-guide.html）で共通の部分
// 場面 SC = [{ a, b, preset, freq, mode, pre, ev: [{ t（場面の中の秒）, run(w) }], drag: [{ a, b, from, to }] }]
//   場面の始めにアプリの間取りを読みこみ直し、pre ステップ（描かずに）進めてから、1コマ = 波 8 ステップ／強さ 32 ステップで進める
//   （1コマ 8 ステップは、点滅の測定で WCAG の基準より下だった速さ。wifi-wave/DEVNOTES の「確認のしかた」7）
'use strict';
const WW_STEPS = { wave: 8, heat: 32 };
const wwScAt = (SC, t) => SC.find(s => t < s.b) || SC[SC.length - 1];
let wwCur = null, wwLast = -1;

function wwSeg(w, id, v) { const b = qs(w, `#${id} [data-v="${v}"]`); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); }
function wwPreset(w, key) { clickEl(w, `#presets [data-v="${key}"]`); }
// アプリの座標（m）→ 画面の点（ドラッグで壁を描くとき）
function wwClient(w, xm, ym) {
  const ov = qs(w, '#ov'), r = ov.getBoundingClientRect(), k = r.width / 1280;
  return { clientX: r.left + xm / 0.0075 * k, clientY: r.top + ym / 0.0075 * k };
}
function wwPointer(w, type, xm, ym) {
  qs(w, '#ov').dispatchEvent(new w.PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, ...wwClient(w, xm, ym) }));
}
// 壁を描く: ev に { t, run: w => wwDraw(w, 'conc', [x0, y0], [x1, y1]) } のように置く（押す → 引く → はなす を一度に）
function wwDraw(w, tool, p0, p1) {
  clickEl(w, `#tools [data-v="${tool}"]`);
  wwPointer(w, 'pointerdown', ...p0); wwPointer(w, 'pointermove', ...p1); wwPointer(w, 'pointerup', ...p1);
  clickEl(w, '#tools [data-v="move"]');
}
function wwStartScene(w, s) {
  const W = w.__ww;
  W.S.paused = true;   // アプリ自身のループでは進めない（こちらで advance する）
  wwPreset(w, s.preset);
  wwSeg(w, 'segFreq', s.freq || '2.4');
  wwSeg(w, 'segMode', s.mode || 'wave');
  W.S.paused = true;
  if (s.pre) W.advance(s.pre);
}
// 場面の中の時刻 lt0 → lt のできごと（ルーターを動かす drag は、その間の位置をなめらかに）
function wwApply(w, s, lt0, lt) {
  for (const e of s.ev || []) if (e.t > lt0 && e.t <= lt) e.run(w);
  for (const d of s.drag || []) {
    if (lt < d.a || lt0 > d.b) continue;
    const k = ease((lt - d.a) / (d.b - d.a)), m = 1 / 0.0075;
    w.__ww.S[d.who || 'router'] = [lerp(d.from[0], d.to[0], k) * m, lerp(d.from[1], d.to[1], k) * m];
    w.__ww.S.lastChange = w.__ww.sim.n;
  }
}
function wwRender(w, SC, t) {
  const s = wwScAt(SC, t), lt = t - s.a, W = w.__ww, n = WW_STEPS[s.mode || 'wave'];
  if (s !== wwCur || t < wwLast || t - wwLast > 0.5) {
    wwStartScene(w, s);
    // 途中の時刻（確かめ用のコマ）は、0.5秒ごとにできごとを入れながら描かずに進める
    for (let u = 0; u < lt - 1e-6; u += 0.5) { const v = Math.min(lt, u + 0.5); wwApply(w, s, u - 1e-6, v); W.advance(Math.round((v - u) * FPS * n)); }
    wwApply(w, s, -1e-6, 0);
    wwCur = s;
  } else { wwApply(w, s, wwLast - s.a, lt); W.advance(n); }
  wwLast = t;
}
// 図（電波の canvas と、その上の文字の canvas）を置き場所 [x, y, w, h]（PW×PH の座標）に描く
function wwDraw2(g, w, R) {
  const gl = qs(w, '#gl'), ov = qs(w, '#ov');
  g.fillStyle = '#0b0e14'; g.fillRect(0, 0, PW * RES, PH * RES);
  const [x, y, cw, ch] = R.map(v => v * RES);
  g.drawImage(gl, x, y, cw, ch); g.drawImage(ov, x, y, cw, ch);
}
const wwText = (w, sel) => ((qs(w, sel) || {}).textContent || '').trim();
