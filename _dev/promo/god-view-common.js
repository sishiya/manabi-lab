// 神の視点マップの台本（god-view.html・god-view-guide.html）で共通の部分
// 場面 SC = [{ a, b, kind: 'map' | 'space' | 'micro' | 'tear', cam: u => ({ lon, lat, h, heading, pitch })（地図）, L: u => log10(画面の幅 m)（宇宙・ミクロ）, enter(w), ev: [{ t, run(w) }] }]
//   u は場面の中の秒。地図は1コマごとにカメラを置き、地図・建物の読みこみを待ってから描く（外のデータを読むので、録画は通信が安定しているときに）
//   ライセンス（PLAN-9apps.md）: 背景は「航空写真」（日本は地理院の写真、日本の外は NASA Blue Marble）。地形は世界の標高（Terrain Tiles）だけを使い、
//   地理院の標高タイルは読まない。標準地図・陰影・天気は出さない。地図の出典は画面の下に出したまま
'use strict';
const gvScAt = (SC, t) => SC.find(s => t < s.b) || SC[SC.length - 1];
let gvCur = null, gvLast = -1, gvFadeFrom = null;
const D2R = Math.PI / 180;

// このアプリは inject（srcdoc で開く）を使えない: Cesium の Worker（地形の計算）が srcdoc のページでは動かず、地図が出ない（2026-10-10 に確かめた）。
// そこで普通に開き、読みこんだあとで requestAnimationFrame を差しかえる（宇宙・ミクロ・ちぎるのループは、次のコマからこちらの appStep で進む）
function gvInstallRaf(w) {
  w.__rafQ = []; w.requestAnimationFrame = cb => { w.__rafQ.push(cb); return w.__rafQ.length; }; w.cancelAnimationFrame = () => {};
  w.__rafStep = ts => { const q = w.__rafQ; w.__rafQ = []; q.forEach(cb => cb(ts)); };
  Object.defineProperty(w, 'devicePixelRatio', { get: () => 2, configurable: true });   // 宇宙・ミクロの three.js は 1.5 倍まで
}
function gvSetup(w) {
  const GV = w.GV;
  gvInstallRaf(w);
  GV.viewer.useDefaultRenderLoop = false;          // 地図はこちらで1コマずつ描く
  GV.TERRAIN.gsi.min = 99;                       // 地理院の標高タイルは使わない（世界の標高だけ）
  Object.assign(GV.state, { base: 'photo', terrain: true, exaggeration: 1, lighting: false });
  GV.state.overlays.hillshade = false;
  GV.applyBase(); GV.applyOverlays && GV.applyOverlays(); GV.applyTerrain();
  GV.viewer.useBrowserRecommendedResolution = true;
  GV.viewer.resolutionScale = 2;                  // CSS の大きさの2倍で描く（4K）
}
async function gvMapFrame(w, c, waitMs = 6000) {
  const v = w.GV.viewer, C = w.Cesium;
  if (c.range) {   // 見たい点（lon, lat, alt）を、向き・距離で斜めから見る
    v.camera.lookAt(C.Cartesian3.fromDegrees(c.lon, c.lat, c.alt || 0), new C.HeadingPitchRange((c.heading || 0) * D2R, (c.pitch ?? -45) * D2R, c.range));
    v.camera.lookAtTransform(C.Matrix4.IDENTITY);
  } else v.camera.setView({ destination: C.Cartesian3.fromDegrees(c.lon, c.lat, c.h), orientation: { heading: (c.heading || 0) * D2R, pitch: (c.pitch ?? -90) * D2R, roll: 0 } });
  const t0 = performance.now();
  for (;;) {
    v.resize(); v.scene.requestRender(); v.render();
    const sets = v.scene.primitives._primitives.filter(p => p instanceof C.Cesium3DTileset && p.show);
    if (v.scene.globe.tilesLoaded && sets.every(s => s.tilesLoaded)) break;
    if (performance.now() - t0 > waitMs) break;
    await sleep(30);
  }
  v.render();   // 最後にもう一度（drawImage はこのすぐあと。WebGL の絵は次の描画で消えるため）
}
// 場面に入る・出る
async function gvEnter(w, s) {
  const GV = w.GV;
  if (GV.stage === 'tear' && s.kind !== 'tear') GV.exitTear();
  if (GV.stage === 'micro' && s.kind !== 'micro') GV.exitMicro();
  if (GV.stage === 'space' && s.kind !== 'space' && s.kind !== 'tear') GV.exitSpace();
  if (s.enter) await s.enter(w);
  if (s.kind === 'space' && GV.stage !== 'space') { if (s.cam) await gvMapFrame(w, s.cam(0)); await GV.enterSpace(s.L(0)); }
  if (s.kind === 'micro' && GV.stage !== 'micro') { await gvMapFrame(w, s.cam(0)); await GV.enterMicro(s.L(0)); }
  if (s.kind === 'tear') {
    if (GV.stage !== 'space' && GV.stage !== 'tear') { await gvMapFrame(w, s.cam(0)); await GV.enterSpace(7.6); for (let i = 0; i < 30; i++) { appStep(w, 1); await sleep(20); } }
    if (GV.stage !== 'tear') GV.enterTear();
    for (let i = 0; i < 600 && !GV._tear.ready; i++) { appStep(w, 1); await sleep(50); }   // 粒の地球を組み立てるまで
    GV._tear.cam(s.yaw ?? 0.8, s.pitch ?? 0.3, s.dist ?? 30);   // カメラの向きを決めておく（決まっていないと、何も写らず、つまむ操作も当たらない）
  }
}
async function gvRender(w, SC, t) {
  const s = gvScAt(SC, t), lt = t - s.a, GV = w.GV;
  if (s !== gvCur) { gvFadeFrom = gvCur; await gvEnter(w, s); gvCur = s; }
  for (const e of s.ev || []) if (e.t > (gvLast - s.a) && e.t <= lt) await e.run(w);
  if (s.kind === 'map') await gvMapFrame(w, s.cam(lt));
  else if (s.kind === 'space') { GV.spaceGoto(s.L(lt)); appStep(w, 1); if (lt < 0.8 && s.cam) await gvMapFrame(w, s.cam(0), 300); }
  else if (s.kind === 'micro') { GV.microGoto(s.L(lt)); appStep(w, 1); }
  else if (s.kind === 'tear') {
    // 粒の計算は Worker が実時間で進める。1コマのあいだだけ動かして止め、動画の時間と計算の時間をそろえる
    const wk = GV._tear.worker;
    if (wk && (GV._tear.grab || GV._tear.torn)) { wk.postMessage({ cmd: 'run', on: true }); await sleep(1000 / FPS); wk.postMessage({ cmd: 'run', on: false }); await sleep(8); }
    appStep(w, 1); GV._tear.render();   // ちぎるの描画ループは差しかえた requestAnimationFrame に乗らないことがあるので、ここで1枚描かせる
  }
  gvLast = t;
}
// その場面で見えている canvas を描く。場面の始め 0.7 秒は前の絵（地図）の上に重ねていく
function gvDraw(g, w, t, SC) {
  const s = gvScAt(SC, t), lt = t - s.a, GV = w.GV;
  const cv = { map: GV.viewer.scene.canvas, space: w.document.getElementById('space'), micro: w.document.getElementById('micro'), tear: w.document.getElementById('tear') };
  g.fillStyle = '#000'; g.fillRect(0, 0, PW * RES, PH * RES);
  const put = (c, a) => { if (!c || !c.width || a <= 0) return; g.globalAlpha = a; g.drawImage(c, 0, 0, PW * RES, PH * RES); g.globalAlpha = 1; };
  const k = clamp(lt / 0.7, 0, 1);
  if (s.kind === 'space' && lt < 0.8) put(cv.map, 1);
  put(cv[s.kind], s.kind === 'space' ? k : s.cut ? clamp(lt / 0.5, 0, 1) : 1);
}
// 画面の幅（右上の目盛りと同じ）
function gvWidth(w) { const GV = w.GV; try { return GV.fmtLen(GV.viewWidth()); } catch (e) { return ''; } }
// 宇宙のラベル（アプリでは HTML の文字）を、同じ場所に描く
function gvSpaceLabels(g, w, f) {
  if (f <= 0) return;
  const el = w.document.getElementById('space-labels'); if (!el) return;
  const k = PW / w.innerWidth;
  prep(g); g.textAlign = 'left'; g.globalAlpha = f;
  for (const d of el.children) {
    const x = parseFloat(d.style.left) * k, y = parseFloat(d.style.top) * k, a = parseFloat(d.style.opacity || 1);
    if (!isFinite(x) || a <= 0.05) continue;
    g.globalAlpha = f * a; txt(g, d.textContent, x + 8, y, 24, '#dfe7ff', false);
  }
  g.globalAlpha = 1; g.shadowBlur = 0;
}
// 地図の出典（Cesium が地図の下に出している文字）
function gvCredits(w) {
  const el = w.document.querySelector('.cesium-widget-credits');
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}
function gvSmall(g, s, x, y, f, align = 'left') {
  if (f <= 0 || !s) return;
  prep(g); g.globalAlpha = f; g.textAlign = align;
  setFont(g, 18, false); const max = PW - 60; let t = s;
  while (g.measureText(t).width > max && t.length > 10) t = t.slice(0, -2);
  txt(g, t === s ? s : t + '…', x, y, 18, '#ddd', false);
  g.globalAlpha = 1; g.shadowBlur = 0;
}
const gvText = (w, sel) => ((w.document.querySelector(sel) || {}).textContent || '').trim();
// 対数で寄る・引く（h0 → h1 を u0 → u1 秒で）
const gvLog = (u, u0, u1, a, b) => Math.exp(lerp(Math.log(a), Math.log(b), ease((u - u0) / (u1 - u0))));
// ミクロの説明（アプリの右下の欄）: 層の名前と、説明の書き出し
function gvMicroInfo(w, n = 30) {
  const el = w.document.getElementById('micro-info'); if (!el) return [];
  const b = el.querySelector('b'), all = el.textContent.replace(/\s+/g, ' ').trim();
  const name = b ? b.textContent.trim() : '', desc = all.replace(name, '').replace('演出', '').replace('形は演出、大きさは本物', '').trim();
  return [name + '（形は演出、大きさは本物）', desc.slice(0, n) + (desc.length > n ? '…' : '')];
}
