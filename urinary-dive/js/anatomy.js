'use strict';
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const lin=c=>c.map(v=>Math.pow(v,2.2));
const mixc=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const css=c=>`rgb(${c.map(v=>Math.round(clamp(v,0,1)*255)).join(',')})`;
const $=id=>document.getElementById(id);
const reduceMotion=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtT=m=>{if(m<1)return Math.round(m*60)+'秒';m=Math.floor(m);const h=Math.floor(m/60);return h?`${h}時間${m%60}分`:`${m}分`;};
const fmtN=n=>n>=1e8?(n/1e8).toFixed(1)+'億':n>=1e4?(n/1e4).toFixed(n>=1e5?0:1)+'万':Math.round(n).toString();
const TAU=Math.PI*2;

/* ---------- 部位 ---------- */
const KID='腎臓',URI='尿路';
const REG={
 calyx:{n:'腎杯',en:'Calyx renalis',sys:KID,c:[.86,.6,.56],fold:'none',cf:.7,z:'kid',pel:1,d:'正面に盛り上がっているのが腎乳頭。片方の腎臓に平均90万〜100万個（人によって約20万〜250万個以上）あるネフロンでこされた尿が、集合管の細かい穴（乳頭孔）からしみ出してくる。1日にこされる原尿は約180L、その99%以上は体に戻され、尿になるのは約1.5L。'},
 pelvis:{n:'腎盂',en:'Pelvis renalis',sys:KID,c:[.86,.58,.55],fold:'none',cf:.75,z:'kid',pel:1,d:'いくつもの腎杯から尿が集まる、じょうごのような部屋。ここから尿管へ流れ出す。'},
 upj:{n:'腎盂尿管移行部',en:'Ureteropelvic junction',sys:URI,c:[.84,.55,.52],fold:'ufold',cf:.7,z:'ure',pel:.5,ure:.5,d:'尿管の第1の狭いところ。腎臓でできた結石が引っかかりやすい。'},
 ureter:{n:'尿管',en:'Ureter',sys:URI,c:[.85,.58,.55],fold:'ufold',cf:.75,z:'ure',ure:1,d:'長さ平均約26cm（22〜30cm）、内径3〜4mm（このアプリでは少し太め）。ふだんは星形につぶれていて、1分に2〜6回の蠕動の波が尿のかたまりを膀胱へ送る。広がっているのは尿のあるところだけ。'},
 iliac:{n:'総腸骨動脈との交差部',en:'Iliac crossing',sys:URI,c:[.84,.54,.52],fold:'ufold',cf:.7,z:'ure',ure:1,d:'教科書で尿管の「第2の狭窄部」とされるところ。骨盤の入口で太い動脈をまたぎ、急に後ろへ曲がる。管そのものはあまり細くないが、曲がり角で大きめの石が引っかかりやすい。'},
 uvj:{n:'尿管膀胱移行部',en:'Ureterovesical junction',sys:URI,c:[.84,.5,.5],fold:'ufold',cf:.7,z:'ure',d:'尿管の第3の、いちばん狭いところ。膀胱の壁を斜めに約2cm貫いている。膀胱がふくらむと押しつぶされて弁になり、尿が腎臓へ逆流するのを防ぐ。'},
 orifice:{n:'尿管口',en:'Ostium ureteris',sys:URI,c:[.84,.5,.5],fold:'none',cf:.7,z:'bl',d:'尿管が膀胱に開く出口。蠕動の波が来ると口が開いて、尿がピュッと噴き出す。'},
 bladder:{n:'膀胱',en:'Vesica urinaria',sys:URI,c:[.88,.62,.58],fold:'rugae',cf:.75,z:'bl',bl:1,d:'のび縮みする袋。空のときはしぼんでひだだらけ、たまると風船のようにつるつるになる。健康な若い人の測定では、約190mLでたまった感じ、約270mLで尿意、約410mLで強い尿意（人によって差が大きい）。楽にためられるのは300〜400mL、500mLほどまで入る。中は尿で満たされていて空気はない。'},
 trigone:{n:'膀胱三角',en:'Trigonum vesicae',sys:URI,c:[.86,.52,.52],fold:'none',cf:.75,z:'bl',d:'左右の尿管口と内尿道口を結ぶ三角形の部分。ここだけは壁がなめらかで、ふくらんでも伸びない。'},
 bneck:{n:'膀胱頸部',en:'Collum vesicae',sys:URI,c:[.84,.5,.5],fold:'none',cf:.7,z:'bl',d:'膀胱の出口。内尿道括約筋があり、自分の意思とは関係なくふだんは閉じている。'},
 urethraF:{n:'尿道（女性）',en:'Urethra feminina',sys:URI,c:[.86,.55,.55],fold:'ufold2',cf:.7,z:'uth',d:'長さ約4cm。短くまっすぐなので、細菌が膀胱までのぼりやすい。女性に膀胱炎が多い理由のひとつ。'},
 prostatic:{n:'尿道前立腺部',en:'Pars prostatica',sys:URI,c:[.82,.52,.5],fold:'crest',cf:.7,z:'uth',d:'前立腺の中を通る約3〜4cm。尿道でいちばん広い部分。後ろの壁の盛り上がり（精丘）に射精管が開く。年をとると前立腺が大きくなり、ここが狭くなる（前立腺肥大）。'},
 membranous:{n:'尿道隔膜部',en:'Pars membranacea',sys:URI,c:[.84,.5,.5],fold:'ufold2',cf:.7,z:'uth',d:'外尿道括約筋に囲まれた、長さ1〜1.5cmほどの短い部分。ここは自分の意思で締められる。'},
 spongy:{n:'尿道海綿体部',en:'Pars spongiosa',sys:URI,c:[.86,.56,.55],fold:'ufold2',cf:.72,z:'uth',d:'陰茎の中を通る、いちばん長い部分。男性の尿道は全体で平均約20cmあり、S字に曲がっている。'},
 meatus:{n:'外尿道口',en:'Ostium urethrae externum',sys:URI,c:[.84,.5,.5],fold:'none',cf:.7,z:'uth',d:'出口。外の光が見える。'},
 outside:{n:'体の外',en:'Outside',sys:'—',c:[1,1,1],fold:'none',cf:1,z:'out',d:'体の外に出た。ここでは自由に飛べる。外尿道口に近づけば、また中に入れる。'}
};
for(const k in REG){const r=REG[k];r.lin=lin(r.c);r.pel=r.pel||0;r.ure=r.ure||0;r.bl=r.bl||0;}

