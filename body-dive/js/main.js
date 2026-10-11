'use strict';
/* ---------- HUD ---------- */
function showRegion(key){
  const R=REG[key],el=$('loc');el.classList.add('swap');
  setTimeout(()=>{$('locSys').textContent=R.sys;$('locSys').classList.toggle('air',R.sys===AIR);
    $('locName').textContent=R.n;$('locEn').textContent=R.en;$('locDesc').textContent=R.d;el.classList.remove('swap');},reduceMotion?0:220);
}
$('gates').innerHTML=GATES.map(g=>`<li id="gate-${g.id}">${g.name}</li>`).join('');
let hudT=0,lastPos=V3(0,0,0),spd=0;
function updateHUD(dt,now){
  spd+=(camera.position.distanceTo(lastPos)/Math.max(dt,1e-3)-spd)*Math.min(1,dt*4);lastPos.copy(camera.position);
  if(now-hudT<150)return;hudT=now;
  $('rDia').textContent=!inBody||!loc||!loc.seg?'—':(2*loc.seg.r).toFixed(1)+' cm';
  const n=control==='guide'?{R:guide.R,s:guide.s,d:0}:(inBody?nearestOnRoutes(camera.position,P&&P.entry):null);
  $('rDist').textContent=!n||n.d>=3?'—':P&&P.entry==='anus'&&n.R.entry==='mouth'?L('肛門から ','from anus ')+Math.round(n.R.L-n.s)+' cm':n.R.label+' '+Math.round(n.s)+' cm';
  $('rSpd').textContent=spd.toFixed(1)+' cm/s';
  GATES.forEach(g=>$('gate-'+g.id).classList.toggle('open',g.open>.5));
  if(!P)return;
  $('bTime').textContent=fmtT(SIM.bodyT);
  $('bScale').textContent='×'+((P.stuck?30:TSCALE[REG[curReg]?REG[curReg].z:'out'])*SIM.ff);
  $('bStom').textContent=Math.round(SIM.content)+' mL';
  $('bPhase').textContent=SIM.phase===0?L('食後期','after a meal'):(LANG==='en'?['','fasting phase I (quiet)','fasting phase II','fasting phase III (strong contractions)']:['','空腹期 第1相（静か）','空腹期 第2相','空腹期 第3相（強い収縮）'])[SIM.phase];
  const bac=bacOf(SIM.blood);$('bBac').textContent=`${bac.toFixed(3)}% · ${stageOf(bac)[1]}`;
  const hz=hazard();$('side').classList.toggle('alc',SIM.bacPeak>=.001);$('side').classList.toggle('risk',hz[0]>0);$('bRisk').textContent=hz[0]?`${(LANG==='en'?['','caution','warning','danger']:['','注意','警告','危険'])[hz[0]]} · ${hz[1]}`:L('なし','none');$('bRisk').className='risk'+hz[0];
  drawSpark();
  $('meState').textContent=formOf();
  const m=mass();$('meMass').textContent=`${m.toFixed(1)} g`+(P.mat.dig?L(` · 水分 ${Math.round(waterFrac()*100)}%`,` · water ${Math.round(waterFrac()*100)}%`):'');
  paintSwatch($('swatch'));
  const keysC=Object.keys(P.comp).filter(k=>P.comp[k]>.005).sort((a,b)=>P.comp[b]-P.comp[a]);
  $('bar').innerHTML=keysC.map(k=>`<i style="flex-grow:${P.comp[k]};background:${COMP[k][1]}"></i>`).join('');
  $('legend').innerHTML=keysC.slice(0,6).map(k=>`<li><b style="background:${COMP[k][1]}"></b>${COMP[k][0]}<span class="g">${P.comp[k]<1?P.comp[k].toFixed(2):P.comp[k].toFixed(1)}</span></li>`).join('');
}
function hazard(){
  const list=[[0,L('なし','none')]];
  const st=stageOf(bacOf(SIM.blood));if(SIM.blood>.2)list.push([st[2],L('酔い: ','drunk: ')+st[1]]);
  if(P&&P.mat.battery){if(P.stuck)list.push([1,L('電池が食道に詰まっている','battery stuck in the esophagus')]);
    if(P.burn>.8)list.push([3,L('食道穿孔の危険','risk of esophageal perforation')]);else if(P.burn>.4)list.push([2,L('深い潰瘍','deep ulcer')]);else if(P.burn>.1)list.push([1,L('粘膜のただれ','damaged lining')]);}
  if(SIM.vomit)list.push([1,L('嘔吐','vomiting')]);
  if(P&&P.diarrhea)list.push([1,L('下痢 · 脱水に注意','diarrhea · watch for dehydration')]);
  return list.reduce((a,b)=>b[0]>=a[0]?b:a);
}
function drawSpark(){
  const c=$('spark');c.hidden=SIM.bacPeak<.001;if(c.hidden)return;
  const dpr=Math.min(2,devicePixelRatio||1),w=c.clientWidth,h=c.clientHeight;if(!w)return;
  if(c.width!==w*dpr){c.width=w*dpr;c.height=h*dpr;}
  const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);
  const H=SIM.hist,top=Math.max(.2,SIM.bacPeak*1.2),Y=v=>h-2-(v/top)*(h-4);
  x.strokeStyle='rgba(255,122,107,.45)';x.setLineDash([3,3]);x.lineWidth=1;
  [.15,.3].forEach(v=>{if(v<top){x.beginPath();x.moveTo(0,Y(v));x.lineTo(w,Y(v));x.stroke();}});x.setLineDash([]);
  if(H.length<2)return;
  x.beginPath();H.forEach((v,i)=>{const px=i/(H.length-1)*w;i?x.lineTo(px,Y(v)):x.moveTo(px,Y(v));});
  x.strokeStyle='#d9a6e8';x.lineWidth=1.5;x.stroke();
  x.lineTo(w,h);x.lineTo(0,h);x.closePath();x.fillStyle='rgba(217,166,232,.15)';x.fill();
  x.fillStyle='#d9a6e8';x.beginPath();x.arc(w,Y(H[H.length-1]),2.5,0,TAU);x.fill();
}
function showResult(via){
  mode='result';autoOn=false;control='free';updateButtons();$('btnRemove').hidden=true;
  const m=P.mat,food=m.dig,anusIn=P.entry==='anus';
  const VIA=LANG==='en'?{anus:'Anus',vomit:'Mouth (vomiting)',removed:'Removed by endoscope'}:{anus:'肛門',vomit:'口（嘔吐）',removed:'内視鏡で摘出'};
  $('resEyebrow').textContent=L(`EXIT · ${VIA[via]} · 体内時間 ${fmtT(SIM.bodyT)}`,`EXIT · ${VIA[via]} · time in body ${fmtT(SIM.bodyT)}`);
  $('resTitle').textContent=via==='vomit'?L('吐き出された','Vomited out'):via==='removed'?L('内視鏡で取り出された','Removed with an endoscope')
    :m.liquid?L('液体のまま出てきた','Came out still liquid'):food?(anusIn&&P.tSB===0?L('ほぼそのまま出てきた','Came out almost unchanged'):P.diarrhea?L('下痢便になって出てきた','Came out as diarrhea'):stoolReady()?L('茶色い便になって出てきた','Came out as brown stool'):L('便になって出てきた','Came out as stool'))
    :m===MATS.capsule?L('カプセルが排出された','The capsule passed out'):m.battery?L('電池が出てきた','The battery came out'):L('金属球が出てきた','The metal ball came out');
  paintSwatch($('resSwatch'),true);
  const rows=[[L('体内にいた時間','Time in the body'),fmtT(SIM.bodyT)],[L('胃','Stomach'),fmtT(P.tStom)],[L('小腸','Small intestine'),fmtT(P.tSB)],[L('大腸','Large intestine'),fmtT(P.tColon)],[L('重さ','Weight'),`${P.start.toFixed(1)} g → ${mass().toFixed(1)} g`]];
  const ab=P.absorbed,f=x=>(x||0).toFixed(2)+' g';
  if(food&&!m.liquid&&via==='anus'&&!(anusIn&&P.tSB===0))rows.push([L('形','Shape'),L(`ブリストル${bristol()}型 · ${BRISTOL[bristol()]}`,`Bristol type ${bristol()} · ${BRISTOL[bristol()]}`)],[L('水分','Water'),Math.round(waterFrac()*100)+'%']);
  if(food&&!m.liquid&&P.tSB>0)rows.push([L('吸収されたタンパク質','Protein absorbed'),f(ab.protein)],[L('吸収された脂質','Fat absorbed'),f(ab.fat)],[L('吸収された炭水化物','Carbohydrate absorbed'),f(ab.carb)]);
  if(food&&ab.water>.01)rows.push([L('抜けた水分','Water removed'),f(ab.water)]);
  if(P.gas>1)rows.push([L('発酵で出たガス','Gas from fermentation'),Math.round(P.gas)+' mL']);
  if(SIM.bacPeak>.001){const st=stageOf(SIM.bacPeak);rows.push([L('吸収されたアルコール','Alcohol absorbed'),f(ab.ethanol)],[L('血中アルコール最高値','Peak blood alcohol'),`${SIM.bacPeak.toFixed(3)}% · ${st[1]}`]);}
  if(m.battery)rows.push([L('食道・胃腸の損傷','Damage to esophagus and gut'),Math.round(P.burn*100)+'%'+(P.burn>.8?L('（穿孔の危険）',' (risk of perforation)'):P.burn>.4?L('（深い潰瘍）',' (deep ulcer)'):'')]);
  if(!food&&!m.battery)rows.push([L('状態','Condition'),P.coat>.15?L('表面が便で覆われている（中身は無傷）','coated in stool (inside undamaged)'):L('ほぼそのまま','almost unchanged')]);
  $('resKv').innerHTML=rows.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('');
  let note;
  if(m.liquid)note=anusIn?L('直腸の下のほうの血液は肝臓を通らずに全身へ回る。口から飲んだときのような胃・肝臓での先回りの分解（初回通過効果）がなく、吐いて出すこともできないため、血中濃度が急に上がる。実際に死亡事故が起きている。絶対にまねしないこと。','Blood from the lower rectum goes around the body without passing through the liver. There is none of the early breakdown in the stomach and liver that happens when you drink (the first-pass effect), and you can’t vomit it out, so the blood level shoots up. People have actually died this way. Never try this.')
    :L('口から飲んだアルコールは、一部が胃や肝臓で先に分解されてから全身に回る（初回通過効果）。食後に飲むと胃にとどまる時間が長く、吸収がゆるやかになる。','Some of the alcohol you drink is broken down in the stomach and liver before it reaches the rest of the body (the first-pass effect). Drinking after a meal keeps it in the stomach longer, so it is absorbed more slowly.');
  else if(m.battery)note=via==='removed'?L('実際も、食道に止まった電池は一刻も早く内視鏡で取り出す。飲み込んだかもしれないときは、すぐ医療機関へ。','In real life too, a battery stuck in the esophagus must be removed with an endoscope as fast as possible. If someone might have swallowed one, get medical help right away.')
    :L('電池が胃まで落ちれば多くは自然に出るが、食道に止まると約2時間で深い損傷になる。飲み込んだかもしれないときは、すぐ医療機関へ。','If a battery reaches the stomach it usually passes on its own, but if it stops in the esophagus it causes deep damage in about 2 hours. If someone might have swallowed one, get medical help right away.');
  else if(m.toxic)note=anusIn?L('ツキヨタケの毒を直腸から入れたときのデータはほとんどないため、このアプリでは毒性を再現していない。','There is almost no data on the tsukiyotake poison entering through the rectum, so this app does not simulate its toxicity.')
    :via==='vomit'?L('嘔吐は、胃に入った毒を外に出す防御反応。ツキヨタケは食後30分〜1時間で嘔吐・下痢・腹痛を起こす。','Vomiting is a defense that gets poison in the stomach out. Tsukiyotake causes vomiting, diarrhea and stomach pain 30 minutes to 1 hour after eating.'):L('吸収された毒で腸が荒れ、大腸で水分が吸収されずに下痢になった。','The absorbed poison upset the intestines; the large intestine couldn’t absorb water, so it became diarrhea.');
  else if(food&&anusIn&&P.tSB===0)note=L('大腸には消化酵素がほとんどないため、食べ物は消化されない。腸内細菌が糖や繊維を発酵させてガスを出し、水分が吸われるだけ。直腸が伸びるとすぐ便意が来る。','The large intestine has almost no digestive enzymes, so the food is not digested. Gut bacteria ferment sugars and fiber and make gas, and water is absorbed, and that is all. When the rectum stretches, the urge to go comes right away.');
  else if(food)note=L('便の主な中身は、食べ物の残りかすより腸内細菌と水分。茶色は胆汁のビリルビンが腸内細菌でステルコビリンに変わった色。','Stool is mostly gut bacteria and water rather than leftover food. The brown color comes from bile’s bilirubin, which gut bacteria turn into stercobilin.');
  else note=L('消化されないものも、胃を出る・小腸を進む・大腸にとどまる、それぞれの時間はかかる。','Even things that are not digested take time to leave the stomach, travel the small intestine and sit in the large intestine.');
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
function flowAt(){ // 体の流れ（cm/s, 管の順方向）
  if(!inBody||!loc||!loc.tube||!P)return 0;
  const z=REG[curReg].z,T=loc.tube;
  if(T===TUB.dig&&z==='eso'&&SIM.carry)return 4.5;
  if(T===TUB.dig&&z==='stomach'&&G.pyl.target>0)return SIM.phase===3?3:1.5;
  if(T===TUB.dig&&(z==='sb'||z==='duo')&&P.entry!=='anus')return SIM.phase===3?1.2:.3;
  if(T===TUB.colon&&SIM.massT>0&&loc.s<G.rsj.s+3)return 4; // 大蠕動
  return 0;
}
const ORAL_J=V3(0,-4.6,-.6);
function flowVec(){
  if(!inBody||!loc||!loc.tube||!P||P.stuck)return null;
  const T=loc.tube,tan=T.S[Math.min(T.S.length-1,loc.seg.i)].T;
  if(SIM.vomit){ // 嘔吐: 胃・食道・咽頭を逆流して口へ
    if(T===TUB.oral)return tan.clone().multiplyScalar(-5);
    if(T===TUB.dig){const j=nearestIdx(TUB.dig,ORAL_J);if(loc.s>TUB.dig.S[j].s+.5)return tan.clone().multiplyScalar(-6);return ORAL_J.clone().sub(camera.position).setLength(5);}
    return null;
  }
  const f=flowAt();return f?tan.clone().multiplyScalar(f):null;
}
function stepFree(dt){
  if(P&&P.stuck){vel.set(0,0,0);inp.set(0,0,0);return;}
  inp.set(0,0,0);
  if(keys.KeyW)inp.z-=1;if(keys.KeyS)inp.z+=1;if(keys.KeyA)inp.x-=1;if(keys.KeyD)inp.x+=1;if(keys.KeyE)inp.y+=1;if(keys.KeyQ)inp.y-=1;
  inp.z+=stick.y;inp.x+=stick.x;
  if(inp.lengthSq()>1)inp.normalize();
  const r=inBody&&loc&&loc.seg?loc.seg.r:8;
  const top=3.2*clamp(r/1.1,.3,inBody?2.4:12)*(keys.ShiftLeft||keys.ShiftRight?3:1);
  inp.applyQuaternion(camera.quaternion);
  vel.addScaledVector(inp,top*4*dt);
  if(wheel){vel.addScaledVector(V3(0,0,-1).applyQuaternion(camera.quaternion),wheel*top*.35);wheel=0;}
  const fv=flowVec();
  if(fv){const sp=fv.length(),d=fv.clone().normalize(),cur=vel.dot(d);if(cur<sp)vel.addScaledVector(d,(sp-cur)*Math.min(1,dt*3));}
  vel.multiplyScalar(Math.exp(-4*dt));
  const dp=vel.clone().multiplyScalar(dt),n=Math.max(1,Math.ceil(dp.length()/.1));dp.multiplyScalar(1/n);
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
  const base=(mode==='demo'?2.2:4.5)*clamp(cur.r/1.1,.5,2.5)*(keys.ShiftLeft||keys.ShiftRight?3:1);
  let ds=guideDir*w*base*dt;
  if(R.entry==='mouth'&&guideDir>0){const fl=flowAt();if(fl)ds+=fl*dt;}
  const prevS=guide.s;
  if(P&&P.mat.dig&&R.entry==='mouth'&&ds>0&&guide.s>4.5&&guide.s<7&&P.size>3){ds=0;if(!P.chewMsg){P.chewMsg=true;toast(L('もぐもぐ… 口の中でかみ砕かれている（約20秒）','Munch munch… being chewed up in the mouth (about 20 seconds)'));}}
  guide.s=clamp(guide.s+ds,0,R.L);
  const tgt=routeAt(R,guide.s);
  const keep=camera.position.clone(),prevL=loc;
  camera.position.lerp(tgt.p,1-Math.exp(-dt*5));
  const lc=constrain(camera.position,null);
  if(crossesClosed(prevL,lc)){camera.position.copy(keep);guide.s=clamp(prevS-guideDir*Math.max(.05,Math.abs(ds)),0,R.L);} // 閉じた関門の前では止まる
  else{loc=lc;if(camera.position.distanceTo(tgt.p)>1.2)guide.s=prevS;}
  const cs=projectOnRoute(R,camera.position,guide.s);guide.s=clamp(guide.s,cs-1.5,cs+1.5); // 目標がカメラから離れすぎないように
  if(mode==='demo'||now-lastLook>1500){
    const ahead=routeAt(R,guide.s+guideDir*clamp(tgt.r*2.2,1.2,5));
    const up=V3(0,1,0).applyQuaternion(camera.quaternion);
    if(ahead.p.distanceToSquared(camera.position)>1e-4){mTmp.lookAt(camera.position,ahead.p,up);qTmp.setFromRotationMatrix(mTmp);camera.quaternion.slerp(qTmp,1-Math.exp(-dt*2.4));}
  }
  if(mode==='demo'&&guide.s>=R.L-.01){guide.s=0;teleportTo(TUB.oral,0);}
  else if((guideDir>0&&guide.s>=R.L-.01)||(guideDir<0&&guide.s<=.01)){
    const atOpen=guideDir<0||R.entry==='mouth';
    if(atOpen&&camera.position.distanceTo(tgt.p)<.3){const e=OPEN_ENDS.reduce((a,b)=>a.p.distanceTo(camera.position)<b.p.distanceTo(camera.position)?a:b);
      setControl('free');vel.copy(e.out).multiplyScalar(4);}
    else if(autoOn){autoOn=false;updateButtons();toast(L('順路の終点に着いた','Reached the end of the route'));}
  }
}
function tryReenter(){
  for(const e of OPEN_ENDS){
    _ap.subVectors(camera.position,e.p);const along=_ap.dot(e.out),perp=Math.sqrt(Math.max(0,_ap.lengthSq()-along*along));
    if(along<-.1&&along>-2&&perp<e.r*.8){inBody=true;loc=constrain(camera.position,vel);toast(L('体の中に戻った','Back inside the body'));return;}
  }
}
function checkExit(){
  if(!inBody||!loc)return;
  for(const e of OPEN_ENDS){
    _ap.subVectors(camera.position,e.p);
    if(_ap.dot(e.out)>.12&&_ap.length()<e.r*2.5){
      if(P&&mode==='play'&&e.T===TUB.colon&&(P.entry!=='anus'||P.tColon>2)){inBody=false;setControl('free');showResult('anus');return;}
      if(P&&mode==='play'&&e.T===TUB.oral&&SIM.vomit){inBody=false;SIM.vomit=false;P.vomited=true;setControl('free');showResult('vomit');return;}
      inBody=false;setControl('free');vel.addScaledVector(e.out,2);return;
    }
  }
}
let prevT=performance.now();
function frame(now){
  try{frameBody(now);}catch(err){window.__bdErr=String(err&&err.stack||err);console.error(err);}
  requestAnimationFrame(frame);
}
function frameBody(now){
  const dt=clamp((now-prevT)/1000,0,.05);prevT=Math.max(prevT,now);
  U.uTime.value=now/1000;
  updateSegR();
  applyLook(dt);
  if(!orbitOn||mode==='demo'){
    if(control==='guide'&&inBody)stepGuide(dt,now);else stepFree(dt);
  }
  if(inBody&&!loc)loc=locate(camera.position);
  if(inBody)checkExit();
  // 現在地
  let reg=inBody&&loc&&loc.seg?loc.seg.reg:'outside';
  if(reg!==curReg){curReg=reg;showRegion(reg);}
  const zone=REG[curReg].z;
  // 体内時間
  const tsc=mode==='play'?(P&&P.stuck?30:TSCALE[zone])*SIM.ff:0;
  if(mode==='play'){const dtb=dt*tsc/60;const n=Math.ceil(dtb/2)||1;for(let i=0;i<n;i++)simStep(dtb/n,zone);}
  if(mode!=='result')gateLogic(dt);
  for(const T of tubes)if(T.gateU)T.gates.forEach((g,i)=>T.gateU[i].set(g.s,g.w,g.open,g.depth||.93));
  // 胃の状態
  const fill=clamp((SIM.content-50)/950,0,1);
  U.uStomR.value+=(.55+.45*fill-U.uStomR.value)*Math.min(1,dt*.8);
  U.uStomFold.value=2.2-1.85*clamp((U.uStomR.value-.55)/.45,0,1);
  const waveA=SIM.phase===0?.12:SIM.phase===3?.32:SIM.phase===2?.07:0;
  U.uWave.value+=(waveA-U.uWave.value)*Math.min(1,dt);
  U.uWavePh.value+=dt*TAU*Math.min(.6,3/60*Math.max(1,tsc));
  // 液面
  let bottom=Infinity;for(const [a] of STC)bottom=Math.min(bottom,a.p.y-a.r*U.uStomR.value*.85);
  const level=bottom+.35+6.2*Math.pow(fill,.8);
  fluid.position.y=level;
  fluidMat.uniforms.uFluid.value.set(...lin(fill>.02?[.8,.66,.45]:[.84,.8,.55]));
  const nf=Math.round(FN*fill);fGeo.setDrawRange(0,nf);
  for(let i=0;i<nf;i++){if(fPos[i*3+1]>level||Math.random()<.002)placeFood(i,level);}
  if(nf)fGeo.attributes.position.needsUpdate=true;
  const under=inBody&&zone==='stomach'&&camera.position.y<level;
  $('tint').style.opacity=under?.55:0;$('tint').style.background=fill>.02?'#b98a55':'#c9bf7a';
  // 外観ビュー
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
  const c=camera.position;
  dust.visible=!orbitOn;
  for(let i=0;i<PN;i++){for(let k=0;k<3;k++){const v=pBase[i*3+k]+Math.sin(now/4000+i)*.15;pPos[i*3+k]=c.getComponent(k)-4+(((v-c.getComponent(k))%8)+8)%8;}}
  pGeo.attributes.position.needsUpdate=true;
  updateHUD(dt,now);if(skipRender)return;drawMap();updateSigns(rc);updateAhead(now);
  renderer.render(scene,rc);
}
function onResize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=orbitCam.aspect=tpsCam.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();orbitCam.updateProjectionMatrix();tpsCam.updateProjectionMatrix();mapSetup();}
addEventListener('resize',onResize);
let skipRender=false;
// 検証用: 画面が非表示でも sec 秒ぶんシミュレーションを進める
function simRun(sec,keysDown){(keysDown||[]).forEach(k=>keys[k]=true);skipRender=true;let t=prevT;for(let i=0;i<sec*60;i++){t+=1000/60;frameBody(t);}skipRender=false;(keysDown||[]).forEach(k=>keys[k]=false);}
window.__bd={simRun,frameBody,orbitCam,tpsCam,avatar,locate,SIM,G,get P(){return P;},begin,showResult,get loc(){return loc;},camera,guide,setControl};
if(innerWidth<760)$('side').classList.remove('open');
showStart();
mapSetup();
requestAnimationFrame(frame);
