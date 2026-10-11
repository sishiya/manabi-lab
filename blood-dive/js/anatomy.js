'use strict';
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const lin=c=>c.map(v=>Math.pow(v,2.2));
const mixc=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const css=c=>`rgb(${c.map(v=>Math.round(clamp(v,0,1)*255)).join(',')})`;
const $=id=>document.getElementById(id);
const reduceMotion=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtS=s=>s<60?Math.round(s)+'秒':Math.floor(s/60)+'分'+Math.round(s%60)+'秒';
const TAU=Math.PI*2;

/* ---------- 部位 ---------- */
const ART='動脈',VEN='静脈',HEART='心臓';
const cA=[.86,.68,.66],cV=[.52,.26,.36],cM=[.62,.2,.21],cAt=[.68,.27,.27],cVal=[.92,.82,.74];
const REG={
 femv:{n:'大腿静脈',en:'Vena femoralis',sys:VEN,c:cV,cf:.72,d:'脚の血液を心臓へ戻す深い静脈。中に逆流を防ぐ弁があり、ふくらはぎの筋肉が縮むたびに血液が押し上げられる（筋ポンプ）。長く座ったままだと流れが滞り、血栓ができやすい（エコノミークラス症候群）。'},
 ivc:{n:'下大静脈',en:'Vena cava inferior',sys:VEN,c:cV,cf:.75,d:'体の下半分の血液を右心房へ戻す、いちばん太い静脈（直径は目安で約2〜2.5cm）。脚・腎臓・肝臓からの静脈が合流する。'},
 renv:{n:'腎静脈',en:'Vena renalis',sys:VEN,c:cV,cf:.72,d:'腎臓でこされたあとの血液を下大静脈へ戻す。'},
 portal:{n:'門脈',en:'Vena portae',sys:VEN,c:[.5,.3,.3],cf:.72,d:'胃腸と脾臓から集めた血液を、心臓へ戻す前に肝臓へ運ぶ特別な静脈。吸収された栄養やアルコール・薬は、まず肝臓を通ってから全身に回る（初回通過効果）。'},
 hepv:{n:'肝静脈',en:'Venae hepaticae',sys:VEN,c:cV,cf:.72,d:'肝臓を通りぬけた血液を、横隔膜のすぐ下で下大静脈へ戻す。'},
 jug:{n:'内頸静脈',en:'Vena jugularis interna',sys:VEN,c:cV,cf:.72,d:'脳から戻る血液を運ぶ首の太い静脈。点滴や中心静脈カテーテルの入口にもなる。'},
 bcv:{n:'腕頭静脈',en:'Vena brachiocephalica',sys:VEN,c:cV,cf:.72,d:'首と腕の静脈が合流し、左から右へ横切って上大静脈につながる。'},
 svc:{n:'上大静脈',en:'Vena cava superior',sys:VEN,c:cV,cf:.75,d:'頭と腕の血液を右心房へ戻す。長さ約7cm。'},
 ra:{n:'右心房',en:'Atrium dextrum',sys:HEART,c:cAt,fold:'pect',cf:.78,atr:1,d:'全身から戻った静脈血を受ける部屋。内壁に櫛状筋のすじが並ぶ。壁には心臓のリズムを作る洞結節がある。'},
 tric:{n:'三尖弁',en:'Valva tricuspidalis',sys:HEART,c:cVal,cf:.75,d:'右心房と右心室のあいだの3枚の弁。心室が縮み始めると閉じて逆流を防ぐ（これがⅠ音「ドッ」）。'},
 rv:{n:'右心室',en:'Ventriculus dexter',sys:HEART,c:cM,fold:'trab',cf:.72,vent:1,d:'肺へ血液を送る部屋。肺へは低い圧で足りるので、壁は左心室よりずっと薄い（目安で3分の1ほど）。内側は肉柱で凸凹している。'},
 pvalve:{n:'肺動脈弁',en:'Valva trunci pulmonalis',sys:HEART,c:cVal,cf:.75,d:'3枚のポケット状の弁。心室がゆるむと閉じる（これがⅡ音「クン」）。'},
 pa:{n:'肺動脈',en:'Arteria pulmonalis',sys:'肺循環',c:[.8,.6,.62],cf:.75,art:1,d:'酸素の少ない血液を肺へ運ぶ。動脈なのに中身は静脈血。左右に分かれ、肺の中で枝分かれをくり返して毛細血管になる。'},
 pvein:{n:'肺静脈',en:'Venae pulmonales',sys:'肺循環',c:[.72,.34,.36],cf:.72,d:'肺で酸素を受け取った明るい赤の血液を左心房へ運ぶ。静脈なのに中身は動脈血。左右2本ずつ、計4本ある。'},
 la:{n:'左心房',en:'Atrium sinistrum',sys:HEART,c:cAt,fold:'pect',cf:.78,atr:1,d:'肺静脈から酸素の多い血液を受ける部屋。'},
 mitral:{n:'僧帽弁',en:'Valva mitralis',sys:HEART,c:cVal,cf:.75,d:'左心房と左心室のあいだの2枚の弁。形が司教の帽子（ミトラ）に似ている。心室が縮むと閉じる。'},
 lv:{n:'左心室',en:'Ventriculus sinister',sys:HEART,c:[.58,.17,.18],fold:'trab',cf:.72,vent:1,d:'全身へ血液を送る主力のポンプ。壁の厚さは目安で約1cm。1回の拍動で約70mL、安静時でも1分に約5Lを送り出す。'},
 lvot:{n:'左室流出路',en:'Outflow tract',sys:HEART,c:[.66,.26,.26],cf:.75,d:'左心室から大動脈弁へ向かう出口の通路。すぐ隣に僧帽弁がある。'},
 av:{n:'大動脈弁',en:'Valva aortae',sys:HEART,c:cVal,cf:.75,d:'3枚の弁。心室が縮むと開き、ゆるむと閉じる（Ⅱ音）。弁のすぐ上から、心臓自身を養う冠動脈が出る。'},
 aoasc:{n:'上行大動脈',en:'Aorta ascendens',sys:ART,c:cA,cf:.78,art:1,d:'心臓から出てすぐの大動脈。直径約3cm。拍動のたびに血圧の波でふくらむ（脈）。'},
 arch:{n:'大動脈弓',en:'Arcus aortae',sys:ART,c:cA,cf:.78,art:1,d:'大動脈が後ろへ曲がるところ。頭と腕への3本の太い枝（腕頭動脈・左総頸動脈・左鎖骨下動脈）が上へ出る。'},
 aodesc:{n:'胸部下行大動脈',en:'Aorta thoracica',sys:ART,c:cA,cf:.78,art:1,d:'背骨の左前を下る。肋骨のあいだや食道へ細い枝を出す。'},
 aoabd:{n:'腹部大動脈',en:'Aorta abdominalis',sys:ART,c:cA,cf:.78,art:1,d:'横隔膜をくぐった大動脈。腸・腎臓へ太い枝を出し、へその高さで左右の脚へ分かれる。'},
 iliac:{n:'腸骨動脈',en:'Arteria iliaca',sys:ART,c:cA,cf:.75,art:1,d:'大動脈が左右に分かれた先。骨盤を通って脚へ向かう（このアプリでは右脚だけ）。'},
 femart:{n:'大腿動脈',en:'Arteria femoralis',sys:ART,c:cA,cf:.75,art:1,d:'脚の付け根で脈がふれる太い動脈。心臓カテーテル検査の入口になる。'},
 car:{n:'総頸動脈',en:'Arteria carotis communis',sys:ART,c:cA,cf:.75,art:1,d:'脳と顔へ向かう動脈。首の横で脈がふれる。動脈硬化のかけらが飛ぶと脳梗塞の原因になる。'},
 rena:{n:'腎動脈',en:'Arteria renalis',sys:ART,c:cA,cf:.75,art:1,d:'細い枝なのに、心臓が送る血液の約20%が腎臓へ流れる。腎臓で血液がこされて尿になる。'},
 sma:{n:'上腸間膜動脈',en:'Arteria mesenterica superior',sys:ART,c:cA,cf:.75,art:1,d:'小腸と大腸の右半分へ血液を送る。食後は流れる量が約3倍に増える。'},
 outside:{n:'—',en:'',sys:'—',c:[1,1,1],cf:1,d:''}
};
for(const k in REG){const r=REG[k];r.lin=lin(r.c);r.fold=r.fold||'none';r.vent=r.vent||0;r.atr=r.atr||0;r.art=r.art||0;}

