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
uniform sampler2D uSig;    // テレビの中で戻した信号 E'（横 4点／ドット、LINEAR＋ミップマップ）
uniform vec2 uPic;         // 絵の大きさ（ドット）
uniform vec3 uView;        // 画面のピクセル → 絵の座標: pic = (frag - xy) / z
uniform float uSplit;      // 仕切りの位置（画面のピクセル）。左が液晶
uniform float uH;          // キャンバスの高さ（ピクセル。gl_FragCoord の上下を返す）
uniform float uScan;       // 走査線 0/1
uniform float uInter;      // 480i 0/1
uniform float uMask;       // 0 なし 1 シャドウマスク 2 スロットマスク 3 アパーチャーグリル
uniform float uTriads;     // 1ドットあたりの光る点の組（推定）
uniform float uGamma;      // ブラウン管のガンマ（2.4、切ると 2.2 ＝ いまの画面と同じ）
uniform float uBloom;      // 光のにじみの強さ
uniform float uCurve;      // 画面のふくらみ 0/1
uniform float uNoise;      // アンテナ線のノイズ
uniform float uSeed;
out vec4 o;

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
vec3 sig(float x, float row){                 // 信号の1点（E'）
  vec3 c = textureLod(uSig, vec2(x / uPic.x, (row + 0.5) / uPic.y), 0.0).rgb;
  if (uNoise > 0.0) c += (hash(vec2(floor(x * 4.0), row)) - 0.5) * uNoise * 2.0;
  return clamp(c, 0.0, 1.0);
}
// 1行ぶんのビームの、横の光（光の量＝ガンマをかけたあと）。ビームの点は横にも少し広がる（ガウス）
vec3 lineLight(float x, float row){
  vec3 s = vec3(0.0); float ws = 0.0;
  for (int k = -3; k <= 3; k++){
    float dx = float(k) * 0.22;
    float w = exp(-0.5 * dx * dx / (0.30 * 0.30));
    s += pow(sig(x + dx, row), vec3(uGamma)) * w; ws += w;
  }
  return s / ws;
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
void main(){
  vec2 frag = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 p = (frag - uView.xy) / uView.z;       // 絵の座標（ドット）
  vec3 col;
  if (frag.x < uSplit){
    // 液晶: 1ドットをそのまま四角く
    if (any(lessThan(p, vec2(0.0))) || any(greaterThanEqual(p, uPic))) col = vec3(0.0);
    else col = textureLod(uOrig, (floor(p) + 0.5) / uPic, 0.0).rgb;
    o = vec4(col, 1.0); return;
  }
  // ブラウン管
  vec2 q = p / uPic * 2.0 - 1.0;
  float edge = 1.0;
  if (uCurve > 0.5){
    q *= vec2(1.0 + q.y * q.y * 0.031, 1.0 + q.x * q.x * 0.041);   // ふくらみ（Lottes の既定値）
    vec2 a = abs(q) - (1.0 - 0.04); edge = 1.0 - smoothstep(0.0, 0.012, length(max(a, 0.0)) - 0.04 + min(max(a.x, a.y), 0.0));
    p = (q * 0.5 + 0.5) * uPic;
  }
  if (any(lessThan(p, vec2(0.0))) || any(greaterThanEqual(p, uPic)) || edge <= 0.0){ o = vec4(0.0, 0.0, 0.0, 1.0); return; }

  vec3 light = vec3(0.0);
  if (uScan > 0.5){
    // 走査線: 1行は太さのあるガウスの帯。明るい行ほど太る（ビームの電流がふえると点が広がる。太り方は推定）
    float r0 = floor(p.y);
    for (int k = -2; k <= 2; k++){
      float row = r0 + float(k);
      if (row < 0.0 || row >= uPic.y) continue;
      vec3 c = lineLight(p.x, row);
      float lum = dot(c, vec3(0.30, 0.59, 0.11));
      float sg = mix(0.15, 0.28, sqrt(clamp(lum, 0.0, 1.0)));
      if (uInter > 0.5){
        // 480i: 2つのフィールドが半行ずれて交互に描く。目にはまざるので、帯が2倍細かく並ぶ
        for (int f = 0; f < 2; f++){
          float d = p.y - (row + 0.25 + 0.5 * float(f));
          light += c * 0.5 * exp(-0.5 * d * d / (sg * sg)) / (sg * 2.5066);
        }
      } else {
        float d = p.y - (row + 0.5);
        light += c * exp(-0.5 * d * d / (sg * sg)) / (sg * 2.5066);  // 帯の光の合計は行ごとに同じ（明るさは保つ）
      }
    }
    // 1行が画面の数ピクセルより細いと、すきまがモアレ（波もよう）になる。そのときは帯をならす（寄ると見える）
    float rowPx = uView.z * (uInter > 0.5 ? 0.5 : 1.0);
    float vis = smoothstep(2.5, 4.5, rowPx);
    if (vis < 1.0){
      vec3 even = lineLight(p.x, clamp(floor(p.y), 0.0, uPic.y - 1.0));
      light = mix(even, light, vis);
    }
  } else {
    light = lineLight(p.x, clamp(floor(p.y), 0.0, uPic.y - 1.0));
  }
  if (uMask > 0.5){
    // 光る点。画面のピクセルより細かいとモアレになるので、1組が 4〜8 ピクセルのあいだで薄めていく
    float cellPx = uView.z / uTriads;
    float vis = smoothstep(4.0, 8.0, cellPx);
    vec3 m = mask(p * uTriads);
    // 本物の光る点は、すきまのぶんだけ強く光る。いまの画面はそこまで明るく光れないので、強める倍率はひかえめ（寄ると少し暗い）
    light *= mix(vec3(1.0), m * 2.4 + 0.06, vis);
  }
  if (uBloom > 0.0){
    // 光のにじみ（ガラスの中で光が散る）: ぼかした絵を少し足す。ミップマップの粗い段で代用
    vec3 b = textureLod(uSig, p / uPic, 4.0).rgb;
    light += pow(b, vec3(uGamma)) * uBloom;
  }
  // 明るすぎる所はなだらかに頭打ち（光る点が光りきる。いまの画面の白より明るくは出せない）
  light = mix(light, 0.8 + 0.2 * (1.0 - exp(-(light - 0.8) / 0.2)), step(0.8, light));
  col = pow(clamp(light, 0.0, 1.0), vec3(1.0 / 2.2)) * edge;    // いまの画面（ガンマ約2.2）へ
  o = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
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
  const U = {}; ['uOrig', 'uSig', 'uPic', 'uView', 'uSplit', 'uH', 'uScan', 'uInter', 'uMask', 'uTriads', 'uGamma', 'uBloom', 'uCurve', 'uNoise', 'uSeed']
    .forEach(n => U[n] = gl.getUniformLocation(pr, n));
  const tOrig = gl.createTexture(), tSig = gl.createTexture();
  gl.uniform1i(U.uOrig, 0); gl.uniform1i(U.uSig, 1);
  let pw = 1, ph = 1;
  return {
    gl,
    setPicture(pic) {
      pw = pic.w; ph = pic.h;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tOrig);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, pic.w, pic.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pic.data.buffer, pic.data.byteOffset, pic.data.length));
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    },
    setSignal(data, w, h) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tSig);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data.buffer, data.byteOffset, data.length));
      gl.generateMipmap(gl.TEXTURE_2D);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    },
    // v: { view:[x,y,z], split, scan, inter, mask, triads, gamma, bloom, curve, noise }（画面のピクセル＝デバイスのピクセル）
    draw(v) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uPic, pw, ph); gl.uniform3f(U.uView, v.view[0], v.view[1], v.view[2]);
      gl.uniform1f(U.uSplit, v.split); gl.uniform1f(U.uH, canvas.height);
      gl.uniform1f(U.uScan, v.scan); gl.uniform1f(U.uInter, v.inter); gl.uniform1f(U.uMask, v.mask); gl.uniform1f(U.uTriads, v.triads);
      gl.uniform1f(U.uGamma, v.gamma); gl.uniform1f(U.uBloom, v.bloom); gl.uniform1f(U.uCurve, v.curve);
      gl.uniform1f(U.uNoise, v.noise); gl.uniform1f(U.uSeed, v.seed || 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  };
};
})();
