// 楽譜の読みこみ: MIDI（.mid）と MusicXML（.musicxml / .xml / 圧縮した .mxl）→ 曲 { name, notes:[{m, t0, t1, hand, given?}] }
// 右手と左手: MusicXML は譜表（staff 1 = 右手、2 = 左手）。MIDI は音のあるトラックが2つ以上なら平均の高さで、1つなら高さで分ける。
// 和音（片手で同時に押す音）はまだ弾けないので、右手はいちばん上、左手はいちばん下の音だけを弾き、ほかは hand:'X'（音だけ）にする。
'use strict';

// ---- MIDI（Standard MIDI File） ----
function parseMidi(buf) {
  const d = new DataView(buf);
  let p = 0;
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i)); p += n; return s; };
  const u32 = () => { const v = d.getUint32(p); p += 4; return v; }, u16 = () => { const v = d.getUint16(p); p += 2; return v; };
  const vlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  if (str(4) !== 'MThd') throw new Error(L('MIDI ファイルではありません', 'This is not a MIDI file'));
  const hl = u32(); u16(); const ntr = u16(), div = u16(); p += hl - 6;
  if (div & 0x8000) throw new Error(L('SMPTE の時間の MIDI には未対応です', 'MIDI files with SMPTE timing are not supported'));
  const tempos = [{ tick: 0, us: 500000 }], tracks = [];
  for (let k = 0; k < ntr && p < d.byteLength; k++) {
    if (str(4) !== 'MTrk') break;
    const len = u32(), end = p + len;
    let tick = 0, run = 0, name = '';
    const on = {}, notes = [], ped = []; // ped: ペダル（コントロールチェンジ 64 番）の [刻み, 踏んだか]
    while (p < end) {
      tick += vlq();
      let st = d.getUint8(p);
      if (st & 0x80) p++; else st = run;
      if (st === 0xff) {
        const type = d.getUint8(p++), l = vlq();
        if (type === 0x51) tempos.push({ tick, us: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2) });
        if (type === 0x03) { const q = p; name = str(l); p = q; }
        p += l;
      } else if (st === 0xf0 || st === 0xf7) { p += vlq(); }
      else {
        run = st;
        const ty = st & 0xf0, ch = st & 0x0f;
        const a = d.getUint8(p++), b = (ty === 0xc0 || ty === 0xd0) ? 0 : d.getUint8(p++);
        const key = ch * 128 + a;
        if (ty === 0xb0 && a === 64) ped.push([tick, b >= 64]);
        if (ty === 0x90 && b > 0) { (on[key] = on[key] || []).push({ tick, vel: b }); }
        else if (ty === 0x80 || (ty === 0x90 && b === 0)) {
          const s = on[key] && on[key].shift();
          if (s) notes.push({ m: a, ch, a: s.tick, b: tick, vel: s.vel });
        }
      }
    }
    p = end;
    tracks.push({ name, notes, ped });
  }
  // 拍の刻み → 秒（テンポの変化をたどる）
  tempos.sort((x, y) => x.tick - y.tick);
  const sec = tick => {
    let t = 0, last = 0, us = 500000;
    for (const e of tempos) { if (e.tick > tick) break; t += (e.tick - last) * us / div / 1e6; last = e.tick; us = e.us; }
    return t + (tick - last) * us / div / 1e6;
  };
  for (const tr of tracks) for (const n of tr.notes) { n.t0 = sec(n.a); n.t1 = sec(n.b); }
  const first = tempos.filter(e => e.tick === 0).pop();
  const bpm = Math.round(60e6 / first.us);
  // ペダル: どのトラックでも、踏んでいる間をつなげて [秒, 秒] に
  const pev = [].concat(...tracks.map(t => t.ped)).sort((x, y) => x[0] - y[0]);
  const pedal = []; let down = null;
  for (const [tk, on] of pev) { if (on && down === null) down = sec(tk); else if (!on && down !== null) { pedal.push([down, sec(tk)]); down = null; } }
  if (down !== null) pedal.push([down, down + 4]);
  return { tracks: tracks.filter(t => t.notes.length), bpm, pedal };
}

