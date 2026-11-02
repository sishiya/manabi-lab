// ひとしずくの進化 — 節（ふし）でできたからだ。純粋（DOM なし）。
// 細胞（丸い体。前が +x）のふちや、ほかの節の先から節が生える。節の根もとに関節があり、筋が体全体の
// リズムで曲げのばしする。長さは細胞の半径を 1、時間はリズム1回を 1 とした単位で考える。
//
// 決まり1「水」: 小さな生き物には慣性がない。形が変わる間、水からの力と回す力がいつも 0 になるように
// 体全体が動く（抵抗の式＝resistive force theory。細い棒は横に動かすほうが縦より2倍重い）。
// 決まり2「打つ」: 節の先は、うしろへ振るときだけ水を強くかき、前へもどすときはしなって抜ける。
// この2つから、平泳ぎ・むち毛の波・こぐ脚などの泳ぎ方が出てくる（決まりには書いていない）。

export const MAX_SEGS = 10;
const ZC = 1, ZR = 4 / 3;         // 細胞の抵抗（進む・回る）。半径1の球
const ZN = 0.25, ZT = 0.125;      // 節の抵抗（長さ1あたり。横・縦）
const ZP = 6;                     // うしろへ振っている節の先がかく水の重さ
const STEPS = 48;                 // リズム1回を何こまで計算するか
export const FRAMES = 24;         // 絵のこま

// 節: p=親（-1 は細胞）、at=細胞のどこから生えるか（前からの角度）、ang=まっすぐからの曲がり、len=長さ、
// amp=筋のふれ幅（符号つき。左右に写すと逆になる）、ph=リズムのずれ
export function emptyBody() { return { T: 0.5, segs: [] }; }
// はじまりの生き物: うしろに1本の毛（打って進む。いちばん単純な泳ぎ手）
export function founderBody() {
  return { T: 0.12, segs: [{ p: -1, at: Math.PI, ang: 0, len: 1.4, amp: 0.6, ph: 0 }] };
}
function cloneBody(b) { return { T: b.T, segs: b.segs.map(s => ({ ...s })) }; }

// リズムの s（0..1）のときの、節ごとの根もと・先の位置
function shape(b, s, out) {
  for (let i = 0; i < b.segs.length; i++) {
    const g = b.segs[i];
    let bx, by, d0;
    if (g.p < 0) { bx = Math.cos(g.at); by = Math.sin(g.at); d0 = g.at; }
    else { const q = out[g.p]; bx = q.ex; by = q.ey; d0 = q.d; }
    const d = d0 + g.ang + g.amp * Math.sin(2 * Math.PI * (s + g.ph));
    const o = out[i];
    o.bx = bx; o.by = by; o.d = d; o.ex = bx + g.len * Math.cos(d); o.ey = by + g.len * Math.sin(d);
  }
  return out;
}

function solve3(A, b) {
  const det = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  const D = det(A); if (Math.abs(D) < 1e-12) return [0, 0, 0];
  const res = [];
  for (let c = 0; c < 3; c++) { const m = A.slice(); for (let r = 0; r < 3; r++) m[r * 3 + c] = b[r]; res.push(det(m) / D); }
  return res;
}

