'use strict';
if(!window.__wwGL) throw new Error("wifi-wave: WebGL2 の準備ができなかったので止める");   // gl.js が止まったとき
// ================= UI =================
const $=id=>document.getElementById(id);
const presetsEl=$('presets');
PRESETS.forEach(p=>{const b=document.createElement('button');b.className='preset';b.dataset.v=p.key;b.innerHTML=`${p.name}<small>${p.sub}</small>`;b.onclick=()=>loadPreset(p.key);presetsEl.appendChild(b);});

const TOOLS=[{key:'move',name:L('動かす','Move'),swatch:'transparent'}].concat(MATS.slice(1).map(m=>({key:m.key,name:m.key==='water'?L('人を置く','Add a person'):m.short,mat:m}))).concat([{key:'erase',name:L('消しゴム','Eraser')}]);
const toolsEl=$('tools');
TOOLS.forEach(t=>{
  const b=document.createElement('button');b.className='tool';b.dataset.v=t.key;b.setAttribute('aria-pressed',t.key===S.tool);
  const col=t.mat?`rgb(${t.mat.rgb.map(v=>Math.round(v*255)).join(',')})`:(t.key==='erase'?'repeating-linear-gradient(45deg,#556,#556 3px,#223 3px,#223 6px)':'transparent');
  b.innerHTML=`<i style="background:${col}${t.key==='move'?';box-shadow:inset 0 0 0 1.5px var(--accent);border-radius:50%':''}"></i><span>${t.name}</span><em id="tdb-${t.key}"></em>`;
  b.title=t.mat?L(`${t.mat.name}（${t.mat.note}）`,`${t.mat.name} (${t.mat.note})`):'';
  b.onclick=()=>{S.tool=t.key;document.querySelectorAll('.tool').forEach(x=>x.setAttribute('aria-pressed',x.dataset.v===t.key));ov.style.cursor=t.key==='move'?'grab':'crosshair';};
  toolsEl.appendChild(b);
});
function updateToolDb(){
  const f=FREQ[S.freq].ghz;
  MATS.slice(1).forEach(m=>{
    const el=$('tdb-'+m.key);
    if(m.pec) el.textContent=L('反射','reflects');
    else if(m.water) el.textContent=L('吸収','absorbs');
    else el.textContent='−'+slabDb(m,f).toFixed(1);
  });
  $('toolCap').textContent=L(`材料を選んで図の上をドラッグすると壁が描けます。数字は${S.freq} GHzの電波が壁1枚を真正面から通るときの弱まり（dB）。`,
    `Pick a material and drag on the map to draw a wall. The numbers show how much a ${S.freq} GHz wave weakens (dB) going straight through one wall.`);
}

function setSeg(el,v){el.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v));}
$('segMode').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.mode=b.dataset.v;setSeg($('segMode'),S.mode);
  S.speedIdx=S.mode==='wave'?3:9; $('speed').value=S.speedIdx;
  $('chkComp').hidden=S.mode!=='wave'; $('chkSmooth').hidden=S.mode!=='heat'; updateLegend();};
$('segFreq').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.freq=b.dataset.v;setSeg($('segFreq'),S.freq);
  lut=makeLut(FREQ[S.freq].ghz);OMEGA=omegaStep(FREQ[S.freq].ghz);resetField();updateFreqCap();updateToolDb();};
$('optComp').onchange=e=>S.comp=e.target.checked;
$('optSmooth').onchange=e=>S.smooth=e.target.checked;
$('speed').oninput=e=>S.speedIdx=+e.target.value;
const playLabel=()=>{$('btnPlay').textContent=S.paused?L('再生','Play'):L('一時停止','Pause');};
$('btnPlay').onclick=()=>{S.paused=!S.paused;playLabel();};
playLabel();
// 言語の切り替え（ページを読み直す）と、言語で変わる属性
$('langsw').querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.l===LANG);b.onclick=()=>{if(b.dataset.l!==LANG)setLang(b.dataset.l);};});
document.title=L('電波の見える部屋','Seeing WiFi at Home');
ov.setAttribute('aria-label',L('間取り図。ルーターとスマホをドラッグで動かせます','Floor plan. Drag the router and the phone to move them.'));
$('speed').setAttribute('aria-label',L('シミュレーションの速さ','Simulation speed'));
$('btnReset').onclick=()=>resetField();
$('hint').onclick=()=>$('hint').classList.toggle('open');
// スマホ（縦）では説明を図の下のスクロール欄の頭へ移して、切らずに全部見せる
const hintMq=matchMedia('(max-width:860px) and (orientation:portrait)'),hintHome=$('hint').nextSibling;
const placeHint=()=>{if(hintMq.matches)$('panel').querySelector('.brand').after($('hint'));else $('stage').insertBefore($('hint'),hintHome);};
hintMq.addEventListener('change',placeHint);placeHint();
$('btnUndo').onclick=()=>{const u=S.undo.pop();if(u){ids.set(u);mapChanged();}};
addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===document.body){e.preventDefault();$('btnPlay').click();}});

