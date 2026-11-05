'use strict';
if(!window.__wwGL) throw new Error("wifi-wave: WebGL2 の準備ができなかったので止める");   // gl.js が止まったとき
// ================= sensing room: screen, person, tour, quiz (PLAN.md 段階B・C, 2026-11-05 の作り直し) =================
// One measurement = one FDTD run of the pulse (sense.js Run), spread over a few frames.
// The map shows the steady 2.437 GHz wave taken from the last finished run (no flash per pulse);
// the pulse itself is shown once, slowly, on the first step.
// Between measurements the person walks 1.5 cm toward where the finger points.
const SE={tour:0, run:null, person:null, target:null, leaving:false, ang:0, base:null, baseDb:null,
  motion:new Motion(), amp:null, hist:[], count:0, rate:0, lastDone:0, chunk:1024,
  paused:false, guess:null, answerPos:null, dragging:false, doorTo:0,
  show:false, mapAt:0, view:'wave', quiz:null};
const DOOR_STEP=1.5*Math.PI/180;   // rad per measurement: 90° in about 1 s of real time, like the person's 1.5 cm
const STEP_M=.015;                 // m walked per measurement
const REAL_RATE=1/STEP_M;          // measurements per second that make 1.5 cm a step at a walk of 1 m/s (~67/s)
const TOUR_N=7, CENTER=[3.0,1.9];
const SHOW_SLOW=3200, SHOW_CHUNK=16;   // the pulse on step 1: 16 steps (0.2 ns) a frame for its first 40 ns
const QUIZ_N=5;                        // 「動いている？」 questions, then one 「どこ？」
// the door: hinge at the top of the 0.8 m opening in the right wall. People come and go through it,
// standing just outside (EXIT) while it opens; inside the room nobody may stand where the board swings
const HINGE=[5.55,1.4], EXIT=[5.68,1.8], DOOR_OPEN=Math.PI*.45;
const inSwing=p=>!!p&&p[0]<5.5&&Math.hypot(p[0]-HINGE[0],p[1]-HINGE[1])<1.05;
const sCell=m=>m/DX;               // metres → cells of the small grid
const sPx=m=>m/DX*(W/SN.W)*scale;  // metres → css px on the map
const meters=c=>c*DX*(SN.W/W);     // main-map cell → metres in the room
const hidden=()=>SE.quiz&&!SE.quiz.answered;   // the map is covered: only the bars and the strip are left

function senseEnter(){
  SE.tour=0; SE.person=null; SE.target=null; SE.leaving=false; SE.guess=null; SE.quiz=null; SE.view='wave';
  SE.doorTo=DOOR_OPEN; SROOM.door=DOOR_OPEN;   // the room stands with its door open, so a person can walk in without changing it
  SE.hist=[]; SE.hn=[]; SE.amp=null; SE.dragging=false; SE.answerPos=null; SE.count=0; SE.rate=0; SE.lastDone=0; SE.run=null; SE.paused=false; SE.mapAt=0;
  SROOM.empty=false; SROOM.person=null;
  if(S.freq!=='2.4') $('segFreq').querySelector('[data-v="2.4"]').click();   // sensing is 2.4 GHz only (PLAN)
  // the empty room is measured first, and this first run is the pulse shown slowly on step 1
  SE.base=null; SE.baseDb=null; SE.calib=true; showPulse();
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
  SE.run=null; SE.quiz=null; $('senseBox').hidden=true; $('btnTour').hidden=true; placeCap();   // S.sense is false: back into #senseBox
  document.body.classList.remove('sense-wf'); ov.style.cursor='crosshair';
}
function showPulse(){ SE.show=true; SROOM.person=SE.person; sBuild(); SE.run=new Run(pulse); }

