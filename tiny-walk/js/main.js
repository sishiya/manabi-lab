// ちいさな地球を歩く — メイン（状態・体の動き・時間を進める・デバッグ用の窓口）
'use strict';
window.__tiwaErr = [];
window.addEventListener('error', e => window.__tiwaErr.push(String(e.message)));

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const PLAY = 10;                                          // 飛んでいるあいだは、この秒数くらいで見おわるように早送りする

const S = {
  R: 1000, air: true, U: null, E: null, N: null, yaw: 0.3, pitch: 0.06, alt: 0, originR: 0, offE: 0, offN: 0,
  tool: 'hop', speed: { hop: 0.3, ball: 1.248 }, ang: { hop: 45, ball: 0 },
  fl: null, ball: null, pred: null, home: null, clock: 0, walking: false, turning: 0, dirty: true, needPred: true
};
// 立つ向き（上 U・東 E・北 N）。動いたら U を新しくし、N・E は地面にそって運ぶ
function setUp(nu) {
  const k = S.originR || S.R; S.offE += dot(nu, S.E) * k; S.offN += dot(nu, S.N) * k;
  S.offE %= 4000; S.offN %= 4000;
  S.U = nu; const d = dot(S.N, nu); S.N = norm([S.N[0] - nu[0] * d, S.N[1] - nu[1] * d, S.N[2] - nu[2] * d]); S.E = cross(S.N, S.U);
  S.originR = TERRAIN.feetR(nu[0], nu[1], nu[2], S.R, S.air);
}
function place(lat, lon) {
  S.U = TERRAIN.dir(lat, lon); const d = S.U[1]; S.N = norm([-S.U[0] * d, 1 - d * d, -S.U[2] * d]); S.E = cross(S.N, S.U);
  S.originR = TERRAIN.feetR(S.U[0], S.U[1], S.U[2], S.R, S.air); S.alt = 0;
}
const heading = () => { const c = Math.cos(S.yaw), s = Math.sin(S.yaw); return [c * S.N[0] + s * S.E[0], c * S.N[1] + s * S.E[1], c * S.N[2] + s * S.E[2]]; };
const body = () => S.tool === 'hop' ? PHYS.BODY : PHYS.BALL;
const surfOf = hop => hop ? (x, y, z) => TERRAIN.feetR(x, y, z, S.R, S.air) : (x, y, z) => TERRAIN.topR(x, y, z, S.R, S.air);

// いまの向き・強さ・角度で出たらどうなるか（道すじを全部計算）
function predict() {
  S.needPred = false;
  if (S.fl) { S.pred = null; return; }
  const b = body(), f = heading(), a = S.ang[S.tool] * Math.PI / 180, v = S.speed[S.tool], r0 = S.originR + b.h0;
  const c = Math.cos(a) * v, s = Math.sin(a) * v;
  const tr = PHYS.fly([S.U[0] * r0, S.U[1] * r0, S.U[2] * r0], [c * f[0] + s * S.U[0], c * f[1] + s * S.U[1], c * f[2] + s * S.U[2]], { R: S.R, air: S.air, body: b, surf: surfOf(S.tool === 'hop') });
  tr.warp = Math.max(1, tr.T / PLAY); tr.a = S.U.slice(); tr.b = f; tr.hop = S.tool === 'hop';
  const e = tr.p.slice(-3); tr.dist = S.R * Math.acos(Math.max(-1, Math.min(1, dot(norm(e), S.U))));
  S.pred = tr; UI.pred(describe(tr, false));
}
function describe(tr, done) {
  const w = tr.warp > 1.5 ? '（' + Math.round(tr.warp).toLocaleString() + ' 倍の早送り' + (done ? 'で見ました' : 'で見ます') + '）' : '';
  const who = tr.hop ? '' : 'ボールは ';
  if (tr.end === 'land') return who + UI.len(tr.dist) + ' 先に' + (tr.hop ? '着地し' : '落ち') + (done ? 'ました' : 'ます') + '。' + UI.dur(tr.T) + (tr.dist > PHYS.at(S.R).horizon ? '・地平線のむこう' : '') + w + (!done && !tr.hop && S.air ? ' 空気を「ない」にすると、ずっと遠くまで飛びます。' : '');
  if (tr.end === 'orbit') return who + '地面に落ちず、星を一周してもど' + (done ? 'りました' : 'ります') + '。' + UI.dur(tr.T) + w;
  if (tr.end === 'escape') return who + '星の引力をふりきって、もどってきません。';
  return who + 'とても遠くまで行きます。';
}

