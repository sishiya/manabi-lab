// 場面: サッカー場（芝の縞・白線・観客席と観客・照明の塔・選手とボール）。まわりに駐車場と町
// 寸法の目安: ピッチ 105×68 m・観客席は約 25 段（1段 0.8 m・高さ 0.4 m）。単位 m
'use strict';
STAGES.push({
  id: 'stadium', name: 'サッカー場', short: '競技場', seed: 51, size: 420, haze: 0.00026,
  note: '試合中のサッカー場。選手がボールを追い、観客席はいっぱい',
  view: { x: 0, z: 0, y: 0, dist: 330, pitch: 36, yaw: 18, min: 90, max: 1100, range: 500 },
  sun: { el: 38, az: -120, power: 3.2 },
  async build(scene, ctx) {
    const { rnd, pick, lin } = Kit;
    const PL = 105, PW = 68, M = 6;   // ピッチの長さ・幅・まわりの余白

    // ---- 地面（芝の縞と白線） ----
    const S = ctx.phone ? 2048 : 4096, span = 1400;
    const T0 = Town.create(), RX = [], RZ = [], parks = [], lots = [];
    RX.push({ c: -150, w: 16 }, { c: 150, w: 12 }); RZ.push({ c: -130, w: 12 }, { c: 120, w: 16 });
    for (let x = -1400; x < 1400; x += 60 + rnd() * 40) if (Math.abs(x) > 260) RX.push({ c: x, w: 6 });
    for (let z = -1400; z < 1400; z += 50 + rnd() * 40) if (Math.abs(z) > 240) RZ.push({ c: z, w: 6 });
    RX.sort((a, b) => a.c - b.c); RZ.sort((a, b) => a.c - b.c);
    const walk = w => (w >= 12 ? 3 : 0);
    for (let i = 0; i < RX.length - 1; i++) for (let j = 0; j < RZ.length - 1; j++) {
      const x0 = RX[i].c + RX[i].w / 2 + walk(RX[i].w), x1 = RX[i + 1].c - RX[i + 1].w / 2 - walk(RX[i + 1].w);
      const z0 = RZ[j].c + RZ[j].w / 2 + walk(RZ[j].w), z1 = RZ[j + 1].c - RZ[j + 1].w / 2 - walk(RZ[j + 1].w);
      if (x1 - x0 < 8 || z1 - z0 < 8) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (Math.abs(cx) < 150 && Math.abs(cz) < 130) continue;   // 競技場の敷地
      if (Math.abs(cx) < 260 && Math.abs(cz) < 240) { lots.push([x0, z0, x1, z1]); continue; }   // まわりは駐車場
      if (Math.hypot(cx, cz) > 1400) continue;
      const parcels = []; T0.split(x0, z0, x1, z1, parcels, 11);
      for (const p of parcels) T0.building(...p, T0.kindOf(0.15, 0.75, p[2] - p[0], p[3] - p[1]));
    }
    T0.finish(scene);
    Town.farHouses(scene, 2400, 1450, 4000);
    const grassImg = await Kit.photoImg('Grass004');
    const ground = await Town.paint({ S, span, RX, RZ, walk, lots, foot: T0.foot, yards: T0.yards, base: 'conc',
      draw(g, rect, pat) {
        g.fillStyle = pat(grassImg, 4); rect(-150 + 8, -130 + 6, 150 - 6, 130 - 8); g.fillStyle = 'rgba(66,70,40,.55)'; rect(-150 + 8, -130 + 6, 150 - 6, 130 - 8);   // 敷地の芝生
        g.fillStyle = 'rgba(150,144,134,1)'; rect(-PL / 2 - 45, -PW / 2 - 42, PL / 2 + 45, PW / 2 + 42);   // スタンドのまわりの舗装
        g.fillStyle = 'rgba(120,115,106,.5)'; for (let x = -PL / 2 - 45; x < PL / 2 + 45; x += 6) rect(x, -PW / 2 - 42, x + 0.15, PW / 2 + 42);
        // 芝: 刈った向きで明るさのちがう縞（5.5 m ごと）
        for (let i = 0; i * 5.25 < PL + 2 * M; i++) { g.fillStyle = i % 2 ? '#3f6a2a' : '#4b7a31'; rect(-PL / 2 - M + i * 5.25, -PW / 2 - M, -PL / 2 - M + (i + 1) * 5.25, PW / 2 + M); }
        g.fillStyle = 'rgba(70,90,40,.18)'; for (let n = 0; n < 400; n++) { const x = (rnd() - 0.5) * PL, z = (rnd() - 0.5) * PW, r = 1 + rnd() * 4; rect(x - r, z - r, x + r, z + r); }   // 芝のむら
        g.fillStyle = 'rgba(120,110,80,.35)'; rect(-PL / 2 + 2, -6, -PL / 2 + 14, 6); rect(PL / 2 - 14, -6, PL / 2 - 2, 6); rect(-4, -4, 4, 4);   // すり切れたゴール前
        // 白線（幅 12 cm）
        g.fillStyle = 'rgba(245,245,240,.95)'; const L = 0.12;
        const line = (x0, z0, x1, z1) => rect(Math.min(x0, x1) - L / 2, Math.min(z0, z1) - L / 2, Math.max(x0, x1) + L / 2, Math.max(z0, z1) + L / 2);
        line(-PL / 2, -PW / 2, PL / 2, -PW / 2); line(-PL / 2, PW / 2, PL / 2, PW / 2); line(-PL / 2, -PW / 2, -PL / 2, PW / 2); line(PL / 2, -PW / 2, PL / 2, PW / 2); line(0, -PW / 2, 0, PW / 2);
        for (const s of [-1, 1]) {
          const gx = s * PL / 2;
          line(gx, -20.16, gx - s * 16.5, -20.16); line(gx, 20.16, gx - s * 16.5, 20.16); line(gx - s * 16.5, -20.16, gx - s * 16.5, 20.16);
          line(gx, -9.16, gx - s * 5.5, -9.16); line(gx, 9.16, gx - s * 5.5, 9.16); line(gx - s * 5.5, -9.16, gx - s * 5.5, 9.16);
        }
        g.strokeStyle = 'rgba(245,245,240,.95)'; g.lineWidth = L * S / span;
        const Xp = v => (v + span / 2) * S / span;
        g.beginPath(); g.arc(Xp(0), Xp(0), 9.15 * S / span, 0, 6.283); g.stroke();
      } });
    Kit.groundPlane(scene, span, ground, 0.6);
    Kit.groundPlane(scene, 3200, await Town.paint({ S: S / 2, span: 3200, RX, RZ, walk, lots, foot: T0.foot, yards: T0.yards }), 0.9).position.y = -0.04;
    Kit.farGround(scene, '#7a8263');

    // ---- 観客席（4つの面。段の箱）・屋根・観客 ----
    const tiers = [], crowd = [], roof = [], walls = [];
    const N = 24, RISE = 0.42, RUN = 0.8;
    const sides = [
      { cx: 0, cz: -(PW / 2 + M + 4), len: PL + 2 * M, nx: 0, nz: -1 }, { cx: 0, cz: PW / 2 + M + 4, len: PL + 2 * M, nx: 0, nz: 1 },
      { cx: -(PL / 2 + M + 4), cz: 0, len: PW + 2 * M, nx: -1, nz: 0 }, { cx: PL / 2 + M + 4, cz: 0, len: PW + 2 * M, nx: 1, nz: 0 },
    ];
    const SEAT = ['#2c4a6e', '#2c4a6e', '#2a4566'];
    for (const sd of sides) {
      const along = sd.nz !== 0;   // x の向きにのびる
      for (let r = 0; r < N; r++) {
        const d = r * RUN + RUN / 2, y0 = 1.2 + r * RISE;
        const x = sd.cx + sd.nx * d, z = sd.cz + sd.nz * d;
        tiers.push({ x, y: 0, z, sx: along ? sd.len : RUN, sy: y0, sz: along ? RUN : sd.len, c: pick(SEAT) });
        const fill = 0.82 + 0.1 * rnd();
        for (let s = -sd.len / 2 + 0.3; s < sd.len / 2; s += 0.55) if (rnd() < fill) {
          const px = along ? sd.cx + s : x, pz = along ? z : sd.cz + s;
          crowd.push({ x: px + (rnd() - 0.5) * 0.1, y: y0, z: pz, sx: 0.44, sy: 0.75 + rnd() * 0.15, sz: 0.38, c: pick(['#9a2a2a', '#9a2a2a', '#b8b6b0', '#2a2a2c', '#2a2a2c', '#3a4658', '#5d6670', '#7a5a48', '#8a8f96']) });   // 服の色（ホームの赤が多め・くすんだ色）
        }
      }
      const back = N * RUN + 1, H = 1.2 + N * RISE;
      walls.push({ x: sd.cx + sd.nx * back, y: 0, z: sd.cz + sd.nz * back, sx: along ? sd.len + 2 : 1.2, sy: H + 4, sz: along ? 1.2 : sd.len + 2, c: '#d0ccc2' });
      // 屋根（長い2面だけ）
      if (along) roof.push({ x: sd.cx + sd.nx * (back - 10), y: H + 7, z: sd.cz + sd.nz * (back - 10), sx: sd.len + 4, sy: 0.6, sz: 22, c: '#b9bcbe' });
    }
    // 4すみ
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) walls.push({ x: sx * (PL / 2 + M + 4 + 10), z: sz * (PW / 2 + M + 4 + 10), sx: 20, sy: 6, sz: 20, c: '#c4c0b6' });
    Kit.inst(scene, Kit.box, Kit.mat('seats', { roughness: 0.7 }, `
      if (vON.y > 0.5) diffuseColor.rgb *= 0.9 + 0.2 * step(0.5, fract(vWP.x * 1.8 + vWP.z * 1.8));
      else diffuseColor.rgb = vec3(0.55, 0.54, 0.5) * (0.8 + 0.3 * kF(vWP * 0.5));`), tiers);
    Kit.inst(scene, Kit.box, Kit.mat('fans', { roughness: 0.9 }), crowd, { cast: false });
    Kit.inst(scene, Kit.box, Kit.building('tile'), walls);
    Kit.inst(scene, Kit.box, Kit.mat('sroof', { roughness: 0.4, metalness: 0.4 }, `diffuseColor.rgb *= 0.8 + 0.25 * step(0.5, fract(vWP.x / 6.0 + vWP.z / 6.0)); if (vON.y < -0.5) diffuseColor.rgb *= 0.5;`), roof);
    // 照明の塔
    const lights = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * (PL / 2 + 30), z = sz * (PW / 2 + 30);
      lights.push({ x, z, sx: 1.4, sy: 42, sz: 1.4, c: '#a8a8a2' }, { x, y: 42, z, sx: 9, sy: 5, sz: 1.2, ry: Math.atan2(sx, sz), c: '#e8e8e2' });
    }
    Kit.inst(scene, Kit.box, Kit.mat('steel2', { roughness: 0.5, metalness: 0.4 }), lights);
    // ゴール（白い枠）
    const goals = [];
    for (const s of [-1, 1]) { const x = s * PL / 2; goals.push({ x: x + s * 1, z: -3.66, sx: 2, sy: 2.44, sz: 0.12, c: '#f4f4f2' }, { x: x + s * 1, z: 3.66, sx: 2, sy: 2.44, sz: 0.12, c: '#f4f4f2' }, { x: x + s * 0.06, y: 2.32, z: 0, sx: 0.12, sy: 0.12, sz: 7.32, c: '#f4f4f2' }, { x: x + s * 2, z: 0, sx: 0.05, sy: 2.4, sz: 7.3, c: '#dcdcd8' }); }
    Kit.inst(scene, Kit.box, Kit.mat('goal', { roughness: 0.4 }), goals);

    // ---- 木・駐車場の車 ----
    const TR = [];
    for (let i = 0; i < 160; i++) { const a = rnd() * 6.283, x = Math.cos(a) * (145 + rnd() * 5), z = Math.sin(a) * (125 + rnd() * 5); TR.push({ x: Math.max(-146, Math.min(146, x)), z: Math.max(-126, Math.min(126, z)), h: 7 + rnd() * 4, r: 2.4 + rnd() * 1.5 }); }
    for (const [x0, z0, x1, z1] of T0.yards) if (rnd() < 0.4) TR.push({ x: x0 + 1.5 + rnd() * (x1 - x0 - 3), z: z0 + 1.5 + rnd() * (z1 - z0 - 3), h: 3 + rnd() * 3, r: 1 + rnd() * 1.2 });
    Kit.trees(scene, TR);
    const parked = [];
    for (const [x0, z0, x1, z1] of lots) for (let z = z0 + 3; z < z1 - 3; z += 6.5) for (let x = x0 + 2; x < x1 - 2; x += 2.5) if (rnd() < 0.6) parked.push({ kind: rnd() < 0.25 ? 'kei' : rnd() < 0.15 ? 'van' : 'sedan', x, z, ry: (Math.floor((z - z0) / 6.5) % 2) * Math.PI });
    const C = Kit.cars(scene, parked); parked.forEach((p, i) => C.set(i, p.x, p.z, p.ry)); C.done();

    // ---- 選手・審判・ボール ----
    const pl = [];
    const form = [[-48, 0], [-35, -22], [-36, -7], [-36, 7], [-35, 22], [-18, -16], [-20, 0], [-18, 16], [-6, -24], [-4, 0], [-6, 24]];
    for (const team of [0, 1]) form.forEach(([x, z], i) => pl.push({ team, keeper: i === 0, hx: team ? -x : x, hz: team ? -z : z, x: team ? -x : x, z: team ? -z : z, ry: 0, v: 0 }));
    pl.push({ ref: true, hx: 0, hz: 10, x: 0, z: 10, ry: 0, v: 0 });
    const ppl = Kit.people(scene, pl.map(p => ({ x: p.x, z: p.z, shirt: p.ref ? '#e8d23a' : p.keeper ? (p.team ? '#2ea84a' : '#f08a1c') : p.team ? '#f4f4f2' : '#c8202a', pants: p.ref ? '#1b1b1e' : p.team ? '#1f3157' : '#f4f4f2' })));
    const ballM = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 6), Kit.mat('ball', { roughness: 0.4 })); ballM.castShadow = true; scene.add(ballM);
    const ball = { x: 0, z: 0, vx: 0, vz: 0, owner: -1, t: 0 };
    let t = 0;
    function stepPlay(dt) {
      // ボールに近い人が追い、ほかは自分の位置（ボールのほうへ少しずれる）へ。持っている人は少しドリブルしてからパス
      let near = [-1, -1], nd = [1e9, 1e9];
      pl.forEach((p, i) => { if (p.ref || p.keeper) return; const d = Math.hypot(p.x - ball.x, p.z - ball.z); if (d < nd[p.team]) { nd[p.team] = d; near[p.team] = i; } });
      pl.forEach((p, i) => {
        let tx, tz, vmax = 5.5;
        if (near.includes(i)) { tx = ball.x; tz = ball.z; vmax = 7; }
        else if (p.ref) { tx = ball.x * 0.7; tz = ball.z * 0.7 + 12; }
        else { const k = p.keeper ? 0.08 : 0.45; tx = p.hx + (ball.x - (p.team ? 10 : -10)) * k; tz = p.hz + ball.z * k * 0.6; vmax = 4.5; }
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        const v = Math.min(vmax, d * 1.2); p.v += (v - p.v) * Math.min(1, dt * 2);
        if (d > 0.05) { p.x += dx / d * p.v * dt; p.z += dz / d * p.v * dt; p.ry = Math.atan2(dx, dz); }
      });
      // ボール
      const o = ball.owner;
      if (o >= 0) {
        const p = pl[o]; ball.x = p.x + Math.sin(p.ry) * 0.6; ball.z = p.z + Math.cos(p.ry) * 0.6; ball.t -= dt;
        if (ball.t < 0) {   // パスかシュート
          const mates = pl.filter(q => q.team === p.team && q !== p && !q.ref);
          const goalX = p.team ? -PL / 2 : PL / 2;
          let tx, tz;
          if (Math.abs(goalX - p.x) < 28 && rnd() < 0.5) { tx = goalX; tz = (rnd() - 0.5) * 6; } else { const q = pick(mates); tx = q.x + (rnd() - 0.5) * 6; tz = q.z + (rnd() - 0.5) * 6; }
          const d = Math.hypot(tx - ball.x, tz - ball.z), sp = Math.min(26, 6 + d * 0.8);
          ball.vx = (tx - ball.x) / d * sp; ball.vz = (tz - ball.z) / d * sp; ball.owner = -1; ball.kick = o; ball.lock = 0.4;
        }
      } else {
        ball.x += ball.vx * dt; ball.z += ball.vz * dt; const f = Math.exp(-dt * 0.6); ball.vx *= f; ball.vz *= f; ball.lock -= dt;
        if (Math.abs(ball.x) > PL / 2 + 1 || Math.abs(ball.z) > PW / 2 + 1) { ball.x = Math.max(-PL / 2 + 2, Math.min(PL / 2 - 2, ball.x)) * (Math.abs(ball.x) > PL / 2 ? 0 : 1); ball.z = Math.max(-PW / 2 + 1, Math.min(PW / 2 - 1, ball.z)); ball.vx = ball.vz = 0; }
        pl.forEach((p, i) => { if (!p.ref && ball.owner < 0 && !(i === ball.kick && ball.lock > 0) && Math.hypot(p.x - ball.x, p.z - ball.z) < 0.9) { ball.owner = i; ball.t = 0.6 + rnd() * 1.8; } });
      }
    }
    function place() {
      pl.forEach((p, i) => ppl.set(i, p.x, p.z, p.ry, p.v > 0.3 ? t * 11 + i : 0, 0, Math.min(1.3, p.v / 3)));
      ppl.done(); ballM.position.set(ball.x, 0.11, ball.z);
    }
    place();
    return { step(dt) { t += dt; Kit.time.value = t; const n = Math.ceil(dt / 0.05); for (let i = 0; i < n; i++) stepPlay(dt / n); place(); } };
  },
});
