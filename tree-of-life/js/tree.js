// いのちの系統樹 — 木のデータ（上のほうは data/backbone.js、綱より下は開いたときに COL から）
'use strict';
const RANK_JA = {
  root: '', domain: 'ドメイン', superkingdom: '上界', kingdom: '界', subkingdom: '亜界', infrakingdom: '下界',
  superphylum: '上門', phylum: '門', subphylum: '亜門', infraphylum: '下門', parvphylum: '小門',
  gigaclass: '巨綱', megaclass: '大綱', superclass: '上綱', class: '綱', subclass: '亜綱', infraclass: '下綱', subterclass: '小綱',
  superorder: '上目', order: '目', suborder: '亜目', infraorder: '下目', parvorder: '小目',
  superfamily: '上科', epifamily: '上科', family: '科', subfamily: '亜科', tribe: '族', subtribe: '亜族',
  genus: '属', subgenus: '亜属', section: '節', subsection: '亜節', series: '列',
  species: '種', subspecies: '亜種', variety: '変種', subvariety: '亜変種', form: '品種', forma: '品種',
  clade: '枝', unranked: '階級なし', other: '階級なし',
};
// 色は「どの段か」ごとに7つ（界・門・綱・目・科・属・種）。ひと目で段が分かるように
const RANK_GROUP = r => {
  if (/^(root|domain|superkingdom|kingdom|subkingdom|infrakingdom)$/.test(r)) return 'kingdom';
  if (/phylum$/.test(r)) return 'phylum';
  if (/class$/.test(r)) return 'class';
  if (/order$/.test(r)) return 'order';
  if (/family$|^tribe$|^subtribe$/.test(r)) return 'family';
  if (/genus$|^section$|^subsection$|^series$/.test(r)) return 'genus';
  if (/species$|^variety$|^subvariety$|^form/.test(r)) return 'species';
  return 'clade';
};
const GROUPS = [
  ['kingdom', '界・ドメイン', '#e8eef2'], ['phylum', '門', '#c79bff'], ['class', '綱', '#6fb6ff'], ['order', '目', '#55d6b0'],
  ['family', '科', '#ffd166'], ['genus', '属', '#ff9f5a'], ['species', '種', '#ff7aa2'], ['clade', '枝（階級なし）', '#8fa3ad'],
];
const GROUP_COLOR = Object.fromEntries(GROUPS.map(g => [g[0], g[2]]));

const T = (() => {
  const nodes = [];          // すべてのふし
  const byCol = new Map();   // COL id → ふし
  function add(p) {
    const n = Object.assign({ i: nodes.length, parent: null, kids: [], name: '', ja: '', rank: 'clade', col: '', count: 0,
      q: '', canLoad: false, colOnly: false, live: false, open: false, loaded: false, loading: false, extinct: false }, p);
    nodes.push(n);
    if (n.col) byCol.set(n.col, n);
    if (n.parent) n.parent.kids.push(n);
    return n;
  }
  // data/backbone.js: [親, 学名, 和名, 階級, COL id, 種の数, Wikidata id, しるし]
  for (const r of window.TOL_ROWS) {
    add({ parent: r[0] >= 0 ? nodes[r[0]] : null, name: r[1], ja: r[2], rank: r[3], col: r[4], count: r[5], q: r[6],
      canLoad: !!(r[7] & 1), colOnly: !!(r[7] & 2), part: !!(r[7] & 4) });
  }
  const root = nodes[0];
  root.ja = '細胞をもつ生きもの';

  const named = n => !!n.name || n.more;
  const expandable = n => n.kids.length > 0 || n.canLoad;
  // 名前のないふしは、いつも開いている（枝分かれの形だけ見せる）
  const isOpen = n => !named(n) || n.open;

  // COL から子を1ページ読む。もう木にあるもの（上のほうに入れたもの）はのぞく
  async function loadKids(n, offset = 0) {
    if (n.loading) return;
    n.loading = true;
    try {
      const d = await API.children(n.col, offset, 100);
      const res = (d.result || []).filter(r => r.status === 'accepted' && !byCol.has(r.id));
      // 「あと N 件」のふしは消してから足す
      n.kids = n.kids.filter(k => !k.more);
      res.sort((a, b) => (b.count || 0) - (a.count || 0));
      const fresh = res.map(r => add({ parent: n, name: r.name, rank: r.rank, col: r.id, count: r.count || 0,
        canLoad: (r.childCount || 0) > 0, live: true, extinct: !!r.extinct }));
      const next = offset + 100;
      if (d.total > next) add({ parent: n, more: true, offset: next, rest: d.total - next, rank: 'clade' });
      n.loaded = true;
      fillJa(fresh);
      return fresh;
    } finally { n.loading = false; }
  }
  // 和名をまとめて（Wikidata）。見つからなくても困らない
  async function fillJa(list) {
    for (let i = 0; i < list.length; i += 80) {
      const part = list.slice(i, i + 80);
      try {
        const m = await API.jaNames([...new Set(part.map(n => n.name))]);
        for (const n of part) if (m[n.name]) { n.ja = n.ja || m[n.name].ja; n.q = n.q || m[n.name].q; }
        T.onChange();
      } catch (e) { console.warn('Wikidata', e); }
    }
  }
  // 開く（必要なら読む）。戻り値: 読みこみの Promise
  async function open(n) {
    n.open = true;
    if (n.canLoad && !n.loaded && n.col) await loadKids(n);
  }
  function ancestors(n) { const a = []; for (let p = n.parent; p; p = p.parent) a.unshift(p); return a; }

  // 検索の結果など、COL id から木の中の場所を作って開く
  async function reveal(colId) {
    if (byCol.has(colId)) { const n = byCol.get(colId); ancestors(n).forEach(a => a.open = true); return n; }
    const path = await API.classification(colId);           // 根もと → 親
    let cur = null, k = -1;
    for (let i = path.length - 1; i >= 0; i--) if (byCol.has(path[i].id)) { cur = byCol.get(path[i].id); k = i; break; }
    if (!cur) cur = root;
    const self = await API.taxon(colId);
    const chain = path.slice(k + 1).concat([{ id: colId, name: self.name.scientificName, rank: self.name.rank }]);
    for (const step of chain) {
      if (cur.col && cur.canLoad && !cur.loaded) await loadKids(cur);
      let nx = byCol.get(step.id);
      if (!nx) {   // 1ページ目にいなかった（子が多い）: その1つだけ足す
        nx = add({ parent: cur, name: step.name, rank: step.rank, col: step.id, canLoad: true, live: true });
        cur.kids = cur.kids.filter(x => x !== nx); cur.kids.unshift(nx);
        fillJa([nx]);
      }
      cur.open = true;
      cur = nx;
    }
    ancestors(cur).forEach(a => a.open = true);
    return cur;
  }
  // 上のほう（とすでに読んだもの）を和名・学名で探す
  function localSearch(text, max = 8) {
    const t = text.trim().toLowerCase();
    if (!t) return [];
    const hits = [];
    for (const n of nodes) {
      if (!n.name) continue;
      const a = n.ja.toLowerCase(), b = n.name.toLowerCase();
      const s = a === t || b === t ? 0 : a.startsWith(t) || b.startsWith(t) ? 1 : a.includes(t) || b.includes(t) ? 2 : -1;
      if (s >= 0) hits.push([s, -n.count, n]);
    }
    return hits.sort((x, y) => x[0] - y[0] || x[1] - y[1]).slice(0, max).map(h => h[2]);
  }

  return { nodes, root, byCol, named, expandable, isOpen, open, loadKids, reveal, ancestors, localSearch, onChange() { } };
})();
