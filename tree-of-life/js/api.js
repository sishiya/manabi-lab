// いのちの系統樹 — 外のデータを読む（どれもキー不要・CORS あり。同じものは2度読まない）
//   COL  : Catalogue of Life の最新版（ChecklistBank の API, CC BY 4.0）
//   WD   : Wikidata（CC0）の和名・説明・Wikipedia の行き先
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
    exact: name => getJSON(`${COL}/nameusage/search?q=${enc(name)}&type=EXACT&content=SCIENTIFIC_NAME&status=accepted&limit=5`),

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
      const e = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels|descriptions|sitelinks/urls&languages=ja|en&sitefilter=jawiki|enwiki&format=json&origin=*`);
      const it = e.entities[qid] || {};
      const pick = (o, k) => o && o[k] ? o[k].value : '';
      const sl = it.sitelinks || {};
      return { ja: pick(it.labels, 'ja'), descJa: pick(it.descriptions, 'ja'), descEn: pick(it.descriptions, 'en'),
        wikiJa: sl.jawiki ? sl.jawiki.url : '', wikiEn: sl.enwiki ? sl.enwiki.url : '' };
    },
  };
})();
