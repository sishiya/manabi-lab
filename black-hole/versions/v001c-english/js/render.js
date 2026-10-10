// WebGL2 の描画。
// 1) 光の追跡（重い）: カメラが動いたときだけ。ピクセルごとに「穴・円盤のどこ・空のどの方向」をテクスチャ（geo）に覚える。
//    動かしている間は粗い段（low）を一度に、止まったら細かい段（high）を小さな四角（タイル）に分けて何コマかで。
// 2) 色づけ（軽い）: 毎コマ。円盤の模様は回転させる。明るい所をにじませて（ブルーム）画面へ。
'use strict';

const GEO_MAXS = 900;          // 1 本の光の最大の歩数
const TILE = 192;

const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position = vec4(p*2.-1., 0., 1.); }`;

// ---- 光の追跡（kerr.js の deriv・initRay・traceRay と同じ式） ----
const GEO_FS = `#version 300 es
precision highp float;
uniform vec2 uRes, uOff, uFull;   // uOff/uFull: この段の画面全体の中での位置（タイルでも同じ画角にする）
uniform vec2 uCam;                // r, θ
uniform vec2 uLook;
uniform float uA, uTanF, uRh, uRin, uRout, uEsc, uDisk;
out vec4 o;
void deriv(vec3 x, vec2 p, float b, float q, out vec3 dx, out vec2 dp){
  float a = uA, r = x.x;
  float s = sin(x.y), c = cos(x.y);
  if (abs(s) < 1e-5) s = s < 0. ? -1e-5 : 1e-5;
  float S = r*r + a*a*c*c, D = r*r - 2.*r + a*a;
  float P = r*r + a*a - a*b, K = (b-a)*(b-a) + q, R = P*P - D*K;
  float Dp = 2.*r - 2., Rp = 4.*r*P - Dp*K;
  dx = vec3(D*p.x/S, p.y/S, (a*P/D - a + b/(s*s))/S);
  dp = vec2((Rp/D - R*Dp/(D*D) - Dp*p.x*p.x)/(2.*S), (b*b*c/(s*s*s) - a*a*s*c)/S);
}
vec3 cart(vec3 x){ float rr = sqrt(x.x*x.x + uA*uA), s = sin(x.y); return vec3(rr*s*cos(x.z), rr*s*sin(x.z), x.x*cos(x.y)); }
void main(){
  vec2 ndc = (gl_FragCoord.xy + uOff) / uFull * 2. - 1.;
  float asp = uFull.x / uFull.y;
  vec3 v = normalize(vec3(ndc.x*uTanF*asp, ndc.y*uTanF, 1.));
  float cp = cos(uLook.y), sp = sin(uLook.y);
  v = vec3(v.x, v.y*cp + v.z*sp, -v.y*sp + v.z*cp);
  float cy = cos(uLook.x), sy = sin(uLook.x);
  v = vec3(v.x*cy + v.z*sy, v.y, -v.x*sy + v.z*cy);
  vec3 n = -vec3(-v.z, -v.y, v.x);            // 光の進む向き（r̂, θ̂, φ̂）
  float a = uA, r = uCam.x, th = uCam.y;
  float s = sin(th), c = cos(th);
  float rho2 = r*r + a*a*c*c, D = r*r - 2.*r + a*a, A = (r*r + a*a)*(r*r + a*a) - a*a*D*s*s;
  float alpha = sqrt(rho2*D/A), omega = 2.*a*r/A, varpi = sqrt(A)*s/sqrt(rho2);
  float EF = 1. / (alpha + omega*varpi*n.z);
  vec2 p = vec2(EF*sqrt(rho2)/sqrt(D)*n.x, EF*sqrt(rho2)*n.y);
  float b = EF*varpi*n.z;
  float q = p.y*p.y + c*c*(b*b/(s*s) - a*a);
  vec3 x = vec3(r, th, 0.);
  o = vec4(0.);
  for (int i = 0; i < ${GEO_MAXS}; i++) {
    vec3 x0 = x;
    vec3 k1x, k2x, k3x, k4x; vec2 k1p, k2p, k3p, k4p;
    deriv(x, p, b, q, k1x, k1p);
    // 歩幅: 穴に近いほど小さく。回転軸の近くでは 1 歩で回る角度が大きくなりすぎないように
    float hl = max(0.06*(x.x - uRh), 0.004);
    hl = min(hl, 0.04/(abs(k1x.z) + abs(k1x.y) + 1e-6));
    float h = -hl;
    deriv(x + .5*h*k1x, p + .5*h*k1p, b, q, k2x, k2p);
    deriv(x + .5*h*k2x, p + .5*h*k2p, b, q, k3x, k3p);
    deriv(x + h*k3x, p + h*k3p, b, q, k4x, k4p);
    x += h/6.*(k1x + 2.*k2x + 2.*k3x + k4x);
    p += h/6.*(k1p + 2.*k2p + 2.*k3p + k4p);
    if (x.x < uRh + 0.01) { o = vec4(0.); return; }
    float c0 = cos(x0.y), c1 = cos(x.y);
    if (uDisk > .5 && c0*c1 <= 0. && c0 != c1) {
      float f = c0/(c0 - c1), rc = mix(x0.x, x.x, f);
      if (rc >= uRin && rc <= uRout) {
        float ph = mix(x0.z, x.z, f);
        if (sin(mix(x0.y, x.y, f)) < 0.) ph += 3.14159265;   // 回転軸をまたいだ光（θ < 0 や θ > π）
        float r32 = pow(rc, 1.5);
        float ut = (r32 + a) / (pow(rc, .75)*sqrt(r32 - 3.*sqrt(rc) + 2.*a));
        float g = EF / (ut*(1. - b/(r32 + a)));
        o = vec4(c0 > 0. ? 1. : 1.5, rc, ph, g); return;
      }
    }
    if (x.x > uEsc && x.x > x0.x) { o = vec4(2., normalize(cart(x) - cart(x0))); return; }
    if (x.x != x.x) { o = vec4(0.); return; }
  }
}`;

// ---- 色づけ ----
const SHADE_FS = `#version 300 es
precision highp float;
uniform highp sampler2D uGeo;
uniform sampler2D uSky;
uniform float uTime, uReal, uSkyMode, uRin, uRout, uA, uPhc, uSkyGain, uDiskGain, uSkyW;
out vec4 o;
const float PI = 3.14159265;
float hash(vec3 p){ p = fract(p*vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx + 19.19); return fract((p.x + p.y)*p.z); }
float noise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a*noise(p); p = p*2.03 + 1.7; a *= .5; } return s; }
// 黒体の色（3 つの波長で近似し、明るさ 1 にそろえる）
vec3 bb(float T){
  vec3 lam = vec3(0.610, 0.550, 0.465);           // μm
  vec3 B = 1. / (lam*lam*lam*lam*lam*(exp(14388./(lam*T)) - 1.));
  return B / dot(B, vec3(.2126, .7152, .0722));
}
vec3 rotz(vec3 d, float a){ float c = cos(a), s = sin(a); return vec3(c*d.x - s*d.y, s*d.x + c*d.y, d.z); }
vec3 skyCol(vec3 d, float pa){
  if (uSkyMode > 1.5) return vec3(0.);
  if (uSkyMode > .5) {
    // 方眼の空（10° ごとの線と、8 つの区画の色）
    float th = acos(clamp(d.z, -1., 1.)), ph = atan(d.y, d.x);
    float st = PI/18.;
    float dth = abs(fract(th/st + .5) - .5)*st, dph = abs(fract(ph/st + .5) - .5)*st*sin(th);
    float w = max(pa*0.9, .0022);
    float line = max(1. - smoothstep(w*.5, w, dth), 1. - smoothstep(w*.5, w, dph));
    float dense = clamp(pa/st*4., 0., 1.);
    line = mix(line, .25, dense);
    vec3 base = d.z > 0. ? (d.y > 0. ? vec3(.55,.16,.12) : vec3(.12,.32,.6)) : (d.y > 0. ? vec3(.55,.45,.1) : vec3(.12,.48,.2));
    if (d.x < 0.) base *= .55;
    return (base*.6 + line*vec3(.7))*.5;
  }
  vec2 uv = vec2(atan(d.y, d.x)/(2.*PI) + .5, acos(clamp(d.z, -1., 1.))/PI);
  float lod = log2(max(pa*uSkyW/(2.*PI), 1e-4));
  return textureLod(uSky, uv, clamp(lod, 0., 12.)).rgb * uSkyGain;
}
vec3 diskCol(float r, float ph, float g, float face){
  float om = 1./(pow(r, 1.5) + uA);
  float phr = ph + uPhc - om*uTime;
  float n = fbm(vec3(r*1.9, cos(phr)*3.2, sin(phr)*3.2) + face*5.);
  float n2 = fbm(vec3(r*7., cos(phr)*r*.9, sin(phr)*r*.9));
  float dens = .35 + 1.1*n*n + .35*n2;
  float x = r/uRin;
  float edge = smoothstep(uRout, uRout*.82, r);
  vec3 col;
  if (uReal < .5) {
    // 映画版: 色と明るさのずれを入れない
    float I = pow(x, -1.6) * smoothstep(1., 1.06, x) * edge;
    float T = 2900. + 2300.*pow(x, -1.2);
    col = bb(T) * I * dens;
  } else {
    // 本当の見え方: 円盤の温度の形（Shakura–Sunyaev の目安）に、振動数のずれ g を入れる
    float prof = pow(x, -3.)*(1. - sqrt(1./x)) / .0566;      // 内側の近くで 1 になる
    float T = 5200.*pow(max(prof, 0.), .25);
    col = bb(max(g*T, 800.)) * prof * g*g*g*g * dens * edge * 1.3;
  }
  return col * uDiskGain;
}
void main(){
  ivec2 ip = ivec2(gl_FragCoord.xy), sz = textureSize(uGeo, 0);
  vec4 G = texelFetch(uGeo, ip, 0);
  vec3 col = vec3(0.);
  if (G.x > 1.75) {
    vec3 d = rotz(G.yzw, uPhc);
    // となりのピクセルとの角度の差 → 空の絵のぼかし具合
    vec4 gx = texelFetch(uGeo, ivec2(ip.x < sz.x - 1 ? ip.x + 1 : ip.x - 1, ip.y), 0);
    vec4 gy = texelFetch(uGeo, ivec2(ip.x, ip.y < sz.y - 1 ? ip.y + 1 : ip.y - 1), 0);
    float pa = 0.;
    if (gx.x > 1.75) pa = max(pa, acos(clamp(dot(G.yzw, gx.yzw), -1., 1.)));
    if (gy.x > 1.75) pa = max(pa, acos(clamp(dot(G.yzw, gy.yzw), -1., 1.)));
    if (gx.x < 1.75 && gy.x < 1.75) pa = .02;
    col = skyCol(d, pa);
  } else if (G.x > .75) {
    col = diskCol(G.y, G.z, G.w, G.x > 1.25 ? 1. : 0.);
  }
  o = vec4(col, 1.);
}`;

// ---- にじみ（ブルーム）: 縮めながらぼかし、広げながら足す ----
const DOWN_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uFirst;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy * 2. * uTexel;   // uTexel は入力の 1 ピクセル
  vec3 c = texture(uTex, uv + uTexel*vec2(-1,-1)).rgb + texture(uTex, uv + uTexel*vec2(1,-1)).rgb
         + texture(uTex, uv + uTexel*vec2(-1,1)).rgb + texture(uTex, uv + uTexel*vec2(1,1)).rgb;
  c *= .25;
  if (uFirst > .5) { float l = max(c.r, max(c.g, c.b)); c *= max(l - .9, 0.) / max(l, 1e-4); }
  o = vec4(c, 1.);
}`;
const UP_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uTexel; uniform vec2 uOutRes;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uOutRes;
  vec3 c = vec3(0.);
  c += texture(uTex, uv + uTexel*vec2(-1,-1)).rgb + texture(uTex, uv + uTexel*vec2(1,-1)).rgb
     + texture(uTex, uv + uTexel*vec2(-1,1)).rgb + texture(uTex, uv + uTexel*vec2(1,1)).rgb;
  c += 2.*(texture(uTex, uv + uTexel*vec2(0,-1)).rgb + texture(uTex, uv + uTexel*vec2(0,1)).rgb
     + texture(uTex, uv + uTexel*vec2(-1,0)).rgb + texture(uTex, uv + uTexel*vec2(1,0)).rgb);
  c += 4.*texture(uTex, uv).rgb;
  o = vec4(c/16., 1.);
}`;
const COMP_FS = `#version 300 es
precision highp float;
uniform sampler2D uHdr, uBloom; uniform vec2 uOutRes; uniform float uExpo, uBloomK;
out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x + .03))/(x*(2.43*x + .59) + .14), 0., 1.); }
void main(){
  vec2 uv = gl_FragCoord.xy / uOutRes;
  vec3 c = texture(uHdr, uv).rgb + texture(uBloom, uv).rgb * uBloomK;
  c = aces(c * uExpo);
  float v = length(uv - .5); c *= 1. - .25*v*v;
  o = vec4(pow(c, vec3(1./2.2)), 1.);
}`;

const R = { gl: null, progs: {}, levels: {}, sky: null, budget: 3 };

function compile(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
  return { p, u };
}

function makeTarget(gl, w, h, fmt) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const F = { geo: [gl.RGBA32F, gl.RGBA, gl.FLOAT], hdr: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT] }[fmt];
  gl.texImage2D(gl.TEXTURE_2D, 0, F[0], w, h, 0, F[1], F[2], null);
  const filt = fmt === 'geo' ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, w, h };
}
function freeTarget(gl, t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }

function makeLevel(gl, w, h) {
  const L = { w, h, geo: makeTarget(gl, w, h, 'geo'), hdr: makeTarget(gl, w, h, 'hdr'), chain: [], tiles: [], next: 0, ready: false };
  let cw = w, ch = h;
  for (let i = 0; i < 6 && cw > 8 && ch > 8; i++) { cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1); L.chain.push(makeTarget(gl, cw, ch, 'hdr')); }
  for (let y = 0; y < h; y += TILE) for (let x = 0; x < w; x += TILE) L.tiles.push([x, y, Math.min(TILE, w - x), Math.min(TILE, h - y)]);
  // 真ん中から外へ（穴のまわりが先に細かくなる）
  L.tiles.sort((A, B) => Math.hypot(A[0] + A[2] / 2 - w / 2, A[1] + A[3] / 2 - h / 2) - Math.hypot(B[0] + B[2] / 2 - w / 2, B[1] + B[3] / 2 - h / 2));
  return L;
}
function freeLevel(gl, L) { if (!L) return; freeTarget(gl, L.geo); freeTarget(gl, L.hdr); L.chain.forEach(t => freeTarget(gl, t)); }

function initRender(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error(L('WebGL2 が使えません', 'WebGL2 is not available'));
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error(L('浮動小数点のテクスチャに描けません（EXT_color_buffer_float）', 'cannot render to floating-point textures (EXT_color_buffer_float)'));
  R.gl = gl;
  R.progs.geo = compile(gl, VS, GEO_FS);
  R.progs.shade = compile(gl, VS, SHADE_FS);
  R.progs.down = compile(gl, VS, DOWN_FS);
  R.progs.up = compile(gl, VS, UP_FS);
  R.progs.comp = compile(gl, VS, COMP_FS);
  R.vao = gl.createVertexArray();
  // 星空
  const cv = makeSkyCanvas();
  R.sky = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, R.sky);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const an = gl.getExtension('EXT_texture_filter_anisotropic');
  if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 8);
}

// 画面の大きさが変わったら段を作り直す。lowScale: 粗い段の縮め方、ss: 細かい段を画面の何倍の細かさで描くか（縮めてなめらかにする）
function resizeRender(w, h, lowScale, ss) {
  const gl = R.gl;
  gl.canvas.width = w; gl.canvas.height = h;
  freeLevel(gl, R.levels.low); freeLevel(gl, R.levels.high);
  R.levels.low = makeLevel(gl, Math.max(16, Math.round(w * lowScale)), Math.max(16, Math.round(h * lowScale)));
  R.levels.high = makeLevel(gl, Math.round(w * ss), Math.round(h * ss));
  R.levels.low.ready = false;
}

function geoUniforms(P, L) {
  const gl = R.gl, u = R.progs.geo.u;
  gl.uniform2f(u.uRes, L.w, L.h); gl.uniform2f(u.uFull, L.w, L.h);
  gl.uniform2f(u.uCam, P.r, P.th); gl.uniform2f(u.uLook, P.look[0], P.look[1]);
  gl.uniform1f(u.uA, P.a); gl.uniform1f(u.uTanF, P.tanF); gl.uniform1f(u.uRh, horizon(P.a));
  gl.uniform1f(u.uRin, P.rin); gl.uniform1f(u.uRout, P.rout); gl.uniform1f(u.uEsc, Math.max(P.r * 2, 60));
  gl.uniform1f(u.uDisk, P.disk ? 1 : 0);
}

// 粗い段を一度に描く
function geoFull(L, P) {
  const gl = R.gl;
  gl.useProgram(R.progs.geo.p); gl.bindVertexArray(R.vao);
  gl.bindFramebuffer(gl.FRAMEBUFFER, L.geo.fb); gl.viewport(0, 0, L.w, L.h);
  geoUniforms(P, L); gl.uniform2f(R.progs.geo.u.uOff, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  L.ready = true; L.next = L.tiles.length;
}
// 細かい段を n 枚のタイルだけ進める。終わったら true
function geoTiles(L, P, n) {
  const gl = R.gl;
  gl.useProgram(R.progs.geo.p); gl.bindVertexArray(R.vao);
  gl.bindFramebuffer(gl.FRAMEBUFFER, L.geo.fb); gl.viewport(0, 0, L.w, L.h);
  geoUniforms(P, L); gl.uniform2f(R.progs.geo.u.uOff, 0, 0);
  gl.enable(gl.SCISSOR_TEST);
  for (let i = 0; i < n && L.next < L.tiles.length; i++, L.next++) {
    const t = L.tiles[L.next]; gl.scissor(t[0], t[1], t[2], t[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.disable(gl.SCISSOR_TEST);
  if (L.next >= L.tiles.length) L.ready = true;
  return L.ready;
}
function resetLevel(L) { L.next = 0; L.ready = false; }

function shade(L, P, look) {
  const gl = R.gl, s = R.progs.shade;
  gl.useProgram(s.p); gl.bindVertexArray(R.vao);
  gl.bindFramebuffer(gl.FRAMEBUFFER, L.hdr.fb); gl.viewport(0, 0, L.w, L.h);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L.geo.tex); gl.uniform1i(s.u.uGeo, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.sky); gl.uniform1i(s.u.uSky, 1);
  gl.uniform1f(s.u.uTime, look.time); gl.uniform1f(s.u.uReal, look.real ? 1 : 0);
  gl.uniform1f(s.u.uSkyMode, { stars: 0, grid: 1, none: 2 }[look.sky]);
  gl.uniform1f(s.u.uRin, P.rin); gl.uniform1f(s.u.uRout, P.rout); gl.uniform1f(s.u.uA, P.a); gl.uniform1f(s.u.uPhc, P.ph);
  gl.uniform1f(s.u.uSkyGain, look.skyGain); gl.uniform1f(s.u.uDiskGain, look.diskGain); gl.uniform1f(s.u.uSkyW, SKY_W);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // ブルーム
  const d = R.progs.down, up = R.progs.up;
  gl.useProgram(d.p);
  let src = L.hdr;
  L.chain.forEach((t, i) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(d.u.uTex, 0);
    gl.uniform2f(d.u.uTexel, 1 / src.w, 1 / src.h); gl.uniform1f(d.u.uFirst, i === 0 ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    src = t;
  });
  gl.useProgram(up.p);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = L.chain.length - 1; i > 0; i--) {
    const from = L.chain[i], to = L.chain[i - 1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb); gl.viewport(0, 0, to.w, to.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, from.tex); gl.uniform1i(up.u.uTex, 0);
    gl.uniform2f(up.u.uTexel, 1 / from.w, 1 / from.h); gl.uniform2f(up.u.uOutRes, to.w, to.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.disable(gl.BLEND);
}

function composite(L, look) {
  const gl = R.gl, c = R.progs.comp;
  gl.useProgram(c.p); gl.bindVertexArray(R.vao);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L.hdr.tex); gl.uniform1i(c.u.uHdr, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, L.chain.length ? L.chain[0].tex : L.hdr.tex); gl.uniform1i(c.u.uBloom, 1);
  gl.uniform2f(c.u.uOutRes, gl.canvas.width, gl.canvas.height);
  gl.uniform1f(c.u.uExpo, look.expo); gl.uniform1f(c.u.uBloomK, look.bloom);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// geo テクスチャの 1 ピクセルを読む（確認用）
function readGeo(L, x, y) {
  const gl = R.gl, out = new Float32Array(4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, L.geo.fb);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, out);
  return Array.from(out);
}
