// WebGL2 の描画。1) 画素ごとに光を計算して HDR の絵へ（shader.js） 2) にじみの段 3) 仕上げ。
// float のテクスチャへ描けない端末では 8bit の絵で同じ手順を通す（にじみが弱くなるだけ）。
'use strict';

const R = {};
const BLOOM_LEVELS = 5;

function compile(gl, vs, fs) {
  const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
function uniforms(gl, p, names) { const u = {}; for (const n of names) u[n] = gl.getUniformLocation(p, n); return u; }

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

function makeTarget(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (R.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, w, h };
}
function freeTarget(gl, t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }

function initRender(canvas, skyW, aa) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('この端末では WebGL2 が使えません');
  R.gl = gl; R.skyW = skyW; R.aa = aa;
  R.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  R.prog = compile(gl, VS, FS_SCENE);
  R.u = uniforms(gl, R.prog, ['uLut', 'uSkyA', 'uSkyB', 'uHalf', 'uPx', 'uView', 'uOrbit', 'uPsiC', 'uK0', 'uK1', 'uFlip', 'uSkyW', 'uN', 'uMode', 'uPano', 'uRc', 'uCamS', 'uStar', 'uJit', 'uWt', 'uNoise', 'uBody', 'uKind', 'uSun', 'uRingN', 'uRingAxisW', 'uRingR', 'uSunGain']);
  R.down = compile(gl, VS, FS_DOWN); R.uDown = uniforms(gl, R.down, ['uT', 'uTexel', 'uThresh']);
  R.up = compile(gl, VS, FS_UP); R.uUp = uniforms(gl, R.up, ['uT', 'uTexel']);
  R.comp = compile(gl, VS, FS_COMP); R.uComp = uniforms(gl, R.comp, ['uScene', 'uBloom', 'uStreak', 'uBloomGain', 'uStreakGain', 'uVig', 'uTexel']);

  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  R.lut = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.lut);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, LUT_N, 2, 0, gl.RED, gl.FLOAT, null);

  gl.activeTexture(gl.TEXTURE1); R.skyA = skyTexture(gl, makeSkyCanvas('A', skyW));
  gl.activeTexture(gl.TEXTURE2); R.skyB = skyTexture(gl, makeSkyCanvas('B', skyW));

  const NS = 32, noise = new Uint8Array(NS * NS * NS), rnd = mulberry32(90125);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(rnd() * 256);
  gl.activeTexture(gl.TEXTURE6);
  R.noise = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, R.noise);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, NS, NS, NS, 0, gl.RED, gl.UNSIGNED_BYTE, noise);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT);

  gl.useProgram(R.prog);
  gl.uniform1i(R.u.uLut, 0); gl.uniform1i(R.u.uSkyA, 1); gl.uniform1i(R.u.uSkyB, 2); gl.uniform1i(R.u.uNoise, 6);
  gl.uniform1f(R.u.uSkyW, skyW); gl.uniform1i(R.u.uN, LUT_N);
  applyScene();
}

function applyScene() {
  const gl = R.gl;
  gl.useProgram(R.prog);
  gl.uniform1iv(R.u.uKind, new Int32Array([...SCENE.A.bodies, ...SCENE.B.bodies].map(b => b.kind)));
  gl.uniform2f(R.u.uRingR, SCENE.ring.inner, SCENE.ring.outer);
  gl.uniform3fv(R.u.uRingAxisW, new Float32Array(SCENE.ring.axis));
  gl.uniform2f(R.u.uSunGain, SCENE.A.gain, SCENE.B.gain);
}

function resizeTargets(w, h) {
  const gl = R.gl;
  if (R.scene && R.scene.w === w && R.scene.h === h) return;
  if (R.scene) { freeTarget(gl, R.scene); R.levels.forEach(l => { freeTarget(gl, l.down); freeTarget(gl, l.up); }); }
  R.scene = makeTarget(gl, w, h);
  R.levels = [];
  let lw = w, lh = h;
  for (let i = 0; i < BLOOM_LEVELS; i++) {
    lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1);
    R.levels.push({ down: makeTarget(gl, lw, lh), up: makeTarget(gl, lw, lh) });
  }
}

function uploadLUT(T) {
  const gl = R.gl;
  gl.useProgram(R.prog);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.lut);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LUT_N, 2, gl.RED, gl.FLOAT, T.data);
  gl.uniform1f(R.u.uPsiC, T.psiC); gl.uniform1f(R.u.uK0, T.K0); gl.uniform1f(R.u.uK1, T.K1); gl.uniform1f(R.u.uFlip, T.flip);
}

const mulTv = (Q, v) => [0, 1, 2].map(i => Q[i][0] * v[0] + Q[i][1] * v[1] + Q[i][2] * v[2]);   // Q の列 = 局所の軸（世界の座標）→ 世界から局所へ

function drawFull() { R.gl.drawArrays(R.gl.TRIANGLES, 0, 3); }
function bindTex(unit, tex) { const gl = R.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }

