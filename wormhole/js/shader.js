// シェーダーの文。VS は全部共通。FS_SCENE が画素ごとの光の計算（HDR）、DOWN・UP がにじみ、COMP が仕上げ。
'use strict';

const VS = `#version 300 es
in vec2 aPos; out vec2 vP;
void main(){ vP = aPos; gl_Position = vec4(aPos, 0., 1.); }`;

const FS_SCENE = `#version 300 es
precision highp float; precision highp sampler2D; precision highp sampler3D;
in vec2 vP; out vec4 oC;
uniform sampler2D uLut, uSkyA, uSkyB;
uniform sampler3D uNoise;
uniform vec2 uHalf, uPx, uJit;
uniform float uWt;
uniform mat3 uView, uOrbit;        // uView: 列 = 右・上・前（局所）。uOrbit: 局所 → 世界
uniform float uPsiC, uK0, uK1, uFlip, uSkyW, uPano, uRc, uCamS, uStar, uFarFill;
uniform int uN, uMode;
uniform vec4 uBody[6];             // 局所の中心と半径。0〜2 が もとの宇宙、3〜5 が向こうの宇宙
uniform vec3 uSun[2], uRingN;      // 局所
uniform vec3 uRingAxisW;
uniform vec2 uRingR, uSunGain;
uniform int uKind[6];
const float PI = 3.14159265358979, TAU = 6.28318530717959, DELTA_MIN = 1e-5;

float hash1(vec3 p){ p = fract(p * vec3(127.1, 311.7, 74.7)); p += dot(p, p.yzx + 19.19); return fract((p.x + p.y) * p.z); }
vec3  hash3v(vec3 p){ return vec3(hash1(p), hash1(p + 17.3), hash1(p + 41.7)); }
float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return textureLod(uNoise, (i + f + .5) / 32., 0.).r; }   // Windows の GPU ドライバーは数式のノイズの展開でコンパイルが止まるので、3D テクスチャから読む
float fbm(vec3 p, int o){ float s = 0., a = .5; for (int i = 0; i < o; i++) { s += a * vnoise(p); p = p * 2.03 + 5.1; a *= .5; } return s; }

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
  return mix(base * (d.x > 0. ? 1.5 : 1.), ink, line * .9);
}

// 細かい星。方向の格子ごとに1つ。方向の空間で丸いので、レンズで引きのばされた所は弧になる
vec3 starLayer(vec3 d, float pix, float scale, float rad0){
  vec3 p = d * scale, id = floor(p), h = hash3v(id);
  if (h.x > .3) return vec3(0.);
  vec3 q = id + .2 + .6 * hash3v(id + 3.1);
  float dist = length(p - q) / scale;
  float m = pow(hash1(id + 9.7), 7.) * 46. + .16;   // 暗い星を多く、明るい星はまれに（一様だと塩をまいたように見える）
  float r = max(rad0, pix * .75);
  float e = rad0 * rad0 / (r * r);   // 1画素より小さい星は、そのぶん暗く（面の明るさ一定）
  float g = exp(-dist * dist / (r * r * .5));
  float T = hash1(id + 5.3);
  vec3 col = mix(vec3(1., .72, .48), vec3(.68, .8, 1.), T);
  return col * g * e * m;
}

vec3 skyCol(vec3 fd, float side, float pix){
  vec3 w = uOrbit * fd;
  vec2 uv = vec2(atan(w.y, w.x) / TAU + .5, acos(clamp(w.z, -1., 1.)) / PI);
  float lod = clamp(log2(pix * uSkyW / TAU), 0., 10.);   // 輪が画素より細い所は空の平均の色へ（しま模様のちらつきを防ぐ）
  vec3 c = side > .5 ? textureLod(uSkyB, uv, lod).rgb : textureLod(uSkyA, uv, lod).rgb;
  c = c * c * 1.5;   // 暗い所は沈めて、明るい所を残す（コントラスト）
  if (uStar > .5) c += starLayer(w, pix, 90., 6.e-4) + starLayer(w + .37, pix, 210., 3.5e-4) * .7 * (.12 + 1.5 * smoothstep(.34, .72, vnoise(w * 4. + 3.)));   // 細かい星は雲のようにムラをつける
  vec3 sun = uSun[side > .5 ? 1 : 0];
  float a = acos(clamp(dot(fd, sun), -1., 1.));
  float r = max(.012, pix);
  vec3 sc = side > .5 ? vec3(1., .86, .7) : vec3(1., .95, .88);
  float k0 = .012 / r, k1 = min(1., .03 / pix);   // 穴のふちでは像が半径の向きにだけ圧縮される（円周の向きには圧縮されない）ので、画素が太陽を含む割合は幅の比 1 乗
  c += sc * (70. * k0 * (1. - smoothstep(r * .85, r * 1.15, a)) + 2.4 * k1 * exp(-a * a / max(.0009, pix * pix))) * uSunGain[side > .5 ? 1 : 0];
  return c;
}

vec3 albedo(int k, vec3 n){
  if (k == 0) {
    float lat = dot(n, uRingAxisW) + .018 * (fbm(n * 7. + 2., 4) - .5);
    float b = .5 + .5 * sin(lat * 26. + 1.3 * sin(lat * 7.));
    return mix(vec3(.74, .58, .38), vec3(.95, .85, .66), b) * (.82 + .3 * fbm(n * vec3(4., 4., 26.), 3));
  }
  if (k == 1) {
    float land = fbm(n * 2.7 + 7., 5), cl = fbm(n * vec3(4.2, 4.2, 6.5) + 3., 5);
    vec3 c = land > .52 ? mix(vec3(.2, .3, .13), vec3(.5, .42, .28), smoothstep(.52, .68, land)) : mix(vec3(.02, .09, .26), vec3(.04, .2, .42), land * 1.8);
    return mix(c, vec3(.96), smoothstep(.5, .72, cl));
  }
  if (k == 2) { float g = fbm(n * 9., 5); return vec3(.4 + .34 * g) * vec3(1., .96, .9); }
  float lat = n.z + .07 * (fbm(n * vec3(5., 5., 2.), 4) - .5);
  float b = .5 + .5 * sin(lat * 19. + 2. * sin(lat * 5.));
  return mix(vec3(.16, .36, .66), vec3(.76, .9, .98), b) * (.8 + .36 * fbm(n * vec3(3., 3., 30.), 3));
}

float sphT(vec3 o, vec3 d, vec3 c, float R){
  vec3 oc = o - c; float B = dot(oc, d), C = dot(oc, oc) - R * R, D = B * B - C;
  if (D < 0.) return -1.;
  return -B - sqrt(D);
}

float ringAlpha(float x){
  float a = smoothstep(0., .04, x) * smoothstep(1., .94, x);
  a *= .72 + .14 * sin(x * 37. + 2. * sin(x * 11.)) + .14 * sin(x * 131. + 1.7);
  a *= 1. - .92 * smoothstep(.02, 0., abs(x - .62) - .03);   // すきま
  a *= .7 + .55 * vnoise(vec3(x * 90., 2.5, 9.));
  return clamp(a * .85, 0., 1.);
}

// 直線 o + t d（t0〜t1）の上の天体。acc に足し、T（透過）を減らす。不透明に当たったら true
bool bodiesOnLine(vec3 o, vec3 d, float t0, float t1, int first, vec3 L, float pix, inout vec3 acc, inout float T){
  float tBody = 1e30; int hit = -1;
  for (int i = first; i < first + 3; i++) {
    float t = sphT(o, d, uBody[i].xyz, uBody[i].w);
    if (t > t0 && t < t1 && t < tBody) { tBody = t; hit = i; }
  }
  if (first == 3 && uKind[3] == 3) {   // 大きな惑星の大気のふち（逆光で光る。作りもの）
    vec3 oc = uBody[3].xyz - o;
    float h = length(oc - d * clamp(dot(oc, d), t0, t1)) / uBody[3].w - 1.;
    float wd = max(.02, pix * 3.);   // 輪の中のように 1 画素より細くなる所は、広げて暗く（ちらつかないように）
    if (h > 0. && h < .15) acc += T * vec3(.42, .68, 1.) * exp(-h / wd) * (.02 / wd) * (.03 + 2.2 * pow(max(dot(d, L), 0.), 30.)) * (1. - uFarFill);
  }
  if (first == 0) {   // 輪
    float dn = dot(d, uRingN);
    if (abs(dn) > 1e-4) {
      float t = dot(uBody[0].xyz - o, uRingN) / dn;
      if (t > t0 && t < min(t1, tBody)) {
        vec3 p = o + t * d, rel = p - uBody[0].xyz;
        float rr = length(rel), x = (rr - uRingR.x) / (uRingR.y - uRingR.x);
        if (x > 0. && x < 1.) {
          float a = ringAlpha(x);
          float st = sphT(p, L, uBody[0].xyz, uBody[0].w);
          float sh = st > 0. ? .04 : 1.;
          float lit = (.28 + .72 * abs(dot(L, uRingN)));
          acc += T * a * vec3(.8, .68, .5) * lit * sh * .72;
          T *= 1. - a;
        }
      }
    }
  }
  if (hit < 0) return false;
  vec3 p = o + tBody * d, n = normalize(p - uBody[hit].xyz);
  int k = uKind[hit];
  if (k == 4) {   // 太陽: 周辺減光 I(μ) = 1 − 0.6(1 − μ)。粒状の模様と黒点は作りもの。色は見やすくした
    float mu = max(dot(n, -d), 0.);
    vec3 w = uOrbit * n;
    float gran = .42 + 1.25 * fbm(w * 80., 5) + .22 * fbm(w * 12., 4);
    float spot = smoothstep(.70, .76, fbm(w * 6.5 + 12., 4));
    vec3 tint = mix(vec3(2.3, .62, .08), vec3(2.6, 1.15, .3), smoothstep(.0, .75, mu));   // ふちほど赤い
    acc += T * tint * (1. - .6 * (1. - mu)) * gran * (1. - .8 * spot);
    return true;
  }
  float diff = max(dot(n, L), 0.);
  diff = pow(diff, .8);
  float shade = 1.;
  if (first == 0 && hit == 0) {   // 輪の影
    float dn = dot(L, uRingN);
    if (abs(dn) > 1e-3) {
      float s = dot(uBody[0].xyz - p, uRingN) / dn;
      if (s > 0.) { float x = (length(p + s * L - uBody[0].xyz) - uRingR.x) / (uRingR.y - uRingR.x); if (x > 0. && x < 1.) shade = 1. - .75 * ringAlpha(x); }
    }
  }
  vec3 col = albedo(k, uOrbit * n) * (diff * shade * 1.15 + .006 + (first == 3 ? uFarFill * .4 : 0.));   // uFarFill: 太陽が惑星に隠れている間、露出を上げた分の明るさ（穴の奥の惑星が黒い穴に見えないように）
  float fres = pow(1. - max(dot(n, -d), 0.), 3.);
  if (k == 1) col += vec3(.25, .5, 1.) * fres * (diff * .9 + .02) * .9;
  if (k == 3) col += vec3(.45, .7, 1.) * fres * (diff * .9 + .02 + 1.4 * pow(max(dot(d, L), 0.), 30.)) * .7;
  if (k == 0) col += vec3(.9, .7, .45) * fres * diff * .25;
  acc += T * col;
  return true;
}

vec3 shade(vec2 pos){
  vec3 d;
  if (uPano > 0.) {
    float az = -pos.x * PI, el = pos.y * PI * uPano;
    d = vec3(cos(el) * cos(az), cos(el) * sin(az), sin(el));
  } else d = normalize(uView * vec3(pos * uHalf, 1.));
  float tl = length(d.yz), psi = atan(tl, d.x), seg, phi = lutPhi(psi, seg);
  vec2 t2 = tl > 1e-9 ? d.yz / tl : vec2(1., 0.);
  vec3 fd = vec3(cos(phi), sin(phi) * t2);
  float side = (seg < .5) != (uFlip > .5) ? 1. : 0.;   // 1 = 向こうの宇宙（ℓ > 0）
  float pix = clamp(max(length(dFdx(fd)), length(dFdy(fd))), 1e-4, 1.);
  if (uMode == 1) return gridCol(fd, pix, side);

  vec3 acc = vec3(0.); float T = 1.;
  // 行き: カメラ → のどへ向かう、ほぼまっすぐの直線（のどから離れた所の天体のため）
  float b = uRc * tl;
  bool outward = uCamS * d.x > 0.;
  float tEnter = sqrt(max(uRc * uRc - b * b, 0.));
  int camFirst = uCamS > 0. ? 3 : 0;
  vec3 camL = uSun[uCamS > 0. ? 1 : 0];
  if (!outward) {
    vec3 wo = vec3(uRc, 0., 0.), wd = vec3(uCamS * d.x, d.yz);
    if (bodiesOnLine(wo, wd, .001, tEnter, camFirst, camL, 0., acc, T)) return acc;
  }
  // 帰り: のどから出たあとの直線 P(t) = t u + b v
  vec3 u = vec3(cos(phi), sin(phi) * t2), v = vec3(sin(phi), -cos(phi) * t2);
  int endFirst = side > .5 ? 3 : 0;
  if (bodiesOnLine(b * v, u, outward ? tEnter : 0., 1e6, endFirst, uSun[side > .5 ? 1 : 0], pix, acc, T)) return acc;
  return acc + T * skyCol(fd, side, pix);
}

void main(){   // 1 回に 1 点。ふちのギザギザは、ずらして何回か足す（render.js）
  oC = vec4(min(shade(vP + uPx * uJit), vec3(60.)) * uWt, 1.);
}`;

