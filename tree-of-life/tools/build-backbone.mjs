// いのちの系統樹 — 上のほう（界〜綱）の樹形図を作る道具（作るときだけ。アプリは data/backbone.js を読むだけ）
// 使い方（リポジトリのルートで）: node tree-of-life/tools/build-backbone.mjs
//   1. Catalogue of Life（COL, CC BY 4.0）の最新版から、界〜綱のまとまりを全部集める（ウイルスはのぞく）
//   2. Open Tree of Life（CC0）で同じ学名を探し、合成系統樹からその枝分かれの形（induced subtree）を取る
//   3. Open Tree で見つからないまとまりは、COL の親の下につなぐ
//   4. Wikidata（CC0）から和名（日本語のラベル）
// 途中の結果は tools/cache/ におく（Git に入れない）。もう一度走らせると、そこから読む（API を何度もたたかない）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, 'cache');
const OUT = path.join(HERE, '..', 'data', 'backbone.js');
fs.mkdirSync(CACHE, { recursive: true });
const UA = 'manabi-lab tree-of-life build (https://github.com/sishiya/manabi-lab)';
const COL = 'https://api.checklistbank.org/dataset/3LR';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cached(name, fn) {
  const f = path.join(CACHE, name + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const v = await fn();
  fs.writeFileSync(f, JSON.stringify(v));
  return v;
}
async function getJSON(url, opt = {}) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { ...opt, headers: { 'user-agent': UA, accept: 'application/json', ...(opt.headers || {}) } });
      if (r.ok) return await r.json();
      const t = await r.text();
      if (r.status === 400) return { __error: r.status, body: t };
      console.warn(r.status, url.slice(0, 120));
    } catch (e) { console.warn(String(e), url.slice(0, 120)); }
    await sleep(1500 * (i + 1));
  }
  throw new Error('取れない: ' + url);
}

// ---------- 1. COL: 界〜綱 ----------
// これらの階級のまとまりは、さらに中まで集める。綱（class）と、それより下の階級は「葉」（アプリで開いたときに API で読む）
const ABOVE = new Set(['domain', 'superkingdom', 'kingdom', 'subkingdom', 'infrakingdom', 'superphylum', 'phylum', 'subphylum',
  'infraphylum', 'parvphylum', 'superclass', 'megaclass', 'gigaclass', 'unranked']);
async function colChildren(id) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const d = await getJSON(`${COL}/tree/${encodeURIComponent(id)}/children?limit=1000&offset=${off}`);
    out.push(...(d.result || []));
    if (d.last !== false) break;
  }
  return out;
}
const col = await cached('col', async () => {
  const meta = await getJSON(COL);
  const roots = (await getJSON(`${COL}/tree?limit=50`)).result.filter(r => r.name !== 'Viruses');
  const taxa = [];
  const pick = r => ({ id: r.id, parent: r.parentId || null, name: r.name, rank: r.rank, count: r.count || 0, kids: r.childCount || 0, extinct: !!r.extinct });
  const queue = roots.map(r => ({ ...pick(r), parent: null }));
  let calls = 0;
  while (queue.length) {
    const t = queue.shift();
    taxa.push(t);
    if (ABOVE.has(t.rank) && t.kids > 0) {
      const ch = await colChildren(t.id); calls++;
      t.expanded = true;
      for (const c of ch) if (c.status === 'accepted') queue.push(pick(c));
      if (calls % 50 === 0) console.log('COL', calls, 'calls,', taxa.length, 'taxa');
      await sleep(120);
    }
  }
  return { version: meta.version, alias: meta.alias, doi: meta.doi, taxa };
});
// 門などのすぐ下に、綱より下の階級（所属のはっきりしない属など）がならぶことがある（子嚢菌門には属が約2千）。
// それは樹形図に入れず、親に「ほかの子は開いたときに読む」しるし（more）をつける
{
  const keep = t => ABOVE.has(t.rank) || t.rank === 'class';
  const byId = Object.fromEntries(col.taxa.map(t => [t.id, t]));
  for (const t of col.taxa) if (!keep(t) && byId[t.parent]) byId[t.parent].more = true;
  col.taxa = col.taxa.filter(keep);
}
console.log('COL', col.alias, col.taxa.length, 'taxa');

