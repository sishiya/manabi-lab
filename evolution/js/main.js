'use strict';
// camera, view switching, labels, frame loop, debug handle
/* ------------------------------------------------------------------ camera */
const cam={th:.75,ph:.92,r:250,tx:0,ty:0,tz:0};
function placeCam(){camera.position.set(cam.tx+cam.r*Math.sin(cam.ph)*Math.sin(cam.th),cam.ty+cam.r*Math.cos(cam.ph),cam.tz+cam.r*Math.sin(cam.ph)*Math.cos(cam.th));camera.lookAt(cam.tx,cam.ty,cam.tz)}
const ptrs=new Map();let drag=null,moved=0,pinch0=0;
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=0;drag={pan:e.button===2||e.shiftKey};if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch0=Math.hypot(a.x-b.x,a.y-b.y)}$('hint').style.opacity=0});
cv.addEventListener('pointermove',e=>{
  const p=ptrs.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;moved+=Math.abs(dx)+Math.abs(dy);
  const globe=effView()==='globe';
  if(ptrs.size===2){const [a,b]=[...ptrs.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch0)zoomBy(pinch0/d);pinch0=d;if(!globe)panBy(dx*.5,dy*.5);return}
  if(globe){gcam.th-=dx*.005;gcam.ph=clamp(gcam.ph-dy*.005,.15,2.99);return}
  if(drag&&drag.pan)panBy(dx,dy);else{cam.th-=dx*.006;cam.ph=clamp(cam.ph-dy*.005,.12,1.42)}
});
/* two scales: the field (surface) and the whole planet (globe). Zooming past either end crosses over. */
let viewMode='surface',zoomPush=0,camTargetR=null,gTargetR=null;
const SMAX=700,GMIN=13.5,GMAX=900;
const defaultGR=()=>42*Math.pow(Math.max(1,1.3/(innerWidth/innerHeight)),.85);
const effView=()=>A>4.545e9?'globe':viewMode;
function setView(m,fromWheel){
  if(m===viewMode)return;
  const fade=$('fade');fade.style.opacity=1;
  setTimeout(()=>{viewMode=m;
    if(m==='globe'){gcam.r=fromWheel?GMIN+1:30;gTargetR=defaultGR()}
    else{cam.r=fromWheel?SMAX:400;camTargetR=userZoomed?260:250*Math.pow(Math.max(1,1.3/camera.aspect),.85)}
    updateViewUI();fade.style.opacity=0},REDUCED?0:280);
}
function updateViewUI(){const g=effView()==='globe';$('bView').textContent=viewMode==='globe'?'地表を見る':'地球を見る';$('bView').setAttribute('aria-pressed',String(viewMode==='globe'));
  $('mini').hidden=!(g&&A<=4.545e9);$('preEarth').hidden=!(A>4.545e9)}
function zoomBy(f){// f>1 zooms out
  if(effView()==='globe'){gTargetR=null;const nr=gcam.r*f;
    if(nr<GMIN&&f<1){gcam.r=GMIN;if(A<=4.545e9){zoomPush+=Math.log(1/f);if(zoomPush>.28){zoomPush=0;setView('surface',true)}}}
    else{zoomPush=0;gcam.r=Math.min(nr,GMAX)}}
  else{userZoomed=true;camTargetR=null;const nr=cam.r*f;
    if(nr>SMAX&&f>1){cam.r=SMAX;zoomPush+=Math.log(f);if(zoomPush>.28){zoomPush=0;setView('globe',true)}}
    else{zoomPush=0;cam.r=Math.max(nr,25)}}
}
$('bView').onclick=()=>setView(viewMode==='globe'?'surface':'globe');
$('mini').onclick=()=>setView('surface');
function panBy(dx,dy){const k=cam.r*.0016;const fx=Math.cos(cam.th),fz=-Math.sin(cam.th);cam.tx-=dx*k*fx+dy*k*Math.sin(cam.th);cam.tz-=dx*k*fz+dy*k*Math.cos(cam.th);cam.tx=clamp(cam.tx,-110,110);cam.tz=clamp(cam.tz,-110,110)}
cv.addEventListener('pointerup',e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch0=0;if(moved<5&&e.button===0)pickAt(e)});
cv.addEventListener('pointercancel',e=>{ptrs.delete(e.pointerId)});
cv.addEventListener('wheel',e=>{e.preventDefault();zoomBy(Math.exp(clamp(e.deltaY,-120,120)*.0011))},{passive:false});
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
function pickAt(e){
  if(effView()==='globe')return;
  ndc.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);ray.setFromCamera(ndc,camera);
  const hits=ray.intersectObjects(pickables.filter(m=>m.count>0),false);const pk=$('pick');
  if(!hits.length){pk.hidden=true;return}
  const s=hits[0].object.userData.sp;
  pk.innerHTML=`<b>${s.name}</b><small>${s.to>0?fmtShort(s.from)+' 〜 '+fmtShort(s.to):fmtShort(s.from)+' 〜 現在'}</small>`;
  pk.style.left=Math.min(e.clientX+14,innerWidth-250)+'px';pk.style.top=Math.max(e.clientY-20,10)+'px';pk.hidden=false;
  clearTimeout(pickAt.t);pickAt.t=setTimeout(()=>pk.hidden=true,3500);
}

