'use strict';
/* ---------- HUD ---------- */
function showRegion(key){
  const R=REG[key],el=$('loc');el.classList.add('swap');
  setTimeout(()=>{$('locSys').textContent=R.sys;$('locSys').className=R.sys===VEN?'ven':R.sys===HEART?'heart':'';
    $('locName').textContent=R.n;$('locEn').textContent=R.en;$('locDesc').textContent=R.d;el.classList.remove('swap');},reduceMotion?0:200);
}
$('gates').innerHTML=GATES.map(g=>`<li id="gate-${g.id}">${g.name}</li>`).join('');
let hudT=0,lastPos=V3(0,0,0),spd=0;
function updateHUD(dt,now){
  if(!SIM.capT){spd+=(camera.position.distanceTo(lastPos)/Math.max(dt,1e-3)-spd)*Math.min(1,dt*4);}
  if(P&&mode==='play'&&!SIM.capT)P.dist+=Math.min(camera.position.distanceTo(lastPos),2);
  lastPos.copy(camera.position);
  GATES.forEach(g=>$('gate-'+g.id).classList.toggle('open',g.open>.5));
  $('s1').style.opacity=SIM.s1T<.15?1:.25;$('s2').style.opacity=SIM.s2T<.15?1:.25;
  drawEcg();
  if(now-hudT<150)return;hudT=now;
  $('rDia').textContent=!inBody||!loc||!loc.seg?'—':(2*loc.seg.r*10).toFixed(0)+' mm';
  $('rDist').textContent=control==='guide'?Math.round(projectOnRoute(guide.R,camera.position,guide.s))+' cm（1周 '+Math.round(guide.R.L)+'cm）':'—';
  $('rSpd').textContent=spd.toFixed(1)+' cm/s';
  $('rMode').textContent=autoOn?'自動 · '+dirName():control==='guide'?'順路 · '+dirName():'手動';
  if(!P)return;
  const ex=SIM.ex;
  $('bHr').textContent=Math.round(SIM.hr)+' 回/分';
  $('bBp').textContent=(ex?165:120)+(P.stuck&&!P.lysis?-25:0)+' / '+(ex?78:75)+' mmHg';
  $('bSpo2').textContent=Math.round(SIM.spo2*100)+'%';$('bSpo2').className=SIM.spo2<.9?'risk3':'';
  const hw=heartWave(SIM.phase);$('bPhase').textContent=hw.vs>0?'収縮期（心室が縮む）':hw.as>0?'心房が縮む':'拡張期（心室に血がたまる）';
  $('bTime').textContent=fmtS(SIM.t);
  const hz=hazard();$('bRisk').textContent=hz[0]?`${['','注意','警告','危険'][hz[0]]} · ${hz[1]}`:'なし';$('bRisk').className='risk'+hz[0];
  $('meState').textContent=formOf();$('meMass').textContent=subOf();
  paintSwatch($('swatch'));
}
function formOf(){
  if(P.mat===MATS.rbc)return `酸素飽和度 ${Math.round(P.so2*100)}% · ${so2Name(P.so2)}`;
  if(P.mat===MATS.clot)return P.stuck?(P.lysis?`溶けている（${P.size.toFixed(1)}mm）`:`肺動脈に詰まっている（${P.size.toFixed(0)}mm）`):`${P.size.toFixed(0)}mm · 流れに乗って移動中`;
  return '観察中';
}
function subOf(){
  if(P.mat===MATS.rbc)return `周回 ${P.laps} · 次の行き先 ${DEST_N[P.dest]}`;
  if(P.mat===MATS.clot)return P.stuck?'右心室に負担がかかっている':'右心房 → 右心室 → 肺動脈へ向かう';
  return `移動 ${Math.round(P.dist)} cm`;
}
function colorOf(){return P.mat===MATS.rbc?so2Color(P.so2):P.mat===MATS.clot?[.42,.06,.08]:[.85,.88,.92];}
function paintSwatch(el,big){
  const k=big?2:1,c=colorOf(),s=x=>Math.round(x*k)+'px';
  let w=34,h=34,br='50%',bg=`radial-gradient(circle at 50% 50%, ${css(c.map(v=>v*.7))} 0 22%, ${css(c)} 40% 70%, ${css(c.map(v=>v*.8))} 100%)`;
  if(P.mat===MATS.clot){w=h=8+P.size*3;br='44% 56% 50% 50% / 58% 44% 56% 42%';bg=`radial-gradient(circle at 35% 30%, rgba(255,255,255,.3), transparent 45%), ${css(c)}`;}
  if(P.mat===MATS.cath){w=52;h=10;br='5px';bg=`linear-gradient(${css(c)},${css(c.map(v=>v*.7))})`;}
  el.style.width=s(w);el.style.height=s(h);el.style.borderRadius=br;el.style.background=bg;
}
function hazard(){
  const list=[[0,'なし']];
  if(SIM.ex)list.push([0,'運動中']);
  if(P&&P.mat===MATS.clot){if(P.stuck&&!P.lysis)list.push([3,'肺塞栓症']);else if(P.stuck)list.push([2,'治療中']);else list.push([1,'血栓が移動中']);}
  if(SIM.spo2<.92)list.push([3,'低酸素（動脈血の酸素 '+Math.round(SIM.spo2*100)+'%）']);
  return list.reduce((a,b)=>b[0]>=a[0]?b:a);
}
function drawEcg(){
  const c=$('ecg'),dpr=Math.min(2,devicePixelRatio||1),w=c.clientWidth,h=c.clientHeight;if(!w||c.closest('[hidden]'))return;
  if(c.width!==w*dpr){c.width=w*dpr;c.height=h*dpr;}
  const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);
  x.strokeStyle='rgba(255,215,210,.08)';x.lineWidth=1;for(let i=0;i<w;i+=12){x.beginPath();x.moveTo(i,0);x.lineTo(i,h);x.stroke();}
  const E=SIM.ecg;if(E.length<2)return;
  x.beginPath();E.forEach((v,i)=>{const px=i/(E.length-1)*w,py=h*.7-v*h*.6;i?x.lineTo(px,py):x.moveTo(px,py);});
  x.strokeStyle='#8fe0a8';x.lineWidth=1.4;x.stroke();
}
function showResult(kind){
  mode='result';autoOn=false;updateButtons();
  const m=P.mat;let title,rows=[['旅した時間',fmtS(SIM.t)],['進んだ距離',Math.round(P.dist)+' cm'],['心拍の回数',SIM.beats+' 回']],note;
  if(m===MATS.rbc){
    title='赤血球の旅のまとめ';
    rows.push(['周回',P.laps+' 周']);
    if(P.lapTimes.length)rows.push(['1周の平均',fmtS(P.lapTimes.reduce((a,b)=>a+b,0)/P.lapTimes.length)]);
    P.capLog.slice(-6).forEach(([n,a,b])=>rows.push([n,`${Math.round(a*100)}% → ${Math.round(b*100)}%`]));
    note='心臓は安静時に1分で約5Lを送り出し、体の血液もおよそそのくらいなので、平均すると約1分で体を1周する計算。1日では約10万回拍動し、約7000Lを送り出す（1分に約70回・約5Lとして計算した目安）。赤血球は約120日働いたあと、脾臓や肝臓で壊され、ヘモグロビンの色素は胆汁（便の色のもと）になる。';
  }else if(m===MATS.clot){
    title=kind==='lysis'?'血栓が溶けた':'血栓の旅のまとめ';
    rows.push(['詰まった場所',P.stuckT?REG.pa.n+(P.stuckT.id==='paR'?'（右）':'（左）'):'—'],['動脈血の酸素（最低）',Math.round((P.spo2Min||SIM.spo2)*100)+'%']);
    note='脚の深い静脈にできた血栓が肺に飛ぶのが肺塞栓症（エコノミークラス症候群）。長時間座るときは、ときどき足首を動かし、水分をとることで予防できる。治療には血栓を溶かす薬や、固まりにくくする薬を使う。';
  }else{
    title='カテーテル検査のまとめ';
    rows.push(['通った弁',GATES.filter(g=>g.told).map(g=>g.name).join('、')||'なし']);
    note='心臓カテーテル検査では、足の付け根や手首の動脈から細い管を心臓まで進め、造影剤で冠動脈を映したり、心臓の中の圧を測ったりする。';
  }
  $('resEyebrow').textContent='SUMMARY · '+(m.n);
  $('resTitle').textContent=title;
  paintSwatch($('resSwatch'),true);
  $('resKv').innerHTML=rows.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('');
  $('resNote').textContent=note;
  $('resBack').hidden=!!P.done;
  $('result').hidden=false;
}

