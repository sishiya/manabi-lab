'use strict';
if(!window.__wwGL) throw new Error("wifi-wave: WebGL2 の準備ができなかったので止める");   // gl.js が止まったとき
// ================= sensing: CSI of one small room (PLAN.md) =================
// The same FDTD as the main view, on its own small grid. A short Gaussian pulse on the
// 2.437 GHz carrier is sent from the router; the field at the receiver is written to a
// time-series texture every step (no readPixels per step), read back in blocks, and
// split into the 52 subcarriers of a 20 MHz channel by a DFT. CSI = Rx(f) / Tx(f).
const SN={W:800,H:500};                       // 6 m × 3.75 m, same shape as the main map (1.6:1)
const SUB=[];                                 // subcarrier index k = ±1..±26 (11a/g legacy LTF, as ESP32 LLTF)
for(let k=-26;k<=26;k++) if(k) SUB.push(k);
const SUB_DF=312.5e3, SF0=2.437e9;            // spacing, channel 6 centre
const NPROBE=16, REC_W=4096, PER_ROW=REC_W/NPROBE, MAXSTEP=49152, REC_H=MAXSTEP/PER_ROW;
const CHECK_ROWS=8;                           // read back every 8 rows = 2048 steps

const PROBE_FS=`#version 300 es
precision highp float; precision highp int;
uniform sampler2D uS; uniform ivec2 uPts[${NPROBE}];
out vec4 o;
void main(){ int i=int(gl_FragCoord.x)%${NPROBE}; o=vec4(texelFetch(uS,uPts[i],0).r,0.,0.,0.); }`;
// the whole room at 2.437 GHz from the same pulse: every cell sums u·e^{-jωn} (a DFT at one
// frequency) every ACC_EVERY steps. The pulse has nothing above ~2.6 GHz, so sampling every 50 ps
// (Nyquist 10 GHz) gives the same sum. Divided by the pulse's own sum, it is the steady wave a
// continuous 2.437 GHz source would make: a still map instead of a flash per measurement
const ACC_EVERY=4;
const ACC_FS=`#version 300 es
precision highp float;
uniform sampler2D uS; uniform sampler2D uA; uniform vec2 uCS;
out vec4 o;
void main(){ ivec2 p=ivec2(gl_FragCoord.xy); float u=texelFetch(uS,p,0).r; o=texelFetch(uA,p,0)+vec4(u*uCS.x,-u*uCS.y,0.,0.); }`;
// how the map is shown: 0 = the steady wave, turning slowly (uPh); 1 = stronger/weaker than the empty
// room, as |H|² averaged over half a wavelength (the nodes of the standing wave would be noise otherwise)
const SDISP_FS=`#version 300 es
precision highp float; precision highp int;
uniform sampler2D uA; uniform sampler2D uB; uniform sampler2D uM;
uniform vec2 uView; uniform vec2 uGrid; uniform vec2 uSrc; uniform vec2 uTx; uniform float uC; uniform float uPh; uniform int uMode; uniform float uFade;
uniform vec3 uMatCol[8]; uniform float uMatA[8];
out vec4 o;
vec2 H(sampler2D t,vec2 c){ ivec2 q=clamp(ivec2(c),ivec2(0),ivec2(uGrid)-1); vec2 a=texelFetch(t,q,0).rg; return vec2(a.x*uTx.x+a.y*uTx.y,a.y*uTx.x-a.x*uTx.y)/dot(uTx,uTx); }
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec2 uv=gl_FragCoord.xy/uView, c=vec2(uv.x*uGrid.x,(1.-uv.y)*uGrid.y);
  ivec2 p=clamp(ivec2(c),ivec2(0),ivec2(uGrid)-1);
  int id=clamp(int(texelFetch(uM,p,0).r*255.+.5),0,7);
  vec3 bg=vec3(.035,.058,.105), col;
  if(uMode==0){
    vec2 h=H(uA,c); float v=h.x*cos(uPh)-h.y*sin(uPh);
    float r=max(length(c-uSrc),4.), A=sqrt(2.*uC/r), t=tanh(v/A*.8);
    col = t>0. ? mix(bg,vec3(1.,.70,.28),t) : mix(bg,vec3(.30,.79,.94),-t);
    col += vec3(1.,.96,.88)*smoothstep(.82,1.,abs(t))*.28;
  } else {
    float ea=dot(H(uA,c),H(uA,c)), eb=dot(H(uB,c),H(uB,c));
    for(int i=0;i<16;i++){ float fi=float(i)+.5, ang=fi*2.39996, rr=8.*sqrt(fi/16.); vec2 q=c+vec2(cos(ang),sin(ang))*rr;
      vec2 a=H(uA,q), b=H(uB,q); ea+=dot(a,a); eb+=dot(b,b); }
    float d=10.*log(max(ea,1e-30)/max(eb,1e-30))*.4342944819, v=clamp(d/6.,-1.,1.);
    col = v>0. ? mix(bg,vec3(1.,.70,.28),v) : mix(bg,vec3(.71,.55,1.),-v);
  }
  col=mix(bg,col,uFade);
  float cpp=uGrid.x/uView.x; vec2 g=abs(fract(c/133.3333+.5)-.5)*133.3333;
  if(min(g.x,g.y)<cpp*.7) col=mix(col,vec3(.65,.75,.95),.10);
  if(id>0){ vec3 mc=uMatCol[id]; if(id==5) mc*=.86+.28*hash(floor(c)); col=mix(col,mc,uMatA[id]); }
  o=vec4(col,1.);
}`;
const probeP=program(PROBE_FS), accP=program(ACC_FS), sdispP=program(SDISP_FS);
const recTex=mkTex(REC_W,REC_H), recFb=mkFb(recTex);
const ssim=new Sim(SN.W,SN.H);
const slut=makeLut(SF0/1e9);
// acc: ping-pong pair being summed; shown: the last finished measurement; base: the empty room
const acc=[mkTex(SN.W,SN.H),mkTex(SN.W,SN.H)], accFb=acc.map(mkFb), shownTex=mkTex(SN.W,SN.H), shownFb=mkFb(shownTex),
  baseTex=mkTex(SN.W,SN.H), baseFb=mkFb(baseTex);
