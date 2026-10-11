'use strict';
/* ---------- 操作の状態 ---------- */
let mode='demo',control='free',guideDir=1,autoOn=false,orbitOn=false,inBody=true;
let speedMul=1,lastLook=-1e9,sex='M';
const guide={R:ALL_ROUTES[0],s:0};
const vel=V3(0,0,0),keys={};
let lookDX=0,lookDY=0,wheel=0;
const stick={x:0,y:0};
let loc=null,curReg='';
const orbit={yaw:.6,pitch:.12,dist:115,target:V3(0,-76,0)};

function setSex(sx){
  sex=sx;
  tubes.forEach(t=>{t.active=!t.def.sex||t.def.sex===sx;t.mesh.visible=t.active;});
  OPEN_ALL.forEach(e=>e.glow.visible=e.T.active);OPEN_ENDS=OPEN_ALL.filter(e=>e.T.active);
  ROUTES=ALL_ROUTES.filter(R=>R.sex===sx);
  G.ius=G['ius'+sx];G.eus=G['eus'+sx];
  prostate.visible=sx==='M';
  GATES.forEach(g=>{const el=$('gate-'+g.id);if(el)el.hidden=!!g.sex&&g.sex!==sx;});
  SIGNS.forEach(o=>o.tube=undefined);
  mapSetup();
}
function teleportTo(T,i,rev){
  const sm=T.S[i];camera.position.copy(sm.p);
  const dir=sm.T.clone().multiplyScalar(rev?-1:1);
  camera.up.set(0,1,0);if(Math.abs(dir.y)>.9)camera.up.set(0,0,1);
  camera.lookAt(sm.p.clone().add(dir));vel.set(0,0,0);inBody=true;
}
function setControl(c,dir){
  if(c==='guide'){
    const n=nearestOnRoutes(camera.position,loc&&loc.tube&&loc.tube.def.kid);
    if(!inBody||!n||n.d>2){toast('ここからは順路に乗れない。管の中心近くで試して');control='free';autoOn=false;updateButtons();return false;}
    guide.R=n.R;guide.s=n.s;control='guide';guideDir=dir;vel.set(0,0,0);
  }else{control='free';autoOn=false;}
  updateButtons();return true;
}
const dirName=()=>guideDir>0?guide.R.fwd:guide.R.rev;
function cycleGuide(){
  if(mode!=='play')return;
  const d0=defaultDir();
  if(control==='free'){if(setControl('guide',d0))toast(`順路モード（${dirName()}）: W を押し続けると進む · S で戻る`);}
  else if(guideDir===d0){guideDir=-d0;guide.s=projectOnRoute(guide.R,camera.position,guide.s);toast(`向きを反転（${dirName()}）`);updateButtons();}
  else{setControl('free');toast('順路モードをオフ（自由移動）');}
}
function toggleAuto(){
  if(mode!=='play')return;
  if(autoOn){autoOn=false;updateButtons();toast('自動航行をオフ');return;}
  if(control!=='guide'&&!setControl('guide',defaultDir()))return;
  autoOn=true;updateButtons();toast(`自動航行（${dirName()}）`);
}
function updateButtons(){
  $('btnGuide').innerHTML=(control==='guide'?`順路: ${dirName()}`:'順路: オフ')+'<kbd>G</kbd>';
  $('btnGuide').classList.toggle('on',control==='guide');
  $('btnAuto').classList.toggle('on',autoOn);
  $('btnFF').classList.toggle('on',SIM.ff>1);
  $('btnOrbit').classList.toggle('on',orbitOn);
  $('btnTps').classList.toggle('on',tps);
  $('btnCling').hidden=!(P&&P.mat.bact);$('btnCling').classList.toggle('on',!!(P&&P.cling));
  document.body.classList.toggle('tps',tps);
  document.body.classList.toggle('orbit',orbitOn);
}

