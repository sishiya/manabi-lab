'use strict';
// ancestor ring, impact sequences, applyTime(), time of day
/* ancestor marker */
const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.07,6,40),new THREE.MeshBasicMaterial({color:0xf2b45c,transparent:true,depthTest:false}));
ring.rotation.x=-PI/2;ring.renderOrder=10;ring.visible=false;world.add(ring);

/* ------------------------------------------------------------------ cinematic moments (time-based, triggered on crossing) */
let seq=null;// {type,t}
const flashEl=$('flash');
const REDUCED=matchMedia('(prefers-reduced-motion:reduce)').matches;
function startSeq(type){seq={type,t:0}}
function seqState(dt){
  const o={flash:0,dark:0,col:'255,240,220',heat:0};
  if(!seq)return o;
  seq.t+=dt;const t=seq.t;
  if(seq.type==='theia'){o.flash=t<.4?t/.4:Math.exp(-(t-.4)/.9);o.col='255,190,120';if(t>5)seq=null}
  if(seq.type==='kpg'){o.flash=t<1.3?0:t<1.5?(t-1.3)/.2:Math.exp(-(t-1.5)/.7);o.heat=t<1.3?0:sstep(1.3,2,t)*(1-sstep(3,4.5,t));o.dark=t<2.5?0:sstep(2.5,3.5,t)*(1-sstep(6,9,t));o.col='255,220,170';if(t>9)seq=null}
  return o;
}
const bigMet={head:new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}))};
bigMet.head.visible=false;scene.add(bigMet.head);

/* ------------------------------------------------------------------ apply a time */
let A=4.6e9,Uu=0,lastA=-1,prevA=4.6e9;
const fogC=new THREE.Color(),skyBot=new THREE.Color();
function applyTime(){
  envAt(A);ifAdjustEnv(A);
  // die-offs and ash after the great extinctions
  const dk=(A-6.6e7)/1e6,dp=(A-2.519e8)/1e6;
  const hit=!(worldIF&&IFX.noImpact),kpgDead=hit&&dk<=0?Math.exp(dk/.35):0,kpgAsh=hit&&dk<=0?Math.exp(dk/.12):0;
  const ptDead=(dp<=0?Math.exp(dp/2.5)*.85:Math.exp(-dp*dp/.5)*.6)*Math.min(1,worldIF?IFX.siberia:1);
  FX.dead=Math.max(kpgDead,ptDead);FX.ash=kpgAsh;FX.haze=Math.max(ptDead*.8,kpgAsh);
  // lake level swings with glacial / humid cycles once the rift lake exists
  let w=-40+40*sm(E.sea);
  if(E.rift>.5){const g=glacial(A);w+=(g-.5)*6*sstep(3e6,2.5e6,A);if(A<14500&&A>5500)w+=2.5*sm((14500-A)/2000)*sm((A-5500)/2000)}
  W=w;
  updateTerrain(A);
  world.scale.setScalar(Math.max(.001,sm(E.tile)));
  water.position.y=W;water.visible=E.sea>.02&&E.tile>.5;waterSide.visible=water.visible;
  const wu=waterMat.uniforms;wu.uDeep.value.copy(E.seaC);wu.uShal.value.copy(E.seaS);wu.uIce.value=sstep(.55,.9,E.ice);wu.uWave.value=E.wave;
  // light & sky
  const lum=solarLum(A);
  DAY.top.copy(E.skyT);DAY.hor.copy(E.skyH);DAY.fog.copy(E.fogC);
  if(FX.haze>0){const hz=new THREE.Color(0x8a6a50);DAY.top.lerp(hz,FX.haze*.6);DAY.hor.lerp(hz,FX.haze*.7);DAY.fog.lerp(hz,FX.haze*.7)}
  DAY.stars=E.stars;
  skyMat.uniforms.uSunC.value.copy(E.sunC).multiplyScalar(lum);
  skyMat.uniforms.uSunSize.value=E.disk>.2?120:A<0?lerp(900,25,sstep(3.5e9,5e9,-A)):900;
  const md=A>4.51e9?0:rt('moon',A);
  skyMat.uniforms.uMoonA.value=md?sstep(4.51e9,4.49e9,A)*(1-.7*E.cloud*0):0;
  skyMat.uniforms.uMoonR.value=md?Math.min(.3,.035*384400/md):.03;
  DAY.fogD=E.fogD*(1+FX.haze*1.5);DAY.moon=md>0;
  baseLights={sun:E.sunI*(.5+.5*lum)*(1-FX.ash*.5)*(1-FX.haze*.3),amb:E.amb+.25};
  sun.color.copy(E.sunC);
  plantMat.color.setRGB(1,1,1);
  cloudMat.color.copy(E.cloudC);
  wu.uSunC.value.copy(E.sunC);
  updateStatics(A);
  updateCounts(A);
  updateFixedLights(A);
  updateGlobeTime(A,tempAt(A));
  // the K-Pg and Moon-forming impacts play out in real time when you pass them going forward
  if(prevA>6.6e7&&A<=6.6e7&&prevA-A<3e7&&!(worldIF&&IFX.noImpact))startSeq('kpg');
  if(prevA>4.51e9&&A<=4.51e9&&prevA-A<6e7)startSeq('theia');
  prevA=A;
  updateHUD();
}
let baseLights={sun:1,amb:.5};
const DAY={top:new THREE.Color(),hor:new THREE.Color(),fog:new THREE.Color(),stars:0,fogD:0,moon:false};
function tempAt(A){let tp=rt('temp',A);if(A<2.6e6&&A>11700)tp-=(1-glacial(A))*(A<8e5?5:3);return tp}

