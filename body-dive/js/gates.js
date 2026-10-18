'use strict';
/* ---------- 関門の開閉と反射 ---------- */
function gateLogic(dtR){
  if(mode==='demo'){GATES.forEach(g=>{g.open+=(1-g.open)*Math.min(1,dtR*3);});epiglottis.rotation.x=-.5;return;}
  const T=loc&&loc.tube,s=loc?loc.s:0,inDig=inBody&&T===TUB.dig,inColon=inBody&&T===TUB.colon;
  const zone=REG[curReg]?REG[curReg].z:'out';
  const food=P&&P.mat.dig, capsule=P&&P.mat===MATS.capsule;
  const pushing=keys.KeyW||stick.y<-.3||(control==='guide'&&autoOn);
  // カプセル内視鏡は、押し続ければどの関門も押し広げて通れる（本物の内視鏡も通過できる）
  if(capsule&&inBody)GATES.forEach(g=>{
    g.hold=(g.hold||0)-dtR;
    const near=(T===g.T&&Math.abs(s-g.s)<1.6)||camera.position.distanceTo(g.p)<2.2;
    if(near&&pushing&&g.open<.5){g.push=(g.push||0)+dtR;if(g.push>.8){g.hold=6;g.push=0;toast(L(`${g.name}を押し広げて通過（内視鏡もこうして通る）`,`Pushed through the ${g.name.toLowerCase()} (endoscopes get through this way too)`));}}
    else if(!near||!pushing)g.push=0;
  });
  // 飲み込み
  SIM.swallowT+=dtR;SIM.cool-=dtR;
  const goingDown=control==='guide'?guideDir>0:(T?vel.dot(T.S[Math.min(T.S.length-1,loc.seg.i)].T)>-.2:true);
  if(inDig&&goingDown&&s<G.ues.s&&s>G.ues.s-2.2&&SIM.cool<=0&&SIM.swallowT>4){SIM.swallowT=0;SIM.carry=true;SIM.cool=5;toast(L('ごくん。飲み込みの反射: 声門と喉頭蓋が気道を閉じ、食道の入口が開く','Gulp. The swallowing reflex: the glottis and epiglottis close the airway and the entrance of the esophagus opens'));}
  const swallowing=SIM.swallowT<3;
  G.ues.target=swallowing||(SIM.carry&&inDig&&Math.abs(s-G.ues.s)<.8)?1:0;
  G.glot.target=SIM.swallowT<3.5?0:1;
  G.les.target=inDig&&s>G.les.s-4&&s<G.les.s+.8&&(SIM.carry||s<G.les.s)?1:0;
  if(inDig&&s>G.les.s+1)SIM.carry=false;
  if(!inDig&&SIM.swallowT>12)SIM.carry=false;
  // 嘔吐
  if(SIM.vomit){
    SIM.vomitT+=dtR;G.ues.target=G.les.target=1;G.glot.target=0;G.pyl.target=0;
    if(SIM.vomitT>40||(P&&(P.tSB>0||!inDig&&T!==TUB.oral))){SIM.vomit=false;if(P)P.vomited=true;}
  }
  // ボタン電池が食道の第2狭窄部に引っかかる
  if(P&&P.mat.battery&&inDig&&!P.unstuck&&P.entry!=='anus'&&s>LODGE-.2&&s<LODGE+.8){
    if(!P.stuck){P.stuck=true;SIM.carry=false;setControl('free');vel.set(0,0,0);
      toast(L('電池が食道の第2狭窄部（大動脈弓が横切るところ）に引っかかった。電池から流れる電流で強いアルカリができ、粘膜が溶けるように傷つく','The battery got stuck at the second narrowing of the esophagus (where the aortic arch crosses). Current from the battery makes a strong alkali that eats into the lining'));}
    if(pushing){P.pushT+=dtR;if(P.pushT>3){P.stuck=false;P.unstuck=true;toast(L('無理に押し込んで胃へ落とした。実際は危険で、すぐ内視鏡で取り出すべき状態','Forced it down into the stomach. In reality this is dangerous; it should be removed right away with an endoscope'));}}else P.pushT=0;
  }
  $('btnRemove').hidden=!(P&&P.stuck);
  if(P&&P.mat.battery){const lv=P.burn>.8?3:P.burn>.4?2:0;if(lv>(P.burnLv||0)){P.burnLv=lv;toast(lv===3?L('粘膜が深くえぐれ、食道に穴があく（穿孔）危険が高い','The lining is deeply eaten away; high risk of a hole in the esophagus (perforation)'):L('深い潰瘍ができてきた。約2時間で重い損傷になる','A deep ulcer is forming. Within about 2 hours it becomes serious damage'));}}
  if(SIM.vomit)return finishGates(dtR);
  // 幽門
  const pylOK=P&&((food&&P.prog>=1)||SIM.phase===3);
  G.pyl.target=inDig&&s>G.pyl.s-7&&s<G.pyl.s+.6&&pylOK?1:(G.pyl.open>.5&&inDig&&Math.abs(s-G.pyl.s)<.7?1:0);
  // 回盲弁
  SIM.icvHold-=dtR;
  G.icv.target=(inDig&&s>G.icv.s-5&&s<G.icv.s+.5&&P&&P.tSB>=150)||SIM.icvHold>0?1:0;
  // 肛門
  SIM.analHold-=dtR;
  const nearAnal=camera.position.distanceTo(G.anal.p)<4;
  if(!inBody&&nearAnal&&capsule)SIM.analHold=5;
  G.anal.target=(nearAnal&&P&&(P.entry==='anus'||(capsule&&!inBody)))||SIM.analHold>0||(inColon&&s>G.anal.s-5&&P&&stoolReady())?1:0;
  // S状結腸で便をためる → 大蠕動で直腸へ
  SIM.massT-=dtR;
  if(P&&P.entry!=='anus'&&inColon&&s>G.rsj.s-14&&s<G.rsj.s&&!P.massDone&&(baseReady()||P.mealPush)){
    P.massDone=true;SIM.massT=20;
    toast(L('大蠕動（総蠕動）が来た。1日に3〜4回、食事中や食後に起こる強い収縮で、S状結腸にためられた便が一気に直腸へ送られる','A mass movement! These strong contractions happen 3–4 times a day, during or after meals, and push the stool stored in the sigmoid colon into the rectum all at once'));}
  G.rsj.target=(P&&(P.entry==='anus'||P.massDone))||(inColon&&s>G.rsj.s)||SIM.massT>0?1:0;
  if(inColon&&s>G.anal.s-8&&P&&stoolReady()&&!SIM.urgeShown){SIM.urgeShown=true;toast(L('便意が来た。直腸が伸びて肛門括約筋がゆるむ → そのまま外へ','Time to go! The rectum stretches and the anal sphincters relax → straight out'));}
  // 血中アルコールの段階が上がったら知らせる
  const st=STAGES.indexOf(stageOf(bacOf(SIM.blood)));
  if(st>(SIM.stageIdx||0)){SIM.stageIdx=st;if(st>=1)toast(L(`血中アルコール ${bacOf(SIM.blood).toFixed(3)}% · ${STAGES[st][1]}`,`Blood alcohol ${bacOf(SIM.blood).toFixed(3)}% · ${STAGES[st][1]}`));}
  finishGates(dtR);
}
function finishGates(dtR){
  const T=loc&&loc.tube,s=loc?loc.s:0,zone=REG[curReg]?REG[curReg].z:'out',food=P&&P.mat.dig;
  GATES.forEach(g=>{if(g.hold>0)g.target=1;g.open+=(g.target-g.open)*Math.min(1,dtR*(g.id==='glot'||g.id==='ues'?8:3));});
  epiglottis.rotation.x=-.5+1.25*(1-G.glot.open);
  // 誤嚥 → 咳
  SIM.coughT-=dtR;
  if(food&&inBody&&zone==='air'&&SIM.coughT<=0&&T){SIM.coughT=1.2;const sm=T.S[Math.min(T.S.length-1,loc.seg.i)];
    if(control==='guide')setControl('free');vel.copy(sm.T).multiplyScalar(-25);toast(L('ゴホッ！ 気道に入ったので咳で押し戻された（誤嚥を防ぐ反射）','Cough! You went into the airway, so a cough pushed you back (a reflex that prevents choking)'));}
  // 閉じた関門の前で理由を出す
  SIM.hintT-=dtR;
  if(SIM.hintT<=0&&inBody&&T&&P)for(const g of T.gates){
    if(g.open<.3&&Math.abs(s-g.s)<1.5){const t=gateHint(g,s<g.s);if(t){toast(t);SIM.hintT=7;}break;}
  }
}
function gateHint(g,up){
  const ff=kb(L(' · F で早送り',' · F to fast-forward'),L(' · 「早送り」で速く',' · “Fast ×10” to speed up'));
  const pw=kb(L('W で押し続ける','Keep pressing W'),L('スティックを上に倒し続ける','Keep holding the stick up'));
  if(P.mat===MATS.capsule&&g.bend)return L(`${g.name}: せまく曲がっている（括約筋ではない）。${pw}と通れる`,`${g.name}: narrow and bent (not a sphincter). ${pw} to get through`);
  if(P.mat===MATS.capsule&&g.id!=='glot')return L(`${g.name}は閉じている。${pw}と押し広げて通れる（内視鏡と同じ）`,`The ${g.name.toLowerCase()} is closed. ${pw} to push it open and get through (like an endoscope)`);
  switch(g.id){
    case 'rsj':
      if(!up)return null;
      return L(`S状結腸から直腸へは、せまく曲がったところ（括約筋ではない）。便はS状結腸にためられ、直腸はふだん空っぽ。大蠕動（1日3〜4回、食事中や食後）で直腸へ送られる（大腸 ${fmtT(P.tColon)} / 目安12時間）`+ff+kb(' · M で食事（胃結腸反射）',' · 「食事をする」で胃結腸反射'),
        `The way from the sigmoid colon into the rectum is a narrow bend (not a sphincter). Stool is stored in the sigmoid colon, and the rectum is usually empty. A mass movement (3–4 times a day, during or after meals) sends it into the rectum (large intestine ${fmtT(P.tColon)} / about 12 h)`+ff+kb(' · M to eat (gastrocolic reflex)',' · “Eat a meal” for the gastrocolic reflex'));
    case 'les':return up?null:L('下部食道括約筋は、胃酸が逆流しないよう閉じている','The lower esophageal sphincter stays closed so stomach acid doesn’t flow back up');
    case 'ues':return up?null:L('上部食道括約筋は閉じている。逆流を防ぐしくみ','The upper esophageal sphincter is closed. It prevents backflow');
    case 'pyl':
      if(!up)return L('幽門は、十二指腸から胃への逆流を防ぐため閉じている','The pylorus is closed to stop backflow from the duodenum into the stomach');
      if(P.mat.dig)return L(`幽門は閉じている。胃でかゆ状になるまで待とう（${Math.round(P.prog*100)}%）`,`The pylorus is closed. Wait until you turn to porridge in the stomach (${Math.round(P.prog*100)}%)`)+ff;
      if(SIM.phase===0)return L(`食後の胃は固形物を通さない。胃が空になり（あと約${Math.ceil((SIM.content-60)/3.2)}分）、空腹期の強い収縮が来るまで待とう`,`After a meal the stomach won’t let solids through. Wait until it empties (about ${Math.ceil((SIM.content-60)/3.2)} min more) and a strong fasting contraction comes`)+ff;
      return L(`大きな固形物は空腹期の強い収縮（MMC 第3相）でしか出られない。あと約${Math.ceil(90-SIM.mmc%100)}分`,`Large solid objects can only leave with a strong fasting contraction (MMC phase III). About ${Math.ceil(90-SIM.mmc%100)} min more`)+ff;
    case 'icv':
      if(up)return L(`回盲弁は閉じている。小腸での消化と吸収が進むまで待とう（${fmtT(P.tSB)} / 2時間30分）`,`The ileocecal valve is closed. Wait for digestion and absorption in the small intestine (${fmtT(P.tSB)} / 2 h 30 min)`)+ff;
      return P.mat===MATS.capsule?L('押し続けると回盲弁を通れる','Keep pushing to get through the ileocecal valve'):L('回盲弁は大腸からの逆流を防ぐ','The ileocecal valve stops backflow from the large intestine');
    case 'anal':
      if(!inBody)return null;
      return P.mat.dig?L(`まだ便意がない。大腸で水分が抜けるのを待とう（大腸 ${fmtT(P.tColon)} / 目安12時間、水分 ${Math.round(waterFrac()*100)}%）`,`No urge yet. Wait for the large intestine to remove water (large intestine ${fmtT(P.tColon)} / about 12 h, water ${Math.round(waterFrac()*100)}%)`)+ff
                      :L(`まだ便意がない（大腸 ${fmtT(P.tColon)} / 目安12時間）`,`No urge yet (large intestine ${fmtT(P.tColon)} / about 12 h)`)+ff;
    case 'glot':return L('飲み込み中は声門が閉じて気道を守っている','While swallowing, the glottis closes to protect the airway');
  }
  return null;
}

