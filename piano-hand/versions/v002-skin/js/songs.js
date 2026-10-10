// 検証用の曲（右手・単音）。どれも著作権の切れた曲。「音名/拍」を空白で区切る。r は休み。
'use strict';
const SONGS = [
  { id: 'scale', name: 'ハ長調の音階（2オクターブ）', why: '親指くぐり・指またぎ', bpm: 92,
    src: 'C4/.5 D4/.5 E4/.5 F4/.5 G4/.5 A4/.5 B4/.5 C5/.5 D5/.5 E5/.5 F5/.5 G5/.5 A5/.5 B5/.5 C6/1 ' +
         'B5/.5 A5/.5 G5/.5 F5/.5 E5/.5 D5/.5 C5/.5 B4/.5 A4/.5 G4/.5 F4/.5 E4/.5 D4/.5 C4/1' },
  { id: 'dmaj', name: 'ニ長調の音階', why: '黒鍵（ファ♯・ド♯）', bpm: 92,
    src: 'D4/.5 E4/.5 F#4/.5 G4/.5 A4/.5 B4/.5 C#5/.5 D5/1 C#5/.5 B4/.5 A4/.5 G4/.5 F#4/.5 E4/.5 D4/1' },
  { id: 'arp', name: 'ハ長調のアルペジオ', why: '大きな指またぎ', bpm: 76,
    src: 'C4/.5 E4/.5 G4/.5 C5/.5 E5/.5 G5/.5 C6/1 G5/.5 E5/.5 C5/.5 G4/.5 E4/.5 C4/1' },
  { id: 'twinkle', name: 'きらきら星', why: '同じ音の連打・5本の指の位置', bpm: 100,
    src: 'C4 C4 G4 G4 A4 A4 G4/2 F4 F4 E4 E4 D4 D4 C4/2 G4 G4 F4 F4 E4 E4 D4/2 G4 G4 F4 F4 E4 E4 D4/2 ' +
         'C4 C4 G4 G4 A4 A4 G4/2 F4 F4 E4 E4 D4 D4 C4/2' },
  { id: 'ode', name: '歓喜の歌（ベートーヴェン）', why: '手の位置がほとんど動かない', bpm: 116,
    src: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4/1.5 D4/.5 D4/2 ' +
         'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4/1.5 C4/.5 C4/2' },
  { id: 'elise', name: 'エリーゼのために 冒頭（右手を簡略）', why: '速い往復・黒鍵・跳躍', bpm: 66,
    src: 'E5/.25 D#5/.25 E5/.25 D#5/.25 E5/.25 B4/.25 D5/.25 C5/.25 A4/.5 r/.25 C4/.25 E4/.25 A4/.25 B4/.5 r/.25 ' +
         'E4/.25 G#4/.25 B4/.25 C5/.5 r/.25 E4/.25 E5/.25 D#5/.25 E5/.25 D#5/.25 E5/.25 B4/.25 D5/.25 C5/.25 A4/.5 r/.25 ' +
         'C4/.25 E4/.25 A4/.25 B4/.5 r/.25 E4/.25 C5/.25 B4/.25 A4/1' },
];

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 曲の文字列 → [{m, t0, t1}]（秒）
function parseSong(song) {
  const beat = 60 / song.bpm, out = [];
  let t = 0;
  for (const tok of song.src.trim().split(/\s+/)) {
    const [nm, ds] = tok.split('/');
    const d = (ds ? parseFloat(ds) : 1) * beat;
    if (nm !== 'r') {
      const mt = /^([A-G])([#b]?)(-?\d)$/.exec(nm);
      if (!mt) throw new Error('音名が読めない: ' + tok);
      const m = 12 * (+mt[3] + 1) + NOTE_BASE[mt[1]] + (mt[2] === '#' ? 1 : mt[2] === 'b' ? -1 : 0);
      out.push({ m, t0: t, t1: t + d * 0.95 }); // 少しだけ切って弾く（同じ鍵の連打で離す時間）
    }
    t += d;
  }
  return out;
}
