// タイピングする手（typing-hand）の台本の共通の部品（2026-10-31。piano-common.js を写して変えた）
// アプリの 3D の canvas だけを画面いっぱいにして開き、場面の表 SC で文・速さ・キーボード・見え方・カメラを決めて1コマずつ描かせる。
// 音は BGM ではなく、アプリと同じ打鍵の合成（sound.js の keySound）を、録画の音（OfflineAudioContext）の上で鳴らす（music.extra）
'use strict';
// 開く前の差しかえ: 3D の canvas を全画面に・アプリの時計（performance.now）をこちらの時刻に（一人称のゆれ・ほこりが、とびとびのコマでも同じ絵に）
const TY_INJECT = {
  dpr: 2, raf: true, top: true,
  pre: 'window.__clock = null; { const pn = performance.now.bind(performance); performance.now = () => window.__clock === null ? pn() : window.__clock; }'
    + "{ const st = document.createElement('style'); st.textContent = '#view{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;border-radius:0!important;z-index:50}'; (document.head || document.documentElement).appendChild(st); }",
};
const tyReady = w => w.__tyha && w.__tyha.S && w.__tyha.S.plan && w.document.getElementById('loading').hidden;

// 場面の表 SC = [{ a, b, text, kpm, kb, posture, timing, s0, speed, look, scene, cam, opt, mute }]
//   text: アプリの文の id か { id, keys, show }（例の打鍵）、kb: キーボードの種類（jis・laptop・split・typewriter など）
//   s0: 場面の始まりの文の時刻、look: 手の見え方（skin・ghost・xray・xraymus・muscles・bones）、cam: 'pov' か (u: 場面の中の秒) => { th, ph, d, tg }
//   opt: fingerMap・fingerNums・targets
const TY_LOOKS = { skin: {}, ghost: { ghost: true }, xray: { xray: true }, xraymus: { xray: true, muscles: true }, muscles: { muscles: true }, bones: { bones: true } };
let TYX = null, tyKb = 'jis', tyPost = 'mid';
const TY_PLANS = {};
const tyText = (w, sc) => typeof sc.text === 'string' ? TYX.TEXTS.find(x => x.id === sc.text) : sc.text;
const tyKey = sc => [typeof sc.text === 'string' ? sc.text : sc.text.id, sc.kpm || 400, sc.kb || 'jis', sc.posture || 'mid', sc.timing || 'model'].join('|');
// キーボードと指の構えを切りかえる（キーの見た目も作りなおす）
function tyUse(w, kb, posture, mesh) {
  if (kb !== tyKb) { w.eval(`useKeyboard('${kb}');`); if (mesh) w.eval('makeKeyboard(V.scene);'); tyKb = kb; }
  if (posture !== tyPost) { w.eval(`POSTURE = '${posture}'; HOME_TIP = null;`); tyPost = posture; }
}
function tySetup(w, SC) {
  TYX = w.eval('({ CAM, V, POV, setCam, applyScene, buildPlan, textToSong, runChecks, CHECKS, TEXTS, KEYS })');
  // 場面ごとの計画（手の動き）を先に作っておく（音にも使う）
  for (const sc of SC) {
    const k = tyKey(sc); if (TY_PLANS[k]) continue;
    tyUse(w, sc.kb || 'jis', sc.posture || 'mid', false);
    w.eval(`KPM = ${sc.kpm || 400}; TIMING = '${sc.timing || 'model'}';`);
    const song = TYX.textToSong(tyText(w, sc));
    TY_PLANS[k] = TYX.buildPlan(song); TY_PLANS[k].song = song;
  }
  w.eval("KPM = 400; TIMING = 'model';");
  tyUse(w, 'jis', 'mid', false);
}
const tyScene = (SC, t) => SC.find(s => t >= s.a && t < s.b) || SC[SC.length - 1];
const tySongT = (sc, t) => sc.s0 + (t - sc.a) * (sc.speed || 1);
const tyPlan = sc => TY_PLANS[tyKey(sc)];
let tyCur = null;
function tyRender(w, SC, t) {
  const sc = tyScene(SC, t), ty = w.__tyha, plan = tyPlan(sc);
  w.__clock = t * 1000;
  if (tyCur !== sc) {
    tyCur = sc;
    tyUse(w, sc.kb || 'jis', sc.posture || 'mid', true);
    ty.S.mode = 'watch'; ty.S.live = false; ty.S.playing = false;
    ty.S.plan = plan; ty.S.text = Object.assign({ show: '' }, tyText(w, sc));
    TYX.applyScene(sc.scene || 'studio');
    const lk = TY_LOOKS[sc.look || 'skin'];
    for (const k of ['ghost', 'xray', 'muscles', 'bones']) ty.OPT[k] = !!lk[k];
    Object.assign(ty.OPT, { fingerMap: false, fingerNums: false, targets: false }, sc.opt || {});
    if (sc.cam === 'pov') { TYX.setCam('pov'); TYX.POV.init = false; TYX.POV.last = 0; }
  }
  if (sc.cam !== 'pov') {
    const c = sc.cam(t - sc.a);
    TYX.CAM.pov = false;
    if (TYX.V.cam.fov !== (c.fov || 36)) { TYX.V.cam.fov = c.fov || 36; TYX.V.cam.updateProjectionMatrix(); }
    Object.assign(TYX.CAM, { th: c.th, ph: c.ph, d: c.d, tg: c.tg.slice() });
  }
  const s = Math.max(0, Math.min(plan.end + 0.8, tySongT(sc, t)));
  ty.S.t = s; ty.S.prevT = s;
  w.step();
}
// カメラの道具: 2つの向きのあいだを場面の中でゆっくり動く
const camLerp = (A, B, dur) => u => { const k = ease(u / dur); return { th: lerp(A.th, B.th, k), ph: lerp(A.ph, B.ph, k), d: Math.exp(lerp(Math.log(A.d), Math.log(B.d), k)), tg: A.tg.map((v, i) => lerp(v, B.tg[i], k)), fov: A.fov }; };
const camFix = A => () => A;

