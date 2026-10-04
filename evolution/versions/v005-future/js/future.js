'use strict';
// the future: forecast events, the landscape driven by the model, which life carries on, future readouts
/* Ages in the future are negative (A = −F). Everything here reads the model (model.js) plus a few
   scripted geological changes that the literature expects at this place (the Rift opening into a sea,
   the next supercontinent). People are not drawn more than a few thousand years ahead.            */

KIND.future=['予測','var(--k-future)','#b9a6f2'];
EVENTS.push(
[-74,'future','2100年','排出シナリオによって、産業革命前より約1.4〜4.4℃高くなる（IPCC 第6次評価報告書）。海面は約0.3〜1m上がる。下の「排出シナリオ」で切り替えられる。'],
[-274,'future','2300年','排出を止めても、海の深いところが温まり氷床がとけるので、海面は何百年も上がり続ける。高排出なら数mに達するおそれがある。'],
[-3000,'future','人間が出した CO2 のゆくえ','大部分は数百〜数千年で海に溶けこむが、2〜3割は数万年以上大気に残る。最後は岩石の風化がゆっくり取り除く（10万年以上）。この画面では、この先の人間と街は描かない（予測できないため）。'],
[-5e4,'future','次の氷期は来るか','地球の軌道だけなら、次の氷期は約5万年後か10万年後に来るはずだった。人間が出した CO2 が多いと、次の氷期は大きく遅れるか、来ない。'],
[-5e6,'future','アフリカが割れて新しい海','大地溝帯の割れ目が広がり、やがて海水が入りこんで新しい海ができると考えられている（約500万〜1000万年後）。この湖のほとりは海辺になる。'],
[-5e7,'future','地中海が閉じる','アフリカが北へ進んでヨーロッパにぶつかり、地中海は消えて大きな山脈ができる。'],
[-2.5e8,'future','次の超大陸','大陸がふたたび一つに集まる（パンゲア・ウルティマ、アメイジアなどの説）。内陸は暑く乾き、哺乳類には厳しい環境になるという研究もある。'],
[-6e8,'future','植物の危機','太陽が明るくなるにつれて岩石の風化が進み、CO2 が減っていく。CO2 が150ppmを下回ると、多くの植物が光合成できなくなる。月が遠ざかって、皆既日食も見られなくなる。'],
[-1.08e9,'future','酸素が消えていく','光合成が衰えると、大気の酸素は急に減ると予測されている（約10億年後）。動物のような複雑な生き物は暮らせなくなる。'],
[-1.5e9,'future','海が消えていく','気温が上がると水蒸気が上空まで届き、分解されて宇宙へ逃げていく。海はしだいに干上がる（10億〜20億年後）。'],
[-3e9,'future','微生物の最後','地表は数百℃になり、地下深くの微生物も暮らせなくなる。'],
[-5e9,'future','太陽の老い','太陽は中心の水素を使い果たし、赤色巨星へと膨らみ始める。約76億年後、地球はのみこまれるかもしれない。'],
);

// future readouts that the record cannot give
const RT_FUTURE={
  day:F=>24+4.5*F/1e9,            // tidal braking, roughly 1.7 ms per century
  moon:F=>384400+3.8e-5*F,        // the Moon recedes about 3.8 cm a year
  land:()=>.29,
  pop:F=>{if(F>74)return NaN;const end={low:7.0e9,mid:9.0e9,high:7.4e9,zero:9.0e9}[SCENARIO];return lerp(8.2e9,end,F/74)},
};
const humanFade=A=>A>=0?1:1-sstep(1000,4000,-A);

/* landscape: scripted geology + the model's climate, life and oceans */
const FC={barren:new THREE.Color(0x8a5a3a),haze:new THREE.Color(0xdcd6cc),dust:new THREE.Color(0xb08860),dustTop:new THREE.Color(0x8a6a50),white:new THREE.Color(0xfff6e8),
  red:new THREE.Color(0xff7040),paleTop:new THREE.Color(0x9ab8d8),crust:new THREE.Color(0x3a2a22)};
function futureEnv(F){
  const A=-F,e=E,T=modelAt('T',A),dT=T-modelAt('T',0),p3=modelAt('p3',A),p4=modelAt('p4',A),ocean=modelAt('ocean',A),S=solarLum(A);
  // geology at this spot
  const seaArm=sstep(3e6,9e6,F)*(1-sstep(1.6e8,2.4e8,F)),superC=sstep(1.6e8,2.5e8,F)*(1-sstep(3.5e8,4.5e8,F));
  e.rift=1+.6*seaArm;e.shift=12-15*seaArm+5*superC;e.relief=1+.35*superC;e.coastW=.05+.4*superC;
  // life on land follows what photosynthesis can still do; heat dries things out
  const hot=1-sstep(5,22,dT);
  e.veg*=p3*hot;e.grass=Math.max(e.grass*Math.max(p4,.3*p3)*(1-sstep(10,28,dT)),0);
  e.dry=clamp(e.dry+.04*Math.max(0,dT)+.6*(1-Math.max(p3,p4))+.45*superC,0,1);
  e.rockC.lerp(FC.barren,clamp(1-Math.max(p3,p4),0,1)*.7);
  e.sea=ocean;e.ice=0;e.stars=0;
  // sky: a brighter Sun, then steam, then a dry hot haze, then the swelling red Sun
  const bright=sstep(1.08,1.3,S);e.skyT.lerp(FC.paleTop,bright*.6);e.sunC.lerp(FC.white,bright);
  const steam=sstep(45,70,T)*sstep(0,.3,ocean);e.skyH.lerp(FC.haze,steam);e.fogC.lerp(FC.haze,steam);e.cloud=Math.max(e.cloud,steam);e.cloudC.lerp(FC.haze,steam);e.fogD=Math.max(e.fogD,.004*steam);
  const dust=sstep(80,200,T)*(1-sstep(0,.3,ocean));e.skyT.lerp(FC.dustTop,dust);e.skyH.lerp(FC.dust,dust);e.fogC.lerp(FC.dust,dust);e.fogD=Math.max(e.fogD,.003*dust);e.cloud*=1-dust;
  const giant=sstep(3.8e9,5e9,F);e.sunC.lerp(FC.red,giant);e.skyH.lerp(FC.red,giant*.4);e.sunI*=1+.4*giant;
  e.lava=sstep(500,1300,T)*.7;e.rockC.lerp(FC.crust,sstep(300,700,T));
  return e;
}

