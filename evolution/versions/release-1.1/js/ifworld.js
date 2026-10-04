'use strict';
// "what if": the interventions, how the alternate world looks and who lives in it, the events it produces, the IF panel
/* The original world (MODEL_BASE) is always kept. With interventions, MODEL_IF is computed alongside, and
   worldIF says which one is on screen. The record still draws the past; in the what-if world the
   landscape and life are pushed by the DIFFERENCE between the two models (ifAdjustEnv / ifFactor).
   A few things the model cannot know (who evolves) follow simple stated rules and are marked as imagined. */

KIND.if=['もしも','var(--k-if)','#5fd0c4'];
const IF_LIST=[
  {k:'oxy',A:2.7e9,title:'酸素をつくる生物が現れない',desc:'シアノバクテリアが、水を分解して酸素を出す光合成を始めなかったら。',type:'toggle'},
  {k:'rodinia',A:7.5e8,title:'超大陸ロディニアが割れない',desc:'赤道近くで大陸が割れ、溶岩の大地が風化して CO2 を吸い取る、ということが起きなかったら。',type:'toggle'},
  {k:'plantsEarly',A:5.7e8,title:'植物の上陸が1億年早い',desc:'植物が陸に上がり、根で岩を砕き始めるのが1億年早かったら。',type:'toggle'},
  {k:'siberia',A:2.52e8,title:'シベリア・トラップの噴火',desc:'史上最大の大量絶滅の引き金になった巨大噴火の強さを変える。',type:'select',opts:[[0,'起きない'],[1,'本来どおり'],[3,'3倍']]},
  {k:'noImpact',A:6.6e7,title:'小天体が地球をそれる',desc:'恐竜を絶滅させた小天体が、地球に当たらなかったら。',type:'toggle'},
  {k:'humanMul',A:276,title:'産業革命からの排出',desc:'化石燃料を燃やす量を変える（この先の排出シナリオにも掛かる）。',type:'select',opts:[[0,'なし'],[1,'本来どおり'],[2,'2倍']]},
  {k:'volcFuture',A:-1,title:'この先の火山活動',desc:'いまから先、火山が出す CO2 の量を変える。',type:'select',opts:[[1,'本来どおり'],[2,'2倍'],[.5,'半分']]},
];
const ifLabel=it=>it.type==='toggle'?it.title:`${it.title}: ${it.opts.find(o=>o[0]===IFX[it.k])[1]}`;
const ifChanged=()=>IF_LIST.filter(it=>IFX[it.k]!==IF_DEF[it.k]);
const ifStart=()=>Math.max(-Infinity,...ifChanged().map(it=>it.A));// the earliest intervention (largest age)

/* ---------------- people and industry in the what-if world */
// Rule (imagined, not modelled): without oxygen there are no animals at all; if the dinosaurs survive,
// large mammals stay rare and no human lineage appears.
function humansIn(){return !worldIF||!(IFX.oxy||IFX.noImpact)}
const ifCiv=A=>!worldIF?1:humansIn()?sstep(.05,.3,modelAt('O2',Math.max(A,-1e9))):0;
const ifIndustry=()=>worldIF&&IFX.humanMul===0?0:1;