// からだを1回リズムさせて、進む量・回る量・水をかきまぜる仕事・先の速さ・絵のこまを求める
// （生まれたときに1度だけ。形が親と同じなら親の分を使う）
const cache = new WeakMap();
export function analyze(b) {
  let P = cache.get(b);
  if (P) return P;
  const n = b.segs.length;
  const kids = new Array(n).fill(0);
  for (const g of b.segs) if (g.p >= 0) kids[g.p]++;
  const tips = [];
  for (let i = 0; i < n; i++) if (!kids[i]) tips.push(i);
  let sumLen = 0;
  for (const g of b.segs) sumLen += g.len;
  P = { n, tips, sumLen, fwd: 0, spin: 0, work: 0, reach: 1, heading: 0, frames: [], tipV: new Float32Array(FRAMES * tips.length) };
  if (!n) { for (let f = 0; f < FRAMES; f++) P.frames.push({ w: 0, pts: new Float32Array(0) }); cache.set(b, P); return P; }
  const A = Array.from({ length: n }, () => ({})), B = Array.from({ length: n }, () => ({}));
  const ds = 1 / STEPS;
  // 水を受ける点: 節を2つの点（1/4・3/4）に分ける。うしろへ振っている先には、水を強くかく点を足す
  const elems = s0 => {
    shape(b, s0, A); shape(b, s0 + ds, B);
    const E = [];
    for (let i = 0; i < n; i++) for (const k of [0.25, 0.75]) {
      const px = A[i].bx + (A[i].ex - A[i].bx) * k, py = A[i].by + (A[i].ey - A[i].by) * k;
      const qx = B[i].bx + (B[i].ex - B[i].bx) * k, qy = B[i].by + (B[i].ey - B[i].by) * k;
      E.push({ px, py, ux: (qx - px) / ds, uy: (qy - py) / ds, tx: Math.cos(A[i].d), ty: Math.sin(A[i].d), L: b.segs[i].len / 2, zn: ZN, zt: ZT });
    }
    for (const i of tips) {
      const ux = (B[i].ex - A[i].ex) / ds, uy = (B[i].ey - A[i].ey) / ds, u = Math.hypot(ux, uy);
      const w = u > 1e-6 ? Math.min(1, Math.max(0, -ux / u * 2)) : 0;     // うしろ向きの動きほど強くかく
      if (w > 0) E.push({ px: A[i].ex, py: A[i].ey, ux, uy, tx: 1, ty: 0, L: ZP * w * b.segs[i].len, zn: 1, zt: 1 });
    }
    return E;
  };
  // 水から受ける力と回す力（体の速さ V・回り W・形の速さを入れるか）
  const FT = (E, Vx, Vy, W, withU) => {
    let Fx = ZC * Vx, Fy = ZC * Vy, Tq = ZR * W;
    for (const e of E) {
      const wx = Vx - W * e.py + (withU ? e.ux : 0), wy = Vy + W * e.px + (withU ? e.uy : 0);
      const wt = wx * e.tx + wy * e.ty;
      const fx = e.L * (e.zn * wx - (e.zn - e.zt) * wt * e.tx), fy = e.L * (e.zn * wy - (e.zn - e.zt) * wt * e.ty);
      Fx += fx; Fy += fy; Tq += e.px * fy - e.py * fx;
    }
    return [Fx, Fy, Tq];
  };
  let X = 0, Y = 0, th = 0, work = 0;
  const track = [];
  for (let k = 0; k < STEPS; k++) {
    const E = elems(k * ds);
    const c0 = FT(E, 1, 0, 0, false), c1 = FT(E, 0, 1, 0, false), c2 = FT(E, 0, 0, 1, false), u = FT(E, 0, 0, 0, true);
    const [Vx, Vy, W] = solve3([c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]], [-u[0], -u[1], -u[2]]);
    let p = ZC * (Vx * Vx + Vy * Vy) + ZR * W * W;
    for (const e of E) {
      const wx = Vx - W * e.py + e.ux, wy = Vy + W * e.px + e.uy, wt = wx * e.tx + wy * e.ty;
      p += e.L * (e.zn * (wx * wx + wy * wy) - (e.zn - e.zt) * wt * wt);
    }
    work += p * ds;
    track.push(th);
    const c = Math.cos(th), sn = Math.sin(th);
    X += (c * Vx - sn * Vy) * ds; Y += (sn * Vx + c * Vy) * ds; th += W * ds;
  }
  // リズム1回で進んだ量（回りながら進むときは、まん中の向きでみる）
  const hm = -th / 2;
  const fx = Math.cos(hm) * X - Math.sin(hm) * Y, fy = Math.sin(hm) * X + Math.cos(hm) * Y;
  P.fwd = Math.hypot(fx, fy); P.spin = th; P.work = work;
  P.heading = P.fwd > 1e-4 ? Math.atan2(fy, fx) : 0;     // 進む向き。絵と体の向きはこれを前にする
  for (let f = 0; f < FRAMES; f++) {
    const s = f / FRAMES, wob = track[Math.floor(s * STEPS)] - th * s;
    shape(b, s, A); shape(b, s + 1 / STEPS, B);
    const rot = -P.heading + wob, c = Math.cos(rot), sn = Math.sin(rot);
    const pts = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pts[i * 4] = c * A[i].bx - sn * A[i].by; pts[i * 4 + 1] = sn * A[i].bx + c * A[i].by;
      pts[i * 4 + 2] = c * A[i].ex - sn * A[i].ey; pts[i * 4 + 3] = sn * A[i].ex + c * A[i].ey;
      P.reach = Math.max(P.reach, Math.hypot(A[i].ex, A[i].ey));
    }
    P.frames.push({ w: wob, pts });
    tips.forEach((i, j) => { P.tipV[f * tips.length + j] = Math.hypot(B[i].ex - A[i].ex, B[i].ey - A[i].ey) * STEPS; });
  }
  cache.set(b, P);
  return P;
}

