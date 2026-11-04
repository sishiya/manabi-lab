'use strict';
if(!window.__wwGL) throw new Error("wifi-wave: WebGL2 の準備ができなかったので止める");   // gl.js が止まったとき
// ================= sensing room: screen, person, tour (PLAN.md 段階B) =================
// One measurement = one FDTD run of the pulse (sense.js Run), spread over a few frames.
// Between measurements the person walks 1.5 cm toward where the finger points.
const SE={tour:0, run:null, person:null, target:null, leaving:false, ang:0, base:null, baseDb:null,
  motion:new Motion(), amp:null, hist:[], count:0, rate:0, lastDone:0, chunk:1024,
  paused:false, eye:false, reveal:false, guess:null, dragging:false, doorTo:0};
const DOOR_STEP=1.5*Math.PI/180;   // rad per measurement: 90° in about 1 s of real time, like the person's 1.5 cm
const STEP_M=.015;                 // m walked per measurement
const REAL_RATE=1/STEP_M;          // measurements per second that make 1.5 cm a step at a walk of 1 m/s (~67/s)
const TOUR_N=8, CENTER=[3.0,1.9];
// the door: hinge at the top of the 0.8 m opening in the right wall. People come and go through it,
// standing just outside (EXIT) while it opens; inside the room nobody may stand where the board swings
const HINGE=[5.55,1.4], EXIT=[5.68,1.8], DOOR_OPEN=Math.PI*.45;
const inSwing=p=>!!p&&p[0]<5.5&&Math.hypot(p[0]-HINGE[0],p[1]-HINGE[1])<1.05;
const sCell=m=>m/DX;               // metres → cells of the small grid
const sPx=m=>m/DX*(W/SN.W)*scale;  // metres → css px on the map
const meters=c=>c*DX*(SN.W/W);     // main-map cell → metres in the room

function senseEnter(){
  SE.tour=0; SE.person=null; SE.target=null; SE.leaving=false; SE.eye=false; SE.reveal=false; SE.guess=null;
  SE.doorTo=0; SROOM.door=0;
  SE.hist=[]; SE.count=0; SE.rate=0; SE.lastDone=0; SE.run=null; SE.paused=false;
  SROOM.empty=false; SROOM.person=null;
  if(S.freq!=='2.4') $('segFreq').querySelector('[data-v="2.4"]').click();   // sensing is 2.4 GHz only (PLAN)
  // the empty room is measured first, over a few frames like any measurement (a phone would stall on one big run)
  SE.base=null; SE.baseDb=null; SE.calib=true; sBuild(); SE.run=new Run(pulse);
  $('senseBox').hidden=false; $('btnTour').hidden=false; $('btnTour').disabled=true; ov.style.cursor='default'; placeCap();
  setTour(0);
}
// portrait phones: only the map, the bars and the movement line stay pinned; the caption and the buttons
// go to the top of the scrolling panel (like #hint in ui.js), so the pinned part leaves room to scroll
const capMq=matchMedia('(max-width:860px) and (orientation:portrait)'), capBox=document.createElement('div'),
  capEl=$('senseCap'), btnsEl=$('senseBtns');   // kept here: while moved they are not found by id
capBox.id='senseLower';
function placeCap(){
  if(capMq.matches&&S.sense){capBox.append(capEl,btnsEl);$('panel').prepend(capBox);}
  else{$('senseBox').append(capEl,btnsEl);capBox.remove();}
}
capMq.addEventListener('change',placeCap);
function senseLeave(){
  SE.run=null; $('senseBox').hidden=true; $('btnTour').hidden=true; placeCap();   // S.sense is false: back into #senseBox
  document.body.classList.remove('sense-wf'); ov.style.cursor='crosshair';
}

