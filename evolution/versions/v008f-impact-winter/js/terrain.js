'use strict';
// renderer, sky, diorama terrain, water, terrain update
/* ------------------------------------------------------------------ renderer + scene */
const cv=$('gl');
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x000000,0);
const camera=new THREE.PerspectiveCamera(40,1,1,5000);
const SUNDIR=new THREE.Vector3(.62,.6,-.5).normalize();// moved by the time of day
const MOONDIR=new THREE.Vector3(-.55,.2,-.8).normalize();
const sun=new THREE.DirectionalLight(0xffffff,1);
sun.position.copy(SUNDIR).multiplyScalar(320);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-150,right:150,top:150,bottom:-150,near:20,far:800});
sun.shadow.bias=-.0006;
scene.add(sun,sun.target);
const hemi=new THREE.HemisphereLight(0xffffff,0x333333,.5);
scene.add(hemi);
const moonLight=new THREE.DirectionalLight(0x8fa6d8,0);moonLight.position.copy(MOONDIR).multiplyScalar(300);scene.add(moonLight);
const U={time:{value:0}};

/* sky dome */
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
 uniforms:{uTop:{value:new THREE.Color()},uHor:{value:new THREE.Color()},uBot:{value:new THREE.Color()},uSunDir:{value:SUNDIR},uSunC:{value:new THREE.Color()},uSunSize:{value:900},uStars:{value:1},uMoonDir:{value:MOONDIR},uMoonR:{value:.03},uMoonA:{value:0},uTime:U.time},
 vertexShader:`varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
 fragmentShader:`uniform vec3 uTop,uHor,uBot,uSunDir,uSunC,uMoonDir;uniform float uSunSize,uStars,uMoonR,uMoonA,uTime;varying vec3 vD;
 float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 void main(){vec3 d=normalize(vD);float y=d.y;
  vec3 c=y>0.?mix(uHor,uTop,pow(y,.55)):mix(uHor,uBot,pow(min(-y*3.,1.),.5));
  vec3 q=floor(d*900.);float s=h3(q);c+=uStars*step(.99965,s)*vec3(.9,.94,1.)*(.4+.6*h3(q+1.3));
  float sd=max(dot(d,uSunDir),0.);c+=uSunC*(pow(sd,uSunSize)*1.4+pow(sd,10.)*.22+pow(sd,2.5)*.06);
  float md=dot(d,uMoonDir);float sr=sin(uMoonR);
  if(uMoonA>0.&&md>cos(uMoonR)){vec3 k=(d-uMoonDir*md)/sr;float kk=min(dot(k,k),1.);vec3 n=k-uMoonDir*sqrt(1.-kk);
   float li=max(dot(n,uSunDir),0.);float edge=smoothstep(1.,.92,kk);c=mix(c,vec3(.78,.76,.72)*(.06+.94*li),uMoonA*edge);}
  gl_FragColor=vec4(c,1.);}`});
const sky=new THREE.Mesh(new THREE.SphereGeometry(2000,32,18),skyMat);
sky.renderOrder=-1;scene.add(sky);

/* ------------------------------------------------------------------ terrain */
const SZ=200,HALF=100,N=160,ST=SZ/N,NV=(N+1)*(N+1);
const world=new THREE.Group();scene.add(world);
const LX=new Float32Array(NV),LZ=new Float32Array(NV),N1=new Float32Array(NV),N2=new Float32Array(NV),N3=new Float32Array(NV),
      CO=new Float32Array(NV),RF=new Float32Array(NV),VO=new Float32Array(NV),CR=new Float32Array(NV),
      DROAD=new Float32Array(NV),DRAIL=new Float32Array(NV),DCITY=new Float32Array(NV),PLOT=new Float32Array(NV),PLOTC=new Uint8Array(NV),
      H=new Float32Array(NV),HW=new Float32Array(NV);
const VOLC=[[30,-40,45],[-50,35,38],[62,55,30]];
const CITY={x:14,z:6};
const ROADS=[[[100,-8],[60,-4],[30,2],[14,6],[2,10],[-2,30],[-1,60],[-6,100]],[[14,6],[16,-30],[22,-70],[28,-100]]];
const RAIL=[[100,42],[72,36],[44,27],[24,20],[6,16]];
function distPoly(x,z,pl){let best=1e9;for(let i=1;i<pl.length;i++){const ax=pl[i-1][0],az=pl[i-1][1],bx=pl[i][0],bz=pl[i][1],dx=bx-ax,dz=bz-az;const t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);const ex=ax+dx*t-x,ez=az+dz*t-z;best=Math.min(best,ex*ex+ez*ez)}return Math.sqrt(best)}
const riftX=(z,n1)=>-40+9*Math.sin(z*.025)+4*n1;
for(let iz=0,i=0;iz<=N;iz++)for(let ix=0;ix<=N;ix++,i++){
  const x=-HALF+ix*ST,z=-HALF+iz*ST;LX[i]=x;LZ[i]=z;
  const n1=fbm(x*.011+3.1,z*.011-7.7,5),n2=fbm(x*.045,z*.045,3),n3=fbm(x*.13+5,z*.13-2,2);
  N1[i]=n1;N2[i]=n2;N3[i]=n3;
  CO[i]=(x*.92+z*.38)/100+.3*n1;
  const dx=x-riftX(z,n1);
  RF[i]=-32*Math.exp(-((dx/20)**2))+9*Math.exp(-(((Math.abs(dx)-34)/14)**2))+3*n2;
  let v=0;for(const [vx,vz,r] of VOLC){const d=Math.hypot(x-vx,z-vz);v+=Math.pow(Math.max(0,1-d/r),1.6)-.45*Math.max(0,1-d/(r*.16))}
  VO[i]=v;
  DROAD[i]=Math.min(...ROADS.map(p=>distPoly(x,z,p)));
  DRAIL[i]=distPoly(x,z,RAIL);
  DCITY[i]=Math.hypot(x-CITY.x,z-CITY.z);
  const px=Math.floor((x+n2*4)/9),pz=Math.floor((z-n2*4)/7);PLOT[i]=hash2(px+500,pz+900);PLOTC[i]=Math.floor(hash2(px,pz+77)*4);
}
// craters of the heavy bombardment, each switched on at its own age
const CRATERS=[];
for(let k=0;k<46;k++){
  const cx=rr(-95,95),cz=rr(-95,95),r=rr(4,15),t=lerp(4.38e9,3.75e9,Math.pow(rnd(),.8)),dep=r*.42;
  const idx=[],val=[];
  for(let i=0;i<NV;i++){const d=Math.hypot(LX[i]-cx,LZ[i]-cz)/r;if(d>1.6)continue;idx.push(i);val.push((d<1?-dep*(1-d*d):0)+dep*.38*Math.exp(-(((d-1)/.2)**2)))}
  CRATERS.push({t,idx,val});
}
const tGeo=new THREE.PlaneGeometry(SZ,SZ,N,N);tGeo.rotateX(-PI/2);
const tPos=tGeo.attributes.position,tCol=new THREE.BufferAttribute(new Float32Array(NV*3),3),tGlow=new THREE.BufferAttribute(new Float32Array(NV),1);
tGeo.setAttribute('color',tCol);tGeo.setAttribute('glow',tGlow);
const terrMat=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.95,metalness:0});
terrMat.onBeforeCompile=sh=>{
  sh.uniforms.uTime=U.time;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float glow;varying float vGlow;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGlow=glow;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vGlow;uniform float uTime;')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(1.,.36,.08)*vGlow*(.85+.15*sin(uTime*2.3+vViewPosition.x*.21+vViewPosition.y*.17));');
};
const terrain=new THREE.Mesh(tGeo,terrMat);terrain.receiveShadow=true;terrain.castShadow=true;terrain.frustumCulled=false;world.add(terrain);

/* diorama sides with strata */
const SK_ROWS=9,SK_BOT=-38;
const skirtEdges=[];// each: list of terrain vertex indices along the edge
{const a=[],b=[],c=[],d=[];for(let k=0;k<=N;k++){a.push(k);b.push(N*(N+1)+(N-k));c.push(k*(N+1)+N);d.push((N-k)*(N+1))}
 // order so faces point outwards
 skirtEdges.push(a.slice().reverse(),b.slice().reverse(),c,d);}
const skGeo=new THREE.BufferGeometry();
const skCount=skirtEdges.length*(N+1)*(SK_ROWS+1);
const skPos=new Float32Array(skCount*3),skCol=new Float32Array(skCount*3),skIdx=[];
{let base=0;const pal=[0x6b4f3a,0x8a6a4a,0x5a4636,0x9a7a56,0x4e3e30,0x7a5a42,0x6a5a48,0x3e322a,0x2a241f];const c=new THREE.Color();
 for(const e of skirtEdges){for(let k=0;k<=N;k++)for(let r=0;r<=SK_ROWS;r++){const j=base+k*(SK_ROWS+1)+r;skPos[j*3]=LX[e[k]];skPos[j*3+2]=LZ[e[k]];c.set(pal[r%pal.length]).multiplyScalar(.85+.15*hash2(k>>3,r));skCol.set([c.r,c.g,c.b],j*3)}
  for(let k=0;k<N;k++)for(let r=0;r<SK_ROWS;r++){const a=base+k*(SK_ROWS+1)+r,b=a+SK_ROWS+1;skIdx.push(a,b,a+1,b,b+1,a+1)}
  base+=(N+1)*(SK_ROWS+1);}}
skGeo.setAttribute('position',new THREE.BufferAttribute(skPos,3));skGeo.setAttribute('color',new THREE.BufferAttribute(skCol,3));skGeo.setIndex(skIdx);
const skirt=new THREE.Mesh(skGeo,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}));skirt.frustumCulled=false;world.add(skirt);
const baseMesh=new THREE.Mesh(new THREE.BoxGeometry(SZ,2,SZ),new THREE.MeshStandardMaterial({color:0x1d1814,roughness:1}));baseMesh.position.y=SK_BOT-1;world.add(baseMesh);

/* water */
const WM=100,WNV=(WM+1)*(WM+1);
const wGeo=new THREE.PlaneGeometry(SZ,SZ,WM,WM);wGeo.rotateX(-PI/2);
const wDepth=new THREE.BufferAttribute(new Float32Array(WNV),1);wGeo.setAttribute('depth',wDepth);
const waterMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,
 uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uDeep:{value:new THREE.Color()},uShal:{value:new THREE.Color()},uSunDir:{value:SUNDIR},uSunC:{value:new THREE.Color()},uLight:{value:1},uIce:{value:0},uWave:{value:.4},uTime:{value:0}}]),
 vertexShader:`attribute float depth;uniform float uTime,uWave;varying float vDepth;varying vec3 vW;
 #include <fog_pars_vertex>
 void main(){vec3 p=position;float w=sin(p.x*.18+uTime*1.3)*.5+sin(p.z*.23-uTime*1.1)*.5+sin((p.x+p.z)*.41+uTime*2.)*.25;
  p.y+=w*uWave*clamp(depth*.4,0.,1.);vDepth=depth;vec4 wp=modelMatrix*vec4(p,1.);vW=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
 }`,
 fragmentShader:`uniform vec3 uDeep,uShal,uSunDir,uSunC;uniform float uLight,uIce,uTime;varying float vDepth;varying vec3 vW;
 #include <fog_pars_fragment>
 void main(){float d=vDepth;if(d<-.3)discard;
  vec3 col=mix(uShal,uDeep,smoothstep(0.,16.,d));float a=mix(.38,.93,smoothstep(0.,10.,d));
  vec3 n=normalize(vec3(sin(vW.x*.7+uTime*1.7)*.07+sin(vW.z*1.3-uTime)*.05,1.,cos(vW.z*.8+uTime*1.4)*.07+cos(vW.x*1.1+uTime*.9)*.05));
  vec3 v=normalize(cameraPosition-vW);vec3 h=normalize(uSunDir+v);
  float spec=pow(max(dot(n,h),0.),110.)*1.3;float fres=pow(1.-max(dot(n,v),0.),3.);
  col=col*uLight+uSunC*spec*(1.-uIce)+fres*.12*uSunC;
  float foam=(1.-smoothstep(0.,.6,d))*(.6+.4*sin(uTime*2.+vW.x*.5+vW.z*.3));col=mix(col,vec3(.9),foam*.5*(1.-uIce));a=max(a,foam*.6);
  float cr=abs(fract(vW.x*.06+sin(vW.z*.05)*.8)-.5)*abs(fract(vW.z*.07+sin(vW.x*.04))-.5);
  float sn=sin(vW.x*.13+sin(vW.z*.09)*2.)*sin(vW.z*.11+sin(vW.x*.07)*2.);vec3 ice=vec3(.86,.92,.95)*uLight*(.95+.05*sn-.06*smoothstep(.004,0.,cr));
  col=mix(col,ice,uIce);a=mix(a,1.,uIce);
  gl_FragColor=vec4(col,a);
 #include <fog_fragment>
 }`});
const water=new THREE.Mesh(wGeo,waterMat);water.frustumCulled=false;water.renderOrder=2;world.add(water);
// water side walls
const wsGeo=new THREE.BufferGeometry();
const wsPos=new Float32Array(4*(N+1)*2*3),wsIdx=[];
for(let e=0;e<4;e++){const ed=skirtEdges[e];for(let k=0;k<=N;k++){const j=(e*(N+1)+k)*2;wsPos[j*3]=LX[ed[k]];wsPos[j*3+2]=LZ[ed[k]];wsPos[j*3+3]=LX[ed[k]];wsPos[j*3+5]=LZ[ed[k]];}
 for(let k=0;k<N;k++){const a=(e*(N+1)+k)*2;wsIdx.push(a,a+2,a+1,a+2,a+3,a+1)}}
wsGeo.setAttribute('position',new THREE.BufferAttribute(wsPos,3));wsGeo.setIndex(wsIdx);
const wsMat=new THREE.MeshBasicMaterial({color:0x224455,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false});
const waterSide=new THREE.Mesh(wsGeo,wsMat);waterSide.frustumCulled=false;world.add(waterSide);

let W=0;// water level
function Hat(x,z){
  const fx=clamp((x+HALF)/ST,0,N-.001),fz=clamp((z+HALF)/ST,0,N-.001),ix=fx|0,iz=fz|0,tx=fx-ix,tz=fz-iz,i=iz*(N+1)+ix;
  return lerp(lerp(H[i],H[i+1],tx),lerp(H[i+N+1],H[i+N+2],tx),tz);
}

/* ------------------------------------------------------------------ terrain update */
const C_=new THREE.Color(),C2=new THREE.Color();
const PAL={grass:new THREE.Color(0xb3a45a),dry:new THREE.Color(0xb8794a),ice:new THREE.Color(0xeef4f7),crust:new THREE.Color(0x1c120e),mat:new THREE.Color(0x4c6a3a),
  urban:new THREE.Color(0x8b8984),road:new THREE.Color(0x4a4744),rail:new THREE.Color(0x3a3430),dead:new THREE.Color(0x5e4a36),ash:new THREE.Color(0x4a4646),
  farm:[0x9a8a40,0x6f8a3a,0x8a6a40,0xa89a58].map(h=>new THREE.Color(h))};
let FX={dead:0,ash:0,haze:0};
function updateTerrain(A){
  const e=E,crat=e.crat;
  if(crat>.01){CR.fill(0);for(const c of CRATERS){if(A>c.t)continue;for(let j=0;j<c.idx.length;j++)CR[c.idx[j]]+=c.val[j]}}
  const fa=farm(A),ub=urb(A),rd=roadAmt(A),rl=railAmt(A),urbR=6+42*Math.pow(ub,.8);
  for(let i=0;i<NV;i++){
    let h=e.relief*(e.coastW*CO[i]*28+N1[i]*16+N2[i]*4)+N3[i]*.6+e.shift+e.vol*VO[i]*28+e.rift*RF[i];
    if(crat>.01)h+=crat*CR[i];
    H[i]=h;
  }
  const col=tCol.array,glow=tGlow.array,P=tPos.array;
  for(let iz=0,i=0;iz<=N;iz++)for(let ix=0;ix<=N;ix++,i++){
    const h=H[i],hw=h-W;P[i*3+1]=h;HW[i]=hw;
    const hx=H[ix<N?i+1:i]-H[ix>0?i-1:i],hz=H[iz<N?i+N+1:i]-H[iz>0?i-N-1:i];
    const slope=clamp(Math.hypot(hx,hz)/(2*ST)*.7,0,1);
    const n2=N2[i];
    C_.copy(e.rockC).multiplyScalar(1-slope*.25+n2*.12);
    if(hw<0){
      C2.copy(e.bedC).lerp(e.rockC,sstep(0,25,-hw)*.5);C_.copy(C2);
      if(e.mats>0&&hw>-8)C_.lerp(PAL.mat,e.mats*(1+hw/8)*.8);
    }else{
      if(hw<1.6&&e.sea>.5)C_.lerp(e.sandC,(1-hw/1.6)*(1-slope));
      const v=clamp(e.veg*1.3*clamp(1.3-hw/(2+60*e.reach),0,1)*clamp(1-slope*.8,0,1)*(.8+.5*n2),0,1);
      if(v>0){C2.copy(e.vegC);if(FX.dead>0)C2.lerp(PAL.dead,FX.dead);C_.lerp(C2,clamp(v,0,1))}
      if(e.grass>0)C_.lerp(PAL.grass,e.grass*sstep(1,8,hw)*clamp(.55+.6*n2,0,1)*.85);
      if(e.dry>0)C_.lerp(PAL.dry,e.dry*sstep(2,20,hw)*.75);
      if(fa>0&&hw>1&&slope<.5&&DCITY[i]>urbR+1&&DCITY[i]<80&&PLOT[i]<fa)C_.lerp(PAL.farm[PLOTC[i]],.85);
      if(ub>0){const m=sstep(urbR,urbR-6,DCITY[i]+N2[i]*10);if(m>0)C_.lerp(PAL.urban,m*.9)}
      if(rd>0&&DROAD[i]<2)C_.lerp(PAL.road,rd*sstep(2,1,DROAD[i]));
      if(rl>0&&DRAIL[i]<1.3)C_.lerp(PAL.rail,sstep(1.3,.6,DRAIL[i]));
    }
    if(e.ice>0){const im=clamp((e.ice*1.7-.65)+h/45+n2*.35,0,1);if(im>0)C_.lerp(PAL.ice,im)}
    if(FX.ash>0)C_.lerp(PAL.ash,FX.ash*.6);
    let g=0;
    if(e.lava>0){C_.lerp(PAL.crust,clamp(e.lava*1.4,0,1));const crk=1-sstep(0,.09,Math.abs(N3[i]));g=e.lava*(.22+.9*crk)}
    if(e.vent>0&&e.vol>0){g=Math.max(g,e.vent*e.vol*sstep(.72,.95,VO[i]+.3*Math.max(0,-CO[i]*0))*1.2)}
    glow[i]=g;
    col[i*3]=C_.r;col[i*3+1]=C_.g;col[i*3+2]=C_.b;
  }
  tPos.needsUpdate=true;tCol.needsUpdate=true;tGlow.needsUpdate=true;
  // strata sides follow the surface
  let base=0;
  for(const ed of skirtEdges){for(let k=0;k<=N;k++){const top=H[ed[k]];for(let r=0;r<=SK_ROWS;r++){const j=base+k*(SK_ROWS+1)+r;skPos[j*3+1]=lerp(top,SK_BOT,Math.pow(r/SK_ROWS,1.25))}}base+=(N+1)*(SK_ROWS+1)}
  skGeo.attributes.position.needsUpdate=true;
  // water depth & side walls
  const wp=wGeo.attributes.position.array,wd=wDepth.array;
  for(let i=0;i<WNV;i++)wd[i]=W-Hat(wp[i*3],wp[i*3+2]);
  wDepth.needsUpdate=true;
  for(let ei=0;ei<4;ei++){const ed=skirtEdges[ei];for(let k=0;k<=N;k++){const j=(ei*(N+1)+k)*2;const hb=H[ed[k]];wsPos[j*3+1]=W;wsPos[j*3+4]=Math.min(hb,W)}}
  wsGeo.attributes.position.needsUpdate=true;
}

