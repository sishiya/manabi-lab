// ブラウン管のドット絵 — 画面を描く（WebGL2・1パス）
// 走査線・横のぼかし・ブルーム・マスク・ふくらみの考え方は Timothy Lottes の crt-lottes（パブリックドメイン）を土台にして、
// ここで書き直した（コードは写していない）。明るさでビームが太ること・480i・3種のマスクは足したもの。
'use strict';
(function () {
const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D uOrig;   // もとのドット絵（NEAREST）
uniform sampler2D uSig;    // テレビの中で戻した信号 E'（横は絵の幅いっぱい、uSigW 点。LINEAR）
uniform float uSigW;       // 信号のテクスチャの横の点の数
uniform sampler2D uGlow;   // 光の量をガウスでぼかした絵（光のにじみ用。16 ビットの小数）
uniform vec2 uPic;         // 絵の大きさ（ドット）
uniform vec3 uView;        // 画面のピクセル → 絵の座標: pic = (frag - xy) / (z×par, z)
uniform float uPar;        // 1ドットの横÷たて（行の高さに対して。横 256・240本なら 8:7。正方形なら 1）
uniform float uRowH;       // 1行の高さ（240本のとき 1、480本のとき 0.5。長さはぜんぶ 240本の1行を 1 として数える）
uniform float uDotW;       // 横のドット数÷256（ドットの速さの倍率。横の長さをドットの数で数えるのに使う）
uniform float uSplit;      // 仕切りの位置（画面のピクセル）。左が液晶
uniform float uH;          // キャンバスの高さ（ピクセル。gl_FragCoord の上下を返す）
uniform float uScan;       // 走査線 0/1
uniform float uInter;      // 480i 0/1
uniform float uMask;       // 0 なし 1 シャドウマスク 2 スロットマスク 3 アパーチャーグリル
uniform float uTriads;     // 240本の1行の高さあたりの光る点の組（推定。画面の上の長さで数える）
uniform float uGamma;      // ブラウン管のガンマ（2.4、切ると 2.2 ＝ いまの画面と同じ）
uniform float uBloom;      // 光のにじみの強さ
uniform float uCurve;      // 画面のふくらみ 0/1
uniform float uNoise;      // アンテナ線のノイズ
uniform float uSeed;
out vec4 o;

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
vec3 sig(float x, float row){                 // 信号の1点（E'）
  vec3 c = textureLod(uSig, vec2(x / uPic.x, (row + 0.5) / uPic.y), 0.0).rgb;
  if (uNoise > 0.0) c += (hash(vec2(floor(x / uPic.x * uSigW), row)) - 0.5) * uNoise * 2.0;
  return clamp(c, 0.0, 1.0);
}
// 1行ぶんのビームの、横の光（光の量＝ガンマをかけたあと）。ビームの点は横にも広がり（ガウス）、
// 明るいところほど点が大きくなって、まわりの暗いところへにじみ出す（たての走査線の太り方と同じ考え。広がり方は推定。
// 実機の写真でも、明るいハイライトがまわりへにじんでなじむ）。光の合計は保つ（重みを正規化しない）
float erfA(float x){   // 誤差関数（Abramowitz & Stegun 7.1.26。誤差 1.5e-7）
  float t = 1.0 / (1.0 + 0.3275911 * x);
  return 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
}
vec3 lineLight(float x, float row){
  vec3 s = vec3(0.0);
  // 広がりは画面の上の長さで決まる（横 256 ドットの1ドットを単位にした値）。ドットが細かい絵では、ドットの数でかぞえて uDotW 倍
  for (int k = -4; k <= 4; k++){
    float dx = float(k) * 0.3;                  // 256 ドットの1ドットを単位
    vec3 c = pow(sig(x + dx * uDotW, row), vec3(uGamma));
    float sg = mix(0.24, 0.55, sqrt(clamp(dot(c, vec3(0.30, 0.59, 0.11)), 0.0, 1.0)));
    // 9点（±1.2）では広いガウスのすそが少し欠けるので、欠けたぶん（erf で計算）で割って光の合計を保つ
    s += c * exp(-0.5 * dx * dx / (sg * sg)) * (0.3 / (sg * 2.5066)) / erfA(1.35 / (sg * 1.4142));
  }
  return s;
}
// 光る点のならび（u は光る点の組の単位）。かえすのは赤緑青それぞれの通し方
vec3 mask(vec2 u){
  vec3 m = vec3(0.0);
  if (uMask > 2.5){                           // アパーチャーグリル: たてじま
    float f = fract(u.x) * 3.0; float i = floor(f); float e = abs(fract(f) - 0.5);
    float lit = smoothstep(0.42, 0.34, e);
    m[int(i)] = lit;
  } else if (uMask > 1.5){                    // スロットマスク: たてじまを短く切って、となりの列と半分ずらす
    float col = floor(u.x);
    float f = fract(u.x) * 3.0; float i = floor(f); float e = abs(fract(f) - 0.5);
    float v = fract(u.y * 0.75 + mod(col, 2.0) * 0.5);
    float lit = smoothstep(0.42, 0.32, e) * smoothstep(0.0, 0.08, v) * smoothstep(1.0, 0.92, v);
    m[int(i)] = lit;
  } else {                                    // シャドウマスク: 丸い点を六角形（三角形）にならべる。同じ色どうしの間＝1組
    float dx = 0.57735, dy = 0.5;             // となりの点まで 1/√3 組、行の間 1/2 組
    float j = floor(u.y / dy);
    float off = mod(j, 2.0) * 0.5 * dx;
    float i = floor((u.x - off) / dx);
    vec2 c = vec2(off + (i + 0.5) * dx, (j + 0.5) * dy);
    float d = length(u - c) / dx;
    int ch = int(mod(i - floor(j * 0.5) - j + 300.0, 3.0));
    m[ch] = smoothstep(0.50, 0.40, d);
  }
  return m;
}
// 絵の座標 p（ふくらみの前）のブラウン管の光（光の量。ガンマをかけたあと）。edge は画面のふちの丸み
vec3 crtLight(vec2 p, vec2 frag, out float edge){
  edge = 1.0;
  if (uCurve > 0.5){
    vec2 q = p / uPic * 2.0 - 1.0;
    q *= vec2(1.0 + q.y * q.y * 0.031, 1.0 + q.x * q.x * 0.041);   // ふくらみ（Lottes の既定値）
    vec2 a = abs(q) - (1.0 - 0.04); edge = 1.0 - smoothstep(0.0, 0.012, length(max(a, 0.0)) - 0.04 + min(max(a.x, a.y), 0.0));
    p = (q * 0.5 + 0.5) * uPic;
  }
  if (any(lessThan(p, vec2(0.0))) || any(greaterThanEqual(p, uPic)) || edge <= 0.0){ edge = 0.0; return vec3(0.0); }

  vec3 light = vec3(0.0);
  if (uScan > 0.5){
    // 走査線: 1行は太さのあるガウスの帯。明るい行ほど太る（ビームの電流がふえると点が広がる。太り方は推定）
    float r0 = floor(p.y);
    for (int k = -3; k <= 3; k++){
      float row = r0 + float(k);
      if (row < 0.0 || row >= uPic.y) continue;
      vec3 c = lineLight(p.x, row);
      float lum = dot(c, vec3(0.30, 0.59, 0.11));
      // ビームの太さは画面の上の長さ（240本の1行を単位）。480本の絵では1行が半分なので、行の数でかぞえると2倍
      float sg = mix(0.15, 0.40, sqrt(clamp(lum, 0.0, 1.0))) / uRowH;
      if (uInter > 0.5){
        // 240本の絵を 480i で映したら: 同じ行を、2つのフィールドが半行ずつずらして描く（行は2回ずつ）。目にはまざるので帯が2倍細かく並ぶ
        for (int f = 0; f < 2; f++){
          float d = p.y - (row + 0.25 + 0.5 * float(f));
          light += c * 0.5 * exp(-0.5 * d * d / (sg * sg)) / (sg * 2.5066);
        }
      } else {
        float d = p.y - (row + 0.5);
        light += c * exp(-0.5 * d * d / (sg * sg)) / (sg * 2.5066);  // 帯の光の合計は行ごとに同じ（明るさは保つ）
      }
    }
    // 1行が画面のピクセルにくらべて細すぎると、すきまがモアレ（波もよう）になる。そのときは帯をならす（寄ると見える）
    // （1ピクセルに3点とって平均しているので、1行 2ピクセルくらいまでは描ける）
    float rowPx = uView.z * (uInter > 0.5 ? 0.5 : 1.0);
    float vis = smoothstep(1.5, 2.3, rowPx);
    if (vis < 1.0){
      vec3 even = lineLight(p.x, clamp(floor(p.y), 0.0, uPic.y - 1.0));
      light = mix(even, light, vis);
    }
  } else {
    light = lineLight(p.x, clamp(floor(p.y), 0.0, uPic.y - 1.0));
  }
  if (uBloom > 0.0){
    // 光のにじみ（前のガラスの中で光が散る）: 光の量をガウスでぼかした絵（JS で信号を作るたびに計算。近いにじみと遠いにじみの2つ）を、
    // 光の合計を保つようにまぜる（にじんだぶん、もとの所は暗くなる）。光る点と頭打ちの前にまぜるので、一様な面の明るさは変わらない
    vec3 glow = textureLod(uGlow, p / uPic, 0.0).rgb;
    glow = pow(max(glow, 0.0), vec3(uGamma / 2.4));   // ぼかした絵はガンマ 2.4 の光の量で作ってある
    light = mix(light, glow, uBloom);
  }
  if (uMask > 0.5){
    float cellPx = uView.z / uRowH / uTriads;   // 光る点の1組が画面の何ピクセルか
    float mean = uMask > 2.5 ? 0.26 : (uMask > 1.5 ? 0.22 : 0.25);
    vec3 m; float vis;
    if (cellPx < 3.5){
      // 本物の大きさでは画面のピクセルより細かいとき、光る点を画面の3ピクセルに合わせて描く（近似。本物より粗い。何倍かは main.js が HUD に出す。
      // 消してしまうより、実機の写真の見え方に近い。2026-10-24 に案 A・B・C を見くらべて決めた）。
      // たてじま（モニター）はそのまま、丸い点・細長い穴は、1列ごとに半分ずらした短いしまで代わりにする
      vec2 f = floor(frag);
      int ch = int(mod(f.x, 3.0));
      float cut = 1.0;
      if (uMask < 2.5) cut = mod(f.y + floor(f.x / 3.0) * 2.0, 4.0) < 0.5 ? 0.0 : 1.0;
      m = vec3(0.0); m[ch] = cut;
      mean = uMask < 2.5 ? 0.25 : 1.0 / 3.0;
      vis = 1.0;
    } else {
      // 光る点。1ピクセルの中を横4点・たて2点とって平均する（細かい大きさでもモアレになりにくい）。
      vis = 1.0;
      vec2 u = vec2(p.x * uPar, p.y) * uRowH * uTriads;   // 光る点は画面に固定（ドットの形・行の数によらない）
      float fw = uTriads * uRowH / uView.z;        // 1ピクセルの幅（光る点の組の単位）
      m = vec3(0.0);
      for (int a = 0; a < 4; a++) for (int b = 0; b < 2; b++)
        m += mask(u + vec2((float(a) - 1.5) * 0.25, (float(b) - 0.5) * 0.5) * fw);
      m /= 8.0;
    }
    // 本物の光る点は、すきまのぶんだけ強く光る。いまの画面はそこまで明るく光れないので、
    // 平均の明るさを保つように強弱をつける（明るい所は光りきって頭打ちになる）
    if (vis > 0.0) light *= mix(vec3(1.0), 1.0 + 0.75 * (m / mean - 1.0), vis);
  }
  // 明るすぎる所はなだらかに頭打ち（光る点が光りきる。いまの画面の白より明るくは出せない）
  return mix(light, 0.8 + 0.2 * (1.0 - exp(-(light - 0.8) / 0.2)), step(0.8, light));
}
void main(){
  vec2 frag = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 p = (frag - uView.xy) / (uView.z * vec2(uPar, 1.0));   // 絵の座標（ドット）
  if (frag.x < uSplit){
    // 液晶: 1ドットをそのまま四角く
    vec3 col = vec3(0.0);
    if (!(any(lessThan(p, vec2(0.0))) || any(greaterThanEqual(p, uPic)))) col = textureLod(uOrig, (floor(p) + 0.5) / uPic, 0.0).rgb;
    o = vec4(col, 1.0); return;
  }
  // ブラウン管。1行が小さいときは、1ピクセルの中のたてに3点とって平均する（走査線のモアレを減らす）
  vec3 light; float edge;
  if (uView.z < 6.0){
    float e1, e2, e3;
    light = (crtLight(p + vec2(0.0, -0.333 / uView.z), frag, e1) + crtLight(p, frag, e2) + crtLight(p + vec2(0.0, 0.333 / uView.z), frag, e3)) / 3.0;
    edge = (e1 + e2 + e3) / 3.0;
  } else {
    light = crtLight(p, frag, edge);
  }
  o = vec4(pow(clamp(light, 0.0, 1.0), vec3(1.0 / 2.2)) * edge, 1.0);   // いまの画面（ガンマ約2.2）へ
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

// 光のにじみの絵: 信号 E'（RGBA8）を光の量（ガンマ 2.4）にして、画面の上で約2行ぶんの四角に平均してから、
// ガウスで2通りにぼかしてまぜる（σ＝2.5 行と 9 行、0.6:0.4。ぼかしの大きさは推定）。
// 前はミップマップの粗い段をそのまま使っていて、黒い地の明るい字のまわりに四角い板が見えた（2026-10-25 retro-8bit で見つかった）
const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) LIN[i] = Math.pow(i / 255, 2.4);
function makeGlow(data, w, h, physW, physH) {
  const gw = Math.max(4, Math.round(physW / 2)), gh = Math.max(4, Math.round(physH / 2));
  const base = new Float32Array(gw * gh * 3);
  for (let gy = 0; gy < gh; gy++) {
    const y0 = Math.floor(gy * h / gh), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * h / gh));
    for (let gx = 0; gx < gw; gx++) {
      const x0 = Math.floor(gx * w / gw), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * w / gw));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; r += LIN[data[i]]; g += LIN[data[i + 1]]; b += LIN[data[i + 2]]; n++; }
      const o = (gy * gw + gx) * 3; base[o] = r / n; base[o + 1] = g / n; base[o + 2] = b / n;
    }
  }
  const blur = (src, sigma) => {   // たてと横に分けたガウス（はしは、はしの値をのばす）
    const R = Math.ceil(sigma * 3), k = [];
    let ks = 0; for (let i = -R; i <= R; i++) { const v = Math.exp(-0.5 * i * i / (sigma * sigma)); k.push(v); ks += v; }
    for (let i = 0; i < k.length; i++) k[i] /= ks;
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) for (let c = 0; c < 3; c++) {
      let v = 0; for (let i = -R; i <= R; i++) v += k[i + R] * src[(y * gw + Math.min(gw - 1, Math.max(0, x + i))) * 3 + c];
      tmp[(y * gw + x) * 3 + c] = v;
    }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) for (let c = 0; c < 3; c++) {
      let v = 0; for (let i = -R; i <= R; i++) v += k[i + R] * tmp[(Math.min(gh - 1, Math.max(0, y + i)) * gw + x) * 3 + c];
      out[(y * gw + x) * 3 + c] = v;
    }
    return out;
  };
  const near = blur(base, 2.5 / 2), far = blur(base, 9 / 2);   // 1点＝2行ぶん
  const f = new Float32Array(gw * gh * 4);
  for (let i = 0, j = 0; i < gw * gh; i++, j += 3) { f[i * 4] = near[j] * 0.6 + far[j] * 0.4; f[i * 4 + 1] = near[j + 1] * 0.6 + far[j + 1] * 0.4; f[i * 4 + 2] = near[j + 2] * 0.6 + far[j + 2] * 0.4; f[i * 4 + 3] = 1; }
  return { f, gw, gh };
}

