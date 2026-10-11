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

function makeSkinMaterials(U) {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true, color: 0xffffff, roughness: 0.5, metalness: 0,
    clearcoat: 0.12, clearcoatRoughness: 0.42, sheen: new THREE.Color(0.32, 0.12, 0.08),
    envMapIntensity: 0.7,
  });
  m.onBeforeCompile = sh => {
    sh.uniforms.uBones = U.uBones; sh.uniforms.uFlex = U.uFlex;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN_VERT_HEAD + 'attribute float aWrk; attribute float aAlong; attribute vec3 aPad; attribute float aCrease;\nvarying vec3 vRest; varying float vWrk; varying float vAlong; varying vec3 vPad; varying float vCrease;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + SKIN_VERT_MAT + '  objectNormal = normalize(mat3(skM) * objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = (skM * vec4(position + normal * skInf, 1.0)).xyz;\nvRest = position; vWrk = aWrk; vAlong = aAlong; vPad = aPad; vCrease = aCrease;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SKIN_GLSL_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= (0.94 + 0.12 * vn(vRest * 0.12) + 0.04 * vn(vRest * 0.6)) * (1.0 - 0.18 * vCrease);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor *= 0.85 + 0.3 * vn(vRest * 0.4 + 3.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  { float hh = skinH(); normal = skinBump(-vViewPosition, normal, vec2(dFdx(hh), dFdy(hh)), gl_FrontFacing ? 1.0 : -1.0); }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);\n    totalEmissiveRadiance += diffuseColor.rgb * (vec3(0.05, 0.012, 0.006) + rim * vec3(0.10, 0.025, 0.012)); }'); // 皮ふの下で散った赤い光（近似）。ふちほど光が皮ふを通って赤く透ける
  };
  // 影も同じ形で落とす
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = sh => {
    sh.uniforms.uBones = U.uBones; sh.uniforms.uFlex = U.uFlex;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN_VERT_HEAD)
      .replace('#include <begin_vertex>', SKIN_VERT_MAT + 'vec3 transformed = (skM * vec4(position + normal * skInf, 1.0)).xyz;');
  };
  return { m, d };
}

let SKIN_DATA = null;
// 片手分の皮ふと爪を作る（side: 右手 1・左手 -1）
function makeSkinHand(sc, side) {
  const S = SKIN_DATA || (SKIN_DATA = buildSkin());
  const U = { uBones: { value: new Float32Array(N_BONES * 16) }, uFlex: { value: new Float32Array(N_BONES) } };
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
  g.setIndex(S.NV > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  const mats = makeSkinMaterials(U);
  const mesh = new THREE.Mesh(g, mats.m);
  mesh.customDepthMaterial = mats.d;
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  sc.add(mesh);
  // 爪: 末節骨の座標軸をそのまま物体の行列にする（網は骨の座標で持っている）
  // 爪は半透明（下の爪床の桃色と、先の白いふちが透けて見える）。つやは強く
  const nailMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.0, side: THREE.DoubleSide, transparent: true, opacity: 0.78, emissive: new THREE.Color(0.05, 0.015, 0.012) });
  const nails = S.nails.map(N => {
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(N.pos, 3)); ng.setAttribute('color', new THREE.BufferAttribute(N.col, 3)); ng.setIndex(N.idx);
    ng.computeVertexNormals();
    const nm = new THREE.Mesh(ng, nailMat); nm.castShadow = true; nm.receiveShadow = true; nm.frustumCulled = false;
    nm.matrixAutoUpdate = false;
    sc.add(nm);
    return { f: N.f, mesh: nm };
  });
  return { side, S, U, mesh, mat: mats.m, nails };
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
  }
  const bones = poseBones(pose);
  skinMatrices(H.S, bones, H.U.uBones.value);
  jointFlex(pose, H.U.uFlex.value);
  for (const n of H.nails) { frameMat(bones[boneOf(n.f, 2)], n.mesh.matrix); n.mesh.matrixWorldNeedsUpdate = true; }
}
