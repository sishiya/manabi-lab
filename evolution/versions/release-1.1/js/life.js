'use strict';
// creature/plant geometry, species table, presence, placement, movement
/* ------------------------------------------------------------------ geometry kit for creatures and plants */
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(0,0,0,'YXZ'),_v=new THREE.Vector3(),_s=new THREE.Vector3();
const P=(geo,col,pos,rot,scl)=>({geo,col,pos:pos||[0,0,0],rot:rot||[0,0,0],scl:scl||[1,1,1]});
const B=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
const Cy=(a,b,h,s=6)=>new THREE.CylinderGeometry(a,b,h,s);
const Co=(r,h,s=6)=>new THREE.ConeGeometry(r,h,s);
const Sp=(r=.5,w=7,h=5)=>new THREE.SphereGeometry(r,w,h);
const Ic=(r,d=0)=>new THREE.IcosahedronGeometry(r,d);
function shade(c,k){const o=new THREE.Color(c);if(k>0)o.lerp(new THREE.Color(0xffffff),k);else o.multiplyScalar(1+k);return o.getHex()}
function merge(parts){
  const pos=[],nor=[],cl=[],c=new THREE.Color();
  for(const p of parts){
    const g=(p.geo.index?p.geo.toNonIndexed():p.geo.clone());
    _e.set(p.rot[0],p.rot[1],p.rot[2],'YXZ');_q.setFromEuler(_e);_m.compose(_v.set(...p.pos),_q,_s.set(...p.scl));
    g.applyMatrix4(_m);g.computeVertexNormals();
    c.set(p.col);const a=g.attributes.position.array,n=g.attributes.normal.array;
    for(let i=0;i<a.length;i++){pos.push(a[i]);nor.push(n[i])}
    for(let i=0;i<a.length/3;i++)cl.push(c.r,c.g,c.b);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cl,3));
  g.computeBoundingSphere();return g;
}
function quad(o){
  const c=o.c,d=shade(c,-.3),l=shade(c,.2),p=[];
  const bl=o.bl||1,bw=o.bw||.4,bh=o.bh||.35,leg=o.leg||.35,lr=o.lr||.06,by=leg+bh*.42;
  p.push(P(Sp(.5,8,6),c,[0,by,0],0,[bw,bh,bl]));
  if(o.belly)p.push(P(Sp(.5,7,5),l,[0,by-bh*.14,0],0,[bw*.86,bh*.78,bl*.9]));
  for(const sx of[-1,1])for(const sz of[-1,1]){
    if(o.spr)p.push(P(Cy(lr,lr*.8,leg*1.6+.05,5),d,[sx*(bw*.5+leg*.3),leg*.45,sz*bl*.28],[0,0,sx*.95]));
    else p.push(P(Cy(lr,lr*.8,leg+bh*.3,5),d,[sx*bw*.28,(leg+bh*.3)/2,sz*bl*.32]));
  }
  const na=o.na??.5,nl=o.nl||0;let hz=bl*.42,hy=by+bh*.1;
  if(nl){const nr=o.nr||bw*.25;p.push(P(Cy(nr*.7,nr,nl,6),c,[0,hy+Math.sin(na)*nl/2,hz+Math.cos(na)*nl/2],[PI/2-na,0,0]));hz+=Math.cos(na)*nl;hy+=Math.sin(na)*nl}
  const hl=o.hl||bl*.3,hw=o.hw||bw*.5,hh=o.hh||bh*.55;
  p.push(P(Sp(.5,7,5),o.hc||c,[0,hy,hz+hl*.3],[o.hp||0,0,0],[hw,hh,hl]));
  if(o.tl){const ta=o.ta??.25;p.push(P(Co(o.tr||bw*.18,o.tl,5),c,[0,by-bh*.05-Math.sin(ta)*o.tl/2,-bl*.45-Math.cos(ta)*o.tl/2],[-(PI/2+ta),0,0]))}
  if(o.x)o.x(p,{by,hz,hy,hl,bl,bw,bh,c,d,l});
  return p;
}
function biped(o){
  const c=o.c,d=shade(c,-.3),p=[];
  const leg=o.leg||.6,bl=o.bl||1,bw=o.bw||.35,bh=o.bh||.4,by=leg+bh*.3;
  p.push(P(Sp(.5,8,6),c,[0,by,0],[o.tilt||0,0,0],[bw,bh,bl]));
  for(const sx of[-1,1]){p.push(P(Cy(leg*.1,leg*.06,leg+bh*.2,5),d,[sx*bw*.25,(leg+bh*.2)/2,-bl*.05]));p.push(P(B(leg*.14,leg*.05,leg*.32),d,[sx*bw*.25,leg*.03,bl*.06]))}
  const na=o.na??.8,nl=o.nl||.2;let hz=bl*.42,hy=by+bh*.15;
  p.push(P(Cy(bw*.18,bw*.26,nl,5),c,[0,hy+Math.sin(na)*nl/2,hz+Math.cos(na)*nl/2],[PI/2-na,0,0]));hz+=Math.cos(na)*nl;hy+=Math.sin(na)*nl;
  const hl=o.hl||.25;p.push(P(Sp(.5,7,5),c,[0,hy,hz+hl*.3],0,[o.hw||hl*.6,o.hh||hl*.6,hl]));
  if(o.arms)for(const sx of[-1,1])p.push(P(Cy(.025,.02,o.arms,4),d,[sx*bw*.35,by-.02,bl*.38],[.9,0,0]));
  if(o.tl)p.push(P(Co(bw*.25,o.tl,5),c,[0,by-.02,-bl*.45-o.tl/2],[-(PI/2+.12),0,0]));
  if(o.x)o.x(p,{by,hz,hy,c,d});
  return p;
}
function human(o){// height ≈ 1
  const skin=o.c,fur=o.fur||skin,d=shade(fur,-.3),p=[],lean=o.lean||0,legL=o.legL||.48,tl=.36;
  for(const sx of[-1,1])p.push(P(Cy(.05,.038,legL,5),o.legC||d,[sx*.065,legL/2,0]));
  p.push(P(Sp(.5,7,5),fur,[0,legL+tl/2,Math.sin(lean)*tl*.5],[lean,0,0],[.27,tl,.18]));
  const hz=Math.sin(lean)*tl+.02,hy=legL+tl+.07;
  p.push(P(Sp(o.head||.1,7,5),skin,[0,hy,hz]));
  if(o.snout)p.push(P(Sp(.055,6,4),skin,[0,hy-.035,hz+.085]));
  const al=o.arm||.4;for(const sx of[-1,1])p.push(P(Cy(.032,.026,al,5),fur,[sx*.16,legL+tl*.92-al/2,Math.sin(lean)*tl*.55],[lean*.6,0,sx*.08]));
  return p;
}
function flyer(o){
  const c=o.c,d=shade(c,-.25),p=[],bl=o.bl||.6;
  p.push(P(Sp(.5,7,5),c,[0,0,0],0,[o.bw||.18,o.bh||.16,bl]));
  p.push(P(B(o.ws||2,.025,o.wc||.35),o.wcol||d,[0,0,o.wz||0]));
  if(o.head)p.push(P(Sp(.5,6,4),c,[0,.03,bl*.5+o.head*.3],0,[o.head*.45,o.head*.45,o.head]));
  if(o.tail)p.push(P(B(o.tail[0],.02,o.tail[1]),d,[0,0,-bl*.55]));
  if(o.x)o.x(p,{c,d});
  return p;
}
function swim(o){
  const c=o.c,d=shade(c,-.3),l=shade(c,.25),p=[],bw=o.bw||.28,bh=o.bh||.4,bl=o.bl||1;
  p.push(P(Sp(.5,8,6),c,[0,0,0],0,[bw,bh,bl]));
  if(o.belly!==false)p.push(P(Sp(.5,7,5),l,[0,-bh*.13,0],0,[bw*.9,bh*.75,bl*.92]));
  const tf=o.tf||.35;p.push(P(Co(tf*.6,tf,4),d,[0,0,-bl*.5-tf*.3],[PI/2,0,0],o.flukes?[1,1,.15]:[.15,1,1]));
  if(o.df)p.push(P(Co(o.df*.5,o.df,4),d,[0,bh*.45,-bl*.05],[-.35,0,0],[.15,1,1]));
  if(o.pf)for(const sx of[-1,1])p.push(P(Sp(.5,5,4),d,[sx*bw*.55,-bh*.15,bl*.15],[0,0,sx*.4],[o.pf,.035,o.pf*.5]));
  if(o.snout)p.push(P(Co(bw*.22,o.snout,5),c,[0,0,bl*.5+o.snout*.42],[PI/2,0,0]));
  if(o.x)o.x(p,{c,d,l});
  return p;
}
const radial=(n,f)=>{const a=[];for(let i=0;i<n;i++)a.push(f(i,i*TAU/n));return a};
const SHAPES={
 strom:c=>[P(Sp(.5,9,5),c,0,0,[1.3,.75,1.3]),P(Sp(.5,8,5),shade(c,.15),[.75,0,.35],0,[.85,.55,.85]),P(Sp(.5,8,5),shade(c,-.15),[-.55,0,-.5],0,[.75,.5,.75])],
 algae:c=>radial(4,(i,a)=>P(Cy(.03,.08,1.4,4),i%2?c:shade(c,.2),[Math.cos(a)*.25,.7,Math.sin(a)*.25],[Math.sin(a)*.25,0,Math.cos(a)*.25])),
 frond:c=>[P(Cy(.03,.05,.5,4),shade(c,-.2),[0,.25,0]),P(Sp(.5,6,6),c,[0,.95,0],0,[.14,1.0,.42]),P(Sp(.5,6,3),shade(c,-.2),[0,.02,0],0,[.3,.06,.3])],
 disc:c=>[P(Sp(.5,10,4),c,[0,.04,0],0,[.7,.1,1]),P(Sp(.5,6,4),shade(c,-.25),[0,.08,0],0,[.07,.08,.92])],
 trilobite:c=>[P(Sp(.5,8,5),c,[0,.08,-.05],0,[.55,.2,.8]),P(Sp(.5,8,4),shade(c,.12),[0,.08,.32],0,[.72,.18,.36]),P(Sp(.5,6,4),shade(c,-.25),[0,.12,0],0,[.18,.2,.88]),P(Sp(.06,5,4),0x222018,[.16,.18,.36]),P(Sp(.06,5,4),0x222018,[-.16,.18,.36])],
 anomalo:c=>{const p=[P(Sp(.5,8,5),c,0,0,[.4,.2,1.2])];for(let i=0;i<5;i++)p.push(P(B(1.0-i*.1,.03,.18),shade(c,.15),[0,-.02,.35-i*.2]));p.push(P(B(.5,.03,.25),shade(c,-.2),[0,0,-.7]));
   for(const sx of[-1,1]){p.push(P(Sp(.07,5,4),0x1a1a1a,[sx*.2,.12,.55]));p.push(P(Cy(.04,.06,.45,4),shade(c,-.15),[sx*.08,-.12,.75],[.9,0,0]))}return p},
 eel:c=>swim({c,bw:.12,bh:.16,bl:1,tf:.18,belly:false,x:p=>p.push(P(B(.02,.1,.8),shade(c,-.2),[0,.09,-.05]))}),
 agnathan:c=>swim({c,bw:.26,bh:.24,bl:1,tf:.3,x:p=>p.push(P(Sp(.5,7,5),shade(c,-.25),[0,.02,.3],0,[.36,.26,.45]))}),
 fish:c=>swim({c,bw:.22,bh:.38,bl:1,tf:.32,df:.22,pf:.2}),
 shark:c=>swim({c,bw:.28,bh:.3,bl:1.2,tf:.5,df:.4,pf:.45,snout:.2}),
 placoderm:c=>swim({c,bw:.36,bh:.36,bl:1.1,tf:.42,df:.25,pf:.3,x:p=>{p.push(P(Sp(.5,8,5),shade(c,-.3),[0,.04,.36],0,[.44,.4,.46]));p.push(P(B(.3,.04,.1),0xd8d0c0,[0,-.08,.6]))}}),
 orthocone:c=>[P(Co(.17,1.7,7),c,[0,0,-.75],[-PI/2,0,0]),P(Sp(.2,6,5),shade(c,-.25),[0,0,.15]),...radial(5,(i,a)=>P(Cy(.02,.03,.4,3),shade(c,-.3),[Math.cos(a)*.1,Math.sin(a)*.1,.4],[PI/2,0,0]))],
 ammonite:c=>[P(new THREE.TorusGeometry(.3,.17,6,10),c,[0,0,-.05],[0,PI/2,0]),P(Sp(.3,7,5),shade(c,-.15),[0,0,-.05],0,[.7,1,1]),...radial(4,(i)=>P(Cy(.02,.03,.35,3),shade(c,-.3),[(i-1.5)*.05,-.15,.33],[PI/2+.3,0,0]))],
 eurypterid:c=>{const p=[P(Sp(.5,7,4),c,[0,.08,.3],0,[.45,.14,.45]),P(Sp(.5,7,4),shade(c,.1),[0,.08,-.25],0,[.32,.12,.8]),P(Co(.05,.45,4),shade(c,-.25),[0,.08,-.85],[-PI/2,0,0])];
   for(const sx of[-1,1]){p.push(P(Sp(.5,5,4),shade(c,-.15),[sx*.33,.06,.05],[0,sx*.4,0],[.35,.03,.14]));for(const z of[.2,.35,.45])p.push(P(Cy(.015,.015,.3,3),shade(c,-.3),[sx*.25,.03,z],[0,0,sx*1.1]))}return p},
 lobefin:c=>swim({c,bw:.3,bh:.3,bl:1,tf:.3,df:.15,x:p=>{for(const sx of[-1,1])for(const z of[.2,-.2])p.push(P(Sp(.5,6,4),shade(c,-.2),[sx*.2,-.1,z],[0,sx*.6,sx*.3],[.3,.07,.14]))}}),
 tiktaalik:c=>quad({c,bl:1.1,bw:.36,bh:.18,leg:.06,lr:.05,spr:1,hl:.4,hw:.34,hh:.14,tl:.7,tr:.12,ta:0}),
 tetrapod:c=>quad({c,bl:1,bw:.34,bh:.2,leg:.12,lr:.05,spr:1,hl:.32,hw:.32,hh:.14,tl:.8,tr:.1,ta:.05}),
 amphib:c=>quad({c,bl:1,bw:.42,bh:.22,leg:.14,lr:.06,spr:1,hl:.35,hw:.42,hh:.15,tl:.5,tr:.1,ta:.05}),
 millipede:c=>radial(8,i=>P(Sp(.09,5,4),i%2?c:shade(c,-.2),[0,.09,.42-i*.12])),
 dragonfly:c=>flyer({c,bw:.06,bh:.06,bl:1,ws:1.5,wc:.14,wcol:0xc8e0e8,x:p=>{p.push(P(B(1.3,.012,.12),0xc8e0e8,[0,0,-.12]));p.push(P(Sp(.08,6,4),shade(c,-.2),[0,0,.5]))}}),
 lizard:c=>quad({c,bl:.9,bw:.26,bh:.18,leg:.12,lr:.04,spr:1,hl:.26,hw:.2,hh:.13,tl:.8,tr:.07,ta:.05}),
 dimetrodon:c=>quad({c,bl:1,bw:.32,bh:.26,leg:.16,lr:.06,spr:1,hl:.34,hw:.22,hh:.2,tl:.8,tr:.09,ta:.08,x:(p,k)=>p.push(P(Sp(.5,10,6),shade(c,.12),[0,k.by+k.bh*.45,-.02],0,[.03,.8,.7]))}),
 gorgon:c=>quad({c,bl:1,bw:.32,bh:.3,leg:.28,lr:.06,hl:.42,hw:.24,hh:.24,tl:.45,tr:.08,ta:.2}),
 lystro:c=>quad({c,bl:.8,bw:.42,bh:.36,leg:.18,lr:.08,hl:.3,hw:.28,hh:.26,tl:.15,tr:.08,ta:.3,belly:1}),
 cynodont:c=>quad({c,bl:.8,bw:.26,bh:.24,leg:.2,lr:.04,hl:.3,hw:.18,hh:.16,tl:.4,tr:.05,ta:.2}),
 shrew:c=>quad({c,bl:.6,bw:.26,bh:.24,leg:.08,lr:.03,hl:.25,hw:.16,hh:.14,tl:.5,tr:.03,ta:.1}),
 smalltheropod:c=>biped({c,leg:.45,bl:.7,bw:.2,bh:.22,nl:.3,na:.9,hl:.22,tl:.8,arms:.15}),
 bigtheropod:c=>biped({c,leg:.45,bl:.8,bw:.34,bh:.4,nl:.15,na:.6,hl:.42,hh:.26,hw:.26,tl:.9,arms:.1}),
 ornithopod:c=>biped({c,leg:.4,bl:.9,bw:.36,bh:.4,nl:.25,na:.7,hl:.28,tl:.8,arms:.3}),
 sauropod:c=>quad({c,bl:.6,bw:.3,bh:.3,leg:.3,lr:.07,nl:.9,na:.85,nr:.07,hl:.12,hw:.08,hh:.07,tl:.95,tr:.08,ta:.15,belly:1}),
 stego:c=>quad({c,bl:1,bw:.36,bh:.36,leg:.26,lr:.07,hl:.2,hw:.12,hh:.1,na:-.2,nl:.15,tl:.7,tr:.1,ta:.1,x:(p,k)=>{for(let i=0;i<6;i++)p.push(P(Co(.07,.28-Math.abs(i-2.5)*.03,4),shade(c,-.25),[0,k.by+k.bh*.42,.35-i*.17],0,[.35,1,1]));for(const sx of[-1,1])p.push(P(Co(.03,.3,4),0xd8d0b8,[sx*.07,k.by,-1.0],[-PI/2-.4,0,sx*.5]))}}),
 pterosaur:c=>flyer({c,bw:.14,bh:.14,bl:.5,ws:2.6,wc:.4,wcol:shade(c,-.15),head:.4,x:p=>p.push(P(Co(.05,.35,4),shade(c,-.3),[0,.12,.15],[-.9,0,0]))}),
 bird:c=>flyer({c,bw:.16,bh:.14,bl:.5,ws:1.3,wc:.25,head:.18,tail:[.2,.2]}),
 gastornis:c=>biped({c,leg:.55,bl:.6,bw:.4,bh:.5,nl:.3,na:1.2,hl:.3,hh:.24,hw:.2,tl:.15,tilt:-.3}),
 ichthyo:c=>swim({c,bw:.3,bh:.36,bl:1.2,tf:.5,df:.3,pf:.3,snout:.4}),
 plesio:c=>{const p=swim({c,bw:.45,bh:.26,bl:.8,tf:.15});p.push(P(Cy(.05,.09,1.0,5),c,[0,.15,.88],[PI/2-.3,0,0]));p.push(P(Sp(.5,6,4),c,[0,.3,1.4],0,[.12,.1,.2]));
   for(const sx of[-1,1])for(const z of[.2,-.25])p.push(P(Sp(.5,6,4),shade(c,-.2),[sx*.35,-.05,z],[0,sx*.4,0],[.55,.04,.16]));return p},
 mosasaur:c=>swim({c,bw:.3,bh:.28,bl:1.6,tf:.35,pf:.3,snout:.25,df:.1}),
 whale:c=>swim({c,bw:.3,bh:.3,bl:2,tf:.4,pf:.25,snout:.2,flukes:1}),
 primate:c=>quad({c,bl:.6,bw:.24,bh:.24,leg:.2,lr:.04,hl:.22,hw:.18,hh:.18,tl:.6,tr:.03,ta:-.6}),
 ape:c=>quad({c,bl:.6,bw:.36,bh:.42,leg:.32,lr:.06,hl:.24,hw:.22,hh:.22,na:.3}),
 elephant:c=>quad({c,bl:1,bw:.6,bh:.6,leg:.5,lr:.12,hl:.4,hw:.42,hh:.42,tl:.3,tr:.03,ta:.9,x:(p,k)=>{p.push(P(Cy(.05,.09,.7,5),c,[0,k.hy-.35,k.hz+.42]));
   for(const sx of[-1,1]){p.push(P(Sp(.5,6,4),shade(c,-.1),[sx*.22,k.hy+.02,k.hz+.05],[0,sx*.3,0],[.06,.42,.36]));p.push(P(Co(.03,.35,4),0xe8e0cc,[sx*.1,k.hy-.2,k.hz+.45],[1.9,0,0]))}}}),
 antelope:c=>quad({c,bl:.8,bw:.24,bh:.28,leg:.5,lr:.03,nl:.3,na:1.0,nr:.06,hl:.22,hw:.12,hh:.12,tl:.12,tr:.03,ta:.4,belly:1,x:(p,k)=>{for(const sx of[-1,1])p.push(P(Co(.02,.32,3),0x2a2620,[sx*.04,k.hy+.18,k.hz+.02],[-.4,0,sx*.15]))}}),
 giraffe:c=>quad({c,bl:.8,bw:.28,bh:.34,leg:.8,lr:.04,nl:1.0,na:1.25,nr:.07,hl:.22,hw:.1,hh:.1,tl:.2,tr:.02,ta:.5,belly:1}),
 hippo:c=>quad({c,bl:1,bw:.6,bh:.5,leg:.18,lr:.1,hl:.45,hw:.42,hh:.32,tl:.1,tr:.05,ta:.5,belly:1}),
 croc:c=>quad({c,bl:1,bw:.32,bh:.16,leg:.06,lr:.05,spr:1,hl:.6,hw:.2,hh:.1,tl:1.1,tr:.12,ta:0}),
 lion:c=>quad({c,bl:.9,bw:.3,bh:.32,leg:.36,lr:.05,nl:.1,na:.5,hl:.26,hw:.24,hh:.24,tl:.55,tr:.03,ta:.6,belly:1}),
 cattle:c=>quad({c,bl:.9,bw:.38,bh:.4,leg:.38,lr:.06,hl:.3,hw:.2,hh:.2,na:.2,nl:.15,tl:.4,tr:.03,ta:1.2,belly:1,x:(p,k)=>{for(const sx of[-1,1])p.push(P(Co(.025,.3,3),0xe0d8c4,[sx*.14,k.hy+.1,k.hz+.05],[0,0,-sx*1.0]))}}),
 hom_early:()=>human({c:0x5a4436,fur:0x3a2e26,lean:.25,legL:.38,arm:.5,head:.11,snout:1}),
 australo:()=>human({c:0x5a4436,fur:0x4e3a2c,lean:.12,legL:.4,arm:.46,head:.11,snout:1}),
 paranthropus:()=>human({c:0x4a3a2e,fur:0x34291f,lean:.12,legL:.4,arm:.46,head:.12,snout:1}),
 habilis:()=>human({c:0x5e4434,fur:0x5e4434,lean:.06,legL:.44,arm:.42,head:.11}),
 erectus:()=>human({c:0x6a4a36,fur:0x6a4a36,legL:.5,arm:.4,head:.1}),
 heidel:()=>human({c:0x6e4c36,fur:0x6e4c36,legL:.5,arm:.4,head:.105}),
 sapiens:()=>human({c:0x7a5038,fur:0x9a7a56,legL:.5,arm:.4,head:.1}),
 person:()=>human({c:0x8a6048,fur:0xffffff,legC:0x3a4050,legL:.5,arm:.4,head:.1}),
 canoe:c=>[P(Sp(.5,8,4),c,[0,.05,0],0,[.32,.18,1.8]),P(Sp(.5,6,4),0x5a3e2a,[0,.2,.2],0,[.13,.32,.13])],
 hut:c=>[P(Cy(.5,.55,.5,8),shade(c,-.15),[0,.25,0]),P(Co(.72,.65,8),c,[0,.82,0])],
 building:c=>[P(B(1,1,1),c,[0,.5,0]),P(B(1.04,.04,1.04),shade(c,-.35),[0,1,0])],
 car:c=>[P(B(.7,.28,1.5),c,[0,.24,0]),P(B(.6,.24,.75),0x2a3440,[0,.5,-.05])],
 train:c=>{const p=[P(B(.9,.9,2.2),0x2a2a2a,[0,.6,1.6]),P(Cy(.08,.1,.5,6),0x222222,[0,1.2,2.2])];for(let i=0;i<4;i++)p.push(P(B(.9,.85,2),c,[0,.55,-.8-i*2.3]));return p},
 plane:c=>[P(Cy(.18,.15,3,6),c,0,[PI/2,0,0]),P(B(3.6,.06,.6),c,[0,0,.1]),P(B(1.2,.05,.35),c,[0,0,-1.3]),P(B(.05,.5,.4),c,[0,.25,-1.3])],
 fire:()=>[P(B(.5,.08,.08),0x3a2a1a,[0,.04,0],[0,.6,0]),P(B(.5,.08,.08),0x3a2a1a,[0,.04,0],[0,-.6,0])],
 moss:c=>[P(Sp(.5,6,4),c,0,0,[1,.35,1]),P(Sp(.5,6,4),shade(c,.15),[.5,0,.2],0,[.6,.3,.6]),P(Sp(.5,6,4),shade(c,-.15),[-.4,0,-.3],0,[.7,.3,.6])],
 cooksonia:c=>{const p=[];for(let i=0;i<6;i++){const a=i*1.05,r=.15+.1*(i%2),h=.5+.15*(i%3);p.push(P(Cy(.02,.025,h,3),c,[Math.cos(a)*r,h/2,Math.sin(a)*r]));p.push(P(Sp(.05,5,3),0x8a7a3a,[Math.cos(a)*r,h,Math.sin(a)*r]))}return p},
 fern:c=>radial(7,(i,a)=>P(Sp(.5,5,3),i%2?c:shade(c,.12),[Math.sin(a)*.35,.18,Math.cos(a)*.35],[-.5,a,0],[.16,.04,.75])),
 treefern:c=>[P(Cy(.1,.15,2.4,5),0x4a3a2a,[0,1.2,0]),...radial(8,(i,a)=>P(Sp(.5,5,3),i%2?c:shade(c,.12),[Math.sin(a)*.5,2.45,Math.cos(a)*.5],[.25,a,0],[.2,.05,1.1]))],
 archaeopteris:c=>[P(Cy(.12,.22,3,5),0x4a3828,[0,1.5,0]),P(Co(1.3,2.8,7),c,[0,3.4,0]),P(Co(1.0,2,7),shade(c,.1),[0,4.4,0])],
 lepido:c=>{const p=[P(Cy(.16,.26,5.5,6),0x5a5a3a,[0,2.75,0])];for(const s of[-1,1]){p.push(P(Cy(.08,.11,1.4,5),0x5a5a3a,[s*.45,5.9,0],[0,0,-s*.6]));p.push(P(Sp(.5,6,4),c,[s*.85,6.5,0],0,[.7,.9,.7]))}p.push(P(Sp(.5,6,4),shade(c,.1),[0,6.3,.3],0,[.6,.8,.6]));return p},
 conifer:c=>[P(Cy(.1,.16,1.2,5),0x4a3626,[0,.6,0]),P(Co(1.1,1.8,7),c,[0,1.7,0]),P(Co(.85,1.6,7),shade(c,.08),[0,2.5,0]),P(Co(.55,1.3,7),shade(c,.16),[0,3.25,0])],
 cycad:c=>[P(Cy(.22,.28,.8,7),0x5a4a30,[0,.4,0]),...radial(9,(i,a)=>P(Sp(.5,5,3),i%2?c:shade(c,.15),[Math.sin(a)*.45,.95,Math.cos(a)*.45],[-.45,a,0],[.16,.05,1.0]))],
 broadleaf:c=>[P(Cy(.13,.2,1.8,5),0x4a3828,[0,.9,0]),P(Ic(1.1,1),c,[0,2.5,0],0,[1,.85,1]),P(Ic(.8,1),shade(c,.12),[.6,2.9,.3]),P(Ic(.75,1),shade(c,-.1),[-.5,2.3,-.4])],
 palm:c=>[P(Cy(.09,.14,3.6,5),0x6a5638,[.2,1.8,0],[0,0,-.1]),...radial(8,(i,a)=>P(Sp(.5,5,3),i%2?c:shade(c,.12),[.4+Math.sin(a)*.55,3.55,Math.cos(a)*.55],[.35,a,0],[.18,.04,1.3]))],
 acacia:c=>[P(Cy(.08,.13,2.0,5),0x4a3a2a,[0,1,0]),P(Cy(.05,.07,.9,4),0x4a3a2a,[.3,2.1,0],[0,0,-.6]),P(Cy(.05,.07,.9,4),0x4a3a2a,[-.3,2.1,0],[0,0,.6]),P(Sp(.5,9,4),c,[0,2.6,0],0,[2.8,.42,2.6])],
 grass:c=>radial(6,(i,a)=>P(Co(.06,.6,3),i%2?c:shade(c,.15),[Math.sin(a)*.12,.3,Math.cos(a)*.12],[Math.cos(a)*.25,0,-Math.sin(a)*.25])),
};

