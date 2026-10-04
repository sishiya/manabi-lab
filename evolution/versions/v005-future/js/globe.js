'use strict';
// planet-scale view
/* ------------------------------------------------------------------ globe: the whole planet */
const gScene=new THREE.Scene();
const gCamera=new THREE.PerspectiveCamera(40,1,.1,9000);
const GSUN=new THREE.Vector3(1,0,0),SUN_DIST=420;
const gSunLight=new THREE.DirectionalLight(0xffffff,1.25);gSunLight.position.copy(GSUN).multiplyScalar(100);gScene.add(gSunLight,new THREE.AmbientLight(0x40465a,.18));
{const n=2600,p=new Float32Array(n*3);for(let i=0;i<n;i++){const v=new THREE.Vector3(rnd()*2-1,rnd()*2-1,rnd()*2-1).normalize().multiplyScalar(4000);p.set([v.x,v.y,v.z],i*3)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));gScene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xdfe6ff,size:1.5,sizeAttenuation:false,transparent:true,opacity:.75})))}
const gSunSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xfff2d8,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
gSunSpr.position.copy(GSUN).multiplyScalar(SUN_DIST);gScene.add(gSunSpr);
const NOISE3=`float hs(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(hs(i),hs(i+vec3(1,0,0)),f.x),mix(hs(i+vec3(0,1,0)),hs(i+vec3(1,1,0)),f.x),f.y),mix(mix(hs(i+vec3(0,0,1)),hs(i+vec3(1,0,1)),f.x),mix(hs(i+vec3(0,1,1)),hs(i+vec3(1,1,1)),f.x),f.y),f.z);}
const mat3 RM=mat3(.00,.80,.60,-.80,.36,-.48,-.60,-.48,.64);
float fb(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p=RM*p*2.03;a*=.5;}return s/.97;}`;
const MARK=new THREE.Vector3(Math.cos(.05),Math.sin(.05),0);// the observed field, in the planet's own frame
const earthU={uSun:{value:GSUN},uSea:{value:new THREE.Color()},uSeaS:{value:new THREE.Color()},uRock:{value:new THREE.Color()},uVegC:{value:new THREE.Color()},
  uLand:{value:.6},uVeg:{value:0},uDry:{value:0},uIce:{value:0},uLava:{value:1},uLights:{value:0},uDrift:{value:0},uMark:{value:MARK},uMarkW:{value:.2},uAsh:{value:0},uTime:U.time};
const earthMat=new THREE.ShaderMaterial({uniforms:earthU,
  vertexShader:`varying vec3 vP;varying vec3 vN;varying vec3 vW;void main(){vP=normalize(position);vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`${NOISE3}
  uniform vec3 uSun,uSea,uSeaS,uRock,uVegC,uMark;uniform float uLand,uVeg,uDry,uIce,uLava,uLights,uDrift,uMarkW,uAsh,uTime;varying vec3 vP;varying vec3 vN;varying vec3 vW;
  void main(){vec3 p=vP;vec3 q=p*1.6+vec3(uDrift,uDrift*.37,-uDrift*.61);
   float c=fb(q+.6*vec3(fb(q*1.7+3.1),fb(q*1.7-1.7),0.));
   c+=uMarkW*smoothstep(.45,0.,distance(p,uMark));
   float land=smoothstep(uLand-.01,uLand+.01,c);
   float lat=abs(p.y);float n2=fb(p*7.);
   vec3 sea=mix(uSeaS,uSea,smoothstep(0.,.07,uLand-c));
   vec3 ground=uRock*(.75+.5*n2);
   float desert=uDry*smoothstep(.12,.28,lat)*(1.-smoothstep(.4,.55,lat));
   float veg=uVeg*(1.-smoothstep(.6,.85,lat))*(1.-desert)*smoothstep(.35,.6,n2+.15);
   ground=mix(ground,uVegC,clamp(veg*1.3,0.,1.));
   ground=mix(ground,vec3(.74,.6,.4),desert*.8);
   vec3 col=mix(sea,ground,land);
   float ice=smoothstep(1.-uIce-.04,1.-uIce+.04,lat+(n2-.5)*.15);
   col=mix(col,vec3(.9,.94,.97),ice);
   col=mix(col,vec3(.22,.21,.2),uAsh*.6);
   vec3 N=normalize(vN);float d=dot(N,uSun);float dif=max(d,0.);float tw=smoothstep(-.1,.15,d);
   vec3 V=normalize(cameraPosition-vW);vec3 H=normalize(uSun+V);float spec=pow(max(dot(N,H),0.),60.)*(1.-land)*(1.-ice)*.55;
   vec3 lit=col*(dif*1.1+.025)+spec*vec3(1.,.95,.85)*tw;
   float crk=1.-smoothstep(0.,.07,abs(fb(p*5.+vec3(uTime*.02))-.5));
   vec3 lava=mix(vec3(.11,.05,.03)*(dif+.25),vec3(1.,.38,.08)*(.5+1.3*crk),.2+.8*crk);
   lit=mix(lit,lava,uLava);
   float city=smoothstep(.6,.78,fb(p*24.))*land*(1.-ice)*(1.-smoothstep(.3,.8,lat));
   lit+=(1.-tw)*uLights*city*vec3(1.,.72,.38)*1.6;
   gl_FragColor=vec4(lit,1.);}`});
const earthG=new THREE.Group();gScene.add(earthG);
const EARTH_R=10;
const earth=new THREE.Mesh(new THREE.SphereGeometry(EARTH_R,96,64),earthMat);earthG.add(earth);
const cloudU={uSun:{value:GSUN},uC:{value:new THREE.Color()},uAmt:{value:.5},uTime:U.time};
const gClouds=new THREE.Mesh(new THREE.SphereGeometry(EARTH_R*1.012,72,48),new THREE.ShaderMaterial({uniforms:cloudU,transparent:true,depthWrite:false,
  vertexShader:`varying vec3 vP;varying vec3 vN;void main(){vP=normalize(position);vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`${NOISE3}uniform vec3 uSun,uC;uniform float uAmt,uTime;varying vec3 vP;varying vec3 vN;
  void main(){float n=fb(vP*3.+vec3(uTime*.012,0.,0.))+.18*fb(vP*11.);float a=smoothstep(.78-uAmt*.35,.95-uAmt*.35,n);
   float dif=max(dot(normalize(vN),uSun),0.);gl_FragColor=vec4(uC*(dif*1.05+.03),a*.92);}`}));
