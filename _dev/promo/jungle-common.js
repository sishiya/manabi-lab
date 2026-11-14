// 熱帯雨林の音（jungle-sound）の台本の共通の部品（2026-11-14）
// アプリの画面は DOM（名前の札・一覧・写真）なので、録画では写せない。そこで、アプリと同じデータ（data/forest.json・species.json・img/）から
// 声の帯・いま鳴いている札・一覧の行・写真のカード・スペクトログラムを、アプリと同じ色・同じ決まりでこちらで描きなおす。
// 音もアプリと同じ: 土台（audio/bed.m4a、3分）をくり返し、鳥の切り出し（audio/birds.m4a）を鳴らす表どおりに重ねる（Forest と同じ）。
// ON／OFF・だけ・虫カエルを消したときの +20 dB（List.summary と同じ）も同じ。BGM は入れない（本物の録音が主役）。
// 場面の表 SEG = [{ t: 動画の秒, f: 森の時刻へ飛ぶ（省くとそのまま進む）, off: [消す声], sel: 選んだ声, solo: 「だけ」の声 }]（off・sel・solo は前の行を引きつぐ）
'use strict';
const JU_APP = '../../jungle-sound/';
const JU_COL = { bg: '#14202c', panel: '#192837', line: '#2c4255', deep: '#0d1720', btn: '#20334a', ink: '#e8f0f4', muted: '#a3b4bf', acc: '#7fd49a', warn: '#ffd27a',
  sp: '#7fd49a', bird: '#ffd27a', bed: '#8a9a94', offLine: '#5d6d67' };
const JU = { data: null, sp: {}, order: [], ev: {}, img: {}, bed: null, birds: null, seg: [], spec: null, aud: null, w: null };
const juKind = c => c === 'bed' ? 'bed' : c === '????' ? 'bird' : 'sp';
const juKindName = { sp: '種まで', bird: '鳥・種は不明', bed: '分けられていない' };
const juShort = c => JU.w.List.short(c), juName = c => JU.w.List.nameOf(c);
const juReady = w => !!(w.__juso && w.List && w.List.order && w.List.order.length && w.Forest.data);

// 読みこみ（setup で1回）: データ・写真・音（48 kHz にそろえる）
async function juLoad(w) {
  JU.w = w;
  const [data, species] = await Promise.all(['data/forest.json', 'data/species.json'].map(u => fetch(JU_APP + u).then(r => r.json())));
  JU.data = data; JU.sp = Object.fromEntries(species.map(s => [s.code, s])); JU.order = w.List.order.slice();
  for (const e of data.events) (JU.ev[e[0]] = JU.ev[e[0]] || []).push(e);
  await Promise.all(species.filter(s => s.photo).map(s => new Promise(res => { const im = new Image(); im.onload = () => { JU.img[s.code] = im; res(); }; im.onerror = res; im.src = JU_APP + s.photo.file; })));
  const oc = new OfflineAudioContext(1, 1, SR);
  const bufs = await Promise.all([data.bed.file, data.birds_file].map(async u => oc.decodeAudioData(await (await fetch(JU_APP + u)).arrayBuffer())));
  const mono = b => { const a = b.getChannelData(0).slice(); if (b.numberOfChannels > 1) { const c = b.getChannelData(1); for (let i = 0; i < a.length; i++) a[i] = (a[i] + c[i]) / 2; } return a; };
  JU.bed = mono(bufs[0]); JU.birds = mono(bufs[1]);
}