function updateFreqCap(){
  const F=FREQ[S.freq], lam=C0/(F.ghz*1e9)*100;
  $('freqCap').textContent=L(`1秒間に${F.times}回ふるえる波。波長 ${lam.toFixed(1)} cm（図の山と山の間隔）。`,
    `A wave that vibrates ${F.times} times a second. Wavelength ${lam.toFixed(1)} cm (the distance between crests on the map).`);
}

const HEAT_STOPS=[[-95,[.03,.04,.09]],[-85,[.12,.16,.42]],[-75,[.22,.36,.78]],[-67,[.16,.68,.62]],[-55,[.58,.87,.37]],[-45,[1,.84,.30]],[-35,[1,.55,.25]],[-25,[1,.95,.88]]];
function heatCss(d){
  if(d<=HEAT_STOPS[0][0]) return HEAT_STOPS[0][1];
  for(let i=0;i<HEAT_STOPS.length-1;i++){const [a,ca]=HEAT_STOPS[i],[b,cb]=HEAT_STOPS[i+1];if(d<b){const t=(d-a)/(b-a);return ca.map((v,j)=>v+(cb[j]-v)*t);}}
  return HEAT_STOPS[HEAT_STOPS.length-1][1];
}
const rgb=c=>`rgb(${c.map(v=>Math.round(v*255)).join(',')})`;
function updateLegend(){
  const el=$('legend');
  if(S.mode==='wave'){
    el.innerHTML=L(`<div class="lg-wave"><span><i style="background:var(--wave-pos)"></i>電場が上向き（波の山）</span><span><i style="background:var(--wave-neg)"></i>下向き（波の谷）</span></div>
    <div>ルーターのアンテナを縦に立てたときの、床に垂直な電場を色で表しています。</div>`,
    `<div class="lg-wave"><span><i style="background:var(--wave-pos)"></i>Electric field pointing up (crest)</span><span><i style="background:var(--wave-neg)"></i>pointing down (trough)</span></div>
    <div>The colors show the electric field standing straight up from the floor, as when the router’s antennas point straight up.</div>`);
    return;
  }
  const lo=-95,hi=-25,stops=[];for(let d=lo;d<=hi;d+=5)stops.push(`${rgb(heatCss(d))} ${((d-lo)/(hi-lo)*100).toFixed(1)}%`);
  const ticks=S.line?[[-40,'0'],[-55,'−15'],[-70,'−30'],[-85,'−45 dB']]:[[-85,'−85'],[-75,'−75'],[-67,'−67'],[-55,'−55'],[-35,'−35 dBm']];
  el.innerHTML=`<div class="lg-bar" style="background:linear-gradient(90deg,${stops.join(',')})"></div>
  <div class="lg-ticks">${ticks.map(([d,t])=>`<span style="left:${((d-lo)/(hi-lo)*100).toFixed(1)}%">${t}</span>`).join('')}</div>
  <div>${S.line?L('壁がないときと比べた強さ（dB）。','Strength compared with no wall (dB).'):L('受信の強さの目安（dBm）。黒い線は、アンテナ表示が1本ずつ変わるおよその境目（スマホの機種で違います）。','Rough signal strength (dBm). The black lines are roughly where the signal bars change by one (it differs between phone models).')}</div>`;
}

// ================= readout =================
function grade(db){
  if(db>=-55) return [4,L('とても強い','Very strong'),L('4K動画も余裕','Even 4K video is easy'),'var(--good)'];
  if(db>=-67) return [3,L('強い','Strong'),L('動画も快適','Video plays smoothly'),'var(--good)'];
  if(db>=-75) return [2,L('ふつう','OK'),L('ウェブやSNSは大丈夫','Fine for web and social media'),'var(--mid)'];
  if(db>=-85) return [1,L('弱い','Weak'),L('途切れやすい','Often cuts out'),'var(--weak)'];
  return [0,L('ほぼ圏外','Almost no signal'),L('つながらない','Can’t connect'),'var(--bad)'];
}
const readBuf=new Float32Array(17*17*4);
function probeAvg(x,y){sim.read(Math.round(x)-8,Math.round(y)-8,17,17,readBuf);let s=0;for(let i=0;i<289;i++)s+=readBuf[i*4+2];return s/289;}
// lane probes average 1.5 m along the lane so mode beating inside the lane does not skew the comparison
const laneBuf=new Float32Array(200*40*4);
function laneAvg(x,y){sim.read(Math.round(x)-100,Math.round(y)-20,200,40,laneBuf);let s=0;for(let i=0;i<8000;i++)s+=laneBuf[i*4+2];return s/8000;}
function fspl(dm){return 20*Math.log10(dm)+20*Math.log10(FREQ[S.freq].mhz)-27.55;}
function dbmAt(x,y,e){const dc=Math.max(Math.hypot(x-S.router[0],y-S.router[1]),8);return PTX-fspl(dc*DX)+10*Math.log10(Math.max(e,1e-30)*dc/CAL[S.freq].C);}
function relAt(e){return 10*Math.log10(Math.max(e,1e-30)/CAL[S.freq].L);}

