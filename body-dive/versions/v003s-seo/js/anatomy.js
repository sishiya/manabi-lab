'use strict';
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const lin=c=>c.map(v=>Math.pow(v,2.2));
const mixc=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const css=c=>`rgb(${c.map(v=>Math.round(clamp(v,0,1)*255)).join(',')})`;
const $=id=>document.getElementById(id);
const reduceMotion=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtT=m=>{m=Math.floor(m);const h=Math.floor(m/60);return h?L(`${h}時間${m%60}分`,`${h} h ${m%60} min`):L(`${m}分`,`${m} min`);};

/* ---------- 部位 ---------- */
const AIR=L('気道','Airway'), GUT=L('消化管','Digestive tract');
const REG={
 nose:{n:'鼻腔',en:'Cavitas nasi',sys:AIR,c:[.86,.46,.47],fold:'turb',cf:.62,z:'air',d:'吸った空気をあたため、湿らせる部屋。左右の壁から3段のひだ（鼻甲介）が張り出し、粘液がほこりや細菌をとらえる。'},
 mouth:{n:'口腔',en:'Cavitas oris',sys:GUT,c:[.84,.38,.40],fold:'mouth',cf:.6,z:'mouth',d:'歯で食べ物をかみ砕き、唾液と混ぜる。唾液は1日に1〜1.5Lほど出る。口にいる間は「かむ」ことになり、食べ物は細かくなる。'},
 pharynx:{n:'咽頭',en:'Pharynx',sys:L('気道・消化管の共通路','Shared path of airway and digestive tract'),c:[.80,.40,.42],fold:'none',cf:.76,z:'pharynx',d:'空気と食べ物の交差点。下の前側が喉頭（空気）、後ろ側が食道（食べ物）。食道の入口に近づくと飲み込みの反射が起き、声門が閉じて気道を守る。'},
 larynx:{n:'喉頭',en:'Larynx',sys:AIR,c:[.86,.52,.52],fold:'none',cf:.72,z:'air',d:'気管の入口。飲み込むときは喉頭蓋が倒れてフタになり、食べ物が入ると咳で押し戻される。'},
 vocal:{n:'声帯',en:'Plicae vocales',sys:AIR,c:[.94,.80,.76],fold:'vocal',cf:.36,z:'air',d:'左右から張り出すひだ。吐く息で振動して声になる。飲み込むときはぴったり閉じる。'},
 trachea:{n:'気管',en:'Trachea',sys:AIR,c:[.90,.64,.62],fold:'rings',cf:.74,z:'air',d:'長さ約10〜12cm、内径約1.5〜2cm。U字形の軟骨の輪が16〜20個並び、管がつぶれないよう支える。背中側だけは軟骨がなく、食道と接している。'},
 bronchus:{n:'主気管支',en:'Bronchus principalis',sys:AIR,c:[.90,.62,.62],fold:'brings',cf:.72,z:'air',d:'気管は左右に分かれる。右は左より少し太く、傾きが急なので、誤って吸い込んだものは右に入りやすい。'},
 lobar:{n:'葉気管支',en:'Bronchus lobaris',sys:AIR,c:[.90,.60,.62],fold:'lrings',cf:.7,z:'air',d:'右肺は3つ、左肺は2つの葉に分かれる。この先も細かな枝分かれをくり返し、平均で約5億個（人によって3億〜8億個）の肺胞に行き着く。'},
 esophagus:{n:'食道',en:'Oesophagus',sys:GUT,c:[.86,.52,.50],fold:'long',cf:.66,z:'eso',d:'長さ約25cm。ふだんは平たくつぶれている。飲み込むと筋肉の波（蠕動）が4〜8秒ほどで胃まで運ぶ。'},
 stomach:{n:'胃',en:'Gaster',sys:GUT,c:[.76,.32,.34],fold:'rugae',cf:.72,z:'stomach',d:'空腹時はにぎりこぶしほどにしぼんでひだが目立ち、食後は大きく広がってひだが伸びる（2〜3L以上入る）。胃液は強い酸性（pH1.5〜3.5）。出口の幽門は、液体と細かくなったもの（かゆ状）だけを少しずつ通す。'},
 duodenum:{n:'十二指腸',en:'Duodenum',sys:GUT,c:[.86,.62,.40],fold:'plicae',cf:.62,vil:.8,z:'duo',d:'長さ約25〜30cm。胆汁と膵液が流れ込み、黄色く染まる。膵液のアルカリで胃酸が中和され、消化酵素が本格的に働き始める。'},
 jejunum:{n:'空腸',en:'Jejunum',sys:GUT,c:[.84,.46,.44],fold:'plicae',cf:.62,vil:1,z:'sb',d:'小腸の前半。輪状ひだと絨毛が表面積を広げ、分解された栄養（アミノ酸・糖・脂肪酸）を吸収する。'},
 ileum:{n:'回腸',en:'Ileum',sys:GUT,c:[.82,.50,.47],fold:'plicae2',cf:.66,vil:.8,z:'sb',d:'小腸の後半。ビタミンB12や胆汁酸を吸収する。出口の回盲弁は、大腸からの逆流を防ぐ。'},
 cecum:{n:'盲腸',en:'Caecum',sys:GUT,c:[.80,.58,.52],fold:'haustra',cf:.66,z:'colon',d:'大腸の始まりの袋。回腸が横から合流する。本物はこの下端から虫垂がのびている。'},
 ascending:{n:'上行結腸',en:'Colon ascendens',sys:GUT,c:[.80,.58,.52],fold:'haustra',cf:.66,z:'colon',d:'右の腹を上る。腸内細菌が食物繊維を発酵させ、水分が吸収されていく。3本の結腸ひもに引かれて膨起が連なる。'},
 transverse:{n:'横行結腸',en:'Colon transversum',sys:GUT,c:[.80,.58,.52],fold:'haustra',cf:.66,z:'colon',d:'胃の下を横切る。胆汁の色素ビリルビンが細菌によって茶色のステルコビリンに変わり、便が茶色くなる。'},
 descending:{n:'下行結腸',en:'Colon descendens',sys:GUT,c:[.80,.58,.52],fold:'haustra',cf:.66,z:'colon',d:'左の腹を下る。ここまで来ると便はかなり固まっている。'},
 sigmoid:{n:'S状結腸',en:'Colon sigmoideum',sys:GUT,c:[.80,.56,.52],fold:'haustra',cf:.66,z:'colon',d:'S字に曲がって骨盤に入る。直腸の手前で便をためておく。'},
 rectum:{n:'直腸',en:'Rectum',sys:GUT,c:[.78,.44,.44],fold:'rectal',cf:.7,z:'rectum',d:'長さ約12〜20cm（どこまでを直腸と数えるかで変わる）。便がたまって壁が伸びると便意が起こり、肛門括約筋がゆるむ。'},
 anus:{n:'肛門',en:'Anus',sys:GUT,c:[.72,.38,.40],fold:'none',cf:.6,z:'rectum',d:'出口。内肛門括約筋（自分の意思では動かない）と外肛門括約筋（意思で締められる）で開け閉めする。'},
 outside:{n:'体の外',en:'Outside',sys:'—',c:[1,1,1],fold:'none',cf:1,z:'out',d:'体の外に出た。ここでは壁をすり抜けて自由に飛べる。口・鼻・肛門に近づけば、また中に入れる。'}
};
// 英語（I18N.md）: 名前と説明を上書き。部位を足したらここにも足す
if(LANG==='en')Object.entries({
  nose:['Nasal cavity','A chamber that warms and moistens the air you breathe in. Three shelves of folds (the nasal conchae) stick out from each side wall, and mucus traps dust and germs.'],
  mouth:['Mouth','Teeth crush food and mix it with saliva. You make about 1–1.5 L of saliva a day. While food is in the mouth it gets “chewed” and broken into small pieces.'],
  pharynx:['Pharynx (throat)','A crossroads for air and food. Lower down, the front leads to the larynx (air) and the back to the esophagus (food). Near the entrance of the esophagus the swallowing reflex starts, and the glottis closes to protect the airway.'],
  larynx:['Larynx','The entrance to the trachea. When you swallow, the epiglottis tips over like a lid, and if food gets in, a cough pushes it back out.'],
  vocal:['Vocal folds','Folds that stick out from both sides. Breath going out makes them vibrate, which makes your voice. They close tightly when you swallow.'],
  trachea:['Trachea (windpipe)','About 10–12 cm long and 1.5–2 cm across inside. 16–20 U-shaped rings of cartilage keep the tube from collapsing. Only the back side has no cartilage, where it touches the esophagus.'],
  bronchus:['Main bronchus','The trachea splits into left and right. The right one is a little wider and steeper than the left, so things breathed in by mistake tend to go right.'],
  lobar:['Lobar bronchus','The right lung has 3 lobes and the left has 2. The tubes keep branching finer and finer, ending in about 500 million alveoli on average (300–800 million, depending on the person).'],
  esophagus:['Esophagus','About 25 cm long, and usually squashed flat. When you swallow, a wave of muscle (peristalsis) carries food to the stomach in about 4–8 seconds.'],
  stomach:['Stomach','When empty it shrinks to about the size of a fist and its folds stand out; after a meal it stretches and the folds flatten (it can hold 2–3 L or more). Stomach juice is strongly acidic (pH 1.5–3.5). The exit, the pylorus, lets through only liquid and finely broken-down food (chyme), a little at a time.'],
  duodenum:['Duodenum','About 25–30 cm long. Bile and pancreatic juice flow in and stain everything yellow. The alkali in pancreatic juice neutralizes stomach acid, and the digestive enzymes really get to work.'],
  jejunum:['Jejunum','The first half of the small intestine. Circular folds and villi increase the surface area to absorb broken-down nutrients (amino acids, sugars, fatty acids).'],
  ileum:['Ileum','The second half of the small intestine. It absorbs vitamin B12 and bile acids. The ileocecal valve at the exit stops backflow from the large intestine.'],
  cecum:['Cecum','The pouch at the start of the large intestine. The ileum joins it from the side. In a real body, the appendix hangs from its lower end.'],
  ascending:['Ascending colon','Goes up the right side of the belly. Gut bacteria ferment dietary fiber, and water is absorbed. Pulled by 3 bands (taeniae coli), it bulges into a row of pouches (haustra).'],
  transverse:['Transverse colon','Crosses under the stomach. Bacteria turn the bile pigment bilirubin into brown stercobilin, which makes stool brown.'],
  descending:['Descending colon','Goes down the left side of the belly. By here, the stool has become fairly firm.'],
  sigmoid:['Sigmoid colon','Bends in an S shape into the pelvis. Stool is stored here before the rectum.'],
  rectum:['Rectum','About 12–20 cm long (it depends on where you count it from). When stool collects and stretches the wall, you feel the urge to go, and the anal sphincters relax.'],
  anus:['Anus','The exit. It opens and closes with the internal anal sphincter (not under your control) and the external anal sphincter (which you can tighten on purpose).'],
  outside:['Outside the body','You are out of the body. Here you can fly freely through walls. Go near the mouth, nose or anus to get back in.'],
}).forEach(([k,[n,d]])=>{REG[k].n=n;REG[k].d=d;});
for(const k in REG){REG[k].lin=lin(REG[k].c);REG[k].vil=REG[k].vil||0;}
const TSCALE={mouth:1,pharynx:1,eso:1,air:1,stomach:60,duo:60,sb:60,colon:240,rectum:240,out:1};

