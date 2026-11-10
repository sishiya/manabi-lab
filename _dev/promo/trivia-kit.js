// うんちくショート（新しい型、2026-11-03〜）の共通部品。promo.js・promo-audio.js のあとに読む。
// 台本は trivia/PATTERNS.md・trivia/<app>.md。ページは <app>-trivia<番号>.html（?short で録る）。
// アプリを見なくてもわかる絵が主役なので、ふつうは アプリを開かず Canvas だけで描く（triviaStart）。
// アプリの録画を混ぜたいときは promoStart をそのまま使い、overlay の中でこの部品（TK.*）を呼ぶ。
//
// triviaStart({ out, dur, draw(g, t), subs: [{ a, b, ja, en }], cues: [{ t, type }], bgm, close })
//   draw: 1コマの絵（座標は 1080×1920。背景は描いてある）。字幕・目印・締めはここで描かなくてよい
//   subs: 焼きこむ字幕＝CC（英語）の字幕。ja の「[ ]」でかこんだ所は色を変える（CC では外す）
//   cues: 効果音 pop・tick・whoosh・ding・buzz・rise・thud（ドン）。jingle は締めに自動で入る
//   voice: [{ t, file }] 読み上げの wav。'auto' なら out/voice/<out>/voice.json（_dev/tools/voicevox-lines.mjs で作る）を読み、
//          声のあいだは BGM を下げ、画面の下に「VOICEVOX:名前」のクレジットを出す（キャラの規約で必要）
//   bgm: 'pulse'（既定。軽い拍）・'drone'（低い持続音）・'none'・おとライブラリの 'out/bgm/<id>.ogg'
//   close: true のときだけ締めの画面（しし屋の目印・ジングル）を入れる（うんちくは締めなしが決まり。2026-11-03 ユーザー）
'use strict';
const TK = {};
TK.C = { bg0: '#0b1430', bg1: '#132247', line: 'rgba(160,190,255,0.10)', fg: '#ffffff', sub: '#cfe0ff', acc: '#ffcf4a', acc2: '#5fd4ff', red: '#ff6b6b', green: '#59e39a', dim: 'rgba(255,255,255,0.55)' };
TK.ease = ease;
TK.out = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
TK.back = x => { x = clamp(x, 0, 1); const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };   // 少し行きすぎて戻る
TK.pop = (t, a, d = 0.35) => TK.back((t - a) / d);   // a から d 秒で 0→1（ぽんと出る）

// 背景: 濃い紺のグラデーション＋うすい方眼（いつものアプリの絵に合わせた）
TK.bg = function (g, t, o = {}) {
  const gr = g.createLinearGradient(0, 0, 0, PH);
  gr.addColorStop(0, o.top || TK.C.bg1); gr.addColorStop(1, o.bottom || TK.C.bg0);
  g.fillStyle = gr; g.fillRect(0, 0, PW, PH);
  if (o.grid === false) return;
  g.strokeStyle = TK.C.line; g.lineWidth = 1.5;
  const s = 90, dy = (t * (o.drift ?? 6)) % s;
  g.beginPath();
  for (let x = s / 2; x < PW; x += s) { g.moveTo(x, 0); g.lineTo(x, PH); }
  for (let y = -s + dy; y < PH; y += s) { g.moveTo(0, y); g.lineTo(PW, y); }
  g.stroke();
};

// 文字。「[強調]」の所は acc の色。幅に入らなければ縮める。shadow は読みやすさのため
TK.parse = s => { const out = []; let on = false; for (const p of String(s).split(/(\[|\])/)) { if (p === '[') on = true; else if (p === ']') on = false; else if (p) out.push({ s: p, on }); } return out; };
TK.plain = s => String(s).replace(/[\[\]]/g, '');
TK.text = function (g, s, x, y, size, o = {}) {
  const parts = TK.parse(s), bold = o.bold !== false, maxw = o.maxw || PW - 120;
  setFont(g, size, bold);
  let w = parts.reduce((a, p) => a + g.measureText(p.s).width, 0);
  if (w > maxw) { size *= maxw / w; setFont(g, size, bold); w = maxw; }
  const align = o.align || 'center';
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  g.save(); g.textAlign = 'left'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = (o.blur ?? 14) * RES;
  if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = size * 0.16; g.strokeStyle = o.stroke; }
  for (const p of parts) {
    g.fillStyle = p.on ? (o.acc || TK.C.acc) : (o.color || TK.C.fg);
    if (o.stroke) g.strokeText(p.s, cx, y);
    g.fillText(p.s, cx, y); cx += g.measureText(p.s).width;
  }
  g.restore();
  return size;
};
// 何行か（\n で区切る）。中心 y にまとめて置く
TK.lines = function (g, s, x, y, size, o = {}) {
  const ls = String(s).split('\n'), lh = size * (o.lh || 1.3);
  ls.forEach((l, i) => TK.text(g, l, x, y + (i - (ls.length - 1) / 2) * lh, size, o));
};

