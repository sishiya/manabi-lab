// 片づけの点検（Claude を使わない＝トークンなし）。health.ps1 が週1で呼ぶ。手でも: node _dev/tools/upkeep.mjs
//   1. Claude のセッション: この7日のトークン（処理した量）の多い順・文脈が長くなりすぎたもの・同じ大きいファイルを何度も読んだもの・7日さわっていないもの
//   2. versions/: アプリごとの数（節目だけのはず）・launcher.html から行けない版
//   3. 大きいファイル（800行か60KB をこえる。RULES 2章）と、毎回読まれる文書（CLAUDE.md・RULES.md・MEMORY.md）の大きさ
// 結果は _dev/tools/out/upkeep-last.json・upkeep-last.md（Git に入れない）。注意があれば health.ps1 -Hook が1行で知らせる。
// セッションの記録（~/.claude/projects/…）は読むだけ。中身は数とファイル名しか書き出さない。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, '_dev/tools/out');
const DAY = 86400e3, now = Date.now();
const LIMIT = { lines: 800, bytes: 60 * 1024 };          // RULES 2章
const SESSION = { peakCtx: 300e3, rereadBytes: 30 * 1024, rereadCount: 5, idleDays: 7 };
const VERSIONS_MAX = 10;                                  // これより多いアプリは「節目だけ」になっているか見直す
const warn = [];                                          // フックに出す注意（短く）
const md = [];
const kb = n => `${Math.round(n / 1024)}KB`;
const mtok = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`;
const rel = p => path.relative(root, p).replace(/\\/g, '/');

// ---- 1. セッション ----
const projDir = path.join(os.homedir(), '.claude/projects', root.replace(/[^A-Za-z0-9]/g, '-'));
const sessions = [];
if (fs.existsSync(projDir)) {
  for (const f of fs.readdirSync(projDir).filter(f => f.endsWith('.jsonl'))) {
    const full = path.join(projDir, f), id = f.slice(0, -6);
    const st = fs.statSync(full);
    let title = '';
    try { title = JSON.parse(fs.readFileSync(path.join(projDir, id, 'custom-title.json'), 'utf8')).customTitle || ''; } catch {}
    const s = { id, title, mtime: st.mtimeMs, bytes: st.size, tokens: 0, output: 0, peakCtx: 0, turns: 0, reads: {} };
    sessions.push(s);
    if (now - st.mtimeMs > SESSION.idleDays * DAY) continue;   // 古いものは中を読まない
    const seen = new Set();
    for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
      if (!line.includes('"usage"') && !line.includes('"Read"')) {
        if (!title && line.includes('"queue-operation"') && line.includes('"content"')) {
          try { title = String(JSON.parse(line).content).slice(0, 30); } catch {}
        }
        continue;
      }
      let o; try { o = JSON.parse(line); } catch { continue; }
      const m = o.message; if (!m) continue;
      if (m.usage && m.id && !seen.has(m.id)) {
        seen.add(m.id);
        const u = m.usage, ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        s.tokens += ctx + (u.output_tokens || 0); s.output += u.output_tokens || 0; s.turns++;
        if (ctx > s.peakCtx) s.peakCtx = ctx;
      }
      for (const c of Array.isArray(m.content) ? m.content : []) {
        if (c.type === 'tool_use' && c.name === 'Read' && c.input && c.input.file_path) {
          const p = c.input.file_path; s.reads[p] = (s.reads[p] || 0) + 1;
        }
      }
    }
    s.title = title;
  }
}
const recent = sessions.filter(s => now - s.mtime <= SESSION.idleDays * DAY).sort((a, b) => b.tokens - a.tokens);
const idle = sessions.filter(s => now - s.mtime > SESSION.idleDays * DAY);
const weekTotal = recent.reduce((a, s) => a + s.tokens, 0);
md.push('## 1. Claude のセッション（この7日）', '',
  `- 記録 ${sessions.length} 本（${Math.round(sessions.reduce((a, s) => a + s.bytes, 0) / 1048576)}MB）、この7日に動いたもの ${recent.length} 本、処理したトークン 合計 ${mtok(weekTotal)}（キャッシュの読みこみをふくむ。料金の重みとは別）`,
  `- 7日さわっていないもの ${idle.length} 本（アプリの一覧で「アーカイブ」してよい候補。毎週の Claude の片づけ＝ RULES 11章 が見る）`, '',
  '| セッション | トークン | 一番長い文脈 | 返答 | 気になること |', '|---|---|---|---|---|');
const longOnes = [], rereads = [];
for (const s of recent.slice(0, 10)) {
  const notes = [];
  if (s.peakCtx > SESSION.peakCtx) { notes.push(`文脈が ${mtok(s.peakCtx)} まで伸びた → 区切って新しいセッションへ`); longOnes.push(s); }
  for (const [p, n] of Object.entries(s.reads)) {
    let size = 0; try { size = fs.statSync(p).size; } catch { continue; }
    if (n >= SESSION.rereadCount && size > SESSION.rereadBytes && !/\.(png|jpe?g|webp|gif)$/i.test(p)) {
      const r = p.startsWith(root) ? rel(p) : path.basename(p);
      notes.push(`${r}（${kb(size)}）を ${n} 回読んだ`); rereads.push(r);
    }
  }
  md.push(`| ${(s.title || s.id.slice(0, 8)).replace(/\|/g, '／')} | ${mtok(s.tokens)} | ${mtok(s.peakCtx)} | ${s.turns} | ${notes.join('・') || ''} |`);
}
md.push('');
if (longOnes.length) warn.push(`文脈が長くなりすぎたセッション ${longOnes.length} 本`);
if (rereads.length) warn.push(`大きいファイルのくり返し読み ${[...new Set(rereads)].slice(0, 2).join('・')}${rereads.length > 2 ? ' ほか' : ''}`);

// ---- 2. versions/ ----
md.push('## 2. versions/（節目だけ。RULES 3章）', '', '| アプリ | 版の数 | 大きさ | 気になること |', '|---|---|---|---|');
const dirSize = d => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => {
  const p = path.join(d, e.name); return a + (e.isDirectory() ? dirSize(p) : fs.statSync(p).size);
}, 0);
let vTotal = 0;
const vMany = [], vOrphan = [];
for (const app of fs.readdirSync(root).sort()) {
  const vd = path.join(root, app, 'versions');
  if (!fs.existsSync(vd) || !fs.statSync(vd).isDirectory()) continue;
  const vers = fs.readdirSync(vd).filter(v => fs.statSync(path.join(vd, v)).isDirectory());
  const size = dirSize(vd); vTotal += size;
  const lp = path.join(root, app, 'launcher.html');
  const launcher = fs.existsSync(lp) ? fs.readFileSync(lp, 'utf8') : '';
  const orphan = vers.filter(v => !launcher.includes(`versions/${v}/`));
  const notes = [];
  if (vers.length > VERSIONS_MAX) { notes.push(`${VERSIONS_MAX} 本より多い（節目か見直す）`); vMany.push(app); }
  if (orphan.length) { notes.push(`ランチャーから行けない: ${orphan.join(', ')}`); vOrphan.push(app); }
  md.push(`| ${app} | ${vers.length} | ${(size / 1048576).toFixed(1)}MB | ${notes.join('・')} |`);
}
md.push('', `- 合計 ${(vTotal / 1048576).toFixed(1)}MB`, '');
if (vMany.length) warn.push(`versions が多い ${vMany.join('・')}`);
if (vOrphan.length) warn.push(`ランチャーにない版 ${vOrphan.join('・')}`);

// ---- 3. 大きいファイル・毎回読まれる文書 ----
md.push('## 3. 大きいファイル（800行か60KB をこえる。RULES 2章）', '');
const ignored = /(^|\/)versions\/|^lib\/|^god-view\/data\/|^vocal-folds\/js\/table\.js$|(^|\/)out\/|(^|\/)HISTORY\.md$/;   // HISTORY.md は Grep で引く記録（頭から読まない）
const tracked = execSync('git ls-files -z', { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0')
  .filter(f => /\.(html|js|mjs|css|md|ps1|pl)$/i.test(f) && !ignored.test(f));
const big = [];
for (const f of tracked) {
  let buf; try { buf = fs.readFileSync(path.join(root, f)); } catch { continue; }
  const lines = buf.toString('utf8').split('\n').length;
  if (lines > LIMIT.lines || buf.length > LIMIT.bytes) big.push({ f, lines, bytes: buf.length });
}
big.sort((a, b) => b.bytes - a.bytes);
md.push(...(big.length ? big.map(b => `- ${b.f}: ${b.lines}行・${kb(b.bytes)}`) : ['- なし']), '');
if (big.length) warn.push(`大きいファイル ${big.length} 本（${big.slice(0, 2).map(b => b.f).join('・')}${big.length > 2 ? ' ほか' : ''}）`);

const memIndex = path.join(projDir, 'memory/MEMORY.md');
const docs = [
  ['CLAUDE.md', path.join(root, 'CLAUDE.md'), 10 * 1024, '会話のたびに読みこまれる'],
  ['memory/MEMORY.md', memIndex, 20 * 1024, '会話のたびに読みこまれる（200行で切れる）'],
  ['RULES.md', path.join(root, 'RULES.md'), 25 * 1024, 'セッションのはじめに読む'],
];
md.push('## 毎回読まれる文書', '');
for (const [name, p, max, why] of docs) {
  if (!fs.existsSync(p)) continue;
  const t = fs.readFileSync(p, 'utf8'), bytes = Buffer.byteLength(t), lines = t.split('\n').length;
  const over = bytes > max || (name.includes('MEMORY') && lines > 180);
  md.push(`- ${name}: ${lines}行・${kb(bytes)}（目安 ${kb(max)}。${why}）${over ? ' ← こえている。要約して別ファイルへ' : ''}`);
  if (over) warn.push(`${name} が大きい（${kb(bytes)}）`);
}

const date = new Date().toISOString().slice(0, 19);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'upkeep-last.json'), JSON.stringify({
  date, warn, weekTokens: weekTotal, idleSessions: idle.length, versionsMB: +(vTotal / 1048576).toFixed(1), bigFiles: big.length,
}, null, 2));
fs.writeFileSync(path.join(outDir, 'upkeep-last.md'),
  [`# 片づけの点検 ${date}`, '', ...(warn.length ? warn.map(w => `- **${w}**`) : ['- 気になることなし']), '', ...md].join('\n'));
console.log(`片づけの点検: 注意 ${warn.length}（_dev/tools/out/upkeep-last.md）`);
for (const w of warn) console.log(`  ${w}`);
