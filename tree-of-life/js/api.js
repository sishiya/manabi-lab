// いのちの系統樹 — 外のデータを読む（どれもキー不要・CORS あり。同じものは2度読まない）
//   COL  : Catalogue of Life の最新版（ChecklistBank の API, CC BY 4.0）
//   WD   : Wikidata（CC0）の和名・説明・Wikipedia の行き先・写真の名前（P18）
//   Commons: 写真そのものと、作者・ライセンス（1枚ずつちがう。使ってよいものだけ出す）
'use strict';
const API = (() => {
  const COL = 'https://api.checklistbank.org/dataset/3LR';
  const memo = new Map();
  async function getJSON(url) {
    if (memo.has(url)) return memo.get(url);
    const p = fetch(url, { headers: { accept: 'application/json' } }).then(r => {
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return r.json();
    });
    memo.set(url, p);
    p.catch(() => memo.delete(url));   // 失敗はおぼえない（もう一度ためせる）
    return p;
  }
  const enc = encodeURIComponent;

  return {
    // 子のまとまり（1ページ）。{ total, result:[{id,name,rank,count,childCount,extinct,status}] }
    children: (id, offset = 0, limit = 100) => getJSON(`${COL}/tree/${enc(id)}/children?limit=${limit}&offset=${offset}`),
    // 1つの詳細（著者・絶滅など）
    taxon: id => getJSON(`${COL}/taxon/${enc(id)}`),
    // 根もとから親までの道すじ（自分はふくまない）
    classification: id => getJSON(`${COL}/taxon/${enc(id)}/classification`),
    // 学名の打ちかけから候補
    suggest: q => getJSON(`${COL}/nameusage/suggest?q=${enc(q)}&limit=12&accepted=true`),
    // 学名ぴったりで探す（和名から学名がわかったとき）
    exact: name => getJSON(`${COL}/nameusage/search?q=${enc(name)}&type=EXACT&content=SCIENTIFIC_NAME&limit=10`),

    // Wikidata: 学名の束 → { 学名: { q, ja } }（SPARQL。P225 = 学名）
    // Wikidata の SPARQL は同時にたくさん送ると断られるので、1つずつ順に（失敗したら1回だけやりなおす）
    jaNames(names) {
      const run = () => this._jaNames(names).catch(() => new Promise(r => setTimeout(r, 1500)).then(() => this._jaNames(names)));
      const p = (this._q || Promise.resolve()).then(run, run);
      this._q = p.catch(() => { });
      return p;
    },
    async _jaNames(names) {
      const out = {};
      if (!names.length) return out;
      const vals = names.map(s => JSON.stringify(s)).join(' ');
      const q = `SELECT ?n ?i ?ja WHERE { VALUES ?n { ${vals} } ?i wdt:P225 ?n . OPTIONAL { ?i rdfs:label ?ja FILTER(lang(?ja)='ja') } }`;
      const d = await getJSON('https://query.wikidata.org/sparql?format=json&query=' + enc(q));
      for (const b of d.results.bindings) {
        const n = b.n.value, ja = b.ja ? b.ja.value : '', qid = b.i.value.split('/').pop();
        if (!out[n] || (!out[n].ja && ja)) out[n] = { q: qid, ja: ja === n ? '' : ja };
      }
      return out;
    },
    // Wikidata: 和名などで探す → 学名（P225）のある項目だけ [{ q, ja, desc, name }]
    async searchJa(text) {
      const s = await getJSON(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${enc(text)}&language=ja&uselang=ja&type=item&limit=15&format=json&origin=*`);
      const ids = (s.search || []).map(r => r.id);
      if (!ids.length) return [];
      const e = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=claims|labels|descriptions&languages=ja&format=json&origin=*`);
      const out = [];
      for (const id of ids) {
        const it = e.entities && e.entities[id];
        const p = it && it.claims && it.claims.P225;
        if (!p || !p[0].mainsnak.datavalue) continue;
        out.push({ q: id, name: p[0].mainsnak.datavalue.value,
          ja: it.labels.ja ? it.labels.ja.value : '', desc: it.descriptions.ja ? it.descriptions.ja.value : '' });
      }
      return out;
    },
    // Wikidata: 1項目の説明と Wikipedia の行き先
    async wdInfo(qid) {
      const e = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels|descriptions|claims|sitelinks/urls&languages=ja|en&sitefilter=jawiki|enwiki&format=json&origin=*`);
      const it = e.entities[qid] || {};
      const pick = (o, k) => o && o[k] ? o[k].value : '';
      const sl = it.sitelinks || {};
      const imgs = ((it.claims || {}).P18 || []).map(c => c.mainsnak.datavalue && c.mainsnak.datavalue.value).filter(Boolean).slice(0, 3);
      return { imgs, ja: pick(it.labels, 'ja'), descJa: pick(it.descriptions, 'ja'), descEn: pick(it.descriptions, 'en'),
        wikiJa: sl.jawiki ? sl.jawiki.url : '', wikiEn: sl.enwiki ? sl.enwiki.url : '', enTitle: sl.enwiki ? sl.enwiki.title : '' };
    },
    // Wikidata に写真がないとき: 英語版 Wikipedia の記事の代表の図（自由に使えるものだけ。pilicense=free）のファイル名
    async leadImage(title) {
      if (!title) return [];
      const d = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&titles=${enc(title)}&prop=pageimages&piprop=name&pilicense=free&format=json&origin=*`);
      return Object.values((d.query || {}).pages || {}).map(p => p.pageimage).filter(Boolean).map(s => s.replace(/_/g, ' '));
    },
    // PhyloPic: 学名 → シルエット1枚 { src, w, h, author, license, licenseUrl, page } か null
    //   その名前のまとまりの代表の絵。代表がNCなら、同じまとまりの中で NC でない絵をさがす
    async phylopic(name) {
      const PP = 'https://api.phylopic.org';
      // 版の番号（build）がいる。いちばん上のページの案内から読む
      const root = await getJSON(PP + '/');
      const build = root.build || (JSON.stringify(root).match(/build=(\d+)/) || [])[1];
      const d = await getJSON(`${PP}/nodes?build=${build}&filter_name=${enc(name.toLowerCase())}&embed_items=true&embed_primaryImage=true&page=0`);
      const items = (d._embedded && d._embedded.items) || [];
      // names は「名前」の並び。1つの名前は部分の並び（学名の部分 class=scientific をつなぐ）
      const sci = nm => nm.filter(x => x.class === 'scientific').map(x => x.text).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
      const node = items.find(n => (n.names || []).some(nm => sci(nm) === name.toLowerCase()));
      if (!node) return null;
      const okLic = im => im && im._links && im._links.license && !/-nc/i.test(im._links.license.href);
      let im = node._embedded && node._embedded.primaryImage;
      if (!okLic(im)) {
        const uuid = node._links.self.href.split('/')[2].split('?')[0];
        const r = await getJSON(`${PP}/images?build=${build}&filter_clade=${uuid}&filter_license_nc=false&embed_items=true&page=0`);
        im = ((r._embedded && r._embedded.items) || []).find(okLic);
        if (!im) return null;
      }
      // 縦横比のままの PNG で、長いほうが 256px 前後のもの（なければいちばん小さいもの）
      const ras = (im._links.rasterFiles || []).map(f => { const [w, h] = f.sizes.split('x').map(Number); return { href: f.href, w, h }; });
      if (!ras.length) return null;
      ras.sort((a, b) => Math.max(a.w, a.h) - Math.max(b.w, b.h));
      const pick = ras.find(f => Math.max(f.w, f.h) >= 240) || ras[ras.length - 1];
      const lic = im._links.license.href;
      const licName = /zero/.test(lic) ? 'CC0' : /publicdomain\/mark/.test(lic) ? 'パブリックドメイン' : 'CC ' + (lic.match(/licenses\/([a-z-]+)\/([\d.]+)/) || ['', 'by', ''])[1].toUpperCase() + ' ' + ((lic.match(/licenses\/[a-z-]+\/([\d.]+)/) || ['', ''])[1]);
      const author = im.attribution || (im._links.contributor && im._links.contributor.title) || '';
      return { src: pick.href, w: pick.w, h: pick.h, author, license: licName.trim(), licenseUrl: lic,
        page: 'https://www.phylopic.org' + im._links.self.href.replace(/\?.*$/, '') };
    },
    // Commons: ファイル名 → [{ src, w, h, page, author, license, licenseUrl, title }]
    //   出すのは、作者と条件を書けば使えるもの（CC0・パブリックドメイン・CC BY・CC BY-SA）だけ。
    //   NC・ND・GFDL だけのもの・条件の分からないものは出さない（RULES・no-noncommercial-sources）
    async images(files) {
      if (!files.length) return [];
      const titles = files.map(f => 'File:' + f).join('|');
      const d = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&titles=${enc(titles)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=640&format=json&origin=*`);
      const pages = Object.values((d.query || {}).pages || {});
      const strip = h => new DOMParser().parseFromString(h || '', 'text/html').body.textContent.replace(/\s+/g, ' ').trim();   // 外の HTML は動かさずに文字だけ
      const out = [];
      for (const f of files) {
        const p = pages.find(x => x.title && x.title.replace(/^File:/, '').replace(/_/g, ' ') === f.replace(/_/g, ' '));
        const ii = p && p.imageinfo && p.imageinfo[0];
        if (!ii) continue;
        const m = ii.extmetadata || {}, v = k => (m[k] && m[k].value) || '';
        const lic = strip(v('LicenseShortName'));
        if (v('NonFree') === 'true' || /(^|[^A-Z])(NC|ND)([^A-Z]|$)/.test(lic) || /GFDL(?!.*CC)/i.test(lic) || !/^(CC0|Public domain|PD|CC BY(-SA)? ?\d|CC BY(-SA)?$|No restrictions)/i.test(lic)) continue;
        // 子どもが見て困るものは出さない（RULES 9）。ファイル名と説明でよける
        const text = (f + ' ' + strip(v('ImageDescription')) + ' ' + strip(v('Categories'))).toLowerCase();
        if (/nude|naked|nudity|genital|penis|vagin|vulva|sexual|copulat|mating|breast|裸|性器|交尾|corpse|dead body|死体/.test(text)) continue;
        out.push({ src: ii.thumburl || ii.url, page: ii.descriptionurl, author: strip(v('Artist')).slice(0, 120) || '作者不明',
          license: lic, licenseUrl: v('LicenseUrl'), title: f.replace(/\.[a-z]+$/i, '') });
      }
      return out;
    },
  };
})();
