'use strict';
/* ---------- 描画の準備 ---------- */
const canvas=$('gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
renderer.setSize(innerWidth,innerHeight,false);
const FOG_S=[.10,.025,.03];
renderer.setClearColor(new THREE.Color(FOG_S[0],FOG_S[1],FOG_S[2]));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.015,600);
const orbitCam=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.5,2000);

const U={uCam:{value:V3(0,0,0)},uTime:{value:0},uFog:{value:V3(...lin(FOG_S))},uLight:{value:1.55},uMotion:{value:reduceMotion?0:1},
  uOut:{value:0},uStomR:{value:.6},uStomFold:{value:2},uWave:{value:0},uWavePh:{value:0}};
const VS=`
attribute vec3 aCol;attribute float aS;attribute float aAnim;attribute float aVil;
attribute vec3 aAxis;attribute float aRad;attribute float aFold;attribute float aTh;attribute float aStom;
uniform float uTime;uniform float uMotion;uniform vec4 uGate[4];uniform int uNGate;
uniform float uStomR;uniform float uStomFold;uniform float uWave;uniform float uWavePh;
varying vec3 vW;varying vec3 vN;varying vec3 vC;varying float vVil;varying float vGate;
void main(){
#ifdef BLOB
  vec3 p=position;vGate=0.0;
#else
  vec3 off=position-aAxis;float len=length(off);vec3 dir=len>1e-5?off/len:vec3(0.0);
  float fm=mix(1.0,uStomFold,aStom);
  float sc=mix(1.0,uStomR,aStom);
  sc*=1.0-uWave*aStom*pow(max(0.0,sin(aS*0.45-uWavePh)),4.0);
  float gc=0.0;
  for(int i=0;i<4;i++){if(i>=uNGate)break;vec4 g=uGate[i];float d=(aS-g.x)/g.y;gc=max(gc,exp(-d*d)*(1.0-g.z)*g.w);}
  float r=aRad*((1.0+aFold*fm)*sc*(1.0-gc)+0.1*gc*(0.5+0.5*cos(aTh*8.0)));
  float a=0.0;
  if(aAnim>1.5)a=sin(uTime*1.25)*0.025;else if(aAnim>0.5)a=sin(aS*0.7-uTime*1.6)*0.035;
  vec3 p=aAxis+dir*(r+a*uMotion);
  vGate=clamp(gc*1.5+aStom*abs(1.0-sc)*1.5,0.0,1.0);
#endif
  vec4 w=modelMatrix*vec4(p,1.0);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);vC=aCol;vVil=aVil;
  gl_Position=projectionMatrix*viewMatrix*w;
}`;
const FS=`
uniform vec3 uCam;uniform vec3 uFog;uniform float uLight;uniform float uOut;
uniform vec4 uCapA[MAXC];uniform vec4 uCapB[MAXC];uniform vec4 uGrp[MAXG];uniform vec2 uGrpR[MAXG];uniform int uNG;
uniform float uSpec;uniform float uBump;uniform float uVein;uniform float uFreq;
varying vec3 vW;varying vec3 vN;varying vec3 vC;varying float vVil;varying float vGate;
float hash(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float s=0.0;float a=0.5;for(int i=0;i<3;i++){s+=a*noise(p);p=p*2.07+vec3(1.7,9.2,3.1);a*=0.5;}return s;}
void main(){
  for(int g=0;g<MAXG;g++){
    if(g>=uNG)break;
    if(distance(vW,uGrp[g].xyz)<uGrp[g].w){
      int s0=int(uGrpR[g].x);int s1=int(uGrpR[g].y);
      for(int i=0;i<MAXC;i++){
        if(i>=s1)break;
        if(i<s0)continue;
        vec3 a=uCapA[i].xyz;vec3 ba=uCapB[i].xyz-a;vec3 pa=vW-a;
        float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.0,1.0);
        if(length(pa-ba*h)<mix(uCapA[i].w,uCapB[i].w,h))discard;
      }
    }
  }
  vec3 V=uCam-vW;float d=length(V);V/=max(d,1e-4);
  vec3 n=normalize(vN);
  vec3 fn=normalize(cross(dFdx(vW),dFdy(vW)));
  n=normalize(mix(n,fn*sign(dot(fn,n)+1e-4),vGate));
  if(dot(n,V)<0.0)n=-n;
  vec3 q=vW*uFreq;float e=0.07;float n0=fbm(q);
  vec3 gr=vec3(fbm(q+vec3(e,0,0))-n0,fbm(q+vec3(0,e,0))-n0,fbm(q+vec3(0,0,e))-n0)/e;
  gr-=n*dot(gr,n);n=normalize(n-gr*uBump*(1.0-0.6*uOut));
  if(vVil>0.01&&uOut<0.5){vec3 q2=vW*16.0;float v0=noise(q2);
    vec3 g2=vec3(noise(q2+vec3(.1,0,0))-v0,noise(q2+vec3(0,.1,0))-v0,noise(q2+vec3(0,0,.1))-v0)/0.1;
    g2-=n*dot(g2,n);n=normalize(n-g2*0.05*vVil);}
  float vn=noise(vW*0.8+vec3(3.1,1.3,7.7));
  float vein=(1.0-smoothstep(0.0,0.03,abs(vn-0.5)))*smoothstep(0.35,0.75,noise(vW*0.3+11.0))*uVein;
  vec3 base=vC*(0.8+0.4*n0);
  base=mix(base,base*vec3(0.5,0.12,0.25),vein*0.6);
  float ndl=max(dot(n,V),0.0);
  float att=mix(uLight/(1.0+0.012*d*d),1.25,uOut);
  vec3 col=base*(0.18+0.82*ndl)*att;
  col+=base*vec3(0.9,0.15,0.12)*pow(1.0-ndl,3.0)*att*0.35;
  float spec=pow(ndl,80.0)*1.1+pow(ndl,14.0)*0.06;
  col+=vec3(1.0,0.94,0.9)*spec*att*uSpec*(1.0-0.6*uOut);
  col=col/(1.0+col*0.25);
  col=mix(col,uFog,1.0-exp(-d*mix(0.05,0.0025,uOut)));
  gl_FragColor=vec4(pow(max(col,vec3(0.0)),vec3(0.4545)),1.0);
}`;
function makeMat(groups,o,gateU){
  o=o||{};
  const capA=[],capB=[],grp=[],grpR=[];
  groups.forEach(g=>{
    const s0=capA.length,c=V3(0,0,0);
    g.forEach(([a,b])=>{capA.push(new THREE.Vector4(a.p.x,a.p.y,a.p.z,a.r*.97));capB.push(new THREE.Vector4(b.p.x,b.p.y,b.p.z,b.r*.97));c.add(a.p).add(b.p);});
    c.multiplyScalar(1/(2*g.length));
    let rad=0;g.forEach(([a,b])=>{rad=Math.max(rad,c.distanceTo(a.p)+a.r,c.distanceTo(b.p)+b.r);});
    grp.push(new THREE.Vector4(c.x,c.y,c.z,rad+.1));grpR.push(new THREE.Vector2(s0,capA.length));
  });
  const ng=grp.length;
  if(!capA.length){capA.push(new THREE.Vector4());capB.push(new THREE.Vector4());}
  if(!grp.length){grp.push(new THREE.Vector4());grpR.push(new THREE.Vector2());}
  const defines={MAXC:capA.length,MAXG:grp.length};if(o.blob)defines.BLOB=1;
  return new THREE.ShaderMaterial({
    defines,extensions:{derivatives:true},
    uniforms:{uCam:U.uCam,uTime:U.uTime,uFog:U.uFog,uLight:U.uLight,uMotion:U.uMotion,uOut:U.uOut,
      uStomR:U.uStomR,uStomFold:U.uStomFold,uWave:U.uWave,uWavePh:U.uWavePh,
      uGate:{value:gateU||[new THREE.Vector4(),new THREE.Vector4(),new THREE.Vector4(),new THREE.Vector4()]},uNGate:{value:gateU?gateU.n:0},
      uCapA:{value:capA},uCapB:{value:capB},uGrp:{value:grp},uGrpR:{value:grpR},uNG:{value:ng},
      uSpec:{value:o.spec!=null?o.spec:1},uBump:{value:o.bump!=null?o.bump:.22},uVein:{value:o.vein!=null?o.vein:1},uFreq:{value:o.freq||2.6}},
    vertexShader:VS,fragmentShader:FS,side:THREE.DoubleSide
  });
}
function buildMesh(T){
  const {S,def}=T,R=def.radial,nv=S.length*R;
  const pos=new Float32Array(nv*3),col=new Float32Array(nv*3),axis=new Float32Array(nv*3),
    aS=new Float32Array(nv),aAnim=new Float32Array(nv),aVil=new Float32Array(nv),aRad=new Float32Array(nv),aFold=new Float32Array(nv),aTh=new Float32Array(nv),aStom=new Float32Array(nv);
  const dir=V3(0,0,0);
  S.forEach((sm,i)=>{
    const rA=REG[sm.regA],rB=REG[sm.regB];
    const endF=(def.open[0]?1:smooth(.3,1.8,sm.s))*(def.open[1]?1:smooth(.3,1.8,T.L-sm.s));
    const amp=endF*sm.jf,cA=rA.lin,cB=rB.lin,vil=rA.vil+(rB.vil-rA.vil)*sm.w;
    for(let k=0;k<R;k++){
      const th=k/R*TAU;
      dir.copy(sm.N).multiplyScalar(Math.cos(th)).addScaledVector(sm.B,Math.sin(th));
      let d=0;
      if(amp>.001){const fa=fold(rA.fold,sm.s,dir,th),fb=rA.fold===rB.fold?fa:fold(rB.fold,sm.s,dir,th);d=(fa+(fb-fa)*sm.w)*amp;}
      const rr=sm.r*(1+d),v=i*R+k,o=v*3;
      pos[o]=sm.p.x+dir.x*rr;pos[o+1]=sm.p.y+dir.y*rr;pos[o+2]=sm.p.z+dir.z*rr;
      axis[o]=sm.p.x;axis[o+1]=sm.p.y;axis[o+2]=sm.p.z;
      const sh=Math.max(.35,1+d*1.6);
      col[o]=(cA[0]+(cB[0]-cA[0])*sm.w)*sh;col[o+1]=(cA[1]+(cB[1]-cA[1])*sm.w)*sh;col[o+2]=(cA[2]+(cB[2]-cA[2])*sm.w)*sh;
      aS[v]=sm.s;aAnim[v]=def.anim;aVil[v]=vil;aRad[v]=sm.r;aFold[v]=d;aTh[v]=th;aStom[v]=sm.stom;
    }
  });
  const idx=new Uint32Array((S.length-1)*R*6);let q=0;
  for(let i=0;i<S.length-1;i++)for(let k=0;k<R;k++){
    const a=i*R+k,b=(i+1)*R+k,c=(i+1)*R+(k+1)%R,d=i*R+(k+1)%R;
    idx[q++]=a;idx[q++]=b;idx[q++]=d;idx[q++]=b;idx[q++]=c;idx[q++]=d;
  }
  const g=new THREE.BufferGeometry(),A=(n,arr,s)=>g.setAttribute(n,new THREE.BufferAttribute(arr,s));
  A('position',pos,3);A('aCol',col,3);A('aAxis',axis,3);A('aS',aS,1);A('aAnim',aAnim,1);A('aVil',aVil,1);A('aRad',aRad,1);A('aFold',aFold,1);A('aTh',aTh,1);A('aStom',aStom,1);
  g.setIndex(new THREE.BufferAttribute(idx,1));
  g.computeVertexNormals();
  let gateU=null;
  if(T.gates.length){gateU=[0,1,2,3].map(()=>new THREE.Vector4());gateU.n=T.gates.length;T.gateU=gateU;}
  const mesh=new THREE.Mesh(g,makeMat(T.groups,{},gateU));
  mesh.frustumCulled=false;
  scene.add(mesh);
}
tubes.forEach(buildMesh);

