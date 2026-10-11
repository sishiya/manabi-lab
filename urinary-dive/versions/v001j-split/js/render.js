'use strict';
/* ---------- 描画の準備 ---------- */
const canvas=$('gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
renderer.setSize(innerWidth,innerHeight,false);
const FOG_S=[.11,.05,.02];
renderer.setClearColor(new THREE.Color(FOG_S[0],FOG_S[1],FOG_S[2]));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.01,600);
const orbitCam=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.5,2000);
const BASE=V3(0,-92,2.5); // 膀胱がしぼむときの基点（膀胱三角のあたり）

const U={uCam:{value:V3(0,0,0)},uTime:{value:0},uFog:{value:V3(...lin(FOG_S))},uLight:{value:1.05},uMotion:{value:reduceMotion?0:1},
  uOut:{value:0},uStomR:{value:.5},uStomFold:{value:2},uBase:{value:BASE},uSqz:{value:0}};
const VS=`
attribute vec3 aCol;attribute float aS;attribute float aUre;attribute float aPel;
attribute vec3 aAxis;attribute float aRad;attribute float aFold;attribute float aTh;attribute float aStom;
uniform float uTime;uniform float uMotion;uniform vec4 uGate[4];uniform int uNGate;
uniform float uStomR;uniform float uStomFold;uniform vec3 uBase;uniform float uBolus;uniform float uHydro;uniform float uSqz;
varying vec3 vW;varying vec3 vN;varying vec3 vC;varying float vGate;
void main(){
#ifdef BLOB
  vec3 p=position;vGate=0.0;
#else
  vec3 off=position-aAxis;float len=length(off);vec3 dir=len>1e-5?off/len:vec3(0.0);
  float fm=mix(1.0,uStomFold,aStom);
  float sc=mix(1.0,uStomR*(1.0-uSqz*0.04*(0.5+0.5*sin(uTime*7.0+aS))),aStom);
  float b=exp(-pow((aS-uBolus)/1.3,2.0));
  sc*=mix(1.0,mix(0.45,1.0,b),aUre);
  sc*=mix(1.0,uHydro,aPel);
  float gc=0.0;
  for(int i=0;i<4;i++){if(i>=uNGate)break;vec4 g=uGate[i];float d=(aS-g.x)/g.y;gc=max(gc,exp(-d*d)*(1.0-g.z)*g.w);}
  float r=aRad*((1.0+aFold*fm)*sc*(1.0-gc)+0.1*gc*(0.5+0.5*cos(aTh*8.0)));
  vec3 ax=mix(aAxis,uBase+(aAxis-uBase)*uStomR,aStom);
  vec3 p=ax+dir*(r*(1.0+0.015*sin(uTime*1.1+aS*0.3)*uMotion));
  vGate=clamp(gc*1.5+aStom*abs(1.0-uStomR)*1.2+aUre*(1.0-b)*0.7,0.0,1.0);
#endif
  vec4 w=modelMatrix*vec4(p,1.0);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);vC=aCol;
  gl_Position=projectionMatrix*viewMatrix*w;
}`;
const FS=`
uniform vec3 uCam;uniform vec3 uFog;uniform float uLight;uniform float uOut;
uniform vec4 uCapA[MAXC];uniform vec4 uCapB[MAXC];uniform vec4 uGrp[MAXG];uniform vec2 uGrpR[MAXG];uniform int uNG;
uniform float uSpec;uniform float uBump;uniform float uVein;uniform float uFreq;uniform float uAlpha;
varying vec3 vW;varying vec3 vN;varying vec3 vC;varying float vGate;
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
  float vn=noise(vW*4.0+vec3(3.1,1.3,7.7));
  float vein=(1.0-smoothstep(0.0,0.04,abs(vn-0.5)))*smoothstep(0.35,0.75,noise(vW*1.5+11.0))*uVein;
  vec3 base=vC*(0.8+0.4*n0);
  base=mix(base,base*vec3(0.55,0.12,0.22),vein*0.65);
  float ndl=max(dot(n,V),0.0);
  float att=mix(uLight/(1.0+0.03*d*d),1.25,uOut);
  vec3 col=base*(0.18+0.82*ndl)*att;
  col+=base*vec3(0.9,0.2,0.12)*pow(1.0-ndl,3.0)*att*0.35;
  float spec=pow(ndl,80.0)*1.1+pow(ndl,14.0)*0.06;
  col+=vec3(1.0,0.95,0.86)*spec*att*uSpec*(1.0-0.6*uOut);
  col=col/(1.0+col*0.25);
  col=mix(col,uFog,1.0-exp(-d*mix(0.09,0.0025,uOut)));
  gl_FragColor=vec4(pow(max(col,vec3(0.0)),vec3(0.4545)),uAlpha);
}`;
function makeMat(groups,o,T){
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
  const gateU=T&&T.gateU;
  return new THREE.ShaderMaterial({
    defines,extensions:{derivatives:true},transparent:o.alpha!=null&&o.alpha<1,depthWrite:!(o.alpha<1),
    uniforms:{uCam:U.uCam,uTime:U.uTime,uFog:U.uFog,uLight:U.uLight,uMotion:U.uMotion,uOut:U.uOut,
      uStomR:U.uStomR,uStomFold:U.uStomFold,uBase:U.uBase,uSqz:U.uSqz,
      uBolus:T&&T.bolusU?T.bolusU:{value:-100},uHydro:T&&T.hydro?T.hydro:{value:1},
      uGate:{value:gateU||[new THREE.Vector4(),new THREE.Vector4(),new THREE.Vector4(),new THREE.Vector4()]},uNGate:{value:gateU?gateU.n:0},
      uCapA:{value:capA},uCapB:{value:capB},uGrp:{value:grp},uGrpR:{value:grpR},uNG:{value:ng},
      uSpec:{value:o.spec!=null?o.spec:1},uBump:{value:o.bump!=null?o.bump:.1},uVein:{value:o.vein!=null?o.vein:1},uFreq:{value:o.freq||10},uAlpha:{value:o.alpha!=null?o.alpha:1}},
    vertexShader:VS,fragmentShader:FS,side:THREE.DoubleSide
  });
}
function buildMesh(T){
  const {S,def}=T,R=def.radial,nv=S.length*R;
  const pos=new Float32Array(nv*3),col=new Float32Array(nv*3),axis=new Float32Array(nv*3),
    aS=new Float32Array(nv),aUre=new Float32Array(nv),aPel=new Float32Array(nv),aRad=new Float32Array(nv),aFold=new Float32Array(nv),aTh=new Float32Array(nv),aStom=new Float32Array(nv);
  const dir=V3(0,0,0);
  S.forEach((sm,i)=>{
    const rA=REG[sm.regA],rB=REG[sm.regB];
    const endF=(def.open[0]?1:smooth(.2,1,sm.s))*(def.open[1]?1:smooth(.2,1,T.L-sm.s));
    const amp=endF*sm.jf,cA=rA.lin,cB=rB.lin;
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
      aS[v]=sm.s;aUre[v]=sm.ure;aPel[v]=sm.pel;aRad[v]=sm.r;aFold[v]=d;aTh[v]=th;aStom[v]=sm.stom;
    }
  });
  const idx=new Uint32Array((S.length-1)*R*6);let q=0;
  for(let i=0;i<S.length-1;i++)for(let k=0;k<R;k++){
    const a=i*R+k,b=(i+1)*R+k,c=(i+1)*R+(k+1)%R,d=i*R+(k+1)%R;
    idx[q++]=a;idx[q++]=b;idx[q++]=d;idx[q++]=b;idx[q++]=c;idx[q++]=d;
  }
  const g=new THREE.BufferGeometry(),A=(n,arr,s)=>g.setAttribute(n,new THREE.BufferAttribute(arr,s));
  A('position',pos,3);A('aCol',col,3);A('aAxis',axis,3);A('aS',aS,1);A('aUre',aUre,1);A('aPel',aPel,1);A('aRad',aRad,1);A('aFold',aFold,1);A('aTh',aTh,1);A('aStom',aStom,1);
  g.setIndex(new THREE.BufferAttribute(idx,1));
  g.computeVertexNormals();
  if(T.gates.length){T.gateU=[0,1,2,3].map(()=>new THREE.Vector4());T.gateU.n=T.gates.length;}
  T.bolusU={value:-100};
  const mesh=new THREE.Mesh(g,makeMat(T.groups,{},T));
  mesh.frustumCulled=false;T.mesh=mesh;
  scene.add(mesh);
}
tubes.forEach(buildMesh);