// ---------- tour: one new thing per step ----------
const TOUR=[
  L('ルーター（黄色）が短い電波を出します。電波は壁や窓で跳ね返り、いくつもの道を通って、すみの<b>受信機</b>に届きます。',
    'The router (yellow) sends a short burst of radio waves. They bounce off the walls and the window and reach the <b>receiver</b> in the corner along many paths.'),
  L('受信機は、届いた電波を<b>周波数ごとに52本に分けて</b>強さを測ります（下の棒）。白い線は、誰もいない部屋のときの形です。',
    'The receiver splits the arriving waves into <b>52 frequency slices</b> and measures the strength of each (the bars below). The white marks show the shape when the room is empty.'),
  L('人が入ってきました。<b>図の上をドラッグすると、人がそこへ歩きます。</b>棒の形がどう変わるか見てみよう。',
    'Someone has come in. <b>Drag on the map and the person walks there.</b> Watch how the shape of the bars changes.'),
  L('棒の形を時間の順に並べました（下の帯。右がいま）。<b>色は誰もいないときとの差。</b>人が止まっていても、受信機の雑音で少しちらつきます。',
    'Here the bar shapes are lined up in time (the strip below; now is on the right). <b>The colour is the difference from the empty room.</b> Even when the person stands still, receiver noise makes it flicker a little.'),
  L(`色（差）ではなく、<b>ちらつきの大きさ</b>で決めます。誰もいないときの${MOTION.k}倍をこえたら「動きあり」。多くの研究や一部の製品も、ゆれの大きさで決めています。人を止めたり歩かせたりしてみよう。`,
    `It decides by <b>how much it flickers</b>, not by the colour. More than ${MOTION.k} times the flicker of the empty room means “movement”. Many studies and some products decide this way too. Try making the person stop and walk.`),
  L('<b>「ルーターの目で見る」</b>を押すと地図が消え、棒だけになります。ルーターに見えるのはこれだけ。人はどこにいる？',
    'Press <b>“See it as the router does”</b>: the map disappears and only the bars remain. That is all the router gets. Where is the person?'),
  L('人を部屋から出して、<b>ドアを開け閉め</b>してみよう。誰もいないのに「動きあり」になることがあります（人かドアかは区別できません）。開いたまま止まると「動きなし」にもどりますが、棒は白い線とずれたままです。',
    'Send the person out and <b>open or close the door</b>. It sometimes says “movement” although nobody is there (a door and a person look alike). Once the door stops, it says “no movement” again, but the bars stay off the white marks.'),
  L('棒からわかるのは<b>「何かが動いた」</b>まで。じっと止まっている人はゆれないので「動きなし」です。研究でもっとわかることは、解説の「研究ではどこまでわかる？」へ。',
    'The bars tell you <b>“something moved”</b>, and no more. A person standing still causes no wobble, so it says “no movement”. For what research can do, see “How far can research go?” in the explanation.'),
];
function setTour(i){
  if(i===2&&SE.tour<2&&!SE.person) personIn();   // the person comes in only when step 3 starts
  SE.tour=i;
  document.body.classList.toggle('sense-wf',i>=3);
  $('btnTour').innerHTML=i<TOUR_N-1?L(`つぎへ ▶ <small>${i+1}/${TOUR_N}</small>`,`Next ▶ <small>${i+1}/${TOUR_N}</small>`):L('最初から','Start over');
  $('btnPerson').hidden=i<2; $('btnEye').hidden=i<5; $('btnDoor').hidden=i<6; $('btnSensePlay').hidden=i<1;
  caption(); buttons(); texts();
}
// 最初から: back to the empty room as when the room was opened (the empty room's CSI is kept)
function senseRestart(){
  SE.person=null; SE.target=null; SE.leaving=false; SE.eye=false; SE.reveal=false; SE.guess=null; SE.answerPos=null; SE.doorTo=0;
  SE.hist=[]; SE.amp=null; SE.count=0; SE.rate=0; SE.lastDone=0; SE.run=null; SE.paused=false; SROOM.door=0;
  SE.motion=new Motion(); SE.motion.calibrate(SE.base.H);
  setTour(0);
}
$('btnTour').onclick=()=>{ if(SE.tour<TOUR_N-1) setTour(SE.tour+1); else senseRestart(); };
function caption(){
  let t=TOUR[SE.tour];
  if(!SE.base) t=L('誰もいない部屋を測っています…','Measuring the empty room…');
  if(SE.eye&&!SE.reveal) t=L('ルーターに見えるのは下の棒だけ。人は部屋の中を歩いています。<b>いると思う所をタップ</b>して答えよう。',
    'All the router gets is the bars below. The person is walking around the room. <b>Tap where you think they are.</b>');
  if(SE.eye&&SE.reveal&&SE.guess){
    const d=Math.hypot(SE.guess[0]-SE.answerPos[0],SE.guess[1]-SE.answerPos[1]);
    t=d<.6?L(`答え: <b>${d.toFixed(1)} m</b>。近い！ でも棒から当てたのではなく、たまたまかもしれません。何回かためしてみよう。`,
      `Answer: <b>${d.toFixed(1)} m</b> off. Close! But was it the bars, or luck? Try a few more times.`)
      :L(`答え: <b>${d.toFixed(1)} m</b> はなれていました。送信1つ・受信1つの棒だけで、前もって学習もしないと、「動いた」はわかっても<b>「どこか」はほとんどわかりません</b>。`,
      `Answer: you were <b>${d.toFixed(1)} m</b> off. With one sender, one receiver and no training beforehand, the bars tell you <b>that</b> someone moved, but <b>hardly where</b>.`);
  }
  $('senseCap').innerHTML=t;
}
function buttons(){
  $('btnPerson').textContent=SE.person&&!SE.leaving?L('人を部屋から出す','Send the person out'):L('人を部屋に入れる','Let the person in');
  $('btnPerson').disabled=SE.eye;
  $('btnDoor').textContent=SE.doorTo?L('ドアを閉める','Close the door'):L('ドアを開ける','Open the door'); $('btnDoor').disabled=SE.eye;
  $('btnEye').textContent=!SE.eye?L('ルーターの目で見る','See it as the router does'):SE.reveal?L('もう一度','Try again'):L('地図にもどす','Back to the map');
  $('btnSensePlay').textContent=SE.paused?L('再生','Play'):L('一時停止','Pause');
}
$('btnDoor').onclick=()=>{ SE.doorTo=SE.doorTo?0:DOOR_OPEN; buttons(); };
$('btnPerson').onclick=()=>{ if(SE.person&&!SE.leaving){SE.leaving=true;SE.target=EXIT.slice();SE.doorTo=DOOR_OPEN;} else personIn(); buttons(); };
$('btnEye').onclick=()=>{
  if(!SE.eye){SE.eye=true;SE.reveal=false;SE.guess=null;SE.doorTo=SROOM.door;   // a door still moving would add its own wobble
    if(!SE.person||SE.leaving){SE.person=randomSpot();SE.leaving=false;}SE.target=randomSpot();}
  else if(SE.reveal){SE.reveal=false;SE.guess=null;SE.target=randomSpot();}
  else {SE.eye=false;SE.target=null;}
  caption(); buttons();
};
// a pause (or a hidden tab) must not count as one slow measurement in 「本物の約1/○」
$('btnSensePlay').onclick=()=>{SE.paused=!SE.paused;SE.lastDone=0;buttons();texts();};
document.addEventListener('visibilitychange',()=>{SE.lastDone=0;});
function personIn(){ SE.person=EXIT.slice(); SE.target=CENTER.slice(); SE.leaving=false; SE.ang=Math.PI/2; SE.doorTo=DOOR_OPEN; }
function randomSpot(){ const [x0,y0,x1,y1]=SROOM.inside; let p; do p=[x0+.3+Math.random()*(x1-x0-.6), y0+.3+Math.random()*(y1-y0-.6)]; while(inSwing(p)); return p; }
const clampRoom=([x,y])=>{const [x0,y0,x1,y1]=SROOM.inside;return [Math.max(x0,Math.min(x1,x)),Math.max(y0,Math.min(y1,y))];};