const FS_DOWN = `#version 300 es
precision highp float; in vec2 vP; out vec4 oC;
uniform sampler2D uT; uniform vec2 uTexel; uniform float uThresh;
void main(){ vec2 uv = vP * .5 + .5;
  vec3 c = (texture(uT, uv + uTexel * vec2(-1,-1)).rgb + texture(uT, uv + uTexel * vec2(1,-1)).rgb + texture(uT, uv + uTexel * vec2(-1,1)).rgb + texture(uT, uv + uTexel * vec2(1,1)).rgb) * .25;
  if (uThresh > 0.) c = max(c - uThresh, 0.);
  oC = vec4(c, 1.); }`;

const FS_UP = `#version 300 es
precision highp float; in vec2 vP; out vec4 oC;
uniform sampler2D uT; uniform vec2 uTexel;
void main(){ vec2 uv = vP * .5 + .5; vec3 c = vec3(0.);
  c += texture(uT, uv + uTexel * vec2(-1, 0)).rgb + texture(uT, uv + uTexel * vec2(1, 0)).rgb + texture(uT, uv + uTexel * vec2(0,-1)).rgb + texture(uT, uv + uTexel * vec2(0, 1)).rgb;
  c += texture(uT, uv).rgb * 2.; oC = vec4(c / 6., 1.); }`;

const FS_COMP = `#version 300 es
precision highp float; in vec2 vP; out vec4 oC;
uniform sampler2D uScene, uBloom, uStreak; uniform float uBloomGain, uStreakGain, uVig; uniform vec2 uTexel;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
void main(){ vec2 uv = vP * .5 + .5;
  vec3 c = texture(uScene, uv).rgb;
  if (uBloomGain > 0.) {
    c += texture(uBloom, uv).rgb * uBloomGain;
    vec3 s = vec3(0.);
    for (int i = -14; i <= 14; i++) { float f = float(i), w = exp(-abs(f) / 5.); s += texture(uStreak, uv + vec2(f * uTexel.x * 9., 0.)).rgb * w; }
    c += s * vec3(.45, .62, 1.) * uStreakGain / 10.;
  }
  if (uVig > 0.) c *= 1. - uVig * smoothstep(.45, 1.35, length(vP * vec2(1., .85)));
  oC = vec4(pow(aces(c * 1.05), vec3(1. / 2.2)), 1.); }`;