/* 腎臓・前立腺・腎乳頭（形の目印） */
function blobGeo(c,seg){
  const g=new THREE.SphereGeometry(1,seg||28,seg?Math.round(seg*.7):20),n=g.attributes.position.count,cc=lin(c),col=new Float32Array(n*3);
  for(let i=0;i<n;i++){col[i*3]=cc[0];col[i*3+1]=cc[1];col[i*3+2]=cc[2];}
  g.setAttribute('aCol',new THREE.BufferAttribute(col,3));
  ['aS','aUre','aPel','aRad','aFold','aTh','aStom'].forEach(k=>g.setAttribute(k,new THREE.BufferAttribute(new Float32Array(n),1)));
  g.setAttribute('aAxis',new THREE.BufferAttribute(new Float32Array(n*3),3));
  return g;
}
const kidneyMat=makeMat([],{spec:.6,bump:.15,vein:.4,blob:true,freq:1.5});
const kidneyGeo=blobGeo([.56,.2,.18],36);
const organs=[];
[[1,0],[-1,-2]].forEach(([sx,dy])=>{const m=new THREE.Mesh(kidneyGeo,kidneyMat);m.position.set(6.7*sx,-51.5+dy,-5.3);m.scale.set(2.6,5.5,2.1);m.rotation.z=.12*sx;scene.add(m);organs.push(m);});
const prostate=new THREE.Mesh(blobGeo([.72,.42,.38],30),makeMat([],{spec:.5,bump:.12,vein:.3,blob:true,freq:2}));
prostate.position.set(0,-97.5,3.5);prostate.scale.set(2,1.6,1.5);scene.add(prostate);
const papMat=makeMat([],{spec:1.2,bump:.35,vein:.2,blob:true,freq:9});
const papGeo=blobGeo([.9,.62,.55],24);
tubes.filter(t=>/^(urL|urR|cmL|cmR|clL|clR)$/.test(t.id)).forEach(t=>{
  const s0=t.S[Math.round(.18/t.def.ds)],m=new THREE.Mesh(papGeo,papMat);
  m.position.copy(s0.p);m.scale.set(.32,.32,.32);scene.add(m);
});

