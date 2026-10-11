// 声帯のしくみ — 実験室（技術検証）の画面
// 声（サンプル・マイク・模型）→ 分析（analyze.js）→ 推定（estimate.js＋table.js）→ 答え合わせ → 模型の動き（letalker.js）
'use strict';
window.__vofoErr = [];
window.addEventListener('error', e => window.__vofoErr.push(String(e.message)));

const $ = id => document.getElementById(id);
const SEX_JA = { male: '男性', female: '女性', child: '子ども' };
const SEX_NOTE = {
  male: '声帯の大きさ: LeTalker（Story）の値。',
  female: '声帯の大きさ: 長さだけ女性の値（LeTalker のコメント）。ほかは男性と同じ。',
  child: '声帯の大きさ: 推定（Zhang 2021 の子どもと大人の男性の比で縮めた）。',
};
const VOWEL_JA = { aa: 'あ /ɑ/', ii: 'い /i/', uu: 'う /u/', eh: 'え /ɛ/', oo: 'お /o/' };
const S = {
  sex: 'male', src: 'sample', show: 'truth', slow: 100,
  cur: null,          // { name, audio, fs, truth, feat, est }
  anim: { truth: null, est: null }, t: 0,
  samples: [], tables: {}, actx: null,
};

// ---------- 表（推定用） ----------
function table(sex) { return S.tables[sex] || (S.tables[sex] = VoiceEstimate.prep(self.VF_TABLE, sex)); }

// ---------- 音 ----------
function audioCtx() { if (!S.actx) S.actx = new (window.AudioContext || window.webkitAudioContext)(); return S.actx; }
function play(audio, fs) {
  try {
    const ac = audioCtx(); if (ac.state === 'suspended') ac.resume();
    const b = ac.createBuffer(1, audio.length, fs); b.getChannelData(0).set(audio);
    const s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start();
  } catch (e) { window.__vofoErr.push('play: ' + e.message); }
}
function parseWav(buf) {
  const dv = new DataView(buf); let off = 12, fs = 44100, data = null, bits = 16, ch = 1;
  while (off + 8 <= dv.byteLength) {
    const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3)), n = dv.getUint32(off + 4, true);
    if (id === 'fmt ') { ch = dv.getUint16(off + 10, true); fs = dv.getUint32(off + 12, true); bits = dv.getUint16(off + 22, true); }
    if (id === 'data') { data = [off + 8, n]; }
    off += 8 + n + (n & 1);
  }
  const [p0, n] = data, cnt = n / (bits / 8) / ch, x = new Float32Array(cnt);
  for (let i = 0; i < cnt; i++) x[i] = dv.getInt16(p0 + i * ch * 2, true) / 32768;
  return { x, fs };
}
function modelAudio(r) {
  const n = r.po.length, y = new Float32Array(n); let m = 0, pk = 1e-9;
  for (let i = 0; i < n; i++) m += r.po[i]; m /= n;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(r.po[i] - m));
  const fade = Math.round(0.03 * r.fs), g = 0.8 / pk;
  for (let i = 0; i < n; i++) { let w = g; if (i < fade) w *= i / fade; if (i > n - fade) w *= (n - i) / fade; y[i] = (r.po[i] - m) * w; }
  return y;
}

// ---------- 模型の動き（アニメーション用に計算） ----------
function simFor(opt) {
  const r = LeTalker.run(Object.assign({ dur: 0.45, vowel: 'aa' }, opt));
  const fs = r.fs, i0 = Math.round(0.25 * fs);
  // 定常になった後半の、整数周期ぶんをくり返し再生する
  let len = r.po.length - i0;
  if (r.f0 > 0) { const P = fs / r.f0; len = Math.max(1, Math.floor(len / P)) * P; }
  // 形を決める値（決まりから。筋肉が一定なので最後の値でよい）
  return { r, i0, len, fs, p: r.p, c: r.c, opt };
}

