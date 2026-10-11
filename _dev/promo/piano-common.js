// ピアノを弾く手（piano-hand）の台本の共通の部品
// アプリの 3D の canvas だけを画面いっぱいにして開き、場面の表 SC で曲・曲の時刻・見え方・カメラを決めて1コマずつ描かせる。
// 音はアプリと同じピアノの合成（VOICES.piano）を、録画の音（OfflineAudioContext）の上で鳴らす（music.extra）
'use strict';
// 開く前の差しかえ: 3D の canvas を全画面に・アプリの時計（performance.now）をこちらの時刻に（一人称のゆれ・ほこりが、とびとびのコマでも同じ絵に）
const PH_INJECT = {
  dpr: 2, raf: true,
  pre: 'window.__clock = null; { const pn = performance.now.bind(performance); performance.now = () => window.__clock === null ? pn() : window.__clock; }'
    + "{ const st = document.createElement('style'); st.textContent = '#view{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;border-radius:0!important;z-index:50}'; document.head.appendChild(st); }",
};
const phReady = w => w.__ph && w.__ph.S && w.__ph.S.plan && w.document.getElementById('loading').hidden;

// 場面の表 SC = [{ a, b, song, s0, speed, look, scene, posture, stroke, cam, opt }]
//   s0: 場面の始まりの曲の時刻、look: 手の見え方（skin・ghost・xray・xraymus・muscles・bones）、cam: 'pov' か (u: 場面の中の秒) => { th, ph, d, tg }
//   opt: ノーツの印など（fingerNums・notes・keyLabels・noteNums）
const PH_LOOKS = { skin: {}, ghost: { ghost: true }, xray: { xray: true }, xraymus: { xray: true, muscles: true }, muscles: { muscles: true }, bones: { bones: true } };
let PHX = null;
const PH_PLANS = {};
const phKey = sc => [sc.song, sc.posture || 'mid', sc.stroke || 'arm'].join('|');
function phSetup(w, SC) {
  PHX = w.eval('({ CAM, V, POV, setCam, setViewPlan, applyScene, buildPlan, SONGS, VOICES, VEL_MF })');
  // 曲ごとの計画（運指と手の動き）を先に作っておく（音にも使う）
  for (const sc of SC) {
    const k = phKey(sc); if (PH_PLANS[k]) continue;
    w.eval(`POSTURE = '${sc.posture || 'mid'}'; STROKE = '${sc.stroke || 'arm'}';`);
    PH_PLANS[k] = PHX.buildPlan(PHX.SONGS.find(s => s.id === sc.song));
  }
  w.eval("POSTURE = 'mid'; STROKE = 'arm';");
}
const phScene = (SC, t) => SC.find(s => t >= s.a && t < s.b) || SC[SC.length - 1];
const phSongT = (sc, t) => sc.s0 + (t - sc.a) * (sc.speed || 1);
let phCur = null;
function phRender(w, SC, t) {
  const sc = phScene(SC, t), ph = w.__ph, plan = PH_PLANS[phKey(sc)];
  w.__clock = t * 1000;
  if (phCur !== sc) {
    phCur = sc;
    ph.S.plan = plan; PHX.setViewPlan(plan);
    PHX.applyScene(sc.scene || 'studio');
    const lk = PH_LOOKS[sc.look || 'skin'];
    for (const k of ['ghost', 'xray', 'muscles', 'bones']) ph.OPT[k] = !!lk[k];
    Object.assign(ph.OPT, { notes: true, keyLabels: true, noteNums: true, fingerNums: false, targets: false }, sc.opt || {});
    if (sc.cam === 'pov') { PHX.setCam('pov'); PHX.POV.init = false; PHX.POV.last = 0; }
  }
  if (sc.cam !== 'pov') {
    const c = sc.cam(t - sc.a);
    PHX.CAM.pov = false;
    if (PHX.V.cam.fov !== (c.fov || 36)) { PHX.V.cam.fov = c.fov || 36; PHX.V.cam.updateProjectionMatrix(); }
    Object.assign(PHX.CAM, { th: c.th, ph: c.ph, d: c.d, tg: c.tg.slice() });
  }
  const s = Math.min(plan.end + 0.8, phSongT(sc, t));
  ph.S.t = s; ph.S.prevT = s;
  w.step();
}
// カメラの道具: 2つの向きのあいだを場面の中でゆっくり動く
const camLerp = (A, B, dur) => u => { const k = ease(u / dur); return { th: lerp(A.th, B.th, k), ph: lerp(A.ph, B.ph, k), d: Math.exp(lerp(Math.log(A.d), Math.log(B.d), k)), tg: A.tg.map((v, i) => lerp(v, B.tg[i], k)), fov: A.fov }; };
const camFix = A => () => A;

// 音: 場面ごとに、その場面で押す音をアプリと同じピアノの合成で鳴らす。場面の終わりで音を消す（次の場面へもちこさない）
function phAudio(w, SC, gain = 0.8) {
  return async (ctx, dest) => {
    const master = ctx.createGain(); master.gain.value = gain; master.connect(dest);
    // 小さな部屋の響き
    const ir = ctx.createBuffer(2, SR * 1.2, SR);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4); }
    const verb = ctx.createConvolver(); verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.18; verb.connect(wet); wet.connect(master);
    w.__actx = ctx; w.eval('AC = window.__actx; NOISE = null;');
    try {
      for (const sc of SC) {
        if (sc.mute) continue;
        const plan = PH_PLANS[phKey(sc)], sp = sc.speed || 1;
        const bus = ctx.createGain(); bus.connect(master); bus.connect(verb);
        bus.gain.setValueAtTime(1, sc.a); bus.gain.setValueAtTime(1, Math.max(sc.a, sc.b - 0.3)); bus.gain.linearRampToValueAtTime(0, sc.b);
        for (const n of plan.notes) {
          if (n.miss) continue;
          const vt = sc.a + (n.t0 - sc.s0) / sp;
          if (vt < sc.a || vt >= sc.b - 0.05) continue;
          const len = ((n.ts || n.t1) - n.t0) / sp;
          const f0 = 440 * Math.pow(2, (n.m - 69) / 12), L = Math.max(0.08, Math.min(len || 1, 8)), vel = n.vel || PHX.VEL_MF;
          const v = Math.min(1, Math.max(0.05, vel / 127)), amp = 0.14 * Math.pow(vel / PHX.VEL_MF, 1.5);
          PHX.VOICES.piano(n.m, f0, vt, L, v, amp, bus);
        }
      }
    } finally { w.eval('AC = null; NOISE = null; MASTER = null;'); }
  };
}