/* ---------- 開始画面 ---------- */
function buildOpts(box,name,obj,def){
  box.innerHTML='';
  for(const k in obj){const o=obj[k],id=name+'-'+k;
    const lbl=Array.isArray(o)?o[0]:o.n,desc=Array.isArray(o)?o[1]:o.d;
    box.insertAdjacentHTML('beforeend',`<div class="opt"><input type="radio" name="${name}" id="${id}" value="${k}" ${k===def?'checked':''}><label for="${id}"><b>${lbl}</b><span>${desc}</span></label></div>`);}
}
buildOpts($('optMat'),'mat',MATS,'drop');
buildOpts($('optEntry'),'entry',ENTRIES,'kidney');
buildOpts($('optSex'),'sex',SEXES,'M');
buildOpts($('optHyd'),'hyd',HYDS,'normal');
$('optMat').addEventListener('change',()=>{const m=document.querySelector('input[name=mat]:checked').value;$('entry-'+((m==='bact'||m==='scope')?'urethra':'kidney')).checked=true;});
const val=n=>document.querySelector(`input[name=${n}]:checked`).value;
$('startForm').addEventListener('submit',e=>{e.preventDefault();begin(val('mat'),val('entry'),val('sex'),val('hyd'));});

function begin(matKey,entry,sx,hyd){
  const m=MATS[matKey];m.id=matKey;
  setSex(sx);
  P={mat:m,entry,tKid:0,tUre:0,tBl:0,tUth:0,osm:0,size:m.stone||0,stuck:false,hydro:0,hydroMax:0,pain:0,painMax:0,tStuck:0,eswl:false,
    count:5000,countMax:5000,cling:false,cystitis:false,pyelo:false,tKidInf:0,flushes:0,visited:new Set()};
  Object.assign(SIM,{on:true,bodyT:0,ff:1,vol:entry==='urethra'?180:60,bOsm:420/BASEFLOW[hyd],base:BASEFLOW[hyd],load:hyd==='wet'?500:0,gut:0,voiding:false,voided:0,leak:false,hist:[],histT:0,hintT:0,urgeIdx:0});
  SIM.flow=SIM.base;SIM.osm=clamp(420/SIM.flow,50,1200);SIM.bOsm=SIM.osm;P.osm=SIM.osm;
  GATES.forEach(g=>{g.open=g.target=0;g.hold=0;g.push=0;});
  HYD.L.value=HYD.R.value=1;
  trailN=0;trailGeo.setDrawRange(0,0);
  U.uStomR.value=volScale(SIM.vol);
  if(entry==='urethra'){const T=TUB['u'+sx];teleportTo(T,T.S.length-4,true);}
  else teleportTo(TUB.urL,Math.round(.35/TUB.urL.def.ds));
  mode='play';control='free';autoOn=false;orbitOn=false;guideDir=1;
  $('start').hidden=true;$('result').hidden=true;$('side').hidden=false;
  $('meName').textContent=m.n;
  updateSegR();loc=locate(camera.position);
  tps=!m.scope;tpsPos.copy(camera.position);
  setControl('guide',defaultDir());
  updateButtons();
  toast(`${m.n}として${ENTRIES[entry][0]}から入った（${SEXES[sx][0]}）。順路モード（${dirName()}）: W を押し続けると進む`+(m.bact?' · C で壁にしがみつく':''));
}
function showStart(){mode='demo';$('start').hidden=false;$('result').hidden=true;$('side').hidden=true;SIM.on=false;P=null;orbitOn=false;
  setSex(sex);guide.R=ROUTES[0];guide.s=0;control='guide';guideDir=1;autoOn=true;teleportTo(TUB.urL,Math.round(.35/TUB.urL.def.ds));updateButtons();}
$('btnMenu').onclick=showStart;
$('btnSpeed').onclick=()=>{speedMul=speedMul===1?3:1;$('btnSpeed').textContent='速さ ×'+speedMul;};
$('btnAuto').onclick=()=>toggleAuto();
$('btnGuide').onclick=()=>cycleGuide();
$('btnFF').onclick=()=>toggleFF();
$('btnOrbit').onclick=()=>toggleOrbit();
$('btnTps').onclick=()=>toggleTps();
$('btnDrink').onclick=()=>drink();
$('btnToilet').onclick=()=>startVoid(false);
$('btnCling').onclick=()=>toggleCling();
$('btnESWL').onclick=()=>eswl();
$('sideToggle').onclick=()=>$('side').classList.toggle('open');
$('resAgain').onclick=showStart;
$('resLook').onclick=()=>{$('result').hidden=true;mode='play';orbitOn=true;updateButtons();};
function toggleFF(){if(mode!=='play')return;SIM.ff=SIM.ff>1?1:10;updateButtons();toast(SIM.ff>1?'早送り ×10':'早送りをオフ');}
function toggleOrbit(){if(mode==='demo')return;orbitOn=!orbitOn;updateButtons();if(orbitOn)toast('外観ビュー: ドラッグで回転、ホイールで拡大。光る点があなたの位置');}
function toggleTps(){if(mode!=='play')return;tps=!tps;tpsPos.copy(camera.position);updateButtons();toast(tps?'三人称視点':'一人称視点');}
function drink(){if(mode!=='play')return;SIM.gut+=500;toast('水を500mL飲んだ。腸から吸収されると、腎臓がつくる尿が増え、薄くなっていく（このアプリでは約20分で吸収される目安）');}
function toggleCling(){if(!P||!P.mat.bact)return;P.cling=!P.cling;if(P.cling){vel.set(0,0,0);if(control==='guide')setControl('free');}updateButtons();
  toast(P.cling?'線毛（1型線毛）で粘膜にしがみついた。流されにくいが動けない':'粘膜から離れた');}
