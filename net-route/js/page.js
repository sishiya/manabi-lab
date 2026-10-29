// インターネットの経路 — 仮のページ（スマホの画面）。届いたバイトのぶんだけ描く
// TCP はバイトを順番どおりにしかブラウザへ渡さないので、使えるのは「0番から抜けずにつながった包み」まで（途中が抜けると、後ろが届いていても待つ）
// 60KB の中身の割りふり（例）: はじめ 1.5KB が head（まだ何も出ない）→ 見出しと文 → 絵（48KB。上から順に出る）→ 残りの文
'use strict';

const PG = {
  head: 1500, text: 6000, img: 54000,   // ここまでのバイトで、それぞれが出そろう（例）
  big: false, pic: null, picW: 0, picH: 0,
};

// sim.js の deliver から: 順番どおりにつながったバイト数が増えたとき
function pageProgress(bytes) {
  const m = SIM.marks;
  if (m.paint == null && bytes >= PG.head) m.paint = SIM.T;
  if (m.text == null && bytes >= PG.text) m.text = SIM.T;
  if (m.img == null && bytes >= PG.img) m.img = SIM.T;
}
function pageBytes() { return Math.min(PAGE_BYTES, (SIM.inorder || 0) * MSS); }

// 絵（山と太陽。一度だけ作っておく）
function pagePic(w, h) {
  if (PG.pic && PG.picW === w && PG.picH === h) return PG.pic;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#3d6f9e'); sky.addColorStop(1, '#f2b98a');
  x.fillStyle = sky; x.fillRect(0, 0, w, h);
  x.fillStyle = '#ffe9a8'; x.beginPath(); x.arc(w * 0.7, h * 0.42, h * 0.13, 0, 7); x.fill();
  x.fillStyle = '#2b4a63'; x.beginPath(); x.moveTo(0, h); x.lineTo(0, h * 0.62); x.lineTo(w * 0.3, h * 0.32); x.lineTo(w * 0.55, h * 0.66); x.lineTo(w * 0.78, h * 0.5); x.lineTo(w, h * 0.7); x.lineTo(w, h); x.fill();
  x.fillStyle = '#1a3045'; x.beginPath(); x.moveTo(0, h); x.lineTo(0, h * 0.84); x.lineTo(w * 0.45, h * 0.74); x.lineTo(w, h * 0.88); x.lineTo(w, h); x.fill();
  Object.assign(PG, { pic: c, picW: w, picH: h });
  return c;
}

function drawPage() {
  const cv = $('pgcv'); if (!cv || cv.offsetParent === null) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
  if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = W / 120;                     // 幅 120px を基準に
  x.fillStyle = '#f7f7f4'; x.fillRect(0, 0, W, H);
  // アドレス欄と読みこみの棒
  const ph = SIM.phase, bytes = pageBytes();
  x.fillStyle = '#dfe3e6'; x.fillRect(0, 0, W, 16 * s);
  x.fillStyle = '#fff'; x.fillRect(4 * s, 3 * s, W - 8 * s, 10 * s);
  x.fillStyle = '#555'; x.font = `${6.5 * s}px sans-serif`; x.textBaseline = 'middle';
  x.fillText(ph === 'idle' ? '' : 'example.com', 7 * s, 8.2 * s);
  const prog = { idle: 0, dns: 0.03, tcp: 0.08, tls: 0.14, get: 0.2, data: 0.2 + 0.8 * bytes / PAGE_BYTES, done: 1, fail: 0 }[ph];
  if (ph !== 'idle' && ph !== 'done' && ph !== 'fail') { x.fillStyle = '#2f8fd8'; x.fillRect(0, 15 * s, W * prog, 1.5 * s); }
  const top = 18 * s;
  const msg = t => { x.fillStyle = '#8a8f94'; x.font = `${7 * s}px sans-serif`; x.textAlign = 'center'; t.split('\n').forEach((l, i) => x.fillText(l, W / 2, H * 0.45 + i * 10 * s)); x.textAlign = 'left'; };
  if (ph === 'fail') { msg('つながりません\nでした'); return; }
  if (ph === 'idle') { msg('「ページを開く」で\nここに出ます'); return; }
  if (bytes < PG.head) {                  // まだ何も描けない（白いまま）
    const t = { dns: '住所を調べています', tcp: 'つないでいます', tls: 'つないでいます', get: '待っています', data: '受けとっています' }[ph];
    msg(t || ''); return;
  }
  // 見出しの帯
  x.fillStyle = '#29506e'; x.fillRect(0, top, W, 14 * s);
  x.fillStyle = '#fff'; x.font = `bold ${7 * s}px sans-serif`; x.fillText('れいのサイト', 5 * s, top + 7 * s);
  let y = top + 20 * s;
  const lines = (n, from, to) => {         // 文の行を、届いたバイトの割合ぶん出す
    const k = Math.max(0, Math.min(n, Math.floor(n * (bytes - from) / (to - from))));
    x.fillStyle = '#9aa3aa';
    for (let i = 0; i < k; i++) x.fillRect(5 * s, y + i * 6 * s, (i === n - 1 ? 0.55 : 0.9) * (W - 10 * s), 2.6 * s);
    y += n * 6 * s;
  };
  x.fillStyle = '#222'; x.font = `bold ${8 * s}px sans-serif`; x.fillText('今日の空', 5 * s, y); y += 8 * s;
  lines(5, PG.head, PG.text);
  // 絵: 場所は先にとっておき（灰色）、届いたぶん上から出る
  y += 3 * s; const pw = W - 10 * s, phh = pw * 0.62;
  x.fillStyle = '#d6dadd'; x.fillRect(5 * s, y, pw, phh);
  const f = Math.max(0, Math.min(1, (bytes - PG.text) / (PG.img - PG.text)));
  if (f > 0) { const pic = pagePic(Math.round(pw * dpr), Math.round(phh * dpr)); x.drawImage(pic, 0, 0, pic.width, pic.height * f, 5 * s, y, pw, phh * f); }
  y += phh + 6 * s;
  lines(4, PG.img, PAGE_BYTES);
  // 抜けを待っているとき（後ろの包みは届いているのに、ブラウザへ渡せない）
  if (ph === 'data' && SIM.recv && SIM.recv.size > (SIM.inorder || 0)) {
    x.fillStyle = 'rgba(255,169,77,.95)'; x.fillRect(0, H - 13 * s, W, 13 * s);
    x.fillStyle = '#2a1a05'; x.font = `${6 * s}px sans-serif`; x.textAlign = 'center';
    x.fillText(`${SIM.inorder + 1}番の包みを待っている`, W / 2, H - 6.5 * s); x.textAlign = 'left';
  }
}

// 画面の下の数字（開いてからの時間）
function pageTimeText() {
  const m = SIM.marks, t0 = m.dns;
  if (t0 == null) return '';
  const end = m.done ?? m.fail ?? SIM.T;
  return dur(end - t0);
}

// 図の時計は、仮のページにかからない所へ
function clockX() {
  const v = $('vpage');
  return v && v.offsetLeft < 40 ? v.offsetLeft + v.offsetWidth + 8 : 10;
}
