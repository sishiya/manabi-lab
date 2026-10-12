'use strict';
/* ---------- 操作の状態 ---------- */
let mode='demo';          // demo | play | result
let control='free';       // free | guide
let guideDir=1,autoOn=false,orbitOn=false,inBody=true;
let lastLook=-1e9;
const guide={R:ROUTES[0],s:0};
const vel=V3(0,0,0),keys={};
let lookDX=0,lookDY=0,wheel=0;
const stick={x:0,y:0};
let loc=null,curReg='';
const orbit={yaw:.5,pitch:.15,dist:170,target:V3(0,-45,1)};

function teleportTo(T,i,rev){
  const sm=T.S[i];camera.position.copy(sm.p);
  const dir=sm.T.clone().multiplyScalar(rev?-1:1);
  camera.up.set(0,1,0);if(Math.abs(dir.y)>.9)camera.up.set(0,0,1);
  camera.lookAt(sm.p.clone().add(dir));vel.set(0,0,0);inBody=true;
}
function setControl(c,dir){
  if(c==='guide'){
    const n=nearestOnRoutes(camera.position,P?P.entry:null);
    if(!inBody||!n||n.d>2.5){toast(L('ここからは順路に乗れない。管の中心近くで試すか、地図で太い管を選んで','Can’t join the route from here. Try near the center of the tube, or pick a wide tube on the map'));control='free';autoOn=false;updateButtons();return false;}
    guide.R=n.R;guide.s=n.s;control='guide';guideDir=dir;vel.set(0,0,0);
  }else{control='free';autoOn=false;}
  updateButtons();return true;
}
const dirName=()=>guideDir>0?guide.R.fwd:guide.R.rev;
function cycleGuide(){ // オフ → 既定の向き → 逆向き → オフ
  if(mode!=='play')return;
  const d0=defaultDir();
  if(control==='free'){if(setControl('guide',d0))toast(L(`順路モード（${dirName()}）: W を押し続けると順路に沿って進む · S で戻る`,`Route mode (${dirName()}): hold W to follow the route · S to go back`));}
  else if(guideDir===d0){guideDir=-d0;guide.s=projectOnRoute(guide.R,camera.position,guide.s);toast(L(`向きを反転（${dirName()}）`,`Direction reversed (${dirName()})`));updateButtons();}
  else{setControl('free');toast(L('順路モードをオフ（自由移動）','Route mode off (free movement)'));}
}
function toggleAuto(){
  if(mode!=='play')return;
  if(autoOn){autoOn=false;updateButtons();toast(L('自動航行をオフ','Autopilot off'));return;}
  if(control!=='guide'&&!setControl('guide',guideDir||defaultDir()))return;
  autoOn=true;updateButtons();toast(L(`自動航行（${dirName()}）`,`Autopilot (${dirName()})`));
}
function updateButtons(){
  $('btnGuide').innerHTML=(control==='guide'?L(`順路: ${dirName()}`,`Route: ${dirName()}`):L('順路: オフ','Route: off'))+'<kbd>G</kbd>';
  $('btnGuide').classList.toggle('on',control==='guide');
  $('btnAuto').classList.toggle('on',autoOn);
  $('btnFF').classList.toggle('on',SIM.ff>1);
  $('btnOrbit').classList.toggle('on',orbitOn);
  $('btnTps').classList.toggle('on',tps);
  document.body.classList.toggle('tps',tps);
  document.body.classList.toggle('orbit',orbitOn);
}

