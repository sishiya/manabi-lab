'use strict';
/* ---------- あなた（素材）と体の状態 ---------- */
const COMP={water:[L('水分','Water'),'#7fb8e0'],protein:[L('タンパク質','Protein'),'#e07a6a'],fat:[L('脂質','Fat'),'#f2d27a'],carb:[L('炭水化物','Carbohydrate'),'#efe6cf'],fiber:[L('食物繊維','Fiber'),'#8fbf6a'],
  bacteria:[L('腸内細菌','Gut bacteria'),'#a98bd6'],bile:[L('胆汁成分','Bile'),'#c9b23a'],ash:[L('ミネラル','Minerals'),'#cfc6b8'],metal:[L('ステンレス','Stainless steel'),'#b7bec7'],device:[L('機械','Device'),'#8d97a3'],
  ethanol:[L('アルコール','Alcohol'),'#d9a6e8'],toxin:[L('毒素','Toxin'),'#ff5e57']};
const MATS={
 capsule:{n:'カプセル内視鏡',d:'長さ約26mm・約3g（小腸用の例）。消化されない。気道も探検できる（咳は起きない設定）。',comp:{device:3},size:26,color:[.86,.89,.92],dig:false,entries:['mouth','nose','anus']},
 meat:{n:'牛肉',d:'ひと口20g（もも・赤身）。タンパク質と脂質。胃酸で灰褐色に変わる。',comp:{water:14.3,protein:4.4,fat:1,ash:.2},size:20,color:[.66,.17,.17],dig:true,rate:1/170,acidC:[.6,.5,.42],entries:['mouth']},
 rice:{n:'ごはん',d:'ひと口20g。主にでんぷん。唾液で分解が始まり、胃を早く出る。',comp:{water:12,protein:.5,fat:.06,carb:7.1,fiber:.3,ash:.02},size:12,color:[.95,.94,.9],dig:true,rate:1/100,acidC:[.86,.83,.72],entries:['mouth']},
 veg:{n:'キャベツ',d:'ひと口20g。ほとんど水と食物繊維。緑は胃酸で黄緑〜オリーブ色に。',comp:{water:18.5,protein:.26,fat:.04,carb:.7,fiber:.36,ash:.1},size:25,color:[.55,.78,.38],dig:true,rate:1/120,acidC:[.55,.56,.27],entries:['mouth']},
 metal:{n:'ステンレス球',d:'直径8mm・2.1g。溶けず吸収もされない。胃を出るには空腹期の強い収縮が必要。実際に飲み込むのは危険（まねしない）。磁石は2個以上だと腸の壁をはさんで穴があくことがある。飲み込んだら医療機関へ。',comp:{metal:2.1},size:8,color:[.74,.76,.8],dig:false},
 sake4:{n:'日本酒 4合',d:'720mL・アルコール約88g。液体なのですぐ胃を出て、小腸で一気に吸収される。一気に飲むと急性アルコール中毒の危険。お尻から入れると命にかかわる（死亡例あり）。20歳未満の飲酒は法律で禁止。',comp:{water:593,ethanol:88,carb:35},size:0,liquid:true,color:[.93,.9,.78],dig:true,rate:1/20,acidC:[.9,.86,.7]},
 battery:{n:'ボタン電池',d:'リチウム電池CR2032（直径20mm）。食道に引っかかると約2時間で粘膜が深く傷つく。飲み込んだかもしれないときは、すぐ医療機関へ。',comp:{device:2.9},size:20,color:[.8,.82,.86],dig:false,battery:true},
 mushroom:{n:'ツキヨタケ',d:'シイタケと間違えやすい毒きのこ（20g）。食べて30分〜1時間で嘔吐、その後に下痢。野生のきのこは自分で判断して食べないこと。',comp:{water:18,protein:.6,carb:1,fiber:.4,toxin:.01},size:22,color:[.72,.6,.42],dig:true,rate:1/90,acidC:[.62,.55,.4],toxic:true}
};
// 英語（I18N.md）: 名前と説明を上書き。素材を足したらここにも足す
if(LANG==='en')Object.entries({
  capsule:['Capsule endoscope','About 26 mm long and 3 g (an example made for the small intestine). It is not digested. It can explore the airway too (no coughing in this app).'],
  meat:['Beef','One 20 g bite (round, lean). Protein and fat. Stomach acid turns it grayish brown.'],
  rice:['Rice','One 20 g bite. Mostly starch. Saliva starts breaking it down, and it leaves the stomach quickly.'],
  veg:['Cabbage','One 20 g bite. Almost all water and fiber. Stomach acid turns the green to yellow-green or olive.'],
  metal:['Stainless steel ball','8 mm across, 2.1 g. It doesn’t dissolve and isn’t absorbed. To leave the stomach it needs a strong fasting contraction. Really swallowing one is dangerous (never try it). Two or more magnets can pinch the gut wall between them and make a hole. If someone swallows one, get medical help.'],
  sake4:['Sake, 4 gō','720 mL, about 88 g of alcohol. Being a liquid, it leaves the stomach quickly and is absorbed all at once in the small intestine. Drinking it all at once risks acute alcohol poisoning. Putting it in through the anus can kill (people have died). Drinking under age 20 is against the law in Japan.'],
  battery:['Button battery','A CR2032 lithium battery (20 mm across). If it gets stuck in the esophagus, it damages the lining deeply in about 2 hours. If someone might have swallowed one, get medical help right away.'],
  mushroom:['Tsukiyotake mushroom','A poisonous mushroom easily mistaken for shiitake (20 g). Vomiting starts 30 minutes to 1 hour after eating, then diarrhea. Never decide for yourself that a wild mushroom is safe to eat.'],
}).forEach(([k,[n,d]])=>{MATS[k].n=n;MATS[k].d=d;});
const VD=42,ELIM=6.5; // 体重60kg・分布容積42L、分解速度6.5g/時
const bacOf=g=>g/VD/10;
const STAGES=LANG==='en'?[[.02,'sober',0],[.05,'pleasantly buzzed',0],[.11,'tipsy',0],[.16,'early drunkenness',1],[.31,'drunk',2],[.41,'very drunk',3],[9,'coma (life-threatening)',3]]
  :[[.02,'しらふ',0],[.05,'爽快期',0],[.11,'ほろ酔い期',0],[.16,'酩酊初期',1],[.31,'酩酊期',2],[.41,'泥酔期',3],[9,'昏睡期（命の危険）',3]];
