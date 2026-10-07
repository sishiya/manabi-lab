// 3D の表示（Three.js r128）。1 単位 = 1 mm、y が上。皿の底（液の底）が y = 0。シミュレーションの (x, y) → three の (x, z)。
'use strict';

const V = {};
const RM = 201, RSPAN = 2 * DISH.R + 1, RD = RSPAN / (RM - 1);   // 液の網目（201×201 で直径 81 mm）
const SHARP = 2.3, SH0 = Math.pow(1 / 3, SHARP);                 // トゲの先をとがらせる（見た目の演出）
const HCAL = 0.92;   // 画面のトゲの高さ（いちばん高い所と低い所の差）が研究の式 ampPhys に合うように合わせた係数（コイル 16.8〜18.5 mT で確かめた）

function sampleGrid(a, x, y) {
  let fx = (x + SPAN / 2) / DXG - 0.5, fy = (y + SPAN / 2) / DXG - 0.5;
  if (fx < 0) fx = 0; if (fy < 0) fy = 0; if (fx > N - 1.001) fx = N - 1.001; if (fy > N - 1.001) fy = N - 1.001;
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * N + i;
  return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + N] * (1 - u) + a[k + N + 1] * u) * v;
}

const FLUID_VS = `
attribute float wet;
varying vec3 vPos; varying vec3 vN; varying float vWet;
void main(){
  vPos = (modelMatrix * vec4(position,1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vWet = wet;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos,1.0);
}`;
const FLUID_FS = `
precision highp float;
varying vec3 vPos; varying vec3 vN; varying float vWet;
uniform vec3 uKey;
// 部屋の明かり（四角いソフトボックス2つと、天井の丸い明かり）を映す
float box(vec3 d, vec3 c, vec3 ax, vec3 ay, vec2 sz){
  float t = dot(d, c); if (t <= 0.0) return 0.0;
  vec3 p = d / t - c;
  vec2 q = abs(vec2(dot(p, ax), dot(p, ay))) / sz;
  return smoothstep(1.0, 0.85, max(q.x, q.y));
}
vec3 env(vec3 d){
  float h = d.y;
  vec3 c = mix(vec3(0.020,0.022,0.026), vec3(0.07,0.075,0.08), smoothstep(-0.1, 0.9, h));
  c += vec3(7.0) * box(d, normalize(vec3(-0.5,0.85,0.35)), normalize(vec3(0.35,0.0,0.5)), normalize(vec3(0.6,0.5,-0.45)), vec2(0.45,0.28));
  c += vec3(3.6,3.7,4.0) * box(d, normalize(vec3(0.7,0.45,-0.5)), normalize(vec3(0.58,0.0,0.81)), normalize(vec3(-0.27,0.9,0.2)), vec2(0.18,0.5));
  c += vec3(3.0) * smoothstep(0.985, 0.995, dot(d, normalize(vec3(0.1,1.0,0.05))));
  c += vec3(0.05,0.06,0.07) * smoothstep(0.0, -0.4, h);  // 下は暗い机
  return c;
}
void main(){
  if (vWet < 0.5) discard;
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 Vd = normalize(cameraPosition - vPos);
  float nv = max(dot(N, Vd), 0.0);
  vec3 R = reflect(-Vd, N);
  float fr = 0.07 + 0.93 * pow(1.0 - nv, 5.0);
  vec3 col = vec3(0.0025, 0.0025, 0.003) * (0.4 + 0.6 * max(dot(N, uKey), 0.0));
  col += fr * env(R);
  vec3 Hh = normalize(uKey + Vd);
  col += 0.6 * pow(max(dot(N, Hh), 0.0), 400.0);
  col = col / (1.0 + col);           // 明るすぎる所をおさえる
  gl_FragColor = vec4(pow(col, vec3(1.0/2.2)), 1.0);
}`;

