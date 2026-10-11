// サンプルの声（合成）を作る: node lab/make-samples.js
// LeTalker の書き直し（js/letalker.js）で声を計算し、samples/<id>.wav と samples/samples.json（作ったときの設定＝答え）を書く。
// 本物の人の声ではない。画面にも「模型で作った声」と出す。
const fs = require('fs'), path = require('path');
const LT = require('../js/letalker.js');
const outDir = path.join(__dirname, '..', 'samples');
fs.mkdirSync(outDir, { recursive: true });

const base = { sex: 'male', x02: 0.01, x01: 0.011, act: 0.2, ata: 0.2, alc: 0.5, PL: 7840, vowel: 'aa', noise: 0, dur: 1.2 };
// note: LeTalker の説明書の標準の設定（x02=0.01, x01=0.011, CT 0.2, TA 0.2, PL 7840, 母音 6=/ɑ/）を土台に、1つずつ変えた
const SAMPLES = [
  { id: 'male-normal', ja: '男性・ふつうの声', en: 'Male, normal', o: {}, note: 'LeTalker の説明書の標準の設定' },
  { id: 'male-soft', ja: '男性・小さな声', en: 'Male, soft', o: { PL: 4000 }, note: '肺の圧を下げた' },
  { id: 'male-loud', ja: '男性・大きな声', en: 'Male, loud', o: { PL: 15000 }, note: '肺の圧を上げた' },
  { id: 'male-high', ja: '男性・高めの声', en: 'Male, higher', o: { act: 0.6 }, note: '輪状甲状筋（CT）を強めた' },
  { id: 'male-low', ja: '男性・低めの声', en: 'Male, lower', o: { act: 0, ata: 0.4 }, note: 'CT を休め、甲状披裂筋（TA）を強めた' },
  { id: 'male-falsetto', ja: '男性・裏声に近い設定', en: 'Male, falsetto-like', o: { act: 0.8, ata: 0, PL: 10000 }, note: 'CT を強く、TA を 0。模型の上での裏声に近い条件' },
  { id: 'male-gap', ja: '男性・すき間を広げた声', en: 'Male, wider gap', o: { x01: 0.042, x02: 0.041, noise: 1 }, note: '震えがぎりぎり続くすき間。この模型では「閉じきらずに震える」声は作れない' },
  { id: 'male-whisper', ja: '男性・ささやき', en: 'Male, whisper', o: { x01: 0.14, x02: 0.13, PL: 12000, noise: 1 }, note: 'LeTalker の説明書の雑音の例。声帯は震えない' },
  { id: 'male-ii', ja: '男性・「いー」', en: 'Male, /i/', o: { vowel: 'ii' }, note: '声帯は同じ。声道の形だけ /i/' },
  { id: 'male-uu', ja: '男性・「うー」', en: 'Male, /u/', o: { vowel: 'uu' }, note: '声帯は同じ。声道の形だけ /u/' },
  { id: 'female-normal', ja: '女性・ふつうの声', en: 'Female, normal', o: { sex: 'female' }, note: '声帯の長さだけ女性の値（LeTalker のコメント）。声道は男性の形のまま' },
  { id: 'child-normal', ja: '子ども・ふつうの声', en: 'Child, normal', o: { sex: 'child' }, note: '声帯の大きさは推定（Zhang 2021 の比）。声道は男性の形のまま' },
];

function wav16(samples, fs) {
  const n = samples.length, buf = Buffer.alloc(44 + 2 * n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + 2 * n, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(fs, 24); buf.writeUInt32LE(2 * fs, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(2 * n, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + 2 * i);
  return buf;
}

// 大きさ: 全サンプルで同じ倍率（声の大きさのちがいを残す）。いちばん大きいものの山が 0.9 になるように
const runs = SAMPLES.map(s => ({ s, opt: Object.assign({}, base, s.o), r: LT.run(Object.assign({}, base, s.o)) }));
let peak = 0; for (const { r } of runs) for (let i = 0; i < r.po.length; i++) peak = Math.max(peak, Math.abs(r.po[i]));
const gain = 0.9 / peak;
const list = [];
for (const { s, opt, r } of runs) {
  const fs = r.fs, n = r.po.length, fade = Math.round(0.03 * fs);
  const y = new Float32Array(n);
  let m = 0; for (let i = 0; i < n; i++) m += r.po[i]; m /= n;           // 直流を除く
  for (let i = 0; i < n; i++) {
    let g = gain;
    if (i < fade) g *= i / fade; if (i > n - fade) g *= (n - i) / fade;   // はじめと終わりをなめらかに
    y[i] = (r.po[i] - m) * g;
  }
  require('fs').writeFileSync(path.join(outDir, s.id + '.wav'), wav16(y, fs));
  let cl = 0, i0 = Math.round(0.4 * n); for (let i = i0; i < n; i++) if (r.ga[i] <= 2e-7) cl++;
  list.push({
    id: s.id, file: s.id + '.wav', ja: s.ja, en: s.en, note: s.note,
    truth: { sex: opt.sex, act: opt.act, ata: opt.ata, alc: opt.alc, PL: opt.PL, x01: opt.x01, x02: opt.x02, vowel: opt.vowel, noise: opt.noise },
    result: { f0: Math.round(r.f0 * 10) / 10, closedFrac: Math.round(cl / (n - i0) * 100) / 100, vibrating: r.f0 > 0 },
  });
  console.log(s.id.padEnd(15), 'F0', r.f0.toFixed(1), 'closed', (cl / (n - i0)).toFixed(2));
}
fs.writeFileSync(path.join(outDir, 'samples.json'), JSON.stringify({
  made: '2026-10-11', by: 'lab/make-samples.js（js/letalker.js = LeTalker 1.22 の書き直し）', fs: 44100, gain,
  about: '模型で作った声（本物の人の声ではない）。truth は作ったときの設定（答え合わせ用）。PL は dyn/cm²（10 で割ると Pa）、x01・x02 は cm。',
  samples: list,
}, null, 1));
console.log('gain', gain.toExponential(3), '→', outDir);
