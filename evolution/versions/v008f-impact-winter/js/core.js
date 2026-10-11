'use strict';
// utilities, noise, time scale (slider ↔ age)
window.__evErr=[];
window.addEventListener('error',e=>window.__evErr.push(String(e.message)));
const $=id=>document.getElementById(id);
const PI=Math.PI, TAU=PI*2;
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const lerp=(a,b,t)=>a+(b-a)*t;
const sm=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const sstep=(a,b,x)=>sm((x-a)/(b-a));
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd=mulberry(20261003);
const rr=(a,b)=>a+(b-a)*rnd();

/* ------------------------------------------------------------------ noise */
function hash2(x,y){let h=Math.imul(x,374761393)+Math.imul(y,668265263)|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296}
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi),b=hash2(xi+1,yi),c=hash2(xi,yi+1),d=hash2(xi+1,yi+1);return (a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v)*2-1}
function fbm(x,y,o){let s=0,a=.5,f=1,n=0;for(let i=0;i<o;i++){s+=a*vnoise(x*f+i*17.3,y*f-i*9.1);n+=a;a*=.5;f*=2.03}return s/n}

/* ------------------------------------------------------------------ time scale */
const AMAX=4.6e9;
const lg=A=>Math.log10(A+10);
// slider position ↔ age. Anchors give every chapter of the story a fair share of the bar.
const ANCH=[[0,4.6e9],[.02,4.567e9],[.04,4.51e9],[.06,4.45e9],[.10,4.0e9],[.15,3.5e9],[.20,2.5e9],[.235,2.0e9],[.27,1.0e9],[.30,7.2e8],[.33,6.35e8],[.36,5.39e8],[.41,4.44e8],[.445,4.19e8],[.48,3.59e8],[.515,2.99e8],[.55,2.52e8],[.585,2.01e8],[.615,1.45e8],[.645,6.65e7],[.665,6.55e7],[.70,2.3e7],[.745,7e6],[.785,2.6e6],[.825,1e6],[.855,3e5],[.88,7e4],[.905,1.2e4],[.93,5000],[.95,2000],[.97,500],[.988,120],[1,0]];
const ANL=ANCH.map(a=>[a[0],lg(a[1])]);
function pastU2A(u){u=clamp(u,0,1);for(let i=1;i<ANL.length;i++)if(u<=ANL[i][0]){const t=(u-ANL[i-1][0])/(ANL[i][0]-ANL[i-1][0]);return Math.max(0,10**lerp(ANL[i-1][1],ANL[i][1],t)-10)}return 0}
function pastA2u(A){const L=lg(A);if(L>=ANL[0][1])return 0;for(let i=1;i<ANL.length;i++)if(L>=ANL[i][1]){const t=(L-ANL[i-1][1])/(ANL[i][1]-ANL[i-1][1]);return lerp(ANL[i-1][0],ANL[i][0],t)}return 1}
// The future is written as a negative age (A = −F, F years from now). It runs to 5 billion years ahead.
const FMAX=5e9,UP=.8;// share of the bar given to the past in the event scale
const FANCH=[[0,0],[.10,80],[.2,300],[.3,3000],[.4,3e4],[.48,2e5],[.56,2e6],[.65,1.5e7],[.74,1.2e8],[.84,6e8],[.92,1.6e9],[1,FMAX]].map(a=>[a[0],lg(a[1])]);
function futU2F(u){u=clamp(u,0,1);for(let i=1;i<FANCH.length;i++)if(u<=FANCH[i][0]){const t=(u-FANCH[i-1][0])/(FANCH[i][0]-FANCH[i-1][0]);return Math.max(0,10**lerp(FANCH[i-1][1],FANCH[i][1],t)-10)}return FMAX}
function futF2u(F){const L=lg(F);for(let i=1;i<FANCH.length;i++)if(L<=FANCH[i][1]){const t=(L-FANCH[i-1][1])/(FANCH[i][1]-FANCH[i-1][1]);return lerp(FANCH[i-1][0],FANCH[i][0],t)}return 1}
function u2A_ev(u){u=clamp(u,0,1);return u<=UP?pastU2A(u/UP):-futU2F((u-UP)/(1-UP))}
function A2u_ev(A){return A>=0?UP*pastA2u(A):UP+(1-UP)*futF2u(-A)}
let scaleMode='ev';
const u2A=u=>scaleMode==='ev'?u2A_ev(u):AMAX-clamp(u,0,1)*(AMAX+FMAX);
const A2u=A=>scaleMode==='ev'?A2u_ev(A):(AMAX-A)/(AMAX+FMAX);
const NOW_U=()=>A2u(0);