/* ---------- 中心線 (cm, x=体の左, y=上, z=前) ---------- */
function digPts(){
  const P=[
   [0,1.8,-2.3,1.4,'pharynx'],[0,0,-2.5,1.5,'pharynx'],[0,-3,-2.6,1.6,'pharynx'],[0,-5.5,-2.5,1.5,'pharynx'],[0,-8,-2.3,1.3,'pharynx'],
   [0,-11,-2.3,.9,'esophagus'],[0,-17,-2.5,1,'esophagus'],[.2,-24,-2.8,1,'esophagus'],[.5,-31,-2.8,1,'esophagus'],[1,-37,-2,1,'esophagus'],[1.8,-42,-.6,1.1,'esophagus'],
   [3,-45,.5,1.6,'stomach'],[5,-46.5,1,3,'stomach'],[7.5,-49,1.5,3.6,'stomach'],[8,-53,2,3.6,'stomach'],[6.8,-56.5,2.5,3.2,'stomach'],[4,-58.5,3,2.6,'stomach'],[1,-58.5,3,2,'stomach'],[-1.5,-57.3,2.6,1.4,'stomach'],[-3,-55.5,2,.8,'stomach'],
   [-4.5,-55.5,1.3,1.4,'duodenum'],[-6.3,-58,.5,1.4,'duodenum'],[-6.2,-61.5,.3,1.4,'duodenum'],[-4,-63.5,.5,1.4,'duodenum'],[-1,-63.5,.5,1.4,'duodenum'],
   [2,-63,.5,1.3,'jejunum'],[5.5,-64.5,1.5,1.2,'jejunum']
  ];
  const rows=5,x0=6,x1=-4;
  for(let i=0;i<rows;i++){
    const y=-67-3.6*i,reg=i<2?'jejunum':'ileum',from=i%2?x1:x0,to=i%2?x0:x1,n=6;
    for(let k=0;k<=n;k++){const x=from+(to-from)*k/n;P.push([x,y+.4*Math.sin(x*.8+i),1.5+Math.sin(x*1.1+i*1.7),reg==='jejunum'?1.2:1.1,reg]);}
    if(i<rows-1)P.push([i%2?x0+1.8:x1-1.8,y-1.8,1.5,1.15,reg]);
  }
  P.push([-7,-81.2,2,1.1,'ileum'],[-10,-80.6,2,1.1,'ileum'],[-12.2,-80.4,2,1,'ileum']);
  return P;
}
const TUBES=[
 {id:'nasal',open:[true,false],ds:.07,radial:36,anim:2,pts:[[0,.2,10,.9,'nose'],[0,.6,8.5,1,'nose'],[0,1.4,6,1.2,'nose'],[0,1.8,3.5,1.2,'nose'],[0,1.4,1,1.1,'nose'],[0,.6,-1.2,1.1,'pharynx']]},
 {id:'oral',open:[true,false],ds:.08,radial:44,anim:0,pts:[[0,-4.2,10.2,1.3,'mouth'],[0,-4.2,8.5,1.7,'mouth'],[0,-4,6,2,'mouth'],[0,-3.8,3,2,'mouth'],[0,-4.3,.6,1.6,'mouth'],[0,-5,-1.4,1.3,'pharynx']]},
 {id:'dig',open:[false,false],ds:.07,radial:40,anim:1,pts:digPts()},
 {id:'colon',open:[false,true],ds:.1,radial:48,anim:1,pts:[
   [-12,-86,2.5,2.2,'cecum'],[-12,-83,2.3,2.6,'cecum'],[-12,-78,2,2.5,'ascending'],[-12,-70,2,2.5,'ascending'],[-12,-62,2.5,2.5,'ascending'],
   [-11,-58.5,4.5,2.4,'transverse'],[-7,-60.5,7.3,2.4,'transverse'],[-1,-62.5,7.8,2.4,'transverse'],[5,-62,7.5,2.4,'transverse'],[10,-61,5.5,2.4,'transverse'],
   [12.5,-60,3,2.4,'descending'],[12.8,-66,2,2.3,'descending'],[12.5,-74,2,2.3,'descending'],
   [11.5,-81,2.5,2.2,'sigmoid'],[8,-85,4,2,'sigmoid'],[4,-86,3.5,2,'sigmoid'],
   [1,-88,.5,2.2,'rectum'],[0,-92,-1,2.4,'rectum'],[0,-96,-.5,1.6,'rectum'],[0,-99,.5,.7,'anus']]},
 {id:'trachea',open:[false,false],ds:.06,radial:36,anim:2,pts:[[0,-7,-1.6,1,'larynx'],[0,-8.6,-.6,1.1,'larynx'],[0,-10.2,.2,1.1,'larynx'],[0,-11.6,.5,.95,'vocal'],[0,-13,.6,1,'trachea'],[0,-18,.8,1,'trachea'],[0,-23,.7,1,'trachea'],[0,-26.5,.5,.95,'trachea'],[0,-28,.5,.9,'trachea']]},
 {id:'bR',open:[false,false],ds:.05,radial:30,anim:2,pts:[[0,-26.3,.5,.75,'bronchus'],[-1.8,-28.3,.4,.75,'bronchus'],[-3.2,-30.5,.3,.7,'bronchus'],[-4.2,-33.5,.3,.6,'bronchus'],[-5,-37,-.2,.5,'lobar'],[-5.8,-41,-.8,.42,'lobar'],[-6.3,-44,-1.2,.35,'lobar']]},
 {id:'bL',open:[false,false],ds:.05,radial:30,anim:2,pts:[[0,-26.3,.5,.7,'bronchus'],[2,-28.6,.4,.68,'bronchus'],[3.8,-31.5,.3,.6,'bronchus'],[4.8,-35,0,.5,'lobar'],[5.6,-39.5,-.6,.42,'lobar'],[6,-43,-1,.35,'lobar']]},
 {id:'rul',open:[false,false],ds:.05,radial:26,anim:2,pts:[[-2.6,-29.5,.35,.5,'lobar'],[-4.5,-28.8,.4,.5,'lobar'],[-6.5,-27.8,.3,.42,'lobar'],[-8,-27,.1,.35,'lobar']]},
 {id:'rml',open:[false,false],ds:.05,radial:26,anim:2,pts:[[-4,-33,.4,.42,'lobar'],[-5.2,-34.5,1.6,.42,'lobar'],[-6.2,-35.5,2.8,.35,'lobar']]},
 {id:'lul',open:[false,false],ds:.05,radial:26,anim:2,pts:[[3.4,-30.8,.35,.48,'lobar'],[5.2,-30,.6,.45,'lobar'],[7,-28.8,.6,.38,'lobar'],[8.3,-27.8,.4,.32,'lobar']]}
];
const AIRWAY=new Set(['nasal','trachea','bR','bL','rul','rml','lul']);