// フック: 大きな文字が、ぽんと寄って出る（0〜1.5秒の画面に）。上に置くなら y は 230 以上（左上のしし屋の目印にかかる）
TK.hook = function (g, t, a, b, s, o = {}) {
  if (t < a || t > b) return;
  const k = TK.pop(t, a, 0.4), f = fade(t, a, b, 0.25);
  g.save(); g.globalAlpha = f;
  const y = o.y ?? PH * 0.40;
  g.translate(PW / 2, y); g.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); g.translate(-PW / 2, -y);
  TK.lines(g, s, PW / 2, y, o.size || 120, Object.assign({ stroke: 'rgba(0,0,0,0.6)' }, o));
  g.restore();
};
// 札（角の丸い板）
TK.card = function (g, x, y, w, h, o = {}) {
  g.save();
  g.fillStyle = o.fill || 'rgba(20,34,72,0.88)'; g.strokeStyle = o.stroke || 'rgba(160,190,255,0.35)'; g.lineWidth = o.lw || 3;
  g.beginPath(); g.roundRect(x, y, w, h, o.r ?? 28); g.fill(); g.stroke();
  g.restore();
};
// 大きな数字。from→to を a から dur 秒で数える。fmt で書式
TK.count = function (g, t, a, b, from, to, o = {}) {
  if (t < a || t > b) return;
  const k = TK.out((t - a) / (o.dur || 1.2)), v = from + (to - from) * k, f = fade(t, a, b, 0.25);
  const s = o.fmt ? o.fmt(v, k) : Math.round(v).toLocaleString('ja-JP');
  g.save(); g.globalAlpha = f;
  const sz = TK.text(g, s, PW / 2, o.y ?? PH * 0.42, o.size || 200, { color: o.color || TK.C.acc, stroke: 'rgba(0,0,0,0.5)' });
  if (o.unit) TK.text(g, o.unit, PW / 2, (o.y ?? PH * 0.42) + sz * 0.75, (o.size || 200) * 0.32, { color: TK.C.sub });
  if (o.label) TK.text(g, o.label, PW / 2, (o.y ?? PH * 0.42) - sz * 0.72, (o.size || 200) * 0.28, { color: TK.C.sub });
  g.restore();
};
// 棒でくらべる: items = [{ label, v, color, text }]（v は 0〜1 の長さ。o.min で棒のいちばん短い長さ、既定 64px）
TK.bars = function (g, t, a, b, items, o = {}) {
  if (t < a || t > b) return;
  const f = fade(t, a, b, 0.3), y0 = o.y ?? PH * 0.36, gap = o.gap || 230, x0 = 110, W = PW - 220;
  g.save(); g.globalAlpha = f;
  items.forEach((it, i) => {
    const y = y0 + i * gap, k = TK.out((t - a - 0.25 - i * (o.stagger ?? 0.5)) / 0.9);
    TK.text(g, it.label, x0, y, o.size || 52, { align: 'left', color: TK.C.sub });
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.roundRect(x0, y + 40, W, 64, 32); g.fill();
    g.fillStyle = it.color || TK.C.acc2; g.beginPath(); g.roundRect(x0, y + 40, Math.max(o.min ?? 64, W * it.v * k), 64, 32); g.fill();
    if (it.text && k > 0.6) { g.globalAlpha = f * clamp((k - 0.6) / 0.3, 0, 1); TK.text(g, it.text, x0 + Math.max(o.min ?? 64, W * it.v * k) - 18, y + 72, 44, { align: 'right', color: '#0b1430', blur: 0 }); g.globalAlpha = f; }
  });
  g.restore();
};
// 当ててみて: 選択肢の札＋考える時間の輪。reveal の時刻に答えの札を光らせ、ほかを暗く
TK.choices = function (g, t, a, b, opts, o = {}) {
  if (t < a || t > b) return;
  const f = fade(t, a, b, 0.3), n = opts.length, y0 = o.y ?? PH * 0.34, h = o.h || 190, gap = o.gap || 40;
  const rv = o.reveal ?? Infinity, ans = o.answer ?? -1, rk = clamp((t - rv) / 0.35, 0, 1);
  g.save(); g.globalAlpha = f;
  opts.forEach((s, i) => {
    const k = TK.pop(t, a + i * 0.18, 0.35), y = y0 + i * (h + gap), x = 90, w = PW - 180;
    g.save(); g.globalAlpha = f * k * (ans >= 0 && i !== ans ? 1 - 0.65 * rk : 1);
    const hit = i === ans && rk > 0;
    TK.card(g, x, y, w, h, { fill: hit ? `rgba(255,207,74,${0.25 + 0.6 * rk})` : 'rgba(20,34,72,0.9)', stroke: hit ? TK.C.acc : 'rgba(160,190,255,0.4)', lw: hit ? 8 : 3 });
    TK.text(g, 'ABCDE'[i], x + 80, y + h / 2, 84, { color: hit ? '#fff' : TK.C.acc2 });
    TK.text(g, s, x + 160, y + h / 2, o.size || 64, { align: 'left', maxw: w - 200 });
    g.restore();
  });
  // 考える時間（o.think = [はじめ, おわり]）
  if (o.think && t >= o.think[0] && t < o.think[1] + 0.3) {
    const [p, q] = o.think, k = clamp((t - p) / (q - p), 0, 1), cx = PW / 2, cy = y0 - 150, r = 70;
    g.lineWidth = 14; g.strokeStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = TK.C.acc; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); g.stroke();
    TK.text(g, String(Math.max(0, Math.ceil((q - t)))), cx, cy + 4, 72);
  }
  g.restore();
};
// 経った時間の時計（型C「この動画のあいだに」）。右上に
TK.clock = function (g, t, a, b, o = {}) {
  if (t < a || t > b) return;
  const s = Math.max(0, t - a), f = fade(t, a, b, 0.3);
  g.save(); g.globalAlpha = f;
  TK.card(g, PW - 380, 150, 300, 110, { r: 55 });
  g.fillStyle = TK.C.red; g.beginPath(); g.arc(PW - 330, 205, 14 * (0.7 + 0.3 * Math.abs(Math.sin(t * 3))), 0, Math.PI * 2); g.fill();
  TK.text(g, (o.label || '') + s.toFixed(1) + ' 秒', PW - 205, 207, 54, { align: 'center' });
  g.restore();
};
// 小さな注（推定・出どころ）。下の YouTube の表示にかからない所（y ≈ PH*0.72）
TK.note = function (g, t, a, b, s, o = {}) {
  if (t < a || t > b) return;
  g.save(); g.globalAlpha = fade(t, a, b, 0.3) * 0.9;
  TK.lines(g, s, PW / 2, o.y ?? PH * 0.712, o.size || 34, { color: TK.C.dim, bold: false, blur: 8 });
  g.restore();
};
// 声のクレジット（キャラの規約で必要）。小さく下に
TK.credit = function (g, s) { g.save(); g.globalAlpha = 0.7; TK.text(g, s, PW / 2, 1430, 26, { color: TK.C.sub, bold: false }); g.restore(); };
// 上のはしの進み具合の線（最後まで見てもらう目安）
TK.progress = function (g, t, end) {
  if (t > end) return;
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, PW, 10);
  g.fillStyle = TK.C.acc; g.fillRect(0, 0, PW * clamp(t / end, 0, 1), 10);
};
// 焼きこみ字幕（下から 3 割の所。YouTube の表示の上）。今の時刻の subs を1つ出す
TK.subtitle = function (g, t, subs) {
  const s = subs.find(x => t >= x.a && t < x.b && !x.noBurn); if (!s) return;
  const f = fade(t, s.a, s.b, 0.12), k = TK.pop(t, s.a, 0.22);
  g.save(); g.globalAlpha = f;
  const y = PH * 0.615;
  g.translate(PW / 2, y); g.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k); g.translate(-PW / 2, -y);
  TK.lines(g, s.ja, PW / 2, y, s.size || 66, { stroke: 'rgba(0,0,0,0.7)', blur: 10, lh: 1.25 });
  g.restore();
};

