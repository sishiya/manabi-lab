// 雲ができるまで（3次元の試作）— 計算シェーダー。手順は solver.js と同じ（強制 → 運ぶ → 雲と浮力 → 圧力）
// 雨と氷は省く。温度の変数は s = T + g z/cp − Lv qn/cp − S0（定数 S0 を引いて f32 の桁を守る）
const COMMON = /* wgsl */`
struct P { nx:i32, ny:i32, nz:i32, _a:i32, dx:f32, dy:f32, dz:f32, dt:f32, H:f32, E:f32, cd:f32, S0:f32, het:f32, F0:f32, kap:f32, wtau:f32 };
struct Prof { rc:f32, rf:f32, Tb:f32, qvb:f32, qnb:f32, p:f32, z:f32, s0:f32, qt0:f32, ub:f32, sf:f32, sp:f32, wls:f32 };
fn cid(i:i32, j:i32, k:i32, n:vec2i) -> u32 { return u32((i & (n.x-1)) + n.x*((j & (n.y-1)) + n.y*k)); }
`;

// 運ぶ: 1方向ぶんの TVD（van Leer）。STAG: 0 セル中心／1 u の箱／2 v の箱／3 w の箱
// 擬似密度 d は（Easter の方法）固定した流れから式で出す（done はすでに終えた方向）
export function sweepWGSL(STAG) {
  const shift = ['Fb(ax,i,j,k)', '0.5*(Fb(ax,i-1,j,k)+Fb(ax,i,j,k))', '0.5*(Fb(ax,i,j-1,k)+Fb(ax,i,j,k))', '0.5*(Fb(ax,i,j,k-1)+Fb(ax,i,j,k))'][STAG];
  const NR = STAG === 3 ? 'p.nz+1' : 'p.nz';
  return COMMON + /* wgsl */`
struct A { axis:i32, done:i32, _b:i32, _c:i32 };
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<uniform> a:A;
@group(0) @binding(2) var<storage,read> pr:array<Prof>;
@group(0) @binding(3) var<storage,read> U:array<f32>;
@group(0) @binding(4) var<storage,read> V:array<f32>;
@group(0) @binding(5) var<storage,read> W:array<f32>;
@group(0) @binding(6) var<storage,read> src:array<f32>;
@group(0) @binding(7) var<storage,read_write> dst:array<f32>;
fn id(i:i32,j:i32,k:i32)->u32 { return cid(i,j,k,vec2i(p.nx,p.ny)); }
fn Fb(ax:i32,i:i32,j:i32,k:i32)->f32 {
  if ax==2 { if k<=0 || k>=p.nz { return 0.; } return pr[k].rf*W[id(i,j,k)]; }
  let c=clamp(k,0,p.nz-1);
  if ax==0 { return pr[c].rc*U[id(i,j,c)]; }
  return pr[c].rc*V[id(i,j,c)];
}
fn F(ax:i32,i:i32,j:i32,k:i32)->f32 { return ${shift}; }
fn rho0(k:i32)->f32 {
  ${STAG === 3 ? 'if k<=0 { return pr[0].rc; } if k>=p.nz { return pr[p.nz-1].rc; } return 0.5*(pr[k-1].rc+pr[k].rc);' : 'return pr[k].rc;'}
}
fn spacing(ax:i32)->f32 { if ax==0 { return p.dx; } if ax==1 { return p.dy; } return p.dz; }
fn lim(n:f32,dd:f32)->f32 {
  if n*dd<=0. { return 0.; }
  if abs(n)>1e6*abs(dd) { return 2.; }
  let r=n/dd; return 2.*r/(1.+r);
}
fn dAt(i:i32,j:i32,k:i32)->f32 {
  var d=rho0(k);
  if (a.done&1)!=0 { d-=p.dt/p.dx*(F(0,i+1,j,k)-F(0,i,j,k)); }
  if (a.done&2)!=0 { d-=p.dt/p.dy*(F(1,i,j+1,k)-F(1,i,j,k)); }
  if (a.done&4)!=0 { d-=p.dt/p.dz*(F(2,i,j,k+1)-F(2,i,j,k)); }
  return d;
}
fn flux(i:i32,j:i32,k:i32,e:vec3i,r:f32)->f32 {
  let nr=${NR};
  if a.axis==2 && (k<=0 || k>=nr) { return 0.; }
  let f=F(a.axis,i,j,k);
  let m=vec3i(i,j,k)-e;
  var A0:f32; var B0:f32; var far:vec3i;
  let here=src[id(i,j,k)]; let low=src[id(m.x,m.y,m.z)];
  if f>=0. { A0=low; B0=here; far=m-e; } else { A0=here; B0=low; far=vec3i(i,j,k)+e; }
  var c0=A0;
  if a.axis!=2 || (far.z>=0 && far.z<nr) { c0=src[id(far.x,far.y,far.z)]; }
  let dd=B0-A0;
  let cr=abs(f)/rho0(clamp(k,0,nr-1))*r;
  return f*(A0+0.5*(1.-cr)*lim(A0-c0,dd)*dd);
}
@compute @workgroup_size(8,8,4) fn main(@builtin(global_invocation_id) g:vec3u) {
  let i=i32(g.x); let j=i32(g.y); let k=i32(g.z);
  let nr=${NR};
  if i>=p.nx || j>=p.ny || k>=nr { return; }
  let c=id(i,j,k);
  ${STAG === 3 ? 'if k==0 || k==p.nz { dst[c]=0.; return; }' : ''}
  let ax=a.axis;
  var e=vec3i(0,0,0); if ax==0 { e.x=1; } else if ax==1 { e.y=1; } else { e.z=1; }
  let r=p.dt/spacing(ax);
  let dOld=dAt(i,j,k);
  let dNew=dOld-r*(F(ax,i+e.x,j+e.y,k+e.z)-F(ax,i,j,k));
  dst[c]=(dOld*src[c]-r*(flux(i+e.x,j+e.y,k+e.z,e,r)-flux(i,j,k,e,r)))/dNew;
}`;
}

