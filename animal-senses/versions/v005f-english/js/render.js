// render.js — one scene, several "sense passes" (shaders.js), then a per-animal composite.
// Perspective animals render into rtVis (+ rtX / rtY / rtTh); compound eyes render a cube map around the camera.
'use strict';

const R = {};
// which composite each animal uses (shaders.js: COMP_FS uSense / CUBE_FS uSense)
const SENSE_ID = { human:0, crow:1, snake:2, bat:3, shrimp:4, dog:5, cat:6, thermo:7, nir:8, low:9, refr:10, cvd:11, fly:0, bee:1 };
const CUBE_SENSES = { fly:true, bee:true };

function initRender(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  R.renderer = r;
  R.scene = new THREE.Scene();
  R.cam = new THREE.PerspectiveCamera(70, 1, 0.02, 120);
  R.cam.rotation.order = 'YXZ';

  const v3 = () => ({ value:new THREE.Vector3() });
  const U = R.U = {
    uMode:{ value:0 }, uSunDir:v3(), uSunCol:v3(), uSky:v3(), uGnd:v3(),
    uLampPos:{ value:new THREE.Vector3(3.6, 2.22, -5.75) }, uRoomPos:{ value:new THREE.Vector3(-2.7, 2.7, -7.6) },
    uLamp:{ value:0 }, uSunUV:{ value:1 }, uTmix:{ value:0 }, uSunNIR:{ value:1 }, uIR:{ value:0 },
    uSkyTop:v3(), uSkyHor:v3(), uCamPos:v3(), uStars:{ value:0 },
  };
  const base = { uniforms:U, vertexShader:SH.SCENE_VS, fragmentShader:SH.SCENE_FS, side:THREE.DoubleSide };
  W.mats.solid = new THREE.ShaderMaterial(base);
  // back faces of a transparent film would paint over its front, so draw the front only
  W.mats.transp = new THREE.ShaderMaterial(Object.assign({}, base, { transparent:true, depthWrite:false, side:THREE.FrontSide }));

  R.sky = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 12), new THREE.ShaderMaterial({
    uniforms:U, side:THREE.BackSide, depthWrite:false, vertexShader:SH.SKY_VS, fragmentShader:SH.SKY_FS,
  }));
  R.sky.renderOrder = -1;
  R.scene.add(R.sky);

  const gl = r.getContext();
  const canHalf = r.capabilities.isWebGL2 ? !!gl.getExtension('EXT_color_buffer_float') : !!gl.getExtension('EXT_color_buffer_half_float');
  const type = canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const rtOpt = { type, depthBuffer:true, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter };
  R.halfFloat = canHalf;
  R.rtVis = new THREE.WebGLRenderTarget(4, 4, rtOpt);
  R.rtX = new THREE.WebGLRenderTarget(4, 4, rtOpt);
  R.rtY = new THREE.WebGLRenderTarget(4, 4, rtOpt);
  R.rtTh = new THREE.WebGLRenderTarget(4, 4, rtOpt);
  R.rtTh2 = new THREE.WebGLRenderTarget(4, 4, Object.assign({}, rtOpt, { depthBuffer:false }));
  R.thSize = [4, 4];
  R.rtB1 = new THREE.WebGLRenderTarget(4, 4, Object.assign({}, rtOpt, { depthBuffer:false }));   // half-res blurred copy (low vision)
  R.rtB2 = new THREE.WebGLRenderTarget(4, 4, Object.assign({}, rtOpt, { depthBuffer:false }));

  const cubeOpt = { type, generateMipmaps:true, minFilter:THREE.LinearMipmapLinearFilter, magFilter:THREE.LinearFilter };
  R.cubeVis = new THREE.WebGLCubeRenderTarget(256, cubeOpt);
  R.cubeUV = new THREE.WebGLCubeRenderTarget(256, cubeOpt);
  R.cubeCamVis = new THREE.CubeCamera(0.01, 120, R.cubeVis);
  R.cubeCamUV = new THREE.CubeCamera(0.01, 120, R.cubeUV);

  R.qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = m => { const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return s; };
  R.blurMat = new THREE.ShaderMaterial({ uniforms:{ tSrc:{ value:null }, uDir:{ value:new THREE.Vector2() }, uSigma:{ value:4 } },
    vertexShader:SH.QUAD_VS, fragmentShader:SH.BLUR_FS, depthTest:false });
  R.blurScene = quad(R.blurMat);
  R.compMat = new THREE.ShaderMaterial({
    uniforms:{
      tVis:{ value:R.rtVis.texture }, tX:{ value:R.rtX.texture }, tY:{ value:R.rtY.texture }, tTh:{ value:R.rtTh.texture },
      uPx:{ value:new THREE.Vector2() }, uSense:{ value:0 }, uSplit:{ value:0 }, uExp:{ value:1 }, uNight:{ value:0 },
      uUVK:{ value:1 }, uUVOnly:{ value:0 }, uAmbT:{ value:15 }, uPit:{ value:1 }, uEye:{ value:1 }, uTime:{ value:0 },
      uCalls:{ value:[-99, -99, -99, -99, -99, -99] }, uNowT:{ value:0 }, uTau:{ value:0.12 }, uTan:{ value:new THREE.Vector2(1, 1) },
      uScan:{ value:0.5 }, uPolOn:{ value:1 }, uGrain:{ value:0.035 }, uExpH:{ value:1 },
      tB:{ value:null }, uLvType:{ value:0 }, uLvR:{ value:10 }, uLvK:{ value:0.5 }, uDegPx:{ value:0.1 }, uCx:{ value:0.5 },
      uRefH:{ value:0 }, uAcc:{ value:8 }, uCyl:{ value:0 }, uAxis:{ value:0 }, uRefOn:{ value:1 }, uPxRad:{ value:500 }, uPupil:{ value:0.004 },
    },
    vertexShader:SH.QUAD_VS, fragmentShader:SH.COMP_FS, depthTest:false,
  });
  R.compScene = quad(R.compMat);
  R.cubeMat = new THREE.ShaderMaterial({
    uniforms:{
      tCube:{ value:R.cubeVis.texture }, tCubeUV:{ value:R.cubeUV.texture }, tVis:{ value:R.rtVis.texture },
      uRot:{ value:new THREE.Matrix3() }, uRes:{ value:new THREE.Vector2() }, uPx:{ value:new THREE.Vector2() },
      uDegPx:{ value:new THREE.Vector2(0.5, 0.5) }, uHex:{ value:3 }, uExp:{ value:1 }, uNight:{ value:0 }, uSplit:{ value:0 }, uPol:{ value:1 },
      uSunUp:{ value:1 }, uTime:{ value:0 }, uSense:{ value:0 }, uSunDir:v3(), uGrain:{ value:0.035 }, uExpH:{ value:1 },
    },
    vertexShader:SH.QUAD_VS, fragmentShader:SH.CUBE_FS, depthTest:false,
  });
  R.cubeMat.extensions = { shaderTextureLOD:true };
  R.cubeScene = quad(R.cubeMat);
}

