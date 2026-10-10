'use strict';
// Earth-system box model (mechanisms only; never reads the record). Runs from 4.6 Gyr ago to 5 Gyr ahead.
/* The record (data.js) is what happened. This is a small model of WHY: it only knows mechanisms and outside
   forcings, and computes CO2, temperature, ice, oxygen, methane, sea-animal diversity, plants, oceans and
   sea level on its own. Forcings (given): Sun, volcanic CO2, how weatherable the continents are, when key
   life appears, large igneous provinces, the K-Pg impact, orbital wobble, human emissions (by scenario). */
const gauss=(A,c,w)=>{const d=(A-c)/w;return Math.exp(-d*d)};
const LIPS=[// age, half-width, extra volcanic CO2 (× present outgassing)
  [3.72e8,.5e6,5,L('ヴィリュイ洪水玄武岩','Viluy Traps')],[2.6e8,.4e6,4,L('峨眉山洪水玄武岩','Emeishan Traps')],[2.52e8,.35e6,16,L('シベリア・トラップ','Siberian Traps')],[2.015e8,.3e6,9,L('中央大西洋マグマ区','Central Atlantic Magmatic Province')],
  [1.83e8,.3e6,5,L('カルー・フェラー','Karoo-Ferrar')],[6.6e7,.4e6,5,L('デカン・トラップ','Deccan Traps')],[5.6e7,.06e6,25,L('暁新世末の炭素放出','end-Paleocene carbon release')]];

/* ---------------- human emissions: history + scenarios (GtC per year incl. land use) */
const HIST_CUM=[[1750,0],[1850,30],[1900,75],[1950,170],[1980,330],[2000,460],[2010,560],[2020,690],[2026,760]];
const SCENARIOS={
  low: {name:L('低排出（SSP1-2.6）','Low (SSP1-2.6)'),short:L('低排出','Low'),pts:[[2026,11],[2030,10],[2040,7],[2050,4],[2060,2],[2070,.5],[2080,-.5],[2100,-1],[2150,0]]},
  mid: {name:L('中間（SSP2-4.5）','Middle (SSP2-4.5)'),short:L('中間','Middle'),pts:[[2026,11],[2050,12],[2070,10],[2100,3],[2150,1],[2250,0]]},
  high:{name:L('高排出（SSP5-8.5）','High (SSP5-8.5)'),short:L('高排出','High'),pts:[[2026,11],[2050,22],[2080,30],[2100,34],[2150,20],[2250,0]]},
  zero:{name:L('いますぐゼロ','Zero right now'),short:L('ゼロ','Zero'),pts:[[2026,11],[2027,0]]},
};
let SCENARIO='mid';
/* ---------------- what-if interventions (set by the IF panel, ifworld.js). CUR_IF is the one the model is running with. */
const IF_DEF=Object.freeze({oxy:false,rodinia:false,plantsEarly:false,siberia:1,noImpact:false,humanMul:1,volcFuture:1});
let IFX={...IF_DEF},CUR_IF=IF_DEF,worldIF=false;
const ifActive=()=>Object.keys(IF_DEF).some(k=>IFX[k]!==IF_DEF[k]);
const YEAR_NOW=2026,yearOf=A=>YEAR_NOW-A;
function pulses(){// 5-year emission pulses [year, GtC]
  const out=[],cum=y=>{for(let i=1;i<HIST_CUM.length;i++)if(y<=HIST_CUM[i][0]){const a=HIST_CUM[i-1],b=HIST_CUM[i];return lerp(a[1],b[1],(y-a[0])/(b[0]-a[0]))}return HIST_CUM[HIST_CUM.length-1][1]};
  const mul=CUR_IF.humanMul;
  for(let y=1750;y<YEAR_NOW;y+=5)out.push([y+2.5,(cum(Math.min(y+5,YEAR_NOW))-cum(y))*mul]);
  const pts=SCENARIOS[SCENARIO].pts,rate=y=>{if(y>=pts[pts.length-1][0])return pts[pts.length-1][1];for(let i=1;i<pts.length;i++)if(y<=pts[i][0])return lerp(pts[i-1][1],pts[i][1],(y-pts[i-1][0])/(pts[i][0]-pts[i-1][0]));return 0};
  for(let y=YEAR_NOW;y<2400;y+=5)out.push([y+2.5,(rate(y)+rate(y+5))/2*5*mul]);
  return out;
}
// fraction of an emission still in the air after t years: Bern carbon-cycle response, with the long tail
// removed by sea-floor carbonate (≈6 kyr) and finally by rock weathering (≈200 kyr)
const airborne=t=>t<0?0:.88*(.217*(.6*Math.exp(-t/6000)+.4*Math.exp(-t/2e5))+.259*Math.exp(-t/172.9)+.338*Math.exp(-t/18.51)+.186*Math.exp(-t/1.186));// ×0.88 calibrated so 2026 matches the measured rise
let PULSES=pulses();
function humanPPM(A){const y=yearOf(A);if(y<1750)return 0;let s=0;for(const [py,e] of PULSES){if(py>y)break;s+=e*airborne(y-py)}return s/2.12}