window.CRT_GL = function (canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const pr = gl.createProgram();
  gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const la = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ['uOrig', 'uSig', 'uSigW', 'uGlow', 'uRowH', 'uDotW', 'uPic', 'uView', 'uSplit', 'uH', 'uScan', 'uInter', 'uMask', 'uTriads', 'uPar', 'uGamma', 'uBloom', 'uCurve', 'uNoise', 'uSeed']
    .forEach(n => U[n] = gl.getUniformLocation(pr, n));
  const tOrig = gl.createTexture(), tSig = gl.createTexture(), tGlow = gl.createTexture();
  gl.uniform1i(U.uOrig, 0); gl.uniform1i(U.uSig, 1); gl.uniform1i(U.uGlow, 2);
  let pw = 1, ph = 1, sigW = 1024;
  return {
    gl,
    setPicture(pic) {
      pw = pic.w; ph = pic.h;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tOrig);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, pic.w, pic.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pic.data.buffer, pic.data.byteOffset, pic.data.length));
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    },
    // physW・physH: 絵の画面の上の大きさ（240本の1行の高さを1とした長さ）。にじみを丸くするのに使う
    setSignal(data, w, h, physW, physH) {
      sigW = w;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tSig);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data.buffer, data.byteOffset, data.length));
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      // 光のにじみ用: 光の量をぼかした絵（RGBA16F。WebGL2 ではそのままなめらかに読める）
      const gwd = makeGlow(data, w, h, physW || w / 4, physH || h);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tGlow);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gwd.gw, gwd.gh, 0, gl.RGBA, gl.FLOAT, gwd.f);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    },
    // v: { view:[x,y,z], split, scan, inter, mask, triads, gamma, bloom, curve, noise }（画面のピクセル＝デバイスのピクセル）
    draw(v) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uPic, pw, ph); gl.uniform3f(U.uView, v.view[0], v.view[1], v.view[2]);
      gl.uniform1f(U.uSplit, v.split); gl.uniform1f(U.uH, canvas.height);
      gl.uniform1f(U.uScan, v.scan); gl.uniform1f(U.uInter, v.inter); gl.uniform1f(U.uMask, v.mask); gl.uniform1f(U.uTriads, v.triads); gl.uniform1f(U.uPar, v.par || 1); gl.uniform1f(U.uRowH, v.rowH || 1); gl.uniform1f(U.uDotW, v.dotW || 1); gl.uniform1f(U.uSigW, sigW);
      gl.uniform1f(U.uGamma, v.gamma); gl.uniform1f(U.uBloom, v.bloom); gl.uniform1f(U.uCurve, v.curve);
      gl.uniform1f(U.uNoise, v.noise); gl.uniform1f(U.uSeed, v.seed || 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  };
};
})();