// ---------- 流れ: 声が決まったら ----------
function setCurrent(cur) {
  S.cur = cur;
  cur.feat = VoiceAnalyze.analyze(cur.audio, cur.fs, { from: cur.from || 0.3, to: cur.to || null });
  cur.est = VoiceEstimate.estimate(table(S.sex), cur.feat, 10);
  S.anim.truth = cur.truth ? simFor(cur.truth) : null;
  S.anim.est = null;
  if (cur.est && cur.est.ok && cur.est.vibrating) {
    const n = cur.est.nearest;
    S.anim.est = simFor({ sex: S.sex, act: n.act, ata: n.ata, alc: 0.5, PL: n.PL, x01: n.x01, x02: n.x01 - 0.001, noise: n.x01 >= 0.04 ? 1 : 0 });
  } else if (cur.est && cur.est.ok && !cur.est.vibrating) {
    S.anim.est = simFor({ sex: S.sex, act: 0.2, ata: 0.2, alc: 0.5, PL: 12000, x01: 0.14, x02: 0.13, noise: 1 });
  }
  if (!cur.truth) setShow('est');
  $('playBtn').disabled = false;
  renderPanels();
}

// ---------- 右の欄 ----------
function fmt(v, d) { return v == null || !isFinite(v) ? '—' : v.toFixed(d); }
function renderPanels() {
  const c = S.cur; if (!c) return;
  const f = c.feat;
  const rows = [];
  if (f.silent) rows.push(['声', '聞こえない', '音が小さすぎる']);
  else {
    rows.push(['高さ F0', f.f0 ? fmt(f.f0, 1) + ' Hz' : '—', '声帯が1秒に震える回数']);
    rows.push(['声のある割合', fmt(f.voiced * 100, 0) + ' %', '小さいと、ささやき・息だけ（声帯が震えていない）']);
    rows.push(['CPP', fmt(f.cpp, 1) + ' dB', '倍音のくっきり度。息もれ・かすれで小さくなる（Hillenbrand ほか 1994）']);
    rows.push(['H1−H2', fmt(f.h1h2, 1) + ' dB', 'いちばん低い2本の倍音の差。口の響きの補正はしていない']);
    rows.push(['HNR', fmt(f.hnr, 1) + ' dB', '倍音と雑音の比（Boersma 1993）']);
    rows.push(['大きさ', fmt(f.level, 1) + ' dB', '相対の値。マイクで変わるので推定には使わない']);
  }
  $('featTbl').innerHTML = rows.map(r => `<tr><td>${r[0]}<small>${r[2]}</small></td><td>${r[1]}</td></tr>`).join('');

  // 推定
  const e = c.est, T = table(S.sex);
  let h = '';
  if (!e || !e.ok) h = '<p class="hint">推定できない（音が小さい）。</p>';
  else if (!e.vibrating) h = `<p>声帯は<b>震えていない</b>と判断（声のある割合 ${fmt(f.voiced * 100, 0)}%）。ささやき・息だけの声。</p><p class="hint">震えていないときは、筋肉の働きは声からは決められない（表の ${e.nAll} 通りのうち ${e.nUnvoiced} 通りが「震えない」）。</p>`;
  else {
    const P = [
      ['act', '輪状甲状筋 CT', v => fmt(v, 2), 0, 1],
      ['ata', '甲状披裂筋 TA', v => fmt(v, 2), 0, 1],
      ['PL', '肺の圧', v => fmt(v / 10, 0) + ' Pa', 3000, 16000],
      ['x01', 'すき間（下のはし）', v => fmt(v * 10, 2) + ' mm', 0.011, 0.042],
    ];
    for (const [k, nm, fm, lo, hi] of P) {
      const q = e.params[k], pos = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
      const conf = { high: 'よく決まる', mid: 'おおまか', low: 'ほとんど決まらない' }[q.conf];
      const tv = c.truth ? c.truth[k] : null;
      h += `<div class="est-row"><div class="nm"><b>${nm}</b><span>${fm(q.mean)}　(${fm(q.lo)}〜${fm(q.hi)})</span></div>
        <div class="bar"><div class="rng" style="left:${pos(q.lo)}%;width:${Math.max(1, pos(q.hi) - pos(q.lo))}%"></div><div class="pt" style="left:calc(${pos(q.mean)}% - 1px)"></div>${tv != null ? `<div class="tr" style="left:${pos(tv)}%" title="答え"></div>` : ''}</div>
        <div class="conf ${q.conf}">確かさ: ${conf}${tv != null ? `　答え ${fm(tv)}` : ''}</div></div>`;
    }
    h += `<p class="hint">いちばん近い設定との距離 ${fmt(e.dist, 2)}（0 に近いほど表の中によく似た声がある）。閉じている時間の割合（模型の中）: 約 ${fmt(e.closed * 100, 0)}%。黄色の帯 = 近い10通りのちらばり、緑の▼ = 答え。</p>`;
    if (c.truth && c.truth.vowel && c.truth.vowel !== 'aa') h += `<p class="hint">注意: 推定の表は母音「あ」で作っている。この声は「${VOWEL_JA[c.truth.vowel]}」なので、口の響きのちがいで外れやすい。</p>`;
    if (c.truth && c.truth.sex !== S.sex) h += `<p class="hint">注意: 答えは${SEX_JA[c.truth.sex]}の模型、推定は${SEX_JA[S.sex]}の表。</p>`;
  }
  $('estBox').innerHTML = h;

  // 答え
  if (c.truth) {
    const t = c.truth, a = S.anim.truth;
    $('truthBox').innerHTML = `<table class="tbl">
      <tr><td>体</td><td>${SEX_JA[t.sex]}</td></tr>
      <tr><td>輪状甲状筋 CT</td><td>${fmt(t.act, 2)}</td></tr>
      <tr><td>甲状披裂筋 TA</td><td>${fmt(t.ata, 2)}</td></tr>
      <tr><td>肺の圧</td><td>${fmt(t.PL / 10, 0)} Pa</td></tr>
      <tr><td>すき間（下・上）</td><td>${fmt(t.x01 * 10, 2)} / ${fmt(t.x02 * 10, 2)} mm</td></tr>
      <tr><td>母音</td><td>${VOWEL_JA[t.vowel] || t.vowel}</td></tr>
      <tr><td>模型の高さ<small>（模型の計算から。LeTalker と同じゼロ交差）</small></td><td>${a && a.r.f0 ? fmt(a.r.f0, 1) + ' Hz' : '震えない'}</td></tr>
    </table>${c.note ? `<p class="hint">${c.note}</p>` : ''}`;
  } else $('truthBox').innerHTML = '<p class="hint">マイクの声には答えがない（本物の声帯の形はわからない）。</p>';
  $('stageNote').textContent = c.name;
}