// view: {right,up,fwd}（局所）、orbit: 列 [X,Y,Z] の配列（局所→世界）、half: [tanX,tanY]、opt: {mode,stripPx,rc,camS,film}
function drawView(view, orbit, half, opt) {
  const gl = R.gl, c = gl.canvas;
  resizeTargets(c.width, c.height);
  gl.useProgram(R.prog);
  gl.bindFramebuffer(gl.FRAMEBUFFER, R.scene.fb);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.lut);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.skyA);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, R.skyB);

  gl.uniform1i(R.u.uMode, opt.mode);
  gl.uniform1f(R.u.uRc, opt.rc); gl.uniform1f(R.u.uCamS, opt.camS); gl.uniform1f(R.u.uStar, 1);
  gl.uniformMatrix3fv(R.u.uOrbit, false, new Float32Array([...orbit[0], ...orbit[1], ...orbit[2]]));
  gl.uniformMatrix3fv(R.u.uView, false, new Float32Array([...view.right, ...view.up, ...view.fwd]));
  const bodies = [...SCENE.A.bodies, ...SCENE.B.bodies], arr = new Float32Array(24);
  bodies.forEach((b, i) => { const v = mulTv(orbit, b.c); arr.set([v[0], v[1], v[2], b.R], i * 4); });
  gl.uniform4fv(R.u.uBody, arr);
  gl.uniform3fv(R.u.uSun, new Float32Array([...mulTv(orbit, SCENE.A.sun), ...mulTv(orbit, SCENE.B.sun)]));
  gl.uniform3fv(R.u.uRingN, new Float32Array(mulTv(orbit, SCENE.ring.axis)));

  // ずらして足す（RGSS）
  const aa = opt.aa || R.aa, JIT = aa >= 4 ? [[.125, .375], [-.375, .125], [.375, -.125], [-.125, -.375]] : aa === 2 ? [[.25, .25], [-.25, -.25]] : [[0, 0]];
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.uniform1f(R.u.uWt, 1 / JIT.length);
  gl.uniform1f(R.u.uPano, 0);
  gl.viewport(0, 0, c.width, c.height);
  gl.uniform2f(R.u.uHalf, half[0], half[1]);
  gl.uniform2f(R.u.uPx, 2 / c.width, 2 / c.height);
  for (const j of JIT) { gl.uniform2f(R.u.uJit, j[0], j[1]); drawFull(); }
  if (opt.stripPx > 0) {
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, c.width, opt.stripPx); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.SCISSOR_TEST);
    gl.uniform1f(R.u.uPano, opt.stripPx / c.width);
    gl.viewport(0, 0, c.width, opt.stripPx);
    gl.uniform2f(R.u.uPx, 2 / c.width, 2 / opt.stripPx);
    for (const j of JIT) { gl.uniform2f(R.u.uJit, j[0], j[1]); drawFull(); }
  }
  gl.disable(gl.BLEND);

  // にじみ
  const film = opt.film && opt.mode === 0;
  if (film) {
    gl.useProgram(R.down); gl.uniform1i(R.uDown.uT, 3);
    let src = R.scene;
    R.levels.forEach((l, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, l.down.fb); gl.viewport(0, 0, l.down.w, l.down.h);
      bindTex(3, src.tex);
      gl.uniform2f(R.uDown.uTexel, 1 / src.w, 1 / src.h);
      gl.uniform1f(R.uDown.uThresh, i === 0 ? 1.0 : 0);
      drawFull(); src = l.down;
    });
    gl.useProgram(R.up); gl.uniform1i(R.uUp.uT, 3);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = R.levels.length - 1; i >= 0; i--) {
      const l = R.levels[i], from = i === R.levels.length - 1 ? l.down : R.levels[i + 1].up;
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, l.up.fb); gl.viewport(0, 0, l.up.w, l.up.h);
      bindTex(3, from.tex);
      gl.uniform2f(R.uUp.uTexel, 1 / from.w, 1 / from.h);
      drawFull();
      if (i < R.levels.length - 1) {   // 同じ段の細かい成分を足す
        gl.enable(gl.BLEND);
        bindTex(3, l.down.tex);
        gl.uniform2f(R.uUp.uTexel, 1 / l.down.w, 1 / l.down.h);
        drawFull();
      }
    }
    gl.disable(gl.BLEND);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, c.width, c.height);
  gl.useProgram(R.comp);
  bindTex(3, R.scene.tex); bindTex(4, R.levels[0].up.tex); bindTex(5, R.levels[1].down.tex);
  gl.uniform1i(R.uComp.uScene, 3); gl.uniform1i(R.uComp.uBloom, 4); gl.uniform1i(R.uComp.uStreak, 5);
  gl.uniform1f(R.uComp.uBloomGain, film ? SCENE.film : 0);
  gl.uniform1f(R.uComp.uStreakGain, film ? 0.16 : 0);
  gl.uniform1f(R.uComp.uVig, film ? 0.5 : 0);
  gl.uniform2f(R.uComp.uTexel, 1 / c.width, 1 / c.height);
  drawFull();
}