/* 歯・口蓋垂・喉頭蓋 */
function blobGeo(c){
  const g=new THREE.SphereGeometry(1,20,14),n=g.attributes.position.count,cc=lin(c),col=new Float32Array(n*3);
  for(let i=0;i<n;i++){col[i*3]=cc[0];col[i*3+1]=cc[1];col[i*3+2]=cc[2];}
  g.setAttribute('aCol',new THREE.BufferAttribute(col,3));
  ['aS','aAnim','aVil','aRad','aFold','aTh','aStom'].forEach(k=>g.setAttribute(k,new THREE.BufferAttribute(new Float32Array(n),1)));
  g.setAttribute('aAxis',new THREE.BufferAttribute(new Float32Array(n*3),3));
  return g;
}
const toothGeo=blobGeo([.96,.93,.84]),toothMat=makeMat([],{spec:.9,bump:.08,vein:0,freq:5,blob:true});
const fleshGeo=blobGeo([.86,.44,.46]),fleshMat=makeMat([],{spec:1,bump:.2,vein:.6,blob:true});
let epiglottis;
{
  const oc=V3(0,-4.2,8.6),rr=1.68*.86;
  const put=(phi)=>{const m=new THREE.Mesh(toothGeo,toothMat);m.position.set(oc.x+Math.cos(phi)*rr,oc.y+Math.sin(phi)*rr*.92,oc.z);m.scale.set(.27,.48,.2);m.rotation.z=phi-Math.PI/2;scene.add(m);};
  for(let i=0;i<8;i++){put((28+i*124/7)*Math.PI/180);put((208+i*124/7)*Math.PI/180);}
  const uv=new THREE.Mesh(fleshGeo,fleshMat);uv.position.set(0,-3.3,0);uv.scale.set(.22,.62,.22);uv.rotation.x=.25;scene.add(uv);
  epiglottis=new THREE.Mesh(fleshGeo,fleshMat);epiglottis.position.set(0,-6.2,-1.3);epiglottis.scale.set(.55,.75,.11);epiglottis.rotation.x=-.5;scene.add(epiglottis);
}