/* which of today's living things carry on */
const HUMAN_KEYS=new Set(['person','cattle','canoe','plane','hut','fire','building','car','train']);
const BIG_WILD=new Set(['elephant','antelope','giraffe','hippo','lion','croc']);
function futureFactor(s,F){
  const A=-F;
  if(s.human||HUMAN_KEYS.has(s.k))return humanFade(A);
  const T=modelAt('T',A),p3=modelAt('p3',A),p4=modelAt('p4',A),ocean=modelAt('ocean',A),O2=modelAt('O2',A);
  const bearable=1-sstep(40,50,T),air=sstep(.05,.3,O2);
  if(s.mv==='st'){
    if(s.hab==='shallow'||s.hab==='seabed')return ocean*(1-sstep(60,80,T));
    if(s.grassy)return Math.max(p4,.3*p3)*bearable;
    if(s.k==='moss')return Math.max(p3,.6*p4)*bearable;
    return p3*bearable;
  }
  const sea=s.hab==='sea'||s.hab==='bed'||s.hab==='surf';
  let f=(sea?ocean:Math.max(p3,p4))*bearable*air;
  if(s.marine)f*=sstep(3e6,8e6,F);// the new sea arm brings ocean life back
  return f;
}
// beyond a few million years today's species will have changed shape; we still draw today's shapes
const futureName=s=>A<-3e6&&s.to===0&&!s.human&&!HUMAN_KEYS.has(s.k)?s.name.replace(/（.*/,'')+'の子孫':s.name;

/* readouts panel in the future: everything comes from the model */
function futureRows(rows){
  const T=modelAt('T',A),C=modelAt('C',A),O2=modelAt('O2',A)*21,F=-A;
  rows.push(['酸素',O2<.05?'ほぼ 0%':'約'+fmtNum(O2,O2<3?1:0)+'%']);
  rows.push(['二酸化炭素',C>=1e4?'約'+fmtNum(C/1e4,1)+'%':C<10?'約'+fmtNum(C,1)+' ppm':'約'+fmtNum(C)+' ppm']);
  rows.push(['平均気温','約'+fmtNum(T)+'℃'+(F<1e4?`<small style="color:var(--dim)">（産業革命前${sgn(T-modelAt('T',176))}℃）</small>`:'')]);
  if(F<1e5)rows.push(['海面の上昇','約'+fmtNum(Math.max(0,modelAt('SL',A)),1)+' m']);
  else rows.push(['海の残り',fmtNum(modelAt('ocean',A)*100)+'%']);
  if(F>=1e5)rows.push(['植物',T>50?'暑すぎて育たない':modelAt('p3',A)>.5?'CO2 は足りている':modelAt('p4',A)>.3?'CO2 不足（草だけが育つ）':'CO2 不足で育たない']);
  rows.push(['1日の長さ','約'+fmtNum(rt('day',A),1)+'時間']);
  rows.push(['太陽の明るさ',fmtNum(solarLum(A)*100)+'%']);
  rows.push(['月までの距離','約'+fmtNum(Math.round(rt('moon',A)/1000)*1000)+' km']);
  const p=rt('pop',A);if(isFinite(p))rows.push(['世界の人口',`約${fmtNum(p/1e8,0)}億人<small style="color:var(--dim)">（SSP）</small>`]);
}
/* emission scenario selector */
{const sel=$('scen');sel.innerHTML=Object.entries(SCENARIOS).map(([k,v])=>`<option value="${k}"${k===SCENARIO?' selected':''}>排出: ${v.name}</option>`).join('');
 sel.onchange=()=>{SCENARIO=sel.value;rebuildModel();if(typeof computeFit==='function')computeFit();lastEvIdx=-2;lastAnc=-2;dirty=true}}

/* literature forecasts drawn on the mechanism chart: the 2100 point follows the chosen scenario */
function litMarks(){const Tp=modelAt('T',176),r=AR6_2100[SCENARIO];return [[-74,'T',Tp+r[0],Tp+r[1],Tp+r[2]],...LIT.filter(l=>l[2]!=null)]}

/* age formatting for the future */
function fmtFuture(F,short){
  if(F<.5)return '現在';
  if(F<1e4)return '西暦'+Math.round(YEAR_NOW+F)+'年';
  if(F>=1e9)return (Math.round(F/1e7)/10).toFixed(1).replace(/\.0$/,'')+'億年後';
  const r=short?(F>=1e8?1e7:F>=1e6?1e5:F>=1e4?1e3:100):(F>=1e8?1e6:F>=1e7?1e5:F>=1e6?1e4:F>=1e5?1e3:100);
  return jaNum(Math.round(F/r)*r)+'年後';
}
