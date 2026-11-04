'use strict';
if(!window.__wwGL) throw new Error("wifi-wave: WebGL2 の準備ができなかったので止める");   // gl.js が止まったとき
// ================= sensing: CSI of one small room (PLAN.md 段階A) =================
// The same FDTD as the main view, on its own small grid. A short Gaussian pulse on the
// 2.437 GHz carrier is sent from the router; the field at the receiver is written to a
// time-series texture every step (no readPixels per step), read back in blocks, and
// split into the 52 subcarriers of a 20 MHz channel by a DFT. CSI = Rx(f) / Tx(f).
const SN={W:640,H:512};                       // 4.8 m × 3.84 m (40-cell sponge on every side)
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
const probeP=program(PROBE_FS);
const recTex=mkTex(REC_W,REC_H), recFb=mkFb(recTex);
const ssim=new Sim(SN.W,SN.H);
const slut=makeLut(SF0/1e9);

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

// ---- the room: 3.9 m × 2.94 m, outer walls concrete (window in the top one), inner walls gypsum ----
const SROOM={router:[.8,.8], rx:[4.0,3.0], person:null, ang:0, empty:false};
function sBuild(){
  ssim.ids.fill(0);
  if(!SROOM.empty){
    sWall('conc',.45,.45,4.35,.45); sWall('conc',.45,.45,.45,3.39);
    sWall('board',4.35,.45,4.35,3.39); sWall('board',.45,3.39,4.35,3.39);
    sWall('glass',1.9,.45,3.3,.45);
  }
  if(SROOM.person) sPerson(SROOM.person[0],SROOM.person[1],SROOM.ang);
  ssim.upload();
}
// energy probes: receiver first, then 15 fixed points spread over the room
function probePts(){
  const p=[[M(SROOM.rx[0]),M(SROOM.rx[1])]];
  for(let j=0;j<3;j++)for(let i=0;i<5;i++) p.push([M(.75+i*.8),M(.8+j*.95)]);
  return p.map(([x,y])=>[Math.round(x),Math.round(y)]);
}

// Gaussian pulse on the carrier: no DC, ~150 MHz wide, so the pulse itself is short (~6 ns)
const PULSE_TAU=2e-9/DT, PULSE_T0=4*PULSE_TAU, OM0=2*Math.PI*SF0*DT;
const pulse=n=>Math.exp(-(((n-PULSE_T0)/PULSE_TAU)**2))*Math.sin(OM0*(n-PULSE_T0));

// run the grid with a source function; returns the receiver time series and how long it took
// opts: {steps: fixed count} or auto stop when the room energy is −stopDb below its peak
function sRun(src,opts={}){
  const t0=performance.now(), pts=probePts(), flat=new Int32Array(NPROBE*2);
  pts.forEach((p,i)=>{flat[2*i]=p[0];flat[2*i+1]=p[1];});
  const stopDb=opts.stopDb??55, fixed=opts.steps||0, maxN=Math.min(MAXSTEP,fixed||MAXSTEP);
  const rs=[Math.round(M(SROOM.router[0])),Math.round(M(SROOM.router[1]))];
  ssim.clear();ssim.begin(rs,false,slut);
  gl.useProgram(probeP.p);gl.uniform2iv(probeP.u.uPts,flat);gl.uniform1i(probeP.u.uS,0);
  const rx=new Float32Array(maxN), rowE=[], buf=new Float32Array(REC_W*CHECK_ROWS*4);
  let n=0, peak=0, readRows=0, stopped=false;
  while(n<maxN&&!stopped){
    gl.useProgram(simP.p);gl.viewport(0,0,SN.W,SN.H);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,ssim.mt);
    ssim.step(src(n));
    gl.useProgram(probeP.p);gl.bindFramebuffer(gl.FRAMEBUFFER,recFb);
    gl.viewport((n%PER_ROW)*NPROBE,(n/PER_ROW)|0,NPROBE,1);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,ssim.tex[ssim.cur]);
    gl.drawArrays(gl.TRIANGLES,0,3);
    n++;
    const rows=(n/PER_ROW)|0;
    if(rows-readRows===CHECK_ROWS||n===maxN){
      const nr=Math.ceil(n/PER_ROW)-readRows;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,recFb);
      gl.readPixels(0,readRows,REC_W,nr,gl.RGBA,gl.FLOAT,buf);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
      for(let r=0;r<nr;r++){
        let e=0;
        for(let s=0;s<PER_ROW;s++){
          const k=(readRows+r)*PER_ROW+s; if(k>=n) break;
          const o=(r*REC_W+s*NPROBE)*4;
          rx[k]=buf[o];
          for(let q=1;q<NPROBE;q++) e+=buf[o+q*4]**2;
        }
        rowE.push(e); peak=Math.max(peak,e);
        if(!fixed&&readRows+r>4&&n>PULSE_T0*2&&e<peak*10**(-stopDb/10)) stopped=true;
      }
      readRows+=nr;
    }
  }
  gl.viewport(0,0,cv.width,cv.height);
  return {rx:rx.subarray(0,n), n, rowE, ms:performance.now()-t0};
}
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
function csi(opts={}){
  sBuild();
  const fs=subFreqs(), r=sRun(pulse,opts);
  if(!txSpec){const m=Math.ceil(PULSE_T0*2)+1, tx=new Float32Array(m);for(let n=0;n<m;n++)tx[n]=pulse(n);txSpec=dft(tx,fs);}
  const rxs=dft(r.rx,fs), H=rxs.map((v,i)=>cdiv(v,txSpec[i]));
  return {H, amp:H.map(h=>20*Math.log10(cabs(h))), phase:H.map(h=>Math.atan2(h.im,h.re)), steps:r.n, ms:r.ms, rowE:r.rowE};
}
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
window.__ww.sense={SN,SROOM,SUB,csi,cwAt,sRun,sBuild,pulse,subFreqs,ssim};