// ---------- tour: one new thing per step ----------
const TOUR=[
  L('ルーター（黄色）が短い電波を1回だけ出します。壁や窓で跳ね返りながら広がり、だんだん弱まります。おさまるまでの波から <b>2.437GHz の成分だけを取り出す</b>と、ふだんの WiFi の電波が<b>部屋にどう広がっているか</b>がわかります。',
    'The router (yellow) sends one short burst. It spreads, bouncing off the walls and the window, and fades. <b>Taking out only its 2.437 GHz part</b> gives <b>how everyday WiFi fills the room</b>.'),
  L('人が入ってきました。<b>図の上をドラッグすると、人がそこへ歩きます。</b>体は水が多く、電波を吸ったり跳ね返したりします。人が動くと、波の模様が変わります。',
    'Someone has come in. <b>Drag on the map and the person walks there.</b> A body is mostly water, so it soaks up and reflects radio waves. When the person moves, the wave pattern changes.'),
  L('色を<b>誰もいないときとの差</b>にしました（だいだい: 強くなった、むらさき: 弱くなった）。人のまわりだけでなく、跳ね返りを通して<b>部屋じゅう</b>が変わります。すみの<b>受信機</b>の所も。',
    'The colours now show the <b>difference from the empty room</b> (orange: stronger, purple: weaker). Through the reflections, the <b>whole room</b> changes, not only around the person. So does the spot of the <b>receiver</b> in the corner.'),
  L('受信機が測れるのは、受信機の1か所だけ。届いた電波を<b>周波数ごとに52本に分けて</b>強さを測ります（地図の下の棒。白い線は誰もいないとき）。人が動くと、棒の形が変わります。',
    'The receiver can only measure at its own spot. It splits the arriving waves into <b>52 frequency slices</b> and measures the strength of each (the bars under the map; white marks: empty room). When the person moves, the shape of the bars changes.'),
  L('棒の形の<b>ゆれ</b>を時間の順に並べました（下の帯。右がいま）。歩くと帯がゆれ、<b>止まるとゆれは消えます</b>（人がいても）。人を歩かせたり止めたりしてみよう。',
    'Here the <b>wobble</b> of the bar shapes is lined up in time (the strip below; now is on the right). Walking makes the strip wobble; <b>standing still makes it calm</b>, even with the person there. Try making the person walk and stop.'),
  L(`受信機は、<b>ゆれの大きさ</b>で決めます。誰もいないときの${MOTION.k}倍をこえたら「動きあり」。研究でよく使われる考え方です。人を出して<b>ドアを開け閉め</b>してみよう。ドアでもゆれますが、この部屋では動いている間の約3割しか「動きあり」になりません。`,
    `The receiver decides by <b>how big the wobble is</b>. More than ${MOTION.k} times the empty room’s wobble means “movement”, an idea often used in research. Send the person out and <b>open or close the door</b>. A door wobbles too, but in this room only about 3 in 10 of its moving measurements say “movement”.`),
  L('では、地図をかくして<b>受信機の目</b>で当ててみよう。見えるのは棒とゆれの帯だけです。',
    'Now hide the map and try it <b>with the receiver’s eyes</b>. All you get is the bars and the wobble strip.'),
];
function setTour(i){
  if(i>=1&&SE.tour<1&&!SE.person) personIn();   // the person comes in on step 2
  if(i===1) SE.view='wave'; if(i===2&&SE.tour<2) SE.view='diff';
  SE.tour=i;
  if(i===0&&SE.base&&!SE.show) showPulse();
  if(i>=1&&SE.show&&!SE.calib){SE.show=false;SE.run=null;}   // a pulse shown again on step 1 gives way to measuring
  document.body.classList.toggle('sense-bars',i>=3||!!SE.quiz);
  document.body.classList.toggle('sense-wf',i>=4||!!SE.quiz);
  $('btnTour').innerHTML=SE.quiz?L('✕ クイズをやめる','✕ End the quiz'):i<TOUR_N-1?L(`つぎへ ▶ <small>${i+1}/${TOUR_N}</small>`,`Next ▶ <small>${i+1}/${TOUR_N}</small>`):L('最初から','Start over');
  caption(); buttons(); texts();
}
// 最初から: back to the empty room as when the room was opened (the empty room's CSI is kept)
function senseRestart(){
  SE.person=null; SE.target=null; SE.leaving=false; SE.guess=null; SE.answerPos=null; SE.doorTo=DOOR_OPEN; SE.quiz=null; SE.view='wave';
  SE.hist=[]; SE.hn=[]; SE.amp=null; SE.count=0; SE.rate=0; SE.lastDone=0; SE.run=null; SE.show=false; SE.paused=false; SROOM.door=DOOR_OPEN;
  SE.motion=new Motion(); SE.motion.calibrate(SE.base.H);
  setTour(0);
}
// during the quiz the same corner button leads back to the map (the old 「ルーターの目」 had no way back after an answer)
$('btnTour').onclick=()=>{ if(SE.quiz) quizEnd(); else if(SE.tour<TOUR_N-1) setTour(SE.tour+1); else senseRestart(); };

