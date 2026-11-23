// ジオラマに見えるわけ — 場面の入れ物（空・太陽・空気のかすみ・場面の作りなおし）
// 場面は js/stages/*.js が STAGES に足す: { id, name, short, note, view, sun, size, build(scene, ctx) → { step(dt) } }
//   view: { x, z, y（見る点）, dist（m）, pitch（見下ろす角度）, yaw（向き°）, min, max（近さの範囲 m） }
'use strict';
const STAGES = [];

// 空気の遠近: 距離で指数関数的に空の色へ（three.js の FogExp2 は距離の2乗なので、1乗に直す）。
// 町の上の空気で、見通し（コントラストが 2% になる距離）が約 25〜40 km の晴れの日にあたる強さを場面ごとに。
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(- fogDensity * fogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;

const World = (() => {
  let env = null, sky = null, horizon = new THREE.Color(0.75, 0.82, 0.9);
  const waitSky = new Promise(ok => new THREE.RGBELoader().setDataType(THREE.FloatType).load('assets/sky_1k.hdr', hdr => {
    // 地平線の少し上の明るさの平均を、かすみの色にする（空の写真とかすみの色をそろえる）
    const { data, width, height } = hdr.image, row0 = Math.round(height * 0.47), row1 = Math.round(height * 0.5);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = row0; y < row1; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    horizon.setRGB(r / n, g / n, b / n);
    hdr.mapping = THREE.EquirectangularReflectionMapping; sky = hdr; ok();
  }, undefined, () => ok()));

  let cur = null;
  function dispose(sc) {
    sc.traverse(o => {
      if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) { if (m.map && m.map !== sky) m.map.dispose(); m.dispose(); }
    });
  }

  // 場面を作る。renderer は PMREM（空の光）に使う。終わったら onReady(stage)
  async function load(id, renderer, opt) {
    const def = STAGES.find(s => s.id === id) || STAGES[0];
    await waitSky;
    if (!env && sky) env = new THREE.PMREMGenerator(renderer).fromEquirectangular(sky).texture;
    if (cur) { dispose(cur.scene); cur = null; }
    const scene = new THREE.Scene();
    scene.background = sky || new THREE.Color(0.6, 0.7, 0.85);
    scene.environment = env;
    const haze = horizon.clone().multiplyScalar(def.hazeBright || 1);
    scene.fog = new THREE.FogExp2(haze, def.haze || 0.00012);

    // 太陽（低め・横から。影が見えるように）と、空・地面からの光
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, (90 - (def.sun?.el ?? 32)) * Math.PI / 180, (def.sun?.az ?? -70) * Math.PI / 180);
    const sun = new THREE.DirectionalLight('#fff0dc', def.sun?.power ?? 3.0);
    const R = def.size || 900;
    sun.position.copy(sunDir).multiplyScalar(R * 2); sun.target.position.set(def.view.x, 0, def.view.z); sun.position.add(sun.target.position);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 10, far: R * 5 }); sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.mapSize.set(opt.shadow, opt.shadow); sun.shadow.bias = -0.0003; sun.shadow.normalBias = R / 2000; sun.shadow.radius = 2;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight('#bcd3ee', '#6b6250', 0.12));

    Kit.setSeed(def.seed || 7);
    const ctx = { renderer, phone: opt.phone, horizon: haze };
    const api = await def.build(scene, ctx) || {};
    cur = { def, scene, step: api.step || (() => {}), sun };
    return cur;
  }
  return { load, get cur() { return cur; }, get horizon() { return horizon; } };
})();