// 場面の表から、動画の時刻 t の状態（森の時刻・消している声・選んだ声・だけ）
function juPrep(SEG) {
  let f = 0, off = [], sel = null, solo = null, label = null, prev = null;
  JU.seg = SEG.slice().sort((a, b) => a.t - b.t).map(s => {
    if (prev) f += s.t - prev.t;
    if (s.f !== undefined) f = s.f;
    if (s.off) { off = s.off; label = s.label || null; } if (s.sel !== undefined) sel = s.sel; if (s.solo !== undefined) solo = s.solo;
    prev = s; return { t: s.t, f, off: new Set(off), sel, solo, label, jump: s.f !== undefined };
  });
}
function juSegAt(t) { let i = 0; while (i + 1 < JU.seg.length && JU.seg[i + 1].t <= t) i++; return JU.seg[i]; }
function juState(t) {
  const s = juSegAt(t), L = JU.data.length_s, f = ((s.f + Math.max(0, t - s.t)) % L + L) % L;
  const on = c => !s.off.has(c), all = ['bed', ...JU.order], n = all.filter(on).length;
  return { f, on, sel: s.sel, solo: s.solo, label: s.label, n, N: all.length, boost: !on('bed') && n > 0 ? 20 : 0 };
}
// いま鳴いている声（鳴らす表から。OFF の声もふくむ。アプリは ON／OFF の前で測る）
const juLive = (c, f) => (JU.ev[c] || []).some(e => e[1] <= f && f < e[1] + e[3]);
// 名前の札・一覧のカードに出す声: 選んだ声、なければ いま鳴いている ON の声のうち写真のあるもの（なければ最後に鳴いた声）
function juFeatured(t) {   // いちばん新しく鳴きはじめた ON の声（写真のあるもの）。とびとびの時刻でも同じ結果になるよう、表から決める
  const S = juState(t);
  if (S.sel) return S.sel;
  let best = null, bt = -1;
  for (const c of JU.order) if (S.on(c) && JU.img[c]) for (const e of JU.ev[c]) if (e[1] <= S.f && e[1] > bt) { bt = e[1]; best = c; }
  return best;
}
const juStartOf = (c, f) => { const e = (JU.ev[c] || []).find(e => e[1] <= f && f < e[1] + e[3]); return e ? e[1] : -1; };

// ---- 音: アプリの Forest と同じ重ね方。dur 秒ぶんを作り、スペクトログラムも同じ音から ----
function juBuild(dur, opt = {}) {
  // pre: 動画の前の pre 秒も作る（スペクトログラムをはじめから埋めるため。録画の音には入れない）
  const pre = JU_SPEC.pre = opt.pre ?? 8, np = Math.round(pre * SR), n = Math.ceil(dur * SR) + np, mix = new Float32Array(n), L = JU.data.length_s, end = (opt.end ?? dur) + pre;
  const tau = 1 - Math.exp(-1 / (SR * 0.08));   // ON／OFF は 0.08 秒でなめらかに（アプリと同じ）
  const segs = JU.seg;
  const gains = {}; for (const c of ['bed', ...JU.order]) gains[c] = segs[0].off.has(c) ? 0 : 1;
  let boostG = juState(0).boost ? 10 : 1;
  for (let k = 0; k < segs.length; k++) {
    const s = k ? segs[k] : { ...segs[0], f: segs[0].f - pre, t: -pre }, i0 = Math.round((s.t + pre) * SR), i1 = k + 1 < segs.length ? Math.round((segs[k + 1].t + pre) * SR) : n;
    const S = juState(Math.max(0, s.t)), bTarget = S.boost ? 10 ** (S.boost / 20) : 1;
    for (let i = i0; i < Math.min(i1, n); i++) {
      const f = ((s.f + (i - i0) / SR) % L + L) % L;
      boostG += (bTarget - boostG) * tau;
      gains.bed += ((S.on('bed') ? 1 : 0) - gains.bed) * tau;
      let v = JU.bed[Math.floor(f * SR) % JU.bed.length] * gains.bed;
      for (const c of JU.order) {
        gains[c] += ((S.on(c) ? 1 : 0) - gains[c]) * tau;
        if (gains[c] < 1e-4) continue;
        for (const e of JU.ev[c] || []) {
          if (f < e[1] || f >= e[1] + e[3]) continue;
          v += JU.birds[Math.floor((e[2] + f - e[1]) * SR)] * gains[c] * boostG;
        }
      }
      // 森の時刻が飛んだ所（帯を押した・▶|）は、ぷつっといわないように前後 25 ms をうすく
      const dj = (i - i0) / SR; if (s.jump && k > 0 && dj < 0.025) v *= dj / 0.025;
      if (i1 < n && segs[k + 1].jump && (i1 - i) / SR < 0.025) v *= (i1 - i) / SR / 0.025;
      mix[i] = v;
    }
  }
  for (let i = Math.round(end * SR); i < n; i++) mix[i] *= Math.max(0, 1 - (i / SR - end) / 0.6);   // 本編の終わりで 0.6 秒で消す（締めのジングルへ）
  JU.aud = mix.subarray(np);
  juSpecBuild(mix, dur + pre);
}
// music.extra: 作った森の音を録画の音に（全体の大きさは loudMix が -20 LUFS にそろえる）
const juExtra = async (ctx, out) => {
  const b = ctx.createBuffer(2, JU.aud.length, SR); b.copyToChannel(JU.aud, 0); b.copyToChannel(JU.aud, 1);
  const s = ctx.createBufferSource(); s.buffer = b; s.connect(out); s.start(0);
};

