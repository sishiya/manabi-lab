'use strict';
/* ---------- 当たり判定 ---------- */
const _ab=V3(0,0,0),_ap=V3(0,0,0),_ax=V3(0,0,0);
const SEGS=[];
tubes.forEach(T=>{const S=T.S;for(let i=0;i<S.length-1;i+=3){const j=Math.min(i+3,S.length-1),a=S[i],b=S[j];
  SEGS.push({a:a.p,b:b.p,ra0:a.r*a.cf,rb0:b.r*b.cf,ra:0,rb:0,r:a.r,reg:a.reg,tube:T,i,j,sA:a.s,sB:b.s,vA:a.vent,vB:b.vent,tA:a.atr,tB:b.atr});}});
function scaleAt(T,s,vent,atr){
  let sc=(1+(U.uVent.value-1)*vent)*(1+(U.uAtr.value-1)*atr);
  let gc=0;for(const g of T.gates){const d=(s-g.s)/g.w;gc=Math.max(gc,Math.exp(-d*d)*(1-g.open)*.93);}
  return sc*(1-gc);
}
function updateSegR(){for(const g of SEGS){const m=Math.min(.1,.3*g.r);g.ra=g.ra0*scaleAt(g.tube,g.sA,g.vA,g.tA)-m;g.rb=g.rb0*scaleAt(g.tube,g.sB,g.vB,g.tB)-m;}}
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
const AO_IN=TUB.aorta.S[0].p;
function crossesClosed(La,Lb){
  if(!La||!Lb||!La.tube||!Lb.tube)return false;
  if(P&&P.stuck&&(Lb.tube!==P.stuckT||Math.abs(Lb.s-P.stuckS)>.2))return true;
  const sh=g=>g.open<.35;
  if(La.tube===Lb.tube){for(const g of La.tube.gates)if(sh(g)&&(La.s-g.s)*(Lb.s-g.s)<0)return true;return false;}
  // 左心室と大動脈の行き来は大動脈弁を通る
  const g=G.aortic;if(sh(g)){
    if(La.tube===TUB.lh&&Lb.tube===TUB.aorta&&Lb.s>g.s)return true;
    if(La.tube===TUB.aorta&&Lb.tube===TUB.lh&&La.s>g.s)return true;}
  return false;
}

/* ---------- 毛細血管（つなぎ目） ---------- */
const CAP={
 lungR:{n:'肺の毛細血管（右肺）',out:'paR',in:'pvR',set:.98,d:'肺胞を包む網の目。壁の厚さは約0.5μmで、二酸化炭素を出して酸素を受け取る。赤血球が通り抜けるのは約0.75秒。'},
 lungL:{n:'肺の毛細血管（左肺）',out:'paL',in:'pvL',set:.98,d:'左肺は心臓があるぶん右肺より少し小さい（右3葉・左2葉）。ここでも二酸化炭素を出して酸素を受け取る。'},
 brain:{n:'脳の毛細血管',out:'car',in:'jug',dso2:-.33,d:'脳は体重の約2%なのに、心臓が送る血液の約13〜15%を使う。血液脳関門があり、通れる物質が厳しく選ばれる。'},
 kidney:{n:'腎臓の糸球体と毛細血管',out:'rena',in:'renv',dso2:-.08,d:'糸球体で血漿の約20%がこされて原尿になる（尿の旅はここから始まる）。流れる量が多く、酸素はあまり使わない。'},
 gut:{n:'腸の毛細血管（絨毛）',out:'sma',in:'portal',dso2:-.2,d:'小腸の絨毛で吸収された糖やアミノ酸、アルコールを受け取る。この血液は心臓へ戻る前に、門脈で肝臓へ向かう。'},
 liver:{n:'肝臓の類洞',out:'portal',in:'hepv',dso2:-.15,d:'門脈と肝動脈の血液が混ざって流れる、すき間の多い特別な毛細血管。栄養をたくわえ、アルコールや薬を分解する。'},
 leg:{n:'脚の筋肉の毛細血管',out:'aorta',in:'femv',dso2:-.25,dEx:-.5,d:'安静時は毛細血管の一部しか開いていない。運動すると一斉に開き、筋肉がずっと多くの酸素を使う。'}
};

