// 波が育つまで — WebGL2 の海（FFT の海面3枚・空・描画）
'use strict';
window.WGocean = (() => {
  const N = 256, LOOP = 1000, W0 = 2 * Math.PI / LOOP;   // 周波数を 2π/1000 秒 の整数倍に丸める → 1000 秒でくり返す
  // 3枚の海面（大・中・小）。L は 8 倍ずつ → どれも 1280 m でつながる。波数の受け持ちを分けて重ならないように
  const CASC = [
    { L: 1280, kmin: 0,    kmax: 0.28 },
    { L: 160,  kmin: 0.28, kmax: 2.2 },
    { L: 20,   kmin: 2.2,  kmax: 32 },
    { L: 2.5,  kmin: 32,   kmax: 256 },   // 4 枚め（画質「高」だけ）: 波長 20 cm〜2.5 cm のさざ波。傾き（照り返し）だけに使い、形（変位）・泡には入れない
  ];
  const LS3 = CASC.slice(0, 3).map(c => c.L);   // 形（変位）・泡・ブイ・コースティクスに使う 3 枚の大きさ（uniform vec3。4 つ渡すと送られない）
  const SKW = 512, SKH = 256;
  // 画質: casc4 = 4 枚めの海面、foam = 泡の地図（2 = 近くは毎コマ、1 = 1 コマおき、0 = 地図なし・画素ごとの目安）、grid = 海面の網目、px = 画素の上限（端末の倍率の何倍まで）、sky = 空を描きなおす間隔
  const QUALITY = {
    high: { casc4: true,  foam: 2, grid: [600, 640], px: 2,    sky: 4 },
    mid:  { casc4: false, foam: 1, grid: [420, 450], px: 1.25, sky: 6 },
    low:  { casc4: false, foam: 0, grid: [280, 300], px: 1,    sky: 10 },
  };

  function create(cv) {
    const gl = cv.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error(L('WebGL2 が使えません', 'WebGL2 is not available'));
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error(L('EXT_color_buffer_float が使えません', 'EXT_color_buffer_float is not available'));
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    // ソフトの GPU（SwiftShader など）では、GPU に問い合わせるたびに待たされるので、時間の計測をやめる
    const dri = gl.getExtension('WEBGL_debug_renderer_info'), renderer = dri ? String(gl.getParameter(dri.UNMASKED_RENDERER_WEBGL)) : '';
    const isSoft = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
    const tq = isSoft ? null : gl.getExtension('EXT_disjoint_timer_query_webgl2');

    function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    function prog(vs, fs) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      p.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); p.u[a.name] = gl.getUniformLocation(p, a.name); }
      return p; }
    let unit = 0, depthH = 1e5; const WET0 = new Float32Array(16);   // depthH = 水深（深い海は 1e5 m）
    function use(p) { gl.useProgram(p); unit = 0; return p; }
    function set(p, name, v) { const l = p.u[name]; if (l == null) return;
      if (v instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(l, unit++); }
      else if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2fv(l, v); else if (v.length === 3) gl.uniform3fv(l, v); else if (v.length === 4) gl.uniform4fv(l, v); else if (v.length === 16) gl.uniformMatrix4fv(l, false, v); }
    function setAll(p, o) { for (const k in o) set(p, k, o[k]); }
    function tex(w, h, ifmt, filter, mip) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, mip ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1, ifmt, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      if (mip && aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      return t; }
    function fbo(ts) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      ts.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
      gl.drawBuffers(ts.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error(L('framebuffer が作れません', 'cannot create a framebuffer'));
      return f; }

    const S = window.WGsh;
    const pSpec = prog(S.VS_FULL, S.FS_SPEC), pFFT = prog(S.VS_FULL, S.FS_FFT), pAsm = prog(S.VS_FULL, S.FS_ASM);
    const pSkyT = prog(S.VS_FULL, S.FS_SKYTEX), pSky = prog(S.VS_FULL, S.FS_SKY), pWater = prog(S.VS_WATER, S.FS_WATER), pMesh = prog(S.VS_MESH, S.FS_MESH), pGlobe = prog(S.VS_FULL, S.FS_GLOBE), pCopy = prog(S.VS_FULL, S.FS_COPY);
    // 物があるとき: 空と物を先に画面の外の絵（色＋深さ）に描き、海を描くときに読む（水の下の物を水ごしに見せる）
    let bgW = 0, bgH = 0, bgColor = null, bgDepth = null, bgF = null;
    function ensureBg(w, h) { if (w === bgW && h === bgH) return; if (bgF) { gl.deleteFramebuffer(bgF); gl.deleteTexture(bgColor); gl.deleteTexture(bgDepth); }
      bgColor = tex(w, h, gl.RGBA8, gl.LINEAR, false); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      bgDepth = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, bgDepth); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      bgF = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, bgF); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bgColor, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, bgDepth, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); bgW = w; bgH = h; }
    const emptyVAO = gl.createVertexArray();
    const PP = [0, 1].map(() => { const a = tex(N, N, gl.RGBA32F, gl.NEAREST, false), b = tex(N, N, gl.RGBA32F, gl.NEAREST, false); return { a, b, f: fbo([a, b]) }; });
    CASC.forEach((c, ci) => {
      c.h0 = tex(N, N, gl.RGBA32F, gl.NEAREST, false);
      c.disp = tex(N, N, gl.RGBA16F, gl.LINEAR, true);
      c.slope = [tex(N, N, gl.RGBA16F, gl.LINEAR, true), tex(N, N, gl.RGBA16F, gl.LINEAR, true)];
      c.mom = tex(N, N, gl.RGBA16F, gl.LINEAR, true);   // 傾きの 2 乗（LEAN）
      c.f = [fbo([c.disp, c.slope[0], c.mom]), fbo([c.disp, c.slope[1], c.mom])];
      // 波ごとの乱数（ずっと同じ。育っても同じ海の模様のまま大きくなる）
      let seed = 1234 + ci * 77; const r = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      c.xi = new Float32Array(N * N * 2);
      for (let i = 0; i < N * N; i++) { const u = Math.max(r(), 1e-9), v = r(), m = Math.sqrt(-2 * Math.log(u));
        c.xi[2 * i] = m * Math.cos(2 * Math.PI * v); c.xi[2 * i + 1] = m * Math.sin(2 * Math.PI * v); }
    });
    const elevTex = tex(360, 181, gl.R32F, gl.NEAREST, false); let elevSet = false;   // 地球儀の陸の高さ
    const bigTex = tex(4096, 1, gl.RGBA32F, gl.NEAREST, false), bigBuf = new Float32Array(4096 * 4);   // ミラーの惑星の水面
    const skyTex = tex(SKW, SKH, gl.RGBA16F, gl.LINEAR, true);
    gl.bindTexture(gl.TEXTURE_2D, skyTex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const skyF = fbo([skyTex]);

    // ---- 白波の泡の地図（web-ocean の作り方）: カメラのまわり 128 m と 1 km、世界に固定（端はつながっている）。2 枚を交互に読み書き ----
    // 近く 128 m は 1024 画素（12.5 cm ごと）、遠く 1 km は 512 画素（2 m ごと）。端末の自動判定が「高」でない（スマホ・タブレット・ソフトの GPU）ときは、どちらも半分の画素
    const small = autoQuality() !== 'high', FLEV = [128, 1024];
    const FW = [[128, small ? 512 : 1024, 1], [1024, small ? 256 : 512, 2]].map(([size, res, every]) => { const t = [0, 1].map(() => tex(res, res, gl.RGBA16F, gl.LINEAR, true));
      return { size, res, every, ts: size / res, t, cur: 0, acc: 0, f: t.map(x => fbo([x])), top: t.map(x => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, x, Math.log2(res)); return f; }), snap: null, mean: 0, thr: 0.8, dr: [0, 0] }; });   // top = 1×1 のミップ（白く見える泡の割合を読む）
    let foamFrame = 0;
    // 泡の模様（泡の地図をはじめて使うときに 1 回だけ作る。ソフトの GPU では重いので作らない）
    const foamTex = tex(512, 512, gl.RGBA8, gl.LINEAR, true); let foamTexDone = false, pFoamU = null;
    // 模様の値 pat（FS_WATER と同じ .78 r + .22 g、2 つは別の場所）が x より大きい割合 P(pat > x) の表（256）。遠くで模様がぼけたときの泡の白さの期待値に使う
    const cdfTex = tex(256, 1, gl.R16F, gl.LINEAR, false); gl.bindTexture(gl.TEXTURE_2D, cdfTex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    function foamInit() { if (foamTexDone) return; foamTexDone = true; pFoamU = prog(S.VS_FULL, S.FS_FOAMUPD);
      const f = fbo([foamTex]); gl.viewport(0, 0, 512, 512); gl.useProgram(prog(S.VS_FULL, S.FS_FOAMTEX)); gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Uint8Array(512 * 512 * 4); gl.readPixels(0, 0, 512, 512, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); gl.bindTexture(gl.TEXTURE_2D, foamTex); gl.generateMipmap(gl.TEXTURE_2D);
      const h = new Float64Array(256); let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647, M = 400000;
      for (let i = 0; i < M; i++) { const a = Math.floor(rnd() * 262144), b = Math.floor(rnd() * 262144), v = (px[4 * a] * 0.78 + px[4 * b + 1] * 0.22) / 255; h[Math.min(255, Math.floor(v * 256))]++; }
      const sv = new Float32Array(256); let acc = M; for (let i = 0; i < 256; i++) { sv[i] = acc / M; acc -= h[i]; }   // sv[i] = P(pat ≥ i/256)
      gl.bindTexture(gl.TEXTURE_2D, cdfTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RED, gl.FLOAT, sv); }

    const grids = {};
    function grid([GX, GY]) { const key = GX + 'x' + GY; if (grids[key]) return grids[key];
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const v = new Float32Array(GX * GY * 2); let k = 0;
      for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) { v[k++] = i / (GX - 1); v[k++] = j / (GY - 1); }
      const idx = new Uint32Array((GX - 1) * (GY - 1) * 6); k = 0;
      for (let j = 0; j < GY - 1; j++) for (let i = 0; i < GX - 1; i++) { const a = j * GX + i; idx.set([a, a + 1, a + GX, a + 1, a + GX + 1, a + GX], k); k += 6; }
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pWater, 'aG'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      vao.count = idx.length; gl.bindVertexArray(null); return grids[key] = vao; }
    // 画質（はじめは端末から決める。js/app.js の自動で下げることもある）
    let qName = 'high', Q = QUALITY.high;
    function setQuality(name) { if (!QUALITY[name]) return; const was = Q; qName = name; Q = QUALITY[name]; skyDirty = true;
      if (Q.foam > 0 && !isSoft) { foamInit(); if (was.foam === 0) FW.forEach(w => { w.snap = null; w.acc = 0; }); } }   // 泡の模様は選んだときに作る（はじめて描くコマで止まらないように）。地図なしから戻したら古い泡を使わない
    // 端末から: ソフトの GPU は「低」、スマホ・タブレット（タッチだけで画面が小さい、またはスマホの GPU の名前）は「中」、ほかは「高」
    function autoQuality() { if (isSoft) return 'low';
      const iPad = /mac/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1;   // iPad は Mac と名のる
      const mobileGPU = /adreno|mali|powervr|apple gpu|sgx|tegra|videocore|immortalis|xclipse/i.test(renderer) && (!/mac/i.test(navigator.platform || '') || iPad);
      const touchSmall = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
      return mobileGPU || touchSmall ? 'mid' : 'high'; }

    // ---- 物（人・船など）: 頂点 [x,y,z, nx,ny,nz, r,g,b, つや,濡れやすさ,0] の並び ----
    function makeMesh(data) {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      [['aP', 0], ['aN', 3], ['aC', 6], ['aM', 9]].forEach(([n, o]) => { const l = gl.getAttribLocation(pMesh, n); if (l < 0) return; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 48, o * 4); });
      gl.bindVertexArray(null); return { vao, count: data.length / 12 };
    }

    // ---- 海面の点の動きを読む（16 点まで） ----
    // points = [{x, z, wc}]（wc: 小さいさざ波を入れる割合。浮き台は大きいので 0、ブイは 1）
    // GPU を待たないように、PBO に読ませて fence が終わったら受け取る（1〜2 コマおくれ。同時に 1 つだけ）
    const pProbe = prog(S.VS_FULL, S.FS_PROBE), MAXP = 16;
    const probeTex = tex(MAXP, 2, gl.RGBA32F, gl.NEAREST, false), probeF = fbo([probeTex]);
    const probeBuf = new Float32Array(MAXP * 2 * 4), probeP = new Float32Array(MAXP * 2), probeW = new Float32Array(MAXP), probeB = new Float32Array(MAXP);
    const pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, probeBuf.byteLength, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    let probeOut = [], pending = null;
    // 白波の割合を観測に合わせる（Monahan & O'Muircheartaigh 1980: W = 3.84e−6 U^3.41）。泡の地図ごとに白く見える泡の平均（1×1 のミップ）を読み、泡が生まれる境目 thr を少しずつ動かす
    // 泡が生まれる境目 thr（地図ごと。粗い 1 km の地図は短い波のつぶれがならされるので、同じ境目では泡が少なすぎる）: 海面のうち、いちばん押し縮められた所（J が小さい所）から順に、観測の割合ぶんが白波になるように合わせる（線形の波の重ね合わせは本物ほど折れないので、J < 0.7 のような「折れかけ」だけでは 20 m/s でも 0.1% に届かない。2026-10-22 測った）。
    // 上限 1（縮んでいない面には作らない）。届かないときは届かないまま = foamShort
    // 泡の作り方の案（2026-10-22 ユーザーと見くらべる）: A = web-ocean のとおり（波の横の動きを 1.25 倍 = choppiness。線形の波より山がとがる・物理を少し曲げる。3 枚のつぶれ・境目 0.68 で固定・じわっと gain 2・画素ごとの波頭の泡。量は観測と合わない）、
    // B = あいだ（A の形のまま（1.25 倍もそのまま）、境目を 0.6〜0.9 の中だけでゆっくり動かして量を観測に近づける）、C = 前の版（大・中だけ・くっきり gain 20・境目を 0.05〜1 で動かして量を観測に合わせる）
    const FOAM_MODES = [{ cOn: 1, gain: 2, fixed: true, thr: 0.68, lam: 1.25 }, { cOn: 1, gain: 2, lo: 0.6, hi: 0.9, rate: 0.5, lam: 1.25 }, { cOn: 0, gain: 20, lo: 0.05, hi: 1, rate: 1 }];
    let foamMode = 1;
    function setFoamMode(m) { if (!FOAM_MODES[m] || m === foamMode) return; foamMode = m; FW.forEach(w => { w.snap = null; w.thr = FOAM_MODES[m].fixed ? FOAM_MODES[m].thr : Math.min(FOAM_MODES[m].hi, Math.max(FOAM_MODES[m].lo, 0.7)); }); foamShort = false; }   // 切りかえたら地図をはじめから
    let foamTarget = 0, foamPend = null, foamTick = 0, foamLev = 0, foamShort = false; const foamBuf = new Float32Array(4), foamLastT = [0, 0];
    const foamPbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, foamPbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, 16, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    function foamControl() {
      if (foamPend) { const r = gl.clientWaitSync(foamPend, 0, 0);
        if (r === gl.ALREADY_SIGNALED || r === gl.CONDITION_SATISFIED) { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, foamPbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, foamBuf); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
          gl.deleteSync(foamPend); foamPend = null; const w = FW[foamLev]; w.mean = foamBuf[3];   // 泡の面積の割合（絵と同じ式で数えた値）
          // 合わせる速さは 1 秒あたり（コマの速さによらない）。泡は数秒かけて消えるので、ゆっくり。128 m の地図は波群（カメラの下が山か谷か）でゆれるので、もっとゆっくり
          const now = performance.now() / 1000, el = Math.min(1, now - (foamLastT[foamLev] || now)); foamLastT[foamLev] = now;
          const err = Math.log(foamTarget + 2e-4) - Math.log(w.mean + 2e-4), FM = FOAM_MODES[foamMode];
          w.thr = FM.fixed ? FM.thr : Math.min(FM.hi, Math.max(FM.lo, w.thr * Math.exp((foamLev ? 0.09 : 0.03) * FM.rate * el * Math.max(-1, Math.min(1, err)))));
          if (foamLev === 1) foamShort = !FM.fixed && (foamShort ? !(w.mean > foamTarget * 0.8 || w.thr < FM.hi - 0.02) : w.thr >= FM.hi - 0.001 && w.mean < foamTarget * 0.6);   // 届かないかは 1 km の地図で、出す・消すに差をつけて
          foamLev = 1 - foamLev; } return; }
      if (++foamTick % 10) return;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, FW[foamLev].top[FW[foamLev].cur]); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, foamPbo); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); foamPend = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();   // すぐ送り出す（送り出さないと確認が返らないことがある）
    }
    // 泡の地図を進める: dt 秒の消え方、風下へ流れる drift（風速の 3%。web-ocean の値）
    function foamUpdate(dt, simT, pos, U, windA) {
      use(pFoamU); const dr = 0.03 * U; foamFrame++;
      // 更新は 1/30 秒ごと（画面の速さによらず同じ減り方。RGBA16F の 1 目盛りに対して 1 回の減りを大きくして、まるめのずれを小さく）。中は 1/15 秒、遠くの地図はその倍
      for (const w of FW) { w.acc += dt; if (w.acc < (Q.foam === 1 ? 2 : 1) * w.every / 30) continue;
        const cx = Math.floor(pos[0] / w.ts), cz = Math.floor(pos[2] / w.ts), pv = w.snap || [cx + 100000, cz + 100000], st = Math.min(w.acc, 0.2); w.snap = [cx, cz]; w.acc = 0; w.cur = 1 - w.cur;
        // 風下へ流れる分はためておき、地図の 1 画素ずつずらす（毎回ずらして読みなおすと、にじみが重なる）
        w.dr[0] += Math.cos(windA) * dr * st; w.dr[1] += Math.sin(windA) * dr * st; const sx = Math.trunc(w.dr[0] / w.ts), sz = Math.trunc(w.dr[1] / w.ts); w.dr[0] -= sx * w.ts; w.dr[1] -= sz * w.ts;
        gl.bindFramebuffer(gl.FRAMEBUFFER, w.f[w.cur]); gl.viewport(0, 0, w.res, w.res); unit = 0;
        setAll(pFoamU, { prev: w.t[1 - w.cur], sA: CASC[0].slope[cur], sB: CASC[1].slope[cur], sC: CASC[2].slope[cur], mA: CASC[0].mom, mB: CASC[1].mom, mC: CASC[2].mom, Ls: LS3,
          RES: w.res, ts: w.ts, dt: st, decayR: 0.22, thr: w.thr, gain: FOAM_MODES[foamMode].gain, growth: 1, cOn: FOAM_MODES[foamMode].cOn, fTex: foamTex, time: simT % LOOP, windA });
        gl.uniform4i(pFoamU.u.snap, cx, cz, pv[0], pv[1]); gl.uniform2i(pFoamU.u.shift, sx, sz); full();
        gl.bindTexture(gl.TEXTURE_2D, w.t[w.cur]); gl.generateMipmap(gl.TEXTURE_2D); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function runProbe(points) {
      if (pending && ++pending.age % 4 === 0) {   // 確かめるのは 4 コマに 1 回（問い合わせも GPU を待たせるため）
        const r = gl.clientWaitSync(pending.fence, 0, 0);
        if (r === gl.ALREADY_SIGNALED || r === gl.CONDITION_SATISFIED) {
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, probeBuf); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
          gl.deleteSync(pending.fence);
          probeOut = []; for (let i = 0; i < pending.n; i++) { const a = 4 * i, b = 4 * (MAXP + i);
            probeOut.push({ d: [probeBuf[a], probeBuf[a + 1], probeBuf[a + 2]], s: [probeBuf[b], probeBuf[b + 1]] }); }
          pending = null;
        }
      }
      const n = Math.min(points.length, MAXP); if (!n) { probeOut = []; return; }
      if (pending) return;
      for (let i = 0; i < n; i++) { probeP[2 * i] = points[i].x; probeP[2 * i + 1] = points[i].z; probeW[i] = points[i].wc; probeB[i] = points[i].wb == null ? 1 : points[i].wb; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, probeF); gl.viewport(0, 0, MAXP, 2); use(pProbe);
      gl.uniform2fv(pProbe.u['P[0]'], probeP); gl.uniform1fv(pProbe.u['WC[0]'], probeW); gl.uniform1fv(pProbe.u['WB[0]'], probeB);
      setAll(pProbe, { Ls: LS3, dA: CASC[0].disp, dB: CASC[1].disp, dC: CASC[2].disp, sA: CASC[0].slope[cur], sB: CASC[1].slope[cur], sC: CASC[2].slope[cur] }); full();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.readPixels(0, 0, MAXP, 2, gl.RGBA, gl.FLOAT, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      pending = { fence: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), n, age: 0 }; gl.flush();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // ---- 海の分布を GPU へ（波の高さ・周期・向きが変わったとき） ----
    let fftVar = 0, fftSlope = 0, fftSlopeD = 0;   // fftSlopeD = 4 枚めの傾きの分散（画質が「高」のときだけ描いた分に入れる）   // FFT の海面に入った分の分散と、傾きの分散（受け持ちの外の波は入らない）
    function setSea(Hm0, Tp, windAng, U = 0) { setSpec(Hm0 > 0 ? window.WGgrowth.makeSpecK(Hm0, Tp, windAng, 10, U) : null); }   // U = いまの風（短い波が風で変わる）
    function setSpec(SK) {   // SK(kx, kz) = 波数の面の密度（null = 波なし）
      fftVar = 0; fftSlope = 0; fftSlopeD = 0; const Hm0 = SK ? 1 : 0;
      CASC.forEach((c, ci) => {
        const dk = 2 * Math.PI / c.L, amp = new Float32Array(N * N), d = new Float32Array(N * N * 4);
        if (Hm0 > 0) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const n = i < N / 2 ? i : i - N, m = j < N / 2 ? j : j - N, kx = n * dk, kz = m * dk, k = Math.hypot(kx, kz);
          // 振れ幅は √(S dk²/4): h0(k) と h0(−k) の共役を足し、乱数（複素数）の大きさの 2 乗の期待値も 2 なので（2026-10-21 確かめ直しで /2 → /4。前は高さが √2 倍だった）
          if (k >= c.kmin && k < c.kmax && (ci < 3 || Q.casc4)) { const s = SK(kx, kz); amp[j * N + i] = Math.sqrt(s * dk * dk / 4); fftVar += s * dk * dk; if (ci === 3) fftSlopeD += k * k * s * dk * dk; else fftSlope += k * k * s * dk * dk; } }
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const a = j * N + i, b = ((N - j) % N) * N + (N - i) % N;
          d[4 * a] = amp[a] * c.xi[2 * a]; d[4 * a + 1] = amp[a] * c.xi[2 * a + 1];
          d[4 * a + 2] = amp[b] * c.xi[2 * b]; d[4 * a + 3] = -amp[b] * c.xi[2 * b + 1]; }
        gl.bindTexture(gl.TEXTURE_2D, c.h0); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.FLOAT, d);
      });
    }

    // 真上の空の明るさ（シェーダーの atmo と同じ式。雲を照らす空の光）
    function atmoUp(el, sunI) {
      const Re = 6360e3, Ra = 6420e3, bR = [5.8e-6, 13.5e-6, 33.1e-6], bM = 21e-6, L = [Math.cos(el), Math.sin(el)];
      const mu = L[1], pr = .0596831 * (1 + mu * mu), g = .76, pm = .1193662 * ((1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
      const seg = (Ra - Re - 10) / 16; let oR = 0, oM = 0; const sR = [0, 0, 0], sM = [0, 0, 0];
      for (let i = 0; i < 16; i++) {
        const y = Re + 10 + seg * (i + .5), h = y - Re, hr = Math.exp(-h / 7994) * seg, hm = Math.exp(-h / 1200) * seg; oR += hr; oM += hm;
        const b = y * L[1], tl = -b + Math.sqrt(b * b - y * y + Ra * Ra), sl = tl / 8; let lR = 0, lM = 0;
        for (let j = 0; j < 8; j++) { const qx = L[0] * sl * (j + .5), qy = y + L[1] * sl * (j + .5), hh = Math.max(Math.hypot(qx, qy) - Re, 0);
          lR += Math.exp(-hh / 7994) * sl; lM += Math.exp(-hh / 1200) * sl; }
        for (let c = 0; c < 3; c++) { const at = Math.exp(-(bR[c] * (oR + lR) + bM * 1.1 * (oM + lM))); sR[c] += at * hr; sM[c] += at * hm; } }
      return [0, 1, 2].map(c => sunI * (sR[c] * bR[c] * pr + sM[c] * bM * pm)); }
    function sunTrans(el) {
      const Re = 6360e3, Ra = 6420e3, o = [0, Re + 10], d = [Math.cos(el), Math.sin(el)];
      const b = o[0] * d[0] + o[1] * d[1], c = o[0] * o[0] + o[1] * o[1] - Ra * Ra, t = -b + Math.sqrt(b * b - c), n = 64, s = t / n;
      let oR = 0, oM = 0;
      for (let i = 0; i < n; i++) { const x = o[0] + d[0] * s * (i + .5), y = o[1] + d[1] * s * (i + .5), h = Math.max(Math.hypot(x, y) - Re, 0);
        oR += Math.exp(-h / 7994) * s; oM += Math.exp(-h / 1200) * s; }
      return [5.8e-6, 13.5e-6, 33.1e-6].map(bR => Math.exp(-(bR * oR + 21e-6 * 1.1 * oM))); }

    function full() { gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    let cur = 0, frameNo = 0, skyDirty = true, cloudOff = [0, 0], gpuMs = 0, lastVP = null, lastTxTy = [1, 1]; const tqs = [];
    // 段階ごとの GPU の時間（prof = true のとき。問い合わせは入れ子にできないので、そのときは全体の計測をやめて段階の和にする）
    // 段階: fft = 海面の FFT、foam = 泡の地図、probe = ブイなどの海面の読み出し、skytex = 空の絵の作りなおし（数コマに 1 回）、draw = 画面の空・物・海
    let prof = false; const stage = { fft: 0, foam: 0, probe: 0, skytex: 0, draw: 0 }, sq = []; let sOpen = null;
    function tB(name) { if (!prof || !tq) return; tE(); if (sq.length > 64) return; const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); sOpen = { q, name }; }
    function tE() { if (!sOpen) return; gl.endQuery(tq.TIME_ELAPSED_EXT); sq.push(sOpen); sOpen = null; }
    function tPoll() { const bad = gl.getParameter(tq.GPU_DISJOINT_EXT);   // 1 コマに 1 回だけ読む（読むと消える）。乱れていたら、そこまでの結果は捨てる
      while (sq.length && gl.getQueryParameter(sq[0].q, gl.QUERY_RESULT_AVAILABLE)) { const { q, name } = sq.shift();
        if (!bad) stage[name] = stage[name] * 0.9 + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 * 0.1; gl.deleteQuery(q); } }

    // cam = { pos:[x,y,z], cf, cr, cu（向き・右・上の単位ベクトル）, fovY }
    // env = { L: 太陽の向き, Lm: 月の向き, moonI, dim（雲で直射が弱まる割合）, disc（太陽・月の円盤の見え方）, stars, cloud, cdark, expo, fogL, rough0, points, meshes }
    function frame(dt, simT, cam, env) {
      while (tq && tqs.length && gl.getQueryParameter(tqs[0], gl.QUERY_RESULT_AVAILABLE)) { const q = tqs.shift();
        if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) gpuMs = gpuMs * 0.9 + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 * 0.1; gl.deleteQuery(q); }
      let q = null; if (tq && !prof && tqs.length < 8) { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); }
      if (sOpen) { gl.endQuery(tq.TIME_ELAPSED_EXT); gl.deleteQuery(sOpen.q); sOpen = null; }   // 前のコマが途中で止まったときの開いたままの問い合わせ
      if (prof && tq) { tPoll(); gpuMs = stage.fft + stage.foam + stage.probe + stage.skytex + stage.draw; }
      const t = simT % LOOP;
      const W = cv.width, H = cv.height, ty = Math.tan(cam.fovY / 2), tx = ty * W / H;
      const { cf, cr, cu } = cam, P0 = cam.pos;
      const pos = P0;   // カメラは原点のまわりだけを回るので、位置を戻さなくてよい
      const big = env.big, glb = env.globe, n = glb ? Math.max(0.1, glb.alt * 2e-4) : big ? 0.5 : 0.1, f = glb ? Math.max(40000, glb.alt * 1.2 + 2.2 * glb.Re) : big ? 400000 : 40000, e = [-pos[0], -pos[1], -pos[2]];
      const V = [cr[0], cu[0], -cf[0], 0, cr[1], cu[1], -cf[1], 0, cr[2], cu[2], -cf[2], 0,
        cr[0] * e[0] + cr[1] * e[1] + cr[2] * e[2], cu[0] * e[0] + cu[1] * e[1] + cu[2] * e[2], -(cf[0] * e[0] + cf[1] * e[1] + cf[2] * e[2]), 1];
      const Pm = [1 / tx, 0, 0, 0, 0, 1 / ty, 0, 0, 0, 0, -(f + n) / (f - n), -1, 0, 0, -2 * f * n / (f - n), 0];
      const VP = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += Pm[k * 4 + r] * V[c * 4 + k]; VP[c * 4 + r] = s; }
      const horizonY = cu[1] > 1e-4 ? -cf[1] / (ty * cu[1]) : 2;
      // 太陽と月。水・物を照らす光は明るいほう（夜は月）
      const Ls = env.L, Lm = env.Lm, el = Math.asin(Ls[1]), elm = Math.asin(Lm[1]), sunI = 20, moonI = env.moonI || 0;
      const sunCs = sunTrans(Math.max(el, -0.05)).map(v => v * (el > -0.05 ? 1 : 0)), moonC = sunTrans(Math.max(elm, 0.01)).map(v => v * (elm > 0 ? 1 : 0));
      const useMoon = sunI * sunCs[1] * Math.max(el, 0.0) < moonI * moonC[1] * Math.max(elm, 0);
      const L = useMoon ? Lm : Ls, keyI = useMoon ? moonI : sunI, sunC = (useMoon ? moonC.map((v, i) => v * [0.85, 0.92, 1][i]) : sunCs).map(v => v * env.dim);
      // 月の円盤の明るさ（満月の円盤の平均の放射輝度 = 太陽の光 × 2.5×10⁻⁶ ÷ 月の見かけの大きさ 6.4×10⁻⁵ sr。夜は目が慣れた倍率 boost）
      const moonK = moonC.map((v, i) => v * [0.95, 0.97, 1][i] * sunI * 2.5e-6 / 6.4e-5 * (env.boost || 1));
      cloudOff[0] += dt * 6; cloudOff[1] += dt * 2;

      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      tB('fft');
      CASC.forEach((c, ci) => { if (ci === 3 && !Q.casc4) return;
        gl.viewport(0, 0, N, N);
        gl.bindFramebuffer(gl.FRAMEBUFFER, PP[0].f); use(pSpec); setAll(pSpec, { h0: c.h0, L: c.L, t, N, w0: W0, depth: depthH }); full();
        let src = 0; use(pFFT);
        for (const dir of [1, 0]) for (let sub = 2; sub <= N; sub *= 2) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, PP[1 - src].f); use(pFFT);
          setAll(pFFT, { A: PP[src].a, B: PP[src].b, N, sub }); gl.uniform1i(pFFT.u.hz, dir); full(); src = 1 - src; }
        gl.bindFramebuffer(gl.FRAMEBUFFER, c.f[cur]); use(pAsm);
        setAll(pAsm, { A: PP[src].a, B: PP[src].b, lam: FOAM_MODES[foamMode].lam || 1 }); full();   // 案 A・B は 1.25
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, c.disp); gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, c.slope[cur]); gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, c.mom); gl.generateMipmap(gl.TEXTURE_2D);
      });
      const foamOn = (env.foamK == null ? 1 : env.foamK) > 0;
      tB('foam'); const mapOn = foamOn && Q.foam > 0 && !isSoft;   // ソフトの GPU では割合を合わせる読み出しが重いので、泡の地図ごと止める
      if (mapOn) foamInit();
      if (mapOn) foamUpdate(dt, simT, P0, env.windU || 0, env.windA || 0);
      tB('probe'); runProbe(env.points || []); foamTarget = env.foamW || 0; if (!isSoft && mapOn) foamControl();
      // 空は 4 コマに 1 回（雲はゆっくり。太陽を動かした直後は毎回）
      tB('skytex');
      if (skyDirty || frameNo % Q.sky === 0) { skyDirty = false;
        gl.bindFramebuffer(gl.FRAMEBUFFER, skyF); gl.viewport(0, 0, SKW, SKH); use(pSkyT);
        setAll(pSkyT, { L: Ls, Lm, sunI, moonI, cover: env.cloud, cdark: env.cdark, cOff: cloudOff, ambU: atmoUp(el, sunI).map((v, i) => v + (moonI ? atmoUp(elm, moonI)[i] : 0)) }); full();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, skyTex); gl.generateMipmap(gl.TEXTURE_2D); }
      frameNo++;
      gl.viewport(0, 0, W, H);
      tB('draw');
      const space = glb && glb.alpha >= 0.999;   // 宇宙から: 海と空は描かない
      if (!space) {
      const hasMesh = env.meshes && env.meshes.length > 0;
      const wo = env.water || { KD: [0.35, 0.07, 0.03], KC: [0.40, 0.10, 0.06], deepC: [0.004, 0.028, 0.06] };   // 水の光（透明度）
      const cst = { cS1: CASC[1].slope[cur], cS2: CASC[2].slope[cur], cLs: LS3, cSun: Ls, KD: wo.KD, KC: wo.KC, deepC: wo.deepC };   // コースティクス・光芒（太陽の向き）・水の光
      const drawSky = () => { use(pSky); setAll(pSky, { cf, cr, cu, L, sunCu: sunC, Lsun: Ls, sunCd: sunCs, LmD: Lm, moonK, tx, ty, sunI: keyI, expo: env.expo, disc: env.disc, stars: env.stars, fogSky: Math.min(1, 600 / env.fogL), skyT: skyTex, under: env.under ? 1 : 0, camD: env.camD || 0, cam: pos, ...cst }); full(); };
      const drawMeshes = () => { use(pMesh); setAll(pMesh, { VP, cam: pos, L, sunCu: sunC, sunI: keyI, expo: env.expo, fogL: env.fogL, wetRain: env.wetRain || 0, wetSplash: env.wetSplash || 0, skyT: skyTex, under: env.under ? 1 : 0, camD: env.camD || 0, ...cst });
        const wl = pMesh.u['wetP[0]'];
        for (const m of env.meshes) { set(pMesh, 'M', m.M); if (wl) gl.uniform1fv(wl, m.wet || WET0); gl.bindVertexArray(m.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, m.mesh.count); } gl.bindVertexArray(null); };
      if (hasMesh) {   // 空と物 → 画面の外の絵 → 画面へ写す
        ensureBg(W, H); gl.bindFramebuffer(gl.FRAMEBUFFER, bgF); gl.viewport(0, 0, W, H); gl.disable(gl.DEPTH_TEST); drawSky();
        gl.enable(gl.DEPTH_TEST); gl.clear(gl.DEPTH_BUFFER_BIT); drawMeshes(); gl.disable(gl.DEPTH_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); use(pCopy); setAll(pCopy, { T: bgColor }); full();
      } else drawSky();
      gl.enable(gl.DEPTH_TEST); gl.clear(gl.DEPTH_BUFFER_BIT);
      if (big) { for (let i = 0; i < 4096; i++) { bigBuf[4 * i] = big.eta[i]; bigBuf[4 * i + 1] = big.slope[i]; bigBuf[4 * i + 2] = big.depth[i]; bigBuf[4 * i + 3] = big.foam ? big.foam[i] : 0; }
        gl.bindTexture(gl.TEXTURE_2D, bigTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4096, 1, gl.RGBA, gl.FLOAT, bigBuf); }
      use(pWater);
      // 網目を投げる平面（planeY）はいつもカメラの向こう側（水の中なら上、水の上なら下）
      setAll(pWater, { cam: pos, cf, cr, cu, Ls: LS3, tx, ty, gx: env.wideGrid ? 2.6 : 1.6, y0: env.under ? Math.max(-1.2, horizonY - 0.15) : env.wideGrid ? -5.0 : -3.0, y1: env.under ? 3.0 : Math.min(horizonY + (big ? 0.4 : 0.12), 1.2), under: env.under ? 1 : 0, camD: env.camD || 0,
        far: env.far || (big ? 300000 : 30000), planeY: env.under ? Math.max(big ? big.planeY : 0, pos[1] + 0.5) : Math.min(big ? big.planeY : 0, pos[1] - 0.5), bigOn: big ? 1 : 0, bigL: big ? big.L : 1, bigX0: big ? big.x0 : 0, bigWrap: big && big.noWrap ? 0 : 1, curvR: big ? big.R : env.curvR || 1e9, bigT: bigTex,
        pixA: 2 * ty / H, VP, L, sunCu: sunC, sunI: keyI, expo: env.expo, fogL: env.fogL, sss: 1, rough0: env.rough0, disc: env.disc, fogH: env.fogH || 0, windU: env.windU || 0, windA: env.windA || 0, foamK: env.foamK == null ? 1 : env.foamK, foamW: mapOn ? FW[1].mean : 0, fMap: mapOn ? 1 : 0, thrR: FW[0].thr - 0.2, frOn: mapOn && FOAM_MODES[foamMode].cOn ? 1 : 0, fCdf: cdfTex, pixF: 2 * ty / H, LsD: CASC[3].L, dOn: Q.casc4 ? 1 : 0, time: t, dbg: window.__wgDbg || 0, fL: FLEV, fW0: FW[0].t[FW[0].cur], fW1: FW[1].t[FW[1].cur], fTex: foamTex, skyT: skyTex, cfw: cf, hasBg: hasMesh ? 1 : 0, nearP: n, farP: f, vpS: [W, H], bgC: hasMesh ? bgColor : skyTex, bgD: hasMesh ? bgDepth : skyTex, ...cst,
        dA: CASC[0].disp, dB: CASC[1].disp, dC: CASC[2].disp, sA: CASC[0].slope[cur], sB: CASC[1].slope[cur], sC: CASC[2].slope[cur], mA: CASC[0].mom, mB: CASC[1].mom, mC: CASC[2].mom, sD: CASC[3].slope[cur], mD: CASC[3].mom });
      const gv = grid(Q.grid); gl.bindVertexArray(gv); gl.drawElements(gl.TRIANGLES, gv.count, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null);
      }
      if (glb && glb.alpha > 0) {   // 地球儀（重ねる）
        if (!elevSet && glb.elev) { gl.bindTexture(gl.TEXTURE_2D, elevTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 360, 181, gl.RED, gl.FLOAT, glb.elev); elevSet = true; }
        gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        use(pGlobe); setAll(pGlobe, { cf, cr, cu, cam: pos, L: Ls, tx, ty, Re: glb.Re, alpha: glb.alpha, elevT: elevTex }); gl.uniformMatrix3fv(pGlobe.u.M, false, glb.M); full();
        gl.disable(gl.BLEND);
      }
      lastVP = VP; lastTxTy = [tx, ty];
      cur = 1 - cur;
      tE(); if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); tqs.push(q); }
    }
    return { isSoft, QUALITY, setQuality, setFoamMode, get foamMode() { return foamMode; }, autoQuality, get quality() { return qName; }, get Q() { return Q; },
      get prof() { return prof; }, set prof(v) { prof = !!v && !!tq; }, get stage() { return stage; }, setSea, setSpec, setDepth(h) { depthH = isFinite(h) ? h : 1e5; }, frame, makeMesh, get probe() { return probeOut; }, get VP() { return lastVP; }, get txty() { return lastTxTy; }, skyChanged() { skyDirty = true; }, get gpuMs() { return gpuMs; }, get fftHs() { return 4 * Math.sqrt(fftVar); }, get fftSlope() { return fftSlope + (Q.casc4 ? fftSlopeD : 0); }, get foam() { return { thr: FW.map(w => +w.thr.toFixed(3)), short: foamShort && qName !== 'low', on: Q.foam > 0 && !isSoft, mean: FW.map(w => w.mean), target: foamTarget, res: FW.map(w => w.res) }; },
      // 調べ用: 描いている海面（3 枚の FFT の高さ）の分散 → 有義波高。分布の式から出す値（fftHs）とくらべる
      debugSea() { let tot = 0; const per = []; CASC.forEach(c => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, c.disp, 0); const b = new Float32Array(N * N * 4); gl.readPixels(0, 0, N, N, gl.RGBA, gl.FLOAT, b);
          let m = 0, v = 0; for (let i = 0; i < N * N; i++) m += b[4 * i + 1]; m /= N * N; for (let i = 0; i < N * N; i++) v += (b[4 * i + 1] - m) ** 2; v /= N * N;
          gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); per.push(+(4 * Math.sqrt(v)).toFixed(3)); tot += v; });
        return { HsGPU: 4 * Math.sqrt(tot), HsSpectrum: 4 * Math.sqrt(fftVar), perCascade: per }; },
      // 調べ用: 泡の地図ぜんぶの平均（白く見える泡の割合 a・泡の量 r）と、1×1 のミップ
      debugFoam(px, pz, rad) { return FW.map(w => { const R = w.res, n = R * R; gl.bindFramebuffer(gl.FRAMEBUFFER, w.f[w.cur]); const b = new Float32Array(n * 4); gl.readPixels(0, 0, R, R, gl.RGBA, gl.FLOAT, b);
        let a = 0, r = 0, jMin = 9, jMax = -9; for (let i = 0; i < n; i++) { a += b[4 * i + 3]; r += b[4 * i]; jMin = Math.min(jMin, b[4 * i + 2]); jMax = Math.max(jMax, b[4 * i + 2]); }
        let aw = 0, nw = 0; if (rad) { const k = Math.round(rad / w.ts), gx = Math.floor(px / w.ts), gz = Math.floor(pz / w.ts);   // カメラのまわり ±rad m だけ（画面とくらべる）
          for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) { const ix = ((gx + dx) % R + R) % R, iz = ((gz + dz) % R + R) % R; aw += b[4 * (iz * R + ix) + 3]; nw++; } }
        gl.bindFramebuffer(gl.FRAMEBUFFER, w.top[w.cur]); const m = new Float32Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, m); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { size: w.size, meanA: a / n, meanWin: nw ? aw / nw : null, meanR: r / n, jMin, jMax, mip: Array.from(m), thr: w.thr }; }); } };
  }
  return { create, LOOP };
})();
