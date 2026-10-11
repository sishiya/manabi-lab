// 開発用: 皮ふ・骨・筋肉の模型を数と絵で確かめる道具（画面からは読まない）。
// 使い方（ブラウザのコンソール、またはデバッグ用の JavaScript 実行で）:
//   await new Promise(r => { const s = document.createElement('script'); s.src = 'tools/skin-check.js?' + Date.now(); s.onload = r; document.head.appendChild(s); });
//   __thickTable()  … 骨の表面から皮ふまでの肉の厚さ（中手骨 II〜V の甲/手のひら、指の節の甲/はら）。網の姿勢・大きさをかける前
//   __boneFit()     … 骨格の頂点の、皮ふの陰関数の最大（− なら皮ふの内側。−1 より大きいと骨が皮ふに近すぎる）
//   __tissueFit(m)  … 筋肉・腱・脂肪の部品の表面の、皮ふの陰関数の最大が −m より大きいもの（+ は皮ふの外へはみ出し）
//   __snapMany(__V4) … 手以外を消して、右手を4方向から撮って全画面に出す（#sheet。消すときは document.getElementById('sheet').remove()）
//   __lbsSamples() → __lbsEval() … 骨の重みで動かした皮ふと、その姿勢で作り直した本来の形のずれ（親指の付け根のまわり）。__errMap(t, hi) … ずれを色に
//   __snapBig(eye, tgt) … 1方向から画面いっぱいに。__xsec([z…]) … 輪切り。__webProfile()・__radialTable() … 水かきと人さし指の中手骨の親指側の厚さ。__tissueVol(/正規表現/) … 模型の体積
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

// ---- v033〜: 人さし指〜手首の親指側の肉を「骨 → 筋肉・脂肪 → 皮ふ」の順で確かめる道具 ----
// __look('skin' | 'xraymus' | 'muscles' …) … 手の見え方を切りかえる（#handLook）
window.__look = v => { const s = document.getElementById('handLook'); s.value = v; s.dispatchEvent(new Event('change')); };
// __snapBig(eye, tgt, side) … いまの時刻の手を1方向から画面いっぱいに撮る（eye はカメラの位置の手首からの差 mm、tgt は見る点の手の座標）
window.__snapBig = (eye, tgt = [-20, 0, -50], side = 1) => {
  const hi = __ph.S.plan.hands.findIndex(h => h.side === side); step();
  const W = __ph.poseAt(__ph.S.t, hi).W, s = HAND.s, cv = V.r.domElement;
  if (!cv.width) { V.r.setSize(1110, 742, false); V.cam.aspect = 1110 / 742; V.cam.updateProjectionMatrix(); } // 画面が隠れていると描画の大きさが 0 になる
  __iso(true); const bg = V.scene.background; V.scene.background = new THREE.Color(0x30343c);
  const tg = [W[0] + tgt[0] * s * side, W[1] + tgt[1] * s, W[2] + tgt[2] * s];
  V.cam.position.set(tg[0] + eye[0] * side, tg[1] + eye[1], tg[2] + eye[2]); V.cam.up.set(0, 1, 0); V.cam.lookAt(...tg); V.cam.updateMatrixWorld();
  renderScene(__ph.S.t); renderScene(__ph.S.t); const url = cv.toDataURL('image/jpeg', 0.92); // 読みこんだ直後の1回目は空になることがあるので2回描く
  __iso(false); V.scene.background = bg; __sheet(url); return 'ok';
};
window.__sheet = url => {
  let img = document.getElementById('sheet');
  if (!img) { img = document.createElement('img'); img.id = 'sheet'; img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#000;z-index:9999'; document.body.appendChild(img); }
  img.src = url;
};
// 模型の部品の「中にあるか」の関数（網の姿勢）と体積（mL）
window.__tissueImplicit = () => { const R = tissueRestFrames(); return tissueParts().map(T => { const a = endAt(R[T.a.bone], endLocal(T.a, R), 1), b = endAt(R[T.b.bone], endLocal(T.b, R), 1);
  const z = sub3(b, a), L = Math.hypot(...z), zn = z.map(v => v / L); let y = R[T.a.bone].y.slice(); const d = dot3(y, zn); y = y.map((v, i) => v - zn[i] * d); const yl = Math.hypot(...y); y = y.map(v => v / yl); const x = cross3(y, zn);
  const rad = u => { const cap = Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.min(u, 1 - u) * 8) / 2))); return (T.ra + (T.rb - T.ra) * u + T.bulge * Math.sin(Math.PI * u)) * (0.35 + 0.65 * cap); };
  let vol = 0; for (let i = 0; i < 64; i++) { const r = rad((i + 0.5) / 64); vol += Math.PI * r * r * T.flat * L / 64; }
  return { T, a, b, L, vol: vol / 1000, inside: p => { const q = sub3(p, a), u = dot3(q, zn) / L; if (u < 0 || u > 1) return false; const r = rad(u), cx = dot3(q, x), cy = dot3(q, y) / T.flat; return cx * cx + cy * cy < r * r; } }; }); };