/* ---------- 開始画面 ---------- */
function buildOpts(box,name,obj,def,descKey){
  box.innerHTML='';
  for(const k in obj){const o=obj[k],id=name+'-'+k;
    const lbl=Array.isArray(o)?o[0]:o.n,desc=Array.isArray(o)?o[1]:o.d;
    box.insertAdjacentHTML('beforeend',`<div class="opt"><input type="radio" name="${name}" id="${id}" value="${k}" ${k===def?'checked':''}><label for="${id}"><b>${lbl}</b><span>${desc}</span></label></div>`);}
}
buildOpts($('optMat'),'mat',MATS,'capsule');
buildOpts($('optEntry'),'entry',ENTRIES,'mouth');
buildOpts($('optBelly'),'belly',BELLY,'hungry');
// 言語の切り替え（ページを読み直す）と、言語で変わる属性（I18N.md）
document.querySelectorAll('#langsw button').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.l===LANG));b.onclick=()=>{if(b.dataset.l!==LANG)setLang(b.dataset.l);};});
document.title=L('体内ダイブ','Body Dive');
$('map').setAttribute('aria-label',L('体の正面図。クリックでその場所へ移動','Front view of the body. Click to move there'));
updateButtons();
function syncEntries(){}
$('optMat').addEventListener('change',syncEntries);syncEntries();
$('startForm').addEventListener('submit',e=>{e.preventDefault();
  begin(document.querySelector('input[name=mat]:checked').value,document.querySelector('input[name=entry]:checked').value,document.querySelector('input[name=belly]:checked').value);});

function begin(matKey,entry,belly){
  const m=MATS[matKey];m.id=matKey;
  P={mat:m,entry,comp:Object.assign({},m.comp),size:m.size,prog:0,acid:0,bile:0,sterco:0,coat:0,tMouth:0,tStom:0,tSB:0,tColon:0,saliva:0,absorbed:{water:0},start:mass0(m),
    burn:0,stuck:false,stuckSeen:false,gas:0,fermented:0,diarrhea:false,vomited:false,pushT:0};
  Object.assign(SIM,{massT:0,blood:0,bacPeak:0,hist:[],histT:0,vomit:false,vomitT:0});
  Object.assign(SIM,{on:true,bodyT:0,ff:10,content:belly==='full'?800:50,mmc:belly==='full'?0:Math.random()*80,phase:1,lastPhase:1,swallowT:99,carry:false,cool:0,icvHold:0,icvPush:0,analHold:0,hintT:0,coughT:0,urgeShown:false});
  GATES.forEach(g=>{g.open=g.target=g.id==='glot'?1:0;});
  if(entry==='anus')G.anal.open=1;
  trailN=0;trailGeo.setDrawRange(0,0);
  for(let i=0;i<FN;i++)placeFood(i,1e9);
  if(entry==='nose')teleportTo(TUB.nasal,2);
  else if(entry==='anus')teleportTo(TUB.colon,TUB.colon.S.length-2,true);
  else teleportTo(TUB.oral,2);
  mode='play';control='free';autoOn=false;orbitOn=false;guideDir=1;
  $('start').hidden=true;$('result').hidden=true;$('side').hidden=false;
  $('meName').textContent=m.n;
  updateButtons();
  loc=locate(camera.position);
  tps=false;tpsPos.copy(camera.position); // 最初は一人称（T で三人称）
  setControl('guide',defaultDir());
  toast(L(`${m.n}として${ENTRIES[entry][0]}から入った。`+(entry==='mouth'&&m.dig&&!m.liquid?'口にいる間はかまれて細かくなる。':'')+`W を押し続けると${dirName()}進む（G で向きを変える）`,
  `You are “${m.n}”, in through the ${ENTRIES[entry][0].toLowerCase()}. `+(entry==='mouth'&&m.dig&&!m.liquid?'In the mouth you get chewed into small pieces. ':'')+`Hold W to move (${dirName()}) · G to change direction`));
}
function mass0(m){let s=0;for(const k in m.comp)s+=m.comp[k];return s;}
function showStart(){mode='demo';$('start').hidden=false;$('result').hidden=true;$('side').hidden=true;SIM.on=false;P=null;orbitOn=false;
  guide.R=ROUTES[0];guide.s=0;control='guide';guideDir=1;autoOn=true;teleportTo(TUB.oral,0);updateButtons();}
