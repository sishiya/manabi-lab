// 波が育つまで — GLSL（海面の FFT・空・海の描画）。もとは自動収益化の試作4「海」。
// 傾きの分布での照り返し・空の反射、白波の泡（地図・模様・描き方）、色の仕上げ AgX は web-ocean を GLSL に書きかえて使っている:
//   web-ocean  https://github.com/Noniv/web-ocean  Copyright (c) 2026 Maksymilian Dendura  MIT License（全文は wave-growth/LICENSE-web-ocean.txt）
'use strict';
window.WGsh = (() => {
  const HEAD = '#version 300 es\nprecision highp float;precision highp int;precision highp sampler2D;\n';
  const VS_FULL = HEAD + `out vec2 vUv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUv=p;gl_Position=vec4(p*2.-1.,0,1);}`;

  // h(k,t) と、横の変位・傾き・変位の微分を作る（実数の場を2つずつ複素数1つにつめる）
  const FS_SPEC = HEAD + `
uniform sampler2D h0;uniform float L,t,N,w0,depth;
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;
vec2 cm(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
vec2 im(vec2 a){return vec2(-a.y,a.x);}
void main(){
  ivec2 ij=ivec2(gl_FragCoord.xy);vec2 n=vec2(ij);n-=N*step(N*.5,n);
  vec2 k=6.2831853*n/L;float kl=length(k);
  vec4 h=texelFetch(h0,ij,0);
  float th=tanh(min(kl*depth,20.));   // 水深 depth の分散 w² = g k tanh(kh)（深い海は 1）
  float w=max(round(sqrt(9.81*kl*th+7.4e-5*kl*kl*kl)/w0),1.)*w0;   // ω² = g k tanh(kh) + (σ/ρ) k³（表面張力 σ/ρ = 7.4×10⁻⁵ m³/s²）。くり返しのため 2π/T の整数倍に丸める
  float ph=mod(w*t,6.2831853);vec2 e=vec2(cos(ph),sin(ph));
  vec2 H=cm(h.xy,e)+cm(h.zw,vec2(e.x,-e.y));
  vec2 kn=kl>1e-6?k/kl:vec2(0);float ik=kl>1e-6?1./kl:0.;
  float cth=1./max(th,.33);   // 浅い海では水面の横の動きが大きい（線形の波: 横の振れ幅 = 高さの振れ幅 / tanh kh。3 倍まで）
  vec2 Dx=cm(vec2(0,-kn.x),H)*cth,Dz=cm(vec2(0,-kn.y),H)*cth;
  vec2 Sx=cm(vec2(0,k.x),H),Sz=cm(vec2(0,k.y),H);
  vec2 Dxx=H*k.x*k.x*ik*cth,Dzz=H*k.y*k.y*ik*cth,Dxz=H*k.x*k.y*ik*cth;
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

  // 変位・ヤコビアン（つぶれ）・傾き・傾きの2乗（LEAN: ミップで平均すると、その広さの傾きのばらつきがわかる）
  // o1 = (傾き x, 傾き z, Dxx, Dzz)、o2 = (sx², sz², sx·sz, Dxz)。D** は 3 枚を足して全体のつぶれ J を出すため（白波の泡）
  const FS_ASM = HEAD + `
uniform sampler2D A,B;uniform float lam;
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;layout(location=2) out vec4 o2;
void main(){
  ivec2 ij=ivec2(gl_FragCoord.xy);vec4 a=texelFetch(A,ij,0),b=texelFetch(B,ij,0);
  float h=a.x,Dx=a.y,Dz=a.z,hx=a.w,hz=b.x,Dxx=b.y,Dzz=b.z,Dxz=b.w;
  float jxx=1.-lam*Dxx,jzz=1.-lam*Dzz,jxz=-lam*Dxz,J=jxx*jzz-jxz*jxz;
  o0=vec4(-lam*Dx,h,-lam*Dz,J);
  vec2 s=vec2(hx/max(jxx,.3),hz/max(jzz,.3));
  o1=vec4(s,lam*Dxx,lam*Dzz);o2=vec4(s.x*s.x,s.y*s.y,s.x*s.y,lam*Dxz);
}`;

  // 泡の模様（はじめに 1 回だけ。512×512 でつながる）: r = 大きな膜と穴、g = 細かい泡の網、b = やわらかい濃淡、a = すじ
  // web-ocean（Maksymilian Dendura、MIT ライセンス）の FOAM_TEX を GLSL に書きかえたもの
  const NOISE = `
uint pcg(uint v){uint s=v*747796405u+2891336453u;uint w=((s>>((s>>28u)+4u))^s)*277803737u;return (w>>22u)^w;}
int imod(int a,int b){return a-b*int(floor(float(a)/float(b)));}
vec2 hgrad(ivec2 i){uint h=pcg(uint(i.x)*1664525u+pcg(uint(i.y)+1013904223u));float a=float(h)*(6.28318530718/4294967296.);return vec2(cos(a),sin(a));}
float pnoise(vec2 p,int per){ivec2 i=ivec2(floor(p));vec2 f=p-floor(p),u=f*f*f*(f*(f*6.-15.)+10.);
  ivec2 i00=ivec2(imod(i.x,per),imod(i.y,per)),i11=ivec2(imod(i.x+1,per),imod(i.y+1,per));
  float a=dot(hgrad(i00),f),b=dot(hgrad(ivec2(i11.x,i00.y)),f-vec2(1,0)),c=dot(hgrad(ivec2(i00.x,i11.y)),f-vec2(0,1)),d=dot(hgrad(i11),f-vec2(1));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float pfbm(vec2 p,int per,int oct){float s=0.,a=.5;for(int o=0;o<8;o++){if(o>=oct)break;s+=a*pnoise(p,per);p*=2.;per*=2;a*=.5;}return s;}
`;
  const FS_FOAMTEX = HEAD + NOISE + `
out vec4 o;
vec2 h2(ivec2 i,uint salt){uint h=pcg((uint(i.x)*73856093u)^pcg(uint(i.y)*19349663u+salt));uint g=pcg(h+0x9e3779b9u);return vec2(float(h>>8u),float(g>>8u))/16777216.;}
// 穴のあいた泡の膜: 膜は 1、泡の中は 0（泡ごとに大きさがちがう）
float bubbles(vec2 uv,int per,uint salt,float rmin,float rmax){
  vec2 w=vec2(pfbm(uv*float(per)*.5,per/2,3),pfbm(uv*float(per)*.5+17.,per/2,3));vec2 p=uv*float(per)+w*.9;ivec2 ip=ivec2(floor(p));vec2 fp=p-floor(p);float v=9.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ivec2 c=ivec2(imod(ip.x+i,per),imod(ip.y+j,per));vec2 r=vec2(i,j)+h2(c,salt)*.9+.05-fp;v=min(v,length(r)/mix(rmin,rmax,h2(c,salt+7u).x));}
  return smoothstep(.8,1.25,v);}
void main(){vec2 uv=gl_FragCoord.xy/512.;
  vec2 w1=vec2(pfbm(uv*5.,5,3),pfbm(uv*5.+vec2(3.7,9.1),5,3));float m1=smoothstep(-.14,.06,pfbm(uv*10.+w1*1.4,10,5));
  vec2 w2=vec2(pfbm(uv*12.+1.3,12,2),pfbm(uv*12.+7.9,12,2));float m2=smoothstep(-.16,.04,pfbm(uv*27.+w2*.9,27,4));
  float b3=bubbles(uv,28,37u,.06,.45),b4=bubbles(uv,60,53u,.05,.42),   // 周期は偶数（ゆがみの周期 per/2 とつながるように。web-ocean は 29・61）
    dens=pfbm(uv*4.,4,5)*.5+.5,fineD=pfbm(uv*16.,16,3)*.5+.5;
  float big=m1*(.55+.45*m2)*(.75+.25*b3),fine=.45+.55*b3*(.7+.3*b4),streak=pfbm(uv*vec2(4,16),4,5)*.5+.5;
  o=vec4(clamp(big*.6+dens*.4,0.,1.),clamp(fine*.8+fineD*.2,0.,1.),dens,streak);}`;

  // 泡の白さ 0〜1（web-ocean の泡の描き方）: 泡の量 cover と模様 pat（fTex）をくらべる。多い所は白い膜、うすれると穴があき、古い泡は風下のすじ st に割れる。
  // fk = できたばかりの割合、fg = 砕けたばかりの波頭、fw = 1 画素の幅。FS_WATER と泡の地図で同じ式（地図では白い面積を数えて観測に合わせる）
  const FOAMF = `
float foamPat(sampler2D t,vec2 xz,float time){return textureLod(t,xz*.23+vec2(.013,0)*time,0.).r*.78+textureLod(t,xz*.71+vec2(.37,.71),0.).g*.22;}
float foamStreak(sampler2D t,vec2 xz,float wa){vec2 wd=vec2(cos(wa),sin(wa));return textureLod(t,vec2(dot(xz,wd),dot(xz,vec2(-wd.y,wd.x)))*vec2(.035,.11),0.).a;}
float foamMask(float cover,float fk,float fg,float pat,float st,float fw){
  cover*=mix(smoothstep(.25,.75,st)*1.5,1.,fk);
  float soft=.04+.14*(1.-clamp(cover,0.,1.));   // 濃い泡はふちがくっきり、うすれた泡はふちがやわらかい
  float m=clamp(smoothstep(1.-cover-fw-soft,1.-cover+fw+soft,pat)*smoothstep(0.,.5,cover),0.,1.)*(.68+.32*smoothstep(.3,.9,cover));
  return max(m,smoothstep(.35,.9,fg)*smoothstep(.4,.6,pat)*.9);}   // 砕けたばかりの波頭: 白いが、泡の模様の穴は残す（web-ocean は .25〜.6 でほぼ全面。近くで平らな紙のように見えたので）
`;
  // 白波の泡の地図（カメラのまわり、世界に固定。端はつながっていてカメラについてずらす）: 3 枚の海面を足した全体のつぶれ J が thr より小さい所に泡が生まれ、
  // 時間で消え（decay /s）、風下へ少し流される（drift m/s）。r = 泡の量、g = できたばかりの泡、b = J、a = 白く見える泡の面積（ミップの平均 = 割合。観測に合わせる）
  // web-ocean の FOAM_UPDATE を GLSL に書きかえ、白く見える面積の列 a を足したもの
  const FS_FOAMUPD = HEAD + FOAMF + `
uniform sampler2D prev,sA,sB,sC,mA,mB,mC,fTex;uniform vec3 Ls;uniform ivec4 snap;uniform ivec2 shift;uniform float RES,ts,dt,decayR,thr,gain,growth,time,windA,cOn;
layout(location=0) out vec4 o;
int wrapI(int i,int lo,int R){int a=i-lo;return lo+a-R*int(floor(float(a)/float(R)));}   // % は負の数で決まっていないので floor で
vec3 jac(sampler2D s,sampler2D m,vec2 p,float L){float lod=log2(max(ts/(L/256.),1.));if(lod>7.5)return vec3(0);vec2 uv=p/L;return vec3(textureLod(s,uv,lod).zw,textureLod(m,uv,lod).w);}
void main(){int R=int(RES);ivec2 id=ivec2(gl_FragCoord.xy),lo=snap.xy-R/2,plo=snap.zw-R/2;
  ivec2 g=ivec2(wrapI(id.x,lo.x,R),wrapI(id.y,lo.y,R));bool inPrev=all(greaterThanEqual(g,plo))&&all(lessThan(g,plo+R));
  vec2 p=(vec2(g)+.5)*ts;vec3 d=jac(sA,mA,p,Ls.x)+jac(sB,mB,p,Ls.y)+cOn*jac(sC,mC,p,Ls.z);   // 泡を作るつぶれ: 案 A・B は 3 枚とも（大きな波の山に小さな波のとがりが重なる所。web-ocean と同じ）、案 C は大・中だけ（波長 2.9 m より長い波）
  float J=(1.-d.x)*(1.-d.y)-d.z*d.z;
  ivec2 q=id-shift;q-=R*ivec2(floor(vec2(q)/float(R)));vec4 pv=inPrev?texelFetch(prev,q,0):vec4(0);   // 風下へ流れた分（画素ずつ）
  float inj=clamp((thr-J)*gain,0.,1.),f=max(pv.r*exp(-dt*decayR),inj);f=min(f+inj*dt*growth,1.6);
  float fr=max(pv.g*exp(-dt*1.6),inj);if(f<.01)f=0.;if(fr<.01)fr=0.;   // ほとんど消えた泡は 0 に（描くときにとばせるように）
  // 白さ: この点の模様で、絵と同じ式（模様は地図の画素よりずっと細かいので、地図ぜんぶの平均 = 泡の面積。うすい膜は濃さの分だけ数える）
  float m=foamMask(min(f+fr*.6,1.5),clamp(fr*2.,0.,1.),fr,foamPat(fTex,p,time),foamStreak(fTex,p,windA),.03);
  o=vec4(f,fr,J,m*.95*max(J,0.));}`;   // 絵の泡の面積: 白さ × 0.95（絵と同じ）× J（動かす前の面積を、動いたあとの面積へ）

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
  float ca=0.;   // 雲の濃さ（a）: 太陽・月の円盤と、日がさす量に使う
  if(cover>0.){
    float t=1500./max(d.y,1e-3);vec2 p=d.xz*t+cOff;
    float n=fbm(p*.00035)*.75+fbm(p*.0021)*.25;
    float a=smoothstep(1.05-cover,1.4-cover,n)*mix(smoothstep(0.,.07,d.y),1.,smoothstep(.8,.95,cover));   // くもり・雨は水平線まで雲
    float mu=dot(d,L),hg=(1.-.36)/pow(1.+.36-1.2*mu,1.5)/12.566;
    vec3 sl=sunI*sunT(vec3(0,Re+1500.,0),L)*max(L.y+.05,0.)*1.4+moonI*sunT(vec3(0,Re+1500.,0),Lm)*max(Lm.y+.05,0.)*1.4;
    vec3 cc=(sl*(.05+hg*(1.4-a))+ambU*2.2)*cdark;
    ca=a*mix(exp(-t/30000.),1.,smoothstep(.8,.95,cover))*.95;col=mix(col,cc,ca);
  }
  o=vec4(col,ca);
}`;

  const UNDER = `
// 水の光: 吸収 KD・まっすぐ進む光の弱まり KC（吸収＋散乱）/m、海の色 deepC（水の中から上がってくる光）。透明度のつまみから js/scene.js の waterOptics で
uniform vec3 KD,KC,deepC;
uniform float under,camD;
// 水の中の光（向き d を見たとき）: 上から見た海の色（水面へ上がってくる光）を下向き 1 として、横 5・上 40 くらい（目安）。深さ camD まで弱まる
vec3 ubg(vec3 d,vec3 amb,vec3 L,vec3 sunC,float sunI){vec3 Lu=deepC*(amb*.9+sunC*sunI*.04*max(L.y,0.));
  float k=d.y<0.?mix(1.,5.,1.+d.y):mix(5.,40.,d.y*d.y);return Lu*k*exp(-KD*camD);}
`;
  const CAUST_ = (a, b, decl) => `
// コースティクス: 太陽の光は水面の傾きで曲がって進み、深さ D で集まる所は明るい。明るさ = 1/|J|、J = det(I − D(1 − 1/1.33)·H)（H = 水面の高さの 2 階微分、
// 中と小の海面の傾きを差で微分）。太陽の円盤の大きさで深いほどぼやけるので exp(−D/8) で弱める（目安）
${decl ? 'uniform sampler2D cS1,cS2;' : ''}uniform vec3 cLs,cSun;
vec2 cslope(vec2 p){return textureLod(${a},p/cLs.y,0.).xy+textureLod(${b},p/cLs.z,0.).xy;}
float caust(vec2 xz,float D){if(D<=0.)return 1.;
  vec3 t=refract(-cSun,vec3(0,1,0),1./1.33);if(t.y>-.05)return 1.;vec2 xs=xz+t.xz/t.y*D;   // その点に届く光が水面を通った所
  const float e=.08;vec2 sx1=cslope(xs+vec2(e,0)),sx0=cslope(xs-vec2(e,0)),sz1=cslope(xs+vec2(0,e)),sz0=cslope(xs-vec2(0,e));
  float hxx=(sx1.x-sx0.x)/(2.*e),hzx=(sx1.y-sx0.y)/(2.*e),hxz=(sz1.x-sz0.x)/(2.*e),hzz=(sz1.y-sz0.y)/(2.*e),k=D*(1.-1./1.33);
  float J=(1.-k*hxx)*(1.-k*hzz)-k*k*hxz*hzx;return mix(1.,clamp(1./max(abs(J),.1),0.,6.),exp(-D/8.));}
// 光芒: 見る向きにそって水の中を 10 点。各点に届く太陽の光（深さで弱まる × 集まり方）が、前に強く散らばる分（ヘニー–グリーンスタイン g 0.9、散乱 0.03 /m）
vec3 shafts(vec3 ro,vec3 rd,float maxT,vec3 sunC,float sunI){vec3 t=refract(-cSun,vec3(0,1,0),1./1.33);if(t.y>-.05)return vec3(0);
  float g=.9,mu=dot(t,-rd),ph=(1.-g*g)/(12.566*pow(1.+g*g-2.*g*mu,1.5)),dt=maxT/10.;vec3 acc=vec3(0);
  for(int i=0;i<10;i++){vec3 p=ro+rd*(float(i)+.5)*dt;float D=-p.y;if(D<=0.)break;acc+=exp(-KD*D-KC*(float(i)+.5)*dt)*caust(p.xz,D)*dt;}
  return acc*sunC*sunI*.03*ph*.25;}   // 最後の .25 は見え方の目安（光芒の強さの合わせ）
`;
  const CAUST = CAUST_('cS1', 'cS2', true);
  const SKYL = `
uniform sampler2D skyT;
vec3 skyL(vec3 d,float lod){d.y=max(d.y,0.);float v=sqrt(d.y),u=atan(d.z,d.x)/6.2831853+.5;return textureLod(skyT,vec2(u,v),lod).rgb;}
// 太陽（夜は月）の前に雲があるか: 空の絵の雲の濃さを、その向きで読む。日がさす量 = 1 − 濃さ（雲が流れると、ひなたとかげがなめらかに入れかわる）
float sunVis(vec3 L){float v=sqrt(max(L.y,0.)),u=atan(L.z,L.x)/6.2831853+.5;return 1.-textureLod(skyT,vec2(u,v),1.).a;}
vec3 sunC;   // 雲を通ったあとの光の色（main のはじめに sunCu × sunVis）
// 色の仕上げ AgX（Sobotka の AgX を Wrensch の多項式で近似したもの。明るい所が白へなめらかに抜け、夕日が黄色くつぶれない）。式と look（彩度 1.05・強さ 1.06）は web-ocean の COMPOSITE
// はじめに 1.3 倍: 前の ACES の近似＋ガンマと、中間の明るさ（0.18 の灰色）をそろえる
vec3 tone(vec3 c){c*=1.3;   // web-ocean にある明るい所の脱色（0.7〜6 で灰色へ 55%）は、夕方の空と照り返しの金色をぬいてしまうので入れない（AgX そのものが明るい所を白へ寄せる）
  vec3 x=mat3(.842479062253094,.0423282422610123,.0423756549057051,.0784335999999992,.878468636469772,.0784336,.0792237451477643,.0791661274605434,.879142973793104)*max(c,vec3(1e-10));
  x=(clamp(log2(x),-12.47393,4.026069)+12.47393)/16.5;vec3 x2=x*x,x4=x2*x2;
  x=15.5*x4*x2-40.14*x4*x+31.96*x4-6.868*x2*x+.4298*x2+.1191*x-.00232;
  float l=dot(x,vec3(.2126,.7152,.0722));x=l+1.05*(pow(max(x,vec3(0)),vec3(1.06))-l);
  return clamp(mat3(1.19687900512017,-.0528968517574562,-.0529716355144438,-.0980208811401368,1.15190312990417,-.0980434501171241,-.0990297440797205,-.0989611768448433,1.15107367264116)*x,0.,1.);}
float h12(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
`;

  const FS_SKY = HEAD + SKYL + UNDER + CAUST + `
uniform vec3 cf,cr,cu,L,sunCu,cam,Lsun,sunCd,LmD,moonK;uniform float tx,ty,sunI,expo,disc,stars,fogSky;in vec2 vUv;out vec4 o;
void main(){
  sunC=sunCu*sunVis(L);
  vec3 d=normalize(cf+(vUv.x*2.-1.)*tx*cr+(vUv.y*2.-1.)*ty*cu);
  if(under>0.){o=vec4(tone((ubg(d,skyL(vec3(0,1,0),6.),L,sunC,sunI)+shafts(cam,d,40.,sunC,sunI))*expo)+(h12(gl_FragCoord.xy)-.5)/255.,1);return;}   // 水の中: 空のかわりに水の中の光＋光芒
  vec3 c=skyL(d,0.);float mu=dot(d,L);
  if(d.y<0.){float Fg=.02+.98*pow(1.-min(1.,-d.y*1.2),5.);c=mix(deepC*(skyL(vec3(0,1,0),6.)*.9+sunC*sunI*.04*max(L.y,0.)),skyL(vec3(d.x,-d.y,d.z),2.),Fg);}   // 水平線より下: 海の色の下地（網目が足りない所でも空にならないように）
  c=mix(c,skyL(normalize(vec3(d.x,0.,d.z)),1.),fogSky*(1.-smoothstep(0.,.35,d.y)));   // 霧: 空の下のほうもかすむ
  float cvis=1.-textureLod(skyT,vec2(atan(d.z,d.x)/6.2831853+.5,sqrt(max(d.y,0.))),0.).a;   // この向きの雲のすきま
  {float ms=dot(d,Lsun);c+=disc*sunCd*sunI*(smoothstep(.99997,.99999,ms)*60.*cvis+pow(max(ms,0.),1500.)*.6*cvis+pow(max(ms,0.),40.)*.04*sunVis(Lsun));}   // 太陽の円盤（雲が前にあると見えない）
  // 月: 本当の大きさ（半径 0.26°）の球。太陽の向きから照らす（満ち欠けは計算のとおり）。明るさは月の表面の散らばり方（ロンメル–ゼーリガー）、満月で円盤の平均 = moonK
  if(moonK.g>0.&&dot(d,LmD)>.99996){vec3 ax=normalize(cross(LmD,vec3(0,1,0))),ay=cross(ax,LmD);vec2 q=vec2(dot(d,ax),dot(d,ay))/.00454;float r2=dot(q,q);
    if(r2<1.){float mu0=sqrt(1.-r2);vec3 nm=q.x*ax+q.y*ay-LmD*mu0;float i0=max(dot(nm,Lsun),0.);c+=moonK*2.*i0/(i0+mu0+1e-4)*cvis;}}
  if(stars>0.&&d.y>0.){vec2 sp=vec2(atan(d.z,d.x),asin(d.y))*180.;vec2 ci=floor(sp),f=fract(sp)-.5;float hs=h12(ci);
    float st=step(.993,hs)*smoothstep(.22,0.,length(f))*(hs-.993)*140.*smoothstep(0.,.15,d.y);c+=vec3(st)*stars*.02;}
  o=vec4(tone(c*expo)+(h12(gl_FragCoord.xy)-.5)/255.,1);
}`;

  // 画面に張った格子を海面へ投げて、3枚の海面の変位を足す（projected grid）
  const VS_WATER = HEAD + `
in vec2 aG;
uniform vec3 cam,cf,cr,cu,Ls;uniform float tx,ty,y0,y1,pixA,far,planeY,bigOn,bigL,bigX0,curvR,bigWrap,gx;uniform mat4 VP;
uniform sampler2D dA,dB,dC,bigT;
out vec3 vPos;out vec2 vXZ;out float vH,vBS,vDep,vBF;
float lod(float fp,float L){return max(0.,log2(fp/(L/256.)));}
// ミラーの惑星: 浅い海の式の水面（r = 高さ、g = 傾き、b = 水深）を x で読む（4096 本の線を手で線形補間）
vec4 big(float xw){float p=(bigX0+xw)/bigL*4096.-.5,f=fract(p);int i0=int(floor(p)),i1;
  if(bigWrap>0.){i0=((i0%4096)+4096)%4096;i1=(i0+1)%4096;}else{i0=clamp(i0,0,4095);i1=min(i0+1,4095);f=clamp(f,0.,1.);}   // 浜はくり返さない
  return mix(texelFetch(bigT,ivec2(i0,0),0),texelFetch(bigT,ivec2(i1,0),0),f);}
void main(){
  vec2 ndc=vec2(mix(-gx,gx,aG.x),mix(y0,y1,aG.y));
  vec3 d=normalize(cf+ndc.x*tx*cr+ndc.y*ty*cu);
  float hgt=cam.y-planeY;
  float hor=hgt>=0.?(d.y<-1e-5?length(d.xz)*max(hgt,.5)/(-d.y):1e9):(d.y>1e-5?length(d.xz)*(-hgt)/d.y:1e9);hor=min(hor,far);   // 水の中からは上向きの光線で水面へ
  vec2 xz=cam.xz+normalize(d.xz+vec2(1e-6,0))*hor;
  float fp=max(hor,cam.y)*pixA*1.5;
  vec3 D=textureLod(dA,xz/Ls.x,lod(fp,Ls.x)).xyz;
  D+=textureLod(dB,xz/Ls.y,lod(fp,Ls.y)).xyz*(1.-smoothstep(2500.,5000.,hor));
  D+=textureLod(dC,xz/Ls.z,lod(fp,Ls.z)).xyz*(1.-smoothstep(150.,400.,hor));
  vBS=0.;vDep=1e4;vBF=0.;vec4 bg4=vec4(0);
  if(bigOn>0.){bg4=big(xz.x);D*=clamp(bg4.b/1.5,0.,1.);vBS=bg4.g;vDep=bg4.b;vBF=bg4.a;}   // 浅い所ほど小さい風の波は弱い
  vec3 p=vec3(xz.x,bg4.r,xz.y)+D;
  {float dd=length(xz-cam.xz);p.y-=dd*dd/(2.*curvR);}   // 星の丸みで遠くは沈む（地球の海は curvR = 地球の半径、ふだんは 1e9）
  vPos=p;vXZ=xz;vH=D.y;gl_Position=VP*vec4(p,1);
}`;

  const FS_WATER = HEAD + SKYL + UNDER + 'uniform sampler2D sA,sB,sC,sD,mA,mB,mC,mD,fW0,fW1,fTex;' + CAUST_('sB', 'sC') + FOAMF + `
uniform vec3 cam,L,sunCu,Ls,cfw;uniform float sunI,expo,fogL,sss,rough0,disc,fogH,windU,windA,hasBg,nearP,farP,foamK,foamW,time,dbg,fMap,LsD,dOn,pixF,thrR,frOn;uniform sampler2D fCdf;uniform vec2 vpS,fL;uniform sampler2D bgC,bgD;
in vec3 vPos;in vec2 vXZ;in float vH,vBS,vDep,vBF;out vec4 o;
// 傾きの分布（LEAN mapping。Olano & Baker 2010）: ミップで平均した傾き E[s] と傾きの2乗 E[s²] から、その画素の広さの中の傾きのばらつき（共分散）を出す
vec3 slopeCov(vec4 s,vec4 m){return vec3(max(m.x-s.x*s.x,0.),max(m.y-s.y*s.y,0.),m.z-s.x*s.y);}
// Smith のかくれる割合（傾きが正規分布のとき。向きで変わるばらつき）
float lambdaS(vec3 w,vec3 cv){float q=max(dot(w.xz,w.xz),1e-8),il=inversesqrt(q);vec2 az=w.xz*il;
  float s2=az.x*az.x*cv.x+az.y*az.y*cv.y+2.*az.x*az.y*cv.z,a=max(w.y*il,1e-3)/sqrt(2.*max(s2,1e-7));
  return a>=1.6?0.:(1.-1.259*a+.396*a*a)/(3.535*a+2.181*a*a);}
void main(){sunC=sunCu*sunVis(L);
  vec2 uA=vXZ/Ls.x,uB=vXZ/Ls.y,uC=vXZ/Ls.z;
  vec4 a=texture(sA,uA),b=texture(sB,uB),c=texture(sC,uC);
  vec2 sl=a.xy+b.xy+c.xy;
  vec4 ma=texture(mA,uA),mb=texture(mB,uB),mc=texture(mC,uC);
  vec3 cov=slopeCov(a,ma)+slopeCov(b,mb)+slopeCov(c,mc);
  if(dOn>.5){vec2 uD=vXZ/LsD;vec4 d=texture(sD,uD);sl+=d.xy;cov+=slopeCov(d,texture(mD,uD));}   // 4 枚め（2.5 cm まで）: 傾きだけ（dOn は画質で決まり画面ぜんぶ同じなので、if の中のミップの自動選択も同じ）
  float jz=ma.w+mb.w+mc.w,Jt=(1.-a.z-b.z-c.z)*(1.-a.w-b.w-c.w)-jz*jz;   // 3 枚を足したつぶれ（その画素の）
  vec3 n=normalize(vec3(-sl.x-vBS,1.,-sl.y));
  vec3 V=cam-vPos;float dist=length(V);V/=dist;
  // 白波の泡: 近く（128 m の地図）と遠く（1 km）を、地図の端の手前でまぜる。その先は画素のつぶれだけ
  vec2 dc=abs(vXZ-cam.xz);float cheb=max(dc.x,dc.y),w0=1.-smoothstep(.3*fL.x,.45*fL.x,cheb),w1=1.-smoothstep(.3*fL.y,.45*fL.y,cheb);
  if(fMap<.5){w0=0.;w1=0.;}   // 画質「低」: 泡の地図なし（画素のつぶれだけの目安）
  vec4 fwl=mix(texture(fW1,vXZ/fL.y),texture(fW0,vXZ/fL.x),w0)*w1;
  float fresh=frOn*clamp((thrR-Jt)*2.5,0.,1.);   // 案 A・B: その画素の 3 枚のつぶれからも、いま砕けている波頭の泡（地図の外では、これだけ。web-ocean と同じ）
  float cover=clamp(max(fwl.r,fresh*(1.-w1*.7))+fwl.g*.6,0.,1.5)*foamK;
  if(under>0.){   // 水の中から水面を見る（カメラの真上の水面より下にいるとき）: 水 → 空気の屈折（スネルの窓）、窓の外は全反射。通った光は 1.33² 倍（放射輝度は n² に比例）。カメラまでは水のかすみ
    vec3 amb0=skyL(vec3(0,1,0),6.),I=-V,Nd=-n,Tt=refract(I,Nd,1.33);float F=1.;vec3 col0=vec3(0);
    if(dot(Tt,Tt)>0.){F=.02+.98*pow(1.-max(dot(Tt,n),0.),5.);col0=(skyL(Tt,rough0*4.)+sunC*sunI*pow(max(dot(Tt,L),0.),900.)*disc*.5)*(1.-F)*1.77;}
    col0+=F*ubg(reflect(I,Nd),amb0,L,sunC,sunI);
    float fmU=clamp(cover+vBF,0.,1.);col0=mix(col0,amb0*.6,smoothstep(.2,.8,fmU)*.7);   // 泡は下から見ると白くくもる
    vec3 Tr=exp(-KC*dist);col0=col0*Tr+ubg(I,amb0,L,sunC,sunI)*(1.-Tr)+shafts(cam,I,min(dist,40.),sunC,sunI);
    o=vec4(tone(col0*expo)+(h12(gl_FragCoord.xy)-.5)/255.,1);return;}
  // 描けない細かい波の傾き rough0（Cox & Munk 1954 の全体から、描いている波の分を引いた残り。rough0² = 2 方向の和）と、太陽の円盤の大きさ（半径 0.27°）
  cov.xy+=rough0*rough0*.5+1.4e-6;
  // 画面の 1 画素の中で傾きが変わるぶんも広げる（ちらつきを抑える。Kaplanyan 2016 の考え方）
  {vec2 dx=dFdx(sl),dy=dFdy(sl);vec3 aa=vec3(dx.x*dx.x+dy.x*dy.x,dx.y*dx.y+dy.y*dy.y,dx.x*dx.y+dy.x*dy.y)*.5;cov+=aa*min(1.,.03/max(max(aa.x,aa.y),1e-8));}
  // 太陽の照り返し: 傾きの分布（向きでちがう正規分布）のうち、太陽を目に返す傾きの割合
  cov.z=clamp(cov.z,-.99*sqrt(cov.x*cov.y),.99*sqrt(cov.x*cov.y));   // 共分散が正定値になるように（RGBA16F の 2 乗の差で、まれにこわれる）
  vec3 H=normalize(V+L);vec2 hs=-H.xz/max(H.y,1e-3),ds=hs-sl;float det=max(cov.x*cov.y-cov.z*cov.z,1e-10);
  float e=(ds.x*ds.x*cov.y+ds.y*ds.y*cov.x-2.*ds.x*ds.y*cov.z)/det,hy2=H.y*H.y,Dm=exp(-.5*e)/(6.2831853*sqrt(det))/max(hy2*hy2,1e-6);
  float G=1./(1.+lambdaS(V,cov)+lambdaS(L,cov)),Fh=.02+.98*pow(1.-max(dot(H,V),0.),5.);
  vec3 spec=sunC*sunI*Fh*Dm*G/(4.*max(V.y,.02))*step(0.,L.y);
  // 空の反射: 浅い角度では、見えている面は手前に傾いたものが多い（見える面積とかくれる面）→ 反射は少し上の空を見る
  float sig=sqrt(max(cov.x+cov.y,1e-6)*.5);vec3 vh=normalize(vec3(V.x,0.,V.z)+vec3(1e-5,0,0));
  float sigV=sqrt(max(vh.x*vh.x*cov.x+vh.z*vh.z*cov.y+2.*vh.x*vh.z*cov.z,1e-6)),aV=max(V.y,1e-3)/max(sqrt(1.-V.y*V.y),1e-3)/(1.4142*sigV);
  vec3 nV=normalize(n+vh*.32*sigV*(1.-smoothstep(0.,2.5,aV)));
  vec3 R=reflect(-V,nV);R.y=abs(R.y)*.4+max(R.y,0.)*.6;R=normalize(R);
  vec3 refl=skyL(R,clamp(log2(max(2.*sig*81.5,1.)),0.,8.));   // 空の絵は横 512 画素で 1 周（1 ラジアン 81.5 画素）。ばらつきの幅でぼかす
  float nv=max(dot(nV,V),1e-3);
  float F=.02+.98*pow(1.-max(dot(normalize(mix(n,vec3(0,1,0),.45)),V),0.),5.);   // フレネル（水の屈折率 1.33）。細かい波はならした面で（浅い角度で見える面は反射が強いまま）
  vec3 amb=skyL(vec3(0,1,0),6.);
  vec3 deep=deepC,sc=vec3(.05,.33,.3);
  float k1=max(vH+.3,0.)*pow(max(dot(L,-V),0.),4.)*pow(.5-.5*dot(L,n),3.);
  float k2=pow(nv,2.)*.25;
  vec3 body=deep*(amb*.9+sunC*sunI*.04*max(L.y,0.))+sc*sunC*sunI*.012*(k1*3.*sss+k2);   // 水の中で散らばって出てくる光（見た目で決めた強さ）
  // 浅い所（ミラーの惑星の棚）は底が見える（水深で色がうすれる。見た目の目安）
  vec3 sand=vec3(.42,.38,.3)*(sunC*sunI*max(L.y,0.)*.05+amb*.7);body=mix(sand,body,1.-exp(-vDep/1.5));
  // 水の下の物（大きさくらべの人など）: 物までの水の厚み t から、光が吸われる分（ベール–ランベルト。赤ほど早く吸われる）と水の中で散らばる分。少し屈折でずらす
  float pat=texture(fTex,vXZ*.23+vec2(.013,0)*time).r*.78+texture(fTex,vXZ*.71+vec2(.37,.71)).g*.22,fwp=fwidth(pat)+.03;   // 遠くはミップでならす（地図の数え方は foamPat）   // 微分は discard より前で
  vec2 dX=dFdx(vXZ),dY=dFdy(vXZ);   // 下の if の中ではミップを自動で選べないので、ここで微分しておく
  float contact=0.;
  if(hasBg>0.){vec2 uv=gl_FragCoord.xy/vpS;float dz=texture(bgD,uv).r;
    if(dz<.99999){float zn=dz*2.-1.,zo=2.*nearP*farP/(farP+nearP-zn*(farP-nearP)),zw=dot(vPos-cam,cfw);
      if(zo<zw-.02)discard;   // 物のほうが手前
      float t=(zo-zw)/max(dot(-V,cfw),.2);vec2 uv2=clamp(uv+n.xz*.03*min(t,1.),0.,1.);float dz2=texture(bgD,uv2).r;if(dz2>=.99999)uv2=uv;
      vec3 Tr=exp(-t*KC);   // 物までの水で弱まる分（吸収＋散乱、透明度のつまみ）
      body=texture(bgC,uv2).rgb*Tr+body*(1.-Tr);contact=smoothstep(.07,0.,t);}}   // 物の色はすでに見た目の色（トーンのあと）
  // 泡の絵（web-ocean の泡の描き方を書きかえたもの。式は FOAMF の foamMask）
  vec3 sssC=vec3(.035,.12,.085);
  cover=clamp(cover+contact*.7+vBF,0.,1.5);   // vBF = 浜で砕けたあとの泡、contact = 水面と物がふれる所の細い泡
  body+=(sssC*2.6*(sunC*sunI*.05+amb*.35)+vec3(.1,.32,.3)*amb*.35)*clamp(fwl.g*1.5+cover*.15,0.,1.)*foamK;   // 泡の下の水: 砕けたばかりの所は、巻きこまれた気泡が光を散らして青緑に明るい（古いうすい泡の下は少しだけ）
  vec3 col=mix(body,refl,F)+spec;
  float fmk=0.;
  if(cover+fwl.g*foamK>1e-3){   // 泡のない所はとばす（重さ）
    vec2 wd=vec2(cos(windA),sin(windA)),wp=vec2(-wd.y,wd.x),k=vec2(.035,.11);
    float st=textureGrad(fTex,vec2(dot(vXZ,wd),dot(vXZ,wp))*k,vec2(dot(dX,wd),dot(dX,wp))*k,vec2(dot(dY,wd),dot(dY,wp))*k).a;
    fmk=foamMask(cover,clamp(fwl.g*2.+fresh,0.,1.),fwl.g*foamK,pat,st,fwp);
    // 模様がミップでぼけると値が平均に集まり、白い所が減る → ぼけるほど、白さの期待値（模様の値の分布の表 fCdf で P(pat > 1 − cover)）へ移す。地図で数えた割合と画面の割合がそろう
    float lodP=log2(max(max(length(dX),length(dY))*.23*512.,1.)),cs=cover*mix(smoothstep(.25,.75,st)*1.5,1.,clamp(fwl.g*2.,0.,1.));
    float ex=max(textureLod(fCdf,vec2(clamp(1.-cs,0.,1.),.5),0.).r*smoothstep(0.,.5,cs)*(.68+.32*smoothstep(.3,.9,cs)),smoothstep(.35,.9,fwl.g*foamK)*textureLod(fCdf,vec2(.5,.5),0.).r*.9);
    fmk=mix(fmk,ex,smoothstep(.5,2.5,lodP));
    float bub=textureGrad(fTex,vXZ*1.9+vec2(.21,.53),dX*1.9,dY*1.9).g;vec3 fAlb=vec3(.82,.87,.92)*(.78+.3*bub);
    vec3 fAmb=amb*.4+.15*(skyL(vec3(.94,.34,0),5.)+skyL(vec3(-.94,.34,0),5.)+skyL(vec3(0,.34,.94),5.)+skyL(vec3(0,.34,-.94),5.));   // 空全体からの光（泡は四方から照らされる）
    fAmb=mix(fAmb,vec3(dot(fAmb,vec3(.2126,.7152,.0722))),.85);
    vec3 foamC=fAlb*(sunC*sunI*max(dot(n,L),0.)*.318*.5+fAmb*1.55*(.8+.2*n.y));   // 白い面（低い日は泡の凸凹のかげで弱い。傾いた面は空の光が少し少ない）
    col=mix(col,foamC,fmk*.95);}
  else if(w1<1.&&foamW>0.&&dist*pixF/max(abs(V.y),.05)>1.){vec3 fA=amb*.4+.15*(skyL(vec3(.94,.34,0),5.)+skyL(vec3(-.94,.34,0),5.)+skyL(vec3(0,.34,.94),5.)+skyL(vec3(0,.34,-.94),5.));
    fA=mix(fA,vec3(dot(fA,vec3(.2126,.7152,.0722))),.85);col=mix(col,vec3(.82,.87,.92)*(sunC*sunI*max(L.y,0.)*.318*.5+fA*1.55),foamW*(1.-w1)*smoothstep(1.,6.,dist*pixF/max(abs(V.y),.05)));}   // 地図より遠く: 1 画素（奥行きの伸びこみ）が白波（数 m）より大きい所から、泡の面積の割合（1 km の地図で数えた値）だけ泡の色をまぜる
  if(dbg>1.5){o=vec4(Jt*.5,fwl.b*.5,fwl.r,1);return;}
  if(dbg>.5){o=vec4(vec3(fmk),1);return;}   // 調べ用（window.__wgDbg = 1）: 泡の白さだけ
  vec3 hz=skyL(normalize(vec3(-V.x,0.,-V.z)),1.);
  // かすみ: fogH > 0 なら空気は高さ fogH ごとに 1/e にうすくなるとして、見下ろす道すじのぶんだけ（高い所から見ると海がよく見える）
  float hc=max(cam.y-vPos.y,1.),fk=fogH>0.&&hc>10.?fogH/hc*(1.-exp(-hc/fogH)):1.;
  float down=clamp(hc/dist,0.,1.);hz=mix(hz,amb*1.2,smoothstep(.05,.4,down)*step(0.,fogH-1.));   // 見下ろすときのかすみは空の青に近い
  col=mix(col,hz,1.-exp(-dist*fk/fogL));
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
  const FS_MESH = HEAD + SKYL + UNDER + CAUST + `
uniform vec3 cam,L,sunCu;uniform float sunI,expo,fogL,wetRain,wetSplash;uniform float wetP[16];in vec3 vP,vN,vC,vM;in float vLy;out vec4 o;
// 濡れ方: 物の高さ −0.3 m から 0.15 m ごとの 16 段の濡れ（js/scene.js で、波がかかると 1、時間で乾く）
float wetAt(float y){float f=clamp((y+.3)/.15-.5,0.,15.);int i0=int(floor(f));int i1=min(i0+1,15);return mix(wetP[i0],wetP[i1],fract(f));}
// vM = (つや, 濡れやすさ, 0)。濡れると色が暗く、つやが強くなる（見た目の目安）
void main(){sunC=sunCu*sunVis(L);vec3 n=normalize(vN);vec3 amb=skyL(vec3(0,1,0),6.);
  float dist=length(cam-vP);vec3 V=(cam-vP)/dist;if(dot(n,V)<0.)n=-n;
  float wet=clamp(max(max(wetRain,wetSplash*(1.-smoothstep(.15,1.4,vLy))),wetAt(vLy)),0.,1.)*vM.y;
  vec3 alb=vC*(1.-.45*wet);float gl=mix(vM.x,.9,wet);
  float Dw=max(-vP.y,0.),cst=Dw>0.?caust(vP.xz,Dw):1.;vec3 att=exp(-KD*Dw);   // 水の下の所: 光は深さで弱まり、コースティクスでゆらめく
  vec3 col=alb*(sunC*sunI*max(dot(n,L),0.)*.06*att*cst+amb*(.55+.45*n.y)*att);
  vec3 h=normalize(L+V);float nv=max(dot(n,V),0.),F=.04+.96*pow(1.-nv,5.);
  col+=sunC*sunI*pow(max(dot(n,h),0.),mix(10.,500.,gl))*gl*(.02+.25*F)*step(0.,dot(n,L));
  col+=skyL(reflect(-V,n),(1.-gl)*6.)*F*gl*.45;
  if(under>0.&&vP.y<cam.y+1.){vec3 Tr=exp(-KC*dist);col=col*Tr+ubg(-V,amb,L,sunC,sunI)*(1.-Tr)+shafts(cam,-V,min(dist,40.),sunC,sunI);}   // 水の中から見る物は水のかすみ
  else col=mix(col,skyL(normalize(vec3(-V.x,0.,-V.z)),1.),1.-exp(-dist/fogL));
  o=vec4(tone(col*expo),1);}`;
  // 地球儀（段階D）: 画面の点ごとに光線を地球（中心 (0,−Re,0)）に当てる。M = 世界の向き → 地球の座標
  const FS_GLOBE = HEAD + `
uniform vec3 cf,cr,cu,cam,L;uniform float tx,ty,Re,alpha;uniform mat3 M;uniform sampler2D elevT;in vec2 vUv;out vec4 o;
float h12(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float elevAt(vec3 e){float lat=degrees(asin(clamp(e.z,-1.,1.))),lon=degrees(atan(e.y,e.x));
  float y=clamp(lat+90.,0.,179.999),x=mod(lon+180.,360.);ivec2 i=ivec2(floor(x),floor(y));vec2 f=vec2(x,y)-vec2(i);int j1=(i.x+1)%360;
  float a=texelFetch(elevT,ivec2(i.x,i.y),0).r,b=texelFetch(elevT,ivec2(j1,i.y),0).r,c=texelFetch(elevT,ivec2(i.x,i.y+1),0).r,d=texelFetch(elevT,ivec2(j1,i.y+1),0).r;
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
void main(){
  vec3 d=normalize(cf+(vUv.x*2.-1.)*tx*cr+(vUv.y*2.-1.)*ty*cu);
  vec3 oc=cam+vec3(0,Re,0);float b=dot(oc,d),c=cam.x*cam.x+cam.z*cam.z+cam.y*(cam.y+2.*Re),D=b*b-c;   // 引き算で桁が落ちないように
  vec3 col=vec3(0);
  vec2 sp=vec2(atan(d.z,d.x),asin(clamp(d.y,-1.,1.)))*160.;float hs=h12(floor(sp));col+=vec3(step(.996,hs)*(hs-.996)*200.)*.6;   // 星（見た目）
  if(D>0.&&-b-sqrt(D)>0.){
    float t=-b-sqrt(D);vec3 n=normalize(oc+d*t),e=M*n;float hg=elevAt(e),lat=asin(clamp(e.z,-1.,1.));
    vec3 base=hg<0.?mix(vec3(.015,.07,.2),vec3(.03,.17,.33),clamp(1.+hg/4500.,0.,1.)):mix(vec3(.16,.3,.1),vec3(.42,.36,.24),clamp(hg/2500.,0.,1.));
    float ice=hg<0.?smoothstep(radians(74.),radians(84.),abs(lat)):.6*smoothstep(radians(60.),radians(72.),abs(lat));base=mix(base,vec3(.72,.77,.82),ice);   // 氷・雪（緯度だけの目安）
    float dl=dot(n,L);vec3 lit=base*(max(dl,0.)*1.15+.04);
    if(hg<0.){vec3 hv=normalize(L-d);lit+=vec3(1.,.93,.8)*pow(max(dot(n,hv),0.),180.)*.5*step(0.,dl);}
    float mu=max(dot(n,-d),0.);lit=mix(lit,vec3(.3,.5,.95)*max(dl+.25,0.),pow(1.-mu,3.)*.55);   // ふちは空気で青く
    col=lit;
  } else if(b<0.){float pd=sqrt(max(c+Re*Re-b*b,0.))-Re;col+=vec3(.3,.5,1.)*exp(-max(pd,0.)/70e3)*.6;}   // 地球のふちの空気の光
  o=vec4(pow(clamp(col,0.,1.),vec3(1./2.2)),alpha);
}`;
  const FS_COPY = HEAD + `uniform sampler2D T;in vec2 vUv;out vec4 o;void main(){o=texture(T,vUv);}`;
  return { FS_FOAMTEX, FS_FOAMUPD, FS_COPY, FS_GLOBE, VS_FULL, FS_SPEC, FS_FFT, FS_ASM, FS_SKYTEX, FS_SKY, VS_WATER, FS_WATER, VS_MESH, FS_MESH, FS_PROBE };
})();