// ---------- measuring ----------
function startMeasure(){
  // the door first: a person standing where it swings stops it, as a body would
  let doorMoved=false;
  if(SROOM.door!==SE.doorTo&&!inSwing(SE.person)){const d=SE.doorTo-SROOM.door;SROOM.door+=Math.sign(d)*Math.min(Math.abs(d),DOOR_STEP);doorMoved=true;}
  if(SE.person&&SE.target){
    const dx=SE.target[0]-SE.person[0], dy=SE.target[1]-SE.person[1], d=Math.hypot(dx,dy);
    const s=Math.min(d,STEP_M), next=d>.004?[SE.person[0]+dx/d*s, SE.person[1]+dy/d*s]:SE.person;
    // wait while the door swings through the next step, and do not pass the doorway unless it is open
    const wait=(doorMoved&&inSwing(next))||(next[0]>5.3&&SROOM.door<DOOR_OPEN-.01);
    if(d>.004&&!wait){
      SE.person=next;
      // shoulders across the walking direction; turn at most 6° per measurement
      let a=Math.atan2(dy,dx)+Math.PI/2, da=Math.atan2(Math.sin(a-SE.ang),Math.cos(a-SE.ang));
      if(Math.abs(da)>Math.PI/2) da-=Math.sign(da)*Math.PI;      // the ellipse looks the same turned by 180°
      SE.ang+=Math.max(-.105,Math.min(.105,da));
    } else if(d<=.004&&SE.leaving){ SE.person=null; SE.target=null; SE.leaving=false; buttons(); }
    else if(d<=.004&&SE.eye&&!SE.reveal) SE.target=randomSpot();
  }
  SROOM.person=SE.person; SROOM.ang=SE.ang; sBuild();
  SE.run=new Run(pulse);
}
function finishMeasure(){
  const c=csiOf(SE.run.out()); SE.run=null;
  if(SE.calib){   // the empty room, remembered once (no noise)
    SE.calib=false; SE.base=c; SE.baseDb=c.amp.slice(); SE.motion=new Motion(); SE.motion.calibrate(c.H);
    $('btnTour').disabled=false; caption(); return;
  }
  SE.amp=noisyAmp(c.H); SE.motion.push(SE.amp);
  SE.hist.push(SE.amp.map((a,k)=>20*Math.log10(Math.max(a,1e-12))-SE.baseDb[k])); if(SE.hist.length>240) SE.hist.shift();
  const t=performance.now(); if(SE.lastDone){const r=1000/(t-SE.lastDone);SE.rate=SE.rate?SE.rate+(r-SE.rate)*.15:r;} SE.lastDone=t;
  SE.count++; texts();
}
function measureOnce(){   // one whole measurement now (debug and hidden tabs)
  if(!SE.run) startMeasure();
  while(!SE.run.advance(1e9));
  finishMeasure();
}
function senseFrame(now){
  if(!SE.paused){
    if(!SE.run) startMeasure();
    const t=performance.now(), done=SE.run.advance(SE.chunk), el=performance.now()-t;
    // keep each frame's share of GPU work near 10 ms, so the page stays smooth on slow phones too.
    // At most 1024 steps (13 ns) a frame, so the pulse can be seen spreading out
    if(el>14) SE.chunk=Math.max(256,Math.round(SE.chunk*.8)); else if(el<7) SE.chunk=Math.min(1024,Math.round(SE.chunk*1.25));
    if(done) finishMeasure();
  }
  display(ssim,[sCell(SROOM.router[0]),sCell(SROOM.router[1])]);
  drawSense(now); drawCsi(); placeTour();
}
let tourPos='';
function placeTour(){   // keep つぎへ in the map's top right corner, clear of the receiver (the frame can be larger than the map)
  const fr=$('frame').getBoundingClientRect(), cr=cv.getBoundingClientRect(), k=`${fr.right-cr.right|0},${cr.top-fr.top|0}`;
  if(k===tourPos) return; tourPos=k;
  const b=$('btnTour').style; b.right=(fr.right-cr.right+6)+'px'; b.top=(cr.top-fr.top+6)+'px'; b.bottom='auto';
}

