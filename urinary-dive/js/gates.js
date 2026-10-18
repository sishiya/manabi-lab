'use strict';
/* ---------- 関門と反射 ---------- */
function gateLogic(dtR){
  if(mode==='demo'){GATES.forEach(g=>{g.open+=(1-g.open)*Math.min(1,dtR*3);});return;}
  const T=loc&&loc.tube,s=loc?loc.s:0,m=P&&P.mat;
  const pushing=keys.KeyW||stick.y<-.3||(control==='guide'&&autoOn);
  // 膀胱鏡は押せば開く。細菌は尿管口を時間をかけてよじ登れる
  if(P&&inBody&&(m.scope||m.bact))GATES.forEach(g=>{
    g.hold=(g.hold||0)-dtR;
    const nearG=(T===g.T&&Math.abs(s-g.s)<1)||camera.position.distanceTo(g.p)<.9;
    const need=m.scope?.8:/^uvj/.test(g.id)?4:99;
    if(nearG&&pushing&&g.open<.5){g.push=(g.push||0)+dtR;if(g.push>need){g.hold=6;g.push=0;toast(m.scope?`${g.name}を押し広げて通過`:'鞭毛で泳ぎ、線毛で粘膜をつかみながら尿管口をよじ登った（逆流がなくても起こりうる）');}}
    else if(!nearG||!pushing)g.push=0;
  });
  // 尿管の蠕動: 尿のかたまりがいるところだけ尿管が広がる
  for(const U2 of [TUB.urL,TUB.urR]){
    let b=-100;
    if(T===U2)b=loc.s;else if(camera.position.distanceTo(U2.S[U2.S.length-1].p)<2)b=U2.L-.5;
    U2.bolusU.value=b;
  }
  // 尿管口: 尿のかたまりが来たときだけ開く（膀胱側からは閉じた弁）
  for(const [g,Ut] of [[G.uvjL,TUB.urL],[G.uvjR,TUB.urR]]){
    g.target=!SIM.voiding&&T===Ut&&s>g.s-4&&s<g.s+.5?1:0;
  }
  // 排尿
  const voidK=SIM.voiding?1:0;
  G.ius.target=G.eus.target=voidK;
  if(P&&m.scope&&P.entry==='urethra'&&!inBody&&camera.position.distanceTo(OPEN_ENDS[0].p)<3)G.eus.hold=G.ius.hold=5;
  // 結石が狭いところに詰まる
  if(P&&m.stone&&!P.stuck&&inBody&&loc.seg){
    const reg=loc.seg.reg,allow=NARROW[reg];
    if(allow&&P.size>=allow-.5&&P.lastStuckReg!==reg){P.stuck=true;P.stuckReg=reg;P.stuckT=T;P.stuckS=s;P.lastStuckReg=reg;setControl('free');vel.set(0,0,0);
      toast(`石が${REG[reg].n}に詰まった。尿がせき止められて腎盂がふくらみ（水腎症）、尿管がけいれんして激しく痛む（腎疝痛）`+(P.size>=6?'。このままでは出ない → 衝撃波で砕く':'。水を飲むと流れやすくなる'));}
  }
  $('btnESWL').hidden=!(P&&P.stuck&&P.size>=5);
  if(P&&P.resume){P.resume=false;setControl('guide',defaultDir());} // 詰まりが取れたら順路モードに戻る
  if(P&&m.stone){const side=P.stuckT&&P.stuckT.def.kid||'L';HYD[side].value+=(1+.6*P.hydro-HYD[side].value)*Math.min(1,dtR*2);}
  // 尿意の段階
  if(P){const u=URGE.indexOf(urgeOf(SIM.vol));if(u>SIM.urgeIdx&&u>=1){toast(`尿意: ${URGE[u][1]}（${Math.round(SIM.vol)}mL）`+(u>=2?kb(' · U でトイレ',' · 「トイレ」ボタンで出す'):''));}SIM.urgeIdx=u;}
  if(SIM.vol>=650&&!SIM.voiding)startVoid(true);
  GATES.forEach(g=>{if(g.hold>0)g.target=1;g.open+=(g.target-g.open)*Math.min(1,dtR*(g.id.startsWith('uvj')?6:3));});
  // 閉じた関門の前で理由を出す
  SIM.hintT-=dtR;
  if(SIM.hintT<=0&&inBody&&T&&P)for(const g of T.gates){
    if(g.open<.3&&Math.abs(s-g.s)<1){const t=gateHint(g,s<g.s);if(t){toast(t);SIM.hintT=7;}break;}
  }
}
function gateHint(g,up){
  if(P.mat.scope)return `${g.name}は閉じている。`+kb('W で押し続ける','スティックを上に倒し続ける')+'と押し広げて通れる';
  if(/^uvj/.test(g.id))return up?null:'尿管口は、膀胱から腎臓への逆流を防ぐ弁になっている'+(P.mat.bact?'。押し続けるとよじ登れる':'');
  if(up)return `${g.name}は閉じている。尿がたまって尿意が来たら${kb(' U でトイレ','「トイレ」ボタンで出す')}（いま ${Math.round(SIM.vol)}mL）`+(SIM.vol<150?kb(' · F で早送り、M で水を飲む',' · 「早送り」で速く、「水を飲む」で尿がふえる'):'');
  return P.mat.bact?null:`${g.name}は閉じている。外から尿道はさかのぼれない`;
}