// ---- 効果音（コードで合成。権利の心配なし）----
TK.sfx = function (ctx, out, c) {
  const t = c.t, v = c.v ?? 1, g = ctx.createGain(); g.connect(out);
  const osc = (type, f0, f1, d, gain) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + d);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain * v, t + 0.006); e.gain.exponentialRampToValueAtTime(0.0005, t + d);
    o.connect(e); e.connect(g); o.start(t); o.stop(t + d + 0.05);
  };
  const noise = (d, f, q, gain, f1) => {
    const b = ctx.createBuffer(1, Math.ceil(SR * d), SR), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.setValueAtTime(f, t); if (f1) bp.frequency.exponentialRampToValueAtTime(f1, t + d);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain * v, t + d * 0.4); e.gain.linearRampToValueAtTime(0, t + d);
    s.connect(bp); bp.connect(e); e.connect(g); s.start(t);
  };
  switch (c.type) {
    case 'pop': osc('sine', 520, 980, 0.12, 0.5); break;
    case 'tick': osc('square', 1800, 0, 0.03, 0.12); break;
    case 'whoosh': noise(0.45, 400, 1.2, 0.5, 2400); break;
    case 'ding': osc('sine', 1320, 0, 0.9, 0.35); osc('sine', 1980, 0, 0.6, 0.12); break;
    case 'buzz': osc('sawtooth', 140, 110, 0.35, 0.25); break;
    case 'rise': osc('sine', 200, 900, 1.0, 0.18); noise(1.0, 300, 0.8, 0.15, 3000); break;
    case 'thud': osc('sine', 120, 45, 0.4, 0.9); break;
  }
};
// 軽い拍の BGM（4つ打ちの低い音＋短い和音。コードで合成）。o で調・テンポ・和音の進み方・音色を変える（TK.BGM の型）
// 型を選ぶのは TK.BGM_STYLE（全部の動画で同じにする。試聴は trivia/bgm-lab.html）
TK.BGM = {
  pulse: {},   // いまの: A の短調、112 BPM、三角波の短い和音
  bright: { bpm: 116, root: 130.81, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]], chordOct: 12, bass: true },   // C の長調 I–V–vi–IV
  calm: { bpm: 92, root: 146.83, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], chordOct: 0, chordGain: 0.04, chordDecay: 0.9, kickGain: 0.35, chordEvery: 1 },   // D の短調、ゆったり
  marimba: { bpm: 108, root: 174.61, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], chordGain: 0.03, arp: { oct: 12, gain: 0.07, decay: 0.28, harm: 4 }, kickGain: 0.4 },   // F の長調、木琴のアルペジオ
  clock: { bpm: 104, root: 164.81, prog: [[0, 3, 7], [5, 8, 12], [-4, 0, 3], [-5, -1, 2]], chordOct: 0, tick: true, kickGain: 0.45 },   // E の短調、時計の音
  musicbox: { bpm: 96, root: 196.0, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [-5, -1, 2]], chord: false, arp: { oct: 24, gain: 0.06, decay: 0.7, harm: 3 }, kickGain: 0.25, kickEvery: 2 },   // G の長調、オルゴール
  dorian: { bpm: 120, root: 110, prog: [[0, 3, 7, 10], [5, 9, 12, 15]], barBeats: 8, bass: { off: true }, tick: { off: true }, chordOct: 12 },   // A のドリアン、はずむベース
};
TK.BGM_STYLE = 'pulse';
TK.pulseBgm = function (ctx, out, dur, stop, o = TK.BGM[TK.BGM_STYLE] || {}) {
  const bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(out);
  const bpm = o.bpm || 112, beat = 60 / bpm, root = o.root || 110, hz = s => root * Math.pow(2, s / 12);
  const prog = o.prog || [[0, 7, 15], [-4, 3, 12], [-7, 0, 8], [-2, 5, 14]], bar = o.barBeats || 8;
  const tone = (type, f, t, g, att, dec) => { const p = ctx.createOscillator(); p.type = type; p.frequency.value = f; const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + att); e.gain.exponentialRampToValueAtTime(0.0005, t + dec); p.connect(e); e.connect(bus); p.start(t); p.stop(t + dec + 0.05); };
  let noiseBuf = null;
  const tick = (t, g) => { if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.04), ctx.sampleRate); const x = noiseBuf.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008)); }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 4; const e = ctx.createGain(); e.gain.value = g; s.connect(bp); bp.connect(e); e.connect(bus); s.start(t); };
  for (let k = 0, t = 0.2; t < stop; k++, t += beat) {
    const ch = prog[Math.floor(k / bar) % prog.length];
    if (k % (o.kickEvery || 1) === 0) {   // 低い拍
      const p = ctx.createOscillator(); p.type = 'sine'; p.frequency.setValueAtTime(110, t); p.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      const e = ctx.createGain(); e.gain.setValueAtTime(o.kickGain ?? 0.5, t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.25); p.connect(e); e.connect(bus); p.start(t); p.stop(t + 0.3);
    }
    if (o.chord !== false && k % 2 === (o.chordEvery ?? 1) % 2) ch.forEach(s => tone(o.chordWave || 'triangle', hz(s + (o.chordOct ?? 12)), t, o.chordGain ?? 0.05, 0.01, o.chordDecay ?? 0.35));   // 和音
    if (o.bass) { const bt = o.bass.off ? t + beat / 2 : t; tone('triangle', hz(ch[0] - 12), bt, 0.22, 0.008, 0.3); }   // ベース
    if (o.arp) for (let h = 0; h < 2; h++) {   // 8分のアルペジオ（木琴・オルゴール。倍音を足して叩いた音に）
      const n = ch[(k * 2 + h) % ch.length] + o.arp.oct, at = t + h * beat / 2;
      tone('sine', hz(n), at, o.arp.gain, 0.004, o.arp.decay); tone('sine', hz(n) * o.arp.harm, at, o.arp.gain * 0.25, 0.002, o.arp.decay * 0.35);
    }
    if (o.tick) { if (!o.tick.off) tick(t, 0.09); tick(t + beat / 2, 0.06); }   // 時計の音（8分）
  }
};