/* ---------- 中心線 (cm, x=体の左, y=上, z=前) ---------- */
function side(sx,dy,pts){return pts.map(([x,y,z,r,g])=>[x*sx,y+dy*clamp((y+75)/20,0,1),z,r,g]);}
const MAIN=[[7.6,-47.5,-5.5,.45,'calyx'],[6.8,-49,-5.3,.55,'calyx'],[5.8,-51,-5.0,.9,'pelvis'],[5.0,-53,-4.6,.7,'pelvis'],[4.4,-55,-4.2,.22,'upj'],
  [4.0,-59,-4.0,.25,'ureter'],[3.6,-65,-3.6,.25,'ureter'],[3.4,-71,-3.4,.25,'ureter'],[3.6,-76,-3.0,.2,'iliac'],[4.4,-81,-2.0,.25,'ureter'],[4.2,-87,-1.0,.25,'ureter'],
  [2.6,-92.8,.4,.2,'uvj'],[1.4,-93.8,1.4,.2,'orifice']];
const MIDC=[[7.9,-51.5,-5.6,.45,'calyx'],[6.9,-51.6,-5.3,.5,'calyx'],[5.9,-51.4,-5.0,.6,'pelvis']];
const LOWC=[[7.6,-55.5,-5.5,.45,'calyx'],[6.7,-54.6,-5.2,.5,'calyx'],[5.4,-53.2,-4.8,.55,'pelvis']];
const UR0=[[0,-95.2,3.1,.45,'bneck'],[0,-96.6,3.4,.3,'bneck']];
const TUBES=[
 {id:'urL',kid:'L',open:[false,false],ds:.04,radial:24,pts:side(1,0,MAIN)},
 {id:'cmL',kid:'L',open:[false,false],ds:.04,radial:24,pts:side(1,0,MIDC)},
 {id:'clL',kid:'L',open:[false,false],ds:.04,radial:24,pts:side(1,0,LOWC)},
 {id:'urR',kid:'R',open:[false,false],ds:.04,radial:24,pts:side(-1,-2,MAIN)},
 {id:'cmR',kid:'R',open:[false,false],ds:.04,radial:24,pts:side(-1,-2,MIDC)},
 {id:'clR',kid:'R',open:[false,false],ds:.04,radial:24,pts:side(-1,-2,LOWC)},
 {id:'bladder',open:[false,false],ds:.08,radial:56,pts:[[0,-82.5,2.2,2.6,'bladder'],[0,-85.5,2.6,4.2,'bladder'],[0,-89,2.6,4.6,'bladder'],[0,-92,2.5,3.6,'trigone'],[0,-94.2,2.8,2,'trigone'],[0,-95.7,3.2,.7,'bneck']]},
 {id:'uM',sex:'M',open:[false,true],ds:.04,radial:26,pts:[...UR0.map(p=>p[4]==='@'?[...p.slice(0,4),'prostatic']:p),[0,-98.2,3.6,.3,'prostatic'],[0,-99.6,4.2,.22,'membranous'],[0,-101,5.8,.3,'spongy'],[0,-101.4,8,.3,'spongy'],[0,-102.5,11,.28,'spongy'],[0,-105,13.5,.28,'spongy'],[0,-107,14.5,.26,'meatus']]},
 {id:'uF',sex:'F',open:[false,true],ds:.04,radial:26,pts:[...UR0.map(p=>p[4]==='@'?[...p.slice(0,4),'urethraF']:p),[0,-98.2,4.0,.28,'urethraF'],[0,-99.7,4.9,.32,'meatus']]}
];