/* ---------- 壁のひだ ---------- */
const TAU=Math.PI*2;
function angDiff(a,b){let d=(a-b)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;}
function fold(type,s,dir,th){
  switch(type){
   case 'turb':{const lat=Math.abs(dir.x);let b=0;for(const c of [.55,0,-.55])b+=Math.exp(-Math.pow((dir.y-c)/.2,2));return -.32*lat*lat*b*(.85+.15*Math.sin(s*2.2));}
   case 'mouth':{const down=Math.max(0,-dir.y),up=Math.max(0,dir.y);return -.32*smooth(.25,.95,down)-.05*smooth(.6,1,up)*Math.max(0,Math.sin(s*7));}
   case 'vocal':return -.55*Math.pow(Math.abs(dir.x),3);
   case 'rings':{const post=Math.max(0,-dir.z),ring=Math.pow(.5+.5*Math.sin(s*TAU/.45),3);return -.08*ring*(1-smooth(.55,.9,post));}
   case 'brings':return -.07*Math.pow(.5+.5*Math.sin(s*TAU/.36),3);
   case 'lrings':return -.06*Math.pow(.5+.5*Math.sin(s*TAU/.3),3);
   case 'long':return -.2*Math.pow(.5+.5*Math.cos(8*th+.6*Math.sin(s*.5)),3);
   case 'rugae':return -.09*Math.pow(.5+.5*Math.cos(13*th+1.6*Math.sin(s*.55+th*2)),4)-.04*Math.pow(.5+.5*Math.cos(7*th-s*.9),6);
   case 'plicae':{const f=Math.sin(TAU*s/.7+.9*Math.sin(th*2+s*.3));return -.2*Math.pow(Math.max(0,f),6);}
   case 'plicae2':{const f=Math.sin(TAU*s/.8+.9*Math.sin(th*2+s*.3));return -.11*Math.pow(Math.max(0,f),6);}
   case 'haustra':{const h=((s/3.2)%1+1)%1,dd=Math.min(h,1-h)*3.2;let band=0;for(let k=0;k<3;k++)band=Math.max(band,Math.exp(-Math.pow(angDiff(th,k*TAU/3)/.16,2)));
     return -.26*Math.exp(-Math.pow(dd/.3,2))*(1-band*.8)+.07*Math.sin(Math.PI*h)-.08*band;}
   case 'rectal':{const h=((s/4.5)%1+1)%1,dd=Math.min(h,1-h)*4.5;return -.25*Math.exp(-Math.pow(dd/.35,2))*smooth(-.2,.6,Math.cos(th+s));}
   default:return 0;
  }
}
const dome=(d,r)=>d>=r?1:Math.max(.02,Math.sqrt(Math.max(0,1-Math.pow(1-d/r,2))));

