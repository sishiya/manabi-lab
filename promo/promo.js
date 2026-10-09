// 紹介動画づくりの共通部分。アプリごとのページは台本だけを書いて promoStart(cfg) を呼ぶ。
// cfg = { name, out, src, iw, ih, dur, music, ready(w) → bool, setup(w) → canvas, renderAt(t, w) [async 可], overlay(g, t, w) }
// アプリを iframe で開き、1コマずつ描いて字幕を重ね、BGM を合成して mp4（H.264＋AAC）にする。
'use strict';
const PW = 1920, PH = 1080, FPS = 30, SR = 48000;
const FONT = '"Yu Gothic UI", "Meiryo", sans-serif';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
// t が [a, b] の中で 0→1→0（入り・出の時間 f 秒）
const fade = (t, a, b, f = 0.6) => clamp(Math.min((t - a) / f, (b - t) / f), 0, 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 文字 ----
function txt(g, s, x, y, size, color, bold) {
  g.font = (bold ? 'bold ' : '') + size + 'px ' + FONT; g.fillStyle = color; g.fillText(s, x, y);
}
function prep(g) { g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 18; }
// 題名（最初）
function drawTitle(g, t, a, b, title, sub) {
  const f = fade(t, a, b, 0.8); if (f <= 0) return;
  prep(g); g.globalAlpha = f;
  txt(g, title, PW / 2, PH * 0.80, 96, '#fff', true);
  if (sub) txt(g, sub, PW / 2, PH * 0.80 + 86, 40, '#f2c79a');
  g.globalAlpha = 1; g.shadowBlur = 0;
}
// 字幕（下）。caps = [{ a, b, main, sub }]
function drawCaps(g, t, caps) {
  prep(g);
  for (const c of caps) {
    const f = fade(t, c.a, c.b); if (f <= 0) continue;
    g.globalAlpha = f;
    txt(g, c.main, PW / 2, PH - (c.sub ? 170 : 120), 64, '#fff', true);
    if (c.sub) txt(g, c.sub, PW / 2, PH - 92, 38, '#f2c79a');
  }
  g.globalAlpha = 1; g.shadowBlur = 0;
}
// 終わりの画面
function drawEnd(g, t, a, title, line, credit) {
  const f = clamp((t - a) / 0.8, 0, 1); if (f <= 0) return;
  g.shadowBlur = 0; g.globalAlpha = f * 0.75; g.fillStyle = '#000'; g.fillRect(0, 0, PW, PH);
  prep(g); g.globalAlpha = f;
  txt(g, title, PW / 2, PH * 0.40, 88, '#fff', true);
  txt(g, line, PW / 2, PH * 0.40 + 100, 42, '#f2c79a');
  if (credit) txt(g, credit, PW / 2, PH * 0.40 + 190, 28, '#aaa');
  g.globalAlpha = 1; g.shadowBlur = 0;
}

// ---- 音（ブラウザで合成。著作権の心配なし）----
// music = { style, root, cues, quiet }
//   style 'drone'   : 低い持続音（暗い・宇宙。root は低い音の Hz、既定 55）
//   style 'journey' : 明るい和音＋アルペジオ（旅・歴史。root は和音のいちばん下の Hz、既定 130.8 = ド）
//   cues  [{ t, type: 'boom' }] : その時刻に低い「ドン」
//   quiet [[a, b]]             : その間はアルペジオを止め、和音を暗くする
async function makeAudio(dur, music = {}) {
  const ctx = new OfflineAudioContext(2, SR * dur, SR);
  const master = ctx.createGain(); master.connect(ctx.destination);
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.22, 3);
  master.gain.setValueAtTime(0.22, dur - 4);
  master.gain.linearRampToValueAtTime(0, dur - 0.2);
  // 残響（減衰する雑音をたたみこむ）
  const ir = ctx.createBuffer(2, SR * 2.5, SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
  const verb = ctx.createConvolver(); verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.5; verb.connect(wet); wet.connect(master);
  const bus = ctx.createGain(); bus.connect(master); bus.connect(verb);
  const noise = ctx.createBuffer(1, SR * 2, SR), nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const quiet = music.quiet || [], isQuiet = t => quiet.some(([a, b]) => t >= a && t < b);

  if ((music.style || 'drone') === 'drone') {
    const root = music.root || 55;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7; lp.connect(bus);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain(); lfoG.gain.value = 500; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    // 根音・5度・オクターブを少しずらして重ね、左右に分ける
    [[1, -0.6], [1.005, 0.6], [1.498, -0.3], [1.503, 0.3], [2, 0.5], [2.007, -0.5], [2.996, 0]].forEach(([m, pan], i) => {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = root * m;
      const gg = ctx.createGain(); gg.gain.value = m < 1.1 ? 0.5 : 0.22;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      o.connect(gg); gg.connect(p); p.connect(lp); o.start();
    });
    // 遠い風のような雑音
    const ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.05;
    ns.connect(bp); bp.connect(ng); ng.connect(master); ns.start();
  } else {
    const root = music.root || 130.81, hz = s => root * Math.pow(2, s / 12);
    // ド→ラ→ファ→ソ（I–vi–IV–V）。暗い所はラ→ミ（vi–iii）
    const PROG = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], DARK = [[-3, 0, 3], [-8, -5, -1]];
    const beat = 60 / 84, bar = beat * 4, chordLen = bar * 2;
    const pad = ctx.createBiquadFilter(); pad.type = 'lowpass'; pad.frequency.value = 1100; pad.connect(bus);
    for (let k = 0, t = 0; t < dur; k++, t += chordLen) {
      const dark = isQuiet(t + chordLen / 2), ch = dark ? DARK[k % 2] : PROG[k % 4];
      // 和音（ゆっくりふくらむパッド）。いちばん下にオクターブ下の根音
      [...ch, ch[0] - 12].forEach((s, i) => {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(s); o.detune.value = det;
          const g = ctx.createGain(), v = (i === 3 ? 0.10 : 0.05) * (dark ? 0.8 : 1);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 1.2);
          g.gain.setValueAtTime(v, t + chordLen - 0.4); g.gain.linearRampToValueAtTime(0, t + chordLen + 0.8);
          const p = ctx.createStereoPanner(); p.pan.value = det < 0 ? -0.4 : 0.4;
          o.connect(g); g.connect(p); p.connect(pad); o.start(t); o.stop(t + chordLen + 1);
        }
      });
      // アルペジオ（8分音符。和音の音を1オクターブ上で上下に）
      const pat = [0, 1, 2, 1, 0, 1, 2, 3];
      for (let n = 0; n < 16; n++) {
        const tn = t + n * beat / 2;
        if (tn >= dur - 3 || tn < 2.5 || isQuiet(tn)) continue;
        const s = pat[n % 8] === 3 ? ch[0] + 12 : ch[pat[n % 8]];
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(s + 12);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, tn); g.gain.linearRampToValueAtTime(0.09, tn + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, tn + 0.9);
        const p = ctx.createStereoPanner(); p.pan.value = (n % 2 ? 0.3 : -0.3);
        o.connect(g); g.connect(p); p.connect(bus); o.start(tn); o.stop(tn + 1);
      }
    }
  }
  // 「ドン」: 下がっていく低い音＋こもった雑音
  for (const c of music.cues || []) {
    if (c.type !== 'boom') continue;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, c.t); o.frequency.exponentialRampToValueAtTime(28, c.t + 2.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, c.t); g.gain.linearRampToValueAtTime(1.6, c.t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, c.t + 3.5);
    o.connect(g); g.connect(bus); o.start(c.t); o.stop(c.t + 3.6);
    const ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1500, c.t); lp.frequency.exponentialRampToValueAtTime(120, c.t + 3);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0, c.t); ng.gain.linearRampToValueAtTime(0.9, c.t + 0.05); ng.gain.exponentialRampToValueAtTime(0.001, c.t + 4);
    ns.connect(lp); lp.connect(ng); ng.connect(bus); ns.start(c.t); ns.stop(c.t + 4.1);
  }
  return ctx.startRendering();
}