let accCur=0;
function copyAcc(toFb){   // keep the finished sum (same size and format: a plain blit)
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,accFb[accCur]);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,toFb);
  gl.blitFramebuffer(0,0,SN.W,SN.H,0,0,SN.W,SN.H,gl.COLOR_BUFFER_BIT,gl.NEAREST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);
}

// ---- painting on the small grid (same shapes as state.js, other grid) ----
function sWall(k,x0,y0,x1,y1){
  const m=MAT[k], g=ssim.ids; x0=M(x0);y0=M(y0);x1=M(x1);y1=M(y1);
  const Ln=Math.hypot(x1-x0,y1-y0), ux=(x1-x0)/Ln, uy=(y1-y0)/Ln, nx=-uy, ny=ux;
  const lay=m.layers.map(([a,b])=>[a/CM_PER_CELL,b/CM_PER_CELL]);
  const half=Math.max(...lay.map(l=>Math.max(Math.abs(l[0]),Math.abs(l[1]))));
  for(let y=Math.max(0,Math.floor(Math.min(y0,y1)-half-1));y<=Math.min(SN.H-1,Math.ceil(Math.max(y0,y1)+half+1));y++)
    for(let x=Math.max(0,Math.floor(Math.min(x0,x1)-half-1));x<=Math.min(SN.W-1,Math.ceil(Math.max(x0,x1)+half+1));x++){
      const rx=x+.5-x0, ry=y+.5-y0, t=rx*ux+ry*uy;
      if(t<-half||t>Ln+half) continue;
      const s=rx*nx+ry*ny; if(Math.abs(s)>=half) continue;
      let hit=t<0||t>Ln;
      if(!hit) for(const l of lay) if(s>=l[0]&&s<l[1]){hit=true;break;}
      if(hit) g[y*SN.W+x]=m.id;
    }
}
function sPerson(x,y,ang=0){   // same ellipse as personM (0.46 m × 0.26 m)
  const g=ssim.ids, id=MAT.water.id, cx=M(x), cy=M(y), rx=M(.23), ry=M(.13), ca=Math.cos(ang), sa=Math.sin(ang), R=rx+1;
  for(let j=Math.max(0,Math.floor(cy-R));j<=Math.min(SN.H-1,Math.ceil(cy+R));j++)
    for(let i=Math.max(0,Math.floor(cx-R));i<=Math.min(SN.W-1,Math.ceil(cx+R));i++){
      const dx=i+.5-cx, dy=j+.5-cy, u=(dx*ca+dy*sa)/rx, v=(-dx*sa+dy*ca)/ry;
      if(u*u+v*v<=1) g[j*SN.W+i]=id;
    }
}

// ---- the room: 5.1 m × 2.85 m. Outer walls concrete (window in the top one), inner walls gypsum, a wooden door ----
const SROOM={router:[.85,.85], rx:[5.1,2.9], person:null, ang:0, empty:false, door:0,   // door: opening angle (rad), hinge at the top
  inside:[.75,.75,5.25,3.0]};                 // where a person can stand (x0,y0,x1,y1)