function songFromMidi(buf, name) {
  const mid = parseMidi(buf);
  const notes = [];
  const trs = mid.tracks.filter(t => t.notes.some(n => n.ch !== 9)); // 打楽器のチャンネルは除く
  if (trs.length >= 2) {
    const avg = t => t.notes.reduce((s, n) => s + n.m, 0) / t.notes.length;
    const sorted = trs.slice().sort((a, b) => avg(b) - avg(a));
    sorted.forEach((t, i) => t.notes.forEach(n => n.ch !== 9 && notes.push({ m: n.m, t0: n.t0, t1: n.t1, vel: n.vel, hand: i === 0 ? 'R' : i === 1 ? 'L' : 'X' })));
  } else if (trs.length === 1) {
    for (const n of trs[0].notes) if (n.ch !== 9) notes.push({ m: n.m, t0: n.t0, t1: n.t1, vel: n.vel, hand: n.m >= 60 ? 'R' : 'L' });
  }
  return finishSong({ id: 'file:' + name, name, notes, pedalSec: mid.pedal, bpm: mid.bpm, note: trs.length >= 2 ? L('（トラックで右手・左手を分けた）', '(right and left hands split by track)') : L('（トラックが1つなので、ド4から上を右手にした）', '(only one track, so notes from C4 up go to the right hand)') });
}

