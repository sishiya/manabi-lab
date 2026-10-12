// shaders.js — all GLSL. Scene passes (uMode):
//   0 VIS  colour, lit (HDR)            1 UV   near-UV reflectance × UV light
//   2 THERM surface temperature / 60    3 ECHO distance / 40 (r) + echo strength (g)
//   4 NIR  near-infrared reflectance × (sun + camera IR light)
//   5 POL  degree of linear polarisation of reflected / sky light
// Composites: COMP_FS (perspective views), CUBE_FS (panoramic compound eyes from a cube map).
'use strict';

const SH = {};

SH.SCENE_VS = `
attribute vec3 aCol; attribute vec4 aP; attribute vec3 aA; attribute vec3 aX;
varying vec3 vCol; varying vec4 vP; varying vec3 vA; varying vec3 vX; varying vec3 vN; varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vCol = aCol; vP = aP; vA = aA; vX = aX;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

SH.SCENE_FS = `
uniform int uMode; uniform vec3 uSunDir, uSunCol, uSky, uGnd, uLampPos, uRoomPos, uCamPos;
uniform float uLamp, uSunUV, uTmix, uSunNIR, uIR;
varying vec3 vCol; varying vec4 vP; varying vec3 vA; varying vec3 vX; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 toCam = uCamPos - vW; float dc = length(toCam); toCam /= dc;
  float sd = max(dot(n, normalize(uSunDir)), 0.0);
  float hemi = n.y * 0.5 + 0.5;
  vec3 lv = uLampPos - vW; float ld = length(lv);
  float lamp = uLamp * (0.35 + 0.65 * max(dot(n, lv / ld), 0.0)) / (1.0 + ld * ld * 1.2);
  float room = 0.0;
  if (vW.z < -6.05) { vec3 rv = uRoomPos - vW; float rd = length(rv); room = uLamp * (0.4 + 0.6 * max(dot(n, rv / rd), 0.0)) / (1.0 + rd * rd * 0.25); }
  if (uMode == 0) {
    vec3 light = uSunCol * sd + mix(uGnd, uSky, hemi) + vec3(1.0, 0.86, 0.66) * lamp * 0.9 + vec3(1.0, 0.9, 0.75) * room * 1.4;
    vec3 c = vCol * light + vCol * vP.w * uLamp;
    gl_FragColor = vec4(c, vA.x);
  } else if (uMode == 1) {
    float light = uSunUV * (0.6 * sd + 0.55 * hemi) + lamp * 0.12;
    float u = vP.x * light + vP.w * uLamp * 0.05;
    gl_FragColor = vec4(u, u, u, vA.y);
  } else if (uMode == 2) {
    float t = mix(vP.y, vP.z, uTmix);
    gl_FragColor = vec4(t / 60.0, 0.0, 0.0, vA.z);
  } else if (uMode == 3) {
    float f = abs(dot(n, toCam));
    float s = (0.25 * f + 0.75 * pow(f, 6.0)) * vX.x;     // smooth walls return sound mostly when facing the bat
    gl_FragColor = vec4(dc / 40.0, s, 0.0, 1.0);
  } else if (uMode == 4) {
    float ir = uIR * (0.3 + 0.7 * max(dot(n, toCam), 0.0)) / (0.5 + dc * dc * 0.55);   // IR LEDs next to the lens
    float light = uSunNIR * (sd + 0.12 * hemi) + ir + room * 0.6;
    float v = vX.y * light;
    gl_FragColor = vec4(v, v, v, vA.x);
  } else {
    float p = 0.0;
    if (vX.z > 0.0) {                                       // Fresnel reflection of a smooth dielectric (n = 1.33–1.5)
      float ci = clamp(abs(dot(n, toCam)), 0.0, 1.0), si = sqrt(1.0 - ci * ci);
      float m = 1.4, st = si / m, ct = sqrt(max(0.0, 1.0 - st * st));
      float rs = pow((ci - m * ct) / (ci + m * ct), 2.0), rp = pow((ct - m * ci) / (ct + m * ci), 2.0);
      p = vX.z * (rs - rp) / max(rs + rp, 1e-4) * clamp((rs + rp) * 6.0, 0.0, 1.0);
    }
    gl_FragColor = vec4(p, 0.0, 0.0, 1.0);
  }
}`;

SH.SKY_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

SH.SKY_FS = `
uniform int uMode; uniform vec3 uSunDir, uSkyTop, uSkyHor, uSunCol, uCamPos; uniform float uSunUV, uSunNIR, uStars;
varying vec3 vW;
void main(){
  vec3 d = normalize(vW - uCamPos);
  float h = max(d.y, 0.0);
  vec3 sdir = normalize(uSunDir);
  if (uMode == 0) {
    vec3 c = mix(uSkyHor, uSkyTop, pow(h, 0.55));
    float s = max(dot(d, sdir), 0.0);
    c += uSunCol * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.25);
    if (d.y < 0.0) c = uSkyHor * 0.5;
    else if (uStars > 0.0) {                          // stars (fixed brightness: they do not dim with the moon)
      vec3 g = floor(d * 300.0); float hs = fract(sin(dot(g, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      c += step(0.9975, hs) * uStars * 0.0007 * (0.4 + 0.6 * fract(hs * 97.0)) * smoothstep(0.0, 0.15, d.y);
    }
    gl_FragColor = vec4(c, 0.0);                       // alpha 0 marks "sky" for the compound-eye view
  } else if (uMode == 1) {
    float u = uSunUV * (0.42 - 0.15 * h);              // the sky is bright in near-UV (Rayleigh scattering)
    gl_FragColor = vec4(u, u, u, 0.0);
  } else if (uMode == 2) {
    float t = mix(-12.0, 8.0, pow(1.0 - h, 3.0));      // clear sky radiates "cold"
    gl_FragColor = vec4(max(t, 0.0) / 60.0, 0.0, 0.0, 1.0);
  } else if (uMode == 3) {
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);           // nothing returns from the sky
  } else if (uMode == 4) {
    float v = uSunNIR * (0.05 + 0.12 * pow(1.0 - h, 4.0));   // the blue sky is dark in near-IR
    gl_FragColor = vec4(v, v, v, 1.0);
  } else {
    float c = dot(d, sdir);
    float p = uSunUV > 0.05 ? 0.75 * (1.0 - c * c) / (1.0 + c * c) : 0.0;   // Rayleigh single scattering
    gl_FragColor = vec4(p, 1.0, 0.0, 1.0);
  }
}`;

SH.QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

SH.BLUR_FS = `
uniform sampler2D tSrc; uniform vec2 uDir; uniform float uSigma; varying vec2 vUv;
void main(){
  if (uSigma < 0.3) { gl_FragColor = texture2D(tSrc, vUv); return; }
  vec4 acc = vec4(0.0); float wsum = 0.0;
  for (int i = -12; i <= 12; i++) {
    float x = float(i) * uSigma / 4.0;
    float w = exp(-0.5 * x * x / (uSigma * uSigma));
    acc += texture2D(tSrc, vUv + uDir * x) * w; wsum += w;
  }
  gl_FragColor = acc / wsum;
}`;

SH.COMMON = `
uniform float uGrain;
vec3 tone(vec3 c){ c = 1.0 - exp(-max(c, 0.0) * 1.25); return pow(c, vec3(1.0 / 2.2)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// dim light: rods take over -> colour fades toward a slightly bluish grey, grain appears
vec3 scotopic(vec3 c, float k, vec2 p, float t){
  float l = dot(c, vec3(0.2, 0.62, 0.18));
  c = mix(c, vec3(l) * vec3(0.86, 0.96, 1.12), k);
  float n = hash(p * 913.0 + t) - 0.5;                  // photon noise: grows as light runs out
  return c * (1.0 + n * uGrain * 3.0 * k) + n * 0.02 * k;
}
vec3 heat(float x){                                   // dark red -> orange -> yellow -> white
  vec3 a = mix(vec3(0.35, 0.0, 0.05), vec3(1.0, 0.35, 0.0), smoothstep(0.0, 0.4, x));
  a = mix(a, vec3(1.0, 0.85, 0.15), smoothstep(0.35, 0.75, x));
  return mix(a, vec3(1.0, 1.0, 0.9), smoothstep(0.75, 1.0, x));
}
vec3 iron(float x){                                   // thermography palette
  x = clamp(x, 0.0, 1.0);
  vec3 c = mix(vec3(0.0, 0.0, 0.08), vec3(0.25, 0.0, 0.55), smoothstep(0.0, 0.25, x));
  c = mix(c, vec3(0.85, 0.05, 0.35), smoothstep(0.2, 0.5, x));
  c = mix(c, vec3(1.0, 0.55, 0.0), smoothstep(0.45, 0.75, x));
  return mix(c, vec3(1.0, 1.0, 0.75), smoothstep(0.75, 1.0, x));
}
// dichromat (Viénot 1999, deuteranope-type: S cone + one long-wave cone) in linear RGB
vec3 dichromat(vec3 c){ float lw = 0.29275 * c.r + 0.70725 * c.g; return vec3(lw, lw, -0.02234 * c.r + 0.02234 * c.g + c.b); }
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
`;

// Perspective composite. uSense: 0 human, 1 crow, 2 snake, 3 bat, 4 shrimp, 5 dog, 6 cat, 7 thermography, 8 NIR camera
SH.COMP_FS = `
uniform sampler2D tVis, tX, tY, tTh; uniform vec2 uPx; uniform int uSense; uniform float uSplit;
uniform float uExp, uExpH, uNight, uUVK, uUVOnly, uAmbT, uPit, uEye, uTime;
uniform float uCalls[6]; uniform float uNowT, uTau; uniform vec2 uTan;
uniform float uScan, uPolOn;
uniform sampler2D tB; uniform int uLvType; uniform float uLvR, uLvK, uDegPx, uCx;
uniform float uRefH, uAcc, uCyl, uAxis, uRefOn, uPxRad, uPupil;
varying vec2 vUv;
` + SH.COMMON + `
vec3 vis(vec2 p, float r){
  if (r < 0.2) return texture2D(tVis, p).rgb;
  vec3 c = texture2D(tVis, p).rgb * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    c += texture2D(tVis, p + vec2(cos(a), sin(a)) * r * uPx).rgb * 0.1;
  }
  return c;
}
vec3 human(vec2 p){
  vec3 c = vis(p, uNight * 1.6) * uExpH;                 // uExpH: human adaptation limit (also for the split view)
  return tone(scotopic(c, uNight * 0.9, p, uTime));
}
vec3 crow(vec2 p){
  vec3 c = vis(p, 0.0) * uExp;
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  c = max(mix(vec3(l), c, 1.25), 0.0);                    // oil droplets: crisper colours
  float u = texture2D(tX, p).r * uExp;
  if (uUVOnly > 0.5) return tone(vec3(u) * 1.6);
  vec3 tint = vec3(0.78, 0.28, 1.0);
  c = c * (1.0 - 0.5 * uUVK * clamp(u * 1.5, 0.0, 1.0)) + tint * u * uUVK * 1.3;
  return tone(scotopic(c, uNight, p, uTime));
}
vec3 snake(vec2 p){
  vec3 c = vis(p, 2.2) * uExp;
  float lw = dot(c, vec3(0.55, 0.45, 0.0)), sw = c.b;      // two cone types: long & short wavelength
  vec3 d = vec3(lw, lw * 0.92, sw * 0.9 + lw * 0.1);
  d = tone(scotopic(d, uNight * 0.6, p, uTime)) * uEye * 0.8;
  float t = texture2D(tTh, p).r * 60.0;
  float dt = t - uAmbT;
  float x = clamp(dt / 16.0, 0.0, 1.0);
  vec3 h = heat(x) * smoothstep(0.05, 0.3, x);
  vec3 cold = vec3(0.05, 0.18, 0.42) * clamp(-dt / 18.0, 0.0, 1.0) * 0.6;
  if (uPit < 0.5) return d;
  return d * (1.0 - 0.8 * smoothstep(0.1, 0.45, x)) + h + cold;
}
vec3 bat(vec2 p){
  vec4 e = texture2D(tX, p);
  float d = e.r * 40.0;
  vec2 tn = (p - 0.5) * 2.0 * uTan;
  float beam = pow(1.0 / sqrt(1.0 + dot(tn, tn)), 6.0);   // the call is loudest straight ahead
  float amp = e.g * beam * exp(-0.12 * d) / (1.0 + 0.06 * d * d);
  float img = 0.0, fresh = 0.0, ring = 0.0;
  for (int k = 0; k < 6; k++) {
    float age = uNowT - uCalls[k];
    if (age < 0.0) continue;
    float ea = age - 2.0 * d / 343.0;                     // echo arrives after the round trip
    if (ea >= 0.0) { float v = amp * exp(-ea / uTau); img = max(img, v); fresh = max(fresh, amp * exp(-ea / (uTau * 0.25))); }
    float front = 343.0 * age;                            // outgoing wave touching surfaces
    if (front < 14.0) ring += exp(-pow((d - front) / 0.1, 2.0)) * beam;
  }
  vec3 c = vec3(0.35, 0.65, 1.0) * pow(clamp(img * 4.0, 0.0, 1.5), 0.6) + vec3(0.9, 1.0, 1.0) * clamp(fresh * 3.0, 0.0, 1.0) * 0.6;
  c += vec3(0.1, 0.2, 0.75) * clamp(ring, 0.0, 1.0) * 0.45;
  if (uEye > 0.5) c += tone(vis(p, 3.0) * uExp) * 0.22;
  return c;
}
vec3 shrimp(vec2 p){
  vec3 c = vis(p, 1.0) * uExp;
  float l = dot(c, vec3(0.25, 0.6, 0.15));
  vec3 col = tone(vec3(l)) * vec3(0.92, 0.97, 1.0);       // outside the mid-band: no colour
  float dy = abs(p.y - uScan), band = 1.0 - smoothstep(0.045, 0.055, dy);
  if (band > 0.0) {
    vec3 hsv = rgb2hsv(tone(c));
    float h = floor(hsv.x * 12.0 + 0.5) / 12.0;           // one of ~12 colour classes, not fine hue
    vec3 cl = hsv2rgb(vec3(h, hsv.y > 0.16 ? 0.9 : 0.0, clamp(hsv.z * 1.1, 0.12, 1.0)));
    float u = texture2D(tX, p).r * uExp;
    if (u > 0.3 * l + 0.03) cl = mix(cl, vec3(0.8, 0.35, 1.0) * clamp(u * 2.5, 0.3, 1.0), 0.75);
    col = mix(col, cl, band);
  }
  col += vec3(1.0, 0.9, 0.3) * (smoothstep(0.05, 0.055, dy) - smoothstep(0.057, 0.062, dy)) * 0.8;
  if (uPolOn > 0.5) {
    float dp = texture2D(tY, p).r;
    float hatch = step(0.5, fract((gl_FragCoord.x - gl_FragCoord.y) / 7.0));
    col = mix(col, vec3(0.15, 1.0, 0.85), clamp(dp, 0.0, 1.0) * 0.6 * hatch);
  }
  return col;
}
vec3 dogV(vec2 p){
  vec3 c = vis(p, 2.6) * uExp * (1.0 + 0.3 * uNight);
  return tone(scotopic(dichromat(c), uNight * 0.6, p, uTime));
}
vec3 catV(vec2 p){
  vec3 c = vis(p, 3.6) * uExp * (1.0 + 1.0 * uNight);    // brighter at night (pupil, tapetum, rods); the dark limit is DARK_GAIN
  vec3 glow = vis(p, 9.0) * uExp * (1.0 + 1.0 * uNight);
  c = mix(c, glow, 0.25 * uNight);                         // tapetum scatter: a soft halo at night
  return tone(scotopic(dichromat(c), uNight * 0.55, p, uTime));
}
vec3 thermo(vec2 p){
  float t = texture2D(tX, p).r * 60.0;
  return iron((t - 5.0) / 35.0);
}
// low vision. uLvType 0 blur (acuity), 1 central scotoma, 2 constricted field, 3 cataract. tB = blurred copy of tVis
vec3 lowv(vec2 p){
  vec3 c = vis(p, 0.0) * uExp, b = texture2D(tB, p).rgb * uExp;
  float deg = length((p - vec2(uCx, 0.5)) / uPx) * uDegPx;   // degrees from where you are looking
  if (uLvType == 0) c = b;
  else if (uLvType == 1) {
    float k = 1.0 - smoothstep(uLvR * 0.55, uLvR * 1.15, deg);
    vec2 q = p + vec2(sin(p.y * 95.0), cos(p.x * 75.0)) * 2.5 * uPx * (1.0 - smoothstep(uLvR * 0.8, uLvR * 1.7, deg));   // distortion around it
    float l = dot(b, vec3(0.3, 0.55, 0.15));
    c = mix(vis(q, 0.0) * uExp, mix(vec3(l), b, 0.3) * 0.6 + 0.03, k);
  } else if (uLvType == 2) {
    c *= 1.0 - 0.7 * uNight;                                   // night blindness often comes with it
    // the lost field is not seen as black — it is simply not seen. Shown as a flat grey with no shapes (substitution)
    c = mix(c, vec3(0.07), smoothstep(uLvR, uLvR + 6.0, deg));
  } else {
    float l = dot(b, vec3(0.3, 0.55, 0.15));
    c = mix(c, b, 0.55 * uLvK);                                // haze
    c *= pow(vec3(1.0, 0.92, 0.7), vec3(uLvK * 1.5));          // yellowed lens absorbs blue
    c = c * (1.0 - 0.3 * uLvK) + (l * 0.45 + 0.05) * uLvK * 0.6;   // scattered light: lower contrast
    c += max(b - 0.8, 0.0) * 1.1 * uLvK;                       // glare around bright things
  }
  return tone(scotopic(c, uNight * 0.9, p, uTime));
}
vec3 disc(vec2 p, float r){                                     // defocus = a uniform blur circle
  if (r < 0.4) return texture2D(tVis, p).rgb;
  vec3 a = vec3(0.0);
  for (int i = 0; i < 28; i++) {
    float fi = float(i) + 0.5, rr = sqrt(fi / 28.0) * r, th = fi * 2.39996;
    a += texture2D(tVis, p + vec2(cos(th), sin(th)) * rr * uPx).rgb;
  }
  return a / 28.0;
}
// refractive errors. uLvType 0 myopia / hyperopia / presbyopia (uRefH, uAcc), 2 astigmatism. tX.r = distance / 40
vec3 refr(vec2 p){
  vec3 c;
  if (uRefOn < 0.5) c = texture2D(tVis, p).rgb;
  else if (uLvType == 2) {
    vec2 dir = vec2(cos(uAxis), sin(uAxis)) * uPx * (0.5 * uPupil * uCyl * uPxRad);
    c = vec3(0.0);
    for (int i = -6; i <= 6; i++) c += texture2D(tVis, p + dir * float(i) / 6.0).rgb;
    c /= 13.0;
  } else {
    float d = max(texture2D(tX, p).r * 40.0, 0.05);
    float need = 1.0 / d + uRefH;                               // dioptres the eye must add to focus here
    float def = need < 0.0 ? -need : max(0.0, need - uAcc);     // myopia: too strong; otherwise beyond accommodation
    c = disc(p, min(0.5 * uPupil * def * uPxRad, 22.0));        // blur circle = pupil × defocus (radians)
  }
  return tone(scotopic(c * uExp, uNight * 0.9, p, uTime));
}
// colour vision differences (Machado, Oliveira & Fernandes 2009, severity 1.0; lerped toward normal for anomalous trichromacy)
vec3 cvd(vec2 p){
  if (uLvType == 3) {                                          // achromatopsia: rods only -> grey, low acuity, glare in daylight
    vec3 c = vis(p, 3.0) * uExp;
    float l = dot(c, vec3(0.05, 0.5, 0.45)) * (1.0 + 1.8 * (1.0 - uNight));
    return tone(vec3(l) + max(l - 0.6, 0.0) * 0.8) + (hash(p * 913.0 + uTime) - 0.5) * uGrain * uNight;
  }
  vec3 c = texture2D(tVis, p).rgb * uExp;
  mat3 m;
  if (uLvType == 0) m = mat3(0.152286, 0.114503, -0.003882, 1.052583, 0.786281, -0.048116, -0.204868, 0.099216, 1.051998);
  else if (uLvType == 1) m = mat3(0.367322, 0.280085, -0.011820, 0.860646, 0.672501, 0.042940, -0.227968, 0.047413, 0.968881);
  else m = mat3(1.255528, -0.078411, 0.004733, -0.076749, 0.930809, 0.691367, -0.178779, 0.147602, 0.303900);
  c = mix(c, max(m * c, 0.0), uLvK);
  return tone(scotopic(c, uNight * 0.9, p, uTime));
}
vec3 nir(vec2 p){
  float v = texture2D(tX, p).r * uExp * 0.9;
  vec3 c = tone(vec3(v));
  return c + (hash(p * 731.0 + uTime) - 0.5) * 0.04 * uNight;
}
void main(){
  vec2 p = vUv; vec3 c;
  bool left = uSplit > 0.5 && p.x < 0.5;
  if (left || uSense == 0) c = human(p);
  else if (uSense == 1) c = crow(p);
  else if (uSense == 2) c = snake(p);
  else if (uSense == 3) c = bat(p);
  else if (uSense == 4) c = shrimp(p);
  else if (uSense == 5) c = dogV(p);
  else if (uSense == 6) c = catV(p);
  else if (uSense == 7) c = thermo(p);
  else if (uSense == 8) c = nir(p);
  else if (uSense == 9) c = lowv(p);
  else if (uSense == 10) c = refr(p);
  else c = cvd(p);
  if (uSplit > 0.5 && abs(p.x - 0.5) < uPx.x * 1.5) c = vec3(0.95);
  gl_FragColor = vec4(c, 1.0);
}`;

// Panoramic compound eye (fly = 0, bee = 1). Screen -> (azimuth, elevation) in degrees -> hexagonal ommatidia lattice
SH.CUBE_FS = `
uniform samplerCube tCube, tCubeUV; uniform sampler2D tVis;
uniform mat3 uRot; uniform vec2 uRes, uPx, uDegPx; uniform float uHex, uExp, uExpH, uNight, uSplit, uPol, uSunUp, uTime;
uniform int uSense; uniform vec3 uSunDir;
varying vec2 vUv;
` + SH.COMMON + `
vec3 dirOf(vec2 deg){ vec2 a = radians(deg); return uRot * vec3(sin(a.x) * cos(a.y), sin(a.y), -cos(a.x) * cos(a.y)); }
void main(){
  vec2 p = vUv;
  if (uSplit > 0.5 && p.x < 0.5) {
    vec3 c = texture2D(tVis, p).rgb * uExpH;
    gl_FragColor = vec4(tone(scotopic(c, uNight * 0.9, p, uTime)), 1.0);
    if (abs(p.x - 0.5) < uPx.x * 1.5) gl_FragColor = vec4(0.95);
    return;
  }
  vec2 deg = (p - 0.5) * uRes * uDegPx;
  if (abs(deg.x) > 168.0 || abs(deg.y) > 88.0) { gl_FragColor = vec4(0.02, 0.02, 0.03, 1.0); return; }
  vec2 q = deg / uHex, r = vec2(1.0, 1.7320508), h = r * 0.5;
  vec2 a = mod(q, r) - h, b = mod(q - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 cd = (q - gv) * uHex;                              // centre of this ommatidium
  vec3 d = dirOf(cd);
  float lod = log2(max(uHex / 0.35, 1.0)) - 0.5;          // average over the ommatidium's acceptance angle
  vec4 s = textureCubeLodEXT(tCube, d, lod);
  vec3 col;
  if (uSense == 0) {
    col = tone(scotopic(s.rgb * uExp, uNight * 0.5, cd, uTime));
  } else {
    float u = textureCubeLodEXT(tCubeUV, d, lod).r;
    col = tone(vec3(s.g * 1.05, s.b * 1.5, u * 1.7) * uExp);    // bee false colour: green->R, blue->G, UV->B
    if (uPol > 0.5 && s.a < 0.5 && uSunUp > 0.5) {
      float cg = dot(d, normalize(uSunDir));
      float dop = (1.0 - cg * cg) / (1.0 + cg * cg);
      float ring = 0.5 + 0.5 * sin(acos(clamp(cg, -1.0, 1.0)) * 40.0);
      col = mix(col, vec3(0.2, 1.0, 0.75), dop * 0.5 * (0.45 + 0.55 * ring));
    }
  }
  float hd = max(dot(abs(gv), vec2(0.5, 0.8660254)), abs(gv.x));
  if (uHex / max(uDegPx.x, uDegPx.y) > 3.0) col *= mix(1.0, 0.3, smoothstep(0.4, 0.5, hd));
  float edge = smoothstep(150.0, 168.0, abs(deg.x));      // small blind zone straight behind
  gl_FragColor = vec4(mix(col, vec3(0.02, 0.02, 0.03), edge), 1.0);
}`;
