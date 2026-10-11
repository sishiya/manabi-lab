'use strict';
// clouds, meteors, night lights on the surface
/* ------------------------------------------------------------------ clouds, meteors (surface) */
// clouds
const cloudGeo=merge([P(Ic(1,1),0xffffff,[0,0,0],0,[1.6,.7,1.2]),P(Ic(1,1),0xffffff,[1.4,-.1,.3],0,[1.1,.6,1]),P(Ic(1,1),0xffffff,[-1.3,-.15,-.2],0,[1.2,.55,.9]),P(Ic(1,1),0xffffff,[.3,.35,-.4],0,[.9,.6,.8])]);
const cloudMat=new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:.8,depthWrite:false});
const CLN=10,clouds=new THREE.InstancedMesh(cloudGeo,cloudMat,CLN);clouds.frustumCulled=false;clouds.renderOrder=3;world.add(clouds);
const clD=[];for(let i=0;i<CLN;i++)clD.push({x:rr(-120,120),z:rr(-110,110),y:rr(62,80),s:rr(3.5,6.5),r:rnd()*TAU});
let showClouds=false;
// meteors
const glowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,240,1)');gr.addColorStop(.25,'rgba(255,200,120,.8)');gr.addColorStop(1,'rgba(255,120,40,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)})();
const MET=[];
for(let i=0;i<24;i++){
  const head=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
  const tail=new THREE.Mesh(Cy(.0,.9,1,6),new THREE.MeshBasicMaterial({color:0xffb070,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));
  const boom=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
  head.visible=tail.visible=boom.visible=false;world.add(head,tail,boom);
  MET.push({head,tail,boom,t:-1,dur:1,bt:-1,from:new THREE.Vector3(),to:new THREE.Vector3()});
}
function meteorRate(A){
  if(A>4.567e9||E.tile<.5)return 0;
  if(A>4.45e9)return 6;
  if(A>4.12e9)return 1.2;
  if(A>3.8e9)return 3;
  if(A>3.2e9)return .25;
  return 0;
}
let metAcc=0;
function stepMeteors(dt,A){
  metAcc+=meteorRate(A)*dt;
  while(metAcc>=1){metAcc-=1;const m=MET.find(m=>m.t<0&&m.bt<0);if(!m)break;
    m.to.set(rr(-90,90),0,rr(-90,90));m.to.y=Hat(m.to.x,m.to.z);const dir=new THREE.Vector3(rr(-.6,.6),1,rr(-.6,.6)).normalize();m.from.copy(m.to).addScaledVector(dir,rr(160,240));m.t=0;m.dur=rr(.6,1.1);m.sz=rr(3,8)}
  const v=new THREE.Vector3();
  for(const m of MET){
    if(m.t>=0){m.t+=dt/m.dur;
      if(m.t>=1){m.t=-1;m.bt=0;m.head.visible=m.tail.visible=false;m.boom.visible=true;m.boom.position.copy(m.to)}
      else{v.lerpVectors(m.from,m.to,m.t);m.head.position.copy(v);m.head.scale.setScalar(m.sz*1.4);m.head.visible=true;
        const back=new THREE.Vector3().subVectors(m.from,m.to).normalize();const len=m.sz*7;m.tail.position.copy(v).addScaledVector(back,len/2);m.tail.scale.set(m.sz*.35,len,m.sz*.35);m.tail.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),back);m.tail.visible=true}}
    if(m.bt>=0){m.bt+=dt/1.1;if(m.bt>=1){m.bt=-1;m.boom.visible=false}else{m.boom.scale.setScalar(m.sz*(3+9*m.bt));m.boom.material.opacity=1-m.bt}}
  }
}

/* ------------------------------------------------------------------ night lights (surface) */
const lightTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.2,'rgba(255,255,255,.7)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)})();
function lightPoints(n,size){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(n*3),3));g.setDrawRange(0,0);
  const m=new THREE.PointsMaterial({size,map:lightTex,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0});
  const p=new THREE.Points(g,m);p.frustumCulled=false;p.renderOrder=4;world.add(p);
  let k=0;
  return {p,m,begin(){k=0},push(x,y,z,c){if(k>=n)return;g.attributes.position.array.set([x,y,z],k*3);g.attributes.color.array.set([c.r,c.g,c.b],k*3);k++},
    end(){g.setDrawRange(0,k);g.attributes.position.needsUpdate=true;g.attributes.color.needsUpdate=true}};
}
const LC={street:new THREE.Color(1,.82,.55),city:new THREE.Color(1,.7,.4),hut:new THREE.Color(1,.55,.2),head:new THREE.Color(1,1,.9),tail:new THREE.Color(1,.15,.1),fire:new THREE.Color(1,.5,.15),blink:new THREE.Color(1,.2,.2)};
const fixedLights=lightPoints(900,2.4),movingLights=lightPoints(160,1.8),fireLights=lightPoints(20,9);
const CITYDOTS=[];for(let i=0;i<320;i++){const a=rnd()*TAU,r=Math.sqrt(rnd())*50;CITYDOTS.push({x:CITY.x+Math.cos(a)*r,z:CITY.z+Math.sin(a)*r,d:r,q:rnd()})}
function updateFixedLights(A){
  const L=fixedLights;L.begin();
  const rd=roadAmt(A),ub=urb(A),R=urbRadius(A);
  if(rd>0)for(const pl of ROADS){const len=polyLen(pl);for(let s=2;s<len;s+=4.5){const [x,z,h]=polyAt(pl,s);const d=Math.hypot(x-CITY.x,z-CITY.z);if(d>R+12&&hash2(Math.round(s),pl.length)>rd*.45)continue;const ox=Math.cos(h)*1.6,oz=-Math.sin(h)*1.6,y=Hat(x+ox,z+oz);if(y-W<.3)continue;L.push(x+ox,y+1.4,z+oz,LC.street)}}
  if(ub>0)for(const c of CITYDOTS){if(c.d>R-1||c.q>ub+.2)continue;const y=Hat(c.x,c.z);if(y-W<.3)continue;L.push(c.x,y+.8,c.z,LC.city)}
  for(const c of SPK.hut.vis)L.push(c.x+1,Hat(c.x,c.z)+.7,c.z+.6,LC.hut);
  if(A<125)for(let s=4;s<TRAIN.L;s+=10){const [x,z]=polyAt(RAIL,s);L.push(x,Hat(x,z)+1.2,z,LC.street)}
  L.end();
}