// ---------- the quiz: the map is covered, the bars and the wobble strip are all you get ----------
const KIND_TXT={
  walk:L('人が<b>歩いて</b>いました。','Someone was <b>walking</b>.'),
  door:L('動いていたのは人ではなく<b>ドア</b>でした（部屋には誰もいません）。ゆれの大きさだけでは、人かドアかは区別できません。','It was not a person but the <b>door</b> (nobody was in the room). By the size of the wobble alone, a door and a person look alike.'),
  still:L('人が<b>じっと立って</b>いました。止まった人はゆれを起こさないので、ゆれで決めると誰もいない部屋と同じ「動きなし」です（棒は白い線からずれていますが、本物の部屋では家具などで誰もいないときの形も変わっていきます）。',
    'Someone was <b>standing still</b>. A still person makes no wobble, so judged by the wobble it is “no movement”, just like an empty room (the bars are off the white marks, but in a real room the empty shape itself drifts as furniture moves).'),
  empty:L('部屋には<b>誰もいません</b>でした。','<b>Nobody</b> was in the room.'),
};
const truth=k=>k==='walk'||k==='door';
// the quiz door opens and shuts all the way (1.5° a measurement, like a door in about 1 s of real time).
// Only about 3 in 10 of its measurements say "movement" (DEVNOTES); swinging it to and fro by 15–30° caught even less
const quizDoorTo=()=>SROOM.door>DOOR_OPEN/2?0:DOOR_OPEN;
function quizStart(){
  // every kind once, plus one more walk or still, in random order
  const ks=['walk','door','still','empty',Math.random()<.5?'walk':'still'];
  for(let i=ks.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[ks[i],ks[j]]=[ks[j],ks[i]];}
  SE.quiz={kinds:ks, round:0, score:0, rscore:0}; SE.paused=false; setTour(SE.tour); quizRound();
}
function quizRound(){
  const q=SE.quiz; q.kind=q.round<QUIZ_N?q.kinds[q.round]:'where'; q.answered=false; q.ans=null; q.verdict=null;
  SE.guess=null; SE.answerPos=null; SE.leaving=false; SE.dragging=false;
  SE.person=q.kind==='walk'||q.kind==='still'||q.kind==='where'?randomSpot():null;
  SE.target=q.kind==='walk'||q.kind==='where'?randomSpot():null; SE.ang=Math.random()*Math.PI;
  SROOM.door=SE.doorTo=DOOR_OPEN; if(q.kind==='door') SE.doorTo=quizDoorTo();   // startMeasure keeps it going
  // a new question starts clean: the run in flight and the strip still hold the last scene
  SE.run=null; SE.show=false; SE.hist=[]; SE.hn=[]; SE.amp=null; SE.motion.hist=[]; q.from=SE.count;
  document.body.classList.add('sense-wf');
  caption(); buttons(); texts();
}
const quizReady=()=>SE.quiz&&SE.count-SE.quiz.from>=MOTION.win;
function quizAnswer(moving){
  const q=SE.quiz; if(!q||q.answered||!quizReady()) return;
  q.ans=moving; q.answered=true; q.verdict={moving:SE.motion.moving, ratio:SE.motion.ratio};
  if(moving===truth(q.kind)) q.score++;
  if(SE.motion.moving===truth(q.kind)) q.rscore++;
  caption(); buttons(); texts(); revealScroll();
}
function quizNext(){ const q=SE.quiz; q.round++; if(q.round>QUIZ_N){quizEnd();return;} quizRound(); }
function quizEnd(){
  SE.quiz=null; SE.guess=null; SE.answerPos=null; SROOM.door=SE.doorTo=DOOR_OPEN;
  SE.target=null; if(!SE.person) personIn();   // back in through the door, not out of thin air
  SE.run=null; SE.hist=[]; SE.hn=[]; SE.motion.hist=[];
  setTour(SE.tour);
}
function revealScroll(){ if(capMq.matches) window.scrollTo({top:0}); else $('senseCap').scrollIntoView({block:'nearest'}); }