/* ---------- 道しるべ（分岐の案内） ---------- */
const SIGNS=[
 {p:[0,.4,-1.9],k:'gut',t:'咽頭へ',s:'下で前（喉頭→肺）と後ろ（食道→胃）に分かれる'},
 {p:[0,1.6,1.5],k:'air',t:'← 鼻の穴（外）',s:'戻ると体の外'},
 {p:[0,-4.2,-.2],k:'gut',t:'↓ 咽頭',s:'まっすぐ下は食道（胃へ）'},
 {p:[0,-1.2,-2.4],k:'air',t:'↑ 鼻腔',s:'上へ行くと鼻の穴'},
 {p:[0,-7.3,-1.0],k:'air',t:'前の穴: 喉頭',s:'気管 → 気管支 → 肺（空気の道）'},
 {p:[0,-9.2,-2.6],k:'gut',t:'後ろの穴: 食道',s:'胃へ（食べ物の道）· 近づくと飲み込み反射'},
 {p:[0,-12.6,.6],k:'air',t:'声帯の下は気管',s:'約11cm下で左右に分かれる'},
 {p:[-.9,-27.2,.5],k:'air',t:'右主気管支',s:'右肺（上・中・下の3葉）'},
 {p:[.9,-27.2,.5],k:'air',t:'左主気管支',s:'左肺（上・下の2葉）'},
 {p:[-2.9,-29.2,.4],k:'air',t:'右上葉気管支',s:'右肺の上の葉へ'},
 {p:[-4.1,-32.6,.6],k:'air',t:'右中葉気管支',s:'右肺の前側の葉へ'},
 {p:[-4.6,-35,.1],k:'air',t:'右下葉気管支',s:'右肺の下の葉へ'},
 {p:[3.5,-30.4,.4],k:'air',t:'左上葉気管支',s:'左肺の上の葉へ'},
 {p:[4.4,-33.6,.2],k:'air',t:'左下葉気管支',s:'左肺の下の葉へ'},
 {p:[2.1,-42.6,-.4],k:'gut',t:'噴門 → 胃',s:'下部食道括約筋が胃酸の逆流を防ぐ'},
 {p:[-1.8,-56.8,2.5],k:'gut',t:'幽門 → 十二指腸',s:'かゆ状になったものだけ通れる'},
 {p:[-6.3,-58.6,.5],k:'gut',t:'大十二指腸乳頭',s:'胆汁と膵液がここから流れ込む'},
 {p:[2,-63,.5],k:'gut',t:'空腸へ',s:'ここから小腸。生きている体で約3m（このアプリでは短縮）'},
 {p:[-8,-80.9,2],k:'gut',t:'回盲弁 → 大腸',s:'その先の下は盲腸、上は上行結腸'},
 {p:[-11,-80.4,2.2],k:'gut',t:'回盲弁 → 回腸（小腸）',s:'ふだんは閉じて逆流を防ぐ'},
 {p:[-12,-84.6,2.4],k:'gut',t:'盲腸の底',s:'本物はここから虫垂がのびる'},
 {p:[-12,-76,2],k:'gut',t:'↑ 上行結腸',s:'右の腹を上る'},
 {p:[4.6,-85.7,3.5],k:'gut',t:'S状結腸 → 直腸',s:'便はここでためられ、大蠕動で直腸へ送られる'},
 {p:[0,-97,-.2],k:'gut',t:'肛門 → 体の外',s:'便意が来ると括約筋がゆるむ'}
].map(o=>Object.assign(o,{v:V3(...o.p)}));
// 英語（I18N.md）: 道しるべを上の順に上書き。道しるべを足したらここにも足す
if(LANG==='en')[
  ['To the pharynx','Below, it splits into front (larynx → lungs) and back (esophagus → stomach)'],
  ['← Nostril (outside)','Go back to leave the body'],
  ['↓ Pharynx','Straight down is the esophagus (to the stomach)'],
  ['↑ Nasal cavity','Up leads to the nostrils'],
  ['Front opening: larynx','Trachea → bronchi → lungs (the air path)'],
  ['Back opening: esophagus','To the stomach (the food path) · swallowing reflex when you get close'],
  ['Below the vocal folds: trachea','Splits left and right about 11 cm down'],
  ['Right main bronchus','Right lung (upper, middle and lower lobes)'],
  ['Left main bronchus','Left lung (upper and lower lobes)'],
  ['Right upper lobe bronchus','To the upper lobe of the right lung'],
  ['Right middle lobe bronchus','To the front lobe of the right lung'],
  ['Right lower lobe bronchus','To the lower lobe of the right lung'],
  ['Left upper lobe bronchus','To the upper lobe of the left lung'],
  ['Left lower lobe bronchus','To the lower lobe of the left lung'],
  ['Cardia → stomach','The lower esophageal sphincter stops acid flowing back'],
  ['Pylorus → duodenum','Only porridge-like chyme can pass'],
  ['Major duodenal papilla','Bile and pancreatic juice flow in here'],
  ['To the jejunum','The small intestine starts here. About 3 m in a living body (shortened in this app)'],
  ['Ileocecal valve → large intestine','Below is the cecum, above is the ascending colon'],
  ['Ileocecal valve → ileum (small intestine)','Usually closed to stop backflow'],
  ['Bottom of the cecum','In a real body the appendix hangs from here'],
  ['↑ Ascending colon','Goes up the right side of the belly'],
  ['Sigmoid colon → rectum','Stool is stored here and sent to the rectum by mass movements'],
  ['Anus → outside','The sphincters relax when you feel the urge'],
].forEach(([t,s],i)=>{SIGNS[i].t=t;SIGNS[i].s=s;});
const ORBIT_LABELS=(LANG==='en'?[[0,4,11,'Nose'],[0,-4.2,12,'Mouth'],[0,-5,-5,'Pharynx'],[0,-18,1,'Trachea'],[-7,-36,0,'To right lung'],[7,-36,0,'To left lung'],[0,-24,-3.5,'Esophagus'],[9,-50,2,'Stomach'],[-7,-60,.5,'Duodenum'],[1,-73,2,'Small intestine'],[-12.5,-70,2,'Ascending colon'],[0,-62,8,'Transverse colon'],[13,-70,2,'Descending colon'],[7,-86,4,'Sigmoid colon'],[0,-92,-1,'Rectum'],[0,-100,.5,'Anus']]
  :[[0,4,11,'鼻'],[0,-4.2,12,'口'],[0,-5,-5,'咽頭'],[0,-18,1,'気管'],[-7,-36,0,'右肺へ'],[7,-36,0,'左肺へ'],[0,-24,-3.5,'食道'],[9,-50,2,'胃'],[-7,-60,.5,'十二指腸'],[1,-73,2,'小腸'],[-12.5,-70,2,'上行結腸'],[0,-62,8,'横行結腸'],[13,-70,2,'下行結腸'],[7,-86,4,'S状結腸'],[0,-92,-1,'直腸'],[0,-100,.5,'肛門']])
  .map(([x,y,z,t])=>({v:V3(x,y,z),t,orbit:true}));