earthG.add(gClouds);
const atmoU={uSun:{value:GSUN},uC:{value:new THREE.Color(0x8ab4ff)},uK:{value:1}};
const atmo=new THREE.Mesh(new THREE.SphereGeometry(EARTH_R*1.06,64,40),new THREE.ShaderMaterial({uniforms:atmoU,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`varying vec3 vN;varying vec3 vW;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform vec3 uSun,uC;uniform float uK;varying vec3 vN;varying vec3 vW;
  void main(){vec3 N=normalize(vN),V=normalize(cameraPosition-vW);float f=pow(1.-max(dot(N,V),0.),2.6);float l=smoothstep(-.35,.4,dot(N,uSun));gl_FragColor=vec4(uC*f*l*uK,1.);}`}));
gScene.add(atmo);
const gMarker=new THREE.Mesh(new THREE.TorusGeometry(.42,.07,6,28),new THREE.MeshBasicMaterial({color:0xf2b45c}));
gMarker.position.copy(MARK).multiplyScalar(EARTH_R*1.004);gMarker.lookAt(MARK.clone().multiplyScalar(20));earthG.add(gMarker);
const moon=new THREE.Mesh(new THREE.SphereGeometry(EARTH_R*.273,48,32),new THREE.MeshStandardMaterial({color:0xa8a49c,roughness:1}));gScene.add(moon);
const theia=new THREE.Mesh(new THREE.SphereGeometry(EARTH_R*.53,48,32),new THREE.MeshStandardMaterial({color:0x5a3a2a,roughness:1,emissive:0x401006}));gScene.add(theia);
const THEIA_DIR=new THREE.Vector3(-.85,.18,.2).normalize();
// debris ring after the giant impact
const DEBN=2600,debG=new THREE.BufferGeometry();{const p=new Float32Array(DEBN*3);for(let i=0;i<DEBN;i++){const a=rnd()*TAU,r=EARTH_R*(1.3+Math.pow(rnd(),.6)*2.2);p.set([Math.cos(a)*r,(rnd()-.5)*.8,Math.sin(a)*r],i*3)}debG.setAttribute('position',new THREE.BufferAttribute(p,3))}
const debris=new THREE.Points(debG,new THREE.PointsMaterial({color:0xffa060,size:.35,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));debris.rotation.x=.12;gScene.add(debris);
// protoplanetary disk around the young Sun, seen from where the Earth will form
const GDN=7000,gdPos=new Float32Array(GDN*3),gdCol=new Float32Array(GDN*3),gdR=new Float32Array(GDN),gdA=new Float32Array(GDN),gdY=new Float32Array(GDN);
for(let i=0;i<GDN;i++){const near=i<GDN*.7;const r=near?SUN_DIST+rr(-90,90):rr(60,900);gdR[i]=r;gdA[i]=near?PI+rr(-.45,.45):rnd()*TAU;gdY[i]=(rnd()-.5)*r*.035;
  const t=clamp(1-r/900,0,1);tmpC.setHSL(.07+.05*rnd(),.55,.2+.4*t*rnd()+.1);gdCol.set([tmpC.r,tmpC.g,tmpC.b],i*3)}
const gdGeo=new THREE.BufferGeometry();gdGeo.setAttribute('position',new THREE.BufferAttribute(gdPos,3));gdGeo.setAttribute('color',new THREE.BufferAttribute(gdCol,3));
const gdMat=new THREE.PointsMaterial({size:1.6,map:lightTex,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
const gDisk=new THREE.Points(gdGeo,gdMat);gDisk.frustumCulled=false;gScene.add(gDisk);
const PLN=80,pln=new THREE.InstancedMesh(Ic(1,0),new THREE.MeshStandardMaterial({color:0x6a5a4a,roughness:1}),PLN);pln.frustumCulled=false;gScene.add(pln);
const plnD=[];for(let i=0;i<PLN;i++)plnD.push({r:SUN_DIST+rr(-60,60),a:PI+rr(-.25,.25),s:rr(.3,1.6),y:rr(-2,2)});
const omega=r=>.06*Math.pow(SUN_DIST/r,1.5);
const gcam={th:.35,ph:1.25,r:42};
function placeGCam(){gCamera.position.set(gcam.r*Math.sin(gcam.ph)*Math.sin(gcam.th),gcam.r*Math.cos(gcam.ph),gcam.r*Math.sin(gcam.ph)*Math.cos(gcam.th));gCamera.lookAt(0,0,0)}
const moonUnits=km=>EARTH_R*Math.pow(km/6371,.45);
let moonAng=2.2;
function landThr(f){const t=[[.02,2.05],[.05,1.64],[.1,1.28],[.2,.84],[.3,.52],[.4,.25]];let z=t[0][1];for(let i=1;i<t.length;i++)if(f<=t[i][0]){z=lerp(t[i-1][1],t[i][1],(f-t[i-1][0])/(t[i][0]-t[i-1][0]));break}else z=t[i][1];return .5+.115*z}
function updateGlobeTime(A,temp){
  const u=earthU;
  u.uSea.value.copy(E.seaC);u.uSeaS.value.copy(E.seaS);u.uRock.value.copy(E.rockC);u.uVegC.value.copy(E.vegC);
  u.uLand.value=lerp(0,landThr(rt('land',A)),sm(E.sea));
  u.uVeg.value=E.veg*(1-FX.dead*.8);u.uDry.value=E.dry;
  const snowball=(A<7.25e8&&A>6.3e8)||(A<2.45e9&&A>2.05e9);
  u.uIce.value=snowball?E.ice:Math.max(clamp((24-temp)/60,0,.35),E.ice*.4);
  u.uLava.value=clamp(E.lava*1.15,0,1);u.uAsh.value=FX.ash;
  u.uLights.value=A<12000?sstep(200,0,A)*Math.sqrt(rt('pop',A)/8.2e9)+.05*sstep(8000,200,A):0;
  u.uDrift.value=(AMAX-A)/4e8;u.uMarkW.value=A<4e9?.14:.05;
  cloudU.uC.value.copy(E.cloudC).lerp(new THREE.Color(0x2a2626),FX.ash*.8);
  cloudU.uAmt.value=E.lava>.5?.2:clamp(.45+E.cloud*.45+FX.ash,0,1);
  atmoU.uC.value.copy(E.skyH).lerp(E.skyT,.4);atmoU.uK.value=E.lava>.5?.6:1+E.fogD*120;
  // the planet grows out of the disk
  earthG.scale.setScalar(A>4.567e9?.05:lerp(.05,1,sm((4.567e9-A)/2.7e7)));
  atmo.scale.copy(earthG.scale);
  gDisk.visible=pln.visible=E.disk>.01;gdMat.opacity=Math.min(1,E.disk*1.3);
  gSunSpr.scale.setScalar(A>4.5e9?320:200*(1+3*sstep(3.5e9,5e9,-A)));gSunSpr.material.color.copy(E.sunC);
  // the Moon after the giant impact, receding over time
  const md=A>4.51e9?0:rt('moon',A);
  moon.visible=md>0;moon.userData.d=md?moonUnits(md):0;moon.scale.setScalar(md?sstep(4.51e9,4.495e9,A):0);
  const f=(A-4.51e9)/2.5e7;theia.visible=f>0&&f<1;theia.position.copy(THEIA_DIR).multiplyScalar(EARTH_R*1.5+f*60);
  debris.visible=A<=4.51e9&&A>4.49e9;debris.material.opacity=sstep(4.49e9,4.51e9,A);
}
function stepGlobe(dt,A,dayT){
  earthG.rotation.y=TAU*(dayT-.5);
  gClouds.rotation.y+=dt*.01;
  if(moon.visible){moonAng+=dt*.05;const d=moon.userData.d;moon.position.set(Math.cos(moonAng)*d,Math.sin(moonAng)*d*.09,Math.sin(moonAng)*d)}
  debris.rotation.y+=dt*.25;
  if(gDisk.visible){const w0=omega(SUN_DIST);for(let i=0;i<GDN;i++){gdA[i]+=dt*(omega(gdR[i])-w0);const r=gdR[i];gdPos[i*3]=SUN_DIST+Math.cos(gdA[i])*r;gdPos[i*3+1]=gdY[i];gdPos[i*3+2]=Math.sin(gdA[i])*r}gdGeo.attributes.position.needsUpdate=true;
    for(let i=0;i<PLN;i++){const p=plnD[i];p.a+=dt*(omega(p.r)-w0)*3;setInst(pln,i,SUN_DIST+Math.cos(p.a)*p.r,p.y,Math.sin(p.a)*p.r,p.a,p.s*E.disk,undefined,null)}pln.instanceMatrix.needsUpdate=true}
}

