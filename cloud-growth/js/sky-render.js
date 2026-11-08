// 雲ができるまで（3次元の試作）— 空の描画。雲の形は計算した雲水だけ（雑音は足さない）
// 光の弱まり β=1.5 LWC/(ρw re)（粒の半径 10µm の仮定）。太陽の光は Wrenninge の多重散乱の近似、空は Rayleigh＋Mie の1回散乱
const RE = 10e-6, RHO_W = 1000;

const volWGSL = /* wgsl */`
struct P { nx:i32, ny:i32, nz:i32, _a:i32, dx:f32, dy:f32, dz:f32, dt:f32, H:f32, E:f32, cd:f32, S0:f32 };
struct Prof { rc:f32, rf:f32, Tb:f32, qvb:f32, qnb:f32, p:f32, z:f32, s0:f32, qt0:f32, ub:f32, sf:f32, sp:f32 };
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<storage,read> pr:array<Prof>;
@group(0) @binding(2) var<storage,read> Qn:array<f32>;
@group(0) @binding(3) var out:texture_storage_3d<rgba16float,write>;
@compute @workgroup_size(8,8,4) fn main(@builtin(global_invocation_id) g:vec3u) {
  let i=i32(g.x); let j=i32(g.y); let k=i32(g.z);
  if i>=p.nx || j>=p.ny || k>=p.nz { return; }
  let q=Qn[u32(i+p.nx*(j+p.ny*k))];
  textureStore(out,g,vec4f(1.5*pr[k].rc*max(q,-2.5e-4)/(${RHO_W}.*${RE}),0.,0.,0.));   // 負＝飽和に足りない（境目の補間のため）
}`;

const lightWGSL = /* wgsl */`
struct L { sun:vec4f, dom:vec4f };
@group(0) @binding(0) var<uniform> u:L;
@group(0) @binding(1) var vol:texture_3d<f32>;
@group(0) @binding(2) var sm:sampler;
@group(0) @binding(3) var out:texture_storage_3d<rgba16float,write>;
fn beta(x:vec3f)->f32 { return max(0.,textureSampleLevel(vol,sm,x/u.dom.xyz,0.).r); }
@compute @workgroup_size(4,4,4) fn main(@builtin(global_invocation_id) g:vec3u) {
  let dim=vec3f(textureDimensions(out));
  if any(vec3f(g)>=dim) { return; }
  let x=(vec3f(g)+.5)/dim*u.dom.xyz;
  let cell=u.dom.xyz/dim;
  var od=0.; var ds=cell.z*.75; var q=x;
  for (var n=0; n<40; n++) {   // 太陽が低いと遠くの雲の影も入るので 8km 先まで
    q+=u.sun.xyz*ds*.5; od+=beta(q)*ds; q+=u.sun.xyz*ds*.5;
    if q.z>u.dom.z { break; }
    ds=min(ds*1.12,220.);
  }
  var up=0.; let dz=(u.dom.z-x.z)/10.;
  for (var n=0; n<10; n++) { up+=beta(x+vec3f(0.,0.,(f32(n)+.5)*dz))*dz; }
  // 空がどれだけ見えているか（真上＋斜め4方向。谷や雲の下が暗くなる）
  var vis=2.*exp(-.11*up);
  for (var a=0; a<4; a++) {
    let th=f32(a)*1.5708+.6; let w=vec3f(cos(th)*.7,sin(th)*.7,.7); var o4=0.; var s4=60.; var p4=x;
    for (var n=0; n<7; n++) { p4+=w*s4*.5; o4+=beta(p4)*s4; p4+=w*s4*.5; if p4.z>u.dom.z { break; } s4*=1.35; }
    vis+=exp(-.11*o4);
  }
  vis/=6.;
  var mx=0.;
  for (var a=0; a<8; a++) {
    let o=(vec3f(f32(a&1),f32((a>>1)&1),f32((a>>2)&1))-.5)*cell*1.3;
    mx=max(mx,beta(x+o));
  }
  textureStore(out,g,vec4f(od,up,mx,vis));
}`;

