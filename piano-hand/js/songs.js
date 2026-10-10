// 検証用の曲。どれも著作権の切れた曲。「音名/拍」を空白で区切る。r は休み。和音は「C4+E4+G4/1」。src は右手、srcL は左手。
// refR・refL は教本でよく使われる運指（くらべる用。音の順に指番号。check.js の fingeringMatch）
'use strict';

// ハ長調の音階 2オクターブ上下（oct のドから）
function SCALE_C(oct) {
  const up = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], a = [];
  for (let o = 0; o < 2; o++) for (const n of up) a.push(n + (oct + o) + '/.5');
  a.push('C' + (oct + 2) + '/1');
  for (let o = 1; o >= 0; o--) for (const n of up.slice().reverse()) a.push(n + (oct + o) + (o === 0 && n === 'C' ? '/1' : '/.5'));
  return a.join(' ');
}
const ELISE_R = 'E5/.25 D#5/.25 E5/.25 D#5/.25 E5/.25 B4/.25 D5/.25 C5/.25 A4/.5 r/.25 C4/.25 E4/.25 A4/.25 B4/.5 r/.25 ' +
  'E4/.25 G#4/.25 B4/.25 C5/.5 r/.25 E4/.25 E5/.25 D#5/.25 E5/.25 D#5/.25 E5/.25 B4/.25 D5/.25 C5/.25 A4/.5 r/.25 ' +
  'C4/.25 E4/.25 A4/.25 B4/.5 r/.25 E4/.25 C5/.25 B4/.25 A4/1';

const SONGS = [
  { id: 'chords', name: '和音（ハ長調の I・IV・V・I）', why: '和音の指の並び・和音から和音へ', bpm: 72,
    src: 'C4+E4+G4/2 C4+F4+A4/2 B3+D4+G4/2 C4+E4+G4/2', srcL: 'C3+E3+G3/2 F2+A2+C3/2 G2+B2+D3/2 C3+E3+G3/2',
    refR: '135' + '135' + '125' + '135', refL: '531' + '531' + '531' + '531' }, // 右手は基本形・第2転回形 1-3-5、第1転回形 1-2-5
  { id: 'chords2', name: 'メロディと和音（歓喜の歌・左手の和音）', why: '片手はメロディ、片手は和音', bpm: 116,
    src: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4/1.5 D4/.5 D4/2',
    srcL: 'C3+E3+G3/4 C3+E3+G3/4 G2+B2+D3/4 C3+E3+G3/2 G2+B2+D3/2' },
  { id: 'scale2', name: 'ハ長調の音階（両手・2オクターブ）', why: '左手の親指くぐり・両手', bpm: 84,
    src: SCALE_C(4), srcL: SCALE_C(3),
    refR: '123123412312345' + '43213214321321', refL: '543213214321321' + '23123412312345' },
  { id: 'elise2', name: 'エリーゼのために 冒頭（両手）', why: '右手と左手の受けわたし・左手の分散和音', bpm: 66,
    src: ELISE_R,
    srcL: 'r/2 A2/.25 E3/.25 A3/.25 r/.75 E2/.25 E3/.25 G#3/.25 r/.75 A2/.25 E3/.25 A3/.25 r/.75 r/1.5 ' +
          'A2/.25 E3/.25 A3/.25 r/.75 E2/.25 E3/.25 G#3/.25 r/.75 A2/.25 E3/.25 A3/1' },
  { id: 'scale', name: 'ハ長調の音階（右手・2オクターブ）', why: '親指くぐり・指またぎ', bpm: 92, src: SCALE_C(4),
    refR: '123123412312345' + '43213214321321' },
  { id: 'dmaj', name: 'ニ長調の音階', why: '黒鍵（ファ♯・ド♯）', bpm: 92,
    src: 'D4/.5 E4/.5 F#4/.5 G4/.5 A4/.5 B4/.5 C#5/.5 D5/1 C#5/.5 B4/.5 A4/.5 G4/.5 F#4/.5 E4/.5 D4/1',
    refR: '12312345' + '4321321' },
  { id: 'arp', name: 'ハ長調のアルペジオ', why: '大きな指またぎ', bpm: 76,
    src: 'C4/.5 E4/.5 G4/.5 C5/.5 E5/.5 G5/.5 C6/1 G5/.5 E5/.5 C5/.5 G4/.5 E4/.5 C4/1',
    refR: '1231235' + '321321' },
  { id: 'twinkle', name: 'きらきら星', why: '同じ音の連打・5本の指の位置', bpm: 100,
    src: 'C4 C4 G4 G4 A4 A4 G4/2 F4 F4 E4 E4 D4 D4 C4/2 G4 G4 F4 F4 E4 E4 D4/2 G4 G4 F4 F4 E4 E4 D4/2 ' +
         'C4 C4 G4 G4 A4 A4 G4/2 F4 F4 E4 E4 D4 D4 C4/2' },
  { id: 'ode', name: '歓喜の歌（ベートーヴェン）', why: '手の位置がほとんど動かない', bpm: 116,
    src: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4/1.5 D4/.5 D4/2 ' +
         'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4/1.5 C4/.5 C4/2',
    refR: '334554321123322' + '334554321123211' },
  { id: 'elise', name: 'エリーゼのために 冒頭（右手だけ）', why: '速い往復・黒鍵・跳躍', bpm: 66, src: ELISE_R },
];