// ---------- 2. Open Tree: 学名 → ott_id ----------
const names = [...new Set(col.taxa.map(t => t.name))];
const ottMatch = await cached('ott-match', async () => {
  const res = {};
  for (let i = 0; i < names.length; i += 200) {
    const d = await getJSON('https://api.opentreeoflife.org/v3/tnrs/match_names', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ names: names.slice(i, i + 200), context_name: 'All life', do_approximate_matching: false })
    });
    for (const r of d.results || []) res[r.name] = r.matches.filter(m => !m.is_approximate_match).map(m => ({
      ott: m.taxon.ott_id, rank: m.taxon.rank, syn: m.is_synonym, flags: m.taxon.flags, name: m.taxon.name }));
    await sleep(300);
  }
  return res;
});
// 同じ学名がいくつもあるとき: 階級の同じもの → 別名でないもの の順で選ぶ。合成系統樹からはずされたものは使わない
const BAD = new Set(['extinct', 'extinct_inherited', 'incertae_sedis', 'unplaced', 'hidden', 'barren', 'not_otu']);
const ottOf = {};
for (const t of col.taxa) {
  const ms = (ottMatch[t.name] || []).filter(m => !(m.flags || []).some(f => BAD.has(f)));
  if (!ms.length) continue;
  const best = ms.find(m => m.rank === t.rank && !m.syn) || ms.find(m => !m.syn) || null;
  if (best) ottOf[t.id] = best.ott;
}
// COL と Open Tree で名前のちがう同じまとまり（2026-10-15 に tnrs/match_names で確かめた ott_id）
const ALIAS = { Animalia: 691846 /* Metazoa */, Plantae: 5268475 /* Archaeplastida */ };
for (const t of col.taxa) if (ALIAS[t.name] && t.rank === 'kingdom') ottOf[t.id] = ALIAS[t.name];
console.log('Open Tree で見つかった', Object.keys(ottOf).length, '/', col.taxa.length);

// ---------- 3. Open Tree: 枝分かれの形（induced subtree） ----------
const sub = await cached('ott-induced', async () => {
  let ids = [...new Set(Object.values(ottOf))];
  const dropped = {};
  for (let k = 0; k < 20; k++) {
    const d = await getJSON('https://api.opentreeoflife.org/v3/tree_of_life/induced_subtree', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ott_ids: ids, label_format: 'name_and_id' })
    });
    if (d.newick) return { newick: d.newick, dropped };
    let bad = {};
    try { bad = (JSON.parse(d.body || '{}').unknown) || {}; } catch { }
    if (!Object.keys(bad).length) throw new Error('induced_subtree: ' + JSON.stringify(d).slice(0, 300));
    Object.assign(dropped, bad);
    const badSet = new Set(Object.keys(bad).map(s => +s.replace('ott', '')));
    ids = ids.filter(i => !badSet.has(i));
    console.log('合成系統樹にないものをのぞく', badSet.size);
  }
  throw new Error('induced_subtree が終わらない');
});
for (const s of Object.keys(sub.dropped)) { const o = +s.replace('ott', ''); for (const k in ottOf) if (ottOf[k] === o) delete ottOf[k]; }

// newick を読む（ラベルは 'Name_ott123' か 'mrcaott1ott2'）
function parseNewick(s) {
  let i = 0;
  function label() {
    let out = '';
    if (s[i] === "'") { i++; while (i < s.length) { if (s[i] === "'" && s[i + 1] === "'") { out += "'"; i += 2; } else if (s[i] === "'") { i++; break; } else out += s[i++]; } }
    else while (i < s.length && !',();:'.includes(s[i])) out += s[i++];
    return out;
  }
  function node() {
    const n = { kids: [] };
    if (s[i] === '(') { i++; n.kids.push(node()); while (s[i] === ',') { i++; n.kids.push(node()); } i++; }
    n.label = label();
    if (s[i] === ':') { i++; while (i < s.length && !',();'.includes(s[i])) i++; }
    return n;
  }
  return node();
}
const otTree = parseNewick(sub.newick.trim());