const skyWGSL = /* wgsl */`
struct L { sun:vec4f, dom:vec4f };
@group(0) @binding(0) var<uniform> u:L;
@group(0) @binding(1) var out:texture_storage_2d<rgba16float,write>;
const Rg=6360e3; const Ra=6420e3; const bR=vec3f(5.8e-6,13.5e-6,33.1e-6); const bM=vec3f(21e-6);
fn hit(o:vec3f,d:vec3f,r:f32)->f32 { let b=dot(o,d); let c=dot(o,o)-r*r; let h=b*b-c; if h<0. { return -1.; } return -b+sqrt(h); }
fn sky(d:vec3f)->vec3f {
  let o=vec3f(0.,0.,Rg+2.); let tmax=hit(o,d,Ra); let ds=tmax/16.;
  var sR=vec3f(0.); var sM=vec3f(0.); var oR=0.; var oM=0.;
  let mu=dot(d,u.sun.xyz); let pR=3./(16.*3.14159)*(1.+mu*mu); let gg=.76; let pM=3./(8.*3.14159)*((1.-gg*gg)*(1.+mu*mu))/((2.+gg*gg)*pow(1.+gg*gg-2.*gg*mu,1.5));
  for (var i=0; i<16; i++) {
    let x=o+d*(f32(i)+.5)*ds; let h=length(x)-Rg; let hR=exp(-h/8000.)*ds; let hM=exp(-h/1200.)*ds;
    oR+=hR; oM+=hM;
    let tl=hit(x,u.sun.xyz,Ra); let dl=tl/8.;
    var lR=0.; var lM=0.; var ok=true;
    for (var j=0; j<8; j++) { let y=x+u.sun.xyz*(f32(j)+.5)*dl; let hl=length(y)-Rg; if hl<0. { ok=false; break; } lR+=exp(-hl/8000.)*dl; lM+=exp(-hl/1200.)*dl; }
    if ok { let T=exp(-(bR*(oR+lR)+bM*1.1*(oM+lM))); sR+=T*hR; sM+=T*hM; }
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
struct R { pos:vec4f, right:vec4f, up:vec4f, fwd:vec4f, sun:vec4f, sunCol:vec4f, dom:vec4f, misc:vec4f, wb:vec4f };
@group(0) @binding(0) var<uniform> r:R;
@group(0) @binding(1) var vol:texture_3d<f32>;
@group(0) @binding(2) var lt:texture_3d<f32>;
@group(0) @binding(3) var skyT:texture_2d<f32>;
@group(0) @binding(4) var sm:sampler;
@group(0) @binding(5) var smC:sampler;
struct VO { @builtin(position) p:vec4f, @location(0) uv:vec2f };
@vertex fn vs(@builtin(vertex_index) i:u32)->VO {
  let x=f32((i<<1u)&2u); let y=f32(i&2u);
  return VO(vec4f(x*2.-1.,y*2.-1.,0.,1.),vec2f(x*2.-1.,y*2.-1.));
}
fn skyAt(d:vec3f)->vec3f {
  let az=atan2(d.y,d.x); let el=max(asin(clamp(d.z,0.,1.)),.05);   // 地平線ぎりぎりは1回散乱だと暗くなりすぎるので下を切る
  return textureSampleLevel(skyT,smC,vec2f(az/6.28318+.5,sqrt(el/1.5707)),0.).rgb;
}
fn aces(c:vec3f)->vec3f { return (c*(2.51*c+.03))/(c*(2.43*c+.59)+.14); }
fn hg(c:f32,g:f32)->f32 { let g2=g*g; return (1.-g2)/(12.566*pow(1.+g2-2.*g*c,1.5)); }
fn cubicB(x:vec3f)->f32 {
  // 3次 B スプライン（8回の線形の読み出し）
  let d=vec3f(textureDimensions(vol)); let q=x/r.dom.xyz*d-.5; let ip=floor(q); let f=q-ip;
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
  return max(0.,s);
}
fn vb(x:vec3f)->f32 { return ${tri ? 'textureSampleLevel(vol,sm,x/r.dom.xyz,0.).r' : 'cubicB(x)'}; }
// 表面のそばの細かい影（太陽へ 280m だけ細かく。その先は光の表）
fn sunOD(q:vec3f,l:vec4f)->f32 {
  let n=6; let L=280.; let ds=L/f32(n);
  var od=0.;
  for (var i=0; i<n; i++) { od+=cubicB(q+r.sun.xyz*(f32(i)+.5)*ds)*ds; }   // 線形の補間だと格子の層が縞になる
  let far=textureSampleLevel(lt,sm,(q+r.sun.xyz*L)/r.dom.xyz,0.).r;
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
  let amb=zen*1.2+hor*.8;
  // 背景
  var bg:vec3f; var tg=-1.;
  if d.z<-1e-5 { tg=-o.z/d.z; }
  if tg>0. {
    let q=o+d*tg;
    let od=textureSampleLevel(lt,sm,vec3f(q.x/r.dom.x,q.y/r.dom.y,0.),0.).r;
    let col=vec3f(.075,.095,.05);
    bg=col*(r.sunCol.rgb*max(sun.z,0.)*exp(-od*.55)*.32+amb*.5);
    let f=exp(-tg/40000.);
    bg=mix(skyAt(normalize(vec3f(d.x,d.y,.02)))*mix(.4,1.,smoothstep(.05,.3,sun.z)),bg,f);   // 太陽が低いと地面のもやは空ほど明るくない
  } else {
    bg=skyAt(d);
    bg+=r.sunCol.rgb*smoothstep(.99996,.99999,c)*20.;
  }
  // 雲の層
  var col=bg;
  let zlo=350.; let zhi=r.dom.z;
  var t0=0.; var t1=46000.;
  var hitSlab=true;
  if abs(d.z)>1e-5 {
    let a=(zlo-o.z)/d.z; let b=(zhi-o.z)/d.z;
    t0=max(0.,min(a,b)); t1=min(t1,max(a,b));
    if t1<=t0 { hitSlab=false; }
  } else if o.z<zlo || o.z>zhi { hitSlab=false; }
  if tg>0. { t1=min(t1,tg); }
  if hitSlab && t1>t0 {
    var t=t0; var Tr=1.; var L=vec3f(0.); var first=-1.;
    var ds0=14.+t*.004;
    t+=jit*ds0;
    var i=0; var back=0.; var fine=0;
    loop {
      if i>=${320} || t>=t1 || Tr<.012 { break; }
      i++;
      let q=o+d*t; let ds=14.+t*.004;
      let l=textureSampleLevel(lt,sm,q/r.dom.xyz,0.);
      if l.b<4e-6 {
        if fine>0 { fine--; t+=ds; continue; }
        back=ds*6.; t+=back; continue;
      }
      if back>0. { t-=back; back=0.; fine=6; continue; }   // 飛びすぎて雲の中に入ったら戻る（遠くの雲が縞になる）
      var b=vb(q);
      if b>1e-5 {
        if first<0. {
          // 最初の表面は二分法で探し直す（縞を出さない）
          var a0=t-ds; var a1=t;
          for (var n=0; n<5; n++) { let m=.5*(a0+a1); if vb(o+d*m)>1e-5 { a1=m; } else { a0=m; } }
          t=a1; first=t; b=max(b,vb(o+d*t));
        }
        let qq=o+d*t;
        let stepT=exp(-b*ds);
        var tauS=l.r;
        if Tr>.15 { tauS=mix(l.r,sunOD(qq,l),smoothstep(.15,.4,Tr)); }   // 切りかえの等高線を出さない
        // 太陽の直接＋多重散乱、空の光、雲を透過して下へ届く光（二流近似 1/(1+0.75(1-g)τ)、g=0.85）
        let S=r.sunCol.rgb*ms(c,tauS)*.46+amb*(.06+.94*l.a)+r.sunCol.rgb*max(r.sun.z,.12)*.075/(1.+.11*l.g);
        L+=Tr*(1.-stepT)*S;
        Tr*=stepT;
      }
      t+=ds;
    }
    if first>=0. {
      let f=exp(-first/26000.);
      let h=skyAt(normalize(vec3f(d.x,d.y,max(d.z,.02))));
      col=bg*Tr+(L*f+(1.-Tr)*h*(1.-f));
    }
  }
  // 見え方（フィルムの曲線）
  col*=r.misc.w*r.wb.rgb;
  // 明るいところで色が黄色へずれないよう、色あいを保つ曲線と半々に
  let m=max(max(col.r,col.g),max(col.b,1e-4));
  col=mix(aces(col),col*aces(vec3f(m)).r/m,.6);
  col=pow(clamp(col,vec3f(0.),vec3f(1.)),vec3f(1./2.2));
  col+=(jit-.5)/255.;
  return vec4f(col,1.);
}`;