const signBox=$('signs');
[...SIGNS,...ORBIT_LABELS].forEach(o=>{const el=document.createElement('div');el.className='sign '+(o.orbit?'big':o.k);el.innerHTML=`<b>${o.t}</b>`+(o.s?`<span>${o.s}</span>`:'');el.hidden=true;signBox.appendChild(el);o.el=el;});
const _pv=V3(0,0,0);
function updateSigns(rc){
  rc.updateMatrixWorld(); // この描画のカメラで位置を出す（前の描画の行列のままだと、回すと名前札がふるえた）
  const W=innerWidth,H=innerHeight,c=camera.position,show=mode!=='demo';
  for(const o of SIGNS){
    let vis=false;
    if(show&&!orbitOn&&inBody){const d=o.v.distanceTo(c);
      if(d<6.5&&o.tube===undefined){const L=locate(o.v);o.tube=L.score<.5?L.tube:null;}
      if(d<6.5&&d>.25&&(d<2.5||!loc||o.tube===loc.tube)){_pv.copy(o.v).project(rc);if(_pv.z<1&&Math.abs(_pv.x)<1.1&&Math.abs(_pv.y)<1.1){vis=true;
        o.el.style.transform=`translate(${Math.round((_pv.x*.5+.5)*W)}px,${Math.round((-_pv.y*.5+.5)*H)}px) translate(-50%,-100%)`;o.el.style.opacity=clamp((6.5-d)/2.5,0,1);}}}
    o.el.hidden=!vis;
  }
  for(const o of ORBIT_LABELS){
    let vis=false;
    if(orbitOn){_pv.copy(o.v).project(rc);if(_pv.z<1){vis=true;o.el.style.transform=`translate(${Math.round((_pv.x*.5+.5)*W)}px,${Math.round((-_pv.y*.5+.5)*H)}px) translate(-50%,-100%)`;}}
    o.el.hidden=!vis;
  }
}
/* この先に何があるか */
function aheadInfo(){
  if(!inBody||mode==='demo')return null;
  let R,s,dir;
  if(control==='guide'){R=guide.R;dir=guideDir;let bd=Infinity;s=guide.s;
    for(const q of R.pts){if(Math.abs(q.L-guide.s)>4)continue;const d=q.p.distanceToSquared(camera.position);if(d<bd){bd=d;s=q.L;}}}
  else{const n=nearestOnRoutes(camera.position,P&&P.entry);if(!n||n.d>3)return null;R=n.R;s=n.s;
    const a=routeAt(R,s-1).p,b=routeAt(R,s+1).p,f=V3(0,0,-1).applyQuaternion(camera.quaternion);dir=f.dot(b.sub(a))>=0?1:-1;}
  let lo=0,hi=R.pts.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(R.pts[m].L<s)lo=m;else hi=m;}
  const out=[],seen=new Set();let reg=R.pts[lo].reg;
  for(let k=dir>0?hi:lo;k>=0&&k<R.pts.length&&out.length<4;k+=dir){
    const q=R.pts[k],dist=Math.abs(q.L-s);
    if(q.gate&&!seen.has(q.gate)){seen.add(q.gate);out.push({gate:q.gate,dist});}
    if(q.reg!==reg&&REG[q.reg].n!==REG[reg].n){reg=q.reg;out.push({reg,dist});}
  }
  const endName=dir>0?(R.entry==='nose'?L('肺の奥（行き止まり）','deep in the lung (dead end)'):L('肛門 → 外','anus → outside')):(R.entry==='nose'?L('鼻の穴 → 外','nostril → outside'):L('口 → 外','mouth → outside'));
  return {out,R,dir,endName,end:dir>0?R.L-s:s};
}
let aheadT=0;
function updateAhead(now){
  if(now-aheadT<300)return;aheadT=now;
  const a=aheadInfo(),el=$('ahead');
  if(!a){el.innerHTML='';return;}
  const cm=d=>d<1?L('すぐ','now'):Math.round(d)+'cm';
  const parts=a.out.map(o=>o.gate?`<span class="st gate ${o.gate.open>.5?'open':''}">${o.gate.name}${o.gate.bend?(o.gate.open>.5?L('（通れる）',' (passable)'):L('（せまい）',' (narrow)')):o.gate.open>.5?L('（開）',' (open)'):L('（閉）',' (closed)')}<em>${cm(o.dist)}</em></span>`
    :`<span class="st">${REG[o.reg].n}<em>${cm(o.dist)}</em></span>`);
  if(a.out.length<4)parts.push(`<span class="st">${a.endName}<em>${cm(a.end)}</em></span>`);
  const way=a.dir>0?a.R.fwd:a.R.rev;
  el.innerHTML=`<span class="lab">${L(`この先（${way}）`,`Ahead (${way})`)}</span>`+parts.join('<span class="lab">›</span>');
}