// ---------- 4. ひとつの木にまとめる ----------
// nodes: { name, rank, col, count, ott, kids[] }。Open Tree の形が先、そこへ COL だけのまとまりをつなぐ
const colById = Object.fromEntries(col.taxa.map(t => [t.id, t]));
const colByOtt = {};
for (const [cid, o] of Object.entries(ottOf)) (colByOtt[o] ||= []).push(colById[cid]);
const placed = {};   // COL id → 木のふし
function fromOT(n) {
  const m = /^(.*)_ott(\d+)$/.exec(n.label.replace(/ /g, '_'));
  const out = { name: null, rank: 'clade', col: null, count: 0, kids: [] };
  if (m) {
    out.ott = +m[2];
    out.name = m[1].replace(/_/g, ' ');
    out.name = out.name.replace(/\s*\(.* in .*\)$/, '');   // 'Craniata (subphylum in Deuterostomia)' → 'Craniata'
    if (/\d/.test(out.name)) out.name = null;   // 'h2007-2' のような作業用の名前は、名前のないふしとして扱う
    const cs = colByOtt[out.ott];
    if (cs) {
      // 同じ Open Tree のまとまりに COL の名前が2つ以上あたるときは、階級の高いほうをこのふしに、ほかは子に
      const c = cs[0];
      Object.assign(out, { name: c.name, rank: c.rank, col: c.id, count: c.count });
      placed[c.id] = out;
      for (const c2 of cs.slice(1)) { const k = { name: c2.name, rank: c2.rank, col: c2.id, count: c2.count, kids: [] }; placed[c2.id] = k; out.kids.push(k); }
    }
  }
  for (const k of n.kids) out.kids.push(fromOT(k));
  return out;
}
const root = fromOT(otTree);
root.name = root.name || 'すべての細胞の生きもの'; root.rank = root.rank === 'clade' ? 'root' : root.rank;
// Open Tree にないまとまり: いちばん近い「置いた」祖先の下へ
function attach(t) {
  if (placed[t.id]) return placed[t.id];
  const node = { name: t.name, rank: t.rank, col: t.id, count: t.count, kids: [], colOnly: true };
  placed[t.id] = node;
  const parent = t.parent && colById[t.parent] ? attach(colById[t.parent]) : root;
  parent.kids.push(node);
  return node;
}
for (const t of col.taxa) attach(t);
// 中まで集めた COL のまとまりで、Open Tree にない・子がだれも残らなかったもの（子は Open Tree の別の場所にいる）は消す
function prune(n) {
  n.kids = n.kids.map(prune).filter(Boolean);
  if (n.colOnly && colById[n.col].expanded && !colById[n.col].more && n.kids.length === 0) return null;
  return n;
}
prune(root);
// 名前のない・子が1つだけのふしはまとめる
function squash(n) {
  n.kids = n.kids.map(squash);
  if (!n.name && n.kids.length === 1) return n.kids[0];
  return n;
}
let tree = squash(root);
// 種の数（COL）: 名前のないふし・Open Tree だけのふしは子の合計
// COL だけのまとまりで、子の一部が Open Tree の別の場所へ行ったもの（例: 植物界）は「一部」。種の数も残った子の合計に
for (const n of Object.values(placed)) if (n.colOnly && col.taxa.some(c => c.parent === n.col && placed[c.id] && !n.kids.includes(placed[c.id]))) n.part = true;
function sumCount(n) { const s = n.kids.reduce((a, k) => a + sumCount(k), 0); if (!n.col || n.part) n.count = s; return n.count; }
sumCount(tree);
// COL にまだ種の入っていないまとまり（枠だけ）は、開いても何もないので入れない
function dropEmpty(n) { n.kids = n.kids.filter(k => k.count > 0).map(dropEmpty); return n; }
dropEmpty(tree); tree = squash(tree);

// ---------- 5. Wikidata: 和名 ----------
const allNames = [];
(function walk(n) { if (n.name) allNames.push(n.name); n.kids.forEach(walk); })(tree);
const uniq = [...new Set(allNames)];
const wd = await cached('wikidata', async () => {
  const res = {};
  for (let i = 0; i < uniq.length; i += 150) {
    const vals = uniq.slice(i, i + 150).map(s => JSON.stringify(s)).join(' ');
    const q = `SELECT ?n ?i ?ja WHERE { VALUES ?n { ${vals} } ?i wdt:P225 ?n . OPTIONAL { ?i rdfs:label ?ja FILTER(lang(?ja)='ja') } }`;
    const d = await getJSON('https://query.wikidata.org/sparql', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/sparql-results+json' },
      body: 'query=' + encodeURIComponent(q)
    });
    for (const b of d.results.bindings) {
      const n = b.n.value, qid = b.i.value.split('/').pop(), ja = b.ja ? b.ja.value : '';
      const cur = res[n];
      // 和名のある項目を優先（同じ学名の項目がいくつもあるとき）
      if (!cur || (!cur.ja && ja)) res[n] = { q: qid, ja };
    }
    console.log('Wikidata', Math.min(i + 150, uniq.length), '/', uniq.length);
    await sleep(1000);
  }
  return res;
});