function sBuild(){
  ssim.ids.fill(0);
  if(!SROOM.empty){
    sWall('conc',.45,.45,2.2,.45); sWall('glass',2.2,.45,3.8,.45); sWall('conc',3.8,.45,5.55,.45);
    sWall('conc',.45,.45,.45,3.3);
    sWall('board',5.55,.45,5.55,1.4); sWall('board',5.55,2.2,5.55,3.3);
    // the 0.8 m wooden door swings into the room around its top hinge
    sWall('wood',5.55,1.4,5.55-.8*Math.sin(SROOM.door),1.4+.8*Math.cos(SROOM.door));
    sWall('board',.45,3.3,5.55,3.3);
  }
  if(SROOM.person) sPerson(SROOM.person[0],SROOM.person[1],SROOM.ang);
  ssim.upload();
}
// energy probes: receiver first, then 15 fixed points spread over the room
function probePts(){
  const p=[[M(SROOM.rx[0]),M(SROOM.rx[1])]];
  for(let j=0;j<3;j++)for(let i=0;i<5;i++) p.push([M(.8+i*1.1),M(.8+j*1.07)]);
  return p.map(([x,y])=>[Math.round(x),Math.round(y)]);
}

// Gaussian pulse on the carrier: no DC, ~150 MHz wide, so the pulse itself is short (~6 ns)
const PULSE_TAU=2e-9/DT, PULSE_T0=4*PULSE_TAU, OM0=2*Math.PI*SF0*DT;
const pulse=n=>Math.exp(-(((n-PULSE_T0)/PULSE_TAU)**2))*Math.sin(OM0*(n-PULSE_T0));

// One run of the grid with a source function, which can be advanced a few steps per frame.
// opts: {steps: fixed count} or stop when the room energy is stopDb below its peak.
class Run{
  constructor(src,opts={}){
    this.src=src; this.t0=performance.now(); this.gpuMs=0;
    const pts=probePts(); this.pts=new Int32Array(NPROBE*2); pts.forEach((p,i)=>{this.pts[2*i]=p[0];this.pts[2*i+1]=p[1];});
    this.stopDb=opts.stopDb??55; this.fixed=opts.steps||0; this.maxN=Math.min(MAXSTEP,this.fixed||MAXSTEP);
    this.rs=[Math.round(M(SROOM.router[0])),Math.round(M(SROOM.router[1]))];
    this.rx=new Float32Array(this.maxN); this.rowE=[]; this.n=0; this.peak=0; this.readRows=0; this.done=false;
    ssim.clear();
    for(const f of accFb){gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}
  }
  advance(k){
    const t=performance.now(), end=Math.min(this.maxN,this.n+k), buf=Run.buf;
    ssim.begin(this.rs,false,slut);
    gl.useProgram(probeP.p);gl.uniform2iv(probeP.u.uPts,this.pts);gl.uniform1i(probeP.u.uS,0);
    while(this.n<end&&!this.done){
      const n=this.n;
      gl.useProgram(simP.p);gl.viewport(0,0,SN.W,SN.H);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,ssim.mt);
      ssim.step(this.src(n));
      gl.useProgram(probeP.p);gl.bindFramebuffer(gl.FRAMEBUFFER,recFb);
      gl.viewport((n%PER_ROW)*NPROBE,(n/PER_ROW)|0,NPROBE,1);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,ssim.tex[ssim.cur]);
      gl.drawArrays(gl.TRIANGLES,0,3);
      if(n%ACC_EVERY===0){
        gl.useProgram(accP.p);gl.bindFramebuffer(gl.FRAMEBUFFER,accFb[1-accCur]);gl.viewport(0,0,SN.W,SN.H);
        gl.uniform1i(accP.u.uS,0);gl.uniform1i(accP.u.uA,2);gl.uniform2f(accP.u.uCS,Math.cos(OM0*n),Math.sin(OM0*n));
        gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,acc[accCur]);
        gl.drawArrays(gl.TRIANGLES,0,3);
        accCur=1-accCur; gl.activeTexture(gl.TEXTURE0);
        gl.useProgram(probeP.p);
      }
      this.n++;
      const rows=(this.n/PER_ROW)|0;
      if(rows-this.readRows===CHECK_ROWS||this.n===this.maxN) this.read();
    }
    gl.viewport(0,0,cv.width,cv.height);
    this.gpuMs+=performance.now()-t;
    return this.done||this.n>=this.maxN;
  }
  read(){
    const nr=Math.ceil(this.n/PER_ROW)-this.readRows, buf=Run.buf;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,recFb);
    gl.readPixels(0,this.readRows,REC_W,nr,gl.RGBA,gl.FLOAT,buf);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
    for(let r=0;r<nr;r++){
      let e=0;
      for(let s=0;s<PER_ROW;s++){
        const k=(this.readRows+r)*PER_ROW+s; if(k>=this.n) break;
        const o=(r*REC_W+s*NPROBE)*4;
        this.rx[k]=buf[o];
        for(let q=1;q<NPROBE;q++) e+=buf[o+q*4]**2;
      }
      this.rowE.push(e); this.peak=Math.max(this.peak,e);
      if(!this.fixed&&this.readRows+r>4&&this.n>PULSE_T0*2&&e<this.peak*10**(-this.stopDb/10)) this.done=true;
    }
    this.readRows+=nr;
  }
  out(){return {rx:this.rx.subarray(0,this.n), n:this.n, rowE:this.rowE, ms:performance.now()-this.t0, gpuMs:this.gpuMs};}
}
Run.buf=new Float32Array(REC_W*CHECK_ROWS*4);
function sRun(src,opts){const r=new Run(src,opts);while(!r.advance(1e9));return r.out();}