/* 外の光 */
const glowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,252,244,1)');g.addColorStop(.35,'rgba(255,236,200,.9)');g.addColorStop(1,'rgba(255,200,150,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);})();
const OPEN_ALL=[];
for(const T of tubes){[0,1].forEach(e=>{if(!T.def.open[e])return;const sm=e?T.S[T.S.length-1]:T.S[0];const out=sm.T.clone().multiplyScalar(e?1:-1);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(sm.r*3.6,sm.r*3.6),new THREE.MeshBasicMaterial({map:glowTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  m.position.copy(sm.p).addScaledVector(out,.3);m.lookAt(m.position.clone().sub(out));scene.add(m);
  OPEN_ALL.push({p:sm.p.clone(),out,r:sm.r,T,end:e,glow:m});});}
let OPEN_ENDS=OPEN_ALL;

/* 浮遊する粒子（尿の中の結晶や上皮のかけら） */
const PN=260,pBase=new Float32Array(PN*3),pPos=new Float32Array(PN*3);
for(let i=0;i<PN*3;i++)pBase[i]=Math.random()*3;
const pGeo=new THREE.BufferGeometry();pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));
const dust=new THREE.Points(pGeo,new THREE.PointsMaterial({color:0xfff0c0,size:.012,transparent:true,opacity:.5,depthWrite:false}));
dust.frustumCulled=false;scene.add(dust);