$('btnMenu').onclick=showStart;
$('btnAuto').onclick=()=>toggleAuto();
$('btnGuide').onclick=()=>cycleGuide();
$('btnFF').onclick=()=>toggleFF();
$('btnOrbit').onclick=()=>toggleOrbit();
$('sideToggle').onclick=()=>$('sideToggle').setAttribute('aria-expanded',String($('side').classList.toggle('open')));
$('resAgain').onclick=showStart;
$('btnMeal').onclick=()=>eatMeal();
$('btnTps').onclick=()=>toggleTps();
function eatMeal(){
  if(mode!=='play'||!P)return;
  SIM.content=Math.min(1500,SIM.content+700);
  const gc=REG[curReg]&&(REG[curReg].z==='colon')&&P.tColon>=360&&!P.massDone;
  if(gc)P.mealPush=true;
  toast(L('食事をした（約700mL）。胃がふくらみ、食後の動きに切りかわる。'+(gc?'胃結腸反射で大腸が動き出す…':''),'Had a meal (about 700 mL). The stomach swells and switches to after-meal movements. '+(gc?'The gastrocolic reflex sets the large intestine moving…':'')));
}
$('btnRemove').onclick=()=>{if(P&&P.stuck){P.stuck=false;showResult('removed');}};
$('resLook').onclick=()=>{$('result').hidden=true;mode='play';orbitOn=true;updateButtons();};
function toggleFF(){if(mode!=='play')return;SIM.ff=SIM.ff>1?1:10;updateButtons();toast(SIM.ff>1?L('早送り ×10（体内時間が10倍速く進む）','Fast-forward ×10 (body time runs 10 times faster)'):L('早送りをオフ','Fast-forward off'));}
function toggleOrbit(){if(mode==='demo')return;orbitOn=!orbitOn;updateButtons();if(orbitOn)toast(L('外観ビュー: ドラッグで回転、ホイールで拡大。光る点があなたの位置','Outside view: drag to rotate, wheel to zoom. The glowing dot is you'));}

/* ---------- 入力 ---------- */
addEventListener('keydown',e=>{
  if(e.target&&e.target.tagName==='INPUT')return;
  if(e.code==='Space'){e.preventDefault();if(document.activeElement)document.activeElement.blur();if(!e.repeat)toggleAuto();return;}
  if(e.code==='KeyG'&&!e.repeat){cycleGuide();return;}
  if(e.code==='KeyF'&&!e.repeat){toggleFF();return;}
  if(e.code==='KeyV'&&!e.repeat){toggleOrbit();return;}
  if(e.code==='KeyM'&&!e.repeat){eatMeal();return;}
  if(e.code==='KeyT'&&!e.repeat){toggleTps();return;}
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
canvas.addEventListener('wheel',e=>{e.preventDefault();if(orbitOn){orbit.dist=clamp(orbit.dist*(1+Math.sign(e.deltaY)*.1),25,400);return;}wheel+=-Math.sign(e.deltaY);if(autoOn){autoOn=false;updateButtons();}},{passive:false});
const stickEl=$('stick'),knob=$('knob');let stickId=null;
function stickMove(e){const r=stickEl.getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/(r.width/2),y=(e.clientY-r.top-r.height/2)/(r.height/2);
  const l=Math.hypot(x,y);if(l>1){x/=l;y/=l;}stick.x=x;stick.y=y;knob.style.transform=`translate(${x*37}px,${y*37}px)`;}
stickEl.addEventListener('pointerdown',e=>{stickId=e.pointerId;stickEl.setPointerCapture(e.pointerId);stickMove(e);if(autoOn){autoOn=false;updateButtons();}});
stickEl.addEventListener('pointermove',e=>{if(e.pointerId===stickId)stickMove(e);});
const stickEnd=e=>{if(e.pointerId!==stickId)return;stickId=null;stick.x=stick.y=0;knob.style.transform='';};
stickEl.addEventListener('pointerup',stickEnd);stickEl.addEventListener('pointercancel',stickEnd);

let toastT=0;
function toast(t){if(mode==='demo')return;const el=$('toast');el.textContent=t;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),3800);}