function resizeRender() {
  const c = R.renderer.domElement, w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  R.renderer.setSize(w, h, false);
  const s = R.renderer.getDrawingBufferSize(new THREE.Vector2());
  for (const rt of [R.rtVis, R.rtX, R.rtY]) rt.setSize(s.x, s.y);
  const tw = 320, th = Math.max(60, Math.round(320 * s.y / s.x));   // pit image grid (blur is applied on top)
  R.rtTh.setSize(tw, th); R.rtTh2.setSize(tw, th);
  R.rtB1.setSize(Math.ceil(s.x / 2), Math.ceil(s.y / 2)); R.rtB2.setSize(Math.ceil(s.x / 2), Math.ceil(s.y / 2));
  R.thSize = [tw, th];
  R.size = [s.x, s.y];
  R.compMat.uniforms.uPx.value.set(1 / s.x, 1 / s.y);
  R.cubeMat.uniforms.uPx.value.set(1 / s.x, 1 / s.y);
  R.cubeMat.uniforms.uRes.value.set(s.x, s.y);
  // panorama: 336° across the full width; up to 176° tall
  { const dx = 336 / s.x, dy = Math.min(176 / s.y, dx); R.cubeMat.uniforms.uDegPx.value.set(dx, dy); }   // always the full width (squeezed on tall screens)
  R.cam.aspect = w / h; R.cam.updateProjectionMatrix();
}