function caption(){
  let t=TOUR[SE.tour];
  if(!SE.base) t=TOUR[0];
  const q=SE.quiz;
  if(q){
    const no=q.round<QUIZ_N?L(`問題 ${q.round+1}/${QUIZ_N}　`,`Question ${q.round+1}/${QUIZ_N}: `):L('最後の問題　','Last question: ');
    const wait=L(`帯がたまるまで待ってね（${SE.count-q.from}/${MOTION.win}回）`,`Wait for the strip to fill (${SE.count-q.from}/${MOTION.win})`);
    if(q.kind==='where'&&!q.answered) t=no+(quizReady()?L('人が部屋のどこかを歩いています。棒と帯を見て、<b>いると思う所をタップ</b>しよう。','Someone is walking somewhere in the room. Look at the bars and the strip, and <b>tap where you think they are.</b>'):wait);
    else if(q.kind==='where'){
      const d=Math.hypot(SE.guess[0]-SE.answerPos[0],SE.guess[1]-SE.answerPos[1]);
      t=L(`<b>${d.toFixed(1)} m</b> はなれていました。<b>あなた ${q.score}/${QUIZ_N}・受信機 ${q.rscore}/${QUIZ_N}。</b>ゆれでわかるのは「何かが動いた」まで。人かドアか、止まった人がいるか、どこにいるかは、送信1つ・受信1つの強さだけではほとんどわかりません。研究でもっとわかることは、解説の「研究ではどこまでわかる？」へ。`,
        `You were <b>${d.toFixed(1)} m</b> off. <b>You ${q.score}/${QUIZ_N}, the receiver ${q.rscore}/${QUIZ_N}.</b> The wobble tells you “something moved”, and no more. A person or a door, someone standing still, where they are: one sender, one receiver and strength alone hardly tell. For what research can do, see “How far can research go?” in the explanation.`);
    }
    else if(!q.answered) t=no+(quizReady()?L('部屋の中で、<b>何か動いている？</b>','<b>Is anything moving</b> in the room?'):wait);
    else {
      const right=q.ans===truth(q.kind), v=q.verdict, rr=v.moving===truth(q.kind);
      t=(right?L('<b>正解！</b> ','<b>Right!</b> '):L('<b>ざんねん。</b> ','<b>Not quite.</b> '))+KIND_TXT[q.kind]
        +L(` 受信機の判定は「動き${v.moving?'あり':'なし'}」（ゆれ ×${v.ratio.toFixed(1)}）`,` The receiver said “${v.moving?'movement':'no movement'}” (wobble ×${v.ratio.toFixed(1)})`)
        +(rr?L('。','.'):truth(q.kind)?L('で、受信機も見のがしました（帯にほとんど出ない動き）。','; it missed it too (the motion hardly shows in the strip).'):L('で、受信機はまちがえました（雑音のゆれ）。','; it got it wrong (the noise wobbled).'));
    }
  }
  $('senseCap').innerHTML=t;
}
function buttons(){
  const q=SE.quiz, tour=SE.tour, set=(id,show,txt)=>{const b=$(id);b.hidden=!show;if(txt!=null)b.textContent=txt;return b;};
  set('btnPerson',!q&&tour>=1,SE.person&&!SE.leaving?L('人を部屋から出す','Send the person out'):L('人を部屋に入れる','Let the person in'));
  set('btnDoor',!q&&tour>=5,SE.doorTo?L('ドアを閉める','Close the door'):L('ドアを開ける','Open the door'));
  set('btnView',(!q||q.answered)&&tour>=2,SE.view==='wave'?L('差の色にする','Show the difference'):L('波にもどす','Show the wave'));
  set('btnQuiz',!q&&tour>=6,L('受信機の目でクイズ','Quiz: the receiver’s eyes'));
  set('btnSensePlay',!q&&tour>=1,SE.paused?L('再生','Play'):L('一時停止','Pause'));
  const ask=q&&!q.answered&&q.kind!=='where';
  $('quizAns').hidden=!ask;
  set('btnYes',ask,L('動いている','Moving')).disabled=!quizReady();
  set('btnNo',ask,L('動いていない','Not moving')).disabled=!quizReady();
  set('btnQNext',q&&q.answered&&q.round<QUIZ_N,q&&q.round<QUIZ_N-1?L(`つぎの問題 ▶ ${q.round+2}/${QUIZ_N}`,`Next question ▶ ${q.round+2}/${QUIZ_N}`):L('最後の問題へ ▶','Last question ▶'));
  set('btnQAgain',q&&q.answered&&q.round>=QUIZ_N,L('もう一度クイズ','Quiz again'));
}
$('btnDoor').onclick=()=>{ SE.doorTo=SE.doorTo?0:DOOR_OPEN; buttons(); };
$('btnPerson').onclick=()=>{ if(SE.person&&!SE.leaving){SE.leaving=true;SE.target=EXIT.slice();SE.doorTo=DOOR_OPEN;} else personIn(); buttons(); };
$('btnView').onclick=()=>{ SE.view=SE.view==='wave'?'diff':'wave'; buttons(); };
$('btnQuiz').onclick=quizStart;
$('btnYes').onclick=()=>quizAnswer(true);
$('btnNo').onclick=()=>quizAnswer(false);
$('btnQNext').onclick=quizNext;
$('btnQAgain').onclick=quizStart;
// a pause (or a hidden tab) must not count as one slow measurement in 「本物の約1/○」
$('btnSensePlay').onclick=()=>{SE.paused=!SE.paused;SE.lastDone=0;buttons();texts();};
document.addEventListener('visibilitychange',()=>{SE.lastDone=0;});
function personIn(){ SE.person=EXIT.slice(); SE.target=CENTER.slice(); SE.leaving=false; SE.ang=Math.PI/2; SE.doorTo=DOOR_OPEN; }
function randomSpot(){ const [x0,y0,x1,y1]=SROOM.inside; let p; do p=[x0+.3+Math.random()*(x1-x0-.6), y0+.3+Math.random()*(y1-y0-.6)]; while(inSwing(p)); return p; }
const clampRoom=([x,y])=>{const [x0,y0,x1,y1]=SROOM.inside;return [Math.max(x0,Math.min(x1,x)),Math.max(y0,Math.min(y1,y))];};

