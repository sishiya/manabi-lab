// ジオラマに見えるわけ — 動画から作った 3D（3D ガウシアン）の場面。ES モジュール（main.js から import() で、選んだときだけ読む）
// three.js r185（importmap の "three"）と Spark（MIT）で、見えない canvas に描く。アプリ本体（r128）はその canvas を写真と同じように受けとってぼかす。
// 距離の絵: はっきりした点（<名前>-pts.bin）をカメラに投げ、画素ごとにいちばん近い距離 → すき間を埋める → 3×3 の中央値。
// 単位は m（tools/splat-pack.py で、地面 y=0・y が上に直してある。縮尺は塔の高さからの推定）。
import * as T from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

const DW = 192, DH = 128, GW = 64, GH = 40, ZMAX = 2500;

export async function create(sc, sky) {
  const [view, buf] = await Promise.all([
    fetch(sc.view).then(r => { if (!r.ok) throw new Error('読めない: ' + sc.view); return r.json(); }),
    fetch(sc.pts).then(r => { if (!r.ok) throw new Error('読めない: ' + sc.pts); return r.arrayBuffer(); }),
  ]);
  const pts = new Float32Array(buf);
  const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400;
  const R = new T.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  const scene = new T.Scene(); scene.background = new T.Color(sky);
  scene.add(new SparkRenderer({ renderer: R }));
  const mesh = new SplatMesh({ url: sc.splat });
  scene.add(mesh);
  await mesh.initialized;
  const cam = new T.PerspectiveCamera(view.vfov, 1.5, 2, 20000);
  const tgt = new T.Vector3(...view.target);

  // el: 見下ろす角度（°）、yaw: 撮った向きから横に回した角度（°）、fov: たての画角（°）。画角を変えても軸の点のまわりの写り方がそろうよう距離を変える（ドリーズーム）
  function setView(el, yaw, fov, aspect) {
    const f0 = view.vfov * Math.PI / 360, f1 = fov * Math.PI / 360, d = view.dist * Math.tan(f0) / Math.tan(f1);
    const e = el * Math.PI / 180, a = (view.az + yaw) * Math.PI / 180;
    cam.position.set(tgt.x + d * Math.cos(e) * Math.sin(a), tgt.y + d * Math.sin(e), tgt.z + d * Math.cos(e) * Math.cos(a));
    cam.fov = fov; cam.aspect = aspect; cam.near = Math.max(2, d * 0.01); cam.far = d * 40;
    cam.up.set(0, 1, 0); cam.lookAt(tgt); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  }
  function draw(w, h) {
    if (canvas.width !== w || canvas.height !== h) R.setSize(w, h, false);
    R.render(scene, cam);
  }
  // 距離の絵（距離の逆数、下の行から）と、計算の格子
  const zb = new Float32Array(DW * DH), z2 = new Float32Array(DW * DH);
  function depth() {
    zb.fill(Infinity);
    const m = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements, near = cam.near;
    for (let i = 0; i < pts.length; i += 3) {
      const x = pts[i], y = pts[i + 1], z = pts[i + 2];
      const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = m[2] * x + m[6] * y + m[10] * z + m[14];
      const dz = -vz; if (dz < near) continue;
      const u = (p[0] * vx / dz + 1) / 2, v = (p[5] * vy / dz + 1) / 2;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const k = Math.floor(v * DH) * DW + Math.floor(u * DW);
      if (dz < zb[k]) zb[k] = dz;
    }
    for (let it = 0; it < 6; it++) {          // すき間を、まわりで埋める（遠い側＝大きいほうの中央に近い値）
      z2.set(zb);
      for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) {
        const k = j * DW + i; if (zb[k] !== Infinity) continue;
        let s = 0, n = 0;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
          const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= DW || jj >= DH) continue;
          const q = zb[jj * DW + ii]; if (q !== Infinity) { s += q; n++; }
        }
        if (n >= 3) z2[k] = s / n;
      }
      zb.set(z2);
    }
    const w = [];                              // 3×3 の中央値（ぽつんと近い点を消す）
    for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) {
      w.length = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = Math.min(DW - 1, Math.max(0, i + a)), jj = Math.min(DH - 1, Math.max(0, j + b)); w.push(zb[jj * DW + ii]); }
      w.sort((x, y) => x - y); z2[j * DW + i] = w[4];
    }
    let iz = 0; for (let k = 0; k < z2.length; k++) if (z2[k] < Infinity) iz = Math.max(iz, 1 / z2[k]);
    const alpha = iz || 1, data = new Uint8Array(DW * DH * 4);
    for (let k = 0; k < z2.length; k++) {
      const D = z2[k] < Infinity ? Math.round(Math.min(1, 1 / z2[k] / alpha) * 65535) : 0;
      data[4 * k] = D >> 8; data[4 * k + 1] = D & 255; data[4 * k + 3] = 255;
    }
    const zs = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const z = z2[Math.floor((j + 0.5) / GH * DH) * DW + Math.floor((i + 0.5) / GW * DW)];
      zs[j * GW + i] = z < ZMAX ? z : Infinity;
    }
    return { data, w: DW, h: DH, alpha, zs };
  }
  return { view, canvas, setView, draw, depth, dispose() { R.dispose(); } };
}