// ---------- 入口: サンプル ----------
async function loadSamples() {
  try {
    const j = await (await fetch('samples/samples.json')).json();
    S.samples = j.samples;
  } catch (e) { $('sampleList').innerHTML = '<p class="hint">サンプルを読めない（サーバーで開く必要があります）。</p>'; return; }
  $('sampleList').innerHTML = S.samples.map(s => `<button class="smp" data-id="${s.id}"><span>${s.ja}</span><small>${s.result.vibrating ? s.result.f0.toFixed(0) + 'Hz' : '—'}</small></button>`).join('');
  $('sampleList').querySelectorAll('.smp').forEach(b => b.onclick = () => pickSample(b.dataset.id));
}
async function pickSample(id) {
  const s = S.samples.find(q => q.id === id); if (!s) return;
  $('sampleList').querySelectorAll('.smp').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
  setSex(s.truth.sex, true);
  const buf = await (await fetch('samples/' + s.file)).arrayBuffer();
  const w = parseWav(buf);
  setShow('truth');
  setCurrent({ name: 'サンプル: ' + s.ja + '（模型で作った声）', audio: w.x, fs: w.fs, truth: s.truth, note: s.note });
  play(w.x, w.fs);
}

// ---------- 入口: マイク ----------
async function recordMic() {
  const btn = $('micBtn'), msg = $('micMsg');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  } catch (e) { msg.textContent = 'マイクを使えなかった（許可・https・機器を確かめる）: ' + e.message; return; }
  const ac = audioCtx(); if (ac.state === 'suspended') await ac.resume();
  const srcN = ac.createMediaStreamSource(stream), proc = ac.createScriptProcessor(4096, 1, 1), chunks = [];
  const mute = ac.createGain(); mute.gain.value = 0;
  proc.onaudioprocess = ev => chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
  srcN.connect(proc); proc.connect(mute); mute.connect(ac.destination);
  btn.disabled = true; let left = 3;
  msg.textContent = '録音中… 3';
  const iv = setInterval(() => { left--; msg.textContent = left > 0 ? '録音中… ' + left : ''; }, 1000);
  await new Promise(r => setTimeout(r, 3100));
  clearInterval(iv); proc.disconnect(); srcN.disconnect(); stream.getTracks().forEach(t => t.stop());
  btn.disabled = false;
  const n = chunks.reduce((a, c) => a + c.length, 0), x = new Float32Array(n); let o = 0; for (const c of chunks) { x.set(c, o); o += c.length; }
  msg.textContent = '分析した（録音は保存していない）。';
  setCurrent({ name: 'マイクの声（' + SEX_JA[S.sex] + 'の表で推定）', audio: x, fs: ac.sampleRate, truth: null, from: 0.5, to: 2.9 });
}

