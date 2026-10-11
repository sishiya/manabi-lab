'use strict';
/* ---------- あなたと体の状態 ---------- */
const MATS={
 rbc:{n:'赤血球',d:'直径約7〜8μm、真ん中がくぼんだ円盤。ヘモグロビンで酸素を運ぶ。肺で明るい赤に、全身で酸素を渡すと暗い赤になる。寿命は約120日。'},
 clot:{n:'血栓（脚の静脈）',d:'長く座っていて脚の静脈にできた血のかたまり（大きさは目安で約8mm）。流れに乗って心臓を通り、肺動脈に詰まると肺塞栓症になる。急な息苦しさや胸の痛みは、すぐ救急へ。'},
 cath:{n:'カテーテル',d:'足の付け根の動脈から入れる細い管。血液の流れと逆向きに大動脈をさかのぼり、弁を押し広げて心臓の中へ。'}
};
const ENTRIES={femv:['脚の静脈','大腿静脈から。静脈血（酸素少なめ）'],ra:['右心房','心臓の入口から'],femart:['脚の動脈','大腿動脈から（カテーテル検査と同じ入口）']};
const ACTS={rest:['安静','心拍 約65回/分、血圧 約120/75'],ex:['運動中','心拍 約140回/分、脚の筋肉が酸素を大量に使う']};
const SIM={on:false,t:0,phase:0,hr:65,hrT:65,spo2:.98,ex:false,beats:0,s1T:9,s2T:9,ecg:[],ecgT:0,capT:0,hintT:0,destSel:'auto'};
let P=null;
const so2Color=s=>mixc([.38,.04,.1],[.86,.08,.06],clamp((s-.6)/.38,0,1));
const so2Name=s=>s>.94?'動脈血（明るい赤）':s>.8?'混ざった血':'静脈血（暗い赤）';
function heartWave(ph){ // 弁と心臓の動き
  const vs=ph>=.12&&ph<.5?Math.sin(Math.PI*(ph-.12)/.38):0;
  const as=ph<.12?Math.sin(Math.PI*ph/.12):0;
  const aw=ph>=.15&&ph<.6?Math.sin(Math.PI*(ph-.15)/.45):0;
  return {vs,as,aw,avOpen:ph>=.5||ph<.12,slOpen:ph>=.17&&ph<.45};
}
function ecgAt(ph){
  const g=(c,w,a)=>a*Math.exp(-Math.pow((ph-c)/w,2));
  return g(.06,.025,.15)-g(.115,.006,.12)+g(.125,.008,1)-g(.135,.007,.25)+g(.36,.045,.3);
}