window.__tissueVol = re => __tissueImplicit().filter(t => !re || re.test(t.T.ja)).map(t => t.T.ja + ' 長さ ' + t.L.toFixed(1) + 'mm 体積 ' + t.vol.toFixed(2) + 'mL').join('\n');
// __xsec([z, …]) … 網の姿勢の手を z（手首からの距離、− が指の側）で輪切りにして並べる。肌色 = 皮ふの中、赤 = 筋肉、青 = 腱、黄 = 脂肪、白 = 中手骨（断面はだ円で近似）
window.__xsec = (zs, P) => { P = P || __P(); const TI = __tissueImplicit(); const sc = 4, X0 = -75, X1 = 45, Y0 = -55, Y1 = 30, W = (X1 - X0) * sc, H = (Y1 - Y0) * sc;
  const cols = 2, out = document.createElement('canvas'); out.width = W * cols; out.height = H * Math.ceil(zs.length / cols); const g = out.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, out.width, out.height);
  const t0 = P.rest[1][0], t1 = P.rest[1][1].o, bones = [];
  for (let f = 2; f <= 5; f++) { const { s, h } = mcEnds(f); bones.push({ s, h, r: MC_R[f], ap: MC_AP[f] }); } bones.push({ s: t0.o, h: t1, r: MC_R[1], ap: MC_AP[1] });
  zs.forEach((zz, k) => { const ox = (k % cols) * W, oy = Math.floor(k / cols) * H, img = g.createImageData(W, H);
    for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) { const x = X0 + i / sc, y = Y1 - j / sc, p = [x, y, zz]; let c = [34, 34, 34];
      if (handSDF(P, x, y, zz) < 0) c = [226, 190, 170];
      for (const t of TI) if (t.inside(p)) c = t.T.kind === 'muscle' ? [170, 60, 55] : t.T.kind === 'fat' ? [230, 200, 100] : [150, 170, 200];
      for (const B of bones) { const u = (zz - B.s[2]) / (B.h[2] - B.s[2]); if (u < -0.02 || u > 1.02) continue; const cx = B.s[0] + (B.h[0] - B.s[0]) * u, cy = B.s[1] + (B.h[1] - B.s[1]) * u, ki = u < 0.15 ? 0 : u > 0.85 ? 2 : 1;
        if (((x - cx) / B.r[ki]) ** 2 + ((y - cy) / B.ap[ki]) ** 2 < 1) c = [240, 240, 225]; }
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const o = ((j + b) * W + i + a) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255; } }
    g.putImageData(img, ox, oy); g.fillStyle = '#ff0'; g.font = '20px sans-serif'; g.fillText('手首から ' + (-zz) + 'mm（左が親指の側・上が甲）', ox + 6, oy + 22); });
  __sheet(out.toDataURL('image/png')); return 'ok'; };
// __webProfile() … 親指と人さし指のあいだ（水かき）の厚さ。2本の中手骨のなす面に垂直に、ふちから 5〜30mm の所で測る
// （くらべる値: 親指と人さし指の角をつまんだ厚さ 男性 12.5±2.8・女性 10.5±2.3mm。Lameu ほか 2004、421 人、キャリパーで 10 g/mm² 押した値）
window.__webProfile = P => { P = P || __P(); const t0 = P.rest[1][0], t1 = P.rest[1][1].o, { s, h } = mcEnds(2), nrm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const d1 = nrm(sub3(t1, t0.o)), d2 = nrm(sub3(h, s)), n = nrm(cross3(d1, d2)), bis = nrm(add3(d1, d2)), A = lerp3(t0.o, s, 0.5), out = [];
  let edge = 0; for (let t = 0; t < 120; t += 0.5) { if (handSDF(P, ...A.map((v, i) => v + bis[i] * t)) > 0) { edge = t; break; } }
  for (const back of [5, 10, 15, 20, 25, 30]) { const p = A.map((v, i) => v + bis[i] * (edge - back)); out.push('ふちから ' + back + 'mm: ' + (__march(P, p, n) + __march(P, p, n.map(v => -v))).toFixed(1)); }
  return out.join('  '); };