// 1セルで済む手順（強制・雲と浮力・w の更新・圧力の右辺・圧力の補正）
export const cellsWGSL = COMMON + /* wgsl */`
const g=9.81; const cp=1004.; const Lv=2.5e6; const EPS=0.62188;
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<storage,read> pr:array<Prof>;
@group(0) @binding(2) var<storage,read_write> U:array<f32>;
@group(0) @binding(3) var<storage,read_write> V:array<f32>;
@group(0) @binding(4) var<storage,read_write> W:array<f32>;
@group(0) @binding(5) var<storage,read_write> S:array<f32>;
@group(0) @binding(6) var<storage,read_write> Q:array<f32>;
@group(0) @binding(7) var<storage,read> Het:array<f32>;
@group(0) @binding(8) var<storage,read_write> Qn:array<f32>;
@group(0) @binding(9) var<storage,read_write> B:array<f32>;
@group(0) @binding(10) var<storage,read_write> C:array<vec2f>;
@group(0) @binding(11) var<storage,read_write> Um:array<f32>;
fn id(i:i32,j:i32,k:i32)->u32 { return cid(i,j,k,vec2i(p.nx,p.ny)); }

@compute @workgroup_size(8,8,4) fn force(@builtin(global_invocation_id) gi:vec3u) {
  let i=i32(gi.x); let j=i32(gi.y); let k=i32(gi.z);
  if i>=p.nx || j>=p.ny || k>=p.nz { return; }
  let c=id(i,j,k); let f=pr[k];
  var s=S[c]; var q=max(Q[c],0.); var u=U[c]; var v=V[c]; var w=W[c];
  if f.sf>0. {
    let fac=(1.+p.het*Het[u32(i+p.nx*j)])*f.sf*p.dt;
    s+=p.H*fac; q+=p.E*fac;
  }
  if p.wtau>0. { u+=(f.ub-Um[k])*min(1.,p.dt/p.wtau); }   // 平均の風を目標へ
  if k==0 && p.cd>0. { let sp=sqrt(u*u+v*v); let dr=1./(1.+p.dt*p.cd*sp/p.dz); u*=dr; v*=dr; }
  if f.sp>0. {
    let r=min(1.,p.dt*f.sp);
    w-=r*w; u+=r*(f.ub-u); v-=r*v; s+=r*(f.s0-s); q+=r*(f.qt0-q);
  }
  S[c]=s; Q[c]=q; U[c]=u; V[c]=v; W[c]=w;
}

// 高さごとの平均の風（一段ずつ別のスレッドで足す）
@compute @workgroup_size(1) fn umean(@builtin(global_invocation_id) gi:vec3u) {
  let k=i32(gi.x);
  if k>=p.nz { return; }
  var m=0.;
  for (var j=0; j<p.ny; j++) { var r=0.; for (var i=0; i<p.nx; i++) { r+=U[id(i,j,k)]; } m+=r/f32(p.nx); }
  Um[k]=m/f32(p.ny);
}

// 列ごとの強制: 雲の上面の放射冷却（雲の水の量で指数的に弱まる簡単な式。推定）と、大きな場の上下の動き（上流差分）。式は solver.js の forcing と同じ
@compute @workgroup_size(32) fn column(@builtin(global_invocation_id) gi:vec3u) {
  let l=i32(gi.x);
  if l>=p.nx*p.ny { return; }
  let i=l%p.nx; let j=l/p.nx;
  if p.F0>0. {
    var lwp=0.; var ft=p.F0;
    for (var k=p.nz-1; k>=0; k--) {
      let c=id(i,j,k);
      lwp+=pr[k].rc*max(Qn[c],0.)*p.dz;
      let fb=p.F0*exp(-p.kap*lwp);
      S[c]-=p.dt*(ft-fb)/(pr[k].rc*p.dz*cp);
      ft=fb;
    }
  }
  for (var k=1; k<p.nz; k++) {
    let ww=pr[k].wls;
    if ww==0. { continue; }
    let c=id(i,j,k); var kk=c;
    if ww>0. { kk=id(i,j,k-1); } else if k+1<p.nz { kk=id(i,j,k+1); }
    let r=p.dt*ww/select(-p.dz,p.dz,ww>0.);
    S[c]-=r*(S[c]-S[kk]);
    Q[c]=max(Q[c]-r*(Q[c]-Q[kk]),0.);
  }
}

fn es(T:f32)->f32 { return 611.2*exp(17.67*(T-273.15)/(T-29.65)); }
fn qsat(T:f32,pp:f32)->f32 { let e=min(es(T),0.5*pp); return EPS*e/(pp-e); }
@compute @workgroup_size(8,8,4) fn diag(@builtin(global_invocation_id) gi:vec3u) {
  let i=i32(gi.x); let j=i32(gi.y); let k=i32(gi.z);
  if i>=p.nx || j>=p.ny || k>=p.nz { return; }
  let c=id(i,j,k); let f=pr[k];
  let Tl=S[c]+p.S0-g*f.z/cp;
  let q=Q[c];
  let qs0=qsat(Tl,f.p);
  var T=Tl; var qn=0.; var ex=q-qs0;   // ex: 飽和からの過不足（描画で境目を出す。未飽和は負）
  if q>qs0 {
    T=Tl+0.5*Lv/cp*(q-qs0);
    for (var n=0; n<5; n++) {
      let e=min(es(T),0.5*f.p); let qs=EPS*e/(f.p-e);
      let dq=qs*17.67*243.5/((T-29.65)*(T-29.65))*f.p/(f.p-e);
      let fn0=T-Lv/cp*(q-qs)-Tl; let d=1.+Lv/cp*dq;
      T-=fn0/d;
    }
    qn=max(0.,q-qsat(T,f.p)); ex=qn;
  }
  Qn[c]=ex;
  B[c]=g*((T-f.Tb)/f.Tb+0.608*(q-qn-f.qvb)-(qn-f.qnb));
}
@compute @workgroup_size(8,8,4) fn buoy(@builtin(global_invocation_id) gi:vec3u) {
  let i=i32(gi.x); let j=i32(gi.y); let k=i32(gi.z);
  if i>=p.nx || j>=p.ny || k>=p.nz || k==0 { return; }
  let c=id(i,j,k);
  W[c]+=p.dt*0.5*(B[id(i,j,k-1)]+B[c]);
}
@compute @workgroup_size(8,8,4) fn rhs(@builtin(global_invocation_id) gi:vec3u) {
  let i=i32(gi.x); let j=i32(gi.y); let k=i32(gi.z);
  if i>=p.nx || j>=p.ny || k>=p.nz { return; }
  let c=id(i,j,k); let rc=pr[k].rc;
  let wt=select(pr[k+1].rf*W[id(i,j,k+1)],0.,k+1>=p.nz);
  let wb=select(pr[k].rf*W[c],0.,k==0);
  C[c]=vec2f((rc*((U[id(i+1,j,k)]-U[c])/p.dx+(V[id(i,j+1,k)]-V[c])/p.dy)+(wt-wb)/p.dz)/p.dt,0.);
}
@compute @workgroup_size(8,8,4) fn correct(@builtin(global_invocation_id) gi:vec3u) {
  let i=i32(gi.x); let j=i32(gi.y); let k=i32(gi.z);
  if i>=p.nx || j>=p.ny || k>=p.nz { return; }
  let c=id(i,j,k); let sc=1./f32(p.nx*p.ny); let pc=C[c].x*sc;
  U[c]-=p.dt*(pc-C[id(i-1,j,k)].x*sc)/p.dx;
  V[c]-=p.dt*(pc-C[id(i,j-1,k)].x*sc)/p.dy;
  if k>0 { W[c]-=p.dt*(pc-C[id(i,j,k-1)].x*sc)/p.dz; }
}
`;