// 決まり6の「形が少し変わる」。変わらなければ同じものを返す（計算を使いまわす）
export function mutateBody(b, r, gauss) {
  let out = null;
  const edit = () => out || (out = cloneBody(b));
  if (b.segs.length && r() < 0.3) {                     // 数が少し変わる
    const o = edit();
    o.T = clamp(o.T * Math.exp(gauss(r) * 0.12), 0.03, 3);
    for (const s of o.segs) {
      if (r() < 0.4) s.len = clamp(s.len * Math.exp(gauss(r) * 0.12), 0.2, 4);
      if (r() < 0.4) s.ang += gauss(r) * 0.12;
      if (r() < 0.4) s.amp = clamp(s.amp + gauss(r) * 0.1, -1.4, 1.4);
      if (r() < 0.4) s.ph = (s.ph + gauss(r) * 0.08 + 1) % 1;
      if (s.p < 0 && r() < 0.3) s.at += gauss(r) * 0.12;
    }
  }
  const cur = out || b, m = cur.segs.length, u = r();
  if (m < MAX_SEGS && u < 0.02) {                       // 生える（細胞のふちか、節の先から）
    const o = edit(), p = m && r() < 0.5 ? (r() * m) | 0 : -1;
    o.segs.push({ p, at: r() * Math.PI * 2 - Math.PI, ang: gauss(r) * 0.4, len: 0.5 + r() * 1.2, amp: gauss(r) * 0.4, ph: r() });
  } else if (m && m < MAX_SEGS && u < 0.035) {          // 先の節が、少しずれたリズムでもう1節のびる
    const lv = leaves(cur), o = edit(), i = lv[(r() * lv.length) | 0], s = o.segs[i];
    o.segs.push({ p: i, at: 0, ang: gauss(r) * 0.2, len: s.len * (0.7 + r() * 0.4), amp: s.amp, ph: (s.ph + 0.1 + r() * 0.2) % 1 });
  } else if (m && u < 0.047) {                          // 細胞から生える節を、反対がわに写す（左右がそろう）
    const roots = cur.segs.map((s, i) => i).filter(i => cur.segs[i].p < 0);
    if (roots.length && m < MAX_SEGS) {
      const o = edit(), s = o.segs[roots[(r() * roots.length) | 0]];
      o.segs.push({ ...s, at: -s.at, ang: -s.ang, amp: -s.amp });
    }
  } else if (m && u < 0.062) {                          // 先の節がなくなる
    const lv = leaves(cur), o = edit(), k = lv[(r() * lv.length) | 0];
    o.segs.splice(k, 1);
    for (const s of o.segs) if (s.p > k) s.p--;
  }
  return out || b;
}

function leaves(b) {
  const has = new Array(b.segs.length).fill(false);
  for (const s of b.segs) if (s.p >= 0) has[s.p] = true;
  return b.segs.map((_, i) => i).filter(i => !has[i]);
}

// 2つのからだのちがい（系統を分けるため）
export function bodyDistance(a, b) {
  const P = analyze(a), Q = analyze(b);
  return Math.abs(P.n - Q.n) * 0.15 + Math.abs(P.sumLen - Q.sumLen) * 0.06 + Math.abs(Math.log(a.T / b.T)) * 0.15;
}

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