const handlers = {
  setR(R) { S.R = Math.max(100, Math.min(PHYS.RE, R)); stopAll(); S.speed.hop = Math.min(PHYS.at(S.R).jump, Math.max(UI.V_MIN, 0.25 * PHYS.at(S.R).vOrb)); /* そっとける強さから始める */ S.speed.ball = Math.min(UI.BALL_MAX, PHYS.at(S.R).vOrb * 1.005); /* ボールは一周の速さから始める */ S.originR = TERRAIN.feetR(S.U[0], S.U[1], S.U[2], S.R, S.air); S.alt = 0; changed('星の大きさを 半径 ' + UI.len(S.R) + ' にしました。'); },
  setAir(on) { S.air = on; stopAll(); S.originR = TERRAIN.feetR(S.U[0], S.U[1], S.U[2], S.R, S.air); S.alt = 0; changed(on ? '空気と海を「ある」にしました（仮定）。飛ぶものは空気に止められます。' : '空気と海を「ない」にしました。'); },
  setTool(t) { S.tool = t; changed(null); },
  setSpeed(v) { S.speed[S.tool] = v; changed(null); },
  setAngle(a) { S.ang[S.tool] = a; changed(null); },
  look(dx, dy) { S.yaw -= dx; S.pitch = Math.max(-1.5, Math.min(1.5, S.pitch + dy)); /* 景色をつかんで動かす向き */ S.dirty = S.needPred = true; },
  turn(d) { S.turning = d; },
  walk(on) { S.walking = on && !S.fl; if (S.walking) UI.msg('歩いています（' + UI.speed(PHYS.at(S.R).walk) + '）。これより速く足を出すと、体が浮きます。'); },
  launch() {
    if (S.fl) return; if (S.needPred || !S.pred) predict();
    const tr = S.pred; S.home = { U: S.U.slice(), E: S.E.slice(), N: S.N.slice(), yaw: S.yaw };
    if (tr.hop) { S.fl = { tr, t: 0, laps: 0 }; S.ball = null; S.pred = null; UI.msg('地面をけりました（' + UI.speed(S.speed.hop) + '）。'); }
    else { S.ball = { tr, t: 0, done: false }; UI.msg('ボールを投げました（' + UI.speed(S.speed.ball) + '）。'); }
    S.dirty = true; UI.flying(!!S.fl, true);
  },
  back() {                                                 // 出発した所へもどる
    if (!S.home) return; stopAll(); S.U = S.home.U; S.E = S.home.E; S.N = S.home.N; S.yaw = S.home.yaw;
    S.originR = TERRAIN.feetR(S.U[0], S.U[1], S.U[2], S.R, S.air); S.alt = 0; changed('出発した所へもどりました。');
  }
};
function stopAll() { S.fl = null; S.ball = null; S.walking = false; UI.flying(false, false); }
function changed(text) { S.dirty = S.needPred = true; UI.sync(); if (text) UI.msg(text); }

function step(dt) {
  let warp = 1;
  if (S.turning) { S.yaw += S.turning * 1.4 * dt; S.dirty = S.needPred = true; }
  if (S.fl) {
    const f = S.fl, tr = f.tr; warp = tr.warp; f.t += dt * warp; S.dirty = true;
    if (tr.end === 'orbit' && f.t >= tr.T) { f.t -= tr.T; f.laps++; UI.msg('星を一周しました（' + f.laps + ' 周め・1周 ' + UI.dur(tr.T) + '）。地面に落ちずに回りつづけます。「もどる」で出発した所へ。'); }
    const p = PHYS.posAt(tr, Math.min(f.t, tr.T), []), r = Math.hypot(p[0], p[1], p[2]);
    setUp([p[0] / r, p[1] / r, p[2] / r]); S.alt = Math.max(0, r - S.originR);
    if (tr.end !== 'orbit' && f.t >= tr.T) {
      if (tr.end === 'land') { S.fl = null; S.alt = 0; S.needPred = true; UI.msg(describe(tr, true)); UI.flying(false, true); }
      else if (!f.said) { f.said = true; UI.msg(describe(tr, true) + '「もどる」で出発した所へ。'); }
    }
  } else if (S.walking) {
    const d = PHYS.at(S.R).walk * dt / S.originR, f = heading();
    setUp(norm([S.U[0] + f[0] * d, S.U[1] + f[1] * d, S.U[2] + f[2] * d])); S.dirty = S.needPred = true;
  }
  if (S.ball && !S.ball.done) {
    const b = S.ball, tr = b.tr; if (!S.fl) warp = tr.warp; b.t += dt * warp; S.dirty = true;
    if (b.t >= tr.T) {
      b.t = tr.T; b.done = true; UI.msg(describe(tr, true) + (tr.end === 'orbit' ? ' 後ろから来たボールを受けとめました。' : ''));
      if (tr.end !== 'land') S.ball = null;
      UI.flying(false, true);
    }
  }
  if (S.fl || S.walking || (S.ball && !S.ball.done)) S.clock += dt * warp;
  S.warp = warp;
}

