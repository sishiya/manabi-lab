// 検証用の曲。どれも著作権の切れた曲。「音名/拍」を空白で区切る。r は休み。和音は「C4+E4+G4/1」。src は右手、srcL は左手。
// refR・refL は一般的な運指（教本・定番の版に書かれた指。音の順に指番号、0 は書かれていない音）。fsrc はその出どころ（画面に出す）。
// 「一般的な運指」で弾くとき（最初）は、この指に固定して弾く。書かれていない音（0）はコンピュータが選ぶ。
// 「コンピュータの推定」で弾くときは、くらべる用（check.js の fingeringMatch・答え合わせの表）。
// 出どころのある運指がない曲は入れない（2026-10-11、ユーザーの方針）。このアプリで作った曲は fsrc なし（運指は推定）
'use strict';

// 運指の出どころ（2026-10-11 に原本の図・楽譜で確かめた）
const SRC_HANON = L('ハノン『60の練習曲によるヴィルトゥオーゾ・ピアニスト』（1873）', 'Hanon, "The Virtuoso Pianist in 60 Exercises" (1873)');
const SRC_BAYLOR = ch => L('Baylor Piano Basics（Michael Clark、ベイラー大学のピアノの教科書、CC BY-NC-SA 4.0）' + ch, 'Baylor Piano Basics (Michael Clark, Baylor University piano textbook, CC BY-NC-SA 4.0), ' + ch);
const SRC_HENLE = L('Henle 版（1950、オットー・フォン・イルマー編、運指ヴァルター・ランペ）に書かれている指', 'Henle edition (1950, ed. Otto von Irmer, fingering by Walther Lampe), the printed fingers');
// 音の番号（1〜）→ 指 の表から、音の順の指の文字列（書かれていない音は 0）
const refAt = (n, at) => Array.from({ length: n }, (_, i) => at[i + 1] || 0).join('');

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

// Für Elise の右手に Henle 版で書かれている指（音の番号: 1 ミ5 = 4、6 シ4 = 1、10 ド4 = 1、13 シ4 = 5、14 ミ4 = 1、19 ミ5 = 5、20 レ♯5 = 3、21 ミ5 = 4）。
// くり返しの所には書かれていないので、書かれていない音として扱う（同じ指になるかはコンピュータしだい）
const ELISE_REF_R = refAt(35, { 1: 4, 6: 1, 10: 1, 13: 5, 14: 1, 19: 5, 20: 3, 21: 4 });
const ELISE_REF_L = refAt(18, { 6: 2 }); // 左手は第3小節のソ♯3 に 2 だけ（親指で黒鍵を押さない）

