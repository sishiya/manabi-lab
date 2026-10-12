// 検索・リンクカード用の head の部分と sitemap.xml を、入口の APPS から作りなおす（_dev/REACH.md）。
// 使い方: node _dev/tools/seo.mjs          … 書きかえる
//         node _dev/tools/seo.mjs --check  … 書きかえずに、古いところがあれば知らせる（終了コード 1）
// 入口（index.html）と、APPS にある各アプリの index.html の、アクセス解析の1行の次に
// <!-- seo -->〜<!-- /seo --> を置く（あれば中身を入れかえる）。保管庫のアプリは対象外（noindex）。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'https://sishiya.github.io/manabi-lab/';
const check = process.argv.includes('--check');

const entrancePath = join(root, 'index.html');
const entrance = readFileSync(entrancePath, 'utf8');
const m = entrance.match(/const APPS = (\[[\s\S]*?\n\]);/);
if (!m) throw new Error('index.html に APPS が見つからない');
const APPS = new Function('return ' + m[1])();
const lead = entrance.match(/<p class="lead"><span lang="ja">([^<]+)<\/span>/)[1];

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function block({ url, title, desc, image, w, h }) {
  return [
    '<!-- seo（検索・リンクカード。_dev/tools/seo.mjs が入口の APPS から作る。手で直さない） -->',
    `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:type" content="website"><meta property="og:site_name" content="まなびラボ"><meta property="og:locale" content="ja_JP"><meta property="og:locale:alternate" content="en_US">`,
    `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}"><meta property="og:image:width" content="${w}"><meta property="og:image:height" content="${h}">`,
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@sishiya22">`,
    `<link rel="alternate" hreflang="ja" href="${url}?lang=ja"><link rel="alternate" hreflang="en" href="${url}?lang=en"><link rel="alternate" hreflang="x-default" href="${url}">`,
    '<!-- /seo -->',
  ].join('\n');
}

let stale = [];
function put(path, b) {
  const src = readFileSync(path, 'utf8');
  let out;
  if (/<!-- seo[（ ][\s\S]*?<!-- \/seo -->/.test(src)) {
    out = src.replace(/<!-- seo[（ ][\s\S]*?<!-- \/seo -->/, () => b);
  } else {
    const ga = src.match(/^<script>\/\* アクセス解析[^\n]*\n/m);
    if (!ga) throw new Error(path + ': アクセス解析の1行が見つからない（RULES 8.1）');
    out = src.replace(ga[0], () => ga[0] + b + '\n');
  }
  if (out !== src) { stale.push(path); if (!check) writeFileSync(path, out); }
}

// Google Search Console の所有権の確認（URL プレフィックス https://sishiya.github.io/manabi-lab/。公開してよい値。消すと確認が外れる）
const GSC = '<meta name="google-site-verification" content="dD02qa-rgBbwyVDz8sacKRQIVEWhm3mKeqHTb-JRRIw">';
put(entrancePath, block({ url: BASE, title: 'まなびラボ', desc: lead, image: BASE + 'assets/og.jpg', w: 1200, h: 630 })
  .replace('\n<!-- /seo -->', '\n' + GSC + '\n<!-- /seo -->'));
for (const a of APPS) {
  put(join(root, a.id, 'index.html'), block({
    url: BASE + a.id + '/', title: a.title + '｜まなびラボ', desc: a.desc,
    image: BASE + 'assets/thumbs/' + a.id + '.jpg', w: 640, h: 360,
  }));
}

// sitemap.xml（入口と入口のアプリ。言語ごとの URL を hreflang で並べる）
const latest = APPS.map(a => a.updated).sort().pop();
const entry = (path, lastmod) => {
  const u = BASE + path;
  const alt = ['ja', 'en'].map(l => `    <xhtml:link rel="alternate" hreflang="${l}" href="${u}?lang=${l}"/>`).join('\n');
  return `  <url>\n    <loc>${u}</loc>\n    <lastmod>${lastmod}</lastmod>\n${alt}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${u}"/>\n  </url>`;
};
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
  + [entry('', latest), ...APPS.map(a => entry(a.id + '/', a.updated))].join('\n')
  + '\n</urlset>\n';
const smPath = join(root, 'sitemap.xml');
let oldSm = '';
try { oldSm = readFileSync(smPath, 'utf8'); } catch (e) {}
if (oldSm !== sitemap) { stale.push(smPath); if (!check) writeFileSync(smPath, sitemap); }

const rel = p => p.slice(root.length + 1).replace(/\\/g, '/');
if (check) {
  if (stale.length) { console.log('古い（seo.mjs を走らせる）: ' + stale.map(rel).join(', ')); process.exit(1); }
  console.log('seo: OK');
} else {
  console.log(stale.length ? '書きかえた: ' + stale.map(rel).join(', ') : '変更なし');
}