function sunTrans(el) {
  const s = Math.max(0.005, Math.sin(el)), Rg = 6360e3, Ra = 6420e3, n = 24, bR = [5.8e-6, 13.5e-6, 33.1e-6], bM = 21e-6;
  const hc = Rg * s, tMax = -hc + Math.sqrt(hc * hc + Ra * Ra - Rg * Rg), dl = tMax / n;
  let oR = 0, oM = 0;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) * dl, h = Math.sqrt(Rg * Rg + t * t + 2 * Rg * t * s) - Rg; oR += Math.exp(-h / 8000) * dl; oM += Math.exp(-h / 1200) * dl; }
  return bR.map(b => Math.exp(-(b * oR + bM * 1.1 * oM)));
}

export class SkyRender {
  constructor(dev, canvas, sim) {
    this.dev = dev; this.sim = sim; this.canvas = canvas;
    this.ctx = canvas.getContext('webgpu'); this.fmt = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: dev, format: this.fmt, alphaMode: 'opaque' });
    const T = GPUTextureUsage, f = 'rgba16float';
    const v3 = (w, h, d) => dev.createTexture({ size: [w, h, d], dimension: '3d', format: f, usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
    this.vol = v3(sim.nx, sim.ny, sim.nz);
    this.lt = v3(sim.nx >> 1, sim.ny >> 1, sim.nz >> 1);
    this.skyT = dev.createTexture({ size: [256, 128], format: f, usage: T.STORAGE_BINDING | T.TEXTURE_BINDING });
    this.sm = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'clamp-to-edge' });
    this.smC = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'clamp-to-edge' });
    this.lu = dev.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.ru = dev.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const mod = code => dev.createShaderModule({ code });
    const cp = code => dev.createComputePipeline({ layout: 'auto', compute: { module: mod(code), entryPoint: 'main' } });
    const b = (p, list) => dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: list.map((r, i) => ({ binding: i, resource: r })) });
    this.pVol = cp(volWGSL); this.bVol = b(this.pVol, [{ buffer: sim.P }, { buffer: sim.prof }, { buffer: sim.f.Qn }, this.vol.createView()]);
    this.pLt = cp(lightWGSL); this.bLt = b(this.pLt, [{ buffer: this.lu }, this.vol.createView(), this.sm, this.lt.createView()]);
    this.pSky = cp(skyWGSL); this.bSky = b(this.pSky, [{ buffer: this.lu }, this.skyT.createView()]);
    const dm = mod(drawWGSL(location.search.includes('tri')));
    this.pDraw = dev.createRenderPipeline({ layout: 'auto', vertex: { module: dm, entryPoint: 'vs' }, fragment: { module: dm, entryPoint: 'fs', targets: [{ format: this.fmt }] }, primitive: { topology: 'triangle-list' } });
    this.bDraw = b(this.pDraw, [{ buffer: this.ru }, this.vol.createView(), this.lt.createView(), this.skyT.createView(), this.sm, this.smC]);
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
  // 計算の結果をテクスチャへ
  updateVolume(enc) {
    const { sim } = this, p = enc.beginComputePass();
    p.setPipeline(this.pVol); p.setBindGroup(0, this.bVol);
    p.dispatchWorkgroups(Math.ceil(sim.nx / 8), Math.ceil(sim.ny / 8), Math.ceil(sim.nz / 4)); p.end();
    this.updateLight(enc);
  }
  updateLight(enc) {
    const { sim } = this;
    this.dev.queue.writeBuffer(this.lu, 0, new Float32Array([...this.sun, 0, sim.Lx, sim.Ly, sim.Lz, 0]));
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
      ...cam.pos, 0, ...rg, 0, ...up, 0, ...f, 0, ...this.sun, 0, ...this.sunCol, 0,
      sim.Lx, sim.Ly, sim.Lz, 0, narrow ? tf : tf * asp, narrow ? tf / asp : tf, this.frame % 64, exposure,
      ...this.wb, 0,
    ]);
    this.dev.queue.writeBuffer(this.ru, 0, data);
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    pass.setPipeline(this.pDraw); pass.setBindGroup(0, this.bDraw); pass.draw(3); pass.end();
  }
}