const stageOf=b=>STAGES.find(s=>b<s[0]);
const ENTRIES=LANG==='en'?{mouth:['Mouth','The longest journey. You can go all the way through the digestive tract'],nose:['Nose','Into the airway. At the pharynx you can also go toward the esophagus'],anus:['Anus','Go up the large intestine. Food is not digested; only fermentation and water absorption happen (actually putting objects in is dangerous)']}
  :{mouth:['口','いちばん長い旅。消化管を最後まで行ける'],nose:['鼻','気道へ。咽頭で食道側にも行ける'],anus:['肛門','大腸をさかのぼる。食べ物は消化されず、発酵と水分吸収だけが起きる（実際に異物を入れるのは危険）']};
const BELLY=LANG==='en'?{hungry:['Empty stomach','The stomach is shrunk, and strong contractions (fasting contractions) come every 90–120 minutes (every 100 minutes in this app)'],full:['Full (after a meal)','About 800 mL of food in the stomach (rough guide). The folds stretch and after-meal movements continue']}
  :{hungry:['空腹','胃はしぼみ、90〜120分ごとに強い収縮（空腹期収縮）が来る（このアプリでは100分）'],full:['満腹（食後）','胃に約800mLの食事（目安）。ひだが伸び、食後の動きが続く']};
const BRISTOL=LANG==='en'?['','separate hard lumps','lumpy sausage','sausage with cracks','smooth, soft sausage (ideal)','soft blobs','mushy','watery']
  :['','硬いコロコロ便','硬めのソーセージ状','ひびのあるソーセージ状','なめらかなバナナ状（理想的）','やわらかい半固形','泥状','水様'];