function setTimeUniforms(tm) {
  const U = R.U;
  R.tm = tm;
  U.uSunDir.value.set(...tm.sunDir); U.uSunCol.value.set(...tm.sun);
  U.uSky.value.set(...tm.sky); U.uGnd.value.set(...tm.gnd);
  U.uSkyTop.value.set(...tm.skyTop); U.uSkyHor.value.set(...tm.skyHor);
  U.uSunUV.value = tm.uv; U.uSunNIR.value = tm.nir; U.uTmix.value = tm.tmix;
  U.uStars.value = tm.stars || 0;
  R.cubeMat.uniforms.uSunDir.value.set(...tm.sunDir);
  R.cubeMat.uniforms.uSunUp.value = tm.uv > 0.05 ? 1 : 0;
  // background temperature the pit organ image is referenced to: air temperature (day 26 °C, night 16.5 °C)
  R.compMat.uniforms.uAmbT.value = 26 + (16.5 - 26) * tm.tmix;
}

function pass(mode, rt) {
  R.U.uMode.value = mode;
  R.renderer.setRenderTarget(rt);
  R.renderer.render(R.scene, R.cam);
}

// o: { animal, split, lampK, uvK, uvOnly, pit, eye, blur, time, calls[], nowT, tau, hex, pol, scan, polOn }
function renderFrame(o) {
  const tm = R.tm, U = R.U, k = o.animal;
  U.uCamPos.value.copy(R.cam.position);
  R.sky.position.copy(R.cam.position);
  U.uLamp.value = tm.lamp * o.lampK;
  // dark nights: the eye adapts only up to DARK_GAIN[k] times a full-moon night; beyond that the picture goes dark and grainy
  const L = tm.L || 1, G = DARK_GAIN[k] || 25;
  const dk = { gain: Math.min(1 / L, G), grain: 0.035 + 0.1 * (1 - Math.min(1, G * L)) };
  const expH = tm.exp * Math.min(1 / L, DARK_GAIN.human);
  R.compMat.uniforms.uExpH.value = expH; R.cubeMat.uniforms.uExpH.value = expH;
  U.uIR.value = k === 'nir' ? tm.ir : 0;
  R.cam.updateMatrixWorld();

  if (CUBE_SENSES[k]) {
    const cm = R.cubeMat.uniforms;
    U.uMode.value = 0; R.cubeCamVis.position.copy(R.cam.position); R.cubeCamVis.update(R.renderer, R.scene);
    if (k === 'bee') { U.uMode.value = 1; R.cubeCamUV.position.copy(R.cam.position); R.cubeCamUV.update(R.renderer, R.scene); }
    if (o.split) pass(0, R.rtVis);
    cm.uRot.value.setFromMatrix4(R.cam.matrixWorld);
    cm.uSense.value = SENSE_ID[k]; cm.uSplit.value = o.split ? 1 : 0;
    cm.uHex.value = o.hex; cm.uPol.value = o.pol ? 1 : 0;
    cm.uExp.value = tm.exp * dk.gain; cm.uGrain.value = dk.grain; cm.uNight.value = tm.night; cm.uTime.value = o.time % 100;
    R.renderer.setRenderTarget(null);
    R.renderer.render(R.cubeScene, R.qcam);
    return;
  }

  const cu = R.compMat.uniforms;
  pass(0, R.rtVis);
  if (k === 'crow') pass(1, R.rtX);
  else if (k === 'bat') pass(3, R.rtX);
  else if (k === 'shrimp') { pass(1, R.rtX); pass(5, R.rtY); }
  else if (k === 'thermo') pass(2, R.rtX);
  else if (k === 'nir') pass(4, R.rtX);
  else if (k === 'refr') pass(3, R.rtX);                  // distance per pixel -> defocus
  else if (k === 'low') {
    // blurred copy at half resolution (sigma in half-res pixels)
    const bm = R.blurMat.uniforms, hw = R.rtB1.width, hh = R.rtB1.height;
    bm.uSigma.value = o.lvSigma;
    bm.tSrc.value = R.rtVis.texture; bm.uDir.value.set(1 / hw, 0);
    R.renderer.setRenderTarget(R.rtB2); R.renderer.render(R.blurScene, R.qcam);
    bm.tSrc.value = R.rtB2.texture; bm.uDir.value.set(0, 1 / hh);
    R.renderer.setRenderTarget(R.rtB1); R.renderer.render(R.blurScene, R.qcam);
    cu.tB.value = R.rtB1.texture;
  }
  if (k === 'low' || k === 'refr' || k === 'cvd') {
    const fovR = R.cam.fov * Math.PI / 180, h = R.size ? R.size[1] : 600;
    cu.uLvType.value = o.lvType; cu.uLvR.value = o.lvR; cu.uLvK.value = o.lvK;
    cu.uDegPx.value = R.cam.fov / h; cu.uPxRad.value = h / fovR; cu.uCx.value = o.split ? 0.75 : 0.5;
    cu.uRefH.value = o.refH; cu.uAcc.value = o.acc; cu.uCyl.value = o.cyl; cu.uAxis.value = o.axis; cu.uRefOn.value = o.glasses ? 0 : 1;
    cu.uPupil.value = 0.003 + 0.0035 * tm.night;          // the pupil opens in the dark -> more blur
  }
  else if (k === 'snake') {
    pass(2, R.rtTh);
    const [tw, th] = R.thSize, bm = R.blurMat.uniforms;
    bm.uSigma.value = o.blur;
    bm.tSrc.value = R.rtTh.texture; bm.uDir.value.set(1 / tw, 0);
    R.renderer.setRenderTarget(R.rtTh2); R.renderer.render(R.blurScene, R.qcam);
    bm.tSrc.value = R.rtTh2.texture; bm.uDir.value.set(0, 1 / th);
    R.renderer.setRenderTarget(R.rtTh); R.renderer.render(R.blurScene, R.qcam);
  }
  cu.uSense.value = SENSE_ID[k]; cu.uSplit.value = o.split ? 1 : 0;
  cu.uExp.value = k === "nir" ? 1.4 : tm.exp * dk.gain; cu.uGrain.value = dk.grain; cu.uNight.value = tm.night;
  cu.uUVK.value = o.uvK; cu.uUVOnly.value = o.uvOnly ? 1 : 0;
  cu.uPit.value = o.pit ? 1 : 0; cu.uEye.value = k === 'snake' ? (o.eye ? 1 : 0.06) : (o.eye ? 1 : 0);
  cu.uTime.value = o.time % 100;
  if (k === 'bat') {
    for (let i = 0; i < 6; i++) cu.uCalls.value[i] = o.calls[i] != null ? o.calls[i] : -99;
    cu.uNowT.value = o.nowT; cu.uTau.value = o.tau;
    const ty = Math.tan(R.cam.fov * Math.PI / 360);
    cu.uTan.value.set(ty * R.cam.aspect, ty);
  }
  cu.uScan.value = o.scan; cu.uPolOn.value = o.polOn ? 1 : 0;
  R.renderer.setRenderTarget(null);
  R.renderer.render(R.compScene, R.qcam);
}
