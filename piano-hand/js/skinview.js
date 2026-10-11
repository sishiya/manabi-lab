// リアルな手の描画: 皮ふの網（skin.js）を GPU でスキニングする（骨 17 本の行列を uniform で渡す）。
// 肌の材質（細かい凹凸・指紋・しわ・色むら・赤みの散乱）・関節の内側のふくらみ・爪・部屋の映りこみ。右手と左手（鏡）
'use strict';

// 部屋の映りこみ: 暗い部屋に大きな窓の光と、やわらかい光の板をいくつか置いて PMREM にする
function makeEnv(renderer) {
  const es = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.05, 0.055), side: THREE.BackSide }));
  room.position.y = 2; es.add(room);
  const panel = (w, h, x, y, z, c, ry, rx) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); es.add(m);
  };
  panel(4, 2.4, -2.5, 3.4, -1, new THREE.Color(1.5, 1.4, 1.3), 0.6, Math.PI / 2.4); // 左上の窓（明るすぎると白鍵に映りこんで、光のにじみで白くかすむ）
  panel(3, 1.5, 3.5, 2.2, 2, new THREE.Color(0.9, 0.95, 1.1), -1.2);               // 右の柔らかい光
  panel(6, 1, 0, -0.9, 0, new THREE.Color(0.25, 0.2, 0.17), 0, -Math.PI / 2);       // 床の照り返し
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(es, 0.03).texture;
  pm.dispose();
  return tex;
}

// スキニング（頂点シェーダー）: 4本の骨の行列の重みつき和。関節の内側は曲げた角度に応じて法線の向きに押し出す
const SKIN_VERT_HEAD = `
uniform mat4 uBones[${N_BONES}];
uniform float uFlex[${N_BONES}];
attribute vec4 aBi; attribute vec4 aBw; attribute vec2 aJ;
`;
const SKIN_VERT_MAT = `
  mat4 skM = uBones[int(aBi.x)] * aBw.x + uBones[int(aBi.y)] * aBw.y + uBones[int(aBi.z)] * aBw.z + uBones[int(aBi.w)] * aBw.w;
  float skInf = aJ.y * uFlex[int(aJ.x)] * 2.6; // 関節の内側のふくらみ（mm）
`;

// 肌のシェーダーに足すもの: 3次元のノイズ（網を作った姿勢の座標で）による毛穴と小じわ、関節のしわ、指紋、手のひらのしわ、色むら
const SKIN_GLSL_HEAD = `
varying vec3 vRest; varying float vWrk; varying float vAlong; varying vec3 vPad; varying float vCrease;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
// 画素より細かい凹凸はちらつくので、1画素が何 mm かを見て弱める
float skinH(){
  float px = length(fwidth(vRest));
  float fine = 1.0 - smoothstep(0.12, 0.3, px), mid = 1.0 - smoothstep(0.3, 0.8, px);
  float pores = (vn(vRest * 2.2) - 0.5) * 0.035 * fine + (vn(vRest * 0.9 + 7.0) - 0.5) * 0.05 * mid;
  // 関節の甲のしわ: 浅く、ところどころ途切れる（規則正しく深いと、じゃばらのように見えた）
  float brk = smoothstep(0.3, 0.75, vn(vRest * 0.28 + vec3(0.0, 0.0, vAlong * 0.15)));
  float wr = vWrk * brk * pow(abs(sin(vAlong * 1.5 + vn(vRest * 0.5) * 3.0)), 6.0) * -0.10 * (1.0 - smoothstep(0.35, 0.9, px));
  // 指紋: はらの中心からの楕円の渦（0.45mm 間隔）。少しゆがませる
  float r = length(vPad.xy * vec2(1.0, 0.8)) + (vn(vRest * 0.35) - 0.5) * 1.2;
  float print = vPad.z * (0.5 + 0.5 * sin(r * 13.9)) * -0.05 * fine;
  float crease = -0.35 * vCrease * (1.0 - smoothstep(0.5, 1.4, px));
  return pores + wr + print + crease;
}
vec3 skinBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float fd){
  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
  vec3 r1 = cross(sy, surf_norm), r2 = cross(surf_norm, sx);
  float det = dot(sx, r1) * fd;
  vec3 g = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surf_norm - g);
}
`;


