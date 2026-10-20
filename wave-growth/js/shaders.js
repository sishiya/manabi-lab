// 波が育つまで — GLSL（海面の FFT・空・海の描画）。もとは自動収益化の試作4「海」。
'use strict';
window.WGsh = (() => {
  const HEAD = '#version 300 es\nprecision highp float;precision highp int;precision highp sampler2D;\n';
  const VS_FULL = HEAD + `out vec2 vUv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUv=p;gl_Position=vec4(p*2.-1.,0,1);}`;

  // h(k,t) と、横の変位・傾き・変位の微分を作る（実数の場を2つずつ複素数1つにつめる）
  const FS_SPEC = HEAD + `
uniform sampler2D h0;uniform float L,t,N,w0;
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
vec2 cm(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
vec2 im(vec2 a){return vec2(-a.y,a.x);}
void main(){
  ivec2 ij=ivec2(gl_FragCoord.xy);vec2 n=vec2(ij);n-=N*step(N*.5,n);
  vec2 k=6.2831853*n/L;float kl=length(k);
  vec4 h=texelFetch(h0,ij,0);
  float w=max(round(sqrt(9.81*kl)/w0),1.)*w0;   // 深い海の分散 w^2=gk（くり返しのため 2π/T の整数倍に丸める）
  float ph=mod(w*t,6.2831853);vec2 e=vec2(cos(ph),sin(ph));
  vec2 H=cm(h.xy,e)+cm(h.zw,vec2(e.x,-e.y));
  vec2 kn=kl>1e-6?k/kl:vec2(0);float ik=kl>1e-6?1./kl:0.;
  vec2 Dx=cm(vec2(0,-kn.x),H),Dz=cm(vec2(0,-kn.y),H);
  vec2 Sx=cm(vec2(0,k.x),H),Sz=cm(vec2(0,k.y),H);
  vec2 Dxx=H*k.x*k.x*ik,Dzz=H*k.y*k.y*ik,Dxz=H*k.x*k.y*ik;
  o0=vec4(H+im(Dx),Dz+im(Sx));o1=vec4(Sz+im(Dxx),Dzz+im(Dxz));
}`;

  // Stockham の逆 FFT 1段（横または縦）
  const FS_FFT = HEAD + `
uniform sampler2D A,B;uniform float N,sub;uniform int hz;
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
vec2 cm(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
void main(){
  vec2 p=floor(gl_FragCoord.xy);float i=hz==1?p.x:p.y;
  float e=floor(i/sub)*(sub*.5)+mod(i,sub*.5),o=e+N*.5;
  ivec2 ce=hz==1?ivec2(e,p.y):ivec2(p.x,e),co=hz==1?ivec2(o,p.y):ivec2(p.x,o);
  float a=6.2831853*i/sub;vec2 tw=vec2(cos(a),sin(a));
  vec4 ea=texelFetch(A,ce,0),oa=texelFetch(A,co,0),eb=texelFetch(B,ce,0),ob=texelFetch(B,co,0);
  o0=ea+vec4(cm(tw,oa.xy),cm(tw,oa.zw));o1=eb+vec4(cm(tw,ob.xy),cm(tw,ob.zw));
}`;

  // 変位・ヤコビアン（つぶれ）・傾き・泡（泡は前のコマから少しずつ消える）
  const FS_ASM = HEAD + `
uniform sampler2D A,B,P;uniform float lam,thr,gain,decay;
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
void main(){
  ivec2 ij=ivec2(gl_FragCoord.xy);vec4 a=texelFetch(A,ij,0),b=texelFetch(B,ij,0);
  float h=a.x,Dx=a.y,Dz=a.z,hx=a.w,hz=b.x,Dxx=b.y,Dzz=b.z,Dxz=b.w;
  float jxx=1.-lam*Dxx,jzz=1.-lam*Dzz,jxz=-lam*Dxz,J=jxx*jzz-jxz*jxz;
  float f=clamp((thr-J)*gain,0.,1.),pf=texelFetch(P,ij,0).z;
  o0=vec4(-lam*Dx,h,-lam*Dz,J);
  o1=vec4(hx/max(jxx,.3),hz/max(jzz,.3),max(pf*decay,f),0.);
}`;

  const ATMO = `
const float Re=6360e3,Ra=6420e3;const vec3 bR=vec3(5.8e-6,13.5e-6,33.1e-6);const float bM=21e-6;
float farHit(vec3 o,vec3 d,float r){float b=dot(o,d),c=dot(o,o)-r*r,h=b*b-c;return h<0.?0.:-b+sqrt(h);}
vec3 sunT(vec3 p,vec3 L){float tl=farHit(p,L,Ra),sl=tl/8.,lR=0.,lM=0.;
  for(int j=0;j<8;j++){vec3 q=p+L*(sl*(float(j)+.5));float hh=max(length(q)-Re,0.);lR+=exp(-hh/7994.)*sl;lM+=exp(-hh/1200.)*sl;}
  return exp(-(bR*lR+bM*1.1*lM));}
vec3 atmo(vec3 d,vec3 L,float sunI){
  vec3 o=vec3(0,Re+10.,0);float tm=farHit(o,d,Ra),seg=tm/16.;
  float mu=dot(d,L),pr=.0596831*(1.+mu*mu),g=.76,pm=.1193662*((1.-g*g)*(1.+mu*mu))/((2.+g*g)*pow(1.+g*g-2.*g*mu,1.5));
  vec3 sR=vec3(0),sM=vec3(0);float oR=0.,oM=0.;
  for(int i=0;i<16;i++){vec3 p=o+d*(seg*(float(i)+.5));float h=max(length(p)-Re,0.),hr=exp(-h/7994.)*seg,hm=exp(-h/1200.)*seg;oR+=hr;oM+=hm;
    float tl=farHit(p,L,Ra),sl=tl/8.,lR=0.,lM=0.;
    for(int j=0;j<8;j++){vec3 q=p+L*(sl*(float(j)+.5));float hh=max(length(q)-Re,0.);lR+=exp(-hh/7994.)*sl;lM+=exp(-hh/1200.)*sl;}
    vec3 at=exp(-(bR*(oR+lR)+bM*1.1*(oM+lM)));sR+=at*hr;sM+=at*hm;}
  return sunI*(sR*bR*pr+sM*bM*pm);}
`;

  // 空のテクスチャ（横 = 方角、縦 = 高さの平方根）。雲は高さ 1500 m の層
  const FS_SKYTEX = HEAD + ATMO + `
uniform vec3 L,Lm,ambU;uniform float sunI,moonI,cover,cdark;uniform vec2 cOff;in vec2 vUv;out vec4 o;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<6;i++){s+=a*vn(p);p=mat2(1.6,1.2,-1.2,1.6)*p;a*=.5;}return s;}
void main(){
  float az=(vUv.x-.5)*6.2831853,y=vUv.y*vUv.y,r=sqrt(1.-y*y);
  vec3 d=vec3(cos(az)*r,y,sin(az)*r);
  vec3 dd=normalize(vec3(d.x,max(d.y,.035),d.z));   // 1回散乱だけだと水平線が赤くなりすぎるので、2°より下は2°の空で代用
  vec3 col=atmo(dd,L,sunI)+vec3(.0008,.0012,.0024);   // 夜でも真っ黒にはしない（星あかり・大気の光の目安）
  if(moonI>0.)col+=atmo(dd,Lm,moonI);
  if(cover>0.){
    float t=1500./max(d.y,1e-3);vec2 p=d.xz*t+cOff;
    float n=fbm(p*.00035)*.75+fbm(p*.0021)*.25;
    float a=smoothstep(1.05-cover,1.4-cover,n)*mix(smoothstep(0.,.07,d.y),1.,smoothstep(.8,.95,cover));   // くもり・雨は水平線まで雲
    float mu=dot(d,L),hg=(1.-.36)/pow(1.+.36-1.2*mu,1.5)/12.566;
    vec3 sl=sunI*sunT(vec3(0,Re+1500.,0),L)*max(L.y+.05,0.)*1.4+moonI*sunT(vec3(0,Re+1500.,0),Lm)*max(Lm.y+.05,0.)*1.4;
    vec3 cc=(sl*(.05+hg*(1.4-a))+ambU*2.2)*cdark;
    col=mix(col,cc,a*mix(exp(-t/30000.),1.,smoothstep(.8,.95,cover))*.95);
  }
  o=vec4(col,1);
}`;

  const SKYL = `
uniform sampler2D skyT;
vec3 skyL(vec3 d,float lod){d.y=max(d.y,0.);float v=sqrt(d.y),u=atan(d.z,d.x)/6.2831853+.5;return textureLod(skyT,vec2(u,v),lod).rgb;}
vec3 tone(vec3 x){x=x*(2.51*x+.03)/(x*(2.43*x+.59)+.14);return pow(clamp(x,0.,1.),vec3(1./2.2));}
float h12(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
`;

  const FS_SKY = HEAD + SKYL + `
uniform vec3 cf,cr,cu,L,sunC;uniform float tx,ty,sunI,expo,disc,stars,fogSky;in vec2 vUv;out vec4 o;
void main(){
  vec3 d=normalize(cf+(vUv.x*2.-1.)*tx*cr+(vUv.y*2.-1.)*ty*cu);
  vec3 c=skyL(d,0.);float mu=dot(d,L);
  c=mix(c,skyL(normalize(vec3(d.x,0.,d.z)),1.),fogSky*(1.-smoothstep(0.,.35,d.y)));   // 霧: 空の下のほうもかすむ
  c+=disc*sunC*sunI*(smoothstep(.99997,.99999,mu)*60.+pow(max(mu,0.),1500.)*.6+pow(max(mu,0.),40.)*.04);
  if(stars>0.&&d.y>0.){vec2 sp=vec2(atan(d.z,d.x),asin(d.y))*180.;vec2 ci=floor(sp),f=fract(sp)-.5;float hs=h12(ci);
    float st=step(.993,hs)*smoothstep(.22,0.,length(f))*(hs-.993)*140.*smoothstep(0.,.15,d.y);c+=vec3(st)*stars*.02;}
  o=vec4(tone(c*expo)+(h12(gl_FragCoord.xy)-.5)/255.,1);
}`;

  // 画面に張った格子を海面へ投げて、3枚の海面の変位を足す（projected grid）
  const VS_WATER = HEAD + `
in vec2 aG;
uniform vec3 cam,cf,cr,cu,Ls;uniform float tx,ty,y0,y1,pixA,far,planeY,bigOn,bigL,bigX0,curvR;uniform mat4 VP;
uniform sampler2D dA,dB,dC,bigT;
out vec3 vPos;out vec2 vXZ;out float vH,vBS,vDep;
float lod(float fp,float L){return max(0.,log2(fp/(L/256.)));}
// ミラーの惑星: 浅い海の式の水面（r = 高さ、g = 傾き、b = 水深）を x で読む（4096 本の線を手で線形補間）
vec3 big(float xw){float p=(bigX0+xw)/bigL*4096.-.5,f=fract(p);int i0=int(floor(p));i0=((i0%4096)+4096)%4096;int i1=(i0+1)%4096;
  return mix(texelFetch(bigT,ivec2(i0,0),0).rgb,texelFetch(bigT,ivec2(i1,0),0).rgb,f);}
void main(){
  vec2 ndc=vec2(mix(-1.6,1.6,aG.x),mix(y0,y1,aG.y));
  vec3 d=normalize(cf+ndc.x*tx*cr+ndc.y*ty*cu);
  float hgt=max(cam.y-planeY,.5);
  float hor=d.y<-1e-5?length(d.xz)*hgt/(-d.y):1e9;hor=min(hor,far);
  vec2 xz=cam.xz+normalize(d.xz+vec2(1e-6,0))*hor;
  float fp=max(hor,cam.y)*pixA*1.5;
  vec3 D=textureLod(dA,xz/Ls.x,lod(fp,Ls.x)).xyz;
  D+=textureLod(dB,xz/Ls.y,lod(fp,Ls.y)).xyz*(1.-smoothstep(2500.,5000.,hor));
  D+=textureLod(dC,xz/Ls.z,lod(fp,Ls.z)).xyz*(1.-smoothstep(150.,400.,hor));
  vec3 p=vec3(xz.x,0,xz.y)+D;vBS=0.;vDep=1e4;
  if(bigOn>0.){vec3 b=big(xz.x);p.y+=b.r;vBS=b.g;vDep=b.b;float dd=length(xz-cam.xz);p.y-=dd*dd/(2.*curvR);}   // 惑星の丸みで遠くは沈む
  vPos=p;vXZ=xz;vH=D.y;gl_Position=VP*vec4(p,1);
}`;

  const FS_WATER = HEAD + SKYL + `
uniform vec3 cam,L,sunC,Ls;uniform float sunI,expo,fogL,sss,rough0,disc;
uniform sampler2D sA,sB,sC;
in vec3 vPos;in vec2 vXZ;in float vH,vBS,vDep;out vec4 o;
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec4 a=texture(sA,vXZ/Ls.x),b=texture(sB,vXZ/Ls.y),c=texture(sC,vXZ/Ls.z);
  vec2 sl=a.xy+b.xy+c.xy;
  vec3 n=normalize(vec3(-sl.x-vBS,1.,-sl.y));
  vec3 V=cam-vPos;float dist=length(V);V/=dist;
  float nv=max(dot(n,V),1e-3);
  float F=.02+.98*pow(1.-nv,5.);                         // フレネル（水の屈折率 1.33）
  vec3 R=reflect(-V,n);R.y=abs(R.y);
  float rough=rough0+.2*smoothstep(0.,4000.,dist);   // rough0 = 描けない細かい波の傾き（Cox & Munk 1954 から）。遠くは傾きがならされるぶん足す
  vec3 refl=skyL(R,rough*6.);
  vec3 H=normalize(V+L);float nh=max(dot(n,H),0.),nl=max(dot(n,L),0.),a2=rough*rough;
  float c2=max(nh*nh,1e-4),Dg=exp(-(1.-c2)/(c2*a2))/(3.14159*a2*c2*c2),k=rough*.5,Gs=nl/(nl*(1.-k)+k)*nv/(nv*(1.-k)+k);   // 傾きは正規分布（Beckmann。Cox & Munk の観測と同じ形）
  float Fh=.02+.98*pow(1.-max(dot(H,V),0.),5.);
  vec3 spec=sunC*sunI*Dg*Gs*Fh/(4.*nv*max(nl,1e-3))*nl;   // 太陽の照り返し
  vec3 amb=skyL(vec3(0,1,0),6.);
  vec3 deep=vec3(.004,.028,.06),sc=vec3(.05,.33,.3);
  float k1=max(vH+.3,0.)*pow(max(dot(L,-V),0.),4.)*pow(.5-.5*dot(L,n),3.);
  float k2=pow(nv,2.)*.25;
  vec3 body=deep*(amb*.9+sunC*sunI*.04*max(L.y,0.))+sc*sunC*sunI*.012*(k1*3.*sss+k2);   // 水の中で散らばって出てくる光（見た目で決めた強さ）
  // 浅い所（ミラーの惑星の棚）は底が見える（水深で色がうすれる。見た目の目安）
  vec3 sand=vec3(.42,.38,.3)*(sunC*sunI*max(L.y,0.)*.05+amb*.7);body=mix(sand,body,1.-exp(-vDep/1.5));
  vec3 col=mix(body,refl,F)+spec;
  float fm=clamp(a.z*.8+b.z+c.z*.5,0.,1.);
  float tex=vn(vXZ*2.3)*.6+vn(vXZ*7.1)*.4;
  fm=smoothstep(.15,.75,fm*(.55+.9*tex));
  vec3 foamC=(sunC*sunI*max(dot(n,L),0.)*.3+amb*1.1)*.9;
  col=mix(col,foamC,fm*.9);
  vec3 hz=skyL(normalize(vec3(-V.x,0.,-V.z)),1.);
  col=mix(col,hz,1.-exp(-dist/fogL));
  float mu=dot(-V,L);col+=disc*sunC*sunI*(pow(max(mu,0.),1500.)*.6+pow(max(mu,0.),40.)*.04);
  o=vec4(tone(col*expo)+(h12(gl_FragCoord.xy)-.5)/255.,1);
}`;
  // 海面の点の動きを読む（横 = 点の番号、縦 0 = 変位、1 = 傾き）。WC = 小さい海面（20 m）を入れる割合
  const FS_PROBE = HEAD + `
uniform vec2 P[16];uniform float WB[16],WC[16];uniform vec3 Ls;uniform sampler2D dA,dB,dC,sA,sB,sC;out vec4 o;
void main(){int i=int(gl_FragCoord.x);vec2 xz=P[i];float wb=WB[i],w=WC[i];
  if(gl_FragCoord.y<1.)o=vec4(textureLod(dA,xz/Ls.x,0.).xyz+wb*textureLod(dB,xz/Ls.y,0.).xyz+w*textureLod(dC,xz/Ls.z,0.).xyz,0.);
  else o=vec4(textureLod(sA,xz/Ls.x,0.).xy+wb*textureLod(sB,xz/Ls.y,0.).xy+w*textureLod(sC,xz/Ls.z,0.).xy,0.,0.);}`;
  // 大きさくらべの物（人・浮き台）。色は頂点ごと、光は太陽＋空
  const VS_MESH = HEAD + `
in vec3 aP,aN,aC,aM;uniform mat4 VP,M;out vec3 vP,vN,vC,vM;out float vLy;
void main(){vec4 w=M*vec4(aP,1);vP=w.xyz;vN=mat3(M)*aN;vC=aC;vM=aM;vLy=aP.y;gl_Position=VP*w;}`;
  const FS_MESH = HEAD + SKYL + `
uniform vec3 cam,L,sunC;uniform float sunI,expo,fogL,wetRain,wetSplash;in vec3 vP,vN,vC,vM;in float vLy;out vec4 o;
// vM = (つや, 濡れやすさ, 0)。濡れると色が暗く、つやが強くなる（見た目の目安）
void main(){vec3 n=normalize(vN);vec3 amb=skyL(vec3(0,1,0),6.);
  float dist=length(cam-vP);vec3 V=(cam-vP)/dist;if(dot(n,V)<0.)n=-n;
  float wet=clamp(max(wetRain,wetSplash*(1.-smoothstep(.15,1.4,vLy))),0.,1.)*vM.y;
  vec3 alb=vC*(1.-.45*wet);float gl=mix(vM.x,.9,wet);
  vec3 col=alb*(sunC*sunI*max(dot(n,L),0.)*.06+amb*(.55+.45*n.y));
  vec3 h=normalize(L+V);float nv=max(dot(n,V),0.),F=.04+.96*pow(1.-nv,5.);
  col+=sunC*sunI*pow(max(dot(n,h),0.),mix(10.,500.,gl))*gl*(.02+.25*F)*step(0.,dot(n,L));
  col+=skyL(reflect(-V,n),(1.-gl)*6.)*F*gl*.45;
  col=mix(col,skyL(normalize(vec3(-V.x,0.,-V.z)),1.),1.-exp(-dist/fogL));
  o=vec4(tone(col*expo),1);}`;
  return { VS_FULL, FS_SPEC, FS_FFT, FS_ASM, FS_SKYTEX, FS_SKY, VS_WATER, FS_WATER, VS_MESH, FS_MESH, FS_PROBE };
})();