async function pickVideoCodec() {
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']) {
    const c = { codec, width: PW, height: PH, bitrate: 10e6, framerate: FPS };
    if ((await VideoEncoder.isConfigSupported(c)).supported) return c;
  }
  throw new Error('このブラウザでは H.264 で書き出せません');
}
async function pickAudioCodec() {
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const c = { codec, sampleRate: SR, numberOfChannels: 2, bitrate: 160000 };
    if ((await AudioEncoder.isConfigSupported(c)).supported) return [c, mux];
  }
  throw new Error('音を書き出せません');
}

function promoStart(cfg) {
  document.title = '紹介動画づくり: ' + cfg.name;
  document.body.innerHTML = `
<iframe id="app" src="${cfg.src}" style="position:fixed;left:0;top:0;width:${cfg.iw}px;height:${cfg.ih}px;border:0;opacity:0;pointer-events:none;z-index:-1"></iframe>
<main>
  <h1>紹介動画づくり: ${cfg.name}</h1>
  <p>アプリを裏で開いて1コマずつ描き、字幕と音を重ねて mp4（1920×1080・30コマ/秒・${cfg.dur}秒）にします。できたら下で再生でき、<code>promo/out/${cfg.out}.mp4</code> にも保存します（Git に入れません）。</p>
  <button id="go" disabled>準備中…</button> <a id="dl" hidden download="${cfg.out}.mp4">ダウンロード</a>
  <div id="log"></div>
  <canvas id="out" width="${PW}" height="${PH}"></canvas>
  <video id="vid" controls hidden></video>
</main>`;
  const out = document.getElementById('out'), g = out.getContext('2d');
  const logEl = document.getElementById('log'), go = document.getElementById('go');
  const log = s => { logEl.textContent += s + '\n'; };
  const iframe = document.getElementById('app');
  let w, src;

  // アプリの絵を画面いっぱいに切り取って置く
  function drawSrc() {
    const sw = src.width, sh = src.height, k = Math.max(PW / sw, PH / sh), dw = sw * k, dh = sh * k;
    g.drawImage(src, (PW - dw) / 2, (PH - dh) / 2, dw, dh);
  }
  async function renderAt(t) {
    await cfg.renderAt(t, w);
    g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, PW, PH);
    drawSrc(); cfg.overlay(g, t, w);
  }

  async function record() {
    const t0 = performance.now(), DUR = cfg.dur;
    const vcfg = await pickVideoCodec(), [acfg, amux] = await pickAudioCodec();
    log(`映像 ${vcfg.codec}、音 ${acfg.codec}`);
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: PW, height: PH, frameRate: FPS },
      audio: { codec: amux, numberOfChannels: 2, sampleRate: SR },
      fastStart: 'in-memory',
    });
    let encErr = null;
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => encErr = e });
    venc.configure(vcfg);
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => encErr = e });
    aenc.configure(acfg);

    const buf = await makeAudio(DUR, cfg.music);
    const L = buf.getChannelData(0), R = buf.getChannelData(1), CH = SR / 10;
    for (let i = 0; i < L.length; i += CH) {
      const n = Math.min(CH, L.length - i), data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / SR * 1e6), data });
      aenc.encode(ad); ad.close();
    }

    // 1コマずつ。時間がかかっても動画の時刻はずれない
    const N = DUR * FPS;
    for (let i = 0; i < N; i++) {
      if (encErr) throw encErr;
      await renderAt(i / FPS);
      const vf = new VideoFrame(out, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(vf, { keyFrame: i % (FPS * 2) === 0 }); vf.close();
      while (venc.encodeQueueSize > 4) await sleep(5);
      if (i % 30 === 0) { go.textContent = `録画中 ${Math.round(i / N * 100)}%`; await sleep(0); }
    }
    await venc.flush(); await aenc.flush();
    muxer.finalize();
    const bytes = muxer.target.buffer;
    log(`できた: ${(bytes.byteLength / 1e6).toFixed(1)} MB、${((performance.now() - t0) / 1000).toFixed(0)} 秒かかった`);
    if (cfg.errors) { const e = cfg.errors(w); if (e && e.length) log('アプリのエラー: ' + e.join('\n')); }
    const blob = new Blob([bytes], { type: 'video/mp4' }), url = URL.createObjectURL(blob);
    const vid = document.getElementById('vid'); vid.src = url; vid.hidden = false;
    const dl = document.getElementById('dl'); dl.href = url; dl.hidden = false;
    // 開発用サーバー（.claude/serve.ps1）なら promo/out/ に保存する
    try {
      const r = await fetch(`out/${cfg.out}.mp4`, { method: 'PUT', body: blob });
      log(r.ok ? `保存した: promo/out/${cfg.out}.mp4` : '保存できなかった（' + r.status + '）。ダウンロードから保存してください');
    } catch (e) { log('保存できなかった。ダウンロードから保存してください'); }
    window.__promo = { done: true, mb: bytes.byteLength / 1e6 };
  }

  // 見本のコマ（確かめる用）: __promoPeek(秒)
  window.__promoPeek = async t => { await renderAt(t); return 'ok'; };
  (async () => {
    try {
      for (let i = 0; i < 300; i++) {
        w = iframe.contentWindow;
        if (w && cfg.ready(w)) break;
        await sleep(100);
      }
      if (!cfg.ready(w)) throw new Error('アプリが開けませんでした');
      src = await cfg.setup(w);
      log(`アプリの絵: ${src.width}×${src.height}`);
      await renderAt(cfg.peek || 8);
      go.disabled = false; go.textContent = '録画する（数分かかります）';
      go.onclick = async () => {
        go.disabled = true;
        try { await record(); go.textContent = '終わり'; }
        catch (e) { log('失敗: ' + (e && e.stack || e)); go.textContent = '失敗'; window.__promo = { error: String(e) }; }
      };
      window.__promoRecord = () => go.click();
    } catch (e) { log('失敗: ' + e.message); }
  })();
}
