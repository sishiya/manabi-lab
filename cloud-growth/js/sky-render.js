// 雲ができるまで（3次元の試作）— 空の描画。雲の形は計算した雲水だけ（雑音は足さない）
// 光の弱まり β=1.5 LWC/(ρw re)（粒の半径 10µm の仮定）。太陽の光は Wrenninge の多重散乱の近似、空は Rayleigh＋Mie の1回散乱
const RE = 10e-6, RHO_W = 1000, REI = 30e-6, RHO_I = 917;   // 雲の氷は半径 30µm の仮定（目安）

const volWGSL = ice => /* wgsl */`
struct P { nx:i32, ny:i32, nz:i32, _a:i32, dx:f32, dy:f32, dz:f32, dt:f32, H:f32, E:f32, cd:f32, S0:f32, het:f32, F0:f32, kap:f32, _b:f32 };
struct Prof { rc:f32, rf:f32, Tb:f32, qvb:f32, qnb:f32, p:f32, z:f32, s0:f32, qt0:f32, ub:f32, sf:f32, sp:f32, wls:f32 };
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<storage,read> pr:array<Prof>;
@group(0) @binding(2) var<storage,read> Qn:array<f32>;
@group(0) @binding(3) var out:texture_storage_3d<rgba16float,write>;
${ice ? `@group(0) @binding(4) var<storage,read> Qp:array<f32>;
@group(0) @binding(5) var<storage,read> Tm:array<f32>;
@group(0) @binding(6) var<storage,read> Qt:array<f32>;` : ''}
fn cc(i:i32,j:i32,k:i32)->u32 { return u32(((i%p.nx+p.nx)%p.nx)+p.nx*(((j%p.ny+p.ny)%p.ny)+p.ny*k)); }
fn bt(i:i32,j:i32,k0:i32)->f32 {
  let k=clamp(k0,0,p.nz-1); let c=cc(i,j,k);
  ${ice ? `let o=clamp((Tm[c]-253.16)/20.,0.,1.); var v=Qn[c]; if v<0. { v=max(v/max(Qt[c]-v,1e-9)*2.5e-3,-2.5e-4); }   // 未飽和は相対的な湿りで測る（上空は飽和までの差の絶対値がとても小さく、凹凸で雲になってしまう）\n  return 1.5*pr[k].rc*v*(o/(${RHO_W}.*${RE})+(1.-o)/(${RHO_I}.*${REI}));` : `return 1.5*pr[k].rc*max(Qn[c],-2.5e-4)/(${RHO_W}.*${RE});`}
}
${ice ? `// 雨・雪・あられの光の弱まり: 指数分布なら β = ρq Λ / ρ粒（Marshall-Palmer の形。N0 と粒の密度は SAM の定数）
fn sp(m:f32,rs:f32,n0:f32)->f32 { if m<1e-9 { return 0.; } return m*pow(3.14159*rs*n0/m,.25)/rs; }
fn bp(i:i32,j:i32,k:i32)->f32 {
  let c=cc(i,j,k); let q=Qp[c]; if q<1e-7 { return 0.; }
  let T=Tm[c]; let oP=clamp((T-268.16)/15.,0.,1.); let oG=clamp((T-223.16)/60.,0.,1.); let m=pr[k].rc*q;
  return sp(m*oP,1000.,8e6)+sp(m*(1.-oP)*oG,400.,4e6)+sp(m*(1.-oP)*(1.-oG),100.,3e6);
}` : ''}
@compute @workgroup_size(8,8,4) fn main(@builtin(global_invocation_id) g:vec3u) {
  let i=i32(g.x); let j=i32(g.y); let k=i32(g.z);
  if i>=p.nx || j>=p.ny || k>=p.nz { return; }
  textureStore(out,g,vec4f(${ice ? '.4*bt(i,j,k)+.1*(bt(i+1,j,k)+bt(i-1,j,k)+bt(i,j+1,k)+bt(i,j-1,k)+bt(i,j,k+1)+bt(i,j,k-1))' : 'bt(i,j,k)'},length(vec3f((bt(i+1,j,k)-bt(i-1,j,k))/p.dx,(bt(i,j+1,k)-bt(i,j-1,k))/p.dy,(bt(i,j,k+1)-bt(i,j,k-1))/p.dz))*.5,${ice ? 'bp(i,j,k),1.-clamp((Tm[cc(i,j,k)]-253.16)/20.,0.,1.)' : '0.,0.'}));   // r: 負＝飽和に足りない（境目の補間のため。入道雲は格子2つぶんのさざ波が雲の面のしわになるので、となりと少しならす）。g: 勾配の大きさ。b: 雨と雪。a: 雲のうち氷の割合
}`;

// 格子より小さい凹凸のもと（くり返しのある3次元の模様）。r: もこもこ（Worley）、g: すじ（勾配ノイズ）。形は推定で、計算の結果ではない
const noiseWGSL = /* wgsl */`
@group(0) @binding(0) var out:texture_storage_3d<rgba8unorm,write>;
fn hash(v0:vec3u)->vec3f {
  var v=v0*1664525u+1013904223u;
  v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y;
  v^=v>>vec3u(16u);
  v.x+=v.y*v.z; v.y+=v.z*v.x; v.z+=v.x*v.y;
  return vec3f(v)/4294967295.;
}
fn cell(c:vec3i,per:i32)->vec3u { return vec3u(((c%per)+per)%per); }
fn worley(p:vec3f,per:i32)->f32 {
  let ip=vec3i(floor(p)); let f=p-floor(p); var d=2.;
  for (var x=-1; x<=1; x++) { for (var y=-1; y<=1; y++) { for (var z=-1; z<=1; z++) {
    let o=vec3i(x,y,z); d=min(d,length(vec3f(o)+hash(cell(ip+o,per)+vec3u(u32(per)))-f));
  } } }
  return min(d,1.);
}
fn grad(p:vec3f,per:i32)->f32 {
  let ip=vec3i(floor(p)); let f=p-floor(p); let u=f*f*f*(f*(f*6.-15.)+10.); var a:array<f32,8>;
  for (var n=0; n<8; n++) { let o=vec3i(n&1,(n>>1)&1,(n>>2)&1); a[n]=dot(hash(cell(ip+o,per)+vec3u(7u))*2.-1.,f-vec3f(o)); }
  return mix(mix(mix(a[0],a[1],u.x),mix(a[2],a[3],u.x),u.y),mix(mix(a[4],a[5],u.x),mix(a[6],a[7],u.x),u.y),u.z);
}
@compute @workgroup_size(4,4,4) fn main(@builtin(global_invocation_id) g:vec3u) {
  let dim=vec3f(textureDimensions(out));
  if any(vec3f(g)>=dim) { return; }
  let p=(vec3f(g)+.5)/dim;
  let w=(1.-worley(p*8.,8))*.625+(1.-worley(p*16.,16))*.25+(1.-worley(p*32.,32))*.125;
  let n=grad(p*8.,8)+.5*grad(p*16.,16)+.25*grad(p*32.,32);
  textureStore(out,g,vec4f(w,clamp(n*.7+.5,0.,1.),0.,1.));
}`;

const lightWGSL = /* wgsl */`
struct L { sun:vec4f, dom:vec4f, iso:vec4f };   // iso: 1つの嵐だけ描くとき（窓の中心 x,y、印）
@group(0) @binding(0) var<uniform> u:L;
@group(0) @binding(1) var vol:texture_3d<f32>;
@group(0) @binding(2) var sm:sampler;
@group(0) @binding(3) var out:texture_storage_3d<rgba16float,write>;
var<private> off:vec2f;
fn beta(x:vec3f)->f32 {
  if u.iso.z>0. { let w=x.xy+off; if max(abs(w.x),abs(w.y))>.5*u.dom.x { return 0.; } }   // 窓の外（くり返しの像）は影を落とさない
  let v=textureSampleLevel(vol,sm,x/u.dom.xyz,0.); return max(0.,v.r)+v.b;
}
@compute @workgroup_size(4,4,4) fn main(@builtin(global_invocation_id) g:vec3u) {
  let dim=vec3f(textureDimensions(out));
  if any(vec3f(g)>=dim) { return; }
  let x=(vec3f(g)+.5)/dim*u.dom.xyz;
  let cell=u.dom.xyz/dim;
  if u.iso.z>0. { let c0=x.xy-u.iso.xy; off=c0-u.dom.xy*round(c0/u.dom.xy)-x.xy; }
  var od=0.; var ds=cell.z*.75; var q=x;
  for (var n=0; n<40; n++) {   // 太陽が低いと遠くの雲の影も入るので 8km 先まで
    q+=u.sun.xyz*ds*.5; od+=beta(q)*ds; q+=u.sun.xyz*ds*.5;
    if q.z>u.dom.z { break; }
    ds=min(ds*1.12,max(220.,u.dom.w*1.5));
  }
  var up=0.; let dz=(u.dom.z-x.z)/10.;
  for (var n=0; n<10; n++) { up+=beta(x+vec3f(0.,0.,(f32(n)+.5)*dz))*dz; }
  // 空がどれだけ見えているか（真上＋斜め4方向。谷や雲の下が暗くなる）
  var vis=2.*mix(exp(-.11*up),1./(1.+.11*up),.4);
  for (var a=0; a<4; a++) {
    let th=f32(a)*1.5708+.6; let w=vec3f(cos(th)*.7,sin(th)*.7,.7); var o4=0.; var s4=max(60.,u.dom.w*.35); var p4=x;
    for (var n=0; n<7; n++) { p4+=w*s4*.5; o4+=beta(p4)*s4; p4+=w*s4*.5; if p4.z>u.dom.z { break; } s4*=1.35; }
    vis+=mix(exp(-.11*o4),1./(1.+.11*o4),.4);
  }
  vis/=6.;
  var mx=0.;
  for (var a=0; a<8; a++) {
    let o=(vec3f(f32(a&1),f32((a>>1)&1),f32((a>>2)&1))-.5)*cell*1.3;
    let v=textureSampleLevel(vol,sm,(x+o)/u.dom.xyz,0.); mx=max(mx,max(0.,v.r+u.dom.w*v.g)+v.b);   // dom.w: 凹凸で表面が動く幅
  }
  textureStore(out,g,vec4f(od,up,mx,vis));
}`;

const skyWGSL = /* wgsl */`
struct L { sun:vec4f, dom:vec4f };
@group(0) @binding(0) var<uniform> u:L;
@group(0) @binding(1) var out:texture_storage_2d<rgba16float,write>;
const Rg=6360e3; const Ra=6420e3; const bR=vec3f(5.8e-6,13.5e-6,33.1e-6); const bM=vec3f(21e-6); const bO=vec3f(.65e-6,1.881e-6,.085e-6);
fn ozone(h:f32)->f32 { return max(0.,1.-abs(h-25e3)/15e3); }   // オゾン層（高さ 25km を中心の三角形の分布。緑を吸うので夕方の空が濁らない）
fn hit(o:vec3f,d:vec3f,r:f32)->f32 { let b=dot(o,d); let c=dot(o,o)-r*r; let h=b*b-c; if h<0. { return -1.; } return -b+sqrt(h); }
fn sky(d:vec3f)->vec3f {
  let o=vec3f(0.,0.,Rg+2.); let tmax=hit(o,d,Ra); let ds=tmax/16.;
  var sR=vec3f(0.); var sM=vec3f(0.); var oR=0.; var oM=0.; var oO=0.;
  let mu=dot(d,u.sun.xyz); let pR=3./(16.*3.14159)*(1.+mu*mu); let gg=.76; let pM=3./(8.*3.14159)*((1.-gg*gg)*(1.+mu*mu))/((2.+gg*gg)*pow(1.+gg*gg-2.*gg*mu,1.5));
  for (var i=0; i<16; i++) {
    let x=o+d*(f32(i)+.5)*ds; let h=length(x)-Rg; let hR=exp(-h/8000.)*ds; let hM=exp(-h/1200.)*ds;
    oR+=hR; oM+=hM; oO+=ozone(h)*ds;
    let tl=hit(x,u.sun.xyz,Ra); let dl=tl/8.;
    var lR=0.; var lM=0.; var lO=0.; var ok=true;
    for (var j=0; j<8; j++) { let y=x+u.sun.xyz*(f32(j)+.5)*dl; let hl=length(y)-Rg; if hl<0. { ok=false; break; } lR+=exp(-hl/8000.)*dl; lM+=exp(-hl/1200.)*dl; lO+=ozone(hl)*dl; }
    // 視線の側の oR を弱める: 1回散乱では地平線の青が消えて緑になる（多重散乱で戻るぶんの近似）
    if ok { let T=exp(-(bR*(oR*.3+lR)+bM*1.1*(oM+lM)+bO*(oO+lO))); sR+=T*hR; sM+=T*hM; }
  }
  return 20.*(sR*bR*pR+sM*bM*pM);
}
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) g:vec3u) {
  let dim=vec2f(textureDimensions(out));
  if f32(g.x)>=dim.x || f32(g.y)>=dim.y { return; }
  let uv=(vec2f(g.xy)+.5)/dim; let az=(uv.x-.5)*6.28318; let v=uv.y; let el=v*v*1.5707;
  let d=vec3f(cos(el)*cos(az),cos(el)*sin(az),sin(el));
  textureStore(out,g.xy,vec4f(sky(d),1.));
}`;

const drawWGSL = (tri) => /* wgsl */`
struct R { pos:vec4f, right:vec4f, up:vec4f, fwd:vec4f, sun:vec4f, sunCol:vec4f, dom:vec4f, misc:vec4f, wb:vec4f, det:vec4f, det2:vec4f, iso:vec4f };   // det: 模様のずれ x,y、1画素の角度、強さ。det2: もこもこの割合、幅
@group(0) @binding(0) var<uniform> r:R;
@group(0) @binding(1) var vol:texture_3d<f32>;
@group(0) @binding(2) var lt:texture_3d<f32>;
@group(0) @binding(3) var skyT:texture_2d<f32>;
@group(0) @binding(4) var sm:sampler;
@group(0) @binding(5) var smC:sampler;
@group(0) @binding(6) var nz:texture_3d<f32>;
@group(0) @binding(7) var smN:sampler;
var<private> foot:f32;
struct VO { @builtin(position) p:vec4f, @location(0) uv:vec2f };
@vertex fn vs(@builtin(vertex_index) i:u32)->VO {
  let x=f32((i<<1u)&2u); let y=f32(i&2u);
  return VO(vec4f(x*2.-1.,y*2.-1.,0.,1.),vec2f(x*2.-1.,y*2.-1.));
}
fn uvw(x:vec3f)->vec3f { return (x+vec3f(r.iso.xy,0.)-vec3f(0.,0.,r.dom.w))/r.dom.xyz; }
fn outW(x:vec3f)->bool { return r.iso.z>0. && max(abs(x.x),abs(x.y))>.5*r.dom.x; }   // 1つの嵐だけ描くときの窓の外   // dom.w: 計算の範囲の下の高さ
fn skyAt(d:vec3f)->vec3f {
  let az=atan2(d.y,d.x); let el=max(asin(clamp(d.z,0.,1.)),.03);   // 地平線ぎりぎりは1回散乱だと暗くなりすぎるので下を切る
  let c=textureSampleLevel(skyT,smC,vec2f(az/6.28318+.5,sqrt(el/1.5707)),0.).rgb;
  return mix(c,vec3f(dot(c,vec3f(.33)))*1.1,smoothstep(.06,0.,asin(clamp(d.z,0.,1.)))*.5);   // 地平線は白く溶ける
}
fn aces(c:vec3f)->vec3f { return (c*(2.51*c+.03))/(c*(2.43*c+.59)+.14); }
fn hg(c:f32,g:f32)->f32 { let g2=g*g; return (1.-g2)/(12.566*pow(1.+g2-2.*g*c,1.5)); }
fn cubicB(x:vec3f)->f32 {
  // 3次 B スプライン（8回の線形の読み出し）
  let d=vec3f(textureDimensions(vol)); let q=uvw(x)*d-.5; let ip=floor(q); let f=q-ip;
  let f2=f*f; let f3=f2*f;
  let w0=(1.-3.*f+3.*f2-f3)/6.; let w1=(4.-6.*f2+3.*f3)/6.; let w2=(1.+3.*f+3.*f2-3.*f3)/6.; let w3=f3/6.;
  let g0=w0+w1; let g1=w2+w3;
  let h0=(w1/g0-1.+ip+.5)/d; let h1=(w3/g1+1.+ip+.5)/d;
  var s=0.;
  for (var a=0; a<8; a++) {
    let bx=(a&1)!=0; let by=(a&2)!=0; let bz=(a&4)!=0;
    let t=vec3f(select(h0.x,h1.x,bx),select(h0.y,h1.y,by),select(h0.z,h1.z,bz));
    let w=select(g0.x,g1.x,bx)*select(g0.y,g1.y,by)*select(g0.z,g1.z,bz);
    s+=w*textureSampleLevel(vol,sm,t,0.).r;
  }
  return s;
}
// 格子より小さい凹凸（推定）: 3つの大きさの模様を足す。強さは大きさの 0.65 乗（雲のふちのフラクタル次元 1.35 から）、遠くは画素より細かい分を消す
fn noiseAt(x0:vec3f)->f32 {
  var q=x0-vec3f(r.det.x,r.det.y,0.); var s=0.;
  // 段ごとに向きを変える（37 度。同じ粒が並んで見えないように）
  let c=.7986; let n=.6018; let rot=mat3x3f(c,n,0.,-n*.8,c*.8,.6,n*.6,-c*.6,.8);
  for (var i=0; i<3; i++) {
    let L=select(800.,r.iso.w,r.iso.z>0.)*pow(.3665,f32(i)); let w=select(smoothstep(2.,8.,L/(8.+4.*f32(i))/foot),smoothstep(1.,3.,L/32./foot),r.iso.z>0.);
    if w>0. {
      let t=textureSampleLevel(nz,smN,q/L,0.);
      s+=select(r.det2.w,1.,i==0)*pow(.4,f32(i)*.65)*w*(mix(t.g,t.r,r.det2.x)-.5)*2.;
    }
    q=rot*q;
  }
  return s;
}
fn vc(x:vec3f)->f32 {
  var s=${tri ? 'textureSampleLevel(vol,sm,uvw(x),0.).r' : 'cubicB(x)'};
  if r.sun.w>0. { s-=(1.-smoothstep(r.sun.w,r.sun.w+1200.,length(x-r.pos.xyz)))*.25; }   // 手前を省く面の切り口を見せない
  if r.det.w<=0. { return max(0.,s); }
  // 計算の範囲の外は同じ雲のくり返しなので、大きな模様で間引く（推定）
  let rr=max(abs(x.x),abs(x.y));
  if r.iso.z<=0. && rr>r.dom.x*.5 { let m=smoothstep(.4,.6,textureSampleLevel(nz,smN,vec3f(x.xy/17300.,.5),0.).g); s-=(1.-mix(1.,m,smoothstep(.5*r.dom.x,.8*r.dom.x,rr)))*.06; }
  // 雲の底はほぼ平らで、もこもこは上の部分（底から 300m までは弱める）
  let D=r.det2.y*r.det.w*max(textureSampleLevel(vol,sm,uvw(x),0.).g,select(.0003,.0001,r.iso.z>0.))*mix(.45,1.,smoothstep(0.,300.,x.z-r.det2.z))*(1.-.65*textureSampleLevel(vol,sm,uvw(x),0.).a);
  if abs(s)>2.*D { return max(0.,s); }
  return max(0.,s+D*min(noiseAt(x),.5));   // 外へは少しだけ（浮いた粉を作らない）
}
fn vb(x:vec3f)->f32 {
  if r.iso.z<=0. { return vc(x); }
  let e=1.-smoothstep(.5*r.dom.x-4000.,.5*r.dom.x,max(abs(x.x),abs(x.y)));   // 窓のふちは描画の都合で薄くする
  if e<=0. { return 0.; }
  return (vc(x)+textureSampleLevel(vol,sm,uvw(x),0.).b)*e;
}
// 表面のそばの細かい影（太陽へ 280m だけ細かく。その先は光の表）
fn sunOD(q:vec3f,l:vec4f)->f32 {
  let n=6; let L=select(280.,2.*r.det2.y,r.iso.z>0.); let ds=L/f32(n);
  var od=0.;
  if r.iso.z>0. {   // 水の雲は光の弱まりが大きいので、表面の近くほど細かく（等間隔だと面に縞が出る）
    var a=0.; var dd=L*.0203;
    for (var i=0; i<8; i++) { od+=vb(q+r.sun.xyz*(a+.5*dd))*dd; a+=dd; dd*=1.5; }
  } else {
  for (var i=0; i<n; i++) { od+=vb(q+r.sun.xyz*(f32(i)+.5)*ds)*ds; }   // 線形の補間だと格子の層が縞になる
  }
  let far=select(textureSampleLevel(lt,sm,uvw(q+r.sun.xyz*L),0.).r,0.,outW(q+r.sun.xyz*L));
  return od+far;
}
fn ms(c:f32,tau:f32)->f32 {
  var a=1.; var b=1.; var g=1.; var s=0.;
  for (var i=0; i<4; i++) { s+=a*mix(hg(c,.8*g),hg(c,-.3*g),.25)*exp(-tau*b); a*=.55; b*=.42; g*=.6; }
  return s;
}
@fragment fn fs(v:VO)->@location(0) vec4f {
  let d=normalize(r.fwd.xyz+r.right.xyz*v.uv.x*r.misc.x+r.up.xyz*v.uv.y*r.misc.y);
  let o=r.pos.xyz;
  let px=v.p.xy;
  let jit=fract(52.9829189*fract(dot(px,vec2f(.06711056,.00583715))+r.misc.z*.618));
  let sun=r.sun.xyz; let c=dot(d,sun);
  let zen=skyAt(vec3f(0.,0.,1.));
  let hor=.25*(skyAt(normalize(vec3f(1.,0.,.15)))+skyAt(normalize(vec3f(-1.,0.,.15)))+skyAt(normalize(vec3f(0.,1.,.15)))+skyAt(normalize(vec3f(0.,-1.,.15))));   // 太陽の側だけでなく周りの平均
  let amb=zen*1.5+hor*.5;
  // 背景
  var bg:vec3f; var tg=-1.;
  if d.z<-1e-5 { tg=-o.z/d.z; }
  if tg>0. {
    let q=o+d*tg;
    let od=select(textureSampleLevel(lt,sm,uvw(vec3f(q.xy,r.dom.w)),0.).r,0.,outW(q));
    let m0=textureSampleLevel(nz,smN,vec3f(q.xy/9000.,.3),0.).g; let m1=textureSampleLevel(nz,smN,vec3f(q.xy/2300.,.7),0.).g;
    let col=vec3f(r.pos.w,r.right.w,r.up.w)*(.55+.9*m0)*(.75+.5*m1);   // 地面の色むら（目安）
    bg=col*(r.sunCol.rgb*max(sun.z,0.)*mix(.35,1.,exp(-od*.3))*.32+amb*.35);
    let f=exp(-tg/16000.);
    let hz=skyAt(normalize(vec3f(d.x,d.y,.03)));
    bg=mix(mix(hz,vec3f(dot(hz,vec3f(.33))),.3),bg,f);
  } else {
    bg=skyAt(d);
    bg+=r.sunCol.rgb*smoothstep(.99996,.99999,c)*20.;
  }
  // 雲の層
  var col=bg;
  let zlo=r.wb.w; let zhi=r.dom.w+r.dom.z;
  var t0=0.; var t1=select(46000.,90000.,r.iso.z>0.);
  var hitSlab=true;
  if abs(d.z)>1e-5 {
    let a=(zlo-o.z)/d.z; let b=(zhi-o.z)/d.z;
    t0=max(0.,min(a,b)); t1=min(t1,max(a,b));
    if t1<=t0 { hitSlab=false; }
  } else if o.z<zlo || o.z>zhi { hitSlab=false; }
  if tg>0. { t1=min(t1,tg); }
  t0=max(t0,r.sun.w);   // sun.w: この視点で描かない手前の距離
  if hitSlab && t1>t0 {
    var t=t0; var Tr=1.; var L=vec3f(0.); var first=-1.;
    var ds0=14.+t*.004;
    var i=0; var back=0.; var fine=0;
    loop {
      if i>=${320} || t>=t1 || Tr<.012 { break; }
      i++;
      let q=o+d*t; let ds=min(14.+t*.004,max(t1-t,.5)); foot=max(t,1.)*r.det.z;
      let l=textureSampleLevel(lt,sm,uvw(q),0.);
      if l.b<4e-6 || outW(q) {
        if fine>0 { fine--; t+=ds; continue; }
        back=ds*6.; t+=back; continue;
      }
      if back>0. { t-=back; back=0.; fine=6; continue; }   // 飛びすぎて雲の中に入ったら戻る（遠くの雲が縞になる）
      var b=vb(q);
      if b>1e-5 {
        if first<0. {
          // 最初の表面は二分法で探し直す（縞を出さない）
          var a0=max(t0,t-ds); var a1=t;   // 視点が雲の中のときは手前へ行かない
          for (var n=0; n<5; n++) { let m=.5*(a0+a1); if vb(o+d*m)>1e-5 { a1=m; } else { a0=m; } }
          first=a1; t=a1+ds*.5; b=max(vb(o+d*t),1e-5);   // ジッターに左右されない位置から（網目の模様を出さない）
        }
        let qq=o+d*t;
        let stepT=exp(-b*ds);
        var tauS=l.r;
        if Tr>.15 { tauS=mix(l.r,sunOD(qq,l),smoothstep(.15,.4,Tr)); }   // 切りかえの等高線を出さない
        // 太陽の直接＋多重散乱、空の光、雲を透過して下へ届く光（二流近似 1/(1+0.75(1-g)τ)、g=0.85）
        var occ=1.;   // すぐ上の雲で空がさえぎられるぶん（影の中の起伏）
        if Tr>.15 { occ=exp(-.06*(vb(qq+vec3f(0.,0.,30.))+vb(qq+vec3f(0.,0.,60.))+vb(qq+vec3f(0.,0.,120.)))*30.); }
        let S=r.sunCol.rgb*ms(c,tauS)*.46+amb*.85*occ*(.06+.94*l.a)+r.sunCol.rgb*max(r.sun.z,.12)*.15/(1.+.11*l.g);
        L+=Tr*(1.-stepT)*S;
        Tr*=stepT;
      }
      t+=ds;
    }
    if first>=0. {
      let f=exp(-first/r.fwd.w)*(1.-smoothstep(select(30000.,70000.,r.iso.z>0.),select(46000.,90000.,r.iso.z>0.),first));
      let h=skyAt(normalize(vec3f(d.x,d.y,max(d.z,.02))));
      col=bg*Tr+(L*f+(1.-Tr)*h*(1.-f));
    }
  }
  // 見え方（フィルムの曲線）
  col*=r.misc.w*r.wb.rgb;
  // 明るいところで色が黄色へずれないよう、色あいを保つ曲線と半々に
  let m=max(max(col.r,col.g),max(col.b,1e-4));
  col=mix(aces(col),col*aces(vec3f(m)).r/m,.35);
  col=pow(clamp(col,vec3f(0.),vec3f(1.)),vec3f(1./2.2));
  col+=(jit-.5)/255.;
  return vec4f(col,1.);
}`;

function sunTrans(el) {
  const s = Math.max(0.005, Math.sin(el)), Rg = 6360e3, Ra = 6420e3, n = 48, bR = [5.8e-6, 13.5e-6, 33.1e-6], bM = 21e-6, bO = [0.65e-6, 1.881e-6, 0.085e-6];
  const hc = Rg * s, tMax = -hc + Math.sqrt(hc * hc + Ra * Ra - Rg * Rg), dl = tMax / n;
  let oR = 0, oM = 0, oO = 0;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) * dl, h = Math.sqrt(Rg * Rg + t * t + 2 * Rg * t * s) - Rg; oR += Math.exp(-h / 8000) * dl; oM += Math.exp(-h / 1200) * dl; oO += Math.max(0, 1 - Math.abs(h - 25e3) / 15e3) * dl; }
  return bR.map((b, i) => Math.exp(-(b * oR + bM * 1.1 * oM + bO[i] * oO)));
}

export class SkyRender {
  constructor(dev, canvas, sim, opt = {}) {
    this.dev = dev; this.sim = sim; this.canvas = canvas; this.zlo = opt.zlo ?? 350; this.ground = opt.ground || [.11, .10, .07]; this.amp = opt.amp ?? 1; this.fine = opt.fine ?? 1; this.haze = opt.haze || 26000; this.billow = opt.billow ?? .5; this.wind = opt.wind || 0; this.detail = 1; this.iso = !!opt.iso; this.track = opt.track || 0; this.nscale = opt.nscale || 800;
    this.ctx = canvas.getContext('webgpu'); this.fmt = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: dev, format: this.fmt, alphaMode: 'opaque' });
    const T = GPUTextureUsage, f = 'rgba16float';
    const v3 = (w, h, d) => dev.createTexture({ size: [w, h, d], dimension: '3d', format: f, usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
    this.vol = v3(sim.nx, sim.ny, sim.nz);
    this.lt = v3(sim.nx >> 1, sim.ny >> 1, sim.nz >> 1);
    this.skyT = dev.createTexture({ size: [256, 128], format: f, usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
    this.sm = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'clamp-to-edge' });
    this.smC = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'clamp-to-edge' });
    this.lu = dev.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.ru = dev.createBuffer({ size: 192, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const mod = code => dev.createShaderModule({ code });
    const cp = code => dev.createComputePipeline({ layout: 'auto', compute: { module: mod(code), entryPoint: 'main' } });
    const b = (p, list) => dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: list.map((r, i) => ({ binding: i, resource: r })) });
    this.pVol = cp(volWGSL(!!sim.o.ice)); this.bVol = b(this.pVol, [{ buffer: sim.P }, { buffer: sim.prof }, { buffer: sim.f.Qn }, this.vol.createView(), ...(sim.o.ice ? [{ buffer: sim.f.Qp }, { buffer: sim.f.Tm }, { buffer: sim.f.Q }] : [])]);
    this.pLt = cp(lightWGSL); this.bLt = b(this.pLt, [{ buffer: this.lu }, this.vol.createView(), this.sm, this.lt.createView()]);
    this.pSky = cp(skyWGSL); this.bSky = b(this.pSky, [{ buffer: this.lu }, this.skyT.createView()]);
    const nzSize = sim.nx >= 256 ? 128 : 64;
    this.nz = dev.createTexture({ size: [nzSize, nzSize, nzSize], dimension: '3d', format: 'rgba8unorm', usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
    const pNz = cp(noiseWGSL), nzEnc = dev.createCommandEncoder(), nzPass = nzEnc.beginComputePass();
    nzPass.setPipeline(pNz); nzPass.setBindGroup(0, b(pNz, [this.nz.createView()])); nzPass.dispatchWorkgroups(nzSize / 4, nzSize / 4, nzSize / 4); nzPass.end(); dev.queue.submit([nzEnc.finish()]);
    this.smN = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });
    const dm = mod(drawWGSL(location.search.includes('tri')));
    this.pDraw = dev.createRenderPipeline({ layout: 'auto', vertex: { module: dm, entryPoint: 'vs' }, fragment: { module: dm, entryPoint: 'fs', targets: [{ format: this.fmt }] }, primitive: { topology: 'triangle-list' } });
    this.bDraw = b(this.pDraw, [{ buffer: this.ru }, this.vol.createView(), this.lt.createView(), this.skyT.createView(), this.sm, this.smC, this.nz.createView(), this.smN]);
    this.frame = 0; this.sunDirty = true;
  }
  setSun(azDeg, elDeg, wbPow) {
    const a = azDeg * Math.PI / 180, e = elDeg * Math.PI / 180;
    this.sun = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
    const T = sunTrans(e);
    this.sunCol = T.map(x => x * 20);
    // カメラのホワイトバランス（太陽の色を少し打ち消す。目が慣れるのと同じ）
    const mean = (T[0] + T[1] + T[2]) / 3; this.wb = T.map(x => Math.pow(mean / x, wbPow));
    this.sunDirty = true;
  }
  // 1つの嵐だけ描くとき: 画面の原点に来る計算の格子の位置（嵐が流れるぶんを一定の速さで追う）
  center() { const { sim } = this; return this.iso ? [(sim.Lx / 2 + this.track * sim.t) % sim.Lx, sim.Ly / 2] : [0, 0]; }
  // 計算の結果をテクスチャへ
  updateVolume(enc) {
    const { sim } = this, p = enc.beginComputePass();
    p.setPipeline(this.pVol); p.setBindGroup(0, this.bVol);
    p.dispatchWorkgroups(Math.ceil(sim.nx / 8), Math.ceil(sim.ny / 8), Math.ceil(sim.nz / 4)); p.end();
    this.updateLight(enc);
  }
  updateLight(enc) {
    const { sim } = this;
    this.dev.queue.writeBuffer(this.lu, 0, new Float32Array([...this.sun, 0, sim.Lx, sim.Ly, sim.Lz, 3 * sim.dx, ...this.center(), this.iso ? 1 : 0, 0]));
    const p = enc.beginComputePass();
    if (this.sunDirty) { p.setPipeline(this.pSky); p.setBindGroup(0, this.bSky); p.dispatchWorkgroups(32, 16); this.sunDirty = false; }
    p.setPipeline(this.pLt); p.setBindGroup(0, this.bLt);
    const [x, y, z] = [sim.nx >> 1, sim.ny >> 1, sim.nz >> 1].map(n => Math.ceil(n / 4));
    p.dispatchWorkgroups(x, y, z); p.end();
  }
  draw(enc, cam, exposure) {
    const { canvas, sim } = this, asp = canvas.width / canvas.height, tf = Math.tan(cam.fov * Math.PI / 360);
    const cp = Math.cos(cam.pitch), f = [cp * Math.cos(cam.yaw), cp * Math.sin(cam.yaw), Math.sin(cam.pitch)];
    const rl = Math.hypot(f[1], f[0]) || 1, rg = [f[1] / rl, -f[0] / rl, 0];
    const up = [rg[1] * f[2] - rg[2] * f[1], rg[2] * f[0] - rg[0] * f[2], rg[0] * f[1] - rg[1] * f[0]];
    this.frame++;
    const narrow = asp < 1;
    const data = new Float32Array([
      ...cam.pos, this.ground[0], ...rg, this.ground[1], ...up, this.ground[2], ...f, this.haze, ...this.sun, cam.clip || 0, ...this.sunCol, 0,
      sim.Lx, sim.Ly, sim.Lz, sim.o.base.z0, narrow ? tf : tf * asp, narrow ? tf / asp : tf, this.frame % 64, exposure,
      ...this.wb, this.zlo,
      (this.wind * sim.t) % 800, 0, 2 * tf / canvas.height, this.detail * this.amp,
      this.billow, 3 * sim.dx, sim.base ?? sim.o.base.z0, this.fine,
      ...this.center(), this.iso ? 1 : 0, this.nscale,
    ]);
    this.dev.queue.writeBuffer(this.ru, 0, data);
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    pass.setPipeline(this.pDraw); pass.setBindGroup(0, this.bDraw); pass.draw(3); pass.end();
  }
}