/* ---------- 道しるべ ---------- */
const SIGNS=[
 {p:[7.15,-47.9,-5.45],k:'kid',t:'腎乳頭',s:'尿がしみ出す出口（乳頭孔）'},
 {p:[5.7,-51.3,-4.95],k:'kid',t:'腎盂',s:'3つの腎杯の尿が集まる'},
 {p:[-5.7,-53.3,-4.95],k:'kid',t:'腎盂',s:'3つの腎杯の尿が集まる'},
 {p:[4.6,-54.4,-4.35],k:'',t:'第1狭窄部',s:'腎盂尿管移行部 · 結石が詰まりやすい'},
 {p:[-4.6,-56.4,-4.35],k:'',t:'第1狭窄部',s:'腎盂尿管移行部 · 結石が詰まりやすい'},
 {p:[3.5,-75.2,-3.1],k:'',t:'第2狭窄部',s:'総腸骨動脈と交差する急な曲がり角'},
 {p:[-3.5,-75.2,-3.1],k:'',t:'第2狭窄部',s:'総腸骨動脈と交差する急な曲がり角'},
 {p:[3.3,-91.6,-.2],k:'',t:'第3狭窄部',s:'尿管膀胱移行部 · いちばん細い弁'},
 {p:[-3.3,-91.6,-.2],k:'',t:'第3狭窄部',s:'尿管膀胱移行部 · いちばん細い弁'},
 {p:[1.1,-93.4,1.9],k:'',t:'左尿管口',s:'蠕動の波が来ると尿が噴き出す'},
 {p:[-1.1,-93.4,1.9],k:'',t:'右尿管口',s:'蠕動の波が来ると尿が噴き出す'},
 {p:[0,-93.9,2.7],k:'',t:'膀胱三角 → 内尿道口',s:'その先は尿道'},
 {p:[0,-97.7,3.4],k:'',t:'精丘',s:'射精管と前立腺の管が開く',sex:'M'},
 {p:[0,-99.2,4.0],k:'',t:'外尿道括約筋',s:'自分の意思で締める',sex:'M'},
 {p:[0,-97.7,3.7],k:'',t:'外尿道括約筋',s:'自分の意思で締める',sex:'F'},
 {p:[0,-106.4,14.2],k:'',t:'外尿道口 → 体の外',s:'',sex:'M'},
 {p:[0,-99.4,4.7],k:'',t:'外尿道口 → 体の外',s:'',sex:'F'}
].map(o=>Object.assign(o,{v:V3(...o.p)}));
const ORBIT_LABELS=[[8,-46,-5,'左腎'],[-8,-48,-5,'右腎'],[4.5,-68,-3.5,'左尿管'],[-4.5,-68,-3.5,'右尿管'],[0,-84,5,'膀胱'],[2.5,-97.5,4,'前立腺','M'],[0,-104,13,'尿道','M'],[0,-99.5,6,'尿道','F']]
  .map(([x,y,z,t,sx])=>({v:V3(x,y,z),t,orbit:true,sex:sx}));