/* ---------- 中心線のサンプリング ---------- */
function prepTube(def){
  const P=def.pts,n=P.length;
  const curve=new THREE.CatmullRomCurve3(P.map(p=>V3(p[0],p[1],p[2])),false,'centripetal');
  const M=(n-1)*48,dense=[];let L=0,prev=null;
  for(let i=0;i<=M;i++){const u=i/M,p=curve.getPoint(u);if(prev)L+=p.distanceTo(prev);dense.push({u,p,L});prev=p;}
  const cnt=Math.max(2,Math.ceil(L/def.ds)),S=[];let j=0;
  for(let i=0;i<=cnt;i++){
    const s=L*i/cnt;while(j<M-1&&dense[j+1].L<s)j++;
    const a=dense[j],b=dense[j+1],f=clamp((s-a.L)/Math.max(1e-9,b.L-a.L),0,1);
    const u=a.u+(b.u-a.u)*f,p=a.p.clone().lerp(b.p,f);
    const k=u*(n-1),i0=Math.min(n-2,Math.floor(k)),fr=k-i0,w=fr*fr*(3-2*fr);
    let r=P[i0][3]+(P[i0+1][3]-P[i0][3])*w;
    const regA=P[i0][4],regB=P[i0+1][4];
    if(def.open[0])r*=1+.22*smooth(.9,0,s);else r*=dome(s,r);
    if(def.open[1])r*=1+.22*smooth(.9,0,L-s);else r*=dome(L-s,r);
    const stom=(regA==='stomach'?1-w:0)+(regB==='stomach'?w:0);
    S.push({s,p,r,regA,regB,w,reg:w<.5?regA:regB,stom,cf:REG[regA].cf+(REG[regB].cf-REG[regA].cf)*w,jf:1});
  }
  const last=S.length-1;
  S.forEach((sm,i)=>{sm.T=S[Math.min(i+1,last)].p.clone().sub(S[Math.max(i-1,0)].p).normalize();});
  const hint=Math.abs(S[0].T.y)>.9?V3(0,0,1):V3(0,1,0);
  const N=hint.clone().addScaledVector(S[0].T,-hint.dot(S[0].T)).normalize();
  S.forEach(sm=>{N.addScaledVector(sm.T,-N.dot(sm.T)).normalize();sm.N=N.clone();sm.B=sm.T.clone().cross(N);});
  const box=new THREE.Box3();let rmax=0;S.forEach(sm=>{box.expandByPoint(sm.p);rmax=Math.max(rmax,sm.r);});
  return {def,id:def.id,S,L,box,rmax,groups:[],gates:[]};
}
const tubes=TUBES.map(prepTube);
const TUB={};tubes.forEach(t=>TUB[t.id]=t);
function nearestIdx(T,pt){let bi=0,bd=Infinity;T.S.forEach((s,i)=>{const d=s.p.distanceToSquared(pt);if(d<bd){bd=d;bi=i;}});return bi;}