/* ------------------------------------------------------------------ time of day */
let dayMode='day',dayT=.42;
const DAY_SECONDS=36;// one 24-hour day in auto mode; shorter in eras when the day was shorter
const NIGHT={top:new THREE.Color(0x03050c),hor:new THREE.Color(0x0e1424),fog:new THREE.Color(0x0a0f1a),dawn:new THREE.Color(0xe8874a)};
function stepDay(dt){
  if(dayMode==='auto'){const hrs=A>4.51e9?6:rt('day',A);dayT=(dayT+dt*24/(DAY_SECONDS*hrs))%1}
  else{const target=dayMode==='day'?.42:0;const d=((target-dayT)%1+1)%1;dayT=(dayT+Math.min(d,dt*.3))%1}
  const th=TAU*(dayT-.25);SUNDIR.set(Math.cos(th)*.8,Math.sin(th)*.85,-.5).normalize();
  sun.position.copy(SUNDIR).multiplyScalar(320);
  return sstep(-.12,.1,SUNDIR.y);
}
function applyDaylight(dl){
  const nt=1-dl,su=skyMat.uniforms;
  su.uTop.value.copy(NIGHT.top).lerp(DAY.top,dl);su.uHor.value.copy(NIGHT.hor).lerp(DAY.hor,dl);
  const dawn=Math.exp(-(((SUNDIR.y-.02)/.12)**2));if(dawn>.01)su.uHor.value.lerp(NIGHT.dawn,dawn*.55);
  fogC.copy(NIGHT.fog).lerp(DAY.fog,dl);if(dawn>.01)fogC.lerp(NIGHT.dawn,dawn*.25);
  skyBot.copy(fogC).multiplyScalar(.45);su.uBot.value.copy(skyBot);
  su.uStars.value=Math.max(DAY.stars,nt*.9);
  scene.fog.color.copy(fogC);scene.fog.density=DAY.fogD;
  hemi.color.copy(su.uHor.value);hemi.groundColor.copy(fogC).multiplyScalar(.5);
  moonLight.intensity=DAY.moon?.4*nt:0;
  waterMat.uniforms.uLight.value=.25+.75*dl;
  uNight.value=sstep(.3,.9,nt);
  const lightsOn=sstep(.2,.8,nt);
  fixedLights.m.opacity=lightsOn;movingLights.m.opacity=lightsOn;fireLights.m.opacity=.35+.65*lightsOn;
  return nt;
}
function setDayMode(m){dayMode=m;$('bDay').textContent='時刻：'+{day:'昼',night:'夜',auto:'自動'}[m]}
$('bDay').onclick=()=>setDayMode({day:'night',night:'auto',auto:'day'}[dayMode]);