// 圧力: 1本の線ごとの FFT（AX=0 横 x、1 横 y。SG=-1 順／+1 逆）
export const fftWGSL = MAXN => COMMON + /* wgsl */`
override AX:i32=0; override SG:f32=-1.;
const MAXN:i32=${MAXN};
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<storage,read> tw:array<vec2f>;
@group(0) @binding(2) var<storage,read_write> C:array<vec2f>;
@compute @workgroup_size(16) fn main(@builtin(global_invocation_id) gi:vec3u) {
  let l=i32(gi.x);
  let n=select(p.ny,p.nx,AX==0); let m=select(p.nx,p.ny,AX==0);
  if l>=m*p.nz { return; }
  let q=l%m; let k=l/m;
  let bits=countTrailingZeros(u32(n));
  var a:array<vec2f,${MAXN}>;
  for (var t=0; t<n; t++) {
    let rv=i32(reverseBits(u32(t))>>(32u-bits));
    let c=select(cid(q,rv,k,vec2i(p.nx,p.ny)),cid(rv,q,k,vec2i(p.nx,p.ny)),AX==0);
    a[t]=C[c];
  }
  var len=2;
  loop {
    if len>n { break; }
    let half=len/2; let step=MAXN/len;
    var s0=0;
    loop {
      if s0>=n { break; }
      for (var t=0; t<half; t++) {
        let w=tw[t*step];
        let c=w.x; let s=SG*w.y; let A=s0+t; let Bb=A+half;
        let x=vec2f(a[Bb].x*c-a[Bb].y*s, a[Bb].x*s+a[Bb].y*c);
        a[Bb]=a[A]-x; a[A]=a[A]+x;
      }
      s0+=len;
    }
    len*=2;
  }
  for (var t=0; t<n; t++) {
    let c=select(cid(q,t,k,vec2i(p.nx,p.ny)),cid(t,q,k,vec2i(p.nx,p.ny)),AX==0);
    C[c]=a[t];
  }
}`;

