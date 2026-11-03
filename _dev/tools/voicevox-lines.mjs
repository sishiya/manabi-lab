// うんちくショートの声を VOICEVOX で作る（2026-11-03〜）。ページの subs の who ごとに話す人を変えて、1行ずつ wav にする。
//   node _dev/tools/voicevox-lines.mjs <ページ名> [--q 8] [--a 14] [--n 14] [--dry]
//   --dry: wav を作らず、行ごとに読む文と VOICEVOX のカナを出す（読みまちがいを探す）
//   前提: VOICEVOX ENGINE が 127.0.0.1:50021 で動いている（%USERPROFILE%\tools\voicevox-nv\windows-nvidia\run.exe --use_gpu。Git の外）
//   出力: _dev/promo/out/voice/<ページ名>/NN.wav と voice.json（{ credit, lines: [{ t, file, dur, slot }] }）。ページは triviaStart の voice: 'auto' で読む
// who: 'q' か 'A' は聞き手、'a' か 'B' は答える人。who のない行は読まない（ページに who がひとつもなければ、全部を語り手が読む）。（ ）の中は画面の注なので読まない。
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
if (!args.includes('--dry')) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, f));
}

// who がひとつもないページ（かけあいでない型）は、全部の行を語り手（--n、既定は冥鳴ひまり）が読む
const narr = !subs.some(s => s.who);
SPK.n = +(opt('n') ?? 14);
const roleOf = w => narr ? 'n' : (w === 'q' || w === 'A') ? 'q' : (w === 'a' || w === 'B') ? 'a' : null;
// 読み方: 単位・記号・英字をカナに。それでもおかしい行は、ページの subs の行に yomi: '…' を書くとそれを読む
const SUP = { '⁰': 0, '¹': 1, '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9, '⁻': 'マイナス' };
const UNIT = [['cm³', '立方センチメートル'], ['m²', '平方メートル'], ['m³', '立方メートル'], ['km', 'キロメートル'], ['mm', 'ミリメートル'], ['cm', 'センチメートル'],
  ['nm', 'ナノメートル'], ['ms', 'ミリ秒'], ['kg', 'キログラム'], ['ppm', 'ピーピーエム'], ['dB', 'デシベル'], ['GHz', 'ギガヘルツ'], ['m', 'メートル'], ['W', 'ワット'], ['G', 'ジー'], ['℃', '度'], ['°', '度']];
const WORD = [['WiFi', 'ワイファイ'], ['Wi-Fi', 'ワイファイ'], ['ping', 'ピン'], ['Linux', 'リナックス'], ['NASA', 'ナサ'], ['TMAO', 'ティーエムエーオー'], ['M87', 'エムハチジュウナナ'], ['CO₂', 'シーオーツー'], ['CO2', 'シーオーツー'],
  [' ＝ ', '、イコール、'], ['＋', '十字'], ['×', 'かける'], ['大きい種', '大きいしゅ']];
const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
function yomi(s) {
  let t = s.replace(/[\[\]]/g, '').replace(/（[^）]*）/g, '').replace(/\n/g, m => '、').replace(/[“”「」『』]/g, '');
  t = t.replace(/(\d),(\d{3})/g, '$1$2');
  t = t.replace(/×\s*10([⁻⁰-⁹¹²³]+)/g, (_, e) => 'かける10の' + [...e].map(c => SUP[c]).join('') + '乗');
  t = t.replace(/([\d.]+)\s*km\/h/g, '時速$1キロメートル').replace(/(\d)\s*〜\s*(\d)/g, '$1から$2').replace(/(\d)音/g, '$1おん');
  for (const [w, k] of WORD) t = t.replace(new RegExp(esc(w), 'g'), k);
  for (const [u, k] of UNIT) t = t.replace(new RegExp('([\\d万千億兆])\\s*' + esc(u) + '(?![A-Za-z²³])', 'g'), '$1' + k);
  return t.replace(/、、+/g, '、').replace(/([。？！])、/g, '$1').trim();
}
const speakText = s => s.yomi || yomi(s.ja);
const wavSec = b => { const d = b.indexOf('data', 12); return b.readUInt32LE(d + 4) / b.readUInt32LE(28); };   // data の長さ / 1秒のバイト数

async function synth(text, spk, speed) {
  const q = await (await fetch(`${HOST}/audio_query?speaker=${spk}&text=${encodeURIComponent(text)}`, { method: 'POST' })).json();
  q.speedScale = speed; q.prePhonemeLength = 0.05; q.postPhonemeLength = 0.08; q.outputSamplingRate = 48000; q.outputStereo = false;
  const r = await fetch(`${HOST}/synthesis?speaker=${spk}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
  return Buffer.from(await r.arrayBuffer());
}

if (args.includes('--dry')) {   // 読み方だけ見る（wav は作らない）: 行ごとに、読む文と VOICEVOX のカナ
  for (const s of subs) {
    if (!roleOf(s.who)) continue;
    const text = speakText(s), q = await (await fetch(`${HOST}/audio_query?speaker=${SPK[roleOf(s.who)]}&text=${encodeURIComponent(text)}`, { method: 'POST' })).json();
    console.log(`${page}\t${text}\t${q.kana}`);
  }
  process.exit(0);
}
const list = [], over = [];
for (let i = 0; i < subs.length; i++) {
  const s = subs[i], role = roleOf(s.who);
  if (!role) continue;
  const text = speakText(s), slot = s.b - s.a - 0.15;
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