/* ---------------- who lives there */
const HOMININ=new Set(['hom_early','australo','paranthropus','habilis','erectus','heidel','sapiens','person','cattle','canoe','plane','hut','fire','building','car','train']);
const BIG_MAMMAL=new Set(['elephant','antelope','giraffe','hippo','lion','gastornis','primate','ape','whale']);
const EARLY_LAND=new Set(['moss','cooksonia','fern','archaeopteris','lepido','treefern','millipede']);
const o2gate=x=>sstep(.05,.3,x);
function ifFactor(s,A){
  if(!worldIF||!MODEL_IF)return 1;
  if(HOMININ.has(s.k)&&!humansIn())return 0;
  const B=MODEL_BASE;let f=1;
  if(s.k!=='strom'){const gi=o2gate(modelAt('O2',A)),gb=Math.max(o2gate(modelAt('O2',A,B)),1e-3);f*=clamp(gi/gb,0,1)}// complex life needs oxygen (and its ozone shield)
  if(modelAt('snow',A)>.5&&modelAt('snow',A,B)<.5)f*=(s.hab==='sea'||s.hab==='bed'||s.hab==='shallow'||s.hab==='seabed')?.3:0;
  if(s.mv!=='st'){const dI=modelAt('D',A),dB=modelAt('D',A,B);if(dB>20)f*=clamp(dI/dB,0,1)}// fewer kinds of animals, fewer animals
  if(A>=0){const T=modelAt('T',A),TB=modelAt('T',A,B);if(T>45&&T>TB+3)f*=clamp(1-(T-45)/10,0,1)}
  if(IFX.noImpact&&A<6.6e7&&BIG_MAMMAL.has(s.k))f*=.25;
  return f;
}
// presence before the what-if factor: dinosaurs that never went extinct, plants that came ashore early
function ifPresenceBase(s,A){
  if(IFX.noImpact&&s.to===6.6e7&&A<6.6e7)return presenceRaw(s,6.61e7)*(A<0?futureFactor(s,-A):s.marine?sstep(1.2e7,1.6e7,A):1);
  if(IFX.plantsEarly&&EARLY_LAND.has(s.k)&&A>3e8&&A<6e8){const sh=1e8*sstep(3.0e8,3.6e8,A);return presenceRaw(s,A-sh)}
  return null;
}
const displayName=s=>worldIF&&IFX.noImpact&&s.to===6.6e7&&A<6.6e7?s.name.replace(/（.*/,'')+'（生き残り）':futureName(s);

/* ---------------- how the land and sky differ */
const IFC={orangeTop:new THREE.Color(0x6a5034),orangeHor:new THREE.Color(0xc08d58),orangeFog:new THREE.Color(0xa98060),ironSea:new THREE.Color(0x1d3e36),ironShal:new THREE.Color(0x58775a)};
function ifAdjustEnv(A){
  if(!worldIF||!MODEL_IF||A<0)return;// the future already reads the what-if model directly
  const e=E,B=MODEL_BASE;
  const sI=modelAt('snow',A)>.5,sB=modelAt('snow',A,B)>.5;
  if(sI&&!sB)e.ice=1;else if(sB&&!sI)e.ice=Math.min(e.ice,.1);
  const dT=modelAt('T',A)-modelAt('T',A,B);
  if(!sI){if(dT<0)e.ice=Math.max(e.ice,clamp(-dT/15,0,.8));else{e.ice*=clamp(1-dT/6,0,1);e.dry=clamp(e.dry+.03*dT,0,1)}}
  const g=clamp(o2gate(modelAt('O2',A))/Math.max(o2gate(modelAt('O2',A,B)),1e-3),0,1);
  e.veg*=g;e.grass*=g;
  const mI=modelAt('tM',A),mB=modelAt('tM',A,B);
  if(mI>mB+3){const h=clamp((mI-mB)/18,0,1);e.skyT.lerp(IFC.orangeTop,h);e.skyH.lerp(IFC.orangeHor,h);e.fogC.lerp(IFC.orangeFog,h);e.seaC.lerp(IFC.ironSea,h);e.seaS.lerp(IFC.ironShal,h);e.mats=Math.max(e.mats,.6*h)}
  if(IFX.plantsEarly&&A<5.7e8&&A>3.6e8){const k=sstep(5.7e8,5.2e8,A)*g;e.veg=Math.max(e.veg,lerp(.15,.55,sstep(5.2e8,4.6e8,A))*k);e.reach=Math.max(e.reach,lerp(.05,.45,sstep(5.2e8,4.6e8,A))*k)}
}