// ---------- texts under the bars ----------
function texts(){
  const m=SE.motion, show=SE.tour>=4&&SE.hist.length>=MOTION.win;
  $('senseMotion').innerHTML=show?L(`動き: <b style="color:${m.moving?'var(--accent)':'var(--muted)'}">${m.moving?'あり':'なし'}</b>　ゆれ ×${m.ratio.toFixed(1)}（${MOTION.k}倍で「あり」）`,
    `Movement: <b style="color:${m.moving?'var(--accent)':'var(--muted)'}">${m.moving?'yes':'no'}</b>　wobble ×${m.ratio.toFixed(1)} (“yes” above ×${MOTION.k})`):'';
  const slow=SE.rate>0?Math.max(1,Math.round(REAL_RATE/SE.rate)):0;
  const walking=SE.person&&SE.target&&Math.hypot(SE.target[0]-SE.person[0],SE.target[1]-SE.person[1])>.03;
  if(SE.tour<1){$('senseCount').textContent='';return;}
  $('senseCount').textContent=L(`測定 ${SE.count}回`,`${SE.count} measurements`)+(slow&&walking?L(`・人の歩きは本物の約1/${slow}`,` · walking about 1/${slow} of real speed`):'')+(SE.paused?L('・一時停止中',' · paused'):'');
}