// 圧力: 波数ごとに縦の三重対角
export const tridiagWGSL = (MAXN, NZ) => COMMON + /* wgsl */`
const MAXN:i32=${MAXN};
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<storage,read> pr:array<Prof>;
@group(0) @binding(2) var<storage,read> tw:array<vec2f>;
@group(0) @binding(3) var<storage,read_write> C:array<vec2f>;
fn aL(k:i32)->f32 { if k==0 || k==p.nz { return 0.; } return pr[k].rf/(p.dz*p.dz); }
@compute @workgroup_size(32) fn main(@builtin(global_invocation_id) gi:vec3u) {
  let l=i32(gi.x);
  if l>=p.nx*p.ny { return; }
  let mx=l%p.nx; let my=l/p.nx;
  let cx=tw[mx*MAXN/p.nx].x; let cy=tw[my*MAXN/p.ny].x;
  let lam=(2.*cx-2.)/(p.dx*p.dx)+(2.*cy-2.)/(p.dy*p.dy);
  let zero=(mx==0 && my==0);
  var cpv:array<f32,${NZ}>;
  var cPrev=0.; var xPrev=vec2f(0.);
  for (var k=0; k<p.nz; k++) {
    let c=cid(mx,my,k,vec2i(p.nx,p.ny));
    var am=aL(k); var cup=aL(k+1); var b=-(am+cup)+pr[k].rc*lam; var rr=C[c];
    if zero && k==0 { b=1.; cup=0.; am=0.; rr=vec2f(0.); }
    let den=b-am*cPrev;
    cpv[k]=cup/den; cPrev=cpv[k];
    xPrev=(rr-am*xPrev)/den; C[c]=xPrev;
  }
  for (var k=p.nz-2; k>=0; k--) {
    let c=cid(mx,my,k,vec2i(p.nx,p.ny));
    C[c]=C[c]-cpv[k]*C[cid(mx,my,k+1,vec2i(p.nx,p.ny))];
  }
}`;