/* ---------------- events the what-if world produces (found by comparing the two models) */
function snowSpans(M){const out=[];let on=null;for(let i=0;i<M.N;i++){if(M.snow[i]&&on===null)on=M.A[i];if(!M.snow[i]&&on!==null){out.push([on,M.A[i]]);on=null}}return out}
function firstWhere(M,f){for(let i=0;i<M.N;i++)if(f(i))return M.A[i];return null}
function drops(M){// mass extinctions: diversity falls by 30%+ within 5 Myr
  const out=[];for(let i=0;i<M.N;i++){const a=M.A[i],d=M.D[i];if(d<30)continue;
    let mx=d;for(let j=i-1;j>=0&&M.A[j]<=a+5e6;j--)mx=Math.max(mx,M.D[j]);
    if(d<.7*mx&&!out.some(o=>Math.abs(o[0]-a)<1e7))out.push([a,1-d/mx])}
  return out;
}
const pct=v=>Math.round(v*100)+'%';
function deriveIfEvents(){
  const I=MODEL_IF,B=MODEL_BASE,ev=[];if(!I)return ev;
  for(const it of ifChanged())ev.push([it.A,'if','もしも: '+ifLabel(it),it.desc]);
  const sb=snowSpans(B),si=snowSpans(I),ov=(x,ys)=>ys.some(y=>x[0]>=y[1]&&x[1]<=y[0]);
  for(const s of sb)if(!ov(s,si))ev.push([s[0],'if','全球凍結が起きない','本来はここから全球凍結が始まった。この世界では気温が約'+Math.round(modelAt('T',s[0]-1e6,I))+'℃にとどまり、氷が広がりきらない。']);
  for(const s of si)if(!ov(s,sb))ev.push([s[0],'if','全球凍結（もしも）',`この世界では、ここで地球が凍りつく。約${jaNum(Math.round((s[0]-s[1])/1e5)*1e5)}年続く。`]);
  const goeB=firstWhere(B,i=>B.O2[i]>.005),goeI=firstWhere(I,i=>I.O2[i]>.005);
  if(goeB&&!goeI)ev.push([goeB,'if','大酸化イベントが起きない','酸素をつくる生物がいないので、大気に酸素がたまらない。メタンのもやが残り、空はオレンジがかったまま。オゾン層もできない。']);
  const anB=firstWhere(B,i=>B.D[i]>0),anI=firstWhere(I,i=>I.D[i]>0);
  if(anB&&!anI)ev.push([anB,'if','動物が現れない','酸素が足りず、体の大きな動物は生まれない。この先も、地球は微生物の星のまま。']);
  else if(anB&&anI&&Math.abs(anB-anI)>2e7)ev.push([anI,'if','動物の登場（もしも）',`本来より${jaNum(Math.round(Math.abs(anB-anI)/1e7)*1e7)}年${anI>anB?'早く':'遅れて'}、酸素が増えて動物が現れる。`]);
  const dB=drops(B),dI=drops(I),life=!!anI;// in a world without animals there is nothing to go extinct
  for(const d of dB)if(life&&!dI.some(x=>Math.abs(x[0]-d[0])<6e6))ev.push([d[0],'if','大量絶滅が起きない',`本来はここで海の動物の多様さが${pct(d[1])}減った。この世界では大きくは減らない。`]);
  for(const d of dI){const m=dB.find(x=>Math.abs(x[0]-d[0])<6e6);
    if(!m)ev.push([d[0],'if','大量絶滅（もしも）',`この世界では、ここで海の動物の多様さが${pct(d[1])}減る。`]);
    else if(Math.abs(d[1]-m[1])>.15)ev.push([d[0],'if',d[1]>m[1]?'大量絶滅がより大きく':'大量絶滅がより小さく',`海の動物の多様さが${pct(d[1])}減る（本来の世界では${pct(m[1])}）。`])}
  if(IFX.noImpact)ev.push([6.5e7,'if','恐竜の時代が続く（想像）','鳥以外の恐竜、翼竜、首長竜、アンモナイトが生き残る。大きな体の生き物の居場所は恐竜が持ち続け、哺乳類の多くは小さいまま（想像）。']);
  if(worldIF&&!humansIn()&&!IFX.oxy)ev.push([7e6,'if','人類は現れない（想像）','大きな哺乳類が広がらなかったこの世界では、霊長類から人類へ進む道すじはなかったと考える。この先の人と街は描かない。']);
  if(IFX.humanMul!==1){const t=modelAt('T',-74,I)-modelAt('T',176,I),tb=modelAt('T',-74,B)-modelAt('T',176,B);ev.push([-74.0001,'if','2100年（もしも）',`産業革命前より ${sgn(t)}℃（本来の世界では ${sgn(tb)}℃）。`])}
  const pB=firstWhere(B,i=>B.A[i]<0&&B.p3[i]<.5),pI=firstWhere(I,i=>I.A[i]<0&&I.p3[i]<.5);
  if(life&&pB&&pI&&Math.abs(pB-pI)>5e7)ev.push([pI,'if','植物の危機（もしも）',`本来より${jaNum(Math.round(Math.abs(pB-pI)/1e7)*1e7)}年${pI>pB?'早く':'遅く'}、CO2 が足りなくなって植物が育たなくなる。`]);
  return ev;
}
const EVENTS_BASE=EVENTS.slice();
function rebuildEvents(){
  // after the first intervention, the original timeline is shown only as what happened in the original world
  const st=ifStart(),orig=worldIF?EVENTS_BASE.map(e=>e[0]<st&&e[1]!=='future'?[e[0],e[1],e[2],'本来の世界では: '+e[3],true]:e):EVENTS_BASE;
  const list=worldIF?orig.concat(deriveIfEvents()):EVENTS_BASE.slice();
  list.sort((a,b)=>b[0]-a[0]);EVENTS.length=0;EVENTS.push(...list);lastEvIdx=-2;lastAnc=-2;
  renderIfSummary();
}