const signBox=$('signs');
[...SIGNS,...ORBIT_LABELS].forEach(o=>{const el=document.createElement('div');el.className='sign '+(o.orbit?'big':o.k);el.innerHTML=`<b>${o.t}</b>`+(o.s?`<span>${o.s}</span>`:'');el.hidden=true;signBox.appendChild(el);o.el=el;});
const _pv=V3(0,0,0);
function updateSigns(rc){
  const W=innerWidth,H=innerHeight,c=camera.position,show=mode!=='demo';
  for(const o of SIGNS){
    let vis=false;
    if(show&&!orbitOn&&inBody&&(!o.sex||o.sex===sex)){const d=o.v.distanceTo(c);
      if(d<4&&o.tube===undefined){const L=locate(o.v);o.tube=L.score<.4?L.tube:null;}
      if(d<4&&d>.12&&(d<1.2||!loc||o.tube===loc.tube)){_pv.copy(o.v).project(rc);if(_pv.z<1&&Math.abs(_pv.x)<1.1&&Math.abs(_pv.y)<1.1){vis=true;
        o.el.style.transform=`translate(${(_pv.x*.5+.5)*W}px,${(-_pv.y*.5+.5)*H}px) translate(-50%,-100%)`;o.el.style.opacity=clamp((4-d)/1.5,0,1);}}}
    o.el.hidden=!vis;
  }
  for(const o of ORBIT_LABELS){
    let vis=false;
    if(orbitOn&&(!o.sex||o.sex===sex)){_pv.copy(o.v).project(rc);if(_pv.z<1){vis=true;o.el.style.transform=`translate(${(_pv.x*.5+.5)*W}px,${(-_pv.y*.5+.5)*H}px) translate(-50%,-100%)`;}}
    o.el.hidden=!vis;
  }
}
function aheadInfo(){
  if(!inBody||mode==='demo')return null;
  let R,s,dir;
  if(control==='guide'){R=guide.R;dir=guideDir;s=projectOnRoute(R,camera.position,guide.s);}
  else{const n=nearestOnRoutes(camera.position,loc&&loc.tube&&loc.tube.def.kid);if(!n||n.d>2)return null;R=n.R;s=n.s;
    const a=routeAt(R,s-.5).p,b=routeAt(R,s+.5).p,f=V3(0,0,-1).applyQuaternion(camera.quaternion);dir=f.dot(b.sub(a))>=0?1:-1;}
  let lo=0,hi=R.pts.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(R.pts[m].L<s)lo=m;else hi=m;}
  const out=[],seen=new Set();let reg=R.pts[lo].reg;
  for(let k=dir>0?hi:lo;k>=0&&k<R.pts.length&&out.length<4;k+=dir){
    const q=R.pts[k],dist=Math.abs(q.L-s);
    if(q.gate&&!seen.has(q.gate)){seen.add(q.gate);out.push({gate:q.gate,dist});}
    if(q.reg!==reg&&REG[q.reg].n!==REG[reg].n){reg=q.reg;out.push({reg,dist});}
  }
  return {out,R,dir,endName:dir>0?'外尿道口 → 外':'腎乳頭（行き止まり）',end:dir>0?R.L-s:s};
}
let aheadT=0;
function updateAhead(now){
  if(now-aheadT<300)return;aheadT=now;
  const a=aheadInfo(),el=$('ahead');
  if(!a){el.innerHTML='';return;}
  const cm=d=>d<1?'すぐ':Math.round(d)+'cm';
  const parts=a.out.map(o=>o.gate?`<span class="st gate ${o.gate.open>.5?'open':''}">${o.gate.name}${o.gate.open>.5?'（開）':'（閉）'}<em>${cm(o.dist)}</em></span>`
    :`<span class="st">${REG[o.reg].n}<em>${cm(o.dist)}</em></span>`);
  if(a.out.length<4)parts.push(`<span class="st">${a.endName}<em>${cm(a.end)}</em></span>`);
  el.innerHTML=`<span class="lab">この先（${a.dir>0?a.R.fwd:a.R.rev}）</span>`+parts.join('<span class="lab">›</span>');
}

