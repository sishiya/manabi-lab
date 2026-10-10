'use strict';
// the future: forecast events, the landscape driven by the model, which life carries on, future readouts
/* Ages in the future are negative (A = −F). Everything here reads the model (model.js) plus a few
   scripted geological changes that the literature expects at this place (the Rift opening into a sea,
   the next supercontinent). People are not drawn more than a few thousand years ahead.            */

KIND.future=[L('予測','Forecast'),'var(--k-future)','#b9a6f2'];
EVENTS.push(
[-74,'future',L('2100年','2100'),L('排出シナリオによって、産業革命前より約1.4〜4.4℃高くなる（IPCC 第6次評価報告書）。海面は約0.3〜1m上がる。下の「排出シナリオ」で切り替えられる。','Depending on the emission scenario, about 1.4 to 4.4 ℃ warmer than before the Industrial Revolution (IPCC Sixth Assessment Report). Sea level rises about 0.3 to 1 m. Switch scenarios with the “Emissions” menu below.')],
[-274,'future',L('2300年','2300'),L('排出を止めても、海の深いところが温まり氷床がとけるので、海面は何百年も上がり続ける。高排出なら数mに達するおそれがある。','Even after emissions stop, the deep sea keeps warming and ice sheets keep melting, so sea level goes on rising for hundreds of years. With high emissions it could reach several meters.')],
[-3000,'future',L('人間が出した CO2 のゆくえ','Where human CO2 goes'),L('大部分は数百〜数千年で海に溶けこむが、2〜3割は数万年以上大気に残る。最後は岩石の風化がゆっくり取り除く（10万年以上）。この画面では、この先の人間と街は描かない（予測できないため）。','Most of it dissolves into the sea over hundreds to thousands of years, but 20 to 30% stays in the air for tens of thousands of years or more. In the end, rock weathering slowly removes it (over 100,000 years). People and towns beyond this point are not drawn (they cannot be predicted).')],
[-5e4,'future',L('次の氷期は来るか','Will the next ice age come?'),L('地球の軌道だけなら、次の氷期は約5万年後か10万年後に来るはずだった。人間が出した CO2 が多いと、次の氷期は大きく遅れるか、来ない。','From Earth’s orbit alone, the next ice age would have come in about 50,000 or 100,000 years. With a lot of human CO2, it will be greatly delayed or may not come at all.')],
[-5e6,'future',L('アフリカが割れて新しい海','Africa splits and a new sea forms'),L('大地溝帯の割れ目が広がり、やがて海水が入りこんで新しい海ができると考えられている（約500万〜1000万年後）。この湖のほとりは海辺になる。','The Rift Valley is expected to widen until seawater flows in and makes a new sea (in about 5 to 10 million years). This lakeshore becomes a seashore.')],
[-5e7,'future',L('地中海が閉じる','The Mediterranean closes'),L('アフリカが北へ進んでヨーロッパにぶつかり、地中海は消えて大きな山脈ができる。','Africa moves north and collides with Europe; the Mediterranean disappears and a great mountain range forms.')],
[-2.5e8,'future',L('次の超大陸','The next supercontinent'),L('大陸がふたたび一つに集まる（パンゲア・ウルティマ、アメイジアなどの説）。内陸は暑く乾き、哺乳類には厳しい環境になるという研究もある。','The continents come together into one again (ideas include Pangaea Ultima and Amasia). The interior becomes hot and dry, and one study says it would be a harsh place for mammals.')],
[-6e8,'future',L('植物の危機','Plants in crisis'),L('太陽が明るくなるにつれて岩石の風化が進み、CO2 が減っていく。CO2 が150ppmを下回ると、多くの植物が光合成できなくなる。月が遠ざかって、皆既日食も見られなくなる。','As the Sun brightens, rock weathering speeds up and CO2 falls. Below 150 ppm of CO2, many plants can no longer photosynthesize. The Moon moves away, and total solar eclipses can no longer be seen.')],
[-1.08e9,'future',L('酸素が消えていく','Oxygen disappears'),L('光合成が衰えると、大気の酸素は急に減ると予測されている（約10億年後）。動物のような複雑な生き物は暮らせなくなる。','As photosynthesis fades, oxygen in the air is expected to drop sharply (in about 1 billion years). Complex life such as animals can no longer live.')],
[-1.5e9,'future',L('海が消えていく','The oceans disappear'),L('気温が上がると水蒸気が上空まで届き、分解されて宇宙へ逃げていく。海はしだいに干上がる（10億〜20億年後）。','As it gets hotter, water vapor reaches high into the sky, breaks apart and escapes to space. The oceans slowly dry up (in 1 to 2 billion years).')],
[-3e9,'future',L('微生物の最後','The last microbes'),L('地表は数百℃になり、地下深くの微生物も暮らせなくなる。','The surface reaches several hundred ℃, and even microbes deep underground can no longer live.')],
[-5e9,'future',L('太陽の老い','The Sun grows old'),L('太陽は中心の水素を使い果たし、赤色巨星へと膨らみ始める。約76億年後、地球はのみこまれるかもしれない。','The Sun uses up the hydrogen in its core and begins to swell into a red giant. In about 7.6 billion years, Earth may be swallowed.')],
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
const futureName=s=>A<-3e6&&s.to===0&&!s.human&&!HUMAN_KEYS.has(s.k)?L(s.name.replace(/（.*/,'')+'の子孫',s.name.replace(/ \(.*/,'')+' descendants'):s.name;

/* readouts panel in the future: everything comes from the model */
function futureRows(rows){
  const T=modelAt('T',A),C=modelAt('C',A),O2=modelAt('O2',A)*21,F=-A,fut=A<0;// also used for the past of a what-if world
  const ab=L('約','about ');
  rows.push([L('酸素','Oxygen'),O2<.05?L('ほぼ 0%','almost 0%'):ab+fmtNum(O2,O2<3?1:0)+'%']);
  rows.push([L('二酸化炭素','Carbon dioxide'),C>=1e4?ab+fmtNum(C/1e4,1)+'%':C<10?ab+fmtNum(C,1)+' ppm':ab+fmtNum(C)+' ppm']);
  rows.push([L('平均気温','Average temperature'),ab+fmtNum(T)+'℃'+(fut&&F<1e4?`<small style="color:var(--dim)">${L(`（産業革命前${sgn(T-modelAt('T',176))}℃）`,` (${sgn(T-modelAt('T',176))}℃ vs. pre-industrial)`)}</small>`:'')]);
  if(!fut){rows.push([L('1日の長さ','Length of a day'),ab+fmtNum(rt('day',A),A<1e8?1:0)+L('時間',' hours')],[L('太陽の明るさ','Brightness of the Sun'),fmtNum(solarLum(A)*100)+'%']);return}
  if(F<1e5)rows.push([L('海面の上昇','Sea-level rise'),ab+fmtNum(Math.max(0,modelAt('SL',A)),1)+' m']);
  else rows.push([L('海の残り','Ocean left'),fmtNum(modelAt('ocean',A)*100)+'%']);
  if(F>=1e5)rows.push([L('植物','Plants'),T>50?L('暑すぎて育たない','too hot to grow'):modelAt('p3',A)>.5?L('CO2 は足りている','enough CO2'):modelAt('p4',A)>.3?L('CO2 不足（草だけが育つ）','low CO2 (only grasses grow)'):L('CO2 不足で育たない','too little CO2 to grow')]);
  rows.push([L('1日の長さ','Length of a day'),ab+fmtNum(rt('day',A),1)+L('時間',' hours')]);
  rows.push([L('太陽の明るさ','Brightness of the Sun'),fmtNum(solarLum(A)*100)+'%']);
  rows.push([L('月までの距離','Distance to the Moon'),ab+fmtNum(Math.round(rt('moon',A)/1000)*1000)+' km']);
  const p=rt('pop',A);if(isFinite(p))rows.push([L('世界の人口','World population'),L(`約${fmtNum(p/1e8,0)}億人`,`about ${fmtNum(p/1e9,1)} billion`)+'<small style="color:var(--dim)">'+L('（SSP）',' (SSP)')+'</small>']);
}
/* emission scenario selector */
{const sel=$('scen');sel.innerHTML=Object.entries(SCENARIOS).map(([k,v])=>`<option value="${k}"${k===SCENARIO?' selected':''}>${L('排出: ','Emissions: ')}${v.name}</option>`).join('');
 sel.onchange=()=>{SCENARIO=sel.value;rebuildModel();if(typeof computeFit==='function')computeFit();lastEvIdx=-2;lastAnc=-2;dirty=true}}

/* literature forecasts drawn on the mechanism chart: the 2100 point follows the chosen scenario */
function litMarks(){const Tp=modelAt('T',176),r=AR6_2100[SCENARIO];return [[-74,'T',Tp+r[0],Tp+r[1],Tp+r[2]],...LIT.filter(l=>l[2]!=null)]}

/* age formatting for the future */
function fmtFuture(F,short){
  if(F<.5)return L('現在','Now');
  if(F<1e4)return L('西暦'+Math.round(YEAR_NOW+F)+'年','AD '+Math.round(YEAR_NOW+F));
  if(F>=1e9){const v=(Math.round(F/1e7)/10).toFixed(1).replace(/\.0$/,'');return L(v+'億年後',(v/10)+' billion years from now')}
  const r=short?(F>=1e8?1e7:F>=1e6?1e5:F>=1e4?1e3:100):(F>=1e8?1e6:F>=1e7?1e5:F>=1e6?1e4:F>=1e5?1e3:100);
  return jaNum(Math.round(F/r)*r)+L('年後',' years from now');
}
