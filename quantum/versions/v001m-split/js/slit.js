'use strict';
/* ================= 1 二重スリット ================= */
EXPS.slit=(()=>{
  const S={mode:'both',observe:false,lam:1,d:10,a:1.5,L:60,Y:30,rate:12,running:true,field:true,curve:false,
    nb:240,hits:[],counts:new Uint32Array(240),flights:[],acc:0,flash:[0,0],spark:[]};
  const cvA=$('#slitApp'),cvB=$('#slitScreen');
  let fieldImg=null,buf=null,bufKey='';
  const slitList=()=>{const L=[];if(S.mode!=='bottom')L.push(S.d/2);if(S.mode!=='top')L.push(-S.d/2);return L;};
  function amp(c,x,y,k,M){let re=0,im=0;for(let m=0;m<M;m++){const s=c-S.a/2+(m+.5)*S.a/M;const r=Math.max(.6,Math.hypot(x,y-s));const w=1/Math.sqrt(r);re+=w*Math.cos(k*r);im+=w*Math.sin(k*r);}return [re/M,im/M];}
  function compute(){
    const k=2*Math.PI/S.lam;S.slits=slitList();
    const per=S.slits.map(()=>new Float64Array(S.nb)),coh=new Float64Array(S.nb),inc=new Float64Array(S.nb);
    for(let b=0;b<S.nb;b++){const y=-S.Y+(b+.5)*2*S.Y/S.nb;let R=0,I=0;
      S.slits.forEach((c,j)=>{const [re,im]=amp(c,S.L,y,k,24);per[j][b]=re*re+im*im;R+=re;I+=im;inc[b]+=re*re+im*im;});coh[b]=R*R+I*I;}
    S.per=per;S.coh=coh;S.inc=inc;S.cdfCoh=makeCdf(coh);S.cdfPer=per.map(makeCdf);S.wPer=per.map(p=>p.reduce((a,b)=>a+b,0));
    buildField();clear();
  }
  function buildField(){
    const gw=150,gh=100,k=2*Math.PI/S.lam,coh=!S.observe,vals=new Float32Array(gw*gh);
    for(let i=0;i<gw;i++){const x=(i+.5)/gw*S.L;let mx=1e-12;
      for(let j=0;j<gh;j++){const y=S.Y-(j+.5)/gh*2*S.Y;let R=0,I=0,P=0;
        for(const c of S.slits){const [re,im]=amp(c,x,y,k,10);R+=re;I+=im;P+=re*re+im*im;}
        const v=coh?R*R+I*I:P;vals[j*gw+i]=v;if(v>mx)mx=v;}
      for(let j=0;j<gh;j++)vals[j*gw+i]/=mx;}
    const c=document.createElement('canvas');c.width=gw;c.height=gh;const g=c.getContext('2d'),im=g.createImageData(gw,gh);
    const n=parseInt(COL.wave.slice(1),16),r=n>>16&255,gg=n>>8&255,b=n&255;
    for(let p=0;p<gw*gh;p++){im.data[p*4]=r;im.data[p*4+1]=gg;im.data[p*4+2]=b;im.data[p*4+3]=Math.round(Math.pow(vals[p],.7)*150);}
    g.putImageData(im,0,0);fieldImg=c;
  }
  function clear(){S.hits=[];S.counts=new Uint32Array(S.nb);S.flights=[];buf=null;$('#slitCount').textContent='0';}
  function addHit(y){
    const h={y,v:Math.random()};S.hits.push(h);const b=Math.min(S.nb-1,Math.max(0,Math.floor((y+S.Y)/(2*S.Y)*S.nb)));S.counts[b]++;
    if(buf)plotHit(buf.getContext('2d'),h,buf.width,buf.height*.6);
    if(S.hits.length>=60000)setRun(false);
  }
  function plotHit(g,h,W,H){const x=(h.y+S.Y)/(2*S.Y)*W,y=(.06+h.v*.88)*H;g.fillRect(x-.8*devicePixelRatio,y-.8*devicePixelRatio,1.6*devicePixelRatio,1.6*devicePixelRatio);}
  function fire(animate){
    let j=-1,b;
    if(S.slits.length===2&&S.observe){j=Math.random()*(S.wPer[0]+S.wPer[1])<S.wPer[0]?0:1;b=sampleCdf(S.cdfPer[j]);}
    else if(S.slits.length===1){j=S.observe?0:-1;b=sampleCdf(S.cdfPer[0]);}
    else b=sampleCdf(S.cdfCoh);
    const y=-S.Y+(b+Math.random())*2*S.Y/S.nb;
    if(animate)S.flights.push({t:0,y,j,dur:1.1,lit:false});else addHit(y);
  }
  function setRun(on){S.running=on;$('#slitRun').textContent=on?L('一時停止','Pause'):L('発射','Fire');}
  function step(dt){
    if(S.running){S.acc+=dt*S.rate;while(S.acc>=1){S.acc--;fire(S.flights.length<40);}}
    for(const f of S.flights){f.t+=dt;if(!f.lit&&f.j>=0&&f.t/f.dur>.4){f.lit=true;S.flash[S.mode==='bottom'?1:f.j]=.35;}}
    S.flights=S.flights.filter(f=>{if(f.t>=f.dur){addHit(f.y);S.spark.push({y:f.y,t:.35});return false;}return true;});
    S.flash=S.flash.map(v=>Math.max(0,v-dt));S.spark=S.spark.filter(s=>(s.t-=dt)>0);
  }
  function draw(){
    const {ctx,w,h}=fit(cvA);ctx.clearRect(0,0,w,h);
    const srcX=30,wallX=Math.round(w*.36),scrX=w-50;
    const yp=y=>h/2-y/S.Y*(h/2-16);
    // incoming beam (plane wave before the wall)
    if(S.field){const g=ctx.createLinearGradient(srcX,0,wallX,0);g.addColorStop(0,rgba(COL.wave,.05));g.addColorStop(1,rgba(COL.wave,.18));ctx.fillStyle=g;ctx.fillRect(srcX+14,yp(S.d/2+S.a+3),wallX-srcX-14,yp(-S.d/2-S.a-3)-yp(S.d/2+S.a+3));
      if(fieldImg){ctx.imageSmoothingEnabled=true;ctx.drawImage(fieldImg,wallX,yp(S.Y),scrX-wallX,yp(-S.Y)-yp(S.Y));}}
    // source
    ctx.fillStyle=COL.raise;ctx.strokeStyle=COL.mute;ctx.lineWidth=1;ctx.fillRect(srcX-18,h/2-12,30,24);ctx.strokeRect(srcX-18,h/2-12,30,24);
    txt(ctx,L('粒子源','Source'),6,h/2+30,COL.mute,11,'left','body');
    // wall with openings
    const open=S.slits.map(c=>[c-S.a/2,c+S.a/2]).sort((a,b)=>b[0]-a[0]);
    ctx.fillStyle=COL.mute;let topY=S.Y;
    for(const [lo,hi] of open){ctx.fillRect(wallX-3,yp(topY),6,yp(hi)-yp(topY));topY=lo;}
    ctx.fillRect(wallX-3,yp(topY),6,yp(-S.Y)-yp(topY));
    txt(ctx,L('スリット','Slits'),wallX,12,COL.mute,11,'center','body');
    // detectors
    if(S.observe){[S.d/2,-S.d/2].forEach((c,i)=>{if(!S.slits.includes(c))return;const x=wallX+8,y=yp(c)+(c>0?-22:8);
      ctx.fillStyle=COL.raise;ctx.strokeStyle=COL.line;ctx.fillRect(x,y,26,14);ctx.strokeRect(x,y,26,14);
      const f=S.flash[i]/.35;ctx.fillStyle=f>0?rgba(COL.good,.35+.65*f):COL.dim;ctx.beginPath();ctx.arc(x+20,y+7,3.5,0,7);ctx.fill();
      if(f>0){ctx.fillStyle=rgba(COL.good,.25*f);ctx.beginPath();ctx.arc(x+20,y+7,11,0,7);ctx.fill();}});
      txt(ctx,L('検出器','Detector'),wallX+8,27,COL.good,11,'left','body');}
    // screen + density strip
    ctx.fillStyle=COL.line;ctx.fillRect(scrX-2,yp(S.Y),4,yp(-S.Y)-yp(S.Y));
    let mx=1;for(const c of S.counts)if(c>mx)mx=c;
    const bh=(yp(-S.Y)-yp(S.Y))/S.nb;
    for(let b=0;b<S.nb;b++){if(!S.counts[b])continue;const y=yp(-S.Y+(b+1)*2*S.Y/S.nb);ctx.fillStyle=rgba(COL.hit,Math.min(1,.15+.85*S.counts[b]/mx));ctx.fillRect(scrX+6,y,30,Math.max(1,bh));}
    txt(ctx,L('スクリーン','Screen'),w-6,12,COL.mute,11,'right','body');
    // flights: 量子の粒子には途中の軌道がないので、点は「見つかった所」（検出器・スクリーン）にだけ描く。
    // その間は波面: スリットの前は平面波、スリットの後ろは開いているスリット（検出器ありなら見つかった側だけ）から広がる円い波。
    const shown=S.flights.slice(-8),fade=shown.length>3?.6:1;
    const bandT=yp(Math.min(S.Y,S.d/2+S.a+3)),bandB=yp(-Math.min(S.Y,S.d/2+S.a+3));
    for(const f of shown){const p=f.t/f.dur;
      if(p<.4){const q=p/.4,x=srcX+14+(wallX-srcX-17)*q;ctx.strokeStyle=rgba(COL.wave,.7*fade);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,bandT);ctx.lineTo(x,bandB);ctx.stroke();}
      else{const q=(p-.4)/.6,R=q*(scrX-wallX)*1.02;ctx.lineWidth=1.6;
        const from=f.j>=0?[S.slits[S.mode==='both'?f.j:0]]:S.slits;
        for(const c of from){ctx.strokeStyle=rgba(COL.wave,.75*(1-q)*fade);ctx.beginPath();ctx.arc(wallX,yp(c),R,-1.25,1.25);ctx.stroke();}
        if(f.j>=0&&q<.3){const a=1-q/.3;ctx.fillStyle=rgba(COL.hit,a);ctx.beginPath();ctx.arc(wallX+4,yp(from[0]),3+4*(1-a),0,7);ctx.fill();}}}
    for(const s of S.spark){const a=s.t/.35;ctx.fillStyle=rgba(COL.hit,a);ctx.beginPath();ctx.arc(scrX,yp(s.y),2+6*(1-a),0,7);ctx.fill();}
    if(S.slits.length===2&&S.flights.length)txt(ctx,S.observe?L('見つかった側から波が広がる','The wave spreads from the slit where it was found'):L('波は両方のスリットを通る','The wave goes through both slits'),(wallX+scrX)/2,h-6,S.observe?COL.good:COL.mute,11,'center','body');
    drawScreen();
  }
  function drawScreen(){
    const {ctx,w,h,d}=fit(cvB);ctx.clearRect(0,0,w,h);
    const top=h*.6;
    const key=cvB.width+'x'+cvB.height;
    if(!buf||bufKey!==key){buf=document.createElement('canvas');buf.width=cvB.width;buf.height=cvB.height;bufKey=key;const g=buf.getContext('2d');g.fillStyle=COL.hit;for(const hh of S.hits)plotHit(g,hh,buf.width,buf.height*.6);}
    else buf.getContext('2d').fillStyle=COL.hit;
    ctx.fillStyle='#07090c';ctx.fillRect(0,0,w,top);
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(buf,0,0);ctx.restore();
    // histogram
    const B=120,f=S.nb/B,cnt=new Float64Array(B);for(let b=0;b<S.nb;b++)cnt[Math.floor(b/f)]+=S.counts[b];
    const base=h-14,hh=base-top-12;
    const n=S.hits.length;
    const curves=[];
    if(S.curve&&n>0){const both=S.slits.length===2;
      const mk=(arr)=>{const s=arr.reduce((a,b)=>a+b,0),o=new Float64Array(B);for(let b=0;b<S.nb;b++)o[Math.floor(b/f)]+=arr[b]/s*n;return o;};
      curves.push([mk(S.coh),COL.wave]);if(both)curves.push([mk(S.inc),COL.classic]);}
    let mx=1;for(const c of cnt)mx=Math.max(mx,c);for(const [o] of curves)for(const c of o)mx=Math.max(mx,c);
    const bw=w/B;ctx.fillStyle=rgba(COL.hit,.75);
    for(let b=0;b<B;b++){const v=cnt[b]/mx*hh;if(v>0)ctx.fillRect(b*bw+.5,base-v,Math.max(1,bw-1),v);}
    for(const [o,col] of curves){ctx.strokeStyle=col;ctx.lineWidth=1.8;ctx.beginPath();for(let b=0;b<B;b++){const x=(b+.5)*bw,y=base-o[b]/mx*hh;b?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
    ctx.fillStyle=COL.line;ctx.fillRect(0,base,w,1);
    txt(ctx,L('↑ 上','↑ top'),w-6,base+12,COL.dim,10,'right','body');txt(ctx,L('下 ↓','bottom ↓'),6,base+12,COL.dim,10,'left','body');
    $('#slitCount').textContent=n.toLocaleString();
  }
  // controls
  let pending=0;const recompute=()=>{cancelAnimationFrame(pending);pending=requestAnimationFrame(compute);};
  seg('#slitMode',v=>{S.mode=v;recompute();});
  $('#slitObs').addEventListener('change',e=>{S.observe=e.target.checked;recompute();});
  range('#slitLam',v=>v.toFixed(2),v=>{S.lam=v;recompute();});
  range('#slitD',v=>v.toFixed(1),v=>{S.d=v;recompute();});
  range('#slitA',v=>v.toFixed(1),v=>{S.a=v;recompute();});
  const setSlit=(a,d,lam)=>{S.a=a;S.d=d;S.lam=lam;setRange('#slitA',a,v=>v.toFixed(1));setRange('#slitD',d,v=>v.toFixed(1));setRange('#slitLam',lam,v=>v.toFixed(2));recompute();};
  $('#slitWide').addEventListener('click',()=>setSlit(5,22,S.lam));
  $('#slitStd').addEventListener('click',()=>setSlit(1.5,10,1));
  range('#slitRate',v=>v+L(' 個',' /s'),v=>{S.rate=v;});
  $('#slitField').addEventListener('change',e=>S.field=e.target.checked);
  $('#slitCurve').addEventListener('change',e=>S.curve=e.target.checked);
  $('#slitRun').addEventListener('click',()=>setRun(!S.running));
  $('#slitOne').addEventListener('click',()=>fire(true));
  $('#slitMany').addEventListener('click',()=>{for(let i=0;i<1000;i++)fire(false);});
  $('#slitClear').addEventListener('click',clear);
  compute();for(let i=0;i<250;i++)fire(false);
  return {S,step,draw,fire,compute};
})();

