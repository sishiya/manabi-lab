'use strict';
/* ================= 5 不確定性原理 ================= */
EXPS.uncert=(()=>{
  const U={sig:1.2,c:0,p0:1.5,x0:0,tsig:null,mark:null};
  const cx=$('#unX'),cp=$('#unP');const fmtS=v=>v.toFixed(2);
  const dp=()=>Math.sqrt(1+U.c*U.c)/(2*U.sig);
  function plot(cv,range,f,line,mark,col){
    const {ctx,w,h}=fit(cv);ctx.clearRect(0,0,w,h);const l=10,r=w-10,t=16,b=h-24;
    const X=v=>l+(v+range)/(2*range)*(r-l);
    const n=400;let mx=0;const ys=[];for(let i=0;i<=n;i++){const v=-range+2*range*i/n;const y=f(v);ys.push(y);mx=Math.max(mx,y);}
    const top=Math.max(mx,.8);const Y=y=>b-y/top*(b-t);
    ctx.fillStyle=COL.line;ctx.fillRect(l,b,r-l,1);ctx.fillRect(X(0),t,1,b-t);
    for(let k=-range;k<=range;k+=range/4)txt(ctx,(+k.toFixed(1))+'',X(k),b+14,COL.mute,10,'center');
    ctx.fillStyle=rgba(col,.35);ctx.beginPath();ctx.moveTo(l,b);ys.forEach((y,i)=>ctx.lineTo(l+(r-l)*i/n,Y(y)));ctx.lineTo(r,b);ctx.fill();
    ctx.strokeStyle=col;ctx.lineWidth=1.6;ctx.beginPath();ys.forEach((y,i)=>i?ctx.lineTo(l+(r-l)*i/n,Y(y)):ctx.moveTo(l,Y(y)));ctx.stroke();
    if(line){const mid=b-(b-t)*.0;ctx.strokeStyle=rgba(COL.fg,.7);ctx.lineWidth=1;ctx.beginPath();const sc=(b-t)*.45/Math.sqrt(top);
      for(let i=0;i<=n*2;i++){const v=-range+range*i/n;const y=(b+t)/2-line(v)*sc;i?ctx.lineTo(X(v),y):ctx.moveTo(X(v),y);}ctx.stroke();}
    if(mark&&mark.t>0){const x=X(mark.v);ctx.strokeStyle=rgba(COL.hit,Math.min(1,mark.t));ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,t);ctx.lineTo(x,b);ctx.stroke();
      txt(ctx,L('測った値 ','Measured ')+mark.v.toFixed(2),x+(x>w*.6?-6:6),t+10,COL.hit,11,x>w*.6?'right':'left','body');}
  }
  function draw(){
    const s=U.sig,c=U.c;
    plot(cx,10,x=>Math.exp(-((x-U.x0)**2)/(2*s*s))/(Math.sqrt(2*Math.PI)*s),
      x=>{const env=Math.exp(-((x-U.x0)**2)/(4*s*s))/Math.pow(2*Math.PI*s*s,.25);return env*Math.cos(U.p0*x+c*(x-U.x0)**2/(4*s*s));},
      U.mark&&U.mark.k==='x'?U.mark:null,COL.wave);
    const sp=dp();
    plot(cp,6,p=>Math.exp(-((p-U.p0)**2)/(2*sp*sp))/(Math.sqrt(2*Math.PI)*sp),null,U.mark&&U.mark.k==='p'?U.mark:null,COL.hit);
    $('#unDx').textContent=s.toFixed(3);$('#unDp').textContent=sp.toFixed(3);const pr=s*sp;$('#unProd').textContent=pr.toFixed(3);
    $('#unBar').style.width=Math.min(100,pr/2*100)+'%';
  }
  function step(dt){
    if(U.tsig){const k=Math.min(1,dt*5);U.sig+=(U.tsig-U.sig)*k;if(Math.abs(U.tsig-U.sig)<.003){U.sig=U.tsig;U.tsig=null;}setRange('#unS',U.sig,fmtS);}
    if(U.mark)U.mark.t-=dt*.35;
  }
  range('#unS',fmtS,v=>{U.sig=v;U.tsig=null;});range('#unC',v=>v.toFixed(1),v=>U.c=v);range('#unP0',v=>v.toFixed(1),v=>U.p0=v);
  $('#unMx').addEventListener('click',()=>{const x=Math.max(-8,Math.min(8,U.x0+U.sig*gauss()));U.x0=x;U.c=0;setRange('#unC',0,v=>v.toFixed(1));U.tsig=.3;U.mark={k:'x',v:x,t:1.6};});
  $('#unMp').addEventListener('click',()=>{const p=Math.max(-3,Math.min(3,U.p0+dp()*gauss()));U.p0=p;U.c=0;setRange('#unC',0,v=>v.toFixed(1));setRange('#unP0',p,v=>v.toFixed(1));U.p0=p;U.tsig=3.2;U.mark={k:'p',v:p,t:1.6};});
  $('#unReset').addEventListener('click',()=>{U.x0=0;U.c=0;U.p0=1.5;U.sig=1.2;U.tsig=null;U.mark=null;setRange('#unS',1.2,fmtS);setRange('#unC',0,v=>v.toFixed(1));setRange('#unP0',1.5,v=>v.toFixed(1));});
  return {U,step,draw};
})();

