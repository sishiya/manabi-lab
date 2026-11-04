// CSI の計算の確かめ（PLAN.md 段階A）。GPU が要るので node ではなくブラウザで動かす:
// http://localhost:<port>/wifi-wave/ を開き、コンソールで
//   const s=document.createElement('script');s.src='tools/sense-verify.js';document.body.append(s);
// 結果は console.table と window.__senseVerify に入る。数秒かかる。
(function(){
  const s=__ww.sense, R=s.SROOM, keep=JSON.stringify(R), fs=s.subFreqs(), out={};
  const unwrap=ph=>{ph=ph.slice();for(let i=1;i<ph.length;i++){while(ph[i]-ph[i-1]>Math.PI)ph[i]-=2*Math.PI;while(ph[i]-ph[i-1]<-Math.PI)ph[i]+=2*Math.PI;}return ph;};
  const meanAbs=(a,b)=>{let d=0;for(let k=0;k<a.length;k++)d+=Math.abs(a[k]-b[k]);return d/a.length;};

  // 1) 何もない所: 振幅は 2次元の広がり（1/√r）、帯域の中で平ら、遅れ = 距離/光の速さ
  R.empty=true; R.person=null; R.router=[.8,1.92];
  const free=[]; let a0=null;
  for(const x of [1.6,2.4,3.2,4.0]){
    R.rx=[x,1.92]; const c=s.csi({steps:6000}), d=x-.8, ph=unwrap(c.phase);
    const delay=-(ph[51]-ph[0])/(2*Math.PI*(fs[51]-fs[0]))*1e9;
    if(a0===null) a0={d,amp:c.amp[26]};
    free.push({'距離 m':d.toFixed(1),'振幅 dB':c.amp[26].toFixed(2),'1/√r なら':(a0.amp-10*Math.log10(d/a0.d)).toFixed(2),
      '帯域の中の差 dB':(Math.max(...c.amp)-Math.min(...c.amp)).toFixed(3),'遅れ ns':delay.toFixed(2),'距離/c ns':(d/2.998e8*1e9).toFixed(2)});
  }
  out.free=free;

  // 2) 部屋の中: パルスの CSI の中央 ＝ 連続波の計算、3) N と 1.5N ステップの差
  R.empty=false; R.router=[.8,.8]; R.rx=[4.0,3.0];
  out.room=[null,[2.4,1.9],[3.6,2.6]].map(p=>{
    R.person=p; const c=s.csi(), cw=s.cwAt(2.437e9,24000), c15=s.csi({steps:Math.round(c.steps*1.5)});
    const h0={re:(c.H[25].re+c.H[26].re)/2,im:(c.H[25].im+c.H[26].im)/2};
    let dmax=0; for(let k=0;k<52;k++) dmax=Math.max(dmax,Math.abs(c.amp[k]-c15.amp[k]));
    return {'人':p?p.join(','):'なし','パルス dB':(20*Math.log10(Math.hypot(h0.re,h0.im))).toFixed(2),'連続波 dB':cw.db.toFixed(2),
      '位相の差 °':((Math.atan2(h0.im,h0.re)-Math.atan2(cw.h.im,cw.h.re))*180/Math.PI).toFixed(2),'ステップ':c.steps,'N と 1.5N の差 dB':dmax.toFixed(3),'1回 ms':c.ms.toFixed(0)};
  });

  // 4) 人を 1マス（0.75cm）ずつ動かしたときの変化（52本の平均）と、1回の時間
  R.person=null; const empty=s.csi(); let prev=null, t=0; out.walk=[];
  for(let i=0;i<=16;i++){
    R.person=[1.5+i*.0075,2.4]; const c=s.csi(); t+=c.ms;
    out.walk.push({'動いた cm':(i*.75).toFixed(2),'1マスの変化 dB':prev?meanAbs(c.amp,prev.amp).toFixed(3):'-','空の部屋との差 dB':meanAbs(c.amp,empty.amp).toFixed(2)});
    prev=c;
  }
  out.msPerMeasure=t/17;
  Object.assign(R,JSON.parse(keep));
  console.log('1) 何もない所');console.table(out.free);
  console.log('2) 3) 部屋の中');console.table(out.room);
  console.log('4) 1マスずつ歩く  1回 '+out.msPerMeasure.toFixed(0)+' ms');console.table(out.walk);
  window.__senseVerify=out;
})();
