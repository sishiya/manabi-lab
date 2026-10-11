'use strict';
// ================= WebGL =================
const cv=document.getElementById('gl'), ov=document.getElementById('ov'), octx=ov.getContext('2d');
const gl=cv.getContext('webgl2',{antialias:false,alpha:false,depth:false,stencil:false});
function fail(msg){const e=document.getElementById('glerr');e.hidden=false;e.textContent=msg;}
if(!gl){fail(L('このブラウザはWebGL2に対応していないため、シミュレーションを動かせません。','This browser does not support WebGL2, so the simulation cannot run.'));throw new Error("wifi-wave: WebGL2 の準備ができないので止める（画面にはメッセージ）");}
if(!gl.getExtension('EXT_color_buffer_float')){fail(L('このブラウザ（GPU）は浮動小数点の描画に対応していないため、シミュレーションを動かせません。','This browser (GPU) cannot render floating-point textures, so the simulation cannot run.'));throw new Error("wifi-wave: WebGL2 の準備ができないので止める（画面にはメッセージ）");}

const VS=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`;

const SIM_FS=`#version 300 es
precision highp float; precision highp int;
uniform sampler2D uS; uniform sampler2D uM;
uniform float uK2[8]; uniform float uA[8];
uniform ivec2 uSize; uniform ivec2 uSrc; uniform int uLine; uniform float uSrcVal; uniform float uBeta; uniform int uStrip;
out vec4 o;
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy); ivec2 mx=uSize-1;
  vec4 c=texelFetch(uS,p,0);
  int id=clamp(int(texelFetch(uM,p,0).r*255.+.5),0,7);
  float k2=uK2[id]; float e=c.b;
  if(k2<0.){ o=vec4(0.,0.,e*(1.-uBeta),0.); return; }
  float u=c.r, up=c.g;
  float l=texelFetch(uS,min(p+ivec2(1,0),mx),0).r+texelFetch(uS,max(p-ivec2(1,0),ivec2(0)),0).r
         +texelFetch(uS,min(p+ivec2(0,1),mx),0).r+texelFetch(uS,max(p-ivec2(0,1),ivec2(0)),0).r-4.*u;
  float d=float(uStrip==1 ? min(p.x,mx.x-p.x) : min(min(p.x,mx.x-p.x),min(p.y,mx.y-p.y)));
  float a=uA[id];
  if(d<40.){ float q=(40.-d)/40.; a+=.3*q*q*q; }
  float un=(2.*u-(1.-a)*up+k2*l)/(1.+a);
  if((uLine==1 && p.x==uSrc.x) || (uLine==0 && p==uSrc)) un+=uSrcVal;
  e+=uBeta*(un*un-e);
  o=vec4(un,u,e,0.);
}`;

const DISP_FS=`#version 300 es
precision highp float; precision highp int;
uniform sampler2D uS; uniform sampler2D uM;
uniform vec2 uView; uniform int uMode; uniform vec2 uSrc; uniform int uLine;
uniform float uC; uniform float uRef; uniform float uFS; uniform float uSmooth; uniform float uComp;
uniform vec3 uMatCol[8]; uniform float uMatA[8];
out vec4 o;
const float W=1280., H=800., DX=0.0075;
vec3 heat(float d){
  float xs[8]=float[](-95.,-85.,-75.,-67.,-55.,-45.,-35.,-25.);
  vec3 cs[8]=vec3[](vec3(.03,.04,.09),vec3(.12,.16,.42),vec3(.22,.36,.78),vec3(.16,.68,.62),vec3(.58,.87,.37),vec3(1.,.84,.30),vec3(1.,.55,.25),vec3(1.,.95,.88));
  if(d<=xs[0]) return cs[0];
  for(int i=0;i<7;i++){ if(d<xs[i+1]) return mix(cs[i],cs[i+1],(d-xs[i])/(xs[i+1]-xs[i])); }
  return cs[7];
}
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
float eAt(vec2 c){ ivec2 q=clamp(ivec2(c),ivec2(0),ivec2(1279,799)); return texelFetch(uS,q,0).b; }
float lg(float x){ return log(x)*0.4342944819; }
void main(){
  vec2 uv=gl_FragCoord.xy/uView;
  vec2 c=vec2(uv.x*W,(1.-uv.y)*H);
  ivec2 p=clamp(ivec2(c),ivec2(0),ivec2(1279,799));
  vec4 s=texelFetch(uS,p,0);
  int id=clamp(int(texelFetch(uM,p,0).r*255.+.5),0,7);
  float r=max(length(c-uSrc),4.);
  vec3 bg=vec3(.035,.058,.105);
  vec3 col;
  if(uMode==0){
    float A = uLine==1 ? sqrt(2.*uRef) : sqrt(2.*uC/(uComp>.5 ? r : 160.));
    float t=tanh(s.r/A*.8);
    col = t>0. ? mix(bg,vec3(1.,.70,.28),t) : mix(bg,vec3(.30,.79,.94),-t);
    col += vec3(1.,.96,.88)*smoothstep(.82,1.,abs(t))*.28;
  } else {
    float e=s.b;
    if(uSmooth>0.){
      float sum=e, n=1.;
      for(int i=0;i<16;i++){
        float fi=float(i)+.5; float ang=fi*2.39996; float rr=uSmooth*sqrt(fi/16.);
        sum+=eAt(c+vec2(cos(ang),sin(ang))*rr); n+=1.;
      }
      e=sum/n;
    }
    float db;
    if(uLine==1) db=-40.+10.*lg(max(e,1e-30)/uRef);
    else { float dm=r*DX; db=20.-(20.*lg(dm)+uFS)+10.*lg(max(e,1e-30)*r/uC); }
    col=heat(db);
    float fw=max(fwidth(db),1e-3);
    float ln=0.;
    ln=max(ln,1.-abs(db+55.)/fw/1.2); ln=max(ln,1.-abs(db+67.)/fw/1.2);
    ln=max(ln,1.-abs(db+75.)/fw/1.2); ln=max(ln,1.-abs(db+85.)/fw/1.2);
    col=mix(col,vec3(0.),clamp(ln,0.,1.)*.45);
  }
  // 1 m grid
  float cpp=W/uView.x;
  vec2 g=abs(fract(c/133.3333+.5)-.5)*133.3333;
  if(min(g.x,g.y)<cpp*.7) col=mix(col,vec3(.65,.75,.95),.10);
  if(id>0){
    vec3 mc=uMatCol[id];
    if(id==5) mc*=.86+.28*hash(floor(c));
    if(id==4) mc*= (fract(c.y/8.)<.12 || fract((c.x+ (mod(floor(c.y/8.),2.)*10.))/20.)<.06) ? .7 : 1.;
    col=mix(col,mc,uMatA[id]);
  }
  o=vec4(col,1.);
}`;

function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function program(fs){const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,VS));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const nm=gl.getActiveUniform(p,i).name.replace(/\[0\]$/,'');u[nm]=gl.getUniformLocation(p,nm);}return {p,u};}
let simP, dispP;
try{ simP=program(SIM_FS); dispP=program(DISP_FS); }catch(err){ fail(L('シェーダの準備に失敗しました: ','Failed to set up the shaders: ')+err.message); window.__wwErr=err; throw new Error("wifi-wave: WebGL2 の準備ができないので止める（画面にはメッセージ）");}
const vao=gl.createVertexArray();

function mkTex(w,h){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,w,h,0,gl.RGBA,gl.FLOAT,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
function mkFb(t){const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);return f;}

class Sim{
  constructor(w,h){
    this.w=w;this.h=h;this.tex=[mkTex(w,h),mkTex(w,h)];this.fb=this.tex.map(mkFb);this.cur=0;
    this.ids=new Uint8Array(w*h);
    this.mt=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.mt);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,w,h,0,gl.RED,gl.UNSIGNED_BYTE,this.ids);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    this.n=0;
  }
  upload(){gl.bindTexture(gl.TEXTURE_2D,this.mt);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,this.w,this.h,gl.RED,gl.UNSIGNED_BYTE,this.ids);}
  clear(){for(const f of this.fb){gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}this.n=0;}
  begin(src,line,lut,strip){
    gl.useProgram(simP.p);gl.bindVertexArray(vao);gl.viewport(0,0,this.w,this.h);
    gl.uniform1i(simP.u.uStrip,strip?1:0);
    gl.uniform2i(simP.u.uSize,this.w,this.h);gl.uniform2i(simP.u.uSrc,src[0],src[1]);gl.uniform1i(simP.u.uLine,line?1:0);
    gl.uniform1f(simP.u.uBeta,BETA);gl.uniform1fv(simP.u.uK2,lut.k2);gl.uniform1fv(simP.u.uA,lut.a);
    gl.uniform1i(simP.u.uS,0);gl.uniform1i(simP.u.uM,1);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.mt);
  }
  step(val){
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.fb[1-this.cur]);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.tex[this.cur]);
    gl.uniform1f(simP.u.uSrcVal,val);
    gl.drawArrays(gl.TRIANGLES,0,3);
    this.cur=1-this.cur;this.n++;
  }
  read(x,y,w,h,buf){
    x=Math.max(0,Math.min(this.w-w,x|0));y=Math.max(0,Math.min(this.h-h,y|0));
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.fb[this.cur]);
    gl.readPixels(x,y,w,h,gl.RGBA,gl.FLOAT,buf);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
    return buf;
  }
}

function makeLut(f){
  const k2=new Float32Array(8), a=new Float32Array(8);
  MATS.forEach((m,i)=>{
    if(i===0){k2[i]=KC*KC;a[i]=0;return;}
    if(m.pec){k2[i]=-1;a[i]=0;return;}
    const {er,sig}=simProps(m,f);k2[i]=KC*KC/er;a[i]=sig*DT/(2*EPS0*er);
  });
  return {k2,a};
}
const lambdaCells=f=>C0/(f*1e9)/DX;
const omegaStep=f=>2*Math.PI*KC/lambdaCells(f);

// ---------- calibration: free-space level for the dBm conversion ----------
const CAL={};
(function calibrate(){
  const N=320, cal=new Sim(N,N), buf=new Float32Array(N*N*4);
  for(const k of Object.keys(FREQ)){
    const f=FREQ[k].ghz, lut=makeLut(f), om=omegaStep(f), T=2*Math.PI/om;
    // point source
    cal.clear();cal.begin([N/2,N/2],false,lut);
    for(let i=0;i<1300;i++) cal.step(Math.sin(om*i)*Math.min(1,i/(2*T)));
    cal.read(0,0,N,N,buf);
    const v=[];
    for(let y=0;y<N;y++)for(let x=0;x<N;x++){const r=Math.hypot(x-N/2,y-N/2);if(r>=50&&r<=95)v.push(buf[(y*N+x)*4+2]*r);}
    v.sort((a,b)=>a-b);
    // line source
    cal.clear();cal.begin([60,0],true,lut);
    for(let i=0;i<1300;i++) cal.step(Math.sin(om*i)*Math.min(1,i/(2*T)));
    cal.read(0,0,N,N,buf);
    let s=0,c=0;for(let y=140;y<180;y++)for(let x=170;x<230;x++){s+=buf[(y*N+x)*4+2];c++;}
    CAL[k]={C:v[v.length>>1], L:s/c};
  }
})();

window.__wwGL=true;   // ここまで来たら WebGL2 の準備ができた（後のファイルはこれを見て動く）
