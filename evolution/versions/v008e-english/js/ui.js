'use strict';
// HUD, timeline, mechanism panel
/* ------------------------------------------------------------------ HUD */
const MONTHS=[31,28,31,30,31,30,31,31,30,31,30,31];
function jaNum(n){n=Math.round(n);if(LANG==='en')return enNum(n);const oku=Math.floor(n/1e8),man=Math.floor(n%1e8/1e4),rest=n%1e4;let s='';if(oku)s+=oku+'億';if(man)s+=man+'万';if(rest)s+=rest;return s||'0'}
// English: 4.6 billion, 66 million, 11,700 (I18N.md)
function enNum(n){const t=(v,u)=>String(+v.toFixed(2))+u;return n>=1e9?t(n/1e9,' billion'):n>=1e6?t(n/1e6,' million'):n.toLocaleString('en-US')}
const MON_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtAge(A){
  if(A<0)return fmtFuture(-A,false);
  if(A<.5)return L('現在','Now');
  if(A<12000){const y=Math.round(2026-A);return y>0?L('西暦'+y+'年','AD '+y):L('紀元前'+(1-y)+'年',(1-y)+' BC')}
  if(A>=1e9){const v=(Math.round(A/1e7)/10).toFixed(1).replace(/\.0$/,'');return L(v+'億年前',(v/10)+' billion years ago')}
  const r=A>=1e8?1e6:A>=1e7?1e5:A>=1e6?1e4:A>=1e5?1e3:100;
  return jaNum(Math.round(A/r)*r)+L('年前',' years ago');
}
function fmtShort(A){if(A<=-.5)return fmtFuture(-A,true);if(A<1)return L('現在','Now');if(A<12000)return fmtAge(A);const r=A>=1e8?1e7:A>=1e6?1e5:A>=1e4?1e3:100;return jaNum(Math.round(A/r)*r)+L('年前',' years ago')}
function calendar(A){
  if(A<0){const f=-A/AMAX,yr=Math.floor(f)+2,dd=(f%1)*365,s=dd*86400;let d=Math.floor(dd),mo=0;while(d>=MONTHS[mo]){d-=MONTHS[mo];mo++}
    const p=n=>String(Math.floor(n)).padStart(2,'0');return L(`${yr}年目の${mo+1}月${d+1}日`,`Year ${yr}, ${MON_EN[mo]} ${d+1}`)+(f<1/365?` ${p(s/3600)}:${p(s%3600/60)}:${p(s%60)}`:'')}
  const f=clamp(1-A/AMAX,0,1);let sec=f*365*86400;if(f>=1)return L('12月31日 24:00:00','Dec 31 24:00:00');
  let d=Math.floor(sec/86400),rem=sec-d*86400,mo=0;while(d>=MONTHS[mo]){d-=MONTHS[mo];mo++}
  const p=n=>String(Math.floor(n)).padStart(2,'0');
  return L(`${mo+1}月${d+1}日`,`${MON_EN[mo]} ${d+1}`)+` ${p(rem/3600)}:${p(rem%3600/60)}:${p(rem%60)}`;
}
function geoAt(A,level){for(const g of GEO)if(g[0]===level&&A<=g[2]&&A>g[3])return g;if(A<=0)for(const g of GEO)if(g[0]===level&&g[3]===0)return g;return null}
const fmtNum=(v,d=0)=>v.toLocaleString('ja-JP',{maximumFractionDigits:d,minimumFractionDigits:d});
let lastEvIdx=-2,lastAnc=-2;
function updateHUD(){
  const fut=A<=-.5;
  const smU=(s,u)=>s.replace(u,`<small>${u}</small>`);
  $('age').innerHTML=LANG==='en'
    ?(fut?(A>-1e4?fmtAge(A):'About '+smU(fmtAge(A),'years from now')):A<.5?'Now<small> (2026)</small>':(A<12000?fmtAge(A):'About '+smU(fmtAge(A),'years ago')))
    :(fut?(A>-1e4?fmtAge(A):'約 '+fmtAge(A).replace('年後','<small>年後</small>')):A<.5?'現在<small>（2026年）</small>':(A<12000?fmtAge(A):'約 '+fmtAge(A).replace('年前','<small>年前</small>')));
  const chips=[];
  if(A>4.567e9)chips.push([L('太陽系の誕生前','Before the Solar System'),'#555']);
  if(worldIF)chips.push([L('もしもの世界','What-if world'),'#5fd0c4']);
  if(fut){chips.push([L('未来（予測）','Future (forecast)'),'#b9a6f2']);if(A>-1e5)chips.push([L('排出: ','Emissions: ')+SCENARIOS[SCENARIO].short,'#7a6fa8'])}
  else for(const lv of[0,1,2,3]){const g=geoAt(A,lv);if(g)chips.push([g[1],g[4]])}
  $('chips').innerHTML=chips.map(c=>`<span><i style="background:${c[1]}"></i>${c[0]}</span>`).join('');
  $('cal').innerHTML=L('地球の歴史を1年にすると','If Earth’s history were one year:')+` <b class="mono">${calendar(A)}</b>`;
  // most recent event at or before A
  let ei=0;for(let i=0;i<EVENTS.length;i++)if(EVENTS[i][0]>=A-1e-9)ei=i;
  if(ei!==lastEvIdx){lastEvIdx=ei;const ev=EVENTS[ei],k=KIND[ev[1]];
    $('evKind').textContent=ev[4]?L('本来の世界','Original world'):k[0];$('evKind').style.color=ev[4]?'var(--dim)':k[1];$('evTitle').textContent=ev[2];$('evDesc').textContent=ev[3];$('evWhen').textContent=fmtShort(ev[0])}
  // readouts
  const rows=[];
  if(fut||(worldIF&&A<ifStart())){futureRows(rows);$('envList').innerHTML=rows.map(r=>`<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('');}
  else{
  const ab=L('約','about ');
  const o2=rt('o2',A);rows.push([L('酸素','Oxygen'),A>4.45e9?'—':o2<.05?L('ほぼ 0%','almost 0%'):fmtNum(o2,o2<3?1:0)+'%']);
  let co2=A>4.45e9?null:rt('co2',A);const g=glacial(A);if(co2&&A<8e5&&A>11700)co2=185+95*g;
  rows.push([L('二酸化炭素','Carbon dioxide'),co2==null?'—':co2>=10000?ab+fmtNum(co2/1e4,co2<1e5?1:0)+'%':ab+fmtNum(co2)+' ppm']);
  let tp=rt('temp',A);if(A<2.6e6&&A>11700)tp-=(1-g)*(A<8e5?5:3);
  rows.push([L('平均気温','Average temperature'),E.lava>.5?L('1000℃以上','over 1000℃'):(A>4.4e9?L('数百℃','several hundred ℃'):ab+fmtNum(tp)+'℃')]);
  rows.push([L('1日の長さ','Length of a day'),A>4.51e9?'—':ab+fmtNum(rt('day',A),A<1e8?1:0)+L('時間',' hours')]);
  rows.push([L('太陽の明るさ','Brightness of the Sun'),A>4.567e9?L('原始星','protostar'):fmtNum(solarLum(A)*100)+'%']);
  rows.push([L('月までの距離','Distance to the Moon'),A>4.51e9?L('まだない','no Moon yet'):ab+fmtNum(Math.round(rt('moon',A)/1000)*1000)+' km']);
  if(A<12000)rows.push([L('世界の人口','World population'),(()=>{const p=rt('pop',A);return LANG==='en'?ab+(p>=1e9?fmtNum(p/1e9,2)+' billion':fmtNum(p/1e6,p<1e7?1:0)+' million'):p>=1e8?'約'+fmtNum(p/1e8,1)+'億人':'約'+fmtNum(Math.round(p/1e5)*10)+'万人'})()]);
  $('envList').innerHTML=rows.map(r=>`<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('');
  }
  let ai=0;for(let i=0;i<ANCESTORS.length;i++)if(ANCESTORS[i][0]>=A)ai=i;
  if(fut)ai=A>-1000?-10:-11;
  if(worldIF&&!humansIn()&&A<Math.min(ifStart(),2.4e9))ai=IFX.oxy?-12:-13;
  if(ai!==lastAnc){lastAnc=ai;
    if(ai===-10){$('ancName').textContent=L('いまのあなたと、その子どもたち','You today, and your children');$('ancDesc').textContent=L('ここから数百年は、排出シナリオしだいで暮らしの環境が変わる。','For the next few hundred years, living conditions depend on the emission scenario.')}
    else if(ai===-12){$('ancName').textContent=L('（もしも）あなたはいない','(What if) You do not exist');$('ancDesc').textContent=L('酸素がないので、動物そのものが現れない。この世界の生き物は微生物だけ。','Without oxygen, animals never appear at all. The only life in this world is microbes.')}
    else if(ai===-13){$('ancName').textContent=L('（もしも）人類は現れない','(What if) Humans never appear');$('ancDesc').textContent=L('恐竜が生き残ったこの世界では、大きな哺乳類が広がらず、人類へ続く道すじはなかったと考える（想像）。','In this world where the dinosaurs survived, large mammals do not spread, so we assume there is no path leading to humans (imagined).')}
    else if(ai===-11){$('ancName').textContent=L('人類のゆくえは予測できない','The future of humanity cannot be predicted');$('ancDesc').textContent=L('この先の人間と街は描いていない。生き物も、数百万年より先は今の姿のまま描いている（実際には姿が変わっていく）。','People and towns from here on are not drawn. Living things more than a few million years ahead are still drawn in today’s shapes (in reality they would change).')}
    else{const an=ANCESTORS[ai];$('ancName').textContent=an[1];$('ancDesc').textContent=an[2]}}
  // timeline + list
  $('tl').setAttribute('aria-valuenow',String(Math.round(Uu*100)));$('tl').setAttribute('aria-valuetext',fmtAge(A));
  drawTL();
  refreshSeen();
  updateMech();
}

/* visible species list */
const labelSet=new Set();let showNames=false;
function visibleSpecies(){return SPECIES.filter(s=>s.mesh.count>0&&(s.pres||0)>.003)}
let seenKey='';
function refreshSeen(){
  const vs=visibleSpecies();$('seenN').textContent=vs.length?String(vs.length):'';
  const key=vs.map(s=>s.k).join(',')+[...labelSet].join(',')+(A<-3e6);if(key===seenKey)return;seenKey=key;
  $('seenList').innerHTML=vs.length?vs.map(s=>`<li><button data-k="${s.k}" aria-pressed="${labelSet.has(s.k)}"><i style="background:#${new THREE.Color(s.col).getHexString()}"></i><span>${displayName(s)}</span><small>${s.to>0?fmtShort(s.from).replace(L('年前',' years ago'),'')+L('〜','–')+fmtShort(s.to):fmtShort(s.from)+L('〜',' –')}</small></button></li>`).join(''):`<li style="font-size:12px;color:var(--dim)">${L('目に見える生き物はまだいない。','No living things big enough to see yet.')}</li>`;
}
$('seenList').addEventListener('click',e=>{const b=e.target.closest('button[data-k]');if(!b)return;const k=b.dataset.k;if(labelSet.has(k))labelSet.delete(k);else labelSet.add(k);seenKey='';refreshSeen()});

/* ------------------------------------------------------------------ timeline */
const tlc=$('tlc'),tctx=tlc.getContext('2d');
const TL={top:14,eon:12,era:12,per:18};
function drawTL(){
  const r=tlc.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);
  if(tlc.width!==Math.round(r.width*dpr)||tlc.height!==Math.round(r.height*dpr)){tlc.width=Math.round(r.width*dpr);tlc.height=Math.round(r.height*dpr)}
  const w=r.width,c=tctx;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,r.height);
  const X=A=>A2u(A)*w;
  const rows=[[0,TL.top,TL.eon],[1,TL.top+TL.eon+1,TL.era],[2,TL.top+TL.eon+TL.era+2,TL.per]];
  c.font='500 10px "Zen Kaku Gothic New", sans-serif';c.textBaseline='middle';
  for(const [lv,y,h] of rows){
    c.fillStyle='rgba(255,255,255,.05)';c.fillRect(0,y,w,h);
    for(const g of GEO){if(g[0]!==lv)continue;const x0=X(Math.min(g[2],AMAX)),x1=X(g[3]);if(x1-x0<.5)continue;
      c.globalAlpha=.8;c.fillStyle=g[4];c.fillRect(x0,y,x1-x0-.5,h);c.globalAlpha=1;
      const label=g[1];const tw=c.measureText(label).width;if(tw+6<x1-x0){c.fillStyle='rgba(10,12,14,.85)';c.fillText(label,x0+(x1-x0-tw)/2,y+h/2+.5)}}
  }
  // the future (forecast)
  {const x0=X(0),x1=w,y=TL.top,h=TL.eon+TL.era+TL.per+2;c.fillStyle='rgba(185,166,242,.22)';c.fillRect(x0,y,x1-x0,h);
   c.fillStyle='rgba(185,166,242,.85)';c.fillRect(x0,y,x1-x0,TL.eon);const lab=L('未来（予測）','Future (forecast)'),tw=c.measureText(lab).width;
   if(tw+6<x1-x0){c.fillStyle='rgba(10,12,14,.85)';c.fillText(lab,x0+(x1-x0-tw)/2,y+TL.eon/2+.5)}
   c.fillStyle='#eef0e8';c.fillRect(x0-.5,TL.top-3,1.5,h+3)}
  // events
  for(const ev of EVENTS){const x=X(ev[0]);c.fillStyle=KIND[ev[1]][2];c.globalAlpha=ev[4]?.3:1;
    c.beginPath();c.moveTo(x-3.5,2);c.lineTo(x+3.5,2);c.lineTo(x,9);c.closePath();c.fill();c.globalAlpha=1}
  // humans bracket in linear mode
  if(scaleMode==='lin'){const x=X(2.8e6);c.fillStyle='rgba(242,180,92,.9)';c.fillRect(x,TL.top-3,Math.max(1.5,X(0)-x),2)}
  // thumb
  const x=Uu*w,bottom=TL.top+TL.eon+TL.era+TL.per+3;
  c.fillStyle='#f2b45c';c.fillRect(x-1,TL.top-4,2,bottom-TL.top+4);
  c.beginPath();c.arc(x,bottom+5,5,0,TAU);c.fill();
}
function setU(u){Uu=clamp(u,0,1);A=u2A(Uu);dirty=true}
let dirty=true,tween=null,playing=true,speed=1;
const tlEl=$('tl'),tip=$('tip');
let tlDrag=false;
function tlU(e){const r=tlEl.getBoundingClientRect();return clamp((e.clientX-r.left)/r.width,0,1)}
function nearEvent(e){const r=tlEl.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(y>TL.top+2)return null;let best=null,bd=7;for(const ev of EVENTS){const d=Math.abs(A2u(ev[0])*r.width-x);if(d<bd){bd=d;best=ev}}return best}
tlEl.addEventListener('pointerdown',e=>{const ev=nearEvent(e);if(ev){goTo(ev[0]);return}tlDrag=true;tween=null;tlEl.setPointerCapture(e.pointerId);setU(tlU(e))});
tlEl.addEventListener('pointermove',e=>{if(tlDrag){setU(tlU(e));return}const ev=nearEvent(e);if(ev){tip.hidden=false;tip.style.left=(A2u(ev[0])*tlEl.clientWidth)+'px';tip.innerHTML=`${ev[2]}<small>${fmtShort(ev[0])}</small>`}else tip.hidden=true});
tlEl.addEventListener('pointerup',()=>{tlDrag=false});
tlEl.addEventListener('pointerleave',()=>{tip.hidden=true});
tlEl.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();setU(Uu+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?.01:.002))}});
function goTo(Ae){tween={from:Uu,to:A2u(Ae),t:0}}
function stepEvent(dir){
  if(dir>0){for(const ev of EVENTS)if(ev[0]<A-Math.max(1e-6,A*1e-6)){goTo(ev[0]);return}}
  else{for(let i=EVENTS.length-1;i>=0;i--)if(EVENTS[i][0]>A+Math.max(.5,A*1e-6)){goTo(EVENTS[i][0]);return}}
}
$('bPrev').onclick=()=>stepEvent(-1);$('bNext').onclick=()=>stepEvent(1);
function setPlaying(p){playing=p;$('playIco').innerHTML=p?'<path d="M3 2h4v12H3zM9 2h4v12H9z"/>':'<path d="M4 2l10 6-10 6z"/>';$('bPlay').setAttribute('aria-label',p?L('停止','Pause'):L('再生','Play'));if(p&&Uu>=1)setU(0)}
$('bPlay').onclick=()=>setPlaying(!playing);
$('speed').onchange=e=>{speed=+e.target.value};
function setScale(m){const a=A;scaleMode=m;$('sEv').setAttribute('aria-pressed',m==='ev');$('sLin').setAttribute('aria-pressed',m==='lin');Uu=A2u(a);
  const sn=$('scaleNote');if(sn)sn.textContent=m==='lin'?L('いまは地球の一生（過去46億年＋太陽が老いるまで50億年）のほぼ真ん中。ホモ属の歴史は 0.03%','Today is near the middle of Earth’s life (4.6 billion years past + 5 billion years until the Sun grows old). The genus Homo is 0.03% of it'):'';dirty=true}