// ---- MusicXML ----
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 強弱記号 → MIDI の強さ（velocity）。MuseScore の既定値を目安に（v028〜）
const DYN_VEL = { pppp: 8, ppp: 16, pp: 33, p: 49, mp: 64, mf: 80, f: 96, ff: 112, fff: 126, ffff: 127, sf: 112, sfz: 112, fz: 112, sffz: 120, fp: 96, rf: 104, rfz: 104 };
function songFromMusicXml(text, name) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error(L('MusicXML を読めませんでした', 'Could not read the MusicXML'));
  const part = doc.querySelector('part');
  if (!part) throw new Error(L('パート（part）がありません（score-timewise は未対応）', 'No part found (score-timewise is not supported)'));
  const title = (doc.querySelector('work-title') || doc.querySelector('movement-title') || {}).textContent;
  let divs = 1, tempo = 0, pos = 0, lastStart = 0, vel = 80; // vel: いまの強さ（強弱記号や <sound dynamics> で変わる）
  const notes = [], ties = {}, pedEv = [];
  const tempos = []; // [div の位置, bpm]
  for (const meas of part.querySelectorAll(':scope > measure')) {
    for (const el of meas.children) {
      const tag = el.tagName;
      if (tag === 'attributes') { const dv = el.querySelector('divisions'); if (dv) divs = +dv.textContent; }
      if (tag === 'direction' || tag === 'sound') { // ペダル: <pedal type="start|stop|change"> と <sound damper-pedal="yes|no">
        const pe = tag === 'direction' ? el.querySelector('direction-type > pedal') : null, sd = tag === 'sound' ? el : el.querySelector('sound');
        const q = (pos + (el.querySelector('offset') ? +el.querySelector('offset').textContent : 0)) / divs;
        if (pe) { const ty = pe.getAttribute('type'); if (ty === 'start' || ty === 'resume') pedEv.push([q, 1]); else if (ty === 'stop' || ty === 'discontinue') pedEv.push([q, 0]); else if (ty === 'change') { pedEv.push([q, 0]); pedEv.push([q + 1e-3, 1]); } }
        else if (sd && sd.getAttribute('damper-pedal')) pedEv.push([q, sd.getAttribute('damper-pedal') === 'no' ? 0 : 1]);
      }
      if (tag === 'direction' || tag === 'sound') {
        // 強弱: <sound dynamics="…">（MusicXML では forte = MIDI 90 に対する %）か、<dynamics> の記号
        const sd2 = tag === 'sound' ? el : el.querySelector('sound'), dy = tag === 'direction' ? el.querySelector('direction-type > dynamics') : null;
        if (sd2 && sd2.getAttribute('dynamics')) vel = Math.max(1, Math.min(127, Math.round(+sd2.getAttribute('dynamics') * 0.9)));
        else if (dy && dy.firstElementChild && DYN_VEL[dy.firstElementChild.tagName] !== undefined) vel = DYN_VEL[dy.firstElementChild.tagName];
      }
      if (tag === 'direction' || tag === 'sound') {
        const snd = tag === 'sound' ? el : el.querySelector('sound');
        const pm = el.querySelector('per-minute');
        const bpm = snd && snd.getAttribute('tempo') ? +snd.getAttribute('tempo') : pm ? +pm.textContent : 0;
        if (bpm > 0) { tempos.push([pos / divs, bpm]); if (!tempo) tempo = bpm; }
      }
      else if (tag === 'backup') pos -= +el.querySelector('duration').textContent;
      else if (tag === 'forward') pos += +el.querySelector('duration').textContent;
      else if (tag === 'note') {
        const durEl = el.querySelector('duration'), dur = durEl ? +durEl.textContent : 0;
        const chord = !!el.querySelector('chord');
        const start = chord ? lastStart : pos;
        if (!chord) { lastStart = pos; pos += dur; }
        if (el.querySelector('rest') || !el.querySelector('pitch') || el.querySelector('grace')) continue;
        const pe = el.querySelector('pitch');
        const m = 12 * (+pe.querySelector('octave').textContent + 1) + STEP[pe.querySelector('step').textContent] + (pe.querySelector('alter') ? Math.round(+pe.querySelector('alter').textContent) : 0);
        const staff = el.querySelector('staff') ? +el.querySelector('staff').textContent : 1;
        const fg = el.querySelector('technical > fingering');
        const tieS = [...el.querySelectorAll('tie')].map(t => t.getAttribute('type'));
        const key = staff + ':' + m;
        if (tieS.includes('stop') && ties[key]) { // つながった音はのばす
          ties[key].b = start + dur;
          if (!tieS.includes('start')) delete ties[key];
          continue;
        }
        const nd = el.getAttribute('dynamics'); // 音符ごとの強さ（あれば）
        const n = { m, a: start / divs, b: (start + dur) / divs, hand: staff >= 2 ? 'L' : 'R', vel: nd ? Math.max(1, Math.min(127, Math.round(+nd * 0.9))) : vel };
        if (fg && /^[1-5]/.test(fg.textContent.trim())) n.given = +fg.textContent.trim()[0];
        notes.push(n);
        if (tieS.includes('start')) ties[key] = n;
      }
    }
  }
  // 四分音符の数 → 秒（テンポの変化をたどる）
  if (!tempos.length) tempos.push([0, 100]);
  tempos.sort((x, y) => x[0] - y[0]);
  const sec = q => {
    let t = 0, last = 0, bpm = tempos[0][1];
    for (const [at, b] of tempos) { if (at > q) break; t += (at - last) * 60 / bpm; last = at; bpm = b; }
    return t + (q - last) * 60 / bpm;
  };
  for (const n of notes) { n.t0 = sec(n.a); n.t1 = sec(n.b); delete n.a; delete n.b; }
  const pedalSec = []; let pdown = null;
  for (const [q, on] of pedEv.sort((x, y) => x[0] - y[0])) { if (on && pdown === null) pdown = sec(q); else if (!on && pdown !== null) { pedalSec.push([pdown, sec(q) - 0.02]); pdown = null; } }
  if (pdown !== null) pedalSec.push([pdown, pdown + 4]);
  const hasF = notes.some(n => n.given);
  return finishSong({ id: 'file:' + name, name: title ? title + L('（' + name + '）', ' (' + name + ')') : name, notes, pedalSec, bpm: tempo || 100, note: hasF ? L('（楽譜の運指あり）', '(with fingering in the score)') : '' });
}

