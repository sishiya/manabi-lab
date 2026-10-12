// 変化球のしくみ — 投手の例（架空）・球種の色・空気と風の例（段階C）
'use strict';

// 球種の色（重ねて見るとき）
const PCOL = { ff: '#ff7a6b', si: '#ffa94d', fc: '#d8b48a', sl: '#ffe066', st: '#c5e063', cu: '#6fb7ff', ch: '#7fd68a', fs: '#4dd6e6', gy: '#b9a3ff', kn: '#f59fc7', no: '#e0e0e0' };

// 投手の例。値は右投げとして書く（左投げは mirrorP で鏡うつし）。release の x0 は捕手から見た位置（右投げは −）
// どれも「よくある投げ方」の目安として Claude が作った架空の例。実在の投手ではなく、測られた値でもない
const PITCHERS = [
  { id: 'std', name: '平均的な投手', hand: 'R', arm: 45, note: '球種の値は MLB の平均的な値の目安',
    release: { x0: -0.55, z0: 1.80, ext: 1.90 }, pitches: null },   // null = すべての球種の例（PITCHES）
  { id: 'power', name: '本格派（上から）', hand: 'R', arm: 70, note: '腕を高く上げて投げる。速いまっすぐと、縦に落ちるカーブ',
    release: { x0: -0.40, z0: 1.95, ext: 2.05 },
    pitches: [{ id: 'ff', v0: 156, rpm: 2450, dir: 345, eff: 0.95 }, { id: 'sl', v0: 142, rpm: 2500, dir: 70, eff: 0.30 },
      { id: 'cu', v0: 130, rpm: 2700, dir: 170, eff: 0.70 }, { id: 'fs', v0: 142, rpm: 1300, dir: 315, eff: 0.70 }] },
  { id: 'fork', name: 'フォークの投手', hand: 'R', arm: 55, note: '回転がとても少ないフォークで、まっすぐとの落差を作る',
    release: { x0: -0.50, z0: 1.85, ext: 1.95 },
    pitches: [{ id: 'ff', v0: 150, rpm: 2350, dir: 335, eff: 0.92 }, { id: 'fs', v0: 138, rpm: 1000, dir: 320, eff: 0.60 },
      { id: 'sl', v0: 135, rpm: 2350, dir: 80, eff: 0.30 }, { id: 'cu', v0: 120, rpm: 2300, dir: 150, eff: 0.60 }] },
  { id: 'side', name: 'サイドスロー', hand: 'R', arm: 5, note: '腕を横から振る。回転の軸が寝て、横へずれる球が多い',
    release: { x0: -1.05, z0: 1.25, ext: 1.85 },
    pitches: [{ id: 'ff', v0: 145, rpm: 2200, dir: 295, eff: 0.88 }, { id: 'si', v0: 143, rpm: 2100, dir: 265, eff: 0.90 },
      { id: 'st', v0: 128, rpm: 2600, dir: 95, eff: 0.60 }, { id: 'ch', v0: 128, rpm: 1800, dir: 265, eff: 0.85 }] },
  { id: 'sub', name: 'アンダースロー', hand: 'R', arm: -35, note: '地面すれすれから投げる。下から上へ向かって放すので、浮き上がるように見える',
    release: { x0: -0.85, z0: 0.55, ext: 1.75 },
    pitches: [{ id: 'ff', v0: 130, rpm: 2100, dir: 300, eff: 0.85 }, { id: 'si', v0: 122, rpm: 1900, dir: 245, eff: 0.80 },
      { id: 'sl', v0: 118, rpm: 2200, dir: 60, eff: 0.60 }] },
  { id: 'lefty', name: '技巧派の左腕', hand: 'L', arm: 45, note: '速さより、チェンジアップと緩急で打ち取る',
    release: { x0: -0.60, z0: 1.75, ext: 1.85 },
    pitches: [{ id: 'ff', v0: 140, rpm: 2200, dir: 330, eff: 0.90 }, { id: 'fc', v0: 135, rpm: 2300, dir: 30, eff: 0.50 },
      { id: 'ch', v0: 123, rpm: 1700, dir: 285, eff: 0.90 }, { id: 'cu', v0: 112, rpm: 2400, dir: 150, eff: 0.70 }] },
  { id: 'knuckler', name: 'ナックルボーラー', hand: 'R', arm: 45, note: 'ほとんどナックル。ときどき遅いまっすぐとカーブ',
    release: { x0: -0.55, z0: 1.80, ext: 1.80 },
    pitches: [{ id: 'kn', v0: 112, rpm: 25, knuckle: true, axisDeg: 0, seam0: 20 }, { id: 'ff', v0: 128, rpm: 1900, dir: 330, eff: 0.85 },
      { id: 'cu', v0: 106, rpm: 2000, dir: 150, eff: 0.60 }] },
];

