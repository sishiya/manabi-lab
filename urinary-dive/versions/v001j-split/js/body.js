'use strict';
/* ---------- あなた（素材）と体の状態 ---------- */
const MATS={
 drop:{n:'尿のしずく',d:'腎乳頭からしみ出したばかりの尿。水分の状態で濃さと色が変わる。膀胱でためられ、排尿で外へ。',color:[.95,.85,.4],drop:true},
 stone3:{n:'結石 3mm',d:'結石でいちばん多い、シュウ酸カルシウムの小さな石。多くは自然に出るが、狭いところで少し引っかかる。',color:[.78,.66,.36],stone:3},
 stone7:{n:'結石 7mm',d:'大きめの石。尿管の狭いところに詰まり、激しい痛み（疝痛）と水腎症を起こす。',color:[.74,.6,.32],stone:7},
 bact:{n:'大腸菌',d:'尿道口から入り、のぼっていく。膀胱で増えると膀胱炎、腎臓まで行くと腎盂腎炎。排尿で洗い流される。',color:[.55,.82,.45],bact:true},
 scope:{n:'膀胱鏡',d:'尿道から入れる細い内視鏡。括約筋や尿管口を押し広げて、どこへでも行ける。',color:[.82,.86,.9],scope:true}
};
const ENTRIES={kidney:['腎臓','左の腎臓の、いちばん上の腎杯から'],urethra:['尿道口','外尿道口から、尿の流れとは逆向きに']};
const SEXES={M:['男性','尿道は約20cm。前立腺の中を通り、S字に曲がる'],F:['女性','尿道は約4cmと短く、まっすぐ']};
const HYDS={wet:['たっぷり飲んだ','薄くて量の多い尿（目安 約2.5mL/分）'],normal:['ふつう','約1mL/分。1日1.4〜1.5Lほど'],dry:['脱水ぎみ','抗利尿ホルモンが働き、濃くて少ない尿（目安 約0.35mL/分）']};
const BASEFLOW={wet:2.5,normal:1,dry:.35};
const URGE=[[0,'なし',0],[190,'たまった感じがする',0],[270,'行きたい・初発尿意',0],[410,'強い尿意',1],[600,'限界',2]]; // 190・270・410mL は De Wachter と Wyndaele（2003）の健康な人の平均。600mL は目安
const urgeOf=v=>{const k=P&&P.cystitis?.4:1;let u=URGE[0];for(const x of URGE)if(v>=x[0]*k)u=x;return u;};
const SIM={on:false,bodyT:0,ff:1,vol:80,bOsm:600,flow:1,osm:420,base:1,load:0,gut:0,voiding:false,voided:0,leak:false,hist:[],histT:0,hintT:0,urgeIdx:0};
let P=null;
const osmColor=o=>{const t=clamp((o-50)/1050,0,1);return t<.35?mixc([.97,.96,.78],[.96,.86,.36],t/.35):mixc([.96,.86,.36],[.8,.5,.1],(t-.35)/.65);};
const osmName=o=>o<200?'ほぼ透明':o<450?'うすい黄色':o<800?'黄色':o<1000?'濃い黄色':'琥珀色（脱水）';
const sg=o=>(1+o*2.8e-5).toFixed(3);
function urineColor(o){let c=osmColor(o);if(P&&P.cystitis)c=mixc(c,[.85,.45,.4],.35);return c;}
function urineComp(o){ // 1Lあたりのおおよその成分（g）
  const k=o/420;return {urea:12.6*k,nacl:4.3*k,creat:1.1*k,uric:.3*k,other:2*k};
}
const UC={urea:['尿素','#f2d27a'],nacl:['塩分','#cfe0f2'],creat:['クレアチニン','#e0a07a'],uric:['尿酸','#c9a0e0'],other:['その他','#9aa7a0']};
const NARROW={upj:5,iliac:4.5,uvj:3.5};

