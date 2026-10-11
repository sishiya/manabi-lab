'use strict';
/* ---------- HUD ---------- */
function showRegion(key){
  const R=REG[key],el=$('loc');el.classList.add('swap');
  setTimeout(()=>{$('locSys').textContent=R.sys;$('locSys').classList.toggle('kid',R.sys===KID);
    $('locName').textContent=R.n;$('locEn').textContent=R.en;$('locDesc').textContent=R.d;el.classList.remove('swap');},reduceMotion?0:220);
}
$('gates').innerHTML=GATES.map(g=>`<li id="gate-${g.id}">${g.name}</li>`).join('');
let hudT=0,lastPos=V3(0,0,0),spd=0;
function updateHUD(dt,now){
  spd+=(camera.position.distanceTo(lastPos)/Math.max(dt,1e-3)-spd)*Math.min(1,dt*4);lastPos.copy(camera.position);
  if(now-hudT<150)return;hudT=now;
  $('rDia').textContent=!inBody||!loc||!loc.seg?'—':(2*loc.seg.r*10).toFixed(1)+' mm';
  const n=control==='guide'?{R:guide.R,s:projectOnRoute(guide.R,camera.position,guide.s),d:0}:(inBody?nearestOnRoutes(camera.position,loc&&loc.tube&&loc.tube.def.kid):null);
  $('rDist').textContent=!n||n.d>=2?'—':P&&P.entry==='urethra'?'尿道口から '+Math.round(n.R.L-n.s)+' cm':'腎乳頭から '+Math.round(n.s)+' cm';
  $('rSpd').textContent=spd.toFixed(1)+' cm/s';
  $('rMode').textContent=(P&&P.cling)?'しがみつき中':autoOn?'自動 · '+dirName():control==='guide'?'順路 · '+dirName():(inBody?'手動':'手動 · 体外');
  GATES.forEach(g=>$('gate-'+g.id).classList.toggle('open',g.open>.5));
  if(!P)return;
  $('bTime').textContent=fmtT(SIM.bodyT);
  $('bScale').textContent='×'+(tscNow());
  $('bVol').textContent=Math.round(SIM.vol)+' mL'+(SIM.voiding?' · 排尿中':'');
  const u=urgeOf(SIM.vol);$('bUrge').textContent=u[1];$('bUrge').className='risk'+u[2];
  $('urgeFill').style.width=clamp(SIM.vol/600*100,0,100)+'%';$('urgeFill').style.background=css(urineColor(SIM.bOsm));
  $('bFlow').textContent=SIM.flow.toFixed(1)+' mL/分';
  $('bOsm').textContent=`${Math.round(SIM.osm)} · ${osmName(SIM.osm)}`;
  const hz=hazard();$('bRisk').textContent=hz[0]?`${['','注意','警告','危険'][hz[0]]} · ${hz[1]}`:'なし';$('bRisk').className='risk'+hz[0];
  drawSpark();
  $('meState').textContent=formOf();$('meMass').textContent=subOf();
  paintSwatch($('swatch'));
  if(P.mat.drop){const c=urineComp(P.osm),ks=Object.keys(c);
    $('bar').innerHTML=ks.map(k=>`<i style="flex-grow:${c[k]};background:${UC[k][1]}"></i>`).join('');
    $('legend').innerHTML=ks.map(k=>`<li><b style="background:${UC[k][1]}"></b>${UC[k][0]}<span class="g">${c[k].toFixed(1)}</span></li>`).join('')+'<li style="grid-column:1/-1">1Lあたりのグラム数（目安）。残りは水</li>';}
  else{$('bar').innerHTML='';$('legend').innerHTML='';}
}
function hazard(){
  const list=[[0,'なし']];
  if(SIM.osm>900)list.push([1,'脱水ぎみ（尿が濃い）']);
  const u=urgeOf(SIM.vol);if(u[2]>=1)list.push([u[2],'膀胱がいっぱい']);
  if(P&&P.mat.stone){if(P.stuck)list.push([2,'腎疝痛（痛み '+P.pain+'/10）']);if(P.hydro>.6)list.push([3,'水腎症が進行']);}
  if(P&&P.cystitis)list.push([2,'膀胱炎']);
  if(P&&P.pyelo)list.push([3,'腎盂腎炎']);
  return list.reduce((a,b)=>b[0]>=a[0]?b:a);
}
function drawSpark(){
  const c=$('spark'),dpr=Math.min(2,devicePixelRatio||1),w=c.clientWidth,h=c.clientHeight;if(!w)return;
  if(c.width!==w*dpr){c.width=w*dpr;c.height=h*dpr;}
  const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);
  const H=SIM.hist,top=650,Y=v=>h-2-(v/top)*(h-4);
  x.strokeStyle='rgba(255,122,107,.45)';x.setLineDash([3,3]);x.lineWidth=1;
  [150,450].forEach(v=>{x.beginPath();x.moveTo(0,Y(v));x.lineTo(w,Y(v));x.stroke();});x.setLineDash([]);
  x.fillStyle='rgba(198,173,152,.8)';x.font='9px IBM Plex Mono, monospace';x.fillText('膀胱の尿量',2,9);
  if(H.length<2)return;
  x.beginPath();H.forEach((v,i)=>{const px=i/(H.length-1)*w;i?x.lineTo(px,Y(v)):x.moveTo(px,Y(v));});
  x.strokeStyle='#f3c95a';x.lineWidth=1.5;x.stroke();
  x.lineTo(w,h);x.lineTo(0,h);x.closePath();x.fillStyle='rgba(243,201,90,.15)';x.fill();
}
function showResult(via){
  mode='result';autoOn=false;control='free';updateButtons();$('btnESWL').hidden=true;
  const m=P.mat;
  $('resEyebrow').textContent=`EXIT · 外尿道口 · 体内時間 ${fmtT(SIM.bodyT)}`;
  let title,rows=[['体内にいた時間',fmtT(SIM.bodyT)],['腎臓',fmtT(P.tKid)],['尿管',fmtT(P.tUre)],['膀胱',fmtT(P.tBl)]],note;
  if(m.drop){
    title='尿として外に出た';
    rows.push(['いっしょに出た尿',Math.round(SIM.voidStart||SIM.voided)+' mL'+(SIM.leak?'（もれた）':'')],['尿の濃さ',Math.round(P.osm)+' mOsm/kg'],['比重',sg(P.osm)],['色',osmName(P.osm)]);
    note='尿の色は、ウロビリン（ウロクロムとも呼ばれる）という黄色い色素の濃さで決まる。水を多く飲むと腎臓は水を体に戻さず薄い尿をたくさん出し、足りないと抗利尿ホルモンが働いて濃く少ない尿になる。';
  }else if(m.stone){
    title='結石が出た';
    rows.push(['大きさ',(P.eswl?'砕いて 1.5':P.size.toFixed(1))+' mm'],['詰まっていた時間',fmtT(P.tStuck)],['痛みの最大',P.painMax+'/10'],['腎盂の拡張（最大）',Math.round(P.hydroMax*60)+'%'],['衝撃波',P.eswl?'使った':'使わずに出た']);
    note='5mmより小さい石の多くは自然に出る（2〜4mmで約4分の3、7〜9mmで約半分という調査がある）。大きい石は尿管の3つの狭いところで詰まりやすく、詰まったままだと腎臓が傷む。水を多めに飲むことが予防になる。';
  }else if(m.bact){
    title=via==='flush'?'排尿で洗い流された':'外に出た';
    rows.push(['最大の菌数',fmtN(P.countMax)],['膀胱炎',P.cystitis?'起きた':'なし'],['腎盂腎炎',P.pyelo?'起きた':'なし']);
    note=(sex==='F'?'女性の尿道は約4cmと短く、細菌が膀胱までのぼりやすい。':'男性の尿道は約20cmと長く、細菌はのぼりにくい。')+'排尿は細菌を洗い流すいちばんの防御。水をよく飲み、がまんしすぎないことが予防になる。';
  }else{
    title='膀胱鏡を抜いた';
    rows.push(['通った関門',GATES.filter(g=>g.T.active&&g.pushed).length+'か所']);
    note='本物の膀胱鏡も、尿道から入れて膀胱の内側を観察する。細い管を通して尿管に入れ、結石を取ることもできる（尿管鏡）。';
  }
  $('resTitle').textContent=title;
  paintSwatch($('resSwatch'),true);
  $('resKv').innerHTML=rows.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('');
  $('resNote').textContent=note;
  $('result').hidden=false;
}