// ---------- measuring ----------
function startMeasure(){
  const q=SE.quiz;
  // the quiz door keeps swinging open and shut
  if(q&&q.kind==='door'&&SROOM.door===SE.doorTo) SE.doorTo=quizDoorTo();
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
    else if(d<=.004&&q) SE.target=randomSpot();   // the quiz walker keeps walking
  }
  SROOM.person=SE.person; SROOM.ang=SE.ang; sBuild();
  SE.run=new Run(pulse);
}
function finishMeasure(){
  const c=csiOf(SE.run.out()); SE.run=null; keepMap(); SE.mapAt=performance.now();
  if(SE.calib){   // the empty room, remembered once (no noise)
    SE.calib=false; SE.show=false; SE.base=c; SE.baseDb=c.amp.slice(); keepBase(); SE.motion=new Motion(); SE.motion.calibrate(c.H);
    $('btnTour').disabled=false; caption(); return;
  }
  if(SE.show){SE.show=false;return;}   // the pulse shown again on step 1: nothing measured
  SE.amp=noisyAmp(c.H); SE.motion.push(SE.amp);
  // the strip shows what the judgement uses: each measurement minus its own mean (the AGC jump goes),
  // then minus the mean of the last 20 (a person standing still leaves no colour, only movement does)
  const db=SE.amp.map(a=>20*Math.log10(Math.max(a,1e-12))), m0=db.reduce((x,y)=>x+y,0)/52, hn=db.map(v=>v-m0);
  SE.hn.push(hn); if(SE.hn.length>MOTION.win) SE.hn.shift();
  SE.hist.push(hn.map((v,k)=>v-SE.hn.reduce((x,h)=>x+h[k],0)/SE.hn.length)); if(SE.hist.length>240) SE.hist.shift();
  const t=performance.now(); if(SE.lastDone){const r=1000/(t-SE.lastDone);SE.rate=SE.rate?SE.rate+(r-SE.rate)*.15:r;} SE.lastDone=t;
  SE.count++; texts();
  if(SE.quiz&&!SE.quiz.answered&&SE.count-SE.quiz.from<=MOTION.win){caption();buttons();}
}
function measureOnce(){   // one whole measurement now (debug and hidden tabs)
  if(!SE.run) startMeasure();
  while(!SE.run.advance(1e9));
  finishMeasure();
}
function senseFrame(now){
  // step 1 measures nothing after the pulse: the empty room does not change
  const measuring=SE.tour>=1||SE.quiz;
  if(SE.show&&SE.run){
    SE.run.advance(SE.run.n<SHOW_SLOW?SHOW_CHUNK:1024)&&finishMeasure();
  } else if(!SE.paused&&measuring&&SE.base){
    if(!SE.run) startMeasure();
    const t=performance.now(), done=SE.run.advance(SE.chunk), el=performance.now()-t;
    // keep each frame's share of GPU work near 10 ms, so the page stays smooth on slow phones too
    if(el>14) SE.chunk=Math.max(256,Math.round(SE.chunk*.8)); else if(el<7) SE.chunk=Math.min(4096,Math.round(SE.chunk*1.25));
    if(done) finishMeasure();
  }
  if(SE.show) display(ssim,[sCell(SROOM.router[0]),sCell(SROOM.router[1])]);
  else sDisplay(SE.view==='diff'&&SE.tour>=1?1:0, reduceMotion?0:-now/1000*Math.PI, Math.min(1,(performance.now()-SE.mapAt)/700+(SE.tour>=1?1:0)));
  drawSense(now); drawCsi(); placeTour();
}
let tourPos='';
function placeTour(){   // keep つぎへ in the map's top right corner, clear of the receiver (the frame can be larger than the map)
  const fr=$('frame').getBoundingClientRect(), cr=cv.getBoundingClientRect(), k=`${fr.right-cr.right|0},${cr.top-fr.top|0},${cr.width|0},${cr.height|0}`;
  if(k===tourPos) return; tourPos=k;
  const b=$('btnTour').style; b.right=(fr.right-cr.right+6)+'px'; b.top=(cr.top-fr.top+6)+'px'; b.bottom='auto';
  const qa=$('quizAns').style; qa.left=(cr.left-fr.left+cr.width/2)+'px'; qa.top=(cr.bottom-fr.top-(W*scale<560?44:54))+'px';
}