/* ---------- 地図 ---------- */
const mapC=$('map'),mctx=mapC.getContext('2d');
const MB={x0:-15,x1:15,y0:-101,y1:12};
let mapBg=null,mScale=1,mOx=0,mOy=0;
function mapSetup(){
  const dpr=Math.min(2,window.devicePixelRatio||1),w=mapC.clientWidth,h=mapC.clientHeight;
  mapC.width=w*dpr;mapC.height=h*dpr;
  mScale=Math.min(w/(MB.x1-MB.x0),h/(MB.y1-MB.y0));
  mOx=w/2;mOy=(h-(MB.y1-MB.y0)*mScale)/2+MB.y1*mScale;
  mapBg=document.createElement('canvas');mapBg.width=mapC.width;mapBg.height=mapC.height;
  const x=mapBg.getContext('2d');x.scale(dpr,dpr);x.lineCap='round';x.lineJoin='round';
  for(const T of tubes){
    const isAir=AIRWAY.has(T.id);x.strokeStyle=isAir?'#9ad4f5':'#ffb48c';x.globalAlpha=isAir?.55:.32;
    for(let i=0;i<T.S.length-4;i+=4){const a=T.S[i],b=T.S[i+4];x.lineWidth=Math.max(1.2,2*a.r*mScale);x.beginPath();x.moveTo(mOx+a.p.x*mScale,mOy-a.p.y*mScale);x.lineTo(mOx+b.p.x*mScale,mOy-b.p.y*mScale);x.stroke();}
  }
  x.globalAlpha=1;x.fillStyle='#fff1e4';
  GATES.forEach(g=>{x.fillRect(mOx+g.p.x*mScale-2,mOy-g.p.y*mScale-.5,4,1);});
}
function drawMap(){
  if(!mapBg)return;const w=mapC.clientWidth;
  mctx.setTransform(1,0,0,1,0,0);mctx.clearRect(0,0,mapC.width,mapC.height);mctx.drawImage(mapBg,0,0);
  const dpr=mapC.width/w;mctx.setTransform(dpr,0,0,dpr,0,0);
  const p=camera.position,px=mOx+p.x*mScale,py=mOy-p.y*mScale;
  const f=V3(0,0,-1).applyQuaternion(camera.quaternion);const fl=Math.hypot(f.x,f.y)||1;
  mctx.strokeStyle='#fff1e4';mctx.lineWidth=1.5;mctx.beginPath();mctx.moveTo(px,py);mctx.lineTo(px+f.x/fl*12*Math.min(1,fl*1.5),py-f.y/fl*12*Math.min(1,fl*1.5));mctx.stroke();
  mctx.fillStyle='#fff1e4';mctx.beginPath();mctx.arc(px,py,3.2,0,TAU);mctx.fill();
  mctx.strokeStyle='rgba(255,241,228,.5)';mctx.beginPath();mctx.arc(px,py,6+2*Math.sin(performance.now()/300),0,TAU);mctx.stroke();
}
mapC.addEventListener('pointerdown',e=>{
  if(mode!=='play'){toast(L('まず開始画面で「ダイブ開始」を押して','First press “Start dive” on the start screen'));return;}
  if(P.mat!==MATS.capsule){toast(L('食べ物は流れに沿ってしか進めない。地図で飛べるのはカプセル内視鏡だけ','Food can only move along with the flow. Only the capsule endoscope can jump on the map'));return;}
  const r=mapC.getBoundingClientRect(),wx=(e.clientX-r.left-mOx)/mScale,wy=-(e.clientY-r.top-mOy)/mScale;
  let best=null,bd=Infinity;
  for(const T of tubes)for(let i=0;i<T.S.length;i+=2){const s=T.S[i];if(s.r<.3)continue;const d=Math.hypot(s.p.x-wx,s.p.y-wy);if(d<bd){bd=d;best=[T,i];}}
  if(!best)return;
  setControl('free');orbitOn=false;updateButtons();teleportTo(best[0],best[1]);
  toast(L(REG[best[0].S[best[1]].reg].n+'へ移動','Moved to the '+REG[best[0].S[best[1]].reg].n.toLowerCase()));
});