/* ---------------- orbital wobble: past from the record's cycle shape, future from orbital theory
   (a weak cold phase ~50 kyr ahead, a full glacial ~100 kyr ahead, then 100-kyr cycles) */
function futureOrbit(F){const s=(F%1e5)/1e5,cold=s<.88?s/.88:1-(s-.88)/.12;return -(.35*gauss(F,5e4,1.2e4)+cold*(F<1e5?sstep(5.5e4,9.5e4,F):1))}

const FORCE={
  sun:solarLum,
  volc:A=>{if(A<0)return Math.max(.3,1-.15*(-A/1e9))*CUR_IF.volcFuture;let v=1+2.2*Math.pow(A/4.5e9,1.5)+1.0*gauss(A,1.1e8,4e7);for(const l of LIPS)if(Math.abs(A-l[0])<l[1]*4)v+=l[2]*lipScale(l)*gauss(A,l[0],l[1]);return v},
  weath:A=>lerp(.25,1,sstep(4.0e9,2.0e9,A))*(1+5.0*gauss(A,7.0e8,4.5e7)*(CUR_IF.rodinia?0:1))*(1+1.6*gauss(A,4.45e8,6e6))*(1-.3*gauss(A,2.4e8,7e7))*(.72+.28*sstep(5e7,0,A))
    *(1-.35*gauss(A,-2.5e8,8e7))*(1-.15*sstep(0,-1.5e8,A)),// next supercontinent dries the interior; the Himalaya wear down
  bio:A=>{const s=plantShift();return .45+.2*sstep(4.7e8+s,4.3e8+s,A)+.35*sstep(4.2e8+s,3.7e8+s,A)},
  meth:A=>sstep(3.8e9,3.4e9,A),
  burial:A=>CUR_IF.oxy?0:.9*sstep(3.0e9,2.5e9,A)+.75*sstep(7e8,5.5e8,A)+1.0*sstep(4.2e8+plantShift(),3.6e8+plantShift(),A)+1.4*gauss(A,3.15e8,3e7),
  reduct:A=>.75*Math.pow(Math.max(A,0)/2.4e9,1.2)+.15,// reducing volcanic gases; a little remains today
  orbit:A=>A>=0?glacial(A)-1:futureOrbit(-A),
  human:humanPPM,
};
const lipScale=l=>l[0]===2.52e8?CUR_IF.siberia:1,plantShift=()=>CUR_IF.plantsEarly?1e8:0;
const KC=A=>A>3e8?1600:A>1.8e8?lerp(1600,1300,sstep(3e8,2.5e8,A)):lerp(1300,3400,sstep(1.8e8,0,A));
// photosynthesis limits: most plants (C3) fail below ~150 ppm, grasses (C4) hold on lower, cyanobacteria longest
const c3=C=>clamp((C-120)/60,0,1),c4=C=>clamp((C-10)/60,0,1),cy=C=>clamp((C-1)/6,0,1);
const KEYS_OUT=['T','C','O2','I','D','tS','tC','tM','tI','tO','tW','V','W','Bio','hum','snow','plant','p3','p4','ocean','SL'];
function runModel(){
  const N=4000,M={N,A:new Float64Array(N)};
  for(const k of KEYS_OUT)M[k]=new Float32Array(N);
  for(let i=0;i<N;i++)M.A[i]=u2A_ev(i/(N-1));
  let C=3e5,O2=1e-6,D=0,snow=false,T=14,Tf=14,Ts=14,Tsm=14,ocean=1,SLt=0,SLi=0,prevA=M.A[0],Tpre=null;
  const st={};
  const co2=x=>x>=0?4.33*x+.25*x*x:-12*(1-Math.exp(4.33*x/12));// log forcing, softened at very low CO2
  function climate(A,Cn,O2,hum){
    const S=FORCE.sun(A),tS=140*(S-1),tM=18*FORCE.meth(A)*Math.exp(-O2/.003);
    // orbital wobble only matters once the background is cold enough for northern ice sheets; the ocean then also draws CO2 down in glacials
    const bg0=14+tS+co2(Math.log((Cn+hum)/280))+tM,amp=clamp((16.5-bg0)/3,0,1),orb=FORCE.orbit(A);
    const Ct=Cn*(1+.28*amp*orb)+hum,tC=co2(Math.log(Ct/280));
    const tO=2.8*amp*orb;let Tb=14+tS+tC+tM+tO;
    const tW=Tb>30?Math.min(.04*(Tb-30)*(Tb-30),400):0;Tb+=tW;// water vapour amplifies warming in a hot climate
    let I=.03,Tq=Tb;
    if(snow){I=1;Tq=Tb-38.8}else for(let k=0;k<6;k++){I=.03+.2*Math.pow(clamp((14-Tq)/12,0,1),1.5);Tq=Tb-40*(I-.03)}
    Object.assign(st,{S,hum,Ct,tS,tC,tM,tO,tW,tI:-40*(I-.03),I,T:Tq,Tb,bg:bg0+tW,Cn});
    return st;
  }
  for(let i=0;i<N;i++){
    const A1=M.A[i],span=(prevA-A1)/1e6,n=Math.max(1,Math.ceil(span/(A1<-5e7?.25:.02))),h=span/n;
    const hum1=A1<300&&A1>-2e6?FORCE.human(A1):0,hum0=i>0?M.hum[i-1]:0;// computed once per grid point
    for(let s=1;s<=n;s++){
      const A=prevA-(span*s/n)*1e6;
      const c=climate(A,C,O2,lerp(hum0,hum1,s/n));
      if(!snow&&c.T<5&&A<4.3e9)snow=true;else if(snow&&c.Tb>30)snow=false;
      const plantH=A<0?Math.max(c3(C),.7*c4(C)):1;
      const V=FORCE.volc(A),W=FORCE.weath(A),Bio=FORCE.bio(A)*(.45+.55*plantH);
      const Fw=W*Bio*Math.pow(C/280,.3)*Math.exp((c.bg-14)/13)*(snow?.03:1)*Math.sqrt(ocean);
      C=Math.max(.5,C+700*(V-Fw)*h);
      const B=FORCE.burial(A)*(A<0?(.2*cy(C)+.8*plantH)*ocean:1),R=FORCE.reduct(A),ex=B-R;
      const target=ex>.002?Math.max(ex/2.5,.01):ex>0?ex/2.5*.5:1e-6*(1+B);// once O2 wins, an ozone layer shields it and it jumps
      O2+=(target-O2)*(1-Math.exp(-h/(target>O2?1:8)));
      // temperature: fast (surface ocean, ~4 yr) and slow (deep ocean, ~300 yr) parts
      Tf+=(c.T-Tf)*(1-Math.exp(-h/4e-6));Ts+=(c.T-Ts)*(1-Math.exp(-h/3e-4));T=.85*Tf+.15*Ts;
      Tsm+=(c.bg-Tsm)*(1-Math.exp(-h/.3));
      if(T>60)ocean=Math.max(0,ocean-h*(T-60)/20/300);// water escapes to space in a moist greenhouse
      if(A<180){if(Tpre===null)Tpre=T;const d=T-Tpre;SLt+=(.4*d-SLt)*(1-Math.exp(-h/3e-4));SLi+=(Math.min(2.3*d,60)-SLi)*(1-Math.exp(-h/2e-3))}
      if(D===0&&A<6.4e8&&O2>.3)D=5;
      if(D>0){
        const K=KC(A)*clamp(1-Math.max(0,T-25)/10,.25,1)*clamp(1-Math.max(0,T-40)/8,0,1)*clamp(O2/.4,0,1)*clamp(1-4*(c.I-.03),.3,1)*ocean;
        const rate=Math.min(25,Math.abs(c.bg-Tsm)/.3);
        const mu=.005+.12*Math.max(0,rate-.8)+(snow?2:0);
        D=Math.max(K<1?0:1,D+(.08*D*(1-D/Math.max(K,1))-mu*D)*h);
      }
      if(!CUR_IF.noImpact&&A<=6.6e7&&A+h*1e6>6.6e7&&D>0)D*=.6;// the impact itself
    }
    prevA=A1;
    const c=climate(A1,C,O2,hum1);
    M.T[i]=T;M.C[i]=c.Ct;M.O2[i]=O2;M.I[i]=c.I;M.D[i]=D;M.tS[i]=c.tS;M.tC[i]=c.tC;M.tM[i]=c.tM;M.tI[i]=c.tI;M.tO[i]=c.tO;M.tW[i]=c.tW;
    M.V[i]=FORCE.volc(A1);M.W[i]=FORCE.weath(A1);M.Bio[i]=FORCE.bio(A1);M.hum[i]=c.hum;M.snow[i]=snow?1:0;
    M.p3[i]=A1<0?c3(C):1;M.p4[i]=A1<0?c4(C):1;M.plant[i]=A1<0?Math.max(c3(C),.7*c4(C)):1;M.ocean[i]=ocean;M.SL[i]=SLt+SLi;
  }
  return M;
}
// the original world is always kept; the what-if world is computed alongside when there are interventions
let MODEL=null,MODEL_BASE=null,MODEL_IF=null;
function runWith(ifx){CUR_IF=ifx;PULSES=pulses();const m=runModel();CUR_IF=IF_DEF;PULSES=pulses();return m}
function rebuildModel(){const t0=performance.now();MODEL_BASE=runWith(IF_DEF);MODEL_IF=ifActive()?runWith(IFX):null;if(!MODEL_IF)worldIF=false;MODEL=worldIF?MODEL_IF:MODEL_BASE;MODEL_BASE.ms=MODEL.ms=Math.round(performance.now()-t0)}
rebuildModel();
function modelAt(k,A,M=MODEL){// sample a model at any age (negative = future); default: the world on screen
  const a=M.A;let lo=0,hi=M.N-1;
  if(A>=a[0])return M[k][0];if(A<=a[hi])return M[k][hi];
  while(hi-lo>1){const m=(lo+hi)>>1;if(a[m]>=A)lo=m;else hi=m}
  const f=(a[lo]-A)/(a[lo]-a[hi]);return lerp(M[k][lo],M[k][hi],f);
}