/* ---------- 括約筋（ふだん閉じている関門） ---------- */
// rsj（S状結腸→直腸）は括約筋ではなく、せまく曲がったところ（bend）。はっきりした括約筋は解剖で見つかっていないが、
// 圧の高い帯として働き、便は大蠕動のときに通る（O'Beirne の括約筋の説は決着していない）。閉じた扉に見えないよう浅く広くせばめる
const GATES=[
 {id:'ues',name:L('上部食道','Upper esophagus'),tube:'dig',at:[0,-11.5,-2.3],w:.55,open:0},
 {id:'les',name:L('下部食道','Lower esophagus'),tube:'dig',at:[2.3,-43.6,0],w:.6,open:0},
 {id:'pyl',name:L('幽門','Pylorus'),tube:'dig',at:[-3,-55.5,2],w:.45,open:0},
 {id:'icv',name:L('回盲弁','Ileocecal valve'),tube:'dig',at:[-8.9,-80.6,2],w:.4,open:0},
 {id:'anal',name:L('肛門','Anus'),tube:'colon',fromEnd:1.2,w:.55,open:0},
 {id:'rsj',name:L('S状→直腸の曲がり角','Rectosigmoid bend'),tube:'colon',at:[2.4,-87.2,2],w:1.4,open:0,depth:.5,bend:true},
 {id:'glot',name:L('声門','Glottis'),tube:'trachea',at:[0,-11.6,.5],w:.5,open:1}
];
const G={};
const LODGE=TUB.dig.S[nearestIdx(TUB.dig,V3(.2,-23,-2.8))].s;
GATES.forEach(g=>{const T=TUB[g.tube];g.T=T;g.s=g.fromEnd?T.L-g.fromEnd:T.S[nearestIdx(T,V3(...g.at))].s;g.p=T.S[Math.round(g.s/T.def.ds)].p;g.target=g.open;T.gates.push(g);G[g.id]=g;});