/* ------------------------------------------------------------------ species
   hab  : sea / bed / shore / land / wet / air / town / surf (moving)   shallow / seabed / coast / swamp / forest / beach / dry (fixed)
   mv   : st (fixed) / walk / swim / fly / crawl
*/
const SPECIES=[];
function S(k,name,from,to,hab,n,size,col,mv,o={}){SPECIES.push(Object.assign({k,name,from,to,hab,n,size,col,mv,spd:1,grp:1,shape:k},o))}
// sea and seabed
S('strom','ストロマトライト',3.48e9,0,'shallow',70,2.4,0x857a64,'st',{ab:[[3.4e9,1],[1.0e9,1],[5.4e8,.45],[4.5e8,.12],[0,.06]],fi:.004});
S('algae','藻類',1.0e9,0,'shallow',60,1.5,0x6f8f3a,'st');
S('charnia','カルニア',5.75e8,5.39e8,'seabed',40,2.4,0xc9a58a,'st',{shape:'frond',fo:.002});
S('dickinsonia','ディッキンソニア',5.6e8,5.45e8,'bed',24,1.8,0xb58a6e,'crawl',{shape:'disc',spd:.15});
S('trilobite','三葉虫',5.21e8,2.52e8,'bed',50,1.3,0x6b5240,'crawl',{spd:.5,grp:6,ab:[[5.2e8,1],[4.2e8,.6],[3.6e8,.25],[2.6e8,.15]]});
S('anomalo','アノマロカリス',5.2e8,4.8e8,'sea',6,3.2,0xb0583e,'swim',{spd:3});
S('chordate','初期の脊椎動物（ハイコウイクティスなど）',5.3e8,4.6e8,'sea',18,1.1,0xd9cbb0,'swim',{shape:'eel',spd:2.5,grp:3});
S('agnathan','無顎類（甲冑魚）',4.8e8,3.6e8,'sea',22,1.4,0x8a7a5a,'swim',{spd:2.2,grp:4});
S('nautiloid','直角貝（オウムガイのなかま）',4.85e8,2.0e8,'sea',12,2.6,0xd8c4a0,'swim',{shape:'orthocone',spd:1.5,ab:[[4.8e8,1],[4.2e8,.5],[3e8,.2]]});
S('eurypterid','ウミサソリ',4.67e8,2.52e8,'bed',10,2.6,0x7a5a48,'crawl',{spd:1.2,ab:[[4.4e8,1],[3.6e8,.3]]});
S('placoderm','板皮類（ダンクルオステウスなど）',4.3e8,3.59e8,'sea',5,4.2,0x5e6a6e,'swim',{spd:2.6,fo:.002});
S('shark','サメ',4.2e8,0,'sea',5,3.4,0x7a8790,'swim',{spd:4,marine:1});
S('fish','魚',4.2e8,0,'sea',46,1.0,0x9fb0a8,'swim',{spd:3.4,grp:5});
S('lobefin','肉鰭類（ひれに骨のある魚）',4.15e8,3.0e8,'sea',10,1.8,0x7a7f4e,'swim',{spd:1.6,ab:[[4e8,1],[3.6e8,.4]]});
S('ammonite','アンモナイト',4.09e8,6.6e7,'sea',24,1.6,0xc9a77a,'swim',{spd:1.2,grp:4,fo:.0015,marine:1});
S('ichthyo','魚竜',2.48e8,9.4e7,'sea',5,4.2,0x5a6c7a,'swim',{spd:5,marine:1});
S('plesio','首長竜',2.03e8,6.6e7,'sea',4,5,0x4e5e58,'swim',{spd:3,fo:.0015,marine:1});
S('mosasaur','モササウルス',9.8e7,6.6e7,'sea',3,6.5,0x56604a,'swim',{spd:4,fo:.0015,marine:1});
S('whale','初期のクジラ（バシロサウルスなど）',4.5e7,0,'sea',2,8,0x5a6670,'swim',{spd:3,marine:1});
// land animals
S('millipede','陸の節足動物（ヤスデなど）',4.28e8,0,'wet',14,1.0,0x5a3a2a,'crawl',{spd:.4,ab:[[4.2e8,1],[3e8,.5],[2e8,.2],[0,.1]]});
S('tiktaalik','ティクターリク',3.8e8,3.65e8,'shore',6,2.2,0x6f6a44,'crawl',{spd:.8});
S('tetrapod','初期の四肢動物（イクチオステガなど）',3.7e8,3.0e8,'shore',8,2.2,0x5c6a48,'crawl',{spd:.9});
S('meganeura','メガネウラ（巨大トンボ）',3.2e8,2.5e8,'air',8,2.2,0x3f8a8a,'fly',{shape:'dragonfly',spd:7,alt:[5,14]});
S('amphib','両生類（エリオプスなど）',3.0e8,2.0e8,'shore',8,2.4,0x4e5a3a,'crawl',{spd:.8,ab:[[3e8,1],[2.5e8,.4]]});
S('synapsid','初期の単弓類',3.12e8,2.7e8,'land',8,1.5,0x6b5a3a,'walk',{shape:'lizard',spd:1.6,grp:2});
S('dimetrodon','ディメトロドン',2.95e8,2.72e8,'land',6,3.4,0x8a4a32,'walk',{spd:1.4});
S('gorgon','ゴルゴノプス類',2.65e8,2.52e8,'land',4,3.4,0x7a6a4e,'walk',{spd:2.4,fo:.0015});
S('lystro','リストロサウルス',2.6e8,2.01e8,'land',14,2.0,0x8a7a5e,'walk',{spd:1.2,grp:2,ab:[[2.6e8,.3],[2.52e8,1],[2.45e8,1],[2.3e8,.2]]});
S('cynodont','キノドン類',2.6e8,1.9e8,'land',8,1.4,0x6e5a48,'walk',{spd:2.2,grp:2});
S('smalltheropod','小型の獣脚類',2.3e8,6.6e7,'land',8,2.4,0x7a6a3a,'walk',{spd:4,grp:2,fo:.0015});
S('sauropod','竜脚類',2.0e8,6.6e7,'land',6,6,0x7b7462,'walk',{spd:1.2,fo:.0015});
S('bigtheropod','大型の獣脚類',1.6e8,6.6e7,'land',2,8,0x6a5038,'walk',{spd:2.2,fo:.0015});
S('stego','ケントロサウルス（剣竜）',1.6e8,1.0e8,'land',4,4.5,0x6e7a4a,'walk',{spd:1});
S('ornithopod','鳥脚類（イグアノドンなど）',1.5e8,6.6e7,'land',10,5,0x7a8058,'walk',{spd:1.6,grp:2,fo:.0015});
S('pterosaur','翼竜',2.2e8,6.6e7,'air',6,3.6,0xb0906a,'fly',{spd:8,fo:.0015,alt:[18,40]});
S('mammaliaform','初期の哺乳類',2.05e8,6.6e7,'land',8,1.0,0x6a5444,'walk',{shape:'shrew',spd:2.5,grp:2});
S('bird','鳥',1.5e8,0,'air',10,1.2,0x9aa0a6,'fly',{spd:9,grp:2,alt:[15,45]});
S('mammal','小型の哺乳類',6.6e7,0,'land',12,1.0,0x7a6450,'walk',{shape:'shrew',spd:2.5,grp:3,ab:[[6.6e7,.5],[6.5e7,1],[3e7,.6],[0,.4]]});
S('gastornis','ガストルニス',5.6e7,4.5e7,'land',3,3.2,0x5a5048,'walk',{spd:2});
S('primate','初期の霊長類',5.5e7,2.5e7,'wet',8,1.2,0x7a5a3a,'walk',{spd:2,grp:2});
S('ape','プロコンスル（初期の類人猿）',2.3e7,1.0e7,'wet',8,1.7,0x4a3a2e,'walk',{spd:1.6,grp:2});
S('elephant','ゾウのなかま',2.0e7,0,'land',7,5.5,0x7a756e,'walk',{spd:1.4,ab:[[2e7,.5],[5e6,1],[0,.6]]});
S('antelope','レイヨウ',1.8e7,0,'land',24,2.0,0xb08a5a,'walk',{spd:3,grp:3,ab:[[1.5e7,.3],[5e6,1],[0,.6]]});
S('giraffe','キリン',8e6,0,'land',5,5,0xc89a5a,'walk',{spd:1.6});
S('hippo','カバ',6e6,0,'shore',6,3.2,0x6a5c5e,'walk',{spd:.8,grp:1});
S('croc','ワニ',9.5e7,0,'shore',6,3.6,0x4a5838,'crawl',{spd:.6});
S('lion','ライオンのなかま',3.5e6,0,'land',4,2.6,0xc0975a,'walk',{spd:2.2,ab:[[3e6,1],[0,.4]]});
// people
S('hom_early','初期の人類（サヘラントロプス、アルディピテクス）',7e6,4.2e6,'wet',8,2.0,0x5a4436,'walk',{spd:1.2,human:1});
S('australo','アウストラロピテクス',4.2e6,2.0e6,'wet',10,2.0,0x5a4436,'walk',{spd:1.2,human:1});
S('paranthropus','パラントロプス',2.7e6,1.2e6,'wet',6,2.1,0x4a3a2e,'walk',{spd:1.1,human:1});
S('habilis','ホモ・ハビリス',2.8e6,1.5e6,'wet',8,2.2,0x5e4434,'walk',{spd:1.4,human:1});
S('erectus','ホモ・エレクトス',1.9e6,1.1e5,'wet',10,2.6,0x6a4a36,'walk',{spd:1.8,human:1,fire:1});
S('heidel','ホモ・ハイデルベルゲンシス',7e5,2e5,'wet',8,2.6,0x6e4c36,'walk',{spd:1.6,human:1,fire:1});
S('sapiens','ホモ・サピエンス',3e5,0,'wet',14,2.5,0x7a5038,'walk',{spd:1.6,human:1,fire:1,grp:2,ab:[[3e5,.6],[1e4,1],[120,1],[0,.35]]});
S('person','現代の人々',110,0,'town',40,2.5,0xffffff,'walk',{spd:1.4,grp:4,ab:[[110,.2],[0,1]],tint:[0xd84a3a,0x3a6ad8,0xe8c040,0xeeeeee,0x2a2a2a,0x4aa060]});
S('cattle','ウシ（牧畜）',5000,0,'pasture',16,2.0,0xffffff,'walk',{spd:1,grp:2,tint:[0xf2ede4,0x7a4a2a,0x2a2420,0xb08050]});
S('canoe','丸木舟',1e4,0,'surf',4,2.2,0x6a4a30,'swim',{spd:1.5});
S('plane','飛行機',70,0,'air',2,2.4,0xe8ecf0,'fly',{spd:34,alt:[85,95],straight:1});
// plants
S('moss','コケのなかま',4.7e8,0,'coast',260,1.3,0x5f7d34,'st',{ab:[[4.7e8,1],[3.8e8,.5],[0,.15]],fi:.01});
S('cooksonia','クックソニア',4.33e8,3.93e8,'coast',240,1.3,0x5f8a3a,'st');
S('fern','シダ',3.9e8,0,'forest',260,1.6,0x4f8a3a,'st',{ab:[[3.6e8,1],[2e7,.4],[0,.2]],fern:1});
S('archaeopteris','アルカエオプテリス',3.85e8,3.59e8,'forest',220,2.2,0x3f6e2e,'st',{fo:.003,tree:1});
S('lepido','リンボク（鱗木）',3.6e8,2.9e8,'swamp',260,2.0,0x3f6a2a,'st',{tree:1});
S('treefern','木生シダ',3.6e8,0,'forest',120,1.8,0x4a7a34,'st',{ab:[[3.6e8,1],[1.0e8,.5],[2e7,.12]],tree:1});
S('conifer','針葉樹',3.1e8,0,'forest',300,2.2,0x2f5a32,'st',{ab:[[3e8,.6],[2.5e8,1],[1.0e8,.7],[5e7,.3],[0,.1]],tree:1});
S('cycad','ソテツのなかま',2.8e8,0,'forest',160,1.8,0x5a7a30,'st',{ab:[[2e8,1],[6.6e7,.35],[0,.05]],tree:1});
S('broadleaf','広葉樹（花を咲かせる木）',1.25e8,0,'forest',360,2.0,0x3d7a32,'st',{ab:[[1.25e8,.15],[9e7,.6],[6e7,1],[0,1]],tree:1});
S('palm','ヤシ',8.5e7,0,'beach',80,2.0,0x4f8a34,'st',{tree:1});
S('grass','イネ科の草',3e7,0,'dry',600,1.3,0xa8a050,'st',{grassy:1});
S('acacia','アカシア',1.5e7,0,'dry',160,2.3,0x5f7a34,'st',{acacia:1,tree:1});
// villages and towns (placed by their own rules)
S('hut','小屋（村）',9000,0,'village',36,2.4,0xa08858,'st',{special:1});
S('fire','たき火',1e6,0,'camp',4,2.4,0x3a2a1a,'st',{special:1});
S('building','建物',125,0,'city',260,1,0xc8c4bc,'st',{special:1,tint:[0xd8d4cc,0xb8c0c8,0xe0d0b8,0x9aa4ae,0xc8b8a8]});
S('car','自動車',95,0,'road',30,1.6,0xffffff,'st',{special:1,tint:[0xd03a30,0xe8e8e8,0x2a2a2a,0x3a6ad0,0xd8c040]});
S('train','鉄道',125,0,'rail',1,2.0,0x6a3a2a,'st',{special:1});
const SPK={};for(const s of SPECIES){SPK[s.k]=s;s.wild=!s.human&&(s.hab==='land'||s.hab==='wet'||s.hab==='shore')}