// ---- スペクトログラム: アプリ（js/spectro.js・main.js の analyser）と同じ: 1024 点・Blackman・-125〜-65 dB・0〜16 kHz・同じ色。1秒 60 列 ----
const JU_SPEC = { cps: 60, H: 200, pre: 0 };
function juFFT(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
      re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}
function juSpecBuild(x, dur) {
  const N = 1024, cols = Math.ceil(dur * JU_SPEC.cps), H = JU_SPEC.H, top = Math.floor(N / 2 * 16000 / (SR / 2));
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / N) + 0.08 * Math.cos(4 * Math.PI * i / N);
  const cv = document.createElement('canvas'); cv.width = cols; cv.height = H;
  const g = cv.getContext('2d'), im = g.createImageData(cols, H), re = new Float32Array(N), ii = new Float32Array(N), sm = new Float32Array(N / 2);
  const color = v => { const t = v / 255; return [Math.min(255, 40 + 420 * t * t), Math.min(255, 20 + 330 * t), Math.min(255, 18 + 120 * t * t * t)]; };
  for (let c = 0; c < cols; c++) {
    const e = Math.round(c / JU_SPEC.cps * SR);
    for (let i = 0; i < N; i++) { const j = e - N + i; re[i] = (j >= 0 && j < x.length ? x[j] : 0) * win[i]; ii[i] = 0; }
    juFFT(re, ii);
    for (let k = 0; k <= top; k++) sm[k] = 0.2 * sm[k] + 0.8 * Math.hypot(re[k], ii[k]) / N;
    for (let y = 0; y < H; y++) {
      const db = 20 * Math.log10(sm[Math.round((1 - y / (H - 1)) * top)] + 1e-20), v = clamp(255 * (db + 125) / 60, 0, 255), [r, gg, b] = color(v), p = (y * cols + c) * 4;
      im.data[p] = r; im.data[p + 1] = gg; im.data[p + 2] = b; im.data[p + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0); JU.spec = cv;
}

// ---- 描く（座標は PW×PH。k はアプリの CSS の 1px を何倍に描くか）----
function juBox(g, x, y, w, h, r = 10, fill = JU_COL.panel, line = JU_COL.line) {
  g.fillStyle = fill; g.strokeStyle = line; g.lineWidth = 1.5; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); g.stroke();
}
function juFit(g, s, w) { if (g.measureText(s).width <= w) return s; while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
// 声の帯（アプリの js/lanes.js と同じ: 土台の大きさの波・行ごとの帯・ON は塗り／OFF は枠・いま鳴いている行が明るく・白い線がいま）
function juLanes(g, x, y, w, rowH, t, o = {}) {
  const S = juState(t), L = JU.data.length_s, gut = o.gut ?? 200, top = 4, rows = JU.order, bh = rows.length * rowH, axis = o.axis ?? 26, H = top + bh + axis;
  const X = s => x + gut + (w - gut - 6) * s / L;
  g.save(); g.shadowBlur = 0;
  g.fillStyle = JU_COL.deep; g.strokeStyle = JU_COL.line; g.lineWidth = 1.5; g.beginPath(); g.roundRect(x, y, w, H, 8); g.fill(); g.stroke();
  const env = JU.data.bed.env_db, step = JU.data.bed.env_step_s, lo = Math.min(...env), hi = Math.max(...env), y0 = y + top;
  g.fillStyle = S.on('bed') ? 'rgba(160,176,170,.16)' : 'rgba(160,176,170,.05)';
  g.beginPath(); g.moveTo(X(0), y0 + bh); env.forEach((d, i) => g.lineTo(X(i * step), y0 + bh - bh * (0.25 + 0.75 * (d - lo) / (hi - lo + 1e-9)))); g.lineTo(X(L), y0 + bh); g.closePath(); g.fill();
  const fs = o.font ?? Math.min(17, rowH - 2);
  rows.forEach((c, i) => {
    const ry = y0 + i * rowH, on = S.on(c), col = c === '????' ? JU_COL.bird : JU_COL.sp, live = juLive(c, S.f);
    if (i % 2) { g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(x + gut, ry, w - gut, rowH); }
    if (live) { g.fillStyle = on ? 'rgba(255,255,230,.22)' : 'rgba(255,255,230,.07)'; g.fillRect(x + gut, ry, w - gut - 4, rowH); }
    for (const e of JU.ev[c] || []) {
      const x0 = X(e[1]), ww = Math.max(3, X(e[1] + e[3]) - x0);
      if (on) { g.fillStyle = col; g.fillRect(x0, ry + 1.5, ww, rowH - 3); }
      else { g.strokeStyle = JU_COL.offLine; g.lineWidth = 1.5; g.strokeRect(x0 + .75, ry + 2.25, ww - 1.5, rowH - 4.5); }
    }
    if (S.sel === c) { g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.strokeRect(x + gut - 3, ry + 1, w - gut - 1, rowH - 2); }
    g.font = `${live && on ? 'bold ' : ''}${fs}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = on ? (S.sel === c || live ? '#fff' : '#cfdbd6') : JU_COL.offLine;
    if (gut > 60) g.fillText(juFit(g, juShort(c), gut - 14), x + 10, ry + rowH / 2 + 1); else g.fillText(String(i + 1), x + 6, ry + rowH / 2 + 1);
  });
  g.fillStyle = '#8fa39b'; g.font = `${Math.round(axis * 0.62)}px ${FONT}`; g.textBaseline = 'alphabetic';
  for (let m = 0; m <= 3; m++) { const mx = X(m * 60); g.fillRect(mx, y0, 1.5, bh); g.textAlign = m === 3 ? 'right' : 'left'; g.fillText(`${m}:00`, m === 3 ? mx : mx + 4, y + H - 6); }
  const px = X(S.f); g.fillStyle = '#fff'; g.fillRect(px - 1.5, y0, 3, bh);
  g.restore();
  return { H, X, rowY: c => y0 + rows.indexOf(c) * rowH + rowH / 2, gut };
}
// いま鳴いている: 札（種まで＝緑・種不明の鳥＝黄、OFF は点線の枠）
function juChips(g, x, y, w, t, fs = 22) {
  const S = juState(t), live = JU.order.filter(c => juLive(c, S.f));
  g.save(); g.shadowBlur = 0; g.textBaseline = 'middle'; g.textAlign = 'left';
  setFont(g, fs, false); g.fillStyle = JU_COL.muted; g.fillText('いま鳴いている:', x, y + fs * 0.8);
  let cx = x + g.measureText('いま鳴いている:').width + fs * 0.5, cy = y;
  const ch = fs * 1.6;
  if (!live.length) { g.fillText('鳥の声はいま鳴っていません', cx, y + fs * 0.8); g.restore(); return; }
  for (const c of live) {
    const on = S.on(c); setFont(g, fs, on); const s = juShort(c), cw = g.measureText(s).width + fs;
    if (cx + cw > x + w) { cx = x + g.measureText('いま鳴いている:').width + fs * 0.5; cy += ch + 6; }
    g.beginPath(); g.roundRect(cx, cy, cw, ch, 6);
    if (on) { g.fillStyle = c === '????' ? JU_COL.bird : JU_COL.sp; g.fill(); g.fillStyle = c === '????' ? '#2a1d00' : '#0b1a12'; }
    else { g.setLineDash([5, 4]); g.strokeStyle = JU_COL.offLine; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); g.fillStyle = '#8a9a94'; }
    g.fillText(s, cx + fs / 2, cy + ch / 2 + 1); cx += cw + 8;
  }
  g.restore();
}
// 再生の行: ▶ のボタン・時刻・固定した所の状態（「〇〇だけ」・+20 dB）
function juPlayer(g, x, y, t, fs = 22, playing = true) {
  const S = juState(t); g.save(); g.shadowBlur = 0; g.textBaseline = 'middle'; g.textAlign = 'left';
  setFont(g, fs, true); const lab = playing ? '■ 止める' : '▶ 森を聞く', bw = g.measureText(lab).width + fs * 1.4, bh = fs * 2;
  g.fillStyle = playing ? JU_COL.warn : JU_COL.acc; g.beginPath(); g.roundRect(x, y, bw, bh, 8); g.fill();
  g.fillStyle = '#0b1a12'; g.fillText(lab, x + fs * 0.7, y + bh / 2 + 1);
  const fm = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  setFont(g, fs * 0.95, false); g.fillStyle = JU_COL.acc; const ts = `${fm(S.f)} / 3:00`; g.fillText(ts, x + bw + fs * 0.7, y + bh / 2 + 1);
  let st = S.solo ? `「${juShort(S.solo)}」だけ` : S.n < S.N ? (S.label || `鳴らしている ${S.n} / ${S.N}`) : '';   // アプリの List.summary と同じ
  if (st || S.boost) {
    const sx = x + bw + fs * 1.4 + g.measureText(ts).width; setFont(g, fs * 0.95, true); g.fillStyle = JU_COL.ink; g.fillText(st, sx, y + bh / 2 + 1);
    if (S.boost) { const bx = sx + g.measureText(st).width + fs * 0.6, s = `+${S.boost} dB`; setFont(g, fs * 0.8, true); const bw2 = g.measureText(s).width + fs * 0.8;
      g.fillStyle = 'rgba(255,155,122,.18)'; g.strokeStyle = '#ff9b7a'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(bx, y + bh / 2 - fs * 0.7, bw2, fs * 1.4, 5); g.fill(); g.stroke();
      g.fillStyle = '#ff9b7a'; g.fillText(s, bx + fs * 0.4, y + bh / 2 + 1); }
  }
  g.restore();
}
// スペクトログラム（直近 sec 秒が右から流れる。右はしがいま）
function juSpec(g, x, y, w, h, t, sec = 8, fs = 18) {
  g.save(); g.shadowBlur = 0;
  g.fillStyle = JU_COL.deep; g.strokeStyle = JU_COL.line; g.lineWidth = 1.5; g.beginPath(); g.roundRect(x, y, w, h, 8); g.fill();
  g.save(); g.clip();
  const c1 = (t + JU_SPEC.pre) * JU_SPEC.cps, c0 = c1 - sec * JU_SPEC.cps, a = Math.max(0, c0);
  if (c1 > a) { g.imageSmoothingEnabled = true; g.drawImage(JU.spec, a, 0, c1 - a, JU_SPEC.H, x + w * (a - c0) / (c1 - c0), y, w * (c1 - a) / (c1 - c0), h); }
  g.restore(); g.stroke();
  setFont(g, fs, false); g.fillStyle = JU_COL.muted; g.textAlign = 'right';
  g.textBaseline = 'top'; g.fillText('16 kHz', x + w - 8, y + 6); g.textBaseline = 'middle'; g.fillText('8', x + w - 8, y + h / 2); g.textBaseline = 'bottom'; g.fillText('0', x + w - 8, y + h - 4);
  g.restore();
}
// まとめのボタン（全部・種が分かる鳥だけ・種が不明の音だけ）。押した直後は押した色。戻り値はボタンのまん中（矢印の行き先）
function juGroups(g, x, y, w, fs, pressed) {
  const labs = ['全部', '種が分かる鳥だけ', '種が不明の音だけ'], gap = 8, bw = (w - gap * 2) / 3, bh = fs * 2;
  g.save(); g.shadowBlur = 0; g.textAlign = 'center'; g.textBaseline = 'middle';
  const pos = labs.map((s, i) => {
    const bx = x + i * (bw + gap), p = pressed === i;
    g.fillStyle = p ? JU_COL.acc : JU_COL.btn; g.strokeStyle = p ? JU_COL.acc : JU_COL.line; g.lineWidth = 1.5; g.beginPath(); g.roundRect(bx, y, bw, bh, 8); g.fill(); g.stroke();
    setFont(g, fs, p); g.fillStyle = p ? '#0b1a12' : JU_COL.ink; g.fillText(s, bx + bw / 2, y + bh / 2 + 1);
    return { x: bx + bw / 2, y: y + bh / 2 };
  });
  g.restore(); return pos;
}
// 一覧の行（アプリの js/list.js と同じ並び: ON/OFF・番号・写真・名前と分かり方・小さい文・だけ・▶|）。戻り値は各ボタンの位置
function juRow(g, x, y, w, h, c, t, fs = 22) {
  const S = juState(t), on = S.on(c), k = juKind(c), live = juLive(c, S.f), s = JU.sp[c] || {}, idx = JU.order.indexOf(c);
  g.save(); g.shadowBlur = 0; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = live ? (on ? 'rgba(255,214,110,.10)' : 'rgba(255,214,110,.04)') : 'rgba(0,0,0,0)'; g.beginPath(); g.roundRect(x, y, w, h, 8); g.fill();
  if (S.sel === c) { g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke(); } else { g.fillStyle = JU_COL.line; g.fillRect(x + 6, y + h - 1.5, w - 12, 1.5); }
  const my = y + h / 2, u = fs / 13;   // アプリの 13px を基準に
  // ON/OFF のボタン
  const sw = { x: x + 8 * u, w: 62 * u, h: 36 * u };
  g.beginPath(); g.roundRect(sw.x, my - sw.h / 2, sw.w, sw.h, sw.h / 2);
  g.fillStyle = on ? '#1f4a33' : 'rgba(0,0,0,0)'; g.fill(); g.strokeStyle = on ? JU_COL.acc : JU_COL.offLine; g.lineWidth = 1.5; g.stroke();
  g.beginPath(); g.arc(sw.x + 15 * u, my, 6 * u, 0, Math.PI * 2);
  if (on) { g.fillStyle = JU_COL.acc; g.fill(); } else { g.strokeStyle = '#8a9a94'; g.stroke(); }
  g.font = `bold ${12 * u}px ${FONT}`; g.fillStyle = on ? JU_COL.acc : '#8a9a94'; g.fillText(on ? 'ON' : 'OFF', sw.x + 26 * u, my + 1);
  // 体（OFF はうすく灰色）
  g.save(); if (!on) { g.globalAlpha *= 0.45; g.filter = 'grayscale(1)'; }
  let bx = sw.x + sw.w + 8 * u;
  const nw = 22 * u; g.fillStyle = k === 'sp' ? JU_COL.sp : k === 'bird' ? JU_COL.bird : JU_COL.bed; g.beginPath(); g.roundRect(bx, my - 10 * u, nw, 20 * u, 4 * u); g.fill();
  g.font = `bold ${11 * u}px ${FONT}`; g.fillStyle = k === 'bird' ? '#2a1d00' : '#0b1a12'; g.textAlign = 'center'; g.fillText(c === 'bed' ? '地' : String(idx + 1), bx + nw / 2, my + 1); g.textAlign = 'left';
  bx += nw + 6 * u;
  const pw = 56 * u, ph = 42 * u;
  g.save(); g.beginPath(); g.roundRect(bx, my - ph / 2, pw, ph, 5 * u); g.fillStyle = JU_COL.deep; g.fill(); g.clip();
  const im = JU.img[c];
  if (im) { const kk = Math.max(pw / im.width, ph / im.height); g.drawImage(im, bx + (pw - im.width * kk) / 2, my - im.height * kk / 2, im.width * kk, im.height * kk); }
  else { g.font = `${13 * u}px ${FONT}`; g.fillStyle = '#7d8f88'; g.textAlign = 'center'; g.fillText(k === 'bird' ? '鳥？' : '？', bx + pw / 2, my + 1); g.textAlign = 'left'; }
  g.restore();
  if (live) { g.save(); g.shadowColor = on ? 'rgba(255,214,110,.75)' : 'rgba(0,0,0,0)'; g.shadowBlur = on ? 12 * u * RES : 0; g.strokeStyle = on ? '#ffd27a' : 'rgba(255,210,122,.5)'; g.lineWidth = on ? 2.5 * u : 1.2 * u;
    g.beginPath(); g.roundRect(bx - 1, my - ph / 2 - 1, pw + 2, ph + 2, 5 * u); g.stroke(); g.restore(); }
  bx += pw + 8 * u;
  const right = x + w - (c === 'bed' ? 60 : 112) * u, tw = right - bx - 8 * u;
  g.font = `bold ${13.5 * u}px ${FONT}`; g.fillStyle = JU_COL.ink; const nm = juFit(g, juName(c), tw * 0.62); g.fillText(nm, bx, my - 9 * u);
  const kx = bx + g.measureText(nm).width + 6 * u; g.font = `bold ${11 * u}px ${FONT}`; const kt = juKindName[k], kw = g.measureText(kt).width + 10 * u;
  if (kx + kw < right) { g.fillStyle = k === 'sp' ? JU_COL.sp : k === 'bird' ? JU_COL.bird : JU_COL.bed; g.beginPath(); g.roundRect(kx, my - 18 * u, kw, 18 * u, 4 * u); g.fill(); g.fillStyle = k === 'bird' ? '#2a1d00' : '#0b1a12'; g.fillText(kt, kx + 5 * u, my - 9 * u + 1); }
  const n = (JU.data.species.find(x => x.code === c) || {}).n;
  const sub = k === 'bed' ? 'だれの声か分けられていない' : k === 'bird' ? `種は分からない・${n} 回` : `${s.sci}・${n} 回`;
  g.font = `${k === 'sp' ? 'italic ' : ''}${11 * u}px ${FONT}`; g.fillStyle = JU_COL.muted; g.fillText(juFit(g, sub, tw), bx, my + 11 * u);
  g.restore();
  // だけ・▶|
  const btn = (bx2, bw, lab, act, dis) => {
    g.beginPath(); g.roundRect(bx2, my - 18 * u, bw, 36 * u, 6 * u); g.fillStyle = act ? JU_COL.acc : JU_COL.btn; g.fill(); g.strokeStyle = act ? JU_COL.acc : JU_COL.line; g.lineWidth = 1.5; g.stroke();
    g.font = `${act ? 'bold ' : ''}${13 * u}px ${FONT}`; g.fillStyle = act ? '#0b1a12' : dis ? '#5d6d67' : JU_COL.ink; g.textAlign = 'center'; g.fillText(lab, bx2 + bw / 2, my + 1); g.textAlign = 'left';
    return { x: bx2 + bw / 2, y: my };
  };
  const pos = { sw: { x: sw.x + sw.w / 2, y: my }, body: { x: bx + 40 * u, y: my } };
  const nx = x + w - 52 * u;
  if (c !== 'bed') pos.next = btn(nx, 46 * u, '▶|', false, !on);
  pos.solo = btn((c === 'bed' ? x + w - 52 * u : nx - 52 * u), 46 * u, 'だけ', S.solo === c);
  g.restore();
  return pos;
}
// 一覧（行を並べる）。戻り値: { 声: ボタンの位置 }
function juList(g, x, y, w, rowH, codes, t, fs) {
  const P = {}; codes.forEach((c, i) => { P[c] = juRow(g, x, y + i * (rowH + 4), w, rowH, c, t, fs); }); return P;
}
// 写真のカード（選んだ声・いま鳴いている声）: 写真・名前・学名・分かり方・紹介
function juCard(g, x, y, w, c, t, fs = 22, desc = 4) {
  if (!c) return 0;
  const s = JU.sp[c] || {}, im = JU.img[c], k = juKind(c), S = juState(t), live = juLive(c, S.f) && S.on(c);
  g.save(); g.shadowBlur = 0; g.textAlign = 'left'; g.textBaseline = 'top';
  const pad = 16, iw = w - pad * 2, ih = im ? iw * 0.75 : 0;
  setFont(g, fs * 0.82, false); let dl = [];   // 紹介は文の切れ目で（入る文だけ。途中で切らない）
  if (desc && s.desc) { let acc = ''; for (const sn of s.desc.split(/(?<=。)/)) { const l = juWrap(g, acc + sn, iw); if (l.length > desc) break; acc += sn; dl = l; } }
  const h = pad + (im ? ih + 12 : 0) + fs * 1.3 + fs * 1.1 + 10 + dl.length * fs * 1.15 + pad;
  juBox(g, x, y, w, h, 12);
  let cy = y + pad;
  if (im) {
    g.save(); g.beginPath(); g.roundRect(x + pad, cy, iw, ih, 8); g.clip();
    const kk = Math.max(iw / im.width, ih / im.height); g.drawImage(im, x + pad + (iw - im.width * kk) / 2, cy + (ih - im.height * kk) / 2, im.width * kk, im.height * kk); g.restore();
    if (live) { g.save(); g.shadowColor = 'rgba(255,214,110,.8)'; g.shadowBlur = 16 * RES; g.strokeStyle = '#ffd27a'; g.lineWidth = 3; g.beginPath(); g.roundRect(x + pad - 1, cy - 1, iw + 2, ih + 2, 8); g.stroke(); g.restore(); }
    cy += ih + 12;
  }
  setFont(g, fs * 1.05, true); g.fillStyle = '#fff'; g.fillText(juFit(g, juName(c), iw), x + pad, cy); cy += fs * 1.3;
  g.font = `italic ${fs * 0.8}px ${FONT}`; g.fillStyle = JU_COL.muted; const sci = s.sci || ''; g.fillText(sci, x + pad, cy);
  setFont(g, fs * 0.72, true); const kt = juKindName[k], kw = g.measureText(kt).width + 12, kx = x + pad + (sci ? (g.font = `italic ${fs * 0.8}px ${FONT}`, g.measureText(sci).width + 10) : 0);
  setFont(g, fs * 0.72, true); g.fillStyle = k === 'sp' ? JU_COL.sp : k === 'bird' ? JU_COL.bird : JU_COL.bed; g.beginPath(); g.roundRect(kx, cy - 2, kw, fs * 1.0, 4); g.fill();
  g.fillStyle = k === 'bird' ? '#2a1d00' : '#0b1a12'; g.fillText(kt, kx + 6, cy + 1); cy += fs * 1.1 + 10;
  setFont(g, fs * 0.82, false); g.fillStyle = JU_COL.ink; dl.forEach((l, i) => g.fillText(l, x + pad, cy + i * fs * 1.15));
  g.restore();
  return h;
}
function juWrap(g, s, w) {   // 1字ずつ折り返す（日本語）
  const out = []; let cur = '';
  for (const ch of s) { if (g.measureText(cur + ch).width > w && cur) { out.push(cur); cur = ch.trim() ? ch : ''; } else cur += ch; }
  if (cur) out.push(cur); return out;
}
