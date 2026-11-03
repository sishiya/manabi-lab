// WebGL2 でたくさんの線・丸・膜の輪・四角・光の輪を、1回の命令でまとめて描く（深海の発光の、くっきりの線と光の輪）。
// 描いた絵は画面の外のキャンバスにあり、abyss.js が今までどおり 2D の絵に重ねる。WebGL2 が使えなければ null を返し、今の描き方にもどる
const VS = `#version 300 es
in vec2 corner;            // 四角のすみ（0..1）
in vec4 ab;                // 線: 始まり・終わり ／ 丸: まん中・(半径など)
in vec4 prm;               // w・p1・p2・種類
in vec4 col;               // 色（0..1）
uniform vec2 cam; uniform float zs; uniform vec2 view; uniform float px;
out vec2 loc; out vec4 vprm; out vec4 vcol; out float vlen; out vec2 vab2;
void main() {
  float kind = prm.w, w = prm.x;
  vec2 p;
  if (kind < 0.5) {        // 線（丸い端）
    vec2 d = ab.zw - ab.xy; float L = length(d); vec2 u = L > 1e-5 ? d / L : vec2(1.0, 0.0), n = vec2(-u.y, u.x);
    float hw = w * 0.5 + px;
    vec2 l = vec2(mix(-hw, L + hw, corner.x), mix(-hw, hw, corner.y));
    p = ab.xy + u * l.x + n * l.y; loc = l; vlen = L;
  } else {                 // 丸のなかま: まん中 ab.xy、外の半径 S
    float S = kind < 1.5 ? w : kind < 2.5 ? ab.z + w * 0.5 : kind < 3.5 ? w * 0.5 : ab.z;
    S += px;
    vec2 l = (corner * 2.0 - 1.0) * S;
    p = ab.xy + l; loc = l; vlen = 0.0;
  }
  vab2 = ab.zw; vprm = prm; vcol = col;
  gl_Position = vec4((p - cam) * zs / view * 2.0 * vec2(1.0, -1.0), 0.0, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec2 loc; in vec4 vprm; in vec4 vcol; in float vlen; in vec2 vab2;
uniform float px;
out vec4 o;
float ramp(float t, float a, float b, float va, float vb) { return mix(va, vb, clamp((t - a) / max(b - a, 1e-4), 0.0, 1.0)); }
void main() {
  float kind = vprm.w, w = vprm.x, a = 0.0;
  if (kind < 0.5) {
    float u = loc.x < 0.0 ? -loc.x : loc.x > vlen ? loc.x - vlen : 0.0;
    a = clamp(0.5 - (length(vec2(u, loc.y)) - w * 0.5) / px, 0.0, 1.0);
    if (vprm.y > 0.5 && u > 0.0) a = 0.0;   // つなぐ線は端を丸めない（つなぎ目で重ならない）
  } else if (kind < 1.5) {
    a = clamp(0.5 - (length(loc) - w) / px, 0.0, 1.0);
  } else if (kind < 2.5) {   // 膜の輪: 半径 vab2.x・太さ w・切れ目のまん中 vprm.y・半分の幅 vprm.z
    float d = abs(length(loc) - vab2.x) - w * 0.5;
    a = clamp(0.5 - d / px, 0.0, 1.0);
    float ang = atan(loc.y, loc.x), dg = abs(mod(ang - vprm.y + 3.14159265, 6.2831853) - 3.14159265);
    if (dg < vprm.z) a = 0.0;
  } else if (kind < 3.5) {
    a = clamp(0.5 - (max(abs(loc.x), abs(loc.y)) - w * 0.5) / px, 0.0, 1.0);
  } else if (kind < 4.5) {   // 光の輪: t＝まん中からの距離÷外の半径、q＝体の半径÷外の半径
    float t = length(loc) / vab2.x, q = vprm.y;
    a = t < q * 0.8 ? ramp(t, 0.0, q * 0.8, 0.03, 0.08) : t < q ? ramp(t, q * 0.8, q, 0.08, 0.85)
      : t < q + (1.0 - q) * 0.4 ? ramp(t, q, q + (1.0 - q) * 0.4, 0.85, 0.3) : ramp(t, q + (1.0 - q) * 0.4, 1.0, 0.3, 0.0);
  } else {                   // ぼんやりした丸（死んだときの光）
    float t = length(loc) / vab2.x;
    a = t < 0.35 ? ramp(t, 0.0, 0.35, 1.0, 0.55) : ramp(t, 0.35, 1.0, 0.55, 0.0);
  }
  float al = a * vcol.a;
  o = vec4(vcol.rgb * al, al);   // 色はあらかじめ透明度をかけた形
}`;

