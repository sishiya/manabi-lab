// 変化球のしくみ — 3D の背景の野球場（ぼかして描く層）とぼかしの処理
// three の座標: X = x（捕手から見て右）、Y = z（上）、Z = −y（ホームが 0、投手は −18.4、センターは −120 ほど）
'use strict';

const T3 = p => new THREE.Vector3(p[0], p[2], -p[1]);

// 野球場の形（目安。実在の球場ではない）: ホームから角度 φ（0 = センター方向、±45° = ファウルライン）の向きの、スタンドの始まりまでの距離
function standR(phi) {
  const a = Math.abs(phi);
  if (a <= Math.PI / 4) return 100 + 22 * Math.cos(2 * phi) + 2;        // 外野のフェンスの後ろ（両翼 100 m・中堅 122 m）
  const f = (a - Math.PI / 4) / (Math.PI * 3 / 4);                         // 0（ファウルライン）〜 1（真後ろ）
  return 102 - (102 - 20) * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, f * 1.25)));
}
const dirOf = phi => [Math.sin(phi), -Math.cos(phi)];   // three の (X, Z)。φ = 0 で −Z（センター）

function buildStadium() {
  const scene = new THREE.Scene();
  const haze = new THREE.Color('#9fb8cc');
  scene.fog = new THREE.Fog(haze, 60, 420);
  scene.add(new THREE.HemisphereLight('#dfefff', '#4b6a3c', 0.85));
  const sun = new THREE.DirectionalLight('#fff4e0', 0.75); sun.position.set(-60, 120, -40); scene.add(sun);

  // 空（上ほど青い）
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#5d8fc4') }, bot: { value: new THREE.Color('#cfdde6') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(vP.y*2.2+0.05,0.0,1.0); gl_FragColor = vec4(mix(bot, top, h),1.0); }',
  }));
  scene.add(sky);

  const flat = (geo, color, y) => { const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color })); m.rotation.x = -Math.PI / 2; m.position.y = y || 0; scene.add(m); return m; };
  // 芝（刈り目のしまを、ぼかす前提でうすく）
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const c2 = cv.getContext('2d');
  for (let i = 0; i < 16; i++) { c2.fillStyle = i % 2 ? '#4a8a40' : '#447f3b'; c2.fillRect(0, i * 16, 256, 16); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(12, 12);
  const grass = new THREE.Mesh(new THREE.CircleGeometry(260, 64), new THREE.MeshLambertMaterial({ map: tex }));
  grass.rotation.x = -Math.PI / 2; scene.add(grass);
  // 内野の土（投手板を中心に半径 29 m の扇）と、内野の芝（ダイヤモンドを少し小さく）
  const dirt = '#b98a5c';
  const arc = flat(new THREE.CircleGeometry(29, 48, Math.PI / 4, Math.PI / 2 * 1.0), dirt, 0.01);
  arc.position.set(0, 0.01, -18.44);
  const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(-19.4 * 1.02, 19.4 * 1.02); tri.lineTo(0, 38.8 * 1.02); tri.lineTo(19.4 * 1.02, 19.4 * 1.02); tri.closePath();
  flat(new THREE.ShapeGeometry(tri), dirt, 0.012);
  const ig = new THREE.Shape(); const k = 0.80, cz = 19.4;
  ig.moveTo(0, cz - cz * k); ig.lineTo(-19.4 * k, cz); ig.lineTo(0, cz + cz * k); ig.lineTo(19.4 * k, cz); ig.closePath();
  const igm = new THREE.Mesh(new THREE.ShapeGeometry(ig), new THREE.MeshLambertMaterial({ map: tex }));
  igm.rotation.x = -Math.PI / 2; igm.position.y = 0.014; scene.add(igm);
  // ShapeGeometry の (x, y) を床に寝かせると y → −Z。ダイヤモンドは −Z（センター）側に広がる
  // ベース
  for (const b of [[19.4, -19.4], [0, -38.8], [-19.4, -19.4]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), new THREE.MeshLambertMaterial({ color: '#f4f4f0' })); m.position.set(b[0], 0.04, b[1]); m.rotation.y = Math.PI / 4; scene.add(m); }
  // ファウルライン
  for (const s of [1, -1]) {
    const L = 100, m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, L), new THREE.MeshLambertMaterial({ color: '#f4f4f0' }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = s * Math.PI / 4; m.position.set(s * L / 2 * Math.SQRT1_2, 0.02, -L / 2 * Math.SQRT1_2); scene.add(m);
  }

  // フェンスとスタンド（段々。色は区画ごとに少しだけ変える）
  const pos = [], col = [], idx = [];
  const C = (h) => new THREE.Color(h);
  const seatCols = [C('#3b5878'), C('#41607f'), C('#5a6e84'), C('#7a6d66'), C('#4c5d70')];
  const N = 180, tiers = 7;
  const addQuad = (a, b, c, d, cl) => { const i0 = pos.length / 3; for (const p of [a, b, c, d]) { pos.push(p[0], p[1], p[2]); col.push(cl.r, cl.g, cl.b); } idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3); };
  for (let i = 0; i < N; i++) {
    const p0 = -Math.PI + i / N * Math.PI * 2, p1 = -Math.PI + (i + 1) / N * Math.PI * 2;
    const r0 = standR(p0), r1 = standR(p1), d0 = dirOf(p0), d1 = dirOf(p1);
    const fair = Math.abs((p0 + p1) / 2) <= Math.PI / 4;
    // フェンス（外野は 3 m、内野側は 1.2 m）
    const fh = fair ? 3.0 : 1.2, fc = fair ? C('#1f4a3a') : C('#2b4f45');
    addQuad([d0[0] * r0, 0, d0[1] * r0], [d1[0] * r1, 0, d1[1] * r1], [d1[0] * r1, fh, d1[1] * r1], [d0[0] * r0, fh, d0[1] * r0], fc);
    const sec = Math.floor(i / 9);
    for (let t = 0; t < tiers; t++) {
      const ra = t * 7.5, rb = (t + 1) * 7.5, ha = fh + t * 3.2, hb = fh + (t + 1) * 3.2;
      const cl = seatCols[(sec + t * 2) % seatCols.length].clone().lerp(C('#8a9aa8'), 0.15 * ((i * 7 + t * 3) % 3) / 2);
      // 段の床（水平）と立ち上がり（垂直）
      addQuad([d0[0] * (r0 + ra), ha, d0[1] * (r0 + ra)], [d1[0] * (r1 + ra), ha, d1[1] * (r1 + ra)], [d1[0] * (r1 + rb), ha, d1[1] * (r1 + rb)], [d0[0] * (r0 + rb), ha, d0[1] * (r0 + rb)], cl);
      addQuad([d0[0] * (r0 + rb), ha, d0[1] * (r0 + rb)], [d1[0] * (r1 + rb), ha, d1[1] * (r1 + rb)], [d1[0] * (r1 + rb), hb, d1[1] * (r1 + rb)], [d0[0] * (r0 + rb), hb, d0[1] * (r0 + rb)], cl.clone().multiplyScalar(0.8));
    }
    // 屋根のふち
    const rr = tiers * 7.5 + 2, hr = fh + tiers * 3.2 + 6;
    addQuad([d0[0] * (r0 + rr - 6), hr, d0[1] * (r0 + rr - 6)], [d1[0] * (r1 + rr - 6), hr, d1[1] * (r1 + rr - 6)], [d1[0] * (r1 + rr), hr - 1.2, d1[1] * (r1 + rr)], [d0[0] * (r0 + rr), hr - 1.2, d0[1] * (r0 + rr)], C('#c9d2da'));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  // 照明塔（6本）とスコアボード
  for (const ph of [-2.4, -1.25, -0.55, 0.55, 1.25, 2.4]) {
    const r = standR(ph) + 62, d = dirOf(ph);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 58, 8), new THREE.MeshLambertMaterial({ color: '#8d99a3' }));
    pole.position.set(d[0] * r, 29, d[1] * r); scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 1.5), new THREE.MeshBasicMaterial({ color: '#f6f3e6' }));
    lamp.position.set(d[0] * r, 60, d[1] * r); lamp.lookAt(0, 0, -40); scene.add(lamp);
  }
  const sb = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 2), new THREE.MeshLambertMaterial({ color: '#24303a' }));
  sb.position.set(0, 34, -122 - 52); scene.add(sb);
  const sbs = new THREE.Mesh(new THREE.PlaneGeometry(34, 9), new THREE.MeshBasicMaterial({ color: '#3d6f8f' }));
  sbs.position.set(0, 34, -122 - 50.9); scene.add(sbs);
  return scene;
}

