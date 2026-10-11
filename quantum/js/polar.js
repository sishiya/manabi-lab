'use strict';
/* ================= 3 偏光板 ================= */
EXPS.polar=(()=>{
  const P={on:[true,false,true],ang:[0,45,90],rate:14,running:true,ph:[],acc:0,sent:0,got:0,puffs:[],flash:0};
  const POS=[.32,.52,.72],SRC=.06,DET=.92,SPEED=.32;
  const cv=$('#polCv');
  function reset(){P.ph=[];P.sent=0;P.got=0;P.acc=0;}
  function theory(){let t=.5,prev=null;let any=false;for(let i=0;i<3;i++){if(!P.on[i])continue;if(prev!==null){t*=Math.cos((P.ang[i]-prev)*Math.PI/180)**2;}prev=P.ang[i];any=true;}return any?t:1;}
  function setRun(on){P.running=on;$('#polRun').textContent=on?L('一時停止','Pause'):L('発射','Fire');}
  function step(dt){
    if(P.running){P.acc+=dt*P.rate;while(P.acc>=1){P.acc--;P.ph.push({x:SRC,th:Math.random()*180,next:0});P.sent++;}}
    for(const p of P.ph){const nx=p.x+SPEED*dt;
      while(p.next<3&&nx>=POS[p.next]){const i=p.next++;if(!P.on[i])continue;
        const pass=Math.random()<Math.cos((p.th-P.ang[i])*Math.PI/180)**2;
        if(pass)p.th=P.ang[i];else{p.dead=true;P.puffs.push({i,t:.3,th:p.th});break;}}
      p.x=nx;if(!p.dead&&p.x>=DET){p.dead=true;P.got++;P.flash=.25;}}
    P.ph=P.ph.filter(p=>!p.dead);P.puffs=P.puffs.filter(f=>(f.t-=dt)>0);P.flash=Math.max(0,P.flash-dt);
  }
  function bar(ctx,x,y,th,len,col,w){const a=th*Math.PI/180;ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x-Math.sin(a)*len*.45,y+Math.cos(a)*len);ctx.lineTo(x+Math.sin(a)*len*.45,y-Math.cos(a)*len);ctx.stroke();}
  function draw(){
    const {ctx,w,h}=fit(cv);ctx.clearRect(0,0,w,h);const cy=h/2-6;
    ctx.fillStyle=COL.line;ctx.fillRect(w*SRC,cy-.5,w*(DET-SRC),1);
    // source
    ctx.fillStyle=COL.raise;ctx.strokeStyle=COL.mute;ctx.beginPath();ctx.arc(w*SRC,cy,12,0,7);ctx.fill();ctx.stroke();
    txt(ctx,L('光源','Light source'),w*SRC,cy+34,COL.mute,11,'center','body');txt(ctx,L('偏光はばらばら','random polarization'),w*SRC,cy+48,COL.dim,10,'center','body');
    // filters
    ['A','B','C'].forEach((n,i)=>{const x=w*POS[i];
      ctx.save();ctx.globalAlpha=P.on[i]?1:.22;
      ctx.fillStyle=rgba(COL.wave,.08);ctx.strokeStyle=COL.mute;ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(x,cy,16,58,0,0,7);ctx.fill();ctx.stroke();
      // transmission axis lines (grid)
      const a=P.ang[i]*Math.PI/180;
      for(let k=-2;k<=2;k++){const ox=Math.cos(a)*k*6*.45,oy=Math.sin(a)*k*6;ctx.strokeStyle=rgba(COL.wave,k?.35:.95);ctx.lineWidth=k?1:2;
        ctx.beginPath();ctx.moveTo(x+ox-Math.sin(a)*15*.45*.9,cy+oy+Math.cos(a)*44);ctx.lineTo(x+ox+Math.sin(a)*15*.45*.9,cy+oy-Math.cos(a)*44);ctx.stroke();}
      ctx.restore();
      txt(ctx,n,x,cy-70,P.on[i]?COL.fg:COL.dim,13,'center');
      txt(ctx,P.on[i]?P.ang[i]+'°':L('外した','removed'),x,cy+78,P.on[i]?COL.wave:COL.dim,11,'center');
    });
    for(const f of P.puffs){const a=f.t/.3;ctx.fillStyle=rgba(COL.classic,.7*a);ctx.beginPath();ctx.arc(w*POS[f.i]-4,cy,3+8*(1-a),0,7);ctx.fill();}
    // photons
    for(const p of P.ph){const x=w*p.x;ctx.fillStyle=COL.hit;ctx.beginPath();ctx.arc(x,cy,2.4,0,7);ctx.fill();bar(ctx,x,cy,p.th,9,rgba(COL.hit,.8),1.3);}
    // detector
    const dx=w*DET;ctx.fillStyle=P.flash>0?rgba(COL.hit,.3+P.flash*2.4):COL.raise;ctx.strokeStyle=COL.mute;ctx.fillRect(dx,cy-22,14,44);ctx.strokeRect(dx,cy-22,14,44);
    txt(ctx,L('検出器','Detector'),dx+7,cy+40,COL.mute,11,'center','body');
    $('#polSent').textContent=P.sent;$('#polGot').textContent=P.got;
    $('#polPct').textContent=P.sent>0?pct(P.got/Math.max(1,P.sent-P.ph.length)):'—';
    $('#polTh').textContent=pct(theory());
  }
  const fmt=v=>v+'°';
  [0,1,2].forEach(i=>{range('#polA'+i,fmt,v=>{P.ang[i]=v;reset();});$('#polOn'+i).addEventListener('change',e=>{P.on[i]=e.target.checked;reset();});});
  range('#polRate',v=>v+L(' 個',' /s'),v=>P.rate=v);
  function preset(on,ang){on.forEach((v,i)=>{P.on[i]=v;$('#polOn'+i).checked=v;});ang.forEach((v,i)=>{P.ang[i]=v;setRange('#polA'+i,v,fmt);});reset();setRun(true);}
  $('#polPreA').addEventListener('click',()=>preset([true,false,true],[0,45,90]));
  $('#polPreB').addEventListener('click',()=>preset([true,true,true],[0,45,90]));
  $('#polReset').addEventListener('click',reset);
  $('#polRun').addEventListener('click',()=>setRun(!P.running));
  return {P,step,draw,theory};
})();