// ---- .mxl（zip に入った MusicXML） ----
async function unzipMxl(buf) {
  const d = new DataView(buf), u8 = new Uint8Array(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && d.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error(L('zip ではありません', 'This is not a zip file'));
  const cnt = d.getUint16(e + 10, true);
  let p = d.getUint32(e + 16, true);
  const files = {};
  for (let i = 0; i < cnt; i++) {
    const method = d.getUint16(p + 10, true), csize = d.getUint32(p + 20, true);
    const nl = d.getUint16(p + 28, true), el = d.getUint16(p + 30, true), cl = d.getUint16(p + 32, true), off = d.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    files[name] = { method, csize, off };
    p += 46 + nl + el + cl;
  }
  const read = async name => {
    const f = files[name];
    if (!f) throw new Error(L('zip の中に ' + name + ' がありません', name + ' is missing from the zip'));
    const lh = f.off, start = lh + 30 + d.getUint16(lh + 26, true) + d.getUint16(lh + 28, true);
    const raw = u8.subarray(start, start + f.csize);
    if (f.method === 0) return new TextDecoder().decode(raw);
    if (typeof DecompressionStream === 'undefined') throw new Error(L('このブラウザは .mxl を開けません（.musicxml にしてください）', 'This browser cannot open .mxl (please use .musicxml)'));
    const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(ds).text();
  };
  const cont = await read('META-INF/container.xml');
  const root = /full-path="([^"]+)"/.exec(cont);
  return read(root ? root[1] : Object.keys(files).find(n => /\.(xml|musicxml)$/.test(n) && !n.startsWith('META-INF')));
}

// 片手で同時に押す音（和音）は5つまで。同じ鍵の重なりは1つに。多すぎる分は hand:'X'（音と灰色のノーツだけ）
// （届かない和音の外し方は fingering.js の planChords）
function finishSong(song) {
  let ns = song.notes.filter(n => n.t1 > n.t0).sort((a, b) => a.t0 - b.t0 || a.m - b.m);
  ns = ns.filter((n, i) => !ns.some((o, j) => j < i && o.m === n.m && o.hand === n.hand && Math.abs(o.t0 - n.t0) < 0.03));
  let reduced = 0;
  for (const h of ['R', 'L']) {
    const hn = ns.filter(n => n.hand === h);
    for (let i = 0; i < hn.length; i++) {
      const grp = [hn[i]];
      while (i + 1 < hn.length && hn[i + 1].t0 - hn[i].t0 < 0.03) grp.push(hn[++i]);
      if (grp.length <= 5) continue;
      const keep = h === 'R' ? grp.slice(-5) : grp.slice(0, 5);
      for (const n of grp) if (!keep.includes(n)) { n.hand = 'X'; reduced++; }
    }
  }
  const t0 = ns.length ? ns[0].t0 : 0;
  for (const n of ns) { n.t0 -= t0; n.t1 -= t0; }
  if (song.pedalSec) song.pedalSec = song.pedalSec.map(([a, c]) => [a - t0, c - t0]).filter(([, c]) => c > 0);
  song.notes = ns;
  if (reduced) song.note = (song.note || '') + L('（片手で6音以上の和音の ' + reduced + ' 音は弾かずに灰色で表示）', ' (' + reduced + ' notes of chords with 6 or more notes in one hand are not played and shown in gray)');
  return song;
}

async function songFromFile(file) {
  const name = file.name, low = name.toLowerCase();
  if (/\.(mid|midi)$/.test(low)) return songFromMidi(await file.arrayBuffer(), name);
  if (low.endsWith('.mxl')) return songFromMusicXml(await unzipMxl(await file.arrayBuffer()), name);
  if (/\.(musicxml|xml)$/.test(low)) return songFromMusicXml(await file.text(), name);
  throw new Error(L('.mid・.musicxml・.xml・.mxl のどれかを選んでください', 'Please choose a .mid, .musicxml, .xml or .mxl file'));
}
