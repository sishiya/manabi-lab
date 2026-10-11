'use strict';
/* ---------- 当たり判定 ---------- */
const _ab=V3(0,0,0),_ap=V3(0,0,0),_ax=V3(0,0,0);
const SEGS=[];
tubes.forEach(T=>{const S=T.S;for(let i=0;i<S.length-1;i+=3){const j=Math.min(i+3,S.length-1),a=S[i],b=S[j];
  SEGS.push({a0:a.p,b0:b.p,a:a.p.clone(),b:b.p.clone(),ra0:a.r*a.cf,rb0:b.r*b.cf,ra:0,rb:0,r:a.r,reg:a.reg,tube:T,i,j,sA:a.s,sB:b.s,stA:a.stom,stB:b.stom,uA:a.ure,uB:b.ure,pA:a.pel,pB:b.pel});}});
function scaleAt(T,s,st,ure,pel){
  let sc=(1+(U.uStomR.value-1)*st)*(1-.12*Math.max(0,U.uStomFold.value-1)*st);
  if(ure){const b=Math.exp(-Math.pow((s-T.bolusU.value)/1.3,2));sc*=1+(.45+.55*b-1)*ure;}
  if(pel&&T.hydro)sc*=1+(T.hydro.value-1)*pel;
  let gc=0;for(const g of T.gates){if(P&&P.mat.bact&&!/^uvj/.test(g.id))continue;const d=(s-g.s)/g.w;gc=Math.max(gc,Math.exp(-d*d)*(1-g.open)*(g.depth||.93));}
  return sc*(1-gc);
}
function shrinkPt(out,p0,st){const k=1+(U.uStomR.value-1)*st;out.copy(p0).sub(BASE).multiplyScalar(k).add(BASE);out.lerp(p0,0);return out;}
function updateSegR(){
  for(const g of SEGS){
    if(!g.tube.active){g.ra=g.rb=-1;continue;}
    if(g.stA>0||g.stB>0){shrinkPt(g.a,g.a0,g.stA);shrinkPt(g.b,g.b0,g.stB);}
    const m=Math.min(.1,.35*g.r);
    g.ra=g.ra0*scaleAt(g.tube,g.sA,g.stA,g.uA,g.pA)-m;g.rb=g.rb0*scaleAt(g.tube,g.sB,g.stB,g.uB,g.pB)-m;
  }
}
function locate(p){
  let best=null,bs=Infinity,bh=0;
  for(const g of SEGS){
    if(g.ra<.015&&g.rb<.015)continue;
    _ab.subVectors(g.b,g.a);_ap.subVectors(p,g.a);
    const L2=_ab.lengthSq();let h=L2>0?_ap.dot(_ab)/L2:0;h=h<0?0:h>1?1:h;
    const dx=_ap.x-_ab.x*h,dy=_ap.y-_ab.y*h,dz=_ap.z-_ab.z*h,d=Math.sqrt(dx*dx+dy*dy+dz*dz);
    const sc=d-Math.max(.015,g.ra+(g.rb-g.ra)*h);
    if(sc<bs){bs=sc;best=g;bh=h;}
  }
  return {seg:best,score:bs,h:bh,s:best?best.sA+(best.sB-best.sA)*bh:0,tube:best?best.tube:null};
}
function constrain(p,vel){
  const L=locate(p);
  if(L.seg&&L.score>0){
    const g=L.seg;_ab.subVectors(g.b,g.a);_ax.copy(g.a).addScaledVector(_ab,L.h);
    const R=Math.max(.015,g.ra+(g.rb-g.ra)*L.h);_ap.subVectors(p,_ax);const d=_ap.length();
    if(d>1e-6){_ap.multiplyScalar(1/d);p.copy(_ax).addScaledVector(_ap,R);if(vel){const vn=vel.dot(_ap);if(vn>0)vel.addScaledVector(_ap,-vn);}}
  }
  return L;
}
function crossesClosed(La,Lb){
  if(!La||!Lb||!La.tube||!Lb.tube)return false;
  if(P&&P.stuck&&(Lb.tube!==P.stuckT||Math.abs(Lb.s-P.stuckS)>.25))return true;
  const sh=g=>g.open<.35&&!(P&&P.mat.bact&&!/^uvj/.test(g.id)); // 細菌は粘膜を伝って括約筋のすき間もくぐる
  if(La.tube===Lb.tube){for(const g of La.tube.gates)if(sh(g)&&(La.s-g.s)*(Lb.s-g.s)<0)return true;return false;}
  // 尿管の終わり（膀胱内）と膀胱の行き来は尿管口の弁を通る
  for(const T of [TUB.urL,TUB.urR]){const g=T.gates[0];if(!sh(g))continue;
    if(La.tube===T&&Lb.tube===TUB.bladder&&La.s<g.s)return true;
    if(La.tube===TUB.bladder&&Lb.tube===T&&Lb.s<g.s)return true;}
  return false;
}

/* ---------- 順路 ---------- */
function projectOnRoute(R,p,around){
  let bd=Infinity,s=around;
  for(const q of R.pts){if(Math.abs(q.L-around)>6)continue;const d=q.p.distanceToSquared(p);if(d<bd){bd=d;s=q.L;}}
  return s;
}
function buildRoute(sex,kid,spec){
  const P=[];
  for(const [tid,from,to] of spec){const T=TUB[tid];const i0=from?nearestIdx(T,V3(...from)):0,i1=to?nearestIdx(T,V3(...to)):T.S.length-1;
    const st=i0<=i1?4:-4;for(let i=i0;st>0?i<=i1:i>=i1;i+=st){const sm=T.S[i];P.push({p:sm.p,r:sm.r,T,i,reg:sm.reg,gate:T.gates.find(g=>Math.abs(sm.s-g.s)<.09)});}}
  let L=0;P.forEach((q,k)=>{if(k)L+=q.p.distanceTo(P[k-1].p);q.L=L;});
  return {sex,kid,label:'腎臓から',fwd:'体の外へ',rev:'腎臓へ',pts:P,L};
}
const ALL_ROUTES=[];
for(const sex of ['M','F'])for(const kid of ['L','R']){
  const ur='ur'+kid,end=TUB[ur].S[TUB[ur].S.length-1].p;
  ALL_ROUTES.push(buildRoute(sex,kid,[[ur,null,[end.x*.92,end.y,end.z]],['bladder',[end.x*.7,end.y-.2,end.z+.3],null],['u'+sex,[0,-95.6,3.2],null]]));
}
let ROUTES=ALL_ROUTES;
const defaultDir=()=>P&&P.entry==='urethra'?-1:1;
function routeAt(R,s){
  s=clamp(s,0,R.L);let lo=0,hi=R.pts.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(R.pts[m].L<s)lo=m;else hi=m;}
  const a=R.pts[lo],b=R.pts[hi],f=clamp((s-a.L)/Math.max(1e-6,b.L-a.L),0,1);
  return {p:a.p.clone().lerp(b.p,f),r:a.r+(b.r-a.r)*f};
}
function nearestOnRoutes(p,preferKid){
  let best=null;
  ROUTES.forEach(R=>{for(const q of R.pts){const d=q.p.distanceTo(p)-(R.kid===preferKid?.3:0);if(!best||d<best.d)best={R,s:q.L,d};}});
  if(best)best.d=routeAt(best.R,best.s).p.distanceTo(p);
  return best;
}