// ---------- the map overlay ----------
function drawSense(now){
  const c=octx;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,ov.width,ov.height);c.setTransform(dpr,0,0,dpr,0,0);
  const P=([x,y])=>[sPx(x),sPx(y)], small=W*scale<560, fs=small?10:12;
  c.textAlign='center';c.textBaseline='middle';
  const hide=SE.eye&&!SE.reveal;
  if(hide){
    c.fillStyle='#060b16';c.fillRect(0,0,W*scale,H*scale);
    c.strokeStyle='rgba(170,200,255,.35)';c.lineWidth=1.5;c.setLineDash([5,5]);
    const [a,b]=P([.45,.45]),[e,f]=P([5.55,3.3]);c.strokeRect(a,b,e-a,f-b);c.setLineDash([]);
    c.font=`500 ${small?11:14}px 'Zen Kaku Gothic New',sans-serif`;c.fillStyle='rgba(225,235,255,.8)';
    c.fillText(L('ルーターには部屋の中は見えません','The router cannot see inside the room'),W*scale/2,H*scale*.45);
    c.font=`500 ${fs}px 'Zen Kaku Gothic New',sans-serif`;c.fillStyle='rgba(225,235,255,.6)';
    c.fillText(L('人はどこ？ タップして答えよう','Where is the person? Tap to answer'),W*scale/2,H*scale*.45+(small?18:24));
  } else {
    c.font=`500 ${fs}px 'Zen Kaku Gothic New',sans-serif`;
    for(const [t,x,y] of [[L('窓','Window'),3.0,.62],[L('ドア','Door'),5.3,1.18]]){const [sx,sy]=P([x,y]);const w=c.measureText(t).width+8;c.fillStyle='rgba(8,14,28,.55)';c.fillRect(sx-w/2,sy-fs*.75,w,fs*1.5);c.fillStyle='rgba(225,235,255,.8)';c.fillText(t,sx,sy);}
    // where the person is heading
    if(SE.person&&SE.target&&!SE.eye&&Math.hypot(SE.target[0]-SE.person[0],SE.target[1]-SE.person[1])>.03){
      const [tx,ty]=P(SE.target),[px,py]=P(SE.person);
      c.strokeStyle='rgba(255,201,90,.7)';c.lineWidth=1.5;c.setLineDash([4,4]);c.beginPath();c.moveTo(px,py);c.lineTo(tx,ty);c.stroke();
      c.beginPath();c.arc(tx,ty,small?6:9,0,7);c.stroke();c.setLineDash([]);
    }
    if(SE.person){const [px,py]=P(SE.person);c.font=`700 ${fs}px 'Zen Kaku Gothic New',sans-serif`;c.fillStyle='rgba(8,14,28,.7)';const t=L('人','Person'),w=c.measureText(t).width+8;c.fillRect(px-w/2,py-sPx(.23)-fs*1.6,w,fs*1.4);c.fillStyle='#9cc4ff';c.fillText(t,px,py-sPx(.23)-fs*.9);}
    if(SE.reveal&&SE.guess){
      const [gx,gy]=P(SE.guess),[px,py]=P(SE.answerPos), d=Math.hypot(SE.guess[0]-SE.answerPos[0],SE.guess[1]-SE.answerPos[1]);
      c.strokeStyle='#fff';c.lineWidth=1.5;c.setLineDash([3,4]);c.beginPath();c.moveTo(gx,gy);c.lineTo(px,py);c.stroke();c.setLineDash([]);
      c.font=`700 ${fs}px 'IBM Plex Mono',monospace`;const dt=`${d.toFixed(1)} m`,dw=c.measureText(dt).width+8,[mx,my]=[(gx+px)/2,(gy+py)/2];
      c.fillStyle='rgba(8,14,28,.8)';c.fillRect(mx-dw/2,my-fs*.8,dw,fs*1.6);c.fillStyle='#fff';c.fillText(dt,mx,my);
      c.strokeStyle='#ff6b6b';c.lineWidth=3;const r=small?6:9;c.beginPath();c.moveTo(gx-r,gy-r);c.lineTo(gx+r,gy+r);c.moveTo(gx+r,gy-r);c.lineTo(gx-r,gy+r);c.stroke();
      c.font=`700 ${fs}px 'Zen Kaku Gothic New',sans-serif`;c.fillStyle='#ff9d9d';c.fillText(L('あなたの答え','Your guess'),gx,gy+r+fs);
    }
  }
  // router
  {const [rx,ry]=P(SROOM.router);
    c.fillStyle='#ffc95a';c.strokeStyle='#1a1406';c.lineWidth=2;c.beginPath();c.arc(rx,ry,small?7:9,0,7);c.fill();c.stroke();
    c.font=`700 ${small?9:12}px 'Zen Kaku Gothic New',sans-serif`;const t=L('ルーター','Router'),w=c.measureText(t).width+8;
    c.fillStyle='rgba(8,14,28,.7)';c.fillRect(rx-w/2,ry+(small?10:13),w,small?13:17);c.fillStyle='#ffd88a';c.fillText(t,rx,ry+(small?16.5:21.5));}
  // receiver
  {const [qx,qy]=P(SROOM.rx), q=small?.75:1;
    c.fillStyle='#0b1322';c.strokeStyle='#e8eefb';c.lineWidth=2*q;c.beginPath();c.roundRect(qx-9*q,qy-6*q,18*q,12*q,2*q);c.fill();c.stroke();
    c.strokeStyle='#e8eefb';c.lineWidth=1.5*q;c.beginPath();c.moveTo(qx+5*q,qy-6*q);c.lineTo(qx+5*q,qy-13*q);c.stroke();
    c.font=`700 ${small?9:12}px 'Zen Kaku Gothic New',sans-serif`;const t=L('受信機','Receiver'),w=c.measureText(t).width+8;
    c.fillStyle='rgba(8,14,28,.7)';c.fillRect(qx-w/2,qy-(small?28:36),w,small?13:17);c.fillStyle='#e8eefb';c.fillText(t,qx,qy-(small?21.5:27.5));}
  // scale bar
  const bx=14,by=H*scale-14,bl=sPx(1);
  c.strokeStyle='rgba(225,235,255,.8)';c.lineWidth=2;c.beginPath();c.moveTo(bx,by-5);c.lineTo(bx,by);c.lineTo(bx+bl,by);c.lineTo(bx+bl,by-5);c.stroke();
  c.textAlign='left';c.font=`500 11px 'IBM Plex Mono',monospace`;c.fillStyle='rgba(225,235,255,.85)';c.fillText('1 m',bx+bl+6,by-3);
}