// 画面に出す数（列ごとに雲の有無、高さごとの雲の量、風の最大）
export const statsWGSL = COMMON + /* wgsl */`
struct St { cover:atomic<u32>, um:atomic<u32>, vm:atomic<u32>, wm:atomic<u32>, bad:atomic<u32>, a1:u32, a2:u32, a3:u32, lev:array<atomic<u32>> };
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<storage,read> U:array<f32>;
@group(0) @binding(2) var<storage,read> V:array<f32>;
@group(0) @binding(3) var<storage,read> W:array<f32>;
@group(0) @binding(4) var<storage,read> Qn:array<f32>;
@group(0) @binding(5) var<storage,read_write> st:St;
@compute @workgroup_size(32) fn main(@builtin(global_invocation_id) gi:vec3u) {
  let l=i32(gi.x);
  if l>=p.nx*p.ny { return; }
  let i=l%p.nx; let j=l/p.nx;
  var any=false; var um=0.; var vm=0.; var wm=0.; var bad=false;
  for (var k=0; k<p.nz; k++) {
    let c=cid(i,j,k,vec2i(p.nx,p.ny));
    let a=abs(U[c]); let b=abs(V[c]); let w=abs(W[c]); let q=Qn[c];
    if !(a<500.) || !(b<500.) || !(w<500.) || !(q<1.) { bad=true; }
    um=max(um,a); vm=max(vm,b); wm=max(wm,w);
    if q>1e-5 { any=true; atomicAdd(&st.lev[k],1u); }
  }
  if any { atomicAdd(&st.cover,1u); }
  if bad { atomicAdd(&st.bad,1u); }
  atomicMax(&st.um,u32(min(um,500.)*1000.));
  atomicMax(&st.vm,u32(min(vm,500.)*1000.));
  atomicMax(&st.wm,u32(min(wm,500.)*1000.));
}`;