/* ---------- ループ ---------- */
const qTmp=new THREE.Quaternion(),mTmp=new THREE.Matrix4(),AX=V3(1,0,0),AY=V3(0,1,0);
const inp=V3(0,0,0);
function applyLook(dt){
  let yaw=-lookDX*.0035,pitch=-lookDY*.0035;lookDX=lookDY=0;
  const kr=1.7*dt;
  if(keys.ArrowLeft)yaw+=kr;if(keys.ArrowRight)yaw-=kr;if(keys.ArrowUp)pitch+=kr;if(keys.ArrowDown)pitch-=kr;
  if(keys.ArrowLeft||keys.ArrowRight||keys.ArrowUp||keys.ArrowDown)lastLook=performance.now();
  if(orbitOn){orbit.yaw-=yaw;orbit.pitch=clamp(orbit.pitch-pitch,-1.4,1.4);return;}
  if(yaw)camera.quaternion.multiply(qTmp.setFromAxisAngle(AY,yaw));
  if(pitch)camera.quaternion.multiply(qTmp.setFromAxisAngle(AX,pitch));
  camera.quaternion.normalize();
}
const NECK=V3(0,-95.4,3.1);
function flowVec(){ // 尿の流れ（cm/s）
  if(!inBody||!loc||!loc.tube||!P||P.stuck||P.cling)return null;
  const T=loc.tube,tan=T.S[Math.min(T.S.length-1,loc.seg.i)].T;
  if(SIM.voiding){
    if(T===TUB.bladder)return NECK.clone().sub(camera.position).setLength(6);
    if(T.def.sex)return tan.clone().multiplyScalar(12);
    if(T.def.kid&&loc.s>T.L-1.2)return NECK.clone().sub(camera.position).setLength(6);
  }
  if(P.mat.bact||P.mat.scope)return null; // 自分で泳ぐ・押して進む
  if(T.def.kid){const z=REG[loc.seg.reg].z;return tan.clone().multiplyScalar(z==='kid'?.8:2.5);}
  return null;
}
function flowAlong(){const f=flowVec();if(!f||!loc||!loc.tube)return 0;return f.dot(loc.tube.S[Math.min(loc.tube.S.length-1,loc.seg.i)].T);}
function stepFree(dt){
  if(P&&(P.stuck||P.cling)){vel.multiplyScalar(Math.exp(-8*dt));if(P.stuck)vel.set(0,0,0);}
  inp.set(0,0,0);
  if(!(P&&(P.stuck||P.cling))){
    if(keys.KeyW)inp.z-=1;if(keys.KeyS)inp.z+=1;if(keys.KeyA)inp.x-=1;if(keys.KeyD)inp.x+=1;if(keys.KeyE)inp.y+=1;if(keys.KeyQ)inp.y-=1;
    inp.z+=stick.y;inp.x+=stick.x;
  }
  if(inp.lengthSq()>1)inp.normalize();
  const r=inBody&&loc&&loc.seg?loc.seg.r:6;
  const top=3*clamp(r/1.1,.35,inBody?2.4:10)*(keys.ShiftLeft||keys.ShiftRight?3:1)*speedMul;
  inp.applyQuaternion(camera.quaternion);
  vel.addScaledVector(inp,top*4*dt);
  if(wheel){vel.addScaledVector(V3(0,0,-1).applyQuaternion(camera.quaternion),wheel*top*.35);wheel=0;}
  const fv=flowVec();
  if(fv){const sp=fv.length(),d=fv.clone().normalize(),cur=vel.dot(d);if(cur<sp)vel.addScaledVector(d,(sp-cur)*Math.min(1,dt*3));}
  vel.multiplyScalar(Math.exp(-4*dt));
  const dp=vel.clone().multiplyScalar(dt),n=Math.max(1,Math.ceil(dp.length()/.04));dp.multiplyScalar(1/n);
  for(let i=0;i<n;i++){
    const keep=camera.position.clone(),prevL=loc;
    camera.position.add(dp);
    if(inBody){const L=constrain(camera.position,vel);if(crossesClosed(prevL,L)){camera.position.copy(keep);vel.set(0,0,0);break;}loc=L;}
  }
  if(!inBody)tryReenter();
}
function stepGuide(dt,now){
  const R=guide.R,cur=routeAt(R,guide.s);
  let w=(keys.KeyW?1:0)-(keys.KeyS?1:0)-stick.y+(wheel*.6);wheel=0;
  if(autoOn)w=1;
  const base=(mode==='demo'?2:3.5)*clamp(cur.r/.6,.6,3)*(keys.ShiftLeft||keys.ShiftRight?3:1)*(mode==='demo'?1:speedMul);
  let ds=guideDir*w*base*dt;
  if(guideDir>0||SIM.voiding){const fl=flowAlong();if(fl)ds+=fl*dt;}
  const prevS=guide.s;
  guide.s=clamp(guide.s+ds,0,R.L);
  const tgt=routeAt(R,guide.s);
  const keep=camera.position.clone(),prevL=loc;
  camera.position.lerp(tgt.p,1-Math.exp(-dt*6));
  const L=constrain(camera.position,null);
  if(crossesClosed(prevL,L)){camera.position.copy(keep);guide.s=clamp(prevS-guideDir*Math.max(.03,Math.abs(ds)),0,R.L);}
  else{loc=L;if(camera.position.distanceTo(tgt.p)>.8)guide.s=prevS;}
  const cs=projectOnRoute(R,camera.position,guide.s);guide.s=clamp(guide.s,cs-1,cs+1);
  if(mode==='demo'||now-lastLook>1500){
    const ahead=routeAt(R,guide.s+guideDir*clamp(tgt.r*3,.6,4));
    const up=V3(0,1,0).applyQuaternion(camera.quaternion);
    if(ahead.p.distanceToSquared(camera.position)>1e-5){mTmp.lookAt(camera.position,ahead.p,up);qTmp.setFromRotationMatrix(mTmp);camera.quaternion.slerp(qTmp,1-Math.exp(-dt*2.4));}
  }
  if(mode==='demo'&&guide.s>=R.L-.01){guide.s=0;teleportTo(TUB.urL,Math.round(.35/TUB.urL.def.ds));}
  else if(guideDir>0&&guide.s>=R.L-.01&&camera.position.distanceTo(tgt.p)<.2){const e=OPEN_ENDS[0];setControl('free');vel.copy(e.out).multiplyScalar(3);}
  else if(autoOn&&guideDir<0&&guide.s<=.01){autoOn=false;updateButtons();toast('腎乳頭に着いた（行き止まり）');}
}
function tryReenter(){
  for(const e of OPEN_ENDS){
    _ap.subVectors(camera.position,e.p);const along=_ap.dot(e.out),perp=Math.sqrt(Math.max(0,_ap.lengthSq()-along*along));
    if(along<-.05&&along>-1&&perp<e.r*.8){inBody=true;loc=constrain(camera.position,vel);toast('体の中に戻った');return;}
  }
}
function checkExit(){
  if(!inBody||!loc)return;
  for(const e of OPEN_ENDS){
    _ap.subVectors(camera.position,e.p);
    if(_ap.dot(e.out)>.06&&_ap.length()<e.r*3){
      inBody=false;setControl('free');
      if(P&&mode==='play'&&(P.entry!=='urethra'||P.tBl>0||P.tUre>0||SIM.voiding)){showResult(SIM.voiding&&P.mat.bact?'flush':'meatus');return;}
      vel.addScaledVector(e.out,2);return;
    }
  }
}
const tscNow=()=>{if(!P||mode!=='play')return 0;if(SIM.voiding)return SIM.ff>1?1:1;
  const z=REG[curReg]?REG[curReg].z:'out';let t={kid:1,ure:1,bl:60,uth:1,out:1}[z];
  if(P.mat.bact&&z!=='out')t=Math.max(t,30);if(P.stuck)t=60;return t*SIM.ff;};
