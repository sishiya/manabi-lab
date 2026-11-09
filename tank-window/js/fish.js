// 画面の奥の水槽 — 魚（形と泳ぎ。泳ぎは見た目のための演出で、魚の研究の式ではない）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const paint = (geo, fn) => {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(col, p.getX(i), p.getY(i), p.getZ(i)); c.set([col.r, col.g, col.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
};
const flat = pts => new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));

// 体の長さ 1、口が +x、尾が -x
function bodyGeometry(tall, wide, colorFn, tail, fin) {
  const body = new THREE.SphereGeometry(0.5, 20, 14), p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), taper = x < 0 ? 1 + x * 1.25 : 1 - x * x * 0.8;
    p.setXYZ(i, x, p.getY(i) * 2 * tall * taper, p.getZ(i) * 2 * wide * taper);
  }
  body.computeVertexNormals();
  const parts = [paint(body, colorFn)];
  const finColor = c => c.copy(fin);
  parts.push(paint(flat(tail), finColor));
  parts.push(paint(flat([[0.12, tall * 0.8], [-0.22, tall * 1.5], [-0.3, tall * 0.5]]), finColor));
  for (const s of [1, -1]) {
    const eye = new THREE.SphereGeometry(0.028, 10, 8);
    eye.translate(0.3, tall * 0.28, s * wide * 0.62);
    parts.push(paint(eye, c => c.set('#06090c')));
  }
  return mergeGeometries(parts);
}

const SPECIES = [
  { name: 'small', n: 14, len: 0.1, speed: [2.2, 5.5], school: true,
    geo: bodyGeometry(0.11, 0.07, (c, x, y) => {
      if (y > 0.015 && y < 0.05) c.set('#3fd6ff');              // 青く光る帯
      else if (y <= 0.015 && x < 0.05) c.set('#e8493a');        // 腹の後ろの赤
      else if (y > 0.05) c.set('#6b7a64');
      else c.set('#d9e2e4');
    }, [[-0.42, 0], [-0.68, 0.13], [-0.62, 0], [-0.68, -0.13]], new THREE.Color('#9fb4b8')) },
  { name: 'gold', n: 4, len: 0.2, speed: [1.4, 3.6], school: false,
    geo: bodyGeometry(0.2, 0.11, (c, x, y) => {
      const k = THREE.MathUtils.clamp(y * 3 + 0.55, 0, 1);
      c.set('#f6d9a8').lerp(new THREE.Color(x > 0.02 && x < 0.2 ? '#fff3df' : '#f07a24'), k);
    }, [[-0.42, 0], [-0.76, 0.24], [-0.66, 0], [-0.76, -0.24]], new THREE.Color('#ffb066')) },
];