/* 外の光 */
const glowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,252,244,1)');g.addColorStop(.35,'rgba(255,226,200,.9)');g.addColorStop(1,'rgba(255,180,150,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);})();
const OPEN_ENDS=[],glows=[];
for(const T of tubes){[0,1].forEach(e=>{if(!T.def.open[e])return;const sm=e?T.S[T.S.length-1]:T.S[0];const out=sm.T.clone().multiplyScalar(e?1:-1);
  OPEN_ENDS.push({p:sm.p.clone(),out,r:sm.r,T,end:e});
  const m=new THREE.Mesh(new THREE.PlaneGeometry(sm.r*3.2,sm.r*3.2),new THREE.MeshBasicMaterial({map:glowTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  m.position.copy(sm.p).addScaledVector(out,.4);m.lookAt(m.position.clone().sub(out));scene.add(m);glows.push(m);});}

/* 浮遊する粒子 */
const PN=320,pBase=new Float32Array(PN*3),pPos=new Float32Array(PN*3);
for(let i=0;i<PN*3;i++)pBase[i]=Math.random()*8;
const pGeo=new THREE.BufferGeometry();pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));
const dust=new THREE.Points(pGeo,new THREE.PointsMaterial({color:0xffd9cc,size:.03,transparent:true,opacity:.4,depthWrite:false}));
dust.frustumCulled=false;scene.add(dust);

/* ---------- 胃の内容物（液面と食べかす） ---------- */
const STC=[];
{const S=TUB.dig.S;for(let i=0;i<S.length-10;i+=10){const a=S[i],b=S[i+10];if(a.stom>.6&&b.stom>.6)STC.push([a,b]);}}
const stomCenter=V3(0,0,0);STC.forEach(([a])=>stomCenter.add(a.p));stomCenter.multiplyScalar(1/STC.length);
const fluidMat=new THREE.ShaderMaterial({
  defines:{NS:STC.length},transparent:true,depthWrite:false,side:THREE.DoubleSide,
  uniforms:{uCam:U.uCam,uFog:U.uFog,uStomR:U.uStomR,uTime:U.uTime,uOut:U.uOut,uFluid:{value:V3(.6,.4,.2)},
    uSA:{value:STC.map(([a])=>new THREE.Vector4(a.p.x,a.p.y,a.p.z,a.r))},uSB:{value:STC.map(([,b])=>new THREE.Vector4(b.p.x,b.p.y,b.p.z,b.r))}},
  vertexShader:`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform vec3 uCam;uniform vec3 uFog;uniform float uStomR;uniform float uTime;uniform float uOut;uniform vec3 uFluid;
  uniform vec4 uSA[NS];uniform vec4 uSB[NS];varying vec3 vW;
  void main(){
    bool inside=false;
    for(int i=0;i<NS;i++){vec3 a=uSA[i].xyz;vec3 ba=uSB[i].xyz-a;vec3 pa=vW-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
      if(length(pa-ba*h)<mix(uSA[i].w,uSB[i].w,h)*uStomR*0.86){inside=true;break;}}
    if(!inside)discard;
    vec3 V=uCam-vW;float d=length(V);V/=d;
    vec3 n=normalize(vec3(sin(vW.x*5.0+uTime*1.3)*0.06,1.0,cos(vW.z*4.0-uTime)*0.06));if(dot(n,V)<0.0)n=-n;
    float ndl=max(dot(n,V),0.0);float att=mix(1.55/(1.0+0.012*d*d),1.2,uOut);
    vec3 col=uFluid*(0.3+0.7*ndl)*att+vec3(1.0,0.96,0.9)*pow(ndl,60.0)*att;
    col=mix(col,uFog,1.0-exp(-d*mix(0.05,0.0025,uOut)));
    gl_FragColor=vec4(pow(max(col,vec3(0.0)),vec3(0.4545)),0.82);
  }`
});
const fluid=new THREE.Mesh(new THREE.CircleGeometry(8,48),fluidMat);
fluid.rotation.x=-Math.PI/2;fluid.position.copy(stomCenter);fluid.renderOrder=2;fluid.frustumCulled=false;scene.add(fluid);
const FN=220,fPos=new Float32Array(FN*3),fCol=new Float32Array(FN*3);
const fGeo=new THREE.BufferGeometry();fGeo.setAttribute('position',new THREE.BufferAttribute(fPos,3));fGeo.setAttribute('color',new THREE.BufferAttribute(fCol,3));
const food=new THREE.Points(fGeo,new THREE.PointsMaterial({size:.22,vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));
food.frustumCulled=false;scene.add(food);
const FOOD_COL=[[.82,.7,.5],[.62,.42,.28],[.5,.6,.25],[.9,.86,.74],[.72,.5,.36]];
for(let i=0;i<FN;i++){const c=FOOD_COL[i%5];fCol.set(c,i*3);}
function inStomach(p,sc){for(const [a,b] of STC){_ab.subVectors(b.p,a.p);_ap.subVectors(p,a.p);const h=clamp(_ap.dot(_ab)/_ab.lengthSq(),0,1);_ap.addScaledVector(_ab,-h);if(_ap.length()<(a.r+(b.r-a.r)*h)*sc)return true;}return false;}
function placeFood(i,level){
  const sc=U.uStomR.value*.8;const t=V3(0,0,0);
  for(let k=0;k<30;k++){const [a,b]=STC[Math.floor(Math.random()*STC.length)];t.copy(a.p).lerp(b.p,Math.random());
    t.x+=(Math.random()*2-1)*a.r*sc;t.y+=(Math.random()*2-1)*a.r*sc;t.z+=(Math.random()*2-1)*a.r*sc;
    if(t.y<level&&inStomach(t,sc))break;}
  fPos[i*3]=t.x;fPos[i*3+1]=t.y;fPos[i*3+2]=t.z;
}

/* 外観ビュー用: 現在地マーカーと軌跡 */
const markTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.3,'rgba(255,240,200,.9)');g.addColorStop(1,'rgba(255,200,120,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:markTex,depthTest:false,transparent:true}));
marker.scale.set(4,4,1);marker.renderOrder=10;marker.visible=false;scene.add(marker);
const TRAIL_MAX=4000,trailPos=new Float32Array(TRAIL_MAX*3);let trailN=0;
const trailGeo=new THREE.BufferGeometry();trailGeo.setAttribute('position',new THREE.BufferAttribute(trailPos,3));trailGeo.setDrawRange(0,0);
const trail=new THREE.Line(trailGeo,new THREE.LineBasicMaterial({color:0xfff1c8,transparent:true,opacity:.85,depthTest:false}));
trail.renderOrder=9;trail.frustumCulled=false;trail.visible=false;scene.add(trail);
function addTrail(p){
  if(trailN>0){const o=(trailN-1)*3;if(Math.hypot(p.x-trailPos[o],p.y-trailPos[o+1],p.z-trailPos[o+2])<.5)return;}
  if(trailN>=TRAIL_MAX){trailPos.copyWithin(0,3);trailN--;}
  trailPos[trailN*3]=p.x;trailPos[trailN*3+1]=p.y;trailPos[trailN*3+2]=p.z;trailN++;
  trailGeo.setDrawRange(0,trailN);trailGeo.attributes.position.needsUpdate=true;
}

/* ---------- 三人称視点: いま入っているモノ ---------- */
const NOISE_GLSL=`float hash(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}`;
const avatarMat=new THREE.ShaderMaterial({
  transparent:true,extensions:{derivatives:true},
  uniforms:{uCam:U.uCam,uFog:U.uFog,uOut:U.uOut,uTime:U.uTime,uColor:{value:V3(1,1,1)},uCoatC:{value:V3(.4,.2,.1)},uCoat:{value:0},
    uAmp:{value:.2},uFreq:{value:2.5},uWob:{value:0},uMetal:{value:0},uAlpha:{value:1},uCrack:{value:0},uSeed:{value:0}},
  vertexShader:NOISE_GLSL+`
  uniform float uTime;uniform float uAmp;uniform float uFreq;uniform float uWob;uniform float uSeed;
  varying vec3 vW;varying vec3 vN;varying vec3 vL;
  void main(){
    vec3 p=position;
    float n=noise(p*uFreq+vec3(uSeed,0.0,uTime*uWob))+0.5*noise(p*uFreq*2.3+vec3(0.0,uSeed,uTime*uWob*1.3))-0.75;
    p+=normal*n*uAmp*2.0;
    vL=position;vec4 w=modelMatrix*vec4(p,1.0);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);
    gl_Position=projectionMatrix*viewMatrix*w;
  }`,
  fragmentShader:NOISE_GLSL+`
  uniform vec3 uCam;uniform vec3 uFog;uniform vec3 uColor;uniform vec3 uCoatC;
  uniform float uOut;uniform float uCoat;uniform float uMetal;uniform float uAlpha;uniform float uCrack;
  varying vec3 vW;varying vec3 vN;varying vec3 vL;
  void main(){
    vec3 V=uCam-vW;float d=length(V);V/=max(d,1e-4);
    vec3 fn=normalize(cross(dFdx(vW),dFdy(vW)));
    vec3 n=normalize(mix(normalize(vN),fn,0.3));if(dot(n,V)<0.0)n=-n;
    float ndl=max(dot(n,V),0.0);
    vec3 base=uColor;
    float m=noise(vL*3.0)*0.7+noise(vL*7.0)*0.3;
    base=mix(base,uCoatC,uCoat>0.01?smoothstep(1.0-uCoat,1.0-uCoat+0.12,m):0.0);
    float cr=uCrack*(1.0-smoothstep(0.0,0.035,abs(noise(vL*4.0+2.0)-0.5)));
    base*=1.0-cr*0.7;
    base*=0.85+0.3*noise(vL*12.0);
    float att=mix(1.7/(1.0+0.012*d*d),1.2,uOut);
    vec3 col=base*(0.22+0.78*ndl)*att;
    col+=vec3(1.0)*pow(ndl,mix(40.0,110.0,uMetal))*mix(0.16,1.3,uMetal)*att;
    col+=base*pow(1.0-ndl,2.0)*0.5*uMetal*att;
    col=col/(1.0+col*0.25);
    col=mix(col,uFog,1.0-exp(-d*mix(0.05,0.0025,uOut)));
    gl_FragColor=vec4(pow(max(col,vec3(0.0)),vec3(0.4545)),uAlpha);
  }`
});
const AV_GEO={
  blob:new THREE.IcosahedronGeometry(1,5),
  capsule:(()=>{const p=[];for(let i=0;i<=10;i++){const a=-Math.PI/2+i/10*Math.PI/2;p.push(new THREE.Vector2(Math.cos(a)*.21,-.29+Math.sin(a)*.21));}
    for(let i=0;i<=10;i++){const a=i/10*Math.PI/2;p.push(new THREE.Vector2(Math.cos(a)*.21,.29+Math.sin(a)*.21));}
    const g=new THREE.LatheGeometry(p,40);g.rotateX(Math.PI/2);return g;})(),
  battery:(()=>{const g=new THREE.CylinderGeometry(1,1,.32,48,2);g.rotateX(Math.PI/2);return g;})()
};
const avatar=new THREE.Mesh(AV_GEO.blob,avatarMat);avatar.frustumCulled=false;avatar.visible=false;avatar.renderOrder=3;scene.add(avatar);
let tps=false,avatarSize=.5;
const tpsCam=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.015,600);
const tpsPos=V3(0,0,0),_q=new THREE.Quaternion(),_fz=V3(0,0,1);
function avatarState(){
  const m=P.mat,mm=mass(),r=loc&&loc.seg?loc.seg.r:1;
  const o={geo:'blob',sx:1,sy:1,sz:1,amp:.18,freq:2.5,wob:0,alpha:1,metal:0,crack:0,along:false,size:clamp(Math.cbrt(mm)*.34,.2,r*.55)};
  if(m===MATS.capsule){Object.assign(o,{geo:'capsule',amp:0,metal:.6,along:true,size:Math.min(2.6,r*2.4)});return o;}
  if(m.battery){Object.assign(o,{geo:'battery',amp:0,metal:1,size:Math.min(1,r*.8)});return o;}
  if(m===MATS.metal){Object.assign(o,{amp:0,metal:1,size:Math.min(.4,r*.6)});return o;}
  const fresh=P.entry==='anus'&&P.tSB===0;
  if(P.tColon>0&&!m.liquid&&!fresh){
    const t=bristol();o.along=true;
    const S=[null,[.9,.85,.9,.32,3.2,0,1,0],[.55,.55,1.5,.22,3,0,1,.3],[.55,.55,1.6,.1,2.5,0,1,.9],[.5,.5,1.75,.035,2,0,1,0],[.62,.45,1.4,.12,2,.4,1,0],[1,.35,1,.25,2.2,1,.95,0],[1.15,.18,1.15,.15,3,2,.8,0]][t];
    Object.assign(o,{sx:S[0],sy:S[1],sz:S[2],amp:S[3],freq:S[4],wob:S[5],alpha:S[6],crack:S[7]});
    if(t<=2)o.size*=.85;
    return o;
  }
  if(m.liquid||P.tSB>0){Object.assign(o,{sx:1.1,sy:.55,sz:1.1,amp:.16,freq:2.2,wob:2.2,alpha:.72});return o;}
  if(P.tStom>0){const g=P.prog;Object.assign(o,{sx:1+g*.15,sy:.85-g*.3,sz:1+g*.15,amp:.26-g*.1,freq:2.5+g*2,wob:g*1.5,alpha:1-g*.15});return o;}
  const chew=clamp((m.size-P.size)/Math.max(1,m.size-2.5),0,1);
  Object.assign(o,{sx:1,sy:.82,sz:.92,amp:.28-chew*.1,freq:2.2+chew*3.5,wob:0});
  return o;
}
function updateAvatar(dt){
  const show=tps&&!orbitOn&&mode!=='demo'&&!!P;avatar.visible=show;if(!show)return;
  const o=avatarState();
  if(avatar.geometry!==AV_GEO[o.geo])avatar.geometry=AV_GEO[o.geo];
  avatarSize+=(o.size-avatarSize)*Math.min(1,dt*2);
  const k=avatarSize,u=avatarMat.uniforms;
  avatar.scale.set(o.sx*k,o.sy*k,o.sz*k);
  avatar.position.copy(camera.position);
  const fwd=V3(0,0,-1).applyQuaternion(camera.quaternion);
  if(o.along&&inBody&&loc&&loc.tube){let t=loc.tube.S[Math.min(loc.tube.S.length-1,loc.seg.i)].T.clone();if(t.dot(fwd)<0)t.negate();_q.setFromUnitVectors(_fz,t);avatar.quaternion.slerp(_q,Math.min(1,dt*4));}
  else{avatar.rotateY(dt*.25);avatar.rotateX(dt*.11);}
  u.uColor.value.set(...lin(colorOf()));
  u.uCoat.value=P.mat.dig?0:P.coat;u.uCoatC.value.set(...lin(coatColor()));
  u.uAmp.value+=(o.amp-u.uAmp.value)*Math.min(1,dt*2);
  u.uFreq.value+=(o.freq-u.uFreq.value)*Math.min(1,dt*2);
  u.uWob.value=o.wob;u.uAlpha.value=o.alpha;u.uMetal.value=o.metal;u.uCrack.value+=(o.crack-u.uCrack.value)*Math.min(1,dt*2);
  // カメラは後ろ上から追いかける
  const up=V3(0,1,0).applyQuaternion(camera.quaternion);
  const dist=clamp(avatarSize*Math.max(o.sz,1)*(o.geo==='capsule'?2.3:5.5),1.4,6);
  const want=camera.position.clone().addScaledVector(fwd,-dist).addScaledVector(up,dist*.18);
  if(inBody&&loc&&loc.tube){
    // 管の中心線に沿って後ろに置く（壁に当たっても管の外や自分の中に入らない）
    const T=loc.tube,S=T.S,ds=T.def.ds,i0=Math.min(S.length-1,loc.seg.i);
    const sg=fwd.dot(S[i0].T)>=0?1:-1;
    let sb=loc.s-sg*dist,ext=0;
    if(sb<0){ext=T.def.open[0]?-sb:0;sb=0;}else if(sb>T.L){ext=T.def.open[1]?sb-T.L:0;sb=T.L;}
    const sm=S[clamp(Math.round(sb/ds),0,S.length-1)];
    _ax.copy(S[i0].p);const off=camera.position.clone().sub(_ax);off.addScaledVector(S[i0].T,-off.dot(S[i0].T));
    want.copy(sm.p).addScaledVector(off,.35).addScaledVector(sm.T,-sg*ext);
    const lim=sm.r*sm.cf*scaleAt(T,sm.s,sm.stom)*.5;_ap.copy(up).addScaledVector(sm.T,-up.dot(sm.T));
    if(_ap.lengthSq()>1e-6)want.addScaledVector(_ap.normalize(),Math.min(dist*.18,Math.max(0,lim)));
  }
  tpsPos.lerp(want,1-Math.exp(-dt*7));
  tpsCam.position.copy(tpsPos);tpsCam.up.copy(up);
  tpsCam.lookAt(camera.position.clone().addScaledVector(fwd,dist*.35));
}
function toggleTps(){if(mode!=='play')return;tps=!tps;tpsPos.copy(camera.position);updateButtons();toast(tps?L('三人称視点: いまの自分の姿が見える','Third-person view: you can see yourself'):L('一人称視点','First-person view'));}