$('sEv').onclick=()=>setScale('ev');$('sLin').onclick=()=>setScale('lin');
$('bSeen').onclick=()=>{const s=$('seen');s.hidden=!s.hidden;$('bSeen').setAttribute('aria-pressed',String(!s.hidden))};
$('bNames').onclick=()=>{showNames=!showNames;$('bNames').setAttribute('aria-pressed',String(showNames))};
$('bClouds').onclick=()=>{showClouds=!showClouds;$('bClouds').setAttribute('aria-pressed',String(showClouds))};
$('sideToggle').onclick=()=>{const s=$('side');s.classList.toggle('open');$('sideToggle').setAttribute('aria-expanded',String(s.classList.contains('open')))};
addEventListener('keydown',e=>{
  if(e.target.tagName==='SELECT')return;
  if(e.code==='Space'){e.preventDefault();setPlaying(!playing)}
  else if(e.key===']')stepEvent(1);else if(e.key==='[')stepEvent(-1);
  else if(e.key==='g'||e.key==='G')setView(viewMode==='globe'?'surface':'globe');
  else if(e.key==='n'||e.key==='N')$('bDay').click();
  else if(e.key==='m'||e.key==='M')setMech(!mechOpen);
  else if(e.key==='i'||e.key==='I'){if(MODEL_IF){setWorldIF(!worldIF);toast(worldIF?L('もしもの世界','What-if world'):L('本来の世界','Original world'))}}
});

