// 開発用: 皮ふ・骨・筋肉の模型を数と絵で確かめる道具（画面からは読まない）。
// 使い方（ブラウザのコンソール、またはデバッグ用の JavaScript 実行で）:
//   await new Promise(r => { const s = document.createElement('script'); s.src = 'tools/skin-check.js?' + Date.now(); s.onload = r; document.head.appendChild(s); });
//   __thickTable()  … 骨の表面から皮ふまでの肉の厚さ（中手骨 II〜V の甲/手のひら、指の節の甲/はら）。網の姿勢・大きさをかける前
//   __boneFit()     … 骨格の頂点の、皮ふの陰関数の最大（− なら皮ふの内側。−1 より大きいと骨が皮ふに近すぎる）
//   __tissueFit(m)  … 筋肉・腱・脂肪の部品の表面の、皮ふの陰関数の最大が −m より大きいもの（+ は皮ふの外へはみ出し）
//   __snapMany(__V4) … 手以外を消して、右手を4方向から撮って全画面に出す（#sheet。消すときは document.getElementById('sheet').remove()）
'use strict';
// 皮ふの陰関数の部品は測るたびに作り直す（__P() は網を作ったあと大きさをかけるときに骨の原点が書きかわるので、大きさが 1 でない手では指がずれる）
const __P = () => buildPrims();
window.__march = (P, p, dir) => { for (let t = 0; t < 60; t += 0.1) if (handSDF(P, p[0] + dir[0] * t, p[1] + dir[1] * t, p[2] + dir[2] * t) > 0) return t; return 99; };
window.__thickTable = () => {
  const P = __P(), R = tissueRestFrames(), rows = [];
  for (let f = 2; f <= 5; f++) {
    const { s, h } = mcEnds(f), r = [];
    for (const u of [0.2, 0.5, 0.8, 1.0]) {
      const p = s.map((v, i) => v + (h[i] - v) * u), ry = MC_R[f][u > 0.9 ? 2 : 1] * 0.85;
      r.push((__march(P, p, [0, 1, 0]) - ry).toFixed(1) + '/' + (__march(P, p, [0, -1, 0]) - ry).toFixed(1));
    }
    rows.push('中手骨' + f + ' 甲/手のひら u=.2 .5 .8 1: ' + r.join('  '));
  }
  for (let f = 1; f <= 5; f++) {
    const r = [];
    for (let j = 0; j < 3; j++) {
      const B = R[boneOf(f, j)], L = FINGERS_U[f].L[j], ry = BONE_R[f][j][1] * 0.78, lift = j === 2 ? distalTilt(f) * 0.5 : 0;
      const p = B.o.map((v, i) => v + B.z[i] * L * 0.5 + B.y[i] * lift);
      r.push((__march(P, p, B.y) - ry).toFixed(1) + '/' + (__march(P, p, B.y.map(v => -v)) - ry).toFixed(1));
    }
    rows.push('指' + f + ' 甲/はら 節0 1 2: ' + r.join('  '));
  }
  return rows.join('\n');
};
window.__boneFit = () => {
  const P = __P(), R = tissueRestFrames(), H = V.hands[0].bones, res = {};
  const M = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const p of H.parts) {
    frameMat(R[p.bone], M).multiply(p.local);
    const pos = p.mesh.geometry.attributes.position; let worst = -1e9;
    for (let i = 0; i < pos.count; i += 2) { v.fromBufferAttribute(pos, i).applyMatrix4(M); worst = Math.max(worst, handSDF(P, v.x, v.y, v.z)); }
    const name = p.bone <= 1 ? (p.bone === 0 ? '前腕' : '手のひら') : '指' + (Math.floor((p.bone - 2) / 3) + 1) + '-' + ((p.bone - 2) % 3);
    res[name] = Math.max(res[name] ?? -1e9, worst);
  }
  return Object.entries(res).map(([k, w]) => k + ' ' + w.toFixed(1)).join(', ');
};
window.__tissueFit = (margin = 0) => {
  const R = tissueRestFrames(), P = __P(), out = [];
  tissueParts().forEach((T, idx) => {
    const a = endAt(R[T.a.bone], endLocal(T.a, R), 1), b = endAt(R[T.b.bone], endLocal(T.b, R), 1);
    const z = sub3(b, a), L = Math.hypot(...z), zn = z.map(v => v / L);
    let y = R[T.a.bone].y.slice(); const d = dot3(y, zn); y = y.map((v, i) => v - zn[i] * d); const yl = Math.hypot(...y); y = y.map(v => v / yl);
    const x = cross3(y, zn);
    let worst = -1e9;
    for (let i = 1; i < 10; i++) {
      const u = i / 10, r = T.ra + (T.rb - T.ra) * u + T.bulge * Math.sin(Math.PI * u);
      for (let k = 0; k < 12; k++) {
        const th = k / 12 * 2 * Math.PI, cx = Math.cos(th) * r, cy = Math.sin(th) * r * T.flat;
        worst = Math.max(worst, handSDF(P, a[0] + zn[0] * u * L + x[0] * cx + y[0] * cy, a[1] + zn[1] * u * L + x[1] * cx + y[1] * cy, a[2] + zn[2] * u * L + x[2] * cx + y[2] * cy));
      }
    }
    if (worst > -margin) out.push(idx + ' ' + T.ja + ' ' + worst.toFixed(1));
  });
  return out.join('\n');
};
window.__iso = on => {
  const keep = new Set();
  for (const VH of V.hands) { keep.add(VH.skin.mesh); VH.skin.nails.forEach(n => keep.add(n.mesh)); keep.add(VH.bones.group); keep.add(VH.tissue.group); }
  for (const o of V.scene.children) {
    if (o.isLight || keep.has(o)) continue;
    if (on) { o.userData._v = o.visible; o.visible = false; } else if (o.userData._v !== undefined) { o.visible = o.userData._v; delete o.userData._v; }
  }
};
// views: [[カメラの位置（手首からの差、mm）, 見る点（手の座標、大きさをかける前）], ...]
window.__snapMany = (views, side = 1) => {
  const hi = __ph.S.plan.hands.findIndex(h => h.side === side); step();
  const W = __ph.poseAt(__ph.S.t, hi).W, s = HAND.s, cv = V.r.domElement, cw = cv.width / 2, ch = cv.height / 2;
  const out = document.createElement('canvas'); out.width = cw * 2; out.height = ch * Math.ceil(views.length / 2);
  const g = out.getContext('2d');
  __iso(true); const bg = V.scene.background; V.scene.background = new THREE.Color(0x30343c);
  views.forEach(([eye, tgt], i) => {
    const tg = [W[0] + tgt[0] * s, W[1] + tgt[1] * s, W[2] + tgt[2] * s];
    V.cam.position.set(tg[0] + eye[0], tg[1] + eye[1], tg[2] + eye[2]); V.cam.up.set(0, 1, 0); V.cam.lookAt(...tg); V.cam.updateMatrixWorld();
    renderScene(__ph.S.t); g.drawImage(cv, (i % 2) * cw, Math.floor(i / 2) * ch, cw, ch);
  });
  __iso(false); V.scene.background = bg;
  let img = document.getElementById('sheet');
  if (!img) { img = document.createElement('img'); img.id = 'sheet'; img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#000;z-index:9999'; document.body.appendChild(img); }
  img.src = out.toDataURL('image/jpeg', 0.9);
  return 'ok';
};
// 甲の側・小指の側から・親指の側から・指先の側から
window.__V4 = [[[0, 230, 40], [0, 0, -60]], [[150, 120, 60], [0, 0, -60]], [[-160, 110, 40], [0, 0, -60]], [[0, -30, -230], [0, 0, -60]]];
// 手のひら側（下から）
window.__VPALM = [[[0, -230, 30], [0, 0, -60]], [[120, -150, 40], [0, 0, -60]]];

// いろいろな力の入れ方・曲げ方の瞬間（ユーザーの希望、2026-10-11: 脱力した姿勢だけでなく、押して構えた・広げた・曲げた姿勢でも確かめる）。
// いまの曲の片手から、①親指で押している ②親指をいちばんくぐらせた ③親指をいちばん開いた ④指をいちばん深く曲げた ⑤親指〜小指をいちばん広げた
// ⑥和音を押している 瞬間をさがす。__poseSheet() で、それぞれをななめ上から撮って並べる
window.__poseMoments = (side = 1) => {
  const hi = __ph.S.plan.hands.findIndex(h => h.side === side), h = __ph.S.plan.hands[hi];
  if (!h) return {};
  const best = {}, put = (k, v, t) => { if (!best[k] || v > best[k].v) best[k] = { v, t }; };
  for (let t = Math.max(0, h.notes[0].t0); t < h.notes[h.notes.length - 1].t1; t += 1 / 30) {
    const P = __ph.poseAt(t, hi), f = P.fingers, ang = f[1].ang;
    if (f[1].press) put('親指で押す', 1 - Math.abs(t - f[1].press.t0 - 0.05), t);
    put('親指くぐり', -(ang.yaw), t); put('親指を開く', ang.yaw, t);
    put('深く曲げる', [2, 3, 4, 5].reduce((s, k) => s + f[k].ang.a1 + f[k].ang.a2, 0), t);
    const a = f[1].pts[3], b = f[5].pts[3]; put('広げる', Math.hypot(a[0] - b[0], a[2] - b[2]), t);
    put('和音', f.slice(1).filter(x => x.press).length, t);
  }
  return Object.fromEntries(Object.entries(best).map(([k, o]) => [k, +o.t.toFixed(2)]));
};
window.__poseSheet = (side = 1, eye = [-80, 150, 140], tgt = [-15, 0, -60]) => {
  const M = __poseMoments(side), hi = __ph.S.plan.hands.findIndex(h => h.side === side), keys = Object.keys(M);
  const cv = V.r.domElement, cw = cv.width / 2, ch = cv.height / 2, cols = 3, out = document.createElement('canvas');
  out.width = cw * cols; out.height = ch * Math.ceil(keys.length / cols); const g = out.getContext('2d');
  keys.forEach((k, i) => {
    __ph.setTime(M[k]); step(); const W = __ph.poseAt(M[k], hi).W, s = HAND.s, tg = [W[0] + tgt[0] * s * side, W[1] + tgt[1] * s, W[2] + tgt[2] * s];
    V.cam.position.set(tg[0] + eye[0] * side, tg[1] + eye[1], tg[2] + eye[2]); V.cam.up.set(0, 1, 0); V.cam.lookAt(...tg); V.cam.updateMatrixWorld(); renderScene(M[k]);
    g.drawImage(cv, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch); g.fillStyle = '#ff0'; g.font = '22px sans-serif'; g.fillText(k + ' ' + M[k] + 's', (i % cols) * cw + 8, Math.floor(i / cols) * ch + 26);
  });
  let img = document.getElementById('sheet');
  if (!img) { img = document.createElement('img'); img.id = 'sheet'; img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#000;z-index:9999'; document.body.appendChild(img); }
  img.src = out.toDataURL('image/jpeg', 0.9);
  return M;
};
