// リアルな手の描画: 皮ふの網（skin.js）・肌の材質（細かい凹凸・色むら・赤みの散乱をシェーダーで）・爪・部屋の映りこみ
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
  panel(4, 2.4, -2.5, 3.4, -1, new THREE.Color(2.6, 2.4, 2.2), 0.6, Math.PI / 2.4); // 左上の窓
  panel(3, 1.5, 3.5, 2.2, 2, new THREE.Color(0.9, 0.95, 1.1), -1.2);               // 右の柔らかい光
  panel(6, 1, 0, -0.9, 0, new THREE.Color(0.25, 0.2, 0.17), 0, -Math.PI / 2);       // 床の照り返し
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(es, 0.03).texture;
  pm.dispose();
  return tex;
}

// 肌のシェーダーに足すもの: 3次元のノイズ（網を作った姿勢の座標で）による毛穴と小じわ、関節のしわ、色むら、赤みの散乱
const SKIN_GLSL_HEAD = `
varying vec3 vRest; varying float vWrk; varying float vAlong;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
// 画素より細かい凹凸はちらつくので、1画素が何 mm かを見て弱める
float skinH(){
  float px = length(fwidth(vRest));
  float fine = 1.0 - smoothstep(0.12, 0.3, px), mid = 1.0 - smoothstep(0.3, 0.8, px);
  float pores = (vn(vRest * 2.2) - 0.5) * 0.035 * fine + (vn(vRest * 0.9 + 7.0) - 0.5) * 0.05 * mid;
  float wr = vWrk * pow(abs(sin(vAlong * 1.7 + vn(vRest * 0.5) * 2.5)), 4.0) * -0.18 * (1.0 - smoothstep(0.35, 0.9, px));
  return pores + wr;
}
vec3 skinBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float fd){
  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
  vec3 r1 = cross(sy, surf_norm), r2 = cross(surf_norm, sx);
  float det = dot(sx, r1) * fd;
  vec3 g = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surf_norm - g);
}
`;

function makeSkinMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true, color: 0xffffff, roughness: 0.5, metalness: 0,
    clearcoat: 0.12, clearcoatRoughness: 0.42, sheen: new THREE.Color(0.32, 0.12, 0.08),
    envMapIntensity: 0.7,
  });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRest; attribute float aWrk; attribute float aAlong;\nvarying vec3 vRest; varying float vWrk; varying float vAlong;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest; vWrk = aWrk; vAlong = aAlong;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SKIN_GLSL_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= 0.94 + 0.12 * vn(vRest * 0.12) + 0.04 * vn(vRest * 0.6);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor *= 0.85 + 0.3 * vn(vRest * 0.4 + 3.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  { float hh = skinH(); normal = skinBump(-vViewPosition, normal, vec2(dFdx(hh), dFdy(hh)), gl_FrontFacing ? 1.0 : -1.0); }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vec3(0.05, 0.012, 0.006);'); // 皮ふの下で散った赤い光（近似）
  };
  return m;
}

function initSkinMesh(sc) {
  const S = buildSkin();
  V.S = S;
  const g = new THREE.BufferGeometry();
  V.skinPos = new THREE.BufferAttribute(new Float32Array(S.pos0), 3);
  V.skinNrm = new THREE.BufferAttribute(new Float32Array(S.nrm0), 3);
  V.skinPos.setUsage(THREE.DynamicDrawUsage); V.skinNrm.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', V.skinPos); g.setAttribute('normal', V.skinNrm);
  g.setAttribute('color', new THREE.BufferAttribute(S.col, 3));
  g.setAttribute('aRest', new THREE.BufferAttribute(new Float32Array(S.pos0), 3));
  g.setAttribute('aWrk', new THREE.BufferAttribute(S.aWrk, 1));
  g.setAttribute('aAlong', new THREE.BufferAttribute(S.aAlong, 1));
  g.setIndex(S.NV > 65535 ? new THREE.Uint32BufferAttribute(S.idx, 1) : new THREE.Uint16BufferAttribute(S.idx, 1));
  V.skinMat = makeSkinMaterial();
  const mesh = new THREE.Mesh(g, V.skinMat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  sc.add(mesh); V.skinMesh = mesh;
  // 爪
  V.nailMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 0.9, side: THREE.DoubleSide });
  V.nails = S.nails.map(N => {
    const ng = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(new Float32Array(N.pos.length), 3); pa.setUsage(THREE.DynamicDrawUsage);
    ng.setAttribute('position', pa); ng.setAttribute('color', new THREE.BufferAttribute(N.col, 3)); ng.setIndex(N.idx);
    const nm = new THREE.Mesh(ng, V.nailMat); nm.castShadow = true; nm.receiveShadow = true; nm.frustumCulled = false;
    sc.add(nm);
    return { N, mesh: nm, pa };
  });
}

function updateSkinMesh(pose, opt) {
  const show = !opt.bones;
  V.skinMesh.visible = show;
  for (const n of V.nails) n.mesh.visible = show;
  if (!show) return;
  if (V.skinMat.userData.ghost !== opt.ghost) {
    V.skinMat.userData.ghost = opt.ghost;
    V.skinMat.transparent = opt.ghost; V.skinMat.opacity = opt.ghost ? 0.45 : 1; V.skinMat.depthWrite = !opt.ghost;
    V.skinMat.needsUpdate = true;
  }
  const bones = poseBones(pose);
  skinTo(V.S, bones, V.skinPos.array, V.skinNrm.array);
  V.skinPos.needsUpdate = true; V.skinNrm.needsUpdate = true;
  for (const n of V.nails) {
    const B = bones[boneOf(n.N.f, 2)], src = n.N.pos, dst = n.pa.array;
    for (let i = 0; i < src.length; i += 3) {
      const a = src[i], b = src[i + 1], c = src[i + 2];
      dst[i] = B.o[0] + B.x[0] * a + B.y[0] * b + B.z[0] * c;
      dst[i + 1] = B.o[1] + B.x[1] * a + B.y[1] * b + B.z[1] * c;
      dst[i + 2] = B.o[2] + B.x[2] * a + B.y[2] * b + B.z[2] * c;
    }
    n.pa.needsUpdate = true;
    n.mesh.geometry.computeVertexNormals();
  }
}