// ぼかし（横・縦に分けたガウスのぼかしを、半分の大きさで2回）
const BLUR = {
  vs: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fs: `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tex, vUv) * 0.1964825501511404;
      c += texture2D(tex, vUv + dir * 1.411764705882353) * 0.2969069646728344;
      c += texture2D(tex, vUv - dir * 1.411764705882353) * 0.2969069646728344;
      c += texture2D(tex, vUv + dir * 3.2941176470588234) * 0.09447039785044732;
      c += texture2D(tex, vUv - dir * 3.2941176470588234) * 0.09447039785044732;
      c += texture2D(tex, vUv + dir * 5.176470588235294) * 0.010381362401148057;
      c += texture2D(tex, vUv - dir * 5.176470588235294) * 0.010381362401148057;
      gl_FragColor = c;
    }`,
};
function makeBlur(renderer) {
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const B = {
    full: new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }),
    a: new THREE.WebGLRenderTarget(2, 2, opts), b: new THREE.WebGLRenderTarget(2, 2, opts),
    cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene: new THREE.Scene(),
    mat: new THREE.ShaderMaterial({ uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: BLUR.vs, fragmentShader: BLUR.fs, depthTest: false, depthWrite: false }),
    copy: new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false }),
    w: 0, h: 0, amount: 1.6,
  };
  B.cam.position.z = 0.5;
  B.copy.map = B.b.texture; B.copy.needsUpdate = true;
  B.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), B.mat); B.scene.add(B.quad);
  B.resize = (w, h) => { B.w = w; B.h = h; B.full.setSize(w, h); const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1); B.a.setSize(hw, hh); B.b.setSize(hw, hh); };
  // bgScene をぼかして画面に描く
  B.render = (bgScene, camera) => {
    renderer.setRenderTarget(B.full); renderer.render(bgScene, camera);
    const hw = B.a.width, hh = B.a.height;
    let src = B.full;
    for (let it = 0; it < 3; it++) {
      B.quad.material = B.mat;
      B.mat.uniforms.tex.value = src.texture; B.mat.uniforms.dir.value.set(B.amount / hw, 0); renderer.setRenderTarget(B.a); renderer.render(B.scene, B.cam);
      B.mat.uniforms.tex.value = B.a.texture; B.mat.uniforms.dir.value.set(0, B.amount / hh); renderer.setRenderTarget(B.b); renderer.render(B.scene, B.cam);
      src = B.b;
    }
    B.copy.map = B.b.texture; B.quad.material = B.copy;
    renderer.setRenderTarget(null); renderer.render(B.scene, B.cam);
    B.quad.material = B.mat;
  };
  return B;
}
