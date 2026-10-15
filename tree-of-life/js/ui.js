// いのちの系統樹 — 詳細の欄・検索・凡例
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => n.toLocaleString('ja-JP');
  const ext = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`;

  // 凡例（色 = 段）
  $('legend').innerHTML = GROUPS.map(g => `<span><i style="background:${g[2]}"></i>${g[1]}</span>`).join('');

  // ---------- 詳細 ----------
  let showing = null, shownJa = '', token = 0;
  function chip(n) {
    const c = GROUP_COLOR[RANK_GROUP(n.rank)];
    return `<button class="chip" data-i="${n.i}"><i style="background:${c}"></i>${esc(n.ja || n.name)}</button>`;
  }
  function show(n) {
    showing = n; shownJa = n.ja; const my = ++token;
    const c = GROUP_COLOR[RANK_GROUP(n.rank)];
    const rk = RANK_JA[n.rank] || '';
    const path = T.ancestors(n).filter(a => a.name);
    const notes = [];
    if (n.rank === 'clade') notes.push('Open Tree of Life の系統樹にある、分類の階級をもたない枝（共通の祖先から分かれた仲間）。');
    if (n.colOnly) notes.push('Open Tree の系統樹では見つからなかったので、COL の分類で親のまとまりの下につないでいます。');
    if (n.part) notes.push('COL ではこの中に入るまとまりのうち、いくつかは Open Tree の系統樹で別の場所にあります。ここに残っているのはその残り（種の数も残りの分）です。');
    if (n.live) notes.push('この段は COL の分類（目・科・属・種）。ならびは種の数の多い順で、進化の枝分かれの順ではありません。');
    // すぐ下の名前のあるまとまり（名前のない分かれ目はくぐって数える）
    const kidsNamed = (function cnt(m) { return m.kids.reduce((s, k) => s + (k.name ? 1 : k.more ? 0 : cnt(k)), 0); })(n);
    $('detail').innerHTML = `
      <div class="d-head">
        ${rk ? `<span class="tag" style="background:${c}">${esc(rk)}</span>` : ''}
        <h2>${n.extinct ? '† ' : ''}${esc(n.ja || n.name)}${n.part ? '（一部）' : ''}</h2>
      </div>
      ${n.ja ? `<p class="sci"><i>${esc(n.name)}</i> <span id="d-auth"></span></p>` : `<p class="sci"><span id="d-auth"></span></p>`}
      <dl>
        ${n.count ? `<dt>種の数</dt><dd>${fmt(n.count)} 種 <small>（COL にのっている今の種と絶滅した種）</small></dd>` : ''}
        ${kidsNamed ? `<dt>すぐ下</dt><dd>${fmt(kidsNamed)} のまとまり${n.kids.some(k => k.more) ? '（まだ続きあり）' : ''}</dd>` : ''}
        ${n.extinct ? `<dt>絶滅</dt><dd>絶滅した生きもの（COL の記録）</dd>` : ''}
      </dl>
      <p class="wd" id="d-wd"></p>
      ${notes.map(s => `<p class="note">${esc(s)}</p>`).join('')}
      ${path.length ? `<h3>根もとからの道すじ</h3><div class="path">${path.map(chip).join('<span class="arr">›</span>')}</div>` : ''}
      <p class="links" id="d-links">${n.col ? ext('https://www.catalogueoflife.org/data/taxon/' + encodeURIComponent(n.col), 'Catalogue of Life') : ''}</p>`;
    // あとから読むもの（著者・説明・Wikipedia）
    if (n.col) API.taxon(n.col).then(d => {
      if (my !== token) return;
      const a = d.name && d.name.authorship;
      if (a) $('d-auth').textContent = a;
      if (d.extinct && !n.extinct) { n.extinct = true; T.onChange(); }
    }).catch(() => { });
    if (n.q) API.wdInfo(n.q).then(w => {
      if (my !== token) return;
      const desc = w.descJa || w.descEn;
      $('d-wd').innerHTML = desc ? esc(desc) + ` <small>（Wikidata${w.descJa ? '' : '・英語'}）</small>` : '';
      const L = $('d-links');
      if (w.wikiJa) L.insertAdjacentHTML('beforeend', ext(w.wikiJa, 'Wikipedia（日本語）'));
      if (w.wikiEn) L.insertAdjacentHTML('beforeend', ext(w.wikiEn, 'Wikipedia（英語）'));
      L.insertAdjacentHTML('beforeend', ext('https://www.wikidata.org/wiki/' + n.q, 'Wikidata'));
    }).catch(() => { });
  }
  $('detail').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (b) UI.onPick(T.nodes[+b.dataset.i]);
  });

  // ---------- 検索 ----------
  const box = $('q'), list = $('results');
  let timer = 0, seq = 0;
  const hasJa = s => /[぀-ヿ㐀-鿿]/.test(s);
  function render(items, busy) {
    if (!items.length && !busy) { list.innerHTML = box.value.trim() ? '<li class="empty">見つかりません</li>' : ''; return; }
    list.innerHTML = items.map((it, k) => `<li><button data-k="${k}">
      <i style="background:${GROUP_COLOR[RANK_GROUP(it.rank || 'clade')]}"></i>
      <b>${esc(it.title)}</b> <span>${esc(it.sub || '')}</span></button></li>`).join('') + (busy ? '<li class="empty">さがしています…</li>' : '');
    list._items = items;
  }
  async function run() {
    const text = box.value.trim(), my = ++seq;
    if (!text) { render([]); return; }
    const local = T.localSearch(text, 6).map(n => ({ title: n.ja || n.name, sub: (n.ja ? n.name + '・' : '') + (RANK_JA[n.rank] || ''), rank: n.rank, node: n }));
    render(local, true);
    let remote = [];
    try {
      if (hasJa(text)) {
        const r = await API.searchJa(text);
        remote = r.map(x => ({ title: x.ja || x.name, sub: x.name + (x.desc ? '・' + x.desc : ''), name: x.name, rank: 'clade' }));
      } else if (text.length >= 3) {
        const r = await API.suggest(text);
        remote = r.filter(x => x.status === 'accepted').map(x => ({ title: x.match, sub: (RANK_JA[x.rank] || x.rank) + (x.context ? '・' + x.context : ''), col: x.usageId, rank: x.rank }));
      }
    } catch (e) { console.warn(e); }
    if (my !== seq) return;
    const seen = new Set(local.map(l => l.node.name));
    render(local.concat(remote.filter(r => !seen.has(r.name) && !(r.col && T.byCol.has(r.col) && seen.has(T.byCol.get(r.col).name)))).slice(0, 14), false);
  }
  box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); });
  box.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = list.querySelector('button'); if (b) b.click(); } if (e.key === 'Escape') { box.value = ''; render([]); } });
  list.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const it = list._items[+b.dataset.k];
    list.innerHTML = '<li class="empty">枝をたどっています…</li>';
    try {
      let n = it.node;
      if (!n) {
        let col = it.col;
        if (!col) {   // 和名（Wikidata）→ 学名 → COL
          const d = await API.exact(it.name);
          const r = (d.result || [])[0];
          if (!r) { list.innerHTML = `<li class="empty">「${esc(it.name)}」は COL で見つかりませんでした</li>`; return; }
          col = r.id;
        }
        n = await T.reveal(col);
      } else T.ancestors(n).forEach(a => a.open = true);
      list.innerHTML = ''; box.blur();
      UI.onPick(n, true);
    } catch (err) {
      console.warn(err);
      list.innerHTML = '<li class="empty">読みこめませんでした（通信を確かめて、もう一度）</li>';
    }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#search')) list.innerHTML = ''; });

  // データの版（このアプリについて）
  const M = window.TOL_META;
  $('meta').textContent = `上のほうの樹形図: COL ${M.col.alias}（${M.col.version}）と Open Tree ${M.ott.synth}（${M.ott.date.slice(0, 10)}）から ${M.built} に作成。${T.nodes.length} のまとまり。`;

  // 和名があとから届いたら出しなおす
  function refresh() { if (showing && showing.ja !== shownJa) show(showing); }
  return { show, refresh, onPick() { } };
})();