/* ---------------- the IF panel */
let IF_PENDING={...IF_IDEF()};
function IF_IDEF(){return {...IFX}}
function renderIfPanel(){
  $('ifList').innerHTML=IF_LIST.map(it=>{
    const when=it.A<0?'いまから':it.A<12000?'1750年〜':fmtShort(it.A);
    const ctl=it.type==='toggle'?`<input type="checkbox" id="if_${it.k}" ${IF_PENDING[it.k]?'checked':''}>`
      :`<select id="if_${it.k}">${it.opts.map(o=>`<option value="${o[0]}"${IF_PENDING[it.k]===o[0]?' selected':''}>${o[1]}</option>`).join('')}</select>`;
    return `<li><label for="if_${it.k}"><span class="ifw mono">${when}</span><b>${it.title}</b><small>${it.desc}</small></label>${ctl}</li>`}).join('');
  for(const it of IF_LIST){const el=$('if_'+it.k);el.onchange=()=>{IF_PENDING[it.k]=it.type==='toggle'?el.checked:+el.value;updateIfButtons()}}
  updateIfButtons();
}
function updateIfButtons(){
  const pendingDiff=Object.keys(IF_DEF).some(k=>IF_PENDING[k]!==IF_DEF[k]);
  $('ifApply').disabled=!pendingDiff;
  $('ifBase').disabled=!MODEL_IF;
  $('ifBase').textContent=worldIF?'本来の世界に戻る':'もしもの世界を見る';
  $('ifState').textContent=worldIF?'いま見ているのは「もしもの世界」':MODEL_IF?'いま見ているのは「本来の世界」（I キーで切り替え）':'まだ手を入れていない';
}
function applyIf(){
  IFX={...IF_PENDING};worldIF=ifActive();rebuildModel();computeFit();rebuildEvents();updateIfButtons();dirty=true;
  if(worldIF)toast('もしもの世界を計算しました（'+MODEL.ms+'ミリ秒）。最初に手を入れた時代へ移ります。'),goTo(ifStart()+1);
}
function setWorldIF(on){if(on&&!MODEL_IF)return;worldIF=on;MODEL=worldIF?MODEL_IF:MODEL_BASE;computeFit();rebuildEvents();updateIfButtons();dirty=true;document.body.classList.toggle('if-world',worldIF)}
function renderIfSummary(){
  const box=$('ifSum');if(!box)return;
  if(!MODEL_IF){box.innerHTML='';return}
  const ev=deriveIfEvents().filter(e=>!e[2].startsWith('もしも: ')).sort((a,b)=>b[0]-a[0]);
  box.innerHTML=ev.length?'<h4>この世界で起きること</h4><ul>'+ev.map(e=>`<li><button data-a="${e[0]}"><span class="mono">${fmtShort(e[0])}</span>${e[2]}</button></li>`).join('')+'</ul>':'<h4>この世界で起きること</h4><p>大きな違いは見つからなかった。「しくみ」パネルで数値の差を確かめられる。</p>';
}
$('ifSum').addEventListener('click',e=>{const b=e.target.closest('button[data-a]');if(!b)return;if(!worldIF)setWorldIF(true);goTo(+b.dataset.a)});
$('ifApply').onclick=applyIf;
$('ifBase').onclick=()=>setWorldIF(!worldIF);
$('ifReset').onclick=()=>{IF_PENDING={...IF_DEF};renderIfPanel()};
function setIfPanel(open){$('ifp').hidden=!open;$('bIf').setAttribute('aria-pressed',String(open));if(open){if(typeof setMech==='function'&&mechOpen)setMech(false);renderIfPanel();renderIfSummary()}}
$('bIf').onclick=()=>setIfPanel($('ifp').hidden);$('ifClose').onclick=()=>setIfPanel(false);