const SONGS = [
  // Baylor Piano Basics 29.1「Primary Chord Progression」の I・IV⁶₄・I・V⁶₅（三和音の形 V⁶）・I。右手 1-3-5／1-3-5／1-3-5／1-2-5／1-3-5、左手 5-3-1／5-2-1／5-3-1／5-3-1／5-3-1
  { id: 'chords', name: L('和音（ハ長調の I・IV・I・V・I）', 'Chords (C major I, IV, I, V, I)'), why: L('和音の指の並び・和音から和音へ', 'finger order in chords, moving chord to chord'), bpm: 72,
    src: 'C4+E4+G4/2 C4+F4+A4/2 C4+E4+G4/2 B3+D4+G4/2 C4+E4+G4/2', srcL: 'C3+E3+G3/2 C3+F3+A3/2 C3+E3+G3/2 B2+D3+G3/2 C3+E3+G3/2',
    refR: '135' + '135' + '135' + '125' + '135', refL: '531' + '521' + '531' + '531' + '531', fsrc: SRC_BAYLOR(L('29.1（和音の進行）', '29.1 Primary Chord Progression')) },
  { id: 'chords2', name: L('メロディと和音（歓喜の歌・左手の和音）', 'Melody and chords (Ode to Joy, left-hand chords)'), why: L('片手はメロディ、片手は和音', 'one hand melody, one hand chords'), bpm: 116,
    src: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4/1.5 D4/.5 D4/2',
    srcL: 'C3+E3+G3/4 C3+E3+G3/4 B2+D3+G3/4 C3+E3+G3/2 B2+D3+G3/2', // 左手の V は 29.1 と同じ形（シ・レ・ソ）
    refR: '334554321123322', refL: '531'.repeat(5), fsrc: SRC_BAYLOR(L('13.3（歓喜の歌、右手はドの5本指の位置）と 29.1（和音の指）', '13.3 Ode to Joy (right hand in C five-finger position) and 29.1 (chord fingering)')) },
  { id: 'scale2', name: L('ハ長調の音階（両手・2オクターブ）', 'C major scale (both hands, 2 octaves)'), why: L('左手の親指くぐり・両手', 'left-hand thumb-under, both hands'), bpm: 84,
    src: SCALE_C(4), srcL: SCALE_C(3),
    refR: '123123412312345' + '43213214321321', refL: '543213214321321' + '23123412312345', fsrc: L(SRC_HANON + ' 第39番（ハ長調の音階）', SRC_HANON + ', No. 39 (C major scale)') },
  { id: 'elise2', name: L('エリーゼのために 冒頭（両手）', 'Für Elise, opening (both hands)'), why: L('右手と左手の受けわたし・左手の分散和音', 'passing between hands, left-hand broken chords'), bpm: 66,
    src: ELISE_R,
    srcL: 'r/2 A2/.25 E3/.25 A3/.25 r/.75 E2/.25 E3/.25 G#3/.25 r/.75 A2/.25 E3/.25 A3/.25 r/.75 r/1.5 ' +
          'A2/.25 E3/.25 A3/.25 r/.75 E2/.25 E3/.25 G#3/.25 r/.75 A2/.25 E3/.25 A3/1',
    refR: ELISE_REF_R, refL: ELISE_REF_L, fsrc: SRC_HENLE,
    pedal: [[2, 3.45], [3.5, 4.95], [5, 6.45], [8, 9.45], [9.5, 10.95], [11, 12.6]], // 左手の分散和音ごと（このアプリでつけた目安）
    note: L('（ペダルはこのアプリでつけた目安）', '(pedal marks are a rough guide added by this app)') },
  { id: 'scale', name: L('ハ長調の音階（右手・2オクターブ）', 'C major scale (right hand, 2 octaves)'), why: L('親指くぐり・指またぎ', 'thumb-under, finger crossing'), bpm: 92, src: SCALE_C(4),
    refR: '123123412312345' + '43213214321321', fsrc: L(SRC_HANON + ' 第39番（ハ長調の音階）', SRC_HANON + ', No. 39 (C major scale)') },
  { id: 'dmaj', name: L('ニ長調の音階', 'D major scale'), why: L('黒鍵（ファ♯・ド♯）', 'black keys (F♯, C♯)'), bpm: 92,
    src: 'D4/.5 E4/.5 F#4/.5 G4/.5 A4/.5 B4/.5 C#5/.5 D5/1 C#5/.5 B4/.5 A4/.5 G4/.5 F#4/.5 E4/.5 D4/1',
    refR: '12312345' + '4321321', fsrc: L(SRC_HANON + ' 第39番（ニ長調の音階）', SRC_HANON + ', No. 39 (D major scale)') },
  { id: 'arp', name: L('ハ長調のアルペジオ', 'C major arpeggio'), why: L('大きな指またぎ', 'big finger crossing'), bpm: 76,
    src: 'C4/.5 E4/.5 G4/.5 C5/.5 E5/.5 G5/.5 C6/1 G5/.5 E5/.5 C5/.5 G4/.5 E4/.5 C4/1',
    refR: '1231235' + '321321', fsrc: SRC_BAYLOR(L('61（2オクターブの長調のアルペジオ。右手 123＋123＋5）', '61 Two-Octave Major Arpeggios (right hand 123 + 123 + 5)')) },
  { id: 'twinkle', name: L('きらきら星', 'Twinkle, Twinkle, Little Star'), why: L('同じ音の連打・5本の指の位置', 'repeated notes, five-finger position'), bpm: 100,
    src: 'C4 C4 G4 G4 A4 A4 G4/2 F4 F4 E4 E4 D4 D4 C4/2 G4 G4 F4 F4 E4 E4 D4/2 G4 G4 F4 F4 E4 E4 D4/2 ' +
         'C4 C4 G4 G4 A4 A4 G4/2 F4 F4 E4 E4 D4 D4 C4/2',
    // Baylor 13.8: ド1・ソ4・ラ5・ソ「4-5」（押さえたまま指をかえる。ここでは押す指の 4）・ファ4。5〜8小節はソ＝5 の位置（書かれていない指はその位置のまま）
    refR: '1144554' + '4433221' + '5544332' + '5544332' + '1144554' + '4433221',
    fsrc: SRC_BAYLOR(L('13.8（きらきら星。ソの「4-5」は押さえたまま指をかえる所で、ここでは押す指の 4 だけ）', '13.8 Twinkle, Twinkle, Little Star (the G marked 4-5 is a finger change while holding; here only the striking finger 4)')) },
  { id: 'ode', name: L('歓喜の歌（ベートーヴェン）', 'Ode to Joy (Beethoven)'), why: L('手の位置がほとんど動かない', 'the hand hardly moves'), bpm: 116,
    src: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4/1.5 D4/.5 D4/2 ' +
         'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4/1.5 C4/.5 C4/2',
    refR: '334554321123322' + '334554321123211', fsrc: SRC_BAYLOR(L('13.3（歓喜の歌。ミを 3 から、ドの5本指の位置のまま）', '13.3 Ode to Joy (E on finger 3, staying in the C five-finger position)')) },
  { id: 'elise', name: L('エリーゼのために 冒頭（右手だけ）', 'Für Elise, opening (right hand only)'), why: L('速い往復・黒鍵・跳躍', 'quick back-and-forth, black keys, jumps'), bpm: 66, src: ELISE_R, refR: ELISE_REF_R, fsrc: SRC_HENLE },
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
  return { id: 'sc-' + key, val: true, name: L(key + ' 長調の音階（ハノン第39番）', key + ' major scale (Hanon No. 39)'), why: L('教本の運指との答え合わせ', 'check against textbook fingering'), bpm: 80,
    src: line(tonic), srcL: line(tonic - 12), refR: down(fr), refL: down(fl), fsrc: L(SRC_HANON + ' 第39番', SRC_HANON + ', No. 39') };
}
function hanon1() {
  const W = [0, 2, 4, 5, 7, 9, 11]; // ハ長調の白鍵（ド4 から何半音か、7 で次のオクターブ）
  const wm = i => 60 + Math.floor(i / 7) * 12 + W[((i % 7) + 7) % 7];
  const pat = [0, 2, 3, 4, 5, 4, 3, 2];
  const notesR = [], notesL = [];
  for (let g = 0; g < 4; g++) for (const p of pat) { notesR.push(midiName(wm(g + p)) + '/.25'); notesL.push(midiName(wm(g + p) - 24) + '/.25'); }
  return { id: 'hanon1', val: true, name: L('ハノン第1番 はじめの4小節', 'Hanon No. 1, first 4 bars'), why: L('教本の運指との答え合わせ', 'check against textbook fingering'), bpm: 72,
    src: notesR.join(' '), srcL: notesL.join(' '), refR: '12345432'.repeat(4), refL: '54321234'.repeat(4), fsrc: L(SRC_HANON + ' 第1番', SRC_HANON + ', No. 1') };
}
// ---- 超絶技巧系 ----
// ショパン 練習曲 Op.10-1 の冒頭の音型（ハ長調の分散和音 C-G-C-E を 1-2-4-5 の指で。ピティナ・ピアノ曲事典の解説）。
// テンポは作曲者の指示 ♩=176（Wikipedia）。音域・左手・ペダルはこのアプリで決めた（楽譜そのものではない）
function chopinLike() {
  const up = [], down = [], refUp = [];
  for (let g = 0; g < 4; g++) for (const [d, f] of [[0, 1], [7, 2], [12, 4], [16, 5]]) { up.push(midiName(48 + 12 * g + d) + '/.25'); refUp.push(f); }
  for (let g = 3; g >= 0; g--) for (const d of [16, 12, 7, 0]) down.push(midiName(48 + 12 * g + d) + '/.25');
  return { id: 'chopin', name: L('ショパン Op.10-1 の冒頭の音型にならった分散和音', 'Broken chords after the opening figure of Chopin Op. 10 No. 1'), why: L('超絶技巧: 速い大きな分散和音（♩=176）', 'virtuoso: fast, wide broken chords (♩=176)'), bpm: 176,
    src: up.concat(down).join(' '), srcL: 'C1+C2/4 C1+C2/4', refR: refUp.join('') + '0'.repeat(16), fsrc: L('上りの 1-2-4-5 だけ（ピティナ・ピアノ曲事典の解説）。下りと左手はコンピュータの推定', "only the rising 1-2-4-5 (PTNA Piano Encyclopedia); the falling part and the left hand are the computer's estimate"), pedal: [[0, 3.9], [4, 7.9]],
    note: L('（音型と運指 1-2-4-5 はピティナ・ピアノ曲事典の解説、テンポは作曲者の指示。音域・左手・ペダルはこのアプリで決めたもので、楽譜そのものではありません）', '(the figure and fingering 1-2-4-5 follow the PTNA Piano Encyclopedia (in Japanese), the tempo is the composer\'s marking. The range, left hand and pedal were chosen by this app; this is not the actual score)') };
}
// このアプリで作った超絶技巧の練習曲: 半音階（32分音符）→ 両手の分散和音（反行）→ オクターブ → 跳躍（ストライド）→ 終わりの和音
function bravura() {
  const R = [], Lh = [], ped = [];
  let b = 0;
  // 1) 半音階 2オクターブ上がって下がる（右手 ド4〜ド6、左手は2オクターブ下で同じ向き）
  const chrom = []; for (let m = 60; m <= 84; m++) chrom.push(m); for (let m = 83; m >= 60; m--) chrom.push(m);
  for (const m of chrom) { R.push(midiName(m) + '/.125'); Lh.push(midiName(m - 24) + '/.125'); }
  b += chrom.length * 0.125;
  const gap = () => { R.push('r/.5'); Lh.push('r/.5'); b += 0.5; }; // 部分と部分のあいだに 8 分休符（手を大きく動かす時間）
  gap();
  // 2) 分散和音（右手はド4から上へ、左手はミ3から下へ。16分音符。どちらも鍵盤の中＝ラ0〜ド8 におさめる）
  const ra = [60, 64, 67, 72, 76, 79, 84, 88], la = [52, 48, 43, 40, 36, 31, 28, 24];
  for (let i = 0; i < ra.length; i++) { R.push(midiName(ra[i]) + '/.25'); Lh.push(midiName(la[i]) + '/.25'); }
  ped.push([b, b + ra.length * 0.25 - 0.05]); b += ra.length * 0.25;
  gap();
  // 3) オクターブ（右手 1-5 でハ長調の音階を上へ。左手は低いオクターブの連打）
  const sc = [72, 74, 76, 77, 79, 81, 83, 84];
  for (const m of sc) { R.push(midiName(m) + '+' + midiName(m + 12) + '/.5'); Lh.push('C2+C3/.5'); }
  b += sc.length * 0.5;
  gap();
  // 4) 跳躍（ストライド）: 左手は低いバス音と真ん中の和音を4分音符で交互に（2オクターブ近く跳ぶ）、右手は高い音の旋律
  const bass = [36, 43, 41, 43], mel = [88, 86, 84, 83, 81, 83, 84, 86];
  for (let i = 0; i < 8; i++) {
    Lh.push(i % 2 ? 'C4+E4+G4/1' : midiName(bass[Math.floor(i / 2)]) + '/1');
    R.push(midiName(mel[i]) + '/1');
    if (i % 2 === 0) ped.push([b + i, b + i + 1.95]);
  }
  b += 8;
  // 5) 終わりの和音（両手で広く）
  R.push('C5+E5+G5+C6/2'); Lh.push('C2+G2+C3/2');
  ped.push([b, b + 2.2]);
  return { id: 'bravura', name: L('超絶技巧の練習曲（このアプリで作曲）', 'Virtuoso study (composed for this app)'), why: L('超絶技巧: 半音階・分散和音・オクターブ・跳躍', 'virtuoso: chromatic runs, broken chords, octaves, leaps'), bpm: 120,
    src: R.join(' '), srcL: Lh.join(' '), pedal: ped, note: L('（このアプリで作った練習用の曲です）', '(a practice piece made for this app)') };
}
SONGS.splice(2, 0, chopinLike(), bravura());
SONGS.push(hanon1(),
  scaleSong('C', 60, '12312345', '54321321'), scaleSong('G', 67, '12312345', '54321321'), scaleSong('D', 62, '12312345', '54321321'),
  scaleSong('A', 69, '12312345', '54321321'), scaleSong('E', 64, '12312345', '54321321'), scaleSong('B', 71, '12312345', '43214321'),
  scaleSong('F', 65, '12341234', '54321321'), scaleSong('B♭', 70, '41231234', '32143213'), scaleSong('E♭', 63, '31234123', '32143213'),
  scaleSong('A♭', 68, '34123123', '32143213'), scaleSong('D♭', 61, '23123412', '32143213'), scaleSong('F♯', 66, '23412312', '43213214'));

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 曲 → [{m, t0, t1, hand}]（秒）
// ペダル（音をのばすダンパーペダル）: 曲の pedal は [始まりの拍, 終わりの拍] の並び → 秒
function parsePedal(song) { const b = 60 / song.bpm; return (song.pedal || []).map(([a, c]) => [a * b, c * b]); }
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
      if (!mt) throw new Error(L('音名が読めない: ', 'Cannot read note name: ') + tok);
      const m = 12 * (+mt[3] + 1) + NOTE_BASE[mt[1]] + (mt[2] === '#' ? 1 : mt[2] === 'b' ? -1 : 0);
      out.push({ m, t0: t, t1: t + d * 0.95, hand }); // 少しだけ切って弾く（同じ鍵の連打で離す時間）
    }
    t += d;
  }
  return out;
}
