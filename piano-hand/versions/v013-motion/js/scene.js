// シーン（光・背景・霧・光の筋・ほこり）とエフェクト（光のにじみ＝ブルーム・周辺の暗さ・フィルムの粒・光の粒の数）。
// エフェクトは EffectComposer（Three.js r128 のおまけ）で、明るさの仕上げ（ACES・sRGB・周辺の暗さ・粒）は FINAL_SHADER で行う。
'use strict';

const SCENES = {
  studio: { name: L('スタジオ', 'Studio'), fx: 1, bg: 0x0b0d12, exposure: 0.95, env: 0.7,
    hemi: [0xfff4ea, 0x1a1a1e, 0.25], sun: [0xfff1e2, 1.6, [-260, 620, 120]], fill: [0xdfe8ff, 0.35], spot: 0,
    lane: 0x0f1219, base: 0x15171c, fog: null, dust: 0, shaft: 0 },
  stage: { name: L('夜のステージ', 'Night stage'), fx: 2, bg: 0x030304, exposure: 1.05, env: 0.18,
    hemi: [0x8090b0, 0x050505, 0.04], sun: [0xffe2c0, 0.0, [-260, 620, 120]], fill: [0x6070a0, 0.08], spot: [0xffd8a8, 1.8],
    lane: 0x07080b, base: 0x0b0b0e, fog: [0x050407, 0.00045], dust: 1, shaft: 0.03 },
  dusk: { name: L('夕暮れの部屋', 'Room at dusk'), fx: 1, bg: 0x1a1220, exposure: 1.0, env: 0.45,
    hemi: [0x8a7fb8, 0x2a1810, 0.35], sun: [0xff9a50, 2.1, [-700, 260, -200]], fill: [0x6a78c8, 0.25], spot: 0,
    lane: 0x15101a, base: 0x1a1214, fog: [0x2a1a26, 0.00035], dust: 0.6, dustCol: 0xffc890, shaft: 0 },
  moon: { name: L('月あかり', 'Moonlight'), fx: 2, bg: 0x040814, exposure: 1.05, env: 0.25,
    hemi: [0x4a68c0, 0x04060c, 0.3], sun: [0x7fa2ff, 1.25, [300, 600, -300]], fill: [0x2a3c78, 0.18], spot: 0,
    lane: 0x070a12, base: 0x0a0c14, fog: [0x070a14, 0.0004], dust: 0.5, dustCol: 0xb8ccff, shaft: 0 },
  bright: { name: L('明るい部屋', 'Bright room'), fx: 1, bg: 0xd9d4ca, exposure: 0.72, env: 0.8,
    hemi: [0xffffff, 0xb8b0a4, 0.6], sun: [0xfff6ea, 1.05, [-260, 620, 120]], fill: [0xffffff, 0.3], spot: 0,
    lane: 0x4a4e57, base: 0x3a3330, fog: null, dust: 0, shaft: 0 },
};
// エフェクトの強さ: 光のにじみ（強さ・広がり・しきい値）、周辺の暗さ、フィルムの粒、光の粒とノーツの光の倍率
const FX_LEVELS = [
  { name: L('なし', 'None'), bloom: 0, vig: 0, grain: 0, spark: 0.5, glow: 1 },
  { name: L('ひかえめ', 'Soft'), bloom: 0.75, radius: 0.35, thr: 1.6, vig: 0.35, grain: 0.012, spark: 1, glow: 1.8 },
  { name: L('はなやか', 'Rich'), bloom: 1.25, radius: 0.45, thr: 1.3, vig: 0.6, grain: 0.02, spark: 1.6, glow: 2.6 },
];