// 検査の結果（アプリの右のパネルの表と同じ計算・同じ印）
function tyChecks(sc) {
  const plan = tyPlan(sc), R = TYX.runChecks(plan), mark = { ok: '◯', warn: '△', ng: '✕' };
  const fmt = (c, r) => c.unit === '%' ? r.v.toFixed(1) : r.v < 10 ? r.v.toFixed(1) : Math.round(r.v);
  return { lines: TYX.CHECKS.map(c => `${mark[R[c.id].grade]}  ${c.name}  ${fmt(c, R[c.id])} ${c.unit}`), miss: plan.notes.filter(n => n.miss) };
}

// 音: 場面ごとに、その場面で押す・離すキーの音をアプリと同じ合成で鳴らす（keySound は AC.currentTime の 25ms 先に鳴らすので、時刻だけ差しかえる）
function tyAudio(w, SC, gain = 1) {
  return async (ctx, dest) => {
    // 打鍵音は山が鋭く、AAC にするとトゥルーピークが -1 dBTP をこえた（ショート -0.7）→ 動画の音だけ、やわらかく圧縮して山を下げる（アプリの音はそのまま）
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -26; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.08;
    const master = ctx.createGain(); master.gain.value = gain; master.connect(comp); comp.connect(dest);
    let T = 0;
    const P = new Proxy(ctx, { get(o, k) { if (k === 'currentTime') return T; if (k === 'state') return 'running'; const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; } });
    const N = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate), d = N.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 出口はアプリと同じ（120Hz より下を切る・5kHz で丸める）。割れ止めは録画の側（LOUD）にまかせる
    const out = ctx.createBiquadFilter(); out.type = 'highpass'; out.frequency.value = 120; out.Q.value = 0.7;
    const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 5000; soft.Q.value = 0.5;
    out.connect(soft); soft.connect(master);
    w.__actx = P; w.__tyN = N; w.__tyO = out;
    const kb0 = tyKb, p0 = tyPost;
    w.eval('AC = window.__actx; NOISE = window.__tyN; OUT = window.__tyO;');
    try {
      for (const sc of SC) {
        if (sc.mute) continue;
        tyUse(w, sc.kb || 'jis', sc.posture || 'mid', false);
        const plan = tyPlan(sc), sp = sc.speed || 1;
        for (const n of plan.notes) {
          if (n.miss) continue;
          for (const [tt, up] of [[n.t0, false], [n.t1, true]]) {
            const vt = sc.a + (tt - sc.s0) / sp;
            if (vt < sc.a || vt >= sc.b - 0.05) continue;
            T = vt - 0.025; w.keySound(n.m, up, sp);
          }
        }
      }
    } finally { w.eval('AC = null; NOISE = null; OUT = null;'); tyUse(w, kb0, p0, false); }
  };
}