function draw() {
  if (S.needPred && !S.fl) predict();
  const la = TERRAIN.lat(S.U[1]), lo = TERRAIN.lon(S.U[0], S.U[2]), e = TERRAIN.hLL(la, lo);
  const where = (la >= 0 ? '北緯 ' : '南緯 ') + Math.abs(la).toFixed(1) + '°・' + (lo >= 0 ? '東経 ' : '西経 ') + Math.abs(lo).toFixed(1) + '°・' + (e > 0 ? '陸' : S.air ? '海' : '海だった所');
  UI.hud('半径 ' + UI.len(S.R) + (S.alt > 0.005 ? '・高さ ' + UI.len(S.alt) : '') + '\n' + where, (S.warp > 1.5 ? '早送り ' + Math.round(S.warp).toLocaleString() + ' 倍\n' : '実時間\n') + UI.clock(S.clock));
  const showPred = !S.fl && !(S.ball && !S.ball.done) ? S.pred : null;
  WORLD.render({ R: S.R, air: S.air, U: S.U, E: S.E, N: S.N, originR: S.originR, alt: S.alt, yaw: S.yaw, pitch: S.pitch, offE: S.offE, offN: S.offN,
    pred: showPred, mark: showPred && showPred.end === 'land' ? showPred.p.slice(-3) : null, ball: S.ball });
  const cur = S.fl ? S.fl.tr : S.ball ? S.ball.tr : S.pred, r = S.originR + S.alt + 1;
  INSET.draw({ R: S.R, a: cur ? cur.a : S.U, b: cur ? cur.b : heading(), me: [S.U[0] * r, S.U[1] * r, S.U[2] * r], pred: showPred,
    flown: S.fl ? { tr: S.fl.tr, t: S.fl.laps ? Infinity : S.fl.t } : S.ball ? { tr: S.ball.tr, t: S.ball.t } : null, ball: S.ball ? PHYS.posAt(S.ball.tr, S.ball.t, []) : null });
  S.dirty = false;
}

const cv = document.getElementById('cv');
function resize() { const r = cv.getBoundingClientRect(); if (r.width > 0 && r.height > 0) { WORLD.resize(Math.round(r.width), Math.round(r.height)); S.dirty = true; } }
let last = performance.now();
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; // 最初のコマは now が last より前のことがある
  step(dt); if (S.dirty) draw();                           // 変化のないときは描き直さない
  requestAnimationFrame(loop);
}
(async function start() {
  WORLD.init(cv); INSET.init(document.getElementById('inset'));
  try { await TERRAIN.load('data/etopo1deg.bin'); } catch (err) { window.__tiwaErr.push('地形: ' + err.message); UI.msg('地形のデータを読めませんでした。平らな海の底だけの星になります。'); }
  place(36, 138.5); UI.init(S, handlers); UI.sync(); UI.flying(false, false);
  if (TERRAIN.ready) UI.msg('日本のまんなかあたりに、北を向いて立っています。「跳ねる」で、そっと地面をけります。');
  addEventListener('resize', resize); new ResizeObserver(resize).observe(cv); resize();
  requestAnimationFrame(loop);
})();

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__tiwa = { S, handlers, predict, place, simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) step(dt); draw(); }, trees: () => WORLD.st.treeCount };