// 前腕の肘の側（v034〜、ユーザーの希望「暗い部屋で照明が肘の先までしか当たっていないように。腕の決まった場所ではなく、場所で『ここから先は映らない』」）:
// 部屋の座標で、鍵盤の手前の端から体の側へ DARK_Z の範囲で、皮ふの色をなめらかにシーンの背景の色へ溶かす（暗い部屋では暗がりに沈んで見える。
// 明るい部屋では背景の明るい色へ溶ける）。腕のどこで消えるかは手首の位置で変わる。
// そのうえで、網の肘の側の端（切り口）が見えないよう、手首から ARM_FADE の範囲を透けさせる（v030〜。v034 からは網の端の近くだけ、安全のため）
const DARK_Z = [150, 250];
const SKIN_DARK = { uDarkZ: { value: new THREE.Vector2(DARK_Z[0], DARK_Z[1]) }, uDark: { value: new THREE.Color(0, 0, 0) } };
const ARM_FADE = [235, 272];
const FADE_GLSL = 'uniform vec2 uArmFade; varying float vRestZ; uniform vec2 uDarkZ; uniform vec3 uDark; varying float vWorldZ;\n';
const FADE_FRAG = '  { float fz = smoothstep(uArmFade.x, uArmFade.y, vRestZ); if (fz > 0.0 && fz >= fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard; }\n';
function makeSkinMaterials(U, fade) {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true, color: 0xffffff, roughness: 0.5, metalness: 0,
    clearcoat: 0.12, clearcoatRoughness: 0.42, sheen: new THREE.Color(0.32, 0.12, 0.08),
    envMapIntensity: 0.7,
  });
  m.onBeforeCompile = sh => {
    sh.uniforms.uBones = U.uBones; sh.uniforms.uFlex = U.uFlex; sh.uniforms.uArmFade = U.uArmFade; sh.uniforms.uDarkZ = SKIN_DARK.uDarkZ; sh.uniforms.uDark = SKIN_DARK.uDark;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + FADE_GLSL + SKIN_VERT_HEAD + 'attribute float aWrk; attribute float aAlong; attribute vec3 aPad; attribute float aCrease;\nvarying vec3 vRest; varying float vWrk; varying float vAlong; varying vec3 vPad; varying float vCrease;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + SKIN_VERT_MAT + '  objectNormal = normalize(mat3(skM) * objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = (skM * vec4(position + normal * skInf, 1.0)).xyz;\nvRest = position; vRestZ = position.z; vWorldZ = (modelMatrix * vec4(transformed, 1.0)).z; vWrk = aWrk; vAlong = aAlong; vPad = aPad; vCrease = aCrease;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FADE_GLSL + SKIN_GLSL_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (fade ? '  diffuseColor.a *= 1.0 - smoothstep(uArmFade.x, uArmFade.y, vRestZ);\n' : '') + '  diffuseColor.rgb *= (0.94 + 0.12 * vn(vRest * 0.12) + 0.04 * vn(vRest * 0.6)) * (1.0 - 0.18 * vCrease);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor *= 0.85 + 0.3 * vn(vRest * 0.4 + 3.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  { float hh = skinH(); normal = skinBump(-vViewPosition, normal, vec2(dFdx(hh), dFdy(hh)), gl_FrontFacing ? 1.0 : -1.0); }')
      .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', 'outgoingLight = mix(outgoingLight, uDark, smoothstep(uDarkZ.x, uDarkZ.y, vWorldZ));\n  gl_FragColor = vec4( outgoingLight, diffuseColor.a );') // three.js r128 には output_fragment がない
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);\n    totalEmissiveRadiance += diffuseColor.rgb * (vec3(0.05, 0.012, 0.006) + rim * vec3(0.10, 0.025, 0.012)); }'); // 皮ふの下で散った赤い光（近似）。ふちほど光が皮ふを通って赤く透ける
  };
  if (fade) { m.transparent = true; m.depthWrite = false; }
  m.customProgramCacheKey = () => fade ? 'skin-fade' : 'skin'; // シェーダーの作り方の文字列が同じなので、区別しないと同じプログラムが使い回された
  // 影も同じ形で落とす
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = sh => {
    sh.uniforms.uBones = U.uBones; sh.uniforms.uFlex = U.uFlex; sh.uniforms.uArmFade = U.uArmFade;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + FADE_GLSL + SKIN_VERT_HEAD)
      .replace('#include <begin_vertex>', SKIN_VERT_MAT + 'vec3 transformed = (skM * vec4(position + normal * skInf, 1.0)).xyz; vRestZ = position.z;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FADE_GLSL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FADE_FRAG);
  };
  return { m, d };
}

