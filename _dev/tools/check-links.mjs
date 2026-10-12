// 外へのリンク（出どころ・資料など）が切れていないかを調べる。健康診断（health.ps1）から週1回。
// 使い方（リポジトリのルートで）: node _dev/tools/check-links.mjs        → _dev/tools/out/links-last.json
// 対象: Git に入っているアプリの html・js（versions/ と _dev/ は除く）の https:// の URL。
// NG にするのは「もう無い」とはっきり分かるもの（404・410・名前が引けない）だけ。403・429・5xx・時間切れは
// サイト側の都合（ロボットよけ・一時的）のことが多いので「注意」にとどめる。
import fs from 'fs'; import path from 'path'; import {fileURLToPath} from 'url'; import {execFileSync} from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const SKIP = [
  /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.(googleapis|gstatic)\.com)(\/|$)/,  // ライブラリ・フォント（smoke が読みこみを見る）
  /^https:\/\/(www\.)?(googletagmanager|google-analytics)\.com/,  // 解析
  /^https:\/\/sishiya\.github\.io\//,                              // 自分のサイト
  /^https:\/\/(www\.)?w3\.org\/\d{4}\//,                          // SVG などの名前空間
  /[{}$`]|%7B/,                                                    // 組み立てて使う URL（タイル・API のひな形）
];
const files = execFileSync('git', ['ls-files'], {maxBuffer: 1e8}).toString().split('\n')
  .filter(f => /\.(html|js)$/.test(f) && !/(^|\/)versions\//.test(f) && !f.startsWith('_dev/') && !f.startsWith('lib/'));
const count = (s, c) => s.split(c).length - 1;
const where = new Map();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/https:\/\/[^\s"'<>`\\]+/g)) {
    let u = m[0].replace(/[）」。、（].*$/, '').replace(/&amp;/g, '&');
    // 文のかっこ・句読点は外し、DOI の中のかっこ（0168-5597(94)… など）は残す
    while (/[.,;:)]$/.test(u) && !(u.endsWith(')') && count(u, '(') >= count(u, ')'))) u = u.slice(0, -1);
    if (SKIP.some(r => r.test(u))) continue;
    if (f.endsWith('.js') && u.endsWith('/')) continue;  // js の中でつなげて使う URL の頭（API の入口）
    if (!where.has(u)) where.set(u, new Set());
    where.get(u).add(f.split('/')[0]);
  }
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
async function check(u) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(u, {method, redirect: 'follow', headers: {'User-Agent': UA, 'Accept': '*/*'}, signal: AbortSignal.timeout(20000)});
      if (method === 'HEAD' && [403, 404, 405, 501].includes(r.status)) continue;  // HEAD を嫌うサイトは GET でもう一度
      return {status: r.status};
    } catch (e) {
      const code = e.cause?.code || e.name;
      if (code === 'ENOTFOUND') return {status: 0, err: '名前が引けない（ドメインが無い）'};
      if (method === 'GET') return {status: -1, err: code};
    }
  }
}
const urls = [...where.keys()];
const results = [];
let i = 0;
await Promise.all(Array.from({length: 8}, async () => {
  while (i < urls.length) {
    const u = urls[i++];
    const r = await check(u);
    const ng = r.status === 404 || r.status === 410 || r.status === 0;
    const warn = !ng && !(r.status >= 200 && r.status < 400);
    results.push({url: u, apps: [...where.get(u)], ...r, level: ng ? 'NG' : warn ? '注意' : 'OK'});
  }
}));
results.sort((a, b) => a.url.localeCompare(b.url));
fs.mkdirSync('_dev/tools/out', {recursive: true});
fs.writeFileSync('_dev/tools/out/links-last.json', JSON.stringify({date: new Date().toISOString(), results}, null, 1));
const ng = results.filter(r => r.level === 'NG'), warn = results.filter(r => r.level === '注意');
for (const r of ng) console.log(`NG   ${r.status || r.err} ${r.url}（${r.apps.join('・')}）`);
console.log(`リンクの確認: ${results.length} 件、NG ${ng.length}、注意 ${warn.length}。結果は _dev/tools/out/links-last.json`);