export class Fishes {
  constructor(scene, rnd) {
    this.rnd = rnd; this.list = []; this.mats = [];
    this.groups = SPECIES.map(sp => {
      const uTime = { value: 0 };
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide });
      mat.onBeforeCompile = sh => {
        sh.vertexShader = 'attribute float aPhase;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          `#include <begin_vertex>
          float sw = smoothstep(0.32, -0.7, position.x);
          transformed.z += sin(aPhase + position.x * 5.0) * 0.15 * sw;`);
      };
      const mesh = new THREE.InstancedMesh(sp.geo, mat, sp.n);
      const phase = new THREE.InstancedBufferAttribute(new Float32Array(sp.n), 1).setUsage(THREE.DynamicDrawUsage);
      sp.geo.setAttribute('aPhase', phase);
      mesh.frustumCulled = false;
      scene.add(mesh);
      const fish = [];
      for (let i = 0; i < sp.n; i++) { const f = { sp, p: new THREE.Vector3(), v: new THREE.Vector3(), phase: rnd() * 6.28, wander: rnd() * 6.28 }; fish.push(f); this.list.push(f); }
      return { sp, mesh, phase, fish, uTime };
    });
    this.box = null;
  }

  layout(W, H, D) {
    const r = this.rnd, scale = Math.min(W, H * 1.6);
    const old = this.box;
    for (const f of this.list) {
      f.len = f.sp.len * scale;
      if (old) { f.p.x *= W / old.W; f.p.y *= H / old.H; f.p.z *= D / old.D; }
      else { f.p.set((r() - .5) * W * .7, (r() - .45) * H * .6, -(0.2 + r() * .65) * D); f.v.set(r() - .5, 0, r() - .5).setLength(scale * .05); }
    }
    this.box = { W, H, D, scale };
  }

  step(dt, t) {
    const { W, H, D, scale } = this.box, tmp = new THREE.Vector3(), a = new THREE.Vector3();
    const m = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3();
    const q = new THREE.Quaternion(), speedScale = scale / 34;
    for (const g of this.groups) {
      g.fish.forEach((f, i) => {
        a.set(0, 0, 0);
        f.wander += dt * (0.3 + this.rnd() * 0.5);
        a.x += Math.cos(f.wander) * 0.9; a.z += Math.sin(f.wander * 1.3) * 0.9; a.y += Math.sin(f.wander * 0.7) * 0.25;
        const c = tmp.set(0, 0, 0), al = new THREE.Vector3(), sep = new THREE.Vector3();
        let n = 0;
        for (const o of g.fish) {
          if (o === f) continue;
          const dd = o.p.distanceTo(f.p);
          if (dd > f.len * 7) continue;
          c.add(o.p); al.add(o.v); n++;
          if (dd < f.len * 1.6 && dd > 1e-4) sep.addScaledVector(new THREE.Vector3().subVectors(f.p, o.p), 1 / (dd * dd));
        }
        if (n && g.sp.school) { a.addScaledVector(c.divideScalar(n).sub(f.p), 0.5 / f.len * 0.1); a.addScaledVector(al.divideScalar(n).sub(f.v), 0.5); }
        a.addScaledVector(sep, f.len * 2.4);
        // 壁・ガラス・砂・水面から離れる
        const band = f.len * 2.2, push = (d, ax, s) => { if (d < band) a[ax] += s * 22 * ((band - d) / band) ** 2; };
        push(f.p.x + W / 2, 'x', 1); push(W / 2 - f.p.x, 'x', -1);
        push(f.p.y + H / 2 - f.len * .3, 'y', 1); push(H / 2 - f.p.y, 'y', -1);
        push(f.p.z + D, 'z', 1); push(-f.p.z, 'z', -1);
        f.v.addScaledVector(a, dt * speedScale * 5);
        f.v.y *= Math.exp(-dt * 1.2);
        const sp = f.v.length(), lo = g.sp.speed[0] * speedScale, hi = g.sp.speed[1] * speedScale;
        if (sp > 1e-5) f.v.multiplyScalar(THREE.MathUtils.clamp(sp, lo, hi) / sp);
        f.p.addScaledVector(f.v, dt);
        const mg = f.len * .35;
        f.p.x = THREE.MathUtils.clamp(f.p.x, -W / 2 + mg, W / 2 - mg);
        f.p.y = THREE.MathUtils.clamp(f.p.y, -H / 2 + mg, H / 2 - mg);
        f.p.z = THREE.MathUtils.clamp(f.p.z, -D + mg, -mg);
        f.phase += dt * (5 + 3.4 * f.v.length() / Math.max(f.len, 1e-3));
        g.phase.setX(i, f.phase);
        X.copy(f.v).normalize(); X.y = THREE.MathUtils.clamp(X.y, -.35, .35); X.normalize();
        Z.crossVectors(X, UP).normalize(); Y.crossVectors(Z, X);
        m.makeBasis(X, Y, Z); q.setFromRotationMatrix(m);
        m.compose(f.p, q, S.setScalar(f.len));
        g.mesh.setMatrixAt(i, m);
      });
      g.phase.needsUpdate = true; g.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