function initView(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  V.renderer = r;
  const sc = new THREE.Scene(); V.scene = sc;
  sc.background = new THREE.Color(0x0d1215);
  V.cam = new THREE.PerspectiveCamera(32, 1, 2, 3000);
  V.orbit = { th: 0.55, ph: 0.92, dist: 165, ty: 0 };

  sc.add(new THREE.HemisphereLight(0xdfe9ef, 0x1a1d20, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(-60, 120, 50); sc.add(key);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 0.35); rim.position.set(80, 40, -90); sc.add(rim);

  // 液の網目
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(RM * RM * 3), nor = new Float32Array(RM * RM * 3), wet = new Float32Array(RM * RM);
  const idx = new Uint32Array((RM - 1) * (RM - 1) * 6);
  let q = 0;
  for (let j = 0; j < RM - 1; j++) for (let i = 0; i < RM - 1; i++) {
    const a = j * RM + i, b = a + 1, c = a + RM, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('wet', new THREE.BufferAttribute(wet, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 80);
  V.fluidGeo = g; V.hgt = new Float32Array(RM * RM);
  V.fluidMat = new THREE.ShaderMaterial({
    vertexShader: FLUID_VS, fragmentShader: FLUID_FS, side: THREE.DoubleSide,
    uniforms: { uKey: { value: new THREE.Vector3(-0.45, 0.8, 0.4).normalize() } },
  });
  const fm = new THREE.Mesh(g, V.fluidMat); fm.frustumCulled = false; fm.renderOrder = 1; sc.add(fm);

  // ガラスの皿（底と壁）と、皿をのせる透明な台
  const glassMat = new THREE.MeshPhongMaterial({ color: 0xcfe6ef, transparent: true, opacity: 0.16, shininess: 120, specular: 0x99aabb, depthWrite: false, side: THREE.DoubleSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(DISH.R + 1.2, DISH.R + 1.2, DISH.wall + DISH.glass, 96, 1, true), glassMat);
  wall.position.y = (DISH.wall - DISH.glass) / 2; wall.renderOrder = 3; sc.add(wall);
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(DISH.R + 0.6, 0.6, 8, 96), new THREE.MeshPhongMaterial({ color: 0xdff2f8, transparent: true, opacity: 0.45, shininess: 140 }));
  rimRing.rotation.x = Math.PI / 2; rimRing.position.y = DISH.wall; rimRing.renderOrder = 3; sc.add(rimRing);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(DISH.R + 1.2, DISH.R + 1.2, DISH.glass, 96), new THREE.MeshPhongMaterial({ color: 0x8fa3aa, transparent: true, opacity: 0.3, shininess: 80, depthWrite: false }));
  bottom.position.y = -DISH.glass / 2; bottom.renderOrder = 0; sc.add(bottom);

  // 床（目盛りの方眼。1 cm）
  const grid = new THREE.GridHelper(400, 40, 0x2b3a40, 0x1b252a);
  grid.position.y = -90; sc.add(grid);

  // 磁石
  V.magMat = new THREE.MeshPhongMaterial({ color: 0xb9c0c6, specular: 0xffffff, shininess: 90 });
  V.magN = new THREE.MeshPhongMaterial({ color: 0xc8564a, specular: 0x553333, shininess: 40 });
  V.magnet = new THREE.Group(); sc.add(V.magnet);
  // コイル（銅の巻き線）
  V.coil = new THREE.Group();
  const cu = new THREE.MeshPhongMaterial({ color: 0x7a4a2a, specular: 0x8a5a3a, shininess: 40 });
  for (let k = 0; k < 6; k++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(56 + (k % 2) * 3, 1.5, 10, 96), cu);
    t.rotation.x = Math.PI / 2; t.position.y = -22 - Math.floor(k / 2) * 3.2; V.coil.add(t);
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(61, 61, 11, 96, 1, true), new THREE.MeshPhongMaterial({ color: 0x2a211b, side: THREE.DoubleSide }));
  core.position.y = -25.2; V.coil.add(core);
  sc.add(V.coil);
  V.ray = new THREE.Raycaster();
}

function setMagnetMesh(mg) {
  V.magnet.clear();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(mg.R, mg.R, mg.L * 0.86, 48), V.magMat);
  body.position.y = -mg.L * 0.57;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(mg.R, mg.R, mg.L * 0.14, 48), V.magN);   // 上が N 極（赤）
  top.position.y = -mg.L * 0.07;
  V.magnet.add(body, top);
}

function resizeView(w, h) {
  V.renderer.setSize(w, h, false);
  V.cam.aspect = w / h; V.cam.updateProjectionMatrix();
}

function placeCamera() {
  const o = V.orbit, c = V.cam;
  c.position.set(o.dist * Math.sin(o.ph) * Math.sin(o.th), o.ty + o.dist * Math.cos(o.ph), o.dist * Math.sin(o.ph) * Math.cos(o.th));
  c.lookAt(0, o.ty, 0);
}