// __radialTable() … 人さし指の中手骨の中心から、親指の側（外・外上・外下）と甲へ、皮ふまでの距離（mm）
window.__radialTable = P => { P = P || __P(); const { s, h } = mcEnds(2), out = [];
  for (const u of [0, 0.2, 0.4, 0.6, 0.8, 1.0]) { const p = s.map((v, i) => v + (h[i] - v) * u), r = [];
    for (const [nm, d] of [['外', [-1, 0, 0]], ['外上', [-0.707, 0.707, 0]], ['甲', [0, 1, 0]]]) r.push(nm + ' ' + __march(P, p, d).toFixed(1));
    out.push('u=' + u + ' ' + r.join(' ')); }
  return out.join('\n'); };
// __posed(t, hi) … 時刻 t の皮ふの頂点を CPU で動かす（GPU のスキニングと同じ: 4本の骨の重み＋関節の内側のふくらみ）
window.__posed = (t, hi = 0) => { const S = SKIN_DATA, P = __ph.poseAt(t, hi), B = poseBones(P), M = new Float32Array(N_BONES * 16); skinMatrices(S, B, M); const fl = new Float32Array(N_BONES); jointFlex(P, fl);
  const out = new Float32Array(S.NV * 3), pos = S.pos0, bi = S.bi, bw = S.bw, aJ = S.aJ, nrm = S.nrm0;
  for (let v = 0; v < S.NV; v++) { const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], inf = aJ[v * 2 + 1] * fl[aJ[v * 2]] * 2.6, px = x + nrm[v * 3] * inf, py = y + nrm[v * 3 + 1] * inf, pz = z + nrm[v * 3 + 2] * inf; let a = 0, b = 0, c = 0;
    for (let k = 0; k < 4; k++) { const bb = bi[v * 4 + k], w = bw[v * 4 + k]; if (!w) continue; const e = M.subarray(bb * 16, bb * 16 + 16); a += w * (e[0] * px + e[4] * py + e[8] * pz + e[12]); b += w * (e[1] * px + e[5] * py + e[9] * pz + e[13]); c += w * (e[2] * px + e[6] * py + e[10] * pz + e[14]); }
    out[v * 3] = a; out[v * 3 + 1] = b; out[v * 3 + 2] = c; }
  return { out, M, B, P }; };
// __creases(t, box) … 親指と人さし指のあいだ（網の姿勢で x < box.x1 など）の、となりの三角形どうしの折れ角。休みの形と時刻 t の姿勢でくらべる
window.__creases = (t, box = { x1: -5, z0: -95, z1: -10 }, hi = 0) => { const S = SKIN_DATA, { out } = __posed(t, hi), idx = S.idx, P0 = S.pos0;
  const fn = (A, a, b, c) => { const u = [A[b * 3] - A[a * 3], A[b * 3 + 1] - A[a * 3 + 1], A[b * 3 + 2] - A[a * 3 + 2]], w = [A[c * 3] - A[a * 3], A[c * 3 + 1] - A[a * 3 + 1], A[c * 3 + 2] - A[a * 3 + 2]]; const n = cross3(u, w), l = Math.hypot(...n) || 1; return n.map(x => x / l); };
  const edges = new Map();
  for (let t3 = 0; t3 < idx.length; t3 += 3) { const a = idx[t3], b = idx[t3 + 1], c = idx[t3 + 2], cx = (P0[a * 3] + P0[b * 3] + P0[c * 3]) / 3, cz = (P0[a * 3 + 2] + P0[b * 3 + 2] + P0[c * 3 + 2]) / 3;
    if (cx > box.x1 || cz > box.z1 || cz < box.z0) continue; const n0 = fn(P0, a, b, c), n1 = fn(out, a, b, c);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) { const k = p < q ? p + '_' + q : q + '_' + p, e = edges.get(k); if (e) e.push([n0, n1]); else edges.set(k, [[n0, n1]]); } }
  const res = []; for (const [k, e] of edges) { if (e.length < 2) continue; const p = +k.split('_')[0]; res.push([Math.acos(Math.min(1, dot3(e[0][1], e[1][1]))) * 57.3, Math.acos(Math.min(1, dot3(e[0][0], e[1][0]))) * 57.3, [P0[p * 3], P0[p * 3 + 1], P0[p * 3 + 2]]]); }
  return res.sort((x, y) => y[0] - x[0]); };
