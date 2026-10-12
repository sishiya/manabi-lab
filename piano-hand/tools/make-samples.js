// サンプルの楽譜ファイル（samples/）を作る: node piano-hand/tools/make-samples.js
// 曲はどれも著作権の切れたもの。音の並びは js/songs.js と同じ（歓喜の歌は下に。左手の和音はこのアプリでつけたもの）。
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(dir, 'js/songs.js'), 'utf8').replace(/^'use strict';/m, '').replace(/^const /gm, 'var ');
const ctx = { L: ja => ja }; require('vm').runInNewContext(src, ctx);
const { SONGS, NOTE_BASE } = ctx;

// 「音名/拍」の文字列 → [{m, beat0, beats}]（休みは除く）
function beats(line) {
  const out = []; let b = 0;
  for (const tok of line.trim().split(/\s+/)) {
    const [nm, ds] = tok.split('/'), d = ds ? parseFloat(ds) : 1;
    if (nm !== 'r') {
      const mt = /^([A-G])([#b]?)(-?\d)$/.exec(nm);
      out.push({ m: 12 * (+mt[3] + 1) + NOTE_BASE[mt[1]] + (mt[2] === '#' ? 1 : mt[2] === 'b' ? -1 : 0), b0: b, d, name: nm });
    }
    b += d;
  }
  return out;
}

// ---- MIDI を書く（形式1、四分音符 = 480） ----
const PPQ = 480;
function vlq(n) { const a = [n & 0x7f]; while ((n >>= 7)) a.unshift((n & 0x7f) | 0x80); return a; }
function track(events, name) { // events: [{tick, bytes}]
  events.sort((a, b) => a.tick - b.tick || a.ord - b.ord);
  const out = [];
  if (name) { const nb = Buffer.from(name, 'utf8'); out.push(0, 0xff, 0x03, ...vlq(nb.length), ...nb); }
  let last = 0;
  for (const e of events) { out.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  out.push(0, 0xff, 0x2f, 0);
  const h = Buffer.alloc(8); h.write('MTrk'); h.writeUInt32BE(out.length, 4);
  return Buffer.concat([h, Buffer.from(out)]);
}
function noteEvents(ns, ch, gate) {
  const ev = [];
  for (const n of ns) {
    const a = Math.round(n.b0 * PPQ), b = Math.round((n.b0 + n.d * (gate || 0.95)) * PPQ);
    ev.push({ tick: a, ord: 1, bytes: [0x90 | ch, n.m, 80] }, { tick: b, ord: 0, bytes: [0x80 | ch, n.m, 0] });
  }
  return ev;
}
function midi(bpm, tracks) {
  const us = Math.round(60e6 / bpm);
  const tempo = track([{ tick: 0, ord: 0, bytes: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] }], 'tempo');
  const h = Buffer.alloc(14); h.write('MThd'); h.writeUInt32BE(6, 4); h.writeUInt16BE(1, 8); h.writeUInt16BE(tracks.length + 1, 10); h.writeUInt16BE(PPQ, 12);
  return Buffer.concat([h, tempo, ...tracks]);
}

// 1) エリーゼのために 冒頭（右手・左手を別のトラック）
const elise = SONGS.find(s => s.id === 'elise2');
const pedEv = [];
for (const [a, c] of elise.pedal || []) pedEv.push({ tick: Math.round(a * PPQ), ord: 0, bytes: [0xb1, 64, 127] }, { tick: Math.round(c * PPQ), ord: 0, bytes: [0xb1, 64, 0] });
fs.writeFileSync(path.join(dir, 'samples/elise-opening.mid'), midi(elise.bpm, [
  track(noteEvents(beats(elise.src), 0), 'Right hand'), track(noteEvents(beats(elise.srcL), 1).concat(pedEv), 'Left hand')]));

// 2) 歓喜の歌＋左手の和音（トラック1つ。和音と、高さで手を分けるのを試す）
// 2026-10-12: 歓喜の歌は曲の一覧から外した（運指の出どころが非営利だけ可のため）。音の並びはここに残す（ベートーヴェン、著作権切れ）
const ode = { bpm: 116, src: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4/1.5 D4/.5 D4/2 ' +
  'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4/1.5 C4/.5 C4/2' };
const chords = [];
const prog = ['C', 'C', 'G', 'C', 'C', 'C', 'G', 'C'];
const CH = { C: [48, 52, 55], G: [43, 47, 50] };
prog.forEach((c, i) => CH[c].forEach(m => chords.push({ m, b0: i * 4, d: 4 })));
fs.writeFileSync(path.join(dir, 'samples/ode-to-joy-with-chords.mid'), midi(ode.bpm, [track(noteEvents(beats(ode.src), 0).concat(noteEvents(chords, 0, 0.98)), 'Piano')]));

// 3) ハ長調の音階（MusicXML、2段の譜表、教本の運指つき）
const sc = SONGS.find(s => s.id === 'scale2');
const DIV = 2; // 八分音符 = 1
function xmlNotes(ns, staff, fingers) {
  return ns.map((n, i) => {
    const step = n.name[0], alter = n.name.includes('#') ? 1 : 0, oct = n.name.replace(/[^0-9-]/g, '');
    const dur = Math.round(n.d * DIV), type = dur === 1 ? 'eighth' : 'quarter';
    return `      <note><pitch><step>${step}</step>${alter ? '<alter>1</alter>' : ''}<octave>${oct}</octave></pitch><duration>${dur}</duration><voice>${staff}</voice><type>${type}</type><staff>${staff}</staff>` +
      `<notations><technical><fingering>${fingers[i]}</fingering></technical></notations></note>`;
  });
}
const R = beats(sc.src), L = beats(sc.srcL);
// 4分の4拍子の小節に分ける（八分音符 8 つ = 1 小節）
function measures(ns) { const ms = []; for (const n of ns) { const k = Math.floor(n.b0 / 4); (ms[k] = ms[k] || []).push(n); } return ms; }
const mR = measures(R), mL = measures(L);
const fR = sc.refR.split(''), fL = sc.refL.split('');
let iR = 0, iL = 0, body = '';
for (let k = 0; k < mR.length; k++) {
  const r = mR[k] || [], l = mL[k] || [];
  const durR = r.reduce((s, n) => s + n.d, 0) * DIV, durL = l.reduce((s, n) => s + n.d, 0) * DIV;
  body += `    <measure number="${k + 1}">\n`;
  if (k === 0) body += `      <attributes><divisions>${DIV}</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>\n` +
    `      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${sc.bpm}</per-minute></metronome></direction-type><sound tempo="${sc.bpm}"/></direction>\n`;
  body += xmlNotes(r, 1, fR.slice(iR, iR + r.length)).join('\n') + '\n'; iR += r.length;
  body += `      <backup><duration>${durR}</duration></backup>\n`;
  body += xmlNotes(l, 2, fL.slice(iL, iL + l.length)).join('\n') + '\n'; iL += l.length;
  if (durL < durR) body += `      <forward><duration>${durR - durL}</duration></forward>\n`;
  body += `    </measure>\n`;
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>C major scale, 2 octaves, hands together (with fingering)</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
${body}  </part>
</score-partwise>
`;
fs.writeFileSync(path.join(dir, 'samples/c-major-scale-fingered.musicxml'), xml);
console.log('samples written:', fs.readdirSync(path.join(dir, 'samples')).join(', '));
