// 紹介動画の翻訳の字幕（CC）を作る。
//   node _dev/tools/build-subs.mjs
// 文: _dev/promo/subs/<言語>.json = { "<動画の名前>": ["1行目 // 2行目", ...] }（英語の字幕と同じ数・同じ順）
// 時刻: _dev/promo/out/<動画の名前>.en.srt（台本ページが保存する英語の字幕）からそのまま写す
// 出力: _dev/promo/subs/<動画の名前>.<言語>.srt。_dev/promo/<動画の名前>.upload.json の captions にも足す
// 上げるのは youtube-upload.ps1 -Captions -Meta … -Lang …（まだない言語だけ送る）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const subsDir = path.join(root, '_dev/promo/subs');
const langs = fs.readdirSync(subsDir).filter(f => /^[a-z]{2}(-[A-Za-z]+)?\.json$/.test(f)).map(f => f.replace(/\.json$/, ''));

function readSrt(file) {
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n\r?\n+/).map(b => b.trim()).filter(Boolean)
    .map(b => { const l = b.split(/\r?\n/); return { n: l[0], time: l[1], text: l.slice(2) }; });
}

let ng = 0, made = 0;
const added = {};
for (const lang of langs) {
  const tr = JSON.parse(fs.readFileSync(path.join(subsDir, lang + '.json'), 'utf8'));
  for (const [name, lines] of Object.entries(tr)) {
    const en = path.join(root, '_dev/promo/out', name + '.en.srt');
    if (!fs.existsSync(en)) { console.log(`NG ${lang} ${name}: 英語の字幕がない（台本ページを開いて作る）`); ng++; continue; }
    const cues = readSrt(en);
    if (cues.length !== lines.length) { console.log(`NG ${lang} ${name}: 数がちがう（英語 ${cues.length}・訳 ${lines.length}）`); ng++; continue; }
    const out = cues.map((c, i) => {
      const t = lines[i].split(' // ');
      if (t.length !== c.text.length) console.log(`  注意 ${lang} ${name} #${i + 1}: 行の数が英語とちがう（${c.text.length} → ${t.length}）`);
      return `${c.n}\n${c.time}\n${t.join('\n')}\n`;
    }).join('\n');
    fs.writeFileSync(path.join(subsDir, `${name}.${lang}.srt`), out, 'utf8');
    (added[name] ??= []).push(lang); made++;
  }
}

// upload.json の captions に足す（ほかの行の書き方はそのまま）
for (const [name, ls] of Object.entries(added)) {
  const f = path.join(root, '_dev/promo', name + '.upload.json');
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  const m = s.match(/"captions":\s*\{([^}]*)\}/);
  if (!m) { console.log(`NG ${name}: upload.json に captions がない`); ng++; continue; }
  const have = {};
  for (const x of m[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)) have[x[1]] = x[2];
  for (const l of ls) have[l] = `_dev/promo/subs/${name}.${l}.srt`;
  const body = Object.entries(have).map(([k, v]) => `"${k}": "${v}"`).join(', ');
  s = s.replace(m[0], `"captions": { ${body} }`);
  fs.writeFileSync(f, s, 'utf8');
}
console.log(`字幕を作った: ${made} 本（${langs.join('・')}）、NG ${ng}`);
process.exit(ng ? 1 : 0);
