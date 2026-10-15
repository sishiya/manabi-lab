// いのちの系統樹 — 「どこで分かれた？」: 2つ選ぶと、それぞれから共通の祖先まで枝が光る
//   1つめ: 詳細の「くらべる」 → 2つめ: 樹形図で押すか、検索で選ぶ
//   共通の祖先 = この樹形図の上で、2つの道すじが合わさるところ（綱より下は分類なので目安）
'use strict';
const Compare = (() => {
  const bar = document.getElementById('cmpbar');
  let phase = 'idle', a = null, b = null, mrca = null, chains = [], t0 = 0;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nm = n => n.ja || n.name;
  const REVEAL = 1.3;   // 光が根もとへのぼっていく時間（秒）

  function setBar(html) { bar.innerHTML = html; bar.hidden = !html; }
  function start(n) {
    clear(false);
    phase = 'pick'; a = n;
    setBar(`<span>1つめ: <b>${esc(nm(n))}</b>。くらべる相手を、樹形図で押すか検索してください</span>
      <button data-act="demo" title="ヒトとシイタケでためす">例: ヒト×シイタケ</button><button data-act="end">やめる</button>`);
  }
  // 2つめが決まった: 共通の祖先をさがして、光らせる
  function choose(n) {
    if (phase !== 'pick' || !a) return;
    if (n === a) return;
    b = n;
    const up = x => { const c = [x]; for (let p = x.parent; p; p = p.parent) c.push(p); return c; };
    const ca = up(a), cb = up(b), inA = new Set(ca);
    mrca = cb.find(x => inA.has(x)) || T.root;
    chains = [ca.slice(0, ca.indexOf(mrca) + 1), cb.slice(0, cb.indexOf(mrca) + 1)];
    phase = 'show'; t0 = performance.now();
    // 両方が見えるように開いて、2つの道すじが入るところへカメラを
    for (const ch of chains) for (const x of ch.slice(1)) x.open = true;
    // 2本の道すじ（と根もとまで）だけ残す。ほかの枝は親へ吸いこまれる
    const keep = new Set(chains.flat());
    for (let p = mrca; p; p = p.parent) keep.add(p);
    V.only = keep;
    V.selected = mrca;
    glideTo(chains.flat());
    render();
    anim();
  }
  // 帯と詳細の文（和名があとから届いたら、出しなおす）
  let shown = '';
  function render() {
    shown = nm(a) + '|' + nm(b) + '|' + nm(mrca);
    Compare.onShown(a, b);
    const steps = ch => ch.slice(0, -1).filter(x => x.name).length;   // 名前のあるまとまりの数（名前のない分かれ目は数えない）
    const da = steps(chains[0]), db = steps(chains[1]);
    // 片方がもう片方の祖先のときは「〜のなかま」
    const inner = mrca === a ? b : mrca === b ? a : null;
    const head = inner ? `<b>${esc(nm(inner))}</b> は <b class="gold">${esc(nm(mrca))}</b> のなかま`
      : `<b>${esc(nm(a))}</b> と <b>${esc(nm(b))}</b> は <b class="gold">${esc(nm(mrca))}</b> で分かれた`;
    setBar(`<span>${head}</span>
      <button data-act="again">ほかとくらべる</button><button data-act="end">やめる</button>`);
    UI.show(mrca, `<div class="cmpbox"><h3>どこで分かれた？</h3>
      ${inner ? `<p><b>${esc(nm(inner))}</b> は <b class="gold">${esc(nm(mrca))}</b>${mrca.ja ? `（<i class="sci">${esc(mrca.name)}</i>）` : ''} の中にいます。</p>`
        : `<p><b>${esc(nm(a))}</b> と <b>${esc(nm(b))}</b> の道すじは、<b class="gold">${esc(nm(mrca))}</b>${mrca.ja ? `（<i class="sci">${esc(mrca.name)}</i>）` : ''} で合わさります。</p>`}
      <p>${inner ? `${esc(nm(mrca))} から ${esc(nm(inner))} まで ${Math.max(da, db)} 段。` : `ここから ${esc(nm(a))} まで ${da} 段、${esc(nm(b))} まで ${db} 段。`}</p>
      <div class="cmpcols">${chains.map(ch => `<ol>${ch.slice(0, -1).reverse().filter(x => x.name).map(x => `<li${x === ch[0] ? ' class="end"' : ''}>${esc(nm(x))}</li>`).join('')}</ol>`).join('')}</div>
      <p class="small">分かれたところ＝2つの道すじがいっしょだった、いちばん先のまとまり（この樹形図の上で）。枝の長さは時間ではありません。綱より下は分類なので目安です。</p></div>`);
  }
  function refresh() { if (phase === 'show' && shown !== nm(a) + '|' + nm(b) + '|' + nm(mrca)) render(); }
  function clear(redraw = true) {
    const was = phase === 'show';
    phase = 'idle'; a = b = mrca = null; chains = []; setBar('');
    V.only = null;
    if (was) V.layout();   // しぼりこみをやめると、ほかの枝がまた出てくる
    if (redraw) V.draw();
  }
  // ヒトとシイタケで、すぐためす
  async function demo() {
    setBar('<span>ヒトとシイタケの枝をたどっています…</span>');
    try {
      const id = async name => { const d = await API.exact(name); const r = (d.result || []).find(r => r.usage.status === 'accepted'); return r && r.id; };
      const [ia, ib] = await Promise.all([id('Homo sapiens'), id('Lentinula edodes')]);
      const na = await T.reveal(ia), nb = await T.reveal(ib);
      start(na); choose(nb);
    } catch (e) { console.warn(e); setBar('<span>読みこめませんでした</span><button data-act="end">とじる</button>'); }
  }
  bar.addEventListener('click', e => {
    const act = e.target.closest('button') && e.target.closest('button').dataset.act;
    if (act === 'end') clear();
    if (act === 'demo') demo();
    if (act === 'again') { const keep = a; clear(false); start(keep); V.draw(); }
  });

  // カメラを、なめらかに（0.5秒）
  function glideTo(list) {
    V.layout();
    const [W, H] = V.size, bb = V.bbox(list), bw = bb.right - bb.left, bh = bb.bottom - bb.top;
    // 文字が読める大きさは保つ（入りきらないときは、合わさるところを左に。先はドラッグで）
    const k = Math.max(0.75, Math.min(1, (W - 90) / bw, (H - 90) / bh));
    const fitsW = bw * k <= W - 90;
    const to = { k, x: fitsW ? 12 + (W - 70 - bw * k) / 2 - bb.left * k : 24 - (mrca.x - 10) * k, y: 40 + (H - 50 - bh * k) / 2 - bb.top * k };
    const from = { ...V.cam }, s = performance.now();
    (function f(t) {
      const u = Math.min(1, (t - s) / 500), e = u * u * (3 - 2 * u);
      V.cam.k = from.k + (to.k - from.k) * e; V.cam.x = from.x + (to.x - from.x) * e; V.cam.y = from.y + (to.y - from.y) * e;
      V.draw();
      if (u < 1) requestAnimationFrame(f);
    })(s);
    setTimeout(() => { Object.assign(V.cam, to); V.draw(); }, 560);   // コマ送りが止まっていても行き先へ
  }
  // 光がのぼるあいだだけコマを送る
  function anim() {
    (function f() {
      V.draw();
      if (phase === 'show' && (performance.now() - t0) / 1000 < REVEAL + 0.6) requestAnimationFrame(f);
    })();
  }

  // 描く（V.draw の中、世界の座標）: 葉から共通の祖先へ、金色の光がのぼる
  function draw(g, k) {
    if (phase !== 'show') return;
    const u = (performance.now() - t0) / 1000 / REVEAL;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(214,158,40,.92)';
    g.shadowColor = 'rgba(240,180,60,.85)'; g.shadowBlur = 10;
    g.lineWidth = Math.max(3.2, 2.4 / k);
    for (const ch of chains) {
      const L = ch.length - 1;
      for (let i = 0; i < L; i++) {
        const c = ch[i], p = ch[i + 1];
        if (!V.vis.includes(c) || !V.vis.includes(p)) continue;
        const f = Math.max(0, Math.min(1, u * L - i));
        if (f <= 0) continue;
        const d = c.ax - p.ajx;
        const len = Math.hypot(d, c.ay - p.ay) * 1.15 + (p.ajx - p.ax) + 4;
        g.setLineDash([len * f, 1e5]);
        g.beginPath(); g.moveTo(c.ax, c.ay);
        g.bezierCurveTo(c.ax - d * 0.55, c.ay, p.ajx + d * 0.55, p.ay, p.ajx, p.ay);
        g.lineTo(p.ax, p.ay);
        g.stroke();
      }
    }
    g.setLineDash([]);
    // 合わさるところ: 光が着いたら金の輪
    if (u >= 1 && V.vis.includes(mrca)) {
      const v = Math.min(1, (u - 1) * 3);
      g.lineWidth = Math.max(2.4, 1.6 / k); g.globalAlpha = v;
      g.beginPath(); g.arc(mrca.ax, mrca.ay, 9 + (1 - v) * 6, 0, 7); g.stroke();
    }
    g.restore();
  }
  return { onShown() { }, start, choose, clear, draw, demo, refresh, get picking() { return phase === 'pick'; }, get showing() { return phase === 'show'; } };
})();
