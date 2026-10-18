'use strict';
/* ---------- 毛細血管を通る ---------- */
let capHideT=0;
function passCapillary(key){
  const c=CAP[key],before=P.so2;
  if(c.set)P.so2=Math.min(c.set,SIM.spo2);
  else P.so2=clamp(P.so2+(SIM.ex&&c.dEx?c.dEx:c.dso2),.2,1);
  P.capLog.push([c.n,before,P.so2]);if(!P.organs.includes(c.n))P.organs.push(c.n);
  $('capName').textContent=c.n;$('capText').textContent=c.d;
  $('capSo2').textContent=`酸素飽和度 ${Math.round(before*100)}% → ${Math.round(P.so2*100)}%`;
  $('cap').classList.add('show');clearTimeout(capHideT);capHideT=setTimeout(()=>$('cap').classList.remove('show'),2400);
  SIM.capT=1.6;addTrail(camera.position,true);
}

/* ---------- 弁と体の反応 ---------- */
function heartLogic(dtR){
  SIM.hr+=(SIM.hrT+(P&&P.stuck&&!P.lysis?30:0)-SIM.hr)*Math.min(1,dtR*.4);
  const prev=SIM.phase;SIM.phase=(SIM.phase+dtR*SIM.hr/60)%1;
  if(SIM.phase<prev)SIM.beats++;
  const hw=heartWave(SIM.phase);
  U.uVent.value=1-.24*hw.vs;U.uAtr.value=1-.1*hw.as;U.uArt.value=hw.aw;
  if((prev<.12&&SIM.phase>=.12))SIM.s1T=0;if(prev<.45&&SIM.phase>=.45)SIM.s2T=0;
  SIM.s1T+=dtR;SIM.s2T+=dtR;
  const cath=P&&P.mat===MATS.cath,pushing=keys.KeyW||stick.y<-.3||(control==='guide'&&autoOn);
  GATES.forEach(g=>{
    if(g.kind==='av')g.target=hw.avOpen?1:0;
    else if(g.kind==='sl')g.target=hw.slOpen?1:0;
    else g.target=(control==='guide'?guideDir>0:true)?(.6+.4*hw.aw):0; // 静脈弁は逆向きには開かない
    if(cath&&inBody&&loc&&((loc.tube===g.T&&Math.abs(loc.s-g.s)<1.2)||camera.position.distanceTo(g.p)<1.4)&&pushing){g.push=(g.push||0)+dtR;if(g.push>.6){g.hold=1.5;if(!g.told){g.told=true;toast(`${g.name}をカテーテルで押し広げて通過`);}}}else g.push=0;
    g.hold=(g.hold||0)-dtR;if(g.hold>0)g.target=1;
    g.open+=(g.target-g.open)*Math.min(1,dtR*14);
  });
  // 血栓が肺動脈に詰まる
  if(P&&P.mat===MATS.clot&&!P.stuck&&inBody&&loc&&/^pa[RL]$/.test(loc.tube.id)&&loc.s>loc.tube.L*.55&&!P.lysis){
    P.stuck=true;P.stuckT=loc.tube;P.stuckS=loc.s;setControl('free');vel.set(0,0,0);
    toast('血栓が肺動脈に詰まった（肺塞栓症）。この先の肺に血が流れず、息苦しさ・胸の痛み・脈が速くなる。命にかかわる → 血栓を溶かす薬');}
  if(P&&P.mat===MATS.clot){
    SIM.spo2+=((P.stuck&&!P.lysis?.85:.98)-SIM.spo2)*Math.min(1,dtR*.3);P.spo2Min=Math.min(P.spo2Min||1,SIM.spo2);
    if(P.lysis){P.lysis+=dtR/6;P.size=Math.max(0,8*(1-P.lysis));if(P.lysis>=1&&!P.done){P.done=true;P.stuck=false;showResult('lysis');}}
  }
  $('btnLysis').hidden=!(P&&P.stuck&&!P.lysis);
  SIM.hintT-=dtR;
  if(SIM.hintT<=0&&inBody&&loc&&loc.tube&&P)for(const g of loc.tube.gates){
    if(g.open<.3&&Math.abs(loc.s-g.s)<.9&&g.kind!=='ven'){toast(cath?`${g.name}は閉じている。`+kb('W で押し続ける','スティックを上に倒し続ける')+'と通れる':`${g.name}が閉じている。次の拍動で開くまで待つ（${g.kind==='av'?'心室がゆるむ拡張期':'心室が縮む収縮期'}に開く）`);SIM.hintT=6;break;}
  }
}