/* ---------- 壁のひだ ---------- */
function angDiff(a,b){let d=(a-b)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;}
function fold(type,s,dir,th){
  switch(type){
   case 'ufold':return -.3*Math.pow(.5+.5*Math.cos(5*th+.3*Math.sin(s*.4)),3);
   case 'ufold2':return -.18*Math.pow(.5+.5*Math.cos(6*th+.4*Math.sin(s*.7)),3);
   case 'crest':return -.32*smooth(.55,1,-dir.z)-.08*Math.pow(.5+.5*Math.cos(6*th),3);
   case 'rugae':return -.09*Math.pow(.5+.5*Math.cos(13*th+1.6*Math.sin(s*.55+th*2)),4)-.05*Math.pow(.5+.5*Math.cos(7*th-s*.9),6);
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
    if(def.open[0])r*=1+.22*smooth(.9,0,s);else r*=dome(s,r);
    if(def.open[1])r*=1+.22*smooth(.9,0,L-s);else r*=dome(L-s,r);
    S.push({s,p,r,regA,regB,w,reg:w<.5?regA:regB,stom:bw('bl'),ure:bw('ure'),pel:bw('pel'),cf:bw('cf'),jf:1});
  }
  const last=S.length-1;
  S.forEach((sm,i)=>{sm.T=S[Math.min(i+1,last)].p.clone().sub(S[Math.max(i-1,0)].p).normalize();});
  const hint=Math.abs(S[0].T.y)>.9?V3(0,0,1):V3(0,1,0);
  const N=hint.clone().addScaledVector(S[0].T,-hint.dot(S[0].T)).normalize();
  S.forEach(sm=>{N.addScaledVector(sm.T,-N.dot(sm.T)).normalize();sm.N=N.clone();sm.B=sm.T.clone().cross(N);});
  const box=new THREE.Box3();let rmax=0;S.forEach(sm=>{box.expandByPoint(sm.p);rmax=Math.max(rmax,sm.r);});
  return {def,id:def.id,S,L,box,rmax,groups:[],gates:[],active:true,bolus:-100,hydro:null};
}
const tubes=TUBES.map(prepTube);
const TUB={};tubes.forEach(t=>TUB[t.id]=t);
const HYD={L:{value:1},R:{value:1}};
tubes.forEach(t=>{if(t.def.kid)t.hydro=HYD[t.def.kid];});
function nearestIdx(T,pt){let bi=0,bd=Infinity;T.S.forEach((s,i)=>{const d=s.p.distanceToSquared(pt);if(d<bd){bd=d;bi=i;}});return bi;}

/* ---------- 関門 ---------- */
const GATES=[
 {id:'uvjL',name:'左尿管口',tube:'urL',at:[2.4,-93,.6],w:.35},
 {id:'uvjR',name:'右尿管口',tube:'urR',at:[-2.4,-93,.6],w:.35},
 {id:'iusM',name:'内尿道括約筋',tube:'uM',at:[0,-96.8,3.4],w:.35,sex:'M'},
 {id:'eusM',name:'外尿道括約筋',tube:'uM',at:[0,-99.6,4.2],w:.45,sex:'M'},
 {id:'iusF',name:'内尿道括約筋',tube:'uF',at:[0,-96.8,3.4],w:.35,sex:'F'},
 {id:'eusF',name:'外尿道括約筋',tube:'uF',at:[0,-98.2,4.0],w:.45,sex:'F'}
];
const G={};
GATES.forEach(g=>{const T=TUB[g.tube];g.T=T;g.s=T.S[nearestIdx(T,V3(...g.at))].s;g.p=T.S[Math.round(g.s/T.def.ds)].p;g.open=0;g.target=0;T.gates.push(g);G[g.id]=g;});

/* ---------- 合流部: ひだを消し、壁に穴をあける ---------- */
const near=(p,b,m)=>p.x>b.min.x-m&&p.x<b.max.x+m&&p.y>b.min.y-m&&p.y<b.max.y+m&&p.z>b.min.z-m&&p.z<b.max.z+m;
for(const A of tubes)for(const B of tubes){
  if(A===B||(A.def.sex&&B.def.sex))continue; // 男女の尿道どうしは同時に存在しない
  const m0=A.rmax+B.rmax+2.5;
  if(!A.box.clone().expandByScalar(m0).intersectsBox(B.box))continue;
  for(const a of A.S){
    if(!near(a.p,B.box,a.r+B.rmax+2.5))continue;
    let m=Infinity;for(let j=0;j<B.S.length;j+=2){const b=B.S[j];const d=a.p.distanceTo(b.p)-b.r-a.r;if(d<m)m=d;}
    a.jf=Math.min(a.jf,smooth(0,1.2,m));
  }
  const flag=[];
  for(let j=0;j<B.S.length;j++){
    const b=B.S[j];if(!near(b.p,A.box,b.r+A.rmax+.5))continue;
    for(let i=0;i<A.S.length;i+=2){const a=A.S[i];const d=b.p.distanceTo(a.p);if(Math.abs(d-a.r)<b.r+.15){flag.push(j);break;}}
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