let SKIN_DATA = null;
// 片手分の皮ふと爪を作る（side: 右手 1・左手 -1）
function makeSkinHand(sc, side) {
  const S = SKIN_DATA || (SKIN_DATA = buildSkin());
  const U = { uBones: { value: new Float32Array(N_BONES * 16) }, uFlex: { value: new Float32Array(N_BONES) }, uArmFade: { value: new THREE.Vector2(ARM_FADE[0] * HAND.s, ARM_FADE[1] * HAND.s) } };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(S.pos0, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(S.nrm0, 3));
  g.setAttribute('color', new THREE.BufferAttribute(S.col, 3));
  g.setAttribute('aBi', new THREE.BufferAttribute(Float32Array.from(S.bi), 4));
  g.setAttribute('aBw', new THREE.BufferAttribute(S.bw, 4));
  g.setAttribute('aJ', new THREE.BufferAttribute(S.aJ, 2));
  g.setAttribute('aWrk', new THREE.BufferAttribute(S.aWrk, 1));
  g.setAttribute('aAlong', new THREE.BufferAttribute(S.aAlong, 1));
  g.setAttribute('aPad', new THREE.BufferAttribute(S.aPad, 3));
  g.setAttribute('aCrease', new THREE.BufferAttribute(S.aCrease, 1));
  // 左手は鏡に映すので三角形の向きを逆に
  const idx = side > 0 ? S.idx : S.idx.slice();
  if (side < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  // 前腕の肘の側（透けて消える所）の三角形を後ろへまとめ、半透明の材質で描く
  const z0 = ARM_FADE[0] * HAND.s - 2, op = [], fd = [];
  for (let i = 0; i < idx.length; i += 3) (Math.max(S.pos0[idx[i] * 3 + 2], S.pos0[idx[i + 1] * 3 + 2], S.pos0[idx[i + 2] * 3 + 2]) > z0 ? fd : op).push(idx[i], idx[i + 1], idx[i + 2]);
  const idx2 = op.concat(fd);
  g.setIndex(S.NV > 65535 ? new THREE.Uint32BufferAttribute(idx2, 1) : new THREE.Uint16BufferAttribute(idx2, 1));
  g.addGroup(0, op.length, 0); g.addGroup(op.length, fd.length, 1);
  const mats = makeSkinMaterials(U), matsF = makeSkinMaterials(U, true);
  const mesh = new THREE.Mesh(g, [mats.m, matsF.m]);
  mesh.customDepthMaterial = mats.d;
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  sc.add(mesh);
  // 爪: 末節骨の座標軸をそのまま物体の行列にする（網は骨の座標で持っている）
  // 爪は半透明（下の爪床の桃色と、先の白いふちが透けて見える）。つやは強く
  // v031〜: ふち（両わき・根もと）はなめらかに透明にして皮ふへ溶かし（境目が線に見えないように）、表面には縦の細いすじ。先の白いはみ出しは少しにごる
  const nailMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.0, side: THREE.DoubleSide, transparent: true, opacity: 0.88, depthWrite: false, emissive: new THREE.Color(0.05, 0.015, 0.012) });
  nailMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aNail; varying vec2 vNail;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vNail = aNail;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vNail;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  { float sd = abs(vNail.y * 2.0 - 1.0); diffuseColor.a *= (1.0 - smoothstep(0.7, 1.0, sd)) * smoothstep(0.0, 0.12, vNail.x) * (vNail.x > 0.9 ? 1.25 : 1.0); }')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  { float h = 0.012 * sin(vNail.y * 75.0 + sin(vNail.x * 7.0) * 0.8) * smoothstep(0.1, 0.4, vNail.x); vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition); vec3 nr1 = cross(sy, normal), nr2 = cross(normal, sx); float det = dot(sx, nr1); normal = normalize(abs(det) * normal - sign(det) * (dFdx(h) * nr1 + dFdy(h) * nr2)); }');
  };
  nailMat.customProgramCacheKey = () => 'nail'; // 変数名に r1・r2 を使わない（three.js の中に #define r1 0.8 があり、数字に化けてシェーダーが壊れた）
  const nails = S.nails.map(N => {
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(N.pos, 3)); ng.setAttribute('color', new THREE.BufferAttribute(N.col, 3)); ng.setAttribute('aNail', new THREE.BufferAttribute(N.uv, 2)); ng.setIndex(N.idx);
    ng.computeVertexNormals();
    const nm = new THREE.Mesh(ng, nailMat); nm.castShadow = true; nm.receiveShadow = true; nm.frustumCulled = false;
    nm.matrixAutoUpdate = false;
    sc.add(nm);
    return { f: N.f, mesh: nm };
  });
  return { side, S, U, mesh, mat: mats.m, matF: matsF.m, nails };
}

const _fm = new THREE.Matrix4();
function updateSkinHand(H, pose, opt) {
  // 骨と重ねる（xray）ときは、皮ふをうすく透かして骨格もいっしょに見せる
  const show = !!pose && (opt.xray || (!opt.bones && !opt.muscles)); // 筋肉を見せるときは皮ふを消す（重ねるときは透かす）
  H.mesh.visible = show;
  for (const n of H.nails) n.mesh.visible = show && !opt.xray;
  if (!show) return;
  const mode = opt.xray ? 'x' : opt.ghost ? 'g' : '';
  if (H.mat.userData.mode !== mode) {
    H.mat.userData.mode = mode;
    H.mat.transparent = !!mode; H.mat.opacity = mode === 'x' ? 0.3 : mode === 'g' ? 0.45 : 1; H.mat.depthWrite = !mode;
    H.mat.needsUpdate = true;
    if (H.matF) { H.matF.opacity = H.mat.opacity; H.matF.needsUpdate = true; } // 肘の側の透けて消える所も同じ濃さから
  }
  const bones = poseBones(pose);
  skinMatrices(H.S, bones, H.U.uBones.value);
  jointFlex(pose, H.U.uFlex.value);
  for (const n of H.nails) { frameMat(bones[boneOf(n.f, 2)], n.mesh.matrix); n.mesh.matrixWorldNeedsUpdate = true; }
}