let prevT=performance.now();
function frame(now){
  try{frameBody(now);}catch(err){window.__udErr=String(err&&err.stack||err);console.error(err);}
  requestAnimationFrame(frame);
}
function frameBody(now){
  const dt=clamp((now-prevT)/1000,0,.05);prevT=Math.max(prevT,now);
  U.uTime.value=now/1000;
  // 膀胱の大きさ（尿量）
  if(SIM.voiding){const d=Math.min(SIM.vol,22*dt);SIM.vol-=d;SIM.voided+=d;
    if(SIM.vol<=3){SIM.voiding=false;toast(`排尿おわり（${Math.round(SIM.voided)}mL）`);
      if(P&&P.mat.bact&&P.cling&&/^(bl|uth)$/.test(REG[curReg].z)){P.count*=.1;P.flushes++;toast(`排尿の流れに耐えた。ただし菌の9割は流された（残り ${fmtN(P.count)}）`);}
      if(P&&P.mat.bact&&P.cystitis)P.count*=.5;}}
  U.uStomR.value+=(volScale(SIM.vol)-U.uStomR.value)*Math.min(1,dt*(SIM.voiding?4:1.5));
  U.uStomFold.value=2.4-2.1*clamp((U.uStomR.value-.32)/.68,0,1);
  U.uSqz.value+=((SIM.voiding?1:0)-U.uSqz.value)*Math.min(1,dt*3);
  updateSegR();
  applyLook(dt);
  if(!orbitOn||mode==='demo'){
    if(control==='guide'&&inBody&&!(P&&(P.stuck||P.cling)))stepGuide(dt,now);else stepFree(dt);
  }
  if(inBody&&!loc)loc=locate(camera.position);
  if(inBody)checkExit();
  let reg=inBody&&loc&&loc.seg?loc.seg.reg:'outside';
  if(reg!==curReg){curReg=reg;showRegion(reg);}
  const zone=REG[curReg].z;
  if(mode==='play'){const dtb=dt*tscNow()/60;const n=Math.ceil(dtb/2)||1;for(let i=0;i<n;i++)simStep(dtb/n,zone);}
  if(mode!=='result')gateLogic(dt);
  for(const T of tubes)if(T.gateU)T.gates.forEach((g,i)=>{T.gateU[i].set(g.s,g.w,g.open,g.depth||.93);if(g.open>.6&&P&&P.mat.scope)g.pushed=true;});
  // 尿の色で中の見え方を変える（尿路の中は尿で満たされている）
  const uc=urineColor(zone==='bl'||zone==='uth'?SIM.bOsm:SIM.osm);
  const fogC=mixc(FOG_S,[uc[0]*.22,uc[1]*.16,uc[2]*.06],.8);
  if(inBody&&!orbitOn){U.uFog.value.set(...lin(fogC));renderer.setClearColor(new THREE.Color(...fogC));}
  else{U.uFog.value.set(...lin(FOG_S));renderer.setClearColor(new THREE.Color(...FOG_S));}
  $('tint').style.opacity=inBody&&!orbitOn&&mode!=='demo'?clamp(.15+(SIM.osm-200)/2500,.12,.45):0;$('tint').style.background=css(uc);
  const out=orbitOn||!inBody;
  U.uOut.value+=((out?1:0)-U.uOut.value)*Math.min(1,dt*3);
  document.body.classList.toggle('outer',out);
  marker.visible=trail.visible=orbitOn;
  if(mode==='play'&&inBody)addTrail(camera.position);
  let rc=camera;
  updateAvatar(dt);
  if(avatar.visible)rc=tpsCam;
  if(orbitOn){
    marker.position.copy(camera.position);
    const t=orbit.target,cp=Math.cos(orbit.pitch);
    orbitCam.position.set(t.x+Math.sin(orbit.yaw)*cp*orbit.dist,t.y+Math.sin(orbit.pitch)*orbit.dist,t.z+Math.cos(orbit.yaw)*cp*orbit.dist);
    orbitCam.lookAt(t);rc=orbitCam;
  }
  U.uCam.value.copy(rc.position);
  const c=camera.position;dust.visible=!orbitOn;
  for(let i=0;i<PN;i++){for(let k=0;k<3;k++){const v=pBase[i*3+k]+Math.sin(now/4000+i)*.05;pPos[i*3+k]=c.getComponent(k)-1.5+(((v-c.getComponent(k))%3)+3)%3;}}
  pGeo.attributes.position.needsUpdate=true;
  updateHUD(dt,now);if(skipRender)return;drawMap();updateSigns(rc);updateAhead(now);
  renderer.render(scene,rc);
}
function onResize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=orbitCam.aspect=tpsCam.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();orbitCam.updateProjectionMatrix();tpsCam.updateProjectionMatrix();mapSetup();}
addEventListener('resize',onResize);
let skipRender=false;
// 検証用: 画面が非表示でも sec 秒ぶんシミュレーションを進める
function simRun(sec,keysDown){(keysDown||[]).forEach(k=>keys[k]=true);skipRender=true;let t=prevT;for(let i=0;i<sec*60;i++){t+=1000/60;frameBody(t);}skipRender=false;(keysDown||[]).forEach(k=>keys[k]=false);}
window.__ud={simRun,SIM,G,TUB,get P(){return P;},begin,showResult,get loc(){return loc;},camera,tpsCam,guide,setControl,locate};
if(innerWidth<760)$('side').classList.remove('open');
showStart();
requestAnimationFrame(frame);