/* ---------- 道しるべ ---------- */
const SIGNS=[
 {p:[-2.9,-26.6,1.3],k:'ven',t:'上大静脈 → 右心房',s:'頭と腕から戻った血液'},
 {p:[-2.8,-33,1.4],k:'ven',t:'下大静脈の入口',s:'体の下半分から戻った血液'},
 {p:[-2.4,-32,2.3],k:'heart',t:'三尖弁 → 右心室',s:'心室がゆるむと開く'},
 {p:[1.2,-31.5,5.5],k:'heart',t:'肺動脈弁 → 肺へ',s:'心室が縮むと開く'},
 {p:[2.7,-27,4.2],k:'',t:'肺動脈の分かれ道',s:'右肺・左肺へ'},
 {p:[-6.6,-28.4,-1.3],k:'',t:'→ 肺の毛細血管',s:'この先で二酸化炭素を出し、酸素を受け取る'},
 {p:[7,-28.4,-1.2],k:'',t:'→ 肺の毛細血管',s:'この先で二酸化炭素を出し、酸素を受け取る'},
 {p:[1.5,-29.2,-1.5],k:'heart',t:'左心房',s:'4本の肺静脈が入る'},
 {p:[2.2,-31.2,-.6],k:'heart',t:'僧帽弁 → 左心室',s:'2枚の弁'},
 {p:[2.8,-32.8,2.4],k:'heart',t:'大動脈弁 → 全身へ',s:'心室が縮むと開く'},
 {p:[.6,-23.2,.2],k:'',t:'大動脈弓の分かれ道',s:'上へ: 頭（総頸動脈） / 後ろへ: 下行大動脈'},
 {p:[1.3,-45.2,-3.2],k:'',t:'上腸間膜動脈の分かれ道',s:'前へ: 腸 / 下へ: 腹部大動脈'},
 {p:[1,-49.6,-3.4],k:'',t:'腎動脈の分かれ道',s:'右へ: 腎臓'},
 {p:[.2,4.4,-1.8],k:'',t:'→ 脳の毛細血管',s:''},
 {p:[-5.2,-50.9,-5.3],k:'',t:'→ 腎臓の糸球体',s:''},
 {p:[.25,-60.4,3.5],k:'',t:'→ 腸の毛細血管',s:''},
 {p:[-5.4,-46.8,.9],k:'ven',t:'→ 肝臓の類洞',s:''},
 {p:[-5.5,-110,3.3],k:'',t:'→ 脚の筋肉の毛細血管',s:''},
 {p:[-3.9,-99.5,2.6],k:'ven',t:'静脈弁',s:'逆流を防ぐ'},
 {p:[-2.2,-44,-2.3],k:'ven',t:'肝静脈の合流',s:''},
 {p:[-2,-51.4,-3],k:'ven',t:'腎静脈の合流',s:''}
].map(o=>Object.assign(o,{v:V3(...o.p)}));
const ORBIT_LABELS=[[0,-36,6,'心臓'],[-8,-24,-1,'右肺'],[8,-24,-1,'左肺'],[1,10,-1,'脳'],[-9,-44,0,'肝臓'],[-8,-53,-5,'右腎'],[3,-66,4,'腸'],[-6,-115,3,'脚の筋肉'],[3.5,-60,-3,'大動脈'],[-4,-62,-2.5,'下大静脈']]
  .map(([x,y,z,t])=>({v:V3(x,y,z),t,orbit:true}));
const signBox=$('signs');
[...SIGNS,...ORBIT_LABELS].forEach(o=>{const el=document.createElement('div');el.className='sign '+(o.orbit?'big':o.k);el.innerHTML=`<b>${o.t}</b>`+(o.s?`<span>${o.s}</span>`:'');el.hidden=true;signBox.appendChild(el);o.el=el;});
const _pv=V3(0,0,0);
function updateSigns(rc){
  const W=innerWidth,H=innerHeight,c=camera.position,show=mode!=='demo';
  for(const o of SIGNS){
    let vis=false;
    if(show&&!orbitOn&&inBody){const d=o.v.distanceTo(c);
      if(d<5&&o.tube===undefined){const L=locate(o.v);o.tube=L.score<.6?L.tube:null;}
      if(d<5&&d>.2&&(d<1.6||!loc||o.tube===loc.tube)){_pv.copy(o.v).project(rc);if(_pv.z<1&&Math.abs(_pv.x)<1.1&&Math.abs(_pv.y)<1.1){vis=true;
        o.el.style.transform=`translate(${(_pv.x*.5+.5)*W}px,${(-_pv.y*.5+.5)*H}px) translate(-50%,-100%)`;o.el.style.opacity=clamp((5-d)/1.8,0,1);}}}
    o.el.hidden=!vis;
  }
  for(const o of ORBIT_LABELS){
    let vis=false;
    if(orbitOn){_pv.copy(o.v).project(rc);if(_pv.z<1){vis=true;o.el.style.transform=`translate(${(_pv.x*.5+.5)*W}px,${(-_pv.y*.5+.5)*H}px) translate(-50%,-100%)`;}}
    o.el.hidden=!vis;
  }
}
function aheadInfo(){
  if(!inBody||mode==='demo'||control!=='guide')return null;
  const R=guide.R,dir=guideDir,s=projectOnRoute(R,camera.position,guide.s);
  let lo=0,hi=R.pts.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(R.pts[m].L<s)lo=m;else hi=m;}
  const out=[],seen=new Set();let reg=R.pts[lo].reg;
  for(let k=dir>0?hi:lo;k>=0&&k<R.pts.length&&out.length<4;k+=dir){
    const q=R.pts[k],dist=Math.abs(q.L-s);
    if(q.portal&&dir>0){out.push({cap:CAP[q.portal].n,dist});}
    if(q.gate&&!seen.has(q.gate)){seen.add(q.gate);out.push({gate:q.gate,dist});}
    if(q.reg!==reg&&REG[q.reg].n!==REG[reg].n){reg=q.reg;out.push({reg,dist});}
  }
  return {out,R,dir};
}
let aheadT=0;
function updateAhead(now){
  if(now-aheadT<300)return;aheadT=now;
  const a=aheadInfo(),el=$('ahead');
  if(!a){el.innerHTML='';return;}
  const cm=d=>d<1?'すぐ':Math.round(d)+'cm';
  const parts=a.out.map(o=>o.gate?`<span class="st gate ${o.gate.open>.5?'open':''}">${o.gate.name}<em>${cm(o.dist)}</em></span>`
    :o.cap?`<span class="st">${o.cap}<em>${cm(o.dist)}</em></span>`:`<span class="st">${REG[o.reg].n}<em>${cm(o.dist)}</em></span>`);
  el.innerHTML=`<span class="lab">この先（${a.dir>0?'行き先: '+DEST_N[a.R.dest]:'さかのぼる'}）</span>`+parts.join('<span class="lab">›</span>');
}