// 腕の角度（捕手から見て、肩から手へ向かう線が水平から何度上か。90 = 真上、0 = 真横、− = 下から）→ 放す位置（右投げ。x は腕の側への距離）
// 目安の表（よくある放す位置。投手ごとに大きくちがう）
const ARM_TABLE = { a: [-35, -15, 0, 20, 45, 60, 75, 85], x: [0.80, 1.00, 1.05, 0.90, 0.55, 0.45, 0.35, 0.25], z: [0.50, 0.85, 1.15, 1.50, 1.80, 1.90, 1.98, 2.03] };
function releaseFor(arm) { return { x: lerpTable(ARM_TABLE.a, ARM_TABLE.x, arm), z: lerpTable(ARM_TABLE.a, ARM_TABLE.z, arm) }; }
function armName(a) { return a >= 65 ? 'オーバースロー（上から）' : a >= 30 ? 'スリークォーター（斜め上から）' : a >= -5 ? 'サイドスロー（横から）' : 'アンダースロー（下から）'; }
const pitcherOf = id => PITCHERS.find(p => p.id === id) || PITCHERS[0];
// その投手の球種の一覧（名前つき）
function arsenal(pid) {
  const pr = pitcherOf(pid);
  if (!pr.pitches) return PITCHES;
  return pr.pitches.map(q => Object.assign({}, PITCHES.find(p => p.id === q.id), q));
}

// 空気と風の例。標高の例は都市の標高のおおよそ（デンバー 約 1600 m・メキシコシティ 約 2240 m）
const ENVS = [
  { id: 'std', name: 'ふつう', tC: 20, elev: 0, p: 1013, rh: 50, ws: 0, wd: 0 },
  { id: 'high', name: '高地（標高 1600 m）', tC: 20, elev: 1600, p: 1013, rh: 30, ws: 0, wd: 0 },
  { id: 'mex', name: 'もっと高地（2240 m）', tC: 20, elev: 2240, p: 1013, rh: 50, ws: 0, wd: 0 },
  { id: 'hot', name: '真夏の昼（35 ℃）', tC: 35, elev: 0, p: 1005, rh: 70, ws: 0, wd: 0 },
  { id: 'cold', name: '寒い夜（5 ℃）', tC: 5, elev: 0, p: 1020, rh: 60, ws: 0, wd: 0 },
  { id: 'head', name: '向かい風 8 m/s', tC: 20, elev: 0, p: 1013, rh: 50, ws: 8, wd: 180 },
  { id: 'tail', name: '追い風 8 m/s', tC: 20, elev: 0, p: 1013, rh: 50, ws: 8, wd: 0 },
  { id: 'cross', name: '横風 8 m/s', tC: 20, elev: 0, p: 1013, rh: 50, ws: 8, wd: 90 },
];
// 風の向き wd: 風が吹いていく向き。0 = 捕手の方へ（ボールにとって追い風）、180 = 投手の方へ（向かい風）、90 = 捕手から見て右へ
function windVec(ws, wd) { const a = wd * Math.PI / 180; return [ws * Math.sin(a), -ws * Math.cos(a), 0]; }
function windName(ws, wd) {
  if (ws < 0.05) return '無風';
  const a = ((wd % 360) + 360) % 360;
  const nm = a < 23 || a >= 338 ? '追い風' : a >= 158 && a < 203 ? '向かい風' : a < 158 ? '捕手から見て右へ吹く風' : '捕手から見て左へ吹く風';
  return nm + ' ' + ws.toFixed(1) + ' m/s';
}