// ---------- texts under the bars ----------
function texts(){
  const m=SE.motion, show=(SE.tour>=4||SE.quiz)&&!hidden()&&SE.hist.length>=MOTION.win;
  $('senseMotion').innerHTML=show?L(`動き: <b style="color:${m.moving?'var(--accent)':'var(--muted)'}">${m.moving?'あり':'なし'}</b>　ゆれ ×${m.ratio.toFixed(1)}（${MOTION.k}倍で「あり」）`,
    `Movement: <b style="color:${m.moving?'var(--accent)':'var(--muted)'}">${m.moving?'yes':'no'}</b>　wobble ×${m.ratio.toFixed(1)} (“yes” above ×${MOTION.k})`):'';
  const slow=SE.rate>0?Math.max(1,Math.round(REAL_RATE/SE.rate)):0;
  const walking=SE.person&&SE.target&&Math.hypot(SE.target[0]-SE.person[0],SE.target[1]-SE.person[1])>.03;
  if(SE.tour<1&&!SE.quiz){$('senseCount').textContent='';return;}
  $('senseCount').textContent=L(`測定 ${SE.count}回`,`${SE.count} measurements`)+(slow&&walking&&!hidden()?L(`・人の歩きは本物の約1/${slow}`,` · walking about 1/${slow} of real speed`):'')+(SE.paused?L('・一時停止中',' · paused'):'');
}

