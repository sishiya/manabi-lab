// 画面の奥の水槽 — カメラの準備の案内（4 段階。つぎへ を押して進む）
import { YAW_CAL, clamp } from './eye.js';

const $ = id => document.getElementById(id);
const CARD_LONG = 8.56, CARD_SHORT = 5.398;   // カードの辺（ISO/IEC 7810 ID-1）
const PRESETS = [['13インチ', 29.4], ['14インチ', 31], ['15.6インチ', 34.5], ['24インチ', 53.1], ['27インチ', 59.8], ['32インチ', 70.8], ['34インチ横長', 79.7], ['40インチ横長', 93.4]];

// カメラの置き方の図（横から）。○と×を見くらべる
const FIG_GOOD = `<svg viewBox="0 0 220 130" role="img" aria-label="カメラは画面の上の真ん中に、顔の正面へ向ける">
  <path d="M20 118h180" class="s dim"/><rect x="30" y="34" width="9" height="74" rx="2" class="f scr"/><path d="M35 108v10M24 118h22" class="s"/>
  <circle cx="35" cy="30" r="6" class="f cam"/><path d="M41 31l112 22" class="s beam"/>
  <circle cx="172" cy="60" r="19" class="s skin"/><path d="M172 79c-14 3-20 12-20 36h40c0-24-6-33-20-36z" class="s skin"/>
  <text x="110" y="14" text-anchor="middle" class="t ok">目の高さは画面の真ん中あたり</text></svg>`;
const FIG_BAD = `<svg viewBox="0 0 220 130" role="img" aria-label="カメラが低く、見上げる向きで、後ろに明るい窓がある">
  <path d="M20 118h180" class="s dim"/><path d="M30 106l6-70" class="s scr2"/><path d="M30 106l60 12" class="s"/>
  <circle cx="30" cy="110" r="0" class="f cam"/><circle cx="62" cy="108" r="6" class="f camb"/><path d="M67 104l90-58" class="s beam2"/>
  <circle cx="165" cy="40" r="19" class="s skin"/><path d="M165 59c-16 3-22 14-22 42h44c0-28-6-39-22-42z" class="s skin"/>
  <rect x="192" y="14" width="24" height="56" class="f win"/>
  <text x="100" y="12" text-anchor="middle" class="t bad">下から見上げる・うしろが明るい</text></svg>`;

export class Guide {
  // ctx: { S, tracker, setPxPerCm(px), calibrate(sample), startCamera(), close(afterSetup) , isPhone }
  constructor(ctx) {
    this.ctx = ctx; this.el = $('guide'); this.body = $('gBody'); this.step = 0; this.pv = $('gPv'); this.samples = null;
    this.small = document.createElement('canvas'); this.small.width = 40; this.small.height = 30;
    this.sg = this.small.getContext('2d', { willReadFrequently: true });
    this.light = { face: 0, back: 0, at: 0 }; this.checkText = ''; this.message = '';
    $('gClose').addEventListener('click', () => this.hide());
    $('gNext').addEventListener('click', () => this.next());
    $('gBack').addEventListener('click', () => this.go(this.step - 1));
    this.el.addEventListener('keydown', e => { if (e.key === 'Escape') this.hide(); });
  }
  get open() { return !this.el.hidden; }
  show(step = 1) { this.el.hidden = false; this.go(step); $('gNext').focus({ preventScroll: true }); }
  hide() { this.el.hidden = true; this.samples = null; this.ctx.onHide && this.ctx.onHide(); }

  go(n) {
    this.step = clamp(n, 1, 3); this.samples = null; this.message = ''; this.checkText = '';
    $('gNext').classList.remove('soft');
    $('gStep').textContent = `準備 ${this.step} / 3`;
    $('gBack').hidden = this.step === 1;
    this.el.querySelector('.panel').scrollTop = 0;
    this['step' + this.step]();
  }
  next() {
    if (this.step === 1) { this.ctx.startCamera(); this.go(2); }
    else if (this.step === 2) this.go(3);
    else this.capture();
  }
  need(on, label) { const b = $('gNext'); b.disabled = !on; b.textContent = label; }