const FINAL_SHADER = {
  uniforms: { tDiffuse: { value: null }, exposure: { value: 1 }, vig: { value: 0 }, grain: { value: 0 }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float exposure, vig, grain, time; varying vec2 vUv;
    vec3 rrt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c *= exposure / 0.6; return clamp(O * rrt(I * c), 0.0, 1.0);
    }
    vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 c = aces(texture2D(tDiffuse, vUv).rgb);
      c *= mix(1.0, smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.15, 1.0))), vig);
      c = srgb(c);
      c += (h(vUv * 1000.0 + time) - 0.5) * grain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// 光の筋（にせの体積光）: 下ほど広い円すいを、縁と上下でうすくして加算で重ねる
function makeShaft() {
  const g = new THREE.CylinderGeometry(60, 260, 900, 48, 1, true);
  g.translate(0, -450, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(1, 0.85, 0.65) }, amount: { value: 0 } },
    vertexShader: 'varying float vy; varying vec3 vN; varying vec3 vV; void main(){ vy = -position.y / 900.0; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float amount; varying float vy; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = amount * edge * smoothstep(0.0, 0.25, vy) * smoothstep(1.0, 0.55, vy); gl_FragColor = vec4(color * a, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return new THREE.Mesh(g, m);
}
// 光の中をただようほこり（時計の時刻で、ゆっくり動く）。星のようにくっきり光らないよう、大きくぼんやり・うすく、
// 現れるときと消えるときはなめらかに。光のにじみ（ブルーム）がかからない明るさにおさえる
const DUST_N = 160;
function makeDust() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST_N * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(DUST_N * 3), 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 4.2, map: V.glowTex, vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
  p.frustumCulled = false;
  return p;
}

function initScene() {
  const r = V.r;
  V.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  V.composer = new THREE.EffectComposer(r, V.rt);
  V.composer.addPass(new THREE.RenderPass(V.scene, V.cam));
  // 光のにじみの前に、計算できない値（NaN）や極端に明るい画素を取りのぞく（1画素でもあると、にじみで四角く暗い所ができた）
  V.composer.addPass(new THREE.ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; if (!(c.r == c.r && c.g == c.g && c.b == c.b)) c = vec3(0.0); gl_FragColor = vec4(clamp(c, 0.0, 40.0), 1.0); }',
  }));
  V.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.8);
  V.composer.addPass(V.bloom);
  V.final = new THREE.ShaderPass(FINAL_SHADER);
  V.composer.addPass(V.final);
  V.spot = new THREE.SpotLight(0xffd8a8, 0, 2200, 0.42, 0.65, 1.2);
  V.spot.castShadow = true; V.spot.shadow.mapSize.set(2048, 2048); V.spot.shadow.bias = -0.0004; V.spot.shadow.normalBias = 0.6;
  V.scene.add(V.spot); V.scene.add(V.spot.target);
  V.shaft = makeShaft(); V.scene.add(V.shaft);
  V.dust = makeDust(); V.scene.add(V.dust);
  V.dustSeed = Array.from({ length: DUST_N }, (_, i) => [hash1(i, 1), hash1(i, 2), hash1(i, 3), hash1(i, 4)]);
}

