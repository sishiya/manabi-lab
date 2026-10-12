'use strict';
// ================= constants =================
const W=1280, H=800;                 // cells
const DX=0.0075;                     // m per cell
const KC=0.5;                        // Courant number c·dt/dx in air
const C0=2.998e8, DT=KC*DX/C0;       // 12.5 ps
const EPS0=8.854e-12;
const PTX=20;                        // dBm
const BETA=1/256;                    // EMA of u² per step
const SPEEDS=[1,2,3,4,6,8,12,16,24,32,48,64];
const CM_PER_CELL=DX*100;

const FREQ={
  '2.4':{ghz:2.437, mhz:2437, times:L('24億','2.4 billion'), },
  '5':  {ghz:5.2,   mhz:5200, times:L('52億','5.2 billion'), },
};

// ITU-R P.2040: εr = a·f^b (b=0 here), σ = c·f^d (f in GHz)
const MATS=[
  {key:'air'},
  {key:'board', name:L('石こうボード壁','Gypsum board wall'), short:L('石こうボード','Gypsum board'), note:L('厚さ12.5mmの板2枚＋空洞','two 12.5 mm boards with a gap'), rgb:[.86,.83,.75], al:.8,  er:2.73, c:.0085, d:.9395, layers:[[-5.25,-3.75],[3.75,5.25]], eff:[[2.729,.03206],[2.729,.0355]]},
  {key:'wood',  name:L('木のドア・板','Wooden door / board'),   short:L('木','Wood'),         note:L('厚さ3.5cm','3.5 cm thick'),               rgb:[.68,.46,.27], al:.85, er:1.99, c:.0047, d:1.0718, layers:[[-1.75,1.75]], eff:[[1.501,.01223],[1.593,.02441]]},
  {key:'glass', name:L('ガラス窓','Glass window'),       short:L('ガラス','Glass'),     note:L('厚さ1.5cm','1.5 cm thick'),               rgb:[.62,.88,1.0], al:.55, er:6.31, c:.0036, d:1.3394, layers:[[-.75,.75]], eff:[[5.021,.00946],[4.021,.01136]]},
  {key:'brick', name:L('レンガ','Brick'),         short:L('レンガ','Brick'),     note:L('厚さ10cm','10 cm thick'),                rgb:[.72,.33,.24], al:.85, er:3.91, c:.0238, d:.16,    layers:[[-5,5]], eff:[[3.42,.02309],[2.462,.01862]]},
  {key:'conc',  name:L('コンクリート','Concrete'),   short:L('コンクリート','Concrete'),note:L('厚さ18cm（中の鉄筋は省略）','18 cm thick (steel bars inside left out)'),rgb:[.56,.58,.62], al:.86, er:5.24, c:.0462, d:.7822, layers:[[-9,9]], eff:[[4.41,.0782],[4.252,.07784]]},
  {key:'metal', name:L('金属','Metal'),           short:L('金属','Metal'),       note:L('厚さ2cm','2 cm thick'),                 rgb:[.92,.95,.99], al:.95, pec:true, layers:[[-1,1]]},
  {key:'water', name:L('水・人の体','Water / human body'),     short:L('人','Person'),         note:L('人の体・お風呂のお湯','a human body or bath water'),    rgb:[.27,.52,.92], al:.8,  water:true},
];
const MAT={}; MATS.forEach((m,i)=>{m.id=i; MAT[m.key]=m;});
function props(m,f){
  if(m.water) return {er:20, sig: f<3?1.7:4.3};     // body/water, εr capped for the grid
  return {er:m.er, sig:m.c*Math.pow(f,m.d)};
}
// values actually used on the grid. A 0.75 cm grid is coarse for short waves inside dense
// materials (5 GHz in glass is only 3 cells per wavelength), so εr/σ were refitted with
// __ww.stripDb() until a plane wave through one wall loses the same dB as slabDb() predicts.
function simProps(m,f){
  if(m.eff){const [er,sig]=m.eff[f<3?0:1];return {er,sig};}
  return props(m,f);
}

// ---------- complex helpers for slab transmission ----------
const cx=(re,im)=>({re,im});
const cadd=(a,b)=>cx(a.re+b.re,a.im+b.im), csub=(a,b)=>cx(a.re-b.re,a.im-b.im);
const cmul=(a,b)=>cx(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re);
const cdiv=(a,b)=>{const d=b.re*b.re+b.im*b.im;return cx((a.re*b.re+a.im*b.im)/d,(a.im*b.re-a.re*b.im)/d);};
const cexp=a=>{const e=Math.exp(a.re);return cx(e*Math.cos(a.im),e*Math.sin(a.im));};
const csqrt=a=>{const r=Math.hypot(a.re,a.im);return cx(Math.sqrt((r+a.re)/2),Math.sign(a.im||1)*Math.sqrt((r-a.re)/2));};
const cabs=a=>Math.hypot(a.re,a.im);
// loss in dB for one wall as drawn (normal incidence, layers treated separately)
function slabDb(m,f){
  if(m.pec) return Infinity;
  const {er,sig}=props(m,f), w=2*Math.PI*f*1e9, k0=w/C0;
  const n=csqrt(cx(er,-sig/(w*EPS0)));
  const one=cx(1,0), r=cdiv(csub(one,n),cadd(one,n)), r2=cmul(r,r);
  let tot=0;
  for(const [a,b] of m.layers){
    const d=(b-a)/100, beta=cmul(cx(k0*d,0),n);
    const e1=cexp(cx(beta.im,-beta.re)); // exp(-jβ)
    const t=cdiv(cmul(csub(one,r2),e1), csub(one,cmul(r2,cmul(e1,e1))));
    tot+=-20*Math.log10(cabs(t));
  }
  return tot;
}