  step1() {
    const { S, isPhone } = this.ctx;
    this.body.innerHTML = `<h2>画面の大きさ</h2>
      <p class="lead">頭が動いた距離と、窓の大きさを、同じ cm で合わせるために使います。</p>
      <div class="chips" id="gPre"></div>
      <label class="row">画面の横幅 <b id="gCm"></b><input id="gW" type="range" min="5" max="${isPhone ? 35 : 130}" step="0.1" aria-label="画面の横幅（cm）"></label>
      <div class="card-line"><div id="gBar"></div><p id="gCard"></p></div>`;
    const sync = () => {
      const w = screen.width / S.pxPerCm, short = CARD_LONG * S.pxPerCm > this.body.clientWidth;   // 長い辺が画面に入らないときは短い辺で
      $('gW').value = w.toFixed(1); $('gCm').textContent = `${w.toFixed(1)} cm`;
      $('gBar').style.width = `${(short ? CARD_SHORT : CARD_LONG) * S.pxPerCm}px`;
      $('gCard').textContent = `この線が、カード（クレジットカードや IC カード）の${short ? '短い' : '長い'}辺と同じ長さなら合っています。`;
      for (const b of $('gPre').children) b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.cm - w) < .06));
    };
    const shortSide = Math.min(screen.width, screen.height), phoneCm = screen.width === shortSide ? 7.1 : 15.5;
    const list = isPhone ? [['スマホ', phoneCm], ['小さいタブレット', 13.6], ['大きいタブレット', 24.6]] : PRESETS;
    $('gPre').innerHTML = list.map(([n, c]) => `<button type="button" class="chip" data-cm="${c}">${n}</button>`).join('');
    $('gPre').addEventListener('click', e => { const c = e.target.dataset.cm; if (c) { this.ctx.setPxPerCm(screen.width / +c); sync(); } });
    $('gW').addEventListener('input', e => { this.ctx.setPxPerCm(screen.width / +e.target.value); sync(); });
    sync();
    this.need(true, 'つぎへ（カメラを開く）');
  }

  step2() {
    const { isPhone } = this.ctx;
    const tips = isPhone
      ? ['スマホは立てかけます。手で持つと、スマホの動きも頭の動きと区別できません。', 'カメラが顔の正面に来る高さに。見下ろさない。', '窓や照明を背中にしない。', '映るのは一人だけに。']
      : ['カメラは画面の上の真ん中に、傾けずに。画面より前へ飛び出さないように。', 'ノートパソコンは画面をなるべくまっすぐ立てます。', '窓や照明を背中にしない。顔の前から光が当たる場所で。', '映るのは一人だけに。'];
    this.body.innerHTML = `<h2>カメラの置き方</h2>
      <div class="cols">
        <div class="pvbox"><canvas id="gPv2" width="320" height="240"></canvas><p class="note">映像は鏡のように左右反対です。この端末の中だけで使い、保存も送信もしません。</p></div>
        <ul class="checks" id="gChecks" aria-live="polite"></ul>
      </div>
      <div class="figs"><figure class="ok">${FIG_GOOD}<figcaption>○ よい置き方</figcaption></figure><figure class="ng">${FIG_BAD}<figcaption>× 読みにくい置き方</figcaption></figure></div>
      <ul class="tips">${tips.map(t => `<li>${t}</li>`).join('')}</ul>`;
    this.pvc = $('gPv2').getContext('2d');
    this.need(false, 'つぎへ');
  }

  step3() {
    const { S, isPhone } = this.ctx;
    this.body.innerHTML = `<h2>いつもの位置を決める</h2>
      <div class="cols">
        <div class="pvbox"><canvas id="gPv2" width="320" height="240"></canvas></div>
        <div>
          <p class="lead">楽な姿勢で、目の高さを画面の真ん中あたりにして、顔をまっすぐ画面に向けて止まってください。</p>
          <label class="row">画面から目まで <b id="gDv"></b><input id="gDist" type="range" min="20" max="120" step="1" aria-label="画面から目までの距離（cm）"></label>
          <p class="note">ひじから指先までが 約 40 cm です。だいたいで大丈夫です。</p>
          <p id="gMsg" class="msg" role="status"></p>
        </div>
      </div>`;
    this.pvc = $('gPv2').getContext('2d');
    const sync = () => { $('gDist').value = S.distCm; $('gDv').textContent = `${S.distCm} cm`; };
    $('gDist').addEventListener('input', e => { S.distCm = +e.target.value; sync(); this.ctx.save(); });
    sync();
    this.need(false, 'この位置を真ん中にする');
  }

  capture() { this.samples = []; this.message = ''; this.setMsg('止まっていてください… 0 / 15'); $('gNext').disabled = true; }
  setMsg(t, bad) { const m = $('gMsg'); if (m) { m.textContent = t; m.classList.toggle('bad', !!bad); } }

  finishCapture() {
    const list = this.samples; this.samples = null;
    const mid = k => list.map(s => s[k]).sort((a, b) => a - b)[list.length >> 1];
    const spanMoved = Math.max(...list.map(s => s.span)) / Math.min(...list.map(s => s.span));
    const posMoved = Math.max(...list.map(s => s.x)) - Math.min(...list.map(s => s.x));
    if (spanMoved > 1.08 || posMoved > 0.03) { this.setMsg('計っているあいだに顔が動きました。止まって、もう一度押してください。', true); this.need(true, 'もう一度とる'); return; }
    const ok = this.ctx.calibrate({ ...list[0], x: mid('x'), y: mid('y'), span: mid('span'), facing: mid('facing'), foreshort: mid('foreshort') });
    if (!ok) { this.setMsg('顔が左右のどちらかを向いています。まっすぐ画面に向けて、もう一度押してください。', true); this.need(true, 'もう一度とる'); return; }
    this.hide(); this.ctx.afterCalibrate();
  }

  // カメラの映像の明るさ（顔のあたりと、まわり）を半秒に一度はかる
  measureLight(now) {
    const { tracker } = this.ctx, v = tracker.video, f = tracker.face;
    if (now - this.light.at < 500 || !f || !v.videoWidth) return;
    this.light.at = now;
    this.sg.drawImage(v, 0, 0, 40, 30);
    const d = this.sg.getImageData(0, 0, 40, 30).data, rx = f.span * 40 * 1.1, ry = f.span * 30 * f.aspect * 1.5, cx = f.x * 40, cy = (f.y + f.span * f.aspect * .3) * 30;
    let a = 0, an = 0, b = 0, bn = 0;
    for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) {
      const i = (y * 40 + x) * 4, l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) { a += l; an++; } else { b += l; bn++; }
    }
    this.light.face = an ? a / an : 0; this.light.back = bn ? b / bn : 0;
  }

  // いまの映りを判定。[{ok, title, how}]
  judge() {
    const { tracker } = this.ctx, f = tracker.face, fresh = f && performance.now() - tracker.faceAt < 500;
    if (!fresh) return [{ ok: false, title: '顔が映っていません', how: '顔の全体がカメラに入るようにしてください。帽子やマスクで目が隠れると読めません。' }];
    const res = [{ ok: true, title: '顔が見えています', how: '' }];
    // カメラが画面の上にあれば、目の高さが画面の真ん中のとき顔は映像の下寄りに映る。上下は頭を動かす余白があればよい
    const high = f.y < .25, low = f.y > .8, side = Math.abs(f.x - .5) >= .15, center = !high && !low && !side;
    res.push({ ok: center, title: center ? '映像の中に余裕をもって入っています' : '顔が映像のはしに寄っています', how: center ? '' : high
      ? 'カメラを少し高くするか、少し上へ向けてください。' : low ? 'カメラを少し低くするか、少し下へ向けてください。' : '体を画面の中心へ動かしてください。' });
    const far = f.span < .05, close = f.span > .23;
    res.push({ ok: !far && !close, title: far ? '顔が小さすぎます' : close ? '近すぎます' : 'ちょうどよい距離です', how: far ? 'もう少し近づいてください。' : close ? '少し離れると、頭を動かしても映像からはみ出しません。' : '' });
    const { face, back } = this.light, dark = face < 55, flare = face > 225, backlit = back - face > 45;
    res.push({ ok: !dark && !flare && !backlit, title: dark ? '顔が暗いです' : flare ? '顔が明るすぎます' : backlit ? 'うしろが顔より明るいです' : '明るさは十分です', how: dark ? '顔の前に明かりをつけてください。' : flare ? '光を少し弱めるか、角度を変えてください。' : backlit ? 'カーテンを閉めるか、明かりが顔の前に来るように向きを変えてください。' : '' });
    const front = f.foreshort >= YAW_CAL;
    res.push({ ok: front, title: front ? '顔はまっすぐです' : '顔が左右のどちらかを向いています', how: front ? '' : '顔をまっすぐ画面に向けてください。' });
    return res;
  }

  drawPreview() {
    const c = this.pvc, cv = c && c.canvas, { tracker } = this.ctx, v = tracker.video;
    if (!c || !cv.isConnected) return;
    const w = cv.width, h = cv.height;
    c.fillStyle = '#04101a'; c.fillRect(0, 0, w, h);
    if (v.videoWidth) { c.save(); c.translate(w, 0); c.scale(-1, 1); c.drawImage(v, 0, 0, w, h); c.restore(); }
    // 顔を置く場所の目安
    c.strokeStyle = 'rgba(127,216,255,.75)'; c.lineWidth = 2; c.setLineDash([7, 6]);
    c.beginPath(); c.ellipse(w / 2, h * .5, w * .16, h * .29, 0, 0, 6.29); c.stroke(); c.setLineDash([]);
    const f = tracker.face;
    if (f && performance.now() - tracker.faceAt < 500) {
      c.fillStyle = '#ffe07a';
      for (const i of [468, 473]) { const p = tracker.points[i]; c.beginPath(); c.arc((1 - p.x) * w, p.y * h, 4, 0, 6.29); c.fill(); }
    }
  }

  tick(now) {
    if (!this.open) return;
    const { tracker } = this.ctx;
    if (this.step === 1) return;
    const st = tracker.state;
    if (st !== 'on') {
      const box = this.step === 2 ? $('gChecks') : $('gMsg');
      const txt = this.stateText(st);
      if (box && box.dataset.t !== txt) { box.dataset.t = txt; box.innerHTML = this.step === 2 ? `<li class="wait">${txt}</li>` : txt; }
      this.need(false, this.step === 2 ? 'つぎへ' : 'この位置を真ん中にする');
      this.drawPreview();
      return;
    }
    const gc = $('gChecks'); if (gc) gc.dataset.t = '';
    this.measureLight(now);
    this.drawPreview();
    const res = this.judge();
    if (this.step === 2) {
      const txt = res.map(r => r.title + r.how).join('|');
      if (txt !== this.checkText) {
        this.checkText = txt;
        $('gChecks').innerHTML = res.map(r => `<li class="${r.ok ? 'ok' : 'ng'}"><b>${r.ok ? '○' : '△'} ${r.title}</b>${r.how ? `<span>${r.how}</span>` : ''}</li>`).join('');
      }
      const all = res.length > 1 && res.every(r => r.ok), seen = res.length > 1;
      this.need(seen, all ? 'つぎへ（ぜんぶ ○ です）' : 'つぎへ（△ のまま進む）');
      $('gNext').classList.toggle('soft', !all);
    } else if (this.samples) {
      const f = tracker.face;
      if (f && f !== this.lastS && now - tracker.faceAt < 500) { this.samples.push(f); this.lastS = f; this.setMsg(`止まっていてください… ${this.samples.length} / 15`); }
      if (this.samples.length >= 15) this.finishCapture();
    } else {
      const seen = res.length > 1, front = seen && res[res.length - 1].ok;
      if ($('gNext').textContent === 'この位置を真ん中にする' || $('gNext').disabled) this.need(seen && front, $('gNext').textContent);
      const m = $('gMsg');
      if (m && !m.classList.contains('bad')) m.textContent = !seen ? '顔が映っていません。' : !front ? '顔をまっすぐ画面に向けてください。' : '';
    }
  }

  stateText(st) {
    return { off: 'カメラが閉じています。', asking: 'カメラの使用を「許可」してください…', loading: '顔を読む部品を読みこみ中です（はじめは 10 MB ほど）…',
      denied: 'カメラが許可されていません。アドレスバーの左のマークからカメラを「許可」にして、ページを読みなおしてください。', nocam: 'カメラが見つかりません。つなぎなおして、もう一度開いてください。',
      insecure: 'このページではカメラを使えません（https か localhost が必要です）。', error: 'カメラか、顔を読む部品の準備に失敗しました。通信を確かめて、ページを読みなおしてください。' }[st] || '';
  }
}