// DFT at the subcarrier frequencies. Sample n of the receiver is the field right after
// step n, the step that added src(n), so Tx and Rx share the same time index.
function dft(x,freqs){
  return freqs.map(f=>{
    const w=2*Math.PI*f*DT; let re=0,im=0;
    for(let n=0;n<x.length;n++){const a=w*n;re+=x[n]*Math.cos(a);im-=x[n]*Math.sin(a);}
    return cx(re,im);
  });
}
const subFreqs=()=>SUB.map(k=>SF0+k*SUB_DF);
let txSpec=null;
function csiOf(r){
  const fs=subFreqs();
  if(!txSpec){const m=Math.ceil(PULSE_T0*2)+1, tx=new Float32Array(m);for(let n=0;n<m;n++)tx[n]=pulse(n);txSpec=dft(tx,fs);}
  const H=dft(r.rx,fs).map((v,i)=>cdiv(v,txSpec[i]));
  return {H, amp:H.map(h=>20*Math.log10(cabs(h))), phase:H.map(h=>Math.atan2(h.im,h.re)), steps:r.n, ms:r.ms, gpuMs:r.gpuMs, rowE:r.rowE};
}
// the pulse's own sum at 2.437 GHz, sampled like the cells (every ACC_EVERY steps)
let tx0=null;
function txAt0(){
  if(!tx0){let re=0,im=0;const m=Math.ceil(PULSE_T0*2)+1;for(let n=0;n<m;n+=ACC_EVERY){const p=pulse(n);re+=p*Math.cos(OM0*n);im-=p*Math.sin(OM0*n);}tx0=[re,im];}
  return tx0;
}
// finished sums: keepMap() after each measurement, keepBase() for the empty room
const keepMap=()=>copyAcc(shownFb), keepBase=()=>copyAcc(baseFb);
function readMap(x,y,base){   // H at one cell of the kept map (for tools/sense-verify.js)
  const b=new Float32Array(4), t=txAt0();
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,base?baseFb:shownFb);gl.readPixels(x|0,y|0,1,1,gl.RGBA,gl.FLOAT,b);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
  return cdiv(cx(b[0],b[1]),cx(t[0],t[1]));
}
// mode 0: the steady wave at phase ph; mode 1: difference from the empty room. fade 0..1 from black
function sDisplay(mode,ph,fade){
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,cv.width,cv.height);
  gl.useProgram(sdispP.p);gl.bindVertexArray(vao);
  const u=sdispP.u, t=txAt0();
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,shownTex);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,baseTex);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,ssim.mt);
  gl.uniform1i(u.uA,0);gl.uniform1i(u.uB,1);gl.uniform1i(u.uM,2);
  gl.uniform2f(u.uView,cv.width,cv.height);gl.uniform2f(u.uGrid,SN.W,SN.H);
  gl.uniform2f(u.uSrc,Math.round(M(SROOM.router[0]))+.5,Math.round(M(SROOM.router[1]))+.5);
  gl.uniform2f(u.uTx,t[0],t[1]);gl.uniform1f(u.uC,CAL['2.4'].C);gl.uniform1f(u.uPh,ph);gl.uniform1i(u.uMode,mode);gl.uniform1f(u.uFade,fade);
  gl.uniform3fv(u.uMatCol,new Float32Array(MATS.flatMap(m=>m.rgb||[0,0,0])));
  gl.uniform1fv(u.uMatA,new Float32Array(MATS.map(m=>m.al||0)));
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.activeTexture(gl.TEXTURE0);
}
function csi(opts={}){ sBuild(); return csiOf(sRun(pulse,opts)); }
// the same transfer at one frequency from a continuous wave (for checking csi())
function cwAt(f,steps){
  sBuild();
  const om=2*Math.PI*f*DT, T=2*Math.PI/om;
  const src=n=>Math.sin(om*n)*Math.min(1,n/(2*T));
  const r=sRun(src,{steps});
  // least squares rx ≈ a·sin(ωn) + b·cos(ωn) over the last 4000 steps.
  // Source sin(ωn) = Im(e^{jωn}), so Rx = Im(H·e^{jωn}) gives H = a + j·b
  let ss=0,cc=0,sc=0,xs=0,xc=0;
  for(let n=r.n-4000;n<r.n;n++){const s=Math.sin(om*n),c=Math.cos(om*n),x=r.rx[n];ss+=s*s;cc+=c*c;sc+=s*c;xs+=x*s;xc+=x*c;}
  const det=ss*cc-sc*sc, a=(xs*cc-xc*sc)/det, b=(xc*ss-xs*sc)/det, h=cx(a,b);
  return {h, db:20*Math.log10(cabs(h)), ms:r.ms};
}

