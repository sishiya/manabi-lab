'use strict';
/* ---------- 当たり判定 ---------- */
const _ab=V3(0,0,0),_ap=V3(0,0,0),_ax=V3(0,0,0);
const SEGS=[];
tubes.forEach(T=>{const S=T.S;for(let i=0;i<S.length-1;i+=3){const j=Math.min(i+3,S.length-1),a=S[i],b=S[j];
  SEGS.push({a:a.p,b:b.p,ra0:a.r*a.cf,rb0:b.r*b.cf,ra:0,rb:0,r:a.r,reg:a.reg,tube:T,i,j,sA:a.s,sB:b.s,stA:a.stom,stB:b.stom});}});
function scaleAt(T,s,st){
  let sc=(1+(U.uStomR.value-1)*st)*(1-.12*Math.max(0,U.uStomFold.value-1)*st),gc=0; // しぼんだ胃はひだが深い
  for(const g of T.gates){const d=(s-g.s)/g.w;gc=Math.max(gc,Math.exp(-d*d)*(1-g.open)*(g.depth||.93));}
  return sc*(1-gc);
}
function updateSegR(){for(const g of SEGS){g.ra=g.ra0*scaleAt(g.tube,g.sA,g.stA)-.1;g.rb=g.rb0*scaleAt(g.tube,g.sB,g.stB)-.1;}}
function locate(p){
  let best=null,bs=Infinity,bh=0;
  for(const g of SEGS){
    if(g.ra<.02&&g.rb<.02)continue;
    _ab.subVectors(g.b,g.a);_ap.subVectors(p,g.a);
    const L2=_ab.lengthSq();let h=L2>0?_ap.dot(_ab)/L2:0;h=h<0?0:h>1?1:h;
    const dx=_ap.x-_ab.x*h,dy=_ap.y-_ab.y*h,dz=_ap.z-_ab.z*h,d=Math.sqrt(dx*dx+dy*dy+dz*dz);
    const sc=d-Math.max(.02,g.ra+(g.rb-g.ra)*h);
    if(sc<bs){bs=sc;best=g;bh=h;}
  }
  return {seg:best,score:bs,h:bh,s:best?best.sA+(best.sB-best.sA)*bh:0,tube:best?best.tube:null};
}
function constrain(p,vel){
  const L=locate(p);
  if(L.seg&&L.score>0){
    const g=L.seg;_ab.subVectors(g.b,g.a);_ax.copy(g.a).addScaledVector(_ab,L.h);
    const R=Math.max(.02,g.ra+(g.rb-g.ra)*L.h);_ap.subVectors(p,_ax);const d=_ap.length();
    if(d>1e-6){_ap.multiplyScalar(1/d);p.copy(_ax).addScaledVector(_ap,R);if(vel){const vn=vel.dot(_ap);if(vn>0)vel.addScaledVector(_ap,-vn);}}
  }
  return L;
}

/* 閉じた関門をまたいだ移動は取り消す */
function crossesClosed(La,Lb){
  if(!La||!Lb||!La.tube||!Lb.tube)return false;
  if(P&&P.stuck&&Lb.tube===TUB.dig&&Math.abs(Lb.s-LODGE)>.6)return true;
  const sh=g=>g.open<.35;
  if(La.tube===Lb.tube){for(const g of La.tube.gates)if(sh(g)&&(La.s-g.s)*(Lb.s-g.s)<0)return true;return false;}
  if(sh(G.icv)){
    if(La.tube===TUB.dig&&Lb.tube===TUB.colon&&La.s<G.icv.s)return true;
    if(La.tube===TUB.colon&&Lb.tube===TUB.dig&&Lb.s<G.icv.s)return true;
  }
  return false;
}

/* ---------- 順路 ---------- */
function projectOnRoute(R,p,around){
  let bd=Infinity,s=around;
  for(const q of R.pts){if(Math.abs(q.L-around)>6)continue;const d=q.p.distanceToSquared(p);if(d<bd){bd=d;s=q.L;}}
  return s;
}
function buildRoute(label,entry,spec){
  const P=[];
  for(const [tid,from,to] of spec){const T=TUB[tid];const i0=from?nearestIdx(T,V3(...from)):0,i1=to?nearestIdx(T,V3(...to)):T.S.length-1;
    const st=i0<=i1?4:-4;for(let i=i0;st>0?i<=i1:i>=i1;i+=st){const sm=T.S[i];P.push({p:sm.p,r:sm.r,T,i,reg:sm.reg,gate:T.gates.find(g=>Math.abs(sm.s-g.s)<.16)});}}
  let L=0;P.forEach((q,k)=>{if(k)L+=q.p.distanceTo(P[k-1].p);q.L=L;});
  return {label,entry,pts:P,L,gut:entry!=='nose'};
}
const ROUTES=[
  buildRoute(L('口から','from mouth'),'mouth',[['oral',null,[0,-4.6,-.6]],['dig',[0,-5,-2.4],null],['colon',[-12.2,-80.4,2],null]]),
  buildRoute(L('鼻から','from nose'),'nose',[['nasal',null,[0,.7,-1.4]],['dig',[0,.6,-2.3],[0,-6.8,-2.3]],['trachea',null,[0,-26.4,.5]],['bR',[0,-26.6,.4],null]]),
  buildRoute(L('鼻から','from nose'),'nose',[['nasal',null,[0,.7,-1.4]],['dig',[0,.6,-2.3],[0,-6.8,-2.3]],['trachea',null,[0,-26.4,.5]],['bL',[0,-26.6,.4],null]])
];
ROUTES.forEach(R=>{R.fwd=R.entry==='mouth'?L('肛門へ','to anus'):L('肺へ','to lungs');R.rev=R.entry==='mouth'?L('口へ','to mouth'):L('鼻へ','to nose');});
const routeEntry=e=>e==='anus'?'mouth':e;
const defaultDir=()=>P&&P.entry==='anus'?-1:1;
function routeAt(R,s){
  s=clamp(s,0,R.L);let lo=0,hi=R.pts.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(R.pts[m].L<s)lo=m;else hi=m;}
  const a=R.pts[lo],b=R.pts[hi],f=clamp((s-a.L)/Math.max(1e-6,b.L-a.L),0,1);
  return {p:a.p.clone().lerp(b.p,f),r:a.r+(b.r-a.r)*f};
}
function nearestOnRoutes(p,prefer){
  let best=null;
  prefer=routeEntry(prefer);
  ROUTES.forEach(R=>{for(const q of R.pts){const d=q.p.distanceTo(p)-(R.entry===prefer?.6:0);if(!best||d<best.d)best={R,s:q.L,d};}});
  if(best)best.d=routeAt(best.R,best.s).p.distanceTo(p);
  return best;
}

