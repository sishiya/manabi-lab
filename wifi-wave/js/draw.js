'use strict';
if(!window.__wwGL) throw new Error("wifi-wave: WebGL2 の準備ができなかったので止める");   // gl.js が止まったとき
// ================= drawing =================
function drawOverlay(now){
  const c=octx, k=scale*dpr;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,ov.width,ov.height);
  c.setTransform(dpr,0,0,dpr,0,0);
  const P=([x,y])=>[x*scale,y*scale];
  c.textAlign='center';c.textBaseline='middle';
  const small=W*scale<560;   // phone portrait: the map is only ~350px wide
  // room labels
  const lf=small?9:Math.max(10,12*Math.min(1.2,scale/0.7));
  c.font=`500 ${lf}px 'Zen Kaku Gothic New',sans-serif`;
  for(const [t,x,y] of S.labels){const [sx,sy]=P([x,y]);c.fillStyle='rgba(8,14,28,.55)';const w=c.measureText(t).width+(small?6:10);c.fillRect(sx-w/2,sy-lf*.75,w,lf*1.5);c.fillStyle='rgba(225,235,255,.85)';c.fillText(t,sx,sy);}
  // lane probes
  for(const p of S.probes){
    const [sx,sy]=P([p.x,p.y]);
    if(small){
      const v=p.ref?'0':(!p.ready?'…':p.rel<-60?L('届かない','blocked'):`${p.rel>=0?'+':'−'}${Math.abs(p.rel).toFixed(0)}dB`);
      c.font=`500 10px 'Zen Kaku Gothic New',sans-serif`;
      const t=`${p.short} ${v}`, w=c.measureText(t).width+8;
      c.fillStyle='rgba(8,14,28,.8)';c.beginPath();c.roundRect(sx-w/2,sy-7,w,14,3);c.fill();
      c.fillStyle=p.ref?'#cfd8ea':'#ffc95a';c.fillText(t,sx,sy);
      continue;
    }
    const txt=p.ref?L('基準 0 dB','reference 0 dB'):(!p.ready?'…':p.rel<-60?L('届かない（−60 dB以下）','blocked (below −60 dB)'):`${p.rel>=0?'+':'−'}${Math.abs(p.rel).toFixed(1)} dB`);
    c.font=`500 12px 'Zen Kaku Gothic New',sans-serif`;
    const w=Math.max(c.measureText(p.name).width,c.measureText(txt).width)+16;
    c.fillStyle='rgba(8,14,28,.78)';c.beginPath();c.roundRect(sx-w/2,sy-19,w,38,6);c.fill();
    c.fillStyle='rgba(200,215,240,.9)';c.fillText(p.name,sx,sy-8);
    c.font=`500 13px 'IBM Plex Mono',monospace`;c.fillStyle=p.ref?'#cfd8ea':'#ffc95a';c.fillText(txt,sx,sy+9);
  }
  // source
  const pulse=(now/1000)%1;
  if(S.line){
    const x=S.lineX*scale;c.strokeStyle='rgba(255,201,90,.9)';c.setLineDash([6,5]);c.lineWidth=2;c.beginPath();c.moveTo(x,0);c.lineTo(x,H*scale);c.stroke();c.setLineDash([]);
    c.save();c.translate(x+12,H*scale/2);c.rotate(-Math.PI/2);c.fillStyle='rgba(255,220,150,.95)';c.font=`500 ${small?10:12}px 'Zen Kaku Gothic New',sans-serif`;c.fillText(L('まっすぐな波の発生源','Source of straight waves'),0,0);c.restore();
  } else {
    const [rx,ry]=P(S.router);
    if(!reduceMotion){c.strokeStyle=`rgba(255,201,90,${.6*(1-pulse)})`;c.lineWidth=2;c.beginPath();c.arc(rx,ry,10+pulse*26,0,7);c.stroke();}
    c.fillStyle='#ffc95a';c.strokeStyle='#1a1406';c.lineWidth=2;c.beginPath();c.arc(rx,ry,9,0,7);c.fill();c.stroke();
    c.strokeStyle='#1a1406';c.lineWidth=1.6;c.beginPath();c.moveTo(rx-3,ry+3);c.lineTo(rx-3,ry-4);c.moveTo(rx+3,ry+3);c.lineTo(rx+3,ry-4);c.stroke();
    const rt=L('ルーター','Router');
    if(small){c.font=`700 9px 'Zen Kaku Gothic New',sans-serif`;c.fillStyle='rgba(8,14,28,.7)';c.fillRect(rx-20,ry+11,40,13);c.fillStyle='#ffd88a';c.fillText(rt,rx,ry+17.5);}
    else{c.font=`700 12px 'Zen Kaku Gothic New',sans-serif`;c.fillStyle='rgba(8,14,28,.7)';c.fillRect(rx-27,ry+13,54,17);c.fillStyle='#ffd88a';c.fillText(rt,rx,ry+22);}
  }
  // phone
  {
    const [px,py]=P(S.phone);
    const q=small?.7:1;
    c.fillStyle='#0b1322';c.strokeStyle='#e8eefb';c.lineWidth=2*q;c.beginPath();c.roundRect(px-7*q,py-11*q,14*q,22*q,3*q);c.fill();c.stroke();
    c.fillStyle='#e8eefb';c.fillRect(px-2*q,py+6*q,4*q,1.6*q);
    const v=$('roVal').textContent, u=S.line?'dB':'dBm';
    c.font=`500 ${small?10:12}px 'IBM Plex Mono',monospace`;const t=`${v} ${u}`,w=c.measureText(t).width+14*q;
    c.fillStyle='rgba(8,14,28,.82)';c.beginPath();c.roundRect(px-w/2,py-36*q,w,19*q,5*q);c.fill();
    c.fillStyle=getComputedStyle($('roBars')).color;c.fillText(t,px,py-26.5*q);
  }
  // drawing preview
  if(drag&&drag.kind==='wall'){
    const m=MAT[S.tool],th=Math.max(2,Math.max(...m.layers.flat().map(Math.abs))*2/CM_PER_CELL*scale);
    c.strokeStyle=rgb(m.rgb);c.globalAlpha=.8;c.lineWidth=th;c.lineCap='square';c.beginPath();c.moveTo(...P(drag.p0));c.lineTo(...P(drag.p1));c.stroke();c.globalAlpha=1;
    const L=Math.hypot(drag.p1[0]-drag.p0[0],drag.p1[1]-drag.p0[1])*DX;const [mx,my]=P([(drag.p0[0]+drag.p1[0])/2,(drag.p0[1]+drag.p1[1])/2]);
    c.font=`500 12px 'IBM Plex Mono',monospace`;c.fillStyle='rgba(8,14,28,.8)';c.fillRect(mx-28,my-24,56,17);c.fillStyle='#fff';c.fillText(L.toFixed(2)+' m',mx,my-15);
  }
  if(S.hover&&!drag&&S.tool==='erase'){const [hx,hy]=P(S.hover);c.strokeStyle='rgba(255,255,255,.6)';c.lineWidth=1;c.beginPath();c.arc(hx,hy,20*scale,0,7);c.stroke();}
  // scale bar
  const bx=14,by=H*scale-14,bl=M(1)*scale;
  c.strokeStyle='rgba(225,235,255,.8)';c.lineWidth=2;c.beginPath();c.moveTo(bx,by-5);c.lineTo(bx,by);c.lineTo(bx+bl,by);c.lineTo(bx+bl,by-5);c.stroke();
  c.textAlign='left';c.font=`500 11px 'IBM Plex Mono',monospace`;c.fillStyle='rgba(225,235,255,.85)';c.fillText('1 m',bx+bl+6,by-3);
}
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