const F = 12;   // 1つの形の数: ab(4)・prm(4)・col(4)

export function makeGL() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const pg = gl.createProgram();
  gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
  if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pg));
  gl.useProgram(pg);
  const U = n => gl.getUniformLocation(pg, n), uCam = U('cam'), uZs = U('zs'), uView = U('view'), uPx = U('px');
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const aCorner = gl.getAttribLocation(pg, 'corner'); gl.enableVertexAttribArray(aCorner); gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib);
  for (const [name, off] of [['ab', 0], ['prm', 4], ['col', 8]]) {
    const l = gl.getAttribLocation(pg, name); gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, 4, gl.FLOAT, false, F * 4, off * 4); gl.vertexAttribDivisor(l, 1);
  }
  let buf = new Float32Array(F * 4096), n = 0, px = 1;
  const push = (x0, y0, x1, y1, w, p1, p2, kind, c) => {
    if ((n + 1) * F > buf.length) { const nb = new Float32Array(buf.length * 2); nb.set(buf); buf = nb; }
    const i = n++ * F;
    buf[i] = x0; buf[i + 1] = y0; buf[i + 2] = x1; buf[i + 3] = y1; buf[i + 4] = w; buf[i + 5] = p1; buf[i + 6] = p2; buf[i + 7] = kind;
    buf[i + 8] = c[0]; buf[i + 9] = c[1]; buf[i + 10] = c[2]; buf[i + 11] = c[3];
  };
  return {
    canvas,
    // 大きさ（画素）・カメラ（まん中と、世界 1 µm が何画素か）を決めて、ためた形を空にする
    begin(W, H, cx, cy, zs) {
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      n = 0; px = 1 / zs;
      gl.viewport(0, 0, W, H); gl.uniform2f(uCam, cx, cy); gl.uniform1f(uZs, zs); gl.uniform2f(uView, W, H); gl.uniform1f(uPx, px);
    },
    seg(x0, y0, x1, y1, w, c, butt = false) { push(x0, y0, x1, y1, w, butt ? 1 : 0, 0, 0, c); },
    disc(x, y, r, c) { push(x, y, 0, 0, r, 0, 0, 1, c); },
    ring(x, y, r, w, gapAt, gapHalf, c) { push(x, y, r, 0, w, gapAt, gapHalf, 2, c); },
    square(x, y, s, c) { push(x, y, 0, 0, s, 0, 0, 3, c); },
    glowRing(x, y, R, q, c) { push(x, y, R, 0, 0, q, 0, 4, c); },
    blob(x, y, R, c) { push(x, y, R, 0, 0, 0, 0, 5, c); },
    // ためた形を描く。add: 光は足し算、そうでなければ上に重ねる
    flush(add) {
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!n) return;
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, n * F), gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    },
    get count() { return n; },
  };
}

// 'rgba(r,g,b,a)' や 'r,g,b' と透明度から、0..1 の [r,g,b,a]
const cache = new Map();
export function rgba(s, a) {
  const k = a === undefined ? s : s + '|' + a;
  let c = cache.get(k);
  if (!c) {
    const m = s.match(/[\d.]+/g).map(Number);
    c = [m[0] / 255, m[1] / 255, m[2] / 255, a ?? (m[3] ?? 1)];
    cache.set(k, c);
  }
  return c;
}