// ---------- 5b. Wikidata: 英語の名前（英語の画面用。I18N.md）----------
// 和名と同じ項目（Q id）の英語のラベル。英語のラベルは学名のまま（Mollusca）のことが多いので、そのときは
// 「一般名」P1843 の英語（mollusc）。学名と同じもの・学名＋著者（'Thermotogae Reysenbach 2001'）は入れない。頭は大文字に（lion → Lion）
const qids = [...new Set(Object.values(wd).map(w => w.q))];
const wdEn = await cached('wikidata-en', async () => {
  const res = {};
  for (let i = 0; i < qids.length; i += 200) {
    const vals = qids.slice(i, i + 200).map(q => 'wd:' + q).join(' ');
    const q = `SELECT ?i ?en ?cn WHERE { VALUES ?i { ${vals} } OPTIONAL { ?i rdfs:label ?en FILTER(lang(?en)='en') } OPTIONAL { ?i wdt:P1843 ?cn FILTER(lang(?cn)='en') } }`;
    const d = await getJSON('https://query.wikidata.org/sparql', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/sparql-results+json' },
      body: 'query=' + encodeURIComponent(q)
    });
    for (const b of d.results.bindings) {
      const r = res[b.i.value.split('/').pop()] ||= { label: '', cn: [] };
      if (b.en) r.label = b.en.value;
      if (b.cn && !r.cn.includes(b.cn.value)) r.cn.push(b.cn.value);
    }
    console.log('Wikidata en', Math.min(i + 200, qids.length), '/', qids.length);
    await sleep(1000);
  }
  return res;
});
const enName = (w, sci) => {
  const e = w && wdEn[w.q];
  if (!e) return '';
  const ok = s => s && s.toLowerCase() !== sci.toLowerCase() && !s.toLowerCase().startsWith(sci.toLowerCase() + ' ');
  const s = ok(e.label) ? e.label : e.cn.sort().find(ok) || '';
  const t = s.split(';')[0].trim();   // 'Alphaproteobacterium; alphaproteobacteria' → 前だけ
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

// ---------- 6. 書き出す ----------
// 1ふし = [親の番号, 学名, 和名, 階級, COL id, 種の数, Wikidata id, しるし, 英語の名前]
//   しるし: 1 = 開いたときに COL から子を読む（綱、または綱より下の子もいるまとまり）, 2 = Open Tree にない（COL の親の下へつないだ）, 4 = その一部（ほかの子は Open Tree の別の場所）
const rows = [];
(function walk(n, p) {
  const w = n.name && wd[n.name];
  let ja = w && w.ja && w.ja !== n.name ? w.ja : '';
  const t = n.col && colById[n.col];
  const flag = (t && ((!t.expanded && t.kids > 0) || t.more) ? 1 : 0) | (n.colOnly ? 2 : 0) | (n.part ? 4 : 0);
  const idx = rows.length;
  rows.push([p, n.name || '', ja, n.rank, n.col || '', n.count, w ? w.q : '', flag, n.name ? enName(w, n.name) : '']);
  // 種の数の多い順
  n.kids.sort((a, b) => b.count - a.count).forEach(k => walk(k, idx));
})(tree, -1);
const ott = await getJSON('https://api.opentreeoflife.org/v3/tree_of_life/about', { method: 'POST' });
const meta = { col: { version: col.version, alias: col.alias, doi: col.doi }, ott: { synth: ott.synth_id, date: ott.date_created }, built: new Date().toISOString().slice(0, 10) };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, '// 作った道具: tools/build-backbone.mjs（手で直さない）。COL（CC BY 4.0）・Open Tree of Life（CC0）・Wikidata（CC0）から\n'
  + 'window.TOL_META=' + JSON.stringify(meta) + ';\n'
  + 'window.TOL_ROWS=' + JSON.stringify(rows) + ';\n');
console.log('書いた', OUT, rows.length, 'ふし', (fs.statSync(OUT).size / 1024).toFixed(0), 'KB');