/* ------------------------------------------------------------------ mechanism panel: model vs record, and why things changed */
const mc=$('mechC'),mctx=mc.getContext('2d');
let mechOpen=false;
function recordAt(k,A){
  if(A<0)return NaN;
  if(k==='T')return A>4.4e9?NaN:tempAt(A);
  if(k==='C'){if(A>4.4e9)return NaN;return A<8e5&&A>11700?185+95*glacial(A):rt('co2',A)}
  if(k==='O2')return A>4.45e9?NaN:rt('o2',A);
  if(k==='D')return A>5.39e8?NaN:rt('div',A);
}
const mVal=(k,A,M)=>k==='O2'?modelAt('O2',A,M)*21:k==='T'&&A>4.4e9?NaN:modelAt(k,A,M);
const MROWS=[
  {k:'T',name:L('気温','Temp.'),unit:'℃',lo:-45,hi:45,ticks:[-40,0,40],lab:v=>v+'℃'},
  {k:'C',name:'CO2',unit:'ppm',lo:Math.log10(3),hi:Math.log10(1e6),log:1,ticks:[10,280,3e5],lab:v=>v>=1e4?v/1e4+'%':v+''},
  {k:'O2',name:L('酸素','Oxygen'),unit:'%',lo:0,hi:35,ticks:[0,21],lab:v=>v+'%'},
  {k:'D',name:L('海の動物','Sea animals'),unit:L('属の数','genera'),lo:0,hi:3600,ticks:[0,3000],lab:v=>v+''},
];
function drawMech(){
  if(!mechOpen)return;
  const r=mc.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);
  if(mc.width!==Math.round(r.width*dpr)||mc.height!==Math.round(r.height*dpr)){mc.width=Math.round(r.width*dpr);mc.height=Math.round(r.height*dpr)}
  const c=mctx;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,r.width,r.height);
  const PL=74,w=r.width-PL-2,rowH=(r.height-4)/MROWS.length,step=2;
  // the forecast part, and today
  {const xn=PL+A2u(0)*w;c.fillStyle='rgba(185,166,242,.08)';c.fillRect(xn,0,PL+w-xn,r.height);c.fillStyle='rgba(238,240,232,.5)';c.fillRect(xn,0,1,r.height);
   c.font='400 10px "Zen Kaku Gothic New", sans-serif';c.fillStyle='#b9a6f2';c.textAlign='left';c.textBaseline='top';c.fillText(L('予測','Forecast'),xn+4,2)}
  // the model's snowball episodes
  c.fillStyle='rgba(190,220,255,.13)';
  for(let px=0;px<w;px+=step)if(modelAt('snow',u2A(px/w))>.5)c.fillRect(PL+px,0,step,r.height);
  c.font='500 11px "Zen Kaku Gothic New", sans-serif';c.textBaseline='middle';
  MROWS.forEach((row,ri)=>{
    const y0=2+ri*rowH,h=rowH-6;
    const Y=v=>{let t=row.log?(Math.log10(v)-row.lo)/(row.hi-row.lo):(v-row.lo)/(row.hi-row.lo);return y0+h*(1-clamp(t,0,1))};
    c.fillStyle='#eef0e8';c.textAlign='left';c.fillText(row.name,0,y0+h/2);
    c.fillStyle='#727b70';c.font='400 10px "IBM Plex Mono", monospace';
    c.textAlign='right';
    for(const t of row.ticks){const y=Y(t);c.fillText(row.lab(t),PL-6,y);c.fillStyle='rgba(228,238,222,.07)';c.fillRect(PL,Math.round(y),w,1);c.fillStyle='#727b70'}
    c.font='500 11px "Zen Kaku Gothic New", sans-serif';
    const lines=[['rec','#aab3a7',[4,3],1.2,null]];
    if(MODEL_IF)lines.push(['mod',worldIF?'rgba(242,180,92,.45)':'#f2b45c',[],worldIF?1.1:1.6,MODEL_BASE],['mod',worldIF?'#5fd0c4':'rgba(95,208,196,.45)',[],worldIF?1.6:1.1,MODEL_IF]);
    else lines.push(['mod','#f2b45c',[],1.6,MODEL_BASE]);
    for(const [kind,col,dash,lw,Mx] of lines){
      c.beginPath();c.setLineDash(dash);c.strokeStyle=col;c.lineWidth=lw;let pen=false;
      for(let px=0;px<=w;px+=step){const A=u2A(px/w),v=kind==='rec'?recordAt(row.k,A):mVal(row.k,A,Mx);
        if(!isFinite(v)||(row.k==='D'&&kind==='mod'&&A>6.4e8)){pen=false;continue}
        const y=Y(row.log?Math.max(v,3):v);if(pen)c.lineTo(PL+px,y);else{c.moveTo(PL+px,y);pen=true}}
      c.stroke();
    }
    c.setLineDash([]);
    // forecasts from the literature, to check the model against
    for(const [a,k,v,lo,hi] of litMarks())if(k===row.k){const xx=PL+A2u(a)*w,cv=k==='O2'?v:v;c.strokeStyle='#b9a6f2';c.fillStyle='#b9a6f2';c.lineWidth=1.5;
      if(lo!=null){c.beginPath();c.moveTo(xx,Y(row.log?Math.max(lo,3):lo));c.lineTo(xx,Y(row.log?hi:hi));c.stroke()}
      c.beginPath();c.arc(xx,Y(row.log?Math.max(cv,3):cv),3.2,0,TAU);c.fill()}
  });
  const x=PL+Uu*w;c.fillStyle='#f2b45c';c.fillRect(x-.5,0,1.5,r.height);
}
const TERMS=[['tS',L('太陽','Sun')],['tC',L('CO2（自然）','CO2 (natural)')],['tH',L('CO2（人間）','CO2 (human)')],['tM',L('メタン','Methane')],['tI',L('氷の反射','Ice reflection')],['tO',L('軌道のゆらぎ','Orbital wobble')],['tW',L('水蒸気','Water vapor')]];
function termsAt(A){
  const C=modelAt('C',A),hum=modelAt('hum',A),tC=modelAt('tC',A),xn=Math.log(Math.max(C-hum,1)/280),tCn=4.33*xn+(xn>0?.25*xn*xn:0);
  return {tS:modelAt('tS',A),tC:hum>.5?tCn:tC,tH:hum>.5?tC-tCn:0,tM:modelAt('tM',A),tI:modelAt('tI',A),tO:modelAt('tO',A),tW:modelAt('tW',A),T:modelAt('T',A),C,O2:modelAt('O2',A)*21,D:modelAt('D',A),
    V:modelAt('V',A),W:modelAt('W',A),Bio:modelAt('Bio',A)*(.45+.55*modelAt('plant',A)),plant:modelAt('plant',A),ocean:modelAt('ocean',A),hum,snow:modelAt('snow',A)>.5};
}
function lipNear(A0,A1){for(const l of LIPS)if(l[0]<=A0+2*l[1]&&l[0]>=A1-2*l[1])return l[3];return null}
function co2Reason(a,b,A0,A1){
  if(b.snow&&!a.snow)return null;
  if(a.snow&&!b.snow)return L('全球凍結のあいだ岩石の風化が止まり、火山の CO2 がたまり続けた','During the snowball, rock weathering stopped and volcanic CO2 kept building up');
  const c=[];
  if(b.hum-a.hum>5)c.push([10,L('人間が化石燃料を燃やし、森を切りひらいた','Humans burned fossil fuels and cleared forests')]);
  // eruptions act through the CO2 they leave behind, which lingers for a few million years
  for(const l of LIPS)if(l[0]<=A0&&l[0]>=A1){const inj=l[2]*(l[1]/1e6)*1.77*700,eff=Math.log(1+inj/a.C)*Math.exp(-(l[0]-A1)/3e6);if(eff>.05)c.push([eff,L(l[3]+'の巨大噴火で CO2 が大量に出た','Huge eruptions ('+l[3]+') released a lot of CO2')])}
  const dV=Math.log(b.V/a.V);if(Math.abs(dV)>.05&&!lipNear(A1,A1)&&!lipNear(A0,A0))c.push([dV,dV>0?L('火山の CO2 が増えた','Volcanic CO2 increased'):L('火山活動が落ち着き、出てくる CO2 が減った','Volcanoes calmed down and released less CO2')]);
  const dW=-Math.log(b.W/a.W);if(Math.abs(dW)>.05)c.push([dW,dW<0?L('大陸の配置や山脈の隆起で岩石が風化しやすくなり、CO2 が吸い取られた','The layout of continents and rising mountains made rocks weather faster, soaking up CO2'):L('大陸が風化しにくい配置になり、CO2 がたまった','The continents moved into a layout that weathers less, so CO2 built up')]);
  const dB=-Math.log(b.Bio/a.Bio);if(Math.abs(dB)>.05)c.push([dB,dB<0?L('陸の植物が根で岩を砕き、風化を速めて CO2 を減らした','Land plants broke rocks with their roots, speeding up weathering and lowering CO2'):L('植物が減って岩石の風化が遅くなった','Fewer plants slowed rock weathering')]);
  const dS=-(b.tS-a.tS)/13;if(Math.abs(dS)>.05)c.push([dS,L('太陽が明るくなった分、風化が速まって CO2 が減った（天然のサーモスタット）','As the Sun brightened, weathering sped up and CO2 fell (a natural thermostat)')]);
  const dC=Math.log(b.C/a.C);
  const same=c.filter(x=>Math.sign(x[0])===Math.sign(dC)||x[0]===10).sort((p,q)=>Math.abs(q[0])-Math.abs(p[0]));
  return same.length?same[0][1]:null;
}
function termReason(k,d,a,b,A0,A1){
  switch(k){
    case 'tS':return L('太陽が明るくなった','The Sun got brighter');
    case 'tC':return co2Reason(a,b,A0,A1)||(d>0?L('CO2 が増えた','CO2 increased'):L('CO2 が減った','CO2 decreased'));
    case 'tH':return L('人間の排出した CO2 の温室効果','The greenhouse effect of CO2 emitted by humans');
    case 'tM':return d<0?L('酸素が増えてメタン（強い温室効果ガス）が壊された','More oxygen destroyed methane (a strong greenhouse gas)'):L('メタンをつくる微生物が増えた','Methane-making microbes increased');
    case 'tI':return d<0?(b.snow&&!a.snow?L('氷が日光を反射してさらに冷える連鎖が止まらなくなり、全球凍結した','Ice reflected sunlight and cooled things further in a chain that would not stop, and Earth froze over'):L('氷が広がって日光を反射した','Ice spread and reflected sunlight')):(a.snow&&!b.snow?L('氷がとけ、地面と海が日光を吸うようになった','The ice melted, and land and sea began absorbing sunlight'):L('氷が減って日光を吸うようになった','Less ice, so more sunlight was absorbed'));
    case 'tO':return L('地球の軌道のゆらぎで氷床が増減した（氷期と間氷期）','Wobbles in Earth’s orbit grew and shrank the ice sheets (glacials and interglacials)');
    case 'tW':return L('暑くなって大気中の水蒸気が増え、さらに暖まった','Warming added water vapor to the air, which warmed it further');
  }
}
const sgn=(v,d=1)=>(v>0?'+':v<0?'−':'±')+Math.abs(v).toFixed(d);
function updateMech(){
  if(!mechOpen)return;
  drawMech();$('kIf').hidden=!MODEL_IF;
  const t=termsAt(A);
  // breakdown bars
  if(A>4.4e9)$('mBars').innerHTML=`<span style="grid-column:1/-1;color:var(--dim)">${L('マグマの海の時代はモデルの対象外。','The magma-ocean age is outside the model.')}</span>`;
  else $('mBars').innerHTML=TERMS.filter(([k])=>k!=='tH'||t.tH>.05).filter(([k])=>k!=='tO'||Math.abs(t.tO)>.05).map(([k,n])=>{const v=t[k],f=clamp(Math.abs(v)/40,0,1)*50;
    return `<span>${n}</span><span class="bar"><span style="${v>=0?'left:50%':'right:50%'};width:${f}%;background:${v>=0?'#e9976a':'#7fb4e6'}"></span></span><span class="v">${sgn(v)}</span>`}).join('')+
    `<span style="color:var(--muted)">${L('合計','Total')}</span><span></span><span class="v">${Math.round(t.T)}℃</span>`;
  // what changed since the previous event, and why
  let ei=Math.max(0,lastEvIdx);const prev=ei>0?EVENTS[ei-1]:null;
  if(!prev||A>4.4e9||prev[0]>4.4e9){$('mWhy').textContent=L('マグマの海が冷えて海ができるまでは、このモデルでは扱っていない。','This model does not cover the time before the magma ocean cooled and the oceans formed.')}
  else{
    const a=termsAt(prev[0]),b=t,dT=b.T-a.T;
    const parts=TERMS.map(([k])=>[k,b[k]-a[k]]).filter(p=>Math.abs(p[1])>.3).sort((p,q)=>Math.abs(q[1])-Math.abs(p[1])).slice(0,2);
    const cm=L('、',', ');
    let s=L(`「${prev[2]}」（${fmtShort(prev[0])}）から、この時点までに 気温 <b>${sgn(dT)}℃</b>`,`From “${prev[2]}” (${fmtShort(prev[0])}) to this point: temperature <b>${sgn(dT)}℃</b>`);
    const rc=b.C/a.C;if(rc>1.15||rc<.87)s+=`${cm}CO2 <b>×${rc>=1e4?jaNum(Math.round(rc/1e4)*1e4):rc>=10?Math.round(rc):rc.toFixed(rc<.1?3:1)}</b>`;
    const dO=b.O2-a.O2;if(Math.abs(dO)>.8)s+=`${cm}${L('酸素','oxygen')} <b>${sgn(dO)}%</b>`;
    let ext='';if(a.D>50&&b.D>0){const dd=(b.D/a.D-1)*100;if(Math.abs(dd)>12)s+=`${cm}${L('海の動物の多様さ','variety of sea animals')} <b>${sgn(dd,0)}%</b>`;if(dd<-20)ext=prev[0]>6.6e7&&A<=6.6e7?L('小天体の衝突と、その後の急な気候変化','the asteroid impact and the sudden climate change after it'):(b.snow||a.snow)?L('全球凍結','snowball Earth'):modelAt('I',A)>.045?L('寒冷化と、氷床の拡大で浅い海が干上がったこと','cooling, and shallow seas drying up as ice sheets grew'):L('急な気温の変化（生き物が適応できる速さを超えた）','a sudden change in temperature (faster than living things could adapt)')}
    s+=L('。','.');
    if(parts.length)s+=L('<br>おもな原因: ','<br>Main causes: ')+parts.map(([k,d])=>`${termReason(k,d,a,b,prev[0],A)}${L('（',' (')}${sgn(d)}℃${L('）',')')}`).join(L('。','. '));
    else if(Math.abs(dT)<.6)s+=L('気温はほとんど変わっていない。',' The temperature has hardly changed.');
    if(ext)s+=L(`<br>多様さが減った原因: ${ext}。`,`<br>Why the variety fell: ${ext}.`);
    if(b.plant<a.plant-.15)s+=L('<br>植物: CO2 が少なくなりすぎて、光合成できる植物が減った。','<br>Plants: CO2 fell too low, so fewer plants could photosynthesize.');
    if(b.ocean<a.ocean-.05)s+=L('<br>海: 暑さで水蒸気が上空まで届き、宇宙へ逃げて海が減った。','<br>Oceans: the heat carried water vapor high into the sky, where it escaped to space, and the oceans shrank.');
    if(Math.abs(dO)>.8)s+=L(`<br>酸素: ${dO>0?'光合成でできた有機物が地層に埋もれる量が、火山ガスや鉄が酸素を使う量を上回った':'有機物の埋没が減り、酸素の消費が上回った'}。`,`<br>Oxygen: ${dO>0?'more organic matter from photosynthesis was buried in rock layers than the oxygen used up by volcanic gases and iron':'less organic matter was buried, so oxygen use won out'}.`);
    $('mWhy').innerHTML=s;
  }
  const rT=recordAt('T',A),rC=recordAt('C',A);
  $('mFit').innerHTML=(isFinite(rT)?L(`この時点 ── 気温 モデル ${Math.round(t.T)}℃ / 記録 ${Math.round(rT)}℃、CO2 モデル ${fmtPPM(t.C)} / 記録 ${fmtPPM(rC)}<br>`,`At this point: temperature model ${Math.round(t.T)}℃ / record ${Math.round(rT)}℃, CO2 model ${fmtPPM(t.C)} / record ${fmtPPM(rC)}<br>`):'')+MODEL_FIT+ifDiffLine();
}
function ifDiffLine(){
  if(!MODEL_IF||A>=ifStart())return '';const B=MODEL_BASE,I=MODEL_IF;
  const dT=modelAt('T',A,I)-modelAt('T',A,B),rc=modelAt('C',A,I)/modelAt('C',A,B),dO=(modelAt('O2',A,I)-modelAt('O2',A,B))*21,db=modelAt('D',A,B),dd=db>20?(modelAt('D',A,I)/db-1)*100:null;
  return L(`<br><span style="color:var(--k-if)">もしもの世界 − 本来の世界（この時点）: 気温 ${sgn(dT)}℃、CO2 ×${rc>=100?Math.round(rc):rc.toFixed(2)}、酸素 ${sgn(dO)}%${dd===null?'':'、海の動物 '+sgn(dd,0)+'%'}</span>`,`<br><span style="color:var(--k-if)">What-if world − original world (at this point): temperature ${sgn(dT)}℃, CO2 ×${rc>=100?Math.round(rc):rc.toFixed(2)}, oxygen ${sgn(dO)}%${dd===null?'':', sea animals '+sgn(dd,0)+'%'}</span>`);
}
const fmtPPM=v=>v>=1e4?(v/1e4).toFixed(v<1e5?1:0)+'%':Math.round(v)+'ppm';
let MODEL_FIT='';
function computeFit(){
  let nT=0,eT=0,nC=0,eC=0,nO=0,eO=0,nD=0,eD=0;
  for(let i=0;i<=600;i++){const A=u2A_ev(UP*(.08+i/600*.92));
    const rT=recordAt('T',A);if(isFinite(rT)){eT+=Math.abs(modelAt('T',A)-rT);nT++}
    const rC=recordAt('C',A);if(isFinite(rC)){eC+=Math.abs(Math.log(modelAt('C',A)/rC));nC++}
    const rO=recordAt('O2',A);if(isFinite(rO)){eO+=Math.abs(modelAt('O2',A)*21-rO);nO++}
    const rD=recordAt('D',A);if(isFinite(rD)&&rD>100){eD+=Math.abs(modelAt('D',A)/rD-1);nD++}}
  MODEL_FIT=L(`記録とのずれ（全期間の平均）: 気温 ±${(eT/nT).toFixed(1)}℃、CO2 ×${Math.exp(eC/nC).toFixed(1)}、酸素 ±${(eO/nO).toFixed(1)}%、海の動物 ±${Math.round(eD/nD*100)}%`,`Gap from the record (average over all time): temperature ±${(eT/nT).toFixed(1)}℃, CO2 ×${Math.exp(eC/nC).toFixed(1)}, oxygen ±${(eO/nO).toFixed(1)}%, sea animals ±${Math.round(eD/nD*100)}%`);
}
computeFit();
function setMech(open){if(open&&!$('ifp').hidden)setIfPanel(false);mechOpen=open;$('mech').hidden=!open;document.body.classList.toggle('mech-open',open);$('bMech').setAttribute('aria-pressed',String(open));if(open)updateMech()}
$('bMech').onclick=()=>setMech(!mechOpen);$('mechClose').onclick=()=>setMech(false);
addEventListener('resize',()=>drawMech());

