'use strict';
// "what if": the interventions, how the alternate world looks and who lives in it, the events it produces, the IF panel
/* The original world (MODEL_BASE) is always kept. With interventions, MODEL_IF is computed alongside, and
   worldIF says which one is on screen. The record still draws the past; in the what-if world the
   landscape and life are pushed by the DIFFERENCE between the two models (ifAdjustEnv / ifFactor).
   A few things the model cannot know (who evolves) follow simple stated rules and are marked as imagined. */

KIND.if=[L('もしも','What if'),'var(--k-if)','#5fd0c4'];
const IF_LIST=[
  {k:'oxy',A:2.7e9,title:L('酸素をつくる生物が現れない','No oxygen-making life appears'),desc:L('シアノバクテリアが、水を分解して酸素を出す光合成を始めなかったら。','What if cyanobacteria had never started photosynthesis that splits water and gives off oxygen?'),type:'toggle'},
  {k:'rodinia',A:7.5e8,title:L('超大陸ロディニアが割れない','The supercontinent Rodinia does not break up'),desc:L('赤道近くで大陸が割れ、溶岩の大地が風化して CO2 を吸い取る、ということが起きなかったら。','What if the continent had not split near the equator, so lava plains never weathered and soaked up CO2?'),type:'toggle'},
  {k:'plantsEarly',A:5.7e8,title:L('植物の上陸が1億年早い','Plants reach land 100 million years earlier'),desc:L('植物が陸に上がり、根で岩を砕き始めるのが1億年早かったら。','What if plants had moved onto land and started breaking rocks with their roots 100 million years earlier?'),type:'toggle'},
  {k:'siberia',A:2.52e8,title:L('シベリア・トラップの噴火','Eruption of the Siberian Traps'),desc:L('史上最大の大量絶滅の引き金になった巨大噴火の強さを変える。','Change the strength of the huge eruption that set off the largest mass extinction ever.'),type:'select',opts:[[0,L('起きない','none')],[1,L('本来どおり','as it was')],[3,L('3倍','3×')]]},
  {k:'noImpact',A:6.6e7,title:L('小天体が地球をそれる','The asteroid misses Earth'),desc:L('恐竜を絶滅させた小天体が、地球に当たらなかったら。','What if the asteroid that wiped out the dinosaurs had missed Earth?'),type:'toggle'},
  {k:'humanMul',A:276,title:L('産業革命からの排出','Emissions since the Industrial Revolution'),desc:L('化石燃料を燃やす量を変える（この先の排出シナリオにも掛かる）。','Change how much fossil fuel is burned (also applies to the future emission scenario).'),type:'select',opts:[[0,L('なし','none')],[1,L('本来どおり','as it was')],[2,L('2倍','2×')]]},
  {k:'volcFuture',A:-1,title:L('この先の火山活動','Volcanoes from now on'),desc:L('いまから先、火山が出す CO2 の量を変える。','Change how much CO2 volcanoes give off from now on.'),type:'select',opts:[[1,L('本来どおり','as it was')],[2,L('2倍','2×')],[.5,L('半分','half')]]},
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
const displayName=s=>worldIF&&IFX.noImpact&&s.to===6.6e7&&A<6.6e7?L(s.name.replace(/（.*/,'')+'（生き残り）',s.name.replace(/ \(.*/,'')+' (survivors)'):futureName(s);

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
  for(const it of ifChanged())ev.push([it.A,'if',L('もしも: ','What if: ')+ifLabel(it),it.desc,undefined,'pick']);
  const sb=snowSpans(B),si=snowSpans(I),ov=(x,ys)=>ys.some(y=>x[0]>=y[1]&&x[1]<=y[0]);
  for(const s of sb)if(!ov(s,si))ev.push([s[0],'if',L('全球凍結が起きない','No snowball Earth'),L('本来はここから全球凍結が始まった。この世界では気温が約'+Math.round(modelAt('T',s[0]-1e6,I))+'℃にとどまり、氷が広がりきらない。','In the original world, a snowball Earth began here. In this world the temperature stays at about '+Math.round(modelAt('T',s[0]-1e6,I))+'℃ and the ice does not spread all the way.')]);
  for(const s of si)if(!ov(s,sb))ev.push([s[0],'if',L('全球凍結（もしも）','Snowball Earth (what if)'),L(`この世界では、ここで地球が凍りつく。約${jaNum(Math.round((s[0]-s[1])/1e5)*1e5)}年続く。`,`In this world, Earth freezes over here. It lasts about ${jaNum(Math.round((s[0]-s[1])/1e5)*1e5)} years.`)]);
  const goeB=firstWhere(B,i=>B.O2[i]>.005),goeI=firstWhere(I,i=>I.O2[i]>.005);
  if(goeB&&!goeI)ev.push([goeB,'if',L('大酸化イベントが起きない','No Great Oxidation Event'),L('酸素をつくる生物がいないので、大気に酸素がたまらない。メタンのもやが残り、空はオレンジがかったまま。オゾン層もできない。','With no oxygen-making life, oxygen never builds up in the air. The methane haze stays, the sky remains orange-tinted, and no ozone layer forms.')]);
  const anB=firstWhere(B,i=>B.D[i]>0),anI=firstWhere(I,i=>I.D[i]>0);
  if(anB&&!anI)ev.push([anB,'if',L('動物が現れない','No animals appear'),L('酸素が足りず、体の大きな動物は生まれない。この先も、地球は微生物の星のまま。','There is too little oxygen, so large animals never evolve. Earth stays a planet of microbes.')]);
  else if(anB&&anI&&Math.abs(anB-anI)>2e7)ev.push([anI,'if',L('動物の登場（もしも）','Animals appear (what if)'),L(`本来より${jaNum(Math.round(Math.abs(anB-anI)/1e7)*1e7)}年${anI>anB?'早く':'遅れて'}、酸素が増えて動物が現れる。`,`Oxygen rises and animals appear ${jaNum(Math.round(Math.abs(anB-anI)/1e7)*1e7)} years ${anI>anB?'earlier':'later'} than in the original world.`)]);
  const dB=drops(B),dI=drops(I),life=!!anI;// in a world without animals there is nothing to go extinct
  for(const d of dB)if(life&&!dI.some(x=>Math.abs(x[0]-d[0])<6e6))ev.push([d[0],'if',L('大量絶滅が起きない','No mass extinction'),L(`本来はここで海の動物の多様さが${pct(d[1])}減った。この世界では大きくは減らない。`,`In the original world, the variety of sea animals fell by ${pct(d[1])} here. In this world it does not fall much.`)]);
  for(const d of dI){const m=dB.find(x=>Math.abs(x[0]-d[0])<6e6);
    if(!m)ev.push([d[0],'if',L('大量絶滅（もしも）','Mass extinction (what if)'),L(`この世界では、ここで海の動物の多様さが${pct(d[1])}減る。`,`In this world, the variety of sea animals falls by ${pct(d[1])} here.`)]);
    else if(Math.abs(d[1]-m[1])>.15)ev.push([d[0],'if',d[1]>m[1]?L('大量絶滅がより大きく','A bigger mass extinction'):L('大量絶滅がより小さく','A smaller mass extinction'),L(`海の動物の多様さが${pct(d[1])}減る（本来の世界では${pct(m[1])}）。`,`The variety of sea animals falls by ${pct(d[1])} (${pct(m[1])} in the original world).`)])}
  if(IFX.noImpact)ev.push([6.5e7,'if',L('恐竜の時代が続く（想像）','The age of dinosaurs goes on (imagined)'),L('鳥以外の恐竜、翼竜、首長竜、アンモナイトが生き残る。大きな体の生き物の居場所は恐竜が持ち続け、哺乳類の多くは小さいまま（想像）。','Non-bird dinosaurs, pterosaurs, plesiosaurs and ammonites survive. Dinosaurs keep the places for big-bodied animals, and most mammals stay small (imagined).')]);
  if(worldIF&&!humansIn()&&!IFX.oxy)ev.push([7e6,'if',L('人類は現れない（想像）','Humans never appear (imagined)'),L('大きな哺乳類が広がらなかったこの世界では、霊長類から人類へ進む道すじはなかったと考える。この先の人と街は描かない。','In this world where large mammals never spread, we assume there was no path from primates to humans. People and towns are not drawn from here on.')]);
  if(IFX.humanMul!==1){const t=modelAt('T',-74,I)-modelAt('T',176,I),tb=modelAt('T',-74,B)-modelAt('T',176,B);ev.push([-74.0001,'if',L('2100年（もしも）','2100 (what if)'),L(`産業革命前より ${sgn(t)}℃（本来の世界では ${sgn(tb)}℃）。`,`${sgn(t)}℃ compared with before the Industrial Revolution (${sgn(tb)}℃ in the original world).`)])}
  const pB=firstWhere(B,i=>B.A[i]<0&&B.p3[i]<.5),pI=firstWhere(I,i=>I.A[i]<0&&I.p3[i]<.5);
  if(life&&pB&&pI&&Math.abs(pB-pI)>5e7)ev.push([pI,'if',L('植物の危機（もしも）','Plants in crisis (what if)'),L(`本来より${jaNum(Math.round(Math.abs(pB-pI)/1e7)*1e7)}年${pI>pB?'早く':'遅く'}、CO2 が足りなくなって植物が育たなくなる。`,`CO2 runs short and plants stop growing ${jaNum(Math.round(Math.abs(pB-pI)/1e7)*1e7)} years ${pI>pB?'earlier':'later'} than in the original world.`)]);
  return ev;
}
const EVENTS_BASE=EVENTS.slice();
function rebuildEvents(){
  // after the first intervention, the original timeline is shown only as what happened in the original world
  const st=ifStart(),orig=worldIF?EVENTS_BASE.map(e=>e[0]<st&&e[1]!=='future'?[e[0],e[1],e[2],L('本来の世界では: ','In the original world: ')+e[3],true]:e):EVENTS_BASE;
  const list=worldIF?orig.concat(deriveIfEvents()):EVENTS_BASE.slice();
  list.sort((a,b)=>b[0]-a[0]);EVENTS.length=0;EVENTS.push(...list);lastEvIdx=-2;lastAnc=-2;
  renderIfSummary();
}

/* ---------------- the IF panel */
let IF_PENDING={...IF_IDEF()};
function IF_IDEF(){return {...IFX}}
function renderIfPanel(){
  $('ifList').innerHTML=IF_LIST.map(it=>{
    const when=it.A<0?L('いまから','from now'):it.A<12000?L('1750年〜','1750 on'):fmtShort(it.A);
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
  $('ifBase').textContent=worldIF?L('本来の世界に戻る','Back to the original world'):L('もしもの世界を見る','View the what-if world');
  $('ifState').textContent=worldIF?L('いま見ているのは「もしもの世界」','You are viewing the “what-if world”'):MODEL_IF?L('いま見ているのは「本来の世界」（I キーで切り替え）','You are viewing the “original world” (switch with the I key)'):L('まだ手を入れていない','Nothing changed yet');
}
function applyIf(){
  IFX={...IF_PENDING};worldIF=ifActive();rebuildModel();computeFit();rebuildEvents();updateIfButtons();dirty=true;
  if(worldIF)toast(L('もしもの世界を計算しました（'+MODEL.ms+'ミリ秒）。最初に手を入れた時代へ移ります。','Calculated the what-if world ('+MODEL.ms+' ms). Moving to the age of your first change.')),goTo(ifStart()+1);
}
function setWorldIF(on){if(on&&!MODEL_IF)return;worldIF=on;MODEL=worldIF?MODEL_IF:MODEL_BASE;computeFit();rebuildEvents();updateIfButtons();dirty=true;document.body.classList.toggle('if-world',worldIF)}
function renderIfSummary(){
  const box=$('ifSum');if(!box)return;
  if(!MODEL_IF){box.innerHTML='';return}
  const ev=deriveIfEvents().filter(e=>e[5]!=='pick').sort((a,b)=>b[0]-a[0]);
  const h4=`<h4>${L('この世界で起きること','What happens in this world')}</h4>`;
  box.innerHTML=ev.length?h4+'<ul>'+ev.map(e=>`<li><button data-a="${e[0]}"><span class="mono">${fmtShort(e[0])}</span>${e[2]}</button></li>`).join('')+'</ul>':h4+`<p>${L('大きな違いは見つからなかった。「しくみ」パネルで数値の差を確かめられる。','No big differences were found. Check the numbers in the “How it works” panel.')}</p>`;
}
$('ifSum').addEventListener('click',e=>{const b=e.target.closest('button[data-a]');if(!b)return;if(!worldIF)setWorldIF(true);goTo(+b.dataset.a)});
$('ifApply').onclick=applyIf;
$('ifBase').onclick=()=>setWorldIF(!worldIF);
$('ifReset').onclick=()=>{IF_PENDING={...IF_DEF};renderIfPanel()};
function setIfPanel(open){$('ifp').hidden=!open;$('bIf').setAttribute('aria-pressed',String(open));if(open){if(typeof setMech==='function'&&mechOpen)setMech(false);renderIfPanel();renderIfSummary()}}
$('bIf').onclick=()=>setIfPanel($('ifp').hidden);$('ifClose').onclick=()=>setIfPanel(false);
