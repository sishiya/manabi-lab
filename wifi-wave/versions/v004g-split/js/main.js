'use strict';
if(!window.__wwGL) throw new Error("wifi-wave: WebGL2 の準備ができなかったので止める");   // gl.js が止まったとき
// ================= start =================
fit();updateFreqCap();updateToolDb();loadPreset('flat');
// debug: advance n steps without waiting for frames
function advance(n){
  const src=S.line?[S.lineX,0]:[Math.round(S.router[0]),Math.round(S.router[1])];
  sim.begin(src,S.line,lut);const T=2*Math.PI/OMEGA;
  for(let i=0;i<n;i++){const k=sim.n;sim.step(Math.sin(OMEGA*k)*Math.min(1,k/(2*T)));}
  display();updateReadout();drawOverlay(performance.now());
}
// debug: plane wave through one slab in a 1-D strip; returns transmission loss in dB
let strip=null;
function stripRun(f,mid,er,sig){
  if(!strip) strip=new Sim(900,4);
  const m=MATS[mid], l=makeLut(f);
  if(mid&&!m.pec){l.k2[mid]=KC*KC/er;l.a[mid]=sig*DT/(2*EPS0*er);}
  strip.ids.fill(0);
  if(mid) for(const [a,b] of m.layers) for(let x=0;x<900;x++){const s=x+.5-350;if(s>=a/CM_PER_CELL&&s<b/CM_PER_CELL)for(let y=0;y<4;y++)strip.ids[y*900+x]=mid;}
  strip.upload();strip.clear();strip.begin([100,0],true,l,true);
  const om=omegaStep(f),T=2*Math.PI/om;
  for(let i=0;i<2000;i++)strip.step(Math.sin(om*i)*Math.min(1,i/(2*T)));
  const b=new Float32Array(900*4*4);strip.read(0,0,900,4,b);
  let s=0;for(let x=500;x<700;x++)s+=b[(900+x)*4+2];return s/200;
}
function stripDb(f,mid,er,sig){return -10*Math.log10(stripRun(f,mid,er,sig)/stripRun(f,0));}
window.__ww={S,sim,CAL,ids,loadPreset,probeAvg,dbmAt,MATS,slabDb,advance,stripDb,props,simProps};
requestAnimationFrame(loop);