/* 外観ビュー用: 現在地マーカーと軌跡 */
const markTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.3,'rgba(255,240,180,.9)');g.addColorStop(1,'rgba(255,210,100,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:markTex,depthTest:false,transparent:true}));
marker.scale.set(3,3,1);marker.renderOrder=10;marker.visible=false;scene.add(marker);
const TRAIL_MAX=4000,trailPos=new Float32Array(TRAIL_MAX*3);let trailN=0;
const trailGeo=new THREE.BufferGeometry();trailGeo.setAttribute('position',new THREE.BufferAttribute(trailPos,3));trailGeo.setDrawRange(0,0);
const trail=new THREE.Line(trailGeo,new THREE.LineBasicMaterial({color:0xfff1c8,transparent:true,opacity:.85,depthTest:false}));
trail.renderOrder=9;trail.frustumCulled=false;trail.visible=false;scene.add(trail);
function addTrail(p){
  if(trailN>0){const o=(trailN-1)*3;if(Math.hypot(p.x-trailPos[o],p.y-trailPos[o+1],p.z-trailPos[o+2])<.3)return;}
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
  uniforms:{uCam:U.uCam,uFog:U.uFog,uOut:U.uOut,uTime:U.uTime,uColor:{value:V3(1,1,1)},
    uAmp:{value:.2},uFreq:{value:2.5},uWob:{value:0},uMetal:{value:0},uAlpha:{value:1},uGlow:{value:0}},
  vertexShader:NOISE_GLSL+`
  uniform float uTime;uniform float uAmp;uniform float uFreq;uniform float uWob;
  varying vec3 vW;varying vec3 vN;varying vec3 vL;
  void main(){
    vec3 p=position;
    float n=noise(p*uFreq+vec3(0.0,0.0,uTime*uWob))+0.5*noise(p*uFreq*2.3+vec3(0.0,0.0,uTime*uWob*1.3))-0.75;
    p+=normal*n*uAmp*2.0;
    vL=position;vec4 w=modelMatrix*vec4(p,1.0);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);
    gl_Position=projectionMatrix*viewMatrix*w;
  }`,
  fragmentShader:NOISE_GLSL+`
  uniform vec3 uCam;uniform vec3 uFog;uniform vec3 uColor;uniform float uOut;uniform float uMetal;uniform float uAlpha;uniform float uGlow;
  varying vec3 vW;varying vec3 vN;varying vec3 vL;
  void main(){
    vec3 V=uCam-vW;float d=length(V);V/=max(d,1e-4);
    vec3 fn=normalize(cross(dFdx(vW),dFdy(vW)));
    vec3 n=normalize(mix(normalize(vN),fn,0.3));if(dot(n,V)<0.0)n=-n;
    float ndl=max(dot(n,V),0.0);
    vec3 base=uColor*(0.85+0.3*noise(vL*12.0));
    float att=mix(1.1/(1.0+0.03*d*d),1.2,uOut);
    vec3 col=base*(0.22+0.78*ndl)*att+uColor*uGlow;
    col+=vec3(1.0)*pow(ndl,mix(40.0,110.0,uMetal))*mix(0.25,1.3,uMetal)*att;
    col+=base*pow(1.0-ndl,2.0)*0.5*uMetal*att;
    col=col/(1.0+col*0.25);
    col=mix(col,uFog,1.0-exp(-d*mix(0.09,0.0025,uOut)));
    gl_FragColor=vec4(pow(max(col,vec3(0.0)),vec3(0.4545)),uAlpha);
  }`
});
const AV_GEO={
  blob:new THREE.IcosahedronGeometry(1,5),
  rod:(()=>{const p=[];for(let i=0;i<=10;i++){const a=-Math.PI/2+i/10*Math.PI/2;p.push(new THREE.Vector2(Math.cos(a)*.21,-.29+Math.sin(a)*.21));}
    for(let i=0;i<=10;i++){const a=i/10*Math.PI/2;p.push(new THREE.Vector2(Math.cos(a)*.21,.29+Math.sin(a)*.21));}
    const g=new THREE.LatheGeometry(p,40);g.rotateX(Math.PI/2);return g;})()
};
const avatar=new THREE.Mesh(AV_GEO.blob,avatarMat);avatar.frustumCulled=false;avatar.visible=false;avatar.renderOrder=3;scene.add(avatar);
let tps=false,avatarSize=.2;
const tpsCam=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.01,600);
const tpsPos=V3(0,0,0),_q=new THREE.Quaternion(),_fz=V3(0,0,1);

