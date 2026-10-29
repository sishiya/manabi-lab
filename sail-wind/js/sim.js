// 帆船が風で進むしくみ — 船の時間の進め方
// 前後の速さだけ運動方程式 m(1+k) dV/dt = fnet で進める。傾き・横流れ・帆の調整は表（その瞬間ごとのつりあい）から。
// 向き: 方位（0 = 画面の上＝北、90 = 右）。風はいつも北から南へ吹く（風上が画面の上）。
'use strict';
const MASS = 6500;          // kg（YD-41。Python-VPP の runVPP.py）
const K_ADDED = 0.05;       // 前後の付加質量（船の重さに対する割合）。推定（細長い船体では小さい）。止まったときの速さには効かない
const TURN_RATE = 8;        // かじを切ったときに向きが変わる速さ（°/秒）。決めた値（かじの力学は入れない）

const Sim = {
  T: null,
  S: {
    t: 0, x: 0, y: 0, h: 180, v: 0, twsKn: 6, mode: 'orc',
    turn: 0, paused: false, mul: 1,
    auto: null,            // ジグザグの自動かじ { a: 片側の角度, every: 秒, side, tLeft }
    f: null,               // いまの表の値
    dvdt: 0, trace: [],    // 自分で走った向きと速さの点（ポーラー図に）
  },
  twa() { let a = ((this.S.h % 360) + 360) % 360; if (a > 180) a -= 360; return a; },  // + = 右へ向かう（風は左から）
  reset(o) {
    const S = this.S;
    Object.assign(S, { x: 0, y: 0, v: 0, turn: 0, auto: null, dvdt: 0 }, o || {});
    this.update(0);
  },
  setHeading(h) { this.S.h = ((h % 360) + 360) % 360; },
  update(dt) {
    const S = this.S;
    if (!this.T) return;
    if (S.auto) {   // ジグザグ: 決めた時間ごとに反対の舷へ
      S.auto.tLeft -= dt;
      if (S.auto.tLeft <= 0) { S.auto.side *= -1; S.auto.tLeft = S.auto.every; }
      const target = S.auto.side * S.auto.a, d = target - this.twa();
      S.h += Math.sign(d) * Math.min(Math.abs(d), TURN_RATE * dt);
    } else S.h += S.turn * TURN_RATE * dt;
    S.h = ((S.h % 360) + 360) % 360;
    const vKn = S.v / KN;
    const f = this.T.lookup(S.mode, S.twsKn, this.twa(), vKn);
    S.f = f;
    S.dvdt = f.fnet / (MASS * (1 + K_ADDED));
    S.v = Math.max(0, S.v + S.dvdt * dt);
    // 進む向き = 船首から風下へ横流れの角だけずれる
    const side = this.twa() >= 0 ? 1 : -1, lee = (f.leeway || 0) * side;
    const dir = (S.h + lee) * Math.PI / 180;
    S.x += Math.sin(dir) * S.v * dt; S.y -= Math.cos(dir) * S.v * dt;
    S.t += dt;
    // ほぼ落ちついた（1秒で 0.02 ノットも変わらない）ら、ポーラー図に点を残す
    if (Math.abs(S.dvdt) / KN < 0.02 && vKn > 0.3 && !S.turn) {
      const a = Math.round(Math.abs(this.twa()) / 5) * 5, key = S.mode + S.twsKn + ':' + a;
      const old = S.trace.find(p => p.key === key);
      if (old) old.v = vKn; else S.trace.push({ key, mode: S.mode, tws: S.twsKn, twa: a, v: vKn });
    }
  },
  run(sec) { const dt = 1 / 30; for (let t = 0; t < sec; t += dt) this.update(dt); },
};