function display(){
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,cv.width,cv.height);
  gl.useProgram(dispP.p);gl.bindVertexArray(vao);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sim.tex[sim.cur]);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,sim.mt);
  const u=dispP.u;
  gl.uniform1i(u.uS,0);gl.uniform1i(u.uM,1);
  gl.uniform2f(u.uView,cv.width,cv.height);gl.uniform1i(u.uMode,S.mode==='wave'?0:1);
  gl.uniform2f(u.uSrc,S.line?-1e4:Math.round(S.router[0])+.5,S.line?0:Math.round(S.router[1])+.5);
  gl.uniform1i(u.uLine,S.line?1:0);
  gl.uniform1f(u.uC,CAL[S.freq].C);gl.uniform1f(u.uRef,CAL[S.freq].L);
  gl.uniform1f(u.uFS,20*Math.log10(FREQ[S.freq].mhz)-27.55);
  gl.uniform1f(u.uSmooth,S.smooth?lambdaCells(FREQ[S.freq].ghz)*.5:0);
  gl.uniform1f(u.uComp,S.comp?1:0);
  gl.uniform3fv(u.uMatCol,new Float32Array(MATS.flatMap(m=>m.rgb||[0,0,0])));
  gl.uniform1fv(u.uMatA,new Float32Array(MATS.map(m=>m.al||0)));
  gl.drawArrays(gl.TRIANGLES,0,3);
}