/* ---------- 順路（右心房から1周） ---------- */
function projectOnRoute(R,p,around){
  let bd=Infinity,s=around;
  for(const q of R.pts){if(Math.abs(q.L-around)>6)continue;const d=q.p.distanceToSquared(p);if(d<bd){bd=d;s=q.L;}}
  return s;
}
const RA_PT=V3(-3,-30,1.5),LV_MID=V3(3.6,-33.8,1.3);
const BRANCH={brain:TUB.car.S[0].p,kidney:TUB.rena.S[0].p,gut:TUB.sma.S[0].p};
function buildRoute(side,dest){
  const spec=[['rh',RA_PT,null],['pa'+side,null,null],['pv'+side,null,null,'lung'+side],['lh',TUB['pv'+side].S[TUB['pv'+side].S.length-1].p,LV_MID],['aorta',null,dest==='leg'?null:BRANCH[dest]]];
  if(dest==='brain')spec.push(['car',null,null],['jug',null,null,'brain'],['rh',null,RA_PT]);
  if(dest==='kidney')spec.push(['rena',null,null],['renv',null,null,'kidney'],['ivc',TUB.renv.S[TUB.renv.S.length-1].p,null]);
  if(dest==='gut')spec.push(['sma',null,null],['portal',null,null,'gut'],['hepv',null,null,'liver'],['ivc',TUB.hepv.S[TUB.hepv.S.length-1].p,null]);
  if(dest==='leg')spec.push(['femv',null,null,'leg'],['ivc',null,null]);
  const P=[];let lastPt=null;
  spec.forEach(([tid,from,to,portal],si)=>{const T=TUB[tid],nx=spec[si+1];
    // 次の管へ乗り移る点で切る（行き過ぎて折り返すと順路が詰まる）
    const i0=from?nearestIdx(T,from):(lastPt&&!portal?nearestIdx(T,lastPt):0);
    const i1=to?nearestIdx(T,to):(nx&&!nx[3]?nearestIdx(T,nx[1]||TUB[nx[0]].S[0].p):T.S.length-1);
    let first=true;
    for(let i=i0;i<=i1;i+=3){const sm=T.S[i];P.push({p:sm.p,r:sm.r,T,i,reg:sm.reg,gate:T.gates.find(g=>Math.abs(sm.s-g.s)<.16),portal:first&&portal?portal:null});first=false;}
    lastPt=P[P.length-1].p;});
  let L=0;P.forEach((q,k)=>{if(k&&!q.portal)L+=q.p.distanceTo(P[k-1].p);else if(k)L+=.01;q.L=L;});
  return {side,dest,pts:P,L,fwd:'流れに乗って',rev:'さかのぼる'};
}
const DESTS=['brain','kidney','gut','leg'],DEST_N={brain:'脳',kidney:'腎臓',gut:'腸と肝臓',leg:'脚',auto:'おまかせ'};
const ROUTES=[];for(const side of ['R','L'])for(const d of DESTS)ROUTES.push(buildRoute(side,d));
const routeOf=(side,d)=>ROUTES.find(R=>R.side===side&&R.dest===d);
function routeAt(R,s){
  s=clamp(s,0,R.L);let lo=0,hi=R.pts.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(R.pts[m].L<s)lo=m;else hi=m;}
  const a=R.pts[lo],b=R.pts[hi];if(b.portal)return {p:a.p.clone(),r:a.r};
  const f=clamp((s-a.L)/Math.max(1e-6,b.L-a.L),0,1);
  return {p:a.p.clone().lerp(b.p,f),r:a.r+(b.r-a.r)*f};
}
function nearestOnRoutes(p,pref){
  let best=null;
  ROUTES.forEach(R=>{for(const q of R.pts){const d=q.p.distanceTo(p)-(pref&&R.dest===pref?.3:0);if(!best||d<best.d)best={R,s:q.L,d};}});
  if(best)best.d=routeAt(best.R,best.s).p.distanceTo(p);
  return best;
}