function eswl(){if(!P||!P.stuck)return;P.stuck=false;P.size=1.5;P.eswl=true;P.resume=true;$('btnESWL').hidden=true;
  toast('体外衝撃波結石破砕術（ESWL）: 体の外から衝撃波を当てて、石を砂粒ほどに砕いた。尿といっしょに流れていく');}
function startVoid(forced){
  if(mode!=='play'||SIM.voiding)return;
  if(SIM.vol<40){toast('膀胱にほとんどたまっていない（'+Math.round(SIM.vol)+'mL）');return;}
  SIM.voiding=true;SIM.voided=0;SIM.voidStart=SIM.vol;SIM.leak=forced;
  toast(forced?'がまんの限界。膀胱の壁（排尿筋）が勝手に縮み、もれてしまった':'排尿反射: 膀胱の排尿筋が縮み、内尿道括約筋と外尿道括約筋がゆるむ。尿管口は押しつぶされて逆流しない');
}
const volScale=v=>clamp(Math.cbrt(Math.max(v,15)/480),.32,1.1);

/* ---------- 入力 ---------- */
addEventListener('keydown',e=>{
  if(e.target&&e.target.tagName==='INPUT')return;
  if(e.code==='Space'){e.preventDefault();if(document.activeElement)document.activeElement.blur();if(!e.repeat)toggleAuto();return;}
  const once={KeyG:cycleGuide,KeyF:toggleFF,KeyV:toggleOrbit,KeyT:toggleTps,KeyM:drink,KeyU:()=>startVoid(false),KeyC:toggleCling}[e.code];
  if(once){if(!e.repeat)once();return;}
  if(e.code.startsWith('Arrow'))e.preventDefault();
  keys[e.code]=true;
  if(autoOn&&['KeyW','KeyS'].includes(e.code)){autoOn=false;updateButtons();}
});
addEventListener('keyup',e=>{keys[e.code]=false;});
addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});
let drag=null;
canvas.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;lookDX+=e.clientX-drag.x;lookDY+=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;lastLook=performance.now();});
const endDrag=e=>{if(drag&&drag.id===e.pointerId)drag=null;};
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
canvas.addEventListener('wheel',e=>{e.preventDefault();if(orbitOn){orbit.dist=clamp(orbit.dist*(1+Math.sign(e.deltaY)*.1),15,300);return;}wheel+=-Math.sign(e.deltaY);if(autoOn){autoOn=false;updateButtons();}},{passive:false});
const stickEl=$('stick'),knob=$('knob');let stickId=null;
function stickMove(e){const r=stickEl.getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/(r.width/2),y=(e.clientY-r.top-r.height/2)/(r.height/2);
  const l=Math.hypot(x,y);if(l>1){x/=l;y/=l;}stick.x=x;stick.y=y;knob.style.transform=`translate(${x*37}px,${y*37}px)`;}
stickEl.addEventListener('pointerdown',e=>{stickId=e.pointerId;stickEl.setPointerCapture(e.pointerId);stickMove(e);if(autoOn){autoOn=false;updateButtons();}});
stickEl.addEventListener('pointermove',e=>{if(e.pointerId===stickId)stickMove(e);});
const stickEnd=e=>{if(e.pointerId!==stickId)return;stickId=null;stick.x=stick.y=0;knob.style.transform='';};
stickEl.addEventListener('pointerup',stickEnd);stickEl.addEventListener('pointercancel',stickEnd);
let toastT=0;
function toast(t){if(mode==='demo')return;const el=$('toast');el.textContent=t;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),4200);}