// 声が字幕の行より長いとき、その行のあいだだけ絵の時間をゆっくり進めて、声が入りきるようにする。
// 台本の時刻 → 動画の時刻の折れ線を作り、字幕・効果音・声を動画の時刻に、draw には台本の時刻を渡す
TK.fitVoice = function (cfg, lines) {
  const subs = cfg.subs || [], need = {};
  for (const l of lines) if (l.i != null) need[l.i] = (l.dur || 0) + 0.3;
  const K = [[0, 0]]; let shift = 0;
  subs.forEach((s, i) => {
    const len = s.b - s.a, want = Math.max(len, need[i] || 0);
    K.push([s.a, s.a + shift]); shift += want - len; K.push([s.b, s.b + shift]);
  });
  K.push([Math.max(cfg.dur, K[K.length - 1][0]), Math.max(cfg.dur, K[K.length - 1][0]) + shift]);
  const map = (x, from, to) => {
    for (let k = 1; k < K.length; k++) {
      const [p0, p1] = [K[k - 1], K[k]];
      if (x <= p1[from] || k === K.length - 1) { const d = p1[from] - p0[from]; return d > 1e-9 ? p0[to] + (x - p0[from]) / d * (p1[to] - p0[to]) : p1[to]; }
    }
    return x;
  };
  const toReal = x => map(x, 0, 1), toScript = x => map(x, 1, 0);
  return {
    dur: +toReal(cfg.dur).toFixed(2),
    subs: subs.map(s => Object.assign({}, s, { a: toReal(s.a), b: toReal(s.b) })),
    cues: (cfg.cues || []).map(c => Object.assign({}, c, { t: toReal(c.t) })),
    voice: lines.map(l => Object.assign({}, l, { t: (l.i != null && subs[l.i] ? toReal(subs[l.i].a) : toReal(l.t)) + 0.05 })),
    draw: (g, t) => cfg.draw(g, toScript(t)),
    stretch: +shift.toFixed(2),
  };
};