// ---------- the 52 bars and the time strip ----------
const ccv=$('csiCv'), cctx=ccv.getContext('2d');
function drawCsi(){
  const r=ccv.getBoundingClientRect(), w=Math.round(r.width*dpr), h=Math.round(r.height*dpr);
  if(!w||!h) return;
  if(ccv.width!==w||ccv.height!==h){ccv.width=w;ccv.height=h;}
  const c=cctx; c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,r.width,r.height);
  const W2=r.width, wf=SE.tour>=3, hb=wf?Math.round(r.height*.48):r.height, pad=6, top=15, bot=12;
  c.font=`500 10px 'Zen Kaku Gothic New',sans-serif`;c.textBaseline='middle';c.textAlign='left';c.fillStyle='rgba(200,215,240,.75)';
  if(SE.tour<1){c.fillText(L('受信機が測った電波は、つぎで見せます','The receiver’s measurement comes next'),pad,hb/2);return;}
  c.fillText(L('受信機に届いた電波の強さ（周波数ごと・52本）','Strength at the receiver (per frequency, 52 slices)'),pad,8);
  c.textAlign='right';c.fillStyle='rgba(255,255,255,.85)';c.fillText(L('白い線: 誰もいないとき','white: empty room'),W2-pad,8);
  // 1 dB ≈ 1/14 of the bar height: a person's few-dB change shows, and standing in the way (−5…−10 dB) still fits
  const mean=SE.baseDb.reduce((a,b)=>a+b,0)/52, lo=mean-11, hi=mean+3, y0=hb-bot+8, yh=y0-top;
  const Y=db=>y0-Math.max(0,Math.min(1,(db-lo)/(hi-lo)))*yh, bw=(W2-2*pad)/52;
  let under=false;
  if(SE.amp) for(let k=0;k<52;k++){const db=20*Math.log10(Math.max(SE.amp[k],1e-12)), y=Y(db);if(db<lo)under=true;c.fillStyle='#4cc9f0';c.fillRect(pad+k*bw+bw*.12,y,bw*.76,y0-y);}
  // standing in the way can drop all bars below the scale: say so, instead of looking like "no signal"
  if(under){c.textAlign='center';c.fillStyle='#ffc95a';c.fillText(L('▼ 下に切れた棒は、もっと弱い','▼ bars cut off at the bottom are even weaker'),W2/2,y0-8);}
  c.fillStyle='rgba(255,255,255,.9)';for(let k=0;k<52;k++){c.fillRect(pad+k*bw,Y(SE.baseDb[k])-1,bw,2);}
  if(!wf) return;
  // time strip: one column per measurement, newest on the right; colour = difference from the empty room
  const t0=hb+16, th=r.height-t0-2, cw=Math.max(2,Math.min(4,(W2-2*pad)/120)), ncol=Math.floor((W2-2*pad)/cw), rh=th/52;
  c.fillStyle='rgba(200,215,240,.75)';c.textAlign='left';c.fillText(L('誰もいないときとの差（よこ: 時間 →、たて: 周波数）','Difference from the empty room (across: time →, down: frequency)'),pad,hb+8);
  c.textAlign='right';c.fillStyle='#ffb347';c.fillText(L('強い','up'),W2-pad-34,hb+8);c.fillStyle='#b48cff';c.fillText(L('弱い','down'),W2-pad,hb+8);
  const hs=SE.hist.slice(-ncol);
  hs.forEach((col,i)=>{const x=W2-pad-(hs.length-i)*cw;
    for(let k=0;k<52;k++){const v=Math.max(-1,Math.min(1,col[k]/6));
      c.fillStyle=v>=0?`rgba(255,179,71,${.08+.92*v})`:`rgba(180,140,255,${.08-.92*v})`;c.fillRect(x,t0+k*rh,cw+.5,rh+.5);}});
}

// ---------- pointer (from ui.js) ----------
function senseDown(e){
  const p=toCell(e), m=[meters(p[0]),meters(p[1])];
  if(!isFinite(m[0])||!isFinite(m[1])) return;   // the map had no size yet
  try{ov.setPointerCapture(e.pointerId);}catch(_){}
  if(SE.eye&&!SE.reveal){
    // the person stops where they were, so the line, the number and the map all agree
    SE.guess=m; SE.answerPos=SE.person.slice(); SE.target=null; SE.reveal=true; caption(); buttons();
    // portrait: the answer is at the top of the panel, right under the pinned map
    if(capMq.matches) window.scrollTo({top:0}); else $('senseCap').scrollIntoView({block:'nearest'});
    return;
  }
  if(SE.eye||SE.tour<2||!SE.person||SE.leaving) return;
  SE.target=clampRoom(m); SE.dragging=true;
}
function senseMove(e){ if(!SE.dragging) return; const p=toCell(e); SE.target=clampRoom([meters(p[0]),meters(p[1])]); }
function senseUp(){ SE.dragging=false; }

window.__ww.senseUI={SE,setTour,measureOnce,drawCsi,drawSense,texts};
