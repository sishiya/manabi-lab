'use strict';
/* ================= 言語（I18N.md） ================= */
document.title=L('量子の実験室','Quantum Lab');
['#slitRun','#tunPause','#polRun','#bellRun'].forEach(id=>$(id).textContent=L('一時停止','Pause'));
document.querySelectorAll('#langsw button').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.l===LANG);b.onclick=()=>{if(b.dataset.l!==LANG)setLang(b.dataset.l);};});
$('#tabs').setAttribute('aria-label',L('実験','Experiments'));
$('#bellPairs').setAttribute('aria-label',L('最近の結果','Recent results'));
[['#slitApp','二重スリットの装置を横から見た図','Side view of the double-slit setup'],['#slitScreen','スクリーンに当たった点と分布','Dots on the screen and their distribution'],
 ['#tunCv','壁に向かう波束の図','A wave packet heading toward a wall'],['#polCv','光子が偏光板を通る図','Photons passing through polarizers'],
 ['#bellCv','光子のペアがアリスとボブに届く図','Photon pairs reaching Alice and Bob'],['#bellChart','角度の差と一致率のグラフ','Graph of match rate against angle difference'],
 ['#unX','位置の確率分布','Probability distribution of position'],['#unP','運動量の確率分布','Probability distribution of momentum']].forEach(([id,ja,en])=>$(id).setAttribute('aria-label',L(ja,en)));

/* ================= タブとループ ================= */
let active='slit';
function show(name){
  if(!EXPS[name])name='slit';active=name;
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===name?'true':'false'));
  document.querySelectorAll('.exp').forEach(s=>s.hidden=s.dataset.exp!==name);
  try{localStorage.setItem('qlab-tab',name);}catch(e){}
  EXPS[name].draw();
}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b){show(b.dataset.tab);try{history.replaceState(null,'','#'+b.dataset.tab);}catch(e){}}});
let first=(location.hash||'').slice(1);if(!EXPS[first]){try{first=localStorage.getItem('qlab-tab')||'slit';}catch(e){first='slit';}}
show(first);
window.__qx={EXPS,show,get active(){return active;},err:[]};
let last=performance.now();
function loop(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  try{EXPS[active].step(dt);EXPS[active].draw();}catch(e){window.__qx.err.push(String(e&&e.stack||e));}
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener('resize',()=>EXPS[active].draw());