// サムネイル用（?thumbart=<秒>）: その秒の絵だけを 1080×1920 で1枚。字・字幕・進みバー・目印は描かない。
// 字は fillText/strokeText を止めて消す（絵の中の見出しも消える）。撮るのは make-trivia-thumbs.ps1、題名は trivia-thumb.html が書く
TK.thumbArt = function (cfg, t) {
  PW = 1080; PH = 1920;
  document.body.style.margin = '0';
  document.body.innerHTML = `<canvas id="art" width="${PW * RES}" height="${PH * RES}" style="position:fixed;left:0;top:0;width:${PW}px;height:${PH}px"></canvas>`;
  const g = document.getElementById('art').getContext('2d'); g.setTransform(RES, 0, 0, RES, 0, 0);
  TK._run = { end: cfg.dur, subs: cfg.subs || [] };
  TK.bg(g, t, cfg.bgOpts || {});
  const P = CanvasRenderingContext2D.prototype, F = P.fillText, S = P.strokeText;
  P.fillText = P.strokeText = () => { };
  try { if (TK.drawArt) TK.drawArt(g, t, cfg.draw); else cfg.draw(g, t); } finally { P.fillText = F; P.strokeText = S; }
  if (TK.finish) TK.finish(g, t);
  document.title = 'thumbart-ready';
};