/* ------------------------------------------------------------------ labels */
const labRoot=$('labels'),labPool=[];
function labelAt(i,text,cls,x,y,z,cm){let el=labPool[i];if(!el){el=document.createElement('div');labRoot.appendChild(el);labPool[i]=el}
  _v.set(x,y,z);if(!cm)_v.applyMatrix4(world.matrixWorld);_v.project(cm||camera);if(_v.z>1){el.hidden=true;return}
  el.hidden=false;el.className='lab '+cls;el.textContent=text;el.style.transform=`translate(${(_v.x*.5+.5)*innerWidth}px,${(-_v.y*.5+.5)*innerHeight}px) translate(-50%,-100%) translateY(-12px)`}
function firstPos(s){const v=s.vis[0];if(!v)return null;return [v.x,(v.y!==undefined?v.y:Hat(v.x,v.z)),v.z]}
const _mw=new THREE.Vector3();
function updateLabels(time){
  let n=0;
  if(effView()==='globe'){
    if(A<=4.545e9){gMarker.getWorldPosition(_mw);const facing=_mw.clone().normalize().dot(gCamera.position.clone().sub(_mw).normalize())>.15;
      if(facing)labelAt(n++,'観測地点','anc',_mw.x*1.02,_mw.y*1.02,_mw.z*1.02,gCamera)}
    for(let i=n;i<labPool.length;i++)labPool[i].hidden=true;
    if($('ancSeen').textContent!=='地表のながめで見られる。')$('ancSeen').textContent='地表のながめで見られる。';
    return;
  }
  const an=ANCESTORS[Math.max(0,lastAnc)],ak=an&&an[3],as=ak&&SPK[ak];
  ring.visible=false;
  let seenTxt='この画面では見えない大きさ。';
  if(as&&as.vis.length){const v=as.vis[0],y=(v.y!==undefined?v.y:Hat(v.x,v.z));const s=as.size*(1.1+.08*Math.sin(time*3));ring.position.set(v.x,y+.15,v.z);ring.scale.setScalar(s);ring.visible=true;
    labelAt(n++,'祖先 · '+as.name.replace(/（.*/,''),'anc',v.x,y+as.size*1.1,v.z);seenTxt='画面の黄色い輪が祖先（に近いなかま）。'}
  else if(as)seenTxt='いまは画面の外にいる。';
  if($('ancSeen').textContent!==seenTxt)$('ancSeen').textContent=seenTxt;
  for(const s of SPECIES){if(!(showNames||labelSet.has(s.k))||s===as)continue;const p=firstPos(s);if(!p)continue;labelAt(n++,displayName(s).replace(/（(?!生き残り).*）/,''),'',p[0],p[1]+s.size*1.2,p[2])}
  for(let i=n;i<labPool.length;i++)labPool[i].hidden=true;
}