function fmtOku(x){
  if(LANG==='en'){
    if(x>=1e12) return (x/1e12).toFixed(x>=1e13?0:1)+' trillion';
    if(x>=1e9) return (x/1e9).toFixed(x>=1e10?0:1)+' billion';
    if(x>=1e6) return (x/1e6).toFixed(x>=1e7?0:1)+' million';
    return Math.round(x).toLocaleString('en');
  }
  if(x>=1e12) return (x/1e12).toFixed(x>=1e13?0:1)+'兆';
  if(x>=1e8) return (x/1e8).toFixed(x>=1e9?0:1)+'億';
  if(x>=1e4) return (x/1e4).toFixed(0)+'万';
  return x.toFixed(0);
}

let last=performance.now(), ftAvg=16, cap=64, frame=0, stepsPerSec=0;
function loop(now){
  try{
    const dt=now-last;last=now;ftAvg+= (Math.min(dt,100)-ftAvg)*.05;
    if(ftAvg>30&&cap>2)cap=Math.max(2,Math.floor(cap*.9));else if(ftAvg<19&&cap<64)cap++;
    const want=SPEEDS[S.speedIdx], steps=S.paused?0:Math.min(want,cap);
    if(steps){
      const src=S.line?[S.lineX,0]:[Math.round(S.router[0]),Math.round(S.router[1])];
      sim.begin(src,S.line,lut);
      const T=2*Math.PI/OMEGA;
      for(let i=0;i<steps;i++){const n=sim.n;sim.step(Math.sin(OMEGA*n)*Math.min(1,n/(2*T)));}
    }
    stepsPerSec+=(steps*1000/Math.max(dt,1)-stepsPerSec)*.05;
    display();
    if(frame%8===0) updateReadout();
    drawOverlay(now);
    if(frame%15===0){
      const ns=sim.n*DT*1e9, slow=stepsPerSec>0?1/(stepsPerSec*DT):0;
      $('timeCap').textContent=L(`経過 ${ns.toFixed(2)} ナノ秒（光は ${(ns*0.2998).toFixed(2)} m 進む）\n`,`${ns.toFixed(2)} ns elapsed (light travels ${(ns*0.2998).toFixed(2)} m)\n`)
        +(S.paused?L('一時停止中','Paused'):L(`実際より ${fmtOku(slow)}倍 ゆっくり`,`${fmtOku(slow)} times slower than real life`))+(want>steps&&!S.paused?L('（GPUの速さに合わせて調整中）',' (adjusting to your GPU’s speed)'):'');
    }
    frame++;
  }catch(err){window.__wwErr=err;console.error(err);}
  requestAnimationFrame(loop);
}
$('timeCap').style.whiteSpace='pre-line';