// ---------- the map overlay ----------
function label(c,t,x,y,fs,col){const w=c.measureText(t).width+8;c.fillStyle='rgba(8,14,28,.7)';c.fillRect(x-w/2,y-fs*.75,w,fs*1.5);c.fillStyle=col;c.fillText(t,x,y);}
function drawSense(now){
  const c=octx;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,ov.width,ov.height);c.setTransform(dpr,0,0,dpr,0,0);
  const P=([x,y])=>[sPx(x),sPx(y)], small=W*scale<560, fs=small?10:12, q=SE.quiz;
  c.textAlign='center';c.textBaseline='middle';
  if(hidden()){
    c.fillStyle='#060b16';c.fillRect(0,0,W*scale,H*scale);
    c.font=`500 ${small?11:14}px 'Zen Kaku Gothic New',sans-serif`;c.fillStyle='rgba(225,235,255,.8)';
    if(bigStrip()){
      // what the receiver has, drawn where the map was (the answer buttons sit under it, #quizAns)
      c.textAlign='left';c.fillText(L('受信機に見えるのは、このゆれだけ','All the receiver gets is this wobble'),small?10:24,small?16:24);   // left: ✕ is in the right corner
      const mx=small?10:24, top=small?28:44, bot=small?50:64;
      drawStrip(c,mx,top,W*scale-2*mx,H*scale-top-bot,(W*scale-2*mx)/40);
      return;
    } else {
      c.strokeStyle='rgba(170,200,255,.35)';c.lineWidth=1.5;c.setLineDash([5,5]);
      const [a,b]=P([.45,.45]),[e,f]=P([5.55,3.3]);c.strokeRect(a,b,e-a,f-b);c.setLineDash([]);
      c.fillText(L('受信機には部屋の中は見えません','The receiver cannot see inside the room'),W*scale/2,H*scale*.45);
      c.font=`500 ${fs}px 'Zen Kaku Gothic New',sans-serif`;c.fillStyle='rgba(225,235,255,.6)';
      c.fillText(L('人はどこ？ タップして答えよう','Where is the person? Tap to answer'),W*scale/2,H*scale*.45+(small?18:24));
    }
  } else {
    c.font=`500 ${fs}px 'Zen Kaku Gothic New',sans-serif`;
    for(const [t,x,y] of [[L('窓','Window'),3.0,.62],[L('ドア','Door'),5.3,1.18]]){const [sx,sy]=P([x,y]);label(c,t,sx,sy,fs,'rgba(225,235,255,.8)');}
    // the pulse: how long since it left the router
    if(SE.show&&SE.run){c.font=`500 ${fs}px 'IBM Plex Mono',monospace`;
      const ns=SE.run.n*DT*1e9;label(c,L(`電波が出てから ${ns.toFixed(1)} ナノ秒（光は ${(ns*.2998).toFixed(1)} m 進む）`,`${ns.toFixed(1)} ns since it left (light goes ${(ns*.2998).toFixed(1)} m)`),W*scale/2,H*scale-(small?10:14),fs,'rgba(225,235,255,.9)');}
    else if(SE.tour===0&&SE.base){c.font=`500 ${fs}px 'Zen Kaku Gothic New',sans-serif`;label(c,L('タップでもう一度','Tap to send it again'),W*scale/2,H*scale-(small?10:14),fs,'rgba(225,235,255,.75)');}
    // what the colours mean
    if(!SE.show&&SE.tour>=1&&SE.view==='diff'){
      c.font=`700 ${fs}px 'Zen Kaku Gothic New',sans-serif`;c.textAlign='left';
      // on the bottom row, right of the 1 m bar (the phone map leaves out 「誰もいないときと比べて」: the caption says it)
      const t1=L('■ 強くなった','■ stronger'), t2=L('■ 弱くなった','■ weaker'), t0=small?'':L('誰もいないときと比べて','compared with the empty room');
      const x=14+sPx(1)+44, y=H*scale-17;
      c.fillStyle='rgba(8,14,28,.75)';c.fillRect(x-4,y-fs*.8,c.measureText(t1+t2+t0).width+28,fs*1.6);
      c.fillStyle='#ffb347';c.fillText(t1,x,y);let w=c.measureText(t1).width+10;
      c.fillStyle='#b48cff';c.fillText(t2,x+w,y);w+=c.measureText(t2).width+10;
      c.font=`500 ${fs}px 'Zen Kaku Gothic New',sans-serif`;c.fillStyle='rgba(225,235,255,.8)';c.fillText(t0,x+w,y);c.textAlign='center';
    }
    // where the person is heading
    if(SE.person&&SE.target&&!q&&Math.hypot(SE.target[0]-SE.person[0],SE.target[1]-SE.person[1])>.03){
      const [tx,ty]=P(SE.target),[px,py]=P(SE.person);
      c.strokeStyle='rgba(255,201,90,.7)';c.lineWidth=1.5;c.setLineDash([4,4]);c.beginPath();c.moveTo(px,py);c.lineTo(tx,ty);c.stroke();
      c.beginPath();c.arc(tx,ty,small?6:9,0,7);c.stroke();c.setLineDash([]);
    }
    if(SE.person){const [px,py]=P(SE.person);c.font=`700 ${fs}px 'Zen Kaku Gothic New',sans-serif`;label(c,L('人','Person'),px,py-sPx(.23)-fs*.9,fs,'#9cc4ff');}
    if(q&&q.kind==='where'&&SE.guess){
      const [gx,gy]=P(SE.guess),[px,py]=P(SE.answerPos), d=Math.hypot(SE.guess[0]-SE.answerPos[0],SE.guess[1]-SE.answerPos[1]);
      c.strokeStyle='#fff';c.lineWidth=1.5;c.setLineDash([3,4]);c.beginPath();c.moveTo(gx,gy);c.lineTo(px,py);c.stroke();c.setLineDash([]);
      c.font=`700 ${fs}px 'IBM Plex Mono',monospace`;label(c,`${d.toFixed(1)} m`,(gx+px)/2,(gy+py)/2,fs,'#fff');
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
  {const [qx,qy]=P(SROOM.rx), k=small?.75:1;
    c.fillStyle='#0b1322';c.strokeStyle='#e8eefb';c.lineWidth=2*k;c.beginPath();c.roundRect(qx-9*k,qy-6*k,18*k,12*k,2*k);c.fill();c.stroke();
    c.strokeStyle='#e8eefb';c.lineWidth=1.5*k;c.beginPath();c.moveTo(qx+5*k,qy-6*k);c.lineTo(qx+5*k,qy-13*k);c.stroke();
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
  const W2=r.width, wf=SE.tour>=4||!!SE.quiz, hb=wf?Math.round(r.height*.48):r.height, pad=6, top=15, bot=12;
  c.font=`500 10px 'Zen Kaku Gothic New',sans-serif`;c.textBaseline='middle';c.textAlign='left';c.fillStyle='rgba(200,215,240,.75)';
  if(SE.tour<3&&!SE.quiz) return;
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
  if(bigStrip()){c.textAlign='left';c.fillStyle='rgba(200,215,240,.75)';c.fillText(L('ゆれの帯は、上の地図の場所に大きく出しています','The wobble strip is shown large in place of the map above'),pad,hb+14);return;}
  drawStrip(c,pad,hb,W2-2*pad,r.height-hb-2,Math.max(2,Math.min(4,(W2-2*pad)/120)));
}
const bigStrip=()=>hidden()&&SE.quiz.kind!=='where';
// the wobble strip: one column per measurement, newest on the right; colour = this shape minus the mean of the last 20
function drawStrip(c,x0,y0,w,h,cw){
  const t0=y0+16, th=h-16, ncol=Math.floor(w/cw), rh=th/52, fs=w<300?9:10;
  c.font=`500 ${fs}px 'Zen Kaku Gothic New',sans-serif`;c.textBaseline='middle';
  c.fillStyle='rgba(200,215,240,.75)';c.textAlign='left';
  c.fillText(w<510?L('棒の形のゆれ（よこ: 時間 →）','Wobble of the bar shape (time →)'):L('棒の形のゆれ（直前20回の平均との差。よこ: 時間 →、たて: 周波数）','Wobble of the bar shape (vs. the mean of the last 20; across: time →, down: frequency)'),x0,y0+8);
  c.textAlign='right';c.fillStyle='#ffb347';c.fillText(L('強い','up'),x0+w-28,y0+8);c.fillStyle='#b48cff';c.fillText(L('弱い','down'),x0+w,y0+8);
  c.fillStyle='rgba(8,16,31,.9)';c.fillRect(x0,t0,w,th);
  const hs=SE.hist.slice(-ncol);
  hs.forEach((col,i)=>{const x=x0+w-(hs.length-i)*cw;
    for(let k=0;k<52;k++){const v=Math.max(-1,Math.min(1,col[k]/3));
      c.fillStyle=v>=0?`rgba(255,179,71,${.06+.94*v})`:`rgba(180,140,255,${.06-.94*v})`;c.fillRect(x,t0+k*rh,cw+.5,rh+.5);}});
}

// ---------- pointer (from ui.js) ----------
function senseDown(e){
  const p=toCell(e), m=[meters(p[0]),meters(p[1])];
  if(!isFinite(m[0])||!isFinite(m[1])) return;   // the map had no size yet
  try{ov.setPointerCapture(e.pointerId);}catch(_){}
  const q=SE.quiz;
  if(q&&q.kind==='where'&&!q.answered){
    if(!quizReady()) return;   // the bars first, then the guess
    // the person stops where they were, so the line, the number and the map all agree
    SE.guess=m; SE.answerPos=SE.person.slice(); SE.target=null; q.answered=true; caption(); buttons(); texts(); revealScroll();
    return;
  }
  if(!q&&SE.tour===0&&SE.base&&!SE.show){showPulse();return;}
  if(q||SE.tour<1||!SE.person||SE.leaving) return;
  SE.target=clampRoom(m); SE.dragging=true;
}
function senseMove(e){ if(!SE.dragging) return; const p=toCell(e); SE.target=clampRoom([meters(p[0]),meters(p[1])]); }
function senseUp(){ SE.dragging=false; }

window.__ww.senseUI={SE,setTour,measureOnce,drawCsi,drawSense,texts,quizStart,quizAnswer,quizNext,quizEnd};
