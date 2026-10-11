'use strict';
/* ================= 2 トンネル効果 ================= */
EXPS.tunnel=(()=>{
  const N=2000,dx=.25,dt=.02,SPF=80,BC=250,ABS=160,X0=105,SIG=10;
  const T={E:.6,w:1.25,V0:1,R:new Float64Array(N),I:new Float64Array(N),V:new Float64Array(N),t:0,absL:0,absR:0,running:true,meas:null,tally:{thru:0,back:0},phase:true,done:false};
  const cv=$('#tunCv');
  function fireNew(){
    const k0=Math.sqrt(2*T.E*T.V0);let s=0;
    for(let i=0;i<N;i++){const x=i*dx,g=Math.exp(-((x-X0)**2)/(4*SIG*SIG));T.R[i]=g*Math.cos(k0*x);T.I[i]=g*Math.sin(k0*x);s+=g*g*dx;
      // 壁の端のマスは重なった分だけの高さにして、厚さを格子の幅に丸めない
      const ov=Math.max(0,Math.min(x+dx/2,BC+T.w/2)-Math.max(x-dx/2,BC-T.w/2));T.V[i]=T.V0*ov/dx;}
    const nn=1/Math.sqrt(s);for(let i=0;i<N;i++){T.R[i]*=nn;T.I[i]*=nn;}
    T.t=0;T.absL=0;T.absR=0;T.meas=null;T.done=false;setRun(true);
    updateTheory();
  }
  function setRun(on){T.running=on;$('#tunPause').textContent=on?L('一時停止','Pause'):L('再開','Resume');}
  function updateTheory(){
    const E=T.E,V=T.V0,a=T.w;let Tt;
    if(Math.abs(E-V)<1e-6)Tt=1/(1+V*a*a/2);
    else if(E<V){const k=Math.sqrt(2*(V-E));Tt=1/(1+V*V*Math.sinh(k*a)**2/(4*E*(V-E)));}
    else{const k=Math.sqrt(2*(E-V));Tt=1/(1+V*V*Math.sin(k*a)**2/(4*E*(E-V)));}
    $('#tunTth').textContent=pct(Tt);$('#tunCl').textContent=E<V?L('0%（必ずはね返る）','0% (always bounces back)'):L('100%（必ず越える）','100% (always gets over)');
  }
  function sim(){
    const R=T.R,I=T.I,V=T.V,c=.5/(dx*dx);
    for(let s=0;s<SPF;s++){
      for(let i=1;i<N-1;i++)R[i]+=dt*(-c*(I[i+1]-2*I[i]+I[i-1])+V[i]*I[i]);
      for(let i=1;i<N-1;i++)I[i]-=dt*(-c*(R[i+1]-2*R[i]+R[i-1])+V[i]*R[i]);
      for(let j=0;j<ABS;j++){const f=1-.006*((ABS-j)/ABS)**2;
        for(const i of [j,N-1-j]){const p=R[i]*R[i]+I[i]*I[i];R[i]*=f;I[i]*=f;const lost=p*(1-f*f)*dx;if(i<N/2)T.absL+=lost;else T.absR+=lost;}}
    }
    T.t+=SPF*dt;
  }
  function parts(){let L=T.absL,M=0,Rr=T.absR;const a=BC-T.w/2,b=BC+T.w/2;
    for(let i=0;i<N;i++){const x=i*dx,p=(T.R[i]**2+T.I[i]**2)*dx;if(x<a)L+=p;else if(x>b)Rr+=p;else M+=p;}
    const s=L+M+Rr;return [L/s,M/s,Rr/s];}
  function step(){
    if(!T.running)return;sim();
    const [Lb,M,Rr]=parts();
    // 波がほぼ出そろったら止める（残りがすべて吸収されたか、十分時間がたった）
    if(T.t>420){setRun(false);T.done=true;}
  }
  function measure(){
    const [Lb,M,Rr]=parts();const r=Math.random();let x,side;
    if(r<Lb){side='back';}else if(r<Lb+M){side='in';}else side='thru';
    // 具体的な位置を分布から選ぶ（吸収済みの部分は画面の端に置く）
    const a=BC-T.w/2,b=BC+T.w/2,w=new Float64Array(N);
    for(let i=0;i<N;i++){const xx=i*dx;const inSide=side==='back'?xx<a:side==='thru'?xx>b:(xx>=a&&xx<=b);w[i]=inSide?T.R[i]**2+T.I[i]**2:0;}
    const tot=w.reduce((p,q)=>p+q,0);
    if(tot>1e-9)x=sampleCdf(makeCdf(w))*dx;else x=side==='back'?ABS*dx:side==='thru'?(N-ABS)*dx:BC;
    T.meas={x,side};if(side==='thru')T.tally.thru++;else T.tally.back++;
    setRun(false);
  }
  function draw(){
    const {ctx,w,h}=fit(cv);ctx.clearRect(0,0,w,h);
    const xa=ABS*dx-5,xb=(N-ABS)*dx+5,l=10,r=w-10,bot=h-28,H=bot-24;
    const px=x=>l+(x-xa)/(xb-xa)*(r-l);
    const vy=v=>bot-v/T.V0*.45*H, ry=p=>bot-p/0.042*.5*H;
    // barrier
    const bx0=px(BC-T.w/2),bx1=px(BC+T.w/2);
    ctx.fillStyle=rgba(COL.classic,.22);ctx.fillRect(bx0,vy(T.V0),Math.max(2,bx1-bx0),bot-vy(T.V0));
    ctx.fillStyle=COL.classic;ctx.fillRect(bx0,vy(T.V0),Math.max(2,bx1-bx0),2);
    txt(ctx,L('壁（高さ 1）','Wall (height 1)'),bx1+6,vy(T.V0)+4,COL.classic,11,'left','body');
    // energy
    dashLine(ctx,[[l,vy(T.E)],[r,vy(T.E)]],rgba(COL.hit,.7),1.2);
    txt(ctx,L('粒子のエネルギー ','Particle energy ')+T.E.toFixed(2),l+4,vy(T.E)-5,COL.hit,11,'left','body');
    // density
    const dim=T.meas?.35:1;
    const i0=Math.floor(xa/dx),i1=Math.ceil(xb/dx);const cw=(r-l)/((xb-xa)/dx)+.6;
    if(T.phase){for(let i=i0;i<i1;i++){const p=T.R[i]**2+T.I[i]**2;if(p<1e-7)continue;const y=ry(p);const hue=(Math.atan2(T.I[i],T.R[i])*180/Math.PI+360)%360;
        ctx.fillStyle=`hsla(${hue},75%,62%,${.85*dim})`;ctx.fillRect(px(i*dx),y,cw,bot-y);}}
    else{ctx.fillStyle=rgba(COL.wave,.5*dim);ctx.beginPath();ctx.moveTo(px(i0*dx),bot);for(let i=i0;i<i1;i++)ctx.lineTo(px(i*dx),ry(T.R[i]**2+T.I[i]**2));ctx.lineTo(px(i1*dx),bot);ctx.fill();}
    ctx.strokeStyle=rgba(COL.fg,.85*dim);ctx.lineWidth=1.2;ctx.beginPath();for(let i=i0;i<i1;i++){const y=ry(T.R[i]**2+T.I[i]**2);i===i0?ctx.moveTo(px(i*dx),y):ctx.lineTo(px(i*dx),y);}ctx.stroke();
    ctx.fillStyle=COL.line;ctx.fillRect(l,bot,r-l,1);
    txt(ctx,L('← はね返り','← bounced back'),l+4,bot+16,COL.mute,11,'left','body');txt(ctx,L('通り抜け →','got through →'),r-4,bot+16,COL.mute,11,'right','body');
    // measurement
    if(T.meas){const x=px(Math.min(xb-1,Math.max(xa+1,T.meas.x)));ctx.strokeStyle=COL.hit;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,bot);ctx.lineTo(x,30);ctx.stroke();
      ctx.fillStyle=COL.hit;ctx.beginPath();ctx.arc(x,30,6,0,7);ctx.fill();
      const lab=T.meas.side==='thru'?L('ここで見つかった（通り抜けた）','Found here (got through)'):T.meas.side==='back'?L('ここで見つかった（はね返った）','Found here (bounced back)'):L('ここで見つかった（壁の中）','Found here (inside the wall)');
      txt(ctx,lab,x+(x>w*.6?-10:10),20,COL.hit,12,x>w*.6?'right':'left','body');}
    // readouts
    const [Lb,M,Rr]=parts();
    $('#tunR').textContent=pct(Lb);$('#tunIn').textContent=pct(M);$('#tunT').textContent=pct(Rr);
    $('#tunTally').textContent=(T.tally.thru+T.tally.back)?L(`通過 ${T.tally.thru} / はね返り ${T.tally.back}`,`through ${T.tally.thru} / back ${T.tally.back}`):'—';
  }
  range('#tunE',v=>v.toFixed(2),v=>{T.E=v;fireNew();});
  range('#tunW',v=>v.toFixed(2),v=>{T.w=v;fireNew();});
  $('#tunFire').addEventListener('click',fireNew);
  $('#tunPause').addEventListener('click',()=>{if(T.meas||T.done){fireNew();return;}setRun(!T.running);});
  $('#tunMeasure').addEventListener('click',measure);
  $('#tunPhase').addEventListener('change',e=>T.phase=e.target.checked);
  fireNew();
  return {T,step,draw,fireNew,measure,parts};
})();

