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
// 軽い拍の BGM（4つ打ちの低い音＋短い和音。コードで合成）
TK.pulseBgm = function (ctx, out, dur, stop) {
  const bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(out);
  const beat = 60 / 112, hz = s => 110 * Math.pow(2, s / 12), prog = [[0, 7, 15], [-4, 3, 12], [-7, 0, 8], [-2, 5, 14]];
  for (let k = 0, t = 0.2; t < stop; k++, t += beat) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const e = ctx.createGain(); e.gain.setValueAtTime(0.5, t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(e); e.connect(bus); o.start(t); o.stop(t + 0.3);
    if (k % 2 === 1) {
      const ch = prog[Math.floor(k / 8) % 4];
      ch.forEach(s => { const p = ctx.createOscillator(); p.type = 'triangle'; p.frequency.value = hz(s + 12);
        const pe = ctx.createGain(); pe.gain.setValueAtTime(0, t); pe.gain.linearRampToValueAtTime(0.05, t + 0.01); pe.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        p.connect(pe); pe.connect(bus); p.start(t); p.stop(t + 0.4); });
    }
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

function triviaStart(cfg) {
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
  const subs = cfg.subs || [];
  const bgm = cfg.bgm || 'pulse';
  const music = { stopAt: END, cues: close ? [{ t: END, type: 'jingle' }] : [] };
  if (bgm === 'drone') music.style = 'drone';
  else if (bgm.endsWith && bgm.endsWith('.ogg')) { music.style = 'file'; music.file = bgm; }
  else music.style = 'none';
  music.extra = async (ctx, out) => {
    if (bgm === 'pulse') {
      const b = ctx.createGain(); b.gain.value = 0.55; b.connect(out); TK.pulseBgm(ctx, b, DUR, END);
      const vs = (cfg.voice || []).slice().sort((x, y) => x.t - y.t);
      vs.forEach((v, i) => {   // 声のあいだは BGM を下げる（次の声まで 0.6 秒ないときは下げたまま）
        const end = v.t + (v.dur || 2), nx = vs[i + 1];
        b.gain.setTargetAtTime(0.22, Math.max(0, v.t - 0.08), 0.04);
        if ((!nx || nx.t > end + 0.6) && (close || end + 0.15 < END - 1.2)) b.gain.setTargetAtTime(0.55, end + 0.15, 0.25);
      });
      if (!close) b.gain.setTargetAtTime(0, Math.max(0, END - 1.2), 0.3);   // 締めがないので、終わりで BGM をすっと消す
    }
    for (const c of cfg.cues || []) TK.sfx(ctx, out, c);
    for (const v of cfg.voice || []) {   // 読み上げ（あれば）
      try { const buf = await ctx.decodeAudioData(await (await fetch(v.file)).arrayBuffer()); const s = ctx.createBufferSource(); s.buffer = buf; s.connect(out); s.start(v.t); } catch (e) { }
    }
  };
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
        if (TK.drawArt) TK.drawArt(g, t, cfg.draw); else cfg.draw(g, t);   // ルックによっては絵だけ別の層に描いて影をつける（trivia-looks.js）
        TK.subtitle(g, t, subs);
        if (cfg.voiceCredit) TK.credit(g, '声: ' + cfg.voiceCredit);
        if (cfg.progress !== false) TK.progress(g, t, END);
        drawIdentMini(g, t, 0.3, 0.8);
        if (TK.finish) TK.finish(g, t);   // ルックの仕上げ（絵全体にかける。trivia-looks.js）
      } else {
        g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, PW, PH);
        drawIdent(g, t, END);
      }
    },
  });
}