/* ---------- 中心線 (cm, x=体の左, y=上, z=前) ---------- */
const TUBES=[
 {id:'femv',ds:.08,radial:28,portalIn:'leg',pts:[[-4.3,-111,3.6,.5,'femv'],[-3.9,-100,2.6,.55,'femv'],[-2.6,-88,1.0,.55,'femv'],[-1.2,-79,-2.4,.6,'femv'],[-1.6,-74.2,-2.2,.6,'ivc']]},
 {id:'ivc',ds:.1,radial:36,pts:[[-1.8,-74.5,-2.1,1.0,'ivc'],[-1.9,-60,-2.6,1.05,'ivc'],[-2.0,-50,-3.0,1.1,'ivc'],[-2.2,-44,-2.4,1.1,'ivc'],[-2.6,-38,-.6,1.1,'ivc'],[-3,-31.6,1.2,1.0,'ra']]},
 {id:'renv',ds:.06,radial:24,portalIn:'kidney',pts:[[-5.6,-52.6,-4.4,.38,'renv'],[-3.6,-51.8,-3.6,.4,'renv'],[-1.9,-51.4,-3.0,.4,'ivc']]},
 {id:'portal',ds:.06,radial:28,portalIn:'gut',portalOut:'liver',pts:[[-.8,-61.5,4,.4,'portal'],[-1.6,-55,2.8,.55,'portal'],[-3.6,-49.5,1.6,.6,'portal'],[-5.8,-46.5,.8,.5,'portal']]},
 {id:'hepv',ds:.06,radial:26,portalIn:'liver',pts:[[-5.6,-44.4,-.2,.45,'hepv'],[-3.8,-44,-1.6,.5,'hepv'],[-2.1,-43.9,-2.3,.5,'ivc']]},
 {id:'jug',ds:.08,radial:28,portalIn:'brain',pts:[[1.6,4.5,-2.5,.45,'jug'],[2.2,-3,-1.2,.55,'jug'],[2.3,-11,.4,.6,'jug'],[.2,-14.4,1.8,.6,'bcv'],[-2.2,-13.6,1.2,.6,'svc']]},
 {id:'rh',ds:.08,radial:48,pts:[[-2.3,-12.8,1.0,.75,'svc'],[-2.5,-18,1,.9,'svc'],[-2.8,-24,1.1,.95,'svc'],[-3,-28,1.4,2.0,'ra'],[-3,-30.5,1.5,2.3,'ra'],[-1.9,-33,3,1.35,'tric'],[-.6,-35.5,4.4,2.4,'rv'],[.4,-33.8,5.1,1.9,'rv'],[1.8,-30.2,5.6,1.3,'pvalve'],[2.6,-28,4.8,1.35,'pa'],[2.8,-26.3,3.8,1.3,'pa'],[2.8,-25,3,1.2,'pa']]},
 {id:'paR',ds:.08,radial:30,portalOut:'lungR',pts:[[2.7,-26.6,4.0,.9,'pa'],[.6,-26.2,-1.2,.85,'pa'],[-2.5,-26.4,-1.6,.8,'pa'],[-5,-27.4,-1.6,.7,'pa'],[-7.2,-28.6,-1.2,.55,'pa']]},
 {id:'paL',ds:.08,radial:30,portalOut:'lungL',pts:[[2.9,-26.6,4.0,.85,'pa'],[4.4,-26.4,1.4,.8,'pa'],[6.0,-27.1,-.4,.7,'pa'],[7.6,-28.6,-1.2,.55,'pa']]},
 {id:'pvR',ds:.08,radial:28,portalIn:'lungR',pts:[[-7.2,-31.2,-2.2,.5,'pvein'],[-4.2,-30.8,-2.6,.55,'pvein'],[-1.4,-30.2,-2.2,.55,'pvein'],[.4,-29.9,-1.8,.55,'la']]},
 {id:'pvL',ds:.08,radial:28,portalIn:'lungL',pts:[[7.5,-31.2,-2.2,.5,'pvein'],[4.8,-30.8,-2.6,.55,'pvein'],[2.9,-30.1,-2.1,.55,'la']]},
 {id:'lh',ds:.08,radial:48,pts:[[1.3,-28.0,-1.6,1.4,'la'],[1.5,-29.6,-1.4,1.9,'la'],[2.6,-31.8,0,1.2,'mitral'],[3.8,-34.2,1.3,2.4,'lv'],[4.8,-36.6,2.1,2.2,'lv'],[5.4,-38.6,2.5,1.0,'lv']]},
 {id:'aorta',ds:.1,radial:40,portalOut:'leg',pts:[[3.2,-33.4,2.4,.9,'lvot'],[1.6,-31.4,2.4,1.15,'av'],[.8,-28,2.1,1.3,'aoasc'],[.2,-24.5,.9,1.25,'aoasc'],[.8,-22.2,-1,1.2,'arch'],[2.6,-23.2,-3.6,1.15,'arch'],[3.2,-28,-4.4,1.1,'aodesc'],[2.7,-38,-4.2,1.05,'aodesc'],
   [1.4,-46,-3.4,1.0,'aoabd'],[1.0,-55,-3,.95,'aoabd'],[.8,-65,-2.4,.9,'aoabd'],[.7,-72,-2.2,.85,'aoabd'],[-1.8,-78,-1,.55,'iliac'],[-4,-88,.8,.45,'femart'],[-5.4,-100,2.2,.4,'femart'],[-5.6,-111,3.4,.35,'femart']]},
 {id:'car',ds:.06,radial:24,portalOut:'brain',pts:[[.6,-22.4,-.4,.38,'car'],[.8,-18,.6,.38,'car'],[.9,-8,.6,.36,'car'],[.6,0,-.6,.34,'car'],[0,5,-2,.3,'car']]},
 {id:'rena',ds:.05,radial:22,portalOut:'kidney',pts:[[1.0,-50,-3.3,.3,'rena'],[-2.2,-50.5,-5.0,.3,'rena'],[-5.6,-51,-5.4,.28,'rena']]},
 {id:'sma',ds:.05,radial:22,portalOut:'gut',pts:[[1.4,-45.6,-2.6,.32,'sma'],[1.2,-48,0,.32,'sma'],[.6,-54,2.5,.3,'sma'],[.2,-61,3.6,.28,'sma']]}
];
const VEINS=new Set(['femv','ivc','renv','portal','hepv','jug','pvR','pvL']);

