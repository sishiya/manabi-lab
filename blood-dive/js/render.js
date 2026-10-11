'use strict';
/* ---------- 描画 ---------- */
const canvas=$('gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
renderer.setSize(innerWidth,innerHeight,false);
const FOG_S=[.12,.02,.025];
renderer.setClearColor(new THREE.Color(...FOG_S));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.01,800);
const orbitCam=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.5,2000);

const U={uCam:{value:V3(0,0,0)},uTime:{value:0},uFog:{value:V3(...lin(FOG_S))},uLight:{value:1.15},uOut:{value:0},uVent:{value:1},uAtr:{value:1},uArt:{value:0},uFogD:{value:.11}};
const VS=`
attribute vec3 aCol;attribute float aS;attribute float aArt;attribute float aAtr;
attribute vec3 aAxis;attribute float aRad;attribute float aFold;attribute float aTh;attribute float aVent;
uniform float uTime;uniform vec4 uGate[4];uniform vec4 uGateL;uniform int uNGate;uniform float uVent;uniform float uAtr;uniform float uArt;
varying vec3 vW;varying vec3 vN;varying vec3 vC;varying float vGate;
void main(){
#ifdef BLOB
  vec3 p=position;vGate=0.0;
#else
  vec3 off=position-aAxis;float len=length(off);vec3 dir=len>1e-5?off/len:vec3(0.0);
  float sc=mix(1.0,uVent,aVent)*mix(1.0,uAtr,aAtr)*(1.0+0.06*uArt*aArt);
  float gc=0.0;float lobes=3.0;
  for(int i=0;i<4;i++){if(i>=uNGate)break;vec4 g=uGate[i];float d=(aS-g.x)/g.y;float c=exp(-d*d)*(1.0-g.z)*g.w;if(c>gc){gc=c;lobes=uGateL[i];}}
  float fm=1.0+aVent*(1.0-uVent)*2.5;
  float r=aRad*((1.0+aFold*fm)*sc*(1.0-gc)+0.13*gc*(0.5+0.5*cos(aTh*lobes)));
  vec3 p=aAxis+dir*r;
  vGate=clamp(gc*1.5+aVent*(1.0-uVent)*2.0,0.0,1.0);
#endif
  vec4 w=modelMatrix*vec4(p,1.0);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);vC=aCol;
  gl_Position=projectionMatrix*viewMatrix*w;
}`;
const FS=`
uniform vec3 uCam;uniform vec3 uFog;uniform float uLight;uniform float uOut;uniform float uFogD;
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
  float vn=noise(vW*2.5+vec3(3.1,1.3,7.7));
  float vein=(1.0-smoothstep(0.0,0.035,abs(vn-0.5)))*smoothstep(0.35,0.75,noise(vW*.9+11.0))*uVein;
  vec3 base=vC*(0.82+0.36*n0);
  base=mix(base,base*vec3(0.6,0.15,0.22),vein*0.5);
  float ndl=max(dot(n,V),0.0);
  float att=mix(uLight/(1.0+0.03*d*d),1.25,uOut);
  vec3 col=base*(0.18+0.82*ndl)*att;
  col+=base*vec3(0.9,0.15,0.12)*pow(1.0-ndl,3.0)*att*0.35;
  float spec=pow(ndl,70.0)*1.0+pow(ndl,14.0)*0.06;
  col+=vec3(1.0,0.93,0.9)*spec*att*uSpec*(1.0-0.6*uOut);
  col=col/(1.0+col*0.25);
  col=mix(col,uFog,1.0-exp(-d*mix(uFogD,0.0025,uOut)));
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
    uniforms:{uCam:U.uCam,uTime:U.uTime,uFog:U.uFog,uLight:U.uLight,uOut:U.uOut,uFogD:U.uFogD,uVent:U.uVent,uAtr:U.uAtr,uArt:U.uArt,
      uGate:{value:gateU||[0,1,2,3].map(()=>new THREE.Vector4())},uGateL:{value:T&&T.gateL||new THREE.Vector4(3,3,3,3)},uNGate:{value:gateU?gateU.n:0},
      uCapA:{value:capA},uCapB:{value:capB},uGrp:{value:grp},uGrpR:{value:grpR},uNG:{value:ng},
      uSpec:{value:o.spec!=null?o.spec:1},uBump:{value:o.bump!=null?o.bump:.12},uVein:{value:o.vein!=null?o.vein:.6},uFreq:{value:o.freq||7},uAlpha:{value:o.alpha!=null?o.alpha:1}},
    vertexShader:VS,fragmentShader:FS,side:THREE.DoubleSide
  });
}
function buildMesh(T){
  const {S,def}=T,R=def.radial,nv=S.length*R;
  const pos=new Float32Array(nv*3),col=new Float32Array(nv*3),axis=new Float32Array(nv*3),
    aS=new Float32Array(nv),aArt=new Float32Array(nv),aAtr=new Float32Array(nv),aRad=new Float32Array(nv),aFold=new Float32Array(nv),aTh=new Float32Array(nv),aVent=new Float32Array(nv);
  const dir=V3(0,0,0);
  S.forEach((sm,i)=>{
    const rA=REG[sm.regA],rB=REG[sm.regB];
    const endF=smooth(.2,1.2,sm.s)*smooth(.2,1.2,T.L-sm.s);
    const amp=endF*sm.jf,cA2=rA.lin,cB2=rB.lin;
    for(let k=0;k<R;k++){
      const th=k/R*TAU;
      dir.copy(sm.N).multiplyScalar(Math.cos(th)).addScaledVector(sm.B,Math.sin(th));
      let d=0;
      if(amp>.001){const fa=fold(rA.fold,sm.s,dir,th),fb=rA.fold===rB.fold?fa:fold(rB.fold,sm.s,dir,th);d=(fa+(fb-fa)*sm.w)*amp;}
      const rr=sm.r*(1+d),v=i*R+k,o=v*3;
      pos[o]=sm.p.x+dir.x*rr;pos[o+1]=sm.p.y+dir.y*rr;pos[o+2]=sm.p.z+dir.z*rr;
      axis[o]=sm.p.x;axis[o+1]=sm.p.y;axis[o+2]=sm.p.z;
      const sh=Math.max(.35,1+d*1.6);
      col[o]=(cA2[0]+(cB2[0]-cA2[0])*sm.w)*sh;col[o+1]=(cA2[1]+(cB2[1]-cA2[1])*sm.w)*sh;col[o+2]=(cA2[2]+(cB2[2]-cA2[2])*sm.w)*sh;
      aS[v]=sm.s;aArt[v]=sm.art;aAtr[v]=sm.atr;aRad[v]=sm.r;aFold[v]=d;aTh[v]=th;aVent[v]=sm.vent;
    }
  });
  const idx=new Uint32Array((S.length-1)*R*6);let q=0;
  for(let i=0;i<S.length-1;i++)for(let k=0;k<R;k++){
    const a=i*R+k,b=(i+1)*R+k,c=(i+1)*R+(k+1)%R,d=i*R+(k+1)%R;
    idx[q++]=a;idx[q++]=b;idx[q++]=d;idx[q++]=b;idx[q++]=c;idx[q++]=d;
  }
  const g=new THREE.BufferGeometry(),A=(n,arr,s)=>g.setAttribute(n,new THREE.BufferAttribute(arr,s));
  A('position',pos,3);A('aCol',col,3);A('aAxis',axis,3);A('aS',aS,1);A('aArt',aArt,1);A('aAtr',aAtr,1);A('aRad',aRad,1);A('aFold',aFold,1);A('aTh',aTh,1);A('aVent',aVent,1);
  g.setIndex(new THREE.BufferAttribute(idx,1));
  g.computeVertexNormals();
  if(T.gates.length){T.gateU=[0,1,2,3].map(()=>new THREE.Vector4());T.gateU.n=T.gates.length;T.gateL=new THREE.Vector4(...[0,1,2,3].map(i=>T.gates[i]?T.gates[i].lobes:3));}
  const mesh=new THREE.Mesh(g,makeMat(T.groups,{},T));
  mesh.frustumCulled=false;T.mesh=mesh;scene.add(mesh);
}
tubes.forEach(buildMesh);

/* 臓器の目印（外観ビューだけで表示） */
function blobGeo(c){
  const g=new THREE.SphereGeometry(1,32,22),n=g.attributes.position.count,cc=lin(c),col=new Float32Array(n*3);
  for(let i=0;i<n;i++){col[i*3]=cc[0];col[i*3+1]=cc[1];col[i*3+2]=cc[2];}
  g.setAttribute('aCol',new THREE.BufferAttribute(col,3));
  ['aS','aArt','aAtr','aRad','aFold','aTh','aVent'].forEach(k=>g.setAttribute(k,new THREE.BufferAttribute(new Float32Array(n),1)));
  g.setAttribute('aAxis',new THREE.BufferAttribute(new Float32Array(n*3),3));
  return g;
}
const organs=[];
function organ(c,pos,scl,alpha){const m=new THREE.Mesh(blobGeo(c),makeMat([],{spec:.4,bump:.08,vein:.2,blob:true,freq:1.2,alpha}));m.position.set(...pos);m.scale.set(...scl);m.renderOrder=1;m.visible=false;scene.add(m);organs.push(m);return m;}
organ([.85,.55,.6],[-6,-29,-1],[4.2,7.5,4.5],.18);
organ([.85,.55,.6],[6.2,-29,-1],[3.8,7.5,4.5],.18);
organ([.55,.22,.2],[-6,-45,0],[5.5,3.2,4],.3);
organ([.55,.2,.18],[-6,-51.8,-5.2],[2.4,5,2],.45);
organ([.85,.65,.62],[.5,7,-1],[6.5,6,7.5],.15);
organ([.82,.6,.5],[.2,-65,3],[6,6.5,3],.15);
organ([.8,.5,.5],[-5.6,-112,3.4],[3.5,3,3.5],.15);

/* 血液の粒（赤血球） */
const rbcTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,2,32,32,30);
  g.addColorStop(0,'rgba(150,20,25,.85)');g.addColorStop(.45,'rgba(200,40,40,.9)');g.addColorStop(.8,'rgba(170,25,30,.9)');g.addColorStop(1,'rgba(120,10,15,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
const PN=420,pBase=new Float32Array(PN*3),pPos=new Float32Array(PN*3);
for(let i=0;i<PN*3;i++)pBase[i]=Math.random()*4;
const pGeo=new THREE.BufferGeometry();pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));
const dust=new THREE.Points(pGeo,new THREE.PointsMaterial({map:rbcTex,size:.07,transparent:true,opacity:.75,depthWrite:false}));
dust.frustumCulled=false;scene.add(dust);

/* 外観ビュー用 */
const markTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.3,'rgba(255,220,200,.9)');g.addColorStop(1,'rgba(255,120,100,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:markTex,depthTest:false,transparent:true}));
marker.scale.set(4,4,1);marker.renderOrder=10;marker.visible=false;scene.add(marker);
const TRAIL_MAX=5000,trailPos=new Float32Array(TRAIL_MAX*3);let trailN=0;
const trailGeo=new THREE.BufferGeometry();trailGeo.setAttribute('position',new THREE.BufferAttribute(trailPos,3));trailGeo.setDrawRange(0,0);
const trail=new THREE.LineSegments(trailGeo,new THREE.LineBasicMaterial({color:0xfff1c8,transparent:true,opacity:.85,depthTest:false}));
trail.renderOrder=9;trail.frustumCulled=false;trail.visible=false;scene.add(trail);
let trailLast=null;
function addTrail(p,jump){
  if(jump){trailLast=null;return;}
  if(trailLast&&p.distanceTo(trailLast)<.4)return;
  if(trailLast){if(trailN+2>TRAIL_MAX){trailPos.copyWithin(0,6);trailN-=2;}
    trailPos.set([trailLast.x,trailLast.y,trailLast.z,p.x,p.y,p.z],trailN*3);trailN+=2;trailGeo.setDrawRange(0,trailN);trailGeo.attributes.position.needsUpdate=true;}
  trailLast=p.clone();
}

/* ---------- 三人称 ---------- */
const NOISE_GLSL=`float hash(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}`;
const avatarMat=new THREE.ShaderMaterial({
  transparent:true,extensions:{derivatives:true},
  uniforms:{uCam:U.uCam,uFog:U.uFog,uOut:U.uOut,uFogD:U.uFogD,uTime:U.uTime,uColor:{value:V3(1,1,1)},uAmp:{value:.1},uFreq:{value:3},uWob:{value:0},uMetal:{value:0},uAlpha:{value:1}},
  vertexShader:NOISE_GLSL+`
  uniform float uTime;uniform float uAmp;uniform float uFreq;uniform float uWob;
  varying vec3 vW;varying vec3 vN;varying vec3 vL;
  void main(){
    vec3 p=position;
    float n=noise(p*uFreq+vec3(0.0,0.0,uTime*uWob))+0.5*noise(p*uFreq*2.3)-0.75;
    p+=normal*n*uAmp*2.0;
    vL=position;vec4 w=modelMatrix*vec4(p,1.0);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);
    gl_Position=projectionMatrix*viewMatrix*w;
  }`,
  fragmentShader:NOISE_GLSL+`
  uniform vec3 uCam;uniform vec3 uFog;uniform vec3 uColor;uniform float uOut;uniform float uFogD;uniform float uMetal;uniform float uAlpha;
  varying vec3 vW;varying vec3 vN;varying vec3 vL;
  void main(){
    vec3 V=uCam-vW;float d=length(V);V/=max(d,1e-4);
    vec3 n=normalize(vN);if(dot(n,V)<0.0)n=-n;
    float ndl=max(dot(n,V),0.0);
    vec3 base=uColor*(0.88+0.24*noise(vL*10.0));
    float att=mix(1.3/(1.0+0.03*d*d),1.2,uOut);
    vec3 col=base*(0.25+0.75*ndl)*att;
    col+=vec3(1.0)*pow(ndl,mix(40.0,110.0,uMetal))*mix(0.3,1.3,uMetal)*att;
    col+=base*pow(1.0-ndl,2.0)*0.5*uMetal*att;
    col=col/(1.0+col*0.25);
    col=mix(col,uFog,1.0-exp(-d*mix(uFogD,0.0025,uOut)));
    gl_FragColor=vec4(pow(max(col,vec3(0.0)),vec3(0.4545)),uAlpha);
  }`
});
// 赤血球: 真ん中がくぼんだ円盤
const AV_GEO={
  rbc:(()=>{const p=[];for(let i=0;i<=24;i++){const t=i/24*Math.PI,x=Math.sin(t),y=Math.cos(t);const r=x,h=y*(.12+.38*r*r)*(1-.0);p.push(new THREE.Vector2(r,y*.18+Math.sign(y)*.24*r*r*(1-r*r)*1.8));}
    const g=new THREE.LatheGeometry(p,48);g.rotateX(Math.PI/2);g.computeVertexNormals();return g;})(),
  blob:new THREE.IcosahedronGeometry(1,5),
  rod:(()=>{const g=new THREE.CylinderGeometry(.18,.18,1.6,24,1);g.rotateX(Math.PI/2);return g;})()
};
const avatar=new THREE.Mesh(AV_GEO.rbc,avatarMat);avatar.frustumCulled=false;avatar.visible=false;avatar.renderOrder=3;scene.add(avatar);
let tps=false,avatarSize=.2;
const tpsCam=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.01,800);
const tpsPos=V3(0,0,0),_q=new THREE.Quaternion(),_fz=V3(0,0,1);

