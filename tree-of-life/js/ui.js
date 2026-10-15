// いのちの系統樹 — 詳細の欄・検索・凡例
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => n.toLocaleString(L('ja-JP', 'en-US'));
  const ext = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`;
  const SEP = L('／', '/');
  const silFrom = sl => sl.from ? L(`（${esc(sl.from)}の絵）`, ` (drawing of ${esc(sl.from)})`) : '';

  // 凡例（色 = 段）
  $('legend').innerHTML = GROUPS.map(g => `<span><i style="background:${g[2]}"></i>${g[1]}</span>`).join('');

  // ---------- 詳細（図鑑の1ページ） ----------
  let showing = null, shownJa = '', token = 0, showingExtra = '';
  function chip(n) {
    const c = GROUP_COLOR[RANK_GROUP(n.rank)];
    return `<button class="chip" data-i="${n.i}"><i style="background:${c}"></i>${esc(n.ja || n.name)}</button>`;
  }
  // 分類の表に出す段（図鑑でおなじみの段）
  const MAJOR = ['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'].map(r => [r, RANK_JA[r]]);
  // 人とその近くの写真は出さない（Wikidata の人の写真には、子ども向けに合わないものがある。RULES 9）
  const NO_IMAGE = /^(Homo|Homo sapiens|Hominidae|Homininae|Hominini|Pan|Pan troglodytes|Pan paniscus)$/;
  // すぐ下のなかま（名前のない分かれ目はくぐる）。スマホで樹形図を押しにくいときも、ここからたどれる
  const namedKids = n => n.kids.flatMap(k => k.more ? [] : k.name ? [k] : namedKids(k));
  function kidsHTML(n) {
    if (!T.expandable(n)) return '';
    const ks = namedKids(n), more = (function m(x) { return x.kids.reduce((s, k) => s + (k.more ? k.rest : k.name ? 0 : m(k)), 0); })(n);
    if (!ks.length) return n.canLoad ? `<h3>${L('すぐ下のなかま', 'Groups just below')}</h3><button class="act" data-act="open">${L('すぐ下のなかまを読む', 'Load the groups just below')}</button>` : '';
    const list = ks.slice(0, 40);
    return `<h3>${L('すぐ下のなかま', 'Groups just below')} <small>${fmt(ks.length + more)}</small></h3><div class="kids">${list.map(chip).join('')}${ks.length > list.length || more ? `<span class="morek">${L(`ほか ${fmt(ks.length - list.length + more)}（樹形図で）`, `${fmt(ks.length - list.length + more)} more (on the tree)`)}</span>` : ''}</div>`;
  }
  function show(n, extra = '') {
    showing = n; shownJa = sig(n); showingExtra = extra; const my = ++token;
    if (!extra) UI.onShown(n);   // アドレスの # を合わせる（main.js）
    const c = GROUP_COLOR[RANK_GROUP(n.rank)];
    const rk = RANK_JA[n.rank] || '';
    const line = T.ancestors(n).concat([n]);
    const path = T.ancestors(n).filter(a => a.name);
    const notes = [];
    if (n.rank === 'clade') notes.push(L('Open Tree of Life の系統樹にある、分類の階級をもたない枝（共通の祖先から分かれた仲間）。', 'A branch on the Open Tree of Life tree that has no rank in the classification (a group that came from one common ancestor).'));
    if (n.colOnly) notes.push(L('Open Tree の系統樹では見つからなかったので、COL の分類で親のまとまりの下につないでいます。', 'Not found on the Open Tree tree, so it is attached under its parent group in the COL classification.'));
    if (n.part) notes.push(L('COL ではこの中に入るまとまりのうち、いくつかは Open Tree の系統樹で別の場所にあります。ここに残っているのはその残り（種の数も残りの分）です。', 'Some groups that COL puts inside this one sit elsewhere on the Open Tree tree. What is left here is the rest (the species count is for the rest too).'));
    if (n.live) notes.push(L('この段は COL の分類（目・科・属・種）。ならびは種の数の多い順で、進化の枝分かれの順ではありません。', 'This level follows the COL classification (order, family, genus, species). It is sorted by number of species, not by the order of evolutionary branching.'));
    // すぐ下の名前のあるまとまり（名前のない分かれ目はくぐって数える）
    const kidsNamed = (function cnt(m) { return m.kids.reduce((s, k) => s + (k.name ? 1 : k.more ? 0 : cnt(k)), 0); })(n);
    const rows = MAJOR.map(([r, label]) => {
      const m = line.filter(x => x.rank === r && x.name).pop();
      return m ? `<tr><th>${label}</th><td><button data-i="${m.i}">${esc(m.ja || m.name)}</button>${m.ja ? `<span class="s">${esc(m.name)}</span>` : ''}</td></tr>` : '';
    }).join('');
    const canImg = n.q && !NO_IMAGE.test(n.name);
    $('detail').innerHTML = extra + `
      <div class="d-card">
        <div class="d-thumb" id="d-plate">${canImg ? '<span class="thumb-wait"></span>' : ''}</div>
        <div class="d-headtext">
          <div class="d-rank">${rk ? `<span class="tag" style="background:${c}">${esc(rk)}</span>` : ''}${n.count ? `<span>${L(`${fmt(n.count)} 種`, `${fmt(n.count)} species`)}</span>` : ''}</div>
          <h2>${n.extinct ? '† ' : ''}${esc(n.ja || n.name)}${n.part ? L('（一部）', ' (part)') : ''}</h2>
          <p class="sci">${n.rank !== 'root' ? `<i>${esc(n.name)}</i>` : ''} <span class="auth" id="d-auth"></span></p>
          <p class="wd" id="d-wd"></p>
        </div>
      </div>
      <p class="credit" id="d-credit"></p>
      <div class="acts"><button class="act" data-act="share" title="${L('このページのリンクをコピー', 'Copy the link to this page')}">${L('リンク', 'Link')}</button></div>
      ${rows ? `<h3>${L('分類', 'Classification')}</h3><table class="cls">${rows}</table>` : ''}
      <h3>${L('しらべ', 'Facts')}</h3>
      <dl class="facts">
        ${n.count ? L(`<dt>種の数</dt><dd>${fmt(n.count)} 種 <small>（COL にのっている今の種と絶滅した種）</small></dd>`, `<dt>Species</dt><dd>${fmt(n.count)} <small>(living and extinct species listed in COL)</small></dd>`) : ''}
        ${kidsNamed ? L(`<dt>すぐ下</dt><dd>${fmt(kidsNamed)} のまとまり${n.kids.some(k => k.more) ? '（まだ続きあり）' : ''}</dd>`, `<dt>Just below</dt><dd>${fmt(kidsNamed)} groups${n.kids.some(k => k.more) ? ' (more to load)' : ''}</dd>`) : ''}
        ${n.extinct ? L(`<dt>絶滅</dt><dd>絶滅した生きもの（COL の記録）</dd>`, `<dt>Extinct</dt><dd>An extinct living thing (COL record)</dd>`) : ''}
        ${L(`<dt>位置</dt><dd>根もとから ${path.length} 段め</dd>`, `<dt>Position</dt><dd>Step ${path.length} from the root</dd>`)}
      </dl>
      ${kidsHTML(n)}
      ${notes.map(s => `<p class="note">${esc(s)}</p>`).join('')}
      ${path.length ? `<details class="path"><summary>${L(`根もとからの道すじ（${path.length} 段）`, `Path from the root (${path.length} steps)`)}</summary><div class="path">${path.map(chip).join('<span class="arr">›</span>')}</div></details>` : ''}
      <p class="silcredit" id="d-sil"></p>
      <p class="links" id="d-links">${n.col ? ext('https://www.catalogueoflife.org/data/taxon/' + encodeURIComponent(n.col), 'Catalogue of Life') : ''}</p>`;
    // シルエット（樹形図で動いているもの）の作者と条件
    C.silhouette(n).then(sl => {
      if (my !== token || !sl) return;
      $('d-sil').innerHTML = `${L('樹形図のシルエット', 'Silhouette on the tree')}${silFrom(sl)}: ${esc(sl.author || L('作者不明', 'Unknown author'))} ${SEP} ${ext(sl.licenseUrl, sl.license)} ${SEP} ${ext(sl.page, 'PhyloPic')}`;
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
      // 説明は今の言語で（日本語の画面では、なければ英語の説明に「英語」と添える）
      const desc = LANG === 'en' ? w.descEn : w.descJa || w.descEn;
      $('d-wd').innerHTML = desc ? esc(desc) + L(` <small>（Wikidata${w.descJa ? '' : '・英語'}）</small>`, ' <small>(Wikidata)</small>') : '';
      const lk = $('d-links');
      const wikis = [[w.wikiJa, L('Wikipedia（日本語）', 'Wikipedia (Japanese)')], [w.wikiEn, L('Wikipedia（英語）', 'Wikipedia (English)')]];
      if (LANG === 'en') wikis.reverse();
      for (const [u, t] of wikis) if (u) lk.insertAdjacentHTML('beforeend', ext(u, t));
      lk.insertAdjacentHTML('beforeend', ext('https://www.wikidata.org/wiki/' + n.q, 'Wikidata'));
      if (!canImg) return;
      let imgs = [], files = w.imgs, from = '';
      try {
        if (!files.length) { files = await API.leadImage(w.enTitle); from = files.length ? 'wiki' : ''; }
        imgs = await API.images(files);
      } catch (e) { console.warn(e); }
      imgs.forEach(im => im.from = from);
      if (my !== token) return;
      plate(n, imgs, files.length, my);
    }).catch(() => { const P = $('d-plate'); if (P && my === token) P.innerHTML = ''; });
  }
  // 図: 写真と、作者・ライセンス・もとのページ（Wikimedia Commons）
  // 図: カードの左に小さく（押すと大きく）。作者と条件はカードの下に1行、大きくしたときはくわしく
  //   写真がないときは、樹形図のシルエットを代わりに（シルエットの作者・条件を出す）
  let lightItems = [];
  function plate(n, imgs, had, my) {
    const P = $('d-plate'), Cr = $('d-credit');
    const name = esc(n.ja || n.name);
    if (!imgs.length) {
      C.silhouette(n).then(sl => {
        if (my !== token) return;
        if (!sl) { P.innerHTML = ''; P.classList.add('empty'); Cr.textContent = had ? L('登録されている図は、使える条件が合わないので出していません。', 'The registered pictures are not shown because their licenses do not allow it.') : ''; return; }
        P.innerHTML = `<span class="sil"><img src="${esc(sl.src)}" alt="${L(`${name}のシルエット`, `Silhouette of ${name}`)}" referrerpolicy="no-referrer"></span>`;
        Cr.innerHTML = `${L('シルエット', 'Silhouette')}${silFrom(sl)}: ${esc(sl.author || L('作者不明', 'Unknown author'))} ${SEP} ${ext(sl.licenseUrl, sl.license)} ${SEP} ${ext(sl.page, 'PhyloPic')}`;
      }).catch(() => { P.innerHTML = ''; P.classList.add('empty'); });
      return;
    }
    lightItems = imgs.slice(0, 3).map(im => ({ im, name, sci: n.ja ? n.name : '' }));
    P.innerHTML = `<button class="thumb" title="${L('大きく見る', 'View larger')}"><img src="${esc(imgs[0].src)}" alt="${name}" referrerpolicy="no-referrer">${imgs.length > 1 ? `<span class="cnt">${Math.min(3, imgs.length)}</span>` : ''}</button>`;
    const im = imgs[0];
    Cr.innerHTML = `${L('写真', 'Photo')}: ${esc(im.author)} ${SEP} ${im.licenseUrl ? ext(im.licenseUrl, im.license) : esc(im.license)} ${SEP} ${ext(im.page, 'Commons')}`;
    P.querySelector('img').addEventListener('error', () => { P.innerHTML = ''; P.classList.add('empty'); Cr.textContent = ''; });
  }
  // 大きく見る（押すか Esc で閉じる）
  const lb = $('lightbox');
  function openLight() {
    if (!lightItems.length) return;
    lb.innerHTML = `<div class="lb-in">${lightItems.map((x, k) => `<figure>
      <img src="${esc(x.im.src)}" alt="${x.name}" referrerpolicy="no-referrer">
      <figcaption><b>${L('図', 'Fig. ')}${lightItems.length > 1 ? k + 1 : ''}${L('　', ' ')}${x.name}</b>${x.sci ? ` <i class="sci">${esc(x.sci)}</i>` : ''}<br>
      ${x.im.from === 'wiki' ? L('（英語版 Wikipedia の記事の図）<br>', '(picture from the English Wikipedia article)<br>') : ''}${L('写真', 'Photo')}: ${esc(x.im.author)} ${SEP} ${x.im.licenseUrl ? ext(x.im.licenseUrl, x.im.license) : esc(x.im.license)} ${SEP} ${ext(x.im.page, 'Wikimedia Commons')}</figcaption></figure>`).join('')}</div>
      <button class="lb-close" title="${L('とじる', 'Close')}">×</button>`;
    lb.hidden = false;
  }
  lb.addEventListener('click', e => { if (!e.target.closest('a') && (e.target === lb || e.target.closest('.lb-close') || e.target.tagName === 'IMG')) lb.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) lb.hidden = true; });
  $('detail').addEventListener('click', e => {
    if (e.target.closest('.thumb')) { openLight(); return; }
    const act = e.target.closest('button.act');
    if (act) {
      const k = act.dataset.act;
      if (k === 'cmp') Compare.start(showing);
      else if (k === 'open') UI.onOpen(showing);
      else if (k === 'share') share(act);
      else { Compare.clear(false); UI.onTrip(showing); }
      return;
    }
    const b = e.target.closest('.chip, table.cls button');
    if (b) UI.onPick(T.nodes[+b.dataset.i]);
  });

  // ---------- 検索 ----------
  const box = $('q'), list = $('results');
  let timer = 0, seq = 0;
  const hasJa = s => /[぀-ヿ㐀-鿿]/.test(s);
  const DOT = L('・', ' · ');
  function render(items, busy) {
    if (!items.length && !busy) { list.innerHTML = box.value.trim() ? `<li class="empty">${L('見つかりません', 'Nothing found')}</li>` : ''; return; }
    list.innerHTML = items.map((it, k) => `<li><button data-k="${k}">
      <i style="background:${GROUP_COLOR[RANK_GROUP(it.rank || 'clade')]}"></i>
      <b>${esc(it.title)}</b> <span>${esc(it.sub || '')}</span></button></li>`).join('') + (busy ? `<li class="empty">${L('さがしています…', 'Searching…')}</li>` : '');
    list._items = items;
  }
  async function run() {
    const text = box.value.trim(), my = ++seq;
    if (!text) { render([]); return; }
    const local = T.localSearch(text, 6).map(n => ({ title: n.ja || n.name, sub: (n.ja ? n.name + DOT : '') + (RANK_JA[n.rank] || ''), rank: n.rank, node: n }));
    render(local, true);
    let remote = [];
    // 日本語: 和名は Wikidata、ローマ字は COL の学名。英語: ふつうの名前（Wikidata）と学名（COL）の両方（どちらもローマ字なので）
    const byName = async () => (await API.searchJa(text)).map(x => ({ title: x.ja || x.name, sub: x.name + (x.desc ? DOT + x.desc : ''), name: x.name, rank: 'clade' }));
    const bySci = async () => (await API.suggest(text)).filter(x => x.status === 'accepted').map(x => ({ title: x.match, sub: (RANK_JA[x.rank] || x.rank) + (x.context ? DOT + x.context : ''), col: x.usageId, rank: x.rank }));
    try {
      if (hasJa(text)) remote = await byName();
      else if (LANG === 'en') {
        const [a, b] = await Promise.all([byName().catch(() => []), text.length >= 3 ? bySci().catch(() => []) : []]);
        // 先に出すほう: 学名がぴったり → 学名（Panthera leo）、ふつうの名前がぴったり → ふつうの名前（lion。Lionychina より先に）、
        // あとは学名の候補が打った文字で始まるなら学名、でなければふつうの名前
        const t = text.toLowerCase(), eq = x => x.title.toLowerCase() === t;
        const sciFirst = b.some(eq) || (!a.some(eq) && b.length && b[0].title.toLowerCase().startsWith(t));
        const seenSci = new Set(b.map(x => x.title));
        const a2 = a.filter(x => !seenSci.has(x.name));   // 同じ学名は COL のほう（そのまま開ける）だけ
        remote = sciFirst ? b.concat(a2) : a2.concat(b);
      } else if (text.length >= 3) remote = await bySci();
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
    list.innerHTML = `<li class="empty">${L('枝をたどっています…', 'Following the branches…')}</li>`;
    try {
      let n = it.node;
      if (!n) {
        let col = it.col;
        if (!col) {   // 和名（Wikidata）→ 学名 → COL
          // 学名ぴったりの名前（受け入れられた名前を先に。別名・亜属なら、COL がいま使っている名前へ）
          const d = await API.exact(it.name);
          const rs = (d.result || []).filter(r => r.usage.name.scientificName === it.name);
          const r = rs.find(r => r.usage.status === 'accepted') || rs.find(r => r.usage.accepted);
          if (!r) { list.innerHTML = `<li class="empty">${L(`「${esc(it.name)}」は COL で見つかりませんでした`, `“${esc(it.name)}” was not found in COL`)}</li>`; return; }
          col = r.usage.status === 'accepted' ? r.id : r.usage.accepted.id;
        }
        n = await T.reveal(col);
      } else T.ancestors(n).forEach(a => a.open = true);
      list.innerHTML = ''; box.blur();
      UI.onPick(n, true);
    } catch (err) {
      console.warn(err);
      list.innerHTML = `<li class="empty">${L('読みこめませんでした（通信を確かめて、もう一度）', 'Could not load (check your connection and try again)')}</li>`;
    }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#search')) list.innerHTML = ''; });

  // データの版（このアプリについて）
  const M = window.TOL_META;
  $('meta').textContent = `上のほうの樹形図: COL ${M.col.alias}（${M.col.version}）と Open Tree ${M.ott.synth}（${M.ott.date.slice(0, 10)}）から ${M.built} に作成。${T.nodes.length} のまとまり。`;
  $('meta-en').textContent = `Upper tree: built on ${M.built} from COL ${M.col.alias} (${M.col.version}) and Open Tree ${M.ott.synth} (${M.ott.date.slice(0, 10)}). ${T.nodes.length} groups.`;

  // 和名があとから届いたら出しなおす
  // 和名があとから届いたら出しなおす（自分と、すぐ下のなかまの和名・数）
  function sig(n) { return n.ja + '|' + namedKids(n).map(k => k.ja).join(',') + '|' + n.kids.length; }
  function refresh() { if (showing && sig(showing) !== shownJa) show(showing, showingExtra); }
  // リンクをコピー（アドレスの # に、いま見ている生きもの・くらべている2つが入っている）
  // リンクをコピー。ボタンの文字は変えず（幅が変わって次の行へ回りこまないように）、知らせは樹形図の下に小さく
  async function share(btn) {
    let ok = true;
    try { await navigator.clipboard.writeText(location.href); } catch (e) { ok = false; window.prompt(L('このリンクをコピーしてください', 'Copy this link'), location.href); }
    const msg = L('リンクをコピーしました', 'Link copied');
    if (ok) { const st = $('status'); st.textContent = msg; clearTimeout(share.t); share.t = setTimeout(() => { if (st.textContent === msg) st.textContent = ''; }, 1800); }
    btn.classList.add('done'); setTimeout(() => btn.classList.remove('done'), 600);
  }
  return { show, refresh, onPick() { }, onOpen() { }, onShown() { } };
})();