/* ---------- 地図 ---------- */
const mapC=$('map'),mctx=mapC.getContext('2d');
const MB={x0:-11,x1:11,y0:-109,y1:-44};
let mapBg=null,mScale=1,mOx=0,mOy=0;
function mapSetup(){
  const dpr=Math.min(2,window.devicePixelRatio||1),w=mapC.clientWidth,h=mapC.clientHeight;if(!w)return;
  mapC.width=w*dpr;mapC.height=h*dpr;
  mScale=Math.min(w/(MB.x1-MB.x0),h/(MB.y1-MB.y0));
  mOx=w/2;mOy=(h-(MB.y1-MB.y0)*mScale)/2+MB.y1*mScale;
  mapBg=document.createElement('canvas');mapBg.width=mapC.width;mapBg.height=mapC.height;
  const x=mapBg.getContext('2d');x.scale(dpr,dpr);x.lineCap='round';x.lineJoin='round';
  x.fillStyle='rgba(255,157,122,.18)';organs.forEach(o=>{x.beginPath();x.ellipse(mOx+o.position.x*mScale,mOy-o.position.y*mScale,o.scale.x*mScale,o.scale.y*mScale,0,0,TAU);x.fill();});
  for(const T of tubes){if(!T.active)continue;
    x.strokeStyle=T.def.kid&&!/^ur/.test(T.id)?'#ff9d7a':'#f3c95a';x.globalAlpha=.6;
    for(let i=0;i<T.S.length-4;i+=4){const a=T.S[i],b=T.S[i+4];x.lineWidth=Math.max(1.2,2*a.r*mScale);x.beginPath();x.moveTo(mOx+a.p.x*mScale,mOy-a.p.y*mScale);x.lineTo(mOx+b.p.x*mScale,mOy-b.p.y*mScale);x.stroke();}
  }
  x.globalAlpha=1;x.fillStyle='#fff4e0';
  GATES.forEach(g=>{if(g.T.active)x.fillRect(mOx+g.p.x*mScale-2,mOy-g.p.y*mScale-.5,4,1);});
}
function drawMap(){
  if(!mapBg)return;const w=mapC.clientWidth;
  mctx.setTransform(1,0,0,1,0,0);mctx.clearRect(0,0,mapC.width,mapC.height);mctx.drawImage(mapBg,0,0);
  const dpr=mapC.width/w;mctx.setTransform(dpr,0,0,dpr,0,0);
  const p=camera.position,px=mOx+p.x*mScale,py=mOy-p.y*mScale;
  const f=V3(0,0,-1).applyQuaternion(camera.quaternion);const fl=Math.hypot(f.x,f.y)||1;
  mctx.strokeStyle='#fff4e0';mctx.lineWidth=1.5;mctx.beginPath();mctx.moveTo(px,py);mctx.lineTo(px+f.x/fl*12*Math.min(1,fl*1.5),py-f.y/fl*12*Math.min(1,fl*1.5));mctx.stroke();
  mctx.fillStyle='#fff4e0';mctx.beginPath();mctx.arc(px,py,3.2,0,TAU);mctx.fill();
  mctx.strokeStyle='rgba(255,244,224,.5)';mctx.beginPath();mctx.arc(px,py,6+2*Math.sin(performance.now()/300),0,TAU);mctx.stroke();
}
mapC.addEventListener('pointerdown',e=>{
  if(mode!=='play')return;
  if(!P.mat.scope){toast('地図で移動できるのは膀胱鏡だけ');return;}
  const r=mapC.getBoundingClientRect(),wx=(e.clientX-r.left-mOx)/mScale,wy=-(e.clientY-r.top-mOy)/mScale;
  let best=null,bd=Infinity;
  for(const T of tubes){if(!T.active)continue;for(let i=0;i<T.S.length;i+=2){const s=T.S[i];if(s.r<.15)continue;const d=Math.hypot(s.p.x-wx,s.p.y-wy);if(d<bd){bd=d;best=[T,i];}}}
  if(!best)return;
  setControl('free');orbitOn=false;updateButtons();teleportTo(best[0],best[1]);
  toast(REG[best[0].S[best[1]].reg].n+'へ移動');
});

