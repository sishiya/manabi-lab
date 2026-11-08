// 雲ができるまで — 断面の描画（WebGL2）と、目盛り（2D の重ね）
'use strict';
(function (G) {
  const VS = `#version 300 es
in vec2 p; out vec2 v; void main(){ v=p*0.5+0.5; gl_Position=vec4(p,0.,1.); }`;
  const FS = `#version 300 es
precision highp float; in vec2 v; out vec4 o;
uniform sampler2D A,B; uniform vec2 uvMin,uvMax,texSize; uniform float Lz,z0,viewDepth; uniform int mode; uniform vec3 hill; uniform float Lx;
const float LV=1500.0;
// 格子のカクカクを出さない補間（4点の B スプライン）。値は計算の結果のまま、なめらかにつなぐだけ
vec4 texBS(sampler2D t,vec2 uv){
  vec2 st=uv*texSize-.5,f=fract(st),i=st-f;
  vec2 w0=f*(f*(-f+3.)-3.)+1.,w1=f*f*(3.*f-6.)+4.,w2=f*(f*(-3.*f+3.)+3.)+1.,w3=f*f*f;
  vec2 g0=w0+w1,g1=w2+w3,h0=w1/g0-1.,h1=w3/g1+1.;
  vec2 p0=(i+h0+.5)/texSize,p1=(i+h1+.5)/texSize;
  return (g0.y*(g0.x*texture(t,p0)+g1.x*texture(t,vec2(p1.x,p0.y)))+g1.y*(g0.x*texture(t,vec2(p0.x,p1.y))+g1.x*texture(t,p1)))/36.;
}
float rhoAt(float z){ return 1.2*exp(-z/8500.); }
// 消散（1/m）: 有効半径 水 10µm・氷 40µm
float extOf(vec4 a,float rho){ return 1.5*rho*a.r*(a.b/(1000.*10e-6)+(1.-a.b)/(917.*40e-6)); }
vec3 sky(float z){ float t=clamp(z/16000.,0.,1.); return mix(vec3(.46,.66,.86),vec3(.05,.15,.34),pow(t,.75)); }
vec3 div(float x){ // 青−白−赤の差の色
  x=clamp(x,-1.,1.); vec3 n=vec3(.09,.13,.2); return x>0.?mix(n,vec3(.98,.42,.25),x):mix(n,vec3(.3,.7,1.),-x); }
void main(){
  vec2 uv=mix(uvMin,uvMax,v);
  float z=z0+uv.y*Lz, rho=rhoAt(z);
  vec4 a=texBS(A,uv), b=texBS(B,uv);
  vec3 c;
  float ext=extOf(a,rho);
  float cloudA=1.-exp(-ext*viewDepth);
  if(mode==0){
    c=sky(z);
    // 太陽の方向へ たどって 影を計算（2次元）
    float tau=0.; vec2 st=vec2(-.0075,.015); float s=Lz*length(st.y);
    if(cloudA>.003){
      vec2 q=uv+st*.5;
      for(int i=0;i<20;i++){ if(q.y>1.)break; vec4 t=texture(A,q); tau+=extOf(t,rhoAt(z0+q.y*Lz))*s; q+=st; st*=1.12; s*=1.12; }
    }
    // 多重散乱の近似（強く弱まる光＋よく回りこむ光）
    float Tr=.35*exp(-tau*.45)+.65*exp(-tau*.035);
    vec3 cloud=mix(vec3(.30,.34,.44),vec3(1.,.985,.95),Tr);
    // 雨と雪（見た目は水の量から）
    float rainA=1.-exp(-a.g*(1.+0.)*900.*(viewDepth/LV));
    c=mix(c,mix(vec3(.5,.56,.66),vec3(.95),1.-b.a),rainA*.75);
    c=mix(c,cloud,cloudA);
  } else if(mode==1){
    c=div(b.r/ (Lz>4000.?12.:4.));
    float e=smoothstep(.15,.5,cloudA); c=mix(c,vec3(1.),e*.28);
  } else if(mode==2){
    c=div(b.g/4.);
    float e=smoothstep(.15,.5,cloudA); c=mix(c,vec3(1.),e*.22);
  } else {
    float rh=clamp(b.b,0.,1.); c=mix(vec3(.05,.08,.13),vec3(.1,.28,.5),rh*rh);
    float ql=1.-exp(-a.r*a.b*14000.), qi=1.-exp(-a.r*(1.-a.b)*50000.), qr=1.-exp(-a.g*b.a*5000.), qs=1.-exp(-a.g*(1.-b.a)*5000.);
    c=mix(c,vec3(.55,.92,1.),ql); c=mix(c,vec3(.8,.67,1.),qi); c=mix(c,vec3(.25,.55,1.),qr); c=mix(c,vec3(1.,1.,1.),qs*.9);
  }
  if(hill.x>0.){ float dx=(uv.x*Lx-hill.z)/hill.y; if(z-z0<hill.x/(1.+dx*dx)) c=vec3(.07,.11,.13); }  // 山の線（計算の中は格子の階段）
  o=vec4(pow(c,vec3(1./1.1)),1.);
}`;
  function make(cv, ov) {
    const gl = cv.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n);
    const tex = i => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    tex(0); tex(1); gl.uniform1i(U('A'), 0); gl.uniform1i(U('B'), 1);
    const g2 = ov.getContext('2d');
    const self = { meta: null, mode: 0, crop: [0, 1], bands: null, base: null, cloudBase: null };
    self.setMeta = m => {
      self.meta = m;
      gl.uniform1f(U('Lz'), m.Lz); gl.uniform1f(U('z0'), m.z0);
      gl.uniform1f(U('viewDepth'), m.viewDepth || Math.min(250, m.dx * 3));
      gl.uniform2f(U('texSize'), m.nx, m.nz);
      gl.uniform1f(U('Lx'), m.Lx);
      const hl = m.terrain; gl.uniform3f(U('hill'), hl ? hl.h : 0, hl ? hl.a : 1, hl ? hl.x0 : 0);
      self.layout();
    };
    self.layout = () => {
      if (!self.meta) return;
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1, Math.sqrt(1.3e6 / Math.max(1, r.width * r.height)));   // 1コマの重さに上限
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      for (const c of [cv, ov]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      gl.viewport(0, 0, w, h);
      const m = self.meta, want = r.width / r.height;
      // 幅いっぱいに出す。画面が狭いときは真ん中付近を切りぬく（高さの縮尺を保つため）
      const natural = 3;
      const fr = Math.min(1, want / natural), cx = m.cropCx === undefined ? 0.5 : m.cropCx;
      let lo = cx - fr / 2, hi = cx + fr / 2;
      self.crop = [lo, hi];
    };
    let texW = 0, texH = 0;
    self.setField = (A, B, nx, nz) => {
      const fresh = texW !== nx || texH !== nz; texW = nx; texH = nz;
      for (const [u, d] of [[0, A], [1, B]]) {
        gl.activeTexture(gl.TEXTURE0 + u);
        if (fresh) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, nx, nz, 0, gl.RGBA, gl.FLOAT, d);
        else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, nz, gl.RGBA, gl.FLOAT, d);
      }
    };
    self.draw = () => {
      if (!self.meta) return;
      gl.uniform1i(U('mode'), self.mode);
      gl.uniform2f(U('uvMin'), self.crop[0], 0); gl.uniform2f(U('uvMax'), self.crop[1], 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawOverlay();
    };
    function drawOverlay() {
      const m = self.meta, r = ov.getBoundingClientRect(), W = r.width, H = r.height, dpr = ov.width / Math.max(1, W);
      g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.clearRect(0, 0, W, H);
      g2.font = '11px "IBM Plex Mono",Consolas,monospace'; g2.textBaseline = 'middle';
      // 高さの目盛り
      const step = niceStep(m.Lz / 5);
      for (let z = Math.ceil(m.z0 / step) * step; z <= m.z0 + m.Lz; z += step) {
        const y = H * (1 - (z - m.z0) / m.Lz);
        g2.strokeStyle = 'rgba(255,255,255,.28)'; g2.beginPath(); g2.moveTo(0, y); g2.lineTo(7, y); g2.stroke();
        if (y > 12 && y < H - 8) { g2.fillStyle = 'rgba(255,255,255,.85)'; g2.textAlign = 'left'; g2.fillText(fmtH(z), 10, y); }
      }
      // 横のものさし
      const wKm = (self.crop[1] - self.crop[0]) * m.Lx, sb = niceStep(wKm / 4), px = sb / wKm * W;
      g2.strokeStyle = 'rgba(255,255,255,.85)'; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(W - 14 - px, H - 12); g2.lineTo(W - 14, H - 12); g2.stroke(); g2.lineWidth = 1;
      g2.textAlign = 'right'; g2.fillStyle = 'rgba(255,255,255,.9)'; g2.fillText(fmtH(sb), W - 14, H - 24);
      // 高さの拡大
      const ex = (wKm / m.Lz) / (W / H);
      if (ex > 1.2) { g2.textAlign = 'left'; g2.fillStyle = 'rgba(255,214,130,.95)'; g2.fillText(`高さを約 ${ex >= 10 ? Math.round(ex) : ex.toFixed(1)} 倍に拡大`, 10, H - 12); }
      // 前線の場面の名前
      if (self.bands) {
        const b = self.bands; let s = 0;
        g2.textAlign = 'center';
        const n = b.length;
        const xOf = j => ((j / n) - self.crop[0]) / (self.crop[1] - self.crop[0]) * W;
        for (let j = 1; j <= n; j++) if (j === n || b[j] !== b[s]) {
          if (b[s] && j - s >= 3) {
            const x0 = xOf(s), x1 = xOf(j);
            if (x1 > 0 && x0 < W) { g2.strokeStyle = 'rgba(255,255,255,.55)'; g2.beginPath(); g2.moveTo(x0 + 2, 14); g2.lineTo(x1 - 2, 14); g2.stroke(); g2.font = '12px "Zen Kaku Gothic New",sans-serif'; const tw = g2.measureText(b[s]).width; if (x1 - x0 > tw) { g2.fillStyle = '#fff'; g2.fillText(b[s], (Math.max(0, x0) + Math.min(W, x1)) / 2, 26); } g2.font = '11px "IBM Plex Mono",Consolas,monospace'; }
          }
          s = j;
        }
      }
    }
    self.toWorld = (cx, cy) => {
      const r = cv.getBoundingClientRect(), m = self.meta;
      const fx = (cx - r.left) / r.width, fz = 1 - (cy - r.top) / r.height;
      return { x: (self.crop[0] + fx * (self.crop[1] - self.crop[0])) * m.Lx, z: m.z0 + fz * m.Lz };
    };
    return self;
  }
  function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
  function fmtH(m) { return m >= 1000 ? (m / 1000).toFixed(m % 1000 ? 1 : 0) + ' km' : Math.round(m) + ' m'; }
  G.CV = { make };
})(globalThis);