// ---- 答え合わせ用（val: true）: 著作権の切れた教本の運指 ----
// ハノン『60の練習曲によるヴィルトゥオーゾ・ピアニスト』（1873）。第1番は 1-2-3-4-5-4-3-2（左手 5-4-3-2-1-2-3-4）、
// 第39番は全調の音階（ここでは長調12。1オクターブ上がって下がる。下りは上りの指を逆に）
const MIDI_NAME = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiName = m => MIDI_NAME[m % 12] + (Math.floor(m / 12) - 1);
function scaleSong(key, tonic, fr, fl) {
  const steps = [0, 2, 4, 5, 7, 9, 11, 12];
  const line = t => steps.concat(steps.slice(0, 7).reverse()).map((s, i) => midiName(t + s) + (i === 7 || i === 14 ? '/1' : '/.5')).join(' ');
  const down = f => f + f.slice(0, 7).split('').reverse().join('');
  return { id: 'sc-' + key, val: true, name: key + ' 長調の音階（ハノン第39番）', why: '教本の運指との答え合わせ', bpm: 80,
    src: line(tonic), srcL: line(tonic - 12), refR: down(fr), refL: down(fl) };
}
function hanon1() {
  const W = [0, 2, 4, 5, 7, 9, 11]; // ハ長調の白鍵（ド4 から何半音か、7 で次のオクターブ）
  const wm = i => 60 + Math.floor(i / 7) * 12 + W[((i % 7) + 7) % 7];
  const pat = [0, 2, 3, 4, 5, 4, 3, 2];
  const notesR = [], notesL = [];
  for (let g = 0; g < 4; g++) for (const p of pat) { notesR.push(midiName(wm(g + p)) + '/.25'); notesL.push(midiName(wm(g + p) - 24) + '/.25'); }
  return { id: 'hanon1', val: true, name: 'ハノン第1番 はじめの4小節', why: '教本の運指との答え合わせ', bpm: 72,
    src: notesR.join(' '), srcL: notesL.join(' '), refR: '12345432'.repeat(4), refL: '54321234'.repeat(4) };
}
SONGS.push(hanon1(),
  scaleSong('C', 60, '12312345', '54321321'), scaleSong('G', 67, '12312345', '54321321'), scaleSong('D', 62, '12312345', '54321321'),
  scaleSong('A', 69, '12312345', '54321321'), scaleSong('E', 64, '12312345', '54321321'), scaleSong('B', 71, '12312345', '43214321'),
  scaleSong('F', 65, '12341234', '54321321'), scaleSong('B♭', 70, '41231234', '32143213'), scaleSong('E♭', 63, '31234123', '32143213'),
  scaleSong('A♭', 68, '34123123', '32143213'), scaleSong('D♭', 61, '23123412', '32143213'), scaleSong('F♯', 66, '23412312', '43213214'));

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 曲 → [{m, t0, t1, hand}]（秒）
function parseSong(song) {
  const out = parseLine(song.src, song.bpm, 'R');
  if (song.srcL) out.push(...parseLine(song.srcL, song.bpm, 'L'));
  return out;
}
function parseLine(src, bpm, hand) {
  const beat = 60 / bpm, out = [];
  let t = 0;
  for (const tok of src.trim().split(/\s+/)) {
    const [nms, ds] = tok.split('/');
    const d = (ds ? parseFloat(ds) : 1) * beat;
    if (nms !== 'r') for (const nm of nms.split('+')) {
      const mt = /^([A-G])([#b]?)(-?\d)$/.exec(nm);
      if (!mt) throw new Error('音名が読めない: ' + tok);
      const m = 12 * (+mt[3] + 1) + NOTE_BASE[mt[1]] + (mt[2] === '#' ? 1 : mt[2] === 'b' ? -1 : 0);
      out.push({ m, t0: t, t1: t + d * 0.95, hand }); // 少しだけ切って弾く（同じ鍵の連打で離す時間）
    }
    t += d;
  }
  return out;
}