TK.INSET = 0.84; TK.INSET_Y = 818;   // 縦長の絵と字幕を縮める倍率と、動かない高さ
function triviaStart(cfg) {
  if (TK.ready && !cfg._ready) { TK.ready.then(() => triviaStart(Object.assign({}, cfg, { _ready: true }))); return; }   // 決まったルックの読みこみ待ち（trivia-style.js）
  const thumbT = new URLSearchParams(location.search).get('thumbart');
  if (thumbT !== null) { TK.thumbArt(cfg, +thumbT); return; }
  if (cfg.voice === 'auto') {   // 声の一覧を先に読んでから始める（なければ字幕だけ）
    fetch(`out/voice/${cfg.voiceOut || cfg.out}/voice.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null).then(j => {
      const lines = Array.isArray(j) ? j : (j && j.lines) || [];
      triviaStart(Object.assign({}, cfg, TK.fitVoice(cfg, lines), { voiceCredit: cfg.voiceCredit || (j && j.credit) || (lines.length ? 'VOICEVOX' : '') }));
    });
    return;
  }
  // うんちくは締めの画面なし（2026-11-03 ユーザー。はじまりの小さな目印だけ）。close: true のときだけ本編のあと 5 秒の締め
  const close = cfg.close === true;
  const END = cfg.dur;
  const DUR = close ? cfg.dur + IDENT_CLOSE : cfg.dur;
  const isFile0 = !!((cfg.bgm || TK.BGM_FILE || '').endsWith && (cfg.bgm || TK.BGM_FILE || '').endsWith('.ogg'));
  const subs = cfg.subs || [];
  // TK.BGM_FILE: 曲のファイル（out/bgm/*.ogg）を全部の動画の BGM にする。TK.BGM_CREDIT はその曲のクレジット（画面の下に小さく）
  const bgm = cfg.bgm || TK.BGM_FILE || 'pulse';
  const music = { stopAt: END, cues: close ? [{ t: END, type: 'jingle' }] : [] };
  if (bgm === 'drone') music.style = 'drone';
  else if (bgm.endsWith && bgm.endsWith('.ogg')) music.style = 'none';   // 曲のファイルも下の extra で鳴らす（声のあいだに下げるため）
  else music.style = 'none';
  music.extra = async (ctx, out) => {
    const isFile = bgm.endsWith && bgm.endsWith('.ogg');
    if (bgm === 'pulse' || isFile) {
      // 曲のファイルは音が大きく作ってあるので、拍と同じくらいの釣り合いに下げる。TK.BGM_MIX = { hi, lo, eq } で声との釣り合いを変える（eq: 声と重なる 2 kHz あたりを何 dB 削るか）
      const mix = TK.BGM_MIX || {}, hi = mix.hi ?? (isFile ? 0.16 : 0.55), lo = mix.lo ?? (isFile ? 0.065 : 0.22);
      const b = ctx.createGain(); b.gain.value = hi;
      if (mix.eq) { const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2200; pk.Q.value = 0.8; pk.gain.value = -mix.eq; b.connect(pk); pk.connect(out); } else b.connect(out);
      if (isFile) { try { const s = ctx.createBufferSource(); s.buffer = await ctx.decodeAudioData(await (await fetch(bgm)).arrayBuffer()); s.connect(b); s.start(0); s.stop(END + 0.5); } catch (e) { } }
      else TK.pulseBgm(ctx, b, DUR, END);
      const vs = (cfg.voice || []).slice().sort((x, y) => x.t - y.t);
      vs.forEach((v, i) => {   // 声のあいだは BGM を下げる（次の声まで 0.6 秒ないときは下げたまま）
        const end = v.t + (v.dur || 2), nx = vs[i + 1];
        b.gain.setTargetAtTime(lo, Math.max(0, v.t - 0.08), 0.04);
        if ((!nx || nx.t > end + 0.6) && (close || end + 0.15 < END - 1.2)) b.gain.setTargetAtTime(hi, end + 0.15, 0.25);
      });
      if (!close) b.gain.setTargetAtTime(0, Math.max(0, END - 1.2), 0.3);   // 締めがないので、終わりで BGM をすっと消す
    }
    for (const c of cfg.cues || []) TK.sfx(ctx, out, c);
    for (const v of cfg.voice || []) {   // 読み上げ（あれば）
      try { const buf = await ctx.decodeAudioData(await (await fetch(v.file)).arrayBuffer()); const s = ctx.createBufferSource(); s.buffer = buf; s.connect(out); s.start(v.t); } catch (e) { }
    }
  };
  TK._run = { end: END, subs };
  promoStart({
    name: 'うんちく: ' + cfg.out, out: cfg.out, src: 'blank.html', iw: 400, ih: 300, dur: DUR, peek: cfg.peek || 2,
    subs: subs.map(s => ({ a: s.a, b: s.b, ja: TK.plain(s.ja), en: s.en })),
    music,
    ready: w => w && w.document && w.document.readyState === 'complete',
    setup: () => null,
    renderAt: () => { },
    drawSource: () => { },   // 背景は overlay で描く（時刻で動かすため）
    overlay(g, t) {
      if (t < END) {
        TK.bg(g, t, cfg.bgOpts || {});
        // 縦長は紙の上の絵と字幕をまとめて中央へ縮める（スマホの YouTube の UI・四すみの見切れを避ける。2026-11-10 ユーザー）。y 100〜1560 が SHORT_SAFE の高さに入る
        const inset = isVert();
        g.save(); if (inset) { g.translate(PW / 2, TK.INSET_Y); g.scale(TK.INSET, TK.INSET); g.translate(-PW / 2, -TK.INSET_Y); }
        TK._phase = 'draw';   // 重なりの確かめ（__triviaOverlap）が、本編の絵の字と字幕などを分けるため
        if (TK.drawArt) TK.drawArt(g, t, cfg.draw); else cfg.draw(g, t);   // ルックによっては絵だけ別の層に描いて影をつける（trivia-looks.js）
        TK._phase = 'ui'; if (TK._beforeSub) TK._beforeSub(g, t, subs);
        TK.subtitle(g, t, subs);
        const credit = [cfg.voiceCredit && '声: ' + cfg.voiceCredit, isFile0 && TK.BGM_CREDIT].filter(Boolean).join('　'); if (credit) TK.credit(g, credit);
        g.restore();
        if (cfg.progress !== false) TK.progress(g, t, END);
        TK._phase = null; drawIdentMini(g, t, 0.3, 0.8, inset);
        if (TK.finish) TK.finish(g, t);   // ルックの仕上げ（絵全体にかける。trivia-looks.js）
      } else {
        g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, PW, PH);
        drawIdent(g, t, END);
      }
    },
  });
}

// ---- 文字と絵の重なりの確かめ（record-promo.ps1 -Overlap から。2026-11-04）----
// step 秒ごとに描きながら、本編の絵の中の字（TK.text・fillText）を1つずつ見る:
//   line: 字を書く前、その四角の中に線（紙と大きくちがう所）がある  tint: 字の下が色ぬりの上（カードの上なら気にしない）
//   cover: 字のあとに上から絵や帯が描かれた  text: 字どうしが重なる  out: 画面の外にはみ出す  band: 字幕の帯の下に絵が隠れる（tint と band は弱い。目で見て決める）
//   safe: 絵の中の字がスマホで UI にかぶる・切れる所にある（promo.js SHORT_SAFE）  safe-ui: 字幕・注・クレジットが同じ所に（弱い）
// 返すのは重なりの一覧。sheet を渡すと、見つけたコマに枠を描いて out/<sheet>.jpg に並べる
window.__triviaOverlap = async (step = 0.25, sheet = '') => {
  const P = CanvasRenderingContext2D.prototype, F = P.fillText, run = TK._run, found = new Map();
  const pc = document.createElement('canvas'); pc.width = PW; pc.height = PH; const pg = pc.getContext('2d'); TK.bg(pg, 0, {});
  const pd = pg.getImageData(PW / 2 - 50, PH - 120, 100, 100).data, paper = [0, 1, 2].map(k => { let s = 0; for (let i = k; i < pd.length; i += 4) s += pd[i]; return s / (pd.length / 4); });
  const far = (d, i, lim) => Math.max(Math.abs(d[i] - paper[0]), Math.abs(d[i + 1] - paper[1]), Math.abs(d[i + 2] - paper[2])) > lim;
  let recs = [], group = null, ctx = null;
  const boxOf = (c, s, x, y) => {   // その字の四角（キャンバスの画素）
    const m = c.measureText(s), T = c.getTransform(), l = x - m.actualBoundingBoxLeft, r = x + m.actualBoundingBoxRight, u = y - m.actualBoundingBoxAscent, d = y + m.actualBoundingBoxDescent;
    const pts = [[l, u], [r, u], [l, d], [r, d]].map(([px, py]) => [T.a * px + T.c * py + T.e, T.b * px + T.d * py + T.f]);
    return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
  };
  const grab = (c, b) => { const x = Math.max(0, Math.floor(b[0])), y = Math.max(0, Math.floor(b[1])), w = Math.min(c.canvas.width, Math.ceil(b[2])) - x, h = Math.min(c.canvas.height, Math.ceil(b[3])) - y; return w > 0 && h > 0 ? c.getImageData(x, y, w, h).data : new Uint8ClampedArray(0); };
  const under = (c, b) => {   // line: 紙とも、その四角のふつうの色（札の色）ともちがう所。べたの札の上の字は tint にする
    const d = grab(c, [b[0] + 2, b[1] + 2, b[2] - 2, b[3] - 2]), n = d.length / 4; if (!n) return [0, 0];
    const med = [0, 1, 2].map(k => { const v = []; for (let i = k; i < d.length; i += 4 * 7) v.push(d[i]); v.sort((x, y) => x - y); return v[v.length >> 1]; });
    let line = 0, tint = 0;
    for (let i = 0; i < d.length; i += 4) { const fm = Math.max(Math.abs(d[i] - med[0]), Math.abs(d[i + 1] - med[1]), Math.abs(d[i + 2] - med[2])) > 70; if (far(d, i, 70) && fm) line++; else if (far(d, i, 28)) tint++; }
    return [line / n, tint / n];
  };
  P.fillText = function (s, x, y, mw) {
    if (TK._phase && String(s).trim()) {
      ctx = this; const b = boxOf(this, s, x, y);
      if (TK._phase === 'draw' && this.globalAlpha > 0.35) { const [l, ti] = under(this, b); if (group) { group.b.push(b); group.line = Math.max(group.line, l); group.tint = Math.max(group.tint, ti); } else recs.push({ s: String(s), b: [b], line: l, tint: ti, ph: 'draw' }); }
      else if (TK._phase === 'ui' && this.globalAlpha > 0.35) { const [l] = under(this, b); recs.push({ s: String(s), b: [b], line: l, ph: 'ui' }); }   // 字幕・クレジットなど
    }
    return F.call(this, s, x, y, mw);
  };
  const TT = TK.text;
  TK.text = function (g, s, ...a) {
    if (group || TK._phase !== 'draw') return TT.call(this, g, s, ...a);
    group = { s: TK.plain(s), b: [], line: 0, tint: 0, ph: 'draw' }; const r = TT.call(this, g, s, ...a), gr = group; group = null;
    if (gr.b.length) { gr.b = [[Math.min(...gr.b.map(q => q[0])), Math.min(...gr.b.map(q => q[1])), Math.max(...gr.b.map(q => q[2])), Math.max(...gr.b.map(q => q[3]))]]; gr.snap = grab(g, gr.b[0]); recs.push(gr); }
    return r;
  };
  let bandArt = 0;
  TK._beforeSub = (g, t, subs) => {   // 字幕の帯がかくす所に、絵があるか
    const s = subs.find(x => t >= x.a && t < x.b && !x.noBurn); bandArt = 0; if (!s || !PL.bandH) return;
    const hh = PL.bandH(String(s.ja).split('\n').length), T = g.getTransform(), d = grab(g, [0, (PL.SUBY - hh) * T.d, PW * T.a, (PL.SUBY + hh) * T.d]); let n = 0; for (let i = 0; i < d.length; i += 16) if (far(d, i, 70)) n++; bandArt = n / (d.length / 16);
  };
  const add = (kind, s, t, v, b) => { const k = kind + '|' + s; const f = found.get(k); if (f) { f.t1 = t; f.v = Math.max(f.v, v); } else found.set(k, { kind, s, t0: t, t1: t, v, b, tPeek: t }); };
  try {
    for (let t = step / 2; t < run.end; t += step) {
      recs = []; await window.__promoPeek(t); const c = ctx; if (!c) continue;
      const W = c.canvas.width, H = c.canvas.height, k = W / PW;
      for (const r of recs) {
        const b = r.b[0];
        if (b[0] < 6 * k || b[1] < 6 * k || b[2] > W - 6 * k || b[3] > H - 6 * k) add('out', r.s, t, 1, b);
        else if (isVert() && shortUnsafe(b.map(v => v / k))) add(r.ph === 'draw' ? 'safe' : 'safe-ui', r.s, t, 1, b);   // スマホで UI がかぶる・切れる所（promo.js SHORT_SAFE）
        if (r.line > 0.03) add('line', r.s, t, r.line, b); else if (r.tint > 0.25) add('tint', r.s, t, r.tint, b);
        if (r.ph !== 'draw') continue;
        if (r.snap) { const d = grab(c, b); let ch = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r.snap[i]) + Math.abs(d[i + 1] - r.snap[i + 1]) + Math.abs(d[i + 2] - r.snap[i + 2]) > 60) ch++; if (ch / (d.length / 4) > 0.04) add('cover', r.s, t, ch / (d.length / 4), b); }
      }
      for (let i = 0; i < recs.length; i++) for (let j = i + 1; j < recs.length; j++) {
        const A = recs[i].b[0], B = recs[j].b[0], w = Math.min(A[2], B[2]) - Math.max(A[0], B[0]), h = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
        if (w > 0 && h > 0) { const v = w * h / Math.min((A[2] - A[0]) * (A[3] - A[1]), (B[2] - B[0]) * (B[3] - B[1])); if (v > 0.15) add('text', recs[i].s + ' ／ ' + recs[j].s, t, v, [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])]); }
      }
      if (bandArt > 0.02) add('band', '字幕の帯の下', t, bandArt, [0, (PL.SUBY - 130) * k, W, (PL.SUBY + 130) * k]);
    }
  } finally { P.fillText = F; TK.text = TT; TK._beforeSub = null; }
  const list = [...found.values()].map(f => ({ kind: f.kind, s: f.s, t: f.t0.toFixed(2) + '〜' + f.t1.toFixed(2), v: +f.v.toFixed(3), tPeek: +(f.t0 + f.t1) / 2, b: f.b.map(Math.round) }));
  if (sheet && list.length) {   // 見つけたコマ（最大16）に枠を描いて並べる
    const weak = f => f.kind === 'tint' || f.kind === 'band' || f.kind === 'safe-ui', pick = list.filter(f => !weak(f)).concat(list.filter(weak)).slice(0, 16), cols = 4, sw = 480, sh = 853;
    const cv = document.createElement('canvas'); cv.width = sw * cols; cv.height = sh * Math.ceil(pick.length / cols); const cg = cv.getContext('2d');
    for (let i = 0; i < pick.length; i++) {
      const f = pick[i]; await window.__promoPeek(f.tPeek); const src = ctx.canvas, sx = (i % cols) * sw, sy = Math.floor(i / cols) * sh, k = sw / src.width;
      cg.drawImage(src, sx, sy, sw, sh); if (f.kind.startsWith('safe')) drawShortSafe(cg, sx, sy, sw, sh); cg.strokeStyle = weak(f) ? '#f90' : '#f00'; cg.lineWidth = 3; cg.strokeRect(sx + f.b[0] * k, sy + f.b[1] * k, (f.b[2] - f.b[0]) * k, (f.b[3] - f.b[1]) * k);
      cg.fillStyle = '#000'; cg.fillRect(sx, sy + sh - 34, sw, 34); cg.fillStyle = '#fff'; cg.font = '20px sans-serif'; cg.fillText(`${f.kind} ${f.tPeek.toFixed(1)}s ${f.s}`.slice(0, 40), sx + 6, sy + sh - 10);
    }
    const bl = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85)); await fetch(`out/${sheet}.jpg`, { method: 'PUT', body: bl });
  }
  return list;
};