/* materials shared by plants so a whole flora can be tinted (fire, die-off) */
const plantMat=new THREE.MeshLambertMaterial({vertexColors:true});
const animalMat=new THREE.MeshLambertMaterial({vertexColors:true});
const uNight={value:0};
const bldMat=new THREE.MeshLambertMaterial({vertexColors:true});
bldMat.onBeforeCompile=sh=>{sh.uniforms.uNight=uNight;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;varying vec3 vON;').replace('#include <begin_vertex>','#include <begin_vertex>\nvON=normal;vec4 _wp=vec4(transformed,1.);\n#ifdef USE_INSTANCING\n_wp=instanceMatrix*_wp;\n#endif\nvWP=(modelMatrix*_wp).xyz;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;varying vec3 vON;uniform float uNight;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nif(uNight>0.&&abs(vON.y)<.5){float fy=vWP.y/.55,fx=(vWP.x+vWP.z)/.5;vec2 c=vec2(floor(fy),floor(fx));float lit=step(.42,fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453));float win=step(.35,fract(fy))*step(.35,fract(fx))*step(.4,vWP.y);totalEmissiveRadiance+=vec3(1.,.8,.5)*lit*win*uNight;}');};
const flameMat=new THREE.MeshBasicMaterial({color:0xffa040,transparent:true,opacity:.95});
const pickables=[];
const tmpO=new THREE.Object3D(),tmpC=new THREE.Color();
for(const s of SPECIES){
  const parts=SHAPES[s.shape](s.col);
  const geo=merge(parts);
  const mat=s.mv==='st'&&s.hab!=='village'&&s.hab!=='city'&&s.hab!=='road'&&s.hab!=='rail'&&s.hab!=='camp'?plantMat:animalMat;
  if(s.mv!=='st'&&!s.special&&s.k!=='plane')s.size*=1.6;else if(s.mv==='st'&&!s.special&&s.hab!=='shallow'&&s.hab!=='seabed')s.size*=1.25;
  const mesh=new THREE.InstancedMesh(geo,s.k==='building'?bldMat:mat,s.n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow=true;mesh.receiveShadow=s.mv==='st';mesh.frustumCulled=false;
  s.colors=[];
  for(let i=0;i<s.n;i++){
    if(s.tint)tmpC.set(s.tint[i%s.tint.length]);else{const k=.86+.24*rnd();tmpC.setRGB(k,k,k)}
    s.colors.push(tmpC.clone());mesh.setColorAt(i,tmpC);
  }
  mesh.count=0;mesh.userData.sp=s;world.add(mesh);s.mesh=mesh;pickables.push(mesh);
  s.vis=[];// instance index -> agent/candidate
  if(s.mv==='st'){
    s.cand=[];
    for(let i=0;i<s.n;i++){const x=rr(-97,97),z=rr(-97,97);s.cand.push({x,z,q:.65*rnd()+.35*(fbm(x*.03+9,z*.03,2)+.6),r:rnd()*TAU,s:rr(.7,1.3)})}
  }else{
    s.ag=[];s.gc=[];
    const g=s.grp||1;for(let j=0;j<g;j++)s.gc.push({x:0,z:0,h:rnd()*TAU,ok:false});
    for(let i=0;i<s.n;i++)s.ag.push({x:0,z:0,h:rnd()*TAU,dh:0,t:0,act:false,g:i%g,ph:rnd()*TAU,s:rr(.85,1.15),df:rr(.25,.75),alt:s.alt?rr(s.alt[0],s.alt[1]):0});
  }
}
// flames sit on top of the camp fire logs
const flameGeo=merge([P(Co(.28,.75,6),0xffffff,[0,.4,0]),P(Co(.16,.5,5),0xfff0b0,[0,.32,0])]);
const flames=new THREE.InstancedMesh(flameGeo,flameMat,4);flames.count=0;flames.frustumCulled=false;world.add(flames);

/* special placements */
const HUTS=[];{const vc=[[2,-24],[34,40],[48,-30]];for(let i=0;i<36;i++){const c=vc[i%3],a=rnd()*TAU,r=rr(3,13);HUTS.push({x:c[0]+Math.cos(a)*r,z:c[1]+Math.sin(a)*r,q:rnd(),r:rnd()*TAU,s:rr(.8,1.2)})}}
const BLD=[];for(let i=0;i<260;i++){const a=rnd()*TAU,r=Math.sqrt(rnd())*50,x=CITY.x+Math.cos(a)*r,z=CITY.z+Math.sin(a)*r;
  BLD.push({x,z,d:r,q:rnd(),r:Math.round(rnd()*4)*PI/2+.38,w:rr(2,4.5),dd:rr(2,4.5),h:rr(1.2,3.2),tall:rnd(),road:Math.min(...ROADS.map(p=>distPoly(x,z,p)),distPoly(x,z,RAIL))})}
BLD.sort((a,b)=>a.d-b.d);
function polyLen(pl){let L=0;for(let i=1;i<pl.length;i++)L+=Math.hypot(pl[i][0]-pl[i-1][0],pl[i][1]-pl[i-1][1]);return L}
function polyAt(pl,s){for(let i=1;i<pl.length;i++){const dx=pl[i][0]-pl[i-1][0],dz=pl[i][1]-pl[i-1][1],l=Math.hypot(dx,dz);if(s<=l){const t=s/l;return [pl[i-1][0]+dx*t,pl[i-1][1]+dz*t,Math.atan2(dx,dz)]}s-=l}const n=pl.length;return [pl[n-1][0],pl[n-1][1],Math.atan2(pl[n-1][0]-pl[n-2][0],pl[n-1][1]-pl[n-2][1])]}
const CARS=[];for(let i=0;i<30;i++){const r=i%2,L=polyLen(ROADS[r]);CARS.push({r,s:rnd()*L,L,dir:rnd()<.5?1:-1,v:rr(5,9),side:0})}
const TRAIN={s:0,dir:1,L:polyLen(RAIL)};

/* ------------------------------------------------------------------ presence of each species at age A */
function abund(s,L){if(!s.ab)return 1;const t=s.ab;if(L>=lg(t[0][0]))return t[0][1];for(let i=1;i<t.length;i++){const l1=lg(t[i][0]);if(L>=l1){const l0=lg(t[i-1][0]);return lerp(t[i-1][1],t[i][1],(l0-L)/(l0-l1))}}return t[t.length-1][1]}
function presence(s,A){
  if(worldIF){const p=ifPresenceBase(s,A);return (p===null?presenceRaw(s,A):p)*ifFactor(s,A)}
  return presenceRaw(s,A);
}
function presenceRaw(s,A){
  if(A<0){const L=lg(0);return sm((lg(s.from)-L)/(s.fi||.012))*(s.to>0?0:1)*abund(s,L)*futureFactor(s,-A)}
  const L=lg(A),fin=sm((lg(s.from)-L)/(s.fi||.012)),fout=s.to>0?sm((L-lg(s.to))/(s.fo||.004)):1;
  let p=fin*fout*abund(s,L);
  if(s.marine)p*=sstep(1.2e7,1.6e7,A);
  return p;
}
const urbRadius=A=>6+42*Math.pow(urb(A),.8);
// wild animals keep away from the town and its fields; in the present the far shore is their refuge
const wildR=A=>A>7000?0:A>150?22*farm(A):(urbRadius(A)+8+15*sstep(150,0,A))*humanFade(A);

/* habitat checks against the current terrain */
function valid(hab,x,z,A,wild){
  if(x<-96||x>96||z<-96||z>96)return false;
  const h=Hat(x,z),hw=h-W;
  if(wild&&A<7000&&Math.hypot(x-CITY.x,z-CITY.z)<wildR(A))return false;
  switch(hab){
    case 'sea':return W-h>2.5;
    case 'bed':case 'surf':return W-h>1.2;
    case 'shore':return hw>-1.5&&hw<2.5;
    case 'land':return hw>.5;
    case 'pasture':{const d=Math.hypot(x-CITY.x,z-CITY.z);return hw>.5&&d>urbRadius(A)+2&&d<80}
    case 'wet':return hw>.5&&hw<16;
    case 'air':return true;
    case 'town':return hw>.4&&Math.hypot(x-CITY.x,z-CITY.z)<urbRadius(A)-2;
  }
  return false;
}
function staticSuit(s,c,A){
  const h=Hat(c.x,c.z),hw=h-W,e=E;
  let v=0;
  switch(s.hab){
    case 'shallow':v=(W-h>.6&&W-h<10)?1-(W-h)/12:0;break;
    case 'seabed':v=(W-h>1.5&&W-h<26)?1:0;break;
    case 'coast':{const r=1.5+25*e.reach;v=hw>.3&&hw<r?1-hw/r:0;break}
    case 'swamp':v=hw>.3&&hw<18?(1-hw/22)*clamp(e.veg*1.3,0,1):0;break;
    case 'forest':v=hw>.4&&hw<2+55*e.reach?e.veg*(1-sstep(30,60,hw))*(1-.75*e.grass)*(1-e.dry*.75):0;break;
    case 'beach':v=hw>.2&&hw<5?.9*clamp(e.veg*1.2,0,1):0;break;
    case 'dry':v=hw>1.5?(s.grassy?e.grass:(.25+e.grass*.8))*(.4+.6*sstep(2,15,hw)):0;break;
  }
  if(v<=0)return 0;
  if(hw>0){
    if(e.ice>0)v*=1-clamp((e.ice*1.7-.65)+h/45,0,1);
    const ub=urb(A);if(ub>0&&Math.hypot(c.x-CITY.x,c.z-CITY.z)<urbRadius(A))v*=.15;
    const fa=farm(A);if(fa>0){const d=Math.hypot(c.x-CITY.x,c.z-CITY.z);if(d<80)v*=1-fa*.6}
    if(s.tree)v*=1-.85*FX.dead;
    if(s.fern)v*=1+2.5*FX.dead;
  }
  return v;
}
function setInst(mesh,j,x,y,z,ry,sc,sy,col,rx=0,rz=0){
  tmpO.position.set(x,y,z);tmpO.rotation.set(rx,ry,rz,'YXZ');tmpO.scale.set(sc,sy===undefined?sc:sy,sc);tmpO.updateMatrix();mesh.setMatrixAt(j,tmpO.matrix);if(col)mesh.setColorAt(j,col);
}
function updateStatics(A){
  for(const s of SPECIES){
    if(s.mv!=='st'||s.special)continue;
    const pr=presence(s,A),m=s.mesh;let k=0;s.vis.length=0;s.pres=pr;
    if(pr>.003)for(let i=0;i<s.n;i++){
      const c=s.cand[i],v=pr*staticSuit(s,c,A);
      if(v<=c.q)continue;
      const g=.55+.45*clamp((v-c.q)*4,0,1);
      setInst(m,k,c.x,Hat(c.x,c.z),c.z,c.r,s.size*c.s*g,undefined,s.colors[i]);s.vis.push(c);k++;
    }
    m.count=k;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;
  }
  // huts
  {const s=SPK.hut,m=s.mesh;let k=0;s.vis.length=0;const amt=(A>9000?0:A>500?lerp(.15,1,sstep(9000,500,A)):1)*humanFade(A)*ifCiv(A),R=urbRadius(A),ub=urb(A);s.pres=amt;
   for(let i=0;i<HUTS.length;i++){const c=HUTS[i];if(c.q>amt)continue;if(ub>0&&Math.hypot(c.x-CITY.x,c.z-CITY.z)<R+2)continue;if(ub>.3&&c.q>1.3-ub)continue;const h=Hat(c.x,c.z);if(h-W<.6)continue;
     setInst(m,k,c.x,h,c.z,c.r,s.size*c.s,undefined,s.colors[i]);s.vis.push(c);k++}
   m.count=k;m.instanceMatrix.needsUpdate=true}
  // buildings
  {const s=SPK.building,m=s.mesh;let k=0;s.vis.length=0;const ub=urb(A),R=urbRadius(A),tall=sstep(60,0,A);s.pres=ub;
   if(ub>0)for(let i=0;i<BLD.length;i++){const b=BLD[i];if(b.d>R-1)break;if(b.road<3)continue;if(b.q>.35+ub)continue;const h=Hat(b.x,b.z);if(h-W<.5)continue;
     const ht=b.h*(1+tall*b.tall*b.tall*9*Math.exp(-b.d/14));
     tmpO.position.set(b.x,h-.2,b.z);tmpO.rotation.set(0,b.r,0);tmpO.scale.set(b.w,ht,b.dd);tmpO.updateMatrix();m.setMatrixAt(k,tmpO.matrix);m.setColorAt(k,s.colors[i]);s.vis.push(b);k++}
   m.count=k;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true}
}

/* moving species */
function spawn(s,a,A){
  const gc=s.gc[a.g];
  if(!gc.ok||!valid(s.hab,gc.x,gc.z,A,s.wild)){
    gc.ok=false;
    for(let t=0;t<60;t++){const x=rr(-92,92),z=rr(-92,92);if(valid(s.hab,x,z,A,s.wild)){gc.x=x;gc.z=z;gc.ok=true;break}}
    if(!gc.ok)return false;
  }
  const R=s.mv==='fly'?40:8+s.size*2;
  for(let t=0;t<20;t++){const x=gc.x+rr(-R,R),z=gc.z+rr(-R,R);if(valid(s.hab,x,z,A,s.wild)){a.x=x;a.z=z;a.act=true;return true}}
  a.x=gc.x;a.z=gc.z;a.act=true;return true;
}
function updateCounts(A){
  for(const s of SPECIES){
    if(s.mv==='st')continue;
    let pr=presence(s,A);
    if(s.hab==='land'||s.hab==='wet'||s.hab==='shore')pr*=1-sstep(.5,.85,E.ice);
    if(s.hab==='sea'||s.hab==='bed')pr*=1-sstep(.7,.95,E.ice);
    s.pres=pr;s.want=Math.round(s.n*pr);
    if(pr>0&&pr<.5&&s.want===0)s.want=1;
    if(pr<.004)s.want=0;
  }
}
const turnTo=(h,t,k)=>{let d=((t-h+PI)%TAU+TAU)%TAU-PI;return h+clamp(d,-k,k)};
function stepAgents(dt,A,time){
  for(const s of SPECIES){
    if(s.mv==='st')continue;
    const m=s.mesh;let k=0;s.vis.length=0;
    const fly=s.mv==='fly',sw=s.mv==='swim',spd=s.spd*(s.mv==='crawl'?.8:1);
    for(const g of s.gc){// group centres drift
      if(!g.ok)continue;g.h+=(rnd()-.5)*dt*.8;const nx=g.x+Math.sin(g.h)*spd*.35*dt,nz=g.z+Math.cos(g.h)*spd*.35*dt;
      if(fly||valid(s.hab,nx,nz,A,s.wild)){g.x=clamp(nx,-90,90);g.z=clamp(nz,-90,90);if(Math.abs(nx)>=90||Math.abs(nz)>=90)g.h+=PI}else g.h+=PI*(.5+rnd());
    }
    for(let i=0;i<s.n;i++){
      const a=s.ag[i];
      if(i>=s.want){a.act=false;continue}
      if(!a.act||(!fly&&!valid(s.hab,a.x,a.z,A,s.wild))){if(!spawn(s,a,A))continue}
      a.t-=dt;if(a.t<0){a.t=rr(1,4);a.dh=(rnd()-.5)*(fly?.9:1.6);if(s.straight)a.dh=0}
      a.h+=a.dh*dt;
      const g=s.gc[a.g],dx=g.x-a.x,dz=g.z-a.z,d=Math.hypot(dx,dz),R=fly?45:6+s.size*2.2;
      if(!s.straight&&d>R)a.h=turnTo(a.h,Math.atan2(dx,dz),dt*1.5);
      const v=spd*(s.mv==='walk'||s.mv==='crawl'?(.6+.4*Math.sin(time*.3+a.ph)):1);
      const nx=a.x+Math.sin(a.h)*v*dt,nz=a.z+Math.cos(a.h)*v*dt;
      if(fly){a.x=nx;a.z=nz;if(Math.abs(a.x)>115||Math.abs(a.z)>115){if(s.straight){a.h=rnd()*TAU;a.x=-Math.sin(a.h)*110;a.z=-Math.cos(a.h)*110}else a.h=turnTo(a.h,Math.atan2(-a.x,-a.z),dt*3)}}
      else if(valid(s.hab,nx,nz,A,s.wild)){a.x=nx;a.z=nz}else{a.h+=PI*(.6+.8*rnd())}
      a.ph+=dt*(2+v*1.5);
      const hb=Hat(a.x,a.z);let y,rx=0,rz=0,ry=a.h;
      if(fly){y=Math.max(hb,W)+a.alt+Math.sin(a.ph*.3)*1.5;rz=-a.dh*.6}
      else if(sw){y=s.hab==='surf'?W+.05:Math.min(hb+(W-hb)*a.df,W-.8);ry+=Math.sin(a.ph)*.12}
      else if(s.hab==='shore'){y=Math.max(hb,W-.22*s.size)+Math.abs(Math.sin(a.ph))*.02*s.size}
      else y=hb+Math.abs(Math.sin(a.ph))*.03*s.size;
      setInst(m,k,a.x,y,a.z,ry,s.size*a.s,undefined,s.colors[i],rx,rz);a.y=y;s.vis.push(a);k++;
    }
    m.count=k;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;
  }
  // fires at the camps of the fire-using people
  fireLights.begin();
  {const s=SPK.fire,m=s.mesh;let k=0,f=0;s.vis.length=0;s.pres=0;
   if(A<1e6){for(const hs of[SPK.erectus,SPK.heidel,SPK.sapiens]){if(!hs.want)continue;for(const g of hs.gc){if(!g.ok||k>=4)continue;const y=Hat(g.x,g.z);if(y-W<.3)continue;
     setInst(m,k,g.x,y,g.z,0,s.size,undefined,null);const fl=1+.18*Math.sin(time*9+k*2)+.1*Math.sin(time*23+k);setInst(flames,f,g.x,y+.05,g.z,time*.5,s.size*fl,s.size*fl*1.15,null);s.vis.push({x:g.x,z:g.z,y});fireLights.push(g.x,y+1.4,g.z,LC.fire);k++;f++}}}
   fireLights.end();
   s.pres=k?1:0;m.count=k;flames.count=f;m.instanceMatrix.needsUpdate=true;flames.instanceMatrix.needsUpdate=true}
  // cars and the train
  movingLights.begin();
  {const s=SPK.car,m=s.mesh;let k=0;s.vis.length=0;const amt=A>95?0:Math.pow(sstep(95,0,A),1.3)*humanFade(A)*ifCiv(A)*ifIndustry();s.pres=amt;const want=Math.round(CARS.length*amt);
   for(let i=0;i<want;i++){const c=CARS[i];c.s+=c.dir*c.v*dt;if(c.s>c.L)c.s-=c.L;if(c.s<0)c.s+=c.L;const [x,z,h]=polyAt(ROADS[c.r],c.s);const ox=Math.cos(h)*.7*c.dir,oz=-Math.sin(h)*.7*c.dir;
     const hy=Hat(x+ox,z+oz);if(hy-W<.2)continue;const hh=h+(c.dir<0?PI:0),fx=Math.sin(hh)*1.3,fz=Math.cos(hh)*1.3;setInst(m,k,x+ox,hy,z+oz,hh,s.size,undefined,s.colors[i]);movingLights.push(x+ox+fx,hy+.45,z+oz+fz,LC.head);movingLights.push(x+ox-fx,hy+.45,z+oz-fz,LC.tail);s.vis.push({x,z});k++}
   m.count=k;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true}
  for(const a of SPK.plane.vis)if((time*1.3+a.ph)%1<.18)movingLights.push(a.x,a.y,a.z,LC.blink);
  movingLights.end();
  {const s=SPK.train,m=s.mesh;s.vis.length=0;s.pres=A<125?railAmt(A):0;
   if(A<125&&railAmt(A)>.5){TRAIN.s+=TRAIN.dir*6*dt;if(TRAIN.s>TRAIN.L-8){TRAIN.s=TRAIN.L-8;TRAIN.dir=-1}if(TRAIN.s<10){TRAIN.s=10;TRAIN.dir=1}
     const [x,z,h]=polyAt(RAIL,TRAIN.s);setInst(m,0,x,Hat(x,z),z,h+(TRAIN.dir<0?PI:0),s.size,undefined,null);s.vis.push({x,z});m.count=1}else m.count=0;
   m.instanceMatrix.needsUpdate=true}
}