const SIM={massT:0,blood:0,bacPeak:0,hist:[],histT:0,vomit:false,vomitT:0,on:false,bodyT:0,ff:1,content:50,mmc:0,phase:1,lastPhase:1,swallowT:99,carry:false,cool:0,icvHold:0,icvPush:0,analHold:0,hintT:0,coughT:0,urgeShown:false};
let P=null;
const mass=()=>{let m=0;for(const k in P.comp)m+=P.comp[k];return m;};
const waterFrac=()=>{const m=mass();return m>0?(P.comp.water||0)/m:0;};
function waterToward(target,k,onlyDown){
  const m=mass(),w=P.comp.water||0,dry=m-w;if(dry<=0)return;
  const want=target*dry/(1-target);if(onlyDown&&want>w)return;
  const nw=w+(want-w)*Math.min(1,k);
  if(nw<w)P.absorbed.water+=w-nw;P.comp.water=Math.max(0,nw);
}
function absorb(key,k){const v=P.comp[key]||0;if(!v)return;const a=v*Math.min(1,k);P.comp[key]=v-a;P.absorbed[key]=(P.absorbed[key]||0)+a;}
function bristol(){const w=waterFrac();return w>=.9?7:w>=.85?6:w>=.8?5:w>=.74?4:w>=.7?3:w>=.65?2:1;}
function stoolReady(){
  if(P.entry==='anus')return P.tColon>=20;          // 直腸が伸びればすぐ便意
  return !!P.massDone;                              // 大蠕動で直腸に送られたら便意
}
function baseReady(){
  if(P.diarrhea)return P.tColon>=90;
  if(P.mat.liquid)return P.tColon>=240;
  return P.tColon>=720&&(!P.mat.dig||waterFrac()<=.8);
}
const fed=()=>SIM.content>60;
function absorbEthanol(zone,dt){
  const v=P.comp.ethanol||0;if(!v)return;
  const T={stomach:[fed()?90:45,fed()?.7:.85],duo:[6,fed()?.8:.85],sb:[6,fed()?.8:.85],colon:[20,.85],rectum:[12,.97]}[zone];
  if(!T)return;
  const a=v*Math.min(1,dt/T[0]);P.comp.ethanol=v-a;P.absorbed.ethanol=(P.absorbed.ethanol||0)+a;
  SIM.blood+=a*T[1]; // 残りは肝臓の初回通過で分解される（直腸の下部は肝臓を通らない）
}