// __timeSheet(hi, [t…], eyeOff) … 手 hi を、いくつかの時刻で同じ向きから撮って並べる（カメラは最初の時刻の手首 − 60mm を見る。eyeOff はそこからのカメラの位置）。
// 左上に時刻と手首の曲げ W[7]
window.__timeSheet = (hi, times, eyeOff) => { const cv = V.r.domElement; if (!cv.width) { V.r.setSize(1110, 742, false); V.cam.aspect = 1110 / 742; V.cam.updateProjectionMatrix(); }
  const cw = cv.width / 2, ch = cv.height / 2, out = document.createElement('canvas'); out.width = cw * 3; out.height = ch * Math.ceil(times.length / 3); const g = out.getContext('2d');
  __iso(true); const bg = V.scene.background; V.scene.background = new THREE.Color(0x30343c); const W0 = __ph.poseAt(times[0], hi).W;
  times.forEach((t, i) => { __ph.setTime(t); step(); const tg = [W0[0], W0[1] - 10, W0[2] - 60]; V.cam.position.set(tg[0] + eyeOff[0], tg[1] + eyeOff[1], tg[2] + eyeOff[2]); V.cam.up.set(0, 1, 0); V.cam.lookAt(...tg); V.cam.updateMatrixWorld();
    renderScene(t); renderScene(t); g.drawImage(cv, (i % 3) * cw, Math.floor(i / 3) * ch, cw, ch); const P = __ph.poseAt(t, hi); g.fillStyle = '#ff0'; g.font = '22px sans-serif'; g.fillText(t.toFixed(2) + 's 手首の曲げ ' + ((P.W[7] || 0) * 57.3).toFixed(1) + '°', (i % 3) * cw + 8, Math.floor(i / 3) * ch + 26); });
  __iso(false); V.scene.background = bg; __sheet(out.toDataURL('image/jpeg', 0.9)); return 'ok'; };
// ---- v040〜: 骨の重みで動かした皮ふが、その姿勢で作り直した陰関数（本来の形）からどれだけずれるか ----
// __lbsSamples(ids) … 曲（ids）の両手から 0.4 秒ごとに指の角度を集める（手の座標なので左手も同じに扱える）
window.__lbsSamples = async (ids = ['elise2', 'scale', 'chords', 'chopin', 'arp', 'twinkle', 'bravura', 'scale2']) => { const out = [];
  for (const id of ids) { __ph.loadSong(id); await new Promise(r => setTimeout(r, 200)); __ph.S.plan.hands.forEach((h, hi) => { for (let t = h.notes[0].t0; t < h.notes[h.notes.length - 1].t1; t += 0.4) out.push(__ph.poseAt(t, hi).fingers.map(f => f && { yaw: f.ang.yaw, a1: f.ang.a1, a2: f.ang.a2 })); }); }
  return (window.__samples = out); };