function simStep(dt,zone){ // dt: 体内時間（分）
  SIM.bodyT+=dt;
  const a=SIM.gut*Math.min(1,dt/20);SIM.gut-=a;SIM.load+=a;
  const ex=SIM.load*Math.min(1,dt/90);SIM.load-=ex;
  SIM.flow=SIM.base+(dt>0?ex/dt:0);
  SIM.osm=clamp(420/SIM.flow,50,1200);
  if(!SIM.voiding){const add=SIM.flow*dt;SIM.bOsm=(SIM.bOsm*SIM.vol+SIM.osm*add)/(SIM.vol+add);SIM.vol+=add;}
  SIM.histT+=dt;if(SIM.histT>=2){SIM.histT=0;SIM.hist.push(SIM.vol);if(SIM.hist.length>300)SIM.hist.shift();}
  if(!P)return;
  const m=P.mat;
  ({kid:()=>P.tKid+=dt,ure:()=>P.tUre+=dt,bl:()=>P.tBl+=dt,uth:()=>P.tUth+=dt}[zone]||(()=>0))();
  if(m.drop){if(zone==='bl')P.osm=SIM.bOsm;}
  if(m.stone){
    if(P.stuck){
      P.tStuck+=dt;P.hydro=Math.min(1,P.hydro+dt/240);P.pain=8+Math.round(2*Math.abs(Math.sin(SIM.bodyT/6)));
      const allow=NARROW[P.stuckReg]||5,rate=.02*clamp((allow+2-P.size)/2,0,1)*(1+SIM.load/500);
      if(Math.random()<rate*dt){P.stuck=false;P.passed=(P.passed||0)+1;P.resume=true;toast('石が狭いところを抜けた。痛みが引いていく');}
    }else{P.pain=Math.max(0,P.pain-dt*.5);P.hydro=Math.max(0,P.hydro-dt/600);}
    P.painMax=Math.max(P.painMax,P.pain);P.hydroMax=Math.max(P.hydroMax,P.hydro);
  }
  if(m.bact){
    const dbl={bl:30,kid:40,ure:120,uth:120}[zone]; // 膀胱: 尿の中の大腸菌は約22〜36分で倍になる（Forsyth ほか 2018）。腎臓・尿管・尿道の値は目安
    if(dbl)P.count=Math.min(1e9,P.count*Math.pow(2,dt/dbl));
    P.countMax=Math.max(P.countMax,P.count);
    const perML=zone==='bl'?P.count/Math.max(20,SIM.vol):0;
    if(perML>=1e5&&!P.cystitis){P.cystitis=true;toast('膀胱炎になった。細菌が尿1mLあたり10万個を超えた（検査で「細菌尿」とされる目安）。膀胱の粘膜が荒れ、尿意が近く（頻尿）、出すときに痛む。尿がにごる');}
    if(zone==='kid'){P.tKidInf+=dt;if(P.tKidInf>30&&!P.pyelo){P.pyelo=true;toast('腎盂腎炎になった。腎臓に細菌が入り込み、高い熱と背中の痛みが出る。すぐ治療が必要');}}
  }
}
function colorOf(){
  const m=P.mat;
  if(m.drop)return urineColor(P.osm);
  if(m.bact)return P.cystitis?[.7,.85,.4]:m.color;
  return m.color;
}
function formOf(){
  const m=P.mat;
  if(m.drop)return `尿 ${Math.round(P.osm)} mOsm/kg · ${osmName(P.osm)}`;
  if(m.stone)return P.stuck?`${REG[P.stuckReg].n}に詰まっている（${P.size.toFixed(1)}mm）`:`${P.size.toFixed(1)}mm · 流れに乗って移動中`;
  if(m.bact)return `菌数 ${fmtN(P.count)}${P.cling?' · 壁にしがみついている':''}`;
  return '観察中';
}
function subOf(){
  const m=P.mat;
  if(m.drop)return `比重 ${sg(P.osm)} · 膀胱の尿 ${Math.round(SIM.vol)} mL`;
  if(m.stone)return `痛み ${P.pain}/10 · 腎盂の拡張 ${Math.round(P.hydro*60)}%`;
  if(m.bact)return `膀胱の尿1mLあたり ${fmtN(P.count/Math.max(20,SIM.vol))}`;
  return `膀胱の尿 ${Math.round(SIM.vol)} mL`;
}
function paintSwatch(el,big){
  const m=P.mat,k=big?2:1,c=colorOf(),s=x=>Math.round(x*k)+'px';
  let w=30,h=30,br='50%';
  if(m.drop){w=26;h=32;br='50% 50% 50% 50% / 60% 60% 40% 40%';}
  else if(m.stone){const z=8+P.size*3.5;w=z;h=z*.85;br='42% 58% 46% 54% / 55% 44% 56% 45%';}
  else if(m.bact){w=40;h=16;br='8px';}
  else{w=50;h=14;br='7px';}
  el.style.width=s(w);el.style.height=s(h);el.style.borderRadius=br;
  el.style.background=`radial-gradient(circle at 32% 28%, rgba(255,255,255,.6), transparent 42%), ${css(c)}`;
}
function avatarState(){
  const m=P.mat,r=loc&&loc.seg?loc.seg.r:.3;
  if(m.drop)return {geo:'blob',sx:1,sy:1,sz:1.25,amp:.12,freq:2,wob:2.2,alpha:.72,metal:.4,glow:.08,along:true,size:Math.min(.12,r*.5)};
  if(m.stone)return {geo:'blob',sx:1,sy:.85,sz:1,amp:.3,freq:6,wob:0,alpha:1,metal:.25,glow:0,along:false,size:P.size/20};
  if(m.bact)return {geo:'rod',sx:1,sy:1,sz:1,amp:.04,freq:3,wob:3,alpha:.95,metal:.1,glow:.15,along:true,size:Math.min(.35,r*1.2)};
  return {geo:'rod',sx:1,sy:1,sz:1,amp:0,freq:1,wob:0,alpha:1,metal:.7,glow:0,along:true,size:Math.min(.8,r*2)};
}
function updateAvatar(dt){
  const show=tps&&!orbitOn&&mode!=='demo'&&!!P;avatar.visible=show;if(!show)return;
  const o=avatarState();
  if(avatar.geometry!==AV_GEO[o.geo])avatar.geometry=AV_GEO[o.geo];
  avatarSize+=(o.size-avatarSize)*Math.min(1,dt*2);
  const k=avatarSize,u=avatarMat.uniforms;
  avatar.scale.set(o.sx*k,o.sy*k,o.sz*k);
  avatar.position.copy(camera.position);
  const fwd=V3(0,0,-1).applyQuaternion(camera.quaternion);
  if(o.along&&inBody&&loc&&loc.tube){let t=loc.tube.S[Math.min(loc.tube.S.length-1,loc.seg.i)].T.clone();if(t.dot(fwd)<0)t.negate();_q.setFromUnitVectors(_fz,t);avatar.quaternion.slerp(_q,Math.min(1,dt*4));}
  else{avatar.rotateY(dt*.4);avatar.rotateX(dt*.17);}
  u.uColor.value.set(...lin(colorOf()));
  u.uAmp.value+=(o.amp-u.uAmp.value)*Math.min(1,dt*2);u.uFreq.value=o.freq;
  u.uWob.value=o.wob;u.uAlpha.value=o.alpha;u.uMetal.value=o.metal;u.uGlow.value=o.glow;
  const up=V3(0,1,0).applyQuaternion(camera.quaternion);
  const dist=clamp(avatarSize*Math.max(o.sz,1)*(o.geo==='rod'?3:6),.35,5);
  const want=camera.position.clone().addScaledVector(fwd,-dist).addScaledVector(up,dist*.15);
  if(inBody&&loc&&loc.tube){
    const T=loc.tube,S=T.S,ds=T.def.ds,i0=Math.min(S.length-1,loc.seg.i);
    const sgn=fwd.dot(S[i0].T)>=0?1:-1;
    let sb=loc.s-sgn*dist,ext=0;
    if(sb<0){ext=T.def.open[0]?-sb:0;sb=0;}else if(sb>T.L){ext=T.def.open[1]?sb-T.L:0;sb=T.L;}
    const sm=S[clamp(Math.round(sb/ds),0,S.length-1)];
    _ax.copy(S[i0].p);if(S[i0].stom>0)shrinkPt(_ax,S[i0].p,S[i0].stom);
    const off=camera.position.clone().sub(_ax);off.addScaledVector(S[i0].T,-off.dot(S[i0].T));
    const sp=sm.stom>0?shrinkPt(V3(0,0,0),sm.p,sm.stom):sm.p;
    want.copy(sp).addScaledVector(off,.35).addScaledVector(sm.T,-sgn*ext);
    const lim=sm.r*sm.cf*scaleAt(T,sm.s,sm.stom,sm.ure,sm.pel)*.5;_ap.copy(up).addScaledVector(sm.T,-up.dot(sm.T));
    if(_ap.lengthSq()>1e-6)want.addScaledVector(_ap.normalize(),Math.min(dist*.15,Math.max(0,lim)));
  }
  tpsPos.lerp(want,1-Math.exp(-dt*7));
  tpsCam.position.copy(tpsPos);tpsCam.up.copy(up);
  tpsCam.lookAt(camera.position.clone().addScaledVector(fwd,dist*.35));
}

