// 画面の奥の水槽 — 3D の水槽。単位は cm。画面が z=0 の窓で、箱は z<0 にある
import * as THREE from 'three';
import { Fishes } from './fish.js';
import { frustum } from './eye.js';

const SHADOWS = 24;   // 砂に落とす影の数（魚＋岩）

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const sandHeight = (x, z, W) => {
  const k = 6.28 / W;
  return W * (0.012 + 0.009 * Math.sin(x * k * 1.7 + 1.1) * Math.cos(z * k * 1.3) + 0.005 * Math.sin(x * k * 4.1 + z * k * 3.3));
};

const sandMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uD: { value: 30 }, uW: { value: 30 }, uSh: { value: Array.from({ length: SHADOWS }, () => new THREE.Vector4(0, 0, 1, 0)) } },
  side: THREE.DoubleSide, toneMapped: false,
  vertexShader: `varying vec3 vP; varying vec3 vN; void main(){ vP=(modelMatrix*vec4(position,1.)).xyz; vN=normal; gl_Position=projectionMatrix*viewMatrix*vec4(vP,1.); }`,
  fragmentShader: `
    precision highp float;
    varying vec3 vP; varying vec3 vN; uniform float uT,uD,uW; uniform vec4 uSh[${SHADOWS}];
    float n2(vec2 p){ return fract(sin(dot(floor(p),vec2(127.1,311.7)))*43758.5453); }
    float grain(vec2 p){ vec2 f=fract(p),u=f*f*(3.-2.*f); vec2 i=floor(p);
      return mix(mix(n2(i),n2(i+vec2(1,0)),u.x),mix(n2(i+vec2(0,1)),n2(i+vec2(1,1)),u.x),u.y); }
    float caustic(vec2 p,float t){
      float a=sin(p.x*1.3+sin(p.y*1.1+t)*1.8+t*.4), b=sin(p.y*1.5+sin(p.x*.9-t*.8)*1.9-t*.3), c=sin((p.x+p.y)*.8+sin(p.x*1.7+t*.6));
      return pow(max(0.,1.-abs(a+b+c)*.55),5.); }
    void main(){
      vec2 uv=vP.xz/uW*28.;
      float g=grain(uv*5.)*.5+grain(uv*13.)*.5;
      vec3 sand=mix(vec3(.50,.43,.31),vec3(.80,.72,.55),g);
      float lit=.5+.5*max(dot(normalize(vN),vec3(.15,.95,.1)),0.);
      float s=1.;
      for(int i=0;i<${SHADOWS};i++){ vec4 h=uSh[i]; if(h.w<=0.) continue; vec2 d=vP.xz-h.xy; s*=1.-h.w*exp(-dot(d,d)/(h.z*h.z)); }
      float depth=clamp(-vP.z/uD,0.,1.);
      vec3 col=sand*lit*s;
      col+=vec3(.42,.55,.5)*caustic(uv*.42,uT*.55)*s*.9;
      col=mix(col,vec3(.035,.17,.27),.22+.62*depth);
      gl_FragColor=vec4(col,1.);
    }`,
});

const plantMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uD: { value: 30 }, uAmp: { value: 1 } },
  side: THREE.DoubleSide, toneMapped: false,
  vertexShader: `attribute float aPhase; uniform float uT,uAmp; varying float vK; varying float vU; varying vec3 vW; varying float vTone;
    void main(){ vec3 p=position; float k=p.y; vU=uv.x; vK=k; vTone=fract(aPhase*3.7);
      p.x*=sin(3.1416*min(1.,k*.9+.14));
      vec4 w=modelMatrix*instanceMatrix*vec4(p,1.);
      w.x+=sin(uT*.7+aPhase+k*2.6)*k*k*uAmp; w.z+=cos(uT*.5+aPhase*1.7+k*2.1)*k*k*uAmp*.6;
      vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `precision highp float; varying float vK,vU,vTone; varying vec3 vW; uniform float uD;
    void main(){ vec3 a=mix(vec3(.05,.27,.16),vec3(.10,.34,.13),vTone), b=mix(vec3(.30,.66,.32),vec3(.52,.74,.26),vTone);
      vec3 c=mix(a,b,vK); c*=.8+.35*abs(vU-.5)*2.; c+=vec3(.07,.12,.05)*smoothstep(.06,.0,abs(vU-.5));
      float d=clamp(-vW.z/uD,0.,1.); c=mix(c,vec3(.035,.17,.27),.12+.6*d); gl_FragColor=vec4(c,1.); }`,
});

export class Tank {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'default' });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 400);
    this.camera.matrixAutoUpdate = true;
    this.rnd = mulberry(20261109);
    this.t = 0;
    this.grid = new THREE.Group(); this.scene.add(this.grid);
    this.room = new THREE.Group(); this.scene.add(this.room);
    this.scene.fog = new THREE.Fog(0x09304a, 40, 120);
    this.scene.add(new THREE.HemisphereLight(0xcdeeff, 0x2c3a3a, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(.25, 1, .55); this.scene.add(sun);
    this.sand = null; this.fishes = new Fishes(this.scene, this.rnd);
    this.plantMat = plantMaterial();
    this.rockSeeds = Array.from({ length: 7 }, () => [this.rnd(), this.rnd(), this.rnd(), this.rnd()]);
    this.plantSeeds = Array.from({ length: 46 }, () => [this.rnd(), this.rnd(), this.rnd(), this.rnd(), this.rnd()]);
    this.size = null;
  }

  setGrid(on) { this.grid.visible = on; }

  // 窓の大きさ（cm）に合わせて箱を作りなおす
  layout(W, H, pxW, pxH, dpr) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(pxW, pxH, false);
    const D = Math.max(Math.min(Math.max(W, H) * 0.95, 70), 9);
    this.W = W; this.H = H; this.D = D;
    for (const group of [this.room, this.grid]) {
      for (const c of [...group.children]) { group.remove(c); c.geometry && c.geometry.dispose(); if (c.material && c.material !== this.plantMat && !c.isShared) c.material.dispose(); }
    }
    this.buildWalls(W, H, D); this.buildGrid(W, H, D); this.buildSand(W, H, D); this.buildRocks(W, H, D); this.buildPlants(W, H, D); this.buildBubbles(W, H, D);
    this.fishes.layout(W, H, D);
    this.scene.fog.near = 30; this.scene.fog.far = 30 + D * 3.2;
    this.size = { W, H, D };
  }

  buildWalls(W, H, D) {
    const pos = [], col = [], idx = [];
    const top = new THREE.Color('#1c6a8c'), mid = new THREE.Color('#0c3a58'), low = new THREE.Color('#061c30'), surf = new THREE.Color('#5fb2c8'), surfBack = new THREE.Color('#2a7f9c');
    const quad = (pts, cs) => { const n = pos.length / 3; pts.forEach(p => pos.push(...p)); cs.forEach(c => col.push(c.r, c.g, c.b)); idx.push(n, n + 1, n + 2, n, n + 2, n + 3); };
    const x = W / 2, y = H / 2, frontTop = top.clone().lerp(surf, .25);
    quad([[-x, -y, -D], [x, -y, -D], [x, y, -D], [-x, y, -D]], [low, low, mid.clone().lerp(top, .7), mid.clone().lerp(top, .7)]);
    for (const s of [-1, 1]) quad([[s * x, -y, 0], [s * x, -y, -D], [s * x, y, -D], [s * x, y, 0]], [low.clone().lerp(mid, .5), low, mid.clone().lerp(top, .7), frontTop]);
    quad([[-x, y, 0], [x, y, 0], [x, y, -D], [-x, y, -D]], [surf, surf, surfBack, surfBack]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    this.room.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, dithering: true, fog: false })));
  }

  // 壁の目もり（本物の水槽にはない目印）
  buildGrid(W, H, D) {
    const base = W / 12, pow = 10 ** Math.floor(Math.log10(base)), cell = [1, 2, 5, 10].map(m => m * pow).find(c => c >= base * .7) || pow;
    const p = [], x = W / 2, y = H / 2, floor = -y + W * .03;
    for (let z = cell; z < D; z += cell) p.push(-x, floor, -z, -x, y, -z, x, floor, -z, x, y, -z, -x, y, -z, x, y, -z);
    for (let v = floor + cell; v < y; v += cell) p.push(-x, v, 0, -x, v, -D, x, v, 0, x, v, -D, -x, v, -D, x, v, -D);
    for (let u = -Math.floor(x / cell) * cell; u <= x; u += cell) p.push(u, floor, -D, u, y, -D, u, y, 0, u, y, -D);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    this.grid.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: .13, fog: false })));
  }

  buildSand(W, H, D) {
    const nx = 90, nz = 60, g = new THREE.PlaneGeometry(W, D, nx, nz);
    g.rotateX(-Math.PI / 2); g.translate(0, 0, -D / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, -H / 2 + sandHeight(p.getX(i), p.getZ(i), W));
    g.computeVertexNormals();
    if (!this.sandMat) this.sandMat = sandMaterial();
    this.sandMat.uniforms.uD.value = D; this.sandMat.uniforms.uW.value = W;
    const m = new THREE.Mesh(g, this.sandMat); m.isShared = true; this.room.add(m);
    // ガラスに接した砂の断面（これがないと、砂が盛り上がったぶん手前の下にすきまが見える）
    const front = new THREE.PlaneGeometry(W, 1, nx, 1), q = front.attributes.position;
    for (let i = 0; i < q.count; i++) q.setY(i, i <= nx ? -H / 2 + sandHeight(q.getX(i), 0, W) : -H / 2);
    this.room.add(new THREE.Mesh(front, new THREE.MeshBasicMaterial({ color: 0x8a7a5c, dithering: true, fog: false })));
  }

  buildRocks(W, H, D) {
    this.rocks = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a7077, roughness: .95, flatShading: true });
    const scale = Math.min(W, H * 1.6);
    const spots = [[-.34, .55, .17], [.3, .78, .2], [.08, .35, .08], [-.12, .86, .13], [.42, .3, .1], [-.42, .22, .07], [.18, .55, .06]];
    spots.forEach(([ux, uz, us], i) => {
      const [a, b, c, d] = this.rockSeeds[i], g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, k), w = 1 + .16 * Math.sin(v.x * 5 + a * 9) * Math.cos(v.y * 4 + b * 9) + .09 * Math.sin(v.z * 8 + c * 9);
        p.setXYZ(k, v.x * w, Math.max(v.y * w, -.55), v.z * w);
      }
      g.computeVertexNormals();
      const r = us * scale, x = ux * W, z = -uz * D, m = new THREE.Mesh(g, mat);
      m.position.set(x, -H / 2 + sandHeight(x, z, W) + r * .22, z); m.scale.set(r, r * (.55 + b * .25), r * (.75 + c * .3)); m.rotation.y = d * 6.28;
      m.isShared = i > 0; this.room.add(m); this.rocks.push({ x, z, r: r * 1.2 });
    });
    this.bubbleFrom = this.rocks[0];
  }

  buildPlants(W, H, D) {
    const g = new THREE.PlaneGeometry(1, 1, 1, 14); g.translate(0, .5, 0);
    const n = this.plantSeeds.length, mesh = new THREE.InstancedMesh(g, this.plantMat, n), phase = new Float32Array(n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    this.plantMat.uniforms.uAmp.value = Math.min(W, H) * .05; this.plantMat.uniforms.uD.value = D;
    this.plantSeeds.forEach(([a, b, c, d, f], i) => {
      // 左右と奥にかためて植える。手前の真ん中は空ける（手前の草が奥の魚を隠すと、頭を動かしたときの見え方が楽しい）
      const side = a < .42 ? -1 : a < .84 ? 1 : 0;
      const x = (side ? side * (.28 + b * .2) : (b - .5) * .8) * W, z = -(side ? .1 + c * .8 : .78 + c * .2) * D;
      const h = (.42 + d * .5) * H * (side ? .9 : 1), w = Math.min(W, H) * (.03 + f * .03);
      e.set(0, f * 6.28, 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, -H / 2 + sandHeight(x, z, W) - .1, z), q, new THREE.Vector3(w, h, 1));
      mesh.setMatrixAt(i, m); phase[i] = a * 40;
    });
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    mesh.frustumCulled = false; mesh.isShared = true; this.room.add(mesh);
  }

  buildBubbles(W, H, D) {
    const scale = Math.min(W, H * 1.6), n = 16, g = new THREE.SphereGeometry(1, 10, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xdff6ff, transparent: true, opacity: .42, roughness: .05, fog: false });
    this.bubbles = new THREE.InstancedMesh(g, mat, n); this.bubbles.frustumCulled = false; this.room.add(this.bubbles);
    this.bubbleData = Array.from({ length: n }, () => ({ y: this.rnd(), s: .5 + this.rnd(), ph: this.rnd() * 6.28, r: scale * (.003 + this.rnd() * .005) }));
  }

  step(dt) {
    this.t += dt;
    const { W, H, D } = this.size;
    this.sandMat.uniforms.uT.value = this.t; this.plantMat.uniforms.uT.value = this.t;
    this.fishes.step(dt, this.t);
    // 砂に落ちる影
    const sh = this.sandMat.uniforms.uSh.value; let k = 0;
    for (const r of this.rocks) if (k < SHADOWS) sh[k++].set(r.x, r.z, r.r * 1.15, .55);
    for (const f of this.fishes.list) {
      if (k >= SHADOWS) break;
      const h = THREE.MathUtils.clamp((f.p.y + H / 2) / H, 0, 1);
      sh[k++].set(f.p.x, f.p.z, f.len * (.55 + h * 1.3), .5 * (1 - h * .72));
    }
    while (k < SHADOWS) sh[k++].w = 0;
    // 泡
    const m = new THREE.Matrix4(), o = this.bubbleFrom, rise = H * .16;
    this.bubbleData.forEach((b, i) => {
      b.y += dt * rise * b.s / H; if (b.y > 1) b.y -= 1;
      const y = -H / 2 + o.r * .6 + b.y * (H - o.r * .6), wob = Math.sin(this.t * 2.1 + b.ph + b.y * 9) * W * .006;
      m.makeScale(b.r, b.r, b.r).setPosition(o.x + wob, y, o.z + Math.cos(this.t * 1.7 + b.ph) * W * .006);
      this.bubbles.setMatrixAt(i, m);
    });
    this.bubbles.instanceMatrix.needsUpdate = true;
  }

  // 目の位置からの非対称の投影。画面の四すみが窓のふちに重なる
  render(eye) {
    const { W, H, D } = this.size, cam = this.camera, near = Math.max(1, eye.z * .4), far = eye.z + D + 5, f = frustum(eye, W, H, near);
    cam.position.set(eye.x, eye.y, eye.z); cam.rotation.set(0, 0, 0); cam.near = near; cam.far = far;
    cam.projectionMatrix.makePerspective(f.left, f.right, f.top, f.bottom, near, far);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    this.scene.fog.near = eye.z; this.scene.fog.far = eye.z + D * 3.2;
    this.renderer.render(this.scene, cam);
  }
}
