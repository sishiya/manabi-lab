// render.js — one scene, several "sense passes", then a per-animal composite.
//   pass 0 VIS  : human-band colour, lit (HDR, half float)
//   pass 1 UV   : near-UV reflectance × UV light (grey in r)
//   pass 2 THERM: surface temperature / 60 (low-res, then blurred like a pinhole pit organ)
// Composite: uSense 0 = human, 1 = crow, 2 = snake. uSplit draws the human view on the left half.
'use strict';

const R = {};

const SCENE_VS = `
attribute vec3 aCol; attribute vec4 aP; attribute vec3 aA;
varying vec3 vCol; varying vec4 vP; varying vec3 vA; varying vec3 vN; varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vCol = aCol; vP = aP; vA = aA;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SCENE_FS = `
uniform int uMode; uniform vec3 uSunDir, uSunCol, uSky, uGnd, uLampPos, uRoomPos; uniform float uLamp, uSunUV, uTmix;
varying vec3 vCol; varying vec4 vP; varying vec3 vA; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
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
  } else {
    float t = mix(vP.y, vP.z, uTmix);
    gl_FragColor = vec4(t / 60.0, 0.0, 0.0, vA.z);
  }
}`;

const SKY_FS = `
uniform int uMode; uniform vec3 uSunDir, uSkyTop, uSkyHor, uSunCol; uniform float uSunUV, uTmix; uniform vec3 uCamPos;
varying vec3 vW;
void main(){
  vec3 d = normalize(vW - uCamPos);
  float h = max(d.y, 0.0);
  if (uMode == 0) {
    vec3 c = mix(uSkyHor, uSkyTop, pow(h, 0.55));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    c += uSunCol * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.25);
    if (d.y < 0.0) c = uSkyHor * 0.5;
    gl_FragColor = vec4(c, 1.0);
  } else if (uMode == 1) {
    float u = uSunUV * (0.42 - 0.15 * h);           // the sky is bright in near-UV (Rayleigh scattering)
    gl_FragColor = vec4(u, u, u, 1.0);
  } else {
    float t = mix(-12.0, 8.0, pow(1.0 - h, 3.0));   // clear sky radiates "cold"
    gl_FragColor = vec4(max(t, 0.0) / 60.0, 0.0, 0.0, 1.0);
  }
}`;

const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// separable gaussian (thermal blur)
const BLUR_FS = `
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

const COMP_FS = `
uniform sampler2D tVis, tUV, tTh; uniform vec2 uPx; uniform int uSense; uniform float uSplit;
uniform float uExp, uNight, uUVK, uUVOnly, uAmbT, uPit, uEye, uTime;
varying vec2 vUv;
vec3 tone(vec3 c){ c = 1.0 - exp(-c * 1.25); return pow(c, vec3(1.0 / 2.2)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 vis(vec2 p, float r){
  if (r < 0.2) return texture2D(tVis, p).rgb;
  vec3 c = texture2D(tVis, p).rgb * 0.36;
  c += (texture2D(tVis, p + vec2(r, 0.0) * uPx).rgb + texture2D(tVis, p - vec2(r, 0.0) * uPx).rgb
      + texture2D(tVis, p + vec2(0.0, r) * uPx).rgb + texture2D(tVis, p - vec2(0.0, r) * uPx).rgb) * 0.16;
  return c;
}
// dim light: rods take over -> colour fades toward a slightly bluish grey, acuity drops, grain appears
vec3 scotopic(vec3 c, float k, vec2 p){
  float l = dot(c, vec3(0.2, 0.62, 0.18));
  c = mix(c, vec3(l) * vec3(0.86, 0.96, 1.12), k);
  return c + (hash(p * 913.0 + uTime) - 0.5) * 0.035 * k;
}
vec3 human(vec2 p){
  vec3 c = vis(p, uNight * 1.6) * uExp;
  return tone(scotopic(c, uNight * 0.9, p));
}
vec3 crow(vec2 p){
  vec3 c = vis(p, 0.0) * uExp;
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  c = max(mix(vec3(l), c, 1.25), 0.0);                    // oil droplets: crisper colours
  float u = texture2D(tUV, p).r * uExp;
  if (uUVOnly > 0.5) return tone(vec3(u) * 1.6);
  vec3 tint = vec3(0.78, 0.28, 1.0);
  c = c * (1.0 - 0.5 * uUVK * clamp(u * 1.5, 0.0, 1.0)) + tint * u * uUVK * 1.3;
  return tone(scotopic(c, uNight, p));
}
vec3 heat(float x){                                         // dark red -> orange -> yellow -> white
  vec3 a = mix(vec3(0.35, 0.0, 0.05), vec3(1.0, 0.35, 0.0), smoothstep(0.0, 0.4, x));
  a = mix(a, vec3(1.0, 0.85, 0.15), smoothstep(0.35, 0.75, x));
  return mix(a, vec3(1.0, 1.0, 0.9), smoothstep(0.75, 1.0, x));
}
vec3 snake(vec2 p){
  vec3 c = vis(p, 2.2) * uExp;
  float lw = dot(c, vec3(0.55, 0.45, 0.0)), sw = c.b;      // two cone types: long & short wavelength
  vec3 d = vec3(lw, lw * 0.92, sw * 0.9 + lw * 0.1);
  d = tone(scotopic(d, uNight * 0.6, p)) * uEye * 0.8;
  float t = texture2D(tTh, p).r * 60.0;
  float dt = t - uAmbT;
  float x = clamp(dt / 16.0, 0.0, 1.0);
  vec3 h = heat(x) * smoothstep(0.05, 0.3, x);
  vec3 cold = vec3(0.05, 0.18, 0.42) * clamp(-dt / 18.0, 0.0, 1.0) * 0.6;
  if (uPit < 0.5) return d;
  return d * (1.0 - 0.8 * smoothstep(0.1, 0.45, x)) + h + cold;
}
void main(){
  vec2 p = vUv; vec3 c;
  bool left = uSplit > 0.5 && p.x < 0.5;
  if (left || uSense == 0) c = human(p);
  else if (uSense == 1) c = crow(p);
  else c = snake(p);
  if (uSplit > 0.5 && abs(p.x - 0.5) < uPx.x * 1.5) c = vec3(0.95);
  gl_FragColor = vec4(c, 1.0);
}`;

