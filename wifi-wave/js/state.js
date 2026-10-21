'use strict';
if(!window.__wwGL) throw new Error("wifi-wave: WebGL2 の準備ができなかったので止める");   // gl.js が止まったとき
// ================= state =================
const sim=new Sim(W,H);
const ids=sim.ids;
const S={
  mode:'wave', freq:'2.4', speedIdx:3, paused:false, comp:true, smooth:true,
  tool:'move', preset:null, line:false,
  router:[0,0], phone:[0,0], lineX:93,
  labels:[], probes:[],
  lastChange:0, undo:[],
};
let lut=makeLut(FREQ[S.freq].ghz), OMEGA=omegaStep(FREQ[S.freq].ghz);

const M=v=>v/DX;
function drawWall(m,x0,y0,x1,y1){
  const L=Math.hypot(x1-x0,y1-y0); if(L<.5) return;
  const ux=(x1-x0)/L, uy=(y1-y0)/L, nx=-uy, ny=ux;
  const lay=m.layers.map(([a,b])=>[a/CM_PER_CELL,b/CM_PER_CELL]);
  const half=Math.max(...lay.map(l=>Math.max(Math.abs(l[0]),Math.abs(l[1]))));
  const pad=half+1;
  const bx0=Math.max(0,Math.floor(Math.min(x0,x1)-pad)), bx1=Math.min(W-1,Math.ceil(Math.max(x0,x1)+pad));
  const by0=Math.max(0,Math.floor(Math.min(y0,y1)-pad)), by1=Math.min(H-1,Math.ceil(Math.max(y0,y1)+pad));
  for(let y=by0;y<=by1;y++)for(let x=bx0;x<=bx1;x++){
    const rx=x+.5-x0, ry=y+.5-y0, t=rx*ux+ry*uy;
    if(t<-half||t>L+half) continue;
    const s=rx*nx+ry*ny; if(Math.abs(s)>=half) continue;
    let hit=t<0||t>L;
    if(!hit) for(const l of lay) if(s>=l[0]&&s<l[1]){hit=true;break;}
    if(hit) ids[y*W+x]=m.id;
  }
}
const wallM=(k,x0,y0,x1,y1)=>drawWall(MAT[k],M(x0),M(y0),M(x1),M(y1));
function rectM(k,x0,y0,x1,y1){
  const id=MAT[k].id, a=Math.max(0,Math.round(M(x0))), b=Math.min(W,Math.round(M(x1))), c=Math.max(0,Math.round(M(y0))), d=Math.min(H,Math.round(M(y1)));
  for(let y=c;y<d;y++)for(let x=a;x<b;x++) ids[y*W+x]=id;
}
function ellipse(id,cx,cy,rx,ry,ang){
  const ca=Math.cos(ang),sa=Math.sin(ang),R=Math.max(rx,ry)+1;
  for(let y=Math.max(0,Math.floor(cy-R));y<=Math.min(H-1,Math.ceil(cy+R));y++)
    for(let x=Math.max(0,Math.floor(cx-R));x<=Math.min(W-1,Math.ceil(cx+R));x++){
      const dx=x+.5-cx,dy=y+.5-cy,u=(dx*ca+dy*sa)/rx,v=(-dx*sa+dy*ca)/ry;
      if(u*u+v*v<=1) ids[y*W+x]=id;
    }
}
const personM=(x,y,ang=0)=>ellipse(MAT.water.id,M(x),M(y),M(.23),M(.13),ang);
function eraseAt(cx,cy,r){
  for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(H-1,Math.ceil(cy+r));y++)
    for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(W-1,Math.ceil(cx+r));x++)
      if((x+.5-cx)**2+(y+.5-cy)**2<=r*r) ids[y*W+x]=0;
}