// ---------- 入口: 模型を動かす ----------
function sliderOpt() {
  const v = id => parseFloat($(id).value);
  const x01 = v('s_x01');
  return { sex: S.sex, act: v('s_act'), ata: v('s_ata'), alc: 0.5, PL: v('s_PL'), x01, x02: x01 - 0.001, vowel: $('s_vowel').value, noise: $('s_noise').checked ? 1 : 0 };
}
function showSliders() {
  const v = id => parseFloat($(id).value);
  $('o_act').textContent = v('s_act').toFixed(2); $('o_ata').textContent = v('s_ata').toFixed(2);
  $('o_PL').textContent = (v('s_PL') / 10).toFixed(0) + ' Pa'; $('o_x01').textContent = (v('s_x01') * 10).toFixed(2) + ' mm';
}
function runModel() {
  const o = sliderOpt();
  const r = LeTalker.run(Object.assign({ dur: 1.2 }, o));
  const y = modelAudio(r);
  setShow('truth');
  setCurrent({ name: '模型の声（' + SEX_JA[S.sex] + '・自分で決めた設定）', audio: y, fs: r.fs, truth: o });
  play(y, r.fs);
}

// ---------- 切りかえ ----------
function setSex(sex, quiet) {
  S.sex = sex;
  $('sexSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.sex === sex));
  $('sexNote').textContent = SEX_NOTE[sex];
  if (!quiet && S.cur) { // 体を変えたら、同じ声を新しい表で推定し直す
    S.cur.est = VoiceEstimate.estimate(table(S.sex), S.cur.feat, 10);
    const n = S.cur.est.ok && S.cur.est.vibrating ? S.cur.est.nearest : null;
    S.anim.est = n ? simFor({ sex: S.sex, act: n.act, ata: n.ata, alc: 0.5, PL: n.PL, x01: n.x01, x02: n.x01 - 0.001 }) : S.anim.est;
    renderPanels();
  }
}
function setSrc(src) {
  S.src = src;
  $('srcSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.src === src));
  $('srcSample').hidden = src !== 'sample'; $('srcMic').hidden = src !== 'mic'; $('srcModel').hidden = src !== 'model';
}
function setShow(show) {
  S.show = show;
  $('showSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.show === show));
}

// ---------- 描画 ----------
const cv = $('cv'), g = cv.getContext('2d');
function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function sampleAt(a, t) { // t 秒（実時間）→ くり返し区間の中のインデックス
  const i = a.i0 + Math.floor((t * a.fs) % a.len);
  return Math.min(a.r.x1.length - 1, i);
}
function draw() {
  const w = cv.clientWidth, h = cv.clientHeight;
  g.clearRect(0, 0, w, h);
  const a = S.show === 'truth' ? (S.anim.truth || S.anim.est) : (S.anim.est || S.anim.truth);
  g.font = '13px ' + css('--f-body');
  if (!a) {
    g.fillStyle = css('--muted'); g.textAlign = 'center';
    g.fillText('左で声を選ぶと、模型の声帯の動きがここに出る', w / 2, h / 2);
    return;
  }
  const i = sampleAt(a, S.t / S.slow);
  const x1 = a.r.x1[i], x2 = a.r.x2[i], xb = a.r.xb[i], p = a.p;
  const T = p.T, zn = p.zn, Dc = p.Dc, Db = p.Db, L = p.L;
  const top = 46, bottomStrip = 90;
  const H = h - top - bottomStrip;
  // 断面（左側の 60%）
  const cw = w * 0.64, cx = cw / 2, cy = top + H / 2;
  const sc = Math.min(cw / 1.45, H / 1.55); // px / cm（男性の大きさ＝片側 約0.65cm・高さ 約1.5cm が入るように固定。体による大きさのちがいが見える）
  const X = xx => xx * sc, Z = zz => -(zz - T / 2) * sc;
  g.save(); g.translate(cx, cy);
  // 空気の通り道（ラベル）
  g.fillStyle = css('--dim'); g.textAlign = 'center';
  g.fillText('声道（口へ）↑', 0, Z(T) - 0.42 * sc);
  g.fillText('気管（肺から）↑', 0, Z(0) + 0.5 * sc);
  for (const sd of [1, -1]) {
    const coverLat = p.x01 + Dc + xb, bodyLat = coverLat + Db;
    // 体部（筋肉）
    g.fillStyle = css('--body');
    g.beginPath();
    g.moveTo(sd * X(coverLat), Z(-0.25 * T)); g.lineTo(sd * X(bodyLat), Z(-0.6 * T)); g.lineTo(sd * X(bodyLat), Z(1.4 * T)); g.lineTo(sd * X(coverLat), Z(1.15 * T)); g.closePath(); g.fill();
    // 表層（下と上のおもり）
    const xAt = z => Math.max(0, x1 + (x2 - x1) * z / T);
    g.fillStyle = css('--cover');
    g.beginPath(); g.moveTo(sd * X(xAt(0)), Z(0)); g.lineTo(sd * X(xAt(zn)), Z(zn)); g.lineTo(sd * X(coverLat), Z(zn)); g.lineTo(sd * X(coverLat), Z(-0.25 * T)); g.closePath(); g.fill();
    g.globalAlpha = 0.85;
    g.beginPath(); g.moveTo(sd * X(xAt(zn)), Z(zn)); g.lineTo(sd * X(xAt(T)), Z(T)); g.lineTo(sd * X(coverLat), Z(1.15 * T)); g.lineTo(sd * X(coverLat), Z(zn)); g.closePath(); g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(sd * X(xAt(zn)), Z(zn)); g.lineTo(sd * X(coverLat), Z(zn)); g.stroke(); g.setLineDash([]);
    // 甲状軟骨（動かない壁）
    g.strokeStyle = css('--dim'); g.lineWidth = 3;
    g.beginPath(); g.moveTo(sd * X(bodyLat + 0.08), Z(-0.9 * T)); g.lineTo(sd * X(bodyLat + 0.08), Z(1.9 * T)); g.stroke(); g.lineWidth = 1;
  }
  // 名札
  g.fillStyle = '#2a1018'; g.textAlign = 'left'; g.font = '12px ' + css('--f-body');
  const lab = (t, x, z) => { g.fillStyle = 'rgba(29,17,23,.75)'; const tw = g.measureText(t).width; g.fillRect(x - 2, z - 11, tw + 4, 15); g.fillStyle = css('--ink'); g.fillText(t, x, z); };
  lab('表層・下', X(p.x01 + 0.04), Z(zn * 0.45));
  lab('表層・上', X(p.x01 + 0.04), Z(zn + (T - zn) * 0.6));
  lab('体部（筋肉）', X(p.x01 + Dc + xb + 0.04), Z(T * 0.5));
  // 息の流れ
  const ug = a.r.ug[i];
  if (ug > 1) {
    g.strokeStyle = css('--air'); g.globalAlpha = Math.min(1, ug / 400 + 0.2); g.lineWidth = Math.max(1, Math.min(10, ug / 60));
    g.beginPath(); g.moveTo(0, Z(-0.3 * T)); g.lineTo(0, Z(1.6 * T)); g.stroke(); g.globalAlpha = 1; g.lineWidth = 1;
  }
  g.restore();
  // 尺度
  g.fillStyle = css('--dim'); g.font = '11px ' + css('--f-mono'); g.textAlign = 'left';
  g.fillRect(16, top + H - 14, sc * 0.1, 2); g.fillText('1 mm', 16 + sc * 0.1 + 6, top + H - 10);
  g.font = '12px ' + css('--f-body');
  g.fillText('前から見た断面（左右は同じ動き）', 16, top + 18);

  // 上から見た図（右側）
  const rx = cw + 10, rw = w - rx - 16, ry = top + 52, rh = H - 100;
  const scT = Math.min(rh / 2.0, rw / 1.4); // 男性の長さ（伸びたとき約2cm）が入る
  const gw = Math.max(0, Math.min(x1, x2)) * 2, Lp = L * scT, band = (Dc + Db) * scT;
  const mx = rx + rw / 2, my = ry + rh / 2;
  g.fillStyle = css('--body');
  g.fillRect(mx - gw / 2 * scT - band, my - Lp / 2, band, Lp); g.fillRect(mx + gw / 2 * scT, my - Lp / 2, band, Lp);
  g.fillStyle = css('--cover');
  g.fillRect(mx - gw / 2 * scT - Dc * scT, my - Lp / 2, Dc * scT, Lp); g.fillRect(mx + gw / 2 * scT, my - Lp / 2, Dc * scT, Lp);
  g.fillStyle = '#05070a'; g.fillRect(mx - gw / 2 * scT, my - Lp / 2, Math.max(0.5, gw * scT), Lp);
  g.fillStyle = css('--muted'); g.textAlign = 'center';
  g.fillText('上から見た図', mx, ry - 4);
  g.fillText('前', mx, my - Lp / 2 - 6); g.fillText('後ろ', mx, my + Lp / 2 + 16);
  g.font = '11px ' + css('--f-mono');
  g.fillText('長さ ' + (L * 10).toFixed(1) + ' mm', mx, my + Lp / 2 + 32);

  // 下: 声門の面積の波形
  const by = h - bottomStrip + 10, bh = bottomStrip - 30, bx = 16, bw = w - 32;
  const P = a.r.f0 > 0 ? a.fs / a.r.f0 : a.fs * 0.01, span = Math.round(P * 3);
  const s0 = a.i0; let amax = 1e-6; for (let k = 0; k < span; k++) amax = Math.max(amax, a.r.ga[s0 + k] || 0);
  g.strokeStyle = css('--line'); g.strokeRect(bx, by, bw, bh);
  g.strokeStyle = css('--acc'); g.beginPath();
  for (let k = 0; k < span; k++) { const xx = bx + k / span * bw, yy = by + bh - (a.r.ga[s0 + k] || 0) / amax * (bh - 4); k ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
  g.stroke();
  const cur = (i - a.i0) % span; g.strokeStyle = css('--ink'); g.beginPath(); g.moveTo(bx + cur / span * bw, by); g.lineTo(bx + cur / span * bw, by + bh); g.stroke();
  g.fillStyle = css('--muted'); g.textAlign = 'left'; g.font = '12px ' + css('--f-body');
  g.fillText('声門のすき間の面積（3周期）　最大 ' + (amax * 100).toFixed(1) + ' mm²' + (a.r.f0 > 0 ? '　0 = 閉じている' : '　（震えていない）'), bx, by - 4);
}
let last = performance.now();
function loop(now) { S.t += Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; draw(); requestAnimationFrame(loop); }

// ---------- つなぐ ----------
$('sexSeg').querySelectorAll('button').forEach(b => b.onclick = () => setSex(b.dataset.sex));
$('srcSeg').querySelectorAll('button').forEach(b => b.onclick = () => setSrc(b.dataset.src));
$('showSeg').querySelectorAll('button').forEach(b => b.onclick = () => setShow(b.dataset.show));
$('slowSeg').querySelectorAll('button').forEach(b => b.onclick = () => { S.slow = +b.dataset.slow; $('slowSeg').querySelectorAll('button').forEach(q => q.setAttribute('aria-pressed', q === b)); });
$('micBtn').onclick = recordMic;
$('modelBtn').onclick = runModel;
$('playBtn').onclick = () => S.cur && play(S.cur.audio, S.cur.fs);
['s_act', 's_ata', 's_PL', 's_x01'].forEach(id => $(id).oninput = showSliders);
window.addEventListener('resize', resize);
setSex('male', true); showSliders(); resize(); loadSamples(); requestAnimationFrame(loop);

// デバッグ用の窓口（RULES 5）
window.__vofo = { S, pickSample, runModel, setSex, simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) S.t += dt; draw(); } };