// ---- what a real receiver adds (推定, see DEVNOTES「WiFi センシング」) ----
// each packet: one common gain jump from the automatic gain control, and independent noise on
// every subcarrier's amplitude (static CSI: 90% of std below 10% of the mean, DeepFi 2016 → 5% here)
const NOISE={sub:.05, agcDb:.5};
let spare=null;
function randn(){if(spare!==null){const s=spare;spare=null;return s;}let u=0,v=0;while(!u)u=Math.random();v=Math.random();const r=Math.sqrt(-2*Math.log(u));spare=r*Math.sin(2*Math.PI*v);return r*Math.cos(2*Math.PI*v);}
function noisyAmp(H){
  const g=10**(randn()*NOISE.agcDb/20);
  return H.map(h=>cabs(h)*g*Math.max(0,1+randn()*NOISE.sub));
}
// ---- motion: moving variance of the amplitudes (Youssef et al. 2007 did this with one RSSI value) ----
// each packet is divided by its own mean first, which cancels the common AGC gain (as ESP32 motion projects do).
// Then neighbouring subcarriers are averaged in groups: the noise differs from slice to slice, but a person
// changes neighbouring slices alike (the room's response is smooth over 20 MHz), so this keeps the motion
// and cuts the noise (real pipelines use filters or PCA for the same reason).
// win 20 × 1.5 cm = 30 cm of walking. Chosen on recorded noise-free walks (DEVNOTES): 5 walks caught 90–98%
// of the time, a still person never (largest ×2.3). One group of 52 would cancel out with the AGC division
const MOTION={win:20, k:3, group:26};
class Motion{
  constructor(){this.hist=[];this.v=0;this.v0=1;}
  calibrate(H){      // the empty room's noise level, from the noise model alone (no new FDTD run)
    const m=new Motion(); let s=0,c=0;
    for(let i=0;i<300;i++){m.push(noisyAmp(H));if(i>=MOTION.win){s+=m.v;c++;}}
    this.v0=s/c; this.hist=[];
  }
  push(a){
    const mean=a.reduce((x,y)=>x+y,0)/a.length, G=MOTION.group, g=[];
    for(let j=0;j<a.length;j+=G){let s=0;for(let k=j;k<j+G;k++)s+=a[k];g.push(s/G/mean);}
    this.hist.push(g);
    if(this.hist.length>MOTION.win) this.hist.shift();
    const n=this.hist.length; if(n<3){this.v=0;return;}
    let v=0;
    for(let k=0;k<g.length;k++){let s=0,q=0;for(const h of this.hist){s+=h[k];q+=h[k]*h[k];}v+=q/n-(s/n)**2;}
    this.v=v/g.length*n/(n-1);
  }
  get ratio(){return this.v/this.v0;}
  get moving(){return this.hist.length>=MOTION.win&&this.ratio>MOTION.k;}
}
window.__ww.sense={SN,SROOM,SUB,NOISE,MOTION,Motion,Run,csi,csiOf,cwAt,sRun,sBuild,pulse,subFreqs,noisyAmp,ssim,keepMap,keepBase,sDisplay,txAt0,readMap};
