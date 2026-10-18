'use strict';
/* ---------- 操作の状態 ---------- */
let mode='demo',control='free',guideDir=1,autoOn=false,orbitOn=false,inBody=true;
let speedMul=1,lastLook=-1e9;
const guide={R:ROUTES[0],s:0};
const vel=V3(0,0,0),keys={};
let lookDX=0,lookDY=0,wheel=0;
const stick={x:0,y:0};
const TOUCH=matchMedia('(pointer:coarse)').matches; // タッチ端末ではキー名を出さず、スティックとボタンで言う
const kb=(pc,touch)=>TOUCH?touch:pc;
let loc=null,curReg='';
const orbit={yaw:.6,pitch:.1,dist:150,target:V3(0,-50,0)};

function teleportTo(T,i,rev){
  const sm=T.S[i];camera.position.copy(sm.p);
  const dir=sm.T.clone().multiplyScalar(rev?-1:1);
  camera.up.set(0,1,0);if(Math.abs(dir.y)>.9)camera.up.set(0,0,1);
  camera.lookAt(sm.p.clone().add(dir));vel.set(0,0,0);inBody=true;addTrail(sm.p,true);
}
const defaultDir=()=>P&&P.mat===MATS.cath?-1:1;
function setControl(c,dir){
  if(c==='guide'){
    const n=nearestOnRoutes(camera.position,P&&P.dest);
    if(!inBody||!n||n.d>2){toast('ここからは順路に乗れない');control='free';autoOn=false;updateButtons();return false;}
    guide.R=n.R;guide.s=n.s;control='guide';guideDir=dir;vel.set(0,0,0);
  }else{control='free';autoOn=false;}
  updateButtons();return true;
}
const dirName=()=>guideDir>0?'流れに乗って':'さかのぼる';
function cycleGuide(){
  if(mode!=='play')return;
  const d0=defaultDir();
  if(control==='free'){if(setControl('guide',d0))toast(`順路モード（${dirName()}）: `+kb('W を押し続けると進む','スティックを上に倒し続けると進む'));}
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
  $('btnOrbit').classList.toggle('on',orbitOn);
  $('btnTps').classList.toggle('on',tps);
  $('btnEx').classList.toggle('on',SIM.ex);$('btnEx').innerHTML=(SIM.ex?'休む':'運動する')+'<kbd>M</kbd>';
  $('btnDest').innerHTML=`行き先: ${DEST_N[SIM.destSel]}<kbd>N</kbd>`;
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
buildOpts($('optMat'),'mat',MATS,'rbc');
buildOpts($('optEntry'),'entry',ENTRIES,'femv');
buildOpts($('optAct'),'act',ACTS,'rest');
$('optMat').addEventListener('change',()=>{const m=document.querySelector('input[name=mat]:checked').value;$('entry-'+(m==='cath'?'femart':'femv')).checked=true;});
const val=n=>document.querySelector(`input[name=${n}]:checked`).value;
$('startForm').addEventListener('submit',e=>{e.preventDefault();begin(val('mat'),val('entry'),val('act'));});

function begin(matKey,entry,act){
  const m=MATS[matKey];m.id=matKey;
  P={mat:m,entry,so2:entry==='femart'?.98:.72,laps:0,dist:0,organs:[],capLog:[],size:matKey==='clot'?8:0,stuck:false,lysis:0,lapStart:0,lapTimes:[],dest:null,side:'R'};
  Object.assign(SIM,{on:true,t:0,phase:.6,hr:act==='ex'?140:65,hrT:act==='ex'?140:65,spo2:.98,ex:act==='ex',beats:0,ecg:[],capT:0,hintT:0});
  GATES.forEach(g=>{g.open=g.target=0;});
  trailN=0;trailGeo.setDrawRange(0,0);trailLast=null;
  if(entry==='ra')teleportTo(TUB.rh,nearestIdx(TUB.rh,RA_PT));
  else if(entry==='femart'){const T=TUB.aorta;teleportTo(T,T.S.length-12,true);}
  else teleportTo(TUB.femv,Math.round(1/TUB.femv.def.ds));
  mode='play';control='free';autoOn=false;orbitOn=false;guideDir=1;
  $('start').hidden=true;$('result').hidden=true;$('side').hidden=false;
  $('meName').textContent=m.n;
  updateSegR();loc=locate(camera.position);
  tps=m!==MATS.cath;tpsPos.copy(camera.position);
  P.dest=pickDest();
  setControl('guide',defaultDir());
  updateButtons();
  toast(`${m.n}として${ENTRIES[entry][0]}から入った。順路モード（${dirName()}）: `+kb('W を押し続けると進む','スティックを上に倒し続けると進む')+' · 弁が閉じている間は待つ');
}
function pickDest(){if(SIM.destSel!=='auto')return SIM.destSel;const i=P?P.laps%4:0;return DESTS[i];}
function showStart(){mode='demo';$('start').hidden=false;$('result').hidden=true;$('side').hidden=true;SIM.on=false;P=null;orbitOn=false;
  guide.R=routeOf('R','brain');guide.s=0;control='guide';guideDir=1;autoOn=true;teleportTo(TUB.rh,nearestIdx(TUB.rh,RA_PT));updateButtons();}
$('btnMenu').onclick=showStart;
$('btnSpeed').onclick=()=>{speedMul=speedMul===1?3:1;$('btnSpeed').textContent='速さ ×'+speedMul;};
$('btnAuto').onclick=()=>toggleAuto();
$('btnGuide').onclick=()=>cycleGuide();
$('btnOrbit').onclick=()=>toggleOrbit();
$('btnTps').onclick=()=>toggleTps();
$('btnEx').onclick=()=>toggleEx();
$('btnDest').onclick=()=>cycleDest();
$('btnSum').onclick=()=>{if(mode==='play')showResult();};
$('btnLysis').onclick=()=>lysis();
$('sideToggle').onclick=()=>$('side').classList.toggle('open');
$('resAgain').onclick=showStart;
$('resBack').onclick=()=>{$('result').hidden=true;if(P&&!P.done)mode='play';};
function toggleOrbit(){if(mode==='demo')return;orbitOn=!orbitOn;updateButtons();if(orbitOn)toast(kb('外観ビュー: ドラッグで回転、ホイールで拡大。光る点があなたの位置','外観ビュー: ドラッグで回転。光る点があなたの位置'));}
function toggleTps(){if(mode!=='play')return;tps=!tps;tpsPos.copy(camera.position);updateButtons();toast(tps?'三人称視点':'一人称視点');}
function toggleEx(){if(mode!=='play')return;SIM.ex=!SIM.ex;SIM.hrT=SIM.ex?140:65;updateButtons();
  toast(SIM.ex?'運動を始めた。心拍が上がり、心臓が送る血液は安静時の4〜5倍に。脚の筋肉の毛細血管が一斉に開く':'休んだ。心拍がゆっくり戻っていく');}
function cycleDest(){const k=['auto',...DESTS];SIM.destSel=k[(k.indexOf(SIM.destSel)+1)%k.length];updateButtons();
  if(P){P.dest=pickDest();if(control==='guide'&&guide.R.dest!==P.dest)retarget();}toast(`次の行き先: ${DEST_N[SIM.destSel]}`);}
function retarget(){ // 大動脈の分岐より手前なら、行き先の順路に乗り換える
  const R2=routeOf(guide.R.side,P.dest);const s2=projectOnRoute(R2,camera.position,guide.s);
  if(routeAt(R2,s2).p.distanceTo(camera.position)<1.2){guide.R=R2;guide.s=s2;}
}
function lysis(){if(!P||!P.stuck||P.lysis)return;P.lysis=.001;toast('血栓を溶かす薬（t-PA）を点滴した。プラスミンが働いてフィブリンの網がほどけていく');}

/* ---------- 入力 ---------- */
addEventListener('keydown',e=>{
  if(e.target&&e.target.tagName==='INPUT')return;
  if(e.code==='Space'){e.preventDefault();if(document.activeElement)document.activeElement.blur();if(!e.repeat)toggleAuto();return;}
  const once={KeyG:cycleGuide,KeyV:toggleOrbit,KeyT:toggleTps,KeyM:toggleEx,KeyN:cycleDest}[e.code];
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
canvas.addEventListener('wheel',e=>{e.preventDefault();if(orbitOn){orbit.dist=clamp(orbit.dist*(1+Math.sign(e.deltaY)*.1),15,400);return;}wheel+=-Math.sign(e.deltaY);if(autoOn){autoOn=false;updateButtons();}},{passive:false});
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
const MB={x0:-10,x1:10,y0:-114,y1:8};
let mapBg=null,mScale=1,mOx=0,mOy=0;
function mapSetup(){
  const dpr=Math.min(2,window.devicePixelRatio||1),w=mapC.clientWidth,h=mapC.clientHeight;if(!w)return;
  mapC.width=w*dpr;mapC.height=h*dpr;
  mScale=Math.min(w/(MB.x1-MB.x0),h/(MB.y1-MB.y0));
  mOx=w/2;mOy=(h-(MB.y1-MB.y0)*mScale)/2+MB.y1*mScale;
  mapBg=document.createElement('canvas');mapBg.width=mapC.width;mapBg.height=mapC.height;
  const x=mapBg.getContext('2d');x.scale(dpr,dpr);x.lineCap='round';x.lineJoin='round';
  for(const T of tubes){
    x.strokeStyle=VEINS.has(T.id)?'#8fa8ff':T.id==='rh'||T.id==='lh'?'#fff2ee':T.id.startsWith('pa')?'#c79ad6':'#ff6b5e';x.globalAlpha=.6;
    for(let i=0;i<T.S.length-4;i+=4){const a=T.S[i],b=T.S[i+4];x.lineWidth=Math.max(1,2*a.r*mScale);x.beginPath();x.moveTo(mOx+a.p.x*mScale,mOy-a.p.y*mScale);x.lineTo(mOx+b.p.x*mScale,mOy-b.p.y*mScale);x.stroke();}
  }
}
function drawMap(){
  if(!mapBg)return;const w=mapC.clientWidth;
  mctx.setTransform(1,0,0,1,0,0);mctx.clearRect(0,0,mapC.width,mapC.height);mctx.drawImage(mapBg,0,0);
  const dpr=mapC.width/w;mctx.setTransform(dpr,0,0,dpr,0,0);
  const p=camera.position,px=mOx+p.x*mScale,py=mOy-p.y*mScale;
  mctx.fillStyle='#fff2ee';mctx.beginPath();mctx.arc(px,py,3,0,TAU);mctx.fill();
  mctx.strokeStyle='rgba(255,242,238,.5)';mctx.beginPath();mctx.arc(px,py,6+2*Math.sin(performance.now()/300),0,TAU);mctx.stroke();
}
mapC.addEventListener('pointerdown',e=>{
  if(mode!=='play')return;
  if(P.mat!==MATS.cath){toast('地図で移動できるのはカテーテルだけ');return;}
  const r=mapC.getBoundingClientRect(),wx=(e.clientX-r.left-mOx)/mScale,wy=-(e.clientY-r.top-mOy)/mScale;
  let best=null,bd=Infinity;
  for(const T of tubes)for(let i=0;i<T.S.length;i+=2){const s=T.S[i];if(s.r<.25)continue;const d=Math.hypot(s.p.x-wx,s.p.y-wy);if(d<bd){bd=d;best=[T,i];}}
  if(!best)return;
  setControl('free');orbitOn=false;updateButtons();teleportTo(best[0],best[1]);
  toast(REG[best[0].S[best[1]].reg].n+'へ移動');
});