/* ---------- 流れ ---------- */
function flowVec(){ // 血流（cm/s）。受け身の素材（赤血球・血栓）だけが流される
  if(!inBody||!loc||!loc.tube||!P||P.stuck||P.mat===MATS.cath)return null;
  const T=loc.tube,tan=T.S[Math.min(T.S.length-1,loc.seg.i)].T,reg=loc.seg.reg,hw=heartWave(SIM.phase),k=Math.pow(SIM.hr/65,.7);
  let v=0;
  if(VEINS.has(T.id))v=5*k;
  else if(reg==='svc')v=5*k;
  else if(reg==='ra'||reg==='la'||reg==='tric'||reg==='mitral')v=(hw.avOpen?7:1.5)*k;
  else if(reg==='rv'||reg==='pvalve')v=hw.slOpen?14*k:0;
  else if(T===TUB.lh&&(reg==='lv'||reg==='lvot')){
    if(hw.slOpen)return AO_IN.clone().sub(camera.position).setLength(14*k);
    v=hw.avOpen?3:0;
  }
  else v=(4+12*hw.aw)*k;
  return v?tan.clone().multiplyScalar(v):null;
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
function stepFree(dt){
  if(P&&P.stuck){vel.set(0,0,0);return;}
  inp.set(0,0,0);
  if(keys.KeyW)inp.z-=1;if(keys.KeyS)inp.z+=1;if(keys.KeyA)inp.x-=1;if(keys.KeyD)inp.x+=1;if(keys.KeyE)inp.y+=1;if(keys.KeyQ)inp.y-=1;
  inp.z+=stick.y;inp.x+=stick.x;
  if(inp.lengthSq()>1)inp.normalize();
  const r=inBody&&loc&&loc.seg?loc.seg.r:6;
  const top=3*clamp(r/1.1,.35,2.4)*(keys.ShiftLeft||keys.ShiftRight?3:1)*speedMul;
  inp.applyQuaternion(camera.quaternion);
  vel.addScaledVector(inp,top*4*dt);
  if(wheel){vel.addScaledVector(V3(0,0,-1).applyQuaternion(camera.quaternion),wheel*top*.35);wheel=0;}
  const fv=flowVec();
  if(fv){const sp=fv.length(),d=fv.clone().normalize(),cur=vel.dot(d);if(cur<sp)vel.addScaledVector(d,(sp-cur)*Math.min(1,dt*3));}
  vel.multiplyScalar(Math.exp(-4*dt));
  const dp=vel.clone().multiplyScalar(dt),n=Math.max(1,Math.ceil(dp.length()/.05));dp.multiplyScalar(1/n);
  for(let i=0;i<n;i++){
    const keep=camera.position.clone(),prevL=loc;
    camera.position.add(dp);
    const L=constrain(camera.position,vel);if(crossesClosed(prevL,L)){camera.position.copy(keep);vel.set(0,0,0);break;}loc=L;
  }
  // 自由移動で動脈の行き止まり（毛細血管の入口）に着いたら静脈へ
  if(loc&&loc.tube&&loc.tube.def.portalOut&&loc.s>loc.tube.L-.5&&P&&P.mat!==MATS.cath){
    const key=loc.tube.def.portalOut,T2=TUB[CAP[key].in];passCapillary(key);teleportTo(T2,Math.round(.5/T2.def.ds));loc=locate(camera.position);
  }
}
function stepGuide(dt,now){
  const R=guide.R,cur=routeAt(R,guide.s);
  let w=(keys.KeyW?1:0)-(keys.KeyS?1:0)-stick.y+(wheel*.6);wheel=0;
  if(autoOn)w=1;
  const base=(mode==='demo'?2.5:3.5)*clamp(cur.r/.8,.6,2.5)*(keys.ShiftLeft||keys.ShiftRight?3:1)*(mode==='demo'?1:speedMul);
  let ds=guideDir*w*base*dt;
  if(guideDir>0&&mode==='play'){const f=flowVec();if(f)ds+=f.length()*dt*.6;}
  const prevS=guide.s;
  let ns=clamp(guide.s+ds,0,R.L);
  // 毛細血管のつなぎ目をまたいだら、通過の演出をして静脈側へ移る
  if(guideDir>0){
    const q=R.pts.find(q=>q.portal&&q.L>prevS&&q.L<=ns);
    if(q){if(P&&P.mat===MATS.cath){ns=prevS;toast('カテーテルは毛細血管には入れない');}
      else{if(P)passCapillary(q.portal);guide.s=q.L+.02;camera.position.copy(q.p);loc=locate(camera.position);addTrail(q.p,true);return;}}
  }else{
    const q=R.pts.find(q=>q.portal&&q.L<=prevS&&q.L>ns);
    if(q){ns=q.L+.02;if(autoOn){autoOn=false;updateButtons();}if(SIM.hintT<=0){toast('毛細血管はさかのぼれない（この縮尺では通れない細さ）');SIM.hintT=5;}}
  }
  guide.s=ns;
  const tgt=routeAt(R,guide.s);
  const keep=camera.position.clone(),prevL=loc;
  camera.position.lerp(tgt.p,1-Math.exp(-dt*6));
  const L=constrain(camera.position,null);
  if(crossesClosed(prevL,L)){camera.position.copy(keep);guide.s=clamp(prevS-guideDir*Math.max(.03,Math.abs(ds)),0,R.L);}
  else{loc=L;if(camera.position.distanceTo(tgt.p)>1)guide.s=prevS;}
  const cs=projectOnRoute(R,camera.position,guide.s);guide.s=clamp(guide.s,cs-1.2,cs+1.2);
  if(mode==='demo'||now-lastLook>1500){
    const ahead=routeAt(R,guide.s+guideDir*clamp(tgt.r*2.5,.8,4));
    const up=V3(0,1,0).applyQuaternion(camera.quaternion);
    if(ahead.p.distanceToSquared(camera.position)>1e-4){mTmp.lookAt(camera.position,ahead.p,up);qTmp.setFromRotationMatrix(mTmp);camera.quaternion.slerp(qTmp,1-Math.exp(-dt*2.4));}
  }
  // 右心房に戻ったら1周。次の行き先の順路へ
  if(guideDir>0&&guide.s>=R.L-.05){
    if(P){P.laps++;P.lapTimes.push(SIM.t-P.lapStart);P.lapStart=SIM.t;P.side=P.side==='R'?'L':'R';P.dest=pickDest();toast(`右心房に戻った。1周 ${fmtS(P.lapTimes[P.lapTimes.length-1])}。次は${P.side==='R'?'右':'左'}肺を通って${DEST_N[P.dest]}へ`);}
    guide.R=routeOf(P?P.side:(R.side==='R'?'L':'R'),P?P.dest:DESTS[(DESTS.indexOf(R.dest)+1)%4]);guide.s=0;
  }
  if(guideDir<0&&guide.s<=.05&&autoOn){autoOn=false;updateButtons();}
}
let prevT=performance.now(),skipRender=false;
function frame(now){
  try{frameBody(now);}catch(err){window.__vdErr=String(err&&err.stack||err);console.error(err);}
  requestAnimationFrame(frame);
}
function frameBody(now){
  const dt=clamp((now-prevT)/1000,0,.05);prevT=Math.max(prevT,now);
  U.uTime.value=now/1000;
  if(mode==='play'||mode==='demo')heartLogic(dt);
  if(mode==='play')SIM.t+=dt;
  SIM.ecgT+=dt;if(SIM.ecgT>1/60){SIM.ecgT=0;SIM.ecg.push(ecgAt(SIM.phase));if(SIM.ecg.length>180)SIM.ecg.shift();}
  updateSegR();
  applyLook(dt);
  if(SIM.capT>0)SIM.capT=Math.max(0,SIM.capT-dt);
  else if(!orbitOn||mode==='demo'){if(control==='guide'&&!(P&&P.stuck))stepGuide(dt,now);else stepFree(dt);}
  if(!loc)loc=locate(camera.position);
  let reg=loc&&loc.seg?loc.seg.reg:'outside';
  if(reg!==curReg){curReg=reg;showRegion(reg);}
  for(const T of tubes)if(T.gateU)T.gates.forEach((g,i)=>T.gateU[i].set(g.s,g.w,g.open,.93));
  // 血の色で見え方を変える
  const so2=P&&P.mat===MATS.rbc?P.so2:(loc&&loc.tube&&(VEINS.has(loc.tube.id)||/^(svc|ra|tric|rv|pvalve|pa)$/.test(reg))?.72:.98);
  const bc=so2Color(so2),fogC=[bc[0]*.2,bc[1]*.15,bc[2]*.15];
  if(!orbitOn){U.uFog.value.set(...lin(fogC));renderer.setClearColor(new THREE.Color(...fogC));}
  else{U.uFog.value.set(...lin(FOG_S));renderer.setClearColor(new THREE.Color(...FOG_S));}
  $('tint').style.opacity=!orbitOn&&mode!=='demo'?.3:0;$('tint').style.background=css(mixc(bc,[1,1,1],.35));
  U.uOut.value+=((orbitOn?1:0)-U.uOut.value)*Math.min(1,dt*3);
  document.body.classList.toggle('outer',orbitOn);
  organs.forEach(o=>o.visible=orbitOn);
  marker.visible=trail.visible=orbitOn;
  if(mode==='play'&&!SIM.capT)addTrail(camera.position);
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
  const fl=flowVec(),fx=fl?fl.x*now/1000*.3:0,fy=fl?fl.y*now/1000*.3:0,fz=fl?fl.z*now/1000*.3:0;
  for(let i=0;i<PN;i++){const o=[fx,fy,fz];for(let k=0;k<3;k++){const v=pBase[i*3+k]+o[k]+Math.sin(now/3000+i)*.04;pPos[i*3+k]=c.getComponent(k)-2+(((v-c.getComponent(k))%4)+4)%4;}}
  pGeo.attributes.position.needsUpdate=true;
  updateHUD(dt,now);if(skipRender)return;drawMap();updateSigns(rc);updateAhead(now);
  renderer.render(scene,rc);
}
function avatarState(){
  const m=P.mat,r=loc&&loc.seg?loc.seg.r:.6;
  if(m===MATS.rbc)return {geo:'rbc',s:[1,1,1],amp:.02,freq:2,wob:1.5,metal:.15,size:Math.min(.22,r*.35)};
  if(m===MATS.clot)return {geo:'blob',s:[1,.8,1.6],amp:.28,freq:4,wob:0,metal:.1,size:P.size/20};
  return {geo:'rod',s:[1,1,1],amp:0,freq:1,wob:0,metal:.7,size:Math.min(.5,r*.9)};
}
function updateAvatar(dt){
  const show=tps&&!orbitOn&&mode!=='demo'&&!!P&&!SIM.capT;avatar.visible=show;if(!show)return;
  const o=avatarState();
  if(avatar.geometry!==AV_GEO[o.geo])avatar.geometry=AV_GEO[o.geo];
  avatarSize+=(o.size-avatarSize)*Math.min(1,dt*2);
  const k=avatarSize,u=avatarMat.uniforms;
  avatar.scale.set(o.s[0]*k,o.s[1]*k,o.s[2]*k);
  avatar.position.copy(camera.position);
  const fwd=V3(0,0,-1).applyQuaternion(camera.quaternion);
  if(o.geo==='rbc'){avatar.rotateY(dt*.9);avatar.rotateX(dt*.5);}
  else if(inBody&&loc&&loc.tube){let t=loc.tube.S[Math.min(loc.tube.S.length-1,loc.seg.i)].T.clone();if(t.dot(fwd)<0)t.negate();_q.setFromUnitVectors(_fz,t);avatar.quaternion.slerp(_q,Math.min(1,dt*4));}
  u.uColor.value.set(...lin(colorOf()));u.uAmp.value=o.amp;u.uFreq.value=o.freq;u.uWob.value=o.wob;u.uMetal.value=o.metal;u.uAlpha.value=1;
  const up=V3(0,1,0).applyQuaternion(camera.quaternion);
  const dist=clamp(k*Math.max(o.s[2],1)*(o.geo==='rod'?3:7),.6,5);
  const want=camera.position.clone().addScaledVector(fwd,-dist).addScaledVector(up,dist*.15);
  if(loc&&loc.tube){
    const T=loc.tube,S=T.S,ds=T.def.ds,i0=Math.min(S.length-1,loc.seg.i);
    const sgn=fwd.dot(S[i0].T)>=0?1:-1;
    const sb=clamp(loc.s-sgn*dist,0,T.L),sm=S[clamp(Math.round(sb/ds),0,S.length-1)];
    const off=camera.position.clone().sub(S[i0].p);off.addScaledVector(S[i0].T,-off.dot(S[i0].T));
    want.copy(sm.p).addScaledVector(off,.35);
    const lim=sm.r*sm.cf*scaleAt(T,sm.s,sm.vent,sm.atr)*.5;_ap.copy(up).addScaledVector(sm.T,-up.dot(sm.T));
    if(_ap.lengthSq()>1e-6)want.addScaledVector(_ap.normalize(),Math.min(dist*.15,Math.max(0,lim)));
  }
  tpsPos.lerp(want,1-Math.exp(-dt*7));
  tpsCam.position.copy(tpsPos);tpsCam.up.copy(up);
  tpsCam.lookAt(camera.position.clone().addScaledVector(fwd,dist*.35));
}
function onResize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=orbitCam.aspect=tpsCam.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();orbitCam.updateProjectionMatrix();tpsCam.updateProjectionMatrix();mapSetup();}
addEventListener('resize',onResize);
// 検証用: 画面が非表示でも sec 秒ぶん進める
function simRun(sec,keysDown){(keysDown||[]).forEach(k=>keys[k]=true);skipRender=true;let t=prevT;for(let i=0;i<sec*60;i++){t+=1000/60;frameBody(t);}skipRender=false;(keysDown||[]).forEach(k=>keys[k]=false);}
window.__vd={simRun,SIM,G,TUB,get P(){return P;},begin,showResult,get loc(){return loc;},camera,guide,setControl,locate,ROUTES};
if(innerWidth<760)$('side').classList.remove('open');
showStart();
mapSetup();
requestAnimationFrame(frame);
