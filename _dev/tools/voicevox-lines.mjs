// うんちくショートの声を VOICEVOX で作る（2026-11-03〜）。ページの subs の who ごとに話す人を変えて、1行ずつ wav にする。
//   node _dev/tools/voicevox-lines.mjs <ページ名> [--q 8] [--a 14]
//   前提: VOICEVOX ENGINE が 127.0.0.1:50021 で動いている（%USERPROFILE%\tools\voicevox-nv\windows-nvidia\run.exe --use_gpu。Git の外）
//   出力: _dev/promo/out/voice/<ページ名>/NN.wav と voice.json（{ credit, lines: [{ t, file, dur, slot }] }）。ページは triviaStart の voice: 'auto' で読む
// who: 'q' か 'A' は聞き手、'a' か 'B' は答える人。who のない行は読まない。（ ）の中は画面の注なので読まない。
// 行の長さ（b - a）に入らなければ、話す速さを 1.3 倍まで上げる。それでも入らない行は、ページの側（trivia-kit.js）で
// その行のあいだだけ絵の時間をゆっくりにして、声の長さに合わせる（動画が少し長くなる）。
// 話す人の規約: 既定は 聞き手＝春日部つむぎ(8)、答える人＝冥鳴ひまり(14)。どちらも「VOICEVOX:名前」のクレジットで商用可。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'http://127.0.0.1:50021';
const args = process.argv.slice(2), page = args[0];
const opt = k => { const i = args.indexOf('--' + k); return i < 0 ? null : args[i + 1]; };
const SPK = { q: +(opt('q') ?? 8), a: +(opt('a') ?? 14) };
if (!page) { console.error('ページ名を'); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'promo');
const html = fs.readFileSync(path.join(root, page + '.html'), 'utf8');
const m = html.match(/const subs = (\[[\s\S]*?\n\]);/);
if (!m) { console.error('subs が見つからない'); process.exit(1); }
const subs = Function('"use strict"; return ' + m[1])();
const outDir = path.join(root, 'out', 'voice', page);
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, f));

const roleOf = w => (w === 'q' || w === 'A') ? 'q' : (w === 'a' || w === 'B') ? 'a' : null;
const speakText = s => s.replace(/[\[\]]/g, '').replace(/（[^）]*）/g, '').replace(/\n/g, '、').replace(/[“”「」]/g, '').trim();
const wavSec = b => { const d = b.indexOf('data', 12); return b.readUInt32LE(d + 4) / b.readUInt32LE(28); };   // data の長さ / 1秒のバイト数

async function synth(text, spk, speed) {
  const q = await (await fetch(`${HOST}/audio_query?speaker=${spk}&text=${encodeURIComponent(text)}`, { method: 'POST' })).json();
  q.speedScale = speed; q.prePhonemeLength = 0.05; q.postPhonemeLength = 0.08; q.outputSamplingRate = 48000; q.outputStereo = false;
  const r = await fetch(`${HOST}/synthesis?speaker=${spk}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
  return Buffer.from(await r.arrayBuffer());
}

const list = [], over = [];
for (let i = 0; i < subs.length; i++) {
  const s = subs[i], role = roleOf(s.who);
  if (!role) continue;
  const text = speakText(s.ja), slot = s.b - s.a - 0.15;
  let speed = 1.1, buf = await synth(text, SPK[role], speed);
  while (wavSec(buf) > slot && speed < 1.3) { speed = Math.min(1.3, speed * wavSec(buf) / slot + 0.02); buf = await synth(text, SPK[role], speed); }
  const file = String(i).padStart(2, '0') + '.wav';
  fs.writeFileSync(path.join(outDir, file), buf);
  const dur = +wavSec(buf).toFixed(2);
  list.push({ i, t: +(s.a + 0.05).toFixed(2), file: `out/voice/${page}/${file}`, dur, slot: +slot.toFixed(2), who: role, speed: +speed.toFixed(2) });
  if (dur > slot) over.push(`${i}: ${dur}s > ${slot.toFixed(2)}s「${text}」`);
}
const names = Object.fromEntries((await (await fetch(`${HOST}/speakers`)).json()).flatMap(c => c.styles.map(st => [st.id, c.name])));
const used = [...new Set(list.map(x => x.who))].map(w => names[SPK[w]]);
fs.writeFileSync(path.join(outDir, 'voice.json'), JSON.stringify({ credit: 'VOICEVOX:' + used.join('・VOICEVOX:'), lines: list }, null, 1));
console.log(`${page}: ${list.length} 行（聞き手 ${SPK.q}・答える人 ${SPK.a}）`);
if (over.length) { console.log('入らない行:'); over.forEach(x => console.log('  ' + x)); }