let wallsKey='', wallsText='';
function wallsBetween(){
  const k=[S.router,S.phone].flat().map(Math.round).join(',');
  if(k===wallsKey) return wallsText;
  wallsKey=k;
  const [x0,y0]=S.router,[x1,y1]=S.phone,len=Math.hypot(x1-x0,y1-y0),n=Math.ceil(len*2);
  const cnt={}; let prev=0, lastExit={};
  const at=i=>[Math.round(x0+(x1-x0)*i/n), Math.round(y0+(y1-y0)*i/n)];
  // the air gap is a wall's own cavity (gypsum board: 2 boards + 7.5 cm gap) when the same material is on both sides of it along x or y;
  // a line crossing the wall at a shallow angle has a long gap, so the distance along the line alone would count one wall twice
  const hit=(x,y,dx,dy,id)=>{for(let k=1;k<=16;k++){const u=x+dx*k,v=y+dy*k;if(u<0||v<0||u>=W||v>=H)return false;if(ids[v*W+u]===id)return true;}return false;};
  const cavity=(a,b,id)=>{const [x,y]=at((a+b)>>1);return (hit(x,y,1,0,id)&&hit(x,y,-1,0,id))||(hit(x,y,0,1,id)&&hit(x,y,0,-1,id));};
  for(let i=0;i<=n;i++){
    const [x,y]=at(i), id=ids[y*W+x];
    if(id!==prev){
      if(id){ const le=lastExit[id]; if(!(le!==undefined && (i-le<=24 || cavity(le,i,id)))) cnt[id]=(cnt[id]||0)+1; }
      if(prev) lastExit[prev]=i;
      prev=id;
    }
  }
  const parts=Object.keys(cnt).map(id=>`${MATS[id].short}×${cnt[id]}`);
  wallsText=parts.length?parts.join(L('、',', ')):L('なし（見通し）','none (line of sight)');
  return wallsText;
}
function updateReadout(){
  const e=probeAvg(S.phone[0],S.phone[1]);
  const dist=S.line?S.phone[0]-S.lineX:Math.hypot(S.phone[0]-S.router[0],S.phone[1]-S.router[1]);
  const need=dist/KC*1.25+700, since=sim.n-S.lastChange, waiting=since<need;
  const ro=$('readout');
  let val, html=[];
  if(S.line){
    // compare with the reference lane when there is one: the field inside a lane is not a free plane wave
    const ref=S.probes.find(p=>p.ref);
    val=ref&&ref.v>0?10*Math.log10(Math.max(e,1e-30)/ref.v):relAt(e);
    val=Math.max(val,-99);
    $('roUnit').textContent=L('dB（壁なしとの差）','dB (vs. no wall)');
    html.push(L(`左端の発生源から ${(dist*DX).toFixed(1)} m`,`${(dist*DX).toFixed(1)} m from the source on the left`));
  } else {
    val=dbmAt(S.phone[0],S.phone[1],e);
    $('roUnit').textContent='dBm';
    const dm=Math.max(dist,8)*DX, free=PTX-fspl(dm), eff=(val-free>=0?'+':'−')+Math.abs(val-free).toFixed(0);
    html.push(L(`ルーターから ${dm.toFixed(1)} m ／ 間の壁: ${wallsBetween()}`,`${dm.toFixed(1)} m from the router / walls between: ${wallsBetween()}`));
    if(!waiting) html.push(L(`壁がなければ ${free.toFixed(0)} dBm → 壁と反射の影響 ${eff} dB`,`With no walls: ${free.toFixed(0)} dBm → effect of walls and reflections: ${eff} dB`));
  }
  if(waiting){
    $('roVal').textContent='…'; ro.classList.add('ro-wait');
    $('roVerdict').innerHTML=`<span>${L('電波がスマホに届くのを待っています','Waiting for the waves to reach the phone')}</span>`;
    $('roBars').style.color='var(--dim)';[...$('roBars').children].forEach(i=>i.classList.remove('on'));
  } else {
    ro.classList.remove('ro-wait');
    $('roVal').textContent=(val<0?'−':'+')+Math.abs(val).toFixed(0);
    const g=grade(S.line?val-40:val);
    $('roVerdict').innerHTML=S.line?`<span style="color:${g[3]}">${val>-3?L('ほぼそのまま届く','Gets through almost unchanged'):val>-10?L('少し弱まる','A little weaker'):val>-20?L('かなり弱まる','Quite a bit weaker'):val>-40?L('大きく弱まる','Much weaker'):L('ほとんど届かない','Almost nothing gets through')}</span>`
      :`<b style="color:${g[3]}">${g[1]}</b> <span>${g[2]}</span>`;
    $('roBars').style.color=g[3];[...$('roBars').children].forEach((i,k)=>i.classList.toggle('on',k<g[0]));
  }
  $('roDetail').innerHTML=html.map(t=>`<span>${t}</span>`).join('');
  // probes
  if(S.probes.length){
    for(const p of S.probes) p.v=laneAvg(p.x,p.y);
    const ref=S.probes.find(p=>p.ref).v;
    for(const p of S.probes){p.rel=10*Math.log10(Math.max(p.v,1e-30)/Math.max(ref,1e-30)); p.ready=sim.n>(p.x-S.lineX)/KC*1.25+700;}
  }
}

