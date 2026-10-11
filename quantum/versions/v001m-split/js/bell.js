'use strict';
/* ================= 4 量子もつれ ================= */
EXPS.bell=(()=>{
  const B={a:0,b:30,rate:6,model:'q',running:true,acc:0,fly:[],stats:{},recent:[],lamp:{A:null,B:null,t:0},chsh:{}};
  const cv=$('#bellCv'),ch=$('#bellChart');
  const rad=d=>d*Math.PI/180;
  function pair(a,b,model){
    if(model==='q'){const A=Math.random()<.5?1:-1;const same=Math.random()<Math.cos(rad(a-b))**2;return [A,same?A:-A];}
    const l=Math.random()*180;return [Math.cos(2*rad(a-l))>=0?1:-1,Math.cos(2*rad(b-l))>=0?1:-1];
  }
  const fold=d=>{d=Math.abs(d)%180;return d>90?180-d:d;};
  function record(A,Bv){const k=(Math.round(fold(B.a-B.b)/2.5)*2.5).toFixed(1);const s=B.stats[k]||(B.stats[k]={n:0,same:0});s.n++;if(A===Bv)s.same++;}
  function push(A,Bv){B.recent.push([A,Bv]);if(B.recent.length>40)B.recent.shift();renderRecent();}
  function renderRecent(){const f=(i)=>B.recent.map(r=>`<span class="${r[i]>0?'p':'m'}"></span>`).join('');$('#bellRowA').innerHTML=f(0);$('#bellRowB').innerHTML=f(1);
    const row=$('#bellRowA');row.style.justifyContent='flex-end';$('#bellRowB').style.justifyContent='flex-end';}
  function emit(animate){const [A,Bv]=pair(B.a,B.b,B.model);
    if(animate)B.fly.push({t:0,A,B:Bv});else{record(A,Bv);}}
  function setRun(on){B.running=on;$('#bellRun').textContent=on?L('一時停止','Pause'):L('再開','Resume');}
  function step(dt){
    if(B.running){B.acc+=dt*B.rate;while(B.acc>=1){B.acc--;emit(true);}}
    B.fly=B.fly.filter(f=>{f.t+=dt;if(f.t>=.7){record(f.A,f.B);push(f.A,f.B);B.lamp={A:f.A,B:f.B,t:.3};return false;}return true;});
    B.lamp.t=Math.max(0,B.lamp.t-dt);
  }
  function station(ctx,x,cy,ang,res,name,side){
    ctx.fillStyle=COL.raise;ctx.strokeStyle=COL.mute;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(x,cy,22,0,7);ctx.fill();ctx.stroke();
    const a=rad(ang);ctx.strokeStyle=COL.wave;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(x-Math.sin(a)*18,cy+Math.cos(a)*18);ctx.lineTo(x+Math.sin(a)*18,cy-Math.cos(a)*18);ctx.stroke();
    txt(ctx,name,x,cy-58,COL.fg,13,'center','body');txt(ctx,ang+'°',x,cy+40,COL.wave,12,'center');
    const lx=x+side*44;const on=B.lamp.t>0?B.lamp.t/.3:0;
    [[1,COL.hit,'＋',-24],[-1,COL.wave,'−',24]].forEach(([v,col,lab,dy])=>{const lit=on>0&&res===v;
      ctx.fillStyle=lit?col:COL.raise;ctx.strokeStyle=col;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(lx,cy+dy,10,0,7);ctx.fill();ctx.stroke();
      if(lit){ctx.fillStyle=rgba(col,.25*on);ctx.beginPath();ctx.arc(lx,cy+dy,20,0,7);ctx.fill();}
      txt(ctx,lab,lx,cy+dy+4,lit?COL.bg:col,12,'center');});
  }
  function draw(){
    {const {ctx,w,h}=fit(cv);ctx.clearRect(0,0,w,h);const cy=h/2+4;const xA=Math.max(60,w*.14),xB=w-xA,xs=w/2;
      dashLine(ctx,[[xA+24,cy],[xB-24,cy]],COL.line,1,[3,4]);
      ctx.fillStyle=COL.raise;ctx.strokeStyle=COL.mute;ctx.beginPath();ctx.arc(xs,cy,14,0,7);ctx.fill();ctx.stroke();
      txt(ctx,L('もつれたペアの源','Entangled pair source'),xs,cy+34,COL.mute,11,'center','body');
      for(const f of B.fly){const q=Math.min(1,f.t/.7);[xs-(xs-xA-22)*q,xs+(xB-22-xs)*q].forEach(x=>{ctx.fillStyle=COL.fg;ctx.beginPath();ctx.arc(x,cy,3,0,7);ctx.fill();});
        ctx.strokeStyle=rgba(COL.fg,.25);ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(xs-(xs-xA-22)*q,cy-8);ctx.quadraticCurveTo(xs,cy-24,xs+(xB-22-xs)*q,cy-8);ctx.stroke();ctx.setLineDash([]);}
      station(ctx,xA,cy,B.a,B.lamp.A,L('アリス','Alice'),-1);station(ctx,xB,cy,B.b,B.lamp.B,L('ボブ','Bob'),1);}
    {const {ctx,w,h}=fit(ch);ctx.clearRect(0,0,w,h);const l=44,r=w-14,t=14,b=h-34;
      const X=d=>l+d/90*(r-l),Y=p=>b-p*(b-t);
      ctx.strokeStyle=COL.line;ctx.lineWidth=1;
      for(const p of [0,.25,.5,.75,1]){ctx.beginPath();ctx.moveTo(l,Y(p));ctx.lineTo(r,Y(p));ctx.stroke();txt(ctx,(p*100)+'%',l-6,Y(p)+4,COL.mute,10,'right');}
      for(const d of [0,22.5,45,67.5,90]){txt(ctx,d+'°',X(d),b+14,COL.mute,10,'center');}
      txt(ctx,L('2人の角度の差','Angle difference'),(l+r)/2,b+28,COL.mute,11,'center','body');
      ctx.save();ctx.translate(12,(t+b)/2);ctx.rotate(-Math.PI/2);txt(ctx,L('結果がそろう割合','Match rate'),0,0,COL.mute,11,'center','body');ctx.restore();
      ctx.strokeStyle=COL.wave;ctx.lineWidth=2;ctx.beginPath();for(let d=0;d<=90;d+=1){const y=Y(Math.cos(rad(d))**2);d?ctx.lineTo(X(d),y):ctx.moveTo(X(d),y);}ctx.stroke();
      dashLine(ctx,[[X(0),Y(1)],[X(90),Y(0)]],COL.classic,2,[6,4]);
      const cur=fold(B.a-B.b);ctx.fillStyle=rgba(COL.hit,.12);ctx.fillRect(X(cur)-5,t,10,b-t);
      for(const k in B.stats){const s=B.stats[k];const d=+k;const r0=Math.min(7,2.5+Math.log10(s.n+1)*1.6);ctx.fillStyle=COL.fg;ctx.beginPath();ctx.arc(X(d),Y(s.same/s.n),r0,0,7);ctx.fill();}
    }
    const s=B.stats[(Math.round(fold(B.a-B.b)/2.5)*2.5).toFixed(1)];
    $('#bellNow').textContent=s?L(`${pct(s.same/s.n,0)}（${s.n}組）`,`${pct(s.same/s.n,0)} (${s.n} pairs)`):'—';
  }
  function runTest(){
    // 1組ごとに結果がばらつくので、S には誤差（標準誤差）がつく。実際の実験と同じく「S ± 誤差」で示す
    const N=20000,set=[[0,22.5,1],[0,67.5,-1],[45,22.5,1],[45,67.5,1]];const res={},err={};
    for(const m of ['q','h']){let S=0,v=0;for(const [a,b,sg] of set){let c=0;for(let i=0;i<N;i++){const [A,Bv]=pair(a,b,m);c+=A*Bv;}const E=c/N;S+=sg*E;v+=(1-E*E)/N;}res[m]=S;err[m]=Math.sqrt(v);}
    B.chsh=res;
    const show=(id,m)=>{$(id).style.width=Math.max(0,Math.min(1,res[m]/3))*100+'%';$(id+'v').textContent=`S = ${res[m].toFixed(2)} ± ${err[m].toFixed(2)}`;};
    show('#chshQ','q');show('#chshH','h');
    $('#chshVerdict').textContent=res.q-3*err.q>2?L(`量子もつれは S = ${res.q.toFixed(2)} ± ${err.q.toFixed(2)} で、誤差を考えても 2 を超えた。前もって答えを決めておく仕組みでは出せない値。隠れた変数の S が 2 をわずかに超えて見えることがあるのは、測った組の数が有限なためのばらつき（誤差の範囲）。`,
      `Entanglement gave S = ${res.q.toFixed(2)} ± ${err.q.toFixed(2)}: above 2 even allowing for the error. No scheme with answers decided in advance can give this. If hidden variables sometimes seem to go slightly above 2, that is random scatter from measuring a limited number of pairs (within the error).`):'';
    return {res,err};
  }
  range('#bellA',v=>v+'°',v=>B.a=v);range('#bellB',v=>v+'°',v=>B.b=v);range('#bellRate',v=>v+L(' 組',' /s'),v=>B.rate=v);
  seg('#bellModel',v=>{B.model=v;B.stats={};B.recent=[];renderRecent();});
  $('#bellRun').addEventListener('click',()=>setRun(!B.running));
  $('#bellMany').addEventListener('click',()=>{for(let i=0;i<500;i++){const [A,Bv]=pair(B.a,B.b,B.model);record(A,Bv);if(i>=460)push(A,Bv);}});
  $('#bellClear').addEventListener('click',()=>{B.stats={};B.recent=[];renderRecent();});
  $('#bellTest').addEventListener('click',runTest);
  return {B,step,draw,runTest,pair};
})();

