// WebGL2 の描画。画素ごとに、カメラの向き → 表（lut.js）→ 無限遠の向き → 空の絵。float のテクスチャには描かないのでスマホでも動く。
'use strict';

const VS = `#version 300 es
in vec2 aPos; out vec2 vP;
void main(){ vP = aPos; gl_Position = vec4(aPos, 0., 1.); }`;

const FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vP; out vec4 oC;
uniform sampler2D uLut, uSkyA, uSkyB;
uniform vec2 uHalf;       // 画面の半分の tan
uniform vec2 uPx;         // 1画素の大きさ（-1〜1 の座標）
uniform mat3 uView;       // 列 = 右・上・前（局所の座標 x=+ℓ、y・z=球面の接線）
uniform float uPsiC, uK0, uK1, uFlip, uSkyW, uPano;
uniform int uN, uMode;
const float PI = 3.14159265358979, TAU = 6.28318530717959, DELTA_MIN = 1e-5;

float lutPhi(float psi, out float seg){
  float p = uFlip > .5 ? PI - psi : psi;
  seg = p < uPsiC ? 0. : 1.;
  float delta = abs(p - uPsiC), span = seg > .5 ? PI - uPsiC : uPsiC, K = seg > .5 ? uK1 : uK0;
  float t = clamp(log(span / max(delta, DELTA_MIN)) / K, 0., 1.) * float(uN - 1);
  int i = min(uN - 2, int(floor(t))), s = int(seg);
  return mix(texelFetch(uLut, ivec2(i, s), 0).r, texelFetch(uLut, ivec2(i + 1, s), 0).r, t - float(i));
}
vec3 gridCol(vec3 d, float pix, float far){
  float th = acos(clamp(d.x, -1., 1.)), az = atan(d.z, d.y), st = max(sin(th), .02);
  float ring = abs(fract(th / (PI / 12.) + .5) - .5) * PI / 12.;
  float rad  = abs(fract(az / (PI / 6.) + .5) - .5) * PI / 6. * st;
  float w = pix * .55;
  float line = max(1. - smoothstep(w * .6, w * 1.6, ring), (st > .13 ? 1. - smoothstep(w * .6, w * 1.6, rad) : 0.));
  vec3 base = far > .5 ? vec3(.10, .05, .025) : vec3(.022, .05, .11);
  vec3 ink  = far > .5 ? vec3(1., .63, .32) : vec3(.45, .78, 1.);
  float hemi = smoothstep(0., pix * 2., abs(d.x));
  return mix(base * (d.x > 0. ? 1.5 : 1.) * mix(.6, 1., hemi), ink, line * .9);
}
vec3 shade(vec2 pos){
  vec3 d;
  if (uPano > 0.) {   // 水平にぐるり一周の帯（真ん中が +ℓ、左右の端が −ℓ。uPano = 帯の高さ／幅）
    float az = -pos.x * PI, el = pos.y * PI * uPano;
    d = vec3(cos(el) * cos(az), cos(el) * sin(az), sin(el));
  } else d = normalize(uView * vec3(pos * uHalf, 1.));
  float tl = length(d.yz);
  float psi = atan(tl, d.x);
  float seg, phi = lutPhi(psi, seg);
  vec2 t2 = tl > 1e-9 ? d.yz / tl : vec2(1., 0.);
  vec3 fd = vec3(cos(phi), sin(phi) * t2);
  float side = (seg < .5) != (uFlip > .5) ? 1. : 0.;   // 1 = 向こうの宇宙（ℓ > 0）
  float pix = clamp(max(length(dFdx(fd)), length(dFdy(fd))), 1e-4, 1.);
  if (uMode == 1) return gridCol(fd, pix, side);
  vec2 uv = vec2(atan(fd.y, fd.x) / TAU + .5, acos(clamp(fd.z, -1., 1.)) / PI);
  float lod = clamp(log2(pix * uSkyW / TAU), 0., 6.);
  return side > .5 ? textureLod(uSkyB, uv, lod).rgb : textureLod(uSkyA, uv, lod).rgb;
}
void main(){
  // 4 点でならしてふちのギザギザを減らす（RGSS）
  vec3 c = shade(vP + uPx * vec2( .125, .375)) + shade(vP + uPx * vec2(-.375, .125))
         + shade(vP + uPx * vec2( .375,-.125)) + shade(vP + uPx * vec2(-.125,-.375));
  c *= .25 * 1.35;
  oC = vec4(pow(min(c, vec3(1.)), vec3(1. / 2.2)), 1.);
}`;

const R = {};

function compile(gl, vs, fs) {
  const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

function skyTexture(gl, cv) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function initRender(canvas, skyW) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('この端末では WebGL2 が使えません');
  R.gl = gl; R.skyW = skyW;
  R.prog = compile(gl, VS, FS);
  gl.useProgram(R.prog);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  R.u = {};
  for (const n of ['uLut', 'uSkyA', 'uSkyB', 'uHalf', 'uPx', 'uView', 'uPsiC', 'uK0', 'uK1', 'uFlip', 'uSkyW', 'uN', 'uMode', 'uPano']) R.u[n] = gl.getUniformLocation(R.prog, n);

  R.lut = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.lut);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, LUT_N, 2, 0, gl.RED, gl.FLOAT, null);

  gl.activeTexture(gl.TEXTURE1); R.skyA = skyTexture(gl, makeSkyCanvas('A', skyW));
  gl.activeTexture(gl.TEXTURE2); R.skyB = skyTexture(gl, makeSkyCanvas('B', skyW));
  gl.uniform1i(R.u.uLut, 0); gl.uniform1i(R.u.uSkyA, 1); gl.uniform1i(R.u.uSkyB, 2);
  gl.uniform1f(R.u.uSkyW, skyW); gl.uniform1i(R.u.uN, LUT_N);
}

function uploadLUT(T) {
  const gl = R.gl;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.lut);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LUT_N, 2, gl.RED, gl.FLOAT, T.data);
  gl.uniform1f(R.u.uPsiC, T.psiC); gl.uniform1f(R.u.uK0, T.K0); gl.uniform1f(R.u.uK1, T.K1); gl.uniform1f(R.u.uFlip, T.flip);
}

// view: { right, up, fwd }（局所の座標）、half: [tanX, tanY]、mode: 0 星空・1 方眼
function drawView(view, half, mode, stripPx) {
  const gl = R.gl, c = gl.canvas;
  gl.uniform1i(R.u.uMode, mode);
  gl.uniform1f(R.u.uPano, 0);
  gl.viewport(0, 0, c.width, c.height);
  gl.uniform2f(R.u.uHalf, half[0], half[1]);
  gl.uniform2f(R.u.uPx, 2 / c.width, 2 / c.height);
  gl.uniformMatrix3fv(R.u.uView, false, new Float32Array([...view.right, ...view.up, ...view.fwd]));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // 下の帯（水平にぐるり一周）
  gl.uniform1f(R.u.uPano, stripPx / c.width);
  gl.viewport(0, 0, c.width, stripPx);
  gl.uniform2f(R.u.uPx, 2 / c.width, 2 / stripPx);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