function applyScene(id) {
  const S = SCENES[id] || SCENES.studio;
  V.sceneId = id; V.sceneDef = S;
  V.scene.background = linCol(S.bg);
  V.hemi.color.copy(linCol(S.hemi[0])); V.hemi.groundColor.copy(linCol(S.hemi[1])); V.hemi.intensity = S.hemi[2];
  V.sun.color.copy(linCol(S.sun[0])); V.sun.intensity = S.sun[1]; V.sun.castShadow = S.sun[1] > 0.05; V.sunOff = S.sun[2];
  V.fill.color.copy(linCol(S.fill[0])); V.fill.intensity = S.fill[1];
  V.spot.intensity = S.spot ? S.spot[1] : 0; V.spot.castShadow = !!S.spot; if (S.spot) V.spot.color.copy(linCol(S.spot[0]));
  V.laneMat.color.copy(linCol(S.lane)); V.baseMat.color.copy(linCol(S.base));
  V.scene.fog = S.fog ? new THREE.FogExp2(linCol(S.fog[0]), S.fog[1]) : null;
  V.shaft.material.uniforms.amount.value = S.shaft; V.shaft.visible = S.shaft > 0;
  V.dust.visible = S.dust > 0; V.dustAmt = S.dust; V.dustCol = linCol(S.dustCol || 0xffe2c4);
  // 部屋の映りこみの強さ（材質ごと）
  V.scene.traverse(o => { if (o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = S.env * (o.userData.envK || 1); });
  for (const VH of V.hands) VH.skin.mat.envMapIntensity = 0.7 * S.env / 0.7;
  V.exposure = S.exposure;
}
function applyFx(level) {
  V.fxLevel = level;
  const L = FX_LEVELS[level];
  V.bloom.strength = L.bloom; if (L.bloom) { V.bloom.radius = L.radius; V.bloom.threshold = L.thr; }
  V.final.uniforms.vig.value = L.vig; V.final.uniforms.grain.value = L.grain;
}

// 毎フレーム: 光の位置（手のあたりへ）・ほこり・描画
function renderScene(t) {
  const cx = V.camX || 0, S = V.sceneDef;
  const o = V.sunOff || [-260, 620, 120];
  V.sun.position.set(cx + o[0], o[1], o[2]); V.sun.target.position.set(cx, 0, -60);
  V.spot.position.set(cx + 40, 760, 120); V.spot.target.position.set(cx, 0, -70);
  V.shaft.position.set(cx + 40, 760, 120); V.shaft.lookAt(cx, 0, -70); V.shaft.rotateX(-Math.PI / 2);
  if (V.dust.visible) {
    const a = V.dust.geometry.attributes.position.array, col = V.dust.geometry.attributes.color.array, now = performance.now() / 1000;
    const inShaft = V.shaft.visible, k = 0.16 * V.dustAmt;
    for (let i = 0; i < DUST_N; i++) {
      const [r1, r2, r3, r4] = V.dustSeed[i];
      const life = (r3 + now * (0.012 + 0.02 * r4)) % 1;           // 0→1 でゆっくり上へ。下と上の端ではうすく
      const h = 30 + life * 520, rr = (inShaft ? 30 + 0.22 * (560 - h) : 60 + 260) * Math.sqrt(r2); // ステージでは光の筋の中だけ
      const ang = r1 * 6.283 + now * (0.03 + 0.04 * r4);
      a[i * 3] = cx + 40 * (1 - h / 760) + Math.cos(ang) * rr + Math.sin(now * 0.3 + i) * 3;
      a[i * 3 + 1] = h; a[i * 3 + 2] = -70 + Math.sin(ang) * rr * 0.7;
      const fade = Math.sin(Math.PI * life) * (0.6 + 0.4 * Math.sin(now * (0.7 + r4) + i));
      col[i * 3] = V.dustCol.r * k * fade; col[i * 3 + 1] = V.dustCol.g * k * fade; col[i * 3 + 2] = V.dustCol.b * k * fade;
    }
    V.dust.geometry.attributes.position.needsUpdate = true; V.dust.geometry.attributes.color.needsUpdate = true;
  }
  const fx = FX_LEVELS[V.fxLevel || 0];
  if (V.fxLevel > 0) {
    const c = V.r.domElement;
    if (V.rtW !== c.width || V.rtH !== c.height) { V.composer.setSize(c.width / V.r.getPixelRatio(), c.height / V.r.getPixelRatio()); V.composer.setPixelRatio(V.r.getPixelRatio()); V.rtW = c.width; V.rtH = c.height; }
    V.r.toneMapping = THREE.NoToneMapping; V.r.outputEncoding = THREE.LinearEncoding;
    V.final.uniforms.exposure.value = V.exposure; V.final.uniforms.time.value = (t * 37.1) % 100;
    V.composer.render();
  } else {
    V.r.toneMapping = THREE.ACESFilmicToneMapping; V.r.outputEncoding = THREE.sRGBEncoding; V.r.toneMappingExposure = V.exposure;
    V.r.render(V.scene, V.cam);
  }
  return fx;
}