// ================= interaction =================
let scale=1, dpr=1;
function fit(){
  const fr=$('frame').getBoundingClientRect();
  scale=Math.min(fr.width/W,fr.height/H); if(!(scale>0)) scale=fr.width/W;
  const cw=W*scale, ch=H*scale, left=(fr.width-cw)/2, top=Math.max(0,(fr.height-ch)/2);
  dpr=Math.min(2,window.devicePixelRatio||1);
  for(const c of [cv,ov]){c.style.width=cw+'px';c.style.height=ch+'px';c.style.left=left+'px';c.style.top=top+'px';}
  cv.width=Math.round(cw*dpr);cv.height=Math.round(ch*dpr);ov.width=cv.width;ov.height=cv.height;
}
new ResizeObserver(fit).observe($('frame'));

const toCell=e=>{const r=ov.getBoundingClientRect();return [(e.clientX-r.left)/scale,(e.clientY-r.top)/scale];};
const clampC=p=>[Math.max(45,Math.min(W-46,p[0])),Math.max(45,Math.min(H-46,p[1]))];
let drag=null;
ov.addEventListener('pointerdown',e=>{
  const p=toCell(e), hitR=(e.pointerType==='touch'?28:20)/scale;
  try{ov.setPointerCapture(e.pointerId);}catch(_){}
  if(Math.hypot(p[0]-S.phone[0],p[1]-S.phone[1])<hitR){drag={kind:'phone'};return;}
  if(!S.line&&Math.hypot(p[0]-S.router[0],p[1]-S.router[1])<hitR){drag={kind:'router'};return;}
  if(S.tool==='move') return;
  S.undo.push(ids.slice()); if(S.undo.length>15) S.undo.shift();
  if(S.tool==='erase'){drag={kind:'erase',p};eraseAt(p[0],p[1],20);mapChanged();return;}
  if(S.tool==='water'){personM(p[0]*DX,p[1]*DX,0);mapChanged();return;}
  drag={kind:'wall',p0:p,p1:p};
});
ov.addEventListener('pointermove',e=>{
  const p=toCell(e); S.hover=p;
  if(!drag){
    if(S.tool==='move'||true){const near=Math.hypot(p[0]-S.phone[0],p[1]-S.phone[1])<20/scale||(!S.line&&Math.hypot(p[0]-S.router[0],p[1]-S.router[1])<20/scale);
      ov.style.cursor=near?'grab':(S.tool==='move'?'default':'crosshair');}
    return;
  }
  if(drag.kind==='phone'){S.phone=clampC(p);}
  else if(drag.kind==='router'){S.router=clampC(p);S.lastChange=sim.n;}
  else if(drag.kind==='erase'){eraseAt(p[0],p[1],20);mapChanged();}
  else if(drag.kind==='wall'){
    let q=p; if(e.shiftKey||true){const dx=q[0]-drag.p0[0],dy=q[1]-drag.p0[1];if(Math.abs(dy)<Math.abs(dx)*.12)q=[q[0],drag.p0[1]];else if(Math.abs(dx)<Math.abs(dy)*.12)q=[drag.p0[0],q[1]];}
    drag.p1=q;
  }
});
function endDrag(){
  if(drag&&drag.kind==='wall'){
    // a tap (no line) draws nothing, so drop its undo step too; otherwise the next 元に戻す would seem to do nothing
    if(Math.hypot(drag.p1[0]-drag.p0[0],drag.p1[1]-drag.p0[1])<2) S.undo.pop();
    else{const m=MAT[S.tool];drawWall(m,drag.p0[0],drag.p0[1],drag.p1[0],drag.p1[1]);mapChanged();}
  }
  drag=null;
}
ov.addEventListener('pointerup',endDrag);ov.addEventListener('pointercancel',endDrag);
ov.addEventListener('pointerleave',()=>{S.hover=null;});