function simStep(dt,zone){ // dt: 体内時間（分）
  SIM.bodyT+=dt;
  if(SIM.content>50)SIM.content=Math.max(50,SIM.content-3.2*dt);
  const fasting=SIM.content<=60;
  if(fasting){SIM.mmc+=dt;const m=SIM.mmc%100;SIM.phase=m<45?1:m<90?2:3;}else{SIM.mmc=0;SIM.phase=0;}
  if(SIM.phase===3&&SIM.lastPhase!==3&&SIM.on)toast(L('グーッ…おなかが鳴った。空腹期の強い収縮（MMC 第3相）が胃から小腸へ進む','Grrr… your stomach growled. A strong fasting contraction (MMC phase III) is moving from the stomach to the small intestine'));
  SIM.lastPhase=SIM.phase;
  SIM.blood=Math.max(0,SIM.blood-ELIM/60*dt);
  const bac=bacOf(SIM.blood);SIM.bacPeak=Math.max(SIM.bacPeak,bac);
  SIM.histT+=dt;if(SIM.histT>=2){SIM.histT=0;SIM.hist.push(bac);if(SIM.hist.length>400)SIM.hist.shift();}
  if(!P)return;
  const m=P.mat,food=m.dig;
  absorbEthanol(zone,dt);
  if(m.battery){const r={eso:P.stuck?1/120:0,stomach:1/2500,duo:1/3000,sb:1/3000,colon:1/5000,rectum:1/3000}[zone]||0;P.burn=Math.min(1,P.burn+dt*r);}
  if(m.toxic&&P.entry!=='anus'){
    if(zone==='stomach'&&!P.vomited&&P.tStom>=40&&!SIM.vomit){SIM.vomit=true;SIM.vomitT=0;setControl('free');toast(L('うっ…ツキヨタケの毒（イルジンS）で嘔吐が始まった。胃と食道が逆向きに動き、口のほうへ押し戻される','Ugh… the poison of the tsukiyotake mushroom (illudin S) has started vomiting. The stomach and esophagus move backward and push you toward the mouth'));}
    if((zone==='duo'||zone==='sb')&&P.comp.toxin){absorb('toxin',dt/30);if(!P.diarrhea&&P.absorbed.toxin>.003){P.diarrhea=true;toast(L('毒が吸収されて腸が荒れた。大腸で水分が吸収されず、下痢になる','The poison was absorbed and upset the intestines. The large intestine can’t absorb water, so it becomes diarrhea'));}}
  }
  if(zone==='mouth'&&food&&!m.liquid){P.tMouth+=dt;P.size=Math.max(2.5,P.size*Math.exp(-dt*6));const add=Math.min(4-P.saliva,6*dt);if(add>0){P.comp.water+=add;P.saliva+=add;}}
  if(zone==='stomach'){P.tStom+=dt;if(food){
    P.acid=Math.min(1,P.acid+dt/40);
    P.prog=Math.min(1,P.prog+m.rate*(m.liquid&&fed()?.4:1)*dt/(1+Math.max(0,P.size-3)/6));
    P.size=Math.max(.5,P.size*Math.exp(-dt/60));
    waterToward(.85,dt*.03);
    absorb('protein',dt*.0008);
  }}
  if(zone==='duo'||zone==='sb'){P.tSB+=dt;P.bile=Math.min(1,P.bile+dt/(food?12:30));
    if(food){
      if(zone==='duo'){if((P.comp.bile||0)<.6)P.comp.bile=(P.comp.bile||0)+.04*dt;}
      else absorb('bile',dt/90); // 胆汁酸の大半は回腸で再吸収される（腸肝循環）
      const k=zone==='sb'?1:.3;
      absorb('protein',dt/50*k);absorb('fat',dt/55*k);absorb('carb',dt/40*k);absorb('ash',dt/200*k);
      waterToward(.88,dt*.02);
    }else P.coat=Math.min(1,P.coat+dt/150);
  }
  if(zone==='colon'||zone==='rectum'){P.tColon+=dt;P.sterco=Math.min(1,P.sterco+dt/600);
    if(food){
      const dry=mass()-(P.comp.water||0)-(P.comp.bacteria||0),want=.8*dry;
      P.comp.bacteria=(P.comp.bacteria||0)+Math.max(0,want-(P.comp.bacteria||0))*Math.min(1,dt/300);
      // 大腸に消化酵素はほぼない。細菌の発酵で糖と繊維が分解され、ガスと短鎖脂肪酸（吸収される）になる
      const fc=(P.comp.carb||0)*Math.min(1,dt/240),ff=(P.comp.fiber||0)*Math.min(1,dt/2000),fp=(P.comp.protein||0)*Math.min(1,dt/1500);
      P.comp.carb=(P.comp.carb||0)-fc;P.comp.fiber=(P.comp.fiber||0)-ff;P.comp.protein=(P.comp.protein||0)-fp;
      P.gas+=(fc+ff)*100+fp*30;P.fermented=(P.fermented||0)+fc+ff+fp;
      if(P.diarrhea)waterToward(.93,dt/100);else waterToward(.72,dt/400,true);
    }else P.coat=Math.min(1,P.coat+dt/200);
  }
}
function colorOf(){
  const m=P.mat;let c=m.color.slice();
  if(m.dig){
    c=mixc(c,m.acidC,P.acid*.8);
    c=mixc(c,[.82,.68,.2],P.bile*.75);
    c=mixc(c,[.55,.56,.2],P.bile*Math.min(1,P.tSB/150)*.3);
    c=mixc(c,[.42,.26,.12],P.sterco*(P.tSB>0?1:.45)); // 肛門から入ったものは、もとからある便と混ざって色づく程度
    const wf=waterFrac();c=c.map(v=>v*(.78+.3*wf));
  }
  return c;
}
const coatColor=()=>mixc([.82,.68,.2],[.42,.26,.12],P.sterco);
function formOf(){
  const m=P.mat;
  if(m.battery)return P.stuck?L(`食道に引っかかっている · 粘膜損傷 ${Math.round(P.burn*100)}%`,`stuck in the esophagus · lining damage ${Math.round(P.burn*100)}%`):P.burn>.03?L(`まわりの粘膜を傷つけた（損傷 ${Math.round(P.burn*100)}%）`,`damaged the lining around it (${Math.round(P.burn*100)}%)`):L('変化なし','no change');
  if(!m.dig)return P.coat>.15?L('表面に内容物が付着','coated with gut contents'):L('変化なし','no change');
  if(P.tColon>0&&P.tSB===0&&!m.liquid)return P.fermented>.05?L('細菌に発酵されている（消化はされない）','being fermented by bacteria (not digested)'):L('ほぼそのまま','almost unchanged');
  if(P.tColon>0){const t=bristol();return L(`ブリストル${t}型 · ${BRISTOL[t]}`,`Bristol type ${t} · ${BRISTOL[t]}`);}
  if(m.liquid)return P.tSB>0?L('腸液と混ざった液体','liquid mixed with intestinal juice'):P.tStom>0?L('胃液と混ざった液体','liquid mixed with stomach juice'):L('液体','liquid');
  if(P.tSB>0)return L('液状の糜粥（びじゅく）','liquid chyme');
  if(P.tStom>0)return P.prog>=1?L('かゆ状（糜粥）· 幽門を通れる','porridge-like (chyme) · can pass the pylorus'):L(`胃でほぐれ中 ${Math.round(P.prog*100)}%`,`breaking down in the stomach ${Math.round(P.prog*100)}%`);
  if(P.size>5)return L(`かたまり（約${Math.round(P.size)}mm）`,`lump (about ${Math.round(P.size)} mm)`);
  return L('食塊（かみ砕かれた）','chewed food (bolus)');
}
function paintSwatch(el,big){
  const m=P.mat,k=big?2:1,c=colorOf(),s=(x)=>Math.round(x*k)+'px';
  let w,h,br;
  if(P.mat===MATS.capsule){w=50;h=22;br='11px';}
  else if(P.mat===MATS.metal){w=h=26;br='50%';}
  else{
    const sz=clamp(Math.cbrt(mass())*16,14,50);
    if(m.liquid&&P.tColon===0){w=sz*1.4;h=sz*.28;br='50%';}
    else if(P.tColon>0){const t=bristol();
      if(t<=2){w=sz*.7;h=sz*.6;br='45% 55% 50% 50%';}else if(t<=5){w=sz*1.3;h=sz*.5;br='40%/50%';}else{w=sz*1.3;h=sz*.3;br='50%';}}
    else if(P.tSB>0){w=sz*1.3;h=sz*.35;br='50%';}
    else if(P.tStom>0){w=sz*(1+P.prog*.3);h=sz*(1-P.prog*.5);br='48% 52% 46% 54% / 55% 50% 50% 45%';}
    else if(P.size>5){w=sz;h=sz*.8;br='38% 62% 55% 45% / 45% 40% 60% 55%';}
    else{w=sz*.9;h=sz*.8;br='50%';}
  }
  el.style.width=s(w);el.style.height=s(h);el.style.borderRadius=br;
  let bg=`radial-gradient(circle at 32% 28%, rgba(255,255,255,.55), transparent 42%), ${css(c)}`;
  if(!m.dig&&P.coat>0)bg=`radial-gradient(circle at 32% 28%, rgba(255,255,255,.55), transparent 42%), linear-gradient(${css(c)}, ${css(c)})`;
  el.style.background=bg;
  el.style.outline=!m.dig&&P.coat>.05?`${Math.round(P.coat*4*k)}px solid ${css(coatColor())}`:'none';
}