// 液の形を網目に写す。返す値は表示用の量（トゲの高さなど）
function updateFluidMesh(f) {
  const pos = V.fluidGeo.attributes.position.array, nor = V.fluidGeo.attributes.normal.array, wet = V.fluidGeo.attributes.wet.array;
  const H = V.hgt, R2 = DISH.R * DISH.R;
  let spMax = 0, spMin = 1e9;
  const es = ampSH(EPS_SUB);
  for (let j = 0; j < RM; j++) {
    const y = -RSPAN / 2 + j * RD;
    for (let i = 0; i < RM; i++) {
      const x = -RSPAN / 2 + i * RD, k = j * RM + i, o = k * 3;
      const r2 = x * x + y * y;
      // 皿のふちでは、少し内側の値を使う（外の「液なし」とまざって、ふちがギザギザになるのを防ぐ）
      const rr = Math.sqrt(r2), rin = DISH.R - 1.2, sc = rr > rin ? rin / rr : 1, qx = x * sc, qy = y * sc;
      let base = sampleGrid(F.h0, qx, qy) - sampleGrid(F.dent, qx, qy);
      let h = base, tx = 0, ty = 0, w = 0;
      if (f.magnetic && r2 < R2) {
        const e = sampleGrid(F.eps, qx, qy), ee = Math.min(e, SH.EPSMAX);
        const A = Math.min(HCAL * ampPhys(Math.max(e, EPS_SUB), f), 12, 2.5 * Math.max(base, 0) + 1.5);
        const den = 9 * Math.max(ampSH(Math.max(ee, EPS_SUB)), es);
        const s = Math.max(0, sampleGrid(F.u, qx, qy) / den + 1 / 3);
        const sp = A * (Math.pow(Math.min(s, 1.4), SHARP) - SH0);
        h += sp;
        if (sp > 0) {   // トゲは磁場の向きに傾く
          const bz = sampleGrid(F.Bz, qx, qy);
          if (bz > 1e-5) {
            tx = sampleGrid(F.Bx, qx, qy) / bz * sp; ty = sampleGrid(F.By, qx, qy) / bz * sp;
            const l = Math.hypot(tx, ty), lm = 0.5 * sp; if (l > lm) { tx *= lm / l; ty *= lm / l; }
          }
        }
        if (r2 < 0.6 * R2 && A > 0.05) { if (sp > spMax) spMax = sp; if (sp < spMin) spMin = sp; }
      }
      if (h < 0) h = 0;
      w = (r2 <= (DISH.R + 1) * (DISH.R + 1) && (base > 0.04 || h > 0.04)) ? 1 : 0;
      H[k] = h;
      pos[o] = x + tx; pos[o + 1] = w ? h : -0.3; pos[o + 2] = y + ty;
      wet[k] = w;
    }
  }
  for (let j = 0; j < RM; j++) for (let i = 0; i < RM; i++) {
    const k = j * RM + i, o = k * 3;
    const hl = H[k - (i > 0 ? 1 : 0)], hr = H[k + (i < RM - 1 ? 1 : 0)];
    const hd = H[k - (j > 0 ? RM : 0)], hu = H[k + (j < RM - 1 ? RM : 0)];
    let nx = -(hr - hl) / (2 * RD), nz = -(hu - hd) / (2 * RD), l = Math.hypot(nx, 1, nz);
    nor[o] = nx / l; nor[o + 1] = 1 / l; nor[o + 2] = nz / l;
  }
  V.fluidGeo.attributes.position.needsUpdate = true;
  V.fluidGeo.attributes.normal.needsUpdate = true;
  V.fluidGeo.attributes.wet.needsUpdate = true;
  return { spikeH: spMax > spMin ? spMax - spMin : 0 };
}

function renderView(src) {
  if (src.kind === 'magnet') {
    V.magnet.visible = true; V.coil.visible = false;
    V.magnet.position.set(src.x, -DISH.glass - src.gap, src.y);
  } else { V.magnet.visible = false; V.coil.visible = true; }
  placeCamera();
  V.renderer.render(V.scene, V.cam);
}

// 画面の点 → 液の底の面（y = h）の上の点（シミュレーションの x, y）
function pickPlane(cx, cy, w, h, yPlane) {
  V.ray.setFromCamera(new THREE.Vector2(cx / w * 2 - 1, -(cy / h) * 2 + 1), V.cam);
  const o = V.ray.ray.origin, d = V.ray.ray.direction;
  if (Math.abs(d.y) < 1e-6) return null;
  const t = (yPlane - o.y) / d.y; if (t < 0) return null;
  return { x: o.x + d.x * t, y: o.z + d.z * t };
}