/* ---------------- forecasts from the literature, to compare with the model (future only) */
const LIT=[
  // [age, key, value, low, high, label]
  [-6e8,'C',150,100,200,L('約6億年後: CO2 が 150ppm を下回り多くの植物が光合成できない','In about 600 million years: CO2 falls below 150 ppm and many plants cannot photosynthesize')],
  [-1.08e9,'O2',.2,0,1,L('約10億年後: 大気の酸素がほぼ消える','In about 1 billion years: oxygen in the air almost disappears')],
  [-1.5e9,'T',70,50,100,L('10億〜20億年後: 海が失われていく','In 1 to 2 billion years: the oceans are lost')],
];
const AR6_2100={low:[1.8,1.3,2.4],mid:[2.7,2.1,3.5],high:[4.4,3.3,5.7],zero:[1.5,1.2,1.8]};// warming vs 1850-1900 (zero: committed warming, approx.)

/* human footprint over time (0..1); beyond a few thousand years ahead the town is not drawn (humanFade, future.js) */
// in a what-if world, ifCiv/ifIndustry (ifworld.js) can remove people or industry
const farm=A=>(A>7000?0:A>2000?.25*sstep(7000,2000,A):A>120?.25+.35*sstep(2000,120,A):(.6+.3*sstep(120,0,A))*humanFade(A))*ifCiv(A);
const urb=A=>A>125?0:Math.pow(sstep(125,0,A),1.6)*humanFade(A)*ifCiv(A)*ifIndustry();
const roadAmt=A=>A>110?0:sstep(110,60,A)*humanFade(A)*ifCiv(A)*ifIndustry();
const railAmt=A=>A>125?0:humanFade(A)*ifCiv(A)*ifIndustry();