/* ------------------------------------------------------------------ loop */
let userZoomed=false;
const miniCam=new THREE.PerspectiveCamera(40,4/3,1,5000);
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();gCamera.aspect=w/h;gCamera.updateProjectionMatrix();gcam.r=defaultGR();if(!userZoomed)cam.r=250*Math.pow(Math.max(1,1.3/camera.aspect),.85);drawTL()}
addEventListener('resize',resize);resize();
let last=performance.now(),time=0;
const PLAY_SECONDS=180;
const SPECIAL_U=[[4.51e9],[6.6e7],[2.52e8],[7e6],[3e5]];
function frame(now){
  try{
  const dt=Math.min(.05,(now-last)/1000);last=now;time+=dt;U.time.value=time;waterMat.uniforms.uTime.value=time;
  if(tween){tween.t+=dt/1.1;const k=sm(tween.t);setU(lerp(tween.from,tween.to,k));if(tween.t>=1)tween=null}
  // the timeline holds still while "about this app" is open (play/pause itself is left as is)
  else if(playing&&!tlDrag&&$('about').hidden){
    let slow=1;if(scaleMode==='ev')for(const [a] of SPECIAL_U){const d=(Uu-A2u_ev(a))/.006;slow=Math.min(slow,1-.75*Math.exp(-d*d))}
    let nu=Uu+dt*speed/PLAY_SECONDS*slow;if(nu>=1){nu=1;setPlaying(false)}
    // stop once at today: what follows is a forecast
    const nowU=A2u(0);if(Uu<nowU&&nu>=nowU&&!frame.pastNow){frame.pastNow=true;nu=nowU;setPlaying(false);toast('ここから先は予測です。▶ で未来へ進みます（排出シナリオは下のメニューで選べます）')}
    setU(nu);
  }
  if(dirty){applyTime();dirty=false}
  stepAgents(dt,A,time);
  stepMeteors(dt,A);
  // time of day drives the field's sun and the planet's spin together
  const dl=stepDay(dt);applyDaylight(dl);
  stepGlobe(dt,A,dayT);
  const ev=effView();
  if(ev!==frame.lastView){frame.lastView=ev;updateViewUI()}
  if(camTargetR!==null){cam.r+=(camTargetR-cam.r)*Math.min(1,dt*3);if(Math.abs(camTargetR-cam.r)<1)camTargetR=null}
  if(gTargetR!==null){gcam.r+=(gTargetR-gcam.r)*Math.min(1,dt*3);if(Math.abs(gTargetR-gcam.r)<.2)gTargetR=null}
  // clouds
  const nc=showClouds?Math.round(CLN*E.cloud*(E.tile>.5?1:0)):0;clouds.count=nc;cloudMat.opacity=.35+.3*E.cloud;
  for(let i=0;i<nc;i++){const c=clD[i];c.x+=dt*2.2;if(c.x>125)c.x=-125;setInst(clouds,i,c.x,c.y,c.z,c.r,c.s*1.4,c.s*.35,null)}clouds.instanceMatrix.needsUpdate=true;
  // cinematic overlays
  const sq=seqState(dt);
  const fl=REDUCED?sq.flash*.3:sq.flash;
  flashEl.style.opacity=String(Math.max(fl,sq.heat*.45));
  flashEl.style.background=sq.heat>fl?`radial-gradient(ellipse at 20% 0%,rgba(255,120,40,.9),rgba(140,30,10,.5) 70%)`:`radial-gradient(circle at 25% 15%,rgba(${sq.col},1),rgba(${sq.col},.6) 60%)`;
  if(seq&&seq.type==='kpg'&&seq.t<1.4){const t=seq.t/1.4;bigMet.head.visible=true;const d=new THREE.Vector3(-.75,.55-.5*t,-.6).normalize();bigMet.head.position.copy(d).multiplyScalar(700);bigMet.head.scale.setScalar(30+160*t)}else bigMet.head.visible=false;
  sun.intensity=baseLights.sun*dl*(1-sq.dark*.85);hemi.intensity=baseLights.amb*(.16+.84*dl)*(1-sq.dark*.7);
  if(sq.dark>0){scene.fog.density=Math.max(scene.fog.density,.006*sq.dark)}
  const shake=seq&&seq.type==='theia'&&!REDUCED&&seq.t<2?(1-seq.t/2):0;
  placeCam();placeGCam();
  if(shake){camera.position.x+=(rnd()-.5)*shake*2;camera.position.y+=(rnd()-.5)*shake*2;gCamera.position.x+=(rnd()-.5)*shake*.6;gCamera.position.y+=(rnd()-.5)*shake*.6}
  sun.target.position.set(0,0,0);
  updateLabels(time);
  const w=innerWidth,h=innerHeight;
  renderer.setScissorTest(false);renderer.setViewport(0,0,w,h);
  if(ev==='surface')renderer.render(scene,camera);
  else{
    renderer.render(gScene,gCamera);
    if(!$('mini').hidden){
      const r=$('mini').getBoundingClientRect(),y=h-r.bottom;
      miniCam.aspect=r.width/r.height;miniCam.updateProjectionMatrix();
      const mr=Math.min(cam.r,300);miniCam.position.set(cam.tx+mr*Math.sin(cam.ph)*Math.sin(cam.th),cam.ty+mr*Math.cos(cam.ph),cam.tz+mr*Math.sin(cam.ph)*Math.cos(cam.th));miniCam.lookAt(cam.tx,cam.ty,cam.tz);
      renderer.setScissorTest(true);renderer.setScissor(r.left,y,r.width,r.height);renderer.setViewport(r.left,y,r.width,r.height);
      renderer.render(scene,miniCam);renderer.setScissorTest(false);renderer.setViewport(0,0,w,h);
    }
  }
  }catch(err){window.__evErr.push(String(err&&err.stack||err))}
}
function loop(now){frame(now);if(window.__evErr.length<=20)requestAnimationFrame(loop)}
setU(0);setPlaying(true);
requestAnimationFrame(loop);
setTimeout(()=>{$('hint').style.opacity=0},12000);

/* debug handle */
window.__ev={setAge:a=>{tween=null;setPlaying(false);setU(A2u(a))},get A(){return A},get W(){return W},E,SPECIES,SPK,frame:(n=1,dt=1/30)=>{for(let i=0;i<n;i++){last=performance.now()-dt*1000;frame(performance.now())}},cam,gcam,get MODEL(){return MODEL},runModel,modelAt,FORCE,setPlaying,setView,setDayMode,get dayT(){return dayT},set dayT(v){dayT=v},visible:()=>visibleSpecies().map(s=>s.k+':'+s.mesh.count)};

function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,6000)}
