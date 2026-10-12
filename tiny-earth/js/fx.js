// ちいさな地球 — 演出（見た目だけ）: 空気の粒（殻を外すと流れ出して散る）・水を落としたときのしぶき
'use strict';
const FX = (() => {
  let air = null, splash = [], M = null;
  const tmpQ = new THREE.Quaternion(), camL = new THREE.Vector3();

  // ---------- 空気の粒 ----------
  // 殻の中（地面〜1.25）に 6000 粒。1粒ずつ「星から離れる順番」q を持ち、計算で星のまわりから出ていった空気の割合 loss が q をこえると外へ流れ出す。
  // 流れはまっすぐでなく、ゆらぎながら広がり、うすれて消える。星のむこう側の粒は星にかくす（シェーダーで光線と球の交わりを見る）
  function initAir(planet, mesh) {
    M = mesh;
    const n = 6000, dir = new Float32Array(n * 3), r0 = new Float32Array(n), q = new Float32Array(n), sd = new Float32Array(n);
    let s = 13; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const z = rnd() * 2 - 1, a = rnd() * 6.2832, w = Math.sqrt(1 - z * z);
      dir.set([w * Math.cos(a), z, w * Math.sin(a)], i * 3);
      r0[i] = 1.02 + 0.23 * Math.pow(rnd(), 0.6);
      q[i] = Math.max(0.002, Math.pow(rnd(), 1.3) * (0.4 + 0.6 * (r0[i] - 1) / 0.25));   // 上の方の空気ほど先に出ていく
      sd[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(dir, 3));   // 向き（位置はシェーダーで決める）
    g.setAttribute('aR0', new THREE.BufferAttribute(r0, 1));
    g.setAttribute('aQ', new THREE.BufferAttribute(q, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    air = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uLoss: { value: 0 }, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uPix: { value: 1 } },
      vertexShader: `
        uniform float uLoss, uTime, uPix; uniform vec3 uCam;
        attribute float aR0, aQ, aSeed;
        varying float vA;
        void main(){
          vec3 d = normalize(position);
          float s = uLoss / aQ;                            // 0〜1: 出ていくところ、1 より先: 遠くへ
          float go = smoothstep(0., 1., min(s, 1.));
          float r = aR0 + (2.6 - aR0) * pow(go, 0.8) + max(0., s - 1.) * 1.6;
          // ゆらぎ: 流れ出すにつれて、向きが少しずつねじれる（うずのように）
          vec3 t1 = normalize(cross(d, vec3(0.31, 0.95, 0.12)));
          vec3 t2 = cross(d, t1);
          float a = (aSeed * 6.2832) + uTime * 0.25 * (0.5 + aSeed);
          vec3 p = normalize(d + (t1 * cos(a) + t2 * sin(a)) * 0.35 * go) * r;
          // 見え方: 流れ出しはじめで明るく、遠くへ行くほどうすれる。殻の中で止まっている粒はほぼ見えない
          vA = (0.01 + 0.34 * go) * clamp(1. - (s - 1.) * 0.45, 0., 1.) * step(0.0001, uLoss);   // うすいもや（重なると濃く見える）
          // 星のむこう側（カメラから見て星にかくれる）なら消す
          vec3 rd = p - uCam; float L = length(rd); rd /= L;
          float b = dot(uCam, rd), c = dot(uCam, uCam) - 1.0, h = b * b - c;
          if (h > 0. && -b - sqrt(h) > 0. && -b - sqrt(h) < L) vA = 0.;
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_PointSize = uPix * (10. + 26. * go) * 3. / max(0.3, -mv.z);   // もやのかたまり。流れ出すほどふくらむ（遠いほど小さく）
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main(){
          vec2 c = gl_PointCoord - .5; float f = 1. - smoothstep(0.0, 0.5, length(c)); f *= f;   // ふちのやわらかい丸
          gl_FragColor = vec4(vec3(0.6, 0.82, 1.0) * vA * f, 1.);
        }`,
    }));
    air.renderOrder = 8; air.frustumCulled = false;
    planet.add(air);
  }
  // loss: 星のまわりから出ていった空気の割合（0〜1）
  function updateAir(loss, camera, planet, pix) {
    if (!air) return;
    air.visible = loss > 0;
    if (!air.visible) return;
    const u = air.material.uniforms;
    u.uLoss.value = loss; u.uTime.value = performance.now() / 1000; u.uPix.value = pix;
    tmpQ.copy(planet.quaternion).invert();
    u.uCam.value.copy(camL.copy(camera.position).applyQuaternion(tmpQ));
  }

  // ---------- 水しぶき ----------
  // 着水点から 280 粒が外へはじけ、落ちながら消える（1.4 秒）。粒の大きさは画面の上で数ピクセル
  function splashAt(planet, n, r0, w) {
    const N = 280, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = [];
    const up = n.clone(), t1 = new THREE.Vector3(0.3, 0.9, 0.2).cross(up).normalize(), t2 = up.clone().cross(t1);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * 6.2832, sp = 0.3 + Math.random() * 1.6, vu = 0.8 + Math.random() * 1.6;
      vel.push(t1.clone().multiplyScalar(Math.cos(a) * sp).add(t2.clone().multiplyScalar(Math.sin(a) * sp)).add(up.clone().multiplyScalar(vu)).multiplyScalar(w));
      pos.set([up.x * r0, up.y * r0, up.z * r0], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; planet.add(pts);
    splash.push({ pts, vel, up, r0, w, t0: performance.now() });
  }
  function updateSplash(planet) {
    const now = performance.now();
    for (let k = splash.length - 1; k >= 0; k--) {
      const f = splash[k], t = (now - f.t0) / 1000, pa = f.pts.geometry.attributes.position.array, ca = f.pts.geometry.attributes.color.array;
      if (t > 1.4) { planet.remove(f.pts); f.pts.geometry.dispose(); f.pts.material.dispose(); splash.splice(k, 1); continue; }
      const g = 2.2 * f.w;   // 見た目の重力（粒が上がって落ちるように）
      f.vel.forEach((v, i) => {
        const x = v.x * t - f.up.x * 0.5 * g * t * t, y = v.y * t - f.up.y * 0.5 * g * t * t, z = v.z * t - f.up.z * 0.5 * g * t * t;
        pa[i * 3] = f.up.x * f.r0 + x; pa[i * 3 + 1] = f.up.y * f.r0 + y; pa[i * 3 + 2] = f.up.z * f.r0 + z;
        const b = Math.max(0, 1 - t / 1.4) * (0.7 + 0.3 * ((i * 37) % 10) / 10);
        ca[i * 3] = 0.65 * b; ca[i * 3 + 1] = 0.88 * b; ca[i * 3 + 2] = b;
      });
      f.pts.geometry.attributes.position.needsUpdate = true; f.pts.geometry.attributes.color.needsUpdate = true;
    }
  }
  return { initAir, updateAir, splashAt, updateSplash };
})();
