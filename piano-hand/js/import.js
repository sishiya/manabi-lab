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
  if (str(4) !== 'MThd') throw new Error('MIDI ファイルではありません');
  const hl = u32(); u16(); const ntr = u16(), div = u16(); p += hl - 6;
  if (div & 0x8000) throw new Error('SMPTE の時間の MIDI には未対応です');
  const tempos = [{ tick: 0, us: 500000 }], tracks = [];
  for (let k = 0; k < ntr && p < d.byteLength; k++) {
    if (str(4) !== 'MTrk') break;
    const len = u32(), end = p + len;
    let tick = 0, run = 0, name = '';
    const on = {}, notes = [];
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
        if (ty === 0x90 && b > 0) { (on[key] = on[key] || []).push({ tick, vel: b }); }
        else if (ty === 0x80 || (ty === 0x90 && b === 0)) {
          const s = on[key] && on[key].shift();
          if (s) notes.push({ m: a, ch, a: s.tick, b: tick, vel: s.vel });
        }
      }
    }
    p = end;
    tracks.push({ name, notes });
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
  return { tracks: tracks.filter(t => t.notes.length), bpm };
}

function songFromMidi(buf, name) {
  const mid = parseMidi(buf);
  const notes = [];
  const trs = mid.tracks.filter(t => t.notes.some(n => n.ch !== 9)); // 打楽器のチャンネルは除く
  if (trs.length >= 2) {
    const avg = t => t.notes.reduce((s, n) => s + n.m, 0) / t.notes.length;
    const sorted = trs.slice().sort((a, b) => avg(b) - avg(a));
    sorted.forEach((t, i) => t.notes.forEach(n => n.ch !== 9 && notes.push({ m: n.m, t0: n.t0, t1: n.t1, hand: i === 0 ? 'R' : i === 1 ? 'L' : 'X' })));
  } else if (trs.length === 1) {
    for (const n of trs[0].notes) if (n.ch !== 9) notes.push({ m: n.m, t0: n.t0, t1: n.t1, hand: n.m >= 60 ? 'R' : 'L' });
  }
  return finishSong({ id: 'file:' + name, name, notes, bpm: mid.bpm, note: trs.length >= 2 ? '（トラックで右手・左手を分けた）' : '（トラックが1つなので、ド4から上を右手にした）' });
}

// ---- MusicXML ----
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function songFromMusicXml(text, name) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('MusicXML を読めませんでした');
  const part = doc.querySelector('part');
  if (!part) throw new Error('パート（part）がありません（score-timewise は未対応）');
  const title = (doc.querySelector('work-title') || doc.querySelector('movement-title') || {}).textContent;
  let divs = 1, tempo = 0, pos = 0, lastStart = 0;
  const notes = [], ties = {};
  const tempos = []; // [div の位置, bpm]
  for (const meas of part.querySelectorAll(':scope > measure')) {
    for (const el of meas.children) {
      const tag = el.tagName;
      if (tag === 'attributes') { const dv = el.querySelector('divisions'); if (dv) divs = +dv.textContent; }
      else if (tag === 'direction' || tag === 'sound') {
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
        const n = { m, a: start / divs, b: (start + dur) / divs, hand: staff >= 2 ? 'L' : 'R' };
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
  const hasF = notes.some(n => n.given);
  return finishSong({ id: 'file:' + name, name: title ? title + '（' + name + '）' : name, notes, bpm: tempo || 100, note: hasF ? '（楽譜の運指あり）' : '' });
}

// ---- .mxl（zip に入った MusicXML） ----
async function unzipMxl(buf) {
  const d = new DataView(buf), u8 = new Uint8Array(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && d.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('zip ではありません');
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
    if (!f) throw new Error('zip の中に ' + name + ' がありません');
    const lh = f.off, start = lh + 30 + d.getUint16(lh + 26, true) + d.getUint16(lh + 28, true);
    const raw = u8.subarray(start, start + f.csize);
    if (f.method === 0) return new TextDecoder().decode(raw);
    if (typeof DecompressionStream === 'undefined') throw new Error('このブラウザは .mxl を開けません（.musicxml にしてください）');
    const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(ds).text();
  };
  const cont = await read('META-INF/container.xml');
  const root = /full-path="([^"]+)"/.exec(cont);
  return read(root ? root[1] : Object.keys(files).find(n => /\.(xml|musicxml)$/.test(n) && !n.startsWith('META-INF')));
}

// 片手の和音を1音にへらす（右手は上、左手は下）。へらした音は hand:'X'（音と灰色のノーツだけ）
function finishSong(song) {
  const ns = song.notes.filter(n => n.t1 > n.t0).sort((a, b) => a.t0 - b.t0 || a.m - b.m);
  let reduced = 0;
  for (const h of ['R', 'L']) {
    const hn = ns.filter(n => n.hand === h);
    for (let i = 0; i < hn.length; i++) {
      const grp = [hn[i]];
      while (i + 1 < hn.length && hn[i + 1].t0 - hn[i].t0 < 0.03) grp.push(hn[++i]);
      if (grp.length < 2) continue;
      const keep = h === 'R' ? grp[grp.length - 1] : grp[0];
      for (const n of grp) if (n !== keep) { n.hand = 'X'; reduced++; }
    }
    // 前の音をのばしたまま次を弾く（重なる）ときは、前の音を次の手前で切る（いまは1音ずつしか押せない）
    const kept = ns.filter(n => n.hand === h);
    for (let i = 0; i + 1 < kept.length; i++) if (kept[i].t1 > kept[i + 1].t0 - 0.02) kept[i].t1 = Math.max(kept[i].t0 + 0.04, kept[i + 1].t0 - 0.02);
  }
  const t0 = ns.length ? ns[0].t0 : 0;
  for (const n of ns) { n.t0 -= t0; n.t1 -= t0; }
  song.notes = ns;
  if (reduced) song.note = (song.note || '') + '（和音の ' + reduced + ' 音は弾かずに灰色で表示）';
  return song;
}

async function songFromFile(file) {
  const name = file.name, low = name.toLowerCase();
  if (/\.(mid|midi)$/.test(low)) return songFromMidi(await file.arrayBuffer(), name);
  if (low.endsWith('.mxl')) return songFromMusicXml(await unzipMxl(await file.arrayBuffer()), name);
  if (/\.(musicxml|xml)$/.test(low)) return songFromMusicXml(await file.text(), name);
  throw new Error('.mid・.musicxml・.xml・.mxl のどれかを選んでください');
}