// ================= presets =================
const PRESETS=[
  {key:'flat', name:L('2LDKマンション','Apartment'), sub:L('玄関にルーター','Router by the entrance'),
    router:[1.0,2.85], phone:[8.2,4.5],
    hint:L('マンションのルーターは玄関まわりの情報盤に置かれがち。それでもLDKまで届くのは、廊下とドアを伝って波が流れ込むから。<b>5GHzに切り替えたり、黄色のルーターやスマホをドラッグ</b>したりして、受信の変化を見てみよう。',
      'In Japanese apartments the router often sits in a wiring box near the entrance. The signal still reaches the living room because the waves flow along the hallway and through the doors. <b>Switch to 5 GHz, or drag the yellow router or the phone,</b> and watch how the signal changes.'),
    now:L('<b>2LDKマンション。</b>外側の壁はコンクリート、部屋の仕切りは石こうボード、冷蔵庫と玄関ドアは金属。左の洋室の窓とLDKのベランダ側はガラスです。',
      '<b>A 2-bedroom apartment (a Japanese “2LDK”).</b> The outer walls are concrete, the walls between rooms are gypsum board, and the fridge and front door are metal. The windows of the bedroom on the left and on the balcony side of the living room are glass.'),
    labels:[[L('洋室1','Bedroom 1'),2.0,1.5],[L('洋室2','Bedroom 2'),2.0,4.5],[L('浴室','Bath'),4.0,1.15],[L('洗面','Washroom'),4.55,2.15],[L('トイレ・収納','Toilet / storage'),4.55,4.5],[L('廊下','Hall'),4.55,3.05],[L('玄関','Entrance'),L(1.75,2.05),3.25],[L('LDK','Living / kitchen'),7.3,2.6],[L('冷蔵庫','Fridge'),6.07,1.62],[L('ベランダ側の窓','Balcony windows'),8.35,5.2]],
    build(){
      // outer RC walls
      wallM('conc',.55,.55,9.05,.55); wallM('conc',.55,5.45,9.05,5.45);
      wallM('conc',.55,.55,.55,1.15); wallM('glass',.55,1.15,.55,2.2); wallM('conc',.55,2.2,.55,2.75);
      wallM('metal',.55,2.75,.55,3.45); wallM('conc',.55,3.45,.55,4.0); wallM('glass',.55,4.0,.55,4.9); wallM('conc',.55,4.9,.55,5.45);
      wallM('conc',9.05,.55,9.05,1.0); wallM('glass',9.05,1.0,9.05,5.0); wallM('conc',9.05,5.0,9.05,5.45);
      rectM('conc',.55,.55,1.0,1.0); rectM('conc',.55,5.0,1.0,5.45); rectM('conc',8.6,.55,9.05,1.0); rectM('conc',8.6,5.0,9.05,5.45);
      // bedrooms
      wallM('board',.55,2.6,2.3,2.6); wallM('wood',2.3,2.6,3.1,2.6); wallM('board',3.1,2.6,3.5,2.6);
      wallM('board',.55,3.5,2.3,3.5); wallM('wood',2.3,3.5,3.1,3.5); wallM('board',3.1,3.5,3.5,3.5);
      wallM('board',3.5,.55,3.5,2.6); wallM('board',3.5,3.5,3.5,5.45);
      // bath block
      wallM('board',3.5,2.6,4.0,2.6); wallM('wood',4.0,2.6,4.7,2.6); wallM('board',4.7,2.6,5.6,2.6);
      wallM('board',3.5,1.7,4.2,1.7); wallM('glass',4.2,1.7,4.9,1.7); wallM('board',4.9,1.7,5.6,1.7);
      wallM('board',5.6,.55,5.6,2.6);
      rectM('water',4.55,.8,5.4,1.45);
      // toilet / storage
      wallM('board',3.5,3.5,4.0,3.5); wallM('wood',4.0,3.5,4.7,3.5); wallM('board',4.7,3.5,5.6,3.5);
      wallM('board',5.6,3.5,5.6,5.45);
      // living door with glass
      wallM('glass',5.6,2.6,5.6,3.5);
      // kitchen
      rectM('metal',5.75,.75,6.4,1.4);
      personM(7.3,3.4,.3);
    }},
  {key:'house', name:L('木造の一戸建て','Wooden house'), sub:L('1階・リビングにルーター','1st floor, router in living room'),
    router:[1.1,1.0], phone:[8.0,3.3],
    hint:L('木造の家は電波が通りやすい。でもお風呂のお湯や冷蔵庫は電波をさえぎります。<b>5GHzに切り替える</b>と、洗面所のスマホはどうなる？',
      'Radio waves pass easily through a wooden house. But bath water and the fridge block them. <b>Switch to 5 GHz</b>: what happens to the phone in the washroom?'),
    now:L('<b>木造の一戸建て（1階）。</b>外壁は木、仕切りは石こうボード、ドアは木。リビングにルーター、スマホは洗面所にあります。',
      '<b>A wooden house (ground floor).</b> The outer walls are wood, the walls between rooms are gypsum board, and the doors are wood. The router is in the living room and the phone is in the washroom.'),
    labels:[[L('リビング','Living room'),2.8,2.4],[L('キッチン','Kitchen'),7.0,1.55],[L('ホール','Hall'),6.0,4.0],[L('洗面所','Washroom'),8.0,3.0],[L('浴室','Bath'),7.6,4.85],[L('冷蔵庫','Fridge'),8.57,1.6]],
    build(){
      wallM('wood',.55,.55,6.0,.55); wallM('glass',6.0,.55,7.5,.55); wallM('wood',7.5,.55,9.05,.55);
      wallM('wood',9.05,.55,9.05,5.45);
      wallM('wood',.55,5.45,1.0,5.45); wallM('glass',1.0,5.45,4.2,5.45); wallM('wood',4.2,5.45,9.05,5.45);
      wallM('wood',.55,.55,.55,1.5); wallM('glass',.55,1.5,.55,4.5); wallM('wood',.55,4.5,.55,5.45);
      wallM('board',5.0,.55,5.0,1.8);
      wallM('board',5.0,2.6,5.0,3.6); wallM('wood',5.0,3.6,5.0,4.4); wallM('board',5.0,4.4,5.0,5.45);
      wallM('board',5.0,2.6,6.0,2.6); wallM('board',6.9,2.6,9.05,2.6);
      wallM('board',7.0,2.6,7.0,3.3); wallM('wood',7.0,3.3,7.0,4.0); wallM('board',7.0,4.0,7.0,5.45);
      wallM('board',7.0,4.0,7.8,4.0); wallM('glass',7.8,4.0,8.5,4.0); wallM('board',8.5,4.0,9.05,4.0);
      rectM('water',7.9,4.45,8.85,5.25);
      rectM('metal',8.25,.75,8.9,1.4);
      for(let i=0;i<6;i++) wallM('wood',5.2,3.0+i*.35,6.6,3.0+i*.35);
      personM(2.5,3.9,0); personM(3.1,3.9,0);
    }},
  {key:'compare', name:L('壁の比べっこ','Wall test'), sub:L('材料ごとの弱まり','Loss for each material'), line:true,
    phone:[6.0,.3+5.4/7*5.5],
    hint:L('左から同じ強さのまっすぐな波を送り、壁を抜けた先の強さを「何もなし」と比べます。<b>2.4GHzと5GHzを切り替えて</b>数字の変化を見てみよう。',
      'Straight waves of the same strength are sent from the left, and the strength after each wall is compared with “Nothing”. <b>Switch between 2.4 GHz and 5 GHz</b> and watch the numbers change.'),
    now:L('<b>壁の比べっこ。</b>遠くのルーターから届く波をまねて、左端からまっすぐな波（平面波）を出しています。金属の仕切りで7つの通路に分け、それぞれに1種類の壁を置きました。',
      '<b>Wall test.</b> To imitate waves arriving from a distant router, straight waves (plane waves) are sent from the left edge. Metal dividers split the space into 7 lanes, each with one kind of wall.'),
    build(){
      const names=[null,'glass','board','wood','brick','conc','metal'], y0=.3, lh=5.4/7;
      for(let i=1;i<7;i++) wallM(names[i],4.5,y0+i*lh,4.5,y0+(i+1)*lh);
      for(let i=0;i<=7;i++) rectM('metal',2.6,y0+i*lh-.0075,9.6,y0+i*lh+.0075);
      S.probes=names.map((k,i)=>({name:k?MAT[k].name:L('何もなし','Nothing'), short:k?MAT[k].short:L('なし','None'), x:M(7.6), y:M(y0+(i+.5)*lh), ref:i===0, v:0}));
    }},
  {key:'gaps', name:L('すき間の実験','Gap experiment'), sub:L('金属の板にあけた穴','Gaps in a metal plate'), line:true,
    phone:[6.0,.3+1.08*3.5],
    hint:L('金属の板にあけたすき間。<b>波長の半分（2.4GHzで6.2cm、5GHzで2.9cm）より狭いすき間はほとんど通れません。</b>4cmのすき間を2.4GHzと5GHzで比べてみよう。電子レンジの扉の網も同じしくみです。',
      'Gaps in a metal plate. <b>Waves can hardly pass through a gap narrower than half a wavelength (6.2 cm at 2.4 GHz, 2.9 cm at 5 GHz).</b> Compare the 4 cm gap at 2.4 GHz and 5 GHz. The mesh on a microwave oven door works the same way.'),
    now:L('<b>すき間の実験。</b>厚さ8cmの金属の板に、幅20cm・8cm・4cm・2cmのすき間をあけました。一番上は板のない通路で、比べる基準です。',
      '<b>Gap experiment.</b> Gaps 20 cm, 8 cm, 4 cm and 2 cm wide were cut into an 8 cm thick metal plate. The top lane has no plate and is the reference for comparison.'),
    build(){
      const ws=[0,.20,.08,.04,.02], y0=.3, lh=1.08;
      for(let i=1;i<5;i++){
        const ya=y0+i*lh, yb=ya+lh, ym=(ya+yb)/2, g=ws[i]/2;
        rectM('metal',4.46,ya,4.54,ym-g); rectM('metal',4.46,ym+g,4.54,yb);
      }
      for(let i=0;i<=5;i++) rectM('metal',2.6,y0+i*lh-.0075,9.6,y0+i*lh+.0075);
      S.probes=ws.map((w,i)=>({name:i?L(`すき間 ${Math.round(w*100)}cm`,`${Math.round(w*100)} cm gap`):L('板なし','No plate'), short:i?L(`すき間${Math.round(w*100)}cm`,`${Math.round(w*100)}cm gap`):L('板なし','No plate'), x:M(7.6), y:M(y0+(i+.5)*lh), ref:i===0, v:0}));
    }},
  {key:'blank', name:L('まっさら','Empty'), sub:L('自分で壁を描く','Draw your own walls'),
    router:[2.4,3.0], phone:[7.4,3.0],
    hint:L('下の「壁を描く」から材料を選んで、図の上をドラッグして壁を描こう。ルーターとスマホの間に置くと、数字がどう変わる？',
      'Pick a material under “Draw walls” below and drag on the map to draw a wall. What happens to the number when you put one between the router and the phone?'),
    now:L('<b>まっさらな部屋。</b>壁は何もありません。電波は円を描いて広がり、遠くなるほど弱まります。',
      '<b>An empty room.</b> There are no walls. Radio waves spread out in circles and get weaker the farther they go.'),
    build(){}},
];

function loadPreset(key){
  const p=PRESETS.find(q=>q.key===key); S.preset=p;
  ids.fill(0); S.probes=[]; S.undo=[];
  p.build();
  S.line=!!p.line;
  if(p.router) S.router=[M(p.router[0]),M(p.router[1])];
  S.phone=[M(p.phone[0]),M(p.phone[1])];
  S.labels=(p.labels||[]).map(([t,x,y])=>[t,M(x),M(y)]);
  sim.upload(); resetField();
  document.getElementById('hint').innerHTML=p.hint;
  document.getElementById('nowText').innerHTML=p.now;
  document.querySelectorAll('.preset').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===key));
  wallsKey='';
  updateLegend();
}
function resetField(){ sim.clear(); S.lastChange=0; }
function mapChanged(){ sim.upload(); S.lastChange=sim.n; wallsKey=''; }

