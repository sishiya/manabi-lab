'use strict';
'use strict';
const $=s=>document.querySelector(s);
const tok=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const COL={};['bg','panel','raise','line','fg','mute','dim','wave','hit','classic','good'].forEach(k=>COL[k]=tok('--'+k));
function rgba(hex,a){const n=parseInt(hex.replace('#',''),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;}
function fit(c){
  const r=c.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1);
  const w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  const ctx=c.getContext('2d');ctx.setTransform(d,0,0,d,0,0);
  return {ctx,w:r.width,h:r.height,d};
}
function gauss(){let u=0;while(!u)u=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*Math.random());}
function makeCdf(a){const c=new Float64Array(a.length);let s=0;for(let i=0;i<a.length;i++){s+=a[i];c[i]=s;}return c;}
function sampleCdf(c){const r=Math.random()*c[c.length-1];let lo=0,hi=c.length-1;while(lo<hi){const m=(lo+hi)>>1;if(c[m]<r)lo=m+1;else hi=m;}return lo;}
function seg(id,cb){const el=$(id);el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;el.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));cb(b.dataset.v);});}
function range(id,fmt,cb){const el=$(id),o=$(id+'O');const up=()=>{o.textContent=fmt(+el.value);cb&&cb(+el.value);};el.addEventListener('input',up);o.textContent=fmt(+el.value);return el;}
function setRange(id,v,fmt){const el=$(id);el.value=v;$(id+'O').textContent=fmt(+el.value);}
const pct=(v,dg=1)=>(v*100).toFixed(dg)+'%';
function txt(ctx,s,x,y,col,size=11,align='left',font='mono'){ctx.fillStyle=col;ctx.font=`${size}px ${font==='mono'?tok('--f-mono'):tok('--f-body')}`;ctx.textAlign=align;ctx.fillText(s,x,y);}
function dashLine(ctx,pts,col,w=1.5,dash=[5,4]){ctx.save();ctx.setLineDash(dash);ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();ctx.restore();}

const EXPS={};