/* ---------- 合流部: ひだを消し、壁に穴をあける ---------- */
const near=(p,b,m)=>p.x>b.min.x-m&&p.x<b.max.x+m&&p.y>b.min.y-m&&p.y<b.max.y+m&&p.z>b.min.z-m&&p.z<b.max.z+m;
for(const A of tubes)for(const B of tubes){
  if(A===B)continue;
  const m0=A.rmax+B.rmax+2.5;
  if(!A.box.clone().expandByScalar(m0).intersectsBox(B.box))continue;
  for(const a of A.S){
    if(!near(a.p,B.box,a.r+B.rmax+2.5))continue;
    let m=Infinity;for(let j=0;j<B.S.length;j+=2){const b=B.S[j];const d=a.p.distanceTo(b.p)-b.r-a.r;if(d<m)m=d;}
    a.jf=Math.min(a.jf,smooth(0,2.2,m));
  }
  const flag=[];
  for(let j=0;j<B.S.length;j++){
    const b=B.S[j];if(!near(b.p,A.box,b.r+A.rmax+.5))continue;
    for(let i=0;i<A.S.length;i+=2){const a=A.S[i];const d=b.p.distanceTo(a.p);if(Math.abs(d-a.r)<b.r+.25){flag.push(j);break;}}
  }
  let k=0;
  while(k<flag.length){
    let j0=flag[k],j1=j0;while(k+1<flag.length&&flag[k+1]-j1<=4){k++;j1=flag[k];}k++;
    j0=Math.max(0,j0-2);j1=Math.min(B.S.length-1,j1+2);
    const caps=[];for(let j=j0;j<j1;j+=3)caps.push([B.S[j],B.S[Math.min(j+3,j1)]]);
    if(!caps.length)caps.push([B.S[j0],B.S[j1]]);
    A.groups.push(caps);
  }
}

