// いのちの系統樹 — 詳細の欄・検索・凡例
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => n.toLocaleString('ja-JP');
  const ext = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`;

  // 凡例（色 = 段）
  $('legend').innerHTML = GROUPS.map(g => `<span><i style="background:${g[2]}"></i>${g[1]}</span>`).join('');

  // ---------- 詳細（図鑑の1ページ） ----------
  let showing = null, shownJa = '', token = 0, showingExtra = '';
  function chip(n) {
    const c = GROUP_COLOR[RANK_GROUP(n.rank)];
    return `<button class="chip" data-i="${n.i}"><i style="background:${c}"></i>${esc(n.ja || n.name)}</button>`;
  }
  // 分類の表に出す段（図鑑でおなじみの段）
  const MAJOR = [['domain', 'ドメイン'], ['kingdom', '界'], ['phylum', '門'], ['class', '綱'], ['order', '目'], ['family', '科'], ['genus', '属'], ['species', '種']];
  // 人とその近くの写真は出さない（Wikidata の人の写真には、子ども向けに合わないものがある。RULES 9）
  const NO_IMAGE = /^(Homo|Homo sapiens|Hominidae|Homininae|Hominini|Pan|Pan troglodytes|Pan paniscus)$/;
  function show(n, extra = '') {
    showing = n; shownJa = n.ja; showingExtra = extra; const my = ++token;
    const c = GROUP_COLOR[RANK_GROUP(n.rank)];
    const rk = RANK_JA[n.rank] || '';
    const line = T.ancestors(n).concat([n]);
    const path = T.ancestors(n).filter(a => a.name);
    const notes = [];
    if (n.rank === 'clade') notes.push('Open Tree of Life の系統樹にある、分類の階級をもたない枝（共通の祖先から分かれた仲間）。');
    if (n.colOnly) notes.push('Open Tree の系統樹では見つからなかったので、COL の分類で親のまとまりの下につないでいます。');
    if (n.part) notes.push('COL ではこの中に入るまとまりのうち、いくつかは Open Tree の系統樹で別の場所にあります。ここに残っているのはその残り（種の数も残りの分）です。');
    if (n.live) notes.push('この段は COL の分類（目・科・属・種）。ならびは種の数の多い順で、進化の枝分かれの順ではありません。');
    // すぐ下の名前のあるまとまり（名前のない分かれ目はくぐって数える）
    const kidsNamed = (function cnt(m) { return m.kids.reduce((s, k) => s + (k.name ? 1 : k.more ? 0 : cnt(k)), 0); })(n);
    const rows = MAJOR.map(([r, label]) => {
      const m = line.filter(x => x.rank === r && x.name).pop();
      return m ? `<tr><th>${label}</th><td><button data-i="${m.i}">${esc(m.ja || m.name)}</button>${m.ja ? `<span class="s">${esc(m.name)}</span>` : ''}</td></tr>` : '';
    }).join('');
    const canImg = n.q && !NO_IMAGE.test(n.name);
    $('detail').innerHTML = extra + `
      <div class="d-rank">${rk ? `<span class="tag" style="background:${c}">${esc(rk)}</span>` : ''}${n.count ? `<span>${fmt(n.count)} 種</span>` : ''}</div>
      <h2>${n.extinct ? '† ' : ''}${esc(n.ja || n.name)}${n.part ? '（一部）' : ''}</h2>
      <p class="sci">${n.rank !== 'root' ? `<i>${esc(n.name)}</i>` : ''} <span class="auth" id="d-auth"></span></p>
      <div class="acts"><button class="act" data-act="cmp">どこで分かれた？ ほかとくらべる</button><button class="act" data-act="trip">ここから ふしぎ旅</button></div>
      <div class="plate" id="d-plate">${canImg ? '<p class="none">図を読みこみ中…</p>' : ''}</div>
      <p class="wd" id="d-wd"></p>
      ${rows ? `<h3>分類</h3><table class="cls">${rows}</table>` : ''}
      <h3>しらべ</h3>
      <dl class="facts">
        ${n.count ? `<dt>種の数</dt><dd>${fmt(n.count)} 種 <small>（COL にのっている今の種と絶滅した種）</small></dd>` : ''}
        ${kidsNamed ? `<dt>すぐ下</dt><dd>${fmt(kidsNamed)} のまとまり${n.kids.some(k => k.more) ? '（まだ続きあり）' : ''}</dd>` : ''}
        ${n.extinct ? `<dt>絶滅</dt><dd>絶滅した生きもの（COL の記録）</dd>` : ''}
        <dt>位置</dt><dd>根もとから ${path.length} 段め</dd>
      </dl>
      ${notes.map(s => `<p class="note">${esc(s)}</p>`).join('')}
      ${path.length ? `<details class="path"><summary>根もとからの道すじ（${path.length} 段）</summary><div class="path">${path.map(chip).join('<span class="arr">›</span>')}</div></details>` : ''}
      <p class="silcredit" id="d-sil"></p>
      <p class="links" id="d-links">${n.col ? ext('https://www.catalogueoflife.org/data/taxon/' + encodeURIComponent(n.col), 'Catalogue of Life') : ''}</p>`;
    // シルエット（樹形図で動いているもの）の作者と条件
    C.silhouette(n).then(sl => {
      if (my !== token || !sl) return;
      $('d-sil').innerHTML = `樹形図のシルエット${sl.from ? `（${esc(sl.from)}の絵）` : ''}: ${esc(sl.author || '作者不明')} ／ ${ext(sl.licenseUrl, sl.license)} ／ ${ext(sl.page, 'PhyloPic')}`;
    }).catch(() => { });
    // あとから読むもの（著者・説明・図・Wikipedia）
    if (n.col) API.taxon(n.col).then(d => {
      if (my !== token) return;
      const a = d.name && d.name.authorship;
      if (a) $('d-auth').textContent = a;
      if (d.extinct && !n.extinct) { n.extinct = true; T.onChange(); }
    }).catch(() => { });
    if (n.q) API.wdInfo(n.q).then(async w => {
      if (my !== token) return;
      const desc = w.descJa || w.descEn;
      $('d-wd').innerHTML = desc ? esc(desc) + ` <small>（Wikidata${w.descJa ? '' : '・英語'}）</small>` : '';
      const L = $('d-links');
      if (w.wikiJa) L.insertAdjacentHTML('beforeend', ext(w.wikiJa, 'Wikipedia（日本語）'));
      if (w.wikiEn) L.insertAdjacentHTML('beforeend', ext(w.wikiEn, 'Wikipedia（英語）'));
      L.insertAdjacentHTML('beforeend', ext('https://www.wikidata.org/wiki/' + n.q, 'Wikidata'));
      if (!canImg) return;
      let imgs = [], files = w.imgs, from = '';
      try {
        if (!files.length) { files = await API.leadImage(w.enTitle); from = files.length ? 'wiki' : ''; }
        imgs = await API.images(files);
      } catch (e) { console.warn(e); }
      imgs.forEach(im => im.from = from);
      if (my !== token) return;
      plate(n, imgs, files.length);
    }).catch(() => { const P = $('d-plate'); if (P && my === token) P.innerHTML = ''; });
  }
  // 図: 写真と、作者・ライセンス・もとのページ（Wikimedia Commons）
  function plate(n, imgs, had) {
    const P = $('d-plate');
    if (!imgs.length) {
      P.innerHTML = `<p class="none">${had ? '登録されている図は、使える条件が合わないので出していません。' : 'この仲間の図は、まだ見つかりません（Wikidata・Wikipedia に登録なし）。'}</p>`;
      return;
    }
    const name = esc(n.ja || n.name);
    P.innerHTML = imgs.slice(0, 2).map((im, k) => `<figure>
      <img src="${esc(im.src)}" alt="${name}" referrerpolicy="no-referrer">
      <figcaption><b>図${imgs.length > 1 ? k + 1 : ''}　${name}</b>${n.ja ? ` <i class="sci">${esc(n.name)}</i>` : ''}<br>
      ${im.from === 'wiki' ? '（英語版 Wikipedia の記事の図）<br>' : ''}写真: ${esc(im.author)} ／ ${im.licenseUrl ? ext(im.licenseUrl, im.license) : esc(im.license)} ／ ${ext(im.page, 'Wikimedia Commons')}</figcaption>
    </figure>`).join('');
    // 読めなかった写真は図ごとかくす
    P.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.closest('figure').remove()));
  }
  $('detail').addEventListener('click', e => {
    const act = e.target.closest('button.act');
    if (act) { if (act.dataset.act === 'cmp') Compare.start(showing); else { Compare.clear(false); UI.onTrip(showing); } return; }
    const b = e.target.closest('.chip, table.cls button');
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
          // 学名ぴったりの名前（受け入れられた名前を先に。別名・亜属なら、COL がいま使っている名前へ）
          const d = await API.exact(it.name);
          const rs = (d.result || []).filter(r => r.usage.name.scientificName === it.name);
          const r = rs.find(r => r.usage.status === 'accepted') || rs.find(r => r.usage.accepted);
          if (!r) { list.innerHTML = `<li class="empty">「${esc(it.name)}」は COL で見つかりませんでした</li>`; return; }
          col = r.usage.status === 'accepted' ? r.id : r.usage.accepted.id;
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
  function refresh() { if (showing && showing.ja !== shownJa) show(showing, showingExtra); }
  return { show, refresh, onPick() { }, onTrip() { } };
})();