// __lbsErrOne(fs, sel) … 指の角度 fs のときの、頂点 sel の「本来の形の陰関数の値」（− は本来の形より内側へへこむ、+ は外へふくらむ）
window.__lbsErrOne = (fs, sel) => { const S = SKIN_DATA, pos = S.pos0, bi = S.bi, bw = S.bw, aJ = S.aJ, nrm = S.nrm0, fingers = [null];
  for (let f = 1; f <= 5; f++) fingers.push({ ang: fs[f] });
  const pose = { W: [0, 0, 0, 0, 1], fingers }, B = poseBones(pose), M = new Float32Array(N_BONES * 16); skinMatrices(S, B, M); const fl = new Float32Array(N_BONES); jointFlex(pose, fl);
  const keep = REST_DEG.map(d => d && d.slice()); for (let f = 1; f <= 5; f++) REST_DEG[f] = [fs[f].yaw / D2R, fs[f].a1 / D2R, fs[f].a2 / D2R]; const Pt = buildPrims(); for (let f = 1; f <= 5; f++) REST_DEG[f] = keep[f];
  return sel.map(v => { const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], inf = aJ[v * 2 + 1] * fl[aJ[v * 2]] * 2.6, px = x + nrm[v * 3] * inf, py = y + nrm[v * 3 + 1] * inf, pz = z + nrm[v * 3 + 2] * inf; let a = 0, b = 0, c = 0;
    for (let k = 0; k < 4; k++) { const bb = bi[v * 4 + k], w = bw[v * 4 + k]; if (!w) continue; const e = M.subarray(bb * 16, bb * 16 + 16); a += w * (e[0] * px + e[4] * py + e[8] * pz + e[12]); b += w * (e[1] * px + e[5] * py + e[9] * pz + e[13]); c += w * (e[2] * px + e[6] * py + e[10] * pz + e[14]); }
    return handSDF(Pt, a, b, c); }); };
// __thumbVerts() … 親指の付け根のまわりの頂点（網の姿勢で x < −5・手首〜指の付け根、親指の骨の重みがあって人さし指〜小指の重みがない）
window.__thumbVerts = () => { const S = SKIN_DATA, pos = S.pos0, sel = [];
  for (let v = 0; v < S.NV; v++) { if (!(pos[v * 3] < -5 && pos[v * 3 + 2] > -100 && pos[v * 3 + 2] < 10)) continue; let wt = 0, wo = 0;
    for (let k = 0; k < 4; k++) { const b = S.bi[v * 4 + k], w = S.bw[v * 4 + k]; if (b >= 2 && b <= 4) wt += w; else if (b >= 5) wo += w; }
    if (wo < 0.05 && wt > 0.02) sel.push(v); }
  return sel; };
// __lbsEval(n) … __samples から n 個の姿勢で、親指の付け根のまわりのずれ（mm）: 平均・へこみ（中央値・下から 10%・最悪）・ふくらみ
window.__lbsEval = (n = 110) => { const sel = __thumbVerts(), step = Math.max(1, Math.floor(__samples.length / n)), dn = [], bu = [], mn = [];
  for (let i = 0; i < __samples.length; i += step) { const e = __lbsErrOne(__samples[i], sel); dn.push(Math.min(0, ...e)); bu.push(Math.max(0, ...e)); mn.push(e.reduce((s, d) => s + Math.abs(d), 0) / e.length); }
  const q = (a, p) => { a = [...a].sort((x, y) => x - y); return +a[Math.floor(p * (a.length - 1))].toFixed(1); };
  return { 姿勢: dn.length, 平均: +(mn.reduce((s, v) => s + v, 0) / mn.length).toFixed(2), へこみ中央: q(dn, 0.5), へこみ10: q(dn, 0.1), へこみ最悪: q(dn, 0), ふくらみ中央: q(bu, 0.5), ふくらみ90: q(bu, 0.9) }; };
// __errMap(t, hi) / __errOff() … 時刻 t のずれを皮ふの色に（青 = 本来の形より内側、赤 = 外側、4mm で真っ青・真っ赤）
window.__errMap = (t, hi) => { const S = SKIN_DATA, P0 = __ph.poseAt(t, hi), all = [...Array(S.NV).keys()].filter(v => S.pos0[v * 3 + 2] < 20);
  const e = __lbsErrOne(P0.fingers.map(f => f && f.ang), all); if (!S.col0) S.col0 = S.col.slice();
  all.forEach((v, i) => { const k = Math.min(1, Math.abs(e[i]) / 4), c = e[i] < 0 ? [0.05, 0.15, 1] : [1, 0.1, 0.05]; for (let j = 0; j < 3; j++) S.col[v * 3 + j] = S.col0[v * 3 + j] * (1 - k) + c[j] * k; });
  for (const VH of V.hands) VH.skin.mesh.geometry.attributes.color.needsUpdate = true; return 'ok'; };
window.__errOff = () => { const S = SKIN_DATA; if (S.col0) S.col.set(S.col0); for (const VH of V.hands) VH.skin.mesh.geometry.attributes.color.needsUpdate = true; };