/* ---------- 壁 ---------- */
function fold(type,s,dir,th){
  switch(type){
   case 'trab':return -.18*Math.pow(.5+.5*Math.cos(7*th+2.2*Math.sin(s*1.1+th*1.7)),3)-.06*Math.pow(.5+.5*Math.cos(13*th-s*2),4);
   case 'pect':return -.09*Math.pow(.5+.5*Math.cos(11*th+.8*Math.sin(s*2)),4);
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
    const regA=P[i0][4],regB=P[i0+1][4],A=REG[regA],B=REG[regB],bw=x=>A[x]+(B[x]-A[x])*w;
    r*=dome(s,r)*dome(L-s,r);
    S.push({s,p,r,regA,regB,w,reg:w<.5?regA:regB,vent:bw('vent'),atr:bw('atr'),art:bw('art'),cf:bw('cf'),jf:1});
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

/* ---------- 弁 ---------- */
const GATES=[
 {id:'tric',name:'三尖弁',tube:'rh',at:[-1.9,-33,3],w:.45,lobes:3,kind:'av'},
 {id:'pulm',name:'肺動脈弁',tube:'rh',at:[1.8,-30.2,5.6],w:.4,lobes:3,kind:'sl'},
 {id:'mitral',name:'僧帽弁',tube:'lh',at:[2.6,-31.8,0],w:.45,lobes:2,kind:'av'},
 {id:'aortic',name:'大動脈弁',tube:'aorta',at:[1.6,-31.4,2.4],w:.4,lobes:3,kind:'sl'},
 {id:'venv',name:'静脈弁（脚）',tube:'femv',at:[-3.9,-100,2.6],w:.35,lobes:2,kind:'ven'}
];
const G={};
GATES.forEach(g=>{const T=TUB[g.tube];g.T=T;g.s=T.S[nearestIdx(T,V3(...g.at))].s;g.p=T.S[Math.round(g.s/T.def.ds)].p;g.open=0;g.target=0;T.gates.push(g);G[g.id]=g;});

/* ---------- 合流部 ---------- */
const near=(p,b,m)=>p.x>b.min.x-m&&p.x<b.max.x+m&&p.y>b.min.y-m&&p.y<b.max.y+m&&p.z>b.min.z-m&&p.z<b.max.z+m;
for(const A of tubes)for(const B of tubes){
  if(A===B)continue;
  const m0=A.rmax+B.rmax+2.5;
  if(!A.box.clone().expandByScalar(m0).intersectsBox(B.box))continue;
  for(const a of A.S){
    if(!near(a.p,B.box,a.r+B.rmax+2.5))continue;
    let m=Infinity;for(let j=0;j<B.S.length;j+=2){const b=B.S[j];const d=a.p.distanceTo(b.p)-b.r-a.r;if(d<m)m=d;}
    a.jf=Math.min(a.jf,smooth(0,1.5,m));
  }
  const flag=[];
  for(let j=0;j<B.S.length;j++){
    const b=B.S[j];if(!near(b.p,A.box,b.r+A.rmax+.5))continue;
    for(let i=0;i<A.S.length;i+=2){const a=A.S[i];const d=b.p.distanceTo(a.p);if(Math.abs(d-a.r)<b.r+.2){flag.push(j);break;}}
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
// 合流部の近くは拍動させない（穴の位置がずれないように）
tubes.forEach(T=>T.S.forEach(sm=>{sm.vent*=sm.jf;sm.atr*=sm.jf;sm.art*=sm.jf;}));