function initRender(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  r.autoClear = true;
  R.renderer = r;
  R.scene = new THREE.Scene();
  R.cam = new THREE.PerspectiveCamera(70, 1, 0.02, 120);
  R.cam.rotation.order = 'YXZ';

  const U = R.U = {
    uMode:{ value:0 }, uSunDir:{ value:new THREE.Vector3() }, uSunCol:{ value:new THREE.Vector3() },
    uSky:{ value:new THREE.Vector3() }, uGnd:{ value:new THREE.Vector3() },
    uLampPos:{ value:new THREE.Vector3(3.6, 2.22, -5.75) }, uRoomPos:{ value:new THREE.Vector3(-2.7, 2.7, -7.6) },
    uLamp:{ value:0 }, uSunUV:{ value:1 }, uTmix:{ value:0 },
    uSkyTop:{ value:new THREE.Vector3() }, uSkyHor:{ value:new THREE.Vector3() }, uCamPos:{ value:new THREE.Vector3() },
  };
  const base = { uniforms:U, vertexShader:SCENE_VS, fragmentShader:SCENE_FS, side:THREE.DoubleSide };
  W.mats.solid = new THREE.ShaderMaterial(base);
  W.mats.transp = new THREE.ShaderMaterial(Object.assign({}, base, { transparent:true, depthWrite:false, side:THREE.FrontSide }));   // back faces would paint over the front

  R.sky = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 12), new THREE.ShaderMaterial({
    uniforms:U, side:THREE.BackSide, depthWrite:false,
    vertexShader:`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader:SKY_FS,
  }));
  R.sky.renderOrder = -1;
  R.scene.add(R.sky);

  const gl = r.getContext();
  const canHalf = r.capabilities.isWebGL2 ? !!gl.getExtension('EXT_color_buffer_float') : !!gl.getExtension('EXT_color_buffer_half_float');
  const rtOpt = { type: canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer:true, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter };
  R.halfFloat = canHalf;
  R.rtVis = new THREE.WebGLRenderTarget(4, 4, rtOpt);
  R.rtUV = new THREE.WebGLRenderTarget(4, 4, rtOpt);
  R.rtTh = new THREE.WebGLRenderTarget(4, 4, rtOpt);
  R.rtTh2 = new THREE.WebGLRenderTarget(4, 4, Object.assign({}, rtOpt, { depthBuffer:false }));
  R.thSize = [4, 4];

  R.qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = g => { const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), g)); return s; };
  R.blurMat = new THREE.ShaderMaterial({ uniforms:{ tSrc:{ value:null }, uDir:{ value:new THREE.Vector2() }, uSigma:{ value:4 } }, vertexShader:QUAD_VS, fragmentShader:BLUR_FS, depthTest:false });
  R.blurScene = quad(R.blurMat);
  R.compMat = new THREE.ShaderMaterial({
    uniforms:{
      tVis:{ value:R.rtVis.texture }, tUV:{ value:R.rtUV.texture }, tTh:{ value:R.rtTh.texture },
      uPx:{ value:new THREE.Vector2() }, uSense:{ value:0 }, uSplit:{ value:0 }, uExp:{ value:1 }, uNight:{ value:0 },
      uUVK:{ value:1 }, uUVOnly:{ value:0 }, uAmbT:{ value:15 }, uPit:{ value:1 }, uEye:{ value:1 }, uTime:{ value:0 },
    },
    vertexShader:QUAD_VS, fragmentShader:COMP_FS, depthTest:false,
  });
  R.compScene = quad(R.compMat);
}

function resizeRender() {
  const c = R.renderer.domElement, w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  R.renderer.setSize(w, h, false);
  const s = R.renderer.getDrawingBufferSize(new THREE.Vector2());
  R.rtVis.setSize(s.x, s.y); R.rtUV.setSize(s.x, s.y);
  const tw = 320, th = Math.max(60, Math.round(320 * s.y / s.x));   // pit image grid (blur is applied on top)
  R.rtTh.setSize(tw, th); R.rtTh2.setSize(tw, th);
  R.thSize = [tw, th];
  R.compMat.uniforms.uPx.value.set(1 / s.x, 1 / s.y);
  R.cam.aspect = w / h; R.cam.updateProjectionMatrix();
}

function setTimeUniforms(tm) {
  const U = R.U;
  U.uSunDir.value.set(...tm.sunDir); U.uSunCol.value.set(...tm.sun);
  U.uSky.value.set(...tm.sky); U.uGnd.value.set(...tm.gnd);
  U.uSkyTop.value.set(...tm.skyTop); U.uSkyHor.value.set(...tm.skyHor);
  U.uSunUV.value = tm.uv; U.uLamp.value = tm.lamp; U.uTmix.value = tm.tmix;
  R.compMat.uniforms.uExp.value = tm.exp; R.compMat.uniforms.uNight.value = tm.night;
  // background temperature the pit organ image is referenced to: air temperature (day 26 °C, night 16.5 °C)
  R.compMat.uniforms.uAmbT.value = 26 + (16.5 - 26) * tm.tmix;
}

function pass(mode, rt) {
  R.U.uMode.value = mode;
  R.renderer.setRenderTarget(rt);
  R.renderer.render(R.scene, R.cam);
}

// opts: { sense:0|1|2, split, uvK, uvOnly, pit, eye, blur, time }
function renderFrame(o) {
  R.U.uCamPos.value.copy(R.cam.position);
  R.sky.position.copy(R.cam.position);
  const cu = R.compMat.uniforms;
  pass(0, R.rtVis);
  if (o.sense === 1) pass(1, R.rtUV);
  if (o.sense === 2) {
    pass(2, R.rtTh);
    const [tw, th] = R.thSize, bm = R.blurMat.uniforms;
    bm.uSigma.value = o.blur;
    bm.tSrc.value = R.rtTh.texture; bm.uDir.value.set(1 / tw, 0);
    R.renderer.setRenderTarget(R.rtTh2); R.renderer.render(R.blurScene, R.qcam);
    bm.tSrc.value = R.rtTh2.texture; bm.uDir.value.set(0, 1 / th);
    R.renderer.setRenderTarget(R.rtTh); R.renderer.render(R.blurScene, R.qcam);
  }
  cu.uSense.value = o.sense; cu.uSplit.value = o.split ? 1 : 0;
  cu.uUVK.value = o.uvK; cu.uUVOnly.value = o.uvOnly ? 1 : 0;
  cu.uPit.value = o.pit ? 1 : 0; cu.uEye.value = o.eye ? 1 : 0.06;
  cu.uTime.value = o.time % 100;
  R.renderer.setRenderTarget(null);
  R.renderer.render(R.compScene, R.qcam);
}
